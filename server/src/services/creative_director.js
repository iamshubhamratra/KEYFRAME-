// Creative Director agent — the final creative authority between Asset Collection
// and Composition. It reviews EVERY collected visual asset with a vision LLM,
// scores it on six dimensions, approves/rejects/re-ranks, assigns each to a scene,
// ranks screenshots, gives advisory notes on music/SFX, and can trigger ONE bounded
// top-up fetch to fill a scene left empty. It supersedes the simpler keep/reject
// vision gate (asset_vision.js) with a richer verdict.
//
// Its prominence decisions take effect deterministically in the scene-kit
// composer via `asset.visionOk`. NOTE: `asset.sceneId` (scene placement) is
// honored only by the opt-in LLM remix composer (composer.js) — scene_kit does
// NOT read it yet, so per-scene assignment/top-up placement is advisory on the
// default path (the assets still join the general weaving pool). Rejected
// web-stock files are deleted.
//
// FAIL-OPEN by design (mirrors asset_vision.js): any failure — dead LLM budget,
// missing ffmpeg, parse error — makes reviewAndCurate return null so callers
// fall back to the legacy vision gate. The Creative Director must never make a
// video worse by starving it of assets.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const db = require("../db");
const openrouter = require("./openrouter");
const { extractFirstJsonObject } = require("./json_lenient");
const { isLogo, tierFor } = require("./asset_priority");
// thumbBase64 lives in asset_vision on main (the branch this file came from
// expected a media.js export that never landed).
const { thumbBase64 } = require("./asset_vision");
const frameRegistry = require("./frame_registry");
const frameManifest = require("./frame_manifest");
const { acquire } = require("./asset_sources");
const taxonomy = require("./asset_taxonomy");
const clip = require("./asset_clip");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_creative_director.md"),
  "utf8"
);

// Only real web-stock providers are deletable on reject; the user's own website
// screenshots, curated-library picks, and clean recolored Iconify SVGs are
// trusted content — scored and assigned, but never deleted by the director.
const STOCK_SOURCES = ["pixabay", "openverse", "pexels", "pixabay_scrape"];
// Substring match so a CACHED web-stock asset (source "cache:pixabay", set by the
// fetch cache) is still recognized as rejectable web stock — not mistaken for
// trusted owned/curated content. The user's screenshots (source "website"),
// curated picks, and Iconify SVGs never contain a provider name, so they stay
// trusted and are never deleted.
const isWebStock = (a) => {
  const s = String((a && a.source) || "").toLowerCase();
  return STOCK_SOURCES.some((p) => s.includes(p));
};

// A real product SCREENSHOT (the site's own UI) — the most on-topic asset for a
// product/tool film and what a viewer expects to SEE. Source "website" =
// captured page shot; path markers cover the screenshot-director outputs.
const isScreenshot = (a) => {
  const s = String((a && a.source) || "").toLowerCase();
  if (s === "website" || s.includes("screenshot")) return true;
  return /(?:^|[\\/])(?:page_|site_|screenshot|shot_)/i.test(String((a && a.path) || ""));
};
// A bare PERSON / PORTRAIT — read from the vision model's own `sees` description
// (preferred) or the asset's alt text. A scraped testimonial headshot on a
// product film trips this; the site's UI screenshot does not.
const looksLikePerson = (a) => {
  const t = `${String((a && a.sees) || "")} ${String((a && a.alt) || "")}`;
  if (isScreenshot(a)) return false;
  return /\b(person|people|man|woman|men|women|guy|lady|face|portrait|headshot|selfie|human|posing|model|smiling|businessman|businesswoman|team member|staff|employee)\b/i.test(t);
};
// Is the FILM about people (team/founders/testimonials/agency…)? Then a face is
// on-topic and stays eligible for prominence. Otherwise (a product/tool/SaaS
// film) a bare person must not headline it.
const isPersonSubject = (subj, categoryText) =>
  /\b(team|people|founder|portrait|profile|hiring|recruit|community|agency|creator|influencer|coach|therapist|doctor|staff|\bhr\b|culture|leadership|testimonial|about us|about-us|nonprofit|charity|personal brand)\b/i
    .test(`${subj || ""} ${categoryText || ""}`);
// Scenes where a human face is contextually right (a testimonial/quote/team beat).
const isPeopleScene = (scene) =>
  /\b(proof|testimonial|quote|review|social|team|customer|story|voices?)\b/i.test(`${(scene && scene.kind) || ""} ${(scene && scene.purpose) || ""}`);

// Per-scene CLIP re-scoring runs on the CPU (one image embed per asset plus one
// text-embed set per distinct scene), so bound how many pinned stills a single job
// re-scores — a long film with a deep pool must not spend minutes here.
const PER_SCENE_CLIP_MAX = 40;

function cd() {
  // Merge defaults key-by-key: a PARTIAL config block (e.g. CREATIVE_DIRECTOR=1
  // creates { enabled: true } with no tuning keys) must not leave maxPerScene/
  // maxTopUp/chunkSize undefined — undefined tuning turns slice()/loop math
  // into NaN and silently demotes every asset to background.
  return { enabled: true, maxPerScene: 2, maxTopUp: 3, chunkSize: 6, ...(config.creativeDirector || {}) };
}

// Mechanical query broadening for a top-up fetch (local copy so this module has
// no dependency on pipeline.js — which requires this one).
function fallbackQueriesFor(query) {
  const words = String(query).trim().split(/\s+/);
  const out = [];
  if (words.length >= 3) out.push(words.slice(0, -1).join(" "));
  if (words.length >= 2) out.push(words.slice(0, 2).join(" "));
  return [...new Set(out)].filter((q) => q !== query);
}

// What a scene actually SAYS — the spoken line plus the copy on screen. The
// director's whole job is deciding which picture belongs on which scene, and it
// was shown only `visualDirection` (a CAMERA note: "slow push on the grid"), so
// it matched images against how a scene MOVES instead of what it is ABOUT. Same
// shape as screenshot_qa's sceneTopic(), which is the one per-scene match test in
// the pipeline that demonstrably works.
function sceneLine(s) {
  if (!s) return "";
  const onScreen = Array.isArray(s.onScreenText)
    ? s.onScreenText.filter(Boolean).join(" ")
    : [s.headline, s.subtext].filter(Boolean).join(" ");
  return [s.voiceover, onScreen].map((x) => String(x || "").trim()).filter(Boolean).join(" · ").slice(0, 150);
}

// A malformed storyboard must not blow the prompt up; the long-form ceiling is 30
// scenes, so this bound never bites a real film.
const MAX_DIGEST_SCENES = 40;

// Compact scene plan for the prompt: id + purpose + what the scene says + a short
// direction line. NOT truncated to 12 any more: `assignScene` may only name an id
// the model has been shown, so every scene past the 12th was unassignable — on a
// 14-scene film the last two beats, and on a long-form film half the timeline,
// could never receive a directed asset and fell back to the general pool.
function sceneDigest(storyboard, script) {
  const sbScenes = (storyboard && Array.isArray(storyboard.scenes) && storyboard.scenes.length)
    ? storyboard.scenes : [];
  const scScenes = (script && Array.isArray(script.scenes)) ? script.scenes : [];
  const scenes = sbScenes.length ? sbScenes : scScenes;
  // The storyboard is the VISUAL plan; on the project path (graph.js passes both)
  // the narration lives on the script. Key the script's lines by id so a
  // storyboard scene that carries no voiceover still contributes its spoken words.
  const lineById = new Map();
  scScenes.forEach((s, i) => {
    const line = sceneLine(s);
    if (line) lineById.set(String(s && s.id != null ? s.id : i + 1), line);
  });
  return scenes.slice(0, MAX_DIGEST_SCENES).map((s, i) => {
    const id = s.id != null ? s.id : i + 1;
    return {
      id,
      purpose: String(s.purpose || "").slice(0, 40),
      line: sceneLine(s) || lineById.get(String(id)) || "",
      direction: String(s.visualDirection || s.headline || s.subtext || "").slice(0, 120),
    };
  });
}

// Pack palette + vibe + asset affinity so the director judges brand/template fit
// against the real design system (its colors, feel, and preferred asset style).
function packContext(framePack) {
  if (!framePack) return "No specific design template selected — judge for a clean, modern, premium look.";
  const vibe = frameRegistry.getPackVibe(framePack) || "";
  const tokens = frameRegistry.getPackTokens(framePack);
  const manifest = frameManifest.getManifest(framePack);
  const colors = tokens && tokens.colors ? Object.values(tokens.colors).slice(0, 6).join(", ") : "";
  const fonts = tokens && tokens.fonts ? tokens.fonts.slice(0, 2).join(", ") : "";
  const affinity = manifest && manifest.assets && Array.isArray(manifest.assets.keywords) && manifest.assets.keywords.length
    ? `Assets that fit this template look: ${manifest.assets.keywords.slice(0, 6).join(", ")}.` : "";
  return [
    `Selected template / frame pack: "${framePack}".`,
    vibe ? `Vibe: ${vibe}` : "",
    colors ? `Palette: ${colors} — prefer assets whose colors harmonize with these (they will be tinted to match).` : "",
    fonts ? `Typography: ${fonts}` : "",
    manifest && manifest.assets && manifest.assets.photoMod ? `Preferred photo treatment: ${manifest.assets.photoMod}` : "",
    affinity,
  ].filter(Boolean).join("\n");
}

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const SCORE_KEYS = ["relevance", "visualQuality", "brandCompat", "storytelling", "motionPotential", "templateCompat"];

function normScores(raw) {
  const out = {};
  let sum = 0;
  for (const k of SCORE_KEYS) { out[k] = clamp100(raw && raw[k]); sum += out[k]; }
  out.overall = Math.round(sum / SCORE_KEYS.length);
  return out;
}

// ---- Craft verdict (merged in from the former standalone Asset Director) ----
// The vision pass that judges relevance/prominence now ALSO returns how each asset
// should be fitted and animated, so a job pays for ONE set of image tokens instead
// of two (the old asset_director re-uploaded the very same thumbnails). scene_kit
// reads a.kind / a.fit / a.focus / a.effect / a.lowQuality when it places and
// animates each asset. asset_director.js survives as the CREATIVE_DIRECTOR=0
// fallback — see graph.js.
const KINDS = new Set(["vector", "shot", "photo"]);
const FITS = new Set(["contain", "cover"]);
const FOCI = new Set(["top", "center", "bottom"]);
const EFFECTS = new Set(["pop", "rise", "blur-in", "zoom", "draw", "float"]);
const QUALITY = new Set(["high", "ok", "low"]);

// Copy only recognised enum values onto the asset; drop anything the model
// invented. Returns true when at least one field landed. Fail-open by omission:
// an absent/garbage field leaves the asset untouched and the kit falls back to
// its own fit heuristics.
function applyCraft(a, v) {
  if (!a || !v) return false;
  let hit = false;
  if (KINDS.has(v.kind))     { a.kind = v.kind;     hit = true; }
  if (FITS.has(v.fit))       { a.fit = v.fit;       hit = true; }
  if (FOCI.has(v.focus))     { a.focus = v.focus;   hit = true; }
  if (EFFECTS.has(v.effect)) { a.effect = v.effect; hit = true; }
  if (QUALITY.has(v.quality)) {
    a.quality = v.quality;
    if (v.quality === "low" && a.source !== "upload") a.lowQuality = true;
    hit = true;
  }
  return hit;
}

// What the file is likely to be, from its provenance. The old asset director was
// handed this as `kindHint`; the merged call keeps the same evidence so `kind`
// corrections stay as accurate as before.
function kindHintFor(a) {
  const src = String((a && a.source) || "");
  if (src === "website") return "website screenshot";
  if (src === "website-logo") return "the brand's own logo mark — never crop it";
  if (src === "blog") return "image from the source blog post";
  if (src === "iconify" || src.startsWith("library:")) return "flat vector/icon";
  if (/\.svg($|\?)/i.test(String((a && a.path) || ""))) return "svg vector";
  return null;
}

// One batched vision review over up to `chunkSize` assets. Returns a Map keyed by
// the ABSOLUTE index into `assets` -> verdict object, or an empty Map on failure
// (fail-open: callers leave those assets untouched).
async function reviewChunk({ chunk, baseIndex, subject, categoryText, packText, scenes, orientation, tracker, signal }) {
  // Thumbnails are independent ffmpeg spawns over separate files — running them
  // with `await` inside the loop paid each decode end to end before starting the
  // next. They are bounded by the chunk size (<=6), so a plain Promise.all is
  // already capped; ordering is preserved by index, which the caller relies on to
  // map a verdict back to its asset.
  const thumbs = await Promise.all(chunk.map((a) =>
    (a.__absPath ? thumbBase64(a.__absPath, a.type === "video").catch(() => null) : Promise.resolve(null))));
  const usable = thumbs.map((b, i) => ({ b, i })).filter((x) => x.b);
  if (!usable.length) return new Map();

  const header = [
    `FILM SUBJECT: "${subject || "(unspecified)"}".`,
    categoryText || "",
    packText,
    orientation ? `Video orientation: ${orientation} — reject or down-rank an asset whose shape can't fill a ${orientation} frame without cropping away its subject.` : "",
    // Spell out which field to match against: with only `direction` in the digest
    // the model had nothing but camera intent to go on, which is how a picture
    // ends up on a beat that never mentions it.
    "SCENE PLAN — assign each asset to the scene whose `line` (what the narrator SAYS and the viewer READS there) the picture actually depicts; " +
    `\`direction\` is camera/motion intent only and is never a reason to place an asset: ${JSON.stringify(scenes)}`,
    `Review the ${usable.length} asset(s) below. For EACH, return a verdict per your instructions. ` +
    `assignScene must be one of the scene ids above (or null). Reply STRICT JSON: {"verdicts":[...]} with exactly one entry per asset, numbered 1..${usable.length}.`,
  ].filter(Boolean).join("\n\n");

  const content = [{ type: "text", text: header }];
  usable.forEach((x, n) => {
    const a = chunk[x.i];
    const clipHint = typeof a.clipRelevance === "number"
      ? `CLIP subject-match: ${a.clipRelevance} (${a.clipRelevance < 0.15 ? "LOW — likely off-topic" : a.clipRelevance > 0.5 ? "high" : "moderate"})`
      : "";
    const hint = kindHintFor(a);
    const meta = [
      `source: ${a.source || "?"}`,
      a.alt ? `query: "${String(a.alt).slice(0, 60)}"` : "",
      `type: ${a.type}`,
      a.width && a.height ? `dims: ${a.width}x${a.height}` : "",
      hint ? `looks like: ${hint}` : "",
      clipHint,
      a.source === "upload" ? "THE USER'S OWN UPLOAD (sovereign — never reject; prefer hero/support prominence)" : isWebStock(a) ? "web-stock (rejectable)" : "trusted (owned/curated — do not reject for relevance)",
    ].filter(Boolean).join(" · ");
    content.push({ type: "text", text: `Asset ${n + 1} (${meta}):` });
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${x.b}` } });
  });

  const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
    system: SYSTEM, user: content, jsonMode: true, stage: "creative_director",
    model: cd().model, temperature: 0, signal,
  });
  if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "creative_director", costUsd: costUsd });

  const parsed = extractFirstJsonObject(text);
  const verdicts = Array.isArray(parsed && parsed.verdicts) ? parsed.verdicts : [];
  const byN = new Map();
  for (const v of verdicts) { const n = Number(v && v.n); if (Number.isFinite(n)) byN.set(n, v); }

  const out = new Map();
  usable.forEach((x, n) => {
    const v = byN.get(n + 1);
    if (v) out.set(baseIndex + x.i, v);
  });
  return out;
}

// Advisory audio review — text only, no DSP. Judges the planned music/SFX from
// their metadata (mood/query/genre) against the film's subject and scene moods.
async function reviewAudio({ subject, script, audioPlan, sceneCount, tracker, signal }) {
  const music = (script && script.music) || (audioPlan && audioPlan.music) || null;
  const sfxNames = [];
  if (script && Array.isArray(script.scenes)) {
    for (const s of script.scenes) for (const n of (s.sfx || [])) if (sfxNames.length < 12) sfxNames.push(n);
  }
  if (!music && !sfxNames.length) return { musicAnalysis: {}, soundEffectAnalysis: {} };

  try {
    const user = [
      `You are the audio director for a ${sceneCount}-scene promo film about "${subject || "the subject"}".`,
      `Planned music: ${JSON.stringify(music || {})}. Planned sound effects: ${JSON.stringify(sfxNames)}.`,
      `Judge fit from this metadata (no audio file is provided). Reply STRICT JSON:`,
      `{"musicAnalysis":{"classification":"inspirational|corporate|premium|futuristic|energetic|cinematic","fitScore":0-100,"introSuitable":true|false,"featureSuitable":true|false,"ctaSuitable":true|false,"keep":true|false,"suggestedQuery":"<better query if keep=false, else empty>","note":"<one line>"},`,
      `"soundEffectAnalysis":{"recommend":["entry","transition","highlight","cta"],"reject":["<any cheap/redundant names>"],"note":"<one line>"}}`,
    ].join("\n");
    const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
      system: "You are a meticulous audio director for premium promo videos. Strict JSON only.",
      user, jsonMode: true, stage: "creative_director", model: cd().model, temperature: 0.2, signal,
    });
    if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "creative_director", costUsd: costUsd });
    const parsed = extractFirstJsonObject(text);
    return {
      musicAnalysis: (parsed && parsed.musicAnalysis) || {},
      soundEffectAnalysis: (parsed && parsed.soundEffectAnalysis) || {},
    };
  } catch (e) {
    return { musicAnalysis: {}, soundEffectAnalysis: {}, skipped: String(e && e.message || e).slice(0, 120) };
  }
}

// ---------------------------------------------------------------- main
// Returns { assets: curatedAssets, report }. `assets` is the surviving, annotated
// asset list to hand the composer. Fail-open: on any thrown error the caller
// (reviewAndCurate) passes the original assets through.
async function directAssets({ storyboard, script, subject, brief, framePack, assets, audioPlan, tracker, signal, jobDir, orientation, category }) {
  const list = Array.isArray(assets) ? assets.slice() : [];
  const subj = String(subject || (brief && brief.subject) || "").trim();
  const scenes = sceneDigest(storyboard, script);
  const packText = packContext(framePack);
  // Industry/category context steers relevance + template-fit judgments and gives
  // the director a concrete off-category reject list (jewelry for SaaS, etc.).
  const cat = category || taxonomy.classify({ subject: subj, brief });
  const categoryText = taxonomy.describeForDirector(cat);
  const notes = [];
  const recos = [];
  const { maxPerScene, maxTopUp, chunkSize } = cd();

  // Attach absolute paths for thumbnailing (assets carry jobDir-relative paths).
  for (const a of list) a.__absPath = a && a.path ? path.join(jobDir, a.path) : null;

  // The user's logo is role material — grading it against the stock rubric only
  // wastes a vision slot and risks a "low quality" verdict on a flat brand mark.
  const visual = list.filter((a) => a && !isLogo(a) && (a.type === "image" || a.type === "video") && a.__absPath && fs.existsSync(a.__absPath));

  // ---- 0) CLIP pre-scoring: local image<->text semantic relevance ----
  // A cheap, deterministic "do the PIXELS match the subject?" probability (0..1)
  // per image, computed before the LLM review. It becomes (a) a hint the vision
  // model sees, (b) a prominence tie-breaker, and (c) a reported score. Fail-soft:
  // null when CLIP is unavailable → the CD behaves exactly as before. Only stills
  // (CLIP is an image model); videos are left null.
  const clipSubject = subj || (scenes[0] && scenes[0].direction) || "";
  const stills = visual.filter((a) => a.type === "image");
  if (clipSubject && stills.length) {
    const probs = await clip.relevanceProb(clipSubject, stills.map((a) => a.__absPath)).catch(() => null);
    if (probs) stills.forEach((a, i) => { if (typeof probs[i] === "number") a.clipRelevance = probs[i]; });
  }

  // ---- 1) Batched vision review over every visual asset ----
  //
  // The chunks are INDEPENDENT — each is its own vision call over its own six
  // thumbnails, and the only shared state is the verdicts map they write disjoint
  // keys into. Running them with `await` inside the loop stacked 3-5 flash-vision
  // round trips end to end on the critical path for no reason.
  //
  // Bounded, not unbounded: each call uploads six base64 thumbnails, so a wide
  // fan-out spikes memory and invites provider 429s (a 429 here silently falls back
  // to a costlier house model, so throughput bought with rate-limit errors is a
  // cost regression, not a win). Three in flight is the compromise the verification
  // pass landed on.
  const verdicts = new Map(); // absolute index in `visual` -> verdict
  const chunks = [];
  for (let start = 0; start < visual.length; start += chunkSize) {
    chunks.push({ start, chunk: visual.slice(start, start + chunkSize) });
  }
  const VISION_CONCURRENCY = Math.max(1, Number(cd().chunkConcurrency ?? cd().visionConcurrency) || 3);
  let ci = 0;
  await Promise.all(Array.from({ length: Math.min(VISION_CONCURRENCY, chunks.length) }, async (_u, worker) => {
    // STAGGER THE WORKERS. openrouter's 429/402 backoff has no jitter, so a herd
    // that dispatches in lockstep also RETRIES in lockstep and re-collides on
    // every attempt. 200ms apart is enough to decorrelate them, and it costs
    // 400ms once against calls that take 5-20s each.
    if (worker) await new Promise((r) => setTimeout(r, worker * 200));
    for (;;) {
      const i = ci++;
      if (i >= chunks.length) return;
      const { start, chunk } = chunks[i];
      try {
        const m = await reviewChunk({ chunk, baseIndex: start, subject: subj, categoryText, packText, scenes, orientation, tracker, signal });
        for (const [k, v] of m) verdicts.set(k, v);
      } catch (e) {
        // Fail-open for this chunk — its assets keep whatever flags they already had.
        notes.push(`Vision review skipped for ${chunk.length} asset(s): ${String(e && e.message || e).slice(0, 80)}`);
      }
    }
  }));

  // ---- 2) Apply verdicts (annotate; collect rejects) ----
  // Scene ids are numbers on the /generate path but STRINGS ("s2") on the
  // project path, and JSON-mode models freely echo "3" for 3 — so accept a
  // verdict's assignScene in raw form OR via Number-normalization. A canonical
  // map keys both spellings back to the storyboard's own id value.
  const canonicalSceneId = new Map();
  for (const s of scenes) {
    if (s.id == null) continue;
    canonicalSceneId.set(s.id, s.id);
    canonicalSceneId.set(String(s.id), s.id);
    const n = Number(s.id);
    if (Number.isFinite(n)) canonicalSceneId.set(n, s.id);
  }
  const assetScores = {};
  const rejectedAssets = [];
  const toDelete = new Set(); // indices into `visual`
  let craftDirected = 0;      // assets that got fit/focus/effect/kind from this pass
  visual.forEach((a, i) => {
    const v = verdicts.get(i);
    if (!v) return; // unreviewed -> untouched (fail-open)
    const scores = normScores(v.scores);
    if (typeof a.clipRelevance === "number") scores.clipRelevance = a.clipRelevance;
    assetScores[a.path] = scores;
    a.cdScore = scores.overall;
    a.sees = typeof v.sees === "string" ? v.sees : a.sees;
    const prom = String(v.prominence || "").toLowerCase();
    a.cdProminence = ["hero", "support", "background", "reject"].includes(prom) ? prom : "background";
    if (v.assignScene != null) {
      const sid = canonicalSceneId.get(v.assignScene)
        ?? canonicalSceneId.get(String(v.assignScene))
        ?? canonicalSceneId.get(Number(v.assignScene));
      if (sid != null) a.sceneId = sid;
    }
    if (v.sectionType) a.sectionType = String(v.sectionType).slice(0, 20);
    // Same verdict, no second upload: how this asset is cropped and animated.
    if (applyCraft(a, v)) craftDirected++;

    const rejected = String(v.decision || "").trim().toLowerCase() === "reject" || a.cdProminence === "reject";
    if (rejected && isWebStock(a)) {
      // Only real web stock is deleted. Trusted content (screenshots, curated,
      // iconify) is never deleted — at worst demoted to background below.
      toDelete.add(i);
      rejectedAssets.push({ path: a.path, source: a.source, reason: String(v.note || "").slice(0, 120), sees: a.sees || null });
      a.__rejected = true;
    } else {
      // visionOk gates PROMINENT slots in scene_kit (montage/split/hero).
      a.visionOk = a.cdProminence === "hero" || a.cdProminence === "support";
      // …but PROMINENCE IS NOT TOPICALITY, and conflating them emptied long films.
      // The pin-relevance floor treats "no CLIP score and not visionOk" as "nobody
      // ever checked this picture, so it must not hold a scene". For an asset the
      // director reviewed and placed at `background` prominence — or demoted below
      // maxPerScene further down — that reads as unchecked when in fact it was
      // looked at and kept. Measured on a 40-scene film: 19 reviewed assets were
      // unpinned this way, leaving 6 of 40 scenes with a visual. This flag records
      // the thing the floor actually wants to know (a human-equivalent look
      // happened and did not reject it) and survives the demotion below.
      a.cdReviewed = true;
    }
  });

  // ---- 2b) TOPIC / TYPE RELEVANCE GUARD ----
  // A film ABOUT A PRODUCT/TOOL must SHOW the product, not a stray person. The
  // vision gate never deletes trusted website content, so a scraped testimonial
  // headshot (source "website-image") could headline a Notion/SaaS film — exactly
  // the "why is there a random person instead of the screenshot?" bug. Unless the
  // film is explicitly about people, demote a bare-person/portrait image OUT of
  // the hero/support slots (it can still scrim as background) so the real product
  // screenshots win the stage. A face is still allowed on a testimonial/proof/
  // team scene, where it belongs.
  const personFilm = isPersonSubject(subj, categoryText);
  if (!personFilm) {
    const sceneById = new Map();
    for (const s of scenes || []) { if (s && s.id != null) { sceneById.set(s.id, s); sceneById.set(String(s.id), s); } }
    let demoted = 0;
    for (const a of visual) {
      if (a.__rejected || !looksLikePerson(a)) continue;
      const scene = sceneById.get(a.sceneId) || sceneById.get(String(a.sceneId));
      const okHere = isPeopleScene(scene);           // a face fits a testimonial/proof beat
      if (a.cdProminence === "hero" && !okHere) { a.cdProminence = "support"; }
      if ((a.cdProminence === "hero" || a.cdProminence === "support") && !okHere) {
        a.cdProminence = "background"; a.visionOk = false; a.__personDemoted = true; demoted++;
      }
    }
    if (demoted) console.log(`[creative-director] ${demoted} bare-person image(s) demoted from prominent slots (film subject "${subj}" is not about people) — product screenshots take the stage`);
  }

  // ---- 2c) PER-SCENE CLIP — does the picture match the LINE it will sit under? ----
  // `clipRelevance` (step 0) is ONE score against the whole film's subject, so it
  // carries no per-scene information whatsoever — yet a scene pin is precisely what
  // a viewer judges ("why is that photo on the pricing beat?"). Score every pinned
  // still a second time against its OWN scene's words and store it in a SEPARATE
  // field: clipRelevance must keep its film-level meaning, because the prompt hint
  // above, the report, and graph.js's PIN_RELEVANCE_FLOOR all read it as
  // subject-match. Grouped by scene line so one text-embed set covers every asset
  // sharing a scene.
  //
  // FAIL-SOFT: CLIP loads @huggingface/transformers lazily and returns null when
  // it isn't available — then nothing is written and every consumer falls back to
  // clipRelevance exactly as before.
  try {
    const lineById = new Map();
    for (const s of scenes) {
      if (!s || s.id == null) continue;
      const line = String(s.line || s.direction || "").trim();
      if (line) lineById.set(String(s.id), line);
    }
    const byLine = new Map();
    let queued = 0;
    for (const a of visual) {
      // CLIP is an image model (videos are left unscored, as in step 0), and an
      // asset with no pin has no scene to be judged against.
      if (a.__rejected || a.type !== "image" || a.sceneId == null || !a.__absPath) continue;
      if (queued >= PER_SCENE_CLIP_MAX) break;
      const line = lineById.get(String(a.sceneId));
      if (!line) continue;
      if (!byLine.has(line)) byLine.set(line, []);
      byLine.get(line).push(a);
      queued++;
    }
    for (const [line, group] of byLine) {
      // CLIP's text encoder truncates at 77 tokens — keep the positive prompt to
      // the scene's opening words rather than the full 150-char line.
      const probs = await clip
        .relevanceProb(subj, group.map((a) => a.__absPath), { positive: `a photo or screenshot of ${line.slice(0, 110)}` })
        .catch(() => null);
      if (!probs) continue;
      group.forEach((a, i) => {
        if (typeof probs[i] !== "number") return;
        a.clipSceneRelevance = probs[i];
        // Surface it next to the other scores so a bad pin is diagnosable from the
        // saved creative review instead of only from the finished film.
        if (assetScores[a.path]) assetScores[a.path].clipSceneRelevance = probs[i];
      });
    }
  } catch { /* fail-open: per-scene CLIP is a bonus signal, never a dependency */ }

  // ---- 3) Guardrails: quality-over-quantity cap + never-zero ----
  // Cap prominent assets per scene: keep the top `maxPerScene` by score, demote
  // the rest to background (visionOk=false) rather than delete — extras can still
  // scrim. Grouped by the (possibly reassigned) sceneId.
  const survivors0 = visual.filter((a) => !a.__rejected);
  const byScene = new Map();
  for (const a of survivors0) {
    if (!a.visionOk) continue;
    const k = a.sceneId != null ? a.sceneId : "_";
    if (!byScene.has(k)) byScene.set(k, []);
    byScene.get(k).push(a);
  }
  // Rank prominent slots by the CD's score blended with CLIP pixel-relevance, so a
  // genuinely on-subject image wins the hero slot over a higher-talked-up but
  // weaker-matching one (CLIP 0..1 contributes up to ~30 pts against cdScore 0..100).
  // A real product SCREENSHOT is the most on-topic asset for a product film and
  // what viewers expect to SEE — give it a decisive bonus so it wins the hero slot
  // over a scraped brand image (e.g. a testimonial face) on the same scene.
  // These groups are PER SCENE, so the per-scene CLIP score from 2c is the right
  // tie-breaker where it exists: two assets can both be on-subject for the film
  // while only one of them depicts the line this particular scene speaks.
  // TIER-FIRST, but ONLY when the job actually has uploads. The upstream branch
  // swapped this unconditionally, which made source-tier the x1000 major key for
  // EVERY job and reordered the per-scene prominence cap on upload-free website
  // jobs — a render change on the no-feature path. With the guard, the
  // expression is arithmetically identical when no upload exists.
  const hasUploads = list.some((a) => a && a.source === "upload");
  const rankScore = (a) => (hasUploads ? tierFor(a) * 1000 : 0)
    + (a.cdScore || 0)
    + (typeof a.clipSceneRelevance === "number" ? a.clipSceneRelevance * 30
      : typeof a.clipRelevance === "number" ? a.clipRelevance * 30 : 0)
    + (isScreenshot(a) ? 45 : 0);
  for (const arr of byScene.values()) {
    arr.sort((x, y) => rankScore(y) - rankScore(x));
    arr.slice(Math.max(1, maxPerScene)).forEach((a) => { a.visionOk = false; a.cdProminence = "background"; });
  }

  // THE TIER LAW IS A LAW, NOT A PREFERENCE.
  //
  // system_creative_director.md tells the model an upload is "sovereign — never
  // reject; prefer hero/support prominence", and asset_priority puts it at tier
  // 100, above the user's own site captures. Nothing ENFORCED any of that: the
  // verdict parser takes whatever prominence the model returned, and both the
  // per-scene cap above and the person-demotion below can knock an asset to
  // `background` regardless of where it came from.
  //
  // Measured on a real job: a user uploaded three images through BRAND ASSETS and
  // every one came back `cdProminence:"background", visionOk:false` — which bars
  // them from every prominent slot, so the material the user explicitly chose was
  // the material least likely to appear. A model is entitled to an opinion about
  // a photo's quality; it is not entitled to overrule the person who supplied it.
  //
  // Floor, not ceiling: an upload the model liked keeps `hero`. This only lifts
  // one it pushed BELOW `support`, and never touches an explicit `reject` on
  // non-owner content (uploads are never rejected — see the delete guard above).
  for (const a of list) {
    if (!a || a.source !== "upload" || isLogo(a)) continue;
    if (a.cdProminence === "hero" || a.cdProminence === "support") continue;
    a.cdProminence = "support";
    a.visionOk = true;
    a.__tierFloored = true;
  }

  // Never zero-out: if we started with assets and deletion would leave none,
  // rescue the single highest-scored reject as a background asset.
  if (survivors0.length === 0 && visual.length > 0 && toDelete.size > 0) {
    let bestI = -1, bestScore = -1;
    for (const i of toDelete) { const sc = visual[i].cdScore || 0; if (sc > bestScore) { bestScore = sc; bestI = i; } }
    if (bestI >= 0) {
      toDelete.delete(bestI);
      visual[bestI].__rejected = false;
      visual[bestI].visionOk = false;
      visual[bestI].cdProminence = "background";
      const ri = rejectedAssets.findIndex((r) => r.path === visual[bestI].path);
      if (ri >= 0) rejectedAssets.splice(ri, 1);
      notes.push("All fetched stock was off-topic; kept the least-bad as a dim background so the film isn't barren.");
    }
  }

  // Rejected web-stock files are DELETED at the very end of this function —
  // if any later step (top-up, audio, report) throws, the fail-open path in
  // reviewAndCurate hands the ORIGINAL asset list back to the legacy gate,
  // and those assets must still exist on disk.
  const deferredDeletes = [...toDelete].map((i) => visual[i].__absPath).filter(Boolean);
  let curated = list.filter((a) => !a.__rejected);

  // ---- 4) One bounded top-up for scenes left with no asset ----
  // Full scenes (with start/duration) so a top-up asset carries real timing.
  const fullScenes = (storyboard && Array.isArray(storyboard.scenes) && storyboard.scenes.length)
    ? storyboard.scenes : (script && Array.isArray(script.scenes) ? script.scenes : []);
  const fullSceneById = new Map(fullScenes.map((s, i) => [s.id != null ? s.id : i + 1, s]));
  const assignedScenes = new Set(curated.filter((a) => a.sceneId != null).map((a) => a.sceneId));
  const gapScenes = scenes.filter((s) => !assignedScenes.has(s.id) && s.direction);
  let topUps = 0;
  const topUpAssets = [];
  for (const s of gapScenes) {
    if (topUps >= maxTopUp) { recos.push(`Scene ${s.id} (${s.purpose}) has no supporting asset — consider adding one for "${s.direction.slice(0, 60)}".`); continue; }
    const words = (s.direction.toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => !["the", "and", "with", "into", "over", "scene", "text", "screen"].includes(w)).slice(0, 3).join(" ");
    const q = [subj, words].filter(Boolean).join(" ").trim();
    if (!q) continue;
    topUps++;
    try {
      const idx = topUpAssets.length;
      const rel = `assets/images/topup_${idx}.jpg`;
      const got = await acquire({
        query: q, fallbackQueries: [words, ...fallbackQueriesFor(q)].filter(Boolean),
        type: "image", orientation, outputPath: path.join(jobDir, rel), tracker,
      }).catch(() => null);
      if (got) {
        const full = fullSceneById.get(s.id) || {};
        topUpAssets.push({
          path: path.relative(jobDir, got.path).split(path.sep).join("/"), type: "image",
          sceneId: s.id, startSec: full.start, durationSec: full.duration, style: "background",
          alt: words, width: got.width, height: got.height, ratio: got.ratio, hasAlpha: got.hasAlpha,
          license: got.license, sourceUrl: got.sourceUrl, source: got.source,
          __absPath: got.path,
        });
      } else {
        recos.push(`Wanted a top-up asset for scene ${s.id} ("${q}") but none was found — scene will carry on typography + vectors.`);
      }
    } catch { /* fail-open */ }
  }
  // Review the topped-up assets (one more chunk); keep only director-approved ones.
  if (topUpAssets.length) {
    try {
      const m = await reviewChunk({ chunk: topUpAssets, baseIndex: 0, subject: subj, categoryText, packText, scenes, orientation, tracker, signal });
      topUpAssets.forEach((a, i) => {
        const v = m.get(i);
        if (v && String(v.decision || "").trim().toLowerCase() === "reject") {
          // Only an EXPLICIT reject deletes the file.
          try { fs.unlinkSync(a.__absPath); } catch { /* noop */ }
        } else if (v) {
          const scores = normScores(v.scores);
          assetScores[a.path] = scores;
          a.cdScore = scores.overall; a.sees = v.sees || null;
          const prom = String(v.prominence || "background").toLowerCase();
          a.cdProminence = prom; a.visionOk = prom === "hero" || prom === "support";
          if (applyCraft(a, v)) craftDirected++;
          curated.push(a);
        } else {
          // No verdict (thumbnail failed, model omitted/misnumbered the entry) —
          // keep as background, same as the catch below. Deleting here destroyed
          // a freshly fetched asset for the exact scene that had none.
          a.cdProminence = "background"; a.visionOk = false; curated.push(a);
        }
      });
    } catch {
      // Couldn't review the top-ups — keep them as background (fail-open).
      for (const a of topUpAssets) { a.cdProminence = "background"; a.visionOk = false; curated.push(a); }
    }
  }

  // ---- 5) Audio (advisory) ----
  const audio = await reviewAudio({ subject: subj, script, audioPlan, sceneCount: scenes.length, tracker, signal });

  // ---- 6) Build the report ----
  const approvedAssets = curated.map((a) => ({
    path: a.path, source: a.source, sceneId: a.sceneId != null ? a.sceneId : null,
    prominence: a.cdProminence || "background", score: a.cdScore != null ? a.cdScore : null,
  }));
  const sceneAssignments = {};
  for (const a of curated) { const k = a.sceneId != null ? a.sceneId : "_unassigned"; (sceneAssignments[k] ||= []).push(a.path); }
  const screenshots = curated
    .filter((a) => a.source === "website" || a.sectionType)
    .map((a) => ({ path: a.path, sectionType: a.sectionType || "screenshot", score: a.cdScore != null ? a.cdScore : null }))
    .sort((x, y) => (y.score || 0) - (x.score || 0));
  // Quality = mean score of the SCORED approved assets. Icons/vectors (SVGs, which
  // can't be thumbnailed for scoring) and other unscored trusted assets are
  // excluded rather than counted as 0 — so an icon-only scene doesn't report a
  // misleading quality of 0. null when nothing scorable was approved.
  const approvedScores = curated.map((a) => a.cdScore).filter((n) => typeof n === "number");
  const qualityScore = approvedScores.length ? Math.round(approvedScores.reduce((s, n) => s + n, 0) / approvedScores.length) : null;
  const templateAvgKey = curated.map((a) => assetScores[a.path] && assetScores[a.path].templateCompat).filter((n) => typeof n === "number");

  if (rejectedAssets.length) notes.push(`Rejected ${rejectedAssets.length} weak/off-topic asset(s); prioritized quality over quantity.`);
  if (approvedAssets.length) notes.push(`Approved ${approvedAssets.length} asset(s); ${approvedAssets.filter((a) => a.prominence === "hero" || a.prominence === "support").length} cleared for prominent placement.`);
  if (audio.musicAnalysis && audio.musicAnalysis.keep === false && audio.musicAnalysis.suggestedQuery) {
    recos.push(`Music: consider "${audio.musicAnalysis.suggestedQuery}" — ${audio.musicAnalysis.note || "better fit for the mood"}.`);
  }

  // All fallible work is done — now it's safe to delete rejected web stock.
  for (const p of deferredDeletes) { try { fs.unlinkSync(p); } catch { /* noop */ } }

  // Strip the transient fields before returning assets to callers.
  for (const a of curated) { delete a.__absPath; delete a.__rejected; }

  const report = {
    // Coverage of the vision pass itself (see the summary log): how many of the
    // thumbnailable assets actually came back with a verdict.
    visualCount: visual.length,
    reviewedCount: verdicts.size,
    approvedAssets: approvedAssets.slice(0, 40),
    rejectedAssets: rejectedAssets.slice(0, 40),
    assetScores,
    screenshotRankings: { ranked: screenshots.slice(0, 20) },
    musicAnalysis: audio.musicAnalysis || {},
    soundEffectAnalysis: audio.soundEffectAnalysis || {},
    sceneAssignments,
    storytellingRecommendations: recos.slice(0, 20),
    templateCompatibility: {
      framePack: framePack || null,
      category: cat,
      note: "Scored against the selected frame pack (KEYFRAME's templates are frame packs).",
      averageScore: templateAvgKey.length ? Math.round(templateAvgKey.reduce((s, n) => s + n, 0) / templateAvgKey.length) : null,
    },
    qualityScore,
    category: cat,
    craftDirected,
    creativeDirectorNotes: notes.slice(0, 20),
  };

  return { assets: curated, report };
}

// Thin wrapper used by all three pipeline paths: flag-gate, run, persist the
// report to the job. Returns NULL when disabled or on any error so callers
// fall through to the legacy vision gate — returning the assets unchanged
// here would skip that gate too, and unreviewed web stock would ship with no
// visionOk at all (every prominent slot silently demoted to background).
async function reviewAndCurate({ jobId, ...rest }) {
  if (!cd().enabled) return null;
  const original = rest.assets || [];
  try {
    const { assets, report } = await directAssets(rest);
    if (jobId) { try { db.setCreativeReview(jobId, report); } catch { /* best effort */ } }
    // `reviewed/of` is the number that matters when a film comes out empty: an
    // asset the vision pass never returned a verdict for carries no evidence of
    // topicality, so the pin-relevance floor unpins it and the scene renders bare.
    // Without this count, "23 approved" looks healthy while 28 assets were never
    // looked at — the failure is invisible in the old summary.
    console.log(`[creative_director] job ${jobId || "?"}: ${report.approvedAssets.length} approved / ${report.rejectedAssets.length} rejected (vision reviewed ${report.reviewedCount}/${report.visualCount} visual asset(s)), quality=${report.qualityScore}, ${report.craftDirected} craft-directed, ${report.creativeDirectorNotes.length} note(s)`);
    return assets;
  } catch (e) {
    console.warn(`[creative_director] failed (${String(e && e.message || e).slice(0, 140)}) — ${original.length} asset(s) fall back to the legacy vision gate`);
    // directAssets mutates the shared asset objects as it works; scrub the
    // transient fields so they don't leak into db.setAssets / the composer.
    for (const a of original) { if (a) { delete a.__absPath; delete a.__rejected; } }
    return null;
  }
}

module.exports = { directAssets, reviewAndCurate };
