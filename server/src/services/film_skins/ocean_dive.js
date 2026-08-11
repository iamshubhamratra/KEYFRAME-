// OCEAN DIVE — skin for the shared FilmKit stage (services/film_stage.js).
//
// PORTED BY HAND from the handoff source
// (templete-design/keyframe-handoff/source/ocean-dive-film.jsx, `window.OceanDive`), which is
// one of the HAND-BUILT films rather than a `FilmKit.make(cfg)` template — so every cfg field
// below is read off the film's own constants: its `theme` object, its `M` entrance table, its
// `cam()` switch, its per-scene `Frame(bg, fg, world)` calls and its `World`/`Fish`
// components. Fonts and the authored deck come from `Ocean Dive.dc.html`.
//
// Display Comfortaa / body Mulish. Camera set ["zoomIn","pushD","pushR","pushU","pushL","zoomOut"],
// indexed exactly as the source indexes its own (sc.index * 5 + 2).
// Entrances: title "rise" (the source's M.float), items "bounce" (its M.buoy).
// Declares NO interaction mechanics — the hand-built film has none, so `variants` is empty and
// the pack never renders a typewriter, a ring or a toggle it was not designed with.
//
// palette / groundCss / icon / World below are the AUTHORED functions, emitted verbatim — the
// world in particular is re-evaluated per seek against an SVG-DOM shim, so the backdrop is not
// a reinterpretation of the original, it IS the original.

const stage = require("../film_stage");

const SKIN = {
  id: "ocean-dive",
  label: "Ocean Dive",

  // ---- type ----
  // FH = '"Comfortaa", system-ui, sans-serif'  /  FB = '"Mulish", system-ui, sans-serif'
  display: "Comfortaa", displayFallback: "system-ui, sans-serif",
  body: "Mulish", bodyFallback: "system-ui, sans-serif",
  mono: null,
  // Comfortaa is a rounded geometric with circular bowls and generous sidebearings — wider
  // than a humanist sans, well short of a display slab.
  // The source sets this weight on its display face explicitly.
  displayWeight: 700,
  em: 0.6,
  // The source's Title(): lineHeight 1.1, no tracking.
  titleLine: 1.1, titleSpace: "0",
  // M.float = outQuint + opacity + translateY(60) -> "rise" (power4.out, y 46).
  // M.buoy  = outBack + opacity + translateY(90) + scale(0.8->1) -> "bounce" (back.out(2), y 110, scale 0.7).
  titlePreset: "rise", itemPreset: "bounce",

  // ---- palette ----
  // The authored `theme` object. `mid`, `aqua` and `coral` are the film's three OM_TWEAKS
  // colour knobs; shallow / abyss / paper are literals, and `ink` is the film's other inlined
  // literal (#04222e) — the fill behind every media card, tile and chip label. Called with {}
  // to get the design's own defaults; the brand's accents are then hue-mapped onto `accents`
  // slot by slot at their authored luminance, and every other stop rotates onto the brand's
  // lead hue — so a brand recolours the whole water column, not just the headline.
  palette: (t) => ({ shallow: "#14657a", mid: t.mid || "#0a3d52", abyss: "#06222e", aqua: t.aqua || "#57d6c9", coral: t.coral || "#ff8a5c", paper: "#eafaf6", ink: "#04222e" }),
  accents: ["aqua", "coral"],
  groundKey: "mid", inkKey: "ink", paperKey: "paper",
  dark: true,

  // The source's `Frame`: every scene is painted on a three-stop vertical water gradient —
  // the lit shallows at the top, the scene's own field through the middle, the abyss at the
  // bottom. It is the single most identifying thing about the film after the world itself.
  groundCss: (theme, bg) => "linear-gradient(180deg, " + theme.shallow + " 0%, " + bg + " 55%, " + theme.abyss + " 100%)",

  // ---- per-beat look (verbatim) ----
  // Each entry is the `Frame({ bg, fg, world })` call the matching scene component makes, plus
  // its copy block's `top`, its `Title(...)` size and its `hi` (the accent the second title
  // line takes — Hook/Feature/Stats/CTA hand it to aqua, Statement/Montage to coral).
  look: {
    "hook": {
      "bg": "mid",
      "fg": "paper",
      "hi": "aqua",
      "world": true,
      "top": 660,
      "size": 122,
      "kicker": {
        "v": "outline",
        "c": "aqua"
      }
    },
    "statement": {
      "bg": "abyss",
      "fg": "paper",
      "hi": "coral",
      "world": false,
      "top": 660,
      "size": 140
    },
    "feature": {
      "bg": "mid",
      "fg": "paper",
      "hi": "aqua",
      "world": true,
      "top": 250,
      "size": 102,
      "card": {
        "v": "glow",
        "bg": "ink",
        "glow": "aqua",
        "r": 34,
        "line": "paper"
      },
      "chips": {
        "v": "pill",
        "colors": [
          "aqua",
          "coral"
        ],
        "text": "ink"
      }
    },
    "montage": {
      "bg": "abyss",
      "fg": "paper",
      "hi": "coral",
      "world": false,
      "top": 260,
      "size": 100,
      "tile": {
        "bg": "ink",
        "line": "aqua",
        "label": "paper",
        "r": 30,
        "labelSize": 27,
        "glow": "aqua"
      },
      "tilts": [
        -2,
        1.5,
        2,
        -1.5
      ]
    },
    "stats": {
      "bg": "mid",
      "fg": "paper",
      "hi": "aqua",
      "world": false,
      "top": 410,
      "size": 100,
      "cols": [
        "aqua",
        "coral",
        "paper"
      ],
      "num": 158
    },
    "cta": {
      "bg": "mid",
      "fg": "paper",
      "hi": "aqua",
      "world": true,
      "top": 500,
      "size": 116,
      "align": "center",
      "btn": {
        "v": "pill",
        "bg": "aqua",
        "c": "ink"
      },
      "logoShape": "circle"
    },
    "app": {
      "bg": "mid",
      "fg": "paper",
      "hi": "aqua",
      "cardBg": "ink",
      "line": "paper",
      "world": true
    }
  },

  // ---- camera + motion ----
  // The source's CAMS = ["pressure","sink","currentR","surface","currentL","spin"], indexed
  // (sc.index * 5 + 2) % 6 — so camMul 5, camOff 2. Mapped onto the stage's kinds:
  //   pressure (scales down from 1.5 with a fade-in)              -> zoomIn
  //   sink     (enters from ABOVE, exits downward by H*0.26)      -> pushD
  //   currentR (enters from frame-left, exits right by W*0.28)    -> pushR
  //   surface  (enters from BELOW, exits upward by H*0.26)        -> pushU
  //   currentL (enters from frame-right, exits left by W*0.28)    -> pushL
  //   spin     (the default: scales UP from 0.6 with a 6deg unwind) -> zoomOut
  cams: ["zoomIn", "pushD", "pushR", "pushU", "pushL", "zoomOut"], camMul: 5, camOff: 2,
  // Every magnitude read straight off `cam()`: x/y 1 (the pushes travel a whole W/H), rot 1.33
  // (the currents' 4deg against the stage's 3deg base, which also lands spin's 6deg on
  // zoomOut's 5*rot), skew 0 (the source never skews), zin 0.5 (pressure's +0.5), zout 0.4
  // (spin's -0.4), slide 0.28 (the current exits' W*0.28), drift 12/14/0.05 (sin(c*0.28)*12,
  // sin(c*0.5)*14, p*0.05), and the entrance / exit windows seg(p,0,0.26) / seg(p,0.8,1).
  mag: { "x": 1, "y": 1, "rot": 1.33, "skew": 0, "zin": 0.5, "zout": 0.4, "driftX": 12, "driftY": 14, "driftZ": 0.05, "slide": 0.28, "inn": 0.26, "out": 0.8 },
  ambient: 1.6,
  energy: 1,
  badge: "circle",

  // ---- the mechanics this pack owns ----
  // NONE. The hand-built film has no interaction beats — no typewriter, no ring, no toggle —
  // so nothing is declared and nothing is invented. Every scene renders one of the six
  // authored acts.
  variants: {},

  strings: {
    brandName: "Ocean Dive",
  },

  // The chrome mark, rendered once at build time — the source's Chrome: a dive mask / eye,
  // one lens outline with a pupil at its centre.
  icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
    R2("path", { d: "M2 12c2-3 5-5 10-5s8 2 10 5c-2 3-5 5-10 5s-8-2-10-5Z" }),
    R2("circle", { cx: 12, cy: 12, r: 2.5 })),

  // ---- the world ----
  // The authored animated backdrop, verbatim: the descent. Three slow-rotating shafts of
  // surface light splayed from a vanishing point above the frame (each a wider trapezoid at a
  // deeper alpha, the whole fan swinging +/-5deg on a 0.22Hz sine), fourteen bubble rings
  // rising out of the bottom on four different speeds while sidling on their own sine, a
  // school of seven fish swimming left-to-right at three sizes and three depths with a
  // bobbing gait, the seabed's rolling four-hump wave line breathing on a 0.7Hz sine, and five
  // coral kelp fronds rooted along the floor swaying out of phase with each other. The
  // source's `Fish` component is inlined below, because the world is emitted standalone.
  //
  // Pure in (theme, t, progress, utils); no Math.random and no Date, which is what lets it be
  // re-evaluated deterministically on every seek.
  World: (theme, t, p, u) => {
    var W = u.W, H = u.H;
    // The source's <Fish> component, inlined.
    function Fish(x, y, s, color, flip) {
      return R("g", { transform: "translate(" + x + "," + y + ") scale(" + (flip ? -s : s) + "," + s + ")" },
        R("path", { d: "M0 0 Q 24 -16 48 0 Q 24 16 0 0 Z", fill: color }),
        R("path", { d: "M46 0 L 62 -10 L 62 10 Z", fill: color }));
    }
    var bubbles = Array.from({ length: 14 }).map(function (_, i) {
      var bx = 70 + (i * 83) % (W - 120) + Math.sin(t * 0.9 + i) * 26;
      var by = H + 60 - ((t * (70 + (i % 4) * 36) + i * 260) % (H + 300));
      return R("circle", { key: i, cx: bx, cy: by, r: 5 + (i % 4) * 5, fill: "none", stroke: rgba(theme.aqua, 0.4), strokeWidth: 2.5 });
    });
    var school = Array.from({ length: 7 }).map(function (_, i) {
      var fx = ((t * 90 + i * 150) % (W + 500)) - 250;
      var fy = H * 0.55 + Math.sin(t * 1.1 + i * 1.4) * 60 + (i % 3) * 70;
      return Fish(fx, fy, 0.8 + (i % 3) * 0.25, rgba(theme.aqua, 0.5), false);
    });
    return R("g", null,
      R("g", { transform: "rotate(" + (Math.sin(t * 0.22) * 5) + " " + (W / 2) + " -200)" },
        [-260, 0, 260].map(function (off, i) {
          return R("polygon", { key: i, points: (W / 2 + off - 130) + ",-40 " + (W / 2 + off + 130) + ",-40 " + (W / 2 + off + 320) + "," + (H * 0.72) + " " + (W / 2 + off - 320) + "," + (H * 0.72), fill: rgba(theme.aqua, 0.05 + i * 0.012) });
        })),
      bubbles, school,
      R("path", { d: "M -40 " + (H - 140) + " q 140 " + (-30 + Math.sin(t * 0.7) * 14) + " 280 0 t 280 0 t 280 0 t 280 0", stroke: rgba(theme.aqua, 0.25), strokeWidth: 5, fill: "none", strokeLinecap: "round" }),
      Array.from({ length: 5 }).map(function (_, i) {
        return R("path", { key: i, d: "M " + (90 + i * 220) + " " + (H - 40) + " q " + (Math.sin(t * 1.3 + i) * 18) + " -70 0 -130", stroke: rgba(theme.coral, 0.5), strokeWidth: 8, fill: "none", strokeLinecap: "round" });
      }));
  },
};

module.exports = {
  buildComposition: (opts) => stage.build(SKIN, opts),
  STRINGS: { ...stage.BASE_STRINGS, ...SKIN.strings },
  SKIN,
};
