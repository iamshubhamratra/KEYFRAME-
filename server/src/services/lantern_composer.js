// LANTERN NIGHT composer — a faithful native GSAP port of the user's
// "Lantern Night" bundled reel template (lantern-night-film.jsx).
// The pack `lantern-night` (manifest renderer routes here) so selecting the
// template gives THE TEMPLATE: its six authored beats (hung glow-card Hook,
// glow-rule Statement, big lantern-glass Feature plate, 2×2 hanging-tile
// Montage, glowing counter-row Stats, logo-circle CTA with an up arrow), its
// per-beat camera kinds (floatup / swayl / zoomdeep / swayr / rise-sc /
// floatdown with a continuous lantern bob that never freezes), its living
// night world (ink-sky gradient, twinkling stars, haloed cratered moon,
// glowing paper lanterns endlessly rising in 3 parallax layers with sway and
// flicker, sage fireflies, a water band with shimmering reflections) and its
// chrome (lantern brand chip top-left, glowing per-scene progress rail).
// Only the CONTENT is swapped: headlines/subs from the script, chips/tiles/
// stats mined by the Template Director, and the template's own media slots
// filled with the film's REAL assets — the website screenshot on the feature
// plate, parsed site images in the hook card and montage tiles, the brand
// logo in the CTA circle.
//
// The theme ground is DARK (#171310-ish): text ink is the pack's paper cream
// (deriveTheme's resolved ink), never a light-ground assumption. Portrait
// (the template's native 9:16) reproduces the film's layout ~1:1 in cqw;
// landscape re-stages each beat as a two-column adaptation with the same
// type, motion and world. Render contract is template_engine's (seek-safe,
// finite repeats, hard kills); this module is design only.

const { deriveTheme } = require("./scene_kit");
const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const E = require("./template_engine");
const { esc, r, rgba, mix, statsOf, breakLines, bullets, fit } = E;

const FH = "'Caprasimo', Georgia, serif";
const FB = "'Figtree', system-ui, sans-serif";

// ---- theme --------------------------------------------------------------------
// DARK house: ground is the night ink; the pack's authored ink IS the paper
// cream, so `paper` aliases the resolved text ink. glow/deep/firefly re-derive
// from the (possibly brand-skinned) accents so brand retints carry the world.
function theme(manifest, brandSkin, { framePack, land } = {}) {
  const t = deriveTheme(framePack || "lantern-night", {}, brandSkin);
  const ground = t.ground || "#171310";
  const paper = t.ink || "#f5ead8";
  const accent = (t.accents && t.accents[0]) || "#c67139";   // lantern terracotta
  const accent2 = (t.accents && t.accents[1]) || "#7a8a5e";  // sage fireflies
  return {
    ...t, ground, ink: paper, paper, accent, accent2,
    glow: mix(accent, "#ffffff", 0.38),          // the film's #e8a066 lantern glow
    deep: mix(ground, "#000000", 0.35),          // the film's ink2 deep sky
    firefly: mix(accent2, "#ffffff", 0.5),       // the film's #cdd8b4 fly core
    horizon: mix(ground, accent, 0.16),          // warm accent wash at the skyline
    displayStack: FH, bodyStack: FB,
    fontFace: (isBundled("Caprasimo") ? fontFaceCss("Caprasimo") : "") + (isBundled("Figtree") ? fontFaceCss("Figtree") : ""),
  };
}

// ---- vocabulary (Template Director casts onto these) --------------------------
const TEMPLATE_SCENES = [
  {
    type: "hook", bestFor: "opening — who this is and the night promise",
    look: "A glowing lantern-glass card hung from a string above a letter-spaced glow kicker, a big round serif headline rising line by line with its key line GLOWING like a lantern, and a one-sentence sub — centered in the night sky.",
    slots: { kicker: "max 26 chars, uppercase", headline: "2-3 short lines ('|' breaks)", subtext: "one warm sentence, max 90 chars" },
    media: ["photo"],
  },
  {
    type: "statement", bestFor: "the problem or a bold belief",
    look: "A glowing accent rule bar, then 2-3 stacked serif lines (key line glows) and a supporting sentence — quiet staging over the rising lanterns, all type.",
    slots: { headline: "2-3 short lines", subtext: "one sentence, max 100 chars" },
    media: [],
  },
  {
    type: "feature", bestFor: "the product/offer shown for real",
    look: "One huge lantern-glass plate holding the website screenshot or product shot, glow-rimmed chip pills with lit dots popping in beneath.",
    slots: { headline: "max 2 short lines", chips: "2-3 items, max 26 chars each" },
    media: ["desktop"],
  },
  {
    type: "montage", bestFor: "range — several items/pages/angles",
    look: "A 2×2 grid of labeled photo tiles, each a tilted lantern-glass card swaying gently on its string.",
    slots: { headline: "max 2 short lines", tiles: "4 short labels, max 16 chars each" },
    media: ["photo", "photo"], mediaMin: 0,
  },
  {
    type: "stats", bestFor: "numbers that prove it",
    look: "Up to three counter rows over glowing baseline rules — a big glowing serif figure counting up beside its label.",
    slots: { headline: "max 2 short lines", stats: "1-3 of {v, suf, l}" },
    media: [],
  },
  {
    type: "cta", bestFor: "closing invitation",
    look: "The brand logo in a glow-ringed circle, a final serif headline (key line glowing), an accent lantern-pill button with an UP arrow — send it into the sky — and the url in glow type.",
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

const ST = (L) => r(Math.min(0.22, L * 0.06));   // the film's 0.06·p stagger step
const DUR = (L) => r(Math.min(1.5, L * 0.44));   // the film's 0.44·p motion window

// The film's M.rise: outQuint rise from 44px.
function rise(sel, T, L, idx, e = 1) {
  return `tl.fromTo("${sel}",{opacity:0,y:${r(44 * e)}},{opacity:1,y:0,duration:${DUR(L)},ease:"expo.out"},${r(T + idx * ST(L))});`;
}
// The film's M.pop: outBack(1.6) scale from 0.72.
function pop(sel, T, L, idx) {
  return `tl.fromTo("${sel}",{opacity:0,scale:0.72},{opacity:1,scale:1,duration:${DUR(L)},ease:"back.out(1.6)"},${r(T + idx * ST(L))});`;
}

// The film's per-beat camera on the engine's #id-camo/-cami rig: each scene
// type keeps its authored cam kind — directional enter (outQuint), directional
// exit (inCubic), plus the "lantern-like float, never still" continuous bob.
const CAM = {
  floatup: { in: "y:150", out: "y:-110" },
  floatdown: { in: "y:-150", out: "y:110" },
  zoomdeep: { in: "scale:0.76,y:40", out: "scale:1.1" },
  swayl: { in: "x:-120,rotation:-2.4", out: "x:80,rotation:1.2" },
  swayr: { in: "x:120,rotation:2.4", out: "x:-80,rotation:-1.2" },
  risesc: { in: "y:130,scale:1.12", out: "y:-90" },
};
function camera(kind, ctx) {
  const c = CAM[kind] || CAM.floatup;
  const { id, T, L, isLast, i } = ctx;
  const inD = r(Math.min(1.0, L * 0.24)), outD = r(Math.min(0.7, L * 0.18));
  const neutral = c.in.split(",").map((p) => `${p.split(":")[0]}:${p.split(":")[0] === "scale" ? 1 : 0}`).join(",");
  const lines = [
    i === 0 ? "" : `tl.fromTo("#${id}-camo",{${c.in},opacity:0},{${neutral},opacity:1,duration:${inD},ease:"expo.out"},${T});`,
    isLast ? "" : `tl.to("#${id}-camo",{${c.out},opacity:0.5,duration:${outD},ease:"power2.in"},${r(T + L - outD)});`,
    // continuous drift: slow push + the film's sin-clock bob (y ±7, rot ±0.5)
    `tl.fromTo("#${id}-cami",{scale:1},{scale:1.033,duration:${r(L)},ease:"none"},${T});`,
    `tl.to("#${id}-cami",{y:7,duration:2.6,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},2.6)},${T});`,
    `tl.to("#${id}-cami",{rotation:0.5,duration:3.4,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},3.4)},${T});`,
  ];
  return lines.filter(Boolean).join("\n  ");
}

// Media slot: real asset (cover) or the template's dark dashed placeholder
// panel (never the "DROP IMAGE" text).
function slot(id, asset, th, { radius = 20, label = "", focusTop = false } = {}) {
  if (asset && asset.path) {
    return `<img data-media-slot="filled" id="${id}" src="${esc(asset.path)}" alt="${esc(asset.alt || label)}" style="width:100%;height:100%;border-radius:${radius}px;object-fit:${asset.fitContain ? "contain" : "cover"};padding:${asset.fitContain ? "7%" : "0"};object-position:${asset.fitContain ? "center" : (focusTop ? "top center" : (asset.cropFocus || "center"))};display:block;">`;
  }
  return `<div data-media-slot="empty" id="${id}" style="width:100%;height:100%;border-radius:${radius}px;display:flex;align-items:center;justify-content:center;background:${rgba(th.paper, 0.06)};border:1px solid ${rgba(th.paper, 0.4)};">
    
  </div>`;
}

// The film's GlowCard: a glass card with a lantern-glow rim, optional hanging
// string. Returns the CARD ONLY — scenes wrap it in their own pop/sway divs
// (wrapper must be position:relative for the string).
function lanternCard(inner, th, land, { glow = 0.5, string = false } = {}) {
  const stringH = land ? 15 : 27.8;
  return `${string ? `<div style="position:absolute;left:50%;bottom:100%;width:0.26cqw;height:${stringH}cqw;background:linear-gradient(${rgba(th.paper, 0)}, ${rgba(th.paper, 0.35)});"></div>` : ""}
    <div style="position:relative;height:100%;border-radius:${q(30, land)}cqw;padding:${q(14, land)}cqw;background:${rgba(th.paper, 0.07)};border:2px solid ${rgba(th.glow, 0.4)};box-shadow:0 0 ${r(4.2 * glow + 1.8)}cqw ${rgba(th.accent, r(0.35 * glow))}, 0 ${q(28, land)}cqw ${q(64, land)}cqw rgba(0,0,0,0.5);">
      <div style="border-radius:${q(20, land)}cqw;overflow:hidden;height:100%;">${inner}</div>
    </div>`;
}

// The film's GlowWord shadow states (rest / hot) for the pulsing key line.
const glowRest = (th) => `0 0 24px ${rgba(th.accent, 0.45)}, 0 0 80px ${rgba(th.accent, 0.28)}`;
const glowHot = (th) => `0 0 46px ${rgba(th.accent, 0.85)}, 0 0 120px ${rgba(th.accent, 0.45)}`;
function glowPulse(id, T, L, th) {
  return `tl.fromTo("#${id} .${id}-gl",{textShadow:"${glowRest(th)}"},{textShadow:"${glowHot(th)}",duration:1.5,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(1, L - 0.8))},1.5)},${r(T + 0.8)});`;
}

// Stacked serif headline lines (the film's Title helper): each line rises;
// the marked line (scene.mark / scene.emphasis, else last — or first when the
// scene authors it that way) is the GlowWord in warm lantern glow.
function serifLines(id, text, fallbackText, sizePx, th, land, { mark, markFirst } = {}) {
  const lines = breakLines(text, fallbackText).slice(0, 3);
  const m = String(mark || "").trim().toLowerCase();
  let gi = m ? lines.findIndex((ln) => ln.trim().toLowerCase() === m || ln.toLowerCase().includes(m)) : -1;
  if (gi < 0) gi = markFirst ? 0 : lines.length - 1;
  return lines.map((ln, i) => {
    const isGlow = i === gi;
    const color = isGlow ? `color:${th.glow};text-shadow:${glowRest(th)};` : `color:${th.paper};`;
    return `<div class="${id}-ln${isGlow ? ` ${id}-gl` : ""}" style="opacity:0;font-family:${FH};font-size:${q(sizePx, land)}cqw;line-height:1.04;${color}">${esc(ln)}</div>`;
  }).join("");
}
function titleReveal(id, T, L, from) {
  return `tl.fromTo("#${id} .${id}-ln",{opacity:0,y:44},{opacity:1,y:0,duration:${DUR(L)},ease:"expo.out",stagger:${ST(L)}},${r(T + from * ST(L))});`;
}

// ---- scenes -------------------------------------------------------------------

function hook(scene, ctx, a) {
  const { id, T, L, theme: th, land } = ctx;
  const kicker = fit(String(scene.kicker || scene.purpose || "when the sun goes down"), 26).toUpperCase();
  const sub = fit(String(scene.subtext || ""), 90);
  const media = `<div id="${id}-w" style="opacity:0;position:relative;width:100%;height:100%;">${lanternCard(slot(`${id}-img`, a, th, { radius: 12 }), th, land, { glow: 0.8, string: true })}</div>`;
  const copy = `
    <div id="${id}-k" style="opacity:0;font-family:${FB};font-weight:800;font-size:${q(25, land)}cqw;letter-spacing:0.26em;color:${rgba(th.glow, 0.9)};margin-bottom:${q(28, land)}cqw;">${esc(kicker)}</div>
    ${serifLines(id, scene.headline, "The night|comes|alive.", land ? 104 : 128, th, land, { mark: scene.mark || scene.emphasis })}
    ${sub ? `<div id="${id}-s" style="opacity:0;font-family:${FB};font-weight:500;font-size:${q(37, land)}cqw;color:${rgba(th.paper, 0.65)};margin-top:${q(32, land)}cqw;">${esc(sub)}</div>` : ""}`;
  const html = land
    ? `<div style="position:absolute;left:7cqw;top:50%;transform:translateY(-50%);width:43cqw;">${copy}</div>
       <div style="position:absolute;right:8cqw;top:50%;transform:translateY(-50%);width:27cqw;height:16.6cqw;">${media}</div>`
    : `<div style="position:absolute;left:6.3cqw;right:6.3cqw;top:38.9cqw;text-align:center;">
         <div style="width:48.1cqw;height:29.6cqw;margin:0 auto ${q(60, land)}cqw;">${media}</div>${copy}</div>`;
  const s = [
    camera("floatup", ctx),
    pop(`#${id}-w`, T, L, 0),
    rise(`#${id}-k`, T, L, 1),
    titleReveal(id, T, L, 2),
    sub ? rise(`#${id}-s`, T, L, 6) : "",
    glowPulse(id, T, L, th),
    // the hung card sways gently on its string
    `tl.to("#${id}-w",{rotation:-1.1,duration:2.4,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},2.4)},${r(T + 0.7)});`,
  ];
  return { html, s };
}

function statement(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const sub = fit(String(scene.subtext || ""), 100);
  // 9:16: see daybreak_composer's statement — the block ends at the subtext and
  // leaves the lower half bare. Flow the scene's supporting points under the copy.
  const sup = land ? { html: "", s: [] } : E.supportList(`${id}-sup`, bullets(scene, 3), ctx, {
    flow: true, marginTop: q(46, land), font: q(34, land), fontFamily: FB,
    fg: rgba(th.paper, 0.68), dot: th.accent, max: 3,
  });
  const html = `<div style="position:absolute;left:${land ? 10 : 6.3}cqw;${land ? "top:50%;transform:translateY(-50%);width:62cqw;" : "right:6.3cqw;top:63cqw;"}">
    <div id="${id}-rule" style="opacity:0;width:${q(88, land)}cqw;height:${q(10, land)}cqw;border-radius:999px;background:${th.accent};box-shadow:0 0 2.2cqw ${rgba(th.accent, 0.7)};margin-bottom:${q(44, land)}cqw;"></div>
    ${serifLines(id, scene.headline, "Everything looks|the same|in daylight.", land ? 94 : 112, th, land, { mark: scene.mark || scene.emphasis })}
    ${sub ? `<div id="${id}-s" style="opacity:0;font-family:${FB};font-weight:500;font-size:${q(36, land)}cqw;color:${rgba(th.paper, 0.62)};margin-top:${q(38, land)}cqw;max-width:${land ? 46 : 70.4}cqw;">${esc(sub)}</div>` : ""}
    ${sup.html}
  </div>`;
  const s = [
    camera("swayl", ctx),
    rise(`#${id}-rule`, T, L, 0),
    titleReveal(id, T, L, 1),
    sub ? rise(`#${id}-s`, T, L, 5) : "",
    ...sup.s,
    glowPulse(id, T, L, th),
    `tl.fromTo("#${id}-rule",{scaleX:0},{scaleX:1,duration:0.8,ease:"power3.out",transformOrigin:"left center"},${r(T + 0.15)});`,
  ];
  return { html, s };
}

function feature(scene, ctx, a) {
  const { id, T, L, theme: th, land } = ctx;
  const chips = (Array.isArray(scene.chips) && scene.chips.length ? scene.chips : bullets(scene, 3)).slice(0, 3).map((c) => fit(String(c), 26));
  const board = `<div id="${id}-bd" style="opacity:0;position:relative;width:100%;height:100%;">${lanternCard(slot(`${id}-img`, a, th, { radius: 12, focusTop: true }), th, land, { glow: 1 })}</div>`;
  const chipRow = chips.map((c) =>
    `<div class="${id}-tag" style="opacity:0;display:inline-flex;align-items:center;gap:${q(12, land)}cqw;padding:${q(15, land)}cqw ${q(28, land)}cqw;border-radius:999px;background:${rgba(th.paper, 0.07)};border:2px solid ${rgba(th.glow, 0.45)};box-shadow:0 0 2.4cqw ${rgba(th.accent, 0.18)};font-family:${FB};font-weight:700;font-size:${q(29, land)}cqw;color:${th.paper};">
      <span style="width:${q(13, land)}cqw;height:${q(13, land)}cqw;border-radius:999px;background:${th.glow};box-shadow:0 0 1.1cqw ${rgba(th.accent, 0.9)};flex:none;"></span>${esc(c)}</div>`).join("");
  const html = land
    ? `<div style="position:absolute;left:6cqw;top:50%;transform:translateY(-50%);width:36cqw;">
         ${serifLines(id, scene.headline, "Light up|the main event.", 76, th, land, { mark: scene.mark || scene.emphasis, markFirst: true })}
         <div style="display:flex;flex-direction:column;gap:${q(16, land)}cqw;align-items:flex-start;margin-top:${q(40, land)}cqw;">${chipRow}</div>
       </div>
       <div style="position:absolute;right:6cqw;top:9%;bottom:9%;width:47cqw;">${board}</div>`
    : `<div style="position:absolute;left:6.3cqw;right:6.3cqw;top:24cqw;">
         ${serifLines(id, scene.headline, "Light up|the main event.", 92, th, land, { mark: scene.mark || scene.emphasis, markFirst: true })}
         <div style="margin:${q(48, land)}cqw auto ${q(46, land)}cqw;width:87.4cqw;height:57.4cqw;">${board}</div>
         <div style="display:flex;flex-wrap:wrap;gap:${q(18, land)}cqw;justify-content:center;">${chipRow}</div>
       </div>`;
  const s = [
    camera("zoomdeep", ctx),
    titleReveal(id, T, L, 0),
    pop(`#${id}-bd`, T, L, 2),
    `tl.fromTo("#${id} .${id}-tag",{opacity:0,scale:0.72},{opacity:1,scale:1,duration:${DUR(L)},ease:"back.out(1.6)",stagger:${ST(L)}},${r(T + 3 * ST(L))});`,
    glowPulse(id, T, L, th),
    `tl.to("#${id}-bd",{y:-6,duration:2.2,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},2.2)},${r(T + 1)});`,
  ];
  return { html, s };
}

function montage(scene, ctx, a, b) {
  const { id, T, L, theme: th, land } = ctx;
  const tiles = (Array.isArray(scene.tiles) && scene.tiles.length ? scene.tiles : bullets(scene, 4));
  // Label comes from the IMAGE that lands in the tile, not from the script in
  // parallel — see E.labelForAsset. A card captioned "Inbox" showing the Planner
  // page is a mismatch a viewer notices immediately.
  // Four tiles, four assets: the engine now fills every declared slot, and a
  // short pool cycles rather than leaving a hole — a repeated screenshot reads far
  // better than a blank white card.
  const pool = (Array.isArray(ctx.media) && ctx.media.length ? ctx.media : [a, b]).filter(Boolean);
  const media = [0, 1, 2, 3].map((k) => (pool.length ? pool[k % pool.length] : null));
  const labels = [0, 1, 2, 3].map((i) =>
    E.labelForAsset(media[i], tiles[i] || ["The gates", "Food row", "Main stage", "River launch"][i], 16));
  const tilts = [-4, 3, 2.5, -3];
  const tileH = land ? 12.5 : 26.5;  // PORTRAIT: two tiles at FULL width rather than four at half. A 2x2 wall in
  // 9:16 puts each plate under ~330px, where a product screenshot stops being
  // readable; stacked full width they get the whole frame. Fewer, bigger.

  const cells = (land ? [0, 1, 2, 3] : [0, 1]).map((i) =>
    `<div class="${id}-tl" style="opacity:0;">
      <div style="transform:rotate(${tilts[i]}deg);transform-origin:50% -${land ? 12 : 27.8}cqw;">
        <div class="${id}-sw" style="position:relative;height:${tileH}cqw;">${lanternCard(slot(`${id}-img${i}`, media[i], th, { radius: 10, label: labels[i] }), th, land, { glow: 0.45, string: true })}</div>
      </div>
      <div style="font-family:${FB};font-weight:800;font-size:${q(27, land)}cqw;color:${rgba(th.paper, 0.85)};margin-top:${q(16, land)}cqw;text-align:center;">${esc(labels[i])}</div>
    </div>`).join("");
  const html = land
    ? `<div style="position:absolute;left:8cqw;right:8cqw;top:8cqw;">
         ${serifLines(id, scene.headline, "Four corners|of the night.", 64, th, land, { mark: scene.mark || scene.emphasis })}
         <div style="margin-top:${q(44, land)}cqw;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:1.6cqw;">${cells}</div>
       </div>`
    : `<div style="position:absolute;left:6.3cqw;right:6.3cqw;top:27.8cqw;">
         ${serifLines(id, scene.headline, "Four corners|of the night.", 92, th, land, { mark: scene.mark || scene.emphasis })}
         <div style="margin-top:${q(54, land)}cqw;display:grid;grid-template-columns:1fr;gap:${q(30, land)}cqw;">${cells}</div>
       </div>`;
  const s = [
    camera("swayr", ctx),
    titleReveal(id, T, L, 0),
    `tl.fromTo("#${id} .${id}-tl",{opacity:0,scale:0.72},{opacity:1,scale:1,duration:${DUR(L)},ease:"back.out(1.6)",stagger:${ST(L)}},${r(T + 2 * ST(L))});`,
    glowPulse(id, T, L, th),
    // hanging tiles sway on their strings
    `tl.to("#${id} .${id}-sw",{rotation:1.5,duration:2.4,ease:"sine.inOut",yoyo:true,stagger:0.35,repeat:reps(${r(Math.max(1, L - 1))},2.4)},${r(T + 0.9)});`,
  ];
  return { html, s };
}

function stats(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const sts = statsOf(scene, 3);
  const list = sts.length ? sts : [{ pre: "", v: 1000, suf: "+", l: "lanterns in the sky", isFloat: false }];
  const rows = list.map((st, i) =>
    `<div class="${id}-row" style="opacity:0;display:flex;align-items:baseline;gap:${q(36, land)}cqw;border-bottom:2px solid ${rgba(th.glow, 0.25)};padding-bottom:${q(30, land)}cqw;">
      <div style="min-width:${land ? 13 : 24}cqw;font-family:${FH};font-size:${q(land ? 100 : 132, land)}cqw;line-height:0.92;color:${th.glow};text-shadow:0 0 2.4cqw ${rgba(th.accent, 0.55)};font-variant-numeric:tabular-nums;"><span id="${id}-n${i}">0</span><span style="font-size:${q(land ? 52 : 64, land)}cqw;">${esc(st.suf || "")}</span></div>
      <div style="font-family:${FB};font-weight:600;font-size:${q(37, land)}cqw;color:${rgba(th.paper, 0.68)};">${esc((st.l || "").toLowerCase() || "and counting")}</div>
    </div>`).join("");
  const html = land
    ? `<div style="position:absolute;left:8cqw;top:50%;transform:translateY(-50%);width:28cqw;">
         ${serifLines(id, scene.headline, "The night,|measured.", 70, th, land, { mark: scene.mark || scene.emphasis })}
       </div>
       <div style="position:absolute;right:8cqw;top:50%;transform:translateY(-50%);width:50cqw;display:flex;flex-direction:column;gap:${q(40, land)}cqw;">${rows}</div>`
    : `<div style="position:absolute;left:6.3cqw;right:6.3cqw;top:42.6cqw;">
         ${serifLines(id, scene.headline, "The night,|measured.", 88, th, land, { mark: scene.mark || scene.emphasis })}
         <div style="margin-top:${q(64, land)}cqw;display:flex;flex-direction:column;gap:${q(54, land)}cqw;">${rows}</div>
       </div>`;
  const s = [
    camera("risesc", ctx),
    titleReveal(id, T, L, 0),
    `tl.fromTo("#${id} .${id}-row",{opacity:0,y:44},{opacity:1,y:0,duration:${DUR(L)},ease:"expo.out",stagger:${ST(L)}},${r(T + 2 * ST(L))});`,
    glowPulse(id, T, L, th),
    ...list.map((st, i) =>
      `countTxt("#${id}-n${i}",${st.v},${r(T + 0.6 + i * 0.2)},${r(Math.min(1.8, L * 0.5))},"${esc(st.pre || "")}","",${st.isFloat ? 10 : 1});`),
  ];
  return { html, s };
}

function cta(scene, ctx, a) {
  const { id, T, L, theme: th, land, brand, url } = ctx;
  const label = fit(String(scene.cta || scene.buttonLabel || "Get your lantern"), 24);
  // 9:16: the closing block ends at the url with the lower sheet empty — close on
  // the film's own proof points rather than dead ground (see statement above).
  const sup = land ? { html: "", s: [] } : E.supportList(`${id}-sup`, bullets(scene, 3), ctx, {
    flow: true, marginTop: q(44, land), font: q(33, land), fontFamily: FB,
    fg: rgba(th.paper, 0.7), dot: th.accent, max: 3,
  });
  const logo = a && a.path
    ? `<img src="${esc(a.path)}" alt="logo" style="width:100%;height:100%;object-fit:contain;">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${th.accent};color:${th.ground};font-family:${FH};font-size:${q(64, land)}cqw;">${esc(String(brand).slice(0, 1).toUpperCase())}</div>`;
  const html = `<div style="position:absolute;${land
    ? "left:50%;top:50%;transform:translate(-50%,-50%);width:62cqw;text-align:center;"
    : "left:6.3cqw;right:6.3cqw;top:57.4cqw;text-align:center;"}">
    <div id="${id}-lg" style="opacity:0;width:${q(148, land)}cqw;height:${q(148, land)}cqw;border-radius:999px;overflow:hidden;margin:0 auto ${q(48, land)}cqw;box-shadow:0 0 4.6cqw ${rgba(th.accent, 0.35)};">${logo}</div>
    ${serifLines(id, scene.headline, "Send yours|into the sky.", land ? 96 : 116, th, land, { mark: scene.mark || scene.emphasis })}
    <div id="${id}-btn" style="opacity:0;display:inline-flex;align-items:center;gap:${q(16, land)}cqw;margin-top:${q(54, land)}cqw;padding:${q(27, land)}cqw ${q(54, land)}cqw;border-radius:999px;background:${th.accent};color:${th.ground};font-family:${FH};font-size:${q(44, land)}cqw;box-shadow:0 0 4.2cqw ${rgba(th.accent, 0.5)};">${esc(label)}
      <svg viewBox="0 0 24 24" fill="none" stroke="${th.ground}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" style="width:${q(38, land)}cqw;height:${q(38, land)}cqw;"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>
    </div>
    <div id="${id}-url" style="opacity:0;font-family:${FB};font-weight:700;font-size:${q(38, land)}cqw;letter-spacing:0.04em;color:${rgba(th.glow, 0.95)};margin-top:${q(44, land)}cqw;">${esc(url)}</div>
    <div style="display:flex;justify-content:center;">${sup.html}</div>
  </div>`;
  const s = [
    camera("floatdown", ctx),
    pop(`#${id}-lg`, T, L, 0),
    titleReveal(id, T, L, 1),
    pop(`#${id}-btn`, T, L, 3),
    rise(`#${id}-url`, T, L, 5),
    ...sup.s,
    glowPulse(id, T, L, th),
    `tl.to("#${id}-btn",{scale:1.05,duration:1.15,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(1, L - 1.4))},1.15)},${r(T + 1.3)});`,
  ];
  return { html, s };
}

const SCENES = { hook, statement, feature, montage, stats, cta };

// ---- chrome: the living lantern-night world + brand chip + progress rail ------
// Film order preserved: sky → stars/moon/hills (slow parallax drift) → rising
// lanterns → water band (lanterns emerge from BEHIND the water, which also
// hides their loop wrap) → shimmering reflections → fireflies.
function chrome({ theme: th, D, brand, count, land, dims }) {
  const W = (dims && dims.width) || (land ? 1920 : 1080);
  const H = (dims && dims.height) || (land ? 1080 : 1920);
  const px = W / 100; // 1cqw in px
  const rD = r(D);

  // twinkling stars (top 55% of the sky, two twinkle phases)
  const stars = Array.from({ length: 26 }, (_, i) => {
    const x = (i * 37 + 11) % 94 + 3, y = (i * 23 + 7) % 50 + 2;
    const s = r((0.16 + (i % 3) * 0.11) * (land ? 0.7 : 1));
    return `<div class="${i % 2 ? "ln-sB" : "ln-sA"}" style="position:absolute;left:${x}%;top:${y}%;width:${s}cqw;height:${s}cqw;border-radius:999px;background:${th.paper};opacity:0.3;"></div>`;
  }).join("");

  // haloed moon with craters, breathing
  const haloS = land ? 24 : 38, coreS = land ? 7 : 11.6;
  const moon = `
    <div id="ln-halo" style="position:absolute;left:78%;top:12%;width:${haloS}cqw;height:${haloS}cqw;margin:-${r(haloS / 2)}cqw 0 0 -${r(haloS / 2)}cqw;border-radius:999px;background:radial-gradient(closest-side, ${rgba(th.paper, 0.55)}, ${rgba(th.paper, 0.16)} 45%, ${rgba(th.paper, 0)} 72%);"></div>
    <div style="position:absolute;left:78%;top:12%;width:${coreS}cqw;height:${coreS}cqw;margin:-${r(coreS / 2)}cqw 0 0 -${r(coreS / 2)}cqw;border-radius:999px;background:${th.paper};opacity:0.92;">
      <div style="position:absolute;left:22%;top:30%;width:20%;height:20%;border-radius:999px;background:${rgba(th.ground, 0.14)};"></div>
      <div style="position:absolute;left:58%;top:56%;width:13%;height:13%;border-radius:999px;background:${rgba(th.ground, 0.11)};"></div>
    </div>`;

  // far hills silhouette above the water line
  const hills = `<div style="position:absolute;left:-2%;right:-2%;bottom:14.5%;height:9%;">
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" style="width:100%;height:100%;display:block;"><path d="M0,20 L0,11 Q8,5 16,9 T34,8 T52,11 T70,6 T88,10 T100,8 L100,20 Z" fill="${rgba(th.deep, 0.92)}"/></svg>
  </div>`;

  // glowing paper lanterns rising in 3 parallax layers (CSS barrel + glow +
  // caps + ribs); each starts below the frame and rises off the top forever.
  const K = [0.5, 0.78, 1.08];
  const lanterns = [];
  const lanternScript = [];
  for (let i = 0; i < 9; i++) {
    const layer = i % 3, k = K[layer];
    const w = r((land ? 2.7 : 5.0) * k * (0.8 + (i % 4) * 0.15)), h = r(w * 1.3);
    const left = (i * 31 + 9) % 86 + 4;
    const top0 = 103 + (i % 3) * 6;             // authored home: below the frame
    const o = r(0.45 + layer * 0.27);
    lanterns.push(`<div id="ln-lant${i}" style="position:absolute;left:${left}%;top:${top0}%;width:${w}cqw;height:${h}cqw;opacity:${o};">
      <div style="position:absolute;left:-115%;top:-95%;width:330%;height:290%;border-radius:999px;background:radial-gradient(closest-side, ${rgba(th.glow, 0.5)}, ${rgba(th.accent, 0.16)} 55%, ${rgba(th.accent, 0)} 75%);"></div>
      <div style="position:absolute;left:24%;right:24%;top:-5%;height:8%;border-radius:99px;background:${rgba(th.ground, 0.6)};"></div>
      <div style="position:absolute;inset:0;border-radius:46% 46% 42% 42% / 34% 34% 46% 46%;background:linear-gradient(180deg,${rgba(th.glow, 0.55)},${rgba(th.glow, 0)} 52%),linear-gradient(90deg,${rgba(th.ground, 0)} 0 24%,${rgba(th.ground, 0.26)} 24% 27%,${rgba(th.ground, 0)} 27% 48%,${rgba(th.ground, 0.26)} 48% 52%,${rgba(th.ground, 0)} 52% 73%,${rgba(th.ground, 0.26)} 73% 76%,${rgba(th.ground, 0)} 76%),${th.accent};"></div>
      <div style="position:absolute;left:30%;right:30%;bottom:-4%;height:7%;border-radius:99px;background:${rgba(th.ground, 0.6)};"></div>
    </div>`);
    // rise: full travel clears the top; a phase-offset first pass spreads the
    // sky at t=0, then whole cycles wrap seamlessly from below the water.
    const dist = r(((top0 + 32) / 100) * H);
    const dur = r([36, 27, 20][layer] * (land ? 0.72 : 1));
    const p0 = ((i * 53 + 29) % 97) / 97;
    const t1 = r((1 - p0) * dur);
    lanternScript.push(`tl.fromTo("#ln-lant${i}",{y:${r(-p0 * dist)}},{y:${r(-dist)},duration:${t1},ease:"none"},0);`);
    lanternScript.push(`tl.fromTo("#ln-lant${i}",{y:0},{y:${r(-dist)},duration:${dur},ease:"none",immediateRender:false,repeat:reps(${r(Math.max(0.1, D - t1))},${dur})},${t1});`);
    lanternScript.push(`tl.to("#ln-lant${i}",{x:${r((i % 2 ? 1 : -1) * (1.6 + (i % 3) * 0.9) * px)},duration:${r(2.8 + (i % 3) * 0.7)},ease:"sine.inOut",yoyo:true,repeat:reps(${rD},${r(2.8 + (i % 3) * 0.7)})},0);`);
    lanternScript.push(`tl.to("#ln-lant${i}",{opacity:${r(o * 0.78)},duration:${r(1.15 + (i % 4) * 0.3)},ease:"sine.inOut",yoyo:true,repeat:reps(${rD},${r(1.15 + (i % 4) * 0.3)})},${r(i * 0.17)});`);
  }

  // water band + shimmering lantern reflections
  const water = `<div style="position:absolute;left:0;right:0;bottom:0;height:15.5%;background:linear-gradient(180deg, ${rgba(th.accent2, 0.2)}, ${th.deep} 85%);"></div>`;
  const reflBottoms = [12.5, 10.8, 9.1, 7.9], reflLefts = [20, 45, 70, 88];
  const refl = reflBottoms.map((b, i) =>
    `<div id="ln-refl${i}" style="position:absolute;left:${reflLefts[i]}%;bottom:${b}%;width:${land ? 8 : 12}cqw;height:0.9cqw;margin-left:-${land ? 4 : 6}cqw;border-radius:999px;background:${rgba(th.glow, 0.16)};filter:blur(2px);"></div>`).join("");
  const reflScript = reflBottoms.map((_, i) => [
    `tl.to("#ln-refl${i}",{x:${r((i % 2 ? -1 : 1) * 2.6 * px)},scaleX:1.28,duration:${r(3 + i * 0.5)},ease:"sine.inOut",yoyo:true,repeat:reps(${rD},${r(3 + i * 0.5)})},0);`,
    `tl.to("#ln-refl${i}",{opacity:0.55,duration:${r(2 + i * 0.4)},ease:"sine.inOut",yoyo:true,repeat:reps(${rD},${r(2 + i * 0.4)})},${r(i * 0.6)});`,
  ].join("\n  ")).join("\n  ");

  // sage fireflies weaving through the middle band
  const flies = [];
  const flyScript = [];
  for (let i = 0; i < 9; i++) {
    const x = (i * 41 + 17) % 88 + 5, y = 36 + (i * 19) % 36;
    flies.push(`<div id="ln-fly${i}" style="position:absolute;left:${x}%;top:${y}%;width:0.55cqw;height:0.55cqw;border-radius:999px;background:${th.firefly};box-shadow:0 0 1.3cqw 0.45cqw ${rgba(th.accent2, 0.3)};opacity:0.25;"></div>`);
    flyScript.push(`tl.to("#ln-fly${i}",{x:${r((i % 2 ? -1 : 1) * (2 + (i % 3) * 1.3) * px)},duration:${r(3.1 + (i % 4) * 0.7)},ease:"sine.inOut",yoyo:true,repeat:reps(${rD},${r(3.1 + (i % 4) * 0.7)})},0);`);
    flyScript.push(`tl.to("#ln-fly${i}",{y:${r((i % 3 ? 1 : -1) * (1.4 + (i % 2) * 1.2) * px)},duration:${r(4 + (i % 3) * 0.9)},ease:"sine.inOut",yoyo:true,repeat:reps(${rD},${r(4 + (i % 3) * 0.9)})},0);`);
    flyScript.push(`tl.to("#ln-fly${i}",{opacity:0.95,duration:${r(1.5 + (i % 3) * 0.4)},ease:"sine.inOut",yoyo:true,repeat:reps(${rD},${r(1.5 + (i % 3) * 0.4)})},${r(i * 0.21)});`);
  }

  const html = `
  <div id="ln-world" class="clip" data-start="0" data-duration="__D__" data-track-index="1" data-layout-allow-occlusion style="opacity:0;background:linear-gradient(180deg,${th.deep},${th.ground} 68%,${th.horizon} 100%);">
    <div id="ln-par" style="position:absolute;inset:0;">${stars}${moon}${hills}</div>
    ${lanterns.join("")}
    ${water}${refl}${flies.join("")}
  </div>
  <div id="ln-chrome" class="clip" data-start="0" data-duration="__D__" data-track-index="39" data-layout-allow-occlusion style="opacity:0;background:none;">
    <div style="position:absolute;top:${land ? 4 : 3.2}%;left:${land ? 3.5 : 6.3}%;display:flex;align-items:center;gap:1.4cqw;">
      <div style="width:${land ? 2.6 : 4.3}cqw;height:${land ? 2.6 : 4.3}cqw;border-radius:999px;background:${th.accent};box-shadow:0 0 2.8cqw ${rgba(th.accent, 0.6)};display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="${th.ground}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" style="width:58%;height:58%;"><path d="M8 4h8l2 7c0 4-3 7-6 7s-6-3-6-7Z"/><path d="M10 18v2h4v-2"/></svg>
      </div>
      <span style="font-family:${FH};font-size:${land ? 1.8 : 3}cqw;color:${th.paper};">${esc(brand)}</span>
    </div>
  </div>`;

  const script = `
  tl.fromTo("#ln-world",{opacity:0},{opacity:1,duration:0.5},0);
  tl.fromTo("#ln-chrome",{opacity:0},{opacity:1,duration:0.5},0.2);
  tl.to("#ln-par",{x:${r(0.7 * px)},duration:7,ease:"sine.inOut",yoyo:true,repeat:reps(${rD},7)},0);
  tl.to("#ln-halo",{scale:1.07,duration:3.4,ease:"sine.inOut",yoyo:true,repeat:reps(${rD},3.4)},0);
  tl.to(".ln-sA",{opacity:0.85,duration:1.3,ease:"sine.inOut",yoyo:true,repeat:reps(${rD},1.3),stagger:0.21},0);
  tl.to(".ln-sB",{opacity:0.75,duration:1.9,ease:"sine.inOut",yoyo:true,repeat:reps(${rD},1.9),stagger:0.27},0);
  ${lanternScript.join("\n  ")}
  ${reflScript}
  ${flyScript.join("\n  ")}`;
  return { html, script };
}

// No per-scene chrome — the segmented progress rail was removed (it read as a
// slideshow ticking through slides).

function styleBlock(th) {
  return `${th.fontFace}
  #root { font-family:${th.bodyStack}; }
  #cap-pill { background:${rgba(th.deep, 0.88)}; border:1px solid ${rgba(th.glow, 0.45)} !important; }
  #cap-text { font-family:${th.bodyStack}; color:${th.paper}; }`;
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
