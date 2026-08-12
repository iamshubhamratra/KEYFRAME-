// BAUHAUS RIOT composer — a native GSAP + SVG/CSS "print poster that came alive".
// The pack `bauhaus-riot` (manifest renderer:"bauhaus-riot") routes here from
// attemptLlmComposition, like the flagship / brightlife / blueprint / bloom composers.
//
// Same envelope as the others: buildComposition -> {indexHtml, metaJson}. A persistent
// PAPER chrome (cream ground, halftone dots, breathing primary-color geometry, a
// numbered sheet masthead + frame) is content-independent; each storyboard scene is
// injected into a bauhaus SCENE-TYPE (title / recipe / stats / manifesto / figure / cta),
// or — when a real screenshot/photo is available — a POSTER-FRAMED panel (plate).
//
// Motion grammar: stamps snap flat, shapes drop and bounce, a curtain wipe lifts on
// the opener, X-marks strike, a highlight sweeps. NO gradients / glows / blur.
//
// Engineering contract (identical to the other composers): one paused GSAP timeline on
// window.__timelines["vid"]; direct-child .clip scenes on unique tracks; a boundary
// opacity:0 hard-kill per scene (the paper persists behind them); ONE seek-safe caption
// node + sheet counter driven by a single onUpdate proxy; finite repeats; pathLength=100
// draw-ons; cqw units + container-type:size; hidden = opacity:0 only. Deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { isLogo } = require("./asset_priority");
const admission = require("./asset_admission");
const { resolveBrand } = require("./brand_kit");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
const DISPLAY = "Archivo Black";
const MONO = "Space Grotesk";
const BODY = "Inter";

// ---- the portrait sheet ------------------------------------------------------
// THIS PACK IS A SHEET OF PAPER, AND 9:16 IS A DIFFERENT SHEET.
//
// Every size in this file is `cqw` — 1% of the frame's WIDTH — because the poster was
// authored on a 1920x1080 landscape sheet where width is the LONG side. In 9:16 the width is
// the SHORT side, so the identical number draws a physically smaller object inside a frame
// that is 3.16x taller in cqw terms (56.25cqw tall vs 177.8cqw). Nothing overflows and nothing
// errors; the poster simply becomes a band of small print floating in a tall empty page.
// Measured by scripts/test-frame-fill.js: the pack kept 51-57% of its own density at 9:16,
// which is why it was declared landscape-only in the 11 Aug orientation pass.
//
// `TS` restates an authored size for the portrait sheet. It is NOT the frame's aspect ratio
// (1.78): that would preserve each element's share of the frame's HEIGHT and blow every
// headline straight out of a column that is now 44% narrower. It is the ratio that keeps type
// at the same share of the MEASURE — the line length it actually has to fit — which is the
// number a print designer re-sets a poster at when the page changes shape. Furniture rides the
// same scale so the sheet keeps its proportions to its own type; only positions expressed as
// percentages are left alone, since those already track the frame.
const TS = 1.62;

// A size in the pack's authored units, emitted for whichever sheet is being printed.
// `z(4.6, port)` -> "4.6cqw" landscape, "7.45cqw" portrait.
const z = (n, port) => `${Math.round((port ? n * TS : n) * 100) / 100}cqw`;

// ---- helpers -----------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ---- brand colour-kit (lifted from blueprint_composer / flagship) — rotate a hue while
// pinning the source's authored LUMINANCE + SATURATION, so a recoloured primary keeps its
// exact place in the value ladder (yellow bright / red mid / blue dark). Only HUE moves.
const hexToRgb = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
const relLum = (h) => { const [r0, g0, b0] = hexToRgb(h).map((v) => v / 255); const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); return 0.2126 * f(r0) + 0.7152 * f(g0) + 0.0722 * f(b0); };
const rgbToHsl = ([r0, g0, b0]) => {
  r0 /= 255; g0 /= 255; b0 /= 255;
  const mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r0 ? (g0 - b0) / d + (g0 < b0 ? 6 : 0) : mx === g0 ? (b0 - r0) / d + 2 : (r0 - g0) / d + 4;
  return [h * 60, s, l];
};
const hslHex = (h, s, l) => {
  if (!s) return `#${toHex2(l * 255).repeat(3)}`;
  const t = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const ch = (x) => { if (x < 0) x += 1; if (x > 1) x -= 1; if (x < 1 / 6) return p + (q - p) * 6 * x; if (x < 0.5) return q; if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6; return p; };
  return `#${toHex2(ch(t + 1 / 3) * 255)}${toHex2(ch(t) * 255)}${toHex2(ch(t - 1 / 3) * 255)}`;
};
const hueOf = (hex) => rgbToHsl(hexToRgb(hex))[0];
const hueDist = (a, b) => { const d = Math.abs(((a - b) % 360 + 360) % 360); return Math.min(d, 360 - d); };
// fully-saturated primaries (amber/gold-grade): 0.006 is the true 8-bit quantization ceiling.
const LUM_PIN = 0.006;
function reHue(hex, hue) {
  const [, s] = rgbToHsl(hexToRgb(hex));
  if (s < 0.02) return hex;
  const target = relLum(hex);
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (relLum(hslHex(hue, s, mid)) < target) lo = mid; else hi = mid; }
  const l = (lo + hi) / 2;
  let out = hex, err = Infinity;
  for (const dl of [0, -1 / 255, 1 / 255]) {
    const cand = hslHex(hue, s, l + dl);
    const e = Math.abs(relLum(cand) - target);
    if (e < err) { err = e; out = cand; }
  }
  return err <= LUM_PIN ? out : hex;
}
// resolveBrand lays accents brand-first then pack, so the brand-led run ends at the first
// entry the pack already owned; [] means no brand applied.
function brandLedOf(brand, packAccents) {
  const pack = new Set(packAccents.map((a) => String(a).toLowerCase()));
  const out = [];
  for (const a of brand.accents) { if (pack.has(String(a).toLowerCase())) break; out.push(a); }
  return out;
}

// The Bauhaus primaries. Under a brand skin the three rotate TOGETHER by one shared delta
// onto the brand hue family (each pinned to its OWN authored relative luminance), so the
// VALUE LADDER and the three-field TRIAD SPACING survive while the hue becomes the brand's.
// ALL-OR-NOTHING + FAIL-OPEN: a partial rotation (one primary fails the pin) would break the
// triad, so it is all three or none; any resolver miss keeps the classic primaries. A null
// skin returns the exact classic literals, byte-for-byte.
function riotTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let red = "#E4432C", blue = "#2B4BD7", yellow = "#F2C21F", resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: "#F4EEE1", isDark: false, packAccents: [red, blue, yellow] });
    const led = brandLedOf(brand, [red, blue, yellow]);
    if (brand.applied && led.length) {
      const delta = ((hueOf(led[0]) - hueOf(red)) % 360 + 360) % 360;
      const rot = (hex) => { const tgt = ((hueOf(hex) + delta) % 360 + 360) % 360; const out = reHue(hex, tgt); return { out, ok: hueDist(hueOf(out), tgt) <= 10 }; };
      const rr = rot(red), rb = rot(blue), ry = rot(yellow);
      if (rr.ok && rb.ok && ry.ok) {
        red = rr.out; blue = rb.out; yellow = ry.out;
        resolvedBrand = {
          ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
          accents: led, emphasis: brand.emphasis,
          adjusted: brand.adjusted, dropped: brand.dropped,
          tier: brand.tier, applied: true,
        };
      }
    }
  } catch { red = "#E4432C"; blue = "#2B4BD7"; yellow = "#F2C21F"; resolvedBrand = null; }
  return {
    paper: "#F4EEE1", cream: "#FFFDF6", ink: "#17161B", body: "#3F3D45",
    red, blue, yellow,
    displayStack: `'${DISPLAY}', 'Inter', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace, resolvedBrand,
  };
}

// Headline split into <span class="word shadow-*"> with alternating red/blue drop
// shadows; the emphasis word always takes the red shadow. Used with the stamp-in.
function words(scene) {
  const H = String(scene.headline || scene.title || "");
  const E = String(scene.emphasis || "").trim().toLowerCase();
  return H.split(/\s+/).filter(Boolean).map((w, i) => {
    const bare = w.replace(/[.,!?;:]$/, "").toLowerCase();
    const sh = (E && bare === E) ? "shadow-red" : (i % 2 ? "shadow-blue" : "shadow-red");
    return `<span class="word ${sh}">${esc(w)}</span>`;
  }).join(" ");
}

function pickNumber(scene) {
  const src = [scene.emphasis, scene.subtext, scene.headline].map((x) => String(x || "")).find((x) => /\d/.test(x)) || "";
  const m = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)\s?(%|x|\+|k|m|bn?)?/i.exec(src);
  if (!m) return null;
  const target = Math.round(parseFloat(m[2].replace(/,/g, "")));
  if (!isFinite(target)) return null;
  return { pre: m[1] || "", target: Math.min(Math.max(target, 0), 100000), suf: (m[3] || "") };
}

function bullets(scene, n) {
  let list = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean) : [];
  if (!list.length && scene.subtext) list = String(scene.subtext).split(/[.;\n•]|\s—\s/).map((s) => s.trim()).filter((s) => s.length > 2);
  return list.slice(0, n).map((s) => String(s));
}

// A LABEL IS TRIMMED TO A WORD, NEVER TO A CHARACTER. Both label paths were bare
// `.slice(0, 24)`, and every stamp in this pack prints one — so a stat lifted from a real
// sentence shipped as "99.9% UPTIME ACROSS 40 R", a severed word inside a hard-edged stamp
// where it reads as a rendering fault rather than an abbreviation. Rendered proof at both
// aspects; it is not a portrait defect, it is simply most obvious there.
function shortLabel(s, max = 24) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, "") + "…";
}

function pickStats(scene, max, S) {
  const out = [];
  for (const l of (Array.isArray(scene.onScreenText) ? scene.onScreenText : [])) {
    const m = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)\s?(%|x|\+|k|m)?/i.exec(String(l));
    if (m) out.push({ pre: m[1] || "", target: Math.round(parseFloat(m[2].replace(/,/g, ""))), suf: (m[3] || ""), label: shortLabel(String(l).replace(m[0], "").trim()) || S.metric });
    if (out.length >= max) break;
  }
  if (!out.length) { const n = pickNumber(scene); if (n) out.push({ ...n, label: shortLabel(scene.subtext || scene.headline || S.metric) }); }
  return out.slice(0, max);
}

// Supporting feature lines (from onScreenText, else voiceover sentences) to fill copy.
function featureLines(scene, n) {
  let src = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean).map(String) : [];
  if (src.length < 2 && scene.voiceover) src = src.concat(String(scene.voiceover).split(/[.!?;\n]|\s—\s/));
  const head = String(scene.headline || "").toLowerCase().trim();
  const sub = String(scene.subtext || "").toLowerCase().trim();
  const seen = new Set(), out = [];
  for (const s of src) {
    const t = String(s).replace(/\s+/g, " ").trim();
    const k = t.toLowerCase();
    if (t.length >= 5 && t.length <= 66 && k !== head && k !== sub && !seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out.slice(0, n);
}

// A square-bulleted feature list + staggered stamp-in. `__AT__` placeholder replaced.
function featList(id, scene, theme) {
  const feats = featureLines(scene, 3);
  if (!feats.length) return { html: "", s: [] };
  const cols = [theme.red, theme.blue, theme.yellow];
  const html = `<ul class="riot-feat" id="${id}-feat">${feats.map((f, i) => `<li class="${id}-fi" style="opacity:0;"><span class="riot-sq" style="background:${cols[i % 3]};"></span>${esc(f)}</li>`).join("")}</ul>`;
  const s = [`tl.fromTo(".${id}-fi",{opacity:0,x:-26},{opacity:1,x:0,duration:0.45,ease:"back.out(1.7)",stagger:0.15},__AT__);`];
  return { html, s };
}

function plateOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is key-moment material, never a poster panel
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  // ADMISSION IS SHARED (services/asset_admission). This line used to read a TRUST signal
  // as an ADMISSION test: web stock satisfies neither clause and the Creative Director is
  // told "when in doubt, use background", so a stock photo was never drawn at all — measured
  // as zero <img> from a wire of five good pictures. Trust now ORDERS the pool
  // (admission.displayRank); only an explicit reject is excluded.
  return admission.displayOk(a);
}

function riotArchetype(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "title";
  if (i === total - 1 || k === "cta" || p === "cta") return "cta";
  if (k === "chart" || k === "stat" || k === "countdown" || pickNumber(scene)) return "stats";
  if (k === "quote" || p === "problem" || p === "comparison") return "manifesto";
  if (bullets(scene, 3).length >= 2 || /how|process|step|feature/.test(p + k)) return "recipe";
  return "figure";
}

const STRINGS = {
  // scene kickers (formerly KICK — key names preserved so `KICK.xxx` -> `S.xxx`)
  title: "AI motion press", recipe: "the recipe — three moves", stats: "the catalogue", manifesto: "the manifesto", figure: "quality control", plate: "the proof — page one", cta: "print your first film",
  // inline copy fallbacks folded in from the per-scene builders
  titleSub: "Type a sentence — get a poster-grade film.",
  statsBody: "Every one art-directed. Every one yours.",
  manifestoEmph: "Just words.",
  plateTag: "the proof",
  ctaButton: "Start free",
  ctaUrl: "PRINT YOUR FIRST FILM",
  metric: "metric",
  statLabel: "styles",
  plateAlt: "screenshot",
  recipeSteps: ["Write", "Direct", "Render"],
  manifestoLines: ["No crew.", "No timeline.", "No render farm."],
};

// ---- scene-type builders  ((scene, ctx, asset) -> { html, s }) ----------------
function open(id, ctx) { return `<div class="clip riot-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

function riotTitle(scene, ctx) {
  const { id, T, theme, port } = ctx;
  const Z = (n) => z(n, port);
  const kick = esc(scene.kicker || ctx.S.title).toUpperCase();
  const sub = esc(scene.subtext || ctx.S.titleSub);
  const curtain = ctx.i === 0
    ? `<div class="bar" id="${id}-cur1" style="left:0;background:${theme.red};"></div><div class="bar" id="${id}-cur2" style="left:33%;background:${theme.blue};"></div><div class="bar" id="${id}-cur3" style="left:66%;width:34.2%;background:${theme.yellow};"></div>`
    : "";
  // THE OPENER HAD NO PORTRAIT SETTING AT ALL. Its display size was chosen against a 22-char
  // measure on the wide sheet; on the tall one the same number sets a title less than half the
  // width of its own column, above a rule 30cqw long in a 100cqw page. The tall sheet is where
  // a poster title should be BIGGEST — it is the one beat with nothing to share the page with —
  // so it takes a fuller measure and the rule runs to the type it underlines.
  const headCqw = scene.headline && scene.headline.length > 22 ? 7 : 9;
  const html = `${open(id, ctx)}<div class="safe">
    <span class="kicker" id="${id}-kick" style="opacity:0;"><span class="sq"></span>${kick}</span>
    <div class="display" id="${id}-head" style="margin-top:${Z(2.2)};font-size:${Z(headCqw)};">${words(scene)}</div>
    <div id="${id}-bar" style="width:${port ? "62cqw" : "30cqw"};height:${Z(0.75)};background:${theme.red};margin-top:${Z(1.8)};transform:scaleX(0);"></div>
    <div class="body" id="${id}-sub" style="opacity:0;margin-top:${Z(1.8)};font-size:${Z(2.1)};">${sub}</div>
  </div>
  <svg id="${id}-aster" width="170" height="170" viewBox="0 0 100 100" style="position:absolute;${port ? `right:8cqw;top:${Z(16)};width:${Z(9)};height:${Z(9)};` : "right:16cqw;top:16cqw;"}opacity:0;" data-layout-allow-occlusion>
    <g stroke="${theme.red}" stroke-width="11" stroke-linecap="round"><line x1="50" y1="4" x2="50" y2="96"/><line x1="4" y1="50" x2="96" y2="50"/><line x1="17" y1="17" x2="83" y2="83"/><line x1="83" y1="17" x2="17" y2="83"/></g></svg>
  ${curtain}</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    ...(ctx.i === 0 ? [
      `tl.fromTo("#${id}-cur1",{scaleY:1},{scaleY:0,duration:0.75,ease:"power4.inOut"},${r(T + 0.25)});`,
      `tl.fromTo("#${id}-cur2",{scaleY:1},{scaleY:0,duration:0.75,ease:"power4.inOut"},${r(T + 0.4)});`,
      `tl.fromTo("#${id}-cur3",{scaleY:1},{scaleY:0,duration:0.75,ease:"power4.inOut"},${r(T + 0.55)});`,
    ] : [`tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`]),
    `tl.fromTo("#${id}-kick",{opacity:0,y:-22},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.0)});`,
    `stamp("#${id}-head .word",${r(T + 1.2)},-4,0.09);`,
    `tl.fromTo("#${id}-bar",{scaleX:0},{scaleX:1,duration:0.55,ease:"power3.inOut"},${r(T + 1.95)});`,
    `tl.fromTo("#${id}-sub",{opacity:0,y:22},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 2.2)});`,
    `tl.fromTo("#${id}-aster",{opacity:0,scale:0,rotation:-160,transformOrigin:"center center"},{opacity:1,scale:1,rotation:0,duration:0.65,ease:"back.out(1.8)"},${r(T + 1.75)});`,
    `tl.to("#${id}-aster",{rotation:90,duration:${r(Math.max(1.5, ctx.L - 2))},ease:"sine.inOut"},${r(T + 2.5)});`,
  ];
  return { html, s };
}

function riotRecipe(scene, ctx) {
  const { id, T, theme, port } = ctx;
  const Z = (n) => z(n, port);
  let items = bullets(scene, 3);
  if (items.length < 2) items = ctx.S.recipeSteps;
  const shp = Z(11);
  const shapeFor = (i) => i % 3 === 0
    ? `<div style="width:${shp};height:${shp};border-radius:50%;background:${theme.yellow};border:${Z(0.24)} solid ${theme.ink};box-shadow:${Z(0.5)} ${Z(0.5)} 0 ${theme.ink};"></div>`
    : i % 3 === 1
      ? `<svg width="220" height="220" viewBox="0 0 100 100" style="width:${shp};height:${shp};overflow:visible;"><polygon points="50 5 97 95 3 95" fill="${theme.red}" stroke="${theme.ink}" stroke-width="5"/></svg>`
      : `<div style="width:${shp};height:${shp};background:${theme.blue};border:${Z(0.24)} solid ${theme.ink};box-shadow:${Z(0.5)} ${Z(0.5)} 0 ${theme.ink};"></div>`;
  // THE STEP SEQUENCE TURNS THE CORNER ON THE TALL SHEET. Three 24cqw cells plus two arrows
  // measure ~95cqw across a page whose safe measure is 88 — the row would have run into both
  // margins. A process reads down a tall page as naturally as it reads across a wide one, so
  // the row becomes a column and the arrows turn with it. The wrapper's transform is static
  // and GSAP only ever targets the `.draw` path inside, so the two never contend for it.
  const arrow = () => `<svg class="${id}-arr" width="120" height="60" viewBox="0 0 100 50" style="margin-top:${port ? "0" : "4.6cqw"};${port ? `width:${Z(7)};transform:rotate(90deg);` : ""}overflow:visible;flex:0 0 auto;">
      <path class="draw" pathLength="100" d="M4 25 H74" fill="none" stroke="${theme.ink}" stroke-width="9" stroke-linecap="round"/>
      <polygon class="${id}-arrh" points="70 8 98 25 70 42" fill="${theme.ink}" opacity="0"/></svg>`;
  const cells = items.map((t, i) => {
    const parts = String(t).split(/[:—-]\s?/);
    const label = (parts[0] || t).trim().slice(0, 14);
    return `<div class="recipe-item"><div class="${id}-shape" style="opacity:0;">${shapeFor(i)}</div><div class="recipe-label ${id}-lab" style="opacity:0;">${esc(label)}</div></div>`;
  });
  const row = cells.slice(1).reduce((acc, c) => acc + arrow() + c, cells[0]);
  const html = `${open(id, ctx)}<div class="safe">
    <span class="kicker" id="${id}-kick" style="opacity:0;"><span class="sq" style="background:${theme.blue};"></span>${esc(scene.kicker || ctx.S.recipe).toUpperCase()}</span>
    <h1 class="h1" id="${id}-head" style="margin-top:${Z(1.6)};">${words(scene)}</h1>
    <div style="display:flex;${port ? "flex-direction:column;gap:2.2cqw;" : "gap:5cqw;"}margin-top:${Z(3)};align-items:center;justify-content:center;">${row}</div>
  </div></div>`;
  const per = Math.max(0.18, (ctx.L - 2.2) / items.length * 0.5);
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo("#${id}-kick",{opacity:0,y:-22},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.15)});`,
    `tl.fromTo("#${id}-head .word",{yPercent:105,opacity:0},{yPercent:0,opacity:1,duration:0.55,ease:"power3.out",stagger:0.1},${r(T + 0.3)});`,
    `tl.fromTo(".${id}-shape",{opacity:0,y:-320},{opacity:1,y:0,duration:0.9,ease:"bounce.out",stagger:0.25},${r(T + 0.65)});`,
    `tl.fromTo(".${id}-lab",{opacity:0,y:16},{opacity:1,y:0,duration:0.45,ease:"power2.out",stagger:0.16},${r(T + 1.3)});`,
    `tl.to(".${id}-arr .draw",{strokeDashoffset:0,duration:0.45,ease:"power2.out",stagger:0.3},${r(T + 1.9)});`,
    `tl.fromTo(".${id}-arrh",{opacity:0,scale:0,transformOrigin:"left center"},{opacity:1,scale:1,duration:0.3,ease:"back.out(2)",stagger:0.3},${r(T + 2.25)});`,
    `tl.to(".${id}-shape",{rotation:6,duration:0.9,ease:"sine.inOut",yoyo:true,repeat:1,stagger:0.12,transformOrigin:"center center"},${r(T + 2.9)});`,
  ];
  return { html, s };
}

// THE UNIT BESIDE THE COUNTER IS A UNIT, OR IT IS NOTHING. With no parsed suffix this printed
// the label's FIRST WORD, so a stat whose label began with a figure set "8" and "99.9%" side by
// side in display type — two unrelated numbers reading as one. A unit is short and has no digits
// in it; anything else is a word that belongs in the label it came from.
function unitOf(stat) {
  if (stat.suf) return stat.suf;
  const w = String(stat.label || "").trim().split(/\s+/)[0] || "";
  return (w.length <= 6 && !/\d/.test(w)) ? w : "";
}

function riotStats(scene, ctx) {
  const { id, T, theme, port } = ctx;
  const stats = pickStats(scene, 4, ctx.S);
  if (!stats.length) stats.push({ pre: "", target: 40, suf: "", label: ctx.S.statLabel });
  const lead = stats[0];
  // ONE STAMP MUST NOT SIT WHERE FOUR WOULD. The tall sheet splits into an ink panel over a
  // paper field sized for a COLUMN of stamps; a film with a single figure centred one stamp in
  // the middle of that field and left the rest bare — the defect teampulse taught, in a
  // different pack.
  //
  // Stretching the PANEL to absorb the slack was tried first and was worse: at 64% the ink
  // band dwarfed the kicker, counter and line inside it, trading an empty half-page of paper
  // for an empty half-page of ink. The 46/54 split is the authored proportion and it stays.
  // What changes is where a short column HANGS — from the panel's edge, the way a caption hangs
  // from a plate, rather than floating in the middle of the field.
  const band = 46;
  const hang = port && stats.length <= 2;
  const stampCols = [theme.yellow, theme.cream, theme.red, theme.blue, theme.cream, theme.yellow];
  const stampInk = [theme.ink, theme.ink, theme.cream, theme.cream, theme.ink, theme.ink];
  const chips = stats.slice(0, 6).map((st, i) => `<span class="stamp ${id}-stamp" style="background:${stampCols[i % 6]};color:${stampInk[i % 6]};opacity:0;margin-left:${port ? 0 : [0, 6, 1.6, 8, 3.4, 9.6][i % 6]}cqw;">${esc(st.label || (st.pre + st.target + st.suf))}</span>`).join("");
  const html = `${open(id, ctx)}
    <div id="${id}-panel" style="position:absolute;${port ? `left:0;right:0;top:0;height:${band}%;` : "left:0;top:0;bottom:0;width:44%;"}background:${theme.ink};display:flex;flex-direction:column;justify-content:center;padding:${port ? "5cqw 8cqw" : "0 5cqw"};">
      <div style="font-family:${theme.monoStack};font-weight:700;font-size:${port ? "2.4cqw" : "1.3cqw"};letter-spacing:0.4em;color:${theme.yellow};text-transform:uppercase;">${esc(scene.kicker || ctx.S.stats).toUpperCase()}</div>
      <div style="display:flex;align-items:baseline;gap:${z(1, port)};margin-top:${z(1, port)};">
        <div id="${id}-count" style="font-family:${theme.displayStack};font-size:${z(11, port)};line-height:1;color:${theme.yellow};">${esc(lead.pre)}0</div>
        <div style="font-family:${theme.displayStack};font-size:${z(3, port)};color:${theme.cream};">${esc(unitOf(lead))}</div>
      </div>
      <div class="body" style="color:#B9B4A6;margin-top:1.4cqw;font-size:${port ? "2.8cqw" : "1.7cqw"};">${esc(scene.subtext || scene.headline || ctx.S.statsBody)}</div>
    </div>
    <div style="position:absolute;${port ? `left:0;right:0;top:${band}%;bottom:0;` : "left:48%;right:5%;top:0;bottom:0;"}display:flex;flex-direction:column;justify-content:${hang ? "flex-start" : "center"};padding-top:${hang ? z(7, port) : "0"};gap:${port ? "2.6cqw" : "1.7cqw"};align-items:${port ? "center" : "flex-start"};">${chips}</div>
  </div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.3},${T});`,
    `tl.fromTo("#${id}-panel",{xPercent:-105},{xPercent:0,duration:0.7,ease:"expo.out"},${r(T + 0.1)});`,
    `count("#${id}-count",${lead.target},${r(T + 0.55)},1.2,${JSON.stringify(lead.pre)});`,
    ...stats.slice(0, 6).map((st, i) => `stamp(".${id}-stamp:nth-child(${i + 1})",${r(T + 0.7 + i * 0.22)},${i % 2 ? 6 : -7},0);`),
    `tl.to(".${id}-stamp",{y:-8,duration:0.9,ease:"sine.inOut",yoyo:true,repeat:1,stagger:0.08},${r(T + 2.6)});`,
  ];
  return { html, s };
}

function riotManifesto(scene, ctx) {
  const { id, T, theme, port } = ctx;
  let lines = bullets(scene, 3);
  if (lines.length < 2) lines = ctx.S.manifestoLines;
  const emph = String(scene.emphasis || scene.headline || ctx.S.manifestoEmph).slice(0, 22);
  const xmk = () => `<svg class="xmark ${id}-x" viewBox="0 0 100 100"><path class="draw" pathLength="100" d="M12 12 L88 88" stroke="${theme.red}" stroke-width="16" stroke-linecap="round"/><path class="draw" pathLength="100" d="M88 12 L12 88" stroke="${theme.red}" stroke-width="16" stroke-linecap="round"/></svg>`;
  const Z = (n) => z(n, port);
  const rows = lines.map((t, i) => `<div style="position:relative;${i ? `margin-top:${Z(0.7)};` : ""}"><h1 class="display ${id}-line" style="font-size:${Z(5.4)};opacity:0;">${esc(String(t).toUpperCase())}</h1>${xmk()}</div>`).join("");
  const html = `${open(id, ctx)}<div class="safe" style="align-items:flex-start;text-align:left;padding-left:${port ? "8%" : "14%"};">
    ${rows}
    <div style="position:relative;margin-top:${Z(1.8)};">
      <div class="hilite ${id}-hl" style="background:${theme.yellow};"></div>
      <h1 class="display" id="${id}-em" style="font-size:${Z(7)};opacity:0;padding:${Z(0.4)} ${Z(1.2)};">${esc(emph.toUpperCase())}</h1>
    </div>
  </div></div>`;
  const per = Math.max(0.24, (ctx.L - 2.6) / lines.length);
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-line",{opacity:0,x:-46},{opacity:1,x:0,duration:0.5,ease:"power3.out",stagger:${r(per)}},${r(T + 0.2)});`,
    `tl.to(".${id}-x .draw",{strokeDashoffset:0,duration:0.24,ease:"power3.in",stagger:0.14},${r(T + 0.2 + per * lines.length + 0.3)});`,
    `tl.to(".${id}-line",{opacity:0.3,x:-8,duration:0.45,ease:"power2.out"},${r(T + ctx.L - 2.0)});`,
    `stamp("#${id}-em",${r(T + ctx.L - 1.8)},-3,0);`,
    `tl.to(".${id}-hl",{scaleX:1,duration:0.5,ease:"power3.inOut"},${r(T + ctx.L - 1.4)});`,
  ];
  return { html, s };
}

function riotFigure(scene, ctx) {
  const { id, T, theme, port } = ctx;
  const Z = (n) => z(n, port);
  const feat = featList(id, scene, theme);
  const html = `${open(id, ctx)}<div class="safe" style="${port ? "flex-direction:column;gap:4cqw;text-align:center;align-items:center;" : "flex-direction:row;gap:6cqw;text-align:left;align-items:center;"}">
    <svg id="${id}-eye" width="560" height="360" viewBox="0 0 280 180" style="width:${port ? "46cqw" : "28cqw"};overflow:visible;flex:0 0 auto;">
      <g id="${id}-rays" opacity="0" stroke="${theme.blue}" stroke-width="5" stroke-linecap="round">
        <line x1="140" y1="-16" x2="140" y2="6"/><line x1="30" y1="10" x2="46" y2="28"/><line x1="250" y1="10" x2="234" y2="28"/>
        <line x1="140" y1="196" x2="140" y2="174"/><line x1="30" y1="170" x2="46" y2="152"/><line x1="250" y1="170" x2="234" y2="152"/></g>
      <path id="${id}-lid" class="draw" pathLength="100" d="M10 90 Q140 -30 270 90 Q140 210 10 90 Z" fill="none" stroke="${theme.ink}" stroke-width="9" stroke-linejoin="round"/>
      <g id="${id}-iris" opacity="0"><circle cx="140" cy="90" r="46" fill="${theme.yellow}" stroke="${theme.ink}" stroke-width="8"/><circle id="${id}-pupil" cx="140" cy="90" r="18" fill="${theme.ink}"/></g></svg>
    <div style="max-width:${port ? "88cqw" : "44cqw"};">
      <span class="kicker" id="${id}-kick" style="opacity:0;"><span class="sq" style="background:${theme.yellow};"></span>${esc(scene.kicker || ctx.S.figure).toUpperCase()}</span>
      <h1 class="h1" id="${id}-head" style="margin-top:${Z(1.4)};font-size:${port ? "7.2cqw" : "4.2cqw"};">${words(scene)}</h1>
      ${scene.subtext ? `<div class="body" id="${id}-sub" style="opacity:0;margin-top:1.3cqw;">${esc(scene.subtext)}</div>` : ""}
      ${feat.html}
    </div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.to("#${id}-lid",{strokeDashoffset:0,duration:0.9,ease:"power2.inOut"},${r(T + 0.2)});`,
    `tl.fromTo("#${id}-iris",{opacity:0,scale:0,transformOrigin:"140px 90px",svgOrigin:"140 90"},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},${r(T + 1.0)});`,
    `tl.fromTo("#${id}-rays",{opacity:0},{opacity:0.9,duration:0.4},${r(T + 1.3)});`,
    `tl.to("#${id}-pupil",{x:16,duration:0.9,ease:"sine.inOut",yoyo:true,repeat:${Math.max(1, Math.floor((ctx.L - 1.6) / 0.9))}},${r(T + 1.5)});`,
    `tl.fromTo("#${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.5)});`,
    `stamp("#${id}-head .word",${r(T + 0.8)},-3,0.07);`,
    scene.subtext ? `tl.fromTo("#${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.3)});` : "",
    ...feat.s.map((x) => x.replace("__AT__", r(T + 1.7))),
  ].filter(Boolean);
  return { html, s };
}

// PLATE — a real screenshot as a poster-framed panel: ink-bordered cream card with a
// hard offset shadow, a color block behind, and a corner sticker stamp. Stamped in.
function riotPlate(scene, ctx, asset) {
  const { id, T, theme, port } = ctx;
  const Z = (n) => z(n, port);
  const ratio = Number(asset.ratio) || (asset.width && asset.height ? asset.width / asset.height : 0);
  const shotTall = ratio && ratio < 0.9;
  // THE PICTURE TAKES THE ROOM THE TALL SHEET ACTUALLY HAS. The portrait card was sized while
  // every other element around it was still landscape-small, so it sat as an island in a page
  // with two thirds of its height unused. With the type re-set for this sheet, the card grows
  // with it and the beat reads as one poster rather than a card and a caption.
  const cardW = port ? (shotTall ? "52cqw" : "84cqw") : (shotTall ? "26cqw" : "44cqw");
  const winH = port ? (shotTall ? "70cqw" : "50cqw") : (shotTall ? "34cqw" : "24cqw");
  const tag = esc(String(scene.emphasis || ctx.S.plateTag).toLowerCase()).slice(0, 18);
  const feat = featList(id, scene, theme);
  const bobP = Math.max(1, Math.floor((ctx.L - 1.6) / 1.6));
  const html = `${open(id, ctx)}<div class="safe" style="${port ? "flex-direction:column;gap:4cqw;text-align:center;align-items:center;" : "flex-direction:row;gap:5cqw;text-align:left;align-items:center;"}">
    <div class="riot-plate" id="${id}-pw" style="opacity:0;position:relative;width:${cardW};flex:0 0 auto;">
      <div style="position:absolute;left:${Z(1.4)};top:${Z(1.4)};width:100%;height:100%;background:${theme.yellow};border:${Z(0.22)} solid ${theme.ink};"></div>
      <div class="riot-frame" style="position:relative;">
        <div class="riot-win" style="height:${winH};"><img src="${esc(asset.path)}" alt="${esc(asset.alt || ctx.S.plateAlt)}"></div>
      </div>
      <span class="stamp" id="${id}-tag" style="position:absolute;right:${Z(-1.4)};bottom:${Z(-1.6)};background:${theme.red};color:${theme.cream};opacity:0;">${tag}</span>
    </div>
    <div style="max-width:${port ? "88cqw" : "40cqw"};">
      <span class="kicker" id="${id}-kick" style="opacity:0;"><span class="sq"></span>${esc(scene.kicker || ctx.S.plate).toUpperCase()}</span>
      <h1 class="h1" id="${id}-head" style="margin-top:${Z(1.2)};font-size:${port ? "7cqw" : "4cqw"};">${words(scene)}</h1>
      ${scene.subtext ? `<div class="body" id="${id}-sub" style="opacity:0;margin-top:${Z(1.1)};">${esc(scene.subtext)}</div>` : ""}
      ${feat.html}
    </div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.3},${T});`,
    `tl.fromTo("#${id}-pw",{opacity:0,scale:1.6,rotation:-4,transformOrigin:"center center"},{opacity:1,scale:1,rotation:0,duration:0.5,ease:"power4.in"},${r(T + 0.4)});`,
    `tl.to("#${id}-pw",{y:-9,duration:1.6,ease:"sine.inOut",yoyo:true,repeat:${bobP}},${r(T + 1.6)});`,
    `stamp("#${id}-tag",${r(T + 1.0)},8,0);`,
    `tl.fromTo("#${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.7)});`,
    `stamp("#${id}-head .word",${r(T + 0.9)},-3,0.07);`,
    scene.subtext ? `tl.fromTo("#${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.4)});` : "",
    ...feat.s.map((x) => x.replace("__AT__", r(T + 1.8))),
  ].filter(Boolean);
  return { html, s };
}

function riotCta(scene, ctx) {
  const { id, T, theme, port } = ctx;
  const Z = (n) => z(n, port);
  const mark = esc(String(scene.headline || scene.title || "KEYFRAME"));
  const cta = esc(String(scene.emphasis || ctx.S.ctaButton).slice(0, 22));
  const url = esc(String(scene.subtext || ctx.S.ctaUrl).toUpperCase()).slice(0, 44);
  // THE CLOSER HAD NO PORTRAIT SETTING EITHER, and it is the frame whose whole job is telling
  // the viewer where to go. Its two loose ornaments were pinned at landscape coordinates: the
  // asterisk at a fixed 16cqw inset and the ball at `top:31.5cqw`, which on the tall sheet is
  // the upper sixth of the page rather than beside the button it was drawn to sit beside.
  // Both are now placed as a fraction of the page, so they hold their composition on either.
  const html = `${open(id, ctx)}<div class="safe">
    <h1 class="display" id="${id}-mark" style="font-size:${Z(6)};opacity:0;">${mark}</h1>
    <div style="position:relative;margin-top:${Z(2.4)};display:inline-block;">
      <svg id="${id}-dash" width="560" height="220" viewBox="0 0 560 220" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);overflow:visible;" data-layout-allow-occlusion>
        <rect id="${id}-dashrect" x="8" y="8" width="544" height="204" rx="102" fill="none" stroke="${theme.ink}" stroke-width="4" stroke-dasharray="14 16" opacity="0"/></svg>
      <div class="btn" id="${id}-btn" style="opacity:0;">${cta} <span style="font-size:3.4cqw;">&#8594;</span></div>
    </div>
    <div class="body" id="${id}-url" style="opacity:0;margin-top:${Z(2.4)};font-family:${theme.monoStack};letter-spacing:0.2em;font-size:${Z(1.4)};">${url}</div>
  </div>
  <svg id="${id}-aster" width="140" height="140" viewBox="0 0 100 100" style="position:absolute;left:${port ? "8cqw" : "16cqw"};top:${port ? "16%" : "16cqw"};width:${Z(7.4)};height:${Z(7.4)};opacity:0;" data-layout-allow-occlusion>
    <g stroke="${theme.blue}" stroke-width="11" stroke-linecap="round"><line x1="50" y1="4" x2="50" y2="96"/><line x1="4" y1="50" x2="96" y2="50"/><line x1="17" y1="17" x2="83" y2="83"/><line x1="83" y1="17" x2="17" y2="83"/></g></svg>
  <div id="${id}-ball" style="position:absolute;left:71%;top:${port ? "70%" : "31.5cqw"};width:${Z(5.4)};height:${Z(5.4)};border-radius:50%;background:${theme.yellow};border:${Z(0.22)} solid ${theme.ink};opacity:0;"></div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `stamp("#${id}-mark",${r(T + 0.3)},-3,0);`,
    `tl.fromTo("#${id}-aster",{opacity:0,scale:0,rotation:-160,transformOrigin:"center center"},{opacity:1,scale:1,rotation:0,duration:0.6,ease:"back.out(1.8)"},${r(T + 0.6)});`,
    `tl.fromTo("#${id}-ball",{opacity:0,scale:0},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},${r(T + 0.8)});`,
    `tl.fromTo("#${id}-dashrect",{opacity:0},{opacity:1,duration:0.4},${r(T + 0.9)});`,
    `tl.to("#${id}-dashrect",{strokeDashoffset:-60,duration:${r(Math.max(1, ctx.L - 1))},ease:"none"},${r(T + 0.9)});`,
    `stamp("#${id}-btn",${r(T + 1.1)},2,0);`,
    `tl.to("#${id}-btn",{y:-8,duration:0.6,ease:"sine.inOut",yoyo:true,repeat:${Math.max(1, Math.floor((ctx.L - 1.7) / 0.6))}},${r(T + 1.7)});`,
    `tl.fromTo("#${id}-url",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.3)});`,
  ];
  return { html, s };
}

const BUILDERS = { title: riotTitle, recipe: riotRecipe, stats: riotStats, manifesto: riotManifesto, figure: riotFigure, plate: riotPlate, cta: riotCta };

// A MASTHEAD IS A LABEL, AND A LABEL IS NEVER CUT MID-WORD.
//
// This was `title.toUpperCase().slice(0, 20)`, which is a character budget applied to a
// human-readable string — so a real film shipped `DIGITIZE FAMILY RECI` in the corner of
// every one of its frames. A hard slice is right for a `data-` attribute and wrong for
// anything a viewer reads: cut on a word, and if even the first word will not fit, cut that
// one and mark it with an ellipsis so it reads as shortened rather than broken.
function mastheadLabel(title, max = 20) {
  const t = String(title || "KEYFRAME").trim().toUpperCase();
  if (t.length <= max) return t;
  const words = t.split(/\s+/);
  let out = "";
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > max) break;
    out = next;
  }
  return out || `${t.slice(0, Math.max(1, max - 1))}…`;
}

// ---- paper chrome (content-independent) --------------------------------------
function chromeHtml(theme, title, colophon) {
  return `
  <div id="bg" class="clip" data-start="0" data-duration="__D__" data-track-index="0" data-layout-allow-occlusion>
    <div class="bigshape" id="bg-cy" style="position:absolute;left:-9cqw;top:-13cqw;width:30cqw;height:30cqw;border-radius:50%;background:${theme.yellow};"></div>
    <div class="bigshape" id="bg-cb" style="position:absolute;right:-11cqw;bottom:-15cqw;width:34cqw;height:34cqw;border-radius:50%;background:${theme.blue};opacity:0.92;"></div>
    <div class="bigshape" id="bg-ring" style="position:absolute;right:5.5cqw;top:7.5cqw;width:10.5cqw;height:10.5cqw;border-radius:50%;border:0.9cqw solid ${theme.red};"></div>
    <div class="bigshape" id="bg-tri" style="position:absolute;left:8cqw;bottom:9cqw;width:11cqw;height:11cqw;"><svg viewBox="0 0 100 100" style="width:100%;height:100%;overflow:visible;"><polygon points="50 6 96 94 4 94" fill="none" stroke="${theme.ink}" stroke-width="7"/></svg></div>
    <div id="dots"></div>
  </div>
  <div id="chrome" class="clip" data-start="0" data-duration="__D__" data-track-index="19" data-layout-allow-occlusion style="opacity:0;">
    <div id="frame"></div>
    <div id="masthead"><span class="sq"></span>${esc(mastheadLabel(title))}</div>
    <div id="sheetno">01 / 01</div>
    ${colophon ? `<div id="footline">${esc(colophon)}</div>` : ""}
  </div>
  <div id="caps" class="clip" data-start="0" data-duration="__D__" data-track-index="20"><div id="cap-pill"><div id="cap-text"></div></div></div>`;
}

function styleBlock(theme, port) {
  const Z = (n) => z(n, port);
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#111; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.paper}; container-type:size; color:${theme.ink}; font-family:${theme.bodyStack};
    --paper:${theme.paper}; --cream:${theme.cream}; --ink:${theme.ink}; --red:${theme.red}; --blue:${theme.blue}; --yellow:${theme.yellow}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  /* The tall sheet gets a tighter side margin (the measure is already 44% narrower) and a
     deeper foot, which is where the platform chrome sits on a Reel — responsive.safeArea's
     portrait bottom inset, expressed in this pack's own units. */
  .safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${port ? "10% 6% 13%" : "9% 7% 11%"}; text-align:center; }
  .display { font-family:${theme.displayStack}; font-weight:400; font-size:${Z(8)}; line-height:0.94; letter-spacing:-0.015em; color:${theme.ink}; text-transform:uppercase; }
  .h1 { font-family:${theme.displayStack}; font-size:${Z(4.6)}; line-height:1.02; color:${theme.ink}; text-transform:uppercase; letter-spacing:-0.01em; }
  .body { font-family:${theme.bodyStack}; font-weight:600; font-size:${Z(1.9)}; line-height:1.45; color:${theme.body}; }
  .word { display:inline-block; will-change:transform,opacity; }
  .shadow-red { text-shadow:0.5cqw 0.5cqw 0 ${theme.red}; }
  .shadow-blue { text-shadow:0.5cqw 0.5cqw 0 ${theme.blue}; }
  .kicker { display:inline-flex; align-items:center; gap:${Z(0.9)}; font-family:${theme.monoStack}; font-weight:700; font-size:${Z(1.2)}; letter-spacing:0.34em; text-transform:uppercase; color:${theme.ink}; border:${Z(0.18)} solid ${theme.ink}; background:${theme.cream}; padding:${Z(0.6)} ${Z(1.6)}; }
  .kicker .sq { width:${Z(0.8)}; height:${Z(0.8)}; background:${theme.red}; }
  #dots { position:absolute; inset:0; pointer-events:none; opacity:0.55; background-image:radial-gradient(rgba(23,22,27,0.13) 1.6px, transparent 1.6px); background-size:${Z(2.3)} ${Z(2.3)}; }
  .bigshape { pointer-events:none; }
  /* The keyline, masthead and folio are the SHEET's furniture, so they ride the sheet's own
     scale. Their vertical positions stay in cqw rather than percent on purpose: a masthead
     belongs a fixed distance from the paper's edge, not a fixed fraction down a page whose
     height changed. */
  #frame { position:absolute; inset:${Z(1.5)}; border:${Z(0.2)} solid ${theme.ink}; pointer-events:none; }
  #masthead { position:absolute; left:${Z(3)}; top:${Z(2.85)}; display:flex; align-items:center; gap:${Z(0.9)}; font-family:${theme.monoStack}; font-weight:700; font-size:${Z(1.15)}; letter-spacing:0.3em; color:${theme.ink}; background:${theme.cream}; border:${Z(0.18)} solid ${theme.ink}; padding:${Z(0.45)} ${Z(1.2)}; }
  #masthead .sq { width:${Z(1.1)}; height:${Z(1.1)}; background:${theme.red}; }
  #sheetno { position:absolute; right:${Z(3)}; top:${Z(2.85)}; font-family:${theme.monoStack}; font-weight:700; font-size:${Z(1.15)}; letter-spacing:0.26em; color:${theme.ink}; border:${Z(0.18)} solid ${theme.ink}; background:${theme.cream}; padding:${Z(0.45)} ${Z(1.2)}; }
  #footline { position:absolute; left:0; right:0; bottom:${Z(2.6)}; text-align:center; font-family:${theme.monoStack}; font-weight:700; font-size:${Z(1)}; letter-spacing:0.4em; color:#6B6860; text-transform:uppercase; }
  .bar { position:absolute; top:0; bottom:0; width:34.5%; transform-origin:top center; }
  .recipe-item { display:flex; flex-direction:column; align-items:center; gap:${Z(1.4)}; width:${Z(15)}; }
  .recipe-label { font-family:${theme.displayStack}; font-size:${Z(1.9)}; letter-spacing:0.06em; color:${theme.ink}; text-transform:uppercase; }
  .stamp { display:inline-block; font-family:${theme.monoStack}; font-weight:700; font-size:${Z(1.6)}; letter-spacing:0.08em; padding:${Z(1.1)} ${Z(2)}; border:${Z(0.22)} solid ${theme.ink}; box-shadow:${Z(0.45)} ${Z(0.45)} 0 ${theme.ink}; text-transform:uppercase; white-space:nowrap; will-change:transform; }
  /* The strike sits OUTSIDE the line on the wide sheet. On the tall one the measure runs to
     the margin, so an X hung 7cqw to the right of it lands off the page — it moves onto the
     line's own end instead. */
  .xmark { position:absolute; width:${Z(5.4)}; height:${Z(5.4)}; right:${port ? z(-2.6, port) : "-7cqw"}; top:50%; margin-top:${z(-2.7, port)}; }
  .hilite { position:absolute; left:-3%; top:8%; width:106%; height:88%; z-index:-1; transform:scaleX(0); transform-origin:left center; }
  .btn { display:inline-flex; align-items:center; gap:${Z(1.2)}; font-family:${theme.displayStack}; font-size:${Z(3.2)}; text-transform:uppercase; letter-spacing:0.02em; color:${theme.cream}; background:${theme.red}; border:${Z(0.24)} solid ${theme.ink}; box-shadow:${Z(0.7)} ${Z(0.7)} 0 ${theme.ink}; padding:${Z(1.7)} ${Z(4)}; will-change:transform; }
  .draw { stroke-dasharray:100; stroke-dashoffset:100; }
  .riot-frame { background:${theme.cream}; border:${Z(0.24)} solid ${theme.ink}; box-shadow:${Z(0.6)} ${Z(0.6)} 0 ${theme.ink}; padding:${Z(1)}; }
  .riot-win { position:relative; width:100%; overflow:hidden; background:#FFFFFF; border:${Z(0.12)} solid ${theme.ink}; }
  .riot-win img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; display:block; }
  .riot-feat { list-style:none; margin-top:${Z(1.4)}; display:flex; flex-direction:column; gap:${Z(0.85)}; }
  .riot-feat li { display:flex; align-items:center; gap:${Z(1)}; font-family:${theme.bodyStack}; font-weight:700; font-size:${Z(1.5)}; line-height:1.3; color:${theme.ink}; }
  .riot-sq { width:${Z(1.2)}; height:${Z(1.2)}; flex:0 0 auto; border:${Z(0.14)} solid ${theme.ink}; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:5.6%; z-index:50; pointer-events:none; }
  #cap-pill { max-width:${port ? "86%" : "74%"}; height:fit-content; flex:0 0 auto; text-align:center; padding:${Z(0.9)} ${Z(2.4)}; opacity:0; background:${theme.ink}; border:${Z(0.18)} solid ${theme.ink}; box-shadow:${Z(0.4)} ${Z(0.4)} 0 rgba(23,22,27,0.25); }
  #cap-text { font-family:${theme.bodyStack}; font-weight:700; font-size:${Z(1.5)}; line-height:1.3; color:${theme.cream}; }`;
}

// ---- MAIN --------------------------------------------------------------------
// BRAND: TRIAD ROTATION (was a formal opt-out). The red / blue / yellow primaries are what
// read as "Bauhaus", but the load-bearing identity is the THREE-FIELD STRUCTURE + the VALUE
// LADDER (yellow bright / red mid / blue dark) + the ink hard-offset shadow + flat fills +
// snap motion + Archivo Black — NOT those specific hues. So under a brand skin the three
// primaries rotate TOGETHER by one shared delta onto the brand hue family (riotTheme), each
// pinned to its OWN authored relative luminance: the ladder and triad spacing survive, only
// the hue family becomes the brand's. It is ALL-OR-NOTHING (a partial rotation would not be
// Bauhaus) and FAIL-OPEN (any resolver miss keeps the classic primaries). NO background wash
// / gradient / glow is added — flat fills are identity here (unlike the other packs), so the
// rotation alone carries the brand. A null skin renders the exact classic poster byte-for-
// byte; resolvedBrand echoes the rotation (or null) so graph.persistWornBrand discloses what
// the poster actually wears.
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null, seedKey = null } = {}) {
  const theme = riotTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1920, H = (dims && dims.height) || 1080;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length ? sb.scenes.slice(0, 12) : [{ id: "s1", start: 0, duration: 4, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);

  const images = (Array.isArray(assets) ? assets : []).filter(plateOk).sort(admission.byDisplayRank);
  const byScene = new Map();
  const pool = [];
  for (const a of images) { const sid = a.sceneId != null ? String(a.sceneId) : null; if (sid && !byScene.has(sid)) byScene.set(sid, a); else pool.push(a); }
  let pooli = 0;

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [], sceneScripts = [], sceneStarts = [];
  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 4);
    let arch = riotArchetype(scene, i, scenes.length);
    let asset = null;
    const sid = scene.id != null ? String(scene.id) : `s${i + 1}`;
    const ends = arch === "title" || arch === "cta";
    if (!ends && byScene.has(sid)) { arch = "plate"; asset = byScene.get(sid); }
    else if (arch === "figure" && pooli < pool.length) { arch = "plate"; asset = pool[pooli++]; }
    const ctx = { id: `s${i + 1}`, T, L, E: r(T + L), i, isLast: i === scenes.length - 1, track: 2 + i, dims: { width: W, height: H }, port: H > W, theme, S };
    const built = (BUILDERS[arch] || riotFigure)(scene, ctx, asset);
    bodyParts.push(built.html);
    sceneStarts.push(T);
    sceneScripts.push(built.s.join("\n"));
    if (!ctx.isLast) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  // THE COLOPHON IS THE FILM'S, NOT THE PACK'S.
  //
  // The footer line was hard-coded `An AI motion press · est. one sentence ago` — the
  // TEMPLATE's own advertising copy, baked into every frame of every film any customer makes
  // with this pack, in a slot a viewer reads as the publisher's mark. It is also the one
  // string here that never passed through the Localization Director, so a Japanese film
  // carried an English tagline along its bottom edge.
  //
  // A colophon should say something true about THIS film: its own web address when the job
  // has one, otherwise its title. When neither exists the line is omitted entirely — an empty
  // strip of paper is correct, and a slogan for the tool that made it is not.
  // Per-scene ornament dressing, seeded per job so two films on this pack differ and one film
  // is reproducible. Ranges are deliberately modest: these are corner furniture on a print
  // poster, and a shape that leaps across the sheet reads as a mistake rather than a re-dress.
  const dressSeed = (() => {
    let h = 2166136261;
    for (const ch of String(seedKey || sb.title || "riot")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  })();
  const sceneDress = scenes.map(() => {
    const pick = (lo, hi) => Math.round((lo + dressSeed() * (hi - lo)) * 10) / 10;
    return {
      cy:   [pick(-28, 18), pick(-22, 14)],
      cb:   [pick(-16, 26), pick(-14, 20)],
      ring: [pick(-34, 22), pick(-26, 40)],
      tri:  [pick(-20, 46), pick(-30, 16)],
    };
  });

  const colophon = (() => {
    const addr = assets && assets.length
      ? (assets.map((a) => a && a.sourceUrl).filter(Boolean)
          .map((u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return null; } })
          .find(Boolean) || null)
      : null;
    if (addr) return addr.toUpperCase();
    const t = String(sb.title || "").trim();
    return t ? t.toUpperCase().slice(0, 46) : "";
  })();
  const chrome = chromeHtml(theme, sb.title, colophon).replace(/__D__/g, String(D));

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  function reps(t,c){return Math.max(0,Math.floor(t/c)-1);}
  function kill(id,t){tl.set(id,{opacity:0},t);}
  function pad2(n){return String(Math.round(n)).padStart(2,"0");}
  function count(sel,to,at,dur,pre){var o={v:0};tl.to(o,{v:to,duration:dur,ease:"power2.out",snap:{v:1},onUpdate:function(){var e=$(sel);if(e)e.textContent=(pre||"")+Math.round(o.v);}},at);}
  function stamp(sel,at,rot,stg){tl.fromTo(sel,{opacity:0,scale:1.9,rotation:rot},{opacity:1,scale:1,rotation:0,duration:0.42,ease:"power4.in",stagger:(stg||0)},at);}

  tl.to("#bg-cy",{scale:1.07,duration:9,ease:"sine.inOut",yoyo:true,repeat:reps(D,9)},0);
  tl.to("#bg-cb",{scale:1.06,duration:11,ease:"sine.inOut",yoyo:true,repeat:reps(D,11)},0);
  // 0.94cqw IS 18px ON THE AUTHORED SHEET. This was a bare \`+=18\` — the unit-less length
  // KNOWN_DEBT entry in test-tween-units. A bare number is device pixels, so the ring's drift
  // was the only motion in this file that did not scale with the frame: identical travel at
  // 720p and 1080p, and on the tall sheet it drifted against a page of a different size. The
  // amplitude is restated as the same distance it already had at 1920 wide, so the landscape
  // render moves exactly as before and only the portrait one is corrected.
  tl.to("#bg-ring",{rotation:180,y:"+=${z(0.94, H > W)}",duration:15,ease:"sine.inOut",yoyo:true,repeat:reps(D,15)},0);
  tl.to("#bg-tri",{rotation:-14,duration:8,ease:"sine.inOut",yoyo:true,repeat:reps(D,8),transformOrigin:"center center"},0);

  // THE SET IS RE-DRESSED BETWEEN SCENES.
  //
  // The four corner ornaments are declared once at fixed insets and then only ever breathe on
  // long ambient yoyos — 9 to 15 seconds for a few percent of travel. Over a 4-second beat
  // that is invisible, so every scene of the film shows the same yellow quarter-disc top-left,
  // the same red ring top-right, the same triangle bottom-left and the same blue disc
  // bottom-right. A QA reviewer comparing five frames of a real film reported exactly that:
  // "Groundhog set pattern detected across scenes at 2.1s, 5.9s, 10.2s, 19.5s and 23.9s,
  // using identical corner ornaments and background layout."
  //
  // Each scene now gets its own seeded offset, scale and rotation for the four shapes, moved
  // ON the cut so the change is read as a page turn rather than as drift. Expressed as
  // transforms that COMPOSE with the ambient tweens above (those animate scale/rotation, these
  // set xPercent/yPercent and a scale multiplier via a separate wrapper property) — and never
  // as left/top, which the motion-safety guard forbids animating.
  var dress=${JSON.stringify(sceneDress)};
  function dressAt(i,at){
    var d=dress[i]; if(!d) return;
    tl.set("#bg-cy",{xPercent:d.cy[0],yPercent:d.cy[1]},at);
    tl.set("#bg-cb",{xPercent:d.cb[0],yPercent:d.cb[1]},at);
    tl.set("#bg-ring",{xPercent:d.ring[0],yPercent:d.ring[1]},at);
    tl.set("#bg-tri",{xPercent:d.tri[0],yPercent:d.tri[1]},at);
  }
  dressAt(0,0);
  for(var di=1;di<dress.length;di++) dressAt(di,${JSON.stringify(sceneStarts)}[di]);
  tl.fromTo("#dots",{backgroundPosition:"0cqw 0cqw"},{backgroundPosition:"2.3cqw 2.3cqw",duration:14,ease:"none",repeat:reps(D,14)},0);
  tl.fromTo("#chrome",{opacity:0},{opacity:1,duration:0.5},0.7);
  tl.fromTo("#masthead",{x:-26,opacity:0},{x:0,opacity:1,duration:0.5,ease:"power2.out"},0.9);
  tl.fromTo("#sheetno",{x:26,opacity:0},{x:0,opacity:1,duration:0.5,ease:"power2.out"},0.95);

  ${sceneScripts.join("\n  ")}

  var cues=${JSON.stringify(cues)};
  var starts=${JSON.stringify(sceneStarts)};
  tl.to({},{duration:D,ease:"none",onUpdate:function(){
    var now=tl.time();var cap=$("#cap-pill"),txt=$("#cap-text");
    if(cap&&txt){var a=null;for(var k=0;k<cues.length;k++){if(now>=cues[k][0]&&now<cues[k][1]){a=cues[k];break;}}if(a){if(txt.textContent!==a[2])txt.textContent=a[2];cap.style.opacity="1";}else cap.style.opacity="0";}
    var sn=$("#sheetno");if(sn){var idx=0;for(var j=0;j<starts.length;j++){if(now>=starts[j])idx=j;}var lab=pad2(idx+1)+" / "+pad2(starts.length);if(sn.textContent!==lab)sn.textContent=lab;}
  }},0);

  window.__timelines=window.__timelines||{};
  window.__timelines["vid"]=tl;
  if(typeof navigator==="undefined"||!navigator.webdriver){tl.play(0);tl.eventCallback("onComplete",function(){tl.restart();});}
})();`;

  const indexHtml = [
    `<!DOCTYPE html>`, `<html lang="en">`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="${GSAP_CDN}"></script>`,
    `<style>`, styleBlock(theme, H > W), `</style>`, `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
    chrome, bodyParts.join("\n"), `</div>`,
    `<script>`, script, `</script>`, `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  // resolvedBrand echoes the triad rotation (or null when no brand applied / the luminance
  // pin could not be met), so graph.persistWornBrand discloses exactly what the poster wears.
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
