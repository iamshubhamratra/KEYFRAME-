// JUNGLE — a rainforest expedition. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. Ported from the imported OM template "jungle" (1920x1080,
// SCENE_MAP = Enter/Discover/Trek/Sightings/Census, transition="cut").
//
// THE LOOK. Layered canopy: four bands of green from pale mist at the horizon to near-black
// undergrowth at the foot, each drifting at its own speed so the frame has depth. Warm cream
// paper for cards, one marigold accent and a coral pop. Leaves sway, fireflies drift, and a
// hand-lettered display face carries every headline. Pictures ride in leaf-cut frames — a card
// with two opposite corners rounded hard, like a leaf — pinned with a wooden peg.
//
// FONT SUBSTITUTION: none — every reference face is now bundled (see src/fonts/pack_fonts.js).

// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const F = require("./jungle_furniture");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U, VH } = STAGE;

const SKY_A = "#DFF3D0", SKY_B = "#B7E39A";
const C1 = "#2E6B3E", C2 = "#245A34", C3 = "#173F26", C4 = "#0E2C1B";
const INK = "#12301E", PAPER = "#FCF7E9", WOOD = "#8A5A2B", ACCENT = "#F4A100";
// FONTS: the reference's own Chewy + Nunito, both bundled.
const DISPLAY = "Chewy", MONO = "JetBrains Mono", BODY = "Nunito";

const STRINGS = {
  enter: "EXPEDITION", discover: "DISCOVERY", trek: "THE TREK",
  sightings: "SIGHTINGS", census: "THE COUNT", scene: "STAGE", of: "OF", go: "COME ALONG",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: PAPER, isDark: false, packAccent: ACCENT });
  return {
    accent, bg: SKY_A, paper: PAPER, panel: PAPER, ink: INK, sub: "#4A6B52", line: rgba(INK, 0.16),
    c1: C1, c2: C2, c3: C3, c4: C4, wood: WOOD,
    // The coral pop, derived so a rebranded expedition is not still spotting the stock red.
    pop: K.spin(accent, 330, 0.06, 0.66),
    leaf: K.spin(accent, 96, -0.1, 0.42),
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

// Four canopy bands, each a solid silhouette with a scalloped top edge painted as repeating
// radial gradients. Solids and gradients only — no blur filters.
const scallop = (c, size) =>
  `repeating-radial-gradient(circle ${size}px at ${size}px 0, ${c} 0 ${size}px, transparent ${size}px)`;
// REBUILT 5 Aug 2026 against the readable reference. Twenty trigonometric calls drive the
// reference's JungleBG and the port carried none of them: no light shafts, no parallax canopy,
// no hanging vines, no fronds, no fireflies, no butterflies. See jungle_furniture.js.
function canopy(id, th) {
  return F.jungleBg({ ...th, skyA: th.bg, skyB: SKY_B }, { cls: id });
}
const canopyTweens = (id, ctx) => F.jungleTweens(ctx, { cls: id });

// A leaf-cut card — two opposite corners rounded hard — pinned with a wooden peg. Only ever
// drawn around a real picture.
function leafCard(th, { cls, x, y, w, h, shot, tilt = -2, z = 2 }) {
  const rad = Math.min(w, h) * 0.42;
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};rotate:${tilt}deg;opacity:0;">
    <div style="position:absolute;inset:0;border-radius:${r(rad)}cqw 0 ${r(rad)}cqw 0;overflow:hidden;background:${th.paper};border:${r(U(8))}cqw solid ${th.paper};box-shadow:0 ${r(U(22))}cqw ${r(U(50))}cqw ${rgba("#06180E", 0.4)};">
      ${K.shotFill(shot, { bg: th.paper })}
    </div>
    <span style="position:absolute;left:50%;top:${r(-U(16))}cqw;translate:-50% 0;width:${r(U(28))}cqw;height:${r(U(28))}cqw;border-radius:50%;background:${th.wood};box-shadow:0 ${r(U(4))}cqw ${r(U(8))}cqw ${rgba("#06180E", 0.5)};"></span>
  </div>`;
}

const badge = (th, t) =>
  `<span style="display:inline-block;padding:${r(U(10))}cqw ${r(U(24))}cqw;border-radius:${r(U(100))}cqw;background:${th.accent};color:${K.inkOn(th.accent, INK)};font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.2em;text-transform:uppercase;white-space:nowrap;">${esc(t)}</span>`;

// ---- scenes ------------------------------------------------------------------
// ENTER — the expedition begins. Hand-lettered title over the canopy, first leaf card beside it.
function sEnter(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  const head = K.fitLines(scene.headline || scene.title || ctx.title,
    (shot ? U(840) : COL) / K.camSafe(), shot ? U(96) : U(140), 3, th.adv);
  return {
    backdrop: canopy(id, th),
    html: `
    <div class="${id}-badge" style="position:absolute;left:${r(M)}cqw;top:${r(U(190))}cqw;opacity:0;z-index:5;">${badge(th, String(scene.kicker || STRINGS.enter).slice(0, 26))}</div>
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(250))}cqw;width:${r(shot ? U(840) : COL)}cqw;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:1.06;color:${th.paper};text-shadow:0 ${r(U(6))}cqw ${r(U(16))}cqw ${rgba("#06180E", 0.55)};opacity:0;z-index:5;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    ${shot ? leafCard(th, { cls: `${id}-card`, x: U(1030), y: U(230), w: U(760), h: U(560), shot, tilt: 2.5 }) : ""}`,
    s: [
      `tl.fromTo(".${id}-badge",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.4)},ease:"back.out(2.4)"},${at(0.2)});`,
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(38))}cqw"},{opacity:1,y:0,duration:${du(0.7)},ease:"back.out(1.3)"},${at(0.35)});`,
      shot ? `tl.to(".${id}-card",{opacity:1,duration:${du(0.3)},ease:"none"},${at(0.65)});` : "",
      shot ? `tl.fromTo(".${id}-card",{scale:0.82,rotate:9},{scale:1,rotate:2.5,duration:${du(0.8)},ease:"back.out(1.5)"},${at(0.65)});` : "",
      shot ? `tl.to(".${id}-card",{rotate:0.5,duration:2.8,ease:"sine.inOut",repeat:${K.reps(Math.max(0, ctx.L - 1.5 * ctx.k), 2.8)},yoyo:true},${at(1.5)});` : "",
      ...canopyTweens(id, ctx),
    ].filter(Boolean),
  };
}

// DISCOVER — the reveal. A big leaf card swings down and the statement lands on cream.
function sDiscover(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  if (!shot) return { ...K.statement(scene, ctx, { centred: true }), backdrop: canopy(id, th) };
  const word = String(scene.emphasis || scene.headline || "").slice(0, 28);
  const size = K.fitOne(word, U(1400) / K.camSafe(), U(112), th.adv);
  return {
    backdrop: canopy(id, th),
    html: `
    ${leafCard(th, { cls: `${id}-card`, x: U(510), y: U(120), w: U(900), h: U(620), shot, tilt: -2 })}
    <div class="${id}-plate" style="position:absolute;left:${r(U(260))}cqw;top:${r(U(800))}cqw;width:${r(U(1400))}cqw;padding:${r(U(28))}cqw ${r(U(40))}cqw;background:${th.paper};border-radius:${r(U(26))}cqw;box-shadow:0 ${r(U(16))}cqw ${r(U(40))}cqw ${rgba("#06180E", 0.42)};text-align:center;opacity:0;z-index:6;">
      <div style="font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:1.08;color:${th.ink};">${esc(word)}</div>
      ${scene.subtext ? `<div style="margin-top:${r(U(12))}cqw;font-family:${th.bodyStack};font-weight:500;font-size:${r(U(24))}cqw;color:${th.sub};">${esc(String(scene.subtext).slice(0, 96))}</div>` : ""}
    </div>`,
    s: [
      `tl.to(".${id}-card",{opacity:1,duration:${du(0.3)},ease:"none"},${at(0.15)});`,
      `tl.fromTo(".${id}-card",{y:"${r(-U(180))}cqw",rotate:-12},{y:0,rotate:-2,duration:${du(0.9)},ease:"back.out(1.4)"},${at(0.15)});`,
      `tl.fromTo(".${id}-plate",{opacity:0,y:"${r(U(40))}cqw",scale:0.9},{opacity:1,y:0,scale:1,duration:${du(0.55)},ease:"back.out(2)"},${at(0.9)});`,
      ...canopyTweens(id, ctx),
    ],
  };
}

// TREK — the route: numbered stops on cream markers, linked by a dashed trail.
function sTrek(scene, ctx) {
  const { id, th, at, du } = ctx;
  const list = K.bullets(scene, 4);
  if (list.length < 2) return { ...K.statement(scene, ctx), backdrop: canopy(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(74), 1, th.adv);
  const gap = U(26), each = (COL - gap * (list.length - 1)) / list.length;
  // The cards used to be as tall as their copy — a row of short cards at U(360) left the whole
  // lower half of the frame as flat undergrowth. They now reach the stage foot and centre their
  // content, so the beat fills the frame the way every other one does.
  const CARD_TOP = U(360), CARD_H = U(880) - CARD_TOP;
  return {
    backdrop: canopy(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(180))}cqw;width:${r(COL)}cqw;text-align:center;font-family:${th.displayStack};font-size:${r(head.size)}cqw;color:${th.paper};text-shadow:0 ${r(U(6))}cqw ${r(U(16))}cqw ${rgba("#06180E", 0.55)};opacity:0;z-index:6;">${esc(head.lines.join(" "))}</div>
    <div class="${id}-trail" style="position:absolute;left:${r(M)}cqw;top:${r(U(930))}cqw;width:${r(COL)}cqw;height:${r(U(6))}cqw;background:repeating-linear-gradient(90deg, ${rgba(th.paper, 0.85)} 0 ${r(U(20))}cqw, transparent ${r(U(20))}cqw ${r(U(44))}cqw);transform:scaleX(0);transform-origin:left center;"></div>
    ${list.map((b, i) => `<div class="${id}-s${i}" style="position:absolute;left:${r(M + i * (each + gap))}cqw;top:${r(CARD_TOP)}cqw;width:${r(each)}cqw;height:${r(CARD_H)}cqw;box-sizing:border-box;padding:${r(U(26))}cqw;background:${th.paper};border-radius:${r(U(24))}cqw;box-shadow:0 ${r(U(14))}cqw ${r(U(32))}cqw ${rgba("#06180E", 0.4)};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0;z-index:7;">
      <span style="display:inline-grid;place-items:center;width:${r(U(56))}cqw;height:${r(U(56))}cqw;border-radius:50%;background:${th.accent};color:${K.inkOn(th.accent, INK)};font-family:${th.displayStack};font-size:${r(U(28))}cqw;margin-bottom:${r(U(14))}cqw;">${K.pad2(i + 1)}</span>
      <div style="font-family:${th.bodyStack};font-weight:700;font-size:${r(U(26))}cqw;line-height:1.28;color:${th.ink};">${esc(String(b).slice(0, 38))}</div>
    </div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"back.out(1.4)"},${at(0.2)});`,
      `tl.fromTo(".${id}-trail",{scaleX:0},{scaleX:1,duration:${du(0.8)},ease:"power2.inOut"},${at(0.45)});`,
      ...list.map((b, i) => `tl.fromTo(".${id}-s${i}",{opacity:0,y:"${r(U(44))}cqw",scale:0.8},{opacity:1,y:0,scale:1,duration:${du(0.45)},ease:"back.out(2)"},${at(0.6 + i * 0.24)});`),
      ...canopyTweens(id, ctx),
    ],
  };
}

// SIGHTINGS — several leaf cards at once. Fits what it has; never an empty card.
function sSightings(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const n = Math.min(3, shots.length);
  if (n < 2) return { ...K.statement(scene, ctx), backdrop: canopy(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(64), 1, th.adv);
  const gap = U(40), each = (COL - gap * (n - 1)) / n;
  return {
    backdrop: canopy(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(150))}cqw;width:${r(COL)}cqw;text-align:center;font-family:${th.displayStack};font-size:${r(head.size)}cqw;color:${th.paper};text-shadow:0 ${r(U(6))}cqw ${r(U(16))}cqw ${rgba("#06180E", 0.55)};opacity:0;z-index:6;">${esc(head.lines.join(" "))}</div>
    ${Array.from({ length: n }, (_, i) => leafCard(th, {
    cls: `${id}-c${i}`, x: M + i * (each + gap), y: U(320), w: each, h: U(540),
    shot: shots[i], tilt: i % 2 ? 2.5 : -2.5,
  })).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"back.out(1.4)"},${at(0.2)});`,
      ...Array.from({ length: n }, (_, i) => `tl.to(".${id}-c${i}",{opacity:1,duration:${du(0.28)},ease:"none"},${at(0.5 + i * 0.26)});`),
      ...Array.from({ length: n }, (_, i) => `tl.fromTo(".${id}-c${i}",{y:"${r(-U(120))}cqw",rotate:${i % 2 ? 12 : -12}},{y:0,rotate:${i % 2 ? 2.5 : -2.5},duration:${du(0.7)},ease:"back.out(1.5)"},${at(0.5 + i * 0.26)});`),
      ...canopyTweens(id, ctx),
    ],
  };
}

// CENSUS — the count, on cream tallies. Figures from the script only.
function sCensus(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx, { centred: true }), backdrop: canopy(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", COL / K.camSafe(), U(76), 2, th.adv);
  const gap = U(40), each = (COL - gap * (stats.length - 1)) / stats.length;
  return {
    backdrop: canopy(id, th),
    html: `
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(190))}cqw;width:${r(COL)}cqw;text-align:center;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:1.1;color:${th.paper};text-shadow:0 ${r(U(6))}cqw ${r(U(16))}cqw ${rgba("#06180E", 0.55)};opacity:0;z-index:6;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    ${stats.map((st, i) => `<div class="${id}-c${i}" style="position:absolute;left:${r(M + i * (each + gap))}cqw;top:${r(U(470))}cqw;width:${r(each)}cqw;height:${r(U(300))}cqw;background:${th.paper};border-radius:${r(U(30))}cqw;box-shadow:0 ${r(U(18))}cqw ${r(U(44))}cqw ${rgba("#06180E", 0.42)};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${r(U(10))}cqw;opacity:0;z-index:7;">
      <div style="font-family:${th.displayStack};font-size:${r(U(92))}cqw;line-height:1;color:${th.accent};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
      <div style="font-family:${th.monoStack};font-size:${r(U(17))}cqw;letter-spacing:0.18em;color:${th.sub};white-space:nowrap;overflow:hidden;">${esc(K.statLabel(scene, i))}</div>
    </div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.55)},ease:"back.out(1.4)"},${at(0.2)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-c${i}",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.45)},ease:"back.out(2.2)"},${at(0.6 + i * 0.26)});`,
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.68)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.72 + i * 0.26)});`,
        ];
      }),
      ...canopyTweens(id, ctx),
    ],
  };
}

// COME ALONG — the close, on a cream clearing card.
function sComeAlong(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(1360) / K.camSafe(), U(114), 3, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 20) || STRINGS.go;
  const hasMark = !!(logo && logo.path);
  return {
    backdrop: canopy(id, th),
    html: `
    <div class="${id}-card" style="position:absolute;left:${r(U(240))}cqw;top:${r(U(200))}cqw;width:${r(U(1440))}cqw;padding:${r(U(60))}cqw;background:${th.paper};border-radius:${r(U(40))}cqw;box-shadow:0 ${r(U(28))}cqw ${r(U(64))}cqw ${rgba("#06180E", 0.5)};display:flex;flex-direction:column;align-items:center;gap:${r(U(26))}cqw;opacity:0;z-index:6;">
      ${hasMark ? `<div style="width:${r(U(128))}cqw;height:${r(U(128))}cqw;border-radius:${r(U(32))}cqw;background:${rgba(th.accent, 0.14)};padding:${r(U(18))}cqw;display:flex;align-items:center;justify-content:center;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div style="width:100%;text-align:center;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:1.08;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      <div class="${id}-pill" style="display:flex;align-items:center;gap:${r(U(22))}cqw;opacity:0;">
        <span style="padding:${r(U(20))}cqw ${r(U(46))}cqw;border-radius:${r(U(100))}cqw;background:${th.accent};color:${K.inkOn(th.accent, INK)};font-family:${th.displayStack};font-size:${r(K.fitOne(action, U(520), U(34), th.adv))}cqw;white-space:nowrap;box-shadow:0 ${r(U(10))}cqw ${r(U(26))}cqw ${rgba(th.accent, 0.5)};">${esc(action)}</span>
        <span style="font-family:${th.monoStack};font-size:${r(U(21))}cqw;letter-spacing:0.14em;color:${th.sub};white-space:nowrap;">${esc(ctx.url)}</span>
      </div>
    </div>`,
    s: [
      `tl.fromTo(".${id}-card",{opacity:0,y:"${r(U(60))}cqw",scale:0.92},{opacity:1,y:0,scale:1,duration:${du(0.75)},ease:"back.out(1.4)"},${at(0.3)});`,
      `tl.fromTo(".${id}-pill",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.5)},ease:"back.out(2.4)"},${at(1.1)});`,
      ...canopyTweens(id, ctx),
    ],
  };
}

// ---- spine -------------------------------------------------------------------
const SPEC = {
  first: "enter", last: "comealong",
  middle: ["discover", "trek", "sightings", "census"],
  shapes: { enter: [760 / 560], discover: [900 / 620], sightings: [1.05, 1.05, 1.05], trek: [], census: [], comealong: [], statement: [], "statement-c": [] },
  slots: (role, budget) => (role === "enter" || role === "discover" ? 1 : role === "sightings" ? Math.min(3, Math.max(0, budget)) : 0),
  needs: (role) => (role === "discover" ? 1 : role === "sightings" ? 2 : 0),
  // Roles are picked by a ROTATING cursor, not by priority, so whichever role the cursor
  // happens to land on claims the beat. Census is the only layout that prints figures AS
  // figures; every other role therefore declines a beat carrying two or more numbers, which
  // leaves the cursor no choice but to walk on to census. Guarding only `trek` was not enough
  // — the cursor simply handed the figures to `sightings` instead.
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "census") return isStats;
    if (isStats) return false;
    if (role === "discover") return budget >= 1;
    if (role === "sightings") return budget >= 2;
    if (role === "trek") return K.bullets(scene, 4).length >= 2;
    return true;
  },
};
const BUILDERS = {
  enter: sEnter, discover: sDiscover, trek: sTrek, sightings: sSightings, census: sCensus, comealong: sComeAlong,
  statement: (sc, ctx) => ({ ...K.statement(sc, ctx), backdrop: canopy(ctx.id, ctx.th) }),
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: canopy(ctx.id, ctx.th) }),
};
const LABELS = {
  enter: STRINGS.enter, discover: STRINGS.discover, trek: STRINGS.trek,
  sightings: STRINGS.sightings, census: STRINGS.census, comealong: STRINGS.go,
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { box-shadow:0 ${r(stage.U(10))}cqw ${r(stage.U(26))}cqw ${rgba("#06180E", 0.42)}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.4, camera: { push: 110, scale: 1.035 },
    signature: "organic", fallbackBrand: "WILD",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
