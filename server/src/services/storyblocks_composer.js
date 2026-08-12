// STORY BLOCKS composer — a faithful native GSAP port of the user's
// "Story Blocks" bundled reel template (story-blocks-film.jsx). The pack
// `story-blocks` routes here, so selecting the template gives THE TEMPLATE:
// an edited-video story told in bold solid color panels (terracotta / olive /
// ink / cream) that whip in from ALTERNATING sides with skew as they travel,
// kinetic Caprasimo words that spring in one by one (rotate settle + a subtle
// wobble that keeps living after they land), internal jump-cut BEATS inside
// scenes (Statement's two-beat swap, Stats' three-beat counter takeover), a
// conveyor Montage (two tile rows traveling opposite directions the whole
// scene), tilted marquee tickers, rotating starbursts, chapter kicker chips
// and the brand chip + progress-rail chrome over a cream paper world. Only
// the CONTENT is swapped: headlines/chips/tiles/stats from the script and
// Template Director, the website screenshot in the browser frames, site
// photos in the conveyor tiles, the brand logo on the CTA tile.
//
// Portrait (the template's native 1080×1920) reproduces the film's layout
// ~1:1 in cqw; landscape re-stages each beat two-column with the same type,
// motion and world. Render contract is template_engine's (seek-safe, finite
// repeats, hard kills); this module is design only.

const { deriveTheme } = require("./scene_kit");
const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const E = require("./template_engine");
const { esc, r, rgba, mix, inkOn, statsOf, breakLines, bullets, fit } = E;

const FH = "'Caprasimo', Georgia, serif";
const FB = "'Figtree', system-ui, sans-serif";

// ---- theme --------------------------------------------------------------------
function theme(manifest, brandSkin, { framePack, land } = {}) {
  const t = deriveTheme(framePack || "story-blocks", {}, brandSkin);
  const ground = t.ground || "#f5ead8";
  const ink = t.ink || "#201e1d";
  const accent = (t.accents && t.accents[0]) || "#c67139";
  const accent2 = (t.accents && t.accents[1]) || "#56633f";
  return {
    ...t, ground, ink, accent, accent2,
    paper: ground,
    surface: mix(ground, accent, 0.12),
    accent700: mix(accent, "#000000", 0.18),
    displayStack: FH, bodyStack: FB,
    fontFace: (isBundled("Caprasimo") ? fontFaceCss("Caprasimo") : "") + (isBundled("Figtree") ? fontFaceCss("Figtree") : ""),
  };
}

// ---- vocabulary (Template Director casts onto these) --------------------------
const TEMPLATE_SCENES = [
  {
    type: "hook", bestFor: "opening — who this is and the promise",
    look: "A terracotta color block: chapter chip snapping in, giant Caprasimo words springing in one by one (they keep wobbling after they land), a browser-framed screenshot traveling across the panel, a tilted marquee ticker at the base.",
    slots: { kicker: "max 22 chars, uppercase (e.g. CHAPTER ONE)", headline: "2-3 short lines ('|' breaks), 2-4 words each", subtext: "one marquee phrase, max 44 chars" },
    media: ["desktop"],
  },
  {
    type: "statement", bestFor: "the problem or a bold belief",
    look: "An ink block with a slow starburst: TWO jump-cut beats — the first half of the line slams in, holds, whips out; the second half takes its place with a supporting sentence. All type, no media.",
    slots: { headline: "2-4 short lines — first half beat one, second half beat two", subtext: "one sentence, max 90 chars", emphasis: "1-2 words to highlight" },
    media: [],
  },
  {
    type: "feature", bestFor: "the product/offer shown for real",
    look: "A cream block: kinetic headline, a big browser-framed website screenshot traveling as it holds, three numbered color chips (terracotta/ink/olive) whipping in beneath.",
    slots: { headline: "max 2 short lines", chips: "3 items, max 24 chars each" },
    media: ["desktop"],
  },
  {
    type: "montage", bestFor: "range — several items/pages/angles",
    look: "An olive block: conveyor montage — two rows of labeled color tiles traveling opposite directions the whole scene, marquee ticker below.",
    slots: { headline: "max 2 short lines", tiles: "4 short labels, max 14 chars each" },
    media: ["photo", "photo"], mediaMin: 0,
  },
  {
    type: "stats", bestFor: "numbers that prove it",
    look: "An ink block, three jump-cut beats: each stat OWNS the screen briefly — a giant counting figure in its own color, label, and a bar growing with the count.",
    slots: { headline: "max 2 short lines", stats: "1-3 of {v, suf, l}" },
    media: [],
  },
  {
    type: "cta", bestFor: "closing invitation",
    look: "A terracotta block: tilted logo tile, kinetic closing words, a pulsing ink button with an arrow, the url, and a final marquee ticker.",
    slots: { headline: "max 2 short lines", cta: "button label, max 22 chars", ticker: "marquee phrase, max 44 chars" },
    media: [],
  },
];
// montage draws FOUR tiles (two rows x two labels, marquee-repeated), so it must
// declare four slots — with two it received two assets and drew the other two as
// blank cards even when the pool still held unclaimed screenshots.
const mediaSlots = { hook: ["desktop"], feature: ["desktop"], montage: ["photo", "photo", "photo", "photo"] };

function route(scene, i, total, ctx) {
  const k = String(scene.kind || "").toLowerCase(), p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "hook";
  if (i === total - 1 || k === "cta" || p === "cta") return "cta";
  if (k === "stat" || k === "chart" || statsOf(scene, 1).length) return "stats";
  if ((ctx.pinned || ctx.hasShot) && ctx.prevType !== "feature") return "feature";
  if (/montage|gallery|range|showcase/.test(`${k} ${p}`) || (ctx.freeCount >= 2 && ctx.prevType !== "montage")) return "montage";
  if (bullets(scene, 3).length >= 2) return "feature";
  return ctx.prevType === "statement" ? "feature" : "statement";
}
const mediaFallback = (scene) => (bullets(scene, 3).length >= 2 ? "feature" : "statement");
const wantsLogo = (type) => type === "cta";

// ---- shared pieces ------------------------------------------------------------
// Film px → cqw. Portrait maps the template's native 1080-wide sheet 1:1;
// landscape stages its own numbers, so it only converts type sizes.
const q = (px, land) => r(px * (land ? 0.05208 : 0.09259));

const ORD = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE"];
const chapterOf = (i) => `CHAPTER ${ORD[i] || String(i + 1)}`;

const emWords = (scene) => String(scene.emphasis || "").split(/\s+/).filter(Boolean);
function hiOf(scene, lines) {
  const em = emWords(scene);
  if (em.length) return em;
  const last = String(lines[lines.length - 1] || "").trim().split(/\s+/);
  return last.length ? [last[last.length - 1]] : [];
}

// The film's kinetic word-by-word type: each word springs in with a back-out
// rotate settle (y 70 → 0, rotate -8° → 0, scale 1.4 → 1) and KEEPS a subtle
// finite yoyo wobble after landing (the film's sin(clock·1.6 + idx·1.1)·1.2°).
function kinetic(cls, lines, sizePx, ctx, o = {}) {
  const { land, T, L } = ctx;
  const at = r(o.at != null ? o.at : T + Math.min(0.4, L * 0.05));
  const step = r(o.step != null ? o.step : Math.min(0.13, L * 0.055));
  const dur = r(o.dur != null ? o.dur : Math.min(0.9, L * 0.3));
  const until = r(o.until != null ? o.until : T + L);
  const hiSet = new Set((o.hiWords || []).map((w) => String(w).toLowerCase().replace(/[^a-z0-9]/g, "")));
  const maxLen = Math.max(1, ...lines.map((l) => String(l).length));
  // The rows are nowrap, so the size must be clamped against the ACTUAL column
  // width, not scaled off a 12-char reference — the relative-only clamp still
  // let long cast headlines run off the right edge ("THE WHOLE STOR…").
  // Caprasimo caps run ~0.72em; the copy column is ~86cqw portrait / 58 land.
  const fitPx = ((land ? 58 : 86) / (maxLen * 0.72)) / (land ? 0.052 : 0.0926);
  const px = Math.min(maxLen > 12 ? Math.max(sizePx * 0.55, (sizePx * 12) / maxLen) : sizePx, fitPx);
  let n = 0;
  const html = lines.map((ln) =>
    `<div style="line-height:1.02;white-space:nowrap;">${String(ln).split(/\s+/).filter(Boolean).map((w) => {
      n++;
      const c = hiSet.has(w.toLowerCase().replace(/[^a-z0-9]/g, "")) ? o.hiColor : o.color;
      return `<span class="${cls}" style="opacity:0;display:inline-block;font-family:${FH};font-size:${q(px, land)}cqw;color:${c};text-transform:uppercase;letter-spacing:-0.01em;margin-right:0.24em;">${esc(w)}</span>`;
    }).join("")}</div>`).join("");
  const end = r(at + n * step + dur);
  const span = r(until - end);
  const s = [
    `tl.fromTo(".${cls}",{opacity:0,y:70,rotation:-8,scale:1.4},{opacity:1,y:0,rotation:0,scale:1,duration:${dur},ease:"back.out(1.5)",stagger:${step}},${at});`,
  ];
  if (span > 1.4) s.push(`tl.fromTo(".${cls}",{rotation:-1.2},{rotation:1.2,duration:1.2,ease:"sine.inOut",yoyo:true,stagger:0.11,repeat:reps(${span},1.2)},${end});`);
  return { html, s, end };
}

// The film's beat(): an element that exists for a sub-range of the scene —
// whips in (outQuint, x 90·dirIn, skew -6), holds, whips out (x 160·dirOut,
// skew +8) — the internal jump-cut.
function beatIO(sel, ctx, aF, bF, dirIn, dirOut, { noExit } = {}) {
  const { T, L } = ctx;
  const bT = r(T + aF * L), bL = r((bF - aF) * L);
  const inD = r(Math.min(0.7, bL * 0.22)), outD = r(Math.min(0.6, bL * 0.22));
  const s = [
    `tl.fromTo("${sel}",{opacity:0,x:${r(90 * dirIn)},skewX:-6},{opacity:1,x:0,skewX:0,duration:${inD},ease:"expo.out"},${bT});`,
  ];
  if (!noExit) s.push(`tl.to("${sel}",{opacity:0,x:${r(160 * dirOut)},skewX:8,duration:${outD},ease:"power2.inOut"},${r(bT + bL * 0.72)});`);
  return { bT, bL, s };
}

// Rotating starburst (the film's Starburst polygon), points baked at build time.
function starPts(petals) {
  const pts = [];
  for (let i = 0; i < petals * 2; i++) {
    const a = (i / (petals * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? 100 : 55;
    pts.push(`${r(100 + Math.cos(a) * rr)},${r(100 + Math.sin(a) * rr)}`);
  }
  return pts.join(" ");
}
// Story Blocks differentiator (2026-07-27): the rotating starburst is POSTER-POP's
// signature — it made story-blocks read as a poster-pop clone. Story Blocks' own
// identity is chapter-counted color BLOCKS that slide in from alternating sides, so
// its background accent is a soft off-axis BLOCK wedge that slides in (not a spinning
// star). Same call signature; every scene picks it up with no call-site change.
// STORY BLOCKS differentiator (2026-07-27): a rotating starburst is POSTER-POP's
// signature and made story-blocks read as a clone. Story Blocks is chapter-counted
// color BLOCKS that slide in from alternating sides, so its accent is a soft off-axis
// BLOCK wedge that slides in from its edge (not a spinning star). Same call signature.
function starburst(id, ctx, { left, top, size, color, speed }) {
  const { T, L, land } = ctx;
  const fromLeft = (Number(speed) || 1) >= 0;
  const dx = r((fromLeft ? -1 : 1) * size * 0.6);
  const html = `<div id="${id}" style="position:absolute;left:${left}cqw;top:${top}cqw;width:${r(size * 1.25)}cqw;height:${r(size * 1.25)}cqw;opacity:0;overflow:hidden;">
    <div style="position:absolute;inset:0;background:${color};border-radius:${q(18, land)}cqw;transform:rotate(${fromLeft ? -8 : 8}deg);"></div>
  </div>`;
  const s = [`tl.fromTo("#${id}",{opacity:0,x:${dx},y:${r(size * 0.3)}},{opacity:1,x:0,y:0,duration:${r(Math.min(0.9, L * 0.3))},ease:"expo.out"},${T});`];
  return { html, s };
}

// STORY BLOCKS differentiator: the endless tilted MARQUEE band is POSTER-POP's
// signature. Story Blocks states its line flat and bold behind a heavy accent
// dash — no tilt, no scroll, no poster marquee. Same call signature (fg/top used;
// bg/tilt/dir ignored).
//
// This WAS a "CH 0N / 0M" chapter counter plus a dot-per-scene rail that filled as
// the film advanced. That is a progress indicator, and together with the base
// segment rail it made the film read as a SLIDESHOW. It also wasted the band on
// chrome while scenes sat half empty — so the slot now carries the film's OWN
// words (the `text` argument every caller was already passing and this function
// silently threw away).
function ticker(id, text, ctx, { fg, bg, top }) {
  const { land, T, theme: th } = ctx;
  // Every caller passes a `bg` — and this function used to drop it on the floor,
  // so the ticker was drawn in `fg` (th.paper) straight onto whatever happened to
  // be behind it. In this pack paper IS the ground, so wherever the ticker did
  // not overlap a panel it was cream on cream: measured 1.43:1 in landscape,
  // where the row sits lower and misses the panel entirely. Painting the plate
  // the callers asked for gives the type a known surface in both orientations.
  const plate = bg || th.ink;
  const col = E.readable(plate, fg || th.paper, 1, 4.5);
  const label = String(text || "").trim();
  if (!label) return { html: "", s: [] };
  const html = `<div id="${id}" style="opacity:0;position:absolute;left:${q(64, land)}cqw;top:${top}cqw;display:inline-flex;align-items:center;gap:${q(20, land)}cqw;z-index:4;background:${plate};padding:${q(10, land)}cqw ${q(26, land)}cqw;border-radius:999px;max-width:${q(900, land)}cqw;">
    <span style="display:inline-block;flex:none;width:${q(56, land)}cqw;height:${q(9, land)}cqw;border-radius:999px;background:${col};"></span>
    <span style="font-family:${FB};font-weight:800;font-size:${q(27, land)}cqw;letter-spacing:0.18em;color:${col};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(label.toUpperCase())}</span>
  </div>`;
  const s = [`tl.fromTo("#${id}",{opacity:0,x:${q(-30, land)}},{opacity:1,x:0,duration:0.5,ease:"power3.out"},${r(T + 0.35)});`];
  return { html, s };
}

// Chapter kicker chip: back-out snap in, then the film's slow rotate wobble.
function chipHtml(id, text, ctx, { bg, fg }) {
  const { land } = ctx;
  return `<div id="${id}" style="opacity:0;display:inline-block;padding:${q(12, land)}cqw ${q(26, land)}cqw;border-radius:${q(12, land)}cqw;background:${bg};color:${fg};font-family:${FB};font-weight:800;font-size:${q(25, land)}cqw;letter-spacing:0.18em;margin-bottom:${q(40, land)}cqw;">${esc(text)}</div>`;
}
function chipLines(sel, ctx) {
  const { T, L } = ctx;
  const at = r(T + Math.min(0.3, L * 0.02));
  const dur = r(Math.min(0.7, L * 0.12));
  const wob = r(at + dur);
  return [
    `tl.fromTo("${sel}",{opacity:0,scale:0,rotation:-10},{opacity:1,scale:1,rotation:-2,duration:${dur},ease:"back.out(1.7)"},${at});`,
    `tl.fromTo("${sel}",{rotation:-3.5},{rotation:-0.5,duration:1.4,ease:"sine.inOut",yoyo:true,repeat:reps(${r(T + L - wob)},1.4)},${wob});`,
  ];
}

// Media slot: real asset (cover) or the template's dashed placeholder panel.
function slot(id, asset, th, { radius = 16, focusTop = false } = {}) {
  if (asset && asset.path) {
    return `<img data-media-slot="filled" id="${id}" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;border-radius:${radius}px;object-fit:${asset.fitContain ? "contain" : "cover"};padding:${asset.fitContain ? "7%" : "0"};object-position:${asset.fitContain ? "center" : (focusTop ? "top center" : (asset.cropFocus || "center"))};display:block;">`;
  }
  return `<div data-media-slot="empty" id="${id}" style="width:100%;height:100%;border-radius:${radius}px;display:flex;align-items:center;justify-content:center;background:${th.paper};border:1px solid ${rgba(th.ink, 0.35)};">
    
  </div>`;
}

// The film's Browser frame: ink shell, three dots, media inside.
function browserCard(id, asset, ctx, wCqw, hCqw) {
  const { land, theme: th } = ctx;
  const dots = [0.9, 0.4, 0.4].map((o) =>
    `<span style="width:${q(12, land)}cqw;height:${q(12, land)}cqw;border-radius:999px;background:${rgba(th.paper, o)};"></span>`).join("");
  return `<div id="${id}" style="width:${wCqw}cqw;height:${hCqw}cqw;background:${th.ink};border-radius:${q(24, land)}cqw;padding:${q(10, land)}cqw;box-shadow:0 ${q(30, land)}cqw ${q(66, land)}cqw ${rgba(th.ink, 0.32)};">
    <div style="display:flex;gap:${q(7, land)}cqw;padding:${q(4, land)}cqw ${q(8, land)}cqw ${q(9, land)}cqw;">${dots}</div>
    <div style="border-radius:${q(15, land)}cqw;overflow:hidden;height:calc(100% - ${q(34, land)}cqw);background:${th.surface};">${slot(`${id}-img`, asset, ctx.theme, { radius: 0, focusTop: true })}</div>
  </div>`;
}

// The scene's full-bleed color panel (rides the camera, so the whole block
// whips in over the cream paper world) + the film's contrasting leading edge.
function panelBg(color, edgeColor, kind) {
  const edge = kind === "up" ? "left:0;right:0;top:-0.4cqw;height:1.7cqw;"
    : kind === "down" ? "left:0;right:0;bottom:-0.4cqw;height:1.7cqw;"
      : kind === "left" ? "top:0;bottom:0;right:-0.4cqw;width:1.7cqw;"
        : "top:0;bottom:0;left:-0.4cqw;width:1.7cqw;";
  return `<div style="position:absolute;inset:-3cqw;background:${color};"><div style="position:absolute;${edge}background:${edgeColor};"></div></div>`;
}

// The film's cam(): whip-pan cuts — the camo slams in from a side with skew
// (panel + content together), continues off the SAME direction at scene end,
// with a settle-punch scale; cami carries the continuous never-parks drift
// (slow push 1→1.045, linear x drift, sine bob).
const CAM = {
  up: { ax: "yPercent", from: 106, skew: "skewY", sk: 5 },
  down: { ax: "yPercent", from: -106, skew: "skewY", sk: -5 },
  left: { ax: "xPercent", from: -106, skew: "skewX", sk: -7 },
  right: { ax: "xPercent", from: 106, skew: "skewX", sk: 7 },
};
// The continuous "never-parks" drift on the inner layer (which carries the
// browser-framed screenshot + all content). Hardcoding one x:6→-14 pan made
// EVERY scene slide right→left — a slideshow tell. Cycle a small pool by scene
// index so neighbours always differ: some scenes pan R→L, some L→R, some push
// straight in (zoom, no pan), some drift diagonally — with the vertical bob and
// its period varied too. All subtle (same magnitude as the original), all
// seek-safe (finite reps).
const CAMI_DRIFT = [
  { x0: 9, x1: -16, sc: 1.05, y: 7, p: 1.9 },   // pan right→left
  { x0: -16, x1: 9, sc: 1.05, y: -7, p: 2.3 },  // pan left→right
  { x0: 3, x1: 3, sc: 1.075, y: 8, p: 1.6 },    // hold + push-in (pure zoom)
  { x0: 14, x1: -3, sc: 1.04, y: -8, p: 2.1 },  // drift in and settle
  { x0: -8, x1: 13, sc: 1.055, y: 6, p: 1.75 }, // rise-left → right
];
function camera(kind, ctx) {
  const c = CAM[kind] || CAM.left;
  const { id, T, L, i, isLast } = ctx;
  const inD = r(Math.min(0.55, L * 0.14)), outD = r(Math.min(0.5, L * 0.14));
  const d = CAMI_DRIFT[(i || 0) % CAMI_DRIFT.length];
  const lines = [
    i === 0 ? "" : `tl.fromTo("#${id}-camo",{${c.ax}:${c.from},${c.skew}:${c.sk},scale:1.05},{${c.ax}:0,${c.skew}:0,scale:1,duration:${inD},ease:"power3.out"},${T});`,
    isLast ? "" : `tl.to("#${id}-camo",{${c.ax}:${-c.from},${c.skew}:${-c.sk},scale:1.04,duration:${outD},ease:"power3.in"},${r(T + L - outD)});`,
    `tl.fromTo("#${id}-cami",{x:${d.x0},scale:1},{x:${d.x1},scale:${d.sc},duration:${r(L)},ease:"none"},${T});`,
    `tl.to("#${id}-cami",{y:${d.y},duration:${d.p},ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},${d.p})},${T});`,
  ];
  return lines.filter(Boolean).join("\n  ");
}

// ---- scenes -------------------------------------------------------------------

function hook(scene, ctx, a) {
  const { id, T, L, theme: th, land, i } = ctx;
  const bg = th.accent, fg = inkOn(bg, th.ink, th.paper);
  const kick = fit(String(scene.kicker || chapterOf(i)), 22).toUpperCase();
  const lines = breakLines(scene.headline, "Every brand|has a story.").slice(0, 3);
  const kin = kinetic(`${id}-wh`, lines, 110, ctx, { color: fg, hiColor: th.ink, hiWords: hiOf(scene, lines) });
  const tick = ticker(`${id}-tick`, fit(String(scene.ticker || scene.subtext || "TELL YOURS IN BLOCKS"), 44), ctx,
    { bg: th.ink, fg: th.paper, tilt: -2.5, dir: 1, top: land ? 47 : q(1610, land) });
  const b1 = starburst(`${id}-sb1`, ctx, land ? { left: 72, top: -6, size: 24, color: rgba(th.paper, 0.16), petals: 14, speed: 12 }
    : { left: 65, top: 1, size: 46, color: rgba(th.paper, 0.16), petals: 14, speed: 12 });
  const b2 = starburst(`${id}-sb2`, ctx, land ? { left: -6, top: 30, size: 18, color: rgba(th.ink, 0.15), petals: 10, speed: -16 }
    : { left: -14, top: 92, size: 35, color: rgba(th.ink, 0.15), petals: 10, speed: -16 });
  const card = `<div id="${id}-card">${browserCard(`${id}-bw`, a, ctx, land ? 40 : q(860, land), land ? 24 : q(480, land))}</div>`;
  const copy = `${chipHtml(`${id}-k`, kick, ctx, { bg: th.ink, fg: th.paper })}
    <div>${kin.html}</div>`;
  const html = `${panelBg(bg, th.paper, "up")}
    ${b1.html}${b2.html}
    ${land
      ? `<div style="position:absolute;left:5cqw;top:50%;transform:translateY(-50%);width:46cqw;">${copy}</div>
         <div style="position:absolute;right:5cqw;top:50%;transform:translateY(-50%);width:40cqw;">${card}</div>`
      : `<div style="position:absolute;left:${q(64, land)}cqw;right:${q(64, land)}cqw;top:${q(320, land)}cqw;">${copy}
           <div style="margin-top:${q(44, land)}cqw;">${card}</div>
         </div>`}
    ${tick.html}`;
  const s = [
    camera("up", ctx),
    ...chipLines(`#${id}-k`, ctx),
    ...kin.s,
    `tl.fromTo("#${id}-card",{x:60,y:40,rotation:3},{x:-60,y:-20,rotation:-2,duration:${r(L)},ease:"none"},${T});`,
    ...b1.s, ...b2.s, ...tick.s,
  ];
  return { html, s };
}

function statement(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const lines = breakLines(scene.headline, "Feeds are|noisy.|Blocks cut|through.").slice(0, 4);
  const h = Math.max(1, Math.ceil(lines.length / 2));
  const first = lines.slice(0, h);
  let second = lines.slice(h);
  if (!second.length) second = [fit(String(scene.emphasis || "Right through."), 18)];
  const sub = fit(String(scene.subtext || "One idea per panel. No fluff between."), 90);
  const b1 = beatIO(`#${id}-b1`, ctx, 0, 0.47, 1, -1);
  const b2 = beatIO(`#${id}-b2`, ctx, 0.5, 1, -1, 1, { noExit: ctx.isLast });
  const k1 = kinetic(`${id}-w1`, first, 148, ctx, {
    color: th.paper, hiColor: E.readable(th.ink, th.accent, 1, 4.5), hiWords: hiOf(scene, first),
    at: r(b1.bT + 0.06 * b1.bL), step: Math.min(0.18, b1.bL * 0.09), dur: Math.min(0.9, b1.bL * 0.3), until: r(b1.bT + b1.bL * 0.72),
  });
  const k2 = kinetic(`${id}-w2`, second, 148, ctx, {
    color: th.paper, hiColor: E.readable(th.ink, th.accent2, 1, 4.5), hiWords: hiOf(scene, second),
    at: r(b2.bT + 0.06 * b2.bL), step: Math.min(0.18, b2.bL * 0.09), dur: Math.min(0.9, b2.bL * 0.3), until: r(b2.bT + b2.bL * 0.72),
  });
  const burst = starburst(`${id}-sb`, ctx, land ? { left: 25, top: -12, size: 55, color: rgba(th.accent, 0.15), petals: 16, speed: 6 }
    : { left: 2, top: 34, size: 96, color: rgba(th.accent, 0.15), petals: 16, speed: 6 });
  const tick = ticker(`${id}-tick`, fit(String(scene.ticker || "LOUD • FAST • YOURS"), 44), ctx,
    { bg: th.accent, fg: th.paper, tilt: 2.5, dir: -1, top: land ? 47 : q(1620, land) });
  const pos = land ? "left:8cqw;right:8cqw;top:15cqw;" : `left:${q(64, land)}cqw;right:${q(64, land)}cqw;top:${q(620, land)}cqw;`;
  // 9:16 only: this scene carries a headline and one subtext line in the upper
  // half, leaving the lower third bare. The Text Director has usually already
  // mined supporting points for it — draw them in that dead band. Scene-level (not
  // inside a beat) so they hold while the two headline beats swap above.
  const sup = land ? { html: "", s: [] } : E.supportList(`${id}-sup`, bullets(scene, 3), ctx, {
    top: q(1150, land), left: q(64, land), right: q(64, land),
    font: q(38, land), fontFamily: FB, plate: th.ink, fg: E.readable(th.ink, th.paper, 1, 4.5), dot: th.accent,
    max: 3, at: r(T + Math.min(1.6, L * 0.36)),
  });
  const html = `${panelBg(th.ink, th.accent, "left")}
    ${burst.html}
    <div id="${id}-b1" style="opacity:0;position:absolute;${pos}">${k1.html}</div>
    <div id="${id}-b2" style="opacity:0;position:absolute;${pos}">${k2.html}
      <div style="margin-top:${q(40, land)}cqw;"><span id="${id}-su" style="opacity:0;display:inline-block;font-family:${FB};font-weight:700;font-size:${q(38, land)}cqw;color:${E.readable(th.ink, th.paper, 0.7, 4.5)};">${esc(sub)}</span></div>
    </div>
    ${sup.html}
    ${tick.html}`;
  const s = [
    camera("left", ctx),
    ...b1.s, ...b2.s, ...k1.s, ...k2.s,
    `tl.fromTo("#${id}-su",{opacity:0,y:10},{opacity:1,y:0,duration:${r(Math.min(0.8, b2.bL * 0.3))},ease:"power3.out"},${r(b2.bT + b2.bL * 0.3)});`,
    ...sup.s, ...burst.s, ...tick.s,
  ];
  return { html, s };
}

function feature(scene, ctx, a) {
  const { id, T, L, theme: th, land } = ctx;
  const chips = (Array.isArray(scene.chips) && scene.chips.length ? scene.chips : bullets(scene, 3));
  const items = (chips.length ? chips : ["Drag in screenshots", "Swap every word", "Recolor in one tap"]).slice(0, 3).map((c) => fit(String(c), 24));
  const lines = breakLines(scene.headline, "Built from|your screens.").slice(0, 3);
  const kin = kinetic(`${id}-wf`, lines, 100, ctx, { color: th.ink, hiColor: E.readable(th.ink, th.accent, 1, 4.5), hiWords: hiOf(scene, lines) });
  const burst = starburst(`${id}-sb`, ctx, land ? { left: 84, top: 34, size: 20, color: rgba(th.accent2, 0.35), petals: 12, speed: -9 }
    : { left: 73, top: 103, size: 43, color: rgba(th.accent2, 0.35), petals: 12, speed: -9 });
  const cols = [th.accent, th.ink, th.accent2];
  const chipRow = items.map((c, j) =>
    `<div class="${id}-tag" style="opacity:0;display:inline-flex;align-items:center;gap:${q(18, land)}cqw;padding:${q(16, land)}cqw ${q(30, land)}cqw;border-radius:${q(14, land)}cqw;background:${cols[j % 3]};color:${E.readable(cols[j % 3], E.inkOn(cols[j % 3], th.ink, th.paper), 1, 4.5)};font-family:${FH};font-size:${q(36, land)}cqw;text-transform:uppercase;box-shadow:0 ${q(12, land)}cqw ${q(30, land)}cqw ${rgba(th.ink, 0.18)};">
      <span style="font-family:${FH};font-size:${q(28, land)}cqw;color:${rgba(th.paper, 0.6)};">0${j + 1}</span>${esc(c)}</div>`).join("");
  const chipCol = `<div style="display:flex;flex-direction:column;gap:${q(18, land)}cqw;align-items:flex-start;margin-top:${q(44, land)}cqw;">${chipRow}</div>`;
  const kick = scene.kicker ? chipHtml(`${id}-k`, fit(String(scene.kicker), 22).toUpperCase(), ctx, { bg: th.ink, fg: th.paper }) : "";
  const card = `<div id="${id}-card">${browserCard(`${id}-bw`, a, ctx, land ? 46 : q(944, land), land ? 28.75 : q(590, land))}</div>`;
  const html = `${panelBg(th.paper, th.accent, "right")}
    ${burst.html}
    ${land
      ? `<div style="position:absolute;left:5cqw;top:8cqw;width:42cqw;">${kick}<div>${kin.html}</div>${chipCol}</div>
         <div style="position:absolute;right:4cqw;top:50%;transform:translateY(-50%);width:46cqw;">${card}</div>`
      : `<div style="position:absolute;left:${q(64, land)}cqw;right:${q(64, land)}cqw;top:${q(250, land)}cqw;">${kick}<div>${kin.html}</div>
           <div style="margin-top:${q(46, land)}cqw;">${card}</div>${chipCol}
         </div>`}`;
  const s = [
    camera("right", ctx),
    scene.kicker ? chipLines(`#${id}-k`, ctx).join("\n  ") : "",
    ...kin.s,
    `tl.fromTo("#${id}-card",{x:90,y:20,rotation:2},{x:-90,y:-30,rotation:-3,duration:${r(L)},ease:"none"},${T});`,
    `tl.fromTo("#${id} .${id}-tag",{opacity:0,x:160,rotation:4},{opacity:1,x:0,rotation:0,duration:${r(Math.min(0.9, L * 0.3))},ease:"back.out(1.5)",stagger:${r(Math.min(0.22, L * 0.1))}},${r(T + Math.min(2.2, L * 0.42))});`,
    `tl.to("#${id} .${id}-tag",{y:-6,duration:1.6,ease:"sine.inOut",yoyo:true,stagger:0.2,repeat:reps(${r(Math.max(1, L - 2))},1.6)},${r(T + Math.min(3.1, L * 0.42 + 0.9))});`,
    ...burst.s,
  ];
  return { html, s };
}

// Conveyor row: doubled tiles traveling one direction the whole scene.
function convRow(rowId, labels, imgs, ctx, { top, colors }) {
  const { land, theme: th } = ctx;
  const copies = land ? 3 : 2;
  const w = q(560, land), mh = q(300, land);
  const seq = [];
  for (let c = 0; c < copies; c++) labels.forEach((l, j) => seq.push([l, j]));
  const tiles = seq.map(([label, j], k) =>
    `<div style="width:${w}cqw;flex:none;background:${colors[k % colors.length]};border-radius:${q(26, land)}cqw;padding:${q(24, land)}cqw;transform:rotate(${k % 2 === 0 ? -1.6 : 1.6}deg);box-shadow:0 ${q(26, land)}cqw ${q(56, land)}cqw ${rgba(th.ink, 0.28)};">
      <div style="height:${mh}cqw;border-radius:${q(16, land)}cqw;overflow:hidden;">${slot(`${rowId}-img${k}`, imgs[j] || null, th, { radius: 0 })}</div>
      <div style="font-family:${FH};font-size:${q(34, land)}cqw;color:${th.paper};text-transform:uppercase;margin-top:${q(16, land)}cqw;text-align:center;">${esc(label)}</div>
    </div>`).join("");
  return `<div id="${rowId}" style="position:absolute;top:${top}cqw;left:0;display:flex;gap:${q(30, land)}cqw;will-change:transform;">${tiles}</div>`;
}

function montage(scene, ctx, a, b) {
  const { id, T, L, theme: th, land } = ctx;
  // Four tiles, four assets. Each convRow used to be handed [asset, null], so the
  // second tile of every row was blank BY CONSTRUCTION. Take the engine's full
  // media list and, when it is short, cycle it rather than leaving a hole — a
  // repeated screenshot reads far better than an empty white card.
  const pool = (Array.isArray(ctx.media) && ctx.media.length ? ctx.media : [a, b]).filter(Boolean);
  const m = [0, 1, 2, 3].map((k) => (pool.length ? pool[k % pool.length] : null));
  const raw = (Array.isArray(scene.tiles) && scene.tiles.length ? scene.tiles : bullets(scene, 4));
  const labels = [0, 1, 2, 3].map((j) => fit(String(raw[j] || ["Home", "Pricing", "Dashboard", "Checkout"][j]), 14));
  const fg = inkOn(th.accent2, th.ink, th.paper);
  const lines = breakLines(scene.headline, "The whole story,|panel by panel.").slice(0, 2);
  const kin = kinetic(`${id}-wm`, lines, 92, ctx, { color: fg, hiColor: th.ink, hiWords: hiOf(scene, lines) });
  const kick = scene.kicker ? chipHtml(`${id}-k`, fit(String(scene.kicker), 22).toUpperCase(), ctx, { bg: th.ink, fg: th.paper }) : "";
  const tick = ticker(`${id}-tick`, fit(String(scene.ticker || "SWIPE THROUGH EVERYTHING"), 44), ctx,
    { bg: th.ink, fg: th.paper, tilt: -2, dir: 1, top: land ? 47 : q(1630, land) });
  const html = `${panelBg(th.accent2, th.paper, "down")}
    <div style="position:absolute;left:${land ? 6 : q(64, land)}cqw;right:${land ? 6 : q(64, land)}cqw;top:${land ? 3 : q(280, land)}cqw;">${kick}<div>${kin.html}</div></div>
    ${convRow(`${id}-r1`, labels.slice(0, 2), [m[0], m[1]], ctx, { top: land ? 13 : q(660, land), colors: [th.accent, th.accent2] })}
    ${convRow(`${id}-r2`, labels.slice(2, 4), [m[2], m[3]], ctx, { top: land ? 33.5 : q(1140, land), colors: [th.ink] })}
    ${tick.html}`;
  const t1 = land ? [-120, -1350] : [-120, -1280];
  const t2 = land ? [-1500, -150] : [-1230, 0];
  const s = [
    camera("down", ctx),
    scene.kicker ? chipLines(`#${id}-k`, ctx).join("\n  ") : "",
    ...kin.s,
    `tl.fromTo("#${id}-r1",{x:${t1[0]}},{x:${t1[1]},duration:${r(L)},ease:"none"},${T});`,
    `tl.fromTo("#${id}-r2",{x:${t2[0]}},{x:${t2[1]},duration:${r(L)},ease:"none"},${T});`,
    ...tick.s,
  ];
  return { html, s };
}

function stats(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const mined = statsOf(scene, 3);
  const sts = mined.length ? mined : [{ pre: "", v: 100, suf: "%", l: "THE WHOLE STORY, TOLD", isFloat: false }];
  const n = sts.length;
  const ranges = n === 1 ? [[0.06, 0.9]] : n === 2 ? [[0.04, 0.48], [0.52, 0.97]] : [[0.04, 0.36], [0.38, 0.68], [0.7, 0.97]];
  const cols = [th.accent, th.paper, th.accent2];
  const lines = breakLines(scene.headline, "Numbers with|weight.").slice(0, 2);
  const kin = kinetic(`${id}-ws`, lines, 92, ctx, { color: th.paper, hiColor: E.readable(th.ink, th.accent, 1, 4.5), hiWords: hiOf(scene, lines) });
  const kick = scene.kicker ? chipHtml(`${id}-k`, fit(String(scene.kicker), 22).toUpperCase(), ctx, { bg: th.accent, fg: th.paper }) : "";
  const burst = starburst(`${id}-sb`, ctx, land ? { left: 28, top: -14, size: 52, color: rgba(th.accent, 0.12), petals: 18, speed: 7 }
    : { left: 4, top: 28, size: 93, color: rgba(th.accent, 0.12), petals: 18, speed: 7 });
  const pos = land ? "left:8cqw;right:8cqw;top:20cqw;" : `left:${q(64, land)}cqw;right:${q(64, land)}cqw;top:${q(760, land)}cqw;`;
  const rows = sts.map((st, j) =>
    `<div id="${id}-b${j}" style="opacity:0;position:absolute;${pos}">
      <div id="${id}-np${j}" style="font-family:${FH};font-size:${q(330, land)}cqw;line-height:0.85;color:${cols[j % 3]};font-variant-numeric:tabular-nums;"><span id="${id}-n${j}">0</span><span style="font-size:${q(140, land)}cqw;">${esc(st.suf || "")}</span></div>
      <div style="font-family:${FB};font-weight:700;font-size:${q(44, land)}cqw;color:${rgba(th.paper, 0.8)};margin-top:${q(34, land)}cqw;max-width:${land ? 46 : q(820, land)}cqw;">${esc(String(st.l || "").toLowerCase() || "and counting")}</div>
      <div id="${id}-bar${j}" style="width:${q(200, land)}cqw;height:${q(12, land)}cqw;border-radius:999px;background:${cols[j % 3]};margin-top:${q(30, land)}cqw;transform:scaleX(0);transform-origin:left center;"></div>
    </div>`).join("");
  // 9:16 only: one stat leaves the bottom half of the sheet empty. The scene's own
  // supporting points fill it without competing with the counting figure above.
  const sup = land ? { html: "", s: [] } : E.supportList(`${id}-sup`, bullets(scene, 3), ctx, {
    top: q(1250, land), left: q(64, land), right: q(64, land),
    font: q(36, land), fontFamily: FB, plate: th.ink, fg: E.readable(th.ink, th.paper, 1, 4.5), dot: th.accent2,
    max: 3, at: r(T + Math.min(1.8, L * 0.4)),
  });
  const html = `${panelBg(th.ink, th.accent2, "left")}
    ${burst.html}
    <div style="position:absolute;left:${land ? 8 : q(64, land)}cqw;right:${land ? 8 : q(64, land)}cqw;top:${land ? 5 : q(300, land)}cqw;">${kick}<div>${kin.html}</div></div>
    ${rows}
    ${sup.html}`;
  const s = [
    camera("left", ctx),
    scene.kicker ? chipLines(`#${id}-k`, ctx).join("\n  ") : "",
    ...kin.s,
    ...sup.s,
    ...burst.s,
  ];
  sts.forEach((st, j) => {
    const bio = beatIO(`#${id}-b${j}`, ctx, ranges[j][0], ranges[j][1], j % 2 === 0 ? 1 : -1, j % 2 === 0 ? -1 : 1,
      { noExit: ctx.isLast && j === n - 1 });
    s.push(...bio.s);
    s.push(`countTxt("#${id}-n${j}",${st.v},${r(bio.bT + bio.bL * 0.1)},${r(Math.min(1.8, bio.bL * 0.5))},"${esc(st.pre || "")}","",${st.isFloat ? 10 : 1});`);
    s.push(`tl.fromTo("#${id}-bar${j}",{scaleX:0},{scaleX:1,duration:${r(Math.min(1.8, bio.bL * 0.5))},ease:"power3.out",transformOrigin:"left center"},${r(bio.bT + bio.bL * 0.1)});`);
    s.push(`tl.fromTo("#${id}-np${j}",{scale:1},{scale:1.012,duration:1.05,ease:"sine.inOut",yoyo:true,repeat:reps(${r(bio.bL)},1.05),transformOrigin:"left bottom"},${bio.bT});`);
  });
  return { html, s };
}

function cta(scene, ctx, a) {
  const { id, T, L, theme: th, land, brand, url } = ctx;
  const bg = th.accent, fg = inkOn(bg, th.ink, th.paper);
  const label = fit(String(scene.cta || scene.buttonLabel || "Start the story"), 22);
  const lines = breakLines(scene.headline, "Your turn.|Start the story.").slice(0, 3);
  const kin = kinetic(`${id}-wc`, lines, 96, ctx, { color: fg, hiColor: th.ink, hiWords: hiOf(scene, lines), at: r(T + Math.min(0.6, L * 0.08)) });
  const burst = starburst(`${id}-sb`, ctx, land ? { left: 36, top: -10, size: 34, color: rgba(th.paper, 0.15), petals: 18, speed: 9 }
    : { left: 30, top: 34, size: 78, color: rgba(th.paper, 0.15), petals: 18, speed: 9 });
  const tick = ticker(`${id}-tick`, fit(String(scene.ticker || "EVERY STORY NEEDS A LOUD COVER"), 44), ctx,
    { bg: th.paper, fg: th.ink, tilt: -2.5, dir: 1, top: land ? 47 : q(1620, land) });
  const logo = a && a.path
    ? `<img src="${esc(a.path)}" alt="logo" style="width:100%;height:100%;object-fit:contain;padding:${q(12, land)}cqw;">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:${FH};font-size:${q(64, land)}cqw;color:${th.accent};">${esc(String(brand).slice(0, 1).toUpperCase())}</div>`;
  // 9:16 only: the closing block ends around the mid-sheet, leaving the band above
  // the ticker empty. Close on the film's own proof points rather than dead colour.
  const sup = land ? { html: "", s: [] } : E.supportList(`${id}-sup`, bullets(scene, 3), ctx, {
    top: q(1230, land), left: q(64, land), right: q(64, land),
    font: q(36, land), fontFamily: FB, plate: th.paper, fg: E.readable(th.paper, th.ink, 1, 4.5), dot: th.ink,
    max: 3, at: r(T + Math.min(2.2, L * 0.42)),
  });
  const html = `${panelBg(bg, th.ink, "up")}
    ${burst.html}
    <div style="position:absolute;left:${land ? 8 : q(64, land)}cqw;${land ? "top:9cqw;width:70cqw;" : `right:${q(64, land)}cqw;top:${q(500, land)}cqw;`}">
      <div id="${id}-lg" style="opacity:0;width:${q(130, land)}cqw;height:${q(130, land)}cqw;border-radius:${q(24, land)}cqw;overflow:hidden;background:${th.paper};box-shadow:0 ${q(18, land)}cqw ${q(44, land)}cqw ${rgba(th.ink, 0.3)};margin-bottom:${q(46, land)}cqw;">${logo}</div>
      <div>${kin.html}</div>
      <div id="${id}-btn" style="opacity:0;display:inline-flex;margin-top:${q(56, land)}cqw;">
        <div id="${id}-btni" style="display:inline-flex;align-items:center;gap:${q(16, land)}cqw;padding:${q(27, land)}cqw ${q(56, land)}cqw;border-radius:${q(16, land)}cqw;background:${th.ink};color:${th.paper};font-family:${FH};font-size:${q(46, land)}cqw;box-shadow:0 ${q(24, land)}cqw ${q(60, land)}cqw ${rgba(th.ink, 0.4)};">${esc(label)}
          <svg viewBox="0 0 24 24" fill="none" stroke="${th.paper}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" style="width:${q(38, land)}cqw;height:${q(38, land)}cqw;"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
        </div>
      </div>
      <div id="${id}-url" style="opacity:0;font-family:${FB};font-weight:800;font-size:${q(40, land)}cqw;color:${fg};margin-top:${q(44, land)}cqw;">${esc(url)}</div>
    </div>
    ${sup.html}
    ${tick.html}`;
  const btnAt = r(T + Math.min(2, L * 0.3)), btnD = r(Math.min(0.9, L * 0.18));
  const s = [
    camera("up", ctx),
    `tl.fromTo("#${id}-lg",{opacity:0,scale:0,rotation:-12},{opacity:1,scale:1,rotation:-4,duration:${r(Math.min(0.8, L * 0.14))},ease:"back.out(1.7)"},${r(T + Math.min(0.3, L * 0.02))});`,
    `tl.fromTo("#${id}-lg",{rotation:-6},{rotation:-2,duration:1.6,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(1, L - 1.2))},1.6)},${r(T + 1)});`,
    ...kin.s,
    `tl.fromTo("#${id}-btn",{opacity:0,scale:0},{opacity:1,scale:1,duration:${btnD},ease:"back.out(1.5)"},${btnAt});`,
    `tl.fromTo("#${id}-btni",{scale:1},{scale:1.03,duration:1.2,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(1, T + L - btnAt - btnD))},1.2)},${r(btnAt + btnD)});`,
    `tl.fromTo("#${id}-url",{opacity:0,y:14},{opacity:1,y:0,duration:${r(Math.min(0.8, L * 0.15))},ease:"power3.out"},${r(T + Math.min(2.6, L * 0.45))});`,
    ...sup.s, ...burst.s, ...tick.s,
  ];
  return { html, s };
}

const SCENES = { hook, statement, feature, montage, stats, cta };

// ---- chrome: cream paper world + brand chip + progress rail --------------------
// The film's world IS its color panels; between whips the cream paper sheet
// shows through, dressed with slow rotating starbursts and drifting confetti
// blocks so it never sits dead.
function chrome({ theme: th, D, brand, count, land, r: rr, esc: esch }) {
  const cf = Array.from({ length: 6 }, (_, i) =>
    `<div class="sb-cf" style="position:absolute;left:${8 + (i * 83) % 86}%;top:${10 + (i * 41) % 74}%;width:${r(1.2 + (i % 3) * 0.7)}cqw;height:${r(1.2 + (i % 3) * 0.7)}cqw;border-radius:22%;background:${i % 2 ? rgba(th.accent, 0.14) : rgba(th.accent2, 0.13)};transform:rotate(${(i * 31) % 40 - 20}deg);"></div>`).join("");
  const html = `
  <div id="sb-world" class="clip" data-start="0" data-duration="__D__" data-track-index="1" data-layout-allow-occlusion style="opacity:0;background:${th.paper};">
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 20% 12%, ${rgba(th.accent, 0.08)}, transparent 46%),radial-gradient(circle at 82% 80%, ${rgba(th.accent2, 0.08)}, transparent 44%);"></div>
    <div id="sb-wb1" style="position:absolute;left:${land ? 70 : 58}%;top:${land ? -18 : -8}%;width:${land ? 26 : 42}cqw;height:${land ? 26 : 42}cqw;"><svg viewBox="0 0 200 200" width="100%" height="100%"><polygon points="${starPts(14)}" fill="${rgba(th.accent, 0.1)}"/></svg></div>
    <div id="sb-wb2" style="position:absolute;left:${land ? -8 : -12}%;top:${land ? 55 : 62}%;width:${land ? 20 : 34}cqw;height:${land ? 20 : 34}cqw;"><svg viewBox="0 0 200 200" width="100%" height="100%"><polygon points="${starPts(10)}" fill="${rgba(th.accent2, 0.1)}"/></svg></div>
    ${cf}
  </div>
  <div id="sb-chrome" class="clip" data-start="0" data-duration="__D__" data-track-index="39" data-layout-allow-occlusion style="opacity:0;background:none;">
    <div style="position:absolute;top:${land ? 4 : 3.2}%;left:${land ? 3.5 : 5.9}%;display:flex;align-items:center;gap:1.3cqw;">
      <div id="sb-chip" style="width:${land ? 2.7 : 4.3}cqw;height:${land ? 2.7 : 4.3}cqw;border-radius:${land ? 0.7 : 1.1}cqw;background:${th.accent};border:2px solid ${rgba(th.paper, 0.85)};display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="${th.paper}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" style="width:58%;height:58%;"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></svg>
      </div>
      <span style="font-family:${FH};font-size:${land ? 1.7 : 2.9}cqw;color:${th.paper};background:${rgba(th.ink, 0.92)};border:1px solid ${rgba(th.paper, 0.5)};padding:0.3cqw 1.1cqw;border-radius:0.7cqw;">${esch(brand)}</span>
    </div>
  </div>`;
  const script = `
  tl.fromTo("#sb-world",{opacity:0},{opacity:1,duration:0.5},0);
  tl.fromTo("#sb-chrome",{opacity:0},{opacity:1,duration:0.5},0.2);
  tl.fromTo("#sb-wb1",{rotation:0},{rotation:${rr(D * 5)},duration:${rr(D)},ease:"none"},0);
  tl.fromTo("#sb-wb2",{rotation:0},{rotation:${rr(-D * 7)},duration:${rr(D)},ease:"none"},0);
  tl.to(".sb-cf",{y:-24,duration:3.2,ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},3.2),stagger:0.4},0);
  tl.fromTo("#sb-chip",{rotation:-8},{rotation:-4,duration:1.8,ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},1.8)},0);`;
  return { html, script };
}

// No per-scene chrome — the segmented progress rail was removed (it read as a
// slideshow ticking through slides).

function styleBlock(th) {
  return `${th.fontFace}
  #root { font-family:${th.bodyStack}; }
  #cap-pill { background:${rgba(th.paper, 0.94)}; border:1px solid ${rgba(th.accent, 0.45)} !important; }
  #cap-text { font-family:${th.bodyStack}; color:${th.ink}; }`;
}

const family = {
  theme, styleBlock, chrome, SCENES, TEMPLATE_SCENES, route, mediaSlots, mediaFallback, wantsLogo,
  // Empty slots in this pack render a featureless placeholder card, so a
  // REPEAT of a real screenshot/photo beats leaving one blank.
  recycleMedia: true,
  fallbackType: "statement",
  variants: 1,
  camera: { enabled: false }, // whip-pan panel cuts are baked into each scene (the film's own kinds)
};

function buildComposition(opts) { return E.buildFilm(family, opts); }
// This pack's media demand + what filled each slot, WITHOUT rendering. Runs the
// exact routing and slot-filling the renderer runs, so the manifest can never
// drift from the film that ships.
function planMedia(opts) { return E.planMedia(family, opts); }

module.exports = { buildComposition, planMedia, TEMPLATE_SCENES };
