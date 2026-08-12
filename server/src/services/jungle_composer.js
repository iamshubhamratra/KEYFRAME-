// JUNGLE — a rainforest expedition. Native GSAP + DOM/SVG, built on om_port_kit.
//
// PROVENANCE. A scene-for-scene port of the Claude Design reference
// `old-templete/all-template-handoffs/Jungle/src/jungle-film.jsx` (1920x1080, 6 scenes,
// Enter / Discover / Trek / Sightings / Census / Join, transition="cut"). Its layout, geometry,
// type scale, colour, chrome and cast are reproduced; none of its copy is.
//
// WHAT THIS REBUILD FIXED (10 Aug 2026), and why each mattered:
//
//   THE BRAND NAME WAS INVISIBLE IN EVERY FRAME. The pack supplied no `chrome`, so the kit's
//   default HUD rendered — brand, label and scene counter in `th.ink` (#12301E) at y=46 — directly
//   on the solid #0E2C1B canopy band the backdrop paints across the top 150px. 1.00:1. The
//   reference solves it by never putting bare type on the canopy: its masthead is a CREAM PILL
//   (jungle-film.jsx:190-193). That pill is now `chrome()` and every builder returns it.
//
//   THE MEDIA FURNITURE WAS INVENTED. The README's one-line description of this template is
//   "Screenshots on wooden signboards"; the port drew a rounded "leaf card" with a peg instead, and
//   the phone beat had no phone. SignBoard (163-171) and Phone (172-179) are ported here, and Trek
//   is a phone beat again.
//
//   THE STICKER LANGUAGE WAS REPLACED WITH SOFT UI. Every surface in the reference is a cartoon
//   sticker: cream fill, a 2-4px SOLID INK keyline, and a hard ZERO-BLUR offset shadow — `0 5px 0`
//   on chips and the masthead, `0 8px 0` on the CTA and the logo disc, `0 10px 0` on the tallies —
//   with `text-shadow: 0 4px 0 ink` on paper headlines. That flat offset IS the template's graphic
//   voice; a soft `0 18px 44px` blur turns a picture book into a generic light-theme deck.
//
//   THE TYPE WAS SET AT ROUGHLY HALF STRENGTH. Enter's brand is 220px in the reference and was
//   capped at 140; the close 140 vs 114, Census 92 vs 76, Trek 88 vs 74. Line-height was 1.06-1.10
//   against the reference's 0.90-0.98. Those are CEILINGS here, not constants — K.fitOne / K.fitLines
//   still measure real AI copy — but the ceiling is what the frame is about.
//
//   A THIRD TYPEFACE. JetBrains Mono carried the badge, the stat labels and the url. The reference
//   has exactly two families and no monospace: Chewy for display, Nunito 700/800/900 for every
//   piece of secondary type, tracked when it is small and uppercase. `MONO` is therefore Nunito,
//   which also moves the kit's own helpers (statement's eyebrow, the caption) off the mono voice.
//
// FONT SUBSTITUTION: none — the reference's Chewy + Nunito are both bundled (src/fonts/pack_fonts.js).
// ─────────────────────────────────────────────────────────────────────────────────────

const K = require("./om_port_kit");
const F = require("./jungle_furniture");
const { r, esc, rgba } = K;

const STAGE = K.stageOf(1920, 1080);
const { U } = STAGE;

// The reference ThemeContext (jungle-film.jsx:346-350), verbatim.
const SKY_A = "#DFF3D0", SKY_B = "#B7E39A";
const C1 = "#2E6B3E", C2 = "#245A34", C3 = "#173F26", C4 = "#0E2C1B";
const INK = "#12301E", PAPER = "#FCF7E9", WOOD = "#8A5A2B", WOOD_DK = "#6E4620", ACCENT = "#F4A100";
// WORLD COLOUR, NOT BRAND COLOUR. The reference's tweak panel changes `accent` and nothing else:
// `pop` and `leaf` are pinned in JungleFilm's theme, so a rebranded film still has a coral
// butterfly and a green FIELD GUIDE pill. A wing colour is a fact about the insect and foliage is
// green; deriving them from the customer's brand produced a blue butterfly under a blue brand.
const POP = "#FF5A5F", LEAF = "#3E8E4F";
const DISPLAY = "Chewy", BODY = "Nunito";
// There is no monospace in this template. Nunito occupies the kit's `monoStack` slot so that the
// helpers which reach for it — K.statement's eyebrow, #cap-text — speak the pack's own voice.
const MONO = BODY;

const STRINGS = {
  enter: "EXPEDITION", discover: "DISCOVER", trek: "ON THE TRAIL",
  sightings: "SIGHTINGS", census: "THE CENSUS", go: "JOIN US", field: "FIELD NOTES",
  guide: "FIELD GUIDE", cta: "START EXPLORING",
};

function theme(brandSkin) {
  const { accent, resolvedBrand } = K.resolveAccent(brandSkin, { ground: PAPER, isDark: false, packAccent: ACCENT });
  return {
    accent, bg: SKY_A, paper: PAPER, panel: PAPER, ink: INK, sub: "#4A6B52", line: rgba(INK, 0.16),
    c1: C1, c2: C2, c3: C3, c4: C4, wood: WOOD, woodDk: WOOD_DK,
    pop: POP, leaf: LEAF,
    adv: K.ADVANCE.mixed,
    capBg: PAPER, capInk: INK,
    ...K.fontStacks(DISPLAY, MONO, `'${BODY}', system-ui, sans-serif`, [BODY]),
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    resolvedBrand,
  };
}

// ---- the sticker vocabulary --------------------------------------------------
// A hard offset shadow with ZERO blur, which is what makes Chewy read as hand-painted signage
// rather than as a soft UI card. Reference: chips and masthead `0 5px 0`, CTA and logo `0 8px 0`,
// stat tallies `0 10px 0`, all at 25-35% ink.
const drop = (px, a = 0.25) => `0 ${r(U(px))}cqw 0 ${rgba(INK, a)}`;
// WHICH INK GOES ON THE ACCENT, MEASURED. `K.inkOn` pivots at 0.5 relative luminance, which puts
// WHITE on this pack's marigold (relLum 0.44) at 1.9:1 — and the reference's own `inkOn` (0.55
// pivot) does the same. On a template whose defining defect was type nobody could read, the pill
// text is picked by comparing the two contrast RATIOS instead, so marigold takes ink at 7.0:1 and a
// dark rebrand still takes cream.
const ratioOn = (a, b) => {
  const [x, y] = [K.relLum(a) + 0.05, K.relLum(b) + 0.05];
  return x > y ? x / y : y / x;
};
const onAccent = (accent) => (ratioOn(accent, INK) >= ratioOn(accent, PAPER) ? INK : PAPER);
// Paper headlines over the jungle carry a hard ink shadow — the reference's `0 4px 0 ink` — which
// is both the look and the only reason cream type survives a pale sky behind it.
const headShadow = (px = 4) => `text-shadow:0 ${r(U(px))}cqw 0 ${INK};`;
const bodyShadow = `text-shadow:0 ${r(U(1))}cqw ${r(U(3))}cqw ${rgba(INK, 0.8)};`;

// ---- chrome ------------------------------------------------------------------
// The reference's leaf and paw are EMOJI (🌿 / 🐾). A display face without those glyphs renders a
// tofu box, so both are drawn as SVG — the same call reel makes for its chevron. The leaf is the
// pack's own Leaf path (jungle-film.jsx:46), so the mark in the masthead is literally a leaf from
// this jungle.
const LEAF_MARK = (fill) =>
  `<svg viewBox="0 -34 92 68" style="width:62%;height:62%;display:block;overflow:visible;" aria-hidden="true"><path d="M0 0 Q 40 -34 92 0 Q 40 34 0 0 Z" fill="${fill}"></path><path d="M6 0 Q 46 0 86 0" stroke="${rgba("#000000", 0.22)}" stroke-width="4" fill="none"></path></svg>`;
const PAW_MARK = (fill) =>
  `<svg viewBox="0 0 32 32" style="width:${r(U(30))}cqw;height:${r(U(30))}cqw;display:block;flex:0 0 auto;" aria-hidden="true"><ellipse cx="16" cy="22" rx="9.5" ry="7.5" fill="${fill}"></ellipse><circle cx="6.5" cy="13" r="3.6" fill="${fill}"></circle><circle cx="13" cy="8" r="4" fill="${fill}"></circle><circle cx="21" cy="8" r="4" fill="${fill}"></circle><circle cx="27" cy="13.5" r="3.6" fill="${fill}"></circle></svg>`;

// THE MASTHEAD (jungle-film.jsx:186-197). A cream pill at top 40 / left 56 — paper ground, 3px ink
// keyline, `0 5px 0` hard shadow, a 30px accent disc carrying the leaf, the brand in Chewy at 24px —
// so ink-coloured brand type always sits on cream and never on the canopy band. The reference draws
// NO scene counter and NO progress rule, so neither is carried here; returning `chrome` from every
// builder is also what suppresses the kit's own (and its progress tween with it).
//
// ONE DELIBERATE DIVERGENCE, and it is the defect this rebuild exists for: the reference sets its
// right-hand label in `theme.ink` at top 48, which is inside its own #0E2C1B canopy band — 1.05:1,
// invisible, the same failure as our HUD had. Cream is what the reference itself uses for every
// other piece of type that sits on the jungle rather than on a card, so the label takes cream.
function chrome(th, brand, label) {
  return `<div class="om-chrome">
    <div style="position:absolute;top:${r(U(40))}cqw;left:${r(U(56))}cqw;display:flex;align-items:center;gap:${r(U(12))}cqw;padding:${r(U(8))}cqw ${r(U(16))}cqw ${r(U(8))}cqw ${r(U(10))}cqw;background:${th.paper};border-radius:${r(U(999))}cqw;border:${r(U(3))}cqw solid ${th.ink};box-shadow:${drop(5)};">
      <span style="width:${r(U(30))}cqw;height:${r(U(30))}cqw;border-radius:50%;background:${th.accent};display:grid;place-items:center;flex:0 0 auto;">${LEAF_MARK(onAccent(th.accent))}</span>
      <span style="font-family:${th.displayStack};font-size:${r(U(24))}cqw;color:${th.ink};white-space:nowrap;">${esc(String(brand).toUpperCase())}</span>
    </div>
    ${label ? `<div style="position:absolute;top:${r(U(48))}cqw;right:${r(U(56))}cqw;font-family:${th.bodyStack};font-weight:800;font-size:${r(U(14))}cqw;letter-spacing:0.16em;text-transform:uppercase;color:${th.paper};${bodyShadow}white-space:nowrap;">${esc(label)}</div>` : ""}
  </div>`;
}

// ---- the world ---------------------------------------------------------------
// ONE GROUP, AS THE REFERENCE HAS IT. Frame (jungle-film.jsx:202-210) puts JungleBG and the scene's
// children inside a single `jcam` div, so a monkey hanging in the canopy keeps its position
// relative to the trees and vines for the whole beat. Returning the canopy as the kit's `backdrop`
// put it in `.om-bg` while the cast rode `.om-drift`, and those two layers drift at different rates
// in opposite directions — the animals slid about 1% of the frame away from their own perches over
// a beat. The canopy is therefore part of `html`, at z-index 0, and `backdrop` is empty.
const canopy = (id, th) => `<div style="position:absolute;inset:0;z-index:0;">${F.jungleBg({ ...th, skyA: th.bg, skyB: SKY_B }, { cls: id })}</div>`;
const canopyTweens = (id, ctx, drift) => F.jungleTweens(ctx, { cls: id, drift });

// THE CAST, at the reference's own coordinates (jungle-film.jsx:221-223, 240, 261, 302, 327). Enter
// and Join carry all three animals; Discover gets the toucan, Trek the tiger, Census the toucan and
// the monkey. Sightings is the only beat the reference leaves to the screenshots alone.
//
// The two coordinates the previous port had to move (an Enter toucan behind its leaf card, a Join
// toucan behind a full-width cream slab) are back where the reference puts them: both collisions
// were symptoms of layouts this rebuild replaced, not independent choices.
const CAST = {
  enter: [
    { kind: "monkey", x: 340, y: 150, s: 1.2 },
    { kind: "toucan", x: 1520, y: 330, s: 1.15, phase: 1 },
    { kind: "tiger", x: 1360, y: 860, s: 1.0, facing: -1, phase: 2 },
  ],
  discover: [{ kind: "toucan", x: 900, y: 150, s: 0.92 }],
  trek: [{ kind: "tiger", x: 1500, y: 900, s: 0.85, facing: -1 }],
  census: [
    { kind: "toucan", x: 1540, y: 330, s: 1.0 },
    { kind: "monkey", x: 1360, y: 200, s: 0.8, phase: 1.5 },
  ],
  comealong: [
    { kind: "monkey", x: 300, y: 160, s: 1.1 },
    { kind: "toucan", x: 1540, y: 300, s: 1.05, phase: 1 },
    { kind: "tiger", x: 1440, y: 880, s: 0.9, facing: -1, phase: 2 },
  ],
  // The pictureless beats are not in the reference, so their cast is placed against THEIR copy
  // column: right-hand animals for the left-aligned clearing, and edge animals for the centred one.
  statement: [
    { kind: "toucan", x: 1540, y: 330, s: 1.0 },
    { kind: "tiger", x: 1400, y: 880, s: 0.9, facing: -1, phase: 2 },
  ],
  "statement-c": [
    { kind: "monkey", x: 230, y: 150, s: 1.0 },
    { kind: "tiger", x: 1440, y: 940, s: 0.85, facing: -1, phase: 1.4 },
  ],
};
// Drawn in ONE svg in the authored 1920x1080 space at z-index 2 — the layer the reference uses
// (`<Scene style={{zIndex:2}}>`) — so the animals read in front of the canopy and behind the copy.
function cast(id, th, role) {
  const list = CAST[role];
  if (!list || !list.length) return "";
  return `<svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;overflow:visible;">${F.castHtml(id, th, list)}</svg>`;
}
const castTweens = (id, ctx, role) => F.castTweens(ctx, id, CAST[role] || []);

// ---- product mounts ----------------------------------------------------------
// SIGNBOARD (jungle-film.jsx:163-171) — the hero media frame the README names: 20px radius, 14px
// padding, a wood-to-woodDk gradient, a 4px woodDk border, a 5px white-14% plank highlight, three
// 10px screw discs across the top and a 12px-radius paper well. Fills whatever box it is given, so
// the beat owns the geometry and the frame owns the carpentry.
function signBoard(th, inner) {
  const screw = (pos) => `<span style="position:absolute;top:${r(U(14))}cqw;${pos};width:${r(U(10))}cqw;height:${r(U(10))}cqw;border-radius:50%;background:${th.woodDk};box-shadow:inset 0 0 ${r(U(3))}cqw ${rgba("#000000", 0.5)};"></span>`;
  return `<div style="position:absolute;inset:0;box-sizing:border-box;border-radius:${r(U(20))}cqw;padding:${r(U(14))}cqw;background:linear-gradient(${th.wood}, ${th.woodDk});border:${r(U(4))}cqw solid ${th.woodDk};box-shadow:0 ${r(U(30))}cqw ${r(U(60))}cqw ${rgba("#08160E", 0.5)};">
    <div style="position:absolute;top:${r(U(8))}cqw;left:${r(U(16))}cqw;right:${r(U(16))}cqw;height:${r(U(5))}cqw;border-radius:${r(U(5))}cqw;background:${rgba("#FFFFFF", 0.14)};"></div>
    ${screw(`left:${r(U(18))}cqw`)}${screw("left:50%")}${screw(`right:${r(U(26))}cqw`)}
    <div style="position:relative;width:100%;height:100%;border-radius:${r(U(12))}cqw;overflow:hidden;background:${th.paper};">${inner}</div>
  </div>`;
}
// PHONE (172-179) — 44px radius, 12px padding, ink body, a 90x22 notch pinned to the top centre and
// a 33px-radius screen. The only portrait media mount in the template; it was missing entirely.
function phoneShell(th, inner) {
  return `<div style="position:absolute;inset:0;box-sizing:border-box;border-radius:${r(U(44))}cqw;padding:${r(U(12))}cqw;background:${th.ink};box-shadow:0 ${r(U(30))}cqw ${r(U(60))}cqw ${rgba("#08160E", 0.5)};">
    <div style="position:absolute;top:${r(U(22))}cqw;left:50%;transform:translateX(-50%);width:${r(U(90))}cqw;height:${r(U(22))}cqw;border-radius:${r(U(22))}cqw;background:${th.ink};z-index:2;"></div>
    <div style="position:relative;width:100%;height:100%;border-radius:${r(U(33))}cqw;overflow:hidden;background:${th.paper};">${inner}</div>
  </div>`;
}
// NEVER AN EMPTY CONTAINER: a mount is only ever drawn around a real picture, so the reference's
// hatched "DROP IMAGE TO REPLACE" placeholder (152-161) has no equivalent here.
const framed = (th, kind, shot, w, h) =>
  (kind === "phone" ? phoneShell : signBoard)(th, K.shotFill(shot, { bg: th.paper, w, h }));

// CHIP (180-181) — the only element that repeats across two beats in the reference, and a large
// share of what makes those frames feel populated. Cream pill, 2px ink keyline, `0 5px 0`, an 8px
// accent dot, Nunito 800 at 16px. Popped in with easeOutBack at a 0.09 stagger.
const chip = (th, text) =>
  `<span class="jchip" style="display:inline-flex;align-items:center;gap:${r(U(8))}cqw;padding:${r(U(9))}cqw ${r(U(18))}cqw;border-radius:${r(U(999))}cqw;background:${th.paper};border:${r(U(2))}cqw solid ${th.ink};box-shadow:${drop(5)};font-family:${th.bodyStack};font-weight:800;font-size:${r(U(16))}cqw;color:${th.ink};white-space:nowrap;opacity:0;"><span style="width:${r(U(8))}cqw;height:${r(U(8))}cqw;border-radius:50%;background:${th.accent};flex:0 0 auto;"></span>${esc(text)}</span>`;
const chipRow = (th, list, justify) => (list.length
  ? `<div style="margin-top:${r(U(24))}cqw;display:flex;gap:${r(U(12))}cqw;flex-wrap:wrap;${justify ? `justify-content:${justify};` : ""}">${list.map((c) => chip(th, c)).join("")}</div>`
  : "");
const chipsOf = (scene, n = 3) => K.bullets(scene, n).map((b) => K.clampWords(String(b).toUpperCase(), 22)).filter(Boolean);

// The eyebrow pill: Nunito 900 at 20px on `th.leaf`, the one green the reference keeps out of the
// brand's reach (jungle-film.jsx:242). It was derived from the accent and then never referenced —
// a dead colour and a missing element in one line.
const eyebrow = (th, text) =>
  `<div style="display:inline-block;margin-bottom:${r(U(14))}cqw;padding:${r(U(6))}cqw ${r(U(16))}cqw;border-radius:${r(U(999))}cqw;background:${th.leaf};color:${th.paper};font-family:${th.bodyStack};font-weight:900;font-size:${r(U(20))}cqw;letter-spacing:0.14em;text-transform:uppercase;">${esc(text)}</div>`;

const lines = (arr) => arr.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("");
const bodyCopy = (th, text, size, maxW) => (text
  ? `<div style="margin-top:${r(U(20))}cqw;max-width:${r(U(maxW))}cqw;font-family:${th.bodyStack};font-weight:700;font-size:${r(U(size))}cqw;line-height:1.5;color:${th.paper};${bodyShadow}">${esc(text)}</div>`
  : "");

// ---- scenes ------------------------------------------------------------------
// Entry choreography is written as a FRACTION OF THE BEAT, the way the reference authors it
// (`seg(progress, 0.12, 0.46)`), so a 2.3s beat and a 5s beat perform the same edit.
const frac = (ctx) => (f) => r(ctx.T + f * Math.max(0.4, ctx.L));
const span = (ctx) => (f) => r(Math.max(0.12, f * Math.max(0.4, ctx.L)));

// ENTER (214-231) — the centred brand lockup: the brand word at 220px in cream with a hard ink
// shadow, the tagline on an accent pill beneath it, all three animals behind. PICTURELESS BY
// DESIGN, as the reference is: the beat is full of jungle and lettering, so nothing here is a bare
// frame, and the pictures it would have eaten go to the beats built to hold them.
function sEnter(scene, ctx) {
  const { id, th } = ctx;
  const at = frac(ctx), dur = span(ctx);
  const word = String(ctx.brand || "").toUpperCase();
  const size = K.fitOne(word, U(1700) / K.camSafe(), U(220), K.ADVANCE.upper);
  const tagline = K.clampWords(String(scene.headline || scene.subtext || scene.emphasis || ""), 64);
  const tagSize = K.fitOne(tagline, U(1200), U(30), th.adv);
  return {
    backdrop: "",
    chrome: chrome(th, ctx.brand, ctx.label),
    html: `
    ${canopy(id, th)}
    ${cast(id, th, "enter")}
    <div style="position:absolute;left:0;right:0;top:${r(U(300))}cqw;text-align:center;z-index:3;">
      <div class="${id}-brand" style="transform-origin:center;font-family:${th.displayStack};font-size:${r(size)}cqw;line-height:0.9;color:${th.paper};text-shadow:0 ${r(U(6))}cqw 0 ${th.ink}, 0 0 ${r(U(40))}cqw ${rgba("#000000", 0.4)};opacity:0;">${esc(word)}</div>
      ${tagline ? `<div class="${id}-tag" style="display:inline-block;margin-top:${r(U(10))}cqw;padding:${r(U(10))}cqw ${r(U(26))}cqw;border-radius:${r(U(999))}cqw;background:${th.accent};border:${r(U(3))}cqw solid ${th.ink};color:${th.ink};font-family:${th.bodyStack};font-weight:800;font-size:${r(tagSize)}cqw;opacity:0;">${esc(tagline)}</div>` : ""}
    </div>`,
    s: [
      // M.pop(progress, 0.28, 0.46, 0.6) — scale 0.6 -> 1 on easeOutBack about the centre.
      `tl.fromTo(".${id}-brand",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${dur(0.46)},ease:"back.out(1.7)"},${at(0.28)});`,
      tagline ? `tl.fromTo(".${id}-tag",{opacity:0,y:"${r(U(34))}cqw"},{opacity:1,y:0,duration:${dur(0.3)},ease:"back.out(1.6)"},${at(0.46)});` : "",
      ...castTweens(id, ctx, "enter"),
      ...canopyTweens(id, ctx, 0),
    ].filter(Boolean),
  };
}

// DISCOVER (233-252) — copy left, a 760x480 signboard sliding in from the right. The canopy
// travels at the reference's own `localTime * 60` for this beat.
function sDiscover(scene, ctx, shots) {
  const { id, th } = ctx;
  const at = frac(ctx), dur = span(ctx);
  const shot = (shots || [])[0];
  if (!shot) return clearing(scene, ctx, { role: "discover" });
  const head = K.fitLines(scene.headline || scene.title || ctx.title, U(640) / K.camSafe(), U(92), 3, th.adv);
  const chips = chipsOf(scene);
  return {
    backdrop: "",
    chrome: chrome(th, ctx.brand, ctx.label),
    html: `
    ${canopy(id, th)}
    ${cast(id, th, "discover")}
    <div class="${id}-copy" style="position:absolute;left:${r(U(110))}cqw;top:${r(U(250))}cqw;width:${r(U(640))}cqw;z-index:3;opacity:0;">
      ${eyebrow(th, K.clampWords(String(scene.kicker || STRINGS.guide).toUpperCase(), 22))}
      <div style="font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.98;color:${th.paper};${headShadow()}">${lines(head.lines)}</div>
      ${bodyCopy(th, K.clampWords(String(scene.subtext || scene.body || ""), 170), 24, 520)}
      ${chipRow(th, chips)}
    </div>
    <div class="${id}-board" style="position:absolute;right:${r(U(120))}cqw;top:${r(U(240))}cqw;width:${r(U(760))}cqw;height:${r(U(480))}cqw;z-index:3;opacity:0;">
      ${framed(th, "desktop", shot, 760, 480)}
    </div>`,
    s: [
      `tl.fromTo(".${id}-copy",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${dur(0.3)},ease:"back.out(1.4)"},${at(0.12)});`,
      // translateX 720 -> 0 with opacity, easeOutBack across progress 0.12-0.46.
      `tl.fromTo(".${id}-board",{opacity:0,x:"${r(U(720))}cqw"},{opacity:1,x:0,duration:${dur(0.34)},ease:"back.out(1.3)"},${at(0.12)});`,
      chips.length ? `tl.fromTo("#${id} .jchip",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${dur(0.32)},ease:"back.out(2)",stagger:${dur(0.09)}},${at(0.5)});` : "",
      ...castTweens(id, ctx, "discover"),
      ...canopyTweens(id, ctx, 60),
    ].filter(Boolean),
  };
}

// TREK (254-272) — the phone beat: a 356x740 shell rising from below at left 300, the copy
// right-aligned opposite it, the tiger prowling behind. Canopy drift `localTime * 40`.
function sTrek(scene, ctx, shots) {
  const { id, th } = ctx;
  const at = frac(ctx), dur = span(ctx);
  const shot = (shots || [])[0];
  if (!shot) return clearing(scene, ctx, { role: "trek" });
  const head = K.fitLines(scene.headline || scene.title || ctx.title, U(620) / K.camSafe(), U(88), 3, th.adv);
  const chips = chipsOf(scene);
  return {
    backdrop: "",
    chrome: chrome(th, ctx.brand, ctx.label),
    html: `
    ${canopy(id, th)}
    ${cast(id, th, "trek")}
    <div class="${id}-copy" style="position:absolute;right:${r(U(120))}cqw;top:${r(U(260))}cqw;width:${r(U(620))}cqw;text-align:right;z-index:3;opacity:0;">
      <div style="font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.98;color:${th.paper};${headShadow()}">${lines(head.lines)}</div>
      ${bodyCopy(th, K.clampWords(String(scene.subtext || scene.body || ""), 170), 23, 620)}
      ${chipRow(th, chips, "flex-end")}
    </div>
    <div class="${id}-phone" style="position:absolute;left:${r(U(300))}cqw;top:${r(U(150))}cqw;width:${r(U(356))}cqw;height:${r(U(740))}cqw;z-index:3;opacity:0;">
      ${framed(th, "phone", shot, 356, 740)}
    </div>`,
    s: [
      `tl.fromTo(".${id}-copy",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${dur(0.3)},ease:"back.out(1.4)"},${at(0.14)});`,
      // translateY 800 -> 0 with opacity, easeOutBack across progress 0.10-0.42.
      `tl.fromTo(".${id}-phone",{opacity:0,y:"${r(U(800))}cqw"},{opacity:1,y:0,duration:${dur(0.32)},ease:"back.out(1.3)"},${at(0.1)});`,
      chips.length ? `tl.fromTo("#${id} .jchip",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${dur(0.32)},ease:"back.out(2)",stagger:${dur(0.09)}},${at(0.46)});` : "",
      ...castTweens(id, ctx, "trek"),
      ...canopyTweens(id, ctx, 40),
    ].filter(Boolean),
  };
}

// SIGHTINGS (274-294) — the five-board montage, at five DIFFERENT hand-placed sizes across two
// rows. The irregularity is the point: it is what sells "a whole habitat of screens", and a tidy
// three-up grid of equal cards is what the previous port turned it into.
//
// Each board also BOBS for the whole beat (`sin(localTime*0.8 + i) * 8`), on its own phase. The
// bob rides an inner wrapper so it never shares the `y` channel with the entry that precedes it.
// All five are SIGNBOARDS: the reference's per-tile `kind` (274-280) only picked which words its
// dashed placeholder printed, and we never draw a placeholder.
const TILES = [
  { x: 150, y: 320, w: 470, h: 260 }, { x: 660, y: 290, w: 320, h: 260 },
  { x: 1020, y: 320, w: 620, h: 260 }, { x: 360, y: 620, w: 500, h: 220 },
  { x: 920, y: 620, w: 560, h: 220 },
];
const BOB = Math.PI / 0.8;          // sin(localTime*0.8) — a 7.85s period, so a 3.93s yoyo.
function sSightings(scene, ctx, shots) {
  const { id, th } = ctx;
  const at = frac(ctx), dur = span(ctx);
  const pics = (shots || []).filter(Boolean);
  if (pics.length < 2) return clearing(scene, ctx, { role: "sightings" });
  // NEVER AN EMPTY CONTAINER: only as many boards as there are pictures.
  const tiles = TILES.slice(0, Math.min(TILES.length, pics.length));
  // ONE LINE, as the reference's is: the top row of boards starts at y=290 and the headline block
  // sits at y=110, so a second 68px line plus a two-line sub would push the copy into the boards.
  const head = K.fitLines(scene.headline || scene.title || ctx.title, U(1500) / K.camSafe(), U(68), 1, th.adv);
  const sub = K.clampWords(String(scene.subtext || scene.body || ""), 150);
  return {
    backdrop: "",
    chrome: chrome(th, ctx.brand, ctx.label),
    html: `
    ${canopy(id, th)}
    <div class="${id}-head" style="position:absolute;left:0;right:0;top:${r(U(110))}cqw;text-align:center;z-index:6;opacity:0;">
      <div style="font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.98;color:${th.paper};${headShadow()}">${lines(head.lines)}</div>
      ${sub ? `<div style="max-width:${r(U(1000))}cqw;margin:${r(U(12))}cqw auto 0;font-family:${th.bodyStack};font-weight:700;font-size:${r(U(24))}cqw;line-height:1.5;color:${th.paper};${bodyShadow}">${esc(sub)}</div>` : ""}
    </div>
    ${tiles.map((t, i) => `<div class="${id}-b${i}" style="position:absolute;left:${r(U(t.x))}cqw;top:${r(U(t.y))}cqw;width:${r(U(t.w))}cqw;height:${r(U(t.h))}cqw;z-index:4;opacity:0;">
      <div class="${id}-bob${i}" style="position:absolute;inset:0;">${framed(th, "desktop", pics[i], t.w, t.h)}</div>
    </div>`).join("")}`,
    s: [
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(30))}cqw"},{opacity:1,y:0,duration:${dur(0.24)},ease:"back.out(1.4)"},${at(0.06)});`,
      ...tiles.map((t, i) => `tl.fromTo(".${id}-b${i}",{opacity:0,y:"${r(U(60))}cqw",scale:0.9},{opacity:1,y:0,scale:1,duration:${dur(0.34)},ease:"back.out(1.6)"},${at(0.16 + i * 0.09)});`),
      ...tiles.map((t, i) => `tl.fromTo(".${id}-bob${i}",{y:"${r(-U(8))}cqw"},{y:"${r(U(8))}cqw",duration:${r(BOB)},ease:"sine.inOut",repeat:${K.reps(Math.max(0.4, ctx.L - i * 0.4), BOB)},yoyo:true},${r(ctx.T + i * 0.4)});`),
      ...canopyTweens(id, ctx, 30),
    ],
  };
}

// CENSUS (296-317) — the count, on cream tallies with 3px ink keylines and a `0 10px 0` shadow.
// Figures come from the script (K.numbersIn); a proof card must not print a number nobody claimed.
function sCensus(scene, ctx) {
  const { id, th } = ctx;
  const at = frac(ctx), dur = span(ctx);
  const stats = K.numbersIn(scene, 3);
  if (stats.length < 2) return clearing(scene, ctx, { role: "census", centred: true });
  const head = K.fitLines(scene.headline || scene.title || ctx.title, U(1000) / K.camSafe(), U(92), 2, th.adv);
  return {
    backdrop: "",
    chrome: chrome(th, ctx.brand, ctx.label),
    html: `
    ${canopy(id, th)}
    ${cast(id, th, "census")}
    <div class="${id}-copy" style="position:absolute;left:${r(U(110))}cqw;top:${r(U(210))}cqw;width:${r(U(1000))}cqw;z-index:3;opacity:0;">
      <div style="font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.94;color:${th.paper};${headShadow()}">${lines(head.lines)}</div>
      ${bodyCopy(th, K.clampWords(String(scene.subtext || scene.body || ""), 160), 24, 620)}
    </div>
    <div style="position:absolute;left:${r(U(110))}cqw;top:${r(U(560))}cqw;display:flex;gap:${r(U(30))}cqw;z-index:3;">
      ${stats.map((st, i) => `<div class="${id}-c${i}" style="min-width:${r(U(290))}cqw;padding:${r(U(28))}cqw ${r(U(42))}cqw;background:${th.paper};border:${r(U(3))}cqw solid ${th.ink};border-radius:${r(U(22))}cqw;box-shadow:${drop(10, 0.3)};opacity:0;">
        <div style="font-family:${th.displayStack};font-size:${r(U(92))}cqw;line-height:1;color:${th.accent};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
        <div style="margin-top:${r(U(6))}cqw;font-family:${th.bodyStack};font-weight:800;font-size:${r(U(18))}cqw;letter-spacing:0.08em;color:${th.ink};white-space:nowrap;overflow:hidden;">${esc(K.statLabel(scene, i))}</div>
      </div>`).join("")}
    </div>`,
    s: [
      `tl.fromTo(".${id}-copy",{opacity:0,y:"${r(U(36))}cqw"},{opacity:1,y:0,duration:${dur(0.26)},ease:"back.out(1.4)"},${at(0.08)});`,
      ...stats.flatMap((st, i) => {
        const num = Number(String(st.v).replace(/,/g, "")) || 0;
        const dp = String(st.v).includes(".") ? 1 : 0;
        return [
          `tl.fromTo(".${id}-c${i}",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${dur(0.4)},ease:"back.out(2.2)"},${at(0.34 + i * 0.12)});`,
          // The reference's Counter runs on easeOutExpo.
          `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${dur(0.5)},ease:"expo.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.38 + i * 0.12)});`,
        ];
      }),
      ...castTweens(id, ctx, "census"),
      ...canopyTweens(id, ctx, 0),
    ],
  };
}

// JOIN (319-339) — the close, and the jungle stays visible: a left column holding the logo disc,
// the headline at 140px, the body and the accent CTA pill with its paw, while the monkey, toucan
// and tiger all keep their own coordinates. The previous port covered two thirds of the frame with
// one 1440px cream slab at exactly the moment the film should be at its most jungle.
function sComeAlong(scene, ctx, _shots, logo) {
  const { id, th } = ctx;
  const at = frac(ctx), dur = span(ctx);
  const head = K.fitLines(scene.headline || scene.emphasis || ctx.title, U(1000) / K.camSafe(), U(140), 3, th.adv);
  const action = K.clampWords(String(scene.emphasis || ""), 20) || STRINGS.cta;
  const body = K.clampWords(String(scene.subtext || scene.body || ""), 160);
  const mark = logo && logo.path ? logo : null;
  return {
    backdrop: "",
    chrome: chrome(th, ctx.brand, ctx.label),
    html: `
    ${canopy(id, th)}
    ${cast(id, th, "comealong")}
    <div style="position:absolute;left:${r(U(110))}cqw;top:${r(U(250))}cqw;width:${r(U(1000))}cqw;z-index:3;">
      ${mark ? `<div class="${id}-logo" style="width:${r(U(130))}cqw;height:${r(U(130))}cqw;box-sizing:border-box;border-radius:50%;background:${th.paper};border:${r(U(4))}cqw solid ${th.ink};box-shadow:${drop(8, 0.3)};overflow:hidden;padding:${r(U(16))}cqw;margin-bottom:${r(U(24))}cqw;display:flex;align-items:center;justify-content:center;opacity:0;"><img src="${esc(mark.path)}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;"></div>` : ""}
      <div class="${id}-head" style="font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.9;color:${th.paper};text-shadow:0 ${r(U(6))}cqw 0 ${th.ink};opacity:0;">${lines(head.lines)}</div>
      ${body ? `<div class="${id}-body" style="opacity:0;">${bodyCopy(th, body, 25, 760)}</div>` : ""}
      <div class="${id}-pill" style="margin-top:${r(U(34))}cqw;display:flex;align-items:center;gap:${r(U(20))}cqw;opacity:0;">
        <span style="display:inline-flex;align-items:center;gap:${r(U(12))}cqw;padding:${r(U(20))}cqw ${r(U(46))}cqw;border-radius:${r(U(999))}cqw;background:${th.accent};border:${r(U(3))}cqw solid ${th.ink};box-shadow:${drop(8, 0.35)};color:${onAccent(th.accent)};font-family:${th.displayStack};font-size:${r(K.fitOne(action, U(520), U(34), th.adv))}cqw;white-space:nowrap;">${esc(action)}${PAW_MARK(onAccent(th.accent))}</span>
        <span style="font-family:${th.bodyStack};font-weight:800;font-size:${r(U(22))}cqw;color:${th.paper};${bodyShadow}white-space:nowrap;">${esc(ctx.url)}</span>
      </div>
    </div>`,
    s: [
      mark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${dur(0.5)},ease:"back.out(1.8)"},${at(0.22)});` : "",
      `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(44))}cqw"},{opacity:1,y:0,duration:${dur(0.3)},ease:"back.out(1.4)"},${at(0.12)});`,
      body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(28))}cqw"},{opacity:1,y:0,duration:${dur(0.3)},ease:"power3.out"},${at(0.34)});` : "",
      `tl.fromTo(".${id}-pill",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${dur(0.4)},ease:"back.out(2)"},${at(0.44)});`,
      ...castTweens(id, ctx, "comealong"),
      ...canopyTweens(id, ctx, 0),
    ].filter(Boolean),
  };
}

// THE CLEARING — the layout for a beat with no picture.
//
// It is NOT K.statement. The kit's statement sets its headline in `th.ink` and its body in
// `th.sub`, which is correct for a pack whose ground is a light wash and wrong for this one: those
// greens land on mid-green trunks at about 1.4:1. The reference's answer for type over the jungle
// is cream with a hard ink shadow, so that is what a jungle beat without a picture gets — plus the
// eyebrow pill, the chips and a cast, so it is a designed pictureless beat rather than a beat with
// its picture removed. `role` only picks which animals attend.
function clearing(scene, ctx, { role = "statement", centred = false } = {}) {
  const { id, th } = ctx;
  const at = frac(ctx), dur = span(ctx);
  const castRole = CAST[role] ? role : "statement";
  const colW = centred ? U(1400) : U(1000);
  const left = centred ? U(260) : U(110);
  const head = K.fitLines(scene.headline || scene.title || ctx.title, colW / K.camSafe(), U(126), 3, th.adv);
  const kicker = K.clampWords(String(scene.kicker || scene.purpose || ctx.label || STRINGS.field).toUpperCase(), 24);
  const chips = chipsOf(scene, 4);
  return {
    backdrop: "",
    chrome: chrome(th, ctx.brand, ctx.label),
    html: `
    ${canopy(id, th)}
    ${cast(id, th, castRole)}
    <div class="${id}-copy" style="position:absolute;left:${r(left)}cqw;top:${r(U(230))}cqw;width:${r(colW)}cqw;${centred ? "text-align:center;" : ""}z-index:3;opacity:0;">
      ${kicker ? eyebrow(th, kicker) : ""}
      <div style="font-family:${th.displayStack};font-size:${r(head.size)}cqw;line-height:0.94;color:${th.paper};${headShadow()}">${lines(head.lines)}</div>
      ${bodyCopy(th, K.clampWords(String(scene.subtext || scene.body || ""), 180), 26, centred ? 1400 : 760)}
      ${chipRow(th, chips, centred ? "center" : "")}
    </div>`,
    s: [
      `tl.fromTo(".${id}-copy",{opacity:0,y:"${r(U(46))}cqw"},{opacity:1,y:0,duration:${dur(0.3)},ease:"back.out(1.4)"},${at(0.1)});`,
      chips.length ? `tl.fromTo("#${id} .jchip",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${dur(0.3)},ease:"back.out(2)",stagger:${dur(0.09)}},${at(0.46)});` : "",
      ...castTweens(id, ctx, castRole),
      ...canopyTweens(id, ctx, 0),
    ].filter(Boolean),
  };
}

// ---- spine -------------------------------------------------------------------
// MEDIA LIVES WHERE THE REFERENCE PUTS IT: one signboard on `discover`, one phone on `trek`, up to
// five boards on `sightings`, and the mark on the close. `enter` and `census` are pictureless BY
// DESIGN — the brand lockup and the tally cards are what fills them.
const SPEC = {
  first: "enter", last: "comealong",
  middle: ["discover", "trek", "sightings", "census"],
  shapes: {
    enter: [], discover: [760 / 480], trek: [356 / 740],
    sightings: TILES.map((t) => t.w / t.h),
    census: [], comealong: [], statement: [], "statement-c": [],
  },
  slots: (role, budget) => (role === "discover" || role === "trek" ? 1
    : role === "sightings" ? Math.min(TILES.length, Math.max(0, budget)) : 0),
  needs: (role) => (role === "discover" || role === "trek" ? 1 : role === "sightings" ? 2 : 0),
  // Roles are picked by a ROTATING cursor, not by priority, so whichever role the cursor lands on
  // claims the beat. Census is the only layout that prints figures AS figures, so every other role
  // declines a beat carrying two or more numbers and the cursor has to walk on to census.
  carry: (role, scene, budget) => {
    const isStats = K.numbersIn(scene).length >= 2;
    if (role === "census") return isStats;
    if (isStats) return false;
    if (role === "discover" || role === "trek") return budget >= 1;
    if (role === "sightings") return budget >= 2;
    return true;
  },
};
const BUILDERS = {
  enter: sEnter, discover: sDiscover, trek: sTrek, sightings: sSightings, census: sCensus,
  comealong: sComeAlong,
  statement: (sc, ctx) => clearing(sc, ctx, { role: "statement" }),
  "statement-c": (sc, ctx) => clearing(sc, ctx, { role: "statement-c", centred: true }),
};
// OM_SCENES' own kickers (Jungle.dc.html:21), which are also the film's expedition voice.
const LABELS = {
  enter: STRINGS.enter, discover: STRINGS.discover, trek: STRINGS.trek,
  sightings: STRINGS.sightings, census: STRINGS.census, comealong: STRINGS.go,
  statement: STRINGS.field, "statement-c": STRINGS.field,
};

const css = (th, stage) => K.baseCss(th, stage, `
  /* The caption pill is a cream sticker like everything else in this jungle, and its type is
     Nunito: Chewy is a single-weight display face, so the kit's default weight-600 caption could
     only ever be a synthesised bold of a hand-lettered face. */
  #cap-pill { border:${r(stage.U(3))}cqw solid ${th.ink}; box-shadow:${drop(5)}; }
  #cap-text { font-family:${th.bodyStack}; font-weight:800; }`);

function buildComposition(opts = {}) {
  return K.buildFilm({
    ...opts, stage: STAGE, theme, STRINGS, spec: SPEC, builders: BUILDERS, labels: LABELS,
    css, refBeat: 4.4,
    // jcam (jungle-film.jsx:33-39) slides in from +200px and out to -180px around a 1.035 scale.
    camera: { push: 200, scale: 1.035 },
    signature: "organic", fallbackBrand: "WILD",
  });
}

module.exports = { buildComposition, STRINGS };
module.exports.__test = { SPEC, BUILDERS, theme, STAGE, TILES, CAST };
