/* article-pack-04.js — cohort 04, academic / research: packs 16-20.
   Peer Review · Field Note · Citation Mark · Lab Record · Thesis Draft
   Contract as before: hexes only in palette(), look and World name slots,
   chrome:false, three depth planes, an object on a route with secondary motion,
   nothing in the text column (copy runs to x≈972, y 540-900; stats labels to
   y≈1250 at x<800; the band above y=290 and below y=1330 is free), tone-aware
   tints so inverted beats never go flat. */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ── 16 PEER REVIEW — seminar room: chalkboard, tiered seats, an orrery ── */
  FilmKit.make({
    global: "PeerReview", brand: "Peer Review", desk: "#12131a", ambient: 1.4, chrome: false,
    FH: '"Marcellus", Georgia, serif',
    FB: '"Spectral", Georgia, serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "drowse", itemPreset: "rise", titleLine: 1.1, titleSpace: "0.005em",
    /* ladder: bg .87 / surface .95 / rule .72 / inkMuted .43 / ink .07 / accent .3 / accent2 .48 */
    palette: (t) => ({
      bg: t.bg || "#eceae4", surface: "#f8f7f3", rule: "#c6c4bc", inkMuted: "#6c6a63",
      ink: "#15151a", accent: t.accent || "#2b3a72", accent2: t.accent2 || "#b08a3c", accentInk: "#f8f7f3",
    }),
    tweaks: [
      { k: "bg", label: "Ivory", options: ["#eceae4", "#eeece6", "#e9e8e2"] },
      { k: "accent", label: "Indigo", options: ["#2b3a72", "#1f5a54", "#5a2b72"] },
      { k: "accent2", label: "Brass", options: ["#b08a3c", "#a8683c", "#8c9a3c"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(110% 60% at 50% 4%, " + rgba(theme.surface, 0.9) + " 0%, transparent 62%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.2, strokeLinecap: "round" },
      R2("circle", { cx: 12, cy: 12, r: 3 }), R2("ellipse", { cx: 12, cy: 12, rx: 10, ry: 4.5 }), R2("circle", { cx: 22, cy: 12, r: 1.4 })),
    cams: ["zoomIn", "pushU", "pushL", "zoomOut", "drop", "pushR"], camMul: 5, camOff: 2,
    mag: { rot: 0.2, driftX: 5, driftY: 6, driftZ: 0.04, slide: 0.2, inn: 0.24, zin: 0.3, zout: 0.26 },
    variants: { Scroll: "board", Typing: "caret", Ring: "ring" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 112, kicker: { v: "outline", c: "accent" } },
      statement: { bg: "accent", fg: "accentInk", hi: "accent2", world: true, top: 610, size: 124 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 78, bodySize: 38, ch: 54, lh: 1.56, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 88, ch: 25, lh: 1.18, markSize: 220 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 92, swap: "body", card: { v: "paper", bg: "surface", r: 6, line: "inkMuted" }, chips: { v: "outline", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 330, size: 86, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 6, h: 640, labelSize: 42 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 88, cols: ["accent", "accent2", "ink"], num: 146, rule: true },
      cta: { bg: "ink", fg: "surface", hi: "accent2", world: true, top: 470, size: 106, align: "left", btn: { v: "pill", bg: "accent2", c: "ink" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — the seminar room before anyone arrives. Far: a chalkboard with
       ghost equations that fade and rewrite, tiered seat backs on parallax, two
       globe lamps. Mid: an orrery on its plinth, three arms turning at three
       rates with the gear train visible. Near: chalk dust rising. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const rule = inv ? theme.surface : theme.rule;
      const floor = H - 300;
      const seats = (t * 6) % 260;
      return R("g", null,
        R("defs", null,
          R("radialGradient", { id: "pv-lamp", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent2, 0.32) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent2, 0) }))),
        /* chalkboard, above the copy */
        R("g", { opacity: 0.6 },
          R("rect", { x: 60, y: 40, width: W - 120, height: 230, rx: 6, fill: rgba(theme.accent, 0.18), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
          [0, 1, 2].map((i) => {
            const fade = 0.25 + 0.55 * Math.abs(Math.sin(t * 0.28 + i * 1.4));
            return R("g", { key: "eq" + i, opacity: fade },
              R("line", { x1: 110 + i * 300, y1: 108 + (i % 2) * 62, x2: 250 + i * 300, y2: 108 + (i % 2) * 62, stroke: rgba(theme.surface, 0.9), strokeWidth: 5 }),
              R("line", { x1: 110 + i * 300, y1: 132 + (i % 2) * 62, x2: 214 + i * 300, y2: 132 + (i % 2) * 62, stroke: rgba(theme.surface, 0.6), strokeWidth: 4 }),
              R("path", { d: "M " + (270 + i * 300) + " " + (96 + (i % 2) * 62) + " q 26 26 0 52", fill: "none", stroke: rgba(theme.accent2, 0.8), strokeWidth: 4 }));
          }),
          R("rect", { x: 60, y: 270, width: W - 120, height: 14, rx: 4, fill: rgba(tint, 0.5) })),
        /* globe lamps */
        [0, 1].map((i) => R("g", { key: "gl" + i, transform: "translate(" + (200 + i * (W - 400)) + ",330)" },
          R("line", { x1: 0, y1: -46, x2: 0, y2: 0, stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("circle", { cx: 0, cy: 30, r: 30, fill: rgba(theme.accent2, 0.6 + 0.1 * Math.sin(t * 1.2 + i)) }),
          R("circle", { cx: 0, cy: 30, r: 150, fill: "url(#pv-lamp)" }))),
        /* tiered seat backs on parallax */
        R("g", { opacity: 0.4, transform: "translate(" + (-seats).toFixed(1) + ",0)" },
          [0, 1, 2].map((row) => R("g", { key: "rw" + row },
            R("line", { x1: 0, y1: floor - 330 + row * 130, x2: W + 300, y2: floor - 330 + row * 130, stroke: rgba(tint, 0.5), strokeWidth: 5 }),
            [0, 1, 2, 3, 4, 5].map((i) => R("path", { key: "sb" + i, d: "M " + (60 + i * 200 + row * 40) + " " + (floor - 330 + row * 130) + " v -66 q 0 -18 40 -18 h 60 q 40 0 40 18 v 66 z", fill: rgba(tint, 0.34) }))))),
        /* a projector on a stand, running */
        R("g", { transform: "translate(" + (W - 150) + ",1120)" },
          R("rect", { x: -96, y: -50, width: 192, height: 100, rx: 10, fill: rgba(theme.surface, inv ? 0.4 : 0.94), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("circle", { cx: -60, cy: 0, r: 22, fill: rgba(theme.accent2, 0.85) }),
          R("rect", { x: 4, y: -26, width: 70, height: 14, rx: 6, fill: rgba(theme.accent, 0.5) }),
          R("circle", { cx: 40, cy: 22, r: 7, fill: rgba(theme.accent, Math.sin(t * 3) > 0 ? 0.9 : 0.25) }),
          R("path", { d: "M -96 -34 L -520 -300 L -520 220 L -96 40 Z", fill: rgba(theme.accent2, 0.06) }),
          R("path", { d: "M -20 50 v 90 M -60 140 h 120", stroke: rgba(tint, 0.5), strokeWidth: 6, strokeLinecap: "round" })),
        /* the orrery */
        R("g", { transform: "translate(" + (W * 0.62) + "," + (floor - 40) + ")" },
          R("ellipse", { cx: 0, cy: 40, rx: 150, ry: 20, fill: rgba(theme.ink, 0.2) }),
          R("path", { d: "M -70 40 h 140 l -22 -120 h -96 z", fill: rgba(theme.surface, inv ? 0.4 : 0.95), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("g", { transform: "translate(0,-96) rotate(" + ((t * 12) % 360).toFixed(1) + ")" },
            R("circle", { r: 30, fill: "none", stroke: rgba(theme.accent2, 0.7), strokeWidth: 5 }),
            [0, 1, 2, 3, 4, 5].map((i) => R("line", { key: "tg" + i, x1: Math.cos(i * 1.047) * 30, y1: Math.sin(i * 1.047) * 30, x2: Math.cos(i * 1.047) * 40, y2: Math.sin(i * 1.047) * 40, stroke: rgba(theme.accent2, 0.55), strokeWidth: 5 }))),
          R("circle", { cx: 0, cy: -96, r: 20, fill: rgba(theme.accent2, 0.95) }),
          [[110, 4.1, 14], [180, 2.3, 20], [250, 1.3, 12]].map((o, i) => {
            const a2 = t * (0.6 / o[1]) * Math.PI * 2;
            return R("g", { key: "or" + i },
              R("ellipse", { cx: 0, cy: -96, rx: o[0], ry: o[0] * 0.34, fill: "none", stroke: rgba(tint, 0.34), strokeWidth: 3 }),
              R("line", { x1: 0, y1: -96, x2: Math.cos(a2) * o[0], y2: -96 + Math.sin(a2) * o[0] * 0.34, stroke: rgba(tint, 0.4), strokeWidth: 3 }),
              R("circle", { cx: Math.cos(a2) * o[0], cy: -96 + Math.sin(a2) * o[0] * 0.34, r: o[2], fill: rgba(i === 1 ? theme.accent : theme.accent2, 0.9) }));
          })),
        /* chalk dust */
        [0, 1, 2, 3, 4, 5].map((i) => {
          const ph = (t * (0.08 + i * 0.02) + i * 0.16) % 1;
          return R("circle", { key: "cd" + i, cx: 130 + i * 165 + Math.sin(t * 0.6 + i) * 30, cy: H - ph * (H + 160), r: 3 + (i % 3) * 2, fill: rgba(tint, 0.28 * (1 - ph)) });
        }));
    },
  });

  /* ── 17 FIELD NOTE — riverbank: reeds, water, a dragonfly darting ── */
  FilmKit.make({
    global: "FieldNote", brand: "Field Note", desk: "#101815", ambient: 1.65, chrome: false,
    FH: '"Bree Serif", Georgia, serif',
    FB: '"Karla", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "bounce", itemPreset: "pop", titleLine: 1.06, titleSpace: "-0.01em",
    /* ladder: bg .87 / surface .96 / rule .73 / inkMuted .43 / ink .07 / accent .4 / accent2 .5 */
    palette: (t) => ({
      bg: t.bg || "#e7edec", surface: "#f8fbfa", rule: "#c2ceca", inkMuted: "#68746f",
      ink: "#131816", accent: t.accent || "#2f7a72", accent2: t.accent2 || "#c9903a", accentInk: "#f8fbfa",
    }),
    tweaks: [
      { k: "bg", label: "Water", options: ["#e7edec", "#eaefee", "#e5ebea"] },
      { k: "accent", label: "Reed", options: ["#2f7a72", "#3a6a8c", "#5c7a2f"] },
      { k: "accent2", label: "Ochre", options: ["#c9903a", "#c96a3a", "#a8963a"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(178deg, " + rgba(theme.surface, 0.92) + " 0%, " + bg + " 48%, " + rgba(theme.accent, 0.2) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.2, strokeLinecap: "round" },
      R2("path", { d: "M12 4v16" }), R2("path", { d: "M12 8c4-4 8-3 8-3s-1 5-5 6M12 14c-4-4-8-3-8-3s1 5 5 6" })),
    cams: ["hopU", "pushR", "drop", "pushL", "zoomIn", "zoomOut"], camMul: 3, camOff: 5,
    mag: { rot: 0.6, driftX: 8, driftY: 8, driftZ: 0.04, slide: 0.24, inn: 0.2, zin: 0.34, zout: 0.3 },
    variants: { Scroll: "feed", Typing: "hand", Ring: "gauge" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 106, kicker: { v: "pill", bg: "accent", c: "accentInk" } },
      statement: { bg: "ink", fg: "surface", hi: "accent2", world: true, top: 610, size: 118 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 76, bodySize: 38, ch: 54, lh: 1.54, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 86, ch: 25, lh: 1.16, markSize: 210 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 90, swap: "quote", card: { v: "tilt", bg: "surface", r: 14, line: "inkMuted" }, chips: { v: "pill", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: 84, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 14, h: 640, labelSize: 42 }, tilts: [-1, 1, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 390, size: 86, cols: ["accent", "accent2", "ink"], num: 146 },
      cta: { bg: "accent", fg: "accentInk", hi: "surface", world: true, top: 470, size: 102, align: "left", btn: { v: "pill", bg: "accentInk", c: "surface" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — a riverbank at survey time. Far: a far bank with a gate and two
       hedge lines on parallax. Mid: the water band with drifting ripples and
       stones, reeds bending on a wind wave, and a dragonfly darting a 6s route
       in short bursts and holds, wings blurred by dash phase. Near: midges. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const bank = H - 430, water = H - 300;
      const cyc = (t % 6) / 6;
      const leg = Math.floor(cyc * 3), lt = E.inOut(Math.min(1, (cyc * 3 - leg) / 0.55));
      const pts = [[240, bank - 120], [760, bank - 220], [520, bank - 60], [240, bank - 120]];
      const a0 = pts[leg], a1 = pts[leg + 1];
      const dx = a0[0] + (a1[0] - a0[0]) * lt, dy = a0[1] + (a1[1] - a0[1]) * lt;
      const wing = (t * 40) % 24;
      const hedge = (t * 9) % 300;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "fn-ripple", width: 180, height: 60, patternUnits: "userSpaceOnUse", patternTransform: "translate(" + ((t * 22) % 180).toFixed(1) + ",0)" },
            R("path", { d: "M0 30 q 45 -14 90 0 q 45 14 90 0", fill: "none", stroke: rgba(theme.accent, inv ? 0.2 : 0.28), strokeWidth: 3 }))),
        /* a canopy of branches hanging into the top band */
        R("g", { transform: "translate(0," + (Math.sin(t * 0.5) * 4).toFixed(2) + ")" },
          R("path", { d: "M -40 30 q 210 66 380 -12 q 160 -74 320 6 q 150 74 300 -10", fill: "none", stroke: rgba(theme.accent, 0.5), strokeWidth: 11, strokeLinecap: "round" }),
          [0, 1, 2, 3, 4, 5, 6].map((i) => {
            const lx = 50 + i * 150, ly = 54 + Math.sin(i * 1.2) * 30 + Math.sin(t * 1.1 + i) * 5;
            return R("path", { key: "cl" + i, d: "M 0 0 q 30 -24 52 6 q -26 28 -52 -6 z", fill: rgba(theme.accent, 0.3 + (i % 3) * 0.09), transform: "translate(" + lx + "," + ly.toFixed(1) + ") rotate(" + (36 + i * 26 + Math.sin(t + i) * 6).toFixed(1) + ")" });
          })),
        /* far bank, hedges and a gate */
        R("g", { opacity: 0.5, transform: "translate(" + (-hedge).toFixed(1) + ",0)" },
          R("path", { d: "M 0 " + (bank - 40) + " q 130 -80 270 -20 q 140 66 280 -14 q 140 -70 280 -6 L " + (W + 400) + " " + bank + " L 0 " + bank + " Z", fill: rgba(theme.accent, 0.3) }),
          R("g", { transform: "translate(" + (W * 0.75) + "," + (bank - 30) + ")" },
            R("line", { x1: -70, y1: 0, x2: -70, y2: -90, stroke: rgba(tint, 0.6), strokeWidth: 7 }),
            R("line", { x1: 70, y1: 0, x2: 70, y2: -90, stroke: rgba(tint, 0.6), strokeWidth: 7 }),
            R("path", { d: "M -70 -70 h 140 M -70 -34 h 140 M -70 -70 L 70 -34", stroke: rgba(tint, 0.5), strokeWidth: 5 }))),
        /* the water */
        R("rect", { x: 0, y: water, width: W, height: H - water, fill: rgba(theme.accent, 0.16) }),
        R("rect", { x: 0, y: water, width: W, height: H - water, fill: "url(#fn-ripple)" }),
        R("line", { x1: 0, y1: water, x2: W, y2: water, stroke: rgba(tint, 0.4), strokeWidth: 4 }),
        [0, 1, 2].map((i) => R("ellipse", { key: "st" + i, cx: 150 + i * 330, cy: water + 60 + (i % 2) * 40, rx: 70 - i * 8, ry: 22, fill: rgba(tint, 0.4) })),
        /* lily pads drifting, and a fish rising every few seconds */
        [0, 1, 2, 3].map((i) => {
          const lx = 120 + i * 260 + Math.sin(t * 0.4 + i) * 30;
          const ly = water + 90 + (i % 2) * 70;
          return R("g", { key: "lp" + i },
            R("ellipse", { cx: lx, cy: ly, rx: 54 - i * 4, ry: 20, fill: rgba(theme.accent, 0.4) }),
            R("path", { d: "M " + lx + " " + ly + " l " + (26 - i * 3) + " -12", stroke: rgba(theme.accent, 0.55), strokeWidth: 4 }),
            i % 2 === 0 ? R("circle", { cx: lx + 20, cy: ly - 22, r: 9, fill: rgba(theme.accent2, 0.75) }) : null);
        }),
        (function () {
          const cyc2 = (t % 7) / 7;
          const up = cyc2 < 0.16 ? Math.sin((cyc2 / 0.16) * Math.PI) : 0;
          const fx = 700;
          return R("g", null,
            R("path", { d: "M " + (fx - 26) + " " + (water + 40 - up * 60) + " q 26 -18 52 0 q -26 20 -52 0 z", fill: rgba(theme.accent2, 0.85 * up) }),
            [0, 1, 2].map((i) => R("ellipse", { key: "rp" + i, cx: fx, cy: water + 44, rx: (30 + i * 44) * (up > 0 ? 1 : cyc2 < 0.5 ? (cyc2 - 0.16) * 4 : 0), ry: (9 + i * 12) * 0.34, fill: "none", stroke: rgba(theme.surface, 0.5 * (1 - i * 0.3) * (cyc2 < 0.6 ? 1 : 0)), strokeWidth: 3 })));
        })(),
        /* a punt moored at the near bank */
        R("g", { transform: "translate(" + (W - 260) + "," + (water + 150) + ") rotate(" + (Math.sin(t * 0.8) * 1.4).toFixed(2) + ")" },
          R("path", { d: "M -190 0 q 26 44 190 44 q 164 0 190 -44 z", fill: rgba(theme.accent2, 0.5), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("path", { d: "M -160 6 h 320", stroke: rgba(tint, 0.35), strokeWidth: 4 }),
          R("path", { d: "M -40 0 v -20 h 80 v 20", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 5 }),
          R("path", { d: "M 120 -6 l 150 -150", stroke: rgba(tint, 0.55), strokeWidth: 7, strokeLinecap: "round" })),
        /* a heron working the shallows */
        (function () {
          const step = (t % 9) / 9;
          const hx = 200 + step * 240;
          const neck = Math.sin(t * 0.9) * 0.5 + 0.5;
          const leg = Math.sin(t * 1.6) * 10;
          return R("g", { transform: "translate(" + hx.toFixed(1) + "," + (water + 40) + ")" },
            R("path", { d: "M 0 0 v -90 M 24 0 v -84", stroke: rgba(tint, 0.6), strokeWidth: 5, strokeLinecap: "round" }),
            R("path", { d: "M " + leg.toFixed(1) + " 0 h 22", stroke: rgba(tint, 0.5), strokeWidth: 5, strokeLinecap: "round" }),
            R("ellipse", { cx: 12, cy: -116, rx: 46, ry: 28, fill: rgba(theme.surface, inv ? 0.5 : 0.9), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
            R("path", { d: "M 44 -132 q 40 " + (-30 + neck * 44).toFixed(1) + " 34 " + (-70 + neck * 60).toFixed(1) + "", fill: "none", stroke: rgba(theme.surface, inv ? 0.6 : 0.95), strokeWidth: 9, strokeLinecap: "round" }),
            R("circle", { cx: 78, cy: (-202 + neck * 60), r: 12, fill: rgba(theme.surface, inv ? 0.6 : 0.95) }),
            R("path", { d: "M 88 " + (-204 + neck * 60) + " l 40 8 l -40 8 z", fill: rgba(theme.accent2, 0.9) }),
            R("path", { d: "M -34 -120 q 46 -26 84 -6", fill: "none", stroke: rgba(tint, 0.4), strokeWidth: 4 }));
        })(),
        /* reeds along the bank */
        R("g", null,
          Array.from({ length: 22 }).map((_, i) => {
            const rx2 = 20 + i * 50 + (i % 3) * 10;
            const hgt = 120 + ((i * 31) % 7) * 34;
            const lean = Math.sin(t * 1.3 + i * 0.6) * (14 + (i % 4) * 5);
            return R("g", { key: "rd" + i },
              R("path", { d: "M " + rx2 + " " + (water + 20) + " q " + (lean * 0.5).toFixed(1) + " " + (-hgt * 0.55).toFixed(1) + " " + lean.toFixed(1) + " " + (-hgt).toFixed(1), fill: "none", stroke: rgba(theme.accent, 0.4 + (i % 3) * 0.12), strokeWidth: 5, strokeLinecap: "round" }),
              i % 4 === 0 ? R("ellipse", { cx: rx2 + lean, cy: water + 20 - hgt, rx: 7, ry: 20, fill: rgba(theme.accent2, 0.7), transform: "rotate(" + (lean * 0.6).toFixed(1) + " " + (rx2 + lean).toFixed(1) + " " + (water + 20 - hgt).toFixed(1) + ")" }) : null);
          })),
        /* specimen jars and a marker post */
        R("g", { transform: "translate(" + (W - 160) + ",1120)" },
          R("rect", { x: -110, y: 60, width: 220, height: 18, rx: 4, fill: rgba(tint, 0.55) }),
          [0, 1, 2].map((i) => R("g", { key: "jr" + i },
            R("rect", { x: -92 + i * 66, y: -30, width: 50, height: 90, rx: 8, fill: rgba(theme.accent, 0.2), stroke: rgba(tint, 0.5), strokeWidth: 3 }),
            R("rect", { x: -96 + i * 66, y: -40, width: 58, height: 14, rx: 4, fill: rgba(theme.accent2, 0.75) }),
            R("path", { d: "M " + (-84 + i * 66) + " " + (30 + Math.sin(t * 1.2 + i) * 3) + " h 34", stroke: rgba(theme.accent, 0.7), strokeWidth: 5 }))),
          R("g", { transform: "translate(30,-90) rotate(" + (Math.sin(t * 0.7) * 1.6).toFixed(2) + ")" },
            R("line", { x1: 0, y1: 0, x2: 0, y2: 150, stroke: rgba(tint, 0.6), strokeWidth: 7 }),
            R("rect", { x: -54, y: -54, width: 108, height: 54, rx: 5, fill: rgba(theme.accent2, 0.7) }),
            R("rect", { x: -38, y: -36, width: 68, height: 10, rx: 5, fill: rgba(theme.ink, 0.35) }))),
        /* the dragonfly */
        R("g", { transform: "translate(" + dx.toFixed(1) + "," + dy.toFixed(1) + ") rotate(" + ((a1[0] - a0[0]) > 0 ? 8 : -8) + ")" },
          R("ellipse", { cx: 0, cy: 0, rx: 8, ry: 34, fill: rgba(theme.accent, 0.9) }),
          R("circle", { cx: 0, cy: -38, r: 12, fill: rgba(theme.accent2, 0.95) }),
          [-1, 1].map((sx) => R("g", { key: "wg" + sx },
            R("ellipse", { cx: sx * 44, cy: -16, rx: 44, ry: 9, fill: rgba(theme.surface, 0.5), stroke: rgba(tint, 0.35), strokeWidth: 2, strokeDasharray: "10 6", strokeDashoffset: wing }),
            R("ellipse", { cx: sx * 40, cy: 6, rx: 40, ry: 8, fill: rgba(theme.surface, 0.42), stroke: rgba(tint, 0.3), strokeWidth: 2, strokeDasharray: "10 6", strokeDashoffset: -wing }))),
          R("path", { d: "M 0 34 v 26", stroke: rgba(theme.accent, 0.7), strokeWidth: 4, strokeLinecap: "round" })),
        /* midges */
        [0, 1, 2, 3, 4, 5, 6].map((i) => {
          const ph = (t * (0.5 + i * 0.08) + i * 0.14) % 1;
          const mx = 120 + i * 140 + Math.sin(t * 3 + i * 2) * 40;
          return R("circle", { key: "mg" + i, cx: mx, cy: bank - 200 + Math.cos(t * 2.4 + i) * 90, r: 3, fill: rgba(tint, 0.35 + 0.25 * Math.sin(ph * 6.28)) });
        }));
    },
  });

  /* ── 18 CITATION MARK — a carrel: footnote column, a travelling magnifier ── */
  FilmKit.make({
    global: "CitationMark", brand: "Citation Mark", desk: "#191518", ambient: 1.35, chrome: false,
    FH: '"Gilda Display", Georgia, serif',
    FB: '"Mulish", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "rise", itemPreset: "rise", titleLine: 1.12, titleSpace: "0.005em",
    /* ladder: bg .85 / surface .95 / rule .71 / inkMuted .42 / ink .07 / accent .36 / accent2 .46 */
    palette: (t) => ({
      bg: t.bg || "#ece8ea", surface: "#f8f6f7", rule: "#c8c2c5", inkMuted: "#6b6568",
      ink: "#171316", accent: t.accent || "#6b3a6e", accent2: t.accent2 || "#7f8a4a", accentInk: "#f8f6f7",
    }),
    tweaks: [
      { k: "bg", label: "Paper", options: ["#ece8ea", "#eeeaec", "#eae6e8"] },
      { k: "accent", label: "Plum", options: ["#6b3a6e", "#3a4a6e", "#6e3a4a"] },
      { k: "accent2", label: "Olive", options: ["#7f8a4a", "#4a8a7f", "#8a6a4a"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(80% 50% at 22% 8%, " + rgba(theme.surface, 0.95) + " 0%, transparent 62%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.2, strokeLinecap: "round" },
      R2("circle", { cx: 11, cy: 11, r: 7 }), R2("path", { d: "M16 16l5 5" })),
    cams: ["pushU", "zoomIn", "pushD", "pushL", "zoomOut", "pushR"], camMul: 5, camOff: 4,
    mag: { rot: 0.15, driftX: 4, driftY: 6, driftZ: 0.035, slide: 0.18, inn: 0.22, zin: 0.28, zout: 0.24 },
    variants: { Scroll: "board", Typing: "typewriter", Ring: "bar" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 108, kicker: { v: "bare", c: "accent" } },
      statement: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 610, size: 120 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 76, bodySize: 38, ch: 54, lh: 1.56, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent2" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 86, ch: 25, lh: 1.2, markSize: 220 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 90, swap: "body", card: { v: "paper", bg: "surface", r: 6, line: "inkMuted" }, chips: { v: "outline", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 330, size: 84, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 6, h: 640, labelSize: 42 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 86, cols: ["accent", "accent2", "ink"], num: 144, rule: true },
      cta: { bg: "ink", fg: "surface", hi: "accent2", world: true, top: 470, size: 104, align: "left", btn: { v: "block", bg: "accent", c: "surface" }, logoShape: "rounded" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — a carrel with the apparatus out. Far: a wall of card-index drawers
       and a lamp. Mid: a column of footnote lines in the lower band with a
       magnifier travelling down it on a 10s pass — the lines under the lens are
       drawn larger, and the lens throws a small caustic. Near: card slips. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const col0 = 1340, rows = 9, gap = 44;
      const cyc = (t % 10) / 10;
      const tri = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;
      const lensY = col0 + E.inOut(tri) * (rows - 1) * gap;
      const lensX = 300 + Math.sin(cyc * Math.PI * 2) * 40;
      return R("g", null,
        R("defs", null,
          R("radialGradient", { id: "cm-lamp", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent2, 0.3) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent2, 0) }))),
        /* a shelf run behind the carrel, on parallax */
        R("g", { opacity: 0.34, transform: "translate(" + (-((t * 6) % 260)).toFixed(1) + ",0)" },
          [0, 1].map((r) => R("g", { key: "sr" + r },
            R("line", { x1: 0, y1: 1010 + r * 200, x2: W + 320, y2: 1010 + r * 200, stroke: rgba(tint, 0.5), strokeWidth: 5 }),
            [0, 1, 2, 3, 4, 5, 6, 7].map((i) => R("rect", { key: "sb" + i, x: 30 + i * 140 + (i % 3) * 12, y: 1010 + r * 200 - (86 + (i % 4) * 30), width: 26 + (i % 3) * 10, height: 86 + (i % 4) * 30, rx: 3, fill: rgba(i % 4 === 0 ? theme.accent : tint, 0.4) }))))),
        /* a returns trolley crossing the floor */
        (function () {
          const tx = ((t * 26) % (W + 520)) - 260;
          const whl = (tx / 26) * 57.3;
          return R("g", { opacity: 0.55, transform: "translate(" + tx.toFixed(1) + "," + (H - 180) + ")" },
            R("rect", { x: -110, y: -120, width: 220, height: 16, rx: 4, fill: rgba(tint, 0.6) }),
            R("rect", { x: -110, y: -60, width: 220, height: 14, rx: 4, fill: rgba(tint, 0.5) }),
            R("path", { d: "M -100 -104 v 44 M 100 -104 v 44 M -100 -46 v 30 M 100 -46 v 30", stroke: rgba(tint, 0.55), strokeWidth: 7 }),
            [0, 1, 2, 3, 4].map((i) => R("rect", { key: "tb" + i, x: -92 + i * 38, y: -160 + (i % 2) * 8, width: 30, height: 40 + (i % 3) * 10, rx: 3, fill: rgba(i % 2 ? theme.accent : theme.surface, inv ? 0.5 : 0.88), stroke: rgba(tint, 0.35), strokeWidth: 2 })),
            [-80, 80].map((wx, i) => R("g", { key: "wl" + i, transform: "translate(" + wx + ",-6) rotate(" + whl.toFixed(1) + ")" },
              R("circle", { r: 16, fill: "none", stroke: rgba(tint, 0.6), strokeWidth: 5 }),
              R("path", { d: "M -16 0 h 32", stroke: rgba(tint, 0.5), strokeWidth: 4 }))));
        })(),
        /* card-index wall, above the copy */
        R("g", { opacity: 0.5 },
          [0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4, 5].map((c) => R("rect", { key: "dw" + r + c, x: 40 + c * 168, y: 40 + r * 62, width: 152, height: 50, rx: 4, fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 3 }))),
          [0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4, 5].map((c) => R("rect", { key: "hd" + r + c, x: 96 + c * 168, y: 58 + r * 62, width: 40, height: 8, rx: 4, fill: rgba(theme.accent, 0.5) }))),
          R("rect", { x: 40 + 2 * 168, y: 40 + 1 * 62, width: 152 + (Math.sin(t * 0.6) * 0.5 + 0.5) * 56, height: 50, rx: 4, fill: rgba(theme.accent, 0.22), stroke: rgba(tint, 0.6), strokeWidth: 3 })),
        /* the citation web: pinned cards joined by threads that draw in turn */
        R("g", { transform: "translate(" + (W - 132) + ",1140)" },
          (function () {
            const nodes = [[0, -130], [-74, -16], [62, 24], [-30, 118], [70, 142]];
            const draw = (t % 8) / 8;
            return R("g", null,
              nodes.map((n, i) => {
                if (i === 0) return null;
                const seg = Math.max(0, Math.min(1, (draw - (i - 1) * 0.22) / 0.22));
                return R("line", { key: "th" + i, x1: nodes[0][0], y1: nodes[0][1], x2: nodes[0][0] + (n[0] - nodes[0][0]) * seg, y2: nodes[0][1] + (n[1] - nodes[0][1]) * seg, stroke: rgba(theme.accent, 0.55), strokeWidth: 3 });
              }),
              nodes.map((n, i) => R("g", { key: "nd" + i, transform: "translate(" + n[0] + "," + n[1] + ") rotate(" + (Math.sin(t * 1.1 + i) * 3).toFixed(2) + ")" },
                R("rect", { x: -40, y: -26, width: 80, height: 52, rx: 4, fill: rgba(theme.surface, inv ? 0.5 : 0.96), stroke: rgba(tint, 0.4), strokeWidth: 2 }),
                R("rect", { x: -28, y: -14, width: 56, height: 8, rx: 4, fill: rgba(i === 0 ? theme.accent : theme.accent2, 0.75) }),
                R("line", { x1: -28, y1: 6, x2: 20, y2: 6, stroke: rgba(tint, 0.32), strokeWidth: 4 }),
                R("circle", { cx: 0, cy: -26, r: 5, fill: rgba(theme.accent, 0.9) }))));
          })()),
        /* the lamp over the carrel */
        R("g", { transform: "translate(" + (W - 150) + ",330)" },
          R("line", { x1: 0, y1: -60, x2: 0, y2: 0, stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("path", { d: "M -60 0 h 120 l -26 52 h -68 z", fill: rgba(theme.accent, 0.7) }),
          R("circle", { cx: 0, cy: 66, r: 16 + Math.sin(t * 1.6) * 2, fill: rgba(theme.accent2, 0.8) }),
          R("circle", { cx: 0, cy: 66, r: 190, fill: "url(#cm-lamp)" })),
        /* the footnote column, and the lens travelling it */
        R("g", null,
          Array.from({ length: rows }).map((_, i) => {
            const y = col0 + i * gap;
            const near = Math.abs(y - lensY) < 26;
            const wdt = 300 + ((i * 47) % 5) * 60;
            return R("g", { key: "fn" + i },
              R("text", { x: 96, y: y + 6, fontFamily: '"IBM Plex Mono", monospace', fontSize: near ? 26 : 18, fill: rgba(theme.accent, near ? 0.95 : 0.5) }, (i + 1) + "."),
              R("rect", { x: 140, y: y - (near ? 8 : 5), width: wdt, height: near ? 16 : 10, rx: 5, fill: rgba(tint, near ? 0.62 : 0.34) }));
          }),
          R("g", { transform: "translate(" + lensX.toFixed(1) + "," + lensY.toFixed(1) + ")" },
            R("circle", { r: 92, fill: rgba(theme.surface, 0.28), stroke: rgba(theme.accent2, 0.85), strokeWidth: 9 }),
            R("circle", { r: 92, fill: "none", stroke: rgba(theme.surface, 0.6), strokeWidth: 3 }),
            R("path", { d: "M -34 -58 a 92 92 0 0 1 44 -26", fill: "none", stroke: rgba(theme.surface, 0.9), strokeWidth: 6, strokeLinecap: "round" }),
            R("path", { d: "M 66 66 l 74 74", stroke: rgba(theme.accent2, 0.9), strokeWidth: 16, strokeLinecap: "round" }),
            R("path", { d: "M 128 128 l 44 44", stroke: rgba(theme.ink, 0.7), strokeWidth: 20, strokeLinecap: "round" }),
            R("ellipse", { cx: 10, cy: 108, rx: 60, ry: 12, fill: rgba(theme.accent2, 0.16) }))),
        /* card slips */
        [0, 1, 2, 3, 4].map((i) => {
          const ph = (t * (0.13 + i * 0.03) + i * 0.19) % 1;
          const x = 120 + i * 200 + Math.sin(t * 0.8 + i) * 34, y = H - ph * (H + 200);
          return R("rect", { key: "cs" + i, x: x, y: y, width: 40, height: 26, rx: 3, fill: rgba(theme.surface, 0.8 * (1 - ph)), stroke: rgba(tint, 0.3 * (1 - ph)), strokeWidth: 2, transform: "rotate(" + (ph * 300 + i * 40).toFixed(1) + " " + x.toFixed(1) + " " + y.toFixed(1) + ")" });
        }));
    },
  });

  /* ── 19 LAB RECORD — the bench: pegboard, glassware, a chart recorder ── */
  FilmKit.make({
    global: "LabRecord", brand: "Lab Record", desk: "#0a0f0e", ambient: 1.5, chrome: false,
    FH: '"Cinzel", Georgia, serif',
    FB: '"Lato", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "rise", itemPreset: "pop", titleLine: 1.16, titleSpace: "0.03em",
    /* ladder: bg .04 / surface .09 / rule .16 / inkMuted .4 / ink .87 / accent .55 / accent2 .48 */
    palette: (t) => ({
      bg: t.bg || "#131a18", surface: "#1d2624", rule: "#31403c", inkMuted: "#8fa39d",
      ink: "#eef5f2", accent: t.accent || "#54e0b0", accent2: t.accent2 || "#e0b054", accentInk: "#08110f",
    }),
    tweaks: [
      { k: "bg", label: "Bench", options: ["#131a18", "#15191c", "#121b17"] },
      { k: "accent", label: "Trace", options: ["#54e0b0", "#54b0e0", "#b054e0"] },
      { k: "accent2", label: "Second", options: ["#e0b054", "#e07a54", "#c9e054"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(100% 55% at 50% 100%, " + rgba(theme.accent, 0.16) + " 0%, transparent 60%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M9 3h6v6l4 10H5l4-10z" }), R2("path", { d: "M7 15h10" })),
    cams: ["zoomIn", "pushL", "drop", "pushR", "pushU", "zoomOut"], camMul: 7, camOff: 2,
    mag: { rot: 0.25, driftX: 5, driftY: 6, driftZ: 0.05, slide: 0.2, inn: 0.22, zin: 0.36, zout: 0.3 },
    variants: { Scroll: "feed", Typing: "terminal", Ring: "ring" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 88, upper: true, kicker: { v: "outline", c: "accent" } },
      statement: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 610, size: 100, upper: true },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 66, bodySize: 38, ch: 54, lh: 1.54, weight: 400, dim: 0.92, kicker: { v: "bare", c: "accent2" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 72, ch: 24, lh: 1.22, markSize: 190 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 74, upper: true, swap: "body", card: { v: "glow", bg: "surface", glow: "accent", r: 14, line: "inkMuted" }, chips: { v: "outline", colors: ["accent", "accent2", "ink"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 330, size: 70, upper: true, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 14, h: 640, labelSize: 36 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 74, upper: true, cols: ["accent", "accent2", "ink"], num: 148, glowNums: true },
      cta: { bg: "accent", fg: "accentInk", hi: "surface", world: true, top: 470, size: 86, upper: true, align: "left", btn: { v: "glow", bg: "accentInk", c: "ink" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — the bench, mid-run. Far: a pegboard wall with tools hung on it and
       a fume-hood glow. Mid: a chart recorder whose drum turns while the stylus
       tracks across it, drawing the trace it has already made; a burette drips
       into a flask on a stand; a sample rack beside it. Near: vapour. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const bench = H - 290;
      const drum = (t * 90) % 360;
      const styl = (Math.sin(t * 0.55) * 0.5 + 0.5);
      const drip = (t * 0.8) % 1;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "lr-peg", width: 46, height: 46, patternUnits: "userSpaceOnUse" },
            R("circle", { cx: 23, cy: 23, r: 3.5, fill: rgba(theme.rule, inv ? 0.4 : 0.9) })),
          R("radialGradient", { id: "lr-hood", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent, 0.24) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent, 0) }))),
        R("rect", { x: 0, y: 0, width: W, height: bench - 300, fill: "url(#lr-peg)", opacity: 0.5 }),
        /* a reagent shelf across the top band, one flask working */
        R("g", { opacity: 0.72 },
          R("rect", { x: 40, y: 250, width: W - 80, height: 16, rx: 4, fill: rgba(tint, 0.6) }),
          [0, 1, 2, 3, 4, 5, 6].map((i) => {
            const hgt = 92 + ((i * 41) % 4) * 34;
            const wdt = 44 + (i % 3) * 14;
            const x = 90 + i * 132;
            return R("g", { key: "rg" + i },
              R("rect", { x: x, y: 250 - hgt, width: wdt, height: hgt, rx: 7, fill: rgba(i % 3 === 0 ? theme.accent : theme.accent2, 0.24), stroke: rgba(tint, 0.5), strokeWidth: 3 }),
              R("rect", { x: x + wdt * 0.25, y: 250 - hgt - 16, width: wdt * 0.5, height: 18, rx: 4, fill: rgba(tint, 0.6) }),
              R("rect", { x: x + 6, y: 250 - hgt * 0.45, width: wdt - 12, height: 12, rx: 3, fill: rgba(theme.surface, 0.35) }),
              i === 3 ? [0, 1, 2].map((j) => {
                const ph = ((t * 0.7 + j * 0.34) % 1);
                return R("circle", { key: "bb" + j, cx: x + wdt / 2 + Math.sin(t * 2 + j) * 8, cy: 240 - ph * (hgt - 30), r: 4 + ph * 3, fill: rgba(theme.accent, 0.7 * (1 - ph)) });
              }) : null);
          })),
        /* tools hung on the pegboard, above the copy */
        R("g", { opacity: 0.55 },
          [0, 1, 2].map((i) => R("g", { key: "tl" + i, transform: "translate(" + (W - 170 + (i - 1) * 62) + ",300) rotate(" + (Math.sin(t * 0.7 + i) * 1.5).toFixed(2) + ")" },
            R("line", { x1: 0, y1: 0, x2: 0, y2: 86 + (i % 3) * 30, stroke: rgba(tint, 0.6), strokeWidth: 6 }),
            i % 2 === 0
              ? R("path", { d: "M -22 " + (86 + (i % 3) * 30) + " h 44 l -8 44 h -28 z", fill: rgba(theme.accent2, 0.6) })
              : R("circle", { cx: 0, cy: 108 + (i % 3) * 30, r: 20, fill: "none", stroke: rgba(theme.accent, 0.6), strokeWidth: 6 })))),
        /* a centrifuge on the shelf, spinning up between runs */
        R("g", { transform: "translate(" + (W - 190) + ",1080)" },
          R("ellipse", { cx: 0, cy: 92, rx: 130, ry: 20, fill: rgba(theme.accentInk, 0.5) }),
          R("path", { d: "M -120 90 h 240 l -18 -140 h -204 z", fill: rgba(theme.surface, inv ? 0.4 : 0.94), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("ellipse", { cx: 0, cy: -50, rx: 104, ry: 34, fill: rgba(theme.accentInk, 0.6), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
          R("g", { transform: "rotate(" + ((t * 620) % 360).toFixed(1) + ")" },
            [0, 1, 2, 3].map((i) => R("ellipse", { key: "rt" + i, cx: Math.cos(i * 1.571) * 62, cy: -50 + Math.sin(i * 1.571) * 20, rx: 16, ry: 8, fill: rgba(theme.accent, 0.7) }))),
          R("rect", { x: -80, y: 24, width: 60, height: 16, rx: 4, fill: rgba(theme.accent, 0.55) }),
          R("circle", { cx: 62, cy: 32, r: 9, fill: rgba(theme.accent2, Math.sin(t * 4) > 0 ? 0.95 : 0.3) })),
        /* a whiteboard of readings beside it */
        R("g", { opacity: 0.6, transform: "translate(200,1060)" },
          R("rect", { x: -150, y: -110, width: 300, height: 220, rx: 6, fill: rgba(theme.surface, inv ? 0.22 : 0.9), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2, 3].map((i) => R("line", { key: "wl" + i, x1: -120, y1: -70 + i * 44, x2: 20 + (i % 2) * 90, y2: -70 + i * 44, stroke: rgba(tint, 0.45), strokeWidth: 5 })),
          R("path", { d: "M -120 60 " + Array.from({ length: 8 }).map((_, i) => "L " + (-120 + i * 34) + " " + (60 - Math.abs(Math.sin(i * 0.8 + t * 0.3)) * 46)).join(" "), fill: "none", stroke: rgba(theme.accent, 0.8), strokeWidth: 4 })),
        /* the bench */
        R("line", { x1: 0, y1: bench, x2: W, y2: bench, stroke: rgba(tint, 0.6), strokeWidth: 8 }),
        R("rect", { x: 0, y: bench, width: W, height: H - bench, fill: rgba(theme.surface, 0.4) }),
        /* burette on a stand, dripping into a flask */
        R("g", { transform: "translate(180," + bench + ")" },
          R("rect", { x: -70, y: -8, width: 140, height: 16, rx: 4, fill: rgba(tint, 0.6) }),
          R("line", { x1: 0, y1: -8, x2: 0, y2: -430, stroke: rgba(tint, 0.55), strokeWidth: 8 }),
          R("line", { x1: 0, y1: -300, x2: 74, y2: -300, stroke: rgba(tint, 0.5), strokeWidth: 6 }),
          R("rect", { x: 62, y: -430, width: 26, height: 130, rx: 6, fill: rgba(theme.accent, 0.3), stroke: rgba(tint, 0.5), strokeWidth: 3 }),
          R("circle", { cx: 75, cy: -292 + drip * 200, r: 7, fill: rgba(theme.accent, 0.9) }),
          R("path", { d: "M 52 -80 h 46 l 30 80 h -106 z", fill: rgba(theme.accent2, 0.24), stroke: rgba(tint, 0.5), strokeWidth: 3 }),
          R("path", { d: "M 36 -20 h 78 l 8 20 h -94 z", fill: rgba(theme.accent2, 0.5) })),
        /* sample rack */
        R("g", { transform: "translate(" + (W - 200) + "," + bench + ")" },
          R("rect", { x: -120, y: -30, width: 240, height: 26, rx: 5, fill: rgba(tint, 0.5) }),
          [0, 1, 2, 3, 4].map((i) => R("rect", { key: "tb" + i, x: -104 + i * 44, y: -120, width: 26, height: 96, rx: 12, fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.55), stroke: rgba(tint, 0.45), strokeWidth: 3 }))),
        /* the chart recorder */
        R("g", { transform: "translate(" + (W * 0.52) + "," + (bench - 20) + ")" },
          R("rect", { x: -230, y: -190, width: 460, height: 190, rx: 10, fill: rgba(theme.surface, 0.95), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("rect", { x: -206, y: -168, width: 412, height: 128, rx: 6, fill: rgba(theme.accentInk, 0.5) }),
          /* the trace already drawn */
          R("path", { d: "M -196 -104 " + Array.from({ length: 12 }).map((_, i) => "L " + (-196 + i * 34) + " " + (-104 + Math.sin(i * 0.9 + t * 0.4) * 34)).join(" "), fill: "none", stroke: rgba(theme.accent, 0.9), strokeWidth: 4 }),
          /* drum and stylus */
          R("g", { transform: "translate(190,-104) rotate(" + drum.toFixed(1) + ")" },
            R("circle", { r: 30, fill: "none", stroke: rgba(theme.accent2, 0.8), strokeWidth: 8 }),
            R("path", { d: "M -30 0 h 60", stroke: rgba(theme.accent2, 0.5), strokeWidth: 5 })),
          R("g", { transform: "translate(" + (-196 + styl * 380).toFixed(1) + ",-168)" },
            R("line", { x1: 0, y1: 0, x2: 0, y2: 128, stroke: rgba(theme.accent, 0.5), strokeWidth: 3 }),
            R("path", { d: "M -12 -14 h 24 l -12 26 z", fill: rgba(theme.ink, 0.9) })),
          R("rect", { x: -206, y: -22, width: 130, height: 14, rx: 7, fill: rgba(theme.accent, 0.6) })),
        /* a magnetic stirrer, its bar spinning and the liquid swirling */
        R("g", { transform: "translate(" + (W * 0.2) + "," + (bench - 6) + ")" },
          R("rect", { x: -80, y: -44, width: 160, height: 44, rx: 8, fill: rgba(theme.surface, inv ? 0.4 : 0.92), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("circle", { cx: -52, cy: -22, r: 9, fill: rgba(theme.accent, 0.9) }),
          R("path", { d: "M -46 -44 h 92 l 14 -104 h -120 z", fill: rgba(theme.accent, 0.18), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
          R("g", { transform: "translate(0,-58) rotate(" + ((t * 720) % 360).toFixed(1) + ")" },
            R("rect", { x: -26, y: -5, width: 52, height: 10, rx: 5, fill: rgba(theme.accent2, 0.9) })),
          R("path", { d: "M -34 -74 q 34 " + (10 + Math.sin(t * 3) * 6).toFixed(1) + " 68 0", fill: "none", stroke: rgba(theme.accent, 0.5), strokeWidth: 4 })),
        /* vapour */
        [0, 1, 2, 3, 4].map((i) => {
          const ph = (t * (0.16 + i * 0.03) + i * 0.2) % 1;
          return R("circle", { key: "vp" + i, cx: 200 + i * 190 + Math.sin(t * 0.9 + i) * 40, cy: bench - ph * 700, r: 14 + ph * 40, fill: rgba(theme.accent, 0.08 * (1 - ph)) });
        }));
    },
  });

  /* ── 20 THESIS DRAFT — 3am study: rain window, radiator, an hourglass ── */
  FilmKit.make({
    global: "ThesisDraft", brand: "Thesis Draft", desk: "#07090f", ambient: 1.45, chrome: false,
    FH: '"Prata", Georgia, serif',
    FB: '"Nunito Sans", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "drowse", itemPreset: "rise", titleLine: 1.12, titleSpace: "-0.005em",
    /* ladder: bg .03 / surface .08 / rule .15 / inkMuted .4 / ink .88 / accent .5 / accent2 .44 */
    palette: (t) => ({
      bg: t.bg || "#101426", surface: "#1a2036", rule: "#2e3650", inkMuted: "#8b93ad",
      ink: "#f2f2f7", accent: t.accent || "#e8829a", accent2: t.accent2 || "#7fa8e8", accentInk: "#0b0e1a",
    }),
    tweaks: [
      { k: "bg", label: "Night", options: ["#101426", "#12142a", "#0e1522"] },
      { k: "accent", label: "Accent", options: ["#e8829a", "#e8c082", "#a8e882"] },
      { k: "accent2", label: "Second", options: ["#7fa8e8", "#a87fe8", "#7fe8d0"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(70% 45% at 78% 8%, " + rgba(theme.accent2, 0.2) + " 0%, transparent 62%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M7 3h10L12 12l5 9H7l5-9z" })),
    cams: ["drop", "zoomIn", "pushU", "pushL", "zoomOut", "pushR"], camMul: 3, camOff: 1,
    mag: { rot: 0.3, driftX: 6, driftY: 7, driftZ: 0.045, slide: 0.2, inn: 0.24, zin: 0.32, zout: 0.28 },
    variants: { Scroll: "board", Typing: "hand", Ring: "gauge" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 106, kicker: { v: "bare", c: "accent" } },
      statement: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 610, size: 118 },
      body: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 540, size: 76, bodySize: 38, ch: 54, lh: 1.56, weight: 400, dim: 0.92, kicker: { v: "bare", c: "accent2" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 86, ch: 25, lh: 1.2, markSize: 220 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 88, swap: "quote", card: { v: "glow", bg: "surface", glow: "accent2", r: 16, line: "inkMuted" }, chips: { v: "pill", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 330, size: 84, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 16, h: 640, labelSize: 42 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 86, cols: ["accent", "accent2", "ink"], num: 146, glowNums: true },
      cta: { bg: "accent", fg: "accentInk", hi: "surface", world: true, top: 470, size: 102, align: "left", btn: { v: "pill", bg: "accentInk", c: "ink" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — the last night of the draft. Far: a window with rain running down
       it and a street glow beyond. Mid: a radiator under the sill, stacks of
       paper on the floor that grow through the film, and an hourglass on a gimbal
       that flips every 11s while the sand streams. Near: rain on the glass. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const floor = H - 280;
      const cyc = (t % 11) / 11;
      const flip = cyc > 0.9 ? E.inOut((cyc - 0.9) / 0.1) : 0;
      const sand = cyc > 0.9 ? 0 : cyc / 0.9;
      const grow = Math.min(1, (t % 40) / 40);
      return R("g", null,
        R("defs", null,
          R("linearGradient", { id: "td-glass", x1: "0%", y1: "0%", x2: "0%", y2: "100%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent2, 0.22) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent2, 0.04) }))),
        /* the city beyond the glass, with a night bus crossing */
        R("g", { opacity: 0.55 },
          [0, 1, 2, 3, 4, 5, 6].map((i) => {
            const bh = 60 + ((i * 61) % 5) * 30;
            return R("rect", { key: "ct" + i, x: 80 + i * 132, y: 268 - bh, width: 84, height: bh, fill: rgba(theme.accent2, 0.4) });
          }),
          [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => R("rect", { key: "wn" + i, x: 100 + i * 104, y: 214 - (i % 3) * 30, width: 14, height: 18, fill: rgba(theme.accent2, Math.sin(t * 0.8 + i * 1.7) > 0.3 ? 0.85 : 0.22) })),
          (function () {
            const bx = ((t * 42) % (W + 400)) - 200;
            return R("g", { transform: "translate(" + bx.toFixed(1) + ",250)" },
              R("rect", { x: -90, y: -34, width: 180, height: 34, rx: 5, fill: rgba(theme.accent, 0.5) }),
              [0, 1, 2, 3].map((j) => R("rect", { key: "bw" + j, x: -74 + j * 40, y: -26, width: 24, height: 14, rx: 2, fill: rgba(theme.accent2, 0.9) })));
          })()),
        /* the window, above the copy */
        R("g", null,
          R("rect", { x: 70, y: 30, width: W - 140, height: 240, rx: 6, fill: "url(#td-glass)", stroke: rgba(tint, 0.5), strokeWidth: 6 }),
          R("line", { x1: W / 2, y1: 30, x2: W / 2, y2: 270, stroke: rgba(tint, 0.4), strokeWidth: 5 }),
          R("line", { x1: 70, y1: 150, x2: W - 70, y2: 150, stroke: rgba(tint, 0.4), strokeWidth: 5 }),
          R("rect", { x: 50, y: 270, width: W - 100, height: 18, rx: 4, fill: rgba(tint, 0.55) }),
          [0, 1, 2, 3, 4, 5].map((i) => R("circle", { key: "sg" + i, cx: 140 + i * 150, cy: 90 + (i % 3) * 60, r: 16, fill: rgba(theme.accent2, 0.18 + 0.1 * Math.sin(t * 0.9 + i)) })),
          /* rain running down the pane */
          [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const ph = (t * (0.5 + (i % 4) * 0.14) + i * 0.13) % 1;
            return R("line", { key: "rn" + i, x1: 110 + i * 118, y1: 34 + ph * 200, x2: 106 + i * 118, y2: 34 + ph * 200 + 40, stroke: rgba(theme.accent2, 0.5 * (1 - ph)), strokeWidth: 3, strokeLinecap: "round" });
          })),
        /* a bookshelf on the back wall, drifting on parallax */
        R("g", { opacity: 0.4, transform: "translate(" + (-((t * 5) % 240)).toFixed(1) + ",0)" },
          [0, 1].map((r) => R("g", { key: "sh" + r },
            R("line", { x1: 0, y1: 1000 + r * 210, x2: W + 300, y2: 1000 + r * 210, stroke: rgba(tint, 0.5), strokeWidth: 5 }),
            [0, 1, 2, 3, 4, 5, 6].map((i) => R("rect", { key: "bk" + i, x: 40 + i * 130 + (i % 3) * 12, y: 1000 + r * 210 - (96 + (i % 4) * 34), width: 28 + (i % 3) * 12, height: 96 + (i % 4) * 34, rx: 3, fill: rgba(i % 4 === 0 ? theme.accent : tint, 0.42) }))))),
        /* a chair pushed back, a mug, and a bin of discarded drafts */
        R("g", { opacity: 0.75, transform: "translate(" + (W * 0.52) + "," + (floor - 10) + ")" },
          R("path", { d: "M -78 0 h 156 v -20 h -156 z", fill: rgba(tint, 0.6) }),
          R("path", { d: "M 62 -20 v -150 q 0 -26 -30 -26 h -34", fill: "none", stroke: rgba(tint, 0.55), strokeWidth: 10 }),
          R("path", { d: "M -40 0 l -22 44 M 40 0 l 22 44 M -40 0 l 8 44 M 40 0 l -8 44", stroke: rgba(tint, 0.5), strokeWidth: 8, strokeLinecap: "round" })),
        R("g", { transform: "translate(" + (W - 430) + "," + (floor - 6) + ")" },
          R("path", { d: "M -34 0 h 68 l -8 -56 h -52 z", fill: rgba(theme.surface, inv ? 0.5 : 0.9), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
          R("path", { d: "M 34 -44 q 26 4 22 18 q -4 14 -24 12", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          [0, 1].map((i) => {
            const ph = ((t * 0.42 + i * 0.5) % 1);
            return R("path", { key: "st" + i, d: "M " + (-12 + i * 22) + " -66 q " + (Math.sin(t * 1.4 + i * 2) * 12).toFixed(1) + " -40 0 -78", fill: "none", stroke: rgba(theme.ink, 0.2 * (1 - ph)), strokeWidth: 6, strokeLinecap: "round", transform: "translate(0," + (-ph * 90).toFixed(1) + ")" });
          })),
        R("g", { transform: "translate(" + (W - 620) + "," + floor + ")" },
          R("path", { d: "M -54 0 h 108 l -12 -110 h -84 z", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2].map((i) => R("circle", { key: "wd" + i, cx: -24 + i * 26, cy: -74 - (i % 2) * 26, r: 20 - (i % 2) * 4, fill: rgba(theme.surface, inv ? 0.45 : 0.85), stroke: rgba(tint, 0.35), strokeWidth: 2 })),
          (function () {
            const ph = (t % 6) / 6;
            const fall = ph < 0.4 ? ph / 0.4 : 1;
            return R("circle", { cx: 10 + fall * 8, cy: -300 + fall * 210, r: 18, fill: rgba(theme.surface, inv ? 0.5 : 0.9), stroke: rgba(tint, 0.35), strokeWidth: 2, opacity: 1 - Math.max(0, (ph - 0.45) / 0.2) });
          })()),
        /* radiator under the sill */
        R("g", { opacity: 0.6, transform: "translate(" + (W - 260) + ",330)" },
          R("rect", { x: -150, y: 0, width: 300, height: 140, rx: 8, fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2, 3, 4, 5].map((i) => R("line", { key: "rf" + i, x1: -126 + i * 50, y1: 8, x2: -126 + i * 50, y2: 132, stroke: rgba(tint, 0.4), strokeWidth: 8 })),
          [0, 1, 2].map((i) => {
            const ph = ((t * 0.3 + i * 0.34) % 1);
            return R("path", { key: "ht" + i, d: "M " + (-80 + i * 80) + " 0 q " + (Math.sin(t + i) * 18).toFixed(1) + " -60 0 -120", fill: "none", stroke: rgba(theme.accent, 0.14 * (1 - ph)), strokeWidth: 10, strokeLinecap: "round", transform: "translate(0," + (-ph * 90).toFixed(1) + ")" });
          })),
        /* pages pinned to the wall, and a lamp bent over the desk */
        R("g", { transform: "translate(" + (W - 170) + ",1020)" },
          R("rect", { x: -120, y: -160, width: 240, height: 320, rx: 6, fill: rgba(theme.accent2, 0.08), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          [0, 1, 2, 3].map((i) => {
            const sw = Math.sin(t * 1.2 + i * 1.5) * 2.4;
            return R("g", { key: "pn" + i, transform: "translate(" + (-58 + (i % 2) * 116) + "," + (-90 + Math.floor(i / 2) * 160) + ") rotate(" + sw.toFixed(2) + ")" },
              R("rect", { x: -44, y: -50, width: 88, height: 110, rx: 3, fill: rgba(theme.surface, inv ? 0.5 : 0.9), stroke: rgba(tint, 0.3), strokeWidth: 2 }),
              R("rect", { x: -30, y: -32, width: 60, height: 8, rx: 4, fill: rgba(theme.accent, 0.6) }),
              [0, 1, 2].map((j) => R("line", { key: "pl" + j, x1: -30, y1: -10 + j * 16, x2: 30 - (j % 2) * 18, y2: -10 + j * 16, stroke: rgba(tint, 0.3), strokeWidth: 4 })),
              R("circle", { cx: 0, cy: -50, r: 5, fill: rgba(theme.accent, 0.9) }));
          })),
        R("g", { transform: "translate(190,1240)" },
          R("path", { d: "M -46 60 h 92 l -12 -18 h -68 z", fill: rgba(tint, 0.6) }),
          R("path", { d: "M 0 42 v -120 q 0 -40 60 -52", fill: "none", stroke: rgba(tint, 0.6), strokeWidth: 8 }),
          R("path", { d: "M 44 -142 h 74 l -18 56 h -46 z", fill: rgba(theme.accent2, 0.75) }),
          R("circle", { cx: 78, cy: -80, r: 14 + Math.sin(t * 2.2) * 2, fill: rgba(theme.accent, 0.9) }),
          R("path", { d: "M 40 -74 L 118 -74 L 170 168 L -12 168 Z", fill: rgba(theme.accent, 0.028) }),
          R("ellipse", { cx: 78, cy: 168, rx: 96, ry: 16, fill: rgba(theme.accent, 0.05) })),
        /* paper stacks on the floor, growing */
        R("line", { x1: 0, y1: floor, x2: W, y2: floor, stroke: rgba(tint, 0.5), strokeWidth: 6 }),
        [0, 1, 2].map((i) => R("g", { key: "ps" + i, transform: "translate(" + (140 + i * 300) + "," + floor + ")" },
          Array.from({ length: Math.max(2, Math.round((4 + i * 2) * grow) + 2) }).map((_, j) => R("rect", { key: "pp" + j, x: -90 + (j % 2) * 10, y: -22 - j * 20, width: 180 - (j % 2) * 16, height: 16, rx: 3, fill: rgba(theme.surface, inv ? 0.5 : 0.9), stroke: rgba(tint, 0.3), strokeWidth: 2 })))),
        /* the hourglass on its gimbal */
        R("g", { transform: "translate(" + (W - 180) + "," + (floor - 250) + ")" },
          R("circle", { r: 150, fill: "none", stroke: rgba(tint, 0.34), strokeWidth: 5 }),
          R("g", { transform: "rotate(" + (flip * 180).toFixed(1) + ")" },
            R("path", { d: "M -90 -130 h 180 v 16 h -180 z M -90 130 h 180 v -16 h -180 z", fill: rgba(theme.accent2, 0.8) }),
            R("path", { d: "M -74 -114 L -8 0 L -74 114 h 148 L 8 0 L 74 -114 z", fill: rgba(theme.surface, 0.2), stroke: rgba(tint, 0.55), strokeWidth: 4 }),
            R("path", { d: "M -66 " + (-108 + 100 * sand) + " L -6 -4 L 6 -4 L 66 " + (-108 + 100 * sand) + " z", fill: rgba(theme.accent, 0.85) }),
            R("path", { d: "M -" + (18 + 46 * sand) + " 108 L 0 " + (108 - 96 * sand) + " L " + (18 + 46 * sand) + " 108 z", fill: rgba(theme.accent, 0.85) }),
            R("line", { x1: 0, y1: -4, x2: 0, y2: 100, stroke: rgba(theme.accent, 0.7 * (sand > 0.02 ? 1 : 0)), strokeWidth: 4 }))),
        /* rain on the near plane */
        Array.from({ length: 14 }).map((_, i) => {
          const ph = (t * (0.6 + (i % 4) * 0.14) + i * 0.1) % 1;
          const x = 30 + i * 78;
          return R("line", { key: "nr" + i, x1: x, y1: -60 + ph * (H + 120), x2: x - 12, y2: -60 + ph * (H + 120) + 52, stroke: rgba(theme.accent2, 0.24 * (1 - ph * 0.3)), strokeWidth: 2.5, strokeLinecap: "round" });
        }));
    },
  });
})();
