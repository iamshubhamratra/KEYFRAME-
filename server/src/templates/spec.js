// TEMPLATE SPEC — the contract an AI-designed template must satisfy before a single byte is
// written to disk.
//
// THE SAFETY MODEL, STATED ONCE (product spec section 21): the design model NEVER AUTHORS CODE.
// It emits DATA that validates against the schema below, and templates/emit.js renders that
// data into a composer module using generator functions THIS REPO OWNS. Nothing the model
// produces is ever eval'd, required, or concatenated into an executable position.
//
// That is not a stylistic preference — it is forced by how the engine works. A FilmKit skin's
// `World` is stringified with String(skin.World) and injected verbatim into the composed page
// (film_stage.js:947, :1075), so a model-authored World function would be model-authored code
// executing in the render browser. Instead the model describes the backdrop as a LAYER LIST
// drawn from a closed vocabulary, and emit.js compiles that list into a World function it
// wrote itself. Same for `icon` and `groundCss`.
//
// EVERY ENUM BELOW IS THE ENGINE'S REAL VOCABULARY, read out of the code rather than invented:
//   entrance presets   film_stage.js PRESETS (:611)
//   camera kinds       film_stage.js camVarsFor (:627)
//   mechanics          film_stage.js MECHANIC_FOR (:594) — and the promise that no two packs
//                      share a mechanic lives in `variants`, so it is per-archetype
//   beats              film_stage.js archetypeFor (:564) + the `app` shell
//   kicker/chips/card/btn treatments  film_beats.js kicker (:69), chipCss (:81), cardCss (:88)
// A value outside these sets does not fail loudly at render time — it silently falls through to
// the engine's default, producing a template that is subtly not the one that was designed. So
// the schema rejects it here, where the error can still be reported to the admin.

const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const { isBundled } = require("../fonts/pack_fonts");
const { termsForProfile } = require("../services/music_vocabulary");

// THE MUSIC CATALOGUE, ASKED OFFLINE.
//
// scripts/audit-music-vocabulary.js fails CI when any pack searches with a word the catalogue
// has fewer than three tracks for, and it caches every answer it has ever got. A designed
// template writes its own `audio.musicKeywords`, and the first two through this system wrote
// evocative PHRASES — "newsroom bed", "midnight bulletin", "ticker rhythm" — whose component
// words return 0, 1 and 0 tracks. They published, and turned `npm test` red on a repo-wide gate
// that had nothing to do with the admin system.
//
// Reading the same cache here moves that failure to the only place it can be fixed cheaply: the
// generator's repair loop, before anything is written to disk. Only KNOWN-dead words are
// refused — a word the cache has never seen is unproven, not wrong, and blocking on it would
// make the check a vocabulary whitelist.
const VOCAB_CACHE = path.resolve(__dirname, "..", "..", ".cache", "music-vocab.json");
let _vocab;
function musicVocab() {
  if (_vocab === undefined) {
    try { _vocab = JSON.parse(fs.readFileSync(VOCAB_CACHE, "utf8")); } catch { _vocab = null; }
  }
  return _vocab;
}

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected #RRGGBB");
// A palette role name. Referenced by every look field, so it is restricted to something that
// is safe as a JS object key in generated source without quoting gymnastics.
const ROLE = z.string().regex(/^[a-z][a-zA-Z0-9]{1,15}$/, "role must be a short lowerCamel identifier");

const PRESETS = ["slam", "bounce", "rise", "streak", "stamp", "drowse", "machete", "flip", "pop"];
const CAMS = ["pushL", "pushR", "pushU", "pushD", "zoomIn", "zoomOut", "spin", "hopU", "drop"];
const BEATS = ["hook", "statement", "feature", "montage", "stats", "cta", "app"];
const BADGES = ["circle", "square", "outline", "none"];

// Per-archetype mechanics. film_stage routes an EMPTY beat to one of the mechanics its pack
// declared for that archetype; declaring a mechanic under the wrong archetype means it can
// never be selected, so the schema keys them the way MECHANIC_FOR does.
const MECHANICS = {
  statement: ["Morph", "Notify", "Toggle", "Swipe"],
  feature: ["Typing", "Code", "Cursor", "DragDrop"],
  montage: ["Scroll", "Swipe"],
  stats: ["Ring"],
};

// A font the renderer cannot actually load is the quietest defect in this whole feature: the
// face silently substitutes and the template renders in something the designer never chose.
// server/src/fonts/pack_fonts.js ships 140 base64 @font-face families and exports isBundled(),
// so the check is exact rather than a guess. (It also cannot be fixed later at runtime — the
// generator that builds that file needs the @fontsource devDependencies, and the production
// image installs with --omit=dev.)
const BUNDLED_FONT = z.string().min(1).refine((f) => isBundled(f), {
  message: "font is not bundled in src/fonts/pack_fonts.js — pick one that is, or it will silently substitute at render time",
});

// ---------------------------------------------------------------- world

// The declarative backdrop. Each layer is one primitive that emit.js knows how to draw as pure,
// deterministic SVG (no Math.random, no Date — the world is re-evaluated on every seek and must
// produce the same frame for the same time, or the render flickers).
//
// `color` is a PALETTE ROLE, never a hex: film_stage.buildTheme rotates the whole authored
// palette onto the brand's lead hue, so a world that names roles re-tints with the brand and a
// world that hardcodes hexes does not. That is the mechanical difference between
// supportsBrandColors being true and being a claim.
const LAYER_KINDS = ["glow", "stars", "motes", "grid", "wave", "rings", "stripes", "orb", "arcs", "beam"];

const WorldLayer = z.object({
  kind: z.enum(LAYER_KINDS),
  color: ROLE,
  // Normalised 0..1 against the authored 1080x1920 frame, so emit.js can place them without the
  // model having to know the stage size.
  cx: z.number().min(-0.5).max(1.5).default(0.5),
  cy: z.number().min(-0.5).max(1.5).default(0.5),
  r: z.number().min(0.01).max(1.5).default(0.3),
  count: z.number().int().min(1).max(40).default(8),
  opacity: z.number().min(0.02).max(1).default(0.4),
  speed: z.number().min(0).max(4).default(1),
  amp: z.number().min(0).max(1).default(0.1),
  angle: z.number().min(-180).max(180).default(0),
  width: z.number().min(0.001).max(1).default(0.02),
}).strict();

const WorldSpec = z.object({
  // Between one and five layers. Zero would mean "no backdrop", which this engine family is
  // defined by having; more than five costs seek time on every frame for no visible gain.
  layers: z.array(WorldLayer).min(1).max(5),
}).strict();

// The ground treatment. A flat fill is `null`; a gradient names two roles and an angle.
const GroundSpec = z.object({
  kind: z.enum(["flat", "linear", "radial"]),
  from: ROLE,
  to: ROLE.nullish(),
  angle: z.number().min(0).max(360).default(160),
}).strict();

// The chrome mark. A closed set of geometric primitives emit.js draws with the engine's R2
// helper — deliberately abstract, because a generated mark that tries to be figurative reads as
// a mistake at 47px.
const IconSpec = z.object({
  shape: z.enum(["circle", "ring", "square", "diamond", "triangle", "bolt", "star", "arrow", "bars", "cross"]),
  stroke: z.boolean().default(true),
}).strict();

// ---------------------------------------------------------------- look

const LookBeat = z.object({
  bg: ROLE,
  fg: ROLE,
  hi: ROLE,
  // Whether the animated backdrop shows on this beat. Load-bearing, not decoration: 215 of the
  // 474 beats across the shipped FilmKit packs say NO, and each beat's text colour is authored
  // against its OWN field (film_beats.js:105). A template that renders the world everywhere
  // does not just lose the alternation, it breaks the type contrast.
  world: z.boolean().default(false),
  // Vertical position of the copy block, in authored px of the declared stage. Bounded loosely
  // here (a landscape stage is only 1080 tall) and checked against the real stage height in
  // crossCheck, where the stage is known.
  top: z.number().int().min(0).max(1700).default(400),
  // Display size in authored px of the declared stage.
  size: z.number().int().min(48).max(220).default(110),
  upper: z.boolean().default(false),
  align: z.enum(["left", "center"]).default("left"),
  kicker: z.object({ v: z.enum(["pill", "outline", "tag", "bare"]), c: ROLE, bg: ROLE.nullish() }).strict().nullish(),
  card: z.object({ v: z.enum(["frame", "tilt", "glow", "paper"]), bg: ROLE, r: z.number().int().min(0).max(60).default(28), glow: ROLE.nullish() }).strict().nullish(),
  chips: z.object({ v: z.enum(["pill", "outline", "square"]), colors: z.array(ROLE).min(1).max(3), text: ROLE }).strict().nullish(),
  tile: z.object({ bg: HEX.or(ROLE), line: ROLE, label: ROLE, r: z.number().int().min(0).max(48).default(24), labelSize: z.number().int().min(16).max(48).default(29) }).strict().nullish(),
  cols: z.array(ROLE).min(1).max(3).nullish(),
  num: z.number().int().min(80).max(240).nullish(),
  btn: z.object({ v: z.enum(["pill", "block", "glow"]), bg: ROLE, c: ROLE }).strict().nullish(),
  logoShape: z.enum(["circle", "square", "none"]).nullish(),
  cardBg: ROLE.nullish(),
  line: ROLE.nullish(),
  rule: ROLE.nullish(),
}).strict();

// ---------------------------------------------------------------- audio

// Mirrors the pack.json `audio` block exactly (frame_manifest PackManifestSchema.audio), because
// gen-film-packs copies it through verbatim. The minimums are not style — they are what
// scripts/test-audio.js and scripts/test-music-diversity.js assert for every listed pack, so a
// template that ships with fewer turns `npm test` red the moment it is published.
const AudioSpec = z.object({
  mood: z.string().min(3).max(160),
  archetype: z.string().min(2).max(40),
  energy: z.enum(["low", "medium", "high"]),
  tempo: z.enum(["slow", "mid", "fast"]),
  style: z.array(z.string().min(2)).min(3).max(8),
  musicKeywords: z.array(z.string().min(2)).min(10).max(20),
  sfxPalette: z.object({
    transition: z.string().min(2),
    ui: z.string().min(2),
    reveal: z.string().min(2),
    data: z.string().min(2),
    cta: z.string().min(2),
  }).strict(),
  // These three mirror PackManifestSchema.audio.noVo EXACTLY (frame_manifest.js:205-210), and
  // that is not a stylistic preference. `sfxDensity` was written here as
  // ["sparse","normal","dense"] from memory rather than read from the real schema; a live
  // generation duly produced "dense", zod accepted it HERE, gen-film-packs copied it through
  // verbatim, and the pack.json it wrote then failed PackManifestSchema — so getManifest
  // returned null, the composer got no manifest and emitted nothing, and the whole template
  // came back with zero stills and no error anywhere near the cause.
  //
  // The lesson generalises: every enum in this file has to be the ENGINE'S vocabulary, read out
  // of the code, not a plausible-looking set. emitTemplate now re-validates the derived manifest
  // for exactly this reason, so a future drift fails loudly at generation instead of silently at
  // render.
  noVo: z.object({
    energyBoost: z.number().min(0).max(2).default(1),
    sfxDensity: z.enum(["normal", "rich"]).default("rich"),
    ambient: z.boolean().default(false),
  }).strict().default({}),
}).strict();

const AssetHintsSpec = z.object({
  photoMod: z.string().min(10).max(300),
  iconStyle: z.enum(["line", "solid", "duotone", "flat"]).default("line"),
  keywords: z.array(z.string().min(2)).min(4).max(12),
  prefer: z.array(z.enum(["screenshot", "photo", "illustration", "vector", "icon"])).min(1).max(4),
}).strict();

// ---------------------------------------------------------------- the spec

const TemplateSpec = z.object({
  label: z.string().min(2).max(48),

  // THE AUTHORED STAGE. "portrait" is 1080x1920, "landscape" is 1920x1080, and it decides which
  // layout family film_beats emits (its WIDE branches lay beats out across the frame instead of
  // down it). Every `top` and `size` below is in authored pixels of THIS stage, which is why the
  // cross-check bounds them against it rather than against a fixed 1920.
  //
  // Defaulted rather than required so the 89 shipped skins — none of which declare it — keep
  // resolving to portrait.
  stage: z.enum(["portrait", "landscape"]).default("portrait"),

  // -- type --
  display: BUNDLED_FONT,
  // THE FALLBACK STACKS AND `titleSpace` ARE THE ONE PLACE MODEL TEXT REACHES A STYLE ATTRIBUTE.
  //
  // The safety model at the top of this file says model output only ever lands as a JSON value or
  // an escaped string literal. These three were the exception: emit.js writes them into the skin,
  // and film_stage composes them into `style="font-family:…"` / `letter-spacing:…` unescaped. As
  // free `z.string()` they accepted a double quote, so a value like `Georgia, serif" onload="…`
  // closed the attribute and injected an event handler into the page the renderer executes.
  // Verified against the schema before this constraint: accepted.
  //
  // A CSS font-family list has no other legal characters, and a letter-spacing value is a number
  // with a unit — so constraining them costs nothing a real design would want.
  displayFallback: z.string().regex(/^[A-Za-z0-9 ,'-]{2,60}$/, "a font-family fallback list may contain only letters, digits, spaces, commas, apostrophes and hyphens").default("Georgia, serif"),
  body: BUNDLED_FONT,
  bodyFallback: z.string().regex(/^[A-Za-z0-9 ,'-]{2,60}$/, "a font-family fallback list may contain only letters, digits, spaces, commas, apostrophes and hyphens").default("system-ui, sans-serif"),
  mono: BUNDLED_FONT.nullish(),
  // Average glyph advance in em. The line fitter derives BOTH the wrap target and the final
  // size from this one number (film_stage fitLines/fitPx), so a wrong value does not look
  // slightly off — it overflows or leaves half the frame empty. 0.42 is a condensed face,
  // 0.62 a wide one.
  em: z.number().min(0.38).max(0.72).default(0.52),
  titleLine: z.number().min(0.85).max(1.35).default(1.06),
  // Same attribute-escape reasoning as the fallbacks above: this is composed into a
  // `letter-spacing:` declaration unescaped, so it is constrained to what a length actually is.
  titleSpace: z.string().regex(/^-?\d*\.?\d+(em|px|rem|%)?$|^0$/, "letter-spacing must be a number with an optional em/px/rem/% unit").max(12).default("0"),
  titlePreset: z.enum(PRESETS),
  itemPreset: z.enum(PRESETS),

  // -- palette --
  palette: z.record(ROLE, HEX),
  accents: z.array(ROLE).min(1).max(3),
  groundKey: ROLE,
  inkKey: ROLE,
  paperKey: ROLE,
  dark: z.boolean(),
  ground: GroundSpec.nullish(),

  // -- per-beat look --
  look: z.object({
    hook: LookBeat, statement: LookBeat, feature: LookBeat,
    montage: LookBeat, stats: LookBeat, cta: LookBeat, app: LookBeat,
  }).strict(),

  // -- camera + motion --
  // Exactly six: film_stage indexes the set as (i * camMul + camOff) % 6.
  cams: z.array(z.enum(CAMS)).length(6),
  camMul: z.number().int().min(1).max(5).default(1),
  camOff: z.number().int().min(0).max(5).default(0),
  mag: z.object({
    x: z.number().min(0).max(1.5).default(1),
    y: z.number().min(0).max(1.5).default(0.6),
    rot: z.number().min(0).max(2).default(0.7),
    skew: z.number().min(0).max(2).default(0),
    zin: z.number().min(0).max(1).default(0.4),
    zout: z.number().min(0).max(1).default(0.34),
    driftX: z.number().min(0).max(30).default(8),
    driftY: z.number().min(0).max(30).default(6),
    driftZ: z.number().min(0).max(0.2).default(0.045),
    slide: z.number().min(0).max(0.6).default(0.24),
    inn: z.number().min(0.05).max(0.5).default(0.24),
    out: z.number().min(0.5).max(0.98).default(0.82),
  }).strict().default({}),
  // THIS TEMPLATE'S OWN PICTURE BOXES, as fractions of its authored stage.
  //
  // Without this every generated template shipped identical asset geometry — two 16:9 templates
  // from unrelated briefs both declared `feature:2@851x528 how:4@399x475 …`, because the boxes were
  // hardcoded in film_beats. How big the pictures are, and what shape, is a real part of a
  // template's identity: the hand-built packs range from a 950-wide column (grid-dispatch) to
  // 1421x302 letterbox strips (paper-tales).
  //
  // Bounded, not free. The engine draws these boxes and gen-film-packs derives the manifest from
  // the SAME resolved numbers, so the contract always describes what is actually drawn — but a box
  // wider than its column or taller than its frame would overflow, so the ranges below are the room
  // each beat actually has. Omitted entries keep the engine's authored defaults.
  // THE BANDS ARE PER-STAGE, so the numbers here are only the outer envelope — crossCheck() below
  // narrows them once `stage` is known. A landscape beat lays out ACROSS a 1080-tall frame, so its
  // cards are a much larger fraction of the height than a portrait one's (the family defaults are
  // 0.49 / 0.44 / 0.52 landscape against 0.31 / 0.15 / 0.22 portrait) — one shared band would
  // either forbid a landscape template its own default or let a portrait card run off the frame.
  boxes: z.object({
    // The hero media plate. Default 936x588 of 1080x1920 (0.867 x 0.306).
    feature: z.object({ w: z.number().min(0.24).max(0.95), h: z.number().min(0.12).max(0.62) }).strict().nullish(),
    // One montage tile. Width is the grid's; only height is free. Default 292 (0.152).
    montage: z.object({ h: z.number().min(0.08).max(0.6) }).strict().nullish(),
    // The statement beat's grounding card. Default 430 (0.224).
    statement: z.object({ h: z.number().min(0.1).max(0.65) }).strict().nullish(),
  }).strict().nullish(),

  ambient: z.number().min(0.2).max(4).default(1.5),
  energy: z.number().min(0.4).max(1.6).default(1),
  badge: z.enum(BADGES).default("circle"),
  icon: IconSpec,
  world: WorldSpec,

  // -- the mechanics this pack owns --
  // Per-archetype, and each value must be legal FOR that archetype (film_stage MECHANIC_FOR).
  // Empty is a valid, deliberate answer: a pack that declares nothing renders only the six
  // authored acts, exactly as the hand-built films do.
  variants: z.object({
    statement: z.enum(MECHANICS.statement).nullish(),
    feature: z.enum(MECHANICS.feature).nullish(),
    montage: z.enum(MECHANICS.montage).nullish(),
    stats: z.enum(MECHANICS.stats).nullish(),
  }).strict().default({}),

  strings: z.object({ brandName: z.string().min(1).max(40) }).strict(),

  // -- the creative half (becomes pack.json + FRAME.md, mirroring film_skins/_metadata.json) --
  vibe: z.string().min(80).max(1400),
  category: z.string().min(2).max(32),
  tags: z.array(z.string().min(2).max(24)).min(3).max(8),
  audio: AudioSpec,
  assets: AssetHintsSpec,
  frameMdBody: z.string().min(80).max(6000),
}).strict();

// ---------------------------------------------------------------- integrity

// zod proves each field is well-formed. These checks prove the fields are consistent WITH EACH
// OTHER — which is where a plausible-looking generated design actually goes wrong: a look beat
// that names a colour role the palette never defined renders as `undefined` and paints black on
// black, and no per-field rule can catch it.
function crossCheck(spec) {
  const errors = [];
  const roles = Object.keys(spec.palette || {});
  const has = (r) => roles.includes(r);
  const need = (r, where) => { if (r != null && !has(r)) errors.push(`${where} references palette role "${r}", which the palette does not define (defined: ${roles.join(", ")})`); };

  if (roles.length < 4) errors.push(`palette needs at least 4 roles, got ${roles.length}`);
  if (roles.length > 10) errors.push(`palette has ${roles.length} roles; more than 10 is unmanageable for brand re-hue`);

  need(spec.groundKey, "groundKey");
  need(spec.inkKey, "inkKey");
  need(spec.paperKey, "paperKey");
  (spec.accents || []).forEach((a, i) => need(a, `accents[${i}]`));

  // `top` is in authored pixels of the DECLARED stage, so its ceiling moves with the stage. A
  // landscape frame is 1080 tall; a copy block authored at top:900 there starts 83% of the way
  // down and the headline falls out of frame. zod cannot check this — it does not know the stage
  // when it validates the field — so it is checked here, where it does.
  const stageH = spec.stage === "landscape" ? 1080 : 1920;
  const topCeiling = Math.round(stageH * 0.82);

  // PICTURE BOXES, BANDED BY STAGE — for the same reason, and with one extra: the landscape
  // feature card's width is a SHARE OF THE ROW the copy also stands in, and film_beats clamps
  // that share to 0.30–0.72. A value outside the band would be silently clamped, so the manifest
  // and the film would still agree while the design quietly stopped being the one that was asked
  // for. Refusing it is the honest answer — silent clamping is how a template ends up shaped by
  // the engine's limits rather than by its brief.
  if (spec.boxes) {
    const wide = spec.stage === "landscape";
    const BANDS = wide
      ? { "feature.w": [0.25, 0.59], "feature.h": [0.2, 0.62], "montage.h": [0.18, 0.6], "statement.h": [0.2, 0.65] }
      : { "feature.w": [0.4, 0.95], "feature.h": [0.12, 0.45], "montage.h": [0.08, 0.3], "statement.h": [0.1, 0.38] };
    for (const [pathKey, [lo, hi]] of Object.entries(BANDS)) {
      const [role, axis] = pathKey.split(".");
      const box = spec.boxes[role];
      if (!box || box[axis] == null) continue;
      const v = Number(box[axis]);
      if (v < lo || v > hi) {
        errors.push(`boxes.${pathKey} is ${v}, outside the ${lo}–${hi} range a ${spec.stage} stage has room for `
          + `(the ${wide ? "1920x1080" : "1080x1920"} frame lays this beat out ${wide ? "across" : "down"} the frame)`);
      }
    }
  }

  // MUSIC TERMS MUST BE WORDS THE CATALOGUE IS TAGGED WITH.
  //
  // Checked through termsForProfile — the exact function the search asks with and the audit
  // checks — so this can never drift from either. The provider AND-matches, so a phrase is only
  // ever as good as its worst word; naming the dead ones individually is what lets the repair
  // loop replace them rather than rewrite the whole block.
  const vocab = musicVocab();
  if (vocab && spec.audio) {
    const dead = termsForProfile(spec.audio)
      .filter((t) => Object.prototype.hasOwnProperty.call(vocab, t) && Number(vocab[t]) < 3)
      .map((t) => `${t} (${Number(vocab[t])})`);
    if (dead.length) {
      errors.push(`audio terms with no catalogue behind them: ${dead.join(", ")} — every word of every `
        + `entry in audio.style and audio.musicKeywords is searched on its own, so a word the music `
        + `library has fewer than 3 tracks for contributes nothing. Use words a track is TAGGED with `
        + `(genre, instrument, tempo, production) rather than words that describe the subject`);
    }
  }

  for (const [beat, L] of Object.entries(spec.look || {})) {
    if (L.top > topCeiling) {
      errors.push(`look.${beat}.top is ${L.top}, past the ${topCeiling}px ceiling for a ${spec.stage} stage (${stageH}px tall) — the copy block would start too low to fit its headline`);
    }
    need(L.bg, `look.${beat}.bg`);
    need(L.fg, `look.${beat}.fg`);
    need(L.hi, `look.${beat}.hi`);
    if (L.kicker) { need(L.kicker.c, `look.${beat}.kicker.c`); need(L.kicker.bg, `look.${beat}.kicker.bg`); }
    if (L.card) { need(L.card.bg, `look.${beat}.card.bg`); need(L.card.glow, `look.${beat}.card.glow`); }
    if (L.chips) { (L.chips.colors || []).forEach((c, i) => need(c, `look.${beat}.chips.colors[${i}]`)); need(L.chips.text, `look.${beat}.chips.text`); }
    if (L.tile) { if (!/^#/.test(String(L.tile.bg))) need(L.tile.bg, `look.${beat}.tile.bg`); need(L.tile.line, `look.${beat}.tile.line`); need(L.tile.label, `look.${beat}.tile.label`); }
    (L.cols || []).forEach((c, i) => need(c, `look.${beat}.cols[${i}]`));
    if (L.btn) { need(L.btn.bg, `look.${beat}.btn.bg`); need(L.btn.c, `look.${beat}.btn.c`); }
    need(L.cardBg, `look.${beat}.cardBg`);
    need(L.line, `look.${beat}.line`);
    need(L.rule, `look.${beat}.rule`);

    // READABILITY IS A HARD GATE, NOT A WARNING. The copy is drawn in `fg` directly on `bg`,
    // so a pairing below 4.5:1 is not "a bit low contrast" — it is a scene the viewer cannot
    // read, and it is the single most likely way a generated palette fails.
    const bgHex = spec.palette[L.bg], fgHex = spec.palette[L.fg];
    if (bgHex && fgHex) {
      const cr = contrast(bgHex, fgHex);
      if (cr < 4.5) errors.push(`look.${beat}: body/display text (${L.fg} ${fgHex}) on its ground (${L.bg} ${bgHex}) has ${cr.toFixed(2)}:1 contrast — 4.5:1 is the floor for readable copy`);
    }
    // The highlight is display-sized, so it gets the large-text floor rather than the body one.
    const hiHex = spec.palette[L.hi];
    if (bgHex && hiHex) {
      const cr = contrast(bgHex, hiHex);
      if (cr < 3) errors.push(`look.${beat}: the highlight (${L.hi} ${hiHex}) on its ground (${L.bg} ${bgHex}) has ${cr.toFixed(2)}:1 contrast — 3:1 is the floor for display type`);
    }
  }

  if (spec.ground) { need(spec.ground.from, "ground.from"); need(spec.ground.to, "ground.to"); }
  (spec.world?.layers || []).forEach((l, i) => need(l.color, `world.layers[${i}].color`));

  // `dark` drives which palette role becomes pack.json `colors.text`, which the QA reviewer and
  // the brand system both read. Contradicting the actual ground colour mislabels the template.
  const groundHex = spec.palette[spec.groundKey];
  if (groundHex) {
    const lum = relLum(groundHex);
    if (spec.dark && lum > 0.5) errors.push(`dark:true but the ground ${spec.groundKey} (${groundHex}) is light (luminance ${lum.toFixed(2)})`);
    if (!spec.dark && lum < 0.2) errors.push(`dark:false but the ground ${spec.groundKey} (${groundHex}) is dark (luminance ${lum.toFixed(2)})`);
  }

  // A pack whose every beat draws the world loses the alternation the family is built on; one
  // where no beat does is missing its backdrop entirely.
  const worldBeats = Object.values(spec.look || {}).filter((L) => L.world).length;
  if (worldBeats === 0) errors.push("no beat sets world:true — the animated backdrop would never be visible");
  if (worldBeats === Object.keys(spec.look || {}).length) errors.push("every beat sets world:true — the family alternates between world and flat fields, and always-on reads as one long scene");

  return errors;
}

function hexToRgb(h) {
  let s = String(h || "#000").replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function relLum(h) {
  const [r, g, b] = hexToRgb(h).map((v) => v / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const la = relLum(a), lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Parse + cross-check in one call. Returns { ok, spec, errors } rather than throwing, because
// every caller wants to hand the errors back to the design model for a repair lap.
function validateSpec(raw) {
  const parsed = TemplateSpec.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return { ok: false, spec: null, errors };
  }
  const errors = crossCheck(parsed.data);
  return { ok: errors.length === 0, spec: parsed.data, errors };
}

module.exports = {
  TemplateSpec, validateSpec, crossCheck,
  PRESETS, CAMS, BEATS, BADGES, MECHANICS, LAYER_KINDS,
  relLum, contrast, hexToRgb,
};
