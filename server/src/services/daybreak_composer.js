// DAYBREAK BAKEHOUSE composer — a faithful native GSAP port of the user's
// "Daybreak Bakehouse" bundled reel template (daybreak-bakehouse-film.jsx).
// The pack `daybreak-bakehouse` (manifest renderer:"daybreak-bakehouse") routes
// here, so selecting the template gives THE TEMPLATE: its six authored beats
// (wall-frame Hook, rule-bar Statement, menu-board Feature, 2×2 tile Montage,
// counter-card Stats, logo-circle CTA), its per-beat camera moves (drop / left
// / up / right / zoom / scale-out with a continuous live drift), its living
// world (sunrise wash, low sun, raking window beams, dust motes, counter slab
// with endless steam, swaying pendant lamps) and its chrome (brand chip
// top-left, per-scene progress rail at the base). Only the CONTENT is swapped:
// headlines/subs from the script, chips/tiles/stats mined by the Template
// Director, and the template's own media slots filled with the film's REAL
// assets — the website screenshot on the menu board, parsed site images in the
// wall frame and montage tiles, the brand logo in the CTA circle.
//
// Portrait (the template's native 9:16) reproduces the film's layout ~1:1 in
// cqw; landscape re-stages each beat as a two-column adaptation with the same
// type, motion and world. Render contract is template_engine's (seek-safe,
// finite repeats, hard kills); this module is design only.

const { deriveTheme } = require("./scene_kit");
const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const E = require("./template_engine");
const { esc, r, rgba, mix, statsOf, breakLines, bullets, fit } = E;

const FH = "'Caprasimo', Georgia, serif";
const FB = "'Figtree', system-ui, sans-serif";

// ---- theme --------------------------------------------------------------------
function theme(manifest, brandSkin, { framePack, land } = {}) {
  const t = deriveTheme(framePack || "daybreak-bakehouse", {}, brandSkin);
  const ground = t.ground || "#f5ead8";
  const ink = t.ink || "#201e1d";
  const accent = (t.accents && t.accents[0]) || "#c67139";
  const accent2 = (t.accents && t.accents[1]) || "#7a8a5e";
  return {
    ...t, ground, ink, accent, accent2,
    accent700: mix(accent, "#000000", 0.18),
    dawn: mix(accent, "#ffffff", 0.62),
    surface: mix(ground, accent, 0.14),
    displayStack: FH, bodyStack: FB,
    fontFace: (isBundled("Caprasimo") ? fontFaceCss("Caprasimo") : "") + (isBundled("Figtree") ? fontFaceCss("Figtree") : ""),
  };
}

// ---- vocabulary (Template Director casts onto these) --------------------------
const TEMPLATE_SCENES = [
  {
    type: "hook", bestFor: "opening — who this is and the promise",
    look: "A tilted wall-framed hero image over a letter-spaced kicker, a big warm serif headline rising line by line, and a one-sentence sub.",
    slots: { kicker: "max 26 chars, uppercase", headline: "2-3 short lines ('|' breaks)", subtext: "one warm sentence, max 90 chars" },
    media: ["photo"],
  },
  {
    type: "statement", bestFor: "the problem or a bold belief",
    look: "An accent rule bar, then 2-3 stacked serif lines and a supporting sentence — quiet staging, all type.",
    slots: { headline: "2-3 short lines", subtext: "one sentence, max 100 chars" },
    media: [],
  },
  {
    type: "feature", bestFor: "the product/offer shown for real",
    look: "A hanging dark menu board holding one big product shot or website screenshot, checklist chips popping in beneath.",
    slots: { headline: "max 2 short lines", chips: "2-3 items, max 26 chars each" },
    media: ["desktop"],
  },
  {
    type: "montage", bestFor: "range — several items/pages/angles",
    look: "A 2×2 grid of labeled photo tiles wiping in one after another.",
    slots: { headline: "max 2 short lines", tiles: "4 short labels, max 16 chars each" },
    media: ["photo", "photo"], mediaMin: 0,
  },
  {
    type: "stats", bestFor: "numbers that prove it",
    look: "Up to three bordered counter cards, each a big warm serif figure counting up beside its label.",
    slots: { headline: "max 2 short lines", stats: "1-3 of {v, suf, l}" },
    media: [],
  },
  {
    type: "cta", bestFor: "closing invitation",
    look: "The brand logo in a circle, a warm final headline, an accent pill button and the url in accent type.",
    slots: { headline: "max 2 short lines", cta: "button label, max 24 chars" },
    media: [],
  },
];
const mediaSlots = { hook: ["photo"], feature: ["desktop"], montage: ["photo", "photo", "photo", "photo"] };

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
// landscape uses its own staging numbers, so it only converts type sizes.
const q = (px, land) => r(px * (land ? 0.052 : 0.0926));

// The film's M.rise: outCubic rise from 32px, stagger 0.055·L, dur 0.38·L.
function rise(sel, T, L, idx, e = 1) {
  return `tl.fromTo("${sel}",{opacity:0,y:${r(32 * e)}},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.38))},ease:"power3.out"},${r(T + idx * Math.min(0.22, L * 0.055))});`;
}
// M.pop: back-out scale from 0.76.
function pop(sel, T, L, idx) {
  return `tl.fromTo("${sel}",{opacity:0,scale:0.76},{opacity:1,scale:1,duration:${r(Math.min(1.5, L * 0.4))},ease:"back.out(1.5)"},${r(T + idx * Math.min(0.22, L * 0.055))});`;
}
// M.wipe: slide in from -26px.
function wipe(sel, T, L, idx) {
  return `tl.fromTo("${sel}",{opacity:0,x:-26},{opacity:1,x:0,duration:${r(Math.min(1.5, L * 0.42))},ease:"power3.out"},${r(T + idx * Math.min(0.2, L * 0.05))});`;
}

// The film's per-beat camera on the engine's #id-camo/-cami rig: directional
// enter, slow continuous live drift, directional exit.
const CAM = {
  drop: { in: "y:-96", out: "y:64" }, left: { in: "x:-96", out: "x:62" },
  up: { in: "y:108", out: "y:-64" }, right: { in: "x:96", out: "x:-62" },
  zoom: { in: "scale:0.84", out: "scale:1.06" }, scaleout: { in: "scale:1.15", out: "scale:0.94" },
};
function camera(kind, ctx) {
  const c = CAM[kind] || CAM.zoom;
  const { id, T, L, isLast, i } = ctx;
  const inD = r(Math.min(0.8, L * 0.2)), outD = r(Math.min(0.65, L * 0.16));
  const pIn = c.in.split(":"), pOut = c.out.split(":");
  const from = `{${pIn[0]}:${pIn[1]},opacity:0}`;
  const to = `{${pIn[0]}:${pIn[0] === "scale" ? 1 : 0},opacity:1,duration:${inD},ease:"power3.out"}`;
  const lines = [
    i === 0 ? "" : `tl.fromTo("#${id}-camo",${from},${to},${T});`,
    isLast ? "" : `tl.to("#${id}-camo",{${pOut[0]}:${pOut[1]},opacity:0.5,duration:${outD},ease:"power2.in"},${r(T + L - outD)});`,
    // continuous live drift: slow push + bob, the film's "never freezes" rule
    `tl.fromTo("#${id}-cami",{scale:1},{scale:${r(1 + 0.035)},duration:${r(L)},ease:"none"},${T});`,
    `tl.to("#${id}-cami",{y:5,duration:1.6,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},1.6)},${T});`,
  ];
  return lines.filter(Boolean).join("\n  ");
}

// Media slot: real asset (cover) or a DESIGNED on-brand card. The engine only
// ever resolves two media assets per scene (a, b), so a 4-tile menu grid always
// has image-less cells — they must look like intentional bakery menu cards, not
// broken-image placeholders. The no-asset branch fills the cell with a warm
// accent wash, a soft grain texture, a wheat-sheaf motif and (for a labelled
// grid tile) the category name in the display serif — so an image-less tile
// reads as a real menu card, never as an empty/unfinished slot.
function slot(id, asset, th, { radius = 20, label = "", focusTop = false } = {}) {
  if (asset && asset.path) {
    return `<img data-media-slot="filled" id="${id}" src="${esc(asset.path)}" alt="${esc(asset.alt || label)}" style="width:100%;height:100%;border-radius:${radius}px;object-fit:${asset.fitContain ? "contain" : "cover"};padding:${asset.fitContain ? "7%" : "0"};object-position:${asset.fitContain ? "center" : (focusTop ? "top center" : (asset.cropFocus || "center"))};display:block;">`;
  }
  // Wheat-sheaf motif on a warm, softly-textured accent wash — the label (when
  // this is a grid tile) is already printed beneath the cell, so it isn't
  // repeated here; the card just needs to read as a designed bakery panel.
  const wheat = `<svg viewBox="0 0 48 48" fill="none" stroke="${rgba(th.accent700 || th.accent, 0.5)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24%;height:24%;">`
    + `<path d="M24 9v30"/><path d="M24 17c-3-3-8-3-8-3s0 5 3 8 5 3 5 3"/><path d="M24 17c3-3 8-3 8-3s0 5-3 8-5 3-5 3"/>`
    + `<path d="M24 27c-3-3-8-3-8-3s0 5 3 8 5 3 5 3"/><path d="M24 27c3-3 8-3 8-3s0 5-3 8-5 3-5 3"/></svg>`;
  return `<div data-media-slot="empty" id="${id}" style="width:100%;height:100%;border-radius:${radius}px;display:flex;align-items:center;justify-content:center;overflow:hidden;`
    + `border:1px solid ${rgba(th.ink, 0.12)};`
    + `background:radial-gradient(${rgba(th.ink, 0.06)} 1px, transparent 1px) 0 0/7px 7px, radial-gradient(120% 120% at 50% 20%, ${rgba(th.accent, 0.18)}, ${rgba(th.accent, 0.05)} 70%), ${th.ground};">${wheat}</div>`;
}

// Stacked serif headline lines (the film's Lines helper).
function serifLines(id, text, fallbackText, sizePx, th, land, extra = "") {
  const lines = breakLines(text, fallbackText).slice(0, 3);
  return lines.map((ln, i) =>
    `<div class="${id}-ln" style="opacity:0;font-family:${FH};font-size:${q(sizePx, land)}cqw;line-height:1.04;color:${th.ink};${extra}">${esc(ln)}</div>`).join("");
}

// ---- scenes -------------------------------------------------------------------

function hook(scene, ctx, a) {
  const { id, T, L, theme: th, land } = ctx;
  const kicker = fit(String(scene.kicker || scene.purpose || "fresh today"), 26).toUpperCase();
  const sub = fit(String(scene.subtext || ""), 90);
  const media = `<div id="${id}-fr" style="opacity:0;padding:${q(16, land)}cqw;background:${th.ground};border-radius:${q(24, land)}cqw;border:${q(10, land)}cqw solid ${rgba(th.ink, 0.82)};box-shadow:0 2cqw 4cqw ${rgba(th.ink, 0.22)};transform:rotate(-2deg);width:100%;height:100%;">
      <div style="border-radius:${q(12, land)}cqw;overflow:hidden;height:100%;">${slot(`${id}-img`, a, th, { radius: 8 })}</div>
    </div>`;
  const copy = `
    <div id="${id}-k" style="opacity:0;font-family:${FB};font-weight:800;font-size:${q(25, land)}cqw;letter-spacing:0.24em;color:${th.accent700};margin-bottom:${q(26, land)}cqw;">${esc(kicker)}</div>
    ${serifLines(id, scene.headline, "Fresh, every day", land ? 96 : 116, th, land)}
    ${sub ? `<div id="${id}-s" style="opacity:0;font-family:${FB};font-weight:500;font-size:${q(37, land)}cqw;color:${rgba(th.ink, 0.7)};margin-top:${q(30, land)}cqw;max-width:${land ? 40 : 66}cqw;">${esc(sub)}</div>` : ""}`;
  const html = land
    ? `<div style="position:absolute;left:6cqw;top:50%;transform:translateY(-50%);width:44cqw;">${copy}</div>
       <div style="position:absolute;right:7cqw;top:50%;transform:translateY(-50%);width:26cqw;height:36cqh;height:36cqw;max-height:70%;aspect-ratio:4/3;">${media}</div>`
    : `<div style="position:absolute;left:6.3cqw;right:6.3cqw;top:30.6cqw;">
         <div style="width:37cqw;height:27.8cqw;margin:0 auto ${q(54, land)}cqw;">${media}</div>${copy}</div>`;
  const s = [
    camera("drop", ctx),
    pop(`#${id}-fr`, T, L, 0),
    rise(`#${id}-k`, T, L, 1),
    `tl.fromTo("#${id} .${id}-ln",{opacity:0,y:32},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.38))},ease:"power3.out",stagger:${r(Math.min(0.22, L * 0.055))}},${r(T + 2 * Math.min(0.22, L * 0.055))});`,
    scene.subtext ? rise(`#${id}-s`, T, L, 5) : "",
    `tl.to("#${id}-fr",{rotation:-1.2,duration:1.9,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},1.9)},${r(T + 0.6)});`,
  ];
  return { html, s };
}

function statement(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const sub = fit(String(scene.subtext || ""), 100);
  // 9:16: this block sits about a third down and ends at the subtext, leaving the
  // lower half of the sheet bare. The Text Director has usually already mined
  // supporting points for the scene — flow them under the copy so the panel
  // carries real information instead of dead ground.
  const sup = land ? { html: "", s: [] } : E.supportList(`${id}-sup`, bullets(scene, 3), ctx, {
    flow: true, marginTop: q(46, land), font: q(34, land), fontFamily: FB,
    fg: rgba(th.ink, 0.72), dot: th.accent, max: 3,
  });
  const html = `<div style="position:absolute;left:${land ? 10 : 6.3}cqw;${land ? "top:50%;transform:translateY(-50%);width:64cqw;" : "right:6.3cqw;top:64.8cqw;"}">
    <div id="${id}-rule" style="opacity:0;width:${q(88, land)}cqw;height:${q(10, land)}cqw;border-radius:999px;background:${th.accent};margin-bottom:${q(42, land)}cqw;"></div>
    ${serifLines(id, scene.headline, "Made the honest way", land ? 104 : 112, th, land)}
    ${sub ? `<div id="${id}-s" style="opacity:0;font-family:${FB};font-weight:500;font-size:${q(36, land)}cqw;color:${rgba(th.ink, 0.68)};margin-top:${q(36, land)}cqw;max-width:${land ? 46 : 68}cqw;">${esc(sub)}</div>` : ""}
    ${sup.html}
  </div>`;
  const s = [
    camera("left", ctx),
    rise(`#${id}-rule`, T, L, 0),
    `tl.fromTo("#${id} .${id}-ln",{opacity:0,y:32},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.38))},ease:"power3.out",stagger:${r(Math.min(0.22, L * 0.055))}},${r(T + Math.min(0.22, L * 0.055))});`,
    sub ? rise(`#${id}-s`, T, L, 5) : "",
    ...sup.s,
    `tl.fromTo("#${id}-rule",{scaleX:0},{scaleX:1,duration:0.8,ease:"power3.out",transformOrigin:"left center"},${r(T + 0.15)});`,
  ];
  return { html, s };
}

function feature(scene, ctx, a) {
  const { id, T, L, theme: th, land } = ctx;
  const chips = (Array.isArray(scene.chips) && scene.chips.length ? scene.chips : bullets(scene, 3)).slice(0, 3).map((c) => fit(String(c), 26));
  const board = `<div id="${id}-bd" style="opacity:0;position:relative;padding:${q(20, land)}cqw;background:${rgba(th.ink, 0.9)};border-radius:${q(28, land)}cqw;box-shadow:0 2.4cqw 5cqw ${rgba(th.ink, 0.26)};width:100%;height:100%;">
      <div style="position:absolute;top:-${q(22, land)}cqw;left:50%;transform:translateX(-50%);width:${q(120, land)}cqw;height:${q(12, land)}cqw;border-radius:999px;background:${rgba(th.ink, 0.6)};"></div>
      <div style="border-radius:${q(16, land)}cqw;overflow:hidden;height:100%;background:${th.surface};">${slot(`${id}-img`, a, th, { radius: 10, focusTop: true })}</div>
    </div>`;
  const chipRow = chips.map((c, i) =>
    `<div class="${id}-tag" style="opacity:0;display:inline-flex;align-items:center;gap:${q(12, land)}cqw;padding:${q(15, land)}cqw ${q(26, land)}cqw;border-radius:999px;background:${rgba(th.accent2, 0.22)};border:2px solid ${rgba(th.accent2, 0.55)};font-family:${FB};font-weight:700;font-size:${q(29, land)}cqw;color:${th.ink};">
      <svg width="${Math.round(q(24, land) * 10)}" height="${Math.round(q(24, land) * 10)}" viewBox="0 0 24 24" fill="none" stroke="${th.accent700}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" style="width:${q(24, land)}cqw;height:${q(24, land)}cqw;"><path d="M20 6L9 17l-5-5"/></svg>${esc(c)}</div>`).join("");
  const copy = `${serifLines(id, scene.headline, "See it for yourself", land ? 78 : 90, th, land)}
    <div style="display:flex;flex-direction:column;gap:${q(16, land)}cqw;align-items:flex-start;margin-top:${q(40, land)}cqw;">${chipRow}</div>`;
  const html = land
    ? `<div style="position:absolute;left:6cqw;top:50%;transform:translateY(-50%);width:38cqw;">${copy}</div>
       <div style="position:absolute;right:6cqw;top:8%;bottom:8%;width:44cqw;">${board}</div>`
    : `<div style="position:absolute;left:6.3cqw;right:6.3cqw;top:23.1cqw;">
         ${serifLines(id, scene.headline, "See it for yourself", 90, th, land)}
         <div style="margin:${q(42, land)}cqw auto ${q(40, land)}cqw;width:59cqw;height:64.8cqw;">${board}</div>
         <div style="display:flex;flex-direction:column;gap:${q(16, land)}cqw;align-items:flex-start;">${chipRow}</div>
       </div>`;
  const s = [
    camera("up", ctx),
    `tl.fromTo("#${id} .${id}-ln",{opacity:0,y:32},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.38))},ease:"power3.out",stagger:${r(Math.min(0.22, L * 0.055))}},${T});`,
    pop(`#${id}-bd`, T, L, 2),
    `tl.fromTo("#${id} .${id}-tag",{opacity:0,scale:0.76},{opacity:1,scale:1,duration:${r(Math.min(1.2, L * 0.4))},ease:"back.out(1.5)",stagger:${r(Math.min(0.22, L * 0.055))}},${r(T + 3 * Math.min(0.22, L * 0.055))});`,
    `tl.to("#${id}-bd",{y:-6,duration:2.1,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},2.1)},${r(T + 1)});`,
  ];
  return { html, s };
}

function montage(scene, ctx, a, b) {
  const { id, T, L, theme: th, land } = ctx;
  const tiles = (Array.isArray(scene.tiles) && scene.tiles.length ? scene.tiles : bullets(scene, 4));
  const labels = [0, 1, 2, 3].map((i) => fit(String(tiles[i] || ["Our range", "Fresh daily", "In store", "Made here"][i]), 16));
  // Four tiles, four assets: the engine now fills every declared slot, and a
  // short pool cycles rather than leaving a hole — a repeated screenshot reads far
  // better than a blank white card.
  const pool = (Array.isArray(ctx.media) && ctx.media.length ? ctx.media : [a, b]).filter(Boolean);
  const media = [0, 1, 2, 3].map((k) => (pool.length ? pool[k % pool.length] : null));
  const tileH = land ? 17 : 32.4;
  const cells = [0, 1, 2, 3].map((i) =>
    `<div class="${id}-tl" style="opacity:0;">
      <div style="height:${tileH}cqw;border-radius:${q(22, land)}cqw;overflow:hidden;box-shadow:0 1.6cqw 3.4cqw ${rgba(th.ink, 0.14)};">${slot(`${id}-img${i}`, media[i], th, { radius: 12, label: labels[i] })}</div>
      <div style="font-family:${FB};font-weight:800;font-size:${q(28, land)}cqw;color:${th.ink};margin-top:${q(14, land)}cqw;">${esc(labels[i])}</div>
    </div>`).join("");
  const html = `<div style="position:absolute;left:${land ? 14 : 6.3}cqw;right:${land ? 14 : 6.3}cqw;top:${land ? 7 : 26.9}cqw;">
    ${serifLines(id, scene.headline, "Every corner of it", land ? 66 : 90, th, land)}
    <div style="margin-top:${q(46, land)}cqw;display:grid;grid-template-columns:1fr 1fr;gap:${q(24, land)}cqw;">${cells}</div>
  </div>`;
  const s = [
    camera("right", ctx),
    `tl.fromTo("#${id} .${id}-ln",{opacity:0,y:32},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.38))},ease:"power3.out",stagger:${r(Math.min(0.22, L * 0.055))}},${T});`,
    `tl.fromTo("#${id} .${id}-tl",{opacity:0,x:-26},{opacity:1,x:0,duration:${r(Math.min(1.3, L * 0.42))},ease:"power3.out",stagger:${r(Math.min(0.2, L * 0.05))}},${r(T + 0.4)});`,
    `tl.to("#${id} .${id}-tl",{y:-5,duration:1.9,ease:"sine.inOut",yoyo:true,stagger:0.12,repeat:reps(${r(Math.max(1, L - 1))},1.9)},${r(T + 1.2)});`,
  ];
  return { html, s };
}

function stats(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const sts = statsOf(scene, 3);
  const rows = (sts.length ? sts : [{ pre: "", v: 100, suf: "%", l: "MADE FOR YOU", isFloat: false }]).map((st, i) =>
    `<div class="${id}-row" style="opacity:0;display:flex;align-items:center;gap:${q(34, land)}cqw;background:${th.ground};border:2px solid ${rgba(th.ink, 0.1)};border-radius:${q(26, land)}cqw;padding:${q(30, land)}cqw ${q(40, land)}cqw;box-shadow:0 1cqw 2.4cqw ${rgba(th.ink, 0.07)};">
      <div style="min-width:${land ? 14 : 26}cqw;font-family:${FH};font-size:${q(land ? 96 : 116, land)}cqw;line-height:0.92;color:${th.accent700};font-variant-numeric:tabular-nums;"><span id="${id}-n${i}">0</span><span style="font-size:${q(land ? 48 : 58, land)}cqw;">${esc(st.suf || "")}</span></div>
      <div style="font-family:${FB};font-weight:600;font-size:${q(36, land)}cqw;color:${rgba(th.ink, 0.7)};">${esc((st.l || "").toLowerCase() || "and counting")}</div>
    </div>`).join("");
  const html = `<div style="position:absolute;left:${land ? 16 : 6.3}cqw;right:${land ? 16 : 6.3}cqw;${land ? "top:50%;transform:translateY(-50%);" : "top:44.4cqw;"}">
    ${serifLines(id, scene.headline, "By the numbers", land ? 64 : 88, th, land)}
    <div style="margin-top:${q(56, land)}cqw;display:flex;flex-direction:column;gap:${q(26, land)}cqw;">${rows}</div>
  </div>`;
  const s = [
    camera("zoom", ctx),
    `tl.fromTo("#${id} .${id}-ln",{opacity:0,y:32},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.38))},ease:"power3.out",stagger:${r(Math.min(0.22, L * 0.055))}},${T});`,
    `tl.fromTo("#${id} .${id}-row",{opacity:0,y:32},{opacity:1,y:0,duration:${r(Math.min(1.3, L * 0.38))},ease:"power3.out",stagger:${r(Math.min(0.24, L * 0.06))}},${r(T + 0.45)});`,
    ...(sts.length ? sts : [{ v: 100, suf: "%", pre: "" }]).map((st, i) =>
      `countTxt("#${id}-n${i}",${st.v},${r(T + 0.6 + i * 0.2)},${r(Math.min(1.8, L * 0.5))},"${esc(st.pre || "")}","",${st.isFloat ? 10 : 1});`),
  ];
  return { html, s };
}

function cta(scene, ctx, a) {
  const { id, T, L, theme: th, land, brand, url } = ctx;
  const label = fit(String(scene.cta || scene.buttonLabel || "Find out more"), 24);
  // 9:16: the closing block ends at the url with the lower sheet empty — close on
  // the film's own proof points rather than dead ground (see statement above).
  const sup = land ? { html: "", s: [] } : E.supportList(`${id}-sup`, bullets(scene, 3), ctx, {
    flow: true, marginTop: q(44, land), font: q(33, land), fontFamily: FB,
    fg: rgba(th.ink, 0.7), dot: th.accent, max: 3,
  });
  const logo = a && a.path
    ? `<img src="${esc(a.path)}" alt="logo" style="width:100%;height:100%;object-fit:contain;">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${th.accent};color:${th.ground};font-family:${FH};font-size:${q(64, land)}cqw;">${esc(String(brand).slice(0, 1).toUpperCase())}</div>`;
  const html = `<div style="position:absolute;left:${land ? 12 : 6.3}cqw;${land ? "top:50%;transform:translateY(-50%);width:60cqw;" : "right:6.3cqw;top:57.4cqw;"}">
    <div id="${id}-lg" style="opacity:0;width:${q(148, land)}cqw;height:${q(148, land)}cqw;border-radius:999px;overflow:hidden;margin-bottom:${q(44, land)}cqw;box-shadow:0 1.4cqw 3cqw ${rgba(th.ink, 0.2)};">${logo}</div>
    ${serifLines(id, scene.headline, "Come see for yourself", land ? 96 : 112, th, land)}
    <div id="${id}-btn" style="opacity:0;display:inline-flex;align-items:center;gap:${q(16, land)}cqw;margin-top:${q(50, land)}cqw;padding:${q(26, land)}cqw ${q(50, land)}cqw;border-radius:999px;background:${th.accent};color:${th.ground};font-family:${FH};font-size:${q(44, land)}cqw;">${esc(label)}
      <svg viewBox="0 0 24 24" fill="none" stroke="${th.ground}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" style="width:${q(38, land)}cqw;height:${q(38, land)}cqw;"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
    </div>
    <div id="${id}-url" style="opacity:0;font-family:${FB};font-weight:700;font-size:${q(38, land)}cqw;letter-spacing:0.04em;color:${th.accent700};margin-top:${q(42, land)}cqw;">${esc(url)}</div>
    ${sup.html}
  </div>`;
  const s = [
    camera("scaleout", ctx),
    ...sup.s,
    pop(`#${id}-lg`, T, L, 0),
    `tl.fromTo("#${id} .${id}-ln",{opacity:0,y:32},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.38))},ease:"power3.out",stagger:${r(Math.min(0.22, L * 0.055))}},${r(T + Math.min(0.22, L * 0.055))});`,
    pop(`#${id}-btn`, T, L, 3),
    rise(`#${id}-url`, T, L, 5),
    `tl.to("#${id}-btn",{scale:1.04,duration:1.1,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(1, L - 1.4))},1.1)},${r(T + 1.2)});`,
  ];
  return { html, s };
}

const SCENES = { hook, statement, feature, montage, stats, cta };

// ---- chrome: the living bakehouse world + brand chip + progress rail ----------
function chrome({ theme: th, D, brand, count, land, r: rr, esc: esch }) {
  const counterY = land ? 88 : 90.5; // % of height
  const beams = (land ? [16, 44, 72] : [18, 62]).map((x, i) =>
    `<div class="bh-beam" style="position:absolute;left:${x}%;top:-6%;width:9%;height:112%;transform:rotate(${land ? 14 : 9}deg);background:linear-gradient(180deg,${rgba(th.dawn, 0.4)},${rgba(th.dawn, 0)} 78%);"></div>`).join("");
  const motes = Array.from({ length: 10 }, (_, i) =>
    `<div class="bh-mote" style="position:absolute;left:${6 + (i * 91) % 89}%;top:${12 + (i * 37) % 70}%;width:${4 + (i % 3) * 2}px;height:${4 + (i % 3) * 2}px;border-radius:999px;background:${rgba(th.dawn, 0.7)};"></div>`).join("");
  const lampX = land ? [70, 92] : [62, 88]; // right flank only — the brand chip owns the top-left
  const lamps = lampX.map((x, i) =>
    `<div class="bh-lamp" style="position:absolute;left:${x}%;top:0;width:0;transform-origin:top center;">
      <div style="width:2px;height:${land ? 8 : 5.4}cqw;background:${rgba(th.ink, 0.34)};margin:0 auto;"></div>
      <div style="width:${land ? 5 : 9}cqw;height:${land ? 2.4 : 4.4}cqw;background:${rgba(th.ink, 0.8)};clip-path:polygon(8% 0,92% 0,100% 100%,0 100%);transform:translateX(-50%);"></div>
      <div style="width:${land ? 1.4 : 2.6}cqw;height:${land ? 1.4 : 2.6}cqw;border-radius:999px;background:${th.dawn};box-shadow:0 0 1.6cqw ${rgba(th.dawn, 0.95)};transform:translateX(-50%);margin-top:0.2cqw;"></div>
    </div>`).join("");
  const cupX = land ? 88 : 82;
  const html = `
  <div id="bh-world" class="clip" data-start="0" data-duration="__D__" data-track-index="1" data-layout-allow-occlusion style="opacity:0;background:${th.ground};">
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 76% 12%, ${rgba(th.accent, 0.26)}, transparent 46%),linear-gradient(180deg, ${rgba(th.accent, 0.12)}, transparent 45%);"></div>
    <div id="bh-sun" style="position:absolute;left:${land ? 78 : 68}%;top:${land ? 10 : 7}%;width:12cqw;height:12cqw;border-radius:999px;background:${rgba(th.accent, 0.2)};box-shadow:0 0 6cqw ${rgba(th.accent, 0.3)};"></div>
    ${beams}${motes}
    <div style="position:absolute;left:0;right:0;top:${counterY}%;bottom:0;background:linear-gradient(180deg, ${th.surface}, ${rgba(th.accent, 0.3)});border-top:3px solid ${rgba(th.ink, 0.1)};"></div>
    <div id="bh-cup" style="position:absolute;left:${cupX}%;top:${counterY - (land ? 6 : 3.4)}%;width:${land ? 3.4 : 5.2}cqw;">
      <div id="bh-steam" style="width:30%;height:${land ? 3.4 : 5.6}cqw;margin:0 auto;border-radius:999px;background:linear-gradient(180deg,${rgba("#ffffff", 0)},${rgba("#fbf1e3", 0.6)});filter:blur(2px);"></div>
      <div style="width:100%;height:${land ? 2.2 : 3.4}cqw;background:${rgba("#fbf1e3", 0.95)};border:2px solid ${rgba(th.ink, 0.16)};clip-path:polygon(0 0,100% 0,88% 100%,12% 100%);"></div>
    </div>
    ${lamps}
  </div>
  <div id="bh-chrome" class="clip" data-start="0" data-duration="__D__" data-track-index="39" data-layout-allow-occlusion style="opacity:0;background:none;">
    <div style="position:absolute;top:${land ? 4 : 3.2}%;left:${land ? 3.5 : 6.3}%;display:flex;align-items:center;gap:1.4cqw;">
      <div style="width:${land ? 2.6 : 4.3}cqw;height:${land ? 2.6 : 4.3}cqw;border-radius:999px;background:${th.accent};display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="${th.ground}" stroke-width="2.75" stroke-linecap="round" style="width:60%;height:60%;"><path d="M4 19h16"/><path d="M5 19c-1-5 2-9 7-9s8 4 7 9"/><path d="M12 6c0-1.5 1-2.5 2.5-2.5"/></svg>
      </div>
      <span style="font-family:${FH};font-size:${land ? 1.8 : 3}cqw;color:${th.ink};">${esch(brand)}</span>
    </div>
  </div>`;
  const script = `
  tl.fromTo("#bh-world",{opacity:0},{opacity:1,duration:0.5},0);
  tl.fromTo("#bh-chrome",{opacity:0},{opacity:1,duration:0.5},0.2);
  tl.to("#bh-sun",{y:-10,duration:3.2,ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},3.2)},0);
  tl.to(".bh-beam",{opacity:0.55,duration:2.4,ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},2.4),stagger:0.5},0);
  tl.to(".bh-mote",{y:-28,duration:3,ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},3),stagger:0.3},0);
  tl.to(".bh-lamp",{rotation:3.2,duration:1.9,ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},1.9),stagger:0.4},0);
  tl.to("#bh-steam",{y:-8,opacity:0.5,duration:1.6,ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},1.6)},0);`;
  return { html, script };
}

// No per-scene chrome. The segmented progress rail that used to fill along the
// base was removed: a bar ticking scene-by-scene reads as a SLIDESHOW, which is
// exactly the feel these films must avoid.

function styleBlock(th) {
  return `${th.fontFace}
  #root { font-family:${th.bodyStack}; }
  #cap-pill { background:${rgba(th.ground, 0.92)}; border:1px solid ${rgba(th.accent, 0.4)} !important; }
  #cap-text { font-family:${th.bodyStack}; color:${th.ink}; }`;
}

const family = {
  theme, styleBlock, chrome, SCENES, TEMPLATE_SCENES, route, mediaSlots, mediaFallback, wantsLogo,
  // Empty slots in this pack render a featureless placeholder card, so a
  // REPEAT of a real screenshot/photo beats leaving one blank.
  recycleMedia: true,
  fallbackType: "statement",
  variants: 1,
  camera: { enabled: false }, // per-beat camera is baked into each scene (the film's own kinds)
};

function buildComposition(opts) { return E.buildFilm(family, opts); }
// This pack's media demand + what filled each slot, WITHOUT rendering. Runs the
// exact routing and slot-filling the renderer runs, so the manifest can never
// drift from the film that ships.
function planMedia(opts) { return E.planMedia(family, opts); }

module.exports = { buildComposition, planMedia, TEMPLATE_SCENES };
