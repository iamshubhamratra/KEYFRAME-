/* article-pack-07.js — cohort 07, creative / portfolio: packs 31-35.
   Studio Wall · Cold Type · Loud Quiet · Gallery Hours · Blunt Object
   Contract as before: hexes only in palette(), look and World name slots,
   chrome:false, three depth planes, an object on a route with secondary motion,
   nothing between y=290 and y=1330 except margin clusters (x>820), tone-aware
   tints, comparison tiles on tile.bg "rule" so they separate from the ground. */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  const LOOK = (o) => ({
    hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: o.h, upper: o.upper, kicker: o.kicker },
    statement: { bg: o.sBg, fg: o.sFg, hi: "accent2", world: true, top: 610, size: o.h + 12, upper: o.upper },
    body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: o.h - 28, bodySize: 38, ch: 54, lh: 1.52, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent" } },
    quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: o.h - 18, ch: 25, lh: o.qlh, markSize: 220 },
    feature: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 255, size: o.h - 18, upper: o.upper, swap: o.swap, card: { v: o.card, bg: "surface", r: o.r, line: "inkMuted" }, chips: { v: o.chip, colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
    montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: o.h - 22, upper: o.upper, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: o.r, h: 640, labelSize: 44 }, tilts: o.tilts || [0, 0, 0, 0] },
    stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: o.h - 20, upper: o.upper, cols: ["accent", "accent2", "ink"], num: 150, rule: true },
    cta: { bg: o.cBg, fg: o.cFg, hi: "accent2", world: true, top: 470, size: o.h - 6, upper: o.upper, align: "left", btn: { v: o.btn, bg: o.btnBg, c: o.btnC }, logoShape: o.logo },
    app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
  });

  /* ── 31 STUDIO WALL — a mobile turning over a working wall ── */
  FilmKit.make({
    global: "StudioWall", brand: "Studio Wall", desk: "#17141a", ambient: 1.6, chrome: false,
    FH: '"Syne", system-ui, sans-serif', FB: '"Hanken Grotesk", system-ui, sans-serif', FM: '"IBM Plex Mono", monospace',
    titlePreset: "streak", itemPreset: "pop", titleLine: 1.02, titleSpace: "-0.03em",
    palette: (t) => ({ bg: t.bg || "#eae7e4", surface: "#f8f6f5", rule: "#c7c2be", inkMuted: "#6b6663", ink: "#161315", accent: t.accent || "#e0347f", accent2: t.accent2 || "#3f8f7f", accentInk: "#f8f6f5" }),
    tweaks: [{ k: "bg", label: "Plaster", options: ["#eae7e4", "#ece9e6", "#e7e4e1"] }, { k: "accent", label: "Accent", options: ["#e0347f", "#e07a34", "#7f34e0"] }, { k: "accent2", label: "Second", options: ["#3f8f7f", "#8f7f3f", "#3f5f8f"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(90% 50% at 24% 6%, " + rgba(theme.surface, 0.95) + " 0%, transparent 60%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round" }, R2("path", { d: "M12 3v6M5 9h14M7 9v4M17 9v7" }), R2("circle", { cx: 7, cy: 15, r: 2 })),
    cams: ["pushL", "hopU", "zoomIn", "pushR", "drop", "zoomOut"], camMul: 5, camOff: 2,
    mag: { rot: 0.7, skew: 2, driftX: 8, driftY: 7, driftZ: 0.045, slide: 0.26, inn: 0.18, zin: 0.36, zout: 0.3 },
    variants: { Scroll: "board", Typing: "hand", Ring: "ring" },
    look: LOOK({ h: 108, kicker: { v: "tag", bg: "accent", c: "accentInk" }, sBg: "ink", sFg: "surface", qlh: 1.1, swap: "quote", card: "tilt", chip: "square", r: 4, cBg: "accent", cFg: "accentInk", btn: "block", btnBg: "ink", btnC: "accentInk", logo: "rounded", tilts: [-2, 2, 0, 0] }),
    /* WORLD — pinned prints lifting at the corners; a mobile in the margin whose
       three arms turn at three rates; an easel and paint tins on the floor. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, floor = H - 290;
      return R("g", null,
        R("defs", null, R("pattern", { id: "sw-tex", width: 7, height: 7, patternUnits: "userSpaceOnUse" }, R("circle", { cx: 3, cy: 3, r: 1, fill: rgba(theme.rule, inv ? 0.2 : 0.5) }))),
        R("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#sw-tex)" }),
        /* a window with a half-drawn blind, and a shelf of jars */
        R("g", { opacity: 0.62 },
          R("rect", { x: 620, y: -20, width: 400, height: 250, rx: 6, fill: rgba(theme.accent2, 0.12), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("line", { x1: 820, y1: -20, x2: 820, y2: 230, stroke: rgba(tint, 0.35), strokeWidth: 4 }),
          R("rect", { x: 620, y: -20, width: 400, height: 80 + (Math.sin(t * 0.4) * 0.5 + 0.5) * 60, rx: 5, fill: rgba(tint, 0.4) }),
          R("rect", { x: 40, y: 232, width: 520, height: 14, rx: 4, fill: rgba(tint, 0.55) }),
          [0, 1, 2, 3, 4].map((i) => {
            const hgt = 54 + ((i * 43) % 3) * 26;
            return R("g", { key: "jr" + i },
              R("rect", { x: 80 + i * 96, y: 232 - hgt, width: 52, height: hgt, rx: 6, fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.24), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
              [0, 1].map((j) => R("line", { key: "br" + j, x1: 90 + i * 96, y1: 232 - hgt + 14 + j * 14, x2: 122 + i * 96, y2: 232 - hgt + 8 + j * 14, stroke: rgba(theme.ink, 0.35), strokeWidth: 4 })));
          })),
        R("g", { opacity: 0.7 }, [0, 1, 2, 3, 4].map((i) => R("g", { key: "pr" + i, transform: "translate(" + (110 + i * 200) + "," + (140 + (i % 2) * 26) + ") rotate(" + (Math.sin(t * 1.1 + i * 1.4) * 2.6).toFixed(2) + ")" },
          R("rect", { x: -72, y: -96, width: 144, height: 192, rx: 3, fill: rgba(theme.surface, inv ? 0.4 : 0.95), stroke: rgba(tint, 0.35), strokeWidth: 3 }),
          i % 2 ? R("circle", { cx: 0, cy: -18, r: 44, fill: rgba(theme.accent, 0.4) }) : R("path", { d: "M -48 58 L 0 -38 L 48 58 z", fill: rgba(theme.accent2, 0.45) }),
          R("circle", { cx: 0, cy: -96, r: 6, fill: rgba(theme.accent, 0.9) })))),
        R("g", { transform: "translate(" + (W - 130) + ",330)" },
          R("line", { x1: 0, y1: -40, x2: 0, y2: 60, stroke: rgba(tint, 0.5), strokeWidth: 3 }),
          [[60, 0.42, 140], [250, -0.6, 104], [420, 0.9, 74]].map((a, i) => R("g", { key: "ar" + i, transform: "translate(0," + a[0] + ") rotate(" + (Math.sin(t * a[1] * 0.5 + i) * 22).toFixed(2) + ")" },
            R("line", { x1: -a[2], y1: 0, x2: a[2], y2: 0, stroke: rgba(tint, 0.6), strokeWidth: 4 }),
            R("line", { x1: -a[2], y1: 0, x2: -a[2], y2: 60, stroke: rgba(tint, 0.4), strokeWidth: 2.5 }),
            i % 2 ? R("circle", { cx: -a[2], cy: 76, r: 24, fill: rgba(theme.accent, 0.8) }) : R("path", { d: "M " + (-a[2] - 24) + " 76 h 48 l -24 38 z", fill: rgba(theme.accent2, 0.8) }),
            R("rect", { x: a[2] - 18, y: 34, width: 36, height: 36, rx: 4, fill: rgba(theme.ink, 0.55) })))),
        R("line", { x1: 0, y1: floor, x2: W, y2: floor, stroke: rgba(tint, 0.5), strokeWidth: 7 }),
        R("rect", { x: 0, y: floor, width: W, height: H - floor, fill: rgba(theme.rule, 0.3) }),
        R("g", { transform: "translate(280," + floor + ")" },
          R("path", { d: "M -90 0 l 70 -320 M 90 0 l -70 -320 M -60 -140 h 120", stroke: rgba(tint, 0.6), strokeWidth: 9, strokeLinecap: "round" }),
          R("rect", { x: -110, y: -300, width: 220, height: 160, rx: 4, fill: rgba(theme.surface, inv ? 0.4 : 0.96), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("path", { d: "M -80 -180 q 60 -90 150 -20", fill: "none", stroke: rgba(theme.accent, 0.7), strokeWidth: 10, strokeLinecap: "round" })),
        /* a plan chest with a drawer easing open, and a swatch fan */
        R("g", { transform: "translate(" + (W - 160) + ",1400)" },
          R("rect", { x: -130, y: -140, width: 260, height: 220, rx: 6, fill: rgba(theme.surface, inv ? 0.35 : 0.94), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2].map((i) => R("rect", { key: "dw" + i, x: -112, y: -122 + i * 68, width: 224, height: 52, rx: 4, fill: "none", stroke: rgba(tint, 0.42), strokeWidth: 3 })),
          R("rect", { x: -112, y: -54, width: 224 + (Math.sin(t * 0.5) * 0.5 + 0.5) * 70, height: 52, rx: 4, fill: rgba(theme.accent, 0.3), stroke: rgba(tint, 0.55), strokeWidth: 3 }),
          R("circle", { cx: 96 + (Math.sin(t * 0.5) * 0.5 + 0.5) * 70, cy: -28, r: 9, fill: rgba(theme.accent2, 0.9) })),
        R("g", { transform: "translate(210,1360)" },
          [0, 1, 2, 3, 4].map((i) => R("rect", { key: "sf" + i, x: -14, y: -10, width: 150, height: 26, rx: 5, fill: rgba(i === 2 ? theme.ink : (i % 2 ? theme.accent2 : theme.accent), 0.55), stroke: rgba(tint, 0.35), strokeWidth: 2, transform: "rotate(" + (-40 + i * 20 + Math.sin(t * 0.8) * 3).toFixed(2) + ")" })),
          R("circle", { cx: -14, cy: 3, r: 9, fill: rgba(tint, 0.7) })),
        /* a stool, a taped square and offcuts on the floor */
        R("g", { opacity: 0.7, transform: "translate(" + (W * 0.66) + "," + (floor + 40) + ")" },
          R("ellipse", { cx: 0, cy: -120, rx: 74, ry: 20, fill: rgba(theme.accent2, 0.45), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("path", { d: "M -56 -110 l -18 110 M 56 -110 l 18 110 M -40 -50 h 80", stroke: rgba(tint, 0.55), strokeWidth: 8, strokeLinecap: "round" })),
        R("path", { d: "M 120 " + (H - 130) + " h 300 v 90 h -300 z", fill: "none", stroke: rgba(theme.accent, 0.4), strokeWidth: 7, strokeDasharray: "34 22" }),
        [0, 1, 2, 3].map((i) => R("path", { key: "oc" + i, d: "M 0 0 l 54 -12 l 14 34 l -50 14 z", fill: rgba(tint, 0.34), transform: "translate(" + (500 + i * 130) + "," + (H - 120 + (i % 2) * 40) + ") rotate(" + (i * 43) + ")" })),
        [0, 1, 2].map((i) => R("rect", { key: "tn" + i, x: 566 + i * 90, y: floor - 60, width: 68, height: 60, rx: 4, fill: rgba(i === 1 ? theme.accent : theme.accent2, 0.5), stroke: rgba(tint, 0.4), strokeWidth: 3 })),
        [0, 1, 2, 3, 4, 5].map((i) => {
          const ph = (t * (0.16 + i * 0.03) + i * 0.17) % 1;
          return R("circle", { key: "sd" + i, cx: 200 + i * 150 + Math.sin(t * 1.2 + i) * 40, cy: floor - ph * 640, r: 3 + (i % 3) * 2, fill: rgba(theme.accent, 0.26 * (1 - ph)) });
        }));
    },
  });

  /* ── 32 COLD TYPE — a guillotine trimming stock ── */
  FilmKit.make({
    global: "ColdType", brand: "Cold Type", desk: "#0e1114", ambient: 1.7, chrome: false,
    FH: '"Unbounded", system-ui, sans-serif', FB: '"Urbanist", system-ui, sans-serif', FM: '"IBM Plex Mono", monospace',
    titlePreset: "slam", itemPreset: "rise", titleLine: 1.0, titleSpace: "-0.04em",
    palette: (t) => ({ bg: t.bg || "#f0f2f3", surface: "#fcfdfd", rule: "#ccd0d3", inkMuted: "#6c7276", ink: "#101315", accent: t.accent || "#2b6bff", accent2: t.accent2 || "#ff5a2b", accentInk: "#fcfdfd" }),
    tweaks: [{ k: "bg", label: "Stock", options: ["#f0f2f3", "#f2f4f5", "#eef1f2"] }, { k: "accent", label: "Blue", options: ["#2b6bff", "#00b3a4", "#7a2bff"] }, { k: "accent2", label: "Second", options: ["#ff5a2b", "#ffb52b", "#ff2b8f"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(178deg, " + rgba(theme.surface, 0.96) + " 0%, " + bg + " 50%, " + rgba(theme.rule, 0.4) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinejoin: "round" }, R2("path", { d: "M4 4h16v6H4zM4 14h16v6H4z" })),
    cams: ["pushU", "zoomIn", "pushD", "pushR", "zoomOut", "pushL"], camMul: 1, camOff: 3,
    mag: { rot: 0.1, driftX: 5, driftY: 5, driftZ: 0.03, slide: 0.2, inn: 0.14, zin: 0.28, zout: 0.24 },
    variants: { Scroll: "feed", Typing: "caret", Ring: "bar" },
    look: LOOK({ h: 92, kicker: { v: "square", bg: "accent", c: "accentInk" }, sBg: "accent", sFg: "accentInk", qlh: 1.06, swap: "body", card: "frame", chip: "square", r: 2, cBg: "ink", cFg: "surface", btn: "block", btnBg: "accent", btnC: "accentInk", logo: "rounded" }),
    /* WORLD — a wall of type cases; a guillotine that cycles every 5s, beam
       lifting, blade dropping, offcut sliding away, stack losing a sheet. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, bench = H - 300;
      const cyc = (t % 5) / 5;
      const drop = cyc < 0.3 ? E.inCubic(cyc / 0.3) : cyc < 0.5 ? 1 : 1 - E.outCubic((cyc - 0.5) / 0.5);
      const slide = cyc > 0.32 && cyc < 0.8 ? E.outCubic((cyc - 0.32) / 0.48) : cyc >= 0.8 ? 1 : 0;
      const sheets = 6 - Math.floor(cyc * 2);
      return R("g", null,
        R("defs", null, R("pattern", { id: "ct-case", width: 70, height: 52, patternUnits: "userSpaceOnUse" }, R("rect", { x: 4, y: 4, width: 62, height: 44, fill: "none", stroke: rgba(theme.rule, inv ? 0.3 : 0.85), strokeWidth: 2 }))),
        R("rect", { x: 0, y: 20, width: W, height: 248, fill: "url(#ct-case)", opacity: 0.8 }),
        [0, 1, 2, 3, 4, 5, 6].map((i) => R("rect", { key: "tc" + i, x: 20 + i * 152, y: 40 + (i % 3) * 52, width: 54, height: 36, fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.28) })),
        R("rect", { x: 0, y: 268, width: W, height: 12, fill: rgba(tint, 0.5) }),
        /* a strip light and a line of proofs pegged up to dry */
        R("g", null,
          R("rect", { x: 120, y: 296, width: W - 240, height: 26, rx: 6, fill: rgba(theme.surface, inv ? 0.3 : 0.92), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("rect", { x: 140, y: 322, width: W - 280, height: 8, fill: rgba(theme.accent, 0.28) }),
          R("path", { d: "M 60 190 q " + (W / 2 - 60) + " " + (54 + Math.sin(t * 0.7) * 8).toFixed(1) + " " + (W - 120) + " 0", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          [0, 1, 2, 3, 4].map((i) => {
            const px = 160 + i * 190;
            const py = 196 + Math.sin((i / 4) * Math.PI) * (44 + Math.sin(t * 0.7) * 6);
            return R("g", { key: "pf" + i, transform: "translate(" + px + "," + py.toFixed(1) + ") rotate(" + (Math.sin(t * 1.2 + i * 0.8) * 3).toFixed(2) + ")" },
              R("rect", { x: -46, y: 0, width: 92, height: 118, rx: 2, fill: rgba(theme.surface, inv ? 0.4 : 0.97), stroke: rgba(tint, 0.3), strokeWidth: 2 }),
              R("rect", { x: -32, y: 20, width: 64, height: 10, rx: 2, fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.7) }),
              R("rect", { x: -32, y: 44, width: 46, height: 8, rx: 2, fill: rgba(tint, 0.35) }),
              R("circle", { cx: 0, cy: 0, r: 6, fill: rgba(theme.accent, 0.85) }));
          })),
        R("g", { transform: "translate(" + (W - 150) + ",1380)" }, Array.from({ length: sheets }).map((_, i) => R("rect", { key: "st" + i, x: -110 + (i % 2) * 10, y: -i * 22, width: 220 - (i % 2) * 18, height: 18, rx: 2, fill: rgba(theme.surface, inv ? 0.5 : 0.98), stroke: rgba(tint, 0.35), strokeWidth: 2 }))),
        /* a press with a turning flywheel, and an ink slab, in the margin band */
        R("g", { transform: "translate(" + (W - 170) + ",1120)" },
          R("rect", { x: -120, y: -150, width: 240, height: 300, rx: 8, fill: rgba(theme.surface, inv ? 0.35 : 0.94), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("rect", { x: -92, y: -120, width: 184, height: 84, rx: 4, fill: rgba(theme.ink, 0.72) }),
          R("rect", { x: -72, y: -100, width: 144, height: 12, rx: 4, fill: rgba(theme.accent, 0.7) }),
          R("g", { transform: "translate(0,50) rotate(" + ((t * 150) % 360).toFixed(1) + ")" },
            R("circle", { r: 72, fill: "none", stroke: rgba(theme.accent2, 0.75), strokeWidth: 12 }),
            [0, 1, 2, 3].map((i) => R("line", { key: "sk" + i, x1: 0, y1: 0, x2: Math.cos(i * 1.571) * 66, y2: Math.sin(i * 1.571) * 66, stroke: rgba(theme.accent2, 0.5), strokeWidth: 8 })),
            R("circle", { r: 16, fill: rgba(theme.ink, 0.8) }))),
        R("g", { opacity: 0.8, transform: "translate(200,1400)" },
          R("rect", { x: -120, y: -30, width: 240, height: 60, rx: 4, fill: rgba(theme.ink, 0.7), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("path", { d: "M -90 -6 q 40 " + (-14 + Math.sin(t * 1.1) * 5).toFixed(1) + " 84 2 q 44 16 92 -6", fill: "none", stroke: rgba(theme.accent, 0.8), strokeWidth: 9, strokeLinecap: "round" })),
        R("line", { x1: 0, y1: bench, x2: W, y2: bench, stroke: rgba(tint, 0.55), strokeWidth: 8 }),
        R("rect", { x: 0, y: bench, width: W, height: H - bench, fill: rgba(theme.rule, 0.32) }),
        R("g", { transform: "translate(" + (W * 0.42) + "," + bench + ")" },
          R("rect", { x: -260, y: -60, width: 520, height: 60, rx: 6, fill: rgba(theme.ink, 0.85) }),
          R("rect", { x: -240, y: -80, width: 480, height: 24, rx: 4, fill: rgba(theme.surface, inv ? 0.45 : 0.95), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          Array.from({ length: 9 }).map((_, i) => R("line", { key: "sc" + i, x1: -220 + i * 56, y1: -80, x2: -220 + i * 56, y2: -64, stroke: rgba(tint, 0.45), strokeWidth: 3 })),
          R("line", { x1: -260, y1: -230, x2: 260, y2: -230, stroke: rgba(tint, 0.5), strokeWidth: 8 }),
          R("g", { transform: "translate(0," + (drop * 140).toFixed(1) + ")" },
            R("path", { d: "M -250 -230 h 500 v 34 l -500 26 z", fill: rgba(theme.accent, 0.85), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
            R("rect", { x: -40, y: -276, width: 80, height: 46, rx: 6, fill: rgba(theme.ink, 0.9) })),
          R("rect", { x: -180 + slide * 420, y: -96, width: 130, height: 14, rx: 2, fill: rgba(theme.accent2, 0.6 * (1 - slide * 0.5)) })),
        /* a pallet of stock and a bin of offcuts on the floor */
        R("g", { opacity: 0.75, transform: "translate(180," + (H - 120) + ")" },
          [0, 1, 2].map((i) => R("rect", { key: "pl" + i, x: -110, y: -18 - i * 22, width: 220, height: 16, rx: 2, fill: rgba(theme.surface, inv ? 0.45 : 0.96), stroke: rgba(tint, 0.3), strokeWidth: 2 })),
          R("rect", { x: -120, y: 0, width: 240, height: 14, rx: 3, fill: rgba(tint, 0.55) }),
          R("path", { d: "M -100 14 v 22 M 0 14 v 22 M 100 14 v 22", stroke: rgba(tint, 0.4), strokeWidth: 8 })),
        R("g", { transform: "translate(" + (W * 0.74) + "," + (H - 110) + ")" },
          R("path", { d: "M -70 40 h 140 l -16 -110 h -108 z", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2, 3].map((i) => R("rect", { key: "of" + i, x: -46 + (i % 2) * 30, y: -56 - Math.floor(i / 2) * 22, width: 62, height: 8, rx: 3, fill: rgba(theme.accent2, 0.5), transform: "rotate(" + (-8 + i * 6) + ")" }))),
        [0, 1, 2, 3, 4].map((i) => {
          const ph = (t * (0.3 + i * 0.05) + i * 0.19) % 1;
          const x = 140 + i * 200 + Math.sin(t * 1.4 + i) * 30, y = bench - ph * 700;
          return R("rect", { key: "sl" + i, x: x, y: y, width: 34, height: 5, rx: 2, fill: rgba(theme.accent2, 0.4 * (1 - ph)), transform: "rotate(" + (ph * 300).toFixed(1) + " " + x + " " + y.toFixed(1) + ")" });
        }));
    },
  });

  /* ── 33 LOUD QUIET — a metronome keeping time ── */
  FilmKit.make({
    global: "LoudQuiet", brand: "Loud Quiet", desk: "#0b0b0c", ambient: 1.5, chrome: false,
    FH: '"Archivo Black", system-ui, sans-serif', FB: '"Archivo", system-ui, sans-serif', FM: '"IBM Plex Mono", monospace',
    titlePreset: "slam", itemPreset: "slam", titleLine: 0.98, titleSpace: "-0.035em",
    palette: (t) => ({ bg: t.bg || "#111113", surface: "#1b1b1e", rule: "#2e2e33", inkMuted: "#8b8b93", ink: "#f7f7f8", accent: t.accent || "#f5b23c", accent2: t.accent2 || "#4c8cf5", accentInk: "#0c0c0d" }),
    tweaks: [{ k: "bg", label: "Room", options: ["#111113", "#131315", "#0f0f11"] }, { k: "accent", label: "Amber", options: ["#f5b23c", "#f53c6b", "#3cf5a8"] }, { k: "accent2", label: "Second", options: ["#4c8cf5", "#8c4cf5", "#f54c8c"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(80% 45% at 50% 4%, " + rgba(theme.accent, 0.14) + " 0%, transparent 62%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinejoin: "round" }, R2("path", { d: "M9 3h6l4 18H5zM12 3v14" })),
    cams: ["zoomIn", "pushL", "spin", "pushR", "drop", "zoomOut"], camMul: 7, camOff: 5,
    mag: { rot: 1, skew: 4, driftX: 7, driftY: 8, driftZ: 0.05, slide: 0.3, inn: 0.16, zin: 0.42, zout: 0.34 },
    variants: { Scroll: "board", Typing: "typewriter", Ring: "gauge" },
    look: LOOK({ h: 104, upper: true, kicker: { v: "tag", bg: "accent", c: "accentInk" }, sBg: "accent", sFg: "accentInk", qlh: 1.04, swap: "quote", card: "frame", chip: "square", r: 4, cBg: "ink", cFg: "accentInk", btn: "block", btnBg: "accent", btnC: "accentInk", logo: "rounded" }),
    /* WORLD — foam wedges and a mirror strip; a metronome swings a 1.6s beat, its
       weight sliding a notch every eight bars, and a floor lamp flares on the
       downbeat; sheet music on the floor. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, floor = H - 300;
      const beat = Math.sin((t / 1.6) * Math.PI * 2), swing = beat * 24;
      const hit = Math.abs(beat) > 0.985 ? 1 : 0;
      const weight = 40 + ((Math.floor(t / 12.8) % 4) * 34);
      return R("g", null,
        R("defs", null, R("pattern", { id: "lq-foam", width: 80, height: 80, patternUnits: "userSpaceOnUse" }, R("path", { d: "M0 80 L40 0 L80 80 z", fill: rgba(theme.rule, inv ? 0.3 : 0.8) }))),
        R("rect", { x: 0, y: 0, width: W, height: 268, fill: "url(#lq-foam)", opacity: 0.7 }),
        R("rect", { x: 0, y: 268, width: W, height: 14, fill: rgba(tint, 0.4) }),
        /* a rig of par cans on a bar, flashing on the beat */
        R("g", null,
          R("rect", { x: -20, y: 120, width: W + 40, height: 16, rx: 5, fill: rgba(tint, 0.5) }),
          [0, 1, 2, 3].map((i) => R("g", { key: "pc" + i, transform: "translate(" + (170 + i * 250) + ",136)" },
            R("rect", { x: -30, y: 0, width: 60, height: 46, rx: 6, fill: rgba(theme.ink, 0.9), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
            R("circle", { cx: 0, cy: 52, r: 14, fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.4 + 0.5 * hit) }),
            R("path", { d: "M -40 52 L 40 52 L 90 " + (floor - 200) + " L -90 " + (floor - 200) + " Z", fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.03 + 0.05 * hit) })))),
        R("g", { transform: "translate(" + (W - 130) + ",1120)" },
          R("rect", { x: -104, y: -200, width: 208, height: 400, rx: 6, fill: rgba(theme.accent2, 0.1), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
          R("path", { d: "M -104 40 L 104 -140", stroke: rgba(theme.ink, 0.08), strokeWidth: 30 }),
          R("circle", { cx: 0, cy: 90, r: 40, fill: rgba(theme.accent, 0.12 + 0.1 * hit) })),
        /* an amp stack with a VU that answers the beat, and a mic stand */
        R("g", { transform: "translate(" + (W - 160) + ",1440)" },
          R("rect", { x: -120, y: -60, width: 240, height: 120, rx: 8, fill: rgba(theme.surface, 0.95), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("rect", { x: -120, y: -190, width: 240, height: 122, rx: 8, fill: rgba(theme.surface, 0.9), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1].map((i) => R("circle", { key: "sp" + i, cx: -56 + i * 112, cy: -128, r: 40, fill: rgba(theme.ink, 0.7), stroke: rgba(tint, 0.4), strokeWidth: 4 })),
          R("rect", { x: -96, y: -46, width: 192, height: 26, rx: 5, fill: rgba(theme.ink, 0.75) }),
          [0, 1, 2, 3, 4, 5, 6].map((i) => R("rect", { key: "vu" + i, x: -88 + i * 26, y: -40, width: 18, height: 14, rx: 2, fill: rgba(i > 4 ? theme.accent2 : theme.accent, (Math.abs(beat) * 7 > i ? 0.9 : 0.15)) })),
          [0, 1, 2].map((i) => R("circle", { key: "kn" + i, cx: -60 + i * 60, cy: 24, r: 12, fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 4 }))),
        R("g", { transform: "translate(200,1420)" },
          R("path", { d: "M -60 90 h 120 M -30 90 l 30 -30 M 30 90 l -30 -30", stroke: rgba(tint, 0.55), strokeWidth: 7, strokeLinecap: "round" }),
          R("line", { x1: 0, y1: 60, x2: 0, y2: -170, stroke: rgba(tint, 0.6), strokeWidth: 7 }),
          R("path", { d: "M 0 -170 q 0 -40 46 -46", fill: "none", stroke: rgba(tint, 0.55), strokeWidth: 6 }),
          R("g", { transform: "translate(56,-222) rotate(28)" },
            R("rect", { x: -16, y: -46, width: 32, height: 60, rx: 16, fill: rgba(theme.ink, 0.9), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
            R("rect", { x: -10, y: 12, width: 20, height: 30, rx: 5, fill: rgba(theme.accent, 0.7) }))),
        R("line", { x1: 0, y1: floor, x2: W, y2: floor, stroke: rgba(tint, 0.5), strokeWidth: 7 }),
        R("rect", { x: 0, y: floor, width: W, height: H - floor, fill: rgba(theme.surface, 0.5) }),
        R("g", { transform: "translate(" + (W * 0.44) + "," + floor + ")" },
          R("path", { d: "M -70 0 l 26 -140 M 70 0 l -26 -140 M -50 -70 h 100", stroke: rgba(tint, 0.55), strokeWidth: 8, strokeLinecap: "round" }),
          R("rect", { x: -90, y: -164, width: 180, height: 26, rx: 6, fill: rgba(tint, 0.6) }),
          R("g", { transform: "translate(0,-164)" },
            R("path", { d: "M -76 0 h 152 l -46 -300 h -60 z", fill: rgba(theme.surface, 0.95), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
            R("path", { d: "M -76 0 h 152 l -8 -50 h -136 z", fill: rgba(theme.accent, 0.25) }),
            R("g", { transform: "rotate(" + swing.toFixed(2) + " 0 -40)" },
              R("line", { x1: 0, y1: -40, x2: 0, y2: -330, stroke: rgba(theme.ink, 0.85), strokeWidth: 7, strokeLinecap: "round" }),
              R("rect", { x: -22, y: -40 - weight * 2.4, width: 44, height: 30, rx: 4, fill: rgba(theme.accent, 0.9) })),
            R("circle", { cx: 0, cy: -40, r: 10, fill: rgba(theme.accent2, 0.9) }))),
        R("g", { transform: "translate(190," + floor + ")" },
          R("path", { d: "M -40 0 h 80 l -14 -30 h -52 z", fill: rgba(tint, 0.5) }),
          R("line", { x1: 0, y1: -30, x2: 0, y2: -300, stroke: rgba(tint, 0.5), strokeWidth: 7 }),
          R("path", { d: "M -80 -300 h 160 l -30 -110 h -100 z", fill: rgba(theme.accent, 0.35 + 0.35 * hit) }),
          R("circle", { cx: 0, cy: -280, r: 30 + hit * 14, fill: rgba(theme.accent, 0.2 + 0.3 * hit) })),
        [0, 1, 2].map((i) => R("g", { key: "sm" + i, transform: "translate(" + (700 + i * 130) + "," + (floor + 60 + (i % 2) * 40) + ") rotate(" + (-8 + i * 7) + ")" },
          R("rect", { x: -60, y: -40, width: 120, height: 80, rx: 3, fill: rgba(theme.surface, 0.9), stroke: rgba(tint, 0.3), strokeWidth: 2 }),
          [0, 1, 2].map((j) => R("line", { key: "ln" + j, x1: -46, y1: -18 + j * 18, x2: 46, y2: -18 + j * 18, stroke: rgba(tint, 0.3), strokeWidth: 3 })))),
        /* a cable run and a guitar case left open on the floor */
        R("path", { d: "M -40 " + (H - 90) + " q 220 " + (-70 + Math.sin(t * 0.9) * 14).toFixed(1) + " 460 10 q 240 74 520 -24", fill: "none", stroke: rgba(theme.ink, 0.55), strokeWidth: 11, strokeLinecap: "round" }),
        R("g", { opacity: 0.8, transform: "translate(" + (W * 0.62) + "," + (H - 130) + ") rotate(-6)" },
          R("path", { d: "M -170 0 q -26 -60 40 -70 q 60 -10 90 14 q 40 -22 90 -6 q 54 20 26 62 z", fill: rgba(theme.accent2, 0.4), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("path", { d: "M -120 -46 q 60 -20 120 4", fill: "none", stroke: rgba(tint, 0.3), strokeWidth: 4 })),
        [0, 1, 2, 3, 4, 5].map((i) => {
          const ph = (t * (0.12 + i * 0.02) + i * 0.16) % 1;
          return R("circle", { key: "dt" + i, cx: 160 + i * 160 + Math.sin(t * 0.7 + i) * 34, cy: floor - ph * 660, r: 3 + (i % 3) * 2, fill: rgba(theme.accent, 0.24 * (1 - ph)) });
        }));
    },
  });

  /* ── 34 GALLERY HOURS — a track light sliding along the hang ── */
  FilmKit.make({
    global: "GalleryHours", brand: "Gallery Hours", desk: "#191713", ambient: 1.35, chrome: false,
    FH: '"Italiana", Georgia, serif', FB: '"Jost", system-ui, sans-serif', FM: '"IBM Plex Mono", monospace',
    titlePreset: "drowse", itemPreset: "rise", titleLine: 1.1, titleSpace: "0.02em",
    palette: (t) => ({ bg: t.bg || "#f2f0ec", surface: "#fdfcfa", rule: "#d2cec7", inkMuted: "#6f6b64", ink: "#141311", accent: t.accent || "#1f4f4a", accent2: t.accent2 || "#c9a34f", accentInk: "#fdfcfa" }),
    tweaks: [{ k: "bg", label: "Plaster", options: ["#f2f0ec", "#f4f2ee", "#efedea"] }, { k: "accent", label: "Deep", options: ["#1f4f4a", "#1f3a4f", "#4a1f4f"] }, { k: "accent2", label: "Gilt", options: ["#c9a34f", "#c97f4f", "#9fc94f"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(120% 60% at 50% 0%, " + rgba(theme.surface, 0.98) + " 0%, transparent 58%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.2, strokeLinecap: "round" }, R2("rect", { x: 4, y: 5, width: 16, height: 14, rx: 2 }), R2("path", { d: "M12 19v2" })),
    cams: ["zoomOut", "pushL", "drop", "pushR", "zoomIn", "pushU"], camMul: 5, camOff: 1,
    mag: { rot: 0.15, driftX: 5, driftY: 6, driftZ: 0.04, slide: 0.18, inn: 0.26, zin: 0.26, zout: 0.24 },
    variants: { Scroll: "feed", Typing: "hand", Ring: "ring" },
    look: LOOK({ h: 120, kicker: { v: "bare", c: "accent" }, sBg: "accent", sFg: "accentInk", qlh: 1.2, swap: "body", card: "paper", chip: "outline", r: 2, cBg: "ink", cFg: "surface", btn: "pill", btnBg: "accent2", btnC: "ink", logo: "circle" }),
    /* WORLD — three framed works with labels; a ceiling track and one light head
       sliding a 16s pass, its cone brightening each work as it passes; a bench and
       a visitor who stops, looks and moves on. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, wallFoot = H - 300;
      const cyc = (t % 16) / 16, tri = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;
      const lx = 120 + E.inOut(tri) * (W - 240);
      const works = [[240, 1120], [W * 0.5, 1080], [W - 250, 1140]];
      const vc = (t % 22) / 22, vx = 140 + vc * (W - 280);
      const pause = vc > 0.3 && vc < 0.45 ? 1 : 0;
      return R("g", null,
        R("defs", null, R("linearGradient", { id: "gh-cone", x1: "50%", y1: "0%", x2: "50%", y2: "100%" },
          R("stop", { offset: "0%", stopColor: rgba(theme.accent2, 0.32) }), R("stop", { offset: "100%", stopColor: rgba(theme.accent2, 0) }))),
        /* a skylight run and a second track, above the copy */
        R("g", { opacity: 0.6 },
          [0, 1, 2].map((i) => R("g", { key: "sk" + i },
            R("rect", { x: 60 + i * 330, y: 26, width: 250, height: 96, rx: 6, fill: rgba(theme.accent2, 0.14), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
            R("line", { x1: 185 + i * 330, y1: 26, x2: 185 + i * 330, y2: 122, stroke: rgba(tint, 0.3), strokeWidth: 4 }),
            R("path", { d: "M " + (60 + i * 330) + " 122 L " + (10 + i * 330) + " 300 L " + (360 + i * 330) + " 300 L " + (310 + i * 330) + " 122 Z", fill: rgba(theme.accent2, 0.05) }))),
          R("line", { x1: 0, y1: 138, x2: W, y2: 138, stroke: rgba(tint, 0.4), strokeWidth: 6 })),
        R("line", { x1: 0, y1: 190, x2: W, y2: 190, stroke: rgba(tint, 0.5), strokeWidth: 10, strokeLinecap: "round" }),
        R("path", { d: "M " + (lx - 150) + " 210 L " + (lx + 150) + " 210 L " + (lx + 330) + " " + wallFoot + " L " + (lx - 330) + " " + wallFoot + " Z", fill: "url(#gh-cone)" }),
        R("g", { transform: "translate(" + lx.toFixed(1) + ",190)" },
          R("rect", { x: -26, y: -18, width: 52, height: 30, rx: 6, fill: rgba(theme.ink, 0.8) }),
          R("path", { d: "M -34 12 h 68 l -14 54 h -40 z", fill: rgba(tint, 0.7) }),
          R("circle", { cx: 0, cy: 72, r: 16, fill: rgba(theme.accent2, 0.9) })),
        works.map((wk, i) => {
          const near = Math.max(0, 1 - Math.abs(lx - wk[0]) / 320);
          return R("g", { key: "wk" + i, transform: "translate(" + wk[0] + "," + wk[1] + ")" },
            R("rect", { x: -130, y: -170, width: 260, height: 340, rx: 2, fill: rgba(theme.surface, inv ? 0.4 : 0.98), stroke: rgba(theme.accent2, 0.4 + 0.4 * near), strokeWidth: 8 }),
            i === 0 ? R("circle", { cx: 0, cy: -20, r: 74, fill: rgba(theme.accent, 0.3 + 0.3 * near) })
              : i === 1 ? R("path", { d: "M -80 100 L 0 -80 L 80 100 z", fill: rgba(theme.accent, 0.28 + 0.3 * near) })
                : R("g", null, [0, 1, 2].map((j) => R("rect", { key: "bd" + j, x: -80 + j * 56, y: -40 - j * 20, width: 40, height: 120 + j * 30, fill: rgba(theme.accent, 0.24 + 0.26 * near) }))),
            R("rect", { x: -60, y: 196, width: 120, height: 26, rx: 3, fill: rgba(tint, 0.35 + 0.25 * near) }));
        }),
        /* a plinth with a turning sculpture, and a wall vitrine, in the margin */
        R("g", { transform: "translate(" + (W - 150) + ",1430)" },
          R("path", { d: "M -84 90 h 168 v -170 h -168 z", fill: rgba(theme.surface, inv ? 0.4 : 0.96), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("ellipse", { cx: 0, cy: -80, rx: 84, ry: 20, fill: rgba(theme.rule, 0.5) }),
          R("g", { transform: "translate(0,-96) rotate(" + ((t * 14) % 360).toFixed(1) + ")" },
            R("path", { d: "M -40 0 q 22 -96 40 -60 q 20 40 40 -18 q -14 96 -40 62 q -22 -34 -40 16 z", fill: rgba(theme.accent, 0.7), stroke: rgba(tint, 0.4), strokeWidth: 3 }))),
        R("g", { opacity: 0.7, transform: "translate(190,1400)" },
          R("rect", { x: -110, y: -160, width: 220, height: 230, rx: 4, fill: rgba(theme.accent2, 0.08), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("line", { x1: -110, y1: -40, x2: 110, y2: -40, stroke: rgba(tint, 0.35), strokeWidth: 4 }),
          [0, 1, 2].map((i) => R("circle", { key: "vt" + i, cx: -60 + i * 60, cy: -86 + (i % 2) * 14, r: 18, fill: rgba(theme.accent, 0.45) })),
          [0, 1].map((i) => R("rect", { key: "vb" + i, x: -70 + i * 80, y: 6, width: 60, height: 40, rx: 3, fill: rgba(theme.accent2, 0.35) }))),
        R("line", { x1: 0, y1: wallFoot, x2: W, y2: wallFoot, stroke: rgba(tint, 0.5), strokeWidth: 7 }),
        R("rect", { x: 0, y: wallFoot, width: W, height: H - wallFoot, fill: rgba(theme.rule, 0.28) }),
        R("g", { transform: "translate(" + (W * 0.3) + "," + (wallFoot + 120) + ")" },
          R("rect", { x: -200, y: -26, width: 400, height: 26, rx: 6, fill: rgba(theme.surface, 0.9), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("path", { d: "M -160 0 v 60 M 160 0 v 60", stroke: rgba(tint, 0.5), strokeWidth: 9 })),
        /* a rope stanchion line across the front */
        R("g", { opacity: 0.55 },
          [0, 1, 2, 3].map((i) => R("g", { key: "sn" + i, transform: "translate(" + (150 + i * 280) + "," + (H - 60) + ")" },
            R("path", { d: "M -30 0 h 60 l -8 -12 h -44 z", fill: rgba(tint, 0.6) }),
            R("line", { x1: 0, y1: -12, x2: 0, y2: -150, stroke: rgba(tint, 0.6), strokeWidth: 8 }),
            R("circle", { cx: 0, cy: -158, r: 10, fill: rgba(theme.accent2, 0.8) }))),
          [0, 1, 2].map((i) => R("path", { key: "rp" + i, d: "M " + (150 + i * 280) + " " + (H - 210) + " q 140 " + (46 + Math.sin(t * 0.8 + i) * 6).toFixed(1) + " 280 0", fill: "none", stroke: rgba(theme.accent, 0.55), strokeWidth: 7, strokeLinecap: "round" }))),
        /* a second visitor, further off and slower */
        (function () {
          const v2 = ((t + 9) % 30) / 30, x2 = W - 120 - v2 * (W - 300);
          return R("g", { opacity: 0.32, transform: "translate(" + x2.toFixed(1) + "," + (wallFoot + 8) + ") scale(0.82)" },
            R("circle", { cx: 0, cy: -180, r: 30, fill: rgba(tint, 0.75) }),
            R("path", { d: "M -30 -150 h 60 l -12 150 h -36 z", fill: rgba(tint, 0.75) }));
        })(),
        R("g", { opacity: 0.5, transform: "translate(" + vx.toFixed(1) + "," + (wallFoot + 40 - pause * 4) + ")" },
          R("circle", { cx: 0, cy: -180, r: 30, fill: rgba(tint, 0.75) }),
          R("path", { d: "M -30 -150 h 60 l -12 150 h -36 z", fill: rgba(tint, 0.75) }),
          R("path", { d: "M " + (pause ? 30 : 18) + " -120 l 40 " + (pause ? -30 : 20), stroke: rgba(tint, 0.6), strokeWidth: 8, strokeLinecap: "round" })));
    },
  });

  /* ── 35 BLUNT OBJECT — a wrecking ball on the swing ── */
  FilmKit.make({
    global: "BluntObject", brand: "Blunt Object", desk: "#141008", ambient: 1.8, chrome: false,
    FH: '"Anton", system-ui, sans-serif', FB: '"Rubik", system-ui, sans-serif', FM: '"IBM Plex Mono", monospace',
    titlePreset: "slam", itemPreset: "stamp", titleLine: 0.96, titleSpace: "-0.01em",
    palette: (t) => ({ bg: t.bg || "#e9e3d6", surface: "#f7f3ea", rule: "#c6bda8", inkMuted: "#6d675a", ink: "#151309", accent: t.accent || "#f2600c", accent2: t.accent2 || "#2f5f7a", accentInk: "#f7f3ea" }),
    tweaks: [{ k: "bg", label: "Dust", options: ["#e9e3d6", "#ebe6da", "#e6e0d2"] }, { k: "accent", label: "Safety", options: ["#f2600c", "#f2b00c", "#f20c60"] }, { k: "accent2", label: "Second", options: ["#2f5f7a", "#2f7a5f", "#5f2f7a"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(180deg, " + rgba(theme.surface, 0.92) + " 0%, " + bg + " 44%, " + rgba(theme.rule, 0.5) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.6, strokeLinecap: "round" }, R2("path", { d: "M4 4h10M9 4v6" }), R2("circle", { cx: 15, cy: 15, r: 5 })),
    cams: ["drop", "spin", "pushR", "hopU", "pushL", "zoomIn"], camMul: 3, camOff: 2,
    mag: { rot: 1.1, driftX: 9, driftY: 9, driftZ: 0.05, slide: 0.3, inn: 0.16, zin: 0.4, zout: 0.34 },
    variants: { Scroll: "board", Typing: "caret", Ring: "bar" },
    look: LOOK({ h: 122, upper: true, kicker: { v: "tag", bg: "accent", c: "accentInk" }, sBg: "ink", sFg: "surface", qlh: 1.0, swap: "quote", card: "frame", chip: "square", r: 4, cBg: "accent", cFg: "accentInk", btn: "block", btnBg: "ink", btnC: "accentInk", logo: "rounded" }),
    /* WORLD — hoarding with pasted bills under a gap in the skyline; a crane mast
       in the margin; the ball swings a 4.4s arc, rotating slowly, with a dust
       burst at the far end of each swing; rubble and grit below. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, ground = H - 280;
      const beat = Math.sin((t / 4.4) * Math.PI * 2), ang = beat * 34;
      const hit = beat < -0.985 ? 1 : 0, spin = (t * 40) % 360, bills = (t * 6) % 320;
      return R("g", null,
        R("defs", null, R("pattern", { id: "bo-hoard", width: 60, height: 200, patternUnits: "userSpaceOnUse" }, R("rect", { x: 0, y: 0, width: 54, height: 200, fill: rgba(theme.rule, inv ? 0.3 : 0.6) }))),
        R("g", { opacity: 0.4 },
          [0, 1, 3, 4].map((i) => R("rect", { key: "sk" + i, x: 30 + i * 216, y: 270 - (90 + ((i * 53) % 4) * 44), width: 150, height: 90 + ((i * 53) % 4) * 44, fill: rgba(theme.accent2, 0.4) })),
          R("rect", { x: 0, y: 268, width: W, height: 12, fill: rgba(tint, 0.5) })),
        R("g", { transform: "translate(" + (W - 120) + ",290)" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: 1050, stroke: rgba(theme.accent, 0.75), strokeWidth: 14 }),
          Array.from({ length: 9 }).map((_, i) => R("path", { key: "ms" + i, d: "M -22 " + (i * 116) + " L 22 " + ((i + 1) * 116) + " M 22 " + (i * 116) + " L -22 " + ((i + 1) * 116), stroke: rgba(theme.accent, 0.4), strokeWidth: 5 })),
          R("line", { x1: -300, y1: 0, x2: 40, y2: 0, stroke: rgba(theme.accent, 0.75), strokeWidth: 12 })),
        /* site floodlights and a gantry sign, above the copy */
        R("g", { opacity: 0.7 },
          R("rect", { x: -20, y: 150, width: W + 40, height: 20, rx: 5, fill: rgba(tint, 0.5) }),
          [0, 1, 2].map((i) => R("g", { key: "fl" + i, transform: "translate(" + (180 + i * 340) + ",170)" },
            R("path", { d: "M -40 0 h 80 l -14 46 h -52 z", fill: rgba(theme.ink, 0.7) }),
            R("circle", { cx: 0, cy: 56, r: 16 + Math.sin(t * 2.4 + i * 2) * 2, fill: rgba(theme.accent, 0.85) }),
            R("path", { d: "M -60 56 L 60 56 L 150 " + (ground - 260) + " L -150 " + (ground - 260) + " Z", fill: rgba(theme.accent, 0.05) }))),
          R("g", { transform: "translate(" + (W - 250) + ",30)" },
            R("rect", { x: -120, y: 0, width: 240, height: 84, rx: 6, fill: rgba(theme.accent, 0.85) }),
            R("rect", { x: -96, y: 24, width: 192, height: 14, rx: 7, fill: rgba(theme.accentInk, 0.6) }),
            R("rect", { x: -76, y: 52, width: 152, height: 10, rx: 5, fill: rgba(theme.accentInk, 0.4) }))),
        /* a digger nodding beyond the hoarding */
        (function () {
          const nod = Math.sin(t * 0.9);
          return R("g", { opacity: 0.45, transform: "translate(230," + (ground - 250) + ")" },
            R("rect", { x: -90, y: -70, width: 150, height: 70, rx: 8, fill: rgba(theme.accent2, 0.75) }),
            R("rect", { x: -110, y: 0, width: 200, height: 30, rx: 10, fill: rgba(theme.ink, 0.6) }),
            R("g", { transform: "rotate(" + (-24 + nod * 12).toFixed(2) + " 60 -50)" },
              R("path", { d: "M 60 -50 L 210 -140", stroke: rgba(theme.accent2, 0.8), strokeWidth: 18, strokeLinecap: "round" }),
              R("g", { transform: "rotate(" + (34 - nod * 22).toFixed(2) + " 210 -140)" },
                R("path", { d: "M 210 -140 L 280 -40", stroke: rgba(theme.accent2, 0.8), strokeWidth: 15, strokeLinecap: "round" }),
                R("path", { d: "M 262 -66 l 48 26 l -12 44 l -52 -22 z", fill: rgba(theme.accent, 0.8) }))));
        })(),
        R("rect", { x: 0, y: ground - 230, width: W, height: 230, fill: "url(#bo-hoard)", opacity: 0.7 }),
        [0, 1, 2, 3].map((i) => R("g", { key: "bl" + i, transform: "translate(" + (((i * 320 - bills) % (W + 320)) - 160).toFixed(1) + "," + (ground - 150) + ") rotate(" + (-3 + i * 2) + ")" },
          R("rect", { x: -70, y: -60, width: 140, height: 120, rx: 2, fill: rgba(theme.surface, inv ? 0.45 : 0.92), stroke: rgba(tint, 0.3), strokeWidth: 2 }),
          R("rect", { x: -50, y: -36, width: 100, height: 14, rx: 3, fill: rgba(theme.accent, 0.7) }),
          R("rect", { x: -50, y: -8, width: 74, height: 10, rx: 3, fill: rgba(tint, 0.4) }))),
        R("g", { transform: "translate(" + (W - 420) + ",290) rotate(" + ang.toFixed(2) + ")" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: 900, stroke: rgba(theme.ink, 0.7), strokeWidth: 7 }),
          R("g", { transform: "translate(0,900) rotate(" + spin.toFixed(1) + ")" },
            R("circle", { r: 92, fill: rgba(theme.ink, 0.88) }),
            R("path", { d: "M -92 0 a 92 92 0 0 1 92 -92 l 0 38 a 54 54 0 0 0 -54 54 z", fill: rgba(theme.surface, 0.16) }),
            R("circle", { cx: -26, cy: -28, r: 17, fill: rgba(theme.surface, 0.14) }))),
        [0, 1, 2, 3, 4].map((i) => {
          const ph = ((t % 4.4) / 4.4 + i * 0.06) % 1;
          const fade = hit ? 1 : Math.max(0, 1 - ph * 3);
          return R("circle", { key: "db" + i, cx: W - 700 - i * 40, cy: ground - 140 - i * 20, r: 30 + i * 26, fill: rgba(theme.rule, 0.4 * fade) });
        }),
        /* a skip and a mixer in the margin band */
        R("g", { transform: "translate(" + (W - 170) + ",1420)" },
          R("path", { d: "M -130 60 h 260 l -34 -120 h -192 z", fill: rgba(theme.accent2, 0.5), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("path", { d: "M -130 20 h 260", stroke: rgba(tint, 0.35), strokeWidth: 4 }),
          [0, 1, 2].map((i) => R("path", { key: "sp" + i, d: "M 0 0 l 40 -10 l 10 26 l -36 12 z", fill: rgba(tint, 0.45), transform: "translate(" + (-70 + i * 60) + ",-76) rotate(" + (i * 41) + ")" }))),
        R("g", { transform: "translate(240,1420)" },
          R("path", { d: "M -70 90 h 140 M -50 90 v -30 M 50 90 v -30", stroke: rgba(tint, 0.55), strokeWidth: 8, strokeLinecap: "round" }),
          R("g", { transform: "rotate(" + ((t * 90) % 360).toFixed(1) + " 0 -10)" },
            R("path", { d: "M -66 -10 q 66 -80 132 0 q -66 74 -132 0 z", fill: rgba(theme.accent, 0.6), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
            R("path", { d: "M -30 -34 q 30 20 60 -6", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 4 }))),
        R("line", { x1: 0, y1: ground, x2: W, y2: ground, stroke: rgba(tint, 0.6), strokeWidth: 8 }),
        R("rect", { x: 0, y: ground, width: W, height: H - ground, fill: rgba(theme.rule, 0.34) }),
        [0, 1, 2, 3, 4, 5, 6].map((i) => R("path", { key: "rb" + i, d: "M 0 0 l 46 -8 l 12 30 l -40 10 z", fill: rgba(tint, 0.4), transform: "translate(" + (60 + i * 150) + "," + (ground + 40 + (i % 3) * 40) + ") rotate(" + (i * 37) + ")" })),
        [0, 1, 2, 3, 4].map((i) => {
          const ph = (t * (0.4 + i * 0.08) + i * 0.2) % 1;
          return R("circle", { key: "gt" + i, cx: 200 + i * 190 + Math.sin(t * 2 + i) * 40, cy: ground - ph * 400, r: 4 + (i % 2) * 3, fill: rgba(tint, 0.3 * (1 - ph)) });
        }));
    },
  });
})();
