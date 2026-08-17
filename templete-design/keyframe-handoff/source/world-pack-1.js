/* world-pack-1.js — Safari Dawn, City Pulse, Retro Arcade, Snow Peak, Space Hop */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ---- Safari Dawn: savanna sunrise, acacia silhouettes, striding gazelles ---- */
  FilmKit.make({
    global: "SafariDawn", variants: {"Scroll":"feed","Ring":"gauge","Toggle":"switch","Morph":"fade"}, brand: "Safari Dawn", desk: "#170f08", ambient: 1.7,
    FH: '"Staatliches", sans-serif', FB: '"Assistant", sans-serif',
    palette: (t) => ({ sky: t.sky || "#ef9d4f", dusk: "#c96f35", ink: "#3a2417", sun: "#f6d35c", tree: "#4a2e1c", paper: "#fbeed8" }),
    tweaks: [{ k: "sky", label: "Sky", options: ["#ef9d4f", "#e0785c", "#d9a13b"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("circle", { cx: 12, cy: 12, r: 5 }), R2("path", { d: "M12 2v3M12 19v3M2 12h3M19 12h3" })),
    cams: ["zoomOut", "pushL", "hopU", "pushR", "spin", "pushD"], camMul: 5, camOff: 2,
    mag: { rot: 1.2, driftX: 10 }, titlePreset: "stamp", itemPreset: "pop", titleLine: 1.0,
    World: (theme, t, p, u) => R("g", null,
      R("circle", { cx: u.W * 0.68, cy: 560 - u.seg(p, 0, 0.9) * 140, r: 150, fill: theme.sun, opacity: 0.95 }),
      R("circle", { cx: u.W * 0.68, cy: 560 - u.seg(p, 0, 0.9) * 140, r: 230, fill: rgba(theme.sun, 0.2) }),
      [0, 1, 2].map((i) => R("ellipse", { key: "c" + i, cx: ((t * (14 + i * 6) + i * 380) % (u.W + 500)) - 250, cy: 250 + i * 110, rx: 130 + i * 30, ry: 16, fill: rgba("#ffffff", 0.16) })),
      R("path", { d: `M -20 ${u.H - 430} Q ${u.W * 0.3} ${u.H - 500} ${u.W * 0.62} ${u.H - 440} T ${u.W + 20} ${u.H - 470} L ${u.W + 20} ${u.H + 20} L -20 ${u.H + 20} Z`, fill: theme.dusk, opacity: 0.55 }),
      R("g", { transform: `translate(${u.W * 0.16},${u.H - 620})` },
        R("rect", { x: -8, y: 0, width: 16, height: 150, fill: theme.tree }),
        R("path", { d: "M-150 10 Q 0 -90 150 10 Q 60 -14 0 -10 Q -60 -14 -150 10 Z", fill: theme.tree })),
      R("g", { transform: `translate(${u.W * 0.84},${u.H - 540}) scale(0.7)` },
        R("rect", { x: -8, y: 0, width: 16, height: 150, fill: theme.tree }),
        R("path", { d: "M-150 10 Q 0 -90 150 10 Q 60 -14 0 -10 Q -60 -14 -150 10 Z", fill: theme.tree })),
      [0, 1, 2].map((i) => {
        const gx = ((t * (46 + i * 10) + i * 330) % (u.W + 420)) - 210;
        const hop = Math.abs(Math.sin(t * 3 + i)) * 16;
        return R("g", { key: "g" + i, transform: `translate(${gx},${u.H - 350 - i * 34 - hop}) scale(${0.8 + i * 0.14})` },
          R("path", { d: "M0 0 Q 18 -18 40 -12 L 52 -34 L 46 -8 Q 58 4 50 14 L 12 14 Q -6 14 0 0 Z", fill: theme.ink }),
          R("line", { x1: 16, y1: 14, x2: 12, y2: 34, stroke: theme.ink, strokeWidth: 5 }),
          R("line", { x1: 40, y1: 14, x2: 44, y2: 34, stroke: theme.ink, strokeWidth: 5 }));
      }),
      R("ellipse", { cx: u.W * 0.5, cy: u.H - 120, rx: u.W * 0.9, ry: 260, fill: theme.ink, opacity: 0.92 })),
    look: {
      hook: { bg: "sky", fg: "ink", hi: "paper", world: true, top: 640, size: 132, upper: true, kicker: { v: "tag", bg: "ink", c: "paper" } },
      statement: { bg: "ink", fg: "paper", hi: "sun", world: false, top: 620, size: 158, upper: true },
      feature: { bg: "dusk", fg: "paper", hi: "sun", world: false, top: 250, size: 100, upper: true, card: { v: "frame", bg: "ink", r: 24, line: "paper" }, chips: { v: "pill", colors: ["sun", "paper"], text: "ink" } },
      montage: { bg: "sky", fg: "ink", hi: "paper", world: true, top: 252, size: 98, upper: true, tile: { bg: "ink", line: "paper", label: "ink", r: 20 }, tilts: [-2.5, 2, 1.5, -2] },
      stats: { bg: "ink", fg: "paper", hi: "sun", world: false, cols: ["sun", "sky", "paper"], num: 160, upper: true },
      cta: { bg: "sky", fg: "ink", hi: "paper", world: true, top: 470, size: 126, upper: true, btn: { v: "pill", bg: "ink", c: "paper" }, logoShape: "circle" },
    },
  });

  /* ---- City Pulse: skyline window grids flicking on, crane, blinking antennas ---- */
  FilmKit.make({
    global: "CityPulse", variants: {"Notify":"side","Scroll":"stack","Cursor":"click","Code":"editor"}, brand: "City Pulse", desk: "#12161e", ambient: 1.9,
    FH: '"Oswald", sans-serif', FB: '"Work Sans", sans-serif',
    palette: (t) => ({ steel: t.steel || "#1d2735", block: "#28354a", window: t.window || "#f0b954", sign: "#4fd8c4", paper: "#eef0f4", ink: "#141a24" }),
    tweaks: [{ k: "steel", label: "Night", options: ["#1d2735", "#232030", "#16222c"] }, { k: "window", label: "Windows", options: ["#f0b954", "#ffd23c", "#ff9f6b"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M4 21V7l6-3v17M10 21V10l6 2v9M16 21v-7l4 1v6M2 21h20" })),
    cams: ["pushU", "zoomIn", "pushL", "drop", "pushR", "zoomOut"], camMul: 7, camOff: 3,
    mag: { skew: 6, driftX: 6, driftZ: 0.065 }, titlePreset: "flip", itemPreset: "rise", titleSpace: "0.01em",
    World: (theme, t, p, u) => R("g", null,
      [0, 1, 2, 3, 4].map((b) => {
        const bx = 40 + b * 210, bw = 160, bh = 420 + (b % 3) * 180, by = u.H - bh;
        return R("g", { key: "b" + b },
          R("rect", { x: bx, y: by, width: bw, height: bh, fill: theme.block }),
          Array.from({ length: 12 }).map((_, i) => {
            const wx = bx + 18 + (i % 3) * 48, wy = by + 26 + Math.floor(i / 3) * 64;
            const on = Math.sin(t * (0.6 + b * 0.13) + i * 2.1 + b) > 0.05;
            return R("rect", { key: i, x: wx, y: wy, width: 28, height: 38, rx: 2, fill: on ? rgba(theme.window, 0.85) : rgba(theme.paper, 0.06) });
          }));
      }),
      R("line", { x1: 250, y1: u.H - 1180, x2: 250, y2: u.H - 940, stroke: theme.paper, strokeWidth: 5, opacity: 0.35 }),
      R("line", { x1: 250, y1: u.H - 1180, x2: 470, y2: u.H - 1180, stroke: theme.paper, strokeWidth: 5, opacity: 0.35 }),
      R("line", { x1: 470, y1: u.H - 1180, x2: 470, y2: u.H - 1180 + 70 + Math.sin(t * 0.7) * 30, stroke: theme.paper, strokeWidth: 3, opacity: 0.35 }),
      R("circle", { cx: 890, cy: u.H - 1250, r: 5, fill: Math.sin(t * 2.4) > 0 ? "#e05e4e" : rgba("#e05e4e", 0.2) }),
      R("line", { x1: 890, y1: u.H - 1245, x2: 890, y2: u.H - 1120, stroke: rgba(theme.paper, 0.3), strokeWidth: 4 }),
      [0, 1, 2].map((i) => R("rect", { key: "t" + i, x: u.W + 200 - ((t * (240 + i * 70) + i * 400) % (u.W + 500)), y: u.H - 90 - i * 26, width: 130, height: 6, rx: 3, fill: i % 2 ? rgba(theme.sign, 0.7) : rgba(theme.window, 0.7) }))),
    look: {
      hook: { bg: "steel", fg: "paper", hi: "window", world: true, top: 320, size: 130, upper: true, kicker: { v: "outline", c: "sign", r: 6 } },
      statement: { bg: "ink", fg: "paper", hi: "sign", world: false, top: 640, size: 164, upper: true },
      feature: { bg: "steel", fg: "paper", hi: "window", world: true, top: 248, size: 100, upper: true, card: { v: "glow", bg: "#10151d", glow: "sign", r: 18, line: "paper" }, chips: { v: "outline", colors: ["window", "sign", "paper"], text: "ink" } },
      montage: { bg: "ink", fg: "paper", hi: "window", world: false, top: 256, size: 100, upper: true, tile: { bg: "#10151d", line: "paper", label: "paper", r: 14, glow: "window" }, tilts: [0, 0, 0, 0] },
      stats: { bg: "steel", fg: "paper", hi: "sign", world: true, cols: ["window", "sign", "paper"], num: 150, upper: true, glowNums: true },
      cta: { bg: "ink", fg: "paper", hi: "window", world: false, top: 500, size: 132, upper: true, btn: { v: "block", bg: "window", c: "ink" }, logoShape: "rounded" },
    },
  });

  /* ---- Retro Arcade: pixel starfield, invader march, scanline sweep ---- */
  FilmKit.make({
    global: "RetroArcade", variants: {"Code":"terminal","Cursor":"keys","Swipe":"flip","Ring":"bar"}, brand: "Retro Arcade", desk: "#0a0918", ambient: 2.0,
    FH: '"Press Start 2P", monospace', FB: '"VT323", monospace',
    palette: (t) => ({ void: t.void || "#14122b", green: t.green || "#6ef06e", magenta: "#ff4fd8", cyan: "#4fd8ff", paper: "#f2f2f2", ink: "#0c0b1c" }),
    tweaks: [{ k: "void", label: "Screen", options: ["#14122b", "#0c1a14", "#1c0f22"] }, { k: "green", label: "P1 colour", options: ["#6ef06e", "#ffd23c", "#4fd8ff"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: theme.currentBg }, R2("path", { d: "M4 8h2v2H4zM18 8h2v2h-2zM6 6h2v2H6zM16 6h2v2h-2zM8 8h8v6H8zM6 10h2v4H6zM16 10h2v4h-2zM8 16h2v2H8zM14 16h2v2h-2z" })),
    cams: ["pushL", "pushD", "zoomIn", "pushR", "pushU", "spin"], camMul: 3, camOff: 0,
    mag: { rot: 0, skew: 0, slide: 0.34, inn: 0.16, driftX: 3, driftY: 3, driftZ: 0.03 }, titlePreset: "slam", itemPreset: "pop", titleLine: 1.3,
    World: (theme, t, p, u) => R("g", null,
      Array.from({ length: 22 }).map((_, i) => R("rect", { key: "s" + i, x: (i * 149 + Math.floor(t * (30 + (i % 5) * 14)) % u.W) % u.W, y: (i * 263 + 40) % u.H, width: 5, height: 5, fill: rgba(theme.paper, 0.25 + (i % 3) * 0.14) })),
      [0, 1, 2, 3, 4].map((i) => {
        const step = Math.floor(t * 1.6) % 2;
        const ix = 140 + i * 180 + (Math.floor(t * 0.8) % 4) * 30;
        const iy = 260 + (i % 2) * 90 + step * 12;
        const c = [theme.green, theme.magenta, theme.cyan][i % 3];
        return R("g", { key: "i" + i, transform: `translate(${ix},${iy}) scale(3.2)`, fill: c },
          R("path", { d: step ? "M2 0h2v1h3v1h1v2h2v3h-1v1h-2v-1H4v1H2v-1H1v-1H0V4h1V2h1V0zM3 3h1v1H3zM7 3h1v1H7z" : "M2 0h2v1h3v1h1v2h2v2h-2v2h-1V7H4v2H3V7H1V5H0V4h1V2h1V0zM3 3h1v1H3zM7 3h1v1H7z" }));
      }),
      R("rect", { x: 0, y: ((t * 260) % (u.H + 400)) - 200, width: u.W, height: 130, fill: rgba(theme.paper, 0.045) }),
      R("g", { transform: `translate(${u.W / 2 + Math.sin(t * 0.9) * 260},${u.H - 260})`, fill: theme.green },
        R("rect", { x: -36, y: 10, width: 72, height: 16 }), R("rect", { x: -26, y: -2, width: 52, height: 12 }), R("rect", { x: -5, y: -14, width: 10, height: 12 })),
      [0, 1].map((i) => R("rect", { key: "z" + i, x: u.W / 2 + Math.sin((t - 0.1 - i * 0.14) * 0.9) * 260 - 3, y: u.H - 320 - ((t * 900 + i * 260) % 700), width: 6, height: 26, fill: i ? theme.magenta : theme.paper }))),
    look: {
      hook: { bg: "void", fg: "paper", hi: "green", world: true, top: 620, size: 84, upper: true, kicker: { v: "outline", c: "cyan", r: 0 } },
      statement: { bg: "ink", fg: "green", hi: "magenta", world: false, top: 660, size: 96, upper: true },
      feature: { bg: "void", fg: "paper", hi: "cyan", world: true, top: 250, size: 66, upper: true, card: { v: "glow", bg: "#0c0b1c", glow: "green", r: 8, line: "green" }, chips: { v: "outline", colors: ["green", "magenta", "cyan"], text: "ink" } },
      montage: { bg: "ink", fg: "paper", hi: "green", world: false, top: 262, size: 64, upper: true, tile: { bg: "#14122b", line: "cyan", label: "cyan", r: 6, glow: "magenta", labelSize: 34 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "void", fg: "paper", hi: "green", world: true, cols: ["green", "magenta", "cyan"], num: 110, upper: true, rule: true },
      cta: { bg: "ink", fg: "paper", hi: "green", world: false, top: 560, size: 88, upper: true, btn: { v: "glow", bg: "green", c: "ink" }, logoShape: "rounded" },
    },
  });

  /* ---- Snow Peak: falling snow, ridgelines, a lone lift cabin swaying ---- */
  FilmKit.make({
    global: "SnowPeak", variants: {"Toggle":"check","Ring":"ring","DragDrop":"drag","Morph":"roll"}, brand: "Snow Peak", desk: "#b8ccd9", ambient: 1.6,
    FH: '"Fjalla One", sans-serif', FB: '"Hind", sans-serif',
    palette: (t) => ({ ice: t.ice || "#dfeef7", pine: t.pine || "#2c4a5a", deep: "#1d3440", snow: "#ffffff", coral: "#e0685c", ink: "#20313b" }),
    tweaks: [{ k: "ice", label: "Sky", options: ["#dfeef7", "#cfe0ee", "#e8e4f2"] }, { k: "pine", label: "Ridge", options: ["#2c4a5a", "#3a5a4a", "#44506b"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M3 20L10 6l4 7 2-3 5 10Z" })),
    cams: ["drop", "pushR", "zoomOut", "pushL", "hopU", "zoomIn"], camMul: 5, camOff: 4,
    mag: { rot: 0.6, driftY: 10 }, titlePreset: "rise", itemPreset: "pop",
    World: (theme, t, p, u) => R("g", null,
      R("path", { d: `M -20 ${u.H - 560} L ${u.W * 0.3} ${u.H - 1060} L ${u.W * 0.52} ${u.H - 720} L ${u.W * 0.74} ${u.H - 1160} L ${u.W + 20} ${u.H - 640} L ${u.W + 20} ${u.H + 20} L -20 ${u.H + 20} Z`, fill: theme.pine }),
      R("path", { d: `M ${u.W * 0.3 - 64} ${u.H - 954} L ${u.W * 0.3} ${u.H - 1060} L ${u.W * 0.3 + 64} ${u.H - 954} Q ${u.W * 0.3} ${u.H - 990} ${u.W * 0.3 - 64} ${u.H - 954} Z`, fill: theme.snow }),
      R("path", { d: `M ${u.W * 0.74 - 58} ${u.H - 1064} L ${u.W * 0.74} ${u.H - 1160} L ${u.W * 0.74 + 58} ${u.H - 1064} Q ${u.W * 0.74} ${u.H - 1100} ${u.W * 0.74 - 58} ${u.H - 1064} Z`, fill: theme.snow }),
      R("path", { d: `M -20 ${u.H - 300} Q ${u.W * 0.4} ${u.H - 430} ${u.W + 20} ${u.H - 260} L ${u.W + 20} ${u.H + 20} L -20 ${u.H + 20} Z`, fill: theme.deep }),
      R("line", { x1: 60, y1: 560, x2: u.W - 40, y2: 380, stroke: rgba(theme.ink, 0.4), strokeWidth: 4 }),
      R("g", { transform: `translate(${u.W - 240 - ((t * 60) % (u.W - 200))},${455 + ((t * 60) % (u.W - 200)) * 0.19 + Math.sin(t * 1.4) * 6})` },
        R("line", { x1: 0, y1: -26, x2: 0, y2: 0, stroke: theme.ink, strokeWidth: 4 }),
        R("rect", { x: -26, y: 0, width: 52, height: 40, rx: 7, fill: theme.coral }),
        R("rect", { x: -16, y: 8, width: 32, height: 16, rx: 3, fill: theme.ice })),
      Array.from({ length: 18 }).map((_, i) => {
        const sx = (i * 61 + Math.sin(t * 0.8 + i) * 40 + u.W) % u.W;
        const sy = ((t * (70 + (i % 4) * 26) + i * 210) % (u.H + 100)) - 50;
        return R("circle", { key: "f" + i, cx: sx, cy: sy, r: 3 + (i % 3) * 2, fill: rgba("#ffffff", 0.75 - (i % 3) * 0.15) });
      })),
    look: {
      hook: { bg: "ice", fg: "ink", hi: "coral", world: true, top: 300, size: 128, kicker: { v: "pill", bg: "ink", c: "snow" } },
      statement: { bg: "pine", fg: "snow", hi: "ice", world: false, top: 630, size: 154 },
      feature: { bg: "ice", fg: "ink", hi: "coral", world: true, top: 246, size: 100, card: { v: "frame", bg: "deep", r: 22, line: "snow" }, chips: { v: "pill", colors: ["coral", "pine"], text: "snow" } },
      montage: { bg: "deep", fg: "snow", hi: "ice", world: false, top: 258, size: 98, tile: { bg: "#16272f", line: "snow", label: "snow", r: 18 }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "pine", fg: "snow", hi: "coral", world: false, cols: ["coral", "ice", "snow"], num: 158 },
      cta: { bg: "ice", fg: "ink", hi: "coral", world: true, top: 470, size: 124, btn: { v: "pill", bg: "coral", c: "snow" }, logoShape: "circle" },
    },
  });

  /* ---- Space Hop: parallax starfield, ringed planet, thruster rocket ---- */
  FilmKit.make({
    global: "SpaceHop", variants: {"Code":"diff","Ring":"ring","Typing":"terminal","Notify":"drop"}, brand: "Space Hop", desk: "#06081c", ambient: 1.9,
    FH: '"Righteous", sans-serif', FB: '"Chivo", sans-serif',
    palette: (t) => ({ space: t.space || "#0b0f2a", mint: t.mint || "#6be0b8", coral: "#ff6b4a", violet: "#8f7ae0", paper: "#f2f4ff", ink: "#070a1e" }),
    tweaks: [{ k: "space", label: "Void", options: ["#0b0f2a", "#140b2a", "#0b1e2a"] }, { k: "mint", label: "Planet", options: ["#6be0b8", "#7ab8ff", "#f2c14e"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M12 2c3 3 4 7 4 10l3 4h-5l-2 4-2-4H5l3-4c0-3 1-7 4-10Z" }), R2("circle", { cx: 12, cy: 10, r: 2 })),
    cams: ["zoomIn", "pushU", "spin", "pushD", "zoomOut", "pushL"], camMul: 7, camOff: 5,
    mag: { rot: 1.4, zin: 0.7, driftZ: 0.07 }, titlePreset: "bounce", itemPreset: "pop",
    World: (theme, t, p, u) => R("g", null,
      Array.from({ length: 26 }).map((_, i) => R("circle", { key: "s" + i, cx: (i * 127 + t * (6 + (i % 4) * 5)) % u.W, cy: (i * 211 + 60) % u.H, r: 1.6 + (i % 3), fill: rgba("#ffffff", 0.3 + 0.4 * Math.abs(Math.sin(t + i))) })),
      R("g", { transform: `translate(${u.W * 0.78},${430 + Math.sin(t * 0.5) * 20})` },
        R("circle", { r: 110, fill: theme.mint }),
        R("ellipse", { rx: 190, ry: 34, fill: "none", stroke: rgba(theme.violet, 0.85), strokeWidth: 10, transform: "rotate(-16)" }),
        R("circle", { cx: -34, cy: -20, r: 16, fill: rgba(theme.ink, 0.2) }),
        R("circle", { cx: 30, cy: 26, r: 10, fill: rgba(theme.ink, 0.2) })),
      R("circle", { cx: 130, cy: u.H - 560, r: 44, fill: theme.violet, opacity: 0.85 }),
      R("circle", { cx: 148, cy: u.H - 574, r: 10, fill: rgba("#ffffff", 0.4) }),
      (function () {
        const rx = u.W * 0.24 + Math.sin(t * 0.6) * 60, ry = u.H - 300 - ((t * 120) % (u.H + 300));
        const fl = 0.7 + Math.abs(Math.sin(t * 9)) * 0.5;
        return R("g", { transform: `translate(${rx},${ry}) rotate(-14)` },
          R("path", { d: `M0 44 Q -10 ${44 + 36 * fl} 0 ${44 + 52 * fl} Q 10 ${44 + 36 * fl} 0 44 Z`, fill: theme.coral, opacity: 0.9 }),
          R("path", { d: "M0 -52 Q 22 -20 22 18 L 22 40 L -22 40 L -22 18 Q -22 -20 0 -52 Z", fill: theme.paper }),
          R("circle", { cy: -2, r: 10, fill: theme.space, stroke: theme.violet, strokeWidth: 4 }),
          R("path", { d: "M-22 22 L -42 44 L -22 40 Z", fill: theme.coral }),
          R("path", { d: "M22 22 L 42 44 L 22 40 Z", fill: theme.coral }));
      })()),
    look: {
      hook: { bg: "space", fg: "paper", hi: "mint", world: true, top: 640, size: 126, kicker: { v: "outline", c: "coral" } },
      statement: { bg: "ink", fg: "paper", hi: "violet", world: false, top: 650, size: 156 },
      feature: { bg: "space", fg: "paper", hi: "coral", world: true, top: 248, size: 100, card: { v: "glow", bg: "#070a1e", glow: "mint", r: 26, line: "paper" }, chips: { v: "pill", colors: ["mint", "coral", "violet"], text: "ink" } },
      montage: { bg: "ink", fg: "paper", hi: "mint", world: false, top: 258, size: 98, tile: { bg: "#0b0f2a", line: "paper", label: "paper", r: 20, glow: "violet" }, tilts: [-2, 2, 1.5, -1.5] },
      stats: { bg: "space", fg: "paper", hi: "mint", world: true, cols: ["mint", "coral", "violet"], num: 154, glowNums: true },
      cta: { bg: "ink", fg: "paper", hi: "coral", world: false, top: 500, size: 128, btn: { v: "glow", bg: "coral", c: "paper" }, logoShape: "circle" },
    },
  });
})();
