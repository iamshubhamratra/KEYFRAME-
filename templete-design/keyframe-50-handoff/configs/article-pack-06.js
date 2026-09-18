/* article-pack-06.js — cohort 06, business / analyst: packs 26-30.
   Quarter Note · Market Memo · Board Pack · Runway Math · Balance Line
   Contract as before: hexes only in palette(), look and World name slots,
   chrome:false, three depth planes, an object on a route with secondary motion,
   nothing in the text column (copy to x≈972, y 540-1000; stats labels to y≈1250
   at x<800; free above y=290 and below y=1330), tone-aware tints. */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ── 26 QUARTER NOTE — a glass tower, one lift running its shaft ── */
  FilmKit.make({
    global: "QuarterNote", brand: "Quarter Note", desk: "#0d1116", ambient: 1.5, chrome: false,
    FH: '"Instrument Sans", system-ui, sans-serif',
    FB: '"Manrope", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "machete", itemPreset: "rise", titleLine: 1.04, titleSpace: "-0.02em",
    /* ladder: bg .89 / surface .97 / rule .76 / inkMuted .45 / ink .07 / accent .32 / accent2 .58 */
    palette: (t) => ({
      bg: t.bg || "#eef1f4", surface: "#fafcfd", rule: "#c9d1d8", inkMuted: "#6b747c",
      ink: "#121619", accent: t.accent || "#1f3a5f", accent2: t.accent2 || "#8fc93a", accentInk: "#fafcfd",
    }),
    tweaks: [
      { k: "bg", label: "Paper", options: ["#eef1f4", "#f0f2f5", "#ecf0f3"] },
      { k: "accent", label: "Navy", options: ["#1f3a5f", "#1f5f4a", "#4a1f5f"] },
      { k: "accent2", label: "Signal", options: ["#8fc93a", "#3ac9c9", "#c93a8f"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(176deg, " + rgba(theme.surface, 0.95) + " 0%, " + bg + " 48%, " + rgba(theme.rule, 0.42) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M6 3h12v18H6zM10 3v18M14 3v18" })),
    cams: ["pushU", "zoomIn", "pushD", "pushL", "zoomOut", "pushR"], camMul: 5, camOff: 2,
    mag: { rot: 0.12, driftX: 5, driftY: 6, driftZ: 0.03, slide: 0.2, inn: 0.18, zin: 0.3, zout: 0.26 },
    variants: { Scroll: "board", Typing: "caret", Ring: "gauge" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 112, kicker: { v: "tag", bg: "accent", c: "accentInk" } },
      statement: { bg: "accent", fg: "accentInk", hi: "accent2", world: true, top: 610, size: 124 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 82, bodySize: 38, ch: 54, lh: 1.52, weight: 450, dim: 0.9, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 92, ch: 25, lh: 1.14, markSize: 220 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 94, swap: "body", card: { v: "frame", bg: "surface", r: 10, line: "inkMuted" }, chips: { v: "square", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: 88, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 10, h: 640, labelSize: 44 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 390, size: 90, cols: ["accent", "accent2", "ink"], num: 152, rule: true },
      cta: { bg: "ink", fg: "surface", hi: "accent2", world: true, top: 470, size: 106, align: "left", btn: { v: "block", bg: "accent2", c: "ink" }, logoShape: "rounded" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — a glass tower seen from the atrium. Far: floor plates receding with
       lit windows switching. Mid: one lift car runs a 13s cycle up and down its
       shaft — cable above, counterweight opposite, doors easing at each end, a
       floor readout following it. Near: a plant and a bench in the lobby. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const shaftX = W - 150, top0 = 340, bot0 = H - 380;
      const cyc = (t % 13) / 13;
      const tri = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;
      const car = bot0 - E.inOut(tri) * (bot0 - top0);
      const doors = tri > 0.94 || tri < 0.06 ? 1 : 0;
      const floorNo = Math.max(1, Math.round(1 + E.inOut(tri) * 11));
      const lobby = H - 300;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "qn-plate", width: 132, height: 96, patternUnits: "userSpaceOnUse" },
            R("rect", { x: 8, y: 8, width: 116, height: 80, rx: 4, fill: "none", stroke: rgba(theme.rule, inv ? 0.3 : 0.8), strokeWidth: 2 }))),
        R("rect", { x: 0, y: 0, width: W, height: lobby - 40, fill: "url(#qn-plate)", opacity: 0.6 }),
        /* a glazed roof over the atrium, above the copy */
        R("g", { opacity: 0.55 },
          R("path", { d: "M -20 250 L " + (W / 2) + " 20 L " + (W + 20) + " 250", fill: "none", stroke: rgba(tint, 0.55), strokeWidth: 7 }),
          [1, 2, 3, 4, 5, 6, 7].map((i) => R("line", { key: "gz" + i, x1: (W / 8) * i, y1: 250, x2: W / 2, y2: 20 + Math.abs(4 - i) * 26, stroke: rgba(tint, 0.32), strokeWidth: 4 })),
          R("line", { x1: -20, y1: 250, x2: W + 20, y2: 250, stroke: rgba(tint, 0.5), strokeWidth: 6 })),
        /* a hanging banner, turning slightly in the draught */
        R("g", { transform: "translate(250,36) rotate(" + (Math.sin(t * 0.6) * 1.6).toFixed(2) + ")" },
          R("line", { x1: -70, y1: 0, x2: 70, y2: 0, stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("path", { d: "M -62 0 h 124 v 176 l -62 -28 l -62 28 z", fill: rgba(theme.accent, 0.6) }),
          R("rect", { x: -38, y: 40, width: 76, height: 14, rx: 7, fill: rgba(theme.accentInk, 0.5) }),
          R("rect", { x: -28, y: 70, width: 56, height: 10, rx: 5, fill: rgba(theme.accentInk, 0.3) })),
        /* lit windows switching */
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
          const gx = 30 + (i % 5) * 132, gy = 400 + Math.floor(i / 5) * 96 * 3;
          return R("rect", { key: "lw" + i, x: gx + 8, y: gy + 8, width: 116, height: 80, rx: 4, fill: rgba(theme.accent2, Math.sin(t * 0.5 + i * 1.7) > 0.4 ? 0.3 : 0.06) });
        }),
        /* the shaft */
        R("rect", { x: shaftX - 96, y: top0 - 60, width: 192, height: bot0 - top0 + 200, rx: 8, fill: rgba(theme.accent, 0.07), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
        R("line", { x1: shaftX, y1: top0 - 60, x2: shaftX, y2: car - 60, stroke: rgba(tint, 0.55), strokeWidth: 4 }),
        /* counterweight, opposite the car */
        R("rect", { x: shaftX + 54, y: (top0 + bot0) - car - 60, width: 34, height: 120, rx: 5, fill: rgba(tint, 0.55) }),
        /* the car */
        R("g", { transform: "translate(" + shaftX + "," + car.toFixed(1) + ")" },
          R("rect", { x: -84, y: -60, width: 168, height: 120, rx: 8, fill: rgba(theme.surface, inv ? 0.4 : 0.96), stroke: rgba(tint, 0.55), strokeWidth: 5 }),
          R("rect", { x: -68 + doors * 30, y: -46, width: 60 - doors * 26, height: 92, rx: 4, fill: rgba(theme.accent, 0.3) }),
          R("rect", { x: 8 - doors * 4, y: -46, width: 60 - doors * 26, height: 92, rx: 4, fill: rgba(theme.accent, 0.3) }),
          R("rect", { x: -40, y: -84, width: 80, height: 22, rx: 6, fill: rgba(theme.ink, 0.85) }),
          R("text", { x: 0, y: -68, textAnchor: "middle", fontFamily: '"IBM Plex Mono", monospace', fontSize: 17, fill: rgba(theme.accent2, 0.95) }, String(floorNo).padStart(2, "0"))),
        /* a reception desk and a wayfinding pylon, in the margin band */
        R("g", { transform: "translate(" + (W - 160) + ",1430)" },
          R("path", { d: "M -130 90 h 260 v -60 h -260 z", fill: rgba(theme.surface, inv ? 0.4 : 0.94), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("path", { d: "M -130 30 h 260 l -18 -26 h -224 z", fill: rgba(theme.accent, 0.4) }),
          R("rect", { x: -70, y: -110, width: 140, height: 94, rx: 6, fill: rgba(theme.ink, 0.82) }),
          R("rect", { x: -54, y: -94, width: 108, height: 62, rx: 4, fill: rgba(theme.accent2, 0.28) }),
          R("rect", { x: -54, y: -94 + ((t * 30) % 62), width: 108, height: 6, fill: rgba(theme.accent2, 0.6) })),
        R("g", { opacity: 0.6, transform: "translate(150,1420)" },
          R("rect", { x: -46, y: -170, width: 92, height: 260, rx: 8, fill: rgba(theme.accent, 0.5), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          [0, 1, 2, 3].map((i) => R("rect", { key: "wf" + i, x: -30, y: -140 + i * 56, width: 60 - (i % 2) * 18, height: 10, rx: 5, fill: rgba(theme.accentInk, 0.45) }))),
        /* the lobby */
        R("line", { x1: 0, y1: lobby, x2: W, y2: lobby, stroke: rgba(tint, 0.55), strokeWidth: 8 }),
        R("rect", { x: 0, y: lobby, width: W, height: H - lobby, fill: rgba(theme.rule, 0.3) }),
        R("g", { transform: "translate(200," + lobby + ")" },
          R("path", { d: "M -44 0 h 88 l -10 -66 h -68 z", fill: rgba(theme.accent, 0.45), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          [0, 1, 2].map((i) => R("path", { key: "lf" + i, d: "M 0 -66 q " + (-52 + i * 52 + Math.sin(t * 0.7 + i) * 8).toFixed(1) + " -48 " + (-24 + i * 24).toFixed(1) + " -110", fill: "none", stroke: rgba(theme.accent2, 0.65), strokeWidth: 7, strokeLinecap: "round" }))),
        R("g", { transform: "translate(520," + lobby + ")" },
          R("rect", { x: -150, y: -46, width: 300, height: 18, rx: 5, fill: rgba(tint, 0.6) }),
          R("path", { d: "M -120 -28 v 28 M 120 -28 v 28", stroke: rgba(tint, 0.5), strokeWidth: 8 })),
        /* a revolving door and two planters in the foreground */
        R("g", { transform: "translate(" + (W * 0.52) + "," + (lobby + 10) + ")" },
          R("circle", { r: 150, fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 6 }),
          R("g", { transform: "rotate(" + ((t * 22) % 360).toFixed(1) + ")" },
            [0, 1, 2, 3].map((i) => R("line", { key: "rd" + i, x1: 0, y1: 0, x2: Math.cos(i * 1.571) * 148, y2: Math.sin(i * 1.571) * 148 * 0.34, stroke: rgba(theme.accent2, 0.5), strokeWidth: 7 }))),
          R("circle", { r: 16, fill: rgba(tint, 0.55) })),
        [0, 1].map((i) => R("g", { key: "pl" + i, transform: "translate(" + (W - 420 + i * 250) + "," + (H - 90) + ")" },
          R("path", { d: "M -54 0 h 108 l -12 -72 h -84 z", fill: rgba(theme.accent, 0.4), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          [0, 1, 2].map((j) => R("path", { key: "lf" + j, d: "M 0 -72 q " + (-52 + j * 52 + Math.sin(t * 0.7 + i + j) * 8).toFixed(1) + " -50 " + (-24 + j * 24).toFixed(1) + " -112", fill: "none", stroke: rgba(theme.accent2, 0.6), strokeWidth: 8, strokeLinecap: "round" })))),
        /* footfall: two figures crossing at different speeds */
        [0, 1].map((i) => {
          const fx = ((i ? -1 : 1) * (t * (30 + i * 18)) % (W + 400) + W + 400) % (W + 400) - 200;
          const step = Math.abs(Math.sin(t * (3 + i))) * 6;
          return R("g", { key: "fg" + i, opacity: 0.4, transform: "translate(" + fx.toFixed(1) + "," + (lobby - step).toFixed(1) + ")" },
            R("circle", { cx: 0, cy: -150, r: 26, fill: rgba(tint, 0.7) }),
            R("path", { d: "M -26 -124 h 52 l -10 124 h -32 z", fill: rgba(tint, 0.7) }));
        }));
    },
  });

  /* ── 27 MARKET MEMO — a paper plane flying the office ── */
  FilmKit.make({
    global: "MarketMemo", brand: "Market Memo", desk: "#151311", ambient: 1.6, chrome: false,
    FH: '"Familjen Grotesk", system-ui, sans-serif',
    FB: '"Commissioner", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "rise", itemPreset: "pop", titleLine: 1.05, titleSpace: "-0.015em",
    /* ladder: bg .87 / surface .96 / rule .74 / inkMuted .44 / ink .07 / accent .34 / accent2 .46 */
    palette: (t) => ({
      bg: t.bg || "#efece7", surface: "#fbfaf7", rule: "#cbc5bb", inkMuted: "#6e6862",
      ink: "#161412", accent: t.accent || "#8c2f2f", accent2: t.accent2 || "#2f7f8c", accentInk: "#fbfaf7",
    }),
    tweaks: [
      { k: "bg", label: "Paper", options: ["#efece7", "#f1eee9", "#edeae4"] },
      { k: "accent", label: "Oxblood", options: ["#8c2f2f", "#2f4a8c", "#4a8c2f"] },
      { k: "accent2", label: "Teal", options: ["#2f7f8c", "#8c7f2f", "#7f2f8c"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(100% 55% at 76% 6%, " + rgba(theme.accent2, 0.16) + " 0%, transparent 62%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M21 3L3 10l7 3 3 8z" })),
    cams: ["pushR", "hopU", "pushL", "zoomIn", "drop", "zoomOut"], camMul: 3, camOff: 4,
    mag: { rot: 0.4, driftX: 8, driftY: 7, driftZ: 0.04, slide: 0.24, inn: 0.2, zin: 0.32, zout: 0.3 },
    variants: { Scroll: "feed", Typing: "typewriter", Ring: "ring" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 110, kicker: { v: "outline", c: "accent" } },
      statement: { bg: "ink", fg: "surface", hi: "accent2", world: true, top: 610, size: 122 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 80, bodySize: 38, ch: 54, lh: 1.52, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent2" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 90, ch: 25, lh: 1.16, markSize: 220 },
      feature: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 255, size: 92, swap: "quote", card: { v: "paper", bg: "surface", r: 8, line: "inkMuted" }, chips: { v: "outline", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: 86, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 8, h: 640, labelSize: 44 }, tilts: [-1, 1, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 88, cols: ["accent", "accent2", "ink"], num: 150, rule: true },
      cta: { bg: "accent", fg: "accentInk", hi: "ink", world: true, top: 470, size: 104, align: "left", btn: { v: "block", bg: "ink", c: "accentInk" }, logoShape: "rounded" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — an open-plan floor after hours. Far: a window wall with blinds and
       a skyline. Mid: desk pods receding on parallax, a whiteboard of figures,
       and a paper plane flying an 11s arc across the room — it banks into the
       turn, dips and lifts, and its shadow tracks along the floor. Near: two
       memos tumbling. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const floor = H - 300;
      const cyc = (t % 11) / 11;
      const px = -180 + cyc * (W + 360);
      const py = 1120 - Math.sin(cyc * Math.PI) * 240 + Math.sin(cyc * Math.PI * 4) * 30;
      const bank = Math.cos(cyc * Math.PI) * 16 + Math.sin(cyc * Math.PI * 4) * 6;
      const pods = (t * 8) % 300;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "mm-blind", width: 14, height: 42, patternUnits: "userSpaceOnUse" },
            R("rect", { x: 0, y: 0, width: 14, height: 26, fill: rgba(theme.rule, inv ? 0.16 : 0.5) }))),
        /* window wall and skyline, above the copy */
        R("g", null,
          R("rect", { x: 0, y: 0, width: W, height: 270, fill: "url(#mm-blind)" }),
          [0, 1, 2, 3, 4, 5].map((i) => R("rect", { key: "sk" + i, x: 40 + i * 172, y: 270 - (70 + (i % 3) * 44), width: 110, height: 70 + (i % 3) * 44, fill: rgba(theme.accent2, 0.22) })),
          R("rect", { x: 0, y: 268, width: W, height: 14, fill: rgba(tint, 0.5) })),
        /* ceiling grid and a pendant row, above the copy */
        R("g", { opacity: 0.5 },
          [0, 1, 2, 3, 4, 5, 6].map((i) => R("line", { key: "cg" + i, x1: 0, y1: 30 + i * 34, x2: W, y2: 30 + i * 34, stroke: rgba(theme.rule, 0.6), strokeWidth: 2 })),
          [0, 1, 2].map((i) => R("g", { key: "pd" + i, transform: "translate(" + (200 + i * 340) + ",150)" },
            R("line", { x1: 0, y1: -120, x2: 0, y2: 22, stroke: rgba(tint, 0.5), strokeWidth: 4 }),
            R("path", { d: "M -44 22 h 88 l -18 40 h -52 z", fill: rgba(theme.accent, 0.55) }),
            R("circle", { cx: 0, cy: 74, r: 11 + Math.sin(t * 1.4 + i) * 2, fill: rgba(theme.accent2, 0.8) })))),
        /* a second plane, far behind, on its own arc */
        (function () {
          const c2 = (t % 26) / 26;
          const fx = W + 120 - c2 * (W + 300), fy = 200 - Math.sin(c2 * Math.PI) * 60;
          return R("g", { opacity: 0.3, transform: "translate(" + fx.toFixed(1) + "," + fy.toFixed(1) + ") scale(0.5) rotate(" + (Math.cos(c2 * Math.PI) * -14).toFixed(1) + ")" },
            R("path", { d: "M 96 -34 L -96 0 L 96 34 L 58 0 Z", fill: rgba(theme.surface, 0.95), stroke: rgba(tint, 0.4), strokeWidth: 3 }));
        })(),
        /* desk pods receding */
        R("g", { opacity: 0.4, transform: "translate(" + (-pods).toFixed(1) + ",0)" },
          [0, 1].map((r) => R("g", { key: "pd" + r },
            [0, 1, 2, 3].map((i) => R("g", { key: "dk" + i, transform: "translate(" + (90 + i * 300 + r * 60) + "," + (floor - 300 + r * 130) + ")" },
              R("rect", { x: -110, y: 0, width: 220, height: 14, rx: 4, fill: rgba(tint, 0.6) }),
              R("rect", { x: -70, y: -78, width: 140, height: 74, rx: 6, fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 5 }),
              R("path", { d: "M -80 14 v 36 M 80 14 v 36", stroke: rgba(tint, 0.4), strokeWidth: 6 })))))),
        /* whiteboard of figures in the margin */
        R("g", { transform: "translate(" + (W - 140) + ",1120)" },
          R("rect", { x: -118, y: -180, width: 236, height: 360, rx: 8, fill: rgba(theme.surface, inv ? 0.24 : 0.92), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2].map((i) => R("line", { key: "wf" + i, x1: -86, y1: -130 + i * 46, x2: 30 + (i % 2) * 60, y2: -130 + i * 46, stroke: rgba(tint, 0.45), strokeWidth: 5 })),
          R("path", { d: "M -86 100 " + Array.from({ length: 7 }).map((_, i) => "L " + (-86 + i * 30) + " " + (100 - Math.abs(Math.sin(i * 0.9 + t * 0.3)) * 90)).join(" "), fill: "none", stroke: rgba(theme.accent, 0.8), strokeWidth: 5 }),
          R("circle", { cx: 84, cy: -150, r: 12, fill: rgba(theme.accent2, 0.8) })),
        /* a shared printer and a pinboard, in the margin band */
        R("g", { transform: "translate(" + (W - 150) + ",1420)" },
          R("rect", { x: -110, y: -60, width: 220, height: 120, rx: 10, fill: rgba(theme.surface, inv ? 0.4 : 0.94), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("rect", { x: -80, y: -76, width: 160, height: 18, rx: 5, fill: rgba(tint, 0.5) }),
          R("rect", { x: -70, y: -44, width: 140, height: 16, rx: 4, fill: rgba(theme.accent, 0.5) }),
          (function () {
            const pr = (t % 6) / 6;
            const out = pr < 0.5 ? pr / 0.5 : 1;
            return R("rect", { x: -66, y: 40, width: 132, height: 8 + out * 74, rx: 3, fill: rgba(theme.surface, inv ? 0.5 : 0.98), stroke: rgba(tint, 0.35), strokeWidth: 2 });
          })(),
          R("circle", { cx: 84, cy: -20, r: 8, fill: rgba(theme.accent2, Math.sin(t * 3) > 0 ? 0.9 : 0.3) })),
        /* a plant and a chair in the foreground */
        R("g", { transform: "translate(140," + (floor + 90) + ")" },
          R("path", { d: "M -54 0 h 108 l -14 -84 h -80 z", fill: rgba(theme.accent2, 0.4), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          [0, 1, 2, 3].map((i) => R("path", { key: "lf" + i, d: "M 0 -84 q " + (-64 + i * 44 + Math.sin(t * 0.7 + i) * 9).toFixed(1) + " -60 " + (-30 + i * 22).toFixed(1) + " -140", fill: "none", stroke: rgba(theme.accent, 0.55), strokeWidth: 8, strokeLinecap: "round" }))),
        R("g", { opacity: 0.5, transform: "translate(" + (W * 0.46) + "," + H + ")" },
          R("path", { d: "M -150 0 v -190 q 0 -40 150 -40 q 150 0 150 40 v 190 z", fill: rgba(theme.accent, 0.22), stroke: rgba(tint, 0.3), strokeWidth: 4 }),
          R("path", { d: "M -90 -190 h 180", stroke: rgba(tint, 0.26), strokeWidth: 4 })),
        /* the floor */
        R("line", { x1: 0, y1: floor, x2: W, y2: floor, stroke: rgba(tint, 0.55), strokeWidth: 8 }),
        R("rect", { x: 0, y: floor, width: W, height: H - floor, fill: rgba(theme.rule, 0.28) }),
        /* the paper plane and its shadow */
        R("ellipse", { cx: px, cy: floor + 40, rx: 70, ry: 10, fill: rgba(theme.ink, 0.14) }),
        R("g", { transform: "translate(" + px.toFixed(1) + "," + py.toFixed(1) + ") rotate(" + bank.toFixed(1) + ")" },
          R("path", { d: "M -96 -34 L 96 0 L -96 34 L -58 0 Z", fill: rgba(theme.surface, inv ? 0.6 : 0.98), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
          R("path", { d: "M -96 -34 L 96 0 L -58 0 Z", fill: rgba(theme.ink, 0.08) }),
          R("path", { d: "M -58 0 L 96 0", stroke: rgba(theme.accent, 0.6), strokeWidth: 3 })),
        /* memos tumbling */
        [0, 1].map((i) => {
          const ph = (t * (0.16 + i * 0.05) + i * 0.4) % 1;
          const mx = 220 + i * 420 + Math.sin(t * 1.1 + i) * 40, my = -60 + ph * (H + 120);
          return R("rect", { key: "mo" + i, x: mx, y: my, width: 54, height: 70, rx: 4, fill: rgba(theme.surface, 0.9 * (1 - ph * 0.6)), stroke: rgba(tint, 0.35), strokeWidth: 2, transform: "rotate(" + (ph * 300 + i * 60).toFixed(1) + " " + (mx + 27) + " " + (my + 35) + ")" });
        }));
    },
  });

  /* ── 28 BOARD PACK — a model on a turntable under a spotlight ── */
  FilmKit.make({
    global: "BoardPack", brand: "Board Pack", desk: "#080b12", ambient: 1.4, chrome: false,
    FH: '"Schibsted Grotesk", system-ui, sans-serif',
    FB: '"Red Hat Text", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "rise", itemPreset: "rise", titleLine: 1.06, titleSpace: "-0.02em",
    /* ladder: bg .04 / surface .09 / rule .17 / inkMuted .42 / ink .9 / accent .58 / accent2 .5 */
    palette: (t) => ({
      bg: t.bg || "#101726", surface: "#1a2336", rule: "#2f3c52", inkMuted: "#93a0b4",
      ink: "#f4f6fa", accent: t.accent || "#d8b45a", accent2: t.accent2 || "#5a9bd8", accentInk: "#0b1120",
    }),
    tweaks: [
      { k: "bg", label: "Room", options: ["#101726", "#12182a", "#0e1622"] },
      { k: "accent", label: "Gilt", options: ["#d8b45a", "#d87a5a", "#5ad8b4"] },
      { k: "accent2", label: "Second", options: ["#5a9bd8", "#9b5ad8", "#d85a9b"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(80% 45% at 50% 96%, " + rgba(theme.accent, 0.2) + " 0%, transparent 60%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M4 20h16M7 20V9l5-4 5 4v11" }), R2("path", { d: "M11 20v-5h2v5" })),
    cams: ["zoomIn", "pushU", "pushL", "drop", "zoomOut", "pushR"], camMul: 7, camOff: 3,
    mag: { rot: 0.2, driftX: 5, driftY: 6, driftZ: 0.05, slide: 0.18, inn: 0.24, zin: 0.34, zout: 0.28 },
    variants: { Scroll: "board", Typing: "hand", Ring: "bar" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 108, kicker: { v: "outline", c: "accent" } },
      statement: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 610, size: 120 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 80, bodySize: 38, ch: 54, lh: 1.52, weight: 400, dim: 0.92, kicker: { v: "bare", c: "accent2" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 88, ch: 25, lh: 1.16, markSize: 220 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 90, swap: "body", card: { v: "glow", bg: "surface", glow: "accent", r: 12, line: "inkMuted" }, chips: { v: "outline", colors: ["accent", "accent2", "ink"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 330, size: 84, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 12, h: 640, labelSize: 42 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 86, cols: ["accent", "accent2", "ink"], num: 150, glowNums: true },
      cta: { bg: "accent", fg: "accentInk", hi: "surface", world: true, top: 470, size: 102, align: "left", btn: { v: "glow", bg: "accentInk", c: "ink" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — the board room with the model out. Far: a coffered ceiling grid and
       a pendant row. Mid: a scale model of the site on a turntable, rotating a
       slow 20s revolution under a spotlight so its shadow sweeps the table; a
       water jug and glasses beside it. Near: motes in the beam. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const table = H - 290;
      const spin = (t * 18) % 360;
      const rad = spin * Math.PI / 180;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "bp-coffer", width: 150, height: 110, patternUnits: "userSpaceOnUse" },
            R("rect", { x: 10, y: 10, width: 130, height: 90, rx: 6, fill: "none", stroke: rgba(theme.rule, inv ? 0.5 : 0.7), strokeWidth: 3 })),
          R("radialGradient", { id: "bp-spot", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent, 0.3) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent, 0) }))),
        R("rect", { x: 0, y: 0, width: W, height: 250, fill: "url(#bp-coffer)", opacity: 0.7 }),
        /* a city wall beyond the glass, lights switching */
        R("g", { opacity: 0.5 },
          [0, 1, 2, 3, 4, 5, 6].map((i) => {
            const bh = 74 + ((i * 47) % 4) * 40;
            return R("rect", { key: "ct" + i, x: 30 + i * 152, y: 250 - bh, width: 104, height: bh, fill: rgba(theme.accent2, 0.3) });
          }),
          [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => R("rect", { key: "cw" + i, x: 54 + i * 104, y: 196 - (i % 3) * 34, width: 16, height: 20, fill: rgba(theme.accent, Math.sin(t * 0.6 + i * 1.9) > 0.35 ? 0.85 : 0.2) }))),
        /* pendant row */
        [0, 1, 2].map((i) => R("g", { key: "pn" + i, transform: "translate(" + (200 + i * 340) + ",250)" },
          R("line", { x1: 0, y1: -20, x2: 0, y2: 40, stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("path", { d: "M -50 40 h 100 l -22 46 h -56 z", fill: rgba(theme.accent, 0.6) }),
          R("circle", { cx: 0, cy: 96, r: 14 + Math.sin(t * 1.3 + i) * 2, fill: rgba(theme.accent, 0.9) }))),
        /* a wall screen cycling the deck it replaced */
        R("g", { transform: "translate(" + (W - 160) + ",158) scale(0.66)" },
          R("rect", { x: -128, y: -160, width: 256, height: 300, rx: 10, fill: rgba(theme.accentInk, 0.9), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("rect", { x: -106, y: -138, width: 212, height: 256, rx: 5, fill: rgba(theme.accent2, 0.16) }),
          (function () {
            const sl = Math.floor((t % 12) / 3);
            return R("g", null,
              R("rect", { x: -86, y: -114, width: 150 - sl * 22, height: 14, rx: 7, fill: rgba(theme.accent, 0.85) }),
              [0, 1, 2].map((i) => R("rect", { key: "sr" + i, x: -86, y: -80 + i * 26, width: 130 - i * 26 - sl * 10, height: 10, rx: 5, fill: rgba(theme.ink, 0.4) })),
              sl % 2 === 0
                ? R("g", null, [0, 1, 2, 3].map((i) => R("rect", { key: "bc" + i, x: -80 + i * 46, y: 60 - (14 + i * 16), width: 30, height: 14 + i * 16, rx: 3, fill: rgba(theme.accent, 0.5) })))
                : R("path", { d: "M -80 60 L -20 10 L 20 34 L 80 -20", fill: "none", stroke: rgba(theme.accent, 0.8), strokeWidth: 5 }));
          })(),
          R("circle", { cx: 0, cy: 128, r: 6, fill: rgba(theme.accent, 0.7) })),
        /* chair backs around the table */
        [0, 1, 2, 3, 4].map((i) => {
          const cx2 = 130 + i * 200;
          const lean = Math.sin(t * 0.5 + i * 1.3) * 1.5;
          return R("g", { key: "ch" + i, opacity: 0.55, transform: "translate(" + cx2 + "," + (table + 40) + ") rotate(" + lean.toFixed(2) + ")" },
            R("path", { d: "M -62 0 v -110 q 0 -30 62 -30 q 62 0 62 30 v 110 z", fill: rgba(theme.surface, 0.5), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
            R("path", { d: "M -40 -70 h 80", stroke: rgba(tint, 0.3), strokeWidth: 4 }));
        }),
        R("ellipse", { cx: W * 0.5, cy: table - 80, rx: 520, ry: 300, fill: "url(#bp-spot)" }),
        /* the table */
        R("ellipse", { cx: W * 0.5, cy: table, rx: 520, ry: 90, fill: rgba(theme.surface, 0.95), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
        R("ellipse", { cx: W * 0.5, cy: table, rx: 440, ry: 70, fill: "none", stroke: rgba(tint, 0.25), strokeWidth: 3 }),
        /* the model on its turntable */
        R("g", { transform: "translate(" + (W * 0.5) + "," + (table - 30) + ")" },
          R("ellipse", { cx: 0, cy: 0, rx: 230, ry: 60, fill: rgba(theme.accentInk, 0.5), stroke: rgba(theme.accent, 0.5), strokeWidth: 4 }),
          R("ellipse", { cx: Math.cos(rad) * 90, cy: 20 + Math.sin(rad) * 16, rx: 150, ry: 34, fill: rgba(theme.accentInk, 0.45) }),
          [[0, 0, 200], [-96, 26, 130], [92, 20, 96], [-40, -14, 156]].map((b, i) => {
            const bx = Math.cos(rad + i * 1.4) * b[0] * 0.7 + b[0] * 0.4;
            const by = Math.sin(rad + i * 1.4) * 14 + b[1] * 0.5;
            return R("g", { key: "bl" + i },
              R("path", { d: "M " + (bx - 34) + " " + by + " h 68 v " + (-b[2]) + " h -68 z", fill: rgba(i === 0 ? theme.accent : theme.surface, i === 0 ? 0.7 : 0.9), stroke: rgba(tint, 0.5), strokeWidth: 3 }),
              R("path", { d: "M " + (bx - 34) + " " + (by - b[2]) + " l 34 -22 l 34 22 z", fill: rgba(theme.accent, 0.5) }),
              [0, 1, 2].map((j) => R("line", { key: "fl" + j, x1: bx - 26, y1: by - 24 - j * 30, x2: bx + 26, y2: by - 24 - j * 30, stroke: rgba(tint, 0.3), strokeWidth: 3 })));
          })),
        /* jug and glasses */
        R("g", { transform: "translate(230," + (table - 20) + ")" },
          R("path", { d: "M -34 0 h 68 l -8 -110 h -52 z", fill: rgba(theme.accent2, 0.28), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("path", { d: "M 30 -84 q 30 6 26 30 q -6 22 -30 18", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1].map((i) => R("path", { key: "gl" + i, d: "M " + (70 + i * 60) + " 0 h 44 l -6 -60 h -32 z", fill: rgba(theme.accent2, 0.2), stroke: rgba(tint, 0.45), strokeWidth: 3 }))),
        /* a carafe cart parked by the wall */
        R("g", { opacity: 0.7, transform: "translate(" + (W - 400) + "," + (H - 150) + ")" },
          R("rect", { x: -90, y: -110, width: 180, height: 14, rx: 4, fill: rgba(tint, 0.6) }),
          R("rect", { x: -90, y: -40, width: 180, height: 12, rx: 4, fill: rgba(tint, 0.5) }),
          R("path", { d: "M -80 -96 v 56 M 80 -96 v 56 M -80 -28 v 20 M 80 -28 v 20", stroke: rgba(tint, 0.5), strokeWidth: 6 }),
          R("path", { d: "M -40 -110 h 52 l -6 -70 h -40 z", fill: rgba(theme.accent2, 0.4), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
          [0, 1].map((i) => R("circle", { key: "cw" + i, cx: -60 + i * 120, cy: -2, r: 12, fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 4 }))),
        /* motes in the beam */
        [0, 1, 2, 3, 4, 5].map((i) => {
          const ph = (t * (0.1 + i * 0.02) + i * 0.16) % 1;
          return R("circle", { key: "mt" + i, cx: W * 0.3 + i * 100 + Math.sin(t * 0.6 + i) * 30, cy: table - ph * 700, r: 3 + (i % 3) * 2, fill: rgba(theme.accent, 0.3 * (1 - ph)) });
        }));
    },
  });

  /* ── 29 RUNWAY MATH — a balloon losing height, burner firing ── */
  FilmKit.make({
    global: "RunwayMath", brand: "Runway Math", desk: "#0a0910", ambient: 1.55, chrome: false,
    FH: '"Sora", system-ui, sans-serif',
    FB: '"Epilogue", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "rise", itemPreset: "pop", titleLine: 1.04, titleSpace: "-0.025em",
    /* ladder: bg .035 / surface .08 / rule .16 / inkMuted .42 / ink .88 / accent .56 / accent2 .5 */
    palette: (t) => ({
      bg: t.bg || "#12111c", surface: "#1c1b2b", rule: "#302f45", inkMuted: "#8f8da8",
      ink: "#f1f0f7", accent: t.accent || "#9b7bff", accent2: t.accent2 || "#ffb15c", accentInk: "#0b0a12",
    }),
    tweaks: [
      { k: "bg", label: "Night", options: ["#12111c", "#141320", "#100f18"] },
      { k: "accent", label: "Violet", options: ["#9b7bff", "#7bffd1", "#ff7bb5"] },
      { k: "accent2", label: "Burner", options: ["#ffb15c", "#5cffb1", "#5cb1ff"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(90% 50% at 30% 8%, " + rgba(theme.accent, 0.18) + " 0%, transparent 62%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M12 3a7 7 0 017 7c0 4-7 8-7 8s-7-4-7-8a7 7 0 017-7z" }), R2("path", { d: "M10 21h4" })),
    cams: ["drop", "zoomOut", "pushU", "pushR", "zoomIn", "pushL"], camMul: 5, camOff: 1,
    mag: { rot: 0.35, driftX: 7, driftY: 8, driftZ: 0.05, slide: 0.24, inn: 0.2, zin: 0.36, zout: 0.32 },
    variants: { Scroll: "feed", Typing: "terminal", Ring: "gauge" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 92, kicker: { v: "tag", bg: "accent", c: "accentInk" } },
      statement: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 610, size: 104 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 78, bodySize: 38, ch: 54, lh: 1.52, weight: 400, dim: 0.92, kicker: { v: "bare", c: "accent2" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: 88, ch: 25, lh: 1.14, markSize: 210 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 88, swap: "body", card: { v: "glow", bg: "surface", glow: "accent", r: 16, line: "inkMuted" }, chips: { v: "square", colors: ["accent", "accent2", "ink"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 330, size: 84, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 16, h: 640, labelSize: 42 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 86, cols: ["accent", "accent2", "ink"], num: 152, glowNums: true },
      cta: { bg: "ink", fg: "accentInk", hi: "accent", world: true, top: 470, size: 102, align: "left", btn: { v: "glow", bg: "accent", c: "accentInk" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — a balloon at dusk, losing height between burns. Far: a horizon and
       two cloud banks on parallax. Mid: the balloon drifts across on an 18s
       traverse, sinking steadily and lifting each time the burner fires (every
       4.5s) — envelope squashes on the burn, basket swings with lag, flame licks.
       Near: sparks from the burner. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const hz = H - 330;
      const cyc = (t % 18) / 18;
      const burn = (t % 4.5) / 4.5;
      const fire = burn < 0.2 ? 1 - burn / 0.2 : 0;
      const bx = -160 + cyc * (W + 320);
      const by = 1400 + cyc * 150 - fire * 70;
      const squash = 1 + fire * 0.06;
      const swing = Math.sin(t * 1.2 - 0.6) * 6;
      const clouds = (t * 9) % 420;
      return R("g", null,
        R("defs", null,
          R("linearGradient", { id: "rm-dusk", x1: "0%", y1: "0%", x2: "0%", y2: "100%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent, 0.2) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent2, 0.14) }))),
        R("rect", { x: 0, y: hz - 620, width: W, height: 620, fill: "url(#rm-dusk)", opacity: 0.7 }),
        /* stars and a thin moon, above the copy */
        R("g", null,
          [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
            const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * (0.7 + i * 0.23) + i));
            return R("circle", { key: "sr" + i, cx: 70 + i * 118, cy: 60 + (i % 4) * 52, r: 3 + (i % 3), fill: rgba(theme.ink, 0.28 * tw) });
          }),
          R("path", { d: "M " + (W - 190) + " 90 a 62 62 0 1 0 0 116 a 46 46 0 1 1 0 -116 z", fill: rgba(theme.accent2, 0.5) })),
        /* a second balloon, far off and small */
        (function () {
          /* the far balloon lives in the sky band with the stars and moon — the
             mid band is copy on every beat of this pack. */
          const c2 = (t % 34) / 34;
          const fx = 90 + c2 * (W - 180), fy = 178 - Math.sin(c2 * Math.PI) * 46;
          return R("g", { opacity: 0.4, transform: "translate(" + fx.toFixed(1) + "," + fy.toFixed(1) + ") scale(0.45)" },
            R("path", { d: "M 0 -230 q 150 60 150 150 q 0 90 -150 170 q -150 -80 -150 -170 q 0 -90 150 -150 z", fill: rgba(theme.accent, 0.9) }),
            R("path", { d: "M 0 -230 q 66 60 66 150 q 0 90 -66 170 q -66 -80 -66 -170 q 0 -90 66 -150 z", fill: rgba(theme.accent2, 0.5) }),
            R("path", { d: "M -46 96 L -30 150 M 46 96 L 30 150", stroke: rgba(theme.surface, 0.5), strokeWidth: 6 }),
            R("rect", { x: -40, y: 150, width: 80, height: 60, rx: 8, fill: rgba(theme.surface, 0.9) }));
        })(),
        /* cloud banks */
        R("path", { d: "M " + (-clouds) + " " + (hz - 200) + " q 200 -80 420 -20 q 220 60 460 -30 L " + (W + 500) + " " + hz + " L " + (-clouds) + " " + hz + " Z", fill: rgba(theme.surface, 0.5) }),
        R("path", { d: "M " + (-clouds * 1.7) + " " + (hz - 80) + " q 240 -70 520 10 q 240 70 520 -30 L " + (W + 600) + " " + hz + " L " + (-clouds * 1.7) + " " + hz + " Z", fill: rgba(theme.surface, 0.34) }),
        /* hedgerows and a windsock at the strip */
        R("g", { opacity: 0.4 },
          [0, 1, 2].map((i) => R("path", { key: "hr" + i, d: "M " + (-(t * (5 + i * 4)) % 400) + " " + (hz - 40 - i * 26) + " q 120 " + (-24 - i * 6) + " 250 -4 q 130 20 250 -10 q 130 -26 260 -2", fill: "none", stroke: rgba(theme.accent, 0.55), strokeWidth: 8 - i * 2 }))),
        R("g", { transform: "translate(" + (W - 120) + "," + (hz - 20) + ")" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: -230, stroke: rgba(tint, 0.55), strokeWidth: 6 }),
          (function () {
            const flap = Math.sin(t * 2.2) * 8;
            return R("path", { d: "M 0 -220 q 70 " + (10 + flap).toFixed(1) + " 120 " + (26 + flap * 1.4).toFixed(1) + " q -50 22 -120 14 z", fill: rgba(theme.accent2, 0.7), stroke: rgba(tint, 0.4), strokeWidth: 3 });
          })()),
        /* the ground and a burn-down marker row */
        R("line", { x1: 0, y1: hz, x2: W, y2: hz, stroke: rgba(tint, 0.5), strokeWidth: 6 }),
        R("rect", { x: 0, y: hz, width: W, height: H - hz, fill: rgba(theme.accentInk, 0.45) }),
        [0, 1, 2, 3, 4, 5, 6, 7].map((i) => R("g", { key: "mk" + i },
          R("line", { x1: 60 + i * 132, y1: hz, x2: 60 + i * 132, y2: hz + 34, stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("rect", { x: 46 + i * 132, y: hz + 50, width: 28, height: 12 + (7 - i) * 10, rx: 4, fill: rgba(i < 3 ? theme.accent2 : theme.accent, 0.4) }))),
        /* the balloon */
        R("g", { transform: "translate(" + bx.toFixed(1) + "," + by.toFixed(1) + ") scale(0.62)" },
          R("ellipse", { cx: 0, cy: (hz - by + 30) / 0.62, rx: 140, ry: 20, fill: rgba(theme.accentInk, 0.5) }),
          R("g", { transform: "scale(" + squash.toFixed(3) + "," + (2 - squash).toFixed(3) + ")" },
            R("path", { d: "M 0 -230 q 150 60 150 150 q 0 90 -150 170 q -150 -80 -150 -170 q 0 -90 150 -150 z", fill: rgba(theme.accent, 0.8), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
            R("path", { d: "M 0 -230 q 66 60 66 150 q 0 90 -66 170 q -66 -80 -66 -170 q 0 -90 66 -150 z", fill: rgba(theme.accent2, 0.5) }),
            R("path", { d: "M -150 -80 q 150 60 300 0", fill: "none", stroke: rgba(theme.accentInk, 0.3), strokeWidth: 5 })),
          R("g", { transform: "rotate(" + swing.toFixed(2) + " 0 90)" },
            R("path", { d: "M -46 96 L -30 150 M 46 96 L 30 150", stroke: rgba(tint, 0.6), strokeWidth: 4 }),
            R("rect", { x: -40, y: 150, width: 80, height: 60, rx: 8, fill: rgba(theme.surface, 0.9), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
            R("path", { d: "M 0 96 q " + (14 * fire).toFixed(1) + " 34 0 " + (60 + 40 * fire).toFixed(1) + " q " + (-14 * fire).toFixed(1) + " -30 0 " + (-60 - 40 * fire).toFixed(1) + " z", fill: rgba(theme.accent2, 0.4 + 0.6 * fire) }))),
        /* a chase van on the track, keeping pace */
        (function () {
          const vx = -200 + ((t % 18) / 18) * (W + 400) - 90;
          const whl = (vx / 26) * 57.3;
          const bump = Math.sin(t * 6) * 2;
          return R("g", { opacity: 0.75, transform: "translate(" + vx.toFixed(1) + "," + (hz + 96 + bump).toFixed(1) + ") scale(0.8)" },
            R("path", { d: "M -110 0 v -66 h 130 l 40 34 v 32 z", fill: rgba(theme.surface, 0.9), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
            R("rect", { x: 26, y: -56, width: 30, height: 26, rx: 4, fill: rgba(theme.accent2, 0.6) }),
            R("path", { d: "M 62 -14 L 190 -30 L 190 2 L 62 6 Z", fill: rgba(theme.accent2, 0.18) }),
            [-64, 34].map((wx, i) => R("g", { key: "vw" + i, transform: "translate(" + wx + ",4) rotate(" + whl.toFixed(1) + ")" },
              R("circle", { r: 22, fill: rgba(theme.accentInk, 0.9), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
              R("path", { d: "M -22 0 h 44", stroke: rgba(tint, 0.4), strokeWidth: 3 }))));
        })(),
        /* sparks off the burner */
        [0, 1, 2, 3].map((i) => {
          const ph = ((t * 1.4 + i * 0.25) % 1);
          return R("circle", { key: "sp" + i, cx: bx + (i - 1.5) * 12, cy: by + 96 - ph * 90, r: 4 - i * 0.5, fill: rgba(theme.accent2, 0.5 * (1 - ph) * (fire > 0 ? 1 : 0.4)) });
        }));
    },
  });

  /* ── 30 BALANCE LINE — a balance scale finding its level ── */
  FilmKit.make({
    global: "BalanceLine", brand: "Balance Line", desk: "#141210", ambient: 1.35, chrome: false,
    FH: '"Libre Bodoni", Georgia, serif',
    FB: '"Livvic", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "drowse", itemPreset: "rise", titleLine: 1.08, titleSpace: "-0.005em",
    /* ladder: bg .88 / surface .96 / rule .74 / inkMuted .44 / ink .07 / accent .3 / accent2 .44 */
    palette: (t) => ({
      bg: t.bg || "#f2eee4", surface: "#fbf9f3", rule: "#cec7b6", inkMuted: "#6f695c",
      ink: "#161410", accent: t.accent || "#1f5137", accent2: t.accent2 || "#8c2f45", accentInk: "#fbf9f3",
    }),
    tweaks: [
      { k: "bg", label: "Stock", options: ["#f2eee4", "#f4f0e8", "#efebe1"] },
      { k: "accent", label: "Green", options: ["#1f5137", "#1f3d51", "#3d1f51"] },
      { k: "accent2", label: "Red", options: ["#8c2f45", "#8c5f2f", "#2f8c5f"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(90% 50% at 50% 4%, " + rgba(theme.surface, 0.95) + " 0%, transparent 60%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M12 4v16M5 8h14M4 8l-2 6h4zM20 8l-2 6h4z" })),
    cams: ["zoomIn", "pushU", "zoomOut", "pushL", "drop", "pushR"], camMul: 5, camOff: 4,
    mag: { rot: 0.15, driftX: 4, driftY: 6, driftZ: 0.035, slide: 0.18, inn: 0.24, zin: 0.28, zout: 0.24 },
    variants: { Scroll: "board", Typing: "caret", Ring: "ring" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 110, kicker: { v: "bare", c: "accent" } },
      statement: { bg: "accent", fg: "accentInk", hi: "accent2", world: true, top: 610, size: 122 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 80, bodySize: 38, ch: 54, lh: 1.54, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 360, size: 92, ch: 25, lh: 1.16, markSize: 230 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 255, size: 92, swap: "body", card: { v: "paper", bg: "surface", r: 6, line: "inkMuted" }, chips: { v: "outline", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 330, size: 86, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 6, h: 640, labelSize: 44 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 88, cols: ["accent", "accent2", "ink"], num: 148, rule: true },
      cta: { bg: "ink", fg: "surface", hi: "accent2", world: true, top: 470, size: 104, align: "left", btn: { v: "pill", bg: "accent", c: "accentInk" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — a counting house. Far: a ruled ledger wall and a wall clock. Mid: a
       balance scale on the bench whose beam settles toward level on a 12s cycle
       while weights are added — pans swing with lag, chains flex, the pointer
       overshoots and comes back. Near: coins stacked, and dust. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted;
      const bench = H - 290;
      const cyc = (t % 12) / 12;
      const target = cyc < 0.25 ? 16 : cyc < 0.5 ? -10 : cyc < 0.75 ? 6 : 0;
      const tilt = target + Math.sin(t * 3.2) * 3 * (1 - Math.min(1, (cyc % 0.25) / 0.18));
      const pan = -tilt * 0.6;
      const weights = Math.min(4, Math.floor(cyc * 4) + 1);
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "bl-ledger", width: 200, height: 54, patternUnits: "userSpaceOnUse" },
            R("line", { x1: 0, y1: 53, x2: 200, y2: 53, stroke: rgba(theme.rule, inv ? 0.3 : 0.7), strokeWidth: 2 }),
            R("line", { x1: 160, y1: 0, x2: 160, y2: 54, stroke: rgba(theme.accent2, 0.24), strokeWidth: 2 }))),
        R("rect", { x: 0, y: 0, width: W, height: bench - 260, fill: "url(#bl-ledger)", opacity: 0.8 }),
        /* a rack of pigeonholes along the top band */
        R("g", { opacity: 0.55 },
          [0, 1, 2].map((r) => [0, 1, 2, 3, 4].map((cIdx) => R("rect", { key: "ph" + r + cIdx, x: 470 + cIdx * 92, y: 30 + r * 74, width: 84, height: 66, rx: 4, fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 3 }))),
          [0, 1, 2].map((r) => [0, 1, 2, 3, 4].map((cIdx) => (r + cIdx) % 3 === 0
            ? R("rect", { key: "rl" + r + cIdx, x: 480 + cIdx * 92, y: 40 + r * 74, width: 64, height: 46, rx: 3, fill: rgba(theme.accent2, 0.3) })
            : null)),
          R("rect", { x: 462, y: 250, width: 470, height: 12, rx: 4, fill: rgba(tint, 0.55) })),
        /* an oil lamp hanging over the bench, swinging a little */
        R("g", { transform: "translate(" + (W * 0.5) + ",30) rotate(" + (Math.sin(t * 0.8) * 2).toFixed(2) + ")" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: 250, stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("path", { d: "M -66 250 h 132 l -26 54 h -80 z", fill: rgba(theme.accent, 0.6), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("circle", { cx: 0, cy: 322, r: 20 + Math.sin(t * 1.6) * 2, fill: rgba(theme.accent2, 0.7) })),
        /* wall clock and a framed certificate, above the copy */
        R("g", { transform: "translate(" + (W - 170) + ",150)" },
          R("circle", { r: 74, fill: rgba(theme.surface, 0.9), stroke: rgba(tint, 0.55), strokeWidth: 6 }),
          R("line", { x1: 0, y1: 0, x2: Math.cos(t * 0.1 - 1.57) * 34, y2: Math.sin(t * 0.1 - 1.57) * 34, stroke: rgba(tint, 0.8), strokeWidth: 6, strokeLinecap: "round" }),
          R("line", { x1: 0, y1: 0, x2: Math.cos(t * 1.05 - 1.57) * 54, y2: Math.sin(t * 1.05 - 1.57) * 54, stroke: rgba(theme.accent2, 0.9), strokeWidth: 4, strokeLinecap: "round" })),
        R("g", { opacity: 0.6, transform: "translate(220,170) rotate(-1)" },
          R("rect", { x: -140, y: -100, width: 280, height: 200, rx: 4, fill: rgba(theme.surface, 0.8), stroke: rgba(theme.accent, 0.5), strokeWidth: 6 }),
          [0, 1, 2].map((i) => R("line", { key: "cl" + i, x1: -100, y1: -40 + i * 40, x2: 60 + (i % 2) * 40, y2: -40 + i * 40, stroke: rgba(tint, 0.4), strokeWidth: 5 })),
          R("circle", { cx: 90, cy: 60, r: 24, fill: rgba(theme.accent2, 0.4) })),
        /* a ledger open on a stand, its page turning slowly */
        R("g", { transform: "translate(200,1120)" },
          R("path", { d: "M -140 170 h 280 l -30 -40 h -220 z", fill: rgba(theme.surface, inv ? 0.4 : 0.9), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("path", { d: "M -150 130 L -10 108 L -10 -70 L -150 -44 Z", fill: rgba(theme.surface, inv ? 0.5 : 0.96), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("path", { d: "M 150 130 L 10 108 L 10 -70 L 150 -44 Z", fill: rgba(theme.surface, inv ? 0.5 : 0.96), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          [0, 1, 2, 3].map((i) => R("line", { key: "ll" + i, x1: -130, y1: -14 + i * 30, x2: -30, y2: -22 + i * 30, stroke: rgba(tint, 0.32), strokeWidth: 4 })),
          [0, 1, 2, 3].map((i) => R("line", { key: "lr" + i, x1: 30, y1: -22 + i * 30, x2: 130, y2: -14 + i * 30, stroke: rgba(theme.accent2, 0.3), strokeWidth: 4 })),
          (function () {
            const pg = (t % 9) / 9;
            const turn = pg < 0.35 ? E.inOut(pg / 0.35) : 1;
            const half = 140 * Math.abs(Math.cos(turn * Math.PI));
            const side = Math.cos(turn * Math.PI) >= 0 ? 1 : -1;
            return R("path", { d: "M 0 -70 C " + (side * half * 0.6) + " " + (-96 - Math.sin(turn * Math.PI) * 70) + " " + (side * half) + " -80 " + (side * half) + " -60 L " + (side * half) + " 108 C " + (side * half * 0.6) + " " + (130 + Math.sin(turn * Math.PI) * 40) + " 0 118 0 108 Z", fill: rgba(theme.surface, inv ? 0.6 : 0.99), stroke: rgba(tint, 0.35), strokeWidth: 3 });
          })()),
        /* a strongbox in the margin, its lid breathing open */
        R("g", { transform: "translate(" + (W - 150) + ",1150)" },
          R("path", { d: "M -110 120 h 220 v -140 h -220 z", fill: rgba(theme.accent, 0.32), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("g", { transform: "rotate(" + (-6 - Math.sin(t * 0.7) * 5).toFixed(2) + " -110 -20)" },
            R("path", { d: "M -110 -20 h 220 l -18 -54 h -184 z", fill: rgba(theme.accent, 0.5), stroke: rgba(tint, 0.5), strokeWidth: 5 })),
          R("rect", { x: -22, y: 30, width: 44, height: 50, rx: 6, fill: rgba(theme.accent2, 0.8) }),
          [0, 1].map((i) => R("line", { key: "bd" + i, x1: -110 + i * 150, y1: 120, x2: -110 + i * 150, y2: -20, stroke: rgba(tint, 0.35), strokeWidth: 6 }))),
        /* the bench */
        R("line", { x1: 0, y1: bench, x2: W, y2: bench, stroke: rgba(tint, 0.55), strokeWidth: 8 }),
        R("rect", { x: 0, y: bench, width: W, height: H - bench, fill: rgba(theme.rule, 0.3) }),
        /* the balance */
        R("g", { transform: "translate(" + (W * 0.52) + "," + (bench - 10) + ")" },
          R("path", { d: "M -110 0 h 220 l -30 -40 h -160 z", fill: rgba(theme.surface, inv ? 0.4 : 0.95), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("line", { x1: 0, y1: -40, x2: 0, y2: -330, stroke: rgba(tint, 0.6), strokeWidth: 10 }),
          R("g", { transform: "rotate(" + tilt.toFixed(2) + " 0 -330)" },
            R("line", { x1: -260, y1: -330, x2: 260, y2: -330, stroke: rgba(theme.accent, 0.85), strokeWidth: 10, strokeLinecap: "round" }),
            R("circle", { cx: 0, cy: -330, r: 18, fill: rgba(theme.accent, 0.9) }),
            [-1, 1].map((sx) => R("g", { key: "pn" + sx, transform: "translate(" + (sx * 260) + ",-330) rotate(" + (pan * sx * 0.4).toFixed(2) + ")" },
              R("line", { x1: -50, y1: 0, x2: 0, y2: 90, stroke: rgba(tint, 0.55), strokeWidth: 3 }),
              R("line", { x1: 50, y1: 0, x2: 0, y2: 90, stroke: rgba(tint, 0.55), strokeWidth: 3 }),
              R("path", { d: "M -80 90 q 80 46 160 0 z", fill: rgba(theme.accent2, sx > 0 ? 0.5 : 0.34), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
              sx > 0
                ? Array.from({ length: weights }).map((_, j) => R("rect", { key: "wt" + j, x: -34 + (j % 2) * 34, y: 62 - Math.floor(j / 2) * 26, width: 30, height: 24, rx: 3, fill: rgba(theme.accent, 0.8) }))
                : R("circle", { cx: 0, cy: 74, r: 26, fill: rgba(theme.accent, 0.55) })))),
          R("path", { d: "M 0 -300 l " + (tilt * 1.6).toFixed(1) + " -34", stroke: rgba(theme.accent2, 0.9), strokeWidth: 5, strokeLinecap: "round" })),
        /* coins stacked on the bench */
        R("g", { transform: "translate(210," + bench + ")" },
          [0, 1, 2, 3, 4, 5].map((i) => R("ellipse", { key: "cn" + i, cx: (i % 3) * 62, cy: -12 - Math.floor(i / 3) * 14, rx: 28, ry: 10, fill: rgba(theme.accent2, 0.5), stroke: rgba(tint, 0.4), strokeWidth: 2 }))),
        /* an abacus, beads sliding, and a quill in its stand */
        R("g", { transform: "translate(" + (W - 250) + "," + (bench - 10) + ")" },
          R("rect", { x: -120, y: -140, width: 240, height: 140, rx: 8, fill: "none", stroke: rgba(tint, 0.55), strokeWidth: 5 }),
          [0, 1, 2, 3].map((r) => R("g", { key: "ab" + r },
            R("line", { x1: -110, y1: -122 + r * 32, x2: 110, y2: -122 + r * 32, stroke: rgba(tint, 0.4), strokeWidth: 3 }),
            [0, 1, 2, 3, 4].map((i) => R("circle", { key: "bd" + i, cx: -90 + i * 26 + Math.sin(t * 0.5 + r * 1.6 + i) * 8 + (r % 2 ? 60 : 0), cy: -122 + r * 32, r: 10, fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.7) }))))),
        R("g", { transform: "translate(430," + (bench - 6) + ")" },
          R("path", { d: "M -26 0 h 52 l -6 -40 h -40 z", fill: rgba(theme.ink, 0.8), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("path", { d: "M 4 -40 q 40 -90 26 -170 q -34 84 -40 168 z", fill: rgba(theme.surface, inv ? 0.5 : 0.95), stroke: rgba(tint, 0.4), strokeWidth: 3, transform: "rotate(" + (Math.sin(t * 0.6) * 1.6).toFixed(2) + ")" })),
        /* dust */
        [0, 1, 2, 3, 4].map((i) => {
          const ph = (t * (0.08 + i * 0.02) + i * 0.18) % 1;
          return R("circle", { key: "dt" + i, cx: 300 + i * 160 + Math.sin(t * 0.6 + i) * 30, cy: bench - ph * 700, r: 3 + (i % 3) * 2, fill: rgba(tint, 0.28 * (1 - ph)) });
        }));
    },
  });
})();
