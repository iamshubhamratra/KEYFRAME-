// ASSET DIRECTOR — the creative + technical call on the FETCHED VISUALS, run AFTER
// the assets are gathered/relevance-gated and BEFORE the composition is built.
//
// Where the relevance gate only DROPS off-topic web stock, this agent looks at
// EVERY kept asset — screenshots, vectors and photos alike — and ACTS on it:
//   • QUALITY   — blurry / pixelated / watermarked / amateur / blank -> demote so a
//                 weak asset never cheapens a premium promo.
//   • KIND      — corrects a lying filename (a raster logo that must be CONTAINED,
//                 not cropped like a photo).
//   • FIT/FOCUS — the best crop so nothing important is cut off (a tall full-page
//                 screenshot is pinned to its hero, not its blank middle).
//   • EFFECT    — the entrance that suits the asset (a screenshot rises, an icon
//                 pops, a photo resolves from blur, a diagram draws in).
// scene_kit reads a.kind / a.fit / a.focus / a.effect / a.lowQuality when it places
// and animates each asset.
//
// One batched vision pass (chunks of 6), same cheap flash model as the relevance
// gate. FAIL-OPEN by design: any error (dead budget, un-thumbnailable file, bad
// JSON, missing verdict) leaves that asset untouched, so the director can only ever
// improve placement — never block a job or starve a film of visuals.

const fs = require("node:fs");
const path = require("node:path");
const { thumbBase64 } = require("./asset_vision");
const openrouter = require("./openrouter");
const { extractFirstJsonObject } = require("./json_lenient");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_asset_director.md"),
  "utf8",
);

const KINDS = new Set(["vector", "shot", "photo"]);
const FITS = new Set(["contain", "cover"]);
const FOCI = new Set(["top", "center", "bottom"]);
const EFFECTS = new Set(["pop", "rise", "blur-in", "zoom", "draw", "float"]);
const QUALITY = new Set(["high", "ok", "low"]);

// Keep only recognised enum values; drop anything the model invented.
function sanitize(v) {
  const o = {};
  if (v && KINDS.has(v.kind)) o.kind = v.kind;
  if (v && FITS.has(v.fit)) o.fit = v.fit;
  if (v && FOCI.has(v.focus)) o.focus = v.focus;
  if (v && EFFECTS.has(v.effect)) o.effect = v.effect;
  if (v && QUALITY.has(v.quality)) o.quality = v.quality;
  return o;
}

// -> array aligned 1:1 with `assets`, each {kind?,fit?,focus?,effect?,quality?}
//    (empty {} where the model was silent or the asset couldn't be thumbnailed).
// `assets`: [{ absPath, type:"image"|"video", query?, kindHint? }]
async function reviewAssets({ assets, subject, tracker, signal } = {}) {
  const out = (assets || []).map(() => ({}));
  if (!Array.isArray(assets) || !assets.length) return out;

  const CHUNK = 6;
  for (let start = 0; start < assets.length; start += CHUNK) {
    const chunk = assets.slice(start, start + CHUNK);
    try {
      const thumbs = [];
      // Independent per-file decodes — see the note in creative_director.reviewChunk.
      thumbs.push(...await Promise.all(chunk.map((a) => thumbBase64(a.absPath, a.type === "video").catch(() => null))));
      const usable = thumbs.map((b, i) => ({ b, i })).filter((x) => x.b);
      if (!usable.length) continue;

      const content = [{
        type: "text",
        text:
          `These ${usable.length} asset(s) were fetched for a short promo film about: "${subject || "a product"}". ` +
          `For EACH, return its kind, quality, fit, focus and entrance effect per the schema. ` +
          `The assets follow, each preceded by its number (1..${usable.length}).`,
      }];
      usable.forEach((x, n) => {
        const a = chunk[x.i] || {};
        const bits = [a.query ? `query: "${a.query}"` : "", a.kindHint ? `looks like: ${a.kindHint}` : ""].filter(Boolean).join(", ");
        content.push({ type: "text", text: `Asset ${n + 1}${bits ? ` (${bits})` : ""}:` });
        content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${x.b}` } });
      });

      const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
        system: SYSTEM,
        user: content,
        jsonMode: true,
        stage: "assetDirector",
        temperature: 0,
        signal,
      });
      if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "assetDirector", costUsd: costUsd });

      const parsed = extractFirstJsonObject(text);
      const arr = Array.isArray(parsed && parsed.assets) ? parsed.assets : [];
      const byN = new Map();
      for (const v of arr) { const n = Number(v && v.n); if (Number.isFinite(n)) byN.set(n, v); }
      usable.forEach((x, n) => { const v = byN.get(n + 1); if (v) out[start + x.i] = sanitize(v); });
    } catch {
      // fail-open: leave {} for every asset in this chunk
    }
  }
  return out;
}

// One-line log summary of what the director changed, for the pipeline console.
function summarizeReview(dirs) {
  const q = { high: 0, ok: 0, low: 0 };
  const eff = {};
  for (const d of dirs || []) {
    if (d.quality) q[d.quality] = (q[d.quality] || 0) + 1;
    if (d.effect) eff[d.effect] = (eff[d.effect] || 0) + 1;
  }
  const effStr = Object.entries(eff).map(([k, v]) => `${k}×${v}`).join(" ");
  return `quality[high:${q.high} ok:${q.ok} low:${q.low}]${effStr ? ` effects[${effStr}]` : ""}`;
}

// directAssets — the full "review the fetched visuals and act on them" step, shared
// by BOTH orchestration paths (graph.js asset_search node AND pipeline.runJob) so
// the single-shot path gets the same per-asset kind/fit/focus/effect/quality calls
// as the LangGraph path (they used to diverge — /generate skipped this entirely).
// Skips videos, skips when a creative-director craft pass already ran (avoids a
// double vision upload), no-ops without a subject. Mutates the asset objects IN
// PLACE (scene_kit reads a.kind/a.fit/a.focus/a.effect/a.lowQuality). Fail-open.
async function directAssets({ assets, jobDir, subject, tracker, signal } = {}) {
  const list = Array.isArray(assets) ? assets : [];
  const directable = list.filter((a) => a && a.type !== "video");
  const craftDone = directable.some((a) => a.fit || a.effect || a.kind);
  if (!directable.length || !subject || craftDone) return { reviewed: 0 };
  const kindHint = (a) => {
    const src = String(a.source || "");
    if (src === "website") return "website screenshot";
    if (src === "blog") return "image from the source blog post";
    if (src === "iconify" || src.startsWith("library:")) return "flat vector/icon";
    if (/\.svg($|\?)/i.test(a.path || "")) return "svg vector";
    return null;
  };
  try {
    const dirs = await reviewAssets({
      assets: directable.map((a) => ({ absPath: path.join(jobDir, a.path), type: a.type, query: a.alt, kindHint: kindHint(a) })),
      subject, tracker, signal,
    });
    dirs.forEach((d, i) => {
      const a = directable[i];
      if (d.kind) a.kind = d.kind;
      if (d.fit) a.fit = d.fit;
      if (d.focus) a.focus = d.focus;
      if (d.effect) a.effect = d.effect;
      if (d.quality) { a.quality = d.quality; if (d.quality === "low") a.lowQuality = true; }
    });
    console.log(`[asset_director] ${summarizeReview(dirs)}`);
    return { reviewed: dirs.length };
  } catch (e) {
    console.warn(`[asset_director] skipped: ${String((e && e.message) || e).slice(0, 120)}`);
    return { reviewed: 0, error: e && e.message };
  }
}

module.exports = { reviewAssets, summarizeReview, directAssets };
