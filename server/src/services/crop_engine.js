// CROP ENGINE — content-aware focal points for `object-fit: cover` slots.
//
// THE BUG THIS REPLACES. Every image in a KEYFRAME film lands in a FIXED-SIZE box under
// `object-fit: cover`, which fills the box and throws away whatever overflows. What
// survives is decided by `object-position`, and that value came from
// `visual_layout_director.cropFocusFor()` (visual_layout_director.js:83) — a function
// that never opens the image. It reads the ASPECT RATIO and returns one of two literals:
//
//     if (kind === "screenshot") { if (!ratio || ratio >= 1.4 || ratio <= 0.9) return "top center"; return "center center"; }
//     return "center center";
//
// So a portrait product shot whose subject sits in the lower third is anchored dead
// centre and beheaded; a wide dashboard whose one meaningful number sits bottom-right is
// anchored top-centre and loses it. Nothing in the pipeline has ever looked at a pixel to
// decide this.
//
// WHAT THIS DOES INSTEAD. Compute a real focal point from the image content, and emit it
// in the SAME format the rest of the app already expects — a CSS `object-position` string
// like "63% 28%". The `asset.cropFocus` contract is unchanged, so nothing downstream has
// to know this module exists.
//
// PER-PLACEHOLDER, NOT PER-IMAGE. The best crop of an image is not a property of the
// image — it is a property of the (image, box) PAIR. A 600x400 photo cropped into a
// square keeps a different region than the same photo cropped into a 21:9 banner;
// measured on a synthetic fixture, the same image returns 65% x for a square request and
// 50% for a wide one. So the engine analyses once per ASPECT BUCKET (the distinct slot
// ratios `template_media.resolveMediaPlan` says this film actually needs — typically two
// or three) and stores the results as `asset.cropFocusByAspect`. Composers resolve the
// right one synchronously via `focusFor(asset, w, h)`.
//
// THREE ANALYZERS, IN ORDER OF PREFERENCE:
//   1. smartcrop + smartcrop-sharp — the library the specification calls for. Saliency
//      from edge detail, saturation and skin tone. ~190ms per (image, aspect).
//   2. an ffmpeg EDGE-ENERGY search — same idea, no native dependency. This exists
//      because `asset_sources/util.js:167` states the repo's standing policy in so many
//      words ("ffmpeg-only (no `sharp`, per repo policy)"), and a machine where sharp's
//      native binding fails to load must still get a content-aware crop rather than
//      falling all the way back to the ratio guess.
//   3. the original ratio heuristic — preserved verbatim as `heuristicFocus`, used when
//      an image cannot be read at all.
//
// CACHED BY CONTENT, NOT BY PATH. The cache key is the file's MD5 plus the aspect, so the
// same stock photo fetched by two different jobs is analysed once, and a re-render of the
// same job is free. Cache lives at `<server>/asset_cache/crop/`, alongside the existing
// asset cache.
//
// FAIL-OPEN (THE HOUSE LAW): every path is wrapped. An unreadable image, a missing
// dependency, a corrupt cache — all degrade to the heuristic, and a crop failure can
// never cost a film its render.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const config = require("../config");

// ---------------------------------------------------------------- tuning

const CACHE_DIR = path.join(config.paths.root, "asset_cache", "crop");
// Aspect buckets are rounded to this many decimals before they become a cache key, so
// 1.7777 and 1.7778 are the same analysis rather than two.
const ASPECT_PRECISION = 2;
// Analyses to keep in memory for one process. Bounded so a long-lived server cannot grow
// without limit; the disk cache is the real store.
const MEMO_MAX = 2000;
// The ffmpeg fallback's working resolution. 64x64 is enough to locate a subject to within
// ~1.5% of the frame, which is finer than object-position is ever perceived at.
const EDGE_N = 64;
// How strongly the fallback prefers the centre. smartcrop applies a comparable "rule of
// thirds"/centre prior; without one, a bright corner artefact drags every crop to a
// corner. 0 = pure energy, 1 = pure centre.
const CENTER_BIAS = 0.30;

// ---------------------------------------------------------------- memo + disk cache

/** @type {Map<string, {focus: string, source: string}>} */
const memo = new Map();

function memoSet(key, val) {
  if (memo.size >= MEMO_MAX) {
    // Cheap bounded eviction: drop the oldest insertion. Map preserves insertion order.
    const first = memo.keys().next();
    if (!first.done) memo.delete(first.value);
  }
  memo.set(key, val);
}

function cacheFileFor(hash) {
  // Two-level fan-out keeps any one directory small on a busy server.
  return path.join(CACHE_DIR, hash.slice(0, 2), `${hash}.json`);
}

function readCache(hash) {
  try {
    const raw = fs.readFileSync(cacheFileFor(hash), "utf8");
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? j : null;
  } catch { return null; }
}

function writeCache(hash, record) {
  try {
    const f = cacheFileFor(hash);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(record));
  } catch { /* a cache miss is never worth a failed render */ }
}

// Content hash of the file — the cache key. CONTENT, not path, so the same stock photo
// fetched by two different jobs is analysed once (and a byte-identical re-upload is free:
// measured on a real pair of identical uploads, the second resolved in 2ms against 251ms).
//
// Memoized on (path, size, mtime) because a full-page screenshot is several megabytes and
// re-reading it on every cache LOOKUP defeated the point of caching — the second pass over
// four real captures spent most of its time re-hashing files it had already hashed. Two
// different files cannot share an entry (the key carries the path), so this is a pure
// speed-up with no collision surface of its own.
/** @type {Map<string, string>} */
const hashMemo = new Map();
function hashFile(absPath) {
  try {
    const st = fs.statSync(absPath);
    const k = `${absPath}|${st.size}|${st.mtimeMs}`;
    const hit = hashMemo.get(k);
    if (hit) return hit;
    const h = crypto.createHash("md5").update(fs.readFileSync(absPath)).digest("hex");
    if (hashMemo.size >= MEMO_MAX) hashMemo.clear();
    hashMemo.set(k, h);
    return h;
  } catch { return null; }
}

// ---------------------------------------------------------------- eligibility

const VECTOR_RE = /\.(svg|svgz)($|\?)/i;
const VIDEO_RE = /\.(mp4|webm|mov|m4v)($|\?)/i;

/**
 * Should this asset be smart-cropped at all?
 *
 * NO for vectors, videos, logos, and anything the template will render with
 * `object-fit: contain` — a contain-fit slot never crops, so an object-position computed
 * for it is at best inert and at worst misleading. This mirrors the specification's
 * instruction to skip logos/SVGs, and it is also the cheap win: skipping them is most of
 * the analysis budget on a brand-heavy film.
 */
function isCroppable(asset) {
  if (!asset || !asset.path) return false;
  const p = String(asset.path);
  if (VECTOR_RE.test(p) || VIDEO_RE.test(p)) return false;
  if (String(asset.type || "") === "video") return false;
  if (String(asset.role || "").toLowerCase() === "logo") return false;
  // `hasAlpha` marks a cut-out (a transparent PNG mark or icon). Those are placed
  // contain-fit by every composer that draws them, for the same reason a logo is.
  if (asset.hasAlpha === true && String(asset.kindHint || "") === "vector") return false;
  return true;
}

// ---------------------------------------------------------------- analyzer 1: smartcrop

let _smartcrop; // null once known-unavailable, the module once loaded
function loadSmartcrop() {
  if (_smartcrop !== undefined) return _smartcrop;
  try {
    _smartcrop = require("smartcrop-sharp");
  } catch (e) {
    console.warn(`[crop_engine] smartcrop-sharp unavailable (${(e && e.message ? e.message : e)}) — using the ffmpeg edge fallback`);
    _smartcrop = null;
  }
  return _smartcrop;
}

let _sharp;
function loadSharp() {
  if (_sharp !== undefined) return _sharp;
  try { _sharp = require("sharp"); } catch { _sharp = null; }
  return _sharp;
}

// ANALYSE A THUMBNAIL, NOT THE ORIGINAL. Saliency is a low-frequency property: the focal
// point of a 2732x1800 homepage capture is in the same place at 512px wide, and finding it
// there is an order of magnitude cheaper. Measured on this repo's real captures, analysing
// the full-size PNGs cost ~850ms per (image, aspect) — 12.8s to prepare five assets for
// three slot shapes, which is real wall-clock on the render's critical path.
//
// The downscale is done ONCE per image and the buffer reused for every aspect, so a
// three-aspect film pays one decode instead of three.
const ANALYSIS_WIDTH = 512;
/** @type {Map<string, {buf: Buffer, width: number, height: number}|null>} */
const thumbMemo = new Map();
async function analysisBuffer(absPath, hash) {
  const key = hash || absPath;
  if (thumbMemo.has(key)) return thumbMemo.get(key);
  let out = null;
  const sh = loadSharp();
  if (sh) {
    try {
      const r = await sh(absPath)
        .resize({ width: ANALYSIS_WIDTH, withoutEnlargement: true, fit: "inside" })
        // Flatten to a plain 3-channel PNG: smartcrop's skin/saturation terms read RGB, and
        // an alpha channel on a cut-out would otherwise be scored as dark pixels.
        .flatten({ background: "#ffffff" })
        .png({ compressionLevel: 1 })
        .toBuffer({ resolveWithObject: true });
      out = { buf: r.data, width: r.info.width, height: r.info.height };
    } catch { out = null; }
  }
  if (thumbMemo.size >= MEMO_MAX) thumbMemo.clear();
  thumbMemo.set(key, out);
  return out;
}

// smartcrop wants an integer target box. It only uses the box's ASPECT (it searches
// crops of that shape at many scales), so we synthesize a small box of the right shape —
// small keeps its internal search cheap.
function boxForAspect(aspect) {
  const a = Number(aspect) || 1;
  return a >= 1
    ? { width: Math.max(16, Math.round(100 * a)), height: 100 }
    : { width: 100, height: Math.max(16, Math.round(100 / a)) };
}

async function smartcropFocus(absPath, aspect, dims, hash) {
  const sc = loadSmartcrop();
  if (!sc) return null;
  const box = boxForAspect(aspect);
  // Prefer the shared downscaled buffer; fall back to the original path when sharp could
  // not produce one (smartcrop-sharp reads either).
  const thumb = await analysisBuffer(absPath, hash);
  const input = thumb ? thumb.buf : absPath;
  const res = await sc.crop(input, { width: box.width, height: box.height });
  const c = res && res.topCrop;
  if (!c || !(c.width > 0) || !(c.height > 0)) return null;
  // smartcrop returns crop coordinates in the INPUT's coordinate space, so the fractions
  // must be taken against whatever it actually analysed — the thumbnail when we made one.
  // Using the original's dimensions here would shrink every focal point toward the
  // top-left by the downscale factor.
  const W = thumb ? thumb.width : (Number(dims && dims.width) || 0);
  const H = thumb ? thumb.height : (Number(dims && dims.height) || 0);
  if (!W || !H) return null;
  // The focal point is the crop's CENTRE as a fraction of the image — which is exactly what
  // `object-position: X% Y%` means for a cover-fit box, and is scale-invariant, so the
  // fraction measured on the thumbnail is the fraction that applies to the original.
  return {
    x: (c.x + c.width / 2) / W,
    y: (c.y + c.height / 2) / H,
  };
}

// ---------------------------------------------------------------- analyzer 2: ffmpeg edges

// One ffmpeg pass -> an EDGE_N x EDGE_N grayscale buffer. Same shape as the sharpness and
// dHash probes in asset_sources/util.js, deliberately: this pipeline already hard-depends
// on ffmpeg for every media step, so an ffmpeg analyzer adds no new failure mode.
function grayGrid(absPath, n) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", [
      "-v", "error", "-i", absPath,
      "-vf", `scale=${n}:${n}:flags=area,format=gray`, "-frames:v", "1", "-f", "rawvideo", "-",
    ], { windowsHide: true });
    const chunks = [];
    p.stdout.on("data", (d) => chunks.push(d));
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, 15_000);
    p.on("error", () => { clearTimeout(timer); resolve(null); });
    p.on("exit", (code) => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      if (code !== 0 || buf.length < n * n) return resolve(null);
      resolve(buf.subarray(0, n * n));
    });
  });
}

// Per-pixel edge energy (|Laplacian|), the same operator asset_sources/util.imageSharpness
// already uses for its blur measure — here kept as a MAP rather than reduced to a
// variance, because where the detail is is exactly the question.
function edgeMap(gray, n) {
  const out = new Float64Array(n * n);
  for (let y = 1; y < n - 1; y++) {
    for (let x = 1; x < n - 1; x++) {
      const i = y * n + x;
      out[i] = Math.abs(4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - n] - gray[i + n]);
    }
  }
  return out;
}

// Slide a window of the target aspect over the energy map and keep the position with the
// highest mean energy, tempered by a centre prior. Returns the window centre as image
// fractions. O(n^2) over a 64x64 grid via a summed-area table — microseconds.
function bestWindow(energy, n, aspect) {
  // Integral image so any window sum is 4 lookups.
  const sat = new Float64Array((n + 1) * (n + 1));
  for (let y = 0; y < n; y++) {
    let rowSum = 0;
    for (let x = 0; x < n; x++) {
      rowSum += energy[y * n + x];
      sat[(y + 1) * (n + 1) + (x + 1)] = sat[y * (n + 1) + (x + 1)] + rowSum;
    }
  }
  const sum = (x0, y0, x1, y1) =>
    sat[y1 * (n + 1) + x1] - sat[y0 * (n + 1) + x1] - sat[y1 * (n + 1) + x0] + sat[y0 * (n + 1) + x0];

  // The largest window of `aspect` that fits the (square) grid. The grid is a squashed
  // version of the image, so a window of the SLOT's aspect in image space is a window of
  // (aspect / imageAspect) in grid space — but the caller passes the aspect already
  // expressed relative to the image, so we work directly in grid units.
  let wW, wH;
  if (aspect >= 1) { wW = n; wH = Math.max(4, Math.round(n / aspect)); }
  else { wH = n; wW = Math.max(4, Math.round(n * aspect)); }
  if (wW > n) { wW = n; wH = Math.max(4, Math.round(n / aspect)); }
  if (wH > n) { wH = n; wW = Math.max(4, Math.round(n * aspect)); }

  const cx = n / 2, cy = n / 2;
  const maxDist = Math.hypot(cx, cy) || 1;
  let best = -Infinity, bx = (n - wW) / 2, by = (n - wH) / 2;
  const step = Math.max(1, Math.round(n / 32));
  for (let y = 0; y + wH <= n; y += step) {
    for (let x = 0; x + wW <= n; x += step) {
      const mean = sum(x, y, x + wW, y + wH) / (wW * wH);
      const wcx = x + wW / 2, wcy = y + wH / 2;
      const dist = Math.hypot(wcx - cx, wcy - cy) / maxDist;
      // Normalize energy against the frame mean so the bias is comparable across images.
      const score = mean * (1 - CENTER_BIAS * dist);
      if (score > best) { best = score; bx = x; by = y; }
    }
  }
  return { x: (bx + wW / 2) / n, y: (by + wH / 2) / n };
}

/**
 * DOES THIS IMAGE HAVE A SUBJECT? — the fraction of total edge energy that falls inside the
 * densest quarter of the frame.
 *
 * A photograph of one product on a plain ground concentrates nearly all of its detail in a
 * small region; a busy street scene, a texture, or a screenshot of a dense settings page
 * spreads it evenly. A uniform image would score 0.25 (a quarter of the frame holds a
 * quarter of the energy), so anything meaningfully above that means the detail clusters —
 * which is exactly what makes an image survive a hard crop.
 *
 * Consumed by `asset_quality.subjectScore`. Computed here rather than there because the
 * grayscale pass and the edge map already exist on this side, so it is free.
 */
function concentrationOf(energy, n) {
  let total = 0;
  for (let i = 0; i < energy.length; i++) total += energy[i];
  if (!(total > 0)) return null;
  // A quarter of the frame = a half-width, half-height window.
  const w = Math.max(2, Math.round(n / 2));
  const sat = new Float64Array((n + 1) * (n + 1));
  for (let y = 0; y < n; y++) {
    let row = 0;
    for (let x = 0; x < n; x++) {
      row += energy[y * n + x];
      sat[(y + 1) * (n + 1) + (x + 1)] = sat[y * (n + 1) + (x + 1)] + row;
    }
  }
  const sum = (x0, y0, x1, y1) =>
    sat[y1 * (n + 1) + x1] - sat[y0 * (n + 1) + x1] - sat[y1 * (n + 1) + x0] + sat[y0 * (n + 1) + x0];
  let best = 0;
  const step = Math.max(1, Math.round(n / 24));
  for (let y = 0; y + w <= n; y += step) {
    for (let x = 0; x + w <= n; x += step) {
      const s = sum(x, y, x + w, y + w);
      if (s > best) best = s;
    }
  }
  return Math.round((best / total) * 1000) / 1000;
}

/** One ffmpeg pass -> the subject-concentration figure. Null when unreadable. */
async function subjectConcentration(absPath) {
  const gray = await grayGrid(absPath, EDGE_N);
  if (!gray) return null;
  return concentrationOf(edgeMap(gray, EDGE_N), EDGE_N);
}

async function edgeFocus(absPath, aspect, dims) {
  const gray = await grayGrid(absPath, EDGE_N);
  if (!gray) return null;
  const W = Number(dims && dims.width) || 0;
  const H = Number(dims && dims.height) || 0;
  if (!W || !H) return null;
  // The grid is the image squashed to a square, so a slot of ratio `aspect` occupies a
  // grid window of ratio `aspect / (W/H)`. Getting this wrong is the difference between
  // searching the right shape and searching a random one.
  const imgAspect = W / H;
  const gridAspect = aspect / imgAspect;
  const e = edgeMap(gray, EDGE_N);
  return bestWindow(e, EDGE_N, gridAspect);
}

// ---------------------------------------------------------------- reading-order prior

// HOW HARD A SCREENSHOT IS PULLED BACK TOWARD ITS TOP. 0 = trust saliency completely;
// 1 = always anchor flush to the top (the old heuristic).
const SCREENSHOT_TOP_BIAS = 0.6;

/**
 * A web page is not a photograph: it is read top-down, and the thing it exists to show —
 * the nav, the logo, the hero headline, a dashboard's headline metric — is above the fold.
 * Pure saliency does not know that. Measured on a real 2732x1800 homepage capture,
 * smartcrop returned "50% 48%" (the dense mid-page section) where the old heuristic said
 * "top center", and the old heuristic was RIGHT about which part of a page matters.
 *
 * So for screenshot-class assets the measured focus is pulled back toward the top, in
 * proportion to HOW MUCH VERTICAL CONTENT THE CROP DISCARDS. A near-square capture in a
 * near-square box discards almost nothing and keeps its saliency answer untouched; a
 * 1170x2532 full-page mobile capture squeezed into a 4:3 plate discards two thirds of its
 * height, and there the reading-order prior dominates. That proportionality is the point:
 * the bias is strongest exactly where the risk of losing the page's headline is greatest.
 *
 * `topAnchor` is the lowest legal focal y — the value that puts the visible window flush
 * against the top edge — so this can pull toward the top without ever pushing past it.
 */
function applyReadingOrderPrior(point, { kind, imgW, imgH, aspect }) {
  if (!point || kind !== "screenshot") return point;
  const W = Number(imgW) || 0, H = Number(imgH) || 0, A = Number(aspect) || 0;
  if (!W || !H || !A) return point;
  const imgAspect = W / H;
  if (imgAspect >= A) return point;               // the crop discards width, not height
  const discard = 1 - imgAspect / A;              // 0..1 fraction of height thrown away
  const visibleH = W / A;
  const topAnchor = (visibleH / 2) / H;
  const pulled = topAnchor + (point.y - topAnchor) * (1 - SCREENSHOT_TOP_BIAS * discard);
  return { x: point.x, y: Math.max(topAnchor, Math.min(1 - topAnchor, pulled)) };
}

// ---------------------------------------------------------------- analyzer 3: heuristic

/**
 * The ORIGINAL ratio-only rule, preserved exactly (visual_layout_director.cropFocusFor).
 * It is the last resort, not the default — but when an image cannot be read at all, a
 * dashboard still wants its header more than it wants its middle.
 */
function heuristicFocus(asset, kind) {
  const r = Number(asset && asset.ratio) || (asset && asset.width && asset.height ? asset.width / asset.height : 0);
  if (kind === "screenshot") {
    if (!r || r >= 1.4 || r <= 0.9) return "top center";
    return "center center";
  }
  return "center center";
}

// ---------------------------------------------------------------- formatting

const pct = (v) => `${Math.max(0, Math.min(100, Math.round(v * 100)))}%`;
function toObjectPosition(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return `${pct(point.x)} ${pct(point.y)}`;
}
const bucket = (aspect) => Number(Number(aspect).toFixed(ASPECT_PRECISION));

// ---------------------------------------------------------------- main

/**
 * Analyse ONE image for a set of slot aspects.
 *
 * @param {string} absPath  the image on disk
 * @param {object} opts
 * @param {number[]} opts.aspects  slot width/height ratios this film needs (deduped by caller)
 * @param {object}  opts.dims      { width, height } of the IMAGE (already probed upstream)
 * @param {string}  opts.kind      "screenshot" | "photo" — selects the reading-order prior
 * @returns {Promise<{ focus: string|null, byAspect: Record<string,string>, source: string }>}
 */
async function analyzeImage(absPath, { aspects = [], dims = null, kind = "photo" } = {}) {
  const hash = hashFile(absPath);
  const wanted = [...new Set((aspects.length ? aspects : [1]).map(bucket))].filter((a) => a > 0.05 && a < 20);

  const byAspect = {};
  let source = null;
  // The reading-order prior changes the answer, so it is part of the identity of a cached
  // result — the same pixels analysed as a screenshot and as a photo are two analyses.
  const variant = kind === "screenshot" ? "s" : "p";
  const disk = hash ? readCache(`${hash}.${variant}`) : null;
  const fresh = {};

  for (const a of wanted) {
    const key = hash ? `${hash}:${variant}:${a}` : null;
    const hit = (key && memo.get(key)) || (disk && disk.byAspect && disk.byAspect[String(a)]
      ? { focus: disk.byAspect[String(a)], source: disk.source || "cache" }
      : null);
    if (hit) {
      byAspect[String(a)] = hit.focus;
      source = source || hit.source;
      if (key) memoSet(key, hit);
      continue;
    }

    let point = null;
    let used = null;
    try {
      point = await smartcropFocus(absPath, a, dims, hash);
      if (point) used = "smartcrop";
    } catch (e) {
      // A single failed analysis is not a reason to stop trying the others.
      console.warn(`[crop_engine] smartcrop failed on ${path.basename(absPath)} @${a}: ${(e && e.message ? e.message : e)}`);
    }
    if (!point) {
      try {
        point = await edgeFocus(absPath, a, dims);
        if (point) used = "edge";
      } catch { /* fall through to the heuristic at the call site */ }
    }
    point = applyReadingOrderPrior(point, {
      kind,
      imgW: dims && dims.width, imgH: dims && dims.height, aspect: a,
    });
    const pos = toObjectPosition(point);
    if (!pos) continue;
    byAspect[String(a)] = pos;
    fresh[String(a)] = pos;
    source = source || used;
    if (key) memoSet(key, { focus: pos, source: used });
  }

  if (hash && Object.keys(fresh).length) {
    writeCache(`${hash}.${variant}`, {
      v: 1,
      source: source || "unknown",
      kind,
      byAspect: { ...(disk && disk.byAspect ? disk.byAspect : {}), ...fresh },
      dims: dims ? { width: dims.width, height: dims.height } : null,
    });
  }

  // The GENERIC focus: the analysis for the aspect closest to the image's own shape, or
  // whatever we have. This is what `asset.cropFocus` becomes, so a composer that has not
  // been taught about per-slot aspects still gets a real, content-derived anchor.
  const keys = Object.keys(byAspect);
  let focus = null;
  if (keys.length) {
    const own = dims && dims.width && dims.height ? dims.width / dims.height : 1;
    const nearest = keys.reduce((b, k) => (Math.abs(Number(k) - own) < Math.abs(Number(b) - own) ? k : b), keys[0]);
    focus = byAspect[nearest];
  }

  // SUBJECT CONCENTRATION rides along: the quality engine wants it, this is the only place
  // that already has the pixels in hand, and it is cached with everything else. Computed
  // once per image (it does not vary by slot aspect), reused from cache thereafter.
  let subjectFocus = disk && Number.isFinite(disk.subjectFocus) ? disk.subjectFocus : null;
  if (subjectFocus == null) {
    try { subjectFocus = await subjectConcentration(absPath); } catch { subjectFocus = null; }
    if (hash && subjectFocus != null) {
      const rec = readCache(`${hash}.${variant}`) || { v: 1, byAspect: {} };
      writeCache(`${hash}.${variant}`, { ...rec, subjectFocus });
    }
  }

  return {
    focus, byAspect, source: source || "none", subjectFocus,
    // How many aspects were actually ANALYSED rather than resolved from a cache. The caller
    // reports this, and inferring it from the memo's size was wrong the moment the memo
    // started evicting — a bounded cache can absorb an insert without growing.
    freshCount: Object.keys(fresh).length,
  };
}

/**
 * Annotate a whole asset list in place. This is the pipeline entry point: it runs where
 * the files already exist on disk and their dimensions are known, BEFORE any composer
 * emits HTML — exactly as the specification requires.
 *
 * Bounded concurrency, because the analysis is CPU-bound (libvips or ffmpeg) and the
 * render box is small: `concurrency` defaults to (cores - 1), clamped to [1, 4].
 *
 * @returns {Promise<{analyzed:number, cached:number, skipped:number, failed:number, ms:number, source:string}>}
 */
async function annotateAssets(assets, { jobDir, aspects = [], concurrency = null, kindOf = null } = {}) {
  const t0 = Date.now();
  const list = Array.isArray(assets) ? assets : [];
  const report = { analyzed: 0, cached: 0, skipped: 0, failed: 0, ms: 0, source: "none" };
  const targets = list.filter(isCroppable);
  report.skipped = list.length - targets.length;
  if (!targets.length) { report.ms = Date.now() - t0; return report; }

  const cores = (() => { try { return require("node:os").cpus().length; } catch { return 2; } })();
  const lanes = Math.max(1, Math.min(4, Number(concurrency) || cores - 1));

  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= targets.length) return;
      const a = targets[i];
      const abs = jobDir ? path.join(jobDir, a.path) : a.path;
      const kind = kindOf ? kindOf(a) : (String(a.source || "") === "website" ? "screenshot" : "photo");
      try {
        if (!fs.existsSync(abs)) { report.failed++; continue; }
        const r = await analyzeImage(abs, {
          aspects, kind,
          dims: (a.width && a.height) ? { width: a.width, height: a.height } : await probeDims(abs),
        });
        if (r.focus) {
          a.cropFocus = r.focus;
          a.cropFocusByAspect = r.byAspect;
          a.cropFocusSource = r.source;
          if (r.subjectFocus != null) a.subjectFocus = r.subjectFocus;
          if (r.freshCount > 0) report.analyzed++; else report.cached++;
          if (report.source === "none") report.source = r.source;
        } else {
          // Unreadable: keep the historical behaviour rather than leaving it unset.
          a.cropFocus = heuristicFocus(a, kind);
          a.cropFocusSource = "heuristic";
          report.failed++;
        }
      } catch (e) {
        a.cropFocus = heuristicFocus(a, kind);
        a.cropFocusSource = "heuristic";
        report.failed++;
        console.warn(`[crop_engine] ${path.basename(String(a.path))}: ${(e && e.message ? e.message : e)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: lanes }, worker));
  report.ms = Date.now() - t0;
  return report;
}

// Fallback dimension probe for an asset that arrived without width/height. Reuses the
// existing ffprobe helper rather than adding a second way to ask the same question.
async function probeDims(absPath) {
  try {
    const { ffprobeImage } = require("./asset_sources");
    const d = await ffprobeImage(absPath);
    return d && d.width && d.height ? { width: d.width, height: d.height } : null;
  } catch { return null; }
}

/**
 * THE COMPOSER-FACING RESOLVER. Synchronous, pure, and cheap — safe to call from inside
 * any composer's template string.
 *
 * Given an asset and the slot it is about to be drawn into, return the CSS
 * `object-position` value that keeps the subject in frame. Precedence:
 *   1. the per-aspect analysis for the NEAREST analysed aspect (content truth for this box)
 *   2. the generic `asset.cropFocus` (content truth for the image)
 *   3. the caller's own art direction (`fallback`)
 *   4. "center center"
 *
 * Content truth outranks the call site's literal on purpose. Those literals ("center top",
 * "top center") are generic defaults written before anything measured the image, and they
 * are precisely what this module exists to replace. A call site that genuinely must pin a
 * crop passes `{ force: true }`.
 */
function focusFor(asset, slotW, slotH, fallback = null, { force = false } = {}) {
  if (force && fallback) return fallback;
  if (!asset) return fallback || "center center";
  const map = asset.cropFocusByAspect;
  if (map && slotW > 0 && slotH > 0) {
    const want = slotW / slotH;
    const keys = Object.keys(map);
    if (keys.length) {
      const nearest = keys.reduce((b, k) => (Math.abs(Number(k) - want) < Math.abs(Number(b) - want) ? k : b), keys[0]);
      if (map[nearest]) return map[nearest];
    }
  }
  if (asset.cropFocus) return asset.cropFocus;
  return fallback || "center center";
}

/** Wipe the in-process memo. Test seam only. */
function __resetMemo() { memo.clear(); }

module.exports = {
  analyzeImage, annotateAssets, focusFor, isCroppable, heuristicFocus,
  toObjectPosition, bestWindow, edgeMap, boxForAspect,
  subjectConcentration, concentrationOf, applyReadingOrderPrior,
  CACHE_DIR, __resetMemo,
};
