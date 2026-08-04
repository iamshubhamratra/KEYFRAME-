// FLIGHT — a departure film. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. Ported from the imported OM templates "flight" (1920x1080) and "flightVertical"
// (1080x1920), SCENE_MAP = Gate/Takeoff/Climb/Cruise/Instruments, transition="cut". Layout,
// rhythm and vocabulary reproduced; none of the copy is.
//
// ONE MODULE, TWO ASPECTS. The reference ships the vertical as a separate 25K file that is the
// same film re-laid. Here the layouts BRANCH on `stage.portrait` instead: the horizon, the
// climb and the instrument row are the same ideas at different proportions, and duplicating
// five builders to change a handful of numbers is how the two copies drift apart. `renderer:
// "flight"` and `"flight-vertical"` resolve to the two exports below.
//
// THE LOOK. A daylight sky graded from pale horizon to deeper zenith, a warm sun disc, and a
// dark ground plane with a dashed runway. One hot orange accent against the blue. Type is
// clean and geometric; the aircraft is a simple mark that climbs across the frame, and
// pictures ride in cabin-window panels with rounded corners.
//
// FONT SUBSTITUTION: none — every reference face is now bundled (see src/fonts/pack_fonts.js).

// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const SKY_A = "#BFE6FF", SKY_B = "#8FCBF5", SKY_C = "#E9F6FF";
const GROUND = "#39404A", RUNWAY = "#474E58", INK = "#16222E", PAPER = "#FFFFFF";
const ACCENT = "#FF5630";
// FONTS: the reference's own Manrope + DM Mono, both bundled.
const DISPLAY = "Manrope", MONO = "DM Mono";

const STRINGS = {
  gate: "GATE", takeoff: "DEPARTURE", climb: "CLIMB", cruise: "CRUISE",
  instruments: "INSTRUMENTS", scene: "LEG", of: "OF", go: "BOOK IT",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: SKY_C, isDark: false, packAccent: ACCENT });
  return {
    accent, bg: SKY_C, panel: PAPER, ink: INK, sub: "#5C6B7A", line: "#C9D4DE",
    skyA: SKY_A, skyB: SKY_B, ground: GROUND, runway: RUNWAY,
    // The sun takes the accent's warmth, so a rebranded sky is lit by the brand.
    sun: K.spin(accent, 26, 0.3, 0.75),
    adv: K.ADVANCE.mixed,
    capBg: PAPER, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO),
    resolvedBrand,
  };
}

// ---- furniture (stage-aware) -------------------------------------------------
function makeKit(stage) {
  const { U, portrait } = stage;
  const W = U(stage.W), VH = stage.VH;
  const M = portrait ? U(80) : U(96);
  const COL = W - M * 2;
  const horizon = portrait ? VH * 0.72 : VH * 0.68;

  // The sky: a vertical grade, a sun disc, a ground plane and a dashed runway centreline.
  // All gradients and solids — no blur filters, which is what keeps the heavy-overlay count
  // low (a stack of them is what makes a composition capture black).
  function sky(id, th) {
    return `<div style="position:absolute;inset:0;background:linear-gradient(180deg, ${th.skyB} 0%, ${th.skyA} 42%, ${th.bg} ${r(horizon / VH * 100)}%);overflow:hidden;">
      <div class="${id}-sun" style="position:absolute;left:${portrait ? "68%" : "74%"};top:${r(VH * 0.16)}cqw;width:${r(U(220))}cqw;height:${r(U(220))}cqw;border-radius:50%;background:radial-gradient(circle, ${rgba(th.sun, 0.95)} 0%, ${rgba(th.sun, 0.35)} 46%, ${rgba(th.sun, 0)} 72%);"></div>
      <div class="${id}-cloud" style="position:absolute;inset:0;background:
        radial-gradient(ellipse ${r(U(300))}cqw ${r(U(60))}cqw at 18% ${r(VH * 0.22 / VH * 100)}%, ${rgba("#FFFFFF", 0.7)} 0%, transparent 70%),
        radial-gradient(ellipse ${r(U(240))}cqw ${r(U(48))}cqw at 62% ${r(VH * 0.34 / VH * 100)}%, ${rgba("#FFFFFF", 0.55)} 0%, transparent 70%),
        radial-gradient(ellipse ${r(U(280))}cqw ${r(U(54))}cqw at 88% ${r(VH * 0.5 / VH * 100)}%, ${rgba("#FFFFFF", 0.45)} 0%, transparent 70%);"></div>
      <div style="position:absolute;left:0;right:0;top:${r(horizon)}cqw;bottom:0;background:linear-gradient(180deg, ${th.runway} 0%, ${th.ground} 100%);"></div>
      <div style="position:absolute;left:0;right:0;top:${r(horizon)}cqw;height:${r(U(3))}cqw;background:${rgba("#FFFFFF", 0.4)};"></div>
      <div class="${id}-dash" style="position:absolute;left:0;right:0;top:${r(horizon + (VH - horizon) * 0.55)}cqw;height:${r(U(8))}cqw;background:repeating-linear-gradient(90deg, ${rgba("#FFFFFF", 0.75)} 0 ${r(U(70))}cqw, transparent ${r(U(70))}cqw ${r(U(160))}cqw);"></div>
    </div>`;
  }
  const skyTweens = (id, ctx) => [
    `tl.to(".${id}-cloud",{x:"${r(-U(90))}cqw",duration:${r(Math.max(4, ctx.L * 2))},ease:"none"},${r(ctx.T)});`,
    `tl.to(".${id}-dash",{backgroundPositionX:"${r(-U(160))}cqw",duration:1.1,ease:"none",repeat:${K.reps(ctx.L, 1.1)}},${r(ctx.T)});`,
  ];

  // The aircraft mark — a simple filled delta, so it reads at any size and needs no asset.
  const plane = (cls, th, size) => `<svg class="${cls}" viewBox="0 0 120 60" style="position:absolute;width:${r(size)}cqw;height:${r(size / 2)}cqw;overflow:visible;">
    <path d="M4 30 L86 18 L112 30 L86 42 Z" fill="${th.accent}"></path>
    <path d="M52 20 L64 2 L74 4 L66 22 Z" fill="${th.accent}" opacity="0.85"></path>
    <path d="M52 40 L64 58 L74 56 L66 38 Z" fill="${th.accent}" opacity="0.85"></path>
  </svg>`;

  // A cabin-window panel — a rounded rectangle around a real picture. Never drawn empty.
  const window_ = (th, { cls, x, y, w, h, shot, z = 2 }) => `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};border-radius:${r(Math.min(w, h) * 0.22)}cqw;overflow:hidden;background:${th.panel};border:${r(U(8))}cqw solid ${th.panel};box-shadow:0 ${r(U(26))}cqw ${r(U(60))}cqw ${rgba(th.ink, 0.24)};opacity:0;">
    ${K.shotFill(shot, { bg: th.panel })}
    <div style="position:absolute;inset:0;border-radius:${r(Math.min(w, h) * 0.19)}cqw;box-shadow:inset 0 ${r(U(20))}cqw ${r(U(40))}cqw ${rgba("#FFFFFF", 0.18)};pointer-events:none;"></div>
  </div>`;

  const tag = (th, t) => `<span style="display:inline-block;padding:${r(U(8))}cqw ${r(U(20))}cqw;border-radius:${r(U(100))}cqw;background:${th.accent};color:${K.inkOn(th.accent)};font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.2em;text-transform:uppercase;white-space:nowrap;">${esc(t)}</span>`;

  return { U, portrait, W, VH, M, COL, horizon, sky, skyTweens, plane, window_, tag };
}

// ---- scene builders (closed over the stage) ----------------------------------
function makeBuilders(stage) {
  const KIT = makeKit(stage);
  const { U, portrait, VH, M, COL, horizon, sky, skyTweens, plane, window_, tag } = KIT;

  // GATE — the opener. Title over the runway, the aircraft waiting, the first picture in a
  // cabin window. Without a picture the type owns the sky.
  function sGate(scene, ctx, shots) {
    const { id, th, at, du } = ctx;
    const shot = shots[0] || null;
    const head = K.fitLines(scene.headline || scene.title || ctx.title,
      (portrait ? COL : COL * 0.52) / K.camSafe(), portrait ? U(104) : U(96), 3, th.adv);
    return {
      backdrop: sky(id, th),
      html: `
      <div class="${id}-tag" style="position:absolute;left:${r(M)}cqw;top:${r(VH * 0.16)}cqw;opacity:0;">${tag(th, String(scene.kicker || STRINGS.gate).slice(0, 26))}</div>
      <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(VH * 0.22)}cqw;width:${r(portrait ? COL : COL * 0.52)}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:1.0;letter-spacing:-0.03em;color:${th.ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      ${shot ? window_(th, {
        cls: `${id}-win`,
        x: portrait ? M : U(stage.W) - M - COL * 0.42, y: portrait ? VH * 0.44 : VH * 0.2,
        w: portrait ? COL : COL * 0.42, h: portrait ? VH * 0.24 : VH * 0.42, shot,
      }) : ""}
      <div class="${id}-plane" style="position:absolute;left:${r(-U(200))}cqw;top:${r(horizon - U(90))}cqw;">${plane(`${id}-p`, th, U(200))}</div>`,
      s: [
        `tl.fromTo(".${id}-tag",{opacity:0,y:"${r(U(18))}cqw"},{opacity:1,y:0,duration:${du(0.4)},ease:"back.out(2)"},${at(0.2)});`,
        `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(36))}cqw"},{opacity:1,y:0,duration:${du(0.7)},ease:"power3.out"},${at(0.35)});`,
        shot ? `tl.to(".${id}-win",{opacity:1,duration:${du(0.5)},ease:"power2.out"},${at(0.7)});` : "",
        shot ? `tl.fromTo(".${id}-win",{scale:0.92,y:"${r(U(40))}cqw"},{scale:1,y:0,duration:${du(0.75)},ease:"back.out(1.3)"},${at(0.7)});` : "",
        `tl.to(".${id}-plane",{x:"${r(U(stage.W) + U(260))}cqw",duration:${r(Math.max(2.4, ctx.L))},ease:"none"},${at(0.3)});`,
        ...skyTweens(id, ctx),
      ].filter(Boolean),
    };
  }

  // CLIMB — the reveal. The statement rises while the aircraft banks up across the frame and
  // the picture climbs with it.
  // TAKEOFF — the rotation: the aircraft rolls, rotates and climbs out of frame while the copy
  // lands. RESTORED 4 Aug 2026 — the bundle-derived port dropped it, and it is the beat the whole
  // pack is named for. No picture: the reference gives this one to the aircraft.
  // Reference: eyebrow pill accent 20/0.14em, headline 118px, body 27/1.5 max 680; the plane
  // travels 560 -> 1240 while lifting 520px and pitching 13 degrees.
  function sTakeoff(scene, ctx) {
    const { id, th, at, du } = ctx;
    const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), portrait ? U(96) : U(118), 3, th.adv);
    const body = String(scene.subtext || "").trim().slice(0, 170);
    return {
      backdrop: sky(id, th),
      html: `
      <div style="position:absolute;left:${r(M)}cqw;top:${r(portrait ? VH * 0.1 : U(150))}cqw;width:${r(COL)}cqw;z-index:6;">
        <div class="${id}-brow" style="display:inline-block;background:${th.accent};color:${K.inkOn(th.accent)};padding:${r(U(8))}cqw ${r(U(22))}cqw;border-radius:${r(U(999))}cqw;font-family:${th.monoStack};font-size:${r(U(20))}cqw;letter-spacing:0.14em;text-transform:uppercase;opacity:0;">${esc(String(scene.kicker || STRINGS.takeoff).slice(0, 24))}</div>
        <div class="${id}-head" style="margin-top:${r(U(14))}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:0.92;letter-spacing:-0.03em;color:${th.ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
        ${body ? `<div class="${id}-body" style="margin-top:${r(U(22))}cqw;max-width:${r(U(680))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(U(27))}cqw;line-height:1.5;color:${rgba(th.ink, 0.72)};opacity:0;">${esc(body)}</div>` : ""}
      </div>
      <!-- The runway falls away as the aircraft rotates. -->
      <div class="${id}-rw" style="position:absolute;left:0;right:0;top:${r(portrait ? VH * 0.74 : VH * 0.78)}cqw;height:${r(U(8))}cqw;background:${rgba(th.ink, 0.35)};"></div>
      <div class="${id}-plane" style="position:absolute;left:${r(U(360))}cqw;top:${r(portrait ? VH * 0.66 : VH * 0.7)}cqw;">${plane(`${id}-p`, th, portrait ? U(190) : U(230))}</div>`,
      s: [
        `tl.fromTo(".${id}-brow",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.24)},ease:"power3.out"},${at(0.06)});`,
        `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"power3.out"},${at(0.12)});`,
        body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"power3.out"},${at(0.34)});` : "",
        // Roll (accelerate) then rotate and climb — the reference's two-phase move.
        `tl.fromTo(".${id}-plane",{x:0,y:0,rotation:0},{x:"${r(U(680))}cqw",duration:${du(0.9)},ease:"power2.in"},${at(0.05)});`,
        `tl.to(".${id}-plane",{y:"${r(-U(520))}cqw",rotation:-13,duration:${du(0.45)},ease:"power2.out"},${at(0.5)});`,
        `tl.to(".${id}-rw",{y:"${r(U(120))}cqw",opacity:0,duration:${du(0.45)},ease:"power2.out"},${at(0.5)});`,
        `tl.set(".${id}-rw",{opacity:0},${r(ctx.T + ctx.clipDur)});`,
        ...skyTweens(id, ctx),
      ].filter(Boolean),
    };
  }

  function sClimb(scene, ctx, shots) {
    const { id, th, at, du } = ctx;
    const shot = shots[0] || null;
    if (!shot) return { ...K.statement(scene, ctx, { centred: true }), backdrop: sky(id, th) };
    const word = String(scene.emphasis || scene.headline || "").slice(0, 30);
    const size = K.fitOne(word, COL / K.camSafe(), portrait ? U(118) : U(128), th.adv);
    // The landscape cut used to set this word at VH*0.76 — in the caption's lane, in white on
    // the dark runway, where the caption crossed it and it read as clipped. Both aspects now
    // read the same way: word at the top, window taking the height left above the caption.
    const wordTop = portrait ? VH * 0.14 : VH * 0.13;
    const winTop = portrait ? VH * 0.34 : wordTop + size + U(46);
    const winH = portrait ? VH * 0.34 : VH * 0.818 - winTop;
    return {
      backdrop: sky(id, th),
      html: `
      ${window_(th, {
        cls: `${id}-win`, x: portrait ? M : U(stage.W) * 0.5 - COL * 0.3, y: winTop,
        w: portrait ? COL : COL * 0.6, h: winH, shot,
      })}
      <div class="${id}-word" style="position:absolute;left:${r(M)}cqw;top:${r(wordTop)}cqw;width:${r(COL)}cqw;text-align:center;font-family:${th.displayStack};font-weight:800;font-size:${r(size)}cqw;line-height:1;letter-spacing:-0.03em;color:${th.ink};opacity:0;z-index:6;">${esc(word)}</div>
      <div class="${id}-plane" style="position:absolute;left:${r(-U(180))}cqw;top:${r(VH * 0.62)}cqw;">${plane(`${id}-p`, th, U(170))}</div>`,
      s: [
        `tl.to(".${id}-win",{opacity:1,duration:${du(0.4)},ease:"none"},${at(0.2)});`,
        `tl.fromTo(".${id}-win",{y:"${r(U(90))}cqw",scale:0.94},{y:0,scale:1,duration:${du(0.9)},ease:"power3.out"},${at(0.2)});`,
        `tl.fromTo(".${id}-word",{opacity:0,y:"${r(U(34))}cqw"},{opacity:1,y:0,duration:${du(0.6)},ease:"power3.out"},${at(0.6)});`,
        `tl.to(".${id}-plane",{x:"${r(U(stage.W) + U(240))}cqw",y:"${r(-VH * 0.34)}cqw",rotate:-16,duration:${r(Math.max(2.2, ctx.L * 0.9))},ease:"power1.inOut"},${at(0.35)});`,
        ...skyTweens(id, ctx),
      ],
    };
  }

  // CRUISE — the multi-window beat. The row FITS the pictures: three, two, or the beat goes
  // to `statement`. Never a row with an empty window in it.
  function sCruise(scene, ctx, shots) {
    const { id, th, at, du } = ctx;
    const n = Math.min(3, shots.length);
    if (n < 2) return { ...K.statement(scene, ctx), backdrop: sky(id, th) };
    const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), portrait ? U(70) : U(64), 2, th.adv);
    const gap = U(28);
    const each = portrait ? COL : (COL - gap * (n - 1)) / n;
    const eachH = portrait ? (VH * 0.44 - gap * (n - 1)) / n : VH * 0.42;
    return {
      backdrop: sky(id, th),
      html: `
      <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(VH * 0.13)}cqw;width:${r(COL)}cqw;text-align:center;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:1.04;letter-spacing:-0.02em;color:${th.ink};opacity:0;z-index:6;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      ${Array.from({ length: n }, (_, i) => window_(th, {
        cls: `${id}-w${i}`,
        x: portrait ? M : M + i * (each + gap),
        y: portrait ? VH * 0.3 + i * (eachH + gap) : VH * 0.28,
        w: each, h: eachH, shot: shots[i],
      })).join("")}`,
      s: [
        `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.2)});`,
        ...Array.from({ length: n }, (_, i) =>
          `tl.to(".${id}-w${i}",{opacity:1,duration:${du(0.3)},ease:"none"},${at(0.5 + i * 0.26)});`),
        ...Array.from({ length: n }, (_, i) =>
          `tl.fromTo(".${id}-w${i}",{y:"${r(U(70))}cqw",scale:0.9},{y:0,scale:1,duration:${du(0.6)},ease:"back.out(1.4)"},${at(0.5 + i * 0.26)});`),
        ...skyTweens(id, ctx),
      ],
    };
  }

  // INSTRUMENTS — the readouts, on white dials. Figures from the script only, landing early.
  // DELIBERATE DEVIATION: the reference carries no picture on the instrument beat. It takes one
  // here as a heavily-scrimmed band behind the dials, for a structural reason — the stats rule
  // makes every OTHER role decline a figures beat, so on a five-scene deck this beat occupies a
  // slot a picture beat would have had and a collected asset is stranded (the portrait guard
  // fails). The scrim keeps the daylight sky reading as the ground.
  function sInstruments(scene, ctx, shots) {
    const { id, th, at, du } = ctx;
    const stats = K.numbersIn(scene, 3);
    if (stats.length < 2) return { ...K.statement(scene, ctx, { centred: true }), backdrop: sky(id, th) };
    const bg = (shots || [])[0] || null;
    const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), portrait ? U(80) : U(74), 2, th.adv);
    const gap = U(30);
    const each = portrait ? COL : (COL - gap * (stats.length - 1)) / stats.length;
    const eachH = portrait ? U(280) : U(320);
    return {
      backdrop: bg
        ? `<div style="position:absolute;inset:0;background:${th.bg};overflow:hidden;">
            <div class="${id}-ib" style="position:absolute;inset:0;">${K.shotFill(bg, { bg: th.bg })}</div>
            <div style="position:absolute;inset:0;background:${rgba(th.bg, 0.86)};"></div>
          </div>`
        : sky(id, th),
      html: `
      <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(VH * 0.15)}cqw;width:${r(COL)}cqw;text-align:center;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:1.04;letter-spacing:-0.02em;color:${th.ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      ${stats.map((st, i) => `<div class="${id}-c${i}" style="position:absolute;left:${r(portrait ? M : M + i * (each + gap))}cqw;top:${r(portrait ? VH * 0.32 + i * (eachH + gap) : VH * 0.34)}cqw;width:${r(each)}cqw;height:${r(eachH)}cqw;border-radius:${r(U(30))}cqw;background:${th.panel};border:1px solid ${th.line};box-shadow:0 ${r(U(20))}cqw ${r(U(50))}cqw ${rgba(th.ink, 0.14)};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${r(U(12))}cqw;opacity:0;">
        <div style="font-family:${th.displayStack};font-weight:800;font-size:${r(U(96))}cqw;line-height:1;letter-spacing:-0.04em;color:${th.accent};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
        <div style="font-family:${th.monoStack};font-size:${r(U(18))}cqw;letter-spacing:0.2em;color:${th.sub};white-space:nowrap;overflow:hidden;">${esc(K.statLabel(scene, i))}</div>
      </div>`).join("")}`,
      s: [
        `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.2)});`,
        ...stats.flatMap((st, i) => {
          const num = Number(String(st.v).replace(/,/g, "")) || 0;
          const dp = String(st.v).includes(".") ? 1 : 0;
          return [
            `tl.fromTo(".${id}-c${i}",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${du(0.44)},ease:"back.out(2.2)"},${at(0.6 + i * 0.26)});`,
            `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.68)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.72 + i * 0.26)});`,
          ];
        }),
        ...skyTweens(id, ctx),
      ],
    };
  }

  // ARRIVAL — the close. Sky, the mark, the call, the address.
  function sArrival(scene, ctx, logo) {
    const { id, th, at, du } = ctx;
    const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, COL / K.camSafe(), portrait ? U(122) : U(132), 3, th.adv);
    const action = K.clampWords(String(scene.emphasis || ""), 20) || STRINGS.go;
    const hasMark = !!(logo && logo.path);
    return {
      backdrop: sky(id, th),
      html: `
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${r(M)}cqw;">
        ${hasMark ? `<div class="${id}-logo" style="width:${r(U(150))}cqw;height:${r(U(150))}cqw;border-radius:${r(U(36))}cqw;background:${th.panel};box-shadow:0 ${r(U(20))}cqw ${r(U(50))}cqw ${rgba(th.ink, 0.18)};padding:${r(U(22))}cqw;margin-bottom:${r(U(38))}cqw;display:flex;align-items:center;justify-content:center;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
        <div class="${id}-head" style="width:100%;text-align:center;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:1;letter-spacing:-0.03em;color:${th.ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
        <div class="${id}-pill" style="margin-top:${r(U(46))}cqw;display:flex;align-items:center;gap:${r(U(24))}cqw;flex-wrap:wrap;justify-content:center;opacity:0;">
          <span style="padding:${r(U(22))}cqw ${r(U(48))}cqw;border-radius:${r(U(100))}cqw;background:${th.accent};color:${K.inkOn(th.accent)};font-family:${th.displayStack};font-weight:800;font-size:${r(K.fitOne(action, U(600), U(36), th.adv))}cqw;text-transform:uppercase;white-space:nowrap;box-shadow:0 ${r(U(16))}cqw ${r(U(38))}cqw ${rgba(th.accent, 0.4)};">${esc(action)}</span>
          <span style="font-family:${th.monoStack};font-size:${r(U(22))}cqw;letter-spacing:0.14em;color:${th.sub};white-space:nowrap;">${esc(ctx.url)}</span>
        </div>
      </div>
      <div class="${id}-plane" style="position:absolute;left:${r(-U(180))}cqw;top:${r(VH * 0.2)}cqw;">${plane(`${id}-p`, th, U(150))}</div>`,
      s: [
        hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.55},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(2)"},${at(0.28)});` : "",
        `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.7)},ease:"power3.out"},${at(0.55)});`,
        `tl.fromTo(".${id}-pill",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(2.2)"},${at(1.25)});`,
        `tl.to(".${id}-plane",{x:"${r(U(stage.W) + U(240))}cqw",y:"${r(-U(70))}cqw",duration:${r(Math.max(2.6, ctx.L))},ease:"none"},${at(0.2)});`,
        ...skyTweens(id, ctx),
      ].filter(Boolean),
    };
  }

  return {
    gate: sGate, takeoff: sTakeoff, climb: sClimb, cruise: sCruise, instruments: sInstruments, arrival: sArrival,
    statement: (sc, ctx) => ({ ...K.statement(sc, ctx), backdrop: sky(ctx.id, ctx.th) }),
    "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: sky(ctx.id, ctx.th) }),
  };
}

const SPEC = {
  first: "gate", last: "arrival",
  middle: ["climb", "cruise", "instruments", "takeoff"],
  shapes: { gate: [1.2], takeoff: [], climb: [1.35], cruise: [1.3, 1.3, 1.3], instruments: [1.2], arrival: [], statement: [], "statement-c": [] },
  slots: (role, budget) => (role === "gate" || role === "climb" ? 1 : role === "instruments" ? Math.min(1, Math.max(0, budget)) : role === "cruise" ? Math.min(3, Math.max(0, budget)) : 0),
  needs: (role) => (role === "climb" ? 1 : role === "cruise" ? 2 : 0),
  carry: (role, scene, budget) => {
    // Roles are picked by a ROTATING cursor, not by priority. `instruments` is the only layout that
    // prints figures AS figures, so every other role declines a beat carrying two or more.
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "instruments") return isStats;
    if (isStats) return false;
    if (role === "climb") return budget >= 1;
    if (role === "takeoff") return K.wordsOf(scene.headline || scene.emphasis || "").length >= 2;
    if (role === "cruise") return budget >= 2;
    return true;
  },
};
const LABELS = {
  gate: STRINGS.gate, takeoff: STRINGS.takeoff, climb: STRINGS.climb, cruise: STRINGS.cruise,
  instruments: STRINGS.instruments, arrival: STRINGS.go,
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { box-shadow:0 ${r(stage.U(8))}cqw ${r(stage.U(24))}cqw ${rgba(th.ink, 0.16)}; }`);

// One builder per aspect. `buildFor(stage)` is what the two exported modules share.
function buildFor(stage, fallbackBrand) {
  return (opts = {}) => K.buildFilm({
    ...opts, stage, theme, STRINGS, spec: SPEC, builders: makeBuilders(stage), labels: LABELS,
    css, refBeat: 4.4, camera: { push: 130, scale: 1.03 }, fallbackBrand,
  });
}

const LANDSCAPE = K.stageOf(1920, 1080);
const PORTRAIT = K.stageOf(1080, 1920);

module.exports = { buildComposition: buildFor(LANDSCAPE, "SKYWARD"), STRINGS };
module.exports.vertical = { buildComposition: buildFor(PORTRAIT, "SKYWARD"), STRINGS };
module.exports.__test = { SPEC, theme, LANDSCAPE, PORTRAIT, makeBuilders, buildFor };
