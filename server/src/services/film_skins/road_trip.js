// ROAD TRIP — skin for the shared FilmKit stage (services/film_stage.js).
//
// PORTED BY HAND from the handoff source
// (templete-design/keyframe-handoff/source/road-trip-film.jsx, `window.RoadTrip`), which is
// one of the HAND-BUILT films rather than a `FilmKit.make(cfg)` template — so the cfg fields
// below are read off the film's own constants: its `theme` object, its `M` entrance table,
// its `cam()` switch, its per-scene `Frame(bg, fg, world)` calls and its `World`/`Van`
// components. Fonts and the authored deck come from `Road Trip.dc.html`
// (Permanent Marker + Karla; an 18-scene Hook/Statement/Feature/Montage/Stats/CTA deck).
//
// Display Permanent Marker / body Karla. Camera set
// ["drop","pushR","zoomIn","hopU","pushL","zoomOut"], indexed exactly as the source indexes
// its own (sc.index * 7 + 4).
// Entrances: title "stamp", items "stamp" — the film's `M.stamp` is the only entrance it
// gives to a title AND to its kicker, chips, CTA logo and CTA button, so both roles carry it.
// Declares NO interaction mechanics — the hand-built film has none, so `variants` is empty
// and the pack never renders a typewriter, a ring or a toggle it was not designed with.
//
// palette / icon / World below are the AUTHORED functions, emitted verbatim — the world in
// particular is re-evaluated per seek against an SVG-DOM shim, so the backdrop is not a
// reinterpretation of the original, it IS the original.

const stage = require("../film_stage");

const SKIN = {
  id: "road-trip",
  label: "Road Trip",

  // ---- type ----
  // FH = '"Permanent Marker", cursive'  /  FB = '"Karla", system-ui, sans-serif'
  display: "Permanent Marker", displayFallback: "cursive",
  body: "Karla", bodyFallback: "system-ui, sans-serif",
  mono: null,
  // Permanent Marker is a fat felt-tip face — wider than Caveat (0.44), narrower than a slab.
  // Calibrated off the film's own tightest line: the Statement sets "is the trip." (12
  // characters) at 150px inside the 940px column, which only fits at ~0.52-0.54 per em.
  em: 0.54,
  titleLine: 1.08, titleSpace: "0",
  titlePreset: "stamp", itemPreset: "stamp",

  // ---- palette ----
  // The authored theme object, verbatim from RoadTrip(). `paper`, `route` and `van` are the
  // film's three OM_TWEAKS colour knobs; sun / sky / ink are literals. Called with {} to get
  // the design's own defaults; the brand's accents are then hue-mapped onto `accents` slot by
  // slot at their authored luminance, and every other stop rotates onto the brand's lead hue —
  // so a brand recolours the whole paper map, not just the headline.
  palette: (t) => ({ paper: t.paper || "#f2e8d5", route: t.route || "#e05e4e", van: t.van || "#3f8f8a", sun: "#eec96f", sky: "#cfe8ee", ink: "#33291f" }),
  // `route` is the marker line, the Hook kicker, the second title line on every light beat and
  // the CTA's whole field; `van` is the Statement ground and the bus itself; `sun` is the
  // emphasis on the two dark grounds (Statement, Stats) and the CTA. `sky` is only ever the
  // van's window glass, so it is not an emphasis slot.
  accents: ["route", "van", "sun"],
  groundKey: "paper", inkKey: "ink", paperKey: "paper",
  dark: false,

  // ---- per-beat look (transcribed from each scene function) ----
  // Each entry is the `Frame({ bg, fg, world })` call the matching scene component makes, plus
  // its copy block's `top`, its `Title(...)` size and its `hi` (the accent the second title
  // line takes). Nothing in this film is uppercased, so `upper` is false throughout.
  look: {
    // Hook: Frame(bg paper, fg ink, world true) — the only beat that shows the map world in
    // the source. Copy at top 260; the rotated -2deg route-coloured tag reading
    // "FIVE FRIENDS • ONE VAN"; the 128px stack whose SECOND line takes `route`.
    "hook": {
      "bg": "paper",
      "fg": "ink",
      "hi": "route",
      "world": true,
      "top": 260,
      "size": 128,
      "upper": false,
      "kicker": {
        "v": "tag",
        "bg": "route",
        "c": "#ffffff"
      }
    },
    // Statement: Frame(bg van, fg #ffffff, world false), copy at top 560, the 150px stack with
    // `sun` on line two. The source paints its own dashed road and a big paper-coloured van
    // across the lower third of this beat.
    "statement": {
      "bg": "van",
      "fg": "#ffffff",
      "hi": "sun",
      "world": false,
      "top": 560,
      "size": 150,
      "upper": false
    },
    // Feature: Frame(bg sun, fg ink, world false), copy at top 260, 110px title with `route`
    // on line two. The media plate is the film's POLAROID — a white card with a taped top edge
    // and a handwritten caption — which is exactly the stage's "paper" card treatment. The
    // chips are the source's rotated ink/route rounded rectangles, CENTRED.
    "feature": {
      "bg": "sun",
      "fg": "ink",
      "hi": "route",
      "world": false,
      "top": 260,
      "size": 110,
      "upper": false,
      "card": {
        "v": "paper",
        "bg": "#ffffff",
        "r": 10,
        "line": "ink"
      },
      "chips": {
        "v": "square",
        "colors": [
          "ink",
          "route"
        ],
        "text": "#ffffff",
        "center": true
      }
    },
    // Montage: Frame(bg paper, fg ink, world false), copy at top 250, 106px title with `route`
    // on line two, then FOUR taped polaroids on the source's own tilt list, each captioned in
    // the marker face at 26px.
    "montage": {
      "bg": "paper",
      "fg": "ink",
      "hi": "route",
      "world": false,
      "top": 250,
      "size": 106,
      "upper": false,
      "tile": {
        "bg": "#ffffff",
        "line": "ink",
        "label": "ink",
        "r": 8,
        "labelSize": 26
      },
      "tilts": [
        -3.5,
        2.5,
        3,
        -2
      ]
    },
    // Stats: Frame(bg ink, fg paper, world false), copy at top 400, 110px title with `sun` on
    // line two, then three 158px odometer figures cycling route / van / sun.
    "stats": {
      "bg": "ink",
      "fg": "paper",
      "hi": "sun",
      "world": false,
      "top": 400,
      "size": 110,
      "upper": false,
      "cols": [
        "route",
        "van",
        "sun"
      ],
      "num": 158
    },
    // CTA: Frame(bg route, fg #ffffff, world false), CENTRED at top 460 — the 148px rounded
    // white logo tile, the 136px stack with `sun` on line two, the white r14 button in the
    // marker face, then the address.
    "cta": {
      "bg": "route",
      "fg": "#ffffff",
      "hi": "sun",
      "world": false,
      "top": 460,
      "size": 136,
      "upper": false,
      "align": "center",
      "btn": {
        "v": "block",
        "bg": "#ffffff",
        "c": "route"
      },
      "logoShape": "rounded"
    },
    // App shell — inert for this pack (`variants` is empty, so no interaction beat is ever
    // routed), but stated rather than defaulted so the fallback in film_stage cannot invent a
    // shell out of the Statement's white-on-teal.
    "app": {
      "bg": "paper",
      "fg": "ink",
      "hi": "route",
      "cardBg": "#ffffff",
      "line": "ink",
      "world": true,
      "upper": false
    }
  },

  // ---- camera + motion ----
  // The source's CAMS = ["dip","swerveR","odometer","hill","swerveL","spinIn"], indexed
  // (sc.index * 7 + 4) % 6 — so camMul 7, camOff 4. Mapped onto the stage's kinds:
  //   dip     (starts a frame ABOVE at scale 1.1, settles, exits downward)  -> drop
  //   swerveR (enters from frame-left with a -5deg lean, exits right)       -> pushR
  //   odometer(punches in from scale 1.5 with a fade and a +3deg twist)     -> zoomIn
  //   hill    (climbs up from a frame BELOW at scale 0.88, exits upward)    -> hopU
  //   swerveL (enters from frame-right with a +5deg lean, exits left)       -> pushL
  //   spinIn  (the default: unwinds up from scale 0.6 with a -6deg spin)    -> zoomOut
  cams: ["drop", "pushR", "zoomIn", "hopU", "pushL", "zoomOut"], camMul: 7, camOff: 4,
  // Every magnitude read straight off `cam()`: x/y 1 (the swerves and the dip/hill all travel
  // a full W/H), zin 0.5 (odometer's +0.5), zout 0.4 (spinIn's -0.4), slide 0.3 (the swerve
  // exits' W*0.3), drift 8/3.5/0.055 (sin(clock*0.4)*8, sin(clock*1.6)*3.5, p*0.055), and the
  // entrance / exit windows seg(p,0,0.23) / seg(p,0.81,1). `rot` 1.2 is the least-squares fit
  // across the four rotating kinds — the swerves want 5deg, the odometer 3deg, spinIn 6deg,
  // and the hill none at all.
  mag: { "x": 1, "y": 1, "rot": 1.2, "skew": 0, "zin": 0.5, "zout": 0.4, "driftX": 8, "driftY": 3.5, "driftZ": 0.055, "slide": 0.3, "inn": 0.23, "out": 0.81 },
  ambient: 1.7,
  energy: 1,
  // The source's Chrome badge is a 47px tile at borderRadius 12, rotated -4deg — a square, not
  // a disc.
  badge: "square",

  // ---- the mechanics this pack owns ----
  // NONE. The hand-built film has no interaction beats — no typewriter, no ring, no toggle —
  // so nothing is declared and nothing is invented. Every scene renders one of the six
  // authored acts.
  variants: {},

  strings: {
    brandName: "Road Trip",
  },

  // The chrome mark, rendered once at build time — the source's Chrome: a map pin, drawn as
  // one teardrop outline with a hole punched at its centre.
  icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
    R2("circle", { cx: 12, cy: 10, r: 3 }),
    R2("path", { d: "M12 2a8 8 0 0 1 8 8c0 5.4-8 12-8 12S4 15.4 4 10a8 8 0 0 1 8-8Z" })),

  // ---- the world ----
  // The authored animated backdrop, verbatim: the paper map. Five faint contour rings printed
  // across the sheet, the little compass cross at top-left, the dotted GHOST of the whole
  // route, the solid marker route drawing itself along that same curve (a 2100-unit dash
  // offset unwinding on the film's own progress), two location pins that pop with an outBack
  // overshoot as the line reaches them, and the van scooting up the route — bobbing on its
  // suspension, roof rack, two windows, two wheels with hubcaps in the window glass. The
  // source's `Van` component is inlined below, because the world is emitted standalone.
  //
  // Pure in (theme, t, progress, utils); no Math.random and no Date, which is what lets it be
  // re-evaluated deterministically on every seek.
  World: (theme, t, p, u) => {
    var W = u.W, H = u.H, seg = u.seg, ease = u.ease, clamp01 = u.clamp01;
    // The source's <Van> component, inlined.
    function Van(x, y, s, color, windows, ct) {
      var bob = Math.sin(ct * 5) * 2.5;
      return R("g", { transform: "translate(" + x + "," + (y + bob) + ") scale(" + s + ")" },
        R("rect", { x: -70, y: -52, width: 140, height: 52, rx: 16, fill: color }),
        R("rect", { x: -70, y: -18, width: 140, height: 20, rx: 8, fill: color }),
        R("rect", { x: -52, y: -44, width: 34, height: 24, rx: 6, fill: windows }),
        R("rect", { x: -8, y: -44, width: 34, height: 24, rx: 6, fill: windows }),
        R("circle", { cx: -38, cy: 6, r: 15, fill: "#2e2a26" }),
        R("circle", { cx: 42, cy: 6, r: 15, fill: "#2e2a26" }),
        R("circle", { cx: -38, cy: 6, r: 6, fill: windows }),
        R("circle", { cx: 42, cy: 6, r: 6, fill: windows }),
        R("rect", { x: -74, y: -60, width: 148, height: 10, rx: 5, fill: rgba("#2e2a26", 0.8) }));
    }
    var route = "M -60 1560 C 240 1450 180 1180 470 1120 C 760 1060 700 830 980 760 C 1130 720 1160 640 1140 560";
    var len = 2100;
    var draw = seg(p, 0.05, 0.92);
    var vx = -60 + (1140 - -60) * draw;
    var pins = [[470, 1120], [980, 760]];
    return R("g", null,
      Array.from({ length: 5 }).map(function (_, i) {
        return R("circle", { key: i, cx: (i * 260 + 120) % W, cy: (i * 460 + 240) % H, r: 60 + (i % 3) * 26, fill: "none", stroke: rgba(theme.ink, 0.07), strokeWidth: 2 });
      }),
      R("path", { d: "M 90 300 l 40 0 m -20 -20 l 0 40", stroke: rgba(theme.ink, 0.16), strokeWidth: 5, strokeLinecap: "round" }),
      R("path", { d: route, fill: "none", stroke: rgba(theme.route, 0.25), strokeWidth: 12, strokeLinecap: "round", strokeDasharray: "2 30" }),
      R("path", { d: route, fill: "none", stroke: theme.route, strokeWidth: 12, strokeLinecap: "round", strokeDasharray: "" + len, strokeDashoffset: "" + (len * (1 - draw)), opacity: 0.9 }),
      pins.map(function (pin, i) {
        var px = pin[0], py = pin[1];
        var gate = i === 0 ? 0.33 : 0.68;
        var on = draw > gate;
        var e = ease.outBack(clamp01((draw - gate) * 8));
        return R("g", { key: i, transform: "translate(" + px + "," + (py - 40) + ") scale(" + (on ? e : 0) + ")" },
          R("path", { d: "M0 34 C -22 8 -24 -8 -12 -22 C -4 -30 4 -30 12 -22 C 24 -8 22 8 0 34 Z", fill: theme.ink }),
          R("circle", { cx: 0, cy: -8, r: 9, fill: theme.paper }));
      }),
      Van(vx, 1520 - draw * 940, 1.15, theme.van, theme.sky, t));
  },
};

module.exports = {
  buildComposition: (opts) => stage.build(SKIN, opts),
  STRINGS: { ...stage.BASE_STRINGS, ...SKIN.strings },
  SKIN,
};
