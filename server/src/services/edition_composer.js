// EDITION — a printed broadsheet in motion. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. Ported from the imported OM template "edition" (1920x1080,
// SCENE_MAP = Cover/Lead/Spread/Ledger/PullQuote, transition="cut"). Its layout, rhythm and
// vocabulary are reproduced; none of its copy is.
//
// THE LOOK. Warm newsprint stock, near-black ink, one editorial red and one ink blue. Anton
// set enormous and tight for every headline; heavy rules that draw themselves across the
// measure; a folio and dateline on every page. Pictures are printed IN the column grid with a
// hairline keyline and a caption beneath — never floated as decoration.
//
// FONT SUBSTITUTION: none — every reference face is now bundled (see src/fonts/pack_fonts.js).

// ANTON IS CONDENSED. Its uppercase advance runs far narrower than a grotesk's — 0.50em here,
// deliberately on the safe side, because a too-low advance is what clips a headline.
// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U } = STAGE;

const PAPER = "#EFE9DA", INK = "#16130D", SUB = "#6A6252", ACCENT = "#DA3A24";
// FONTS: the reference's Anton, plus its Spectral serif for standfirst/body copy.
const DISPLAY = "Anton", MONO = "JetBrains Mono", BODY = "Spectral";
const ADV = 0.50;   // uppercase Anton

const STRINGS = {
  cover: "COVER", lead: "LEAD", spread: "SPREAD", ledger: "INDEX", quote: "COMMENT",
  scene: "PAGE", of: "OF", read: "READ ON", ed: "EDITION",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: PAPER, isDark: false, packAccent: ACCENT });
  return {
    accent, bg: PAPER, panel: "#FFFFFF", ink: INK, sub: SUB,
    // The second editorial colour, derived so a rebranded paper is not still printing the
    // stock navy next to a new red.
    blue: K.spin(accent, 158, -0.14), rule: INK,
    adv: ADV,
    capBg: PAPER, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO, `'${BODY}', serif`, [BODY]),
    bodyStack: `'${BODY}', serif`,
    resolvedBrand,
  };
}

// ---- furniture ---------------------------------------------------------------
// The sheet: warm stock, a faint fibre tint, and the column rules of the measure.
const COLS = 6;
const M = U(84);                                  // page margin
const GW = U(1920) - M * 2;                       // the measure
const CW = GW / COLS;                             // one column
const cx = (i) => M + CW * i;

function sheet(id, th) {
  const rules = Array.from({ length: COLS - 1 }, (_, i) =>
    `<div style="position:absolute;left:${r(cx(i + 1))}cqw;top:${r(U(150))}cqw;bottom:${r(U(120))}cqw;width:1px;background:${rgba(th.ink, 0.1)};"></div>`).join("");
  return `<div style="position:absolute;inset:0;background:${th.bg};overflow:hidden;">
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 30% 20%, ${rgba("#FFFFFF", 0.5)} 0%, transparent 60%);"></div>
    ${rules}
  </div>`;
}

// A drawn rule — the pack's primary punctuation.
const rule = (id, th, { cls, x, y, w, weight = U(6), color = null }) =>
  `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(weight)}cqw;background:${color || th.ink};transform:scaleX(0);transform-origin:left center;"></div>`;

const dateline = (th, text) =>
  `<span style="font-family:${th.monoStack};font-size:${r(U(15))}cqw;letter-spacing:0.26em;color:${th.sub};text-transform:uppercase;">${esc(text)}</span>`;

// A printed picture: keyline, the image, a caption rule and the caption. Drawn ONLY around a
// real photograph — an empty keyline is a hole in the page.
function plate(th, { cls, x, y, w, h, shot, caption }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;opacity:0;">
    <div style="position:relative;width:100%;height:${r(h)}cqw;border:1px solid ${th.ink};overflow:hidden;background:${th.panel};">
      ${K.shotFill(shot, { bg: th.panel })}
    </div>
    ${caption ? `<div style="margin-top:${r(U(10))}cqw;padding-top:${r(U(8))}cqw;border-top:1px solid ${rgba(th.ink, 0.4)};font-family:${th.monoStack};font-size:${r(U(15))}cqw;letter-spacing:0.08em;color:${th.sub};text-transform:uppercase;">${esc(String(caption).slice(0, 54))}</div>` : ""}
  </div>`;
}

// ---- scenes ------------------------------------------------------------------
// COVER — the masthead page. The title is set as large as the measure allows and the rules
// close around it.
function sCover(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  const words = String(scene.headline || scene.title || ctx.title);
  const head = K.fitLines(words, GW / K.camSafe(), U(190), 3, th.adv);
  const kick = String(scene.kicker || ctx.brand || STRINGS.ed).toUpperCase().slice(0, 34);
  const headBottom = U(268) + head.lines.length * head.size * 0.96;

  return {
    backdrop: sheet(id, th),
    html: `
    <div class="${id}-dl" style="position:absolute;left:${r(M)}cqw;top:${r(U(196))}cqw;width:${r(GW)}cqw;display:flex;justify-content:space-between;opacity:0;">
      ${dateline(th, kick)}${dateline(th, `${STRINGS.scene} ${K.pad2(ctx.i + 1)}`)}
    </div>
    ${rule(id, th, { cls: `${id}-r1`, x: M, y: U(232), w: GW, weight: U(8) })}
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(268))}cqw;width:${r(GW)}cqw;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.94;letter-spacing:-0.02em;text-transform:uppercase;color:${th.ink};">
      ${head.lines.map((l) => `<span class="kw" style="display:block;overflow:hidden;"><span class="kwi ${id}-l" style="display:block;">${esc(l)}</span></span>`).join("")}
    </div>
    ${rule(id, th, { cls: `${id}-r2`, x: M, y: headBottom + U(30), w: GW, weight: U(3), color: th.accent })}
    ${shot ? plate(th, { cls: `${id}-plate`, x: M, y: headBottom + U(70), w: GW, h: U(1080) - (headBottom + U(70)) - U(190), shot, caption: scene.subtext }) : ""}
    ${!shot && scene.subtext ? `<div class="${id}-sub" style="position:absolute;left:${r(M)}cqw;top:${r(headBottom + U(70))}cqw;width:${r(CW * 4)}cqw;font-family:${th.monoStack};font-size:${r(U(26))}cqw;line-height:1.6;color:${th.sub};opacity:0;">${esc(String(scene.subtext).slice(0, 190))}</div>` : ""}`,
    s: [
      `tl.fromTo(".${id}-dl",{opacity:0},{opacity:1,duration:${du(0.35)},ease:"none"},${at(0.15)});`,
      `tl.fromTo(".${id}-r1",{scaleX:0},{scaleX:1,duration:${du(0.55)},ease:"power3.inOut"},${at(0.25)});`,
      `tl.fromTo(".${id}-l",{yPercent:112},{yPercent:0,duration:${du(0.6)},ease:"power3.out",stagger:${du(0.12)}},${at(0.45)});`,
      `tl.fromTo(".${id}-r2",{scaleX:0},{scaleX:1,duration:${du(0.5)},ease:"power3.inOut"},${at(1.0)});`,
      shot ? `tl.fromTo(".${id}-plate",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${du(0.6)},ease:"power3.out"},${at(1.15)});` : "",
      !shot && scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0},{opacity:1,duration:${du(0.45)},ease:"none"},${at(1.15)});` : "",
    ].filter(Boolean),
  };
}

// LEAD — the lead story: headline across four columns, picture in the outer two, standfirst
// and body beneath. Without a picture the measure simply widens; no empty keyline is printed.
function sLead(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  const colSpan = shot ? 4 : 6;
  const head = K.fitLines(scene.headline || scene.title || "", (CW * colSpan - U(30)) / K.camSafe(), U(112), 3, th.adv);
  const body = String(scene.subtext || scene.body || "").slice(0, 220);
  const list = K.bullets(scene, 3);

  return {
    backdrop: sheet(id, th),
    html: `
    <div class="${id}-dl" style="position:absolute;left:${r(M)}cqw;top:${r(U(178))}cqw;opacity:0;">${dateline(th, String(scene.kicker || STRINGS.lead).slice(0, 30))}</div>
    ${rule(id, th, { cls: `${id}-r1`, x: M, y: U(212), w: GW, weight: U(4) })}
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(248))}cqw;width:${r(CW * colSpan - U(30))}cqw;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.96;letter-spacing:-0.02em;text-transform:uppercase;color:${th.ink};">
      ${head.lines.map((l) => `<span class="kw" style="display:block;overflow:hidden;"><span class="kwi ${id}-l" style="display:block;">${esc(l)}</span></span>`).join("")}
    </div>
    ${body ? `<div class="${id}-body" style="position:absolute;left:${r(M)}cqw;top:${r(U(660))}cqw;width:${r(CW * (shot ? 4 : 3) - U(30))}cqw;font-family:${th.monoStack};font-size:${r(U(24))}cqw;line-height:1.62;color:${th.ink};opacity:0;">${esc(body)}</div>` : ""}
    ${list.length ? `<div style="position:absolute;left:${r(shot ? M : cx(3))}cqw;top:${r(shot ? U(880) : U(660))}cqw;width:${r(CW * 3 - U(30))}cqw;">
      ${list.map((b, i) => `<div class="${id}-li" style="display:flex;gap:${r(U(14))}cqw;padding:${r(U(9))}cqw 0;border-top:1px solid ${rgba(th.ink, 0.3)};font-family:${th.monoStack};font-size:${r(U(19))}cqw;letter-spacing:0.06em;color:${th.sub};text-transform:uppercase;opacity:0;"><span style="color:${th.accent};">${K.pad2(i + 1)}</span>${esc(String(b).slice(0, 40))}</div>`).join("")}
    </div>` : ""}
    ${shot ? plate(th, { cls: `${id}-plate`, x: cx(4), y: U(248), w: CW * 2, h: U(600), shot, caption: scene.emphasis || scene.kicker }) : ""}`,
    s: [
      `tl.fromTo(".${id}-dl",{opacity:0},{opacity:1,duration:${du(0.3)},ease:"none"},${at(0.12)});`,
      `tl.fromTo(".${id}-r1",{scaleX:0},{scaleX:1,duration:${du(0.5)},ease:"power3.inOut"},${at(0.2)});`,
      `tl.fromTo(".${id}-l",{yPercent:112},{yPercent:0,duration:${du(0.55)},ease:"power3.out",stagger:${du(0.11)}},${at(0.4)});`,
      shot ? `tl.fromTo(".${id}-plate",{opacity:0,x:"${r(U(30))}cqw"},{opacity:1,x:0,duration:${du(0.55)},ease:"power3.out"},${at(0.75)});` : "",
      body ? `tl.fromTo(".${id}-body",{opacity:0},{opacity:1,duration:${du(0.45)},ease:"none"},${at(1.0)});` : "",
      list.length ? `tl.fromTo(".${id}-li",{opacity:0,x:"${r(-U(16))}cqw"},{opacity:1,x:0,duration:${du(0.35)},ease:"power2.out",stagger:${du(0.16)}},${at(1.2)});` : "",
    ].filter(Boolean),
  };
}

// SPREAD — the reference's multi-plate page: the headline and a serif standfirst down the left,
// three captioned figure plates laid out on the grid to the right. RESTORED 4 Aug 2026 — the
// bundle-derived port dropped this scene, which is the only beat that prints more than one
// picture and the one that makes the pack read as a SPREAD rather than a single page.
// Reference geometry: head 64/140 at 132px, body 64/420 serif 26/1.5, plates at
// 720x300 620x340 · 1370x210 300x520 · 720x668 620x300.
function sSpread(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  if (!shots.length) return { ...K.statement(scene, ctx), backdrop: sheet(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", U(600) / K.camSafe(), U(132), 3, th.adv);
  const body = String(scene.subtext || scene.body || "").slice(0, 190);
  const caps = K.bullets(scene, 3);
  const FIGS = ["III", "IV", "V"];
  // The reference lays three plates; this fits the number actually collected so a short deck
  // never leaves a keylined box standing empty.
  // The reference stacks its left-column plates 300+340 then 668 — 28px apart, which is less
  // than a caption is tall, so plate III's caption was covered by plate V. Each plate here
  // leaves room for its OWN caption beneath it, and the last one finishes clear of the
  // caption's lane at the stage foot.
  const BOXES = [
    { x: U(720), y: U(290), w: U(620), h: U(280) },
    { x: U(1370), y: U(210), w: U(300), h: U(520) },
    { x: U(720), y: U(620), w: U(620), h: U(230) },
  ];
  const n = Math.min(3, shots.length);
  const boxes = n === 1 ? [{ x: U(720), y: U(240), w: U(1130), h: U(600) }]
    : n === 2 ? [BOXES[0], { x: U(1370), y: U(290), w: U(300), h: U(500) }]
      : BOXES;
  return {
    backdrop: sheet(id, th),
    html: `
    <div class="${id}-dl" style="position:absolute;left:${r(M)}cqw;top:${r(U(96))}cqw;opacity:0;">${dateline(th, String(scene.kicker || STRINGS.spread).slice(0, 30))}</div>
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(140))}cqw;width:${r(U(600))}cqw;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.86;letter-spacing:-0.02em;text-transform:uppercase;color:${th.ink};">
      ${head.lines.map((l) => `<span class="kw" style="display:block;overflow:hidden;"><span class="kwi ${id}-l" style="display:block;">${esc(l)}</span></span>`).join("")}
    </div>
    ${body ? `<div class="${id}-body" style="position:absolute;left:${r(M)}cqw;top:${r(U(420))}cqw;width:${r(U(600))}cqw;font-family:${th.bodyStack};font-size:${r(U(26))}cqw;line-height:1.5;color:${th.ink};opacity:0;">${esc(body)}</div>` : ""}
    ${boxes.map((b, i) => plate(th, { cls: `${id}-p${i}`, x: b.x, y: b.y, w: b.w, h: b.h, shot: shots[i], caption: `${FIGS[i]} — ${String(caps[i] || scene.kicker || STRINGS.spread).slice(0, 30)}` })).join("")}`,
    s: [
      `tl.fromTo(".${id}-dl",{opacity:0},{opacity:1,duration:${du(0.3)},ease:"none"},${at(0.04)});`,
      `tl.fromTo(".${id}-l",{yPercent:112},{yPercent:0,duration:${du(0.42)},ease:"power3.out",stagger:${du(0.1)}},${at(0.04)});`,
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(18))}cqw"},{opacity:1,y:0,duration:${du(0.24)},ease:"power3.out"},${at(0.18)});` : "",
      ...boxes.map((_b, i) => `tl.fromTo(".${id}-p${i}",{opacity:0,y:"${r(U(26))}cqw"},{opacity:1,y:0,duration:${du(0.4)},ease:"power3.out"},${at(0.12 + i * 0.08)});`),
    ].filter(Boolean),
  };
}

// LEDGER — the index page: a numbered table of the beat's points, ruled like a contents list.
function sLedger(scene, ctx) {
  const { id, th, at, du } = ctx;
  const list = K.bullets(scene, 5);
  if (list.length < 2) return { ...K.statement(scene, ctx), backdrop: sheet(id, th) };
  const head = K.fitLines(scene.headline || scene.title || "", GW / K.camSafe(), U(96), 1, th.adv);
  const top = U(400), foot = U(920);
  const rowH = (foot - top) / list.length;

  return {
    backdrop: sheet(id, th),
    html: `
    <div class="${id}-dl" style="position:absolute;left:${r(M)}cqw;top:${r(U(186))}cqw;opacity:0;">${dateline(th, String(scene.kicker || STRINGS.ledger).slice(0, 30))}</div>
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(U(228))}cqw;width:${r(GW)}cqw;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:1;letter-spacing:-0.02em;text-transform:uppercase;color:${th.ink};opacity:0;">${esc(head.lines.join(" "))}</div>
    ${rule(id, th, { cls: `${id}-r1`, x: M, y: U(360), w: GW, weight: U(6) })}
    ${list.map((b, i) => `<div class="${id}-row" style="position:absolute;left:${r(M)}cqw;top:${r(top + i * rowH)}cqw;width:${r(GW)}cqw;height:${r(rowH)}cqw;display:flex;align-items:center;gap:${r(U(34))}cqw;border-bottom:1px solid ${rgba(th.ink, 0.32)};opacity:0;">
      <span style="font-family:${th.displayStack};font-size:${r(U(46))}cqw;color:${th.accent};flex:0 0 auto;min-width:${r(U(80))}cqw;">${K.pad2(i + 1)}</span>
      <span style="font-family:${th.displayStack};font-size:${r(U(44))}cqw;letter-spacing:-0.01em;text-transform:uppercase;color:${th.ink};flex:1 1 auto;overflow:hidden;white-space:nowrap;">${esc(String(b).slice(0, 46))}</span>
    </div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-dl",{opacity:0},{opacity:1,duration:${du(0.3)},ease:"none"},${at(0.12)});`,
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(24))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(0.25)});`,
      `tl.fromTo(".${id}-r1",{scaleX:0},{scaleX:1,duration:${du(0.5)},ease:"power3.inOut"},${at(0.5)});`,
      `tl.fromTo(".${id}-row",{opacity:0,x:"${r(-U(26))}cqw"},{opacity:1,x:0,duration:${du(0.4)},ease:"power3.out",stagger:${du(0.2)}},${at(0.7)});`,
    ],
  };
}

// PULLQUOTE — one enormous statement between two heavy rules, with an attribution.
// Break `text` into the line count that best fills a well `hCqw` tall on a measure `wCqw` wide,
// then size the type to whichever of the two constraints binds. Returns the kit's {lines,size}.
const QLINE = 1.02;
function fillWell(text, hCqw, wCqw, adv) {
  const words = K.wordsOf(text);
  if (!words.length) return { lines: [], size: hCqw / QLINE };
  let best = null;
  for (let n = 1; n <= Math.min(4, words.length); n++) {
    const per = Math.ceil(words.length / n);
    const lines = [];
    for (let i = 0; i < words.length; i += per) lines.push(words.slice(i, i + per).join(" "));
    if (lines.length !== n) continue;
    const longest = lines.reduce((a, l) => Math.max(a, l.length), 0);
    const size = Math.min((wCqw * 0.92) / (longest * adv), hCqw / (n * QLINE));
    // Maximise the TYPE SIZE, not the stacked height. Maximising `n * size` drives every quote
    // to four lines, because narrower lines always allow a taller stack — which fills the well
    // vertically and leaves two thirds of the measure empty instead. The largest size is where
    // the width and height constraints meet, and that is the line count that fills the AREA.
    if (!best || size > best.size) best = { lines, size };
  }
  return best || { lines: [text], size: hCqw / QLINE };
}

function sPullQuote(scene, ctx) {
  const { id, th, at, du } = ctx;
  const q = String(scene.emphasis || scene.headline || scene.title || "");
  const who = String(scene.subtext || "").slice(0, 70);
  // A pull quote FILLS its well. Sizing this by width alone left a four-word quote as one
  // 115px line marooned in half a page of newsprint — the same "massive empty space around
  // headline" that QA has blocked a delivered film over. So the type is sized from the HEIGHT
  // of the well too: a short quote takes more, larger lines on a narrow measure, which is what
  // a pull quote looks like in print anyway.
  const wellTop = U(300), wellBot = who ? U(840) : U(900);
  const head = fillWell(q, wellBot - wellTop, GW / K.camSafe(), th.adv);

  return {
    backdrop: sheet(id, th),
    html: `
    ${rule(id, th, { cls: `${id}-r1`, x: M, y: U(230), w: GW, weight: U(10), color: th.accent })}
    <div class="${id}-q" style="position:absolute;left:${r(M)}cqw;top:${r(wellTop)}cqw;width:${r(GW)}cqw;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:${QLINE};letter-spacing:-0.02em;text-transform:uppercase;color:${th.ink};">
      ${head.lines.map((l) => `<span class="kw" style="display:block;overflow:hidden;"><span class="kwi ${id}-l" style="display:block;">${esc(l)}</span></span>`).join("")}
    </div>
    ${who ? `<div class="${id}-who" style="position:absolute;left:${r(cx(0.5))}cqw;top:${r(U(880))}cqw;display:flex;align-items:center;gap:${r(U(18))}cqw;opacity:0;">
      <span style="width:${r(U(56))}cqw;height:${r(U(4))}cqw;background:${th.accent};"></span>
      <span style="font-family:${th.monoStack};font-size:${r(U(22))}cqw;letter-spacing:0.18em;color:${th.sub};text-transform:uppercase;">${esc(who)}</span>
    </div>` : ""}
    ${rule(id, th, { cls: `${id}-r2`, x: M, y: U(950), w: GW, weight: U(6) })}`,
    s: [
      `tl.fromTo(".${id}-r1",{scaleX:0},{scaleX:1,duration:${du(0.55)},ease:"power3.inOut"},${at(0.15)});`,
      `tl.fromTo(".${id}-l",{yPercent:112},{yPercent:0,duration:${du(0.6)},ease:"power3.out",stagger:${du(0.13)}},${at(0.4)});`,
      who ? `tl.fromTo(".${id}-who",{opacity:0,x:"${r(-U(20))}cqw"},{opacity:1,x:0,duration:${du(0.45)},ease:"power3.out"},${at(1.2)});` : "",
      `tl.fromTo(".${id}-r2",{scaleX:0},{scaleX:1,duration:${du(0.5)},ease:"power3.inOut"},${at(1.35)});`,
    ].filter(Boolean),
  };
}

// COLOPHON — the back page: the mark, the closing statement, the address, set on the accent.
function sColophon(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const fg = K.inkOn(th.accent);
  const action = K.clampWords(String(scene.emphasis || ""), 20) || STRINGS.read;
  const hasMark = !!(logo && logo.path);
  // Same well-filling rule as the pull quote: the back page is full-bleed accent, so a single
  // short line high in it leaves a third of the frame carrying nothing.
  const headTop = hasMark ? U(370) : U(300);
  const head = fillWell(scene.headline || scene.emphasis || ctx.title, U(790) - headTop, GW / K.camSafe(), th.adv);

  return {
    // The closing page is FULL BLEED accent, so it replaces the sheet rather than sitting on it.
    backdrop: `<div style="position:absolute;inset:0;background:${th.accent};"></div>`,
    capTint: fg,
    html: `
    ${hasMark ? `<div class="${id}-logo" style="position:absolute;left:${r(M)}cqw;top:${r(U(200))}cqw;width:${r(U(120))}cqw;height:${r(U(120))}cqw;background:${rgba(fg, 0.12)};border:1px solid ${rgba(fg, 0.5)};padding:${r(U(16))}cqw;display:flex;align-items:center;justify-content:center;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
    <div class="${id}-head" style="position:absolute;left:${r(M)}cqw;top:${r(headTop)}cqw;width:${r(GW)}cqw;font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:${QLINE};letter-spacing:-0.02em;text-transform:uppercase;color:${fg};">
      ${head.lines.map((l) => `<span class="kw" style="display:block;overflow:hidden;"><span class="kwi ${id}-l" style="display:block;">${esc(l)}</span></span>`).join("")}
    </div>
    <div class="${id}-r" style="position:absolute;left:${r(M)}cqw;top:${r(U(830))}cqw;width:${r(GW)}cqw;height:${r(U(5))}cqw;background:${rgba(fg, 0.6)};transform:scaleX(0);transform-origin:left center;"></div>
    <div class="${id}-foot" style="position:absolute;left:${r(M)}cqw;top:${r(U(876))}cqw;width:${r(GW)}cqw;display:flex;justify-content:space-between;align-items:baseline;opacity:0;">
      <span style="font-family:${th.displayStack};font-size:${r(K.fitOne(action, CW * 3, U(60), th.adv))}cqw;letter-spacing:-0.01em;text-transform:uppercase;color:${fg};">${esc(action)}</span>
      <span style="font-family:${th.monoStack};font-size:${r(U(24))}cqw;letter-spacing:0.16em;color:${rgba(fg, 0.85)};">${esc(ctx.url)}</span>
    </div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:${du(0.45)},ease:"back.out(1.8)"},${at(0.25)});` : "",
      `tl.fromTo(".${id}-l",{yPercent:112},{yPercent:0,duration:${du(0.6)},ease:"power3.out",stagger:${du(0.12)}},${at(0.5)});`,
      `tl.fromTo(".${id}-r",{scaleX:0},{scaleX:1,duration:${du(0.55)},ease:"power3.inOut"},${at(1.1)});`,
      `tl.fromTo(".${id}-foot",{opacity:0,y:"${r(U(18))}cqw"},{opacity:1,y:0,duration:${du(0.45)},ease:"power3.out"},${at(1.3)});`,
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
const SPEC = {
  first: "cover", last: "colophon",
  middle: ["lead", "spread", "ledger", "quote"],
  shapes: { cover: [GW / U(560)], lead: [(CW * 2) / U(600)], spread: [620 / 340, 300 / 520, 620 / 300], ledger: [], quote: [], colophon: [], statement: [], "statement-c": [] },
  slots: (role, budget) => (role === "spread" ? Math.min(3, Math.max(0, budget)) : role === "cover" || role === "lead" ? 1 : 0),
  // The cover and lead PRINT their picture in the column grid, but both are complete without
  // one — the measure simply widens. So neither `needs` a shot; only an empty keyline would
  // be a defect, and neither draws one.
  // SPREAD is the one beat that exists FOR its pictures — it needs at least one.
  needs: (role) => (role === "spread" ? 1 : 0),
  carry: (role, scene, budget) => {
    if (role === "spread") return budget >= 1;
    if (role === "lead") return budget >= 1 || K.bullets(scene, 3).length >= 2;
    if (role === "ledger") return K.bullets(scene, 5).length >= 2;
    if (role === "quote") return K.wordsOf(scene.emphasis || scene.headline || "").length >= 3;
    return true;
  },
};
const BUILDERS = {
  cover: sCover, lead: sLead, spread: sSpread, ledger: sLedger, quote: sPullQuote, colophon: sColophon,
  statement: (sc, ctx) => ({ ...K.statement(sc, ctx), backdrop: sheet(ctx.id, ctx.th) }),
  "statement-c": (sc, ctx) => ({ ...K.statement(sc, ctx, { centred: true }), backdrop: sheet(ctx.id, ctx.th) }),
};
const LABELS = { cover: STRINGS.cover, lead: STRINGS.lead, spread: STRINGS.spread, ledger: STRINGS.ledger, quote: STRINGS.quote, colophon: STRINGS.ed };

const css = (th, stage) => K.baseCss(th, stage, `
  .kw { display:block; overflow:hidden; }
  .kwi { display:block; will-change:transform; }
  #cap-pill { border:1px solid ${rgba(th.ink, 0.3)}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.4, camera: { push: 90, scale: 1.025 }, fallbackBrand: "EDITION",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
