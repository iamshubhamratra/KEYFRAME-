// BLUEPRINT ATELIER composer — a native GSAP + SVG/CSS "engineering drawing" film.
// The pack `blueprint-atelier` (manifest renderer:"blueprint") routes here from
// attemptLlmComposition, exactly like the flagship/brightlife Three.js composers.
//
// Same envelope as scene_kit / flagship / brightlife: buildComposition ->
// {indexHtml, metaJson}. The blueprint CHROME (graph-paper sheet, edge rulers,
// compass rose, corner registration marks, a wandering crosshair with a live X/Y
// readout, a corner title block, a sheet-wipe between scenes, one seek-safe caption
// node) is content-independent. Each storyboard scene is injected into a blueprint
// SCENE-TYPE (title / figure / flowchart / plot / revisions / cta) with the user's
// own headline, subtext, bullets and numbers.
//
// Engineering contract (identical to the other showcases): one paused GSAP timeline
// registered as window.__timelines["vid"]; direct-child .clip scenes on disjoint
// tracks with a hard opacity:0 kill at each scene end; hidden state is opacity:0
// ONLY (all from-states live in gsap.fromTo); finite repeats; pathLength=100 on every
// draw-on; live text fields driven by a single seeked onUpdate proxy. Deterministic:
// every per-frame value is a pure function of tl.time().

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { resolveBrand } = require("./brand_kit");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
const DISPLAY = "Space Grotesk";
const MONO = "IBM Plex Mono";

// ---- helpers -----------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ---- brand colour-kit — LIFTED from flagship_composer.js so the amber accent can be
// rotated onto the BRAND's hue while its authored LUMINANCE and SATURATION are pinned.
// IDENTITY = LUMINANCE + MOTION + TYPOGRAPHY + LAYOUT + SEMANTICS; only HUE is the brand's
// to steer — which is why the navy sheet, the ink, and the SEMANTIC cyan (dimension /
// construction lines) and red (revision marks) never pass through here.
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
// reHue: rotate onto `hue`, bisecting HSL lightness back to the source's relative luminance
// (monotone in L at fixed hue/sat), so the amber's contrast against the navy comes out at the
// ratio it went in at. SATURATION stays the amber's own; achromatic in → untouched; a lum-pin
// miss fails OPEN to the source hex (a stock amber beats a wrong hue). The amber runs fully
// saturated (s≈1.0), where rounding THREE channels compounds a hair past flagship's 0.004
// budget; 0.006 is still a sub-1% drift — below any perceptible or contrast-affecting change —
// and is the true 8-bit quantization ceiling for this hue.
const LUM_PIN = 0.006;
function reHue(hex, hue) {
  const [, s] = rgbToHsl(hexToRgb(hex));
  if (s < 0.02) return hex;
  const target = relLum(hex);
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (relLum(hslHex(hue, s, mid)) < target) lo = mid; else hi = mid; }
  // The bisection finds the ideal REAL lightness, but hslHex quantizes to 8-bit and the rounding
  // can leave the midpoint a hair off the authored luminance — which would fail-open a good
  // recolour back to its OLD hue. So test the quantization neighbours and keep the closest; only
  // a candidate that STILL misses the pin is dropped.
  const l = (lo + hi) / 2;
  let out = hex, err = Infinity;
  for (const dl of [0, -1 / 255, 1 / 255]) {
    const cand = hslHex(hue, s, l + dl);
    const e = Math.abs(relLum(cand) - target);
    if (e < err) { err = e; out = cand; }
  }
  return err <= LUM_PIN ? out : hex;
}
// brandLedOf (flagship_composer.js:105): resolveBrand lays accents brand-first then pack, so the
// brand-led run ends at the first entry the pack already owned. [] means no brand applied.
function brandLedOf(brand, packAccents) {
  const pack = new Set(packAccents.map((a) => String(a).toLowerCase()));
  const out = [];
  for (const a of brand.accents) { if (pack.has(String(a).toLowerCase())) break; out.push(a); }
  return out;
}

// The blueprint palette. GROUND, ink and the two SEMANTIC line colours are the template's
// identity and stay literal; the AMBER accent is the pack's ONE brand-slottable role (tier
// accent) — a brand skin rotates it onto the brand hue, contrast-lifted against the navy by
// the resolver (a green that cannot clear #0C2440 is surfaced in dropped[], never forced).
function blueprintTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  // LOCKED — recolour #0C2440 and it is no longer a drafting sheet; cyan MEANS a dimension /
  // construction line and red MEANS a revision mark, so both are meaning, not decoration.
  const ground = "#0C2440";
  const AMBER = "#FFB84D";

  // FAIL-OPEN (art_director.js:14): any resolver/reHue hiccup renders the stock amber, never a
  // crash and never a half-branded sheet. TIER accent — the brand rents exactly this one slot.
  let amber = AMBER, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground, isDark: true, packAccents: [AMBER], contract: { mode: "accent", maxAccents: 1, slots: [] } });
    const led = brandLedOf(brand, [AMBER]);
    if (brand.applied && led.length) {
      // The resolver already lifted the brand colour to clear the navy; take its HUE and rotate
      // the amber onto it, keeping the amber's own luminance so the highlight stays as bright a
      // warm-slot as it was — only its colour changes.
      amber = reHue(AMBER, hueOf(led[0]));
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: led, emphasis: brand.emphasis,
        adjusted: brand.adjusted, dropped: brand.dropped,
        tier: brand.tier, applied: true,
      };
    }
  } catch { amber = AMBER; resolvedBrand = null; }

  // The amber's low-alpha WASHES (plot fill, progress track, CTA glow, caption border) belong to
  // the amber role and rehue in lockstep with it. With no brand skin `amber` is #FFB84D, so every
  // wash resolves to its exact current literal — the NO-OP LAW holds byte-for-byte.
  const [aR, aG, aB] = hexToRgb(amber);
  const amberWash = (a) => `rgba(${aR},${aG},${aB},${a})`;

  return {
    groundCss: "radial-gradient(140% 120% at 30% 20%, #17416F 0%, #123659 46%, #0C2440 100%)",
    sheet: "#123659", ink: "#EAF3FF", faint: "#9DB8D9",
    amber, red: "#FF5F5F", cyan: "#8FD8FF", amberWash,
    line: "rgba(190,215,255,0.16)",
    displayStack: `'${DISPLAY}', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    fontFace, resolvedBrand,
  };
}

// Headline HTML with the emphasis word tinted amber (case-insensitive first hit).
function hl(scene, amber) {
  const H = String(scene.headline || scene.title || "");
  const E = String(scene.emphasis || "").trim();
  if (E) {
    const i = H.toLowerCase().indexOf(E.toLowerCase());
    if (i >= 0) {
      return esc(H.slice(0, i)) + `<span style="color:${amber};">` + esc(H.slice(i, i + E.length)) + `</span>` + esc(H.slice(i + E.length));
    }
  }
  return esc(H);
}

// Extract a headline number for the plot/stat scene-type. "10x" -> {target:10,suf:"x"}.
function pickNumber(scene) {
  const src = [scene.emphasis, scene.subtext, scene.headline]
    .map((x) => String(x || "")).find((x) => /\d/.test(x)) || "";
  const m = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)\s?(%|x|\+|k|m|bn?)?/i.exec(src);
  if (!m) return null;
  const target = Math.round(parseFloat(m[2].replace(/,/g, "")));
  if (!isFinite(target)) return null;
  return { pre: m[1] || "", target: Math.min(Math.max(target, 0), 100000), suf: (m[3] || "").toUpperCase() };
}

// Up to n short bullet strings for flowchart/revision scenes.
function bullets(scene, n) {
  let list = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean) : [];
  if (!list.length && scene.subtext) {
    list = String(scene.subtext).split(/[.;\n•]|\s—\s/).map((s) => s.trim()).filter((s) => s.length > 2);
  }
  return list.slice(0, n).map((s) => String(s));
}

// A raster image (screenshot/photo) usable as a PROMINENT plate. Vectors/SVGs and
// videos are excluded (the composer draws its own line art). Trust matches the
// scene-kit prominentOk gate: the user's own website shots, curated-library picks,
// or web stock the Creative Director explicitly approved (visionOk / hero|support).
function plateOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is key-moment material, never a technical plate
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}

// Which blueprint scene-type a storyboard scene renders as.
function bpArchetype(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "title";
  if (i === total - 1 || k === "cta" || p === "cta") return "cta";
  if (k === "chart" || k === "stat" || k === "countdown" || pickNumber(scene)) return "plot";
  if (k === "quote" || p === "problem" || p === "comparison") return "revisions";
  if (bullets(scene, 3).length >= 2 || /how|process|step|pipeline|workflow/.test(p + k)) return "flowchart";
  return "figure";
}

// ---- localizable strings -----------------------------------------------------
// Every fixed, user-visible English fallback the composer emits when a storyboard
// scene omits its own copy. Consolidated here so a caller can pass `localized`
// overrides to buildComposition; with no overrides the exact literals below are
// used, keeping output byte-identical. "KEYFRAME" (the product mark) is NOT here —
// it is a brand name, left literal at every site.
const STRINGS = {
  titleHeadline: "Draw up a film.",
  titleSub: "Everything below this line is drafted, checked and rendered by machines.",
  titleSpec: "SPEC 001",
  figureCallout: "SPEC",
  plotHeadline: "measured output",
  flowchartSteps: ["Script", "Direct", "Render"],
  revisionsStamp: "Just words.",
  revisionsLines: ["Hire a crew", "Book a studio", "Edit for weeks"],
  ctaTag: "Draft a film from a single sentence.",
  ctaButton: "Open a new sheet",
  plateCallout: "PLATE",
};

// ---- scene-type builders  ((scene, ctx) -> { html, s })  ---------------------
// ctx = { id, T, L, E, isLast, dims, theme, fig, sheetNo, S }

function bpTitle(scene, ctx) {
  const { id, T, theme, fig } = ctx;
  const head = String(scene.headline || scene.title || ctx.S.titleHeadline).toUpperCase();
  const sub = esc(scene.subtext || ctx.S.titleSub);
  const dimText = esc((scene.emphasis || ctx.S.titleSpec).toUpperCase());
  const html = `<div class="clip bp-scene" id="${id}" data-start="${T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="safe" style="align-items:flex-start;text-align:left;padding-left:12%;">
    <div class="label" id="${id}-lab" style="opacity:0;">${esc(fig)}</div>
    <h1 class="display" style="margin-top:1.6cqw;min-height:6cqw;"><span id="${id}-type"></span><span class="caret" id="${id}-caret"></span></h1>
    <div style="position:relative;max-width:46cqw;">
      <svg id="${id}-dim" width="880" height="70" viewBox="0 0 880 70" style="margin-top:1.8cqw;overflow:visible;width:100%;">
        <line class="draw" pathLength="100" x1="10" y1="30" x2="870" y2="30" stroke="${theme.cyan}" stroke-width="2"/>
        <path class="${id}-arr" d="M10 30 l14 -7 v14 Z" fill="${theme.cyan}" opacity="0"/>
        <path class="${id}-arr" d="M870 30 l-14 -7 v14 Z" fill="${theme.cyan}" opacity="0"/>
        <line class="draw" pathLength="100" x1="10" y1="18" x2="10" y2="42" stroke="${theme.cyan}" stroke-width="2"/>
        <line class="draw" pathLength="100" x1="870" y1="18" x2="870" y2="42" stroke="${theme.cyan}" stroke-width="2"/>
        <text class="dim-label" x="440" y="62" text-anchor="middle">${dimText}</text>
      </svg>
      <svg class="pencil" id="${id}-pencil" viewBox="0 0 48 48" style="left:0;top:0.4cqw;opacity:0;">
        <g transform="rotate(40 24 24)"><rect x="18" y="4" width="12" height="26" rx="2" fill="${theme.amber}"/>
        <path d="M18 30 H30 L24 44 Z" fill="${theme.ink}"/><path d="M22 38 L24 44 L26 38 Z" fill="${theme.sheet}"/></g>
      </svg>
    </div>
    <div class="body" id="${id}-sub" style="opacity:0;margin-top:1.6cqw;max-width:46cqw;">${sub}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `settle("#${id}",${T},${r(ctx.L)});`,
    `tl.fromTo("#${id}-lab",{opacity:0,x:-24},{opacity:1,x:0,duration:0.5,ease:"power2.out"},${r(T + 0.5)});`,
    `type("#${id}-type",${JSON.stringify(head)},${r(T + 0.9)},1.5);`,
    `tl.to("#${id}-caret",{opacity:0,duration:0.2,ease:"none",yoyo:true,repeat:reps(3.4,0.44)},${r(T + 0.9)});`,
    `tl.to("#${id}-dim .draw",{strokeDashoffset:0,duration:0.6,ease:"power2.out",stagger:0.1},${r(T + 2.5)});`,
    `tl.fromTo("#${id}-pencil",{opacity:0,x:0,y:0},{opacity:1,duration:0.15},${r(T + 2.45)});`,
    `tl.fromTo("#${id}-pencil",{x:0},{x:"43.5cqw",duration:0.6,ease:"power2.out"},${r(T + 2.5)});`,
    `tl.to("#${id}-pencil",{opacity:0,y:-14,duration:0.3,ease:"power2.in"},${r(T + 3.15)});`,
    `tl.fromTo(".${id}-arr",{opacity:0},{opacity:1,duration:0.3,stagger:0.08},${r(T + 2.9)});`,
    `tl.fromTo("#${id}-dim text",{opacity:0},{opacity:1,duration:0.5},${r(T + 3.1)});`,
    `tl.fromTo("#${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 3.3)});`,
  ];
  return { html, s };
}

function bpFigure(scene, ctx) {
  const { id, T, theme, fig } = ctx;
  const callout = esc((scene.emphasis || ctx.S.figureCallout).toUpperCase());
  const html = `<div class="clip bp-scene" id="${id}" data-start="${T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="safe" style="flex-direction:row;gap:6cqw;text-align:left;">
    <svg id="${id}-fig" width="620" height="520" viewBox="0 0 620 520" style="width:34cqw;flex:0 0 auto;overflow:visible;">
      <g id="${id}-center" opacity="0" stroke="${theme.cyan}" stroke-width="1.6" stroke-dasharray="18 6 3 6">
        <line x1="150" y1="300" x2="470" y2="300"/><line x1="310" y1="150" x2="310" y2="450"/></g>
      <g fill="none" stroke="${theme.ink}" stroke-width="3">
        <circle class="${id}-d draw" pathLength="100" cx="310" cy="300" r="150"/>
        <circle class="${id}-d draw" pathLength="100" cx="310" cy="300" r="96"/>
        <circle class="${id}-d draw" pathLength="100" cx="310" cy="300" r="42"/>
        <rect  class="${id}-d draw" pathLength="100" x="120" y="110" width="380" height="380" rx="26"/>
      </g>
      <g id="${id}-spin" fill="none" stroke="${theme.amber}" stroke-width="3" stroke-linecap="round" opacity="0">
        <path d="M356 262 A64 64 0 0 1 310 380"/><path d="M258 336 A64 64 0 0 1 350 240"/></g>
      <g id="${id}-gear" opacity="0">
        <circle cx="470" cy="120" r="30" fill="none" stroke="${theme.amber}" stroke-width="3"/>
        <circle cx="470" cy="120" r="11" fill="none" stroke="${theme.amber}" stroke-width="3"/>
        <g stroke="${theme.amber}" stroke-width="3" stroke-linecap="round">
          <line x1="470" y1="82" x2="470" y2="94"/><line x1="470" y1="146" x2="470" y2="158"/>
          <line x1="432" y1="120" x2="444" y2="120"/><line x1="496" y1="120" x2="508" y2="120"/></g></g>
      <g id="${id}-lead" opacity="0">
        <path class="draw" pathLength="100" d="M170 180 L96 130 H24" fill="none" stroke="${theme.cyan}" stroke-width="2"/>
        <text class="dim-label" x="20" y="124" text-anchor="end">${callout}</text></g>
      <g id="${id}-dims" opacity="0">
        <line x1="120" y1="512" x2="500" y2="512" stroke="${theme.cyan}" stroke-width="2"/>
        <path d="M120 512 l14 -7 v14 Z" fill="${theme.cyan}"/><path d="M500 512 l-14 -7 v14 Z" fill="${theme.cyan}"/>
        <text class="dim-label" x="310" y="508" text-anchor="middle" dy="-14">TO SPEC</text></g>
    </svg>
    <div style="max-width:40cqw;">
      <div class="fig" id="${id}-figl" style="opacity:0;">${esc(fig)}</div>
      <h2 class="display" id="${id}-head" style="font-size:3.6cqw;margin-top:1cqw;opacity:0;">${hl(scene, theme.amber)}</h2>
      ${scene.subtext ? `<div class="body" id="${id}-sub" style="opacity:0;margin-top:1.4cqw;">${esc(scene.subtext)}</div>` : ""}
    </div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `settle("#${id}",${T},${r(ctx.L)});`,
    `tl.to(".${id}-d",{strokeDashoffset:0,duration:0.65,ease:"power1.inOut",stagger:0.14},${r(T + 0.35)});`,
    `tl.fromTo("#${id}-center",{opacity:0},{opacity:0.55,duration:0.5},${r(T + 1.5)});`,
    `tl.fromTo("#${id}-spin",{opacity:0,rotation:-40,svgOrigin:"310 300"},{opacity:1,rotation:0,duration:0.7,ease:"power2.out",svgOrigin:"310 300"},${r(T + 1.4)});`,
    `tl.to("#${id}-spin",{rotation:120,duration:${r(Math.max(1.4, ctx.L - 1.8))},ease:"sine.inOut",svgOrigin:"310 300"},${r(T + 2.1)});`,
    `tl.fromTo("#${id}-gear",{opacity:0},{opacity:1,duration:0.4},${r(T + 1.6)});`,
    `tl.to("#${id}-gear",{rotation:200,duration:${r(Math.max(1.4, ctx.L - 1.6))},ease:"none",svgOrigin:"470 120"},${r(T + 1.7)});`,
    `tl.fromTo("#${id}-lead",{opacity:0},{opacity:1,duration:0.5},${r(T + 1.9)});`,
    `tl.to("#${id}-lead .draw",{strokeDashoffset:0,duration:0.5,ease:"power2.out"},${r(T + 1.9)});`,
    `tl.fromTo("#${id}-dims",{opacity:0},{opacity:1,duration:0.5},${r(T + 2.1)});`,
    `tl.fromTo("#${id}-figl",{opacity:0,x:-18},{opacity:1,x:0,duration:0.5,ease:"power2.out"},${r(T + 0.6)});`,
    `tl.fromTo("#${id}-head",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.9)});`,
    scene.subtext ? `tl.fromTo("#${id}-sub",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},${r(T + 1.3)});` : "",
  ].filter(Boolean);
  return { html, s };
}

function bpFlowchart(scene, ctx) {
  const { id, T, theme, fig } = ctx;
  let items = bullets(scene, 3);
  if (items.length < 2) items = ctx.S.flowchartSteps;
  const boxes = items.map((t, i) => {
    const parts = String(t).split(/[:—-]\s?/);
    const bt = (parts[0] || t).trim().slice(0, 22);
    const bs = (parts[1] || "").trim().slice(0, 60) || String(scene.subtext || "").slice(0, 60);
    return { i, bt: `0${i + 1} · ${bt}`, bs };
  });
  const arrow = () => `<svg class="${id}-arrow" width="90" height="40" viewBox="0 0 90 40" style="overflow:visible;flex:0 0 auto;">
      <line class="draw" pathLength="100" x1="4" y1="20" x2="66" y2="20" stroke="${theme.cyan}" stroke-width="3"/>
      <path class="${id}-ah" d="M62 8 L86 20 L62 32 Z" fill="${theme.cyan}" opacity="0"/></svg>`;
  const boxHtml = boxes.map((b) => `<div class="fbox ${id}-box" style="opacity:0;">
      <span class="btick tl"></span><span class="btick br"></span>
      <svg class="fcheck" viewBox="0 0 44 44"><path class="${id}-chk draw" pathLength="100" d="M8 24 L18 34 L36 10" fill="none" stroke="${theme.amber}" stroke-width="6" stroke-linecap="round"/></svg>
      <div class="fb-t">${esc(b.bt)}</div><div class="fb-s">${esc(b.bs)}</div>
      <div class="pbar"><i class="${id}-fill"></i></div></div>`);
  const row = boxHtml.slice(1).reduce((acc, bx) => acc + arrow() + bx, boxHtml[0]);
  const html = `<div class="clip bp-scene" id="${id}" data-start="${T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="safe">
    <div class="fig" id="${id}-figl" style="opacity:0;">${esc(fig)}</div>
    <div style="display:flex;align-items:center;gap:2.4cqw;margin-top:2.6cqw;">${row}</div>
  </div></div>`;
  const per = Math.max(0.5, (ctx.L - 1.4) / boxes.length);
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `settle("#${id}",${T},${r(ctx.L)});`,
    `tl.fromTo("#${id}-figl",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.5)});`,
    `tl.fromTo(".${id}-box",{opacity:0,y:26},{opacity:1,y:0,duration:0.5,ease:"power2.out",stagger:${r(per)}},${r(T + 0.9)});`,
    `tl.to(".${id}-chk",{strokeDashoffset:0,duration:0.4,ease:"power2.out",stagger:${r(per)}},${r(T + 1.2)});`,
    `tl.fromTo(".${id}-fill",{scaleX:0},{scaleX:1,transformOrigin:"left center",duration:0.5,ease:"power2.out",stagger:${r(per)}},${r(T + 1.2)});`,
    `tl.to(".${id}-arrow .draw",{strokeDashoffset:0,duration:0.35,ease:"power2.out",stagger:${r(per)}},${r(T + 1.3)});`,
    `tl.fromTo(".${id}-ah",{opacity:0},{opacity:1,duration:0.25,stagger:${r(per)}},${r(T + 1.55)});`,
  ];
  return { html, s };
}

function bpPlot(scene, ctx) {
  const { id, T, theme, fig } = ctx;
  const n = pickNumber(scene) || { pre: "", target: 97, suf: "" };
  const bigTxt = `${n.pre}0${n.suf}`;
  const head = String(scene.headline || ctx.S.plotHeadline).toUpperCase();
  const html = `<div class="clip bp-scene" id="${id}" data-start="${T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="safe" style="flex-direction:row;gap:6cqw;text-align:left;">
    <svg id="${id}-plot" width="740" height="480" viewBox="0 0 740 480" style="width:36cqw;flex:0 0 auto;overflow:visible;">
      <line class="${id}-ax draw" pathLength="100" x1="70" y1="30" x2="70" y2="410" stroke="${theme.ink}" stroke-width="3"/>
      <line class="${id}-ax draw" pathLength="100" x1="70" y1="410" x2="710" y2="410" stroke="${theme.ink}" stroke-width="3"/>
      <clipPath id="${id}clip"><rect id="${id}-clipr" x="70" y="20" width="0" height="400"/></clipPath>
      <path d="M70 380 C 190 370, 250 300, 350 240 S 560 90, 700 62 L700 410 L70 410 Z" fill="${theme.amberWash("0.10")}" clip-path="url(#${id}clip)"/>
      <path id="${id}-curve" class="draw" pathLength="100" d="M70 380 C 190 370, 250 300, 350 240 S 560 90, 700 62" fill="none" stroke="${theme.amber}" stroke-width="5" stroke-linecap="round"/>
      <line id="${id}-scan" x1="70" y1="30" x2="70" y2="410" stroke="${theme.cyan}" stroke-width="2" opacity="0"/>
      <circle id="${id}-end" cx="700" cy="62" r="10" fill="${theme.amber}" opacity="0"/>
      <ellipse id="${id}-ring" class="draw" pathLength="100" cx="602" cy="96" rx="118" ry="52" fill="none" stroke="${theme.red}" stroke-width="4" transform="rotate(-9 602 96)"/>
      <text class="dim-label" x="86" y="52" fill="${theme.faint}">QUALITY</text>
      <text class="dim-label" x="600" y="444" fill="${theme.faint}">EFFORT&#8594;0</text>
    </svg>
    <div style="max-width:38cqw;">
      <div class="fig" id="${id}-figl" style="opacity:0;">${esc(fig)}</div>
      <div class="display" id="${id}-num" style="font-size:4.6cqw;color:${theme.amber};margin-top:1cqw;opacity:0;">${esc(bigTxt)}</div>
      <h2 class="display" id="${id}-head" style="font-size:2.6cqw;color:${theme.cyan};margin-top:0.4cqw;opacity:0;">${esc(head)}</h2>
      ${scene.subtext ? `<div class="body" id="${id}-sub" style="opacity:0;margin-top:1.2cqw;">${esc(scene.subtext)}</div>` : ""}
    </div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `settle("#${id}",${T},${r(ctx.L)});`,
    `tl.to("#${id}-plot .${id}-ax",{strokeDashoffset:0,duration:0.5,ease:"power2.out"},${r(T + 0.4)});`,
    `tl.to("#${id}-curve",{strokeDashoffset:0,duration:${r(Math.max(0.9, ctx.L - 2.2))},ease:"power1.inOut"},${r(T + 0.9)});`,
    `tl.to("#${id}-clipr",{attr:{width:640},duration:${r(Math.max(0.9, ctx.L - 2.2))},ease:"power1.inOut"},${r(T + 0.9)});`,
    `tl.fromTo("#${id}-scan",{opacity:0.8,x:0},{x:630,duration:${r(Math.max(0.9, ctx.L - 2.2))},ease:"power1.inOut"},${r(T + 0.9)});`,
    `tl.set("#${id}-scan",{opacity:0},${r(T + Math.max(0.9, ctx.L - 2.2) + 0.9)});`,
    `tl.fromTo("#${id}-end",{opacity:0,scale:0,svgOrigin:"700 62"},{opacity:1,scale:1,duration:0.4,ease:"back.out(2)"},${r(T + ctx.L - 1.6)});`,
    `tl.to("#${id}-ring",{strokeDashoffset:0,duration:0.6,ease:"power2.out"},${r(T + ctx.L - 1.3)});`,
    `tl.fromTo("#${id}-figl",{opacity:0,x:-16},{opacity:1,x:0,duration:0.5},${r(T + 0.6)});`,
    `tl.fromTo("#${id}-num",{opacity:0,y:20},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.9)});`,
    `countTxt("#${id}-num",${n.target},${r(T + 0.9)},${r(Math.max(0.8, ctx.L - 2))},${JSON.stringify(n.pre)},${JSON.stringify(n.suf)});`,
    `tl.fromTo("#${id}-head",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},${r(T + 1.2)});`,
    scene.subtext ? `tl.fromTo("#${id}-sub",{opacity:0,y:14},{opacity:1,y:0,duration:0.5},${r(T + 1.5)});` : "",
  ].filter(Boolean);
  return { html, s };
}

function bpRevisions(scene, ctx) {
  const { id, T, theme, fig } = ctx;
  let lines = bullets(scene, 3);
  if (lines.length < 2) lines = ctx.S.revisionsLines;
  const stamp = String(scene.emphasis || ctx.S.revisionsStamp).slice(0, 20);
  const rowHtml = lines.map((t, i) => `<div style="position:relative;margin-top:${i ? "0.9cqw" : "1.8cqw"};">
      <div class="display ${id}-line" style="font-size:3.6cqw;opacity:0;color:${theme.faint};">${esc(String(t).toUpperCase())}</div>
      <svg viewBox="0 0 400 24" preserveAspectRatio="none" style="position:absolute;left:-1%;top:50%;width:102%;height:1.6cqw;margin-top:-0.8cqw;overflow:visible;">
        <line class="${id}-strike draw" pathLength="100" x1="0" y1="10" x2="400" y2="10" stroke="${theme.red}" stroke-width="7" stroke-linecap="round"/>
        <path class="${id}-scrib draw" pathLength="100" d="M4 12 L36 4 L70 16 L104 6 L138 17 L172 5 L206 15 L240 6 L274 16 L308 5 L342 15 L376 7 L398 12" fill="none" stroke="${theme.red}" stroke-width="3" stroke-linecap="round" opacity="0.85"/>
      </svg></div>`).join("");
  const html = `<div class="clip bp-scene" id="${id}" data-start="${T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="safe" style="align-items:flex-start;text-align:left;padding-left:14%;">
    <div class="fig" id="${id}-figl" style="opacity:0;">${esc(fig)}</div>
    ${rowHtml}
    <div style="position:relative;">
      <div class="stamp" id="${id}-stamp" style="margin-top:2.4cqw;opacity:0;">${esc(stamp)}</div>
    </div>
    <div class="mono" id="${id}-note" style="opacity:0;margin-top:1.3cqw;font-size:1.05cqw;letter-spacing:0.2em;color:#7E9CC2;">FILED PER SPEC 001 · NO FURTHER REVISIONS EXPECTED</div>
  </div></div>`;
  const per = Math.max(0.4, (ctx.L - 2.2) / lines.length);
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `settle("#${id}",${T},${r(ctx.L)});`,
    `tl.fromTo("#${id}-figl",{opacity:0,x:-16},{opacity:1,x:0,duration:0.5},${r(T + 0.5)});`,
    `tl.fromTo(".${id}-line",{opacity:0,x:-20},{opacity:1,x:0,duration:0.45,ease:"power2.out",stagger:${r(per)}},${r(T + 0.8)});`,
    `tl.to(".${id}-strike",{strokeDashoffset:0,duration:0.4,ease:"power2.in",stagger:${r(per)}},${r(T + 1.1)});`,
    `tl.to(".${id}-scrib",{strokeDashoffset:0,duration:0.4,ease:"none",stagger:${r(per)}},${r(T + 1.2)});`,
    `slam("#${id}-stamp",${r(T + ctx.L - 1.5)},-8);`,
    `tl.fromTo("#${id}-note",{opacity:0},{opacity:1,duration:0.5},${r(T + ctx.L - 1.0)});`,
  ];
  return { html, s };
}

function bpCta(scene, ctx) {
  const { id, T, theme } = ctx;
  const mark = String(scene.headline || scene.title || "KEYFRAME").toUpperCase();
  const tag = esc(scene.subtext || ctx.S.ctaTag);
  const cta = esc(String(scene.emphasis || ctx.S.ctaButton).slice(0, 26));
  const html = `<div class="clip bp-scene" id="${id}" data-start="${T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="safe">
    <div style="position:relative;">
      <svg id="${id}-burst" width="560" height="240" viewBox="0 0 560 240" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);overflow:visible;" data-layout-allow-occlusion>
        <g stroke="${theme.cyan}" stroke-width="2.5" stroke-linecap="round" opacity="0.8">
          <line class="${id}-ray" x1="280" y1="120" x2="280" y2="10"/><line class="${id}-ray" x1="280" y1="120" x2="280" y2="230"/>
          <line class="${id}-ray" x1="280" y1="120" x2="60" y2="40"/><line class="${id}-ray" x1="280" y1="120" x2="500" y2="40"/>
          <line class="${id}-ray" x1="280" y1="120" x2="60" y2="200"/><line class="${id}-ray" x1="280" y1="120" x2="500" y2="200"/></g>
      </svg>
      <div class="display" id="${id}-mark" style="font-size:6.4cqw;opacity:0;">${esc(mark)}</div>
    </div>
    <div style="position:relative;">
      <div class="body" id="${id}-tag" style="opacity:0;margin-top:0.8cqw;">${tag}</div>
      <svg width="480" height="14" viewBox="0 0 480 14" style="position:absolute;left:50%;margin-left:-12.5cqw;bottom:-0.7cqw;width:25cqw;overflow:visible;">
        <path id="${id}-under" class="draw" pathLength="100" d="M4 8 C 130 2, 350 2, 476 8" fill="none" stroke="${theme.amber}" stroke-width="4" stroke-linecap="round"/></svg>
    </div>
    <div style="position:relative;margin-top:2.6cqw;display:inline-block;">
      <svg width="620" height="190" viewBox="0 0 620 190" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);overflow:visible;" data-layout-allow-occlusion>
        <rect id="${id}-dashrect" x="10" y="10" width="600" height="170" rx="85" fill="none" stroke="rgba(143,216,255,0.75)" stroke-width="3" stroke-dasharray="14 16" opacity="0"/></svg>
      <div class="cta" id="${id}-cta" style="opacity:0;">${cta} <span>&#8594;</span></div>
    </div>
  </div>
  <div class="stamp" id="${id}-stamp" style="position:absolute;right:10%;top:15%;font-size:2.2cqw;border-width:0.34cqw;color:${theme.amber};border-color:${theme.amber};opacity:0;">APPROVED FOR PRODUCTION</div>
  </div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `settle("#${id}",${T},${r(ctx.L)});`,
    `tl.fromTo(".${id}-ray",{scaleY:0,transformOrigin:"280px 120px",opacity:0},{scaleY:1,opacity:0.8,duration:0.5,ease:"power2.out",stagger:0.05},${r(T + 0.5)});`,
    `tl.fromTo("#${id}-mark",{opacity:0,y:24,scale:0.94},{opacity:1,y:0,scale:1,duration:0.6,ease:"back.out(1.6)"},${r(T + 0.5)});`,
    `tl.fromTo("#${id}-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.5},${r(T + 1.0)});`,
    `tl.to("#${id}-under",{strokeDashoffset:0,duration:0.6,ease:"power2.out"},${r(T + 1.2)});`,
    `tl.fromTo("#${id}-dashrect",{opacity:0},{opacity:1,duration:0.4},${r(T + 1.4)});`,
    `tl.to("#${id}-dashrect",{strokeDashoffset:-30,duration:${r(Math.max(1, ctx.L - 1.5))},ease:"none"},${r(T + 1.4)});`,
    `tl.fromTo("#${id}-cta",{opacity:0,y:16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.5)});`,
    `slam("#${id}-stamp",${r(T + 1.2)},9);`,
  ];
  return { html, s };
}

// PLATE — a real screenshot/image presented as a technical drawing plate: a bordered
// window with corner registration ticks, a "PLATE 0N" header, a drafting scan-reveal
// wipe, a slow Ken-Burns, a dimension line, and side copy. Keeps the screenshot in
// full colour (lightly graded to the palette) so it stays readable.
function bpPlate(scene, ctx, asset) {
  const { id, T, theme, fig } = ctx;
  const ratio = Number(asset.ratio) || (asset.width && asset.height ? asset.width / asset.height : 0);
  const portrait = ratio && ratio < 0.9;
  const plateW = portrait ? "24cqw" : "42cqw";
  const winH = portrait ? "34cqw" : "24cqw";
  const callout = esc(String(scene.emphasis || ctx.S.plateCallout).toUpperCase()).slice(0, 18);
  const objPos = "top center";
  const rev = Math.max(1.0, ctx.L - 2.0);
  // Scan-bar travel in px (transform x, not `left` — lint wants sub-pixel transforms):
  // the plate window is plateW of the canvas width, so the bar crosses that distance.
  const travel = Math.round((portrait ? 0.24 : 0.42) * ((ctx.dims && ctx.dims.width) || 1920));
  const html = `<div class="clip bp-scene" id="${id}" data-start="${T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="safe" style="flex-direction:row;gap:6cqw;text-align:left;">
    <div class="bp-plate" id="${id}-plate" style="opacity:0;position:relative;width:${plateW};flex:0 0 auto;">
      <div class="bp-plate-head">PLATE 0${ctx.sheetNo} <span>${callout}</span></div>
      <div class="bp-plate-win" style="height:${winH};">
        <img src="${esc(asset.path)}" alt="${esc(asset.alt || "screenshot")}" style="object-position:${objPos};">
        <div class="bp-plate-tint"></div><div class="bp-plate-lines"></div>
        <div class="bp-plate-cover" id="${id}-cover"></div>
        <div class="bp-plate-scan" id="${id}-pscan"></div>
      </div>
      <span class="btick tl"></span><span class="btick br"></span>
      <svg class="bp-pdim" viewBox="0 0 400 40" style="width:100%;height:2cqw;margin-top:0.7cqw;overflow:visible;">
        <line class="draw ${id}-pd" pathLength="100" x1="6" y1="24" x2="394" y2="24" stroke="${theme.cyan}" stroke-width="2"/>
        <path class="${id}-pa" d="M6 24 l12 -6 v12 Z" fill="${theme.cyan}" opacity="0"/><path class="${id}-pa" d="M394 24 l-12 -6 v12 Z" fill="${theme.cyan}" opacity="0"/>
        <text class="dim-label" x="200" y="16" text-anchor="middle">CAPTURED · TO SPEC 1:1</text>
      </svg>
    </div>
    <div style="max-width:36cqw;">
      <div class="fig" id="${id}-figl" style="opacity:0;">${esc(fig)}</div>
      <h2 class="display" id="${id}-head" style="font-size:3.4cqw;margin-top:1cqw;opacity:0;">${hl(scene, theme.amber)}</h2>
      ${scene.subtext ? `<div class="body" id="${id}-sub" style="opacity:0;margin-top:1.3cqw;">${esc(scene.subtext)}</div>` : ""}
    </div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `settle("#${id}",${T},${r(ctx.L)});`,
    `tl.fromTo("#${id}-plate",{opacity:0,y:24},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.5)});`,
    `tl.fromTo("#${id}-cover",{scaleX:1},{scaleX:0,transformOrigin:"right center",duration:0.85,ease:"power2.inOut"},${r(T + 0.8)});`,
    `tl.fromTo("#${id}-pscan",{x:0,opacity:0.9},{x:${travel},duration:0.85,ease:"power2.inOut"},${r(T + 0.8)});`,
    `tl.set("#${id}-pscan",{opacity:0},${r(T + 1.7)});`,
    `tl.fromTo("#${id}-plate img",{scale:1.06},{scale:1.0,duration:${r(rev)},ease:"sine.out"},${r(T + 0.8)});`,
    `tl.to(".${id}-pd",{strokeDashoffset:0,duration:0.5,ease:"power2.out"},${r(T + 1.6)});`,
    `tl.fromTo(".${id}-pa",{opacity:0},{opacity:1,duration:0.3,stagger:0.08},${r(T + 2.0)});`,
    `tl.fromTo("#${id}-figl",{opacity:0,x:-16},{opacity:1,x:0,duration:0.5},${r(T + 0.7)});`,
    `tl.fromTo("#${id}-head",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.0)});`,
    scene.subtext ? `tl.fromTo("#${id}-sub",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},${r(T + 1.4)});` : "",
  ].filter(Boolean);
  return { html, s };
}

const BUILDERS = { title: bpTitle, figure: bpFigure, flowchart: bpFlowchart, plot: bpPlot, revisions: bpRevisions, cta: bpCta, plate: bpPlate };
const FIG_LABEL = { title: "Blueprint № 001 — motion picture", figure: "Fig. — the figure", flowchart: "Fig. — the pipeline", plot: "Fig. — measured output", revisions: "Revision history", cta: "", plate: "Fig. — plate" };

// ---- chrome (content-independent) --------------------------------------------
function chromeHtml(theme, W, H, title) {
  return `
  <div id="sheet" class="clip" data-start="0" data-duration="__D__" data-track-index="0" data-layout-allow-occlusion style="opacity:0;">
    <div id="grid-minor"></div><div id="grid-major"></div>
    <div class="ruler-t" style="top:0;"></div><div class="ruler-T" style="top:0;"></div>
    <div class="ruler-t" style="bottom:0;"></div><div class="ruler-T" style="bottom:0;"></div>
    <div class="ruler-l" style="left:0;"></div><div class="ruler-L" style="left:0;"></div>
    <div class="ruler-l" style="right:0;"></div><div class="ruler-L" style="right:0;"></div>
    <svg id="compass-rose" viewBox="0 0 120 120"><g fill="none" stroke="#BFE0FF" stroke-width="1.6">
      <circle cx="60" cy="60" r="54"/><circle cx="60" cy="60" r="40"/><circle cx="60" cy="60" r="4"/>
      <line x1="60" y1="2" x2="60" y2="118"/><line x1="2" y1="60" x2="118" y2="60"/>
      <line x1="19" y1="19" x2="101" y2="101"/><line x1="101" y1="19" x2="19" y2="101"/>
      <path d="M60 12 L66 40 L60 34 L54 40 Z" fill="#BFE0FF"/></g></svg>
    <div class="construct" id="con1" style="left:-10%; top:24%; width:120%; height:1px; transform:rotate(9deg);"></div>
    <div class="construct" id="con2" style="left:-10%; top:72%; width:120%; height:1px; transform:rotate(-7deg);"></div>
    <div id="sheet-vignette"></div>
  </div>
  <div class="clip" data-start="0" data-duration="__D__" data-track-index="1" data-layout-allow-occlusion>
    <svg class="regmark" style="left:1.9cqw;top:1.9cqw;" viewBox="0 0 48 48"><path d="M2 46 V2 H46"/></svg>
    <svg class="regmark" style="right:1.9cqw;top:1.9cqw;" viewBox="0 0 48 48"><path d="M2 2 H46 V46"/></svg>
    <svg class="regmark" style="left:1.9cqw;bottom:1.9cqw;" viewBox="0 0 48 48"><path d="M2 2 V46 H46"/></svg>
    <svg class="regmark" style="right:1.9cqw;bottom:1.9cqw;" viewBox="0 0 48 48"><path d="M46 2 V46 H2"/></svg>
  </div>
  <div class="clip" data-start="0" data-duration="__D__" data-track-index="15" data-layout-allow-occlusion style="background:none;">
    <div id="wipe" style="opacity:0;"><i></i></div>
  </div>
  <div id="chrome" class="clip" data-start="0" data-duration="__D__" data-track-index="19" data-layout-allow-occlusion style="opacity:0;">
    <div id="ch-v"></div><div id="ch-h"></div><div id="ch-dot"></div><div id="ch-xy">X 0960 · Y 0540</div>
    <div id="titleblock">
      <div class="tb-row"><span class="tb-k">PROJECT</span><span class="tb-v">${esc(String(title || "KEYFRAME").toUpperCase()).slice(0, 22)}</span></div>
      <div class="tb-row"><span class="tb-k">SHEET</span><span class="tb-v" id="tb-sheet">01 / 01</span></div>
      <div class="tb-row"><span class="tb-k">SCALE</span><span class="tb-v">1 : 1</span></div>
      <div class="tb-row"><span class="tb-k">DRAWN BY</span><span class="tb-v">12 AGENTS</span></div>
      <div class="tb-row"><span class="tb-k">REVISIONS</span><span class="tb-v" style="color:${theme.amber};">NONE</span></div>
    </div>
  </div>
  <div id="caps" class="clip" data-start="0" data-duration="__D__" data-track-index="20"><div id="cap-pill"><div id="cap-text"></div></div></div>`;
}

function styleBlock(theme) {
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#06131F; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.groundCss};
    container-type:size; color:${theme.ink}; font-family:${theme.monoStack};
    --sheet:${theme.sheet}; --ink:${theme.ink}; --faint:${theme.faint}; --amber:${theme.amber}; --red:${theme.red}; --cyan:${theme.cyan};
    --line:${theme.line}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:8% 7% 12%; text-align:center; will-change:transform; }
  .display { font-family:${theme.displayStack}; font-weight:700; font-size:5.6cqw; line-height:1.02; letter-spacing:0.01em; color:var(--ink); text-transform:uppercase; }
  .mono { font-family:${theme.monoStack}; }
  .label { font-size:1.15cqw; font-weight:600; letter-spacing:0.28em; text-transform:uppercase; color:var(--amber); }
  .fig { font-size:1.15cqw; font-weight:500; letter-spacing:0.22em; text-transform:uppercase; color:var(--faint); }
  .body { font-size:1.6cqw; font-weight:500; line-height:1.55; color:var(--faint); }
  .caret { display:inline-block; width:0.75cqw; height:2.2cqw; vertical-align:-0.3cqw; background:var(--amber); margin-left:0.3cqw; }
  .stamp { display:inline-block; font-family:${theme.displayStack}; font-weight:700; font-size:3.2cqw; letter-spacing:0.08em; text-transform:uppercase; color:var(--red); border:0.42cqw solid var(--red); border-radius:0.8cqw; padding:0.9cqw 2.6cqw; will-change:transform; }
  #grid-minor { position:absolute; inset:0; pointer-events:none; background-image:linear-gradient(rgba(190,215,255,0.06) 1px, transparent 1px),linear-gradient(90deg, rgba(190,215,255,0.06) 1px, transparent 1px); background-size:1.25cqw 1.25cqw; }
  #grid-major { position:absolute; inset:0; pointer-events:none; background-image:linear-gradient(rgba(190,215,255,0.13) 1px, transparent 1px),linear-gradient(90deg, rgba(190,215,255,0.13) 1px, transparent 1px); background-size:6.25cqw 6.25cqw; }
  .ruler-t { position:absolute; left:0; right:0; height:0.55cqw; pointer-events:none; opacity:0.5; background:repeating-linear-gradient(90deg, rgba(190,215,255,0.4) 0 2px, transparent 2px 1.25cqw); }
  .ruler-T { position:absolute; left:0; right:0; height:1.05cqw; pointer-events:none; opacity:0.55; background:repeating-linear-gradient(90deg, rgba(190,215,255,0.5) 0 2px, transparent 2px 6.25cqw); }
  .ruler-l { position:absolute; top:0; bottom:0; width:0.55cqw; pointer-events:none; opacity:0.5; background:repeating-linear-gradient(0deg, rgba(190,215,255,0.4) 0 2px, transparent 2px 1.25cqw); }
  .ruler-L { position:absolute; top:0; bottom:0; width:1.05cqw; pointer-events:none; opacity:0.55; background:repeating-linear-gradient(0deg, rgba(190,215,255,0.5) 0 2px, transparent 2px 6.25cqw); }
  #compass-rose { position:absolute; right:6cqw; top:9cqw; width:11cqw; height:11cqw; opacity:0.14; pointer-events:none; }
  .construct { position:absolute; pointer-events:none; background:rgba(143,216,255,0.09); }
  #sheet-vignette { position:absolute; inset:0; pointer-events:none; background:radial-gradient(120% 120% at 50% 42%, transparent 55%, rgba(4,14,28,0.5) 100%); }
  .regmark { position:absolute; width:2.4cqw; height:2.4cqw; }
  .regmark path { stroke:var(--faint); stroke-width:2.5; fill:none; }
  #titleblock { position:absolute; right:1.8cqw; bottom:1.8cqw; width:22cqw; border:1px solid var(--line); background:rgba(9,26,48,0.72); font-size:0.95cqw; color:var(--faint); }
  #titleblock .tb-row { display:flex; border-top:1px solid var(--line); }
  #titleblock .tb-row:first-child { border-top:none; }
  #titleblock .tb-k { width:38%; padding:0.5cqw 0.9cqw; letter-spacing:0.14em; border-right:1px solid var(--line); color:#7E9CC2; }
  #titleblock .tb-v { flex:1; padding:0.5cqw 0.9cqw; letter-spacing:0.1em; color:var(--ink); white-space:nowrap; }
  #ch-v { position:absolute; top:0; bottom:0; left:50%; width:1px; background:rgba(143,216,255,0.34); }
  #ch-h { position:absolute; left:0; right:0; top:50%; height:1px; background:rgba(143,216,255,0.34); }
  #ch-dot { position:absolute; left:50%; top:50%; width:1.5cqw; height:1.5cqw; margin:-0.75cqw 0 0 -0.75cqw; border:1.5px solid var(--cyan); border-radius:50%; }
  #ch-xy { position:absolute; left:50%; top:50%; margin:0.9cqw 0 0 1.1cqw; font-size:0.85cqw; letter-spacing:0.14em; color:rgba(143,216,255,0.75); white-space:nowrap; }
  #wipe { position:absolute; top:0; bottom:0; left:0; width:100%; pointer-events:none; background:linear-gradient(100deg, rgba(24,70,120,0) 0%, rgba(29,82,138,0.92) 26%, #1B4A7E 50%, rgba(29,82,138,0.92) 74%, rgba(24,70,120,0) 100%); }
  #wipe i { position:absolute; top:0; bottom:0; right:24%; width:2px; background:rgba(143,216,255,0.8); display:block; }
  .draw { stroke-dasharray:100; stroke-dashoffset:100; }
  .dim-label { font-size:1cqw; letter-spacing:0.12em; fill:${theme.cyan}; font-family:${theme.monoStack}; }
  .pencil { position:absolute; width:2.4cqw; pointer-events:none; will-change:transform; }
  .fbox { width:19cqw; padding:1.6cqw 1.9cqw 1.4cqw; border:2px dashed rgba(190,215,255,0.55); border-radius:0.7cqw; background:rgba(11,30,54,0.5); text-align:left; position:relative; }
  .fbox .fb-t { font-family:${theme.displayStack}; font-weight:700; font-size:1.9cqw; letter-spacing:0.06em; color:var(--ink); text-transform:uppercase; }
  .fbox .fb-s { font-size:1.15cqw; color:var(--faint); margin-top:0.6cqw; line-height:1.5; min-height:3.6cqw; }
  .fbox .pbar { margin-top:0.9cqw; height:0.4cqw; background:${theme.amberWash("0.18")}; border-radius:999px; overflow:hidden; }
  .fbox .pbar i { display:block; height:100%; background:var(--amber); transform:scaleX(0); transform-origin:left center; border-radius:999px; }
  .fcheck { position:absolute; right:1.2cqw; top:1.2cqw; width:2.2cqw; height:2.2cqw; }
  .btick { position:absolute; width:1.1cqw; height:1.1cqw; border-color:var(--cyan) !important; }
  .btick.tl { left:-0.45cqw; top:-0.45cqw; border-left:2.5px solid; border-top:2.5px solid; }
  .btick.br { right:-0.45cqw; bottom:-0.45cqw; border-right:2.5px solid; border-bottom:2.5px solid; }
  .cta { display:inline-flex; align-items:center; gap:1.1cqw; font-family:${theme.displayStack}; font-weight:700; font-size:2.3cqw; letter-spacing:0.04em; text-transform:uppercase; color:#132441; background:var(--amber); padding:1.35cqw 3.4cqw; border-radius:0.6cqw; box-shadow:0 0 0 0.35cqw ${theme.amberWash("0.22")}; will-change:transform; }
  .bp-plate-head { font-family:${theme.monoStack}; font-size:1cqw; letter-spacing:0.18em; text-transform:uppercase; color:var(--faint); margin-bottom:0.7cqw; display:flex; justify-content:space-between; align-items:baseline; }
  .bp-plate-head span { color:var(--amber); }
  .bp-plate-win { position:relative; width:100%; overflow:hidden; border:2px solid rgba(143,216,255,0.5); border-radius:0.5cqw; background:var(--sheet); box-shadow:0 1.2cqw 3cqw rgba(4,14,28,0.5); }
  .bp-plate-win img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; filter:saturate(0.94) contrast(1.04); display:block; will-change:transform; }
  .bp-plate-tint { position:absolute; inset:0; background:linear-gradient(180deg, rgba(23,65,111,0.10), rgba(12,36,64,0.22)); pointer-events:none; }
  .bp-plate-lines { position:absolute; inset:0; background:repeating-linear-gradient(0deg, rgba(143,216,255,0.045) 0 2px, transparent 2px 4px); pointer-events:none; }
  .bp-plate-cover { position:absolute; inset:0; background:var(--sheet); }
  .bp-plate-scan { position:absolute; top:0; bottom:0; left:0; width:0.3cqw; background:${theme.cyan}; box-shadow:0 0 2cqw ${theme.cyan}; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:5%; z-index:50; pointer-events:none; }
  #cap-pill { max-width:74%; height:fit-content; flex:0 0 auto; text-align:center; padding:0.9cqw 2.4cqw; border-radius:0.5cqw; opacity:0; background:rgba(7,20,38,0.85); border:1px solid ${theme.amberWash("0.45")}; }
  #cap-text { font-family:${theme.monoStack}; font-weight:500; font-size:1.4cqw; line-height:1.35; color:var(--ink); }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null } = {}) {
  const theme = blueprintTheme(brandSkin);
  // Localizable copy: caller may override any STRINGS key; with no override the
  // module defaults are used verbatim, so output is byte-identical. No module-level
  // mutable state — S is a per-call value threaded through ctx (concurrency-safe).
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1920, H = (dims && dims.height) || 1080;
  let scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 4, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);

  // Real screenshots/photos (Creative-Director-approved) become "technical plates".
  // Best-scored first; each is placed on a `figure` scene (the flexible slot), so
  // the composer's own line-art figures give way to a real captured screen. A scene
  // that already carries a strong content type (title/flowchart/plot/revisions/cta)
  // is never overwritten by a plate.
  const images = (Array.isArray(assets) ? assets : [])
    .filter(plateOk)
    .sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  // A screenshot the planner PINNED to a specific scene (asset.sceneId — usually a
  // feature/proof/how scene) claims that scene as a plate, so real product shots are
  // shown even when the scene's headline would otherwise route to plot/flowchart. The
  // rest form a pool that fills any remaining plain `figure` scene. Title/CTA scenes
  // keep their own strong treatment and are never overwritten.
  const byScene = new Map();
  const pool = [];
  for (const a of images) {
    const sid = a.sceneId != null ? String(a.sceneId) : null;
    if (sid && !byScene.has(sid)) byScene.set(sid, a);
    else pool.push(a);
  }
  let pooli = 0;

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [];
  const sceneScripts = [];
  const sceneStarts = [];
  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 4);
    let arch = bpArchetype(scene, i, scenes.length);
    let asset = null;
    const sid = scene.id != null ? String(scene.id) : `s${i + 1}`;
    const ends = arch === "title" || arch === "cta"; // keep the opener/closer intact
    if (!ends && byScene.has(sid)) { arch = "plate"; asset = byScene.get(sid); }
    else if (arch === "figure" && pooli < pool.length) { arch = "plate"; asset = pool[pooli++]; }
    const figBase = FIG_LABEL[arch] || "";
    const fig = (arch === "figure" || arch === "plate") ? `Fig. ${i} — ${String(scene.purpose || (arch === "plate" ? "captured" : "the figure"))}` : figBase;
    const ctx = { id: `s${i + 1}`, T, L, E: r(T + L), isLast: i === scenes.length - 1, track: 2 + i, dims: { width: W, height: H }, theme, fig, sheetNo: i + 1, S };
    const built = (BUILDERS[arch] || bpFigure)(scene, ctx, asset);
    bodyParts.push(built.html);
    sceneStarts.push(T);
    sceneScripts.push(built.s.join("\n"));
    // Scene hand-off: the sheet-wipe covers the cut and the framework windows the
    // clip out at its data-duration boundary, so there is NO opacity exit tween on
    // the .clip itself (that trips gsap_exit_missing_hard_kill — the framework owns
    // clip visibility). A single boundary hard-kill keeps a backward seek clean.
    if (!ctx.isLast) {
      sceneScripts.push(`wipe(${r(T + L)});`);
      sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
      sceneScripts.push(`cursor(${[-320, 60, -300, 40, 0, -110][i % 6]},${[-110, -60, 40, 80, -40, 60][i % 6]},${r(T + L * 0.15)});`);
    }
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && (c.text != null))
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const chrome = chromeHtml(theme, W, H, sb.title).replace(/__D__/g, String(D));

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  function reps(t,c){return Math.max(0,Math.floor(t/c)-1);}
  function kill(id,t){tl.set(id,{opacity:0},t);}
  function pad2(n){return String(Math.round(n)).padStart(2,"0");}
  function pad4(n){return String(Math.round(n)).padStart(4,"0");}
  function type(sel,str,at,dur){var o={n:0};tl.to(o,{n:str.length,duration:dur,ease:"none",snap:{n:1},onUpdate:function(){var e=$(sel);if(e)e.textContent=str.slice(0,Math.round(o.n));}},at);}
  function countTxt(sel,to,at,dur,pre,suf){var o={v:0};tl.to(o,{v:to,duration:dur,ease:"power2.out",snap:{v:1},onUpdate:function(){var e=$(sel);if(e)e.textContent=pre+Math.round(o.v)+suf;}},at);}
  function slam(sel,at,rot){tl.fromTo(sel,{opacity:0,scale:2.4,rotation:rot},{opacity:0.96,scale:1,rotation:rot,duration:0.34,ease:"power4.in"},at);tl.fromTo(sel,{x:0},{x:3,duration:0.05,yoyo:true,repeat:3,ease:"none"},at+0.34);}
  gsap.set("#wipe",{xPercent:-115,opacity:1});
  function wipe(at){tl.set("#wipe",{opacity:1},at-0.31);tl.fromTo("#wipe",{xPercent:-115},{xPercent:115,duration:0.6,ease:"power2.inOut"},at-0.3);tl.set("#wipe",{opacity:0},at+0.31);}
  function cursor(px,py,at){tl.to(["#ch-v","#ch-dot","#ch-xy"],{x:px,duration:0.8,ease:"power2.inOut"},at);tl.to(["#ch-h","#ch-dot","#ch-xy"],{y:py,duration:0.8,ease:"power2.inOut"},at);tl.set("#ch-xy",{textContent:"X "+pad4(960+px)+" · Y "+pad4(540+py)},at+0.8);}
  function settle(sel,start,dur){tl.fromTo(sel+" .safe",{scale:1.035},{scale:1.0,duration:dur,ease:"sine.out"},start);}

  tl.fromTo("#sheet",{opacity:0},{opacity:1,duration:0.8},0);
  tl.fromTo("#grid-major",{backgroundPosition:"0cqw 0cqw"},{backgroundPosition:"6.25cqw 6.25cqw",duration:Math.max(6,D-4),ease:"none"},0);
  tl.to("#compass-rose",{rotation:130,duration:D,ease:"none",transformOrigin:"center center"},0);
  tl.to(["#con1","#con2"],{opacity:0.5,duration:5,ease:"sine.inOut",yoyo:true,repeat:reps(D,5),stagger:1.4},0);
  tl.fromTo("#chrome",{opacity:0},{opacity:1,duration:0.6},0.4);
  tl.fromTo("#titleblock",{y:26,opacity:0},{y:0,opacity:1,duration:0.6,ease:"power2.out"},0.6);
  tl.to("#ch-dot",{scale:1.5,duration:0.8,ease:"sine.inOut",yoyo:true,repeat:reps(D-1,0.8),transformOrigin:"center center"},0.8);
  cursor(-340,-110,0.5);

  ${sceneScripts.join("\n  ")}

  var cues=${JSON.stringify(cues)};
  var starts=${JSON.stringify(sceneStarts)};
  tl.to({},{duration:D,ease:"none",onUpdate:function(){
    var now=tl.time();
    var cap=$("#cap-pill"),txt=$("#cap-text");
    if(cap&&txt){var a=null;for(var k=0;k<cues.length;k++){if(now>=cues[k][0]&&now<cues[k][1]){a=cues[k];break;}}if(a){if(txt.textContent!==a[2])txt.textContent=a[2];cap.style.opacity="1";}else cap.style.opacity="0";}
    var sn=$("#tb-sheet");
    if(sn){var idx=0;for(var j=0;j<starts.length;j++){if(now>=starts[j])idx=j;}var lab=pad2(idx+1)+" / "+pad2(starts.length);if(sn.textContent!==lab)sn.textContent=lab;}
  }},0);

  window.__timelines=window.__timelines||{};
  window.__timelines["vid"]=tl;
  if(typeof navigator==="undefined"||!navigator.webdriver){tl.play(0);tl.eventCallback("onComplete",function(){tl.restart();});}
})();`;

  const indexHtml = [
    `<!DOCTYPE html>`, `<html lang="en">`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="${GSAP_CDN}"></script>`,
    `<style>`, styleBlock(theme), `</style>`,
    `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
    chrome,
    bodyParts.join("\n"),
    `</div>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
