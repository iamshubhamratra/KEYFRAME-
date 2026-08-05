// HACKER — a terminal/CRT film. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. Ported from the imported OM template "hacker" (1920x1080,
// SCENE_MAP = Boot/Access/Compile/Deploy/Metrics, transition="cut"). Its layout, rhythm and
// visual vocabulary are reproduced; none of its copy is — every string is either derived from
// the storyboard or is a neutral label on the film's own structure.
//
// THE LOOK. Near-black ground, phosphor green, one monospace face for the entire system.
// Everything is a terminal surface: bracketed prompts, boot logs that type themselves,
// progress bars that fill in discrete blocks, scanlines over the whole frame. Screenshots are
// framed as terminal windows with a titlebar path rather than as pictures on a wall.
//
// FONT SUBSTITUTION: the reference sets everything in JetBrains Mono, which IS bundled — this
// pack needs no substitution.
// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const { r, esc, rgba, U: _U } = K;   // eslint-disable-line no-unused-vars

const STAGE = K.stageOf(1920, 1080);
const { U, VH } = STAGE;

const BG = "#05080B", PANEL = "#0B1016", INK = "#D7F5E1", DIM = "#4C6B58", ACCENT = "#37FF7A";
const DISPLAY = "JetBrains Mono", MONO = "JetBrains Mono";

const STRINGS = {
  boot: "BOOT", access: "ACCESS", compile: "COMPILE", nodes: "DEPLOY", deploy: "SHIP", metrics: "METRICS",
  scene: "SCENE", of: "OF", ok: "OK", run: "RUN",
};

function theme(brandSkin) {
  // A dark ground LIFTS a brand accent rather than darkening it — a deep navy brand would
  // otherwise vanish into #05080B and take the prompts, bars and rules with it.
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: BG, isDark: true, packAccent: ACCENT });
  return {
    accent, bg: BG, panel: PANEL, ink: INK, sub: DIM,
    // Companion channels as rotations of the accent, so a rebranded terminal is not still
    // wearing the stock cyan/amber/magenta.
    cyan: K.spin(accent, 40, 0.04), amber: K.spin(accent, -70, 0.06), mag: K.spin(accent, 160, 0.02),
    line: rgba(accent, 0.22), glowInk: rgba(accent, 0.5),
    adv: K.ADVANCE.mono,
    capBg: "#05080B", capInk: INK,
    ...K.fontStacks(DISPLAY, MONO, "ui-monospace, monospace"),
    resolvedBrand,
  };
}

// ---- shared furniture --------------------------------------------------------
// The CRT: scanlines + a vignette, over everything. One element, no blur filter — the
// heavy-overlay lint counts blurred/gradient nodes and a per-scene stack of them is what
// makes a composition capture black.
function crt(id, th) {
  return `<div style="position:absolute;inset:0;background:${th.bg};overflow:hidden;">
    <div style="position:absolute;inset:0;background-image:repeating-linear-gradient(180deg, ${rgba(th.accent, 0.05)} 0 1px, transparent 1px 3px);opacity:0.8;"></div>
    <div class="${id}-flick" style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%, ${rgba(th.accent, 0.07)} 0%, transparent 62%);"></div>
  </div>`;
}
const crtTweens = (id, ctx) => [
  `tl.to(".${id}-flick",{opacity:0.55,duration:0.9,ease:"sine.inOut",repeat:${K.reps(ctx.L, 0.9)},yoyo:true},${r(ctx.T)});`,
];

// A bracketed prompt line — the pack's kicker.
const prompt = (th, text, size = U(18)) =>
  `<span style="font-family:${th.monoStack};font-size:${r(size)}cqw;letter-spacing:0.18em;color:${th.accent};text-transform:uppercase;">[ ${esc(text)} ]</span>`;

// A terminal window around a real picture. NEVER drawn without one — an empty container is
// the defect this program has had blocked twice.
function termWindow(th, { cls, x, y, w, h, path, shot, z = 2 }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};background:${th.panel};border:${r(U(2))}cqw solid ${rgba(th.accent, 0.4)};box-shadow:0 0 ${r(U(40))}cqw ${rgba(th.accent, 0.14)};display:flex;flex-direction:column;overflow:hidden;">
    <div style="height:${r(U(38))}cqw;flex-shrink:0;display:flex;align-items:center;gap:${r(U(10))}cqw;padding:0 ${r(U(14))}cqw;border-bottom:1px solid ${rgba(th.accent, 0.3)};font-family:${th.monoStack};font-size:${r(U(14))}cqw;letter-spacing:0.12em;color:${th.accent};">
      <span style="width:${r(U(9))}cqw;height:${r(U(9))}cqw;background:${th.accent};flex:0 0 auto;"></span>${esc(path)}
    </div>
    <div style="flex:1 1 auto;min-height:0;position:relative;">${K.shotFill(shot, { filter: "saturate(0.55) contrast(1.15)", bg: th.panel })}</div>
  </div>`;
}

// A block progress bar — filled in discrete cells, the way a terminal draws one.
function blockBar(th, { cls, x, y, w, cells = 24, h = U(22) }) {
  const cw = w / cells;
  return `<div style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;display:flex;gap:${r(cw * 0.18)}cqw;">
    ${Array.from({ length: cells }, (_, i) => `<span class="${cls}" style="flex:1 1 auto;height:100%;background:${th.accent};opacity:0;"></span>`).join("")}
  </div>`;
}

// ---- scenes ------------------------------------------------------------------
// BOOT — the film announces itself as a system coming up: a log types out line by line under
// a large bracketed title, and the hero screenshot mounts as a device.
function sBoot(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx, { centred: false }), backdrop: crt(id, th), s2: 1 };
  const head = K.fitLines(scene.headline || scene.title || ctx.title, U(880) / K.camSafe(), U(72), 3, th.adv);
  const log = K.bullets(scene, 3);

  return {
    backdrop: crt(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(U(96))}cqw;top:${r(U(210))}cqw;width:${r(U(880))}cqw;opacity:0;">
      <div style="margin-bottom:${r(U(20))}cqw;">${prompt(th, String(scene.kicker || STRINGS.boot).slice(0, 26))}</div>
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1.1;color:${th.ink};text-shadow:0 0 ${r(U(18))}cqw ${th.glowInk};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    ${log.map((b, i) => `<div class="${id}-log" style="position:absolute;left:${r(U(96))}cqw;top:${r(U(560) + i * U(52))}cqw;width:${r(U(880))}cqw;font-family:${th.monoStack};font-size:${r(U(22))}cqw;color:${th.sub};opacity:0;white-space:nowrap;overflow:hidden;"><span style="color:${th.accent};">&gt;</span> ${esc(String(b).slice(0, 46))} <span style="color:${th.accent};">[${esc(ctx.S.ok)}]</span></div>`).join("")}
    ${termWindow(th, { cls: `${id}-win`, x: U(1020), y: U(200), w: U(800), h: U(620), path: `~/${String(ctx.brand).toLowerCase().slice(0, 14)}`, shot })}
    <div class="${id}-cur" style="position:absolute;left:${r(U(96))}cqw;top:${r(U(560) + log.length * U(52))}cqw;width:${r(U(18))}cqw;height:${r(U(30))}cqw;background:${th.accent};"></div>`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,x:"${r(-U(30))}cqw"},{opacity:1,x:0,duration:${du(0.6)},ease:"power3.out"},${at(0.2)});`,
      `tl.fromTo(".${id}-win",{opacity:0,scaleY:0.02},{opacity:1,scaleY:1,duration:${du(0.7)},ease:"power3.out"},${at(0.5)});`,
      log.length ? `tl.fromTo(".${id}-log",{opacity:0,x:"${r(-U(16))}cqw"},{opacity:1,x:0,duration:${du(0.3)},ease:"none",stagger:${du(0.28)}},${at(1.1)});` : "",
      `tl.to(".${id}-cur",{opacity:0,duration:0.5,ease:"steps(1)",repeat:${K.reps(ctx.L, 0.5)},yoyo:true},${at(0.4)});`,
      ...crtTweens(id, ctx),
    ].filter(Boolean),
  };
}

// ACCESS — the reveal beat. A full-width banner glitches in over the screenshot.
function sAccess(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx, { centred: true }), backdrop: crt(id, th) };
  const word = String(scene.emphasis || scene.headline || "").toUpperCase().slice(0, 22);
  const size = K.fitOne(word, U(1500) / K.camSafe(), U(150), th.adv);
  const sub = String(scene.subtext || scene.body || "").slice(0, 96);
  // The band is the ONLY legible ground on this beat — the screenshot fills the rest of the
  // frame. So the band is sized around the type it carries, and the sub line lives INSIDE it.
  // Set on the raw screenshot the sub was unreadable, and collided with the word's glow.
  const subSize = sub ? K.fitOne(sub, U(1400) / K.camSafe(), U(24), 0.76) : 0;
  const padT = U(40);
  const gap = sub ? U(28) : 0;
  const bandH = padT + size + gap + subSize + padT;

  return {
    backdrop: crt(id, th),
    html: `
    ${termWindow(th, { cls: `${id}-win`, x: U(360), y: U(160), w: U(1200), h: U(760), path: `/var/${String(ctx.brand).toLowerCase().slice(0, 10)}`, shot, z: 1 })}
    <div class="${id}-band" style="position:absolute;left:0;top:${r(U(430))}cqw;width:100%;height:${r(bandH)}cqw;background:${rgba(th.bg, 0.94)};border-top:${r(U(3))}cqw solid ${th.accent};border-bottom:${r(U(3))}cqw solid ${th.accent};z-index:5;transform:scaleY(0);"></div>
    <div class="${id}-word" style="position:absolute;left:0;top:${r(U(430) + padT)}cqw;width:100%;text-align:center;z-index:6;font-family:${th.displayStack};font-weight:700;font-size:${r(size)}cqw;line-height:1;letter-spacing:0.02em;color:${th.accent};text-shadow:0 0 ${r(U(26))}cqw ${th.glowInk};opacity:0;">${esc(word)}</div>
    ${sub ? `<div class="${id}-sub" style="position:absolute;left:0;top:${r(U(430) + padT + size + gap)}cqw;width:100%;text-align:center;z-index:6;font-family:${th.monoStack};font-size:${r(subSize)}cqw;letter-spacing:0.16em;color:${th.sub};opacity:0;white-space:nowrap;">${esc(sub)}</div>` : ""}`,
    s: [
      `tl.fromTo(".${id}-win",{opacity:0},{opacity:1,duration:${du(0.4)},ease:"none"},${at(0.15)});`,
      `tl.fromTo(".${id}-band",{scaleY:0},{scaleY:1,duration:${du(0.35)},ease:"power3.out"},${at(0.7)});`,
      `tl.fromTo(".${id}-word",{opacity:0},{opacity:1,duration:${du(0.12)},ease:"steps(1)"},${at(0.95)});`,
      // The glitch: two hard x-jumps on step easing, then settle. No filters, no blend modes.
      `tl.to(".${id}-word",{x:"${r(U(14))}cqw",duration:${du(0.07)},ease:"steps(1)",repeat:3,yoyo:true},${at(1.05)});`,
      sub ? `tl.fromTo(".${id}-sub",{opacity:0},{opacity:1,duration:${du(0.3)},ease:"none"},${at(1.5)});` : "",
      ...crtTweens(id, ctx),
    ].filter(Boolean),
  };
}

// DEPLOY — the reference's fan-out beat: a centred headline, a deploy-log terminal down the
// middle, and two preview nodes either side carrying screenshots. RESTORED 4 Aug 2026 — the
// bundle-derived port had no equivalent (its `deploy` role is the reference's CTA, "Run"), so
// the film lost its only two-picture beat.
// Reference geometry: head centred at 120 (66px), log 600 wide at top 300, tiles 96/1284 x 280
// at 540x300.
function sNodes(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  if (!shots.length) return { ...K.statement(scene, ctx, { centred: true }), backdrop: crt(id, th) };
  const n = Math.min(2, shots.length);
  const text = String(scene.headline || scene.title || "").slice(0, 40);
  const size = K.fitOne(text, U(1500) / K.camSafe(), U(66), th.adv);
  const logs = K.bullets(scene, 5).map((b) => String(b).slice(0, 46));
  // With one picture the pair would leave a hole, so it takes the right bay alone and the log
  // widens — never a drawn terminal standing empty.
  const tiles = n === 2
    ? [{ x: U(96), w: U(540) }, { x: U(1284), w: U(540) }]
    : [{ x: U(1180), w: U(644) }];
  return {
    backdrop: crt(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:0;right:0;top:${r(U(120))}cqw;text-align:center;font-family:${th.monoStack};font-weight:800;font-size:${r(size)}cqw;color:${th.ink};text-shadow:0 0 ${r(U(16))}cqw ${th.glowInk};opacity:0;">${esc(text)}</div>
    <div class="${id}-log" style="position:absolute;left:${r(n === 2 ? U(660) : U(96))}cqw;top:${r(U(300))}cqw;width:${r(n === 2 ? U(600) : U(1040))}cqw;height:${r(U(300))}cqw;border:1px solid ${th.line};background:${rgba("#000000", 0.4)};box-sizing:border-box;padding:${r(U(18))}cqw;overflow:hidden;opacity:0;">
      ${logs.map((l) => `<div class="${id}-lg" style="font-family:${th.monoStack};font-size:${r(U(18))}cqw;line-height:1.7;color:${th.ink};white-space:nowrap;overflow:hidden;opacity:0;"><span style="color:${th.accent};">▸</span> ${esc(l)} <span style="color:${th.accent};">[${esc(ctx.S.ok)}]</span></div>`).join("")}
    </div>
    ${tiles.map((t, i) => termWindow(th, { cls: `${id}-t${i}`, x: t.x, y: U(280), w: t.w, h: U(300), path: `node-${i + 1}`, shot: shots[i] })).join("")}
    ${blockBar(th, { cls: `${id}-cell`, x: U(96), y: U(880), w: U(1728), cells: 30 })}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.22)},ease:"power3.out"},${at(0.06)});`,
      `tl.fromTo(".${id}-log",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.24)},ease:"power3.out"},${at(0.14)});`,
      logs.length ? `tl.to(".${id}-lg",{opacity:1,duration:${du(0.08)},ease:"steps(1)",stagger:${du(0.13)}},${at(0.2)});` : "",
      ...tiles.map((_t, i) => `tl.fromTo(".${id}-t${i}",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.34)},ease:"power3.out"},${at(0.28 + i * 0.14)});`),
      `tl.to(".${id}-cell",{opacity:1,duration:${du(0.05)},ease:"steps(1)",stagger:${du(0.055)}},${at(0.5)});`,
      ...crtTweens(id, ctx),
    ].filter(Boolean),
  };
}

// COMPILE — the work beat: a file list checks itself off beside a filling block bar.
function sCompile(scene, ctx) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.title || "", U(1500) / K.camSafe(), U(74), 2, th.adv);
  const files = K.bullets(scene, 4);

  return {
    backdrop: crt(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(U(96))}cqw;top:${r(U(170))}cqw;width:${r(U(1500))}cqw;opacity:0;">
      <div style="margin-bottom:${r(U(18))}cqw;">${prompt(th, String(scene.kicker || STRINGS.compile).slice(0, 26))}</div>
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1.08;color:${th.ink};text-shadow:0 0 ${r(U(16))}cqw ${th.glowInk};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    ${files.map((f, i) => `<div class="${id}-f" style="position:absolute;left:${r(U(96))}cqw;top:${r(U(470) + i * U(96))}cqw;width:${r(U(1728))}cqw;height:${r(U(74))}cqw;display:flex;align-items:center;gap:${r(U(22))}cqw;border-bottom:1px solid ${th.line};font-family:${th.monoStack};font-size:${r(U(28))}cqw;color:${th.ink};opacity:0;">
      <span style="color:${th.accent};flex:0 0 auto;">${K.pad2(i + 1)}</span>
      <span style="flex:1 1 auto;overflow:hidden;white-space:nowrap;">${esc(String(f).slice(0, 62))}</span>
      <span class="${id}-ok" style="color:${th.accent};flex:0 0 auto;opacity:0;">[${esc(ctx.S.ok)}]</span>
    </div>`).join("")}
    ${blockBar(th, { cls: `${id}-cell`, x: U(96), y: U(880), w: U(1728), cells: 30 })}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.55)},ease:"power3.out"},${at(0.2)});`,
      files.length ? `tl.fromTo(".${id}-f",{opacity:0,x:"${r(-U(24))}cqw"},{opacity:1,x:0,duration:${du(0.32)},ease:"power2.out",stagger:${du(0.26)}},${at(0.7)});` : "",
      files.length ? `tl.to(".${id}-ok",{opacity:1,duration:${du(0.12)},ease:"steps(1)",stagger:${du(0.26)}},${at(1.0)});` : "",
      `tl.to(".${id}-cell",{opacity:1,duration:${du(0.05)},ease:"steps(1)",stagger:${du(0.055)}},${at(0.8)});`,
      ...crtTweens(id, ctx),
    ].filter(Boolean),
  };
}

// METRICS — readouts in panel cards. Figures come from the script; nothing is invented.
function sMetrics(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx, { centred: true }), backdrop: crt(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(1500) / K.camSafe(), U(72), 2, th.adv);

  return {
    backdrop: crt(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:0;top:${r(U(190))}cqw;width:100%;text-align:center;opacity:0;">
      <div style="margin-bottom:${r(U(18))}cqw;">${prompt(th, String(scene.kicker || STRINGS.metrics).slice(0, 26))}</div>
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1.08;color:${th.ink};text-shadow:0 0 ${r(U(16))}cqw ${th.glowInk};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    <div style="position:absolute;left:0;top:${r(U(500))}cqw;width:100%;display:flex;justify-content:center;gap:${r(U(46))}cqw;">
      ${stats.map((st, i) => `<div class="${id}-c${i}" style="width:${r(U(420))}cqw;background:${th.panel};border:${r(U(2))}cqw solid ${rgba(th.accent, 0.34)};padding:${r(U(40))}cqw;text-align:center;opacity:0;">
        <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(84))}cqw;line-height:1;color:${th.accent};text-shadow:0 0 ${r(U(22))}cqw ${th.glowInk};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
        <div style="font-family:${th.monoStack};font-size:${r(U(17))}cqw;letter-spacing:0.18em;color:${th.sub};margin-top:${r(U(14))}cqw;white-space:nowrap;overflow:hidden;">${esc(K.statLabel(scene, i))}</div>
      </div>`).join("")}
    </div>`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.55)},ease:"power3.out"},${at(0.2)});`,
      // The figure lands EARLY: every frame before it does prints a number the script never
      // claimed, and this film is frame-sampled by review.
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-c${i}",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.4)},ease:"power3.out"},${at(0.7 + i * 0.24)});`,
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.7)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.82 + i * 0.24)});`,
        ];
      }),
      ...crtTweens(id, ctx),
    ].filter(Boolean),
  };
}

// DEPLOY — the close. A full-bleed accent field, the mark, the command, and the address.
function sDeploy(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(1500) / K.camSafe(), U(112), 2, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 20) || STRINGS.run;
  const hasMark = !!(logo && logo.path);

  return {
    backdrop: crt(id, th),
    capTint: th.ink,
    html: `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${r(U(200))}cqw;">
      ${hasMark ? `<div class="${id}-logo" style="width:${r(U(120))}cqw;height:${r(U(120))}cqw;border:${r(U(2))}cqw solid ${rgba(th.accent, 0.5)};background:${th.panel};padding:${r(U(16))}cqw;margin-bottom:${r(U(34))}cqw;display:flex;align-items:center;justify-content:center;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div class="${id}-head" style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1.06;color:${th.ink};text-align:center;text-shadow:0 0 ${r(U(24))}cqw ${th.glowInk};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      <div class="${id}-cmd" style="margin-top:${r(U(46))}cqw;display:flex;align-items:center;gap:${r(U(18))}cqw;padding:${r(U(20))}cqw ${r(U(40))}cqw;background:${th.accent};color:${K.inkOn(th.accent)};font-family:${th.monoStack};font-weight:700;font-size:${r(K.fitOne(action, U(420), U(30), th.adv))}cqw;letter-spacing:0.1em;text-transform:uppercase;white-space:nowrap;opacity:0;">$ ${esc(action)}<span class="${id}-blink" style="width:${r(U(14))}cqw;height:${r(U(24))}cqw;background:${K.inkOn(th.accent)};display:inline-block;"></span></div>
      <div class="${id}-url" style="margin-top:${r(U(30))}cqw;font-family:${th.monoStack};font-size:${r(U(22))}cqw;letter-spacing:0.14em;color:${th.sub};opacity:0;">${esc(ctx.url)}</div>
    </div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(2)"},${at(0.3)});` : "",
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(36))}cqw"},{opacity:1,y:0,duration:${du(0.7)},ease:"power3.out"},${at(0.55)});`,
      `tl.fromTo(".${id}-cmd",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:${du(0.45)},ease:"back.out(2)"},${at(1.2)});`,
      `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:${du(0.35)},ease:"none"},${at(1.5)});`,
      `tl.to(".${id}-blink",{opacity:0,duration:0.45,ease:"steps(1)",repeat:${K.reps(Math.max(0, ctx.L - 1.6 * ctx.k), 0.45)},yoyo:true},${at(1.6)});`,
      ...crtTweens(id, ctx),
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
const SPEC = {
  first: "boot", last: "deploy",
  middle: ["access", "nodes", "compile", "metrics"],
  shapes: { boot: [800 / (620 - 38)], access: [1200 / (760 - 38)], nodes: [540 / 262, 540 / 262], compile: [], metrics: [], deploy: [], statement: [], "statement-c": [] },
  slots: (role, budget) => (role === "nodes" ? Math.min(2, Math.max(0, budget)) : role === "boot" || role === "access" ? 1 : 0),
  needs: (role) => (role === "boot" || role === "access" || role === "nodes" ? 1 : 0),
  carry: (role, scene, budget) => {
    // Roles are picked by a ROTATING cursor, not by priority. `metrics` is the only layout that
    // prints figures AS figures, so every other role declines a beat carrying two or more.
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "metrics") return isStats;
    if (isStats) return false;
    if (role === "access" || role === "nodes") return budget >= 1;
    if (role === "compile") return K.bullets(scene, 4).length >= 2;
    return true;
  },
};
const BUILDERS = {
  boot: sBoot, access: sAccess, nodes: sNodes, compile: sCompile, metrics: sMetrics, deploy: sDeploy,
  statement: (sc, ctx) => ({ ...K.statement(sc, ctx), backdrop: crt(ctx.id, ctx.th) }),
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: crt(ctx.id, ctx.th) }),
};
const LABELS = { boot: STRINGS.boot, access: STRINGS.access, nodes: STRINGS.nodes, compile: STRINGS.compile, metrics: STRINGS.metrics, deploy: STRINGS.deploy };

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border:1px solid ${rgba(th.accent, 0.4)}; }
  #cap-text { font-family:${th.monoStack}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.4, camera: { push: 140, scale: 1.03 },
    signature: "technical", fallbackBrand: "TERMINAL",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
