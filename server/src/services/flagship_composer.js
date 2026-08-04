// FLAGSHIP COMPOSER v3 — a world-class, BRIGHT product-showcase launch film.
//
// Register: Apple keynote / Linear / Stripe / Vercel / Framer / Raycast — but AIRY
// and LUMINOUS, not dark. A native Three.js scene built around the PRODUCT: big
// bright "floating dashboard" panels holding real screenshots (or a generated bright
// UI when none exists), lifted off a white stage by soft real shadows, framed by a
// pastel mesh-gradient environment, PURPOSEFUL data-graphics (traveling gradient
// data-waves + a rising growth graph-line that reinforce the product story — never
// decoration), and a CINEMATIC CAMERA RIG that dollies / focus-pulls / orbits /
// pulls back so the eye is always led. Crisp, high-contrast DOM typography ABOVE the
// canvas (ink #0F172A on white) with kinetic reveals, a saturated gradient emphasis,
// supporting stat chips and connectors.
//
// WHY BRIGHT, NO BLOOM: on a white stage you cannot "add light to white", so the v2
// selective UnrealBloom pipeline is gone. Glow/lift come from soft radial shadow +
// orb sprites, matte gradient shaders, and real material shading — a single
// renderer.render(scene,cam) per frame (also ~2x faster than the bloom pipeline).
//
// SCREENSHOTS ARE THE HERO: panels occupy ~40-60% of frame, tilt in perspective, and
// layer (a hero panel + a small floating accent card) for depth. When no real
// screenshot exists the panel renders a convincing BRIGHT product UI (dashboard /
// analytics / table) so a flagship film always presents a product.
//
// Same envelope as scene_kit (buildComposition -> {indexHtml, metaJson}); the whole
// animation is driven off the single paused GSAP timeline HyperFrames seeks
// (window.__timelines["vid"]) via tl.to({onUpdate:()=>render3d(tl.time())}).
//
// DETERMINISM: seeded PRNG (mulberry32) resolved once; every per-frame value is a
// pure function of tl.time() (no Math.random / Date at runtime); shader uniforms are
// pure fns of time. Build-time values inject via ${...} ONLY (never "+var+", which
// would ship a literal to the browser and blank the render). Text is crisp DOM above
// the canvas. Passes `hyperframes lint` with 0 errors.

const { deriveTheme } = require("./scene_kit");
const { varyArchetypes } = require("./motion_planner");
const { resolveBrand, atmosphericGround } = require("./brand_kit");
const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { aspectMode, typeScale, safeArea, headlineCh } = require("./responsive");
const { buildCaptionOverlay } = require("./caption_overlay");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
const THREE_VER = "0.160.0";
const SAFE_FONTS = "Inter, 'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r2 = (n) => Math.round(n * 1000) / 1000;
const hexInt = (c) => { const m = /^#?([0-9a-fA-F]{6})$/.exec(String(c || "").trim()); return m ? parseInt(m[1], 16) : 0x6366F1; };
const hexToRgb = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
const relLum = (h) => { const [r, g, b] = hexToRgb(h).map((v) => v / 255); const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const toHex2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
const lighten = (h, amt) => { const [r, g, b] = hexToRgb(h); const mix = (c) => c + (255 - c) * amt; return `#${toHex2(mix(r))}${toHex2(mix(g))}${toHex2(mix(b))}`; };
const darken = (h, amt) => { const [r, g, b] = hexToRgb(h); const mix = (c) => c * (1 - amt); return `#${toHex2(mix(r))}${toHex2(mix(g))}${toHex2(mix(b))}`; };
// Darken a color until it clears a legibility ceiling on the WHITE ground (so accent
// TEXT reads). Graphics keep the raw accent; only type is darkened.
const ensureReadableOnLight = (h, max = 0.42) => { let c = h; for (let i = 0; i < 10 && relLum(c) > max; i++) c = darken(c, 0.16); return c; };
// Lighten a color toward white until it clears a legibility floor on the DARK stage.
const ensureBright = (h, min = 0.5) => { let c = h; for (let i = 0; i < 9 && relLum(c) < min; i++) c = lighten(c, 0.22); return c; };
function hashSeed(s) { let h = 2166136261; const str = String(s || ""); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// HSL, local for the same reason relLum above is: brand_kit keeps its pair private and
// exports only the decisions it wants made in one place. Hue in DEGREES.
const rgbToHsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
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

// Rotate a color onto a new HUE while PINNING its relative luminance to the authored
// value. relLum climbs monotonically with HSL's L at a fixed hue/saturation, so a
// bisection lands back on the source's luminance to within 8-bit quantization. That is
// the whole safety argument for hue-swapping the product panels: every contrast the
// pack authored INSIDE the card — a bar against the white plate, the white "Live" label
// on its chip, a KPI delta beside its tile — comes out at the ratio it went in at, so
// nothing that made the plate readable can move.
//
// Saturation stays the SLOT'S, not the brand's: only hue is being borrowed, and the
// pack tuned these tones for a white card the brand has never seen. An ACHROMATIC accent
// is returned untouched — it has no hue to give away, and pushing chroma into it would
// be a chroma decision wearing a hue decision's clothes.
const LUM_PIN = 0.004;   // ~one 8-bit step through the midtones: the quantization floor, not a slack budget
function reHue(hex, hue) {
  const [, s, l] = rgbToHsl(hexToRgb(hex));
  if (s < 0.02) return hex;
  const target = relLum(hex);
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (relLum(hslHex(hue, s, mid)) < target) lo = mid; else hi = mid; }
  const out = hslHex(hue, s, (lo + hi) / 2);
  return Math.abs(relLum(out) - target) <= LUM_PIN ? out : hex;   // fail-open: a stock bar beats a wrong one
}

// The brand's OWN colors, resolved. resolveBrand (brand_kit:277) lays its accents out
// brand-first then pack, so the brand-led run ends at the first entry the pack already
// owned. Everything downstream that says "the brand" means THIS list and not
// `brand.accents`, which is the film's whole accent family and mostly the pack's.
function brandLedOf(brand, packAccents) {
  const pack = new Set(packAccents.map((a) => String(a).toLowerCase()));
  const out = [];
  for (const a of brand.accents) { if (pack.has(String(a).toLowerCase())) break; out.push(a); }
  return out;
}

// The hues the product panels may wear. The brand's own colors lead, in the order the
// brand gave them; a chart with more series than the brand has colors FANS the rest off
// the lead hue instead of reaching back for a stock accent — a violet bar beside an
// orange one is exactly the off-brand reading this exists to kill. The fan stays inside
// the 40° that brand_kit:131 calls "still reads as its own hue", so an extra series is a
// sibling of the brand and never a second brand.
//
// Series stay tellable apart on LUMINANCE, which is why this can afford so narrow a fan:
// the pack authored four distinct brightnesses and reHue keeps every one of them, so two
// bars 20° apart still differ by the contrast step the pack designed between them.
const HUE_FAN = [20, -20, 40, -40];
function panelAccents(packAccents, led) {
  if (!led.length) return packAccents;   // no brand → the pack's own strings, untouched
  const wheel = led.map(hueOf);
  for (const d of HUE_FAN) { if (wheel.length >= packAccents.length) break; wheel.push(wheel[0] + d); }
  return packAccents.map((c, i) => reHue(c, wheel[i % wheel.length]));
}

// DARK cinematic theme. A deep near-black indigo STAGE with bright product panels that
// pop against it — the counterpoint to `brightlife`'s airy white. deriveTheme resolves
// the pack accents + Space Grotesk display face; the stage is authored dark.
//
// The BRAND SKIN (Art Director) reaches the film here and ONLY through the accent
// family — the deep stage, the ink, the display face, the camera rig and the panel
// layout are what makes this pack the flagship, and no palette gets a vote on them.
function flagshipTheme(framePack, sb, brandSkin) {
  const base = deriveTheme(framePack, sb);
  // The skin is deliberately NOT handed to deriveTheme, which would resolve it against
  // the PACK's ground. Every accent in this film lands on the stage authored two lines
  // below, not on that ground, so the stage is what a brand color has to be legible
  // against — and resolveBrand is the only thing here that knows it.
  const STAGE = "#0A0B16";
  const packAccents = (base.accents && base.accents.length ? base.accents : ["#7C8CFF", "#4ED7FF", "#B16CFF", "#57F2C2"]).slice(0, 4);
  // ATMOSPHERE (D2): pass the pack's brand CONTRACT so a mode:"atmosphere" pack lets a brand
  // rotate the stage HUE toward it while PINNING luminance — same near-black stage, tinted.
  // Accents still resolve against the authored STAGE (the tint is subtle, so their contrast
  // is unchanged). No contract / accents-mode → brand.atmosphere is null → byte-identical stage.
  const contract = (() => { try { const m = require("./frame_manifest").getManifest(framePack); return m && m.brand; } catch { return null; } })();
  const brand = resolveBrand(brandSkin, { ground: STAGE, isDark: true, packAccents, contract });
  const stage = atmosphericGround(STAGE, brand.atmosphere);
  const brandLed = brandLedOf(brand, packAccents);
  const accents = brand.accents.slice(0, 4);
  const MONO = "JetBrains Mono";
  const monoFace = isBundled(MONO) ? fontFaceCss(MONO) : "";
  const monoStack = monoFace ? `'${MONO}', ui-monospace, monospace` : "ui-monospace, 'JetBrains Mono', monospace";
  // Emphasis gradient: a BRIGHT cyan-forward gloss (near-white → bright brand accent)
  // so a gradient-fill headline word GLOWS on the deep stage and never goes muddy.
  //
  // The emphasis word / hero number / kicker lead with emphasis[0] — the resolver's
  // ARRIVAL-ranked winner, the brand color that reads STRONGEST on this stage. It has
  // already cleared the stage's contrast floor inside fit(), so it needs no rescue-
  // brightening; forcing it up to a luminance floor here only washes a color that already
  // reads (Amazon's #ff9900 → a pale peach for no reason). With no skin, brand.applied is
  // false and the historical path stands verbatim: emphasis[1] is the pack's own second
  // accent, lifted to the stage floor exactly as before — so the null render is byte-identical.
  const emphMain = brand.applied ? brand.emphasis[0] : ensureBright(brand.emphasis[1], 0.62);
  const emphHi = lighten(emphMain, 0.6);
  const kickCol = brand.applied ? brand.emphasis[0] : ensureBright(brand.emphasis[1], 0.6);
  return {
    ground: stage, ground2: atmosphericGround("#05060C", brand.atmosphere), surface: atmosphericGround("#04050A", brand.atmosphere),
    ink: "#F6F8FF", body: "#AEB6D4", dim: "#7A82A0", hair: "rgba(255,255,255,0.12)",
    accents, uiAccents: panelAccents(packAccents, brandLed),
    brand, brandLed,
    accent: accents[0], accent2: accents[1] || accents[0], accent3: accents[2] || accents[0], accent4: accents[3] || accents[1] || accents[0],
    kickCol, emphA: emphHi, emphB: emphMain,
    displayStack: base.displayStack || SAFE_FONTS,
    fontStack: SAFE_FONTS,
    monoStack,
    fontFace: (base.fontFace || "") + monoFace,
  };
}

// The 6-act narrative. Map each storyboard scene (by index + purpose/kind) to a
// treatment; off-count storyboards degrade gracefully.
function treatmentFor(scene, i, total) {
  const k = `${scene.purpose || scene.kind || ""}`.toLowerCase();
  if (i === 0 || /hook|title|intro/.test(k)) return "hook";
  if (i === total - 1 || /cta|outro|close/.test(k)) return "cta";
  if (/problem|pain|challenge|tension/.test(k)) return "problem";
  if (/solution|reveal|product|intro-product/.test(k)) return "solution";
  if (/benefit|result|metric|proof|stat|growth|outcome/.test(k)) return "benefits";
  if (/feature|how|capabilit|demo/.test(k)) return "features";
  if (i === 1) return "problem";
  if (i === total - 2) return "benefits";
  return i % 2 === 0 ? "solution" : "features";
}

function parseMetric(text) {
  const m = String(text || "").match(/([^\d]*?)(\d[\d,]*(?:\.\d+)?)\s*([%x×+kKmMbB]{0,2})/);
  if (!m) return null;
  const num = parseFloat(m[2].replace(/,/g, ""));
  if (!Number.isFinite(num)) return null;
  const decimals = (m[2].split(".")[1] || "").length;
  return { prefix: m[1].trim(), target: num, decimals, suffix: m[3] || "" };
}

function headlineSpans(headline, emphasis) {
  const words = String(headline || "").trim().split(/\s+/).filter(Boolean);
  const emph = String(emphasis || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words.map((w) => {
    const isE = emph.includes(w.toLowerCase().replace(/[.,!?:;]/g, ""));
    return `<span class="kw${isE ? " kacc" : ""}"><span class="kwi">${esc(w)}</span></span>`;
  }).join(" ");
}

// A short supporting "chip" trio derived from copy — fills the frame with designed
// secondary detail (never a lone headline in a void).
function chipsFor(scene, treatment) {
  const pool = [];
  const push = (t) => { const s = String(t || "").trim(); if (s && s.length <= 22) pool.push(s); };
  (scene.onScreenText || []).forEach(push);
  const words = String(scene.subtext || scene.headline || "").split(/[,.;]/).map((s) => s.trim()).filter((s) => s && s.length <= 22);
  words.forEach(push);
  const defaults = {
    hook: ["Realtime", "Secure", "Fast"],
    problem: ["Silos", "Delays", "Guesswork"],
    solution: ["Live metrics", "One view", "No setup"],
    features: ["Roles", "Reviews", "Sync"],
    benefits: ["Ship faster", "Fewer meetings", "Clarity"],
    cta: ["Free to start", "No card", "2-min setup"],
  };
  const out = [...new Set(pool)].slice(0, 3);
  while (out.length < 3) out.push((defaults[treatment] || defaults.solution)[out.length]);
  return out.slice(0, 3);
}

// ---- per-scene DOM overlay (crisp, above the canvas) -------------------------
function sceneOverlay(scene, i, total, ctx) {
  const { theme, dims, T, L, title, treatment } = ctx;
  const id = `s${i + 1}`;
  const W = dims.width, H = dims.height;
  const mode = aspectMode(W, H);
  const land = mode === "landscape";
  const port = !land;                         // portrait OR square → native vertical stack
  const centered = port || treatment === "hook" || treatment === "cta";
  const isHero = treatment === "hook";
  const isCta = treatment === "cta";
  const headStr = String(scene.headline || "").trim();
  const headWords = headStr.split(/\s+/).filter(Boolean);
  const wc = headWords.length || 3;
  const longestWord = headWords.reduce((m, w) => Math.max(m, w.length), 0);
  // Non-Latin (video-text) scripts render wider per char; scale the length thresholds so CJK/
  // Devanagari headlines shrink to fit instead of overflowing. `_langCharWidth` is 1 for Latin.
  const effLen = headStr.length * _langCharWidth;
  const effLongest = longestWord * _langCharWidth;
  let measure = wc <= 3 ? 1.14 : wc <= 6 ? 1.0 : 0.82;
  if (effLen > 24) measure = Math.min(measure, 0.82);
  if (effLen > 40) measure = Math.min(measure, 0.62);
  if (effLongest > 14) measure = Math.min(measure, Math.max(0.34, 15 / effLongest));
  // Type scales off the SHORT side (never the tall portrait height) so portrait no longer
  // renders ~2.7x-oversized headlines; the final px is also clamped to the canvas width.
  const sc = typeScale(W, H);
  const heroBase = land ? 150 : 100, ctaBase = land ? 124 : 90, intBase = land ? 88 : 68;
  const baseBig = (isHero ? heroBase : isCta ? ctaBase : intBase) * sc;
  const big = Math.min(Math.round(baseBig * measure), Math.round(W * (port ? 0.13 : 0.42)));
  const kicker = (treatment === "hook" ? (title || scene.emphasis) : scene.emphasis || (title || "")) || "";
  const metric = treatment === "benefits" ? parseMetric(scene.emphasis || scene.headline || scene.subtext) : null;
  const chips = chipsFor(scene, treatment);

  const safe = safeArea(W, H);
  const align = centered ? "center" : "flex-start";
  // Portrait/square: interior scenes are a TOP-anchored centered stack (headline block up
  // top; the 3D hero plate fills the mid-band below); hook/cta stay vertically centered.
  const justify = port ? ((isHero || isCta) ? "center" : "flex-start") : (centered ? "center" : "flex-end");
  const padTop = Math.round(safe.top * 100), padBot = Math.round(safe.bottom * 100), padSide = Math.round(safe.side * 100);
  const pad = port ? `${padTop}% ${padSide}% ${padBot}%` : centered ? "0 9%" : "0 7% 9%";
  const textAlign = align === "flex-start" ? "left" : "center";
  const maxw = headlineCh(W, H, centered);

  const parts = [];
  parts.push(`<div id="${id}" class="ktxt clip" data-start="${T}" data-duration="${L}" data-track-index="${20 + i}" data-layout-allow-occlusion style="opacity:0;align-items:${align};justify-content:${justify};padding:${pad};text-align:${textAlign};">`);
  // DARK scrim — anchors the type against the stage/panels so it never competes.
  const scrimAt = centered ? "50% 52%" : "26% 74%";
  parts.push(`  <div class="kscrim" style="background:radial-gradient(62% 54% at ${scrimAt}, rgba(6,7,16,0.82), rgba(6,7,16,0.42) 52%, transparent 80%);"></div>`);
  if (!centered) parts.push(`  <span id="${id}w" class="kwall" style="${align === "flex-start" ? "left:3.5%;" : "left:50%;transform:translateX(-50%);"}">${String(i + 1).padStart(2, "0")}</span>`);
  parts.push(`  <div class="kstack">`);
  if (kicker) parts.push(`    <span id="${id}k" class="kkick">${esc(kicker)}</span>`);
  if (metric) {
    parts.push(`    <div id="${id}m" class="kmetric" data-target="${metric.target}" data-dec="${metric.decimals}">${metric.prefix ? `<span class="kmpre">${esc(metric.prefix)}</span>` : ""}<span class="kmnum">0</span><span class="kmsuf">${esc(metric.suffix)}</span></div>`);
    if (scene.headline) parts.push(`    <h2 class="kmlabel">${esc(scene.headline)}</h2>`);
  } else {
    parts.push(`    <h1 id="${id}h" class="khead" style="font-size:${big}px;max-width:${maxw};">${headlineSpans(scene.headline, scene.emphasis)}</h1>`);
  }
  if (scene.subtext && !metric) parts.push(`    <p id="${id}s" class="ksub" style="font-size:${Math.round(big * 0.24)}px;">${esc(scene.subtext)}</p>`);
  if (treatment !== "hook") {
    const chipHtml = chips.map((c, ci) => `<span class="kchip" data-ci="${ci}"><i></i>${esc(c)}</span>`).join("");
    parts.push(`    <div id="${id}c" class="kchips">${chipHtml}</div>`);
  }
  parts.push(`  </div>`);
  parts.push(`</div>`);

  const s = [];
  s.push(`tl.set("#${id}",{opacity:1},${T});`);
  if (!centered) s.push(`tl.fromTo("#${id}w",{opacity:0,scale:1.16,filter:"blur(6px)"},{opacity:0.06,scale:1,filter:"blur(0px)",duration:1.0,ease:"power2.out"},${r2(T + 0.1)});`);
  if (kicker) s.push(`tl.fromTo("#${id}k",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},${r2(T + 0.18)});`);
  if (metric) {
    s.push(`tl.fromTo("#${id}m",{opacity:0,y:28,filter:"blur(10px)"},{opacity:1,y:0,filter:"blur(0px)",duration:0.7,ease:"power3.out"},${r2(T + 0.3)});`);
    s.push(`{const el=document.querySelector("#${id}m .kmnum");const o={v:0};tl.to(o,{v:${metric.target},duration:1.35,ease:"power2.out",onUpdate:()=>{el.textContent=o.v.toFixed(${metric.decimals});}},${r2(T + 0.4)});}`);
    s.push(`tl.fromTo("#${id} .kmlabel",{opacity:0,y:14},{opacity:1,y:0,duration:0.5},${r2(T + 0.85)});`);
  } else {
    const mode = i % 3;
    if (mode === 0) s.push(`tl.fromTo("#${id} .kwi",{yPercent:118},{yPercent:0,duration:0.72,stagger:0.07,ease:"power4.out"},${r2(T + 0.26)});`);
    else if (mode === 1) s.push(`tl.fromTo("#${id} .kw",{opacity:0,y:34,rotationX:-40,transformOrigin:"50% 100%"},{opacity:1,y:0,rotationX:0,duration:0.8,stagger:0.08,ease:"power3.out"},${r2(T + 0.26)});`);
    else s.push(`tl.fromTo("#${id} .kwi",{yPercent:118,filter:"blur(12px)"},{yPercent:0,filter:"blur(0px)",duration:0.78,stagger:0.06,ease:"power4.out"},${r2(T + 0.26)});`);
  }
  if (scene.subtext && !metric) s.push(`tl.fromTo("#${id}s",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},${r2(T + 0.9)});`);
  if (treatment !== "hook") s.push(`tl.fromTo("#${id}c .kchip",{opacity:0,y:14,scale:0.94},{opacity:1,y:0,scale:1,duration:0.44,stagger:0.09,ease:"back.out(1.7)"},${r2(T + (metric ? 1.05 : 1.0))});`);
  if (treatment !== "cta") {
    s.push(`tl.to("#${id}",{opacity:0,duration:0.42,ease:"power2.in"},${r2(T + L - 0.42)});`);
    s.push(`tl.set("#${id}",{opacity:0},${r2(T + L)});`);
  }
  return { html: parts.join("\n"), script: s.join("\n") };
}

// ---- the Three.js module (deterministic; bright stage + camera rig + panels) -
function threeModule({ theme, dims, D, seed, sceneWindows, plates }) {
  const W = dims.width, H = dims.height;
  const A = theme.accents.map(hexInt);
  const ground = hexInt(theme.ground);
  const gRgb = hexToRgb(theme.ground).map((v) => (v / 255).toFixed(4));
  const aRgb = theme.accents.slice(0, 3).map((h) => hexToRgb(h).map((v) => (v / 255).toFixed(4)));
  // Bright accents for the glowing data-waves; edge = darker ground (deep vignette).
  const wcol = theme.accents.map((h) => hexToRgb(h).map((v) => (v / 255).toFixed(4)));
  const edgeRgb = hexToRgb(darken(theme.ground, 0.55)).map((v) => (v / 255).toFixed(4));
  // The ONE crisp growth graph-line — a BRIGHT accent that glows on the dark stage.
  const lineHex = hexInt(ensureBright(theme.accent, 0.6));
  // The PRODUCT PANELS stay BRIGHT (white UI pops on the dark stage) — a fixed light
  // palette, decoupled from the dark theme, for frameTex + uiContent.
  //
  // BRIGHTNESS is locked; HUE is not. Every luminance here is authored against a white
  // card and never resolved against the stage, because the film's other accents are
  // lifted to clear #0A0B16 and a color tuned to clear near-black is precisely the color
  // that vanishes on a white dashboard — so a screenshot plate would stop reading at full
  // contrast, which is the whole job of these plates. None of that argument is about hue.
  // uiAccents therefore wears the BRAND's hues at exactly these authored luminances
  // (reHue pins them), so the contrast case is untouched and the DATA — chart bars, the
  // live chip, KPI deltas, donut segments — is the brand's, which is what it is for.
  //
  // The CHROME stays fixed: card white, sidebar, hairlines and the muted label inks below
  // are furniture, and so are frameTex's traffic lights — a macOS window affordance whose
  // red/amber/green mean what they mean off-screen, exactly like terminal's green=ON-TIME.
  const uiPalette = { ground: "#FFFFFF", ground2: "#F8FAFC", surface: "#F1F5F9", ink: "#0F172A", body: "#475569", dim: "#64748B", hair: "#E2E8F0", accents: theme.uiAccents };
  return `
import * as THREE from 'three';

const W=${W},H=${H},D=${D};
const A=[${A.map((c) => "0x" + c.toString(16)).join(",")}];
const PLATES=${JSON.stringify(plates)};
const UIP=${JSON.stringify(uiPalette)};
const LINE=0x${lineHex.toString(16)};
let __s=${seed}>>>0; function rand(){__s|=0;__s=(__s+0x6D2B79F5)|0;let t=Math.imul(__s^(__s>>>15),1|__s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;}
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const expoOut=(x)=>x>=1?1:1-Math.pow(2,-10*x);
const lerp=(a,b,t)=>a+(b-a)*t;
function land(){return W>H;}            // STRICT — square (W===H) is NOT landscape
const SQUARE=Math.abs(W-H)<W*0.1;
const PORT=!land();                       // portrait OR square → narrow frame
const WSCALE=land()?1:(SQUARE?0.74:0.56); // shrink world plate width for the narrow hFOV
const FOV=land()?42:(SQUARE?50:60);       // widen vertical FOV so content fits the narrow frame

const cv=document.getElementById("kfcanvas");
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
renderer.setSize(W,H,false); renderer.setClearColor(${ground},1);
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
if("outputColorSpace" in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();
// A whisper of white fog for aerial depth (never darkens — fades distant geo toward the stage).
scene.fog=new THREE.Fog(${ground},34,88);
const cam=new THREE.PerspectiveCamera(FOV,W/H,0.1,180);

// ---- lighting (bright, soft) ----
scene.add(new THREE.AmbientLight(0xffffff,0.92));
const key=new THREE.DirectionalLight(0xffffff,0.9); key.position.set(4,7,9); scene.add(key);
const fill=new THREE.DirectionalLight(0xdfe6ff,0.5); fill.position.set(-6,2,4); scene.add(fill);

// ================= BACKGROUND: bright pastel MESH-GRADIENT environment =========
const AUR_FRAG=\`
uniform float uTime; varying vec2 vUv;
// PER-SCENE STAGE DRESSING. The wash used to be three accent blobs at FIXED weights and
// FIXED positions, drifting only with uTime — so every scene of the film sat on the
// identical backdrop, which is what a QA review called out as "multiple scenes share the
// identical purple wave background". These three uniforms let the render loop re-dress
// the set per scene WITHOUT leaving the pack's palette: uMix re-weights which accent
// leads, uOff slides the whole wash so the composition differs, uVig opens or closes the
// vignette. Colours themselves are never invented — only their emphasis and placement.
uniform vec3 uMix; uniform vec2 uOff; uniform float uVig;
// TRIED AND REMOVED: a per-scene ground tint (mixing G a few percent toward an accent).
// The theory was sound — weights and offsets only change the wash where the blobs land,
// so tinting the ground would move every pixel — but measured against a controlled A/B
// render it moved the adjacent-scene difference by 0.1 (min 16.4 → 16.5, mean 47.6 →
// 46.7), i.e. nothing: the blobs and vignette overwrite the ground where it would have
// shown. Not worth a uniform and a shader branch. Recorded so it isn't re-attempted.
const vec3 G=vec3(${gRgb.join(",")});
const vec3 CA=vec3(${aRgb[0].join(",")});
const vec3 CB=vec3(${(aRgb[1] || aRgb[0]).join(",")});
const vec3 CC=vec3(${(aRgb[2] || aRgb[0]).join(",")});
const vec3 EDGE=vec3(${edgeRgb.join(",")});
float blob(vec2 uv,vec2 c,float r){return smoothstep(r,0.0,distance(uv,c));}
void main(){
  vec2 uv=vUv+uOff;
  vec2 pA=vec2(0.24+sin(uTime*0.13)*0.12,0.70+cos(uTime*0.11)*0.10);
  vec2 pB=vec2(0.78+cos(uTime*0.10)*0.12,0.30+sin(uTime*0.15)*0.11);
  vec2 pC=vec2(0.54+sin(uTime*0.08+2.0)*0.16,0.52+cos(uTime*0.12+1.0)*0.12);
  vec3 col=G;
  col=mix(col,CA,blob(uv,pA,0.55)*0.5*uMix.x);
  col=mix(col,CC,blob(uv,pC,0.62)*0.34*uMix.y);
  col=mix(col,CB,blob(uv,pB,0.50)*0.46*uMix.z);
  // deepen toward the edges for a cinematic vignette (depth is per-scene).
  float d=distance(uv,vec2(0.5,0.44));
  col=mix(col,EDGE,smoothstep(0.28,1.05,d)*uVig);
  gl_FragColor=vec4(col,1.0);
}\`;
const AUR_VERT="varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}";
const aurMat=new THREE.ShaderMaterial({vertexShader:AUR_VERT,fragmentShader:AUR_FRAG,uniforms:{uTime:{value:0},uMix:{value:new THREE.Vector3(1,1,1)},uOff:{value:new THREE.Vector2(0,0)},uVig:{value:0.9}},depthWrite:false,fog:false});
const aurora=new THREE.Mesh(new THREE.PlaneGeometry(230,140),aurMat); aurora.position.z=-40; scene.add(aurora);

// perspective grid floor — faint accent lines for tech depth on the dark stage
const grid=new THREE.GridHelper(120,60,A[0],0x141a33);
grid.material.transparent=true; grid.material.opacity=0.28; grid.material.depthWrite=false;
grid.position.set(0,-6.6,-8); scene.add(grid);

// ================= DATA-WAVES (supporting motion) ============================
// 3 stacked pastel gradient ribbons, upper-back — traveling sum-of-sines. They read
// as flowing product data behind the panels (Layer 3, always moving).
const WAVE_VS=\`uniform float uTime; varying vec2 vUv; varying float vY;
void main(){ vUv=uv; vec3 p=position;
  float w=sin(p.x*0.5+uTime*0.9)*0.5+sin(p.x*0.23-uTime*0.6)*0.34+sin(p.x*0.9+uTime*0.4)*0.16;
  p.y+=w*0.7; vY=w; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}\`;
const WAVE_FS=\`varying vec2 vUv; varying float vY; uniform vec3 cA; uniform vec3 cB; uniform float uTime;
void main(){ vec3 c=mix(cA,cB,clamp(vUv.x+vY*0.25,0.0,1.0));
  float flow=smoothstep(0.0,0.12,abs(fract(vUv.x*2.0-uTime*0.14)-0.5));
  float edge=smoothstep(0.0,0.28,vUv.y)*smoothstep(1.0,0.72,vUv.y);
  gl_FragColor=vec4(c+ (1.0-flow)*0.10, edge*0.5); }\`;
const waves=new THREE.Group();
for(let i=0;i<3;i++){
  const ca=new THREE.Color().setRGB(${wcol[0][0]},${wcol[0][1]},${wcol[0][2]});
  const cb=new THREE.Color().setRGB(${(wcol[2] || wcol[0])[0]},${(wcol[2] || wcol[0])[1]},${(wcol[2] || wcol[0])[2]});
  const wm=new THREE.ShaderMaterial({vertexShader:WAVE_VS,fragmentShader:WAVE_FS,uniforms:{uTime:{value:0},cA:{value:ca},cB:{value:cb}},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,fog:false});
  const rib=new THREE.Mesh(new THREE.PlaneGeometry(60,3.2,120,1),wm);
  rib.position.set(-6+i*1.5, 6.4-i*1.4, -20-i*2.2); rib.rotation.set(-0.32,0.16,-0.05-i*0.02);
  rib.userData.m=wm; waves.add(rib);
}
scene.add(waves);

// ================= GROWTH GRAPH-LINE (the purposeful data-graphic) ============
// One crisp saturated line that RISES and draws on (setDrawRange) with pulsing data
// dots + a soft area — the product's "up and to the right". Deep mid-right, behind
// the panels; emphasized during solution/benefits (Layer 2).
const GN=64;
const gpts=[];
for(let i=0;i<GN;i++){const x=(i/(GN-1))*22-11; const t=i/(GN-1);
  const y=-3.2 + t*6.2 + Math.sin(t*7.0)*0.5 + Math.sin(t*3.0+1.0)*0.7;
  gpts.push(new THREE.Vector3(x,y,0));}
const gcurve=new THREE.CatmullRomCurve3(gpts);
const gtube=new THREE.TubeGeometry(gcurve,GN*3,0.075,8,false);
const gline=new THREE.Mesh(gtube,new THREE.MeshBasicMaterial({color:LINE,transparent:true,opacity:0.95,fog:false}));
const graph=new THREE.Group();
graph.add(gline);
// soft area fill under the line
const areaShape=[]; for(let i=0;i<GN;i++){areaShape.push(gpts[i]);}
const areaGeo=new THREE.BufferGeometry();
{ const verts=[]; for(let i=0;i<GN-1;i++){const a=gpts[i],b=gpts[i+1];const yb=-4.2;
    verts.push(a.x,a.y,0, a.x,yb,0, b.x,b.y,0,  a.x,yb,0, b.x,yb,0, b.x,b.y,0);}
  areaGeo.setAttribute("position",new THREE.Float32BufferAttribute(verts,3)); }
const area=new THREE.Mesh(areaGeo,new THREE.MeshBasicMaterial({color:LINE,transparent:true,opacity:0.14,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
graph.add(area);
// data dots along the line
const dots=[];
for(let i=0;i<6;i++){const p=gcurve.getPoint(0.12+i*0.16);const d=new THREE.Mesh(new THREE.SphereGeometry(0.14,16,16),new THREE.MeshBasicMaterial({color:LINE,fog:false}));d.position.copy(p);d.userData.ph=i*0.5;graph.add(d);dots.push(d);}
graph.position.set(land()?4.5:0, land()?-0.5:-4.5, -12); graph.rotation.y=-0.12; graph.scale.setScalar(land()?1:0.8);
scene.add(graph);
const glineFull=gtube.index?gtube.index.count:gtube.attributes.position.count;

// ================= AMBIENT: soft orb sprites (bright glow on white) ============
function orbTex(){const c=document.createElement("canvas");c.width=c.height=128;const x=c.getContext("2d");
  const g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,"rgba(255,255,255,0.9)");g.addColorStop(0.35,"rgba(255,255,255,0.5)");g.addColorStop(1,"rgba(255,255,255,0)");
  x.fillStyle=g;x.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);return t;}
const OTEX=orbTex();
const orbs=new THREE.Group();
for(let i=0;i<7;i++){const col=new THREE.Color(A[i%A.length]);
  const m=new THREE.SpriteMaterial({map:OTEX,color:col,transparent:true,opacity:0.34,depthWrite:false,blending:THREE.AdditiveBlending});
  const sp=new THREE.Sprite(m);const sz=1.2+rand()*2.6;sp.scale.set(sz,sz,1);
  sp.position.set((rand()-0.5)*26,(rand()-0.5)*15,-6-rand()*10);
  sp.userData={ph:rand()*6.28,sp:0.2+rand()*0.4,x0:sp.position.x,y0:sp.position.y};orbs.add(sp);}
scene.add(orbs);

// ================= GENERATED PRODUCT UI (bright CanvasTexture) =================
function uiContent(kind, ci){
  const cw=1024, ch=640, cvs=document.createElement("canvas"); cvs.width=cw; cvs.height=ch;
  const x=cvs.getContext("2d");
  const acc=UIP.accents[ci%UIP.accents.length], acc2=UIP.accents[(ci+1)%UIP.accents.length], acc3=UIP.accents[(ci+2)%UIP.accents.length];
  const rr=(a,b,w,h,r)=>{x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath();};
  x.fillStyle="#FFFFFF"; x.fillRect(0,0,cw,ch);
  // sidebar (very light)
  x.fillStyle="#F8FAFC"; x.fillRect(0,0,150,ch); x.strokeStyle=UIP.hair; x.lineWidth=1; x.beginPath();x.moveTo(150,0);x.lineTo(150,ch);x.stroke();
  x.fillStyle=acc; rr(26,28,26,26,7); x.fill();
  for(let i=0;i<6;i++){x.fillStyle=i===1?acc:"#E2E8F0";x.globalAlpha=i===1?0.16:1;rr(26,86+i*46,98,20,6);x.fill();x.globalAlpha=1;}
  const PADX=186, TOP=34;
  x.fillStyle=UIP.ink; x.font="700 26px 'Space Grotesk',sans-serif"; x.fillText("Overview", PADX, TOP+22);
  x.fillStyle=acc; rr(cw-150,TOP,120,34,17); x.fill();
  x.fillStyle="#FFFFFF"; x.font="600 15px Inter,sans-serif"; x.fillText("Live", cw-116, TOP+22);
  // KPI tiles
  const tw=(cw-PADX-40-32)/3;
  for(let i=0;i<3;i++){const tx=PADX+i*(tw+16), ty=92;
    x.fillStyle="#FFFFFF"; x.strokeStyle=UIP.hair; x.lineWidth=1.5; rr(tx,ty,tw,96,12); x.fill(); x.stroke();
    x.fillStyle=UIP.dim; x.font="500 13px Inter,sans-serif"; x.fillText(["Revenue","Active","Uptime"][i], tx+16, ty+26);
    x.fillStyle=UIP.ink; x.font="700 34px 'Space Grotesk',sans-serif"; x.fillText(["$48.2k","12,847","99.9%"][i], tx+16, ty+64);
    x.fillStyle=i===2?acc3:acc; x.font="600 13px Inter,sans-serif"; x.fillText(["+18%","+7%","SLA"][i], tx+16, ty+86);}
  const cx=PADX, cy=214, cwid=cw-PADX-40, chei=ch-cy-34;
  x.fillStyle="#FFFFFF"; x.strokeStyle=UIP.hair; x.lineWidth=1.5; rr(cx,cy,cwid,chei,14); x.fill(); x.stroke();
  if(kind==="table"){
    for(let r=0;r<6;r++){x.fillStyle=r%2?"#F8FAFC":"#FFFFFF";rr(cx+14,cy+16+r*((chei-24)/6),cwid-28,((chei-24)/6)-6,7);x.fill();
      x.fillStyle=UIP.body;x.font="500 15px Inter,sans-serif";x.fillText(["Acme","Globex","Initech","Umbra","Hooli","Stark"][r], cx+30, cy+16+r*((chei-24)/6)+((chei-24)/12)+5);
      x.fillStyle=acc;x.globalAlpha=0.8;rr(cwid-120,cy+16+r*((chei-24)/6)+((chei-24)/12)-8,60+r*8,10,5);x.fill();x.globalAlpha=1;}
  } else if(kind==="bars"){
    const n=9, bw=(cwid-56)/n; for(let i=0;i<n;i++){const bh=(chei-56)*(0.28+(Math.sin(i*1.3+ci)*0.5+0.5)*0.66);x.fillStyle=i===n-1?acc3:acc;x.globalAlpha=i===n-1?1:0.82;rr(cx+28+i*bw,cy+chei-28-bh,bw-10,bh,5);x.fill();}
    x.globalAlpha=1;
  } else if(kind==="donut"){
    const ccx=cx+chei*0.55, ccy=cy+chei/2+6, R=chei*0.34, r0=R*0.58;
    const segs=[0.42,0.27,0.19,0.12]; let a0=-Math.PI/2;
    const dc=[acc,acc2,acc3,"#E2E8F0"];
    for(let i=0;i<segs.length;i++){const a1=a0+segs[i]*6.2832;x.beginPath();x.moveTo(ccx,ccy);x.arc(ccx,ccy,R,a0,a1);x.closePath();x.fillStyle=dc[i];x.fill();a0=a1;}
    x.fillStyle="#FFFFFF";x.beginPath();x.arc(ccx,ccy,r0,0,6.2832);x.fill();
    x.textAlign="center";x.fillStyle=UIP.ink;x.font="700 44px 'Space Grotesk',sans-serif";x.fillText("68%",ccx,ccy+2);x.fillStyle=UIP.dim;x.font="500 15px Inter,sans-serif";x.fillText("Conversion",ccx,ccy+30);x.textAlign="left";
    const lx=ccx+R+54, ly=cy+42, labs=["Direct","Search","Social","Referral"];
    for(let i=0;i<4;i++){x.fillStyle=dc[i];rr(lx,ly+i*46,16,16,4);x.fill();x.fillStyle=UIP.body;x.font="500 17px Inter,sans-serif";x.fillText(labs[i],lx+28,ly+13+i*46);x.fillStyle=UIP.dim;x.fillText(Math.round(segs[i]*100)+"%",lx+152,ly+13+i*46);}
  } else if(kind==="kanban"){
    const kc=3, kgap=16, colw=(cwid-32-kgap*(kc-1))/kc, heads=["To do","Active","Done"], nc=[3,2,3];
    for(let c=0;c<kc;c++){const colx=cx+16+c*(colw+kgap);
      x.fillStyle=UIP.body;x.font="600 15px Inter,sans-serif";x.fillText(heads[c],colx+2,cy+24);
      x.fillStyle=c===2?acc3:acc;x.beginPath();x.arc(colx+colw-12,cy+19,5,0,6.2832);x.fill();
      const ch2=(chei-52)/3; for(let k=0;k<nc[c];k++){const cardy=cy+38+k*ch2;
        x.fillStyle="#F8FAFC";x.strokeStyle=UIP.hair;x.lineWidth=1;rr(colx,cardy,colw,ch2-12,9);x.fill();x.stroke();
        x.fillStyle=(c===1&&k===0)?acc:"#CBD5E1";rr(colx+12,cardy+12,colw*0.52,8,4);x.fill();
        x.fillStyle="#E2E8F0";rr(colx+12,cardy+28,colw*0.74,7,4);x.fill();
        x.fillStyle=[acc,acc2,acc3][(c+k)%3];x.beginPath();x.arc(colx+colw-20,cardy+ch2-24,7,0,6.2832);x.fill();}}
  } else if(kind==="activity"){
    const rows=5, rh=(chei-20)/rows;
    for(let r=0;r<rows;r++){const ry=cy+10+r*rh;
      x.fillStyle=[acc,acc2,acc3][r%3];x.beginPath();x.arc(cx+36,ry+rh/2,15,0,6.2832);x.fill();
      x.fillStyle="#CBD5E1";rr(cx+64,ry+rh/2-15,cwid*0.32,10,5);x.fill();
      x.fillStyle="#E2E8F0";rr(cx+64,ry+rh/2+3,cwid*0.5,8,4);x.fill();
      x.strokeStyle=acc;x.lineWidth=2.5;x.beginPath();const sx=cx+cwid*0.72,sw=cwid*0.18;for(let i=0;i<8;i++){const spx=sx+i*(sw/7),spy=ry+rh/2+Math.sin(i*0.9+r+ci)*9;i?x.lineTo(spx,spy):x.moveTo(spx,spy);}x.stroke();
      x.fillStyle=UIP.dim;x.font="500 13px Inter,sans-serif";x.fillText((r+1)+"m",cx+cwid-34,ry+rh/2+4);}
  } else {
    x.strokeStyle=UIP.hair; x.lineWidth=1;
    for(let g=1;g<4;g++){x.beginPath();x.moveTo(cx+20,cy+g*(chei/4));x.lineTo(cx+cwid-20,cy+g*(chei/4));x.stroke();}
    const pts=[]; const n=24; for(let i=0;i<n;i++){const px=cx+24+i*((cwid-48)/(n-1));const t=i/(n-1);const py=cy+chei-30-(chei-70)*(0.30+t*0.42+Math.sin(i*0.7+ci)*0.10);pts.push([px,py]);}
    const grad=x.createLinearGradient(0,cy,0,cy+chei); grad.addColorStop(0,acc+"55"); grad.addColorStop(1,acc+"00");
    x.beginPath();x.moveTo(pts[0][0],cy+chei-24);pts.forEach(p=>x.lineTo(p[0],p[1]));x.lineTo(pts[n-1][0],cy+chei-24);x.closePath();x.fillStyle=grad;x.fill();
    x.beginPath();pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.strokeStyle=acc;x.lineWidth=3;x.lineJoin="round";x.stroke();
    x.fillStyle=acc2; x.beginPath(); x.arc(pts[n-1][0],pts[n-1][1],6,0,6.28); x.fill();
  }
  const tex=new THREE.CanvasTexture(cvs); if("SRGBColorSpace" in THREE)tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=4; tex.needsUpdate=true;
  return tex;
}

// ---- bright device-frame texture (white rounded card + header + traffic lights) ----
function frameTex(aspect,ci){
  const cw=1024, ch=Math.max(180,Math.round(cw/Math.max(0.4,aspect)));
  const cvs=document.createElement("canvas");cvs.width=cw;cvs.height=ch;const x=cvs.getContext("2d");
  const rad=Math.min(cw,ch)*0.05, bar=ch*0.12;
  const rr=(a,b,w,h,r)=>{x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath();};
  // card
  x.fillStyle="#FFFFFF"; rr(2,2,cw-4,ch-4,rad); x.fill();
  x.strokeStyle=UIP.hair; x.lineWidth=2; x.stroke();
  // header
  x.fillStyle="#F8FAFC"; rr(2,2,cw-4,bar,rad); x.fill();
  x.fillStyle="#FFFFFF"; x.fillRect(2,bar-2,cw-4,4);
  x.strokeStyle=UIP.hair; x.lineWidth=1.5; x.beginPath();x.moveTo(2,bar);x.lineTo(cw-2,bar);x.stroke();
  const dc=["#FF5F57","#FEBC2E","#28C840"]; for(let i=0;i<3;i++){x.fillStyle=dc[i];x.beginPath();x.arc(30+i*26,bar/2,7,0,6.2832);x.fill();}
  // url pill
  x.fillStyle="#FFFFFF"; x.strokeStyle=UIP.hair; x.lineWidth=1.5; rr(cw*0.30,bar*0.24,cw*0.44,bar*0.52,bar*0.26); x.fill(); x.stroke();
  const tex=new THREE.CanvasTexture(cvs); if("SRGBColorSpace" in THREE)tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=4; tex.needsUpdate=true;
  return {tex, barFrac:0.12};
}

// ---- soft drop-shadow sprite (sells the "floating" lift on a white stage) ----
function shadowTex(){const c=document.createElement("canvas");c.width=c.height=256;const x=c.getContext("2d");
  const g=x.createRadialGradient(128,128,0,128,128,128);g.addColorStop(0,"rgba(30,41,90,0.34)");g.addColorStop(0.55,"rgba(30,41,90,0.14)");g.addColorStop(1,"rgba(30,41,90,0)");
  x.fillStyle=g;x.beginPath();x.ellipse(128,128,128,128,0,0,6.2832);x.fill();const t=new THREE.CanvasTexture(c);return t;}
const SHTEX=shadowTex();
const loader=new THREE.TextureLoader();

// ---- bright product panel (screenshot OR generated UI) ----
function makePlate(spec){
  const g=new THREE.Group();
  const aspect=spec.aspect&&spec.aspect>0.3&&spec.aspect<4?spec.aspect:1.6;
  const w=spec.w*WSCALE, h=w/aspect;
  // accent GLOW halo behind (sells the lift on the dark stage — a drop-shadow vanishes)
  const gl=new THREE.Mesh(new THREE.PlaneGeometry(w*1.6,h*1.75),new THREE.MeshBasicMaterial({map:OTEX,color:A[spec.ci%A.length],transparent:true,opacity:0.55,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
  gl.position.set(0,0,-0.16); g.add(gl);
  // white device frame
  const fr=frameTex(aspect,spec.ci);
  const frame=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:fr.tex,transparent:true}));
  g.add(frame);
  // content (real screenshot OR bright generated UI), inset below the header
  const barH=h*fr.barFrac, pad=w*0.012;
  const cw=w-pad*2, chh=h-barH-pad*2;
  let shotMat;
  if(spec.tex){const tex=loader.load(spec.tex);if("SRGBColorSpace" in THREE)tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;shotMat=new THREE.MeshBasicMaterial({map:tex});}
  else{shotMat=new THREE.MeshBasicMaterial({map:uiContent(spec.ui||"line",spec.ci)});}
  const shot=new THREE.Mesh(new THREE.PlaneGeometry(cw,chh),shotMat);
  shot.position.set(0,-barH/2,0.012); g.add(shot);
  // a small floating accent card in front (layered screens / depth) for the hero
  if(spec.role==="hero"){
    const mw=w*0.34, mh=mw/1.5;
    const mfr=frameTex(1.5,(spec.ci+1));
    const mini=new THREE.Group();
    const msh=new THREE.Mesh(new THREE.PlaneGeometry(mw*1.6,mh*1.7),new THREE.MeshBasicMaterial({map:OTEX,color:A[(spec.ci+1)%A.length],transparent:true,opacity:0.5,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));msh.position.set(0,0,-0.12);mini.add(msh);
    const mf=new THREE.Mesh(new THREE.PlaneGeometry(mw,mh),new THREE.MeshBasicMaterial({map:mfr.tex,transparent:true}));mini.add(mf);
    const mc=new THREE.Mesh(new THREE.PlaneGeometry(mw*0.94,mh*0.8),new THREE.MeshBasicMaterial({map:uiContent("donut",spec.ci+1)}));mc.position.set(0,-mh*mfr.barFrac/2,0.01);mini.add(mc);
    mini.position.set(-w*0.52, -h*0.42, 0.9); mini.rotation.y=0.14;
    mini.userData.mini=true; g.add(mini);
  }
  g.userData={base:spec, w, h};
  return g;
}

// ---- build one group per scene (its panels), hidden until its window ----
const SCENES=${JSON.stringify(sceneWindows)};
for(const sc of SCENES){
  const g=new THREE.Group();
  const mine=PLATES.filter(p=>p.scene===sc.i);
  mine.forEach((spec,idx)=>{
  // PORTRAIT COPY BAND. On every treatment except hook/cta the copy is pinned to the TOP safe
  // area (sceneOverlay: justify-content:flex-start) and its height is unbounded, while the
  // plate stack is centred on y=0. A one-line headline clears it; a two-line one does not —
  // rendered at 1080x1920 the word "everything" sat straight across the hero plate holding the
  // real product screenshot, covering the thing the film exists to show. Nothing reconciled the
  // DOM copy with the WebGL stack because they live in different coordinate systems.
  //
  // Dropping the stack by one plate-gap clears the two-line case with room to spare and leaves
  // hook/cta — whose copy is vertically centred, so it never competed — exactly as authored.
  const COPYDROP = (PORT && sc.type !== "hook" && sc.type !== "cta") ? -1.2 : 0;
    const pl=makePlate(spec);
    // Text lives LOWER-LEFT (see sceneOverlay); panels sit CENTER-RIGHT big, so the
    // screenshot fills 40-60% without covering the headline.
    // Portrait/square: a NATIVE vertical stack — hero centred in the mid-band, features
    // STACKED down the column (never fanned sideways), everything at x=0. Landscape keeps
    // the lower-left text / center-right panel split.
    if(spec.role==="hero"){pl.position.set(PORT?0:2.4, PORT?(-0.7+COPYDROP):0.9, 0); pl.rotation.y=PORT?-0.05:-0.16;}
    else if(spec.role==="feature"){const n=mine.length;const spread=n>1?(idx-(n-1)/2):0;
      if(PORT){pl.position.set(0, -spread*2.9+COPYDROP, -Math.abs(spread)*0.5); pl.rotation.y=-0.05;}
      else{pl.position.set(2.2+spread*3.4, 1.2+(idx%2?-0.5:0.5), -idx*1.6); pl.rotation.y=-0.18-spread*0.14;}}
    else if(spec.role==="side"){pl.position.set(PORT?0:3.4, PORT?(-0.7+COPYDROP):1.1, -0.3); pl.rotation.y=PORT?-0.05:-0.22;}
    else if(spec.role==="frag"){
      if(PORT){pl.position.set(0, (idx?-2.3:2.3)+COPYDROP, -0.8-idx*0.4); pl.rotation.set(0.02,-0.05,(idx?-0.05:0.05));}
      else{pl.position.set(2.6+(idx?2.0:-2.0), 1.5+(idx?-0.8:0.6), -1.2-idx*0.8); pl.rotation.set(0.02,-0.2+(idx?0.1:-0.1),(idx?-0.06:0.06));}}
    pl.userData.jit={ph:rand()*6.28, ax:0.05+rand()*0.05, ay:0.06+rand()*0.06};
    g.add(pl);
  });
  g.visible=false; sc.group=g; scene.add(g);
}

// ---- camera choreography per treatment (BIG, cinematic, always moving) --------
function cameraFor(type,lt,dur){
  const p=Math.max(0,Math.min(1,lt/Math.max(0.1,dur)));
  const e=smooth(0,1,p), ee=expoOut(p);
  // seeded handheld micro-motion (pure fn of time) — nothing is ever perfectly still.
  const hx=Math.sin(lt*0.9+1.3)*0.05+Math.sin(lt*0.37)*0.06;
  const hy=Math.cos(lt*0.8+0.6)*0.04+Math.sin(lt*0.28)*0.05;
  if(type==="hook")      return {px:lerp(-0.4,0.9,e)+hx, py:0.3+hy, pz:lerp(13.5,8.4,ee), tx:0, ty:0.1, tz:0, roll:lerp(0.012,-0.008,e)};
  if(type==="problem")   return {px:lerp(-2.2,2.2,e)+hx, py:0.2+hy*1.3, pz:9.6, tx:lerp(1.0,-1.0,e), ty:0.2, tz:-1, roll:lerp(-0.014,0.014,e)};
  if(type==="solution")  return {px:lerp(1.6,-0.2,ee)+hx, py:0.7+hy, pz:lerp(11.0,6.6,ee), tx:lerp(1.0,0.4,e), ty:0.5, tz:0, roll:0};   // dolly-in on the hero
  if(type==="features")  return {px:lerp(-3.0,3.0,e)+hx, py:0.9+hy, pz:8.6, tx:lerp(-1.8,1.8,e), ty:0.6, tz:-0.6, roll:lerp(0.016,-0.016,e)}; // orbit across the row
  if(type==="benefits")  return {px:lerp(2.4,-0.2,ee)+hx, py:0.6+hy, pz:lerp(9.0,6.6,e), tx:lerp(1.0,0.2,e), ty:0.4, tz:0, roll:0};
  /* cta */               return {px:hx, py:0.25+hy, pz:lerp(5.4,12.0,ee), tx:0, ty:0.1, tz:0, roll:lerp(-0.016,0,e)};   // pull back
}

function winOpacity(t,s,e){
  if(t<s-0.3||t>e+0.3)return 0;
  const a=s<=0.01?1:Math.min(1,(t-(s-0.3))/0.5);
  const b=e>=D-0.01?1:Math.min(1,((e+0.3)-t)/0.5);
  return Math.max(0,Math.min(a,b));
}
function setOpacity(g,o){g.visible=o>0.01;g.traverse((o2)=>{if(o2.material&&"opacity" in o2.material){o2.userData.__b=o2.userData.__b!==undefined?o2.userData.__b:o2.material.opacity;o2.material.transparent=true;o2.material.opacity=o2.userData.__b*o;}});}

// ---- per-scene STAGE DRESSING -------------------------------------------------
// One set per scene, derived from its index + treatment, so consecutive scenes never
// share a backdrop. Deliberately bounded: this re-emphasises and re-places the pack's
// OWN accents, it does not introduce colour. Three dressings rotate, which is enough to
// guarantee adjacent difference while keeping the film coherent.
const DRESS=${JSON.stringify(
  /^(1|true|yes|on)$/i.test(String(process.env.KF_NO_STAGE_DRESSING || ""))
    // Kill switch — every scene gets the ORIGINAL single dressing. Baked at build time
    // (this table is generated in Node), so it also gives a controlled A/B: render the
    // same film with and without, and the only variable is the set.
    ? [{ mix: [1, 1, 1], off: [0, 0], vig: 0.9, gop: 0.28, grot: 0 },
       { mix: [1, 1, 1], off: [0, 0], vig: 0.9, gop: 0.28, grot: 0 },
       { mix: [1, 1, 1], off: [0, 0], vig: 0.9, gop: 0.28, grot: 0 }]
    : [{ mix: [1.00, 0.42, 0.62], off: [0.000, 0.000], vig: 0.90, gop: 0.28, grot: 0.00 },
       { mix: [0.45, 1.00, 0.55], off: [-0.085, 0.055], vig: 0.74, gop: 0.20, grot: 0.16 },
       { mix: [0.58, 0.50, 1.00], off: [0.075, -0.050], vig: 1.00, gop: 0.34, grot: -0.14 }]
)};
// A CTA pulls back and should feel like the film opening out: brightest wash, softest edge.
const dressIndexFor=(sc,i)=>sc.type==="cta"?1:(sc.type==="hook"?0:(i%3));
const DRESSES=SCENES.map((sc,i)=>DRESS[dressIndexFor(sc,i)]);
// PURE FUNCTION OF t — the renderer scrubs the timeline in both directions, so the set
// must be reconstructible at any instant, never accumulated frame to frame. Scenes
// cross-fade their dressing over the last 0.5s so a change reads as a deliberate
// re-light rather than a cut.
function dressAt(t){
  let i=0; for(let k=0;k<SCENES.length;k++){ if(t>=SCENES[k].start) i=k; }
  const cur=DRESSES[i], nxt=DRESSES[Math.min(i+1,DRESSES.length-1)];
  const end=SCENES[i].end, blend=0.5;
  const w=(i<SCENES.length-1&&t>end-blend)?Math.max(0,Math.min(1,(t-(end-blend))/blend)):0;
  const lp=(a,b)=>a+(b-a)*w;
  return {
    mix:[lp(cur.mix[0],nxt.mix[0]),lp(cur.mix[1],nxt.mix[1]),lp(cur.mix[2],nxt.mix[2])],
    off:[lp(cur.off[0],nxt.off[0]),lp(cur.off[1],nxt.off[1])],
    vig:lp(cur.vig,nxt.vig), gop:lp(cur.gop,nxt.gop), grot:lp(cur.grot,nxt.grot),
  };
}

function render3d(t){
  aurMat.uniforms.uTime.value=t;
  {
    const dr=dressAt(t);
    aurMat.uniforms.uMix.value.set(dr.mix[0],dr.mix[1],dr.mix[2]);
    aurMat.uniforms.uOff.value.set(dr.off[0],dr.off[1]);
    aurMat.uniforms.uVig.value=dr.vig;
    // The floor grid is the other half of the "same set" read — vary its density and
    // yaw with the wash so the whole stage turns, not just its colour.
    grid.material.opacity=dr.gop;
    grid.rotation.y=dr.grot;
  }
  waves.children.forEach((rib)=>{rib.userData.m.uniforms.uTime.value=t;});
  // orbs drift (ambient, always moving)
  orbs.children.forEach((sp)=>{sp.position.x=sp.userData.x0+Math.sin(t*sp.userData.sp+sp.userData.ph)*1.4;sp.position.y=sp.userData.y0+Math.cos(t*sp.userData.sp*0.8+sp.userData.ph)*0.9;});
  grid.position.z=-8+((t*0.35)%2.0);

  let active=SCENES[0];
  for(const sc of SCENES){const o=winOpacity(t,sc.start,sc.end);setOpacity(sc.group,o);if(t>=sc.start&&t<sc.end)active=sc;
    sc.group.children.forEach((pl)=>{const j=pl.userData.jit;if(!j)return;const lt=t-sc.start;
      pl.position.y=(pl.userData.baseY!==undefined?pl.userData.baseY:(pl.userData.baseY=pl.position.y))+Math.sin(lt*0.7+j.ph)*0.12;
      pl.rotation.x=Math.sin(lt*0.5+j.ph)*0.018;
      // the small floating accent card counter-parallaxes for depth
      pl.children.forEach((ch)=>{if(ch.userData&&ch.userData.mini){ch.position.x=(ch.userData.mx0!==undefined?ch.userData.mx0:(ch.userData.mx0=ch.position.x))+Math.sin(lt*0.6+1.0)*0.16;}});
    });
  }

  // GROWTH GRAPH: draws on during solution/benefits, then holds; dots pulse; gentle rise.
  const gp=(active.type==="solution"||active.type==="benefits")?smooth(active.start+0.2,active.start+1.8,t):(t>SCENES[0].start+1?1:smooth(0.2,2.0,t));
  const cnt=Math.max(6,Math.floor(glineFull*Math.max(0.06,gp)/3)*3);
  gline.geometry.setDrawRange(0,cnt);
  gline.material.opacity=0.35+0.6*gp;
  area.material.opacity=0.10*gp;
  dots.forEach((d,i)=>{const on=gp>(0.12+i*0.16);d.visible=on;const s=on?1+Math.sin(t*3+d.userData.ph)*0.14:0;d.scale.setScalar(s);});
  graph.rotation.y=-0.12+Math.sin(t*0.1)*0.03;

  const c=cameraFor(active.type,t-active.start,active.end-active.start);
  // Portrait/square: centre the rig (kill the wide lateral sweeps) and look slightly down
  // so the top headline + mid-band hero plate both sit in the tall frame.
  if(PORT){ c.px*=0.12; c.tx*=0.12; c.roll*=0.4; c.py=0.15+c.py*0.3; c.ty=-0.45; }
  cam.position.set(c.px,c.py,c.pz); cam.up.set(Math.sin(c.roll||0),Math.cos(c.roll||0),0); cam.lookAt(c.tx,c.ty,c.tz);
  key.position.x=4+Math.sin(t*0.2)*3; fill.position.x=-6+Math.cos(t*0.18)*3;
  renderer.render(scene,cam);
}
render3d(0);

const tl=gsap.timeline({paused:true,defaults:{ease:"power3.out"}});
tl.to({v:0},{v:1,duration:D,ease:"none",onUpdate:()=>render3d(tl.time())},0);
__OVERLAY_TWEENS__
window.__timelines=window.__timelines||{}; window.__timelines["vid"]=tl;
`;
}

// ---- asset → scene panel assignment (heuristic, aspect-aware) ----------------
// EVERY content scene gets a panel. Real screenshots take priority; when the pool is
// empty the panel renders a GENERATED bright product UI (never a void). Panels are
// BIG (screenshots occupy ~40-60% of the frame).
function assignPlates(scenes, sceneWindows, assets) {
  // The user's logo never rides a product plate (it gets key-moment treatment);
  // their uploads outrank everything, including the site's own captures.
  const imgs = (assets || []).filter((a) => a && a.path && String(a.role || "") !== "logo" && !/\.(mp4|webm|mov)$/i.test(a.path) && !/\.svg($|\?)/i.test(a.path));
  const ratio = (a) => (a.width && a.height ? a.width / a.height : (a.ratio || 1.6));
  const rank = (a) => (a.source === "upload" ? 4 : a.source === "website" || /screenshot|webpage|landing|dashboard/i.test(a.alt || "") ? 3 : a.visionOk === true ? 2 : 1);
  const pool = imgs.slice().sort((a, b) => rank(b) - rank(a));
  const used = new Set();
  const take = () => { const a = pool.find((x) => !used.has(x)); if (a) used.add(a); return a || null; };
  const avail = () => pool.filter((x) => !used.has(x)).length;
  const UIKINDS = ["donut", "kanban", "activity", "table"];
  const plates = [];
  sceneWindows.forEach((w) => {
    const type = w.type;
    if (type === "solution") {
      const a = take();
      plates.push({ scene: w.i, role: "hero", tex: a ? a.path : null, ui: "line", aspect: a ? ratio(a) : 1.6, w: 6.4, ci: 0 });
    } else if (type === "features") {
      for (let k = 0; k < 3; k++) { const a = take(); plates.push({ scene: w.i, role: "feature", tex: a ? a.path : null, ui: UIKINDS[k % UIKINDS.length], aspect: a ? ratio(a) : 1.6, w: 3.2, ci: k }); }
    } else if (type === "benefits") {
      const a = take();
      plates.push({ scene: w.i, role: "side", tex: a ? a.path : null, ui: "bars", aspect: a ? ratio(a) : 1.6, w: 3.8, ci: 2 });
    } else if (type === "problem") {
      // two small FRAGMENTED cards (generated UI) that visualize friction / silos.
      for (let k = 0; k < 2; k++) { const a = avail() > 1 ? take() : null; plates.push({ scene: w.i, role: "frag", tex: a ? a.path : null, ui: ["table", "activity"][k], aspect: a ? ratio(a) : 1.5, w: 2.7, ci: k }); }
    } else if (type === "cta") {
      if (avail() > 0) { const a = take(); plates.push({ scene: w.i, role: "side", tex: a.path, aspect: ratio(a), w: 2.6, ci: 1 }); }
    }
    // hook stays pure type over the mesh-gradient (waves + graph intro carry the motion).
  });
  return plates;
}

// ---- the skin the film actually WORE ----------------------------------------
// The Brand panel's ACCENTS row is a claim about the USER's palette, not an inventory of
// the film's, so it may only carry what the brand contributed — and carry it RESOLVED.
// #146eb4 arrives on this stage as a pale #bbd5ea; showing its owner the color they typed
// while the film paints another one is the exact dishonesty art_director.js:191 built its
// persist gate to prevent, and the gate cannot catch it because the shift happens here,
// after the gate has run.
//
// Merged OVER the input skin, so reason/source/provenance survive: those say where the
// palette CAME from, which is a question resolution has no opinion about. Everything
// resolution does have an opinion about wins.
//
// Null when nothing survived: the panel must then say "no brand", not show a palette
// nobody painted.
function resolvedSkin(brandSkin, brand, brandLed) {
  if (!brand.applied || !brandLed.length) return null;
  return {
    ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
    accents: brandLed, emphasis: brand.emphasis,
    adjusted: brand.adjusted, dropped: brand.dropped,
    tier: brand.tier, applied: true,
  };
}

// Per-script render-width factor for the char-count `measure` above. Set at the top of the
// (synchronous) buildComposition from the video-text language; 1 for Latin/English (no-op).
// Module-scoped is safe — buildComposition never yields mid-build, so runs can't interleave.
let _langCharWidth = 1;
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin, captionStyle } = {}) {
  _langCharWidth = (captionStyle && captionStyle.text && captionStyle.text.charWidth) || 1;
  // Non-Latin scripts (Arabic diacritics, Devanagari matras) collide at the display headline's
  // tight 0.98 line-height; lift it to a per-script floor so stacked marks clear. 0.98 for Latin.
  const _headLh = (captionStyle && captionStyle.text && captionStyle.text.lineHeight) || 0.98;
  const sb = storyboard || {};
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length ? sb.scenes : [{ id: "s1", start: 0, duration: 6, purpose: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r2(sb.durationSec || scenes.reduce((a, s) => a + (s.duration || 0), 0) || 12);
  const W = dims.width, H = dims.height;
  const theme = flagshipTheme(framePack, sb, brandSkin);
  const seed = hashSeed(`${sb.title || ""}|${scenes.length}|flagship`);
  const sc = typeScale(W, H);
  const px = (n) => Math.round(n * sc);

  let cursor = 0;
  const sceneWindows = scenes.map((scene, i) => {
    const start = r2(scene.start != null ? scene.start : cursor);
    const dur = r2(scene.duration || 4);
    cursor = r2(cursor + dur);
    return { i, type: treatmentFor(scene, i, scenes.length), start, end: r2(start + dur) };
  });
  // ANTI-REPETITION (services/motion_planner). treatmentFor keys off purpose, so two
  // adjacent scenes whose purposes match the same branch (e.g. both /feature|how|demo/)
  // get the SAME treatment — the same backdrop and layout twice in a row, which is the
  // blocker a real render produced here ("the background and layout are identical to the
  // scene at 5.9s"). Only this pack's generic narrative treatments are interchangeable;
  // `benefits` renders animated metrics and keeps whatever treatmentFor decided.
  {
    const { archetypes, changed } = varyArchetypes(sceneWindows.map((w) => w.type), {
      pool: ["problem", "solution", "features"],
      seedKey: scenes.map((s) => s && s.id).join("|"),
    });
    if (changed) {
      sceneWindows.forEach((w, i) => { w.type = archetypes[i]; });
      console.log(`[flagship] varied ${changed} repeated treatment(s) so adjacent scenes don't share a set`);
    }
  }

  const plates = assignPlates(scenes, sceneWindows, assets);

  const bodyHtml = [`<canvas id="kfcanvas" class="clip" data-start="0" data-duration="${D}" data-track-index="0" width="${W}" height="${H}"></canvas>`];

  const catalogue = (sb.title || "KEYFRAME").toUpperCase().slice(0, 34);
  bodyHtml.push([
    `<div class="kchrome clip" data-start="0" data-duration="${D}" data-track-index="30" data-layout-allow-occlusion>`,
    `  <span class="kcat">${esc(catalogue)}</span>`,
    `  <span id="kfcount" class="kcount">01 / ${String(sceneWindows.length).padStart(2, "0")}</span>`,
    `  <span class="kbar"><span id="kfprog" class="kbarfill"></span></span>`,
    `</div>`,
  ].join("\n"));

  const overlayTweens = [];
  scenes.forEach((scene, i) => {
    const w = sceneWindows[i];
    const ov = sceneOverlay(scene, i, scenes.length, { theme, dims, T: w.start, L: r2(w.end - w.start), title: sb.title, treatment: w.type });
    bodyHtml.push(ov.html);
    overlayTweens.push(`// ${scene.id || "s" + (i + 1)} (${w.type})`, ov.script);
  });
  overlayTweens.push([
    `{ var __starts=${JSON.stringify(sceneWindows.map((w) => w.start))}, __n=${sceneWindows.length};`,
    `  tl.to({d:0},{d:1,duration:${D},ease:"none",onUpdate:function(){`,
    `    var t=tl.time(), pct=Math.max(0,Math.min(1,t/${D}));`,
    `    var pr=document.getElementById("kfprog"); if(pr) pr.style.transform="scaleX("+pct.toFixed(4)+")";`,
    `    var idx=1; for(var i=0;i<__starts.length;i++){ if(t>=__starts[i]-0.001) idx=i+1; }`,
    `    var cc=document.getElementById("kfcount"); if(cc){ var s=("0"+idx).slice(-2)+" / "+("0"+__n).slice(-2); if(cc.textContent!==s) cc.textContent=s; }`,
    `  }},0); }`,
  ].join("\n"));

  // Burned-in captions (the 3D packs previously exported an .srt but showed no
  // subtitles). The pill rides the bottom safe area; its #cap-text picks up the
  // caption-language font/RTL from pipeline.injectCaptionStyle. Empty when off.
  const safe = safeArea(W, H);
  const cap = buildCaptionOverlay({ captionCues, dims, D, safe });
  if (cap.html) { bodyHtml.push(cap.html); overlayTweens.push("// captions", cap.script); }

  const moduleSrc = threeModule({ theme, dims, D, seed, sceneWindows, plates }).replace("__OVERLAY_TWEENS__", overlayTweens.join("\n"));

  const indexHtml = [
    `<!DOCTYPE html>`, `<html>`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="${GSAP_CDN}"></script>`,
    `<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/"}}</script>`,
    `<style>`,
    theme.fontFace || "",
    `* { margin:0; padding:0; box-sizing:border-box; }`,
    `body { font-family:${theme.fontStack}; }`,
    `#root { position:relative; overflow:hidden; background:${theme.ground}; }`,
    `#kfcanvas { position:absolute; inset:0; z-index:0; }`,
    `.ktxt { position:absolute; inset:0; z-index:10; display:flex; flex-direction:column; }`,
    `.kscrim { position:absolute; inset:0; pointer-events:none; z-index:-1; }`,
    `.kstack { position:relative; display:flex; flex-direction:column; align-items:inherit; }`,
    `.kkick { display:inline-flex; align-items:center; gap:12px; margin-bottom:${px(24)}px; color:${theme.kickCol}; font-family:${theme.monoStack}; font-size:${px(14)}px; font-weight:600; letter-spacing:.2em; text-transform:uppercase; text-shadow:0 0 16px ${rgba(theme.kickCol, 0.5)}; }`,
    `.kkick::before { content:""; width:${px(40)}px; height:2px; background:${theme.kickCol}; box-shadow:0 0 12px ${rgba(theme.kickCol, 0.85)}; }`,
    `.kwall { position:absolute; top:-0.42em; z-index:-1; font-family:${theme.displayStack}; font-weight:800; font-size:${px(W >= H ? 380 : 250)}px; line-height:1; color:${theme.ink}; opacity:0.06; pointer-events:none; letter-spacing:-0.04em; }`,
    `.khead { margin:0; font-family:${theme.displayStack}; font-weight:700; line-height:${_headLh}; letter-spacing:-0.03em; color:${theme.ink}; text-shadow:0 2px 24px rgba(0,0,0,0.55),0 1px 2px rgba(0,0,0,0.5); overflow-wrap:anywhere; }`,
    `.kw { display:inline-block; overflow:hidden; vertical-align:top; max-width:100%; }`,
    `.kwi { display:inline-block; overflow-wrap:anywhere; word-break:break-word; }`,
    // `color` is a solid accent fallback under the gradient text-clip: inert in
    // normal rendering (-webkit-text-fill-color:transparent wins), revealed by the
    // i18n layer for complex scripts, where background-clip:text breaks Devanagari/
    // Arabic glyph shaping. See caption_render.SHAPING_FIX.
    `.kacc .kwi { background:linear-gradient(120deg, ${theme.emphA} 0%, ${theme.emphB} 100%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:${theme.emphB}; text-shadow:none; filter:drop-shadow(0 0 22px ${rgba(theme.emphB, 0.5)}); }`,
    `.ksub { margin-top:${px(20)}px; font:500 1em/1.5 ${theme.fontStack}; color:${theme.body}; max-width:44ch; text-shadow:0 2px 16px rgba(0,0,0,0.5); }`,
    `.kchips { display:flex; gap:${px(12)}px; margin-top:${px(28)}px; flex-wrap:wrap; }`,
    `.kchip { display:inline-flex; align-items:center; gap:${px(9)}px; padding:${px(9)}px ${px(16)}px; border-radius:999px; background:rgba(255,255,255,0.06); border:1px solid ${theme.hair}; color:${theme.ink}; font:600 ${px(15)}px/1 ${theme.fontStack}; letter-spacing:-0.01em; box-shadow:0 8px 24px rgba(0,0,0,0.35); backdrop-filter:blur(8px); }`,
    `.kchip i { width:${px(8)}px; height:${px(8)}px; border-radius:50%; background:${theme.accent2}; box-shadow:0 0 10px ${theme.accent2}; }`,
    `.kchip:nth-child(2) i { background:${theme.accent3}; }`,
    `.kchip:nth-child(3) i { background:${theme.accent}; }`,
    `.kmetric { font-family:${theme.displayStack}; font-weight:700; line-height:1; letter-spacing:-0.03em; color:${theme.emphB}; font-size:${px(W >= H ? 190 : 130)}px; display:flex; align-items:baseline; text-shadow:0 0 44px ${rgba(theme.emphB, 0.5)},0 2px 20px rgba(0,0,0,0.5); }`,
    `.kmpre { font-size:0.5em; color:${theme.ink}; margin-right:0.12em; }`,
    `.kmsuf { font-size:0.6em; color:${theme.accent}; margin-left:0.04em; }`,
    `.kmlabel { margin-top:${px(10)}px; font-family:${theme.displayStack}; font-weight:600; font-size:${px(W >= H ? 52 : 36)}px; color:${theme.ink}; letter-spacing:-0.02em; }`,
    `.kchrome { position:absolute; inset:0; z-index:9; pointer-events:none; font-family:${theme.monoStack}; }`,
    `.kcat { position:absolute; left:${W >= H ? 58 : 40}px; bottom:42px; font-size:${px(12)}px; letter-spacing:.2em; text-transform:uppercase; color:${theme.dim}; }`,
    `.kcount { position:absolute; right:${W >= H ? 58 : 40}px; bottom:42px; font-size:${px(12)}px; letter-spacing:.2em; color:${theme.kickCol}; }`,
    `.kbar { position:absolute; left:0; right:0; bottom:0; height:3px; background:${theme.hair}; }`,
    `.kbarfill { display:block; height:100%; width:100%; transform-origin:left; transform:scaleX(0); background:linear-gradient(90deg, ${theme.accent}, ${theme.accent3}); box-shadow:0 0 14px ${rgba(theme.accent, 0.7)}; }`,
    cap.css || "",
    `</style>`, `</head>`, `<body>`,
    `<div id="root" data-composition-id="vid" data-start="0" data-width="${W}" data-height="${H}" data-duration="${D}">`,
    bodyHtml.join("\n"),
    `</div>`,
    `<script type="module">`,
    moduleSrc,
    `</script>`, `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: dims.fps || 30, duration: D });
  return { indexHtml, metaJson, resolvedBrand: resolvedSkin(brandSkin, theme.brand, theme.brandLed) };
}

module.exports = { buildComposition };
