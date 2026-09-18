// TYPE RIOT — skin for the shared FilmKit stage (services/film_stage.js).
//
// PORTED BY HAND from the handoff source
// (templete-design/keyframe-handoff/source/type-riot-film.jsx, `window.TypeRiot`), which is
// one of the HAND-BUILT films rather than a `FilmKit.make(cfg)` template — so every cfg
// field below is read off the film's own constants: its `theme` object, its `M` entrance
// table, its `cam()` switch, its per-scene `Frame({bg, fg, ghost})` calls, its `Lines()`
// helper and its `Ghost` component. Fonts and the authored deck come from `Type Riot.dc.html`.
//
// Display Anton / body Space Grotesk. Camera set
// ["zoomIn","pushR","pushU","pushL","pushD","zoomOut"], indexed exactly as the source
// indexes its own (sc.index * 7 + 1).
// Entrances: title "slam", items "streak".
//
// PURE TYPOGRAPHY. The source has no MediaSlot anywhere — it is the one film in the handoff
// that shows no imagery at all ("No footage. No filters. Just type, timed to the beat.", and
// a whole scene that reads NO|IMAGES|NEEDED). So `media: false`, and the Feature beat draws
// the source's big underlined lines while the Montage beat draws its label blocks.
//
// Declares ONE interaction mechanic: Scroll:ticker. That is not an invention — the film's
// own `Ticker` scene is three Anton rows travelling at three speeds in alternating
// directions, which is exactly what FKticker recomputes per seek.
//
// palette / World below are the AUTHORED functions, emitted verbatim — the world in
// particular is re-evaluated per seek against an SVG-DOM shim, so the backdrop is not a
// reinterpretation of the original, it IS the original.

const stage = require("../film_stage");

const SKIN = {
  id: "type-riot",
  label: "Type Riot",

  // ---- type ----
  // FH = '"Anton", Impact, sans-serif'  /  FB = '"Space Grotesk", system-ui, sans-serif'
  // Anton is a very condensed grotesque — 0.44em average advance, the narrowest face in the
  // library. A shared constant would leave every headline in this pack timid at half the
  // column it can actually fill.
  display: "Anton", displayFallback: "Impact, sans-serif",
  body: "Space Grotesk", bodyFallback: "system-ui, sans-serif",
  mono: null,
  em: 0.44,
  // `Lines()`: lineHeight 0.94, letterSpacing "0.01em", textTransform uppercase.
  titleLine: 0.94, titleSpace: "0.01em",
  // M.slam   — outExpo, scale 2.4 -> 1, rotate -5deg, dur 0.26, stagger 0.055  -> "slam"
  // M.slideX — outExpo, translateX +/-140px,          dur 0.30, stagger 0.05   -> "streak"
  // (M.rise  — outQuint, translateY 46px — is the stage's built-in "rise" role, used as-is
  //  by every sub line, so it needs no slot here.)
  titlePreset: "slam", itemPreset: "streak",

  // ---- palette ----
  // The authored theme object: three stops and nothing else. `red` and `paper` are the
  // film's OM_TWEAKS colour knobs; `ink` is its literal. Called with {} to get the design's
  // own defaults; the brand's accents are then hue-mapped onto `accents` slot by slot at
  // their authored luminance, and every other stop rotates onto the brand's lead hue — so a
  // brand recolours the ghost word too, not just the headline.
  palette: (t) => ({ ink: t.ink || "#141414", paper: t.paper || "#f4f1ea", red: t.red || "#e63329" }),
  accents: ["red", "paper"],
  groundKey: "ink", inkKey: "ink", paperKey: "paper",
  dark: true,

  // ---- per-beat look ----
  // Each entry is the `Frame({ bg, fg })` call the matching scene component makes, plus its
  // copy block's `top`, its `Lines(...)` size and its `hi` (the accent the SECOND title line
  // takes — the film's signature, and the reason `Lines` passes `hi` separately at all).
  //   Hook      -> hook       Statement -> statement     Cascader -> feature
  //   Ticker    -> montage    Stats     -> stats         CTA      -> cta
  //
  // ONE FIELD, NOT SIX. The source alternates its ground per beat — Hook and Ticker on ink,
  // Statement and CTA on red, Cascader and Stats on paper — but the stage paints a SINGLE
  // ground for the whole film (`grounds[0]`, on #root and on the persistent world clip) and
  // the scene clips over it are transparent. A beat that declares a field the film never
  // paints does not get that field, it just loses its copy: this pack's Cascader and Stats
  // set their type in `ink`, and ink on the ink ground measures a contrast ratio of 1.00 —
  // a headline hidden at birth. Worse, `bg` is what `onField()` reads to colour the chrome
  // brand name, so a `red` or `paper` beat turns the brand lockup #141414 on black too.
  //
  // So every beat is stated on the field the film actually paints — ink, the Hook's own
  // ground and the one `groundKey` declares — using the source's OWN ink-field treatment,
  // which is not an invention: it is exactly what Hook and Ticker do (paper copy, red
  // accent). The beats whose authored field was red or paper keep that field's ENERGY by
  // carrying it as a slab instead of as a ground: the CTA's button, the Ticker's tiles and
  // the Hook's kicker are the red blocks. Each entry records its authored field in a comment
  // so the port stays auditable.
  look: {
    // Hook — authored Frame(bg ink, fg paper). Block at top 420; a filled red kicker slab;
    // Lines at 200 with the red second line; sub at 36 in rgba(paper,.72). Verbatim.
    "hook": {
      "bg": "ink",
      "fg": "paper",
      "hi": "red",
      "world": true,
      "top": 420,
      "size": 200,
      "upper": true,
      // padding 12/24, background red, colour paper, no radius — "tag" is the only hard-edged
      // FILLED kicker the stage draws (8px radius against the pill's 999px).
      "kicker": {
        "v": "tag",
        "bg": "red",
        "c": "paper"
      }
    },
    // Statement — authored Frame(bg red, fg paper), Lines(paper, ink, 224, filled:false): the
    // second line is an ink OUTLINE on the red field. On ink the outline inverts to the riot
    // red the field used to carry, which is the same figure/ground relationship one step over.
    "statement": {
      "bg": "ink",
      "fg": "paper",
      "hi": "red",
      "world": true,
      "top": 520,
      "size": 224,
      "upper": true
    },
    // Cascader — authored Frame(bg paper, fg ink); three per-letter cascade lines at 176 with
    // the middle one red; sub at 35. `media:false` renders it as the source's typographic
    // variant: three big underlined display lines, no picture. Inverted onto ink.
    "feature": {
      "bg": "ink",
      "fg": "paper",
      "hi": "red",
      "world": true,
      "top": 460,
      "size": 176,
      "upper": true,
      "card": {
        "v": "frame",
        "bg": "ink",
        "r": 0,
        "line": "paper"
      },
      "chips": {
        "v": "square",
        "colors": [
          "red",
          "ink"
        ],
        "text": "paper"
      }
    },
    // Ticker — authored Frame(bg ink, fg paper); three Anton rows at 108 in [paper,
    // red-outline, paper], block at top 430. Verbatim. Nothing in this film is ever rotated
    // except the ghost, so the tilt list is flat and the tiles are square-cornered; the tiles
    // carry the red.
    "montage": {
      "bg": "ink",
      "fg": "paper",
      "hi": "red",
      "world": true,
      "top": 430,
      "size": 120,
      "upper": true,
      "tile": {
        "bg": "red",
        "line": "paper",
        "label": "paper",
        "r": 0,
        "labelSize": 34
      },
      "tilts": [
        0,
        0,
        0,
        0
      ]
    },
    // Stats — authored Frame(bg paper, fg ink), Lines(ink, red, 150); each row is a 150px
    // Anton figure in `i===1 ? red : ink` over a 4px rule in the SAME colour — hence
    // `rule:true`, and the ink/red/ink column list inverted to paper/red/paper on ink.
    "stats": {
      "bg": "ink",
      "fg": "paper",
      "hi": "red",
      "world": true,
      "top": 380,
      "size": 150,
      "upper": true,
      "cols": [
        "paper",
        "red",
        "paper"
      ],
      "num": 150,
      "rule": true
    },
    // CTA — authored Frame(bg red, fg paper), Lines(paper, ink, 240) at top 540, LEFT
    // aligned, with a square INK button set in the display face and a paper url at 38. On
    // ink the field's red moves into the button, so the closing beat is still the red one.
    "cta": {
      "bg": "ink",
      "fg": "paper",
      "hi": "red",
      "world": true,
      "top": 540,
      "size": 240,
      "upper": true,
      "align": "left",
      "btn": {
        "v": "block",
        "bg": "red",
        "c": "paper"
      },
      "logoShape": "rounded"
    },
    // The shell the Ticker mechanic sits inside — the Ticker scene's own field, verbatim.
    "app": {
      "bg": "ink",
      "fg": "paper",
      "hi": "red",
      "cardBg": "ink",
      "line": "paper",
      "world": true,
      "upper": true
    }
  },

  // ---- camera + motion ----
  // The source's CAMS = ["smash","snapR","snapU","snapL","snapD","shrink"], indexed
  // (sc.index * 7 + 1) % 6 — so camMul 7, camOff 1. "A typographic camera: hard snaps, no
  // soft drifts." Mapped onto the stage's kinds:
  //   smash  (fs = 1 + 0.9*dIn, fades in)                 -> zoomIn   (zin 0.9)
  //   snapR  (enters from frame-left, exits +W*0.34)      -> pushR    (x 1, slide 0.34)
  //   snapU  (enters from below, exits -H*0.28)           -> pushU    (y 1, slide*0.8 = 0.27)
  //   snapL  (enters from frame-right, exits -W*0.34)     -> pushL
  //   snapD  (enters from above, exits +H*0.28)           -> pushD
  //   shrink (the default: fs = 1 - 0.5*dIn, fr = 4*dIn)  -> zoomOut  (zout 0.5, rot 0.8)
  cams: ["zoomIn", "pushR", "pushU", "pushL", "pushD", "zoomOut"], camMul: 7, camOff: 1,
  // Every magnitude read straight off `cam()`: zin 0.9 (smash's +0.9), zout 0.5 (shrink's
  // -0.5), slide 0.34 (the snap exits' W*0.34), rot 0.8 (shrink's 4deg against the stage's
  // 5deg — the only rotation the film's camera has), skew 0 (it has none), and the entrance /
  // exit windows seg(p,0,0.18) / seg(p,0.84,1). The drift is the film's oddity: its dx is a
  // pure ramp (-p*26) with NO sine, so driftX is 0 and only the ramp survives; dy is
  // sin(clock*0.6)*4 and dz is 1 + p*0.05.
  mag: { "x": 1, "y": 1, "rot": 0.8, "skew": 0, "zin": 0.9, "zout": 0.5, "driftX": 0, "driftY": 4, "driftZ": 0.05, "slide": 0.34, "inn": 0.18, "out": 0.84 },
  ambient: 2.0,
  energy: 1,
  // The source's Chrome carries NO mark — just the brand name in Anton and a "SOUND OFF"
  // outline tag. So no badge disc is drawn around nothing.
  badge: "none",
  // No footage, no filters. The film has not one image slot.
  media: false,

  // ---- the mechanics this pack owns ----
  // ONE, and it is authored: the film's `Ticker` scene is three Anton rows travelling at
  // three speeds in alternating directions off the ambient clock — FKticker exactly. Nothing
  // else is declared, so this pack never renders a typewriter, a ring or a toggle it was not
  // designed with.
  variants: { "Scroll": "ticker" },

  strings: {
    brandName: "Type Riot",
  },

  // ---- the world ----
  // The authored animated backdrop, verbatim: the film's `Ghost` component — a giant word set
  // in the display face at 460px, repeated three times on one nowrap run, drawn as a
  // 3px OUTLINE at 14% alpha with no fill, tilted -6deg about its own box centre and drifting
  // left at 60px per ambient second on a 2400px cycle. It sits behind every scene in the
  // source (Frame renders it inside every beat), which is exactly what the persistent world
  // layer is.
  //
  // The source hands each scene its own `ghost` word from OM_SCENES; the world is ONE layer
  // with no scene knowledge, so the authored deck of eighteen words is walked here instead,
  // advancing on the scroll's own wrap so the swap always lands off-frame.
  //
  // Pure in (theme, t, progress, utils); no Math.random and no Date, which is what lets it be
  // re-evaluated deterministically on every seek.
  World: (theme, t, p, u) => {
    var H = u.H;
    // The `ghost` field of every scene in the authored deck, in deck order.
    var WORDS = ["RIOT", "LOUD", "TYPE", "SCROLL", "COUNT", "BIG", "BEAT", "HOLD", "AIR",
      "RULES", "RAW", "FAST", "FREE", "GRID", "ZERO", "CAPS", "CUT", "NOW"];
    var travel = t * 60;
    var word = WORDS[Math.floor(travel / 2400) % WORDS.length];
    var run = word + " " + word + " " + word;
    var x = -(travel % 2400);
    // The source rotates the ghost with a CSS transform, whose origin is the element's own
    // box centre — so the pivot is derived from the run's width the way the browser derives
    // it. Anton's average advance is 0.44em; the box top is 34% of the frame and the line
    // box is one em tall.
    var wid = run.length * 0.44 * 460;
    var top = H * 0.34;
    return R("g", null,
      R("g", { transform: "translate(" + x.toFixed(2) + ",0) rotate(-6 " + (wid / 2).toFixed(1) + " " + (top + 230).toFixed(1) + ")" },
        R("text", {
          x: 0, y: top + 410,
          fontFamily: '"Anton", Impact, sans-serif', fontSize: 460, letterSpacing: "0.01em",
          fill: "none", stroke: rgba(theme.paper, 0.14), strokeWidth: 3,
        }, run)));
  },
};

module.exports = {
  buildComposition: (opts) => stage.build(SKIN, opts),
  STRINGS: { ...stage.BASE_STRINGS, ...SKIN.strings },
  SKIN,
};
