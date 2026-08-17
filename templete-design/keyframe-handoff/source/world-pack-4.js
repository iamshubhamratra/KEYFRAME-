/* world-pack-4.js — Metro Line, Serif Manifesto, Chalk Talk, Aurora Night, Robot Factory */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ---- Metro Line: transit-map lines snaking, a train dot running them ---- */
  FilmKit.make({
    global: "MetroLine", variants: {"Scroll":"board","Notify":"drop","Morph":"flap","Ring":"bar"}, brand: "Metro Line", desk: "#dcdcd4", ambient: 1.8,
    FH: '"Barlow Condensed", sans-serif', FB: '"Barlow", sans-serif',
    palette: (t) => ({ paper: t.paper || "#f4f4f0", red: t.red || "#d9363e", blue: "#2f6db5", green: "#3f9b57", yellow: "#e8b820", ink: "#1d1d1b" }),
    tweaks: [{ k: "paper", label: "Map", options: ["#f4f4f0", "#eef2f4", "#f4efe4"] }, { k: "red", label: "Line A", options: ["#d9363e", "#c2477e", "#e05e2c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("rect", { x: 5, y: 3, width: 14, height: 14, rx: 3 }), R2("path", { d: "M5 11h14M8 21l1.5-4M16 21l-1.5-4" }), R2("circle", { cx: 9, cy: 14, r: 0.5 }), R2("circle", { cx: 15, cy: 14, r: 0.5 })),
    cams: ["pushL", "pushU", "zoomOut", "pushR", "pushD", "zoomIn"], camMul: 7, camOff: 1,
    mag: { rot: 0, skew: 0, slide: 0.32, driftX: 5, driftY: 4, driftZ: 0.035 }, titlePreset: "streak", itemPreset: "rise", titleSpace: "0.01em",
    look: {
      hook: { bg: "paper", fg: "ink", hi: "red", world: true, top: 300, size: 138, upper: true, kicker: { v: "tag", bg: "red", c: "paper" } },
      statement: { bg: "ink", fg: "paper", hi: "yellow", world: false, top: 640, size: 160, upper: true },
      feature: { bg: "paper", fg: "ink", hi: "blue", world: true, top: 248, size: 104, upper: true, card: { v: "frame", bg: "ink", r: 14, line: "paper" }, chips: { v: "square", colors: ["red", "blue", "green"], text: "paper" } },
      montage: { bg: "ink", fg: "paper", hi: "yellow", world: false, top: 258, size: 100, upper: true, tile: { bg: "paper", line: "ink", label: "paper", r: 10 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "paper", fg: "ink", hi: "red", world: true, cols: ["red", "blue", "green"], num: 158, upper: true, rule: true },
      cta: { bg: "red", fg: "paper", hi: "yellow", world: false, top: 500, size: 132, upper: true, btn: { v: "block", bg: "paper", c: "red" }, logoShape: "rounded" },
      app: { bg: "paper", fg: "ink", hi: "red", cardBg: "#ffffff", line: "ink", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [["red", "M -20 400 L 300 400 L 460 560 L 460 900"], ["blue", "M 1100 620 L 700 620 L 560 760 L 200 760 L 60 900"], ["green", "M 200 -20 L 200 260 L 420 480 L 1000 480"], ["yellow", "M 900 -20 L 900 300 L 760 440 L 760 1100"]].map(([k, d], i) =>
        R("path", { key: k, d, fill: "none", stroke: rgba(theme[k], 0.5), strokeWidth: 16, strokeLinecap: "round" })),
      [[300, 400], [460, 560], [700, 620], [560, 760], [200, 260], [420, 480], [900, 300], [760, 440]].map(([x, y], i) =>
        R("circle", { key: "s" + i, cx: x, cy: y, r: 13, fill: "#fff", stroke: theme.ink, strokeWidth: 5 })),
      (function () {
        const ph = (t * 0.16) % 1;
        const pts = [[-20, 400], [300, 400], [460, 560], [460, 900]];
        const segs = 3, f = ph * segs, si = Math.min(segs - 1, Math.floor(f)), sf = f - si;
        const x = pts[si][0] + (pts[si + 1][0] - pts[si][0]) * sf, y = pts[si][1] + (pts[si + 1][1] - pts[si][1]) * sf;
        return R("g", null, R("rect", { x: x - 26, y: y - 15, width: 52, height: 30, rx: 8, fill: theme.red }), R("rect", { x: x - 16, y: y - 7, width: 12, height: 12, rx: 3, fill: "#fff" }), R("rect", { x: x + 4, y: y - 7, width: 12, height: 12, rx: 3, fill: "#fff" }));
      })(),
      R("path", { d: `M 60 ${u.H - 240} h ${((t * 140) % 300) + 60}`, stroke: theme.ink, strokeWidth: 8, strokeLinecap: "round", opacity: 0.25 })),
  });

  /* ---- Serif Manifesto: pure editorial typography — no image slots at all ---- */
  FilmKit.make({
    global: "SerifManifesto", variants: {"Typing":"typewriter","Morph":"fade","Swipe":"flip","Scroll":"board"}, brand: "Manifesto", desk: "#141210", ambient: 1.6, media: false,
    FH: '"Playfair Display", serif', FB: '"Lato", sans-serif',
    palette: (t) => ({ ivory: t.ivory || "#f6f1e7", ink: "#1e1b17", ox: t.ox || "#7a2e2e", gold: "#b08d3f", paper: "#fbf8f1" }),
    tweaks: [{ k: "ivory", label: "Page", options: ["#f6f1e7", "#f2e9dc", "#eeeee6"] }, { k: "ox", label: "Accent", options: ["#7a2e2e", "#1f3a5f", "#3e5c3a"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: theme.currentBg }, R2("text", { x: 12, y: 17, textAnchor: "middle", fontFamily: "Georgia, serif", fontSize: 17, fontStyle: "italic" }, "M")),
    cams: ["zoomOut", "pushU", "pushL", "drop", "pushR", "zoomIn"], camMul: 5, camOff: 2,
    mag: { rot: 0.3, driftX: 4, driftY: 5, inn: 0.3, driftZ: 0.03 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.06,
    look: {
      hook: { bg: "ivory", fg: "ink", hi: "ox", world: true, top: 560, size: 132, align: "center", kicker: { v: "bare", c: "gold" } },
      statement: { bg: "ink", fg: "paper", hi: "gold", world: false, top: 620, size: 150 },
      feature: { bg: "ivory", fg: "ink", hi: "ox", world: true, top: 280, size: 96, card: { v: "frame", bg: "ink", r: 4, line: "paper" }, chips: { v: "outline", colors: ["ox", "ink"], text: "paper" } },
      montage: { bg: "ink", fg: "paper", hi: "gold", world: false, top: 280, size: 92, tile: { bg: "ox", line: "paper", label: "paper", r: 4 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "ox", fg: "paper", hi: "gold", world: false, cols: ["gold", "ivory", "paper"], num: 150 },
      cta: { bg: "ink", fg: "paper", hi: "gold", world: false, top: 560, size: 128, btn: { v: "block", bg: "paper", c: "ink" }, logoShape: "circle" },
      app: { bg: "ivory", fg: "ink", hi: "ox", cardBg: "paper", line: "ink", world: false },
    },
    World: (theme, t, p, u) => R("g", null,
      R("line", { x1: u.W / 2, y1: 140, x2: u.W / 2, y2: 300, stroke: rgba(theme.ink, 0.3), strokeWidth: 2 }),
      R("circle", { cx: u.W / 2, cy: 330, r: 6, fill: theme.ox }),
      R("text", { x: u.W / 2, y: u.H - 160, textAnchor: "middle", fontFamily: '"Playfair Display", serif', fontStyle: "italic", fontSize: 40, fill: rgba(theme.ink, 0.35) }, "\u2042"),
      R("g", { opacity: 0.1, transform: `translate(${-((t * 24) % 900)},0)` },
        [0, 1, 2, 3].map((i) => R("text", { key: i, x: i * 900, y: u.H / 2 + 320, fontFamily: '"Playfair Display", serif', fontSize: 400, fontStyle: "italic", fill: "none", stroke: theme.ink, strokeWidth: 2 }, "Aa")))),
  });

  /* ---- Chalk Talk: green board, chalk doodles redrawing, eraser smudge, duster ---- */
  FilmKit.make({
    global: "ChalkTalk", variants: {"Typing":"hand","DragDrop":"drag","Toggle":"check","Morph":"roll"}, brand: "Chalk Talk", desk: "#1e2a26", ambient: 1.7,
    FH: '"Gochi Hand", cursive', FB: '"Neucha", cursive',
    palette: (t) => ({ board: t.board || "#2e3d38", chalk: "#f2efe6", yellow: t.yellow || "#f2d478", pink: "#e8a0b4", wood: "#8a6a4a", ink: "#232f2b" }),
    tweaks: [{ k: "board", label: "Board", options: ["#2e3d38", "#26333d", "#3a3330"] }, { k: "yellow", label: "Chalk 2", options: ["#f2d478", "#a8d8a0", "#a0c8e8"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M4 17L15 6l3 3L7 20l-4 1zM13 8l3 3" })),
    cams: ["pushR", "drop", "pushL", "zoomOut", "hopU", "spin"], camMul: 3, camOff: 2,
    mag: { rot: 1.2, driftX: 7 }, titlePreset: "stamp", itemPreset: "pop", titleLine: 1.12,
    look: {
      hook: { bg: "board", fg: "chalk", hi: "yellow", world: true, top: 320, size: 122, kicker: { v: "outline", c: "pink" } },
      statement: { bg: "ink", fg: "chalk", hi: "pink", world: false, top: 630, size: 146 },
      feature: { bg: "board", fg: "chalk", hi: "yellow", world: true, top: 250, size: 96, card: { v: "paper", bg: "paper", r: 8, line: "ink" }, chips: { v: "outline", colors: ["yellow", "pink", "chalk"], text: "ink" } },
      montage: { bg: "ink", fg: "chalk", hi: "yellow", world: false, top: 258, size: 94, tile: { bg: "board", line: "chalk", label: "chalk", r: 8 }, tilts: [-3, 2.5, 2, -2.5] },
      stats: { bg: "board", fg: "chalk", hi: "yellow", world: true, cols: ["yellow", "pink", "chalk"], num: 152 },
      cta: { bg: "ink", fg: "chalk", hi: "yellow", world: false, top: 500, size: 120, btn: { v: "pill", bg: "yellow", c: "ink" }, logoShape: "circle" },
      app: { bg: "board", fg: "chalk", hi: "yellow", cardBg: "#26332f", line: "chalk", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("rect", { x: 0, y: u.H - 110, width: u.W, height: 110, fill: theme.wood }),
      R("rect", { x: 120, y: u.H - 128, width: 130, height: 26, rx: 6, fill: rgba(theme.chalk, 0.85) }),
      R("rect", { x: 290, y: u.H - 126, width: 60, height: 22, rx: 10, fill: theme.pink }),
      (function () {
        const len = 700, draw = u.seg(p, 0.05, 0.6);
        return R("path", { d: `M ${u.W - 320} 300 q 90 -60 180 0 q -90 70 -180 0 Z`, fill: "none", stroke: rgba(theme.yellow, 0.8), strokeWidth: 6, strokeDasharray: `${len}`, strokeDashoffset: `${len * (1 - draw)}`, strokeLinecap: "round" });
      })(),
      (function () {
        const len = 500, draw = u.seg(p, 0.3, 0.8);
        return R("path", { d: `M 120 ${u.H - 420} l 70 -90 l 70 90 Z`, fill: "none", stroke: rgba(theme.pink, 0.75), strokeWidth: 6, strokeDasharray: `${len}`, strokeDashoffset: `${len * (1 - draw)}`, strokeLinecap: "round" });
      })(),
      R("ellipse", { cx: u.W * 0.7 + Math.sin(t * 0.4) * 100, cy: u.H - 500, rx: 130, ry: 40, fill: rgba(theme.chalk, 0.05), transform: `rotate(-14 ${u.W * 0.7} ${u.H - 500})` }),
      [0, 1, 2, 3, 4].map((i) => R("circle", { key: i, cx: 100 + i * 210 + Math.sin(t + i) * 8, cy: 200 + (i % 2) * 40, r: 3, fill: rgba(theme.chalk, 0.4) }))),
  });

  /* ---- Aurora Night: curtain waves of aurora, star field, pine ridge ---- */
  FilmKit.make({
    global: "AuroraNight", variants: {"Ring":"ring","Scroll":"ticker","Code":"terminal","Notify":"side"}, brand: "Aurora Night", desk: "#080e18", ambient: 1.5,
    FH: '"Sora", sans-serif', FB: '"Atkinson Hyperlegible", sans-serif',
    palette: (t) => ({ arctic: t.arctic || "#0e1b2e", green: t.green || "#57e6a8", violet: "#8f7ae0", ice: "#dfe9f2", ink: "#0a1220" }),
    tweaks: [{ k: "arctic", label: "Night", options: ["#0e1b2e", "#101026", "#0c2226"] }, { k: "green", label: "Aurora", options: ["#57e6a8", "#57cfe6", "#a8e657"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M3 16c2-6 4-9 5-9s2 4 4 4 3-7 4-7 3 5 5 12" })),
    cams: ["zoomOut", "pushD", "pushL", "hopU", "pushR", "zoomIn"], camMul: 5, camOff: 0,
    mag: { rot: 0.5, driftY: 10, inn: 0.28, driftZ: 0.045 }, titlePreset: "rise", itemPreset: "rise",
    look: {
      hook: { bg: "arctic", fg: "ice", hi: "green", world: true, top: 900, size: 122, kicker: { v: "outline", c: "green" } },
      statement: { bg: "ink", fg: "ice", hi: "violet", world: false, top: 640, size: 148 },
      feature: { bg: "arctic", fg: "ice", hi: "green", world: true, top: 250, size: 96, card: { v: "glow", bg: "#0a1220", glow: "green", r: 24, line: "ice" }, chips: { v: "pill", colors: ["green", "violet"], text: "ink" } },
      montage: { bg: "ink", fg: "ice", hi: "green", world: false, top: 258, size: 94, tile: { bg: "#0e1b2e", line: "ice", label: "ice", r: 18, glow: "violet" }, tilts: [-1.5, 1, 1.5, -1] },
      stats: { bg: "arctic", fg: "ice", hi: "green", world: true, cols: ["green", "violet", "ice"], num: 152, glowNums: true },
      cta: { bg: "ink", fg: "ice", hi: "green", world: false, top: 500, size: 122, btn: { v: "glow", bg: "green", c: "ink" }, logoShape: "circle" },
      app: { bg: "arctic", fg: "ice", hi: "green", cardBg: "#0d1626", line: "ice", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1, 2].map((band) => {
        const pts = Array.from({ length: 9 }).map((_, i) => {
          const x = (i / 8) * u.W;
          const y = 260 + band * 130 + Math.sin(t * (0.5 + band * 0.14) + i * 0.9 + band * 2) * 70;
          return `${x},${y}`;
        });
        const c = band === 1 ? theme.violet : theme.green;
        return R("polygon", { key: band, points: `0,${900 + band * 40} ${pts.join(" ")} ${u.W},${900 + band * 40}`, fill: rgba(c, 0.12 - band * 0.02) });
      }),
      [0, 1, 2].map((band) => {
        const d = Array.from({ length: 9 }).map((_, i) => {
          const x = (i / 8) * u.W;
          const y = 260 + band * 130 + Math.sin(t * (0.5 + band * 0.14) + i * 0.9 + band * 2) * 70;
          return `${i === 0 ? "M" : "L"} ${x} ${y}`;
        }).join(" ");
        return R("path", { key: "l" + band, d, fill: "none", stroke: rgba(band === 1 ? theme.violet : theme.green, 0.55), strokeWidth: 5 - band, strokeLinecap: "round" });
      }),
      Array.from({ length: 20 }).map((_, i) => R("circle", { key: "s" + i, cx: (i * 139 + 30) % u.W, cy: (i * 211 + 50) % (u.H * 0.55), r: 1.6 + (i % 2), fill: rgba("#ffffff", 0.3 + 0.5 * Math.abs(Math.sin(t + i * 1.9))) })),
      R("path", { d: `M -20 ${u.H - 200} L 160 ${u.H - 330} L 330 ${u.H - 210} L 520 ${u.H - 360} L 720 ${u.H - 220} L 900 ${u.H - 320} L ${u.W + 20} ${u.H - 230} L ${u.W + 20} ${u.H + 20} L -20 ${u.H + 20} Z`, fill: theme.ink })),
  });

  /* ---- Robot Factory: conveyor belt, robot arm placing crates, warning beacon ---- */
  FilmKit.make({
    global: "RobotFactory", variants: {"Code":"diff","DragDrop":"assemble","Toggle":"dial","Ring":"gauge"}, brand: "Robot Factory", desk: "#17191d", ambient: 1.9,
    FH: '"Chakra Petch", sans-serif', FB: '"IBM Plex Sans", sans-serif',
    palette: (t) => ({ floor: t.floor || "#23262b", orange: t.orange || "#ff7a1a", steel: "#9aa4b2", warn: "#ffd23c", paper: "#f0f0ec", ink: "#141518" }),
    tweaks: [{ k: "floor", label: "Floor", options: ["#23262b", "#1d2430", "#262020"] }, { k: "orange", label: "Safety", options: ["#ff7a1a", "#ff4f5e", "#4fd8ff"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("rect", { x: 7, y: 9, width: 10, height: 8, rx: 2 }), R2("circle", { cx: 10.5, cy: 13, r: 0.5 }), R2("circle", { cx: 13.5, cy: 13, r: 0.5 }), R2("path", { d: "M12 9V5M12 5h4M7 21h10" })),
    cams: ["pushL", "zoomIn", "pushD", "pushR", "spin", "pushU"], camMul: 7, camOff: 3,
    mag: { skew: 4, rot: 0.8, inn: 0.18 }, titlePreset: "slam", itemPreset: "pop", titleSpace: "0.02em",
    look: {
      hook: { bg: "floor", fg: "paper", hi: "orange", world: true, top: 320, size: 118, upper: true, kicker: { v: "tag", bg: "warn", c: "ink" } },
      statement: { bg: "ink", fg: "paper", hi: "warn", world: false, top: 640, size: 140, upper: true },
      feature: { bg: "floor", fg: "paper", hi: "orange", world: true, top: 248, size: 94, upper: true, card: { v: "frame", bg: "ink", r: 12, line: "steel" }, chips: { v: "square", colors: ["orange", "warn", "steel"], text: "ink" } },
      montage: { bg: "ink", fg: "paper", hi: "orange", world: false, top: 258, size: 92, upper: true, tile: { bg: "floor", line: "steel", label: "steel", r: 8 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "floor", fg: "paper", hi: "warn", world: true, cols: ["orange", "warn", "steel"], num: 148, upper: true, rule: true },
      cta: { bg: "orange", fg: "ink", hi: "paper", world: false, top: 500, size: 118, upper: true, btn: { v: "block", bg: "ink", c: "paper" }, logoShape: "rounded" },
      app: { bg: "floor", fg: "paper", hi: "orange", cardBg: "#1b1e23", line: "paper", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("rect", { x: 0, y: u.H - 420, width: u.W, height: 90, fill: theme.ink }),
      Array.from({ length: 8 }).map((_, i) => R("circle", { key: "w" + i, cx: ((i * 160 + t * 120) % (u.W + 160)) - 80, cy: u.H - 330, r: 26, fill: "none", stroke: theme.steel, strokeWidth: 7 })),
      [0, 1, 2].map((i) => {
        const bx = ((t * 120 + i * 380) % (u.W + 300)) - 150;
        return R("g", { key: "c" + i, transform: `translate(${bx},${u.H - 500})` },
          R("rect", { x: -44, y: 0, width: 88, height: 78, rx: 6, fill: theme.orange, opacity: 0.9 }),
          R("path", { d: "M-44 26 h88 M0 0 v78", stroke: rgba("#000", 0.25), strokeWidth: 5 }));
      }),
      (function () {
        const swing = Math.sin(t * 1.1) * 26;
        return R("g", { transform: `translate(${u.W - 260},${u.H - 420})` },
          R("rect", { x: -30, y: 0, width: 60, height: 60, fill: theme.steel }),
          R("g", { transform: `rotate(${-40 + swing})` },
            R("rect", { x: -14, y: -240, width: 28, height: 240, rx: 10, fill: theme.steel }),
            R("g", { transform: "translate(0,-240)" },
              R("rect", { x: -12, y: -70, width: 24, height: 80, rx: 8, fill: theme.paper }),
              R("path", { d: "M-16 -70 l16 -22 l16 22", fill: "none", stroke: theme.paper, strokeWidth: 10, strokeLinecap: "round" }))));
      })(),
      R("circle", { cx: 120, cy: 260, r: 14, fill: Math.sin(t * 4) > 0 ? theme.warn : rgba(theme.warn, 0.2) }),
      R("path", { d: `M 60 ${u.H - 120} h ${u.W - 120}`, stroke: theme.warn, strokeWidth: 10, strokeDasharray: "50 34", strokeDashoffset: -t * 60, opacity: 0.5 })),
  });
})();
