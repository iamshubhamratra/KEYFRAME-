/* article-pack-02.js — cohort 02, literary / essay: packs 06-10.
   Quiet Hours · Long Winter · Slow Reader · Bound Volume · Loose Leaf
   Contract as cohort 01: hexes only in palette(), look and World name slots,
   chrome:false, three depth planes, an object that travels a route with
   secondary motion, everything clear of the text column, tone-aware tints so
   inverted beats never go flat. Constraints inherited from
   kit/PATCH-article-beats.md: no ticker/stack for list beats, app.line >= 3:1
   from app.cardBg, unique (Scroll, Typing, Ring) triple per pack. */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ── 06 QUIET HOURS — a night study: lamp pool, shelves, a moth on orbit ── */
  FilmKit.make({
    global: "QuietHours", brand: "Quiet Hours", desk: "#1a1712", ambient: 1.5, chrome: false,
    FH: '"EB Garamond", Georgia, serif',
    FB: '"Andada Pro", Georgia, serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "drowse", itemPreset: "rise", titleLine: 1.1, titleSpace: "-0.01em",
    /* ladder: bg .84 / surface .93 / rule .7 / inkMuted .42 / ink .08 / accent .45 / accent2 .4 */
    palette: (t) => ({
      bg: t.bg || "#efe6d4", surface: "#f9f3e6", rule: "#cfc2a6", inkMuted: "#6f6552",
      ink: "#1b1710", accent: t.accent || "#b8813a", accent2: t.accent2 || "#6f7f5c", accentInk: "#1b1710",
    }),
    tweaks: [
      { k: "bg", label: "Paper", options: ["#efe6d4", "#f0e9db", "#ece5d6"] },
      { k: "accent", label: "Lamplight", options: ["#b8813a", "#a8703f", "#8c7a3a"] },
      { k: "accent2", label: "Second", options: ["#6f7f5c", "#5c7a7f", "#7f5c6f"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(90% 55% at 76% 88%, " + rgba(theme.accent, 0.3) + " 0%, transparent 62%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M7 9l5-6 5 6z" }), R2("path", { d: "M12 9v9M8 21h8" })),
    cams: ["zoomIn", "pushU", "drop", "pushL", "zoomOut", "pushR"], camMul: 5, camOff: 1,
    mag: { rot: 0.25, driftX: 6, driftY: 7, driftZ: 0.045, slide: 0.2, inn: 0.24, zin: 0.3, zout: 0.26 },
    variants: { Typing: "hand", Scroll: "feed", Ring: "ring" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 310, size: 116, kicker: { v: "bare", c: "accent" } },
      statement: { bg: "ink", fg: "surface", hi: "accent", world: true, top: 610, size: 128 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 82, bodySize: 39, ch: 54, lh: 1.56, weight: 400, dim: 0.92, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 92, ch: 26, lh: 1.18, markSize: 220 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 96, swap: "body", card: { v: "paper", bg: "surface", r: 8, line: "inkMuted" }, chips: { v: "outline", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 330, size: 86, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 10, h: 640, labelSize: 42 }, tilts: [-1, 1, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 88, cols: ["accent", "accent2", "ink"], num: 146, rule: true },
      cta: { bg: "ink", fg: "surface", hi: "accent", world: true, top: 470, size: 108, align: "left", btn: { v: "pill", bg: "accent", c: "ink" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — the desk lamp is lit and a moth is working the light. Far: a laid
       paper weave, shelf silhouettes drifting on parallax. Mid: the lamp pool
       breathing, the lamp itself in the right margin, a moth on a 7s figure-eight
       around the shade with wingbeat. Near: dust in the beam, rising. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg === theme.ink;
      const tint = inv ? theme.surface : theme.inkMuted;
      const rule = inv ? theme.surface : theme.rule;
      const lampX = W - 190, lampY = H - 470;
      const a = t / 7 * Math.PI * 2;
      const mx = lampX + Math.sin(a) * 190, my = lampY + Math.sin(a * 2) * 120 - 40;
      const wing = 0.4 + 0.6 * Math.abs(Math.sin(t * 9));
      const breathe = 0.86 + 0.14 * Math.sin(t * 0.9);
      const shelf = (t * 7) % 300;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "qh-weave", width: 34, height: 34, patternUnits: "userSpaceOnUse" },
            R("path", { d: "M0 17h34M17 0v34", stroke: rgba(rule, inv ? 0.14 : 0.34), strokeWidth: 1.5 })),
          R("radialGradient", { id: "qh-pool", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent, 0.66) }),
            R("stop", { offset: "60%", stopColor: rgba(theme.accent, 0.26) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent, 0) }))),
        R("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#qh-weave)" }),
        /* night window above the kicker, with a moon and a few stars */
        R("g", { opacity: 0.62 },
          R("rect", { x: 56, y: -46, width: 420, height: 262, rx: 6, fill: rgba(theme.ink, 0.14), stroke: rgba(tint, 0.5), strokeWidth: 6 }),
          R("line", { x1: 266, y1: -46, x2: 266, y2: 216, stroke: rgba(tint, 0.4), strokeWidth: 5 }),
          R("rect", { x: 36, y: 216, width: 460, height: 16, rx: 4, fill: rgba(tint, 0.55) }),
          R("path", { d: "M 392 40 a 52 52 0 1 0 0 96 a 40 40 0 1 1 0 -96 z", fill: rgba(theme.accent, 0.5) }),
          [0, 1, 2, 3].map((i) => {
            const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.9 + i * 0.4) + i));
            return R("circle", { key: "sr" + i, cx: 110 + i * 54, cy: 40 + (i % 3) * 46, r: 3.5, fill: rgba(theme.accent, tw) });
          })),
        /* the lamp throws two long shadows up the wall */
        R("path", { d: "M " + (W - 190) + " " + (H - 470) + " L 120 " + (H - 1180) + " L 360 " + (H - 1240) + " Z", fill: rgba(theme.ink, 0.05) }),
        R("path", { d: "M " + (W - 190) + " " + (H - 470) + " L " + (W - 40) + " " + (H - 1260) + " L " + (W - 300) + " " + (H - 1210) + " Z", fill: rgba(theme.ink, 0.045) }),
        /* shelves, parallax */
        R("g", { opacity: 0.36, transform: "translate(" + (-shelf).toFixed(1) + ",0)" },
          [0, 1, 2, 3, 4].map((i) => R("line", { key: "sh" + i, x1: 0, y1: 980 + i * 190, x2: W + 320, y2: 980 + i * 190, stroke: rgba(tint, 0.62), strokeWidth: 5 })),
          [0, 1, 2, 3, 4, 5, 6, 7].map((i) => R("rect", { key: "bk" + i, x: 60 + i * 170 + (i % 3) * 14, y: 980 + (i % 3) * 190 - 96, width: 26 + (i % 4) * 9, height: 96, rx: 3, fill: rgba(tint, 0.46) }))),
        /* a framed print on the wall, in the margin */
        R("g", { transform: "translate(" + (W - 148) + ",700) rotate(" + (Math.sin(t * 0.5) * 1.1).toFixed(2) + ")" },
          R("line", { x1: 0, y1: -150, x2: -60, y2: -96, stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("line", { x1: 0, y1: -150, x2: 60, y2: -96, stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("rect", { x: -104, y: -96, width: 208, height: 260, rx: 4, fill: rgba(theme.surface, 0.7), stroke: rgba(tint, 0.55), strokeWidth: 5 }),
          R("path", { d: "M -74 116 q 54 -132 74 -46 q 26 -66 74 46 z", fill: rgba(theme.accent2, 0.5) }),
          R("circle", { cx: 40, cy: -34, r: 22, fill: rgba(theme.accent, 0.45) })),
        /* the pool of light */
        R("ellipse", { cx: lampX - 120, cy: H - 250, rx: 620 * breathe, ry: 300 * breathe, fill: "url(#qh-pool)" }),
        /* the lamp */
        R("g", { transform: "translate(" + lampX + "," + lampY + ")" },
          R("path", { d: "M -104 0 L 104 0 L 60 -128 L -60 -128 Z", fill: rgba(theme.surface, inv ? 0.22 : 0.95), stroke: rgba(tint, 0.55), strokeWidth: 3 }),
          R("path", { d: "M -104 0 L 104 0 L 92 14 L -92 14 Z", fill: rgba(theme.accent, 0.75) }),
          R("line", { x1: 0, y1: 14, x2: 0, y2: 300, stroke: rgba(tint, 0.6), strokeWidth: 7 }),
          R("ellipse", { cx: 0, cy: 306, rx: 74, ry: 16, fill: rgba(tint, 0.55) }),
          R("circle", { cx: 0, cy: -60, r: 26 * breathe, fill: rgba(theme.accent, 0.85) })),
        /* the desk, and the night's work on it */
        R("line", { x1: -20, y1: H - 400, x2: 760, y2: H - 400, stroke: rgba(tint, 0.5), strokeWidth: 7, strokeLinecap: "round" }),
        R("rect", { x: -20, y: H - 400, width: 780, height: 22, fill: rgba(tint, 0.26) }),
        /* an open notebook with a pen laid across it */
        R("g", { transform: "translate(300," + (H - 400) + ")" },
          R("path", { d: "M -150 0 L -8 -14 L -8 -74 L -150 -56 Z", fill: rgba(theme.surface, 0.94), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("path", { d: "M 150 0 L 8 -14 L 8 -74 L 150 -56 Z", fill: rgba(theme.surface, 0.94), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          [0, 1, 2].map((i) => R("line", { key: "nl" + i, x1: -130, y1: -30 - i * 14, x2: -30, y2: -36 - i * 14, stroke: rgba(tint, 0.3), strokeWidth: 3 })),
          R("path", { d: "M -60 -18 L 116 -78 l 6 12 L -54 -6 z", fill: rgba(theme.accent2, 0.8) })),
        /* a cup, still steaming */
        R("g", { transform: "translate(560," + (H - 400) + ") scale(1.15)" },
          R("path", { d: "M -44 -62 h 88 l -9 62 h -70 z", fill: rgba(theme.surface, 0.92), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("path", { d: "M 44 -50 q 34 5 29 25 q -5 19 -32 17", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2].map((i) => {
            const ph = ((t * 0.4 + i * 0.34) % 1);
            const sw = Math.sin(t * 1.3 + i * 2) * 15;
            return R("path", { key: "qs" + i, d: "M " + (-18 + i * 18) + " -78 q " + sw.toFixed(1) + " -52 " + (sw * 0.4).toFixed(1) + " -104", fill: "none", stroke: rgba(tint, 0.3 * (1 - ph)), strokeWidth: 6, strokeLinecap: "round", transform: "translate(0," + (-ph * 120).toFixed(1) + ")" });
          })),
        /* two books stacked, and a cat asleep at the end of the desk */
        R("g", null,
          R("rect", { x: 40, y: H - 434, width: 176, height: 20, rx: 4, fill: rgba(theme.accent2, 0.7) }),
          R("rect", { x: 52, y: H - 456, width: 152, height: 22, rx: 4, fill: rgba(theme.accent, 0.6) })),
        R("g", { transform: "translate(690," + (H - 402) + ") scale(1.22," + (1 + Math.sin(t * 0.8) * 0.03).toFixed(3) + ")" },
          R("path", { d: "M -96 0 q -12 -70 46 -80 q 66 -12 96 30 q 22 32 -6 50 z", fill: rgba(tint, 0.5) }),
          R("path", { d: "M 32 -54 l 10 -26 l 18 20 z", fill: rgba(tint, 0.5) }),
          R("path", { d: "M -96 0 q -46 -18 -58 6 q 26 10 58 -6 z", fill: rgba(tint, 0.42) })),
        /* a second moth, its own phase */
        R("g", { transform: "translate(" + (lampX + Math.sin(a * 0.7 + 2.1) * 230).toFixed(1) + "," + (lampY + Math.cos(a * 1.4 + 1.2) * 150 - 90).toFixed(1) + ") rotate(" + (Math.sin(a + 1) * 26).toFixed(1) + ") scale(0.72)" },
          R("ellipse", { cx: 0, cy: 0, rx: 9, ry: 20, fill: rgba(tint, 0.7) }),
          R("path", { d: "M -6 -6 q -44 " + (-28 * (1 - wing)).toFixed(1) + " -32 " + (24 * (1 - wing) + 8).toFixed(1) + " q 12 13 32 4 z", fill: rgba(theme.accent, 0.55) }),
          R("path", { d: "M 6 -6 q 44 " + (-28 * (1 - wing)).toFixed(1) + " 32 " + (24 * (1 - wing) + 8).toFixed(1) + " q -12 13 -32 4 z", fill: rgba(theme.accent, 0.55) })),
        /* the moth */
        R("g", { transform: "translate(" + mx.toFixed(1) + "," + my.toFixed(1) + ") rotate(" + (Math.cos(a) * 22).toFixed(1) + ")" },
          R("ellipse", { cx: 0, cy: 0, rx: 9, ry: 20, fill: rgba(tint, 0.85) }),
          R("path", { d: "M -6 -6 q -46 " + (-30 * wing).toFixed(1) + " -34 " + (26 * wing + 8).toFixed(1) + " q 12 14 34 4 z", fill: rgba(theme.accent2, 0.7) }),
          R("path", { d: "M 6 -6 q 46 " + (-30 * wing).toFixed(1) + " 34 " + (26 * wing + 8).toFixed(1) + " q -12 14 -34 4 z", fill: rgba(theme.accent2, 0.7) }),
          R("path", { d: "M -3 -20 l -12 -14 M 3 -20 l 12 -14", stroke: rgba(tint, 0.7), strokeWidth: 2.5, strokeLinecap: "round" })),
        /* dust in the beam */
        [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const ph = (t * (0.1 + i * 0.02) + i * 0.14) % 1;
          return R("circle", { key: "d" + i, cx: lampX - 420 + i * 78 + Math.sin(t * 0.6 + i) * 34, cy: H - 130 - ph * 620, r: 3 + (i % 3) * 2, fill: rgba(theme.accent, 0.4 * (1 - ph)) });
        }));
    },
  });

  /* ── 07 LONG WINTER — a snowfield: hills, poles, a steam train crossing ── */
  FilmKit.make({
    global: "LongWinter", brand: "Long Winter", desk: "#0e1620", ambient: 1.6, chrome: false,
    FH: '"Cormorant Garamond", Georgia, serif',
    FB: '"Lora", Georgia, serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "rise", itemPreset: "drowse", titleLine: 1.06, titleSpace: "-0.005em",
    /* ladder: bg .88 / surface .96 / rule .74 / inkMuted .44 / ink .07 / accent .38 / accent2 .46 */
    palette: (t) => ({
      bg: t.bg || "#e7edf2", surface: "#f8fbfd", rule: "#c2cfd9", inkMuted: "#67757f",
      ink: "#141a1f", accent: t.accent || "#2f6a7a", accent2: t.accent2 || "#b4623f", accentInk: "#f8fbfd",
    }),
    tweaks: [
      { k: "bg", label: "Snow", options: ["#e7edf2", "#eaeff3", "#e5ecf1"] },
      { k: "accent", label: "Deep", options: ["#2f6a7a", "#3a5f86", "#3f6a5c"] },
      { k: "accent2", label: "Ember", options: ["#b4623f", "#a8474f", "#96702f"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(180deg, " + rgba(theme.surface, 0.95) + " 0%, " + bg + " 52%, " + rgba(theme.rule, 0.5) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M12 3v18M5 8l7 4 7-4M5 16l7-4 7 4" })),
    cams: ["pushR", "zoomOut", "pushL", "drop", "pushU", "zoomIn"], camMul: 3, camOff: 2,
    mag: { rot: 0.2, driftX: 9, driftY: 5, driftZ: 0.04, slide: 0.26, inn: 0.22, zin: 0.32, zout: 0.34 },
    variants: { Typing: "caret", Scroll: "board", Ring: "bar" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 128, kicker: { v: "outline", c: "accent" } },
      statement: { bg: "accent", fg: "accentInk", hi: "accent2", world: true, top: 600, size: 140 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 88, bodySize: 39, ch: 54, lh: 1.56, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 350, size: 100, ch: 24, lh: 1.14, markSize: 240 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 250, size: 104, swap: "quote", card: { v: "frame", bg: "surface", r: 14, line: "inkMuted" }, chips: { v: "pill", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: 94, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 14, h: 640, labelSize: 44 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 96, cols: ["accent", "accent2", "ink"], num: 150 },
      cta: { bg: "ink", fg: "surface", hi: "accent2", world: true, top: 470, size: 116, align: "left", btn: { v: "pill", bg: "accent2", c: "accentInk" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — a train crossing a snowfield at dusk. Far: two hill silhouettes on
       different parallax speeds and a frozen lake band. Mid: telegraph poles
       passing, the locomotive running a 15s traverse with driving wheels turning
       at travel speed and a smoke plume that drifts back and dissipates. Near:
       snow falling fast in three sizes. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const line = inv ? theme.surface : theme.rule;
      const cyc = (t % 15) / 15, tx = -320 + cyc * (W + 640);
      const wheel = (tx / 46) * 57.3;
      const track = H - 300, hill1 = (t * 6) % 420, hill2 = (t * 14) % 300;
      return R("g", null,
        R("defs", null,
          R("radialGradient", { id: "lw-dusk", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent2, 0.3) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent2, 0) }))),
        R("circle", { cx: W * 0.24, cy: track - 520, r: 420, fill: "url(#lw-dusk)" }),
        R("circle", { cx: W * 0.24, cy: track - 520, r: 96, fill: rgba(theme.accent2, 0.34) }),
        R("circle", { cx: W * 0.24, cy: track - 520, r: 128, fill: "none", stroke: rgba(theme.accent2, 0.22), strokeWidth: 3 }),
        /* a distant tree row */
        R("g", { opacity: 0.34 },
          [0, 1, 2, 3, 4].map((i) => {
            const tx2 = ((i * 240 - (t * 18) % 240) % (W + 240)) - 120;
            const th2 = 90 + (i % 3) * 40;
            return R("path", { key: "tr" + i, d: "M " + tx2 + " " + (track - 380) + " l " + (th2 * 0.32) + " " + th2 + " h " + (-th2 * 0.64) + " z", fill: rgba(theme.accent, 0.55) });
          })),
        /* hills */
        R("path", { d: "M " + (-hill1) + " " + (track - 210) + " q 300 -190 620 -40 q 300 140 640 -80 L " + (W + 500) + " " + H + " L " + (-hill1) + " " + H + " Z", fill: rgba(theme.accent, 0.16) }),
        R("path", { d: "M " + (-hill2) + " " + (track - 90) + " q 260 -140 520 10 q 250 130 540 -50 L " + (W + 400) + " " + H + " L " + (-hill2) + " " + H + " Z", fill: rgba(theme.accent, 0.24) }),
        /* frozen lake band */
        R("rect", { x: 0, y: track + 120, width: W, height: 150, fill: rgba(theme.accent, 0.12) }),
        [0, 1, 2, 3].map((i) => R("line", { key: "ice" + i, x1: 60 + i * 260, y1: track + 150 + (i % 2) * 60, x2: 260 + i * 260, y2: track + 150 + (i % 2) * 60, stroke: rgba(theme.surface, 0.7), strokeWidth: 4, strokeLinecap: "round" })),
        /* a farmhouse on the far hill, one window lit, smoke from the chimney */
        R("g", { transform: "translate(" + (W * 0.7 - hill1 * 0.25).toFixed(1) + "," + (track - 196) + ")" },
          R("path", { d: "M -74 0 h 148 v -84 h -148 z", fill: rgba(theme.ink, 0.62) }),
          R("path", { d: "M -90 -84 L 0 -142 L 90 -84 z", fill: rgba(theme.ink, 0.72) }),
          R("rect", { x: 40, y: -168, width: 22, height: 40, fill: rgba(theme.ink, 0.7) }),
          R("rect", { x: -34, y: -62, width: 34, height: 30, rx: 3, fill: rgba(theme.accent2, 0.85) }),
          [0, 1, 2].map((i) => {
            const ph = ((t * 0.3 + i * 0.34) % 1);
            return R("circle", { key: "fs" + i, cx: 51 + Math.sin(t * 0.8 + i) * 16 - ph * 30, cy: -176 - ph * 120, r: 9 + ph * 22, fill: rgba(theme.inkMuted, 0.26 * (1 - ph)) });
          })),
        /* a fence line, closer than the poles */
        R("g", { opacity: 0.5 },
          [0, 1, 2, 3, 4, 5, 6].map((i) => {
            const fx = ((i * 190 - (t * 26) % 190) % (W + 190)) - 95;
            return R("line", { key: "fp" + i, x1: fx, y1: track - 84, x2: fx, y2: track - 174, stroke: rgba(theme.inkMuted, 0.65), strokeWidth: 6 });
          }),
          R("line", { x1: 0, y1: track - 150, x2: W, y2: track - 150, stroke: rgba(theme.inkMuted, 0.4), strokeWidth: 4 }),
          R("line", { x1: 0, y1: track - 116, x2: W, y2: track - 116, stroke: rgba(theme.inkMuted, 0.32), strokeWidth: 4 })),
        /* a crossing signal in the right margin */
        R("g", { transform: "translate(" + (W - 66) + "," + track + ")" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: -230, stroke: rgba(theme.inkMuted, 0.6), strokeWidth: 7 }),
          R("path", { d: "M -34 -264 L 34 -196 M 34 -264 L -34 -196", stroke: rgba(theme.accent2, 0.7), strokeWidth: 7, strokeLinecap: "round" }),
          R("circle", { cx: 0, cy: -170, r: 12, fill: rgba(theme.accent2, Math.sin(t * 3) > 0 ? 0.95 : 0.25) })),
        /* telegraph poles passing */
        [0, 1, 2, 3, 4].map((i) => {
          const px = ((i * 280 - (t * 34) % 280) % (W + 280)) - 140;
          return R("g", { key: "tp" + i, opacity: 0.45 },
            R("line", { x1: px, y1: track - 40, x2: px, y2: track - 330, stroke: rgba(tint, 0.6), strokeWidth: 6 }),
            R("line", { x1: px - 44, y1: track - 300, x2: px + 44, y2: track - 300, stroke: rgba(tint, 0.5), strokeWidth: 5 }),
            R("path", { d: "M " + (px - 44) + " " + (track - 296) + " q 140 40 280 0", fill: "none", stroke: rgba(tint, 0.3), strokeWidth: 3 }));
        }),
        /* rails */
        R("line", { x1: 0, y1: track, x2: W, y2: track, stroke: rgba(tint, 0.55), strokeWidth: 6 }),
        R("line", { x1: 0, y1: track + 26, x2: W, y2: track + 26, stroke: rgba(tint, 0.3), strokeWidth: 4 }),
        Array.from({ length: 10 }).map((_, i) => R("line", { key: "sl" + i, x1: ((i * 84 - (t * 60) % 84) % (W + 84)) - 42, y1: track - 6, x2: ((i * 84 - (t * 60) % 84) % (W + 84)) - 42, y2: track + 32, stroke: rgba(tint, 0.24), strokeWidth: 8 })),
        /* smoke, drifting back */
        [0, 1, 2, 3, 4, 5].map((i) => {
          const age = (cyc * 15 - i * 0.5);
          if (age < 0) return null;
          const dr = Math.min(1, age / 5);
          return R("circle", { key: "sm" + i, cx: tx + 96 - dr * 320 - i * 30, cy: track - 190 - dr * 210, r: 22 + dr * 66, fill: rgba(theme.inkMuted, 0.3 * (1 - dr)) });
        }),
        /* the locomotive */
        R("g", { transform: "translate(" + tx.toFixed(1) + "," + track + ")" },
          R("rect", { x: -180, y: -132, width: 150, height: 100, rx: 8, fill: rgba(theme.ink, 0.88) }),
          R("path", { d: "M -30 -120 h 150 a 46 46 0 0 1 0 92 h -150 z", fill: rgba(theme.ink, 0.92) }),
          R("path", { d: "M -30 -120 h 150 a 46 46 0 0 1 14 22 h -164 z", fill: rgba(theme.surface, 0.16) }),
          R("rect", { x: 84, y: -196, width: 34, height: 78, rx: 5, fill: rgba(theme.ink, 0.9) }),
          R("rect", { x: -196, y: -34, width: 372, height: 30, rx: 6, fill: rgba(theme.accent2, 0.9) }),
          R("circle", { cx: 132, cy: -74, r: 17, fill: rgba(theme.accent2, 0.9) }),
          [-120, -40, 96].map((wx, i) => R("g", { key: "wl" + i, transform: "translate(" + wx + ",4) rotate(" + wheel.toFixed(1) + ")" },
            R("circle", { r: i === 2 ? 40 : 30, fill: "none", stroke: rgba(theme.ink, 0.9), strokeWidth: 9 }),
            R("path", { d: "M " + (-(i === 2 ? 40 : 30)) + " 0 h " + ((i === 2 ? 40 : 30) * 2), stroke: rgba(theme.ink, 0.7), strokeWidth: 6 })))),
        /* reeds at the lake edge, and drifts in the foreground */
        R("g", null,
          Array.from({ length: 12 }).map((_, i) => {
            const rx2 = 30 + i * 92 + (i % 3) * 12;
            const lean = Math.sin(t * 1.2 + i * 0.6) * (12 + (i % 3) * 5);
            const hgt = 90 + ((i * 29) % 5) * 26;
            return R("path", { key: "rd" + i, d: "M " + rx2 + " " + (track + 250) + " q " + (lean * 0.5).toFixed(1) + " " + (-hgt * 0.55).toFixed(1) + " " + lean.toFixed(1) + " " + (-hgt).toFixed(1), fill: "none", stroke: rgba(theme.accent, 0.42), strokeWidth: 4, strokeLinecap: "round" });
          })),
        R("path", { d: "M -40 " + H + " q 200 -96 420 -30 q 240 74 480 -20 q 160 -60 300 10 L " + (W + 40) + " " + H + " Z", fill: rgba(theme.surface, 0.85) }),
        R("path", { d: "M -40 " + H + " q 260 -54 520 4 q 220 52 480 -26 L " + (W + 40) + " " + H + " Z", fill: rgba(theme.rule, 0.5) }),
        /* snow */
        Array.from({ length: 20 }).map((_, i) => {
          const ph = (t * (0.26 + (i % 5) * 0.06) + i * 0.09) % 1;
          const x = 24 + i * 56 + Math.sin(t * 1.2 + i) * 48;
          return R("circle", { key: "sn" + i, cx: x, cy: -40 + ph * (H + 80), r: 3 + (i % 4) * 3, fill: rgba(inv ? theme.surface : theme.inkMuted, (inv ? 0.6 : 0.46) * (1 - ph * 0.4)) });
        }));
    },
  });

  /* ── 08 SLOW READER — dusk study: window rays, a pocket watch on a chain ── */
  FilmKit.make({
    global: "SlowReader", brand: "Slow Reader", desk: "#100d09", ambient: 1.3, chrome: false,
    FH: '"Vollkorn", Georgia, serif',
    FB: '"Alegreya Sans", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "drowse", itemPreset: "rise", titleLine: 1.08, titleSpace: "-0.01em",
    /* ladder: bg .04 / surface .09 / rule .16 / inkMuted .42 / ink .86 / accent .52 / accent2 .44 */
    palette: (t) => ({
      bg: t.bg || "#191410", surface: "#241d17", rule: "#3d322a", inkMuted: "#9a8b7c",
      ink: "#f3ece1", accent: t.accent || "#d8a24e", accent2: t.accent2 || "#8fa07a", accentInk: "#171208",
    }),
    tweaks: [
      { k: "bg", label: "Room", options: ["#191410", "#171512", "#1a1310"] },
      { k: "accent", label: "Brass", options: ["#d8a24e", "#c98f6a", "#b9a15a"] },
      { k: "accent2", label: "Second", options: ["#8fa07a", "#7a99a0", "#a08a9f"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(80% 60% at 22% 10%, " + rgba(theme.accent, 0.22) + " 0%, transparent 64%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("circle", { cx: 12, cy: 13, r: 8 }), R2("path", { d: "M12 9v4l3 2M12 5V3" })),
    cams: ["zoomOut", "drop", "pushL", "zoomIn", "pushD", "pushR"], camMul: 5, camOff: 3,
    mag: { rot: 0.3, driftX: 5, driftY: 8, driftZ: 0.05, slide: 0.18, inn: 0.26, zin: 0.28, zout: 0.3 },
    variants: { Typing: "typewriter", Scroll: "feed", Ring: "gauge" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 310, size: 118, kicker: { v: "bare", c: "accent" } },
      statement: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 610, size: 130 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 84, bodySize: 39, ch: 54, lh: 1.58, weight: 400, dim: 0.92, kicker: { v: "bare", c: "accent2" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 94, ch: 25, lh: 1.18, markSize: 230 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 98, swap: "body", card: { v: "glow", bg: "surface", glow: "accent", r: 16, line: "inkMuted" }, chips: { v: "outline", colors: ["accent", "accent2", "ink"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 330, size: 88, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 16, h: 640, labelSize: 42 }, tilts: [-1, 1, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 90, cols: ["accent", "accent2", "ink"], num: 148, glowNums: true },
      cta: { bg: "accent", fg: "accentInk", hi: "surface", world: true, top: 470, size: 110, align: "left", btn: { v: "pill", bg: "accentInk", c: "ink" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — the room at the end of the afternoon. Far: two window light rays
       widening, a wall weave, a bookshelf silhouette. Mid: a pocket watch hangs
       on a chain from the top right and swings a 4s pendulum; the movement
       inside turns, the second hand steps once a second. Near: motes drifting up
       through the rays. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, onAccent = theme.currentBg === theme.accent;
      const tint = onAccent ? theme.accentInk : theme.inkMuted;
      const swing = Math.sin(t * (Math.PI * 2 / 4)) * 5.5;
      const anchorX = W - 78, chain = 1120;
      const sec = Math.floor(t) % 60;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "sr-weave", width: 40, height: 40, patternUnits: "userSpaceOnUse" },
            R("path", { d: "M0 20h40M20 0v40", stroke: rgba(theme.rule, onAccent ? 0.3 : 0.75), strokeWidth: 1.5 })),
          R("linearGradient", { id: "sr-ray", x1: "0%", y1: "0%", x2: "60%", y2: "100%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent, 0.26) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent, 0) }))),
        R("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#sr-weave)" }),
        /* the window the light is coming from */
        R("g", { opacity: 0.55 },
          R("rect", { x: 60, y: -40, width: 430, height: 268, rx: 6, fill: rgba(theme.accent, 0.14), stroke: rgba(tint, 0.5), strokeWidth: 6 }),
          R("line", { x1: 275, y1: -40, x2: 275, y2: 228, stroke: rgba(tint, 0.45), strokeWidth: 5 }),
          R("line", { x1: 60, y1: 110, x2: 490, y2: 110, stroke: rgba(tint, 0.45), strokeWidth: 5 }),
          R("rect", { x: 40, y: 228, width: 470, height: 18, rx: 4, fill: rgba(tint, 0.6) })),
        /* a curtain in the left margin, breathing */
        R("path", { d: "M 0 -20 q " + (34 + Math.sin(t * 0.6) * 12).toFixed(1) + " 300 " + (10 + Math.sin(t * 0.5) * 8).toFixed(1) + " 620 q " + (-24 + Math.cos(t * 0.7) * 10).toFixed(1) + " 320 14 700 L 0 " + H + " Z", fill: rgba(theme.accent2, 0.16), stroke: rgba(tint, 0.22), strokeWidth: 3 }),
        /* window rays */
        R("path", { d: "M -40 0 L 300 0 L 760 " + H + " L -40 " + H + " Z", fill: "url(#sr-ray)", opacity: 0.8 + 0.2 * Math.sin(t * 0.4) }),
        R("path", { d: "M 340 0 L 470 0 L 900 " + H + " L 640 " + H + " Z", fill: "url(#sr-ray)", opacity: 0.5 + 0.2 * Math.cos(t * 0.5) }),
        /* shelf and books, low */
        R("g", { opacity: 0.5 },
          R("line", { x1: 0, y1: H - 210, x2: W, y2: H - 210, stroke: rgba(tint, 0.5), strokeWidth: 6 }),
          [0, 1, 2, 3, 4, 5].map((i) => R("rect", { key: "bk" + i, x: 70 + i * 122 + (i % 3) * 10, y: H - 210 - (86 + (i % 4) * 30), width: 30 + (i % 3) * 12, height: 86 + (i % 4) * 30, rx: 3, fill: rgba(tint, 0.3 + (i % 3) * 0.06) })),
          R("rect", { x: W - 300, y: H - 262, width: 190, height: 52, rx: 5, fill: rgba(theme.accent2, 0.35) })),
        /* the watch on its chain */
        R("g", { transform: "translate(" + anchorX + ",-40) rotate(" + swing.toFixed(2) + ")" },
          Array.from({ length: 16 }).map((_, i) => R("circle", { key: "ch" + i, cx: 0, cy: 60 + i * ((chain - 60) / 16), r: 7, fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 3 })),
          R("g", { transform: "translate(0," + chain + ")" },
            R("circle", { r: 84, fill: rgba(theme.surface, onAccent ? 0.5 : 0.96), stroke: rgba(theme.accent, 0.85), strokeWidth: 7 }),
            R("circle", { r: 66, fill: "none", stroke: rgba(tint, 0.35), strokeWidth: 3 }),
            Array.from({ length: 12 }).map((_, i) => R("line", { key: "mk" + i, x1: Math.cos(i * Math.PI / 6) * 68, y1: Math.sin(i * Math.PI / 6) * 68, x2: Math.cos(i * Math.PI / 6) * 80, y2: Math.sin(i * Math.PI / 6) * 80, stroke: rgba(tint, 0.55), strokeWidth: 4 })),
            R("line", { x1: 0, y1: 0, x2: Math.cos((t * 0.03) * Math.PI * 2 - Math.PI / 2) * 44, y2: Math.sin((t * 0.03) * Math.PI * 2 - Math.PI / 2) * 44, stroke: rgba(tint, 0.9), strokeWidth: 7, strokeLinecap: "round" }),
            R("line", { x1: 0, y1: 0, x2: Math.cos((sec / 60) * Math.PI * 2 - Math.PI / 2) * 72, y2: Math.sin((sec / 60) * Math.PI * 2 - Math.PI / 2) * 72, stroke: rgba(theme.accent2, 0.95), strokeWidth: 4, strokeLinecap: "round" }),
            R("circle", { r: 8, fill: rgba(theme.accent, 0.95) }),
            R("path", { d: "M -18 -104 h 36 l -6 -22 h -24 z", fill: rgba(theme.accent, 0.9) }))),
        /* the desk, and what is on it */
        R("line", { x1: -20, y1: 1420, x2: 720, y2: 1420, stroke: rgba(tint, 0.5), strokeWidth: 7, strokeLinecap: "round" }),
        R("rect", { x: -20, y: 1420, width: 740, height: 22, fill: rgba(tint, 0.28) }),
        /* a cup, with steam that keeps rising */
        R("g", { transform: "translate(258,1420) scale(1.28)" },
          R("path", { d: "M -52 -74 h 104 l -10 74 h -84 z", fill: rgba(theme.surface, onAccent ? 0.5 : 0.92), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("path", { d: "M 52 -60 q 40 6 34 30 q -6 22 -38 20", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("path", { d: "M -52 -74 h 104 l -4 -14 h -96 z", fill: rgba(theme.accent, 0.5) }),
          [0, 1, 2].map((i) => {
            const ph = ((t * 0.42 + i * 0.34) % 1);
            const sw = Math.sin(t * 1.4 + i * 2) * 18;
            return R("path", { key: "sm" + i, d: "M " + (-22 + i * 22) + " -92 q " + sw.toFixed(1) + " -60 " + (sw * 0.4).toFixed(1) + " -120 q " + (-sw).toFixed(1) + " -56 0 -110", fill: "none", stroke: rgba(onAccent ? theme.accentInk : theme.ink, 0.26 * (1 - ph)), strokeWidth: 7, strokeLinecap: "round", transform: "translate(0," + (-ph * 150).toFixed(1) + ") scale(1," + (0.7 + ph * 0.5).toFixed(2) + ")" });
          })),
        /* inkwell, pen, and a candle that flickers */
        R("g", { transform: "translate(500,1420) scale(1.2)" },
          R("path", { d: "M -40 0 h 80 l -8 -62 h -64 z", fill: rgba(theme.ink, 0.85), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("path", { d: "M 10 -62 l 96 -150 l 16 12 l -92 150 z", fill: rgba(theme.accent2, 0.75) }),
          R("path", { d: "M 106 -212 l 16 12 l 8 -26 z", fill: rgba(tint, 0.7) })),
        R("g", { transform: "translate(104,1420) scale(1.2)" },
          R("rect", { x: -22, y: -104, width: 44, height: 104, rx: 5, fill: rgba(theme.surface, onAccent ? 0.5 : 0.9), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
          R("path", { d: "M 0 -104 q " + (Math.sin(t * 6) * 7).toFixed(1) + " -26 0 -46 q " + (-Math.sin(t * 6) * 7).toFixed(1) + " 20 0 46", fill: rgba(theme.accent, 0.85 + 0.15 * Math.sin(t * 9)) }),
          R("circle", { cx: 0, cy: -126, r: 44 + Math.sin(t * 5) * 5, fill: rgba(theme.accent, 0.12) })),
        /* motes */
        [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
          const ph = (t * (0.07 + i * 0.014) + i * 0.12) % 1;
          return R("circle", { key: "mo" + i, cx: 100 + i * 108 + Math.sin(t * 0.5 + i) * 40, cy: H - ph * (H + 120), r: 3 + (i % 3) * 2, fill: rgba(theme.accent, 0.34 * (1 - ph)) });
        }));
    },
  });

  /* ── 09 BOUND VOLUME — a library: shelf perspective, a book turning pages ── */
  FilmKit.make({
    global: "BoundVolume", brand: "Bound Volume", desk: "#171009", ambient: 1.45, chrome: false,
    FH: '"Castoro", Georgia, serif',
    FB: '"Gelasio", Georgia, serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "flip", itemPreset: "rise", titleLine: 1.08, titleSpace: "-0.012em",
    /* ladder: bg .82 / surface .94 / rule .68 / inkMuted .4 / ink .07 / accent .34 / accent2 .5 */
    palette: (t) => ({
      bg: t.bg || "#e8ddca", surface: "#f7f0e2", rule: "#c9b898", inkMuted: "#6b5f4c",
      ink: "#191309", accent: t.accent || "#8c3a32", accent2: t.accent2 || "#b99244", accentInk: "#f7f0e2",
    }),
    tweaks: [
      { k: "bg", label: "Parchment", options: ["#e8ddca", "#ebe2d1", "#e6dcc6"] },
      { k: "accent", label: "Cloth", options: ["#8c3a32", "#3a5c8c", "#3f6b4a"] },
      { k: "accent2", label: "Gilt", options: ["#b99244", "#a88a5c", "#9c7a3a"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(120% 70% at 50% 100%, " + rgba(theme.accent, 0.2) + " 0%, transparent 60%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M4 5v14l8-3 8 3V5l-8 3z" }), R2("path", { d: "M12 8v11" })),
    cams: ["pushU", "zoomIn", "pushR", "zoomOut", "drop", "pushL"], camMul: 7, camOff: 1,
    mag: { rot: 0.35, driftX: 6, driftY: 6, driftZ: 0.05, slide: 0.22, inn: 0.22, zin: 0.34, zout: 0.28 },
    variants: { Typing: "hand", Scroll: "board", Ring: "bar" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 310, size: 112, kicker: { v: "tag", bg: "accent", c: "accentInk" } },
      statement: { bg: "accent", fg: "accentInk", hi: "accent2", world: true, top: 610, size: 124 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 80, bodySize: 39, ch: 54, lh: 1.56, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 90, ch: 25, lh: 1.18, markSize: 220 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 94, swap: "body", card: { v: "paper", bg: "surface", r: 8, line: "inkMuted" }, chips: { v: "square", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: 86, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 8, h: 640, labelSize: 42 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 88, cols: ["accent", "accent2", "ink"], num: 146, rule: true },
      cta: { bg: "ink", fg: "surface", hi: "accent2", world: true, top: 470, size: 106, align: "left", btn: { v: "block", bg: "accent2", c: "ink" }, logoShape: "rounded" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — a reading room. Far: shelf rows converging toward a vanishing
       point with a warm floor pool. Mid: an open volume on the lower deck whose
       pages turn one at a time on a 3.5s cycle, a ribbon bookmark swinging with
       lag, and a library ladder sliding past on parallax. Near: motes. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const hz = H * 0.6, vx = W * 0.5;
      const page = (t % 4.4) / 4.4;
      const flip = E.inOut(Math.min(1, page / 0.58));
      const th = flip * Math.PI;
      const side = Math.cos(th) >= 0 ? 1 : -1;
      const half = 258 * Math.abs(Math.cos(th));
      const lift = Math.sin(th);
      const turn = flip;
      const ribbon = Math.sin(t * 1.3) * 12;
      const ladder = (t * 12) % 700;
      const bx = W * 0.44, by = H - 300;
      return R("g", null,
        R("defs", null,
          R("radialGradient", { id: "bv-pool", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent2, 0.3) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent2, 0) })),
          R("linearGradient", { id: "bv-leaf-front", x1: "0%", y1: "0%", x2: "100%", y2: "0%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.rule, 0.55) }),
            R("stop", { offset: "18%", stopColor: rgba(theme.surface, 0.94) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.surface, 1) })),
          R("linearGradient", { id: "bv-leaf-back", x1: "0%", y1: "0%", x2: "100%", y2: "0%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.surface, 0.99) }),
            R("stop", { offset: "72%", stopColor: rgba(theme.bg, 0.92) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.rule, 0.8) })),
          R("linearGradient", { id: "bv-gutter", x1: "0%", y1: "0%", x2: "100%", y2: "0%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.ink, 0) }),
            R("stop", { offset: "50%", stopColor: rgba(theme.ink, 0.5) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.ink, 0) }))),
        R("ellipse", { cx: vx, cy: H - 190, rx: W * 0.7, ry: 300, fill: "url(#bv-pool)" }),
        /* shelves in perspective */
        R("g", { opacity: 0.42 },
          [-3, -2, -1, 1, 2, 3].map((i) => R("line", { key: "pv" + i, x1: vx + i * 62, y1: hz, x2: vx + i * 460, y2: H, stroke: rgba(tint, 0.5), strokeWidth: 3 })),
          [0.2, 0.42, 0.68, 1].map((f, i) => R("line", { key: "ph" + i, x1: 0, y1: hz + f * (H - hz), x2: W, y2: hz + f * (H - hz), stroke: rgba(tint, 0.45), strokeWidth: 3 })),
          [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => {
            const hgt = 150 + ((i * 43) % 7) * 22;
            return R("rect", { key: "sp" + i, x: 34 + i * 96 + (i % 3) * 6, y: hz - hgt, width: 28 + (i % 4) * 12, height: hgt, rx: 3, fill: rgba(i % 3 === 0 ? theme.accent : (i % 5 === 0 ? theme.accent2 : tint), 0.5 + (i % 3) * 0.08) });
          })),
        /* arched window in the margin, with its light shaft on the floor */
        R("g", null,
          R("path", { d: "M " + (W - 176) + " 900 v -196 a 76 76 0 0 1 152 0 v 196 z", fill: rgba(theme.accent2, 0.16), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("line", { x1: W - 100, y1: 628, x2: W - 100, y2: 900, stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("line", { x1: W - 176, y1: 772, x2: W - 24, y2: 772, stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("rect", { x: W - 192, y: 900, width: 184, height: 16, rx: 4, fill: rgba(tint, 0.55) }),
          R("path", { d: "M " + (W - 176) + " 916 L " + (W - 24) + " 916 L " + (W - 120) + " " + (H - 180) + " L " + (W - 560) + " " + (H - 180) + " Z", fill: rgba(theme.accent2, 0.1) })),
        /* card catalogue, one drawer easing open and shut */
        R("g", { transform: "translate(200," + (H - 300) + ")" },
          R("ellipse", { cx: 0, cy: 128, rx: 150, ry: 18, fill: rgba(theme.ink, 0.18) }),
          R("rect", { x: -120, y: -190, width: 240, height: 310, rx: 8, fill: rgba(theme.surface, inv ? 0.42 : 0.9), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          [0, 1, 2, 3].map((i) => R("rect", { key: "dw" + i, x: -104, y: -172 + i * 74, width: 208, height: 58, rx: 4, fill: "none", stroke: rgba(tint, 0.4), strokeWidth: 3 })),
          R("g", { transform: "translate(0," + (Math.sin(t * 0.5) * 0.5 + 0.5).toFixed(3) * 0 + ")" },
            R("rect", { x: -104, y: -24, width: 208 + (Math.sin(t * 0.5) * 0.5 + 0.5) * 70, height: 58, rx: 4, fill: rgba(theme.accent, 0.35), stroke: rgba(tint, 0.55), strokeWidth: 3 }),
            R("circle", { cx: 0 + (Math.sin(t * 0.5) * 0.5 + 0.5) * 70 + 70, cy: 5, r: 9, fill: rgba(theme.accent2, 0.9) }))),
        /* stacks left on the floor */
        R("g", { opacity: 0.75 },
          [0, 1, 2, 3, 4].map((i) => R("rect", { key: "sk" + i, x: 830 + (i % 2) * 12, y: H - 210 - i * 26, width: 170 - (i % 2) * 20, height: 22, rx: 4, fill: rgba(i % 2 ? theme.accent : theme.surface, inv ? 0.5 : 0.85), stroke: rgba(tint, 0.35), strokeWidth: 2 }))),
        /* pendant lamps in the margin */
        [0, 1].map((i) => R("g", { key: "pl" + i, transform: "translate(" + (W - 80 - i * 96) + "," + (430 + i * 150) + ") rotate(" + (Math.sin(t * 0.7 + i) * 1.6).toFixed(2) + ")" },
          R("line", { x1: 0, y1: -430 - i * 150, x2: 0, y2: 0, stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("path", { d: "M -46 0 h 92 l -22 54 h -48 z", fill: rgba(theme.accent, 0.75) }),
          R("circle", { cx: 0, cy: 62, r: 16 + Math.sin(t * 1.4 + i) * 3, fill: rgba(theme.accent2, 0.75) }),
          R("circle", { cx: 0, cy: 62, r: 60, fill: rgba(theme.accent2, 0.12) }))),
        /* the ladder, parallax */
        R("g", { opacity: 0.4, transform: "translate(" + (W + 200 - ladder).toFixed(1) + ",0)" },
          R("line", { x1: 0, y1: hz - 220, x2: 60, y2: H - 150, stroke: rgba(tint, 0.6), strokeWidth: 7 }),
          R("line", { x1: 120, y1: hz - 220, x2: 180, y2: H - 150, stroke: rgba(tint, 0.6), strokeWidth: 7 }),
          [0, 1, 2, 3, 4].map((i) => R("line", { key: "rg" + i, x1: 14 + i * 12, y1: hz - 150 + i * 120, x2: 134 + i * 12, y2: hz - 150 + i * 120, stroke: rgba(tint, 0.5), strokeWidth: 5 }))),
        /* the open volume */
        R("g", { transform: "translate(" + bx + "," + by + ")" },
          R("ellipse", { cx: 0, cy: 132, rx: 300, ry: 26, fill: rgba(theme.ink, 0.22) }),
          R("path", { d: "M -280 110 L -20 96 L -20 -30 L -280 -6 Z", fill: rgba(theme.surface, inv ? 0.6 : 0.97), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("path", { d: "M 280 110 L 20 96 L 20 -30 L 280 -6 Z", fill: rgba(theme.surface, inv ? 0.6 : 0.97), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          [0, 1, 2, 3].map((i) => R("line", { key: "tl" + i, x1: -250, y1: 20 + i * 24, x2: -60, y2: 12 + i * 24, stroke: rgba(tint, 0.3), strokeWidth: 4 })),
          [0, 1, 2, 3].map((i) => R("line", { key: "tr" + i, x1: 60, y1: 12 + i * 24, x2: 250, y2: 20 + i * 24, stroke: rgba(tint, 0.3), strokeWidth: 4 })),
          /* page-block edges — the thickness either side of the spine */
          [0, 1, 2, 3].map((i) => R("path", { key: "beL" + i, d: "M -276 " + (108 - i * 5) + " q 128 " + (10 - i * 2) + " 252 " + (-6 - i * 3), fill: "none", stroke: rgba(tint, 0.22 - i * 0.03), strokeWidth: 2.5 })),
          [0, 1, 2, 3].map((i) => R("path", { key: "beR" + i, d: "M 276 " + (108 - i * 5) + " q -128 " + (10 - i * 2) + " -252 " + (-6 - i * 3), fill: "none", stroke: rgba(tint, 0.22 - i * 0.03), strokeWidth: 2.5 })),
          /* two leaves already turned, resting near the spine */
          [0, 1].map((i) => R("path", { key: "pv" + i, d: "M -14 -28 C " + (-70 - i * 26) + " " + (-34 - i * 8) + " " + (-104 - i * 30) + " 30 " + (-58 - i * 22) + " 94 L -14 94 Z", fill: rgba(theme.surface, inv ? 0.5 : 0.9), stroke: rgba(tint, 0.22), strokeWidth: 2 })),
          /* the shadow the lifted leaf throws on the page below */
          lift > 0.02 && R("path", { d: "M 16 -26 C " + (-side * half * 0.5) + " " + (-16 - lift * 40) + " " + (-side * half * 0.85) + " " + (40 + lift * 30) + " " + (-side * half * 0.62) + " 96 L 16 96 Z", fill: rgba(theme.ink, 0.16 * lift) }),
          /* the leaf, bowed, with a lit face and a shaded back */
          R("g", { opacity: 0.35 + 0.65 * Math.min(1, lift * 3 + (page > 0.6 ? 1 : 0)) },
            R("path", {
              d: "M 0 -30 C " + (side * half * 0.5).toFixed(1) + " " + (-32 - lift * 120).toFixed(1) + " " + (side * half * 0.92).toFixed(1) + " " + (-16 - lift * 78).toFixed(1) + " " + (side * half).toFixed(1) + " " + (-26 + lift * 8).toFixed(1) +
                 " L " + (side * half).toFixed(1) + " " + (96 + lift * 6).toFixed(1) +
                 " C " + (side * half * 0.92).toFixed(1) + " " + (112 + lift * 62).toFixed(1) + " " + (side * half * 0.5).toFixed(1) + " " + (104 + lift * 104).toFixed(1) + " 0 96 Z",
              fill: side > 0 ? "url(#bv-leaf-front)" : "url(#bv-leaf-back)",
              stroke: rgba(tint, 0.4), strokeWidth: 2.5,
            }),
            R("path", { d: "M 0 -30 C " + (side * half * 0.5).toFixed(1) + " " + (-32 - lift * 120).toFixed(1) + " " + (side * half * 0.92).toFixed(1) + " " + (-16 - lift * 78).toFixed(1) + " " + (side * half).toFixed(1) + " " + (-26 + lift * 8).toFixed(1), fill: "none", stroke: rgba(theme.surface, 0.9 * lift), strokeWidth: 3 })),
          /* the gutter darkens as the leaf lifts */
          R("rect", { x: -26, y: -30, width: 52, height: 126, fill: "url(#bv-gutter)", opacity: 0.35 + 0.5 * lift }),
          R("path", { d: "M -20 -30 L 20 -30 L 20 96 L -20 96 Z", fill: rgba(theme.rule, 0.5) }),
          /* ribbon bookmark, swinging */
          R("g", { transform: "rotate(" + ribbon.toFixed(2) + " 0 -20)" },
            R("path", { d: "M -12 -20 h 24 v 210 l -12 -30 l -12 30 z", fill: rgba(theme.accent, 0.9) }))),
        /* the desk, and what is on it */
        R("line", { x1: -20, y1: 1420, x2: 720, y2: 1420, stroke: rgba(tint, 0.5), strokeWidth: 7, strokeLinecap: "round" }),
        R("rect", { x: -20, y: 1420, width: 740, height: 22, fill: rgba(tint, 0.28) }),
        /* a cup, with steam that keeps rising */
        R("g", { transform: "translate(258,1420) scale(1.28)" },
          R("path", { d: "M -52 -74 h 104 l -10 74 h -84 z", fill: rgba(theme.surface, onAccent ? 0.5 : 0.92), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("path", { d: "M 52 -60 q 40 6 34 30 q -6 22 -38 20", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("path", { d: "M -52 -74 h 104 l -4 -14 h -96 z", fill: rgba(theme.accent, 0.5) }),
          [0, 1, 2].map((i) => {
            const ph = ((t * 0.42 + i * 0.34) % 1);
            const sw = Math.sin(t * 1.4 + i * 2) * 18;
            return R("path", { key: "sm" + i, d: "M " + (-22 + i * 22) + " -92 q " + sw.toFixed(1) + " -60 " + (sw * 0.4).toFixed(1) + " -120 q " + (-sw).toFixed(1) + " -56 0 -110", fill: "none", stroke: rgba(onAccent ? theme.accentInk : theme.ink, 0.26 * (1 - ph)), strokeWidth: 7, strokeLinecap: "round", transform: "translate(0," + (-ph * 150).toFixed(1) + ") scale(1," + (0.7 + ph * 0.5).toFixed(2) + ")" });
          })),
        /* inkwell, pen, and a candle that flickers */
        R("g", { transform: "translate(500,1420) scale(1.2)" },
          R("path", { d: "M -40 0 h 80 l -8 -62 h -64 z", fill: rgba(theme.ink, 0.85), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("path", { d: "M 10 -62 l 96 -150 l 16 12 l -92 150 z", fill: rgba(theme.accent2, 0.75) }),
          R("path", { d: "M 106 -212 l 16 12 l 8 -26 z", fill: rgba(tint, 0.7) })),
        R("g", { transform: "translate(104,1420) scale(1.2)" },
          R("rect", { x: -22, y: -104, width: 44, height: 104, rx: 5, fill: rgba(theme.surface, onAccent ? 0.5 : 0.9), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
          R("path", { d: "M 0 -104 q " + (Math.sin(t * 6) * 7).toFixed(1) + " -26 0 -46 q " + (-Math.sin(t * 6) * 7).toFixed(1) + " 20 0 46", fill: rgba(theme.accent, 0.85 + 0.15 * Math.sin(t * 9)) }),
          R("circle", { cx: 0, cy: -126, r: 44 + Math.sin(t * 5) * 5, fill: rgba(theme.accent, 0.12) })),
        /* motes */
        [0, 1, 2, 3, 4, 5, 6].map((i) => {
          const ph = (t * (0.08 + i * 0.016) + i * 0.15) % 1;
          return R("circle", { key: "mo" + i, cx: 90 + i * 148 + Math.sin(t * 0.5 + i) * 36, cy: H - ph * (H + 140), r: 3 + (i % 3) * 2, fill: rgba(theme.accent2, 0.34 * (1 - ph)) });
        }));
    },
  });

  /* ── 10 LOOSE LEAF — open air: hedge, bench, a sheet spiralling down ── */
  FilmKit.make({
    global: "LooseLeaf", brand: "Loose Leaf", desk: "#12160f", ambient: 1.55, chrome: false,
    FH: '"Young Serif", Georgia, serif',
    FB: '"Figtree", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "rise", itemPreset: "pop", titleLine: 1.04, titleSpace: "-0.02em",
    /* ladder: bg .9 / surface .97 / rule .76 / inkMuted .44 / ink .07 / accent .42 / accent2 .56 */
    palette: (t) => ({
      bg: t.bg || "#eef0e6", surface: "#fbfcf7", rule: "#ccd2be", inkMuted: "#6d7360",
      ink: "#151810", accent: t.accent || "#4f7a45", accent2: t.accent2 || "#e0995c", accentInk: "#fbfcf7",
    }),
    tweaks: [
      { k: "bg", label: "Air", options: ["#eef0e6", "#f0f1ea", "#ecefe4"] },
      { k: "accent", label: "Leaf", options: ["#4f7a45", "#3f6e78", "#6b5f8c"] },
      { k: "accent2", label: "Second", options: ["#e0995c", "#d97b6c", "#c9a94e"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(182deg, " + rgba(theme.surface, 0.95) + " 0%, " + bg + " 46%, " + rgba(theme.accent, 0.16) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M5 20c0-9 5-15 14-16 1 10-4 16-14 16z" }), R2("path", { d: "M9 16l8-8" })),
    cams: ["drop", "pushL", "hopU", "zoomIn", "pushR", "zoomOut"], camMul: 3, camOff: 4,
    mag: { rot: 0.6, driftX: 8, driftY: 8, driftZ: 0.04, slide: 0.24, inn: 0.2, zin: 0.34, zout: 0.3 },
    variants: { Typing: "caret", Scroll: "feed", Ring: "ring" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 310, size: 104, kicker: { v: "pill", bg: "accent", c: "accentInk" } },
      statement: { bg: "ink", fg: "surface", hi: "accent2", world: true, top: 610, size: 118 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 76, bodySize: 39, ch: 54, lh: 1.54, weight: 450, dim: 0.9, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 86, ch: 25, lh: 1.16, markSize: 210 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 90, swap: "quote", card: { v: "tilt", bg: "surface", r: 18, line: "inkMuted" }, chips: { v: "pill", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: 82, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 18, h: 640, labelSize: 42 }, tilts: [-1.5, 1.5, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 390, size: 84, cols: ["accent", "accent2", "ink"], num: 146 },
      cta: { bg: "accent", fg: "accentInk", hi: "surface", world: true, top: 470, size: 100, align: "left", btn: { v: "pill", bg: "accentInk", c: "surface" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — a sheet of paper on its way down. Far: a soft sky wash and two
       hedge lines on parallax. Mid: a bench on the lower deck, and the sheet
       spiralling on a 9s descent — it rotates about both axes, so its width
       breathes as it turns edge-on, and its shadow tracks it along the ground.
       Near: three leaves tumbling faster on their own spirals. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const cyc = (t % 9) / 9;
      const sx = W * 0.66 + Math.sin(cyc * Math.PI * 4) * 210;
      const sy = 700 + cyc * (H - 1050);
      const spin = cyc * 720, edge = 0.35 + 0.65 * Math.abs(Math.cos(cyc * Math.PI * 4));
      const hedge1 = (t * 8) % 320, hedge2 = (t * 17) % 220;
      const deck = H - 250;
      return R("g", null,
        R("defs", null,
          R("radialGradient", { id: "ll-sun", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent2, 0.28) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent2, 0) })),
          R("pattern", { id: "ll-air", width: 120, height: 120, patternUnits: "userSpaceOnUse", patternTransform: "translate(" + ((t * 5) % 120).toFixed(1) + ",0)" },
            R("circle", { cx: 60, cy: 60, r: 2.5, fill: rgba(theme.accent, inv ? 0.3 : 0.18) }))),
        R("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#ll-air)" }),
        R("circle", { cx: W * 0.2, cy: 300, r: 400, fill: "url(#ll-sun)" }),
        /* canopy hanging into the top band, above the kicker */
        R("g", { transform: "translate(0," + (Math.sin(t * 0.6) * 5).toFixed(2) + ")" },
          R("path", { d: "M -40 40 q 220 60 380 -10 q 150 -66 300 10", fill: "none", stroke: rgba(theme.accent, 0.5), strokeWidth: 10, strokeLinecap: "round" }),
          [0, 1, 2, 3, 4, 5].map((i) => {
            const lx = 60 + i * 118, ly = 60 + Math.sin(i * 1.3) * 26 + Math.sin(t * 1.1 + i) * 6;
            return R("path", { key: "cl" + i, d: "M 0 0 q 32 -26 56 6 q -28 30 -56 -6 z", fill: rgba(theme.accent, 0.34 + (i % 3) * 0.08), transform: "translate(" + lx + "," + ly.toFixed(1) + ") rotate(" + (40 + i * 24 + Math.sin(t + i) * 6).toFixed(1) + ")" });
          })),
        /* a trellis in the right margin, with a vine climbing it */
        R("g", { opacity: 0.62, transform: "translate(" + (W - 108) + "," + (deck - 40) + ")" },
          R("line", { x1: -34, y1: 0, x2: -34, y2: -520, stroke: rgba(tint, 0.55), strokeWidth: 7 }),
          R("line", { x1: 46, y1: 0, x2: 46, y2: -520, stroke: rgba(tint, 0.55), strokeWidth: 7 }),
          [0, 1, 2, 3].map((i) => R("line", { key: "tr" + i, x1: -34, y1: -80 - i * 140, x2: 46, y2: -80 - i * 140, stroke: rgba(tint, 0.4), strokeWidth: 5 })),
          R("path", { d: "M 6 0 q -50 -120 6 -240 q 56 -120 -6 -300", fill: "none", stroke: rgba(theme.accent, 0.75), strokeWidth: 6, strokeLinecap: "round" }),
          [0, 1, 2, 3].map((i) => R("path", { key: "vl" + i, d: "M 0 0 q 26 -20 44 4 q -22 24 -44 -4 z", fill: rgba(theme.accent, 0.6), transform: "translate(" + (i % 2 ? 14 : -18) + "," + (-70 - i * 130) + ") rotate(" + (i % 2 ? 20 : 200) + ")" }))),
        /* hedges */
        R("path", { d: "M " + (-hedge1) + " " + (deck - 150) + " q 120 -110 260 -30 q 130 76 260 -20 q 130 -96 260 -6 q 130 90 260 -10 L " + (W + 400) + " " + H + " L " + (-hedge1) + " " + H + " Z", fill: rgba(theme.accent, 0.28) }),
        R("path", { d: "M " + (-hedge2) + " " + (deck - 40) + " q 110 -90 240 -20 q 120 66 240 -14 q 120 -80 240 -4 q 120 74 240 -8 L " + (W + 360) + " " + H + " L " + (-hedge2) + " " + H + " Z", fill: rgba(theme.accent, 0.42) }),
        R("line", { x1: 0, y1: deck + 40, x2: W, y2: deck + 40, stroke: rgba(tint, 0.4), strokeWidth: 4 }),
        /* a pair of birds working the right margin */
        [0, 1].map((i) => {
          const bc = ((t / (11 + i * 3)) % 1);
          const bxp = W - 40 - bc * 240, byp = 560 + i * 120 + Math.sin(bc * Math.PI * 4 + i) * 90;
          const flap = Math.sin(t * 7 + i * 2) * 0.7;
          return R("path", { key: "bd" + i, d: "M -26 0 q 13 " + (-18 - flap * 16).toFixed(1) + " 26 0 q 13 " + (-18 + flap * 16).toFixed(1) + " 26 0", fill: "none", stroke: rgba(theme.inkMuted, 0.5), strokeWidth: 4, strokeLinecap: "round", transform: "translate(" + bxp.toFixed(1) + "," + byp.toFixed(1) + ") scale(0.8)" });
        }),
        /* grass along the deck, on a wind wave */
        R("g", null,
          Array.from({ length: 26 }).map((_, i) => {
            const gx = 24 + i * 42 + (i % 3) * 9;
            const hgt = 34 + ((i * 37) % 11) * 6;
            const lean = Math.sin(t * 1.5 + i * 0.7) * (10 + (i % 4) * 4);
            return R("path", { key: "gs" + i, d: "M " + gx + " " + (deck + 50) + " q " + (lean * 0.5).toFixed(1) + " " + (-hgt * 0.5).toFixed(1) + " " + lean.toFixed(1) + " " + (-hgt).toFixed(1), fill: "none", stroke: rgba(theme.accent, 0.3 + (i % 4) * 0.09), strokeWidth: 3, strokeLinecap: "round" });
          })),
        /* the bench */
        R("g", { opacity: 0.6, transform: "translate(" + (W * 0.24) + "," + (deck + 30) + ")" },
          R("rect", { x: -170, y: -70, width: 340, height: 18, rx: 5, fill: rgba(tint, 0.7) }),
          R("rect", { x: -170, y: -104, width: 340, height: 16, rx: 5, fill: rgba(tint, 0.55) }),
          R("path", { d: "M -140 -52 v 52 M 140 -52 v 52 M -140 -30 h 280", stroke: rgba(tint, 0.6), strokeWidth: 7, strokeLinecap: "round" }),
          /* two books and a watering can left on the bench */
          R("rect", { x: 24, y: -128, width: 96, height: 16, rx: 3, fill: rgba(theme.accent2, 0.8) }),
          R("rect", { x: 30, y: -144, width: 84, height: 16, rx: 3, fill: rgba(theme.accent, 0.7) }),
          R("g", { transform: "translate(-104,-104)" },
            R("path", { d: "M -30 0 h 60 l -6 -52 h -48 z", fill: rgba(tint, 0.7) }),
            R("path", { d: "M 24 -44 q 34 -6 30 -34", fill: "none", stroke: rgba(tint, 0.7), strokeWidth: 6, strokeLinecap: "round" }),
            R("path", { d: "M -28 -34 l -34 -16 l 4 -10 l 34 12 z", fill: rgba(tint, 0.6) }))),
        /* the sheet, spiralling */
        R("ellipse", { cx: sx, cy: deck + 46, rx: 90 * (0.4 + 0.6 * cyc), ry: 12, fill: rgba(theme.ink, 0.16) }),
        R("g", { transform: "translate(" + sx.toFixed(1) + "," + sy.toFixed(1) + ") rotate(" + spin.toFixed(1) + ") scale(" + edge.toFixed(3) + ",1)" },
          R("path", { d: "M -86 -112 h 172 v 224 h -172 z", fill: rgba(theme.surface, inv ? 0.85 : 0.98), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          [0, 1, 2, 3, 4].map((i) => R("line", { key: "tx" + i, x1: -62, y1: -74 + i * 40, x2: 62 - (i % 2) * 30, y2: -74 + i * 40, stroke: rgba(tint, 0.35), strokeWidth: 5 }))),
        /* dandelion seeds on the near plane */
        [0, 1, 2, 3].map((i) => {
          const ph = (t * (0.16 + i * 0.04) + i * 0.29) % 1;
          const sxp = 120 + i * 250 + Math.sin(t * 1.4 + i) * 70, syp = H - ph * (H + 160);
          return R("g", { key: "sd" + i, opacity: 0.6 * (1 - ph), transform: "translate(" + sxp.toFixed(1) + "," + syp.toFixed(1) + ") rotate(" + (ph * 400).toFixed(1) + ")" },
            R("path", { d: "M 0 0 v 22", stroke: rgba(tint, 0.7), strokeWidth: 2.5 }),
            R("path", { d: "M -14 -8 L 0 0 L 14 -8 M -8 -16 L 0 0 L 8 -16", stroke: rgba(tint, 0.55), strokeWidth: 2.5, strokeLinecap: "round", fill: "none" }));
        }),
        /* leaves on their own spirals */
        [0, 1, 2, 3, 4, 5].map((i) => {
          const lc = ((t / (5 + i * 1.1)) % 1);
          const lx = 110 + i * 178 + Math.sin(lc * Math.PI * 6 + i) * 120;
          const ly = -60 + lc * (H + 120);
          return R("path", { key: "lf" + i, d: "M 0 0 q 26 -22 46 4 q -22 26 -46 -4 z", fill: rgba(i % 2 ? theme.accent2 : theme.accent, 0.55), transform: "translate(" + lx.toFixed(1) + "," + ly.toFixed(1) + ") rotate(" + (lc * 900 + i * 60).toFixed(1) + ")" });
        }));
    },
  });
})();
