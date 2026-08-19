// FILM BEATS — the sixteen scene renderers of source/film-kit.js, restated as HTML builders.
//
// Every builder here is a transcription of the matching function in the handoff's
// `film-kit.js`, with three systematic changes and no others:
//
//   1. UNITS. The source writes raw pixels against its authored 1080x1920. Each becomes
//      X()/V()/F() so the composition holds its proportions at any output size.
//   2. ANIMATION. The source recomputes `tM(p,i)` / `iM(p,i)` inline every frame. Here an
//      element carries `data-in="<preset>" data-i="<n>"` and the timeline emits one GSAP
//      fromTo per element with the same curve, the same stagger and the same distance.
//      RESTING STATE IS THE FINISHED FRAME — the "from" values exist only while a tween
//      runs, so a stalled ticker can never capture a blank scene.
//   3. CONTENT. `scene.title/sub/chips/tiles/stats/items/...` came from a hand-authored
//      OM_SCENES deck. Here they come from KEYFRAME's storyboard, through the extractors in
//      film_stage.js, and the dashed "DROP IMAGE TO REPLACE" slot becomes a real asset in a
//      real device frame — a placeholder must never reach a rendered film.
//
// The per-frame INTERACTION state (typed characters, ring sweep, scroll travel, cursor
// path, flipped switches) is NOT baked here. Each builder returns a `mech` descriptor and
// the runtime in film_runtime.js recomputes it from scene-local progress on every seek,
// exactly as the source does per frame — which is what makes those beats seek-exact.

const { weightFloor } = require("../fonts/font_weights");
const S = require("./film_stage");
const { X, V, F, rgba, clamp, clamp01, fitLines, fitPx, featureLines, pickStats, shortLabel, trackEm } = S;
const { esc, r, bullets } = require("./composer_kit");

// SAFE MARGIN AND CONTENT COLUMN, IN AUTHORED PIXELS OF THE CURRENT STAGE.
//
// These were `72` and `1080 - 144`, correct while every template in this family was authored
// against a 1080-wide portrait frame. They are now recomputed per build from the skin's authored
// stage (film_stage.setStage), because a landscape template is 1920 wide and a 72px margin on it
// is a hairline. The ratio is preserved exactly — 72/1080 — so a portrait build reproduces the
// old constants to the pixel and every one of the 89 shipped packs is byte-identical.
//
// Mutable module state, same per-build contract as film_stage's RW/RH and TSCALE: build() is
// synchronous, so two builds cannot interleave.
let PAD = 72;
let COL = 1080 - PAD * 2;
// True when the SKIN was authored landscape. Beats branch on this to lay out across the frame
// instead of down it; it never asks about the output size.
let WIDE = false;

// Called by film_stage.build() before any beat is emitted.
function setStage(rw, rh) {
  PAD = Math.round(rw * (72 / 1080));
  COL = rw - PAD * 2;
  WIDE = rw > rh;
}

// SPEC-DECLARED MEDIA BOXES.
//
// Every FilmKit pack drew its pictures at the same hardcoded sizes, so every generated template
// shipped byte-identical asset geometry — measured across three generations: two 16:9 templates
// from unrelated briefs declared exactly `feature:2@851x528 how:4@399x475 …`. The hand-built packs
// each have their own (grid-dispatch a 950-wide column, paper-tales 1421x302 strips), and that
// difference is a real part of what makes them distinct films.
//
// A skin may now state its own boxes as FRACTIONS OF ITS AUTHORED STAGE, which keeps one set of
// numbers valid at both 1080x1920 and 1920x1080. Absent — every one of the 89 shipped skins — the
// defaults below reproduce the previous literals exactly, which is why golden stays byte-identical.
//
// THE POINT IS THE SINGLE SOURCE. scripts/gen-film-packs.js derives the pack.json media contract
// from this same resolver, so the manifest describes the box the engine actually draws. Letting a
// spec declare geometry the engine ignores would recreate the defect class that had six shipped
// packs collecting, scoring and cropping assets for boxes no composer ever drew.
function boxOf(skin, role, defW, defH) {
  const b = skin && skin.boxes && skin.boxes[role];
  const w = b && Number(b.w) > 0 ? Math.round(Number(b.w) * S.RW) : defW;
  const h = b && Number(b.h) > 0 ? Math.round(Number(b.h) * S.RH) : defH;
  return { w, h };
}

// The landscape feature beat sizes its card from the ROW SPLIT, not from a free width — the copy
// takes whatever the card leaves. So a declared width becomes a lead fraction, clamped to a band
// where the copy column is still a column: past ~0.72 the headline wraps to one word a line.
// Undeclared, this returns the previous literals (0.54 / w*0.62) exactly.
const WIDE_TRACK = () => COL - 88;                       // wideRow's usable width, minus its gap
function wideFeatureBox(skin) {
  const b = skin && skin.boxes && skin.boxes.feature;
  const track = WIDE_TRACK();
  const lead = b && Number(b.w) > 0
    ? Math.min(0.72, Math.max(0.3, (Number(b.w) * S.RW) / track))
    : 0.54;
  const cardW = Math.round(track * lead);
  const cardH = b && Number(b.h) > 0 ? Math.round(Number(b.h) * S.RH) : Math.round(cardW * 0.62);
  return { lead, cardW, cardH };
}

// THE CONTRACT, READ OFF THE LAYOUT THAT DRAWS IT.
//
// scripts/gen-film-packs.js calls this to build pack.json's media.slotsByRole, so the manifest
// cannot describe a box the engine does not draw — it is the same arithmetic, run once. Returns
// null for a skin that declares nothing, which is every one of the 89 shipped ones: those keep
// the checked-in family table untouched, and golden stays byte-identical.
//
// Each stage reports its boxes the way that stage's family table already does — the portrait
// feature row is the PICTURE inside its 13px-padded plate (936x588 plate, 910x562 picture), the
// rest are the drawn cards. Changing that convention here would silently rewrite 89 manifests.
function mediaBoxes(skin, stageName) {
  if (!skin || !skin.boxes) return null;
  // Same two calls film_stage.build() makes before any beat is emitted, in the same order —
  // boxOf reads S.RW/S.RH and the layout reads PAD/COL/WIDE, and they must describe one stage.
  S.setStage(stageName || skin.stage || "portrait");
  setStage(S.RW, S.RH);
  if (WIDE) {
    const F = wideFeatureBox(skin);
    return {
      feature: { width: F.cardW, height: F.cardH },
      how: { width: Math.round((COL - 22 * 3) / 4), height: boxOf(skin, "montage", COL, Math.round(S.RH * 0.44)).h },
      context: { width: Math.round(WIDE_TRACK() * 0.45), height: boxOf(skin, "statement", COL, Math.round(S.RH * 0.52)).h },
    };
  }
  const F = boxOf(skin, "feature", 936, 588);
  return {
    feature: { width: F.w - 26, height: F.h - 26 },      // the plate's 13px padding, both sides
    how: { width: Math.round((COL - 26) / 2), height: boxOf(skin, "montage", COL, 292).h },
    context: { width: COL, height: boxOf(skin, "statement", COL, 430).h },
  };
}

// Resolve a `look` colour: a palette KEY, or a literal hex the source inlined.
const col = (theme, s) => (typeof s === "string" && s[0] === "#" ? s : (theme.c && theme.c[s]) || theme[s] || s);

// TEXT COLOUR, GUARDED AGAINST ITS ACTUAL GROUND.
//
// The authored `look.<beat>.fg` is honoured whenever it reads — that is the design, and
// keeping it is the whole point of the port. But it can fail to read for two reasons this
// engine has to survive: a ported look can name a dark ink on a dark field (cat-nap rendered
// its opening headline in #332a47 on a #332a47-family ground — present, measured, laid out and
// effectively invisible), and the brand rotation can move a colour and its ground toward each
// other. `theme.typeOn` returns the authored colour at ratio >= 3 and the field's own readable
// ink otherwise, so the design wins by default and legibility wins when it must.
// NEVER PUT THE WORD "METRIC" ON SCREEN.
//
// Six builders fell back to the literal string `Str.metric` ("Metric") — and one to an invented
// "ONE / TWO / THREE" ladder — whenever a scene yielded no list copy. Measured in 18 of 48 audited
// packs: films shipped a card reading "Metric" with an empty body, which is the same class of
// defect as the fabricated "100% / Metric" statistic this repo already removed once. A placeholder
// label is not neutral; the viewer reads it as content.
//
// These fall back to the scene's OWN words instead, and to NOTHING when the scene has none — a
// builder handed an empty list draws fewer rows, which every one of them already handles because
// the reference decks vary their row counts.
const fallbackLines = (scene) => {
  const out = [];
  for (const v of [scene.subtext, scene.emphasis, scene.headline]) {
    const t = String(v || "").replace(/\s+/g, " ").trim();
    if (t) out.push(t);
  }
  return out.slice(0, 1);
};
// The first `n` words of whatever the scene does say — for the single-chip slots (a drag chip, a
// morph step) that need a short token rather than a sentence.
const firstWords = (scene, n) => {
  const src = String(scene.emphasis || scene.headline || scene.subtext || "").replace(/\s+/g, " ").trim();
  return src ? src.split(" ").slice(0, n).join(" ") : "";
};
// Morph needs >=2 steps to morph between. With only one phrase in hand, step through its own
// words; with nothing, return empty and let the builder's own guard collapse the beat.
const morphSteps = (scene) => {
  const src = String(scene.emphasis || scene.headline || scene.subtext || "").replace(/\s+/g, " ").trim();
  const words = src ? src.split(" ").filter((w) => w.length > 1) : [];
  return words.length >= 2 ? words : [];
};

const ink = (theme, s, ground, min) => theme.typeOn(col(theme, s), ground, min);
// THE DISPLAY FLOOR CATCHES INVISIBLE INK, NOT LOW-CONTRAST DESIGN.
//
// The reference has no contrast guard whatsoever: `Title` renders `i === 1 ? hi : fg` and trusts
// the authored palette. Ours needs a floor because the brand rotation can move a colour and its
// ground toward each other, and because one ported look really was dark-on-dark (cat-nap, ratio
// ~1.1 — present, laid out, invisible). But at 3.0, and then at 2.0, the floor was repainting
// pairings the designer chose: measured across the library, **28 of 630 beat looks** have an
// authored accent the 2.0 floor overwrites with the field's own ink, which erases the FilmKit
// signature (the second display line takes the accent) — loom-and-weft sets terracotta on dark
// blue at ratio 1.76 and shipped it as cream.
//
// 1.45 is below every authored pairing measured in the library and above the invisible-ink cases
// the guard exists for, so the design wins wherever the designer actually made a choice.
const DISPLAY_MIN = 1.45;
const splitLines = (t) => String(t == null ? "" : t).split("|");

// ---- shared fragments ---------------------------------------------------------
// THE DISPLAY STACK. The source's `Title()`: one <div> per line, each its own animated
// element, and — the FilmKit signature — THE SECOND LINE TAKES THE ACCENT. That single
// detail is most of why these titles read as designed rather than typed, so it is
// preserved exactly (`i === 1 ? hi : fg`).
// `colPx` overrides the measure the line fitter wraps against. It defaults to the full content
// column, which is every portrait call site unchanged; a WIDE beat that puts copy in one half of
// a two-column layout passes its real column width, without which the fitter would wrap for
// 1664px and overflow the 780px it was actually given.
function title(theme, skin, txt, { size, sizeMax = 0, fg, hi, upper, from = 0, align = "left", maxLines = 4, ground, colPx = null }) {
  // the skin tracks its display type; that tracking is part of the line width (see fitLines).
  // `size` is the AUTHORED size (tried first, wrapping as the reference wraps); `sizeMax` is
  // soloSize's empty-frame ceiling, which fitLines takes only without re-wrapping.
  // `family` lets the fitter use the face's REAL measured advances (font_metrics.js) instead of
  // the skin's single average `em`, which is now only the fallback. See fitLines.
  const fit = fitLines(txt, { basePx: size, growPx: sizeMax, maxLines, colPx: colPx || COL, em: skin.em, family: skin.display, upper, track: trackEm(skin.titleSpace) });
  // A tight shadow in the GROUND colour: every pack paints a live world behind the copy and
  // the contrast machinery cannot see it, so the type carries its own separation. Invisible
  // on a clean field; restores the edge wherever a decoration drifts behind a glyph.
  const g = ground ? `text-shadow:0 ${X(2)} ${X(10)} ${rgba(ground, 0.55)}, 0 0 ${X(4)} ${rgba(ground, 0.55)};` : "";
  // DISPLAY WEIGHT. FilmKit's own Title sets none, which is correct for its single-weight
  // display faces (Alfa Slab One, Anton, Bebas Neue) where any weight maps to the one file.
  // The hand-built one-off films use VARIABLE families and specify 700/800 explicitly — left
  // unset those render at 400, which on Baloo 2 or Orbitron is a visibly lighter film than the
  // reference. A skin declares `displayWeight` only when its source does.
  //
  // AND WHERE IT DOES NOT, THE FAMILY'S OWN FLOOR APPLIES. Google serves only the weights a
  // request names, so a reference that asked for Fraunces:opsz,wght@9..144,500;9..144,600 could
  // not have drawn a single glyph at 400 — while display type declaring no weight renders at
  // exactly that. Measured on the chrome lockup (identical string, identical size, same polarity)
  // the reference carries ~17% more ink than our render of it. 21 of the 134 families the designs
  // use were never requested below 400; src/fonts/font_weights.js is generated from those requests
  // (scripts/font-axis-survey.js), so this is data from the sources, not a per-pack branch.
  const wv = skin.displayWeight || weightFloor(skin.display);
  const w = wv ? `font-weight:${wv};` : "";
  // Colour by the LOGICAL line when the copy authored its own breaks — a wrapped continuation
  // of line 1 stays fg, and the accent lands exactly on the authored second line, as the
  // reference renders it. Auto-wrapped copy keeps the physical-second-line accent (the
  // signature look, applied to copy that never declared its own break).
  const hiFor = (i) => (fit.forced ? (fit.groups[i] === 1 ? hi : fg) : (i === 1 ? hi : fg));
  return fit.lines.map((ln, i) =>
    `<div data-in="title" data-i="${from + i}" style="font-family:${theme.displayStack};${w}font-size:${F(fit.size)};line-height:${skin.titleLine || 1.04};letter-spacing:${skin.titleSpace || "0"};color:${hiFor(i)};${upper ? "text-transform:uppercase;" : ""}text-align:${align};${g}">${esc(ln)}</div>`
  ).join("");
}

// The source's `Kicker` — four variants (pill / outline / tag / bare).
function kicker(theme, skin, k, text) {
  if (!text) return "";
  const v = (k && k.v) || "pill";
  const c = col(theme, (k && k.c) || "ink"), bg = col(theme, (k && k.bg) || "accent");
  const base = `display:inline-block;font-family:${theme.bodyStack};font-weight:800;font-size:${F(24)};letter-spacing:.2em;margin-bottom:${X(38)};`;
  if (v === "outline") return `<div data-in="item" data-i="0" style="${base}padding:${X(12)} ${X(26)};border-radius:${k && k.r != null ? X(k.r) : "999px"};border:${X(2)} solid ${rgba(c, 0.75)};color:${c};">${esc(text)}</div>`;
  if (v === "tag") return `<div data-in="item" data-i="0" style="${base}padding:${X(12)} ${X(26)};border-radius:${X(8)};background:${bg};color:${c};transform:rotate(-2deg);">${esc(text)}</div>`;
  if (v === "bare") return `<div data-in="item" data-i="0" style="${base}color:${c};letter-spacing:.3em;">${esc(text)}</div>`;
  return `<div data-in="item" data-i="0" style="${base}padding:${X(13)} ${X(28)};border-radius:999px;background:${bg};color:${c};">${esc(text)}</div>`;
}

// The source's `chipStyle` — pill / outline / square.
function chipCss(v, c, fill, i) {
  if (v === "outline") return `border:${X(2)} solid ${c};color:${c};border-radius:${X(10)};background:transparent;`;
  if (v === "square") return `background:${c};color:${fill};border-radius:${X(8)};transform:rotate(${(i % 2) * 2 - 1}deg);`;
  return `background:${c};color:${fill};border-radius:999px;`;
}

// The source's `card()` — the media plate's four treatments.
function cardCss(L, theme, skin) {
  const v = (L.card && L.card.v) || "frame";
  const cbg = col(theme, L.card && L.card.bg);
  const rad = L.card && L.card.r != null ? L.card.r : 28;
  const F0 = boxOf(skin, "feature", 936, 588);
  const base = `margin:${X(46)} auto ${X(42)};width:${X(F0.w)};height:${X(F0.h)};border-radius:${X(rad)};padding:${X(13)};background:${cbg};`;
  if (v === "tilt") return `${base}transform:rotate(-1.5deg);box-shadow:0 ${X(30)} ${X(62)} rgba(10,10,12,0.4);`;
  if (v === "glow") { const g = col(theme, L.card.glow); return `${base}border:1px solid ${rgba(g, 0.55)};box-shadow:0 0 ${X(44)} ${rgba(g, 0.25)}, 0 ${X(28)} ${X(56)} rgba(0,0,0,0.5);`; }
  if (v === "paper") return `margin:${X(46)} auto ${X(42)};width:${X(936)};height:${X(588)};border-radius:${X(10)};padding:${X(13)};background:#ffffff;box-shadow:0 ${X(26)} ${X(54)} rgba(20,16,10,0.3);`;
  return `${base}box-shadow:0 ${X(30)} ${X(62)} rgba(10,10,12,0.38);`;
}

// THE `world` FLAG IS LOAD-BEARING, NOT DECORATION.
//
// Each beat's `look.<beat>.world` says whether the animated backdrop shows on that beat, and
// 215 of the 474 beats across these 70 templates say NO. The source honours it by painting the
// beat's own ground inside its frame; a port that renders the world everywhere does not merely
// lose that alternation — it breaks the type. Every beat's text colour is authored against its
// OWN field, so cat-nap's feature beat (drawn in #241d2e for a #f6efe4 paper ground) rendered
// dark-on-dark once the night-blue world showed through beneath it.
//
// So a world:false beat paints its ground opaquely on its own clip, which covers the shared
// world layer; a world:true beat stays transparent and lets it through.
const open = (ctx) =>
  // THE CLOSER IS IMAGE-FREE BY DESIGN. `build` hands bCta no assets at all, so a post-process
  // that pastes a spare photograph behind it is overruling the composer: the reference's CTA is a
  // flat field carrying the lockup, the pill and the address, and a picture behind it is not that
  // design. scene_backdrop.js honours this marker (its own note calls out exactly this case).
  `<div class="clip fk-sc" id="${ctx.id}"${ctx.beat === "cta" ? " data-no-backdrop" : ""} data-fk-beat="${ctx.beat || ""}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;${ctx.opaque ? `background:${ctx.ground};` : ""}">` +
  `<div class="fk-cam" id="${ctx.id}-cam"><div class="fk-drift" id="${ctx.id}-drift">`;
const close = () => `</div></div></div>`;

// The app SHELL the ten interaction beats sit inside — the source's `Shell`.
function shell(ctx, titleTxt, inner, extra) {
  const { theme, skin } = ctx;
  const L = ctx.look.app;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN);
  return `${open(ctx)}
    <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(180)};bottom:${V(140)};display:flex;flex-direction:column;justify-content:center;">
      ${title(theme, skin, titleTxt, { size: 92, fg, hi, upper: L.upper, from: 0, ground: ctx.ground })}
      <div style="margin-top:${X(48)};">${inner}</div>
    </div>
    ${extra || ""}
  ${close()}`;
}
// The source's `panel()` — the card every interaction beat draws on.
function panelCss(ctx, h, extra) {
  const { theme } = ctx;
  const L = ctx.look.app;
  const rad = ctx.panelR;
  return `background:${col(theme, L.cardBg)};border-radius:${X(rad)};padding:${X(30)};${h ? `height:${X(h)};` : ""}border:1px solid ${rgba(col(theme, L.line), 0.2)};box-shadow:0 ${X(26)} ${X(56)} rgba(8,8,10,0.35);position:relative;overflow:hidden;${extra || ""}`;
}
// The source's `Pointer` — a hand cursor drawn as one path.
const pointer = (id, fg) =>
  `<g id="${id}" transform="translate(140,620)"><path d="M0 0 L0 30 L8 24 L14 38 L20 35 L14 22 L24 21 Z" fill="${fg}" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/></g>`;

// ================================ WIDE LAYOUT ================================
//
// A LANDSCAPE BEAT LAYS OUT ACROSS THE FRAME, NOT DOWN IT.
//
// The portrait beats stack: copy at some `top`, media below it at a second `top`. That is right
// for 1080x1920 and wrong for 1920x1080, where there is roughly half the vertical room and twice
// the horizontal — a stacked hook there puts a 460-tall device frame under a three-line headline
// in a 1080-tall frame and overflows before a single asset is even considered.
//
// So the wide branches put the copy and the media side by side and centre the pair vertically.
// `L.top` stops being a position (there is nothing to position against once the row is centred)
// and becomes a nudge, which also makes the layout robust to whatever `top` a generated spec
// happens to carry.
//
// Every wide branch is guarded by WIDE, which is only ever true for a skin that DECLARED
// stage:"landscape". The portrait path below each guard is the original code, untouched — proved
// byte-identical by scripts/golden-composers.js across all 89 shipped FilmKit packs.

// The vertical band a wide beat centres its content in, inset by the safe margin.
const wideBand = (extra) => `position:absolute;left:${X(PAD)};right:${X(PAD)};top:0;bottom:0;display:flex;align-items:center;${extra || ""}`;

// A two-column row. `lead` is the fraction of the content column the FIRST child takes.
function wideRow(a, b, { lead = 0.52, gap = 88, reverse = false } = {}) {
  const first = reverse ? b : a, second = reverse ? a : b;
  const f1 = reverse ? 1 - lead : lead;
  return `<div style="${wideBand(`gap:${X(gap)};`)}">
      <div style="flex:${r(f1)} 1 0;min-width:0;">${first}</div>
      <div style="flex:${r(1 - f1)} 1 0;min-width:0;display:flex;align-items:center;justify-content:center;">${second}</div>
    </div>`;
}

// The measure available to copy in one column of a wideRow, in authored px — what `title()`
// must wrap against instead of the full COL.
const wideCol = (lead = 0.52, gap = 88) => Math.round((COL - gap) * lead);

// A single centred column, for the beats that carry no media (statement without an asset, cta).
const wideSolo = (inner, frac = 0.74) =>
  `<div style="${wideBand("justify-content:center;")}">
      <div style="width:${X(Math.round(COL * frac))};max-width:100%;">${inner}</div>
    </div>`;

// ================================ THE SIX CORE BEATS ================================

// HOOK — kicker, the big title stack, a sub line. The opener.
//
// PICTURELESS, LIKE THE SOURCE. film-kit.js uses `MediaSlot` at exactly three sites — the Feature
// hero card, the Montage tile wall and the CTA logo lockup — and `Hook` is not one of them: it
// renders Kicker, Title and sub, and nothing else, over the world. One shared engine draws all 92
// templates, and no template overrides Hook, so no reference opener has ever carried a picture.
//
// Ours did, at top:56.25%, which on a world-bearing pack lands squarely in the band where the
// World draws its furniture: on bonsai-bench the device frame buried the bonsai and the scissors
// for the whole beat, and the pack's signature scenery was gone from the one beat that establishes
// it. The world IS the opener's visual. The `hook` slot is gone from the media contract too
// (scripts/gen-film-packs.js), so nothing is collected for a box that is no longer drawn.
function bHook(scene, ctx, sceneAssets, logo) {
  const { theme, skin, Str } = ctx;
  const L = ctx.look.hook;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN);
  const sub = String(scene.subtext || "").slice(0, 120);
  const mark = logo && logo.path
    ? `<img data-in="item" data-i="0" src="${esc(logo.path)}" alt="${esc(logo.alt || "logo")}" style="height:${X(64)};width:auto;max-width:${X(280)};object-fit:contain;object-position:left center;display:block;margin-bottom:${X(22)};">`
    : "";

  if (WIDE) {
    const measure = Math.round(COL * 0.74);
    const copy = `<div style="text-align:${L.align || "left"};">
      ${mark}${kicker(theme, skin, L.kicker, scene.kicker || Str.hookKicker)}
      ${title(theme, skin, scene.headline || scene.title || ctx.title, { size: L.size || 126, sizeMax: S.soloSize(L.size || 126, false, { maxLines: 3, lineHeight: skin.titleLine || 1.04, capFrac: 0.42 }), fg, hi, upper: L.upper, from: 1, align: L.align || "left", maxLines: 3, ground: ctx.ground, colPx: measure })}
      ${sub ? `<div data-in="rise" data-i="5" style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(fitPx(sub, 32, 74))};color:${rgba(fg, 0.74)};margin-top:${X(30)};max-width:${X(Math.round(measure * 0.92))};line-height:1.45;${L.align === "center" ? "margin-left:auto;margin-right:auto;" : ""}">${esc(sub)}</div>` : ""}
    </div>`;
    return { html: `${open(ctx)}${wideSolo(copy)}${close()}` };
  }

  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(L.top || 320)};text-align:${L.align || "left"};">
      ${mark}${kicker(theme, skin, L.kicker, scene.kicker || Str.hookKicker)}
      ${title(theme, skin, scene.headline || scene.title || ctx.title, { size: L.size || 126, sizeMax: S.soloSize(L.size || 126, false, { maxLines: 4, lineHeight: skin.titleLine || 1.04 }), fg, hi, upper: L.upper, from: 1, align: L.align || "left", maxLines: 4, ground: ctx.ground })}
      ${sub ? `<div data-in="rise" data-i="5" style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(fitPx(sub, 35, 90))};color:${rgba(fg, 0.74)};margin-top:${X(36)};max-width:${X(740)};line-height:1.45;${L.align === "center" ? "margin-left:auto;margin-right:auto;" : ""}">${esc(sub)}</div>` : ""}
    </div>
  ${close()}`;
  return { html };
}

// STATEMENT — the big statement in the display face and a supporting line. The problem /
// quote beat. Text-safe: needs no imagery at all.
function bStatement(scene, ctx, sceneAssets) {
  const { theme, skin } = ctx;
  const L = ctx.look.statement;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN);
  const asset = (skin.media === false ? null : (sceneAssets && sceneAssets[0])) || null;
  const sub = String(scene.subtext || "").slice(0, 140);
  const attribution = bullets(scene, 1)[0] || "";
  const frame = asset
    ? `<div data-in="item" data-i="3" style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(1180)};height:${X(430)};">
        ${S.frameHtml(theme, skin, { device: "card", asset, tint: hi, cardV: "frame", radius: 24 })}
      </div>`
    : "";
  if (WIDE) {
    // The statement is the one beat that is pure type, so with no asset it takes a generous
    // centred measure; with one it becomes copy-left / card-right.
    const lead = asset ? 0.55 : 1;
    const measure = asset ? wideCol(lead) : Math.round(COL * 0.78);
    const copy = `<div style="text-align:${L.align || "left"};">
      ${title(theme, skin, scene.headline || scene.title || "", { size: L.size || 160, sizeMax: S.soloSize(L.size || 160, false, { maxLines: 3, lineHeight: skin.titleLine || 1.04, capFrac: 0.5 }), fg, hi, upper: L.upper, from: 0, align: L.align || "left", maxLines: 3, ground: ctx.ground, colPx: measure })}
      ${sub ? `<div data-in="rise" data-i="4" style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(fitPx(sub, 32, 82))};color:${rgba(fg, 0.7)};margin-top:${X(34)};max-width:${X(Math.round(measure * 0.9))};line-height:1.45;${L.align === "center" ? "margin-left:auto;margin-right:auto;" : ""}">${esc(sub)}</div>` : ""}
      ${attribution && !sub ? `<div data-in="rise" data-i="4" style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(32)};color:${hi};margin-top:${X(26)};">${esc(attribution)}</div>` : ""}
    </div>`;
    if (!asset) return { html: `${open(ctx)}${wideSolo(copy, 0.78)}${close()}` };
    // Height as a share of the AUTHORED stage height, expressed through X() like every other
    // height in this engine (cqw is the only definite unit inside an auto-height parent).
    const card = `<div data-in="item" data-i="3" style="width:100%;height:${X(boxOf(skin, "statement", COL, Math.round(S.RH * 0.52)).h)};">
      ${S.frameHtml(theme, skin, { device: "card", asset, tint: hi, cardV: "frame", radius: 24 })}
    </div>`;
    return { html: `${open(ctx)}${wideRow(copy, card, { lead })}${close()}` };
  }

  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(asset ? Math.min(L.top || 630, 420) : (L.top || 630))};text-align:${L.align || "left"};">
      ${title(theme, skin, scene.headline || scene.title || "", { size: L.size || 160, sizeMax: S.soloSize(L.size || 160, !!asset, { maxLines: asset ? 3 : 4, lineHeight: skin.titleLine || 1.04 }), fg, hi, upper: L.upper, from: 0, align: L.align || "left", maxLines: asset ? 3 : 4, ground: ctx.ground })}
      ${sub ? `<div data-in="rise" data-i="4" style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(fitPx(sub, 35, 100))};color:${rgba(fg, 0.7)};margin-top:${X(42)};max-width:${X(700)};line-height:1.45;${L.align === "center" ? "margin-left:auto;margin-right:auto;" : ""}">${esc(sub)}</div>` : ""}
      ${attribution && !sub ? `<div data-in="rise" data-i="4" style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(34)};color:${hi};margin-top:${X(32)};">${esc(attribution)}</div>` : ""}
    </div>
    ${frame}
  ${close()}`;
  return { html };
}

// FEATURE — the hero media card plus a row of chips. `cfg.media === false` turns it into
// the source's typographic variant: three big underlined lines instead of a picture.
function bFeature(scene, ctx, sceneAssets) {
  const { theme, skin, Str } = ctx;
  const L = ctx.look.feature;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN);
  const chips = featureLines(scene, 3);
  const chipCols = (L.chips.colors || ["accent"]).map((k) => col(theme, k));
  const fill = col(theme, L.chips.text);
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const scrollId = `${ctx.id}-scroll`;
  const head = title(theme, skin, scene.headline || scene.title || Str.featureKicker, { size: L.size || 104, fg, hi, upper: L.upper, from: 0, maxLines: 2, ground: ctx.ground });

  if (skin.media === false) {
    const lines = chips.length ? chips : [Str.featureKicker];
    return {
      html: `${open(ctx)}
      <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(L.top || 250)};">
        ${head}
        <div style="margin:${X(52)} 0 ${X(10)};display:flex;flex-direction:column;gap:${X(30)};">
          ${lines.map((c, i) => `<div data-in="item" data-i="${i + 2}" style="font-family:${theme.displayStack};font-size:${F(74)};line-height:1.05;color:${i === 1 ? hi : fg};border-bottom:${X(3)} solid ${rgba(i === 1 ? hi : fg, 0.5)};padding-bottom:${X(22)};">${esc(c)}</div>`).join("")}
        </div>
      </div>
    ${close()}`,
    };
  }
  const rad = L.card && L.card.r != null ? L.card.r : 28;

  if (WIDE) {
    // The hero card leads on the left and the copy answers on the right — the reverse of the
    // portrait stack, and the arrangement a product shot actually wants at 16:9.
    const { lead, cardW, cardH } = wideFeatureBox(skin);
    const measure = wideCol(1 - lead);
    const wplan = S.scrollPlan(cardW, cardH, asset);
    const media = `<div data-in="item" data-i="2" style="width:100%;height:${X(cardH)};border-radius:${X(rad)};padding:${X(12)};background:${col(theme, L.card && L.card.bg)};box-shadow:0 ${X(24)} ${X(52)} rgba(10,10,12,0.36);">
        <div style="position:relative;width:100%;height:100%;border-radius:${X(Math.max(6, rad - 10))};overflow:hidden;background:${rgba(hi, 0.14)};">
          ${S.plate(theme, { asset, scrollId: wplan.frac ? scrollId : null, natH: wplan.natH, tint: hi })}
        </div>
      </div>`;
    const copy = `<div>
        ${title(theme, skin, scene.headline || scene.title || Str.featureKicker, { size: L.size || 104, fg, hi, upper: L.upper, from: 0, maxLines: 3, ground: ctx.ground, colPx: measure })}
        <div style="display:flex;flex-wrap:wrap;gap:${X(14)};margin-top:${X(32)};justify-content:${L.chips.center ? "center" : "flex-start"};">
          ${chips.map((c, i) => `<span data-in="item" data-i="${i + 4}" style="padding:${X(13)} ${X(24)};font-family:${theme.bodyStack};font-weight:800;font-size:${F(26)};white-space:nowrap;max-width:${X(measure)};overflow:hidden;text-overflow:ellipsis;${chipCss(L.chips.v, chipCols[i % chipCols.length], fill, i)}">${esc(c)}</span>`).join("")}
        </div>
      </div>`;
    return {
      html: `${open(ctx)}${wideRow(media, copy, { lead })}${close()}`,
      scroll: wplan.frac ? { id: scrollId, frac: wplan.frac } : null,
    };
  }

  const plan = S.scrollPlan(936, 588, asset);
  const media = `<div data-in="item" data-i="2" style="${cardCss(L, theme, skin)}">
      <div style="position:relative;width:100%;height:100%;border-radius:${X(Math.max(6, rad - 10))};overflow:hidden;background:${rgba(hi, 0.14)};">
        ${S.plate(theme, { asset, scrollId: plan.frac ? scrollId : null, natH: plan.natH, tint: hi })}
      </div>
    </div>`;
  return {
    html: `${open(ctx)}
      <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(L.top || 250)};">
        ${head}
        ${media}
        <div style="display:flex;flex-wrap:wrap;gap:${X(16)};justify-content:${L.chips.center ? "center" : "flex-start"};">
          ${chips.map((c, i) => `<span data-in="item" data-i="${i + 4}" style="padding:${X(14)} ${X(27)};font-family:${theme.bodyStack};font-weight:800;font-size:${F(27)};white-space:nowrap;max-width:${X(820)};overflow:hidden;text-overflow:ellipsis;${chipCss(L.chips.v, chipCols[i % chipCols.length], fill, i)}">${esc(c)}</span>`).join("")}
        </div>
      </div>
    ${close()}`,
    scroll: plan.frac ? { id: scrollId, frac: plan.frac } : null,
  };
}

// MONTAGE — the 2x2 tile wall, each tile rotated by the pack's own tilt list. Short walls
// degrade to the pack's colour blocks rather than empty holes.
function bMontage(scene, ctx, sceneAssets) {
  const { theme, skin, Str } = ctx;
  const L = ctx.look.montage;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN);
  const tilts = L.tilts || [-3, 2.5, 2, -2.5];
  const tbg = col(theme, L.tile.bg), tlabel = col(theme, L.tile.label);
  const rad = L.tile.r == null ? 22 : L.tile.r;
  const shots = (sceneAssets || []).slice(0, 4);
  // THE WALL IS AS WIDE AS THE PICTURES, NOT AS WIDE AS THE COPY.
  //
  // `n` used to be max(shots, labels): the tile count came from how many FEATURE LINES the
  // script happened to yield, and when it yielded fewer than two the beat fell back to four
  // generic names ("Home/Detail/Mobile/Dashboard") which then set n = 4. Measured on job
  // zwq8nrrpht (alpine-post, 9:16): scenes with 2, 1 and 2 assets each drew FOUR tiles, so
  // seven of twelve tiles rendered as flat rgba(hi) blocks — the "purple placeholders" the
  // reviewer blocked on — under labels naming screens ("MOBILE", "DASHBOARD") that a
  // note-taking app does not have. Both halves of that came from this one line.
  //
  // The count is now the number of pictures actually in hand. `single` (below) already
  // renders one taller column for n <= 2, so two assets now produce two LARGE plates rather
  // than a half-empty grid — that layout existed all along and was simply unreachable.
  // THE WALL IS AS WIDE AS THE SCENE SAYS, NOT AS WIDE AS THE PICTURES IN HAND.
  //
  // `min(shots.length, 4)` meant a montage with no assets drew nothing (and was downgraded to a
  // single-plate Feature upstream), where the reference always draws its four captioned slots —
  // the audit's second-biggest bucket, 35 of 48 packs. But the earlier `max(shots, labels)` was
  // removed for a real reason: `labels` then fell back to the GENERIC set ("Home/Detail/Mobile/
  // Dashboard"), so packs drew four flat placeholder blocks captioned with screens the product does
  // not have.
  //
  // The distinction both laws need is AUTHORED vs FABRICATED. `mediaTiles` is non-empty only when
  // the scene really named its own tiles, so it — never the generic fallback — may set the count,
  // and the empty slots draw the designed wireframe plate rather than a flat tint. Parity on the
  // grid geometry, and still never an empty container.
  // Labels only when the script really named the features. The generic set stays for the
  // media-less branch below, where the tiles ARE the content; over pictures a fabricated
  // caption is worse than none.
  const labels = featureLines(scene, 4);
  const tiles = (labels.length >= 2 ? labels : (Str.tiles || ["Home", "Detail", "Mobile", "Dashboard"])).slice(0, 4);
  const mediaTiles = labels.length >= 2 ? labels.slice(0, 4) : [];
  const n = Math.min(4, Math.max(shots.length, mediaTiles.length >= 2 ? mediaTiles.length : 0));
  const glow = L.tile.glow ? col(theme, L.tile.glow) : null;

  if (skin.media === false) {
    return {
      html: `${open(ctx)}
      <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(L.top || 258)};">
        ${title(theme, skin, scene.headline || scene.title || "", { size: L.size || 102, fg, hi, upper: L.upper, maxLines: 2, ground: ctx.ground })}
        <div style="margin-top:${X(54)};display:grid;grid-template-columns:1fr 1fr;gap:${X(26)};">
          ${tiles.slice(0, 4).map((label, i) => `<div data-in="item" data-i="${i + 2}" style="transform:rotate(${tilts[i % tilts.length]}deg);"><div style="height:${X(250)};border-radius:${X(rad)};background:${tbg};display:flex;align-items:center;justify-content:center;font-family:${theme.displayStack};font-size:${F(52)};color:${tlabel};${L.upper ? "text-transform:uppercase;" : ""}padding:${X(16)};text-align:center;line-height:1.05;">${esc(shortLabel(label, 30))}</div></div>`).join("")}
        </div>
      </div>
    ${close()}`,
    };
  }
  // A single column when there are only one or two tiles — a 2x2 grid half-empty reads as a
  // bug, a taller single column reads as a choice.
  //
  // WIDE never takes that branch: at 16:9 the wall runs ACROSS in one row of `n`, which is both
  // the shape the frame offers and the reason a landscape montage does not need the
  // one-tall-column rescue in the first place.
  const single = WIDE ? false : n <= 2;
  const gridCols = WIDE ? `repeat(${Math.max(1, n)},1fr)` : (single ? "1fr" : "1fr 1fr");
  return {
    html: `${open(ctx)}
      <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(L.top || 258)};">
        ${title(theme, skin, scene.headline || scene.title || "", { size: L.size || 102, fg, hi, upper: L.upper, maxLines: 2, ground: ctx.ground, colPx: WIDE ? Math.round(COL * 0.72) : null })}
        <div style="margin-top:${X(WIDE ? 38 : 54)};display:grid;grid-template-columns:${gridCols};gap:${X(WIDE ? 22 : 26)};">
          ${Array.from({ length: n }).map((_, i) => {
            const a = shots[i] || null;
            const label = shortLabel(mediaTiles[i] || "", 30);
            // THE CARD TAKES THE PICTURE'S SHAPE, NOT THE OTHER WAY ROUND.
            //
            // plate() fits a website capture with object-fit:contain — deliberately, because
            // cropping a UI screenshot cuts off the thing the shot exists to show. But a
            // PORTRAIT phone capture inside a full-width landscape card then contains into a
            // narrow strip with two thirds of the card painted in its own tint, which is what
            // the reported render shows on the HOME tile. Neither stretching nor cropping is
            // the fix: the card is what should move. In the single column there is room to
            // give each plate the aspect of the asset it holds — a phone shot gets a phone-
            // shaped card, centred; a dashboard keeps the full width. Nothing is cropped,
            // nothing is stretched, and no tinted dead area is left over.
            const budget = n === 1 ? 620 : 500;             // vertical room per plate, under a 2-line title
            const ratio = a && Number(a.ratio) > 0 ? Number(a.ratio)
              : (a && Number(a.width) > 0 && Number(a.height) > 0 ? Number(a.width) / Number(a.height) : 0);
            // In a wide row the tiles share the width, so their height comes from the frame's
            // remaining vertical room rather than from the portrait budget.
            const cardH = WIDE ? Math.round(S.RH * 0.44) : (single ? budget : 292);
            // Width follows the ratio only when the asset is TALLER than the full-width card
            // would be; a landscape asset keeps the whole column as before.
            const natW = single && ratio > 0 ? Math.round(budget * ratio) : COL;
            const cardW = single ? Math.max(Math.round(COL * 0.42), Math.min(COL, natW)) : COL;
            const centred = single && cardW < COL;
            return `<div data-in="item" data-i="${i + 2}" style="transform:rotate(${tilts[i % tilts.length]}deg);${centred ? `width:${X(cardW)};margin-left:auto;margin-right:auto;` : ""}">
              <div style="height:${X(cardH)};border-radius:${X(rad)};background:${tbg};padding:${X(11)};${glow ? `border:1px solid ${rgba(glow, 0.55)};box-shadow:0 0 ${X(26)} ${rgba(glow, 0.2)};` : `box-shadow:0 ${X(20)} ${X(44)} rgba(10,10,12,0.3);`}">
                <div style="position:relative;width:100%;height:100%;border-radius:${X(Math.max(4, rad - 9))};overflow:hidden;background:${rgba(hi, 0.16)};">
                  ${S.plate(theme, { asset: a, tint: hi })}
                </div>
              </div>
              ${label ? `<div style="font-family:${theme.displayStack};font-size:${F(L.tile.labelSize || 28)};color:${tlabel};margin-top:${X(13)};text-align:center;${L.upper ? "text-transform:uppercase;" : ""}">${esc(label)}</div>` : ""}
            </div>`;
          }).join("")}
        </div>
      </div>
    ${close()}`,
  };
}

// STATS — up to three counting figures with labels, optionally ruled and glowing. The
// counters are a scrubbed numeric proxy so a seek to any time shows the right number, and
// the element's RESTING text is already the final value.
function bStats(scene, ctx, sceneAssets) {
  const { theme, skin, Str } = ctx;
  const L = ctx.look.stats;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN);
  const cols = (L.cols || ["accent"]).map((k) => col(theme, k));
  const stats = pickStats(scene, 3, Str);
  const asset = (skin.media === false ? null : (sceneAssets && sceneAssets[0])) || null;
  // The counters carry the beat when there is no capture behind them, so they grow into the
  // space the backing plate would have filled — the reviewer's own note was "scale up counter
  // component to fill 60% width". Same rule as the headline: this raises a ceiling, it does
  // not force a size. The row is `white-space:nowrap` with a bounded label column, so a long
  // number still cannot push the label out of the frame.
  // THE NUMERAL IS `nowrap`, SO IT MUST BE MEASURED, NOT JUST CAPPED.
  //
  // The stat row is [figure][label] on one baseline and the figure is `white-space:nowrap`, so its
  // size cannot be chosen from a vertical budget alone: `soloSize` grew a four-digit figure until
  // "1,290m" spanned the full frame and pushed its label off the right edge — the numeric twin of
  // the headline-clipping defect, and it got worse once labels stopped being truncated. Size the
  // figure against the width its row actually leaves: the content column minus the label column
  // and the gap, using the display face's real advances.
  const LABEL_COL = 440, ROW_GAP = 30;
  const widestFig = stats.reduce((a, st) => {
    const t = `${st.pre}${S.groupNum(st.target)}${st.suf || ""}`;
    return S.advanceOf(t, skin) > S.advanceOf(a, skin) ? t : a;
  }, "");
  const figRoom = Math.max(120, COL - (stats.some((st) => st.label) ? LABEL_COL + ROW_GAP : 0));
  const figCap = widestFig ? Math.floor(figRoom / Math.max(0.5, S.advanceOf(widestFig, skin))) : (L.num || 156);
  // ...AND THE ROWS SHARE ONE VERTICAL BUDGET.
  //
  // `soloSize` grows the figure into the space a backing capture would have filled, and it was
  // asked for that space as if the deck were ONE row. A three-row deck therefore claimed it three
  // times over: loom-and-weft's "9,523 / 41hr / 3" rendered half again as large as the reference
  // and drove the last label down into the loom threads the World draws across the bottom of the
  // frame. Divide the budget by the rows that actually share it, which suppresses growth entirely
  // at three rows (where the reference has no room to spare either) and keeps it at one.
  const num = Math.min(figCap, S.soloSize(L.num || 156, !!asset, { maxLines: Math.max(1, stats.length), lineHeight: 0.9, capFrac: 0.17 }));
  // NEVER INVENT A NUMBER. This used to fall back to `{ target: 100, suf: "%", label: "Metric" }`
  // when the scene carried no measurable figure — and it shipped: job o9q96ik3ra (tube-and-glow,
  // linktr.ee) drew "100%" beside "Metric", counting up, on a beat whose authored copy was
  // "DEEP ANALYTICS / Track clicks, traffic, and total sales". There is no 100% anywhere in that
  // film. An empty container is a defect; a container filled with a fabricated statistic about a
  // real company is a worse one, because it reads as fact.
  //
  // The routing in film_stage now sends a figureless scene to a text beat, so this is the
  // belt-and-braces: with no stat, draw no stat. The headline and body still carry the beat.
  const rows = stats.map((st, i) => {
    const c = cols[i % cols.length];
    return `<div data-in="rise" data-i="${i + 2}" style="display:flex;align-items:baseline;gap:${X(30)};${L.rule ? `border-bottom:${X(4)} solid ${c};padding-bottom:${X(24)};` : ""}">
      <div style="font-family:${theme.displayStack};font-size:${F(num)};line-height:0.9;color:${c};font-variant-numeric:tabular-nums;${L.glowNums ? `text-shadow:0 0 ${X(36)} ${rgba(c, 0.5)};` : ""}white-space:nowrap;"><span data-count="${st.target}" data-suffix="${esc(st.suf || "")}" data-pre="${esc(st.pre || "")}" data-group="1">${esc(st.pre)}${S.groupNum(st.target)}${esc(st.suf || "")}</span></div>
      <div style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(33)};color:${rgba(fg, 0.76)};max-width:${X(440)};line-height:1.35;">${esc(st.label)}</div>
    </div>`;
  }).join("");
  // A proof beat the director assigned a capture to should SHOW it — dimmed, behind the
  // counters, the way a proof scene is shot in any real product film.
  const backing = asset ? S.backingPlate(asset, V(700), X(900)) : "";
  return {
    html: `${open(ctx)}
      ${backing}
      <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(L.top || 410)};">
        ${title(theme, skin, scene.headline || scene.title || Str.statsKicker, { size: L.size || 102, sizeMax: S.soloSize(L.size || 102, !!asset, { maxLines: 2, lineHeight: skin.titleLine || 1.04 }), fg, hi, upper: L.upper, maxLines: 2, ground: ctx.ground })}
        <div style="margin-top:${X(62)};display:flex;flex-direction:column;gap:${X(L.rule ? 42 : 52)};">${rows}</div>
      </div>
    ${close()}`,
  };
}

// CTA — the logo lockup, the closing line, the button and the address.
function bCta(scene, ctx, _sceneAssets, logo) {
  const { theme, skin, Str } = ctx;
  const L = ctx.look.cta;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN);
  const bbg = col(theme, L.btn.bg);
  // THE BUTTON IS THE ONE PIECE OF TYPE THAT NEVER MET THE CONTRAST MACHINERY.
  //
  // `fg` and `hi` above go through ink() -> theme.typeOn(colour, ground), which returns the
  // authored colour at ratio >= 3 and the field's own readable ink otherwise. The button took
  // BOTH its background and its label straight from the skin with col(), so nothing ever
  // compared the label against the pill it sits on — and unlike the headline it does not even
  // sit on `ground`, so the ground-based guard would not have covered it anyway. On job
  // zwq8nrrpht that shipped "TRY GEMINI NOTEBOOK" below the readable threshold and the
  // reviewer blocked on it. Judge the label against its OWN background, which is the surface
  // it is actually drawn on.
  const bc = theme.typeOn(col(theme, L.btn.c), bbg);
  const center = (L.align || "center") === "center";
  const btnV = L.btn.v === "block" ? `border-radius:${X(10)};`
    : L.btn.v === "glow" ? `border-radius:${X(12)};box-shadow:0 0 ${X(52)} ${rgba(bbg, 0.55)};`
      : `border-radius:999px;box-shadow:0 ${X(22)} ${X(54)} rgba(10,10,12,0.35);`;
  const shape = L.logoShape === "rounded" ? X(20) : "999px";
  // NEVER DRAW AN EMPTY CONTAINER: with no logo the lockup disc is dropped entirely rather
  // than drawn around nothing.
  const lock = logo && logo.path
    ? `<div data-in="item" data-i="0" style="width:${X(148)};height:${X(148)};border-radius:${shape};overflow:hidden;background:${rgba(fg, 0.08)};margin:${center ? `0 auto ${X(42)}` : `0 0 ${X(42)}`};display:flex;align-items:center;justify-content:center;">
         <img src="${esc(logo.path)}" alt="${esc(logo.alt || "logo")}" style="width:100%;height:100%;object-fit:contain;display:block;">
       </div>`
    : "";
  const cta = String(scene.cta || Str.ctaButton);
  // The url line under the button is a CLAIM, not set dressing: print it only when a real
  // address is known (the job's own site, or a non-stock asset host). The decorative default
  // ("yourproduct.com") is never printed anywhere: under a Get-Started button it reads as the place
  // to go, and inside a device frame's address pill it reads as an unfinished template. The pill
  // itself is scenery; its TEXT is a claim (see ctx.realAddress in film_stage).
  const url = ctx.address && ctx.address !== Str.addressBar ? ctx.address : "";
  return {
    html: `${open(ctx)}
      <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(L.top || 470)};text-align:${center ? "center" : "left"};">
        ${lock}
        ${title(theme, skin, scene.headline || scene.title || Str.ctaTagline, { size: L.size || 126, fg, hi, upper: L.upper, from: 1, align: center ? "center" : "left", maxLines: 3, ground: ctx.ground })}
        <div data-in="item" data-i="4" style="display:inline-flex;align-items:center;gap:${X(15)};margin-top:${X(52)};padding:${X(26)} ${X(54)};font-family:${theme.displayStack};font-size:${F(43)};background:${bbg};color:${bc};${btnV}">
          ${esc(cta)}
          <svg width="${X(34)}" height="${X(34)}" viewBox="0 0 24 24" fill="none" stroke="${bc}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>
        </div>
        ${url ? `<div data-in="rise" data-i="5" style="font-family:${theme.bodyStack};font-weight:800;font-size:${F(35)};color:${fg};margin-top:${X(42)};">${esc(url)}</div>` : ""}
      </div>
    ${close()}`,
  };
}

// ============================ THE TEN INTERACTION BEATS ============================
// Each returns a `mech` descriptor; film_runtime recomputes its state on every seek.

// TYPING — caret / terminal / typewriter / hand.
function bTyping(scene, ctx, _a, _logo, variant) {
  const { theme, skin, Str } = ctx;
  const L = ctx.look.app;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN), line = col(theme, L.line);
  const v = variant || "caret";
  const text = String(scene.subtext || featureLines(scene, 1)[0] || scene.headline || "").slice(0, 120);
  const prompt = scene.kicker || Str.featureKicker;
  const stamp = Str.stamp;
  const id = ctx.id;
  const mech = { kind: "typing", id, v, lines: [text], total: text.length, a: 0.1, b: 0.78 };

  if (v === "terminal") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="${panelCss(ctx, 480, `background:#10131a;border:1px solid ${rgba(hi, 0.4)};padding:${X(40)};`)}">
          ${prompt ? `<div style="font-family:${theme.monoStack};font-size:${F(24)};color:rgba(154,164,178,0.7);margin-bottom:${X(26)};">${esc("# " + prompt)}</div>` : ""}
          <div style="font-family:${theme.monoStack};font-size:${F(34)};line-height:1.6;color:#e6edf3;word-break:break-word;">
            <span style="color:${hi};">$ </span><span id="${id}-l0">${esc(text)}</span><span id="${id}-c0" style="color:${hi};">█</span>
          </div>
          <div id="${id}-out" style="font-family:${theme.monoStack};font-size:${F(30)};color:#27c93f;margin-top:${X(30)};opacity:1;">${esc("› " + stamp)}</div>
        </div>`),
      mech,
    };
  }
  if (v === "typewriter") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2">
          ${prompt ? `<div style="font-family:${theme.bodyStack};font-weight:800;font-size:${F(24)};letter-spacing:.2em;color:${rgba(fg, 0.55)};margin-bottom:${X(34)};">${esc(prompt)}</div>` : ""}
          <div style="font-family:${theme.displayStack};font-size:${F(76)};line-height:1.3;color:${fg};min-height:${X(400)};word-break:break-word;"><span id="${id}-l0">${esc(text)}</span><span id="${id}-c0" style="color:${hi};">_</span></div>
          <div id="${id}-out" style="display:inline-block;padding:${X(12)} ${X(28)};border:${X(4)} double ${hi};color:${hi};font-family:${theme.displayStack};font-size:${F(36)};transform:rotate(-2deg);margin-top:${X(24)};opacity:1;">${esc(stamp)}</div>
        </div>`),
      mech,
    };
  }
  if (v === "hand") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2">
          ${prompt ? `<div style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(25)};letter-spacing:.14em;color:${rgba(fg, 0.55)};margin-bottom:${X(34)};">${esc(prompt)}</div>` : ""}
          <div style="display:flex;flex-wrap:wrap;gap:${X(10)} ${X(22)};min-height:${X(380)};align-content:flex-start;">
            ${text.split(/\s+/).filter(Boolean).map((w, i) => `<span data-in="item" data-i="${i + 3}" style="font-family:${theme.displayStack};font-size:${F(82)};line-height:1.15;color:${i % 4 === 2 ? hi : fg};display:inline-block;transform:rotate(${i % 2 ? 2 : -2.6}deg);">${esc(w)}</span>`).join("")}
          </div>
          <div id="${id}-out" style="display:inline-block;margin-top:${X(26)};font-family:${theme.displayStack};font-size:${F(40)};color:${hi};border-bottom:${X(6)} solid ${hi};padding-bottom:${X(6)};transform:rotate(-1.5deg);opacity:1;">${esc(stamp)}</div>
        </div>`),
      // The hand variant reveals whole WORDS as staggered elements, not characters, so it
      // needs no per-frame budget — the entrance stagger is the mechanic.
      mech: null,
    };
  }
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div data-in="item" data-i="2">
        ${prompt ? `<div style="font-family:${theme.bodyStack};font-weight:800;font-size:${F(25)};letter-spacing:.18em;color:${rgba(fg, 0.55)};margin-bottom:${X(30)};">${esc(prompt)}</div>` : ""}
        <div style="font-family:${theme.displayStack};font-size:${F(84)};line-height:1.14;color:${fg};min-height:${X(420)};border-left:${X(10)} solid ${hi};padding-left:${X(40)};word-break:break-word;"><span id="${id}-l0">${esc(text)}</span><span id="${id}-c0" style="color:${hi};">|</span></div>
        <div id="${id}-out" style="display:inline-block;margin-top:${X(40)};padding:${X(14)} ${X(30)};border:${X(4)} solid ${hi};border-radius:${X(12)};color:${hi};font-family:${theme.displayStack};font-size:${F(38)};transform:rotate(-3deg);opacity:1;">${esc(stamp)}</div>
      </div>`),
    mech,
  };
}

// CODE — editor / terminal / diff. The lines are the scene's own bullet copy rendered as
// code, so the beat is about THIS film rather than a lorem snippet.
function bCode(scene, ctx, _a, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN);
  const v = variant || "editor";
  const id = ctx.id;
  const raw = featureLines(scene, 4);
  const lines = (raw.length ? raw : [String(scene.subtext || scene.headline || "").slice(0, 48)]).map((s) => shortLabel(s, 42));
  const total = lines.reduce((a, l) => a + l.length, 0) || 1;
  const out = Str.stamp;
  const mech = { kind: "code", id, v, lines, total, a: 0.08, b: v === "editor" ? 0.72 : 0.7 };

  if (v === "diff") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="${panelCss(ctx, 700, `background:#10131a;border:1px solid ${rgba(hi, 0.4)};`)}">
          <div style="font-family:${theme.monoStack};font-size:${F(22)};color:rgba(154,164,178,0.6);margin-bottom:${X(22)};">${esc(`● changes (${lines.length})`)}</div>
          ${lines.map((ln, i) => {
            const add = i % 2 === 0;
            const c = add ? "#3fb950" : "#e6edf3";
            const bg = add ? "rgba(63,185,80,0.12)" : "transparent";
            return `<div data-in="machete" data-i="${i}" style="font-family:${theme.monoStack};font-size:${F(29)};line-height:1.8;color:${c};background:${bg};padding:${X(2)} ${X(14)};border-radius:${X(6)};white-space:pre-wrap;word-break:break-word;">${esc((add ? "+ " : "  ") + ln)}</div>`;
          }).join("")}
          <div id="${id}-out" style="display:inline-block;margin-top:${X(28)};padding:${X(12)} ${X(26)};border-radius:${X(8)};background:${rgba(hi, 0.16)};border:1px solid ${hi};color:${hi};font-family:${theme.monoStack};font-size:${F(27)};opacity:1;">${esc(out)}</div>
        </div>`),
      mech: null,       // the diff reveals whole rows on a stagger, not per character
    };
  }
  if (v === "terminal") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="${panelCss(ctx, 700, `background:#0c0f14;border:1px solid ${rgba(hi, 0.45)};padding:${X(40)};`)}">
          ${lines.map((ln, i) => `<div style="font-family:${theme.monoStack};font-size:${F(31)};line-height:1.9;color:#d8e2ec;white-space:pre-wrap;word-break:break-word;"><span style="color:${hi};">$ </span><span id="${id}-l${i}">${esc(ln)}</span><span id="${id}-c${i}" style="color:${hi};">█</span></div>`).join("")}
          <div id="${id}-out" style="font-family:${theme.monoStack};font-size:${F(31)};color:#27c93f;margin-top:${X(16)};opacity:1;">${esc("✔ " + out)}</div>
        </div>`),
      mech,
    };
  }
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div data-in="item" data-i="2" style="${panelCss(ctx, 700, `background:#10131a;border:1px solid ${rgba(hi, 0.4)};`)}">
        <div style="display:flex;gap:${X(10)};margin-bottom:${X(26)};">
          <span style="width:${X(16)};height:${X(16)};border-radius:999px;background:#ff5f56;"></span>
          <span style="width:${X(16)};height:${X(16)};border-radius:999px;background:#ffbd2e;"></span>
          <span style="width:${X(16)};height:${X(16)};border-radius:999px;background:#27c93f;"></span>
        </div>
        ${lines.map((ln, i) => `<div style="font-family:${theme.monoStack};font-size:${F(30)};line-height:1.75;color:#e6edf3;white-space:pre-wrap;word-break:break-word;"><span style="color:rgba(154,164,178,0.4);margin-right:${X(26)};">${String(i + 1).padStart(2, " ")}</span><span id="${id}-l${i}">${esc(ln)}</span><span id="${id}-c${i}" style="color:${hi};">█</span></div>`).join("")}
        <div id="${id}-out" style="display:inline-block;margin-top:${X(30)};padding:${X(12)} ${X(26)};border-radius:${X(8)};background:${rgba(hi, 0.16)};border:1px solid ${hi};color:${hi};font-family:${theme.monoStack};font-size:${F(27)};opacity:1;">${esc(out)}</div>
      </div>`),
    mech,
  };
}

// SCROLL — feed / board / ticker / stack.
function bScroll(scene, ctx, _a, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN), line = col(theme, L.line);
  const v = variant || "feed";
  const id = ctx.id;
  const src = featureLines(scene, 7);
  // The source's Scroll items are {t, v} PAIRS — a label and a right-hand value ("Ethiopia
  // Guji … $12.50"). KEYFRAME's storyboard flattens them into one line, so the pair is parsed
  // back out of the "label — value" / "label: value" shape; a line with no separator is a
  // label-only row, exactly as the source accepts bare strings.
  const pairs = (src.length ? src : fallbackLines(scene)).map((t) => {
    const parts = String(t).split(/\s+[—–]\s+|\s+-\s+|:\s+/);
    return parts.length > 1
      ? { t: shortLabel(parts[0], 30), v: shortLabel(parts.slice(1).join(" "), 14) }
      : { t: shortLabel(t, 34), v: "" };
  });
  const items = pairs.map((p2) => p2.t);

  if (v === "board") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="${panelCss(ctx, null, `padding:${X(26)} ${X(34)};`)}">
          ${pairs.slice(0, 7).map((it, i) => `<div id="${id}-r${i}" style="display:flex;align-items:center;gap:${X(22)};padding:${X(17)} 0;border-bottom:1px solid ${rgba(line, 0.12)};transform-origin:top;">
            <span style="font-family:${theme.monoStack};font-size:${F(26)};color:${hi};background:${rgba(hi, 0.12)};padding:${X(5)} ${X(12)};border-radius:${X(6)};flex:none;">${String(i + 1).padStart(2, "0")}</span>
            <span style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(31)};color:${line};flex:none;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(it.t)}</span>
            <span style="flex:1;border-bottom:${X(3)} dotted ${rgba(line, 0.3)};margin:0 ${X(6)};height:1px;"></span>
            ${it.v ? `<span id="${id}-v${i}" style="font-family:${theme.monoStack};font-size:${F(29)};color:${hi};flex:none;">${esc(it.v)}</span>` : ""}
          </div>`).join("")}
        </div>`),
      mech: { kind: "board", id, n: Math.min(pairs.length, 7) },
    };
  }
  if (v === "ticker") {
    const row = items.join("   •   ");
    const rep = `${row}   •   ${row}   •   ${row}`;
    const cols = [fg, hi, rgba(fg, 0.5)];
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div style="margin-top:${X(20)};display:flex;flex-direction:column;gap:${X(40)};overflow:hidden;">
          ${[0, 1, 2].map((k) => `<div id="${id}-t${k}" style="white-space:nowrap;font-family:${theme.displayStack};font-size:${F(66 - k * 8)};line-height:1.2;color:${cols[k]};">${esc(rep)}</div>`).join("")}
          <div data-in="rise" data-i="5" style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(30)};color:${rgba(fg, 0.65)};margin-top:${X(20)};">${esc(`${items.length} entries · live`)}</div>
        </div>`),
      mech: { kind: "ticker", id },
    };
  }
  if (v === "stack") {
    const n = Math.min(items.length, 5);
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="position:relative;height:${X(470)};">
          ${Array.from({ length: n }).map((_, i) => `<div id="${id}-card${i}" style="${panelCss(ctx, 360, `padding:${X(44)};`)}position:absolute;left:0;right:0;top:0;">
            <div style="font-family:${theme.displayStack};font-size:${F(56)};line-height:1.12;color:${line};">${esc(pairs[i].t)}</div>
            ${pairs[i].v ? `<div style="font-family:${theme.monoStack};font-size:${F(40)};color:${hi};margin-top:${X(26)};">${esc(pairs[i].v)}</div>` : ""}
          </div>`).join("")}
          <div id="${id}-count" style="position:absolute;bottom:0;left:0;font-family:${theme.monoStack};font-size:${F(26)};color:${rgba(fg, 0.6)};">1 / ${n}</div>
        </div>`),
      mech: { kind: "stack", id, n },
    };
  }
  const rowH = 118, viewH = 840;
  const inner = items.length * rowH;
  const travel = Math.max(0, inner - (viewH - 60));
  const thumb = Math.max(14, ((viewH - 60) / Math.max(inner, 1)) * 100);
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div data-in="item" data-i="2" style="${panelCss(ctx, viewH)}">
        <div style="position:absolute;top:${X(30)};bottom:${X(30)};left:${X(30)};right:${X(60)};overflow:hidden;">
          <div id="${id}-inner" style="will-change:transform;">
            ${pairs.map((it, i) => `<div style="height:${X(rowH)};display:flex;align-items:center;gap:${X(26)};border-bottom:1px solid ${rgba(line, 0.14)};">
              <span style="font-family:${theme.displayStack};font-size:${F(30)};color:${hi};width:${X(66)};flex:none;">${String(i + 1).padStart(2, "0")}</span>
              <span style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(32)};color:${line};flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(it.t)}</span>
              ${it.v ? `<span style="font-family:${theme.displayStack};font-size:${F(30)};color:${rgba(line, 0.65)};flex:none;">${esc(it.v)}</span>` : ""}
            </div>`).join("")}
          </div>
        </div>
        <div style="position:absolute;top:${X(30)};bottom:${X(30)};right:${X(22)};width:${X(10)};border-radius:999px;background:${rgba(line, 0.12)};">
          <div id="${id}-thumb" style="position:absolute;left:0;right:0;border-radius:999px;background:${hi};height:${r(thumb)}%;top:0;"></div>
        </div>
      </div>`),
    mech: { kind: "scroll", id, travel: Math.round(travel), thumb: r(thumb) },
  };
}

// RING — ring / gauge / bar. One eased sweep to a target read out of the scene's own copy.
function bRing(scene, ctx, _a, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN);
  const v = variant || "ring";
  const id = ctx.id;
  // pickStats FIRST, because it is the only reader that returns the figure's own LABEL.
  //
  // This called pickNumber, whose result has no `label` field at all — so the `picked.label`
  // fallback below could never fire and the beat's second line could only come from
  // `scene.emphasis`. The reference's Ring carries `label` as its own authored field
  // ("43:12 ON THE CLOCK", beside the 72% numeral), so ours simply never drew it. pickStats parses
  // the label off the figure line, which is exactly where the storyboard puts it.
  const deck = S.pickStats(scene, 1, Str);
  const picked = deck[0] || S.pickNumber(scene);
  // The NUMBER is the scene's real figure; the SWEEP is a share. They were one value, which
  // clamped "340kg" to 100 — now the arc/bar/needle run on `arc` (capped at 100) while the
  // read-out counts to the true target. (Routing already prefers the stats beat for non-share
  // figures; this keeps the gauge honest if one still lands here.)
  const to = picked ? clamp(picked.target, 1, 100000) : 100;
  const arc = clamp(to, 1, 100);
  const unit = picked && picked.suf ? picked.suf : "%";
  // The reference's gauge shows no label at all, and its ring/bar labels are a DISTINCT field.
  // Falling back to `subtext` printed the same sentence twice (label + sub); prefer emphasis
  // and drop the label whenever it would echo the sub.
  const sub = String(scene.subtext || "").slice(0, 110);
  const rawLabel = shortLabel(scene.emphasis || (picked && picked.label) || "", 34);
  const label = rawLabel && rawLabel.toLowerCase() !== sub.slice(0, rawLabel.length + 2).toLowerCase() ? rawLabel : "";
  const numHtml = `<div style="font-family:${theme.displayStack};font-size:${F(130)};color:${fg};font-variant-numeric:tabular-nums;line-height:1;"><span id="${id}-n" data-group="1">${S.groupNum(to)}</span><span style="font-size:${F(64)};color:${hi};">${esc(unit)}</span></div>`;

  if (v === "gauge") {
    const arcLen = Math.PI * 220;
    // Reference geometry: the five dial ticks, and the number LOCKUP hanging below the arc
    // (absolute bottom:-76 of the 560x340 viz) with the outer column's gap 180 clearing it —
    // not a flowed block after the svg.
    const ticks = [0, 1, 2, 3, 4].map((i) => {
      const a = ((-180 + i * 45) * Math.PI) / 180;
      return `<line x1="${r(280 + Math.cos(a) * 250)}" y1="${r(300 + Math.sin(a) * 250)}" x2="${r(280 + Math.cos(a) * 232)}" y2="${r(300 + Math.sin(a) * 232)}" stroke="${rgba(fg, 0.35)}" stroke-width="4"/>`;
    }).join("");
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="display:flex;flex-direction:column;align-items:center;margin-top:${X(30)};gap:${X(180)};">
          <div style="position:relative;width:${X(560)};height:${X(340)};">
            <svg width="100%" height="100%" viewBox="0 0 560 340" style="position:absolute;inset:0;overflow:visible;">
              <path d="M 60 300 A 220 220 0 0 1 500 300" fill="none" stroke="${rgba(fg, 0.15)}" stroke-width="30" stroke-linecap="round"/>
              <path id="${id}-arc" d="M 60 300 A 220 220 0 0 1 500 300" fill="none" stroke="${hi}" stroke-width="30" stroke-linecap="round" stroke-dasharray="${r(arcLen)}" stroke-dashoffset="${r(arcLen * (1 - arc / 100))}"/>
              ${ticks}
              <g id="${id}-needle" transform="rotate(${r(-90 + (arc / 100) * 180)} 280 300)">
                <line x1="280" y1="300" x2="280" y2="118" stroke="${fg}" stroke-width="8" stroke-linecap="round"/>
                <circle cx="280" cy="300" r="20" fill="${fg}"/>
              </g>
              <circle cx="280" cy="300" r="9" fill="${hi}"/>
            </svg>
            <div style="position:absolute;left:0;right:0;bottom:${X(-76)};text-align:center;">${numHtml}</div>
          </div>
          ${sub ? `<div data-in="rise" data-i="5" style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(33)};color:${rgba(fg, 0.72)};text-align:center;max-width:${X(720)};line-height:1.45;">${esc(sub)}</div>` : ""}
        </div>`),
      mech: { kind: "ring", id, v, to, arc, len: r(arcLen) },
    };
  }
  if (v === "bar") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="display:flex;align-items:center;gap:${X(56)};margin-top:${X(30)};">
          <div style="position:relative;width:${X(210)};height:${X(500)};flex:none;">
            <div style="position:absolute;top:${X(-22)};left:${X(65)};width:${X(80)};height:${X(22)};border-radius:${X(8)} ${X(8)} 0 0;background:${rgba(fg, 0.3)};"></div>
            <div style="position:absolute;inset:0;border:${X(5)} solid ${rgba(fg, 0.35)};border-radius:${X(28)};overflow:hidden;">
              <div id="${id}-bar" style="position:absolute;left:${X(8)};right:${X(8)};bottom:${X(8)};height:calc(${arc}% - 8px);min-height:${X(8)};border-radius:${X(18)};background:${hi};"></div>
            </div>
            ${[0.25, 0.5, 0.75].map((f, i) => `<div style="position:absolute;right:${X(-26)};bottom:${r(f * 100)}%;width:${X(18)};height:${X(4)};background:${rgba(fg, 0.35)};"></div>`).join("")}
          </div>
          <div>${numHtml}
            ${label ? `<div style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(30)};color:${rgba(fg, 0.65)};margin-top:${X(16)};">${esc(label)}</div>` : ""}
            ${sub ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(31)};color:${rgba(fg, 0.72)};max-width:${X(520)};line-height:1.45;margin-top:${X(20)};">${esc(sub)}</div>` : ""}
          </div>
        </div>`),
      mech: { kind: "ring", id, v, to, arc, len: 0 },
    };
  }
  const rr = 240, C = 2 * Math.PI * rr;
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div data-in="item" data-i="2" style="display:flex;flex-direction:column;align-items:center;margin-top:${X(30)};gap:${X(30)};">
        <div style="position:relative;width:${X(560)};height:${X(560)};">
          <svg width="100%" height="100%" viewBox="0 0 560 560" style="position:absolute;inset:0;">
            ${Array.from({ length: 12 }).map((_, i) => {
              const a = (i * Math.PI) / 6;
              return `<line x1="${r(280 + Math.cos(a) * 268)}" y1="${r(280 + Math.sin(a) * 268)}" x2="${r(280 + Math.cos(a) * 254)}" y2="${r(280 + Math.sin(a) * 254)}" stroke="${rgba(fg, 0.3)}" stroke-width="4"/>`;
            }).join("")}
            <circle cx="280" cy="280" r="${rr}" fill="none" stroke="${rgba(fg, 0.14)}" stroke-width="30"/>
            <circle id="${id}-arc" cx="280" cy="280" r="${rr}" fill="none" stroke="${hi}" stroke-width="30" stroke-linecap="round" stroke-dasharray="${r(C)}" stroke-dashoffset="${r(C * (1 - arc / 100))}" transform="rotate(-90 280 280)"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">${numHtml}
            ${label ? `<div style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(30)};color:${rgba(fg, 0.65)};margin-top:${X(14)};">${esc(label)}</div>` : ""}</div>
        </div>
        ${sub ? `<div data-in="rise" data-i="5" style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(33)};color:${rgba(fg, 0.72)};text-align:center;max-width:${X(720)};line-height:1.45;">${esc(sub)}</div>` : ""}
      </div>`),
    mech: { kind: "ring", id, v, to, arc, len: r(C) },
  };
}

// TOGGLE — switch / check / dial.
function bToggle(scene, ctx, _a, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN), line = col(theme, L.line), cardBg = col(theme, L.cardBg);
  const v = variant || "switch";
  const id = ctx.id;
  const src = featureLines(scene, 4);
  const items = (src.length ? src : fallbackLines(scene)).slice(0, 4).map((t) => shortLabel(t, 30));
  const mech = { kind: "toggle", id, v, n: items.length, on: hi, off: rgba(line, 0.22), onInk: line, offInk: rgba(line, 0.55) };

  if (v === "check") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div style="display:flex;flex-direction:column;gap:${X(24)};">
          ${items.map((label, i) => `<div data-in="item" data-i="${i + 2}" style="${panelCss(ctx, 116, `padding:0 ${X(34)};display:flex;align-items:center;gap:${X(28)};`)}">
            <div id="${id}-t${i}" style="width:${X(52)};height:${X(52)};border-radius:${X(12)};flex:none;border:${X(3)} solid ${hi};background:${hi};display:flex;align-items:center;justify-content:center;">
              <svg id="${id}-k${i}" width="60%" height="60%" viewBox="0 0 24 24" fill="none" stroke="${cardBg}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>
            </div>
            <span id="${id}-lb${i}" style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(33)};color:${line};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(label)}</span>
          </div>`).join("")}
        </div>`),
      mech: { ...mech, off: hi },
    };
  }
  if (v === "dial") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:${X(26)};">
          ${items.map((label, i) => `<div data-in="item" data-i="${i + 2}" style="${panelCss(ctx, 250, `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${X(18)};`)}">
            <div style="width:${X(104)};height:${X(104)};border-radius:999px;border:${X(6)} solid ${rgba(line, 0.25)};position:relative;background:${rgba(line, 0.05)};">
              <div id="${id}-k${i}" style="position:absolute;left:${X(43)};top:${X(6)};width:${X(6)};height:${X(34)};border-radius:${X(4)};background:${hi};transform-origin:${X(3)} ${X(40)};transform:rotate(${r(-120 + (150 + (i % 3) * 35))}deg);"></div>
            </div>
            <span style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(26)};color:${line};text-align:center;">${esc(label)}</span>
          </div>`).join("")}
        </div>`),
      mech,
    };
  }
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div style="display:flex;flex-direction:column;gap:${X(24)};">
        ${items.map((label, i) => `<div data-in="item" data-i="${i + 2}" style="${panelCss(ctx, 118, `padding:0 ${X(36)};display:flex;align-items:center;justify-content:space-between;gap:${X(20)};`)}">
          <span id="${id}-lb${i}" style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(33)};color:${line};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(label)}</span>
          <div id="${id}-t${i}" style="width:${X(104)};height:${X(56)};border-radius:999px;background:${hi};position:relative;flex:none;">
            <div id="${id}-k${i}" style="position:absolute;top:${X(7)};left:${X(7)};width:${X(42)};height:${X(42)};border-radius:999px;background:#fff;box-shadow:0 ${X(3)} ${X(8)} rgba(0,0,0,0.3);transform:translateX(${X(48)});"></div>
          </div>
        </div>`).join("")}
      </div>`),
    mech,
  };
}

// NOTIFY — drop / side / pop.
function bNotify(scene, ctx, _a, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN), line = col(theme, L.line), cardBg = col(theme, L.cardBg);
  const v = variant || "drop";
  const id = ctx.id;
  const src = featureLines(scene, 3);
  const notes = (src.length ? src : fallbackLines(scene)).slice(0, 3).map((t) => {
    const parts = String(t).split(/\s+[—–-]\s+|:\s+/);
    return parts.length > 1 ? [shortLabel(parts[0], 32), shortLabel(parts.slice(1).join(" "), 40)] : [shortLabel(t, 32), ""];
  });
  const rots = [-3, 2.5, -1.5];
  const mech = { kind: "notify", id, v, n: notes.length, rot: rots };

  if (v === "side") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div style="display:flex;flex-direction:column;gap:${X(26)};">
          ${notes.map((nt, i) => `<div id="${id}-n${i}" style="${panelCss(ctx, 158, `padding:${X(24)} ${X(32)} ${X(18)};`)}">
            <div style="font-family:${theme.bodyStack};font-weight:800;font-size:${F(29)};color:${line};">${esc(nt[0])}</div>
            ${nt[1] ? `<div style="font-family:${theme.bodyStack};font-weight:500;font-size:${F(25)};color:${rgba(line, 0.65)};margin-top:${X(5)};">${esc(nt[1])}</div>` : ""}
            <div id="${id}-life${i}" style="position:absolute;left:0;bottom:0;height:${X(6)};width:100%;background:${hi};border-radius:${X(3)};"></div>
          </div>`).join("")}
        </div>`),
      mech,
    };
  }
  if (v === "pop") {
    const offs = [0, 110, 30];
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div style="display:flex;flex-direction:column;gap:${X(34)};margin-top:${X(10)};">
          ${notes.map((nt, i) => `<div id="${id}-n${i}" style="align-self:flex-start;margin-left:${X(offs[i])};${panelCss(ctx, null, `padding:${X(22)} ${X(34)};border-radius:999px;display:flex;align-items:center;gap:${X(20)};border:${X(2)} solid ${rgba(hi, 0.6)};`)}">
            <span style="width:${X(16)};height:${X(16)};border-radius:999px;background:${hi};flex:none;"></span>
            <span style="font-family:${theme.bodyStack};font-weight:800;font-size:${F(29)};color:${line};">${esc(nt[0])}</span>
            ${nt[1] ? `<span style="font-family:${theme.bodyStack};font-weight:500;font-size:${F(24)};color:${rgba(line, 0.6)};">${esc(nt[1])}</span>` : ""}
          </div>`).join("")}
        </div>`),
      mech,
    };
  }
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div style="display:flex;flex-direction:column;gap:${X(26)};">
        ${notes.map((nt, i) => `<div id="${id}-n${i}" style="${panelCss(ctx, 150, `padding:${X(26)} ${X(32)};display:flex;gap:${X(24)};align-items:center;`)}">
          <div style="width:${X(66)};height:${X(66)};border-radius:${X(18)};background:${hi};color:${cardBg};display:flex;align-items:center;justify-content:center;font-family:${theme.displayStack};font-size:${F(34)};flex:none;">${esc(String(theme.brand || "A")[0])}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-family:${theme.bodyStack};font-weight:800;font-size:${F(29)};color:${line};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(nt[0])}</div>
            ${nt[1] ? `<div style="font-family:${theme.bodyStack};font-weight:500;font-size:${F(25)};color:${rgba(line, 0.65)};margin-top:${X(4)};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(nt[1])}</div>` : ""}
          </div>
          <span style="font-family:${theme.bodyStack};font-size:${F(22)};color:${rgba(line, 0.45)};flex:none;">now</span>
        </div>`).join("")}
      </div>`),
    mech,
  };
}

// MORPH — roll / fade / flap. One word transforming through a list of steps.
function bMorph(scene, ctx, _a, _logo, variant) {
  const { theme, skin, Str } = ctx;
  const L = ctx.look.app;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN);
  const v = variant || "roll";
  const id = ctx.id;
  const src = featureLines(scene, 4).map((t) => shortLabel(t, 14).replace(/…$/, ""));
  const steps = (src.length >= 2 ? src : morphSteps(scene)).slice(0, 4);
  const upper = ctx.look.app.upper;
  const words = steps.map((s) => (upper ? String(s).toUpperCase() : String(s)));
  const prefix = scene.kicker || "";
  const sub = String(scene.subtext || "").slice(0, 110);
  const maxLen = Math.max(...words.map((w) => w.length));
  // THE MORPH WORD IS SET nowrap, SO IT HAS TO BE FITTED. The source hardcodes 150px because
  // its authored steps are short ("LIGHT", "MEDIUM", "DARK"); KEYFRAME derives the steps from
  // the scene's own copy, and a 14-character word at 150px in a wide display face measured
  // 1571px against a 936px column — half the word off-frame. Same arithmetic as fitLines:
  // the column divided by the longest step's advance, and it only ever shrinks.
  // Measured widths here too: the morph word is set `nowrap`, so an under-estimated advance does
  // not wrap, it runs off the frame. `maxLen * skin.em` assumed every glyph was the average; the
  // widest actual step string is what has to fit.
  const widestStep = words.reduce((a, w) => (S.advanceOf(w, skin) > S.advanceOf(a, skin) ? w : a), words[0] || "");
  const morphPx = Math.min(150, Math.floor((COL * 0.99) / Math.max(0.5, S.advanceOf(widestStep, skin))));

  let wordHtml;
  if (v === "flap") {
    const cw = Math.max(44, Math.min(92, Math.floor(830 / Math.max(maxLen, 1)) - 9));
    wordHtml = `<div style="display:flex;flex-wrap:nowrap;">${Array.from({ length: maxLen }).map((_, i) =>
      `<span id="${id}-ch${i}" style="display:inline-flex;align-items:center;justify-content:center;width:${X(cw)};height:${X(Math.round(cw * 1.62))};margin:0 ${X(4)};background:${rgba(fg, 0.1)};border:1px solid ${rgba(fg, 0.2)};border-radius:${X(Math.max(6, Math.round(cw * 0.13)))};font-family:${theme.displayStack};font-size:${F(Math.round(cw * 1.1))};color:${hi};white-space:pre;">${esc(words[0][i] || " ")}</span>`).join("")}</div>`;
  } else if (v === "fade") {
    wordHtml = `<div style="position:relative;height:${X(190)};">
      <div id="${id}-a" style="position:absolute;font-family:${theme.displayStack};font-size:${F(morphPx)};line-height:${X(190)};color:${hi};transform-origin:left center;white-space:nowrap;">${esc(words[0])}</div>
      <div id="${id}-b" style="position:absolute;font-family:${theme.displayStack};font-size:${F(morphPx)};line-height:${X(190)};color:${hi};transform-origin:left center;white-space:nowrap;">${esc(words[1] || words[0])}</div>
    </div>`;
  } else {
    wordHtml = `<div style="height:${X(190)};overflow:hidden;position:relative;">
      <div id="${id}-roll">
        <div id="${id}-a" style="font-family:${theme.displayStack};font-size:${F(morphPx)};line-height:${X(190)};color:${hi};white-space:nowrap;">${esc(words[0])}</div>
        <div id="${id}-b" style="font-family:${theme.displayStack};font-size:${F(morphPx)};line-height:${X(190)};color:${hi};white-space:nowrap;">${esc(words[1] || words[0])}</div>
      </div>
    </div>`;
  }
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div data-in="item" data-i="2" style="margin-top:${X(40)};">
        ${prefix ? `<div style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(40)};color:${rgba(fg, 0.6)};margin-bottom:${X(24)};">${esc(prefix)}</div>` : ""}
        ${wordHtml}
        <div style="width:${X(320)};height:${X(10)};border-radius:999px;background:${rgba(fg, 0.15)};margin-top:${X(30)};position:relative;">
          <div id="${id}-bar" style="height:${X(10)};border-radius:999px;background:${hi};width:${X(320)};"></div>
        </div>
        ${sub ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(34)};color:${rgba(fg, 0.7)};margin-top:${X(44)};max-width:${X(700)};line-height:1.45;">${esc(sub)}</div>` : ""}
      </div>`),
    mech: { kind: "morph", id, v, n: words.length, steps: words, maxLen },
  };
}

// SWIPE — swipe (a thrown deck) / flip (a card turning on its Y axis).
function bSwipe(scene, ctx, sceneAssets, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN), line = col(theme, L.line), fg = ink(theme, L.fg, ctx.ground);
  const v = variant || "swipe";
  const id = ctx.id;
  const src = featureLines(scene, 3);
  const cards = (src.length ? src : fallbackLines(scene)).slice(0, 3).map((t) => {
    const parts = String(t).split(/\s+[—–-]\s+|:\s+/);
    return { t: shortLabel(parts[0], 30), s: parts.length > 1 ? shortLabel(parts.slice(1).join(" "), 60) : "" };
  });
  const n = cards.length;
  const stamp = Str.stamp;

  if (v === "flip") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2">
          <div id="${id}-flip" style="${panelCss(ctx, 560, `padding:${X(48)};`)}">
            ${cards.map((c, i) => `<div id="${id}-f${i}" style="position:absolute;left:${X(48)};right:${X(48)};top:${X(48)};">
              <div style="font-family:${theme.displayStack};font-size:${F(62)};line-height:1.1;color:${line};">${esc(c.t)}</div>
              ${c.s ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(30)};color:${rgba(line, 0.65)};margin-top:${X(24)};line-height:1.45;">${esc(c.s)}</div>` : ""}
            </div>`).join("")}
            <div style="position:absolute;bottom:${X(36)};left:${X(48)};font-family:${theme.displayStack};font-size:${F(30)};color:${hi};">${esc(stamp)}</div>
          </div>
          <div style="display:flex;gap:${X(14)};justify-content:center;margin-top:${X(34)};">
            ${cards.map((_, i) => `<span id="${id}-dot${i}" style="width:${i === 0 ? "44px" : "14px"};height:${X(14)};border-radius:999px;background:${i === 0 ? hi : rgba(line, 0.3)};"></span>`).join("")}
          </div>
        </div>`),
      mech: { kind: "swipe", id, v, n, on: hi, off: rgba(line, 0.3) },
    };
  }
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div style="position:relative;height:${X(700)};margin-top:${X(20)};">
        ${cards.map((c, i) => `<div id="${id}-c${i}" style="${panelCss(ctx, 620, `padding:${X(44)};`)}position:absolute;left:${X(60)};right:${X(60)};top:0;z-index:${3 - i};">
          <div style="font-family:${theme.displayStack};font-size:${F(64)};color:${line};line-height:1.08;">${esc(c.t)}</div>
          ${c.s ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(30)};color:${rgba(line, 0.65)};margin-top:${X(22)};line-height:1.45;">${esc(c.s)}</div>` : ""}
          ${i === 0 ? `<div id="${id}-stamp" style="position:absolute;top:${X(44)};right:${X(44)};padding:${X(12)} ${X(26)};border:${X(5)} solid ${hi};border-radius:${X(12)};color:${hi};font-family:${theme.displayStack};font-size:${F(40)};transform:rotate(12deg);">${esc(stamp)}</div>` : ""}
        </div>`).join("")}
      </div>`),
    mech: { kind: "swipe", id, v, n, on: hi, off: rgba(line, 0.3) },
  };
}

// CURSOR — click / keys / slider. A pointer walking the interface.
function bCursor(scene, ctx, _a, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN), line = col(theme, L.line), cardBg = col(theme, L.cardBg);
  const v = variant || "click";
  const id = ctx.id;
  const lines = featureLines(scene, 3);
  const caption = shortLabel(scene.subtext || lines[0] || "", 40);
  const btn = shortLabel(lines[0] || Str.ctaButton, 16);
  const after = shortLabel(lines[1] || Str.done, 16);
  const toggleLabel = shortLabel(lines[2] || lines[1] || "", 34);

  if (v === "slider") {
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="${panelCss(ctx, 560)}">
          ${caption ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(26)};color:${rgba(line, 0.6)};">${esc(caption)}</div>` : ""}
          <div style="font-family:${theme.displayStack};font-size:${F(120)};color:${hi};margin-top:${X(40)};font-variant-numeric:tabular-nums;"><span id="${id}-val">90</span><span style="font-size:${F(54)};color:${rgba(line, 0.6)};">%</span></div>
          <div style="position:relative;height:${X(60)};margin-top:${X(40)};">
            <div style="position:absolute;top:${X(24)};left:${X(40)};width:${X(600)};height:${X(14)};border-radius:999px;background:${rgba(line, 0.15)};"></div>
            <div id="${id}-fill" style="position:absolute;top:${X(24)};left:${X(40)};width:${X(600)};height:${X(14)};border-radius:999px;background:${hi};"></div>
            <div id="${id}-knob" style="position:absolute;top:${X(4)};left:${X(574)};width:${X(52)};height:${X(52)};border-radius:999px;background:#fff;box-shadow:0 ${X(4)} ${X(12)} rgba(0,0,0,0.4);"></div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:${X(20)};margin:${X(50)} ${X(20)} 0;padding:${X(22)} ${X(30)};border-radius:${X(16)};background:${rgba(line, 0.08)};">
            <span style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(28)};color:${line};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(toggleLabel)}</span>
            <div id="${id}-tg" style="width:${X(92)};height:${X(50)};border-radius:999px;background:${hi};position:relative;flex:none;">
              <div id="${id}-tk" style="position:absolute;top:${X(6)};left:${X(48)};width:${X(38)};height:${X(38)};border-radius:999px;background:#fff;"></div>
            </div>
          </div>
          <svg viewBox="0 0 940 560" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">${pointer(`${id}-ptr`, fg)}</svg>
        </div>`),
      mech: { kind: "cursor", id, v, on: hi, off: rgba(line, 0.25) },
    };
  }
  if (v === "keys") {
    const keys = [btn.slice(0, 6), "+", after.slice(0, 6)];
    return {
      html: shell(ctx, scene.headline || scene.title || "", `
        <div data-in="item" data-i="2" style="${panelCss(ctx, 560)}">
          ${caption ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(26)};color:${rgba(line, 0.6)};margin-bottom:${X(46)};">${esc(caption)}</div>` : ""}
          <div style="display:flex;gap:${X(26)};justify-content:center;">
            ${keys.map((k, i) => `<div id="${id}-k${i}" style="min-width:${X(170)};padding:${X(34)} ${X(20)};text-align:center;border-radius:${X(18)};background:${rgba(hi, 0.18)};border:${X(2)} solid ${hi};border-bottom-width:${X(8)};font-family:${theme.displayStack};font-size:${F(40)};color:${hi};">${esc(k)}</div>`).join("")}
          </div>
          <div id="${id}-after" style="text-align:center;margin-top:${X(52)};font-family:${theme.displayStack};font-size:${F(52)};color:${hi};">${esc(after || Str.done)}</div>
        </div>`),
      mech: { kind: "cursor", id, v, n: keys.length, on: hi, off: rgba(line, 0.25), ink: line, hitBg: rgba(hi, 0.18), idleBg: rgba(line, 0.08) },
    };
  }
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div data-in="item" data-i="2" style="${panelCss(ctx, 620)}">
        ${caption ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(26)};color:${rgba(line, 0.6)};margin-bottom:${X(34)};">${esc(caption)}</div>` : ""}
        <div style="display:flex;justify-content:center;margin-top:${X(40)};">
          <div id="${id}-btn" style="padding:${X(26)} ${X(60)};border-radius:999px;background:${hi};color:${cardBg};font-family:${theme.displayStack};font-size:${F(42)};"><span id="${id}-btnlabel">${esc(after)}</span></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:${X(20)};margin:${X(70)} ${X(40)} 0;padding:${X(26)} ${X(34)};border-radius:${X(18)};background:${rgba(line, 0.08)};">
          <span style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(30)};color:${line};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(toggleLabel)}</span>
          <div id="${id}-tg" style="width:${X(96)};height:${X(52)};border-radius:999px;background:${hi};position:relative;flex:none;">
            <div id="${id}-tk" style="position:absolute;top:${X(6)};left:${X(50)};width:${X(40)};height:${X(40)};border-radius:999px;background:#fff;"></div>
          </div>
        </div>
        <svg viewBox="0 0 940 620" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">
          <circle id="${id}-ring" cx="450" cy="300" r="20" fill="none" stroke="${hi}" stroke-width="4" style="opacity:0;"/>
          ${pointer(`${id}-ptr`, fg)}
        </svg>
      </div>`),
    mech: { kind: "cursor", id, v, on: hi, off: rgba(line, 0.14), ink: line, onInk: cardBg, before: btn, after },
  };
}

// DRAGDROP — drag / assemble. A chip carried to a slot and locked in.
function bDrag(scene, ctx, _a, _logo, variant) {
  const { theme, Str } = ctx;
  const L = ctx.look.app;
  const fg = ink(theme, L.fg, ctx.ground), hi = ink(theme, L.hi, ctx.ground, DISPLAY_MIN), line = col(theme, L.line), cardBg = col(theme, L.cardBg);
  const v = variant || "drag";
  const id = ctx.id;
  const lines = featureLines(scene, 3);
  const caption = shortLabel(scene.subtext || lines[1] || "", 40);
  const item = shortLabel(lines[0] || scene.emphasis || firstWords(scene, 2), 18);
  const slot = shortLabel(lines[1] || Str.slot, 14).toUpperCase();
  const assemble = v === "assemble";
  const h = assemble ? 620 : 660;
  return {
    html: shell(ctx, scene.headline || scene.title || "", `
      <div data-in="item" data-i="2" style="${panelCss(ctx, h)}">
        ${caption ? `<div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(26)};color:${rgba(line, 0.6)};">${esc(caption)}</div>` : ""}
        <div id="${id}-slot" style="position:absolute;left:${X(assemble ? 300 : 560)};top:${X(assemble ? 280 : 480)};width:${X(assemble ? 340 : 330)};height:${X(assemble ? 150 : 130)};border-radius:${X(assemble ? 22 : 20)};border:${X(4)} dashed ${rgba(line, 0.4)};display:flex;align-items:center;justify-content:center;">
          <span id="${id}-slotlabel" style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(24)};color:${rgba(line, 0.5)};letter-spacing:.12em;">${esc(slot)}</span>
        </div>
        <div id="${id}-chip" style="position:absolute;left:${X(assemble ? 330 : 585)};top:${X(assemble ? 315 : 505)};max-width:${X(assemble ? 330 : 300)};padding:${X(assemble ? 24 : 22)} ${X(assemble ? 42 : 40)};border-radius:${X(16)};background:${hi};color:${cardBg};font-family:${theme.displayStack};font-size:${F(assemble ? 36 : 34)};box-shadow:0 ${X(6)} ${X(14)} rgba(0,0,0,0.25);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;">${esc(item)}</div>
        <div id="${id}-tick" style="position:absolute;left:${X(assemble ? 660 : 910)};top:${X(assemble ? 322 : 514)};width:${X(assemble ? 64 : 60)};height:${X(assemble ? 64 : 60)};border-radius:999px;background:${hi};display:flex;align-items:center;justify-content:center;">
          <svg width="55%" height="55%" viewBox="0 0 24 24" fill="none" stroke="${cardBg}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>
        </div>
        <div id="${id}-note" style="position:absolute;left:${X(40)};bottom:${X(40)};font-family:${theme.bodyStack};font-weight:700;font-size:${F(28)};color:${rgba(line, 0.75)};">${esc(slot + " · locked in")}</div>
        <svg viewBox="0 0 940 ${h}" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">${pointer(`${id}-ptr`, fg)}</svg>
      </div>`),
    mech: { kind: "drag", id, v, on: hi, off: rgba(line, 0.4), tint: rgba(hi, 0.1) },
  };
}

const BUILDERS = {
  hook: bHook, statement: bStatement, feature: bFeature, montage: bMontage, stats: bStats, cta: bCta,
  Typing: bTyping, Code: bCode, Scroll: bScroll, Ring: bRing, Toggle: bToggle,
  Notify: bNotify, Morph: bMorph, Swipe: bSwipe, Cursor: bCursor, DragDrop: bDrag,
};

module.exports = {
  BUILDERS, col, title, kicker, open, close, shell, panelCss, setStage, mediaBoxes,
  // Accessors, not the load-time snapshot: PAD/COL are per-build now (see setStage).
  get PAD() { return PAD; }, get COL() { return COL; }, get WIDE() { return WIDE; },
};
