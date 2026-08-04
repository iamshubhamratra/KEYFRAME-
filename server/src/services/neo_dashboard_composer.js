// NEO DASHBOARD composer — a native GSAP + canvas "analytics dashboard coming alive" film.
// The pack `neo-dashboard` (manifest renderer:"neo-dashboard") routes here from
// attemptLlmComposition, exactly like the flagship / kinetic / product-showcase composers.
//
// Ported from the imported OmniMotion/React template ("Neo Dashboard"). The React runtime
// is replaced by KEYFRAME's HyperFrames contract, but the identity is kept:
//   • a PERSISTENT animated DASHBOARD SHELL backdrop — a near-black data surface with an
//     ambient dot-grid, drifting accent glow, a slow scan line and a vignette — painted on
//     ONE <canvas> as a pure function of the renderer's hf-seek time (deterministic; flows
//     continuously across every cut, so scene boundaries frame-match on the pure shell).
//   • live KPI cards with counting stat values + sparklines, drawn line/area CHARTS and
//     growing bars, a browser-chrome device-frame that holds real dashboard screenshots,
//     and a logo-reveal CTA.
//
// EVERYTHING is theme-driven: neoTheme(accent) derives the surface tint, panel, border,
// grid, glow, chart series and the CTA — so a brand skin recolors the WHOLE film
// (backgrounds, cards, charts, glows, series, accents, CTA), not just the text.
//
// Engineering contract (identical to the other native composers): one paused GSAP timeline
// on window.__timelines["vid"]; direct-child .clip scenes on unique tracks; a boundary
// opacity:0 hard-kill per scene (the shell persists behind them); ONE seek-safe caption
// node (#cap-text) driven by a single onUpdate proxy; finite repeats; cqw units +
// container-type:size (portrait-native, 9:16); hidden = opacity:0 only. Portrait is
// detected from dims (W<H); no manifest flag. Deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { varyArchetypes } = require("./motion_planner");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { logoMark } = require("./logo_render");
const { plateBox } = require("./responsive");
const { charSpans, wordCharSpans } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");
const { GSAP_CDN, r, esc, hexToRgb, relLum, longestWord, bullets, logoAssetOf, grainUri } = require("./composer_kit");

// Space Grotesk / JetBrains Mono / Inter are the template's exact fonts. Space Grotesk and
// JetBrains Mono are bundled for the CDN-free render; Inter falls to system-ui.
const DISPLAY = "Space Grotesk";
const MONO = "JetBrains Mono";
const BODY = "Inter";

// The template's default indigo series + dashboard grounds when no brand is applied.
const DEF_ACCENT = "#6366F1";
const BG_BASE = "#0A0D16";
const BG_DEEP = "#070912";
const PANEL_BASE = "#10131F";
const PANEL_TOP = "#161A28";
const POS = "#37E6A4"; // fixed "up / live" indicator green (semantic UI, not brand)

// ---- helpers -----------------------------------------------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function seedFrom(str) { let h = 2166136261; const s = String(str || "dashboard"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
// deterministic pseudo-noise for chart wobble (mirrors the template's hash()).
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
// finite yoyo repeat count for a segment of `t` seconds at period `c`.
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

// ---- theme -------------------------------------------------------------------
// resolveBrand fits the brand accent to the near-black dashboard ground (isDark:true →
// lifted for contrast) and passes the pack accent through untouched when no skin — so a
// null skin renders the exact default dashboard byte-for-byte and resolvedBrand is null
// (honest "unbranded"). When applied, the single accent becomes the brand's and every
// derived value (surface tint, panel, border, grid, glow, series, CTA) follows, and
// resolvedBrand echoes what was worn.
function neoTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let accent = DEF_ACCENT, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: BG_DEEP, isDark: true, packAccents: [DEF_ACCENT] });
    if (brand.applied) {
      accent = brand.accent || accent;
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: [accent], emphasis: brand.emphasis, adjusted: brand.adjusted,
        dropped: brand.dropped, tier: brand.tier, applied: true,
      };
    }
  } catch { accent = DEF_ACCENT; resolvedBrand = null; }
  const onAccent = relLum(accent) > 0.55 ? BG_DEEP : "#FFFFFF";
  return {
    accent, onAccent, pos: POS, bgDeep: BG_DEEP,
    bg: `color-mix(in oklab, ${accent} 8%, ${BG_BASE})`,
    panel: `color-mix(in oklab, ${accent} 6%, ${PANEL_BASE})`,
    panelTop: `color-mix(in oklab, ${accent} 12%, ${PANEL_TOP})`,
    border: `color-mix(in oklab, ${accent} 28%, transparent)`,
    grid: `color-mix(in oklab, ${accent} 12%, transparent)`,
    accentSoft: `color-mix(in oklab, ${accent} 30%, transparent)`,
    gradient: `linear-gradient(120deg, ${accent}, color-mix(in oklab, ${accent} 55%, #ffffff))`,
    ink: "#EEF2FB", dim: "rgba(238,242,251,0.6)", faint: "rgba(238,242,251,0.32)",
    displayStack: `'${DISPLAY}', 'Inter', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy (localizable) ------------------------------------------------
const STRINGS = {
  openKicker: "[ Analytics ]",
  metricsKicker: "The numbers",
  chartKicker: "Performance",
  showcaseKicker: "The workspace",
  galleryKicker: "Every view",
  ctaKicker: "Ready when you are",
  ctaButton: "Open dashboard",
  ctaTagline: "The analytics-grade AI video studio.",
  ctaUrl: "keyframe.ai",
};

// ---- content extraction (shared shapes) --------------------------------------
function wordsOf(t) { return String(t || "").trim().split(/\s+/).filter(Boolean); }
function pickNumber(scene) {
  const src = [scene.emphasis, scene.subtext, scene.headline, ...(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])]
    .map((x) => String(x || "")).find((x) => /\d/.test(x)) || "";
  return /\d/.test(src);
}
// Headline sized so long copy never overflows the portrait column.
// PORTRAIT FILL. The length ladder below keeps long copy from overflowing the column —
// but it is aspect-BLIND, and cqw is a fraction of WIDTH, so a headline occupies the same
// share of the line in 16:9 and 9:16 while a 9:16 frame is 177cqw TALL. Short headlines
// therefore sat as a small line in a very tall empty frame: the "under-illustrated /
// massive empty space" blocker the 9:16 audit kept finding.
//
// In portrait the slack is spent on the headlines that HAVE slack: short copy grows, long
// copy is left exactly where the ladder put it, so nothing that previously fitted starts
// to overflow.  is set once per build (see buildComposition).
let _portrait = false;
// FIT, rather than guess. The ladder below buckets by character count, which decides how
// many LINES a headline needs — not whether it fits the frame. Headlines are word spans, so
// they wrap between words and the binding constraint is the LONGEST WORD: that word cannot
// break, so if it is wider than the column it leaves the frame however many lines exist.
// Capping on the whole string instead would shrink perfectly good two-line headlines.
//
// 0.56em is the mean advance of a heavy display face; it is an estimate, so it is paired
// with a wrapping container as the safety net rather than trusted on its own.
const MEAN_ADVANCE_EM = 0.56;
const SAFE_LINE_CQW = 92;
function fitCap(text) {
  const len = longestWord(text).length;
  return len ? SAFE_LINE_CQW / (len * MEAN_ADVANCE_EM) : Infinity;
}
function headlineSize(text, base) {
  const len = String(text || "").length;
  const s = len > 42 ? base * 0.62 : len > 28 ? base * 0.76 : len > 18 ? base * 0.88 : base;
  const p = _portrait ? s * (len > 28 ? 1.0 : len > 18 ? 1.08 : 1.18) : s;
  return Math.min(p, fitCap(text));
}
// Split a headline into word spans for the reveal; the last word carries the accent.
function accentWords(id, text) {
  const ws = wordsOf(text).slice(0, 10);
  return ws.map((w) =>
    `<span class="nd-gword ${id}-gw" style="display:inline-block;opacity:0;margin:0 0.22em 0.08em 0;">${esc(w)}</span>`
  ).join("");
}
// Parse a KPI bullet into a { num, suf, label, text } for a counting stat card. A bullet
// with a number counts up to it (e.g. "8420 renders", "128% growth", "0.4s latency"); a
// text-only bullet is shown as its own value label.
function kpiOf(txt) {
  const s = String(txt || "").trim();
  const m = s.match(/([\d][\d,]*(?:\.\d+)?)/);
  if (m) {
    const raw = m[1];
    const num = parseFloat(raw.replace(/,/g, "")) || 0;
    let rest = s.slice(0, m.index) + s.slice(m.index + raw.length);
    const sufM = rest.match(/^\s*([%x+sKkMm]{1,2})/);
    const suf = sufM ? sufM[1] : "";
    if (sufM) rest = rest.slice(sufM[0].length);
    const label = rest.replace(/^[·:\-\s]+/, "").replace(/[·:\-\s]+$/, "").trim();
    return { num, suf, label, text: null };
  }
  return { num: null, suf: "", label: "", text: s };
}

// ---- deterministic chart geometry (build-time) -------------------------------
// A rising line + area, points computed exactly like the template's LineChart.
function chartGeom(seed, N) {
  N = N || 24;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    const base = 0.25 + 0.5 * x;
    const wob = 0.16 * Math.sin(i * 0.9 + seed) + 0.08 * hash(i + seed);
    pts.push([r(x * 100), r((1 - clamp(base + wob, 0.05, 0.95)) * 100)]);
  }
  const line = pts.map((p) => `${p[0]},${p[1]}`).join(" ");
  const area = `0,100 ${line} 100,100`;
  return { line, area };
}
// A drawn line/area chart SVG. GSAP animates `.${cls}-line` strokeDashoffset (the draw) and
// `.${cls}-area` opacity — a pure attribute tween, deterministic and seek-safe.
function chartSvg(cls, theme, seed, color) {
  const c = color || theme.accent;
  const g = chartGeom(seed);
  const DASH = 320;
  const gid = `${cls}-ar`;
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style="display:block;">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${c}" stop-opacity="0.35"/><stop offset="100%" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
    <polygon class="${cls}-area" points="${g.area}" fill="url(#${gid})" style="opacity:0;"></polygon>
    <polyline class="${cls}-line" points="${g.line}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" style="stroke-dasharray:${DASH};stroke-dashoffset:${DASH};"></polyline>
  </svg>`;
}
// A growing bar column (decorative series). GSAP scales `.${cls}-bar` on Y from 0.
function barsSvg(cls, theme) {
  const vals = [0.5, 0.72, 0.44, 0.86, 0.63, 0.95, 0.58];
  return `<div style="width:100%;height:100%;display:flex;align-items:flex-end;gap:1.4cqw;">${vals.map((v, i) =>
    `<div class="${cls}-bar" style="flex:1;height:${r(v * 100)}%;transform:scaleY(0);transform-origin:bottom;border-radius:3px;background:${i === 5 ? theme.accent : theme.accentSoft};box-shadow:${i === 5 ? `0 0 2cqw ${theme.accent}` : "none"};"></div>`
  ).join("")}</div>`;
}

// ---- asset gate + browser-chrome device-frame --------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is CTA / key-moment material, not a dashboard plate
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}

// A browser-chrome device-frame holding a real dashboard screenshot — or, with no asset, an
// intentional branded placeholder (panel wash + faint dot-grid + a drawn mock chart line) so
// an empty slot still reads as a live dashboard, never blank. Absolutely filled; caller sizes it.
function browserFrame(theme, asset, keySeed) {
  const inner = asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div style="position:absolute;inset:0;background:${theme.gradient};opacity:0.14;"></div>` +
      `<div style="position:absolute;inset:0;background-image:radial-gradient(${theme.grid} 1.2px, transparent 1.2px);background-size:6% 8%;opacity:0.6;"></div>` +
      `<div style="position:absolute;left:8%;right:8%;top:34%;bottom:16%;">${chartSvg(`ph${keySeed || 0}`, theme, (keySeed || 1) + 3)}</div>`;
  return `<div style="position:absolute;inset:0;border-radius:2.4cqw;overflow:hidden;background:${theme.panel};border:0.16cqw solid ${theme.border};box-shadow:0 4cqw 12cqw -4cqw ${theme.accent}, 0 0 0 1px rgba(255,255,255,0.05) inset;">
    <div style="position:absolute;left:0;right:0;top:0;height:9%;display:flex;align-items:center;gap:1.4cqw;padding:0 3cqw;background:${theme.panelTop};border-bottom:1px solid ${theme.border};z-index:2;">
      <span style="width:1.6cqw;height:1.6cqw;border-radius:50%;background:${theme.faint};"></span>
      <span style="width:1.6cqw;height:1.6cqw;border-radius:50%;background:${theme.faint};"></span>
      <span style="width:1.6cqw;height:1.6cqw;border-radius:50%;background:${theme.faint};"></span>
      <div style="flex:1;margin-left:1.4cqw;height:52%;border-radius:999px;background:${theme.bg};border:1px solid ${theme.border};display:flex;align-items:center;gap:1cqw;padding:0 2cqw;">
        <span style="width:1.2cqw;height:1.2cqw;border-radius:50%;background:${theme.accent};box-shadow:0 0 1cqw ${theme.accent};"></span>
        <span style="flex:1;height:0.5cqw;border-radius:999px;background:${theme.grid};"></span>
      </div>
    </div>
    <div style="position:absolute;left:0;right:0;top:9%;bottom:0;overflow:hidden;">${inner}
      <div style="position:absolute;left:0;right:0;top:0;height:34%;background:linear-gradient(rgba(255,255,255,0.08),transparent);pointer-events:none;"></div>
    </div>
  </div>`;
}
// Dashboards are wide, so the browser card is shorter; portrait shots get a taller frame.
function frameHmul(asset) {
  const ratio = Number(asset && asset.ratio) || (asset && asset.width && asset.height ? asset.width / asset.height : 0);
  if (ratio && ratio < 0.9) return 1.4;  // portrait capture
  if (ratio && ratio > 1.6) return 0.6;  // wide desktop / dashboard
  return 0.72;                           // default (short — dashboard-ish)
}

// PORTRAIT PLATE SIZING. `frameHmul` above sets this pack's frame PROPORTIONS; nothing
// was checking the resulting plate against how tall the frame actually is. In a 9:16
// column (177.8cqw tall) the fixed widths below left a plate at ~20-30% of the height
// with the rest empty, and a portrait phone capture overflowed its band. plateBox scales
// the pack's own (width, height) pair uniformly — so these proportions and every
// downstream `parseFloat(pw) * frameHmul(asset)` height stay correct — and is a no-op in
// landscape, where the existing layouts were tuned. See services/responsive.js.
function fitPlateW(ctx, wCqw, asset) {
  const w0 = typeof wCqw === "string" ? parseFloat(wCqw) : Number(wCqw);
  const box = plateBox(ctx && ctx.W, ctx && ctx.H, w0, w0 * frameHmul(asset));
  return `${box.w}cqw`;
}


// ---- scene clip open ---------------------------------------------------------
function open(id, ctx) { return `<div class="clip nd-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

// ---- archetype selection -----------------------------------------------------
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "open";
  if (i === total - 1 || k === "cta" || /cta|close|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (k === "chart" || k === "graph" || /chart|graph|trend|growth|analytic/.test(p + k)) return "chart";
  if (k === "stat" || k === "countdown" || (pickNumber(scene) && /proof|result|metric|stat|number|kpi/.test(p + k))) return "metrics";
  if (bullets(scene, 2).length >= 2) return "metrics";
  return "showcase";
}

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// SCENE — OPEN: the dashboard boots; a mono kicker, a big display title (last word in
// accent) and a subtitle rise center. Opener energy.
function bOpen(scene, ctx, sceneAssets) {
  const { id, T, L, S, theme, portrait } = ctx;
  const kick = esc(scene.kicker || S.openKicker);
  const title = scene.headline || scene.title || "";
  // A hook may open on a hero dashboard shot when one was assigned; else it stays text-only.
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const fw = portrait ? "72cqw" : "52cqw";
  const html = `${open(id, ctx)}<div class="nd-safe">
    <div class="nd-kicker ${id}-kick" style="opacity:0;margin-bottom:3cqw;">${kick}</div>
    <div class="nd-display ${id}-title" style="opacity:0;text-align:center;font-size:${r(headlineSize(title, 12))}cqw;">${accentWords(id, title)}</div>
    ${scene.subtext ? `<div class="nd-body ${id}-sub" style="opacity:0;margin-top:3.4cqw;max-width:82%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
    ${asset ? `<div class="${id}-frame" style="opacity:0;position:relative;width:${fw};height:${r(parseFloat(fw) * frameHmul(asset))}cqw;margin-top:5cqw;">${browserFrame(theme, asset, 1)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-gw",{opacity:0,y:24},{opacity:1,y:0,duration:0.55,ease:"power3.out",stagger:0.07},${r(T + 0.4)});`,
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1)});` : "",
    asset ? `tl.fromTo(".${id}-frame",{opacity:0,y:60,scale:0.9},{opacity:1,y:0,scale:1,duration:0.75,ease:"power3.out"},${r(T + 1)});` : "",
    asset ? `tl.to(".${id}-frame",{y:"-=1.4cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2, 2)},overwrite:"auto"},${r(T + 2)});` : "",
    `tl.to(".${id}-title",{scale:1.02,duration:${r(Math.max(1.6, L - 1.6))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.2)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — METRICS: a headline over a grid of live KPI cards — each a mono label, a big
// counting stat value and a drawn sparkline. Values come from the storyboard's bullets.
function bMetrics(scene, ctx) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.metricsKicker);
  const items = bullets(scene, 4);
  const kpis = (items.length ? items : [scene.emphasis, scene.subtext].filter(Boolean).map(String)).slice(0, 4).map(kpiOf);
  const cards = kpis.map((kp, i) => {
    const color = i % 2 === 1 ? theme.pos : theme.accent;
    const valId = `${id}-v${i}`;
    const valHtml = kp.num != null
      ? `<div id="${valId}" class="nd-kpi-val" style="color:${color};">0</div>`
      : `<div class="nd-kpi-val" style="color:${theme.ink};font-size:5cqw;line-height:1.1;">${esc(kp.text || "")}</div>`;
    return `<div class="nd-card ${id}-card" style="opacity:0;width:43cqw;padding:4cqw 4cqw 4.6cqw;">
      <div class="nd-kpi-label">${esc((kp.label || kp.text || "").toUpperCase().slice(0, 18))}</div>
      ${valHtml}
      <div style="height:5cqw;margin-top:2.4cqw;">${chartSvg(`${id}s${i}`, theme, i + 5, color)}</div>
    </div>`;
  }).join("");
  const html = `${open(id, ctx)}<div class="nd-safe">
    <div class="nd-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    ${scene.headline ? `<div class="nd-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;margin-bottom:5cqw;">${esc(scene.headline)}</div>` : ""}
    <div style="display:flex;flex-wrap:wrap;gap:3cqw;justify-content:center;width:100%;">${cards}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    scene.headline ? `tl.fromTo(".${id}-head",{opacity:0,y:20},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});` : "",
    `tl.fromTo(".${id}-card",{opacity:0,y:34,scale:0.92},{opacity:1,y:0,scale:1,duration:0.6,ease:"power3.out",stagger:0.12},${r(T + 0.55)});`,
    `tl.fromTo(".${id}s0-area,.${id}s1-area,.${id}s2-area,.${id}s3-area",{opacity:0},{opacity:0.9,duration:0.6,ease:"power2.out"},${r(T + 0.9)});`,
    `tl.fromTo(".${id}s0-line,.${id}s1-line,.${id}s2-line,.${id}s3-line",{strokeDashoffset:320},{strokeDashoffset:0,duration:1,ease:"power2.out"},${r(T + 0.9)});`,
  ];
  kpis.forEach((kp, i) => {
    if (kp.num != null) s.push(`count("#${id}-v${i}",${r(kp.num)},${r(T + 0.8)},${r(Math.max(0.8, L * 0.5))},${JSON.stringify(kp.suf)});`);
  });
  return { html, s: s.filter(Boolean) };
}

// SCENE — CHART: a full-width line/area chart draws in behind a headline and an accent
// delta pill, with a growing bar row beneath. The "watch it climb" beat.
function bChart(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.chartKicker);
  const delta = String(scene.emphasis || (bullets(scene, 3).find((b) => /\d/.test(b)) || "")).slice(0, 16);
  // When the CD assigned a real dashboard screenshot to this proof/stat/analytics scene, it
  // sits in the browser-chrome device-frame — the ▲delta pill and the growing bar row overlay
  // the actual product, preserving the "watch it climb" beat. No asset → the drawn mock chart.
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const html = `${open(id, ctx)}<div class="clip" style="position:absolute;inset:0;">
    <div class="nd-kicker ${id}-kick" style="position:absolute;left:8%;top:11%;opacity:0;">${kick}</div>
    ${scene.headline ? `<div class="nd-h1 ${id}-head" style="position:absolute;left:8%;right:8%;top:15%;opacity:0;font-size:${r(headlineSize(scene.headline, 7))}cqw;">${esc(scene.headline)}</div>` : ""}
    ${delta ? `<div class="nd-delta ${id}-delta" style="position:absolute;right:8%;top:11.5%;opacity:0;">▲ ${esc(delta)}</div>` : ""}
    <div class="nd-card ${id}-card" style="opacity:0;position:absolute;left:8%;right:8%;top:30%;height:34cqw;padding:4cqw;">
      <div style="position:absolute;left:4cqw;right:4cqw;top:4cqw;bottom:4cqw;">${asset ? browserFrame(theme, asset, 2) : chartSvg(`${id}c`, theme, 2)}</div>
    </div>
    <div class="${id}-bars" style="opacity:0;position:absolute;left:8%;right:8%;top:74%;height:16cqw;">${barsSvg(`${id}b`, theme)}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    scene.headline ? `tl.fromTo(".${id}-head",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});` : "",
    `tl.fromTo(".${id}-card",{opacity:0,y:26,scale:0.96},{opacity:1,y:0,scale:1,duration:0.6,ease:"power3.out"},${r(T + 0.5)});`,
    !asset ? `tl.fromTo(".${id}c-area",{opacity:0},{opacity:0.9,duration:0.8,ease:"power2.out"},${r(T + 0.9)});` : "",
    !asset ? `tl.fromTo(".${id}c-line",{strokeDashoffset:320},{strokeDashoffset:0,duration:${r(Math.max(1, L * 0.5))},ease:"power2.out"},${r(T + 0.9)});` : "",
    delta ? `tl.fromTo(".${id}-delta",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.8)"},${r(T + 1.2)});` : "",
    `tl.fromTo(".${id}-bars",{opacity:1},{opacity:1,duration:0.01},${r(T + 1)});`,
    `tl.fromTo(".${id}b-bar",{scaleY:0},{scaleY:1,duration:0.6,ease:"power3.out",stagger:0.06},${r(T + 1)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — SHOWCASE: a single browser-chrome device-frame holds a real dashboard screenshot
// (or a branded live-dashboard placeholder), with a headline and feature chips. The product moment.
function bShowcase(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.showcaseKicker);
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const feats = bullets(scene, 3);
  const w = fitPlateW(ctx, portrait ? 82 : 60, asset);
  const hmul = frameHmul(asset);
  const html = `${open(id, ctx)}<div class="nd-safe">
    <div class="nd-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    ${scene.headline ? `<div class="nd-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;margin-bottom:4.4cqw;">${esc(scene.headline)}</div>` : ""}
    <div class="${id}-frame" style="opacity:0;position:relative;width:${w};height:${r(parseFloat(w) * hmul)}cqw;">${browserFrame(theme, asset, 1)}</div>
    ${feats.length ? `<div style="display:flex;flex-wrap:wrap;gap:1.6cqw;justify-content:center;margin-top:4.4cqw;">${feats.map((f) => `<div class="nd-chip ${id}-chip" style="opacity:0;">${esc(f)}</div>`).join("")}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    scene.headline ? `tl.fromTo(".${id}-head",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});` : "",
    `tl.fromTo(".${id}-frame",{opacity:0,y:70,scale:0.9},{opacity:1,y:0,scale:1,duration:0.75,ease:"power3.out"},${r(T + 0.5)});`,
    `tl.to(".${id}-frame",{y:"-=1.4cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.5, 2)},overwrite:"auto"},${r(T + 1.5)});`,
    feats.length ? `tl.fromTo(".${id}-chip",{opacity:0,y:16},{opacity:1,y:0,duration:0.45,ease:"back.out(1.6)",stagger:0.12},${r(T + 1.2)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — GALLERY: a headline over a row of browser-chrome frames (up to three real
// screenshots), each a slight perspective tilt. "Every view."
function bGallery(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.galleryKicker);
  const shots = (sceneAssets || []).slice(0, 3);
  const tilts = shots.length === 3 ? [-12, 0, 12] : shots.length === 2 ? [-9, 9] : [0];
  const pw = shots.length >= 3 ? "28cqw" : shots.length === 2 ? "40cqw" : fitPlateW(ctx, 62, shots[0]);
  const row = `<div style="display:flex;gap:3cqw;justify-content:center;align-items:center;width:100%;perspective:1500px;">${shots.map((a, i) => {
    const hmul = frameHmul(a);
    return `<div class="${id}-frame" style="opacity:0;width:${pw};text-align:center;"><div style="transform:rotateY(${tilts[i]}deg);transform-style:preserve-3d;position:relative;width:100%;height:${r(parseFloat(pw) * hmul)}cqw;">${browserFrame(theme, a, i + 1)}</div>${Array.isArray(scene.onScreenText) && scene.onScreenText[i] ? `<div style="font-family:${theme.monoStack};font-size:2cqw;color:${theme.dim};margin-top:2.4cqw;letter-spacing:0.14em;text-transform:uppercase;">${esc(scene.onScreenText[i])}</div>` : ""}</div>`;
  }).join("")}</div>`;
  const html = `${open(id, ctx)}<div class="nd-safe">
    <div class="nd-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    ${scene.headline ? `<div class="nd-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;margin-bottom:5cqw;">${esc(scene.headline)}</div>` : ""}
    ${row}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    scene.headline ? `tl.fromTo(".${id}-head",{opacity:0,y:22},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});` : "",
    `tl.fromTo(".${id}-frame",{opacity:0,y:70,scale:0.86},{opacity:1,y:0,scale:1,duration:0.7,ease:"power3.out",stagger:0.14},${r(T + 0.6)});`,
    `tl.to(".${id}-frame",{y:"-=1.4cqw",duration:1.9,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.5, 1.9)},stagger:0.1,overwrite:"auto"},${r(T + 1.5)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — CTA: the logo mark assembles (the user's logo when uploaded, else a built dashboard
// glyph), the wordmark types in char-by-char, a gradient button pulses, a url settles.
function bCta(scene, ctx, logo) {
  const { id, T, L, theme, S } = ctx;
  const word = String(scene.headline || scene.title || "KEYFRAME").slice(0, 20);
  const btn = esc(String(scene.emphasis || S.ctaButton).slice(0, 24));
  const tagline = esc(String(scene.subtext || S.ctaTagline).slice(0, 60));
  const url = esc(String(S.ctaUrl).toUpperCase());
  const mark = logo && logo.path
    ? logoMark(logo, { sizeCqw: 22, ground: theme.bgDeep, glow: theme.accent, escape: esc })
    : `<div style="position:relative;width:20cqw;height:20cqw;">
        <div style="position:absolute;inset:0;border-radius:22%;background:${theme.gradient};box-shadow:0 0 6cqw ${theme.accent};"></div>
        <div style="position:absolute;inset:26%;border-radius:14%;background:${theme.bgDeep};display:flex;align-items:flex-end;justify-content:center;gap:1.4cqw;padding:2.4cqw;">
          <div style="width:2.2cqw;height:40%;border-radius:2px;background:${theme.accent};"></div>
          <div style="width:2.2cqw;height:70%;border-radius:2px;background:${theme.accent};"></div>
          <div style="width:2.2cqw;height:100%;border-radius:2px;background:${theme.accent};"></div>
        </div>
      </div>`;
  const chars = wordCharSpans(word, `${id}-ch`);
  const html = `${open(id, ctx)}<div class="nd-safe">
    <div class="nd-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${esc(scene.kicker || S.ctaKicker)}</div>
    <div class="${id}-mark" style="opacity:0;">${mark}</div>
    <div class="nd-wordmark" style="font-size:${r(Math.min(11, fitCap(word)))}cqw;margin-top:3.4cqw;">${chars}</div>
    <div class="nd-body ${id}-tag" style="opacity:0;margin-top:1.8cqw;">${tagline}</div>
    <div class="nd-btn ${id}-btn" style="opacity:0;margin-top:3.6cqw;color:${theme.onAccent};">${btn} →</div>
    <div class="${id}-url" style="opacity:0;font-family:${theme.monoStack};letter-spacing:0.24em;font-size:2.4cqw;color:${theme.faint};margin-top:2.4cqw;">${url}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.45,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-mark",{opacity:0,scale:0.6,y:20},{opacity:1,scale:1,y:0,duration:0.6,ease:"back.out(1.7)"},${r(T + 0.35)});`,
    `tl.fromTo(".${id}-ch",{opacity:0,y:60},{opacity:1,y:0,duration:0.5,ease:"power3.out",stagger:0.04},${r(T + 0.7)});`,
    `tl.fromTo(".${id}-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.2)});`,
    `tl.fromTo(".${id}-btn",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},${r(T + 1.45)});`,
    `tl.to(".${id}-btn",{scale:1.04,duration:0.7,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2.05, 0.7)},overwrite:"auto"},${r(T + 2.05)});`,
    `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:0.5},${r(T + 1.7)});`,
  ];
  return { html, s };
}

const BUILDERS = { open: bOpen, metrics: bMetrics, chart: bChart, showcase: bShowcase, gallery: bGallery, cta: bCta };

// ---- persistent DASHBOARD SHELL canvas (hf-seek) -----------------------------
// One canvas painted purely from the renderer's hf-seek time: the tinted data surface, an
// ambient dot-grid, a drifting accent glow, a slow scan line and a vignette. Colored ONLY
// with theme.accent (+ the fixed dark grounds), so a brand skin recolors the whole shell.
// Live preview drives it off the timeline; render is hf-seek only (deterministic).
function shellClip(theme, dims, D, seed) {
  const W = dims.width, H = dims.height;
  const [ar, ag, ab] = hexToRgb(theme.accent);
  const [br, bg, bb] = hexToRgb(BG_BASE);
  const [dr, dg, db] = hexToRgb(BG_DEEP);
  const html = `<div id="nd-shell-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${theme.bgDeep};">
    <canvas id="nd-shell" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
  </div>`;
  const script = `(function(){
  var cv=document.getElementById("nd-shell");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;
  var W=${W},H=${H};
  function A(a){return "rgba(${ar},${ag},${ab},"+a+")";}
  var GD="rgba(${dr},${dg},${db},";
  var sd=${seed >>> 0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  var GU=Math.round(W*0.05);
  function draw(t){
    // tinted data surface (top -> deep)
    var sg=cx.createLinearGradient(0,0,0,H);sg.addColorStop(0,"rgb(${br},${bg},${bb})");sg.addColorStop(1,"rgb(${dr},${dg},${db})");cx.fillStyle=sg;cx.fillRect(0,0,W,H);
    // drifting accent glow (top-center)
    var gx=W*0.5+Math.sin(t*0.3)*W*0.14,gy=H*0.26;
    var gg=cx.createRadialGradient(gx,gy,0,gx,gy,W*0.7);gg.addColorStop(0,A(0.16));gg.addColorStop(0.6,A(0));cx.fillStyle=gg;cx.fillRect(0,0,W,H);
    // ambient dot-grid (scrolls slowly up, gentle pulse)
    var off=(t*10)%GU,pulse=0.10+0.05*(0.5+0.5*Math.sin(t*1.2));cx.fillStyle=A(pulse);
    for(var y=-GU+off;y<H+GU;y+=GU){for(var x=0;x<W+GU;x+=GU){cx.beginPath();cx.arc(x,y,1.4,0,6.283);cx.fill();}}
    // slow scan highlight line
    var sy=(t*0.06)%1*H;var sc=cx.createLinearGradient(0,sy-H*0.06,0,sy+H*0.06);sc.addColorStop(0,A(0));sc.addColorStop(0.5,A(0.10));sc.addColorStop(1,A(0));cx.fillStyle=sc;cx.fillRect(0,sy-H*0.06,W,H*0.12);
    // vignette back into the ground
    var vg=cx.createRadialGradient(W*0.5,H*0.32,Math.min(W,H)*0.2,W*0.5,H*0.4,Math.max(W,H)*0.82);vg.addColorStop(0,GD+"0)");vg.addColorStop(1,GD+"0.92)");cx.fillStyle=vg;cx.fillRect(0,0,W,H);
  }
  // Painted ONLY from the renderer's hf-seek time — deterministic, seek-exact, capture-safe.
  window.KF_NEO=draw;window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});draw(0);
})();`;
  return { html, script };
}

// ---- grain overlay (top layer) -----------------------------------------------
const GRAIN_URI = grainUri(0.9);
function grainClip(D) {
  return `<div id="nd-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="40" data-layout-allow-occlusion style="pointer-events:none;background-image:url('${GRAIN_URI}');background-size:260px 260px;opacity:0.04;mix-blend-mode:overlay;"></div>`;
}

// ---- style -------------------------------------------------------------------
function styleBlock(theme, portrait) {
  const safePad = portrait ? "12% 6% 14%" : "8% 8% 10%";
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#000; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.bgDeep}; container-type:size; color:${theme.ink}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .nd-safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${safePad}; text-align:center; }
  .nd-display { font-family:${theme.displayStack}; font-weight:700; line-height:0.98; letter-spacing:-0.03em; color:${theme.ink}; }
  .nd-h1 { font-family:${theme.displayStack}; font-weight:700; line-height:1.04; letter-spacing:-0.02em; color:${theme.ink}; }
  .nd-display .nd-gword:last-child, .nd-h1 .nd-gword:last-child { color:${theme.accent}; }
  .nd-kicker { display:inline-flex; align-items:center; gap:0.9cqw; font-family:${theme.monoStack}; font-weight:600; font-size:2cqw; letter-spacing:0.28em; text-transform:uppercase; color:${theme.accent}; }
  .nd-body { font-family:${theme.bodyStack}; font-weight:500; font-size:2.7cqw; line-height:1.42; color:${theme.dim}; }
  .nd-wordmark { display:flex; flex-wrap:wrap; justify-content:center; text-align:center; gap:0 0.26em; max-width:92%; font-family:${theme.displayStack}; font-weight:700; font-size:11cqw; letter-spacing:-0.02em; color:${theme.ink}; }
  .nd-gword { will-change:transform,opacity; }
  .nd-card { background:${theme.panel}; border:1px solid ${theme.border}; border-radius:2.4cqw; position:relative; overflow:hidden; box-shadow:0 4cqw 12cqw -6cqw rgba(0,0,0,0.7); will-change:transform,opacity; }
  .nd-kpi-label { font-family:${theme.monoStack}; font-weight:600; font-size:2cqw; letter-spacing:0.1em; color:${theme.dim}; }
  .nd-kpi-val { font-family:${theme.displayStack}; font-weight:700; font-size:8cqw; line-height:1; letter-spacing:-0.02em; margin-top:1.4cqw; }
  .nd-delta { font-family:${theme.displayStack}; font-weight:700; font-size:3.4cqw; color:${theme.pos}; }
  .nd-chip { display:inline-flex; align-items:center; padding:1.6cqw 3cqw; border-radius:999px; background:rgba(255,255,255,0.04); border:1px solid ${theme.border}; backdrop-filter:blur(6px); font-family:${theme.monoStack}; font-weight:600; font-size:2.4cqw; letter-spacing:0.06em; color:${theme.ink}; white-space:nowrap; will-change:transform,opacity; }
  .nd-btn { display:inline-flex; align-items:center; gap:1cqw; padding:2.8cqw 6.4cqw; border-radius:3cqw; background:${theme.gradient}; font-family:${theme.displayStack}; font-weight:700; font-size:3.4cqw; letter-spacing:0.02em; box-shadow:0 2cqw 6cqw -1.5cqw ${theme.accent}; will-change:transform,opacity; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:${portrait ? "16%" : "7%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:82%; height:fit-content; flex:0 0 auto; text-align:center; padding:1.4cqw 3cqw; opacity:0; border-radius:2cqw; background:rgba(6,8,16,0.72); border:1px solid ${theme.border}; backdrop-filter:blur(8px); }
  #cap-text { font-family:${theme.bodyStack}; font-weight:600; font-size:2.6cqw; line-height:1.35; color:${theme.ink}; }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null } = {}) {
  // Portrait drives the headline fill ladder (see headlineSize).
  _portrait = (dims && dims.height > dims.width) || false;
  const theme = neoTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const seed = seedFrom(sb.title || (scenes[0] && scenes[0].headline) || "dashboard");

  // ---- Assets: distribute real screenshots across DISPLAY-CAPABLE scenes -------
  // EVERY content scene can host its assigned screenshot — hook (open), KPI (metrics),
  // proof/analytics (chart), workspace (showcase) and gallery — so the Creative Director's
  // per-asset `sceneId` hint lands on the very scene it names instead of being stranded.
  // Only the CTA is display-incapable (its slot is the logo mark). The `sceneId` is honored
  // when present, else the shot is redistributed to the least-loaded display scene — so
  // every usable screenshot actually appears. The logo is reserved for the CTA mark.
  const logo = logoAssetOf(assets);
  const shots = (Array.isArray(assets) ? assets : []).filter(screenOk)
    .sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const baseArch = scenes.map((scene, i) => archetypeFor(scene, i, scenes.length));
  // ANTI-REPETITION (services/motion_planner). archetypeFor above ends in a single
  // fallthrough, so every middle scene of a text-led film lands on the same type and the
  // film reads as one backdrop with rotating copy. This breaks adjacent duplicates using
  // ONLY this pack's own generic scene types — data-shaped ones (stats/chart/gallery)
  // keep their type, because their builders have preconditions a swap would violate.
  const { archetypes: __varied } = varyArchetypes(baseArch, {
    pool: Object.keys(BUILDERS),
    seedKey: scenes.map((s) => s && s.id).join("|"),
  });
  for (let __i = 0; __i < baseArch.length; __i++) baseArch[__i] = __varied[__i];
  const canShow = (a) => a === "showcase" || a === "gallery" || a === "metrics" || a === "chart" || a === "open";
  const displayIdx = scenes.map((_, i) => i).filter((i) => canShow(baseArch[i]));
  // Belt-and-suspenders: if no scene is display-capable yet real shots exist, force the first
  // non-CTA content scene to a browser-frame showcase so a valuable screenshot is never dropped.
  if (shots.length && !displayIdx.length) {
    const j = scenes.findIndex((s, i) => baseArch[i] !== "open" && baseArch[i] !== "cta");
    if (j >= 0) { baseArch[j] = "showcase"; displayIdx.push(j); }
  }
  const sceneIdOf = (i) => (scenes[i].id != null ? String(scenes[i].id) : `s${i + 1}`);
  const sceneShots = scenes.map(() => []);
  if (displayIdx.length && shots.length) {
    const leftovers = [];
    for (const a of shots) {
      const sid = a.sceneId != null ? String(a.sceneId) : null;
      const target = sid != null ? displayIdx.find((i) => sceneIdOf(i) === sid) : undefined;
      if (target != null) sceneShots[target].push(a); else leftovers.push(a);
    }
    for (const a of leftovers) {
      let best = displayIdx[0];
      for (const i of displayIdx) if (sceneShots[i].length < sceneShots[best].length) best = i;
      sceneShots[best].push(a);
    }
    for (const i of displayIdx) sceneShots[i] = sceneShots[i].slice(0, 3);
  }

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [], sceneScripts = [];

  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 5);
    let arch = baseArch[i];
    let sceneAssets = sceneShots[i];
    // A display-capable scene that received screenshots shows them in the composer's own
    // browser-chrome device-frame. chart/open KEEP their identity (the proof scene shows the
    // dashboard behind its ▲delta + bars; the hook opens on a hero shot). metrics/showcase/
    // gallery: 2+ → a gallery row of frames, 1 → a focused browser-frame showcase. Scenes with
    // no shot keep their base synthetic form (KPI cards, drawn chart, branded placeholder).
    if (canShow(arch) && sceneAssets.length) {
      if (arch === "chart" || arch === "open") { sceneAssets = sceneAssets.slice(0, 1); }
      else if (sceneAssets.length >= 2) { arch = "gallery"; sceneAssets = sceneAssets.slice(0, 3); }
      else { arch = "showcase"; sceneAssets = sceneAssets.slice(0, 1); }
    }
    const ctx = { id: `s${i + 1}`, T, L, E: r(T + L), i, isLast: i === scenes.length - 1, track: 2 + i, theme, S, W, H, portrait };
    const built = (BUILDERS[arch] || bShowcase)(scene, ctx, arch === "cta" ? logo : sceneAssets);
    bodyParts.push(built.html);
    sceneScripts.push(built.s.filter(Boolean).join("\n  "));
    if (!ctx.isLast) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const shell = shellClip(theme, { width: W, height: H }, D, seed);
  const caps = `<div id="caps" class="clip" data-start="0" data-duration="${D}" data-track-index="50"><div id="cap-pill"><div id="cap-text"></div></div></div>`;

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  function kill(id,t){tl.set(id,{opacity:0},t);}
  // scrub a substring of full text across [at, at+dur] — deterministic typing.
  function type(sel,full,at,dur){var o={n:0};tl.to(o,{n:full.length,duration:dur,ease:"none",snap:{n:1},onUpdate:function(){var e=$(sel);if(e){var s=full.slice(0,Math.round(o.n));if(e.textContent!==s)e.textContent=s;}}},at);}
  // scrub an integer counter up to the target across the window — deterministic stat count.
  function count(sel,to,at,dur,suf){var o={n:0};tl.to(o,{n:to,duration:dur,ease:"power1.out",onUpdate:function(){var e=$(sel);if(e){var s=Math.round(o.n).toLocaleString("en-US")+(suf||"");if(e.textContent!==s)e.textContent=s;}}},at);}

  ${sceneScripts.join("\n  ")}

  var cues=${JSON.stringify(cues)};
  tl.to({},{duration:D,ease:"none",onUpdate:function(){
    var now=tl.time();
    if(window.KF_NEO)window.KF_NEO(now); // drive the shell off the deterministic timeline (live preview)
    var cap=$("#cap-pill"),txt=$("#cap-text");
    if(cap&&txt){var a=null;for(var k=0;k<cues.length;k++){if(now>=cues[k][0]&&now<cues[k][1]){a=cues[k];break;}}if(a){if(txt.textContent!==a[2])txt.textContent=a[2];cap.style.opacity="1";}else cap.style.opacity="0";}
  }},0);

  window.__timelines=window.__timelines||{};
  window.__timelines["vid"]=tl;
  if(typeof navigator==="undefined"||!navigator.webdriver){tl.play(0);tl.eventCallback("onComplete",function(){tl.restart();});}
})();`;

  const indexHtml = [
    `<!DOCTYPE html>`, `<html lang="en">`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="${GSAP_CDN}"></script>`,
    `<style>`, styleBlock(theme, portrait), `</style>`, `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
    shell.html,
    bodyParts.join("\n"),
    grainClip(D),
    caps,
    `</div>`,
    `<script>`, shell.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  // resolvedBrand echoes the accent the film actually wore (or null when no brand was
  // applied), so graph.persistWornBrand discloses the true painted palette.
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
