// CAT NAP — skin for the shared FilmKit stage (services/film_stage.js).
//
// PORTED BY HAND from the handoff source
// (templete-design/keyframe-handoff/source/cat-nap-film.jsx, `window.CatNap`), which is one
// of the HAND-BUILT films rather than a `FilmKit.make(cfg)` template — so the cfg fields
// below are read off the film's own constants: its `theme` object, its `M` entrance table,
// its `cam()` switch, its per-scene `Frame(bg, fg, world)` calls and its `World`/`Cat`
// components. Fonts and the authored deck come from `Cat Nap.dc.html`.
//
// Display Lora / body Quicksand. Camera set ["drop","pushL","pushU","zoomOut","pushR","zoomIn"],
// indexed exactly as the source indexes its own (sc.index * 3 + 2).
// Entrances: title "drowse", items "pop".
// Declares NO interaction mechanics — the hand-built film has none, so `variants` is empty
// and the pack never renders a typewriter, a ring or a toggle it was not designed with.
//
// palette / icon / World below are the AUTHORED functions, emitted verbatim — the world in
// particular is re-evaluated per seek against an SVG-DOM shim, so the backdrop is not a
// reinterpretation of the original, it IS the original.

const stage = require("../film_stage");

const SKIN = {
  id: "cat-nap",
  label: "Cat Nap",

  // ---- type ----
  // FH = '"Lora", Georgia, serif'  /  FB = '"Quicksand", system-ui, sans-serif'
  display: "Lora", displayFallback: "Georgia, serif",
  body: "Quicksand", bodyFallback: "system-ui, sans-serif",
  mono: null,
  em: 0.52,
  titleLine: 1.06, titleSpace: "0",
  titlePreset: "drowse", itemPreset: "pop",

  // ---- palette ----
  // The authored theme object. `night` and `lamp` are the film's two OM_TWEAKS colour knobs;
  // yarn / paper / catInk are literals. Called with {} to get the design's own defaults; the
  // brand's accents are then hue-mapped onto `accents` slot by slot at their authored
  // luminance, and every other stop rotates onto the brand's lead hue — so a brand recolours
  // the whole twilight room, not just the headline.
  palette: (t) => ({ night: t.night || "#332a47", plum: "#59436b", lamp: t.lamp || "#f0b45c", yarn: "#c96b8e", paper: "#f6efe4", catInk: "#241d2e" }),
  accents: ["lamp","yarn","plum"],
  groundKey: "night", inkKey: "catInk", paperKey: "paper",
  dark: true,

  // ---- per-beat look (verbatim) ----
  // Each entry is the `Frame({ bg, fg, world })` call the matching scene component makes,
  // plus its copy block's `top`, its `Title(...)` size and its `hi` (the accent the second
  // title line takes).
  look: {
    "hook": {
      "bg": "night",
      "fg": "paper",
      "hi": "lamp",
      "world": true,
      "top": 880,
      "size": 124,
      "kicker": {
        "v": "outline",
        "c": "lamp"
      }
    },
    "statement": {
      "bg": "plum",
      "fg": "paper",
      "hi": "lamp",
      "world": false,
      "top": 640,
      "size": 172
    },
    "feature": {
      "bg": "paper",
      "fg": "catInk",
      "hi": "plum",
      "world": false,
      "top": 270,
      "size": 106,
      "card": {
        "v": "frame",
        "bg": "catInk",
        "r": 30,
        "line": "paper"
      },
      "chips": {
        "v": "pill",
        "colors": [
          "plum",
          "lamp"
        ],
        "text": "paper"
      }
    },
    "montage": {
      "bg": "night",
      "fg": "paper",
      "hi": "lamp",
      "world": false,
      "top": 280,
      "size": 104,
      "tile": {
        "bg": "#413852",
        "line": "paper",
        "label": "paper",
        "r": 24,
        "labelSize": 29
      },
      "tilts": [
        0,
        0,
        0,
        0
      ]
    },
    "stats": {
      "bg": "plum",
      "fg": "paper",
      "hi": "lamp",
      "world": false,
      "top": 400,
      "size": 104,
      "cols": [
        "lamp",
        "paper",
        "yarn"
      ],
      "num": 172
    },
    "cta": {
      "bg": "night",
      "fg": "paper",
      "hi": "lamp",
      "world": true,
      "top": 900,
      "size": 122,
      "align": "left",
      "btn": {
        "v": "pill",
        "bg": "lamp",
        "c": "catInk"
      },
      "logoShape": "circle"
    },
    "app": {
      "bg": "plum",
      "fg": "paper",
      "hi": "lamp",
      "cardBg": "catInk",
      "line": "paper",
      "world": false
    }
  },

  // ---- camera + motion ----
  // The source's CAMS = ["settle","stretchL","blink","curlIn","stretchR","zoom"], indexed
  // (sc.index * 3 + 2) % 6 — so camMul 3, camOff 2. Mapped onto the stage's kinds:
  //   settle  (drops in from above, scales down, exits downward) -> drop
  //   stretchL(enters from frame-right, exits left)              -> pushL
  //   blink   (eyelid wipe closing top+bottom, no translation)   -> pushU  (see notes)
  //   curlIn  (scales up from 0.64 with a -7deg unwind)          -> zoomOut
  //   stretchR(enters from frame-left, exits right)              -> pushR
  //   zoom    (the default: scales down from 1.4)                -> zoomIn
  cams: ["drop","pushL","pushU","zoomOut","pushR","zoomIn"], camMul: 3, camOff: 2,
  // Every magnitude read straight off `cam()`: y 0.5 (settle's -H*0.5), rot 0.67 (its 2deg
  // against the stage's 3deg), zin 0.4 (zoom's +0.4), zout 0.36 (curlIn's -0.36), slide 0.24
  // (the stretch exits' W*0.24), drift 7/6/0.045 (sin*7, cos*6, p*0.045), and the entrance /
  // exit windows seg(p,0,0.24) / seg(p,0.82,1).
  mag: {"x":1,"y":0.5,"rot":0.67,"skew":0,"zin":0.4,"zout":0.36,"driftX":7,"driftY":6,"driftZ":0.045,"slide":0.24,"inn":0.24,"out":0.82},
  ambient: 1.5,
  energy: 1,
  badge: "circle",

  // ---- the mechanics this pack owns ----
  // NONE. The hand-built film has no interaction beats — no typewriter, no ring, no toggle —
  // so nothing is declared and nothing is invented. Every scene renders one of the six
  // authored acts.
  variants: {},

  strings: {
    brandName: "Cat Nap",
  },

  // The chrome mark, rendered once at build time — the source's Chrome: an upside-down
  // teardrop (a curled paw-pad / falling zzz drop) with a dot beneath it.
  icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
    R2("path", { d: "M12 3c-1 3-4 4-4 8a4 4 0 0 0 8 0c0-4-3-5-4-8Z", transform: "rotate(180 12 11)" }),
    R2("circle", { cx: 12, cy: 16, r: 1 })),

  // ---- the world ----
  // The authored animated backdrop, verbatim: the twilight living room. A mullioned window
  // holding a bobbing moon and twelve drifting stars, the lamp's two-stop pulsing glow, nine
  // amber dust motes swimming on their own sine paths, a yarn ball rolling across the floor
  // (spinning on its own axis, trailing a slack thread that sags in time), and the cat
  // silhouette with its slow tail flick. The source's `Cat` component is inlined below,
  // because the world is emitted standalone.
  //
  // Pure in (theme, t, progress, utils); no Math.random and no Date, which is what lets it be
  // re-evaluated deterministically on every seek.
  World: (theme, t, p, u) => {
    var W = u.W, H = u.H;
    // The source's <Cat> component, inlined.
    function Cat(x, y, s, color, ct, o) {
      var tail = Math.sin(ct * 1.3) * 14;
      return R("g", { transform: "translate(" + x + "," + y + ") scale(" + s + ")", opacity: o },
        R("path", { d: "M60 0 Q 118 -6 128 -56 Q " + (130 + tail) + " -92 " + (106 + tail * 1.4) + " -96 Q 122 -60 96 -34 Q 78 -18 60 -16 Z", fill: color }),
        R("ellipse", { cx: 0, cy: 0, rx: 78, ry: 46, fill: color }),
        R("circle", { cx: -64, cy: -34, r: 34, fill: color }),
        R("path", { d: "M-88 -58 L-84 -92 L-62 -66 Z", fill: color }),
        R("path", { d: "M-46 -62 L-36 -94 L-20 -64 Z", fill: color }),
        R("path", { d: "M-80 -30 q 8 6 16 0", stroke: rgba("#f6efe4", 0.8), strokeWidth: 2.6, fill: "none", strokeLinecap: "round" }),
        R("path", { d: "M-56 -30 q 8 6 16 0", stroke: rgba("#f6efe4", 0.8), strokeWidth: 2.6, fill: "none", strokeLinecap: "round" }));
    }
    var glow = 0.55 + Math.sin(t * 0.9) * 0.12;
    var yx = ((t * 60) % (W + 400)) - 200;
    var motes = Array.from({ length: 9 }).map(function (_, i) {
      var mx = W * 0.62 + Math.sin(t * 0.4 + i * 2.2) * (60 + i * 14);
      var my = H * 0.32 + ((t * (10 + i * 3) + i * 90) % 500);
      return R("circle", { key: i, cx: mx, cy: my, r: 3 + (i % 3), fill: rgba(theme.lamp, 0.5 - (i % 3) * 0.1) });
    });
    return R("g", null,
      R("rect", { x: W * 0.1, y: 180, width: W * 0.52, height: 620, rx: 26, fill: theme.night, stroke: rgba(theme.paper, 0.35), strokeWidth: 10 }),
      R("line", { x1: W * 0.36, y1: 190, x2: W * 0.36, y2: 795, stroke: rgba(theme.paper, 0.35), strokeWidth: 8 }),
      R("circle", { cx: W * 0.28, cy: 320 + Math.sin(t * 0.2) * 10, r: 52, fill: theme.paper, opacity: 0.9 }),
      Array.from({ length: 12 }).map(function (_, i) {
        return R("circle", { key: i, cx: W * 0.13 + ((i * 137 + t * 14) % (W * 0.46)), cy: 230 + (i * 83) % 540, r: 2.4, fill: rgba("#ffffff", 0.4 + 0.4 * Math.abs(Math.sin(t * 1.1 + i))) });
      }),
      R("circle", { cx: W * 0.84, cy: H * 0.34, r: 300, fill: rgba(theme.lamp, glow * 0.3) }),
      R("circle", { cx: W * 0.84, cy: H * 0.34, r: 170, fill: rgba(theme.lamp, glow * 0.4) }),
      motes,
      R("g", { transform: "translate(" + yx + "," + (H - 250) + ") rotate(" + (t * 120) + ")" },
        R("circle", { r: 34, fill: theme.yarn }),
        R("path", { d: "M-30 -12 Q 0 -34 30 -10 M -32 6 Q 0 -8 32 8 M -24 22 Q 0 12 26 20", stroke: rgba("#ffffff", 0.5), strokeWidth: 5, fill: "none", strokeLinecap: "round" })),
      R("path", { d: "M" + (yx - 700) + " " + (H - 216) + " Q " + (yx - 340) + " " + (H - 190 + Math.sin(t) * 20) + " " + yx + " " + (H - 250), stroke: theme.yarn, strokeWidth: 6, fill: "none", strokeLinecap: "round", opacity: 0.85 }),
      Cat(W * 0.72, H - 300, 1.35, theme.catInk, t, 0.97));
  },
};

module.exports = {
  buildComposition: (opts) => stage.build(SKIN, opts),
  STRINGS: { ...stage.BASE_STRINGS, ...SKIN.strings },
  SKIN,
};
