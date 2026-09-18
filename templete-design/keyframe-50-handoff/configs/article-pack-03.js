/* article-pack-03.js — cohort 03, news / journalism: packs 11-15.
   Wire Copy · Front Column · Press Run · Byline Rule · Copy Desk
   Same contract as cohorts 01-02: hexes only in palette(), look and World name
   slots, chrome:false, three depth planes, an object that travels a route with
   secondary motion, nothing crossing the text column, tone-aware tints.
   Constraints from kit/PATCH-article-beats.md: no ticker/stack for list beats,
   app.line >= 3:1 from app.cardBg, unique (Scroll, Typing, Ring) triple. */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ── 11 WIRE COPY — night newsroom: blinds, desk row, a teleprinter paying
     out tape ── */
  FilmKit.make({
    global: "WireCopy", brand: "Wire Copy", desk: "#171512", ambient: 1.7, chrome: false,
    FH: '"Zilla Slab", Georgia, serif',
    FB: '"Source Sans 3", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "machete", itemPreset: "rise", titleLine: 1.05, titleSpace: "-0.015em",
    /* ladder: bg .86 / surface .95 / rule .72 / inkMuted .43 / ink .07 / accent .38 / accent2 .3 */
    palette: (t) => ({
      bg: t.bg || "#eae5da", surface: "#f8f5ee", rule: "#c9c1b1", inkMuted: "#6e685c",
      ink: "#16150f", accent: t.accent || "#b4302b", accent2: t.accent2 || "#3f5a6b", accentInk: "#f8f5ee",
    }),
    tweaks: [
      { k: "bg", label: "Newsprint", options: ["#eae5da", "#ece8de", "#e7e4d8"] },
      { k: "accent", label: "Signal", options: ["#b4302b", "#1f5f8c", "#7a3f8c"] },
      { k: "accent2", label: "Second", options: ["#3f5a6b", "#6b5a3f", "#3f6b52"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(178deg, " + rgba(theme.surface, 0.9) + " 0%, " + bg + " 44%, " + rgba(theme.rule, 0.5) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M4 7h16v7H4zM7 14v6h10v-6" }), R2("path", { d: "M8 17h8" })),
    cams: ["pushL", "pushU", "pushR", "drop", "zoomIn", "pushD"], camMul: 5, camOff: 2,
    mag: { rot: 0.15, driftX: 6, driftY: 5, driftZ: 0.03, slide: 0.22, inn: 0.16, zin: 0.3, zout: 0.24 },
    variants: { Scroll: "board", Typing: "terminal", Ring: "bar" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 108, kicker: { v: "tag", bg: "accent", c: "accentInk" } },
      statement: { bg: "ink", fg: "surface", hi: "accent", world: true, top: 610, size: 120 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 74, bodySize: 38, ch: 54, lh: 1.52, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 84, ch: 25, lh: 1.16, markSize: 210, rule: true },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 88, swap: "body", card: { v: "paper", bg: "surface", r: 6, line: "inkMuted" }, chips: { v: "square", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 330, size: 82, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 6, h: 640, labelSize: 40 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 84, cols: ["accent", "accent2", "ink"], num: 146, rule: true },
      cta: { bg: "accent", fg: "accentInk", hi: "ink", world: true, top: 470, size: 102, align: "left", btn: { v: "block", bg: "ink", c: "accentInk" }, logoShape: "rounded" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — the wire room after midnight. Far: window blinds and a row of wall
       clocks, each on its own time. Mid: a teleprinter on the deck whose spool
       turns and pays out a tape that snakes away and grows; paper spikes and
       trays beside it. Near: torn tape scraps rising. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const rule = inv ? theme.surface : theme.rule;
      const deck = H - 300;
      const feed = (t * 46) % 520;
      const spool = (t * 150) % 360;
      const tape = 0.2 + 0.8 * ((t % 9) / 9);
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "wc-blind", width: 12, height: 46, patternUnits: "userSpaceOnUse" },
            R("rect", { x: 0, y: 0, width: 12, height: 30, fill: rgba(rule, inv ? 0.1 : 0.4) })),
          R("radialGradient", { id: "wc-glow", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent, 0.18) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent, 0) }))),
        /* the city through the window, behind the blinds */
        R("g", { opacity: 0.4 },
          [0, 1, 2, 3, 4, 5, 6].map((i) => {
            const bh = 90 + ((i * 53) % 5) * 34;
            return R("rect", { key: "ct" + i, x: 30 + i * 150, y: 250 - bh, width: 96, height: bh, fill: rgba(theme.accent2, 0.55) });
          }),
          [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => R("rect", { key: "wn" + i, x: 54 + i * 118, y: 190 - (i % 3) * 34, width: 16, height: 20, fill: rgba(theme.accent2, Math.sin(t * 0.7 + i * 2) > 0.4 ? 0.9 : 0.3) }))),
        R("rect", { x: 0, y: 0, width: W, height: 250, fill: "url(#wc-blind)" }),
        R("rect", { x: 0, y: 244, width: W, height: 14, fill: rgba(tint, 0.5) }),
        /* ceiling fan, turning */
        R("g", { transform: "translate(" + (W - 250) + ",300)" },
          R("line", { x1: 0, y1: -50, x2: 0, y2: 0, stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("g", { transform: "rotate(" + ((t * 190) % 360).toFixed(1) + ")" },
            [0, 1, 2].map((i) => R("ellipse", { key: "fb" + i, cx: Math.cos(i * 2.094) * 66, cy: Math.sin(i * 2.094) * 66 * 0.32, rx: 60, ry: 13, fill: rgba(tint, 0.4), transform: "rotate(" + (i * 120) + ")" }))),
          R("circle", { r: 14, fill: rgba(tint, 0.6) })),
        R("circle", { cx: W * 0.8, cy: 360, r: 380, fill: "url(#wc-glow)" }),
        /* wall clocks, each running its own hour */
        [0, 1, 2].map((i) => R("g", { key: "cl" + i, transform: "translate(" + (W - 240 + i * 96) + ",180)", opacity: 0.6 },
          R("circle", { r: 40, fill: "none", stroke: rgba(tint, 0.6), strokeWidth: 5 }),
          R("line", { x1: 0, y1: 0, x2: Math.cos(t * 0.1 + i * 2) * 22, y2: Math.sin(t * 0.1 + i * 2) * 22, stroke: rgba(tint, 0.7), strokeWidth: 4, strokeLinecap: "round" }),
          R("line", { x1: 0, y1: 0, x2: Math.cos(t * 1.05 + i) * 32, y2: Math.sin(t * 1.05 + i) * 32, stroke: rgba(theme.accent, 0.8), strokeWidth: 3, strokeLinecap: "round" }))),
        /* strip light overhead */
        R("g", { opacity: 0.6 },
          R("line", { x1: 180, y1: 250, x2: 180, y2: 296, stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("line", { x1: 780, y1: 250, x2: 780, y2: 296, stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("rect", { x: 140, y: 296, width: 680, height: 34, rx: 8, fill: rgba(theme.surface, inv ? 0.3 : 0.9), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("rect", { x: 160, y: 330, width: 640, height: 10, fill: rgba(theme.accent2, 0.3) })),
        /* pinboard of clippings in the margin */
        R("g", { transform: "translate(" + (W - 118) + ",1190)" },
          R("rect", { x: -112, y: -220, width: 224, height: 440, rx: 6, fill: rgba(theme.accent2, 0.12), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2, 3].map((i) => {
            const lift = Math.sin(t * 1.1 + i * 1.7) * 3;
            return R("g", { key: "cp" + i, transform: "translate(" + (-58 + (i % 2) * 116) + "," + (-146 + Math.floor(i / 2) * 190) + ") rotate(" + (lift + (i % 2 ? 3 : -3)).toFixed(2) + ")" },
              R("rect", { x: -52, y: -60, width: 104, height: 130, rx: 3, fill: rgba(theme.surface, inv ? 0.5 : 0.95), stroke: rgba(tint, 0.3), strokeWidth: 2 }),
              R("rect", { x: -36, y: -40, width: 72, height: 10, rx: 4, fill: rgba(theme.accent, 0.7) }),
              [0, 1, 2].map((j) => R("line", { key: "cl" + j, x1: -36, y1: -14 + j * 18, x2: 36 - (j % 2) * 20, y2: -14 + j * 18, stroke: rgba(tint, 0.35), strokeWidth: 4 })),
              R("circle", { cx: 0, cy: -60, r: 6, fill: rgba(theme.accent, 0.9) }));
          })),
        /* desk row on parallax */
        R("g", { opacity: 0.4, transform: "translate(" + (-feed * 0.3).toFixed(1) + ",0)" },
          [0, 1, 2, 3].map((i) => R("rect", { key: "dk" + i, x: 60 + i * 340, y: deck - 250, width: 250, height: 14, rx: 4, fill: rgba(tint, 0.6) })),
          [0, 1, 2, 3].map((i) => R("rect", { key: "mn" + i, x: 130 + i * 340, y: deck - 340, width: 110, height: 84, rx: 6, fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 5 }))),
        /* a second printer on the back row, and a chair */
        R("g", { opacity: 0.42, transform: "translate(" + (150 - feed * 0.18).toFixed(1) + "," + (deck - 210) + ") scale(0.62)" },
          R("path", { d: "M -150 0 h 300 l -18 -140 h -264 z", fill: rgba(theme.ink, 0.8) }),
          R("rect", { x: -110, y: -186, width: 220, height: 48, rx: 6, fill: rgba(theme.surface, inv ? 0.4 : 0.85) }),
          R("circle", { cx: 110, cy: -86, r: 40, fill: "none", stroke: rgba(theme.surface, 0.6), strokeWidth: 11 })),
        R("g", { opacity: 0.5, transform: "translate(" + (760 - feed * 0.3).toFixed(1) + "," + (deck - 40) + ")" },
          R("path", { d: "M -60 0 h 120 v -18 h -120 z", fill: rgba(tint, 0.6) }),
          R("path", { d: "M 44 -18 v -120 q 0 -22 -26 -22 h -30", fill: "none", stroke: rgba(tint, 0.55), strokeWidth: 9 }),
          R("path", { d: "M -30 0 l -20 40 M 30 0 l 20 40", stroke: rgba(tint, 0.5), strokeWidth: 7, strokeLinecap: "round" })),
        /* the deck */
        R("line", { x1: 0, y1: deck, x2: W, y2: deck, stroke: rgba(tint, 0.55), strokeWidth: 7 }),
        R("rect", { x: 0, y: deck, width: W, height: 22, fill: rgba(tint, 0.24) }),
        /* the tape it has paid out, snaking away */
        R("path", { d: "M 300 " + (deck - 40) + " q -90 70 -170 20 q -80 -50 -110 40", fill: "none", stroke: rgba(theme.surface, inv ? 0.5 : 0.95), strokeWidth: 16, strokeLinecap: "round", strokeDasharray: "1400", strokeDashoffset: (1400 * (1 - tape)).toFixed(0) }),
        R("path", { d: "M 300 " + (deck - 40) + " q -90 70 -170 20 q -80 -50 -110 40", fill: "none", stroke: rgba(tint, 0.35), strokeWidth: 2, strokeDasharray: "1400", strokeDashoffset: (1400 * (1 - tape)).toFixed(0) }),
        /* the teleprinter */
        R("g", { transform: "translate(380," + deck + ")" },
          R("ellipse", { cx: 0, cy: 10, rx: 190, ry: 16, fill: rgba(theme.ink, 0.2) }),
          R("path", { d: "M -160 0 h 320 l -20 -150 h -280 z", fill: rgba(theme.ink, 0.9) }),
          R("path", { d: "M -160 0 h 320 l -6 -44 h -308 z", fill: rgba(theme.surface, 0.16) }),
          R("rect", { x: -120, y: -196 - 6, width: 240, height: 54, rx: 6, fill: rgba(theme.surface, inv ? 0.4 : 0.92), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          [0, 1, 2, 3].map((i) => R("rect", { key: "ln" + i, x: -100 + i * 58, y: -180, width: 38, height: 8, rx: 4, fill: rgba(theme.accent, 0.7 - i * 0.12) })),
          R("g", { transform: "translate(120,-90) rotate(" + spool.toFixed(1) + ")" },
            R("circle", { r: 46, fill: "none", stroke: rgba(theme.surface, 0.7), strokeWidth: 12 }),
            R("path", { d: "M -46 0 h 92 M 0 -46 v 92", stroke: rgba(theme.accent, 0.6), strokeWidth: 5 })),
          R("rect", { x: -190, y: -60, width: 60, height: 60, rx: 4, fill: rgba(theme.accent2, 0.6) })),
        /* a cup, still going */
        R("g", { transform: "translate(660," + deck + ")" },
          R("path", { d: "M -40 -56 h 80 l -8 56 h -64 z", fill: rgba(theme.surface, inv ? 0.45 : 0.94), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("path", { d: "M 40 -44 q 30 4 26 22 q -4 17 -28 15", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2].map((i) => {
            const ph = ((t * 0.5 + i * 0.34) % 1);
            const sw = Math.sin(t * 1.5 + i * 2) * 14;
            return R("path", { key: "cs" + i, d: "M " + (-16 + i * 16) + " -70 q " + sw.toFixed(1) + " -46 " + (sw * 0.4).toFixed(1) + " -92", fill: "none", stroke: rgba(inv ? theme.surface : theme.ink, 0.3 * (1 - ph)), strokeWidth: 7, strokeLinecap: "round", transform: "translate(0," + (-ph * 120).toFixed(1) + ")" });
          })),
        /* in-trays stacked on the deck */
        R("g", { transform: "translate(870," + deck + ")" },
          [0, 1, 2].map((i) => R("g", { key: "it" + i },
            R("rect", { x: -76, y: -34 - i * 40, width: 152, height: 26, rx: 3, fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 4 }),
            R("rect", { x: -64, y: -46 - i * 40, width: 128 - i * 14, height: 14, rx: 2, fill: rgba(theme.surface, inv ? 0.4 : 0.9) })))),
        /* spike file and tray */
        R("g", { transform: "translate(" + (W - 150) + "," + deck + ")" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: -130, stroke: rgba(tint, 0.7), strokeWidth: 6 }),
          [0, 1, 2].map((i) => R("path", { key: "sp" + i, d: "M -60 " + (-30 - i * 26) + " h 120 l -10 18 h -100 z", fill: rgba(theme.surface, inv ? 0.4 : 0.9), stroke: rgba(tint, 0.35), strokeWidth: 2 })),
          R("circle", { cx: 0, cy: -134, r: 8, fill: rgba(theme.accent, 0.8) })),
        /* near plane */
        [0, 1, 2, 3, 4].map((i) => {
          const ph = (t * (0.2 + i * 0.04) + i * 0.21) % 1;
          const x = 120 + i * 210 + Math.sin(t * 1.1 + i) * 40, y = H - ph * (H + 180);
          return R("rect", { key: "tp" + i, x: x, y: y, width: 26, height: 8, rx: 4, fill: rgba(tint, 0.3 * (1 - ph)), transform: "rotate(" + (ph * 320 + i * 40).toFixed(1) + " " + x.toFixed(1) + " " + y.toFixed(1) + ")" });
        }));
    },
  });

  /* ── 12 FRONT COLUMN — dawn street: railings, lamps, a delivery bicycle ── */
  FilmKit.make({
    global: "FrontColumn", brand: "Front Column", desk: "#0f1418", ambient: 1.6, chrome: false,
    FH: '"Bitter", Georgia, serif',
    FB: '"Asap", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "rise", itemPreset: "pop", titleLine: 1.06, titleSpace: "-0.01em",
    /* ladder: bg .88 / surface .96 / rule .74 / inkMuted .44 / ink .07 / accent .34 / accent2 .52 */
    palette: (t) => ({
      bg: t.bg || "#e9edf0", surface: "#f9fbfc", rule: "#c4ccd2", inkMuted: "#69727a",
      ink: "#141719", accent: t.accent || "#26456e", accent2: t.accent2 || "#e0a13c", accentInk: "#f9fbfc",
    }),
    tweaks: [
      { k: "bg", label: "Dawn", options: ["#e9edf0", "#ebeef1", "#e7ecef"] },
      { k: "accent", label: "Masthead", options: ["#26456e", "#2f5e4a", "#5e2f4a"] },
      { k: "accent2", label: "Lamplight", options: ["#e0a13c", "#d97a4f", "#c9c04f"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(180deg, " + rgba(theme.accent2, 0.18) + " 0%, " + rgba(theme.surface, 0.9) + " 26%, " + bg + " 60%, " + rgba(theme.rule, 0.5) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("circle", { cx: 6, cy: 17, r: 3.5 }), R2("circle", { cx: 18, cy: 17, r: 3.5 }), R2("path", { d: "M6 17l5-9h5l2 9M9 8h5" })),
    cams: ["pushR", "zoomIn", "pushL", "hopU", "zoomOut", "drop"], camMul: 3, camOff: 1,
    mag: { rot: 0.4, driftX: 9, driftY: 6, driftZ: 0.04, slide: 0.26, inn: 0.2, zin: 0.34, zout: 0.3 },
    variants: { Scroll: "feed", Typing: "caret", Ring: "gauge" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 112, kicker: { v: "outline", c: "accent" } },
      statement: { bg: "accent", fg: "accentInk", hi: "accent2", world: true, top: 610, size: 124 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 78, bodySize: 38, ch: 54, lh: 1.52, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 88, ch: 25, lh: 1.16, markSize: 220 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 92, swap: "quote", card: { v: "frame", bg: "surface", r: 10, line: "inkMuted" }, chips: { v: "pill", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: 86, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 10, h: 640, labelSize: 42 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 88, cols: ["accent", "accent2", "ink"], num: 148, rule: true },
      cta: { bg: "ink", fg: "surface", hi: "accent2", world: true, top: 470, size: 104, align: "left", btn: { v: "pill", bg: "accent2", c: "ink" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — the round, just before six. Far: terrace roofline and a haze band.
       Mid: railings and lamp posts passing at two speeds, bundled papers on the
       kerb, and a delivery bicycle crossing on a 13s traverse — wheels turning
       at travel speed, the basket load bouncing, the rider's cape lifting.
       Near: two birds and a few leaves. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const kerb = H - 280;
      const cyc = (t % 13) / 13, bx = -260 + cyc * (W + 520);
      const wheel = (bx / 44) * 57.3;
      const bounce = Math.sin(t * 7) * 4;
      const rail = (t * 40) % 120, lamp = (t * 22) % 460;
      return R("g", null,
        R("defs", null,
          R("linearGradient", { id: "fc-haze", x1: "0%", y1: "0%", x2: "0%", y2: "100%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent2, 0.22) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent2, 0) }))),
        R("rect", { x: 0, y: kerb - 720, width: W, height: 420, fill: "url(#fc-haze)" }),
        /* dawn sky: three clouds on their own drifts, two fading stars */
        R("g", { opacity: 0.7 },
          [0, 1, 2].map((i) => {
            const cxp = ((i * 460 - (t * (7 + i * 4)) % 460) % (W + 500)) - 250;
            const cyp = 90 + i * 62;
            return R("g", { key: "cd" + i, transform: "translate(" + cxp.toFixed(1) + "," + cyp + ")" },
              R("path", { d: "M -120 0 q 10 -46 62 -38 q 20 -44 78 -26 q 54 -12 62 34 q 34 4 30 30 z", fill: rgba(theme.surface, 0.75 - i * 0.14) }),
              R("path", { d: "M -120 0 h 232", stroke: rgba(theme.accent2, 0.24), strokeWidth: 3 }));
          }),
          [0, 1].map((i) => R("circle", { key: "st" + i, cx: 700 + i * 190, cy: 70 + i * 54, r: 4, fill: rgba(theme.accent, 0.3 + 0.4 * Math.abs(Math.sin(t * 0.8 + i * 2))) }))),
        /* terrace roofline */
        R("g", { opacity: 0.34 },
          [0, 1, 2, 3, 4, 5].map((i) => {
            const rx2 = ((i * 230 - (t * 9) % 230) % (W + 230)) - 115;
            const hgt = 250 + (i % 3) * 90;
            return R("g", { key: "hs" + i },
              R("rect", { x: rx2, y: kerb - hgt, width: 190, height: hgt, fill: rgba(theme.accent, 0.3) }),
              R("rect", { x: rx2 + 40, y: kerb - hgt + 60, width: 44, height: 60, fill: rgba(theme.accent2, 0.5) }),
              R("rect", { x: rx2 + 110, y: kerb - hgt + 60, width: 44, height: 60, fill: rgba(theme.accent, 0.4) }));
          })),
        /* a shuttered shop with an awning and a paper stand */
        R("g", { transform: "translate(" + (W - 220) + "," + (kerb - 40) + ")" },
          R("rect", { x: -180, y: -420, width: 360, height: 420, rx: 6, fill: rgba(theme.accent, 0.14), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("path", { d: "M -200 -420 h 400 l -30 90 h -340 z", fill: rgba(theme.accent2, 0.55) }),
          [0, 1, 2, 3, 4].map((i) => R("rect", { key: "aw" + i, x: -200 + i * 80, y: -420, width: 40, height: 90, fill: rgba(theme.surface, 0.35) })),
          R("g", { transform: "translate(150,-300) rotate(" + (Math.sin(t * 1.2) * 5).toFixed(2) + ")" },
            R("line", { x1: 0, y1: -30, x2: 0, y2: 0, stroke: rgba(tint, 0.5), strokeWidth: 4 }),
            R("rect", { x: -54, y: 0, width: 108, height: 54, rx: 5, fill: rgba(theme.accent, 0.8) }),
            R("rect", { x: -36, y: 20, width: 72, height: 10, rx: 5, fill: rgba(theme.accent2, 0.9) })),
          R("g", { transform: "translate(-60,-10)" },
            R("path", { d: "M -80 0 h 160 l -14 -120 h -132 z", fill: rgba(tint, 0.45) }),
            [0, 1, 2].map((i) => R("rect", { key: "pp" + i, x: -60 + i * 44, y: -170 + (i % 2) * 12, width: 38, height: 56, rx: 3, fill: rgba(theme.surface, inv ? 0.5 : 0.94), stroke: rgba(tint, 0.35), strokeWidth: 2, transform: "rotate(" + (-6 + i * 6) + ")" })))),
        /* lamp posts, closer */
        [0, 1, 2].map((i) => {
          const lx = ((i * 460 - lamp) % (W + 460)) - 230;
          return R("g", { key: "lp" + i, opacity: 0.7 },
            R("line", { x1: lx, y1: kerb, x2: lx, y2: kerb - 430, stroke: rgba(tint, 0.65), strokeWidth: 8 }),
            R("path", { d: "M " + lx + " " + (kerb - 430) + " q 0 -40 46 -40", fill: "none", stroke: rgba(tint, 0.6), strokeWidth: 7 }),
            R("circle", { cx: lx + 52, cy: kerb - 462, r: 20, fill: rgba(theme.accent2, 0.9) }),
            R("circle", { cx: lx + 52, cy: kerb - 462, r: 58, fill: rgba(theme.accent2, 0.16) }));
        }),
        /* a car parked across the road, in the far plane */
        R("g", { opacity: 0.42 },
          (function () {
            const px = ((-(t * 5) % 1400) + 1400) % 1400 - 200;
            return R("g", { transform: "translate(" + px.toFixed(1) + "," + (kerb - 140) + ")" },
              R("path", { d: "M -150 0 h 300 v -46 l -60 -44 h -150 l -60 44 z", fill: rgba(theme.accent, 0.6) }),
              R("circle", { cx: -86, cy: 6, r: 26, fill: rgba(theme.ink, 0.6) }),
              R("circle", { cx: 86, cy: 6, r: 26, fill: rgba(theme.ink, 0.6) }));
          })()),
        /* railings */
        R("g", { opacity: 0.5, transform: "translate(" + (-rail).toFixed(1) + ",0)" },
          Array.from({ length: 12 }).map((_, i) => R("line", { key: "rl" + i, x1: i * 120, y1: kerb - 40, x2: i * 120, y2: kerb - 190, stroke: rgba(tint, 0.55), strokeWidth: 6 })),
          R("line", { x1: 0, y1: kerb - 190, x2: W + 240, y2: kerb - 190, stroke: rgba(tint, 0.5), strokeWidth: 6 })),
        /* kerb and bundles */
        R("line", { x1: 0, y1: kerb, x2: W, y2: kerb, stroke: rgba(tint, 0.6), strokeWidth: 7 }),
        R("rect", { x: 0, y: kerb, width: W, height: H - kerb, fill: rgba(theme.rule, 0.28) }),
        [0, 1].map((i) => R("g", { key: "bd" + i, transform: "translate(" + (W - 300 + i * 170) + "," + (kerb - 10) + ")" },
          R("rect", { x: -70, y: -76, width: 140, height: 76, rx: 5, fill: rgba(theme.surface, inv ? 0.45 : 0.92), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("path", { d: "M -70 -40 h 140 M 0 -76 v 76", stroke: rgba(theme.accent, 0.5), strokeWidth: 4 }))),
        /* a pillar box and a bus stop on the pavement */
        R("g", { transform: "translate(300," + (kerb - 6) + ")" },
          R("path", { d: "M -46 0 h 92 v -132 a 46 46 0 0 0 -92 0 z", fill: rgba(theme.accent, 0.85) }),
          R("rect", { x: -30, y: -104, width: 60, height: 14, rx: 4, fill: rgba(theme.accentInk, 0.6) }),
          R("path", { d: "M -46 -34 h 92", stroke: rgba(theme.accentInk, 0.35), strokeWidth: 4 })),
        R("g", { transform: "translate(640," + (kerb - 6) + ")" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: -300, stroke: rgba(tint, 0.6), strokeWidth: 7 }),
          R("rect", { x: -54, y: -374, width: 108, height: 74, rx: 8, fill: rgba(theme.accent, 0.8) }),
          R("rect", { x: -34, y: -352, width: 68, height: 12, rx: 6, fill: rgba(theme.accentInk, 0.5) })),
        /* a vent breathing on the kerb */
        R("g", null,
          R("rect", { x: 830, y: kerb - 8, width: 120, height: 16, rx: 4, fill: rgba(tint, 0.5) }),
          [0, 1, 2].map((i) => {
            const ph = ((t * 0.34 + i * 0.34) % 1);
            const sw = Math.sin(t * 1.1 + i * 2) * 22;
            return R("path", { key: "vs" + i, d: "M " + (860 + i * 30) + " " + (kerb - 20) + " q " + sw.toFixed(1) + " -70 " + (sw * 0.4).toFixed(1) + " -140", fill: "none", stroke: rgba(tint, 0.3 * (1 - ph)), strokeWidth: 15, strokeLinecap: "round", transform: "translate(0," + (-ph * 150).toFixed(1) + ")" });
          })),
        /* puddles holding the lamplight */
        [0, 1].map((i) => R("ellipse", { key: "pd" + i, cx: 200 + i * 520, cy: kerb + 90 + i * 40, rx: 110 - i * 20, ry: 16, fill: rgba(theme.accent2, 0.2 + 0.08 * Math.sin(t * 1.3 + i)) })),
        /* the bicycle */
        R("g", { transform: "translate(" + bx.toFixed(1) + "," + (kerb + bounce).toFixed(1) + ")" },
          R("ellipse", { cx: 0, cy: 8, rx: 120, ry: 12, fill: rgba(theme.ink, 0.18) }),
          [-72, 72].map((wx, i) => R("g", { key: "wl" + i, transform: "translate(" + wx + ",-52) rotate(" + wheel.toFixed(1) + ")" },
            R("circle", { r: 52, fill: "none", stroke: rgba(theme.ink, 0.85), strokeWidth: 7 }),
            R("path", { d: "M -52 0 h 104 M 0 -52 v 104 M -37 -37 l 74 74 M 37 -37 l -74 74", stroke: rgba(theme.ink, 0.35), strokeWidth: 3 }))),
          R("path", { d: "M -72 -52 L -6 -52 L 34 -132 L 72 -52 M -6 -52 L 34 -132 M -6 -52 L 6 -128 L 34 -132", fill: "none", stroke: rgba(theme.accent, 0.9), strokeWidth: 9, strokeLinejoin: "round" }),
          R("path", { d: "M 6 -128 q -34 -6 -44 10", fill: "none", stroke: rgba(theme.ink, 0.8), strokeWidth: 7, strokeLinecap: "round" }),
          R("rect", { x: -116, y: -152 + bounce, width: 96, height: 62, rx: 5, fill: rgba(theme.surface, inv ? 0.5 : 0.95), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
          R("path", { d: "M -116 " + (-124 + bounce) + " h 96", stroke: rgba(theme.accent, 0.6), strokeWidth: 4 }),
          R("path", { d: "M -20 -140 q 44 -10 58 30 q -30 22 -58 -30 z", fill: rgba(theme.accent2, 0.7) })),
        /* near plane */
        [0, 1].map((i) => {
          const bc = ((t / (9 + i * 3)) % 1);
          const bxp = W - 30 - bc * 300, byp = 520 + i * 130 + Math.sin(bc * Math.PI * 4 + i) * 80;
          const flap = Math.sin(t * 8 + i * 2) * 0.7;
          return R("path", { key: "br" + i, d: "M -24 0 q 12 " + (-16 - flap * 14).toFixed(1) + " 24 0 q 12 " + (-16 + flap * 14).toFixed(1) + " 24 0", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 4, strokeLinecap: "round", transform: "translate(" + bxp.toFixed(1) + "," + byp.toFixed(1) + ")" });
        }),
        [0, 1, 2, 3].map((i) => {
          const ph = (t * (0.2 + i * 0.04) + i * 0.23) % 1;
          return R("circle", { key: "ds" + i, cx: 90 + i * 250 + Math.sin(t * 1.2 + i) * 46, cy: H - ph * (H + 160), r: 4 + (i % 2) * 3, fill: rgba(tint, 0.26 * (1 - ph)) });
        }));
    },
  });

  /* ── 13 PRESS RUN — loading dock at night: shutters, bundles, a van pulling
     out ── */
  FilmKit.make({
    global: "PressRun", brand: "Press Run", desk: "#0b0c0d", ambient: 1.75, chrome: false,
    FH: '"Merriweather", Georgia, serif',
    FB: '"Work Sans", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "slam", itemPreset: "rise", titleLine: 1.08, titleSpace: "-0.015em",
    /* ladder: bg .035 / surface .08 / rule .15 / inkMuted .4 / ink .86 / accent .4 / accent2 .5 */
    palette: (t) => ({
      bg: t.bg || "#14161a", surface: "#1f2329", rule: "#333a42", inkMuted: "#8e9aa5",
      ink: "#f0f2f4", accent: t.accent || "#c93a2f", accent2: t.accent2 || "#e6c15a", accentInk: "#0e1012",
    }),
    tweaks: [
      { k: "bg", label: "Dock", options: ["#14161a", "#16181c", "#121519"] },
      { k: "accent", label: "Signal", options: ["#c93a2f", "#2f7ac9", "#2fc98a"] },
      { k: "accent2", label: "Sodium", options: ["#e6c15a", "#e68f5a", "#a9e65a"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(110% 60% at 50% 100%, " + rgba(theme.accent2, 0.24) + " 0%, transparent 60%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M3 16V7h11v9M14 10h4l3 3v3" }), R2("circle", { cx: 7, cy: 18, r: 2 }), R2("circle", { cx: 17, cy: 18, r: 2 })),
    cams: ["drop", "pushR", "zoomIn", "pushL", "spin", "zoomOut"], camMul: 7, camOff: 3,
    mag: { rot: 0.5, driftX: 8, driftY: 7, driftZ: 0.05, slide: 0.26, inn: 0.18, zin: 0.4, zout: 0.32 },
    variants: { Scroll: "board", Typing: "typewriter", Ring: "ring" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 104, kicker: { v: "tag", bg: "accent", c: "ink" } },
      statement: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 610, size: 116 },
      body: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 540, size: 72, bodySize: 38, ch: 54, lh: 1.52, weight: 400, dim: 0.92, kicker: { v: "bare", c: "accent2" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 82, ch: 24, lh: 1.16, markSize: 210 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 86, swap: "body", card: { v: "glow", bg: "surface", glow: "accent2", r: 12, line: "inkMuted" }, chips: { v: "square", colors: ["accent", "accent2", "ink"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 330, size: 80, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 12, h: 640, labelSize: 40 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 390, size: 84, cols: ["accent2", "accent", "ink"], num: 148, glowNums: true },
      cta: { bg: "accent", fg: "ink", hi: "accent2", world: true, top: 470, size: 100, align: "left", btn: { v: "block", bg: "accentInk", c: "ink" }, logoShape: "rounded" },
      app: { bg: "surface", fg: "ink", hi: "accent2", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — the dock, first edition loading. Far: a roller shutter wall and
       sodium lamps. Mid: pallets of bundles, a hazard-chevron kerb, and a van
       pulling out on a 12s traverse — wheels turning at travel speed, body
       rocking on its springs, headlight cone sweeping, exhaust puffing. Near:
       drizzle streaks. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const dock = H - 270;
      const cyc = (t % 12) / 12, vx = -320 + E.inOut(Math.min(1, cyc / 0.86)) * (W + 640);
      const wheel = (vx / 40) * 57.3;
      const rock = Math.sin(t * 5.5) * 2.2;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "pr-shutter", width: 26, height: 26, patternUnits: "userSpaceOnUse" },
            R("rect", { x: 0, y: 0, width: 26, height: 16, rx: 3, fill: rgba(theme.rule, inv ? 0.3 : 0.7) })),
          R("pattern", { id: "pr-chev", width: 60, height: 60, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
            R("rect", { x: 0, y: 0, width: 30, height: 60, fill: rgba(theme.accent2, 0.1) })),
          R("linearGradient", { id: "pr-beam", x1: "0%", y1: "0%", x2: "100%", y2: "0%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent2, 0.5) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent2, 0) }))),
        /* overhead gantry and dock signage, above the copy */
        R("g", { opacity: 0.55 },
          R("rect", { x: -20, y: 150, width: W + 40, height: 26, rx: 6, fill: rgba(tint, 0.5) }),
          [0, 1, 2, 3].map((i) => R("path", { key: "gt" + i, d: "M " + (60 + i * 320) + " 176 v 54 M " + (60 + i * 320) + " 230 h 120 M " + (180 + i * 320) + " 230 v -54", stroke: rgba(tint, 0.4), strokeWidth: 5, fill: "none" })),
          R("rect", { x: W - 300, y: 60, width: 250, height: 76, rx: 6, fill: rgba(theme.accent, 0.8) }),
          R("rect", { x: W - 276, y: 86, width: 200, height: 14, rx: 7, fill: rgba(theme.ink, 0.5) }),
          R("circle", { cx: 90, cy: 98, r: 22, fill: rgba(theme.accent2, Math.sin(t * 2.4) > 0 ? 0.9 : 0.25) })),
        R("rect", { x: 60, y: dock - 700, width: W - 120, height: 430, rx: 8, fill: "url(#pr-shutter)", opacity: 0.6 }),
        /* a second bay: shutter half raised, forklift waiting inside */
        R("g", { opacity: 0.5 },
          R("rect", { x: W - 430, y: dock - 700, width: 340, height: 210, rx: 6, fill: rgba(theme.accentInk, 0.85) }),
          R("rect", { x: W - 414, y: dock - 660, width: 308, height: 166, rx: 4, fill: rgba(theme.accent2, 0.14) }),
          R("rect", { x: W - 446, y: dock - 716, width: 372, height: 22, rx: 6, fill: rgba(tint, 0.5) }),
          R("g", { transform: "translate(" + (W - 300 + Math.sin(t * 0.5) * 40).toFixed(1) + "," + (dock - 500) + ")" },
            R("path", { d: "M -70 0 v -70 h 90 v 40 h 34 v 30 z", fill: rgba(theme.accent2, 0.7) }),
            R("path", { d: "M 54 -30 v -80 h 14 v 80", fill: rgba(tint, 0.6) }),
            R("circle", { cx: -40, cy: 8, r: 16, fill: rgba(theme.ink, 0.7) }),
            R("circle", { cx: 26, cy: 8, r: 12, fill: rgba(theme.ink, 0.7) }))),
        R("rect", { x: 40, y: dock - 720, width: W - 80, height: 26, rx: 6, fill: rgba(tint, 0.5) }),
        /* sodium lamps on the wall */
        [0, 1, 2].map((i) => R("g", { key: "sl" + i, transform: "translate(" + (200 + i * 340) + "," + (dock - 760) + ")" },
          R("path", { d: "M -30 0 h 60 l -12 34 h -36 z", fill: rgba(tint, 0.7) }),
          R("circle", { cx: 0, cy: 40, r: 14 + Math.sin(t * 2 + i) * 2, fill: rgba(theme.accent2, 0.9) }),
          R("path", { d: "M -70 40 L 70 40 L 150 " + (dock - 40) + " L -150 " + (dock - 40) + " Z", fill: rgba(theme.accent2, 0.07) }))),
        /* wall clock and hanging chains */
        R("g", { transform: "translate(" + (W - 170) + "," + (dock - 620) + ")" },
          R("circle", { r: 62, fill: rgba(theme.surface, inv ? 0.3 : 0.9), stroke: rgba(tint, 0.55), strokeWidth: 6 }),
          R("line", { x1: 0, y1: 0, x2: Math.cos(t * 0.1) * 30, y2: Math.sin(t * 0.1) * 30, stroke: rgba(tint, 0.8), strokeWidth: 6, strokeLinecap: "round" }),
          R("line", { x1: 0, y1: 0, x2: Math.cos(t * 1.05) * 48, y2: Math.sin(t * 1.05) * 48, stroke: rgba(theme.accent, 0.9), strokeWidth: 4, strokeLinecap: "round" })),
        [0, 1].map((i) => R("g", { key: "ch" + i, transform: "translate(" + (890 + i * 120) + "," + (dock - 700) + ") rotate(" + (Math.sin(t * 0.9 + i * 2) * 4).toFixed(2) + ")" },
          Array.from({ length: 7 }).map((_, j) => R("ellipse", { key: "lk" + j, cx: 0, cy: j * 34, rx: 9, ry: 16, fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 4 })),
          R("path", { d: "M -22 240 h 44 l -22 34 z", fill: rgba(theme.accent2, 0.6) }))),
        /* pallets of bundles */
        [0, 1].map((i) => R("g", { key: "pl" + i, transform: "translate(" + (120 + i * 780) + "," + dock + ")" },
          [0, 1, 2, 3].map((j) => R("rect", { key: "bn" + j, x: -80 + (j % 2) * 10, y: -40 - j * 34, width: 160 - (j % 2) * 20, height: 30, rx: 4, fill: rgba(theme.surface, inv ? 0.5 : 0.9), stroke: rgba(tint, 0.4), strokeWidth: 2 })),
          R("rect", { x: -92, y: -40, width: 184, height: 18, rx: 3, fill: rgba(tint, 0.55) }))),
        /* a puddle holding the sodium light, and cones on the kerb */
        [0, 1].map((i) => R("ellipse", { key: "pu" + i, cx: 260 + i * 520, cy: dock + 96 + i * 34, rx: 130 - i * 26, ry: 18, fill: rgba(theme.accent2, 0.16 + 0.06 * Math.sin(t * 1.2 + i)) })),
        [0, 1, 2].map((i) => R("g", { key: "cn" + i, transform: "translate(" + (640 + i * 150) + "," + (dock + 6) + ")" },
          R("path", { d: "M -26 0 h 52 l -19 -66 h -14 z", fill: rgba(theme.accent, 0.85) }),
          R("rect", { x: -30, y: 0, width: 60, height: 10, rx: 3, fill: rgba(theme.accent, 0.7) }),
          R("rect", { x: -20, y: -42, width: 40, height: 9, rx: 3, fill: rgba(theme.ink, 0.5) }))),
        /* kerb with chevrons */
        R("rect", { x: 0, y: dock, width: W, height: H - dock, fill: "url(#pr-chev)" }),
        R("line", { x1: 0, y1: dock, x2: W, y2: dock, stroke: rgba(tint, 0.6), strokeWidth: 7 }),
        /* the van */
        R("g", { transform: "translate(" + vx.toFixed(1) + "," + (dock + rock).toFixed(1) + ")" },
          R("path", { d: "M " + 210 + " -150 L 470 -60 L 470 -20 L 210 -20 Z", fill: "url(#pr-beam)", opacity: 0.8 }),
          R("ellipse", { cx: 0, cy: 12, rx: 210, ry: 14, fill: rgba(theme.accentInk, 0.5) }),
          R("path", { d: "M -200 -20 v -150 h 250 l 60 66 v 84 z", fill: rgba(theme.surface, 0.95), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
          R("path", { d: "M -200 -170 h 250 l 12 14 h -262 z", fill: rgba(theme.ink, 0.14) }),
          R("rect", { x: 62, y: -156, width: 44, height: 46, rx: 4, fill: rgba(theme.accent2, 0.5) }),
          R("rect", { x: -170, y: -140, width: 190, height: 60, rx: 4, fill: rgba(theme.accent, 0.85) }),
          R("circle", { cx: 104, cy: -34, r: 12, fill: rgba(theme.accent2, 0.95) }),
          [-120, 60].map((wx, i) => R("g", { key: "wl" + i, transform: "translate(" + wx + ",-16) rotate(" + wheel.toFixed(1) + ")" },
            R("circle", { r: 38, fill: rgba(theme.accentInk, 0.9), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
            R("path", { d: "M -38 0 h 76 M 0 -38 v 76", stroke: rgba(tint, 0.45), strokeWidth: 4 }))),
          [0, 1, 2].map((i) => {
            const ph = ((t * 1.1 + i * 0.33) % 1);
            return R("circle", { key: "ex" + i, cx: -210 - ph * 90, cy: -34 - ph * 40, r: 10 + ph * 26, fill: rgba(tint, 0.22 * (1 - ph)) });
          })),
        /* a stack of empty pallets and a dock light on a bracket */
        R("g", { opacity: 0.8, transform: "translate(" + (W - 120) + "," + dock + ")" },
          [0, 1, 2, 3].map((i) => R("g", { key: "ep" + i },
            R("rect", { x: -84, y: -26 - i * 30, width: 168, height: 12, rx: 3, fill: rgba(tint, 0.55) }),
            R("rect", { x: -84, y: -14 - i * 30, width: 168, height: 8, rx: 2, fill: rgba(tint, 0.3) })))),
        R("g", { transform: "translate(" + (W - 90) + "," + (dock - 430) + ")" },
          R("line", { x1: 0, y1: 0, x2: -70, y2: 0, stroke: rgba(tint, 0.5), strokeWidth: 6 }),
          R("path", { d: "M -70 -26 h 44 l 10 52 h -44 z", fill: rgba(tint, 0.7) }),
          R("circle", { cx: -48, cy: 34, r: 12 + Math.sin(t * 3) * 2, fill: rgba(theme.accent2, 0.9) }),
          R("path", { d: "M -110 34 L 14 34 L 70 " + (dock - 40 - (dock - 430)) + " L -170 " + (dock - 40 - (dock - 430)) + " Z", fill: rgba(theme.accent2, 0.06) })),
        /* drizzle */
        Array.from({ length: 16 }).map((_, i) => {
          const ph = (t * (0.5 + (i % 4) * 0.12) + i * 0.09) % 1;
          const x = 30 + i * 68 + Math.sin(i) * 20, y = -60 + ph * (H + 120);
          return R("line", { key: "dz" + i, x1: x, y1: y, x2: x - 10, y2: y + 46, stroke: rgba(theme.accent2, 0.34 * (1 - ph * 0.35)), strokeWidth: 3, strokeLinecap: "round" });
        }));
    },
  });

  /* ── 14 BYLINE RULE — press pit: barrier, crowd, a camera swinging, flashes ── */
  FilmKit.make({
    global: "BylineRule", brand: "Byline Rule", desk: "#08090a", ambient: 1.8, chrome: false,
    FH: '"Oswald", "Helvetica Neue", sans-serif',
    FB: '"PT Sans", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "streak", itemPreset: "slam", titleLine: 1.04, titleSpace: "0.005em",
    /* ladder: bg .02 / surface .06 / rule .13 / inkMuted .38 / ink .9 / accent .55 / accent2 .42 */
    palette: (t) => ({
      bg: t.bg || "#0e0f11", surface: "#191b1e", rule: "#2c3034", inkMuted: "#8b9095",
      ink: "#f7f8f9", accent: t.accent || "#f2d13c", accent2: t.accent2 || "#d0473c", accentInk: "#0b0c0d",
    }),
    tweaks: [
      { k: "bg", label: "Pit", options: ["#0e0f11", "#101113", "#0c0e10"] },
      { k: "accent", label: "Flash", options: ["#f2d13c", "#3cd3f2", "#f23c8f"] },
      { k: "accent2", label: "Second", options: ["#d0473c", "#4c7ad0", "#4cd07a"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(90% 50% at 50% 8%, " + rgba(theme.accent, 0.16) + " 0%, transparent 60%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M3 8h4l2-3h6l2 3h4v11H3z" }), R2("circle", { cx: 12, cy: 13, r: 3.5 })),
    cams: ["zoomIn", "pushU", "spin", "pushR", "drop", "pushL"], camMul: 5, camOff: 5,
    mag: { rot: 0.9, skew: 3, driftX: 7, driftY: 8, driftZ: 0.05, slide: 0.3, inn: 0.16, zin: 0.44, zout: 0.34 },
    variants: { Scroll: "feed", Typing: "hand", Ring: "bar" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 122, upper: true, kicker: { v: "tag", bg: "accent", c: "accentInk" } },
      statement: { bg: "accent", fg: "accentInk", hi: "accent2", world: true, top: 610, size: 132, upper: true },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 82, bodySize: 38, ch: 54, lh: 1.5, weight: 400, dim: 0.92, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 92, ch: 24, lh: 1.12, markSize: 220, altLine: true },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 96, upper: true, swap: "quote", card: { v: "frame", bg: "surface", r: 8, line: "inkMuted" }, chips: { v: "square", colors: ["accent", "accent2", "ink"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: 90, upper: true, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 8, h: 640, labelSize: 42 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 92, upper: true, cols: ["accent", "accent2", "ink"], num: 152, glowNums: true },
      cta: { bg: "ink", fg: "accentInk", hi: "accent2", world: true, top: 470, size: 112, upper: true, align: "left", btn: { v: "block", bg: "accent2", c: "ink" }, logoShape: "rounded" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — the press pit. Far: a lit backdrop wall that pulses with each
       flash, and a row of crowd heads bobbing out of phase. Mid: a barrier rail,
       three boom mics leaning in, and a press camera swinging on its strap in
       the right margin — the strap lags the body and the bulb fires on a 2.6s
       cycle, lighting the whole frame for two frames. Near: flash sparks. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const pit = H - 300;
      const fire = (t % 2.6) / 2.6;
      const flash = fire < 0.06 ? 1 - fire / 0.06 : 0;
      const sway = Math.sin(t * 1.5) * 12, lag = Math.sin(t * 1.5 - 0.6) * 12;
      return R("g", null,
        R("defs", null,
          R("linearGradient", { id: "bl-wall", x1: "0%", y1: "0%", x2: "0%", y2: "100%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent, 0.2) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent, 0) }))),
        R("rect", { x: 0, y: 0, width: W, height: pit, fill: "url(#bl-wall)", opacity: 0.5 + flash * 0.5 }),
        /* lighting truss above the copy */
        R("g", { opacity: 0.7 },
          R("line", { x1: -20, y1: 130, x2: W + 20, y2: 130, stroke: rgba(tint, 0.55), strokeWidth: 8 }),
          R("line", { x1: -20, y1: 186, x2: W + 20, y2: 186, stroke: rgba(tint, 0.4), strokeWidth: 5 }),
          [0, 1, 2, 3, 4, 5].map((i) => R("line", { key: "tx" + i, x1: 20 + i * 200, y1: 130, x2: 140 + i * 200, y2: 186, stroke: rgba(tint, 0.3), strokeWidth: 4 })),
          [0, 1, 2, 3].map((i) => {
            const on = 0.55 + 0.45 * Math.abs(Math.sin(t * (1.1 + i * 0.3) + i));
            return R("g", { key: "sl" + i, transform: "translate(" + (150 + i * 260) + ",192)" },
              R("path", { d: "M -34 0 h 68 l -14 54 h -40 z", fill: rgba(theme.accentInk, 0.9), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
              R("circle", { cx: 0, cy: 58, r: 14, fill: rgba(theme.accent, on) }),
              R("path", { d: "M -60 58 L 60 58 L 150 " + (pit - 200) + " L -150 " + (pit - 200) + " Z", fill: rgba(theme.accent, 0.05 * on) }));
          })),
        R("rect", { x: 0, y: 0, width: W, height: H, fill: rgba(theme.accent, 0.22 * flash) }),
        /* backdrop step-and-repeat marks */
        R("g", { opacity: 0.24 },
          [0, 1, 2, 3, 4, 5, 6, 7].map((i) => R("rect", { key: "sr" + i, x: 40 + (i % 4) * 260, y: pit - 620 + Math.floor(i / 4) * 130, width: 150, height: 26, rx: 6, fill: rgba(theme.ink, 0.5) }))),
        /* crowd heads bobbing */
        [0, 1, 2, 3, 4, 5, 6].map((i) => {
          const hx = 60 + i * 155, bob = Math.sin(t * 1.6 + i * 1.1) * 9;
          return R("g", { key: "hd" + i },
            R("circle", { cx: hx, cy: pit - 120 + bob, r: 46, fill: rgba(theme.accentInk, 0.92) }),
            R("path", { d: "M " + (hx - 74) + " " + (pit + 40) + " q 74 -110 148 0 z", fill: rgba(theme.accentInk, 0.92) }),
            R("path", { d: "M " + (hx - 46) + " " + (pit - 122 + bob) + " a 46 46 0 0 1 92 0", fill: "none", stroke: rgba(tint, 0.35), strokeWidth: 4 }));
        }),
        /* monitor bank in the margin */
        [0, 1].map((i) => R("g", { key: "mn" + i, transform: "translate(" + (W - 112) + "," + (985 + i * 235) + ")" },
          R("line", { x1: 0, y1: -120, x2: 0, y2: -80, stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("rect", { x: -112, y: -70, width: 224, height: 160, rx: 10, fill: rgba(theme.accentInk, 0.9), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("rect", { x: -94, y: -52, width: 188, height: 124, rx: 5, fill: rgba(theme.accent2, 0.24) }),
          R("rect", { x: -94, y: -52 + ((t * 90 + i * 70) % 124), width: 188, height: 12, fill: rgba(theme.accent, 0.35) }),
          [0, 1, 2].map((j) => R("rect", { key: "ln" + j, x: -78, y: -28 + j * 34, width: 116 - j * 26, height: 10, rx: 5, fill: rgba(theme.ink, 0.35) })))),
        /* the lectern, and a cluster of mics on it */
        R("g", { transform: "translate(" + (W * 0.42) + "," + (pit - 20) + ")" },
          R("path", { d: "M -110 0 h 220 l -26 -190 h -168 z", fill: rgba(theme.surface, 0.95), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("path", { d: "M -110 0 h 220 l -8 -40 h -204 z", fill: rgba(theme.accentInk, 0.25) }),
          R("rect", { x: -70, y: -150, width: 140, height: 46, rx: 6, fill: rgba(theme.accent, 0.75) }),
          [0, 1, 2].map((i) => R("g", { key: "lm" + i, transform: "translate(" + (-46 + i * 46) + ",-190) rotate(" + (-14 + i * 14 + Math.sin(t * 1.1 + i) * 2).toFixed(2) + ")" },
            R("line", { x1: 0, y1: 0, x2: 0, y2: -80, stroke: rgba(tint, 0.6), strokeWidth: 5 }),
            R("rect", { x: -13, y: -116, width: 26, height: 44, rx: 13, fill: rgba(theme.accentInk, 0.95), stroke: rgba(tint, 0.4), strokeWidth: 3 })))),
        /* flashes going off along the crowd line */
        [0, 1, 2, 3, 4].map((i) => {
          const ph = ((t * 0.9 + i * 0.37) % 1);
          const pop = ph < 0.1 ? 1 - ph / 0.1 : 0;
          if (pop <= 0) return null;
          const fx = 130 + i * 190;
          return R("g", { key: "cf" + i },
            R("circle", { cx: fx, cy: pit - 180, r: 18 + (1 - pop) * 90, fill: rgba(theme.ink, 0.5 * pop) }),
            R("circle", { cx: fx, cy: pit - 180, r: 10, fill: rgba(theme.ink, 0.9 * pop) }));
        }),
        /* cables snaking across the foreground */
        R("path", { d: "M -40 " + (H - 90) + " q 240 -60 480 10 q 240 66 500 -20", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 10, strokeLinecap: "round" }),
        R("path", { d: "M -40 " + (H - 40) + " q 300 -46 560 16 q 220 52 460 -14", fill: "none", stroke: rgba(theme.accent2, 0.35), strokeWidth: 8, strokeLinecap: "round" }),
        /* barrier rail */
        R("line", { x1: 0, y1: pit + 20, x2: W, y2: pit + 20, stroke: rgba(tint, 0.6), strokeWidth: 10, strokeLinecap: "round" }),
        [0, 1, 2, 3, 4].map((i) => R("line", { key: "bp" + i, x1: 80 + i * 240, y1: pit + 20, x2: 80 + i * 240, y2: H, stroke: rgba(tint, 0.45), strokeWidth: 8 })),
        /* boom mics leaning in */
        [0, 1, 2].map((i) => {
          const lean = Math.sin(t * 0.9 + i * 1.7) * 4;
          return R("g", { key: "bm" + i, transform: "translate(" + (90 + i * 420) + "," + (pit + 30) + ") rotate(" + (-28 + lean + i * 8).toFixed(2) + ")" },
            R("line", { x1: 0, y1: 0, x2: 0, y2: -420, stroke: rgba(tint, 0.6), strokeWidth: 8 }),
            R("rect", { x: -26, y: -516, width: 52, height: 104, rx: 24, fill: rgba(theme.accentInk, 0.95), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
            [0, 1, 2].map((j) => R("line", { key: "gr" + j, x1: -18, y1: -496 + j * 22, x2: 18, y2: -496 + j * 22, stroke: rgba(tint, 0.4), strokeWidth: 4 })),
            R("rect", { x: -14, y: -412, width: 28, height: 34, rx: 6, fill: rgba(theme.accent2, 0.8) }));
        }),
        /* the camera on its strap */
        R("g", { transform: "translate(" + (W - 96) + ",-30)" },
          R("path", { d: "M 0 0 q " + (lag * 3).toFixed(1) + " 740 " + (sway * 2).toFixed(1) + " 1470", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 6 }),
          R("g", { transform: "translate(" + (sway * 2).toFixed(1) + ",1470) rotate(" + sway.toFixed(2) + ")" },
            R("rect", { x: -104, y: -66, width: 208, height: 132, rx: 12, fill: rgba(theme.surface, 0.98), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
            R("rect", { x: -104, y: -66, width: 208, height: 34, rx: 10, fill: rgba(theme.ink, 0.12) }),
            R("circle", { cx: 10, cy: 4, r: 46, fill: rgba(theme.accentInk, 0.9), stroke: rgba(tint, 0.6), strokeWidth: 5 }),
            R("circle", { cx: 10, cy: 4, r: 20, fill: rgba(theme.accent2, 0.5 + 0.5 * flash) }),
            R("rect", { x: -96, y: -104, width: 74, height: 40, rx: 6, fill: rgba(theme.accent, 0.4 + 0.6 * flash) }),
            R("circle", { cx: -59, cy: -84, r: 30 + flash * 90, fill: rgba(theme.accent, 0.5 * flash) }))),
        /* sparks off the flash */
        [0, 1, 2, 3, 4].map((i) => {
          const ph = ((t * 0.9 + i * 0.2) % 1);
          return R("line", { key: "sk" + i, x1: W - 150 + i * 30, y1: 1390 - ph * 300, x2: W - 150 + i * 30, y2: 1430 - ph * 300, stroke: rgba(theme.accent, 0.3 * (1 - ph)), strokeWidth: 3, strokeLinecap: "round" });
        }));
    },
  });

  /* ── 15 COPY DESK — the copy floor: tube run overhead, desks in perspective ── */
  FilmKit.make({
    global: "CopyDesk", brand: "Copy Desk", desk: "#141613", ambient: 1.9, chrome: false,
    FH: '"Barlow Condensed", "Helvetica Neue", sans-serif',
    FB: '"Barlow", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "machete", itemPreset: "pop", titleLine: 1.02, titleSpace: "0.005em",
    /* ladder: bg .84 / surface .94 / rule .7 / inkMuted .42 / ink .07 / accent .4 / accent2 .5 */
    palette: (t) => ({
      bg: t.bg || "#e6e8e2", surface: "#f6f8f4", rule: "#c3c8bd", inkMuted: "#697064",
      ink: "#141712", accent: t.accent || "#2f7d7a", accent2: t.accent2 || "#d97a2f", accentInk: "#f6f8f4",
    }),
    tweaks: [
      { k: "bg", label: "Floor", options: ["#e6e8e2", "#e9ebe5", "#e4e7e0"] },
      { k: "accent", label: "Accent", options: ["#2f7d7a", "#2f5f7d", "#5f2f7d"] },
      { k: "accent2", label: "Second", options: ["#d97a2f", "#d9b02f", "#d92f5a"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(176deg, " + rgba(theme.surface, 0.92) + " 0%, " + bg + " 50%, " + rgba(theme.rule, 0.45) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M4 6h16M4 6v12h16V6" }), R2("path", { d: "M9 10h6M9 14h6" })),
    cams: ["pushU", "pushL", "zoomIn", "pushR", "pushD", "zoomOut"], camMul: 1, camOff: 4,
    mag: { rot: 0.1, driftX: 5, driftY: 4, driftZ: 0.02, slide: 0.2, inn: 0.14, zin: 0.26, zout: 0.22 },
    variants: { Scroll: "board", Typing: "caret", Ring: "gauge" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 300, size: 128, upper: true, kicker: { v: "tag", bg: "accent", c: "accentInk" } },
      statement: { bg: "ink", fg: "surface", hi: "accent2", world: true, top: 610, size: 142, upper: true },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 88, bodySize: 38, ch: 54, lh: 1.52, weight: 450, dim: 0.9, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 360, size: 98, ch: 25, lh: 1.1, markSize: 230 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 104, upper: true, swap: "body", card: { v: "frame", bg: "surface", r: 8, line: "inkMuted" }, chips: { v: "square", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: 96, upper: true, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 8, h: 640, labelSize: 44 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 390, size: 98, upper: true, cols: ["accent", "accent2", "ink"], num: 152, rule: true },
      cta: { bg: "accent", fg: "accentInk", hi: "ink", world: true, top: 470, size: 118, upper: true, align: "left", btn: { v: "block", bg: "ink", c: "accentInk" }, logoShape: "rounded" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — the copy floor at deadline. Far: a ceiling tube run in the top
       band with a carrier shooting through it every 5s, and desk rows converging
       in perspective. Mid: spike files, trays and a phone row along the deck.
       Near: paper slips rising. Nothing enters the text column: the tube sits
       above y=250 and everything else below y=1380. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const hz = H * 0.58, deck = H - 260;
      const shot = (t % 5) / 5;
      const car = E.inOut(Math.min(1, shot / 0.5)) * (W + 300) - 150;
      const puff = shot < 0.12 ? 1 - shot / 0.12 : 0;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "cd-grid", width: 110, height: 110, patternUnits: "userSpaceOnUse", patternTransform: "translate(" + ((t * 9) % 110).toFixed(1) + ",0)" },
            R("path", { d: "M55 46v18M46 55h18", stroke: rgba(theme.rule, inv ? 0.28 : 0.8), strokeWidth: 2 }))),
        R("rect", { x: 0, y: 0, width: W, height: hz, fill: "url(#cd-grid)" }),
        /* a branch tube dropping off the main run, and the edition clock band */
        R("g", { opacity: 0.6 },
          R("path", { d: "M 760 194 q 0 90 96 90 h 260", fill: "none", stroke: rgba(theme.surface, inv ? 0.28 : 0.8), strokeWidth: 44, strokeLinecap: "round" }),
          R("path", { d: "M 760 194 q 0 90 96 90 h 260", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("circle", { cx: 856, cy: 284, r: 26, fill: "none", stroke: rgba(tint, 0.4), strokeWidth: 4 })),
        /* the tube run, above the kicker */
        R("g", null,
          R("rect", { x: -20, y: 120, width: W + 40, height: 74, rx: 37, fill: rgba(theme.surface, inv ? 0.3 : 0.85), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("line", { x1: -20, y1: 140, x2: W + 20, y2: 140, stroke: rgba(theme.ink, 0.08), strokeWidth: 10 }),
          [0, 1, 2, 3].map((i) => R("rect", { key: "cp" + i, x: 90 + i * 300, y: 110, width: 26, height: 94, rx: 6, fill: rgba(tint, 0.5) })),
          R("g", { transform: "translate(" + car.toFixed(1) + ",157)" },
            R("rect", { x: -54, y: -26, width: 108, height: 52, rx: 26, fill: rgba(theme.accent2, 0.95) }),
            R("rect", { x: -18, y: -26, width: 36, height: 52, rx: 8, fill: rgba(theme.accentInk, 0.3) })),
          R("circle", { cx: 30, cy: 157, r: 20 + puff * 70, fill: rgba(tint, 0.3 * puff) })),
        /* proof board pinned up in the margin */
        R("g", { transform: "translate(" + (W - 116) + ",1190)" },
          R("rect", { x: -110, y: -230, width: 220, height: 460, rx: 6, fill: rgba(theme.accent, 0.1), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2, 3, 4, 5].map((i) => {
            const sw = Math.sin(t * 1.3 + i * 1.4) * 2.6;
            return R("g", { key: "pf" + i, transform: "translate(" + (-55 + (i % 2) * 110) + "," + (-152 + Math.floor(i / 2) * 152) + ") rotate(" + sw.toFixed(2) + ")" },
              R("rect", { x: -50, y: -56, width: 100, height: 112, rx: 3, fill: rgba(theme.surface, inv ? 0.5 : 0.96), stroke: rgba(tint, 0.3), strokeWidth: 2 }),
              R("rect", { x: -34, y: -38, width: 68, height: 8, rx: 4, fill: rgba(i % 2 ? theme.accent2 : theme.accent, 0.7) }),
              [0, 1, 2].map((j) => R("line", { key: "pl" + j, x1: -34, y1: -14 + j * 16, x2: 34 - (j % 2) * 22, y2: -14 + j * 16, stroke: rgba(tint, 0.32), strokeWidth: 4 })));
          })),
        /* a pendant swinging over the floor */
        R("g", { transform: "translate(985,240) rotate(" + (Math.sin(t * 1.1) * 4).toFixed(2) + ")" },
          R("line", { x1: 0, y1: -260, x2: 0, y2: 0, stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("path", { d: "M -56 0 h 112 l -26 62 h -60 z", fill: rgba(theme.accent, 0.7) }),
          R("circle", { cx: 0, cy: 74, r: 18 + Math.sin(t * 1.8) * 3, fill: rgba(theme.accent2, 0.8) }),
          R("circle", { cx: 0, cy: 74, r: 70, fill: rgba(theme.accent2, 0.1) })),
        /* desk rows in perspective */
        R("g", { opacity: 0.45 },
          [-3, -2, -1, 1, 2, 3].map((i) => R("line", { key: "pv" + i, x1: W / 2 + i * 70, y1: hz, x2: W / 2 + i * 520, y2: H, stroke: rgba(tint, 0.5), strokeWidth: 3 })),
          [0.22, 0.46, 0.74].map((f, i) => R("g", { key: "dr" + i },
            R("line", { x1: 0, y1: hz + f * (H - hz), x2: W, y2: hz + f * (H - hz), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
            [0, 1, 2, 3].map((j) => R("rect", { key: "mo" + j, x: 60 + j * 280 - i * 30, y: hz + f * (H - hz) - 60 - i * 10, width: 90 + i * 18, height: 56 + i * 10, rx: 5, fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 4 }))))),
        /* a photocopier working the back wall, and a filing run beside it */
        R("g", { transform: "translate(700," + (hz + 96) + ")" },
          R("rect", { x: -110, y: -150, width: 220, height: 150, rx: 8, fill: rgba(theme.surface, inv ? 0.4 : 0.92), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("rect", { x: -86, y: -132, width: 172, height: 20, rx: 4, fill: rgba(theme.accentInk, 0.3) }),
          R("rect", { x: -86, y: -132 + ((t * 70) % 20), width: 172, height: 6, fill: rgba(theme.accent, 0.8) }),
          R("rect", { x: -70, y: -46, width: 140, height: 26, rx: 3, fill: rgba(theme.rule, 0.6) })),
        R("g", { opacity: 0.55, transform: "translate(170," + (hz + 40) + ")" },
          [0, 1, 2].map((i) => R("rect", { key: "fc" + i, x: -80 + i * 84, y: -120, width: 76, height: 120, rx: 4, fill: "none", stroke: rgba(tint, 0.55), strokeWidth: 4 })),
          [0, 1, 2].map((i) => R("line", { key: "fh" + i, x1: -66 + i * 84, y1: -84, x2: -18 + i * 84, y2: -84, stroke: rgba(tint, 0.4), strokeWidth: 5 }))),
        /* a paste-up table with a scalpel and galleys */
        R("g", { transform: "translate(" + (W * 0.46) + "," + (deck - 6) + ")" },
          R("rect", { x: -190, y: -86, width: 380, height: 16, rx: 4, fill: rgba(tint, 0.6) }),
          R("path", { d: "M -160 -70 v 70 M 160 -70 v 70", stroke: rgba(tint, 0.5), strokeWidth: 8 }),
          [0, 1, 2].map((i) => R("rect", { key: "gl" + i, x: -150 + i * 106, y: -128 + (i % 2) * 10, width: 92, height: 46, rx: 3, fill: rgba(theme.surface, inv ? 0.45 : 0.95), stroke: rgba(tint, 0.35), strokeWidth: 2, transform: "rotate(" + (-4 + i * 4) + ")" })),
          R("path", { d: "M 40 -96 l 76 -30 l 8 14 l -76 30 z", fill: rgba(theme.accent2, 0.8) })),
        /* the deck: spikes, trays, phones */
        R("line", { x1: 0, y1: deck, x2: W, y2: deck, stroke: rgba(tint, 0.6), strokeWidth: 7 }),
        R("rect", { x: 0, y: deck, width: W, height: H - deck, fill: rgba(theme.rule, 0.24) }),
        R("g", { transform: "translate(150," + deck + ")" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: -150, stroke: rgba(tint, 0.7), strokeWidth: 6 }),
          [0, 1, 2, 3].map((i) => R("path", { key: "sk" + i, d: "M -66 " + (-26 - i * 30) + " h 132 l -12 22 h -108 z", fill: rgba(theme.surface, inv ? 0.45 : 0.92), stroke: rgba(tint, 0.35), strokeWidth: 2 })),
          R("circle", { cx: 0, cy: -156, r: 9, fill: rgba(theme.accent2, 0.9) })),
        [0, 1].map((i) => R("g", { key: "ph" + i, transform: "translate(" + (520 + i * 320) + "," + deck + ")" },
          R("rect", { x: -70, y: -46, width: 140, height: 46, rx: 8, fill: rgba(theme.ink, 0.85) }),
          R("path", { d: "M -54 -46 q 54 -46 108 0", fill: "none", stroke: rgba(theme.ink, 0.85), strokeWidth: 18, strokeLinecap: "round" }),
          R("circle", { cx: 0, cy: -70, r: 8 + (Math.sin(t * 6 + i * 2) > 0.7 ? 6 : 0), fill: rgba(theme.accent, 0.8) }))),
        R("g", { transform: "translate(" + (W - 170) + "," + deck + ")" },
          [0, 1, 2].map((i) => R("rect", { key: "tr" + i, x: -100, y: -34 - i * 40, width: 200, height: 30, rx: 4, fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 4 })),
          R("rect", { x: -84, y: -60, width: 168, height: 20, rx: 3, fill: rgba(theme.accent2, 0.6) })),
        /* near plane */
        [0, 1, 2, 3, 4, 5].map((i) => {
          const ph = (t * (0.24 + i * 0.04) + i * 0.17) % 1;
          const x = 90 + i * 175 + Math.sin(t * 1.3 + i) * 40, y = H - ph * (H + 180);
          return R("rect", { key: "sl" + i, x: x, y: y, width: 30, height: 22, rx: 3, fill: rgba(theme.surface, 0.75 * (1 - ph)), stroke: rgba(tint, 0.3 * (1 - ph)), strokeWidth: 2, transform: "rotate(" + (ph * 300 + i * 40).toFixed(1) + " " + x.toFixed(1) + " " + y.toFixed(1) + ")" });
        }));
    },
  });
})();
