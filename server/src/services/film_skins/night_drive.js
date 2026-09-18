// NIGHT DRIVE — skin for the shared FilmKit stage (services/film_stage.js).
//
// PORTED BY HAND from the handoff source
// (templete-design/keyframe-handoff/source/night-drive-film.jsx, `window.NightDrive`), which
// is one of the HAND-BUILT films rather than a `FilmKit.make(cfg)` template — so the cfg
// fields below are read off the film's own constants: its `theme` object, its `M` entrance
// table, its `cam()` switch (the "gearshift" camera), its per-scene `Frame(bg, fg, world)`
// calls and its `World` component. Fonts and the authored deck come from `Night Drive.dc.html`
// (Orbitron 500..900 + Exo 2 400..700, an 18-scene midnight-city-run deck).
//
// Display Orbitron / body Exo 2. Camera set ["zoomIn","pushR","pushU","pushL","zoomOut","pushD"],
// indexed exactly as the source indexes its own (sc.index * 7 + 2).
// Entrances: title "streak" (the source's M.streak IS this preset — translateX + skewX on
// expo.out), items "slam" (its M.flash: a strobe that settles down out of an oversized scale).
// Declares NO interaction mechanics — the hand-built film has none, so `variants` is empty and
// the pack never renders a typewriter, a ring or a toggle it was not designed with.
//
// palette / icon / World below are the AUTHORED functions, emitted verbatim — the world in
// particular is re-evaluated per seek against an SVG-DOM shim, so the backdrop is not a
// reinterpretation of the original, it IS the original.

const stage = require("../film_stage");

const SKIN = {
  id: "night-drive",
  label: "Night Drive",

  // ---- type ----
  // FH = '"Orbitron", system-ui, sans-serif'  /  FB = '"Exo 2", system-ui, sans-serif'
  display: "Orbitron", displayFallback: "system-ui, sans-serif",
  body: "Exo 2", bodyFallback: "system-ui, sans-serif",
  mono: null,
  // Orbitron is a wide squared techno face — much wider than a normal sans (~0.58) and not
  // far off Archivo Black — and the source adds 0.02em of tracking on top of it.
  // The source sets this weight on its display face explicitly.
  displayWeight: 800,
  em: 0.68,
  titleLine: 1.08, titleSpace: "0.02em",
  titlePreset: "streak", itemPreset: "slam",

  // ---- palette ----
  // The authored theme object. `asphalt`, `neon` and `magenta` are the film's three OM_TWEAKS
  // colour knobs; `amber` and `paper` are literals. `midnight` (#080a10) and `panel` (#0a0d14)
  // are the two darker fields the source inlines as hex — the Statement/Montage/CTA ground and
  // the card/tile/logo shell — named here so a brand rotation carries them too. Called with {}
  // to get the design's own defaults; the brand's accents are then hue-mapped onto `accents`
  // slot by slot at their authored luminance, and every other stop rotates onto the brand's
  // lead hue — so a brand recolours the whole city, not just the headline.
  palette: (t) => ({ asphalt: t.asphalt || "#0c0e14", midnight: "#080a10", panel: "#0a0d14", neon: t.neon || "#39e6d0", magenta: t.magenta || "#e04fa3", amber: "#f5b942", paper: "#eef2f7" }),
  accents: ["neon","magenta","amber"],
  groundKey: "asphalt", inkKey: "midnight", paperKey: "paper",
  dark: true,

  // ---- per-beat look (verbatim) ----
  // Each entry is the `Frame({ bg, fg, world })` call the matching scene component makes, plus
  // its copy block's `top`, its `Title(...)` size and its `hi` (the accent the second title
  // line takes and the colour its glow is thrown in).
  look: {
    "hook": {
      "bg": "asphalt",
      "fg": "paper",
      "hi": "neon",
      "world": true,
      "top": 700,
      "size": 108,
      "upper": true,
      "kicker": {
        "v": "outline",
        "c": "neon",
        "r": 8
      }
    },
    "statement": {
      "bg": "midnight",
      "fg": "paper",
      "hi": "magenta",
      "world": false,
      "top": 640,
      "size": 132,
      "upper": true
    },
    "feature": {
      "bg": "asphalt",
      "fg": "paper",
      "hi": "amber",
      "world": true,
      "top": 250,
      "size": 100,
      "upper": true,
      "card": {
        "v": "glow",
        "bg": "panel",
        "r": 22,
        "line": "neon",
        "glow": "neon"
      },
      "chips": {
        "v": "outline",
        "colors": [
          "neon",
          "magenta",
          "amber"
        ],
        "text": "panel"
      }
    },
    "montage": {
      "bg": "midnight",
      "fg": "paper",
      "hi": "neon",
      "world": false,
      "top": 260,
      "size": 100,
      "upper": true,
      "tile": {
        "bg": "panel",
        "line": "neon",
        "label": "paper",
        "r": 18,
        "glow": "neon",
        "labelSize": 24
      },
      "tilts": [
        0,
        0,
        0,
        0
      ]
    },
    "stats": {
      "bg": "asphalt",
      "fg": "paper",
      "hi": "neon",
      "world": false,
      "top": 400,
      "size": 100,
      "upper": true,
      "cols": [
        "neon",
        "magenta",
        "amber"
      ],
      "num": 148,
      "glowNums": true
    },
    "cta": {
      "bg": "midnight",
      "fg": "paper",
      "hi": "neon",
      "world": true,
      "top": 470,
      "size": 140,
      "upper": true,
      "align": "center",
      "btn": {
        "v": "glow",
        "bg": "neon",
        "c": "midnight"
      },
      "logoShape": "rounded"
    },
    "app": {
      "bg": "asphalt",
      "fg": "paper",
      "hi": "neon",
      "cardBg": "panel",
      "line": "neon",
      "world": true,
      "upper": true
    }
  },

  // ---- camera + motion ----
  // The source's CAMS = ["tunnel","laneR","overpass","laneL","brake","underpass"], indexed
  // (sc.index * 7 + 2) % 6 — so camMul 7, camOff 2. Its `cam()` is a GEARSHIFT: hard lateral
  // slams with skew, like changing lanes at speed. Mapped onto the stage's kinds:
  //   tunnel    (fs 1+0.7*dIn, fo=inn — falls out of an oversized frame)      -> zoomIn
  //   laneR     (fx -W*dIn, skew +10, exits +W*0.3)                           -> pushR
  //   overpass  (fy +H*dIn, exits -H*0.24, fr +2)                             -> pushU
  //   laneL     (fx +W*dIn, skew -10, exits -W*0.3)                           -> pushL
  //   brake     (fs 1-0.3*dIn, fo=inn, fy -60 — the nose dip under braking)   -> zoomOut
  //   underpass (the default: fy -H*dIn, exits +H*0.24, fr -2)                -> pushD
  cams: ["zoomIn","pushR","pushU","pushL","zoomOut","pushD"], camMul: 7, camOff: 2,
  // Every magnitude read straight off `cam()`: x/y 1 (the full-frame lane and over/underpass
  // slams), rot 0.67 (its 2deg against the stage's 3deg), skew 10 (the lane-change shear),
  // zin 0.7 (tunnel's +0.7), zout 0.3 (brake's -0.3), slide 0.3 (the lane exits' W*0.3, which
  // the stage scales by 0.8 for the vertical exits and so lands exactly on the source's
  // H*0.24), drift 6/2.5/0.07 (sin*6, sin*2.5, p*0.07), and the entrance / exit windows
  // seg(p,0,0.2) / seg(p,0.82,1).
  mag: {"x":1,"y":1,"rot":0.67,"skew":10,"zin":0.7,"zout":0.3,"driftX":6,"driftY":2.5,"driftZ":0.07,"slide":0.3,"inn":0.2,"out":0.82},
  ambient: 2.1,
  energy: 1,
  // The source's Chrome badge is a transparent rounded box with a 2px rule and a neon bloom —
  // an OUTLINE mark, not a filled disc.
  badge: "outline",

  // ---- the mechanics this pack owns ----
  // NONE. The hand-built film has no interaction beats — no typewriter, no ring, no toggle —
  // so nothing is declared and nothing is invented. Every scene renders one of the six
  // authored acts.
  variants: {},

  strings: {
    brandName: "Night Drive",
  },

  // The chrome mark, rendered once at build time — the source's Chrome: a ringed hub with four
  // cardinal ticks (a steering boss / compass rose). Stroked in the ACCENT rather than the
  // ground, because this pack's badge is an outline and the disc behind it is transparent.
  icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.accent, strokeWidth: 2.25, strokeLinecap: "round", strokeLinejoin: "round" },
    R2("path", { d: "M12 2v4M12 18v4M2 12h4M18 12h4" }),
    R2("circle", { cx: 12, cy: 12, r: 5 })),

  // ---- the world ----
  // The authored animated backdrop, verbatim: the midnight city run. A low haze band across
  // the skyline, a twenty-four-cell window grid whose lights blink on their own sine, nine neon
  // light trails streaking right-to-left at four different speeds in the three accent colours,
  // the perspective road plate opening from the horizon to the bottom corners, six centre-line
  // dashes rushing up it on a squared ramp (each growing wider and taller and brighter as it
  // comes at the lens), and the neon horizon bloom pulsing over the vanishing point.
  //
  // Pure in (theme, t, progress, utils); no Math.random and no Date, which is what lets it be
  // re-evaluated deterministically on every seek.
  World: (theme, t, p, u) => {
    var W = u.W, H = u.H;
    // The neon light trails — four speeds, three colours, wrapping past the lens.
    var trails = Array.from({ length: 9 }).map(function (_, i) {
      var speed = 340 + (i % 4) * 140;
      var x = W + 400 - ((t * speed + i * 470) % (W + 900));
      var y = 210 + (i * 173) % (H - 700);
      var len = 180 + (i % 3) * 160;
      var col = i % 3 === 0 ? theme.neon : i % 3 === 1 ? theme.magenta : theme.amber;
      return R("rect", { key: i, x: x, y: y, width: len, height: 5 + (i % 2) * 3, rx: 4, fill: col, opacity: 0.5 + (i % 3) * 0.16 });
    });
    // The road's centre line, rushing up the perspective on a squared ramp.
    var dashes = Array.from({ length: 6 }).map(function (_, i) {
      var ph = ((t * 0.55 + i / 6) % 1);
      var e = ph * ph;
      var y = H * 0.62 + e * (H * 0.38);
      var w = 10 + e * 150;
      return R("rect", { key: i, x: W / 2 - w / 2, y: y, width: w, height: 8 + e * 40, rx: 6, fill: rgba(theme.paper, 0.25 + e * 0.4) });
    });
    // The skyline's window grid — eight across, three down, each blinking on its own phase.
    var windows = Array.from({ length: 24 }).map(function (_, i) {
      var bx = 60 + (i % 8) * 130, by = 300 + Math.floor(i / 8) * 90;
      var on = Math.sin(t * 0.7 + i * 2.6) > 0.1;
      return R("rect", { key: i, x: bx, y: by, width: 30, height: 44, rx: 3, fill: on ? rgba(theme.amber, 0.55) : rgba(theme.paper, 0.07) });
    });
    return R("g", null,
      R("rect", { x: 0, y: 260, width: W, height: 320, fill: rgba(theme.paper, 0.03) }),
      windows, trails,
      R("path", { d: "M 0 " + H + " L " + (W * 0.34) + " " + (H * 0.6) + " L " + (W * 0.66) + " " + (H * 0.6) + " L " + W + " " + H + " Z", fill: rgba(theme.paper, 0.045) }),
      dashes,
      R("ellipse", { cx: W / 2, cy: H * 0.6, rx: 320, ry: 60, fill: rgba(theme.neon, 0.1 + Math.abs(Math.sin(t * 0.8)) * 0.08) }));
  },
};

module.exports = {
  buildComposition: (opts) => stage.build(SKIN, opts),
  STRINGS: { ...stage.BASE_STRINGS, ...SKIN.strings },
  SKIN,
};
