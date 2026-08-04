// Brand-coverage scorer — the compliance/validation layer for brand personalization.
//
// Mirrors the localization coverage report (caption_director.finalizeQuality): a
// DETERMINISTIC, pure, fail-open measurement — never an LLM call, never a gate. It
// scans the COMPOSED index.html for every color literal (#hex, rgb/rgba(), and the
// inlined WebGL `0x` ints) and asks: how many of the distinct colors the film actually
// paints are DERIVED FROM THE BRAND palette vs the pack's own fixed colors.
//
// This is a RAW baseline metric on purpose. It does NOT yet exclude a pack's
// deliberately-locked ground/ink/semantic colors (that needs a per-pack contract), so
// a pack that correctly keeps its ground/semantics reads LOW here — which is fine: the
// number is a per-renderer BASELINE + regression detector, not a pass/fail bar. A restrained
// pack (blueprint/terminal lock heavy semantics; bauhaus rotates a whole triad but reports only
// its brand-lead accents, not the two triadic partners it also paints) reads LOW here even when
// it is correctly on-brand — read the per-renderer baseline, never a global floor.
//
// Fail-open (THE LAW, brand_kit.js:28): returns null on any problem; never throws,
// never blocks a render.

// ---- self-contained color helpers (no dep on brand_kit) ---------------------
function normHex(v) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(v == null ? "" : v).trim());
  if (m) return `#${m[1].toLowerCase()}`;
  const s = /^#?([0-9a-fA-F]{3})$/.exec(String(v == null ? "" : v).trim());
  if (s) return `#${s[1].toLowerCase().split("").map((c) => c + c).join("")}`;
  return null;
}
function rgbToHex(r, g, b) {
  const f = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
  return `#${f(r)}${f(g)}${f(b)}`;
}
function intToHex(n) { const v = (Number(n) >>> 0) & 0xffffff; return `#${v.toString(16).padStart(6, "0")}`; }
function toRgb(hex) { const h = normHex(hex); if (!h) return null; const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
// Two colors read as "the same brand color" when their channel distance is small — a
// gradient stop / rgba glow / 0x int derived from an accent should count as that accent.
function near(a, b, tol = 24) {
  const x = toRgb(a), y = toRgb(b);
  if (!x || !y) return false;
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) <= tol;
}

// Pull every color occurrence out of a composed HTML document (inline CSS + inline JS).
function extractColors(html) {
  const out = [];
  const push = (hex) => { const n = normHex(hex); if (n) out.push(n); };
  const s = String(html || "");
  // #rrggbb / #rgb
  for (const m of s.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) push(m[0]);
  // rgb()/rgba()
  for (const m of s.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g)) push(rgbToHex(+m[1], +m[2], +m[3]));
  // WebGL 0xRRGGBB ints (Three.js material colors)
  for (const m of s.matchAll(/0x([0-9a-fA-F]{6})\b/g)) push(`#${m[1].toLowerCase()}`);
  return out;
}

// The set of colors the resolved brand actually authorizes — accents, emphasis, and
// (when present on the resolved PackSkin) the derived ui/three/chart/gradient bundle.
function brandColorSet(rb) {
  const set = new Set();
  const add = (h) => { const n = normHex(h); if (n) set.add(n); };
  const addInt = (n) => { if (n != null) add(intToHex(n)); };
  (rb.accents || []).forEach(add);
  [rb.accent, rb.accent2, rb.accent3].forEach(add);
  (rb.emphasis || []).forEach(add);
  (rb.chart || []).forEach(add);
  if (rb.ui) [rb.ui.buttonBg, rb.ui.indicator, rb.ui.progress, rb.ui.hover, rb.ui.active].forEach(add);
  if (rb.three) [rb.three.A, rb.three.B, rb.three.C, rb.three.glow, rb.three.particle, rb.three.lightKey, rb.three.lightFill].forEach(addInt);
  return set;
}

// scoreBrandCoverage({ indexHtml, resolvedBrand }) -> report | null
//   report = { applied, brandColorCoverage, hardcodedColorUsage, distinctColors,
//              brandColorsUsed, notes[] }
function scoreBrandCoverage({ indexHtml, resolvedBrand } = {}) {
  const rb = resolvedBrand;
  if (!indexHtml || !rb) return null;

  const brand = brandColorSet(rb);
  const found = extractColors(indexHtml);
  if (!found.length) return null;

  const distinct = [...new Set(found)];
  const brandUsed = distinct.filter((hex) => [...brand].some((b) => near(hex, b)));
  const coverage = distinct.length ? Math.round((brandUsed.length / distinct.length) * 100) : 0;

  const notes = [];
  if (rb.applied === false) notes.push("No brand palette applied — the pack's own colors are used.");
  return {
    applied: rb.applied === true,
    brandColorCoverage: coverage,          // % of DISTINCT painted colors that are brand-derived
    hardcodedColorUsage: distinct.length - brandUsed.length, // distinct off-brand colors
    distinctColors: distinct.length,
    brandColorsUsed: brandUsed.length,
    notes,
  };
}

module.exports = { scoreBrandCoverage, extractColors, brandColorSet };
