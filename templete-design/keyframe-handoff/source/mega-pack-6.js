/* mega-pack-6.js — Loom & Weft, Vault Twelve, Bonsai Bench, Slow Rise, Aerial Silk,
   Alpine Post, Reef Build, Clay Court, Escapement, Dune Camp */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ---- Loom & Weft: warp threads, shuttle crossing, heddle lift, yarn cones ---- */
  FilmKit.make({
    global: "LoomWeft", variants: { DragDrop: "assemble", Scroll: "stack", Toggle: "check", Morph: "roll" },
    brand: "Loom & Weft", desk: "#2c2419", ambient: 1.6,
    FH: '"Cardo", serif', FB: '"Karla", sans-serif',
    palette: (t) => ({ linen: t.linen || "#efe4d0", madder: t.madder || "#b5503c", indigo: "#3b4a6b", olive: "#7d8556", ink: "#2a231a" }),
    tweaks: [{ k: "linen", label: "Cloth", options: ["#efe4d0", "#e8ddc8", "#f0e8dc"] }, { k: "madder", label: "Dye", options: ["#b5503c", "#3b4a6b", "#7d8556"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M4 4v16M20 4v16M8 4v16M16 4v16M4 9h16M4 15h16" })),
    cams: ["pushL", "zoomIn", "pushD", "pushR", "hopU", "zoomOut"], camMul: 5, camOff: 1,
    mag: { rot: 0.5, driftX: 6, inn: 0.26 }, titlePreset: "stamp", itemPreset: "rise", titleLine: 1.08,
    look: {
      hook: { bg: "linen", fg: "ink", hi: "madder", world: true, top: 330, size: 118, kicker: { v: "bare", c: "olive" } },
      statement: { bg: "indigo", fg: "linen", hi: "madder", world: false, top: 630, size: 144 },
      feature: { bg: "linen", fg: "ink", hi: "madder", world: true, top: 250, size: 94, card: { v: "frame", bg: "ink", r: 14, line: "linen" }, chips: { v: "outline", colors: ["madder", "indigo", "olive"], text: "linen" } },
      montage: { bg: "ink", fg: "linen", hi: "madder", world: false, top: 258, size: 90, tile: { bg: "linen", line: "ink", label: "linen", r: 10 }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "linen", fg: "ink", hi: "madder", world: true, cols: ["madder", "indigo", "olive"], num: 148 },
      cta: { bg: "madder", fg: "linen", hi: "ink", world: false, top: 500, size: 114, btn: { v: "block", bg: "ink", c: "linen" }, logoShape: "rounded" },
      app: { bg: "linen", fg: "ink", hi: "madder", cardBg: "#f8f1e4", line: "ink", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      Array.from({ length: 18 }).map((_, i) => {
        const x = 90 + i * ((u.W - 180) / 17);
        const lift = (i % 2 === (Math.floor(t * 1.6) % 2)) ? -16 : 0;
        return R("line", { key: i, x1: x, y1: 200 + lift, x2: x, y2: u.H - 260 + lift, stroke: rgba(theme.ink, 0.22), strokeWidth: 4 });
      }),
      (function () {
        const ph = (t * 0.5) % 2;
        const dir = ph < 1 ? ph : 2 - ph;
        const sx = 90 + dir * (u.W - 180);
        const sy = u.H - 470;
        return R("g", { transform: "translate(" + sx + "," + sy + ") rotate(" + (ph < 1 ? 0 : 180) + ")" },
          R("path", { d: "M -54 0 q 22 -18 54 0 q -22 18 -54 0 z", fill: theme.madder, stroke: theme.ink, strokeWidth: 3 }),
          R("circle", { cx: -6, r: 8, fill: rgba(theme.linen, 0.9) }));
      })(),
      Array.from({ length: 6 }).map((_, i) => R("line", { key: "w" + i, x1: 90, y1: u.H - 450 + i * 34, x2: u.W - 90, y2: u.H - 450 + i * 34, stroke: rgba([theme.madder, theme.indigo, theme.olive][i % 3], 0.55), strokeWidth: 13, strokeLinecap: "round" })),
      [[150, 0], [250, 1], [u.W - 170, 2]].map(([x, i]) => R("g", { key: "c" + i, transform: "translate(" + x + "," + (u.H - 190) + ")" },
        R("path", { d: "M -26 0 L 26 0 L 14 -96 L -14 -96 Z", fill: [theme.madder, theme.olive, theme.indigo][i], opacity: 0.85 }),
        Array.from({ length: 5 }).map((_, k) => R("line", { key: k, x1: -24 + k, y1: -14 - k * 16, x2: 24 - k, y2: -18 - k * 16, stroke: rgba(theme.linen, 0.35), strokeWidth: 3 })),
        R("ellipse", { cy: 2, rx: 28, ry: 7, fill: rgba(theme.ink, 0.3) }))),
      R("path", { d: "M 110 240 q 120 " + (26 + Math.sin(t * 1.4) * 10) + " 240 0 q 120 -" + (26 + Math.cos(t * 1.2) * 10) + " 240 0", fill: "none", stroke: rgba(theme.olive, 0.55), strokeWidth: 6, strokeLinecap: "round" })),
  });

  /* ---- Vault Twelve: spinning dial, laser grid, tumbling coins, alarm sweep ---- */
  FilmKit.make({
    global: "VaultTwelve", variants: { Code: "terminal", Ring: "ring", Cursor: "keys", Notify: "drop" },
    brand: "Vault Twelve", desk: "#0b0e12", ambient: 1.9,
    FH: '"Chakra Petch", sans-serif', FB: '"IBM Plex Sans", sans-serif',
    palette: (t) => ({ steel: t.steel || "#141920", laser: t.laser || "#ff3355", bullion: "#e8c35a", chrome: "#c8d2dc", ink: "#0a0d11" }),
    tweaks: [{ k: "steel", label: "Vault", options: ["#141920", "#12161e", "#161418"] }, { k: "laser", label: "Laser", options: ["#ff3355", "#33ff99", "#3388ff"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("rect", { x: 3, y: 4, width: 18, height: 16, rx: 3 }), R2("circle", { cx: 12, cy: 12, r: 4 }), R2("path", { d: "M12 8V6M12 18v-2M16 12h2M6 12h2" })),
    cams: ["zoomIn", "pushR", "spin", "pushL", "drop", "zoomOut"], camMul: 7, camOff: 2,
    mag: { rot: 1.0, skew: 3, inn: 0.16 }, titlePreset: "machete", itemPreset: "slam", titleSpace: "0.04em",
    look: {
      hook: { bg: "steel", fg: "chrome", hi: "laser", world: true, top: 320, size: 112, upper: true, kicker: { v: "tag", bg: "laser", c: "ink" } },
      statement: { bg: "ink", fg: "chrome", hi: "laser", world: true, top: 630, size: 136, upper: true },
      feature: { bg: "steel", fg: "chrome", hi: "bullion", world: true, top: 250, size: 92, upper: true, card: { v: "glow", bg: "#0d1116", glow: "laser", r: 10, line: "chrome" }, chips: { v: "square", colors: ["laser", "bullion", "chrome"], text: "ink" } },
      montage: { bg: "#0d1116", fg: "chrome", hi: "laser", world: false, top: 258, size: 90, upper: true, tile: { bg: "steel", line: "chrome", label: "bullion", r: 8, glow: "laser" }, tilts: [0, 0, 0, 0] },
      stats: { bg: "steel", fg: "chrome", hi: "laser", world: true, cols: ["laser", "bullion", "chrome"], num: 146, upper: true, glowNums: true, rule: true },
      cta: { bg: "#0d1116", fg: "chrome", hi: "bullion", world: true, top: 500, size: 110, upper: true, btn: { v: "glow", bg: "laser", c: "ink" }, logoShape: "rounded" },
      app: { bg: "steel", fg: "chrome", hi: "laser", cardBg: "#1c232c", line: "chrome", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("g", { transform: "translate(" + (u.W - 210) + "," + (u.H - 400) + ")" },
        R("circle", { r: 132, fill: rgba(theme.chrome, 0.08), stroke: rgba(theme.chrome, 0.4), strokeWidth: 8 }),
        R("g", { transform: "rotate(" + (Math.sin(t * 0.6) * 220) + ")" },
          Array.from({ length: 24 }).map((_, i) => R("line", { key: i, x1: Math.cos(i * Math.PI / 12) * 96, y1: Math.sin(i * Math.PI / 12) * 96, x2: Math.cos(i * Math.PI / 12) * 116, y2: Math.sin(i * Math.PI / 12) * 116, stroke: rgba(theme.chrome, i % 6 === 0 ? 0.85 : 0.35), strokeWidth: i % 6 === 0 ? 6 : 3 })),
          R("rect", { x: -9, y: -104, width: 18, height: 40, rx: 6, fill: theme.bullion })),
        R("circle", { r: 40, fill: rgba(theme.chrome, 0.22), stroke: rgba(theme.chrome, 0.5), strokeWidth: 5 }),
        R("circle", { r: 12, fill: theme.laser })),
      Array.from({ length: 5 }).map((_, i) => {
        const y = 260 + i * 130 + Math.sin(t * 0.9 + i * 1.3) * 26;
        return R("line", { key: "l" + i, x1: 60, y1: y, x2: u.W - 60, y2: y + Math.sin(t + i) * 30, stroke: rgba(theme.laser, 0.5), strokeWidth: 3, style: { filter: "drop-shadow(0 0 8px " + theme.laser + ")" } });
      }),
      [0, 1, 2, 3].map((i) => {
        const ph = (t * 0.4 + i * 0.25) % 1;
        const cy = 300 + ph * (u.H - 500);
        return R("ellipse", { key: "c" + i, cx: 180 + i * 90, cy, rx: 26, ry: 26 * Math.abs(Math.cos(ph * 9 + i)), fill: theme.bullion, opacity: 0.85 - ph * 0.3 });
      }),
      R("rect", { x: 70, y: u.H - 240, width: 220, height: 14, rx: 7, fill: rgba(theme.chrome, 0.2) }),
      R("rect", { x: 70, y: u.H - 240, width: 220 * (0.2 + Math.abs(Math.sin(t * 0.5)) * 0.8), height: 14, rx: 7, fill: theme.laser })),
  });

  /* ---- Bonsai Bench: swaying bonsai, falling needles, snips, moss dish ---- */
  FilmKit.make({
    global: "BonsaiBench", variants: { Toggle: "dial", Ring: "gauge", Typing: "hand", Scroll: "board" },
    brand: "Bonsai Bench", desk: "#232b22", ambient: 1.4,
    FH: '"Fraunces", serif', FB: '"Rubik", sans-serif',
    palette: (t) => ({ paper: t.paper || "#eee9dc", pine: t.pine || "#41613f", bark: "#6b4f34", stone: "#9aa39a", ink: "#26302a" }),
    tweaks: [{ k: "paper", label: "Bench", options: ["#eee9dc", "#e8e4d4", "#efe8e0"] }, { k: "pine", label: "Foliage", options: ["#41613f", "#3a5c54", "#5c6b34"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M12 20v-8M12 12c-3 0-5-2-5-4M12 12c3 0 6-1 6-4M5 20h14" })),
    cams: ["zoomOut", "pushU", "drop", "pushL", "zoomIn", "pushR"], camMul: 3, camOff: 1,
    mag: { rot: 0.3, driftY: 7, inn: 0.3, driftZ: 0.03 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.06,
    look: {
      hook: { bg: "paper", fg: "ink", hi: "pine", world: true, top: 330, size: 118, kicker: { v: "outline", c: "bark" } },
      statement: { bg: "pine", fg: "paper", hi: "stone", world: false, top: 630, size: 142 },
      feature: { bg: "paper", fg: "ink", hi: "pine", world: true, top: 250, size: 94, card: { v: "frame", bg: "ink", r: 20, line: "paper" }, chips: { v: "pill", colors: ["pine", "bark"], text: "paper" } },
      montage: { bg: "ink", fg: "paper", hi: "pine", world: false, top: 258, size: 90, tile: { bg: "paper", line: "ink", label: "paper", r: 16 }, tilts: [-1.5, 1, 1.5, -1] },
      stats: { bg: "paper", fg: "ink", hi: "pine", world: true, cols: ["pine", "bark", "stone"], num: 146 },
      cta: { bg: "ink", fg: "paper", hi: "pine", world: false, top: 500, size: 112, btn: { v: "pill", bg: "pine", c: "paper" }, logoShape: "circle" },
      app: { bg: "paper", fg: "ink", hi: "pine", cardBg: "#f8f4ea", line: "ink", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      (function () {
        const sway = Math.sin(t * 0.7) * 3;
        const bx = u.W - 250, by = u.H - 300;
        return R("g", { transform: "translate(" + bx + "," + by + ")" },
          R("path", { d: "M -110 0 q 0 46 110 46 q 110 0 110 -46 z", fill: theme.bark }),
          R("path", { d: "M -110 0 h 220", stroke: rgba(theme.ink, 0.4), strokeWidth: 6 }),
          R("g", { transform: "rotate(" + sway + " 0 0)" },
            R("path", { d: "M 8 0 q -30 -70 6 -130 q 26 -46 -14 -96", fill: "none", stroke: theme.bark, strokeWidth: 22, strokeLinecap: "round" }),
            R("path", { d: "M -2 -140 q -40 -18 -70 -50", fill: "none", stroke: theme.bark, strokeWidth: 13, strokeLinecap: "round" }),
            R("ellipse", { cx: -100, cy: -206, rx: 74, ry: 40, fill: theme.pine, opacity: 0.92 }),
            R("ellipse", { cx: 8, cy: -252, rx: 92, ry: 46, fill: theme.pine }),
            R("ellipse", { cx: 76, cy: -178, rx: 54, ry: 30, fill: theme.pine, opacity: 0.85 })));
      })(),
      Array.from({ length: 8 }).map((_, i) => {
        const ph = (t * (0.1 + (i % 3) * 0.04) + i * 0.13) % 1;
        return R("line", { key: "n" + i, x1: u.W - 340 + ((i * 71) % 260) + Math.sin(t + i) * 18, y1: 380 + ph * (u.H - 640), x2: u.W - 330 + ((i * 71) % 260) + Math.sin(t + i) * 18, y2: 396 + ph * (u.H - 640), stroke: rgba(theme.pine, 0.5 * (1 - ph) + 0.1), strokeWidth: 4, strokeLinecap: "round" });
      }),
      (function () {
        const open = Math.abs(Math.sin(t * 1.8)) * 16;
        return R("g", { transform: "translate(180," + (u.H - 520) + ") rotate(30)" },
          R("line", { x1: 0, y1: 0, x2: 96, y2: -open, stroke: theme.stone, strokeWidth: 8, strokeLinecap: "round" }),
          R("line", { x1: 0, y1: 0, x2: 96, y2: open, stroke: theme.stone, strokeWidth: 8, strokeLinecap: "round" }),
          R("circle", { cx: -20, cy: -14, r: 12, fill: "none", stroke: theme.bark, strokeWidth: 6 }),
          R("circle", { cx: -20, cy: 14, r: 12, fill: "none", stroke: theme.bark, strokeWidth: 6 }));
      })(),
      R("g", { transform: "translate(190," + (u.H - 250) + ")" },
        R("ellipse", { rx: 84, ry: 22, fill: theme.stone, opacity: 0.55 }),
        R("ellipse", { cy: -12, rx: 70, ry: 18, fill: theme.pine, opacity: 0.6 }),
        [0, 1, 2].map((i) => R("circle", { key: i, cx: -34 + i * 34, cy: -20 + Math.sin(t * 1.1 + i) * 3, r: 9, fill: rgba(theme.pine, 0.85) }))),
      R("circle", { cx: 200, cy: 250, r: 62, fill: "none", stroke: rgba(theme.ink, 0.18), strokeWidth: 3, strokeDasharray: "390", strokeDashoffset: String(390 * (1 - u.seg(p, 0.1, 0.85))) })),
  });

  /* ---- Slow Rise: bubbling levain, dough dome, flour puffs, scoring blade ---- */
  FilmKit.make({
    global: "SlowRise", variants: { Ring: "bar", Scroll: "feed", Toggle: "check", Morph: "roll" },
    brand: "Slow Rise", desk: "#3a2c1e", ambient: 1.6,
    FH: '"Bitter", serif', FB: '"Mulish", sans-serif',
    palette: (t) => ({ crumb: t.crumb || "#f4e7cf", crust: t.crust || "#a9642c", rye: "#6b4a2f", wheat: "#dcae5c", ink: "#33261a" }),
    tweaks: [{ k: "crumb", label: "Crumb", options: ["#f4e7cf", "#efe4d4", "#f6ecd8"] }, { k: "crust", label: "Crust", options: ["#a9642c", "#8c4f2c", "#c2803c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M3 14a9 6 0 0 1 18 0 6 6 0 0 1-6 6H9a6 6 0 0 1-6-6zM9 11l2 4M14 10l2 5" })),
    cams: ["hopU", "zoomIn", "pushL", "pushR", "drop", "zoomOut"], camMul: 5, camOff: 3,
    mag: { rot: 0.6, driftY: 8, inn: 0.24 }, titlePreset: "rise", itemPreset: "pop", titleLine: 1.06,
    look: {
      hook: { bg: "crumb", fg: "ink", hi: "crust", world: true, top: 330, size: 120, kicker: { v: "pill", bg: "crust", c: "crumb" } },
      statement: { bg: "rye", fg: "crumb", hi: "wheat", world: false, top: 630, size: 146 },
      feature: { bg: "crumb", fg: "ink", hi: "crust", world: true, top: 250, size: 96, card: { v: "tilt", bg: "ink", r: 22, line: "crumb" }, chips: { v: "pill", colors: ["crust", "wheat"], text: "ink" } },
      montage: { bg: "ink", fg: "crumb", hi: "wheat", world: false, top: 258, size: 92, tile: { bg: "crumb", line: "ink", label: "crumb", r: 18 }, tilts: [-2.5, 2, 1.5, -2] },
      stats: { bg: "crumb", fg: "ink", hi: "crust", world: true, cols: ["crust", "wheat", "rye"], num: 150 },
      cta: { bg: "crust", fg: "crumb", hi: "ink", world: false, top: 500, size: 116, btn: { v: "pill", bg: "ink", c: "crumb" }, logoShape: "circle" },
      app: { bg: "crumb", fg: "ink", hi: "crust", cardBg: "#fdf6e8", line: "ink", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      (function () {
        const grow = u.seg(p, 0.05, 0.75);
        const dy = u.H - 300, dx = u.W - 250;
        const rise = 90 + grow * 60 + Math.sin(t * 0.8) * 6;
        return R("g", { transform: "translate(" + dx + "," + dy + ")" },
          R("path", { d: "M -150 0 a 150 " + rise + " 0 0 1 300 0 z", fill: theme.crust }),
          R("ellipse", { rx: 158, ry: 22, fill: rgba(theme.ink, 0.28) }),
          [0, 1, 2].map((i) => R("path", { key: i, d: "M " + (-72 + i * 62) + " -" + (rise * 0.44) + " l 44 -30", stroke: rgba(theme.crumb, 0.7), strokeWidth: 8, strokeLinecap: "round", fill: "none" })));
      })(),
      R("g", { transform: "translate(200," + (u.H - 470) + ")" },
        R("path", { d: "M -66 -110 L 66 -110 L 54 40 L -54 40 Z", fill: "none", stroke: rgba(theme.ink, 0.35), strokeWidth: 5 }),
        R("path", { d: "M -58 -30 L 58 -30 L 52 36 L -52 36 Z", fill: rgba(theme.wheat, 0.55) }),
        Array.from({ length: 7 }).map((_, i) => {
          const ph = (t * (0.35 + (i % 3) * 0.12) + i * 0.15) % 1;
          return R("circle", { key: i, cx: -44 + ((i * 17) % 88), cy: 30 - ph * 62, r: 4 + (i % 3) * 3, fill: "none", stroke: rgba(theme.crumb, 0.75 * (1 - ph)), strokeWidth: 3 });
        })),
      Array.from({ length: 10 }).map((_, i) => {
        const ph = (t * (0.12 + (i % 4) * 0.05) + i * 0.1) % 1;
        return R("circle", { key: "f" + i, cx: (i * 113 + 40) % u.W + Math.sin(t * 0.8 + i) * 22, cy: 200 + ph * (u.H - 560), r: 3 + (i % 2) * 2, fill: rgba("#ffffff", 0.5 * (1 - ph) + 0.12) });
      }),
      R("g", { transform: "translate(" + (u.W - 160) + ",250) rotate(" + (-34 + Math.sin(t * 1.5) * 8) + ")" },
        R("path", { d: "M -8 0 q 22 -60 8 -104 q -6 -20 -20 -8 q -12 12 -2 46 q 6 26 14 66 z", fill: theme.wheat, opacity: 0.9 }),
        R("rect", { x: -8, y: 0, width: 16, height: 88, rx: 8, fill: theme.rye }))),
  });

  /* ---- Aerial Silk: hanging silks that ripple, spotlight cone, swinging hoop ---- */
  FilmKit.make({
    global: "AerialSilk", variants: { Swipe: "flip", Ring: "ring", Cursor: "slider", Notify: "side" },
    brand: "Aerial Silk", desk: "#180e1c", ambient: 1.6,
    FH: '"Playfair Display", serif', FB: '"Figtree", sans-serif',
    palette: (t) => ({ house: t.house || "#22132a", silk: t.silk || "#e05a7a", gilt: "#dfae5c", chalkw: "#f2ecf2", ink: "#150c19" }),
    tweaks: [{ k: "house", label: "House", options: ["#22132a", "#181a2e", "#2a1420"] }, { k: "silk", label: "Silks", options: ["#e05a7a", "#5ad0e0", "#c08ce0"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M9 3c0 6-3 8-3 12a3 3 0 0 0 6 0M15 3c0 6 3 8 3 12a3 3 0 0 1-6 0" })),
    cams: ["drop", "zoomIn", "pushL", "hopU", "pushR", "zoomOut"], camMul: 5, camOff: 0,
    mag: { rot: 0.7, driftY: 11, inn: 0.26 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.04,
    look: {
      hook: { bg: "house", fg: "chalkw", hi: "silk", world: true, top: 330, size: 124, kicker: { v: "outline", c: "gilt" } },
      statement: { bg: "silk", fg: "ink", hi: "chalkw", world: false, top: 630, size: 150 },
      feature: { bg: "house", fg: "chalkw", hi: "silk", world: true, top: 250, size: 98, card: { v: "glow", bg: "ink", glow: "silk", r: 20, line: "chalkw" }, chips: { v: "outline", colors: ["silk", "gilt"], text: "ink" } },
      montage: { bg: "ink", fg: "chalkw", hi: "gilt", world: true, top: 258, size: 94, tile: { bg: "house", line: "chalkw", label: "silk", r: 16, glow: "silk" }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "house", fg: "chalkw", hi: "silk", world: true, cols: ["silk", "gilt", "chalkw"], num: 150, glowNums: true },
      cta: { bg: "ink", fg: "chalkw", hi: "gilt", world: true, top: 500, size: 118, btn: { v: "glow", bg: "silk", c: "ink" }, logoShape: "circle" },
      app: { bg: "house", fg: "chalkw", hi: "silk", cardBg: "#301c3a", line: "chalkw", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("polygon", { points: (u.W / 2 - 60) + ",0 " + (u.W / 2 - 320 + Math.sin(t * 0.4) * 60) + "," + u.H + " " + (u.W / 2 + 200 + Math.sin(t * 0.4) * 60) + "," + u.H, fill: rgba(theme.gilt, 0.08) }),
      [0, 1].map((i) => {
        const base = u.W / 2 - 150 + i * 300;
        const sway = Math.sin(t * 0.9 + i * 1.7) * 46;
        const d = "M " + base + " 120 C " + (base + sway) + " " + (u.H * 0.35) + ", " + (base - sway) + " " + (u.H * 0.62) + ", " + (base + sway * 0.5) + " " + (u.H - 120);
        return R("g", { key: i },
          R("path", { d, fill: "none", stroke: rgba(theme.silk, 0.75), strokeWidth: 34, strokeLinecap: "round" }),
          R("path", { d, fill: "none", stroke: rgba(theme.chalkw, 0.18), strokeWidth: 10, strokeLinecap: "round" }));
      }),
      (function () {
        const sw = Math.sin(t * 0.8) * 24;
        return R("g", { transform: "translate(" + (u.W - 200) + ",140) rotate(" + sw * 0.4 + ")" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: 300, stroke: rgba(theme.chalkw, 0.35), strokeWidth: 4 }),
          R("circle", { cy: 380, r: 80, fill: "none", stroke: theme.gilt, strokeWidth: 11 }),
          R("circle", { cy: 300, r: 8, fill: theme.gilt }));
      })(),
      Array.from({ length: 12 }).map((_, i) => {
        const ph = (t * (0.08 + (i % 3) * 0.03) + i * 0.09) % 1;
        return R("circle", { key: "d" + i, cx: (i * 149 + 60) % u.W, cy: 160 + ph * (u.H - 300), r: 2.5, fill: rgba(theme.gilt, 0.4 * (1 - ph) + 0.1) });
      }),
      R("rect", { x: -20, y: u.H - 120, width: u.W + 40, height: 140, fill: rgba(theme.ink, 0.85) }),
      R("ellipse", { cx: u.W / 2, cy: u.H - 118, rx: 300, ry: 26, fill: rgba(theme.gilt, 0.12) })),
  });

  /* ---- Alpine Post: cable car crossing, peaks, snow, postmark stamp ---- */
  FilmKit.make({
    global: "AlpinePost", variants: { Scroll: "board", DragDrop: "drag", Toggle: "switch", Morph: "flap" },
    brand: "Alpine Post", desk: "#c8d8e0", ambient: 1.7,
    FH: '"Alegreya Sans SC", sans-serif', FB: '"Barlow", sans-serif',
    palette: (t) => ({ snow: t.snow || "#eef4f8", post: t.post || "#c0392b", pine: "#2f4f43", slateb: "#4a6478", ink: "#1e2c36" }),
    tweaks: [{ k: "snow", label: "Snow", options: ["#eef4f8", "#e8eef2", "#f0f0ea"] }, { k: "post", label: "Post", options: ["#c0392b", "#2b6dc0", "#c08b2b"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("rect", { x: 3, y: 6, width: 18, height: 12, rx: 2 }), R2("path", { d: "M3 8l9 6 9-6" })),
    cams: ["pushL", "pushR", "zoomOut", "hopU", "zoomIn", "drop"], camMul: 5, camOff: 2,
    mag: { rot: 0.5, slide: 0.3, driftX: 8 }, titlePreset: "stamp", itemPreset: "streak", titleSpace: "0.05em",
    look: {
      hook: { bg: "snow", fg: "ink", hi: "post", world: true, top: 320, size: 118, upper: true, kicker: { v: "tag", bg: "post", c: "snow" } },
      statement: { bg: "pine", fg: "snow", hi: "post", world: false, top: 630, size: 144, upper: true },
      feature: { bg: "snow", fg: "ink", hi: "post", world: true, top: 250, size: 94, upper: true, card: { v: "frame", bg: "ink", r: 12, line: "snow" }, chips: { v: "square", colors: ["post", "pine", "slateb"], text: "snow" } },
      montage: { bg: "ink", fg: "snow", hi: "post", world: false, top: 258, size: 90, upper: true, tile: { bg: "snow", line: "ink", label: "ink", r: 10 }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "snow", fg: "ink", hi: "post", world: true, cols: ["post", "pine", "slateb"], num: 148, upper: true, rule: true },
      cta: { bg: "post", fg: "snow", hi: "ink", world: false, top: 500, size: 114, upper: true, btn: { v: "block", bg: "ink", c: "snow" }, logoShape: "rounded" },
      app: { bg: "snow", fg: "ink", hi: "post", cardBg: "#ffffff", line: "ink", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("path", { d: "M -20 " + u.H + " L " + (u.W * 0.26) + " " + (u.H - 700) + " L " + (u.W * 0.46) + " " + (u.H - 380) + " L " + (u.W * 0.68) + " " + (u.H - 780) + " L " + (u.W + 20) + " " + u.H + " Z", fill: rgba(theme.slateb, 0.4) }),
      R("path", { d: "M " + (u.W * 0.26 - 62) + " " + (u.H - 560) + " L " + (u.W * 0.26) + " " + (u.H - 700) + " L " + (u.W * 0.26 + 62) + " " + (u.H - 560) + " q -34 22 -62 0 q -28 -22 -62 0 Z", fill: theme.snow }),
      R("path", { d: "M " + (u.W * 0.68 - 70) + " " + (u.H - 620) + " L " + (u.W * 0.68) + " " + (u.H - 780) + " L " + (u.W * 0.68 + 70) + " " + (u.H - 620) + " q -36 24 -70 0 q -34 -24 -70 0 Z", fill: theme.snow }),
      R("line", { x1: -20, y1: 300, x2: u.W + 20, y2: 460, stroke: rgba(theme.ink, 0.45), strokeWidth: 5 }),
      (function () {
        const ph = ((t * 0.12) % 1);
        const cx = -60 + ph * (u.W + 120), cy = 300 + (cx + 20) / (u.W + 40) * 160;
        return R("g", { transform: "translate(" + cx + "," + cy + ")" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: 44, stroke: theme.ink, strokeWidth: 6 }),
          R("rect", { x: -46, y: 44, width: 92, height: 72, rx: 12, fill: theme.post, stroke: theme.ink, strokeWidth: 4, transform: "rotate(" + Math.sin(t * 2) * 3 + " 0 44)" }),
          R("rect", { x: -32, y: 60, width: 64, height: 30, rx: 6, fill: rgba(theme.snow, 0.9), transform: "rotate(" + Math.sin(t * 2) * 3 + " 0 44)" }));
      })(),
      [0, 1, 2].map((i) => R("g", { key: "p" + i, transform: "translate(" + (140 + i * 240) + "," + (u.H - 300) + ")" },
        R("polygon", { points: "0,-110 44,0 -44,0", fill: theme.pine }),
        R("polygon", { points: "0,-160 34,-70 -34,-70", fill: theme.pine }),
        R("rect", { x: -7, y: 0, width: 14, height: 30, fill: rgba(theme.ink, 0.7) }))),
      Array.from({ length: 16 }).map((_, i) => {
        const ph = (t * (0.05 + (i % 4) * 0.02) + i * 0.07) % 1;
        return R("circle", { key: "s" + i, cx: (i * 79 + 30) % u.W + Math.sin(t * 0.9 + i) * 24, cy: ph * u.H, r: 3 + (i % 2) * 2, fill: rgba("#ffffff", 0.85 * (1 - ph * 0.3)) });
      }),
      R("g", { transform: "translate(" + (u.W - 170) + ",230) rotate(-12)" },
        R("circle", { r: 66, fill: "none", stroke: rgba(theme.post, 0.55), strokeWidth: 6, strokeDasharray: "12 9" }),
        R("text", { y: -6, textAnchor: "middle", fontFamily: '"Alegreya Sans SC", sans-serif', fontSize: 26, fill: rgba(theme.post, 0.7) }, "ALPINE"),
        R("text", { y: 26, textAnchor: "middle", fontFamily: '"Alegreya Sans SC", sans-serif', fontSize: 22, fill: rgba(theme.post, 0.55) }, "2,140 M"))),
  });

  /* ---- Reef Build: coral branches growing, schooling fish, bubbles, light rays ---- */
  FilmKit.make({
    global: "ReefBuild", variants: { Ring: "gauge", Scroll: "feed", DragDrop: "assemble", Notify: "pop" },
    brand: "Reef Build", desk: "#062a33", ambient: 1.5,
    FH: '"Outfit", sans-serif', FB: '"Nunito Sans", sans-serif',
    palette: (t) => ({ lagoon: t.lagoon || "#0d3d4a", coral: t.coral || "#ff7a5c", aqua: "#4fd6c0", shell: "#f2ead9", ink: "#062730" }),
    tweaks: [{ k: "lagoon", label: "Lagoon", options: ["#0d3d4a", "#0d3a46", "#123a52"] }, { k: "coral", label: "Coral", options: ["#ff7a5c", "#ff5c8a", "#ffb35c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M12 21v-8M12 13L7 8M12 13l5-5M7 8V4M17 8V4M4 21h16" })),
    cams: ["zoomOut", "pushU", "drop", "pushR", "zoomIn", "pushL"], camMul: 5, camOff: 1,
    mag: { rot: 0.4, driftY: 10, inn: 0.28, driftZ: 0.04 }, titlePreset: "rise", itemPreset: "pop", titleLine: 1.06,
    look: {
      hook: { bg: "lagoon", fg: "shell", hi: "coral", world: true, top: 330, size: 120, upper: true, kicker: { v: "pill", bg: "aqua", c: "ink" } },
      statement: { bg: "ink", fg: "shell", hi: "aqua", world: true, top: 630, size: 146, upper: true },
      feature: { bg: "lagoon", fg: "shell", hi: "coral", world: true, top: 250, size: 96, upper: true, card: { v: "glow", bg: "ink", glow: "aqua", r: 24, line: "shell" }, chips: { v: "pill", colors: ["coral", "aqua"], text: "ink" } },
      montage: { bg: "ink", fg: "shell", hi: "coral", world: true, top: 258, size: 92, upper: true, tile: { bg: "lagoon", line: "shell", label: "aqua", r: 20, glow: "aqua" }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "lagoon", fg: "shell", hi: "coral", world: true, cols: ["coral", "aqua", "shell"], num: 150, upper: true, glowNums: true },
      cta: { bg: "aqua", fg: "ink", hi: "coral", world: false, top: 500, size: 116, upper: true, btn: { v: "block", bg: "ink", c: "shell" }, logoShape: "circle" },
      app: { bg: "lagoon", fg: "shell", hi: "coral", cardBg: "#0e4a57", line: "shell", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      Array.from({ length: 4 }).map((_, i) => R("polygon", { key: "ry" + i, points: (140 + i * 260) + ",-20 " + (240 + i * 260) + ",-20 " + (60 + i * 260 + Math.sin(t * 0.3 + i) * 40) + "," + (u.H * 0.7) + " " + (10 + i * 260 + Math.sin(t * 0.3 + i) * 40) + "," + (u.H * 0.7), fill: rgba(theme.shell, 0.045) })),
      [[190, 0], [330, 1], [u.W - 220, 2], [u.W - 110, 3]].map(([x, i]) => {
        const g = u.ease.outBack(u.clamp01(u.seg(p, 0.05 + i * 0.08, 0.4 + i * 0.08)));
        const h = (150 + (i % 2) * 60) * g;
        return R("g", { key: "c" + i, transform: "translate(" + x + "," + (u.H - 200) + ")" },
          R("path", { d: "M 0 0 V -" + h, stroke: i % 2 ? theme.coral : theme.aqua, strokeWidth: 18, strokeLinecap: "round", fill: "none" }),
          R("path", { d: "M 0 -" + h * 0.55 + " l -" + 46 * g + " -" + 54 * g, stroke: i % 2 ? theme.coral : theme.aqua, strokeWidth: 14, strokeLinecap: "round", fill: "none" }),
          R("path", { d: "M 0 -" + h * 0.75 + " l " + 40 * g + " -" + 46 * g, stroke: i % 2 ? theme.coral : theme.aqua, strokeWidth: 12, strokeLinecap: "round", fill: "none" }),
          R("circle", { cy: -h, r: 12 * g, fill: i % 2 ? theme.coral : theme.aqua }));
      }),
      (function () {
        const sx = ((t * 90) % (u.W + 400)) - 200;
        return R("g", null, Array.from({ length: 9 }).map((_, i) => {
          const ox = (i % 3) * 62, oy = Math.floor(i / 3) * 46 + Math.sin(t * 3 + i) * 8;
          return R("g", { key: i, transform: "translate(" + (sx + ox) + "," + (420 + oy) + ")" },
            R("ellipse", { rx: 24, ry: 12, fill: rgba(theme.shell, 0.72) }),
            R("polygon", { points: "-22,0 -40,-11 -40,11", fill: rgba(theme.shell, 0.72) }),
            R("circle", { cx: 12, cy: -3, r: 2.6, fill: theme.ink }));
        }));
      })(),
      Array.from({ length: 10 }).map((_, i) => {
        const ph = (t * (0.14 + (i % 3) * 0.05) + i * 0.1) % 1;
        return R("circle", { key: "b" + i, cx: (i * 131 + 60) % u.W + Math.sin(t * 1.4 + i) * 16, cy: u.H - ph * (u.H + 80), r: 4 + (i % 3) * 3, fill: "none", stroke: rgba(theme.shell, 0.3 * (1 - ph) + 0.08), strokeWidth: 3 });
      }),
      R("path", { d: "M -20 " + (u.H - 190) + " q 200 -46 420 -10 q 260 42 620 -20 L " + (u.W + 20) + " " + (u.H + 20) + " L -20 " + (u.H + 20) + " Z", fill: rgba(theme.ink, 0.55) })),
  });

  /* ---- Clay Court: bouncing ball with clay puffs, net weave, line chalk ---- */
  FilmKit.make({
    global: "ClayCourt", variants: { Cursor: "keys", Ring: "bar", Scroll: "ticker", Toggle: "dial" },
    brand: "Clay Court", desk: "#7a3a24", ambient: 2.0,
    FH: '"Archivo Black", sans-serif', FB: '"Archivo", sans-serif',
    palette: (t) => ({ clay: t.clay || "#c1552f", lime: t.lime || "#d8f04b", chalkline: "#f6f1e6", shade: "#3a2016", court: "#8c3f22" }),
    tweaks: [{ k: "clay", label: "Court", options: ["#c1552f", "#2e6e4e", "#2e5f8c"] }, { k: "lime", label: "Ball", options: ["#d8f04b", "#f0a03c", "#f24b8c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("circle", { cx: 12, cy: 12, r: 9 }), R2("path", { d: "M5 5c4 3 5 11 2 14M19 5c-4 3-5 11-2 14" })),
    cams: ["pushR", "hopU", "zoomIn", "pushL", "spin", "drop"], camMul: 7, camOff: 0,
    mag: { skew: 5, rot: 1.2, inn: 0.16, slide: 0.32 }, titlePreset: "slam", itemPreset: "slam", titleSpace: "0.01em",
    look: {
      hook: { bg: "clay", fg: "chalkline", hi: "lime", world: true, top: 310, size: 126, upper: true, kicker: { v: "tag", bg: "lime", c: "shade" } },
      statement: { bg: "shade", fg: "chalkline", hi: "lime", world: false, top: 630, size: 152, upper: true },
      feature: { bg: "clay", fg: "chalkline", hi: "lime", world: true, top: 248, size: 98, upper: true, card: { v: "frame", bg: "shade", r: 12, line: "chalkline" }, chips: { v: "square", colors: ["lime", "chalkline"], text: "shade" } },
      montage: { bg: "shade", fg: "chalkline", hi: "lime", world: false, top: 258, size: 94, upper: true, tile: { bg: "court", line: "chalkline", label: "lime", r: 10 }, tilts: [-2.5, 2, 1.5, -2] },
      stats: { bg: "clay", fg: "chalkline", hi: "lime", world: true, cols: ["lime", "chalkline", "shade"], num: 152, upper: true, rule: true },
      cta: { bg: "lime", fg: "shade", hi: "clay", world: false, top: 500, size: 120, upper: true, btn: { v: "block", bg: "shade", c: "chalkline" }, logoShape: "rounded" },
      app: { bg: "clay", fg: "chalkline", hi: "lime", cardBg: "#a04a29", line: "chalkline", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("path", { d: "M 200 " + (u.H - 180) + " L " + (u.W - 200) + " " + (u.H - 180) + " L " + (u.W - 40) + " " + (u.H - 620) + " L 40 " + (u.H - 620) + " Z", fill: "none", stroke: rgba(theme.chalkline, 0.55), strokeWidth: 6 }),
      R("line", { x1: 120, y1: u.H - 400, x2: u.W - 120, y2: u.H - 400, stroke: rgba(theme.chalkline, 0.4), strokeWidth: 5 }),
      R("line", { x1: u.W / 2, y1: u.H - 620, x2: u.W / 2, y2: u.H - 180, stroke: rgba(theme.chalkline, 0.3), strokeWidth: 5 }),
      R("g", { transform: "translate(0," + (u.H - 700) + ")" },
        R("rect", { x: 60, y: 0, width: u.W - 120, height: 96, fill: "none", stroke: rgba(theme.chalkline, 0.6), strokeWidth: 5 }),
        Array.from({ length: 22 }).map((_, i) => R("line", { key: "v" + i, x1: 60 + i * ((u.W - 120) / 21), y1: 0, x2: 60 + i * ((u.W - 120) / 21), y2: 96, stroke: rgba(theme.chalkline, 0.3), strokeWidth: 2 })),
        [24, 48, 72].map((y) => R("line", { key: "h" + y, x1: 60, y1: y, x2: u.W - 60, y2: y, stroke: rgba(theme.chalkline, 0.3), strokeWidth: 2 })),
        R("rect", { x: 60, y: -8, width: u.W - 120, height: 12, fill: rgba(theme.chalkline, 0.85) })),
      (function () {
        const per = (t * 0.85) % 1;
        const bx = 140 + per * (u.W - 280);
        const bounce = Math.abs(Math.sin(per * Math.PI * 2.4));
        const by = u.H - 240 - bounce * 460;
        const near = bounce < 0.08;
        return R("g", null,
          near && R("ellipse", { cx: bx, cy: u.H - 236, rx: 30 + (0.08 - bounce) * 300, ry: 9, fill: rgba("#ffffff", 0.28) }),
          R("ellipse", { cx: bx, cy: u.H - 232, rx: 22, ry: 6, fill: rgba(theme.shade, 0.3) }),
          R("g", { transform: "translate(" + bx + "," + by + ") rotate(" + (t * 300 % 360) + ")" },
            R("circle", { r: 22, fill: theme.lime }),
            R("path", { d: "M -22 0 a 22 22 0 0 1 44 0 M -22 0 a 22 22 0 0 0 44 0", fill: "none", stroke: rgba(theme.chalkline, 0.9), strokeWidth: 3 })));
      })(),
      Array.from({ length: 5 }).map((_, i) => R("circle", { key: "d" + i, cx: 160 + i * 180, cy: u.H - 220 + (i % 2) * 24, r: 4 + (i % 3), fill: rgba(theme.shade, 0.22) }))),
  });

  /* ---- Escapement: gear train, oscillating balance wheel, mainspring, loupe ---- */
  FilmKit.make({
    global: "Escapement", variants: { Ring: "ring", Typing: "terminal", Toggle: "dial", Morph: "flap" },
    brand: "Escapement", desk: "#0f1620", ambient: 1.5,
    FH: '"Cormorant Garamond", serif', FB: '"Inter Tight", sans-serif',
    palette: (t) => ({ deep: t.deep || "#152030", brass: t.brass || "#d0a75c", ruby: "#c0384f", silverw: "#dce4ec", ink: "#101a26" }),
    tweaks: [{ k: "deep", label: "Bench", options: ["#152030", "#1a1a26", "#14231f"] }, { k: "brass", label: "Brass", options: ["#d0a75c", "#c8c8d0", "#c07a4c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("circle", { cx: 12, cy: 12, r: 8 }), R2("path", { d: "M12 8v4l3 2M12 2v2M12 20v2M2 12h2M20 12h2" })),
    cams: ["zoomIn", "pushL", "drop", "spin", "pushR", "zoomOut"], camMul: 5, camOff: 3,
    mag: { rot: 0.6, inn: 0.24, driftX: 5 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.04, titleSpace: "0.02em",
    look: {
      hook: { bg: "deep", fg: "silverw", hi: "brass", world: true, top: 330, size: 126, kicker: { v: "outline", c: "brass" } },
      statement: { bg: "ink", fg: "silverw", hi: "brass", world: true, top: 630, size: 152 },
      feature: { bg: "deep", fg: "silverw", hi: "brass", world: true, top: 250, size: 100, card: { v: "glow", bg: "ink", glow: "brass", r: 14, line: "silverw" }, chips: { v: "outline", colors: ["brass", "ruby"], text: "ink" } },
      montage: { bg: "ink", fg: "silverw", hi: "brass", world: true, top: 258, size: 96, tile: { bg: "deep", line: "silverw", label: "brass", r: 10, glow: "brass" }, tilts: [-1.5, 1, 1.5, -1] },
      stats: { bg: "deep", fg: "silverw", hi: "brass", world: true, cols: ["brass", "ruby", "silverw"], num: 152, glowNums: true },
      cta: { bg: "ink", fg: "silverw", hi: "brass", world: true, top: 500, size: 120, btn: { v: "glow", bg: "brass", c: "ink" }, logoShape: "circle" },
      app: { bg: "deep", fg: "silverw", hi: "brass", cardBg: "#1e2c3e", line: "silverw", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      (function () {
        const gear = (cx, cy, r, teeth, spd, col, key) => R("g", { key, transform: "translate(" + cx + "," + cy + ") rotate(" + (t * spd) + ")" },
          Array.from({ length: teeth }).map((_, i) => R("rect", { key: i, x: -5, y: -r - 12, width: 10, height: 16, rx: 3, fill: col, transform: "rotate(" + (i * 360 / teeth) + ")" })),
          R("circle", { r, fill: "none", stroke: col, strokeWidth: 9 }),
          R("circle", { r: r * 0.3, fill: "none", stroke: col, strokeWidth: 6 }),
          Array.from({ length: 5 }).map((_, i) => R("line", { key: "s" + i, x1: 0, y1: 0, x2: Math.cos(i * 1.256) * r * 0.9, y2: Math.sin(i * 1.256) * r * 0.9, stroke: col, strokeWidth: 4 })));
        return R("g", null,
          gear(u.W - 190, u.H - 430, 96, 18, 26, rgba(theme.brass, 0.85), "g1"),
          gear(u.W - 330, u.H - 300, 58, 12, -44, rgba(theme.brass, 0.55), "g2"),
          gear(u.W - 100, u.H - 250, 44, 10, -58, rgba(theme.silverw, 0.4), "g3"));
      })(),
      (function () {
        const osc = Math.sin(t * 5) * 155;
        return R("g", { transform: "translate(220," + (u.H - 480) + ") rotate(" + osc + ")" },
          R("circle", { r: 84, fill: "none", stroke: theme.silverw, strokeWidth: 10 }),
          R("line", { x1: -84, y1: 0, x2: 84, y2: 0, stroke: theme.silverw, strokeWidth: 7 }),
          R("line", { x1: 0, y1: -84, x2: 0, y2: 84, stroke: theme.silverw, strokeWidth: 7 }),
          [0, 90, 180, 270].map((a) => R("circle", { key: a, cx: Math.cos(a * Math.PI / 180) * 84, cy: Math.sin(a * Math.PI / 180) * 84, r: 9, fill: theme.ruby })),
          R("circle", { r: 12, fill: theme.brass }));
      })(),
      (function () {
        const coils = [];
        for (let i = 0; i < 46; i++) {
          const a = i * 0.42, r = 6 + i * 2.1 + Math.sin(t * 2) * 1.4;
          coils.push((i ? "L" : "M") + (Math.cos(a) * r) + " " + (Math.sin(a) * r));
        }
        return R("path", { d: coils.join(" "), fill: "none", stroke: rgba(theme.silverw, 0.35), strokeWidth: 3, transform: "translate(200,270)" });
      })(),
      R("g", { transform: "translate(" + (u.W - 150) + ",230)" },
        R("circle", { r: 56, fill: "none", stroke: rgba(theme.brass, 0.6), strokeWidth: 8 }),
        R("circle", { r: 56, fill: rgba(theme.silverw, 0.06) }),
        R("rect", { x: -18, y: 52, width: 36, height: 54, rx: 10, fill: rgba(theme.brass, 0.5) })),
      Array.from({ length: 3 }).map((_, i) => R("circle", { key: "j" + i, cx: 150 + i * 90, cy: u.H - 220, r: 8, fill: theme.ruby, opacity: 0.5 + 0.4 * Math.abs(Math.sin(t * 2 + i)) }))),
  });

  /* ---- Dune Camp: rolling dunes, camel caravan silhouette, stars, tent glow ---- */
  FilmKit.make({
    global: "DuneCamp", variants: { Scroll: "ticker", Ring: "gauge", Typing: "caret", Swipe: "swipe" },
    brand: "Dune Camp", desk: "#1c1730", ambient: 1.6,
    FH: '"Amiri", serif', FB: '"Tajawal", sans-serif',
    palette: (t) => ({ dusk: t.dusk || "#241d3e", sand: t.sand || "#e0b878", ember2: "#e8703c", night: "#151030", cream2: "#f4ecdc" }),
    tweaks: [{ k: "dusk", label: "Sky", options: ["#241d3e", "#1c2440", "#301c30"] }, { k: "sand", label: "Sand", options: ["#e0b878", "#d8a86c", "#e8c890"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M3 20l9-16 9 16zM8 20l4-7 4 7" })),
    cams: ["pushL", "zoomOut", "drop", "pushR", "zoomIn", "pushU"], camMul: 5, camOff: 2,
    mag: { rot: 0.4, driftY: 9, inn: 0.3, driftZ: 0.035 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.08,
    look: {
      hook: { bg: "dusk", fg: "cream2", hi: "sand", world: true, top: 330, size: 122, kicker: { v: "bare", c: "sand" } },
      statement: { bg: "night", fg: "cream2", hi: "ember2", world: true, top: 630, size: 148 },
      feature: { bg: "dusk", fg: "cream2", hi: "sand", world: true, top: 250, size: 98, card: { v: "glow", bg: "night", glow: "sand", r: 22, line: "cream2" }, chips: { v: "outline", colors: ["sand", "ember2"], text: "night" } },
      montage: { bg: "night", fg: "cream2", hi: "sand", world: true, top: 258, size: 94, tile: { bg: "dusk", line: "cream2", label: "sand", r: 18, glow: "sand" }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "dusk", fg: "cream2", hi: "sand", world: true, cols: ["sand", "ember2", "cream2"], num: 150, glowNums: true },
      cta: { bg: "sand", fg: "night", hi: "ember2", world: false, top: 500, size: 118, btn: { v: "pill", bg: "night", c: "cream2" }, logoShape: "circle" },
      app: { bg: "dusk", fg: "cream2", hi: "sand", cardBg: "#312752", line: "cream2", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      Array.from({ length: 22 }).map((_, i) => R("circle", { key: "s" + i, cx: (i * 167 + 40) % u.W, cy: (i * 211 + 60) % (u.H * 0.5), r: 1.6 + (i % 3) * 0.7, fill: rgba(theme.cream2, 0.3 + 0.55 * Math.abs(Math.sin(t * 1.5 + i * 2.3))) })),
      R("circle", { cx: u.W - 210, cy: 250, r: 62, fill: rgba(theme.cream2, 0.9) }),
      R("circle", { cx: u.W - 240, cy: 236, r: 56, fill: theme.dusk }),
      R("path", { d: "M -20 " + (u.H - 470) + " q 260 -130 520 -30 q 280 108 560 -40 L " + (u.W + 20) + " " + (u.H + 20) + " L -20 " + (u.H + 20) + " Z", fill: rgba(theme.sand, 0.45) }),
      R("path", { d: "M -20 " + (u.H - 300) + " q 220 -110 470 -20 q 300 100 590 -50 L " + (u.W + 20) + " " + (u.H + 20) + " L -20 " + (u.H + 20) + " Z", fill: theme.sand }),
      (function () {
        const ph = ((t * 0.07) % 1);
        return R("g", null, [0, 1, 2].map((i) => {
          const cx = -180 + (ph + i * 0.09) * (u.W + 380);
          const bob = Math.sin(t * 2.6 + i) * 5;
          return R("g", { key: i, transform: "translate(" + cx + "," + (u.H - 430 + bob) + ") scale(" + (0.9 - i * 0.08) + ")" },
            R("path", { d: "M -56 0 q 8 -40 26 -46 q 12 -32 26 0 q 20 8 26 46 z", fill: rgba(theme.night, 0.92) }),
            R("path", { d: "M 46 -36 q 22 -12 24 -46 q 2 -18 -12 -14 q -14 4 -14 22", fill: "none", stroke: rgba(theme.night, 0.92), strokeWidth: 11, strokeLinecap: "round" }),
            [-40, -14, 16, 40].map((ox, k) => R("line", { key: k, x1: ox, y1: -2, x2: ox + Math.sin(t * 4 + k) * 7, y2: 46, stroke: rgba(theme.night, 0.92), strokeWidth: 8, strokeLinecap: "round" })));
        }));
      })(),
      (function () {
        const fl = 1 + Math.sin(t * 8) * 0.2;
        return R("g", { transform: "translate(210," + (u.H - 250) + ")" },
          R("polygon", { points: "0,-150 96,0 -96,0", fill: rgba(theme.night, 0.9) }),
          R("polygon", { points: "0,-118 40,0 -40,0", fill: rgba(theme.ember2, 0.35) }),
          R("ellipse", { cx: 150, cy: -6, rx: 26 * fl, ry: 34 * fl, fill: rgba(theme.ember2, 0.85) }),
          R("ellipse", { cx: 150, cy: 2, rx: 12 * fl, ry: 18 * fl, fill: rgba(theme.sand, 0.95) }),
          Array.from({ length: 4 }).map((_, i) => {
            const q = (t * 0.7 + i * 0.25) % 1;
            return R("circle", { key: i, cx: 150 + Math.sin(q * 7 + i) * 22, cy: -40 - q * 180, r: 3.4, fill: rgba(theme.ember2, 0.8 * (1 - q)) });
          }));
      })()),
  });
})();
