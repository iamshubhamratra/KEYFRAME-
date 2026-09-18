// JUNGLE TREK — skin for the shared FilmKit stage (services/film_stage.js).
//
// PORTED BY HAND from the handoff source
// (templete-design/keyframe-handoff/source/jungle-trek-film.jsx, `window.JungleTrek`), which
// is one of the HAND-BUILT films rather than a `FilmKit.make(cfg)` template — so the cfg
// fields below are read off the film's own constants: its `theme` object, its `M` entrance
// table, its `cam()` switch, its per-scene `Frame({ bg, fg, world })` calls and its
// `World`/`Leaf` components. Fonts and the authored deck come from `Jungle Trek.dc.html`.
//
// Display Alfa Slab One / body Cabin. Camera set
// ["zoomIn","pushL","pushU","pushR","drop","zoomOut"], indexed exactly as the source indexes
// its own (sc.index * 5 + 3).
// Entrances: title "machete" (the source's own M.machete, verbatim), items "pop" (its M.grow).
// Declares NO interaction mechanics — the hand-built film has none, so `variants` is empty
// and the pack never renders a typewriter, a ring or a toggle it was not designed with.
//
// palette / icon / World below are the AUTHORED functions, emitted verbatim — the world in
// particular is re-evaluated per seek against an SVG-DOM shim, so the backdrop is not a
// reinterpretation of the original, it IS the original.

const stage = require("../film_stage");

const SKIN = {
  id: "jungle-trek",
  label: "Jungle Trek",

  // ---- type ----
  // FH = '"Alfa Slab One", Georgia, serif'  /  FB = '"Cabin", system-ui, sans-serif'
  display: "Alfa Slab One", displayFallback: "Georgia, serif",
  body: "Cabin", bodyFallback: "system-ui, sans-serif",
  mono: null,
  em: 0.76,
  titleLine: 1.08, titleSpace: "0",
  titlePreset: "machete", itemPreset: "pop",

  // ---- palette ----
  // The authored `theme` object's colour stops. `deep`, `leaf` and `fly` are the film's
  // OM_TWEAKS knobs (the panel exposes deep + fly); leafDark / mist / paper are literals.
  // `shadow` is the film's other literal, #0d1f12 — the colour it paints every leaf vein,
  // every Statement leaf and the Feature card's drop shadow with. It is the design's darkest
  // stop, so it is given the name the source never bothered to and becomes `inkKey`; that
  // way it rotates with the brand instead of staying a hardcoded green.
  // Called with {} to get the design's own defaults; the brand's accents are then hue-mapped
  // onto `accents` slot by slot at their authored luminance, and every other stop rotates
  // onto the brand's lead hue — so a brand recolours the whole rainforest, not just the
  // headline.
  palette: (t) => ({ deep: t.deep || "#17301f", leaf: t.leaf || "#4e8a4a", leafDark: "#27502e", fly: t.fly || "#cde34f", mist: "#bfe6c8", paper: "#f1e9d2", shadow: "#0d1f12" }),
  accents: ["fly","leaf","paper"],
  groundKey: "deep", inkKey: "shadow", paperKey: "paper",
  dark: true,

  // ---- per-beat look (verbatim) ----
  // Each entry is the `Frame({ bg, fg, world })` call the matching scene component makes,
  // plus its copy block's `top`, its `Title(...)` size and its `hi` (the accent the second
  // title line takes — the source passes `theme.fly` on every beat). Every Title in this
  // film sets textTransform:"uppercase", hence `upper: true` throughout.
  look: {
    "hook": {
      "bg": "deep",
      "fg": "paper",
      "hi": "fly",
      "world": true,
      "top": 620,
      "size": 138,
      "upper": true,
      "kicker": {
        "v": "tag",
        "bg": "fly",
        "c": "deep"
      }
    },
    "statement": {
      "bg": "leafDark",
      "fg": "paper",
      "hi": "fly",
      "world": false,
      "top": 640,
      "size": 148,
      "upper": true
    },
    "feature": {
      "bg": "deep",
      "fg": "paper",
      "hi": "fly",
      "world": true,
      "top": 250,
      "size": 100,
      "upper": true,
      "card": {
        "v": "frame",
        "bg": "leafDark",
        "r": 28,
        "line": "paper"
      },
      "chips": {
        "v": "pill",
        "colors": [
          "fly",
          "leaf"
        ],
        "text": "deep"
      }
    },
    "montage": {
      "bg": "leaf",
      "fg": "deep",
      "hi": "paper",
      "world": false,
      "top": 260,
      "size": 100,
      "upper": true,
      "tile": {
        "bg": "deep",
        "line": "paper",
        "label": "deep",
        "r": 24,
        "labelSize": 27
      },
      "tilts": [
        0,
        0,
        0,
        0
      ]
    },
    "stats": {
      "bg": "deep",
      "fg": "paper",
      "hi": "fly",
      "world": false,
      "top": 420,
      "size": 108,
      "upper": true,
      "cols": [
        "fly",
        "leaf",
        "paper"
      ],
      "num": 156
    },
    "cta": {
      "bg": "deep",
      "fg": "paper",
      "hi": "fly",
      "world": true,
      "top": 520,
      "size": 124,
      "upper": true,
      "align": "center",
      "btn": {
        "v": "pill",
        "bg": "fly",
        "c": "deep"
      },
      "logoShape": "circle"
    },
    "app": {
      "bg": "leafDark",
      "fg": "paper",
      "hi": "fly",
      "cardBg": "deep",
      "line": "paper",
      "world": false,
      "upper": true
    }
  },

  // ---- camera + motion ----
  // The source's CAMS = ["part","vineSwing","climb","vineBack","canopyDrop","spin"], indexed
  // (sc.index * 5 + 3) % 6 — so camMul 5, camOff 3. Mapped onto the stage's kinds:
  //   part      (scales in from 1.6 with a fade — the leaves parting)   -> zoomIn
  //   vineSwing (swings in from frame-right at +8deg, exits left)       -> pushL
  //   climb     (rises from below the frame, exits upward)              -> pushU
  //   vineBack  (swings in from frame-left at -8deg, exits right)       -> pushR
  //   canopyDrop(falls from above at 1.16 scale, exits downward)        -> drop
  //   spin      (the default: scales UP from 0.55 with a fade + tilt)   -> zoomOut
  // The last one is deliberately NOT the stage's "spin": that kind pins scale at 0.7, while
  // "zoomOut" takes the scale from `mag.zout` and so reproduces the authored 0.55 exactly.
  cams: ["zoomIn","pushL","pushU","pushR","drop","zoomOut"], camMul: 5, camOff: 3,
  // Every magnitude read straight off `cam()`: x/y 1 (the swings and climbs travel a full
  // W / H), zin 0.6 (part's +0.6), zout 0.45 (the default's -0.45), slide 0.3 (the swing
  // exits' W*0.3), drift 10/8/0.06 (sin*10, cos*8, p*0.06), and the entrance / exit windows
  // seg(p,0,0.24) / seg(p,0.8,1). `rot` is the one compromise: the source tilts the two vine
  // swings 8deg and the default 6deg, while the stage multiplies 3x on a push and 5x on a
  // zoomOut, so 1.2 is the value that lands the zoomOut on its authored 6deg and keeps the
  // swings visibly canted without over-rotating anything.
  mag: {"x":1,"y":1,"rot":1.2,"skew":0,"zin":0.6,"zout":0.45,"driftX":10,"driftY":8,"driftZ":0.06,"slide":0.3,"inn":0.24,"out":0.8},
  ambient: 1.6,
  energy: 1,
  badge: "circle",

  // ---- the mechanics this pack owns ----
  // NONE. The hand-built film has no interaction beats — no typewriter, no ring, no toggle —
  // so nothing is declared and nothing is invented. Every scene renders one of the six
  // authored acts.
  variants: {},

  strings: {
    brandName: "Jungle Trek",
  },

  // The chrome mark, rendered once at build time — the source's Chrome: a leaf on its stem.
  icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
    R2("path", { d: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" }),
    R2("path", { d: "M2 21c0-3 1.85-5.36 5.08-6" })),

  // ---- the world ----
  // The authored animated backdrop, verbatim: the deep rainforest. A vast soft mist wash
  // across the middle of the frame, one hanging vine down the right edge whose two curves
  // breathe with the sway, SEVEN canopy leaves framing the edges (three dark, three mid-green
  // and one falling in from the bottom, alternating leaves counter-swaying against each
  // other, each with its own darker centre vein), seven fireflies wandering their own sine /
  // cosine paths and twinkling out of phase — each drawn twice, a wide soft halo under a
  // bright core — and four broad mist bands drifting left-to-right at four different speeds
  // and wrapping around the frame. The source's `Leaf` component is inlined below, because
  // the world is emitted standalone.
  //
  // Pure in (theme, t, progress, utils); no Math.random and no Date, which is what lets it be
  // re-evaluated deterministically on every seek.
  World: (theme, t, p, u) => {
    var W = u.W, H = u.H;
    // The source's <Leaf> component, inlined.
    function Leaf(x, y, s, rot, color, sway) {
      return R("g", { transform: "translate(" + x + "," + y + ") rotate(" + (rot + sway) + ") scale(" + s + ")" },
        R("path", { d: "M0 0 C 60 -40 150 -50 210 -10 C 150 40 60 40 0 0 Z", fill: color }),
        R("path", { d: "M6 -2 L 200 -12", stroke: rgba(theme.shadow, 0.3), strokeWidth: 4, strokeLinecap: "round" }));
    }
    var flies = Array.from({ length: 7 }).map(function (_, i) {
      var fx = W * 0.5 + Math.sin(t * (0.5 + i * 0.11) + i * 2) * (W * 0.36);
      var fy = H * 0.44 + Math.cos(t * (0.4 + i * 0.09) + i * 3) * (H * 0.3);
      var tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2.2 + i * 1.7));
      return R("g", { key: i },
        R("circle", { cx: fx, cy: fy, r: 12, fill: rgba(theme.fly, 0.18 * tw) }),
        R("circle", { cx: fx, cy: fy, r: 4.5, fill: rgba(theme.fly, 0.95 * tw) }));
    });
    var sway = Math.sin(t * 0.8) * 4;
    return R("g", null,
      R("ellipse", { cx: W * 0.5, cy: H * 0.4, rx: W * 0.8, ry: 700, fill: rgba(theme.mist, 0.06) }),
      R("path", { d: "M " + (W * 0.82) + " -20 q " + (10 + sway) + " 200 -30 420 q " + (-20 - sway) + " 160 24 320", stroke: theme.leafDark, strokeWidth: 10, fill: "none", strokeLinecap: "round" }),
      Leaf(W * 0.78, 700, 0.7, 60, theme.leafDark, sway),
      Leaf(-30, 180, 1.25, 26, theme.leafDark, sway),
      Leaf(-60, 380, 1.5, 10, theme.leaf, -sway),
      Leaf(W + 40, 260, 1.4, 156, theme.leaf, sway),
      Leaf(W + 60, H - 500, 1.6, 196, theme.leafDark, -sway),
      Leaf(-40, H - 320, 1.7, -16, theme.leaf, sway),
      Leaf(W * 0.3, H + 40, 1.5, -60, theme.leafDark, -sway),
      flies,
      Array.from({ length: 4 }).map(function (_, i) {
        return R("ellipse", { key: i, cx: ((t * (22 + i * 8) + i * 300) % (W + 600)) - 300, cy: 500 + i * 330, rx: 240, ry: 40, fill: rgba(theme.mist, 0.07) });
      }));
  },
};

module.exports = {
  buildComposition: (opts) => stage.build(SKIN, opts),
  STRINGS: { ...stage.BASE_STRINGS, ...SKIN.strings },
  SKIN,
};
