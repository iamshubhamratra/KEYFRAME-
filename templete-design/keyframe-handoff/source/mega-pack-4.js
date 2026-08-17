/* mega-pack-4.js — Lock & Legend, Koi Court, Salsa Wheels, Spinnaker Cup, Rocket Nights,
   Stacks & Spines, Rind & Wheel, Prop Wash, Tube & Glow, Front & Isobar */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ---- Lock & Legend: keyhole light, fast clock, popping padlock, gears ---- */
  FilmKit.make({
    global: "LockLegend", variants: { Cursor: "keys", Toggle: "check", Ring: "bar", Notify: "drop" },
    brand: "Lock & Legend", desk: "#140e0a", ambient: 1.8,
    FH: '"Cinzel", serif', FB: '"Radio Canada", sans-serif',
    palette: (t) => ({ mahog: t.mahog || "#3a2618", brass: t.brass || "#c9a24b", oxblood: "#7a2e2e", paper: "#e8dcc0", ink: "#1c1410" }),
    tweaks: [{ k: "mahog", label: "Study", options: ["#3a2618", "#2c2620", "#26302a"] }, { k: "brass", label: "Brass", options: ["#c9a24b", "#b8969e", "#8fa86a"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("rect", { x: 5, y: 10, width: 14, height: 10, rx: 2 }), R2("path", { d: "M8 10V7a4 4 0 0 1 8 0v3M12 14v3" })),
    cams: ["zoomIn", "pushL", "drop", "spin", "pushR", "pushU"], camMul: 7, camOff: 1,
    mag: { rot: 0.8, inn: 0.2 }, titlePreset: "stamp", itemPreset: "pop", titleLine: 1.1, titleSpace: "0.03em",
    look: {
      hook: { bg: "mahog", fg: "paper", hi: "brass", world: true, top: 320, size: 112, upper: true, kicker: { v: "outline", c: "brass" } },
      statement: { bg: "ink", fg: "paper", hi: "brass", world: false, top: 630, size: 140, upper: true },
      feature: { bg: "mahog", fg: "paper", hi: "brass", world: true, top: 250, size: 92, upper: true, card: { v: "frame", bg: "ink", r: 10, line: "paper" }, chips: { v: "outline", colors: ["brass", "oxblood"], text: "paper" } },
      montage: { bg: "ink", fg: "paper", hi: "brass", world: false, top: 258, size: 90, upper: true, tile: { bg: "mahog", line: "paper", label: "brass", r: 8 }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "mahog", fg: "paper", hi: "brass", world: true, cols: ["brass", "oxblood", "paper"], num: 146, upper: true },
      cta: { bg: "oxblood", fg: "paper", hi: "brass", world: false, top: 500, size: 112, upper: true, btn: { v: "block", bg: "paper", c: "ink" }, logoShape: "rounded" },
      app: { bg: "mahog", fg: "paper", hi: "brass", cardBg: "#2c1d12", line: "paper", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("g", { transform: "translate(" + (u.W - 200) + "," + (u.H - 420) + ")" },
        R("circle", { r: 60, fill: rgba(theme.brass, 0.16) }),
        R("path", { d: "M 0 -34 a 34 34 0 1 1 -0.01 0 M -16 60 L -8 6 L 8 6 L 16 60 Z", fill: theme.ink, stroke: theme.brass, strokeWidth: 4 }),
        R("polygon", { points: "0,-90 40,-260 -40,-260", fill: rgba(theme.brass, 0.08) })),
      R("g", { transform: "translate(180,280)" },
        R("circle", { r: 74, fill: "none", stroke: rgba(theme.paper, 0.4), strokeWidth: 5 }),
        Array.from({ length: 12 }).map((_, i) => R("line", { key: i, x1: Math.cos(i * Math.PI / 6) * 64, y1: Math.sin(i * Math.PI / 6) * 64, x2: Math.cos(i * Math.PI / 6) * 72, y2: Math.sin(i * Math.PI / 6) * 72, stroke: rgba(theme.paper, 0.4), strokeWidth: 3 })),
        R("line", { x1: 0, y1: 0, x2: Math.cos(t * 2.6 - Math.PI / 2) * 58, y2: Math.sin(t * 2.6 - Math.PI / 2) * 58, stroke: theme.oxblood, strokeWidth: 5, strokeLinecap: "round" }),
        R("line", { x1: 0, y1: 0, x2: Math.cos(t * 0.44 - Math.PI / 2) * 40, y2: Math.sin(t * 0.44 - Math.PI / 2) * 40, stroke: theme.brass, strokeWidth: 6, strokeLinecap: "round" })),
      (function () {
        const open = u.seg(p, 0.55, 0.75);
        return R("g", { transform: "translate(190," + (u.H - 300) + ")" },
          R("rect", { x: -50, y: -10, width: 100, height: 84, rx: 14, fill: theme.brass }),
          R("path", { d: "M -30 -10 v -26 a 30 30 0 0 1 60 0 v " + (26 - open * 22), fill: "none", stroke: rgba(theme.paper, 0.9), strokeWidth: 14, strokeLinecap: "round", transform: "rotate(" + (-open * 24) + " 30 -10)" }),
          R("circle", { cy: 30, r: 12, fill: theme.ink }));
      })(),
      [0, 1].map((i) => R("g", { key: "g" + i, transform: "translate(" + (u.W - 340 + i * 90) + "," + (240 + i * 70) + ") rotate(" + (t * 40 * (i ? -1 : 1)) + ")" },
        Array.from({ length: 8 }).map((_, k) => R("rect", { key: k, x: -6, y: -44 - i * 8, width: 12, height: 16, fill: rgba(theme.paper, 0.35), transform: "rotate(" + (k * 45) + ")" })),
        R("circle", { r: 34 + i * 8, fill: "none", stroke: rgba(theme.paper, 0.35), strokeWidth: 10 })))),
  });

  /* ---- Koi Court: koi circling, ripples, lily pads, maple leaf ---- */
  FilmKit.make({
    global: "KoiCourt", variants: { Scroll: "feed", Ring: "ring", Notify: "side", Morph: "fade" },
    brand: "Koi Court", desk: "#0e1c20", ambient: 1.5,
    FH: '"Gelasio", serif', FB: '"Kumbh Sans", sans-serif',
    palette: (t) => ({ pond: t.pond || "#14262b", koi: t.koi || "#f07d3c", white: "#f4f1e8", jade: "#3f8c7a", gold: "#d9b45c" }),
    tweaks: [{ k: "pond", label: "Pond", options: ["#14262b", "#16202e", "#1a2620"] }, { k: "koi", label: "Koi", options: ["#f07d3c", "#e05e7a", "#d9b45c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M4 12c3-5 11-5 14 0-3 5-11 5-14 0zM18 12l3-3v6z" }), R2("circle", { cx: 8.5, cy: 11.5, r: 0.5 })),
    cams: ["zoomOut", "pushU", "drop", "pushL", "zoomIn", "pushR"], camMul: 3, camOff: 2,
    mag: { rot: 0.4, driftY: 8, inn: 0.3, driftZ: 0.035 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.1,
    look: {
      hook: { bg: "pond", fg: "white", hi: "koi", world: true, top: 330, size: 118, kicker: { v: "outline", c: "gold" } },
      statement: { bg: "jade", fg: "white", hi: "pond", world: false, top: 630, size: 144 },
      feature: { bg: "pond", fg: "white", hi: "koi", world: true, top: 250, size: 94, card: { v: "frame", bg: "#0d1a1e", r: 22, line: "white" }, chips: { v: "pill", colors: ["koi", "jade"], text: "white" } },
      montage: { bg: "#0d1a1e", fg: "white", hi: "gold", world: false, top: 258, size: 90, tile: { bg: "pond", line: "white", label: "gold", r: 18 }, tilts: [-1.5, 1, 1.5, -1] },
      stats: { bg: "pond", fg: "white", hi: "koi", world: true, cols: ["koi", "gold", "jade"], num: 148 },
      cta: { bg: "koi", fg: "white", hi: "pond", world: false, top: 500, size: 116, btn: { v: "pill", bg: "pond", c: "white" }, logoShape: "circle" },
      app: { bg: "pond", fg: "white", hi: "koi", cardBg: "#1c3238", line: "white", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1, 2].map((i) => {
        const a = t * (0.5 + i * 0.14) + i * 2.2;
        const cx = u.W / 2 + Math.cos(a) * (220 + i * 60), cy = u.H - 520 + Math.sin(a) * (130 + i * 30);
        const heading = a + Math.PI / 2;
        const wig = Math.sin(t * 6 + i * 2) * 14;
        const c = [theme.koi, theme.white, theme.gold][i];
        return R("g", { key: i, transform: "translate(" + cx + "," + cy + ") rotate(" + (heading * 180 / Math.PI) + ")" },
          R("path", { d: "M 0 -44 q 26 18 0 62 q -26 -18 0 -62", fill: c, opacity: 0.9 }),
          R("path", { d: "M 0 18 q " + wig + " 26 0 40 q " + (-wig * 0.6) + " -8 0 -40", fill: rgba(c, 0.75) }),
          (i === 0) && R("circle", { cy: -20, r: 7, fill: rgba(theme.pond, 0.5) }));
      }),
      [0, 1, 2].map((i) => R("circle", { key: "r" + i, cx: 220 + i * 300, cy: 300 + (i % 2) * 120, r: 20 + ((t * 50 + i * 40) % 130), fill: "none", stroke: rgba(theme.white, 0.22 * (1 - ((t * 50 + i * 40) % 130) / 130)), strokeWidth: 3 })),
      [[170, 220, 46], [u.W - 190, 380, 60], [u.W - 320, 250, 34]].map(([x, y, r], i) => R("g", { key: "l" + i, transform: "translate(" + (x + Math.sin(t * 0.5 + i) * 8) + "," + y + ")" },
        R("path", { d: "M 0 0 L " + r + " -10 A " + r + " " + r * 0.82 + " 0 1 0 " + r + " 10 Z", fill: rgba(theme.jade, 0.75), transform: "rotate(" + i * 60 + ")" }))),
      (function () {
        const ph = (t * 0.12) % 1;
        return R("path", { d: "M 0 0 q 9 -6 18 0 q -6 9 -18 8 q -8 -1 0 -8", fill: theme.koi, opacity: 0.8, transform: "translate(" + (u.W * 0.3 + ph * 300) + "," + (140 + ph * (u.H - 700)) + ") rotate(" + ph * 400 + ") scale(1.6)" });
      })()),
  });

  /* ---- Salsa Wheels: taco truck, papel picado, steam, cactus ---- */
  FilmKit.make({
    global: "SalsaWheels", variants: { Cursor: "click", Scroll: "board", Notify: "pop", Swipe: "swipe" },
    brand: "Salsa Wheels", desk: "#1c120e", ambient: 2.0,
    FH: '"Boogaloo", sans-serif', FB: '"Nunito", sans-serif',
    palette: (t) => ({ crema: t.crema || "#fdf3e0", salsa: t.salsa || "#d93425", corn: "#f2c14b", teal: "#2a9d8f", ink: "#2b1a14" }),
    tweaks: [{ k: "crema", label: "Crema", options: ["#fdf3e0", "#f8e8d0", "#f2ead9"] }, { k: "salsa", label: "Salsa", options: ["#d93425", "#e05e2c", "#b3452e"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M3 11a9 5 0 0 1 18 0l-2 8H5zM3 11h18" })),
    cams: ["hopU", "pushR", "spin", "pushL", "zoomIn", "drop"], camMul: 3, camOff: 1,
    mag: { rot: 1.4, driftX: 10 }, titlePreset: "bounce", itemPreset: "pop", titleLine: 1.05,
    look: {
      hook: { bg: "crema", fg: "ink", hi: "salsa", world: true, top: 330, size: 126, upper: true, kicker: { v: "tag", bg: "salsa", c: "crema" } },
      statement: { bg: "salsa", fg: "crema", hi: "corn", world: false, top: 630, size: 150, upper: true },
      feature: { bg: "crema", fg: "ink", hi: "salsa", world: true, top: 250, size: 98, upper: true, card: { v: "tilt", bg: "ink", r: 18, line: "crema" }, chips: { v: "square", colors: ["salsa", "corn", "teal"], text: "crema" } },
      montage: { bg: "teal", fg: "crema", hi: "corn", world: false, top: 258, size: 94, upper: true, tile: { bg: "crema", line: "ink", label: "ink", r: 14 }, tilts: [-3, 2.5, 2, -2.5] },
      stats: { bg: "crema", fg: "ink", hi: "salsa", world: true, cols: ["salsa", "teal", "corn"], num: 152, upper: true },
      cta: { bg: "corn", fg: "ink", hi: "salsa", world: false, top: 500, size: 122, upper: true, btn: { v: "pill", bg: "salsa", c: "crema" }, logoShape: "circle" },
      app: { bg: "crema", fg: "ink", hi: "salsa", cardBg: "#ffffff", line: "ink", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      R("g", null,
        R("path", { d: "M 40 170 q " + (u.W / 4) + " 50 " + (u.W / 2) + " 0 t " + (u.W / 2 - 80) + " 0", fill: "none", stroke: rgba(theme.ink, 0.3), strokeWidth: 3 }),
        Array.from({ length: 9 }).map((_, i) => {
          const x = 70 + i * (u.W / 9), sag = Math.sin((x / u.W) * Math.PI) * 44;
          const c = [theme.salsa, theme.corn, theme.teal][i % 3];
          return R("g", { key: i, transform: "translate(" + x + "," + (174 + sag) + ") rotate(" + Math.sin(t * 2.4 + i) * 10 + ")" },
            R("rect", { x: -22, width: 44, height: 34, fill: rgba(c, 0.8) }),
            R("path", { d: "M -22 34 l 11 8 l 11 -8 l 11 8 l 11 -8", fill: "none", stroke: rgba(c, 0.8), strokeWidth: 4 }));
        })),
      (function () {
        const bounce = Math.abs(Math.sin(t * 3.2)) * 6;
        return R("g", { transform: "translate(" + (u.W - 300) + "," + (u.H - 360 - bounce) + ")" },
          R("rect", { x: -190, y: -140, width: 380, height: 150, rx: 18, fill: theme.teal }),
          R("rect", { x: -150, y: -110, width: 150, height: 80, rx: 10, fill: rgba(theme.crema, 0.95) }),
          R("path", { d: "M -160 -140 l 20 -34 h 280 l 20 34", fill: theme.salsa }),
          Array.from({ length: 5 }).map((_, i) => R("rect", { key: i, x: -160 + 8 + i * 58, y: -172, width: 44, height: 30, fill: i % 2 ? theme.corn : theme.crema })),
          R("circle", { cx: -110, cy: 30, r: 34, fill: theme.ink }), R("circle", { cx: -110, cy: 30, r: 14, fill: theme.crema }),
          R("circle", { cx: 120, cy: 30, r: 34, fill: theme.ink }), R("circle", { cx: 120, cy: 30, r: 14, fill: theme.crema }),
          R("path", { d: "M -70 -150 q 10 -30 -6 -56", fill: "none", stroke: rgba(theme.crema, 0.5), strokeWidth: 8, strokeLinecap: "round", transform: "translate(0," + (-((t * 40) % 30)) + ")" }));
      })(),
      R("g", { transform: "translate(130," + (u.H - 260) + ")" },
        R("rect", { x: -14, y: -120, width: 28, height: 120, rx: 13, fill: theme.teal }),
        R("rect", { x: -60, y: -84, width: 28, height: 60, rx: 13, fill: theme.teal, transform: "rotate(-18)" }),
        R("rect", { x: 34, y: -100, width: 28, height: 66, rx: 13, fill: theme.teal, transform: "rotate(14)" }),
        R("ellipse", { cy: 8, rx: 60, ry: 12, fill: rgba(theme.ink, 0.2) })),
      [0, 1, 2].map((i) => R("path", { key: "ch" + i, d: "M 0 0 q -8 22 4 34 q 14 -6 10 -26 q -3 -12 -14 -8 M 2 -2 q 6 -10 14 -8", fill: "none", stroke: theme.salsa, strokeWidth: 5, strokeLinecap: "round", transform: "translate(" + (u.W - 140 - i * 60) + "," + (240 + i * 90) + ") rotate(" + (i * 40 + t * 30) + ") scale(" + (1.1 - i * 0.2) + ")" }))),
  });

  /* ---- Spinnaker Cup: heeled yacht, spinnaker, buoy, burgee ---- */
  FilmKit.make({
    global: "SpinnakerCup", variants: { Ring: "gauge", Scroll: "ticker", Toggle: "switch", Morph: "roll" },
    brand: "Spinnaker Cup", desk: "#0c1c33", ambient: 1.7,
    FH: '"Libre Bodoni", serif', FB: '"PT Sans", sans-serif',
    palette: (t) => ({ navy: t.navy || "#12294a", regatta: t.regatta || "#d94141", sail: "#f8f6f0", sea: "#2a6d9e", brass: "#c9a24b" }),
    tweaks: [{ k: "navy", label: "Night watch", options: ["#12294a", "#0f3040", "#1c2440"] }, { k: "regatta", label: "Spinnaker", options: ["#d94141", "#e8641f", "#2a9d8f"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M12 3v15M12 3c4 4 5 9 4 12h-4M12 6c-3 3-4 7-3 9h3M4 21h16l-2-3H6z" })),
    cams: ["pushL", "zoomOut", "pushU", "pushR", "drop", "zoomIn"], camMul: 5, camOff: 3,
    mag: { rot: 0.6, slide: 0.3, driftX: 9, driftY: 9 }, titlePreset: "rise", itemPreset: "streak", titleLine: 1.08,
    look: {
      hook: { bg: "navy", fg: "sail", hi: "regatta", world: true, top: 320, size: 118, upper: true, kicker: { v: "outline", c: "brass" } },
      statement: { bg: "regatta", fg: "sail", hi: "navy", world: false, top: 630, size: 146, upper: true },
      feature: { bg: "navy", fg: "sail", hi: "brass", world: true, top: 250, size: 94, upper: true, card: { v: "frame", bg: "#0d1f38", r: 14, line: "sail" }, chips: { v: "outline", colors: ["regatta", "brass"], text: "navy" } },
      montage: { bg: "#0d1f38", fg: "sail", hi: "regatta", world: false, top: 258, size: 92, upper: true, tile: { bg: "navy", line: "sail", label: "brass", r: 10 }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "navy", fg: "sail", hi: "regatta", world: true, cols: ["regatta", "brass", "sail"], num: 148, upper: true, rule: true },
      cta: { bg: "sail", fg: "navy", hi: "regatta", world: false, top: 500, size: 114, upper: true, btn: { v: "block", bg: "navy", c: "sail" }, logoShape: "circle" },
      app: { bg: "navy", fg: "sail", hi: "regatta", cardBg: "#1a3452", line: "sail", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      (function () {
        const heel = -12 + Math.sin(t * 0.8) * 4, bob = Math.sin(t * 1.1) * 12;
        return R("g", { transform: "translate(" + (u.W / 2 + 60) + "," + (u.H - 430 + bob) + ") rotate(" + heel + ")" },
          R("path", { d: "M -130 0 L 130 0 L 96 44 L -100 44 Z", fill: rgba(theme.sail, 0.92) }),
          R("line", { x1: 0, y1: 0, x2: 0, y2: -300, stroke: theme.sail, strokeWidth: 8 }),
          R("path", { d: "M 4 -292 Q 90 -180 64 -8 L 4 -8 Z", fill: theme.sail }),
          R("path", { d: "M -6 -286 Q -150 -190 -96 -10 Q -40 -60 -6 -286", fill: theme.regatta, opacity: 0.95 }),
          R("path", { d: "M 0 -300 l 44 12 l -44 12 z", fill: theme.brass }));
      })(),
      [0, 1, 2, 3].map((i) => R("path", { key: i, d: "M -60 " + (u.H - 400 + i * 70) + " " + Array.from({ length: 7 }).map((_, s) => "q 90 " + (s % 2 ? 26 : -26) + " 180 0").join(" "), fill: "none", stroke: rgba(i === 0 ? theme.sail : theme.sea, 0.5 - i * 0.09), strokeWidth: 9 - i * 1.5, strokeLinecap: "round", transform: "translate(" + (-((t * (60 + i * 22)) % 360)) + ",0)" })),
      (function () {
        const bb = Math.sin(t * 1.6) * 14;
        return R("g", { transform: "translate(170," + (u.H - 480 + bb) + ") rotate(" + Math.sin(t * 1.2) * 8 + ")" },
          R("path", { d: "M -22 0 L 22 0 L 12 60 L -12 60 Z", fill: theme.regatta }),
          R("circle", { cy: -16, r: 14, fill: theme.brass }),
          R("line", { x1: 0, y1: -30, x2: 0, y2: -64, stroke: theme.sail, strokeWidth: 5 }),
          R("polygon", { points: "0,-64 34,-56 0,-46", fill: theme.sail }));
      })(),
      Array.from({ length: 3 }).map((_, i) => R("circle", { key: "s" + i, cx: 140 + i * 320, cy: 200 + (i % 2) * 60, r: 2, fill: rgba(theme.sail, 0.6) }))),
  });

  /* ---- Rocket Nights: launches, radial bursts, sparkles, hill ---- */
  FilmKit.make({
    global: "RocketNights", variants: { Code: "terminal", Notify: "pop", Morph: "flap", Swipe: "flip" },
    brand: "Rocket Nights", desk: "#0b0b14", ambient: 1.9,
    FH: '"Paytone One", sans-serif', FB: '"Outfit", sans-serif',
    palette: (t) => ({ night: t.night || "#10101c", rocket: t.rocket || "#ff4757", spark: "#ffd23c", violet: "#7c5cff", smoke: "#e8e6f0" }),
    tweaks: [{ k: "night", label: "Sky", options: ["#10101c", "#140e1c", "#0c1418"] }, { k: "rocket", label: "Burst", options: ["#ff4757", "#ff8a3d", "#4cc9f0"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M12 2c3 3 4 7 4 10l-4 4-4-4c0-3 1-7 4-10zM8 14l-3 3M16 14l3 3M12 16v5" })),
    cams: ["pushU", "zoomIn", "drop", "spin", "pushL", "pushR"], camMul: 7, camOff: 0,
    mag: { rot: 1.1, driftY: 10, inn: 0.18 }, titlePreset: "slam", itemPreset: "pop",
    look: {
      hook: { bg: "night", fg: "smoke", hi: "spark", world: true, top: 310, size: 124, upper: true, kicker: { v: "pill", bg: "rocket", c: "smoke" } },
      statement: { bg: "rocket", fg: "smoke", hi: "night", world: false, top: 630, size: 148, upper: true },
      feature: { bg: "night", fg: "smoke", hi: "spark", world: true, top: 248, size: 96, upper: true, card: { v: "glow", bg: "#0c0c16", glow: "spark", r: 18, line: "smoke" }, chips: { v: "pill", colors: ["rocket", "violet", "spark"], text: "night" } },
      montage: { bg: "#0c0c16", fg: "smoke", hi: "spark", world: true, top: 258, size: 92, upper: true, tile: { bg: "night", line: "smoke", label: "spark", r: 14, glow: "violet" }, tilts: [-2.5, 2, 1.5, -2] },
      stats: { bg: "night", fg: "smoke", hi: "spark", world: true, cols: ["spark", "rocket", "violet"], num: 150, upper: true, glowNums: true },
      cta: { bg: "#0c0c16", fg: "smoke", hi: "spark", world: true, top: 500, size: 118, upper: true, btn: { v: "glow", bg: "rocket", c: "smoke" }, logoShape: "circle" },
      app: { bg: "night", fg: "smoke", hi: "spark", cardBg: "#1a1a2a", line: "smoke", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1, 2].map((i) => {
        const ph = (t * 0.34 + i * 0.33) % 1;
        const cx = 200 + i * 330, cy = 700 - i * 120;
        const cols = [theme.rocket, theme.spark, theme.violet];
        if (ph < 0.35) {
          const q = ph / 0.35;
          return R("g", { key: i },
            R("line", { x1: cx, y1: u.H - 200 - q * (u.H - 200 - cy), x2: cx, y2: u.H - 140 - q * (u.H - 200 - cy), stroke: cols[i], strokeWidth: 5, strokeLinecap: "round" }),
            R("circle", { cx, cy: u.H - 200 - q * (u.H - 200 - cy), r: 6, fill: theme.smoke }));
        }
        const q = (ph - 0.35) / 0.65;
        return R("g", { key: i, transform: "translate(" + cx + "," + cy + ")", opacity: 1 - q },
          Array.from({ length: 12 }).map((_, k) => {
            const a = k * Math.PI / 6;
            return R("line", { key: k, x1: Math.cos(a) * q * 40, y1: Math.sin(a) * q * 40, x2: Math.cos(a) * (30 + q * 170), y2: Math.sin(a) * (30 + q * 170), stroke: cols[i], strokeWidth: 4, strokeLinecap: "round" });
          }),
          Array.from({ length: 8 }).map((_, k) => R("circle", { key: "d" + k, cx: Math.cos(k * Math.PI / 4 + 0.4) * (40 + q * 200), cy: Math.sin(k * Math.PI / 4 + 0.4) * (40 + q * 200) + q * q * 60, r: 4, fill: theme.smoke, opacity: 0.8 })));
      }),
      Array.from({ length: 14 }).map((_, i) => R("circle", { key: "s" + i, cx: (i * 149 + 40) % u.W, cy: (i * 211 + 60) % (u.H * 0.5), r: 1.5, fill: rgba(theme.smoke, 0.3 + 0.5 * Math.abs(Math.sin(t * 2 + i * 1.9))) })),
      R("path", { d: "M -20 " + u.H + " L -20 " + (u.H - 170) + " Q " + (u.W * 0.3) + " " + (u.H - 260) + " " + (u.W * 0.6) + " " + (u.H - 180) + " T " + (u.W + 20) + " " + (u.H - 210) + " L " + (u.W + 20) + " " + u.H + " Z", fill: "#07070e" })),
  });

  /* ---- Stacks & Spines: shelf spines, lamp glow, dust motes ---- */
  FilmKit.make({
    global: "StacksSpines", variants: { Typing: "typewriter", Scroll: "stack", Toggle: "check", Notify: "side" },
    brand: "Stacks & Spines", desk: "#161c16", ambient: 1.4,
    FH: '"EB Garamond", serif', FB: '"Public Sans", sans-serif',
    palette: (t) => ({ green: t.green || "#223828", oak: "#8a6a42", lamp: t.lamp || "#2e6e4e", paper: "#f2ecdc", spine: "#a8402e" }),
    tweaks: [{ k: "green", label: "Reading room", options: ["#223828", "#2c2620", "#20303a"] }, { k: "lamp", label: "Lamp", options: ["#2e6e4e", "#6b4a2f", "#3e5c7a"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M4 19V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2zM19 17H6M9 3v14" })),
    cams: ["zoomOut", "pushL", "drop", "pushU", "zoomIn", "pushR"], camMul: 5, camOff: 2,
    mag: { rot: 0.3, driftX: 4, inn: 0.3, driftZ: 0.03 }, titlePreset: "drowse", itemPreset: "rise", titleLine: 1.08,
    look: {
      hook: { bg: "green", fg: "paper", hi: "spine", world: true, top: 330, size: 116, kicker: { v: "bare", c: "oak" } },
      statement: { bg: "#1a2c20", fg: "paper", hi: "spine", world: false, top: 630, size: 142 },
      feature: { bg: "green", fg: "paper", hi: "spine", world: true, top: 250, size: 92, card: { v: "paper", bg: "paper", r: 6, line: "green" }, chips: { v: "outline", colors: ["spine", "oak"], text: "paper" } },
      montage: { bg: "#1a2c20", fg: "paper", hi: "oak", world: false, top: 258, size: 90, tile: { bg: "green", line: "paper", label: "paper", r: 6 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "green", fg: "paper", hi: "spine", world: true, cols: ["spine", "oak", "paper"], num: 146 },
      cta: { bg: "spine", fg: "paper", hi: "oak", world: false, top: 500, size: 112, btn: { v: "block", bg: "paper", c: "green" }, logoShape: "rounded" },
      app: { bg: "green", fg: "paper", hi: "spine", cardBg: "#2e4636", line: "paper", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1].map((row) => R("g", { key: row, transform: "translate(0," + (u.H - 420 + row * 210) + ")" },
        R("line", { x1: 40, y1: 172, x2: u.W - 40, y2: 172, stroke: theme.oak, strokeWidth: 10 }),
        Array.from({ length: 16 }).map((_, i) => {
          const h = 110 + ((i * 37) % 56), w = 30 + ((i * 13) % 22);
          const x = 60 + i * ((u.W - 120) / 16);
          const cols = [theme.spine, theme.oak, rgba(theme.paper, 0.85), theme.lamp];
          const lean = (i % 7 === 3) ? 7 : 0;
          return R("g", { key: i, transform: "translate(" + x + "," + (170 - h) + ") rotate(" + lean + " 0 " + h + ")" },
            R("rect", { width: w, height: h, rx: 3, fill: cols[(i + row) % 4] }),
            R("line", { x1: 5, y1: 14, x2: w - 5, y2: 14, stroke: rgba(theme.paper, 0.5), strokeWidth: 2 }),
            R("line", { x1: 5, y1: h - 14, x2: w - 5, y2: h - 14, stroke: rgba(theme.paper, 0.5), strokeWidth: 2 }));
        }))),
      R("g", { transform: "translate(210,300)" },
        R("polygon", { points: "-150,-60 150,-60 90,160 -90,160", fill: rgba("#f6e6b0", 0.08) }),
        R("path", { d: "M -60 -50 q 0 -40 44 -40 h 60", fill: "none", stroke: theme.oak, strokeWidth: 9 }),
        R("path", { d: "M -100 -50 a 44 26 0 0 1 88 0 z", fill: theme.lamp }),
        R("circle", { cy: -38, cx: -56, r: 7, fill: "#f6e6b0", opacity: 0.7 + Math.sin(t * 2) * 0.2 })),
      Array.from({ length: 10 }).map((_, i) => {
        const ph = (t * (0.04 + (i % 3) * 0.02) + i * 0.1) % 1;
        return R("circle", { key: "m" + i, cx: 130 + ((i * 53) % 220) + Math.sin(t * 0.7 + i) * 16, cy: 240 + ph * 260, r: 1.8, fill: rgba("#f6e6b0", 0.45 * (1 - ph) + 0.05) });
      })),
  });

  /* ---- Rind & Wheel: cheese wheels on shelves, drips, thermometer ---- */
  FilmKit.make({
    global: "RindWheel", variants: { Toggle: "dial", Scroll: "board", DragDrop: "drag", Morph: "fade" },
    brand: "Rind & Wheel", desk: "#2a2420", ambient: 1.5,
    FH: '"Bree Serif", serif', FB: '"Sarala", sans-serif',
    palette: (t) => ({ cave: t.cave || "#3c3630", rind: t.rind || "#d9a441", paste: "#f4e8c8", wax: "#8c3a2e", ink: "#241f1a" }),
    tweaks: [{ k: "cave", label: "Cave", options: ["#3c3630", "#332e36", "#2e3a32"] }, { k: "rind", label: "Rind", options: ["#d9a441", "#c98a3a", "#b8743d"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M3 16v-5a18 18 0 0 1 18 0v5zM3 16h18" }), R2("circle", { cx: 9, cy: 12, r: 1 }), R2("circle", { cx: 15, cy: 13, r: 1.4 })),
    cams: ["zoomIn", "pushL", "drop", "pushR", "zoomOut", "hopU"], camMul: 5, camOff: 1,
    mag: { rot: 0.5, inn: 0.26, driftX: 5 }, titlePreset: "stamp", itemPreset: "rise", titleLine: 1.08,
    look: {
      hook: { bg: "cave", fg: "paste", hi: "rind", world: true, top: 330, size: 118, kicker: { v: "pill", bg: "rind", c: "ink" } },
      statement: { bg: "wax", fg: "paste", hi: "rind", world: false, top: 630, size: 144 },
      feature: { bg: "cave", fg: "paste", hi: "rind", world: true, top: 250, size: 94, card: { v: "frame", bg: "ink", r: 16, line: "paste" }, chips: { v: "pill", colors: ["rind", "wax"], text: "paste" } },
      montage: { bg: "ink", fg: "paste", hi: "rind", world: false, top: 258, size: 90, tile: { bg: "cave", line: "paste", label: "rind", r: 12 }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "cave", fg: "paste", hi: "rind", world: true, cols: ["rind", "wax", "paste"], num: 148 },
      cta: { bg: "rind", fg: "ink", hi: "paste", world: false, top: 500, size: 114, btn: { v: "block", bg: "ink", c: "paste" }, logoShape: "circle" },
      app: { bg: "cave", fg: "paste", hi: "rind", cardBg: "#4a423a", line: "paste", world: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1].map((row) => R("g", { key: row },
        R("line", { x1: u.W - 480, y1: 300 + row * 220, x2: u.W - 60, y2: 300 + row * 220, stroke: rgba(theme.paste, 0.4), strokeWidth: 8 }),
        [0, 1, 2].map((i) => R("g", { key: i, transform: "translate(" + (u.W - 410 + i * 140) + "," + (262 + row * 220) + ")" },
          R("ellipse", { rx: 58, ry: 34, fill: theme.rind }),
          R("ellipse", { cy: -10, rx: 58, ry: 30, fill: (i + row) % 2 ? theme.paste : theme.rind }),
          ((i + row) % 2 === 0) && R("ellipse", { cy: -10, rx: 58, ry: 30, fill: "none", stroke: rgba(theme.ink, 0.25), strokeWidth: 3 }),
          ((i + row) % 3 === 1) && R("path", { d: "M -58 -10 a 58 30 0 0 1 58 -30 l 0 30 z", fill: theme.wax }))))),
      (function () {
        const dr = (t * 0.3) % 1;
        return R("g", null,
          R("circle", { cx: 170, cy: 240 + dr * 500, r: 6 * (1 - dr * 0.5), fill: rgba(theme.paste, 0.5 * (1 - dr)) }),
          R("circle", { cx: 240, cy: 200 + ((dr + 0.4) % 1) * 500, r: 5, fill: rgba(theme.paste, 0.4 * (1 - ((dr + 0.4) % 1))) }));
      })(),
      R("g", { transform: "translate(150," + (u.H - 420) + ")" },
        R("rect", { x: -12, y: -130, width: 24, height: 180, rx: 12, fill: "none", stroke: rgba(theme.paste, 0.6), strokeWidth: 4 }),
        R("circle", { cy: 66, r: 22, fill: theme.wax }),
        R("rect", { x: -6, y: -60 - Math.sin(t * 0.6) * 20, width: 12, height: 126 + Math.sin(t * 0.6) * 20, rx: 6, fill: theme.wax }),
        R("text", { x: 34, y: -96, fontFamily: '"Sarala", sans-serif', fontSize: 24, fill: rgba(theme.paste, 0.6) }, "11°C"),
        R("text", { x: 34, y: -64, fontFamily: '"Sarala", sans-serif', fontSize: 24, fill: rgba(theme.paste, 0.6) }, "94% RH")),
      R("ellipse", { cx: u.W / 2, cy: 170, rx: 420, ry: 90, fill: "none", stroke: rgba(theme.ink, 0.5), strokeWidth: 60 })),
  });

  /* ---- Prop Wash: LED gates, banking quad, streaks ---- */
  FilmKit.make({
    global: "PropWash", variants: { Cursor: "slider", Ring: "bar", Notify: "side", Code: "diff" },
    brand: "Prop Wash", desk: "#0e1014", ambient: 2.0,
    FH: '"Orbitron", sans-serif', FB: '"Exo 2", sans-serif',
    palette: (t) => ({ carbon: t.carbon || "#14161a", cyan: t.cyan || "#29d3e8", magenta: "#ff2e88", grey: "#aab4c0", white: "#f0f4f6" }),
    tweaks: [{ k: "carbon", label: "Course", options: ["#14161a", "#161420", "#101816"] }, { k: "cyan", label: "Gates", options: ["#29d3e8", "#3ddc84", "#ffd23c"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("circle", { cx: 5.5, cy: 5.5, r: 2.5 }), R2("circle", { cx: 18.5, cy: 5.5, r: 2.5 }), R2("circle", { cx: 5.5, cy: 18.5, r: 2.5 }), R2("circle", { cx: 18.5, cy: 18.5, r: 2.5 }), R2("rect", { x: 9, y: 9, width: 6, height: 6, rx: 1.5 })),
    cams: ["pushL", "zoomIn", "spin", "pushR", "pushU", "drop"], camMul: 7, camOff: 3,
    mag: { skew: 6, rot: 1.3, inn: 0.15, slide: 0.34 }, titlePreset: "streak", itemPreset: "slam", titleSpace: "0.04em",
    look: {
      hook: { bg: "carbon", fg: "white", hi: "cyan", world: true, top: 310, size: 108, upper: true, kicker: { v: "tag", bg: "magenta", c: "white" } },
      statement: { bg: "cyan", fg: "carbon", hi: "magenta", world: false, top: 630, size: 132, upper: true },
      feature: { bg: "carbon", fg: "white", hi: "cyan", world: true, top: 248, size: 88, upper: true, card: { v: "glow", bg: "#101216", glow: "cyan", r: 12, line: "white" }, chips: { v: "square", colors: ["cyan", "magenta", "grey"], text: "carbon" } },
      montage: { bg: "#101216", fg: "white", hi: "cyan", world: false, top: 258, size: 86, upper: true, tile: { bg: "carbon", line: "white", label: "cyan", r: 8, glow: "magenta" }, tilts: [-2, 2, 1.5, -2] },
      stats: { bg: "carbon", fg: "white", hi: "cyan", world: true, cols: ["cyan", "magenta", "grey"], num: 144, upper: true, glowNums: true },
      cta: { bg: "#101216", fg: "white", hi: "cyan", world: true, top: 500, size: 104, upper: true, btn: { v: "glow", bg: "cyan", c: "carbon" }, logoShape: "rounded" },
      app: { bg: "carbon", fg: "white", hi: "cyan", cardBg: "#1c2026", line: "white", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1, 2].map((i) => {
        const ph = ((t * 0.5 + i / 3) % 1);
        const s = 0.3 + ph * 1.2, o = ph < 0.85 ? 0.7 : 0.7 * (1 - (ph - 0.85) / 0.15);
        return R("rect", { key: i, x: u.W / 2 - 170 * s, y: u.H / 2 - 240 * s - 100, width: 340 * s, height: 380 * s, rx: 40 * s, fill: "none", stroke: rgba(i % 2 ? theme.magenta : theme.cyan, o), strokeWidth: 10 * s });
      }),
      (function () {
        const bank = Math.sin(t * 1.4) * 30;
        const dx = u.W / 2 + Math.sin(t * 0.9) * 200, dy = u.H / 2 - 100 + Math.cos(t * 1.3) * 120;
        return R("g", { transform: "translate(" + dx + "," + dy + ") rotate(" + bank + ")" },
          R("rect", { x: -26, y: -12, width: 52, height: 24, rx: 8, fill: theme.white }),
          [[-38, -26], [38, -26], [-38, 26], [38, 26]].map(([ox, oy], k) => R("g", { key: k },
            R("line", { x1: 0, y1: 0, x2: ox, y2: oy, stroke: theme.grey, strokeWidth: 6 }),
            R("ellipse", { cx: ox, cy: oy, rx: 22, ry: 6, fill: "none", stroke: rgba(theme.cyan, 0.8), strokeWidth: 3, transform: "rotate(" + t * 900 % 360 + " " + ox + " " + oy + ")" }))),
          R("circle", { cx: 0, cy: -4, r: 6, fill: theme.magenta }));
      })(),
      [0, 1, 2, 3].map((i) => R("line", { key: "s" + i, x1: ((i * 300 - t * 1000) % (u.W + 400) + (u.W + 400)) % (u.W + 400) - 200, y1: 220 + i * 160, x2: ((i * 300 - t * 1000) % (u.W + 400) + (u.W + 400)) % (u.W + 400) - 60, y2: 220 + i * 160, stroke: rgba(i % 2 ? theme.magenta : theme.cyan, 0.5), strokeWidth: 5 - i, strokeLinecap: "round" })),
      R("text", { x: u.W - 50, y: u.H - 140, textAnchor: "end", fontFamily: '"Orbitron", sans-serif', fontSize: 30, fill: rgba(theme.cyan, 0.7) }, "LAP " + (1 + Math.floor(t * 0.3) % 9) + " \u00b7 " + (18 + Math.floor(Math.abs(Math.sin(t)) * 9)) + ".4s")),
  });

  /* ---- Tube & Glow: neon OPEN sign flicker, tube bends, hum dots ---- */
  FilmKit.make({
    global: "TubeGlow", variants: { Cursor: "click", Toggle: "switch", Morph: "fade", Typing: "caret" },
    brand: "Tube & Glow", desk: "#0c0a10", ambient: 1.7,
    FH: '"Monoton", cursive', FB: '"Epilogue", sans-serif',
    palette: (t) => ({ shop: t.shop || "#121016", pink: t.pink || "#ff3ec8", blue: "#2ee6ff", warm: "#fff3d6", ink: "#0d0b11" }),
    tweaks: [{ k: "shop", label: "Workshop", options: ["#121016", "#100e18", "#14100c"] }, { k: "pink", label: "Neon", options: ["#ff3ec8", "#ff5a36", "#b44bff"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M4 16c0-6 4-10 8-10s8 4 8 10M8 16v3M16 16v3" })),
    cams: ["zoomIn", "pushR", "drop", "pushL", "zoomOut", "spin"], camMul: 7, camOff: 2,
    mag: { rot: 0.8, inn: 0.2 }, titlePreset: "machete", itemPreset: "pop", titleLine: 1.22, titleSpace: "0.05em",
    look: {
      hook: { bg: "shop", fg: "warm", hi: "pink", world: true, top: 320, size: 92, upper: true, kicker: { v: "outline", c: "blue" } },
      statement: { bg: "ink", fg: "warm", hi: "pink", world: true, top: 630, size: 108, upper: true },
      feature: { bg: "shop", fg: "warm", hi: "blue", world: true, top: 250, size: 78, upper: true, card: { v: "glow", bg: "#0e0c12", glow: "pink", r: 16, line: "warm" }, chips: { v: "pill", colors: ["pink", "blue"], text: "ink" } },
      montage: { bg: "ink", fg: "warm", hi: "pink", world: false, top: 258, size: 76, upper: true, tile: { bg: "shop", line: "warm", label: "blue", r: 12, glow: "pink" }, tilts: [-2, 1.5, 2, -1.5] },
      stats: { bg: "shop", fg: "warm", hi: "pink", world: true, cols: ["pink", "blue", "warm"], num: 130, upper: true, glowNums: true },
      cta: { bg: "ink", fg: "warm", hi: "blue", world: true, top: 500, size: 86, upper: true, btn: { v: "glow", bg: "pink", c: "warm" }, logoShape: "circle" },
      app: { bg: "shop", fg: "warm", hi: "pink", cardBg: "#1c1822", line: "warm", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      (function () {
        const flick = Math.sin(t * 11) > -0.7 && Math.sin(t * 3.7) > -0.85;
        return R("g", { transform: "translate(" + (u.W - 250) + ",240)" },
          R("rect", { x: -160, y: -80, width: 320, height: 160, rx: 20, fill: "none", stroke: rgba(theme.blue, flick ? 0.9 : 0.2), strokeWidth: 5 }),
          R("text", { y: 22, textAnchor: "middle", fontFamily: '"Monoton", cursive', fontSize: 64, fill: flick ? theme.pink : rgba(theme.pink, 0.25), style: { filter: flick ? "drop-shadow(0 0 14px " + theme.pink + ")" : "none" } }, "OPEN"));
      })(),
      R("path", { d: "M 100 " + (u.H - 420) + " q 60 -90 120 0 t 120 0 t 120 0", fill: "none", stroke: rgba(theme.blue, 0.7), strokeWidth: 7, strokeLinecap: "round", style: { filter: "drop-shadow(0 0 10px " + theme.blue + ")" } }),
      R("path", { d: "M 120 " + (u.H - 260) + " h 90 q 40 0 40 -40 v -30", fill: "none", stroke: rgba(theme.pink, 0.6), strokeWidth: 6, strokeLinecap: "round" }),
      [0, 1, 2].map((i) => R("circle", { key: i, cx: 150 + i * 70, cy: u.H - 200, r: 5, fill: rgba(theme.warm, 0.3 + 0.5 * Math.abs(Math.sin(t * 4 + i))) })),
      R("g", { transform: "translate(200,320) rotate(-6)" },
        R("line", { x1: 0, y1: 0, x2: 0, y2: 260, stroke: rgba(theme.warm, 0.35), strokeWidth: 7 }),
        R("line", { x1: 70, y1: 0, x2: 70, y2: 260, stroke: rgba(theme.warm, 0.35), strokeWidth: 7 }),
        [0, 1, 2, 3].map((i) => R("line", { key: i, x1: 0, y1: 40 + i * 60, x2: 70, y2: 40 + i * 60, stroke: rgba(theme.warm, 0.35), strokeWidth: 6 }))),
      R("circle", { cx: u.W - 130, cy: u.H - 300, r: 30 + Math.sin(t * 2) * 4, fill: "none", stroke: rgba(theme.pink, 0.4), strokeWidth: 3 })),
  });

  /* ---- Front & Isobar: isobars, wind barbs, cold front, rain hatch ---- */
  FilmKit.make({
    global: "FrontIsobar", variants: { Typing: "terminal", Ring: "gauge", Scroll: "board", Notify: "drop" },
    brand: "Front & Isobar", desk: "#d8d2c0", ambient: 1.6,
    FH: '"Space Mono", monospace', FB: '"Familjen Grotesk", sans-serif',
    palette: (t) => ({ chart: t.chart || "#f0ead8", isobar: t.isobar || "#2e5fb3", warn: "#e8641f", slate: "#37424e", ink: "#1e242c" }),
    tweaks: [{ k: "chart", label: "Chart", options: ["#f0ead8", "#e8e8e0", "#f0e0c8"] }, { k: "isobar", label: "Isobars", options: ["#2e5fb3", "#2e7a6e", "#7a2e5f"] }],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round" }, R2("path", { d: "M3 8h13a3 3 0 1 0-3-3M3 12h17a3 3 0 1 1-3 3M3 16h9a3 3 0 1 1-3 3" })),
    cams: ["pushL", "zoomOut", "pushU", "pushR", "zoomIn", "drop"], camMul: 5, camOff: 0,
    mag: { rot: 0.4, slide: 0.28, driftX: 6 }, titlePreset: "rise", itemPreset: "machete", titleLine: 1.14, titleSpace: "0.01em",
    look: {
      hook: { bg: "chart", fg: "ink", hi: "warn", world: true, top: 320, size: 96, upper: true, kicker: { v: "tag", bg: "isobar", c: "chart" } },
      statement: { bg: "slate", fg: "chart", hi: "warn", world: false, top: 630, size: 116, upper: true },
      feature: { bg: "chart", fg: "ink", hi: "isobar", world: true, top: 250, size: 82, upper: true, card: { v: "frame", bg: "slate", r: 10, line: "chart" }, chips: { v: "square", colors: ["isobar", "warn"], text: "chart" } },
      montage: { bg: "slate", fg: "chart", hi: "warn", world: false, top: 258, size: 80, upper: true, tile: { bg: "chart", line: "ink", label: "chart", r: 8 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "chart", fg: "ink", hi: "isobar", world: true, cols: ["isobar", "warn", "slate"], num: 138, upper: true, rule: true },
      cta: { bg: "isobar", fg: "chart", hi: "warn", world: false, top: 500, size: 96, upper: true, btn: { v: "block", bg: "chart", c: "ink" }, logoShape: "rounded" },
      app: { bg: "chart", fg: "ink", hi: "isobar", cardBg: "#faf6ea", line: "ink", world: true, upper: true },
    },
    World: (theme, t, p, u) => R("g", null,
      [0, 1, 2, 3].map((i) => {
        const pts = Array.from({ length: 8 }).map((_, k) => {
          const x = (k / 7) * u.W;
          const y = 260 + i * 120 + Math.sin(t * 0.4 + k * 0.8 + i * 1.2) * 30 + i * 10;
          return (k ? "L" : "M") + x + " " + y;
        }).join(" ");
        return R("path", { key: i, d: pts, fill: "none", stroke: rgba(theme.isobar, 0.45 - i * 0.07), strokeWidth: 3 });
      }),
      R("text", { x: 70, y: 250, fontFamily: '"Space Mono", monospace', fontSize: 24, fill: rgba(theme.isobar, 0.7) }, "1016"),
      R("text", { x: 70, y: 370, fontFamily: '"Space Mono", monospace', fontSize: 24, fill: rgba(theme.isobar, 0.6) }, "1012"),
      (function () {
        const fx = ((t * 60) % (u.W + 300)) - 150;
        return R("g", null,
          R("path", { d: "M " + fx + " " + (u.H - 500) + " q 120 -60 260 -20", fill: "none", stroke: theme.isobar, strokeWidth: 6 }),
          [0.25, 0.55, 0.85].map((f, k) => {
            const bx = fx + 260 * f, by = u.H - 500 - 40 * Math.sin(f * Math.PI);
            return R("polygon", { key: k, points: bx + "," + by + " " + (bx + 26) + "," + (by - 6) + " " + (bx + 8) + "," + (by - 26), fill: theme.isobar });
          }));
      })(),
      [[u.W - 260, 300], [u.W - 150, 420]].map(([x, y], i) => R("g", { key: "b" + i, transform: "translate(" + x + "," + y + ") rotate(" + (30 + Math.sin(t * 0.7 + i) * 14) + ")" },
        R("line", { x1: 0, y1: 0, x2: 0, y2: 70, stroke: theme.ink, strokeWidth: 4 }),
        R("line", { x1: 0, y1: 0, x2: 22, y2: -10, stroke: theme.ink, strokeWidth: 4 }),
        R("line", { x1: 0, y1: 14, x2: 18, y2: 5, stroke: theme.ink, strokeWidth: 4 }))),
      R("g", { opacity: 0.5 }, Array.from({ length: 6 }).map((_, i) => R("line", { key: i, x1: 90 + i * 26, y1: u.H - 320 + ((t * 140 + i * 20) % 60), x2: 80 + i * 26, y2: u.H - 296 + ((t * 140 + i * 20) % 60), stroke: theme.isobar, strokeWidth: 4, strokeLinecap: "round" }))),
      R("circle", { cx: u.W - 180, cy: u.H - 280, r: 44, fill: "none", stroke: theme.warn, strokeWidth: 5, strokeDasharray: "10 8", transform: "rotate(" + t * 30 + " " + (u.W - 180) + " " + (u.H - 280) + ")" }),
      R("text", { x: u.W - 180, y: u.H - 270, textAnchor: "middle", fontFamily: '"Space Mono", monospace', fontSize: 28, fill: theme.warn }, "L")),
  });
})();
