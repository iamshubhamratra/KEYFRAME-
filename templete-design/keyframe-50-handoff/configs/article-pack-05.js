/* article-pack-05.js — cohort 05, personal blog / diary: packs 21-25.
   Morning Pages · Small Talk · Home Desk · Corner Shop · Slow Sunday
   Contract as before: hexes only in palette(), look and World name slots,
   chrome:false, three depth planes, an object on a route with secondary motion,
   nothing in the text column (copy to x≈972, y 540-900; stats labels to y≈1250
   at x<800; free above y=290 and below y=1330), tone-aware tints. */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ── 21 MORNING PAGES — kitchen table at dawn, a robin at the feeder ── */
  FilmKit.make({
    global: "MorningPages", brand: "Morning Pages", desk: "#1a1512", ambient: 1.5, chrome: false,
    FH: '"Caveat", cursive',
    FB: '"Nunito", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "rise", itemPreset: "pop", titleLine: 1.02, titleSpace: "0",
    /* ladder: bg .88 / surface .96 / rule .74 / inkMuted .44 / ink .08 / accent .48 / accent2 .42 */
    palette: (t) => ({
      bg: t.bg || "#f3ece1", surface: "#fbf7f1", rule: "#d5c9b8", inkMuted: "#736a5d",
      ink: "#1b1712", accent: t.accent || "#e07a5f", accent2: t.accent2 || "#81a06b", accentInk: "#fbf7f1",
    }),
    tweaks: [
      { k: "bg", label: "Table", options: ["#f3ece1", "#f5efe6", "#f0e8dc"] },
      { k: "accent", label: "Warm", options: ["#e07a5f", "#e0a75f", "#c96f7a"] },
      { k: "accent2", label: "Green", options: ["#81a06b", "#6b9aa0", "#a08a6b"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(90% 55% at 20% 6%, " + rgba(theme.accent, 0.2) + " 0%, transparent 62%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M5 18h11a4 4 0 000-8H5zM16 10h2a2 2 0 010 4h-1" }), R2("path", { d: "M8 5v2M12 4v3" })),
    cams: ["hopU", "zoomIn", "pushR", "drop", "pushL", "zoomOut"], camMul: 3, camOff: 2,
    mag: { rot: 0.5, driftX: 7, driftY: 7, driftZ: 0.04, slide: 0.22, inn: 0.2, zin: 0.32, zout: 0.28 },
    variants: { Scroll: "feed", Typing: "hand", Ring: "gauge" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 132, kicker: { v: "pill", bg: "accent", c: "accentInk" } },
      statement: { bg: "ink", fg: "surface", hi: "accent", world: true, top: 610, size: 146 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 100, bodySize: 38, ch: 54, lh: 1.54, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 110, ch: 26, lh: 1.06, markSize: 240 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 112, swap: "body", card: { v: "paper", bg: "surface", r: 10, line: "inkMuted" }, chips: { v: "pill", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 330, size: 104, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 14, h: 640, labelSize: 50 }, tilts: [-1.5, 1.5, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 106, cols: ["accent", "accent2", "ink"], num: 150 },
      cta: { bg: "accent", fg: "accentInk", hi: "surface", world: true, top: 470, size: 126, align: "left", btn: { v: "pill", bg: "ink", c: "surface" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — the table before anyone else is up. Far: a window with a feeder
       and a dawn wash. Mid: a robin arrives at the feeder on a 9s cycle, hops,
       pecks and leaves; a mug steams and a plant leans to the light. Near: crumbs
       and dust in the beam. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const table = H - 300;
      const cyc = (t % 9) / 9;
      const inFly = cyc < 0.18 ? E.outCubic(cyc / 0.18) : cyc < 0.78 ? 1 : 1 - E.inCubic((cyc - 0.78) / 0.22);
      const bx = W - 210 + (1 - inFly) * 260, by = 1380 - (1 - inFly) * 160;
      const peck = cyc > 0.2 && cyc < 0.76 ? Math.abs(Math.sin(t * 5)) : 0;
      const hop = cyc > 0.2 && cyc < 0.76 ? Math.abs(Math.sin(t * 1.6)) * 8 : 0;
      return R("g", null,
        R("defs", null,
          R("linearGradient", { id: "mp-dawn", x1: "0%", y1: "0%", x2: "0%", y2: "100%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent, 0.3) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent, 0.02) }))),
        /* the window and the light it lets in */
        R("g", null,
          R("rect", { x: 70, y: 20, width: W - 140, height: 250, rx: 8, fill: "url(#mp-dawn)", stroke: rgba(tint, 0.5), strokeWidth: 6 }),
          R("line", { x1: W / 2, y1: 20, x2: W / 2, y2: 270, stroke: rgba(tint, 0.4), strokeWidth: 5 }),
          R("line", { x1: 70, y1: 150, x2: W - 70, y2: 150, stroke: rgba(tint, 0.4), strokeWidth: 5 }),
          R("rect", { x: 50, y: 270, width: W - 100, height: 20, rx: 5, fill: rgba(tint, 0.55) }),
          R("path", { d: "M 120 292 L 470 292 L 700 " + table + " L -60 " + table + " Z", fill: rgba(theme.accent, 0.07) })),
        /* a shelf of jars, and a rack of pans hanging beside it */
        R("g", { opacity: 0.72 },
          R("rect", { x: 60, y: 320, width: 520, height: 16, rx: 5, fill: rgba(tint, 0.6) }),
          [0, 1, 2, 3, 4].map((i) => {
            const hgt = 62 + ((i * 37) % 3) * 26;
            return R("g", { key: "jr" + i },
              R("rect", { x: 96 + i * 96, y: 320 - hgt, width: 58, height: hgt, rx: 8, fill: rgba(i % 2 ? theme.accent2 : theme.accent, 0.28), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
              R("rect", { x: 92 + i * 96, y: 320 - hgt - 14, width: 66, height: 16, rx: 4, fill: rgba(tint, 0.55) }),
              R("rect", { x: 104 + i * 96, y: 320 - hgt * 0.5, width: 42, height: 10, rx: 3, fill: rgba(theme.surface, 0.5) }));
          }),
          R("g", { transform: "translate(" + (W - 470) + ",300)" },
            R("line", { x1: -110, y1: 0, x2: 110, y2: 0, stroke: rgba(tint, 0.55), strokeWidth: 6 }),
            [0, 1, 2].map((i) => R("g", { key: "pn" + i, transform: "translate(" + (-70 + i * 70) + ",0) rotate(" + (Math.sin(t * 0.8 + i) * 2).toFixed(2) + ")" },
              R("line", { x1: 0, y1: 0, x2: 0, y2: 30, stroke: rgba(tint, 0.5), strokeWidth: 4 }),
              R("circle", { cx: 0, cy: 62 + i * 6, r: 30 - i * 4, fill: rgba(tint, 0.4), stroke: rgba(tint, 0.6), strokeWidth: 4 }))))),
        /* the feeder, hanging in the margin */
        R("g", { transform: "translate(" + (W - 210) + ",980)" },
          R("line", { x1: 0, y1: -680, x2: 0, y2: 330, stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("path", { d: "M -74 330 h 148 l -18 40 h -112 z", fill: rgba(theme.accent2, 0.6), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("rect", { x: -46, y: 370, width: 92, height: 74, rx: 8, fill: rgba(theme.surface, inv ? 0.4 : 0.9), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          [0, 1, 2].map((i) => R("circle", { key: "sd" + i, cx: -22 + i * 22, cy: 420, r: 6, fill: rgba(theme.accent2, 0.8) }))),
        /* the robin */
        R("g", { opacity: inFly, transform: "translate(" + bx.toFixed(1) + "," + (by - hop).toFixed(1) + ") rotate(" + (peck * 26).toFixed(1) + ")" },
          R("ellipse", { cx: 0, cy: 0, rx: 40, ry: 34, fill: rgba(theme.inkMuted, 0.85) }),
          R("circle", { cx: 30, cy: -26, r: 22, fill: rgba(theme.inkMuted, 0.9) }),
          R("path", { d: "M 50 -26 l 26 6 l -26 8 z", fill: rgba(theme.accent2, 0.95) }),
          R("path", { d: "M -6 6 q 30 20 44 -6 q -18 26 -44 6 z", fill: rgba(theme.accent, 0.9) }),
          R("path", { d: "M -40 -4 q -34 12 -46 -8 q 26 -6 46 8 z", fill: rgba(theme.inkMuted, 0.7) }),
          R("circle", { cx: 38, cy: -30, r: 4, fill: rgba(theme.surface, 0.95) }),
          R("path", { d: "M -8 30 v 18 M 10 30 v 18", stroke: rgba(theme.accent2, 0.8), strokeWidth: 4, strokeLinecap: "round" })),
        /* a second bird waiting its turn on the line */
        (function () {
          const wc = (t % 9) / 9;
          const here = wc > 0.3 && wc < 0.95 ? 1 : 0;
          const bob = Math.abs(Math.sin(t * 2.2)) * 4;
          return R("g", { opacity: here * 0.85, transform: "translate(" + (W - 350) + "," + (1390 - bob).toFixed(1) + ") scale(0.78)" },
            R("ellipse", { cx: 0, cy: 0, rx: 38, ry: 30, fill: rgba(theme.inkMuted, 0.7) }),
            R("circle", { cx: 28, cy: -24, r: 20, fill: rgba(theme.inkMuted, 0.75) }),
            R("path", { d: "M 46 -24 l 24 6 l -24 8 z", fill: rgba(theme.accent2, 0.9) }),
            R("path", { d: "M -8 26 v 16 M 10 26 v 16", stroke: rgba(theme.accent2, 0.75), strokeWidth: 4, strokeLinecap: "round" }));
        })(),
        /* the table, a mug and a plant */
        R("line", { x1: 0, y1: table, x2: W, y2: table, stroke: rgba(tint, 0.5), strokeWidth: 8 }),
        R("rect", { x: 0, y: table, width: W, height: H - table, fill: rgba(theme.rule, 0.32) }),
        R("g", { transform: "translate(230," + table + ") scale(1.25)" },
          R("path", { d: "M -46 -66 h 92 l -10 66 h -72 z", fill: rgba(theme.surface, inv ? 0.45 : 0.95), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("path", { d: "M 46 -52 q 32 5 28 22 q -5 17 -30 15", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2].map((i) => {
            const ph = ((t * 0.45 + i * 0.34) % 1);
            const sw = Math.sin(t * 1.4 + i * 2) * 16;
            return R("path", { key: "st" + i, d: "M " + (-18 + i * 18) + " -80 q " + sw.toFixed(1) + " -50 " + (sw * 0.4).toFixed(1) + " -100", fill: "none", stroke: rgba(tint, 0.28 * (1 - ph)), strokeWidth: 7, strokeLinecap: "round", transform: "translate(0," + (-ph * 130).toFixed(1) + ")" });
          })),
        R("g", { transform: "translate(" + (W - 420) + "," + table + ")" },
          R("path", { d: "M -50 0 h 100 l -12 -74 h -76 z", fill: rgba(theme.accent, 0.55), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          [0, 1, 2, 3].map((i) => {
            const lean = Math.sin(t * 0.8 + i) * 8;
            return R("path", { key: "lf" + i, d: "M 0 -74 q " + (-60 + i * 40 + lean).toFixed(1) + " -50 " + (-30 + i * 22 + lean).toFixed(1) + " -120", fill: "none", stroke: rgba(theme.accent2, 0.7), strokeWidth: 7, strokeLinecap: "round" });
          })),
        /* a toaster that pops, and the notebook open on the table */
        R("g", { transform: "translate(" + (W - 250) + "," + table + ")" },
          R("rect", { x: -84, y: -110, width: 168, height: 110, rx: 14, fill: rgba(theme.surface, inv ? 0.4 : 0.94), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("rect", { x: -60, y: -122, width: 120, height: 14, rx: 6, fill: rgba(tint, 0.5) }),
          R("circle", { cx: 54, cy: -40, r: 12, fill: rgba(theme.accent, 0.85) }),
          (function () {
            const tc = (t % 10) / 10;
            const pop = tc < 0.12 ? Math.sin((tc / 0.12) * Math.PI) : 0;
            return [0, 1].map((i) => R("rect", { key: "ts" + i, x: -46 + i * 46, y: -136 - pop * 90, width: 36, height: 44, rx: 5, fill: rgba(theme.accent2, 0.75), opacity: 0.4 + pop * 0.6 }));
          })()),
        R("g", { transform: "translate(560," + table + ") rotate(-3)" },
          R("path", { d: "M -140 0 L -8 -12 L -8 -60 L -140 -46 Z", fill: rgba(theme.surface, inv ? 0.45 : 0.96), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("path", { d: "M 140 0 L 8 -12 L 8 -60 L 140 -46 Z", fill: rgba(theme.surface, inv ? 0.45 : 0.96), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          [0, 1, 2].map((i) => R("line", { key: "nl" + i, x1: -120, y1: -26 - i * 12, x2: -30, y2: -32 - i * 12, stroke: rgba(tint, 0.3), strokeWidth: 3 })),
          R("path", { d: "M -54 -16 L 118 -70 l 6 11 L -48 -5 z", fill: rgba(theme.accent, 0.8) })),
        /* a chair back in the foreground */
        R("g", null,
          R("path", { d: "M 60 " + H + " v -230 q 0 -46 110 -46 h 150 q 110 0 110 46 v 230 z", fill: rgba(theme.accent, 0.2), stroke: rgba(tint, 0.3), strokeWidth: 4 }),
          R("path", { d: "M 120 " + (H - 230) + " h 250", stroke: rgba(tint, 0.24), strokeWidth: 4 })),
        /* crumbs and dust */
        [0, 1, 2, 3, 4, 5].map((i) => {
          const ph = (t * (0.1 + i * 0.02) + i * 0.16) % 1;
          return R("circle", { key: "ds" + i, cx: 200 + i * 130 + Math.sin(t * 0.7 + i) * 30, cy: table - ph * 700, r: 3 + (i % 3) * 2, fill: rgba(theme.accent, 0.3 * (1 - ph)) });
        }));
    },
  });

  /* ── 22 SMALL TALK — two balconies, a tin-can line between them ── */
  FilmKit.make({
    global: "SmallTalk", brand: "Small Talk", desk: "#101a22", ambient: 1.7, chrome: false,
    FH: '"Gochi Hand", cursive',
    FB: '"Quicksand", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "bounce", itemPreset: "pop", titleLine: 1.06, titleSpace: "0",
    /* ladder: bg .87 / surface .96 / rule .73 / inkMuted .43 / ink .08 / accent .52 / accent2 .44 */
    palette: (t) => ({
      bg: t.bg || "#e6eef3", surface: "#f7fbfd", rule: "#c3d2da", inkMuted: "#6a767e",
      ink: "#141a1e", accent: t.accent || "#f08a3c", accent2: t.accent2 || "#7d6bd0", accentInk: "#f7fbfd",
    }),
    tweaks: [
      { k: "bg", label: "Sky", options: ["#e6eef3", "#e9f0f4", "#e4ecf2"] },
      { k: "accent", label: "Warm", options: ["#f08a3c", "#f05c5c", "#f0c03c"] },
      { k: "accent2", label: "Cool", options: ["#7d6bd0", "#3ca0d0", "#3cd0a0"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(180deg, " + rgba(theme.surface, 0.95) + " 0%, " + bg + " 52%, " + rgba(theme.accent2, 0.12) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M4 6h16v10H9l-5 4z" })),
    cams: ["pushL", "hopU", "pushR", "zoomIn", "drop", "zoomOut"], camMul: 5, camOff: 3,
    mag: { rot: 0.8, driftX: 9, driftY: 8, driftZ: 0.04, slide: 0.26, inn: 0.18, zin: 0.36, zout: 0.32 },
    variants: { Scroll: "board", Typing: "caret", Ring: "ring" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 124, kicker: { v: "tag", bg: "accent", c: "accentInk" } },
      statement: { bg: "accent2", fg: "accentInk", hi: "accent", world: true, top: 610, size: 136 },
      body: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 540, size: 96, bodySize: 38, ch: 54, lh: 1.54, weight: 500, dim: 0.9, kicker: { v: "bare", c: "accent2" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 104, ch: 26, lh: 1.08, markSize: 230 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 104, swap: "quote", card: { v: "tilt", bg: "surface", r: 20, line: "inkMuted" }, chips: { v: "pill", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 330, size: 98, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 20, h: 640, labelSize: 48 }, tilts: [-2, 2, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 100, cols: ["accent", "accent2", "ink"], num: 152 },
      cta: { bg: "ink", fg: "surface", hi: "accent", world: true, top: 470, size: 118, align: "left", btn: { v: "pill", bg: "accent", c: "accentInk" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent2", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — two balconies across a gap. Far: rooftops and a cloud drift. Mid:
       railings either side, laundry on a line, plant pots, and a tin-can
       telephone whose string sags and tightens while a paper note travels along
       it on a 7s trip. Near: bubbles rising. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const rail = H - 330;
      const cyc = (t % 7) / 7;
      const trip = E.inOut(Math.min(1, cyc / 0.72));
      const sag = 90 - 40 * Math.sin(trip * Math.PI);
      const nx = 120 + trip * (W - 240);
      const ny = rail - 200 + Math.sin(trip * Math.PI) * sag * 0.6;
      const roofs = (t * 7) % 300;
      return R("g", null,
        R("defs", null,
          R("radialGradient", { id: "sm-sun", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent, 0.24) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent, 0) }))),
        R("circle", { cx: W * 0.78, cy: 300, r: 380, fill: "url(#sm-sun)" }),
        /* clouds drifting above the copy, and a kite on a long string */
        R("g", { opacity: 0.75 },
          [0, 1, 2].map((i) => {
            const cxp = ((i * 430 - (t * (8 + i * 5)) % 430) % (W + 460)) - 230;
            const cyp = 70 + i * 52;
            return R("g", { key: "cd" + i, transform: "translate(" + cxp.toFixed(1) + "," + cyp + ")" },
              R("path", { d: "M -110 0 q 8 -42 58 -34 q 18 -40 72 -24 q 50 -10 58 32 q 30 4 26 26 z", fill: rgba(theme.accent2, 0.16 - i * 0.03), stroke: rgba(theme.accent2, 0.34), strokeWidth: 4 }),
              R("path", { d: "M -110 0 h 236", stroke: rgba(theme.accent2, 0.22), strokeWidth: 4 }));
          }),
          (function () {
            const kc = (t % 16) / 16;
            const kx = 180 + Math.sin(kc * Math.PI * 2) * 300;
            const ky = 130 + Math.cos(kc * Math.PI * 4) * 60;
            const tilt = Math.sin(kc * Math.PI * 2) * 18;
            return R("g", null,
              R("path", { d: "M " + kx.toFixed(1) + " " + (ky + 60).toFixed(1) + " q -60 180 -30 380", fill: "none", stroke: rgba(tint, 0.4), strokeWidth: 3 }),
              R("g", { transform: "translate(" + kx.toFixed(1) + "," + ky.toFixed(1) + ") rotate(" + tilt.toFixed(1) + ")" },
                R("path", { d: "M 0 -46 L 34 0 L 0 60 L -34 0 z", fill: rgba(theme.accent, 0.8), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
                R("path", { d: "M -34 0 h 68 M 0 -46 v 106", stroke: rgba(theme.accentInk, 0.25), strokeWidth: 3 }),
                [0, 1, 2].map((i) => R("path", { key: "kt" + i, d: "M 0 60 q " + (14 + Math.sin(t * 3 + i) * 10).toFixed(1) + " " + (30 + i * 26) + " " + (-8 + Math.sin(t * 2 + i) * 12).toFixed(1) + " " + (56 + i * 30), fill: "none", stroke: rgba(theme.accent2, 0.6), strokeWidth: 4, strokeLinecap: "round" }))));
          })()),
        /* rooftops, drifting */
        R("g", { opacity: 0.4, transform: "translate(" + (-roofs).toFixed(1) + ",0)" },
          [0, 1, 2, 3, 4, 5].map((i) => {
            const hgt = 150 + (i % 3) * 90;
            return R("g", { key: "rf" + i },
              R("rect", { x: 40 + i * 260, y: rail - hgt, width: 200, height: hgt, fill: rgba(theme.accent2, 0.3) }),
              R("path", { d: "M " + (30 + i * 260) + " " + (rail - hgt) + " h 220 l -30 -40 h -160 z", fill: rgba(theme.accent2, 0.4) }),
              R("rect", { x: 90 + i * 260, y: rail - hgt + 50, width: 40, height: 50, fill: rgba(theme.accent, 0.5) }));
          })),
        /* the two balconies */
        [0, 1].map((side) => R("g", { key: "bl" + side, transform: side ? "translate(" + W + ",0) scale(-1,1)" : "" },
          R("rect", { x: -20, y: rail, width: 250, height: 26, rx: 6, fill: rgba(tint, 0.6) }),
          R("rect", { x: -20, y: rail + 26, width: 250, height: H - rail, fill: rgba(theme.rule, 0.34) }),
          Array.from({ length: 6 }).map((_, i) => R("line", { key: "rb" + i, x1: 10 + i * 42, y1: rail, x2: 10 + i * 42, y2: rail - 130, stroke: rgba(tint, 0.55), strokeWidth: 6 })),
          R("line", { x1: -20, y1: rail - 130, x2: 230, y2: rail - 130, stroke: rgba(tint, 0.5), strokeWidth: 6 }),
          R("g", { transform: "translate(160," + (rail - 10) + ")" },
            R("path", { d: "M -34 0 h 68 l -8 -56 h -52 z", fill: rgba(theme.accent, 0.6), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
            [0, 1, 2].map((i) => R("path", { key: "pl" + i, d: "M 0 -56 q " + (-40 + i * 40 + Math.sin(t * 0.9 + i + side) * 8).toFixed(1) + " -40 " + (-20 + i * 20).toFixed(1) + " -90", fill: "none", stroke: rgba(theme.accent2, 0.7), strokeWidth: 6, strokeLinecap: "round" }))))),
        /* window boxes on the far wall, and a cat watching from a sill */
        R("g", { opacity: 0.6 },
          [0, 1].map((i) => R("g", { key: "wb" + i, transform: "translate(" + (330 + i * 400) + "," + (rail - 470) + ")" },
            R("rect", { x: -90, y: -150, width: 180, height: 150, rx: 6, fill: rgba(theme.surface, 0.45), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
            R("rect", { x: -100, y: 0, width: 200, height: 34, rx: 5, fill: rgba(theme.accent2, 0.55) }),
            [0, 1, 2, 3].map((j) => R("circle", { key: "fl" + j, cx: -66 + j * 44, cy: -10 + Math.sin(t * 1.1 + j + i) * 3, r: 13, fill: rgba(j % 2 ? theme.accent : theme.accent2, 0.75) })))),
          R("g", { transform: "translate(" + (W * 0.5) + "," + (rail - 300) + ") scale(1," + (1 + Math.sin(t * 0.9) * 0.03).toFixed(3) + ")" },
            R("path", { d: "M -62 0 q -8 -46 30 -54 q 44 -8 64 20 q 14 22 -4 34 z", fill: rgba(tint, 0.55) }),
            R("path", { d: "M 22 -36 l 7 -18 l 12 13 z", fill: rgba(tint, 0.55) }),
            R("path", { d: "M -62 0 q -30 -12 -40 4 q 18 8 40 -4 z", fill: rgba(tint, 0.45) }))),
        /* laundry on a line, above the string */
        R("path", { d: "M 100 " + (rail - 420) + " q " + (W / 2 - 100) + " " + (70 + Math.sin(t * 0.6) * 10) + " " + (W - 200) + " 0", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 4 }),
        [0, 1, 2, 3].map((i) => {
          const lx = 200 + i * 200;
          const sway = Math.sin(t * 1.2 + i * 0.9) * 5;
          return R("g", { key: "lw" + i, transform: "translate(" + lx + "," + (rail - 400 + (i === 1 || i === 2 ? 26 : 14)) + ") rotate(" + sway.toFixed(2) + ")" },
            R("path", { d: "M -34 0 h 68 v 90 q -34 16 -68 0 z", fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.5) }),
            R("circle", { cx: 0, cy: -6, r: 6, fill: rgba(tint, 0.6) }));
        }),
        /* the tin-can line, and the note travelling it */
        R("path", { d: "M 120 " + (rail - 200) + " q " + (W / 2 - 120) + " " + sag.toFixed(1) + " " + (W - 240) + " 0", fill: "none", stroke: rgba(tint, 0.6), strokeWidth: 4 }),
        [0, 1].map((i) => R("g", { key: "cn" + i, transform: "translate(" + (i ? W - 120 : 120) + "," + (rail - 200) + ")" },
          R("rect", { x: -26, y: -34, width: 52, height: 68, rx: 8, fill: rgba(theme.surface, inv ? 0.4 : 0.95), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("ellipse", { cx: 0, cy: -34, rx: 26, ry: 8, fill: rgba(theme.accent, 0.6) }))),
        R("g", { transform: "translate(" + nx.toFixed(1) + "," + ny.toFixed(1) + ") rotate(" + (Math.sin(t * 3) * 12).toFixed(1) + ")" },
          R("path", { d: "M -26 -18 h 52 v 36 h -52 z", fill: rgba(theme.surface, inv ? 0.5 : 0.98), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("path", { d: "M -26 -18 L 0 2 L 26 -18", fill: "none", stroke: rgba(theme.accent, 0.8), strokeWidth: 3 })),
        /* a watering can on the ledge, and a pigeon dropping in */
        R("g", { transform: "translate(230," + (rail - 6) + ")" },
          R("path", { d: "M -30 0 h 60 l -8 -52 h -44 z", fill: rgba(theme.accent2, 0.65), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("path", { d: "M 22 -40 q 30 -6 26 -30", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 5, strokeLinecap: "round" }),
          R("path", { d: "M -28 -34 l -32 -14 l 4 -10 l 32 12 z", fill: rgba(theme.accent2, 0.55) })),
        (function () {
          const pc = (t % 12) / 12;
          const arrive = pc < 0.2 ? pc / 0.2 : 1;
          const px = W - 300 + (1 - arrive) * 300, py = rail - 40 - (1 - arrive) * 220;
          const bob = arrive > 0.9 ? Math.abs(Math.sin(t * 4)) * 5 : 0;
          return R("g", { transform: "translate(" + px.toFixed(1) + "," + (py - bob).toFixed(1) + ")" },
            R("ellipse", { cx: 0, cy: -18, rx: 30, ry: 20, fill: rgba(tint, 0.6) }),
            R("circle", { cx: 24, cy: -36, r: 13, fill: rgba(tint, 0.65) }),
            R("path", { d: "M 36 -36 l 16 4 l -16 6 z", fill: rgba(theme.accent, 0.85) }),
            R("path", { d: "M -6 2 v 12 M 8 2 v 12", stroke: rgba(theme.accent, 0.7), strokeWidth: 4, strokeLinecap: "round" }));
        })(),
        /* bubbles */
        [0, 1, 2, 3, 4, 5].map((i) => {
          const ph = (t * (0.18 + i * 0.03) + i * 0.17) % 1;
          return R("circle", { key: "bb" + i, cx: 140 + i * 160 + Math.sin(t * 1.1 + i) * 40, cy: H - ph * (H + 160), r: 8 + (i % 3) * 6, fill: "none", stroke: rgba(theme.accent2, 0.3 * (1 - ph)), strokeWidth: 3 });
        }));
    },
  });

  /* ── 23 HOME DESK — a corner of the flat, a desk fan oscillating ── */
  FilmKit.make({
    global: "HomeDesk", brand: "Home Desk", desk: "#181712", ambient: 1.6, chrome: false,
    FH: '"Neucha", cursive',
    FB: '"Cabin", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "rise", itemPreset: "rise", titleLine: 1.08, titleSpace: "0",
    /* ladder: bg .87 / surface .96 / rule .73 / inkMuted .43 / ink .08 / accent .42 / accent2 .5 */
    palette: (t) => ({
      bg: t.bg || "#efeadf", surface: "#fbf9f4", rule: "#d0c9ba", inkMuted: "#6f6a5f",
      ink: "#1a1813", accent: t.accent || "#2f7d78", accent2: t.accent2 || "#c9743c", accentInk: "#fbf9f4",
    }),
    tweaks: [
      { k: "bg", label: "Oat", options: ["#efeadf", "#f1ede3", "#ece8dd"] },
      { k: "accent", label: "Teal", options: ["#2f7d78", "#2f5f7d", "#5f7d2f"] },
      { k: "accent2", label: "Rust", options: ["#c9743c", "#c93c5a", "#c9a43c"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(176deg, " + rgba(theme.surface, 0.92) + " 0%, " + bg + " 46%, " + rgba(theme.rule, 0.42) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("circle", { cx: 12, cy: 10, r: 7 }), R2("path", { d: "M12 17v4M8 21h8M12 10h.01" })),
    cams: ["pushU", "zoomIn", "pushL", "drop", "pushR", "zoomOut"], camMul: 7, camOff: 4,
    mag: { rot: 0.4, driftX: 6, driftY: 7, driftZ: 0.04, slide: 0.2, inn: 0.2, zin: 0.32, zout: 0.28 },
    variants: { Scroll: "feed", Typing: "typewriter", Ring: "bar" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 118, kicker: { v: "bare", c: "accent" } },
      statement: { bg: "accent", fg: "accentInk", hi: "accent2", world: true, top: 610, size: 130 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 92, bodySize: 38, ch: 54, lh: 1.54, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 360, size: 100, ch: 26, lh: 1.12, markSize: 230 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 100, swap: "body", card: { v: "frame", bg: "surface", r: 14, line: "inkMuted" }, chips: { v: "outline", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 330, size: 94, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 14, h: 640, labelSize: 46 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 96, cols: ["accent", "accent2", "ink"], num: 148, rule: true },
      cta: { bg: "ink", fg: "surface", hi: "accent2", world: true, top: 470, size: 112, align: "left", btn: { v: "block", bg: "accent2", c: "accentInk" }, logoShape: "rounded" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — the corner you work in. Far: a shelf of plants and mugs, a cork
       board with pinned scraps. Mid: a desk fan whose head sweeps a 6s arc while
       the blades spin much faster, a keyboard, a mug, a cable tangle that sways
       in the draught. Near: dust. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const desk = H - 300;
      const sweep = Math.sin((t / 6) * Math.PI * 2) * 26;
      const blade = (t * 900) % 360;
      const draught = Math.sin((t / 6) * Math.PI * 2 - 0.5);
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "hd-cork", width: 16, height: 16, patternUnits: "userSpaceOnUse" },
            R("circle", { cx: 8, cy: 8, r: 2, fill: rgba(theme.accent2, inv ? 0.2 : 0.28) }))),
        /* a window with a half-drawn blind, above the shelf */
        R("g", { opacity: 0.7 },
          R("rect", { x: 90, y: -30, width: 420, height: 240, rx: 8, fill: rgba(theme.accent, 0.1), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("line", { x1: 300, y1: -30, x2: 300, y2: 210, stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("rect", { x: 90, y: -30, width: 420, height: 90 + (Math.sin(t * 0.35) * 0.5 + 0.5) * 60, rx: 6, fill: rgba(tint, 0.42) }),
          R("line", { x1: 90, y1: 60 + (Math.sin(t * 0.35) * 0.5 + 0.5) * 60, x2: 510, y2: 60 + (Math.sin(t * 0.35) * 0.5 + 0.5) * 60, stroke: rgba(tint, 0.6), strokeWidth: 5 })),
        /* a plant hanging in the right margin */
        R("g", { transform: "translate(" + (W - 110) + ",60) rotate(" + (Math.sin(t * 0.6) * 2).toFixed(2) + ")" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: 150, stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("path", { d: "M -54 150 h 108 l -16 70 h -76 z", fill: rgba(theme.accent2, 0.55), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          [0, 1, 2, 3].map((i) => R("path", { key: "tr" + i, d: "M " + (-30 + i * 20) + " 220 q " + (Math.sin(t * 0.8 + i) * 14).toFixed(1) + " " + (120 + i * 40) + " " + (-14 + i * 12).toFixed(1) + " " + (240 + i * 70), fill: "none", stroke: rgba(theme.accent, 0.6), strokeWidth: 6, strokeLinecap: "round" }))),
        /* shelf of plants and mugs, above the copy */
        R("g", null,
          R("rect", { x: 60, y: 250, width: W - 120, height: 18, rx: 5, fill: rgba(tint, 0.6) }),
          [0, 1, 2, 3].map((i) => R("g", { key: "pt" + i, transform: "translate(" + (150 + i * 230) + ",250)" },
            R("path", { d: "M -40 0 h 80 l -10 -60 h -60 z", fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.5), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
            [0, 1, 2].map((j) => R("path", { key: "lf" + j, d: "M 0 -60 q " + (-46 + j * 46 + Math.sin(t * 0.7 + i + j) * 7).toFixed(1) + " -44 " + (-22 + j * 22).toFixed(1) + " -100", fill: "none", stroke: rgba(theme.accent, 0.65), strokeWidth: 6, strokeLinecap: "round" })))),
          R("rect", { x: W - 300, y: 190, width: 60, height: 60, rx: 8, fill: rgba(theme.accent2, 0.5) })),
        /* cork board in the margin */
        R("g", { transform: "translate(" + (W - 130) + ",1120)" },
          R("rect", { x: -110, y: -190, width: 220, height: 380, rx: 8, fill: "url(#hd-cork)", stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2, 3].map((i) => {
            const sw = Math.sin(t * 1.1 + i * 1.5) * 2.4 + draught * 3;
            return R("g", { key: "sc" + i, transform: "translate(" + (-52 + (i % 2) * 104) + "," + (-110 + Math.floor(i / 2) * 190) + ") rotate(" + sw.toFixed(2) + ")" },
              R("rect", { x: -42, y: -50, width: 84, height: 104, rx: 3, fill: rgba(theme.surface, inv ? 0.5 : 0.95), stroke: rgba(tint, 0.3), strokeWidth: 2 }),
              R("rect", { x: -28, y: -32, width: 56, height: 8, rx: 4, fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.7) }),
              R("circle", { cx: 0, cy: -50, r: 5, fill: rgba(theme.accent2, 0.9) }));
          })),
        /* the desk */
        R("line", { x1: 0, y1: desk, x2: W, y2: desk, stroke: rgba(tint, 0.55), strokeWidth: 8 }),
        R("rect", { x: 0, y: desk, width: W, height: H - desk, fill: rgba(theme.rule, 0.3) }),
        /* keyboard, mug, cable tangle */
        R("g", { transform: "translate(300," + desk + ")" },
          R("path", { d: "M -170 0 h 340 l -18 -44 h -304 z", fill: rgba(theme.surface, inv ? 0.4 : 0.92), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
          [0, 1, 2].map((r) => Array.from({ length: 11 }).map((_, i) => R("rect", { key: "ky" + r + i, x: -142 + i * 27 + r * 6, y: -38 + r * 12, width: 20, height: 9, rx: 2, fill: rgba(tint, 0.35) })))),
        R("g", { transform: "translate(" + (W - 400) + "," + desk + ") scale(1.1)" },
          R("path", { d: "M -40 0 h 80 l -8 -58 h -64 z", fill: rgba(theme.accent2, 0.5), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
          R("path", { d: "M 40 -44 q 28 4 24 20 q -4 15 -26 13", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 4 })),
        R("path", { d: "M 60 " + (desk + 60) + " q " + (120 + draught * 40).toFixed(1) + " 70 240 10 q " + (120 - draught * 40).toFixed(1) + " -60 240 20", fill: "none", stroke: rgba(tint, 0.4), strokeWidth: 7, strokeLinecap: "round" }),
        /* a monitor and a desk lamp */
        R("g", { transform: "translate(" + (W * 0.28) + "," + (desk - 6) + ")" },
          R("path", { d: "M -30 0 h 60 l 10 -40 h -80 z", fill: rgba(tint, 0.6) }),
          R("rect", { x: -190, y: -300, width: 380, height: 262, rx: 12, fill: rgba(theme.ink, 0.86), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("rect", { x: -168, y: -278, width: 336, height: 218, rx: 6, fill: rgba(theme.accent, 0.18) }),
          [0, 1, 2, 3].map((i) => R("rect", { key: "ml" + i, x: -140, y: -250 + i * 44, width: 220 - (i % 2) * 70, height: 12, rx: 6, fill: rgba(theme.surface, 0.3) })),
          R("rect", { x: -140, y: -250 + ((t * 40) % 176), width: 260, height: 8, rx: 4, fill: rgba(theme.accent2, 0.4) })),
        R("g", { transform: "translate(" + (W - 250) + "," + (desk - 6) + ")" },
          R("path", { d: "M -40 0 h 80 l -12 -22 h -56 z", fill: rgba(tint, 0.55) }),
          R("path", { d: "M 0 -22 v -150 q 0 -40 66 -52", fill: "none", stroke: rgba(tint, 0.55), strokeWidth: 8 }),
          R("path", { d: "M 46 -238 h 80 l -20 60 h -50 z", fill: rgba(theme.accent2, 0.7) }),
          R("circle", { cx: 82, cy: -172, r: 14 + Math.sin(t * 2) * 2, fill: rgba(theme.accent, 0.85) }),
          R("path", { d: "M 24 -172 L 140 -172 L 210 30 L -50 30 Z", fill: rgba(theme.accent, 0.04) })),
        /* the fan */
        R("g", { transform: "translate(" + (W * 0.62) + "," + (desk - 10) + ")" },
          R("ellipse", { cx: 0, cy: 8, rx: 90, ry: 14, fill: rgba(theme.ink, 0.18) }),
          R("path", { d: "M -60 0 h 120 l -16 -30 h -88 z", fill: rgba(theme.accent, 0.75) }),
          R("line", { x1: 0, y1: -30, x2: 0, y2: -120, stroke: rgba(tint, 0.6), strokeWidth: 10 }),
          R("g", { transform: "translate(0,-190) rotate(" + sweep.toFixed(2) + ")" },
            R("circle", { r: 92, fill: "none", stroke: rgba(theme.accent, 0.8), strokeWidth: 8 }),
            R("circle", { r: 70, fill: "none", stroke: rgba(tint, 0.35), strokeWidth: 4 }),
            R("g", { transform: "rotate(" + blade.toFixed(1) + ")" },
              [0, 1, 2, 3].map((i) => R("ellipse", { key: "bd" + i, cx: Math.cos(i * 1.571) * 44, cy: Math.sin(i * 1.571) * 44, rx: 40, ry: 17, fill: rgba(theme.surface, inv ? 0.35 : 0.7), transform: "rotate(" + (i * 90 + 30) + " " + (Math.cos(i * 1.571) * 44).toFixed(1) + " " + (Math.sin(i * 1.571) * 44).toFixed(1) + ")" }))),
            R("circle", { r: 18, fill: rgba(theme.accent2, 0.9) }))),
        /* a chair back and a rug in the foreground */
        R("g", null,
          R("path", { d: "M " + (W * 0.34) + " " + H + " v -200 q 0 -50 130 -50 h 120 q 130 0 130 50 v 200 z", fill: rgba(theme.accent, 0.22), stroke: rgba(tint, 0.3), strokeWidth: 4 }),
          R("path", { d: "M " + (W * 0.34 + 60) + " " + (H - 200) + " h 300", stroke: rgba(tint, 0.24), strokeWidth: 4 })),
        R("ellipse", { cx: W * 0.3, cy: H - 60, rx: 320, ry: 54, fill: rgba(theme.accent2, 0.16) }),
        /* dust in the draught */
        [0, 1, 2, 3, 4, 5, 6].map((i) => {
          const ph = (t * (0.2 + i * 0.04) + i * 0.15) % 1;
          return R("circle", { key: "dt" + i, cx: W * 0.62 - 200 - ph * 420 + draught * 60, cy: desk - 190 + Math.sin(t * 2 + i) * 60, r: 3 + (i % 3) * 2, fill: rgba(tint, 0.3 * (1 - ph)) });
        }));
    },
  });

  /* ── 24 CORNER SHOP — a shopfront, a sack trolley of crates wheeled past ── */
  FilmKit.make({
    global: "CornerShop", brand: "Corner Shop", desk: "#1a1508", ambient: 1.8, chrome: false,
    FH: '"Lobster Two", cursive',
    FB: '"Hind", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "slam", itemPreset: "pop", titleLine: 1.04, titleSpace: "0",
    /* ladder: bg .88 / surface .96 / rule .74 / inkMuted .44 / ink .08 / accent .46 / accent2 .42 */
    palette: (t) => ({
      bg: t.bg || "#f5ecd8", surface: "#fdf8ec", rule: "#d8c9a6", inkMuted: "#756a51",
      ink: "#1b1810", accent: t.accent || "#d1462f", accent2: t.accent2 || "#4f8a3c", accentInk: "#fdf8ec",
    }),
    tweaks: [
      { k: "bg", label: "Butter", options: ["#f5ecd8", "#f7efde", "#f2ead6"] },
      { k: "accent", label: "Tomato", options: ["#d1462f", "#d17a2f", "#b02f6a"] },
      { k: "accent2", label: "Leaf", options: ["#4f8a3c", "#3c8a7a", "#8a7a3c"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(100% 55% at 30% 4%, " + rgba(theme.accent2, 0.16) + " 0%, transparent 60%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M4 8h16l-2 12H6zM8 8V5a4 4 0 018 0v3" })),
    cams: ["hopU", "pushR", "spin", "pushL", "drop", "zoomIn"], camMul: 3, camOff: 1,
    mag: { rot: 0.9, driftX: 8, driftY: 8, driftZ: 0.04, slide: 0.26, inn: 0.18, zin: 0.36, zout: 0.3 },
    variants: { Scroll: "board", Typing: "hand", Ring: "bar" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 120, kicker: { v: "tag", bg: "accent", c: "accentInk" } },
      statement: { bg: "ink", fg: "surface", hi: "accent", world: true, top: 610, size: 132 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 94, bodySize: 38, ch: 54, lh: 1.54, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent2" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 102, ch: 26, lh: 1.1, markSize: 230 },
      feature: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 255, size: 102, swap: "quote", card: { v: "tilt", bg: "surface", r: 16, line: "inkMuted" }, chips: { v: "pill", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: 96, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 16, h: 640, labelSize: 48 }, tilts: [-2, 2, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 98, cols: ["accent", "accent2", "ink"], num: 150, rule: true },
      cta: { bg: "accent", fg: "accentInk", hi: "ink", world: true, top: 470, size: 114, align: "left", btn: { v: "pill", bg: "ink", c: "accentInk" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — the shopfront at opening. Far: the terrace above and a hanging
       sign that swings. Mid: a striped awning, crates of produce on the
       pavement with price cards, and a sack trolley of crates wheeled past on a
       11s traverse — wheels turn at travel speed, the load leans on the tilt.
       Near: a pigeon and a few leaves. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const kerb = H - 290;
      const cyc = (t % 11) / 11;
      const tx = -240 + E.inOut(Math.min(1, cyc / 0.9)) * (W + 480);
      const whl = (tx / 30) * 57.3;
      const lean = 12 + Math.sin(t * 2.4) * 2;
      return R("g", null,
        /* the building above, and a hanging sign */
        R("g", { opacity: 0.5 },
          R("rect", { x: 40, y: -40, width: W - 80, height: 300, fill: rgba(theme.accent2, 0.16) }),
          [0, 1, 2].map((i) => R("rect", { key: "wn" + i, x: 120 + i * 280, y: 40, width: 120, height: 150, rx: 6, fill: rgba(theme.surface, 0.5), stroke: rgba(tint, 0.4), strokeWidth: 4 }))),
        R("g", { transform: "translate(" + (W - 170) + ",270) rotate(" + (Math.sin(t * 1.1) * 6).toFixed(2) + ")" },
          R("line", { x1: 0, y1: -40, x2: 0, y2: 0, stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("rect", { x: -80, y: 0, width: 160, height: 90, rx: 8, fill: rgba(theme.accent, 0.85) }),
          R("rect", { x: -56, y: 30, width: 112, height: 14, rx: 7, fill: rgba(theme.accentInk, 0.55) }),
          R("rect", { x: -40, y: 54, width: 80, height: 10, rx: 5, fill: rgba(theme.accentInk, 0.35) })),
        /* bunting strung across the street, above the copy */
        R("g", null,
          R("path", { d: "M -20 130 q " + (W / 2) + " " + (90 + Math.sin(t * 0.7) * 12).toFixed(1) + " " + (W + 40) + " 20", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          Array.from({ length: 9 }).map((_, i) => {
            const bxp = 60 + i * ((W - 120) / 8);
            const byp = 130 + Math.sin((i / 8) * Math.PI) * (76 + Math.sin(t * 0.7) * 10) - (i / 8) * 110;
            const sway = Math.sin(t * 1.4 + i * 0.6) * 5;
            return R("path", { key: "bt" + i, d: "M -22 0 h 44 l -22 44 z", fill: rgba(i % 3 === 0 ? theme.accent : (i % 3 === 1 ? theme.accent2 : tint), 0.6), transform: "translate(" + bxp.toFixed(1) + "," + byp.toFixed(1) + ") rotate(" + sway.toFixed(2) + ")" });
          })),
        /* the awning */
        R("g", null,
          R("path", { d: "M 20 320 h " + (W - 40) + " l -40 120 h " + (-(W - 120)) + " z", fill: rgba(theme.accent, 0.5) }),
          Array.from({ length: 9 }).map((_, i) => R("path", { key: "aw" + i, d: "M " + (20 + i * ((W - 40) / 9)) + " 320 h " + ((W - 40) / 18) + " l -" + ((W - 40) / 18 - 20) + " 120 h -" + ((W - 40) / 18) + " z", fill: rgba(theme.surface, 0.35) })),
          R("path", { d: "M 60 440 h " + (W - 120), stroke: rgba(tint, 0.4), strokeWidth: 5 })),
        /* a chalkboard by the door, and a bike leaning on the wall */
        R("g", { transform: "translate(" + (W - 150) + ",1130) rotate(-2)" },
          R("rect", { x: -108, y: -170, width: 216, height: 340, rx: 8, fill: rgba(theme.ink, 0.82), stroke: rgba(theme.accent2, 0.5), strokeWidth: 6 }),
          [0, 1, 2, 3].map((i) => R("line", { key: "cb" + i, x1: -80, y1: -110 + i * 74, x2: 40 + (i % 2) * 40, y2: -110 + i * 74, stroke: rgba(theme.surface, 0.6 - i * 0.08), strokeWidth: 6, strokeLinecap: "round" })),
          R("path", { d: "M -70 130 q 60 -30 140 -8", fill: "none", stroke: rgba(theme.accent, 0.8), strokeWidth: 5 })),
        R("g", { opacity: 0.6, transform: "translate(150,1250) rotate(-6)" },
          [-64, 64].map((wx, i) => R("circle", { key: "bw" + i, cx: wx, cy: 0, r: 46, fill: "none", stroke: rgba(tint, 0.65), strokeWidth: 6 })),
          R("path", { d: "M -64 0 L -6 0 L 30 -74 L 64 0 M -6 0 L 30 -74 M -6 0 L 6 -70 L 30 -74", fill: "none", stroke: rgba(theme.accent2, 0.7), strokeWidth: 7, strokeLinejoin: "round" }),
          R("path", { d: "M 6 -70 q -30 -6 -40 8", fill: "none", stroke: rgba(tint, 0.6), strokeWidth: 6, strokeLinecap: "round" })),
        /* crates of produce with price cards */
        [0, 1, 2].map((i) => R("g", { key: "cr" + i, transform: "translate(" + (170 + i * 300) + "," + (kerb - 6) + ")" },
          R("path", { d: "M -84 0 h 168 v -84 h -168 z", fill: "none", stroke: rgba(tint, 0.55), strokeWidth: 5 }),
          R("path", { d: "M -84 -42 h 168", stroke: rgba(tint, 0.35), strokeWidth: 4 }),
          [0, 1, 2, 3, 4].map((j) => R("circle", { key: "fr" + j, cx: -60 + j * 30, cy: -100 - (j % 2) * 18, r: 22, fill: rgba(j % 2 ? theme.accent : theme.accent2, 0.7) })),
          R("g", { transform: "translate(70,-150) rotate(" + (Math.sin(t * 1.4 + i) * 5).toFixed(2) + ")" },
            R("rect", { x: -34, y: 0, width: 68, height: 44, rx: 4, fill: rgba(theme.surface, inv ? 0.5 : 0.96), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
            R("rect", { x: -22, y: 14, width: 44, height: 10, rx: 5, fill: rgba(theme.accent, 0.8) })))),
        /* the pavement */
        R("line", { x1: 0, y1: kerb, x2: W, y2: kerb, stroke: rgba(tint, 0.6), strokeWidth: 7 }),
        R("rect", { x: 0, y: kerb, width: W, height: H - kerb, fill: rgba(theme.rule, 0.3) }),
        /* the sack trolley */
        R("g", { transform: "translate(" + tx.toFixed(1) + "," + kerb + ") rotate(" + (-lean).toFixed(2) + ")" },
          R("ellipse", { cx: 0, cy: 10, rx: 90, ry: 12, fill: rgba(theme.ink, 0.18) }),
          R("path", { d: "M -30 0 v -260 M 30 0 v -260", stroke: rgba(tint, 0.65), strokeWidth: 9 }),
          R("path", { d: "M -40 -10 h 80", stroke: rgba(tint, 0.6), strokeWidth: 9 }),
          R("path", { d: "M -30 -260 q 0 -40 40 -40", fill: "none", stroke: rgba(tint, 0.6), strokeWidth: 9 }),
          [0, 1, 2].map((i) => R("g", { key: "lc" + i },
            R("path", { d: "M -66 " + (-30 - i * 76) + " h 132 v -70 h -132 z", fill: rgba(theme.surface, inv ? 0.45 : 0.94), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
            [0, 1, 2].map((j) => R("circle", { key: "pf" + j, cx: -40 + j * 40, cy: -66 - i * 76, r: 16, fill: rgba(j % 2 ? theme.accent2 : theme.accent, 0.6) })))),
          [-46, 46].map((wx, i) => R("g", { key: "wl" + i, transform: "translate(" + wx + ",-4) rotate(" + whl.toFixed(1) + ")" },
            R("circle", { r: 30, fill: "none", stroke: rgba(theme.ink, 0.8), strokeWidth: 8 }),
            R("path", { d: "M -30 0 h 60 M 0 -30 v 60", stroke: rgba(theme.ink, 0.4), strokeWidth: 4 })))),
        /* the shop window: a cat asleep on the sill, and the OPEN sign */
        R("g", { transform: "translate(" + (W * 0.62) + "," + (kerb - 240) + ")" },
          R("rect", { x: -200, y: -220, width: 400, height: 220, rx: 8, fill: rgba(theme.surface, inv ? 0.2 : 0.5), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("line", { x1: 0, y1: -220, x2: 0, y2: 0, stroke: rgba(tint, 0.35), strokeWidth: 4 }),
          R("g", { transform: "translate(-96,-20) scale(1," + (1 + Math.sin(t * 0.9) * 0.03).toFixed(3) + ")" },
            R("path", { d: "M -70 0 q -9 -52 34 -60 q 50 -9 72 22 q 16 24 -5 38 z", fill: rgba(tint, 0.6) }),
            R("path", { d: "M 24 -40 l 8 -20 l 14 15 z", fill: rgba(tint, 0.6) }),
            R("path", { d: "M -70 0 q -34 -14 -44 5 q 20 8 44 -5 z", fill: rgba(tint, 0.5) })),
          R("g", { transform: "translate(96,-150) rotate(" + (Math.sin(t * 1.6) * 7).toFixed(2) + ")" },
            R("line", { x1: 0, y1: -30, x2: 0, y2: 0, stroke: rgba(tint, 0.5), strokeWidth: 4 }),
            R("rect", { x: -54, y: 0, width: 108, height: 54, rx: 5, fill: rgba(theme.accent, 0.85) }),
            R("rect", { x: -36, y: 20, width: 72, height: 12, rx: 6, fill: rgba(theme.accentInk, 0.6) }))),
        /* a pigeon and some leaves */
        (function () {
          const pc = (t % 8) / 8;
          const px = 700 + Math.sin(pc * Math.PI * 2) * 120;
          const bob = Math.abs(Math.sin(t * 4)) * 6;
          return R("g", { transform: "translate(" + px.toFixed(1) + "," + (kerb - 6 - bob).toFixed(1) + ")" },
            R("ellipse", { cx: 0, cy: -20, rx: 34, ry: 22, fill: rgba(tint, 0.6) }),
            R("circle", { cx: 26, cy: -40, r: 14, fill: rgba(tint, 0.65) }),
            R("path", { d: "M 40 -40 l 18 4 l -18 6 z", fill: rgba(theme.accent, 0.85) }),
            R("path", { d: "M -8 2 v 14 M 8 2 v 14", stroke: rgba(theme.accent, 0.7), strokeWidth: 4, strokeLinecap: "round" }));
        })(),
        [0, 1, 2, 3].map((i) => {
          const ph = (t * (0.22 + i * 0.04) + i * 0.23) % 1;
          const lx = 120 + i * 260 + Math.sin(t * 1.2 + i) * 50, ly = H - ph * (H + 160);
          return R("path", { key: "lv" + i, d: "M 0 0 q 24 -20 42 4 q -20 22 -42 -4 z", fill: rgba(theme.accent2, 0.4 * (1 - ph)), transform: "translate(" + lx.toFixed(1) + "," + ly.toFixed(1) + ") rotate(" + (ph * 340).toFixed(1) + ")" });
        }));
    },
  });

  /* ── 25 SLOW SUNDAY — the front room, a record turning ── */
  FilmKit.make({
    global: "SlowSunday", brand: "Slow Sunday", desk: "#191216", ambient: 1.45, chrome: false,
    FH: '"Grandstander", system-ui, sans-serif',
    FB: '"Sen", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "bounce", itemPreset: "pop", titleLine: 1.04, titleSpace: "-0.01em",
    /* ladder: bg .87 / surface .96 / rule .73 / inkMuted .43 / ink .08 / accent .4 / accent2 .52 */
    palette: (t) => ({
      bg: t.bg || "#f1e7e6", surface: "#fbf6f5", rule: "#d6c5c3", inkMuted: "#726466",
      ink: "#1b1517", accent: t.accent || "#8a4a6a", accent2: t.accent2 || "#d8a13c", accentInk: "#fbf6f5",
    }),
    tweaks: [
      { k: "bg", label: "Room", options: ["#f1e7e6", "#f3eae9", "#eee5e4"] },
      { k: "accent", label: "Plum", options: ["#8a4a6a", "#4a6a8a", "#6a8a4a"] },
      { k: "accent2", label: "Mustard", options: ["#d8a13c", "#d8703c", "#a1d83c"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(178deg, " + rgba(theme.accent2, 0.16) + " 0%, " + rgba(theme.surface, 0.9) + " 30%, " + bg + " 64%, " + rgba(theme.rule, 0.44) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round" },
      R2("circle", { cx: 12, cy: 12, r: 9 }), R2("circle", { cx: 12, cy: 12, r: 2.5 })),
    cams: ["drop", "zoomOut", "pushL", "hopU", "zoomIn", "pushR"], camMul: 5, camOff: 5,
    mag: { rot: 0.6, driftX: 7, driftY: 8, driftZ: 0.045, slide: 0.22, inn: 0.22, zin: 0.34, zout: 0.3 },
    variants: { Scroll: "feed", Typing: "caret", Ring: "ring" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 112, kicker: { v: "pill", bg: "accent", c: "accentInk" } },
      statement: { bg: "accent", fg: "accentInk", hi: "accent2", world: true, top: 610, size: 124 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 88, bodySize: 38, ch: 54, lh: 1.54, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 96, ch: 26, lh: 1.12, markSize: 230 },
      feature: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 255, size: 96, swap: "body", card: { v: "tilt", bg: "surface", r: 18, line: "inkMuted" }, chips: { v: "pill", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: 90, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 18, h: 640, labelSize: 46 }, tilts: [-1.5, 1.5, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 390, size: 92, cols: ["accent", "accent2", "ink"], num: 148 },
      cta: { bg: "ink", fg: "surface", hi: "accent2", world: true, top: 470, size: 108, align: "left", btn: { v: "pill", bg: "accent2", c: "ink" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — the front room, mid-afternoon. Far: blinds with a sunbeam and dust
       in it, a framed print. Mid: a record player on the sideboard — the platter
       turns at a steady rate while the tonearm creeps inward across the side, and
       the sleeve leans against it; a plant and a stack of records. Near: dust. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const board = H - 300;
      const spin = (t * 200) % 360;
      const side = (t % 40) / 40;
      const arm = -18 + side * 24;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "ss2-blind", width: 12, height: 44, patternUnits: "userSpaceOnUse" },
            R("rect", { x: 0, y: 0, width: 12, height: 28, fill: rgba(theme.rule, inv ? 0.14 : 0.5) })),
          R("linearGradient", { id: "ss2-beam", x1: "0%", y1: "0%", x2: "70%", y2: "100%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent2, 0.24) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent2, 0) }))),
        /* blinds and the beam they cut */
        R("rect", { x: 0, y: 0, width: W, height: 270, fill: "url(#ss2-blind)" }),
        R("rect", { x: 0, y: 264, width: W, height: 14, fill: rgba(tint, 0.5) }),
        /* a shelf above the blinds line: records, a clock, a plant */
        R("g", { opacity: 0.7 },
          R("rect", { x: 60, y: 210, width: W - 120, height: 16, rx: 5, fill: rgba(tint, 0.6) }),
          [0, 1, 2, 3, 4, 5, 6].map((i) => R("rect", { key: "sv" + i, x: 100 + i * 96 + (i % 3) * 8, y: 210 - (86 + (i % 3) * 22), width: 22 + (i % 2) * 8, height: 86 + (i % 3) * 22, rx: 3, fill: rgba(i % 3 === 0 ? theme.accent : (i % 3 === 1 ? theme.accent2 : tint), 0.5) })),
          R("g", { transform: "translate(" + (W - 190) + ",150)" },
            R("circle", { r: 56, fill: rgba(theme.surface, 0.85), stroke: rgba(tint, 0.55), strokeWidth: 5 }),
            R("line", { x1: 0, y1: 0, x2: Math.cos(t * 0.1 - 1.57) * 26, y2: Math.sin(t * 0.1 - 1.57) * 26, stroke: rgba(tint, 0.8), strokeWidth: 6, strokeLinecap: "round" }),
            R("line", { x1: 0, y1: 0, x2: Math.cos(t * 1.05 - 1.57) * 42, y2: Math.sin(t * 1.05 - 1.57) * 42, stroke: rgba(theme.accent, 0.9), strokeWidth: 4, strokeLinecap: "round" }))),
        R("path", { d: "M 60 278 L 420 278 L 800 " + H + " L -120 " + H + " Z", fill: "url(#ss2-beam)" }),
        /* a framed print on the wall, in the margin */
        R("g", { transform: "translate(" + (W - 150) + ",1100) rotate(" + (Math.sin(t * 0.5) * 1).toFixed(2) + ")" },
          R("rect", { x: -104, y: -120, width: 208, height: 260, rx: 5, fill: rgba(theme.surface, 0.7), stroke: rgba(tint, 0.55), strokeWidth: 6 }),
          R("circle", { cx: -20, cy: -20, r: 52, fill: rgba(theme.accent, 0.45) }),
          R("path", { d: "M -80 100 q 60 -110 96 -30 q 24 -50 64 30 z", fill: rgba(theme.accent2, 0.5) })),
        /* the sideboard */
        R("line", { x1: 0, y1: board, x2: W, y2: board, stroke: rgba(tint, 0.55), strokeWidth: 8 }),
        R("rect", { x: 0, y: board, width: W, height: H - board, fill: rgba(theme.rule, 0.34) }),
        /* the record player */
        R("g", { transform: "translate(" + (W * 0.42) + "," + (board - 10) + ")" },
          R("rect", { x: -230, y: -190, width: 460, height: 190, rx: 12, fill: rgba(theme.surface, inv ? 0.4 : 0.95), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("g", { transform: "translate(-60,-96)" },
            R("circle", { r: 116, fill: rgba(theme.ink, 0.86) }),
            R("g", { transform: "rotate(" + spin.toFixed(1) + ")" },
              [0, 1, 2, 3, 4].map((i) => R("circle", { key: "gv" + i, r: 34 + i * 18, fill: "none", stroke: rgba(theme.surface, 0.16), strokeWidth: 2 })),
              R("circle", { r: 40, fill: rgba(theme.accent, 0.9) }),
              R("circle", { r: 6, fill: rgba(theme.surface, 0.9) }),
              R("rect", { x: -2, y: -116, width: 4, height: 30, fill: rgba(theme.accent2, 0.7) }))),
          R("g", { transform: "translate(96,-150) rotate(" + arm.toFixed(2) + ")" },
            R("circle", { r: 22, fill: rgba(tint, 0.6) }),
            R("path", { d: "M 0 0 L -150 66", stroke: rgba(tint, 0.75), strokeWidth: 9, strokeLinecap: "round" }),
            R("path", { d: "M -150 66 l -22 16 l 6 12 l 24 -14 z", fill: rgba(theme.accent, 0.9) })),
          R("rect", { x: 150, y: -46, width: 60, height: 14, rx: 7, fill: rgba(theme.accent2, 0.7) }),
          R("circle", { cx: 190, cy: -80, r: 12, fill: rgba(theme.accent, 0.85) })),
        /* the sleeve leaning, a stack of records, a plant */
        R("g", { transform: "translate(200," + (board - 6) + ") rotate(-8)" },
          R("rect", { x: -110, y: -220, width: 220, height: 220, rx: 4, fill: rgba(theme.accent2, 0.4), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("circle", { cx: 0, cy: -110, r: 70, fill: rgba(theme.accent, 0.5) }),
          R("circle", { cx: 0, cy: -110, r: 16, fill: rgba(theme.surface, 0.8) })),
        R("g", { transform: "translate(" + (W - 300) + "," + board + ")" },
          [0, 1, 2, 3, 4].map((i) => R("rect", { key: "rc" + i, x: -100 + (i % 2) * 8, y: -16 - i * 14, width: 200 - (i % 2) * 14, height: 12, rx: 3, fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.5), stroke: rgba(tint, 0.3), strokeWidth: 2 }))),
        R("g", { transform: "translate(" + (W - 120) + "," + (board - 4) + ")" },
          R("path", { d: "M -44 0 h 88 l -10 -70 h -68 z", fill: rgba(theme.accent, 0.5), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          [0, 1, 2].map((i) => R("path", { key: "lf" + i, d: "M 0 -70 q " + (-50 + i * 50 + Math.sin(t * 0.7 + i) * 8).toFixed(1) + " -46 " + (-24 + i * 24).toFixed(1) + " -104", fill: "none", stroke: rgba(theme.accent2, 0.7), strokeWidth: 7, strokeLinecap: "round" }))),
        /* a lamp in the corner, and the sofa in the foreground */
        R("g", { transform: "translate(" + (W - 150) + "," + (board - 6) + ")" },
          R("path", { d: "M -40 0 h 80 l -14 -40 h -52 z", fill: rgba(tint, 0.55) }),
          R("line", { x1: 0, y1: -40, x2: 0, y2: -230, stroke: rgba(tint, 0.5), strokeWidth: 7 }),
          R("path", { d: "M -76 -230 h 152 l -26 -96 h -100 z", fill: rgba(theme.accent2, 0.55), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("circle", { cx: 0, cy: -206, r: 24 + Math.sin(t * 1.4) * 3, fill: rgba(theme.accent2, 0.4) })),
        R("g", null,
          R("path", { d: "M -60 " + H + " v -250 q 0 -70 90 -70 h 250 q 90 0 90 70 v 250 z", fill: rgba(theme.accent, 0.28), stroke: rgba(tint, 0.35), strokeWidth: 4 }),
          R("path", { d: "M 20 " + (H - 250) + " h 260", stroke: rgba(tint, 0.28), strokeWidth: 4 }),
          R("path", { d: "M 300 " + (H - 268) + " q " + (46 + Math.sin(t * 1.5) * 30).toFixed(1) + " -70 " + (10 + Math.sin(t * 1.5) * 46).toFixed(1) + " -130", fill: "none", stroke: rgba(tint, 0.6), strokeWidth: 16, strokeLinecap: "round" })),
        R("ellipse", { cx: W * 0.62, cy: H - 90, rx: 330, ry: 60, fill: rgba(theme.accent2, 0.18) }),
        R("ellipse", { cx: W * 0.62, cy: H - 90, rx: 250, ry: 42, fill: "none", stroke: rgba(theme.accent, 0.24), strokeWidth: 6 }),
        /* dust in the beam */
        [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const ph = (t * (0.09 + i * 0.02) + i * 0.13) % 1;
          return R("circle", { key: "dt" + i, cx: 120 + i * 90 + Math.sin(t * 0.6 + i) * 34, cy: H - ph * (H + 140), r: 3 + (i % 3) * 2, fill: rgba(theme.accent2, 0.34 * (1 - ph)) });
        }));
    },
  });
})();
