// STUDIO LAUNCH — skin for the shared FilmKit stage (services/film_stage.js).
//
// PORTED BY HAND from the handoff source
// (templete-design/keyframe-handoff/source/studio-launch-film.jsx, `window.StudioLaunch`),
// which is one of the HAND-BUILT films rather than a `FilmKit.make(cfg)` template — so every
// cfg field below is read off the film's own constants: its `theme` object, the `M` table it
// draws every entrance from (window.KFMotion / motion-presets.js), `M.CAMERA_CYCLE` +
// `M.cameraFor`, its per-scene `Frame` / `Card` / `Headline` calls, and its `Ambient`
// component. Fonts and the authored deck come from `Studio Launch.dc.html`.
//
// Display Caprasimo / body Figtree. Camera set
// ["zoomIn","pushL","pushU","spin","pushR","zoomOut","pushD"], indexed exactly as the source
// indexes its own (`M.cameraFor(sc.index)` === CAMERA_CYCLE[i % 7]) — camMul 1, camOff 7 (≡0).
// Entrances: title "rise" (the source's M.wordStaggerBlur), items "rise" (its M.scrollReveal).
// Declares the four interaction mechanics the film genuinely OWNS: the Onboard checklist's
// stroke-drawn ticks (Toggle:check), its cursor walking to a control and clicking it
// (Cursor:click), the Morph beat's blur-out / blur-in word swap (Morph:fade) and the List
// beat's real measured scroll (Scroll:feed). Nothing else is invented.
//
// palette / World below are the AUTHORED functions — the world in particular is re-evaluated
// per seek against an SVG-DOM shim, so the backdrop is not a reinterpretation of the
// original, it IS the original.

const stage = require("../film_stage");

const SKIN = {
  id: "studio-launch",
  label: "Studio Launch",

  // ---- type ----
  // FH = '"Caprasimo", Georgia, serif'  /  FB = '"Figtree", system-ui, sans-serif'
  display: "Caprasimo", displayFallback: "Georgia, serif",
  body: "Figtree", bodyFallback: "system-ui, sans-serif",
  mono: null,
  // MEASURED in headless Chrome against the bundled face: Caprasimo runs 0.750 em/upper,
  // 0.594 em/lower and 0.495 em averaged over real sentence copy. This film never
  // uppercases (`upper` is false on every beat), so the fitter is calibrated on the
  // sentence-case figure: fitLines charges a space at 0.4x, so 26 letters + 6 spaces of the
  // sample = 28.4 units against a true 15.84 em => 0.558. Rounded up for headroom.
  em: 0.58,
  // The source's Headline(): lineHeight 1.04, no tracking.
  titleLine: 1.04, titleSpace: "0",
  // M.wordStaggerBlur = power4Out + opacity + blur 18->0 + translateY(40) + a 2% settle
  //   -> "rise" (power4.out, y 46, dur 0.38, stagger 0.055).
  // M.scrollReveal   = power4Out + opacity + blur 8->0 + translateY(44), stagger 0.05
  //   -> "rise" as well; the film deliberately runs one easing family across type and rows.
  titlePreset: "rise", itemPreset: "rise",

  // ---- palette ----
  // The authored `theme` object from StudioLaunch(). `ground`, `accent` and `accent2` are the
  // film's OM_TWEAKS colour knobs; `surface`/`cardInk` are its fixed card pair and `paper` is
  // the type colour it selects for the ground (cream on a dark house). `accentText` and
  // `accent2Text` are the film's own `mix(accent, paper, 0.34)` / `mix(accent2, paper, 0.44)`
  // lifts — resolved to their literal results here because a skin palette is a table of
  // stops, and they are what every headline emphasis, stat column and kicker is painted in.
  // Called with {} to get the design's own defaults; the brand's accents are then hue-mapped
  // onto `accents` slot by slot at their authored luminance, and every other stop rotates
  // onto the brand's lead hue.
  palette: (t) => ({ ground: t.ground || "#3d472b", surface: "#f5ead8", paper: "#f5ead8", cardInk: "#201e1d", accent: t.accent || "#c67139", accent2: t.accent2 || "#7a8a5e", accentText: "#d69a6f", accent2Text: "#b0b494" }),
  // The film's own TweaksPanel names its brand colours: "Accent" and "Second accent" — so
  // those are the slots a brand takes over. `accentText`/`accent2Text` are lifts OF them and
  // are not accents in their own right; leaving them off keeps them rotating onto the brand's
  // lead hue, which is exactly the family they belong to (accentText must stay a tint of the
  // same hue as the button it labels, or the CTA's headline and its button split apart).
  accents: ["accent", "accent2"],
  groundKey: "ground", inkKey: "cardInk", paperKey: "paper",
  dark: true,

  // ---- per-beat look (verbatim) ----
  // Every scene in this film is painted by ONE `Frame`: the same ground, the same living
  // colour field behind it. It does not swap the field per beat the way the FilmKit
  // templates do, so `bg` and `world` are constant and the beats differ by their copy block,
  // their emphasis colour and their furniture — exactly as the source does.
  look: {
    "hook": {
      "bg": "ground",
      "fg": "paper",
      "hi": "accentText",
      "world": true,
      "top": 380,
      "size": 104,
      "upper": false,
      // the source's Hook kicker: 25px Figtree 800, 0.26em tracking, uppercase, accentText,
      // on nothing — no pill, no border.
      "kicker": {
        "v": "bare",
        "c": "accentText"
      },
      // the Hook's <Card>: radius 26, soft drop shadow (M.cardRise3D's 0 46 68 rgba(26,22,20,.26))
      "card": {
        "v": "frame",
        "r": 26
      }
    },
    "statement": {
      "bg": "ground",
      "fg": "paper",
      "hi": "accentText",
      "world": true,
      "top": 700,
      "size": 96,
      "upper": false
    },
    "feature": {
      "bg": "ground",
      "fg": "paper",
      "hi": "accentText",
      "world": true,
      "top": 280,
      "size": 96,
      "upper": false,
      // <Card>: background theme.surface, borderRadius 26, padding 16 around the slot.
      "card": {
        "v": "frame",
        "bg": "surface",
        "r": 26,
        "line": "cardInk"
      },
      // the Feature chips: rgba(paper,.08) fill behind a rgba(paper,.16) hairline, paper type.
      // One treatment for all three — the film never colour-codes them.
      "chips": {
        "v": "outline",
        "colors": [
          "paper"
        ],
        "text": "cardInk"
      }
    },
    "montage": {
      "bg": "ground",
      "fg": "paper",
      "hi": "accentText",
      "world": true,
      "top": 300,
      "size": 92,
      "upper": false,
      // the Stack beat's two handing-off cards: the same cream <Card>, label on the ground.
      "tile": {
        "bg": "surface",
        "line": "cardInk",
        "label": "paper",
        "r": 26,
        "labelSize": 28
      },
      // the cards never park — M.floatingIdle rocks them +/-0.8deg out of phase.
      "tilts": [
        -1.2,
        0.9,
        1.1,
        -0.9
      ]
    },
    "stats": {
      "bg": "ground",
      "fg": "paper",
      "hi": "accentText",
      "world": true,
      "top": 340,
      "size": 92,
      "upper": false,
      // the source's `cols = [theme.accentText, theme.paper, theme.accent2Text]`
      "cols": [
        "accentText",
        "paper",
        "accent2Text"
      ],
      // the counter face: fontSize 168, lineHeight 0.9, tabular-nums.
      "num": 168
    },
    "cta": {
      "bg": "ground",
      "fg": "paper",
      "hi": "accentText",
      "world": true,
      "top": 620,
      "size": 108,
      "upper": false,
      "align": "center",
      // the closing button: pill, theme.accent, label in theme.surface.
      "btn": {
        "v": "pill",
        "bg": "accent",
        "c": "surface"
      },
      // the CTA lockup is a 168x168 <Card> at radius 26 — rounded, not a disc.
      "logoShape": "rounded"
    },
    // the shell the interaction beats sit in: the film's Onboard / List screens — a cream
    // surface card carrying ink type, on the same living ground. `hi` here is a FILL on that
    // cream card (the button, the switch track, the click ring) with its label in `cardBg`,
    // which is precisely what the source's Onboard button is: `background: theme.accent,
    // color: theme.surface`. The lighter `accent2Text` lift belongs on the GROUND, not on the
    // card — used there it puts cream on pale sage at 1.8:1.
    "app": {
      "bg": "ground",
      "fg": "paper",
      "hi": "accent",
      "cardBg": "surface",
      "line": "cardInk",
      "world": true,
      "upper": false
    }
  },

  // ---- camera + motion ----
  // The source's M.CAMERA_CYCLE = ["pushIn","panLeft","tiltUp","orbit","panRight","pullOut",
  // "tiltDown"], indexed `M.cameraFor(sc.index)` = i % 7 — so camMul 1 and camOff 7 (the
  // stage reads `skin.camOff || 1`, so 7 is how a zero offset is spelled on a 7-kind cycle).
  // Mapped onto the stage's kinds:
  //   pushIn   (scale 1.10 -> 1)                                 -> zoomIn
  //   panLeft  (enters +150px in x, exits -110px)                 -> pushL
  //   tiltUp   (enters +170px in y, exits upward -130px)          -> pushU
  //   orbit    (enters +110px in x, +1.6deg, scale 1.06 -> 1)     -> spin
  //   panRight (enters -150px in x, exits +110px)                 -> pushR
  //   pullOut  (scale 0.94 -> 1, then 1.05 on the way out)        -> zoomOut
  //   tiltDown (enters -170px in y, exits downward +130px)        -> pushD
  cams: ["zoomIn", "pushL", "pushU", "spin", "pushR", "zoomOut", "pushD"], camMul: 1, camOff: 7,
  // Every magnitude read straight off `M.slowCameraPush`: x 150/1080 = 0.139, y 170/1920 =
  // 0.089, rot 0.16 (orbit's 1.6deg against the stage's 10x base for spin), skew 0 (the
  // source never skews), zin 0.1 (pushIn's 1.10), zout 0.06 (pullOut's 0.94), slide 110/1080
  // = 0.102 (the pan exits), drift 9/7/0.035 (sin(c*0.22)*9, cos(c*0.27)*7, p*0.035), and the
  // entrance / exit windows seg(p,0,0.2) / seg(p,0.82,1).
  mag: { "x": 0.139, "y": 0.089, "rot": 0.16, "skew": 0, "zin": 0.1, "zout": 0.06, "driftX": 9, "driftY": 7, "driftZ": 0.035, "slide": 0.102, "inn": 0.2, "out": 0.82 },
  ambient: 1.6,
  energy: 1,
  // the source's Chrome: a bare 34px disc in theme.accent, with no mark inside it.
  badge: "circle",

  // ---- the mechanics this pack owns ----
  // The four the hand-built film actually authors, and no more:
  //   Toggle:check  — Onboard's checklist, a tick stroke drawing itself into a filled disc
  //   Cursor:click  — M.cursorClickRipple walking a path to a control and pressing it
  //   Morph:fade    — M.wordMorph, the old word blurring up and out as the next blurs in
  //   Scroll:feed   — M.listScroll, a list travelling its own MEASURED overflow with a thumb
  // The film's Stack beat (M.cardStackTransition) is carried by the core montage act, which
  // already shows two screens handing over — it is not re-expressed as a swipe the film
  // never had.
  variants: { "Toggle": "check", "Cursor": "click", "Morph": "fade", "Scroll": "feed" },

  strings: {
    brandName: "Studio Launch",
  },

  // ---- the world ----
  // The authored animated backdrop — the source's `Ambient`, wrapped in the `parallaxLayers`
  // depth it is rendered inside and closed by the `Frame` scrim that sits between the
  // ambience and the copy. It is a COLOUR FIELD, not a tint: six mesh blobs and three aurora
  // bands drifting across each other in six hues over a rotating conic sweep, four rings
  // expanding out of the lower third, thirty-four parallax motes at five depths, a vignette
  // and a moving two-tile grain. Every hue is an Organic ramp step, and the whole field is
  // alpha-FITTED to a contrast budget solved from the current ground so cream type never
  // falls under 3:1 — `fieldPalette`, `groundBudget`, `fitAlpha`, `hexToHsl`, `relLum` and
  // `hueDist` are all the source's own functions, inlined here because the world is emitted
  // standalone.
  //
  // Two translations, and no others. (1) The source paints in CSS divs; the stage's world
  // layer is an SVG, so radial/linear gradients become <radialGradient>/<linearGradient>,
  // `filter: blur(n)` becomes feGaussianBlur stdDeviation n (a 1:1 mapping per spec) and the
  // conic-gradient sweep becomes the 60 angular wedges a conic gradient is — interpolated
  // from the same six stops, clipped to the same box, blurred as one layer. (2) `groundBudget`
  // decided its direction by comparing the paper hex to the literal "#f5ead8"; that literal
  // cannot survive a brand hue rotation, so it asks the equivalent question the source means
  // — is the type light? — as relLum(paper) > 0.3.
  //
  // Pure in (theme, t, progress, utils); no Math.random and no Date, which is what lets it be
  // re-evaluated deterministically on every seek.
  World: (theme, t, p, u) => {
    var W = u.W, H = u.H, lerp = u.lerp;
    var a = 1;                       // theme.amb — AMB.Rich, the film's default ambience

    // The Organic ramp the field is built from (the source's module-level RAMP).
    var RAMP = {
      a400: "#f6a06b", a500: "#d67f48", a600: "#b2622d", a700: "#8c491a",
      b400: "#aebf92", b500: "#8fa073", b600: "#728157", b700: "#56633f",
      a300: "#ffc6a5", b300: "#ccdbb2",
    };
    var MIN_DELTA = 26;

    function hexToHsl(hex) {
      var n = String(hex).replace("#", "");
      var r0 = parseInt(n.slice(0, 2), 16) / 255, g0 = parseInt(n.slice(2, 4), 16) / 255, b0 = parseInt(n.slice(4, 6), 16) / 255;
      var mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0), d = mx - mn;
      var h = 0;
      if (d) {
        if (mx === r0) h = ((g0 - b0) / d + (g0 < b0 ? 6 : 0));
        else if (mx === g0) h = (b0 - r0) / d + 2;
        else h = (r0 - g0) / d + 4;
        h *= 60;
      }
      var l = (mx + mn) / 2;
      return { h: h, s: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l: l };
    }
    function relLum(hex) {
      var n = String(hex).replace("#", "");
      var v = [0, 2, 4].map(function (i) { return parseInt(n.slice(i, i + 2), 16) / 255; })
        .map(function (x) { return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    }
    // The largest alpha whose composite over the ground still clears the contrast budget.
    function fitAlpha(colorHex, groundHex, capMax, limit, alpha) {
      var c = String(colorHex).replace("#", ""), g = String(groundHex).replace("#", "");
      var ca = [0, 2, 4].map(function (i) { return parseInt(c.slice(i, i + 2), 16); });
      var ga = [0, 2, 4].map(function (i) { return parseInt(g.slice(i, i + 2), 16); });
      var lumAt = function (k) {
        var v = ca.map(function (x, i) { return (x * k + ga[i] * (1 - k)) / 255; })
          .map(function (x) { return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      };
      var ok = function (k) { return capMax ? lumAt(k) <= limit : lumAt(k) >= limit; };
      if (ok(alpha)) return alpha;
      var lo = 0, hi = alpha;
      for (var i = 0; i < 18; i++) { var mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
      return lo;
    }
    // The budget flips direction: over a dark ground the composite is light-capped, over a
    // light ground it needs a floor, since the type is ink there. The 0.08 term is the
    // translucent chip some type sits on, folded into the ceiling.
    function groundBudget(paperHex) {
      var capMax = relLum(paperHex) > 0.3;
      var lp = relLum(paperHex);
      var raw = capMax ? (0.244 - 0.08 * lp) / 0.92 : (0.133 - 0.08 * lp) / 0.92;
      return { capMax: capMax, limit: capMax ? Math.min(0.244 * 0.8, raw) : Math.max(0.133 * 1.2, raw) };
    }
    function hueDist(x, y) {
      var d = Math.abs(((x - y) % 360 + 360) % 360);
      return Math.min(d, 360 - d);
    }
    // Whichever Organic family is further from the ground hue LEADS and carries the mid and
    // deep steps; the nearer family cannot win on hue, so it is demoted to its light steps
    // and separates by lightness instead.
    function fieldPalette(groundHex) {
      var gh = hexToHsl(groundHex).h;
      var TERRA = { strong: RAMP.a600, deep: RAMP.a700, light: RAMP.a400, pale: RAMP.a300 };
      var SAGE = { strong: RAMP.b600, deep: RAMP.b700, light: RAMP.b400, pale: RAMP.b300 };
      var dT = hueDist(gh, hexToHsl(RAMP.a500).h), dS = hueDist(gh, hexToHsl(RAMP.b500).h);
      var lead = dT >= dS ? TERRA : SAGE;
      var near = dT >= dS ? SAGE : TERRA;
      var clears = Math.min(dT, dS) >= MIN_DELTA;
      var foil = clears ? near : { strong: near.light, deep: near.light, light: near.pale, pale: near.pale };
      return { lead: lead, foil: foil, foilMuted: !clears };
    }

    var ground = theme.ground;
    // cream type on a light ground measures 1.06:1 — the source flips to ink past mid.
    var paper = relLum(ground) > 0.3 ? theme.cardInk : theme.paper;
    var P = fieldPalette(ground);
    var GB = groundBudget(paper);
    // Blobs overlap by construction, so `fit` solves for the EFFECTIVE alpha of two stacked
    // layers and derives the per-layer value from it: alpha_eff = 1-(1-x)^2.
    function fit(c, alpha) {
      var eff = fitAlpha(c, ground, GB.capMax, GB.limit, 1);
      var per = 1 - Math.sqrt(Math.max(0, 1 - eff));
      return Math.min(alpha, per);
    }

    // x, y, radius, colour, alpha, drift speed — deliberately unequal so the field never
    // settles into a symmetric pattern.
    var mesh = [
      { x: 0.16, y: 0.18, r: 520, c: P.lead.strong, o: 0.88, s: 0.13 },
      { x: 0.86, y: 0.30, r: 560, c: P.foil.strong, o: P.foilMuted ? 0.42 : 0.72, s: -0.1 },
      { x: 0.46, y: 0.58, r: 640, c: P.lead.deep, o: 0.9, s: 0.077 },
      { x: 0.08, y: 0.68, r: 420, c: P.foil.deep, o: P.foilMuted ? 0.38 : 0.78, s: -0.16 },
      { x: 0.92, y: 0.82, r: 500, c: P.lead.light, o: 0.5, s: 0.11 },
      { x: 0.34, y: 0.96, r: 460, c: P.foil.light, o: P.foilMuted ? 0.3 : 0.44, s: -0.13 },
    ];
    var bands = [
      { y: 0.22, h: 300, c: P.foil.light, o: P.foilMuted ? 0.24 : 0.34, sp: 0.055, rot: -13 },
      { y: 0.52, h: 260, c: P.lead.strong, o: 0.4, sp: -0.042, rot: 9 },
      { y: 0.78, h: 320, c: P.foil.strong, o: P.foilMuted ? 0.22 : 0.32, sp: 0.033, rot: -7 },
    ];

    var defs = [];
    // `filter: blur(Npx)` is feGaussianBlur stdDeviation N. Regions are stated explicitly
    // because the default -10% box clips a 58px or 70px blur.
    defs.push(R("filter", { key: "f24", id: "slw-b24", x: "-40%", y: "-40%", width: "180%", height: "180%" }, R("feGaussianBlur", { stdDeviation: 24 })));
    defs.push(R("filter", { key: "f58", id: "slw-b58", x: "-30%", y: "-130%", width: "160%", height: "360%" }, R("feGaussianBlur", { stdDeviation: 58 })));
    defs.push(R("filter", { key: "f70", id: "slw-b70", x: "-20%", y: "-20%", width: "140%", height: "140%" }, R("feGaussianBlur", { stdDeviation: 70 })));
    defs.push(R("filter", { key: "f15", id: "slw-b15", x: "-300%", y: "-300%", width: "700%", height: "700%" }, R("feGaussianBlur", { stdDeviation: 1.5 })));

    // ---- mesh gradient field — the colour itself ----
    // radial-gradient(circle at 42% 40%, c(oa), c(oa*.45) 42%, c(0) 70%) in a box the
    // border-radius clips to a disc: farthest-corner puts the gradient's 100% at 1.669r, so
    // the SVG stop radius is 83.4% of the bounding box.
    var meshNodes = [];
    mesh.forEach(function (b, i) {
      var dx = Math.sin(t * b.s + i * 1.4) * 120;
      var dy = Math.cos(t * b.s * 0.8 + i * 2.1) * 96;
      var pulse = 1 + Math.sin(t * 0.26 + i * 1.1) * 0.1;
      var oa = fit(b.c, b.o * a);
      defs.push(R("radialGradient", { key: "m" + i, id: "slw-m" + i, cx: "42%", cy: "40%", r: "83.4%" },
        R("stop", { offset: "0%", stopColor: b.c, stopOpacity: oa }),
        R("stop", { offset: "42%", stopColor: b.c, stopOpacity: oa * 0.45 }),
        R("stop", { offset: "70%", stopColor: b.c, stopOpacity: 0 }),
        R("stop", { offset: "100%", stopColor: b.c, stopOpacity: 0 })));
      meshNodes.push(R("circle", {
        key: "mc" + i, cx: W * b.x + dx, cy: H * b.y + dy, r: b.r * pulse,
        fill: "url(#slw-m" + i + ")", filter: "url(#slw-b24)",
      }));
    });

    // ---- aurora bands sweeping across, each at its own speed and angle ----
    var bandNodes = [];
    bands.forEach(function (b, i) {
      var span = W * 2.3;
      var x = ((t * b.sp * span) % span + span) % span - span * 0.62;
      var yb = Math.sin(t * 0.17 + i * 1.7) * 44;
      var oa = fit(b.c, b.o * a);
      defs.push(R("linearGradient", { key: "n" + i, id: "slw-n" + i, x1: "0%", y1: "0%", x2: "100%", y2: "0%" },
        R("stop", { offset: "0%", stopColor: b.c, stopOpacity: 0 }),
        R("stop", { offset: "32%", stopColor: b.c, stopOpacity: oa }),
        R("stop", { offset: "54%", stopColor: b.c, stopOpacity: oa * 0.7 }),
        R("stop", { offset: "88%", stopColor: b.c, stopOpacity: 0 })));
      bandNodes.push(R("g", { key: "nb" + i, transform: "translate(" + x + "," + yb + ") rotate(" + b.rot + " " + (span / 2) + " " + (H * b.y) + ")" },
        R("rect", { x: 0, y: H * b.y - b.h / 2, width: span, height: b.h, fill: "url(#slw-n" + i + ")", filter: "url(#slw-b58)" })));
    });

    // ---- rotating sweep tying the hues together ----
    // conic-gradient(from (t*5)deg, lead.strong .3a, transparent 22%, foil.strong .26a 44%,
    // transparent 62%, lead.deep .3a 80%, transparent 96%) across a square box, then blurred.
    // A conic gradient IS a fan of angular wedges; drawn as 60 of them, interpolated off the
    // same six stops (CSS premultiplies, so "transparent" holds the hue and drops the alpha).
    var swX = -W * 0.45, swY = -W * 0.1, swS = W * 1.9;
    var swCx = swX + swS / 2, swCy = swY + swS / 2, swR = swS * 0.7072;
    var swFrom = (t * 5) % 360;
    function conicAt(f) {
      if (f < 0.22) return [P.lead.strong, 0.3 * a * (1 - f / 0.22)];
      if (f < 0.44) return [P.foil.strong, 0.26 * a * ((f - 0.22) / 0.22)];
      if (f < 0.62) return [P.foil.strong, 0.26 * a * (1 - (f - 0.44) / 0.18)];
      if (f < 0.80) return [P.lead.deep, 0.3 * a * ((f - 0.62) / 0.18)];
      if (f < 0.96) return [P.lead.deep, 0.3 * a * (1 - (f - 0.80) / 0.16)];
      return [P.lead.strong, 0.3 * a * ((f - 0.96) / 0.04)];
    }
    defs.push(R("clipPath", { key: "cs", id: "slw-cs" }, R("rect", { x: swX, y: swY, width: swS, height: swS })));
    var NW = 60, wedges = [];
    for (var wi = 0; wi < NW; wi++) {
      var f0 = wi / NW, f1 = (wi + 1) / NW;
      var st = conicAt((wi + 0.5) / NW);
      var a0 = (swFrom + f0 * 360 - 90) * Math.PI / 180;
      var a1 = (swFrom + f1 * 360 - 90) * Math.PI / 180;
      wedges.push(R("path", {
        key: "w" + wi,
        d: "M " + swCx + " " + swCy
          + " L " + (swCx + swR * Math.cos(a0)) + " " + (swCy + swR * Math.sin(a0))
          + " A " + swR + " " + swR + " 0 0 1 " + (swCx + swR * Math.cos(a1)) + " " + (swCy + swR * Math.sin(a1))
          + " Z",
        fill: st[0], fillOpacity: st[1],
      }));
    }
    var sweep = R("g", { filter: "url(#slw-b70)" }, R("g", { clipPath: "url(#slw-cs)" }, wedges));

    // ---- rings expanding out of the lower third ----
    var rings = [0, 1, 2, 3].map(function (i) {
      var ph = ((t / 3.4) + i * 0.25) % 1;
      var rr = lerp(200, 980, ph);
      var op = Math.sin(ph * Math.PI) * 0.26 * a;
      return R("circle", { key: "r" + i, cx: W * 0.5, cy: H * 0.62, r: rr, fill: "none", stroke: rgba(paper, op), strokeWidth: 3 });
    });

    // ---- parallax motes: deterministic seeds so they never reshuffle between frames ----
    var motes = [];
    for (var mi = 0; mi < 34; mi++) {
      var seed = mi * 12.9898;
      var bx = Math.sin(seed) * 0.5 + 0.5;
      var by = Math.cos(seed * 1.7) * 0.5 + 0.5;
      var depth = 0.35 + ((mi % 5) / 5) * 0.65;
      var size = 4 + depth * 9;
      var my = ((by * H - t * 16 * depth) % (H + 90) + H + 90) % (H + 90) - 45;
      var mx = bx * W + Math.sin(t * 0.3 * depth + mi) * 44;
      var tw = 0.5 + 0.5 * Math.sin(t * 1.1 + mi * 2.3);
      motes.push(R("circle", {
        key: "p" + mi, cx: mx + size / 2, cy: my + size / 2, r: size / 2,
        fill: mi % 3 === 0 ? P.lead.pale : mi % 3 === 1 ? P.foil.pale : paper,
        fillOpacity: (0.22 + tw * 0.4) * depth * a,
        filter: depth > 0.8 ? null : "url(#slw-b15)",
      }));
    }

    // ---- vignette ----
    // radial-gradient(120% 80% at 50% 40%, transparent 38%, rgba(0,0,0,.36) 100%)
    defs.push(R("radialGradient", {
      key: "vig", id: "slw-vig", gradientUnits: "userSpaceOnUse", cx: W * 0.5, cy: H * 0.4, r: W * 1.2,
      gradientTransform: "translate(" + (W * 0.5) + "," + (H * 0.4) + ") scale(1," + ((H * 0.8) / (W * 1.2)) + ") translate(" + (-W * 0.5) + "," + (-H * 0.4) + ")",
    },
      R("stop", { offset: "0%", stopColor: "#000000", stopOpacity: 0 }),
      R("stop", { offset: "38%", stopColor: "#000000", stopOpacity: 0 }),
      R("stop", { offset: "100%", stopColor: "#000000", stopOpacity: 0.36 })));

    // ---- moving grain: two dot tiles at 4px and 7px, drifting the other way ----
    defs.push(R("pattern", {
      key: "g4", id: "slw-g4", width: 4, height: 4, patternUnits: "userSpaceOnUse",
      patternTransform: "translate(" + ((t * 9) % 4) + "," + ((t * 6) % 4) + ")",
    }, R("circle", { cx: 2, cy: 2, r: 1, fill: "rgba(255,255,255,0.9)" })));
    defs.push(R("pattern", {
      key: "g7", id: "slw-g7", width: 7, height: 7, patternUnits: "userSpaceOnUse",
      patternTransform: "translate(" + ((t * -7) % 7) + "," + ((t * 5) % 7) + ")",
    }, R("circle", { cx: 3.5, cy: 3.5, r: 1, fill: "rgba(255,255,255,0.7)" })));

    // ---- the scrim between ambience and content (the source's Frame) ----
    defs.push(R("linearGradient", { key: "scr", id: "slw-scrim", x1: "0%", y1: "0%", x2: "0%", y2: "100%" },
      R("stop", { offset: "0%", stopColor: ground, stopOpacity: 0.16 }),
      R("stop", { offset: "44%", stopColor: ground, stopOpacity: 0.08 }),
      R("stop", { offset: "100%", stopColor: ground, stopOpacity: 0.2 })));

    // M.parallaxLayers(p, clock, 0.25) — the depth the whole ambience is rendered inside.
    var px = Math.sin(t * 0.3) * 16 * 0.25;
    var py = Math.cos(t * 0.24) * 12 * 0.25 - p * 34 * 0.25;
    var pz = 1 + 0.25 * 0.03;

    return R("g", null,
      R("defs", null, defs),
      R("rect", { x: 0, y: 0, width: W, height: H, fill: ground }),
      R("g", { transform: "translate(" + px + "," + py + ") scale(" + pz + ")" },
        meshNodes,
        bandNodes,
        sweep,
        rings,
        motes,
        R("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#slw-vig)" }),
        R("g", { style: { opacity: 0.055, mixBlendMode: "overlay" } },
          R("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#slw-g4)" }),
          R("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#slw-g7)" }))),
      R("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#slw-scrim)" }));
  },
};

module.exports = {
  buildComposition: (opts) => stage.build(SKIN, opts),
  STRINGS: { ...stage.BASE_STRINGS, ...SKIN.strings },
  SKIN,
};
