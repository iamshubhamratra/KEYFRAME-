/* world-pack-3.js — Bird Sky, Desert Neon, Rainy Window, Bloom Market, Pixel Pet */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ---- Bird Sky: morning flock in formation, drifting clouds, kite ---- */
  FilmKit.make({
    global: "BirdSky", variants: {"Scroll":"ticker","Toggle":"switch","Notify":"side","Morph":"fade"}, brand: "Bird Sky", desk: "#9fc4d8", ambient: 1.6,
    FH: '"Yeseva One", serif', FB: '"Mukta", sans-serif',
    palette: (t) => ({ sky: t.sky || "#cfe6f2", ink: "#2e3440", sun: "#f2c14e", coral: t.coral || "#e2705c", paper: "#fbf9f4" }),
    tweaks: [{ k: "sky", label: "Sky", options: ["#cfe6f2", "#f2e3cf", "#e2d8f0"] }, { k: "coral", label: "Accent", options: ["#e2705c", "#c2477e", "#3f8f8a"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M3 12q4-5 9-1M12 11q4-5 9-1" })),
    cams: ["hopU", "pushL", "zoomOut", "pushR", "drop", "spin"], camMul: 5, camOff: 1,
    mag: { rot: 0.8, driftY: 12 }, titlePreset: "rise", itemPreset: "pop", titleLine: 1.08,
    World: (theme, t, p, u) => R("g", null,
      R("circle", { cx: u.W * 0.8, cy: 300, r: 100, fill: theme.sun, opacity: 0.9 }),
      [0, 1, 2].map((i) => R("g", { key: "cl" + i, transform: `translate(${((t * (14 + i * 6) + i * 420) % (u.W + 560)) - 280},${420 + i * 300})`, fill: rgba("#ffffff", 0.8) },
        R("ellipse", { rx: 100 + i * 20, ry: 34 }), R("ellipse", { cx: 64, cy: -16, rx: 54, ry: 26 }), R("ellipse", { cx: -66, cy: -12, rx: 48, ry: 24 }))),
      Array.from({ length: 9 }).map((_, i) => {
        const row = Math.floor(i / 2), side = i % 2 === 0 ? -1 : 1;
        const fx = u.W * 0.5 + ((t * 70) % (u.W * 0.6)) - u.W * 0.3 + side * row * 74;
        const fy = 800 + row * 56 + Math.sin(t * 2.4 + i) * 10;
        const flap = Math.sin(t * 7 + i) * 8;
        return R("path", { key: "b" + i, d: `M ${fx - 22} ${fy - flap} Q ${fx} ${fy + 10} ${fx + 22} ${fy - flap}`, fill: "none", stroke: theme.ink, strokeWidth: 6, strokeLinecap: "round" });
      }),
      R("g", { transform: `translate(${u.W * 0.2 + Math.sin(t * 0.8) * 40},${u.H - 560 + Math.cos(t * 0.6) * 30}) rotate(${Math.sin(t) * 10})` },
        R("path", { d: "M0 -50 L 34 0 L 0 50 L -34 0 Z", fill: theme.coral }),
        R("line", { x1: 0, y1: -50, x2: 0, y2: 50, stroke: rgba("#ffffff", 0.6), strokeWidth: 3 }),
        R("path", { d: `M0 50 q 20 60 -10 120 q ${Math.sin(t * 2) * 20} 40 8 90`, stroke: rgba(theme.ink, 0.5), strokeWidth: 3, fill: "none" })),
      R("path", { d: `M -20 ${u.H - 150} Q ${u.W * 0.3} ${u.H - 230} ${u.W * 0.6} ${u.H - 160} T ${u.W + 20} ${u.H - 190} L ${u.W + 20} ${u.H + 20} L -20 ${u.H + 20} Z`, fill: rgba(theme.ink, 0.85) })),
    look: {
      hook: { bg: "sky", fg: "ink", hi: "coral", world: true, top: 310, size: 122, kicker: { v: "pill", bg: "ink", c: "paper" } },
      statement: { bg: "ink", fg: "paper", hi: "sun", world: false, top: 640, size: 148 },
      feature: { bg: "sky", fg: "ink", hi: "coral", world: true, top: 246, size: 96, card: { v: "tilt", bg: "paper", r: 24, line: "ink" }, chips: { v: "pill", colors: ["coral", "ink"], text: "paper" } },
      montage: { bg: "ink", fg: "paper", hi: "sun", world: false, top: 258, size: 94, tile: { bg: "paper", line: "ink", label: "paper", r: 18 }, tilts: [-2.5, 2, 1.5, -2] },
      stats: { bg: "coral", fg: "paper", hi: "sun", world: false, cols: ["sun", "paper", "sky"], num: 154 },
      cta: { bg: "sky", fg: "ink", hi: "coral", world: true, top: 480, size: 120, btn: { v: "pill", bg: "coral", c: "paper" }, logoShape: "circle" },
    },
  });

  /* ---- Desert Neon: motel night — neon cactus buzzing, tumbleweed, star wash ---- */
  FilmKit.make({
    global: "DesertNeon", variants: {"Cursor":"click","Typing":"caret","Swipe":"flip","Notify":"pop"}, brand: "Desert Neon", desk: "#160f20", ambient: 1.8,
    FH: '"Monoton", cursive', FB: '"Outfit", sans-serif',
    palette: (t) => ({ dusk: t.dusk || "#241a33", cactus: t.cactus || "#59e07a", motel: "#ff7ac2", sand: "#e8c98f", paper: "#f6eefc", ink: "#170f22" }),
    tweaks: [{ k: "dusk", label: "Night", options: ["#241a33", "#1a2333", "#2a1526"] }, { k: "cactus", label: "Neon", options: ["#59e07a", "#45e0ff", "#ffd23c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M12 21V5a2 2 0 0 1 4 0v6M12 13H9a2 2 0 0 1-2-2V9M7 21h10" })),
    cams: ["pushR", "zoomIn", "pushU", "pushL", "spin", "drop"], camMul: 7, camOff: 4,
    mag: { skew: 5, rot: 1.1 }, titlePreset: "slam", itemPreset: "pop", titleLine: 1.24, titleSpace: "0.05em",
    World: (theme, t, p, u) => R("g", null,
      Array.from({ length: 16 }).map((_, i) => R("circle", { key: "s" + i, cx: (i * 143 + 40) % u.W, cy: (i * 191 + 60) % (u.H * 0.4), r: 1.8 + (i % 2), fill: rgba("#ffffff", 0.3 + 0.4 * Math.abs(Math.sin(t * 1.3 + i))) })),
      R("path", { d: `M -20 ${u.H - 360} Q ${u.W * 0.25} ${u.H - 420} ${u.W * 0.5} ${u.H - 370} T ${u.W + 20} ${u.H - 390} L ${u.W + 20} ${u.H + 20} L -20 ${u.H + 20} Z`, fill: rgba(theme.sand, 0.22) }),
      (function () {
        const buzz = Math.sin(t * 11) > -0.85 ? 1 : 0.35;
        return R("g", { transform: `translate(${u.W - 220},${u.H - 700})`, stroke: theme.cactus, strokeWidth: 12, fill: "none", strokeLinecap: "round", opacity: buzz },
          R("path", { d: "M0 260 L 0 40" }), R("path", { d: "M0 150 Q -70 150 -70 90 L -70 60" }), R("path", { d: "M0 190 Q 74 190 74 130 L 74 90" }),
          R("path", { d: "M0 260 L 0 40 M0 150 Q -70 150 -70 90 L -70 60 M0 190 Q 74 190 74 130 L 74 90", stroke: rgba(theme.cactus, 0.25), strokeWidth: 30 }));
      })(),
      R("g", { transform: `translate(${((t * 120) % (u.W + 400)) - 200},${u.H - 300}) rotate(${t * 160})` },
        R("circle", { r: 44, fill: "none", stroke: rgba(theme.sand, 0.6), strokeWidth: 4, strokeDasharray: "10 12" }),
        R("circle", { r: 26, fill: "none", stroke: rgba(theme.sand, 0.45), strokeWidth: 3, strokeDasharray: "8 10" })),
      R("g", { transform: `translate(150,${u.H - 1150})` },
        R("rect", { x: -20, y: -46, width: 300, height: 92, rx: 14, fill: "none", stroke: theme.motel, strokeWidth: 5, opacity: Math.sin(t * 5) > -0.6 ? 0.95 : 0.3 }),
        R("circle", { cx: 320, cy: 0, r: 7, fill: theme.motel, opacity: Math.sin(t * 5 + 1) > 0 ? 1 : 0.2 }))),
    look: {
      hook: { bg: "dusk", fg: "paper", hi: "cactus", world: true, top: 330, size: 96, upper: true, kicker: { v: "outline", c: "motel" } },
      statement: { bg: "ink", fg: "paper", hi: "motel", world: false, top: 660, size: 104, upper: true },
      feature: { bg: "dusk", fg: "paper", hi: "sand", world: true, top: 246, size: 76, upper: true, card: { v: "glow", bg: "#170f22", glow: "cactus", r: 16, line: "cactus" }, chips: { v: "outline", colors: ["cactus", "motel", "sand"], text: "ink" } },
      montage: { bg: "ink", fg: "paper", hi: "cactus", world: false, top: 258, size: 74, upper: true, tile: { bg: "#241a33", line: "motel", label: "motel", r: 12, glow: "motel" }, tilts: [0, 0, 0, 0] },
      stats: { bg: "dusk", fg: "paper", hi: "cactus", world: true, cols: ["cactus", "motel", "sand"], num: 140, glowNums: true },
      cta: { bg: "ink", fg: "paper", hi: "motel", world: false, top: 540, size: 84, upper: true, btn: { v: "glow", bg: "motel", c: "ink" }, logoShape: "rounded" },
    },
  });

  /* ---- Rainy Window: streaking droplets, bokeh lights beyond the glass ---- */
  FilmKit.make({
    global: "RainyWindow", variants: {"Typing":"typewriter","Scroll":"feed","Ring":"ring","Notify":"drop"}, brand: "Rainy Window", desk: "#1d232c", ambient: 1.6,
    FH: '"Merriweather", serif', FB: '"Public Sans", sans-serif',
    palette: (t) => ({ slate: t.slate || "#2c3440", glass: "#39424f", bokeh: t.bokeh || "#f2b552", drop: "#7ac7e0", paper: "#eef1f2", ink: "#1a2027" }),
    tweaks: [{ k: "slate", label: "Evening", options: ["#2c3440", "#33303f", "#26383a"] }, { k: "bokeh", label: "Lights", options: ["#f2b552", "#e8788a", "#8fd0a8"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11Z" })),
    cams: ["zoomOut", "pushD", "pushL", "zoomIn", "pushR", "hopU"], camMul: 3, camOff: 0,
    mag: { rot: 0.4, driftX: 5, driftY: 5, inn: 0.28, driftZ: 0.04 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.14,
    World: (theme, t, p, u) => R("g", null,
      [0, 1, 2, 3, 4, 5, 6].map((i) => {
        const bx = (i * 167 + 80) % u.W, by = 300 + (i * 229) % (u.H * 0.5);
        const pulse = 0.5 + 0.3 * Math.sin(t * 0.9 + i * 1.7);
        const c = i % 3 === 0 ? theme.bokeh : i % 3 === 1 ? theme.drop : "#e8788a";
        return R("circle", { key: "bk" + i, cx: bx, cy: by, r: 34 + (i % 3) * 22, fill: rgba(c, 0.16 * pulse * 2) });
      }),
      Array.from({ length: 12 }).map((_, i) => {
        const dx = (i * 89 + 50) % u.W + Math.sin(i * 5) * 20;
        const dy = ((t * (180 + (i % 5) * 60) + i * 340) % (u.H + 260)) - 130;
        return R("g", { key: "d" + i },
          R("line", { x1: dx, y1: dy - 60, x2: dx, y2: dy - 14, stroke: rgba(theme.drop, 0.35), strokeWidth: 3 }),
          R("circle", { cx: dx, cy: dy, r: 5 + (i % 3) * 2, fill: rgba(theme.drop, 0.7) }));
      }),
      R("path", { d: `M ${u.W * 0.12} 0 q ${Math.sin(t * 0.6) * 8} ${u.H * 0.3} -14 ${u.H * 0.62}`, stroke: rgba(theme.drop, 0.28), strokeWidth: 7, fill: "none", strokeLinecap: "round" }),
      R("path", { d: `M ${u.W * 0.88} 0 q ${-Math.sin(t * 0.5) * 10} ${u.H * 0.4} 10 ${u.H * 0.7}`, stroke: rgba(theme.drop, 0.22), strokeWidth: 5, fill: "none", strokeLinecap: "round" })),
    look: {
      hook: { bg: "slate", fg: "paper", hi: "bokeh", world: true, top: 320, size: 112, kicker: { v: "bare", c: "drop" } },
      statement: { bg: "ink", fg: "paper", hi: "drop", world: false, top: 640, size: 136 },
      feature: { bg: "slate", fg: "paper", hi: "bokeh", world: true, top: 248, size: 90, card: { v: "frame", bg: "glass", r: 22, line: "paper" }, chips: { v: "outline", colors: ["bokeh", "drop", "paper"], text: "ink" } },
      montage: { bg: "ink", fg: "paper", hi: "bokeh", world: false, top: 258, size: 90, tile: { bg: "glass", line: "paper", label: "paper", r: 16 }, tilts: [-1.5, 1, 1.5, -1] },
      stats: { bg: "slate", fg: "paper", hi: "drop", world: true, cols: ["bokeh", "drop", "paper"], num: 148 },
      cta: { bg: "ink", fg: "paper", hi: "bokeh", world: false, top: 500, size: 112, btn: { v: "pill", bg: "bokeh", c: "ink" }, logoShape: "circle" },
    },
  });

  /* ---- Bloom Market: falling petals, swaying stems, a watering can arc ---- */
  FilmKit.make({
    global: "BloomMarket", variants: {"DragDrop":"drag","Toggle":"switch","Cursor":"slider","Ring":"gauge"}, brand: "Bloom Market", desk: "#372a30", ambient: 1.6,
    FH: '"DM Serif Display", serif', FB: '"Albert Sans", sans-serif',
    palette: (t) => ({ blush: t.blush || "#f6e7e9", magenta: t.magenta || "#c2477e", leaf: "#5d8f57", butter: "#f2cf6b", ink: "#322a2e", paper: "#fffbf7" }),
    tweaks: [{ k: "blush", label: "Ground", options: ["#f6e7e9", "#f2ecdf", "#e9e4f2"] }, { k: "magenta", label: "Bloom", options: ["#c2477e", "#e0685c", "#8f5cff"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 25, height: 25, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("circle", { cx: 12, cy: 8, r: 2.5 }), R2("path", { d: "M12 10.5V21M12 16c-2 0-5-1-5-5M12 18c2 0 5-1 5-5" })),
    cams: ["pushL", "hopU", "zoomOut", "pushR", "drop", "spin"], camMul: 5, camOff: 3,
    mag: { rot: 1.0, driftY: 9 }, titlePreset: "pop", itemPreset: "stamp", titleLine: 1.06,
    World: (theme, t, p, u) => R("g", null,
      [0, 1, 2, 3].map((i) => {
        const sx = 120 + i * 270, sway = Math.sin(t * 0.9 + i) * 14;
        const c = [theme.magenta, theme.butter, theme.magenta, "#e0685c"][i];
        return R("g", { key: "f" + i },
          R("path", { d: `M ${sx} ${u.H - 100} Q ${sx + sway} ${u.H - 300} ${sx + sway} ${u.H - 430 - i * 40}`, stroke: theme.leaf, strokeWidth: 9, fill: "none", strokeLinecap: "round" }),
          R("path", { d: `M ${sx + sway * 0.6} ${u.H - 280} q 50 -8 60 -54 q -52 6 -60 54`, fill: theme.leaf }),
          [0, 1, 2, 3, 4].map((k) => R("ellipse", { key: k, cx: sx + sway, cy: u.H - 430 - i * 40, rx: 16, ry: 34, fill: c, transform: `rotate(${k * 72 + t * 12} ${sx + sway} ${u.H - 430 - i * 40})` })),
          R("circle", { cx: sx + sway, cy: u.H - 430 - i * 40, r: 14, fill: theme.butter }));
      }),
      Array.from({ length: 10 }).map((_, i) => {
        const px = (i * 113 + Math.sin(t * 0.7 + i) * 60 + u.W) % u.W;
        const py = ((t * (44 + (i % 4) * 18) + i * 260) % (u.H + 160)) - 80;
        return R("ellipse", { key: "p" + i, cx: px, cy: py, rx: 9, ry: 15, fill: rgba(theme.magenta, 0.55), transform: `rotate(${t * 90 + i * 36} ${px} ${py})` });
      })),
    look: {
      hook: { bg: "blush", fg: "ink", hi: "magenta", world: true, top: 300, size: 122, kicker: { v: "pill", bg: "leaf", c: "paper" } },
      statement: { bg: "magenta", fg: "paper", hi: "butter", world: false, top: 630, size: 148 },
      feature: { bg: "blush", fg: "ink", hi: "leaf", world: true, top: 246, size: 96, card: { v: "tilt", bg: "paper", r: 26, line: "ink" }, chips: { v: "pill", colors: ["magenta", "leaf", "butter"], text: "paper" } },
      montage: { bg: "leaf", fg: "paper", hi: "butter", world: false, top: 258, size: 94, tile: { bg: "paper", line: "ink", label: "paper", r: 20 }, tilts: [-3, 2.5, 2, -2.5] },
      stats: { bg: "ink", fg: "paper", hi: "magenta", world: false, cols: ["magenta", "butter", "blush"], num: 152 },
      cta: { bg: "blush", fg: "ink", hi: "magenta", world: true, top: 480, size: 118, btn: { v: "pill", bg: "magenta", c: "paper" }, logoShape: "circle" },
    },
  });

  /* ---- Pixel Pet: handheld-console world, 8-bit pet hopping, hearts, crumbs ---- */
  FilmKit.make({
    global: "PixelPet", variants: {"Cursor":"keys","Ring":"bar","Notify":"side","DragDrop":"drag"}, brand: "Pixel Pet", desk: "#1e2a1c", ambient: 1.9,
    FH: '"Silkscreen", monospace', FB: '"IBM Plex Mono", monospace',
    palette: (t) => ({ mint: t.mint || "#cfe8b8", shade: "#a8c890", dark: t.dark || "#274029", accent: "#e07a3f", paper: "#f2f8e8", ink: "#1c2e1e" }),
    tweaks: [{ k: "mint", label: "Screen", options: ["#cfe8b8", "#c8e0e8", "#e8d8c0"] }, { k: "dark", label: "Pixels", options: ["#274029", "#2a3550", "#4a2e35"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: theme.currentBg }, R2("path", { d: "M6 4h4v4H6zM14 4h4v4h-4zM4 10h16v6H4zM8 16h8v4H8z" })),
    cams: ["pushD", "pushL", "zoomIn", "pushU", "pushR", "spin"], camMul: 7, camOff: 0,
    mag: { rot: 0, skew: 0, slide: 0.3, inn: 0.15, driftX: 2, driftY: 2, driftZ: 0.02 }, titlePreset: "slam", itemPreset: "pop", titleLine: 1.3,
    World: (theme, t, p, u) => R("g", null,
      Array.from({ length: 60 }).map((_, i) => {
        const gx = (i % 10) * 120, gy = Math.floor(i / 10) * 340;
        return R("rect", { key: "g" + i, x: gx + 40, y: gy + 60, width: 8, height: 8, fill: rgba(theme.dark, 0.12) });
      }),
      (function () {
        const hop = Math.abs(Math.sin(t * 3)) * 40;
        const px = u.W / 2 + Math.sin(t * 0.5) * 220;
        return R("g", { transform: `translate(${px},${u.H - 420 - hop}) scale(6)`, fill: theme.dark },
          R("path", { d: "M2 2h2v2H2zM10 2h2v2h-2zM2 4h12v6H2zM0 6h2v2H0zM14 6h2v2h-2zM4 10h2v2H4zM10 10h2v2h-2z" }),
          R("rect", { x: 5, y: 6, width: 2, height: 2, fill: theme.mint }),
          R("rect", { x: 9, y: 6, width: 2, height: 2, fill: theme.mint }));
      })(),
      (function () {
        const ph = (t * 0.8) % 1;
        return R("g", { transform: `translate(${u.W / 2 + Math.sin(t * 0.5) * 220 + 90},${u.H - 560 - ph * 160}) scale(${3 - ph})`, opacity: 1 - ph, fill: theme.accent },
          R("path", { d: "M2 0h2v2H2zM6 0h2v2H6zM0 2h10v2H0zM2 4h6v2H2zM4 6h2v2H4z" }));
      })(),
      [0, 1, 2].map((i) => R("rect", { key: "c" + i, x: 160 + i * 330 + Math.floor(t * 2) % 2 * 8, y: u.H - 250, width: 14, height: 14, fill: theme.shade })),
      R("rect", { x: 0, y: ((t * 200) % (u.H + 300)) - 150, width: u.W, height: 90, fill: rgba("#ffffff", 0.06) })),
    look: {
      hook: { bg: "mint", fg: "ink", hi: "accent", world: true, top: 300, size: 84, upper: true, kicker: { v: "outline", c: "dark", r: 0 } },
      statement: { bg: "dark", fg: "mint", hi: "accent", world: false, top: 660, size: 92, upper: true },
      feature: { bg: "mint", fg: "ink", hi: "accent", world: true, top: 246, size: 66, upper: true, card: { v: "frame", bg: "dark", r: 6, line: "mint" }, chips: { v: "square", colors: ["dark", "accent"], text: "paper" } },
      montage: { bg: "dark", fg: "mint", hi: "accent", world: false, top: 260, size: 64, upper: true, tile: { bg: "#1c2e1e", line: "mint", label: "mint", r: 4, glow: "mint", labelSize: 30 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "mint", fg: "ink", hi: "accent", world: true, cols: ["dark", "accent", "ink"], num: 108, rule: true, upper: true },
      cta: { bg: "dark", fg: "mint", hi: "accent", world: false, top: 560, size: 84, upper: true, btn: { v: "block", bg: "accent", c: "paper" }, logoShape: "rounded" },
    },
  });
})();
