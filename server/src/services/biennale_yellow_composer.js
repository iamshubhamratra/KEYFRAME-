// BIENNALE YELLOW — a literary exhibition-catalogue system. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. NOT a port: there is no Claude Design reference for this pack. It is written from its
// own manifest, frames/biennale-yellow/pack.json, which is the only brief that exists for it.
//
// WHY IT WAS BUILT. The pack had no composer, so every film that selected biennale-yellow rendered
// through the GENERIC scene kit wearing its palette — the design existed as a sentence and nowhere
// else. That sentence is:
//
//   "literary editorial: warm parchment, indigo ink, solar yellow blooms, serif display — elegant,
//    cultural, slow-confidence"
//
// with `typography.display: "Instrument Serif"`, `surface.flat: true` on a `#E9E5DB` ground,
// `motion.cut: "wipe"`, `textfx: { enter: "line-wipe", emphasis: "marker", align: "left" }`,
// `fx.canvas: "confetti"`, and four picture slots that are all LETTERBOXES (1728x410, 998x367,
// 826x162) — strips and bands, never cards.
//
// Read together, that is not a deck. It is a printed BIENNALE CATALOGUE: a frontispiece, plates with
// keylines and captions, numbered notes, a table of figures, a wall text, a colophon. So that is what
// the six roles are, and the furniture is the catalogue page itself.
//
// THE FIVE RULES, taken from the brief and enforced in code:
//   1. EVERY BEAT IS A PAGE OF ONE PUBLICATION. The same folio furniture on all six roles: a running
//      head, a thick-thin double rule, a foot folio number, printer's registration marks in the
//      corners, and the 12-column measure creeping underneath. `page()` is the ONLY way a beat is
//      returned, so no role can be built without it — including the kit's statement fallbacks.
//   2. NOTHING FADES IN; EVERYTHING IS UNCOVERED. `motion.cut: "wipe"` and `textfx.enter:
//      "line-wipe"` are the same instruction at two scales: display type, plates, bands and rows all
//      arrive by clip-path wipe, left to right, like a sheet coming off a press.
//   3. THE MARKER IS THE ONLY EMPHASIS. `textfx.emphasis: "marker"` — solar yellow is a HIGHLIGHTER
//      swiped behind a word or under a figure, and the word it covers turns indigo so it reads on
//      the swipe. Never an outline, never a colour on the type itself.
//   4. SOLAR IS LIGHT, INDIGO IS INK. #F1EE2E is a light source (blooms in the ground, the marker,
//      the progress rail, the colophon's falling leaf) and is NEVER used for type or hairlines.
//      All type is indigo on parchment, parchment on indigo. This is also why solar is not the
//      pack's `accent` — see the note in theme().
//   5. TYPE IS SET LEFT, ON A GENEROUS MARGIN (`textfx.align: "left"`, U(150)), and every element
//      seated below a headline computes its top from the headline's MEASURED line count.
//
// DIVERGENCES FROM THE BRIEF, each for a stated technical reason — do not "fix" these back:
//   · "blooms" are radial-gradient ellipses with two separately-computed radii, not blurred discs.
//     `filter: blur()` on a per-scene layer stack makes a seeked capture come back solid black, and
//     `radial-gradient(circle <pct>%)` is invalid CSS that silently drops the whole background.
//   · `fx.canvas: "confetti"` is read as falling GOLD LEAF on the colophon — slow, sparse, in the
//     pack's own three yellows. Party confetti would fight "elegant, cultural, slow-confidence".
//   · the kit's `statement-c` fallback is centred, which contradicts `align: "left"`. It is kept
//     centred on purpose: the kit alternates the two statement layouts so an asset-poor film does
//     not print the identical composition four times running and read as a stuck render.
//
// FONT SUBSTITUTION: none. All three families the manifest names — Instrument Serif (display),
// JetBrains Mono (running heads, captions, labels) and Archivo (body) — are bundled; verified with
// pack_fonts.isBundled, and Archivo is passed to fontStacks as `extra` so it gets its own @font-face
// rather than only appearing inside a fallback string.

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U, VH } = STAGE;

// The manifest's palette, verbatim.
const PAPER = "#E9E5DB", PAPER_DEEP = "#DCD6C4";
const SUN = "#F1EE2E", SUN_SOFT = "#F8F39B", HAZE = "#F0DA7C";
const INK = "#1B2566", EMBER = "#E26B4A";
// `camera3d.ground` is #1B2566 — the indigo the closing page is printed on.
const INK_DEEP = "#141C4E";

const DISPLAY = "Instrument Serif", MONO = "JetBrains Mono", BODY = "Archivo";
// `motion.drift: 1.025`. The camera scales its own layer, so that fraction of every edge is
// off-frame for the whole beat and every measured column divides by it (the SAFE-AREA LAW).
const DRIFT = 1.025, SAFE = K.camSafe(DRIFT);

const STRINGS = {
  frontis: "FRONTISPIECE", plates: "PLATES", notes: "NOTES", figures: "FIGURES",
  walltext: "WALL TEXT", colophon: "COLOPHON",
  scene: "FOLIO", of: "OF", go: "VIEW THE WORK", fig: "FIG", vitrine: "VITRINE",
};

function theme(brandSkin) {
  // THE ACCENT IS NOT THE YELLOW, and that is deliberate. `resolveAccent` contrast-corrects a brand
  // colour against the pack's ground, and this ground is LIGHT — so anything handed to it comes back
  // dark enough to set small marks in. Handing it #F1EE2E would darken the pack's own name into a
  // muddy olive, and a brand yellow would come back dark and then be painted as a "highlighter"
  // behind indigo type, i.e. illegible. So the accent is the STRUCTURAL mark (ember by default, the
  // brand colour when one is given): section numerals, plate captions, note numerals, attribution
  // rules. Solar yellow stays light, stays the pack's, and is only ever used AS light (rule 4).
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: PAPER, isDark: false, packAccent: EMBER });
  return {
    accent,
    // The same accent lifted to clear the indigo colophon. A brand corrected for a light ground can
    // land as dark-on-dark on the closing page; this is the one beat that needs its own copy.
    accentDark: K.ensureContrast(accent, { dark: true }),
    bg: PAPER, ground2: PAPER_DEEP, paper: PAPER, panel: PAPER_DEEP,
    ink: INK, sub: rgba(INK, 0.62), line: rgba(INK, 0.2),
    sun: SUN, sunSoft: SUN_SOFT, haze: HAZE, ember: EMBER, inkDeep: INK_DEEP,
    adv: K.ADVANCE.mixed,
    capBg: PAPER, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO, `Georgia, 'Times New Roman', serif`, [BODY]),
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    resolvedBrand,
  };
}

// ---- the page ----------------------------------------------------------------
const M = U(150);                       // the catalogue's margin: rule 5
const COL = U(1920) - M * 2;            // the measure
const TOP = U(210);                     // first baseline, clear of the double rule at U(112)
const FOOT = U(920);                    // last baseline, clear of the folio row and the rail
// Printer's crosshairs, in authored pixels, OUTSIDE the margin so they never touch the measure.
const REG_PTS = [[56, 56], [1864, 56], [56, 1024], [1864, 1024]];

// Roman numerals: the catalogue's own way of counting. 12 scenes is the kit's ceiling, so X+ is
// covered by repeating X rather than by an M/D/C table nothing would ever reach.
function roman(n) {
  let v = Math.max(1, Math.min(39, Math.floor(Number(n) || 1)));
  let out = "";
  for (const [k, s] of [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]) {
    while (v >= k) { out += s; v -= k; }
  }
  return out || "I";
}

// TWO GROUNDS AND ONLY TWO: the parchment page every beat is printed on, and the indigo colophon
// that closes the film. Because the ground inverts, THIS PACK MUST OWN ITS CHROME — the kit's paints
// from the film theme and would print an indigo wordmark on the indigo page, invisible, on the one
// beat that carries the call to action.
function skin(th, dark = false) {
  return dark
    ? { dark: true, bg: INK, bg2: INK_DEEP, fg: PAPER, sub: rgba(PAPER, 0.66), acc: th.accentDark, vig: "#000000" }
    : { dark: false, bg: PAPER, bg2: PAPER_DEEP, fg: INK, sub: rgba(INK, 0.62), acc: th.accent, vig: INK };
}

// The parchment (or indigo) leaf: a warm ground, solar blooms, the 12-column measure creeping under
// the type, printer's registration marks, and a soft edge.
//
// THE BLOOMS ARE GRADIENTS, NOT BLURRED DISCS. A per-scene stack of `filter: blur()` layers makes a
// seeked capture come back solid black. And every radius is an `ellipse` with its two percentages
// computed SEPARATELY (px/1920 for x, px/1080 for y), because a percentage radius is invalid for
// `circle` and drops the entire comma-joined background — that has already cost this library three
// packs' colour.
function leaf(id, th, sk) {
  const blooms = [
    { c: sk.dark ? SUN : HAZE, x: 80, y: 22, w: 940, h: 940, o: sk.dark ? 0.26 : 0.34 },
    { c: SUN_SOFT, x: 14, y: 84, w: 780, h: 780, o: sk.dark ? 0.14 : 0.3 },
    { c: sk.dark ? SUN_SOFT : PAPER_DEEP, x: 46, y: 48, w: 1300, h: 1300, o: sk.dark ? 0.08 : 0.55 },
  ].map((b) => `radial-gradient(ellipse ${r((b.w / 1920) * 100)}% ${r((b.h / 1080) * 100)}% at ${r(b.x)}% ${r(b.y)}%, ${rgba(b.c, b.o)} 0%, ${rgba(b.c, 0)} 72%)`).join(",");
  return `<div style="position:absolute;inset:0;background:linear-gradient(168deg, ${sk.bg} 0%, ${sk.bg2} 100%);overflow:hidden;">
    <div class="${id}-blm" style="position:absolute;inset:${r(-U(240))}cqw;background:${blooms};"></div>
    ${K.columnRules(th, { cls: id, U, stageW: 1920, cols: 12, color: sk.fg, alpha: sk.dark ? 0.08 : 0.055 })}
    ${K.regMarks(th, { cls: id, pts: REG_PTS, color: rgba(sk.fg, 0.5), arm: 13, ring: 7 })}
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse 82% 82% at 50% 46%, ${rgba(sk.vig, 0)} 44%, ${rgba(sk.vig, sk.dark ? 0.34 : 0.14)} 100%);"></div>
  </div>`;
}
// The blooms breathe, the measure creeps by exactly one column, the crosshairs pulse. All three are
// finite (`reps` floors, never ceils) so nothing outlives the clip it belongs to.
const leafTweens = (id, ctx) => {
  const d = Math.max(10, ctx.L * 2.8);
  return [
    `tl.to(".${id}-blm",{x:"${r(U(44))}cqw",y:"${r(-U(28))}cqw",duration:${r(d)},ease:"sine.inOut",repeat:${K.reps(ctx.L, d)},yoyo:true},${r(ctx.T)});`,
    ...K.columnRulesTweens(ctx, { cls: id, U, stageW: 1920, cols: 12, dur: 26 }),
    ...K.regMarkTweens(ctx, { cls: id, dur: 1.31 }),
  ];
};

// A single solar bloom that opens with the beat — the vibe's "solar yellow blooms" as an event
// rather than as wallpaper. Two tweens, two different properties (opacity, scale): never two tweens
// contending for one property.
function sunDisc(id, { x, y, d, o = 0.5 }) {
  return `<div class="${id}-disc" style="position:absolute;inset:0;background:radial-gradient(ellipse ${r((d / 1920) * 100)}% ${r((d / 1080) * 100)}% at ${r(x)}% ${r(y)}%, ${rgba(SUN, o)} 0%, ${rgba(SUN_SOFT, o * 0.55)} 42%, ${rgba(SUN_SOFT, 0)} 72%);transform:scale(0.88);opacity:0;"></div>`;
}
const sunDiscTweens = (id, ctx, at) => [
  `tl.to(".${id}-disc",{opacity:1,duration:${ctx.du(0.6)},ease:"power2.out"},${ctx.at(at)});`,
  `tl.fromTo(".${id}-disc",{scale:0.88},{scale:1.05,duration:${r(Math.max(6, ctx.L * 1.9))},ease:"sine.inOut"},${r(ctx.T)});`,
];

// ---- the folio (this pack's chrome) -----------------------------------------
// Running head, thick-thin double rule, foot folio, url, and a film-wide progress rule in solar.
// Returned from EVERY builder (rule 1 + the inverted colophon), which also means this pack owns the
// progress tween: the kit only emits its own when a builder supplies no chrome.
function folio(ctx, sk) {
  const { id, th, i, total } = ctx;
  const brand = String(ctx.brand || "").slice(0, 22).toUpperCase();
  return `<div class="om-chrome">
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(52))}cqw;display:flex;justify-content:space-between;align-items:baseline;">
      <span style="font-family:${th.displayStack};font-size:${r(U(32))}cqw;letter-spacing:0.15em;color:${sk.fg};white-space:nowrap;">${esc(brand)}</span>
      ${ctx.label ? `<span style="font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.3em;text-transform:uppercase;color:${sk.sub};white-space:nowrap;">${esc(ctx.label)}</span>` : `<span></span>`}
      <span style="font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.26em;color:${sk.acc};white-space:nowrap;">${esc(roman(i + 1))}&nbsp;/&nbsp;${esc(roman(total))}</span>
    </div>
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(104))}cqw;height:${r(U(3))}cqw;background:${rgba(sk.fg, 0.85)};"></div>
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;top:${r(U(112))}cqw;height:${r(U(1.5))}cqw;background:${rgba(sk.fg, 0.4)};"></div>
    <div style="position:absolute;left:${r(M)}cqw;bottom:${r(U(50))}cqw;font-family:${th.displayStack};font-style:italic;font-size:${r(U(26))}cqw;color:${sk.sub};white-space:nowrap;">— ${esc(String(i + 1))} —</div>
    <div style="position:absolute;right:${r(M)}cqw;bottom:${r(U(54))}cqw;font-family:${th.monoStack};font-size:${r(U(15))}cqw;letter-spacing:0.2em;text-transform:uppercase;color:${sk.sub};white-space:nowrap;">${esc(ctx.url)}</div>
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;bottom:${r(U(30))}cqw;height:${r(U(3))}cqw;background:${rgba(sk.fg, 0.16)};overflow:hidden;">
      <div class="${id}-rail" style="width:100%;height:100%;background:${SUN};transform:scaleX(${r(total ? i / total : 0)});transform-origin:left center;"></div>
    </div>
  </div>`;
}
// The rule fills across the WHOLE film, so it starts where the previous beat left it.
const folioTweens = (id, ctx) => [
  `tl.to(".${id}-rail",{scaleX:${r(ctx.total ? (ctx.i + 1) / ctx.total : 1)},duration:${r(ctx.L)},ease:"none"},${r(ctx.T)});`,
];

// THE ONLY WAY A BEAT LEAVES THIS FILE. Wrapping every return — the six roles AND both statement
// fallbacks — is what guarantees the signature furniture is on every page instead of on the pages
// somebody remembered.
function page(ctx, sk, built, { extraBg = "" } = {}) {
  return {
    ...built,
    backdrop: `${leaf(ctx.id, ctx.th, sk)}${extraBg}`,
    chrome: folio(ctx, sk),
    s: [...(built.s || []), ...leafTweens(ctx.id, ctx), ...folioTweens(ctx.id, ctx)].filter(Boolean),
  };
}

// ---- type -------------------------------------------------------------------
// `textfx.enter: "line-wipe"` — a line is UNCOVERED left to right, never faded and never slid. A
// clip-path is a paint operation, so it stays off the layout path.
function wipeLines(id, lines, style, cls = "ln") {
  return lines.map((l) => `<span class="${id}-${cls}" style="display:block;${style}clip-path:inset(0 100% 0 0);">${esc(l)}</span>`).join("");
}
const wipeTweens = (id, ctx, at, cls = "ln", dur = 0.44) => [
  `tl.to(".${id}-${cls}",{clipPath:"inset(0 0% 0 0)",duration:${ctx.du(dur)},ease:"power2.inOut",stagger:${ctx.du(0.14)}},${ctx.at(at)});`,
];

// The running label in JetBrains Mono: the pack's one small-type voice.
const tag = (th, t, color, size = 18) =>
  `<span style="font-family:${th.monoStack};font-size:${r(U(size))}cqw;letter-spacing:0.26em;text-transform:uppercase;color:${color};white-space:nowrap;">${esc(t)}</span>`;

// `textfx.emphasis: "marker"` — THE SIGNATURE. A solar highlighter, swiped. Its soft ends are a
// gradient, not a blur (law 1), and the word on top turns indigo so it reads on the swipe whichever
// ground the page is printed on (rule 3).
const MARKER_FILL = `linear-gradient(93deg, ${rgba(SUN, 0)} 0%, ${rgba(SUN, 0.95)} 4%, ${rgba(SUN, 0.88)} 54%, ${rgba(HAZE, 0.92)} 94%, ${rgba(HAZE, 0)} 100%)`;

function markedWord(id, th, word, size, cls) {
  // Every length here is cqw derived from `size`, which is itself cqw. A bare `Math.max(2, ...)`
  // in a cqw field resolves to 2cqw = 38px and paints a block over the word it was meant to mark.
  const h = Math.max(U(10), size * 0.62);
  return `<span style="position:relative;display:inline-block;white-space:nowrap;">
    <span class="${id}-${cls}" style="position:absolute;left:${r(-size * 0.07)}cqw;right:${r(-size * 0.07)}cqw;bottom:${r(-size * 0.03)}cqw;height:${r(h)}cqw;background:${MARKER_FILL};transform:scaleX(0);transform-origin:left center;rotate:-0.7deg;"></span>
    <span style="position:relative;font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:1.1;color:${INK};">${esc(word)}</span>
  </span>`;
}
// The same swipe as a rule under a figure: the marker at label scale.
const markerRule = (id, cls, w, h) =>
  `<div class="${id}-${cls}" style="width:${r(w)}cqw;height:${r(h)}cqw;background:${MARKER_FILL};transform:scaleX(0);transform-origin:left center;rotate:-0.5deg;"></div>`;

const markerTweens = (id, ctx, at, cls) => [
  `tl.to(".${id}-${cls}",{scaleX:1,duration:${ctx.du(0.42)},ease:"power2.out"},${ctx.at(at)});`,
];

// ---- scenes -----------------------------------------------------------------
// FRONTISPIECE — the title page. Type only: a catalogue opens on a leaf of words, and keeping the
// first beat pictureless leaves the whole picture budget to the roles the manifest actually gives
// slot geometry to. A ghosted initial and one solar bloom carry the right-hand third.
function sFrontis(scene, ctx) {
  const { id, th, at, du } = ctx;
  const sk = skin(th);
  const S = ctx.S || STRINGS;
  const key = K.clampWords(String(scene.emphasis || "").trim(), 20);
  // MEASURE, DO NOT GUESS: the ceiling drops when a marked line has to be seated under the headline.
  const headMax = key ? U(108) : U(132);
  const colW = COL * 0.66;
  const head = K.fitLines(scene.headline || scene.title || ctx.title, colW / SAFE, headMax, 3, th.adv);
  const body = String(scene.subtext || "").trim().slice(0, 130);
  const keySize = U(48);

  // The title page opens U(20) higher than every other beat: it is the one leaf that has to seat a
  // kicker, three lines of display, a rule, a marked line AND body copy above the folio.
  const headTop = U(190) + U(44);
  const afterHead = headTop + head.lines.length * head.size * 1.06;
  const ruleY = afterHead + U(34);
  const keyY = ruleY + U(46);
  const bodyY = keyY + (key ? keySize * 1.3 + U(46) : U(24));

  return page(ctx, sk, {
    html: `
    <div class="${id}-kick" style="position:absolute;left:${r(M)}cqw;top:${r(U(190))}cqw;clip-path:inset(0 100% 0 0);z-index:4;">${tag(th, String(scene.kicker || S.frontis).slice(0, 32), sk.acc, 19)}</div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(headTop)}cqw;width:${r(colW)}cqw;z-index:4;">
      ${wipeLines(id, head.lines, `font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:1.06;letter-spacing:-0.012em;color:${sk.fg};`)}
    </div>
    <div class="${id}-rule" style="position:absolute;left:${r(M)}cqw;top:${r(ruleY)}cqw;width:${r(U(300))}cqw;height:${r(U(3))}cqw;background:${sk.acc};transform:scaleX(0);transform-origin:left center;z-index:4;"></div>
    ${key ? `<div style="position:absolute;left:${r(M)}cqw;top:${r(keyY)}cqw;width:${r(colW)}cqw;z-index:4;">${markedWord(id, th, key, keySize, "mk")}</div>` : ""}
    ${body ? `<div class="${id}-body" style="position:absolute;left:${r(M)}cqw;top:${r(bodyY)}cqw;width:${r(U(760))}cqw;font-family:${th.bodyStack};font-weight:400;font-size:${r(U(26))}cqw;line-height:1.62;color:${sk.sub};clip-path:inset(0 100% 0 0);z-index:4;">${esc(body)}</div>` : ""}
    ${K.ghostNum(th, { cls: `${id}-gh`, U, text: String(ctx.brand || "B").trim().charAt(0).toUpperCase(), right: U(90), y: U(230), size: U(520), color: rgba(SUN, 0.5), lh: 0.78 })}`,
    s: [
      `tl.to(".${id}-kick",{clipPath:"inset(0 0% 0 0)",duration:${du(0.3)},ease:"power2.inOut"},${at(0.1)});`,
      ...wipeTweens(id, ctx, 0.24, "ln", 0.5),
      `tl.to(".${id}-rule",{scaleX:1,duration:${du(0.4)},ease:"power3.inOut"},${at(0.86)});`,
      ...(key ? markerTweens(id, ctx, 1.02, "mk") : []),
      body ? `tl.to(".${id}-body",{clipPath:"inset(0 0% 0 0)",duration:${du(0.5)},ease:"power2.inOut"},${at(1.18)});` : "",
      ...K.ghostNumTweens(ctx, { cls: `${id}-gh`, U, amp: 12, rot: 1.4, yDur: 6.3, rDur: 7.9 }),
      ...sunDiscTweens(id, ctx, 0.18),
    ].filter(Boolean),
  }, { extraBg: sunDisc(id, { x: 78, y: 44, d: 1150, o: 0.4 }) });
}

// PLATES — the manifest's widest slot (1728x410), which is a STRIP at nearly full measure, not a
// card. Drawn as printed plates: keyline, caption bar INSIDE the keyline, FIG. number left and the
// beat's own label right. Two plates read as a catalogue spread, so the second is indented.
//
// The box's HEIGHT comes from the page, not from the ratio: 1728/410 is what picks a wide capture
// out of the pool, and then the leaf gives it whatever band is left under the headline.
function sPlates(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const sk = skin(th);
  const S = ctx.S || STRINGS;
  const n = Math.min(2, (shots || []).filter((s) => s && s.path).length);
  if (!n) return page(ctx, sk, K.statement(scene, ctx));

  const head = K.fitLines(scene.headline || scene.title || "", COL / SAFE, U(66), 2, th.adv);
  const bandTop = TOP + U(40) + head.lines.length * head.size * 1.08 + U(46);
  const gap = U(30);
  const indent = U(150);
  // One plate is drawn at its slot's own proportion (plus the caption bar) so a solo plate is not
  // stretched into a slab; two share the band.
  const h = n === 2 ? (FOOT - bandTop - gap) / 2 : Math.min(FOOT - bandTop, COL / (1728 / 410) + U(46));
  const geo = [
    { x: M, w: COL },
    { x: M + indent, w: COL - indent },
  ];
  const label = String(scene.kicker || S.plates).slice(0, 18).toUpperCase();

  return page(ctx, sk, {
    html: `
    <div class="${id}-kick" style="position:absolute;left:${r(M)}cqw;top:${r(TOP)}cqw;clip-path:inset(0 100% 0 0);z-index:4;">${tag(th, label, sk.acc)}</div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(TOP + U(40))}cqw;width:${r(COL)}cqw;z-index:4;">
      ${wipeLines(id, head.lines, `font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:1.08;letter-spacing:-0.01em;color:${sk.fg};`)}
    </div>
    ${Array.from({ length: n }, (_, i) => K.figPlate(th, {
      cls: `${id}-pl${i}`, U, x: geo[i].x, y: bandTop + i * (h + gap), w: geo[i].w, h,
      shot: shots[i], fig: roman(i + 1), label, border: 2, capSize: 14, shotFill: K.shotFill,
    })).join("")}`,
    s: [
      `tl.to(".${id}-kick",{clipPath:"inset(0 0% 0 0)",duration:${du(0.28)},ease:"power2.inOut"},${at(0.08)});`,
      ...wipeTweens(id, ctx, 0.18),
      ...Array.from({ length: n }, (_, i) => K.figPlateTweens(ctx, {
        // figPlateTweens places itself at `at(0)`, so the offset is folded into the function it is
        // handed rather than hard-coded inside the kit.
        cls: `${id}-pl${i}`, at: (s) => ctx.at(0.46 + i * 0.2 + s), du, U, bob: 5, seed: i,
        // No sheen (as edition's own mark plate does). A specular highlight sweeping a printed
        // plate belongs to a screen-lit pack; `surface.flat` is true here and this one is
        // "elegant, slow-confidence", so the plate simply breathes. figPlate still emits its
        // sheen div, parked at left:-30% inside an overflow:hidden parent — never visible, and
        // not a hidden-state violation because it carries no opacity/clip state to reveal.
        sheen: false, bobDur: 4.3,
      })).flat(),
    ],
  });
}

// NOTES — the catalogue's numbered entries: a roman numeral in the margin, a hairline above each
// row, and the beat's own bullets as the entries. The manifest's `how` slot is 998x367 `contain`, so
// the illustration is TIPPED IN at the foot — seated on the page, not cropped into a band.
function sNotes(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const sk = skin(th);
  const S = ctx.S || STRINGS;
  const steps = K.bullets(scene, 3).map((b) => String(b).slice(0, 84));
  if (steps.length < 2) return page(ctx, sk, K.statement(scene, ctx));

  const shot = (shots || []).find((s) => s && s.path) || null;
  const head = K.fitLines(String(scene.headline || S.notes), COL / SAFE, U(64), 2, th.adv);
  const listTop = TOP + U(40) + head.lines.length * head.size * 1.08 + U(40);
  // THE PLATE TAKES THE ROOM IT HAS. A fixed U(190) band left the picture a small stamp with a wide
  // gap above it; the rows need a U(76) floor each, so the plate is given whatever the index does not
  // use, between U(190) and U(360).
  const rowsNeed = steps.length * U(76) + U(40);
  const illH = shot ? Math.max(U(190), Math.min(U(360), FOOT - listTop - rowsNeed)) : 0;
  const illTop = FOOT - illH;
  // THE PLATE FRAMES THE PICTURE, IT DOES NOT FLOAT IN A BOX. This was the full measure wide with
  // `object-fit:contain`, so a 1.6:1 asset letterboxed to a small rectangle adrift in an empty
  // column — the one thing a printed catalogue never does. Size the plate to the asset's own ratio
  // at the height available, centre it on the measure, and give it the pack's keyline.
  const illRatio = shot && shot.ratio > 0.2 ? shot.ratio : 16 / 9;
  const illW = Math.min(COL, illH * illRatio);
  const illX = M + (COL - illW) / 2;
  const listBottom = shot ? illTop - U(40) : FOOT;
  // Rows DIVIDE the room they have: two entries and three entries both reach the foot of the list.
  const rowH = Math.max(U(76), (listBottom - listTop) / steps.length);

  return page(ctx, sk, {
    html: `
    <div class="${id}-kick" style="position:absolute;left:${r(M)}cqw;top:${r(TOP)}cqw;clip-path:inset(0 100% 0 0);z-index:4;">${tag(th, String(scene.kicker || S.notes).slice(0, 32), sk.acc)}</div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(TOP + U(40))}cqw;width:${r(COL)}cqw;z-index:4;">
      ${wipeLines(id, head.lines, `font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:1.08;letter-spacing:-0.01em;color:${sk.fg};`)}
    </div>
    ${steps.map((s, i) => `<div class="${id}-row" style="position:absolute;left:${r(M)}cqw;top:${r(listTop + i * rowH)}cqw;width:${r(COL)}cqw;height:${r(rowH)}cqw;border-top:${r(U(1.5))}cqw solid ${rgba(sk.fg, 0.24)};display:flex;align-items:center;gap:${r(U(34))}cqw;clip-path:inset(0 100% 0 0);z-index:4;">
      <span style="flex:0 0 auto;width:${r(U(86))}cqw;font-family:${th.displayStack};font-style:italic;font-size:${r(U(50))}cqw;line-height:1;color:${sk.acc};">${esc(roman(i + 1))}</span>
      <span style="font-family:${th.displayStack};font-size:${r(U(38))}cqw;line-height:1.24;color:${sk.fg};">${esc(s)}</span>
    </div>`).join("")}
    ${shot ? `<div class="${id}-ill" style="position:absolute;left:${r(illX)}cqw;top:${r(illTop)}cqw;width:${r(illW)}cqw;height:${r(illH)}cqw;border:${r(U(1.5))}cqw solid ${rgba(sk.fg, 0.4)};box-sizing:border-box;overflow:hidden;clip-path:inset(0 100% 0 0);z-index:4;">
      <img src="${esc(shot.path)}" alt="${esc(shot.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center center;display:block;">
    </div>` : ""}`,
    s: [
      `tl.to(".${id}-kick",{clipPath:"inset(0 0% 0 0)",duration:${du(0.28)},ease:"power2.inOut"},${at(0.08)});`,
      ...wipeTweens(id, ctx, 0.18),
      `tl.to(".${id}-row",{clipPath:"inset(0 0% 0 0)",duration:${du(0.44)},ease:"power2.inOut",stagger:${du(0.18)}},${at(0.5)});`,
      shot ? `tl.to(".${id}-ill",{clipPath:"inset(0 0% 0 0)",duration:${du(0.5)},ease:"power2.inOut"},${at(1.1)});` : "",
    ].filter(Boolean),
  });
}

// FIGURES — the table of figures, and the ONLY role that prints numbers as numbers (see `carry`).
// Each figure is a serif numeral counted up, with the marker swiped underneath it and a mono caps
// label below: the emphasis device doing arithmetic instead of rhetoric.
function sFigures(scene, ctx) {
  const { id, th, at, du } = ctx;
  const sk = skin(th);
  const S = ctx.S || STRINGS;
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return page(ctx, sk, K.statement(scene, ctx));

  const head = K.fitLines(String(scene.headline || scene.title || S.figures), COL / SAFE, U(64), 2, th.adv);
  const bandTop = TOP + U(40) + head.lines.length * head.size * 1.08 + U(56);
  const bandH = FOOT - bandTop;
  const cw = COL / stats.length;

  return page(ctx, sk, {
    html: `
    <div class="${id}-kick" style="position:absolute;left:${r(M)}cqw;top:${r(TOP)}cqw;clip-path:inset(0 100% 0 0);z-index:4;">${tag(th, String(scene.kicker || S.figures).slice(0, 32), sk.acc)}</div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(TOP + U(40))}cqw;width:${r(COL)}cqw;z-index:4;">
      ${wipeLines(id, head.lines, `font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:1.08;letter-spacing:-0.01em;color:${sk.fg};`)}
    </div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(bandTop)}cqw;width:${r(COL)}cqw;height:${r(bandH)}cqw;display:flex;z-index:4;">
      ${stats.map((st, i) => `<div class="${id}-cel" style="width:${r(cw)}cqw;height:100%;box-sizing:border-box;padding:0 ${r(U(34))}cqw 0 ${r(i ? U(40) : 0)}cqw;${i ? `border-left:${r(U(1.5))}cqw solid ${rgba(sk.fg, 0.24)};` : ""}display:flex;flex-direction:column;justify-content:center;clip-path:inset(0 100% 0 0);">
        <div style="margin-bottom:${r(U(20))}cqw;">${tag(th, `${S.fig || "FIG"}. ${roman(i + 1)}`, sk.acc, 16)}</div>
        <div style="font-family:${th.displayStack};font-size:${r(K.fitOne(`${st.v}${st.suffix}`, cw - U(80), U(150), th.adv))}cqw;line-height:1;letter-spacing:-0.02em;color:${sk.fg};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
        ${markerRule(id, `mk${i}`, Math.min(cw - U(70), U(300)), U(16))}
        <div style="margin-top:${r(U(24))}cqw;font-family:${th.monoStack};font-size:${r(U(19))}cqw;letter-spacing:0.2em;text-transform:uppercase;color:${sk.sub};">${esc(K.statLabel(scene, i))}</div>
      </div>`).join("")}
    </div>`,
    s: [
      `tl.to(".${id}-kick",{clipPath:"inset(0 0% 0 0)",duration:${du(0.28)},ease:"power2.inOut"},${at(0.08)});`,
      ...wipeTweens(id, ctx, 0.18),
      `tl.to(".${id}-cel",{clipPath:"inset(0 0% 0 0)",duration:${du(0.44)},ease:"power2.inOut",stagger:${du(0.16)}},${at(0.44)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.56)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.56 + i * 0.16)});`,
          ...markerTweens(id, ctx, 0.86 + i * 0.16, `mk${i}`),
        ];
      }),
    ],
  });
}

// WALL TEXT — the exhibition wall panel: one long serif sentence, an oversized ghosted quotation
// mark drifting behind it, an accent rule and the attribution in mono. The manifest's `context` slot
// (826x162, cover) is the VITRINE BAND at the foot — an optional strip, drawn only when a picture
// exists for it, because a hollow keyline is the defect this family keeps re-learning.
function sWallText(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const sk = skin(th);
  const S = ctx.S || STRINGS;
  const q = String(scene.quote || scene.headline || scene.subtext || "").trim().slice(0, 230);
  if (!q) return page(ctx, sk, K.statement(scene, ctx));

  const shot = (shots || []).find((s) => s && s.path) || null;
  const by = String(scene.attribution || scene.emphasis || "").trim().slice(0, 60);
  // The ceiling drops when the vitrine band takes the foot of the page: measured, not guessed.
  const fit = K.fitLines(q, (COL * 0.88) / SAFE, shot ? U(56) : U(74), 4, th.adv);
  const qTop = TOP + U(56);
  const ruleY = qTop + fit.lines.length * fit.size * 1.32 + U(40);
  const byY = ruleY + U(34);
  const bandW = U(980), bandH = U(190), bandTop = FOOT - bandH;

  return page(ctx, sk, {
    html: `
    ${K.ghostNum(th, { cls: `${id}-gh`, U, text: "“", right: U(120), y: U(150), size: U(520), color: rgba(SUN, 0.55), lh: 0.8 })}
    <div class="${id}-kick" style="position:absolute;left:${r(M)}cqw;top:${r(TOP)}cqw;clip-path:inset(0 100% 0 0);z-index:4;">${tag(th, String(scene.kicker || S.walltext).slice(0, 32), sk.acc)}</div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(qTop)}cqw;width:${r(COL * 0.88)}cqw;z-index:4;">
      ${wipeLines(id, fit.lines, `font-family:${th.displayStack};font-size:${r(fit.size)}cqw;line-height:1.32;letter-spacing:-0.008em;color:${sk.fg};`)}
    </div>
    <div class="${id}-rule" style="position:absolute;left:${r(M)}cqw;top:${r(ruleY)}cqw;width:${r(U(220))}cqw;height:${r(U(3))}cqw;background:${sk.acc};transform:scaleX(0);transform-origin:left center;z-index:4;"></div>
    ${by ? `<div class="${id}-by" style="position:absolute;left:${r(M)}cqw;top:${r(byY)}cqw;clip-path:inset(0 100% 0 0);z-index:4;">${tag(th, by, sk.sub, 19)}</div>` : ""}
    ${shot ? `<div class="${id}-band" style="position:absolute;left:${r(M)}cqw;top:${r(bandTop)}cqw;width:${r(bandW)}cqw;height:${r(bandH)}cqw;border:${r(U(2))}cqw solid ${sk.fg};box-sizing:border-box;overflow:hidden;z-index:4;">
      <div class="${id}-bandi" style="position:absolute;inset:0;clip-path:inset(0 100% 0 0);">${K.shotFill(shot, { bg: sk.bg, w: bandW, h: bandH })}</div>
    </div>
    <div class="${id}-bandc" style="position:absolute;left:${r(M + bandW + U(30))}cqw;top:${r(bandTop + U(6))}cqw;clip-path:inset(0 100% 0 0);z-index:4;">${tag(th, String(S.vitrine || "VITRINE"), sk.acc, 16)}</div>` : ""}`,
    s: [
      `tl.to(".${id}-kick",{clipPath:"inset(0 0% 0 0)",duration:${du(0.28)},ease:"power2.inOut"},${at(0.08)});`,
      ...wipeTweens(id, ctx, 0.2, "ln", 0.5),
      `tl.to(".${id}-rule",{scaleX:1,duration:${du(0.36)},ease:"power3.inOut"},${at(1.02)});`,
      by ? `tl.to(".${id}-by",{clipPath:"inset(0 0% 0 0)",duration:${du(0.3)},ease:"power2.inOut"},${at(1.16)});` : "",
      shot ? `tl.to(".${id}-bandi",{clipPath:"inset(0 0% 0 0)",duration:${du(0.5)},ease:"power2.inOut"},${at(0.66)});` : "",
      shot ? `tl.to(".${id}-bandc",{clipPath:"inset(0 0% 0 0)",duration:${du(0.3)},ease:"power2.inOut"},${at(0.9)});` : "",
      ...K.ghostNumTweens(ctx, { cls: `${id}-gh`, U, amp: 10, rot: 1.2, yDur: 6.7, rDur: 8.3 }),
    ].filter(Boolean),
  });
}

// COLOPHON — the closing page, and the ONE beat printed on indigo. `fx.canvas: "confetti"` lands
// here as slow gold leaf falling through the solar blooms. Set left, like every other page.
const LEAVES = Array.from({ length: 22 }, (_, i) => {
  const s = i * 47.3;
  const f = (s * 0.137) % 1;
  return {
    x: 2 + (s % 94), top: -12 + f * 120, dur: 4.4 + f * 3.6,
    w: 10 + (i % 3) * 5, h: 15 + (i % 4) * 4, hue: i % 3, spin: 140 + (i % 5) * 70,
  };
});
function sColophon(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const sk = skin(th, true);
  const S = ctx.S || STRINGS;
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, (COL * 0.78) / SAFE, U(116), 2, th.adv);
  const action = K.clampWords(String(scene.emphasis || "").trim(), 24) || S.go;
  const hasMark = !!(logo && logo.path);
  const cols = [SUN, HAZE, SUN_SOFT];

  const top = U(270);
  const headTop = top + (hasMark ? U(150) : U(46));
  const btnY = headTop + head.lines.length * head.size * 1.08 + U(50);

  return page(ctx, sk, {
    html: `
    ${hasMark ? `<div class="${id}-logo" style="position:absolute;left:${r(M)}cqw;top:${r(top)}cqw;width:${r(U(112))}cqw;height:${r(U(112))}cqw;border:${r(U(2))}cqw solid ${rgba(sk.fg, 0.7)};box-sizing:border-box;padding:${r(U(16))}cqw;display:flex;align-items:center;justify-content:center;clip-path:inset(0 100% 0 0);z-index:4;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;display:block;"></div>` : ""}
    <div class="${id}-kick" style="position:absolute;left:${r(M)}cqw;top:${r(hasMark ? top + U(126) : top)}cqw;clip-path:inset(0 100% 0 0);z-index:4;">${tag(th, String(scene.kicker || S.colophon).slice(0, 32), sk.acc)}</div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(headTop)}cqw;width:${r(COL * 0.78)}cqw;z-index:4;">
      ${wipeLines(id, head.lines, `font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:1.08;letter-spacing:-0.012em;color:${sk.fg};`)}
    </div>
    <div class="${id}-btn" style="position:absolute;left:${r(M)}cqw;top:${r(btnY)}cqw;background:${SUN};color:${INK};font-family:${th.displayStack};font-size:${r(K.fitOne(action, U(700), U(46), th.adv))}cqw;line-height:1.1;padding:${r(U(20))}cqw ${r(U(40))}cqw;clip-path:inset(0 100% 0 0);z-index:4;">${esc(action)}</div>
    <div class="${id}-url" style="position:absolute;left:${r(M)}cqw;top:${r(btnY + U(112))}cqw;clip-path:inset(0 100% 0 0);z-index:4;">${tag(th, ctx.url, rgba(PAPER, 0.7), 20)}</div>`,
    s: [
      hasMark ? `tl.to(".${id}-logo",{clipPath:"inset(0 0% 0 0)",duration:${du(0.34)},ease:"power2.inOut"},${at(0.08)});` : "",
      `tl.to(".${id}-kick",{clipPath:"inset(0 0% 0 0)",duration:${du(0.28)},ease:"power2.inOut"},${at(0.2)});`,
      ...wipeTweens(id, ctx, 0.32, "ln", 0.5),
      `tl.to(".${id}-btn",{clipPath:"inset(0 0% 0 0)",duration:${du(0.4)},ease:"power2.inOut"},${at(0.96)});`,
      `tl.to(".${id}-url",{clipPath:"inset(0 0% 0 0)",duration:${du(0.3)},ease:"power2.inOut"},${at(1.16)});`,
      `tl.to(".${id}-leaf",{opacity:1,duration:${du(0.4)},ease:"none"},${at(0.4)});`,
      // One tween per flake, carrying BOTH axes of its motion, so nothing contends for `transform`.
      ...LEAVES.map((c, i) => `tl.to(".${id}-lf${i}",{y:"${r((126 / 100) * VH)}cqw",rotation:${r(c.spin)},duration:${r(c.dur)},ease:"none",repeat:${K.reps(ctx.L, c.dur)}},${ctx.at(0.4)});`),
      ...sunDiscTweens(id, ctx, 0.12),
    ].filter(Boolean),
  }, {
    extraBg: `${sunDisc(id, { x: 72, y: 34, d: 1250, o: 0.34 })}
    <div class="${id}-leaf" style="position:absolute;inset:0;overflow:hidden;opacity:0;">
      ${LEAVES.map((c, i) => `<div class="${id}-lf${i}" style="position:absolute;left:${r(c.x)}%;top:${r((c.top / 100) * VH)}cqw;width:${r(U(c.w))}cqw;height:${r(U(c.h))}cqw;border-radius:50% 50% 50% 12%;background:${cols[c.hue]};opacity:0.85;"></div>`).join("")}
    </div>`,
  });
}

// ---- spine ------------------------------------------------------------------
const SPEC = {
  first: "frontis", last: "colophon",
  // `plates` leads the rotation so a short film still shows the pack's picture beat; `walltext` is
  // last because it is the one middle that can carry with nothing but a sentence.
  middle: ["plates", "figures", "notes", "walltext"],
  shapes: {
    // The manifest's own slot geometry, verbatim: feature/proof 1728x410, how 998x367,
    // context 826x162. These pick the pictures; the page decides the boxes.
    frontis: [], plates: [1728 / 410, 1728 / 410], notes: [998 / 367], figures: [],
    walltext: [826 / 162], colophon: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "plates" ? Math.min(2, Math.max(0, budget))
    : role === "notes" || role === "walltext" ? Math.min(1, Math.max(0, budget)) : 0),
  // Only `plates` is INCOMPLETE without a picture. `notes` and `walltext` are whole as type and
  // merely richer with one, so they must not be downgraded for the want of an asset.
  needs: (role) => (role === "plates" ? 1 : 0),
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "figures") return isStats;
    if (isStats) return false;                       // only `figures` prints figures as figures
    if (role === "plates") return budget >= 1;
    if (role === "notes") return K.bullets(scene, 3).length >= 2;
    if (role === "walltext") return !!String(scene.quote || scene.subtext || "").trim();
    return true;
  },
};

const BUILDERS = {
  frontis: sFrontis, plates: sPlates, notes: sNotes, figures: sFigures,
  walltext: sWallText, colophon: sColophon,
  // The statement fallbacks go through `page()` like everything else, so a pictureless beat is
  // still a page of this catalogue rather than a bare kit layout wearing the palette.
  statement: (sc, ctx) => page(ctx, skin(ctx.th), K.statement(sc, ctx)),
  "statement-c": (sc, ctx) => page(ctx, skin(ctx.th), K.statement(sc, ctx, { centred: true })),
};

const LABELS = {
  frontis: STRINGS.frontis, plates: STRINGS.plates, notes: STRINGS.notes,
  figures: STRINGS.figures, walltext: STRINGS.walltext, colophon: STRINGS.colophon,
};

const css = (th, stage) => K.baseCss(th, stage, `
  /* The caption is printed matter too: square corners, an ink hairline, parchment stock. */
  #cap-pill { border-radius:0; border:${r(U(1.5))}cqw solid ${rgba(INK, 0.45)}; background:${rgba(PAPER, 0.94)}; }
  #cap-text { font-family:${th.bodyStack}; font-weight:500; letter-spacing:0; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css,
    // `audio: { energy: "low", tempo: "slow", archetype: "luxury" }` — a long reference beat, so the
    // type is uncovered at reading pace rather than snapped on.
    refBeat: 4.8,
    // `motion.drift: 1.025`, and a small push: "slow-confidence" does not lunge at the viewer.
    camera: { push: 80, scale: DRIFT },
    signature: "editorial", fallbackBrand: "BIENNALE",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
