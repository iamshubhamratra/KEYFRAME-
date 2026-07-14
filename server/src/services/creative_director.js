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

// Compact scene plan for the prompt: id + purpose + a short direction line.
function sceneDigest(storyboard, script) {
  const scenes = (storyboard && Array.isArray(storyboard.scenes) && storyboard.scenes.length)
    ? storyboard.scenes
    : (script && Array.isArray(script.scenes) ? script.scenes : []);
  return scenes.slice(0, 12).map((s, i) => ({
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
const SCORE_KEYS = ["relevance", "visualQuality", "brandCompat", "storytelling", "motionPotential", "templateCompat"];

function normScores(raw) {
  const out = {};
  let sum = 0;
  for (const k of SCORE_KEYS) { out[k] = clamp100(raw && raw[k]); sum += out[k]; }
  out.overall = Math.round(sum / SCORE_KEYS.length);
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
      isWebStock(a) ? "web-stock (rejectable)" : "trusted (owned/curated — do not reject for relevance)",
    ].filter(Boolean).join(" · ");
    content.push({ type: "text", text: `Asset ${n + 1} (${meta}):` });
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${x.b}` } });
  });

  const { text, tokensIn, tokensOut } = await openrouter.chat({
    system: SYSTEM, user: content, jsonMode: true, stage: "creative_director",
    model: cd().model, temperature: 0, signal,
  });
  if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "creative_director" });

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
    const { text, tokensIn, tokensOut } = await openrouter.chat({
      system: "You are a meticulous audio director for premium promo videos. Strict JSON only.",
      user, jsonMode: true, stage: "creative_director", model: cd().model, temperature: 0.2, signal,
    });
    if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "creative_director" });
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

  const visual = list.filter((a) => a && (a.type === "image" || a.type === "video") && a.__absPath && fs.existsSync(a.__absPath));

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
  const validSceneIds = new Set(scenes.map((s) => Number(s.id)).filter(Number.isFinite));
  const assetScores = {};
  const rejectedAssets = [];
  const toDelete = new Set(); // indices into `visual`
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
    // Number-normalize: JSON-mode models often return scene ids as strings
    // ("3" vs 3), and validSceneIds.has() is strict-typed — without this,
    // every scene assignment silently drops.
    const sid = Number(v.assignScene);
    if (v.assignScene != null && Number.isFinite(sid) && validSceneIds.has(sid)) {
      a.sceneId = sid;
    }
    if (v.sectionType) a.sectionType = String(v.sectionType).slice(0, 20);

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
  // Rank prominent slots by the CD's score blended with CLIP pixel-relevance, so a
  // genuinely on-subject image wins the hero slot over a higher-talked-up but
  // weaker-matching one (CLIP 0..1 contributes up to ~30 pts against cdScore 0..100).
  const rankScore = (a) => (a.cdScore || 0) + (typeof a.clipRelevance === "number" ? a.clipRelevance * 30 : 0);
  for (const arr of byScene.values()) {
    arr.sort((x, y) => rankScore(y) - rankScore(x));
    arr.slice(Math.max(1, maxPerScene)).forEach((a) => { a.visionOk = false; a.cdProminence = "background"; });
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
    console.log(`[creative_director] job ${jobId || "?"}: ${report.approvedAssets.length} approved / ${report.rejectedAssets.length} rejected, quality=${report.qualityScore}, ${report.creativeDirectorNotes.length} note(s)`);
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
