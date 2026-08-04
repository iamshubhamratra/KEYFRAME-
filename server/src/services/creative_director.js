// Creative Director agent — the final creative authority between Asset Collection
// and Composition. It reviews EVERY collected visual asset with a vision LLM,
// scores it on six dimensions, approves/rejects/re-ranks, assigns each to a scene,
// ranks screenshots, gives advisory notes on music/SFX, and can trigger ONE bounded
// top-up fetch to fill a scene left empty. It supersedes the simpler keep/reject
// vision gate (asset_vision.js) with a richer verdict.
//
// Its decisions take effect deterministically in the scene-kit composer, which
// already honors `asset.visionOk` (prominence) and `asset.sceneId` (placement) —
// so no composer changes are needed. Rejected web-stock files are deleted.
//
// FAIL-OPEN by design (mirrors asset_vision.js): any failure — dead LLM budget,
// missing ffmpeg, parse error — returns the assets UNCHANGED. The Creative
// Director must never make a video worse by starving it of assets.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const db = require("../db");
const openrouter = require("./openrouter");
const { extractFirstJsonObject } = require("./json_lenient");
const { thumbBase64 } = require("./media");
const frameRegistry = require("./frame_registry");
const frameManifest = require("./frame_manifest");
const { acquire } = require("./asset_sources");
const taxonomy = require("./asset_taxonomy");
const clip = require("./asset_clip");
const { rankKey, isLogo, isOwned, categorize, assetConfidence, WEBSITE_ASSET_SOURCE, WEBSITE_BRAND_SOURCE } = require("./asset_priority");

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

function cd() {
  return config.creativeDirector || { enabled: true, maxPerScene: 2, maxTopUp: 3, chunkSize: 6, minScore: 45, rejectScore: 25 };
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

// Compact scene plan for the prompt: id + purpose + a short direction line.
function sceneDigest(storyboard, script) {
  const scenes = (storyboard && Array.isArray(storyboard.scenes) && storyboard.scenes.length)
    ? storyboard.scenes
    : (script && Array.isArray(script.scenes) ? script.scenes : []);
  // Digest ALL scenes (schema cap is 24). The old slice(0,12) hid scenes 13-24
  // from the director, so validSceneIds excluded them and any asset the director
  // would assign to a later scene was silently discarded to "_unassigned".
  return scenes.slice(0, 24).map((s, i) => ({
    id: s.id != null ? s.id : i + 1,
    purpose: String(s.purpose || "").slice(0, 40),
    direction: String(s.visualDirection || s.headline || s.subtext || "").slice(0, 140),
  }));
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

// THE RUBRIC. Two problems with the old six-dimension unweighted mean:
//
//  1. It DOUBLE-COUNTED template fit. `brandCompat` was defined in the prompt as "fits
//     the template's colors, style, industry" and `templateCompat` as "how well it fits
//     this selected frame pack" — the same question, so template fit carried 2/6 of the
//     score while nothing measured the brand itself.
//  2. READABILITY was absent. The single most consequential property of an image in a
//     motion-graphics film is whether display type can sit on it and stay legible, and
//     it was not scored at all — so a gorgeous, busy photo out-ranked a calm one with
//     usable negative space, and the QA agent caught the contrast failure two stages
//     later, after the render.
//
// Weights, not a flat mean: relevance and readability decide whether an asset helps or
// hurts; motionPotential is a nice-to-have. They sum to 1.
const SCORE_WEIGHTS = {
  relevance: 0.26,
  readability: 0.20,
  visualQuality: 0.18,
  storytelling: 0.14,
  templateCompat: 0.10,
  brandAlignment: 0.07,
  motionPotential: 0.05,
};
const SCORE_KEYS = Object.keys(SCORE_WEIGHTS);
// A model still answering the previous rubric returns brandCompat; read it as the
// template dimension it actually described, so an old/cached reply never scores 0.
const SCORE_ALIASES = { brandCompat: "templateCompat" };

// Normalize a verdict's scores into the canonical set + a weighted `overall`.
//
// MISSING DIMENSIONS ARE NOT ZEROS. A terse model that omits `readability` must not be
// read as "readability: 0" — with a quality floor downstream that would reject half the
// assets in the film for a wording problem. An absent dimension inherits the mean of
// the ones that ARE present, and `overall` is null when the model returned nothing
// numeric at all (the floor then does not apply — fail-open, as everywhere else).
function normScores(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const present = {};
  for (const k of SCORE_KEYS) {
    if (Number.isFinite(Number(src[k]))) present[k] = clamp100(src[k]);
  }
  for (const [alias, target] of Object.entries(SCORE_ALIASES)) {
    if (present[target] === undefined && Number.isFinite(Number(src[alias]))) present[target] = clamp100(src[alias]);
  }
  const vals = Object.values(present);
  if (!vals.length) {
    const out = {};
    for (const k of SCORE_KEYS) out[k] = null;
    out.overall = null;
    return out;
  }
  const mean = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  const out = {};
  let weighted = 0;
  for (const k of SCORE_KEYS) {
    out[k] = present[k] !== undefined ? present[k] : mean;   // inherit, never zero
    weighted += out[k] * SCORE_WEIGHTS[k];
  }
  out.overall = Math.round(weighted);
  out.scoredDimensions = vals.length;   // how much of the rubric the model actually answered
  return out;
}

// One batched vision review over up to `chunkSize` assets. Returns a Map keyed by
// the ABSOLUTE index into `assets` -> verdict object, or an empty Map on failure
// (fail-open: callers leave those assets untouched).
async function reviewChunk({ chunk, baseIndex, subject, categoryText, packText, scenes, orientation, tracker, signal }) {
  const thumbs = [];
  for (const a of chunk) {
    const abs = a.__absPath;
    thumbs.push(abs ? await thumbBase64(abs, a.type === "video") : null);
  }
  const usable = thumbs.map((b, i) => ({ b, i })).filter((x) => x.b);
  if (!usable.length) return new Map();

  const header = [
    `FILM SUBJECT: "${subject || "(unspecified)"}".`,
    categoryText || "",
    packText,
    orientation ? `Video orientation: ${orientation} — reject or down-rank an asset whose shape can't fill a ${orientation} frame without cropping away its subject.` : "",
    `SCENE PLAN: ${JSON.stringify(scenes)}`,
    `Review the ${usable.length} asset(s) below. For EACH, return a verdict per your instructions. ` +
    `assignScene must be one of the scene ids above (or null). Reply STRICT JSON: {"verdicts":[...]} with exactly one entry per asset, numbered 1..${usable.length}.`,
  ].filter(Boolean).join("\n\n");

  const content = [{ type: "text", text: header }];
  usable.forEach((x, n) => {
    const a = chunk[x.i];
    const clipHint = typeof a.clipRelevance === "number"
      ? `CLIP subject-match: ${a.clipRelevance} (${a.clipRelevance < 0.15 ? "LOW — likely off-topic" : a.clipRelevance > 0.5 ? "high" : "moderate"})`
      : "";
    const meta = [
      `source: ${a.source || "?"}`,
      a.alt ? `query: "${String(a.alt).slice(0, 60)}"` : "",
      `type: ${a.type}`,
      a.width && a.height ? `dims: ${a.width}x${a.height}` : "",
      clipHint,
      a.source === "upload"
        ? "THE USER'S OWN UPLOAD (sovereign — never reject; assess honestly and prefer hero/support prominence)"
        : a.source === WEBSITE_ASSET_SOURCE
          ? "the brand's OWN site imagery, harvested from their homepage — assess RELEVANCE honestly: hero/support if it's an on-story product/brand visual, background if it is off-story, decorative, or partial. Never DELETE it (it's owner content, not stock), just demote."
          : isWebStock(a) ? "web-stock (rejectable)" : "trusted (owned/curated — do not reject for relevance)",
    ].filter(Boolean).join(" · ");
    content.push({ type: "text", text: `Asset ${n + 1} (${meta}):` });
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${x.b}` } });
  });

  const { text, tokensIn, tokensOut, model: servedModel, provider: servedBy } = await openrouter.chat({
    // No explicit `model`: passing one pins the call to that model with no fallback.
    // config.js mirrors creativeDirector.model into llm.primary.stageModels, so the
    // stage dispatches to that KIE model and still gets the fallback leg behind it.
    // NOTE: this is the VISION path — the model here must be vision-capable.
    system: SYSTEM, user: content, jsonMode: true, stage: "creative_director",
    temperature: 0, signal,
  });
  if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "creative_director", model: servedModel, provider: servedBy });

  const parsed = extractFirstJsonObject(text);
  const verdicts = Array.isArray(parsed && parsed.verdicts) ? parsed.verdicts : [];
  // Key verdicts by the model-returned `n` when present, but fall back to array
  // position (1-based) when the model omits/mis-numbers it — otherwise a single
  // missing `n` dropped EVERY verdict in the chunk and its assets passed through
  // unreviewed (fail-open). Assets are sent in order, so position is a safe key.
  const byN = new Map();
  verdicts.forEach((v, i) => {
    const n = Number(v && v.n);
    const key = Number.isFinite(n) ? n : i + 1;
    if (!byN.has(key)) byN.set(key, v);
  });

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
    const { text, tokensIn, tokensOut, model: servedModel, provider: servedBy } = await openrouter.chat({
      system: "You are a meticulous audio director for premium promo videos. Strict JSON only.",
      // KIE-first (see the soundtrack review's sibling call above) — no explicit model.
      user, jsonMode: true, stage: "creative_director", temperature: 0.2, signal,
    });
    if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "creative_director", model: servedModel, provider: servedBy });
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
async function directAssets({ storyboard, script, subject, brief, framePack, assets, audioPlan, tracker, signal, jobDir, orientation, category, maxTopUp: maxTopUpOverride }) {
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
  const { maxPerScene, maxTopUp: cfgTopUp, chunkSize } = cd();
  // Duration-adaptive CD net-new fetch ceiling: the caller (graph) passes a budget-scaled
  // maxTopUp so a long film isn't bottlenecked at the fixed default; falls back to config.
  const maxTopUp = Number.isFinite(maxTopUpOverride) ? Math.max(0, Math.round(maxTopUpOverride)) : cfgTopUp;

  // Attach absolute paths for thumbnailing (assets carry jobDir-relative paths).
  for (const a of list) a.__absPath = a && a.path ? path.join(jobDir, a.path) : null;

  // The user's LOGO never enters the review at all — the rubric rightly rejects
  // "logos/watermarks" as stock-imagery defects, and the one logo that ISN'T a
  // defect is the user's own, about which vision has nothing to decide. It rides
  // the asset list untouched (key-moment treatment happens in the composers).
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
  const verdicts = new Map(); // absolute index in `visual` -> verdict
  for (let start = 0; start < visual.length; start += chunkSize) {
    const chunk = visual.slice(start, start + chunkSize);
    try {
      const m = await reviewChunk({ chunk, baseIndex: start, subject: subj, categoryText, packText, scenes, orientation, tracker, signal });
      for (const [k, v] of m) verdicts.set(k, v);
    } catch (e) {
      // Fail-open for this chunk — its assets keep whatever flags they already had.
      notes.push(`Vision review skipped for ${chunk.length} asset(s): ${String(e && e.message || e).slice(0, 80)}`);
    }
  }

  // ---- 2) Apply verdicts (annotate; collect rejects) ----
  const validSceneIds = new Set(scenes.map((s) => s.id));
  const assetScores = {};
  const rejectedAssets = [];
  const toDelete = new Set(); // indices into `visual`
  // Screenshot Intelligence QA demotions (website screenshots the CD's vision
  // verdict flagged as popup-covered / loading / broken) — for disclosure.
  const si = config.screenshotIntelligence || {};
  const screenshotDemotions = [];
  // Quality-floor actions, for the report + the log line.
  const floorEvents = [];
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
    if (typeof v.assignScene !== "undefined" && v.assignScene !== null && validSceneIds.has(v.assignScene)) {
      a.sceneId = v.assignScene;
    }
    if (v.sectionType) a.sectionType = String(v.sectionType).slice(0, 20);

    // ---- QUALITY FLOOR ----------------------------------------------------------
    // Approval was a pure LLM boolean: an asset the model scored 20 shipped exactly
    // like one it scored 95, because `overall` was computed and then never compared to
    // anything. A director that says "this is weak" and places it prominently anyway
    // is not directing. The floor turns the score into a decision:
    //
    //   below rejectScore + web stock  → rejected (and the file deleted, as with any reject)
    //   below minScore                 → demoted to background B-roll (never deleted)
    //
    // OWNER CONTENT IS EXEMPT (uploads / the user's own site captures / their harvested
    // logo). The tier law says those are sovereign — the user's own dashboard is the
    // film's subject even if a stock model would score it a 40, and capture-integrity
    // problems are already handled by the screenshot QA axis below. The floor exists to
    // stop weak STOCK, not to overrule the customer about their own product.
    const floorCfg = cd();
    const minScore = Number.isFinite(floorCfg.minScore) ? floorCfg.minScore : 45;
    const rejectScore = Number.isFinite(floorCfg.rejectScore) ? floorCfg.rejectScore : 25;
    let floorAction = null;
    if (scores.overall != null && !isOwned(a) && !isLogo(a)) {
      if (scores.overall < rejectScore && isWebStock(a)) floorAction = "reject";
      else if (scores.overall < minScore) floorAction = "demote";
    }
    a.floorPassed = scores.overall == null ? null : floorAction === null;

    const rejected = String(v.decision || "").toLowerCase() === "reject"
      || a.cdProminence === "reject"
      || floorAction === "reject";
    if (floorAction) {
      floorEvents.push({ path: path.basename(a.path), score: scores.overall, action: floorAction, source: a.source || null });
    }
    if (rejected && isWebStock(a)) {
      // Only real web stock is deleted. Trusted content (screenshots, curated,
      // iconify) is never deleted — at worst demoted to background below.
      toDelete.add(i);
      rejectedAssets.push({
        path: a.path, source: a.source,
        reason: floorAction === "reject"
          ? `below the quality floor (scored ${scores.overall}/100)${v.note ? ` — ${String(v.note).slice(0, 80)}` : ""}`
          : String(v.note || "").slice(0, 120),
        sees: a.sees || null,
      });
      a.__rejected = true;
    } else {
      // visionOk gates PROMINENT slots in scene_kit (montage/split/hero). A reject
      // verdict on a non-web-stock asset (screenshots/uploads/curated/harvested — never
      // DELETED) must always DEMOTE, never promote: honor the reject even if the model
      // paired decision:"reject" with prominence:"hero"/"support".
      a.visionOk = !rejected && (a.cdProminence === "hero" || a.cdProminence === "support");
      // A floor DEMOTE lands here: keep the file, but take it out of the prominent
      // slots. __layoutDemoted is the lever scene_kit.prominentOk honors on EVERY
      // pipeline (directLayout runs only in the graph path), so the demotion holds
      // even when the Visual Layout Director never runs.
      if (floorAction === "demote") {
        a.visionOk = false;
        a.cdProminence = "background";
        a.__layoutDemoted = true;
      }
    }

    // SCREENSHOT INTELLIGENCE (QA axis, source website only): the CD's SAME vision
    // verdict now also reports popup residue / completeness / obstruction (see
    // system_creative_director.md). This is a QA signal, NOT a relevance reject —
    // screenshots keep their relevance sovereignty (never deleted). A popup-covered
    // or loading/broken/empty shot is force-DEMOTED to background B-roll via
    // __layoutDemoted (the ONE lever scene_kit.prominentOk honors on EVERY pipeline,
    // since directLayout runs only in the graph path) and disclosed. Fail-open:
    // absent fields → no demotion → today's behavior.
    // Popup/loading/broken QA is a SCREENSHOT-CAPTURE concern — it applies to real
    // website screenshots and to harvested imagery ONLY when it is itself a captured
    // UI screenshot (kindHint "screenshot"). A designed brand graphic (a hero/marketing/
    // illustration harvested asset) must NOT be force-demoted for "popup coverage" it
    // can only fail spuriously (its intentional promo copy read as a popup); those are
    // relevance-scored by the CD instead. Demotions are tagged with the source so the
    // disclosure never mislabels a down-ranked brand graphic as a thrown-away screenshot.
    const qaEligible = a.source === "website" || (a.source === WEBSITE_ASSET_SOURCE && a.kindHint === "screenshot");
    if (si.enabled && qaEligible && !a.__rejected && !isLogo(a)) {
      const cov = Number(v.popupCoverage);
      const comp = String(v.completeness || "").toLowerCase();
      const demotePct = Number.isFinite(si.popupDemotePct) ? si.popupDemotePct : 15;
      const rejectPct = Number.isFinite(si.popupRejectPct) ? si.popupRejectPct : 35;
      const incomplete = si.demoteOnIncomplete !== false && ["loading", "broken", "empty"].includes(comp);
      const popupBad = Number.isFinite(cov) && cov > demotePct;
      // SEVERITY SPLIT (the audit's finding). The old code had exactly one lever —
      // demote to background — so a shot with a consent banner across 85% of the
      // frame was still rendered, just smaller and dimmer. That is not a B-roll
      // asset, it is a broken one: a third of the frame eaten by someone else's UI
      // makes the shot unusable at ANY size. Above `popupRejectPct` (and for a
      // broken/empty render) the screenshot is REMOVED from the wire; the milder
      // band keeps the original demote-to-background behaviour.
      //
      // Screenshots keep their relevance sovereignty — this is not the CD second-
      // guessing whether the shot is on-story, it is a mechanical capture-integrity
      // failure, the one thing a screenshot cannot argue its way out of.
      const popupFatal = Number.isFinite(cov) && cov > rejectPct;
      const renderFatal = ["broken", "empty"].includes(comp);
      if (popupFatal || renderFatal) {
        a.__rejected = true;
        a.__captureUnusable = true;
        a.visionOk = false;
        a.cdProminence = "reject";
        toDelete.add(i);
        rejectedAssets.push({
          path: a.path, source: a.source,
          reason: renderFatal
            ? `capture is ${comp} — nothing usable rendered`
            : `obstructed: ${v.obstruction || "overlay"} covers ~${Math.round(cov)}% of the frame`,
          sees: a.sees || null,
        });
        screenshotDemotions.push({
          path: path.basename(a.path), source: a.source,
          reason: renderFatal ? comp : "popup",
          action: "rejected",
          coveragePct: Number.isFinite(cov) ? Math.round(cov) : null,
          obstruction: v.obstruction ? String(v.obstruction).slice(0, 16) : null,
        });
      } else if (popupBad || incomplete) {
        a.__layoutDemoted = true;
        a.visionOk = false;
        a.cdProminence = "background";
        screenshotDemotions.push({
          path: path.basename(a.path),
          source: a.source,
          reason: incomplete ? comp : "popup",
          action: "demoted",
          coveragePct: Number.isFinite(cov) ? Math.round(cov) : null,
          obstruction: v.obstruction ? String(v.obstruction).slice(0, 16) : null,
        });
      }
    }
  });

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
  // Rank prominent slots TIER-FIRST (the user's uploads > their site's captures >
  // curated > stock — asset_priority.rankKey makes tier the ×1000 major key), then
  // by the CD's score blended with CLIP pixel-relevance within a tier. This is the
  // line that used to be tier-BLIND: a lucky stock photo could out-score the user's
  // own dashboard and demote it out of the prominent slots it was uploaded for.
  const rankScore = (a) => rankKey(a, (a.cdScore || 0) + (typeof a.clipRelevance === "number" ? a.clipRelevance * 30 : 0));
  for (const arr of byScene.values()) {
    arr.sort((x, y) => rankScore(y) - rankScore(x));
    arr.slice(Math.max(1, maxPerScene)).forEach((a) => { a.visionOk = false; a.cdProminence = "background"; });
  }

  // Never zero-out: if we started with assets and deletion would leave none,
  // rescue the single highest-scored reject as a background asset.
  if (survivors0.length === 0 && visual.length > 0 && toDelete.size > 0) {
    let bestI = -1, bestScore = -1;
    for (const i of toDelete) {
      // Never rescue a capture-integrity failure. "Least-bad" is a judgement about
      // RELEVANCE — a shot with a consent banner across it is not less relevant, it
      // is mechanically broken, and putting it back dim would reinstate exactly the
      // defect this rejection exists to remove. A barren film is the honest outcome;
      // the validation gate reports it rather than hiding it.
      if (visual[i].__captureUnusable) continue;
      const sc = visual[i].cdScore || 0; if (sc > bestScore) { bestScore = sc; bestI = i; }
    }
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

  // Delete rejected web-stock files.
  for (const i of toDelete) { try { fs.unlinkSync(visual[i].__absPath); } catch { /* noop */ } }
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
        if (v && String(v.decision || "").toLowerCase() === "reject") {
          // An explicit reject is the only thing that deletes a top-up.
          try { fs.unlinkSync(a.__absPath); } catch { /* noop */ }
          return;
        }
        if (!v) {
          // UNREVIEWED != rejected. The main review loop leaves an unreviewed asset
          // untouched (fail-open, line ~280); this branch used to DELETE it, so a
          // top-up whose thumbnail simply failed to generate was destroyed while the
          // identical failure upstream was forgiven. Keep it as background B-roll.
          a.cdProminence = "background"; a.visionOk = false;
          curated.push(a);
          return;
        }
        const scores = normScores(v.scores);
        assetScores[a.path] = scores;
        a.cdScore = scores.overall; a.sees = v.sees || null;
        const prom = String(v.prominence || "background").toLowerCase();
        a.cdProminence = prom; a.visionOk = prom === "hero" || prom === "support";
        curated.push(a);
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
    // Real captured screenshots only — a harvested brand graphic the CD happened to give
    // a sectionType is NOT a "screenshot" and must not appear in the screenshot rankings.
    .filter((a) => a.source === "website" || (a.source === WEBSITE_ASSET_SOURCE && a.kindHint === "screenshot"))
    .map((a) => ({ path: a.path, sectionType: a.sectionType || "screenshot", score: a.cdScore != null ? a.cdScore : null }))
    .sort((x, y) => (y.score || 0) - (x.score || 0));
  // Quality = mean score of the SCORED approved assets. Icons/vectors (SVGs, which
  // can't be thumbnailed for scoring) and other unscored trusted assets are
  // excluded rather than counted as 0 — so an icon-only scene doesn't report a
  // misleading quality of 0. null when nothing scorable was approved.
  const approvedScores = curated.map((a) => a.cdScore).filter((n) => typeof n === "number");
  const qualityScore = approvedScores.length ? Math.round(approvedScores.reduce((s, n) => s + n, 0) / approvedScores.length) : null;
  const templateAvgKey = curated.map((a) => assetScores[a.path] && assetScores[a.path].templateCompat).filter((n) => typeof n === "number");

  const floorRejected = floorEvents.filter((f) => f.action === "reject").length;
  const floorDemoted = floorEvents.filter((f) => f.action === "demote").length;
  if (floorRejected || floorDemoted) {
    notes.push(
      `Quality floor (${Number.isFinite(cd().minScore) ? cd().minScore : 45}/100): ` +
      [floorRejected ? `rejected ${floorRejected}` : "", floorDemoted ? `demoted ${floorDemoted} to background` : ""]
        .filter(Boolean).join(", ") + ". Weak stock is no longer placed as though it were strong."
    );
  }
  if (rejectedAssets.length) notes.push(`Rejected ${rejectedAssets.length} weak/off-topic asset(s); prioritized quality over quantity.`);
  if (approvedAssets.length) notes.push(`Approved ${approvedAssets.length} asset(s); ${approvedAssets.filter((a) => a.prominence === "hero" || a.prominence === "support").length} cleared for prominent placement.`);
  if (audio.musicAnalysis && audio.musicAnalysis.keep === false && audio.musicAnalysis.suggestedQuery) {
    recos.push(`Music: consider "${audio.musicAnalysis.suggestedQuery}" — ${audio.musicAnalysis.note || "better fit for the mood"}.`);
  }

  // Strip the transient absolute-path field before returning assets to callers, and
  // stamp the unified Asset-Intelligence taxonomy: a single canonical `category` (logo/
  // screenshot/dashboard/product/team/illustration/marketing/icon/decorative/background)
  // + a 0..1 `confidence` blended from the CD's own vision score (cdScore) and CLIP
  // relevance. Both ride the asset record to the UI/disclosure; deterministic, fail-open.
  for (const a of curated) {
    delete a.__absPath;
    a.category = categorize(a);
    a.confidence = assetConfidence(a);
  }

  const report = {
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
    // The floor is disclosure material: "why is my stock photo dim?" has an answer now.
    qualityFloor: {
      minScore: Number.isFinite(cd().minScore) ? cd().minScore : 45,
      rejectScore: Number.isFinite(cd().rejectScore) ? cd().rejectScore : 25,
      rejected: floorRejected,
      demoted: floorDemoted,
      events: floorEvents.slice(0, 20),
    },
    category: cat,
    creativeDirectorNotes: notes.slice(0, 20),
  };

  return { assets: curated, report, screenshotDemotions };
}

// Thin wrapper used by all three pipeline paths: flag-gate, run, persist the
// report to the job, and ALWAYS fail-open to the original assets on any error.
//
// `onReview` is how the director's non-asset findings reach the agents that can act on
// them. Its audio verdict (does this music fit the film? which SFX are cheap or
// redundant?) used to be written to the DB and read by nobody — a paid LLM call whose
// output dead-ended one node before the Audio Director, which plans the entire mix and
// had no way to know the bed it is balancing is the wrong genre. Callers pass a
// collector; the report still lands on the job for the UI either way.
async function reviewAndCurate({ jobId, onReview, ...rest }) {
  if (!cd().enabled) return rest.assets || [];
  const original = rest.assets || [];
  try {
    const { assets, report, screenshotDemotions } = await directAssets(rest);
    if (jobId) { try { db.setCreativeReview(jobId, report); } catch { /* best effort */ } }
    if (typeof onReview === "function") { try { onReview(report); } catch { /* a consumer's failure never costs us the curation */ } }
    // Merge the QA demotions into the intake-written screenshot review (disclosure).
    if (jobId && screenshotDemotions && screenshotDemotions.length) {
      try { db.setScreenshotReview(jobId, { demoted: screenshotDemotions }); } catch { /* best effort */ }
    }
    console.log(`[creative_director] job ${jobId || "?"}: ${report.approvedAssets.length} approved / ${report.rejectedAssets.length} rejected, quality=${report.qualityScore}, ${report.creativeDirectorNotes.length} note(s)`);
    return assets;
  } catch (e) {
    console.warn(`[creative_director] failed (${String(e && e.message || e).slice(0, 140)}) — passing ${original.length} asset(s) through unchanged`);
    return original;
  }
}

module.exports = { directAssets, reviewAndCurate };
