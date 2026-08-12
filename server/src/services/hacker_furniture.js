// HACKER FURNITURE — the terminal vocabulary from the Claude Design reference.
//
// Split out of hacker_composer.js because it is most of the pack: the reference's density lives
// almost entirely in layers that sit UNDER and AROUND the beat (matrix rain, a full CRT stack, a
// HUD that fills all four margins), plus four devices the beats are BUILT from (a self-typing
// code block, a terminal window, a glitched title, a block gauge).
//
// Reference: old-templete/all-template-handoffs/Hacker/src/hacker-film.jsx. Every number is
// its own, in the authored 1920x1080 space.
//
// SEEK-SAFETY. The reference recomputes per frame from a live clock; HyperFrames seeks a paused
// timeline. So the rain is real elements on repeating linear tweens, the CRT roll is a repeating
// translate, the blinks and the flicker are stepped opacity yoyos, and the self-typing code is a
// per-character opacity stagger with a cursor that hops the monospace grid in steps. Same motion,
// authored differently.
//
// WIRING (10 Aug 2026). `glitch`, `term` and `meter` were written here, exported, and never
// imported — the dead-export failure class, and it cost this pack its two most recognisable
// devices. Everything in this module now has a caller in hacker_composer.js; `test-dead-exports`
// is the guard that keeps it that way.

const { r, esc, hexToRgb } = require("./composer_kit");
const rgba = (h, a) => { const [R, G, B] = hexToRgb(h); return `rgba(${R},${G},${B},${a})`; };
// HOW MANY REPEATS KEEP A LOOP ALIVE FOR `span` SECONDS. GSAP plays a tween 1 + `repeat` times, so
// the answer is ceil(span / duration) - 1 — and for a YOYO the duration is the HALF period, which
// is where the shared `reps(span, cycle)` helper goes wrong: it is passed the full cycle and
// returns cycle-many repeats of a half-period tween, i.e. exactly half the coverage. The HUD
// cursor was blinking for 1.7s of a 4s beat and then holding whichever state it stopped on, so the
// prompt cursor simply vanished for the back half of most scenes (visible in a frame grab of the
// closing beat). Every loop in this file now counts against its own tween duration.
const reps = (span, dur) => Math.max(0, Math.ceil(span / Math.max(0.001, dur)) - 1);
// Timeline positions and durations are rounded to 2dp like every other emitted number, but a
// PER-CHARACTER stagger is often 0.01-0.02s: rounding that to 2dp is a 20% error on a 200-glyph
// block, which is the difference between a line finishing inside its beat and running past it.
const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

// THE MEDIUM'S OWN COLOURS, not the client's. A shadow-mask CRT splits the beam into cyan and
// magenta at the edges of the tube, and an RGB channel split does the same to a title. Both are
// artefacts of the SIGNAL, so they are literal constants here: derived from the accent they
// collapse into it (a green brand makes the "cyan" fringe a yellow-green and the aberration
// simply disappears) and a warm brand puts both fringes in the same quadrant, which reads as a
// smudge rather than as glass. Same reason the traffic lights below are fixed macOS hues.
const CRT_CYAN = "#35E0FF", CRT_MAG = "#FF4D9D";
const TRAFFIC = ["#FF5F57", "#FEBC2E", "#28C840"];
const HEAD_GLYPH = "#EAFFF2";

const GLYPHS = "ｱｦｧｨｩ01<>{}[]/*+=$#%&アカサ01".split("");
// JetBrains Mono's advance, in em. Every monospace measurement in this file (the typing cursor's
// hop, the gutter, the gauge cells) is this number — it is K.ADVANCE.mono, measured off renders.
const MONO_ADV = 0.6;

// ── matrix rain ──────────────────────────────────────────────────────────────
// Reference Matrix (hacker-film.jsx:38-53): 40 columns, per-column speed 1.1 + (c%7)*0.35, a
// bright head glyph with a drop-shadow, a tail fading to 0.42 - r*0.02, and — the part that makes
// it rain rather than march — a PER-COLUMN PHASE `c * 131` inside the drop modulo, so no two
// columns are at the same point in their fall.
//
// The port had seven speed bands and nothing else, so columns 0/7/14/21/28/35 shared one tween AND
// one starting offset: forty independent falls collapsed into seven rigid horizontal rows of
// bright heads descending in lockstep. The fix does NOT need forty tweens. A tween only supplies
// the column's VELOCITY; its PHASE can live in the authored y of its glyphs, where it costs
// nothing. So the seven band tweens stay and every column carries `(c * 131) % TILE` of offset.
//
// THE LOOP TILE IS ONE HEAD-TO-HEAD PERIOD, NOT THE WHOLE STACK. A head lands every `SEG` rows, so
// translating by exactly SEG*STEP puts the pattern back on itself and the wrap is invisible — and
// it leaves the rest of the stack as slack for the phase offset. With TILE = the whole stack (what
// this file did before) there is no slack, and a phased column tears a hole at the top of frame.
const STEP = 46;          // row pitch, px in the 1920x1080 space
const SEG = 12;           // rows between bright heads — the reference's head cadence
const TILE = STEP * SEG;  // 552px: one loop, one pattern period
const ROWS = 48;          // 2208px of glyphs — covers 1080 + TILE + the largest phase offset
function matrix(th, { cls, cols = 40, opacity = 0.72, size = 20 }) {
  const colW = 1920 / cols;
  const g = Array.from({ length: cols }, (_, c) => {
    // The column's x lives on each <text>, NOT as a transform on the <g>. GSAP tweens `y` on
    // this group and would replace an inline transform wholesale, dropping the x offset and
    // stacking all forty columns on top of each other.
    const phase = (c * 131) % TILE;
    const glyphs = Array.from({ length: ROWS }, (_, i) => {
      const ch = GLYPHS[(i * 3 + c) % GLYPHS.length];
      const k = i % SEG, head = k === 0;
      const op = head ? 1 : Math.max(0.08, 0.5 - k * 0.038);
      // font-family, font-size and the tail fill live on the <svg>/<g> and are INHERITED. Six
      // scenes x 40 columns x 48 rows is 11,520 glyph nodes, and repeating those three attributes
      // on every one of them was half a megabyte of identical markup in the emitted document.
      return `<text x="${r(c * colW + 6)}" y="${r(i * STEP - phase)}" opacity="${r(op)}"${head ? ` fill="${HEAD_GLYPH}" style="filter:drop-shadow(0 0 7px ${th.accent});"` : ""}>${esc(ch)}</text>`;
    }).join("");
    return `<g class="${cls}-mc${c % 7}">${glyphs}</g>`;
  }).join("");
  return `<svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="none" font-family="ui-monospace,monospace" font-size="${size}" fill="${th.accent}" style="position:absolute;inset:0;pointer-events:none;opacity:${r(opacity)};overflow:visible;">${g}</svg>`;
}
// Seven speed bands (reference: c % 7). The fall velocity is the reference's exactly —
// STEP px/s per unit of `sp`, i.e. 50.6px/s at the slowest band and 148px/s at the fastest — so a
// beat of any length sees the same amount of travel it would in the reference.
const matrixTweens = (ctx, { cls }) => Array.from({ length: 7 }, (_, b) => {
  const dur = TILE / (STEP * (1.1 + b * 0.35));
  return `tl.fromTo(".${cls}-mc${b}",{y:${r(-TILE)}},{y:0,duration:${r(dur)},ease:"none",repeat:${reps(ctx.L, dur)}},${r(ctx.T)});`;
});

// ── CRT stack ────────────────────────────────────────────────────────────────
// Reference CRT (:59-71): fine scanlines, a screen-refresh roll band travelling at 240px/s, a
// curvature vignette, chromatic edge fringing in cyan/magenta, and a subtle flicker. All five,
// because together they are what makes the ground read as a screen rather than a dark rectangle.
//
// THE GLASS IS IN FRONT OF THE PICTURE AND IT NEVER BLINKS. z-index 50 puts it above the HUD
// (`.om-chrome` is 40) and below the caption node (60), which is the reference's own paint order:
// rain inside the camera, HUD over it, CRT last of all. The composer hangs this OUTSIDE `.om-hud`
// — see `shell()` there — because the kit cross-fades that wrapper on every cut, and a tube that
// stops existing for a third of a second at each boundary is not a tube.
const ROLL_DUR = 1240 / 240;   // 5.17s: the reference's band travels 1240px at 240px/s
const FLICK_STEP = 0.12;       // one stepped flicker frame; period 0.24s
function crt(th, { cls, U }) {
  return `<div class="${cls}-glass" style="position:absolute;inset:0;pointer-events:none;z-index:50;">
    <div style="position:absolute;inset:0;background-image:repeating-linear-gradient(0deg, rgba(0,0,0,0.34) 0 1px, transparent 1px 3px);"></div>
    <div class="${cls}-roll" style="position:absolute;left:0;right:0;top:${r(-U(80))}cqw;height:${r(U(150))}cqw;background:linear-gradient(180deg, transparent, rgba(255,255,255,0.05), transparent);"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(120% 100% at 50% 50%, transparent 52%, rgba(0,0,0,0.5) 86%, rgba(0,0,0,0.9) 100%);"></div>
    <div style="position:absolute;inset:0;box-shadow:inset ${r(U(5))}cqw 0 ${r(U(18))}cqw ${rgba(CRT_CYAN, 0.16)}, inset ${r(-U(5))}cqw 0 ${r(U(18))}cqw ${rgba(CRT_MAG, 0.16)};"></div>
    <div class="${cls}-flick" style="position:absolute;inset:0;background:#000;opacity:0;"></div>
  </div>`;
}
// PHASE-LOCKED TO THE FILM, NOT TO THE BEAT. Each scene draws its own copy of the glass and hands
// over to the next one at the cut (composer `shell()`), so if every copy started its roll at its
// own T the band would jump position at every handover — a smaller blink, but still a blink. Both
// loops are therefore positioned on a GLOBAL grid (a whole number of periods from t=0), which
// makes the phase at any absolute time identical in every scene's copy. The tween starts before
// the clip is visible, which costs nothing: the clip is at opacity 0 until its beat begins.
const crtTweens = (ctx, { cls, U }) => {
  const rollAt = Math.floor(ctx.T / ROLL_DUR) * ROLL_DUR;
  const flickAt = Math.floor(ctx.T / (FLICK_STEP * 2)) * (FLICK_STEP * 2);
  const end = ctx.T + ctx.clipDur;
  return [
    `tl.fromTo(".${cls}-roll",{y:0},{y:"${r(U(1240))}cqw",duration:${r(ROLL_DUR)},ease:"none",repeat:${reps(end - rollAt, ROLL_DUR)}},${r(rollAt)});`,
    // fromTo, not to: the layer is authored at opacity 0 and a bare .to() reads to the ghost
    // guard as content hidden and never revealed. Peak is 0.1 rather than the reference's ~0.05
    // because the guard only recognises 0.1-1 as a reveal — and it is right to: an element that
    // never exceeds 6% opacity is indistinguishable from one that was never revealed at all. At
    // a 0.12s stepped flicker the two are visually identical.
    `tl.fromTo(".${cls}-flick",{opacity:0},{opacity:0.1,duration:${FLICK_STEP},ease:"steps(1)",repeat:${reps(end - flickAt, FLICK_STEP)},yoyo:true},${r(flickAt)});`,
  ];
};

// ── the HUD ──────────────────────────────────────────────────────────────────
// Reference Hud (:148-169) fills ALL FOUR margins: an inset keyline, corner brackets, a live
// prompt with a blinking cursor, a status strip (spinner / REC / timecode / LIVE), a hex address
// rail down the left, an EQ meter at the right, and a scrolling telemetry ticker along the foot.
//
// Two of the four things in that status strip prove the frame is LIVE, and both were inert here:
// the braille spinner was one static glyph and the timecode slot printed the brand name. Both are
// per-frame text derivations, which is why they were dropped — but both are expressible. The
// spinner is a ten-frame filmstrip translated in steps behind a one-glyph window; the timecode is
// the one thing on the page that genuinely needs the clock, so it reads `tl.time()` from an
// onUpdate, exactly as the shared caption node does.
const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPIN_FPS = 12;           // reference: floor(clock*12) % 10
const CUR_HALF = 0.42;         // reference cursor: floor(clock*2.4)%2 -> 0.4167s on, 0.4167s off
const LED_HALF = 0.5;          // reference LED:    floor(clock*2)%2   -> 0.5s on, 0.5s off
const EQ_HALF = 0.98;          // sin(clock*3.2): period 1.963s, so a yoyo half of 0.98s
const EQ_PHASE = 0.22;         // the reference's 0.7rad per-bar offset is 0.7/3.2 = 0.219s
function hud(th, { cls, U, url, label }) {
  const acc = th.accent;
  const bracket = (v, h) => `<div style="position:absolute;${v}:0;${h}:0;width:${r(U(26))}cqw;height:${r(U(26))}cqw;">
    <div style="position:absolute;${v}:0;${h}:0;width:${r(U(26))}cqw;height:${r(U(2))}cqw;background:${acc};"></div>
    <div style="position:absolute;${v}:0;${h}:0;width:${r(U(2))}cqw;height:${r(U(26))}cqw;background:${acc};"></div>
  </div>`;
  const rail = Array.from({ length: 13 }, (_, i) => `<span>${(i * 16).toString(16).padStart(2, "0").toUpperCase()}</span>`).join("");
  // Reference bars run 10px to 160px on the same sine, so every bar is the full 160 tall and
  // scales from 10/160. (The port gave each bar a different resting height and one shared scale,
  // which is a staircase with a wobble rather than nine bars on one wave.)
  const eq = Array.from({ length: 9 }, () => `<div class="${cls}-eq" style="width:${r(U(12))}cqw;height:${r(U(160))}cqw;background:${rgba(acc, 0.35)};box-shadow:0 0 ${r(U(6))}cqw ${rgba(acc, 0.4)};transform-origin:bottom center;"></div>`).join("");
  const tick = "  [sys] link up  ::  [net] 12ms  ::  [gpu] 61C  ::  [io] 4.2MB/s  ::  [ok] tests 214/214  ::  [deploy] queued  ::  [mem] 48%  ::  [auth] root  ";
  const row = r(U(13));
  const strip = `<span style="display:inline-block;width:${r(U(13) * 0.62)}cqw;height:${row}cqw;overflow:hidden;vertical-align:-0.15em;"><span class="${cls}-spin" style="display:block;">${SPIN.map((gl) => `<span style="display:block;height:${row}cqw;line-height:${row}cqw;">${gl}</span>`).join("")}</span></span>`;
  return `<div class="om-chrome">
    <div style="position:absolute;inset:${r(U(24))}cqw;border:1px solid ${rgba(acc, 0.22)};pointer-events:none;"></div>
    <div style="position:absolute;inset:${r(U(18))}cqw;pointer-events:none;">
      ${bracket("top", "left")}${bracket("top", "right")}${bracket("bottom", "left")}${bracket("bottom", "right")}
    </div>
    <div style="position:absolute;top:${r(U(44))}cqw;left:${r(U(58))}cqw;font-family:${th.monoStack};font-size:${r(U(20))}cqw;font-weight:700;color:${acc};text-shadow:0 0 ${r(U(9))}cqw ${rgba(acc, 0.6)};">${esc(url)}:~$ <span style="color:${rgba(th.ink, 0.6)};">${esc(label || "run")}</span><span class="${cls}-cur" style="display:inline-block;width:0.62em;height:1.05em;vertical-align:-0.15em;background:${acc};margin-left:2px;"></span></div>
    <div style="position:absolute;top:${r(U(48))}cqw;right:${r(U(58))}cqw;display:flex;align-items:center;gap:${r(U(16))}cqw;font-family:${th.monoStack};font-size:${r(U(13))}cqw;letter-spacing:0.12em;color:${rgba(th.ink, 0.6)};">
      <span style="color:${acc};text-shadow:0 0 ${r(U(9))}cqw ${rgba(acc, 0.6)};">${strip} sync</span><span style="color:${CRT_MAG};">&#9679; REC</span><span class="${cls}-tc">00:00:00</span><span><span class="${cls}-led" style="color:${acc};">&#9609;</span> LIVE</span>
    </div>
    <div style="position:absolute;left:${r(U(34))}cqw;top:${r(U(130))}cqw;bottom:${r(U(130))}cqw;width:${r(U(22))}cqw;display:flex;flex-direction:column;justify-content:space-between;font-family:${th.monoStack};font-size:${r(U(11))}cqw;color:${rgba(acc, 0.32)};">${rail}</div>
    <div style="position:absolute;right:${r(U(34))}cqw;bottom:${r(U(130))}cqw;width:${r(U(30))}cqw;height:${r(U(200))}cqw;display:flex;align-items:flex-end;gap:${r(U(3))}cqw;">${eq}</div>
    <div style="position:absolute;bottom:${r(U(66))}cqw;left:${r(U(58))}cqw;right:${r(U(58))}cqw;overflow:hidden;height:${r(U(20))}cqw;">
      <div class="${cls}-tick" style="white-space:nowrap;font-family:${th.monoStack};font-size:${r(U(14))}cqw;color:${rgba(acc, 0.5)};">${esc(tick.repeat(4))}</div>
    </div>
  </div>`;
}
const hudTweens = (ctx, { cls, U }) => {
  const tickDur = 1500 / 90;                // reference ticker: 1500px at 90px/s
  const spinDur = SPIN.length / SPIN_FPS;   // ten frames at 12Hz = 0.833s per cycle
  return [
    `tl.to(".${cls}-cur",{opacity:0,duration:${CUR_HALF},ease:"steps(1)",repeat:${reps(ctx.L, CUR_HALF)},yoyo:true},${r(ctx.T)});`,
    `tl.to(".${cls}-led",{opacity:0.3,duration:${LED_HALF},ease:"steps(1)",repeat:${reps(ctx.L, LED_HALF)},yoyo:true},${r(ctx.T)});`,
    `tl.fromTo(".${cls}-tick",{x:0},{x:"${r(-U(1500))}cqw",duration:${r(tickDur)},ease:"none",repeat:${reps(ctx.L, tickDur)}},${r(ctx.T)});`,
    // The filmstrip: ten glyph rows behind a one-row window, stepped one row per frame. steps(10)
    // over the full ten-row travel lands on each glyph for exactly 1/12s and then wraps.
    `tl.fromTo(".${cls}-spin",{y:0},{y:"${r(-U(13) * SPIN.length)}cqw",duration:${r(spinDur)},ease:"steps(${SPIN.length})",repeat:${reps(ctx.L, spinDur)}},${r(ctx.T)});`,
    `tl.fromTo(".${cls}-eq",{scaleY:0.0625},{scaleY:1,duration:${EQ_HALF},ease:"sine.inOut",repeat:${reps(ctx.L, EQ_HALF)},yoyo:true,stagger:${EQ_PHASE}},${r(ctx.T)});`,
    // The running timecode. The only thing on the page that needs the clock itself — and the same
    // technique the shared caption node uses, so it is seek-exact rather than merely animated.
    `tl.to({},{duration:${r(ctx.L)},ease:"none",onUpdate:function(){var e=document.querySelector(".${cls}-tc");if(!e)return;var t=tl.time(),m=Math.floor(t/60),s=Math.floor(t%60),c=Math.floor((t*100)%100),p=function(n){return (n<10?"0":"")+n;},v=p(m)+":"+p(s)+":"+p(c);if(e.textContent!==v)e.textContent=v;}},${r(ctx.T)});`,
  ];
};

// ── terminal window ──────────────────────────────────────────────────────────
// Reference Term (:115-125): 12px radius, panel ground, a phosphor keyline, a deep drop shadow
// PLUS an accent bloom, and a 40px #070B0F title bar carrying three traffic lights.
//
// The traffic lights are semantic OS chrome — three fixed hues that say "this is a window". The
// port collapsed them into one square in the brand accent, which under a magenta rebrand produces
// a magenta traffic light, and that is not a thing.
const TERM_BAR = 40, TERM_PADY = 22, TERM_PADX = 26;
function term(th, { cls, U, x, y, w, h, title, body, z = 1, pad = true }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;border-radius:${r(U(12))}cqw;overflow:hidden;background:${th.panel};border:1px solid ${rgba(th.accent, 0.35)};box-shadow:0 ${r(U(30))}cqw ${r(U(80))}cqw ${rgba("#000000", 0.6)}, 0 0 ${r(U(60))}cqw ${rgba(th.accent, 0.12)};display:flex;flex-direction:column;z-index:${z};opacity:0;box-sizing:border-box;">
    <div style="height:${r(U(TERM_BAR))}cqw;flex:0 0 auto;background:#070B0F;border-bottom:1px solid ${rgba(th.accent, 0.25)};display:flex;align-items:center;gap:${r(U(8))}cqw;padding:0 ${r(U(16))}cqw;">
      ${TRAFFIC.map((c) => `<span style="width:${r(U(12))}cqw;height:${r(U(12))}cqw;border-radius:50%;background:${c};flex:0 0 auto;"></span>`).join("")}
      <span style="margin-left:${r(U(12))}cqw;font-family:${th.monoStack};font-size:${r(U(13))}cqw;color:${rgba(th.ink, 0.5)};white-space:nowrap;overflow:hidden;">${esc(title || "bash — 80x24")}</span>
    </div>
    <div style="flex:1 1 auto;min-height:0;padding:${pad ? `${r(U(TERM_PADY))}cqw ${r(U(TERM_PADX))}cqw` : "0"};overflow:hidden;position:relative;">${body}</div>
  </div>`;
}
// The height a Term needs to hold `n` lines of `size` code without clipping: title bar, both
// paddings, and the reference's 1.6 line height. Layouts are absolutely positioned here, so a
// window that is merely "tall enough in the reference's fixed copy" clips real AI copy.
const termHeight = (U, size, lines) => U(TERM_BAR) + U(TERM_PADY) * 2 + size * 1.6 * lines;

// ── the self-typing code block ───────────────────────────────────────────────
// Reference CodeBlock (:88-113) is the feature the README leads with: a cumulative character
// budget floor((clock-start)*cps) walks the token list, each token is coloured from an 8-entry
// syntax map, the partially-typed token carries a live blinking cursor, and untyped lines sit dim.
//
// The port replaced all of it with a per-LINE fade-and-slide, so nothing in the film typed and the
// syntax palette — the only place cyan and amber ever appear as CONTENT — went with it.
//
// HOW IT TYPES ON A PAUSED TIMELINE. One character per span, all sharing one class, revealed by a
// single staggered opacity tween: GSAP staggers in DOM order, and DOM order across the whole block
// IS the reference's cumulative budget. One tween, N glyphs, exact at any seek. The cursor is a
// separate block per line that hops the monospace grid on `steps(len)` — a real head, not a
// terminal punctuation mark, because a monospace advance is exactly 0.6em so the hop is exact.
//
// `lines` is the reference's own shape: an array of lines, each an array of [text, key] tokens.
function code(th, { cls, U, lines, size, lineNums = false, colors = null }) {
  const cmap = { cm: th.sub, kw: th.accent, fn: th.cyan, str: th.amber, num: th.mag, op: th.sub, def: th.ink, ok: th.accent, ...(colors || {}) };
  const gutter = size * 1.6;      // reference: width size*1.6, right-aligned, rgba(accent,.3)
  const charW = size * MONO_ADV;
  const lens = [];
  const rows = lines.map((line, li) => {
    const toks = line.map(([txt, key]) => {
      const chars = [...String(txt)].map((ch) => `<span class="${cls}-ch" style="opacity:0;">${esc(ch)}</span>`).join("");
      return `<span style="color:${cmap[key] || cmap.def};">${chars}</span>`;
    }).join("");
    const len = line.reduce((s, t) => s + [...String(t[0])].length, 0);
    lens.push(len);
    return `<div style="min-height:${r(size * 1.6)}cqw;display:flex;align-items:flex-start;">${lineNums ? `<span style="width:${r(gutter)}cqw;flex:0 0 auto;color:${rgba(th.accent, 0.3)};text-align:right;padding-right:${r(U(14))}cqw;">${String(li + 1).padStart(2, "0")}</span>` : ""}<span style="position:relative;white-space:pre;display:inline-block;">${toks}${len ? `<span class="${cls}-cu${li}" style="position:absolute;left:0;top:0.3em;width:0.62em;height:1.05em;background:${th.accent};opacity:0;"></span>` : ""}</span></div>`;
  }).join("");
  return {
    html: `<div style="font-family:${th.monoStack};font-size:${r(size)}cqw;line-height:1.6;text-shadow:0 0 ${r(U(7))}cqw ${rgba(th.accent, 0.35)};">${rows}</div>`,
    lens,
    chars: lens.reduce((a, b) => a + b, 0),
    charW,
  };
}
// `at` is an ABSOLUTE timeline position and `dur` the seconds the whole block takes to type — the
// composer derives it from the reference's cps and then clamps it to the room the beat actually
// has, because a storyboard beat is not the reference's 2.3s and a block that is still typing when
// the cut lands has not typed at all.
const codeTweens = (ctx, { cls, lens, charW, at, dur }) => {
  const total = lens.reduce((a, b) => a + b, 0);
  if (!total) return [];
  const per = dur / total;
  const out = [`tl.to(".${cls}-ch",{opacity:1,duration:${r4(Math.max(0.008, per * 0.5))},ease:"steps(1)",stagger:${r4(per)}},${r(at)});`];
  const lastTyped = lens.reduce((m, l, i) => (l > 0 ? i : m), -1);
  let acc = 0;
  lens.forEach((len, li) => {
    if (!len) return;
    const t0 = at + acc * per, t1 = t0 + len * per;
    acc += len;
    out.push(`tl.set(".${cls}-cu${li}",{opacity:1},${r(t0)});`);
    out.push(`tl.fromTo(".${cls}-cu${li}",{x:0},{x:"${r(len * charW)}cqw",duration:${r(len * per)},ease:"steps(${len})"},${r(t0)});`);
    if (li !== lastTyped) { out.push(`tl.set(".${cls}-cu${li}",{opacity:0},${r(t1)});`); return; }
    // The last line keeps its cursor and it idles, at the reference's 0.833s period. A cursor at
    // 2.4Hz reads as an error indicator; at 1.2Hz it reads as a prompt waiting for you.
    out.push(`tl.to(".${cls}-cu${li}",{opacity:0,duration:${CUR_HALF},ease:"steps(1)",repeat:${reps(Math.max(0.1, ctx.T + ctx.L - t1), CUR_HALF)},yoyo:true},${r(t1)});`);
  });
  return out;
};

// ── glitch title ─────────────────────────────────────────────────────────────
// Reference Glitch (:76-86) — the template's face, at 190px on Boot and 128px on Run. The word
// three times: a magenta copy at (+j, -0.4j), a cyan copy at (-j, +0.4j), both at 0.75 in screen
// blend, and the ink original on top. j = ((floor(clock*22)%3)-1)*4*intensity — a hard three-state
// +-4px jump at 22Hz, with intensity falling from 1.6 to 0.5 after progress 0.65.
//
// DIVERGENCE, STATED: one repeating tween can express a two-state square wave, not the reference's
// three states (-j, 0, +j). We alternate between the two EXTREMES at the same 22Hz, so the
// chromatic split is always open where the reference closes it one frame in three. The decay IS
// reproduced, as a second tween taking over at 0.65 of the beat.
const GLITCH_HZ = 22;
function glitch(th, { cls, text, size, ink = null, weight = 800 }) {
  const base = `font-family:${th.monoStack};font-size:${r(size)}cqw;font-weight:${weight};letter-spacing:0.02em;line-height:1;white-space:pre;`;
  return `<div style="position:relative;display:inline-block;">
    <span class="${cls}-gm" style="${base}position:absolute;left:0;top:0;color:${CRT_MAG};opacity:0.75;mix-blend-mode:screen;">${esc(text)}</span>
    <span class="${cls}-gc" style="${base}position:absolute;left:0;top:0;color:${CRT_CYAN};opacity:0.75;mix-blend-mode:screen;">${esc(text)}</span>
    <span style="${base}position:relative;color:${ink || th.ink};">${esc(text)}</span>
  </div>`;
}
// `hot`/`cool` are the reference's intensity values and `split` the progress at which it drops.
// The two phases are sequential, never concurrent: `reps` floors, so the hot pass always finishes
// at or before the handover and the two never own the same property at the same time.
const glitchTweens = (ctx, { cls, U, amp = 4, hot = 1.6, cool = 0.5, split = 0.65 }) => {
  const half = 1 / GLITCH_HZ / 2;
  const t0 = ctx.T, t1 = ctx.T + ctx.L * split;
  const pass = (a, span, k, sel, sx, sy) =>
    `tl.fromTo(".${cls}-${sel}",{x:"${r(-U(amp * k) * sx)}cqw",y:"${r(-U(amp * k * 0.4) * sy)}cqw"},{x:"${r(U(amp * k) * sx)}cqw",y:"${r(U(amp * k * 0.4) * sy)}cqw",duration:${r4(half)},ease:"steps(1)",repeat:${reps(span, half)},yoyo:true},${r(a)});`;
  return [
    pass(t0, ctx.L * split, hot, "gm", 1, -1),
    pass(t0, ctx.L * split, hot, "gc", -1, 1),
    pass(t1, ctx.L * (1 - split), cool, "gm", 1, -1),
    pass(t1, ctx.L * (1 - split), cool, "gc", -1, 1),
  ];
};

// ── meters ───────────────────────────────────────────────────────────────────
// Reference Bar (:141-145): a 28-cell block gauge — a 130px dim label, an accent [████░░░] bar
// filling over 0.6 of progress, and a live percentage. Half of the Metrics beat, and the only
// place the pack's stated "progress bars that fill in discrete blocks" identity is drawn with real
// block glyphs rather than with flex spans.
//
// The fill is per-cell spans over the track, revealed by the same stepped stagger the typing uses —
// so the gauge fills one BLOCK at a time, which is the whole point of a block gauge, and only the
// cells that will actually light are emitted (a cell that stays at opacity 0 for the entire film
// is a ghost, and rightly fails the guard).
const METER_CELLS = 28;
// `labelW` is the reference's 130px label column, which is sized for "cpu"/"mem"/"net"/"io". Pass 0
// for a label that sets its own width — Compile's build readout is a sentence, and in a 130px
// column it overran the opening bracket.
//
// NO `white-space:pre` ON THE FLEX CONTAINER. Preserved whitespace turns the newlines between
// these children into real anonymous flex items, which printed as a gap before the % sign and
// shoved the gauge sideways. Only the glyph runs need it, and they are single spans.
function meter(th, { cls, U, label, frac, labelW = null }) {
  const filled = Math.max(0, Math.min(METER_CELLS, Math.round(METER_CELLS * frac)));
  const track = "░".repeat(METER_CELLS);
  const fill = Array.from({ length: filled }, () => `<span class="${cls}-f" style="opacity:0;">█</span>`).join("");
  const lw = labelW == null ? U(130) : labelW;
  return `<div class="${cls}" style="font-family:${th.monoStack};font-size:${r(U(18))}cqw;color:${th.ink};display:flex;gap:${r(U(14))}cqw;align-items:center;opacity:0;">`
    + `<span style="${lw ? `width:${r(lw)}cqw;` : ""}flex:0 0 auto;white-space:nowrap;color:${th.sub};">${esc(label)}</span>`
    + `<span style="flex:0 0 auto;white-space:pre;color:${th.accent};">[<span style="position:relative;display:inline-block;"><span style="color:${rgba(th.accent, 0.22)};">${track}</span><span style="position:absolute;left:0;top:0;">${fill}</span></span>]</span>`
    + `<span style="flex:0 0 auto;white-space:pre;color:${th.accent};"><span class="${cls}-p">0</span>%</span>`
    + `</div>`;
}
const meterTweens = ({ cls, frac, at, dur }) => {
  const filled = Math.max(0, Math.min(METER_CELLS, Math.round(METER_CELLS * frac)));
  const pct = Math.round(frac * 100);
  const out = [`tl.fromTo(".${cls}",{opacity:0,x:"-1cqw"},{opacity:1,x:0,duration:${r(Math.min(0.3, dur))},ease:"power2.out"},${r(at)});`];
  if (filled) {
    out.push(`tl.to(".${cls}-f",{opacity:1,duration:${r4(Math.max(0.01, dur / filled / 2))},ease:"steps(1)",stagger:${r4(dur / filled)}},${r(at)});`);
    out.push(`tl.fromTo(".${cls}-p",{innerText:0},{innerText:${pct},duration:${r(dur)},ease:"steps(${filled})",snap:{innerText:1}},${r(at)});`);
  }
  return out;
};

// ── flag chip ────────────────────────────────────────────────────────────────
// Reference Chip (:137-139): a `--flag` pill — radius 6, rgba(accent,.08) fill, a 1px accent
// border, 15px accent mono. The only element in the reference that reads as a CLI ARGUMENT rather
// than as output, and what fills the bottom-right quadrant of its longest beat.
function chip(th, { cls, U, text }) {
  return `<span class="${cls}" style="display:inline-flex;align-items:center;gap:${r(U(6))}cqw;padding:${r(U(8))}cqw ${r(U(14))}cqw;border-radius:${r(U(6))}cqw;background:${rgba(th.accent, 0.08)};border:1px solid ${rgba(th.accent, 0.45)};font-family:${th.monoStack};font-size:${r(U(15))}cqw;color:${th.accent};white-space:nowrap;opacity:0;">--${esc(text)}</span>`;
}

module.exports = {
  matrix, matrixTweens, crt, crtTweens, hud, hudTweens,
  term, termHeight, code, codeTweens, glitch, glitchTweens, meter, meterTweens, chip,
};
