// BAUHAUS PRINT — a retro risograph poster press. Native GSAP + DOM, built on om_port_kit.
//
// PROVENANCE. NOT a port: there is no Claude Design reference for this pack. It is written from its
// own manifest, frames/bauhaus-print/pack.json, which is the only brief that exists for it.
//
// WHY IT WAS BUILT. The pack had no composer, so every film that selected bauhaus-print rendered
// through the GENERIC scene kit wearing its palette — the design below has never existed in code.
// The manifest's own words (its `vibe` field is truncated mid-sentence in the pack file, so the last
// clause is quoted as far as it goes):
//
//   "A retro risograph Bauhaus poster system: cream paper, two-color overprint, and primary geometric
//    shapes — big circles, triangles, squares — as composition anchors. Halftone dot textures, slight
//    overprint offset (a shape's duplicate in a sec[ond colour, offset a few pixels]…"
//
// THE FIVE RULES, taken from that brief and enforced everywhere in this file:
//   1. TWO INKS PER SHEET, NEVER THREE. Every beat prints ink (#1A1A1A) plus ONE of the manifest's
//      primaries, rotating by beat index. A third primary only ever appears as a low-alpha
//      overprint tint in the ground, never as a solid alongside the other two.
//   2. EVERY IMPRESSION IS PRINTED TWICE. The signature device: each display word and each primary
//      shape carries a duplicate in the second colour, offset by ~10px, sitting UNDER the ink pull.
//      That mis-registration fringe is the whole look, and it is in the shared furniture, so every
//      beat wears it — headline, shape, stat, stamp and close.
//   3. PRIMARY GEOMETRY IS COMPOSITION, NOT DECORATION. A circle, a triangle or a square anchors
//      each beat, sized against the type rather than sprinkled behind it.
//   4. THE PAPER IS ALWAYS SCREENED. A halftone dot field over cream (#F3ECD8) with a paper-deep
//      (#E7DEC4) second sheet and printer's registration crosshairs at the corners. `surface.flat`
//      is true: no shadows, no soft edges, no rounded corners anywhere.
//   5. THE CLOSE IS A FLOOD. `motion.cut: "wipe"` and one flooded back page — the beat's ink takes
//      the whole sheet and the type reverses out of it. THE GROUND CHANGES PER SCENE, so this pack MUST
//      return its own `chrome:` from every builder (the kit's chrome paints from the FILM theme and
//      would print near-black furniture on a red flood).
//
// FONT SUBSTITUTION: Archivo Black and Archivo are both bundled and used exactly as the manifest
// names them (display and body). `Inter` — the manifest's third family — is NOT bundled, and rather
// than reach outside the pack for a stand-in, its role is folded into Archivo, which the manifest
// already asks for and which is the same Latin grotesque skeleton. Space Mono (bundled) carries the
// press labels; the manifest names no mono face, and a slightly mechanical typewriter mono is what a
// riso colophon is set in.
//
// NO BLEND MODES. A risograph overprint is `multiply` in the real world, but the kit paints the
// backdrop (.om-bg) and the content (.om-drift) in SEPARATE stacking contexts — a `mix-blend-mode`
// element inside the content layer cannot see the paper behind it, so multiply would degrade to a
// flat fill on exactly the beats that need it most. Instead the darkening comes from real alpha
// compositing (overlapping low-alpha primaries in the ground) and from the offset fringe of two
// solid pulls. Same look, no dependency on how the compositor isolates layers.

const K = require("./om_port_kit");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U, VH } = STAGE;

// The manifest's palette, verbatim.
const CREAM = "#F3ECD8", DEEP = "#E7DEC4", INK = "#1A1A1A";
const RED = "#E2483D", BLUE = "#2B4FB0", YELLOW = "#F2C12E";
const DISPLAY = "Archivo Black", BODY = "Archivo", MONO = "Space Mono";

// The overprint offsets. "Slight" in the brief: ten authored pixels on type, eighteen on a shape,
// because a 600px circle needs a proportionally wider mis-pull to read as one.
const OFF = U(10), OFF_SHAPE = U(18);

const STRINGS = {
  poster: "PLATE ONE", press: "IMPRESSION", figures: "THE FIGURES", method: "THE METHOD",
  mark: "THE MARK", colophon: "COLOPHON",
  scene: "PLATE", of: "OF", go: "GET STARTED", imp: "IMPRESSION", ink: "INK", step: "STEP",
};

function theme(brandSkin) {
  // The brand colour becomes the FIRST of the three inks, so a rebranded film opens printed in the
  // user's colour and still rotates through the pack's other two. Flattening all three to one hue
  // would destroy a pack whose identity is "two inks per sheet, a different pair each beat".
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: CREAM, isDark: false, packAccent: RED });
  return {
    accent, bg: CREAM, paper: CREAM, panel: DEEP, deep: DEEP, ink: INK,
    sub: rgba(INK, 0.62), line: rgba(INK, 0.26),
    inks: [accent, BLUE, YELLOW],
    adv: K.ADVANCE.upper,                 // `textfx.case: "upper"` — the display face is only ever caps
    capBg: CREAM, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO, `'${BODY}', 'Helvetica Neue', Arial, sans-serif`, [BODY]),
    bodyStack: `'${BODY}', 'Helvetica Neue', Arial, sans-serif`,
    resolvedBrand,
  };
}

// ---- the sheet ---------------------------------------------------------------
// M is the manifest's own measure: 1920 - 2*96 = 1728, which is exactly the width of its `feature`
// and `proof` slots. Deriving the margin from the slot geometry rather than picking a round number
// means a press strip is printed at the size the pack asked for.
const M = U(96);
const COL = U(1728);
// Nothing is printed below this line. The plate rule sits at 1022 and the swatch row at 980; a
// panel that reaches the frame edge covers both (the mistake kinetic-bold's band once made).
const FOOT = U(958);

// Rows a run of body copy will occupy at a given measure. MEASURE, DO NOT GUESS: anything seated
// under a paragraph has to know how tall the paragraph became, or one long subtext prints straight
// through the stamp beneath it.
const bodyRows = (text, measureCqw, sizeCqw, adv = K.ADVANCE.mixed) =>
  Math.max(1, Math.ceil((String(text || "").length * sizeCqw * adv) / Math.max(0.001, measureCqw)));

// Two inks, chosen from the beat index. THIS IS RULE 1 IN ONE PLACE, so no builder can put three
// solids on one sheet or print cream type on cream paper.
//
// `ink2` EXISTS BECAUSE ONE OF THE THREE PRIMARIES IS YELLOW. #F2C12E is a fine FILL on cream and an
// invisible one as 20px mono caps — every third beat's kickers, captions and progress rail would have
// vanished. Fills use the raw ink; anything set as small TYPE uses `ink2`, the same hue darkened
// until it clears the paper. (`ensureContrast` on a light ground darkens rather than lifts.)
function skin(ctx, flood = false) {
  const inks = ctx.th.inks;
  const second = inks[ctx.i % inks.length];
  const third = inks[(ctx.i + 1) % inks.length];
  if (flood) {
    // The flooded back page: the second ink IS the paper. The reverse colour is RESOLVED against
    // that ink, not assumed to be cream — a yellow flood needs near-black type, and hardcoding cream
    // here is how a closing beat ships with an unreadable call to action.
    const fg = K.inkOn(second, INK, CREAM);
    return {
      flood: true, bg: second, deep: rgba(INK, 0.08), ink: fg, second: third, third: fg,
      sub: rgba(fg, 0.78), line: rgba(fg, 0.42), tone: fg, rail: fg, ink2: fg,
      chips: [fg, rgba(fg, 0.55), rgba(fg, 0.3)],
    };
  }
  const ink2 = K.ensureContrast(second, { dark: false, limit: 0.42 });
  return {
    flood: false, bg: CREAM, deep: DEEP, ink: INK, second, third, ink2,
    sub: rgba(INK, 0.62), line: rgba(INK, 0.26), tone: INK, rail: ink2,
    chips: [second, third, inks[(ctx.i + 2) % inks.length]],
  };
}

// The halftone screen. A dot field as a background-image, written in the one form this codebase has
// proved safe: a bare colour-stop LENGTH pair, no shape keyword. `radial-gradient(circle <pct>%, …)`
// is invalid CSS and silently drops the entire comma-joined background — it has cost three packs
// their colour, so the shape keyword is simply never used in this file.
const halftone = (color, alpha, dot = 1.2, tile = 9) =>
  `background-image:radial-gradient(${rgba(color, alpha)} ${r(U(dot))}cqw, transparent ${r(U(dot))}cqw);background-size:${r(U(tile))}cqw ${r(U(tile))}cqw;`;

// The three primaries as CSS shapes. A circle needs equal width AND height — both are written in
// cqw, which resolves against the container's WIDTH for both axes, so a cqw square is a real square.
const SHAPES = { circle: "border-radius:50%;", square: "", triangle: "clip-path:polygon(50% 0%,100% 100%,0% 100%);" };
// A SIX-LONG TABLE FOR THREE SHAPES, deliberately. The ink pair rotates with period 3 (there are
// three primaries), so a shape table of period 3 makes every beat identical to the beat three before
// it — and `mark`, the fallback role, lands on exactly that spacing in an eight-beat film. Two beats
// were coming out with the same shape AND the same pair. Period 6 against period 3 decorrelates them.
const KINDS = ["circle", "triangle", "square", "triangle", "square", "circle"];
const kindOf = (i) => KINDS[(((i | 0) % 6) + 6) % 6];

// A printed primary: the second-colour pull, offset, with the ink pull on top of it. `translate:`
// rather than `transform:` on the offset layer — GSAP owns `transform` on the wrapper, and an inline
// transform on a tweened element is replaced wholesale.
function printShape(cls, { x, y, size, kind = "circle", ink, ghost, off = OFF_SHAPE, tone = null, alpha = 1 }) {
  const clip = SHAPES[kind] || "";
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(size)}cqw;height:${r(size)}cqw;opacity:0;">
    <div style="position:absolute;inset:0;background:${ghost};${clip}translate:${r(off)}cqw ${r(off)}cqw;"></div>
    <div style="position:absolute;inset:0;background:${alpha < 1 ? rgba(ink, alpha) : ink};${clip}"></div>
    ${tone ? `<div style="position:absolute;inset:0;${clip}${halftone(tone, 0.42)}"></div>` : ""}
  </div>`;
}
// ONE tween, so scale and rotation never contend for `transform` on the same element.
const printShapeTweens = (cls, ctx, at) => [
  `tl.fromTo(".${cls}",{opacity:0,scale:0.62},{opacity:1,scale:1,duration:${ctx.du(0.36)},ease:"back.out(1.6)",transformOrigin:"center center"},${ctx.at(at)});`,
];

// A numbered primary: the same double pull with a knocked-out digit. A triangle's optical centre sits
// in its lower half, so its digit is bottom-aligned — centred, it floats outside the shape's mass.
function numShape(cls, th, sk, { size, kind, n }) {
  const clip = SHAPES[kind] || "";
  const low = kind === "triangle";
  return `<div class="${cls}" style="position:relative;width:${r(size)}cqw;height:${r(size)}cqw;flex:0 0 auto;">
    <div style="position:absolute;inset:0;background:${sk.second};${clip}translate:${r(U(7))}cqw ${r(U(7))}cqw;"></div>
    <div style="position:absolute;inset:0;background:${sk.ink};${clip}"></div>
    <div style="position:absolute;inset:0;display:flex;align-items:${low ? "flex-end" : "center"};justify-content:center;${low ? `padding-bottom:${r(size * 0.08)}cqw;` : ""}font-family:${th.displayStack};font-size:${r(size * 0.42)}cqw;line-height:1;color:${sk.bg};">${esc(String(n))}</div>
  </div>`;
}
const numShapeTweens = (cls, ctx, at) => [
  `tl.fromTo(".${cls}",{scale:0.4},{scale:1,duration:${ctx.du(0.3)},ease:"back.out(2)",transformOrigin:"center center"},${ctx.at(at)});`,
];

// ---- the ground -------------------------------------------------------------
// Cream (or the flood), a paper-deep second sheet, the halftone screen, two overlapping primaries at
// low alpha whose INTERSECTION darkens — that is a genuine two-colour overprint done with alpha
// compositing rather than a blend mode — and the printer's registration crosshairs.
function sheet(id, th, sk, ctx) {
  const anchor = kindOf(ctx.i), anchor2 = kindOf(ctx.i + 2);
  return `<div style="position:absolute;inset:0;background:${sk.bg};overflow:hidden;">
    <div style="position:absolute;left:${r(U(1180))}cqw;top:0;width:${r(U(740))}cqw;height:100%;background:${sk.deep};"></div>
    <div class="${id}-tone" style="position:absolute;inset:${r(-U(20))}cqw;${halftone(sk.tone, 0.1)}"></div>
    <div class="${id}-an1" style="position:absolute;left:${r(U(-160))}cqw;top:${r(U(430))}cqw;width:${r(U(760))}cqw;height:${r(U(760))}cqw;">
      <div class="${id}-an1r" style="position:absolute;inset:0;background:${rgba(sk.second, 0.16)};${SHAPES[anchor]}"></div>
    </div>
    <div class="${id}-an2" style="position:absolute;left:${r(U(1330))}cqw;top:${r(U(-180))}cqw;width:${r(U(700))}cqw;height:${r(U(700))}cqw;">
      <div class="${id}-an2r" style="position:absolute;inset:0;background:${rgba(sk.third, 0.14)};${SHAPES[anchor2]}"></div>
    </div>
    ${K.regMarks(th, { cls: id, pts: [[46, 46], [1874, 46], [46, 1034], [1874, 1034]], color: sk.second, arm: 16, ring: 9 })}
    ${pressBar(id, sk)}
  </div>`;
}
// The screen creeps by exactly one tile so the loop is seamless; the anchors drift and turn on
// nested wrappers, one property each (a shape carrying both a static offset and a rotation must be
// split, or the two writes fight over `transform`).
const sheetTweens = (id, ctx) => {
  const slow = Math.max(9, ctx.L * 2.6);
  return [
    `tl.fromTo(".${id}-tone",{x:0,y:0},{x:"${r(U(9))}cqw",y:"${r(U(9))}cqw",duration:6,ease:"none",repeat:${K.reps(ctx.L, 6)}},${r(ctx.T)});`,
    `tl.to(".${id}-an1",{x:"${r(U(40))}cqw",y:"${r(-U(26))}cqw",duration:${r(slow)},ease:"sine.inOut",repeat:${K.reps(ctx.L, slow)},yoyo:true},${r(ctx.T)});`,
    `tl.fromTo(".${id}-an1r",{rotation:-4},{rotation:4,duration:${r(slow)},ease:"sine.inOut",repeat:${K.reps(ctx.L, slow)},yoyo:true},${r(ctx.T)});`,
    `tl.to(".${id}-an2",{x:"${r(-U(34))}cqw",y:"${r(U(22))}cqw",duration:${r(slow * 0.8)},ease:"sine.inOut",repeat:${K.reps(ctx.L, slow * 0.8)},yoyo:true},${r(ctx.T)});`,
    `tl.fromTo(".${id}-an2r",{rotation:5},{rotation:-5,duration:${r(slow * 0.8)},ease:"sine.inOut",repeat:${K.reps(ctx.L, slow * 0.8)},yoyo:true},${r(ctx.T)});`,
    ...K.regMarkTweens(ctx, { cls: id }),
    ...pressBarTweens(id, ctx),
  ];
};

// `motion.cut: "wipe"` — the press pass. A soft band of the beat's second ink sweeps the sheet as it
// arrives. It lives in the ground layer, so it passes UNDER the type: a wipe that crossed over the
// copy would read as a bug on a pack whose whole point is legible print.
function pressBar(id, sk) {
  return `<div class="${id}-wipe" style="position:absolute;top:0;bottom:0;left:0;width:${r(U(560))}cqw;background:linear-gradient(90deg, ${rgba(sk.second, 0)} 0%, ${rgba(sk.second, 0.3)} 52%, ${rgba(sk.second, 0)} 100%);opacity:0;"></div>`;
}
// Two tweens on one element, so the second must start after the first has FINISHED. `at()` and `du()`
// do not scale together — a music-led film quickens `du` by tempo.motion while `at` keeps its position
// in the beat — so the hand-off is placed at 0.42 rather than at the 0.34 the first tween nominally
// ends on. That headroom is what keeps the two from contending for opacity on a no-narration cut.
const pressBarTweens = (id, ctx) => [
  `tl.fromTo(".${id}-wipe",{opacity:0,x:"${r(-U(600))}cqw"},{opacity:1,x:"${r(U(700))}cqw",duration:${ctx.du(0.34)},ease:"power2.out"},${ctx.at(0)});`,
  `tl.to(".${id}-wipe",{opacity:0,x:"${r(U(1980))}cqw",duration:${ctx.du(0.3)},ease:"power2.in"},${ctx.at(0.42)});`,
];

// ---- the chrome -------------------------------------------------------------
// THE PACK OWNS ITS CHROME (rule 5). The kit's HUD paints from the FILM theme — one ink, one accent
// — while this pack changes its ink pair on every beat and floods the sheet on the last one. The
// kit's wordmark would print near-black on a red flood and its rail would show a third solid.
// A printer's masthead instead: the plate stamp, the wordmark, the run number, the ink swatches and
// the press rule.
function plateHud(ctx, sk) {
  const { id, th, i, total, label, S } = ctx;
  const brand = String(ctx.brand || "").slice(0, 22);
  const initial = (brand.trim().charAt(0) || "B").toUpperCase();
  return `<div class="om-chrome">
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(48))}cqw;display:flex;align-items:center;gap:${r(U(16))}cqw;">
      <span style="position:relative;display:inline-block;width:${r(U(46))}cqw;height:${r(U(46))}cqw;flex:0 0 auto;">
        <span style="position:absolute;inset:0;background:${sk.second};translate:${r(U(5))}cqw ${r(U(5))}cqw;"></span>
        <span style="position:absolute;inset:0;background:${sk.ink};display:grid;place-items:center;font-family:${th.displayStack};font-size:${r(U(26))}cqw;line-height:1;color:${sk.bg};">${esc(initial)}</span>
      </span>
      <span style="font-family:${th.displayStack};font-size:${r(U(30))}cqw;line-height:1;letter-spacing:0.01em;text-transform:uppercase;color:${sk.ink};white-space:nowrap;">${esc(brand)}</span>
      ${label ? `<span style="font-family:${th.monoStack};font-weight:700;font-size:${r(U(17))}cqw;letter-spacing:0.2em;text-transform:uppercase;color:${sk.sub};white-space:nowrap;">／ ${esc(label)}</span>` : ""}
    </div>
    <div style="position:absolute;right:${r(M)}cqw;top:${r(U(56))}cqw;font-family:${th.monoStack};font-weight:700;font-size:${r(U(17))}cqw;letter-spacing:0.2em;text-transform:uppercase;color:${sk.sub};">${esc(S.scene || "PLATE")} ${K.pad2(i + 1)} ${esc(S.of || "OF")} ${K.pad2(total)}</div>
    <div style="position:absolute;right:${r(M)}cqw;bottom:${r(U(78))}cqw;display:flex;gap:${r(U(8))}cqw;">
      ${sk.chips.map((c, n) => `<span style="width:${r(U(22))}cqw;height:${r(U(22))}cqw;background:${c};${n === 0 ? `outline:${r(U(2))}cqw solid ${sk.ink};outline-offset:${r(U(3))}cqw;` : ""}"></span>`).join("")}
    </div>
    <div style="position:absolute;left:${r(M)}cqw;right:${r(M)}cqw;bottom:${r(U(52))}cqw;height:${r(U(6))}cqw;background:${sk.line};overflow:hidden;">
      <div class="${id}-rail" style="width:100%;height:100%;background:${sk.rail};transform-origin:left center;"></div>
    </div>
  </div>`;
}
// The rule fills across the WHOLE film, so both ends are stated by the tween — never inline, because
// a CSS transform and a GSAP transform on one element apply twice.
const plateHudTweens = (id, ctx) => [
  `tl.fromTo(".${id}-rail",{scaleX:${r(ctx.total ? ctx.i / ctx.total : 0)}},{scaleX:${r(ctx.total ? (ctx.i + 1) / ctx.total : 1)},duration:${r(ctx.L)},ease:"none"},${r(ctx.T)});`,
];

// ---- type -------------------------------------------------------------------
// THE OVERPRINT ON TYPE (rule 2). Each word is one impression: a second-colour pull offset behind
// the ink pull, both inside a wrapper that animates as a unit.
//
// WORDS, NOT CHARACTERS. `textfx.enter: "char-pop"` asks for a per-glyph pop, and per-glyph spans
// detach Indic matras from their base letters — the complex-script shaping defect this codebase has
// already paid for once. A word is the smallest unit that is always safe to split, so the pop is
// per word and reads the same at speed.
function printLines(id, lines, { size, ink, ghost, lh = 0.94, cls = "w", tracking = 0, font, weight = 400 }) {
  return (Array.isArray(lines) ? lines : [lines]).map((line) => `<span style="display:block;font-family:${font};font-weight:${weight};font-size:${r(size)}cqw;line-height:${lh};letter-spacing:${tracking}em;text-transform:uppercase;">${K.wordsOf(line).map((w) => `<span class="${id}-${cls}" style="position:relative;display:inline-block;padding-right:${r(size * 0.24)}cqw;opacity:0;"><span style="position:absolute;left:${r(OFF)}cqw;top:${r(OFF)}cqw;white-space:nowrap;color:${ghost};">${esc(w)}</span><span style="position:relative;white-space:nowrap;color:${ink};">${esc(w)}</span></span>`).join("")}</span>`).join("");
}
const printLineTweens = (id, ctx, at, cls = "w", stag = 0.05) => [
  `tl.fromTo(".${id}-${cls}",{opacity:0,scale:0.74,y:"${r(U(26))}cqw"},{opacity:1,scale:1,y:0,duration:${ctx.du(0.28)},ease:"back.out(2.1)",stagger:${ctx.du(stag)},transformOrigin:"left bottom"},${ctx.at(at)});`,
];

// `textfx.emphasis: "boxed"` — the accent is a printed block behind the word, never a colour on it.
// Double-pulled like everything else, so the stamp mis-registers with the rest of the sheet.
// Every colour is passed in rather than read off a skin: the closing beat inverts all three of them,
// and a stamp that resolved its own would print the flood's colour on the flood.
const stamp = (th, text, size, { fill, fg, ghost }) =>
  `<span style="position:relative;display:inline-block;">
    <span style="position:absolute;inset:0;background:${ghost};translate:${r(OFF)}cqw ${r(OFF)}cqw;"></span>
    <span style="position:relative;display:inline-block;background:${fill};color:${fg};font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:1.08;letter-spacing:0.02em;text-transform:uppercase;padding:${r(size * 0.16)}cqw ${r(size * 0.3)}cqw;">${esc(text)}</span>
  </span>`;

// The one label style in the system: Space Mono, caps, wide.
const label = (th, t, color) =>
  `<span style="font-family:${th.monoStack};font-weight:700;font-size:${r(U(20))}cqw;letter-spacing:0.2em;text-transform:uppercase;color:${color};white-space:nowrap;">${esc(t)}</span>`;

// The heavy press rule. Hard ends, no radius: `surface.flat` is true.
const bar = (cls, sk, { x, y, w, h = U(12) }) =>
  `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;background:${sk.ink};transform-origin:left center;">
    <div style="position:absolute;left:0;right:0;top:${r(h)}cqw;height:${r(h * 0.5)}cqw;background:${sk.second};"></div>
  </div>`;
const barTweens = (cls, ctx, at) => [
  `tl.fromTo(".${cls}",{scaleX:0},{scaleX:1,duration:${ctx.du(0.32)},ease:"expo.out"},${ctx.at(at)});`,
];

// ---- plates -----------------------------------------------------------------
// A PRESS IMPRESSION: the manifest's cover-fit screenshot, inside a hard ink keyline, with its
// caption bar INSIDE the keyline (a caption hung outside forces the whole spread to be re-spaced) and
// a riso wash of one ink over the picture. The wash is a low-alpha fill plus the halftone screen —
// NOT a `filter`, because a per-scene stack of filtered layers is what makes a seeked capture come
// back solid black.
//
// Returns "" without a picture: never draw an empty container.
function impression(cls, th, sk, { x, y, w, h, shot, tint, fig, plate }) {
  if (!shot || !shot.path) return "";
  const bw = r(U(5));
  // The wash keeps the raw ink; the caption SETS that ink as 16px type, so it takes the darkened
  // one — see `skin().ink2`. Yellow at 16px on cream is not a caption, it is a blank line.
  const tintInk = sk.flood ? sk.ink : K.ensureContrast(tint, { dark: false, limit: 0.42 });
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;border:${bw}cqw solid ${sk.ink};background:${sk.bg};display:flex;flex-direction:column;box-sizing:border-box;opacity:0;">
    <div style="flex:1 1 auto;min-height:0;position:relative;overflow:hidden;">
      <div class="${cls}-rv" style="position:absolute;inset:0;clip-path:inset(0 100% 0 0);">
        ${K.shotFill(shot, { bg: sk.bg, w, h })}
        <div style="position:absolute;inset:0;background:${rgba(tint, 0.22)};"></div>
        <div style="position:absolute;inset:0;${halftone(sk.ink, 0.16, 1.4, 8)}"></div>
      </div>
    </div>
    <div class="${cls}-cap" style="flex:0 0 auto;border-top:${bw}cqw solid ${sk.ink};padding:${r(U(8))}cqw ${r(U(14))}cqw;display:flex;justify-content:space-between;align-items:center;font-family:${th.monoStack};font-weight:700;font-size:${r(U(16))}cqw;letter-spacing:0.16em;text-transform:uppercase;color:${sk.ink};opacity:0;">
      <span>${esc(fig)}</span><span style="color:${tintInk};">${esc(plate)}</span>
    </div>
  </div>`;
}
const impressionTweens = (cls, ctx, at) => [
  `tl.to(".${cls}",{opacity:1,duration:${ctx.du(0.08)},ease:"none"},${ctx.at(at)});`,
  `tl.fromTo(".${cls}-rv",{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0% 0 0)",duration:${ctx.du(0.44)},ease:"power2.inOut"},${ctx.at(at)});`,
  `tl.fromTo(".${cls}-cap",{opacity:0,x:"${r(-U(22))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.24)},ease:"power3.out"},${ctx.at(at + 0.24)});`,
];

// The manifest's `how` slot is objectFit:"contain" — an illustration sits INSIDE its plate rather
// than filling it. K has exactly one media helper (shotFill) and it crops, so this one case is
// written out longhand: inset:0 inside a positioned wrapper, so the picture cannot escape the plate.
function containPlate(cls, th, sk, { x, y, w, h, shot, caption }) {
  if (!shot || !shot.path) return "";
  const bw = r(U(5));
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;border:${bw}cqw solid ${sk.ink};background:${sk.bg};box-sizing:border-box;opacity:0;">
    <div class="${cls}-rv" style="position:absolute;inset:0;overflow:hidden;clip-path:inset(0 100% 0 0);">
      <div style="position:absolute;inset:0;${halftone(sk.second, 0.2)}"></div>
      <img src="${esc(shot.path)}" alt="${esc(shot.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;">
    </div>
    <div class="${cls}-cap" style="position:absolute;left:${r(U(-2))}cqw;bottom:${r(U(-2))}cqw;background:${sk.ink};color:${sk.bg};font-family:${th.monoStack};font-weight:700;font-size:${r(U(16))}cqw;letter-spacing:0.16em;text-transform:uppercase;padding:${r(U(7))}cqw ${r(U(14))}cqw;opacity:0;">${esc(caption)}</div>
  </div>`;
}
const containPlateTweens = (cls, ctx, at) => [
  `tl.to(".${cls}",{opacity:1,duration:${ctx.du(0.08)},ease:"none"},${ctx.at(at)});`,
  `tl.fromTo(".${cls}-rv",{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0% 0 0)",duration:${ctx.du(0.4)},ease:"power2.inOut"},${ctx.at(at)});`,
  `tl.fromTo(".${cls}-cap",{opacity:0},{opacity:1,duration:${ctx.du(0.2)},ease:"none"},${ctx.at(at + 0.22)});`,
];

// ---- scenes -----------------------------------------------------------------
// POSTER — the cover plate. Type left, one enormous primary right, a heavy press rule between the
// headline and the copy. It takes NO picture on purpose: the opening beat of a poster pack must be
// the pack's own composition, and a beat that needs nothing can never degrade.
function sPoster(scene, ctx) {
  const { id, th } = ctx;
  const sk = skin(ctx);
  const colW = U(1000);
  const raw = String(scene.headline || scene.title || ctx.title || "").toUpperCase();
  const head = K.fitLines(raw, colW / K.camSafe(), U(126), 3, th.adv);
  const key = K.clampWords(String(scene.emphasis || "").toUpperCase(), 18);
  const body = K.clampWords(String(scene.subtext || "").trim(), 150);

  const kickY = U(228), headY = U(300);
  const headBottom = headY + head.lines.length * head.size * 0.94;
  const ruleY = headBottom + U(36);
  // +U(18) clears the rule's own second-colour underline, which hangs half its height below it.
  const bodyY = ruleY + U(18) + U(52);
  // BODY_W stops at 976, not 1036: the small primary below sits at x=1010, and a measure that ran to
  // the column's full width would print its last line under the shape.
  const BODY_W = U(880);
  const bodyH = body ? bodyRows(body, BODY_W, U(30)) * U(30) * 1.5 : 0;
  const keyY = bodyY + bodyH + U(30);

  return {
    backdrop: sheet(id, th, sk, ctx),
    chrome: plateHud(ctx, sk),
    html: `
    ${printShape(`${id}-sh1`, { x: U(1130), y: U(286), size: U(590), kind: kindOf(ctx.i + 1), ink: sk.ink, ghost: sk.second, tone: sk.bg })}
    ${printShape(`${id}-sh2`, { x: U(1010), y: U(690), size: U(250), kind: kindOf(ctx.i), ink: sk.second, ghost: sk.third, alpha: 0.8, off: U(12) })}
    <div style="position:absolute;left:${r(M)}cqw;top:${r(kickY)}cqw;z-index:4;">
      <span class="${id}-kick" style="display:inline-block;opacity:0;">${label(th, String(scene.kicker || ctx.label || STRINGS.poster).toUpperCase().slice(0, 30), sk.ink2)}</span>
    </div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(headY)}cqw;width:${r(colW)}cqw;z-index:4;">
      ${printLines(id, head.lines, { size: head.size, ink: sk.ink, ghost: sk.second, font: th.displayStack, tracking: 0.005 })}
    </div>
    ${bar(`${id}-bar`, sk, { x: M, y: ruleY, w: U(460) })}
    ${body ? `<div class="${id}-body" style="position:absolute;left:${r(M)}cqw;top:${r(bodyY)}cqw;width:${r(BODY_W)}cqw;font-family:${th.bodyStack};font-weight:500;font-size:${r(U(30))}cqw;line-height:1.5;color:${sk.sub};opacity:0;z-index:4;">${esc(body)}</div>` : ""}
    ${key ? `<div class="${id}-key" style="position:absolute;left:${r(M)}cqw;top:${r(Math.min(keyY, FOOT - U(80)))}cqw;z-index:4;opacity:0;">${stamp(th, key, U(46), { fill: sk.second, fg: K.inkOn(sk.second, INK, CREAM), ghost: sk.ink })}</div>` : ""}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,x:"${r(-U(24))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.22)},ease:"power3.out"},${ctx.at(0.08)});`,
      ...printLineTweens(id, ctx, 0.2),
      ...barTweens(`${id}-bar`, ctx, 0.68),
      ...printShapeTweens(`${id}-sh1`, ctx, 0.14),
      ...printShapeTweens(`${id}-sh2`, ctx, 0.46),
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(22))}cqw"},{opacity:1,y:0,duration:${ctx.du(0.3)},ease:"power3.out"},${ctx.at(0.8)});` : "",
      key ? `tl.fromTo(".${id}-key",{opacity:0,scaleX:0.24},{opacity:1,scaleX:1,duration:${ctx.du(0.3)},ease:"expo.out",transformOrigin:"left center"},${ctx.at(0.94)});` : "",
      ...plateHudTweens(id, ctx),
      ...sheetTweens(id, ctx),
    ].filter(Boolean),
  };
}

// PRESS — the manifest's widest slots (1728x410, cover, screenshots). Two impressions of the same
// run, each washed in a DIFFERENT ink, which is what a two-colour press actually produces. The
// headline is one line so the band starts high; two stacked strips are thinner than the manifest's
// 410px, and that is deliberate — a full-height pair would cover the plate rule and the swatches.
function sPress(scene, ctx, shots) {
  const { id, th } = ctx;
  const sk = skin(ctx);
  const n = Math.min(2, shots.length);
  if (!n) return { ...K.statement(scene, ctx), backdrop: sheet(id, th, sk, ctx), chrome: plateHud(ctx, sk) };
  // ctx.title is the last fallback on purpose: an empty display line would emit a headline block with
  // no words in it — nothing to reveal and nothing to read, which is a ghost beat, not a design.
  const raw = String(scene.headline || scene.title || ctx.title || STRINGS.press).toUpperCase();
  const size = K.fitOne(raw, COL, U(88), th.adv);
  const headY = U(262), gap = U(26);
  const bandTop = headY + size * 0.96 + U(42);
  const h = n === 2 ? (FOOT - bandTop - gap) / 2 : FOOT - bandTop;
  const tints = [sk.second, sk.third];
  return {
    backdrop: sheet(id, th, sk, ctx),
    chrome: plateHud(ctx, sk),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(220))}cqw;z-index:4;">
      <span class="${id}-kick" style="display:inline-block;opacity:0;">${label(th, String(scene.kicker || ctx.label || STRINGS.press).toUpperCase().slice(0, 30), sk.ink2)}</span>
    </div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(headY)}cqw;width:${r(COL)}cqw;z-index:4;">
      ${printLines(id, [raw], { size, ink: sk.ink, ghost: sk.second, font: th.displayStack })}
    </div>
    ${Array.from({ length: n }, (_, i) => impression(`${id}-im${i}`, th, sk, {
      x: M, y: bandTop + i * (h + gap), w: COL, h, shot: shots[i], tint: tints[i % 2],
      fig: `${String(ctx.S.imp || STRINGS.imp)} ${K.pad2(i + 1)}`,
      plate: `${String(ctx.S.ink || STRINGS.ink)} ${["A", "B"][i % 2]}`,
    })).join("")}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,x:"${r(-U(24))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.2)},ease:"power3.out"},${ctx.at(0.06)});`,
      ...printLineTweens(id, ctx, 0.16),
      ...Array.from({ length: n }, (_, i) => impressionTweens(`${id}-im${i}`, ctx, 0.46 + i * 0.2)).flat(),
      ...plateHudTweens(id, ctx),
      ...sheetTweens(id, ctx),
    ],
  };
}

// FIGURES — the only beat that prints figures as figures. Each column is a press column: a keyline,
// an ink swatch cut to a primary, the counted numeral double-pulled, and a mono caption. Nothing is
// invented — every number comes from `numbersIn`, which reads the script.
function sFigures(scene, ctx) {
  const { id, th } = ctx;
  const sk = skin(ctx);
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return { ...K.statement(scene, ctx), backdrop: sheet(id, th, sk, ctx), chrome: plateHud(ctx, sk) };
  const raw = String(scene.headline || scene.title || "").toUpperCase();
  const size = K.fitOne(raw || String(STRINGS.figures), COL, U(80), th.adv);
  const cw = (COL - U(40) * (stats.length - 1)) / stats.length;
  const rowY = U(430);
  return {
    backdrop: sheet(id, th, sk, ctx),
    chrome: plateHud(ctx, sk),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(220))}cqw;z-index:4;">
      <span class="${id}-kick" style="display:inline-block;opacity:0;">${label(th, String(scene.kicker || ctx.label || STRINGS.figures).toUpperCase().slice(0, 30), sk.ink2)}</span>
    </div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(262))}cqw;width:${r(COL)}cqw;z-index:4;">
      ${printLines(id, [raw || String(STRINGS.figures)], { size, ink: sk.ink, ghost: sk.second, font: th.displayStack })}
    </div>
    ${stats.map((st, i) => {
      const numSize = K.fitOne(`${st.v}${st.suffix}`, cw - U(30), U(180), th.adv);
      const chip = kindOf(ctx.i + i);
      return `<div class="${id}-fig" style="position:absolute;left:${r(M + i * (cw + U(40)))}cqw;top:${r(rowY)}cqw;width:${r(cw)}cqw;z-index:4;opacity:0;">
        <div style="height:${r(U(7))}cqw;background:${sk.ink};"></div>
        <div style="position:relative;width:${r(U(62))}cqw;height:${r(U(62))}cqw;margin-top:${r(U(26))}cqw;">
          <div style="position:absolute;inset:0;background:${sk.second};${SHAPES[chip]}translate:${r(U(7))}cqw ${r(U(7))}cqw;"></div>
          <div style="position:absolute;inset:0;background:${sk.ink};${SHAPES[chip]}"></div>
        </div>
        <div style="margin-top:${r(U(28))}cqw;position:relative;display:inline-block;font-family:${th.displayStack};font-size:${r(numSize)}cqw;line-height:0.94;white-space:nowrap;">
          <span style="position:absolute;left:${r(OFF)}cqw;top:${r(OFF)}cqw;white-space:nowrap;color:${sk.second};"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</span>
          <span style="position:relative;white-space:nowrap;color:${sk.ink};"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</span>
        </div>
        <div style="margin-top:${r(U(24))}cqw;">${label(th, K.statLabel(scene, i) || String(STRINGS.figures), sk.sub)}</div>
      </div>`;
    }).join("")}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,x:"${r(-U(24))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.2)},ease:"power3.out"},${ctx.at(0.06)});`,
      ...printLineTweens(id, ctx, 0.16),
      `tl.fromTo(".${id}-fig",{opacity:0,y:"${r(U(46))}cqw"},{opacity:1,y:0,duration:${ctx.du(0.3)},ease:"expo.out",stagger:${ctx.du(0.14)}},${ctx.at(0.44)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        // BOTH pulls carry the counter, so querySelectorAll — with querySelector the second
        // impression would keep an unrounded float and stick out past the ink one.
        return [`tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${ctx.du(0.5)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelectorAll(".${id}-n${i}");for(var q=0;q<e.length;q++)e[q].textContent=Number(e[q].textContent).toFixed(${dp});}},${ctx.at(0.54 + i * 0.14)});`];
      }),
      ...plateHudTweens(id, ctx),
      ...sheetTweens(id, ctx),
    ],
  };
}

// METHOD — the numbered sequence. Each step is a primary shape with its number knocked out of it,
// then the step set in display caps. The manifest's `how` illustration (998x367, contain) prints as
// a plate beneath; without one the rows spread into the room it would have taken, so the sheet is
// never half-empty.
function sMethod(scene, ctx, shots) {
  const { id, th } = ctx;
  const sk = skin(ctx);
  const steps = K.bullets(scene, 3).map((b) => String(b).toUpperCase().slice(0, 40));
  if (steps.length < 2) return { ...K.statement(scene, ctx), backdrop: sheet(id, th, sk, ctx), chrome: plateHud(ctx, sk) };
  const shot = shots[0] || null;
  const raw = String(scene.headline || STRINGS.method).toUpperCase();
  const size = K.fitOne(raw, COL, U(80), th.adv);
  const rowsTop = U(410), rowsEnd = shot ? U(716) : FOOT;
  const rowH = Math.min(U(160), (rowsEnd - rowsTop) / steps.length);
  const shapeSize = Math.min(U(92), rowH * 0.62);
  const stepSize = K.fitOne(steps.reduce((a, b) => (a.length >= b.length ? a : b), ""), COL - shapeSize - U(60), U(56), th.adv);
  return {
    backdrop: sheet(id, th, sk, ctx),
    chrome: plateHud(ctx, sk),
    html: `
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(220))}cqw;z-index:4;">
      <span class="${id}-kick" style="display:inline-block;opacity:0;">${label(th, String(scene.kicker || ctx.label || STRINGS.method).toUpperCase().slice(0, 30), sk.ink2)}</span>
    </div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(U(262))}cqw;width:${r(COL)}cqw;z-index:4;">
      ${printLines(id, [raw], { size, ink: sk.ink, ghost: sk.second, font: th.displayStack })}
    </div>
    ${steps.map((s, i) => `<div class="${id}-row" style="position:absolute;left:${r(M)}cqw;top:${r(rowsTop + i * rowH)}cqw;width:${r(COL)}cqw;display:flex;align-items:center;gap:${r(U(30))}cqw;z-index:4;opacity:0;">
      ${numShape(`${id}-ns${i}`, th, sk, { size: shapeSize, kind: kindOf(ctx.i + i), n: K.pad2(i + 1) })}
      <span style="font-family:${th.displayStack};font-size:${r(stepSize)}cqw;line-height:1.04;text-transform:uppercase;color:${sk.ink};">${esc(s)}</span>
    </div>`).join("")}
    ${shot ? containPlate(`${id}-ill`, th, sk, { x: M, y: U(744), w: COL, h: U(206), shot, caption: `${String(ctx.S.step || STRINGS.step)} ${K.pad2(steps.length)}` }) : ""}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,x:"${r(-U(24))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.2)},ease:"power3.out"},${ctx.at(0.06)});`,
      ...printLineTweens(id, ctx, 0.16),
      `tl.fromTo(".${id}-row",{opacity:0,x:"${r(-U(44))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.26)},ease:"expo.out",stagger:${ctx.du(0.14)}},${ctx.at(0.42)});`,
      ...steps.flatMap((_, i) => numShapeTweens(`${id}-ns${i}`, ctx, 0.48 + i * 0.14)),
      ...(shot ? containPlateTweens(`${id}-ill`, ctx, 0.86) : []),
      ...plateHudTweens(id, ctx),
      ...sheetTweens(id, ctx),
    ],
  };
}

// MARK — the pack's signature beat and its safety net: one enormous primary, printed twice and
// screened, with the beat's line of copy set beside it. It needs nothing but a sentence, so an
// asset-poor film still shows the design instead of falling through to the kit's statement.
// The manifest's `context` slot (826x162, cover, product images) prints as a strip under the copy
// when one is available; without it, the mark carries the sheet.
function sMark(scene, ctx, shots) {
  const { id, th } = ctx;
  const sk = skin(ctx);
  const shot = shots[0] || null;
  const q = String(scene.quote || scene.headline || scene.subtext || scene.title || ctx.title || "").trim();
  const copy = K.clampWords(q.toUpperCase(), 170);
  const by = K.clampWords(String(scene.attribution || scene.emphasis || "").trim(), 44);
  // MIRRORED ON ALTERNATE BEATS. `mark` is the fallback role, so an asset-poor film can land on it
  // three or four times; a fixed mark-left/copy-right composition repeated that often reads as a
  // stuck render. The flip is measured, not guessed: the mark plus its 18px overprint offset has to
  // clear the copy measure on BOTH arrangements, which is why the two column widths differ.
  const flip = ctx.i % 2 === 1;
  const markX = flip ? U(1120) : M;
  const colX = flip ? M : U(760);
  const colW = flip ? U(940) : U(1064);
  const fit = K.fitLines(copy, colW / K.camSafe(), U(60), 4, th.adv);
  const copyY = U(330);
  const copyBottom = copyY + fit.lines.length * fit.size * 1.16;
  const byY = copyBottom + U(34);
  // 826x162 is the manifest's own ratio (5.1:1), so the strip's height follows from its width.
  const stripH = colW / (826 / 162);
  const stripY = Math.min(Math.max(byY + (by ? U(70) : U(30)), U(660)), FOOT - stripH);
  return {
    backdrop: sheet(id, th, sk, ctx),
    chrome: plateHud(ctx, sk),
    html: `
    ${printShape(`${id}-mk`, { x: markX, y: U(268), size: U(560), kind: kindOf(ctx.i + 2), ink: sk.ink, ghost: sk.second, tone: sk.bg })}
    <div style="position:absolute;left:${r(colX)}cqw;top:${r(U(268))}cqw;z-index:4;">
      <span class="${id}-kick" style="display:inline-block;opacity:0;">${label(th, String(scene.kicker || ctx.label || STRINGS.mark).toUpperCase().slice(0, 30), sk.ink2)}</span>
    </div>
    <div style="position:absolute;left:${r(colX)}cqw;top:${r(copyY)}cqw;width:${r(colW)}cqw;z-index:4;">
      ${printLines(id, fit.lines, { size: fit.size, ink: sk.ink, ghost: sk.second, lh: 1.16, font: th.displayStack })}
    </div>
    ${by ? `<div class="${id}-by" style="position:absolute;left:${r(colX)}cqw;top:${r(byY)}cqw;z-index:4;opacity:0;">${label(th, by.toUpperCase(), sk.sub)}</div>` : ""}
    ${shot ? impression(`${id}-cx`, th, sk, {
      x: colX, y: stripY, w: colW, h: stripH, shot, tint: sk.third,
      fig: `${String(ctx.S.imp || STRINGS.imp)} ${K.pad2(ctx.i + 1)}`,
      plate: `${String(ctx.S.ink || STRINGS.ink)} C`,
    }) : ""}`,
    s: [
      `tl.fromTo(".${id}-kick",{opacity:0,x:"${r(-U(24))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.2)},ease:"power3.out"},${ctx.at(0.08)});`,
      ...printShapeTweens(`${id}-mk`, ctx, 0.1),
      ...printLineTweens(id, ctx, 0.24, "w", 0.045),
      by ? `tl.fromTo(".${id}-by",{opacity:0,y:"${r(U(16))}cqw"},{opacity:1,y:0,duration:${ctx.du(0.22)},ease:"power3.out"},${ctx.at(0.76)});` : "",
      ...(shot ? impressionTweens(`${id}-cx`, ctx, 0.6) : []),
      ...plateHudTweens(id, ctx),
      ...sheetTweens(id, ctx),
    ].filter(Boolean),
  };
}

// COLOPHON — the flooded back page. The beat's ink takes the WHOLE sheet and the type reverses to
// whatever clears it, and `fx.canvas: "confetti"` becomes paper chips off the guillotine. The chip
// geometry is computed once at module load from a fixed arithmetic seed, so the close is identical
// every run.
//
// NOT ONE HARDCODED CREAM IN HERE. Which ink floods depends on the beat index, and one of the three
// is yellow: cream reversed out of yellow is unreadable. Every reversed colour comes from `sk.ink`,
// which `skin(ctx, true)` resolves against the flood it is actually printing on.
const CHIPS = Array.from({ length: 28 }, (_, i) => {
  const s = i * 57.3;
  return { x: (s * 1.7) % 96, top: -10 + ((s * 0.11) % 1) * 118, dur: 1.6 * (1 - ((s * 0.11) % 1)) + 0.5, hue: i % 3, kind: i % 2 };
});
function sColophon(scene, ctx, logo) {
  const { id, th } = ctx;
  const sk = skin(ctx, true);
  const raw = String(scene.headline || scene.emphasis || ctx.title || "").toUpperCase();
  const head = K.fitLines(raw, U(1500) / K.camSafe(), U(140), 2, th.adv);
  const action = K.clampWords(String(scene.emphasis || "").toUpperCase(), 24) || String(ctx.S.go || STRINGS.go);
  const hasMark = !!(logo && logo.path);
  const chipCols = [sk.ink, sk.second, rgba(sk.ink, 0.6)];

  const logoY = U(226), logoS = U(116);
  const kickY = hasMark ? logoY + logoS + U(34) : U(280);
  const headY = kickY + U(50);
  const headBottom = headY + head.lines.length * head.size * 0.96;
  const actY = headBottom + U(46);
  const urlY = actY + U(96);

  return {
    // THE FLOOD. The accent is the paper here — the one beat where this pack lets an ink off its
    // block — with the halftone still screened over it so the sheet never reads as flat digital fill.
    backdrop: `<div style="position:absolute;inset:0;background:${sk.bg};overflow:hidden;">
      <div class="${id}-tone" style="position:absolute;inset:${r(-U(20))}cqw;${halftone(sk.ink, 0.14)}"></div>
      <div class="${id}-an1" style="position:absolute;left:${r(U(1180))}cqw;top:${r(U(340))}cqw;width:${r(U(760))}cqw;height:${r(U(760))}cqw;">
        <div class="${id}-an1r" style="position:absolute;inset:0;background:${rgba(sk.ink, 0.16)};${SHAPES[kindOf(ctx.i)]}"></div>
      </div>
      <div class="${id}-an2" style="position:absolute;left:${r(U(-200))}cqw;top:${r(U(-220))}cqw;width:${r(U(700))}cqw;height:${r(U(700))}cqw;">
        <div class="${id}-an2r" style="position:absolute;inset:0;background:${rgba(sk.second, 0.3)};${SHAPES[kindOf(ctx.i + 2)]}"></div>
      </div>
      ${K.regMarks(th, { cls: id, pts: [[46, 46], [1874, 46], [46, 1034], [1874, 1034]], color: sk.ink, arm: 16, ring: 9 })}
      <div class="${id}-conf" style="position:absolute;inset:0;overflow:hidden;opacity:0;">
        ${CHIPS.map((c, i) => `<div class="${id}-ch${i}" style="position:absolute;left:${r(c.x)}%;top:${r((c.top / 100) * VH)}cqw;width:${r(U(c.kind ? 18 : 26))}cqw;height:${r(U(c.kind ? 26 : 18))}cqw;background:${chipCols[c.hue]};"></div>`).join("")}
      </div>
      ${pressBar(id, sk)}
    </div>`,
    // The chrome reads against the FLOOD, not against the film theme: cream furniture on the ink.
    chrome: plateHud(ctx, sk),
    html: `
    ${hasMark ? `<div class="${id}-logo" style="position:absolute;left:${r(M)}cqw;top:${r(logoY)}cqw;width:${r(logoS)}cqw;height:${r(logoS)}cqw;background:${sk.ink};display:flex;align-items:center;justify-content:center;padding:${r(U(16))}cqw;box-sizing:border-box;z-index:4;opacity:0;"><img src="${esc(logo.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
    <div style="position:absolute;left:${r(M)}cqw;top:${r(kickY)}cqw;z-index:4;">
      <span class="${id}-kick" style="display:inline-block;opacity:0;">${label(th, String(scene.kicker || ctx.label || STRINGS.colophon).toUpperCase().slice(0, 30), sk.sub)}</span>
    </div>
    <div style="position:absolute;left:${r(M)}cqw;top:${r(headY)}cqw;width:${r(U(1500))}cqw;z-index:4;">
      ${printLines(id, head.lines, { size: head.size, ink: sk.ink, ghost: sk.second, font: th.displayStack, tracking: 0.005 })}
    </div>
    <div class="${id}-act" style="position:absolute;left:${r(M)}cqw;top:${r(actY)}cqw;z-index:4;opacity:0;">${stamp(th, action, U(52), { fill: sk.ink, fg: sk.bg, ghost: sk.second })}</div>
    <div class="${id}-url" style="position:absolute;left:${r(M)}cqw;top:${r(Math.min(urlY, FOOT - U(30)))}cqw;z-index:4;opacity:0;">${label(th, String(ctx.url).toUpperCase(), sk.sub)}</div>`,
    s: [
      hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${ctx.du(0.26)},ease:"back.out(1.8)",transformOrigin:"center center"},${ctx.at(0.08)});` : "",
      `tl.fromTo(".${id}-kick",{opacity:0,x:"${r(-U(24))}cqw"},{opacity:1,x:0,duration:${ctx.du(0.2)},ease:"power3.out"},${ctx.at(0.18)});`,
      ...printLineTweens(id, ctx, 0.26),
      `tl.fromTo(".${id}-act",{opacity:0,scaleX:0.24},{opacity:1,scaleX:1,duration:${ctx.du(0.3)},ease:"expo.out",transformOrigin:"left center"},${ctx.at(0.66)});`,
      `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:${ctx.du(0.2)},ease:"none"},${ctx.at(0.82)});`,
      `tl.to(".${id}-conf",{opacity:1,duration:${ctx.du(0.1)},ease:"none"},${ctx.at(0.5)});`,
      // The chips fall on the ground layer, so they pass behind the type — a chip over a call to
      // action is litter, not confetti.
      ...CHIPS.map((c, i) => `tl.to(".${id}-ch${i}",{y:"${r((118 / 100) * VH)}cqw",rotation:${r(190 * c.dur)},duration:${r(c.dur)},ease:"none",repeat:${K.reps(ctx.L, c.dur)}},${ctx.at(0.5)});`),
      `tl.fromTo(".${id}-tone",{x:0,y:0},{x:"${r(U(9))}cqw",y:"${r(U(9))}cqw",duration:6,ease:"none",repeat:${K.reps(ctx.L, 6)}},${r(ctx.T)});`,
      `tl.to(".${id}-an1",{x:"${r(-U(34))}cqw",y:"${r(U(22))}cqw",duration:${r(Math.max(9, ctx.L * 2.6))},ease:"sine.inOut",repeat:${K.reps(ctx.L, Math.max(9, ctx.L * 2.6))},yoyo:true},${r(ctx.T)});`,
      `tl.fromTo(".${id}-an1r",{rotation:-4},{rotation:4,duration:${r(Math.max(9, ctx.L * 2.6))},ease:"sine.inOut",repeat:${K.reps(ctx.L, Math.max(9, ctx.L * 2.6))},yoyo:true},${r(ctx.T)});`,
      `tl.to(".${id}-an2",{x:"${r(U(30))}cqw",y:"${r(-U(20))}cqw",duration:${r(Math.max(8, ctx.L * 2.1))},ease:"sine.inOut",repeat:${K.reps(ctx.L, Math.max(8, ctx.L * 2.1))},yoyo:true},${r(ctx.T)});`,
      `tl.fromTo(".${id}-an2r",{rotation:5},{rotation:-5,duration:${r(Math.max(8, ctx.L * 2.1))},ease:"sine.inOut",repeat:${K.reps(ctx.L, Math.max(8, ctx.L * 2.1))},yoyo:true},${r(ctx.T)});`,
      ...K.regMarkTweens(ctx, { cls: id }),
      ...pressBarTweens(id, ctx),
      ...plateHudTweens(id, ctx),
    ].filter(Boolean),
  };
}

// ---- spine ------------------------------------------------------------------
const SPEC = {
  first: "poster", last: "colophon",
  // `mark` sits last in the rotation but returns true from `carry`, so it is the fallback the middle
  // beats land on — the pack's own geometry rather than the kit's statement.
  middle: ["press", "figures", "method", "mark"],
  shapes: {
    // Straight off the manifest's media.slotsByRole: feature/proof 1728x410, how 998x367,
    // context 826x162.
    poster: [], press: [1728 / 410, 1728 / 410], method: [998 / 367], mark: [826 / 162],
    figures: [], colophon: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "press" ? Math.min(2, Math.max(0, budget))
    : role === "method" || role === "mark" ? Math.min(1, Math.max(0, budget)) : 0),
  needs: (role) => (role === "press" ? 1 : 0),
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "figures") return isStats;
    if (isStats) return false;                        // only `figures` prints figures as figures
    if (role === "press") return budget >= 1;
    if (role === "method") return K.bullets(scene, 3).length >= 2;
    return true;                                      // `mark` needs one sentence and nothing else
  },
};
const BUILDERS = {
  poster: sPoster, press: sPress, figures: sFigures, method: sMethod, mark: sMark, colophon: sColophon,
  // Both statement layouts get the pack's sheet AND the pack's chrome — the kit's HUD would paint
  // from the film theme and print the wrong ink pair on these beats.
  statement: (sc, ctx) => ({
    ...K.statement(sc, ctx),
    backdrop: sheet(ctx.id, ctx.th, skin(ctx), ctx), chrome: plateHud(ctx, skin(ctx)),
  }),
  "statement-c": (sc, ctx) => ({
    ...K.statement(sc, ctx, { centred: true }),
    backdrop: sheet(ctx.id, ctx.th, skin(ctx), ctx), chrome: plateHud(ctx, skin(ctx)),
  }),
};
const LABELS = {
  poster: STRINGS.poster, press: STRINGS.press, figures: STRINGS.figures,
  method: STRINGS.method, mark: STRINGS.mark, colophon: STRINGS.colophon,
};

// Hard corners on the caption pill: nothing in this pack has a radius except a printed circle.
const css = (th, stage) => K.baseCss(th, stage, `
  #cap-pill { border-radius:0; border:${r(U(3))}cqw solid ${INK}; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.2,
    // `motion.drift: 1.02` from the manifest — the smallest drift in the library, because a printed
    // sheet does not float. The push is a press feed, not a lunge.
    camera: { push: 130, scale: 1.02 },
    signature: "editorial", fallbackBrand: "BAUHAUS",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE };
