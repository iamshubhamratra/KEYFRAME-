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
const { withBudget, attemptLlmComposition, composeWithThree, isAssetRich, mixAudioIntoVideo, fallbackQueriesFor, retimeScenesToVo } = require("../services/pipeline");
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
const { reviewAssets, summarizeReview } = require("../services/asset_director");

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
  const r = await generateStoryboard({ prompt: sbPrompt, duration: s.job.duration, orientation: s.job.orientation });
  s.tracker.addLlm({ inputTokens: r.tokensIn, outputTokens: r.tokensOut, stage: "storyboard" });
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
  const targets = (showcase.length ? showcase : script.scenes.slice(1, -1)).slice(0, 3);
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
        // Alternate scenes also pull a photo inset for variety.
        if (script.scenes.indexOf(scene) % 2 === 1) {
          needs.push({ type: "image", query: q, role: "inset", derived: true });
        }
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
  // Vectors get their OWN budget so a long photo list can't starve them — this
  // is what finally feeds the curated SVG library into films.
  const vectors = wants.filter((w) => w.need.type !== "video" && isVectorNeed(w.need)).slice(0, 8);
  const photos  = wants.filter((w) => w.need.type !== "video" && !isVectorNeed(w.need)).slice(0, 12 - videos.length);
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
    }).catch(() => null);
    if (!r) continue;
    // Skip an asset we've already used — byte-identical OR visually a duplicate
    // (a different re-encode/crop of the same picture), which MD5 alone missed.
    if (!isVideo) {
      const dup = await deduper.check(r.path, r.dhash);
      if (dup) {
        console.log(`[agents] dropped ${dup}-duplicate asset — query "${need.query}"`);
        try { fs.unlinkSync(r.path); } catch { /* noop */ }
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

  // CREATIVE DIRECTOR (default ON) — reviews EVERY asset (screenshots included:
  // it also ranks them by section), scores on six dimensions, assigns scenes,
  // caps prominent assets per scene, and tops-up empty scenes. Fail-open. The
  // plain keep/reject vision gate below stays as the CREATIVE_DIRECTOR=0 fallback.
  const cdEnabled = config.creativeDirector ? config.creativeDirector.enabled !== false : true;
  let kept = null;
  if (cdEnabled && (pinned.length + results.length)) {
    kept = await reviewAndCurate({
      jobId: job.id, storyboard: s.storyboard || null, script: s.script || null,
      brief: s.brief, subject: gateSubject, framePack: s.framePack,
      assets: [...pinned, ...results], tracker, jobDir, orientation: job.orientation,
    });
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
  const gated = kept || [...pinned, ...results];
  const directable = gated.filter((a) => a && a.type !== "video");
  if (directable.length && gateSubject) {
    try {
      const kindHint = (a) => {
        const src = String(a.source || "");
        if (src === "website") return "website screenshot";
        if (src === "iconify" || src.startsWith("library:")) return "flat vector/icon";
        if (/\.svg($|\?)/i.test(a.path || "")) return "svg vector";
        return null;
      };
      const dirs = await reviewAssets({
        assets: directable.map((a) => ({ absPath: path.join(jobDir, a.path), type: a.type, query: a.alt, kindHint: kindHint(a) })),
        subject: gateSubject, tracker,
      });
      dirs.forEach((d, i) => {
        const a = directable[i];
        if (d.kind) a.kind = d.kind;
        if (d.fit) a.fit = d.fit;
        if (d.focus) a.focus = d.focus;
        if (d.effect) a.effect = d.effect;
        if (d.quality) { a.quality = d.quality; if (d.quality === "low") a.lowQuality = true; }
      });
      console.log(`[agents] asset_director: ${summarizeReview(dirs)}`);
    } catch (e) {
      console.warn(`[agents] asset_director skipped: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  const assets = gated;
  db.setAssets(job.id, assets);
  console.log(`[agents] asset_search: ${assets.length} asset(s) (${assets.filter((a) => a.fromCache).length} from cache)`);
  return { assets };
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

  const voTask = Promise.all(script.scenes.map((sc) =>
    (sc.voiceover && sc.voiceover.trim())
      ? synthesizeFitted({ text: sc.voiceover, targetSec: sc.duration, voice, instructions, outputPath: path.join(audioDir, `vo-${sc.id}.mp3`), tracker })
          .then((r) => r ? { sceneId: sc.id, startSec: sc.start, durationSec: r.durationSec, sceneDurationSec: sc.duration, text: r.text, path: r.path, fallbackVoice: r.fallbackVoice || null } : null)
          .catch((e) => { console.warn(`[agents] vo ${sc.id} failed: ${e.message}`); return null; })
      : Promise.resolve(null)
  )).then((a) => a.filter(Boolean));

  // Cap SFX low — 6 whooshes/dings layered over per-scene VO + music read as
  // cluttered, overlapping audio. A few accents beat a wall of sound.
  const sfxWanted = [];
  for (const sc of script.scenes) for (const name of (sc.sfx || [])) if (sfxWanted.length < 3) sfxWanted.push({ name, startSec: sc.start });
  const sfxTask = Promise.all(sfxWanted.map((x, i) =>
    getSfx({ name: x.name, outputPath: path.join(audioDir, `sfx-${i}.mp3`), tracker })
      .then((p) => p ? { path: p, startSec: x.startSec, volume: 0.4 } : null).catch(() => null)
  )).then((a) => a.filter(Boolean));

  // Richer music query: fold the mood field into the query so the provider gets
  // genre/feel cues, not just a bare 2-word phrase (which returned off-genre SFX).
  const musicQuery = [script.music?.mood, script.music?.query]
    .map((x) => String(x || "").trim()).filter(Boolean).join(" ").slice(0, 80);
  const musicTask = (script.music?.query || script.music?.mood)
    ? fetchMusic({ query: musicQuery, outputPath: path.join(audioDir, "music.mp3"), tracker }).catch(() => null)
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
  // Composer dispatch. The user's per-video finish choice wins:
  //   compose_mode "premium"  → the LLM composition agent (remix)
  //   compose_mode "standard" → the deterministic scene-kit
  //   unset                   → the global USE_LLM_COMPOSER default
  // Either way the kit stays available as the fallback below.
  const useComposer = job.compose_mode === "premium"
    ? true
    : job.compose_mode === "standard"
      ? false
      : config.llm.useComposer !== false;
  if (job.compose_mode) console.log(`[agents] job ${job.id} finish=${job.compose_mode} → ${useComposer ? "LLM composer" : "scene-kit"}`);
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
      return { visual, usedFallback: false, finalAttempt: "three", effectiveDuration: effDur, sfxClips: sfxRepinned };
    }
    const visual = await withBudget(
      (signal) => attemptLlmComposition({
        storyboard, dims, jobDir, assets: s.assets || [], tracker,
        jobId: job.id, durationSec: effDur,
        label: s.qa ? "graph-repair" : "graph-main", abortSignal: signal,
        framePack: s.framePack, captionCues, remix: useComposer,
        // Standard finish gets the bounded LLM set-dressing pass (per-scene
        // layout variants, emphasis words, sanitized decor SVG clusters) — a
        // cheap fast-stage call that art-directs the deterministic kit, so
        // "standard" no longer means "no personalized art direction at all".
        dress: !useComposer,
        subject: s.brief?.subject || null,
      }),
      budget, "composition agent"
    );
    return { visual, usedFallback: false, finalAttempt: s.qa ? "qa-repair" : "main", effectiveDuration: effDur, sfxClips: sfxRepinned };
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
      return { visual: s.visual, usedFallback: false, finalAttempt: s.finalAttempt || "main", rendered: true, composerBudgetDead, effectiveDuration: effDur, sfxClips: sfxRepinned };
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
        });
        return { visual, usedFallback: false, finalAttempt: "scene-kit", rendered: true, composerBudgetDead, effectiveDuration: effDur, sfxClips: sfxRepinned };
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

// QA Agent node — verdict + loop control.
async function qaAgentNode(s) {
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
  }).catch((e) => {
    console.warn(`[agents] qa failed (${e.message.slice(0, 120)}); passing by default`);
    return { pass: true, issues: [], error: e.message };
  });
  return { qa: verdict, qaAttempts: (s.qaAttempts || 0) + 1 };
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
    composerBudgetDead: Annotation(),
  });

  // Node names must not collide with state channel names (LangGraph rule),
  // hence the _agent suffixes on storyboard/qa.
  const g = new StateGraph(S)
    .addNode("frame_selector", frameSelectorAgent)
    .addNode("storyboard_agent", storyboardAgent)
    .addNode("scene_planner", scenePlannerAgent)
    .addNode("asset_planner", assetPlannerAgent)
    .addNode("asset_search", assetSearchAgent)
    .addNode("voice_agent", voiceAgent)
    .addNode("composition", compositionAgent)
    .addNode("animation", animationAgent)
    .addNode("timeline", timelineAgent)
    .addNode("qa_agent", qaAgentNode)
    .addNode("repair", repairAgent);

  g.addEdge(START, "frame_selector");
  // Fan-out: three branches run in parallel.
  g.addEdge("frame_selector", "storyboard_agent");
  g.addEdge("frame_selector", "asset_planner");
  g.addEdge("frame_selector", "voice_agent");
  g.addEdge("storyboard_agent", "scene_planner");
  g.addEdge("asset_planner", "asset_search");
  // Join: composition needs the plan AND the assets.
  g.addEdge(["scene_planner", "asset_search", "voice_agent"], "composition");
  g.addEdge("composition", "animation");
  // Join: the timeline mix needs the render AND the voice branch.
  g.addEdge("animation", "timeline");
  g.addEdge("timeline", "qa_agent");
  g.addConditionalEdges("qa_agent", (s) => {
    const repairsLeft = (s.qaAttempts || 0) <= (Number(config.qa?.maxRepairs) || 1);
    // No repair lap when the composer already failed on budget (402/daily cap)
    // — the recompose would hit the identical wall and just burn time.
    if (!s.qa?.pass && repairsLeft && !s.usedFallback && !s.composerBudgetDead) {
      console.log(`[agents] QA failed — repair lap ${s.qaAttempts}`);
      return "repair";
    }
    if (!s.qa?.pass && s.composerBudgetDead) {
      console.log(`[agents] QA failed but composer budget is exhausted — delivering best attempt (no repair lap)`);
    }
    return END;
  }, ["repair", END]);
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

  const tracker = new UsageTracker();
  const t0 = ms();
  const script = normalizeScript(job.script, { targetDuration: job.duration });

  try {
    const graph = await buildGraph();
    const final = await graph.invoke(
      { job, jobDir, tracker, brief: job.brief, script, qaAttempts: 0 },
      { recursionLimit: 40 }
    );

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
    if (final.qa) db.setQa(jobId, final.qa);
    console.log(`[agents] ${jobId} done — ${final.finalAttempt}, qa=${final.qa?.pass === false ? "FAILED(delivered best attempt)" : final.qa?.skipped ? "skipped" : "pass"}, cost=$${costs.totalCostUsd}`);
  } catch (err) {
    console.error(`[agents] ${jobId} graph failed: ${err.message}`);
    const costs = tracker.computeCosts();
    db.markFailed(jobId, err.message.slice(0, 2000), costs.llm.inputTokens, costs.llm.outputTokens, costs);
  }
}

module.exports = { runProductionGraph };
