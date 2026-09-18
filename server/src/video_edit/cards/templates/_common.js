// VIDEO EDIT CARD KIT — shared building blocks for the HyperFrames card templates (cards/templates/*.js;
// RENDER.md §7, spike S4).
//
// WHY THIS EXISTS. Six templates must follow the contract S4 proved, and every rule in it fails silently
// when one template forgets it:
//   * GSAP is loaded as a FILE next to index.html. An inlined copy trips lint `non_deterministic_code`,
//     because GSAP itself contains Math.random / Date.now.
//   * Every family gets its own data-URI @font-face. A family without one makes the CLI fetch Google Fonts
//     at render time and fill ~/.cache/hyperframes/fonts, and "Arial Black" silently becomes Montserrat.
//   * html / body / root stay transparent (the CLI forces that for alpha output), so backgrounds live on
//     child elements.
//   * No randomness, wall clock or infinite repeat in the inline timeline script.
//   * Text must fit a region-sized canvas. Overflow is clipped by the renderer and never reported.
// So text is measured in Node from the bundled TTF's own cmap + hmtx (the same file the browser draws with)
// and sizes / line breaks are fixed before the HTML is written. Layout never depends on font-load timing,
// and a card is byte-identical for identical inputs (the card hash relies on that).
//
// CONTRACT:
//   FPS · GSAP_PATH · gsapVersion() -> '3.12.5' · gsapExtraFile() -> { rel:'gsap.min.js', srcPath }
//   kitError(detail) -> EditError CARD_TEMPLATE_INVALID
//   canvas({ w, h, dur }) -> { w, h, dur }   (even integer px, dur > 0; throws on bad input)
//   normalizePalette(brand) -> { primary, accent, text, onAccent }         (hashed)
//   derivePalette(brand) -> + { onAccent (≥ 4.5:1 on accent), textOnPanel, accentOnDark (≥ 3:1 on panel), panel }
//   cardFonts(fonts:[{ family, ttfPath, role? }]) -> { faces, display, body, fallbacks, displayChain, bodyChain, css(face) }
//     roles default to position: [0] display, [1] body, rest fallback (Latin runs inside hi/ar text).
//   fontFaceCss(faces) -> one `@font-face{font-family:'X';src:url(data:font/ttf;base64,…)}` per family
//   metricsFor(ttfPath) -> { upem, contentEm, hheaEm, capEm, has(cp), advanceEm(cp) }   (cached per file)
//   measureEm(text, chain, letterSpacingEm) -> em width (no kerning: slightly wide, never narrow for Latin)
//   fitText({ text, chain, maxWidth, maxLines, maxSize, minSize, letterSpacingEm, lang, balance })
//     -> { size, lines:[{ text, words, width }], width, truncated, joiner }
//        largest integer px size whose greedy wrap fits maxLines lines inside 97 % of maxWidth; multi-line
//        results are balanced; below minSize the text is hard-wrapped and the last line ellipsized.
//   cleanText(v, maxGraphemes) · graphemes(s) · escapeHtml(s) · upper(text, lang) · isRtl(lang) · scriptOf(lang)
//   documentHtml({ w, h, dur, lang, title, faces, css, body, script }) -> index.html (root/clip contract)
//   metaJsonFor({ w, h, dur }) · assertDeterministicScript(script)
//   cardTiming(dur, entryEnd) -> { end, outStart, outDur, f, at(s), d(s), holdStart, holdEnd }
//   fromTo(target, from, to, at) · to(target, vars, at) -> timeline script lines
//   exitStagger(n, window, maxStagger) · rgba(hex, a) · contrastRatio(a, b) · px(v) · r2 · r3 · box · point

const fs = require("node:fs");
const path = require("node:path");
const { EditError } = require("../../errors");
const fontname = require("../../captions/fontname");
const { DEFAULT_PALETTE } = require("../../plan/schema");

const FPS = 30;
const SERVER_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const GSAP_DIR = path.join(SERVER_ROOT, "node_modules", "gsap");
const GSAP_PATH = path.join(GSAP_DIR, "dist", "gsap.min.js");
const PANEL_GROUND = "#0d0d11";
const B64_CACHE_MAX_BYTES = 1024 * 1024;

function kitError(detail) {
  return new EditError("CARD_TEMPLATE_INVALID", { status: 500, errorClass: "input", detail: String(detail) });
}

// ---- numbers ---------------------------------------------------------------------------------------
const r2 = (v) => Math.round(Number(v) * 100) / 100;
const r3 = (v) => Math.round(Number(v) * 1000) / 1000;
const px = (v) => `${r2(v)}px`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const box = (x, y, w, h) => ({ x: r2(x), y: r2(y), w: r2(w), h: r2(h) });
const point = (x, y) => ({ x: Math.round(x), y: Math.round(y) });

function canvas({ w, h, dur } = {}) {
  const W = Number(w), H = Number(h), D = Number(dur);
  if (!Number.isInteger(W) || !Number.isInteger(H) || W < 64 || H < 64 || W % 2 || H % 2) throw kitError(`card size must be even integers ≥ 64 (got ${w}x${h})`);
  if (!Number.isFinite(D) || D <= 0 || D > 60) throw kitError(`bad card duration ${dur}`);
  return { w: W, h: H, dur: D };
}

// ---- GSAP ------------------------------------------------------------------------------------------
let gsapVersionCache = null;
function gsapVersion() {
  if (gsapVersionCache) return gsapVersionCache;
  try { gsapVersionCache = String(JSON.parse(fs.readFileSync(path.join(GSAP_DIR, "package.json"), "utf8")).version || "unknown"); }
  catch { gsapVersionCache = "missing"; }
  return gsapVersionCache;
}

function gsapExtraFile() {
  if (!fs.existsSync(GSAP_PATH)) throw kitError("gsap.min.js is not installed in server/node_modules/gsap/dist");
  return { rel: "gsap.min.js", srcPath: GSAP_PATH };
}

// ---- text ------------------------------------------------------------------------------------------
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });
function graphemes(s) { return [...GRAPHEMES.segment(String(s == null ? "" : s))].map((x) => x.segment); }

const uEsc = (n) => `${String.fromCharCode(92)}u${n.toString(16).padStart(4, "0")}`;
const CONTROL_RE = new RegExp(`[${[[0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x7f], [0x200b, 0x200b], [0x2028, 0x2029]].map(([a, b]) => (a === b ? uEsc(a) : `${uEsc(a)}-${uEsc(b)}`)).join("")}]`, "g");
function cleanText(v, maxGraphemes = 80) {
  if (v == null || typeof v === "object") return "";
  let s = String(v).replace(CONTROL_RE, "").replace(/\s+/g, " ").trim();
  const g = graphemes(s);
  if (g.length > maxGraphemes) s = g.slice(0, maxGraphemes).join("").trimEnd();
  return s;
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const LANG_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const safeLang = (lang) => (LANG_RE.test(String(lang || "")) ? String(lang) : "en");
const scriptOf = (lang) => fontname.scriptForLang(safeLang(lang));
const isJa = (lang) => scriptOf(lang) === "Jpan";
const isRtl = (lang) => ["ar", "he", "fa", "ur"].includes(safeLang(lang).slice(0, 2));
function upper(text, lang) {
  return scriptOf(lang) === "Latn" ? String(text).toLocaleUpperCase(safeLang(lang)) : String(text);
}

// ---- colour ----------------------------------------------------------------------------------------
const HEX_RE = /^#?([0-9a-fA-F]{6})$/;
function normHex(v, fallback = null) {
  const m = HEX_RE.exec(String(v == null ? "" : v).trim());
  return m ? `#${m[1].toLowerCase()}` : fallback;
}
function hexToRgb(hex) {
  const n = parseInt(normHex(hex, "#000000").slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbToHex = (rgb) => `#${rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`;
function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${r3(a)})`; }
function relLum(hex) {
  const c = hexToRgb(hex).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrastRatio(a, b) {
  const x = relLum(a), y = relLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, hp = (((h % 360) + 360) % 360) / 60, x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
// Walk HSL lightness away from the ground until the ratio is met; hue and saturation are kept.
function liftToRatio(hex, ground, target) {
  const from = normHex(hex, "#ffffff");
  if (contrastRatio(from, ground) >= target) return from;
  const [h, s, l0] = rgbToHsl(hexToRgb(from));
  const up = relLum(ground) < 0.5;
  for (let k = 1; k <= 100; k++) {
    const l = up ? l0 + k * 0.01 : l0 - k * 0.01;
    if (l < 0 || l > 1) break;
    const c = rgbToHex(hslToRgb(h, s, l));
    if (contrastRatio(c, ground) >= target) return c;
  }
  return up ? "#ffffff" : "#000000";
}

function normalizePalette(brand) {
  const b = brand && typeof brand === "object" ? brand : {};
  return {
    primary: normHex(b.primary, DEFAULT_PALETTE.primary),
    accent: normHex(b.accent, DEFAULT_PALETTE.accent),
    text: normHex(b.text, DEFAULT_PALETTE.text),
    onAccent: normHex(b.onAccent, DEFAULT_PALETTE.onAccent),
  };
}

function derivePalette(brand) {
  const p = normalizePalette(brand);
  const onAccent = contrastRatio(p.onAccent, p.accent) >= 4.5 ? p.onAccent
    : (contrastRatio("#ffffff", p.accent) >= contrastRatio("#111114", p.accent) ? "#ffffff" : "#111114");
  return {
    ...p,
    onAccent,
    textOnPanel: contrastRatio(p.text, PANEL_GROUND) >= 4.5 ? p.text : "#ffffff",
    accentOnDark: liftToRatio(p.accent, PANEL_GROUND, 3),
    panel: PANEL_GROUND,
  };
}

// ---- fonts -----------------------------------------------------------------------------------------
const metricsCache = new Map();
function metricsFor(ttfPath) {
  const abs = path.resolve(String(ttfPath));
  const hit = metricsCache.get(abs);
  if (hit) return hit;
  const buf = fs.readFileSync(abs);
  const T = fontname.tableDirectory(buf, 0).tables;
  for (const tag of ["head", "hhea", "hmtx", "cmap"]) if (!T[tag]) throw kitError(`font ${path.basename(abs)} has no ${tag} table`);
  const upem = buf.readUInt16BE(T.head.offset + 18) || 1000;
  const asc = buf.readInt16BE(T.hhea.offset + 4);
  const desc = buf.readInt16BE(T.hhea.offset + 6);
  const nH = Math.max(1, buf.readUInt16BE(T.hhea.offset + 34));
  let winAsc = 0, winDesc = 0, cap = 0;
  const os2 = T["OS/2"];
  if (os2 && os2.length >= 78) {
    winAsc = buf.readUInt16BE(os2.offset + 74);
    winDesc = buf.readUInt16BE(os2.offset + 76);
    if (buf.readUInt16BE(os2.offset) >= 2 && os2.length >= 90) cap = buf.readInt16BE(os2.offset + 88);
  }
  const lookup = fontname.cmapLookup(buf, T.cmap);
  const cache = new Map();
  const m = {
    file: abs,
    upem,
    hheaEm: (asc - desc) / upem,
    contentEm: Math.max(asc - desc, winAsc + winDesc) / upem,
    // Browsers place the baseline from hhea or from OS/2 win metrics depending on platform; keep both.
    vmetrics: [{ asc: asc / upem, desc: -desc / upem }, ...(winAsc || winDesc ? [{ asc: winAsc / upem, desc: winDesc / upem }] : [])],
    capEm: cap > 0 ? cap / upem : 0.7,
    has: (cp) => lookup(cp) !== 0,
    advanceEm(cp) {
      if (cache.has(cp)) return cache.get(cp);
      const g = lookup(cp);
      const v = g ? buf.readUInt16BE(T.hmtx.offset + 4 * Math.min(g, nH - 1)) / upem : null;
      cache.set(cp, v);
      return v;
    },
  };
  metricsCache.set(abs, m);
  return m;
}

const FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,62}$/;
function weightFor(family, ttfPath) {
  const e = fontname.entryForFamily(family);
  if (e) return e.weight;
  try { return fontname.readFont(ttfPath).weight || 400; } catch { return 400; }
}

function cardFonts(fonts) {
  const list = (Array.isArray(fonts) ? fonts : []).filter((f) => f && f.family && f.ttfPath);
  if (!list.length) throw kitError("a card needs at least one font");
  const byFamily = new Map();
  const faces = [];
  for (const f of list) {
    const family = String(f.family);
    if (!FAMILY_RE.test(family)) throw kitError(`bad font family '${family}'`);
    const key = family.toLowerCase();
    if (byFamily.has(key)) continue;
    const ttfPath = path.resolve(String(f.ttfPath));
    if (!fs.existsSync(ttfPath)) throw kitError(`font file for '${family}' is missing`);
    const face = { family, ttfPath, weight: weightFor(family, ttfPath), metrics: metricsFor(ttfPath) };
    byFamily.set(key, face);
    faces.push(face);
  }
  const roleOf = (f, i) => f.role || (i === 0 ? "display" : i === 1 ? "body" : "fallback");
  const faceOf = (f) => byFamily.get(String(f.family).toLowerCase());
  const pick = (role) => { const i = list.findIndex((f, j) => roleOf(f, j) === role); return i >= 0 ? faceOf(list[i]) : null; };
  const display = pick("display") || faces[0];
  const body = pick("body") || display;
  const fallbacks = [...new Set(list.filter((f, i) => roleOf(f, i) === "fallback").map(faceOf))].filter((x) => x !== display && x !== body);
  const chainOf = (face) => [face, ...fallbacks].map((x) => x.metrics);
  const css = (face) => `font-family: ${[face, ...fallbacks].map((x) => `'${x.family}'`).join(", ")}, sans-serif; font-weight: ${face.weight}; font-style: normal; font-synthesis: none;`;
  return { faces, display, body, fallbacks, displayChain: chainOf(display), bodyChain: chainOf(body), css };
}

const b64Cache = new Map();
function base64Of(abs) {
  if (b64Cache.has(abs)) return b64Cache.get(abs);
  const buf = fs.readFileSync(abs);
  const s = buf.toString("base64");
  if (buf.length <= B64_CACHE_MAX_BYTES) b64Cache.set(abs, s);
  return s;
}

// font-family comes first inside each block: the CLI's own "declared faces" scanner reads the first
// `font-family:…;` of a block, and the data URI itself contains a ';'.
function fontFaceCss(faces) {
  return (faces || []).map((f) => `@font-face { font-family: '${f.family}'; src: url(data:font/ttf;base64,${base64Of(f.ttfPath)}) format('truetype'); font-weight: ${f.weight}; font-style: normal; font-display: block; }`).join("\n");
}

// ---- measuring and fitting -------------------------------------------------------------------------
function measureEm(text, chain, letterSpacingEm = 0) {
  let em = 0;
  for (const ch of String(text == null ? "" : text)) {
    const cp = ch.codePointAt(0);
    let a = null;
    for (const m of chain) { a = m.advanceEm(cp); if (a != null) break; }
    if (a == null) a = /\s/.test(ch) ? 0.25 : /\p{M}/u.test(ch) ? 0 : 0.6;
    em += a + letterSpacingEm;
  }
  return em;
}

function tokenize(text, lang) {
  const s = String(text || "").trim();
  if (!s) return [];
  return isJa(lang) ? graphemes(s).filter((g) => !/^\s$/.test(g)) : s.split(/\s+/).filter(Boolean);
}

function wrapIdx(widths, joinW, limit) {
  const lines = [];
  let cur = [], curW = 0;
  for (let i = 0; i < widths.length; i++) {
    const tw = widths[i];
    if (tw > limit) return null;
    if (!cur.length) { cur = [i]; curW = tw; continue; }
    if (curW + joinW + tw <= limit) { cur.push(i); curW += joinW + tw; continue; }
    lines.push(cur);
    cur = [i]; curW = tw;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function fitText({ text, chain, maxWidth, maxLines = 1, maxSize, minSize, letterSpacingEm = 0, lang = "en", balance = true, safety = 0.97 } = {}) {
  if (!Array.isArray(chain) || !chain.length) throw kitError("fitText needs a font chain");
  const joiner = isJa(lang) ? "" : " ";
  const tokens = tokenize(text, lang);
  const limit = Math.max(1, Number(maxWidth) * safety);
  const hi = Math.max(1, Math.floor(Number(maxSize)));
  const lo = Math.max(1, Math.min(hi, Math.floor(Number(minSize))));
  const measure = (s) => measureEm(s, chain, letterSpacingEm);
  const finish = (size, tokLines, truncated) => {
    const lines = tokLines.map((toks) => { const t = toks.join(joiner); return { text: t, words: toks, width: r2(measure(t) * size) }; });
    return { size, lines, width: lines.length ? Math.max(...lines.map((l) => l.width)) : 0, truncated, joiner };
  };
  if (!tokens.length) return finish(hi, [], false);
  const tokEm = tokens.map(measure);
  const joinEm = joiner ? measure(joiner) : 0;
  const maxL = Math.max(1, Math.floor(maxLines));

  for (let size = hi; size >= lo; size--) {
    const widths = tokEm.map((e) => e * size);
    const lines = wrapIdx(widths, joinEm * size, limit);
    if (!lines || lines.length > maxL) continue;
    let use = lines;
    if (balance && lines.length > 1) {
      let a = Math.max(...widths), b = limit, best = lines;
      for (let i = 0; i < 18; i++) {
        const mid = (a + b) / 2;
        const r = wrapIdx(widths, joinEm * size, mid);
        if (r && r.length <= lines.length) { best = r; b = mid; } else a = mid;
      }
      use = best;
    }
    return finish(size, use.map((ln) => ln.map((i) => tokens[i])), false);
  }

  // Cannot fit even at minSize: hard-wrap (breaking over-long tokens by grapheme) and ellipsize.
  const size = lo;
  const fits = (s) => measure(s) * size <= limit;
  const lines = [];
  let cur = "";
  for (const tok of tokens) {
    const cand = cur ? cur + joiner + tok : tok;
    if (fits(cand)) { cur = cand; continue; }
    if (cur) { lines.push(cur); cur = ""; }
    if (fits(tok)) { cur = tok; continue; }
    let piece = "";
    for (const g of graphemes(tok)) {
      if (fits(piece + g)) piece += g;
      else { if (piece) lines.push(piece); piece = g; }
    }
    cur = piece;
  }
  if (cur) lines.push(cur);
  const kept = lines.slice(0, maxL);
  if (lines.length > maxL) {
    const ell = chain.some((m) => m.has(0x2026)) ? "…" : "...";
    let last = kept[kept.length - 1];
    while (last && !fits(last + ell)) last = graphemes(last).slice(0, -1).join("").trimEnd();
    kept[kept.length - 1] = last + ell;
  }
  const split = (line) => (joiner ? line.split(" ").filter(Boolean) : graphemes(line));
  return finish(size, kept.map(split), true);
}

// ---- document --------------------------------------------------------------------------------------
const FORBIDDEN_SCRIPT_RE = /Math\s*\.\s*random|Date\s*\.\s*now|new\s+Date\b|performance\s*\.\s*now|crypto\s*\.\s*getRandomValues|repeat\s*:\s*-\s*1|\bfetch\s*\(|XMLHttpRequest|import\s*\(|<\/script/i;
function assertDeterministicScript(script) {
  const m = FORBIDDEN_SCRIPT_RE.exec(String(script));
  if (m) throw kitError(`card timeline script contains a forbidden token '${m[0]}'`);
  return script;
}

const durString = (d) => String(r3(d));

function documentHtml({ w, h, dur, lang = "en", title = "card", faces = [], css = "", body = "", script = "" } = {}) {
  assertDeterministicScript(script);
  const D = durString(dur);
  return `<!doctype html>
<html lang="${escapeHtml(safeLang(lang))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${w}, height=${h}">
<title>${escapeHtml(title)}</title>
<style>
${fontFaceCss(faces)}
html, body { margin: 0; padding: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: transparent; }
#root { position: relative; width: ${w}px; height: ${h}px; overflow: hidden; background: transparent; }
#card { position: absolute; left: 0; top: 0; width: ${w}px; height: ${h}px; }
#card, #card * { box-sizing: border-box; }
.w { display: inline-block; }
${css}
</style>
</head>
<body>
<div id="root" data-composition-id="vid" data-width="${w}" data-height="${h}" data-start="0" data-duration="${D}">
<div id="card" class="clip" data-start="0" data-duration="${D}" data-track-index="0">
${body}
</div>
</div>
<script src="gsap.min.js"></script>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
${script}
window.__timelines["vid"] = tl;
</script>
</body>
</html>
`;
}

function metaJsonFor({ w, h, dur }) {
  return `${JSON.stringify({ compositionId: "vid", width: w, height: h, fps: FPS, duration: r3(dur) }, null, 2)}\n`;
}

// ---- timeline --------------------------------------------------------------------------------------
function roundDeep(v) {
  if (typeof v === "number") return r3(v);
  if (Array.isArray(v)) return v.map(roundDeep);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)]));
  return v;
}
const lit = (v) => JSON.stringify(roundDeep(v));
const fromTo = (target, from, toVars, at) => `tl.fromTo(${lit(target)}, ${lit(from)}, ${lit(toVars)}, ${r3(at)});`;
const to = (target, vars, at) => `tl.to(${lit(target)}, ${lit(vars)}, ${r3(at)});`;

// Every card is fully transparent on its first frame (entries start from opacity 0) and at least two
// frames before its end, so the composite never shows a pop where the overlay starts or stops.
// `entryEnd` is the template's entry length on its 2.5 s design; short cards compress it by `f`.
function cardTiming(dur, entryEnd) {
  const D = Number(dur);
  const end = r3(D - 2 / FPS);
  const outLen = D >= 2 ? 0.36 : 0.26;
  const outStart = r3(Math.max(0.3, end - outLen));
  const room = outStart - 0.12;
  const f = entryEnd > 0 && room < entryEnd ? Math.max(0.3, room / entryEnd) : 1;
  return {
    D, end, outStart, outDur: r3(end - outStart), f,
    at: (s) => r3(s * f),
    d: (s) => r3(Math.max(0.1, s * f)),
    holdStart: r3(entryEnd * f), holdEnd: outStart,
  };
}

function exitStagger(n, window, maxStagger = 0.03) {
  const stagger = n > 1 ? Math.min(maxStagger, Math.max(0, (window - 0.16) / (n - 1))) : 0;
  return { stagger: r3(stagger), duration: r3(Math.max(0.1, window - stagger * (n - 1))) };
}

// Smallest line height (em, ≥ 1) that keeps cap-height glyphs (numerals) inside their line box with `pad` em
// above and below, whether the browser places the baseline from hhea or from OS/2 win metrics:
// baseline = (L − (asc + desc)) / 2 + asc; need baseline − cap ≥ pad and baseline + pad ≤ L.
function tightLineEm(metrics, pad = 0.06) {
  const cap = (metrics && metrics.capEm ? metrics.capEm : 0.72) + 0.02;
  let L = 1;
  for (const { asc, desc } of (metrics && metrics.vmetrics) || []) {
    L = Math.max(L, 2 * (cap + pad - asc) + asc + desc, asc - desc + 2 * pad);
  }
  return r3(L);
}

module.exports = {
  FPS, GSAP_PATH, SERVER_ROOT, PANEL_GROUND, tightLineEm,
  kitError, canvas, gsapVersion, gsapExtraFile,
  graphemes, cleanText, escapeHtml, upper, isRtl, isJa, scriptOf, safeLang,
  normHex, rgba, contrastRatio, normalizePalette, derivePalette,
  metricsFor, cardFonts, fontFaceCss, measureEm, fitText, tokenize,
  documentHtml, metaJsonFor, assertDeterministicScript,
  cardTiming, exitStagger, fromTo, to,
  r2, r3, px, clamp, box, point,
};
