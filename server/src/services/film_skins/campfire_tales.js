// CAMPFIRE TALES — skin for the shared FilmKit stage (services/film_stage.js).
//
// PORTED BY HAND from the handoff source
// (templete-design/keyframe-handoff/source/campfire-tales-film.jsx + "Campfire Tales.dc.html").
// Unlike the 70 generated skins this one has no FilmKit cfg behind it: campfire-tales is a
// HAND-BUILT film, so every field below was read off the React source directly — the theme
// object, the `M` entrance table, the `cam()` switch, each scene function's literal paint,
// and the `World` component.
//
// A story told around a fire: flickering flames, rising sparks, twinkling constellation
// lines, pine silhouettes. Chapter-book copy, sentence case throughout — this film never
// shouts, so nothing here is uppercased.
//
// Display Caveat / body Andada Pro. Camera set ["zoomIn","pushR","pushU","pushL","pushD","zoomOut"],
// stepped by 3 exactly as the source's `CAMS[(sc.index * 3 + 1) % CAMS.length]`.
// Entrances: title "rise" (the source's M.ember), items "pop" (the source's M.kindle).
// Declares NO interaction mechanics — the hand-built film has six scene types and no
// interaction beat, and inventing one would break the handoff's one-mechanic-per-pack promise.
//
// palette / icon / World below are the AUTHORED functions, emitted verbatim — the world in
// particular is re-evaluated per seek against an SVG-DOM shim, so the backdrop is not a
// reinterpretation of the original, it IS the original.

const stage = require("../film_stage");

const SKIN = {
  id: "campfire-tales",
  label: "Campfire Tales",

  // ---- type ----
  // FH = '"Caveat", cursive'  /  FB = '"Andada Pro", Georgia, serif'
  display: "Caveat", displayFallback: "cursive",
  body: "Andada Pro", bodyFallback: "Georgia, serif",
  mono: null,
  // Caveat is a narrow handwriting script — its frequency-weighted advance measures ~0.42em,
  // so it sits with the condensed faces rather than the normal ones.
  // The source sets this weight on its display face explicitly.
  displayWeight: 700,
  em: 0.44,
  titleLine: 0.96, titleSpace: "0",
  titlePreset: "rise", itemPreset: "pop",

  // ---- palette ----
  // The authored theme function, verbatim from CampfireTales(). Called with {} to get the
  // design's own defaults; the brand's accents are then hue-mapped onto `accents` slot by
  // slot at their authored luminance, and every other stop rotates onto the brand's lead hue
  // — so a brand recolours the whole world, not just the headline.
  palette: (t) => ({ night: t.night || "#1b2233", pine: t.pine || "#2e4038", flame: t.flame || "#f2913d", glow: "#f7c66b", log: "#6b4a32", paper: "#f4ecdd", ink: "#241f18" }),
  accents: ["flame", "glow", "paper"],
  groundKey: "night", inkKey: "ink", paperKey: "paper",
  dark: true,

  // ---- per-beat look (transcribed from each scene function) ----
  look: {
    // Hook: Frame(bg night, fg paper, world true), copy at top 300, outline kicker in `glow`,
    // 136px title whose second line takes `glow`.
    "hook": {
      "bg": "night",
      "fg": "paper",
      "hi": "glow",
      "world": true,
      "top": 300,
      "size": 136,
      "upper": false,
      "kicker": {
        "v": "outline",
        "c": "glow"
      }
    },
    // Statement: Frame(bg pine, world false), copy at top 620, 148px, second line in `flame`.
    "statement": {
      "bg": "pine",
      "fg": "paper",
      "hi": "flame",
      "world": false,
      "top": 620,
      "size": 148,
      "upper": false
    },
    // Feature: the cream photo card rotated -1deg with an 18px radius, then alternating
    // flame / log pills with paper text.
    "feature": {
      "bg": "night",
      "fg": "paper",
      "hi": "glow",
      "world": true,
      "top": 250,
      "size": 104,
      "upper": false,
      "card": {
        "v": "tilt",
        "bg": "paper",
        "r": 18,
        "line": "paper"
      },
      "chips": {
        "v": "pill",
        "colors": [
          "flame",
          "log"
        ],
        "text": "paper"
      }
    },
    // Montage: cream tiles at r12 on the pine ground, each rotated by the source's own tilt
    // list, captioned underneath in the display face at 34px in `glow`.
    "montage": {
      "bg": "pine",
      "fg": "paper",
      "hi": "glow",
      "world": false,
      "top": 260,
      "size": 102,
      "upper": false,
      "tile": {
        "bg": "paper",
        "line": "paper",
        "label": "glow",
        "r": 12,
        "labelSize": 34
      },
      "tilts": [
        -2.5,
        2,
        1.5,
        -2
      ]
    },
    // Stats: the three figures cycle flame / glow / paper at the source's 190px.
    "stats": {
      "bg": "night",
      "fg": "paper",
      "hi": "flame",
      "world": false,
      "top": 420,
      "size": 104,
      "upper": false,
      "cols": [
        "flame",
        "glow",
        "paper"
      ],
      "num": 190
    },
    // CTA: centred, circular logo lockup, flame pill with the source's literal near-black ink.
    "cta": {
      "bg": "night",
      "fg": "paper",
      "hi": "glow",
      "world": true,
      "top": 420,
      "size": 118,
      "upper": false,
      "align": "center",
      "btn": {
        "v": "pill",
        "bg": "flame",
        "c": "#1c130a"
      },
      "logoShape": "circle"
    },
    // The shell an interaction beat would sit in. This pack declares no mechanics, so it is
    // only ever the fallback ground — kept coherent with the film's night-and-ember field.
    "app": {
      "bg": "night",
      "fg": "paper",
      "hi": "glow",
      "cardBg": "#232c40",
      "line": "paper",
      "world": true,
      "upper": false
    }
  },

  // ---- camera + motion ----
  // The source's own CAMS = ["lean","pageR","emberUp","pageL","settleDown","spin"], indexed
  // `(sc.index * 3 + 1) % 6` — hence camMul 3, camOff 1. Each kind maps onto the stage's
  // nearest equivalent, and `mag` is tuned so the maths comes out identical:
  //   lean       -> zoomIn   (fs 1+0.45*dIn, fade in, rot -3)  => zin 0.45, rot 1
  //   pageR      -> pushR    (fx -W*dIn,  rot -3, exit +W*0.26) => slide 0.26
  //   emberUp    -> pushU    (fy +H*dIn,  no rot, exit -H*0.22)
  //   pageL      -> pushL    (fx +W*dIn,  rot +3, exit -W*0.26)
  //   settleDown -> pushD    (fy -H*dIn,  no rot, exit +H*0.22)
  //   spin       -> zoomOut  (fs 1-0.35*dIn, fade in, rot +5)  => zout 0.35
  cams: ["zoomIn", "pushR", "pushU", "pushL", "pushD", "zoomOut"], camMul: 3, camOff: 1,
  // inn/out are the source's `seg(p,0,0.25)` and `seg(p,0.8,1)` windows; the drift triple is
  // its `Math.sin(clock*0.3)*8`, `Math.cos(clock*0.44)*7`, `1 + p*0.05`.
  mag: { "x": 1, "y": 1, "rot": 1, "skew": 0, "zin": 0.45, "zout": 0.35, "driftX": 8, "driftY": 7, "driftZ": 0.05, "slide": 0.26, "inn": 0.25, "out": 0.8 },
  ambient: 1.7,
  energy: 1,
  badge: "circle",

  // ---- the mechanics this pack owns ----
  // NONE. campfire-tales is a hand-built six-scene film with no interaction beat; declaring
  // one would invent a mechanism the design never had.
  variants: {},

  strings: {
    brandName: "Campfire Tales",
  },

  // The chrome mark, rendered once at build time — the source's Chrome() flame-on-a-stand.
  icon: (theme, fg, R2) => R2("svg", { width: 25, height: 25, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M12 2c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-3.5 3-5 4-8Z" }), R2("path", { d: "M12 14v7M8 21h8" })),

  // ---- the world ----
  // The authored World() component, verbatim. Pure in (theme, t, progress, utils); no
  // Math.random and no Date, which is what lets it be re-evaluated deterministically on
  // every seek. It draws, in paint order:
  //   1. sixteen twinkling stars across the top 42% of the sky
  //   2. a dashed constellation line strung between five points
  //   3. the left pine silhouette
  //   4. the right pine silhouette
  //   5. the ground glow ellipse, its alpha modulated by the two-sine flicker
  //   6. two crossed logs, rotated -7deg and +7deg
  //   7. the outer flame body, scaled by the same flicker
  //   8. the inner glow flame
  //   9. ten sparks rising and swaying out of the fire, fading as they climb
  World: (theme, t, p, u) => {
    const W = u.W, H = u.H;
    const flick = 0.8 + Math.sin(t * 7) * 0.1 + Math.sin(t * 13.7) * 0.06;
    const sparks = Array.from({ length: 10 }).map((_, i) => {
      const ph = ((t * (0.24 + (i % 4) * 0.07) + i / 10) % 1);
      const sx = W * 0.5 + Math.sin(ph * 9 + i) * (34 + ph * 70) + (i % 2 ? 30 : -30);
      const sy = H - 400 - ph * 820;
      return R("circle", { key: "sp" + i, cx: sx, cy: sy, r: 3.5 + (i % 3), fill: rgba(theme.flame, (1 - ph) * 0.85) });
    });
    const stars = Array.from({ length: 16 }).map((_, i) =>
      R("circle", { key: "st" + i, cx: (i * 173 + 60) % W, cy: (i * 97 + 60) % (H * 0.42), r: 2 + (i % 2), fill: rgba("#ffffff", 0.3 + 0.5 * Math.abs(Math.sin(t * 0.9 + i * 1.9))) }));
    return R("g", null,
      stars,
      R("path", { d: "M 120 620 L 320 560 L 560 640 L 800 540 L 960 610", stroke: rgba("#ffffff", 0.25), strokeWidth: 2, fill: "none", strokeDasharray: "3 10" }),
      R("path", { d: "M -30 " + (H - 240) + " L 130 " + (H - 560) + " L 290 " + (H - 240) + " Z", fill: theme.pine }),
      R("path", { d: "M " + (W - 260) + " " + (H - 240) + " L " + (W - 110) + " " + (H - 600) + " L " + (W + 40) + " " + (H - 240) + " Z", fill: theme.pine }),
      R("ellipse", { cx: W * 0.5, cy: H - 330, rx: 420, ry: 200, fill: rgba(theme.flame, 0.1 * flick) }),
      R("g", { transform: "translate(" + (W * 0.5) + "," + (H - 360) + ")" },
        R("rect", { x: -110, y: 44, width: 220, height: 22, rx: 11, fill: theme.log, transform: "rotate(-7)" }),
        R("rect", { x: -110, y: 44, width: 220, height: 22, rx: 11, fill: theme.log, transform: "rotate(7)" }),
        R("g", { transform: "scale(" + (0.94 + flick * 0.1) + ")" },
          R("path", { d: "M0 30 C -66 -8 -40 -80 -6 -122 C 8 -84 40 -80 46 -34 C 50 -6 34 26 0 30 Z", fill: theme.flame, opacity: 0.92 }),
          R("path", { d: "M0 22 C -34 -4 -22 -48 0 -76 C 16 -48 28 -30 24 -8 C 20 12 14 22 0 22 Z", fill: theme.glow }))),
      sparks);
  },
};

module.exports = {
  buildComposition: (opts) => stage.build(SKIN, opts),
  STRINGS: { ...stage.BASE_STRINGS, ...SKIN.strings },
  SKIN,
};
