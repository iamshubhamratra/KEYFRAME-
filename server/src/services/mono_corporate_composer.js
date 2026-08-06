// MONO CORPORATE — a clean minimal enterprise system. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. NOT a port: there is no Claude Design reference for this pack. It is written from its
// own manifest, frames/mono-corporate/pack.json, which is the only brief that exists for it.
//
// WHY IT WAS BUILT. The pack had no `renderer` key, so it rendered through the GENERIC scene kit
// wearing its palette — one of ten packs found in that state by scripts/test-pack-composers.js. Its
// manifest asks for a system that did not exist in code:
//
//   "Clean minimal enterprise system for Ledger, a B2B finance platform. Atoms are sacred — near-white
//    paper grounds with a faint 1px grid, generous open whitespace, crisp hairline dividers, small IBM
//    Plex Mono caps labels, and ONE saturated deep blue accent."
//
// THE RULES, taken from that brief and applied everywhere:
//   1. ATOMS ARE SACRED. One label style, one rule weight, one card, one figure. Nothing is drawn a
//      second way for variety's sake — the system IS the design.
//   2. WHITESPACE IS THE LAYOUT. Type sits on a generous margin and never fills the frame. This is
//      the opposite instinct to kinetic-bold, and deliberately so.
//   3. ONE ACCENT, and it is structural: a rule, an underline, a fill on one figure. Never decoration
//      and never two hues.
//   4. HAIRLINES, NOT BORDERS. Every divider is 1px of #E2E5EA. `surface.flat` is false, so a panel
//      may carry ONE soft shadow — that is the whole of the depth budget.
//
// FONT SUBSTITUTION: IBM Plex Mono is bundled and used as specified, for every label in the pack.
// `Inter` is NOT bundled, so Figtree stands in for the display and body voice — the nearest neutral
// UI grotesque in src/fonts/pack_fonts.js.

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U } = STAGE;

const PAPER = "#FFFFFF", MIST = "#F4F5F7", LINE = "#E2E5EA";
const INK = "#0E1116", GRAPHITE = "#5B616E", ACCENT = "#1E5BFF";
// HAIR is for rules drawn on the mist GROUND; LINE (#E2E5EA) is the card border it was designed as.
// On #F4F5F7 that grey is invisible, and the brief asks for "crisp hairline dividers".
const HAIR = rgba(INK, 0.16);
const DISPLAY = "Figtree", MONO = "IBM Plex Mono", BODY = "Figtree";

const STRINGS = {
  intro: "OVERVIEW", feature: "CAPABILITY", how: "HOW IT WORKS", metrics: "PERFORMANCE",
  quote: "CUSTOMER", cta: "GET STARTED", scene: "SECTION", of: "OF", go: "BOOK A DEMO",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: MIST, isDark: false, packAccent: ACCENT });
  return {
    accent, bg: MIST, paper: PAPER, panel: PAPER, ink: INK, mist: MIST,
    sub: GRAPHITE, line: LINE,
    adv: K.ADVANCE.mixed,
    capBg: PAPER, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO, `'${BODY}', system-ui, sans-serif`, [BODY]),
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    resolvedBrand,
  };
}

// ---- the system --------------------------------------------------------------
const M = U(140);                     // generous margin: rule 2
const COL = U(1920) - M * 2;
const GRID = 32;                      // the manifest's faint 1px grid

// Ground: mist, a faint 1px grid, and the bokeh the manifest asks for — kept to three very soft
// accent-tinted discs, because an enterprise system may not sparkle.
function paper(id, th) {
  return `<div style="position:absolute;inset:0;background:${th.bg};overflow:hidden;">
    <div class="${id}-grid" style="position:absolute;inset:${r(-U(GRID))}cqw;background-image:linear-gradient(${LINE} 1px, transparent 1px),linear-gradient(90deg, ${LINE} 1px, transparent 1px);background-size:${r(U(GRID))}cqw ${r(U(GRID))}cqw;opacity:0.5;"></div>
    <div class="${id}-bok" style="position:absolute;inset:0;background:
      radial-gradient(ellipse ${r((320 / 1920) * 100)}% ${r((320 / 1080) * 100)}% at 14% 22%, ${rgba(th.accent, 0.07)} 0%, ${rgba(th.accent, 0)} 70%),
      radial-gradient(ellipse ${r((260 / 1920) * 100)}% ${r((260 / 1080) * 100)}% at 82% 74%, ${rgba(th.accent, 0.06)} 0%, ${rgba(th.accent, 0)} 70%),
      radial-gradient(ellipse ${r((200 / 1920) * 100)}% ${r((200 / 1080) * 100)}% at 62% 12%, ${rgba(INK, 0.04)} 0%, ${rgba(INK, 0)} 70%);"></div>
  </div>`;
}
const paperTweens = (id, ctx) => [
  // The grid creeps by exactly one cell, so the loop is seamless; the bokeh drifts against it.
  `tl.to(".${id}-grid",{x:"${r(U(GRID))}cqw",y:"${r(U(GRID))}cqw",duration:${r(Math.max(8, ctx.L * 2.4))},ease:"none"},${r(ctx.T)});`,
  `tl.to(".${id}-bok",{x:"${r(U(26))}cqw",y:"${r(-U(18))}cqw",duration:${r(Math.max(5, ctx.L * 1.6))},ease:"sine.inOut",repeat:${K.reps(ctx.L, Math.max(5, ctx.L * 1.6))},yoyo:true},${r(ctx.T)});`,
];

// `motion.cut: "panel"` — content arrives on a white panel that slides in over the ground, with a
// single hairline at its leading edge. This is the pack's cut, and every beat uses it.
function panel(id, th, { top, height, inner, cls = "pnl" }) {
  return `<div class="${id}-${cls}" style="position:absolute;left:0;right:0;top:${r(top)}cqw;height:${r(height)}cqw;background:${th.paper};border-top:1px solid ${th.line};border-bottom:1px solid ${th.line};overflow:hidden;">
    ${inner}
  </div>`;
}
const panelTweens = (id, ctx, cls = "pnl") => [
  `tl.fromTo(".${id}-${cls}",{xPercent:-100},{xPercent:0,duration:${ctx.du(0.3)},ease:"expo.out"},${ctx.at(0.02)});`,
];

// The one label style in the system: IBM Plex Mono, caps, wide, graphite. Never bold, never large.
const label = (th, t, color) =>
  `<span style="font-family:${th.monoStack};font-size:${r(U(20))}cqw;letter-spacing:0.18em;text-transform:uppercase;color:${color || GRAPHITE};white-space:nowrap;">${esc(t)}</span>`;

const rule = (th, w) => `<div style="width:${w ? `${r(w)}cqw` : "100%"};height:1px;background:${HAIR};"></div>`;

// `textfx.emphasis: "underline-grow"` — the accent is a rule under a word, drawn on, never a fill.
const underlined = (id, th, word, size, cls) =>
  // UNITS. This was `Math.max(2, size * 0.055)` — px thinking in a cqw field, so the rule came out
  // 2cqw (38px) tall and painted a solid block straight over its own word. Every length in this file
  // is cqw; the floor has to be U(2), not 2.
  `<span style="position:relative;display:inline-block;white-space:nowrap;">${esc(word)}<span class="${id}-${cls}" style="position:absolute;left:0;right:0;bottom:${r(-size * 0.12)}cqw;height:${r(Math.max(U(3), size * 0.06))}cqw;background:${th.accent};transform:scaleX(0);transform-origin:left center;"></span></span>`;

// One card: white, hairline border, ONE soft shadow. The whole depth budget of the pack.
function card(cls, th, { x, y, w, h, inner }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;background:${th.paper};border:1px solid ${th.line};border-radius:${r(U(6))}cqw;box-shadow:0 ${r(U(10))}cqw ${r(U(30))}cqw ${rgba(INK, 0.06)};overflow:hidden;opacity:0;">
    <div style="position:relative;width:100%;height:100%;">${inner}</div>
  </div>`;
}
const cardTweens = (cls, ctx, at) => [
  `tl.to(".${cls}",{opacity:1,duration:${ctx.du(0.1)},ease:"none"},${ctx.at(at)});`,
  `tl.fromTo(".${cls}",{y:"${r(U(30))}cqw"},{y:0,duration:${ctx.du(0.34)},ease:"expo.out"},${ctx.at(at)});`,
];

// ---- scenes -----------------------------------------------------------------
// INTRO — the lockup. Label, headline with one underlined word, a hairline, and body copy. The
// picture, if there is one, is a single card to the right: whitespace is the layout.
function sIntro(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  const colW = shot ? U(760) : U(1180);
  const head = K.fitLines(scene.headline || scene.title || ctx.title, colW / K.camSafe(), U(96), 3, th.adv);
  const body = String(scene.subtext || "").trim().slice(0, 190);
  const key = K.clampWords(String(scene.emphasis || "").trim(), 18);
  return {
    backdrop: paper(id, th),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(300))}cqw;width:${r(colW)}cqw;z-index:4;">
      <div class="${id}-lab" style="opacity:0;">${label(th, String(scene.kicker || STRINGS.intro).slice(0, 30))}</div>
      <div class="${id}-head" style="margin-top:${r(U(28))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(head.size)}cqw;line-height:1.06;letter-spacing:-0.02em;color:${th.ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      <div class="${id}-rule" style="margin-top:${r(U(34))}cqw;transform:scaleX(0);transform-origin:left center;">${rule(th, U(220))}</div>
      ${body ? `<div class="${id}-body" style="margin-top:${r(U(30))}cqw;max-width:${r(Math.min(colW, U(720)))}cqw;font-family:${th.bodyStack};font-weight:400;font-size:${r(U(28))}cqw;line-height:1.55;color:${th.sub};opacity:0;">${esc(body)}</div>` : ""}
      ${key ? `<div class="${id}-key" style="margin-top:${r(U(30))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(U(34))}cqw;color:${th.ink};opacity:0;">${underlined(id, th, key, U(34), "ul")}</div>` : ""}
    </div>
    ${shot ? card(`${id}-c`, th, { x: U(1000), y: U(300), w: U(780), h: U(480), inner: K.shotFill(shot, { bg: th.paper }) }) : ""}`,
    s: [
      `tl.fromTo(".${id}-lab",{opacity:0,y:"${r(U(16))}cqw"},{opacity:1,y:0,duration:${du(0.22)},ease:"power3.out"},${at(0.1)});`,
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.34)},ease:"expo.out"},${at(0.2)});`,
      `tl.to(".${id}-rule",{scaleX:1,duration:${du(0.26)},ease:"expo.out"},${at(0.42)});`,
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(20))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"power3.out"},${at(0.5)});` : "",
      key ? `tl.fromTo(".${id}-key",{opacity:0},{opacity:1,duration:${du(0.2)},ease:"none"},${at(0.62)});` : "",
      key ? `tl.to(".${id}-ul",{scaleX:1,duration:${du(0.3)},ease:"expo.out"},${at(0.72)});` : "",
      ...(shot ? cardTweens(`${id}-c`, ctx, 0.32) : []),
      ...paperTweens(id, ctx),
    ].filter(Boolean),
  };
}

// FEATURE — the manifest's widest slot (1728x410). Copy above, the capture in a full-measure panel
// beneath it: the enterprise convention of a labelled figure, not a hero shot.
function sFeature(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const n = Math.min(2, shots.length);
  if (!n) return { ...K.statement(scene, ctx), backdrop: paper(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(1180) / K.camSafe(), U(76), 2, th.adv);
  const bandTop = U(300) + U(46) + head.lines.length * head.size * 1.06 + U(48);
  const gap = U(24), bandEnd = U(960);
  const h = n === 2 ? (bandEnd - bandTop - gap) / 2 : bandEnd - bandTop;
  return {
    backdrop: paper(id, th),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(300))}cqw;width:${r(U(1180))}cqw;z-index:4;">
      <div class="${id}-lab" style="opacity:0;">${label(th, String(scene.kicker || STRINGS.feature).slice(0, 30))}</div>
      <div class="${id}-head" style="margin-top:${r(U(22))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(head.size)}cqw;line-height:1.06;letter-spacing:-0.02em;color:${th.ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    ${Array.from({ length: n }, (_, i) => card(`${id}-f${i}`, th, { x: M, y: bandTop + i * (h + gap), w: COL, h, inner: K.shotFill(shots[i], { bg: th.paper }) })).join("")}`,
    s: [
      `tl.fromTo(".${id}-lab",{opacity:0,y:"${r(U(16))}cqw"},{opacity:1,y:0,duration:${du(0.2)},ease:"power3.out"},${at(0.08)});`,
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(28))}cqw"},{opacity:1,y:0,duration:${du(0.32)},ease:"expo.out"},${at(0.16)});`,
      ...Array.from({ length: n }, (_, i) => cardTweens(`${id}-f${i}`, ctx, 0.4 + i * 0.16)).flat(),
      ...paperTweens(id, ctx),
    ],
  };
}

// HOW — numbered steps on a hairline grid. `objectFit: contain` in the manifest, so an illustration
// sits inside its cell rather than filling it.
function sHow(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const steps = K.bullets(scene, 3);
  if (steps.length < 2) return { ...K.statement(scene, ctx), backdrop: paper(id, th) };
  const head = K.fitOne(String(scene.headline || STRINGS.how), U(1180), U(76), th.adv);
  const cw = (COL - U(40) * (steps.length - 1)) / steps.length;
  const shot = shots[0] || null;
  return {
    backdrop: paper(id, th),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(280))}cqw;width:${r(U(1180))}cqw;z-index:4;">
      <div class="${id}-lab" style="opacity:0;">${label(th, String(scene.kicker || STRINGS.how).slice(0, 30))}</div>
      <div class="${id}-head" style="margin-top:${r(U(22))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(head)}cqw;line-height:1.06;letter-spacing:-0.02em;color:${th.ink};opacity:0;">${esc(String(scene.headline || STRINGS.how))}</div>
    </div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(520))}cqw;width:${r(COL)}cqw;display:flex;gap:${r(U(40))}cqw;z-index:4;">
      ${steps.map((s, i) => `<div class="${id}-step" style="width:${r(cw)}cqw;opacity:0;">
        <div style="height:1px;background:${HAIR};"></div>
        <div style="margin-top:${r(U(22))}cqw;display:flex;align-items:baseline;gap:${r(U(14))}cqw;">
          ${label(th, String(i + 1).padStart(2, "0"), i === 0 ? th.accent : GRAPHITE)}
          <span style="font-family:${th.displayStack};font-weight:600;font-size:${r(U(34))}cqw;line-height:1.25;color:${th.ink};">${esc(String(s).slice(0, 68))}</span>
        </div>
      </div>`).join("")}
    </div>
    ${shot ? card(`${id}-ill`, th, { x: M, y: U(760), w: COL, h: U(200), inner: `<img src="${esc(shot.path)}" alt="${esc(shot.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;">` }) : ""}`,
    s: [
      `tl.fromTo(".${id}-lab",{opacity:0,y:"${r(U(16))}cqw"},{opacity:1,y:0,duration:${du(0.2)},ease:"power3.out"},${at(0.08)});`,
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(28))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"expo.out"},${at(0.16)});`,
      `tl.fromTo(".${id}-step",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.28)},ease:"expo.out",stagger:${du(0.12)}},${at(0.38)});`,
      ...(shot ? cardTweens(`${id}-ill`, ctx, 0.66) : []),
      ...paperTweens(id, ctx),
    ],
  };
}

// METRICS — figures on the grid, in a single panel. `motion.cut: "panel"` is most literal here.
function sMetrics(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = K.numbersIn(scene, 4);
  if (stats.length < 2) return { ...K.statement(scene, ctx), backdrop: paper(id, th) };
  const cw = (COL - U(1) * (stats.length - 1)) / stats.length;
  const inner = `<div style="position:absolute;left:${r(M)}cqw;top:0;width:${r(COL)}cqw;height:100%;display:flex;">
    ${stats.map((st, i) => `<div style="width:${r(cw)}cqw;height:100%;display:flex;flex-direction:column;justify-content:center;padding-left:${r(U(30))}cqw;box-sizing:border-box;${i ? `border-left:1px solid ${HAIR};` : ""}">
      <div class="${id}-fl">${label(th, K.statLabel(scene, i))}</div>
      <div style="margin-top:${r(U(18))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(K.fitOne(`${st.v}${st.suffix}`, cw - U(50), U(120), th.adv))}cqw;line-height:1;letter-spacing:-0.03em;color:${i === 0 ? th.accent : th.ink};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
    </div>`).join("")}
  </div>`;
  return {
    backdrop: paper(id, th),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(300))}cqw;width:${r(U(1180))}cqw;z-index:4;">
      <div class="${id}-lab" style="opacity:0;">${label(th, String(scene.kicker || STRINGS.metrics).slice(0, 30))}</div>
      <div class="${id}-head" style="margin-top:${r(U(22))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(K.fitOne(String(scene.headline || scene.title || ""), U(1180), U(76), th.adv))}cqw;line-height:1.06;letter-spacing:-0.02em;color:${th.ink};opacity:0;">${esc(String(scene.headline || scene.title || ""))}</div>
    </div>
    ${panel(id, th, { top: U(560), height: U(300), inner })}`,
    s: [
      `tl.fromTo(".${id}-lab",{opacity:0,y:"${r(U(16))}cqw"},{opacity:1,y:0,duration:${du(0.2)},ease:"power3.out"},${at(0.08)});`,
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(28))}cqw"},{opacity:1,y:0,duration:${du(0.3)},ease:"expo.out"},${at(0.16)});`,
      ...panelTweens(id, ctx),
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [`tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.5)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.4 + i * 0.1)});`];
      }),
      ...paperTweens(id, ctx),
    ],
  };
}

// QUOTE — a customer line. One accent rule at its left, mono attribution. No quote marks the size of
// a building: this pack does not shout.
function sQuote(scene, ctx) {
  const { id, th, at, du } = ctx;
  const q = String(scene.quote || scene.headline || scene.subtext || "").trim().slice(0, 220);
  if (!q) return { ...K.statement(scene, ctx), backdrop: paper(id, th) };
  const by = String(scene.attribution || scene.emphasis || scene.subtext || "").trim().slice(0, 60);
  const size = K.fitLines(q, U(1380) / K.camSafe(), U(58), 4, th.adv);
  return {
    backdrop: paper(id, th),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(340))}cqw;width:${r(U(1440))}cqw;display:flex;gap:${r(U(40))}cqw;z-index:4;">
      <div class="${id}-bar" style="width:${r(U(4))}cqw;flex:0 0 auto;background:${th.accent};transform:scaleY(0);transform-origin:top center;"></div>
      <div style="flex:1 1 auto;">
        <div class="${id}-lab" style="margin-bottom:${r(U(26))}cqw;opacity:0;">${label(th, String(scene.kicker || STRINGS.quote).slice(0, 30))}</div>
        <div class="${id}-q" style="font-family:${th.displayStack};font-weight:500;font-size:${r(size.size)}cqw;line-height:1.35;letter-spacing:-0.01em;color:${th.ink};opacity:0;">${size.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
        ${by ? `<div class="${id}-by" style="margin-top:${r(U(34))}cqw;opacity:0;">${label(th, by)}</div>` : ""}
      </div>
    </div>`,
    s: [
      `tl.to(".${id}-bar",{scaleY:1,duration:${du(0.3)},ease:"expo.out"},${at(0.1)});`,
      `tl.fromTo(".${id}-lab",{opacity:0,y:"${r(U(14))}cqw"},{opacity:1,y:0,duration:${du(0.2)},ease:"power3.out"},${at(0.16)});`,
      `tl.fromTo(".${id}-q",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.34)},ease:"expo.out"},${at(0.26)});`,
      by ? `tl.fromTo(".${id}-by",{opacity:0},{opacity:1,duration:${du(0.2)},ease:"none"},${at(0.56)});` : "",
      ...paperTweens(id, ctx),
    ].filter(Boolean),
  };
}

// CTA — the close. Centred lockup, one accent button, url in mono. The only filled accent shape in
// the film, which is what makes it read as the call.
function sCta(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(1300) / K.camSafe(), U(104), 2, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 24) || STRINGS.go;
  const hasMark = !!(logo && logo.path);
  return {
    backdrop: paper(id, th),
    html: `
    <div style="position:absolute;left:0;right:0;top:${r(U(330))}cqw;text-align:center;z-index:4;">
      ${hasMark ? `<div class="${id}-logo" style="width:${r(U(92))}cqw;height:${r(U(92))}cqw;margin:0 auto ${r(U(34))}cqw;background:${th.paper};border:1px solid ${th.line};border-radius:${r(U(6))}cqw;display:flex;align-items:center;justify-content:center;padding:${r(U(14))}cqw;box-sizing:border-box;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div class="${id}-lab" style="opacity:0;">${label(th, String(scene.kicker || STRINGS.cta).slice(0, 30))}</div>
      <div class="${id}-head" style="margin-top:${r(U(26))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(head.size)}cqw;line-height:1.06;letter-spacing:-0.02em;color:${th.ink};opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      <div class="${id}-btn" style="margin-top:${r(U(44))}cqw;display:inline-block;background:${th.accent};color:${K.inkOn(th.accent)};font-family:${th.displayStack};font-weight:600;font-size:${r(K.fitOne(action, U(620), U(32), th.adv))}cqw;padding:${r(U(20))}cqw ${r(U(40))}cqw;border-radius:${r(U(6))}cqw;opacity:0;">${esc(action)}</div>
      <div class="${id}-url" style="margin-top:${r(U(30))}cqw;opacity:0;">${label(th, ctx.url)}</div>
    </div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,y:"${r(U(20))}cqw"},{opacity:1,y:0,duration:${du(0.26)},ease:"expo.out"},${at(0.1)});` : "",
      `tl.fromTo(".${id}-lab",{opacity:0,y:"${r(U(14))}cqw"},{opacity:1,y:0,duration:${du(0.2)},ease:"power3.out"},${at(0.2)});`,
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(28))}cqw"},{opacity:1,y:0,duration:${du(0.34)},ease:"expo.out"},${at(0.3)});`,
      `tl.fromTo(".${id}-btn",{opacity:0,y:"${r(U(18))}cqw"},{opacity:1,y:0,duration:${du(0.26)},ease:"expo.out"},${at(0.56)});`,
      `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:${du(0.2)},ease:"none"},${at(0.7)});`,
      ...paperTweens(id, ctx),
    ].filter(Boolean),
  };
}

// ---- spine ------------------------------------------------------------------
const SPEC = {
  first: "intro", last: "cta",
  middle: ["feature", "metrics", "how", "quote"],
  shapes: {
    // The manifest's own slot geometry: feature/proof are 1728x410, how is 998x367.
    intro: [780 / 480], feature: [1728 / 410, 1728 / 410], how: [998 / 367],
    metrics: [], quote: [], cta: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "feature" ? Math.min(2, Math.max(0, budget))
    : role === "intro" ? Math.min(1, Math.max(0, budget))
      : role === "how" ? Math.min(1, Math.max(0, budget)) : 0),
  needs: (role) => (role === "feature" ? 1 : 0),
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "metrics") return isStats;
    if (isStats) return false;                        // only `metrics` prints figures as figures
    if (role === "feature") return budget >= 1;
    if (role === "how") return K.bullets(scene, 3).length >= 2;
    if (role === "quote") return !!String(scene.quote || scene.subtext || "").trim();
    return true;
  },
};
const BUILDERS = {
  intro: sIntro, feature: sFeature, how: sHow, metrics: sMetrics, quote: sQuote, cta: sCta,
  statement: (sc, ctx) => ({ ...K.statement(sc, ctx), backdrop: paper(ctx.id, ctx.th) }),
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: paper(ctx.id, ctx.th) }),
};
const LABELS = {
  intro: STRINGS.intro, feature: STRINGS.feature, how: STRINGS.how,
  metrics: STRINGS.metrics, quote: STRINGS.quote, cta: STRINGS.cta,
};

const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border-radius:${r(U(6))}cqw; border:1px solid ${th.line}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.6,
    // `motion.drift: 1.03` from the manifest, and a small push: an enterprise film does not lunge.
    camera: { push: 90, scale: 1.03 },
    signature: "editorial", fallbackBrand: "LEDGER",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
