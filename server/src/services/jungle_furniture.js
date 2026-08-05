// JUNGLE FURNITURE — the rainforest from the Claude Design reference.
//
// Reference: templete-design/all-template-handoffs/Jungle/src/jungle-film.jsx (JungleBG and its
// cast). Twenty trigonometric calls drive it and our port carried none of them: no light shafts,
// no parallax canopy, no vines, no fronds, no fireflies, no butterflies. Every path below is the
// reference's own, in its authored 1920x1080 space.
//
// SEEK-SAFETY. Sways that the reference recomputes per frame become rotation tweens anchored
// where the thing is actually attached — a vine at its hanging point, a frond at its base. That
// is both seek-safe and a truer mechanism than displacing every vertex.

const { r, hexToRgb } = require("./composer_kit");
const rgba = (h, a) => { const [R, G, B] = hexToRgb(h); return `rgba(${R},${G},${B},${a})`; };
const reps = (span, dur) => Math.max(0, Math.floor(span / Math.max(0.001, dur)) - 1);

const SHAFTS = [{ x: 300, w: 150, o: 0.28 }, { x: 820, w: 190, o: 0.22 }, { x: 1380, w: 160, o: 0.26 }];
const VINES = [{ x: 140, phase: 0, len: 360, c: "c2" }, { x: 360, phase: 1.3, len: 280, c: "c1" },
  { x: 1600, phase: 0.6, len: 340, c: "c2" }, { x: 1820, phase: 2, len: 300, c: "c1" }];
const FIREFLIES = [[520, 470], [1500, 520], [900, 300]];
const BUTTERFLIES = [{ x: 1300, y: 640, k: "pop" }, { x: 640, y: 700, k: "accent" }];

const leaf = (x, y, s, rot, color) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 0 Q 40 -34 92 0 Q 40 34 0 0 Z" fill="${color}"></path><path d="M6 0 Q 46 0 86 0" stroke="${rgba("#000000", 0.16)}" stroke-width="2.5" fill="none"></path></g>`;

// Reference Frond: a spine with nine leaflet pairs. It sways +-4deg about its base, so the whole
// group rotates from the anchor rather than every leaflet being recomputed.
const frond = (cls, x, y, s, rot, color) => {
  const leaflets = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, ly = -20 - t * 200, lx = Math.sin(t * 3) * 4, tip = 34 - t * 10;
    return `<path d="M${r(lx)} ${r(ly)} q -44 -14 -70 -${r(tip)}" stroke="${color}" stroke-width="7" fill="none" stroke-linecap="round"></path>
      <path d="M${r(lx)} ${r(ly)} q 44 -14 70 -${r(tip)}" stroke="${color}" stroke-width="7" fill="none" stroke-linecap="round"></path>`;
  }).join("");
  return `<g transform="translate(${x} ${y})"><g class="${cls}" transform="rotate(${rot}) scale(${s})">
    <path d="M0 0 Q 20 -110 0 -230" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round"></path>${leaflets}
  </g></g>`;
};

// Reference Vine: a hanging polyline with three pods. It sways from the canopy, so the group
// rotates about its top — the reference displaces each point by `sway * t`, which is the same
// shape a rotation about the anchor produces.
const vine = (cls, v, color) => {
  const pts = Array.from({ length: 9 }, (_, i) => { const t = i / 8; return `${r(v.x + Math.sin(t * 3 + v.phase) * 16)},${r(t * v.len)}`; }).join(" ");
  const pods = [0.4, 0.7, 1].map((t) =>
    `<ellipse cx="${r(v.x + Math.sin(t * 3 + v.phase) * 16)}" cy="${r(t * v.len)}" rx="16" ry="11" fill="${color}"></ellipse>`).join("");
  return `<g class="${cls}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"></polyline>${pods}</g>`;
};

function jungleBg(th, { cls }) {
  const shafts = SHAFTS.map((s) =>
    `<polygon points="${s.x},-20 ${s.x + s.w},-20 ${s.x + s.w * 2.2},1120 ${s.x + s.w * 1.1},1120" fill="${rgba("#FFF3C0", s.o)}" style="mix-blend-mode:screen;"></polygon>`).join("");
  const far = [0, 360, 720, 1080, 1440, 1800, 2160].map((bx, i) =>
    `<circle cx="${bx}" cy="${90 + (i % 3) * 30}" r="${150 + (i % 3) * 30}" fill="${th.c3}" opacity="0.8"></circle>`).join("");
  const mid = [120, 560, 1040, 1560, 2000].map((bx) =>
    `<g><rect x="${bx - 26}" y="380" width="52" height="700" rx="16" fill="${th.c2}"></rect><circle cx="${bx}" cy="360" r="130" fill="${th.c1}" opacity="0.9"></circle></g>`).join("");
  const vines = VINES.map((v, i) => vine(`${cls}-vn${i}`, v, rgba(th[v.c], 1))).join("");
  const fireflies = FIREFLIES.map(([x, y], i) =>
    `<circle class="${cls}-ff" cx="${x}" cy="${y}" r="5" fill="${th.accent}" opacity="0.4" style="filter:drop-shadow(0 0 6px ${th.accent});"></circle>`).join("");
  const flutter = BUTTERFLIES.map((b, i) =>
    `<g class="${cls}-bf${i}" transform="translate(${b.x} ${b.y})"><g class="${cls}-bw${i}"><ellipse cx="-9" cy="0" rx="9" ry="13" fill="${th[b.k]}"></ellipse><ellipse cx="9" cy="0" rx="9" ry="13" fill="${th[b.k]}"></ellipse></g><rect x="-1.5" y="-10" width="3" height="20" rx="1.5" fill="#2A1A0E"></rect></g>`).join("");
  return `<div style="position:absolute;inset:0;overflow:hidden;background:linear-gradient(180deg, ${th.skyA} 0%, ${th.skyB} 100%);">
    <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none" style="position:absolute;inset:0;overflow:visible;">
      ${shafts}
      <g class="${cls}-far">${far}</g>
      <rect x="0" y="0" width="1920" height="150" fill="${th.c4}"></rect>
      <g class="${cls}-mid">${mid}</g>
      <path d="M0 900 Q 480 860 960 900 T 1920 900 V1080 H0 Z" fill="${th.c3}"></path>
      <path d="M0 980 Q 480 950 960 980 T 1920 980 V1080 H0 Z" fill="${th.c4}"></path>
      ${vines}
      ${frond(`${cls}-fr0`, 40, 1080, 1.4, -12, th.c1)}
      ${frond(`${cls}-fr1`, 1900, 1080, 1.5, 12, th.c1)}
      ${leaf(70, 210, 1.3, 30, th.c1)}${leaf(1780, 250, 1.4, 150, th.c1)}
      ${fireflies}${flutter}
    </svg>
  </div>`;
}

const jungleTweens = (ctx, { cls }) => {
  const t = [
    // Parallax: the far canopy creeps, the mid trees move faster. The reference derives both
    // from a `drift` the camera supplies; here they are slow continuous scrolls.
    `tl.fromTo(".${cls}-far",{x:0},{x:-500,duration:${r(60)},ease:"none",repeat:${reps(ctx.L, 60)}},${r(ctx.T)});`,
    `tl.fromTo(".${cls}-mid",{x:0},{x:-700,duration:${r(38)},ease:"none",repeat:${reps(ctx.L, 38)}},${r(ctx.T)});`,
    `tl.fromTo(".${cls}-ff",{opacity:0.25},{opacity:1,duration:1.05,ease:"sine.inOut",repeat:${reps(ctx.L, 1.05)},yoyo:true,stagger:0.37},${r(ctx.T)});`,
  ];
  VINES.forEach((v, i) => {
    const dur = Math.PI / 0.8;                       // reference: sin(clock * 0.8)
    t.push(`tl.fromTo(".${cls}-vn${i}",{rotation:-3.5},{rotation:3.5,duration:${r(dur)},ease:"sine.inOut",repeat:${reps(ctx.L, dur)},yoyo:true,svgOrigin:"${v.x} 0"},${r(ctx.T + v.phase * 0.3)});`);
  });
  [0, 1].forEach((i) => {
    const dur = Math.PI / 1.1;                       // reference: sin(clock * 1.1)
    const x = i === 0 ? 40 : 1900;
    t.push(`tl.fromTo(".${cls}-fr${i}",{rotation:${i === 0 ? -16 : 8}},{rotation:${i === 0 ? -8 : 16},duration:${r(dur)},ease:"sine.inOut",repeat:${reps(ctx.L, dur)},yoyo:true,svgOrigin:"0 0"},${r(ctx.T + i * 0.6)});`);
  });
  BUTTERFLIES.forEach((b, i) => {
    const drift = Math.PI / 0.9, wing = Math.PI / 6;
    t.push(`tl.fromTo(".${cls}-bf${i}",{x:-60,y:-34},{x:60,y:34,duration:${r(drift)},ease:"sine.inOut",repeat:${reps(ctx.L, drift)},yoyo:true},${r(ctx.T + i * 0.8)});`);
    t.push(`tl.fromTo(".${cls}-bw${i}",{scaleX:0.5},{scaleX:1,duration:${r(wing)},ease:"sine.inOut",repeat:${reps(ctx.L, wing)},yoyo:true},${r(ctx.T)});`);
  });
  return t;
};

module.exports = { jungleBg, jungleTweens };
