/* mega-pack-3.js — Velvet Brass, Scoop Lab, Pedal Express, Moon Card, Magma Trail,
   Wing Garden, Atlas & Ink, On Air, Steam Spring, Turbine Coast */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ---- Velvet Brass: jazz lounge — spotlight sweep, rising notes, piano strip ---- */
  FilmKit.make({
    global: "VelvetBrass", variants: { Cursor: "slider", Scroll: "stack", Notify: "drop", Morph: "fade" },
    brand: "Velvet Brass", desk: "#170b12", ambient: 1.6,
    FH: '"Yeseva One", serif', FB: '"Jost", sans-serif',
    palette: (t) => ({ velvet: t.velvet || "#2a1420", brass: t.brass || "#cf9b52", cream: "#f0e8da", blue: "#34687a", ink: "#1c0e16" }),
    tweaks: [{ k: "velvet", label: "Room", options: ["#2a1420", "#1c142a", "#241a14"] }, { k: "brass", label: "Brass", options: ["#cf9b52", "#c9a24b", "#b8743d"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: theme.currentBg }, R2("path", { d: "M9 18V5l10-2v12" }), R2("circle", { cx: 6.5, cy: 18, r: 2.8 }), R2("circle", { cx: 16.5, cy: 15, r: 2.8 })),
    cams: ["zoomIn", "pushL", "drop", "zoomOut", "pushR", "pushU"], camMul: 5, camOff: 1,
    mag: { rot: 0.5, driftX: 6, inn: 0.26 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.08,
    look: {
      hook: { bg: "velvet", fg: "cream", hi: "brass", world: true, top: 330, size: 120, kicker: { v: "outline", c: "brass" } },
      statement: { bg: "ink", fg: "cream", hi: "brass", world: false, top: 630, size: 146 },
      feature: { bg: "velvet", fg: "cream", hi: "brass", world: true, top: 250, size: 96, card: { v: "glow", bg: "ink", glow: "brass", r: 18, line: "cream" }, chips: { v: "outline", colors: ["brass", "blue"], text: "ink" } },
      montage: { bg: "ink", fg: "cream", hi: "brass", world: false, top: 258, size: 92, tile: { bg: "velvet", line: "cream", label: "brass", r: 14 }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "velvet", fg: "cream", hi: "brass", world: true, cols: ["brass", "blue", "cream"], num: 148 },
      cta: { bg: "brass", fg: "ink", hi: "cream", world: false, top: 500, size: 116, btn: { v: "block", bg: "ink", c: "cream" }, logoShape: "circle" },
      app: { bg: "velvet", fg: "cream", hi: "brass", cardBg: "#38202c", line: "cream", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("polygon", { points: (u.W - 160) + ",0 " + (u.W - 560 + Math.sin(t * 0.6) * 160) + "," + (u.H - 300) + " " + (u.W - 200 + Math.sin(t * 0.6) * 160) + "," + (u.H - 300), fill: rgba(theme.brass, 0.12) }),
      R("ellipse", { cx: u.W - 380 + Math.sin(t * 0.6) * 160, cy: u.H - 290, rx: 180, ry: 30, fill: rgba(theme.brass, 0.18) }),
      [0, 1, 2, 3].map((i) => {
        const ph = (t * 0.16 + i * 0.26) % 1;
        const nx = 140 + i * 150 + Math.sin(ph * 6 + i) * 30, ny = u.H - 260 - ph * 900;
        return R("g", { key: i, transform: "translate(" + nx + "," + ny + ")", opacity: 0.5 * (1 - ph) + 0.1 },
          R("ellipse", { cx: 0, cy: 0, rx: 11, ry: 8, fill: theme.cream, transform: "rotate(-18)" }),
          R("line", { x1: 10, y1: -4, x2: 10, y2: -44, stroke: theme.cream, strokeWidth: 4 }),
          (i % 2 === 0) && R("path", { d: "M 10 -44 q 16 4 14 18", fill: "none", stroke: theme.cream, strokeWidth: 4 }));
      }),
      R("g", { transform: "translate(0," + (u.H - 120) + ")" },
        Array.from({ length: 14 }).map((_, i) => R("rect", { key: i, x: i * (u.W / 14), width: u.W / 14 - 3, height: 120, fill: rgba(theme.cream, Math.floor(t * 2.2) % 14 === i ? 0.35 : 0.12) })),
        [1, 2, 4, 5, 6, 8, 9, 11, 12, 13].map((k) => R("rect", { key: "b" + k, x: k * (u.W / 14) - 14, width: 28, height: 74, fill: rgba(theme.ink, 0.9) }))),
      R("path", { d: "M 130 300 q 30 -60 -6 -120 q -30 -54 6 -110", fill: "none", stroke: rgba(theme.cream, 0.14), strokeWidth: 10, strokeLinecap: "round" })),
  });

  /* ---- Scoop Lab: dripping scoop, falling sprinkles, cherry bounce ---- */
  FilmKit.make({
    global: "ScoopLab", variants: { Cursor: "click", Ring: "bar", Toggle: "switch", Swipe: "swipe" },
    brand: "Scoop Lab", desk: "#f2c8d8", ambient: 2.0,
    FH: '"Titan One", sans-serif', FB: '"Varela Round", sans-serif',
    palette: (t) => ({ cream: t.cream || "#fdeff2", pink: t.pink || "#f25d9c", mint: "#59c9a5", waffle: "#d9a05b", ink: "#33202a" }),
    tweaks: [{ k: "cream", label: "Parlor", options: ["#fdeff2", "#fdf4e8", "#eef6f2"] }, { k: "pink", label: "Scoop", options: ["#f25d9c", "#f2825d", "#8c6fd0"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M7 11a5 5 0 1 1 10 0zM7 11l5 10 5-10" })),
    cams: ["hopU", "spin", "pushR", "zoomIn", "pushL", "drop"], camMul: 3, camOff: 2,
    mag: { rot: 1.5, driftX: 10, driftY: 9 }, titlePreset: "bounce", itemPreset: "pop", titleLine: 1.05,
    look: {
      hook: { bg: "cream", fg: "ink", hi: "pink", world: true, top: 330, size: 126, upper: true, kicker: { v: "pill", bg: "pink", c: "cream" } },
      statement: { bg: "pink", fg: "cream", hi: "ink", world: false, top: 630, size: 150, upper: true },
      feature: { bg: "cream", fg: "ink", hi: "pink", world: true, top: 250, size: 98, upper: true, card: { v: "tilt", bg: "ink", r: 26, line: "cream" }, chips: { v: "pill", colors: ["pink", "mint", "waffle"], text: "cream" } },
      montage: { bg: "mint", fg: "ink", hi: "cream", world: false, top: 258, size: 94, upper: true, tile: { bg: "cream", line: "ink", label: "ink", r: 22 }, tilts: [-3, 2.5, 2, -2.5] },
      stats: { bg: "cream", fg: "ink", hi: "pink", world: true, cols: ["pink", "mint", "waffle"], num: 152, upper: true },
      cta: { bg: "ink", fg: "cream", hi: "pink", world: false, top: 500, size: 120, upper: true, btn: { v: "pill", bg: "pink", c: "cream" }, logoShape: "circle" },
      app: { bg: "cream", fg: "ink", hi: "pink", cardBg: "#ffffff", line: "ink", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      Array.from({ length: 12 }).map((_, i) => {
        const ph = (t * (0.22 + (i % 3) * 0.08) + i * 0.09) % 1;
        return R("rect", { key: i, x: (i * 97 + 30) % u.W, y: ph * (u.H + 60) - 30, width: 16, height: 6, rx: 3, fill: [theme.pink, theme.mint, theme.waffle][i % 3], transform: "rotate(" + (ph * 320 + i * 30) + " " + ((i * 97 + 30) % u.W + 8) + " " + (ph * (u.H + 60) - 27) + ")", opacity: 0.75 });
      }),
      (function () {
        const drip = (t * 0.5) % 1;
        return R("g", { transform: "translate(" + (u.W - 220) + "," + (u.H - 480) + ")" },
          R("polygon", { points: "-58,10 58,10 0,150", fill: theme.waffle }),
          R("path", { d: "M -50 20 L 50 20 M -40 50 L 40 50 M -28 84 L 28 84 M -30 16 L 10 120 M 30 16 L -10 120", stroke: rgba(theme.ink, 0.25), strokeWidth: 4 }),
          R("circle", { cy: -30, r: 62, fill: theme.pink }),
          R("circle", { cx: -20, cy: -74, r: 12, fill: rgba("#ffffff", 0.5) }),
          R("path", { d: "M -58 -18 q 10 26 22 6 q 8 20 20 4 q 10 22 22 4 q 8 16 20 0", fill: "none", stroke: theme.pink, strokeWidth: 10, strokeLinecap: "round" }),
          R("circle", { cx: 44, cy: 10 + drip * 130, r: 8 * (1 - drip * 0.4), fill: theme.pink, opacity: 1 - drip * 0.6 }),
          R("circle", { cy: -100 - Math.abs(Math.sin(t * 2.4)) * 26, r: 13, fill: "#c0304e" }),
          R("line", { x1: 0, y1: -113 - Math.abs(Math.sin(t * 2.4)) * 26, x2: 8, y2: -138 - Math.abs(Math.sin(t * 2.4)) * 26, stroke: "#5c8c46", strokeWidth: 4, strokeLinecap: "round" }));
      })(),
      [0, 1, 2].map((i) => R("circle", { key: "b" + i, cx: 120 + i * 90, cy: 240 + Math.sin(t * 1.6 + i * 1.4) * 20, r: 22 - i * 4, fill: "none", stroke: rgba(theme.pink, 0.4 - i * 0.08), strokeWidth: 6 }))),
  });

  /* ---- Pedal Express: wheel spokes, speed lines, route dash, skyline scroll ---- */
  FilmKit.make({
    global: "PedalExpress", variants: { Ring: "gauge", Scroll: "ticker", Notify: "side", DragDrop: "drag" },
    brand: "Pedal Express", desk: "#17181c", ambient: 2.0,
    FH: '"Passion One", sans-serif', FB: '"Fira Sans", sans-serif',
    palette: (t) => ({ asphalt: t.asphalt || "#26282c", orange: t.orange || "#ff6b35", cyan: "#4cc9f0", chalk: "#f2f4f6", ink: "#1b1d21" }),
    tweaks: [{ k: "asphalt", label: "Street", options: ["#26282c", "#22262e", "#2a2426"] }, { k: "orange", label: "Courier", options: ["#ff6b35", "#ffd23c", "#f25d9c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("circle", { cx: 6, cy: 16, r: 4 }), R2("circle", { cx: 18, cy: 16, r: 4 }), R2("path", { d: "M6 16l4-8h5l3 8M10 8h5" })),
    cams: ["pushL", "pushR", "zoomIn", "pushU", "spin", "drop"], camMul: 7, camOff: 0,
    mag: { skew: 5, rot: 1.0, slide: 0.34, inn: 0.17 }, titlePreset: "streak", itemPreset: "streak", titleSpace: "0.01em",
    look: {
      hook: { bg: "asphalt", fg: "chalk", hi: "orange", world: true, top: 310, size: 128, upper: true, kicker: { v: "tag", bg: "orange", c: "ink" } },
      statement: { bg: "orange", fg: "ink", hi: "chalk", world: false, top: 630, size: 152, upper: true },
      feature: { bg: "asphalt", fg: "chalk", hi: "cyan", world: true, top: 248, size: 100, upper: true, card: { v: "frame", bg: "ink", r: 12, line: "chalk" }, chips: { v: "square", colors: ["orange", "cyan", "chalk"], text: "ink" } },
      montage: { bg: "ink", fg: "chalk", hi: "orange", world: false, top: 258, size: 96, upper: true, tile: { bg: "asphalt", line: "chalk", label: "cyan", r: 8 }, tilts: [-3, 2, 2.5, -2] },
      stats: { bg: "asphalt", fg: "chalk", hi: "orange", world: true, cols: ["orange", "cyan", "chalk"], num: 154, upper: true, rule: true },
      cta: { bg: "cyan", fg: "ink", hi: "orange", world: false, top: 500, size: 122, upper: true, btn: { v: "block", bg: "ink", c: "chalk" }, logoShape: "rounded" },
      app: { bg: "asphalt", fg: "chalk", hi: "orange", cardBg: "#2f3238", line: "chalk", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1, 2, 3, 4].map((i) => R("rect", { key: i, x: ((i * 260 - t * 620) % (u.W + 300) + (u.W + 300)) % (u.W + 300) - 150, y: u.H - 560 - (i % 3) * 130, width: 120 + (i % 2) * 80, height: 560 + (i % 3) * 130, fill: rgba(theme.ink, 0.55 - (i % 3) * 0.12) })),
      (function () {
        const wy = u.H - 260, wx = 260;
        return R("g", { transform: "translate(" + wx + "," + wy + ")" },
          R("circle", { r: 90, fill: "none", stroke: theme.chalk, strokeWidth: 9 }),
          Array.from({ length: 6 }).map((_, i) => R("line", { key: i, x1: 0, y1: 0, x2: Math.cos(t * 5 + i * Math.PI / 3) * 84, y2: Math.sin(t * 5 + i * Math.PI / 3) * 84, stroke: rgba(theme.chalk, 0.7), strokeWidth: 5 })),
          R("circle", { r: 14, fill: theme.orange }));
      })(),
      [0, 1, 2].map((i) => R("line", { key: "s" + i, x1: 380 + ((t * 900 + i * 260) % 500), y1: u.H - 330 + i * 44, x2: 500 + ((t * 900 + i * 260) % 500), y2: u.H - 330 + i * 44, stroke: rgba(theme.cyan, 0.6 - i * 0.15), strokeWidth: 8 - i * 2, strokeLinecap: "round" })),
      R("path", { d: "M 80 240 q 200 80 130 220 q -60 120 180 140", fill: "none", stroke: theme.orange, strokeWidth: 7, strokeDasharray: "22 16", strokeDashoffset: String(-t * 90), opacity: 0.7 }),
      R("circle", { cx: 80, cy: 240, r: 12, fill: theme.cyan }),
      R("g", { transform: "translate(390,600)" }, R("path", { d: "M 0 0 l 14 -22 l 14 22 z", fill: theme.orange }), R("circle", { cx: 14, cy: 10, r: 4, fill: theme.ink }))),
  });

  /* ---- Moon Card: moon phases, floating cards, candle flicker ---- */
  FilmKit.make({
    global: "MoonCard", variants: { Swipe: "flip", Morph: "fade", Ring: "ring", Typing: "caret" },
    brand: "Moon Card", desk: "#0e0a18", ambient: 1.4,
    FH: '"Italiana", serif', FB: '"Sen", sans-serif',
    palette: (t) => ({ violet: t.violet || "#1d1430", gold: t.gold || "#d4af6a", blush: "#e8b4c8", bone: "#f2ead9", ink: "#140e22" }),
    tweaks: [{ k: "violet", label: "Night", options: ["#1d1430", "#141a30", "#221024"] }, { k: "gold", label: "Gilt", options: ["#d4af6a", "#c9a24b", "#b8969e"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: theme.currentBg }, R2("path", { d: "M15 3a9 9 0 1 0 6 15.5A10 10 0 0 1 15 3z" })),
    cams: ["zoomOut", "drop", "pushL", "zoomIn", "pushU", "pushR"], camMul: 5, camOff: 3,
    mag: { rot: 0.4, driftY: 9, inn: 0.3, driftZ: 0.035 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.12, titleSpace: "0.04em",
    look: {
      hook: { bg: "violet", fg: "bone", hi: "gold", world: true, top: 340, size: 116, upper: true, kicker: { v: "bare", c: "gold" } },
      statement: { bg: "ink", fg: "bone", hi: "blush", world: true, top: 640, size: 138, upper: true },
      feature: { bg: "violet", fg: "bone", hi: "gold", world: true, top: 250, size: 92, upper: true, card: { v: "glow", bg: "ink", glow: "gold", r: 20, line: "bone" }, chips: { v: "outline", colors: ["gold", "blush"], text: "ink" } },
      montage: { bg: "ink", fg: "bone", hi: "gold", world: true, top: 258, size: 90, upper: true, tile: { bg: "#241a38", line: "bone", label: "gold", r: 16, glow: "gold" }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "violet", fg: "bone", hi: "gold", world: true, cols: ["gold", "blush", "bone"], num: 146, glowNums: true, upper: true },
      cta: { bg: "ink", fg: "bone", hi: "gold", world: true, top: 500, size: 112, upper: true, btn: { v: "glow", bg: "gold", c: "ink" }, logoShape: "circle" },
      app: { bg: "violet", fg: "bone", hi: "gold", cardBg: "#281c40", line: "bone", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1, 2, 3, 4].map((i) => {
        const r = 26;
        return R("g", { key: i, transform: "translate(" + (u.W / 2 - 240 + i * 120) + ",180)" },
          R("circle", { r, fill: i === 4 ? theme.gold : "none", stroke: theme.gold, strokeWidth: 3, opacity: 0.85 }),
          i < 4 && R("path", { d: "M 0 -" + r + " a " + r + " " + r + " 0 0 1 0 " + (2 * r) + " a " + (r * (1 - i * 0.5)) + " " + r + " 0 0 " + (i < 2 ? 1 : 0) + " 0 -" + (2 * r), fill: rgba(theme.gold, 0.8) }));
      }),
      Array.from({ length: 18 }).map((_, i) => R("circle", { key: "s" + i, cx: (i * 173 + 50) % u.W, cy: (i * 229 + 80) % (u.H * 0.7), r: 1.5 + (i % 2), fill: rgba(theme.bone, 0.25 + 0.5 * Math.abs(Math.sin(t + i * 1.7))) })),
      [0, 1].map((i) => {
        const fl = Math.sin(t * (0.5 + i * 0.2) + i * 3) * 10;
        return R("g", { key: "c" + i, transform: "translate(" + (170 + i * (u.W - 360)) + "," + (u.H - 460 + i * 90) + ") rotate(" + (fl + (i ? 9 : -9)) + ")" },
          R("rect", { x: -56, y: -84, width: 112, height: 168, rx: 12, fill: rgba(theme.ink, 0.9), stroke: theme.gold, strokeWidth: 2.5 }),
          R("circle", { r: 30, fill: "none", stroke: rgba(theme.gold, 0.7), strokeWidth: 2 }),
          R("path", { d: "M -30 -54 h60 M -30 54 h60", stroke: rgba(theme.gold, 0.4), strokeWidth: 2 }));
      }),
      (function () {
        const fl = 1 + Math.sin(t * 7) * 0.18 + Math.sin(t * 13.7) * 0.1;
        return R("g", { transform: "translate(" + (u.W - 150) + "," + (u.H - 240) + ")" },
          R("rect", { x: -16, y: 0, width: 32, height: 90, rx: 8, fill: theme.bone, opacity: 0.85 }),
          R("ellipse", { cy: -18, rx: 9 * fl, ry: 20 * fl, fill: theme.gold }),
          R("ellipse", { cy: -14, rx: 4 * fl, ry: 10 * fl, fill: rgba("#fff8e0", 0.9) }));
      })()),
  });

  /* ---- Magma Trail: volcano glow, lava bombs, plume, shimmer ---- */
  FilmKit.make({
    global: "MagmaTrail", variants: { Ring: "gauge", Scroll: "board", Notify: "drop", Morph: "roll" },
    brand: "Magma Trail", desk: "#141110", ambient: 1.8,
    FH: '"Bevan", serif', FB: '"Commissioner", sans-serif',
    palette: (t) => ({ basalt: t.basalt || "#1f1a18", lava: t.lava || "#f43f1e", ash: "#8c8480", bone: "#efe6dc", ember: "#ffa03c" }),
    tweaks: [{ k: "basalt", label: "Rock", options: ["#1f1a18", "#1a1c20", "#241812"] }, { k: "lava", label: "Lava", options: ["#f43f1e", "#ff6b35", "#e63946"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M4 20L10 6h4l6 14zM10 6l2-3 2 3" })),
    cams: ["pushU", "zoomIn", "drop", "pushL", "spin", "pushR"], camMul: 7, camOff: 2,
    mag: { rot: 1.0, skew: 3, driftY: 10 }, titlePreset: "slam", itemPreset: "pop", titleSpace: "0.01em",
    look: {
      hook: { bg: "basalt", fg: "bone", hi: "lava", world: true, top: 310, size: 122, upper: true, kicker: { v: "tag", bg: "lava", c: "bone" } },
      statement: { bg: "lava", fg: "bone", hi: "basalt", world: false, top: 630, size: 148, upper: true },
      feature: { bg: "basalt", fg: "bone", hi: "ember", world: true, top: 248, size: 96, upper: true, card: { v: "glow", bg: "#161211", glow: "lava", r: 14, line: "bone" }, chips: { v: "square", colors: ["lava", "ember", "ash"], text: "basalt" } },
      montage: { bg: "#161211", fg: "bone", hi: "lava", world: false, top: 258, size: 94, upper: true, tile: { bg: "basalt", line: "bone", label: "ember", r: 10 }, tilts: [-2.5, 2, 1.5, -2] },
      stats: { bg: "basalt", fg: "bone", hi: "lava", world: true, cols: ["lava", "ember", "ash"], num: 150, upper: true, glowNums: true },
      cta: { bg: "#161211", fg: "bone", hi: "lava", world: true, top: 500, size: 118, upper: true, btn: { v: "glow", bg: "lava", c: "bone" }, logoShape: "rounded" },
      app: { bg: "basalt", fg: "bone", hi: "lava", cardBg: "#292220", line: "bone", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("path", { d: "M -20 " + u.H + " L " + (u.W * 0.32) + " " + (u.H - 620) + " L " + (u.W * 0.44) + " " + (u.H - 600) + " L " + (u.W * 0.58) + " " + (u.H - 660) + " L " + (u.W + 20) + " " + u.H + " Z", fill: rgba(theme.ash, 0.16) }),
      R("path", { d: "M " + (u.W * 0.4) + " " + (u.H - 614) + " q 40 24 80 -8 l -18 -34 q -24 16 -44 6 z", fill: theme.lava, opacity: 0.7 + Math.sin(t * 3) * 0.2 }),
      [0, 1, 2, 3].map((i) => {
        const ph = (t * 0.55 + i * 0.25) % 1;
        const bx = u.W * 0.46 + (i - 1.5) * 130 * ph;
        const by = (u.H - 640) - Math.sin(ph * Math.PI) * 300 + ph * ph * 500;
        return R("circle", { key: i, cx: bx, cy: by, r: 9 + (i % 2) * 5, fill: i % 2 ? theme.ember : theme.lava, opacity: 1 - ph * 0.6 });
      }),
      [0, 1, 2].map((i) => {
        const ph = (t * 0.2 + i * 0.33) % 1;
        return R("circle", { key: "p" + i, cx: u.W * 0.47 + Math.sin(ph * 4 + i) * 40, cy: (u.H - 680) - ph * 500, r: 30 + ph * 60, fill: rgba(theme.ash, 0.2 * (1 - ph)) });
      }),
      [0, 1, 2].map((i) => R("path", { key: "s" + i, d: "M " + (140 + i * 110) + " " + (u.H - 210) + " q 12 -22 0 -44 q -12 -22 0 -44", fill: "none", stroke: rgba(theme.ember, 0.3), strokeWidth: 5, strokeLinecap: "round", transform: "translate(0," + (-((t * 60 + i * 40) % 120)) + ")", opacity: 0.5 })),
      R("path", { d: "M 90 " + (u.H - 140) + " l 60 -30 l 70 22 l 80 -36 l 90 24", fill: "none", stroke: theme.lava, strokeWidth: 6, strokeDasharray: "14 12", strokeDashoffset: String(-t * 50), opacity: 0.65 })),
  });

  /* ---- Wing Garden: butterflies flapping on sine paths, stems, soft rays ---- */
  FilmKit.make({
    global: "WingGarden", variants: { Toggle: "check", Notify: "pop", Scroll: "feed", DragDrop: "drag" },
    brand: "Wing Garden", desk: "#1e2818", ambient: 1.7,
    FH: '"Lobster Two", serif', FB: '"Cabin", sans-serif',
    palette: (t) => ({ leaf: t.leaf || "#2e4636", monarch: t.monarch || "#f28c28", morpho: "#4a7de0", cream: "#f4efe2", ink: "#24301f" }),
    tweaks: [{ k: "leaf", label: "Garden", options: ["#2e4636", "#3a4a2e", "#2c3e46"] }, { k: "monarch", label: "Wings", options: ["#f28c28", "#e05e7a", "#e8c93c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M12 6v12M12 8c-2-4-8-5-8 0s5 7 8 4M12 8c2-4 8-5 8 0s-5 7-8 4" })),
    cams: ["hopU", "zoomOut", "pushR", "zoomIn", "pushL", "drop"], camMul: 5, camOff: 1,
    mag: { rot: 0.8, driftX: 9, driftY: 8 }, titlePreset: "rise", itemPreset: "pop", titleLine: 1.06,
    look: {
      hook: { bg: "leaf", fg: "cream", hi: "monarch", world: true, top: 330, size: 122, kicker: { v: "pill", bg: "monarch", c: "ink" } },
      statement: { bg: "ink", fg: "cream", hi: "monarch", world: false, top: 630, size: 146 },
      feature: { bg: "leaf", fg: "cream", hi: "monarch", world: true, top: 250, size: 96, card: { v: "frame", bg: "ink", r: 24, line: "cream" }, chips: { v: "pill", colors: ["monarch", "morpho"], text: "cream" } },
      montage: { bg: "ink", fg: "cream", hi: "monarch", world: false, top: 258, size: 92, tile: { bg: "leaf", line: "cream", label: "cream", r: 20 }, tilts: [-2.5, 2, 1.5, -2] },
      stats: { bg: "leaf", fg: "cream", hi: "monarch", world: true, cols: ["monarch", "morpho", "cream"], num: 150 },
      cta: { bg: "monarch", fg: "ink", hi: "cream", world: false, top: 500, size: 118, btn: { v: "pill", bg: "ink", c: "cream" }, logoShape: "circle" },
      app: { bg: "leaf", fg: "cream", hi: "monarch", cardBg: "#3a5244", line: "cream", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1, 2].map((i) => {
        const ph = (t * (0.08 + i * 0.03) + i * 0.4) % 1;
        const bx = ph * (u.W + 200) - 100;
        const by = 260 + i * 200 + Math.sin(ph * 9 + i * 2) * 90;
        const flap = Math.abs(Math.sin(t * 9 + i * 2));
        const c = i === 1 ? theme.morpho : theme.monarch;
        return R("g", { key: i, transform: "translate(" + bx + "," + by + ") rotate(" + Math.sin(ph * 9 + i) * 14 + ")" },
          R("line", { x1: 0, y1: -12, x2: 0, y2: 14, stroke: theme.ink, strokeWidth: 5, strokeLinecap: "round" }),
          R("path", { d: "M 0 -6 q -34 -28 -40 -2 q -4 22 40 12 z", fill: c, transform: "scaleX(" + (0.35 + flap * 0.65) + ")", opacity: 0.92 }),
          R("path", { d: "M 0 -6 q 34 -28 40 -2 q 4 22 -40 12 z", fill: c, transform: "scaleX(" + (0.35 + flap * 0.65) + ")", opacity: 0.92 }),
          R("path", { d: "M 0 -14 l -7 -10 M 0 -14 l 7 -10", stroke: theme.ink, strokeWidth: 3, strokeLinecap: "round" }));
      }),
      [[130, 0], [200, 1], [u.W - 170, 2]].map(([x, i]) => R("g", { key: "f" + i, transform: "translate(" + x + "," + (u.H - 140) + ") rotate(" + Math.sin(t * 0.9 + i) * 5 + " 0 0)" },
        R("path", { d: "M 0 0 q " + (8 + i * 4) + " -120 0 -220", fill: "none", stroke: rgba(theme.cream, 0.45), strokeWidth: 6 }),
        R("circle", { cy: -226, r: 20, fill: [theme.monarch, theme.morpho, theme.cream][i % 3], opacity: 0.85 }),
        Array.from({ length: 5 }).map((_, k) => R("ellipse", { key: k, cy: -226, rx: 9, ry: 20, fill: rgba(theme.cream, 0.7), transform: "rotate(" + k * 72 + " 0 -226)" })))),
      Array.from({ length: 3 }).map((_, i) => R("line", { key: "r" + i, x1: u.W - 100 - i * 130, y1: -20, x2: u.W - 320 - i * 130, y2: 500, stroke: rgba(theme.cream, 0.06), strokeWidth: 60 }))),
  });

  /* ---- Atlas & Ink: voyage route, compass rose, sea monster, grid ---- */
  FilmKit.make({
    global: "AtlasInk", variants: { Typing: "typewriter", DragDrop: "assemble", Ring: "gauge", Scroll: "board" },
    brand: "Atlas & Ink", desk: "#3a3226", ambient: 1.5,
    FH: '"Young Serif", serif', FB: '"Assistant", sans-serif',
    palette: (t) => ({ parch: t.parch || "#efe4cf", sepia: "#4a3826", compass: t.compass || "#a8402e", sea: "#6a92a8", gold: "#c9a24b" }),
    tweaks: [{ k: "parch", label: "Parchment", options: ["#efe4cf", "#e8dcc0", "#f0e9d8"] }, { k: "compass", label: "Rose", options: ["#a8402e", "#2e5fb3", "#3e5c3a"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("circle", { cx: 12, cy: 12, r: 9 }), R2("path", { d: "M15.5 8.5l-2 5-5 2 2-5z" })),
    cams: ["zoomOut", "pushL", "drop", "pushR", "zoomIn", "hopU"], camMul: 5, camOff: 0,
    mag: { rot: 0.4, driftX: 5, inn: 0.28 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.08,
    look: {
      hook: { bg: "parch", fg: "sepia", hi: "compass", world: true, top: 330, size: 118, kicker: { v: "bare", c: "sea" } },
      statement: { bg: "sepia", fg: "parch", hi: "gold", world: false, top: 630, size: 142 },
      feature: { bg: "parch", fg: "sepia", hi: "compass", world: true, top: 250, size: 94, card: { v: "paper", bg: "parch", r: 6, line: "sepia" }, chips: { v: "outline", colors: ["compass", "sea"], text: "parch" } },
      montage: { bg: "sepia", fg: "parch", hi: "gold", world: false, top: 258, size: 90, tile: { bg: "parch", line: "sepia", label: "parch", r: 4 }, tilts: [-1.5, 1, 1.5, -1] },
      stats: { bg: "parch", fg: "sepia", hi: "compass", world: true, cols: ["compass", "sea", "sepia"], num: 146 },
      cta: { bg: "compass", fg: "parch", hi: "gold", world: false, top: 500, size: 114, btn: { v: "block", bg: "parch", c: "sepia" }, logoShape: "rounded" },
      app: { bg: "parch", fg: "sepia", hi: "compass", cardBg: "#f8f0e0", line: "sepia", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      Array.from({ length: 5 }).map((_, i) => R("line", { key: "h" + i, x1: 0, y1: 200 + i * 340, x2: u.W, y2: 200 + i * 340, stroke: rgba(theme.sepia, 0.1), strokeWidth: 2 })),
      Array.from({ length: 4 }).map((_, i) => R("line", { key: "v" + i, x1: 140 + i * 280, y1: 0, x2: 140 + i * 280, y2: u.H, stroke: rgba(theme.sepia, 0.1), strokeWidth: 2 })),
      R("path", { d: "M -20 500 q 140 -60 240 20 q 90 70 30 150 q -50 70 -170 40 q -80 -20 -100 -90", fill: rgba(theme.sea, 0.16), stroke: rgba(theme.sepia, 0.35), strokeWidth: 3 }),
      (function () {
        const len = 1400, draw = u.seg(p, 0.06, 0.85);
        return R("g", null,
          R("path", { d: "M 150 620 q 220 -140 380 -60 q 200 100 300 -40 q 60 -90 60 -180", fill: "none", stroke: theme.compass, strokeWidth: 5, strokeDasharray: "18 14", strokeDashoffset: String(len * (1 - draw)), opacity: 0.8 }),
          R("circle", { cx: 150, cy: 620, r: 10, fill: theme.compass }),
          R("path", { d: "M 876 328 l 14 22 h -28 z", fill: theme.compass, opacity: draw > 0.95 ? 1 : 0 }));
      })(),
      R("g", { transform: "translate(" + (u.W - 190) + "," + (u.H - 330) + ") rotate(" + Math.sin(t * 0.5) * 8 + ")" },
        R("circle", { r: 84, fill: "none", stroke: rgba(theme.sepia, 0.5), strokeWidth: 3 }),
        R("circle", { r: 62, fill: "none", stroke: rgba(theme.sepia, 0.3), strokeWidth: 2 }),
        [0, 45, 90, 135].map((a) => R("g", { key: a, transform: "rotate(" + a + ")" },
          R("path", { d: "M 0 -80 L 10 0 L 0 12 L -10 0 Z", fill: a % 90 === 0 ? theme.compass : rgba(theme.sepia, 0.5) }))),
        R("circle", { r: 9, fill: theme.gold })),
      R("g", { transform: "translate(230," + (u.H - 200) + ")" },
        R("path", { d: "M -60 0 q 20 -34 50 -10 q 30 22 60 -8 q 20 -18 40 2", fill: "none", stroke: rgba(theme.sepia, 0.5), strokeWidth: 6, strokeLinecap: "round", transform: "translate(0," + Math.sin(t * 1.4) * 6 + ")" }),
        R("circle", { cx: -52, cy: -14, r: 4, fill: theme.sepia }),
        R("text", { x: 110, y: 8, fontFamily: '"Young Serif", serif', fontSize: 24, fontStyle: "italic", fill: rgba(theme.sepia, 0.55) }, "hic sunt dracones"))),
  });

  /* ---- On Air: waveform bars, blinking sign, mic, sound rings ---- */
  FilmKit.make({
    global: "OnAir", variants: { Cursor: "click", Ring: "bar", Notify: "side", Typing: "caret" },
    brand: "On Air", desk: "#101216", ambient: 1.8,
    FH: '"Unbounded", sans-serif', FB: '"Wix Madefor Text", sans-serif',
    palette: (t) => ({ studio: t.studio || "#16181d", purple: t.purple || "#8b5cf6", signal: "#3ddc84", fog: "#e8e9ee", ink: "#101216" }),
    tweaks: [{ k: "studio", label: "Booth", options: ["#16181d", "#181420", "#141a1a"] }, { k: "purple", label: "Accent", options: ["#8b5cf6", "#f25d9c", "#4cc9f0"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("rect", { x: 9, y: 3, width: 6, height: 11, rx: 3 }), R2("path", { d: "M5 11a7 7 0 0 0 14 0M12 18v3" })),
    cams: ["pushL", "zoomIn", "pushD", "pushR", "zoomOut", "hopU"], camMul: 7, camOff: 1,
    mag: { rot: 0.7, inn: 0.2 }, titlePreset: "machete", itemPreset: "streak",
    look: {
      hook: { bg: "studio", fg: "fog", hi: "purple", world: true, top: 320, size: 118, upper: true, kicker: { v: "tag", bg: "signal", c: "ink" } },
      statement: { bg: "purple", fg: "fog", hi: "ink", world: false, top: 630, size: 144, upper: true },
      feature: { bg: "studio", fg: "fog", hi: "signal", world: true, top: 250, size: 94, upper: true, card: { v: "glow", bg: "#111318", glow: "purple", r: 18, line: "fog" }, chips: { v: "pill", colors: ["purple", "signal"], text: "ink" } },
      montage: { bg: "#111318", fg: "fog", hi: "purple", world: false, top: 258, size: 92, upper: true, tile: { bg: "studio", line: "fog", label: "signal", r: 14, glow: "purple" }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "studio", fg: "fog", hi: "purple", world: true, cols: ["purple", "signal", "fog"], num: 148, upper: true, glowNums: true },
      cta: { bg: "#111318", fg: "fog", hi: "signal", world: true, top: 500, size: 116, upper: true, btn: { v: "glow", bg: "purple", c: "fog" }, logoShape: "rounded" },
      app: { bg: "studio", fg: "fog", hi: "purple", cardBg: "#1e2128", line: "fog", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      Array.from({ length: 22 }).map((_, i) => {
        const h = 20 + Math.abs(Math.sin(t * 2.4 + i * 0.6)) * 110 + Math.abs(Math.sin(t * 4.1 + i * 1.3)) * 40;
        return R("rect", { key: i, x: 60 + i * 44, y: u.H - 240 - h, width: 20, height: h, rx: 9, fill: rgba(i % 4 === 0 ? theme.signal : theme.purple, 0.55 + (i % 3) * 0.12) });
      }),
      R("g", { transform: "translate(" + (u.W - 220) + ",210)" },
        R("rect", { x: -120, y: -44, width: 240, height: 88, rx: 16, fill: "none", stroke: Math.sin(t * 2.8) > 0 ? theme.signal : rgba(theme.signal, 0.25), strokeWidth: 4 }),
        R("circle", { cx: -86, cy: 0, r: 11, fill: Math.sin(t * 2.8) > 0 ? theme.signal : rgba(theme.signal, 0.2) }),
        R("text", { x: 16, y: 12, textAnchor: "middle", fontFamily: '"Unbounded", sans-serif', fontSize: 30, fill: theme.fog, opacity: Math.sin(t * 2.8) > 0 ? 1 : 0.35 }, "ON AIR")),
      R("g", { transform: "translate(190,300)" },
        R("rect", { x: -26, y: -70, width: 52, height: 96, rx: 26, fill: rgba(theme.fog, 0.85) }),
        Array.from({ length: 4 }).map((_, i) => R("line", { key: i, x1: -16, y1: -54 + i * 18, x2: 16, y2: -54 + i * 18, stroke: rgba(theme.ink, 0.5), strokeWidth: 4 })),
        R("line", { x1: 0, y1: 26, x2: 0, y2: 90, stroke: rgba(theme.fog, 0.5), strokeWidth: 8 }),
        [0, 1, 2].map((i) => R("circle", { key: "r" + i, r: 60 + ((t * 90 + i * 45) % 140), fill: "none", stroke: rgba(theme.purple, 0.35 * (1 - (((t * 90 + i * 45) % 140) / 140))), strokeWidth: 3 }))),
      R("line", { x1: 60, y1: u.H - 200, x2: u.W - 60, y2: u.H - 200, stroke: rgba(theme.fog, 0.2), strokeWidth: 3 }),
      R("circle", { cx: 60 + ((t * 60) % (u.W - 120)), cy: u.H - 200, r: 9, fill: theme.signal })),
  });

  /* ---- Steam Spring: onsen — steam columns, rock pool, snowfall, lantern ---- */
  FilmKit.make({
    global: "SteamSpring", variants: { Toggle: "switch", Scroll: "feed", Typing: "hand", Notify: "drop" },
    brand: "Steam Spring", desk: "#1c2630", ambient: 1.4,
    FH: '"Castoro", serif', FB: '"Catamaran", sans-serif',
    palette: (t) => ({ stone: t.stone || "#33404a", water: t.water || "#7fc4bd", wood: "#a8794a", paper: "#f2ede2", ink: "#22303c" }),
    tweaks: [{ k: "stone", label: "Stone", options: ["#33404a", "#3a3a46", "#2e4640"] }, { k: "water", label: "Water", options: ["#7fc4bd", "#7fa4c4", "#9fc47f"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M4 15a8 4 0 0 0 16 0M8 11c0-2 2-2 2-4M12 11c0-2 2-2 2-4M16 11c0-2 2-2 2-4" })),
    cams: ["zoomOut", "pushU", "drop", "pushL", "zoomIn", "pushR"], camMul: 3, camOff: 2,
    mag: { rot: 0.3, driftY: 7, inn: 0.3, driftZ: 0.03 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.12,
    look: {
      hook: { bg: "stone", fg: "paper", hi: "water", world: true, top: 330, size: 116, kicker: { v: "outline", c: "water" } },
      statement: { bg: "ink", fg: "paper", hi: "water", world: false, top: 630, size: 142 },
      feature: { bg: "stone", fg: "paper", hi: "water", world: true, top: 250, size: 92, card: { v: "frame", bg: "ink", r: 20, line: "paper" }, chips: { v: "outline", colors: ["water", "wood"], text: "ink" } },
      montage: { bg: "ink", fg: "paper", hi: "water", world: false, top: 258, size: 90, tile: { bg: "stone", line: "paper", label: "water", r: 16 }, tilts: [-1.5, 1, 1.5, -1] },
      stats: { bg: "stone", fg: "paper", hi: "water", world: true, cols: ["water", "wood", "paper"], num: 146 },
      cta: { bg: "wood", fg: "paper", hi: "ink", world: false, top: 500, size: 114, btn: { v: "pill", bg: "ink", c: "paper" }, logoShape: "circle" },
      app: { bg: "stone", fg: "paper", hi: "water", cardBg: "#3e4e5a", line: "paper", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("ellipse", { cx: u.W / 2, cy: u.H - 260, rx: 380, ry: 90, fill: rgba(theme.water, 0.35) }),
      [0, 1, 2].map((i) => R("ellipse", { key: i, cx: u.W / 2 - 140 + i * 140, cy: u.H - 260, rx: 40 + ((t * 40 + i * 30) % 120), ry: 8 + ((t * 40 + i * 30) % 120) * 0.16, fill: "none", stroke: rgba(theme.paper, 0.25 * (1 - ((t * 40 + i * 30) % 120) / 120)), strokeWidth: 3 })),
      [[u.W / 2 - 320, 30], [u.W / 2 + 300, 44], [u.W / 2 - 180, 24]].map(([x, r], i) => R("ellipse", { key: "r" + i, cx: x, cy: u.H - 250 + (i % 2) * 30, rx: r + 26, ry: r, fill: rgba(theme.ink, 0.75) })),
      [0, 1, 2].map((i) => {
        const ph = (t * 0.2 + i * 0.33) % 1;
        return R("path", { key: "s" + i, d: "M " + (u.W / 2 - 130 + i * 130) + " " + (u.H - 320 - ph * 760) + " q 26 -50 0 -100 q -26 -50 0 -100", fill: "none", stroke: rgba(theme.paper, 0.22 * (1 - ph)), strokeWidth: 18, strokeLinecap: "round" });
      }),
      Array.from({ length: 12 }).map((_, i) => {
        const ph = (t * (0.06 + (i % 3) * 0.03) + i * 0.11) % 1;
        return R("circle", { key: "f" + i, cx: (i * 103 + 40) % u.W + Math.sin(t + i) * 24, cy: ph * (u.H - 340), r: 3.5 + (i % 2), fill: rgba("#ffffff", 0.5 * (1 - ph) + 0.15) });
      }),
      R("g", { transform: "translate(150," + (u.H - 470) + ")" },
        R("rect", { x: -8, y: 0, width: 16, height: 160, fill: theme.wood }),
        R("rect", { x: -46, y: -60, width: 92, height: 66, rx: 10, fill: rgba(theme.paper, 0.9) }),
        R("rect", { x: -52, y: -74, width: 104, height: 14, rx: 5, fill: theme.wood }),
        R("circle", { cy: -27, r: 12, fill: rgba("#ffb347", 0.65 + Math.sin(t * 5) * 0.25) }))),
  });

  /* ---- Turbine Coast: rotating turbines, waves, pylon, gull ---- */
  FilmKit.make({
    global: "TurbineCoast", variants: { Toggle: "dial", Code: "terminal", Notify: "side", Morph: "flap" },
    brand: "Turbine Coast", desk: "#c2d4d8", ambient: 1.7,
    FH: '"Michroma", sans-serif', FB: '"Saira", sans-serif',
    palette: (t) => ({ sky: t.sky || "#dce8ea", white: "#fafcfc", seagreen: t.seagreen || "#2e6e63", signal: "#e8641f", ink: "#22343c" }),
    tweaks: [{ k: "sky", label: "Sky", options: ["#dce8ea", "#e8e4dc", "#d8dce8"] }, { k: "seagreen", label: "Sea", options: ["#2e6e63", "#2e5f7a", "#4a6e2e"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M12 12V22M12 12L6 6M12 12l8-2M12 12l-2 8" }), R2("circle", { cx: 12, cy: 12, r: 2 })),
    cams: ["pushL", "zoomOut", "pushU", "pushR", "zoomIn", "drop"], camMul: 5, camOff: 3,
    mag: { rot: 0.4, slide: 0.3, driftX: 7 }, titlePreset: "rise", itemPreset: "rise", titleSpace: "0.03em", titleLine: 1.12,
    look: {
      hook: { bg: "sky", fg: "ink", hi: "signal", world: true, top: 320, size: 104, upper: true, kicker: { v: "outline", c: "seagreen" } },
      statement: { bg: "seagreen", fg: "white", hi: "sky", world: false, top: 630, size: 132, upper: true },
      feature: { bg: "sky", fg: "ink", hi: "signal", world: true, top: 250, size: 88, upper: true, card: { v: "frame", bg: "ink", r: 16, line: "white" }, chips: { v: "square", colors: ["seagreen", "signal"], text: "white" } },
      montage: { bg: "ink", fg: "white", hi: "signal", world: false, top: 258, size: 86, upper: true, tile: { bg: "sky", line: "ink", label: "sky", r: 12 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "sky", fg: "ink", hi: "seagreen", world: true, cols: ["seagreen", "signal", "ink"], num: 144, upper: true, rule: true },
      cta: { bg: "ink", fg: "white", hi: "signal", world: false, top: 500, size: 108, upper: true, btn: { v: "block", bg: "signal", c: "white" }, logoShape: "rounded" },
      app: { bg: "sky", fg: "ink", hi: "seagreen", cardBg: "#f4f8f8", line: "ink", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [[u.W * 0.24, u.H - 500, 1.0, 0], [u.W * 0.56, u.H - 560, 0.7, 2.1], [u.W * 0.82, u.H - 470, 0.5, 4.2]].map(([x, y, s, ph], i) =>
        R("g", { key: i, transform: "translate(" + x + "," + y + ") scale(" + s + ")" },
          R("path", { d: "M -10 0 L 10 0 L 5 -330 L -5 -330 Z", fill: theme.white, stroke: rgba(theme.ink, 0.2), strokeWidth: 2 }),
          R("g", { transform: "translate(0,-330) rotate(" + ((t * 60 * (1 - i * 0.2) + ph * 57) % 360) + ")" },
            [0, 120, 240].map((a) => R("path", { key: a, d: "M 0 0 L 14 -22 L 4 -150 L -6 -24 Z", fill: theme.white, stroke: rgba(theme.ink, 0.25), strokeWidth: 2, transform: "rotate(" + a + ")" }))),
          R("circle", { cy: -330, r: 12, fill: theme.signal }))),
      R("path", { d: "M -20 " + (u.H - 340) + " h " + (u.W + 40), stroke: rgba(theme.seagreen, 0.9), strokeWidth: 4 }),
      R("rect", { x: -20, y: u.H - 338, width: u.W + 40, height: 400, fill: rgba(theme.seagreen, 0.55) }),
      [0, 1, 2].map((i) => R("path", { key: "w" + i, d: "M -40 " + (u.H - 280 + i * 70) + " " + Array.from({ length: 6 }).map((_, s) => "q 100 " + (s % 2 ? 22 : -22) + " 200 0").join(" "), fill: "none", stroke: rgba(theme.white, 0.5 - i * 0.12), strokeWidth: 6, strokeLinecap: "round", transform: "translate(" + (-((t * (40 + i * 16)) % 400)) + ",0)" })),
      R("path", { d: "M " + (140 + Math.sin(t * 0.8) * 60) + " " + (220 + Math.cos(t * 0.9) * 24) + " q 14 -16 28 0 q 14 -16 28 0", fill: "none", stroke: rgba(theme.ink, 0.5), strokeWidth: 4, strokeLinecap: "round" }),
      R("text", { x: u.W - 60, y: 200, textAnchor: "end", fontFamily: '"Saira", sans-serif', fontSize: 26, fill: rgba(theme.ink, 0.5) }, "WIND " + (12 + Math.floor(Math.abs(Math.sin(t * 0.4)) * 6)) + " KN")),
  });
})();
