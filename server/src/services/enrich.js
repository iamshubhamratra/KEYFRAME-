// Deterministic composition enrichment — the visual-quality SAFETY NET.
//
// The composer model (gemini-2.5-flash, budget-capped) is unreliable at filling
// a frame: it routinely ships a near-empty BLACK VOID (a flat dark ground + one
// tiny caption) that passes every STRUCTURAL gate (lint is time/track-only; the
// QA vision model is a weak proxy) and lands in front of the user. Prompt tuning
// has plateaued. So instead of asking the weak model to do better, we GUARANTEE
// a richer result in code, applied to every composition before it renders:
//
//   1. RECOLOR DEAD GROUNDS — a flat, undesigned near-black or near-white ground
//      (on <body>/<html> or a full-bleed clip) is replaced IN PLACE with a
//      design-system gradient of the SAME luminance (dark→dark, light→light).
//      This kills the flat black void while PRESERVING the text contrast the
//      model authored (white-on-dark stays white-on-dark). Mid-tone / branded /
//      gradient / image grounds are left untouched.
//   2. #__kf_bg — a full-bleed design-system gradient as the BACKMOST layer
//      (z behind content), at the luminance the content expects, so a comp with
//      no ground element at all still renders on a designed backdrop.
//   3. #__kf_fx — an always-on animated SVG vector layer (drifting particle field
//      + two counter-rotating dashed rings + two drawing accent lines) as the
//      FOREMOST layer (high z, pointer-events:none, modest opacity). This is the
//      guaranteed floor of MOTION + VECTORS the user keeps asking for — present
//      on every frame, even over a scene the model left empty.
//
// Everything is built the lint-passing way fallback.js proved out: CSS opacity
// for initial hidden state, GSAP tweens with FINITE repeats, and — critically —
// ALL randomness resolved at BUILD time (Node Math.random) into literal numbers,
// so the composition's runtime <script> stays deterministic (`non_deterministic_code`
// forbids Math.random/Date in the captured script). Injected tweens are appended
// to the model's existing paused `vid` timeline (found via its registration
// line) so no extra <script> is introduced. Idempotent via the __kf_fx marker.
// Layering uses CSS z-index (the renderer is headless Chromium, so it applies).

function lum(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  if (!Number.isFinite(n)) return 128;
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}
function rgba(hex, a) {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Map a few CSS named colors that show up as flat grounds.
const NAMED = { black: "#000000", white: "#ffffff" };
function toHex(v) {
  const s = String(v).trim().toLowerCase();
  if (NAMED[s]) return NAMED[s];
  let m = s.match(/^#([0-9a-f]{6})$/i); if (m) return "#" + m[1];
  m = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i); if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return "#" + [m[1], m[2], m[3]].map((x) => Math.max(0, Math.min(255, +x)).toString(16).padStart(2, "0")).join("");
  return null;
}

// Derive a design-system theme from frame-pack tokens (frame_registry shape:
// { colors:{name:hex}, fonts:[] }). Falls back to a premium dark-studio palette.
function themeFromTokens(packTokens) {
  const entries = packTokens && packTokens.colors ? Object.entries(packTokens.colors) : [];
  if (entries.length < 2) {
    return { darkBase: "#0B1020", lightBase: "#F4F6FB", accents: ["#7CC4FF", "#FF7DB4", "#FFC878", "#8BE0A4"] };
  }
  const byLum = [...entries].sort((a, b) => lum(b[1]) - lum(a[1]));
  const lightBase = byLum[0][1];
  const darkBaseTok = byLum[byLum.length - 1][1];
  // A pack whose darkest token isn't actually dark (no true ground) gets a deep
  // neutral so the dark gradient reads as a ground, not a muddy mid-tone.
  const darkBase = lum(darkBaseTok) < 70 ? darkBaseTok : "#0B1020";
  const sat = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx === 0 ? 0 : (mx - mn) / mx;
  };
  const accents = entries.map(([, v]) => v).filter((v) => sat(v) > 0.18).sort((a, b) => sat(b) - sat(a));
  if (!accents.length) accents.push("#7CC4FF");
  return { darkBase, lightBase, accents: accents.slice(0, 4) };
}

// A design-system gradient string at a chosen luminance. `dark` true → a deep
// ground with brighter accent blooms; false → a light ground with soft blooms.
function groundGradient(theme, dark) {
  const base = dark ? theme.darkBase : theme.lightBase;
  const a0 = theme.accents[0] || base;
  const a1 = theme.accents[1] || theme.accents[0] || base;
  const o0 = dark ? 0.34 : 0.22, o1 = dark ? 0.26 : 0.17;
  return `radial-gradient(62% 55% at 22% 26%, ${rgba(a0, o0)}, transparent 60%), ` +
         `radial-gradient(55% 50% at 82% 80%, ${rgba(a1, o1)}, transparent 62%), ${base}`;
}

// ------------------------------------------------------- recolor dead grounds
// Replace a FLAT near-black / near-white solid background with a same-luminance
// design-system gradient. Returns the gradient or null (mid-tone / not flat).
function regroundValue(value, theme) {
  const v = String(value).trim();
  if (/gradient|url\(|var\(|image/i.test(v)) return null; // designed/branded — leave it
  const hex = toHex(v);
  if (!hex) return null;
  const L = lum(hex);
  if (L < 64) return groundGradient(theme, true);
  if (L > 224) return groundGradient(theme, false);
  return null; // mid-tone brand color — never touch
}

// (a) <style> rules for html/body. (b) inline styles on FULL-BLEED clips
// (position absolute/fixed covering the frame). Only flat near-black/white
// solids are touched; everything else passes through verbatim.
function recolorGrounds(html, theme) {
  let out = String(html);

  // (a) html / body { ... background[-color]: <flat solid> ... }
  out = out.replace(/((?:html|body)[^{}]*\{[^{}]*?)background(-color)?\s*:\s*([^;}]+)([;}])/gi,
    (m, pre, _bc, val, end) => {
      const g = regroundValue(val, theme);
      return g ? `${pre}background: ${g}${end}` : m;
    });

  // (b) inline style on a full-bleed element: must look full-bleed AND have a
  // flat solid background. We rewrite only the background token.
  out = out.replace(/style\s*=\s*"([^"]*)"/gi, (m, style) => {
    const fullBleed = /position\s*:\s*(?:absolute|fixed)/i.test(style) &&
      (/inset\s*:\s*0/i.test(style) ||
       (/(?:width)\s*:\s*100(?:%|vw)/i.test(style) && /(?:height)\s*:\s*100(?:%|vh)/i.test(style)));
    if (!fullBleed) return m;
    const bg = style.match(/background(?:-color)?\s*:\s*([^;]+)(;|$)/i);
    if (!bg) return m;
    const g = regroundValue(bg[1], theme);
    if (!g) return m;
    const newStyle = style.replace(bg[0], `background: ${g}${bg[2] === ";" ? ";" : ""}`);
    return `style="${newStyle}"`;
  });

  return out;
}

// Detect whether the composition's dominant ground is DARK, so the injected
// backmost layer + particle palette match what the text expects. Scans body/html
// and the first full-bleed clip's background; defaults LIGHT (browser default).
function detectGroundIsDark(html) {
  const src = String(html);
  const probes = [];
  const bodyBg = src.match(/(?:html|body)[^{}]*\{[^{}]*?background(?:-color)?\s*:\s*([^;}]+)/i);
  if (bodyBg) probes.push(bodyBg[1]);
  const fb = src.match(/style\s*=\s*"[^"]*position\s*:\s*(?:absolute|fixed)[^"]*(?:inset\s*:\s*0|height\s*:\s*100)[^"]*"/i);
  if (fb) { const bm = fb[0].match(/background(?:-color)?\s*:\s*([^;"]+)/i); if (bm) probes.push(bm[1]); }
  for (const p of probes) { const hx = toHex(p); if (hx) return lum(hx) < 110; }
  return false;
}

// ----------------------------------------------------------------- bg layer
// Backmost (z-index:0, BEHIND all content) so anything here is safe: it can
// never reduce text legibility. Carries the design-system ground, a faint dot
// grid, and 3 large soft drifting bokeh orbs that add premium depth/motion to
// transparent / sparse / transition scenes (where the model left the frame thin)
// while staying hidden behind any opaque scene ground on a full scene.
function backgroundLayer(theme, isDark, duration) {
  const a = theme.accents.length ? theme.accents : ["#7CC4FF"];
  const spots = [
    { x: 16, y: 22, r: 30, o: isDark ? 0.5 : 0.42, c: a[0] },
    { x: 84, y: 70, r: 34, o: isDark ? 0.42 : 0.34, c: a[1 % a.length] },
    { x: 52, y: 88, r: 26, o: isDark ? 0.36 : 0.3, c: a[2 % a.length] },
  ];
  const bokeh = spots.map((s, i) =>
    `<div id="kfbk${i}" style="position:absolute; left:${s.x}%; top:${s.y}%; width:${s.r}%; aspect-ratio:1; transform:translate(-50%,-50%); border-radius:50%; background:radial-gradient(circle, ${rgba(s.c, s.o)}, transparent 68%); filter:blur(8px);"></div>`
  ).join("");
  return `  <div id="__kf_bg" class="clip" data-start="0" data-duration="${duration}" data-track-index="940"
       style="position:absolute; inset:-5%; z-index:0; pointer-events:none; will-change:transform; background:${groundGradient(theme, isDark)};">
    ${bokeh}
    <div style="position:absolute; inset:0; background-image:radial-gradient(circle, ${isDark ? rgba(theme.accents[0] || "#fff", 0.05) : "rgba(0,0,0,0.045)"} 1.4px, transparent 1.4px); background-size:34px 34px;"></div>
  </div>`;
}

// ----------------------------------------------------------------- vfx layer
let TLV = "tl";
function vfxLayer(theme, isDark, { width, height, duration }) {
  const r2 = (n) => Math.round(n * 100) / 100;
  const acc = theme.accents.length ? theme.accents : ["#7CC4FF"];
  const pick = (i) => acc[i % acc.length];
  const N = 16;
  const particleEls = [];
  const tweens = [];
  for (let i = 0; i < N; i++) {
    const cx = Math.round(Math.random() * 1000) / 10;
    const cy = Math.round(Math.random() * 1000) / 10;
    const rad = 2 + Math.round(Math.random() * 6);
    const o = (0.18 + Math.random() * 0.3).toFixed(2);
    particleEls.push(`<circle class="kfp kfp${i}" cx="${cx}%" cy="${cy}%" r="${rad}" fill="${pick(i)}" opacity="${o}" />`);
    const dy = -(20 + Math.round(Math.random() * 46));
    const dx = r2((Math.random() - 0.5) * 16);
    const dur = (5.5 + Math.random() * 7).toFixed(1);
    const rep = Math.max(0, Math.floor(duration / Number(dur)) - 1);
    tweens.push(`  ${TLV}.to(".kfp${i}", { attr:{ cy:"+=${dy}%" }, x:"+=${dx}", duration:${dur}, ease:"sine.inOut", yoyo:true, repeat:${rep} }, 0);`);
  }
  const ringR = Math.round(Math.min(width, height) * 0.26);
  const cxPx = Math.round(width * 0.5), cyPx = Math.round(height * 0.42);
  const lineLen = Math.round(width * 0.92);
  const y1 = Math.round(height * 0.26), y2 = Math.round(height * 0.74);
  const ringOp = isDark ? 0.16 : 0.2, lineOp = isDark ? 0.2 : 0.22;
  const accentEls =
    `<circle id="kf-ring" cx="${cxPx}" cy="${cyPx}" r="${ringR}" fill="none" stroke="${pick(0)}" stroke-width="2.5" opacity="${ringOp}" stroke-dasharray="7 16" />` +
    `<circle id="kf-ring2" cx="${cxPx}" cy="${cyPx}" r="${Math.round(ringR * 0.62)}" fill="none" stroke="${pick(1)}" stroke-width="2" opacity="${ringOp * 0.8}" stroke-dasharray="3 12" />` +
    `<line id="kf-l1" x1="0" y1="${y1}" x2="${lineLen}" y2="${y1}" stroke="${pick(2)}" stroke-width="2.5" opacity="${lineOp}" stroke-dasharray="${lineLen}" stroke-dashoffset="${lineLen}" />` +
    `<line id="kf-l2" x1="${width}" y1="${y2}" x2="${width - lineLen}" y2="${y2}" stroke="${pick(0)}" stroke-width="2.5" opacity="${lineOp}" stroke-dasharray="${lineLen}" stroke-dashoffset="${lineLen}" />`;
  const spins = Math.max(1, Math.round(duration / 16));
  tweens.push(`  ${TLV}.to("#kf-ring", { rotation:360, svgOrigin:"${cxPx} ${cyPx}", duration:${r2(duration / spins)}, ease:"none", repeat:${Math.max(0, spins - 1)} }, 0);`);
  tweens.push(`  ${TLV}.to("#kf-ring2", { rotation:-360, svgOrigin:"${cxPx} ${cyPx}", duration:${r2(duration / spins)}, ease:"none", repeat:${Math.max(0, spins - 1)} }, 0);`);
  const lineDur = Math.min(2.2, Math.max(1.0, duration * 0.1));
  const lineRep = Math.max(0, Math.floor(duration / (lineDur * 2)) - 1);
  tweens.push(`  ${TLV}.fromTo("#kf-l1", { strokeDashoffset:${lineLen} }, { strokeDashoffset:0, duration:${r2(lineDur)}, ease:"power2.inOut", yoyo:true, repeat:${lineRep} }, 0.3);`);
  tweens.push(`  ${TLV}.fromTo("#kf-l2", { strokeDashoffset:${lineLen} }, { strokeDashoffset:0, duration:${r2(lineDur)}, ease:"power2.inOut", yoyo:true, repeat:${lineRep} }, ${r2(0.3 + lineDur * 0.5)});`);
  tweens.push(`  ${TLV}.fromTo("#__kf_bg", { scale:1, xPercent:0, yPercent:0 }, { scale:1.08, xPercent:1.5, yPercent:-1.5, duration:${duration}, ease:"sine.inOut" }, 0);`);
  // Slow bokeh drift (behind content — purely atmospheric depth/motion).
  const bokehDrift = [{ dx: 6, dy: -5 }, { dx: -7, dy: 4 }, { dx: 4, dy: 6 }];
  bokehDrift.forEach((b, i) => {
    const bd = (duration * (0.7 + i * 0.12)).toFixed(1);
    tweens.push(`  ${TLV}.fromTo("#kfbk${i}", { xPercent:0, yPercent:0, scale:1 }, { xPercent:${b.dx}, yPercent:${b.dy}, scale:1.15, duration:${bd}, ease:"sine.inOut", yoyo:true, repeat:${Math.max(0, Math.floor(duration / Number(bd)) - 1)} }, 0);`);
  });
  const html =
`  <div id="__kf_fx" class="clip" data-start="0" data-duration="${duration}" data-track-index="941"
       style="position:absolute; inset:0; z-index:2147483000; pointer-events:none;">
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice" style="position:absolute; inset:0; width:100%; height:100%;">
      ${particleEls.join("")}${accentEls}
    </svg>
  </div>`;
  return { html, tweens };
}

function detectTimelineVar(html) {
  const m = String(html).match(/window\.__timelines\s*\[\s*["']vid["']\s*\]\s*=\s*([A-Za-z_$][\w$]*)\s*;/);
  return m ? { varName: m[1], anchor: m[0] } : null;
}

function enrichComposition(html, { width, height, duration, packTokens } = {}) {
  let src = String(html || "");
  if (!src || src.includes("__kf_fx")) return { html: src, changed: false };

  const reg = detectTimelineVar(src);
  if (!reg) return { html: src, changed: false };
  TLV = reg.varName;

  const rootOpen = src.match(/<[a-zA-Z][\w-]*\b[^>]*\bdata-composition-id\s*=\s*["']vid["'][^>]*>/);
  if (!rootOpen) return { html: src, changed: false };

  const dims = { width: Number(width) || 1920, height: Number(height) || 1080, duration: Number(duration) || 10 };
  const theme = themeFromTokens(packTokens);
  const isDark = detectGroundIsDark(src);

  // 1) Recolor flat dead grounds in place (same-luminance, contrast-preserving).
  src = recolorGrounds(src, theme);

  // Re-find the root open AFTER recolor (its style may have changed length).
  const rootOpen2 = src.match(/<[a-zA-Z][\w-]*\b[^>]*\bdata-composition-id\s*=\s*["']vid["'][^>]*>/);
  const insertAt = (rootOpen2 || rootOpen).index + (rootOpen2 || rootOpen)[0].length;

  // 2) Inject backmost bg + foreground vfx.
  const bg = backgroundLayer(theme, isDark, dims.duration);
  const fx = vfxLayer(theme, isDark, dims);
  src = src.slice(0, insertAt) + "\n" + bg + "\n" + fx.html + "\n" + src.slice(insertAt);

  // 3) Splice the injected tweens before the timeline registration line.
  const block = "\n  // --- KEYFRAME enrichment (deterministic motion/vector floor) ---\n" + fx.tweens.join("\n") + "\n";
  src = src.replace(reg.anchor, block + "  " + reg.anchor);

  return { html: src, changed: true };
}

module.exports = { enrichComposition, themeFromTokens };
