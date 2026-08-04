// ORBIT — a launch-control film. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. Ported from the imported OM template "orbit" (1920x1080,
// SCENE_MAP = Countdown/Liftoff/Feature/Fleet/Telemetry, transition="cut"). Its layout, rhythm
// and vocabulary are reproduced; none of its copy is.
//
// THE LOOK. Deep space ground, a cool blue accent against a hot flame orange, thin hairline
// panels with corner ticks — mission-control instrumentation rather than sci-fi chrome.
// A starfield sits under every beat; the countdown ticks in monospace; screenshots ride inside
// bracketed viewports labelled like telemetry feeds.
//
// FONT SUBSTITUTION: none. The reference's Space Grotesk + JetBrains Mono are both bundled.
// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U } = STAGE;

const BG = "#060814", PANEL = "#0E1426", INK = "#EAF0FF", SUB = "#8A93B2", LINE = "#26304A";
const ACCENT = "#5B8CFF";
const DISPLAY = "Space Grotesk", MONO = "JetBrains Mono";

const STRINGS = {
  countdown: "COUNTDOWN", liftoff: "LIFTOFF", feature: "PAYLOAD", fleet: "FLEET",
  telemetry: "TELEMETRY", scene: "SCENE", of: "OF", go: "GO", nominal: "NOMINAL",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: BG, isDark: true, packAccent: ACCENT });
  return {
    accent, bg: BG, panel: PANEL, ink: INK, sub: SUB, line: LINE,
    // The flame is the accent's opposite — a launch needs two temperatures, and deriving the
    // hot one keeps a rebranded film from still burning the stock orange.
    flame: K.spin(accent, 168, 0.06), gold: K.spin(accent, 200, 0.12),
    glow: rgba(accent, 0.45),
    adv: K.ADVANCE.mixed,
    capBg: "#0E1426", capInk: INK,
    ...K.fontStacks(DISPLAY, MONO),
    resolvedBrand,
  };
}

// ---- shared furniture --------------------------------------------------------
// The starfield: ONE gradient-painted layer, not N blurred divs. A per-scene stack of blurred
// nodes is what trips the renderer's heavy-overlay lint (and, per its field report, makes a
// composition capture solid black for half the render).
const STARS = [[6, 12], [17, 33], [28, 8], [39, 51], [47, 21], [58, 40], [66, 14], [74, 58],
  [83, 27], [91, 45], [12, 62], [23, 77], [35, 88], [52, 70], [69, 82], [88, 68], [96, 9], [3, 47]];
function space(id, th) {
  const dots = STARS.map(([x, y], i) => `radial-gradient(circle ${(i % 3) + 1}px at ${x}% ${y}%, ${rgba("#FFFFFF", 0.55 - (i % 3) * 0.12)} 0 100%, transparent 100%)`).join(",");
  return `<div style="position:absolute;inset:0;background:${th.bg};overflow:hidden;">
    <div class="${id}-stars" style="position:absolute;inset:${r(-U(60))}cqw;background:${dots};"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 118%, ${rgba(th.accent, 0.2)} 0%, transparent 58%);"></div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:${r(U(3))}cqw;background:linear-gradient(90deg, transparent, ${rgba(th.accent, 0.5)}, transparent);"></div>
  </div>`;
}
const spaceTweens = (id, ctx) => [
  `tl.to(".${id}-stars",{x:"${r(-U(34))}cqw",y:"${r(U(16))}cqw",duration:${r(Math.max(2, ctx.L))},ease:"none"},${r(ctx.T)});`,
];

// A hairline instrument panel with corner ticks. Drawn ONLY around real content.
function panel(th, { cls, x, y, w, h, label, inner, z = 2 }) {
  const t = U(18);
  const corner = (a, b) => `<span style="position:absolute;${a};width:${r(t)}cqw;height:${r(t)}cqw;border-${b};border-color:${th.accent};border-width:${r(U(2))}cqw;border-style:solid;"></span>`;
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};background:${th.panel};border:1px solid ${th.line};">
    ${corner("left:0;top:0", "left-color:x;border-top-width:" + r(U(2)) + "cqw;border-left-width:" + r(U(2)) + "cqw;border-right:0;border-bottom:0")}
    ${corner("right:0;bottom:0", "left:0;border-top:0;border-right-width:" + r(U(2)) + "cqw;border-bottom-width:" + r(U(2)) + "cqw")}
    ${label ? `<div style="position:absolute;left:${r(U(16))}cqw;top:${r(-U(13))}cqw;padding:0 ${r(U(10))}cqw;background:${th.bg};font-family:${th.monoStack};font-size:${r(U(14))}cqw;letter-spacing:0.2em;color:${th.accent};text-transform:uppercase;white-space:nowrap;">${esc(label)}</div>` : ""}
    <div style="position:absolute;inset:${r(U(10))}cqw;overflow:hidden;">${inner}</div>
  </div>`;
}

const kicker = (th, text) =>
  `<span style="font-family:${th.monoStack};font-size:${r(U(17))}cqw;letter-spacing:0.24em;color:${th.accent};text-transform:uppercase;">${esc(text)}</span>`;

// ---- scenes ------------------------------------------------------------------
// COUNTDOWN — the opener. A monospace clock ticks down beside the title while the first
// payload image mounts in a bracketed viewport.
function sCountdown(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx, { centred: true }), backdrop: space(id, th) };
  const head = K.fitLines(scene.headline || scene.title || ctx.title, U(820) / K.camSafe(), U(84), 3, th.adv);

  return {
    backdrop: space(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(U(96))}cqw;top:${r(U(250))}cqw;width:${r(U(820))}cqw;opacity:0;">
      <div style="margin-bottom:${r(U(20))}cqw;">${kicker(th, String(scene.kicker || STRINGS.countdown).slice(0, 28))}</div>
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1.02;letter-spacing:-0.03em;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    <div class="${id}-clock" style="position:absolute;left:${r(U(96))}cqw;top:${r(U(640))}cqw;display:flex;align-items:baseline;gap:${r(U(18))}cqw;opacity:0;">
      <span style="font-family:${th.monoStack};font-size:${r(U(15))}cqw;letter-spacing:0.24em;color:${th.sub};">T MINUS</span>
      <span class="${id}-num" style="font-family:${th.monoStack};font-weight:700;font-size:${r(U(96))}cqw;line-height:1;color:${th.accent};text-shadow:0 0 ${r(U(26))}cqw ${th.glow};">10</span>
    </div>
    ${panel(th, { cls: `${id}-vp`, x: U(1000), y: U(210), w: U(824), h: U(660), label: `${STRINGS.feature} 01`, inner: K.shotFill(shot, { bg: th.panel }) })}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(34))}cqw"},{opacity:1,y:0,duration:${du(0.7)},ease:"power3.out"},${at(0.25)});`,
      `tl.fromTo(".${id}-vp",{opacity:0,x:"${r(U(60))}cqw"},{opacity:1,x:0,duration:${du(0.8)},ease:"power3.out"},${at(0.45)});`,
      `tl.fromTo(".${id}-clock",{opacity:0},{opacity:1,duration:${du(0.3)},ease:"none"},${at(1.0)});`,
      // Ticks 10 -> 0 in whole numbers, then holds. Integer snap: a countdown showing 7.4 is
      // not a countdown.
      `tl.fromTo(".${id}-num",{innerText:10},{innerText:0,duration:${du(1.9)},ease:"none",snap:{innerText:1},onUpdate:function(){var e=document.querySelector(".${id}-num");if(e)e.textContent=String(Math.round(Number(e.textContent))).padStart(2,"0");}},${at(1.15)});`,
      ...spaceTweens(id, ctx),
    ],
  };
}

// LIFTOFF — the reveal. The payload rises out of frame-bottom on a flame column while the
// statement word burns in over it.
function sLiftoff(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx, { centred: true }), backdrop: space(id, th) };
  const word = String(scene.emphasis || scene.headline || "").slice(0, 26);
  const size = K.fitOne(word, U(1560) / K.camSafe(), U(112), th.adv);
  const sub = String(scene.subtext || scene.body || "").slice(0, 100);
  // The headline used to sit at U(872) — in the caption's lane, at the very foot of the frame.
  // It read as clipped and the caption crossed it. The beat now reads top-down (sub · word ·
  // payload) and the payload takes whatever height is left ABOVE the caption lane, so the
  // signature rise still plays but nothing is ever set where the caption lands.
  const wordTop = U(196);
  const panelTop = wordTop + size + U(52);
  const panelH = U(884) - panelTop;

  return {
    backdrop: space(id, th),
    html: `
    <div class="${id}-rise" style="position:absolute;left:${r(U(560))}cqw;top:${r(panelTop)}cqw;width:${r(U(800))}cqw;height:${r(panelH)}cqw;">
      ${panel(th, { cls: `${id}-vp`, x: 0, y: 0, w: U(800), h: panelH, label: STRINGS.liftoff, inner: K.shotFill(shot, { bg: th.panel }) })}
      <!-- Centred with the standalone \`translate\` property and started from opacity, NOT from
           an inline \`transform\`. GSAP owns \`transform\` the moment it tweens scaleY — an inline
           one there is both redundant (the fromTo sets it) and a trap, because GSAP replaces
           the whole property and would discard any centering expressed inside it. -->
      <div class="${id}-flame" style="position:absolute;left:50%;top:100%;width:${r(U(150))}cqw;height:${r(U(360))}cqw;translate:-50% 0;background:linear-gradient(180deg, ${rgba(th.flame, 0.85)} 0%, ${rgba(th.gold, 0.5)} 42%, transparent 100%);transform-origin:top center;opacity:0;"></div>
    </div>
    <div class="${id}-word" style="position:absolute;left:${r(U(180))}cqw;top:${r(wordTop)}cqw;width:${r(U(1560))}cqw;text-align:center;font-family:${th.displayStack};font-weight:700;font-size:${r(size)}cqw;line-height:1;letter-spacing:-0.03em;color:${th.ink};text-shadow:0 0 ${r(U(28))}cqw ${th.glow};opacity:0;z-index:6;">${esc(word)}</div>
    ${sub ? `<div class="${id}-sub" style="position:absolute;left:${r(U(180))}cqw;top:${r(U(126))}cqw;width:${r(U(1560))}cqw;text-align:center;font-family:${th.monoStack};font-size:${r(U(20))}cqw;letter-spacing:0.18em;color:${th.sub};opacity:0;z-index:6;">${esc(sub)}</div>` : ""}`,
    s: [
      `tl.fromTo(".${id}-rise",{y:"${r(U(560))}cqw"},{y:0,duration:${du(1.5)},ease:"power2.out"},${at(0.2)});`,
      `tl.fromTo(".${id}-flame",{scaleY:0,opacity:0},{scaleY:1,opacity:1,duration:${du(0.5)},ease:"power2.out"},${at(0.2)});`,
      `tl.to(".${id}-flame",{scaleY:0.66,duration:0.22,ease:"sine.inOut",repeat:${K.reps(Math.max(0, ctx.L - 0.7 * ctx.k), 0.22)},yoyo:true},${at(0.7)});`,
      sub ? `tl.fromTo(".${id}-sub",{opacity:0},{opacity:1,duration:${du(0.4)},ease:"none"},${at(0.5)});` : "",
      // Lands with the rise rather than long after it — the beat should not read headless for
      // most of its length now that the word sits at the top of the frame.
      `tl.fromTo(".${id}-word",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.6)},ease:"power3.out"},${at(0.8)});`,
      ...spaceTweens(id, ctx),
    ].filter(Boolean),
  };
}

// FLEET — several payload viewports at once. The grid FITS the pictures: two, three or four,
// never four boxes with two filled.
const FLEET_GRIDS = {
  2: [{ x: 96, y: 260, w: 840, h: 560 }, { x: 984, y: 260, w: 840, h: 560 }],
  3: [{ x: 96, y: 260, w: 546, h: 560 }, { x: 690, y: 260, w: 546, h: 560 }, { x: 1284, y: 260, w: 540, h: 560 }],
  4: [{ x: 96, y: 230, w: 840, h: 310 }, { x: 984, y: 230, w: 840, h: 310 },
    { x: 96, y: 580, w: 840, h: 310 }, { x: 984, y: 580, w: 840, h: 310 }],
};
// FEATURE — copy left, a console panel bobbing on the right. RESTORED 4 Aug 2026: the
// bundle-derived port dropped this beat, which is the film's only copy-beside-device layout.
// Reference geometry: copy 110/300 w640, eyebrow MONO 17/0.2em, head 92px, body 24/1.5 max 520,
// chips at 0.44+i*0.09; console right 110 top 210 900x560 with a slow bob.
function sFeature(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx), backdrop: space(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(640) / K.camSafe(), U(92), 3, th.adv);
  const body = String(scene.subtext || "").trim().slice(0, 140);
  const chips = K.bullets(scene, 3).map((b) => String(b).toUpperCase().slice(0, 18));
  return {
    backdrop: space(id, th),
    html: `
    <div class="${id}-copy" style="position:absolute;left:${r(U(110))}cqw;top:${r(U(300))}cqw;width:${r(U(640))}cqw;z-index:6;opacity:0;">
      <div style="font-family:${th.monoStack};font-size:${r(U(17))}cqw;letter-spacing:0.2em;color:${th.accent};margin-bottom:${r(U(14))}cqw;text-transform:uppercase;">${esc(String(scene.kicker || STRINGS.feature || "MISSION CONTROL").slice(0, 26))}</div>
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.96;color:${th.ink};${""}">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      ${body ? `<div style="margin-top:${r(U(22))}cqw;font-family:${th.displayStack};font-weight:400;font-size:${r(U(24))}cqw;line-height:1.5;color:${th.sub};max-width:${r(U(520))}cqw;">${esc(body)}</div>` : ""}
      ${chips.length ? `<div style="margin-top:${r(U(26))}cqw;display:flex;gap:${r(U(12))}cqw;flex-wrap:wrap;">${chips.map((c) => `<span class="ochip" style="display:inline-flex;align-items:center;gap:${r(U(8))}cqw;padding:${r(U(9))}cqw ${r(U(18))}cqw;border-radius:${r(U(999))}cqw;border:1px solid ${rgba(th.accent, 0.5)};background:${rgba(th.accent, 0.08)};font-family:${th.monoStack};font-size:${r(U(15))}cqw;letter-spacing:0.1em;color:${th.ink};white-space:nowrap;opacity:0;"><span style="width:${r(U(7))}cqw;height:${r(U(7))}cqw;border-radius:50%;background:${th.accent};flex:0 0 auto;"></span>${esc(c)}</span>`).join("")}</div>` : ""}
    </div>
    <div class="${id}-con" style="position:absolute;right:${r(U(110))}cqw;top:${r(U(210))}cqw;width:${r(U(900))}cqw;height:${r(U(560))}cqw;opacity:0;">
      ${panel(th, { cls: `${id}-cp`, x: 0, y: 0, w: U(900), h: U(560), label: STRINGS.feature || "CONSOLE", inner: K.shotFill(shot, { bg: th.panel }) })}
    </div>`,
    s: [
      `tl.fromTo(".${id}-copy",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.28)},ease:"power3.out"},${at(0.1)});`,
      `tl.fromTo(".${id}-con",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.4)},ease:"back.out(1.7)"},${at(0.1)});`,
      // The reference's slow bob — a console floating in zero g.
      `tl.to(".${id}-con",{y:"${r(U(10))}cqw",duration:3.9,ease:"sine.inOut",repeat:${K.reps(ctx.L, 3.9)},yoyo:true},${at(0.5)});`,
      chips.length ? `tl.fromTo("#${id} .ochip",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.3)},ease:"back.out(1.8)",stagger:${du(0.09)}},${at(0.44)});` : "",
      ...spaceTweens(id, ctx),
    ].filter(Boolean),
  };
}

function sFleet(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const n = Math.min(4, shots.length);
  if (n < 2) return { ...K.statement(scene, ctx), backdrop: space(id, th) };
  const grid = FLEET_GRIDS[n] || FLEET_GRIDS[2];
  const head = K.fitLines(scene.headline || scene.title || "", U(1500) / K.camSafe(), U(64), 1, th.adv);

  return {
    backdrop: space(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(U(210))}cqw;top:${r(U(120))}cqw;width:${r(U(1500))}cqw;text-align:center;opacity:0;z-index:6;">
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;letter-spacing:-0.02em;color:${th.ink};">${esc(head.lines.join(" "))}</div>
    </div>
    ${grid.map((t, i) => `<div class="${id}-t${i}" style="opacity:0;">${panel(th, { cls: `${id}-p${i}`, x: U(t.x), y: U(t.y), w: U(t.w), h: U(t.h), label: `${STRINGS.fleet} ${K.pad2(i + 1)}`, inner: K.shotFill(shots[i], { bg: th.panel }) })}</div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.2)});`,
      ...grid.map((t, i) => `tl.fromTo(".${id}-t${i}",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:${du(0.55)},ease:"back.out(1.4)"},${at(0.55 + i * 0.24)});`),
      ...spaceTweens(id, ctx),
    ],
  };
}

// TELEMETRY — readouts on hairline panels. Figures come from the script; nothing is invented.
function sTelemetry(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx, { centred: true }), backdrop: space(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(1500) / K.camSafe(), U(72), 2, th.adv);

  return {
    backdrop: space(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(U(210))}cqw;top:${r(U(200))}cqw;width:${r(U(1500))}cqw;text-align:center;opacity:0;">
      <div style="margin-bottom:${r(U(18))}cqw;">${kicker(th, String(scene.kicker || STRINGS.telemetry).slice(0, 28))}</div>
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1.06;letter-spacing:-0.02em;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    <div style="position:absolute;left:0;top:${r(U(510))}cqw;width:100%;display:flex;justify-content:center;gap:${r(U(48))}cqw;">
      ${stats.map((st, i) => `<div class="${id}-c${i}" style="width:${r(U(410))}cqw;background:${th.panel};border:1px solid ${th.line};border-top:${r(U(3))}cqw solid ${th.accent};padding:${r(U(42))}cqw;text-align:center;opacity:0;">
        <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(90))}cqw;line-height:1;letter-spacing:-0.03em;color:${th.accent};text-shadow:0 0 ${r(U(24))}cqw ${th.glow};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
        <div style="font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.2em;color:${th.sub};margin-top:${r(U(14))}cqw;white-space:nowrap;overflow:hidden;">${esc(K.statLabel(scene, i))}</div>
      </div>`).join("")}
    </div>`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.55)},ease:"power3.out"},${at(0.2)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-c${i}",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.45)},ease:"power3.out"},${at(0.7 + i * 0.26)});`,
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.7)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.82 + i * 0.26)});`,
        ];
      }),
      ...spaceTweens(id, ctx),
    ],
  };
}

// GO — the close. The mark, the statement, and a GO button on the accent.
function sGo(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(1500) / K.camSafe(), U(116), 2, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 20) || STRINGS.go;
  const hasMark = !!(logo && logo.path);

  return {
    backdrop: space(id, th),
    html: `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${r(U(200))}cqw;">
      ${hasMark ? `<div class="${id}-logo" style="width:${r(U(124))}cqw;height:${r(U(124))}cqw;border:1px solid ${th.line};background:${th.panel};padding:${r(U(18))}cqw;margin-bottom:${r(U(34))}cqw;display:flex;align-items:center;justify-content:center;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div class="${id}-head" style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1.0;letter-spacing:-0.03em;color:${th.ink};text-align:center;text-shadow:0 0 ${r(U(26))}cqw ${th.glow};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      <div class="${id}-pill" style="margin-top:${r(U(44))}cqw;display:flex;align-items:center;gap:${r(U(24))}cqw;opacity:0;">
        <span style="padding:${r(U(20))}cqw ${r(U(46))}cqw;background:${th.accent};color:${K.inkOn(th.accent)};font-family:${th.displayStack};font-weight:700;font-size:${r(K.fitOne(action, U(420), U(28), th.adv))}cqw;letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap;box-shadow:0 0 ${r(U(40))}cqw ${th.glow};">${esc(action)}</span>
        <span style="font-family:${th.monoStack};font-size:${r(U(20))}cqw;letter-spacing:0.14em;color:${th.sub};white-space:nowrap;">${esc(ctx.url)}</span>
      </div>
    </div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(2)"},${at(0.3)});` : "",
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.75)},ease:"power3.out"},${at(0.55)});`,
      `tl.fromTo(".${id}-pill",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(2.2)"},${at(1.25)});`,
      ...spaceTweens(id, ctx),
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
const SPEC = {
  first: "countdown", last: "go",
  middle: ["liftoff", "feature", "fleet", "telemetry"],
  shapes: {
    countdown: [824 / 660], liftoff: [800 / 620], feature: [900 / 560], fleet: [840 / 560, 840 / 560, 840 / 310, 840 / 310],
    telemetry: [], go: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "countdown" || role === "liftoff" || role === "feature" ? 1 : role === "fleet" ? Math.min(4, Math.max(0, budget)) : 0),
  needs: (role) => (role === "countdown" || role === "liftoff" || role === "feature" ? 1 : role === "fleet" ? 2 : 0),
  carry: (role, scene, budget) => {
    // Roles are picked by a ROTATING cursor, not by priority. `telemetry` is the only layout that
    // prints figures AS figures, so every other role declines a beat carrying two or more.
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "telemetry") return isStats;
    if (isStats) return false;
    if (role === "liftoff" || role === "feature") return budget >= 1;
    if (role === "fleet") return budget >= 2;
    return true;
  },
};
const BUILDERS = {
  countdown: sCountdown, liftoff: sLiftoff, feature: sFeature, fleet: sFleet, telemetry: sTelemetry, go: sGo,
  statement: (sc, ctx) => ({ ...K.statement(sc, ctx), backdrop: space(ctx.id, ctx.th) }),
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: space(ctx.id, ctx.th) }),
};
const LABELS = {
  countdown: STRINGS.countdown, liftoff: STRINGS.liftoff, feature: STRINGS.feature, fleet: STRINGS.fleet,
  telemetry: STRINGS.telemetry, go: STRINGS.go,
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border:1px solid ${th.line}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.4, camera: { push: 150, scale: 1.035 }, fallbackBrand: "ORBIT",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
