/* world-pack-2.js — Paper Cut, Ink & Brush, Synthwave Sunset, Festival Stage, Storybook Pop */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ---- Paper Cut: layered torn-paper waves, floating confetti scraps ---- */
  FilmKit.make({
    global: "PaperCut", variants: {"DragDrop":"assemble","Typing":"caret","Swipe":"swipe","Toggle":"check"}, brand: "Paper Cut", desk: "#2c2620", ambient: 1.6,
    FH: '"Shrikhand", serif', FB: '"Sen", sans-serif',
    palette: (t) => ({ cream: t.cream || "#f4e9dc", coral: t.coral || "#e2654e", teal: "#2f8f83", mustard: "#e8b23c", ink: "#2c2620", paper: "#fffaf2" }),
    tweaks: [{ k: "cream", label: "Base", options: ["#f4e9dc", "#f2e2e6", "#e6ecdf"] }, { k: "coral", label: "Layer", options: ["#e2654e", "#c2477e", "#4a6fa5"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M6 3h9l5 5v13H6zM15 3v5h5" })),
    cams: ["pushR", "zoomOut", "pushL", "hopU", "pushD", "spin"], camMul: 3, camOff: 2,
    mag: { rot: 1.1, driftX: 9 }, titlePreset: "pop", itemPreset: "stamp", titleLine: 1.12,
    World: (theme, t, p, u) => R("g", null,
      R("path", { d: `M -20 ${u.H * 0.62 + Math.sin(t * 0.5) * 16} Q ${u.W * 0.25} ${u.H * 0.56} ${u.W * 0.5} ${u.H * 0.62} T ${u.W + 20} ${u.H * 0.6} L ${u.W + 20} ${u.H + 20} L -20 ${u.H + 20} Z`, fill: theme.mustard }),
      R("path", { d: `M -20 ${u.H * 0.72 - Math.sin(t * 0.5) * 14} Q ${u.W * 0.3} ${u.H * 0.78} ${u.W * 0.55} ${u.H * 0.72} T ${u.W + 20} ${u.H * 0.74} L ${u.W + 20} ${u.H + 20} L -20 ${u.H + 20} Z`, fill: theme.teal }),
      R("path", { d: `M -20 ${u.H * 0.84 + Math.sin(t * 0.4) * 12} Q ${u.W * 0.22} ${u.H * 0.8} ${u.W * 0.5} ${u.H * 0.84} T ${u.W + 20} ${u.H * 0.82} L ${u.W + 20} ${u.H + 20} L -20 ${u.H + 20} Z`, fill: theme.coral }),
      R("circle", { cx: u.W * 0.82, cy: 330, r: 120, fill: theme.coral }),
      R("circle", { cx: u.W * 0.82, cy: 330, r: 66, fill: theme.mustard }),
      Array.from({ length: 9 }).map((_, i) => {
        const cx = (i * 131 + t * (16 + (i % 3) * 9)) % u.W;
        const cy = 140 + (i * 197) % (u.H * 0.4) + Math.sin(t + i) * 20;
        const c = [theme.coral, theme.teal, theme.mustard][i % 3];
        return R("rect", { key: i, x: cx, y: cy, width: 22, height: 22, rx: 4, fill: c, opacity: 0.7, transform: `rotate(${t * 40 + i * 40} ${cx + 11} ${cy + 11})` });
      })),
    look: {
      hook: { bg: "cream", fg: "ink", hi: "coral", world: true, top: 320, size: 118, kicker: { v: "tag", bg: "teal", c: "paper" } },
      statement: { bg: "coral", fg: "paper", hi: "mustard", world: false, top: 620, size: 140 },
      feature: { bg: "cream", fg: "ink", hi: "teal", world: true, top: 250, size: 94, card: { v: "paper", bg: "paper", r: 10, line: "ink" }, chips: { v: "square", colors: ["coral", "teal", "mustard"], text: "paper" } },
      montage: { bg: "teal", fg: "paper", hi: "mustard", world: false, top: 258, size: 94, tile: { bg: "paper", line: "ink", label: "paper", r: 10 }, tilts: [-3.5, 2.5, 3, -2] },
      stats: { bg: "ink", fg: "paper", hi: "coral", world: false, cols: ["coral", "mustard", "teal"], num: 154 },
      cta: { bg: "mustard", fg: "ink", hi: "paper", world: false, top: 500, size: 120, btn: { v: "pill", bg: "ink", c: "paper" }, logoShape: "circle" },
    },
  });

  /* ---- Ink & Brush: sumi strokes drawing themselves, drifting mist, red seal ---- */
  FilmKit.make({
    global: "InkBrush", variants: {"Typing":"hand","Morph":"roll","Scroll":"feed","Ring":"ring"}, brand: "Ink & Brush", desk: "#1c1916", ambient: 1.4,
    FH: '"Cormorant Garamond", Georgia, serif', FB: '"Commissioner", sans-serif',
    palette: (t) => ({ rice: t.rice || "#f2ede2", ink: "#26221e", wash: "#8d8478", seal: t.seal || "#c93b2a", paper: "#faf7ef" }),
    tweaks: [{ k: "rice", label: "Paper", options: ["#f2ede2", "#ece4d2", "#e8e8e2"] }, { k: "seal", label: "Seal", options: ["#c93b2a", "#a8322a", "#8f5cff"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M4 20c8 0 12-4 14-14M14 4l6 2-2 6" })),
    cams: ["pushL", "zoomOut", "pushU", "pushR", "drop", "zoomIn"], camMul: 5, camOff: 0,
    mag: { rot: 0.5, driftX: 6, driftY: 9, inn: 0.3, driftZ: 0.04 }, titlePreset: "machete", itemPreset: "rise", titleLine: 1.14,
    World: (theme, t, p, u) => R("g", null,
      (function () {
        const len = 1600, draw = u.seg(p, 0.04, 0.7);
        return R("path", { d: `M 120 ${u.H - 420} C 320 ${u.H - 560} 640 ${u.H - 380} ${u.W - 110} ${u.H - 560}`, fill: "none", stroke: theme.ink, strokeWidth: 26, strokeLinecap: "round", strokeDasharray: `${len}`, strokeDashoffset: `${len * (1 - draw)}`, opacity: 0.85 });
      })(),
      (function () {
        const len = 900, draw = u.seg(p, 0.2, 0.85);
        return R("path", { d: `M ${u.W - 160} 300 C ${u.W - 300} 430 ${u.W - 140} 560 ${u.W - 260} 700`, fill: "none", stroke: theme.ink, strokeWidth: 16, strokeLinecap: "round", strokeDasharray: `${len}`, strokeDashoffset: `${len * (1 - draw)}`, opacity: 0.6 });
      })(),
      [0, 1, 2].map((i) => R("ellipse", { key: i, cx: ((t * (18 + i * 7) + i * 400) % (u.W + 700)) - 350, cy: 480 + i * 420, rx: 300, ry: 46, fill: rgba(theme.wash, 0.14) })),
      R("circle", { cx: 150, cy: 320, r: 90, fill: "none", stroke: rgba(theme.ink, 0.5), strokeWidth: 7, strokeDasharray: "420 999", strokeDashoffset: -t * 30 }),
      R("g", { transform: `translate(${u.W - 170},${u.H - 240}) rotate(-4)` },
        R("rect", { x: -44, y: -44, width: 88, height: 88, rx: 10, fill: theme.seal }),
        R("path", { d: "M-20 -16 h40 M-20 0 h40 M-20 16 h28", stroke: theme.paper, strokeWidth: 7, strokeLinecap: "round" }))),
    look: {
      hook: { bg: "rice", fg: "ink", hi: "seal", world: true, top: 300, size: 118, kicker: { v: "bare", c: "seal" } },
      statement: { bg: "ink", fg: "paper", hi: "seal", world: false, top: 640, size: 148 },
      feature: { bg: "rice", fg: "ink", hi: "seal", world: true, top: 248, size: 92, card: { v: "frame", bg: "ink", r: 8, line: "paper" }, chips: { v: "outline", colors: ["ink", "seal"], text: "paper" } },
      montage: { bg: "wash", fg: "paper", hi: "rice", world: false, top: 258, size: 92, tile: { bg: "rice", line: "ink", label: "paper", r: 6 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "ink", fg: "paper", hi: "seal", world: false, cols: ["seal", "rice", "wash"], num: 150 },
      cta: { bg: "rice", fg: "ink", hi: "seal", world: true, top: 500, size: 116, btn: { v: "block", bg: "seal", c: "paper" }, logoShape: "rounded" },
    },
  });

  /* ---- Synthwave Sunset: striped sun over a scrolling perspective grid ---- */
  FilmKit.make({
    global: "SynthwaveSunset", variants: {"Code":"editor","Cursor":"slider","Morph":"flap","Notify":"drop"}, brand: "Synthwave", desk: "#0e061c", ambient: 2.0,
    FH: '"Audiowide", sans-serif', FB: '"Jost", sans-serif',
    palette: (t) => ({ dusk: t.dusk || "#1a0b2e", pink: t.pink || "#ff5c8a", cyan: "#45e0ff", orange: "#ffa14a", paper: "#f6ecff", ink: "#120722" }),
    tweaks: [{ k: "dusk", label: "Sky", options: ["#1a0b2e", "#0b1e33", "#26082a"] }, { k: "pink", label: "Sun", options: ["#ff5c8a", "#ff7a5c", "#c86bff"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: theme.currentBg }, R2("path", { d: "M12 4a8 8 0 0 1 8 8H4a8 8 0 0 1 8-8Z" }), R2("rect", { x: 3, y: 14, width: 18, height: 2 }), R2("rect", { x: 5, y: 18, width: 14, height: 2 })),
    cams: ["zoomIn", "pushL", "pushD", "spin", "pushR", "pushU"], camMul: 7, camOff: 2,
    mag: { skew: 8, rot: 1.2, zin: 0.65, driftZ: 0.07 }, titlePreset: "streak", itemPreset: "pop", titleSpace: "0.04em",
    World: (theme, t, p, u) => R("g", null,
      (function () {
        const cy = 520, r = 240;
        return R("g", null,
          R("circle", { cx: u.W / 2, cy, r, fill: theme.pink }),
          [0, 1, 2, 3, 4].map((i) => R("rect", { key: i, x: u.W / 2 - r, y: cy + 20 + i * 40 + ((t * 26) % 40), width: r * 2, height: 10 + i * 4, fill: theme.dusk })),
          R("circle", { cx: u.W / 2, cy, r: r + 60, fill: "none", stroke: rgba(theme.pink, 0.3), strokeWidth: 3 }));
      })(),
      (function () {
        const hy = u.H * 0.58;
        const verts = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((k) =>
          R("line", { key: "v" + k, x1: u.W / 2 + k * 90, y1: hy, x2: u.W / 2 + k * 420, y2: u.H + 40, stroke: rgba(theme.cyan, 0.5), strokeWidth: 3 }));
        const hors = [0, 1, 2, 3, 4, 5].map((i) => {
          const ph = ((t * 0.5 + i / 6) % 1), e = ph * ph;
          return R("line", { key: "h" + i, x1: 0, y1: hy + e * (u.H - hy + 60), x2: u.W, y2: hy + e * (u.H - hy + 60), stroke: rgba(theme.cyan, 0.25 + e * 0.5), strokeWidth: 2 + e * 4 });
        });
        return R("g", null, R("line", { x1: 0, y1: hy, x2: u.W, y2: hy, stroke: theme.cyan, strokeWidth: 3, opacity: 0.9 }), verts, hors);
      })(),
      [0, 1, 2].map((i) => R("circle", { key: "st" + i, cx: (i * 331 + t * 10) % u.W, cy: 140 + (i * 137) % 200, r: 2.4, fill: rgba("#ffffff", 0.7) }))),
    look: {
      hook: { bg: "dusk", fg: "paper", hi: "cyan", world: true, top: 940, size: 106, upper: true, kicker: { v: "outline", c: "pink", r: 4 } },
      statement: { bg: "ink", fg: "paper", hi: "pink", world: false, top: 640, size: 136, upper: true },
      feature: { bg: "dusk", fg: "paper", hi: "orange", world: true, top: 246, size: 86, upper: true, card: { v: "glow", bg: "#120722", glow: "cyan", r: 14, line: "cyan" }, chips: { v: "outline", colors: ["pink", "cyan", "orange"], text: "ink" } },
      montage: { bg: "ink", fg: "paper", hi: "cyan", world: false, top: 256, size: 88, upper: true, tile: { bg: "#1a0b2e", line: "pink", label: "pink", r: 10, glow: "pink" }, tilts: [0, 0, 0, 0] },
      stats: { bg: "dusk", fg: "paper", hi: "pink", world: true, cols: ["pink", "cyan", "orange"], num: 140, upper: true, glowNums: true },
      cta: { bg: "ink", fg: "paper", hi: "cyan", world: false, top: 520, size: 108, upper: true, btn: { v: "glow", bg: "pink", c: "paper" }, logoShape: "rounded" },
    },
  });

  /* ---- Festival Stage: sweeping spotlights, confetti rain, crowd silhouette ---- */
  FilmKit.make({
    global: "FestivalStage", variants: {"Notify":"pop","Swipe":"swipe","Cursor":"slider","Toggle":"dial"}, brand: "Festival", desk: "#0e0a1a", ambient: 2.0,
    FH: '"Bungee", sans-serif', FB: '"Rubik", sans-serif',
    palette: (t) => ({ night: t.night || "#191227", violet: t.violet || "#8f5cff", hot: "#ff4f9a", lime: "#c8f04f", paper: "#f6f2ff", ink: "#120d1e" }),
    tweaks: [{ k: "night", label: "Night", options: ["#191227", "#122027", "#221024"] }, { k: "violet", label: "Beam", options: ["#8f5cff", "#5c9dff", "#ff5c8a"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M9 18V6l10-2v12" }), R2("circle", { cx: 6.5, cy: 18, r: 2.5 }), R2("circle", { cx: 16.5, cy: 16, r: 2.5 })),
    cams: ["hopU", "spin", "pushL", "zoomIn", "pushR", "drop"], camMul: 5, camOff: 3,
    mag: { rot: 1.5, driftX: 11, driftZ: 0.075 }, titlePreset: "bounce", itemPreset: "pop", titleLine: 1.12,
    World: (theme, t, p, u) => R("g", null,
      [0, 1].map((i) => {
        const a = Math.sin(t * (0.7 + i * 0.23) + i * 2) * 34 + (i ? -18 : 18);
        const c = i ? theme.hot : theme.violet;
        return R("polygon", { key: i, points: `${240 + i * 600},-40 ${240 + i * 600 + 60},-40 ${240 + i * 600 + 60 + a * 8},${u.H - 420} ${240 + i * 600 + a * 8 - 220},${u.H - 420}`, fill: rgba(c, 0.22) });
      }),
      Array.from({ length: 14 }).map((_, i) => {
        const cx = (i * 83 + Math.sin(t + i) * 30 + u.W) % u.W;
        const cy = ((t * (90 + (i % 4) * 34) + i * 230) % (u.H + 140)) - 70;
        const c = [theme.hot, theme.lime, theme.violet, theme.paper][i % 4];
        return R("rect", { key: "c" + i, x: cx, y: cy, width: 12, height: 18, rx: 2, fill: c, opacity: 0.8, transform: `rotate(${t * 120 + i * 40} ${cx + 6} ${cy + 9})` });
      }),
      R("path", { d: `M -20 ${u.H - 240} Q 140 ${u.H - 330} 300 ${u.H - 250} T 620 ${u.H - 260} T 940 ${u.H - 245} L ${u.W + 20} ${u.H - 250} L ${u.W + 20} ${u.H + 20} L -20 ${u.H + 20} Z`, fill: theme.ink }),
      [0, 1, 2, 3, 4, 5, 6].map((i) => R("line", { key: "a" + i, x1: 90 + i * 150, y1: u.H - 260 - (i % 2) * 24, x2: 90 + i * 150 + Math.sin(t * 2.2 + i) * 16, y2: u.H - 350 - (i % 3) * 26, stroke: theme.ink, strokeWidth: 12, strokeLinecap: "round" }))),
    look: {
      hook: { bg: "night", fg: "paper", hi: "lime", world: true, top: 340, size: 112, upper: true, kicker: { v: "pill", bg: "hot", c: "paper" } },
      statement: { bg: "ink", fg: "paper", hi: "hot", world: false, top: 620, size: 132, upper: true },
      feature: { bg: "night", fg: "paper", hi: "violet", world: true, top: 246, size: 86, upper: true, card: { v: "glow", bg: "#120d1e", glow: "hot", r: 20, line: "paper" }, chips: { v: "pill", colors: ["hot", "lime", "violet"], text: "ink" } },
      montage: { bg: "ink", fg: "paper", hi: "lime", world: false, top: 256, size: 86, upper: true, tile: { bg: "#191227", line: "paper", label: "paper", r: 16, glow: "violet" }, tilts: [-2.5, 2, 2.5, -2] },
      stats: { bg: "night", fg: "paper", hi: "hot", world: true, cols: ["lime", "hot", "violet"], num: 150, upper: true, glowNums: true },
      cta: { bg: "ink", fg: "paper", hi: "lime", world: false, top: 500, size: 110, upper: true, btn: { v: "glow", bg: "lime", c: "ink" }, logoShape: "circle" },
    },
  });

  /* ---- Storybook Pop: open book pages, turning page arc, drifting sparkle dust ---- */
  FilmKit.make({
    global: "StorybookPop", variants: {"Typing":"typewriter","Scroll":"stack","Morph":"roll","DragDrop":"drag"}, brand: "Storybook", desk: "#2a241d", ambient: 1.5,
    FH: '"Bitter", serif', FB: '"Nunito Sans", sans-serif',
    palette: (t) => ({ page: t.page || "#f8efdf", ink: "#37302a", ribbon: t.ribbon || "#cf4633", forest: "#3e6b4c", gold: "#d9a13b", paper: "#fffdf6" }),
    tweaks: [{ k: "page", label: "Page", options: ["#f8efdf", "#f2e6ea", "#e9efe2"] }, { k: "ribbon", label: "Ribbon", options: ["#cf4633", "#7a4a8f", "#2f6db5"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 25, height: 25, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M12 6c-2-2-5-2-8-1v14c3-1 6-1 8 1 2-2 5-2 8-1V5c-3-1-6-1-8 1Zv14" })),
    cams: ["pushR", "drop", "zoomOut", "pushL", "hopU", "zoomIn"], camMul: 3, camOff: 1,
    mag: { rot: 0.9, driftY: 8, inn: 0.27 }, titlePreset: "drowse", itemPreset: "pop", titleLine: 1.1,
    World: (theme, t, p, u) => R("g", null,
      R("g", { transform: `translate(${u.W / 2},${u.H - 430})` },
        R("path", { d: "M0 0 C -180 -60 -420 -40 -470 20 L -470 120 C -420 60 -180 80 0 130 Z", fill: theme.paper, stroke: rgba(theme.ink, 0.25), strokeWidth: 3 }),
        R("path", { d: "M0 0 C 180 -60 420 -40 470 20 L 470 120 C 420 60 180 80 0 130 Z", fill: theme.page, stroke: rgba(theme.ink, 0.25), strokeWidth: 3 }),
        [0, 1, 2, 3].map((i) => R("line", { key: "l" + i, x1: -400, y1: 4 + i * 26, x2: -80, y2: 26 + i * 26, stroke: rgba(theme.ink, 0.22), strokeWidth: 5, strokeLinecap: "round" })),
        (function () {
          const ph = (t * 0.35) % 1, e = ph < 0.5 ? ph * 2 : 2 - ph * 2;
          return R("path", { d: `M0 0 C ${120 - e * 240} ${-160} ${300 - e * 600} ${-140} ${420 - e * 840} 20 L 0 130 Z`, fill: rgba(theme.paper, 0.92), stroke: rgba(theme.ink, 0.2), strokeWidth: 2 });
        })(),
        R("rect", { x: -10, y: 0, width: 20, height: 150, rx: 6, fill: theme.ribbon })),
      Array.from({ length: 10 }).map((_, i) => {
        const sx = u.W / 2 + Math.sin(t * (0.4 + i * 0.09) + i * 2.4) * (u.W * 0.36);
        const sy = u.H - 560 - ((t * (26 + i * 6) + i * 130) % 900);
        return R("path", { key: "sp" + i, d: `M ${sx} ${sy - 8} L ${sx + 3} ${sy - 2} L ${sx + 9} ${sy} L ${sx + 3} ${sy + 2} L ${sx} ${sy + 8} L ${sx - 3} ${sy + 2} L ${sx - 9} ${sy} L ${sx - 3} ${sy - 2} Z`, fill: theme.gold, opacity: 0.5 + 0.4 * Math.abs(Math.sin(t * 2 + i)) });
      })),
    look: {
      hook: { bg: "page", fg: "ink", hi: "ribbon", world: true, top: 300, size: 116, kicker: { v: "outline", c: "forest" } },
      statement: { bg: "forest", fg: "paper", hi: "gold", world: false, top: 630, size: 140 },
      feature: { bg: "page", fg: "ink", hi: "ribbon", world: true, top: 246, size: 92, card: { v: "paper", bg: "paper", r: 10, line: "ink" }, chips: { v: "pill", colors: ["ribbon", "forest", "gold"], text: "paper" } },
      montage: { bg: "ink", fg: "paper", hi: "gold", world: false, top: 258, size: 92, tile: { bg: "paper", line: "ink", label: "gold", r: 10 }, tilts: [-3, 2.5, 2, -2.5] },
      stats: { bg: "forest", fg: "paper", hi: "gold", world: false, cols: ["gold", "page", "paper"], num: 152 },
      cta: { bg: "ribbon", fg: "paper", hi: "gold", world: false, top: 500, size: 118, btn: { v: "pill", bg: "paper", c: "ribbon" }, logoShape: "circle" },
    },
  });
})();
