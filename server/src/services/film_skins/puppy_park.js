// PUPPY PARK — skin for the shared FilmKit stage (services/film_stage.js).
//
// PORTED BY HAND from the handoff source
// (templete-design/keyframe-handoff/source/puppy-park-film.jsx, `window.PuppyPark`, plus
// "Puppy Park.dc.html" for the fonts and the authored 18-scene deck). Like cat-nap and
// campfire-tales this is a HAND-BUILT film rather than a `FilmKit.make(cfg)` template, so
// every field below is read off the React source directly — its `theme` object, its `M`
// entrance table, its `cam()` switch, each scene function's literal paint, and its
// `World`/`Paw` components.
//
// A sunny dog-park day: rolling grass hills, drifting clouds, a bouncing ball with squash,
// paw prints stamping across the scene. Sentence case throughout — this film never shouts,
// so nothing here is uppercased.
//
// Display Baloo 2 / body Nunito. Camera set ["zoomIn","hopU","pushR","zoomOut","pushL","drop"],
// stepped exactly as the source's `CAMS[(sc.index * 5 + 1) % CAMS.length]`.
// Entrances: title "bounce" (the source's M.bounce, curve-for-curve), items "pop" (M.wobble).
// Declares NO interaction mechanics — the hand-built film has six scene types and no
// interaction beat, and inventing one would break the handoff's one-mechanic-per-pack promise.
//
// palette / icon / World below are the AUTHORED functions, emitted verbatim — the world in
// particular is re-evaluated per seek against an SVG-DOM shim, so the backdrop is not a
// reinterpretation of the original, it IS the original.

const stage = require("../film_stage");

const SKIN = {
  id: "puppy-park",
  label: "Puppy Park",

  // ---- type ----
  // FH = '"Baloo 2", system-ui, sans-serif'  /  FB = '"Nunito", system-ui, sans-serif'
  display: "Baloo 2", displayFallback: "system-ui, sans-serif",
  body: "Nunito", bodyFallback: "system-ui, sans-serif",
  mono: null,
  // Baloo 2 is a rounded display sans of normal width — its frequency-weighted advance
  // measures ~0.56em, the same value the other Baloo 2 pack in this family carries.
  // The source sets this weight on its display face explicitly.
  displayWeight: 800,
  em: 0.56,
  titleLine: 1.02, titleSpace: "0",
  titlePreset: "bounce", itemPreset: "pop",

  // ---- palette ----
  // The authored theme object, verbatim from PuppyPark(). `sky`, `grass` and `ball` are the
  // film's three OM_TWEAKS colour knobs; grassDark / sun / paper / ink are literals. Called
  // with {} to get the design's own defaults; the brand's accents are then hue-mapped onto
  // `accents` slot by slot at their authored luminance, and every other stop rotates onto the
  // brand's lead hue — so a brand recolours the whole park, not just the headline.
  palette: (t) => ({ sky: t.sky || "#a5d8f0", grass: t.grass || "#8cc063", grassDark: "#4f8a3d", sun: "#f7c948", ball: t.ball || "#e8622c", paper: "#fdf6ec", ink: "#2b2320" }),
  // `ball` is the film's emphasis colour on every light ground (the second title line, the
  // CTA pill, half the chips); `sun` is the emphasis on the two dark-green beats; `grass` is
  // the field itself. Those are the three the design actually leans on.
  accents: ["ball", "sun", "grass"],
  groundKey: "sky", inkKey: "ink", paperKey: "paper",
  dark: false,

  // ---- per-beat look (transcribed from each scene function) ----
  look: {
    // Hook: Frame(bg sky, fg ink, world true), copy at top 300, an ink pill kicker in white
    // at .16em, a 128px title whose second line takes `ball` (Title(..., from = 1)).
    "hook": {
      "bg": "sky",
      "fg": "ink",
      "hi": "ball",
      "world": true,
      "top": 300,
      "size": 128,
      "upper": false,
      "kicker": {
        "v": "pill",
        "bg": "ink",
        "c": "#ffffff"
      }
    },
    // Statement: Frame(bg grassDark, fg #ffffff, world false), the 190px "Sit. Stay. Play."
    // stack whose second line takes `sun`. The source anchors it to bottom 380; the stage is
    // top-anchored, so the block sits at the top that puts the same stack in the same place.
    "statement": {
      "bg": "grassDark",
      "fg": "#ffffff",
      "hi": "sun",
      "world": false,
      "top": 660,
      "size": 190,
      "upper": false
    },
    // Feature: Frame(bg paper, fg ink, world false), copy at top 250, 112px title with `ball`
    // on line two, the white photo card rotated -1.5deg at r30, then CENTRED pills that
    // alternate grassDark / ball with white text.
    "feature": {
      "bg": "paper",
      "fg": "ink",
      "hi": "ball",
      "world": false,
      "top": 250,
      "size": 112,
      "upper": false,
      "card": {
        "v": "tilt",
        "bg": "#ffffff",
        "r": 30,
        "line": "ink"
      },
      "chips": {
        "v": "pill",
        "colors": [
          "grassDark",
          "ball"
        ],
        "text": "#ffffff",
        "center": true
      }
    },
    // Montage: Frame(bg sky, fg ink, world true), copy at top 250, 108px title, white tiles at
    // r26 rotated by the source's own tilt list, captioned underneath in the display face at
    // 30px in `ink`.
    "montage": {
      "bg": "sky",
      "fg": "ink",
      "hi": "ball",
      "world": true,
      "top": 250,
      "size": 108,
      "upper": false,
      "tile": {
        "bg": "#ffffff",
        "line": "ink",
        "label": "ink",
        "r": 26,
        "labelSize": 30
      },
      "tilts": [
        -4,
        3,
        2.5,
        -3
      ]
    },
    // Stats: Frame(bg grassDark, fg #ffffff, world false), copy at top 380, 110px title with
    // `sun` on line two, the three figures cycling ball / sun / white at the source's 176px.
    "stats": {
      "bg": "grassDark",
      "fg": "#ffffff",
      "hi": "sun",
      "world": false,
      "top": 380,
      "size": 110,
      "upper": false,
      "cols": [
        "ball",
        "sun",
        "#ffffff"
      ],
      "num": 176
    },
    // CTA: Frame(bg sky, fg ink, world true), CENTRED at top 430, circular logo disc, 128px
    // title with `ball` on line two, the ball-coloured pill with white type and the address
    // underneath.
    "cta": {
      "bg": "sky",
      "fg": "ink",
      "hi": "ball",
      "world": true,
      "top": 430,
      "size": 128,
      "upper": false,
      "align": "center",
      "btn": {
        "v": "pill",
        "bg": "ball",
        "c": "#ffffff"
      },
      "logoShape": "circle"
    },
    // The shell an interaction beat would sit in. This pack declares no mechanics, so it is
    // only ever the fallback ground — kept coherent with the film's sky-and-white field.
    "app": {
      "bg": "sky",
      "fg": "ink",
      "hi": "ball",
      "cardBg": "#ffffff",
      "line": "ink",
      "world": true,
      "upper": false
    }
  },

  // ---- camera + motion ----
  // The source's own CAMS = ["pounce","hopU","pushR","roll","pushL","hopD"], indexed
  // `(sc.index * 5 + 1) % 6` — hence camMul 5, camOff 1. Each kind maps onto the stage's
  // nearest equivalent, and `mag` is tuned so the maths comes out identical:
  //   pounce -> zoomIn   (fs 1+0.55*dIn, fades in, rot -5)        => zin 0.55
  //   hopU   -> hopU     (fy +H*dIn*k, rot +3, exit -H*0.22)      => exact
  //   pushR  -> pushR    (fx -W*dIn*k, exit +W*0.26)              => slide 0.26
  //   roll   -> zoomOut  (fs 1-0.42*dIn, fades in, rot +10)       => zout 0.42
  //   pushL  -> pushL    (fx +W*dIn*k, exit -W*0.26)              => slide 0.26
  //   hopD   -> drop     (fy -H*dIn*k, rot -3, exit +H*0.22)      => exact but for the tilt
  cams: ["zoomIn", "hopU", "pushR", "zoomOut", "pushL", "drop"], camMul: 5, camOff: 1,
  // rot 1 reproduces the hop pair's signature 3deg exactly; pounce (-5) and roll (+10) come
  // out a touch gentler, which is the only place a single shared magnitude cannot serve all
  // six. inn/out are the source's `seg(p,0,0.22)` and `seg(p,0.82,1)` windows; the drift
  // triple is its `Math.sin(clock*0.34)*9`, `Math.abs(Math.sin(clock*0.8))*-10` and
  // `1 + p*0.05`.
  mag: { "x": 1, "y": 1, "rot": 1, "skew": 0, "zin": 0.55, "zout": 0.42, "driftX": 9, "driftY": 10, "driftZ": 0.05, "slide": 0.26, "inn": 0.22, "out": 0.82 },
  ambient: 1.8,
  energy: 1,
  badge: "circle",

  // ---- the mechanics this pack owns ----
  // NONE. puppy-park is a hand-built six-scene film with no interaction beat; declaring one
  // would invent a mechanism the design never had.
  variants: {},

  strings: {
    brandName: "Puppy Park",
  },

  // The chrome mark, rendered once at build time — the source's Chrome(): the <Paw> drawn
  // inside the round badge, in the ground colour.
  icon: (theme, fg, R2) => R2("svg", { width: 26, height: 26, viewBox: "-20 -20 40 40", fill: theme.currentBg },
    R2("g", { transform: "translate(0,2) scale(0.95)" },
      R2("ellipse", { cx: 0, cy: 8, rx: 13, ry: 11 }),
      R2("circle", { cx: -12, cy: -6, r: 5 }),
      R2("circle", { cx: -4, cy: -10, r: 5 }),
      R2("circle", { cx: 4, cy: -10, r: 5 }),
      R2("circle", { cx: 12, cy: -6, r: 5 }))),

  // ---- the world ----
  // The authored World() component, verbatim. Pure in (theme, t, progress, utils); no
  // Math.random and no Date, which is what lets it be re-evaluated deterministically on
  // every seek. It draws, in paint order:
  //   1. the twelve-spoke sun ray wheel, slowly rotating at t*9 degrees
  //   2. the sun disc itself
  //   3. three three-lobed clouds drifting right at three different speeds and wrapping
  //   4. the far grass hill (grassDark), breathing up and down on a slow sine
  //   5. the near grass hill (grass), breathing in counter-phase
  //   6. five ink paw prints that stamp themselves on in sequence as the film progresses,
  //      alternating height and rotation like a real trail
  //   7. the tennis ball — bouncing, squashing on impact and travelling across the frame,
  //      with its white seam arc
  //   8. the ball's contact shadow, widening as the ball comes down
  // The source's <Paw> component is inlined below, because the world is emitted standalone.
  World: (theme, t, p, u) => {
    var W = u.W, H = u.H;
    // The source's <Paw> component, inlined.
    function Paw(key, x, y, s, color, o, rot) {
      return R("g", { key: key, transform: "translate(" + x + "," + y + ") rotate(" + rot + ") scale(" + s + ")", opacity: o, fill: color },
        R("ellipse", { cx: 0, cy: 8, rx: 13, ry: 11 }),
        R("circle", { cx: -12, cy: -6, r: 5 }),
        R("circle", { cx: -4, cy: -10, r: 5 }),
        R("circle", { cx: 4, cy: -10, r: 5 }),
        R("circle", { cx: 12, cy: -6, r: 5 }));
    }
    var bounceY = Math.abs(Math.sin(t * 2.2));
    var bx = ((t * 130) % (W + 300)) - 150;
    var by = H * 0.66 - bounceY * 240;
    var squash = 1 - (1 - bounceY) * 0.35;
    var clouds = [0, 1, 2].map(function (i) {
      var cx = ((t * (16 + i * 7) + i * 400) % (W + 500)) - 250;
      return R("g", { key: "cl" + i, transform: "translate(" + cx + "," + (170 + i * 130) + ")", fill: rgba("#ffffff", 0.85) },
        R("ellipse", { cx: 0, cy: 0, rx: 90 + i * 14, ry: 34 }),
        R("ellipse", { cx: 60, cy: -16, rx: 52, ry: 26 }),
        R("ellipse", { cx: -62, cy: -12, rx: 46, ry: 24 }));
    });
    var paws = [0, 1, 2, 3, 4].map(function (i) {
      var ph = u.clamp01(u.seg(p, 0.1, 0.9) * 6 - i);
      return Paw("pw" + i, 140 + i * 200, H - 210 - (i % 2) * 60, 1.1, theme.ink, u.clamp01(ph * 2) * 0.22, 12 + (i % 2) * -20);
    });
    return R("g", null,
      R("g", { transform: "translate(" + (W - 190) + ",210) rotate(" + (t * 9) + ")" },
        Array.from({ length: 12 }).map(function (_, i) {
          return R("rect", { key: "ry" + i, x: -7, y: -150, width: 14, height: 66, rx: 7, fill: rgba(theme.sun, 0.75), transform: "rotate(" + (i * 30) + ")" });
        })),
      R("circle", { cx: W - 190, cy: 210, r: 84, fill: theme.sun }),
      clouds,
      R("ellipse", { cx: W * 0.22, cy: H - 60 + Math.sin(t * 0.5) * 8, rx: W * 0.85, ry: 330, fill: theme.grassDark }),
      R("ellipse", { cx: W * 0.86, cy: H + 40 - Math.sin(t * 0.5) * 8, rx: W * 0.9, ry: 300, fill: theme.grass }),
      paws,
      R("g", { transform: "translate(" + bx + "," + by + ") scale(" + (1 / squash) + "," + squash + ")" },
        R("circle", { r: 46, fill: theme.ball }),
        R("path", { d: "M-46 0 A46 46 0 0 1 46 0", fill: "none", stroke: rgba("#ffffff", 0.85), strokeWidth: 9 })),
      R("ellipse", { cx: bx, cy: H * 0.66 + 58, rx: 60 * (0.5 + bounceY * 0.5), ry: 12, fill: rgba(theme.ink, 0.18) }));
  },
};

module.exports = {
  buildComposition: (opts) => stage.build(SKIN, opts),
  STRINGS: { ...stage.BASE_STRINGS, ...SKIN.strings },
  SKIN,
};
