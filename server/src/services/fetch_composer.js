// FETCH — a park-day film. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. Ported from the imported OM template "fetch" (1920x1080,
// SCENE_MAP = Title/Run/Fetch/Feature/Stats, transition="cut"). Note the reference ships this
// file three times under different names — `launch` and `flightVertical` are byte-identical
// copies of it — so it is ported ONCE, here.
//
// THE LOOK. A bright park afternoon: pale blue sky, a warm sun, rolling grass in two greens
// with a scalloped horizon, and drifting clouds. Cream paper cards with soft rounded corners
// and a friendly chunky display face. One warm orange accent. The pack's signature is BOUNCE —
// everything arrives on an overshoot and settles, and a ball arcs across the frame on every
// beat. Pictures ride in rounded cards tilted a degree or two, like photos on a fridge.
//
// FONT SUBSTITUTION: none — every reference face is now bundled (see src/fonts/pack_fonts.js).

// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U, VH } = STAGE;

const SKY_TOP = "#EAF7FB", SKY = "#C7E7F1", GRASS = "#8FC15A", GRASS_DK = "#7CAF49";
const INK = "#3A352C", PAPER = "#FFFDF6", SUN = "#FFC24C", ACCENT = "#F2683C";
const DOG = "#E6A95C", DOG_DK = "#CE9142";
// FONTS: the reference's own Fredoka + Nunito, both bundled.
const DISPLAY = "Fredoka", MONO = "JetBrains Mono", BODY = "Nunito";

const STRINGS = {
  title: "OFF THE LEAD", run: "THE RUN", incoming: "INCOMING DELIVERY", fetch: "FETCH",
  feature: "GOOD STUFF", stats: "THE SCORE", scene: "LAP", of: "OF", go: "COME PLAY",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: PAPER, isDark: false, packAccent: ACCENT });
  return {
    accent, bg: SKY_TOP, sky: SKY, paper: PAPER, panel: PAPER, ink: INK,
    sub: "#7A7263", line: rgba(INK, 0.14),
    grass: GRASS, grassDk: GRASS_DK, sun: SUN,
    // The dog's own two tans. Not brand-derived and not optional: the cast reads these directly,
    // and an undefined fill is not "no colour" in SVG — it paints BLACK, which is how the first
    // shot of the run came back with a black dog in a pastel meadow.
    dog: DOG, dogDk: DOG_DK,
    adv: K.ADVANCE.mixed,
    capBg: PAPER, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO, `'${BODY}', system-ui, sans-serif`, [BODY]),
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    resolvedBrand,
  };
}

// ---- furniture ---------------------------------------------------------------
const M = U(96);
const COL = U(1920) - M * 2;
const HORIZON = VH * 0.66;

// THE PARK IS AN ILLUSTRATION, NOT A GRADIENT. This used to be CSS: a linear-gradient sky, a
// radial-gradient blob for the sun, three blurred ellipses for clouds and two green bands with a
// repeating-radial scallop. It read as a pale backdrop where the reference reads as a place — no
// hills, no fence, no trees, no grass, and a sun with no rays. The whole set now comes from
// fetch_furniture.js as flat SVG in the reference's own 1920x1080 coordinates.
const F = require("./fetch_furniture");
const park = (id, th, extra) => F.park(id, th, extra);
const parkTweens = (id, ctx) => F.parkTweens(id, ctx, K);

// The ball — arcs across the frame on every beat. Pure CSS, no asset needed.
const ball = (id, th) =>
  `<div class="${id}-ball" style="position:absolute;left:${r(-U(90))}cqw;top:${r(HORIZON - U(120))}cqw;width:${r(U(64))}cqw;height:${r(U(64))}cqw;border-radius:50%;background:radial-gradient(circle at 34% 30%, ${rgba("#FFFFFF", 0.7)} 0%, ${th.accent} 46%);box-shadow:0 ${r(U(8))}cqw ${r(U(18))}cqw ${rgba(INK, 0.3)};"></div>`;
const ballTween = (id, ctx) => [
  `tl.to(".${id}-ball",{x:"${r(U(2050))}cqw",duration:${r(Math.max(2.6, ctx.L))},ease:"none"},${ctx.at(0.2)});`,
  `tl.to(".${id}-ball",{y:"${r(-U(180))}cqw",duration:${r(Math.max(1.3, ctx.L / 2))},ease:"sine.out",yoyo:true,repeat:1},${ctx.at(0.2)});`,
  `tl.to(".${id}-ball",{rotate:720,duration:${r(Math.max(2.6, ctx.L))},ease:"none"},${ctx.at(0.2)});`,
];

// A fridge-photo card — rounded, tilted, cream-bordered. Never drawn empty.
function photoCard(th, { cls, x, y, w, h, shot, tilt = -2, z = 2 }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};rotate:${tilt}deg;border-radius:${r(U(28))}cqw;overflow:hidden;background:${th.paper};border:${r(U(12))}cqw solid ${th.paper};box-shadow:0 ${r(U(20))}cqw ${r(U(46))}cqw ${rgba(INK, 0.28)};opacity:0;">
    ${K.shotFill(shot, { bg: th.paper })}
  </div>`;
}

const pill = (th, t) =>
  `<span style="display:inline-block;padding:${r(U(10))}cqw ${r(U(26))}cqw;border-radius:${r(U(100))}cqw;background:${th.accent};color:${K.inkOn(th.accent, INK)};font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.2em;text-transform:uppercase;white-space:nowrap;">${esc(t)}</span>`;

// ---- scenes ------------------------------------------------------------------
// TITLE — the day begins. Bouncy title on the meadow with the first photo card.
function sTitle(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  const head = K.fitLines(scene.headline || scene.title || ctx.title,
    (shot ? U(840) : COL) / K.camSafe(), shot ? U(96) : U(140), 3, th.adv);
  return {
    backdrop: park(id, th),
    html: `
    <div class="${id}-pill" style="position:absolute;left:${r(M)}cqw;top:${r(U(180))}cqw;opacity:0;z-index:5;">${pill(th, String(scene.kicker || STRINGS.title).slice(0, 24))}</div>
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(244))}cqw;width:${r(shot ? U(840) : COL)}cqw;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:1.06;color:${th.ink};opacity:0;z-index:5;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    ${shot ? photoCard(th, { cls: `${id}-card`, x: U(1010), y: U(210), w: U(790), h: U(560), shot, tilt: 2.5 }) : ""}
    ${ball(id, th)}`,
    s: [
      `tl.fromTo(".${id}-pill",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.4)},ease:"back.out(2.6)"},${at(0.2)});`,
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(44))}cqw",scale:0.94},{opacity:1,y:0,scale:1,duration:${du(0.7)},ease:"back.out(1.8)"},${at(0.35)});`,
      shot ? `tl.to(".${id}-card",{opacity:1,duration:${du(0.26)},ease:"none"},${at(0.62)});` : "",
      shot ? `tl.fromTo(".${id}-card",{y:"${r(-U(160))}cqw",rotate:11},{y:0,rotate:2.5,duration:${du(0.85)},ease:"back.out(1.7)"},${at(0.62)});` : "",
      ...ballTween(id, ctx),
      ...parkTweens(id, ctx),
    ].filter(Boolean),
  };
}

// THE RUN — the beat this pack is named for, and it did not exist. The reference opens its second
// scene with the dog carrying a ball the width of the pasture while someone waits at the far fence,
// copy held at the top of the frame so the ground stays clear for it. Every one of our beats was a
// card or a plate on empty grass instead.
//
// It takes no picture on purpose: it is the pack's one wholly illustrated beat, and giving it a
// photo slot would put a screenshot exactly where the cast runs.
function sRun(scene, ctx) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.title || ctx.title, U(1500) / K.camSafe(), U(118), 2, th.adv);
  const kick = String(scene.kicker || STRINGS.incoming).toUpperCase().slice(0, 28);
  // Reference geometry, in its own 1920x1080 space: dog 160 -> 1230 at the ground line, someone
  // waiting at 1620, prints from 180 to just behind the dog's finish.
  const RUN_FROM = 0.08, RUN_DUR = 0.86;
  const cast = `${F.pawTrail(id, { from: 180, to: 1160, y: F.GROUND_Y + 92 })}
    ${F.master(id, th, { x: 1620, y: F.GROUND_Y + 70 })}
    ${F.dog(id, th, { x: 160, y: F.GROUND_Y + 78 })}`;
  return {
    backdrop: park(id, th, cast),
    html: `
    <div class="${id}-run-copy" style="position:absolute;left:0;right:0;top:${r(U(150))}cqw;text-align:center;opacity:0;">
      <div style="display:inline-block;padding:${r(U(10))}cqw ${r(U(30))}cqw;border-radius:${r(U(999))}cqw;background:${th.ink};color:${th.paper};font-family:${th.displayStack};font-weight:600;font-size:${r(U(30))}cqw;letter-spacing:0.02em;">${esc(kick)}</div>
      <div style="margin-top:${r(U(14))}cqw;font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.92;color:${th.ink};text-shadow:0 ${r(U(7))}cqw 0 ${rgba(INK, 0.12)};">
        ${head.lines.map((l) => `<div>${esc(l)}</div>`).join("")}
      </div>
    </div>`,
    s: [
      `tl.fromTo(".${id}-run-copy",{opacity:0,y:"${r(U(50))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"power3.out"},${at(0.12)});`,
      ...F.dogTweens(id, ctx, K, { spanX: 1070, from: RUN_FROM * ctx.L, dur: RUN_DUR * ctx.L }),
      ...F.masterTweens(id, ctx, K),
      ...F.pawTweens(id, ctx, K, { from: 0.1 * ctx.L, dur: RUN_DUR * ctx.L }),
      ...parkTweens(id, ctx),
    ],
  };
}

// FETCH — the reveal. A big card bounds in and the statement lands on a cream plate.
function sFetch(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx, { centred: true }), backdrop: park(id, th) };
  const word = String(scene.emphasis || scene.headline || "").slice(0, 28);
  const size = K.fitOne(word, U(1360) / K.camSafe(), U(110), th.adv);
  // The plate was pinned to U(780) whatever it contained, so with a subtext it ran down into
  // the caption's lane and the caption crossed it. Measure the plate, seat its FOOT clear of
  // the caption, and give the photo card whatever height is left above it.
  const plateH = U(60) + size * 1.08 + (scene.subtext ? U(45) : 0);
  const plateTop = U(886) - plateH;
  const cardH = plateTop - U(110) - U(46);
  return {
    backdrop: park(id, th),
    html: `
    ${photoCard(th, { cls: `${id}-card`, x: U(530), y: U(110), w: U(860), h: cardH, shot, tilt: -2 })}
    <div class="${id}-plate" style="position:absolute;left:${r(U(280))}cqw;top:${r(plateTop)}cqw;width:${r(U(1360))}cqw;padding:${r(U(30))}cqw ${r(U(44))}cqw;background:${th.paper};border-radius:${r(U(30))}cqw;box-shadow:0 ${r(U(18))}cqw ${r(U(42))}cqw ${rgba(INK, 0.28)};text-align:center;opacity:0;z-index:6;">
      <div style="font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:1.08;color:${th.ink};">${esc(word)}</div>
      ${scene.subtext ? `<div style="margin-top:${r(U(12))}cqw;font-family:${th.bodyStack};font-weight:500;font-size:${r(U(25))}cqw;color:${th.sub};">${esc(String(scene.subtext).slice(0, 96))}</div>` : ""}
    </div>
    ${ball(id, th)}`,
    s: [
      `tl.to(".${id}-card",{opacity:1,duration:${du(0.26)},ease:"none"},${at(0.15)});`,
      `tl.fromTo(".${id}-card",{y:"${r(-U(220))}cqw",rotate:-13,scale:0.86},{y:0,rotate:-2,scale:1,duration:${du(0.9)},ease:"back.out(1.8)"},${at(0.15)});`,
      `tl.fromTo(".${id}-plate",{opacity:0,y:"${r(U(46))}cqw",scale:0.88},{opacity:1,y:0,scale:1,duration:${du(0.55)},ease:"back.out(2.2)"},${at(0.9)});`,
      ...ballTween(id, ctx),
      ...parkTweens(id, ctx),
    ],
  };
}

// GOOD STUFF — the points, as bouncy cream chips on the meadow.
function sFeature(scene, ctx) {
  const { id, th, at, du } = ctx;
  const list = K.bullets(scene, 4);
  if (list.length < 2) return { ...K.statement(scene, ctx), backdrop: park(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(76), 1, th.adv);
  const gap = U(28), each = (COL - gap * (list.length - 1)) / list.length;
  // Cards as tall as their copy left the whole lower half of the frame as empty grass. They
  // reach the stage foot and centre their content instead.
  const CARD_TOP = U(380), CARD_H = U(880) - CARD_TOP;
  return {
    backdrop: park(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(180))}cqw;width:${r(COL)}cqw;text-align:center;font-family:${th.displayStack};font-size:${r(head.size)}cqw;color:${th.ink};opacity:0;z-index:6;">${esc(head.lines.join(" "))}</div>
    ${list.map((b, i) => `<div class="${id}-p${i}" style="position:absolute;left:${r(M + i * (each + gap))}cqw;top:${r(CARD_TOP)}cqw;width:${r(each)}cqw;height:${r(CARD_H)}cqw;box-sizing:border-box;padding:${r(U(32))}cqw ${r(U(26))}cqw;background:${th.paper};border-radius:${r(U(30))}cqw;box-shadow:0 ${r(U(14))}cqw ${r(U(34))}cqw ${rgba(INK, 0.26)};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0;z-index:7;">
      <span style="display:inline-grid;place-items:center;width:${r(U(58))}cqw;height:${r(U(58))}cqw;border-radius:50%;background:${th.accent};color:${K.inkOn(th.accent, INK)};font-family:${th.displayStack};font-size:${r(U(28))}cqw;margin-bottom:${r(U(16))}cqw;">${K.pad2(i + 1)}</span>
      <div style="font-family:${th.bodyStack};font-weight:700;font-size:${r(U(27))}cqw;line-height:1.3;color:${th.ink};">${esc(String(b).slice(0, 40))}</div>
    </div>`).join("")}
    ${ball(id, th)}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"back.out(1.8)"},${at(0.2)});`,
      ...list.map((b, i) => `tl.fromTo(".${id}-p${i}",{opacity:0,y:"${r(-U(90))}cqw",scale:0.8},{opacity:1,y:0,scale:1,duration:${du(0.5)},ease:"back.out(2.2)"},${at(0.55 + i * 0.24)});`),
      ...ballTween(id, ctx),
      ...parkTweens(id, ctx),
    ],
  };
}

// THE SCORE — figures on cream rosettes. From the script only.
function sStats(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx, { centred: true }), backdrop: park(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(78), 2, th.adv);
  const gap = U(44), each = Math.min(U(420), (COL - gap * (stats.length - 1)) / stats.length);
  const startX = (U(1920) - (each * stats.length + gap * (stats.length - 1))) / 2;
  return {
    backdrop: park(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(190))}cqw;width:${r(COL)}cqw;text-align:center;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:1.1;color:${th.ink};opacity:0;z-index:6;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    ${stats.map((st, i) => `<div class="${id}-c${i}" style="position:absolute;left:${r(startX + i * (each + gap))}cqw;top:${r(U(450))}cqw;width:${r(each)}cqw;height:${r(each)}cqw;border-radius:50%;background:${th.paper};box-shadow:0 ${r(U(18))}cqw ${r(U(44))}cqw ${rgba(INK, 0.28)};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${r(U(8))}cqw;opacity:0;z-index:7;">
      <div style="font-family:${th.displayStack};font-size:${r(U(88))}cqw;line-height:1;color:${th.accent};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
      <div style="font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.18em;color:${th.sub};white-space:nowrap;overflow:hidden;max-width:80%;">${esc(K.statLabel(scene, i))}</div>
    </div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"back.out(1.8)"},${at(0.2)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-c${i}",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(2.4)"},${at(0.6 + i * 0.26)});`,
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.68)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.74 + i * 0.26)});`,
        ];
      }),
      ...parkTweens(id, ctx),
    ],
  };
}

// COME PLAY — the close, on a big cream card in the meadow.
function sComePlay(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(1340) / K.camSafe(), U(112), 3, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 20) || STRINGS.go;
  const hasMark = !!(logo && logo.path);
  return {
    backdrop: park(id, th),
    html: `
    <div class="${id}-card" style="position:absolute;left:${r(U(250))}cqw;top:${r(U(190))}cqw;width:${r(U(1420))}cqw;padding:${r(U(58))}cqw;background:${th.paper};border-radius:${r(U(44))}cqw;box-shadow:0 ${r(U(26))}cqw ${r(U(60))}cqw ${rgba(INK, 0.3)};display:flex;flex-direction:column;align-items:center;gap:${r(U(26))}cqw;opacity:0;z-index:6;">
      ${hasMark ? `<div style="width:${r(U(130))}cqw;height:${r(U(130))}cqw;border-radius:${r(U(34))}cqw;background:${rgba(th.accent, 0.14)};padding:${r(U(20))}cqw;display:flex;align-items:center;justify-content:center;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div style="width:100%;text-align:center;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:1.08;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      <div class="${id}-pill" style="display:flex;align-items:center;gap:${r(U(22))}cqw;opacity:0;">
        <span style="padding:${r(U(20))}cqw ${r(U(48))}cqw;border-radius:${r(U(100))}cqw;background:${th.accent};color:${K.inkOn(th.accent, INK)};font-family:${th.displayStack};font-size:${r(K.fitOne(action, U(520), U(34), th.adv))}cqw;white-space:nowrap;box-shadow:0 ${r(U(10))}cqw ${r(U(26))}cqw ${rgba(th.accent, 0.5)};">${esc(action)}</span>
        <span style="font-family:${th.monoStack};font-size:${r(U(21))}cqw;letter-spacing:0.14em;color:${th.sub};white-space:nowrap;">${esc(ctx.url)}</span>
      </div>
    </div>
    ${ball(id, th)}`,
    s: [
      `tl.fromTo(".${id}-card",{opacity:0,y:"${r(U(70))}cqw",scale:0.9},{opacity:1,y:0,scale:1,duration:${du(0.75)},ease:"back.out(1.8)"},${at(0.3)});`,
      `tl.fromTo(".${id}-pill",{opacity:0,scale:0.55},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(2.6)"},${at(1.1)});`,
      ...ballTween(id, ctx),
      ...parkTweens(id, ctx),
    ],
  };
}

// ---- spine -------------------------------------------------------------------
const SPEC = {
  first: "title", last: "comeplay",
  middle: ["run", "fetch", "feature", "stats"],
  shapes: { title: [790 / 560], run: [], fetch: [860 / 600], feature: [], stats: [], comeplay: [], statement: [], "statement-c": [] },
  slots: (role) => (role === "title" || role === "fetch" ? 1 : 0),
  needs: (role) => (role === "fetch" ? 1 : 0),
  carry: (role, scene, budget) => {
    if (role === "fetch") return budget >= 1;
    if (role === "feature") return K.bullets(scene, 4).length >= 2;
    if (role === "stats") return K.numbersIn(scene).length >= 2;
    return true;
  },
};
const BUILDERS = {
  title: sTitle, run: sRun, fetch: sFetch, feature: sFeature, stats: sStats, comeplay: sComePlay,
  statement: (sc, ctx) => ({ ...K.statement(sc, ctx), backdrop: park(ctx.id, ctx.th) }),
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: park(ctx.id, ctx.th) }),
};
const LABELS = {
  title: STRINGS.title, run: STRINGS.run, fetch: STRINGS.fetch, feature: STRINGS.feature,
  stats: STRINGS.stats, comeplay: STRINGS.go,
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border-radius:${r(stage.U(18))}cqw; box-shadow:0 ${r(stage.U(10))}cqw ${r(stage.U(26))}cqw ${rgba(INK, 0.26)}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.2, camera: { push: 120, scale: 1.03 },
    signature: "organic", fallbackBrand: "FETCH",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
