/* mega-pack-5.js — Scale Line, Molten Studio, Nose & Note, Ink & Panel, String & Sky,
   Twenty Moves, Ghost Route, Semolina Club, Tide Pool Lab, Cold Plunge Club */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ---- Scale Line: oval track loop, tunnel, cone trees, signal arm ---- */
  FilmKit.make({
    global: "ScaleLine", variants: { Toggle: "switch", Scroll: "board", Cursor: "slider", Morph: "roll" },
    brand: "Scale Line", desk: "#242e22", ambient: 1.6,
    FH: '"Staatliches", sans-serif', FB: '"Onest", sans-serif',
    palette: (t) => ({ baize: t.baize || "#31402e", maroon: t.maroon || "#7a2e35", cream: "#f0e9da", signal: "#c23b2e", slate: "#3a4148" }),
    tweaks: [{ k: "baize", label: "Layout", options: ["#31402e", "#3a3a2e", "#2e3a40"] }, { k: "maroon", label: "Livery", options: ["#7a2e35", "#2e527a", "#3e5c3a"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("rect", { x: 4, y: 7, width: 12, height: 9, rx: 2 }), R2("path", { d: "M16 10h3l1 3v3h-4M6 20h12M4 16h16" }), R2("circle", { cx: 8, cy: 18.5, r: 1.4 }), R2("circle", { cx: 14, cy: 18.5, r: 1.4 })),
    cams: ["zoomIn", "pushL", "hopU", "pushR", "zoomOut", "drop"], camMul: 5, camOff: 1,
    mag: { rot: 0.6, inn: 0.24, driftX: 6 }, titlePreset: "stamp", itemPreset: "rise", titleSpace: "0.03em",
    look: {
      hook: { bg: "baize", fg: "cream", hi: "signal", world: true, top: 320, size: 122, upper: true, kicker: { v: "tag", bg: "signal", c: "cream" } },
      statement: { bg: "slate", fg: "cream", hi: "signal", world: false, top: 630, size: 148, upper: true },
      feature: { bg: "baize", fg: "cream", hi: "signal", world: true, top: 250, size: 96, upper: true, card: { v: "frame", bg: "slate", r: 12, line: "cream" }, chips: { v: "square", colors: ["signal", "maroon", "slate"], text: "cream" } },
      montage: { bg: "slate", fg: "cream", hi: "signal", world: false, top: 258, size: 92, upper: true, tile: { bg: "baize", line: "cream", label: "cream", r: 8 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "baize", fg: "cream", hi: "signal", world: true, cols: ["signal", "cream", "maroon"], num: 150, upper: true, rule: true },
      cta: { bg: "maroon", fg: "cream", hi: "signal", world: false, top: 500, size: 118, upper: true, btn: { v: "block", bg: "cream", c: "slate" }, logoShape: "rounded" },
      app: { bg: "baize", fg: "cream", hi: "signal", cardBg: "#3e5039", line: "cream", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("rect", { x: 90, y: u.H - 620, width: u.W - 180, height: 420, rx: 200, fill: "none", stroke: rgba(theme.slate, 0.85), strokeWidth: 22 }),
      R("rect", { x: 90, y: u.H - 620, width: u.W - 180, height: 420, rx: 200, fill: "none", stroke: rgba(theme.cream, 0.4), strokeWidth: 3, strokeDasharray: "14 12" }),
      (function () {
        const per = 2 * ((u.W - 180 - 400) + (420 - 400)) + 2 * Math.PI * 200;
        const ph = (t * 0.14) % 1;
        const cars = [0, 0.045, 0.09].map((off, ci) => {
          let d = ((ph - off) % 1 + 1) % 1 * per;
          const wS = u.W - 180 - 400, hS = 420 - 400;
          const arc = Math.PI * 100;
          let x, y, rot;
          const cx0 = 290, cy0 = u.H - 620 + 200;
          if (d < wS) { x = cx0 + d; y = u.H - 620; rot = 0; }
          else if ((d -= wS) < arc * 2) { const a = -Math.PI / 2 + d / 200; x = cx0 + wS + Math.cos(a) * 200; y = cy0 + Math.sin(a) * 200; rot = (a + Math.PI / 2) * 180 / Math.PI; }
          else if ((d -= arc * 2) < wS) { x = cx0 + wS - d; y = u.H - 200; rot = 180; }
          else { d -= wS; const a = Math.PI / 2 + d / 200; x = cx0 + Math.cos(a) * 200; y = cy0 + Math.sin(a) * 200; rot = (a + Math.PI / 2) * 180 / Math.PI; }
          return R("g", { key: ci, transform: "translate(" + x + "," + y + ") rotate(" + rot + ")" },
            R("rect", { x: -34, y: -16, width: 68, height: 32, rx: 7, fill: ci === 0 ? theme.signal : theme.maroon }),
            ci === 0 && R("rect", { x: 16, y: -22, width: 16, height: 12, rx: 3, fill: theme.slate }),
            R("circle", { cx: -18, cy: 17, r: 6, fill: theme.slate }), R("circle", { cx: 18, cy: 17, r: 6, fill: theme.slate }));
        });
        return R("g", null, cars);
      })(),
      R("rect", { x: u.W - 330, y: u.H - 650, width: 160, height: 90, rx: 14, fill: theme.slate }),
      R("path", { d: "M " + (u.W - 330) + " " + (u.H - 605) + " a 80 45 0 0 1 160 0", fill: theme.slate }),
      [[160, 0], [230, 1], [u.W - 140, 2]].map(([x, i]) => R("g", { key: "t" + i, transform: "translate(" + x + "," + (u.H - 660 - (i % 2) * 60) + ")" },
        R("polygon", { points: "0,-64 26,0 -26,0", fill: rgba("#4a6e42", 0.9) }),
        R("rect", { x: -5, y: 0, width: 10, height: 16, fill: theme.maroon }))),
      R("g", { transform: "translate(140,300)" },
        R("line", { x1: 0, y1: 0, x2: 0, y2: 140, stroke: theme.cream, strokeWidth: 7 }),
        R("rect", { x: 0, y: 6, width: 64, height: 14, rx: 6, fill: theme.signal, transform: "rotate(" + (Math.sin(t * 1.2) > 0 ? -30 : 0) + " 0 13)" }),
        R("circle", { cy: 160, r: 9, fill: Math.sin(t * 1.2) > 0 ? "#3fbf5a" : theme.signal }))),
  });

  /* ---- Molten Studio: glowing gather, heat waves, orb shelf ---- */
  FilmKit.make({
    global: "MoltenStudio", variants: { Ring: "gauge", Typing: "hand", Notify: "drop", Morph: "fade" },
    brand: "Molten Studio", desk: "#120e0a", ambient: 1.7,
    FH: '"Comfortaa", sans-serif', FB: '"Livvic", sans-serif',
    palette: (t) => ({ shop: t.shop || "#1c1512", molten: t.molten || "#ff9633", aqua: "#6fd8d0", sand: "#e8dcc4", ink: "#14100c" }),
    tweaks: [{ k: "shop", label: "Hot shop", options: ["#1c1512", "#181216", "#141410"] }, { k: "molten", label: "Gather", options: ["#ff9633", "#ff6b4a", "#ffc14b"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" })),
    cams: ["zoomIn", "pushU", "drop", "pushL", "zoomOut", "pushR"], camMul: 5, camOff: 2,
    mag: { rot: 0.5, driftY: 8, inn: 0.26 }, titlePreset: "drowse", itemPreset: "pop", titleLine: 1.1,
    look: {
      hook: { bg: "shop", fg: "sand", hi: "molten", world: true, top: 330, size: 116, kicker: { v: "outline", c: "aqua" } },
      statement: { bg: "ink", fg: "sand", hi: "molten", world: false, top: 630, size: 142 },
      feature: { bg: "shop", fg: "sand", hi: "molten", world: true, top: 250, size: 94, card: { v: "glow", bg: "ink", glow: "molten", r: 22, line: "sand" }, chips: { v: "pill", colors: ["molten", "aqua"], text: "ink" } },
      montage: { bg: "ink", fg: "sand", hi: "aqua", world: false, top: 258, size: 90, tile: { bg: "shop", line: "sand", label: "aqua", r: 18, glow: "molten" }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "shop", fg: "sand", hi: "molten", world: true, cols: ["molten", "aqua", "sand"], num: 148, glowNums: true },
      cta: { bg: "ink", fg: "sand", hi: "molten", world: true, top: 500, size: 112, btn: { v: "glow", bg: "molten", c: "ink" }, logoShape: "circle" },
      app: { bg: "shop", fg: "sand", hi: "molten", cardBg: "#2a1f18", line: "sand", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("rect", { x: u.W - 300, y: u.H - 480, width: 240, height: 300, rx: 20, fill: rgba(theme.ink, 0.9), stroke: rgba(theme.sand, 0.25), strokeWidth: 3 }),
      R("ellipse", { cx: u.W - 180, cy: u.H - 330, rx: 74, ry: 90, fill: theme.molten, opacity: 0.85 + Math.sin(t * 3) * 0.12 }),
      R("ellipse", { cx: u.W - 180, cy: u.H - 330, rx: 44, ry: 56, fill: "#ffd9a0", opacity: 0.9 }),
      (function () {
        const puls = 1 + Math.sin(t * 2.2) * 0.12;
        return R("g", { transform: "translate(240," + (u.H - 520) + ") rotate(18)" },
          R("line", { x1: 0, y1: 0, x2: 360, y2: 0, stroke: rgba(theme.sand, 0.55), strokeWidth: 9, strokeLinecap: "round" }),
          R("circle", { cx: -20, r: 34 * puls, fill: theme.molten }),
          R("circle", { cx: -26, cy: -8, r: 12 * puls, fill: "#ffe0b0", opacity: 0.85 }));
      })(),
      [0, 1, 2].map((i) => R("path", { key: i, d: "M " + (u.W - 260 + i * 60) + " " + (u.H - 500) + " q 10 -30 -4 -60 q -12 -28 2 -56", fill: "none", stroke: rgba(theme.molten, 0.3 - i * 0.07), strokeWidth: 10, strokeLinecap: "round", transform: "translate(0," + (-((t * 70 + i * 45) % 140)) + ")" })),
      R("line", { x1: 80, y1: 320, x2: 460, y2: 320, stroke: rgba(theme.sand, 0.35), strokeWidth: 6 }),
      [0, 1, 2].map((i) => {
        const sh = ((t * 120) % 700) - 100;
        return R("g", { key: "o" + i, transform: "translate(" + (150 + i * 120) + ",290)" },
          R("circle", { r: 26 + (i % 2) * 8, fill: "none", stroke: [theme.aqua, theme.molten, theme.sand][i], strokeWidth: 4, opacity: 0.8 }),
          R("circle", { r: 26 + (i % 2) * 8, fill: rgba([theme.aqua, theme.molten, theme.sand][i], 0.14) }),
          R("circle", { cx: -8, cy: -10, r: 5, fill: rgba("#ffffff", Math.abs(sh - (150 + i * 120)) < 60 ? 0.8 : 0.25) }));
      })),
  });

  /* ---- Nose & Note: flacons, scent curls, blotter fan ---- */
  FilmKit.make({
    global: "NoseNote", variants: { Swipe: "flip", Ring: "ring", Typing: "caret", Notify: "side" },
    brand: "Nose & Note", desk: "#2e1a26", ambient: 1.4,
    FH: '"Gilda Display", serif', FB: '"Albert Sans", sans-serif',
    palette: (t) => ({ ivory: t.ivory || "#f6f0e8", plum: t.plum || "#4a2438", bronze: "#a86e3c", blush: "#e8c4b8", ink: "#2e1a26" }),
    tweaks: [{ k: "ivory", label: "Atelier", options: ["#f6f0e8", "#f2e8e4", "#efe9dc"] }, { k: "plum", label: "Accent", options: ["#4a2438", "#2e2444", "#442e24"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("rect", { x: 7, y: 9, width: 10, height: 12, rx: 3 }), R2("path", { d: "M10 9V6h4v3M12 3v3" })),
    cams: ["zoomOut", "pushL", "drop", "pushU", "zoomIn", "pushR"], camMul: 3, camOff: 1,
    mag: { rot: 0.3, driftX: 4, inn: 0.3, driftZ: 0.03 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.08,
    look: {
      hook: { bg: "ivory", fg: "ink", hi: "plum", world: true, top: 330, size: 116, kicker: { v: "bare", c: "bronze" } },
      statement: { bg: "plum", fg: "ivory", hi: "blush", world: false, top: 630, size: 140 },
      feature: { bg: "ivory", fg: "ink", hi: "plum", world: true, top: 250, size: 92, card: { v: "frame", bg: "plum", r: 18, line: "ivory" }, chips: { v: "outline", colors: ["plum", "bronze"], text: "ivory" } },
      montage: { bg: "plum", fg: "ivory", hi: "blush", world: false, top: 258, size: 90, tile: { bg: "ivory", line: "ink", label: "ivory", r: 14 }, tilts: [-1.5, 1, 1.5, -1] },
      stats: { bg: "ivory", fg: "ink", hi: "plum", world: true, cols: ["plum", "bronze", "ink"], num: 146 },
      cta: { bg: "ink", fg: "ivory", hi: "blush", world: false, top: 500, size: 112, btn: { v: "pill", bg: "blush", c: "ink" }, logoShape: "circle" },
      app: { bg: "ivory", fg: "ink", hi: "plum", cardBg: "#fdfaf4", line: "ink", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [[u.W - 260, 0, 64, 90], [u.W - 150, 1, 46, 64], [u.W - 350, 2, 40, 56]].map(([x, i, w, h]) => R("g", { key: i, transform: "translate(" + x + "," + (u.H - 260) + ")" },
        R("rect", { x: -w / 2, y: -h, width: w, height: h, rx: 12, fill: rgba([theme.plum, theme.bronze, theme.blush][i], 0.8) }),
        R("rect", { x: -10, y: -h - 22, width: 20, height: 24, rx: 5, fill: theme.bronze }),
        R("circle", { cx: -w / 5, cy: -h * 0.6, r: 6, fill: rgba("#ffffff", 0.5) }))),
      [0, 1, 2].map((i) => {
        const ph = (t * 0.16 + i * 0.33) % 1;
        return R("path", { key: "s" + i, d: "M " + (u.W - 260 + i * 60 - 60) + " " + (u.H - 420 - ph * 500) + " q " + (20 + i * 8) + " -40 0 -80 q -" + (20 + i * 8) + " -40 0 -80", fill: "none", stroke: rgba(theme.plum, 0.25 * (1 - ph)), strokeWidth: 5, strokeLinecap: "round" });
      }),
      R("g", { transform: "translate(190," + (u.H - 300) + ")" },
        [-24, -12, 0, 12, 24].map((a, i) => R("rect", { key: i, x: -9, y: -170, width: 18, height: 170, rx: 6, fill: i === 2 ? theme.blush : rgba(theme.ink, 0.12), stroke: rgba(theme.ink, 0.3), strokeWidth: 1.5, transform: "rotate(" + (a + Math.sin(t * 0.8) * 3) + " 0 0)" }))),
      [0, 1, 2].map((i) => R("circle", { key: "d" + i, cx: 160 + i * 70, cy: 260 + Math.sin(t * 1.2 + i * 1.6) * 14, r: 7 - i, fill: rgba(theme.bronze, 0.5) })),
      R("circle", { cx: 200, cy: 240, r: 60, fill: "none", stroke: rgba(theme.bronze, 0.35), strokeWidth: 2.5, strokeDasharray: "377", strokeDashoffset: String(377 * (1 - u.seg(p, 0.1, 0.8))) })),
  });

  /* ---- Ink & Panel: panel grid drawing, halftone, speed lines, SFX burst ---- */
  FilmKit.make({
    global: "InkPanel", variants: { Typing: "typewriter", Morph: "flap", DragDrop: "assemble", Scroll: "stack" },
    brand: "Ink & Panel", desk: "#d8d4c8", ambient: 1.9,
    FH: '"Bangers", cursive', FB: '"Lexend", sans-serif',
    palette: (t) => ({ bristol: t.bristol || "#f6f4ec", inkk: "#1a1a1e", action: t.action || "#e8402e", cyan: "#3cb8e8", yellow: "#f2c14b" }),
    tweaks: [{ k: "bristol", label: "Page", options: ["#f6f4ec", "#f2ecdc", "#eef0f2"] }, { k: "action", label: "Action", options: ["#e8402e", "#7a3df0", "#f25d9c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinejoin: "round" }, R2("path", { d: "M4 4h16v16H4zM4 12h16M12 4v8" })),
    cams: ["pushR", "spin", "pushL", "zoomIn", "hopU", "drop"], camMul: 7, camOff: 0,
    mag: { skew: 4, rot: 1.3, inn: 0.17 }, titlePreset: "slam", itemPreset: "pop", titleSpace: "0.03em", titleLine: 1.02,
    look: {
      hook: { bg: "bristol", fg: "inkk", hi: "action", world: true, top: 310, size: 132, upper: true, kicker: { v: "tag", bg: "yellow", c: "inkk" } },
      statement: { bg: "action", fg: "bristol", hi: "yellow", world: false, top: 620, size: 156, upper: true },
      feature: { bg: "bristol", fg: "inkk", hi: "action", world: true, top: 248, size: 102, upper: true, card: { v: "frame", bg: "inkk", r: 6, line: "bristol" }, chips: { v: "square", colors: ["action", "cyan", "yellow"], text: "inkk" } },
      montage: { bg: "inkk", fg: "bristol", hi: "yellow", world: false, top: 256, size: 98, upper: true, tile: { bg: "bristol", line: "inkk", label: "bristol", r: 4 }, tilts: [-3, 2.5, 2, -2.5] },
      stats: { bg: "bristol", fg: "inkk", hi: "action", world: true, cols: ["action", "cyan", "inkk"], num: 154, upper: true, rule: true },
      cta: { bg: "yellow", fg: "inkk", hi: "action", world: false, top: 490, size: 126, upper: true, btn: { v: "block", bg: "inkk", c: "bristol" }, logoShape: "rounded" },
      app: { bg: "bristol", fg: "inkk", hi: "action", cardBg: "#ffffff", line: "inkk", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      (function () {
        const dr = u.seg(p, 0.05, 0.5);
        const L = 2200;
        return R("g", null,
          R("rect", { x: u.W - 420, y: 200, width: 340, height: 460, fill: "none", stroke: theme.inkk, strokeWidth: 5, strokeDasharray: String(L), strokeDashoffset: String(L * (1 - dr)) }),
          R("line", { x1: u.W - 420, y1: 400, x2: u.W - 80, y2: 400, stroke: theme.inkk, strokeWidth: 5, opacity: dr > 0.6 ? 1 : 0 }),
          R("line", { x1: u.W - 250, y1: 400, x2: u.W - 250, y2: 660, stroke: theme.inkk, strokeWidth: 5, opacity: dr > 0.8 ? 1 : 0 }));
      })(),
      Array.from({ length: 30 }).map((_, i) => R("circle", { key: i, cx: u.W - 400 + (i % 6) * 24, cy: 224 + Math.floor(i / 6) * 24, r: 4.5 - (i % 6) * 0.5, fill: rgba(theme.cyan, 0.6) })),
      (function () {
        const burst = u.ease.outBack(u.clamp01(u.seg(p, 0.4, 0.62)));
        const px = 230, py = u.H - 480;
        let pts = "";
        for (let k = 0; k < 20; k++) { const a = k * Math.PI / 10; const r = k % 2 ? 70 : 130; pts += (px + Math.cos(a) * r * burst) + "," + (py + Math.sin(a) * r * burst) + " "; }
        return R("g", null,
          R("polygon", { points: pts, fill: theme.yellow, stroke: theme.inkk, strokeWidth: 5, opacity: burst }),
          R("text", { x: px, y: py + 16, textAnchor: "middle", fontFamily: '"Bangers", cursive', fontSize: 54 * burst, fill: theme.action, stroke: theme.inkk, strokeWidth: 1.5, transform: "rotate(-8 " + px + " " + py + ")" }, "POW!"));
      })(),
      [0, 1, 2, 3, 4].map((i) => R("line", { key: "sl" + i, x1: 80, y1: 240 + i * 30 - 60, x2: 80 + 200 + ((t * 500 + i * 80) % 180), y2: 240 + i * 30 - 60, stroke: rgba(theme.inkk, 0.6 - i * 0.1), strokeWidth: 6 - i, strokeLinecap: "round", transform: "rotate(-16 80 240)" })),
      R("circle", { cx: 160, cy: u.H - 220, r: 30, fill: "none", stroke: theme.action, strokeWidth: 6, strokeDasharray: "8 10", transform: "rotate(" + t * 80 + " 160 " + (u.H - 220) + ")" })),
  });

  /* ---- String & Sky: kites with wiggling tails, clouds, grass ---- */
  FilmKit.make({
    global: "StringSky", variants: { Toggle: "check", Ring: "bar", Notify: "pop", Morph: "roll" },
    brand: "String & Sky", desk: "#8ec4dc", ambient: 1.8,
    FH: '"Grandstander", cursive', FB: '"Sofia Sans", sans-serif',
    palette: (t) => ({ sky: t.sky || "#a8d8ea", kite: t.kite || "#e84855", sun: "#f2b13c", grass: "#5a9e54", navy: "#23364a" }),
    tweaks: [{ k: "sky", label: "Sky", options: ["#a8d8ea", "#b8d8c8", "#d8c8e8"] }, { k: "kite", label: "Kite", options: ["#e84855", "#7a3df0", "#f28c28"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinejoin: "round", strokeLinecap: "round" }, R2("path", { d: "M12 2l7 7-7 7-7-7zM12 16c0 3-2 4-4 5" })),
    cams: ["hopU", "pushR", "zoomOut", "pushL", "zoomIn", "drop"], camMul: 3, camOff: 2,
    mag: { rot: 1.0, driftX: 10, driftY: 9 }, titlePreset: "bounce", itemPreset: "pop", titleLine: 1.05,
    look: {
      hook: { bg: "sky", fg: "navy", hi: "kite", world: true, top: 330, size: 122, kicker: { v: "pill", bg: "kite", c: "sky" } },
      statement: { bg: "navy", fg: "sky", hi: "sun", world: false, top: 630, size: 146 },
      feature: { bg: "sky", fg: "navy", hi: "kite", world: true, top: 250, size: 96, card: { v: "tilt", bg: "navy", r: 20, line: "sky" }, chips: { v: "pill", colors: ["kite", "grass", "sun"], text: "navy" } },
      montage: { bg: "navy", fg: "sky", hi: "sun", world: false, top: 258, size: 92, tile: { bg: "sky", line: "navy", label: "navy", r: 16 }, tilts: [-3, 2.5, 2, -2.5] },
      stats: { bg: "sky", fg: "navy", hi: "kite", world: true, cols: ["kite", "grass", "navy"], num: 150 },
      cta: { bg: "sun", fg: "navy", hi: "kite", world: false, top: 500, size: 118, btn: { v: "pill", bg: "navy", c: "sky" }, logoShape: "circle" },
      app: { bg: "sky", fg: "navy", hi: "kite", cardBg: "#eef6fa", line: "navy", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1].map((i) => {
        const kx = 260 + i * 420 + Math.sin(t * (0.7 + i * 0.2)) * 60;
        const ky = 300 + i * 140 + Math.cos(t * (0.9 - i * 0.2)) * 40;
        const c = i ? theme.sun : theme.kite;
        return R("g", { key: i },
          R("line", { x1: kx, y1: ky + 60, x2: 120 + i * 500, y2: u.H - 120, stroke: rgba(theme.navy, 0.35), strokeWidth: 3 }),
          R("g", { transform: "translate(" + kx + "," + ky + ") rotate(" + (Math.sin(t * 1.1 + i) * 12 + 8) + ")" },
            R("polygon", { points: "0,-64 44,0 0,64 -44,0", fill: c, stroke: theme.navy, strokeWidth: 4 }),
            R("line", { x1: 0, y1: -64, x2: 0, y2: 64, stroke: rgba(theme.navy, 0.4), strokeWidth: 3 }),
            R("line", { x1: -44, y1: 0, x2: 44, y2: 0, stroke: rgba(theme.navy, 0.4), strokeWidth: 3 }),
            R("path", { d: "M 0 64 q " + (14 + Math.sin(t * 5 + i) * 12) + " 36 0 62 q -" + (14 + Math.cos(t * 4.6 + i) * 12) + " 30 0 58", fill: "none", stroke: c, strokeWidth: 4, strokeLinecap: "round" }),
            [80, 128].map((yy, k) => R("polygon", { key: k, points: "0," + yy + " 12," + (yy + 10) + " 0," + (yy + 20) + " -12," + (yy + 10), fill: k ? theme.grass : theme.sun, transform: "rotate(" + Math.sin(t * 5 + k) * 20 + " 0 " + (yy + 10) + ")" }))));
      }),
      [0, 1, 2].map((i) => {
        const cx = ((t * (18 + i * 8) + i * 400) % (u.W + 360)) - 180;
        return R("g", { key: "c" + i, transform: "translate(" + cx + "," + (170 + i * 120) + ")", opacity: 0.85 - i * 0.2 },
          R("ellipse", { rx: 100, ry: 30, fill: "#ffffff" }), R("ellipse", { cx: 60, cy: -18, rx: 60, ry: 24, fill: "#ffffff" }));
      }),
      R("circle", { cx: u.W - 150, cy: 170, r: 64, fill: theme.sun, opacity: 0.9 }),
      R("path", { d: "M -20 " + (u.H - 110) + " q " + (u.W / 4) + " -40 " + (u.W / 2) + " 0 t " + (u.W / 2 + 40) + " 0 L " + (u.W + 20) + " " + (u.H + 20) + " L -20 " + (u.H + 20) + " Z", fill: theme.grass }),
      Array.from({ length: 8 }).map((_, i) => R("path", { key: "g" + i, d: "M " + (60 + i * 140) + " " + (u.H - 120) + " q 4 -22 12 -30", fill: "none", stroke: rgba(theme.navy, 0.3), strokeWidth: 4, strokeLinecap: "round" }))),
  });

  /* ---- Twenty Moves: cube face tiles cycling, timer, scramble arrows ---- */
  FilmKit.make({
    global: "TwentyMoves", variants: { Cursor: "keys", Ring: "ring", Scroll: "ticker", Toggle: "dial" },
    brand: "Twenty Moves", desk: "#17181c", ambient: 2.0,
    FH: '"Russo One", sans-serif', FB: '"Geologica", sans-serif',
    palette: (t) => ({ mat: t.mat || "#1e2024", cube: t.cube || "#ffcb2e", blue: "#3d7bff", white: "#f4f4f6", ink: "#141518" }),
    tweaks: [{ k: "mat", label: "Mat", options: ["#1e2024", "#1c2028", "#24201c"] }, { k: "cube", label: "Accent", options: ["#ffcb2e", "#3fbf5a", "#ff8a3d"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinejoin: "round" }, R2("path", { d: "M12 2l9 5v10l-9 5-9-5V7zM12 2v10M3 7l9 5 9-5" })),
    cams: ["pushL", "zoomIn", "spin", "pushR", "pushU", "drop"], camMul: 7, camOff: 1,
    mag: { skew: 4, rot: 1.2, inn: 0.16 }, titlePreset: "slam", itemPreset: "slam", titleSpace: "0.02em",
    look: {
      hook: { bg: "mat", fg: "white", hi: "cube", world: true, top: 310, size: 118, upper: true, kicker: { v: "tag", bg: "cube", c: "ink" } },
      statement: { bg: "cube", fg: "ink", hi: "white", world: false, top: 630, size: 146, upper: true },
      feature: { bg: "mat", fg: "white", hi: "cube", world: true, top: 248, size: 94, upper: true, card: { v: "frame", bg: "ink", r: 12, line: "white" }, chips: { v: "square", colors: ["cube", "blue", "white"], text: "ink" } },
      montage: { bg: "ink", fg: "white", hi: "cube", world: false, top: 258, size: 92, upper: true, tile: { bg: "mat", line: "white", label: "cube", r: 8 }, tilts: [-2, 2, 1.5, -2] },
      stats: { bg: "mat", fg: "white", hi: "cube", world: true, cols: ["cube", "blue", "white"], num: 150, upper: true, rule: true },
      cta: { bg: "blue", fg: "white", hi: "cube", world: false, top: 500, size: 114, upper: true, btn: { v: "block", bg: "ink", c: "white" }, logoShape: "rounded" },
      app: { bg: "mat", fg: "white", hi: "cube", cardBg: "#282b31", line: "white", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      (function () {
        const cols = [theme.cube, theme.blue, "#3fbf5a", "#e8402e", theme.white, "#ff8a3d"];
        const s = 52, ox = u.W - 380, oy = u.H - 520;
        const cells = [];
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          const idx = Math.floor(t * 1.4 + r * 3 + c) % 6;
          cells.push(R("polygon", { key: "t" + r + c, points: (ox + (c - r) * s * 0.9) + "," + (oy + (c + r) * s * 0.5) + " " + (ox + (c - r + 1) * s * 0.9) + "," + (oy + (c + r + 1) * s * 0.5) + " " + (ox + (c - r) * s * 0.9) + "," + (oy + (c + r + 2) * s * 0.5) + " " + (ox + (c - r - 1) * s * 0.9) + "," + (oy + (c + r + 1) * s * 0.5), fill: cols[idx], stroke: theme.ink, strokeWidth: 4 }));
        }
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          const idx = Math.floor(t * 1.1 + r + c * 2) % 6;
          cells.push(R("rect", { key: "l" + r + c, x: ox - 3 * s * 0.9 + c * s * 0.9 - 8, y: oy + s + r * s * 0.9 + c * s * 0.5 - 40, width: s * 0.8, height: s * 0.8, fill: cols[idx], stroke: theme.ink, strokeWidth: 4, transform: "skewY(28)" }));
        }
        return R("g", null, cells);
      })(),
      R("text", { x: 90, y: 300, fontFamily: '"Russo One", sans-serif', fontSize: 88, fill: rgba(theme.white, 0.16) }, (6 + Math.floor(Math.abs(Math.sin(t * 0.7)) * 3)) + "." + String(Math.floor((t * 100) % 100)).padStart(2, "0")),
      ["R", "U'", "F2", "D", "L'"].map((mv, i) => R("text", { key: i, x: 90 + i * 110, y: u.H - 200, fontFamily: '"Russo One", sans-serif', fontSize: 40, fill: Math.floor(t * 2.5) % 5 === i ? theme.cube : rgba(theme.white, 0.3) }, mv)),
      R("line", { x1: 80, y1: u.H - 170, x2: 80 + 520 * (0.3 + Math.abs(Math.sin(t * 0.5)) * 0.7), y2: u.H - 170, stroke: theme.blue, strokeWidth: 6, strokeLinecap: "round" })),
  });

  /* ---- Ghost Route: wisps, lantern swing, gravestones, fog ---- */
  FilmKit.make({
    global: "GhostRoute", variants: { Scroll: "feed", Ring: "gauge", Swipe: "swipe", Typing: "caret" },
    brand: "Ghost Route", desk: "#10141a", ambient: 1.5,
    FH: '"Grenze Gotisch", serif', FB: '"Spectral", serif',
    palette: (t) => ({ fog: t.fog || "#1a2026", spectral: t.spectral || "#9fe8c4", lantern: "#e8a23c", bone: "#ece8dc", ink: "#12161a" }),
    tweaks: [{ k: "fog", label: "Night", options: ["#1a2026", "#1c1a26", "#141e1c"] }, { k: "spectral", label: "Spectre", options: ["#9fe8c4", "#9fc4e8", "#c4a0e8"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M6 21V10a6 6 0 0 1 12 0v11l-3-2-3 2-3-2zM10 10h.01M14 10h.01" })),
    cams: ["zoomOut", "drop", "pushL", "zoomIn", "pushU", "pushR"], camMul: 5, camOff: 3,
    mag: { rot: 0.5, driftY: 10, inn: 0.28, driftZ: 0.04 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.06,
    look: {
      hook: { bg: "fog", fg: "bone", hi: "spectral", world: true, top: 320, size: 124, kicker: { v: "outline", c: "lantern" } },
      statement: { bg: "ink", fg: "bone", hi: "spectral", world: true, top: 630, size: 148 },
      feature: { bg: "fog", fg: "bone", hi: "lantern", world: true, top: 250, size: 98, card: { v: "glow", bg: "ink", glow: "spectral", r: 16, line: "bone" }, chips: { v: "outline", colors: ["spectral", "lantern"], text: "ink" } },
      montage: { bg: "ink", fg: "bone", hi: "spectral", world: true, top: 258, size: 94, tile: { bg: "#20262e", line: "bone", label: "spectral", r: 12, glow: "spectral" }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "fog", fg: "bone", hi: "spectral", world: true, cols: ["spectral", "lantern", "bone"], num: 148, glowNums: true },
      cta: { bg: "ink", fg: "bone", hi: "lantern", world: true, top: 500, size: 118, btn: { v: "glow", bg: "spectral", c: "ink" }, logoShape: "circle" },
      app: { bg: "fog", fg: "bone", hi: "spectral", cardBg: "#232b33", line: "bone", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1].map((i) => {
        const ph = (t * 0.12 + i * 0.5) % 1;
        const gx = 160 + i * (u.W - 340) + Math.sin(t * 0.8 + i * 2) * 40;
        const gy = u.H - 400 - ph * 500;
        return R("g", { key: i, transform: "translate(" + gx + "," + gy + ")", opacity: 0.5 * (1 - ph) + 0.08 },
          R("path", { d: "M -34 20 q -6 -54 34 -54 q 40 0 34 54 q -10 -10 -17 0 q -8 12 -17 0 q -9 -12 -17 0 z", fill: rgba(theme.spectral, 0.5) }),
          R("circle", { cx: -10, cy: -12, r: 4, fill: theme.ink }), R("circle", { cx: 10, cy: -12, r: 4, fill: theme.ink }));
      }),
      R("g", { transform: "translate(" + (u.W - 170) + ",300) rotate(" + Math.sin(t * 1.3) * 10 + ")" },
        R("line", { x1: 0, y1: -80, x2: 0, y2: 0, stroke: rgba(theme.bone, 0.4), strokeWidth: 4 }),
        R("rect", { x: -22, y: 0, width: 44, height: 56, rx: 8, fill: "none", stroke: theme.bone, strokeWidth: 4 }),
        R("circle", { cy: 28, r: 10, fill: theme.lantern, opacity: 0.7 + Math.sin(t * 6) * 0.25 })),
      [[140, 60], [260, 40], [u.W - 320, 52]].map(([x, h], i) => R("g", { key: "g" + i },
        R("rect", { x: x - 26, y: u.H - 200 - h, width: 52, height: h + 10, rx: 14, fill: rgba(theme.ink, 0.95), stroke: rgba(theme.bone, 0.2), strokeWidth: 2 }),
        R("line", { x1: x - 12, y1: u.H - 180 - h + 20, x2: x + 12, y2: u.H - 180 - h + 20, stroke: rgba(theme.bone, 0.25), strokeWidth: 3 }))),
      R("rect", { x: -40, y: u.H - 230 + Math.sin(t * 0.4) * 14, width: u.W + 80, height: 130, fill: rgba(theme.bone, 0.07) }),
      R("rect", { x: -40, y: u.H - 160, width: u.W + 80, height: 80, fill: rgba(theme.bone, 0.1) }),
      Array.from({ length: 8 }).map((_, i) => R("circle", { key: "s" + i, cx: (i * 143 + 60) % u.W, cy: 120 + (i * 67) % 240, r: 1.6, fill: rgba(theme.bone, 0.3 + 0.4 * Math.abs(Math.sin(t * 1.6 + i * 2))) }))),
  });

  /* ---- Semolina Club: rolling pin, flour puffs, pasta ribbons, ravioli ---- */
  FilmKit.make({
    global: "SemolinaClub", variants: { DragDrop: "drag", Toggle: "check", Scroll: "board", Morph: "roll" },
    brand: "Semolina Club", desk: "#2e2318", ambient: 1.7,
    FH: '"Lilita One", cursive', FB: '"Urbanist", sans-serif',
    palette: (t) => ({ flour: t.flour || "#f8f0dc", tomato: t.tomato || "#cf3b2e", basil: "#3e7a44", semolina: "#e8b93c", ink: "#2e1f18" }),
    tweaks: [{ k: "flour", label: "Counter", options: ["#f8f0dc", "#f2e8d0", "#efe9dc"] }, { k: "tomato", label: "Sugo", options: ["#cf3b2e", "#b3452e", "#d95d39"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M6 9h12v3a6 6 0 0 1-12 0zM9 9V5M12 9V4M15 9V5M7 21h10" })),
    cams: ["hopU", "pushL", "zoomIn", "pushR", "drop", "zoomOut"], camMul: 3, camOff: 1,
    mag: { rot: 1.1, driftX: 8 }, titlePreset: "bounce", itemPreset: "pop", titleLine: 1.06,
    look: {
      hook: { bg: "flour", fg: "ink", hi: "tomato", world: true, top: 330, size: 124, kicker: { v: "pill", bg: "tomato", c: "flour" } },
      statement: { bg: "tomato", fg: "flour", hi: "semolina", world: false, top: 630, size: 148 },
      feature: { bg: "flour", fg: "ink", hi: "tomato", world: true, top: 250, size: 98, card: { v: "tilt", bg: "ink", r: 20, line: "flour" }, chips: { v: "pill", colors: ["tomato", "basil", "semolina"], text: "flour" } },
      montage: { bg: "basil", fg: "flour", hi: "semolina", world: false, top: 258, size: 94, tile: { bg: "flour", line: "ink", label: "ink", r: 16 }, tilts: [-3, 2.5, 2, -2.5] },
      stats: { bg: "flour", fg: "ink", hi: "tomato", world: true, cols: ["tomato", "basil", "semolina"], num: 152 },
      cta: { bg: "ink", fg: "flour", hi: "semolina", world: false, top: 500, size: 120, btn: { v: "pill", bg: "tomato", c: "flour" }, logoShape: "circle" },
      app: { bg: "flour", fg: "ink", hi: "tomato", cardBg: "#ffffff", line: "ink", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      (function () {
        const rx = 180 + ((t * 90) % 300);
        return R("g", { transform: "translate(" + rx + "," + (u.H - 300) + ")" },
          R("rect", { x: -110, y: -26, width: 220, height: 52, rx: 26, fill: "#d9b98c" }),
          R("rect", { x: -160, y: -14, width: 50, height: 28, rx: 13, fill: "#b8965c" }),
          R("rect", { x: 110, y: -14, width: 50, height: 28, rx: 13, fill: "#b8965c" }),
          R("line", { x1: -80, y1: -8, x2: 80, y2: -8, stroke: rgba("#8a6a42", 0.4), strokeWidth: 3, transform: "rotate(" + t * 200 % 360 + " 0 0)" }));
      })(),
      [0, 1, 2].map((i) => {
        const ph = (t * 0.5 + i * 0.33) % 1;
        return R("circle", { key: i, cx: 200 + i * 90, cy: u.H - 360 - ph * 80, r: 12 + ph * 26, fill: rgba(theme.flour, 0.6 * (1 - ph)) });
      }),
      [0, 1, 2].map((i) => R("path", { key: "r" + i, d: "M " + (u.W - 320 + i * 60) + " 200 " + Array.from({ length: 5 }).map((_, s) => "q 20 " + (s % 2 ? 34 : -34) + " 40 0").join(" "), fill: "none", stroke: i === 1 ? theme.semolina : rgba(theme.semolina, 0.65), strokeWidth: 13, strokeLinecap: "round", transform: "rotate(90 " + (u.W - 320 + i * 60) + " 200) translate(" + Math.sin(t * 1.4 + i) * 16 + ",0)" })),
      [[150, 260], [240, 320], [130, 380]].map(([x, y], i) => {
        const e = u.ease.outBack(u.clamp01(u.seg(p, 0.1 + i * 0.12, 0.3 + i * 0.12)));
        return R("g", { key: "v" + i, transform: "translate(" + x + "," + y + ") scale(" + e + ") rotate(" + (i * 14 - 10) + ")" },
          R("rect", { x: -34, y: -34, width: 68, height: 68, rx: 8, fill: theme.semolina, stroke: theme.ink, strokeWidth: 3 }),
          R("path", { d: "M -34 -34 h68 M -34 34 h68", stroke: rgba(theme.ink, 0.3), strokeWidth: 4, strokeDasharray: "5 7" }),
          R("circle", { r: 15, fill: rgba(theme.tomato, 0.5) }));
      }),
      R("path", { d: "M " + (u.W - 150) + " " + (u.H - 240) + " q -12 -30 12 -44 q 26 -12 34 12 q 8 26 -18 34 q -20 6 -28 -2", fill: theme.basil, transform: "rotate(" + Math.sin(t) * 10 + " " + (u.W - 140) + " " + (u.H - 250) + ")" })),
  });

  /* ---- Tide Pool Lab: starfish, anemone, sideways crab, shimmer ---- */
  FilmKit.make({
    global: "TidePoolLab", variants: { Ring: "bar", Scroll: "feed", Toggle: "check", Typing: "hand" },
    brand: "Tide Pool Lab", desk: "#d8ccb0", ambient: 1.6,
    FH: '"Shrikhand", cursive', FB: '"Poppins", sans-serif',
    palette: (t) => ({ sand: t.sand || "#f0e6cc", rock: "#4a5258", anemone: t.anemone || "#f27d98", seafoam: "#8fd8c8", ink: "#2a3238" }),
    tweaks: [{ k: "sand", label: "Shore", options: ["#f0e6cc", "#e8e0d0", "#f0ddc0"] }, { k: "anemone", label: "Anemone", options: ["#f27d98", "#f28c28", "#8c6fd0"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" })),
    cams: ["zoomIn", "pushD", "hopU", "pushL", "zoomOut", "pushR"], camMul: 5, camOff: 0,
    mag: { rot: 0.8, driftY: 8 }, titlePreset: "rise", itemPreset: "pop", titleLine: 1.1,
    look: {
      hook: { bg: "sand", fg: "ink", hi: "anemone", world: true, top: 320, size: 108, kicker: { v: "pill", bg: "seafoam", c: "ink" } },
      statement: { bg: "rock", fg: "sand", hi: "seafoam", world: false, top: 630, size: 132 },
      feature: { bg: "sand", fg: "ink", hi: "anemone", world: true, top: 250, size: 88, card: { v: "frame", bg: "rock", r: 22, line: "sand" }, chips: { v: "pill", colors: ["anemone", "seafoam"], text: "ink" } },
      montage: { bg: "rock", fg: "sand", hi: "anemone", world: false, top: 258, size: 86, tile: { bg: "sand", line: "ink", label: "ink", r: 18 }, tilts: [-2.5, 2, 1.5, -2] },
      stats: { bg: "sand", fg: "ink", hi: "anemone", world: true, cols: ["anemone", "seafoam", "rock"], num: 144 },
      cta: { bg: "seafoam", fg: "ink", hi: "anemone", world: false, top: 500, size: 106, btn: { v: "pill", bg: "ink", c: "sand" }, logoShape: "circle" },
      app: { bg: "sand", fg: "ink", hi: "anemone", cardBg: "#faf4e4", line: "ink", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("ellipse", { cx: u.W / 2 + 60, cy: u.H - 330, rx: 360, ry: 110, fill: rgba(theme.seafoam, 0.5) }),
      R("ellipse", { cx: u.W / 2 + 60, cy: u.H - 330, rx: 360, ry: 110, fill: "none", stroke: theme.rock, strokeWidth: 14 }),
      [0, 1].map((i) => R("ellipse", { key: i, cx: u.W / 2 - 60 + i * 220, cy: u.H - 330, rx: 30 + ((t * 36 + i * 40) % 110), ry: 8 + ((t * 36 + i * 40) % 110) * 0.2, fill: "none", stroke: rgba("#ffffff", 0.4 * (1 - ((t * 36 + i * 40) % 110) / 110)), strokeWidth: 3 })),
      (function () {
        const sx = u.W / 2 - 140, sy = u.H - 340, ro = Math.sin(t * 0.6) * 14;
        let ptsr = "";
        for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2; const r = k % 2 ? 22 : 52; ptsr += (sx + Math.cos(a) * r) + "," + (sy + Math.sin(a) * r * 0.8) + " "; }
        return R("polygon", { points: ptsr, fill: theme.anemone, stroke: rgba(theme.ink, 0.4), strokeWidth: 3, transform: "rotate(" + ro + " " + sx + " " + sy + ")" });
      })(),
      R("g", { transform: "translate(" + (u.W / 2 + 170) + "," + (u.H - 330) + ")" },
        Array.from({ length: 10 }).map((_, k) => {
          const a = (k / 10) * Math.PI * 2;
          const wob = Math.sin(t * 2.4 + k) * 8;
          return R("line", { key: k, x1: 0, y1: 0, x2: Math.cos(a) * (34 + wob), y2: Math.sin(a) * (26 + wob) * 0.7 - 8, stroke: theme.seafoam, strokeWidth: 6, strokeLinecap: "round" });
        }),
        R("circle", { r: 13, fill: rgba(theme.ink, 0.5) })),
      (function () {
        const cph = (t * 0.2) % 1;
        const cx2 = 140 + cph * (u.W - 280), flip = Math.floor(t * 0.2) % 2 ? 1 : -1;
        return R("g", { transform: "translate(" + (flip > 0 ? cx2 : u.W - cx2) + "," + (u.H - 170) + ") scale(" + flip + ",1)" },
          R("ellipse", { rx: 30, ry: 20, fill: theme.anemone }),
          R("circle", { cx: -12, cy: -22, r: 5, fill: theme.ink }), R("circle", { cx: 12, cy: -22, r: 5, fill: theme.ink }),
          R("path", { d: "M -12 -18 v -10 M 12 -18 v -10", stroke: theme.ink, strokeWidth: 3 }),
          [-1, 1].map((s) => [0, 1, 2].map((k) => R("path", { key: s + "-" + k, d: "M " + (s * 26) + " " + (k * 6 - 4) + " l " + (s * (16 + Math.sin(t * 8 + k) * 5)) + " " + (8 + k * 3), fill: "none", stroke: theme.anemone, strokeWidth: 5, strokeLinecap: "round" }))),
          R("path", { d: "M 24 -20 a 10 10 0 0 1 14 -6", fill: "none", stroke: theme.anemone, strokeWidth: 6, strokeLinecap: "round" }));
      })(),
      Array.from({ length: 5 }).map((_, i) => R("circle", { key: "p" + i, cx: 130 + i * 60, cy: 240 + (i % 2) * 40, r: 4 + (i % 3), fill: rgba(theme.rock, 0.35) }))),
  });

  /* ---- Cold Plunge Club: ice hole, breath puffs, sauna hut, snow ---- */
  FilmKit.make({
    global: "ColdPlunge", variants: { Cursor: "slider", Toggle: "switch", Notify: "drop", Morph: "roll" },
    brand: "Cold Plunge Club", desk: "#a8c4d0", ambient: 1.6,
    FH: '"Bebas Neue", sans-serif', FB: '"Instrument Sans", sans-serif',
    palette: (t) => ({ ice: t.ice || "#cfe6ee", plunge: t.plunge || "#16344a", flush: "#e85c4a", white: "#fafcfd", steel: "#6a8ca0" }),
    tweaks: [{ k: "ice", label: "Ice", options: ["#cfe6ee", "#d8e2e8", "#c8e0d8"] }, { k: "plunge", label: "Water", options: ["#16344a", "#0f3040", "#1c2440"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M12 2v20M12 6l4-2M12 6L8 4M12 18l4 2M12 18l-4 2M4 8l16 8M6 6.5L8 10M18 17.5L16 14M20 8L4 16M17.5 6L14 8M6.5 18l3.5-2" })),
    cams: ["zoomOut", "pushU", "drop", "pushR", "zoomIn", "pushL"], camMul: 5, camOff: 2,
    mag: { rot: 0.5, driftY: 8, inn: 0.24 }, titlePreset: "rise", itemPreset: "streak", titleSpace: "0.04em", titleLine: 0.98,
    look: {
      hook: { bg: "ice", fg: "plunge", hi: "flush", world: true, top: 320, size: 136, upper: true, kicker: { v: "tag", bg: "plunge", c: "white" } },
      statement: { bg: "plunge", fg: "white", hi: "flush", world: false, top: 620, size: 164, upper: true },
      feature: { bg: "ice", fg: "plunge", hi: "flush", world: true, top: 250, size: 104, upper: true, card: { v: "frame", bg: "plunge", r: 18, line: "white" }, chips: { v: "pill", colors: ["flush", "steel"], text: "white" } },
      montage: { bg: "plunge", fg: "white", hi: "flush", world: false, top: 258, size: 100, upper: true, tile: { bg: "ice", line: "plunge", label: "plunge", r: 14 }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "ice", fg: "plunge", hi: "flush", world: true, cols: ["flush", "steel", "plunge"], num: 158, upper: true, rule: true },
      cta: { bg: "flush", fg: "white", hi: "plunge", world: false, top: 500, size: 130, upper: true, btn: { v: "block", bg: "plunge", c: "white" }, logoShape: "circle" },
      app: { bg: "ice", fg: "plunge", hi: "flush", cardBg: "#eef6fa", line: "plunge", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("rect", { x: -20, y: u.H - 420, width: u.W + 40, height: 300, fill: theme.white }),
      R("ellipse", { cx: u.W / 2, cy: u.H - 300, rx: 240, ry: 80, fill: theme.plunge }),
      R("path", { d: "M " + (u.W / 2 - 240) + " " + (u.H - 300) + " l -40 -14 l 34 -8 l -22 -18 l 40 4", fill: "none", stroke: rgba(theme.plunge, 0.35), strokeWidth: 5, strokeLinecap: "round", strokeLinejoin: "round" }),
      [0, 1].map((i) => R("ellipse", { key: i, cx: u.W / 2 - 60 + i * 130, cy: u.H - 300, rx: 24 + ((t * 44 + i * 50) % 140), ry: 7 + ((t * 44 + i * 50) % 140) * 0.22, fill: "none", stroke: rgba(theme.white, 0.4 * (1 - ((t * 44 + i * 50) % 140) / 140)), strokeWidth: 4 })),
      (function () {
        const ph = (t * 0.4) % 1;
        return R("g", null,
          R("circle", { cx: u.W / 2 - 40, cy: u.H - 380, r: 17, fill: theme.flush }),
          R("ellipse", { cx: u.W / 2 - 40 + 30, cy: u.H - 410 - ph * 60, rx: 12 + ph * 20, ry: 8 + ph * 12, fill: rgba(theme.white, 0.7 * (1 - ph)) }));
      })(),
      R("g", { transform: "translate(" + (u.W - 240) + "," + (u.H - 480) + ")" },
        R("rect", { x: -90, y: 0, width: 180, height: 110, rx: 10, fill: "#6b4a2f" }),
        R("polygon", { points: "-104,0 104,0 0,-80", fill: "#4a3826" }),
        R("rect", { x: 20, y: 40, width: 40, height: 70, rx: 6, fill: rgba(theme.white, 0.85) }),
        R("circle", { cx: -30, cy: 54, r: 16, fill: rgba("#f6c46a", 0.8 + Math.sin(t * 3) * 0.15) }),
        R("path", { d: "M 30 -60 q 16 -30 -4 -60", fill: "none", stroke: rgba(theme.white, 0.7), strokeWidth: 11, strokeLinecap: "round", transform: "translate(0," + (-((t * 40) % 40)) + ")" })),
      Array.from({ length: 14 }).map((_, i) => {
        const ph = (t * (0.05 + (i % 3) * 0.025) + i * 0.08) % 1;
        return R("circle", { key: "s" + i, cx: (i * 89 + 30) % u.W + Math.sin(t + i) * 20, cy: ph * (u.H - 440), r: 3 + (i % 2) * 2, fill: rgba(theme.white, 0.8 * (1 - ph * 0.4)) });
      }),
      R("g", { transform: "translate(130," + (u.H - 560) + ")" },
        R("rect", { x: -10, y: -110, width: 20, height: 150, rx: 10, fill: "none", stroke: theme.plunge, strokeWidth: 4 }),
        R("circle", { cy: 56, r: 18, fill: theme.flush }),
        R("rect", { x: -5, y: -20 - Math.sin(t * 0.5) * 12, width: 10, height: 76 + Math.sin(t * 0.5) * 12, rx: 5, fill: theme.flush }),
        R("text", { x: 28, y: -78, fontFamily: '"Bebas Neue", sans-serif', fontSize: 30, fill: theme.plunge }, "4°"))),
  });
})();
