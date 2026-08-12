// ORGANIC GARDEN composer — a faithful native GSAP port of the user's
// "Organic Garden" bundled reel template (organic-garden-film.jsx).
// The pack `organic-garden` (manifest renderer routes here) gets THE TEMPLATE:
// its six authored beats (seed-ring Hook, rule-bar Statement, browser-frame
// Feature, 2×2 tile Montage, counter-card Stats, logo-circle CTA), its per-beat
// camera moves (drop / left / swing / right / zoom / scale-out with a continuous
// live drift), its living world (soft sage/clay radial blobs drifting, double
// rolling sine hills breathing along the base, petals and leaves falling with
// sway + spin, gust-of-leaves sweeps carrying each cut) and its chrome (sprout
// brand chip top-left, per-scene progress rail at the base). Only the CONTENT
// is swapped: headlines/subs from the script, chips/tiles/stats mined by the
// Template Director, and the template's own media slots filled with the film's
// REAL assets — the website screenshot in the browser frame, parsed site images
// in the montage tiles, the brand logo in the CTA circle.
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
  const t = deriveTheme(framePack || "organic-garden", {}, brandSkin);
  const ground = t.ground || "#f5ead8";
  const ink = t.ink || "#201e1d";
  const accent = (t.accents && t.accents[0]) || "#b2622d";
  const accent2 = (t.accents && t.accents[1]) || "#7a8a5e";
  return {
    ...t, ground, ink, accent, accent2,
    accent700: mix(accent, "#000000", 0.3),  // the film's deep accent for body-size accent text
    petal: mix(accent, "#ffffff", 0.5),      // the film's accentSoft petal tint
    surface: mix(ground, accent, 0.12),
    displayStack: FH, bodyStack: FB,
    fontFace: (isBundled("Caprasimo") ? fontFaceCss("Caprasimo") : "") + (isBundled("Figtree") ? fontFaceCss("Figtree") : ""),
  };
}

// ---- vocabulary (Template Director casts onto these) --------------------------
const TEMPLATE_SCENES = [
  {
    type: "hook", bestFor: "opening — who this is and the promise",
    look: "A letter-spaced kicker over a big round serif headline blooming up line by line, a hand-drawn sage seed-ring drawing itself around the key word, and a one-sentence sub.",
    slots: { kicker: "max 26 chars, uppercase", headline: "2-3 short lines ('|' breaks)", emphasis: "the one word to ring", subtext: "one warm sentence, max 90 chars" },
    media: [],
  },
  {
    type: "statement", bestFor: "the problem or a bold belief",
    look: "An accent rule bar growing from the left, then 2-3 stacked serif lines (the second in deep clay) and a supporting sentence — quiet staging, all type.",
    slots: { headline: "2-3 short lines", subtext: "one sentence, max 100 chars" },
    media: [],
  },
  {
    type: "feature", bestFor: "the product/site shown for real",
    look: "A dark browser frame with traffic-light dots holding one big website screenshot, seed-dot pill chips popping in beneath.",
    slots: { headline: "max 2 short lines", chips: "2-3 items, max 26 chars each" },
    media: ["desktop"],
  },
  {
    type: "montage", bestFor: "range — several items/pages/angles",
    look: "A 2×2 grid of big rounded photo tiles popping in one after another like beds in a garden.",
    slots: { headline: "max 2 short lines", tiles: "4 short labels, max 16 chars each" },
    media: ["photo", "photo"], mediaMin: 0,
  },
  {
    type: "stats", bestFor: "numbers that prove it",
    look: "Up to three bordered counter cards, each a big clay serif figure counting up beside its label — numbers that keep growing.",
    slots: { headline: "max 2 short lines", stats: "1-3 of {v, suf, l}" },
    media: [],
  },
  {
    type: "cta", bestFor: "closing invitation",
    look: "The brand logo in a circle, a warm final headline, an accent pill button with an arrow and the url in deep clay type.",
    slots: { headline: "max 2 short lines", cta: "button label, max 24 chars" },
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
// Film px → cqw. Portrait maps the template's native 1080-wide sheet 1:1;
// landscape uses its own staging numbers, so it only converts type sizes.
const q = (px, land) => r(px * (land ? 0.052 : 0.0926));

// The film's M.rise: outCubic rise from 34px, stagger 0.06·L, dur 0.4·L.
function rise(sel, T, L, idx) {
  return `tl.fromTo("${sel}",{opacity:0,y:34},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.4))},ease:"power3.out"},${r(T + idx * Math.min(0.22, L * 0.06))});`;
}
// M.pop: outBack(1.7) scale from 0.7.
function pop(sel, T, L, idx) {
  return `tl.fromTo("${sel}",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${r(Math.min(1.5, L * 0.42))},ease:"back.out(1.7)"},${r(T + idx * Math.min(0.22, L * 0.06))});`;
}

// The film's cam(): per-beat directional enters with an outBack overshoot and a
// gentle tilt, inCubic directional exits, baked on the engine's #id-camo rig,
// plus a slow continuous push + bob on #id-cami (the "never freezes" rule).
const CAM = {
  drop: { in: { y: -96, rotation: 2 }, out: { y: 58 } },
  left: { in: { x: -86, rotation: -3 }, out: { x: 56 } },
  right: { in: { x: 86, rotation: 3 }, out: { x: -56 } },
  up: { in: { y: 100, scale: 0.95 }, out: { y: -56 } },
  zoom: { in: { scale: 0.84, y: 28 }, out: { scale: 1.06 } },
  scaleout: { in: { scale: 1.15, rotation: -2 }, out: { scale: 0.94 } },
  swing: { in: { x: -58, rotation: -5 }, out: { x: 42, rotation: 3 } },
};
function camera(kind, ctx) {
  const c = CAM[kind] || CAM.zoom;
  const { id, T, L, isLast, i } = ctx;
  const iden = { x: 0, y: 0, rotation: 0, scale: 1 };
  const inD = r(Math.min(0.85, L * 0.22)), outD = r(Math.min(0.65, L * 0.18));
  const from = Object.entries(c.in).map(([k, v]) => `${k}:${v}`).join(",");
  const back = Object.keys(c.in).map((k) => `${k}:${iden[k]}`).join(",");
  const out = Object.entries(c.out).map(([k, v]) => `${k}:${v}`).join(",");
  const lines = [
    i === 0 ? "" : `tl.fromTo("#${id}-camo",{${from},opacity:0},{${back},opacity:1,duration:${inD},ease:"back.out(1.4)"},${T});`,
    isLast ? "" : `tl.to("#${id}-camo",{${out},opacity:0.5,duration:${outD},ease:"power2.in"},${r(T + L - outD)});`,
    `tl.fromTo("#${id}-cami",{scale:1},{scale:1.03,duration:${r(L)},ease:"none"},${T});`,
    `tl.to("#${id}-cami",{y:6,duration:1.8,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},1.8)},${T});`,
  ];
  return lines.filter(Boolean).join("\n  ");
}

// Media slot: real asset (cover) or the template's soft dashed placeholder panel.
function slot(id, asset, th, { radius = 20, label = "", focusTop = false } = {}) {
  if (asset && asset.path) {
    return `<img data-media-slot="filled" id="${id}" src="${esc(asset.path)}" alt="${esc(asset.alt || label)}" style="width:100%;height:100%;border-radius:${radius}px;object-fit:${asset.fitContain ? "contain" : "cover"};padding:${asset.fitContain ? "7%" : "0"};object-position:${asset.fitContain ? "center" : (focusTop ? "top center" : (asset.cropFocus || "center"))};display:block;">`;
  }
  return `<div data-media-slot="empty" id="${id}" style="width:100%;height:100%;border-radius:${radius}px;display:flex;align-items:center;justify-content:center;background:${rgba(th.accent, 0.06)};border:1px solid ${rgba(th.ink, 0.26)};">
    
  </div>`;
}

// Stacked round-serif headline lines. accentLine paints one line in deep clay
// (the film's Statement); ringIdx wraps one line's text in the hand-drawn sage
// seed-ring ellipse (the film's Hook emphasis).
function gLines(id, lines, sizePx, th, land, { accentLine = -1, ringIdx = -1, lh = 1.04 } = {}) {
  return lines.map((ln, i) => {
    const col = i === accentLine ? th.accent700 : th.ink;
    const ring = i === ringIdx
      ? `<svg viewBox="0 0 300 150" preserveAspectRatio="none" style="position:absolute;left:-8%;top:-14%;width:116%;height:128%;overflow:visible;"><ellipse id="${id}-ring" cx="150" cy="75" rx="138" ry="62" pathLength="100" fill="none" stroke="${th.accent2}" stroke-width="7" stroke-linecap="round" transform="rotate(-3 150 75)" style="stroke-dasharray:100;stroke-dashoffset:100;opacity:0.9;"/></svg>`
      : "";
    return `<div class="${id}-ln" style="opacity:0;font-family:${FH};font-size:${q(sizePx, land)}cqw;line-height:${lh};color:${col};"><span style="position:relative;display:inline-block;">${esc(ln)}${ring}</span></div>`;
  }).join("");
}
// Which headline line carries the seed-ring: the cast emphasis word, else the last.
function markOf(scene, lines) {
  const mk = String(scene.mark || scene.emphasis || "").trim().toLowerCase();
  if (mk) { const f = lines.findIndex((ln) => ln.toLowerCase().includes(mk)); if (f >= 0) return f; }
  return lines.length - 1;
}

// ---- the garden's stable geometry (the film's seeded rng, same seeds) ----------
function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const PETALS = (() => {
  const g = rng(97);
  return Array.from({ length: 14 }, (_, i) => ({
    x: r(g() * 100), size: r(1.3 + g() * 3.1), cyc: r(30 + g() * 46),
    sway: r(26 + g() * 60), swc: r(3.5 + g() * 4.2), phase: r(g() * 0.96),
    rate: r((g() - 0.5) * 44), kind: i % 3, tint: i % 3,
  }));
})();
const BLOBS = (() => {
  const g = rng(311);
  return Array.from({ length: 5 }, () => ({
    x: r(g() * 100), y: r(g() * 100), R: r(44 + g() * 48),
    dx: r((g() - 0.5) * 60), dy: r((g() - 0.5) * 50), cyc: r(7 + g() * 5), tint: g(),
  }));
})();
const GUST = (() => {
  const g = rng(53);
  return Array.from({ length: 6 }, (_, j) => ({
    cross: r(10 + j * 14 + (g() - 0.5) * 6), size: r(2 + g() * 1.8),
    spin: r((g() - 0.5) * 240), lead: r(g() * 0.14), tint: j % 3,
  }));
})();
const LEAF_D = "M0,-1 C0.62,-0.62 0.5,0.72 0,1 C-0.5,0.72 -0.62,-0.62 0,-1 Z";
function petalShape(p, th) {
  const col = [th.accent, th.accent2, th.petal][p.tint];
  const sz = `width:${p.size}cqw;height:${p.size}cqw;display:block;overflow:visible;`;
  if (p.kind === 0) return `<svg viewBox="-1.2 -1.2 2.4 2.4" style="${sz}"><path d="M0,-1 C0.55,-0.7 0.55,0.7 0,1 C-0.55,0.7 -0.55,-0.7 0,-1 Z" fill="${rgba(col, 0.7)}"/></svg>`;
  if (p.kind === 1) return `<svg viewBox="-1.2 -1.2 2.4 2.4" style="${sz}"><ellipse rx="0.5" ry="1" fill="${rgba(col, 0.6)}"/></svg>`;
  return `<svg viewBox="-1.2 -1.2 2.4 2.4" style="${sz}"><circle r="0.42" fill="${rgba(col, 0.5)}"/></svg>`;
}

// ---- scenes -------------------------------------------------------------------

function hook(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const kicker = fit(String(scene.kicker || scene.purpose || "grown from your story"), 26).toUpperCase();
  const sub = fit(String(scene.subtext || ""), 90);
  const lines = breakLines(scene.headline, "Grown|with care").slice(0, 3);
  const copy = `
    <div id="${id}-k" style="opacity:0;font-family:${FB};font-weight:800;font-size:${q(26, land)}cqw;letter-spacing:0.22em;color:${th.accent700};margin-bottom:${q(30, land)}cqw;">${esc(kicker)}</div>
    ${gLines(id, lines, land ? 100 : 130, th, land, { ringIdx: markOf(scene, lines), lh: 1.02 })}
    ${sub ? `<div id="${id}-s" style="opacity:0;font-family:${FB};font-weight:500;font-size:${q(40, land)}cqw;color:${rgba(th.ink, 0.68)};margin-top:${q(34, land)}cqw;max-width:${land ? 42 : 66.7}cqw;">${esc(sub)}</div>` : ""}`;
  const html = land
    ? `<div style="position:absolute;left:8cqw;top:50%;transform:translateY(-50%);width:64cqw;">${copy}</div>`
    : `<div style="position:absolute;left:6.7cqw;right:6.7cqw;top:51.9cqw;">${copy}</div>`;
  const st = r(Math.min(0.22, L * 0.06));
  const s = [
    camera("drop", ctx),
    rise(`#${id}-k`, T, L, 0),
    `tl.fromTo("#${id} .${id}-ln",{opacity:0,y:34},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.4))},ease:"power3.out",stagger:${st}},${r(T + st)});`,
    sub ? rise(`#${id}-s`, T, L, lines.length + 1) : "",
    `tl.fromTo("#${id}-ring",{strokeDashoffset:100},{strokeDashoffset:0,duration:${r(Math.min(1.6, L * 0.5))},ease:"power2.inOut"},${r(T + Math.min(1, L * 0.25))});`,
  ];
  return { html, s };
}

function statement(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const sub = fit(String(scene.subtext || ""), 100);
  const lines = breakLines(scene.headline, "Made to|feel alive").slice(0, 3);
  // 9:16: the block ends at the subtext and leaves the lower half bare — flow the
  // scene's supporting points under the copy (see daybreak_composer's statement).
  const sup = land ? { html: "", s: [] } : E.supportList(`${id}-sup`, bullets(scene, 3), ctx, {
    flow: true, marginTop: q(46, land), font: q(34, land), fontFamily: FB,
    fg: rgba(th.ink, 0.7), dot: th.accent, max: 3,
  });
  const html = `<div style="position:absolute;left:${land ? 10 : 6.7}cqw;${land ? "top:50%;transform:translateY(-50%);width:64cqw;" : "right:6.7cqw;top:59.3cqw;"}">
    <div id="${id}-rule" style="opacity:0;width:${q(96, land)}cqw;height:${q(10, land)}cqw;border-radius:999px;background:${th.accent};margin-bottom:${q(46, land)}cqw;"></div>
    ${gLines(id, lines, land ? 102 : 118, th, land, { accentLine: 1, lh: 1.05 })}
    ${sub ? `<div id="${id}-s" style="opacity:0;font-family:${FB};font-weight:500;font-size:${q(38, land)}cqw;color:${rgba(th.ink, 0.66)};margin-top:${q(40, land)}cqw;max-width:${land ? 46 : 70}cqw;">${esc(sub)}</div>` : ""}
    ${sup.html}
  </div>`;
  const st = r(Math.min(0.22, L * 0.06));
  const s = [
    camera("left", ctx),
    rise(`#${id}-rule`, T, L, 0),
    `tl.fromTo("#${id}-rule",{scaleX:0},{scaleX:1,duration:0.8,ease:"power3.out",transformOrigin:"left center"},${r(T + 0.12)});`,
    `tl.fromTo("#${id} .${id}-ln",{opacity:0,y:34},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.4))},ease:"power3.out",stagger:${st}},${r(T + st)});`,
    sub ? rise(`#${id}-s`, T, L, lines.length + 1) : "",
    ...sup.s,
  ];
  return { html, s };
}

function feature(scene, ctx, a) {
  const { id, T, L, theme: th, land } = ctx;
  const got = (Array.isArray(scene.chips) && scene.chips.length ? scene.chips : bullets(scene, 3));
  const chips = (got.length ? got : ["Drops in your shots", "On-brand every frame", "Ready in minutes"]).slice(0, 3).map((c) => fit(String(c), 26));
  const lines = breakLines(scene.headline, "Planted|center stage").slice(0, 2);
  const frame = `<div id="${id}-fr" style="opacity:0;position:relative;width:100%;height:100%;background:${th.ink};border-radius:${q(30, land)}cqw;padding:${q(12, land)}cqw;box-shadow:0 2.2cqw 4.4cqw ${rgba(th.ink, 0.28)};display:flex;flex-direction:column;">
      <div style="display:flex;gap:${q(8, land)}cqw;padding:${q(6, land)}cqw ${q(10, land)}cqw ${q(12, land)}cqw;flex:none;">
        ${[0.9, 0.35, 0.35].map((o) => `<span style="width:${q(14, land)}cqw;height:${q(14, land)}cqw;border-radius:999px;background:${rgba(th.ground, o)};"></span>`).join("")}
      </div>
      <div style="flex:1;border-radius:${q(20, land)}cqw;overflow:hidden;background:${th.surface};">${slot(`${id}-img`, a, th, { radius: 0, focusTop: true })}</div>
    </div>`;
  const chipRow = chips.map((c) =>
    `<div class="${id}-chip" style="opacity:0;display:inline-flex;align-items:center;gap:${q(12, land)}cqw;padding:${q(16, land)}cqw ${q(26, land)}cqw;border-radius:999px;background:${th.ground};border:2px solid ${rgba(th.ink, 0.14)};box-shadow:0 ${q(10, land)}cqw ${q(24, land)}cqw ${rgba(th.ink, 0.08)};font-family:${FB};font-weight:700;font-size:${q(30, land)}cqw;color:${th.ink};"><span style="width:${q(16, land)}cqw;height:${q(16, land)}cqw;border-radius:999px;background:${th.accent};flex:none;"></span>${esc(c)}</div>`).join("");
  const html = land
    ? `<div style="position:absolute;left:6cqw;top:50%;transform:translateY(-50%);width:34cqw;">
         ${gLines(id, lines, 72, th, land, { lh: 1.02 })}
         <div style="display:flex;flex-direction:column;gap:${q(16, land)}cqw;align-items:flex-start;margin-top:${q(40, land)}cqw;">${chipRow}</div>
       </div>
       <div style="position:absolute;right:6cqw;top:9%;bottom:9%;width:48cqw;">${frame}</div>`
    : `<div style="position:absolute;left:6.7cqw;right:6.7cqw;top:27.8cqw;">
         ${gLines(id, lines, 96, th, land, { lh: 1.02 })}
         <div style="width:87.4cqw;height:57.4cqw;margin:${q(40, land)}cqw auto ${q(44, land)}cqw;">${frame}</div>
         <div style="display:flex;flex-wrap:wrap;gap:${q(20, land)}cqw;justify-content:center;">${chipRow}</div>
       </div>`;
  const st = r(Math.min(0.22, L * 0.06));
  const s = [
    camera("swing", ctx),
    `tl.fromTo("#${id} .${id}-ln",{opacity:0,y:34},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.4))},ease:"power3.out",stagger:${st}},${T});`,
    rise(`#${id}-fr`, T, L, 1),
    `tl.fromTo("#${id} .${id}-chip",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${r(Math.min(1.5, L * 0.42))},ease:"back.out(1.7)",stagger:${st}},${r(T + 2 * st)});`,
  ];
  return { html, s };
}

function montage(scene, ctx, a, b) {
  const { id, T, L, theme: th, land } = ctx;
  const tiles = (Array.isArray(scene.tiles) && scene.tiles.length ? scene.tiles : bullets(scene, 4));
  const labels = [0, 1, 2, 3].map((i) => fit(String(tiles[i] || ["Home", "Dashboard", "Details", "Mobile"][i]), 16));
  // Four tiles, four assets: the engine now fills every declared slot, and a
  // short pool cycles rather than leaving a hole — a repeated screenshot reads far
  // better than a blank white card.
  const pool = (Array.isArray(ctx.media) && ctx.media.length ? ctx.media : [a, b]).filter(Boolean);
  const media = [0, 1, 2, 3].map((k) => (pool.length ? pool[k % pool.length] : null));
  const lines = breakLines(scene.headline, "Every corner|of it").slice(0, 2);
  const tileH = land ? 15 : 26.85;  // PORTRAIT: two tiles at FULL width rather than four at half. A 2x2 wall in
  // 9:16 puts each plate under ~330px, where a product screenshot stops being
  // readable; stacked full width they get the whole frame. Fewer, bigger.

  const cells = (land ? [0, 1, 2, 3] : [0, 1]).map((i) =>
    `<div class="${id}-tl" style="opacity:0;height:${tileH}cqw;border-radius:${q(28, land)}cqw;overflow:hidden;box-shadow:0 ${q(24, land)}cqw ${q(50, land)}cqw ${rgba(th.ink, 0.12)};">${slot(`${id}-img${i}`, media[i], th, { radius: 0, label: labels[i] })}</div>`).join("");
  const html = land
    ? `<div style="position:absolute;left:6cqw;top:50%;transform:translateY(-50%);width:26cqw;">${gLines(id, lines, 66, th, land, { lh: 1.02 })}</div>
       <div style="position:absolute;right:6cqw;top:50%;transform:translateY(-50%);width:56cqw;display:grid;grid-template-columns:1fr 1fr;gap:1.3cqw;">${cells}</div>`
    : `<div style="position:absolute;left:6.7cqw;right:6.7cqw;top:27.8cqw;">
         ${gLines(id, lines, 96, th, land, { lh: 1.02 })}
         <div style="margin-top:${q(46, land)}cqw;display:grid;grid-template-columns:1fr;gap:${q(26, land)}cqw;">${cells}</div>
       </div>`;
  const st = r(Math.min(0.22, L * 0.06));
  const s = [
    camera("right", ctx),
    `tl.fromTo("#${id} .${id}-ln",{opacity:0,y:34},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.4))},ease:"power3.out",stagger:${st}},${T});`,
    `tl.fromTo("#${id} .${id}-tl",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${r(Math.min(1.5, L * 0.42))},ease:"back.out(1.7)",stagger:${st}},${r(T + st)});`,
  ];
  return { html, s };
}

function stats(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const sts = statsOf(scene, 3);
  const lines = breakLines(scene.headline, "Numbers that|keep growing").slice(0, 2);
  const rows = (sts.length ? sts : [{ pre: "", v: 100, suf: "%", l: "GROWN WITH CARE", isFloat: false }]).map((st, i) =>
    `<div class="${id}-row" style="opacity:0;display:flex;align-items:center;gap:${q(40, land)}cqw;background:${th.ground};border:2px solid ${rgba(th.ink, 0.1)};border-radius:${q(30, land)}cqw;padding:${q(34, land)}cqw ${q(44, land)}cqw;box-shadow:0 ${q(16, land)}cqw ${q(36, land)}cqw ${rgba(th.ink, 0.07)};">
      <div style="min-width:${land ? 14 : 27.8}cqw;font-family:${FH};font-size:${q(land ? 96 : 128, land)}cqw;line-height:0.9;color:${th.accent};font-variant-numeric:tabular-nums;"><span id="${id}-n${i}">0</span><span style="font-size:${q(land ? 48 : 64, land)}cqw;">${esc(st.suf || "")}</span></div>
      <div style="font-family:${FB};font-weight:600;font-size:${q(38, land)}cqw;color:${rgba(th.ink, 0.7)};">${esc((st.l || "").toLowerCase() || "and counting")}</div>
    </div>`).join("");
  const html = `<div style="position:absolute;left:${land ? 16 : 6.7}cqw;right:${land ? 16 : 6.7}cqw;${land ? "top:50%;transform:translateY(-50%);" : "top:33.3cqw;"}">
    ${gLines(id, lines, land ? 64 : 92, th, land, { lh: 1.02 })}
    <div style="margin-top:${q(60, land)}cqw;display:flex;flex-direction:column;gap:${q(30, land)}cqw;">${rows}</div>
  </div>`;
  const st = r(Math.min(0.22, L * 0.06));
  const s = [
    camera("zoom", ctx),
    `tl.fromTo("#${id} .${id}-ln",{opacity:0,y:34},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.4))},ease:"power3.out",stagger:${st}},${T});`,
    `tl.fromTo("#${id} .${id}-row",{opacity:0,y:34},{opacity:1,y:0,duration:${r(Math.min(1.3, L * 0.4))},ease:"power3.out",stagger:${r(Math.min(0.24, L * 0.06))}},${r(T + 0.4)});`,
    ...(sts.length ? sts : [{ v: 100, suf: "%", pre: "" }]).map((st2, i) =>
      `countTxt("#${id}-n${i}",${st2.v},${r(T + 0.55 + i * 0.2)},${r(Math.min(1.8, L * 0.55))},"${esc(st2.pre || "")}","",${st2.isFloat ? 10 : 1});`),
  ];
  return { html, s };
}

function cta(scene, ctx, a) {
  const { id, T, L, theme: th, land, brand, url } = ctx;
  const label = fit(String(scene.cta || scene.buttonLabel || "Start planting"), 24);
  const lines = breakLines(scene.headline, "Let's grow|your story").slice(0, 2);
  const logo = a && a.path
    ? `<img src="${esc(a.path)}" alt="logo" style="width:100%;height:100%;object-fit:contain;">`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${th.accent};color:${th.ground};font-family:${FH};font-size:${q(64, land)}cqw;">${esc(String(brand).slice(0, 1).toUpperCase())}</div>`;
  // 9:16: the closing block ends at the url with the lower sheet empty — close on
  // the film's own proof points rather than dead ground (see statement above).
  const sup = land ? { html: "", s: [] } : E.supportList(`${id}-sup`, bullets(scene, 3), ctx, {
    flow: true, marginTop: q(44, land), font: q(33, land), fontFamily: FB,
    fg: rgba(th.ink, 0.7), dot: th.accent, max: 3,
  });
  const html = `<div style="position:absolute;left:${land ? 12 : 6.7}cqw;${land ? "top:50%;transform:translateY(-50%);width:60cqw;" : "right:6.7cqw;top:51.9cqw;"}text-align:left;">
    <div id="${id}-lg" style="opacity:0;width:${q(150, land)}cqw;height:${q(150, land)}cqw;border-radius:999px;overflow:hidden;margin-bottom:${q(48, land)}cqw;box-shadow:0 1.4cqw 3cqw ${rgba(th.ink, 0.2)};">${logo}</div>
    ${gLines(id, lines, land ? 96 : 128, th, land, { lh: 1.0 })}
    <div id="${id}-btn" style="opacity:0;display:inline-flex;align-items:center;gap:${q(18, land)}cqw;margin-top:${q(54, land)}cqw;padding:${q(28, land)}cqw ${q(52, land)}cqw;border-radius:999px;background:${th.accent};color:${th.ground};font-family:${FH};font-size:${q(46, land)}cqw;">${esc(label)}
      <svg viewBox="0 0 24 24" fill="none" stroke="${th.ground}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" style="width:${q(40, land)}cqw;height:${q(40, land)}cqw;"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
    </div>
    <div id="${id}-url" style="opacity:0;font-family:${FB};font-weight:700;font-size:${q(40, land)}cqw;letter-spacing:0.04em;color:${th.accent700};margin-top:${q(46, land)}cqw;">${esc(url)}</div>
    ${sup.html}
  </div>`;
  const st = r(Math.min(0.22, L * 0.06));
  const s = [
    camera("scaleout", ctx),
    pop(`#${id}-lg`, T, L, 0),
    `tl.fromTo("#${id} .${id}-ln",{opacity:0,y:34},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.4))},ease:"power3.out",stagger:${st}},${r(T + st)});`,
    pop(`#${id}-btn`, T, L, 2),
    rise(`#${id}-url`, T, L, 3),
    ...sup.s,
    `tl.to("#${id}-btn",{scale:1.03,duration:1.2,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(1, L - 1.4))},1.2)},${r(T + 1.2)});`,
  ];
  return { html, s };
}

const SCENES = { hook, statement, feature, montage, stats, cta };

// ---- chrome: the living garden world + sprout chip + progress rail ------------
function chrome({ theme: th, D, brand, count, land, r: rr, esc: esch }) {
  // rolling double sine hills along the base (the film's y(x)/y2(x) paths)
  const hillPath = (base, a1, w1, a2, w2) => {
    const HW = 1440, HH = 320;
    let d = `M0,${HH}`;
    for (let x = 0; x <= HW; x += 40) d += ` L${x},${Math.round((base + Math.sin(x / w1) * a1 + (a2 ? Math.sin(x / w2 + 2) * a2 : 0)) * 10) / 10}`;
    return d + ` L${HW},${HH} Z`;
  };
  const hills = `<svg viewBox="0 0 1440 320" preserveAspectRatio="none" style="position:absolute;left:-8%;bottom:-1%;width:116%;height:${land ? 16 : 24}%;">
      <g id="og-hill1"><path d="${hillPath(96, 30, 277, 9, 96)}" fill="${rgba(th.accent2, 0.16)}"/></g>
      <g id="og-hill2"><path d="${hillPath(205, 22, 213, 0, 1)}" fill="${rgba(th.accent2, 0.24)}"/></g>
    </svg>`;
  const blobsHtml = BLOBS.map((b, i) => {
    const col = b.tint < 0.5 ? th.accent2 : th.accent;
    return `<div id="og-bl${i}" style="position:absolute;left:${b.x}%;top:${b.y}%;width:${b.R}cqw;height:${b.R}cqw;margin:-${rr(b.R / 2)}cqw 0 0 -${rr(b.R / 2)}cqw;border-radius:999px;background:radial-gradient(circle,${rgba(col, 0.5)} 0%,${rgba(col, 0)} 70%);opacity:0.55;"></div>`;
  }).join("");
  const petalsHtml = PETALS.map((p, i) =>
    `<div class="og-pt og-pt${i}" style="position:absolute;left:${p.x}%;top:${rr(-8 + 116 * p.phase)}%;">${petalShape(p, th)}</div>`).join("");
  const gustHtml = GUST.map((g, j) =>
    `<div class="og-gl og-gl${j}" style="opacity:0;position:absolute;top:${g.cross}%;left:-14%;width:${g.size}cqw;height:${g.size}cqw;">
      <svg viewBox="-1.2 -1.2 2.4 2.4" style="width:100%;height:100%;overflow:visible;"><path d="${LEAF_D}" fill="${rgba([th.accent2, th.accent, th.petal][g.tint], 0.85)}"/></svg>
    </div>`).join("");
  const html = `
  <div id="og-world" class="clip" data-start="0" data-duration="__D__" data-track-index="1" data-layout-allow-occlusion style="opacity:0;background:${th.ground};">
    ${blobsHtml}
    ${hills}
    ${petalsHtml}
  </div>
  <div id="og-chrome" class="clip" data-start="0" data-duration="__D__" data-track-index="39" data-layout-allow-occlusion style="opacity:0;background:none;">
    ${gustHtml}
    <div style="position:absolute;top:${land ? 4 : 3.3}%;left:${land ? 3.5 : 6.7}%;display:flex;align-items:center;gap:1.4cqw;">
      <div style="width:${land ? 2.6 : 4.1}cqw;height:${land ? 2.6 : 4.1}cqw;border-radius:999px;background:${th.accent};display:flex;align-items:center;justify-content:center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="${th.ground}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" style="width:60%;height:60%;"><path d="M12 20V10"/><path d="M12 10c0-3 2-5 5-5 0 3-2 5-5 5Z"/><path d="M12 13c0-2.5-2-4-4.5-4 0 2.5 2 4 4.5 4Z"/></svg>
      </div>
      <span style="font-family:${FH};font-size:${land ? 1.8 : 3.1}cqw;color:${th.ink};">${esch(brand)}</span>
    </div>
  </div>`;
  const lines = [
    `tl.fromTo("#og-world",{opacity:0},{opacity:1,duration:0.5},0);`,
    `tl.fromTo("#og-chrome",{opacity:0},{opacity:1,duration:0.5},0.2);`,
    `tl.to("#og-hill1",{x:34,duration:7.5,ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},7.5)},0);`,
    `tl.to("#og-hill2",{x:-30,duration:5.8,ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},5.8)},0);`,
  ];
  BLOBS.forEach((b, i) => {
    lines.push(`tl.to("#og-bl${i}",{x:${b.dx},y:${b.dy},duration:${b.cyc},ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},${b.cyc})},0);`);
  });
  PETALS.forEach((p, i) => {
    const P = rr(-8 + 116 * p.phase);
    const d1 = rr(Math.max(0.5, p.cyc * (1 - p.phase)));
    lines.push(`tl.fromTo(".og-pt${i}",{top:"${P}%"},{top:"108%",duration:${d1},ease:"none"},0);`);
    lines.push(`tl.fromTo(".og-pt${i}",{top:"-8%"},{top:"108%",duration:${p.cyc},ease:"none",repeat:reps(${rr(Math.max(0, D - d1))},${p.cyc})},${d1});`);
    lines.push(`tl.to(".og-pt${i}",{x:${rr(p.sway * (i % 2 ? 1 : -1))},duration:${p.swc},ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},${p.swc})},0);`);
    lines.push(`tl.to(".og-pt${i}",{rotation:${rr(p.rate * Math.max(D, 8))},duration:${rr(Math.max(D, 8))},ease:"none"},0);`);
  });
  return { html, script: lines.join("\n  ") };
}

// Send the film's gust of leaves sweeping across each cut (alternating ltr/rtl).
// The segmented progress rail that used to fill along the base was removed — a
// bar ticking scene-by-scene reads as a slideshow.
function perScene(scene, ctx) {
  const { i, T, L, isLast } = ctx;
  const lines = [];
  if (!isLast && L > 1.6) {
    const t0 = r(T + L - 0.5);
    const ltr = i % 2 === 0;
    GUST.forEach((g, j) => {
      const at = r(t0 + g.lead);
      lines.push(`tl.fromTo(".og-gl${j}",{left:"${ltr ? -14 : 112}%",rotation:0},{left:"${ltr ? 112 : -14}%",rotation:${g.spin},duration:0.95,ease:"power1.inOut"},${at});`);
      lines.push(`tl.fromTo(".og-gl${j}",{opacity:0},{opacity:0.8,duration:0.48,ease:"sine.inOut",yoyo:true,repeat:1},${at});`);
    });
  }
  return lines.join("\n  ");
}

function styleBlock(th) {
  return `${th.fontFace}
  #root { font-family:${th.bodyStack}; }
  #cap-pill { background:${rgba(th.ground, 0.92)}; border:1px solid ${rgba(th.accent, 0.4)} !important; }
  #cap-text { font-family:${th.bodyStack}; color:${th.ink}; }`;
}

const family = {
  theme, styleBlock, chrome, perScene, SCENES, TEMPLATE_SCENES, route, mediaSlots, mediaFallback, wantsLogo,
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
