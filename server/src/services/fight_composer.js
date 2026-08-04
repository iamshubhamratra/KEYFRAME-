// FIGHT — a fight-night promo. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. Ported from the imported OM template "fight" (1920x1080,
// SCENE_MAP = MainEvent/Challenger/Champion/Combos/Scorecard, transition="cut"). Its layout,
// rhythm and vocabulary are reproduced; none of its copy is.
//
// THE LOOK. Near-black arena, one hot red and one belt gold. Anton set enormous, tight and
// slightly skewed — a fight poster, not a UI. Beats land rather than arrive: type slams in on
// back-eased scale, the frame shakes on the hit, and a spotlight pool sits under every scene.
// Pictures ride in angled fighter cards with a corner flash and a name plate.
//
// FONT SUBSTITUTION: none — every reference face is now bundled (see src/fonts/pack_fonts.js).

// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U } = STAGE;

const BG = "#0B0B10", CANVAS = "#15151F", RING = "#20202C", INK = "#F5EFE6", SUB = "#8A8496";
const ACCENT = "#E23130";
// FONTS: the reference's Anton, plus its Oswald condensed for the tale-of-the-tape rows.
// ADVANCE: Oswald is condensed; it is used only for short measured runs here, but a
// measured advance pass against a render is still owed.
const DISPLAY = "Anton", MONO = "JetBrains Mono", BODY = "Oswald";
const ADV = 0.50;

const STRINGS = {
  main: "MAIN EVENT", challenger: "CHALLENGER", champion: "CHAMPION",
  combos: "THE TALE OF THE TAPE", card: "SCORECARD", vs: "VS",
  scene: "ROUND", of: "OF", go: "STEP IN",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: BG, isDark: true, packAccent: ACCENT });
  return {
    accent, bg: BG, panel: CANVAS, ring: RING, ink: INK, sub: SUB,
    // The belt gold, derived — a rebranded card should not still be handing out the stock gold.
    gold: K.spin(accent, 42, 0.22, 0.62),
    glow: rgba(accent, 0.5),
    adv: ADV,
    capBg: CANVAS, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO, `'${BODY}', sans-serif`, [BODY]),
    bodyStack: `'${BODY}', sans-serif`,
    resolvedBrand,
  };
}

// ---- furniture ---------------------------------------------------------------
// The arena: a spotlight pool, a canvas floor and the ring ropes across the foot. One
// gradient-painted layer per element — no blur filters, which is what keeps the heavy-overlay
// count down (a stack of them is what makes a composition capture black).
function arena(id, th) {
  return `<div style="position:absolute;inset:0;background:${th.bg};overflow:hidden;">
    <div class="${id}-spot" style="position:absolute;inset:0;background:radial-gradient(ellipse ${r(U(900))}cqw ${r(U(620))}cqw at 50% 34%, ${rgba(th.ink, 0.1)} 0%, transparent 70%);"></div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:${r(U(240))}cqw;background:linear-gradient(180deg, transparent, ${rgba(th.panel, 0.9)});"></div>
    ${[0, 1, 2].map((i) => `<div style="position:absolute;left:0;right:0;bottom:${r(U(70) + i * U(52))}cqw;height:${r(U(4))}cqw;background:${rgba(th.ring, 0.9)};"></div>`).join("")}
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%, transparent 40%, ${rgba("#000000", 0.55)} 100%);"></div>
  </div>`;
}
const arenaTweens = (id, ctx) => [
  `tl.to(".${id}-spot",{opacity:0.6,duration:1.1,ease:"sine.inOut",repeat:${K.reps(ctx.L, 1.1)},yoyo:true},${r(ctx.T)});`,
];

// The shake, on the frame's own camera layer. Used sparingly — one hit per beat, never a loop.
const hit = (id, ctx, t) => [
  `tl.to("#${id} .om-cam",{x:"${r(U(9))}cqw",duration:${ctx.du(0.05)},ease:"steps(1)",repeat:3,yoyo:true},${ctx.at(t)});`,
];

const banner = (th, text, color) =>
  `<span style="font-family:${th.monoStack};font-size:${r(U(17))}cqw;letter-spacing:0.3em;color:${color || th.gold};text-transform:uppercase;">${esc(text)}</span>`;

// An angled fighter card. Drawn ONLY around a real picture.
function fighterCard(th, { cls, x, y, w, h, shot, name, tilt = -3, tag }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;rotate:${tilt}deg;opacity:0;">
    <div style="position:absolute;inset:0;border:${r(U(4))}cqw solid ${th.gold};background:${th.panel};overflow:hidden;box-shadow:0 0 ${r(U(60))}cqw ${rgba("#000000", 0.7)};">
      ${K.shotFill(shot, { filter: "contrast(1.14) saturate(0.9)", bg: th.panel })}
      <div style="position:absolute;left:0;right:0;bottom:0;height:${r(U(150))}cqw;background:linear-gradient(180deg, transparent, ${rgba("#000000", 0.85)});"></div>
    </div>
    <div style="position:absolute;left:${r(-U(10))}cqw;top:${r(U(24))}cqw;padding:${r(U(8))}cqw ${r(U(18))}cqw;background:${th.accent};font-family:${th.monoStack};font-size:${r(U(15))}cqw;letter-spacing:0.24em;color:${K.inkOn(th.accent)};text-transform:uppercase;white-space:nowrap;">${esc(tag)}</div>
    ${name ? `<div style="position:absolute;left:${r(U(20))}cqw;right:${r(U(20))}cqw;bottom:${r(U(22))}cqw;font-family:${th.displayStack};font-size:${r(K.fitOne(name, w - U(44), U(56), ADV))}cqw;letter-spacing:-0.01em;text-transform:uppercase;color:${th.ink};white-space:nowrap;overflow:hidden;">${esc(name)}</div>` : ""}
  </div>`;
}

// ---- scenes ------------------------------------------------------------------
// MAIN EVENT — the poster. Enormous stacked type on a slight skew, the belt banner above, and
// the first fighter card behind it.
function sMainEvent(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  const head = K.fitLines(scene.headline || scene.title || ctx.title, U(1560) / K.camSafe(), U(184), 3, th.adv);

  return {
    backdrop: arena(id, th),
    html: `
    ${shot ? fighterCard(th, { cls: `${id}-card`, x: U(1180), y: U(150), w: U(620), h: U(760), shot, name: "", tilt: 3, tag: String(scene.kicker || STRINGS.main).slice(0, 18) }) : ""}
    <div class="${id}-ban" style="position:absolute;left:${r(U(96))}cqw;top:${r(U(210))}cqw;opacity:0;">${banner(th, String(scene.kicker || STRINGS.main).slice(0, 30))}</div>
    <div class="${id}-head" style="position:absolute;left:${r(U(96))}cqw;top:${r(U(262))}cqw;width:${r(shot ? U(1060) : U(1560))}cqw;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.9;letter-spacing:-0.02em;text-transform:uppercase;color:${th.ink};z-index:5;">
      ${head.lines.map((l, i) => `<span class="kw" style="display:block;overflow:hidden;"><span class="kwi ${id}-l" style="display:block;color:${i === 1 ? th.accent : th.ink};">${esc(l)}</span></span>`).join("")}
    </div>
    <div class="${id}-bar" style="position:absolute;left:${r(U(96))}cqw;top:${r(U(830))}cqw;width:${r(U(560))}cqw;height:${r(U(8))}cqw;background:${th.gold};transform:scaleX(0);transform-origin:left center;z-index:5;"></div>
    ${scene.subtext ? `<div class="${id}-sub" style="position:absolute;left:${r(U(96))}cqw;top:${r(U(866))}cqw;width:${r(U(900))}cqw;font-family:${th.monoStack};font-size:${r(U(22))}cqw;letter-spacing:0.14em;color:${th.sub};text-transform:uppercase;opacity:0;z-index:5;">${esc(String(scene.subtext).slice(0, 90))}</div>` : ""}`,
    s: [
      shot ? `tl.fromTo(".${id}-card",{opacity:0,scale:1.14},{opacity:1,scale:1,duration:${du(0.7)},ease:"power3.out"},${at(0.15)});` : "",
      `tl.fromTo(".${id}-ban",{opacity:0,x:"${r(-U(20))}cqw"},{opacity:1,x:0,duration:${du(0.35)},ease:"power2.out"},${at(0.3)});`,
      `tl.fromTo(".${id}-l",{yPercent:114,scaleY:1.3},{yPercent:0,scaleY:1,duration:${du(0.42)},ease:"back.out(1.6)",stagger:${du(0.16)}},${at(0.5)});`,
      ...hit(id, ctx, 0.72),
      `tl.fromTo(".${id}-bar",{scaleX:0},{scaleX:1,duration:${du(0.4)},ease:"power3.inOut"},${at(1.15)});`,
      scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0},{opacity:1,duration:${du(0.35)},ease:"none"},${at(1.35)});` : "",
      ...arenaTweens(id, ctx),
    ].filter(Boolean),
  };
}

// TAPE — the head-to-head. Two angled cards flank a struck VS; with one picture it becomes a
// single hero card and the copy takes the other half. Never two cards with one filled.
function sTape(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const n = Math.min(2, shots.length);
  if (n < 1) return { ...K.statement(scene, ctx), backdrop: arena(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(1560) / K.camSafe(), U(74), 1, th.adv);
  const names = K.bullets(scene, 2);

  const two = n === 2;
  return {
    backdrop: arena(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(U(180))}cqw;top:${r(U(150))}cqw;width:${r(U(1560))}cqw;text-align:center;font-family:${th.displayStack};font-size:${r(head.size)}cqw;letter-spacing:-0.01em;text-transform:uppercase;color:${th.ink};opacity:0;z-index:6;">${esc(head.lines.join(" "))}</div>
    ${fighterCard(th, {
    cls: `${id}-c0`, x: two ? U(150) : U(150), y: U(280), w: two ? U(660) : U(820), h: U(600),
    shot: shots[0], name: names[0] ? String(names[0]).slice(0, 22) : "", tilt: -3, tag: STRINGS.challenger,
  })}
    ${two ? fighterCard(th, {
    cls: `${id}-c1`, x: U(1110), y: U(280), w: U(660), h: U(600),
    shot: shots[1], name: names[1] ? String(names[1]).slice(0, 22) : "", tilt: 3, tag: STRINGS.champion,
  }) : `<div class="${id}-copy" style="position:absolute;left:${r(U(1030))}cqw;top:${r(U(330))}cqw;width:${r(U(740))}cqw;opacity:0;">
      ${names.map((b, i) => `<div style="display:flex;align-items:center;gap:${r(U(18))}cqw;padding:${r(U(20))}cqw 0;border-bottom:1px solid ${rgba(th.ink, 0.16)};"><span style="font-family:${th.displayStack};font-size:${r(U(40))}cqw;color:${th.gold};">${K.pad2(i + 1)}</span><span style="font-family:${th.displayStack};font-size:${r(U(38))}cqw;text-transform:uppercase;color:${th.ink};">${esc(String(b).slice(0, 30))}</span></div>`).join("")}
    </div>`}
    ${two ? `<div class="${id}-vs" style="position:absolute;left:50%;top:${r(U(520))}cqw;translate:-50% 0;font-family:${th.displayStack};font-size:${r(U(130))}cqw;line-height:1;color:${th.accent};text-transform:uppercase;text-shadow:0 0 ${r(U(40))}cqw ${th.glow};z-index:7;opacity:0;">${esc(STRINGS.vs)}</div>` : ""}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(20))}cqw"},{opacity:1,y:0,duration:${du(0.45)},ease:"power3.out"},${at(0.15)});`,
      `tl.fromTo(".${id}-c0",{opacity:0,x:"${r(-U(220))}cqw"},{opacity:1,x:0,duration:${du(0.55)},ease:"back.out(1.3)"},${at(0.4)});`,
      two ? `tl.fromTo(".${id}-c1",{opacity:0,x:"${r(U(220))}cqw"},{opacity:1,x:0,duration:${du(0.55)},ease:"back.out(1.3)"},${at(0.52)});`
        : `tl.fromTo(".${id}-copy",{opacity:0,x:"${r(U(40))}cqw"},{opacity:1,x:0,duration:${du(0.5)},ease:"power3.out"},${at(0.55)});`,
      two ? `tl.fromTo(".${id}-vs",{opacity:0,scale:2.4},{opacity:1,scale:1,duration:${du(0.35)},ease:"back.out(2.2)"},${at(1.0)});` : "",
      ...(two ? hit(id, ctx, 1.16) : []),
      ...arenaTweens(id, ctx),
    ].filter(Boolean),
  };
}

// COMBOS — the tale of the tape: numbered strikes that slam in one at a time.
// CHALLENGER — the reference's "old way" beat: copy left under a giant ghosted VS, no picture.
// RESTORED 4 Aug 2026 — the port collapsed Challenger and Champion into one `tape` beat, losing
// the film's whole setup/payoff structure. Reference: eyebrow 30/0.28em gold, headline 150px
// slam from 1.5, body 30/1.5 max 720; ghosted VS at right 90 top 120, 460px, accent at 0.14.
function sChallenger(scene, ctx) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.title || "", U(900) / K.camSafe(), U(150), 3, th.adv);
  const body = String(scene.subtext || "").trim().slice(0, 180);
  return {
    backdrop: arena(id, th),
    html: `
    <div style="position:absolute;right:${r(U(90))}cqw;top:${r(U(120))}cqw;font-family:${th.displayStack};font-size:${r(U(460))}cqw;line-height:0.8;color:${rgba(th.accent, 0.14)};">${esc(ctx.S.vs)}</div>
    <div style="position:absolute;left:${r(U(96))}cqw;top:${r(U(250))}cqw;width:${r(U(900))}cqw;z-index:6;">
      <div class="${id}-brow" style="font-family:${th.bodyStack};font-weight:600;font-size:${r(U(30))}cqw;letter-spacing:0.28em;text-transform:uppercase;color:${th.gold};opacity:0;">${esc(String(scene.kicker || STRINGS.challenger).slice(0, 26))}</div>
      <div class="${id}-head" style="margin-top:${r(U(10))}cqw;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.86;color:${th.ink};opacity:0;transform-origin:left center;text-transform:uppercase;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      ${body ? `<div class="${id}-body" style="margin-top:${r(U(26))}cqw;font-family:${th.bodyStack};font-weight:400;font-size:${r(U(30))}cqw;line-height:1.5;color:${rgba(th.ink, 0.8)};max-width:${r(U(720))}cqw;opacity:0;">${esc(body)}</div>` : ""}
    </div>`,
    s: [
      `tl.fromTo(".${id}-brow",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${du(0.22)},ease:"power3.out"},${at(0.06)});`,
      `tl.fromTo(".${id}-head",{opacity:0,scale:1.5},{opacity:1,scale:1,duration:${du(0.3)},ease:"expo.out"},${at(0.12)});`,
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${du(0.26)},ease:"power3.out"},${at(0.4)});` : "",
      ...arenaTweens(id, ctx),
    ].filter(Boolean),
  };
}

// CHAMPION — the payoff: copy left, the product on the jumbotron right, slamming in.
function sChampion(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx), backdrop: arena(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(640) / K.camSafe(), U(132), 3, th.adv);
  const body = String(scene.subtext || "").trim().slice(0, 150);
  return {
    backdrop: arena(id, th),
    html: `
    <div style="position:absolute;left:${r(U(96))}cqw;top:${r(U(240))}cqw;width:${r(U(640))}cqw;z-index:6;">
      <div class="${id}-brow" style="font-family:${th.bodyStack};font-weight:600;font-size:${r(U(30))}cqw;letter-spacing:0.28em;text-transform:uppercase;color:${th.gold};opacity:0;">${esc(String(scene.kicker || STRINGS.champion).slice(0, 26))}</div>
      <div class="${id}-head" style="margin-top:${r(U(10))}cqw;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.86;color:${th.ink};opacity:0;transform-origin:left center;text-transform:uppercase;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      ${body ? `<div class="${id}-body" style="margin-top:${r(U(24))}cqw;font-family:${th.bodyStack};font-weight:400;font-size:${r(U(28))}cqw;line-height:1.5;color:${rgba(th.ink, 0.82)};max-width:${r(U(560))}cqw;opacity:0;">${esc(body)}</div>` : ""}
    </div>
    <div class="${id}-jt" style="position:absolute;right:${r(U(96))}cqw;top:${r(U(210))}cqw;width:${r(U(900))}cqw;height:${r(U(560))}cqw;opacity:0;">
      ${fighterCard(th, { cls: `${id}-fc`, x: 0, y: 0, w: U(900), h: U(560), shot, name: K.clampWords(String(scene.emphasis || ctx.brand), 18), tilt: 0, tag: STRINGS.champion })}
    </div>`,
    s: [
      `tl.fromTo(".${id}-brow",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${du(0.22)},ease:"power3.out"},${at(0.05)});`,
      `tl.fromTo(".${id}-head",{opacity:0,scale:1.5},{opacity:1,scale:1,duration:${du(0.3)},ease:"expo.out"},${at(0.1)});`,
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${du(0.26)},ease:"power3.out"},${at(0.4)});` : "",
      // `fighterCard()` carries its OWN opacity:0, so fading only the wrapper would leave the
      // jumbotron invisible — the same defect the pipeline inspection bay had.
      `tl.fromTo(".${id}-jt",{opacity:0,scale:1.4},{opacity:1,scale:1,duration:${du(0.34)},ease:"expo.out"},${at(0.14)});`,
      `tl.to(".${id}-fc",{opacity:1,duration:${du(0.1)},ease:"none"},${at(0.14)});`,
      ...arenaTweens(id, ctx),
    ].filter(Boolean),
  };
}

function sCombos(scene, ctx) {
  const { id, th, at, du } = ctx;
  const list = K.bullets(scene, 4);
  if (list.length < 2) return { ...K.statement(scene, ctx), backdrop: arena(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(1560) / K.camSafe(), U(80), 1, th.adv);
  const top = U(390), rowH = (U(900) - top) / list.length;

  return {
    backdrop: arena(id, th),
    html: `
    <div class="${id}-ban" style="position:absolute;left:${r(U(180))}cqw;top:${r(U(190))}cqw;width:${r(U(1560))}cqw;text-align:center;opacity:0;">${banner(th, String(scene.kicker || STRINGS.combos).slice(0, 34))}</div>
    <div class="${id}-head" style="position:absolute;left:${r(U(180))}cqw;top:${r(U(232))}cqw;width:${r(U(1560))}cqw;text-align:center;font-family:${th.displayStack};font-size:${r(head.size)}cqw;letter-spacing:-0.01em;text-transform:uppercase;color:${th.ink};opacity:0;">${esc(head.lines.join(" "))}</div>
    ${list.map((b, i) => `<div class="${id}-row" style="position:absolute;left:${r(U(240))}cqw;top:${r(top + i * rowH)}cqw;width:${r(U(1440))}cqw;height:${r(rowH)}cqw;display:flex;align-items:center;gap:${r(U(34))}cqw;border-bottom:${r(U(2))}cqw solid ${rgba(th.gold, 0.34)};opacity:0;">
      <span style="font-family:${th.displayStack};font-size:${r(U(58))}cqw;color:${th.accent};flex:0 0 auto;min-width:${r(U(96))}cqw;text-shadow:0 0 ${r(U(24))}cqw ${th.glow};">${K.pad2(i + 1)}</span>
      <span style="font-family:${th.displayStack};font-size:${r(U(50))}cqw;letter-spacing:-0.01em;text-transform:uppercase;color:${th.ink};flex:1 1 auto;overflow:hidden;white-space:nowrap;">${esc(String(b).slice(0, 44))}</span>
    </div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-ban",{opacity:0},{opacity:1,duration:${du(0.3)},ease:"none"},${at(0.15)});`,
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(20))}cqw"},{opacity:1,y:0,duration:${du(0.45)},ease:"power3.out"},${at(0.3)});`,
      `tl.fromTo(".${id}-row",{opacity:0,x:"${r(-U(60))}cqw"},{opacity:1,x:0,duration:${du(0.3)},ease:"back.out(1.8)",stagger:${du(0.24)}},${at(0.65)});`,
      ...arenaTweens(id, ctx),
    ],
  };
}

// SCORECARD — the judges' numbers, on belt-gold plates. Figures come from the script only.
function sScorecard(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx, { centred: true }), backdrop: arena(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(1560) / K.camSafe(), U(86), 2, th.adv);

  return {
    backdrop: arena(id, th),
    html: `
    <div class="${id}-ban" style="position:absolute;left:${r(U(180))}cqw;top:${r(U(196))}cqw;width:${r(U(1560))}cqw;text-align:center;opacity:0;">${banner(th, String(scene.kicker || STRINGS.card).slice(0, 30))}</div>
    <div class="${id}-head" style="position:absolute;left:${r(U(180))}cqw;top:${r(U(240))}cqw;width:${r(U(1560))}cqw;text-align:center;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:1;letter-spacing:-0.01em;text-transform:uppercase;color:${th.ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    <div style="position:absolute;left:0;top:${r(U(500))}cqw;width:100%;display:flex;justify-content:center;gap:${r(U(46))}cqw;">
      ${stats.map((st, i) => `<div class="${id}-c${i}" style="width:${r(U(420))}cqw;background:${th.panel};border:${r(U(3))}cqw solid ${th.gold};padding:${r(U(40))}cqw;text-align:center;opacity:0;">
        <div style="font-family:${th.displayStack};font-size:${r(U(108))}cqw;line-height:1;color:${th.gold};text-shadow:0 0 ${r(U(26))}cqw ${rgba(th.gold, 0.4)};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
        <div style="font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.22em;color:${th.sub};margin-top:${r(U(12))}cqw;white-space:nowrap;overflow:hidden;">${esc(K.statLabel(scene, i))}</div>
      </div>`).join("")}
    </div>`,
    s: [
      `tl.fromTo(".${id}-ban",{opacity:0},{opacity:1,duration:${du(0.3)},ease:"none"},${at(0.15)});`,
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.28)});`,
      // The figure lands EARLY — every frame before it does prints a number the script never
      // claimed, and this film is frame-sampled by review.
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-c${i}",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.42)},ease:"back.out(2.2)"},${at(0.66 + i * 0.24)});`,
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.66)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.78 + i * 0.24)});`,
        ];
      }),
      ...arenaTweens(id, ctx),
    ],
  };
}

// STEP IN — the close. Full-bleed accent, the mark, the call, the address.
function sStepIn(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const fg = K.inkOn(th.accent);
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(1560) / K.camSafe(), U(168), 3, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 20) || STRINGS.go;
  const hasMark = !!(logo && logo.path);

  return {
    backdrop: `<div style="position:absolute;inset:0;background:${th.accent};"></div>
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%, ${rgba("#FFFFFF", 0.14)} 0%, transparent 65%);"></div>`,
    capTint: fg,
    html: `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${r(U(180))}cqw;">
      ${hasMark ? `<div class="${id}-logo" style="width:${r(U(120))}cqw;height:${r(U(120))}cqw;border:${r(U(3))}cqw solid ${rgba(fg, 0.6)};background:${rgba(fg, 0.1)};padding:${r(U(16))}cqw;margin-bottom:${r(U(32))}cqw;display:flex;align-items:center;justify-content:center;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div class="${id}-head" style="width:100%;text-align:center;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.92;letter-spacing:-0.02em;text-transform:uppercase;color:${fg};">
        ${head.lines.map((l) => `<span class="kw" style="display:block;overflow:hidden;"><span class="kwi ${id}-l" style="display:block;">${esc(l)}</span></span>`).join("")}
      </div>
      <div class="${id}-pill" style="margin-top:${r(U(42))}cqw;display:flex;align-items:center;gap:${r(U(24))}cqw;opacity:0;">
        <span style="padding:${r(U(20))}cqw ${r(U(46))}cqw;background:${fg};color:${th.accent};font-family:${th.displayStack};font-size:${r(K.fitOne(action, U(440), U(46), th.adv))}cqw;letter-spacing:0.02em;text-transform:uppercase;white-space:nowrap;">${esc(action)}</span>
        <span style="font-family:${th.monoStack};font-size:${r(U(21))}cqw;letter-spacing:0.16em;color:${rgba(fg, 0.9)};white-space:nowrap;">${esc(ctx.url)}</span>
      </div>
    </div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.45)},ease:"back.out(2)"},${at(0.25)});` : "",
      `tl.fromTo(".${id}-l",{yPercent:114,scaleY:1.25},{yPercent:0,scaleY:1,duration:${du(0.42)},ease:"back.out(1.6)",stagger:${du(0.15)}},${at(0.5)});`,
      ...hit(id, ctx, 0.72),
      `tl.fromTo(".${id}-pill",{opacity:0,scale:0.75},{opacity:1,scale:1,duration:${du(0.45)},ease:"back.out(2.2)"},${at(1.2)});`,
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
const SPEC = {
  first: "main", last: "stepin",
  middle: ["challenger", "champion", "tape", "combos", "card"],
  shapes: { main: [620 / 760], challenger: [], champion: [900 / 560], tape: [660 / 600, 660 / 600], combos: [], card: [], stepin: [], statement: [], "statement-c": [] },
  slots: (role, budget) => (role === "main" || role === "champion" ? 1 : role === "tape" ? Math.min(2, Math.max(0, budget)) : 0),
  needs: (role) => (role === "tape" || role === "champion" ? 1 : 0),
  carry: (role, scene, budget) => {
    // Roles are picked by a ROTATING cursor, not by priority. `card` is the only layout that
    // prints figures AS figures, so every other role declines a beat carrying two or more.
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "card") return isStats;
    if (isStats) return false;
    if (role === "champion") return budget >= 1;
    if (role === "challenger") return K.wordsOf(scene.emphasis || scene.headline || "").length >= 2;
    if (role === "tape") return budget >= 1;
    if (role === "combos") return K.bullets(scene, 4).length >= 2;
    return true;
  },
};
const BUILDERS = {
  main: sMainEvent, challenger: sChallenger, champion: sChampion, tape: sTape, combos: sCombos, card: sScorecard, stepin: sStepIn,
  statement: (sc, ctx) => ({ ...K.statement(sc, ctx), backdrop: arena(ctx.id, ctx.th) }),
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: arena(ctx.id, ctx.th) }),
};
const LABELS = { main: STRINGS.main, challenger: STRINGS.challenger, champion: STRINGS.champion, tape: STRINGS.combos, combos: STRINGS.combos, card: STRINGS.card, stepin: STRINGS.go };

const css = (th, stage) => K.baseCss(th, stage, `
  .kw { display:block; overflow:hidden; }
  .kwi { display:block; will-change:transform; }
  #cap-pill { border:1px solid ${rgba(th.gold, 0.4)}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.2, camera: { push: 130, scale: 1.04 }, fallbackBrand: "MAIN EVENT",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
