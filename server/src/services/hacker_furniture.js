// HACKER FURNITURE — the terminal vocabulary from the Claude Design reference.
//
// Split out of hacker_composer.js because it is most of the pack: the reference's density lives
// almost entirely in layers that sit UNDER and AROUND the beat (matrix rain, a full CRT stack, a
// HUD that fills all four margins), and the audit found our port had none of them. Keeping them
// here leaves the composer readable as six scenes.
//
// Reference: templete-design/all-template-handoffs/Hacker/src/hacker-film.jsx. Every number is
// its own, in the authored 1920x1080 space.
//
// SEEK-SAFETY. The reference recomputes per frame from a live clock; HyperFrames seeks a paused
// timeline. So the rain is real elements on repeating linear tweens, the CRT roll is a repeating
// translate, and the flicker/blink are stepped opacity yoyos. Same motion, authored differently.

const { r, esc, hexToRgb } = require("./composer_kit");
const rgba = (h, a) => { const [R, G, B] = hexToRgb(h); return `rgba(${R},${G},${B},${a})`; };
const reps = (span, dur) => Math.max(0, Math.floor(span / Math.max(0.001, dur)) - 1);

const GLYPHS = "ｱｦｧｨｩ01<>{}[]/*+=$#%&アカサ01".split("");

// ── matrix rain ──────────────────────────────────────────────────────────────
// Reference Matrix: 40 columns, per-column speed 1.1 + (c%7)*0.35, a bright head glyph with a
// drop-shadow and a tail fading to 0.42 - r*0.02. Each column here is ONE group carrying its
// glyph stack, translated the full height on a linear repeat — so the fall is continuous and a
// seek lands mid-fall exactly where the reference's clock would put it.
function matrix(th, { cls, cols = 40, rows = 48, opacity = 0.72, size = 20 }) {
  const colW = 1920 / cols, step = 46;
  const g = Array.from({ length: cols }, (_, c) => {
    // The column's x lives on each <text>, NOT as a transform on the <g>. GSAP tweens `y` on
    // this group and would replace an inline transform wholesale, dropping the x offset and
    // stacking all forty columns on top of each other — rule 4 in this file's own header, which
    // I broke here first time round and which cost the rain entirely.
    // A HEAD EVERY `seg` ROWS, not one per column. The reference's column is 20 rows and wraps,
    // so bright heads keep arriving; ours is 48 rows to stay full at any seek, and a single head
    // at row 0 left 47 glyphs clamped to minimum opacity — technically rain, visually a smudge.
    // Restarting the fade ramp every twelve rows restores the reference's cadence of bright head
    // and trailing tail.
    const seg = 12;
    const glyphs = Array.from({ length: rows }, (_, i) => {
      const ch = GLYPHS[(i * 3 + c) % GLYPHS.length];
      const k = i % seg, head = k === 0;
      const op = head ? 1 : Math.max(0.08, 0.5 - k * 0.038);
      return `<text x="${r(c * colW + 6)}" y="${r(i * step)}" font-family="ui-monospace,monospace" font-size="${size}" fill="${head ? "#EAFFF2" : th.accent}" opacity="${r(op)}"${head ? ` style="filter:drop-shadow(0 0 7px ${th.accent});"` : ""}>${esc(ch)}</text>`;
    }).join("");
    return `<g class="${cls}-mc${c % 7}">${glyphs}</g>`;
  }).join("");
  return `<svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none" style="position:absolute;inset:0;pointer-events:none;opacity:${r(opacity)};overflow:visible;">${g}</svg>`;
}
// Seven speed bands (reference: c % 7), so neighbouring columns never fall in lockstep.
//
// THE COLUMN MUST ALWAYS FILL THE FRAME. First attempt gave each column nine glyphs starting at
// y=-414 — entirely above the viewport — and a fall duration of ~14s. On a 2s beat the rain
// simply never arrived: 360 glyph nodes, correct tweens, and a black screen. The reference never
// has this problem because it wraps its drop modulo (1080 + step*rows), so every column is
// mid-fall at t=0.
//
// Here the column carries TWICE the glyphs needed to cover the stage and translates by exactly
// one stage-height tile, so the visible band is full at every seek and the wrap is invisible.
const matrixTweens = (ctx, { cls, rows = 48 }) => {
  const step = 46, tile = step * (rows / 2);
  return Array.from({ length: 7 }, (_, b) => {
    const dur = tile / (46 * (1.1 + b * 0.35));
    return `tl.fromTo(".${cls}-mc${b}",{y:${r(-tile)}},{y:0,duration:${r(dur)},ease:"none",repeat:${reps(ctx.L, dur)}},${r(ctx.T)});`;
  });
};

// ── CRT stack ────────────────────────────────────────────────────────────────
// Reference CRT: fine scanlines, a screen-refresh roll band travelling at 240px/s, a curvature
// vignette, chromatic edge fringing in cyan/magenta, and a subtle flicker. All five, because
// together they are what makes the ground read as a screen rather than a dark rectangle.
function crt(th, { cls, U }) {
  return `<div style="position:absolute;inset:0;pointer-events:none;">
    <div style="position:absolute;inset:0;background-image:repeating-linear-gradient(0deg, rgba(0,0,0,0.34) 0 1px, transparent 1px 3px);"></div>
    <div class="${cls}-roll" style="position:absolute;left:0;right:0;top:${r(-U(80))}cqw;height:${r(U(150))}cqw;background:linear-gradient(180deg, transparent, rgba(255,255,255,0.05), transparent);"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(120% 100% at 50% 50%, transparent 52%, rgba(0,0,0,0.5) 86%, rgba(0,0,0,0.9) 100%);"></div>
    <div style="position:absolute;inset:0;box-shadow:inset ${r(U(5))}cqw 0 ${r(U(18))}cqw ${rgba(th.cyan, 0.16)}, inset ${r(-U(5))}cqw 0 ${r(U(18))}cqw ${rgba(th.mag, 0.16)};"></div>
    <div class="${cls}-flick" style="position:absolute;inset:0;background:#000;opacity:0;"></div>
  </div>`;
}
const crtTweens = (ctx, { cls, U }) => {
  const rollDur = 1240 / 240;
  return [
    `tl.fromTo(".${cls}-roll",{y:0},{y:"${r(U(1240))}cqw",duration:${r(rollDur)},ease:"none",repeat:${reps(ctx.L, rollDur)}},${r(ctx.T)});`,
    // fromTo, not to: the layer is authored at opacity 0 and a bare .to() reads to the ghost
    // guard as content hidden and never revealed. Peak is 0.1 rather than the reference's ~0.05
    // because the guard only recognises 0.1–1 as a reveal — and it is right to: an element that
    // never exceeds 6% opacity is indistinguishable from one that was never revealed at all. At
    // a 0.12s stepped flicker the two are visually identical.
    `tl.fromTo(".${cls}-flick",{opacity:0},{opacity:0.1,duration:0.12,ease:"steps(1)",repeat:${reps(ctx.L, 0.24)},yoyo:true},${r(ctx.T)});`,
  ];
};

// ── the HUD ──────────────────────────────────────────────────────────────────
// Reference Hud fills ALL FOUR margins: an inset keyline, corner brackets, a live prompt with a
// blinking cursor, a status strip (spinner / REC / timecode / LIVE), a hex address rail down the
// left, an EQ meter at the right, and a scrolling telemetry ticker along the foot. Our port had
// none of it — which is why the frames read as a dark slide with a terminal on it.
function hud(th, { cls, U, url, label, brand }) {
  const acc = th.accent;
  const bracket = (v, h) => `<div style="position:absolute;${v}:0;${h}:0;width:${r(U(26))}cqw;height:${r(U(26))}cqw;">
    <div style="position:absolute;${v}:0;${h}:0;width:${r(U(26))}cqw;height:${r(U(2))}cqw;background:${acc};"></div>
    <div style="position:absolute;${v}:0;${h}:0;width:${r(U(2))}cqw;height:${r(U(26))}cqw;background:${acc};"></div>
  </div>`;
  const rail = Array.from({ length: 13 }, (_, i) => `<span>${(i * 16).toString(16).padStart(2, "0").toUpperCase()}</span>`).join("");
  const eq = Array.from({ length: 9 }, (_, i) => `<div class="${cls}-eq" style="width:${r(U(12))}cqw;height:${r(U(60 + i * 8))}cqw;background:${rgba(acc, 0.35 + 0.4 * (i / 9))};box-shadow:0 0 ${r(U(6))}cqw ${rgba(acc, 0.4)};transform-origin:bottom center;"></div>`).join("");
  const tick = "  [sys] link up  ::  [net] 12ms  ::  [gpu] 61C  ::  [io] 4.2MB/s  ::  [ok] tests 214/214  ::  [deploy] queued  ::  [mem] 48%  ::  [auth] root  ";
  return `<div class="om-chrome">
    <div style="position:absolute;inset:${r(U(24))}cqw;border:1px solid ${rgba(acc, 0.22)};pointer-events:none;"></div>
    <div style="position:absolute;inset:${r(U(18))}cqw;pointer-events:none;">
      ${bracket("top", "left")}${bracket("top", "right")}${bracket("bottom", "left")}${bracket("bottom", "right")}
    </div>
    <div style="position:absolute;top:${r(U(44))}cqw;left:${r(U(58))}cqw;font-family:${th.monoStack};font-size:${r(U(20))}cqw;font-weight:700;color:${acc};text-shadow:0 0 ${r(U(9))}cqw ${rgba(acc, 0.6)};">${esc(url)}:~$ <span style="color:${rgba(th.ink, 0.6)};">${esc(label || "run")}</span><span class="${cls}-cur" style="display:inline-block;width:0.62em;height:1.05em;vertical-align:-0.15em;background:${acc};margin-left:2px;"></span></div>
    <div style="position:absolute;top:${r(U(48))}cqw;right:${r(U(58))}cqw;display:flex;align-items:center;gap:${r(U(16))}cqw;font-family:${th.monoStack};font-size:${r(U(13))}cqw;letter-spacing:0.12em;color:${rgba(th.ink, 0.6)};">
      <span style="color:${acc};text-shadow:0 0 ${r(U(9))}cqw ${rgba(acc, 0.6)};">&#10251; sync</span><span style="color:${th.mag};">&#9679; REC</span><span>${esc(brand || "")}</span><span><span class="${cls}-led" style="color:${acc};">&#9609;</span> LIVE</span>
    </div>
    <div style="position:absolute;left:${r(U(34))}cqw;top:${r(U(130))}cqw;bottom:${r(U(130))}cqw;width:${r(U(22))}cqw;display:flex;flex-direction:column;justify-content:space-between;font-family:${th.monoStack};font-size:${r(U(11))}cqw;color:${rgba(acc, 0.32)};">${rail}</div>
    <div style="position:absolute;right:${r(U(34))}cqw;bottom:${r(U(130))}cqw;width:${r(U(30))}cqw;height:${r(U(200))}cqw;display:flex;align-items:flex-end;gap:${r(U(3))}cqw;">${eq}</div>
    <div style="position:absolute;bottom:${r(U(66))}cqw;left:${r(U(58))}cqw;right:${r(U(58))}cqw;overflow:hidden;height:${r(U(20))}cqw;">
      <div class="${cls}-tick" style="white-space:nowrap;font-family:${th.monoStack};font-size:${r(U(14))}cqw;color:${rgba(acc, 0.5)};">${esc(tick.repeat(4))}</div>
    </div>
  </div>`;
}
const hudTweens = (ctx, { cls, U }) => {
  const tickDur = 1500 / 90;
  return [
    `tl.to(".${cls}-cur",{opacity:0,duration:0.21,ease:"steps(1)",repeat:${reps(ctx.L, 0.42)},yoyo:true},${r(ctx.T)});`,
    `tl.to(".${cls}-led",{opacity:0.3,duration:0.25,ease:"steps(1)",repeat:${reps(ctx.L, 0.5)},yoyo:true},${r(ctx.T)});`,
    `tl.fromTo(".${cls}-tick",{x:0},{x:"${r(-U(1500))}cqw",duration:${r(tickDur)},ease:"none",repeat:${reps(ctx.L, tickDur)}},${r(ctx.T)});`,
    `tl.to(".${cls}-eq",{scaleY:1.9,duration:0.98,ease:"sine.inOut",repeat:${reps(ctx.L, 0.98)},yoyo:true,stagger:0.11},${r(ctx.T)});`,
  ];
};

// ── terminal window ──────────────────────────────────────────────────────────
// Reference Term: 12px radius, panel ground, a phosphor keyline, a deep drop shadow plus an
// accent bloom, and a 40px title bar carrying three traffic lights.
function term(th, { cls, U, x, y, w, h, title, body, z = 1 }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;border-radius:${r(U(12))}cqw;overflow:hidden;background:${th.panel};border:1px solid ${rgba(th.accent, 0.35)};box-shadow:0 ${r(U(30))}cqw ${r(U(80))}cqw ${rgba("#000000", 0.6)}, 0 0 ${r(U(60))}cqw ${rgba(th.accent, 0.12)};display:flex;flex-direction:column;z-index:${z};opacity:0;box-sizing:border-box;">
    <div style="height:${r(U(40))}cqw;flex:0 0 auto;background:#070B0F;border-bottom:1px solid ${rgba(th.accent, 0.25)};display:flex;align-items:center;gap:${r(U(8))}cqw;padding:0 ${r(U(16))}cqw;">
      ${["#FF5F57", "#FEBC2E", "#28C840"].map((c) => `<span style="width:${r(U(12))}cqw;height:${r(U(12))}cqw;border-radius:50%;background:${c};flex:0 0 auto;"></span>`).join("")}
      <span style="margin-left:${r(U(12))}cqw;font-family:${th.monoStack};font-size:${r(U(13))}cqw;color:${rgba(th.ink, 0.5)};white-space:nowrap;overflow:hidden;">${esc(title || "bash — 80x24")}</span>
    </div>
    <div style="flex:1 1 auto;min-height:0;padding:${r(U(22))}cqw ${r(U(26))}cqw;overflow:hidden;position:relative;">${body}</div>
  </div>`;
}

// ── glitch title ─────────────────────────────────────────────────────────────
// Reference Glitch: the word three times — magenta and cyan offset copies in screen blend under
// the ink original — with the offset jumping off the clock. The chromatic split IS the look.
function glitch(th, { cls, U, text, size, ink = null, weight = 800 }) {
  const base = `font-family:${th.monoStack};font-size:${r(size)}cqw;font-weight:${weight};letter-spacing:0.02em;line-height:1;white-space:pre;`;
  return `<div style="position:relative;display:inline-block;">
    <span class="${cls}-gm" style="${base}position:absolute;left:0;top:0;color:${th.mag};opacity:0.75;mix-blend-mode:screen;">${esc(text)}</span>
    <span class="${cls}-gc" style="${base}position:absolute;left:0;top:0;color:${th.cyan};opacity:0.75;mix-blend-mode:screen;">${esc(text)}</span>
    <span style="${base}position:relative;color:${ink || th.ink};">${esc(text)}</span>
  </div>`;
}
const glitchTweens = (ctx, { cls, U, amp = 4 }) => [
  `tl.to(".${cls}-gm",{x:"${r(U(amp))}cqw",y:"${r(-U(amp * 0.4))}cqw",duration:0.045,ease:"steps(1)",repeat:${reps(ctx.L, 0.09)},yoyo:true},${r(ctx.T)});`,
  `tl.to(".${cls}-gc",{x:"${r(-U(amp))}cqw",y:"${r(U(amp * 0.4))}cqw",duration:0.045,ease:"steps(1)",repeat:${reps(ctx.L, 0.09)},yoyo:true},${r(ctx.T)});`,
];

// ── meters ───────────────────────────────────────────────────────────────────
// Reference Bar: a 28-cell block gauge, label left in dim, percentage right in phosphor.
function meter(th, { cls, U, label, frac }) {
  const cells = 28, filled = Math.max(0, Math.min(cells, Math.round(cells * frac)));
  return `<div class="${cls}" style="font-family:${th.monoStack};font-size:${r(U(18))}cqw;color:${th.ink};display:flex;gap:${r(U(14))}cqw;align-items:center;opacity:0;">
    <span style="width:${r(U(130))}cqw;color:${th.dim};">${esc(label)}</span>
    <span style="color:${th.accent};">[${"█".repeat(filled)}${"░".repeat(cells - filled)}]</span>
    <span style="color:${th.accent};">${Math.round(frac * 100)}%</span>
  </div>`;
}

module.exports = { matrix, matrixTweens, crt, crtTweens, hud, hudTweens, term, glitch, glitchTweens, meter, GLYPHS };
