// HYPE WAVE composer — a faithful native GSAP port of the user's "Hype Wave"
// bundled reel template (hype-wave-film.jsx). The pack `hype-wave` (manifest
// renderer routes here) gives THE TEMPLATE: its six authored beats (blue slam
// Hook, navy ribbon Statement, yellow chip Feature, cream conveyor Montage,
// coral odometer Stats, blue pulse CTA), its per-beat camera pushes
// (pushLeft / zoomIn / pushUp / pushRight / zoomOut / pushDown with a live
// drifting zoom), its living world (scrolling two-colour checkerboard bands
// that never stop, wavy ribbon strokes rolling, spinning star stickers with
// hard navy offsets, bobbing sticker chips) and its chrome (star brand sticker
// top-left, per-scene progress rail at the base). The signature text effect is
// the SLAM: Archivo Black uppercase words slam in one by one (scale 1.6→1 with
// a rotation settle, back-out), every third word OUTLINED (transparent fill +
// text stroke). Only the CONTENT is swapped: headlines/kickers/subs from the
// script, chips/tiles/stats mined by the Template Director, and the template's
// own media slots filled with the film's REAL assets — the website screenshot
// on the hook and feature sticker plates, parsed site images on the conveyor
// cards, the brand logo on the CTA sticker.
//
// Portrait (the template's native 9:16) reproduces the film's layout ~1:1 in
// cqw; landscape re-stages each beat as a two-column adaptation with the same
// type, motion and world. Render contract is template_engine's (seek-safe,
// finite repeats, hard kills); this module is design only.

const { deriveTheme } = require("./scene_kit");
const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const E = require("./template_engine");
const { esc, r, rgba, mix, inkOn, statsOf, breakLines, bullets, fit } = E;

const FD = "'Archivo Black', 'Arial Black', sans-serif";
const FB = "'Space Grotesk', system-ui, sans-serif";

// ---- theme --------------------------------------------------------------------
function theme(manifest, brandSkin, { framePack, land } = {}) {
  const t = deriveTheme(framePack || "hype-wave", {}, brandSkin);
  const cream = t.ground || "#fdf8ec";
  const navy = t.ink || "#101433";
  const blue = (t.accents && t.accents[0]) || "#2b5bff";
  const coral = (t.accents && t.accents[1]) || "#ff5a48";
  const yellow = (t.extras && t.extras[0]) || "#ffd234";
  return {
    ...t, cream, navy, blue, coral, yellow,
    displayStack: FD, bodyStack: FB,
    fontFace: (isBundled("Archivo Black") ? fontFaceCss("Archivo Black") : "")
      + (isBundled("Space Grotesk") ? fontFaceCss("Space Grotesk") : ""),
  };
}

// ---- vocabulary (Template Director casts onto these) --------------------------
const TEMPLATE_SCENES = [
  {
    type: "hook", bestFor: "opening — the loud promise",
    look: "Electric-blue frame: a yellow kicker sticker, Archivo Black mega-words SLAMMING in one by one (every third word outlined), a cream hard-shadow sticker plate holding the website screenshot, spinning star stickers and a scrolling checkerboard band.",
    slots: { kicker: "max 22 chars, uppercase", headline: "2-3 lines ('|' breaks), 1-3 SHORT words each", subtext: "one punchy sentence, max 90 chars" },
    media: ["desktop"],
  },
  {
    type: "statement", bestFor: "the belief or the problem, said loud",
    look: "Navy frame, two wavy ribbons rolling forever, mega slam type with coral alternate words, a spinning star and a checkerboard band at the base.",
    slots: { headline: "2-3 short lines", subtext: "one sentence, max 100 chars" },
    media: [],
  },
  {
    type: "feature", bestFor: "the product for real + what you get",
    look: "Taxi-yellow frame: navy slam headline, a big cream sticker plate with the screenshot, numbered sticker chips punching in from the right one by one.",
    slots: { headline: "max 2 short lines", chips: "2-3 items, max 22 chars each" },
    media: ["desktop"],
  },
  {
    type: "montage", bestFor: "range — pages, angles, drops",
    look: "Cream frame with a scrolling checker band; two opposite-direction conveyor belts of tilted hard-shadow sticker cards carrying labeled shots.",
    slots: { headline: "max 2 short lines", tiles: "4 short labels, max 12 chars each" },
    media: ["photo", "photo"], mediaMin: 0,
  },
  {
    type: "stats", bestFor: "numbers that prove the hype",
    look: "Coral frame: slam headline, up to three odometer digit-reels spinning down to their figure beside bold labels.",
    slots: { headline: "max 2 short lines", stats: "1-3 of {v, suf, l}" },
    media: [],
  },
  {
    type: "cta", bestFor: "closing shout",
    look: "Electric-blue frame: logo sticker, centered mega slam, a pulsing yellow sticker button with an arrow, the url in yellow.",
    slots: { headline: "max 2 lines, 1-2 words each", cta: "button label, max 18 chars" },
    media: [],
  },
];
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
const mediaFallback = (scene, ctx) =>
  (ctx && ctx.i === 0 ? "hook" : (bullets(scene, 3).length >= 2 ? "feature" : "statement"));
const wantsLogo = (type) => type === "cta";

// ---- shared pieces ------------------------------------------------------------
// Film px → cqw. Portrait maps the template's native 1080-wide sheet 1:1;
// landscape converts against its 1920-wide frame (same on-screen px).
const q = (px, land) => r(px * (land ? 0.052 : 0.0926));

// The film's rise(): outQuint rise from 46px, base offset 0.1·L, stagger 0.06·L.
function rise(sel, T, L, idx, e = 1) {
  const at = r(T + Math.min(0.7, L * 0.1) + idx * Math.min(0.22, L * 0.06));
  return `tl.fromTo("${sel}",{opacity:0,y:${r(46 * e)}},{opacity:1,y:0,duration:${r(Math.min(1.4, L * 0.4))},ease:"expo.out"},${at});`;
}

// The film's SLAM: Archivo Black uppercase words, one span per word; word idx
// %3===2 is OUTLINED (transparent fill + text stroke in the fill colour),
// idx%3===1 takes the alternate colour. Font auto-fits the longest line.
function slamHtml(id, text, fallback, sizePx, fill, alt, land, widthCqw, center) {
  const lines = breakLines(text, fallback).slice(0, 3).map((l) => fit(l, 18));
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  const fs = r(Math.min(q(sizePx, land), widthCqw / (maxLen * 0.74)));
  let idx = 0;
  const html = lines.map((ln) =>
    `<div style="line-height:0.98;white-space:nowrap;${center ? "text-align:center;" : ""}">` +
    ln.split(/\s+/).filter(Boolean).map((wd) => {
      const k = idx++;
      const outlined = k % 3 === 2;
      const col = outlined ? "transparent" : (k % 3 === 1 ? alt : fill);
      return `<span class="${id}-w" style="opacity:0;display:inline-block;font-family:${FD};font-size:${fs}cqw;text-transform:uppercase;letter-spacing:-0.02em;margin-right:0.22em;color:${col};${outlined ? `-webkit-text-stroke:${land ? 0.16 : 0.28}cqw ${fill};` : ""}">${esc(wd)}</span>`;
    }).join("") + `</div>`).join("");
  return { html, count: idx };
}
// Slam entrance (y 80 / rotate 6 / scale 1.6→1, back-out, per-word stagger)
// then the film's endless per-word jiggle once every word has landed.
function slamAnim(id, T, L, count) {
  const stag = r(Math.min(0.22, L * 0.07));
  const dur = r(Math.min(1.5, L * 0.3));
  const at = r(T + Math.min(0.5, L * 0.05));
  const jigAt = r(at + dur + stag * Math.max(0, count - 1));
  const span = r(Math.max(1.7, T + L - jigAt));
  return [
    `tl.fromTo("#${id} .${id}-w",{opacity:0,y:80,rotation:6,scale:1.6},{opacity:1,y:0,rotation:0,scale:1,duration:${dur},ease:"back.out(1.5)",stagger:${stag}},${at});`,
    `tl.to("#${id} .${id}-w",{rotation:1.1,duration:1.7,ease:"sine.inOut",yoyo:true,repeat:reps(${span},1.7),stagger:0.17},${jigAt});`,
  ];
}

// The film's per-beat camera on the engine's #id-camo/-cami rig: directional
// push/zoom enter, slow live drift zoom + bob, directional exit. Kinds are the
// film's cam() table, assigned per scene type in the film's beat order.
const CAM = {
  pushLeft: { in: { x: 170, rotation: 2 }, out: { x: -130, rotation: -1.5 } },
  pushRight: { in: { x: -170, rotation: -2 }, out: { x: 130, rotation: 1.5 } },
  pushUp: { in: { y: 210 }, out: { y: -160 } },
  pushDown: { in: { y: -210 }, out: { y: 160 } },
  zoomIn: { in: { scale: 1.12, rotation: -2 }, out: { scale: 0.95, rotation: 1.5 } },
  zoomOut: { in: { scale: 0.94, rotation: 2 }, out: { scale: 1.06, rotation: -1.5 } },
};
function camera(kind, ctx) {
  const c = CAM[kind] || CAM.zoomIn;
  const { id, T, L, isLast, i } = ctx;
  const inD = r(Math.min(0.85, L * 0.18)), outD = r(Math.min(0.7, L * 0.16));
  const from = Object.entries(c.in).map(([k, v]) => `${k}:${v}`).join(",");
  const to = Object.keys(c.in).map((k) => `${k}:${k === "scale" ? 1 : 0}`).join(",");
  const out = Object.entries(c.out).map(([k, v]) => `${k}:${v}`).join(",");
  const lines = [
    i === 0 ? "" : `tl.fromTo("#${id}-camo",{${from},opacity:0},{${to},opacity:1,duration:${inD},ease:"expo.out"},${T});`,
    isLast ? "" : `tl.to("#${id}-camo",{${out},opacity:0.75,duration:${outD},ease:"power2.in"},${r(T + L - outD)});`,
    // continuous live drift: slow push over the whole beat + a lissajous bob
    `tl.fromTo("#${id}-cami",{scale:1},{scale:1.05,duration:${r(L)},ease:"none"},${T});`,
    `tl.to("#${id}-cami",{x:7,duration:2.2,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},2.2)},${T});`,
    `tl.to("#${id}-cami",{y:6,duration:1.75,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},1.75)},${T});`,
  ];
  return lines.filter(Boolean).join("\n  ");
}

// ---- world dressing (per scene, inside the camera — as in the film) -----------
// Scrolling two-colour checkerboard band, tilted, never stops. The inner sheet
// translates one 128px tile per 1.42s (the film's 90px/s) and wraps seamlessly.
function checker(idc, topCqw, c1, c2, { tilt = -2, dir = 1, hPx = 64, land = false, T = 0, span = 4, alpha = null } = {}) {
  const cell = q(128, land);
  const html = `<div style="position:absolute;left:-14cqw;right:-14cqw;top:${topCqw}cqw;height:${q(hPx, land)}cqw;transform:rotate(${tilt}deg);overflow:hidden;${alpha != null ? `opacity:${alpha};` : ""}">
    <div class="${idc}" style="position:absolute;top:0;bottom:0;left:-${cell}cqw;width:calc(100% + ${r(cell * 2)}cqw);background:repeating-conic-gradient(${c1} 0% 25%, ${c2} 25% 50%) 0 0 / ${cell}cqw ${cell}cqw;"></div>
  </div>`;
  const script = `tl.fromTo(".${idc}",{x:0},{x:${dir > 0 ? -128 : 128},duration:1.42,ease:"none",repeat:reps(${r(span * 2)},1.42)},${T});`;
  return { html, script };
}

// Wavy ribbon stroke rolling forever: one sine wavelength (2π·130 ≈ 817px) of
// horizontal translate loops seamlessly at the film's phase speed.
function ribbon(idc, color, W, yPx, amp, thick, speed, T, span) {
  let d = `M-900,${Math.round(yPx)}`;
  for (let x = -860; x <= W + 900; x += 40) d += ` L${x},${Math.round(yPx + Math.sin(x / 130) * amp)}`;
  const cyc = r(6.28 / Math.abs(speed));
  const html = `<g class="${idc}"><path d="${d}" fill="none" stroke="${color}" stroke-width="${thick}" stroke-linecap="round"/></g>`;
  const script = `tl.fromTo(".${idc}",{x:0},{x:${speed > 0 ? -817 : 817},duration:${cyc},ease:"none",repeat:reps(${r(span * 2)},${cyc})},${T});`;
  return { html, script };
}

// Spinning ten-point star sticker (hard navy border), constant deg/s rotation.
function starPts(cx, cy, R) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? R : R * 0.46;
    pts.push(`${r(cx + Math.cos(a) * rr)},${r(cy + Math.sin(a) * rr)}`);
  }
  return pts.join(" ");
}
function star(idc, cx, cy, R, color, border, speed, T, span) {
  const html = `<g class="${idc}"><polygon points="${starPts(cx, cy, R)}" fill="${color}"${border ? ` stroke="${border}" stroke-width="6"` : ""}/></g>`;
  const script = `tl.fromTo(".${idc}",{rotation:0},{rotation:${r(speed * span)},duration:${r(span)},ease:"none",svgOrigin:"${r(cx)} ${r(cy)}"},${T});`;
  return { html, script };
}
const sceneSvg = (Wf, Hf, inner) =>
  `<svg viewBox="0 0 ${Wf} ${Hf}" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;">${inner}</svg>`;

// Hard-shadow sticker card (brutalist pop): navy border + 10px navy offset.
function sticker(inner, { bg, border, shadow, rot = 0, radius = 18, pad = null, id = "", extra = "" }, land) {
  return `<div${id ? ` id="${id}"` : ""} style="position:relative;background:${bg};border:${q(4, land)}cqw solid ${border};border-radius:${q(radius, land)}cqw;box-shadow:${q(10, land)}cqw ${q(10, land)}cqw 0 ${shadow};transform:rotate(${rot}deg);${pad != null ? `padding:${pad};` : ""}${extra}">${inner}</div>`;
}

// Media slot: real asset (cover, screenshots pinned top) or the template's
// quiet cream placeholder panel — reads as a designed block, not a gap.
function slot(sid, asset, th, { radius = 14, compact = false, focusTop = false, land = false } = {}) {
  const rad = q(radius, land);
  if (asset && asset.path) {
    return `<img data-media-slot="filled" id="${sid}" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;border-radius:${rad}cqw;object-fit:${asset.fitContain ? "contain" : "cover"};padding:${asset.fitContain ? "7%" : "0"};object-position:${asset.fitContain ? "center" : (focusTop ? "top center" : (asset.cropFocus || "center"))};display:block;">`;
  }
  const cam = (s, c) => ``;
  if (compact) {
    return `<div data-media-slot="empty" id="${sid}" style="width:100%;height:100%;border-radius:${rad}cqw;display:flex;align-items:center;justify-content:center;background:${th.cream};border:${q(4, land)}cqw solid ${rgba(th.navy, 0.4)};">${cam(land ? 1.8 : 3.3, rgba(th.navy, 0.6))}</div>`;
  }
  return `<div data-media-slot="empty" id="${sid}" style="width:100%;height:100%;border-radius:${rad}cqw;display:flex;align-items:center;justify-content:center;background:${th.cream};border:${q(4, land)}cqw solid ${rgba(th.navy, 0.4)};">
    <div style="width:${q(52, land)}cqw;height:${q(52, land)}cqw;border-radius:${q(12, land)}cqw;background:${th.yellow};border:${q(3, land)}cqw solid ${th.navy};display:flex;align-items:center;justify-content:center;">${cam(land ? 1.35 : 2.4, th.navy)}</div>
  </div>`;
}

// ---- scenes -------------------------------------------------------------------

function hook(scene, ctx, a) {
  const { id, T, L, theme: th, land } = ctx;
  const Wf = land ? 1920 : 1080, Hf = land ? 1080 : 1920;
  const fgc = inkOn(th.blue, th.navy, th.cream);
  const kicker = fit(String(scene.kicker || scene.purpose || "TURN IT UP"), 22).toUpperCase();
  const sub = fit(String(scene.subtext || ""), 90);
  const s1 = star(`${id}-st1`, r(Wf * 0.86), land ? 170 : 300, land ? 85 : 130, th.yellow, th.navy, 30, T, L);
  const s2 = star(`${id}-st2`, land ? 70 : 90, r(Hf * 0.56), land ? 55 : 80, th.coral, th.navy, -44, T, L);
  const rb = ribbon(`${id}-rb`, rgba(fgc, 0.25), Wf, r(Hf * 0.28), land ? 28 : 40, land ? 13 : 20, 1.2, T, L);
  const ck = checker(`${id}-ck`, land ? 4 : q(210, false), th.navy, th.yellow, { tilt: -3, dir: 1, hPx: land ? 48 : 64, land, T, span: L });
  const slm = slamHtml(id, scene.headline, "Make some|actual|noise.", land ? 84 : 148, fgc, th.yellow, land, land ? 44 : 88.5, false);
  const kick = sticker(esc(kicker), { bg: th.yellow, border: th.navy, shadow: th.navy, rot: -2, pad: `${q(12, land)}cqw ${q(26, land)}cqw`, extra: `display:inline-block;font-family:${FB};font-weight:700;font-size:${q(26, land)}cqw;letter-spacing:0.16em;color:${inkOn(th.yellow, th.navy, th.cream)};` }, land);
  const plate = sticker(`<div style="width:100%;height:100%;border-radius:${q(14, land)}cqw;overflow:hidden;">${slot(`${id}-img`, a, th, { radius: 14, focusTop: true, land })}</div>`,
    { bg: th.cream, border: th.navy, shadow: th.navy, rot: 1.5, id: `${id}-ms`, extra: `width:100%;height:100%;padding:${q(14, land)}cqw;` }, land);
  const subHtml = sub ? `<div id="${id}-sub" style="opacity:0;font-family:${FB};font-weight:500;font-size:${q(land ? 28 : 36, land)}cqw;color:${rgba(fgc, 0.85)};margin-top:${q(42, land)}cqw;">${esc(sub)}</div>` : "";
  const html = land
    ? `${sceneSvg(Wf, Hf, rb.html + s1.html + s2.html)}${ck.html}
       <div style="position:absolute;left:6cqw;top:50%;transform:translateY(-50%);width:44cqw;">
         <div id="${id}-k" style="opacity:0;margin-bottom:${q(30, land)}cqw;">${kick}</div>
         ${slm.html}${subHtml}
       </div>
       <div id="${id}-m" style="opacity:0;position:absolute;right:6cqw;top:14.6cqw;width:42cqw;height:26.4cqw;">${plate}</div>`
    : `${sceneSvg(Wf, Hf, rb.html + s1.html + s2.html)}${ck.html}
       <div style="position:absolute;left:5.74cqw;right:5.74cqw;top:37cqw;">
         <div id="${id}-k" style="opacity:0;margin-bottom:3.33cqw;">${kick}</div>
         ${slm.html}
         <div id="${id}-m" style="opacity:0;margin-top:4.45cqw;width:83.34cqw;height:51.86cqw;">${plate}</div>
         ${subHtml}
       </div>`;
  const s = [
    camera("pushLeft", ctx),
    rise(`#${id}-k`, T, L, 0),
    ...slamAnim(id, T, L, slm.count),
    rise(`#${id}-m`, T, L, 4),
    sub ? rise(`#${id}-sub`, T, L, 6) : "",
    `tl.to("#${id}-ms",{rotation:2.7,y:4,duration:2.9,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},2.9)},${r(T + Math.min(1.6, L * 0.35))});`,
    ck.script, rb.script, s1.script, s2.script,
  ];
  return { html, s, clipStyle: `background:${th.blue};` };
}

function statement(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const Wf = land ? 1920 : 1080, Hf = land ? 1080 : 1920;
  const fgc = inkOn(th.navy, th.navy, th.cream);
  const sub = fit(String(scene.subtext || ""), 100);
  const rb1 = ribbon(`${id}-rb1`, rgba(th.blue, 0.55), Wf, r(Hf * 0.2), land ? 38 : 56, land ? 20 : 30, 0.9, T, L);
  const rb2 = ribbon(`${id}-rb2`, rgba(th.coral, 0.5), Wf, r(Hf * 0.82), land ? 34 : 50, land ? 17 : 26, -1.1, T, L);
  const s1 = star(`${id}-st1`, r(Wf * 0.82), r(Hf * 0.68), land ? 72 : 110, th.yellow, th.cream, 26, T, L);
  const ck = checker(`${id}-ck`, land ? 48 : 147.2, th.yellow, th.navy, { tilt: 2.5, dir: -1, hPx: land ? 44 : 64, land, T, span: L });
  const slm = slamHtml(id, scene.headline, "Beige is|a choice.|Refuse it.", land ? 96 : 158, fgc, th.coral, land, land ? 66 : 88.5, false);
  // 9:16: the slam headline + one subtext line leave the lower half of the sheet
  // empty. Flow the scene's supporting points under the copy (see daybreak).
  const sup = land ? { html: "", s: [] } : E.supportList(`${id}-sup`, bullets(scene, 3), ctx, {
    flow: true, marginTop: q(46, land), font: q(34, land), fontFamily: FB,
    fg: rgba(fgc, 0.76), dot: th.yellow, max: 3,
  });
  const html = `${sceneSvg(Wf, Hf, rb1.html + rb2.html + s1.html)}
    <div style="position:absolute;left:${land ? 10 : 5.74}cqw;${land ? "top:50%;transform:translateY(-50%);width:66cqw;" : "right:5.74cqw;top:55.5cqw;"}">
      ${slm.html}
      ${sub ? `<div id="${id}-sub" style="opacity:0;font-family:${FB};font-weight:500;font-size:${q(land ? 30 : 37, land)}cqw;color:${rgba(fgc, 0.7)};margin-top:${q(44, land)}cqw;max-width:${land ? 44 : 74}cqw;">${esc(sub)}</div>` : ""}
      ${sup.html}
    </div>${ck.html}`;
  const s = [
    camera("zoomIn", ctx),
    ...slamAnim(id, T, L, slm.count),
    sub ? rise(`#${id}-sub`, T, L, 6) : "",
    ...sup.s,
    rb1.script, rb2.script, s1.script, ck.script,
  ];
  return { html, s, clipStyle: `background:${th.navy};` };
}

function feature(scene, ctx, a) {
  const { id, T, L, theme: th, land } = ctx;
  const Wf = land ? 1920 : 1080, Hf = land ? 1080 : 1920;
  const ink = inkOn(th.yellow, th.navy, th.cream);
  const chips = (Array.isArray(scene.chips) && scene.chips.length ? scene.chips : bullets(scene, 3)).slice(0, 3).map((c) => fit(String(c), 22));
  const chipBgs = [th.coral, th.blue, th.navy];
  const s1 = star(`${id}-st1`, Wf - 90, r(Hf * 0.66), land ? 78 : 120, th.blue, th.navy, -22, T, L);
  const rb = ribbon(`${id}-rb`, rgba(th.coral, 0.5), Wf, r(Hf * 0.14), land ? 25 : 36, land ? 15 : 22, 1.3, T, L);
  const slm = slamHtml(id, scene.headline, "Your product,|front row.", land ? 62 : 104, ink, th.coral, land, land ? 40 : 88.5, false);
  const plate = sticker(`<div style="width:100%;height:100%;border-radius:${q(14, land)}cqw;overflow:hidden;">${slot(`${id}-img`, a, th, { radius: 14, focusTop: true, land })}</div>`,
    { bg: th.cream, border: th.navy, shadow: th.navy, rot: -1.5, id: `${id}-ms`, extra: `width:100%;height:100%;padding:${q(14, land)}cqw;` }, land);
  const chipRow = chips.map((c, i) =>
    `<div class="${id}-chip" style="opacity:0;">${sticker(
      `<span>0${i + 1}</span><span>${esc(c)}</span>`,
      { bg: chipBgs[i], border: th.navy, shadow: th.navy, rot: i % 2 === 0 ? -1.5 : 1.5, pad: `${q(14, land)}cqw ${q(28, land)}cqw`, extra: `display:inline-flex;align-items:center;gap:${q(14, land)}cqw;font-family:${FD};font-size:${q(land ? 24 : 32, land)}cqw;text-transform:uppercase;color:${i === 2 ? th.yellow : inkOn(chipBgs[i], th.navy, th.cream)};` }, land)}</div>`).join("");
  const html = land
    ? `${sceneSvg(Wf, Hf, s1.html + rb.html)}
       <div style="position:absolute;left:6cqw;top:50%;transform:translateY(-50%);width:40cqw;">
         ${slm.html}
         <div style="display:flex;flex-direction:column;gap:1.2cqw;align-items:flex-start;margin-top:2.2cqw;">${chipRow}</div>
       </div>
       <div id="${id}-m" style="opacity:0;position:absolute;right:5cqw;top:13.4cqw;width:46cqw;height:29.3cqw;">${plate}</div>`
    : `${sceneSvg(Wf, Hf, s1.html + rb.html)}
       <div style="position:absolute;left:5.74cqw;right:5.74cqw;top:25.9cqw;">
         ${slm.html}
         <div id="${id}-m" style="opacity:0;margin:4.63cqw 0 4.26cqw;width:87.41cqw;height:55.56cqw;">${plate}</div>
         <div style="display:flex;flex-direction:column;gap:2.04cqw;align-items:flex-start;">${chipRow}</div>
       </div>`;
  const s = [
    camera("pushUp", ctx),
    ...slamAnim(id, T, L, slm.count),
    rise(`#${id}-m`, T, L, 3),
    chips.length ? `tl.fromTo("#${id} .${id}-chip",{opacity:0,x:140},{opacity:1,x:0,duration:${r(Math.min(1.2, L * 0.32))},ease:"back.out(1.5)",stagger:${r(Math.min(0.22, L * 0.09))}},${r(T + Math.min(1.6, L * 0.4))});` : "",
    `tl.to("#${id}-ms",{rotation:-0.3,y:4,duration:2.7,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},2.7)},${r(T + Math.min(1.6, L * 0.35))});`,
    s1.script, rb.script,
  ];
  return { html, s, clipStyle: `background:${th.yellow};` };
}

function montage(scene, ctx, a, b) {
  const { id, T, L, theme: th, land } = ctx;
  const Wf = land ? 1920 : 1080, Hf = land ? 1080 : 1920;
  const tiles = (Array.isArray(scene.tiles) && scene.tiles.length ? scene.tiles : bullets(scene, 4));
  const labels = [0, 1, 2, 3].map((i) => fit(String(tiles[i] || ["Home", "Pricing", "Dashboard", "Checkout"][i]), 12));
  // Four tiles, four assets: the engine now fills every declared slot, and a
  // short pool cycles rather than leaving a hole — a repeated screenshot reads far
  // better than a blank white card.
  const pool = (Array.isArray(ctx.media) && ctx.media.length ? ctx.media : [a, b]).filter(Boolean);
  const media = [0, 1, 2, 3].map((k) => (pool.length ? pool[k % pool.length] : null));
  const bgs = [th.blue, th.coral, th.navy, th.yellow];
  const ck = checker(`${id}-ck`, land ? 3 : 17.6, th.blue, th.cream, { tilt: -2.5, dir: 1, hPx: land ? 44 : 64, land, T, span: L });
  const slm = slamHtml(id, scene.headline, "Every page|slaps.", land ? 56 : 124, th.navy, th.blue, land, land ? 60 : 88.5, false);
  const cardW = land ? 23.96 : 55.56, gapC = land ? 1.46 : 2.78, mediaH = land ? 11.5 : 30.56;
  const loop = (land ? 488 : 630) * 2;
  const cyc = r(Math.max(2.4, L * 0.62));
  const strip = (n, idxs, topC, hC, dir) => {
    const cards = [];
    for (let rep = 0; rep < 3; rep++) {
      for (const ti of idxs) {
        cards.push(`<div class="${id}-cd" style="width:${cardW}cqw;flex:none;">${sticker(
          `<div style="height:${mediaH}cqw;border-radius:${q(14, land)}cqw;overflow:hidden;">${slot(`${id}-im${n}-${ti}-${rep}`, media[ti], th, { radius: 14, land })}</div>
           <div style="font-family:${FD};font-size:${q(30, land)}cqw;color:${inkOn(bgs[ti % 4], th.navy, th.cream)};text-transform:uppercase;text-align:center;padding:${q(14, land)}cqw 0 ${q(4, land)}cqw;white-space:nowrap;overflow:hidden;">${esc(labels[ti])}</div>`,
          { bg: bgs[ti % 4], border: th.navy, shadow: th.navy, rot: ti % 2 === 0 ? -1.6 : 1.6, extra: `padding:${q(14, land)}cqw;` }, land)}</div>`);
      }
    }
    return `<div style="position:absolute;left:0;right:0;top:${topC}cqw;height:${hC}cqw;overflow:hidden;">
      <div id="${id}-str${n}" class="${id}-cardrow" style="position:absolute;display:flex;gap:${gapC}cqw;${dir < 0 ? `transform:translateX(${-loop}px);` : ""}">${cards.join("")}</div>
    </div>`;
  };
  const html = `${ck.html}
    <div style="position:absolute;left:${land ? 6 : 5.74}cqw;right:5.74cqw;top:${land ? 6 : 30.6}cqw;">${slm.html}</div>
    ${strip(0, [0, 1], land ? 16.5 : 64.8, land ? 18.5 : 43.5, 1)}
    ${strip(1, [2, 3], land ? 36.5 : 113.9, land ? 18.5 : 43.5, -1)}`;
  const s = [
    camera("pushRight", ctx),
    ...slamAnim(id, T, L, slm.count),
    `tl.fromTo("#${id}-str0",{x:0},{x:${-loop},duration:${cyc},ease:"none",repeat:reps(${r(L * 2)},${cyc})},${T});`,
    `tl.fromTo("#${id}-str1",{x:${-loop}},{x:0,duration:${cyc},ease:"none",repeat:reps(${r(L * 2)},${cyc})},${T});`,
    // the film's per-card bob (desynced by stagger; rotation lives on the inner sticker)
    `tl.to("#${id} .${id}-cd",{y:4,duration:1.8,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},1.8),stagger:0.13},${r(T + 0.3)});`,
    ck.script,
  ];
  return { html, s, clipStyle: `background:${th.cream};` };
}

function stats(scene, ctx) {
  const { id, T, L, theme: th, land } = ctx;
  const Wf = land ? 1920 : 1080, Hf = land ? 1080 : 1920;
  const fgc = inkOn(th.coral, th.navy, th.cream);
  const sts = statsOf(scene, 3);
  const rows = sts.length ? sts : [{ pre: "", v: 100, suf: "%", l: "MADE TO POP", isFloat: false }];
  const cols = [th.yellow, fgc, th.blue];
  const s1 = star(`${id}-st1`, r(Wf * 0.85), land ? 190 : 340, land ? 66 : 100, th.yellow, th.navy, 36, T, L);
  const rb = ribbon(`${id}-rb`, rgba(th.navy, 0.35), Wf, r(Hf * 0.86), land ? 30 : 44, land ? 16 : 24, 1, T, L);
  const slm = slamHtml(id, scene.headline, "Numbers|that pop.", land ? 60 : 124, fgc, th.navy, land, land ? 30 : 88.5, false);
  const size = land ? 100 : 172;
  const odo = []; // scripts collected per digit reel
  const rowHtml = rows.map((st, i) => {
    const col = cols[i % 3];
    const chars = String(st.v).split("");
    const eff = chars.length > 4 ? size * 4 / chars.length : size;
    const fsC = q(eff, land), dhC = r(q(eff * 0.95, land)), dhPx = r(eff * 0.95);
    const atOd = r(T + Math.min(1, L * 0.12) + i * Math.min(0.3, L * 0.06));
    const durOd = r(Math.min(1.6, L * 0.5));
    const cellsFor = () => Array.from({ length: 20 }, (_, k) =>
      `<div style="height:${dhC}cqw;line-height:${dhC}cqw;font-family:${FD};font-size:${fsC}cqw;color:${col};">${k % 10}</div>`).join("");
    const digitHtml = chars.map((ch, j) => {
      if (!/\d/.test(ch)) return `<span style="font-family:${FD};font-size:${fsC}cqw;color:${col};line-height:${dhC}cqw;">${esc(ch)}</span>`;
      const t = +ch;
      odo.push(`tl.fromTo("#${id}-o${i}x${j}",{y:${r(-(t + 10) * dhPx)}},{y:${r(-t * dhPx)},duration:${durOd},ease:"expo.out"},${r(atOd + j * Math.min(0.2, L * 0.07))});`);
      return `<div style="height:${dhC}cqw;overflow:hidden;"><div id="${id}-o${i}x${j}" style="will-change:transform;">${cellsFor()}</div></div>`;
    }).join("");
    return `<div id="${id}-row${i}" style="opacity:0;display:flex;align-items:center;gap:${q(38, land)}cqw;">
      <div style="display:flex;align-items:flex-end;">
        ${st.pre ? `<span style="font-family:${FD};font-size:${fsC}cqw;color:${col};line-height:${dhC}cqw;">${esc(st.pre)}</span>` : ""}
        ${digitHtml}
        ${st.suf ? `<span style="font-family:${FD};font-size:${r(fsC * 0.42)}cqw;color:${col};margin-left:${q(12, land)}cqw;padding-bottom:${r(dhC * 0.08)}cqw;">${esc(st.suf)}</span>` : ""}
      </div>
      <div style="font-family:${FB};font-weight:700;font-size:${q(land ? 28 : 37, land)}cqw;color:${rgba(fgc, 0.92)};max-width:${land ? 26 : 48}cqw;">${esc(st.l || "")}</div>
    </div>`;
  }).join("");
  const html = land
    ? `${sceneSvg(Wf, Hf, s1.html + rb.html)}
       <div style="position:absolute;left:6cqw;top:50%;transform:translateY(-50%);width:30cqw;">${slm.html}</div>
       <div style="position:absolute;left:38cqw;right:6cqw;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:3cqw;">${rowHtml}</div>`
    : `${sceneSvg(Wf, Hf, s1.html + rb.html)}
       <div style="position:absolute;left:5.74cqw;right:5.74cqw;top:31.5cqw;bottom:18cqw;display:flex;flex-direction:column;justify-content:safe center;">
         ${slm.html}
         <div style="margin-top:6.11cqw;display:flex;flex-direction:column;gap:4.82cqw;">${rowHtml}</div>
       </div>`;
  const s = [
    camera("zoomOut", ctx),
    ...slamAnim(id, T, L, slm.count),
    ...rows.map((st, i) => rise(`#${id}-row${i}`, T, L, i * 2 + 3)),
    ...odo,
    s1.script, rb.script,
  ];
  return { html, s, clipStyle: `background:${th.coral};` };
}

function cta(scene, ctx, a) {
  const { id, T, L, theme: th, land, brand, url } = ctx;
  const Wf = land ? 1920 : 1080, Hf = land ? 1080 : 1920;
  const fgc = inkOn(th.blue, th.navy, th.cream);
  const label = fit(String(scene.cta || scene.buttonLabel || "Make yours"), 18);
  // 9:16: the closing block ends at the url with the lower sheet empty — close on
  // the film's own proof points rather than dead ground (see statement above).
  const sup = land ? { html: "", s: [] } : E.supportList(`${id}-sup`, bullets(scene, 3), ctx, {
    flow: true, marginTop: q(44, land), font: q(33, land), fontFamily: FB,
    fg: rgba(fgc, 0.78), dot: th.yellow, max: 3,
  });
  const s1 = star(`${id}-st1`, r(Wf * 0.5), r(Hf * 0.24), land ? 130 : 200, rgba(fgc, 0.14), null, 14, T, L);
  const s2 = star(`${id}-st2`, r(Wf * 0.16), r(Hf * 0.74), land ? 60 : 90, th.yellow, th.navy, -30, T, L);
  const rb = ribbon(`${id}-rb`, rgba(fgc, 0.25), Wf, r(Hf * 0.12), land ? 24 : 34, land ? 12 : 18, 1.4, T, L);
  const ck = checker(`${id}-ck`, land ? 50 : 150, th.yellow, th.blue, { tilt: 2, dir: -1, hPx: land ? 44 : 64, land, T, span: L });
  const slm = slamHtml(id, scene.headline, "Go be|loud.", land ? 92 : 170, fgc, th.yellow, land, land ? 70 : 88.5, true);
  const logoInner = a && a.path
    ? `<img src="${esc(a.path)}" alt="logo" style="width:100%;height:100%;border-radius:${q(10, land)}cqw;object-fit:contain;display:block;">`
    : `<div style="width:100%;height:100%;border-radius:${q(10, land)}cqw;display:flex;align-items:center;justify-content:center;background:${th.yellow};font-family:${FD};font-size:${q(64, land)}cqw;color:${th.navy};">${esc(String(brand).slice(0, 1).toUpperCase())}</div>`;
  const logo = sticker(logoInner, { bg: th.cream, border: th.navy, shadow: th.navy, rot: -4, id: `${id}-lgs`, extra: `width:${q(140, land)}cqw;height:${q(140, land)}cqw;padding:${q(10, land)}cqw;` }, land);
  const btn = sticker(
    `${esc(label)}<svg viewBox="0 0 24 24" fill="none" stroke="${th.navy}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:${q(40, land)}cqw;height:${q(40, land)}cqw;"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>`,
    { bg: th.yellow, border: th.navy, shadow: th.navy, rot: -1.5, id: `${id}-btns`, extra: `display:inline-flex;align-items:center;gap:${q(16, land)}cqw;padding:${q(24, land)}cqw ${q(52, land)}cqw;font-family:${FD};font-size:${q(44, land)}cqw;color:${th.navy};text-transform:uppercase;` }, land);
  const html = `${sceneSvg(Wf, Hf, s1.html + s2.html + rb.html)}${ck.html}
    <div style="position:absolute;left:${land ? 15 : 5.74}cqw;right:${land ? 15 : 5.74}cqw;${land ? "top:50%;transform:translateY(-50%);" : "top:50cqw;"}text-align:center;">
      <div id="${id}-lg" style="opacity:0;display:flex;justify-content:center;margin-bottom:${q(46, land)}cqw;">${logo}</div>
      ${slm.html}
      <div id="${id}-btn" style="opacity:0;display:inline-block;margin-top:${q(56, land)}cqw;">${btn}</div>
      <div id="${id}-url" style="opacity:0;font-family:${FB};font-weight:700;font-size:${q(land ? 30 : 40, land)}cqw;color:${th.yellow};margin-top:${q(46, land)}cqw;">${esc(url)}</div>
      <div style="display:flex;justify-content:center;">${sup.html}</div>
    </div>`;
  const btnAt = r(T + Math.min(1.8, L * 0.3));
  const btnDur = r(Math.min(1, L * 0.18));
  const s = [
    camera("pushDown", ctx),
    rise(`#${id}-lg`, T, L, 0),
    ...slamAnim(id, T, L, slm.count),
    `tl.fromTo("#${id}-btn",{opacity:0,scale:0},{opacity:1,scale:1,duration:${btnDur},ease:"back.out(1.5)"},${btnAt});`,
    `tl.to("#${id}-btns",{scale:1.03,duration:1.2,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(1.2, L - 2))},1.2)},${r(btnAt + btnDur + 0.05)});`,
    rise(`#${id}-url`, T, L, 5),
    ...sup.s,
    `tl.to("#${id}-lgs",{rotation:-2.8,y:4,duration:2.9,ease:"sine.inOut",yoyo:true,repeat:reps(${r(L)},2.9)},${r(T + 1)});`,
    s1.script, s2.script, rb.script, ck.script,
  ];
  return { html, s, clipStyle: `background:${th.blue};` };
}

const SCENES = { hook, statement, feature, montage, stats, cta };

// ---- chrome: the electric-pop world underlayer + brand sticker + rail ---------
function chrome({ theme: th, D, brand, count, land, r: rr, esc: esch }) {
  const Wf = land ? 1920 : 1080, Hf = land ? 1080 : 1920;
  const rb1 = ribbon("hw-rb1", rgba(th.blue, 0.14), Wf, r(Hf * 0.3), land ? 30 : 44, land ? 16 : 24, 0.9, 0, D);
  const rb2 = ribbon("hw-rb2", rgba(th.coral, 0.13), Wf, r(Hf * 0.76), land ? 26 : 40, land ? 14 : 22, -1.1, 0, D);
  const st1 = star("hw-st1", r(Wf * 0.88), r(Hf * 0.12), land ? 60 : 90, rgba(th.yellow, 0.45), null, 22, 0, D);
  const st2 = star("hw-st2", r(Wf * 0.1), r(Hf * 0.86), land ? 44 : 66, rgba(th.blue, 0.3), null, -30, 0, D);
  const ck = checker("hw-ck", land ? 3 : 8, th.navy, th.yellow, { tilt: -2.5, dir: 1, hPx: land ? 44 : 56, land, T: 0, span: D, alpha: 0.4 });
  const chip = sticker(
    `<svg viewBox="0 0 24 24" fill="${th.navy}" stroke="${th.navy}" stroke-width="1.5" stroke-linejoin="round" style="width:${q(26, land)}cqw;height:${q(26, land)}cqw;"><path d="M12 2l2.9 6.9L22 9.2l-5 5.2 1.2 7.6L12 18.6 5.8 22l1.2-7.6-5-5.2 7.1-.3Z"/></svg>
     <span style="font-family:${FD};font-size:${q(26, land)}cqw;color:${th.navy};text-transform:uppercase;letter-spacing:0.02em;">${esch(brand)}</span>`,
    { bg: th.cream, border: th.navy, shadow: rgba(th.navy, 0.9), rot: -3, id: "hw-chip", extra: `display:inline-flex;align-items:center;gap:${q(12, land)}cqw;padding:${q(10, land)}cqw ${q(22, land)}cqw;` }, land);
  const html = `
  <div id="hw-world" class="clip" data-start="0" data-duration="__D__" data-track-index="1" data-layout-allow-occlusion style="opacity:0;background:${th.cream};">
    ${sceneSvg(Wf, Hf, rb1.html + rb2.html + st1.html + st2.html)}
    ${ck.html}
  </div>
  <div id="hw-chrome" class="clip" data-start="0" data-duration="__D__" data-track-index="39" data-layout-allow-occlusion style="opacity:0;background:none;">
    <div style="position:absolute;top:${land ? 3 : 5}cqw;left:${land ? 3.2 : 5.74}cqw;">${chip}</div>
  </div>`;
  const script = `
  tl.fromTo("#hw-world",{opacity:0},{opacity:1,duration:0.5},0);
  tl.fromTo("#hw-chrome",{opacity:0},{opacity:1,duration:0.5},0.2);
  ${rb1.script}
  ${rb2.script}
  ${st1.script}
  ${st2.script}
  ${ck.script}
  tl.fromTo("#hw-chip",{rotation:-3},{rotation:-1.6,y:4,duration:2.9,ease:"sine.inOut",yoyo:true,repeat:reps(${rr(D)},2.9)},0.8);`;
  return { html, script };
}

// No per-scene chrome — the segmented progress rail was removed (it read as a
// slideshow ticking through slides).

function styleBlock(th) {
  return `${th.fontFace}
  #root { font-family:${FB}; }
  #cap-pill { background:${rgba(th.cream, 0.94)}; border:2px solid ${th.navy} !important; border-radius:0.6cqw !important; box-shadow:0.35cqw 0.35cqw 0 ${th.navy}; }
  #cap-text { font-family:${FB}; font-weight:600; color:${th.navy}; }`;
}

const family = {
  theme, styleBlock, chrome, SCENES, TEMPLATE_SCENES, route, mediaSlots, mediaFallback, wantsLogo,
  // Empty slots in this pack render a featureless placeholder card, so a
  // REPEAT of a real screenshot/photo beats leaving one blank.
  recycleMedia: true,
  fallbackType: "statement",
  variants: 1,
  camera: { enabled: false }, // per-beat camera is baked into each scene (the film's own push/zoom kinds)
};

function buildComposition(opts) { return E.buildFilm(family, opts); }
// This pack's media demand + what filled each slot, WITHOUT rendering. Runs the
// exact routing and slot-filling the renderer runs, so the manifest can never
// drift from the film that ships.
function planMedia(opts) { return E.planMedia(family, opts); }

module.exports = { buildComposition, planMedia, TEMPLATE_SCENES };
