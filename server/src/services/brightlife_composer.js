// BRIGHT LIFE COMPOSER — a luminous, BRIGHT-cinematic Three.js launch film.
//
// The daylight sibling of flagship_composer.js: the same cinematic depth, camera
// rig and glass-card product presentation, but on an airy WHITE canvas washed with
// soft pastel mesh gradients. Register: above Apple / Stripe / Linear / Framer /
// OpenAI marketing videos — never dark.
//
// WHY IT DOESN'T COPY THE FLAGSHIP'S BLOOM: on a white ground, additive bloom does
// almost nothing (you cannot add light to white). So Bright Life gets its glow and
// depth from a GRAPHICAL MOTION SYSTEM (Stripe / Linear / Framer / OpenAI register) —
// NOT glassmorphism: (a) GRADIENT DATA WAVES (flowing matte mesh-gradient ribbons =
// AI/intelligence), (b) a MATTE GRADIENT BLOB FAMILY (morphing sculpture, no glass),
// (c) a MOTION GEOMETRY constellation (orbiting nodes + gradient arcs + connections
// that ASSEMBLE on features, CONVERGE on the CTA), (d) a DYNAMIC GRAPH LINE that draws
// up on the benefits scene (growth), plus soft ORB sprites, PARTICLE points and card
// SHADOWS. Materials are matte (MeshStandard + custom gradient ShaderMaterials) — NO
// MeshPhysicalMaterial, NO transmission, NO env reflections. No EffectComposer — one
// direct renderer.render() per frame keeps it robust and deterministic.
//
// THE IDENTITY: product screenshots (or a GENERATED light dashboard when none exist)
// float on WHITE glassmorphic cards with a 1px indigo hairline, a soft floating
// shadow and a browser chrome bar — presented, never pasted on a slide.
//
// Same envelope as scene_kit / flagship (buildComposition -> {indexHtml, metaJson}).
// The whole animation is driven off the single paused GSAP timeline HyperFrames seeks
// (window.__timelines["vid"]) via tl.to({onUpdate:()=>render3d(tl.time())}) —
// deterministic frame-by-frame. Seeded PRNG (mulberry32); every per-frame value is a
// pure function of tl.time() (no Math.random / Date at runtime). Text is crisp DOM
// ABOVE the canvas (ink #111827 on white, indigo→violet gradient on the highlight).

const { deriveTheme } = require("./scene_kit");
const { resolveBrand, atmosphericGround } = require("./brand_kit");
const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { aspectMode, typeScale, safeArea, headlineCh } = require("./responsive");
const { buildCaptionOverlay } = require("./caption_overlay");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
const THREE_VER = "0.160.0";
const SAFE_FONTS = "Inter, 'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif";
// The brief's aspirational display faces (Clash Display / Cabinet Grotesk / General
// Sans / Satoshi) are NOT bundled and cannot load in the offline headless renderer —
// naming them in CSS also fails hyperframes' font_family_without_font_face lint gate.
// Space Grotesk is the bundled (offline, data-URI) premium SaaS/flagship display face
// per the Hyperframe design principles, so it is the one that actually renders here.

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r2 = (n) => Math.round(n * 1000) / 1000;
const hexInt = (c) => { const m = /^#?([0-9a-fA-F]{6})$/.exec(String(c || "").trim()); return m ? parseInt(m[1], 16) : 0x6366F1; };
const hexToRgb = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
const toHex2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
const mix = (h1, h2, t) => { const a = hexToRgb(h1), b = hexToRgb(h2); return `#${toHex2(a[0] + (b[0] - a[0]) * t)}${toHex2(a[1] + (b[1] - a[1]) * t)}${toHex2(a[2] + (b[2] - a[2]) * t)}`; };
const lighten = (h, amt) => mix(h, "#FFFFFF", amt);
function hashSeed(s) { let h = 2166136261; const str = String(s || ""); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---- brand colour-kit — LIFTED from flagship_composer.js so the bright palette can be
// rotated onto the BRAND's hue while its authored LUMINANCE is pinned. IDENTITY here is
// AIRY LUMINANCE + MOTION + TYPOGRAPHY + LAYOUT; only HUE is the brand's to steer — so a
// "red brightlife" stays just as bright and airy, its particles/orbs/waves the same
// brightnesses, only recoloured. The WHITE ground, the ink, and the positive-semantic
// GREENS never pass through reHue.
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
// reHue: rotate onto `hue`, bisecting HSL lightness back to the source's relative luminance
// (monotone in L at fixed hue/sat) so every bright pastel keeps the EXACT brightness it was
// authored at — the whole "stays airy" guarantee. Saturation stays the pastel's own;
// achromatic in → untouched; a lum-pin miss fails OPEN to the source hex. 0.006 (not
// flagship's 0.004) because these palette hues are fairly saturated (rounding 3 channels
// compounds), matching bloom/paper-tales.
const LUM_PIN = 0.006;
function reHue(hex, hue) {
  const [, s] = rgbToHsl(hexToRgb(hex));
  if (s < 0.02) return hex;
  const target = relLum(hex);
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (relLum(hslHex(hue, s, mid)) < target) lo = mid; else hi = mid; }
  const l = (lo + hi) / 2;
  let out = hex, err = Infinity;
  for (const dl of [0, -1 / 255, 1 / 255]) { const cand = hslHex(hue, s, l + dl); const e = Math.abs(relLum(cand) - target); if (e < err) { err = e; out = cand; } }
  return err <= LUM_PIN ? out : hex;
}
// resolveBrand lays accents brand-first then pack, so the brand-led run ends at the first
// entry the pack already owned (flagship_composer.js:105). [] means no brand applied.
function brandLedOf(brand, packAccents) {
  const pack = new Set(packAccents.map((a) => String(a).toLowerCase()));
  const out = [];
  for (const a of brand.accents) { if (pack.has(String(a).toLowerCase())) break; out.push(a); }
  return out;
}

// The Bright Life palette — an optimistic, bright-on-white set. deriveTheme resolves the
// pack (Space Grotesk display face, @font-face). With a BRAND SKIN, the palette hue-rotates
// to the brand (clamped to its authored bright luminances — see reHue); with none, the
// frozen palette below stands byte-for-byte (the no-op law).
const PALETTE0 = ["#6366F1", "#8B5CF6", "#3B82F6", "#06B6D4", "#EC4899", "#F43F5E", "#10B981", "#22C55E", "#F59E0B", "#A855F7"];
const ACCENTS0 = ["#6366F1", "#8B5CF6", "#06B6D4", "#EC4899"];
const EMPH0 = ["#6366F1", "#8B5CF6", "#A855F7"];
// #10B981 / #22C55E are POSITIVE-GROWTH semantics (KPI deltas, kanban "done") — like a
// departures board's ON-TIME green, they read as "success" and never recolour to the brand.
const GREEN_LOCK = new Set([6, 7]);
// Fan the palette around the brand lead hue so it stays multi-tonal (brand-dominant, not
// 10 flat shades), all inside brand_kit's 40° "still reads as its own hue" budget.
const BRIGHT_FAN = [0, 22, -22, 40, -40, 14, -14, 33];

function brightTheme(framePack, sb, brandSkin) {
  const base = deriveTheme(framePack, sb);
  const MONO = "JetBrains Mono";
  const monoFace = isBundled(MONO) ? fontFaceCss(MONO) : "";
  const monoStack = monoFace ? `'${MONO}', ui-monospace, monospace` : "ui-monospace, 'JetBrains Mono', monospace";
  const displayBundled = base.displayStack && /Space Grotesk/.test(base.displayStack);
  const displayStack = `${displayBundled ? "'Space Grotesk', " : ""}${SAFE_FONTS}`;

  // Resolve the brand against the WHITE ground (the inverse of flagship's near-black case:
  // a bright brand hue that would wash out on white is exactly what resolveBrand corrects).
  // FAIL-OPEN: any hiccup renders the frozen palette.
  let applied = false, PALETTE = PALETTE0, accents = ACCENTS0, emph = EMPH0, brand = null, brandLed = [];
  // ATMOSPHERE (D2): the pack's brand contract, so a mode:"atmosphere" pack lets a brand
  // faintly tint the near-white SECONDARY surfaces. The pure-white base stays white — that
  // luminance IS the pack. No contract / accents-mode → brand.atmosphere is null → no-op.
  const contract = (() => { try { const m = require("./frame_manifest").getManifest(framePack); return m && m.brand; } catch { return null; } })();
  try {
    brand = resolveBrand(brandSkin, { ground: "#FFFFFF", isDark: false, packAccents: ACCENTS0, contract });
    brandLed = brandLedOf(brand, ACCENTS0);
    applied = !!(brand && brand.applied && brandLed.length);
  } catch { applied = false; }
  if (applied) {
    const wheel = brandLed.map(hueOf);
    for (const d of BRIGHT_FAN) { if (wheel.length >= PALETTE0.length) break; wheel.push(wheel[0] + d); }
    PALETTE = PALETTE0.map((h, i) => GREEN_LOCK.has(i) ? h : reHue(h, wheel[i % wheel.length]));
    accents = ACCENTS0.map((h, i) => reHue(h, wheel[i % wheel.length]));
    // The emphasis word is a same-family 3-stop gradient on WHITE — reHue keeps each stop's
    // authored (readable) luminance, so it lands as a brand-hued gradient that still reads.
    const eh = hueOf(brandLed[0]);
    emph = [reHue(EMPH0[0], eh), reHue(EMPH0[1], eh + 9), reHue(EMPH0[2], eh + 20)];
  }
  // The generated-UI chrome tint (hairlines / card borders / soft shadow / progress bar).
  // "99,102,241" is the frozen indigo, so a null skin reproduces every literal byte-for-byte.
  const uiRgb = applied ? hexToRgb(accents[0]).join(",") : "99,102,241";

  return {
    ground: atmosphericGround("#FFFFFF", brand && brand.atmosphere), ground2: atmosphericGround("#F5F6FF", brand && brand.atmosphere),
    ink: "#111827", dim: "#6B7280", faint: "#9AA3B2",
    border: `rgba(${uiRgb},0.12)`,
    cardShadow: `0 20px 60px rgba(${uiRgb},0.14), 0 6px 18px rgba(17,24,39,0.05)`,
    uiRgb,
    palette: PALETTE,
    accents, accent: accents[0], accent2: accents[1], accent3: accents[2], accent4: accents[3],
    // Indigo -> violet -> purple (or the brand's own family) for the highlighted word.
    emphA: emph[0], emphB: emph[1], emphC: emph[2],
    // Carried out for the disclosure (resolvedSkin below). null unless a brand applied.
    brand, brandLed, applied,
    displayStack,
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

// A short supporting "chip" trio — designed secondary detail (never a lone headline
// in a void). Derived from copy, backfilled by treatment.
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
  // Short-side type scale (portrait no longer ~2.7x-oversized); px clamped to the width.
  const sc = typeScale(W, H);
  const heroBase = land ? 148 : 100, ctaBase = land ? 118 : 88, intBase = land ? 90 : 66;
  const baseBig = (isHero ? heroBase : isCta ? ctaBase : intBase) * sc;
  const big = Math.min(Math.round(baseBig * measure), Math.round(W * (port ? 0.13 : 0.42)));
  const kicker = (treatment === "hook" ? (title || scene.emphasis) : scene.emphasis || (title || "")) || "";
  const metric = treatment === "benefits" ? parseMetric(scene.emphasis || scene.headline || scene.subtext) : null;
  const chips = chipsFor(scene, treatment);

  const safe = safeArea(W, H);
  const align = centered ? "center" : "flex-start";
  // Portrait/square: interior scenes are a TOP-anchored centered vertical stack; hook/cta
  // stay vertically centered. Landscape keeps the lower-left text split.
  const justify = port ? ((isHero || isCta) ? "center" : "flex-start") : (centered ? "center" : "flex-end");
  const padTop = Math.round(safe.top * 100), padBot = Math.round(safe.bottom * 100), padSide = Math.round(safe.side * 100);
  const pad = port ? `${padTop}% ${padSide}% ${padBot}%` : centered ? "0 9%" : "0 7% 9%";
  const textAlign = centered ? "center" : "left";
  const maxw = headlineCh(W, H, centered);

  const parts = [];
  parts.push(`<div id="${id}" class="ktxt clip" data-start="${T}" data-duration="${L}" data-track-index="${20 + i}" data-layout-allow-occlusion style="opacity:0;align-items:${align};justify-content:${justify};padding:${pad};text-align:${textAlign};">`);
  // A SOFT WHITE scrim (not dark) guarantees legibility where a headline crosses an
  // orb or gradient blob, without darkening the bright ground.
  const scrimAt = centered ? "50% 50%" : "24% 74%";
  parts.push(`  <div class="kscrim" style="background:radial-gradient(60% 52% at ${scrimAt}, rgba(255,255,255,0.86), rgba(255,255,255,0.55) 46%, transparent 76%);"></div>`);
  if (!centered) parts.push(`  <span id="${id}w" class="kwall" style="left:4%;">${String(i + 1).padStart(2, "0")}</span>`);
  parts.push(`  <div class="kstack">`);
  if (kicker) parts.push(`    <span id="${id}k" class="kkick">${esc(kicker)}</span>`);
  if (metric) {
    parts.push(`    <div id="${id}m" class="kmetric" data-target="${metric.target}" data-dec="${metric.decimals}">${metric.prefix ? `<span class="kmpre">${esc(metric.prefix)}</span>` : ""}<span class="kmnum">0</span><span class="kmsuf">${esc(metric.suffix)}</span></div>`);
    if (scene.headline) parts.push(`    <h2 class="kmlabel">${esc(scene.headline)}</h2>`);
  } else {
    parts.push(`    <h1 id="${id}h" class="khead" style="font-size:${big}px;max-width:${maxw};">${headlineSpans(scene.headline, scene.emphasis)}</h1>`);
  }
  if (scene.subtext && !metric && treatment !== "cta") parts.push(`    <p id="${id}s" class="ksub" style="font-size:${Math.round(big * 0.24)}px;">${esc(scene.subtext)}</p>`);
  // CTA: a glass gradient button + website line + social dots.
  if (treatment === "cta") {
    const site = String(scene.subtext || "").trim();
    parts.push(`    <div id="${id}b" class="kbtnrow"><span class="kbtn">Get Started</span><span class="kbtn ghost">Watch demo</span></div>`);
    if (site) parts.push(`    <div id="${id}u" class="kmeta"><span class="kdot"></span>${esc(site)}</div>`);
    parts.push(`    <div id="${id}soc" class="ksoc"><i></i><i></i><i></i></div>`);
  } else if (treatment !== "hook") {
    const chipHtml = chips.map((c, ci) => `<span class="kchip" data-ci="${ci}"><i></i>${esc(c)}</span>`).join("");
    parts.push(`    <div id="${id}c" class="kchips">${chipHtml}</div>`);
  }
  parts.push(`  </div>`);
  parts.push(`</div>`);

  const s = [];
  s.push(`tl.set("#${id}",{opacity:1},${T});`);
  if (!centered) s.push(`tl.fromTo("#${id}w",{opacity:0,scale:1.16,filter:"blur(6px)"},{opacity:0.055,scale:1,filter:"blur(0px)",duration:1.0,ease:"expo.out"},${r2(T + 0.1)});`);
  if (kicker) s.push(`tl.fromTo("#${id}k",{opacity:0,y:16},{opacity:1,y:0,duration:0.5,ease:"expo.out"},${r2(T + 0.18)});`);
  if (metric) {
    s.push(`tl.fromTo("#${id}m",{opacity:0,y:28,filter:"blur(10px)"},{opacity:1,y:0,filter:"blur(0px)",duration:0.7,ease:"expo.out"},${r2(T + 0.3)});`);
    s.push(`{const el=document.querySelector("#${id}m .kmnum");const o={v:0};tl.to(o,{v:${metric.target},duration:1.35,ease:"power2.out",onUpdate:()=>{el.textContent=o.v.toFixed(${metric.decimals});}},${r2(T + 0.4)});}`);
    s.push(`tl.fromTo("#${id} .kmlabel",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"expo.out"},${r2(T + 0.85)});`);
  } else {
    // Varied kinetic entrance per index (mask-rise / lift / blur-in) — no two
    // adjacent headlines animate identically.
    const mode = i % 3;
    if (mode === 0) s.push(`tl.fromTo("#${id} .kwi",{yPercent:118},{yPercent:0,duration:0.72,stagger:0.07,ease:"expo.out"},${r2(T + 0.26)});`);
    else if (mode === 1) s.push(`tl.fromTo("#${id} .kw",{opacity:0,y:34,rotationX:-40,transformOrigin:"50% 100%"},{opacity:1,y:0,rotationX:0,duration:0.8,stagger:0.08,ease:"expo.out"},${r2(T + 0.26)});`);
    else s.push(`tl.fromTo("#${id} .kwi",{yPercent:118,filter:"blur(12px)"},{yPercent:0,filter:"blur(0px)",duration:0.78,stagger:0.06,ease:"expo.out"},${r2(T + 0.26)});`);
  }
  if (scene.subtext && !metric && treatment !== "cta") s.push(`tl.fromTo("#${id}s",{opacity:0,y:16},{opacity:1,y:0,duration:0.5,ease:"expo.out"},${r2(T + 0.9)});`);
  if (treatment === "cta") {
    s.push(`tl.fromTo("#${id}b .kbtn",{opacity:0,y:20,scale:0.92},{opacity:1,y:0,scale:1,duration:0.5,stagger:0.1,ease:"back.out(1.5)"},${r2(T + 0.7)});`);
    s.push(`tl.fromTo("#${id}u",{opacity:0,y:12},{opacity:1,y:0,duration:0.5,ease:"expo.out"},${r2(T + 1.0)});`);
    s.push(`tl.fromTo("#${id}soc i",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:0.4,stagger:0.08,ease:"back.out(2)"},${r2(T + 1.1)});`);
  } else if (treatment !== "hook") {
    s.push(`tl.fromTo("#${id}c .kchip",{opacity:0,y:14,scale:0.94},{opacity:1,y:0,scale:1,duration:0.44,stagger:0.09,ease:"back.out(1.7)"},${r2(T + (metric ? 1.05 : 1.0))});`);
  }
  if (treatment !== "cta") {
    s.push(`tl.to("#${id}",{opacity:0,duration:0.42,ease:"power2.in"},${r2(T + L - 0.42)});`);
    s.push(`tl.set("#${id}",{opacity:0},${r2(T + L)});`);
  }
  return { html: parts.join("\n"), script: s.join("\n") };
}

// ---- the Three.js module (deterministic; camera rig + depth + glass cards) ----
function threeModule({ theme, dims, D, seed, sceneWindows, plates }) {
  const W = dims.width, H = dims.height;
  const A = theme.accents.map(hexInt);
  const PAL = theme.palette.map(hexInt);
  const ground = hexInt(theme.ground);
  // Pastel (white-lightened) accents for the airy background wash.
  const pastel = theme.accents.slice(0, 3).map((h) => hexToRgb(lighten(h, 0.55)).map((v) => (v / 255).toFixed(4)));
  // Softened (white-lifted) accent rgb for the hero blob's gradient — pastel, not candy.
  const gcol = theme.accents.slice(0, 3).map((h) => hexToRgb(lighten(h, 0.46)).map((v) => (v / 255).toFixed(4)));
  // Wave-band gradient: all 4 accents white-lifted → a pastel 4-stop (indigo/violet/cyan/pink) ramp.
  const wcol = theme.accents.map((h) => hexToRgb(lighten(h, 0.42)).map((v) => (v / 255).toFixed(4)));
  // Softened accent ints for the glass shapes — a gentle tint, never a saturated block.
  const softAcc = theme.accents.map((h) => hexInt(lighten(h, 0.44)));
  // Pastel-shifted palette for the background orbs so no orb reads as a hot ball.
  const softPal = theme.palette.map((h) => hexInt(lighten(h, 0.36)));
  const uiPalette = { ink: theme.ink, dim: theme.dim, ground: theme.ground, ground2: theme.ground2, border: theme.border, accents: theme.accents, palette: theme.palette };
  return `
import * as THREE from 'three';

const W=${W},H=${H},D=${D};
const A=[${A.map((c) => "0x" + c.toString(16)).join(",")}];
const PAL=[${PAL.map((c) => "0x" + c.toString(16)).join(",")}];
const SOFT=[${softAcc.map((c) => "0x" + c.toString(16)).join(",")}];
const SOFTPAL=[${softPal.map((c) => "0x" + c.toString(16)).join(",")}];
const PLATES=${JSON.stringify(plates)};
const UIP=${JSON.stringify(uiPalette)};
let __s=${seed}>>>0; function rand(){__s|=0;__s=(__s+0x6D2B79F5)|0;let t=Math.imul(__s^(__s>>>15),1|__s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;}
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
// easeInOutExpo — the signature Bright Life easing for camera + reveals.
const expoInOut=(x)=>{ if(x<=0)return 0; if(x>=1)return 1; return x<0.5 ? Math.pow(2,20*x-10)/2 : (2-Math.pow(2,-20*x+10))/2; };
const lerp=(a,b,t)=>a+(b-a)*t;
function land(){return W>H;}            // STRICT — square (W===H) is NOT landscape
const SQUARE=Math.abs(W-H)<W*0.1;
const PORT=!land();                       // portrait OR square → narrow frame
const WSCALE=land()?1:(SQUARE?0.74:0.6);  // shrink world card width for the narrow hFOV
const FOV=land()?42:(SQUARE?50:60);       // widen vertical FOV so content fits the narrow frame

const cv=document.getElementById("kfcanvas");
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:false});
renderer.setSize(W,H,false); renderer.setClearColor(${ground},1);
renderer.toneMapping=THREE.NoToneMapping;
if("outputColorSpace" in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene(); scene.fog=new THREE.Fog(${ground},22,58);
const cam=new THREE.PerspectiveCamera(FOV,W/H,0.1,140);

// ---- lighting (bright, soft) ----
scene.add(new THREE.AmbientLight(0xffffff,0.92));
const key=new THREE.DirectionalLight(0xffffff,0.7); key.position.set(4,6,8); scene.add(key);
const fill=new THREE.DirectionalLight(0xdfe4ff,0.4); fill.position.set(-6,-2,4); scene.add(fill);
const tintA=new THREE.PointLight(A[0],0.6,60); tintA.position.set(-8,4,6); scene.add(tintA);
const tintB=new THREE.PointLight(A[3],0.5,60); tintB.position.set(8,-3,5); scene.add(tintB);

// ---- background: drifting PASTEL mesh-gradient plane (airy, never dark) ----
const AUR_FRAG=\`
uniform float uTime; varying vec2 vUv;
const vec3 CA=vec3(${pastel[0].join(",")});
const vec3 CB=vec3(${(pastel[1] || pastel[0]).join(",")});
const vec3 CC=vec3(${(pastel[2] || pastel[0]).join(",")});
float blob(vec2 uv,vec2 c,float r){return smoothstep(r,0.0,distance(uv,c));}
void main(){
  vec2 uv=vUv;
  vec2 pA=vec2(0.26+sin(uTime*0.13)*0.12,0.70+cos(uTime*0.10)*0.10);
  vec2 pB=vec2(0.78+cos(uTime*0.09)*0.12,0.30+sin(uTime*0.15)*0.11);
  vec2 pC=vec2(0.52+sin(uTime*0.08+2.0)*0.16,0.52+cos(uTime*0.11+1.0)*0.12);
  vec3 col=vec3(1.0);
  col=mix(col,CA,blob(uv,pA,0.58)*0.55);
  col=mix(col,CC,blob(uv,pC,0.66)*0.42);
  col=mix(col,CB,blob(uv,pB,0.54)*0.50);
  // keep it luminous — a whisper of extra light toward the centre
  float d=distance(uv,vec2(0.5)); col=mix(col,vec3(1.0),(1.0-smoothstep(0.0,0.9,d))*0.10);
  gl_FragColor=vec4(col,1.0);
}\`;
const AUR_VERT="varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}";
const aurMat=new THREE.ShaderMaterial({vertexShader:AUR_VERT,fragmentShader:AUR_FRAG,uniforms:{uTime:{value:0}},depthWrite:false,fog:false});
const aurora=new THREE.Mesh(new THREE.PlaneGeometry(200,120),aurMat); aurora.position.z=-40; scene.add(aurora);

// ---- GRADIENT DATA WAVES (flowing matte mesh-gradient ribbons; AI/data intelligence) ----
// 3 stacked wave surfaces (hero + 2 softer echoes) in the far upper-left. A travelling
// sum-of-sines vertex ripple (pure fn of uTime) + a matte 4-stop gradient fragment with a
// flowing "data stream" highlight. Draws on L→R on the hook; leads (amp+flow up) on solution.
const WAVE_VS=\`
uniform float uTime,uAmp,uFlow,uRise,uPhase,uFreq,uReveal;
varying vec2 vUv; varying float vH; varying float vRev;
void main(){
  vUv=uv; vec3 p=position; float x=p.x, y=p.y;
  float tf=uTime*uFlow+uPhase; float h=0.0;
  h+=sin(x*0.55*uFreq + tf*0.9)*0.60;
  h+=sin(x*0.90*uFreq - tf*1.3 + y*0.7)*0.34;
  h+=sin(x*1.70*uFreq + tf*1.8 + y*1.1)*0.16;
  h+=sin((x*0.40+y*0.90) - tf*0.6)*0.22;
  float rev=clamp((uReveal - vUv.x)*4.5 + 1.0, 0.0, 1.0);
  h*=uAmp*rev; p.z += h; p.y += uRise * vUv.x;
  vH=h; vRev=rev;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
}\`;
const WAVE_FS=\`
precision highp float;
uniform float uTime,uFlow,uOpa;
varying vec2 vUv; varying float vH; varying float vRev;
const vec3 WA=vec3(${wcol[0].join(",")});
const vec3 WB=vec3(${wcol[1].join(",")});
const vec3 WC=vec3(${wcol[2].join(",")});
const vec3 WD=vec3(${wcol[3].join(",")});
float hsh(vec2 q){return fract(sin(dot(q,vec2(41.3,289.1)))*43758.5453);}
void main(){
  float u=vUv.x;
  vec3 col=mix(WA,WB,smoothstep(0.0,0.40,u));
  col=mix(col,WC,smoothstep(0.34,0.72,u));
  col=mix(col,WD,smoothstep(0.68,1.0,u));
  float crest=clamp(vH*0.55+0.5,0.0,1.0);
  col=mix(col,vec3(1.0),crest*0.30);
  float stream=sin(vUv.x*40.0 - uTime*uFlow*2.4 + vH*2.5);
  col=mix(col,vec3(1.0),smoothstep(0.90,1.0,stream)*0.18);
  col+=(hsh(floor(vUv*vec2(240.0,90.0)))-0.5)*0.012;
  float ea=smoothstep(0.0,0.14,vUv.y)*smoothstep(1.0,0.86,vUv.y);
  float ex=smoothstep(0.0,0.08,vUv.x)*smoothstep(1.0,0.92,vUv.x);
  gl_FragColor=vec4(col, ea*ex*vRev*uOpa*0.54);
}\`;
const waves=[]; const waveGroup=new THREE.Group();
waveGroup.position.set(land()?-2.0:-1.0, 3.6, -15.5);
waveGroup.rotation.set(-0.42, 0.22, 0.14); scene.add(waveGroup);
const WLAYERS=[
  {seg:[160,44],size:[46,13],z:0.0, y:0.0,op:1.00,amp:1.00,freq:1.00},
  {seg:[110,26],size:[50,15],z:-2.4,y:0.4,op:0.55,amp:0.80,freq:0.78},
  {seg:[90,20], size:[54,17],z:-4.6,y:0.8,op:0.34,amp:0.66,freq:1.35},
];
for(let i=0;i<WLAYERS.length;i++){ const L=WLAYERS[i];
  const mat=new THREE.ShaderMaterial({vertexShader:WAVE_VS,fragmentShader:WAVE_FS,
    transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,fog:false,
    uniforms:{uTime:{value:0},uAmp:{value:L.amp},uFlow:{value:1.0},uRise:{value:0.0},
      uPhase:{value:rand()*6.2832},uFreq:{value:L.freq},uReveal:{value:1.0},uOpa:{value:L.op}}});
  const m=new THREE.Mesh(new THREE.PlaneGeometry(L.size[0],L.size[1],L.seg[0],L.seg[1]),mat);
  m.position.set(0,L.y,L.z); m.renderOrder=-5+i; waveGroup.add(m);
  waves.push({mat, base:{amp:L.amp, op:L.op}});
}

// ---- soft radial ORB texture (the Gaussian-blur gradient orb look) ----
function orbTex(hex){
  const s=256, c=document.createElement("canvas"); c.width=c.height=s; const x=c.getContext("2d");
  const col="#"+("000000"+hex.toString(16)).slice(-6);
  const g=x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0,col+"E6"); g.addColorStop(0.45,col+"66"); g.addColorStop(1,col+"00");
  x.fillStyle=g; x.beginPath(); x.arc(s/2,s/2,s/2,0,6.2832); x.fill();
  const t=new THREE.CanvasTexture(c); if("SRGBColorSpace" in THREE)t.colorSpace=THREE.SRGBColorSpace; return t;
}
const orbTexCache={}; const getOrb=(hex)=>orbTexCache[hex]||(orbTexCache[hex]=orbTex(hex));

// ---- floating gradient ORBS (soft blurred, drift + parallax) ----
const orbs=[];
for(let i=0;i<10;i++){
  const hex=SOFTPAL[Math.floor(rand()*SOFTPAL.length)];
  const m=new THREE.SpriteMaterial({map:getOrb(hex),transparent:true,opacity:0.20+rand()*0.24,depthWrite:false,depthTest:false});
  const sp=new THREE.Sprite(m); const sz=3.5+rand()*6.5; sp.scale.set(sz,sz,1);
  sp.position.set((rand()-0.5)*34,(rand()-0.5)*20,-14-rand()*14);
  sp.userData={ph:rand()*6.28,sp:0.05+rand()*0.10,ax:0.6+rand()*1.2,ay:0.5+rand()*1.0,bx:sp.position.x,by:sp.position.y};
  orbs.push(sp); scene.add(sp);
}

// ---- MATTE GRADIENT BLOB FAMILY (hero + 2 satellites; morphing, matte — NOT glass) ----
// Evolved from the old hero-blob shader: sum-of-sines vertex warp (pure fn of uTime),
// a matte mesh-gradient fragment (uniform colors) with soft diffuse shading + tiny grain
// + a whisper of fresnel — NO transmission, NO env reflections. The always-on sculpture.
const GC=[[${gcol[0].join(",")}],[${gcol[1].join(",")}],[${gcol[2].join(",")}]];
const BLOB_COLS=[[GC[0],GC[1],GC[2]],[GC[1],GC[2],GC[0]],[GC[2],GC[0],GC[1]]];
const BLOB_VERT=\`
uniform float uTime; uniform float uWarp;
varying vec3 vPos; varying vec3 vN; varying vec3 vView;
void main(){ vPos=position; vec3 p=position; float d=0.0;
  d+=sin(p.x*1.9+uTime*0.55)*0.13; d+=sin(p.y*2.2+uTime*0.48)*0.11;
  d+=sin(p.z*2.05+uTime*0.66)*0.12; d+=sin((p.x+p.z)*1.5+uTime*0.37)*0.08;
  d+=sin((p.y-p.x)*1.7+uTime*0.43)*0.07; d*=uWarp;
  vec3 np=position+normal*d; vec4 mv=modelViewMatrix*vec4(np,1.0);
  vView=-mv.xyz; vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*mv; }\`;
const BLOB_FRAG=\`
precision highp float;
uniform vec3 uCA; uniform vec3 uCB; uniform vec3 uCC;
uniform float uTime; uniform float uFlow; uniform float uAlpha;
varying vec3 vPos; varying vec3 vN; varying vec3 vView;
float hash(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453); }
void main(){
  float ang=uTime*0.06*uFlow; vec2 dir=vec2(cos(ang),sin(ang));
  float t=clamp(dot(vec2(vPos.x,vPos.y),dir)*0.42+0.5,0.0,1.0);
  vec3 col=mix(uCA,uCB,smoothstep(0.0,0.60,t)); col=mix(col,uCC,smoothstep(0.55,1.0,t));
  col=mix(col,vec3(1.0),0.14);
  vec3 nn=normalize(vN); float shade=0.5+0.5*dot(nn,normalize(vec3(0.35,0.8,0.55)));
  col*=mix(0.80,1.06,shade);
  float fres=pow(1.0-max(dot(nn,normalize(vView)),0.0),2.6); col=mix(col,vec3(1.0),fres*0.40);
  col+=(hash(floor(vPos*90.0))-0.5)*0.028;
  gl_FragColor=vec4(col,uAlpha);
}\`;
const blobsGroup=new THREE.Group(); scene.add(blobsGroup); const BLOBS=[];
function makeBlob(o){ const c=o.cols;
  const mat=new THREE.ShaderMaterial({vertexShader:BLOB_VERT,fragmentShader:BLOB_FRAG,
    uniforms:{uTime:{value:0},uWarp:{value:o.warp},uFlow:{value:o.flow},uAlpha:{value:o.alpha},
      uCA:{value:new THREE.Color(c[0][0],c[0][1],c[0][2])},
      uCB:{value:new THREE.Color(c[1][0],c[1][1],c[1][2])},
      uCC:{value:new THREE.Color(c[2][0],c[2][1],c[2][2])}},
    transparent:true, depthWrite:o.alpha>0.92});
  const m=new THREE.Mesh(new THREE.IcosahedronGeometry(o.r,o.detail),mat);
  m.position.set(o.pos[0],o.pos[1],o.pos[2]);
  m.userData={hero:!!o.hero,bx:o.pos[0],by:o.pos[1],bz:o.pos[2],
    cx:o.conv[0],cy:o.conv[1],cz:o.conv[2],spin:o.spin,ph:rand()*6.28,dr:o.dr,fa:o.fa,warp:o.warp,mat};
  blobsGroup.add(m); BLOBS.push(m); return m; }
const HX=land()?-6.6:-3.4, HY=2.7, HZ=-3.2;
makeBlob({hero:true,cols:BLOB_COLS[0],pos:[HX,HY,HZ],conv:[land()?-4.2:-2.2,2.3,HZ],
  r:1.55,detail:5,warp:1.0,flow:1.0,alpha:0.96,spin:[0.015,0.05,0.0],dr:0.34,fa:0.10});
makeBlob({cols:BLOB_COLS[1],pos:[land()?7.6:3.6,3.0,-10.5],conv:[land()?-2.0:-1.0,2.6,-3.8],
  r:0.85,detail:4,warp:0.85,flow:-0.8,alpha:0.70,spin:[0.05,0.07,0.02],dr:0.26,fa:0.13});
makeBlob({cols:BLOB_COLS[2],pos:[land()?1.8:0.9,-3.4,-9.2],conv:[land()?-3.0:-1.6,0.9,-3.6],
  r:1.05,detail:4,warp:1.15,flow:0.9,alpha:0.74,spin:[0.04,0.06,0.03],dr:0.30,fa:0.12});
const shapes=new THREE.Group(); scene.add(shapes);   // kept (legacy spin group; now empty → no-op)

// ---- MOTION GEOMETRY SYSTEM (orbiting nodes + gradient arcs + connecting links) ----
// A far-field constellation up-right that ASSEMBLES on features and CONVERGES on the CTA.
// Arcs = gradient TorusGeometry (draw-on via uDraw); nodes = matte MeshStandard on orbits;
// links = per-frame-rebuilt gradient lines. Replaces the two old rings as the structure layer.
const geo=new THREE.Group();
geo.position.set(land()?3.4:0.4, 2.0, -11.5); geo.rotation.x=-0.42; geo.rotation.z=0.12; scene.add(geo);
const ARC_VERT="varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }";
const ARC_FRAG="precision highp float; varying vec2 vUv; uniform float uDraw; uniform float uOpacity; uniform float uShift; const vec3 CA=vec3(${gcol[0].join(",")}); const vec3 CB=vec3(${gcol[1].join(",")}); const vec3 CC=vec3(${gcol[2].join(",")}); void main(){ float g=fract(vUv.x+uShift); vec3 col=mix(CA,CB,smoothstep(0.0,0.5,g)); col=mix(col,CC,smoothstep(0.5,1.0,g)); col=mix(col,vec3(1.0),0.14); float edge=smoothstep(uDraw,uDraw-0.05,vUv.x); float a=uOpacity*edge; if(a<0.01) discard; gl_FragColor=vec4(col,a); }";
const geoArcs=[]; const ARCR=[2.55,3.5,4.45];
for(let i=0;i<3;i++){ const span=(0.72+rand()*0.5)*Math.PI;
  const g2=new THREE.TorusGeometry(ARCR[i],0.05+0.009*(2-i),8,150,span);
  const m2=new THREE.ShaderMaterial({vertexShader:ARC_VERT,fragmentShader:ARC_FRAG,uniforms:{uDraw:{value:1},uOpacity:{value:0.5},uShift:{value:0}},transparent:true,depthWrite:false,fog:false});
  const arc=new THREE.Mesh(g2,m2); arc.userData={base:rand()*6.28,sp:(0.05+0.03*i)*(i%2?-1:1),op:0.52+0.12*(2-i)};
  arc.rotation.z=arc.userData.base; geoArcs.push(arc); geo.add(arc); }
const nodeGeo=new THREE.IcosahedronGeometry(1,2); const geoNodes=[]; const RINGN=[4,5,4];
for(let ri=0;ri<3;ri++){ const dir=ri%2?-1:1, sp=(0.06+0.028*ri)*dir;
  for(let j=0;j<RINGN[ri];j++){ const col=SOFT[(ri+j)%SOFT.length];
    const mat=new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:0.22,roughness:0.6,metalness:0.05,transparent:true,opacity:0.92});
    const nd=new THREE.Mesh(nodeGeo,mat); const size=(0.12+rand()*0.07)*(ri===0?1.15:1.0);
    nd.userData={R:ARCR[ri],ang0:(j/RINGN[ri])*6.283+rand()*0.5,sp,dir,size,ph:rand()*6.28,op:0.9};
    nd.scale.setScalar(size); geoNodes.push(nd); geo.add(nd); } }
const core=new THREE.Mesh(nodeGeo,new THREE.MeshStandardMaterial({color:SOFT[0],emissive:A[1],emissiveIntensity:0.18,roughness:0.5,metalness:0.05,transparent:true,opacity:0}));
core.scale.setScalar(0.001); geo.add(core);
const LNK_VERT="attribute float aLocal; attribute float aSeg; varying float vL; varying float vS; void main(){ vL=aLocal; vS=aSeg; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }";
const LNK_FRAG="precision highp float; varying float vL; varying float vS; uniform float uDraw; uniform float uOpacity; const vec3 CA=vec3(${gcol[0].join(",")}); const vec3 CC=vec3(${gcol[2].join(",")}); void main(){ vec3 col=mix(CA,CC,vL); col=mix(col,vec3(1.0),0.10); float edge=smoothstep(uDraw,uDraw-0.06,vS); float a=uOpacity*edge; if(a<0.01) discard; gl_FragColor=vec4(col,a); }";
const linkMat=new THREE.ShaderMaterial({vertexShader:LNK_VERT,fragmentShader:LNK_FRAG,uniforms:{uDraw:{value:1},uOpacity:{value:0.4}},transparent:true,depthWrite:false,fog:false});
const geoLinks=[];
function addLink(a,b,off){ const seg=26, pos=new Float32Array((seg+1)*3), loc=new Float32Array(seg+1), sgv=new Float32Array(seg+1);
  const spanp=1-off; for(let s=0;s<=seg;s++){const tt=s/seg; loc[s]=tt; sgv[s]=off+tt*spanp;}
  const bg=new THREE.BufferGeometry();
  bg.setAttribute("position",new THREE.BufferAttribute(pos,3));
  bg.setAttribute("aLocal",new THREE.BufferAttribute(loc,1));
  bg.setAttribute("aSeg",new THREE.BufferAttribute(sgv,1));
  const ln=new THREE.Line(bg,linkMat); ln.userData={a,b,seg,bow:(rand()-0.5)*0.7,off}; geoLinks.push(ln); geo.add(ln); }
const ringStart=[0,RINGN[0],RINGN[0]+RINGN[1]];
for(let ri=0;ri<3;ri++){const n=RINGN[ri],s0=ringStart[ri];for(let j=0;j<n;j++){addLink(geoNodes[s0+j],geoNodes[s0+((j+1)%n)],rand()*0.35);}}
for(let k=0;k<4;k++){const a=geoNodes[Math.floor(rand()*geoNodes.length)],b=geoNodes[Math.floor(rand()*geoNodes.length)];if(a!==b)addLink(a,b,0.15+rand()*0.5);}

// ---- colored PARTICLE field (soft dots) ----
const dotTexC=(()=>{const s=64,c=document.createElement("canvas");c.width=c.height=s;const x=c.getContext("2d");const g=x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);g.addColorStop(0,"#ffffffff");g.addColorStop(0.5,"#ffffff88");g.addColorStop(1,"#ffffff00");x.fillStyle=g;x.beginPath();x.arc(s/2,s/2,s/2,0,6.2832);x.fill();const t=new THREE.CanvasTexture(c);return t;})();
const N=140, PP=new Float32Array(N*3), PC=new Float32Array(N*3);
for(let i=0;i<N;i++){PP[i*3]=(rand()-0.5)*36;PP[i*3+1]=(rand()-0.5)*22;PP[i*3+2]=-2+rand()*10;const c=new THREE.Color(PAL[i%PAL.length]);PC[i*3]=c.r;PC[i*3+1]=c.g;PC[i*3+2]=c.b;}
const pg=new THREE.BufferGeometry(); pg.setAttribute("position",new THREE.BufferAttribute(PP,3)); pg.setAttribute("color",new THREE.BufferAttribute(PC,3));
const dots=new THREE.Points(pg,new THREE.PointsMaterial({size:0.16,map:dotTexC,vertexColors:true,transparent:true,opacity:0.55,depthWrite:false})); scene.add(dots);

// ---- DYNAMIC GRAPH LINE (draw-on rising curve + area + data dots; growth/benefits) ----
// The ONE crisp saturated accent line (indigo→violet→cyan, pink terminal). A TubeGeometry
// drawn on via setDrawRange from scene-local progress, a low-alpha pastel area fill, and
// pulsing data points. Hidden except the BENEFITS scene, where numbers go up.
const graph=new THREE.Group();
const GBX=land()?1.2:-0.2, GBY=land()?-1.7:-3.2; graph.position.set(GBX,GBY,-5.5); scene.add(graph);
const GN=8, GSPAN=land()?9.2:6.4, GRISE=land()?4.4:3.6; const gPts=[]; let gClimb=0;
for(let i=0;i<GN;i++){ const tx=i/(GN-1); const base=Math.pow(tx,0.85);
  const wob=(i>0&&i<GN-1)?(rand()-0.5)*0.14:0; gClimb=Math.max(gClimb,base+wob);
  gPts.push(new THREE.Vector3((tx-0.5)*GSPAN,(gClimb-0.5)*GRISE,Math.sin(tx*3.0)*0.25)); }
const gCurve=new THREE.CatmullRomCurve3(gPts,false,"catmullrom",0.4);
const G_SEG=240, G_RADSEG=10, G_RING=G_RADSEG*6;
const G_A=new THREE.Color(A[0]), G_B=new THREE.Color(A[1]), G_C=new THREE.Color(A[2]);
const gTubeGeo=new THREE.TubeGeometry(gCurve,G_SEG,land()?0.055:0.05,G_RADSEG,false); gTubeGeo.setDrawRange(0,0);
const gTubeMat=new THREE.ShaderMaterial({uniforms:{uProg:{value:0},cA:{value:G_A},cB:{value:G_B},cC:{value:G_C}},
  vertexShader:\`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }\`,
  fragmentShader:\`precision highp float; uniform float uProg; uniform vec3 cA; uniform vec3 cB; uniform vec3 cC; varying vec2 vUv;
  void main(){ float x=vUv.x; vec3 col=mix(cA,cB,smoothstep(0.0,0.6,x)); col=mix(col,cC,smoothstep(0.55,1.0,x));
  float sheen=smoothstep(0.5,1.0,vUv.y); col=mix(col,vec3(1.0),sheen*0.28);
  float head=smoothstep(uProg-0.05,uProg,x)*step(x,uProg); col=mix(col,vec3(1.0),head*0.6);
  gl_FragColor=vec4(col,1.0); }\`});
const gTube=new THREE.Mesh(gTubeGeo,gTubeMat); gTube.renderOrder=3; graph.add(gTube);
const gBaseY=-(GRISE*0.5)-0.15; const aPos=[],aUv=[],aIdx=[],G_AREA=Math.floor(G_SEG*0.5);
for(let i=0;i<=G_AREA;i++){ const u=i/G_AREA, p=gCurve.getPoint(u); aPos.push(p.x,p.y,p.z); aUv.push(u,1); aPos.push(p.x,gBaseY,p.z); aUv.push(u,0); }
for(let i=0;i<G_AREA;i++){ const a=i*2; aIdx.push(a,a+1,a+2, a+1,a+3,a+2); }
const gAreaGeo=new THREE.BufferGeometry();
gAreaGeo.setAttribute("position",new THREE.Float32BufferAttribute(aPos,3));
gAreaGeo.setAttribute("uv",new THREE.Float32BufferAttribute(aUv,2)); gAreaGeo.setIndex(aIdx);
const gAreaMat=new THREE.ShaderMaterial({uniforms:{uProg:{value:0},cA:{value:G_A},cC:{value:G_C}},transparent:true,depthWrite:false,side:THREE.DoubleSide,
  vertexShader:\`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }\`,
  fragmentShader:\`precision highp float; uniform float uProg; uniform vec3 cA; uniform vec3 cC; varying vec2 vUv;
  void main(){ if(vUv.x>uProg) discard; vec3 tint=mix(cA,cC,vUv.x); float a=pow(vUv.y,1.6)*0.20; a*=smoothstep(uProg,uProg-0.05,vUv.x); gl_FragColor=vec4(tint,a); }\`});
const gArea=new THREE.Mesh(gAreaGeo,gAreaMat); gArea.renderOrder=1; graph.add(gArea);
const gDots=[]; const dotGeo=new THREE.SphereGeometry(land()?0.11:0.10,20,20);
const haloGeo=new THREE.RingGeometry(land()?0.13:0.115,land()?0.18:0.155,26);
for(let i=0;i<GN;i++){ const tx=i/(GN-1);
  const d=new THREE.Mesh(dotGeo,new THREE.MeshBasicMaterial({color:i===GN-1?A[3]:A[0]}));
  d.position.copy(gPts[i]); d.scale.setScalar(0.0001); d.renderOrder=4;
  const halo=new THREE.Mesh(haloGeo,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.85,side:THREE.DoubleSide,depthWrite:false}));
  halo.position.copy(gPts[i]); halo.position.z-=0.02; halo.scale.setScalar(0.0001); halo.renderOrder=2;
  d.userData={tx,halo}; graph.add(halo); graph.add(d); gDots.push(d); }
graph.visible=false;

// ================= GENERATED LIGHT PRODUCT UI (CanvasTexture) =====================
// Draws a convincing BRIGHT dashboard / analytics / board in the palette so a card
// ALWAYS presents a product — even with no real screenshot. Deterministic.
function uiTexture(kind, ci){
  const cw=1024, ch=640, cvs=document.createElement("canvas"); cvs.width=cw; cvs.height=ch;
  const x=cvs.getContext("2d");
  const acc=UIP.accents[ci%UIP.accents.length], acc2=UIP.accents[(ci+1)%UIP.accents.length], acc3=UIP.accents[(ci+2)%UIP.accents.length];
  const INK="#111827", DIM="#6B7280";
  const rr=(a,b,w,h,r)=>{x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath();};
  // panel bg — white with a faint lavender wash
  const bg=x.createLinearGradient(0,0,cw,ch); bg.addColorStop(0,"#FFFFFF"); bg.addColorStop(1,"#F5F6FF");
  x.fillStyle=bg; x.fillRect(0,0,cw,ch);
  // sidebar
  x.fillStyle="#F5F6FF"; x.fillRect(0,0,150,ch); x.strokeStyle="rgba(${theme.uiRgb},0.10)"; x.lineWidth=1; x.beginPath(); x.moveTo(150,0); x.lineTo(150,ch); x.stroke();
  const lg=x.createLinearGradient(26,28,52,54); lg.addColorStop(0,acc); lg.addColorStop(1,acc2);
  x.fillStyle=lg; rr(26,28,26,26,8); x.fill();
  for(let i=0;i<6;i++){x.fillStyle=i===1?"rgba(${theme.uiRgb},0.14)":"rgba(17,24,39,0.05)";rr(26,86+i*46,98,20,7);x.fill();}
  const PADX=186, TOP=34;
  x.fillStyle=INK; x.font="700 26px 'Space Grotesk',sans-serif"; x.fillText("Overview", PADX, TOP+22);
  const pill=x.createLinearGradient(cw-150,TOP,cw-30,TOP+34); pill.addColorStop(0,acc); pill.addColorStop(1,acc2);
  x.fillStyle=pill; rr(cw-150,TOP,120,34,17); x.fill();
  x.fillStyle="#FFFFFF"; x.font="600 15px Inter,sans-serif"; x.fillText("Live", cw-116, TOP+22);
  // KPI tiles
  const tw=(cw-PADX-40-32)/3;
  for(let i=0;i<3;i++){const tx=PADX+i*(tw+16), ty=92;
    x.fillStyle="#FFFFFF"; rr(tx,ty,tw,96,14); x.fill(); x.strokeStyle="rgba(${theme.uiRgb},0.12)"; x.lineWidth=1; rr(tx,ty,tw,96,14); x.stroke();
    x.fillStyle=DIM; x.font="500 13px Inter,sans-serif"; x.fillText(["Revenue","Active","Uptime"][i], tx+16, ty+26);
    x.fillStyle=INK; x.font="700 32px 'Space Grotesk',sans-serif"; x.fillText(["$48.2k","12,847","99.9%"][i], tx+16, ty+64);
    x.fillStyle=["#10B981","#10B981",acc][i]; x.font="600 13px Inter,sans-serif"; x.fillText(["+18%","+7%","SLA"][i], tx+16, ty+86);
  }
  const cx=PADX, cy=214, cwid=cw-PADX-40, chei=ch-cy-34;
  x.fillStyle="#FFFFFF"; rr(cx,cy,cwid,chei,16); x.fill(); x.strokeStyle="rgba(${theme.uiRgb},0.12)"; x.lineWidth=1; rr(cx,cy,cwid,chei,16); x.stroke();
  if(kind==="table"){
    for(let r=0;r<6;r++){x.fillStyle=r%2?"#FFFFFF":"#F7F8FF";rr(cx+14,cy+16+r*((chei-24)/6),cwid-28,((chei-24)/6)-6,8);x.fill();
      x.fillStyle=INK;x.font="600 15px Inter,sans-serif";x.fillText(["Acme","Globex","Initech","Umbra","Hooli","Stark"][r], cx+30, cy+16+r*((chei-24)/6)+((chei-24)/12)+5);
      const bw=x.createLinearGradient(cwid-120,0,cwid-60,0);bw.addColorStop(0,acc);bw.addColorStop(1,acc2);x.fillStyle=bw; rr(cwid-120,cy+16+r*((chei-24)/6)+((chei-24)/12)-8,60+r*8,10,5); x.fill();}
  } else if(kind==="bars"){
    const n=9, bw=(cwid-56)/n; for(let i=0;i<n;i++){const bh=(chei-56)*(0.28+ (Math.sin(i*1.3+ci)*0.5+0.5)*0.66);const gb=x.createLinearGradient(0,cy+chei-28-bh,0,cy+chei-28);gb.addColorStop(0,i===n-1?acc2:acc);gb.addColorStop(1,i===n-1?lighten2(acc2):lighten2(acc));x.fillStyle=gb;rr(cx+28+i*bw,cy+chei-28-bh,bw-10,bh,6);x.fill();}
  } else if(kind==="donut"){
    const ccx=cx+chei*0.55, ccy=cy+chei/2+6, R=chei*0.34, r0=R*0.58;
    const segs=[0.42,0.27,0.19,0.12]; let a0=-Math.PI/2;
    const dc=[acc,acc2,acc3,"rgba(17,24,39,0.10)"];
    for(let i=0;i<segs.length;i++){const a1=a0+segs[i]*6.2832;x.beginPath();x.moveTo(ccx,ccy);x.arc(ccx,ccy,R,a0,a1);x.closePath();x.fillStyle=dc[i];x.fill();a0=a1;}
    x.fillStyle="#FFFFFF";x.beginPath();x.arc(ccx,ccy,r0,0,6.2832);x.fill();
    x.textAlign="center";x.fillStyle=INK;x.font="700 44px 'Space Grotesk',sans-serif";x.fillText("68%",ccx,ccy+2);x.fillStyle=DIM;x.font="500 15px Inter,sans-serif";x.fillText("Conversion",ccx,ccy+30);x.textAlign="left";
    const lx=ccx+R+54, ly=cy+42, labs=["Direct","Search","Social","Referral"];
    for(let i=0;i<4;i++){x.fillStyle=dc[i];rr(lx,ly+i*46,16,16,5);x.fill();x.fillStyle=INK;x.font="500 17px Inter,sans-serif";x.fillText(labs[i],lx+28,ly+13+i*46);x.fillStyle=DIM;x.fillText(Math.round(segs[i]*100)+"%",lx+152,ly+13+i*46);}
  } else if(kind==="kanban"){
    const kc=3, kgap=16, colw=(cwid-32-kgap*(kc-1))/kc, heads=["To do","Active","Done"], nc=[3,2,3];
    for(let c=0;c<kc;c++){const colx=cx+16+c*(colw+kgap);
      x.fillStyle=INK;x.font="600 15px Inter,sans-serif";x.fillText(heads[c],colx+2,cy+24);
      x.fillStyle=c===2?"#10B981":acc;x.beginPath();x.arc(colx+colw-12,cy+19,5,0,6.2832);x.fill();
      const ch2=(chei-52)/3; for(let k=0;k<nc[c];k++){const cardy=cy+38+k*ch2;
        x.fillStyle="#F7F8FF";rr(colx,cardy,colw,ch2-12,10);x.fill();x.strokeStyle="rgba(${theme.uiRgb},0.10)";x.lineWidth=1;rr(colx,cardy,colw,ch2-12,10);x.stroke();
        x.fillStyle=(c===1&&k===0)?acc:"rgba(17,24,39,0.18)";rr(colx+12,cardy+12,colw*0.52,8,4);x.fill();
        x.fillStyle="rgba(17,24,39,0.08)";rr(colx+12,cardy+28,colw*0.74,7,4);x.fill();
        x.fillStyle=[acc,acc2,acc3][(c+k)%3];x.beginPath();x.arc(colx+colw-20,cardy+ch2-24,7,0,6.2832);x.fill();}
    }
  } else if(kind==="activity"){
    const rows=5, rh=(chei-20)/rows;
    for(let r=0;r<rows;r++){const ry=cy+10+r*rh;
      x.fillStyle=[acc,acc2,acc3][r%3];x.beginPath();x.arc(cx+36,ry+rh/2,15,0,6.2832);x.fill();
      x.fillStyle="rgba(17,24,39,0.62)";rr(cx+64,ry+rh/2-15,cwid*0.32,10,5);x.fill();
      x.fillStyle="rgba(17,24,39,0.10)";rr(cx+64,ry+rh/2+3,cwid*0.5,8,4);x.fill();
      x.strokeStyle=acc;x.lineWidth=2.5;x.beginPath();const sx=cx+cwid*0.72,sw=cwid*0.18;for(let i=0;i<8;i++){const spx=sx+i*(sw/7),spy=ry+rh/2+Math.sin(i*0.9+r+ci)*9;i?x.lineTo(spx,spy):x.moveTo(spx,spy);}x.stroke();
      x.fillStyle=DIM;x.font="500 13px Inter,sans-serif";x.fillText((r+1)+"m",cx+cwid-34,ry+rh/2+4);}
  } else {
    // area line chart
    x.strokeStyle="rgba(17,24,39,0.06)"; x.lineWidth=1;
    for(let g=1;g<4;g++){x.beginPath();x.moveTo(cx+20,cy+g*(chei/4));x.lineTo(cx+cwid-20,cy+g*(chei/4));x.stroke();}
    const pts=[]; const n=24; for(let i=0;i<n;i++){const px=cx+24+i*((cwid-48)/(n-1));const t=i/(n-1);const py=cy+chei-30-(chei-70)*(0.30+t*0.42+Math.sin(i*0.7+ci)*0.10);pts.push([px,py]);}
    const grad=x.createLinearGradient(0,cy,0,cy+chei); grad.addColorStop(0,acc+"3D"); grad.addColorStop(1,acc+"00");
    x.beginPath();x.moveTo(pts[0][0],cy+chei-24);pts.forEach(p=>x.lineTo(p[0],p[1]));x.lineTo(pts[n-1][0],cy+chei-24);x.closePath();x.fillStyle=grad;x.fill();
    x.beginPath();pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.strokeStyle=acc;x.lineWidth=3;x.lineJoin="round";x.stroke();
    x.fillStyle=acc2; x.beginPath(); x.arc(pts[n-1][0],pts[n-1][1],6,0,6.28); x.fill(); x.strokeStyle="#FFFFFF"; x.lineWidth=2; x.stroke();
  }
  const tex=new THREE.CanvasTexture(cvs); if("SRGBColorSpace" in THREE)tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=4; tex.needsUpdate=true;
  return tex;
}
function lighten2(hex){const n=parseInt(hex.replace("#",""),16);const r=(n>>16)&255,g=(n>>8)&255,b=n&255;const m=(c)=>Math.round(c+(255-c)*0.35);return "#"+("000000"+((m(r)<<16)|(m(g)<<8)|m(b)).toString(16)).slice(-6);}

// ---- soft SHADOW sprite (floats a card above the white ground) ----
const shadowTex=(()=>{const s=256,c=document.createElement("canvas");c.width=c.height=s;const x=c.getContext("2d");const g=x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);g.addColorStop(0,"rgba(${theme.uiRgb},0.28)");g.addColorStop(0.55,"rgba(${theme.uiRgb},0.10)");g.addColorStop(1,"rgba(${theme.uiRgb},0)");x.fillStyle=g;x.fillRect(0,0,s,s);return new THREE.CanvasTexture(c);})();

// ---- glass CARD factory (screenshot OR generated light UI) ----
const loader=new THREE.TextureLoader();
function makeCard(spec){
  const g=new THREE.Group();
  const aspect=spec.aspect&&spec.aspect>0.3&&spec.aspect<4?spec.aspect:1.6;
  const w=spec.w*WSCALE, h=w/aspect;
  // soft floating shadow
  const sh=new THREE.Sprite(new THREE.SpriteMaterial({map:shadowTex,transparent:true,opacity:0.9,depthWrite:false,depthTest:false}));
  sh.scale.set(w*1.5,h*1.5,1); sh.position.set(0,-h*0.16,-0.12); g.add(sh);
  // white card body
  const back=new THREE.Mesh(new THREE.PlaneGeometry(w*1.04,h*1.08),new THREE.MeshBasicMaterial({color:0xffffff}));
  back.position.z=-0.02; g.add(back);
  // browser chrome bar
  const barH=Math.max(0.16,h*0.10);
  const bar=new THREE.Mesh(new THREE.PlaneGeometry(w,barH),new THREE.MeshBasicMaterial({color:0xF5F6FF}));
  bar.position.set(0,h/2-barH/2,0.01); g.add(bar);
  const dotCols=[0xff5f57,0xfebc2e,0x28c840];
  for(let i=0;i<3;i++){const dot=new THREE.Mesh(new THREE.CircleGeometry(barH*0.15,18),new THREE.MeshBasicMaterial({color:dotCols[i]}));dot.position.set(-w/2+barH*(0.5+i*0.42),h/2-barH/2,0.02);g.add(dot);}
  // content: real screenshot OR generated light product UI (NEVER a void)
  const shotH=h-barH;
  let shotMat;
  if(spec.tex){const tex=loader.load(spec.tex);if("SRGBColorSpace" in THREE)tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;shotMat=new THREE.MeshBasicMaterial({map:tex});}
  else{const tex=uiTexture(spec.ui||"line",spec.ci);shotMat=new THREE.MeshBasicMaterial({map:tex});}
  const shot=new THREE.Mesh(new THREE.PlaneGeometry(w*0.985,shotH*0.965),shotMat);
  shot.position.set(0,-barH/2,0.015); g.add(shot);
  // indigo hairline border
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w,h)),new THREE.LineBasicMaterial({color:A[0],transparent:true,opacity:0.5}));
  edges.position.z=0.03; g.add(edges);
  g.userData={base:spec, w, h};
  return g;
}

// ---- build one group per scene (its cards), hidden until its window ----
const SCENES=${JSON.stringify(sceneWindows)};
for(const sc of SCENES){
  const g=new THREE.Group();
  const mine=PLATES.filter(p=>p.scene===sc.i);
  mine.forEach((spec,idx)=>{
    const pl=makeCard(spec);
    // Text lives LOWER-LEFT (see sceneOverlay), so cards sit UPPER-RIGHT.
    // Portrait/square: NATIVE vertical stack — hero centred mid-band, features STACKED
    // down the column (never fanned), everything at x=0. Landscape keeps the panel split.
    if(spec.role==="hero"){pl.position.set(PORT?0:2.1, PORT?-0.7:1.35, 0); pl.rotation.y=PORT?-0.05:-0.14;}
    else if(spec.role==="feature"){const n=mine.length;const spread=n>1?(idx-(n-1)/2):0;
      if(PORT){pl.position.set(0, -spread*2.9, -Math.abs(spread)*0.5); pl.rotation.y=-0.05;}
      else{pl.position.set(1.9+spread*3.0, 1.5+(idx%2?-0.34:0.34), -idx*1.5); pl.rotation.y=-0.15-spread*0.16;}}
    else if(spec.role==="side"){pl.position.set(PORT?0:3.1, PORT?-0.7:1.3, -0.3); pl.rotation.y=PORT?-0.05:-0.22;}
    pl.userData.jit={ph:rand()*6.28, ax:0.05+rand()*0.05, ay:0.06+rand()*0.06};
    g.add(pl);
  });
  g.visible=false; sc.group=g; scene.add(g);
}

// ---- camera choreography per treatment (cinematic, easeInOutExpo) ----
function cameraFor(type,lt,dur){
  const p=Math.max(0,Math.min(1,lt/Math.max(0.1,dur)));
  const e=expoInOut(p);
  // seeded handheld micro-motion (pure fn of time)
  const hx=Math.sin(lt*0.8+1.3)*0.05+Math.sin(lt*0.33)*0.05;
  const hy=Math.cos(lt*0.7+0.6)*0.04+Math.sin(lt*0.25)*0.04;
  if(type==="hook")      return {px:lerp(-0.6,0.7,e)+hx, py:0.3+hy, pz:lerp(12.5,8.2,e), tx:0, ty:0, tz:0, roll:lerp(0.01,-0.008,e)};
  if(type==="problem")   return {px:lerp(-2.2,2.2,e)+hx, py:hy*1.3, pz:9.6, tx:lerp(0.7,-0.7,e), ty:0, tz:-1, roll:lerp(-0.012,0.012,e)};
  if(type==="solution")  return {px:lerp(1.1,-0.3,e)+hx, py:0.6+hy, pz:lerp(10.4,7.0,e), tx:lerp(0.6,-0.3,e), ty:0.5, tz:0, roll:0};
  if(type==="features")  return {px:lerp(-3.0,3.0,e)+hx, py:0.8+hy, pz:8.6, tx:lerp(-1.5,1.5,e), ty:0.5, tz:-0.6, roll:lerp(0.016,-0.016,e)};
  if(type==="benefits")  return {px:lerp(1.9,-0.3,e)+hx, py:0.55+hy, pz:lerp(8.8,6.8,e), tx:lerp(0.8,-0.2,e), ty:0.5, tz:0, roll:0};
  /* cta */               return {px:hx, py:0.25+hy, pz:lerp(5.4,11.0,e), tx:0, ty:0, tz:0, roll:lerp(-0.016,0,e)};
}

function winOpacity(t,s,e){
  if(t<s-0.30||t>e+0.30)return 0;
  const a=s<=0.01?1:Math.min(1,(t-(s-0.30))/0.52);
  const b=e>=D-0.01?1:Math.min(1,((e+0.30)-t)/0.52);
  return Math.max(0,Math.min(a,b));
}
function setOpacity(g,o){g.visible=o>0.01;g.traverse((o2)=>{if(o2.material&&"opacity" in o2.material){o2.userData.__b=o2.userData.__b!==undefined?o2.userData.__b:o2.material.opacity;o2.material.transparent=true;o2.material.opacity=o2.userData.__b*o;}});}

// scene-boundary GLOW WIPE — a soft white-pastel flash swept at each cut.
const wipeMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,depthTest:false});
const wipe=new THREE.Mesh(new THREE.PlaneGeometry(3,3),wipeMat);
cam.add(wipe); wipe.position.set(0,0,-1.6); scene.add(cam);
const BOUNDS=SCENES.map(s=>s.start).filter(v=>v>0.05);
function wipeAt(t){let o=0;for(const b of BOUNDS){const d=Math.abs(t-b);if(d<0.24)o=Math.max(o,(1-d/0.24)*0.34);}return o;}

function render3d(t){
  aurMat.uniforms.uTime.value=t;
  // orbs drift + gentle bob (pure fn of time)
  orbs.forEach((sp)=>{const u=sp.userData;sp.position.x=u.bx+Math.sin(t*u.sp+u.ph)*u.ax;sp.position.y=u.by+Math.cos(t*u.sp*0.9+u.ph)*u.ay;});
  dots.rotation.y=t*0.015; dots.position.x=Math.sin(t*0.08)*0.6;
  shapes.children.forEach((g)=>{const u=g.userData;if(u.isRing){g.rotation.z=t*u.sp;return;}if(!u.spin)return;g.rotation.x=t*u.spin[0];g.rotation.y=t*u.spin[1];g.rotation.z=t*u.spin[2];g.position.y=(u.by!==undefined?u.by:(u.by=g.position.y))+Math.sin(t*0.4+u.ph)*u.fa;});
  let active=SCENES[0];
  for(const sc of SCENES){const o=winOpacity(t,sc.start,sc.end);setOpacity(sc.group,o);if(t>=sc.start&&t<sc.end)active=sc;
    sc.group.children.forEach((pl)=>{const j=pl.userData.jit;if(!j)return;const lt=t-sc.start;pl.position.y=(pl.userData.baseY!==undefined?pl.userData.baseY:(pl.userData.baseY=pl.position.y))+Math.sin(lt*0.7+j.ph)*0.13;pl.rotation.x=Math.sin(lt*0.5+j.ph)*0.02;});
  }
  // ---- shared scene-local time (active resolved by the SCENES loop above; all fn of t) ----
  const AT=active.type, LT=t-active.start, DUR=Math.max(0.1,active.end-active.start), P=Math.min(1,Math.max(0,LT/DUR)), E=expoInOut(P);
  const c=cameraFor(active.type,t-active.start,active.end-active.start);
  // Portrait/square: centre the rig (kill lateral sweeps) and look slightly down so the
  // top headline + mid-band hero card both sit in the tall frame.
  if(PORT){ c.px*=0.12; c.tx*=0.12; c.roll*=0.4; c.py=0.15+c.py*0.3; c.ty=-0.45; }
  cam.position.set(c.px,c.py,c.pz); cam.up.set(Math.sin(c.roll||0),Math.cos(c.roll||0),0); cam.lookAt(c.tx,c.ty,c.tz);

  // GRADIENT DATA WAVES — hero on SOLUTION (flow+amp), draws on over HOOK, faint elsewhere.
  { let tAmp=0.5,tFlow=1.0,tRise=0.0,tRev=1.0,tOpaK=0.5;
    if(AT==="hook"){ tAmp=lerp(0.35,0.7,E); tFlow=1.4; tRev=E; tOpaK=0.6; }
    else if(AT==="solution"){ tAmp=lerp(0.7,1.05,smooth(0,0.7,P)); tFlow=1.5; tRise=0.14; tOpaK=1.0; }
    else if(AT==="problem"){ tAmp=0.4; tFlow=0.6; tRise=-0.1; tOpaK=0.55; }
    else if(AT==="features"){ tAmp=0.5; tFlow=1.2; tOpaK=0.45; }
    else if(AT==="benefits"){ tAmp=0.45; tFlow=0.8; tOpaK=0.4; }
    else if(AT==="cta"){ tAmp=lerp(0.7,0.4,E); tFlow=lerp(1.2,0.6,E); tOpaK=0.45; }
    for(let wi=0;wi<waves.length;wi++){ const u=waves[wi].mat.uniforms;
      u.uTime.value=t; u.uAmp.value=tAmp*waves[wi].base.amp; u.uFlow.value=tFlow;
      u.uRise.value=tRise; u.uReveal.value=tRev; u.uOpa.value=waves[wi].base.op*tOpaK; }
    waveGroup.position.x=(land()?-2.0:-1.0)+Math.sin(t*0.05)*0.5;
    waveGroup.rotation.z=0.14+Math.sin(t*0.06)*0.03;
  }

  // MATTE BLOB FAMILY — HOOK hero scales in; CTA all gather; else calm idle morph/breathe.
  { const gather=(AT==="cta")?E:0.0;
    const heroIn=(AT==="hook")?lerp(0.7,1.0,smooth(0.0,0.9,P)):1.0;
    for(let i=0;i<BLOBS.length;i++){ const b=BLOBS[i], u=b.userData;
      u.mat.uniforms.uTime.value=t;
      let x=lerp(u.bx,u.cx,gather), y=lerp(u.by,u.cy,gather), z=lerp(u.bz,u.cz,gather);
      x+=Math.sin(t*u.dr+u.ph)*u.fa; y+=Math.cos(t*u.dr*0.9+u.ph)*u.fa*0.8;
      b.position.set(x,y,z);
      const breathe=1.0+Math.sin(t*0.5+u.ph)*0.03;
      b.scale.setScalar((u.hero?heroIn:1.0)*breathe*(1.0+gather*0.04));
      u.mat.uniforms.uWarp.value=u.warp*(1.0+gather*0.25);
      b.rotation.set(t*u.spin[0]+u.ph*0.3, t*u.spin[1], t*u.spin[2]); }
  }

  // MOTION GEOMETRY — FEATURES assembles (draw-on), CTA converges into a bloom core.
  { const assemble=(AT==="features")?smooth(0.0,0.62,P):1.0;
    const converge=(AT==="cta")?expoInOut(Math.min(1,P/0.82)):0.0;
    const flow=(AT==="solution")?1.4:(AT==="hook"?0.8:(AT==="benefits"?0.5:0.35));
    const ambient=(AT==="features"||AT==="cta")?1.0:0.62;
    geo.scale.setScalar(lerp(1.0,0.72,converge));
    geo.rotation.z=0.12+t*0.012+converge*0.6;
    geoArcs.forEach((arc,i)=>{const u=arc.userData,m=arc.material.uniforms;arc.rotation.z=u.base+t*u.sp*(1.0+flow*0.4);m.uShift.value=t*(0.02+0.015*i)*(1.0+flow*1.6);m.uDraw.value=assemble;m.uOpacity.value=u.op*ambient*(0.85+0.15*Math.sin(t*0.5+i))*(1.0-converge*0.35);});
    geoNodes.forEach((nd)=>{const u=nd.userData;let R=lerp(u.R,0.55,converge);const ang=u.ang0+t*u.sp*(1.0+flow*1.0)+converge*5.5*u.dir;nd.position.set(Math.cos(ang)*R,Math.sin(ang)*R,0);const s=u.size*(0.92+0.08*Math.sin(t*1.3+u.ph))*(0.55+0.45*assemble)*(1.0+converge*0.6);nd.scale.setScalar(s);nd.material.opacity=u.op*ambient*(0.12+0.88*assemble);});
    core.material.opacity=converge*0.85; core.scale.setScalar(0.05+converge*0.5);
    geoLinks.forEach((lk)=>{const u=lk.userData,a=u.a.position,b=u.b.position,pos=lk.geometry.attributes.position;for(let s=0;s<=u.seg;s++){const tt=s/u.seg,bow=Math.sin(tt*Math.PI)*u.bow;pos.setXYZ(s,lerp(a.x,b.x,tt),lerp(a.y,b.y,tt),bow);}pos.needsUpdate=true;});
    linkMat.uniforms.uDraw.value=assemble; linkMat.uniforms.uOpacity.value=0.4*ambient*(0.4+0.6*assemble)*(1.0-converge*0.25);
  }

  // DYNAMIC GRAPH — BENEFITS only: draw-on rising line + area + pulsing data points.
  { const grow=(AT==="benefits"); graph.visible=grow;
    if(grow){ const gp=smooth(0.12,0.82,P);
      gTubeGeo.setDrawRange(0, Math.round(gp*G_SEG)*G_RING);
      gTubeMat.uniforms.uProg.value=gp; gAreaMat.uniforms.uProg.value=gp;
      graph.position.y=GBY+gp*(land()?0.8:0.55); graph.scale.y=1.0+gp*0.12; graph.rotation.z=Math.sin(t*0.3)*0.008;
      for(const d of gDots){ const u=d.userData, rev=smooth(u.tx-0.02,u.tx+0.05,gp);
        const pulse=1+Math.sin(t*3.4+u.tx*6.0)*0.12*rev;
        d.scale.setScalar(Math.max(0.0001,rev*(land()?1:0.92)*pulse)); d.visible=rev>0.02;
        const h=u.halo, hs=rev*(1+Math.sin(t*3.4+u.tx*6.0)*0.18*rev);
        h.scale.setScalar(Math.max(0.0001,hs)); h.visible=rev>0.02; } }
  }

  tintA.position.x=Math.sin(t*0.28)*8; tintB.position.x=Math.cos(t*0.24)*8;
  wipeMat.opacity=wipeAt(t);
  renderer.render(scene,cam);
}
render3d(0);

const tl=gsap.timeline({paused:true,defaults:{ease:"power3.out"}});
tl.to({v:0},{v:1,duration:D,ease:"none",onUpdate:()=>render3d(tl.time())},0);
__OVERLAY_TWEENS__
window.__timelines=window.__timelines||{}; window.__timelines["vid"]=tl;
`;
}

// ---- asset → scene card assignment (heuristic, aspect-aware) -----------------
// Every content scene gets a card. Real screenshots take priority; when the pool is
// empty the card renders a GENERATED light product UI (never a black box).
function assignPlates(scenes, sceneWindows, assets) {
  // The user's logo never rides a glass card (it gets key-moment treatment);
  // their uploads outrank everything, including the site's own captures.
  const imgs = (assets || []).filter((a) => a && a.path && String(a.role || "") !== "logo" && !/\.(mp4|webm|mov)$/i.test(a.path) && !/\.svg($|\?)/i.test(a.path));
  const ratio = (a) => (a.width && a.height ? a.width / a.height : (a.ratio || 1.6));
  const rank = (a) => (a.source === "upload" ? 4 : a.source === "website" || /screenshot|webpage|landing|dashboard/i.test(a.alt || "") ? 3 : a.visionOk === true ? 2 : 1);
  const pool = imgs.slice().sort((a, b) => rank(b) - rank(a));
  const used = new Set();
  const take = () => { const a = pool.find((x) => !used.has(x)); if (a) used.add(a); return a || null; };
  const avail = () => pool.filter((x) => !used.has(x)).length;
  const UIKINDS = ["donut", "kanban", "activity"];
  const plates = [];
  sceneWindows.forEach((w) => {
    const type = w.type;
    if (type === "solution") {
      const a = take();
      plates.push({ scene: w.i, role: "hero", tex: a ? a.path : null, ui: "line", aspect: a ? ratio(a) : 1.6, w: 4.6, ci: 0 });
    } else if (type === "features") {
      for (let k = 0; k < 3; k++) { const a = take(); plates.push({ scene: w.i, role: "feature", tex: a ? a.path : null, ui: UIKINDS[k % 3], aspect: a ? ratio(a) : 1.6, w: 2.6, ci: k }); }
    } else if (type === "benefits") {
      const a = take();
      plates.push({ scene: w.i, role: "side", tex: a ? a.path : null, ui: "bars", aspect: a ? ratio(a) : 1.6, w: 3.0, ci: 2 });
    } else if (type === "problem") {
      // a tilted card drifts in — keeps the "pain" scene alive, not barren.
      const a = take();
      plates.push({ scene: w.i, role: "side", tex: a ? a.path : null, ui: "table", aspect: a ? ratio(a) : 1.6, w: 2.7, ci: 4 });
    } else if (type === "cta") {
      if (avail() > 0) { const a = take(); plates.push({ scene: w.i, role: "side", tex: a.path, aspect: ratio(a), w: 2.4, ci: 1 }); }
    }
    // hook stays pure type over the pastel field (no card).
  });
  return plates;
}

// The skin the film actually WORE, merged over the input skin so reason/source/
// provenance survive (those say where the palette CAME from; resolution has no opinion
// on that). Null when nothing applied — the panel then shows "no brand". Mirrors flagship.
function resolvedSkin(brandSkin, theme) {
  if (!theme.applied || !theme.brandLed || !theme.brandLed.length || !theme.brand) return null;
  return {
    ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
    accents: theme.brandLed, emphasis: [theme.emphA, theme.emphB],
    adjusted: theme.brand.adjusted || [], dropped: theme.brand.dropped || [],
    tier: theme.brand.tier, applied: true,
  };
}

// Per-script render-width factor for the char-count `measure` above. Set at the top of the
// (synchronous) buildComposition from the video-text language; 1 for Latin/English (no-op).
let _langCharWidth = 1;
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, captionStyle = null } = {}) {
  _langCharWidth = (captionStyle && captionStyle.text && captionStyle.text.charWidth) || 1;
  // Non-Latin scripts collide at the display headline's tight 0.98 line-height; lift it to a
  // per-script floor so stacked marks (Devanagari matras / Arabic diacritics) clear. 0.98 Latin.
  const _headLh = (captionStyle && captionStyle.text && captionStyle.text.lineHeight) || 0.98;
  const sb = storyboard || {};
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length ? sb.scenes : [{ id: "s1", start: 0, duration: 6, purpose: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r2(sb.durationSec || scenes.reduce((a, s) => a + (s.duration || 0), 0) || 12);
  const W = dims.width, H = dims.height;
  const theme = brightTheme(framePack, sb, brandSkin);
  const seed = hashSeed(`${sb.title || ""}|${scenes.length}|brightlife`);
  const sc = typeScale(W, H);
  const px = (n) => Math.round(n * sc);

  let cursor = 0;
  const sceneWindows = scenes.map((scene, i) => {
    const start = r2(scene.start != null ? scene.start : cursor);
    const dur = r2(scene.duration || 4);
    cursor = r2(cursor + dur);
    return { i, type: treatmentFor(scene, i, scenes.length), start, end: r2(start + dur) };
  });

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

  // Burned-in captions (previously only exported as .srt on 3D packs). Dark pill +
  // light text stays readable over the bright ground; #cap-text gets the caption
  // language font/RTL from pipeline.injectCaptionStyle. Empty when captions off.
  const safe = safeArea(W, H);
  const cap = buildCaptionOverlay({ captionCues, dims, D, safe });
  if (cap.html) { bodyHtml.push(cap.html); overlayTweens.push("// captions", cap.script); }

  const moduleSrc = threeModule({ theme, dims, D, seed, sceneWindows, plates }).replace("__OVERLAY_TWEENS__", overlayTweens.join("\n"));

  const emphGrad = `linear-gradient(120deg, ${theme.emphA} 0%, ${theme.emphB} 55%, ${theme.emphC} 100%)`;
  const accentGrad = `linear-gradient(120deg, ${theme.accent}, ${theme.accent2})`;

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
    `.kkick { display:inline-flex; align-items:center; gap:12px; margin-bottom:${px(24)}px; color:${theme.accent}; font-family:${theme.monoStack}; font-size:${px(14)}px; font-weight:500; letter-spacing:.2em; text-transform:uppercase; }`,
    `.kkick::before { content:""; width:${px(40)}px; height:3px; border-radius:2px; background:${accentGrad}; }`,
    `.kwall { position:absolute; top:-0.42em; z-index:-1; font-family:${theme.displayStack}; font-weight:700; font-size:${px(W >= H ? 380 : 250)}px; line-height:1; color:${theme.accent}; opacity:0.05; pointer-events:none; letter-spacing:-0.04em; }`,
    `.khead { margin:0; font-family:${theme.displayStack}; font-weight:700; line-height:${_headLh}; letter-spacing:-0.032em; color:${theme.ink}; overflow-wrap:anywhere; }`,
    `.kw { display:inline-block; overflow:hidden; vertical-align:top; max-width:100%; }`,
    `.kwi { display:inline-block; overflow-wrap:anywhere; word-break:break-word; }`,
    // `color` is a solid accent fallback under the gradient text-clip: it is inert
    // in normal rendering (-webkit-text-fill-color:transparent wins), but the i18n
    // layer reveals it for complex scripts, where background-clip:text silently
    // breaks Devanagari/Arabic glyph shaping. See caption_render.SHAPING_FIX.
    `.kacc .kwi { background:${emphGrad}; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:${theme.emphB}; filter:drop-shadow(0 6px 18px ${rgba(theme.emphB, 0.30)}); }`,
    `.ksub { margin-top:${px(20)}px; font:500 1em/1.5 ${theme.fontStack}; color:${theme.dim}; max-width:44ch; }`,
    `.kchips { display:flex; gap:${px(12)}px; margin-top:${px(28)}px; flex-wrap:wrap; }`,
    `.kchip { display:inline-flex; align-items:center; gap:${px(9)}px; padding:${px(10)}px ${px(17)}px; border-radius:999px; background:rgba(255,255,255,0.72); border:1px solid ${theme.border}; backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); color:${theme.ink}; font:600 ${px(15)}px/1 ${theme.fontStack}; letter-spacing:-0.01em; box-shadow:${theme.cardShadow}; }`,
    `.kchip i { width:${px(9)}px; height:${px(9)}px; border-radius:50%; background:${accentGrad}; }`,
    `.kchip:nth-child(2) i { background:linear-gradient(120deg, ${theme.accent3}, ${theme.accent2}); }`,
    `.kchip:nth-child(3) i { background:linear-gradient(120deg, ${theme.palette[4]}, ${theme.accent}); }`,
    `.kmetric { font-family:${theme.displayStack}; font-weight:700; line-height:1; letter-spacing:-0.03em; font-size:${px(W >= H ? 190 : 130)}px; background:${emphGrad}; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; filter:drop-shadow(0 10px 30px ${rgba(theme.emphB, 0.28)}); display:flex; align-items:baseline; }`,
    `.kmpre { font-size:0.5em; -webkit-text-fill-color:${theme.ink}; margin-right:0.1em; }`,
    `.kmsuf { font-size:0.6em; margin-left:0.02em; }`,
    `.kmlabel { margin-top:${px(10)}px; font-family:${theme.displayStack}; font-weight:600; font-size:${px(W >= H ? 52 : 36)}px; color:${theme.ink}; letter-spacing:-0.02em; }`,
    `.kbtnrow { display:flex; gap:${px(14)}px; margin-top:${px(34)}px; flex-wrap:wrap; justify-content:inherit; }`,
    `.kbtn { display:inline-flex; align-items:center; padding:${px(16)}px ${px(30)}px; border-radius:16px; background:${accentGrad}; color:#fff; font:600 ${px(18)}px/1 ${theme.fontStack}; letter-spacing:-0.01em; box-shadow:0 14px 34px ${rgba(theme.accent, 0.34)}; }`,
    `.kbtn.ghost { background:rgba(255,255,255,0.7); color:${theme.ink}; border:1px solid ${theme.border}; box-shadow:${theme.cardShadow}; }`,
    `.kmeta { display:inline-flex; align-items:center; gap:${px(9)}px; margin-top:${px(22)}px; color:${theme.dim}; font:500 ${px(17)}px/1 ${theme.monoStack}; letter-spacing:.04em; }`,
    `.kmeta .kdot { width:${px(8)}px; height:${px(8)}px; border-radius:50%; background:${theme.accent3}; }`,
    `.ksoc { display:flex; gap:${px(12)}px; margin-top:${px(22)}px; justify-content:inherit; }`,
    `.ksoc i { width:${px(38)}px; height:${px(38)}px; border-radius:12px; background:rgba(255,255,255,0.72); border:1px solid ${theme.border}; box-shadow:${theme.cardShadow}; display:inline-block; }`,
    `.kchrome { position:absolute; inset:0; z-index:9; pointer-events:none; font-family:${theme.monoStack}; }`,
    `.kcat { position:absolute; left:${W >= H ? 58 : 40}px; bottom:42px; font-size:${px(12)}px; letter-spacing:.2em; text-transform:uppercase; color:${theme.faint}; }`,
    `.kcount { position:absolute; right:${W >= H ? 58 : 40}px; bottom:42px; font-size:${px(12)}px; letter-spacing:.2em; color:${theme.accent}; }`,
    `.kbar { position:absolute; left:0; right:0; bottom:0; height:3px; background:rgba(${theme.uiRgb},0.10); }`,
    `.kbarfill { display:block; height:100%; width:100%; transform-origin:left; transform:scaleX(0); background:${emphGrad}; }`,
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
  return { indexHtml, metaJson, resolvedBrand: resolvedSkin(brandSkin, theme) };
}

module.exports = { buildComposition };
