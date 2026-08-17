/* mega-pack-1.js — Ember Roast, Sole Drop, Abyss Dive, Hive & Honey, Groove Crate,
   Midnight Ramen, Kickflip Co, Star Watch, Lift Off, Endgame */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ---- Ember Roast: coffee roastery — steam curls, rotating drum, falling beans ---- */
  FilmKit.make({
    global: "EmberRoast", variants: { Ring: "gauge", Scroll: "board", Toggle: "switch", Morph: "fade" },
    brand: "Ember Roast", desk: "#201510", ambient: 1.7,
    FH: '"Alfa Slab One", serif', FB: '"Karla", sans-serif',
    palette: (t) => ({ roast: t.roast || "#2b1d16", cream: "#f3e9dc", ember: t.ember || "#e0662c", gold: "#caa465", ink: "#1c110c" }),
    tweaks: [{ k: "roast", label: "Roast", options: ["#2b1d16", "#231a20", "#1f2018"] }, { k: "ember", label: "Ember", options: ["#e0662c", "#c94f3d", "#d98e32"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M17 8h1a3 3 0 0 1 0 6h-1M4 8h13v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM8 2v3M12 2v3" })),
    cams: ["pushL", "zoomIn", "hopU", "pushR", "zoomOut", "drop"], camMul: 5, camOff: 1,
    mag: { rot: 0.9, driftX: 7, driftY: 8 }, titlePreset: "slam", itemPreset: "pop",
    look: {
      hook: { bg: "roast", fg: "cream", hi: "ember", world: true, top: 320, size: 126, upper: true, kicker: { v: "pill", bg: "ember", c: "ink" } },
      statement: { bg: "ink", fg: "cream", hi: "gold", world: false, top: 630, size: 152, upper: true },
      feature: { bg: "roast", fg: "cream", hi: "ember", world: true, top: 250, size: 100, upper: true, card: { v: "tilt", bg: "ink", r: 20, line: "cream" }, chips: { v: "pill", colors: ["ember", "gold"], text: "ink" } },
      montage: { bg: "ink", fg: "cream", hi: "ember", world: false, top: 258, size: 96, upper: true, tile: { bg: "roast", line: "cream", label: "gold", r: 16 }, tilts: [-2.5, 2, 1.5, -2] },
      stats: { bg: "roast", fg: "cream", hi: "ember", world: true, cols: ["ember", "gold", "cream"], num: 154, upper: true },
      cta: { bg: "ember", fg: "ink", hi: "cream", world: false, top: 490, size: 124, upper: true, btn: { v: "pill", bg: "ink", c: "cream" }, logoShape: "circle" },
      app: { bg: "roast", fg: "cream", hi: "ember", cardBg: "#231710", line: "cream", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1, 2].map((i) => {
        const ph = (t * 0.24 + i * 0.33) % 1, x = 180 + i * 330;
        return R("path", { key: i, d: "M " + x + " " + (u.H - 300 - ph * 700) + " q 30 -60 0 -120 q -30 -60 0 -120", fill: "none", stroke: rgba(theme.cream, 0.16 * (1 - ph)), strokeWidth: 14, strokeLinecap: "round" });
      }),
      R("g", { transform: "translate(" + (u.W - 210) + "," + (u.H - 330) + ")" },
        R("circle", { r: 120, fill: "none", stroke: rgba(theme.gold, 0.5), strokeWidth: 10 }),
        Array.from({ length: 8 }).map((_, i) => R("line", { key: i, x1: Math.cos(t * 1.4 + i * Math.PI / 4) * 60, y1: Math.sin(t * 1.4 + i * Math.PI / 4) * 60, x2: Math.cos(t * 1.4 + i * Math.PI / 4) * 104, y2: Math.sin(t * 1.4 + i * Math.PI / 4) * 104, stroke: rgba(theme.ember, 0.6), strokeWidth: 8, strokeLinecap: "round" })),
        R("circle", { r: 30, fill: theme.ember })),
      Array.from({ length: 7 }).map((_, i) => {
        const ph = (t * 0.3 + i * 0.14) % 1;
        return R("ellipse", { key: "b" + i, cx: 90 + i * 150, cy: ph * u.H, rx: 12, ry: 17, fill: rgba(theme.gold, 0.35 * (1 - ph) + 0.1), transform: "rotate(" + (ph * 260 + i * 40) + " " + (90 + i * 150) + " " + ph * u.H + ")" });
      })),
  });

  /* ---- Sole Drop: sneaker release — speed lines, tread zigzag, bouncing ball ---- */
  FilmKit.make({
    global: "SoleDrop", variants: { Cursor: "keys", Notify: "pop", Swipe: "swipe", Ring: "bar" },
    brand: "SOLE DROP", desk: "#0c0c10", ambient: 2.0,
    FH: '"Archivo Black", sans-serif', FB: '"Archivo", sans-serif',
    palette: (t) => ({ court: t.court || "#101014", volt: t.volt || "#d4f24b", chalk: "#f4f4f2", flame: "#ff5a36", ink: "#0a0a0c" }),
    tweaks: [{ k: "court", label: "Court", options: ["#101014", "#14101c", "#0f1410"] }, { k: "volt", label: "Volt", options: ["#d4f24b", "#4be3f2", "#f24bd4"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M3 15c4 0 6-3 8-3s3 2 7 2c2 0 3 1 3 2v2H3zM7 12l1.5 1.5M10.5 11l1.5 1.5" })),
    cams: ["pushR", "zoomIn", "pushU", "spin", "pushL", "drop"], camMul: 7, camOff: 2,
    mag: { skew: 5, rot: 1.1, inn: 0.17, slide: 0.3 }, titlePreset: "streak", itemPreset: "slam", titleSpace: "0.01em",
    look: {
      hook: { bg: "court", fg: "chalk", hi: "volt", world: true, top: 310, size: 130, upper: true, kicker: { v: "tag", bg: "volt", c: "ink" } },
      statement: { bg: "volt", fg: "ink", hi: "flame", world: false, top: 620, size: 158, upper: true },
      feature: { bg: "court", fg: "chalk", hi: "volt", world: true, top: 246, size: 100, upper: true, card: { v: "frame", bg: "ink", r: 10, line: "chalk" }, chips: { v: "square", colors: ["volt", "flame", "chalk"], text: "ink" } },
      montage: { bg: "ink", fg: "chalk", hi: "volt", world: false, top: 256, size: 96, upper: true, tile: { bg: "court", line: "chalk", label: "volt", r: 8 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "court", fg: "chalk", hi: "volt", world: true, cols: ["volt", "flame", "chalk"], num: 156, upper: true, rule: true },
      cta: { bg: "ink", fg: "chalk", hi: "volt", world: true, top: 490, size: 126, upper: true, btn: { v: "block", bg: "volt", c: "ink" }, logoShape: "rounded" },
      app: { bg: "court", fg: "chalk", hi: "volt", cardBg: "#16161c", line: "chalk", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1, 2, 3].map((i) => R("line", { key: i, x1: -100 + ((t * 500 + i * 300) % (u.W + 400)), y1: 160 + i * 90, x2: 60 + ((t * 500 + i * 300) % (u.W + 400)), y2: 160 + i * 90, stroke: rgba(theme.volt, 0.5 - i * 0.09), strokeWidth: 10 - i * 2, strokeLinecap: "round" })),
      R("path", { d: "M -20 " + (u.H - 260) + " " + Array.from({ length: 12 }).map((_, i) => "l 60 " + (i % 2 ? 44 : -44)).join(" "), fill: "none", stroke: rgba(theme.flame, 0.45), strokeWidth: 12, strokeLinecap: "round", strokeLinejoin: "round" }),
      (function () {
        const bt = (t * 0.9) % 1, bx = bt * u.W;
        const by = u.H - 420 - Math.abs(Math.sin(bt * Math.PI * 3)) * 260;
        return R("g", null,
          R("circle", { cx: bx, cy: by, r: 30, fill: theme.flame }),
          R("path", { d: "M " + (bx - 30) + " " + by + " a 30 30 0 0 1 60 0 M " + bx + " " + (by - 30) + " a 30 30 0 0 0 0 60", fill: "none", stroke: theme.ink, strokeWidth: 4 }));
      })(),
      R("text", { x: u.W - 40, y: 220, textAnchor: "end", fontFamily: '"Archivo Black", sans-serif', fontSize: 150, fill: "none", stroke: rgba(theme.chalk, 0.14), strokeWidth: 2 }, String(Math.floor(t * 2) % 100).padStart(2, "0"))),
  });

  /* ---- Abyss Dive: deep sea — bubbles, jellyfish, angler light, depth ruler ---- */
  FilmKit.make({
    global: "AbyssDive", variants: { Ring: "ring", Scroll: "feed", Typing: "terminal", Notify: "side" },
    brand: "Abyss Dive", desk: "#03111a", ambient: 1.4,
    FH: '"Krona One", sans-serif', FB: '"Overpass", sans-serif',
    palette: (t) => ({ deep: t.deep || "#061c26", glow: t.glow || "#35d0d6", coral: "#ff7e67", sand: "#e8d9b0", ink: "#04141c" }),
    tweaks: [{ k: "deep", label: "Depth", options: ["#061c26", "#081426", "#062622"] }, { k: "glow", label: "Biolume", options: ["#35d0d6", "#5ee08a", "#8f7ae0"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("circle", { cx: 12, cy: 12, r: 8 }), R2("circle", { cx: 12, cy: 12, r: 3 }), R2("path", { d: "M12 4v-2M12 22v-2" })),
    cams: ["zoomOut", "pushD", "drop", "pushL", "zoomIn", "pushU"], camMul: 5, camOff: 3,
    mag: { rot: 0.4, driftY: 12, driftX: 9, inn: 0.3, driftZ: 0.04 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.12,
    look: {
      hook: { bg: "deep", fg: "sand", hi: "glow", world: true, top: 340, size: 108, upper: true, kicker: { v: "outline", c: "glow" } },
      statement: { bg: "ink", fg: "sand", hi: "coral", world: true, top: 640, size: 132, upper: true },
      feature: { bg: "deep", fg: "sand", hi: "glow", world: true, top: 250, size: 88, upper: true, card: { v: "glow", bg: "ink", glow: "glow", r: 26, line: "sand" }, chips: { v: "pill", colors: ["glow", "coral"], text: "ink" } },
      montage: { bg: "ink", fg: "sand", hi: "glow", world: true, top: 258, size: 86, upper: true, tile: { bg: "#07222e", line: "sand", label: "glow", r: 20, glow: "glow" }, tilts: [-1.5, 1, 1.5, -1] },
      stats: { bg: "deep", fg: "sand", hi: "glow", world: true, cols: ["glow", "coral", "sand"], num: 146, upper: true, glowNums: true },
      cta: { bg: "ink", fg: "sand", hi: "glow", world: true, top: 500, size: 106, upper: true, btn: { v: "glow", bg: "glow", c: "ink" }, logoShape: "circle" },
      app: { bg: "deep", fg: "sand", hi: "glow", cardBg: "#07202c", line: "sand", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      Array.from({ length: 10 }).map((_, i) => {
        const ph = (t * (0.1 + (i % 4) * 0.05) + i * 0.1) % 1;
        return R("circle", { key: i, cx: (i * 117 + 40) % u.W + Math.sin(t + i) * 20, cy: u.H - ph * (u.H + 100), r: 5 + (i % 3) * 5, fill: "none", stroke: rgba(theme.glow, 0.35 * (1 - ph) + 0.08), strokeWidth: 3 });
      }),
      (function () {
        const jx = u.W * 0.72 + Math.sin(t * 0.5) * 60, jy = 360 + Math.cos(t * 0.4) * 50;
        return R("g", { transform: "translate(" + jx + "," + jy + ")", opacity: 0.75 },
          R("path", { d: "M -60 0 a 60 60 0 0 1 120 0 q -12 " + (16 + Math.sin(t * 2.2) * 10) + " -30 0 q -15 " + (20 + Math.cos(t * 2) * 8) + " -30 0 q -15 " + (16 + Math.sin(t * 2.4) * 10) + " -30 0 q -18 14 -30 0 Z", fill: rgba(theme.coral, 0.5) }),
          [0, 1, 2].map((i) => R("path", { key: i, d: "M " + (-30 + i * 30) + " 20 q " + (Math.sin(t * 1.8 + i) * 18) + " 60 0 120", fill: "none", stroke: rgba(theme.coral, 0.4), strokeWidth: 5, strokeLinecap: "round" })));
      })(),
      R("circle", { cx: 170, cy: u.H - 480, r: 15 + Math.sin(t * 3) * 5, fill: rgba(theme.glow, 0.7 + Math.sin(t * 3) * 0.25) }),
      R("path", { d: "M 170 " + (u.H - 480) + " q -50 40 -40 110", fill: "none", stroke: rgba(theme.sand, 0.3), strokeWidth: 6, strokeLinecap: "round" }),
      Array.from({ length: 5 }).map((_, i) => R("g", { key: "r" + i },
        R("line", { x1: u.W - 60, y1: 200 + i * 180, x2: u.W - 30, y2: 200 + i * 180, stroke: rgba(theme.sand, 0.4), strokeWidth: 4 }),
        R("text", { x: u.W - 70, y: 208 + i * 180, textAnchor: "end", fontFamily: '"Overpass", sans-serif', fontSize: 22, fill: rgba(theme.sand, 0.4) }, (i + 1) * 100 + "m")))),
  });

  /* ---- Hive & Honey: hex comb pop-in, bees on figure-8, honey drip ---- */
  FilmKit.make({
    global: "HiveHoney", variants: { Toggle: "check", Ring: "gauge", DragDrop: "drag", Morph: "roll" },
    brand: "Hive & Honey", desk: "#5c3d12", ambient: 1.8,
    FH: '"Fredoka", sans-serif', FB: '"Quicksand", sans-serif',
    palette: (t) => ({ honey: t.honey || "#f7c948", comb: "#7a4f16", cream: t.cream || "#fff8e8", ink: "#3a2c14", leaf: "#8aa34f" }),
    tweaks: [{ k: "honey", label: "Honey", options: ["#f7c948", "#f2a83b", "#e8d44d"] }, { k: "cream", label: "Cream", options: ["#fff8e8", "#fdf3d9", "#f6efe2"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinejoin: "round" }, R2("path", { d: "M12 3l6 3.5v7L12 17l-6-3.5v-7zM12 17v4" })),
    cams: ["hopU", "pushR", "zoomIn", "pushL", "drop", "zoomOut"], camMul: 3, camOff: 1,
    mag: { rot: 1.3, driftX: 9 }, titlePreset: "bounce", itemPreset: "pop", titleLine: 1.08,
    look: {
      hook: { bg: "cream", fg: "ink", hi: "comb", world: true, top: 330, size: 124, kicker: { v: "pill", bg: "honey", c: "ink" } },
      statement: { bg: "honey", fg: "ink", hi: "cream", world: false, top: 630, size: 150 },
      feature: { bg: "cream", fg: "ink", hi: "comb", world: true, top: 250, size: 98, card: { v: "tilt", bg: "comb", r: 24, line: "cream" }, chips: { v: "pill", colors: ["honey", "leaf"], text: "ink" } },
      montage: { bg: "comb", fg: "cream", hi: "honey", world: false, top: 258, size: 94, tile: { bg: "cream", line: "ink", label: "cream", r: 20 }, tilts: [-3, 2.5, 2, -2.5] },
      stats: { bg: "cream", fg: "ink", hi: "comb", world: true, cols: ["comb", "leaf", "ink"], num: 152 },
      cta: { bg: "ink", fg: "cream", hi: "honey", world: false, top: 500, size: 122, btn: { v: "pill", bg: "honey", c: "ink" }, logoShape: "circle" },
      app: { bg: "cream", fg: "ink", hi: "comb", cardBg: "#ffffff", line: "ink", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      (function () {
        const hex = (cx, cy, r) => { let d = ""; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 6; d += (i ? "L" : "M") + (cx + Math.cos(a) * r) + " " + (cy + Math.sin(a) * r) + " "; } return d + "Z"; };
        const cells = [[u.W - 160, 220], [u.W - 60, 280], [u.W - 160, 340], [u.W - 260, 280], [u.W - 60, 400], [u.W - 160, 460]];
        return R("g", null, cells.map(([x, y], i) => {
          const e = u.ease.outBack(u.clamp01(u.seg(p, 0.05 + i * 0.06, 0.25 + i * 0.06)));
          return R("path", { key: i, d: hex(x, y, 62), fill: i % 2 ? rgba(theme.honey, 0.55) : "none", stroke: theme.comb, strokeWidth: 5, opacity: e, transform: "scale(" + e + ")", "transform-origin": x + "px " + y + "px" });
        }));
      })(),
      [0, 1].map((i) => {
        const a = t * (1.1 + i * 0.3) + i * 2.4;
        const bx = 260 + Math.sin(a) * 170, by = u.H - 620 + Math.sin(a * 2) * 90;
        return R("g", { key: "bee" + i, transform: "translate(" + bx + "," + by + ") rotate(" + Math.cos(a) * 24 + ")" },
          R("ellipse", { rx: 26, ry: 18, fill: theme.honey, stroke: theme.ink, strokeWidth: 4 }),
          R("path", { d: "M -8 -16 v32 M 6 -17 v34", stroke: theme.ink, strokeWidth: 5 }),
          R("ellipse", { cx: -4, cy: -22, rx: 14, ry: 9, fill: rgba("#ffffff", 0.75) }));
      }),
      (function () {
        const dr = (t * 0.4) % 1;
        return R("g", null,
          R("path", { d: "M 100 " + (u.H - 360) + " h 150", stroke: theme.comb, strokeWidth: 10, strokeLinecap: "round" }),
          R("circle", { cx: 175, cy: u.H - 350 + dr * 220, r: 13 * (1 - dr * 0.4), fill: theme.honey, opacity: 1 - dr * 0.7 }));
      })()),
  });

  /* ---- Groove Crate: record store — spinning grooves, tonearm, crate cards ---- */
  FilmKit.make({
    global: "GrooveCrate", variants: { Scroll: "stack", Cursor: "slider", Morph: "flap", Notify: "drop" },
    brand: "Groove Crate", desk: "#100d13", ambient: 1.9,
    FH: '"Righteous", sans-serif', FB: '"Mulish", sans-serif',
    palette: (t) => ({ wax: t.wax || "#17141a", tang: t.tang || "#ff8c42", rose: "#ff5d8f", cream: "#f2ead9", teal: "#3fb8af" }),
    tweaks: [{ k: "wax", label: "Room", options: ["#17141a", "#1a1414", "#141a18"] }, { k: "tang", label: "Label", options: ["#ff8c42", "#ffd23c", "#b48cff"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5 }, R2("circle", { cx: 12, cy: 12, r: 9 }), R2("circle", { cx: 12, cy: 12, r: 1.5, fill: theme.currentBg })),
    cams: ["spin", "pushL", "zoomIn", "pushD", "pushR", "hopU"], camMul: 7, camOff: 0,
    mag: { rot: 1.4, skew: 2, driftX: 8 }, titlePreset: "stamp", itemPreset: "streak",
    look: {
      hook: { bg: "wax", fg: "cream", hi: "tang", world: true, top: 320, size: 122, upper: true, kicker: { v: "outline", c: "rose" } },
      statement: { bg: "rose", fg: "wax", hi: "cream", world: false, top: 630, size: 150, upper: true },
      feature: { bg: "wax", fg: "cream", hi: "tang", world: true, top: 250, size: 98, upper: true, card: { v: "tilt", bg: "#0f0d11", r: 18, line: "cream" }, chips: { v: "square", colors: ["tang", "rose", "teal"], text: "wax" } },
      montage: { bg: "#0f0d11", fg: "cream", hi: "rose", world: false, top: 258, size: 94, upper: true, tile: { bg: "wax", line: "cream", label: "tang", r: 14 }, tilts: [-3, 2.5, 2, -2.5] },
      stats: { bg: "wax", fg: "cream", hi: "tang", world: true, cols: ["tang", "rose", "teal"], num: 152, upper: true },
      cta: { bg: "teal", fg: "wax", hi: "cream", world: false, top: 500, size: 120, upper: true, btn: { v: "block", bg: "wax", c: "cream" }, logoShape: "circle" },
      app: { bg: "wax", fg: "cream", hi: "tang", cardBg: "#1e1a22", line: "cream", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("g", { transform: "translate(220," + (u.H - 430) + ")" },
        [92, 72, 52].map((r, i) => R("circle", { key: i, r, fill: "none", stroke: rgba(theme.cream, 0.22), strokeWidth: 3 })),
        R("circle", { r: 110, fill: "none", stroke: rgba(theme.cream, 0.35), strokeWidth: 5 }),
        R("circle", { r: 34, fill: theme.tang }),
        R("line", { x1: 0, y1: 0, x2: Math.cos(t * 2.4) * 100, y2: Math.sin(t * 2.4) * 100, stroke: rgba(theme.cream, 0.5), strokeWidth: 4, strokeLinecap: "round" })),
      R("g", { transform: "translate(430," + (u.H - 560) + ") rotate(" + (24 + Math.sin(t * 0.8) * 6) + ")" },
        R("line", { x1: 0, y1: 0, x2: 0, y2: 200, stroke: theme.teal, strokeWidth: 9, strokeLinecap: "round" }),
        R("circle", { r: 16, fill: theme.teal }),
        R("rect", { x: -9, y: 196, width: 18, height: 34, rx: 6, fill: theme.rose })),
      Array.from({ length: 5 }).map((_, i) => R("rect", { key: i, x: u.W - 320 + i * 26, y: 220 - (i % 2) * 8 + Math.sin(t * 1.3 + i) * 6, width: 20, height: 190, rx: 4, fill: rgba([theme.tang, theme.rose, theme.teal, theme.cream][i % 4], 0.55), transform: "rotate(" + (i - 2) * 3 + " " + (u.W - 320 + i * 26) + " 320)" })),
      [0, 1, 2].map((i) => {
        const eq = Math.abs(Math.sin(t * (2 + i * 0.7) + i));
        return R("rect", { key: "q" + i, x: 90 + i * 40, y: 240 - eq * 100, width: 26, height: eq * 100 + 20, rx: 8, fill: rgba(theme.tang, 0.4 + eq * 0.3) });
      })),
  });

  /* ---- Midnight Ramen: steam wisps, noodle waves, swaying noren, chopsticks ---- */
  FilmKit.make({
    global: "MidnightRamen", variants: { Scroll: "board", Typing: "hand", Ring: "ring", Swipe: "flip" },
    brand: "Midnight Ramen", desk: "#120c10", ambient: 1.7,
    FH: '"Kanit", sans-serif', FB: '"Sarabun", sans-serif',
    palette: (t) => ({ broth: t.broth || "#1a1216", chili: t.chili || "#e63946", noodle: "#f4c95d", steam: "#f2e8dc", jade: "#57a773" }),
    tweaks: [{ k: "broth", label: "Night", options: ["#1a1216", "#161219", "#191410"] }, { k: "chili", label: "Chili", options: ["#e63946", "#ff6b35", "#d64570"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M4 11h16a8 8 0 0 1-16 0zM7 8c3-2 7-2 10 0M19 4L9 8" })),
    cams: ["pushU", "zoomIn", "pushL", "drop", "pushR", "zoomOut"], camMul: 5, camOff: 2,
    mag: { rot: 0.7, driftY: 9 }, titlePreset: "flip", itemPreset: "rise", titleSpace: "0.02em",
    look: {
      hook: { bg: "broth", fg: "steam", hi: "chili", world: true, top: 330, size: 124, upper: true, kicker: { v: "tag", bg: "chili", c: "steam" } },
      statement: { bg: "chili", fg: "steam", hi: "noodle", world: false, top: 630, size: 148, upper: true },
      feature: { bg: "broth", fg: "steam", hi: "noodle", world: true, top: 250, size: 98, upper: true, card: { v: "frame", bg: "#120d11", r: 16, line: "steam" }, chips: { v: "pill", colors: ["chili", "jade", "noodle"], text: "broth" } },
      montage: { bg: "#120d11", fg: "steam", hi: "chili", world: false, top: 258, size: 94, upper: true, tile: { bg: "broth", line: "steam", label: "noodle", r: 12 }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "broth", fg: "steam", hi: "chili", world: true, cols: ["chili", "noodle", "jade"], num: 152, upper: true },
      cta: { bg: "noodle", fg: "broth", hi: "chili", world: false, top: 500, size: 120, upper: true, btn: { v: "block", bg: "broth", c: "steam" }, logoShape: "rounded" },
      app: { bg: "broth", fg: "steam", hi: "chili", cardBg: "#221419", line: "steam", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1, 2].map((i) => {
        const ph = (t * 0.3 + i * 0.33) % 1;
        return R("path", { key: i, d: "M " + (u.W / 2 - 140 + i * 140) + " " + (u.H - 200 - ph * 800) + " q -26 -50 0 -100 q 26 -50 0 -100", fill: "none", stroke: rgba(theme.steam, 0.2 * (1 - ph)), strokeWidth: 16, strokeLinecap: "round" });
      }),
      [0, 1, 2].map((i) => R("path", { key: "n" + i, d: "M -20 " + (u.H - 300 + i * 46) + " " + Array.from({ length: 7 }).map((_, s) => "q 80 " + (s % 2 ? 40 : -40) + " 160 0").join(" "), fill: "none", stroke: rgba(theme.noodle, 0.4 - i * 0.09), strokeWidth: 12, strokeLinecap: "round", transform: "translate(" + (-((t * 90 + i * 100) % 320)) + ",0)" })),
      [0, 1, 2].map((i) => R("g", { key: "f" + i, transform: "translate(" + (140 + i * 180) + ",120) rotate(" + Math.sin(t * 1.1 + i * 0.8) * 5 + ")" },
        R("rect", { x: -70, y: 0, width: 140, height: 150, rx: 6, fill: i === 1 ? rgba(theme.chili, 0.75) : rgba(theme.broth === "#1a1216" ? "#2a1d24" : "#2a1d24", 0.9), stroke: rgba(theme.steam, 0.3), strokeWidth: 3 }),
        R("circle", { cy: 74, r: 26, fill: "none", stroke: rgba(theme.steam, 0.6), strokeWidth: 5 }))),
      R("g", { transform: "translate(" + (u.W - 200) + "," + (u.H - 560) + ") rotate(" + (-32 + Math.sin(t) * 4) + ")" },
        R("line", { x1: 0, y1: 0, x2: 0, y2: 260, stroke: theme.jade, strokeWidth: 10, strokeLinecap: "round" }),
        R("line", { x1: 26, y1: 10, x2: 26, y2: 260, stroke: theme.jade, strokeWidth: 10, strokeLinecap: "round" }))),
  });

  /* ---- Kickflip Co: halfpipe curve, skater dot with flip, spray splat ---- */
  FilmKit.make({
    global: "KickflipCo", variants: { Cursor: "keys", Ring: "bar", Notify: "pop", Morph: "roll" },
    brand: "KICKFLIP CO", desk: "#c9c5bc", ambient: 2.0,
    FH: '"Bungee", sans-serif', FB: '"Rubik", sans-serif',
    palette: (t) => ({ crete: t.crete || "#d8d4cc", ink: "#191a1c", safety: t.safety || "#ff4d00", sky: "#4fa3d1", grip: "#2e2e30" }),
    tweaks: [{ k: "crete", label: "Concrete", options: ["#d8d4cc", "#cfd4d8", "#d8cfc4"] }, { k: "safety", label: "Deck", options: ["#ff4d00", "#7a3df0", "#00a878"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M3 12c2 3 4 4 9 4s7-1 9-4M7 16v2M17 16v2" }), R2("circle", { cx: 7, cy: 20, r: 1.5 }), R2("circle", { cx: 17, cy: 20, r: 1.5 })),
    cams: ["pushL", "spin", "pushR", "zoomIn", "hopU", "drop"], camMul: 7, camOff: 1,
    mag: { skew: 6, rot: 1.5, inn: 0.16 }, titlePreset: "slam", itemPreset: "slam", titleSpace: "0.01em",
    look: {
      hook: { bg: "crete", fg: "ink", hi: "safety", world: true, top: 300, size: 118, upper: true, kicker: { v: "tag", bg: "ink", c: "crete" } },
      statement: { bg: "ink", fg: "crete", hi: "safety", world: false, top: 620, size: 148, upper: true },
      feature: { bg: "crete", fg: "ink", hi: "safety", world: true, top: 246, size: 94, upper: true, card: { v: "frame", bg: "ink", r: 8, line: "crete" }, chips: { v: "square", colors: ["safety", "ink", "sky"], text: "crete" } },
      montage: { bg: "ink", fg: "crete", hi: "safety", world: false, top: 256, size: 92, upper: true, tile: { bg: "grip", line: "crete", label: "safety", r: 6 }, tilts: [-4, 3, 2.5, -3] },
      stats: { bg: "crete", fg: "ink", hi: "safety", world: true, cols: ["safety", "ink", "sky"], num: 150, upper: true, rule: true },
      cta: { bg: "safety", fg: "ink", hi: "crete", world: false, top: 490, size: 116, upper: true, btn: { v: "block", bg: "ink", c: "crete" }, logoShape: "rounded" },
      app: { bg: "crete", fg: "ink", hi: "safety", cardBg: "#e6e2da", line: "ink", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("path", { d: "M -20 " + (u.H - 560) + " q 0 260 260 260 h 520 q 260 0 260 -260", fill: "none", stroke: rgba(theme.ink, 0.35), strokeWidth: 12 }),
      (function () {
        const ph = (Math.sin(t * 0.9) + 1) / 2;
        const sx = 120 + ph * (u.W - 240);
        const sy = u.H - 320 - Math.abs(Math.sin(ph * Math.PI)) * 20 - (ph < 0.15 || ph > 0.85 ? Math.abs(Math.sin(t * 0.9)) * 200 : 0);
        return R("g", { transform: "translate(" + sx + "," + sy + ") rotate(" + Math.sin(t * 3) * ((ph < 0.2 || ph > 0.8) ? 160 : 8) + ")" },
          R("rect", { x: -52, y: -10, width: 104, height: 16, rx: 8, fill: theme.safety }),
          R("circle", { cx: -30, cy: 14, r: 10, fill: theme.ink }),
          R("circle", { cx: 30, cy: 14, r: 10, fill: theme.ink }));
      })(),
      R("g", { transform: "translate(" + (u.W - 190) + ",230) rotate(-8)" },
        R("path", { d: "M0 0 l40 12 l-38 14 l42 10 l-40 16", fill: "none", stroke: theme.safety, strokeWidth: 10, strokeLinecap: "round", strokeLinejoin: "round" }),
        R("circle", { cx: 66, cy: 60, r: 7, fill: theme.safety })),
      Array.from({ length: 4 }).map((_, i) => R("circle", { key: i, cx: 90 + i * 60, cy: 200 + (i % 2) * 34, r: 5 + (i % 2) * 3, fill: rgba(theme.ink, 0.3) }))),
  });

  /* ---- Star Watch: constellation draw, telescope, meteor streak ---- */
  FilmKit.make({
    global: "StarWatch", variants: { Ring: "gauge", Scroll: "ticker", Typing: "caret", Notify: "side" },
    brand: "Star Watch", desk: "#05081a", ambient: 1.4,
    FH: '"Prata", serif', FB: '"Manrope", sans-serif',
    palette: (t) => ({ midnight: t.midnight || "#0b1026", star: t.star || "#ffd97b", lilac: "#9a8fd0", paper: "#ece9f4", ink: "#070b1c" }),
    tweaks: [{ k: "midnight", label: "Sky", options: ["#0b1026", "#0d0a20", "#081420"] }, { k: "star", label: "Star", options: ["#ffd97b", "#9be8ff", "#ffb3c6"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: theme.currentBg }, R2("path", { d: "M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" })),
    cams: ["zoomOut", "pushU", "drop", "pushL", "zoomIn", "pushR"], camMul: 5, camOff: 0,
    mag: { rot: 0.3, driftY: 10, inn: 0.3, driftZ: 0.035 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.1,
    look: {
      hook: { bg: "midnight", fg: "paper", hi: "star", world: true, top: 840, size: 118, kicker: { v: "bare", c: "lilac" } },
      statement: { bg: "ink", fg: "paper", hi: "lilac", world: true, top: 640, size: 142 },
      feature: { bg: "midnight", fg: "paper", hi: "star", world: true, top: 250, size: 94, card: { v: "glow", bg: "ink", glow: "star", r: 22, line: "paper" }, chips: { v: "outline", colors: ["star", "lilac"], text: "ink" } },
      montage: { bg: "ink", fg: "paper", hi: "star", world: true, top: 258, size: 92, tile: { bg: "#0d1230", line: "paper", label: "lilac", r: 16, glow: "lilac" }, tilts: [-1, 1.5, 1, -1.5] },
      stats: { bg: "midnight", fg: "paper", hi: "star", world: true, cols: ["star", "lilac", "paper"], num: 148, glowNums: true },
      cta: { bg: "ink", fg: "paper", hi: "star", world: true, top: 500, size: 116, btn: { v: "glow", bg: "star", c: "ink" }, logoShape: "circle" },
      app: { bg: "midnight", fg: "paper", hi: "star", cardBg: "#0e1330", line: "paper", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      Array.from({ length: 26 }).map((_, i) => R("circle", { key: i, cx: (i * 157 + 60) % u.W, cy: (i * 263 + 40) % (u.H * 0.8), r: 1.4 + (i % 3), fill: rgba(theme.paper, 0.25 + 0.55 * Math.abs(Math.sin(t * 1.4 + i * 2.1))) })),
      (function () {
        const pts = [[200, 300], [330, 240], [470, 310], [560, 210], [700, 260]];
        const len = 700, draw = u.seg(p, 0.1, 0.7);
        return R("g", null,
          R("path", { d: pts.map(([x, y], i) => (i ? "L" : "M") + x + " " + y).join(" "), fill: "none", stroke: rgba(theme.star, 0.5), strokeWidth: 3, strokeDasharray: String(len), strokeDashoffset: String(len * (1 - draw)) }),
          pts.map(([x, y], i) => R("circle", { key: i, cx: x, cy: y, r: 6, fill: theme.star, opacity: draw * pts.length > i ? 1 : 0.2 })));
      })(),
      (function () {
        const mp = (t * 0.23) % 1.4;
        return mp < 1 ? R("line", { x1: u.W - mp * 900, y1: 140 + mp * 300, x2: u.W - mp * 900 + 130, y2: 140 + mp * 300 - 44, stroke: rgba(theme.paper, 0.8 * (1 - mp)), strokeWidth: 4, strokeLinecap: "round" }) : null;
      })(),
      R("g", { transform: "translate(150," + (u.H - 260) + ")" },
        R("line", { x1: 0, y1: 0, x2: 150, y2: -120, stroke: theme.lilac, strokeWidth: 16, strokeLinecap: "round" }),
        R("path", { d: "M -50 0 L 50 0 L 20 80 L -20 80 Z", fill: theme.lilac, opacity: 0.8 }),
        R("circle", { cx: 160, cy: -128, r: 12, fill: theme.star }))),
  });

  /* ---- Lift Off: hot-air balloon rising, gore stripes, drifting clouds ---- */
  FilmKit.make({
    global: "LiftOff", variants: { Ring: "bar", Toggle: "switch", Morph: "fade", Cursor: "slider" },
    brand: "Lift Off", desk: "#d8b49b", ambient: 1.6,
    FH: '"Chonburi", serif', FB: '"Prompt", sans-serif',
    palette: (t) => ({ dawn: t.dawn || "#f6d8c3", balloon: t.balloon || "#d95d39", basket: "#7a5230", sky: "#9fc4d8", ink: "#33232a" }),
    tweaks: [{ k: "dawn", label: "Dawn", options: ["#f6d8c3", "#f2e0cb", "#e8d2d8"] }, { k: "balloon", label: "Balloon", options: ["#d95d39", "#b3452e", "#c2477e"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M12 2a7 7 0 0 1 7 7c0 4-4 6-7 9-3-3-7-5-7-9a7 7 0 0 1 7-7zM10 21h4" })),
    cams: ["pushU", "zoomOut", "hopU", "pushL", "drop", "pushR"], camMul: 5, camOff: 3,
    mag: { rot: 0.6, driftY: 11, driftZ: 0.05 }, titlePreset: "rise", itemPreset: "rise", titleLine: 1.1,
    look: {
      hook: { bg: "dawn", fg: "ink", hi: "balloon", world: true, top: 330, size: 120, kicker: { v: "outline", c: "balloon" } },
      statement: { bg: "sky", fg: "ink", hi: "balloon", world: false, top: 630, size: 146 },
      feature: { bg: "dawn", fg: "ink", hi: "balloon", world: true, top: 250, size: 96, card: { v: "frame", bg: "ink", r: 24, line: "dawn" }, chips: { v: "pill", colors: ["balloon", "sky"], text: "dawn" } },
      montage: { bg: "ink", fg: "dawn", hi: "balloon", world: false, top: 258, size: 92, tile: { bg: "dawn", line: "ink", label: "dawn", r: 18 }, tilts: [-2, 2, 1.5, -2.5] },
      stats: { bg: "dawn", fg: "ink", hi: "balloon", world: true, cols: ["balloon", "basket", "ink"], num: 150 },
      cta: { bg: "balloon", fg: "dawn", hi: "ink", world: false, top: 500, size: 118, btn: { v: "pill", bg: "ink", c: "dawn" }, logoShape: "circle" },
      app: { bg: "dawn", fg: "ink", hi: "balloon", cardBg: "#fdf0e4", line: "ink", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      (function () {
        const by = u.H - 560 - u.seg(p, 0, 0.5) * 260 + Math.sin(t * 0.9) * 18;
        const bx = u.W - 260 + Math.sin(t * 0.5) * 30;
        return R("g", { transform: "translate(" + bx + "," + by + ")" },
          R("ellipse", { rx: 120, ry: 140, fill: theme.balloon }),
          [[-80, 0.5], [-40, 0.8], [0, 1], [40, 0.8], [80, 0.5]].map(([ox, w], i) => R("path", { key: i, d: "M " + ox * w + " -138 Q " + ox * 1.4 + " 0 " + ox * w * 0.5 + " 132", fill: "none", stroke: rgba("#ffffff", 0.35), strokeWidth: 5 })),
          R("path", { d: "M -50 120 L -30 180 M 50 120 L 30 180", stroke: theme.basket, strokeWidth: 5 }),
          R("rect", { x: -34, y: 178, width: 68, height: 48, rx: 8, fill: theme.basket }),
          R("circle", { cy: 150, r: 8 + Math.abs(Math.sin(t * 5)) * 7, fill: "#ffb347", opacity: 0.85 }));
      })(),
      [0, 1, 2].map((i) => {
        const cx = ((t * (26 + i * 12) + i * 400) % (u.W + 400)) - 200;
        return R("g", { key: i, transform: "translate(" + cx + "," + (240 + i * 160) + ")", opacity: 0.5 - i * 0.1 },
          R("ellipse", { rx: 110, ry: 34, fill: "#ffffff" }), R("ellipse", { cx: 70, cy: -16, rx: 70, ry: 28, fill: "#ffffff" }));
      }),
      R("path", { d: "M -20 " + (u.H - 140) + " q 200 -70 420 -20 q 300 60 620 -30 L " + (u.W + 20) + " " + (u.H + 20) + " L -20 " + (u.H + 20) + " Z", fill: rgba(theme.basket, 0.25) }),
      [0, 1, 2].map((i) => R("path", { key: "v" + i, d: "M " + (120 + i * 90) + " " + (u.H - 200 + i * 20) + " m -14 0 q 14 -22 28 0", fill: "none", stroke: rgba(theme.ink, 0.4), strokeWidth: 4 }))),
  });

  /* ---- Endgame: chess club — board corner, knight hop, ticking clock ---- */
  FilmKit.make({
    global: "Endgame", variants: { Scroll: "board", Toggle: "check", Typing: "typewriter", Morph: "flap" },
    brand: "Endgame", desk: "#171310", ambient: 1.5,
    FH: '"DM Serif Display", serif', FB: '"DM Sans", sans-serif',
    palette: (t) => ({ board: t.board || "#efe6d8", walnut: "#6b4a2f", ink: "#221c16", check: t.check || "#b3452e", sage: "#7d8c69" }),
    tweaks: [{ k: "board", label: "Board", options: ["#efe6d8", "#e8e4dc", "#f0e2c8"] }, { k: "check", label: "Accent", options: ["#b3452e", "#2e5fb3", "#7a5c9e"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: theme.currentBg }, R2("path", { d: "M8 21h8M9 19h6l-1-5 3-4-3-6-5 3 1 4-2 3z" })),
    cams: ["zoomIn", "pushL", "drop", "pushR", "zoomOut", "hopU"], camMul: 5, camOff: 2,
    mag: { rot: 0.5, inn: 0.26, driftX: 5 }, titlePreset: "drowse", itemPreset: "flip", titleLine: 1.08,
    look: {
      hook: { bg: "board", fg: "ink", hi: "check", world: true, top: 340, size: 122, kicker: { v: "bare", c: "walnut" } },
      statement: { bg: "ink", fg: "board", hi: "check", world: false, top: 630, size: 148 },
      feature: { bg: "board", fg: "ink", hi: "check", world: true, top: 250, size: 96, card: { v: "frame", bg: "walnut", r: 10, line: "board" }, chips: { v: "outline", colors: ["check", "walnut"], text: "board" } },
      montage: { bg: "ink", fg: "board", hi: "check", world: false, top: 258, size: 92, tile: { bg: "board", line: "ink", label: "board", r: 8 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "board", fg: "ink", hi: "check", world: true, cols: ["check", "walnut", "sage"], num: 150 },
      cta: { bg: "walnut", fg: "board", hi: "check", world: false, top: 500, size: 118, btn: { v: "block", bg: "board", c: "ink" }, logoShape: "rounded" },
      app: { bg: "board", fg: "ink", hi: "check", cardBg: "#faf5ec", line: "ink", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      (function () {
        const sq = 84, cells = [];
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if ((r + c) % 2 === 0) cells.push(R("rect", { key: r + "-" + c, x: u.W - 440 + c * sq, y: u.H - 440 + r * sq, width: sq, height: sq, fill: rgba(theme.walnut, 0.3) }));
        return R("g", null, cells, R("rect", { x: u.W - 440, y: u.H - 440, width: sq * 5 + 20, height: sq * 5 + 20, fill: "none", stroke: rgba(theme.walnut, 0.5), strokeWidth: 6, transform: "translate(-10,-10)" }));
      })(),
      (function () {
        const hop = (t * 0.5) % 1;
        const moves = [[0, 0], [1, 2], [3, 3], [2, 1], [0, 0]];
        const mi = Math.min(3, Math.floor(hop * 4)), mf = hop * 4 - mi;
        const ex = u.ease.inOut(u.clamp01(mf));
        const x = u.W - 440 + (moves[mi][0] + (moves[mi + 1][0] - moves[mi][0]) * ex) * 84 + 42;
        const y = u.H - 440 + (moves[mi][1] + (moves[mi + 1][1] - moves[mi][1]) * ex) * 84 + 42 - Math.sin(ex * Math.PI) * 60;
        return R("g", { transform: "translate(" + x + "," + y + ")" },
          R("path", { d: "M -18 26 h36 M -14 20 h28 l-4 -18 8 -12 -10 -18 -16 8 4 14 -8 10 z", fill: theme.check, stroke: theme.ink, strokeWidth: 3, strokeLinejoin: "round" }));
      })(),
      R("g", { transform: "translate(170,240)" },
        R("rect", { x: -90, y: -40, width: 180, height: 90, rx: 10, fill: "none", stroke: rgba(theme.ink, 0.45), strokeWidth: 5 }),
        R("line", { x1: 0, y1: -40, x2: 0, y2: 50, stroke: rgba(theme.ink, 0.45), strokeWidth: 4 }),
        R("line", { x1: -45, y1: 0, x2: -45 + Math.cos(t * 2.2) * 24, y2: Math.sin(t * 2.2) * 24, stroke: theme.check, strokeWidth: 4, strokeLinecap: "round" }),
        R("line", { x1: 45, y1: 0, x2: 45 + Math.cos(t * 0.4 + 2) * 22, y2: Math.sin(t * 0.4 + 2) * 22, stroke: rgba(theme.ink, 0.6), strokeWidth: 4, strokeLinecap: "round" })),
      [0, 1, 2].map((i) => R("text", { key: i, x: 90 + i * 56, y: u.H - 180, fontFamily: '"DM Serif Display", serif', fontSize: 40, fill: rgba(theme.ink, 0.25 + (Math.floor(t * 0.7) % 3 === i ? 0.4 : 0)) }, ["♟", "♞", "♛"][i]))),
  });
})();
