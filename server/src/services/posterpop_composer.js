// POSTER POP composer — a faithful native GSAP port of the user's "Poster Pop"
// bundled reel template (poster-pop-film.jsx). The pack `poster-pop` routes
// here, so selecting the template gives THE TEMPLATE: six loud kinetic-poster
// beats where every scene is a SOLID color block (terracotta Hook, ink
// Statement, cream Feature, sage Montage, ink Stats, terracotta CTA) carrying
// full-contrast counter-color content, gigantic Caprasimo type STAMPING in
// line by line (the film's M.slam: back-out drop from y+90 / scale 1.5),
// rotating starbursts behind every beat, and full-frame poster pushes between
// scenes (the film's cam(): punch / pushL / pushU / pushR / spin / pushD baked
// as camo enter/exits, plus the continuous drift zoom+pan+bob on cami). The
// chrome carries the film's endless scrolling marquee ticker bands top+bottom
// (brand-voiced copy, opposite directions) plus the brand pill and a progress
// rail; each scene's html carries its OWN full-bleed background block so the
// pushes slide the whole poster — ground included — over the frame. Only the
// CONTENT is swapped: headlines/kickers/chips/tiles/stats from the script and
// Template Director, the website screenshot in the Feature browser card,
// photos in the Montage tiles, the brand logo in the CTA circle.
//
// Portrait (the template's native 9:16) reproduces the film's layout ~1:1 in
// cqw; landscape re-stages each beat (two-column copy/media) with the same
// type, motion and world. Render contract is template_engine's (seek-safe,
// finite repeats, hard kills); this module is design only.

const { deriveTheme } = require("./scene_kit");
const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const E = require("./template_engine");
const { esc, r, rgba, mix, statsOf, breakLines, bullets, fit, inkOn, isDark } = E;

const FH = "'Caprasimo', Georgia, serif";
const FB = "'Figtree', system-ui, sans-serif";

// ---- theme --------------------------------------------------------------------
function theme(manifest, brandSkin, { framePack, land } = {}) {
  const t = deriveTheme(framePack || "poster-pop", {}, brandSkin);
  const ground = t.ground || "#f5ead8";
  const ink = t.ink || "#201e1d";
  const accent = (t.accents && t.accents[0]) || "#c67139";
  const accent2 = (t.accents && t.accents[1]) || "#7a8a5e";
  // The poster poles: a guaranteed-dark ink and a guaranteed-light paper, so a
  // site-theme/brand-skin override can retint without killing contrast.
  const inkD = isDark(ink) ? ink : "#201e1d";
  const paperL = !isDark(ground) ? ground : "#f5ead8";
  return {
    ...t, ground, ink, accent, accent2, inkD, paperL,
    accent700: mix(accent, "#000000", 0.16),
    displayStack: FH, bodyStack: FB,
    fontFace: (isBundled("Caprasimo") ? fontFaceCss("Caprasimo") : "") + (isBundled("Figtree") ? fontFaceCss("Figtree") : ""),
  };
}

// The film's per-scene solid block assignment: rotate ground between the four
// poster colors, content always at the counter-pole.
function inkFor(type, th) {
  const opp = (fg) => (fg === th.paperL ? th.inkD : th.paperL);
  switch (type) {
    case "statement": return { bg: th.inkD, fg: th.paperL, hi: th.accent };
    case "feature": return { bg: th.paperL, fg: th.inkD, hi: th.accent };
    case "montage": { const fg = inkOn(th.accent2, th.inkD, th.paperL); return { bg: th.accent2, fg, hi: opp(fg) }; }
    case "stats": return { bg: th.inkD, fg: th.paperL, hi: th.accent };
    default: { const fg = inkOn(th.accent, th.inkD, th.paperL); return { bg: th.accent, fg, hi: opp(fg) }; } // hook + cta
  }
}

// ---- vocabulary (Template Director casts onto these) --------------------------
const TEMPLATE_SCENES = [
  {
    type: "hook", bestFor: "opening — the loud announcement",
    look: "A terracotta poster block: an ink kicker pill popping in, then gigantic uppercase Caprasimo lines stamping down one by one (second line in ink), a bold one-liner beneath, rotating starbursts behind.",
    slots: { kicker: "max 24 chars, uppercase", headline: "2-3 SHORT punchy lines ('|' breaks), 1-3 words each", subtext: "one loud sentence, max 96 chars" },
    media: [],
  },
  {
    type: "statement", bestFor: "the problem or a bold belief",
    look: "An ink-black poster block with one huge rotating starburst behind three colossal stamped lines (middle line in the poster color) and a supporting sentence — all type, maximum contrast.",
    slots: { headline: "2-3 VERY short lines, 1-2 words each", subtext: "one sentence, max 100 chars" },
    media: [],
  },
  {
    type: "feature", bestFor: "the product/offer shown for real",
    look: "A cream poster block: stamped headline, then a big ink browser card holding the website screenshot poster-sized, color-alternating chip pills popping in beneath.",
    slots: { headline: "max 2 short lines", chips: "2-3 items, max 24 chars each" },
    media: ["desktop"],
  },
  {
    type: "montage", bestFor: "range — several items/pages/angles",
    look: "A sage poster block: stamped headline over a tilted 2x2 grid of paper-framed photo tiles, each with a big Caprasimo label under it.",
    slots: { headline: "max 2 short lines", tiles: "4 short labels, max 14 chars each" },
    media: ["photo", "photo"], mediaMin: 0,
  },
  {
    type: "stats", bestFor: "numbers that prove it",
    look: "An ink poster block: stamped headline, then up to three colossal counting figures — terracotta, sage, cream — each with its label beside it.",
    slots: { headline: "max 2 short lines", stats: "1-3 of {v, suf, l}" },
    media: [],
  },
  {
    type: "cta", bestFor: "closing invitation",
    look: "A terracotta poster block, center-staged: the logo in a paper circle, giant stamped closing lines, an ink pill button with an arrow, the url in bold type, a starburst spinning behind.",
    slots: { headline: "2-3 short lines", cta: "button label, max 22 chars" },
    media: [],
  },
];
const mediaSlots = { feature: ["desktop"], montage: ["photo", "photo", "photo", "photo"] };

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
// Film px → cqw. Portrait maps the template's native 1080-wide poster 1:1;
// landscape re-stages, so it only converts type sizes (px / 19.2).
const q = (px, land) => r(px * (land ? 0.0521 : 0.0926));
const PADQ = 6.1; // the film's 66px poster margin

// The film's M.slam: back-out stamp from y+90 / scale 1.5, stagger 0.07·p.
function slam(sel, T, L, land, from = 0) {
  const st = Math.min(0.22, L * 0.07);
  return `tl.fromTo("${sel}",{opacity:0,y:${land ? 56 : 90},scale:1.5},{opacity:1,y:0,scale:1,duration:${r(Math.min(1.4, L * 0.36))},ease:"back.out(1.7)",stagger:${r(st)}},${r(T + from * st)});`;
}
// M.rise: outQuint rise from 40px.
function rise(sel, T, L, land, idx = 0) {
  const st = Math.min(0.22, L * 0.06);
  return `tl.fromTo("${sel}",{opacity:0,y:${land ? 26 : 40}},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.4))},ease:"expo.out"},${r(T + idx * st)});`;
}
// M.pop: back-out scale from 0.6.
function pop(sel, T, L, idx = 0, stagger = false) {
  const st = Math.min(0.22, L * 0.06);
  return `tl.fromTo("${sel}",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${r(Math.min(1.5, L * 0.4))},ease:"back.out(1.5)"${stagger ? `,stagger:${r(st)}` : ""}},${r(T + idx * st)});`;
}

// The film's cam(): full-frame poster pushes on #id-camo (the WHOLE scene, its
// solid ground included, slides over the frame) + continuous drift on #id-cami
// (slow zoom 1→1.06, pan, bob — the "never freezes" rule).
const CAM = {
  pushL: { in: `{xPercent:104}`, to: `{xPercent:0`, out: `{xPercent:-28,opacity:0.6` },
  pushR: { in: `{xPercent:-104}`, to: `{xPercent:0`, out: `{xPercent:28,opacity:0.6` },
  pushU: { in: `{yPercent:104}`, to: `{yPercent:0`, out: `{yPercent:-20,opacity:0.6` },
  pushD: { in: `{yPercent:-104}`, to: `{yPercent:0`, out: `{yPercent:20,opacity:0.6` },
  punch: { in: `{scale:1.5,rotation:-4,opacity:0}`, to: `{scale:1,rotation:0,opacity:1`, out: `{scale:1.06,opacity:0.5` },
  spin: { in: `{scale:0.6,rotation:8,opacity:0}`, to: `{scale:1,rotation:0,opacity:1`, out: `{scale:0.94,rotation:-3,opacity:0.5` },
};
// Per-scene continuous drift on #cami. A single hardcoded x:8→-16 pan made EVERY
// scene slide right→left — the slideshow tell. Cycle a 5-pattern pool by scene
// index so neighbours always differ: pan R→L, pan L→R, hold+push-in (zoom), drift
// in & settle, rise-left→right — each with its own bob sign + period. Same subtle
// magnitude as before; seek-safe (finite reps). (Mirrors the story-blocks fix.)
const CAMI_DRIFT = [
  { x0: 9, x1: -16, sc: 1.06, y: 7, p: 2.1 },
  { x0: -16, x1: 9, sc: 1.06, y: -7, p: 2.4 },
  { x0: 4, x1: 4, sc: 1.085, y: 8, p: 1.7 },
  { x0: 14, x1: -3, sc: 1.045, y: -8, p: 2.2 },
  { x0: -8, x1: 13, sc: 1.06, y: 6, p: 1.85 },
];
function camera(kind, ctx) {
  const k = CAM[kind] || CAM.punch;
  const { id, T, L, i, isLast } = ctx;
  const inD = r(Math.min(1.1, L * 0.24)), outD = r(Math.min(0.8, L * 0.2));
  const d = CAMI_DRIFT[(i || 0) % CAMI_DRIFT.length];
  const lines = [
    i === 0 ? "" : `tl.fromTo("#${id}-camo",${k.in},${k.to},duration:${inD},ease:"expo.out"},${T});`,
    isLast ? "" : `tl.to("#${id}-camo",${k.out},duration:${outD},ease:"power2.in"},${r(T + L - outD)});`,
    `tl.fromTo("#${id}-cami",{x:${d.x0},scale:1},{x:${d.x1},scale:${d.sc},duration:${r(L)},ease:"none"},${T});`,
    `tl.to("#${id}-cami",{y:${d.y},duration:${d.p},ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},${d.p})},${T});`,
  ];
  return lines.filter(Boolean).join("\n  ");
}

// The film's Starburst polygon (petals·2 alternating radii), server-generated.
function burstPts(petals, R = 96, inner = 0.55) {
  const pts = [];
  for (let i = 0; i < petals * 2; i++) {
    const a = (i / (petals * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? R : R * inner;
    pts.push(`${r(100 + Math.cos(a) * rr)},${r(100 + Math.sin(a) * rr)}`);
  }
  return pts.join(" ");
}
function burstDiv(idAttr, geo, color, petals) {
  return `<div ${idAttr} style="position:absolute;left:${geo.left}cqw;top:${geo.top}cqw;width:${geo.size}cqw;height:${geo.size}cqw;pointer-events:none;">
    <svg viewBox="0 0 200 200" width="100%" height="100%" style="display:block;overflow:visible;"><polygon points="${burstPts(petals)}" fill="${color}"/></svg>
  </div>`;
}
// Rotation is baked on the wrapper DIV (never the SVG rotate attr): the film's
// t·speed deg/s becomes one linear fromTo across the scene.
function burstSpin(sel, T, L, speed) {
  return `tl.fromTo("${sel}",{rotation:0},{rotation:${r(speed * L)},duration:${r(L)},ease:"none"},${T});`;
}

// The film's solid poster ground — INSIDE the scene (oversized so the cami
// drift never exposes an edge), so the camera pushes slide bg + content as one.
const ground = (bg) => `<div style="position:absolute;inset:-9cqw;background:${bg};"></div>`;

// Media slot: real asset (cover) or the template's dashed placeholder panel.
function slot(id, asset, line, { radius = 0, focusTop = false } = {}) {
  if (asset && asset.path) {
    return `<img data-media-slot="filled" id="${id}" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;border-radius:${radius}px;object-fit:${asset.fitContain ? "contain" : "cover"};padding:${asset.fitContain ? "7%" : "0"};object-position:${asset.fitContain ? "center" : (focusTop ? "top center" : (asset.cropFocus || "center"))};display:block;">`;
  }
  return `<div data-media-slot="empty" id="${id}" style="width:100%;height:100%;border-radius:${radius}px;display:flex;align-items:center;justify-content:center;background:${rgba(line, 0.06)};border:1px solid ${rgba(line, 0.4)};">
    
  </div>`;
}

// The film's BigTitle: stacked gigantic uppercase Caprasimo lines, the SECOND
// line in the highlight color, auto-shrunk so the longest line fills the block.
function slamLines(id, text, fallbackText, sizePx, avail, land, fg, hi) {
  const lines = breakLines(text, fallbackText).slice(0, 3);
  const maxLen = Math.max(...lines.map((l) => l.length), 1);
  const base = q(sizePx, land);
  const size = r(Math.max(base * 0.55, Math.min(base, avail / (maxLen * 0.6))));
  return lines.map((ln, i) =>
    `<div class="${id}-ln" style="opacity:0;font-family:${FH};font-size:${size}cqw;line-height:0.98;letter-spacing:-0.01em;text-transform:uppercase;color:${i === 1 ? hi : fg};">${esc(ln)}</div>`).join("");
}

// ---- scenes -------------------------------------------------------------------

function hook(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const C = inkFor("hook", th);
  const kicker = fit(String(scene.kicker || scene.purpose || "this weekend only"), 24).toUpperCase();
  const sub = fit(String(scene.subtext || ""), 96);
  const bursts = burstDiv(`id="${id}-b1"`, land ? { left: 70, top: -6, size: 26 } : { left: 61, top: 3.8, size: 48 }, rgba(C.fg, 0.16), 14)
    + burstDiv(`id="${id}-b2"`, land ? { left: -8, top: 30, size: 20 } : { left: -12.9, top: 109.5, size: 37 }, rgba(th.inkD, 0.14), 10);
  const copy = `
    <div id="${id}-k" style="opacity:0;display:inline-block;padding:${q(14, land)}cqw ${q(30, land)}cqw;border-radius:999px;background:${th.inkD};color:${th.paperL};font-family:${FB};font-weight:800;font-size:${q(26, land)}cqw;letter-spacing:0.2em;margin-bottom:${q(44, land)}cqw;">${esc(kicker)}</div>
    ${slamLines(id, scene.headline, "Big.|Bold.|Impossible", 142, land ? 58 : 87, land, C.fg, C.hi)}
    ${sub ? `<div id="${id}-s" style="opacity:0;font-family:${FB};font-weight:600;font-size:${q(38, land)}cqw;color:${rgba(C.fg, 0.9)};margin-top:${q(40, land)}cqw;max-width:${land ? 46 : 70.4}cqw;">${esc(sub)}</div>` : ""}`;
  const html = `${ground(C.bg)}${bursts}` + (land
    ? `<div style="position:absolute;left:7cqw;top:50%;transform:translateY(-50%);width:58cqw;">${copy}</div>`
    : `<div style="position:absolute;left:${PADQ}cqw;right:${PADQ}cqw;top:30.6cqw;">${copy}</div>`);
  const s = [
    camera("punch", ctx),
    burstSpin(`#${id}-b1`, T, L, 10),
    burstSpin(`#${id}-b2`, T, L, -13),
    pop(`#${id}-k`, T, L, 0),
    slam(`#${id} .${id}-ln`, T, L, land, 1),
    sub ? rise(`#${id}-s`, T, L, land, 6) : "",
  ];
  return { html, s };
}

function statement(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const C = inkFor("statement", th);
  const sub = fit(String(scene.subtext || ""), 100);
  const burst = burstDiv(`id="${id}-b1"`, land ? { left: 27, top: 5.1, size: 46 } : { left: -2, top: 36.9, size: 104 }, rgba(th.accent, 0.14), 16);
  // 9:16: the slam headline + one subtext line leave the lower half of the sheet
  // empty — flow the scene's supporting points under the copy (see daybreak).
  const sup = land ? { html: "", s: [] } : E.supportList(`${id}-sup`, bullets(scene, 3), ctx, {
    flow: true, marginTop: q(46, land), font: q(34, land), fontFamily: FB,
    fg: rgba(C.fg, 0.76), dot: C.hi, max: 3,
  });
  const copy = `
    ${slamLines(id, scene.headline, "Quiet|doesn't|sell.", land ? 170 : 210, land ? 76 : 87, land, C.fg, C.hi)}
    ${sub ? `<div id="${id}-s" style="opacity:0;font-family:${FB};font-weight:600;font-size:${q(38, land)}cqw;color:${rgba(C.fg, 0.7)};margin-top:${q(46, land)}cqw;max-width:${land ? 48 : 70.4}cqw;">${esc(sub)}</div>` : ""}
    ${sup.html}`;
  const html = `${ground(C.bg)}${burst}` + (land
    ? `<div style="position:absolute;left:9cqw;top:50%;transform:translateY(-50%);width:76cqw;">${copy}</div>`
    : `<div style="position:absolute;left:${PADQ}cqw;right:${PADQ}cqw;top:51.9cqw;">${copy}</div>`);
  const s = [
    camera("pushL", ctx),
    burstSpin(`#${id}-b1`, T, L, 5),
    slam(`#${id} .${id}-ln`, T, L, land, 0),
    sub ? rise(`#${id}-s`, T, L, land, 4) : "",
    ...sup.s,
  ];
  return { html, s };
}

function feature(scene, ctx, a) {
  const { id, T, L, theme: th, land } = ctx;
  const C = inkFor("feature", th);
  const chips = (Array.isArray(scene.chips) && scene.chips.length ? scene.chips : bullets(scene, 3)).slice(0, 3).map((c) => fit(String(c), 24));
  const burst = burstDiv(`id="${id}-b1"`, land ? { left: 74, top: 20, size: 24 } : { left: 70.4, top: 88, size: 44.4 }, rgba(th.accent2, 0.3), 12);
  // The film's Browser card: ink frame, paper traffic dots, screenshot window.
  const browser = `<div id="${id}-bd" style="opacity:0;width:100%;height:100%;background:${th.inkD};border-radius:${q(28, land)}cqw;padding:${q(12, land)}cqw;box-shadow:0 ${q(34, land)}cqw ${q(70, land)}cqw ${rgba(th.inkD, 0.3)};">
      <div style="display:flex;gap:${q(8, land)}cqw;padding:${q(4, land)}cqw ${q(8, land)}cqw ${q(10, land)}cqw;">
        ${[0.9, 0.4, 0.4].map((o) => `<span style="width:${q(13, land)}cqw;height:${q(13, land)}cqw;border-radius:999px;background:${rgba(th.paperL, o)};"></span>`).join("")}
      </div>
      <div style="border-radius:${q(18, land)}cqw;overflow:hidden;height:calc(100% - ${q(37, land)}cqw);background:${th.paperL};">${slot(`${id}-img`, a, th.inkD, { radius: 0, focusTop: true })}</div>
    </div>`;
  const chipRow = chips.map((c, i) => {
    const cbg = i % 2 === 0 ? th.accent : th.accent2;
    return `<div class="${id}-tag" style="opacity:0;padding:${q(16, land)}cqw ${q(30, land)}cqw;border-radius:999px;background:${cbg};color:${inkOn(cbg, th.inkD, th.paperL)};font-family:${FB};font-weight:800;font-size:${q(30, land)}cqw;">${esc(c)}</div>`;
  }).join("");
  const html = `${ground(C.bg)}${burst}` + (land
    ? `<div style="position:absolute;left:6cqw;top:50%;transform:translateY(-50%);width:36cqw;">
         ${slamLines(id, scene.headline, "Your product,|poster-sized.", 96, 34, land, C.fg, C.hi)}
         <div style="display:flex;flex-wrap:wrap;gap:${q(18, land)}cqw;margin-top:${q(44, land)}cqw;">${chipRow}</div>
       </div>
       <div style="position:absolute;right:6cqw;top:50%;transform:translateY(-50%);width:50cqw;height:32.3cqw;">${browser}</div>`
    : `<div style="position:absolute;left:${PADQ}cqw;right:${PADQ}cqw;top:25cqw;">
         ${slamLines(id, scene.headline, "Your product,|poster-sized.", 116, 87, land, C.fg, C.hi)}
         <div style="margin:${q(50, land)}cqw auto ${q(44, land)}cqw;width:87.4cqw;height:56.5cqw;">${browser}</div>
         <div style="display:flex;flex-wrap:wrap;gap:${q(18, land)}cqw;justify-content:center;">${chipRow}</div>
       </div>`);
  const s = [
    camera("pushU", ctx),
    burstSpin(`#${id}-b1`, T, L, -8),
    slam(`#${id} .${id}-ln`, T, L, land, 0),
    pop(`#${id}-bd`, T, L, 2),
    pop(`#${id} .${id}-tag`, T, L, 3, true),
  ];
  return { html, s };
}

function montage(scene, ctx, a, b) {
  const { id, T, L, theme: th, land } = ctx;
  const C = inkFor("montage", th);
  const tiles = (Array.isArray(scene.tiles) && scene.tiles.length ? scene.tiles : bullets(scene, 4));
  const labels = [0, 1, 2, 3].map((i) => fit(String(tiles[i] || ["Home", "Pricing", "Dashboard", "Checkout"][i]), 14));
  // Four tiles, four assets: the engine now fills every declared slot, and a
  // short pool cycles rather than leaving a hole — a repeated screenshot reads far
  // better than a blank white card.
  const pool = (Array.isArray(ctx.media) && ctx.media.length ? ctx.media : [a, b]).filter(Boolean);
  const media = [0, 1, 2, 3].map((k) => (pool.length ? pool[k % pool.length] : null));
  const tilts = [-3, 2.5, 2, -2.5];
  const tileH = land ? 12.5 : 25.9;  // PORTRAIT: two tiles at FULL width rather than four at half. A 2x2 wall in
  // 9:16 puts each plate under ~330px, where a product screenshot stops being
  // readable; stacked full width they get the whole frame. Fewer, bigger.

  const cells = (land ? [0, 1, 2, 3] : [0, 1]).map((i) =>
    `<div style="transform:rotate(${tilts[i]}deg);">
      <div class="${id}-tl" style="opacity:0;">
        <div style="height:${tileH}cqw;border-radius:${q(24, land)}cqw;overflow:hidden;background:${th.paperL};padding:${q(10, land)}cqw;box-shadow:0 ${q(24, land)}cqw ${q(50, land)}cqw ${rgba(th.inkD, 0.25)};">
          <div style="height:100%;border-radius:${q(16, land)}cqw;overflow:hidden;">${slot(`${id}-img${i}`, media[i], th.inkD, { radius: 0 })}</div>
        </div>
        <div style="font-family:${FH};font-size:${q(30, land)}cqw;color:${C.fg};margin-top:${q(16, land)}cqw;text-align:center;text-transform:uppercase;">${esc(labels[i])}</div>
      </div>
    </div>`).join("");
  const grid = `<div style="display:grid;grid-template-columns:${land ? "1fr 1fr" : "1fr"};gap:${q(30, land)}cqw;">${cells}</div>`;
  const html = `${ground(C.bg)}` + (land
    ? `<div style="position:absolute;left:6cqw;top:50%;transform:translateY(-50%);width:26cqw;">
         ${slamLines(id, scene.headline, "Every page.|Every angle.", 80, 24, land, C.fg, C.hi)}
       </div>
       <div style="position:absolute;left:35cqw;right:6cqw;top:50%;transform:translateY(-50%);">${grid}</div>`
    : `<div style="position:absolute;left:${PADQ}cqw;right:${PADQ}cqw;top:26.9cqw;">
         ${slamLines(id, scene.headline, "Every page.|Every angle.", 116, 87, land, C.fg, C.hi)}
         <div style="margin-top:${q(60, land)}cqw;">${grid}</div>
       </div>`);
  const s = [
    camera("pushR", ctx),
    slam(`#${id} .${id}-ln`, T, L, land, 0),
    pop(`#${id} .${id}-tl`, T, L, 2, true),
  ];
  return { html, s };
}

function stats(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const C = inkFor("stats", th);
  const sts = statsOf(scene, 3);
  const rows = sts.length ? sts : [
    { pre: "", v: 10, suf: "S", l: "to make your point", isFloat: false },
    { pre: "", v: 4, suf: "×", l: "more eyes than a static post", isFloat: false },
    { pre: "", v: 100, suf: "%", l: "yours — copy, color, everything", isFloat: false },
  ];
  const cols = [th.accent, th.accent2, th.paperL];
  const rowHtml = rows.map((st, i) =>
    `<div class="${id}-row" style="opacity:0;display:flex;align-items:baseline;gap:${q(34, land)}cqw;">
      <div style="min-width:${land ? 14 : 28}cqw;font-family:${FH};font-size:${q(land ? 150 : 190, land)}cqw;line-height:0.85;color:${cols[i % 3]};font-variant-numeric:tabular-nums;"><span id="${id}-n${i}">0</span><span style="font-size:${q(land ? 70 : 90, land)}cqw;">${esc(st.suf || "")}</span></div>
      <div style="font-family:${FB};font-weight:700;font-size:${q(36, land)}cqw;color:${rgba(C.fg, 0.75)};max-width:${land ? 26 : 39}cqw;">${esc(String(st.l || "and counting").toLowerCase())}</div>
    </div>`).join("");
  const html = `${ground(C.bg)}` + (land
    ? `<div style="position:absolute;left:6cqw;top:50%;transform:translateY(-50%);width:30cqw;">
         ${slamLines(id, scene.headline, "Numbers,|loud ones.", 96, 28, land, C.fg, C.hi)}
       </div>
       <div style="position:absolute;left:39cqw;right:7cqw;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:2.4cqw;">${rowHtml}</div>`
    : `<div style="position:absolute;left:${PADQ}cqw;right:${PADQ}cqw;top:33cqw;">
         ${slamLines(id, scene.headline, "Numbers,|loud ones.", 116, 87, land, C.fg, C.hi)}
         <div style="margin-top:${q(64, land)}cqw;display:flex;flex-direction:column;gap:${q(52, land)}cqw;">${rowHtml}</div>
       </div>`);
  const s = [
    camera("spin", ctx),
    slam(`#${id} .${id}-ln`, T, L, land, 0),
    `tl.fromTo("#${id} .${id}-row",{opacity:0,y:${land ? 26 : 40}},{opacity:1,y:0,duration:${r(Math.min(1.3, L * 0.38))},ease:"expo.out",stagger:${r(Math.min(0.24, L * 0.06))}},${r(T + 0.45)});`,
    ...rows.map((st, i) =>
      `countTxt("#${id}-n${i}",${st.v},${r(T + 0.6 + i * 0.2)},${r(Math.min(1.8, L * 0.5))},"${esc(st.pre || "")}","",${st.isFloat ? 10 : 1});`),
  ];
  return { html, s };
}

function cta(scene, ctx, a) {
  const { id, T, L, theme: th, land, brand, url } = ctx;
  const C = inkFor("cta", th);
  const label = fit(String(scene.cta || scene.buttonLabel || "Make yours"), 22);
  // 9:16: the closing block ends at the url with the lower sheet empty — close on
  // the film's own proof points rather than dead ground (see statement above).
  const sup = land ? { html: "", s: [] } : E.supportList(`${id}-sup`, bullets(scene, 3), ctx, {
    flow: true, marginTop: q(44, land), font: q(33, land), fontFamily: FB,
    fg: rgba(C.fg, 0.78), dot: C.hi, max: 3,
  });
  const burst = burstDiv(`id="${id}-b1"`, land ? { left: 33, top: -4, size: 34 } : { left: 10.2, top: 17.1, size: 79.6 }, rgba(C.fg, 0.14), 18);
  const logo = a && a.path
    ? `<img src="${esc(a.path)}" alt="logo" style="width:100%;height:100%;object-fit:contain;">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:${FH};font-size:${q(64, land)}cqw;color:${th.inkD};">${esc(String(brand).slice(0, 1).toUpperCase())}</div>`;
  const copy = `
    <div id="${id}-lg" style="opacity:0;width:${q(140, land)}cqw;height:${q(140, land)}cqw;border-radius:999px;overflow:hidden;background:${th.paperL};margin:0 auto ${q(50, land)}cqw;box-shadow:0 ${q(14, land)}cqw ${q(30, land)}cqw ${rgba(th.inkD, 0.2)};">${logo}</div>
    ${slamLines(id, scene.headline, "Stop|scrolling.|Start now.", land ? 120 : 150, land ? 66 : 87, land, C.fg, C.hi)}
    <div id="${id}-btn" style="opacity:0;display:inline-flex;align-items:center;gap:${q(16, land)}cqw;margin-top:${q(56, land)}cqw;padding:${q(28, land)}cqw ${q(58, land)}cqw;border-radius:999px;background:${th.inkD};color:${th.paperL};font-family:${FH};font-size:${q(46, land)}cqw;box-shadow:0 ${q(24, land)}cqw ${q(60, land)}cqw ${rgba(th.inkD, 0.4)};">${esc(label)}
      <svg viewBox="0 0 24 24" fill="none" stroke="${th.paperL}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" style="width:${q(38, land)}cqw;height:${q(38, land)}cqw;"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
    </div>
    <div id="${id}-url" style="opacity:0;font-family:${FB};font-weight:800;font-size:${q(38, land)}cqw;letter-spacing:0.04em;color:${C.fg};margin-top:${q(44, land)}cqw;">${esc(url)}</div>
    <div style="display:flex;justify-content:center;">${sup.html}</div>`;
  const html = `${ground(C.bg)}${burst}` + (land
    ? `<div style="position:absolute;left:17cqw;right:17cqw;top:50%;transform:translateY(-50%);text-align:center;">${copy}</div>`
    : `<div style="position:absolute;left:${PADQ}cqw;right:${PADQ}cqw;top:42cqw;text-align:center;">${copy}</div>`);
  const s = [
    camera("pushD", ctx),
    burstSpin(`#${id}-b1`, T, L, 7),
    pop(`#${id}-lg`, T, L, 0),
    slam(`#${id} .${id}-ln`, T, L, land, 1),
    pop(`#${id}-btn`, T, L, 5),
    rise(`#${id}-url`, T, L, land, 6),
    ...sup.s,
  ];
  return { html, s };
}

const SCENES = { hook, statement, feature, montage, stats, cta };

// ---- chrome: marquee ticker bands + poster wall + brand pill + rail -----------
// The film's endless Marquee bands (tilted -2.5°, Caprasimo, opposite scroll
// directions) live here so they ride over every poster block; the world layer
// underneath is the paper wall (halftone dots + two faint slow starbursts) the
// pushes slide across.
function chrome({ theme: th, D, brand, url, count, land, r: rr, esc: esch }) {
  const tick = esch(`${String(brand)} • make some noise • ${String(url)} • `.toUpperCase());
  const rep = tick.repeat(6);
  const band = (id, bg, fg, top, sizePx) =>
    `<div style="position:absolute;left:-6%;right:-6%;top:${top}%;transform:rotate(-2.5deg);background:${bg};padding:${land ? 0.8 : 1.5}cqw 0;overflow:hidden;white-space:nowrap;box-shadow:0 ${land ? 0.7 : 1.3}cqw ${land ? 2 : 3.7}cqw ${rgba(th.inkD, 0.18)};">
      <div id="${id}" style="display:inline-block;white-space:nowrap;font-family:${FH};font-size:${q(sizePx, land)}cqw;line-height:1;color:${fg};"><span>${rep}</span><span>${rep}</span></div>
    </div>`;
  const wb = burstDiv(`class="pp-wb"`, land ? { left: 78, top: -8, size: 30 } : { left: 60, top: -14, size: 55 }, rgba(th.accent, 0.1), 14)
    + burstDiv(`class="pp-wb"`, land ? { left: -10, top: 36, size: 24 } : { left: -16, top: 120, size: 44 }, rgba(th.accent2, 0.12), 10);
  const html = `
  <div id="pp-world" class="clip" data-start="0" data-duration="__D__" data-track-index="1" data-layout-allow-occlusion style="opacity:0;background:${th.paperL};">
    <div style="position:absolute;inset:0;background-image:radial-gradient(circle, ${rgba(th.inkD, 0.06)} 0.14cqw, transparent 0.15cqw);background-size:2.4cqw 2.4cqw;"></div>
    ${wb}
  </div>
  <div id="pp-chrome" class="clip" data-start="0" data-duration="__D__" data-track-index="39" data-layout-allow-occlusion style="opacity:0;background:none;">
    ${band("pp-tick-t", th.inkD, th.paperL, land ? -3 : 0, 46)}
    ${band("pp-tick-b", th.paperL, th.inkD, land ? 80 : 84, 42)}
    <div style="position:absolute;top:${land ? 11 : 8}%;left:${land ? 3.5 : 6.1}%;display:inline-flex;align-items:center;gap:${land ? 0.8 : 1.4}cqw;padding:${land ? 0.55 : 1.1}cqw ${land ? 1.2 : 2.4}cqw;border-radius:999px;background:${th.inkD};border:2px solid ${rgba(th.paperL, 0.5)};">
      <svg viewBox="0 0 24 24" fill="none" stroke="${th.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:${land ? 1.6 : 2.8}cqw;height:${land ? 1.6 : 2.8}cqw;"><path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></svg>
      <span style="font-family:${FH};font-size:${land ? 1.7 : 3.05}cqw;color:${th.paperL};">${esch(brand)}</span>
    </div>
  </div>`;
  const script = `
  tl.fromTo("#pp-world",{opacity:0},{opacity:1,duration:0.5},0);
  tl.fromTo("#pp-chrome",{opacity:0},{opacity:1,duration:0.5},0.15);
  tl.fromTo("#pp-tick-t",{xPercent:0},{xPercent:-50,duration:6.6,ease:"none",repeat:reps(${rr(D)},6.6)},0);
  tl.fromTo("#pp-tick-b",{xPercent:-50},{xPercent:0,duration:6.6,ease:"none",repeat:reps(${rr(D)},6.6)},0);
  tl.fromTo(".pp-wb",{rotation:0},{rotation:${rr(D * 4)},duration:${rr(D)},ease:"none"},0);`;
  return { html, script };
}

// No per-scene chrome — the segmented progress rail was removed (it read as a
// slideshow ticking through slides).

function styleBlock(th) {
  return `${th.fontFace}
  #root { font-family:${FB}; }
  #cap-pill { background:${rgba(th.paperL, 0.94)}; border:1px solid ${rgba(th.inkD, 0.35)} !important; }
  #cap-text { font-family:${FB}; font-weight:600; color:${th.inkD}; }`;
}

const family = {
  theme, styleBlock, chrome, SCENES, TEMPLATE_SCENES, route, mediaSlots, mediaFallback, wantsLogo,
  // Empty slots in this pack render a featureless placeholder card, so a
  // REPEAT of a real screenshot/photo beats leaving one blank.
  recycleMedia: true,
  fallbackType: "statement",
  variants: 1,
  camera: { enabled: false }, // per-beat poster pushes are baked into each scene (the film's own cam kinds)
};

function buildComposition(opts) { return E.buildFilm(family, opts); }
// This pack's media demand + what filled each slot, WITHOUT rendering. Runs the
// exact routing and slot-filling the renderer runs, so the manifest can never
// drift from the film that ships.
function planMedia(opts) { return E.planMedia(family, opts); }

module.exports = { buildComposition, planMedia, TEMPLATE_SCENES };
