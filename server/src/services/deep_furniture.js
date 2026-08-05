// DEEP FURNITURE — the bioluminescent trench from the Claude Design reference.
//
// Reference: templete-design/all-template-handoffs/Deep/src/deep-film.jsx (OceanBG). Our port
// had the trench colours and none of its life: no caustic light shafts, no plankton, no kelp, no
// fish, no bubbles. All geometry below is the reference's own, in the authored 1920x1080 space.
//
// SEEK-SAFETY. The reference recomputes every creature from a live clock. Here each becomes a
// repeating tween on the same curve: caustics sway and breathe, plankton twinkle on a stagger,
// kelp bends from its anchored base, fish traverse linearly and wrap, bubbles rise in speed
// bands. `sine.inOut` + `yoyo` is exactly a sine wave, so amplitude and period carry over.

const { r, hexToRgb } = require("./composer_kit");
const rgba = (h, a) => { const [R, G, B] = hexToRgb(h); return `rgba(${R},${G},${B},${a})`; };
const reps = (span, dur) => Math.max(0, Math.floor(span / Math.max(0.001, dur)) - 1);

// Reference beam geometry: four shafts widening as they fall, screen-blended.
const BEAMS = [{ x: 260, w: 220, s: 0.5 }, { x: 720, w: 300, s: 0.35 }, { x: 1240, w: 260, s: 0.6 }, { x: 1640, w: 200, s: 0.45 }];
const FISH = [{ y: 760, sp: 70, off: 0, s: 0.9, a: 0.5 }, { y: 800, sp: 70, off: 70, s: 0.7, a: 0.45 }, { y: 730, sp: 70, off: 150, s: 0.8, a: 0.4 }];
const KELP = [{ x: 120, h: 340, a: 0.25 }, { x: 210, h: 260, a: 0.2 }, { x: 1780, h: 380, a: 0.25 }, { x: 1850, h: 280, a: 0.18 }];

function oceanBg(th, { cls }) {
  const caustics = BEAMS.map((b, i) =>
    `<polygon class="${cls}-ca${i}" points="${b.x},-40 ${b.x + b.w},-40 ${b.x + b.w * 2.4},1120 ${b.x + b.w * 1.2},1120" fill="${rgba(th.accent, 0.09)}"></polygon>`).join("");
  // Deterministic scatter, seeded exactly as the reference does (i * 53.7 / i * 97.13) so the
  // field is identical run to run — a random one would break golden hashing.
  const plankton = Array.from({ length: 30 }, (_, i) => {
    const seed = i * 53.7, x = seed % 1920, y = (seed * 7) % 1080;
    return `<circle class="${cls}-pk" cx="${r(x)}" cy="${r(y)}" r="${i % 4 === 0 ? 3 : 1.8}" fill="${i % 5 === 0 ? th.glow2 : th.accent}" opacity="0.25"></circle>`;
  }).join("");
  // Kelp bends from the seabed, so the sway is a rotation anchored at its base — the reference
  // recomputes the whole polyline per frame, which a seeked timeline cannot do.
  const kelp = KELP.map((k, i) => {
    const pts = Array.from({ length: 9 }, (_, j) => { const t = j / 8; return `${r(k.x)},${r(1080 - t * k.h)}`; }).join(" ");
    return `<polyline class="${cls}-kp${i}" points="${pts}" fill="none" stroke="${rgba(i === 1 ? th.glow2 : th.accent, k.a)}" stroke-width="14" stroke-linecap="round" opacity="0.7"></polyline>`;
  }).join("");
  const fish = FISH.map((f, i) =>
    `<g class="${cls}-fs${i}"><g transform="translate(-150 ${f.y}) scale(${f.s})">
      <ellipse cx="0" cy="0" rx="26" ry="13" fill="${rgba(th.accent, f.a)}"></ellipse>
      <path d="M-24 0 L-44 -12 L-44 12 Z" fill="${rgba(th.accent, f.a)}"></path>
      <circle cx="14" cy="-3" r="2.5" fill="#02101A"></circle>
    </g></g>`).join("");
  // Bubbles rise and wrap. Six speed bands, drawn a full stage-height tall so the column is
  // never empty at a seek — the same lesson the matrix rain cost a render pass to learn.
  const bubbles = Array.from({ length: 40 }, (_, i) => {
    const seed = i * 97.13, x = seed % 1920, rad = 3 + (seed % 5) + (i % 3);
    const y = (seed * 3) % 1080;
    return `<circle class="${cls}-bb${i % 6}" cx="${r(x)}" cy="${r(y)}" r="${r(rad)}" fill="none" stroke="${rgba(th.accent, 0.35)}" stroke-width="1.5"></circle>`;
  }).join("");
  return `<div style="position:absolute;inset:0;overflow:hidden;background:linear-gradient(180deg, ${th.bgTop} 0%, ${th.bgMid} 50%, ${th.bgDeep} 100%);">
    <svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none" style="position:absolute;inset:0;overflow:visible;">
      <g style="mix-blend-mode:screen;">${caustics}</g>
      ${plankton}${kelp}${fish}${bubbles}
    </svg>
  </div>`;
}

const oceanTweens = (ctx, { cls }) => {
  const t = [];
  BEAMS.forEach((b, i) => {
    const dur = Math.PI / b.s;                        // reference: sin(clock * b.s)
    t.push(`tl.fromTo(".${cls}-ca${i}",{x:-40},{x:40,duration:${r(dur)},ease:"sine.inOut",repeat:${reps(ctx.L, dur)},yoyo:true},${r(ctx.T)});`);
    t.push(`tl.fromTo(".${cls}-ca${i}",{opacity:0.6},{opacity:1,duration:${r(dur / 1.3)},ease:"sine.inOut",repeat:${reps(ctx.L, dur / 1.3)},yoyo:true},${r(ctx.T)});`);
  });
  t.push(`tl.fromTo(".${cls}-pk",{opacity:0.18},{opacity:0.6,duration:2.09,ease:"sine.inOut",repeat:${reps(ctx.L, 2.09)},yoyo:true,stagger:0.07},${r(ctx.T)});`);
  KELP.forEach((k, i) => {
    const dur = 2.62;
    t.push(`tl.fromTo(".${cls}-kp${i}",{rotation:${-4 - i}},{rotation:${4 + i},duration:${r(dur + i * 0.3)},ease:"sine.inOut",repeat:${reps(ctx.L, dur + i * 0.3)},yoyo:true,svgOrigin:"${k.x} 1080"},${r(ctx.T)});`);
  });
  FISH.forEach((f, i) => {
    const dur = (1920 + 300) / f.sp;
    t.push(`tl.fromTo(".${cls}-fs${i}",{x:${r(f.off)}},{x:2220,duration:${r(dur)},ease:"none",repeat:${reps(ctx.L, dur)}},${r(ctx.T)});`);
  });
  for (let b = 0; b < 6; b++) {
    const dur = 1200 / (60 + b * 18);
    t.push(`tl.fromTo(".${cls}-bb${b}",{y:0},{y:-1200,duration:${r(dur)},ease:"none",repeat:${reps(ctx.L, dur)}},${r(ctx.T)});`);
  }
  return t;
};

module.exports = { oceanBg, oceanTweens };
