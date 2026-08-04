// PIPELINE — a factory line in motion. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. Ported from the imported OM template "pipeline"
// (SCENE_MAP = Boot/Line/Inspect/Assemble/Throughput, transition="cut").
//
// A DEFECT FIXED AT PORT TIME. The reference declares its stage as **14 x 20** — a scaled-down
// constant that would render a fourteen-pixel-wide film. Every geometry number in it was
// authored against 1920x1080, so that is the stage used here.
//
// THE LOOK. Cool machine-shop grey, white equipment panels, brushed-steel rules and one safety
// orange. A conveyor belt runs across the foot of every frame with chevrons scrolling along it;
// parts travel the belt and lock into station. Type is squared and technical. Pictures ride in
// inspection bays — a bordered panel with a station number and a status lamp.
//
// FONT SUBSTITUTION: none — every reference face is now bundled (see src/fonts/pack_fonts.js).

// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U, VH } = STAGE;

const BG = "#EAEDF2", PANEL = "#FFFFFF", INK = "#1E2230";
const STEEL = "#AEB6C4", STEEL_DK = "#6B7385", BELT = "#2A2E3A", BELT_DK = "#1A1D26";
const ACCENT = "#FF8A00";
// FONTS: the reference's own Chakra Petch + IBM Plex Mono, both bundled.
const DISPLAY = "Chakra Petch", MONO = "IBM Plex Mono";

const STRINGS = {
  boot: "SYSTEM", line: "THE LINE", inspect: "INSPECTION", assemble: "ASSEMBLY",
  throughput: "THROUGHPUT", scene: "STATION", of: "OF", ok: "PASS", go: "START THE LINE",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: BG, isDark: false, packAccent: ACCENT });
  return {
    accent, bg: BG, panel: PANEL, ink: INK, sub: STEEL_DK, line: STEEL,
    belt: BELT, beltDk: BELT_DK, steel: STEEL,
    // The status lamp — a green derived from the accent so a rebranded line still reads GO.
    lamp: K.spin(accent, 96, -0.06, 0.6),
    adv: K.ADVANCE.mixed,
    capBg: PANEL, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO),
    resolvedBrand,
  };
}

// ---- furniture ---------------------------------------------------------------
const M = U(96);
const COL = U(1920) - M * 2;
const BELT_TOP = VH - U(190);

// The shop floor: a cool grade, a faint engineering grid, and the conveyor across the foot.
function floor(id, th) {
  return `<div style="position:absolute;inset:0;background:linear-gradient(180deg, #F3F5F9 0%, ${th.bg} 62%);overflow:hidden;">
    <div style="position:absolute;inset:0;background-image:linear-gradient(${rgba(th.ink, 0.05)} 1px, transparent 1px),linear-gradient(90deg, ${rgba(th.ink, 0.05)} 1px, transparent 1px);background-size:${r(U(64))}cqw ${r(U(64))}cqw;opacity:0.7;"></div>
    <div style="position:absolute;left:0;right:0;top:${r(BELT_TOP)}cqw;bottom:0;background:linear-gradient(180deg, ${th.belt} 0%, ${th.beltDk} 100%);"></div>
    <div style="position:absolute;left:0;right:0;top:${r(BELT_TOP)}cqw;height:${r(U(5))}cqw;background:${th.steel};"></div>
    <div class="${id}-chev" style="position:absolute;left:0;right:0;top:${r(BELT_TOP + U(60))}cqw;height:${r(U(46))}cqw;background:repeating-linear-gradient(115deg, ${rgba(th.accent, 0.85)} 0 ${r(U(22))}cqw, transparent ${r(U(22))}cqw ${r(U(74))}cqw);"></div>
    <div style="position:absolute;left:0;right:0;top:${r(BELT_TOP + U(140))}cqw;height:${r(U(3))}cqw;background:${rgba(th.steel, 0.4)};"></div>
  </div>`;
}
const floorTweens = (id, ctx) => [
  `tl.to(".${id}-chev",{backgroundPositionX:"${r(U(74))}cqw",duration:0.85,ease:"none",repeat:${K.reps(ctx.L, 0.85)}},${r(ctx.T)});`,
];

// A station tag — squared, with a number.
const station = (th, n, label) =>
  `<span style="display:inline-flex;align-items:center;gap:${r(U(12))}cqw;padding:${r(U(8))}cqw ${r(U(18))}cqw;background:${th.ink};color:${PANEL};font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.2em;text-transform:uppercase;white-space:nowrap;">
    <span style="color:${th.accent};">${esc(K.pad2(n))}</span>${esc(label)}</span>`;

// An inspection bay: an equipment panel with a station header, a status lamp and a real
// picture. Never drawn empty — an empty bay is a hole in the line.
function bay(th, { cls, x, y, w, h, shot, n, label, z = 2 }) {
  const head = U(52);
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};background:${th.panel};border:${r(U(3))}cqw solid ${th.ink};box-shadow:0 ${r(U(20))}cqw ${r(U(44))}cqw ${rgba(th.ink, 0.18)};display:flex;flex-direction:column;opacity:0;">
    <div style="height:${r(head)}cqw;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:0 ${r(U(16))}cqw;background:${th.ink};color:${PANEL};font-family:${th.monoStack};font-size:${r(U(15))}cqw;letter-spacing:0.18em;text-transform:uppercase;">
      <span><span style="color:${th.accent};">${esc(K.pad2(n))}</span> ${esc(label)}</span>
      <span class="${cls}-lamp" style="width:${r(U(14))}cqw;height:${r(U(14))}cqw;border-radius:50%;background:${th.lamp};box-shadow:0 0 ${r(U(14))}cqw ${rgba(th.lamp, 0.8)};"></span>
    </div>
    <div style="flex:1 1 auto;min-height:0;position:relative;">${K.shotFill(shot, { bg: th.panel })}</div>
  </div>`;
}

// ---- scenes ------------------------------------------------------------------
// BOOT — the line comes up. Title left, first bay right, a part travelling the belt.
function sBoot(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  const head = K.fitLines(scene.headline || scene.title || ctx.title,
    (shot ? U(820) : COL) / K.camSafe(), shot ? U(88) : U(140), 3, th.adv);
  return {
    backdrop: floor(id, th),
    html: `
    <div class="${id}-tag" style="position:absolute;left:${r(M)}cqw;top:${r(U(190))}cqw;opacity:0;">${station(th, ctx.i + 1, String(scene.kicker || STRINGS.boot).slice(0, 22))}</div>
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(250))}cqw;width:${r(shot ? U(820) : COL)}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:1.0;letter-spacing:-0.03em;color:${th.ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    ${shot ? bay(th, { cls: `${id}-bay`, x: U(1000), y: U(200), w: U(824), h: U(560), shot, n: 1, label: STRINGS.inspect }) : ""}
    <div class="${id}-part" style="position:absolute;left:${r(-U(160))}cqw;top:${r(BELT_TOP - U(74))}cqw;width:${r(U(140))}cqw;height:${r(U(80))}cqw;background:${th.accent};border:${r(U(3))}cqw solid ${th.ink};"></div>`,
    s: [
      `tl.fromTo(".${id}-tag",{opacity:0,x:"${r(-U(20))}cqw"},{opacity:1,x:0,duration:${du(0.4)},ease:"power2.out"},${at(0.2)});`,
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.65)},ease:"power3.out"},${at(0.35)});`,
      shot ? `tl.to(".${id}-bay",{opacity:1,duration:${du(0.3)},ease:"none"},${at(0.6)});` : "",
      shot ? `tl.fromTo(".${id}-bay",{x:"${r(U(70))}cqw"},{x:0,duration:${du(0.7)},ease:"power3.out"},${at(0.6)});` : "",
      `tl.to(".${id}-part",{x:"${r(U(2100))}cqw",duration:${r(Math.max(2.6, ctx.L))},ease:"none"},${at(0.3)});`,
      ...floorTweens(id, ctx),
    ].filter(Boolean),
  };
}

// LINE — the process: numbered stations laid across the frame, each locking in with a stamp.
function sLine(scene, ctx) {
  const { id, th, at, du } = ctx;
  const list = K.bullets(scene, 4);
  if (list.length < 2) return { ...K.statement(scene, ctx), backdrop: floor(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(78), 1, th.adv);
  const gap = U(24), each = (COL - gap * (list.length - 1)) / list.length;
  return {
    backdrop: floor(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(180))}cqw;width:${r(COL)}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;letter-spacing:-0.02em;color:${th.ink};opacity:0;">${esc(head.lines.join(" "))}</div>
    ${list.map((b, i) => `<div class="${id}-st${i}" style="position:absolute;left:${r(M + i * (each + gap))}cqw;top:${r(U(330))}cqw;width:${r(each)}cqw;height:${r(U(400))}cqw;background:${th.panel};border:${r(U(3))}cqw solid ${th.ink};box-shadow:0 ${r(U(14))}cqw ${r(U(32))}cqw ${rgba(th.ink, 0.14)};padding:${r(U(28))}cqw;display:flex;flex-direction:column;justify-content:space-between;opacity:0;">
      <span style="font-family:${th.monoStack};font-size:${r(U(46))}cqw;color:${th.accent};">${K.pad2(i + 1)}</span>
      <span style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(30))}cqw;line-height:1.24;color:${th.ink};">${esc(String(b).slice(0, 44))}</span>
      <span style="font-family:${th.monoStack};font-size:${r(U(14))}cqw;letter-spacing:0.2em;color:${th.lamp};text-transform:uppercase;">${esc(ctx.S.ok)}</span>
    </div>`).join("")}
    ${list.map((b, i) => i < list.length - 1 ? `<div class="${id}-arr" style="position:absolute;left:${r(M + i * (each + gap) + each + gap * 0.18)}cqw;top:${r(U(516))}cqw;width:${r(gap * 0.64)}cqw;height:${r(U(6))}cqw;background:${th.steel};"></div>` : "").join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.2)});`,
      ...list.map((b, i) => `tl.fromTo(".${id}-st${i}",{opacity:0,y:"${r(U(50))}cqw"},{opacity:1,y:0,duration:${du(0.4)},ease:"back.out(1.6)"},${at(0.55 + i * 0.24)});`),
      `tl.fromTo(".${id}-arr",{scaleX:0},{scaleX:1,duration:${du(0.24)},ease:"power2.out",transformOrigin:"left center",stagger:${du(0.24)}},${at(0.78)});`,
      ...floorTweens(id, ctx),
    ],
  };
}

// ASSEMBLE — several bays at once. The row FITS the pictures; never a bay standing empty.
const BAYS = {
  2: [{ x: 96, y: 260, w: 840, h: 520 }, { x: 984, y: 260, w: 840, h: 520 }],
  3: [{ x: 96, y: 260, w: 546, h: 520 }, { x: 690, y: 260, w: 546, h: 520 }, { x: 1284, y: 260, w: 540, h: 520 }],
};
// INSPECT — the quality-check beat: copy left, a picture bay rising on the right under an
// inspection arm. RESTORED 4 Aug 2026 — the bundle-derived port dropped it.
// Reference geometry: copy 96/200 w620, eyebrow MONO 18/0.16em, head 84px, chips at 0.46+i*0.09;
// bay right 130 top 250 780x470 rising 560px on a back-ease.
function sInspect(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx), backdrop: floor(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(620) / K.camSafe(), U(84), 3, th.adv);
  const chips = K.bullets(scene, 3).map((b) => String(b).toUpperCase().slice(0, 20));
  return {
    backdrop: floor(id, th),
    html: `
    <div class="${id}-copy" style="position:absolute;left:${r(U(96))}cqw;top:${r(U(200))}cqw;width:${r(U(620))}cqw;z-index:6;opacity:0;">
      <div style="font-family:${th.monoStack};font-weight:600;font-size:${r(U(18))}cqw;letter-spacing:0.16em;color:${th.accent};margin-bottom:${r(U(14))}cqw;text-transform:uppercase;">${esc(String(scene.kicker || STRINGS.inspect).slice(0, 26))}</div>
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.95;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      ${chips.length ? `<div style="margin-top:${r(U(24))}cqw;display:flex;gap:${r(U(12))}cqw;flex-wrap:wrap;">${chips.map((c) => `<span class="ichip" style="display:inline-flex;align-items:center;gap:${r(U(8))}cqw;padding:${r(U(10))}cqw ${r(U(18))}cqw;border-radius:${r(U(8))}cqw;background:${th.panel};border:1px solid ${th.line};font-family:${th.monoStack};font-size:${r(U(15))}cqw;letter-spacing:0.08em;color:${th.ink};white-space:nowrap;opacity:0;"><span style="width:${r(U(7))}cqw;height:${r(U(7))}cqw;background:${th.accent};flex:0 0 auto;"></span>${esc(c)}</span>`).join("")}</div>` : ""}
    </div>
    <!-- The inspection arm: a jointed gantry that swings over the bay. -->
    <div class="${id}-arm" style="position:absolute;right:${r(U(300))}cqw;top:${r(U(90))}cqw;width:${r(U(14))}cqw;height:${r(U(170))}cqw;background:${th.line};transform-origin:top center;">
      <span style="position:absolute;bottom:${r(-U(10))}cqw;left:50%;translate:-50% 0;width:${r(U(46))}cqw;height:${r(U(22))}cqw;background:${th.accent};"></span>
    </div>
    <div class="${id}-bay" style="position:absolute;right:${r(U(130))}cqw;top:${r(U(250))}cqw;width:${r(U(780))}cqw;height:${r(U(470))}cqw;opacity:0;">
      ${bay(th, { cls: `${id}-b0`, x: 0, y: 0, w: U(780), h: U(470), shot, n: 1, label: STRINGS.inspect })}
    </div>`,
    s: [
      `tl.fromTo(".${id}-copy",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.28)},ease:"power3.out"},${at(0.12)});`,
      // `bay()` carries its OWN opacity:0, so fading only the wrapper left the card invisible —
      // the beat rendered as copy beside an empty frame. Both have to be raised.
      `tl.to(".${id}-bay",{opacity:1,duration:${du(0.1)},ease:"none"},${at(0.1)});`,
      `tl.to(".${id}-b0",{opacity:1,duration:${du(0.1)},ease:"none"},${at(0.1)});`,
      `tl.fromTo(".${id}-bay",{y:"${r(U(560))}cqw",scale:0.94},{y:0,scale:1,duration:${du(0.34)},ease:"back.out(1.5)",transformOrigin:"center bottom"},${at(0.1)});`,
      `tl.to(".${id}-arm",{rotation:9,duration:2.4,ease:"sine.inOut",repeat:${K.reps(ctx.L, 2.4)},yoyo:true},${r(ctx.T)});`,
      chips.length ? `tl.fromTo("#${id} .ichip",{opacity:0,y:"${r(U(16))}cqw"},{opacity:1,y:0,duration:${du(0.28)},ease:"back.out(1.7)",stagger:${du(0.09)}},${at(0.46)});` : "",
      ...floorTweens(id, ctx),
    ].filter(Boolean),
  };
}

function sAssemble(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const n = Math.min(3, shots.length);
  if (n < 2) return { ...K.statement(scene, ctx), backdrop: floor(id, th) };
  const grid = BAYS[n] || BAYS[2];
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(66), 1, th.adv);
  return {
    backdrop: floor(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(160))}cqw;width:${r(COL)}cqw;text-align:center;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;letter-spacing:-0.02em;color:${th.ink};opacity:0;z-index:6;">${esc(head.lines.join(" "))}</div>
    ${grid.map((t, i) => bay(th, { cls: `${id}-b${i}`, x: U(t.x), y: U(t.y), w: U(t.w), h: U(t.h), shot: shots[i], n: i + 1, label: STRINGS.assemble })).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.2)});`,
      ...grid.map((t, i) => `tl.to(".${id}-b${i}",{opacity:1,duration:${du(0.28)},ease:"none"},${at(0.5 + i * 0.26)});`),
      ...grid.map((t, i) => `tl.fromTo(".${id}-b${i}",{y:"${r(U(60))}cqw",scale:0.94},{y:0,scale:1,duration:${du(0.5)},ease:"back.out(1.5)"},${at(0.5 + i * 0.26)});`),
      ...floorTweens(id, ctx),
    ],
  };
}

// THROUGHPUT — the readouts, on equipment panels. Figures from the script only.
function sThroughput(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx, { centred: true }), backdrop: floor(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(76), 2, th.adv);
  const gap = U(34), each = (COL - gap * (stats.length - 1)) / stats.length;
  return {
    backdrop: floor(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(200))}cqw;width:${r(COL)}cqw;text-align:center;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:1.06;letter-spacing:-0.02em;color:${th.ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    ${stats.map((st, i) => `<div class="${id}-c${i}" style="position:absolute;left:${r(M + i * (each + gap))}cqw;top:${r(U(430))}cqw;width:${r(each)}cqw;height:${r(U(300))}cqw;background:${th.panel};border:${r(U(3))}cqw solid ${th.ink};border-top:${r(U(10))}cqw solid ${th.accent};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${r(U(10))}cqw;opacity:0;">
      <div style="font-family:${th.displayStack};font-weight:800;font-size:${r(U(98))}cqw;line-height:1;letter-spacing:-0.04em;color:${th.ink};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
      <div style="font-family:${th.monoStack};font-size:${r(U(17))}cqw;letter-spacing:0.2em;color:${th.sub};white-space:nowrap;overflow:hidden;">${esc(K.statLabel(scene, i))}</div>
    </div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.2)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-c${i}",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.42)},ease:"back.out(1.8)"},${at(0.6 + i * 0.26)});`,
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.66)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.72 + i * 0.26)});`,
        ];
      }),
      ...floorTweens(id, ctx),
    ],
  };
}

// SHIP — the close. A full-bleed safety-orange field, the mark, the call, the address.
function sShip(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const fg = K.inkOn(th.accent);
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, COL / K.camSafe(), U(136), 3, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 22) || STRINGS.go;
  const hasMark = !!(logo && logo.path);
  return {
    backdrop: `<div style="position:absolute;inset:0;background:${th.accent};"></div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:${r(U(120))}cqw;background:repeating-linear-gradient(115deg, ${rgba(th.ink, 0.9)} 0 ${r(U(30))}cqw, transparent ${r(U(30))}cqw ${r(U(90))}cqw);"></div>`,
    capTint: fg,
    html: `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${r(M)}cqw ${r(U(120))}cqw;">
      ${hasMark ? `<div class="${id}-logo" style="width:${r(U(126))}cqw;height:${r(U(126))}cqw;background:${th.panel};border:${r(U(3))}cqw solid ${th.ink};padding:${r(U(18))}cqw;margin-bottom:${r(U(34))}cqw;display:flex;align-items:center;justify-content:center;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div class="${id}-head" style="width:100%;text-align:center;font-family:${th.displayStack};font-weight:800;font-size:${r(head.size)}cqw;line-height:0.98;letter-spacing:-0.03em;color:${fg};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      <div class="${id}-pill" style="margin-top:${r(U(42))}cqw;display:flex;align-items:center;gap:${r(U(24))}cqw;opacity:0;">
        <span style="padding:${r(U(20))}cqw ${r(U(44))}cqw;background:${th.ink};color:${PANEL};font-family:${th.displayStack};font-weight:800;font-size:${r(K.fitOne(action, U(560), U(34), th.adv))}cqw;letter-spacing:0.02em;text-transform:uppercase;white-space:nowrap;">${esc(action)}</span>
        <span style="font-family:${th.monoStack};font-size:${r(U(21))}cqw;letter-spacing:0.16em;color:${rgba(fg, 0.9)};white-space:nowrap;">${esc(ctx.url)}</span>
      </div>
    </div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.45)},ease:"back.out(1.8)"},${at(0.28)});` : "",
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(36))}cqw"},{opacity:1,y:0,duration:${du(0.7)},ease:"power3.out"},${at(0.55)});`,
      `tl.fromTo(".${id}-pill",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:${du(0.45)},ease:"back.out(2)"},${at(1.2)});`,
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
const SPEC = {
  first: "boot", last: "ship",
  middle: ["line", "inspect", "assemble", "throughput"],
  shapes: { boot: [824 / 508], inspect: [780 / 420], assemble: [840 / 468, 840 / 468, 546 / 468], line: [], throughput: [], ship: [], statement: [], "statement-c": [] },
  slots: (role, budget) => (role === "boot" || role === "inspect" ? 1 : role === "assemble" ? Math.min(3, Math.max(0, budget)) : 0),
  needs: (role) => (role === "assemble" ? 2 : role === "inspect" ? 1 : 0),
  carry: (role, scene, budget) => {
    // Roles are picked by a ROTATING cursor, not by priority. `throughput` is the only layout that
    // prints figures AS figures, so every other role declines a beat carrying two or more.
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "throughput") return isStats;
    if (isStats) return false;
    if (role === "inspect") return budget >= 1;
    if (role === "line") return K.bullets(scene, 4).length >= 2;
    if (role === "assemble") return budget >= 2;
    return true;
  },
};
const BUILDERS = {
  boot: sBoot, line: sLine, inspect: sInspect, assemble: sAssemble, throughput: sThroughput, ship: sShip,
  statement: (sc, ctx) => ({ ...K.statement(sc, ctx), backdrop: floor(ctx.id, ctx.th) }),
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: floor(ctx.id, ctx.th) }),
};
const LABELS = {
  boot: STRINGS.boot, line: STRINGS.line, inspect: STRINGS.inspect, assemble: STRINGS.assemble,
  throughput: STRINGS.throughput, ship: STRINGS.go,
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border:${r(U(2))}cqw solid ${th.ink}; border-radius:0; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.4, camera: { push: 110, scale: 1.03 }, fallbackBrand: "PIPELINE",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
