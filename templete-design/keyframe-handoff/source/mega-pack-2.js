/* mega-pack-2.js — Fold Studio, Night Bazaar, Dawn Patrol, Fade Parlor, Kiln & Clay,
   Crux Climb, Harbor Light, Forest Floor, Steep Ritual, Darkroom Dev */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ---- Fold Studio: origami — folding triangles, crane flap, crease lines ---- */
  FilmKit.make({
    global: "FoldStudio", variants: { DragDrop: "assemble", Morph: "fade", Toggle: "switch", Swipe: "flip" },
    brand: "Fold Studio", desk: "#d9d2c2", ambient: 1.6,
    FH: '"Zilla Slab", serif', FB: '"Source Sans 3", sans-serif',
    palette: (t) => ({ washi: t.washi || "#f2ede3", crane: t.crane || "#d64545", indigo: "#2e4a7d", kraft: "#b89b6a", ink: "#26221c" }),
    tweaks: [{ k: "washi", label: "Paper", options: ["#f2ede3", "#ece9e0", "#f4e8d8"] }, { k: "crane", label: "Crane", options: ["#d64545", "#c2477e", "#3e7c5b"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: theme.currentBg }, R2("path", { d: "M3 18L12 4l3 6 6-2-7 12z" })),
    cams: ["pushL", "zoomIn", "pushD", "pushR", "hopU", "zoomOut"], camMul: 5, camOff: 1,
    mag: { rot: 0.8, skew: 2, driftX: 6 }, titlePreset: "flip", itemPreset: "flip", titleLine: 1.08,
    look: {
      hook: { bg: "washi", fg: "ink", hi: "crane", world: true, top: 330, size: 122, kicker: { v: "outline", c: "indigo" } },
      statement: { bg: "crane", fg: "washi", hi: "ink", world: false, top: 630, size: 148 },
      feature: { bg: "washi", fg: "ink", hi: "crane", world: true, top: 250, size: 96, card: { v: "frame", bg: "indigo", r: 6, line: "washi" }, chips: { v: "square", colors: ["crane", "indigo", "kraft"], text: "washi" } },
      montage: { bg: "ink", fg: "washi", hi: "crane", world: false, top: 258, size: 92, tile: { bg: "washi", line: "ink", label: "washi", r: 4 }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "washi", fg: "ink", hi: "crane", world: true, cols: ["crane", "indigo", "kraft"], num: 150 },
      cta: { bg: "indigo", fg: "washi", hi: "crane", world: false, top: 500, size: 118, btn: { v: "block", bg: "washi", c: "indigo" }, logoShape: "rounded" },
      app: { bg: "washi", fg: "ink", hi: "crane", cardBg: "#faf7f0", line: "ink", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [[u.W - 240, 260, theme.crane], [150, u.H - 420, theme.indigo], [u.W - 160, u.H - 320, theme.kraft]].map(([x, y, c], i) => {
        const ph = (Math.sin(t * (0.7 + i * 0.2) + i * 2) + 1) / 2;
        return R("g", { key: i, transform: "translate(" + x + "," + y + ")" },
          R("polygon", { points: "0,-70 60,35 -60,35", fill: rgba(c, 0.5), transform: "scaleX(" + (0.3 + ph * 0.7) + ") rotate(" + (i * 40 + t * 10) + ")" }));
      }),
      (function () {
        const fx = 200 + ((t * 40) % (u.W - 200)), flap = Math.sin(t * 4) * 22;
        return R("g", { transform: "translate(" + fx + ",230)" },
          R("polygon", { points: "0,0 46,-8 18,12", fill: theme.crane }),
          R("polygon", { points: "10,0 " + (34 + flap * 0.3) + "," + (-26 - flap) + " 40,-4", fill: rgba(theme.crane, 0.8) }),
          R("polygon", { points: "10,2 " + (34 + flap * 0.3) + "," + (18 + flap) + " 40,0", fill: rgba(theme.crane, 0.6) }));
      })(),
      [0, 1, 2, 3].map((i) => R("line", { key: "c" + i, x1: 80 + i * 60, y1: 200, x2: 140 + i * 60, y2: 260 + i * 30, stroke: rgba(theme.ink, 0.18), strokeWidth: 3, strokeDasharray: "8 8" }))),
  });

  /* ---- Night Bazaar: string lights, striped awning, smoke, swinging sign ---- */
  FilmKit.make({
    global: "NightBazaar", variants: { Scroll: "ticker", Cursor: "click", Notify: "pop", Ring: "bar" },
    brand: "Night Bazaar", desk: "#160d20", ambient: 1.9,
    FH: '"Baloo 2", sans-serif', FB: '"Be Vietnam Pro", sans-serif',
    palette: (t) => ({ plum: t.plum || "#221430", amber: t.amber || "#ffb454", mint: "#59d4a4", chalk: "#f6efe6", ink: "#180e24" }),
    tweaks: [{ k: "plum", label: "Night", options: ["#221430", "#141a30", "#2a1220"] }, { k: "amber", label: "Lantern", options: ["#ffb454", "#ff8a5c", "#ffd23c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M4 10h16l-2 10H6zM4 10l2-5h12l2 5M12 5v5" })),
    cams: ["pushR", "hopU", "zoomIn", "pushL", "drop", "spin"], camMul: 7, camOff: 2,
    mag: { rot: 1.1, driftX: 9, driftY: 8 }, titlePreset: "bounce", itemPreset: "pop",
    look: {
      hook: { bg: "plum", fg: "chalk", hi: "amber", world: true, top: 330, size: 124, upper: true, kicker: { v: "pill", bg: "amber", c: "ink" } },
      statement: { bg: "amber", fg: "ink", hi: "plum", world: false, top: 630, size: 150, upper: true },
      feature: { bg: "plum", fg: "chalk", hi: "amber", world: true, top: 250, size: 98, upper: true, card: { v: "tilt", bg: "ink", r: 20, line: "chalk" }, chips: { v: "pill", colors: ["amber", "mint"], text: "ink" } },
      montage: { bg: "ink", fg: "chalk", hi: "amber", world: false, top: 258, size: 94, upper: true, tile: { bg: "plum", line: "chalk", label: "amber", r: 16 }, tilts: [-3, 2.5, 2, -2.5] },
      stats: { bg: "plum", fg: "chalk", hi: "amber", world: true, cols: ["amber", "mint", "chalk"], num: 152, upper: true },
      cta: { bg: "mint", fg: "ink", hi: "plum", world: false, top: 500, size: 120, upper: true, btn: { v: "pill", bg: "ink", c: "chalk" }, logoShape: "circle" },
      app: { bg: "plum", fg: "chalk", hi: "amber", cardBg: "#2c1c3c", line: "chalk", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1].map((row) => R("g", { key: row },
        R("path", { d: "M -20 " + (150 + row * 110) + " q " + (u.W / 4) + " 70 " + (u.W / 2) + " 0 t " + (u.W / 2 + 40) + " 0", fill: "none", stroke: rgba(theme.chalk, 0.25), strokeWidth: 3 }),
        Array.from({ length: 8 }).map((_, i) => {
          const x = 60 + i * (u.W / 7.5), sag = Math.sin((x / u.W) * Math.PI) * 62;
          const on = Math.sin(t * 3 + i * 1.7 + row * 2) > -0.3;
          return R("circle", { key: i, cx: x, cy: 156 + row * 110 + sag, r: 9, fill: on ? theme.amber : rgba(theme.amber, 0.25) });
        }))),
      R("g", { transform: "translate(" + (u.W - 250) + "," + (u.H - 420) + ")" },
        Array.from({ length: 6 }).map((_, i) => R("rect", { key: i, x: i * 36 - 108, y: 0, width: 36, height: 54, fill: i % 2 ? rgba(theme.crane || theme.amber, 0.55) : rgba(theme.chalk, 0.4) })),
        R("rect", { x: -114, y: 50, width: 228, height: 10, rx: 4, fill: rgba(theme.ink, 0.6) })),
      R("path", { d: "M 160 " + (u.H - 260) + " q 24 -60 -6 -110 q -26 -46 4 -96", fill: "none", stroke: rgba(theme.chalk, 0.2), strokeWidth: 10, strokeLinecap: "round" }),
      R("g", { transform: "translate(140,340) rotate(" + Math.sin(t * 1.2) * 7 + ")" },
        R("line", { x1: 0, y1: -60, x2: 0, y2: 0, stroke: rgba(theme.chalk, 0.4), strokeWidth: 4 }),
        R("rect", { x: -64, y: 0, width: 128, height: 58, rx: 10, fill: theme.mint }),
        R("circle", { cy: 29, r: 12, fill: rgba(theme.ink, 0.4) }))),
  });

  /* ---- Dawn Patrol: run club — road dashes, bobbing runner, rising sun ---- */
  FilmKit.make({
    global: "DawnPatrol", variants: { Ring: "gauge", Scroll: "feed", Toggle: "check", Morph: "roll" },
    brand: "Dawn Patrol", desk: "#0d2338", ambient: 1.9,
    FH: '"Big Shoulders Display", sans-serif', FB: '"Red Hat Text", sans-serif',
    palette: (t) => ({ predawn: t.predawn || "#16324f", coral: t.coral || "#ff7955", hivis: "#ffe14d", pale: "#eef4f8", ink: "#0e2032" }),
    tweaks: [{ k: "predawn", label: "Sky", options: ["#16324f", "#1f2b4a", "#14383e"] }, { k: "coral", label: "Sunrise", options: ["#ff7955", "#ff5d8f", "#ffa03c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.75, strokeLinecap: "round" }, R2("path", { d: "M4 20h16M6 16a6 6 0 0 1 12 0M12 10V4M5 12l-2-2M19 12l2-2" })),
    cams: ["pushL", "pushU", "zoomIn", "pushR", "hopU", "zoomOut"], camMul: 7, camOff: 0,
    mag: { rot: 0.6, slide: 0.34, driftX: 10 }, titlePreset: "streak", itemPreset: "streak", titleSpace: "0.01em",
    look: {
      hook: { bg: "predawn", fg: "pale", hi: "hivis", world: true, top: 310, size: 128, upper: true, kicker: { v: "tag", bg: "coral", c: "ink" } },
      statement: { bg: "coral", fg: "ink", hi: "pale", world: false, top: 630, size: 152, upper: true },
      feature: { bg: "predawn", fg: "pale", hi: "hivis", world: true, top: 248, size: 100, upper: true, card: { v: "frame", bg: "ink", r: 16, line: "pale" }, chips: { v: "pill", colors: ["hivis", "coral"], text: "ink" } },
      montage: { bg: "ink", fg: "pale", hi: "coral", world: false, top: 258, size: 96, upper: true, tile: { bg: "predawn", line: "pale", label: "hivis", r: 12 }, tilts: [-2, 2, 1.5, -2] },
      stats: { bg: "predawn", fg: "pale", hi: "hivis", world: true, cols: ["hivis", "coral", "pale"], num: 154, upper: true, rule: true },
      cta: { bg: "hivis", fg: "ink", hi: "coral", world: false, top: 500, size: 122, upper: true, btn: { v: "block", bg: "ink", c: "pale" }, logoShape: "rounded" },
      app: { bg: "predawn", fg: "pale", hi: "hivis", cardBg: "#1c3a58", line: "pale", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("circle", { cx: u.W * 0.78, cy: 420 - u.seg(p, 0, 0.7) * 140, r: 84, fill: theme.coral, opacity: 0.9 }),
      R("circle", { cx: u.W * 0.78, cy: 420 - u.seg(p, 0, 0.7) * 140, r: 130, fill: "none", stroke: rgba(theme.coral, 0.3), strokeWidth: 20 }),
      R("path", { d: "M -20 " + (u.H - 360) + " Q " + (u.W / 2) + " " + (u.H - 460) + " " + (u.W + 20) + " " + (u.H - 340), fill: "none", stroke: rgba(theme.pale, 0.25), strokeWidth: 90 }),
      Array.from({ length: 7 }).map((_, i) => {
        const q = ((i / 7 + t * 0.09) % 1);
        const x = q * (u.W + 40) - 20, y = u.H - 360 - Math.sin(q * Math.PI) * (100 - 50) - 45 + 45;
        return R("rect", { key: i, x, y: u.H - 366 - Math.sin(q * Math.PI) * 55, width: 46, height: 10, rx: 5, fill: rgba(theme.hivis, 0.75), transform: "rotate(" + (Math.cos(q * Math.PI) * 8) + " " + x + " " + (u.H - 360) + ")" });
      }),
      (function () {
        const bob = Math.abs(Math.sin(t * 6)) * 14;
        const rx = 200, ry = u.H - 430 - bob;
        return R("g", { transform: "translate(" + rx + "," + ry + ")" },
          R("circle", { cy: -58, r: 15, fill: theme.pale }),
          R("path", { d: "M0 -42 L-4 6 M0 -30 l-26 " + (10 + Math.sin(t * 6) * 12) + " M0 -30 l24 " + (10 - Math.sin(t * 6) * 12) + " M-4 6 l-18 " + (26 + Math.sin(t * 6 + 1.5) * 10) + " M-4 6 l22 " + (26 - Math.sin(t * 6 + 1.5) * 10), stroke: theme.pale, strokeWidth: 9, strokeLinecap: "round", fill: "none" }),
          R("rect", { x: -16, y: -44, width: 32, height: 22, rx: 8, fill: theme.hivis }));
      })(),
      [0, 1, 2].map((i) => R("g", { key: "k" + i, transform: "translate(" + (u.W - 120 - i * 240) + "," + (u.H - 300) + ")" },
        R("rect", { x: -4, y: 0, width: 8, height: 60, fill: rgba(theme.pale, 0.4) }),
        R("text", { y: -8, textAnchor: "middle", fontFamily: '"Big Shoulders Display", sans-serif', fontSize: 34, fill: rgba(theme.pale, 0.5) }, (5 - i) + "K")))),
  });

  /* ---- Fade Parlor: barber pole spin, scissors, mirror bulbs ---- */
  FilmKit.make({
    global: "FadeParlor", variants: { Cursor: "slider", Scroll: "board", Notify: "side", Morph: "flap" },
    brand: "Fade Parlor", desk: "#12202e", ambient: 1.7,
    FH: '"Abril Fatface", serif', FB: '"Work Sans", sans-serif',
    palette: (t) => ({ navy: t.navy || "#1b2838", cream: "#f4eee4", red: t.red || "#c8433b", steel: "#9fb2c1", gold: "#caa24f" }),
    tweaks: [{ k: "navy", label: "Shop", options: ["#1b2838", "#22203a", "#1e3028"] }, { k: "red", label: "Pole", options: ["#c8433b", "#b3452e", "#8c3a5c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("circle", { cx: 6, cy: 6, r: 3 }), R2("circle", { cx: 6, cy: 18, r: 3 }), R2("path", { d: "M8.5 8.5L20 20M8.5 15.5L20 4" })),
    cams: ["zoomIn", "pushL", "drop", "pushR", "zoomOut", "pushU"], camMul: 5, camOff: 3,
    mag: { rot: 0.7, inn: 0.24 }, titlePreset: "stamp", itemPreset: "rise", titleLine: 1.1,
    look: {
      hook: { bg: "navy", fg: "cream", hi: "gold", world: true, top: 330, size: 118, kicker: { v: "outline", c: "gold" } },
      statement: { bg: "red", fg: "cream", hi: "navy", world: false, top: 630, size: 146 },
      feature: { bg: "navy", fg: "cream", hi: "gold", world: true, top: 250, size: 94, card: { v: "frame", bg: "#141e2a", r: 14, line: "cream" }, chips: { v: "outline", colors: ["gold", "steel"], text: "navy" } },
      montage: { bg: "#141e2a", fg: "cream", hi: "gold", world: false, top: 258, size: 92, tile: { bg: "navy", line: "cream", label: "gold", r: 10 }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "navy", fg: "cream", hi: "gold", world: true, cols: ["gold", "red", "steel"], num: 148 },
      cta: { bg: "cream", fg: "navy", hi: "red", world: false, top: 500, size: 116, btn: { v: "block", bg: "navy", c: "cream" }, logoShape: "circle" },
      app: { bg: "navy", fg: "cream", hi: "gold", cardBg: "#223349", line: "cream", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("g", { transform: "translate(" + (u.W - 150) + ",300)" },
        R("rect", { x: -34, y: -130, width: 68, height: 260, rx: 30, fill: rgba(theme.cream, 0.9) }),
        R("g", { "clip-path": "inset(0 round 30px)" }),
        Array.from({ length: 7 }).map((_, i) => {
          const yy = ((i * 48 + t * 60) % 336) - 168;
          return R("rect", { key: i, x: -34, y: yy, width: 68, height: 22, fill: i % 2 ? theme.red : rgba(theme.navy, 0.85), transform: "skewY(-16)", clipPath: "none", opacity: Math.abs(yy) < 128 ? 1 : 0 });
        }),
        R("rect", { x: -40, y: -150, width: 80, height: 22, rx: 8, fill: theme.gold }),
        R("rect", { x: -40, y: 128, width: 80, height: 22, rx: 8, fill: theme.gold })),
      (function () {
        const open = Math.abs(Math.sin(t * 2.2)) * 24;
        return R("g", { transform: "translate(190," + (u.H - 480) + ") rotate(-20)" },
          R("line", { x1: 0, y1: 0, x2: 130, y2: -open, stroke: theme.steel, strokeWidth: 9, strokeLinecap: "round" }),
          R("line", { x1: 0, y1: 0, x2: 130, y2: open, stroke: theme.steel, strokeWidth: 9, strokeLinecap: "round" }),
          R("circle", { cx: -18, cy: -16, r: 14, fill: "none", stroke: theme.gold, strokeWidth: 6 }),
          R("circle", { cx: -18, cy: 16, r: 14, fill: "none", stroke: theme.gold, strokeWidth: 6 }));
      })(),
      Array.from({ length: 5 }).map((_, i) => R("circle", { key: "b" + i, cx: 120 + i * 70, cy: 210, r: 10, fill: Math.sin(t * 2.6 + i) > 0 ? theme.gold : rgba(theme.gold, 0.25) })),
      R("path", { d: "M 90 " + (u.H - 200) + " h 240", stroke: rgba(theme.steel, 0.35), strokeWidth: 6, strokeLinecap: "round" }),
      R("path", { d: "M 110 " + (u.H - 230) + " q 20 -18 40 0 q 20 18 40 0 q 20 -18 40 0", fill: "none", stroke: rgba(theme.steel, 0.3), strokeWidth: 5 })),
  });

  /* ---- Kiln & Clay: wheel wobble, pot growing, kiln temp squiggle ---- */
  FilmKit.make({
    global: "KilnClay", variants: { DragDrop: "drag", Ring: "ring", Typing: "hand", Scroll: "stack" },
    brand: "Kiln & Clay", desk: "#2a2622", ambient: 1.5,
    FH: '"Gloock", serif', FB: '"Schibsted Grotesk", sans-serif',
    palette: (t) => ({ studio: t.studio || "#f1e9df", rust: t.rust || "#b85c38", slip: "#7e93a0", char: "#33302c", glaze: "#5f9e94" }),
    tweaks: [{ k: "studio", label: "Studio", options: ["#f1e9df", "#ece4d4", "#e9e6de"] }, { k: "rust", label: "Clay", options: ["#b85c38", "#a34a2c", "#8c5a3c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M8 4h8l1 7a5 5 0 0 1-10 0zM6 20h12M12 16v4" })),
    cams: ["zoomOut", "pushL", "hopU", "pushR", "zoomIn", "drop"], camMul: 5, camOff: 2,
    mag: { rot: 0.5, driftY: 7, inn: 0.27 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.08,
    look: {
      hook: { bg: "studio", fg: "char", hi: "rust", world: true, top: 330, size: 120, kicker: { v: "bare", c: "slip" } },
      statement: { bg: "rust", fg: "studio", hi: "char", world: false, top: 630, size: 146 },
      feature: { bg: "studio", fg: "char", hi: "rust", world: true, top: 250, size: 96, card: { v: "frame", bg: "char", r: 22, line: "studio" }, chips: { v: "pill", colors: ["rust", "glaze", "slip"], text: "studio" } },
      montage: { bg: "char", fg: "studio", hi: "rust", world: false, top: 258, size: 92, tile: { bg: "studio", line: "char", label: "studio", r: 18 }, tilts: [-2.5, 2, 1.5, -2] },
      stats: { bg: "studio", fg: "char", hi: "rust", world: true, cols: ["rust", "glaze", "char"], num: 150 },
      cta: { bg: "char", fg: "studio", hi: "rust", world: false, top: 500, size: 118, btn: { v: "pill", bg: "rust", c: "studio" }, logoShape: "circle" },
      app: { bg: "studio", fg: "char", hi: "rust", cardBg: "#faf5ec", line: "char", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      (function () {
        const grow = u.seg(p, 0.1, 0.7), wob = Math.sin(t * 9) * 2;
        const wpx = u.W - 240, wpy = u.H - 340;
        return R("g", { transform: "translate(" + wpx + "," + wpy + ")" },
          R("ellipse", { cy: 30, rx: 130, ry: 26, fill: rgba(theme.char, 0.5), transform: "rotate(" + wob + ")" }),
          R("path", { d: "M -60 20 q -14 -" + (60 + grow * 90) + " 8 -" + (90 + grow * 110) + " l " + (104 + wob) + " 0 q 22 " + (30 + grow * 20) + " 8 " + (90 + grow * 110) + " z", fill: theme.rust, opacity: 0.92, transform: "scaleX(" + (0.72 + grow * 0.28) + ")" }),
          R("ellipse", { cy: 20 - (90 + grow * 110), rx: 52 * (0.72 + grow * 0.28), ry: 12, fill: rgba(theme.char, 0.35) }));
      })(),
      R("path", { d: "M 90 260 " + Array.from({ length: 10 }).map((_, i) => "l 44 " + (i % 2 ? 26 : -26)).join(" "), fill: "none", stroke: rgba(theme.glaze, 0.5), strokeWidth: 6, strokeLinecap: "round", strokeDasharray: "500", strokeDashoffset: String(500 * (1 - u.seg(p, 0.1, 0.8))) }),
      R("text", { x: 90, y: 224, fontFamily: '"Schibsted Grotesk", sans-serif', fontSize: 26, fill: rgba(theme.char, 0.5) }, "cone 6 \u00b7 1222\u00b0C"),
      [0, 1, 2].map((i) => R("g", { key: i, transform: "translate(" + (150 + i * 120) + "," + (u.H - 220) + ")" },
        R("path", { d: "M -34 0 q -6 -" + (34 + i * 14) + " 6 -" + (48 + i * 16) + " l 56 0 q 12 " + (14 + i * 4) + " 6 " + (48 + i * 16) + " z", fill: "none", stroke: rgba(theme.char, 0.4), strokeWidth: 5 })))),
  });

  /* ---- Crux Climb: wall angles, holds popping, chalk puff, rope swing ---- */
  FilmKit.make({
    global: "CruxClimb", variants: { Cursor: "keys", Toggle: "dial", Notify: "drop", Swipe: "swipe" },
    brand: "Crux Climb", desk: "#1c1e21", ambient: 1.9,
    FH: '"Anton", sans-serif', FB: '"Asap", sans-serif',
    palette: (t) => ({ wall: t.wall || "#2c2f33", hold: t.hold || "#ff8a3d", pad: "#3d7bff", chalk: "#f2f2ee", ink: "#191b1e" }),
    tweaks: [{ k: "wall", label: "Wall", options: ["#2c2f33", "#2a2c38", "#302a2a"] }, { k: "hold", label: "Holds", options: ["#ff8a3d", "#c3f53c", "#ff5d8f"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M8 21l4-7-3-5 4-6 3 5-2 4 4 9" })),
    cams: ["pushU", "zoomIn", "pushL", "hopU", "pushR", "drop"], camMul: 7, camOff: 1,
    mag: { rot: 0.9, skew: 3, driftY: 9 }, titlePreset: "slam", itemPreset: "pop", titleSpace: "0.02em",
    look: {
      hook: { bg: "wall", fg: "chalk", hi: "hold", world: true, top: 310, size: 126, upper: true, kicker: { v: "tag", bg: "hold", c: "ink" } },
      statement: { bg: "ink", fg: "chalk", hi: "hold", world: false, top: 630, size: 150, upper: true },
      feature: { bg: "wall", fg: "chalk", hi: "hold", world: true, top: 248, size: 98, upper: true, card: { v: "frame", bg: "ink", r: 14, line: "chalk" }, chips: { v: "square", colors: ["hold", "pad", "chalk"], text: "ink" } },
      montage: { bg: "ink", fg: "chalk", hi: "hold", world: false, top: 258, size: 94, upper: true, tile: { bg: "wall", line: "chalk", label: "hold", r: 10 }, tilts: [-3, 2, 2.5, -2] },
      stats: { bg: "wall", fg: "chalk", hi: "hold", world: true, cols: ["hold", "pad", "chalk"], num: 152, upper: true, rule: true },
      cta: { bg: "hold", fg: "ink", hi: "chalk", world: false, top: 500, size: 120, upper: true, btn: { v: "block", bg: "ink", c: "chalk" }, logoShape: "rounded" },
      app: { bg: "wall", fg: "chalk", hi: "hold", cardBg: "#25282d", line: "chalk", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("path", { d: "M " + (u.W - 380) + " -20 L " + (u.W - 200) + " " + (u.H * 0.4) + " L " + (u.W - 330) + " " + u.H + " L " + (u.W + 20) + " " + u.H + " L " + (u.W + 20) + " -20 Z", fill: rgba(theme.ink, 0.5) }),
      [[u.W - 300, 200, 0], [u.W - 240, 380, 1], [u.W - 290, 560, 2], [u.W - 210, 720, 3], [u.W - 280, 900, 4]].map(([x, y, i]) => {
        const e = u.ease.outBack(u.clamp01(u.seg(p, 0.08 + i * 0.09, 0.24 + i * 0.09)));
        const shapes = ["M -26 10 q 26 -34 52 0 z", "M -22 -14 h 44 v 28 h -44 z", "M 0 -24 l 24 40 h -48 z", "M -26 0 a 26 20 0 1 0 52 0 a 26 20 0 1 0 -52 0", "M -24 12 q 10 -40 48 -6 q -20 24 -48 6"];
        return R("path", { key: i, d: shapes[i], fill: [theme.hold, theme.pad, theme.chalk, theme.hold, theme.pad][i], transform: "translate(" + x + "," + y + ") scale(" + e + ") rotate(" + i * 24 + ")", opacity: 0.9 });
      }),
      (function () {
        const puff = (t * 0.5) % 1;
        return R("circle", { cx: u.W - 258, cy: 560, r: 10 + puff * 44, fill: rgba(theme.chalk, 0.25 * (1 - puff)) });
      })(),
      R("path", { d: "M 120 -20 q " + (Math.sin(t * 1.1) * 40) + " 300 0 560", fill: "none", stroke: rgba(theme.chalk, 0.3), strokeWidth: 6, strokeLinecap: "round" }),
      R("circle", { cx: 120 + Math.sin(t * 1.1) * 10, cy: 540, r: 16, fill: "none", stroke: theme.hold, strokeWidth: 6 }),
      Array.from({ length: 4 }).map((_, i) => R("rect", { key: "p" + i, x: 60 + i * 90, y: u.H - 160, width: 80, height: 34, rx: 8, fill: rgba(theme.pad, 0.4 + (i % 2) * 0.15) }))),
  });

  /* ---- Harbor Light: sweeping beam, waves, gulls, fog band ---- */
  FilmKit.make({
    global: "HarborLight", variants: { Typing: "typewriter", Ring: "ring", Scroll: "feed", Morph: "fade" },
    brand: "Harbor Light", desk: "#1a262e", ambient: 1.5,
    FH: '"Cormorant Garamond", serif', FB: '"Nunito Sans", sans-serif',
    palette: (t) => ({ fog: t.fog || "#dfe6e2", lamp: t.lamp || "#e8b23c", hull: "#1f3242", rust: "#a34a2c", ink: "#16232c" }),
    tweaks: [{ k: "fog", label: "Fog", options: ["#dfe6e2", "#e2e2da", "#d8e2e8"] }, { k: "lamp", label: "Lamp", options: ["#e8b23c", "#e8883c", "#d0b060"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M9 21l1-14h4l1 14zM8 7h8M12 3v4M5 21h14" })),
    cams: ["zoomOut", "pushL", "drop", "pushU", "zoomIn", "pushR"], camMul: 5, camOff: 0,
    mag: { rot: 0.4, driftY: 8, inn: 0.28, driftZ: 0.04 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.06,
    look: {
      hook: { bg: "hull", fg: "fog", hi: "lamp", world: true, top: 330, size: 122, kicker: { v: "outline", c: "lamp" } },
      statement: { bg: "fog", fg: "ink", hi: "rust", world: false, top: 630, size: 146 },
      feature: { bg: "hull", fg: "fog", hi: "lamp", world: true, top: 250, size: 96, card: { v: "frame", bg: "ink", r: 18, line: "fog" }, chips: { v: "outline", colors: ["lamp", "fog"], text: "ink" } },
      montage: { bg: "fog", fg: "ink", hi: "rust", world: false, top: 258, size: 92, tile: { bg: "hull", line: "fog", label: "fog", r: 14 }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "hull", fg: "fog", hi: "lamp", world: true, cols: ["lamp", "rust", "fog"], num: 148 },
      cta: { bg: "rust", fg: "fog", hi: "lamp", world: false, top: 500, size: 118, btn: { v: "pill", bg: "fog", c: "ink" }, logoShape: "circle" },
      app: { bg: "hull", fg: "fog", hi: "lamp", cardBg: "#283d50", line: "fog", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      (function () {
        const ang = (t * 40) % 360;
        return R("g", { transform: "translate(" + (u.W - 200) + ",320)" },
          R("polygon", { points: "0,0 -420,-90 -420,90", fill: rgba(theme.lamp, 0.18), transform: "rotate(" + ang + ")" }),
          R("polygon", { points: "0,0 -420,-90 -420,90", fill: rgba(theme.lamp, 0.18), transform: "rotate(" + (ang + 180) + ")" }),
          R("rect", { x: -26, y: -20, width: 52, height: 40, fill: theme.lamp, rx: 8 }),
          R("path", { d: "M -40 40 L -24 200 L 24 200 L 40 40 Z", fill: rgba(theme.fog, 0.85) }),
          R("path", { d: "M -34 90 h 68 M -30 140 h 60", stroke: theme.rust, strokeWidth: 12 }));
      })(),
      [0, 1, 2].map((i) => R("path", { key: i, d: "M -40 " + (u.H - 240 + i * 60) + " " + Array.from({ length: 6 }).map((_, s) => "q 100 " + (s % 2 ? 30 : -30) + " 200 0").join(" "), fill: "none", stroke: rgba(theme.fog, 0.3 - i * 0.07), strokeWidth: 8, strokeLinecap: "round", transform: "translate(" + (-((t * (46 + i * 18)) % 400)) + ",0)" })),
      [0, 1].map((i) => R("path", { key: "g" + i, d: "M " + (180 + i * 160 + Math.sin(t * 0.7 + i) * 60) + " " + (240 + i * 70 + Math.cos(t * 0.8 + i) * 20) + " q 16 -18 32 0 q 16 -18 32 0", fill: "none", stroke: rgba(theme.fog, 0.55), strokeWidth: 5, strokeLinecap: "round" })),
      R("rect", { x: -40, y: 500 + Math.sin(t * 0.5) * 30, width: u.W + 80, height: 90, fill: rgba(theme.fog, 0.1) })),
  });

  /* ---- Forest Floor: mushrooms popping, spores, fern sway ---- */
  FilmKit.make({
    global: "ForestFloor", variants: { Toggle: "check", DragDrop: "drag", Morph: "roll", Notify: "pop" },
    brand: "Forest Floor", desk: "#2a3324", ambient: 1.6,
    FH: '"Vollkorn", serif', FB: '"Alegreya Sans", sans-serif',
    palette: (t) => ({ moss: t.moss || "#3e4a36", cream: "#efe9db", chant: t.chant || "#d9913b", bark: "#5c4633", fern: "#7ba05b" }),
    tweaks: [{ k: "moss", label: "Moss", options: ["#3e4a36", "#37453e", "#46422e"] }, { k: "chant", label: "Cap", options: ["#d9913b", "#b3452e", "#c9a24b"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M4 12a8 8 0 0 1 16 0zM10 12l-1 8h6l-1-8" })),
    cams: ["zoomIn", "pushD", "hopU", "pushL", "zoomOut", "pushR"], camMul: 5, camOff: 2,
    mag: { rot: 0.7, driftY: 8 }, titlePreset: "rise", itemPreset: "pop", titleLine: 1.08,
    look: {
      hook: { bg: "moss", fg: "cream", hi: "chant", world: true, top: 330, size: 120, kicker: { v: "pill", bg: "chant", c: "moss" } },
      statement: { bg: "bark", fg: "cream", hi: "chant", world: false, top: 630, size: 146 },
      feature: { bg: "moss", fg: "cream", hi: "chant", world: true, top: 250, size: 96, card: { v: "frame", bg: "bark", r: 22, line: "cream" }, chips: { v: "pill", colors: ["chant", "fern"], text: "moss" } },
      montage: { bg: "bark", fg: "cream", hi: "chant", world: false, top: 258, size: 92, tile: { bg: "moss", line: "cream", label: "cream", r: 18 }, tilts: [-2.5, 2, 1.5, -2] },
      stats: { bg: "moss", fg: "cream", hi: "chant", world: true, cols: ["chant", "fern", "cream"], num: 150 },
      cta: { bg: "chant", fg: "moss", hi: "cream", world: false, top: 500, size: 118, btn: { v: "pill", bg: "moss", c: "cream" }, logoShape: "circle" },
      app: { bg: "moss", fg: "cream", hi: "chant", cardBg: "#47543e", line: "cream", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [[140, 0], [300, 1], [220, 2], [u.W - 200, 3], [u.W - 320, 4]].map(([x, i]) => {
        const e = u.ease.outBack(u.clamp01(u.seg(p, 0.06 + i * 0.08, 0.3 + i * 0.08)));
        const h = 60 + (i % 3) * 26, gy = u.H - 180 - (i % 2) * 40;
        return R("g", { key: i, transform: "translate(" + x + "," + gy + ") scale(" + e + ")", "transform-origin": "0 0" },
          R("rect", { x: -10, y: -h, width: 20, height: h, rx: 9, fill: theme.cream }),
          R("path", { d: "M -" + (34 + (i % 2) * 12) + " -" + h + " a " + (34 + (i % 2) * 12) + " " + (26 + (i % 2) * 8) + " 0 0 1 " + (68 + (i % 2) * 24) + " 0 z", fill: i % 2 ? theme.chant : theme.fern }),
          (i % 2 === 0) && R("circle", { cx: -8, cy: -h - 12, r: 5, fill: rgba(theme.cream, 0.8) }));
      }),
      Array.from({ length: 9 }).map((_, i) => R("circle", { key: "s" + i, cx: (i * 131 + 60) % u.W + Math.sin(t * 0.6 + i) * 26, cy: 200 + ((i * 97) % 500) + Math.cos(t * 0.5 + i * 1.3) * 30, r: 3 + (i % 2) * 2, fill: rgba(theme.cream, 0.28) })),
      (function () {
        const sway = Math.sin(t * 0.9) * 10;
        return R("g", { transform: "translate(80,230) rotate(" + sway + ")" },
          R("path", { d: "M 0 0 q 30 -80 10 -170", fill: "none", stroke: theme.fern, strokeWidth: 7, strokeLinecap: "round" }),
          [0.2, 0.4, 0.6, 0.8].map((f, i) => R("path", { key: i, d: "M " + (8 + f * 8) + " " + (-f * 165) + " l " + (28 - i * 4) + " -" + (12 - i * 2) + " M " + (8 + f * 8) + " " + (-f * 165) + " l -" + (24 - i * 4) + " -" + (10 - i * 2), stroke: theme.fern, strokeWidth: 5, strokeLinecap: "round", fill: "none" })));
      })()),
  });

  /* ---- Steep Ritual: tea house — steam curl, bowl, bamboo sway ---- */
  FilmKit.make({
    global: "SteepRitual", variants: { Ring: "gauge", Toggle: "switch", Typing: "caret", Scroll: "board" },
    brand: "Steep Ritual", desk: "#22221c", ambient: 1.4,
    FH: '"Marcellus", serif', FB: '"Mukta", sans-serif',
    palette: (t) => ({ matcha: t.matcha || "#7a8c4f", porcelain: "#f7f3ea", pot: t.pot || "#8c5a3c", ink: "#2b2b26", gold: "#c9a24b" }),
    tweaks: [{ k: "matcha", label: "Matcha", options: ["#7a8c4f", "#5f7a52", "#8c8c4f"] }, { k: "pot", label: "Pot", options: ["#8c5a3c", "#6b4a2f", "#a34a2c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M5 11h11v3a5 5 0 0 1-10 0zM16 12h2a2.5 2.5 0 0 1 0 5h-2M8 7c0-2 3-2 3-4M12 7c0-2 3-2 3-4" })),
    cams: ["zoomOut", "pushU", "zoomIn", "pushL", "drop", "pushR"], camMul: 3, camOff: 1,
    mag: { rot: 0.3, driftX: 4, driftY: 6, inn: 0.3, driftZ: 0.03 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.1,
    look: {
      hook: { bg: "porcelain", fg: "ink", hi: "matcha", world: true, top: 340, size: 118, kicker: { v: "bare", c: "pot" } },
      statement: { bg: "matcha", fg: "porcelain", hi: "ink", world: false, top: 630, size: 144 },
      feature: { bg: "porcelain", fg: "ink", hi: "matcha", world: true, top: 250, size: 94, card: { v: "frame", bg: "ink", r: 20, line: "porcelain" }, chips: { v: "outline", colors: ["matcha", "pot"], text: "porcelain" } },
      montage: { bg: "ink", fg: "porcelain", hi: "gold", world: false, top: 258, size: 90, tile: { bg: "porcelain", line: "ink", label: "porcelain", r: 16 }, tilts: [-1.5, 1, 1.5, -1] },
      stats: { bg: "porcelain", fg: "ink", hi: "matcha", world: true, cols: ["matcha", "pot", "gold"], num: 146 },
      cta: { bg: "ink", fg: "porcelain", hi: "gold", world: false, top: 500, size: 114, btn: { v: "pill", bg: "matcha", c: "porcelain" }, logoShape: "circle" },
      app: { bg: "porcelain", fg: "ink", hi: "matcha", cardBg: "#fdfaf3", line: "ink", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("g", { transform: "translate(" + (u.W - 240) + "," + (u.H - 300) + ")" },
        R("path", { d: "M -90 0 a 90 64 0 0 0 180 0 z", fill: theme.matcha }),
        R("ellipse", { rx: 90, ry: 18, fill: rgba(theme.ink, 0.25) }),
        R("path", { d: "M -20 -30 q 24 -70 -8 -140 q -22 -50 8 -100", fill: "none", stroke: rgba(theme.ink, 0.25), strokeWidth: 9, strokeLinecap: "round", transform: "translate(0," + (-Math.abs(Math.sin(t * 0.7)) * 12) + ")" })),
      [0, 1, 2].map((i) => {
        const sway = Math.sin(t * 0.8 + i * 0.9) * 8;
        return R("g", { key: i, transform: "translate(" + (100 + i * 66) + ",0) rotate(" + sway + " " + (100 + i * 66) + " " + u.H + ")" },
          R("line", { x1: 0, y1: u.H - 620, x2: 0, y2: u.H, stroke: rgba(theme.matcha, 0.55 - i * 0.12), strokeWidth: 14 - i * 3 }),
          [0.3, 0.55, 0.8].map((f, j) => R("line", { key: j, x1: 0, y1: u.H - 620 * f, x2: 0.1, y2: u.H - 620 * f, stroke: rgba(theme.ink, 0.4), strokeWidth: 16 - i * 3, strokeLinecap: "round" })),
          [0.35, 0.62].map((f, j) => R("path", { key: "l" + j, d: "M 0 " + (u.H - 620 * f) + " q 30 -18 60 -8", fill: "none", stroke: rgba(theme.matcha, 0.5), strokeWidth: 5, strokeLinecap: "round" })));
      }),
      R("circle", { cx: 180, cy: 260, r: 60, fill: "none", stroke: rgba(theme.gold, 0.4), strokeWidth: 3, strokeDasharray: "377", strokeDashoffset: String(377 * (1 - u.seg(p, 0.1, 0.8))) }),
      R("text", { x: 180, y: 272, textAnchor: "middle", fontFamily: '"Marcellus", serif', fontSize: 34, fill: rgba(theme.ink, 0.55) }, "\u8336")),
  });

  /* ---- Darkroom Dev: safelight glow, hanging film strips, tray ripples ---- */
  FilmKit.make({
    global: "DarkroomDev", variants: { Typing: "terminal", Ring: "bar", Scroll: "stack", Notify: "side" },
    brand: "Darkroom Dev", desk: "#0e0b0a", ambient: 1.6,
    FH: '"Syne", sans-serif', FB: '"Hanken Grotesk", sans-serif',
    palette: (t) => ({ dark: t.dark || "#14100e", safe: t.safe || "#e2483d", amber: "#e89b3c", grey: "#cfc9bd", paper: "#f4f1ea" }),
    tweaks: [{ k: "dark", label: "Room", options: ["#14100e", "#100e14", "#12120c"] }, { k: "safe", label: "Safelight", options: ["#e2483d", "#e2743d", "#c23d5e"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5 }, R2("rect", { x: 3, y: 6, width: 18, height: 12, rx: 2 }), R2("path", { d: "M7 6v12M17 6v12M3 10h4M3 14h4M17 10h4M17 14h4" })),
    cams: ["zoomIn", "pushL", "pushD", "zoomOut", "pushR", "hopU"], camMul: 7, camOff: 3,
    mag: { rot: 0.6, inn: 0.22 }, titlePreset: "machete", itemPreset: "rise",
    look: {
      hook: { bg: "dark", fg: "grey", hi: "safe", world: true, top: 320, size: 122, upper: true, kicker: { v: "outline", c: "safe" } },
      statement: { bg: "safe", fg: "paper", hi: "dark", world: false, top: 630, size: 148, upper: true },
      feature: { bg: "dark", fg: "grey", hi: "amber", world: true, top: 250, size: 96, upper: true, card: { v: "glow", bg: "#0d0a09", glow: "safe", r: 14, line: "grey" }, chips: { v: "square", colors: ["safe", "amber", "grey"], text: "dark" } },
      montage: { bg: "#0d0a09", fg: "grey", hi: "safe", world: false, top: 258, size: 92, upper: true, tile: { bg: "dark", line: "grey", label: "amber", r: 10, glow: "safe" }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "dark", fg: "grey", hi: "safe", world: true, cols: ["safe", "amber", "grey"], num: 150, upper: true, glowNums: true },
      cta: { bg: "#0d0a09", fg: "grey", hi: "safe", world: true, top: 500, size: 118, upper: true, btn: { v: "glow", bg: "safe", c: "paper" }, logoShape: "rounded" },
      app: { bg: "dark", fg: "grey", hi: "safe", cardBg: "#1c1512", line: "grey", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("circle", { cx: u.W - 170, cy: 210, r: 40 + Math.sin(t * 1.6) * 6, fill: rgba(theme.safe, 0.8) }),
      R("circle", { cx: u.W - 170, cy: 210, r: 110 + Math.sin(t * 1.6) * 18, fill: rgba(theme.safe, 0.12) }),
      R("line", { x1: 60, y1: 260, x2: u.W - 320, y2: 260, stroke: rgba(theme.grey, 0.4), strokeWidth: 3 }),
      [0, 1, 2].map((i) => {
        const sway = Math.sin(t * 0.9 + i * 1.2) * 5;
        return R("g", { key: i, transform: "translate(" + (150 + i * 190) + ",260) rotate(" + sway + ")" },
          R("rect", { x: -3, y: 0, width: 6, height: 30, fill: rgba(theme.grey, 0.5) }),
          R("rect", { x: -34, y: 30, width: 68, height: 190 + i * 30, fill: rgba(theme.grey, 0.16), stroke: rgba(theme.grey, 0.4), strokeWidth: 2 }),
          Array.from({ length: 5 }).map((_, f) => R("rect", { key: f, x: -26, y: 44 + f * (36 + i * 6), width: 52, height: 26 + i * 4, fill: rgba(theme.amber, 0.14) })),
          Array.from({ length: 8 }).map((_, h) => R("rect", { key: "h" + h, x: -33, y: 36 + h * 24, width: 5, height: 10, fill: rgba(theme.dark, 0.8) })));
      }),
      (function () {
        const rp = (t * 0.6) % 1;
        return R("g", { transform: "translate(220," + (u.H - 240) + ")" },
          R("rect", { x: -150, y: -20, width: 300, height: 70, rx: 10, fill: "none", stroke: rgba(theme.grey, 0.4), strokeWidth: 4 }),
          R("ellipse", { rx: 40 + rp * 90, ry: 10 + rp * 22, fill: "none", stroke: rgba(theme.safe, 0.5 * (1 - rp)), strokeWidth: 3, cy: 14 }),
          R("ellipse", { rx: 20 + rp * 60, ry: 5 + rp * 15, fill: "none", stroke: rgba(theme.safe, 0.35 * (1 - rp)), strokeWidth: 2, cy: 14 }));
      })()),
  });
})();
