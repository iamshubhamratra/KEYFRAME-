/* article-pack-01.js — cohort 01, technical / documentation: packs 02-05.
   (Pack 01, Margin Notes, ships in margin-notes-pack.js.)
   Each FilmKit.make(cfg) is one template identity. Hexes live only in
   palette(); look and World name slots. chrome:false on every pack — a
   generated video carries the user's brand, never the template's.
   Every World builds three planes: a patterned far field, a mid-plane object
   with mass and secondary motion, and a fast near plane. Objects stay in the
   lower band or the margins so they never pass behind a text block. */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  /* ── 02 PATCH LOG — proof press: warm paper, wonky serif, a rubber stamp ── */
  FilmKit.make({
    global: "PatchLog", brand: "Patch Log", desk: "#d3ccbd", ambient: 2.3, chrome: false,
    FH: '"Fraunces", Georgia, serif',
    FB: '"Public Sans", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "flip", itemPreset: "stamp", titleLine: 1.08, titleSpace: "-0.02em",
    /* ladder: bg .86 / surface .95 / rule .72 / inkMuted .44 / ink .07 / accent .36 / accent2 .48 */
    palette: (t) => ({
      bg: t.bg || "#e9e1cf", surface: "#faf6ec", rule: "#c8bda4", inkMuted: "#6d6553",
      ink: "#171410", accent: t.accent || "#2f6f3e", accent2: t.accent2 || "#d4762f", accentInk: "#faf6ec",
    }),
    tweaks: [
      { k: "bg", label: "Paper", options: ["#e9e1cf", "#ece6d8", "#e6e2d2"] },
      { k: "accent", label: "Ink", options: ["#2f6f3e", "#2a5f86", "#6a4a86"] },
      { k: "accent2", label: "Stamp", options: ["#d4762f", "#c33f3f", "#b0902a"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(130% 80% at 18% 6%, " + rgba(theme.surface, 0.95) + " 0%, " + bg + " 58%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M7 3h10l1 7H6z" }), R2("path", { d: "M4 14h16v6H4z" })),
    cams: ["pushL", "pushR", "pushU", "pushD"], camMul: 1, camOff: 0,
    mag: { rot: 0.2, skew: 0, driftX: 5, driftY: 4, driftZ: 0.02, slide: 0.18, inn: 0.16, zin: 0.24, zout: 0.2 },
    variants: { Typing: "typewriter", Scroll: "feed", Ring: "bar" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 320, size: 106, kicker: { v: "tag", bg: "accent2", c: "accentInk" } },
      statement: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 620, size: 122 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: 72, bodySize: 37, ch: 52, lh: 1.55, weight: 400, dim: 0.9, footer: false, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 400, size: 80, ch: 24, lh: 1.2, markSize: 200, rule: true },
      feature: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 260, size: 88, swap: "body", card: { v: "paper", bg: "surface", r: 6, line: "inkMuted" }, chips: { v: "square", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: 82, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 4, h: 640, labelSize: 40 }, tilts: [-1, 1, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 400, size: 84, cols: ["accent2", "accent", "ink"], num: 140, rule: true },
      cta: { bg: "ink", fg: "surface", hi: "accent2", world: true, top: 470, size: 100, align: "left", btn: { v: "block", bg: "accent2", c: "accentInk" }, logoShape: "rounded" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — a cylinder press. Far: halftone paper on a fast drift, two ink
       ribbons sliding at different speeds, a registration wheel turning in the
       corner. Mid: an ink roller runs a 6s ping-pong along the bed, its cylinder
       rotating exactly as far as it travels, laying a printed band and throwing
       droplets; loose type slugs rise through the frame behind it. Near: paper
       scraps. Nothing crosses the text column above y=H-560. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, cyc = (t % 6) / 6;
      const inv = theme.currentBg === theme.ink;
      const tint = inv ? theme.surface : theme.inkMuted;
      const dotA = inv ? 0.13 : 0.1;
      const tri = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;
      const ease01 = E.inOut(tri);
      const bed = H - 330, rx = 150 + ease01 * (W - 300);
      const roll = ((rx - 150) / 76) * 57.3;
      const dots = (t * 26) % 52;
      const band = 0.18 + 0.82 * ease01;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "pl-dots", width: 52, height: 52, patternUnits: "userSpaceOnUse", patternTransform: "translate(0," + (-dots).toFixed(1) + ")" },
            R("circle", { cx: 13, cy: 13, r: 7, fill: rgba(tint, dotA) }),
            R("circle", { cx: 39, cy: 39, r: 4, fill: rgba(theme.accent2, 0.13) })),
          R("radialGradient", { id: "pl-glow", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent2, 0.24) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent2, 0) }))),
        R("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#pl-dots)" }),
        R("circle", { cx: W * 0.84, cy: 300, r: 430, fill: "url(#pl-glow)" }),
        /* ink ribbons, two speeds */
        R("path", { d: "M -80 " + (H - 980 + Math.sin(t * 0.5) * 40) + " L " + (W + 80) + " " + (H - 1180 + Math.cos(t * 0.4) * 40) + " L " + (W + 80) + " " + (H - 1080) + " L -80 " + (H - 880) + " Z", fill: rgba(theme.accent, 0.15) }),
        R("path", { d: "M -80 " + (H - 700 + Math.cos(t * 0.7) * 34) + " L " + (W + 80) + " " + (H - 860 + Math.sin(t * 0.6) * 34) + " L " + (W + 80) + " " + (H - 700) + " L -80 " + (H - 540) + " Z", fill: rgba(theme.accent2, 0.14) }),
        /* registration wheel, top corner */
        R("g", { transform: "translate(" + (W - 30) + ",170) rotate(" + ((t * 34) % 360).toFixed(1) + ")" },
          R("circle", { r: 96, fill: "none", stroke: rgba(tint, 0.4), strokeWidth: 7 }),
          R("circle", { r: 44, fill: "none", stroke: rgba(theme.accent, 0.4), strokeWidth: 5 }),
          [0, 1, 2, 3, 4, 5].map((i) => R("line", { key: "sp" + i, x1: Math.cos(i * Math.PI / 3) * 44, y1: Math.sin(i * Math.PI / 3) * 44, x2: Math.cos(i * Math.PI / 3) * 96, y2: Math.sin(i * Math.PI / 3) * 96, stroke: rgba(tint, 0.34), strokeWidth: 6 }))),
        /* type slugs rising */
        [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const ph = (t * (0.11 + i * 0.014) + i * 0.13) % 1;
          const x = 96 + i * 132 + Math.sin(t * 0.7 + i) * 30, y = H - ph * (H + 260);
          const sc = 0.8 + (i % 3) * 0.35;
          return R("g", { key: "ty" + i, opacity: 0.72 * (1 - ph * 0.8), transform: "translate(" + x.toFixed(1) + "," + y.toFixed(1) + ") rotate(" + (ph * 120 + i * 24).toFixed(1) + ") scale(" + sc.toFixed(2) + ")" },
            R("rect", { x: -22, y: -28, width: 44, height: 56, rx: 4, fill: rgba(tint, 0.3) }),
            R("rect", { x: -12, y: -16, width: 24, height: 6, rx: 3, fill: rgba(theme.accent2, 0.55) }),
            R("rect", { x: -12, y: -2, width: 24, height: 15, rx: 3, fill: rgba(theme.accent, 0.45) }));
        }),
        /* proof column running up the right margin */
        R("g", { opacity: 0.5 },
          Array.from({ length: 16 }).map((_, i) => {
            const yy = ((i * 92 - (t * 58) % 92) % (H + 92)) - 46;
            return R("rect", { key: "pc" + i, x: W - 138, y: yy, width: 62 - (i % 3) * 16, height: 7, rx: 3.5, fill: rgba(tint, 0.4) });
          })),
        /* the printed band the roller lays down */
        R("rect", { x: 90, y: bed + 66, width: (W - 180) * band, height: 74, rx: 6, fill: rgba(theme.accent, 0.16) }),
        [0, 1, 2, 3, 4, 5, 6].map((i) => R("rect", { key: "ln" + i, x: 120 + i * 128, y: bed + 88, width: Math.max(0, Math.min(96, (W - 180) * band - i * 128)), height: 10, rx: 5, fill: rgba(inv ? theme.surface : theme.ink, 0.3) })),
        /* the bed and the roller */
        R("line", { x1: 60, y1: bed + 40, x2: W - 60, y2: bed + 40, stroke: rgba(tint, 0.5), strokeWidth: 8, strokeLinecap: "round" }),
        R("g", { transform: "translate(" + rx.toFixed(1) + "," + bed + ")" },
          R("ellipse", { cx: 0, cy: 52, rx: 92, ry: 13, fill: rgba(theme.ink, 0.22) }),
          R("g", { transform: "rotate(" + roll.toFixed(1) + ")" },
            R("circle", { r: 76, fill: rgba(theme.surface, 0.96), stroke: rgba(theme.ink, 0.5), strokeWidth: 5 }),
            [0, 1, 2, 3].map((i) => R("path", { key: "tr" + i, d: "M 0 0 L " + (Math.cos(i * Math.PI / 2) * 76).toFixed(1) + " " + (Math.sin(i * Math.PI / 2) * 76).toFixed(1), stroke: rgba(theme.accent, 0.5), strokeWidth: 7, strokeLinecap: "round" })),
            R("circle", { r: 26, fill: rgba(theme.accent, 0.9) })),
          R("path", { d: "M -12 -76 L 12 -76 L 8 -150 L -8 -150 Z", fill: rgba(theme.inkMuted, 0.9) }),
          R("rect", { x: -58, y: -186, width: 116, height: 44, rx: 12, fill: rgba(theme.ink, 0.92) }),
          R("rect", { x: -40, y: -176, width: 44, height: 12, rx: 6, fill: rgba(theme.surface, 0.3) })),
        /* droplets thrown off the roller */
        [0, 1, 2, 3].map((i) => {
          const ph = ((t * 1.4 + i * 0.25) % 1);
          return R("circle", { key: "dp" + i, cx: rx - 40 + i * 26 + ph * 40, cy: bed - 20 - ph * 130 + ph * ph * 150, r: 7 - i, fill: rgba(theme.accent, 0.5 * (1 - ph)) });
        }),
        /* near plane */
        [0, 1, 2, 3, 4].map((i) => {
          const ph = (t * (0.22 + i * 0.04) + i * 0.23) % 1;
          const x = 140 + i * 200 + Math.sin(t * 1.2 + i) * 46, y = H - ph * (H + 200);
          return R("path", { key: "sc" + i, d: "M 0 0 l 24 -7 l 7 22 l -22 9 z", fill: rgba(tint, 0.26 * (1 - ph)), transform: "translate(" + x.toFixed(1) + "," + y.toFixed(1) + ") rotate(" + (ph * 340 + i * 50).toFixed(1) + ")" });
        }));
    },
  });

  /* ── 03 SPEC SHEET — scan bay: perspective floor, wide display, radar dish ── */
  FilmKit.make({
    global: "SpecSheet", brand: "Spec Sheet", desk: "#080d11", ambient: 1.35, chrome: false,
    FH: '"Russo One", "Helvetica Neue", sans-serif',
    FB: '"Radio Canada", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "rise", itemPreset: "pop", titleLine: 1.1, titleSpace: "0.005em",
    /* ladder: bg .035 / surface .08 / rule .16 / inkMuted .4 / ink .85 / accent .5 / accent2 .55 */
    palette: (t) => ({
      bg: t.bg || "#0f1720", surface: "#1a2732", rule: "#2f4655", inkMuted: "#93aab8",
      ink: "#ecf4f9", accent: t.accent || "#37b5ff", accent2: t.accent2 || "#7ff0cf", accentInk: "#04121b",
    }),
    tweaks: [
      { k: "bg", label: "Bay", options: ["#0f1720", "#101a1e", "#0e1622"] },
      { k: "accent", label: "Beam", options: ["#37b5ff", "#ff8a3d", "#b98dff"] },
      { k: "accent2", label: "Return", options: ["#7ff0cf", "#f0e07f", "#f08fb0"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(120% 70% at 50% 96%, " + rgba(theme.accent, 0.22) + " 0%, transparent 62%), radial-gradient(100% 60% at 78% 8%, " + rgba(theme.surface, 0.9) + " 0%, transparent 70%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M4 20L14 6a6 6 0 014 4L8 20z" }), R2("path", { d: "M3 20h18" })),
    cams: ["zoomIn", "pushU", "zoomOut", "pushD", "pushL", "pushR"], camMul: 5, camOff: 4,
    mag: { rot: 0.2, driftX: 5, driftY: 6, driftZ: 0.06, slide: 0.2, inn: 0.22, zin: 0.44, zout: 0.34 },
    variants: { Ring: "ring", Scroll: "board", Typing: "caret" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 92, upper: true, kicker: { v: "outline", c: "accent2" } },
      statement: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 600, size: 108, upper: true },
      body: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 560, size: 68, bodySize: 38, ch: 50, lh: 1.5, weight: 400, dim: 0.92, kicker: { v: "bare", c: "accent2" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 380, size: 72, ch: 24, lh: 1.2, markSize: 180, altLine: true },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 250, size: 82, upper: true, swap: "body", card: { v: "glow", bg: "surface", glow: "accent", r: 18, line: "inkMuted" }, chips: { v: "outline", colors: ["accent", "accent2", "ink"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 330, size: 78, upper: true, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 18, h: 640, labelSize: 38 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 380, size: 80, upper: true, cols: ["accent", "accent2", "ink"], num: 152, glowNums: true },
      cta: { bg: "accent", fg: "accentInk", hi: "surface", world: false, top: 460, size: 94, upper: true, align: "center", btn: { v: "glow", bg: "accentInk", c: "ink" }, logoShape: "circle" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — a scan bay. Far: a perspective floor converging on a vanishing
       point, over a tick pattern, with a horizon glow. Mid: a dish antenna on a
       mast sweeps a 12s arc; its beam wedge rotates with it and return pulses
       expand from the rim. Near: bokeh discs rising fast. Everything sits below
       the horizon line at H*0.62, clear of every text block. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, hz = H * 0.62, vx = W * 0.5;
      const sweep = Math.sin((t / 12) * Math.PI * 2) * 34;
      const dx = W * 0.72, dy = H - 420;
      const pulse = (t % 3) / 3;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "ss-tick", width: 84, height: 84, patternUnits: "userSpaceOnUse" },
            R("path", { d: "M42 36v12M36 42h12", stroke: rgba(theme.rule, 0.55), strokeWidth: 2 })),
          R("radialGradient", { id: "ss-hz", cx: "50%", cy: "100%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent, 0.34) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent, 0) })),
          R("linearGradient", { id: "ss-beam", x1: "0%", y1: "0%", x2: "100%", y2: "0%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent, 0.5) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent, 0) }))),
        R("rect", { x: 0, y: 0, width: W, height: hz, fill: "url(#ss-tick)" }),
        R("ellipse", { cx: vx, cy: hz + 40, rx: W * 0.9, ry: 300, fill: "url(#ss-hz)" }),
        R("line", { x1: 0, y1: hz, x2: W, y2: hz, stroke: rgba(theme.accent, 0.5), strokeWidth: 3 }),
        R("g", { opacity: 0.7 },
          [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((i) => R("line", { key: "p" + i, x1: vx + i * 46, y1: hz, x2: vx + i * 430, y2: H, stroke: rgba(theme.rule, 0.75), strokeWidth: 2 })),
          [0.16, 0.36, 0.62, 1].map((f, i) => R("line", { key: "h" + i, x1: 0, y1: hz + f * (H - hz), x2: W, y2: hz + f * (H - hz), stroke: rgba(theme.rule, 0.6), strokeWidth: 2 }))),
        /* dish */
        R("g", { transform: "translate(" + dx + "," + dy + ")" },
          R("ellipse", { cx: 0, cy: 176, rx: 130, ry: 20, fill: rgba(theme.accentInk, 0.6) }),
          R("path", { d: "M -18 170 L 18 170 L 10 40 L -10 40 Z", fill: rgba(theme.surface, 0.98), stroke: rgba(theme.inkMuted, 0.4), strokeWidth: 2 }),
          R("path", { d: "M -70 176 h 140", stroke: rgba(theme.inkMuted, 0.5), strokeWidth: 6, strokeLinecap: "round" }),
          R("g", { transform: "rotate(" + sweep.toFixed(2) + ")" },
            R("path", { d: "M 0 0 L 300 -150 L 300 150 Z", fill: "url(#ss-beam)", opacity: 0.75 }),
            R("path", { d: "M -104 -96 A 128 128 0 0 1 -104 96 L -58 62 A 74 74 0 0 0 -58 -62 Z", fill: rgba(theme.surface, 0.96), stroke: rgba(theme.accent, 0.55), strokeWidth: 3 }),
            R("path", { d: "M -104 -96 A 128 128 0 0 1 -80 -50 L -58 -62 A 74 74 0 0 0 -70 -78 Z", fill: rgba(theme.ink, 0.16) }),
            R("line", { x1: -74, y1: 0, x2: 30, y2: 0, stroke: rgba(theme.inkMuted, 0.7), strokeWidth: 5 }),
            R("circle", { cx: 34, cy: 0, r: 13, fill: rgba(theme.accent2, 0.95) })),
          [0, 1, 2].map((i) => {
            const ph = (pulse + i / 3) % 1;
            return R("circle", { key: "r" + i, cx: 0, cy: 0, r: 60 + ph * 300, fill: "none", stroke: rgba(theme.accent2, 0.32 * (1 - ph)), strokeWidth: 4 });
          })),
        /* near plane */
        [0, 1, 2, 3, 4, 5].map((i) => {
          const ph = (t * (0.13 + i * 0.02) + i * 0.19) % 1;
          return R("circle", { key: "b" + i, cx: 90 + i * 190 + Math.sin(t * 0.6 + i) * 34, cy: H - ph * (H + 200), r: 5 + (i % 3) * 6, fill: rgba(theme.accent, 0.2 * (1 - ph)) });
        }));
    },
  });

  /* ── 04 ROOT PATH — dark ground, amber accent, patrol drone ── */
  FilmKit.make({
    global: "RootPath", brand: "Root Path", desk: "#0d0b09", ambient: 1.5, chrome: false,
    FH: '"Chakra Petch", "Helvetica Neue", sans-serif',
    FB: '"Sarabun", system-ui, sans-serif',
    FM: '"Space Mono", ui-monospace, monospace',
    titlePreset: "slam", itemPreset: "rise", titleLine: 1.04, titleSpace: "-0.015em",
    /* ladder: bg .03 / surface .07 / rule .13 / inkMuted .37 / ink .82 / accent .5 / accent2 .46 */
    palette: (t) => ({
      bg: t.bg || "#141210", surface: "#1e1a16", rule: "#3a322a", inkMuted: "#9c9186",
      ink: "#f0eae2", accent: t.accent || "#f2a33c", accent2: t.accent2 || "#5fb0a8", accentInk: "#120f0c",
    }),
    tweaks: [
      { k: "bg", label: "Ground", options: ["#141210", "#161311", "#12100f"] },
      { k: "accent", label: "Signal", options: ["#f2a33c", "#f26d3c", "#c9f23c"] },
      { k: "accent2", label: "Second", options: ["#5fb0a8", "#8f9ad8", "#c98fd8"] },
    ],
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M12 3v6M12 15v6M5 12h14" }), R2("circle", { cx: 12, cy: 12, r: 3 })),
    cams: ["drop", "pushR", "spin", "pushL", "hopU", "zoomIn"], camMul: 3, camOff: 5,
    mag: { rot: 0.5, driftX: 8, driftY: 7, driftZ: 0.04, slide: 0.24, inn: 0.2, zin: 0.36, zout: 0.3 },
    variants: { Ring: "ring", Scroll: "board", Typing: "hand" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 310, size: 90, upper: true, kicker: { v: "pill", bg: "accent", c: "accentInk" } },
      statement: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 610, size: 104, upper: true },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 550, size: 74, bodySize: 38, ch: 50, lh: 1.5, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent2" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 370, size: 82, ch: 24, lh: 1.14, markSize: 200 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 250, size: 80, upper: true, swap: "quote", card: { v: "tilt", bg: "surface", r: 16, line: "inkMuted" }, chips: { v: "pill", colors: ["accent", "accent2"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: 76, upper: true, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 16, h: 640, labelSize: 40 }, tilts: [-1.5, 1.5, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 78, upper: true, cols: ["accent", "accent2", "ink"], num: 150 },
      cta: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 470, size: 90, upper: true, align: "left", btn: { v: "pill", bg: "accent", c: "accentInk" }, logoShape: "circle" },
      app: { bg: "bg", fg: "ink", hi: "accent", cardBg: "surface", line: "inkMuted", world: true },
    },
    /* WORLD — a survey corridor. Far: a crosshair grid, a horizon glow and two
       ridge silhouettes drifting on parallax. Mid: a dashed route with pulsing
       waypoints, beacon masts blinking out of phase, and the quadcopter flying
       the route on a 16s orbit — arms, shells with a single light source, rotor
       discs dashed to read as blur, ground shadow tracking altitude. Near: data
       motes and streaks. All of it below y=H*0.62, clear of every text block. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, a = (t / 16) * Math.PI * 2;
      const cx = W * 0.6 + Math.cos(a) * (W * 0.3), cy = H * 0.79 + Math.sin(a * 2) * (H * 0.085);
      const tilt = Math.cos(a) * 9, alt = 0.6 + 0.4 * (Math.sin(a * 2) * 0.5 + 0.5);
      const rotor = (t * 900) % 360;
      const ridge = (t * 11) % 360;
      const route = H * 0.79;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "rp-grid", width: 96, height: 96, patternUnits: "userSpaceOnUse", patternTransform: "translate(" + ((t * 7) % 96).toFixed(1) + ",0)" },
            R("path", { d: "M48 40v16M40 48h16", stroke: rgba(theme.rule, 0.9), strokeWidth: 2 }),
            R("circle", { cx: 0, cy: 0, r: 2, fill: rgba(theme.accent, 0.25) })),
          R("radialGradient", { id: "rp-glow", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent, 0.26) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent, 0) }))),
        R("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#rp-grid)" }),
        R("circle", { cx: W * 0.22, cy: 340, r: 440, fill: "url(#rp-glow)" }),
        /* ridges, two speeds */
        R("path", { d: "M " + (-ridge) + " " + (H - 470) + " q 200 -140 420 -20 q 220 120 460 -60 q 220 -160 460 20 L " + (W + 400) + " " + H + " L " + (-ridge) + " " + H + " Z", fill: rgba(theme.surface, 0.5) }),
        R("path", { d: "M " + (-ridge * 1.8) + " " + (H - 330) + " q 260 -120 520 10 q 240 110 520 -50 L " + (W + 600) + " " + H + " L " + (-ridge * 1.8) + " " + H + " Z", fill: rgba(theme.rule, 0.5) }),
        /* three contour lines threading the corridor */
        [0, 1, 2].map((i) => R("path", { key: "c" + i, d: "M 0 " + (H * 0.66 + i * 190) + " q " + (W * 0.3) + " " + (-80 - i * 14) + " " + (W * 0.55) + " 16 q " + (W * 0.25) + " 90 " + (W * 0.45) + " -26", fill: "none", stroke: rgba(theme.rule, 0.8), strokeWidth: 2 })),
        /* the route the drone is flying, and its waypoints */
        R("path", { d: "M 40 " + (route + 120) + " Q " + (W * 0.3) + " " + (route - 150) + " " + (W * 0.6) + " " + route + " T " + (W - 30) + " " + (route + 90), fill: "none", stroke: rgba(theme.accent, 0.34), strokeWidth: 4, strokeDasharray: "22 20", strokeDashoffset: (-(t * 40) % 42).toFixed(1) }),
        [0, 1, 2, 3, 4].map((i) => {
          const wx = 110 + i * ((W - 220) / 4), wy = route + 110 - Math.sin(i * 0.9) * 130;
          const ph = ((t * 0.55 + i * 0.2) % 1);
          const live = Math.floor((t * 0.55) % 5) === i;
          return R("g", { key: "wp" + i },
            R("circle", { cx: wx, cy: wy, r: 9, fill: rgba(live ? theme.accent : theme.accent2, 0.9) }),
            R("circle", { cx: wx, cy: wy, r: 9 + ph * 62, fill: "none", stroke: rgba(theme.accent2, 0.34 * (1 - ph)), strokeWidth: 3 }));
        }),
        /* beacon masts along the floor, blinking out of phase */
        [0, 1, 2].map((i) => {
          const mx = 180 + i * 360, blink = Math.sin(t * 2.2 + i * 2.1) > 0.55 ? 1 : 0.16;
          return R("g", { key: "bm" + i },
            R("line", { x1: mx, y1: H - 120, x2: mx, y2: H - 300 - (i % 2) * 70, stroke: rgba(theme.inkMuted, 0.45), strokeWidth: 5 }),
            R("path", { d: "M " + (mx - 26) + " " + (H - 120) + " l 26 -40 l 26 40 z", fill: "none", stroke: rgba(theme.inkMuted, 0.35), strokeWidth: 4 }),
            R("circle", { cx: mx, cy: H - 306 - (i % 2) * 70, r: 10, fill: rgba(theme.accent, blink) }),
            R("circle", { cx: mx, cy: H - 306 - (i % 2) * 70, r: 26, fill: "none", stroke: rgba(theme.accent, 0.3 * blink), strokeWidth: 3 }));
        }),
        /* the aircraft */
        R("ellipse", { cx: cx, cy: H - 150, rx: 120 * alt, ry: 16 * alt, fill: rgba(theme.accentInk, 0.5) }),
        R("g", { transform: "translate(" + cx.toFixed(1) + "," + cy.toFixed(1) + ") rotate(" + tilt.toFixed(2) + ")" },
          [-1, 1].map((sx) => [-1, 1].map((sy) => R("line", { key: "a" + sx + sy, x1: 0, y1: 0, x2: sx * 74, y2: sy * 52, stroke: rgba(theme.inkMuted, 0.7), strokeWidth: 7, strokeLinecap: "round" }))),
          [-1, 1].map((sx) => [-1, 1].map((sy) => R("circle", { key: "r" + sx + sy, cx: sx * 74, cy: sy * 52, r: 40, fill: "none", stroke: rgba(theme.accent, 0.35), strokeWidth: 5, strokeDasharray: "26 14", transform: "rotate(" + (rotor * (sx * sy)).toFixed(1) + " " + sx * 74 + " " + sy * 52 + ")" }))),
          R("path", { d: "M -52 -22 L 52 -22 L 40 18 L -40 18 Z", fill: rgba(theme.surface, 0.96), stroke: rgba(theme.inkMuted, 0.5), strokeWidth: 2.5 }),
          R("path", { d: "M -52 -22 L 52 -22 L 44 -6 L -44 -6 Z", fill: rgba(theme.ink, 0.14) }),
          R("circle", { cx: 0, cy: 4, r: 11, fill: rgba(theme.accent, 0.95) }),
          R("circle", { cx: 0, cy: 4, r: 24, fill: "none", stroke: rgba(theme.accent, 0.3), strokeWidth: 3 }),
          R("path", { d: "M 0 20 L -34 96 L 34 96 Z", fill: rgba(theme.accent, 0.12) }),
          R("line", { x1: 0, y1: 18, x2: 0, y2: 40, stroke: rgba(theme.accent2, 0.7), strokeWidth: 4, strokeLinecap: "round" })),
        /* near plane: motes and streaks */
        [0, 1, 2, 3, 4, 5, 6].map((i) => {
          const ph = (t * (0.14 + i * 0.025) + i * 0.16) % 1;
          return R("circle", { key: "m" + i, cx: 70 + i * 155 + Math.sin(t * 0.9 + i) * 40, cy: H - ph * (H + 200), r: 4 + (i % 3) * 3, fill: rgba(theme.accent2, 0.3 * (1 - ph)) });
        }),
        [0, 1, 2].map((i) => {
          const ph = (t * (0.5 + i * 0.12) + i * 0.33) % 1;
          const y = H - ph * (H + 260);
          return R("line", { key: "st" + i, x1: 260 + i * 300, y1: y, x2: 260 + i * 300, y2: y + 70, stroke: rgba(theme.accent, 0.34 * (1 - ph)), strokeWidth: 3, strokeLinecap: "round" });
        }));
    },
  });

  /* ── 05 BUILD NOTES — the yard: hazard stripes, slab display, crane hook ── */
  FilmKit.make({
    global: "BuildNotes", brand: "Build Notes", desk: "#bfbdb6", ambient: 2.1, chrome: false,
    FH: '"Bevan", Georgia, serif',
    FB: '"Barlow", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "stamp", itemPreset: "pop", titleLine: 1.06, titleSpace: "-0.025em",
    /* ladder: bg .88 / surface .96 / rule .76 / inkMuted .44 / ink .06 / accent .42 / accent2 .5 */
    palette: (t) => ({
      bg: t.bg || "#ece7dd", surface: "#fbfaf7", rule: "#cdc6b8", inkMuted: "#716c62",
      ink: "#131210", accent: t.accent || "#d8452c", accent2: t.accent2 || "#2f6bd1", accentInk: "#fbfaf7",
    }),
    tweaks: [
      { k: "bg", label: "Ground", options: ["#ece7dd", "#eeeae2", "#eae7e0"] },
      { k: "accent", label: "Accent", options: ["#d8452c", "#1f7a4d", "#7a3fd1"] },
      { k: "accent2", label: "Second", options: ["#2f6bd1", "#d18f2f", "#2fa8b8"] },
    ],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(178deg, " + rgba(theme.surface, 0.9) + " 0%, " + bg + " 46%, " + rgba(theme.rule, 0.55) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M3 21h18M6 21V8l12-3v16" }), R2("path", { d: "M10 21v-6h4v6" })),
    cams: ["hopU", "zoomOut", "pushR", "drop", "zoomIn", "pushL"], camMul: 7, camOff: 2,
    mag: { rot: 0.7, driftX: 6, driftY: 8, driftZ: 0.035, slide: 0.22, inn: 0.18, zin: 0.32, zout: 0.28 },
    variants: { Ring: "gauge", Scroll: "feed", Typing: "caret" },
    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 320, size: 76, upper: true, kicker: { v: "tag", bg: "accent", c: "accentInk" } },
      statement: { bg: "ink", fg: "surface", hi: "accent", world: true, top: 620, size: 92, upper: true },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 550, size: 66, bodySize: 38, ch: 52, lh: 1.5, weight: 450, dim: 0.9, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 380, size: 74, ch: 24, lh: 1.2, markSize: 200 },
      feature: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 255, size: 82, swap: "body", card: { v: "frame", bg: "surface", r: 12, line: "inkMuted" }, chips: { v: "square", colors: ["accent", "accent2", "ink"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: 76, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: 12, h: 640, labelSize: 38 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: 80, cols: ["accent", "accent2", "ink"], num: 148, rule: true },
      cta: { bg: "accent", fg: "accentInk", hi: "ink", world: true, top: 470, size: 96, upper: true, align: "left", btn: { v: "block", bg: "ink", c: "accentInk" }, logoShape: "rounded" },
      app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
    },
    /* WORLD — a yard at the end of the shift. Far: hazard stripes, a blueprint
       circle, a girder skyline and a scaffold plane sliding on parallax. Mid: a
       bench saw sled runs an 8s ping-pong; the blade spins far faster than the
       sled travels, the kerf it has cut stays behind it, sawdust sprays from the
       cut. Near: dust, sparks, and a plumb bob swinging in the right margin. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, cyc = (t % 8) / 8;
      const inv = theme.currentBg === theme.ink;
      const tint = inv ? theme.surface : theme.inkMuted;
      const solid = inv ? theme.inkMuted : theme.ink;
      const tri = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;
      const sled = 190 + E.inOut(tri) * (W - 380);
      const blade = (t * 1100) % 360;
      const deck = H - 250, rail = deck - 150;
      const bob = Math.sin(t * 1.1) * 13;
      const scaff = (t * 14) % 320;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "bn-haz", width: 56, height: 56, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
            R("rect", { x: 0, y: 0, width: 28, height: 56, fill: rgba(theme.accent, 0.1) })),
          R("radialGradient", { id: "bn-sun", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent2, 0.2) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent2, 0) }))),
        R("circle", { cx: W * 0.24, cy: 420, r: 460, fill: "url(#bn-sun)" }),
        R("circle", { cx: W * 0.24, cy: 420, r: 300, fill: "none", stroke: rgba(theme.inkMuted, 0.2), strokeWidth: 3, strokeDasharray: "20 22", transform: "rotate(" + ((t * 6) % 360).toFixed(1) + " " + (W * 0.24) + " 420)" }),
        R("circle", { cx: W * 0.24, cy: 420, r: 210, fill: "none", stroke: rgba(theme.accent, 0.16), strokeWidth: 3 }),
        R("path", { d: "M " + (W * 0.24) + " 160 A 260 260 0 0 1 " + (W * 0.24 + 260) + " 420", fill: "none", stroke: rgba(theme.accent, 0.2), strokeWidth: 5, strokeLinecap: "round", transform: "rotate(" + ((t * 22) % 360).toFixed(1) + " " + (W * 0.24) + " 420)" }),
        /* scaffold plane, parallax */
        R("g", { opacity: 0.5, transform: "translate(" + (-scaff).toFixed(1) + ",0)" },
          [0, 1, 2, 3, 4, 5].map((i) => R("line", { key: "po" + i, x1: 80 + i * 320, y1: deck - 760, x2: 80 + i * 320, y2: deck - 40, stroke: rgba(tint, 0.5), strokeWidth: 7 })),
          [0, 1, 2, 3].map((i) => R("line", { key: "br" + i, x1: 0, y1: deck - 700 + i * 190, x2: W + 400, y2: deck - 700 + i * 190, stroke: rgba(tint, 0.32), strokeWidth: 5 })),
          [0, 1, 2, 3, 4].map((i) => R("line", { key: "dg" + i, x1: 80 + i * 320, y1: deck - 700, x2: 400 + i * 320, y2: deck - 510, stroke: rgba(tint, 0.22), strokeWidth: 4 }))),
        R("rect", { x: 0, y: deck - 40, width: W, height: H - deck + 40, fill: "url(#bn-haz)" }),
        R("g", { opacity: 0.5 },
          [0, 1, 2, 3].map((i) => R("path", { key: "gr" + i, d: "M " + (60 + i * 300) + " " + (deck - 40) + " v " + (-90 - (i % 2) * 70) + " h 120 v " + (90 + (i % 2) * 70) + " z", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 3 }))),
        R("line", { x1: 0, y1: deck, x2: W, y2: deck, stroke: rgba(tint, 0.6), strokeWidth: 5 }),
        /* the plank and the kerf already cut */
        R("rect", { x: 80, y: rail - 26, width: W - 160, height: 52, rx: 6, fill: rgba(theme.accent2, 0.14), stroke: rgba(tint, 0.5), strokeWidth: 2 }),
        [0, 1, 2].map((i) => R("path", { key: "pg" + i, d: "M 96 " + (rail - 16 + i * 12) + " q 220 " + (i % 2 ? 8 : -8) + " 440 0 q 220 " + (i % 2 ? -8 : 8) + " 440 0", fill: "none", stroke: rgba(tint, 0.2), strokeWidth: 2 })),
        R("rect", { x: 80, y: rail - 4, width: Math.max(0, sled - 80), height: 8, fill: rgba(theme.ink, 0.55) }),
        R("line", { x1: 40, y1: rail + 40, x2: W - 40, y2: rail + 40, stroke: rgba(theme.rule, 0.9), strokeWidth: 7, strokeLinecap: "round" }),
        /* the saw sled */
        R("g", { transform: "translate(" + sled.toFixed(1) + "," + rail + ")" },
          R("ellipse", { cx: 0, cy: 66, rx: 96, ry: 12, fill: rgba(theme.ink, 0.22) }),
          R("rect", { x: -86, y: 20, width: 172, height: 34, rx: 8, fill: rgba(solid, 0.9) }),
          R("circle", { cx: -52, cy: 58, r: 12, fill: rgba(theme.inkMuted, 0.9) }),
          R("circle", { cx: 52, cy: 58, r: 12, fill: rgba(theme.inkMuted, 0.9) }),
          R("g", { transform: "rotate(" + blade.toFixed(1) + ")" },
            R("circle", { r: 74, fill: "none", stroke: rgba(theme.inkMuted, 0.8), strokeWidth: 10, strokeDasharray: "16 12" }),
            R("circle", { r: 52, fill: rgba(theme.surface, 0.95), stroke: rgba(theme.ink, 0.4), strokeWidth: 3 }),
            R("path", { d: "M -52 0 h 104 M 0 -52 v 104", stroke: rgba(theme.accent, 0.5), strokeWidth: 6, strokeLinecap: "round" })),
          R("path", { d: "M -96 -84 h 192 l -14 46 h -164 z", fill: rgba(theme.accent, 0.9) }),
          R("path", { d: "M -96 -84 h 192 l -6 18 h -180 z", fill: rgba(theme.surface, 0.35) }),
          R("circle", { r: 12, fill: rgba(theme.ink, 0.85) })),
        /* sawdust from the cut */
        [0, 1, 2, 3, 4, 5].map((i) => {
          const ph = ((t * 1.8 + i * 0.17) % 1);
          const dir = i % 2 ? 1 : -1;
          return R("rect", { key: "sd" + i, x: sled + dir * (12 + ph * 120), y: rail - 10 - ph * 90 + ph * ph * 120, width: 7, height: 4, rx: 2, fill: rgba(theme.accent2, 0.5 * (1 - ph)), transform: "rotate(" + (ph * 260 * dir).toFixed(1) + " " + (sled + dir * (12 + ph * 120)).toFixed(1) + " " + (rail - 10 - ph * 90 + ph * ph * 120).toFixed(1) + ")" });
        }),
        /* timber stacked on the deck, and a sawhorse */
        R("g", null,
          [0, 1, 2, 3].map((i) => R("rect", { key: "tb" + i, x: 60 + (i % 2) * 14, y: deck - 34 - i * 26, width: 210 - (i % 2) * 22, height: 22, rx: 4, fill: rgba(theme.surface, 0.9), stroke: rgba(tint, 0.45), strokeWidth: 2 })),
          [0, 1, 2].map((i) => R("line", { key: "tg" + i, x1: 70, y1: deck - 24 - i * 26, x2: 250, y2: deck - 24 - i * 26, stroke: rgba(tint, 0.24), strokeWidth: 2 }))),
        R("g", { transform: "translate(" + (W - 210) + "," + (deck - 8) + ")" },
          R("path", { d: "M -70 0 l 40 -104 M 70 0 l -40 -104 M -46 -60 h 92", stroke: rgba(tint, 0.6), strokeWidth: 6, strokeLinecap: "round" }),
          R("rect", { x: -58, y: -122, width: 116, height: 20, rx: 4, fill: rgba(tint, 0.7) })),
        /* the crate the sled is trimming for, rocking on the swing lag */
        R("g", { transform: "translate(" + (W * 0.5) + "," + (deck - 26) + ") rotate(" + (bob * 0.25).toFixed(2) + ")" },
          R("rect", { x: -84, y: -66, width: 168, height: 66, rx: 5, fill: rgba(theme.accent2, 0.16), stroke: rgba(tint, 0.5), strokeWidth: 3 }),
          R("path", { d: "M -84 -44 h 168 M -30 -66 v 66 M 30 -66 v 66", stroke: rgba(tint, 0.34), strokeWidth: 3 })),
        /* near plane */
        [0, 1, 2, 3, 4, 5, 6].map((i) => {
          const ph = (t * (0.28 + i * 0.04) + i * 0.19) % 1;
          return R("circle", { key: "du" + i, cx: 110 + i * 150 + Math.sin(t * 1.5 + i) * 44, cy: H - ph * (H + 160), r: 4 + (i % 2) * 3, fill: rgba(tint, 0.32 * (1 - ph)) });
        }));
    },
  });
})();
