// The KEYFRAME agent graph — LangGraph orchestration of the 12 agents.
//
//   INTAKE GRAPH      brief → script  (pauses at script_review via the API)
//
//   PRODUCTION GRAPH                  ┌─ storyboard ── scene_planner ─┐
//     frame_selector ── fan-out ──────┼─ asset_planner ─ asset_search ┼── composition ── animation ─┐
//                                     └─ voice ───────────────────────┘                             │
//                                                  ┌──────────────────────────────────── timeline ──┘
//                                                  └→ qa ──(blockers & repairs left)→ composition (one repair lap)
//                                                       └──(pass / out of repairs)──→ END
//
// Every node is a thin agent wrapping the battle-tested service functions —
// the graph owns ordering, joins, and the QA repair loop; the services own
// the work. JSON state flows between nodes; HyperFrames renders the MP4.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const db = require("../db");
const { UsageTracker } = require("../services/usage");
const { generateBrief } = require("../services/brief");
const { generateScript, normalizeScript } = require("../services/script");
const { generateStoryboard } = require("../services/storyboard");
const frameRegistry = require("../services/frame_registry");
const { withBudget, attemptLlmComposition, composeWithThree, isAssetRich, mixAudioIntoVideo, fallbackQueriesFor, retimeScenesToVo, contrastFixPass } = require("../services/pipeline");
const { assembleQualityReport } = require("../services/quality_report");
const { acquire, hasProviderFor, makeImageDeduper } = require("../services/asset_sources");
const { styleFor, iconColorFor } = require("../services/pack_style");
const { synthesizeFitted } = require("../services/vo_fit");
const { buildCues, writeSrt } = require("../services/captions");
const { fetchMusic } = require("../services/audio_sources");
const { getSfx } = require("../services/sfx_library");
const { VALID_VOICES } = require("../services/audio_planner");
const { buildFallback } = require("../services/fallback");
const { normalizeComposition } = require("../services/normalize");
const { render } = require("../services/renderer");
const { reviewRender } = require("./qa_agent");
const { checkAssetsRelevance } = require("../services/asset_vision");
const { reviewAndCurate } = require("../services/creative_director");
const { directAssets } = require("../services/asset_director");
const { captureTopicShots, mergeShots } = require("../services/screenshot_director");
const { captureTopicSiteShots } = require("../services/topic_shots");
const { qaGateScreenshots } = require("../services/screenshot_qa");
const { blogImageAssets } = require("../services/blog_assets");
const { websiteImageAssets, websiteLogoAsset } = require("../services/website_assets");
const { directBrand } = require("../services/art_director");
const { directLayout } = require("../services/visual_layout_director");
const { directText } = require("../services/text_director");

function ms() { return Date.now(); }
function jobDirFor(jobId) { return path.join(config.paths.jobsDir, jobId); }

// ---------------------------------------------------------------- helpers
function storyboardPromptFromScript(script, brief) {
  const lines = [
    `Produce this exact video: "${script.title}".`,
    brief ? `Context: ${brief.improvedPrompt}` : "",
    "",
    "Scene-by-scene plan (FOLLOW these timings and contents exactly — same number of scenes, same start/duration):",
  ];
  for (const s of script.scenes) {
    lines.push(
      `- Scene ${s.id} [${s.start}s + ${s.duration}s] (${s.purpose}): ${s.visualDirection} ` +
      (s.onScreenText.length ? `On-screen text: ${s.onScreenText.map((t) => `"${t}"`).join(", ")}. ` : "") +
      (s.voiceover ? `Narration meanwhile: "${s.voiceover}"` : "No narration.")
    );
  }
  return lines.join("\n");
}

// The voices the gpt-audio TTS family actually renders (tts.js AUDIO_VOICES).
// pickVoice MUST resolve to one of these — emitting a tts-1-era voice
// (fable/nova/onyx) would be silently downgraded to marin by tts.mapVoice().
const AUDIO_VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"]);

function pickVoice(job, script) {
  // 1) An explicit, exact voice name wins.
  const explicit = String(job.voice_style || "").trim().toLowerCase();
  if (AUDIO_VOICES.has(explicit)) return explicit;

  // 2) Map gender/tone cues from the script's voice style to a real voice
  //    (the old code substring-matched the wrong tts-1 set and always fell to
  //    marin — no gender fit, no variety).
  const want = `${job.voice_style || ""} ${script?.voice?.style || ""} ${script?.voice?.pace || ""}`.toLowerCase();
  const has = (...ks) => ks.some((k) => want.includes(k));
  // Gender cues MUST match on word boundaries — substring includes("man")/
  // includes("he ") fired inside "human"/"performance"/"the ", forcing neutral
  // and female-leaning brands onto a male voice before the tone branches ran.
  const FEM  = /\b(female|woman|feminine|she|her|hers)\b/.test(want);
  const MASC = /\b(male|man|masculine|he|him|his)\b/.test(want);
  if (FEM)  return has("warm", "soft", "calm", "gentle") ? "sage" : "coral";
  if (MASC) return has("deep", "authoritative", "bold", "gravitas") ? "cedar" : "ash";
  if (has("energetic", "upbeat", "excited", "punchy", "hype", "playful")) return "ballad";
  if (has("warm", "calm", "soothing", "gentle", "reassuring")) return "sage";
  if (has("elegant", "sophisticated", "premium", "refined", "luxury")) return "verse";
  if (has("bright", "friendly", "cheerful", "approachable")) return "shimmer";
  return "marin"; // a natural, neutral default
}

// ---------------------------------------------------------------- agents
// Each node receives the mutable graph state object and returns a partial
// state update. `s` carries: job, jobDir, tracker, script, brief, and the
// artifacts each agent adds.

async function frameSelectorAgent(s) {
  // Only an EXPLICIT, still-installed user pick is honored verbatim. "auto",
  // unset (null), and stale/removed ids are NOT explicit — they must defer to
  // the brief's tone-matched suggestion BEFORE the global default. The old code
  // ran resolvePack(job.frame_pack) first, but resolvePack(null|"auto") returns
  // the DEFAULT pack (non-null), so every auto video short-circuited to
  // blockframe and the brief's pick + anti-repeat rotation were dead code.
  const requested = s.job.frame_pack;
  const explicit = (requested && requested !== "auto")
    ? frameRegistry.resolvePack(requested)   // valid id → that pack; stale id → null
    : null;
  const framePack = explicit
    || frameRegistry.resolvePack(s.brief?.suggestedFramePack)
    || frameRegistry.resolvePack("auto");
  const via = explicit ? "user" : (frameRegistry.resolvePack(s.brief?.suggestedFramePack) ? "brief" : "default");
  console.log(`[agents] frame_selector → ${framePack} (${via})`);
  return { framePack };
}

async function storyboardAgent(s) {
  db.setProgress(s.job.id, "storyboard");
  const sbPrompt = storyboardPromptFromScript(s.script, s.brief);
  // framePack biases the storyboard's per-scene archetypes/motifs toward the
  // selected template (storyboard.js buildUser). frame_selector runs before this
  // node, so the pick is always resolved here — omitting it made the project
  // path's storyboards pack-blind while /api/generate's were pack-aware.
  const r = await generateStoryboard({ prompt: sbPrompt, duration: s.job.duration, orientation: s.job.orientation, framePack: s.framePack });
  s.tracker.addLlm({ inputTokens: r.tokensIn, outputTokens: r.tokensOut, stage: "storyboard", costUsd: r.costUsd });
  return { storyboard: r.storyboard };
}

// Scene Planner — guarantees every storyboard scene has executable beats.
// Deterministic: derives default beats from the script when the model
// omitted them (entrance at 0.1, content at 30%, exit 0.6s before handoff).
async function scenePlannerAgent(s) {
  const sb = s.storyboard;
  let derived = 0;
  for (const scene of sb.scenes || []) {
    if (!Array.isArray(scene.beats) || !scene.beats.length) {
      scene.beats = [
        { at: 0.1, action: "scene content enters", easing: "expo.out" },
        { at: Math.round(scene.duration * 0.3 * 100) / 100, action: "supporting content lands", easing: "power2.out" },
        { at: Math.max(0.2, scene.duration - 0.6), action: "exit begins / hand-off", easing: "power2.in" },
      ];
      derived++;
    }
  }
  if (derived) console.log(`[agents] scene_planner derived beats for ${derived} scene(s)`);
  return { storyboard: sb };
}

// Asset Planner — turns the approved script's needs into a concrete
// want-list (screenshots pinned first, stock wants after, caps applied).
async function assetPlannerAgent(s) {
  const { job, script } = s;
  const videoOk = hasProviderFor("video");
  const shots = (job.website_screenshots || []).filter((p) => { try { return fs.existsSync(p); } catch { return false; } });
  const showcase = script.scenes.filter((x) => ["feature", "proof", "how", "context"].includes(x.purpose));
  // Up to 8 scenes carry a pinned real screenshot (3 -> 5 -> 8; user: "collect as
  // much website or product screenshot you can, at least 6-7"). Ingest now grabs a
  // hero plus five deep sections and the director matches up to six internal
  // pages, so the pins have to be able to surface them — a smaller budget just
  // threw captured screenshots away.
  const targets = (showcase.length ? showcase : script.scenes.slice(1, -1)).slice(0, 8);
  const screenshotPlan = shots.slice(0, targets.length).map((src, i) => ({ kind: "screenshot", src, scene: targets[i], index: i }));
  const pinnedSceneIds = new Set(screenshotPlan.map((p) => p.scene.id));

  // Derive a concrete image query from a scene's visualDirection when the
  // script asked for nothing — substance scenes should never go imageless.
  const STOP = new Set(["the", "a", "an", "with", "and", "of", "in", "on", "over", "into", "across", "as", "to", "that", "then", "while", "for", "is", "are", "we", "see", "scene", "text", "headline", "screen"]);
  const deriveQuery = (scene) => {
    const words = String(scene.visualDirection || "").toLowerCase().match(/[a-z]{3,}/g) || [];
    const picked = words.filter((w) => !STOP.has(w)).slice(0, 4);
    return picked.length >= 2 ? picked.join(" ") : null;
  };

  const VECTOR_ROLES = new Set(["icon", "texture", "vector"]);
  const roleOf = (n) => String(n.role || "").toLowerCase();

  const wants = [];
  for (const scene of script.scenes) {
    const needs = [...(scene.assetNeeds || [])];
    // Gap-fill: EVERY scene with no asset request gets a derived one (hook/cta
    // included — dense visuals everywhere beats sparse pure-typography beats).
    if (!needs.length && !pinnedSceneIds.has(scene.id)) {
      const q = deriveQuery(scene);
      if (q) {
        needs.push({ type: "image", query: q, role: "background", derived: true });
        // EVERY gap-filled scene also pulls a photo inset (was alternate scenes
        // only) — density first; the planner caps below still bound the total.
        needs.push({ type: "image", query: q, role: "inset", derived: true });
      }
    }
    // VECTOR GAP-FILL — the curated 2k+ SVG library was effectively never tapped
    // because nothing ever requested an icon/vector role. Guarantee EVERY scene
    // pulls one on-brand vector/icon so the composer always has real graphic
    // material to layer (not just photos), satisfying the vector cadence mandate.
    if (!needs.some((n) => VECTOR_ROLES.has(roleOf(n)))) {
      const q = deriveQuery(scene) || (scene.assetNeeds && scene.assetNeeds[0] && scene.assetNeeds[0].query) || null;
      if (q) needs.push({ type: "image", query: q, role: "icon", derived: true });
    }
    for (const need of needs) {
      if (pinnedSceneIds.has(scene.id) && need.role === "background") continue;
      const type = need.type === "video" && !videoOk ? "image" : need.type;
      wants.push({ kind: "search", scene, need: { ...need, type } });
    }
  }
  // A need is a vector if its ROLE is icon/texture/vector OR its script TYPE is
  // "icon" (the script schema allows type:"icon" with any role; keying only off
  // role missed those and fetched explicitly-requested icons as photos).
  const isVectorNeed = (n) => VECTOR_ROLES.has(roleOf(n)) || n.type === "icon";
  const videos = wants.filter((w) => w.need.type === "video").slice(0, 2);
  // Caps SCALE WITH DURATION. A flat 16-photo cap starved long films — a 30-scene
  // 2.5-min video got ~0.5 photos/scene, so most scenes fell back to the repeated
  // synthetic prop-fill card. Budget ~1.2 photos/scene (clamped 8-40) so long
  // films are dense and short films don't over-fetch (which also trims the
  // per-asset vision cost). Vectors/icons stay a modest accent tier (~0.45/scene)
  // so they never dominate the photo mix (a prior run was half icons).
  const nScenes = (script.scenes && script.scenes.length) || 12;
  const photoCap  = Math.max(8, Math.min(40, Math.round(nScenes * 1.2)));
  const vectorCap = Math.max(5, Math.min(14, Math.round(nScenes * 0.45)));
  const vectors = wants.filter((w) => w.need.type !== "video" && isVectorNeed(w.need)).slice(0, vectorCap);
  const photos  = wants.filter((w) => w.need.type !== "video" && !isVectorNeed(w.need)).slice(0, photoCap - videos.length);
  console.log(`[agents] asset_planner: ${screenshotPlan.length} screenshot(s) + ${videos.length} video(s) + ${photos.length} photo(s) + ${vectors.length} vector(s) (${wants.filter((w) => w.need.derived).length} derived)`);
  return { assetPlan: { screenshots: screenshotPlan, searches: [...videos, ...photos, ...vectors] } };
}

// Asset Search — executes the plan: our database first, then providers.
// Stopwords for the topical anchor — drop the brand name and generic filler so
// the anchor is the SUBJECT (beauty, cosmetics), not "bulkdoor"/"marketplace".
const ANCHOR_STOP = new Set([
  "the", "and", "for", "with", "your", "our", "that", "this", "from", "into",
  "india", "indias", "best", "top", "leading", "number", "online", "platform",
  "marketplace", "website", "company", "brand", "brands", "business", "solution",
  "solutions", "service", "services", "app", "get", "now", "more", "all", "new",
  "buy", "shop", "store", "official", "home", "page", "welcome", "trusted",
  // film-language + filler adjectives that hijacked the anchor ("their cinematic"):
  "their", "they", "them", "every", "everyone", "each", "cinematic", "dramatic",
  "epic", "story", "storytelling", "film", "films", "video", "videos", "launch",
  "promo", "journey", "world", "experience", "discover", "transform", "moment",
  "moments", "ordinary", "extraordinary", "premium", "beautiful", "stunning",
  "slow", "motion", "fast", "modern", "future", "power", "powerful", "make",
  "makes", "making", "turn", "turns", "star", "hero", "feel", "feels", "life",
]);

// 1-2 SUBJECT words distilled from the brief/site, used to keep derived stock
// queries on-topic. Without this, abstract scene directions ("scalable growth")
// fetched wildly off-topic stock (trading charts, a car logo) because the query
// never carried what the video is actually about.
function topicAnchor(job, brief) {
  // The brief's grounded `subject` field is authoritative when present — it is
  // written to be literal and shootable ("golden retriever dog"). The frequency
  // heuristic below is only the fallback for older briefs, and it once produced
  // anchors like "their cinematic" before the stopword list grew.
  const subject = String(brief?.subject || "").toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim();
  if (subject) return subject.split(/\s+/).slice(0, 5).join(" ");
  const src = `${(brief?.keyMessages || []).join(" ")} ${brief?.audience || ""} ${brief?.goal || ""}`.toLowerCase();
  const freq = {};
  for (const w of src.match(/[a-z]{4,}/g) || []) {
    if (!ANCHOR_STOP.has(w)) freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0]).join(" ");
}

async function assetSearchAgent(s) {
  const { job, jobDir, tracker, assetPlan } = s;
  const anchor = topicAnchor(job, s.brief);
  if (anchor) console.log(`[agents] asset_search topic anchor: "${anchor}"`);
  // Pack-aware styling: photo queries get the pack's look, icons get its accent
  // color + matching Iconify collection family. Bridges to the Phase 3 manifest.
  const packStyle = styleFor(s.framePack);
  const packTokens = s.framePack ? frameRegistry.getPackTokens(s.framePack) : null;
  const iconColor = iconColorFor(packTokens);
  if (packStyle.photoMod) console.log(`[agents] asset_search pack style: "${packStyle.photoMod}" · icons=${packStyle.iconStyle}${iconColor ? ` (${iconColor})` : ""}`);
  db.setProgress(job.id, "assets");
  fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
  fs.mkdirSync(path.join(jobDir, "assets", "videos"), { recursive: true });

  const pinned = assetPlan.screenshots.map(({ src, scene, index }) => {
    const relPath = `assets/images/site_${index}.png`;
    fs.copyFileSync(src, path.join(jobDir, relPath));
    return {
      path: relPath, type: "image", sceneId: scene.id, startSec: scene.start, durationSec: scene.duration,
      style: "inset",
      alt: `REAL website screenshot of ${job.website_title || "the product"} (${index === 0 ? "homepage hero" : `page section ${index + 1}`}) — present in a styled browser frame with hero treatment`,
      license: "owner content", sourceUrl: job.intent?.websiteUrl || null, source: "website", fromCache: false,
    };
  });

  // Screenshot Director — topic-matched INTERNAL page captures (pricing scene ->
  // /pricing shot) via PeekShot, in parallel with the whole stock loop below.
  // Merged before the Creative Director review so topic shots get scored too.
  // A job WITH a website shoots that product's own internal pages. A job without
  // one (a plain topic prompt) used to get nothing at all — captureTopicShots
  // returns [] on its first line with no websiteUrl — so it falls back to real
  // captures of real, on-topic third-party sites instead.
  const hasSite = !!(job.intent && job.intent.websiteUrl);
  const topicSubject = (s.brief?.subject || anchor || "").trim();
  const topicTask = (hasSite
    ? captureTopicShots({ job, script: s.script, jobDir, topic: topicSubject, tracker })
    : ((config.topicShots && config.topicShots.enabled === false)
      ? Promise.resolve([])
      : captureTopicSiteShots({
        script: s.script, jobDir, topic: topicSubject, tracker,
        max: Number(config.topicShots && config.topicShots.max) || 6,
      }))
  ).catch(() => []);

  // Map a scene's asset role to the kind of curated asset that fits it:
  // full-bleed backgrounds want real photos; insets/icons/textures want
  // vectors or illustrations. Threaded into acquire() -> curated.search.
  const kindPrefFor = (role) => {
    const r = String(role || "").toLowerCase();
    if (r === "background" || r === "fullscreen") return "photo";
    if (r === "icon" || r === "texture") return "vector";
    if (r === "inset") return "illustration";
    return undefined;
  };

  // Sequential so each curated pick can exclude the library files already
  // chosen for earlier scenes — no single film reuses the same file twice.
  const usedLibraryIds = new Set();
  // De-dup acquired images by EXACT (MD5) + PERCEPTUAL (dHash) match: several
  // similar queries resolve to the same — or a visually-identical re-encode of
  // the same — stock image, which was being saved as 0.jpg/1.jpg/2.jpg… and
  // shown 4× in the montage. Seed with the pinned screenshots so stock can't
  // duplicate one of them either.
  const deduper = makeImageDeduper();
  for (const a of pinned) { if (a && a.path) { try { await deduper.add(path.join(jobDir, a.path)); } catch { /* noop */ } } }
  // Operator override: with web stock forced off, PHOTO needs come only from the
  // curated library (or the real screenshots) — no random/off-brand stock. Web
  // vectors/icons (usually clean flat art) still reach the web.
  const forceCurated = process.env.CURATED_ONLY_IMAGES === "1";
  let iImg = 0, iVid = 0;
  const results = [];
  // Web-stock assets to run through the vision relevance gate AFTER the fetch
  // loop, in one batched call rather than one LLM call per asset.
  const pendingGate = [];
  // Alternate the preferred vector source per icon/vector slot so a video draws
  // from BOTH Iconify AND Pixabay (each still falls back to the other on a miss)
  // instead of every vector coming from whichever source answers first.
  let vectorSlot = 0;
  // Slots the lookup could NOT fill. Every `continue` below leaves a scene without
  // the asset it asked for; recording them lets the gap-filler generate an
  // on-brief image for exactly those holes instead of the film rendering empty
  // or repeating another scene's picture.
  const misses = [];
  for (const { scene, need } of assetPlan.searches) {
    const isVideo = need.type === "video";
    const relPath = isVideo ? `assets/videos/${iVid++}.mp4` : `assets/images/${iImg++}.jpg`;
    // type:"icon" OR role icon/texture -> want a curated vector. Do NOT append
    // "icon flat" to the query: that suffix trips the curated library's 0.5
    // relevance gate and zeroes its SVG hits — kindPref:"vector" already routes
    // to the SVG library on the concrete subject query.
    const isIcon = need.type === "icon" || ["icon", "texture"].includes(String(need.role || "").toLowerCase());
    // Anchor PHOTO/background queries to the video's subject so a derived
    // direction like "scalable growth" becomes "beauty cosmetics scalable
    // growth" — on-topic stock instead of trading charts. Icons/vectors keep
    // their concrete query (anchoring an abstract shape rarely helps).
    const baseQuery = (!isIcon && anchor) ? `${anchor} ${need.query}` : need.query;
    // Photos also carry the pack's visual style ("neon synthwave" for vapor-
    // chrome) so stock matches the look; the un-styled query stays as a fallback
    // so an over-narrow phrase still finds SOMETHING.
    const query = (!isIcon && packStyle.photoMod) ? `${baseQuery} ${packStyle.photoMod}` : baseQuery;
    const r = await acquire({
      query,
      fallbackQueries: [...new Set([baseQuery, need.query, ...fallbackQueriesFor(query)])],
      type: isVideo ? "video" : "image",
      orientation: job.orientation, outputPath: path.join(jobDir, relPath), tracker,
      kindPref: isVideo ? undefined : (isIcon ? "vector" : kindPrefFor(need.role)),
      excludeIds: usedLibraryIds,
      curatedOnly: forceCurated && !isVideo && !isIcon,
      iconColor: isIcon ? iconColor : undefined,
      iconStyle: isIcon ? packStyle.iconStyle : undefined,
      styleKeywords: !isIcon ? packStyle.keywords : undefined,
      // Interleave Iconify- and Pixabay-first across vector slots (see vectorSlot).
      vectorPrefer: isIcon ? (vectorSlot++ % 2 === 0 ? "pixabay" : "iconify") : undefined,
    }).catch(() => null);
    if (!r) {
      // No provider had anything for this query — the scene's slot stays empty.
      misses.push({ kind: "lookup", scene, need, query: need.query });
      continue;
    }
    // Skip an asset we've already used — byte-identical OR visually a duplicate
    // (a different re-encode/crop of the same picture), which MD5 alone missed.
    if (!isVideo) {
      const dup = await deduper.check(r.path, r.dhash);
      if (dup) {
        console.log(`[agents] dropped ${dup}-duplicate asset — query "${need.query}"`);
        try { fs.unlinkSync(r.path); } catch { /* noop */ }
        // The only hit was a picture another scene already uses, so this slot is
        // still unfilled — exactly the case that makes one photo repeat 4x.
        misses.push({ kind: "duplicate", scene, need, query: need.query });
        continue;
      }
    }
    if (r.libraryId) usedLibraryIds.add(r.libraryId);
    const resultObj = {
      path: path.relative(jobDir, r.path).split(path.sep).join("/"), type: isVideo ? "video" : "image",
      sceneId: scene.id, startSec: scene.start, durationSec: scene.duration,
      style: need.role === "inset" ? "inset" : "background", alt: need.query,
      width: r.width, height: r.height, ratio: r.ratio, hasAlpha: r.hasAlpha,
      license: r.license, sourceUrl: r.sourceUrl, source: r.source, fromCache: r.fromCache === true,
    };
    results.push(resultObj);
    // Defer the vision gate, classified by ACTUAL SOURCE (not role): every real
    // stock provider is gated — including Pixabay bridge VECTORS (source
    // "pixabay"), which are arbitrary illustrations (a cartoon tooth/syringe slips
    // through otherwise). Curated picks, real website screenshots, and clean
    // recolored Iconify SVGs (source "iconify") stay trusted and skip the gate.
    const STOCK_SOURCES = new Set(["pixabay", "openverse", "pexels", "pixabay_scrape"]);
    const isWebStock = STOCK_SOURCES.has(String(r.source || ""));
    if (isWebStock) pendingGate.push({ resultObj, absPath: r.path, type: isVideo ? "video" : "image", query: need.query });
  }

  const gateSubject = (s.brief?.subject || anchor || "").trim();

  // Topic page shots land here: a scene claimed by a topic shot drops its
  // landing-page pin (the specific page beats the homepage).
  // SCREENSHOT QA — vision-inspect every capture and drop the broken ones
  // (error pages, consent modals, bot-walls, blanks, half-renders) BEFORE the
  // creative director ranks them and the composer frames one as the hero.
  const gatedShots = await qaGateScreenshots({
    assets: mergeShots(await topicTask, pinned), jobDir,
    subject: gateSubject, script: s.script, tracker,
  });
  // Blog mode: the post's own images join as pinned owner-content assets on
  // scenes the screenshots didn't claim (Creative Director still reviews them).
  const blogPins = blogImageAssets({ job, script: s.script, jobDir, skipSceneIds: new Set(gatedShots.map((a) => String(a.sceneId))) });
  // Website mode: the site's OWN downloaded images (hero graphics/product shots)
  // join as pinned owner-content photos on scenes the screenshots + blog didn't claim.
  const sitePins = websiteImageAssets({ job, script: s.script, jobDir, skipSceneIds: new Set([...gatedShots, ...blogPins].map((a) => String(a.sceneId))) });
  // The site's brand mark. Unpinned on purpose — template_engine claims it out of
  // the pool (isLogo) and stages it where the pack's wantsLogo() asks.
  const logoPin = websiteLogoAsset({ job, jobDir });
  if (logoPin) console.log(`[agents] website logo pinned as ${logoPin.path}`);
  const allPinned = [...gatedShots, ...blogPins, ...sitePins, ...(logoPin ? [logoPin] : [])];

  // A scene that asked for a website screenshot but has NO owner-content asset
  // left (the capture failed, or Screenshot QA dropped it as an error page /
  // consent modal / blank) is a gap too.
  {
    const coveredByPin = new Set(allPinned.map((a) => String(a.sceneId)));
    for (const { scene } of assetPlan.screenshots || []) {
      if (!coveredByPin.has(String(scene.id))) {
        misses.push({ kind: "screenshot", scene, need: { role: "inset", type: "image" }, query: scene.title || gateSubject });
      }
    }
  }

  // AI image generation removed — films use real assets only (stock, website
  // captures, topic screenshots). A slot with nothing to show stays empty rather
  // than being filled with a generated picture.
  const generated = [];

  // CREATIVE DIRECTOR (default ON) — reviews EVERY asset (screenshots included:
  // it also ranks them by section), scores on six dimensions, assigns scenes,
  // caps prominent assets per scene, and tops-up empty scenes. Fail-open. The
  // plain keep/reject vision gate below stays as the CREATIVE_DIRECTOR=0 fallback.
  const cdEnabled = config.creativeDirector ? config.creativeDirector.enabled !== false : true;
  let kept = null;
  if (cdEnabled && (allPinned.length + results.length + generated.length)) {
    kept = await reviewAndCurate({
      jobId: job.id, storyboard: s.storyboard || null, script: s.script || null,
      brief: s.brief, subject: gateSubject, framePack: s.framePack,
      assets: [...allPinned, ...results, ...generated], tracker, jobDir, orientation: job.orientation,
    });
  }

  // CONTENT-DEDUP — stock providers serve the SAME file for many different scene
  // queries on niche/B2B topics (Linear: one "dashboard UI" photo filled ~12 slots),
  // so one picture ends up repeated across the whole film. Collapse content-identical
  // images (MD5) to a single copy; the freed scenes then get a DISTINCT image from the
  // generator below (or prop-fill) — this is what turns a repetitive/empty long film
  // into a varied one. Runs before the generator so the thin-supply trigger sees the
  // real unique count.
  if (Array.isArray(kept) && kept.length) {
    const crypto = require("node:crypto");
    const seenHash = new Set();
    const deduped = [];
    let dropped = 0;
    for (const a of kept) {
      if (String(a.type) !== "image" || !a.path) { deduped.push(a); continue; }
      let h = null;
      try {
        const abs = a.__absPath || (path.isAbsolute(a.path) ? a.path : path.join(jobDir, a.path));
        h = crypto.createHash("md5").update(fs.readFileSync(abs)).digest("hex");
      } catch { /* unreadable → keep it */ }
      if (h && seenHash.has(h)) { dropped++; continue; }
      if (h) seenHash.add(h);
      deduped.push(a);
    }
    if (dropped) {
      console.log(`[agents] content-dedup: dropped ${dropped} duplicate-image slot(s) → ${deduped.length} unique asset(s)`);
      kept = deduped;
    }
  }

  // VISION RELEVANCE GATE (batched) — "would a director accept this for a film
  // about <subject>?" over ALL fetched web stock in as few calls as possible
  // (chunks of 6) instead of one LLM call per asset. Fail-open: a dead budget or
  // any error keeps every asset, so the gate can never starve a film of visuals.
  // Skipped when the Creative Director already reviewed everything above.
  if (!kept && pendingGate.length && gateSubject) {
    const verdicts = await checkAssetsRelevance({
      assets: pendingGate.map((p) => ({ absPath: p.absPath, type: p.type, query: p.query })),
      subject: gateSubject, tracker,
    });
    verdicts.forEach((v, i) => {
      const p = pendingGate[i];
      if (!v.keep) {
        console.warn(`[agents] asset REJECTED by vision gate (shows "${v.sees || "?"}", film is about "${gateSubject}") — query "${p.query}"`);
        try { fs.unlinkSync(p.absPath); } catch { /* noop */ }
        const idx = results.indexOf(p.resultObj);
        if (idx >= 0) results.splice(idx, 1);
      } else if (v.sees) {
        // Mark the asset as VERIFIED on-topic (the model actually looked at it
        // and approved). scene_kit only admits verified/owned/curated assets to
        // PROMINENT slots (montage tiles, split art) — a fail-open pass (gate
        // error, no `sees`) stays unverified and is kept for scrim B-roll only.
        p.resultObj.visionOk = true;
        p.resultObj.sees = v.sees;
        console.log(`[agents] asset ok (vision: "${v.sees}") — ${p.query}`);
      }
    });
  }
  // ASSET DIRECTOR (batched) — enrich every kept, still-image asset with QUALITY +
  // best FIT / crop FOCUS + entrance EFFECT + corrected KIND, so the kit never
  // crops a logo, never shows a screenshot's blank middle, and animates each asset
  // to suit it. Runs over ALL kept stills (screenshots + curated vectors included,
  // which the relevance gate skips — those are exactly the assets whose fit matters
  // most). Fail-open: on any error the assets are left as-is and the kit falls back
  // to its own fit heuristics.
  //
  // FALLBACK ONLY. The Creative Director's vision pass above now returns these
  // craft fields itself, so running this too re-uploaded the SAME thumbnails for a
  // second opinion — roughly doubling the image tokens of the asset stage for no
  // new information. It still runs when that pass didn't happen (CREATIVE_DIRECTOR=0,
  // or it failed and `kept` is null) or came back with no craft verdicts at all.
  const gated = kept || [...allPinned, ...results];
  // Per-asset craft review (kind/fit/focus/effect/quality) — now the SHARED helper
  // that pipeline.runJob also calls, so both paths direct assets identically.
  await directAssets({ assets: gated, jobDir, subject: gateSubject, tracker });
  const assets = gated;
  db.setAssets(job.id, assets);
  console.log(`[agents] asset_search: ${assets.length} asset(s) (${assets.filter((a) => a.fromCache).length} from cache)`);
  return { assets };
}

// Art Director — turns the site's extracted brand colors (brief.brandColors, else
// unused) into an ACCENT-ONLY brand skin so the composition reads on-brand instead
// of the frame pack's stock palette. Runs in parallel with the storyboard/asset/
// voice chain (it only needs the brief + the chosen pack); the skin joins at
// composition. Fail-open: any failure returns a null skin → the pack keeps its
// own accents, so it never blocks a render or makes a video worse.
async function artDirectorAgent(s) {
  const brandColors = s.brief?.brandColors || [];
  // WEBSITE THEME MATCH — adopt the site's own ground color (light/dark) so the
  // film reads like the product's UI. On by default for website inputs; disable
  // per-request with matchSiteTheme:false. Proceeds even with no brand accents.
  const siteBg = s.job.website_bg || null;
  // ON by default for website inputs; global kill-switch config.matchSiteTheme:false,
  // per-job override s.job.match_site_theme:false (if a future request field sets it).
  const matchTheme = config.matchSiteTheme !== false && s.job.match_site_theme !== false && !!siteBg;
  if ((!config.artDirector?.enabled || !brandColors.length) && !matchTheme) return { brandSkin: null };
  db.setProgress(s.job.id, "art_direction");
  const brandSkin = await directBrand({
    jobId: s.job.id,
    brandColors,
    subject: s.brief?.subject || null,
    brief: s.brief,
    framePack: s.framePack,
    packVibe: s.framePack ? frameRegistry.getPackVibe(s.framePack) : null,
    tracker: s.tracker,
    siteBg,
    matchTheme,
  }).catch((e) => { console.warn(`[agents] art_director failed: ${e.message}`); return null; });
  return { brandSkin };
}

// Visual Layout Director — the composition authority. It does NOT pick assets (the
// Creative Director / vision gates did that); it decides their PRESENTATION by
// reusing the per-asset scores: how many appear prominently (quality over quantity
// — demote the weak overflow to B-roll), the hero size (enlarge for readability),
// the montage tile budget (fewer, larger), and content-aware crop focus — plus the
// base archetype typing (a testimonial becomes a quote card, an untagged metric a
// stat card). Deterministic, no LLM. It only FILLS GAPS the asset-director's
// vision pass left (a.focus/a.fit win over its cropFocus in scene_kit). Fail-open:
// on any error the kit's own logic runs.
async function visualLayoutDirectorAgent(s) {
  db.setProgress(s.job.id, "layout_direction");
  const { assets, layoutPlan, review } = directLayout({
    storyboard: s.storyboard,
    script: s.script,
    assets: s.assets || [],
    framePack: s.framePack,
    dims: { width: s.job.width, height: s.job.height, fps: s.job.fps },
  });
  if (review) { try { db.setLayoutReview(s.job.id, review); } catch { /* best effort */ } }
  try { db.setAssets(s.job.id, assets); } catch { /* best effort */ }
  return { assets, layoutPlan };
}

// Text Director — mines the brief/script/site copy for the words that sell and
// fills each storyboard scene's EMPTY text slots (subtext/bullets/emphasis/
// kicker) so the film carries real information density. Add-only (existing
// storyboard text always wins) + fail-open (deterministic miner backs the LLM,
// and any error returns the storyboard untouched).
async function textDirectorAgent(s) {
  db.setProgress(s.job.id, "text_direction");
  try {
    const { storyboard } = await directText({
      jobId: s.job.id,
      brief: s.brief,
      script: s.script,
      storyboard: s.storyboard,
      tracker: s.tracker,
    });
    return { storyboard };
  } catch (e) {
    console.warn(`[agents] text_director skipped: ${String((e && e.message) || e).slice(0, 120)}`);
    return {};
  }
}

// Voice Agent — per-scene fitted VO + script SFX + music, in parallel.
async function voiceAgent(s) {
  const { job, jobDir, tracker, script } = s;
  const audioDir = path.join(jobDir, "audio");
  fs.mkdirSync(audioDir, { recursive: true });
  const voice = pickVoice(job, script);
  // Delivery DIRECTION, not a demographic profile. Strip gender/age words (they
  // pick the voice, not the read) and turn pace into a spoken-energy phrase so
  // gpt-audio gets actionable acting notes instead of "30s female".
  const tone = String(script.voice?.style || "")
    .replace(/\b(male|female|man|woman|masculine|feminine|young|younger|older|aged?|teen|adult|nonbinary|he\/him|she\/her|\d+\s*s?)\b/gi, "")
    .replace(/\s{2,}/g, " ").replace(/^[\s,.;-]+|[\s,.;-]+$/g, "").trim() || "clear and confident";
  const pace = String(script.voice?.pace || "").toLowerCase();
  const paceEnergy = /slow|calm|measured|gentle/.test(pace) ? "unhurried and measured"
    : /fast|brisk|quick|punchy|energetic/.test(pace) ? "brisk and energetic"
    : "a relaxed, natural conversational rhythm";
  const instructions = `Speak ${tone}. Delivery: ${paceEnergy}. Vary intonation naturally, land emphasis on key words, and warm the final line.`;

  // One shared ttsSession = one narrator: the provider that speaks the first
  // clip is pinned for the whole take (no more mid-film voice swaps).
  const ttsSession = {};
  const voTask = Promise.all(script.scenes.map((sc) =>
    (sc.voiceover && sc.voiceover.trim())
      ? synthesizeFitted({ text: sc.voiceover, targetSec: sc.duration, voice, instructions, outputPath: path.join(audioDir, `vo-${sc.id}.mp3`), tracker, session: ttsSession })
          .then((r) => r ? { sceneId: sc.id, startSec: sc.start, durationSec: r.durationSec, sceneDurationSec: sc.duration, text: r.text, path: r.path, fallbackVoice: r.fallbackVoice || null } : null)
          .catch((e) => { console.warn(`[agents] vo ${sc.id} failed: ${e.message}`); return null; })
      : Promise.resolve(null)
  )).then((a) => a.filter(Boolean));

  // SFX budget SCALES with the film: a flat cap of 3 left long-form videos (30
  // scenes) essentially silent of accents. Allow ~1 per scene, capped so a short
  // film stays punchy and a long one stays lively (≈1 SFX / 12s of runtime).
  // Volume raised to 0.55 so the accents actually read over the VO+music bed.
  const sfxCap = Math.min(10, Math.max(3, Math.round((script.scenes.length || 3) * 0.8)));
  const sfxWanted = [];
  for (const sc of script.scenes) for (const name of (sc.sfx || [])) if (sfxWanted.length < sfxCap) sfxWanted.push({ name, startSec: sc.start });
  const sfxTask = Promise.all(sfxWanted.map((x, i) =>
    getSfx({ name: x.name, outputPath: path.join(audioDir, `sfx-${i}.mp3`), tracker })
      .then((p) => p ? { path: p, startSec: x.startSec, volume: 0.55 } : null).catch(() => null)
  )).then((a) => a.filter(Boolean));

  // Richer music query: fold the mood field into the query so the provider gets
  // genre/feel cues, not just a bare 2-word phrase (which returned off-genre SFX).
  // seed=job.id varies the Pixabay track PER VIDEO (fixes "same BGM every time").
  const musicQuery = [script.music?.mood, script.music?.query]
    .map((x) => String(x || "").trim()).filter(Boolean).join(" ").slice(0, 80);
  const musicTask = (script.music?.query || script.music?.mood)
    ? fetchMusic({ query: musicQuery, outputPath: path.join(audioDir, "music.mp3"), tracker, seed: job.id }).catch(() => null)
    : Promise.resolve(null);

  const [voClips, sfxClips, musicPath] = await Promise.all([voTask, sfxTask, musicTask]);
  console.log(`[agents] voice: ${voClips.length} vo clip(s), ${sfxClips.length} sfx, music=${!!musicPath}`);

  // Surface audio degradation on the job — a silent film must never ship
  // silently. (The Premiere screen shows these notes with the details.)
  const wantedVo = script.scenes.some((sc) => sc.voiceover && sc.voiceover.trim());
  const notes = [];
  if (wantedVo && voClips.length === 0) {
    notes.push("Voiceover unavailable — every TTS provider failed (budget/limits). The film shipped without narration; regenerate once a provider resets to add the voice back.");
  } else if (voClips.some((c) => c && c.fallbackVoice === "edge")) {
    notes.push("Voiceover used the free fallback voice (paid TTS providers were unavailable) — the narration may sound different from your usual voice.");
  }
  if (!musicPath && (script.music?.query || script.music?.mood)) {
    notes.push("Music unavailable — no source matched and the generated bed also failed; the film shipped without a music track.");
  }
  if (notes.length) db.setAudioNotes(job.id, notes);

  return { voClips, sfxClips, musicPath };
}

// Composition Agent (+ the Animation agent's work product: the timeline).
async function compositionAgent(s) {
  const { job, jobDir, tracker } = s;
  db.setProgress(job.id, "composing");
  const dims = { width: job.width, height: job.height, fps: job.fps };

  // VO-DRIVEN RE-TIMING (the sync fix): voice_agent now joins BEFORE this node,
  // so the measured narration is available here. Stretch each scene to contain
  // its line — without this a 3.4s line in a 3s scene overlapped the next
  // scene's narration AND the last line ran past the video end and was CUT
  // mid-sentence at mux time. Idempotent across QA repair laps.
  const retime = retimeScenesToVo(s.storyboard, s.script, s.voClips || []);
  const effDur = retime.effectiveDuration || job.duration;
  if (effDur > job.duration + 0.05) {
    console.log(`[agents] scenes re-timed to measured VO: ${job.duration}s -> ${effDur}s (last line no longer cut)`);
  }
  const r2c = (n) => Math.round(Number(n) * 100) / 100;
  const sfxRepinned = (s.sfxClips || []).map((c) => ({ ...c, startSec: retime.startMap.get(r2c(c.startSec)) ?? c.startSec }));

  const captionCues = job.captions_enabled === 0 ? [] : buildCues(
    s.script.scenes.filter((x) => x.voiceover && x.voiceover.trim()).map((x) => {
      const measured = (s.voClips || []).find((c) => String(c.sceneId) === String(x.id));
      return {
        sceneId: x.id, startSec: x.start,
        durationSec: Math.min(x.duration, measured ? measured.durationSec : x.duration),
        sceneDurationSec: x.duration, text: x.voiceover,
      };
    })
  ).map((c) => ({ start: Math.round(c.start * 10) / 10, end: Math.round(c.end * 10) / 10, text: c.text }));

  // Carry QA repair feedback into the composer when looping.
  const storyboard = s.qa && s.qa.issues?.length
    ? { ...s.storyboard, __qaIssuesToFix: s.qa.issues.map((i) => `at ${i.atSec}s [${i.severity}]: ${i.issue} — FIX: ${i.fix}`) }
    : s.storyboard;

  const budget = (Number(config.server.stageBudgetSec) || 480) * 1000;
  // Composer dispatch.
  // TEMPLATE PIN comes first: when the user explicitly picked a frame pack in
  // the gallery (frame_pack_user), the film MUST look like that template — the
  // deterministic scene-kit renders the pack faithfully (manifest theme,
  // textfx, ornaments, assetStyle). The LLM composer freestyles from FRAME.md
  // and drifts off-template ("video ignores my selected template"), so a
  // premium finish only applies when the pack was auto-chosen.
  // Otherwise the user's per-video finish choice wins:
  //   compose_mode "premium"  → the LLM composition agent (remix)
  //   compose_mode "standard" → the deterministic scene-kit
  //   unset                   → the global USE_LLM_COMPOSER default
  // Either way the kit stays available as the fallback below.
  const packPinned = job.frame_pack_user === 1 || job.frame_pack_user === true;
  // An explicit PREMIUM finish always runs the LLM composer — including on a
  // user-pinned template. The composer writes a bespoke page from the pack's
  // FRAME.md, and the identity gate runs STRICT for pinned packs (violations
  // force a repair lap), so the output stays on-template. A pinned pack only
  // forces scene-kit when the finish was left on default.
  const useComposer = job.compose_mode === "premium"
    ? true
    : job.compose_mode === "standard"
      ? false
      : packPinned
        ? false
        : config.llm.useComposer !== false;
  const strictIdentity = packPinned && useComposer;
  if (job.compose_mode || packPinned) console.log(`[agents] job ${job.id} finish=${job.compose_mode || "default"}${packPinned ? ` (template "${job.frame_pack}" pinned by user${strictIdentity ? ", STRICT identity gate" : ""})` : ""} → ${useComposer ? "LLM composer" : "scene-kit"}`);
  try {
    // Asset-rich videos override an opt-in render3d: the 3D composer only textures
    // ONE screenshot, so a video with several real screenshots/photos is showcased
    // far better by the 2D composer (which weaves 8-10). Text-forward 3D stays 3D.
    const use3d = job.render3d && !isAssetRich(s.assets || []);
    if (job.render3d && !use3d) {
      console.log(`[agents] render3d requested, but the video is asset-rich (${(s.assets || []).length} assets) → using the 2D composer so the screenshots/photos are actually shown (3D would drop all but one).`);
    }
    if (use3d) {
      // Website→3D: the real website screenshots in s.assets texture the reveal
      // plate. Deterministic + self-contained; on failure it falls to the
      // scene-kit fallback in the catch below.
      const visual = await withBudget(
        (signal) => composeWithThree({
          storyboard, dims, jobDir, framePack: s.framePack, captionCues,
          assets: s.assets || [], jobId: job.id, durationSec: effDur,
          label: "graph-three", abortSignal: signal, tracker,
        }),
        budget, "Three.js composition"
      );
      return { visual, usedFallback: false, finalAttempt: "three", usedComposer: false, effectiveDuration: effDur, sfxClips: sfxRepinned };
    }
    const visual = await withBudget(
      (signal) => attemptLlmComposition({
        storyboard, dims, jobDir, assets: s.assets || [], tracker,
        jobId: job.id, durationSec: effDur,
        label: s.qa ? "graph-repair" : "graph-main", abortSignal: signal,
        framePack: s.framePack, captionCues, remix: useComposer, strictIdentity,
        // Standard finish gets the bounded LLM set-dressing pass (per-scene
        // layout variants, emphasis words, sanitized decor SVG clusters) — a
        // cheap fast-stage call that art-directs the deterministic kit, so
        // "standard" no longer means "no personalized art direction at all".
        dress: !useComposer,
        subject: s.brief?.subject || null,
        brandSkin: s.brandSkin || null, layoutPlan: s.layoutPlan || null,
      }),
      budget, "composition agent"
    );
    return { visual, usedFallback: false, finalAttempt: s.qa ? "qa-repair" : "main", usedComposer: useComposer, effectiveDuration: effDur, sfxClips: sfxRepinned };
  } catch (e) {
    console.warn(`[agents] composition failed (${e.message.slice(0, 180)})`);
    // Budget-class failure (provider out of credits / daily-capped): a QA
    // repair lap would hit the exact same wall, so flag it and stop looping.
    const composerBudgetDead = /\b402\b|can only afford|credits|budget exhausted|daily limit/i.test(String(e.message));
    if (composerBudgetDead) console.warn(`[agents] composer budget exhausted — QA repair laps disabled for this job`);
    // On a QA-triggered repair lap, a failed re-compose must NOT discard the
    // prior render that already passed lint and was QA-reviewed by shipping the
    // bland deterministic template. A real (if imperfect) composition beats a
    // fallback slide — keep the previous good render.
    if (s.qa && s.visual && !s.usedFallback) {
      console.warn(`[agents] repair re-compose failed — keeping prior lint-passing render (not falling back to template)`);
      return { visual: s.visual, usedFallback: false, finalAttempt: s.finalAttempt || "main", usedComposer: s.usedComposer === true, rendered: true, composerBudgetDead, effectiveDuration: effDur, sfxClips: sfxRepinned };
    }
    try {
      if (fs.existsSync(path.join(jobDir, "index.html"))) {
        fs.copyFileSync(path.join(jobDir, "index.html"), path.join(jobDir, "index.llm-attempt.html"));
      }
    } catch { /* best effort */ }
    // The LLM composer failed its gates. Before the bland template, try the
    // deterministic ASSET-RICH scene-kit — a real, lint-clean, multi-asset comp
    // (screenshot hero + montage + scrim B-roll) beats a fallback slide. Only
    // worth a separate attempt when the composer (remix) was the primary path.
    if (useComposer) {
      try {
        console.warn(`[agents] scene-kit fallback (deterministic, asset-rich)`);
        // Premium jobs get the HYBRID: bounded LLM set-dressing over the kit
        // (variants + emphasis + sanitized decor) — composer-flavoured art
        // direction without composer failure modes. Skipped when the failure
        // was budget-class (the dressing call would die on the same wall).
        const visual = await attemptLlmComposition({
          storyboard, dims, jobDir, assets: s.assets || [], tracker,
          jobId: job.id, durationSec: effDur, label: "scene-kit-fallback",
          framePack: s.framePack, captionCues, remix: false,
          dress: job.compose_mode === "premium" && !composerBudgetDead,
          subject: s.brief?.subject || null,
          brandSkin: s.brandSkin || null, layoutPlan: s.layoutPlan || null,
        });
        return { visual, usedFallback: false, finalAttempt: "scene-kit", usedComposer: false, rendered: true, composerBudgetDead, effectiveDuration: effDur, sfxClips: sfxRepinned };
      } catch (e2) {
        console.warn(`[agents] scene-kit fallback failed (${String(e2.message).slice(0, 120)}) — bland template`);
      }
    }
    console.warn(`[agents] deterministic fallback`);
    const fb = buildFallback({
      prompt: s.brief?.improvedPrompt || job.prompt, duration: effDur,
      orientation: job.orientation, width: dims.width, height: dims.height, fps: dims.fps,
      storyboard: s.storyboard,
      packTokens: s.framePack ? frameRegistry.getPackTokens(s.framePack) : null,
      assets: s.assets || [],
      captionCues,
    });
    // Run the fallback through the same safe normalizer the LLM path uses, so a
    // pack font token / track overlap never ships an un-checked fallback.
    const fbNorm = normalizeComposition(fb.indexHtml);
    fs.writeFileSync(path.join(jobDir, "index.html"), fbNorm.html, "utf8");
    fs.writeFileSync(path.join(jobDir, "meta.json"), fb.metaJson, "utf8");
    tracker.addExternal("hyperframes_render");
    const visual = await render({ jobId: job.id, jobDir, durationSec: effDur });
    return { visual, usedFallback: true, finalAttempt: "fallback", rendered: true, composerBudgetDead, effectiveDuration: effDur, sfxClips: sfxRepinned };
  }
}

// Animation Agent — deterministic timeline audit of the composed HTML:
// every scene window must be covered by timeline activity, and the known
// footguns must be absent. Produces warnings; never blocks (QA decides).
async function animationAgent(s) {
  if (s.usedFallback) return { animationReport: { warnings: ["fallback composition"] } };
  let html = "";
  try { html = fs.readFileSync(path.join(s.jobDir, "index.html"), "utf8"); } catch { /* no file */ }
  const warnings = [];
  if (/repeat:\s*-1/.test(html)) warnings.push("repeat:-1 found (breaks deterministic capture)");
  if (/style="[^"]*transform:\s*translate/i.test(html)) warnings.push("inline transform hidden-state found (composes with GSAP xPercent — content may stay offscreen)");
  const tweenCount = (html.match(/tl\.(to|fromTo|from|set)\(/g) || []).length;
  const sceneCount = (s.storyboard?.scenes || []).length || 1;
  if (tweenCount < sceneCount * 2) warnings.push(`only ${tweenCount} timeline calls for ${sceneCount} scenes — likely under-animated`);
  if (warnings.length) console.warn(`[agents] animation audit: ${warnings.join(" | ")}`);
  return { animationReport: { tweenCount, warnings } };
}

// Timeline Agent — render (if not already), captions/SRT, audio mix.
async function timelineAgent(s) {
  const { job, jobDir, tracker } = s;
  let visual = s.visual;
  if (!s.rendered && !s.usedFallback) {
    // attemptLlmComposition already rendered; only the fallback path marks
    // rendered itself. visual is set either way.
  }
  db.setProgress(job.id, "audio");

  const cues = buildCues(s.voClips || []);
  if (cues.length) {
    try {
      const srtPath = path.join(config.paths.videosDir, `${job.id}.srt`);
      writeSrt(cues, srtPath);
      db.setCaptions(job.id, { cues, srtUrl: `/videos/${job.id}.srt` });
    } catch (e) { console.warn(`[agents] srt failed: ${e.message}`); }
  }

  await mixAudioIntoVideo({
    visualPath: visual.videoPath,
    // The video was rendered at the VO re-timed duration — mix to the same
    // length or the last narrated line gets cut at the old boundary again.
    durationSec: s.effectiveDuration || job.duration,
    scenes: s.storyboard?.scenes || null, jobDir,
    audio: {
      ttsPath: null,
      musicPath: s.musicPath || null,
      sfx: [
        // kind:"vo" lets the mixer duck the background music under speech.
        ...(s.voClips || []).map((c) => ({ path: c.path, startSec: c.startSec, volume: 1.0, kind: "vo" })),
        ...(s.sfxClips || []),
      ],
      musicVolume: config.audio?.defaultMusicVolume ?? 0.15,
    },
  }).catch((e) => console.warn(`[agents] mix failed: ${e.message}`));

  return { visual };
}

// Repair lap — re-runs composition → animation audit → timeline as one
// node so the QA loop never re-enters the first lap's parallel joins.
async function repairAgent(s) {
  const comp = await compositionAgent(s);
  const m1 = { ...s, ...comp };
  const anim = await animationAgent(m1);
  const tl = await timelineAgent({ ...m1, ...anim });
  return { ...comp, ...anim, ...tl };
}

// Contrast repair node — the DETERMINISTIC alternative to an LLM repair lap when
// QA flags a fixable blocker. Re-runs the FULL deterministic fix chain ESCALATED
// on the already-composed index.html — palette-snap (identity), background
// ground-veil (bg-harmonize, stronger + CSS-bg coverage), layout dedup/collision-
// scrim, and contrast recolor/un-clip/scrim — and if ANYTHING changed, re-renders
// + re-mixes audio, then loops back to QA to re-verify. Cheap + targeted: it fixes
// the exact defect deterministically instead of re-rolling the whole composition
// (which the LLM repair does and which regresses as often as it helps). Sets
// contrastRepairTried so the loop enters this deterministic pass at most once.
async function contrastRepairNode(s) {
  const { job, jobDir } = s;
  db.setProgress(job.id, "qa");
  const rep = await contrastFixPass(jobDir, {
    framePack: s.framePack,
    storyboard: s.storyboard,
    dims: { width: job.width, height: job.height },
    label: "qa-repair",
    escalate: true,
  }).catch((e) => { console.warn(`[agents] deterministic repair errored: ${e.message.slice(0, 120)}`); return null; });

  // Nothing deterministically changed (the sampler disagrees with the vision QA,
  // or the defect isn't one our chain can touch) — mark tried and let the LLM
  // repair / END take over. Re-render only when a real change was applied.
  if (!rep || !rep.changedAny) {
    // Nothing changed → the video is byte-identical, so DON'T pay for a re-review.
    // detRepairNoop makes qaAgentNode reuse the prior verdict (no reviewRender call,
    // no qaAttempts burn) and the router then falls to the LLM repair / END.
    console.log(`[agents] deterministic repair: no change applied — deferring to repair/END (skipping re-QA of identical video)`);
    return { contrastRepairTried: true, detRepairNoop: true };
  }
  console.log(`[agents] deterministic repair: contrast ${rep.fixed?.length || 0} · bg-veil ${rep.bgVeiled || 0} · palette ${rep.identityRemapped || 0} · layout ${rep.layoutChanged || 0} — re-rendering`);

  const visual = await render({ jobId: job.id, jobDir, durationSec: s.effectiveDuration || job.duration })
    .catch((e) => { console.warn(`[agents] contrast re-render failed: ${e.message.slice(0, 120)}`); return null; });
  if (!visual) return { contrastRepairTried: true };

  // Re-mix audio into the fresh render (mirror timelineAgent's mix).
  await mixAudioIntoVideo({
    visualPath: visual.videoPath,
    durationSec: s.effectiveDuration || job.duration,
    scenes: s.storyboard?.scenes || null, jobDir,
    audio: {
      ttsPath: null,
      musicPath: s.musicPath || null,
      sfx: [
        ...(s.voClips || []).map((c) => ({ path: c.path, startSec: c.startSec, volume: 1.0, kind: "vo" })),
        ...(s.sfxClips || []),
      ],
      musicVolume: config.audio?.defaultMusicVolume ?? 0.15,
    },
  }).catch((e) => console.warn(`[agents] contrast-repair mix failed: ${e.message}`));

  return { visual, contrastRepairTried: true };
}

// QA Agent node — verdict + loop control.
async function qaAgentNode(s) {
  // A deterministic repair pass that changed NOTHING left the video byte-identical:
  // re-reviewing it would spend an LLM QA call to get the exact same verdict AND
  // burn a qaAttempts increment. Reuse the prior verdict, clear the flag, and let
  // the router fall through to the LLM repair / END.
  if (s.detRepairNoop) {
    return { qa: s.qa, detRepairNoop: false };
  }
  // Skip QA for the deterministic 3D composer — it's not iteratively repairable,
  // so a QA-repair loop would just re-render an identical (slow) 3D video.
  if (config.qa?.enabled === false || s.usedFallback || s.job?.render3d) {
    return { qa: { pass: true, issues: [], skipped: true } };
  }
  db.setProgress(s.job.id, "qa");
  const verdict = await reviewRender({
    videoPath: s.visual.videoPath,
    scenes: s.script.scenes,
    duration: s.job.duration,
    framePack: s.framePack,
    workDir: path.join(s.jobDir, "qa"),
    tracker: s.tracker,
    // 9:16 films get the portrait blocker set (landscape-shrunk layout,
    // side-by-side squeeze, illegible type, horizontal edge crop).
    dims: { width: s.job.width, height: s.job.height },
    // Deterministic scene-kit/dedicated films judge only HARD defects as
    // blockers — the template's own design language (typographic scenes,
    // whitespace, a shared ground) is intentional, and a repair lap can't
    // redesign a deterministic template anyway.
    deterministic: s.usedComposer !== true,
  }).catch((e) => {
    console.warn(`[agents] qa failed (${e.message.slice(0, 120)}); passing by default`);
    return { pass: true, issues: [], error: e.message };
  });
  // BEST-LAP LEDGER — repair laps are a re-roll (deterministic comp + fresh
  // dressing), so a later lap can score WORSE than an earlier one. Snapshot
  // the highest-scoring failing lap's mixed video; the runner ships it if the
  // loop exhausts on a lower score ("best attempt" used to mean "last lap").
  let bestQa = s.bestQa || null;
  if (!verdict.pass) {
    const score = Number(verdict.score) || 0;
    if (!bestQa || score > bestQa.score) {
      try {
        const snap = path.join(s.jobDir, "best-lap.mp4");
        fs.copyFileSync(s.visual.videoPath, snap);
        // Store the VERDICT alongside the snapshot: when we ship this best lap
        // over a later, lower-scoring one, the surfaced QA must describe the cut
        // that actually shipped — not the last lap's verdict.
        bestQa = { score, snap, lap: (s.qaAttempts || 0), verdict };
      } catch (e) {
        console.warn(`[agents] best-lap snapshot failed: ${e.message.slice(0, 100)}`);
      }
    }
  }
  return { qa: verdict, qaAttempts: (s.qaAttempts || 0) + 1, bestQa };
}

// ---------------------------------------------------------------- graph
let compiledGraph = null;

async function buildGraph() {
  if (compiledGraph) return compiledGraph;
  const { StateGraph, Annotation, START, END } = await import("@langchain/langgraph");

  const S = Annotation.Root({
    job: Annotation(), jobDir: Annotation(), tracker: Annotation(),
    brief: Annotation(), script: Annotation(),
    framePack: Annotation(), storyboard: Annotation(),
    assetPlan: Annotation(), assets: Annotation(),
    voClips: Annotation(), sfxClips: Annotation(), musicPath: Annotation(), effectiveDuration: Annotation(),
    visual: Annotation(), usedFallback: Annotation(), finalAttempt: Annotation(), rendered: Annotation(),
    animationReport: Annotation(), qa: Annotation(), qaAttempts: Annotation(),
    bestQa: Annotation(), usedComposer: Annotation(),
    composerBudgetDead: Annotation(), contrastRepairTried: Annotation(), detRepairNoop: Annotation(),
    brandSkin: Annotation(), layoutPlan: Annotation(),
  });

  // Node names must not collide with state channel names (LangGraph rule),
  // hence the _agent suffixes on storyboard/qa.
  const g = new StateGraph(S)
    .addNode("frame_selector", frameSelectorAgent)
    .addNode("art_director", artDirectorAgent)
    .addNode("storyboard_agent", storyboardAgent)
    .addNode("scene_planner", scenePlannerAgent)
    .addNode("asset_planner", assetPlannerAgent)
    .addNode("asset_search", assetSearchAgent)
    .addNode("text_director", textDirectorAgent)
    .addNode("visual_layout_director", visualLayoutDirectorAgent)
    .addNode("voice_agent", voiceAgent)
    .addNode("composition", compositionAgent)
    .addNode("animation", animationAgent)
    .addNode("timeline", timelineAgent)
    .addNode("qa_agent", qaAgentNode)
    .addNode("contrast_repair", contrastRepairNode)
    .addNode("repair", repairAgent);

  g.addEdge(START, "frame_selector");
  // Fan-out: four branches run in parallel. The Art Director only needs the brief
  // + the chosen pack, so it runs alongside the storyboard/asset/voice chain and
  // its brand skin joins at composition (near-zero added latency).
  g.addEdge("frame_selector", "storyboard_agent");
  g.addEdge("frame_selector", "asset_planner");
  g.addEdge("frame_selector", "voice_agent");
  g.addEdge("frame_selector", "art_director");
  g.addEdge("storyboard_agent", "scene_planner");
  g.addEdge("asset_planner", "asset_search");
  // The Text Director enriches the planned scenes with mined copy (subtext/
  // bullets/emphasis) BEFORE layout, so archetype typing sees the final text
  // (a scene that just gained proof bullets can become a feature grid).
  g.addEdge("scene_planner", "text_director");
  // Join: the Visual Layout Director needs the enriched scene plan AND the
  // curated assets (it reuses their scores to re-level prominence + type each
  // scene's archetype).
  g.addEdge(["text_director", "asset_search"], "visual_layout_director");
  // Join: composition waits for the layout direction (archetypes + sizing/crop +
  // re-leveled assets), the brand skin (accent-only palette) AND the voice branch.
  g.addEdge(["visual_layout_director", "art_director", "voice_agent"], "composition");
  g.addEdge("composition", "animation");
  // Join: the timeline mix needs the render AND the voice branch.
  g.addEdge("animation", "timeline");
  g.addEdge("timeline", "qa_agent");
  g.addConditionalEdges("qa_agent", (s) => {
    // 1) DETERMINISTIC repair FIRST for ANY blocker our fix-chain can address —
    // not just contrast. The chain (identity palette-snap + background ground-veil
    // + layout dedup/collision-scrim + contrast recolor/scrim), re-run ESCALATED,
    // fixes the exact defect far more reliably and cheaply than an LLM re-roll, and
    // works on the scene-kit/dedicated paths too (which otherwise ship unfixed).
    // Runs at most once (contrastRepairTried gates the whole deterministic pass).
    const blockers = (!s.qa?.pass && Array.isArray(s.qa?.issues))
      ? s.qa.issues.filter((i) => String(i.severity || "").toLowerCase() === "blocker") : [];
    const btxt = blockers.map((i) => `${i.issue || ""} ${i.fix || ""}`).join(" \n ").toLowerCase();
    const fixableBlocker = blockers.length > 0 && (
      /contrast|legib|readab|illegible|hard to read|low[-\s]?contrast|washed[-\s]?out text/.test(btxt)                                       // contrast/legibility
      || /clash|raw (native )?colou?r|palette[-\s]?clash|harmoniz|not harmoniz|(photo|image|background|video)[^.]{0,40}(clash|raw|native|washed|unscrimmed|no scrim|no tint|too bright)/.test(btxt) // raw-photo clash
      || /off[-\s]?palette|off[-\s]?brand|wrong colou?r|foreign colou?r|colou?rs?[^.]{0,30}(belong|palette|system|off)/.test(btxt)          // off-palette color
      || /overlap|overlapp|occlud|collision|collid|stacked|on top of|covering|over the (image|photo|graphic|screenshot)|duplicat/.test(btxt) // collision / text-over-graphic / duplicate
    );
    if (fixableBlocker && !s.contrastRepairTried && !s.usedFallback) {
      console.log(`[agents] QA flagged ${blockers.length} blocker(s) — deterministic repair pass (escalated fix chain, no LLM re-roll)`);
      return "contrast_repair";
    }
    // 2) The composer genuinely rewrites from QA feedback, so it earns the full
    // configured lap budget. Scene-kit/dedicated comps are DETERMINISTIC + lint-
    // clean by construction — an LLM repair lap only re-rolls the dressing, which
    // the evidence shows regresses as often as it helps AND re-bills the priciest
    // stage (~$0.02-0.05/lap: the 2× "dressing" charge on QA-flagged films). So
    // scene-kit gets the FREE deterministic contrast repair above and otherwise
    // ships its best lap — no costly, coin-flip re-compose. Only the composer path
    // takes the paid repair lap.
    const capLaps = Number(config.qa?.maxRepairs) || 1;
    // The one deterministic repair pass also runs QA (to re-verify its fix), which
    // increments qaAttempts — but it must NOT eat into the composer's LLM lap
    // budget. Discount it so the composer still earns its full configured laps.
    const repairsLeft = ((s.qaAttempts || 0) - (s.contrastRepairTried ? 1 : 0)) <= capLaps;
    // No repair lap when the composer already failed on budget (402/daily cap)
    // — the recompose would hit the identical wall and just burn time.
    if (!s.qa?.pass && s.usedComposer && repairsLeft && !s.usedFallback && !s.composerBudgetDead) {
      console.log(`[agents] QA failed — composer repair lap ${s.qaAttempts}`);
      return "repair";
    }
    if (!s.qa?.pass && s.composerBudgetDead) {
      console.log(`[agents] QA failed but composer budget is exhausted — delivering best attempt (no repair lap)`);
    }
    return END;
  }, ["contrast_repair", "repair", END]);
  g.addEdge("contrast_repair", "qa_agent");
  g.addEdge("repair", "qa_agent");

  compiledGraph = g.compile();
  return compiledGraph;
}

// ---------------------------------------------------------------- runner
async function runProductionGraph({ jobId }) {
  const job = db.getRaw(jobId);
  if (!job || !job.script) {
    console.error(`[agents] ${jobId} aborted: no approved script`);
    return;
  }
  const jobDir = jobDirFor(jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  db.markStarted(jobId);

  // Continue the bill intake already started (brief + script) — a fresh tracker
  // here meant markDone's usage overwrite dropped those stages from every job.
  const tracker = UsageTracker.from(job.usage);
  const t0 = ms();
  const script = normalizeScript(job.script, { targetDuration: job.duration });

  try {
    const graph = await buildGraph();
    const final = await graph.invoke(
      { job, jobDir, tracker, brief: job.brief, script, qaAttempts: 0 },
      { recursionLimit: 40 }
    );

    // Ship the BEST QA-scored lap, not the last one: when the loop exhausted
    // on a lap that scored below an earlier snapshot, restore the snapshot AND
    // surface that lap's verdict (so the stored QA describes the cut that shipped,
    // not a different, discarded lap — the old code shipped best-lap video but
    // stored last-lap verdict).
    const restored = final.qa && final.qa.pass === false && final.bestQa && final.bestQa.snap
      && (Number(final.qa.score) || 0) < final.bestQa.score;
    if (restored) {
      try {
        fs.copyFileSync(final.bestQa.snap, final.visual.videoPath);
        console.log(`[agents] shipping best QA lap (lap ${final.bestQa.lap}, score ${final.bestQa.score}) over last lap (score ${Number(final.qa.score) || 0})`);
      } catch (e) {
        console.warn(`[agents] best-lap restore failed: ${e.message.slice(0, 100)}`);
      }
    }
    const shippedQa = restored ? (final.bestQa.verdict || final.qa) : final.qa;
    const costs = tracker.computeCosts();
    db.markDone(jobId, {
      videoUrl: final.visual.videoUrl,
      usedFallback: final.usedFallback === true,
      tokensIn: costs.llm.inputTokens,
      tokensOut: costs.llm.outputTokens,
      usage: costs,
      stageTimings: { ...(job.stage_timings || {}), productionMs: ms() - t0 },
      finalAttempt: final.finalAttempt || "main",
    });
    if (shippedQa) db.setQa(jobId, shippedQa);
    // Quality Director — assemble the cross-dimension quality summary (contrast
    // fixes, audio loudness, screenshot QA, asset/template scores, QA verdict) of
    // the SHIPPED cut and store it for the report card. Never throws.
    try {
      const raw = db.getRaw(jobId);
      db.setQualityReport(jobId, assembleQualityReport({
        jobDir, qa: shippedQa, creativeReview: raw && raw.creative_review, bestQa: final.bestQa,
      }));
    } catch (e) { console.warn(`[agents] quality report failed: ${e.message.slice(0, 100)}`); }
    console.log(`[agents] ${jobId} done — ${final.finalAttempt}, qa=${shippedQa?.pass === false ? "FAILED(delivered best attempt)" : shippedQa?.skipped ? "skipped" : "pass"}, cost=$${costs.totalCostUsd}`);
  } catch (err) {
    console.error(`[agents] ${jobId} graph failed: ${err.message}`);
    const costs = tracker.computeCosts();
    db.markFailed(jobId, err.message.slice(0, 2000), costs.llm.inputTokens, costs.llm.outputTokens, costs);
  }
}

// assetSearchAgent is exported for harness use only (server/scripts) — it is the
// node where asset acquisition, gap-fill and curation meet, and is worth driving
// in isolation without paying for a full render.
module.exports = { runProductionGraph, __test_assetSearchAgent: assetSearchAgent };
