// The KEYFRAME agent graph — LangGraph orchestration of the 12 agents.
//
//   INTAKE GRAPH      brief → script  (pauses at script_review via the API)
//
//   PRODUCTION GRAPH                  ┌─ storyboard ── scene_planner ─┐
//     frame_selector ── fan-out ──────┼─ asset_search ────────────────┼── composition ── animation ─┐
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

// Per-node wall clock, keyed by job id. Filled by the timed() wrapper in the graph
// builder and drained onto the job record when the run finishes (see markDone).
// Kept at module scope because the compiled graph is shared across jobs.
const NODE_MS = new Map();

// Drain one job's node timings into a plain, sorted, human-readable object and
// release the entry (the map must not grow for the life of the process). Also
// logs the table, because the first question after "why is it slow" is always
// "slow WHERE", and the answer should be in the run log without a DB lookup.
//
// `nodes` sums to MORE than productionMs whenever the graph fans out — four nodes
// running concurrently each bank their own wall clock. That is the point: a node
// whose time is hidden inside a fan-out is free, and one on the critical path is
// not, and comparing the sum to the total is how you tell them apart.
function drainNodeTimings(jobId, totalMs) {
  const m = NODE_MS.get(jobId);
  NODE_MS.delete(jobId);
  if (!m) return null;
  const rows = Object.entries(m)
    .map(([node, r]) => ({ node, ms: Math.round(r.ms), calls: r.calls }))
    .sort((a, b) => b.ms - a.ms);
  const sum = rows.reduce((a, r) => a + r.ms, 0);
  const pct = (v) => (totalMs > 0 ? ((v / totalMs) * 100).toFixed(0) : "?");
  console.log(`[agents] node wall clock (total ${(totalMs / 1000).toFixed(1)}s, node sum ${(sum / 1000).toFixed(1)}s — sum > total means the fan-out is working):`);
  for (const r of rows) {
    console.log(`[agents]   ${r.node.padEnd(24)} ${(r.ms / 1000).toFixed(1).padStart(7)}s  ${String(pct(r.ms)).padStart(3)}%${r.calls > 1 ? `  x${r.calls}` : ""}`);
  }
  const out = {};
  for (const r of rows) out[r.node] = r.calls > 1 ? { ms: r.ms, calls: r.calls } : r.ms;
  return out;
}
const fallbackLog = require("../services/fallback_log");
const { showcaseTargets } = require("../services/scene_role");
const db = require("../db");
const { UsageTracker } = require("../services/usage");
const { generateBrief } = require("../services/brief");
const { generateScript, normalizeScript } = require("../services/script");
const { generateStoryboard } = require("../services/storyboard");
const frameRegistry = require("../services/frame_registry");
const { withBudget, attemptLlmComposition, composeWithThree, isAssetRich, mixAudioIntoVideo, fallbackQueriesFor, retimeScenesToVo, contrastFixPass } = require("../services/pipeline");
const { assembleQualityReport } = require("../services/quality_report");
const { acquire, hasProviderFor, makeImageDeduper } = require("../services/asset_sources");
// The same subject reducer + camera/adjective stop list asset_sources applies
// before it searches a provider (asset_sources/query_terms.js). Deriving queries
// through it here means the string the planner writes is the string that is
// actually searched — not one the provider silently strips down afterwards.
const { subjectQuery, STOP: DIRECTION_STOP } = require("../services/asset_sources/query_terms");
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
const { captureTopicShots, recaptureForScenes, mergeShots } = require("../services/screenshot_director");
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
  // CAN THE PACK ACTUALLY SHOW THE PICTURES THIS JOB HAS?
  //
  // Selection matched TONE and nothing else, and tone says nothing about how many
  // pictures a template draws. Measured by rendering every bundled template with
  // the same 17 real assets and counting the images that actually PAINT, the
  // spread is not marginal — jungle-wild puts 13 on screen across 8 of its 9
  // beats, dragboard puts ZERO. So a website job that captured six screenshots
  // could be tone-matched onto a template with one picture shape and show one of
  // them, which is the "why is it not using my screenshots" complaint in full.
  //
  // Only auto-picked packs are ever re-chosen: an explicit user pick is honoured
  // even when it cannot carry the assets (their film, their call) — it just says
  // so in the log.
  const shots = (s.job.website_screenshots || []).length;
  if (shots >= 3) {
    const cap = mediaCapacity();
    const mine = cap[framePack];
    // CALIBRATED AGAINST THE MEASURED DISTRIBUTION, not against a guess. All 139
    // bundled packs rendered with the same 17 assets: mean 4.3 images, 37% of
    // beats carrying media, and the tails are what matter — 16 packs put 10+ on
    // screen, while 45 put fewer than 3 and 5 (type-riot, lumen, dragboard,
    // keystroke, serif-manifesto) put NONE. The pack this complaint came from,
    // bluesite, renders 2.
    //
    // The trigger is deliberately the bottom tail (STARVING = under 3), not "less
    // than the job's screenshot count": almost every pack is under six, so the
    // looser rule would have funnelled every website film onto the single highest
    // scorer and undone the pack variety the identity work exists to protect.
    const STARVING = 3, RICH = 8;
    if (mine && mine.images < STARVING) {
      if (explicit) {
        console.warn(`[agents] frame_selector: "${framePack}" renders only ~${mine.images} image(s) but this job has ${shots} screenshot(s) — honouring the explicit pick; most captures will not be shown`);
      } else {
        // Rotate through the whole rich tier rather than always taking the top
        // scorer, so two website films in a row do not come out on the same pack.
        const rich = Object.entries(cap)
          .filter(([name, v]) => v.images >= RICH && frameRegistry.resolvePack(name) === name)
          .sort((a, b) => b[1].images - a[1].images);
        if (rich.length) {
          let h = 5381;
          const key = String(s.job.id || framePack);
          for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
          const [name, v] = rich[h % rich.length];
          console.log(`[agents] frame_selector: "${framePack}" renders only ~${mine.images} image(s) for ${shots} screenshot(s) → switching to "${name}" (~${v.images} images, ${v.mediaBeats}/${v.beats} beats carry media)`);
          return { framePack: name };
        }
      }
    }
  }
  return { framePack };
}

// Measured per-pack rendered media capacity (server/framecheck/media-capacity.json,
// written by `npm run audit:capacity`). Missing file → an empty map, which makes
// every check above a no-op: selection must never depend on a generated artifact
// being present.
let _capacityCache = null;
function mediaCapacity() {
  if (_capacityCache) return _capacityCache;
  try {
    const p = path.join(__dirname, "..", "..", "framecheck", "media-capacity.json");
    _capacityCache = JSON.parse(fs.readFileSync(p, "utf8")).packs || {};
  } catch { _capacityCache = {}; }
  return _capacityCache;
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
//
// THE QUERY MUST DESCRIBE THE SUBJECT, NOT THE CAMERA. Every derived query used
// to be built from `scene.visualDirection` — which is motion/camera direction
// ("Chaotic app windows explode outward in layered planes") — and the documented
// fallback to scene.headline/subtext never fired on a script scene at all,
// because SceneSchema (services/script.js) has no such fields: a script scene is
// {id,start,duration,purpose,voiceover,onScreenText,visualDirection,assetNeeds,
// sfx,musicCue}. Measured on a shipped film, the beat "Design. Code. AI. All
// disconnected." was handed a stock photo of "a moody silhouette of a man in
// backlighting and fog" — a faithful render of the direction line and a picture
// of nothing the viewer was being told about. Derive from what the viewer HEARS
// (voiceover) and READS (onScreenText) plus the beat's purpose; the direction is
// only ever a trailing style/setting hint.
//
// Each scene must also ask a DIFFERENT question of the stock library. Taking the
// first four words of every visualDirection produced the same string over and
// over, because the script describes neighbouring scenes in neighbouring
// language: one measured run fetched all four of its photos against a single
// query ("chatgpt chat ui on smartphone rapid fire task chips" -> 0.jpg…3.jpg),
// so the pool was not just small, it was four variations of one search.
//
// Returns a stateful deriver: words already spent on an earlier scene are
// skipped, so later scenes reach further into their own copy instead of
// repeating the opening.
function makeQueryDeriver(STOP) {
  const usedWords = new Set();
  const usedQueries = new Set();
  // Per-scene word pools, keyed by the scene OBJECT (script scene ids are unique
  // but callers pass bare scene shapes too) so the three role variants below all
  // partition ONE pool instead of each re-claiming the same opening words.
  const perScene = new Map();
  const dedupe = (list) => { const out = []; for (const w of list) if (w && !out.includes(w)) out.push(w); return out; };
  // Both stop lists: the caller's script-language fillers plus query_terms' own
  // camera/motion/adjective list, so "pans", "cinematic" or "crisp" can never
  // become the subject of a search.
  const words = (t) => dedupe((String(t || "").toLowerCase().match(/[a-z][a-z-]{2,}/g) || [])
    .filter((w) => !STOP.has(w) && !DIRECTION_STOP.has(w)));
  // Unclaimed words first, the rest after — a pool is never emptied (returning
  // null costs the scene its asset), only reordered.
  const freshFirst = (list) => [...list.filter((w) => !usedWords.has(w)), ...list.filter((w) => usedWords.has(w))];
  const partsFor = (scene) => {
    if (perScene.has(scene)) return perScene.get(scene);
    // Spoken + on-screen copy IS the subject. headline/subtext are read too
    // because storyboard-shaped scenes carry them; a script scene simply has
    // none, which is why they were dead weight as a fallback.
    const subject = freshFirst(words(`${scene.voiceover || ""} ${(scene.onScreenText || []).join(" ")} ${scene.headline || ""} ${scene.subtext || ""}`));
    const hint = freshFirst(words(scene.visualDirection));
    const parts = { subject, hint, purpose: words(scene.purpose)[0] || "" };
    perScene.set(scene, parts);
    // Spend what this scene is about, so the next scene reaches for its own words.
    subject.slice(0, 3).forEach((w) => usedWords.add(w));
    hint.slice(0, 2).forEach((w) => usedWords.add(w));
    return parts;
  };
  // ONE SCENE, THREE FETCHES, THREE QUESTIONS. A scene with no authored
  // assetNeeds pushes a background, an inset and an icon need — and all three
  // used to carry the SAME derived string, so the deduper (MD5 + dHash) killed
  // the near-identical results and the scene ended up with fewer assets than it
  // asked for. Ask each role its own question: where we are, what the thing is,
  // what the idea is.
  return (scene, role) => {
    const { subject, hint, purpose } = partsFor(scene);
    let picked;
    if (role === "inset") {
      picked = subject.slice(0, 2);                                     // the concrete thing being talked about
    } else if (role === "icon") {
      // The IDEA, not the object — an icon of the inset's noun is the same
      // picture twice, once in vector form.
      picked = dedupe([purpose, subject[2] || subject[1] || hint[0]]);
    } else {
      picked = dedupe([subject[0], ...hint.slice(0, 2)]);                // the subject placed in the beat's setting/mood
    }
    if (picked.length < 2) picked = dedupe([...picked, ...subject, ...hint]).slice(0, 4);
    if (picked.length < 2) return null;
    // Strip through the same reducer asset_sources applies before it searches.
    let q = subjectQuery(picked.join(" ")) || picked.join(" ");
    // A collision after all that means the scenes really are the same; vary the
    // query rather than issue a duplicate search that returns the same pictures.
    if (usedQueries.has(q)) {
      const inQ = q.split(" ");
      const spare = [...subject, ...hint].find((w) => !inQ.includes(w));
      if (spare) q = `${q} ${spare}`;
    }
    // If it STILL collides the scenes are genuinely the same. Ship the duplicate
    // rather than returning null: dropping the need would cost the film a whole
    // asset, and the pool being too small is the complaint this is fixing.
    usedQueries.add(q);
    return q;
  };
}

async function assetPlannerAgent(s) {
  const { job, script } = s;
  const videoOk = hasProviderFor("video");
  const shots = (job.website_screenshots || []).filter((p) => { try { return fs.existsSync(p); } catch { return false; } });
  // `purpose` is free text (SceneSchema allows any 2-24 chars) and this used to
  // match it by EXACT STRING. A model that wrote "benefit", "solution" or "the
  // problem" matched nothing, so that scene silently stopped being a screenshot
  // target — invisible, because nothing errors and the film just stops showing
  // the product where the script said to. showcaseTargets derives the role, and
  // carries the same showcase-else-mid-scenes fallback this site had inline.
  // Up to 8 scenes carry a pinned real screenshot (3 -> 5 -> 8; user: "collect as
  // much website or product screenshot you can, at least 6-7"). Ingest now grabs a
  // hero plus five deep sections and the director matches up to six internal
  // pages, so the pins have to be able to surface them — a smaller budget just
  // threw captured screenshots away.
  const targets = showcaseTargets(script).slice(0, 8);
  const screenshotPlan = shots.slice(0, targets.length).map((src, i) => ({ kind: "screenshot", src, scene: targets[i], index: i }));
  const pinnedSceneIds = new Set(screenshotPlan.map((p) => p.scene.id));

  // Derive a concrete image query from what the scene SAYS and SHOWS when the
  // script asked for nothing — substance scenes should never go imageless.
  const STOP = new Set(["the", "a", "an", "with", "and", "of", "in", "on", "over", "into", "across", "as", "to", "that", "then", "while", "for", "is", "are", "we", "see", "scene", "text", "headline", "screen"]);
  const deriveQuery = makeQueryDeriver(STOP);

  const VECTOR_ROLES = new Set(["icon", "texture", "vector"]);
  const roleOf = (n) => String(n.role || "").toLowerCase();

  const wants = [];
  for (const scene of script.scenes) {
    const needs = [...(scene.assetNeeds || [])];
    // Gap-fill: EVERY scene with no asset request gets a derived one (hook/cta
    // included — dense visuals everywhere beats sparse pure-typography beats).
    if (!needs.length && !pinnedSceneIds.has(scene.id)) {
      const qBackground = deriveQuery(scene, "background");
      if (qBackground) needs.push({ type: "image", query: qBackground, role: "background", derived: true });
      // EVERY gap-filled scene also pulls a photo inset (was alternate scenes
      // only) — density first; the planner caps below still bound the total.
      // Its own query, not the background's: two fetches of one string come back
      // as one picture after the dedup pass, which is how a scene that asked for
      // two assets rendered with one.
      const qInset = deriveQuery(scene, "inset");
      if (qInset) needs.push({ type: "image", query: qInset, role: "inset", derived: true });
    }
    // VECTOR GAP-FILL — the curated 2k+ SVG library was effectively never tapped
    // because nothing ever requested an icon/vector role. Guarantee EVERY scene
    // pulls one on-brand vector/icon so the composer always has real graphic
    // material to layer (not just photos), satisfying the vector cadence mandate.
    if (!needs.some((n) => VECTOR_ROLES.has(roleOf(n)))) {
      const q = deriveQuery(scene, "icon") || (scene.assetNeeds && scene.assetNeeds[0] && scene.assetNeeds[0].query) || null;
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
  const { job, jobDir, tracker } = s;
  // THE PLANNER IS INLINED, NOT A NODE — LangGraph IS A BSP ENGINE.
  //
  // asset_planner was its own node feeding asset_search, which reads as a clean
  // split but costs a full SUPERSTEP: LangGraph runs supersteps in lockstep, so
  // asset_search could not start until every node in the planner's superstep had
  // finished — including storyboard_agent, an LLM call it does not consume.
  // asset_search is the LONGEST node in the graph (screenshot capture, stock
  // fetch, screenshot QA, the vision pass), so the longest work in the pipeline
  // was queued behind an LLM whose output it never reads.
  //
  // Planning is pure, synchronous and needs only `script` + `job` — the same
  // inputs asset_search already has — so it belongs at the top of this function
  // and the graph wires frame_selector straight here.
  const { assetPlan } = await assetPlannerAgent(s);
  const anchor = topicAnchor(job, s.brief);
  if (anchor) console.log(`[agents] asset_search topic anchor: "${anchor}"`);
  // Pack-aware styling: photo queries get the pack's look, icons get its accent
  // color + matching Iconify collection family. Bridges to the Phase 3 manifest.
  const packStyle = styleFor(s.framePack);
  const packTokens = s.framePack ? frameRegistry.getPackTokens(s.framePack) : null;
  const iconColor = iconColorFor(packTokens);
  if (packStyle.photoMod) console.log(`[agents] asset_search pack style: "${packStyle.photoMod}" · icons=${packStyle.iconStyle}${iconColor ? ` (${iconColor})` : ""}`);
  // Progress is reported AFTER the fetch loop now, not here. asset_search shares a
  // superstep with storyboard_agent, so announcing "assets" on entry made the UI
  // (and eta.js, which reads the stage) jump to a later stage while the storyboard
  // was still being written — a progress bar that goes backwards.
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
  // (the vector-source alternation is per-slot now — see slots[].vectorIndex)
  // Slots the lookup could NOT fill. Every `continue` below leaves a scene without
  // the asset it asked for; recording them lets the gap-filler generate an
  // on-brief image for exactly those holes instead of the film rendering empty
  // or repeating another scene's picture.
  const misses = [];
  // FETCH IN PARALLEL. This loop was strictly serial, which was affordable only
  // while the Pixabay API answered in ~300ms. With that key rejected every lookup
  // falls through to the headless page-scrape fallback at ~12s each — measured —
  // so a 13-asset film needed ~2.5 minutes of nothing but waiting, and a real job
  // came back with 3 of its 13 requested pictures. The scenes left unfilled are
  // then dressed with whatever is lying around, which is how a beat about grocery
  // delivery ends up under a stock gradient.
  //
  // Concurrency 4 rather than unbounded: each fallback fetch can spawn a headless
  // browser, and the providers rate-limit (openverse returned 429 during a burst
  // in testing). Order is preserved by pre-assigning every slot its index, so the
  // curated-library exclusions and dedup below behave exactly as before.
  const FETCH_CONCURRENCY = 4;
  const slots = assetPlan.searches.map((w) => {
    const isVideo = w.need.type === "video";
    return { ...w, isVideo, relPath: isVideo ? `assets/videos/${iVid++}.mp4` : `assets/images/${iImg++}.jpg` };
  });
  // The library-exclusion set and the vector-source alternation are shared mutable
  // state that a parallel walk would race on. Both only need to be DIVERSE, not
  // exact, so each slot takes its alternation from its own index and the exclusion
  // set is still added to as results land.
  slots.forEach((sl, i) => { sl.vectorIndex = i; });
  let cursor = 0;
  const fetched = new Array(slots.length).fill(null);
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, slots.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= slots.length) return;
      fetched[i] = await fetchOne(slots[i]).catch(() => null);
    }
  }));
  for (let i = 0; i < slots.length; i++) await commitOne(slots[i], fetched[i]);
  db.setProgress(job.id, "assets");

  // One slot's acquisition — pure fetch, no shared state written.
  async function fetchOne({ scene, need, isVideo, relPath, vectorIndex }) {
    // type:"icon" OR role icon/texture -> want a curated vector. Do NOT append
    // "icon flat" to the query: that suffix trips the curated library's 0.5
    // relevance gate and zeroes its SVG hits — kindPref:"vector" already routes
    // to the SVG library on the concrete subject query.
    const isIcon = need.type === "icon" || ["icon", "texture"].includes(String(need.role || "").toLowerCase());
    // Anchor PHOTO/background queries to the video's subject so a derived
    // direction like "scalable growth" becomes "beauty cosmetics scalable
    // growth" — on-topic stock instead of trading charts. Icons/vectors keep
    // their concrete query (anchoring an abstract shape rarely helps).
    // ICONS GET THE TOPIC TOO. This used to read `(!isIcon && anchor)` — icons and
    // textures were deliberately exempt on the theory that "anchoring an abstract
    // shape rarely helps". The opposite is true, because `need.query` for these
    // slots is derived from the scene's visualDirection, i.e. CAMERA LANGUAGE, and
    // stripping direction words can only SUBTRACT — nothing puts the subject back.
    // Measured on a real cold-brew-coffee film: "slow push through glossy" fetched
    // a strikethrough glyph, "three whip pan beats" a 3-D icon, "hero can locks
    // dead" a GAS CAN. Iconify splits the query and searches each term separately,
    // nouns first, so leading with the topic makes it try the subject before any
    // stray direction word survives to become the match.
    const baseQuery = anchor ? `${anchor} ${need.query}` : need.query;
    // Photos also carry the pack's visual style ("neon synthwave" for vapor-
    // chrome) so stock matches the look; the un-styled query stays as a fallback
    // so an over-narrow phrase still finds SOMETHING.
    const query = (!isIcon && packStyle.photoMod) ? `${baseQuery} ${packStyle.photoMod}` : baseQuery;
    const r = await acquire({
      query,
      // NEVER BROADEN BY DELETING THE TOPIC. `need.query` on its own was a rung on
      // this ladder, and acquire() sweeps EVERY variant against the cache before it
      // touches a provider — so the one topic-free string got two full sweeps ahead
      // of the broadest on-topic one, and whatever it hit got cached under that
      // query and reused. Broaden by dropping DIRECTION words instead; the anchor
      // alone is the widest rung we are willing to search.
      // The cache must not hand back an image that is merely spelled like the
      // query — it has to be about the topic. See local_db.search.
      subject: anchor || undefined,
      fallbackQueries: [...new Set([
        baseQuery,
        ...fallbackQueriesFor(query).map((q) => (anchor && !q.includes(anchor) ? `${anchor} ${q}` : q)),
        ...(anchor ? [anchor] : [need.query]),
      ])],
      type: isVideo ? "video" : "image",
      orientation: job.orientation, outputPath: path.join(jobDir, relPath), tracker,
      kindPref: isVideo ? undefined : (isIcon ? "vector" : kindPrefFor(need.role)),
      excludeIds: usedLibraryIds,
      curatedOnly: forceCurated && !isVideo && !isIcon,
      iconColor: isIcon ? iconColor : undefined,
      iconStyle: isIcon ? packStyle.iconStyle : undefined,
      styleKeywords: !isIcon ? packStyle.keywords : undefined,
      // Interleave Iconify- and Pixabay-first across vector slots (see vectorIndex).
      vectorPrefer: isIcon ? (vectorIndex % 2 === 0 ? "pixabay" : "iconify") : undefined,
    }).catch(() => null);
    return r;
  }

  // Commit one fetched result IN ORDER — dedup, exclusion set and `results` are
  // shared state, so they are applied on a single pass after the parallel fetch
  // rather than raced inside it. Identical bookkeeping to the old serial loop.
  async function commitOne({ scene, need, isVideo }, r) {
    if (!r) {
      // No provider had anything for this query — the scene's slot stays empty.
      misses.push({ kind: "lookup", scene, need, query: need.query });
      return;
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
        return;
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
    // SUBSTRING, not equality: local_db materializes a cache hit with source
    // "cache:pixabay", which an exact-match Set never recognized — so a stock
    // photo that happened to be in the fetch cache skipped the vision gate
    // entirely and shipped unchecked, and the cache is where a repeat topic's
    // assets all come from. creative_director.js:49-52 does the same test.
    const STOCK_SOURCES = ["pixabay", "openverse", "pexels", "pixabay_scrape"];
    const srcName = String(r.source || "").toLowerCase();
    const isWebStock = STOCK_SOURCES.some((p) => srcName.includes(p));
    if (isWebStock) pendingGate.push({ resultObj, absPath: r.path, type: isVideo ? "video" : "image", query: need.query });
  }

  const gateSubject = (s.brief?.subject || anchor || "").trim();

  // Topic page shots land here: a scene claimed by a topic shot drops its
  // landing-page pin (the specific page beats the homepage).
  // SCREENSHOT QA — vision-inspect every capture and drop the broken ones
  // (error pages, consent modals, bot-walls, blanks, half-renders) BEFORE the
  // creative director ranks them and the composer frames one as the hero.
  const beforeGate = mergeShots(await topicTask, pinned);
  // Only a BROKEN capture is worth re-shooting. A clean shot that merely had no
  // free scene is now unpinned into the pool by the gate, not lost — retrying
  // that would spend a capture to solve a problem that no longer exists.
  const brokenScenes = [];
  let gatedShots = await qaGateScreenshots({
    assets: beforeGate, jobDir,
    subject: gateSubject, script: s.script, tracker,
    onDrop: (d) => { if (d && d.recoverable && d.sceneId) brokenScenes.push(String(d.sceneId)); },
  });

  // A DROPPED CAPTURE IS A LOST REAL SCREENSHOT. The gate deletes broken shots
  // (login wall, consent overlay, error page) and nothing used to try again, so
  // stock art filled the hole — a generic photo standing in for the product.
  // Measured on a finished film: kept 2, dropped 2. Capture a DIFFERENT page for
  // the orphaned scenes, then hold the replacements to the same gate.
  try {
    const lost = [...new Set(brokenScenes)];
    if (lost.length) {
      const avoid = beforeGate.map((a) => a && a.sourceUrl).filter(Boolean);
      const retried = await recaptureForScenes({
        job, script: s.script, jobDir, sceneIds: lost, avoidUrls: avoid,
        topic: gateSubject, tracker, signal: s.abortSignal,
      });
      if (retried.length) {
        const okRetried = await qaGateScreenshots({
          assets: retried, jobDir, subject: gateSubject, script: s.script, tracker,
        });
        if (okRetried.length) {
          console.log(`[agents] screenshot retry recovered ${okRetried.length}/${lost.length} dropped scene(s)`);
          gatedShots = mergeShots(gatedShots.concat(okRetried), []);
        } else {
          console.log(`[agents] screenshot retry: ${retried.length} replacement(s) also failed QA`);
        }
      }
    }
  } catch (e) {
    console.warn(`[agents] screenshot retry skipped (${String(e && e.message || e).slice(0, 120)})`);
  }
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
      // BY DESIGN, NOT BY ACCIDENT: asset_search now runs in the SAME superstep
      // as storyboard_agent (see the note at the top of this function), so the
      // storyboard does not exist yet. The Creative Director is script-keyed —
      // script and storyboard share the "s1".."sN" id namespace, and an asset
      // whose scene id finds no match falls through to the composer's affinity
      // passes, i.e. degrades to undirected placement rather than mis-pinning.
      // Passing null states that; reading an undefined channel would not.
      jobId: job.id, storyboard: null, script: s.script || null,
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
  unpinIrrelevant(gated);
  const assets = gated;
  db.setAssets(job.id, assets);
  console.log(`[agents] asset_search: ${assets.length} asset(s) (${assets.filter((a) => a.fromCache).length} from cache)`);
  return { assets };
}

// THE SCRIPT ALREADY WRITES THE MUSIC CURVE — NOTHING WAS READING IT.
//
// Every scene the script agent emits carries a `musicCue`
// (intro > build > build > steady > lift > steady > lift > lift > outro on a real
// job). `audio_mix` has supported a per-scene bed envelope all along, and
// `mixAudioIntoVideo` already converts a scene-indexed one to seconds — but only
// `pipeline.js` ever set it, from the audio director, and the audio director runs
// exclusively on /api/generate. The web app posts to /api/projects, so every film
// it makes gets a FLAT bed: the same volume under the hook, the proof and the CTA.
// That is most of "the BGM doesn't match the video" — not the track choice, the
// fact that the music never moves with the film.
//
// Volumes stay inside the same VO-aware band the audio director clamps to, so the
// bed still sits under the narration; this only shapes it.
const CUE_GAIN = { intro: 1.15, build: 1.0, steady: 0.75, lift: 1.3, drop: 1.35, outro: 1.2 };
function musicEnvelopeFromScript(script, hasVoice) {
  const scenes = (script && Array.isArray(script.scenes)) ? script.scenes : [];
  if (scenes.length < 2) return null;
  const base = hasVoice ? 0.11 : 0.22;
  const lo = hasVoice ? 0.06 : 0.12, hi = hasVoice ? 0.16 : 0.32;
  const env = [];
  let prev = null;
  scenes.forEach((sc, i) => {
    const cue = String(sc.musicCue || "").toLowerCase().trim();
    const gain = CUE_GAIN[cue];
    if (gain == null) return;
    const volume = Math.round(Math.min(hi, Math.max(lo, base * gain)) * 1000) / 1000;
    // Only record where the bed actually CHANGES — a run of identical points is
    // a flat bed with extra steps, and envelopeToSeconds needs >=2 real points.
    if (prev !== null && volume === prev) return;
    prev = volume;
    env.push({ scene: i, volume });
  });
  return env.length >= 2 ? env.slice(0, 12) : null;
}

// A SCENE PIN IS A PROMISE THAT THE PICTURE IS ABOUT THE SCENE.
//
// `clipRelevance` — a local image<->subject probability the Creative Director
// already computes for every still — was wired in as a RANKING nudge only
// (`+ clipRelevance * 30` in three composers). A pin bypasses ranking entirely:
// both engines take `byScene`/`pinned` before they look at the pool, so a score
// of 0.006 changes nothing and the picture is shown regardless.
//
// Measured on a shipped Flipkart film. `websiteImageAssets` pins the site's own
// images to showcase scenes in ARRIVAL ORDER with no relevance test at all, and
// ingest had scraped the page's decorative backgrounds, so:
//   s5 "Flipkart Minutes. Groceries and gadgets in a flash."
//      -> siteimg_1.jpg, CLIP 0.005, seen by the vision pass as
//         "a simple orange to light peach horizontal gradient background"
//   s6 "Flipkart Kilos. Your online grocery supermarket."
//      -> siteimg_2.jpg, CLIP 0.006, "orange gradient with two hot air balloons"
//   s8 "Over two hundred million users since two thousand seven."
//      -> 9.jpg, CLIP 0.09, "flat line-art of a laptop and smartphone with charts"
// That is the "the script is about one thing and the asset is another" report,
// and the signal that catches all of it was sitting on the asset unused.
//
// The pin is dropped, not the asset: an unpinned image stays in the free pool as
// generic material a composer may still place, ranked below everything relevant.
// Screenshots and the logo are exempt — owner content is judged on page-topic
// match by the screenshot director, not by pixel similarity to a subject string.
//
// 0.10 was too low to be a floor at all: the Creative Director's own prompt
// calls anything under 0.15 "LOW — likely off-topic" (system_creative_director.md),
// so a threshold below that admitted exactly the pictures the prompt tells the
// model to distrust. Measured on shipped job prrx6lno98: an image at 0.119 whose
// vision verdict read "not ok" kept its pin, because 0.119 >= 0.10.
const PIN_RELEVANCE_FLOOR = 0.25;
// …AND THE FILM'S SUBJECT IS NOT THE SCENE'S SUBJECT. `clipRelevance` scores a
// picture against the WHOLE FILM, so on a shopping film a supermarket photo
// scores 0.499 and clears any subject-level floor — while being nothing to do
// with the beat it was pinned to. The Creative Director now also scores each pin
// against ITS OWN SCENE LINE (`clipSceneRelevance`), and that number separates
// the two cases cleanly. Measured across three shipped films:
//   0.897 0.884 0.999 0.94 0.967 0.865 0.979 0.886  — the pictures that belonged
//   0.059 0.092 0.061                               — bananas under "Everything
//                                                     you need. One place.", a
//                                                     "BANK OFFER" marquee, a
//                                                     stray icon
// so the floor sits well under the good cluster and well over the bad one.
// PAGE CAPTURES ARE STILL EXEMPT (below): the screenshot director picks those by
// page topic, and a pricing page legitimately shares few pixels with its words.
const PIN_SCENE_FLOOR = 0.12;
function unpinIrrelevant(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const dropped = [];
  for (const a of list) {
    if (!a || a.sceneId == null) continue;
    const owner = String(a.source || "") === "website" || a.kind === "screenshot" || a.kind === "logo";
    if (owner) continue;
    const sceneRel = typeof a.clipSceneRelevance === "number" ? a.clipSceneRelevance : null;
    if (sceneRel !== null && sceneRel < PIN_SCENE_FLOOR) {
      dropped.push(`${String(a.path).split("/").pop()}@${a.sceneId} (scene ${sceneRel.toFixed(3)})`);
      a.sceneId = null;
      a.startSec = undefined;
      a.durationSec = undefined;
      if (a.cdProminence !== "background") a.cdProminence = "background";
      continue;
    }
    // NO CLIP SCORE IS NOT A PASS. `typeof !== "number" -> continue` meant every
    // asset the probe never scored (it runs on stills only, and fails open) kept
    // its pin untested. Without a number, the only evidence a pin can stand on is
    // the vision pass having looked at the picture and approved it.
    const clipRel = typeof a.clipRelevance === "number" ? a.clipRelevance : null;
    if (clipRel === null ? a.visionOk === true : clipRel >= PIN_RELEVANCE_FLOOR) continue;
    dropped.push(`${String(a.path).split("/").pop()}@${a.sceneId} (${clipRel === null ? "unscored, unverified" : clipRel.toFixed(3)})`);
    a.sceneId = null;
    a.startSec = undefined;
    a.durationSec = undefined;
    // It failed the topic test, so it must not be anyone's hero either.
    if (a.cdProminence !== "background") a.cdProminence = "background";
  }
  if (dropped.length) {
    console.log(`[agents] relevance floor: unpinned ${dropped.length} off-topic asset(s) (below ${PIN_RELEVANCE_FLOOR}, or unscored and unverified) — ${dropped.join(", ")}`);
  }
  return list;
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
  // TWO PROBLEMS THIS LOOP USED TO HAVE, both of which read as "the SFX aren't
  // landing" rather than as missing SFX:
  //
  // 1. EVERY cue was stamped at `sc.start`. The script may give a scene two
  //    (`["sparkle","ding"]` on a stat beat), and both were mixed at the identical
  //    timestamp — they arrive as one smeared transient instead of a hit and a
  //    landing. A scene's second cue now lands ~55% in, on the beat where its
  //    content actually resolves, clamped inside the scene.
  // 2. The cap was applied in SCENE ORDER, so once it was reached the rest of the
  //    film got nothing: a 12-scene video spent its whole budget on the first six
  //    beats and ran silent from the halfway mark. Cues are taken in PASSES — every
  //    scene's first cue before any scene's second — so the budget spreads across
  //    the whole runtime.
  // The cue is carried as sceneId + a FRACTION of the scene, not as an absolute
  // second, because every scene start moves later: retimeScenesToVo stretches
  // each scene to contain its measured narration. The repin step in
  // compositionAgent maps a cue back through `startMap`, which is keyed on the
  // scene's ORIGINAL start — so an absolute mid-scene time is not in the map and
  // would silently keep its pre-retime value, drifting off the beat it was
  // written for. A fraction re-resolves against the scene's final start+duration.
  const sfxWanted = [];
  for (let pass = 0; pass < 2; pass++) {
    for (const sc of script.scenes) {
      const name = (sc.sfx || [])[pass];
      if (!name || sfxWanted.length >= sfxCap) continue;
      const frac = pass === 0 ? 0 : 0.55;
      const d = Math.max(0.8, Number(sc.duration) || 2);
      sfxWanted.push({
        name, sceneId: sc.id, offsetFrac: frac,
        startSec: Math.round(((Number(sc.start) || 0) + Math.min(d - 0.4, d * frac)) * 10) / 10,
      });
    }
  }
  sfxWanted.sort((a, b) => a.startSec - b.startSec);
  const sfxTask = Promise.all(sfxWanted.map((x, i) =>
    getSfx({ name: x.name, outputPath: path.join(audioDir, `sfx-${i}.mp3`), tracker })
      .then((p) => p ? { path: p, startSec: x.startSec, sceneId: x.sceneId, offsetFrac: x.offsetFrac, volume: 0.55 } : null).catch(() => null)
  )).then((a) => a.filter(Boolean));

  // Richer music query: fold the mood field into the query so the provider gets
  // genre/feel cues, not just a bare 2-word phrase (which returned off-genre SFX).
  // seed=job.id varies the Pixabay track PER VIDEO (fixes "same BGM every time").
  // A VERTICAL REEL IS CUT TO A BEAT. These films are typographic — big type
  // slamming in on the cut — and that only lands over music with an audible pulse.
  // The script's mood still picks the genre; this just insists the track drive,
  // so a reel never gets a soft ambient bed under type that is punching.
  const isReel = Number(job.height) > Number(job.width);
  // …and a LANDSCAPE film cut every three seconds is just as beat-dependent as a
  // reel. Keying the drive cue off orientation alone meant a fast, punchy 16:9
  // promo — type slamming in on every cut — was scored with whatever ambient bed
  // the mood word happened to return, and the cuts landed on nothing. Ask the
  // FILM, not the frame: a short average scene IS a fast cut, and a mood the
  // script itself called energetic wants a pulse at any aspect. Calm/elegant
  // moods on unhurried cuts are left alone — forcing a beat under a luxury brand
  // film would be its own defect.
  const avgScene = script.scenes.length
    ? script.scenes.reduce((a, sc) => a + (Number(sc.duration) || 0), 0) / script.scenes.length
    : 0;
  const moodWord = String(script.music?.mood || "").toLowerCase();
  const calmMood = /calm|ambient|elegant|gentle|soft|intimate|luxur/.test(moodWord);
  const wantsDrive = isReel
    || (!calmMood && (avgScene > 0 && avgScene <= 4.5))
    || /upbeat|energetic|driving|punchy|dance|electro|hype/.test(moodWord);
  // The energy goes FIRST, not last. fetchMusic retries an over-specific query
  // with a 2-word "core" taken from the front, so a tail-appended cue is exactly
  // what gets dropped on the retry — one film fell back to a bare "upbeat
  // percussive" and lost the brief. Leading with it keeps the pulse in both the
  // full query and its fallback, while the script's own words still pick genre.
  const musicQuery = [
    wantsDrive ? "upbeat driving" : "",
    script.music?.mood,
    script.music?.query,
    wantsDrive ? "punchy beat" : "",
  ].map((x) => String(x || "").trim()).filter(Boolean).join(" ").slice(0, 80);
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
  // retimeScenesToVo has already rewritten script.scenes to their final
  // start/duration, so a cue carrying its scene id + fraction can be resolved
  // exactly. `startMap` stays the path for anything without an id (and for the
  // pass-0 cues it gives the identical answer); the fraction only matters for
  // mid-scene cues, which the map cannot express.
  const sceneById = new Map((s.script.scenes || []).map((sc) => [String(sc.id), sc]));
  const sfxRepinned = (s.sfxClips || []).map((c) => {
    const sc = c.sceneId != null ? sceneById.get(String(c.sceneId)) : null;
    if (sc) {
      const d = Math.max(0.8, Number(sc.duration) || 2);
      const off = Math.min(d - 0.4, d * (Number(c.offsetFrac) || 0));
      return { ...c, startSec: r2c((Number(sc.start) || 0) + Math.max(0, off)) };
    }
    return { ...c, startSec: retime.startMap.get(r2c(c.startSec)) ?? c.startSec };
  });

  // Two different things share one source. `voCues` is the spoken script on the
  // timeline and is ALWAYS built: the display-type script layer is part of the
  // film's look, not a subtitle. `captionCues` is the small burned-in subtitle
  // track and stays opt-in — turning subtitles off must not silence the script.
  const voCues = buildCues(
    s.script.scenes.filter((x) => x.voiceover && x.voiceover.trim()).map((x) => {
      const measured = (s.voClips || []).find((c) => String(c.sceneId) === String(x.id));
      return {
        sceneId: x.id, startSec: x.start,
        durationSec: Math.min(x.duration, measured ? measured.durationSec : x.duration),
        sceneDurationSec: x.duration, text: x.voiceover,
      };
    })
  ).map((c) => ({ start: Math.round(c.start * 10) / 10, end: Math.round(c.end * 10) / 10, text: c.text }));
  const captionCues = job.captions_enabled === 0 ? [] : voCues;
  // The full-frame narration layer is OFF unless config.defaults.scriptOverlay
  // says otherwise (or a job explicitly asks). It used to be unconditional and
  // self-deriving, which is how a film ended up showing its headline twice — once
  // in the template's face, once more in the overlay's, across the screenshot.
  const scriptOverlay = job.script_overlay === 1 || job.script_overlay === true
    || config.defaults.scriptOverlay === true;

  // A PIN TO A SCENE THAT DOES NOT EXIST THROWS THE ASSET AWAY.
  //
  // Every pin is stamped with a SCRIPT scene id, but the composers look assets
  // up by STORYBOARD scene id — and the storyboard is its own LLM pass, free to
  // return a different number of scenes. Each composer builds `byScene` from the
  // pins and consults it before the pool; an entry keyed to an id no scene has
  // is never read, and because the asset lives in that map instead of the pool,
  // nothing else can draw it either. It is not degraded, it is GONE.
  //
  // Measured on the harness fixture: of the three best assets, `site_0.png`
  // (the hero capture, cdScore 91) was pinned to "s8" in a 7-scene film and
  // never rendered at all. That is "why is it not using my screenshots" with no
  // log line anywhere. Re-point the pin onto the scene at the same POSITION when
  // the film still has one, otherwise clear it so the asset falls back into the
  // free pool where the scene matcher can still place it.
  const sbIds = new Set(((s.storyboard && s.storyboard.scenes) || []).map((sc, i) => String(sc && sc.id != null ? sc.id : `s${i + 1}`)));
  if (sbIds.size) {
    const scriptOrder = (s.script?.scenes || []).map((sc) => String(sc.id));
    const sbOrder = [...sbIds];
    let repinned = 0, freed = 0;
    for (const a of (s.assets || [])) {
      if (!a || a.sceneId == null) continue;
      const sid = String(a.sceneId);
      if (sbIds.has(sid)) continue;
      const at = scriptOrder.indexOf(sid);
      const to = at >= 0 && at < sbOrder.length ? sbOrder[at] : null;
      if (to) { a.sceneId = to; repinned++; } else { a.sceneId = null; a.startSec = undefined; a.durationSec = undefined; freed++; }
    }
    if (repinned || freed) {
      console.log(`[agents] pin reconcile: ${repinned} pin(s) moved onto the storyboard's own scene ids, ${freed} released to the pool (they pointed at scenes this film does not have)`);
    }
  }

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
          storyboard, dims, jobDir, framePack: s.framePack, captionCues, scriptCues: voCues, scriptOverlay,
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
        framePack: s.framePack, captionCues, scriptCues: voCues, scriptOverlay, remix: useComposer, strictIdentity,
        // Set-dressing (per-scene layout variants, emphasis words, sanitized
        // decor clusters) is consumed ONLY by scene_kit.buildComposition.
        // WARNING — this reaches almost nothing today: attemptLlmComposition
        // returns via composeWithPackRenderer before `dress` is ever read, and
        // that function does not even accept the parameter. Every pack now has a
        // dedicated renderer (check:templates: "83 packs, 0 still on scene-kit"),
        // so a standard finish gets NO art-direction pass. It only fires on the
        // scene-kit path — a pack without a renderer, or a portrait/long-form job
        // the renderer cannot take. The previous comment here claimed standard
        // was art-directed; it was true when packs lacked renderers and became a
        // lie as they were given them. Making it real means teaching
        // template_engine to consume `dressing` — see docs/ or the session note.
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
        // A PREMIUM job landing here does NOT get what it asked for: the bespoke
        // LLM composition failed its gates and this renders the deterministic kit
        // — the same class of output a standard finish would have produced.
        // Measured over real traffic: 5 of 13 completed premium jobs ended here
        // (final_attempt "scene-kit"), every one with used_fallback = 0, so
        // nothing anywhere said so. Record it loudly and carry a flag out, so the
        // downgrade is a fact on the job instead of something you have to infer
        // from the attempt label.
        if (job.compose_mode === "premium") {
          console.warn(`[agents] PREMIUM DOWNGRADE: the bespoke composer failed its gates — this film renders on the deterministic kit`);
          fallbackLog.note("compose", "premium-downgraded-to-kit", {
            severity: "quality",
            detail: `premium finish requested; composer failed (${String(e.message).slice(0, 100)})`,
          });
        }
        console.warn(`[agents] scene-kit fallback (deterministic, asset-rich)`);
        // Premium jobs get the HYBRID: bounded LLM set-dressing over the kit
        // (variants + emphasis + sanitized decor) — composer-flavoured art
        // direction without composer failure modes. Skipped when the failure
        // was budget-class (the dressing call would die on the same wall).
        const visual = await attemptLlmComposition({
          storyboard, dims, jobDir, assets: s.assets || [], tracker,
          jobId: job.id, durationSec: effDur, label: "scene-kit-fallback",
          framePack: s.framePack, captionCues, scriptCues: voCues, scriptOverlay, remix: false,
          dress: job.compose_mode === "premium" && !composerBudgetDead,
          subject: s.brief?.subject || null,
          brandSkin: s.brandSkin || null, layoutPlan: s.layoutPlan || null,
        });
        return { visual, usedFallback: false, finalAttempt: "scene-kit", usedComposer: false, premiumDowngraded: job.compose_mode === "premium", rendered: true, composerBudgetDead, effectiveDuration: effDur, sfxClips: sfxRepinned };
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
      captionCues, scriptCues: voCues, scriptOverlay,
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
        // Per-scene bed shape from the script's own musicCue curve (see musicEnvelopeFromScript).
        musicEnvelope: musicEnvelopeFromScript(s.script, (s.voClips || []).length > 0),
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
// DEAD-FRAME REPAIR — the branch that did not exist.
//
// Every other repair route restyles a film that renders. When QA reports EMPTY /
// NEAR-EMPTY FRAME or a script error, the film does NOT render, and no amount of
// recolouring, scrimming or de-duplicating changes that: the template's compiled
// component threw and painted the engine's error slate over the rest of the video.
// Before this node existed the router had nowhere to send that verdict, so the
// worst class of defect QA can find was also the only one that always shipped —
// measured, a 36s film that was an error slate for its last 14 seconds.
//
// Recompose on scene-kit with the same pack's styling. It is deterministic and
// lint-clean by construction, so it cannot reproduce the crash, and it weaves more
// of the asset pool than the template did. Runs at most once.
async function deadFrameRepairNode(s) {
  const { job, jobDir } = s;
  db.setProgress(job.id, "composing");
  const effDur = s.effectiveDuration || job.duration;
  try {
    const visual = await withBudget(
      (signal) => attemptLlmComposition({
        storyboard: s.storyboard, dims: { width: job.width, height: job.height, fps: job.fps },
        jobDir, assets: s.assets || [], tracker: s.tracker, jobId: job.id, durationSec: effDur,
        label: "dead-frame-repair", abortSignal: signal, framePack: s.framePack,
        // `voCues` is built locally inside compositionAgent and never enters graph
        // state, so it cannot be read back here — rebuild from the VO clips, which
        // carry the spoken text and their final (retimed) offsets.
        captionCues: job.captions_enabled === 0 ? [] : (s.voClips || [])
          .filter((c) => c && c.text)
          .map((c) => ({ start: c.startSec, end: c.startSec + (c.durationSec || 2), text: c.text })),
        subject: s.brief?.subject || null, brandSkin: s.brandSkin || null, layoutPlan: s.layoutPlan || null,
        forceSceneKit: true,
      }),
      (Number(config.server.stageBudgetSec) || 480) * 1000, "dead-frame repair"
    );
    if (!visual) return { deadFrameTried: true };
    await mixAudioIntoVideo({
      visualPath: visual.videoPath, durationSec: effDur,
      scenes: s.storyboard?.scenes || null, jobDir,
      audio: {
        ttsPath: null, musicPath: s.musicPath || null,
        sfx: [
          ...(s.voClips || []).map((c) => ({ path: c.path, startSec: c.startSec, volume: 1.0, kind: "vo" })),
          ...(s.sfxClips || []),
        ],
        musicVolume: config.audio?.defaultMusicVolume ?? 0.15,
        // Per-scene bed shape from the script's own musicCue curve (see musicEnvelopeFromScript).
        musicEnvelope: musicEnvelopeFromScript(s.script, (s.voClips || []).length > 0),
      },
    }).catch((e) => console.warn(`[agents] dead-frame repair mix failed: ${e.message}`));
    console.log(`[agents] dead-frame repair: recomposed on scene-kit with "${s.framePack}" styling`);
    return { visual, deadFrameTried: true, usedComposer: false };
  } catch (e) {
    console.warn(`[agents] dead-frame repair failed: ${String(e.message).slice(0, 160)}`);
    return { deadFrameTried: true };
  }
}

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
        // Per-scene bed shape from the script's own musicCue curve (see musicEnvelopeFromScript).
        musicEnvelope: musicEnvelopeFromScript(s.script, (s.voClips || []).length > 0),
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
  // The film's REAL cut list. A bundled template cuts more often than the script
  // narrates (one narrated sentence becomes two or three beats), so sampling by
  // script scene lands inside beat entrances and reports empty frames that are
  // simply not there yet. Best-effort: fall back to script scenes if unreadable.
  let beats = null;
  try {
    const idxHtml = fs.readFileSync(path.join(s.jobDir, "index.html"), "utf8");
    const bm = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(idxHtml);
    if (bm) {
      const sm = /window\.OM_SCENES\s*=\s*('[\s\S]*?'|"[\s\S]*?")\s*;/.exec(JSON.parse(bm[1]));
      if (sm) {
        const lit = sm[1];
        const list = JSON.parse(lit[0] === "'" ? lit.slice(1, -1) : JSON.parse(lit));
        const d = list.map((x) => Number(x.dur) || 0).filter((x) => x > 0);
        if (d.length) beats = d;
      }
    }
  } catch { /* not a bundled-template film, or unreadable — scenes still work */ }

  const verdict = await reviewRender({
    videoPath: s.visual.videoPath,
    scenes: s.script.scenes,
    beats,
    // The RENDERED length, not the requested one. Scenes are stretched to their
    // measured narration (retimeScenesToVo), so a 30s request routinely renders
    // 33-34s. Passing the request made sampleTimes compute its "review the tail"
    // frame as `duration - 0.4` = 29.6s on a 33.5s film — 3.9s BEFORE the end,
    // landing inside the CTA's entrance animation. QA then reported "EMPTY /
    // NEAR-EMPTY FRAME: the CTA scene is missing all content" on a film whose CTA
    // was perfectly fine two seconds later, and the real end-state — the thing
    // this sample exists to check — was never reviewed at all. Measured on job
    // qs1x81xjof, where 29.6s is exactly the blocker timestamp QA reported.
    // runJob already passed effectiveDuration; only the graph path did not.
    duration: s.effectiveDuration || s.job.duration,
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
    brandSkin: Annotation(), layoutPlan: Annotation(), deadFrameTried: Annotation(),
  });

  // PER-NODE WALL CLOCK.
  //
  // Every latency question about this pipeline used to be unanswerable: three real
  // jobs took 400s, 544s and 798s and the only number recorded was a single
  // `productionMs` bucket covering the whole graph. So "why is it slow" could only
  // be answered by reading code and guessing which await dominated.
  //
  // This wraps each node in a timer and accumulates into NODE_MS, which the run
  // writes onto the job as stage_timings.nodes. It is one Date.now() pair per node
  // — no measurable cost — and it makes every future latency claim checkable.
  //
  // Nodes that run more than once (qa_agent and the repair loop) accumulate total
  // time and a call count, because "qa ran three times" is itself the finding.
  // Keyed by JOB, not module-global: the graph is compiled once and shared, so a
  // flat accumulator would blend two concurrent jobs' timings into nonsense.
  const timed = (name, fn) => async (s) => {
    const id = s && s.job && s.job.id;
    const t = ms();
    try { return await fn(s); }
    finally {
      if (id) {
        let m = NODE_MS.get(id);
        if (!m) { m = {}; NODE_MS.set(id, m); }
        const rec = m[name] || (m[name] = { ms: 0, calls: 0 });
        rec.ms += ms() - t; rec.calls++;
      }
    }
  };

  // Node names must not collide with state channel names (LangGraph rule),
  // hence the _agent suffixes on storyboard/qa.
  const g = new StateGraph(S)
    .addNode("frame_selector", timed("frame_selector", frameSelectorAgent))
    .addNode("art_director", timed("art_director", artDirectorAgent))
    .addNode("storyboard_agent", timed("storyboard_agent", storyboardAgent))
    .addNode("scene_planner", timed("scene_planner", scenePlannerAgent))
    .addNode("asset_search", timed("asset_search", assetSearchAgent))
    .addNode("text_director", timed("text_director", textDirectorAgent))
    .addNode("visual_layout_director", timed("visual_layout_director", visualLayoutDirectorAgent))
    .addNode("voice_agent", timed("voice_agent", voiceAgent))
    .addNode("composition", timed("composition", compositionAgent))
    .addNode("animation", timed("animation", animationAgent))
    .addNode("timeline", timed("timeline", timelineAgent))
    .addNode("qa_agent", timed("qa_agent", qaAgentNode))
    .addNode("dead_frame_repair", timed("dead_frame_repair", deadFrameRepairNode))
    .addNode("contrast_repair", timed("contrast_repair", contrastRepairNode))
    .addNode("repair", timed("repair", repairAgent));

  g.addEdge(START, "frame_selector");
  // Fan-out: four branches run in parallel. The Art Director only needs the brief
  // + the chosen pack, so it runs alongside the storyboard/asset/voice chain and
  // its brand skin joins at composition (near-zero added latency).
  g.addEdge("frame_selector", "storyboard_agent");
  // asset_search plans its own fetch list inline (see assetSearchAgent) — a
  // separate asset_planner node cost a whole superstep behind the storyboard LLM.
  g.addEdge("frame_selector", "asset_search");
  g.addEdge("frame_selector", "voice_agent");
  g.addEdge("frame_selector", "art_director");
  g.addEdge("storyboard_agent", "scene_planner");
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
    // 0) A DEAD FRAME IS NOT A STYLING NIT. The classes below are all "the film
    // renders, but looks wrong"; none of their patterns match "the film does not
    // render at all". So when QA reported EMPTY / NEAR-EMPTY FRAME six times on a
    // shipped video — a template crash blanking everything past 21.9s — no branch
    // claimed it: the deterministic chain has no fixer for it, the paid repair lap
    // requires `usedComposer` (false on every standard job), and the router fell
    // straight through to END. The review agent had found the worst defect a film
    // can have and the pipeline shipped it anyway.
    //
    // A blank/crashed render can only be fixed by composing it AGAIN with something
    // that works, so this routes to the deterministic repair node, which recomposes
    // rather than restyling. runtimeCheck now catches most of these before the
    // render is ever paid for; this is the backstop for whatever it misses.
    // MATCH THE FAILURE, NOT THE WORD.
    //
    // The first version keyed off a bare `empty` (and `no content`, and `error
    // message`) anywhere in the issue OR the fix. Those words are ordinary
    // layout vocabulary — a fix reading "remove the empty padding" or an issue
    // about "empty space on the left" matched — so a film with five ordinary
    // STYLING blockers (typography, collisions, contrast, a clashing photo) was
    // classed as a crashed render. Measured on job hhv4uy3i9j: it triggered a full
    // scene-kit recompose costing 206.6s, 38% of the entire 544.8s run, and the
    // film it produced still failed QA with the same styling blockers — the
    // recompose could not have helped, because nothing was ever dead.
    //
    // A dead frame is a specific claim: the FRAME is empty/blank, or the engine
    // painted a runtime error. So "empty" must be adjacent to "frame", and the
    // runtime signatures stay exact. Only the ISSUE is searched — the FIX is the
    // model's prose about a remedy and is far looser language.
    const DEAD_FRAME = new RegExp([
      /(empty|near-?empty|blank)\s*(\/\s*near-?empty\s*)?frame/,        // the QA class name
      /frame (is|appears)[^.]{0,20}(empty|blank)/,                       // "the frame is empty"
      /contains only the background/,                                    // "…and a code error message"
      /(frame|background)[^.]{0,40}error (message|string)/,              // the engine's error slate, described
      /nothing (is )?render|renders? nothing|no content (is )?render/,
      /total content failure|error slate/,
      /is not a function|is not defined|cannot read propert|undefined is not/, // raw runtime signatures
    ].map((r) => r.source).join("|"));
    // RECORD WHY. Only the FINAL verdict is persisted, so when this route fires on
    // an early lap the evidence is gone by the time anyone looks — and this is the
    // most expensive branch in the graph (measured 190-207s, ~39% of a run). Naming
    // the exact blocker that matched is the difference between "it recomposed" and
    // "it recomposed because of THIS", which is the only way to tell a real dead
    // frame from a false positive without re-running the job.
    const deadFrameHit = blockers.find((i) => DEAD_FRAME.test(String(i.issue || "").toLowerCase()));
    const deadFrame = !!deadFrameHit;
    if (deadFrame && !s.deadFrameTried && !s.usedFallback) {
      console.warn(`[agents] QA reported a DEAD/CRASHED frame at ${deadFrameHit.atSec}s — recomposing (this is not repairable in place)`);
      console.warn(`[agents]   trigger: "${String(deadFrameHit.issue).slice(0, 160)}"`);
      // Written next to qa/verdict.json rather than onto the job's audio notes —
      // that channel is user-facing copy on the Premiere screen, not a place for
      // engine diagnostics.
      try {
        fs.mkdirSync(path.join(s.jobDir, "qa"), { recursive: true });
        fs.writeFileSync(path.join(s.jobDir, "qa", "dead-frame-trigger.json"),
          JSON.stringify({ atSec: deadFrameHit.atSec, issue: deadFrameHit.issue, fix: deadFrameHit.fix, qaAttempt: s.qaAttempts || 1 }, null, 2));
      } catch { /* diagnostic only — never block the repair */ }
      return "dead_frame_repair";
    }
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
  }, ["dead_frame_repair", "contrast_repair", "repair", END]);
  g.addEdge("dead_frame_repair", "qa_agent");
  g.addEdge("contrast_repair", "qa_agent");
  g.addEdge("repair", "qa_agent");

  compiledGraph = g.compile();
  return compiledGraph;
}

// ---------------------------------------------------------------- runner
async function runProductionGraphInner({ jobId }) {
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
      stageTimings: { ...(job.stage_timings || {}), productionMs: ms() - t0, nodes: drainNodeTimings(jobId, ms() - t0) },
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
    // Drain the timings here too. Without this the map leaks an entry per failed
    // job for the life of the process, and — worse — the per-node breakdown is
    // thrown away for exactly the runs where it is most wanted: the ones that
    // stalled or timed out.
    db.markFailed(jobId, err.message.slice(0, 2000), costs.llm.inputTokens, costs.llm.outputTokens, costs,
      { ...(job && job.stage_timings ? job.stage_timings : {}), productionMs: ms() - t0, nodes: drainNodeTimings(jobId, ms() - t0) });
  }
}

// assetSearchAgent is exported for harness use only (server/scripts) — it is the
// node where asset acquisition, gap-fill and curation meet, and is worth driving
// in isolation without paying for a full render.
/**
 * Every production render runs inside a fallback tally.
 *
 * This wrapper is why the tally exists at all on the real path: config sets
 * orchestrator "langgraph", so server.js dispatches here, NOT to pipeline.runJob
 * — and runWithLog was only ever called from runJob. Measured: 0 of the last 6
 * job dirs contained a fallbacks.json, so every note() in the asset and compose
 * stack (including the premium-downgrade one) had been returning early at
 * `if (!ctx) return;` since the day it was written.
 */
async function runProductionGraph(opts) {
  return fallbackLog.runWithLog(opts && opts.jobId, async () => {
    try {
      return await runProductionGraphInner(opts);
    } finally {
      // In finally so a FAILED render still reports what it substituted — that is
      // the run where the tally is worth the most.
      try { fallbackLog.writeReport(jobDirFor(opts.jobId), opts.jobId); } catch { /* never mask the real result */ }
    }
  });
}

module.exports = { runProductionGraph, __test_assetSearchAgent: assetSearchAgent, __test_makeQueryDeriver: makeQueryDeriver };
