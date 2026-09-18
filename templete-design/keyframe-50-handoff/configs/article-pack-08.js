/* article-pack-08.js — cohort 08, science / explainer: packs 36-40.
   Proof Steps · Deep Field · Half Life · Long Tail · First Principle
   Contract per HANDOFF.md: hexes only in palette(), look and World name slots,
   chrome:false, three depth planes, an object on a route with secondary motion,
   nothing between y=290 and y=1330 except margin clusters (x>820), tone-aware
   tints, comparison tiles on tile.bg "rule". Every world is built at full
   density: an overhead element, a mid-band margin cluster, a populated floor. */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  const LOOK = (o) => ({
    hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: o.h, upper: o.upper, kicker: o.kicker },
    statement: { bg: o.sBg, fg: o.sFg, hi: "accent2", world: true, top: 610, size: o.h + 12, upper: o.upper },
    body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: o.h - 26, bodySize: 38, ch: 54, lh: 1.52, weight: 400, dim: 0.92, kicker: { v: "bare", c: "accent2" } },
    quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: o.h - 16, ch: 25, lh: o.qlh, markSize: 210 },
    feature: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 255, size: o.h - 16, upper: o.upper, swap: o.swap, card: { v: o.card, bg: "surface", glow: "accent", r: o.r, line: "inkMuted" }, chips: { v: o.chip, colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
    montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: o.h - 22, upper: o.upper, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: o.r, h: 640, labelSize: 42 }, tilts: [0, 0, 0, 0] },
    stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: o.h - 20, upper: o.upper, cols: ["accent", "accent2", "ink"], num: 150, rule: !o.glow, glowNums: o.glow },
    cta: { bg: o.cBg, fg: o.cFg, hi: "accent2", world: true, top: 470, size: o.h - 6, upper: o.upper, align: "left", btn: { v: o.btn, bg: o.btnBg, c: o.btnC }, logoShape: o.logo },
    app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
  });

  /* ── 36 PROOF STEPS — an escapement counting out a proof ── */
  FilmKit.make({
    global: "ProofSteps", brand: "Proof Steps", desk: "#0d1012", ambient: 1.45, chrome: false,
    FH: '"Space Mono", ui-monospace, monospace', FB: '"Atkinson Hyperlegible", system-ui, sans-serif', FM: '"Space Mono", monospace',
    titlePreset: "machete", itemPreset: "rise", titleLine: 1.14, titleSpace: "-0.02em",
    /* ladder: bg .88 / surface .97 / rule .75 / inkMuted .45 / ink .07 / accent .38 / accent2 .5 */
    palette: (t) => ({ bg: t.bg || "#eef0ef", surface: "#fbfcfc", rule: "#c9cdcc", inkMuted: "#6b7170", ink: "#111413", accent: t.accent || "#2f6f5f", accent2: t.accent2 || "#c98a2f", accentInk: "#fbfcfc" }),
    tweaks: [{ k: "bg", label: "Paper", options: ["#eef0ef", "#f0f2f1", "#ecefee"] }, { k: "accent", label: "Green", options: ["#2f6f5f", "#2f5f6f", "#5f2f6f"] }, { k: "accent2", label: "Brass", options: ["#c98a2f", "#c9622f", "#a8c92f"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(96% 52% at 50% 4%, " + rgba(theme.surface, 0.96) + " 0%, transparent 60%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.3, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M12 3v10M6 21l6-8 6 8" })),
    cams: ["pushU", "zoomIn", "pushL", "drop", "zoomOut", "pushR"], camMul: 5, camOff: 2,
    mag: { rot: 0.14, driftX: 5, driftY: 6, driftZ: 0.03, slide: 0.2, inn: 0.2, zin: 0.28, zout: 0.26 },
    variants: { Scroll: "board", Typing: "terminal", Ring: "gauge" },
    look: LOOK({ h: 84, kicker: { v: "square", bg: "accent", c: "accentInk" }, sBg: "accent", sFg: "accentInk", qlh: 1.2, swap: "body", card: "frame", chip: "square", r: 6, cBg: "ink", cFg: "surface", btn: "block", btnBg: "accent2", btnC: "ink", logo: "rounded" }),
    /* WORLD — a proof rig on a bench. Overhead: a truss of measuring rules and a
       row of clamp lamps. Margin: an escapement whose wheel steps one tooth per
       swing while a step counter advances. Floor: a QED plaque, a stack of proof
       sheets and a caliper. Near: chalk motes. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, bench = H - 290;
      const beat = Math.sin((t / 2) * Math.PI * 2), swing = beat * 20;
      const steps = Math.floor(t / 1) % 12;
      const tick = Math.abs(beat) > 0.97 ? 1 : 0;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "ps-grid", width: 60, height: 60, patternUnits: "userSpaceOnUse" },
            R("path", { d: "M60 0H0v60", fill: "none", stroke: rgba(theme.rule, inv ? 0.24 : 0.7), strokeWidth: 2 }))),
        R("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#ps-grid)" }),
        /* overhead: a truss of rules and clamp lamps */
        R("g", { opacity: 0.66 },
          R("rect", { x: -20, y: 40, width: W + 40, height: 20, rx: 5, fill: rgba(tint, 0.5) }),
          Array.from({ length: 22 }).map((_, i) => R("line", { key: "rl" + i, x1: 30 + i * 48, y1: 60, x2: 30 + i * 48, y2: 60 + (i % 5 === 0 ? 40 : 22), stroke: rgba(tint, 0.55), strokeWidth: i % 5 === 0 ? 4 : 3 })),
          [0, 1, 2].map((i) => R("g", { key: "cl" + i, transform: "translate(" + (150 + i * 170) + ",60) rotate(" + (Math.sin(t * 0.6 + i) * 1.6).toFixed(2) + ")" },
            R("line", { x1: 0, y1: 0, x2: 0, y2: 96, stroke: rgba(tint, 0.5), strokeWidth: 4 }),
            R("path", { d: "M -40 96 h 80 l -18 44 h -44 z", fill: rgba(theme.accent, 0.55) }),
            R("circle", { cx: 0, cy: 152, r: 13 + tick * 3, fill: rgba(theme.accent2, 0.75 + 0.2 * tick) })))),
        /* a pegboard of set squares and dividers under the truss */
        R("g", { opacity: 0.62 },
          [0, 1, 2].map((i) => R("g", { key: "sq" + i, transform: "translate(" + (620 + i * 130) + ",130) rotate(" + (Math.sin(t * 0.6 + i * 1.3) * 1.8).toFixed(2) + ")" },
            R("line", { x1: 0, y1: -22, x2: 0, y2: 0, stroke: rgba(tint, 0.45), strokeWidth: 3 }),
            i === 1
              ? R("g", null,
                  R("path", { d: "M 0 0 l -34 96 M 0 0 l 34 96", stroke: rgba(theme.accent2, 0.7), strokeWidth: 6, strokeLinecap: "round" }),
                  R("path", { d: "M -20 56 h 40", stroke: rgba(tint, 0.45), strokeWidth: 4 }))
              : R("g", null,
                  R("path", { d: "M -44 0 h 88 l -88 96 z", fill: "none", stroke: rgba(theme.accent, 0.6), strokeWidth: 5 }),
                  R("path", { d: "M -30 22 h 20 v 20", fill: "none", stroke: rgba(tint, 0.4), strokeWidth: 4 })))),
          R("rect", { x: 560, y: 106, width: 400, height: 12, rx: 4, fill: rgba(tint, 0.5) })),
        /* a plumb bob hanging dead still while everything else moves */
        R("g", { transform: "translate(1006,118)" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: 108, stroke: rgba(tint, 0.55), strokeWidth: 3 }),
          R("path", { d: "M -14 108 h 28 l -14 52 z", fill: rgba(theme.accent2, 0.85) }),
          R("circle", { cx: 0, cy: 108, r: 6, fill: rgba(tint, 0.7) })),
        /* margin: the escapement, stepping one tooth per swing */
        R("g", { transform: "translate(" + (W - 160) + ",1310)" },
          R("rect", { x: -122, y: -200, width: 244, height: 400, rx: 8, fill: rgba(theme.surface, inv ? 0.3 : 0.92), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("g", { transform: "translate(0,-70) rotate(" + (steps * 30).toFixed(1) + ")" },
            R("circle", { r: 74, fill: "none", stroke: rgba(theme.accent, 0.8), strokeWidth: 8 }),
            Array.from({ length: 12 }).map((_, i) => R("path", { key: "th" + i, d: "M " + (Math.cos(i * 0.524) * 74).toFixed(1) + " " + (Math.sin(i * 0.524) * 74).toFixed(1) + " l " + (Math.cos(i * 0.524 + 0.4) * 20).toFixed(1) + " " + (Math.sin(i * 0.524 + 0.4) * 20).toFixed(1), stroke: rgba(theme.accent, 0.7), strokeWidth: 6, strokeLinecap: "round" })),
            R("circle", { r: 12, fill: rgba(theme.accent2, 0.9) })),
          R("g", { transform: "rotate(" + swing.toFixed(2) + " 0 -190)" },
            R("line", { x1: 0, y1: -190, x2: 0, y2: 40, stroke: rgba(theme.ink, 0.8), strokeWidth: 6, strokeLinecap: "round" }),
            R("path", { d: "M -34 -20 l 34 -22 l 34 22 l -34 22 z", fill: rgba(theme.accent2, 0.85) }),
            R("circle", { cx: 0, cy: 56, r: 24, fill: rgba(theme.accent, 0.85) })),
          R("rect", { x: -70, y: 128, width: 140, height: 44, rx: 6, fill: rgba(theme.ink, 0.82) }),
          R("text", { x: 0, y: 160, textAnchor: "middle", fontFamily: '"Space Mono", monospace', fontSize: 26, fill: rgba(theme.accent2, 0.95) }, "Q" + String(steps + 1).padStart(2, "0"))),
        /* a lemma board, ticked off one line at a time */
        R("g", { transform: "translate(" + (W - 200) + "," + (H - 200) + ")" },
          R("rect", { x: -170, y: -150, width: 340, height: 300, rx: 8, fill: rgba(theme.surface, inv ? 0.32 : 0.94), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("rect", { x: -170, y: -150, width: 340, height: 40, rx: 8, fill: rgba(theme.accent, 0.28) }),
          [0, 1, 2, 3, 4].map((i) => {
            const done = ((Math.floor(t / 2.4) % 6) > i) ? 1 : 0;
            return R("g", { key: "lm" + i },
              R("rect", { x: -146, y: -84 + i * 48, width: 24, height: 24, rx: 5, fill: done ? rgba(theme.accent, 0.85) : "none", stroke: rgba(tint, 0.5), strokeWidth: 3 }),
              done ? R("path", { d: "M -140 " + (-72 + i * 48) + " l 6 7 l 11 -13", fill: "none", stroke: rgba(theme.accentInk, 0.95), strokeWidth: 4, strokeLinecap: "round" }) : null,
              R("rect", { x: -108, y: -76 + i * 48, width: 150 + (i % 3) * 40, height: 9, rx: 4, fill: rgba(tint, done ? 0.55 : 0.28) }));
          })),
        /* a drawing arm sweeping an arc, a pencil tin and a cup */
        R("g", { opacity: 0.8, transform: "translate(" + (W * 0.5) + "," + (H - 130) + ")" },
          R("circle", { r: 20, fill: rgba(theme.accent, 0.55), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("g", { transform: "rotate(" + (Math.sin(t * 0.45) * 46).toFixed(2) + ")" },
            R("line", { x1: 0, y1: 0, x2: 0, y2: -178, stroke: rgba(tint, 0.6), strokeWidth: 7, strokeLinecap: "round" }),
            R("circle", { cx: 0, cy: -178, r: 9, fill: rgba(theme.accent2, 0.9) })),
          R("path", { d: "M -110 -46 A 118 118 0 0 1 110 -46", fill: "none", stroke: rgba(theme.accent, 0.3), strokeWidth: 3, strokeDasharray: "12 10" })),
        R("g", { transform: "translate(" + (W * 0.32) + "," + (H - 84) + ")" },
          R("path", { d: "M -34 0 h 68 l -6 -66 h -56 z", fill: rgba(theme.accent2, 0.4), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          [0, 1, 2, 3].map((i) => R("line", { key: "pn" + i, x1: -18 + i * 12, y1: -66, x2: -24 + i * 14, y2: -66 - (30 + (i % 3) * 18), stroke: rgba(i % 2 ? theme.accent : theme.ink, 0.7), strokeWidth: 6, strokeLinecap: "round" }))),
        R("g", { opacity: 0.85, transform: "translate(" + (W * 0.42) + "," + (H - 76) + ")" },
          R("path", { d: "M -28 0 h 56 l -6 -50 h -44 z", fill: rgba(theme.surface, inv ? 0.5 : 0.96), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
          R("path", { d: "M 28 -38 q 22 4 18 16 q -4 12 -20 10", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          [0, 1].map((i) => {
            const ph = ((t * 0.42 + i * 0.5) % 1);
            return R("path", { key: "sm" + i, d: "M " + (-10 + i * 20) + " -56 q " + (Math.sin(t * 1.3 + i * 2) * 10).toFixed(1) + " -32 0 -62", fill: "none", stroke: rgba(tint, 0.22 * (1 - ph)), strokeWidth: 6, strokeLinecap: "round", transform: "translate(0," + (-ph * 70).toFixed(1) + ")" });
          })),
        /* floor: bench, plaque, proof sheets, caliper */
        R("line", { x1: 0, y1: bench, x2: W, y2: bench, stroke: rgba(tint, 0.55), strokeWidth: 8 }),
        R("rect", { x: 0, y: bench, width: W, height: H - bench, fill: rgba(theme.rule, 0.3) }),
        R("g", { transform: "translate(200," + (bench + 10) + ")" },
          Array.from({ length: 5 }).map((_, i) => R("rect", { key: "sh" + i, x: -110 + (i % 2) * 12, y: -20 - i * 20, width: 220 - (i % 2) * 20, height: 16, rx: 2, fill: rgba(theme.surface, inv ? 0.45 : 0.97), stroke: rgba(tint, 0.32), strokeWidth: 2 })),
          R("rect", { x: -60, y: 40, width: 120, height: 40, rx: 5, fill: rgba(theme.accent, 0.4), stroke: rgba(tint, 0.4), strokeWidth: 3 })),
        R("g", { opacity: 0.8, transform: "translate(" + (W * 0.5) + "," + (bench + 90) + ") rotate(-4)" },
          R("rect", { x: -170, y: -14, width: 340, height: 28, rx: 6, fill: rgba(tint, 0.55) }),
          R("rect", { x: (-150 + (Math.sin(t * 0.5) * 0.5 + 0.5) * 200).toFixed(1), y: -34, width: 30, height: 68, rx: 4, fill: rgba(theme.accent2, 0.8) }),
          R("rect", { x: -170, y: -34, width: 26, height: 68, rx: 4, fill: rgba(theme.accent, 0.7) })),
        [0, 1, 2, 3, 4, 5].map((i) => {
          const ph = (t * (0.1 + i * 0.02) + i * 0.17) % 1;
          return R("circle", { key: "mo" + i, cx: 160 + i * 160 + Math.sin(t * 0.6 + i) * 32, cy: bench - ph * 660, r: 3 + (i % 3) * 2, fill: rgba(theme.accent, 0.24 * (1 - ph)) });
        }));
    },
  });

  /* ── 37 DEEP FIELD — a telescope tracking across the sky ── */
  FilmKit.make({
    global: "DeepField", brand: "Deep Field", desk: "#04060c", ambient: 1.6, chrome: false,
    FH: '"Orbitron", system-ui, sans-serif', FB: '"Lexend", system-ui, sans-serif', FM: '"Space Mono", monospace',
    titlePreset: "rise", itemPreset: "pop", titleLine: 1.1, titleSpace: "0.01em",
    /* ladder: bg .025 / surface .07 / rule .15 / inkMuted .42 / ink .9 / accent .6 / accent2 .5 */
    palette: (t) => ({ bg: t.bg || "#0b1020", surface: "#141b30", rule: "#283354", inkMuted: "#8b96b8", ink: "#f2f5fc", accent: t.accent || "#5ce1ff", accent2: t.accent2 || "#ff9f5c", accentInk: "#050810" }),
    tweaks: [{ k: "bg", label: "Sky", options: ["#0b1020", "#0d1124", "#09101c"] }, { k: "accent", label: "Cyan", options: ["#5ce1ff", "#5cff9f", "#9f5cff"] }, { k: "accent2", label: "Second", options: ["#ff9f5c", "#ff5c9f", "#e1ff5c"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(90% 48% at 26% 6%, " + rgba(theme.accent, 0.16) + " 0%, transparent 62%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.3, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M4 15l14-9 3 5-14 9zM8 18l-2 3" })),
    cams: ["zoomOut", "pushR", "drop", "pushL", "zoomIn", "pushU"], camMul: 7, camOff: 1,
    mag: { rot: 0.3, driftX: 7, driftY: 7, driftZ: 0.05, slide: 0.22, inn: 0.24, zin: 0.34, zout: 0.3 },
    variants: { Scroll: "feed", Typing: "caret", Ring: "ring" },
    look: LOOK({ h: 86, kicker: { v: "outline", c: "accent" }, sBg: "surface", sFg: "ink", qlh: 1.22, swap: "quote", card: "glow", chip: "outline", r: 14, cBg: "accent", cFg: "accentInk", btn: "glow", btnBg: "accentInk", btnC: "ink", logo: "circle", glow: true }),
    /* WORLD — an observatory at night. Overhead: a star field with a slow drift,
       a nebula wash and a satellite crossing. Margin: the dome slit with a control
       console. Mid: the telescope tracks a 20s arc, counterweight swinging opposite,
       finder scope aligned. Floor: the pier, cable runs and a spec board. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.accentInk : theme.inkMuted, pier = H - 300;
      const cyc = (t % 20) / 20, tri = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;
      const alt = -68 + E.inOut(tri) * 56;
      const drift = (t * 3) % 360;
      const satc = (t % 26) / 26;
      return R("g", null,
        R("defs", null,
          R("radialGradient", { id: "df-neb", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent, 0.28) }), R("stop", { offset: "100%", stopColor: rgba(theme.accent, 0) })),
          R("radialGradient", { id: "df-neb2", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent2, 0.2) }), R("stop", { offset: "100%", stopColor: rgba(theme.accent2, 0) }))),
        R("circle", { cx: W * 0.28, cy: 170, r: 340, fill: "url(#df-neb)" }),
        R("circle", { cx: W * 0.82, cy: 240, r: 260, fill: "url(#df-neb2)" }),
        /* overhead: stars on a slow rotation, brighter ones twinkling */
        R("g", { transform: "rotate(" + (drift * 0.05).toFixed(2) + " " + (W / 2) + " 140)" },
          Array.from({ length: 34 }).map((_, i) => {
            const sx = ((i * 137) % W), sy = 24 + ((i * 71) % 250);
            const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.6 + (i % 5) * 0.3) + i));
            return R("circle", { key: "st" + i, cx: sx, cy: sy, r: 2 + (i % 4), fill: rgba(i % 7 === 0 ? theme.accent : theme.ink, 0.3 + 0.55 * tw) });
          })),
        /* a constellation drawn faintly between the brighter stars */
        R("g", { opacity: 0.5 },
          R("path", { d: "M 130 60 L 236 128 L 352 96 L 430 176 L 560 138", fill: "none", stroke: rgba(theme.accent, 0.4), strokeWidth: 2.5 }),
          [[130, 60], [236, 128], [352, 96], [430, 176], [560, 138]].map((n, i) => R("circle", { key: "cn" + i, cx: n[0], cy: n[1], r: 4 + (i % 2) * 2, fill: rgba(theme.accent, 0.85) }))),
        /* a shooting star crossing every 9s */
        (function () {
          const sc = (t % 9) / 9;
          if (sc > 0.16) return null;
          const k = sc / 0.16, sx = 940 - k * 620, sy = 40 + k * 210;
          return R("g", { opacity: Math.sin(k * Math.PI) },
            R("line", { x1: sx + 90, y1: sy - 30, x2: sx, y2: sy, stroke: rgba(theme.ink, 0.75), strokeWidth: 4, strokeLinecap: "round" }),
            R("circle", { cx: sx, cy: sy, r: 5, fill: rgba(theme.ink, 0.95) }));
        })(),
        /* a satellite crossing the star band */
        R("g", { opacity: 0.8 },
          R("circle", { cx: -40 + satc * (W + 80), cy: 90 + Math.sin(satc * Math.PI) * 40, r: 5, fill: rgba(theme.accent2, 0.95) }),
          R("line", { x1: -80 + satc * (W + 80), y1: 96 + Math.sin(satc * Math.PI) * 40, x2: -40 + satc * (W + 80), y2: 90 + Math.sin(satc * Math.PI) * 40, stroke: rgba(theme.accent2, 0.35), strokeWidth: 3 })),
        /* margin: the dome slit and a console */
        R("g", { transform: "translate(" + (W - 140) + ",1140)" },
          R("path", { d: "M -120 220 A 130 210 0 0 1 120 220 Z", fill: rgba(theme.surface, 0.6), stroke: rgba(tint, 0.4), strokeWidth: 5 }),
          R("path", { d: "M -34 220 A 44 200 0 0 1 34 220 Z", fill: rgba(theme.bg, 0.95), stroke: rgba(theme.accent, 0.5), strokeWidth: 4 }),
          Array.from({ length: 6 }).map((_, i) => R("circle", { key: "ds" + i, cx: -14 + (i % 3) * 14, cy: 60 + Math.floor(i / 3) * 40, r: 3, fill: rgba(theme.accent, 0.7) })),
          R("rect", { x: -110, y: 250, width: 220, height: 90, rx: 8, fill: rgba(theme.surface, 0.9), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          [0, 1, 2, 3, 4].map((i) => R("rect", { key: "cs" + i, x: -92 + i * 38, y: 272, width: 26, height: 20, rx: 3, fill: rgba(Math.sin(t * 2 + i * 1.3) > 0 ? theme.accent : theme.rule, 0.85) })),
          R("path", { d: "M -92 320 h 184", stroke: rgba(theme.accent2, 0.6), strokeWidth: 5 })),
        /* mid: the telescope on its mount */
        R("g", { transform: "translate(" + (W * 0.4) + "," + (pier - 40) + ")" },
          R("path", { d: "M -120 40 h 240 l -40 -80 h -160 z", fill: rgba(theme.surface, 0.9), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
          R("circle", { cx: 0, cy: -50, r: 30, fill: rgba(theme.rule, 0.8), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("g", { transform: "rotate(" + alt.toFixed(2) + " 0 -50)" },
            R("rect", { x: -34, y: -420, width: 68, height: 380, rx: 14, fill: rgba(theme.surface, 0.96), stroke: rgba(theme.accent, 0.5), strokeWidth: 5 }),
            R("rect", { x: -34, y: -420, width: 68, height: 46, rx: 10, fill: rgba(theme.accent, 0.5) }),
            R("circle", { cx: 0, cy: -400, r: 22, fill: rgba(theme.accent, 0.7) }),
            R("rect", { x: 34, y: -320, width: 40, height: 96, rx: 8, fill: rgba(theme.rule, 0.9), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
            R("rect", { x: -30, y: 20, width: 60, height: 120, rx: 8, fill: rgba(theme.accent2, 0.6) }),
            R("line", { x1: 0, y1: -374, x2: 0, y2: -70, stroke: rgba(theme.accent, 0.16), strokeWidth: 3 })),
          R("path", { d: "M -140 40 L -104 240 M 140 40 L 104 240 M -104 240 h 208", stroke: rgba(tint, 0.45), strokeWidth: 8, strokeLinecap: "round" })),
        /* floor: pier, cable runs, a spec board */
        R("line", { x1: 0, y1: pier, x2: W, y2: pier, stroke: rgba(tint, 0.5), strokeWidth: 7 }),
        R("rect", { x: 0, y: pier, width: W, height: H - pier, fill: rgba(theme.surface, 0.45) }),
        R("path", { d: "M -30 " + (H - 70) + " q 240 " + (-60 + Math.sin(t * 0.8) * 12).toFixed(1) + " 500 6 q 250 62 540 -20", fill: "none", stroke: rgba(theme.accent, 0.3), strokeWidth: 9, strokeLinecap: "round" }),
        /* a guide-scope monitor, its field drifting with the tracking */
        R("g", { transform: "translate(" + (W * 0.72) + "," + (H - 160) + ")" },
          R("rect", { x: -150, y: -120, width: 300, height: 230, rx: 10, fill: rgba(theme.surface, 0.95), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
          R("rect", { x: -128, y: -100, width: 256, height: 168, rx: 6, fill: rgba(theme.accentInk, 0.75) }),
          Array.from({ length: 12 }).map((_, i) => R("circle", { key: "gs" + i, cx: -110 + ((i * 61 + t * 9) % 236), cy: -84 + ((i * 43) % 136), r: 2 + (i % 3), fill: rgba(theme.accent, 0.5 + (i % 4) * 0.12) })),
          R("path", { d: "M 0 -100 v 168 M -128 -16 h 256", stroke: rgba(theme.accent, 0.3), strokeWidth: 2 }),
          R("circle", { cx: Math.sin(t * 0.4) * 16, cy: -16 + Math.cos(t * 0.4) * 10, r: 12, fill: "none", stroke: rgba(theme.accent2, 0.9), strokeWidth: 3 }),
          R("rect", { x: -128, y: 80, width: 90, height: 10, rx: 5, fill: rgba(theme.accent, 0.6) })),
        /* a cable drum, a step ladder and a flask on the pier */
        R("g", { opacity: 0.8, transform: "translate(" + (W * 0.44) + "," + (H - 90) + ")" },
          R("circle", { r: 46, fill: rgba(theme.surface, 0.5), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("g", { transform: "rotate(" + ((t * 20) % 360).toFixed(1) + ")" },
            R("path", { d: "M -46 0 h 92 M 0 -46 v 92", stroke: rgba(theme.accent, 0.35), strokeWidth: 4 })),
          R("circle", { r: 15, fill: rgba(theme.accent2, 0.7) })),
        R("g", { opacity: 0.6, transform: "translate(" + (W * 0.2) + "," + (H - 60) + ")" },
          R("line", { x1: -46, y1: 0, x2: -14, y2: -190, stroke: rgba(tint, 0.6), strokeWidth: 8 }),
          R("line", { x1: 46, y1: 0, x2: 14, y2: -190, stroke: rgba(tint, 0.6), strokeWidth: 8 }),
          [0, 1, 2, 3].map((i) => R("line", { key: "rg" + i, x1: -38 + i * 6, y1: -30 - i * 42, x2: 38 - i * 6, y2: -30 - i * 42, stroke: rgba(tint, 0.5), strokeWidth: 6 }))),
        R("g", { transform: "translate(" + (W * 0.32) + "," + (H - 74) + ")" },
          R("path", { d: "M -22 0 h 44 v -74 h -44 z", fill: rgba(theme.accent2, 0.55), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("rect", { x: -14, y: -92, width: 28, height: 20, rx: 4, fill: rgba(tint, 0.6) }),
          R("rect", { x: -18, y: -50, width: 36, height: 10, rx: 3, fill: rgba(theme.accent, 0.5) })),
        R("g", { opacity: 0.75, transform: "translate(180," + (H - 150) + ")" },
          R("rect", { x: -110, y: -80, width: 220, height: 130, rx: 6, fill: rgba(theme.surface, 0.8), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          [0, 1, 2].map((i) => R("line", { key: "sb" + i, x1: -86, y1: -50 + i * 34, x2: 40 + (i % 2) * 46, y2: -50 + i * 34, stroke: rgba(theme.accent, 0.5), strokeWidth: 5 }))),
        [0, 1, 2, 3, 4, 5].map((i) => {
          const ph = (t * (0.12 + i * 0.02) + i * 0.18) % 1;
          return R("circle", { key: "dt" + i, cx: 200 + i * 160 + Math.sin(t * 0.7 + i) * 34, cy: H - ph * (H - 200), r: 2.5 + (i % 2), fill: rgba(theme.accent, 0.26 * (1 - ph)) });
        }));
    },
  });

  /* ── 38 HALF LIFE — a counter needle over a decaying sample ── */
  FilmKit.make({
    global: "HalfLife", brand: "Half Life", desk: "#0a0c0a", ambient: 1.55, chrome: false,
    FH: '"Michroma", system-ui, sans-serif', FB: '"Sofia Sans", system-ui, sans-serif', FM: '"Space Mono", monospace',
    titlePreset: "slam", itemPreset: "rise", titleLine: 1.16, titleSpace: "0em",
    /* ladder: bg .03 / surface .08 / rule .16 / inkMuted .42 / ink .89 / accent .58 / accent2 .48 */
    palette: (t) => ({ bg: t.bg || "#10160f", surface: "#1a2318", rule: "#2d3b2b", inkMuted: "#8fa08c", ink: "#f0f5ee", accent: t.accent || "#a8e05c", accent2: t.accent2 || "#e05ca8", accentInk: "#080c07" }),
    tweaks: [{ k: "bg", label: "Chamber", options: ["#10160f", "#121711", "#0e150d"] }, { k: "accent", label: "Trace", options: ["#a8e05c", "#5ce0a8", "#e0a85c"] }, { k: "accent2", label: "Second", options: ["#e05ca8", "#5ca8e0", "#e0e05c"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(84% 46% at 74% 96%, " + rgba(theme.accent, 0.16) + " 0%, transparent 60%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.3, strokeLinecap: "round" }, R2("circle", { cx: 12, cy: 12, r: 3 }), R2("path", { d: "M12 9V3M12 15l-5 4M12 15l5 4" })),
    cams: ["zoomIn", "pushL", "pushU", "drop", "pushR", "zoomOut"], camMul: 3, camOff: 4,
    mag: { rot: 0.2, driftX: 5, driftY: 6, driftZ: 0.045, slide: 0.2, inn: 0.2, zin: 0.32, zout: 0.28 },
    variants: { Scroll: "board", Typing: "typewriter", Ring: "bar" },
    look: LOOK({ h: 72, upper: true, kicker: { v: "tag", bg: "accent", c: "accentInk" }, sBg: "accent", sFg: "accentInk", qlh: 1.26, swap: "body", card: "glow", chip: "square", r: 12, cBg: "ink", cFg: "accentInk", btn: "glow", btnBg: "accent", btnC: "accentInk", logo: "circle", glow: true }),
    /* WORLD — a counting chamber. Overhead: a lead-brick wall and a warning strip
       that pulses on each count. Margin: the counter — needle kicking on decays,
       a rolling total, a bar of channels. Mid-floor: the sample under a bell jar
       losing mass on an 18s cycle, tongs, a lead pig. Near: decay tracks. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.accentInk : theme.inkMuted, bench = H - 280;
      const kick = Math.max(0, Math.sin(t * 5.5)) * Math.max(0, Math.sin(t * 1.7));
      const needle = -46 + kick * 92;
      const count = Math.floor(t * 7) % 10000;
      const decay = Math.pow(0.5, (t % 18) / 9);
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "hl-brick", width: 120, height: 60, patternUnits: "userSpaceOnUse" },
            R("rect", { x: 3, y: 3, width: 114, height: 54, rx: 4, fill: rgba(theme.rule, inv ? 0.4 : 1) }),
            R("rect", { x: 3, y: 3, width: 114, height: 12, rx: 4, fill: rgba(theme.inkMuted, 0.18) }))),
        /* overhead: lead bricks and a warning strip */
        R("rect", { x: 0, y: 20, width: W, height: 240, fill: "url(#hl-brick)", opacity: 1 }),
        R("rect", { x: 0, y: 20, width: W, height: 240, fill: rgba(theme.accent, 0.05) }),
        R("g", null,
          R("rect", { x: 0, y: 262, width: W, height: 34, fill: rgba(theme.accent2, 0.2 + 0.2 * kick) }),
          Array.from({ length: 14 }).map((_, i) => R("path", { key: "hz" + i, d: "M " + (i * 84 - ((t * 22) % 84)) + " 296 l 34 -34 h 34 l -34 34 z", fill: rgba(theme.accent2, 0.5) })),
          R("circle", { cx: 90, cy: 200, r: 34 + kick * 8, fill: rgba(theme.accent, 0.2 + 0.4 * kick) }),
          R("path", { d: "M 90 200 m -22 0 a 22 22 0 1 1 44 0 z", fill: rgba(theme.accent, 0.5 + 0.4 * kick) })),
        /* a ventilation duct with an extractor spinning in it */
        R("g", { opacity: 0.85 },
          R("rect", { x: 300, y: 34, width: 400, height: 92, rx: 10, fill: rgba(theme.surface, 0.55), stroke: rgba(tint, 0.4), strokeWidth: 5 }),
          Array.from({ length: 7 }).map((_, i) => R("line", { key: "dc" + i, x1: 330 + i * 56, y1: 34, x2: 330 + i * 56, y2: 126, stroke: rgba(tint, 0.3), strokeWidth: 4 })),
          R("g", { transform: "translate(500,80)" },
            R("circle", { r: 40, fill: rgba(theme.accentInk, 0.5), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
            R("g", { transform: "rotate(" + ((t * 340) % 360).toFixed(1) + ")" },
              [0, 1, 2, 3].map((i) => R("ellipse", { key: "bd" + i, cx: Math.cos(i * 1.571) * 22, cy: Math.sin(i * 1.571) * 22, rx: 17, ry: 8, fill: rgba(theme.accent, 0.6), transform: "rotate(" + (i * 90) + " " + (Math.cos(i * 1.571) * 22).toFixed(1) + " " + (Math.sin(i * 1.571) * 22).toFixed(1) + ")" }))),
            R("circle", { r: 8, fill: rgba(theme.accent2, 0.9) }))),
        /* a shielded viewing port, its glass catching the count */
        R("g", { transform: "translate(880,150)" },
          R("circle", { r: 74, fill: rgba(theme.accent, 0.08 + 0.12 * kick), stroke: rgba(tint, 0.5), strokeWidth: 9 }),
          R("circle", { r: 52, fill: "none", stroke: rgba(theme.accent2, 0.4), strokeWidth: 4 }),
          Array.from({ length: 8 }).map((_, i) => R("circle", { key: "bo" + i, cx: Math.cos(i * 0.785) * 74, cy: Math.sin(i * 0.785) * 74, r: 6, fill: rgba(tint, 0.6) })),
          R("path", { d: "M -34 -30 A 52 52 0 0 1 12 -50", fill: "none", stroke: rgba(theme.ink, 0.35), strokeWidth: 7, strokeLinecap: "round" })),
        /* margin: the counter */
        R("g", { transform: "translate(" + (W - 150) + ",1150)" },
          R("rect", { x: -128, y: -190, width: 256, height: 380, rx: 12, fill: rgba(theme.surface, 0.94), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("path", { d: "M -96 -20 A 96 96 0 0 1 96 -20 Z", fill: rgba(theme.accentInk, 0.55), stroke: rgba(tint, 0.35), strokeWidth: 3 }),
          Array.from({ length: 9 }).map((_, i) => R("line", { key: "tk" + i, x1: Math.cos(Math.PI + i * 0.393) * 74, y1: -20 + Math.sin(Math.PI + i * 0.393) * 74, x2: Math.cos(Math.PI + i * 0.393) * 88, y2: -20 + Math.sin(Math.PI + i * 0.393) * 88, stroke: rgba(i > 6 ? theme.accent2 : theme.accent, 0.7), strokeWidth: 4 })),
          R("line", { x1: 0, y1: -20, x2: Math.sin(needle * Math.PI / 180) * 78, y2: -20 - Math.cos(needle * Math.PI / 180) * 78, stroke: rgba(theme.accent, 0.95), strokeWidth: 6, strokeLinecap: "round" }),
          R("circle", { cx: 0, cy: -20, r: 10, fill: rgba(theme.accent2, 0.9) }),
          R("rect", { x: -100, y: 20, width: 200, height: 52, rx: 6, fill: rgba(theme.accentInk, 0.7) }),
          R("text", { x: 0, y: 58, textAnchor: "middle", fontFamily: '"Space Mono", monospace', fontSize: 32, fill: rgba(theme.accent, 0.95) }, String(count).padStart(4, "0")),
          [0, 1, 2, 3, 4, 5, 6, 7].map((i) => R("rect", { key: "ch" + i, x: -104 + i * 26, y: 96, width: 18, height: 60, rx: 3, fill: rgba(theme.accent, 0.16 + (Math.abs(Math.sin(t * 2.2 + i)) > 0.5 ? 0.6 : 0) * 0.9) })),
          R("circle", { cx: 0, cy: 176, r: 12, fill: rgba(theme.accent2, 0.4 + 0.5 * kick) })),
        /* mid-floor: the bell jar, sample, tongs, lead pig */
        R("line", { x1: 0, y1: bench, x2: W, y2: bench, stroke: rgba(tint, 0.55), strokeWidth: 8 }),
        R("rect", { x: 0, y: bench, width: W, height: H - bench, fill: rgba(theme.surface, 0.5) }),
        R("g", { transform: "translate(" + (W * 0.36) + "," + bench + ")" },
          R("ellipse", { cx: 0, cy: -6, rx: 130, ry: 24, fill: rgba(theme.rule, 0.7) }),
          R("path", { d: "M -110 -10 v -170 a 110 110 0 0 1 220 0 v 170 z", fill: rgba(theme.accent, 0.07), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
          R("circle", { cx: 0, cy: -292, r: 14, fill: rgba(tint, 0.6) }),
          R("ellipse", { cx: 0, cy: -22, rx: 78 * decay + 14, ry: (78 * decay + 14) * 0.34, fill: rgba(theme.accent, 0.5 + 0.3 * decay) }),
          R("ellipse", { cx: 0, cy: -22, rx: 78 * decay + 40, ry: (78 * decay + 40) * 0.34, fill: "none", stroke: rgba(theme.accent, 0.3 * decay), strokeWidth: 4 }),
          [0, 1, 2].map((i) => {
            const ph = ((t * 0.9 + i * 0.34) % 1);
            return R("circle", { key: "em" + i, cx: Math.cos(ph * 6.28 + i) * (40 + ph * 60), cy: -22 - ph * 90, r: 4 * (1 - ph), fill: rgba(theme.accent2, 0.8 * (1 - ph)) });
          })),
        /* a rack of dosimeters, each reading its own level */
        R("g", { transform: "translate(200," + (bench + 90) + ")" },
          R("rect", { x: -116, y: -104, width: 232, height: 132, rx: 8, fill: rgba(theme.surface, 0.92), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2, 3, 4, 5].map((i) => {
            const lvl = 0.3 + 0.7 * Math.abs(Math.sin(t * (0.4 + i * 0.16) + i));
            return R("g", { key: "dm" + i },
              R("rect", { x: -100 + (i % 3) * 68, y: -88 + Math.floor(i / 3) * 62, width: 54, height: 46, rx: 5, fill: rgba(theme.accentInk, 0.4), stroke: rgba(tint, 0.35), strokeWidth: 3 }),
              R("rect", { x: -94 + (i % 3) * 68, y: -60 + Math.floor(i / 3) * 62, width: 42 * lvl, height: 8, rx: 4, fill: rgba(lvl > 0.75 ? theme.accent2 : theme.accent, 0.9) }));
          })),
        /* a decay-curve readout halving as the sample does */
        R("g", { transform: "translate(" + (W - 260) + "," + (bench + 96) + ")" },
          R("rect", { x: -140, y: -110, width: 280, height: 150, rx: 8, fill: rgba(theme.accentInk, 0.45), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
          R("path", { d: "M -116 20 h 232 M -116 20 v -100", stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("path", { d: "M -116 -80 " + Array.from({ length: 12 }).map((_, i) => "L " + (-116 + i * 21) + " " + (-80 + (1 - Math.pow(0.5, i / 3)) * 100).toFixed(1)).join(" "), fill: "none", stroke: rgba(theme.accent, 0.9), strokeWidth: 4 }),
          R("circle", { cx: -116 + (1 - decay) * 231, cy: -80 + (1 - decay) * 100, r: 8, fill: rgba(theme.accent2, 0.95) }),
          R("rect", { x: -116, y: 30, width: 100, height: 8, rx: 4, fill: rgba(theme.accent, 0.5) })),
        /* a waste drum on the floor */
        R("g", { transform: "translate(" + (W - 130) + "," + (H - 76) + ")" },
          R("path", { d: "M -56 0 h 112 v -130 h -112 z", fill: rgba(theme.accent2, 0.3), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("ellipse", { cx: 0, cy: -130, rx: 56, ry: 14, fill: rgba(theme.accent2, 0.5), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          [0, 1].map((i) => R("line", { key: "rb" + i, x1: -56, y1: -40 - i * 46, x2: 56, y2: -40 - i * 46, stroke: rgba(tint, 0.35), strokeWidth: 6 })),
          R("circle", { cx: 0, cy: -76, r: 18, fill: rgba(theme.accent, 0.35 + 0.3 * kick) })),
        R("g", { opacity: 0.8, transform: "translate(" + (W * 0.56) + "," + (bench + 30) + ")" },
          R("path", { d: "M -60 60 h 120 l -14 -90 h -92 z", fill: rgba(theme.rule, 0.85), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("rect", { x: -30, y: -46, width: 60, height: 22, rx: 5, fill: rgba(theme.accent2, 0.7) })),
        R("g", { opacity: 0.7, transform: "translate(112," + (bench + 40) + ") rotate(-12) scale(0.8)" },
          R("path", { d: "M -10 0 l -70 -150 M 10 0 l 70 -150 M 0 -70 h 0", stroke: rgba(tint, 0.6), strokeWidth: 9, strokeLinecap: "round" }),
          R("circle", { cx: 0, cy: -6, r: 12, fill: rgba(theme.accent, 0.7) })),
        /* near: decay tracks */
        [0, 1, 2, 3, 4, 5, 6].map((i) => {
          const ph = (t * (0.6 + i * 0.1) + i * 0.2) % 1;
          const x = 120 + i * 140;
          return R("line", { key: "tr" + i, x1: x, y1: bench - ph * 900, x2: x + 40, y2: bench - ph * 900 - 26, stroke: rgba(theme.accent, 0.3 * (1 - ph)), strokeWidth: 3, strokeLinecap: "round" });
        }));
    },
  });

  /* ── 39 LONG TAIL — a seismograph drum writing the record ── */
  FilmKit.make({
    global: "LongTail", brand: "Long Tail", desk: "#12100c", ambient: 1.4, chrome: false,
    FH: '"Krona One", system-ui, sans-serif', FB: '"Kumbh Sans", system-ui, sans-serif', FM: '"Space Mono", monospace',
    titlePreset: "rise", itemPreset: "rise", titleLine: 1.2, titleSpace: "-0.01em",
    /* ladder: bg .87 / surface .96 / rule .74 / inkMuted .44 / ink .07 / accent .34 / accent2 .5 */
    palette: (t) => ({ bg: t.bg || "#eeeae1", surface: "#fbf9f4", rule: "#cac3b5", inkMuted: "#6c665b", ink: "#14120d", accent: t.accent || "#8c3f2f", accent2: t.accent2 || "#3f6c8c", accentInk: "#fbf9f4" }),
    tweaks: [{ k: "bg", label: "Chart", options: ["#eeeae1", "#f0ece4", "#ebe7de"] }, { k: "accent", label: "Trace", options: ["#8c3f2f", "#2f8c3f", "#3f2f8c"] }, { k: "accent2", label: "Second", options: ["#3f6c8c", "#8c6c3f", "#6c3f8c"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(178deg, " + rgba(theme.surface, 0.95) + " 0%, " + bg + " 46%, " + rgba(theme.rule, 0.42) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.3, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M2 14h4l2-8 3 14 3-10 2 4h6" })),
    cams: ["pushR", "zoomIn", "pushL", "pushU", "zoomOut", "drop"], camMul: 5, camOff: 3,
    mag: { rot: 0.12, driftX: 7, driftY: 5, driftZ: 0.035, slide: 0.24, inn: 0.2, zin: 0.28, zout: 0.26 },
    variants: { Scroll: "feed", Typing: "hand", Ring: "gauge" },
    look: LOOK({ h: 74, kicker: { v: "bare", c: "accent" }, sBg: "ink", sFg: "surface", qlh: 1.3, swap: "quote", card: "paper", chip: "outline", r: 6, cBg: "accent", cFg: "accentInk", btn: "pill", btnBg: "ink", btnC: "accentInk", logo: "circle" }),
    /* WORLD — a monitoring station. Overhead: a ceiling of pipework and a clock
       band. Margin: the drum rotating while the stylus writes the trace already
       laid down; a paper roll feeding it. Floor: a rack of instruments, a chair,
       coiled cable. Near: dust. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, floor = H - 290;
      const drum = (t * 42) % 360;
      const quake = Math.max(0, Math.sin(t * 0.5 - 1)) * Math.max(0, Math.sin(t * 3.4));
      const styl = Math.sin(t * 4.6) * (4 + quake * 30);
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "lt-chart", width: 44, height: 44, patternUnits: "userSpaceOnUse" },
            R("path", { d: "M44 0H0v44", fill: "none", stroke: rgba(theme.accent, inv ? 0.12 : 0.2), strokeWidth: 1.6 }))),
        R("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#lt-chart)" }),
        /* overhead: pipework and a clock band */
        R("g", { opacity: 0.6 },
          [0, 1].map((i) => R("path", { key: "pp" + i, d: "M -20 " + (70 + i * 76) + " h " + (W + 40), stroke: rgba(tint, 0.55), strokeWidth: 18 - i * 4, strokeLinecap: "round" })),
          [0, 1, 2, 3, 4].map((i) => R("rect", { key: "fl" + i, x: 100 + i * 200, y: 58 - 4, width: 30, height: 100, rx: 4, fill: rgba(tint, 0.4) })),
          R("g", { transform: "translate(" + (W - 150) + ",190)" },
            R("circle", { r: 58, fill: rgba(theme.surface, 0.92), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
            R("line", { x1: 0, y1: 0, x2: Math.cos(t * 0.1 - 1.57) * 26, y2: Math.sin(t * 0.1 - 1.57) * 26, stroke: rgba(tint, 0.8), strokeWidth: 5 }),
            R("line", { x1: 0, y1: 0, x2: Math.cos(t * 1.05 - 1.57) * 42, y2: Math.sin(t * 1.05 - 1.57) * 42, stroke: rgba(theme.accent, 0.9), strokeWidth: 3 })),
          R("rect", { x: 60, y: 244, width: W - 120, height: 14, rx: 4, fill: rgba(tint, 0.5) })),
        /* a gauge cluster on the pipework, needles drifting */
        R("g", { opacity: 0.8 },
          [0, 1, 2].map((i) => R("g", { key: "gg" + i, transform: "translate(" + (200 + i * 150) + ",176)" },
            R("circle", { r: 34, fill: rgba(theme.surface, 0.94), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
            R("path", { d: "M -24 8 A 26 26 0 0 1 24 8", fill: "none", stroke: rgba(theme.accent2, 0.5), strokeWidth: 4 }),
            R("line", { x1: 0, y1: 4, x2: Math.sin((Math.sin(t * (0.5 + i * 0.2) + i) * 0.9)) * 24, y2: 4 - Math.cos((Math.sin(t * (0.5 + i * 0.2) + i) * 0.9)) * 24, stroke: rgba(theme.accent, 0.9), strokeWidth: 4, strokeLinecap: "round" }),
            R("circle", { r: 5, cy: 4, fill: rgba(theme.accent, 0.9) }),
            R("line", { x1: 0, y1: -34, x2: 0, y2: -58, stroke: rgba(tint, 0.45), strokeWidth: 4 })))),
        /* a pendant lamp swinging on the same draught as the pipes */
        R("g", { transform: "translate(" + (W - 330) + ",84) rotate(" + (Math.sin(t * 0.75) * 2.2).toFixed(2) + ")" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: 100, stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("path", { d: "M -48 100 h 96 l -20 46 h -56 z", fill: rgba(theme.accent, 0.55) }),
          R("circle", { cx: 0, cy: 158, r: 14 + Math.sin(t * 1.5) * 2, fill: rgba(theme.accent2, 0.8) })),
        /* margin: the drum and stylus */
        R("g", { transform: "translate(" + (W - 160) + ",1140)" },
          R("rect", { x: -132, y: -180, width: 264, height: 380, rx: 10, fill: rgba(theme.surface, inv ? 0.32 : 0.94), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("g", { transform: "translate(0,-30)" },
            R("circle", { r: 96, fill: rgba(theme.rule, 0.5), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
            R("g", { transform: "rotate(" + drum.toFixed(1) + ")" },
              Array.from({ length: 8 }).map((_, i) => R("line", { key: "sp" + i, x1: 0, y1: 0, x2: Math.cos(i * 0.785) * 92, y2: Math.sin(i * 0.785) * 92, stroke: rgba(tint, 0.3), strokeWidth: 4 })),
              R("path", { d: "M -92 0 " + Array.from({ length: 12 }).map((_, i) => "L " + (-92 + i * 16) + " " + (Math.sin(i * 1.2 + t) * (6 + (i % 4) * 5)).toFixed(1)).join(" "), fill: "none", stroke: rgba(theme.accent, 0.9), strokeWidth: 3 })),
            R("circle", { r: 14, fill: rgba(theme.accent2, 0.9) })),
          R("g", { transform: "translate(0,-30)" },
            R("line", { x1: 132, y1: 0, x2: 96, y2: styl.toFixed(2), stroke: rgba(theme.ink, 0.8), strokeWidth: 6, strokeLinecap: "round" }),
            R("circle", { cx: 96, cy: styl, r: 7, fill: rgba(theme.accent, 0.95) })),
          R("rect", { x: -110, y: 110, width: 220, height: 70, rx: 6, fill: rgba(theme.accentInk, 0.12), stroke: rgba(tint, 0.35), strokeWidth: 3 }),
          R("path", { d: "M -96 145 " + Array.from({ length: 14 }).map((_, i) => "L " + (-96 + i * 14) + " " + (145 - Math.abs(Math.sin(i * 0.8 + t * 0.6)) * (10 + quake * 22)).toFixed(1)).join(" "), fill: "none", stroke: rgba(theme.accent2, 0.8), strokeWidth: 3 })),
        /* floor: instrument rack, chair, coiled cable */
        R("line", { x1: 0, y1: floor, x2: W, y2: floor, stroke: rgba(tint, 0.55), strokeWidth: 8 }),
        R("rect", { x: 0, y: floor, width: W, height: H - floor, fill: rgba(theme.rule, 0.3) }),
        R("g", { transform: "translate(190," + (floor + 10) + ")" },
          R("rect", { x: -120, y: -260, width: 240, height: 260, rx: 8, fill: rgba(theme.surface, inv ? 0.35 : 0.92), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2, 3].map((i) => R("g", { key: "in" + i },
            R("rect", { x: -100, y: -240 + i * 62, width: 200, height: 48, rx: 5, fill: rgba(theme.accentInk, 0.1), stroke: rgba(tint, 0.35), strokeWidth: 3 }),
            R("rect", { x: -88, y: -226 + i * 62, width: 60 + (i % 3) * 40, height: 20, rx: 3, fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.6) }),
            R("circle", { cx: 78, cy: -216 + i * 62, r: 8, fill: rgba(theme.accent, Math.sin(t * 1.6 + i) > 0 ? 0.9 : 0.25) })))),
        /* a wall map with a pulsing epicentre and range rings */
        R("g", { opacity: 0.72, transform: "translate(" + (W * 0.68) + "," + (floor + 74) + ") scale(0.74)" },
          R("rect", { x: -180, y: -150, width: 360, height: 300, rx: 6, fill: rgba(theme.accent2, 0.1), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("path", { d: "M -150 60 q 70 -70 140 -30 q 80 44 160 -20", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 5 }),
          R("path", { d: "M -150 -50 q 90 -50 170 6 q 70 48 130 4", fill: "none", stroke: rgba(tint, 0.3), strokeWidth: 4 }),
          (function () {
            const ph = (t % 4) / 4;
            return R("g", null,
              [0, 1, 2].map((i) => R("circle", { key: "rr" + i, cx: 40, cy: -10, r: (26 + i * 44) * (0.5 + ph * 0.8), fill: "none", stroke: rgba(theme.accent, 0.5 * (1 - ph) * (1 - i * 0.28)), strokeWidth: 4 })),
              R("circle", { cx: 40, cy: -10, r: 11, fill: rgba(theme.accent, 0.9) }));
          })(),
          [0, 1, 2].map((i) => R("rect", { key: "st" + i, x: -140 + i * 96, y: 96, width: 14, height: 14, rx: 3, fill: rgba(theme.accent2, 0.75) }))),
        /* a chart roll on its spool, a filing tray and a mug */
        R("g", { transform: "translate(" + (W - 250) + "," + (H - 96) + ")" },
          R("circle", { r: 46, fill: rgba(theme.surface, inv ? 0.45 : 0.96), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("g", { transform: "rotate(" + ((t * 26) % 360).toFixed(1) + ")" },
            R("path", { d: "M -46 0 h 92 M 0 -46 v 92", stroke: rgba(theme.accent, 0.4), strokeWidth: 4 })),
          R("circle", { r: 13, fill: rgba(theme.accent2, 0.85) }),
          R("path", { d: "M -46 12 h -" + (70 + (Math.sin(t * 0.4) * 0.5 + 0.5) * 80).toFixed(0), stroke: rgba(theme.surface, inv ? 0.5 : 0.98), strokeWidth: 20, strokeLinecap: "round" }),
          R("path", { d: "M -56 12 h -" + (60 + (Math.sin(t * 0.4) * 0.5 + 0.5) * 70).toFixed(0), stroke: rgba(theme.accent, 0.5), strokeWidth: 3 })),
        R("g", { opacity: 0.8, transform: "translate(" + (W * 0.34) + "," + (H - 84) + ")" },
          [0, 1, 2].map((i) => R("g", { key: "tr" + i },
            R("rect", { x: -84, y: -i * 30, width: 168, height: 22, rx: 4, fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 4 }),
            R("rect", { x: -66, y: -i * 30 + 6, width: 90 - i * 18, height: 8, rx: 3, fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.6) }))),
          R("path", { d: "M 128 6 h 54 l -8 -46 h -38 z", fill: rgba(theme.surface, inv ? 0.5 : 0.94), stroke: rgba(tint, 0.45), strokeWidth: 3 }),
          R("path", { d: "M 182 -30 q 22 4 18 16 q -4 12 -20 10", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 4 })),
        R("g", { opacity: 0.7, transform: "translate(" + (W * 0.42) + "," + (floor + 96) + ")" },
          R("ellipse", { cx: 0, cy: -96, rx: 70, ry: 20, fill: rgba(theme.accent2, 0.4), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("path", { d: "M 0 -86 v 66 M -50 -20 h 100 M -46 -20 l -14 24 M 46 -20 l 14 24", stroke: rgba(tint, 0.55), strokeWidth: 8, strokeLinecap: "round" })),
        [0, 1, 2].map((i) => R("circle", { key: "cc" + i, cx: W * 0.78, cy: floor + 70, r: 30 + i * 18, fill: "none", stroke: rgba(theme.ink, 0.35), strokeWidth: 8 })),
        [0, 1, 2, 3, 4, 5].map((i) => {
          const ph = (t * (0.1 + i * 0.02) + i * 0.18) % 1;
          return R("circle", { key: "du" + i, cx: 180 + i * 160 + Math.sin(t * 0.6 + i) * 30, cy: floor - ph * 660, r: 3 + (i % 3) * 2, fill: rgba(tint, 0.26 * (1 - ph)) });
        }));
    },
  });

  /* ── 40 FIRST PRINCIPLE — a Newton's cradle handing momentum along ── */
  FilmKit.make({
    global: "FirstPrinciple", brand: "First Principle", desk: "#0e0f11", ambient: 1.5, chrome: false,
    FH: '"Big Shoulders Display", system-ui, sans-serif', FB: '"Assistant", system-ui, sans-serif', FM: '"Space Mono", monospace',
    titlePreset: "machete", itemPreset: "pop", titleLine: 0.94, titleSpace: "0.005em",
    /* ladder: bg .89 / surface .97 / rule .76 / inkMuted .45 / ink .06 / accent .42 / accent2 .5 */
    palette: (t) => ({ bg: t.bg || "#eff1f0", surface: "#fcfdfc", rule: "#cbd0ce", inkMuted: "#6c7371", ink: "#0f1211", accent: t.accent || "#3f5fd8", accent2: t.accent2 || "#d8a03f", accentInk: "#fcfdfc" }),
    tweaks: [{ k: "bg", label: "Ground", options: ["#eff1f0", "#f1f3f2", "#edf0ee"] }, { k: "accent", label: "Blue", options: ["#3f5fd8", "#3fd85f", "#d83f5f"] }, { k: "accent2", label: "Second", options: ["#d8a03f", "#a03fd8", "#3fa0d8"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(110% 56% at 50% 100%, " + rgba(theme.accent, 0.12) + " 0%, transparent 60%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round" }, R2("path", { d: "M4 4v4M12 4v4M20 4v4" }), R2("circle", { cx: 4, cy: 12, r: 3 }), R2("circle", { cx: 12, cy: 12, r: 3 }), R2("circle", { cx: 20, cy: 12, r: 3 })),
    cams: ["drop", "pushR", "hopU", "zoomIn", "pushL", "zoomOut"], camMul: 1, camOff: 5,
    mag: { rot: 0.5, driftX: 8, driftY: 8, driftZ: 0.04, slide: 0.26, inn: 0.18, zin: 0.34, zout: 0.3 },
    variants: { Scroll: "board", Typing: "caret", Ring: "ring" },
    look: LOOK({ h: 128, upper: true, kicker: { v: "square", bg: "accent", c: "accentInk" }, sBg: "accent", sFg: "accentInk", qlh: 1.02, swap: "body", card: "frame", chip: "square", r: 8, cBg: "ink", cFg: "surface", btn: "block", btnBg: "accent", btnC: "accentInk", logo: "rounded" }),
    /* WORLD — a demonstration bench. Overhead: a lecture board of force diagrams
       and a hanging rail. Margin: the cradle — five balls on a frame, the end ball
       lifting and returning on a 2.4s beat, the middle three dead still, a flash at
       contact. Floor: a ramp with a rolling ball, weights, a stopwatch. Near: grit. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, bench = H - 280;
      const beat = Math.sin((t / 2.4) * Math.PI * 2);
      const left = Math.max(0, -beat) * 34, right = Math.max(0, beat) * 34;
      const hit = Math.abs(beat) < 0.06 ? 1 : 0;
      const roll = (t % 5) / 5;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "fp-grid", width: 54, height: 54, patternUnits: "userSpaceOnUse" },
            R("path", { d: "M54 0H0v54", fill: "none", stroke: rgba(theme.rule, inv ? 0.2 : 0.62), strokeWidth: 2 }))),
        R("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#fp-grid)" }),
        /* overhead: a lecture board and a hanging rail */
        R("g", { opacity: 0.66 },
          R("rect", { x: 50, y: 30, width: W - 100, height: 210, rx: 8, fill: rgba(theme.accent, 0.08), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2].map((i) => {
            const fade = 0.4 + 0.5 * Math.abs(Math.sin(t * 0.3 + i * 1.3));
            return R("g", { key: "fd" + i, opacity: fade, transform: "translate(" + (170 + i * 320) + ",134)" },
              R("line", { x1: -70, y1: 0, x2: 70, y2: 0, stroke: rgba(theme.ink, 0.6), strokeWidth: 4 }),
              R("path", { d: "M -70 0 l 0 -50 M -70 -50 l 12 12 M -70 -50 l -12 12", stroke: rgba(theme.accent, 0.85), strokeWidth: 4 }),
              R("path", { d: "M 70 0 l 40 26 M 110 26 l -14 -6 M 110 26 l -4 -14", stroke: rgba(theme.accent2, 0.85), strokeWidth: 4 }),
              R("circle", { cx: 0, cy: 0, r: 12, fill: rgba(theme.ink, 0.5) }));
          }),
          R("rect", { x: 50, y: 246, width: W - 100, height: 14, rx: 4, fill: rgba(tint, 0.5) })),
        /* a pulley-and-mass rig hanging off the rail, the mass easing up and down */
        (function () {
          const lift = (Math.sin(t * 0.55) * 0.5 + 0.5);
          const drop = 210 - lift * 90;
          return R("g", { transform: "translate(" + (W - 190) + ",260)" },
            R("circle", { cx: 0, cy: 26, r: 26, fill: "none", stroke: rgba(theme.accent, 0.7), strokeWidth: 7 }),
            R("g", { transform: "rotate(" + ((lift * 260) % 360).toFixed(1) + " 0 26)" },
              R("path", { d: "M -26 26 h 52 M 0 0 v 52", stroke: rgba(theme.accent, 0.45), strokeWidth: 5 })),
            R("line", { x1: -26, y1: 26, x2: -26, y2: drop.toFixed(1), stroke: rgba(tint, 0.55), strokeWidth: 4 }),
            R("line", { x1: 26, y1: 26, x2: 26, y2: (drop - 60).toFixed(1), stroke: rgba(tint, 0.55), strokeWidth: 4 }),
            R("rect", { x: -50, y: drop, width: 48, height: 44, rx: 5, fill: rgba(theme.ink, 0.75) }),
            R("rect", { x: 6, y: drop - 60, width: 40, height: 34, rx: 5, fill: rgba(theme.accent2, 0.75) }));
        })(),
        /* a wall of apparatus in the margin, above the cradle */
        R("g", { opacity: 0.72, transform: "translate(" + (W - 165) + ",1530) scale(0.62)" },
          R("rect", { x: -150, y: -130, width: 300, height: 260, rx: 8, fill: rgba(theme.surface, inv ? 0.3 : 0.92), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
          R("line", { x1: -150, y1: -14, x2: 150, y2: -14, stroke: rgba(tint, 0.35), strokeWidth: 4 }),
          [0, 1, 2].map((i) => R("g", { key: "ap" + i },
            R("circle", { cx: -90 + i * 90, cy: -70, r: 26, fill: "none", stroke: rgba(i === 1 ? theme.accent : theme.accent2, 0.7), strokeWidth: 6 }),
            R("line", { x1: -90 + i * 90, y1: -44, x2: -90 + i * 90, y2: -14, stroke: rgba(tint, 0.4), strokeWidth: 4 }))),
          [0, 1, 2, 3].map((i) => R("rect", { key: "bx" + i, x: -132 + i * 70, y: 20, width: 54, height: 90, rx: 5, fill: rgba(i % 2 ? theme.accent : theme.ink, 0.24), stroke: rgba(tint, 0.35), strokeWidth: 3 })),
          [0, 1, 2, 3].map((i) => R("circle", { key: "ld" + i, cx: -106 + i * 70, cy: 46, r: 6, fill: rgba(theme.accent, Math.sin(t * 1.4 + i * 1.2) > 0 ? 0.85 : 0.2) }))),
        /* margin: the cradle */
        R("g", { transform: "translate(" + (W - 230) + ",1130)" },
          R("rect", { x: -140, y: 210, width: 280, height: 24, rx: 6, fill: rgba(theme.rule, 0.85), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("path", { d: "M -120 210 v -200 h 240 v 200", fill: "none", stroke: rgba(tint, 0.6), strokeWidth: 9 }),
          R("line", { x1: -120, y1: 10, x2: 120, y2: 10, stroke: rgba(theme.accent2, 0.7), strokeWidth: 6 }),
          R("ellipse", { cx: 0, cy: 224, rx: 128, ry: 10, fill: rgba(theme.ink, 0.1) }),
          [-2, -1, 0, 1, 2].map((i) => {
            const ang = i === -2 ? -left : i === 2 ? right : 0;
            const rad = ang * Math.PI / 180;
            const cx = i * 46 + Math.sin(rad) * 160, cy = 10 + Math.cos(rad) * 160;
            return R("g", { key: "bl" + i },
              R("line", { x1: i * 46 - 18, y1: 10, x2: cx, y2: cy, stroke: rgba(tint, 0.5), strokeWidth: 3 }),
              R("line", { x1: i * 46 + 18, y1: 10, x2: cx, y2: cy, stroke: rgba(tint, 0.5), strokeWidth: 3 }),
              R("circle", { cx: cx, cy: cy, r: 23, fill: rgba(Math.abs(i) === 2 ? theme.accent : theme.ink, 0.85) }),
              R("circle", { cx: cx - 7, cy: cy - 8, r: 7, fill: rgba(theme.surface, 0.5) }));
          }),
          hit ? R("circle", { cx: 0, cy: 190, r: 44, fill: "none", stroke: rgba(theme.accent2, 0.7), strokeWidth: 6 }) : null),
        /* floor: a ramp with a rolling ball, weights, a stopwatch */
        R("line", { x1: 0, y1: bench, x2: W, y2: bench, stroke: rgba(tint, 0.55), strokeWidth: 8 }),
        R("rect", { x: 0, y: bench, width: W, height: H - bench, fill: rgba(theme.rule, 0.3) }),
        R("g", { transform: "translate(180," + (bench + 10) + ")" },
          R("path", { d: "M -120 60 L 200 -140", stroke: rgba(tint, 0.6), strokeWidth: 12, strokeLinecap: "round" }),
          R("path", { d: "M 200 -140 v 40 M -120 60 v -30", stroke: rgba(tint, 0.4), strokeWidth: 8 }),
          R("circle", { cx: 200 - roll * 320, cy: -140 + roll * 200 - 20, r: 22, fill: rgba(theme.accent, 0.85) }),
          R("circle", { cx: 200 - roll * 320 - 6, cy: -140 + roll * 200 - 28, r: 7, fill: rgba(theme.surface, 0.5) })),
        [0, 1, 2].map((i) => R("g", { key: "wt" + i, transform: "translate(" + (620 + i * 90) + "," + (bench + 46) + ")" },
          R("path", { d: "M -32 0 h 64 l -8 -" + (40 + i * 16) + " h -48 z", fill: rgba(theme.accent2, 0.55), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("path", { d: "M -14 -" + (40 + i * 16) + " q 14 -16 28 0", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 5 }))),
        /* a spring scale bobbing, and a tape measure part-unrolled */
        R("g", { transform: "translate(" + (W * 0.34) + "," + (bench + 34) + ")" },
          R("line", { x1: 0, y1: -190, x2: 0, y2: -110, stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("path", { d: "M -18 -110 " + Array.from({ length: 7 }).map((_, i) => "q 18 " + (7 + Math.sin(t * 1.4) * 2).toFixed(1) + " 36 0 q -18 " + (7 + Math.sin(t * 1.4) * 2).toFixed(1) + " -36 0").join(" "), fill: "none", stroke: rgba(theme.accent, 0.7), strokeWidth: 5 }),
          R("rect", { x: -26, y: (-10 + Math.sin(t * 1.4) * 8).toFixed(1), width: 52, height: 46, rx: 5, fill: rgba(theme.accent2, 0.7), stroke: rgba(tint, 0.4), strokeWidth: 3 })),
        R("g", { opacity: 0.8, transform: "translate(" + (W * 0.86) + "," + (bench + 78) + ")" },
          R("circle", { r: 34, fill: rgba(theme.accent, 0.4), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("circle", { r: 12, fill: rgba(theme.surface, 0.9) }),
          R("path", { d: "M -34 10 h -" + (60 + (Math.sin(t * 0.5) * 0.5 + 0.5) * 90).toFixed(0) + "", stroke: rgba(theme.accent2, 0.8), strokeWidth: 10, strokeLinecap: "round" }),
          Array.from({ length: 6 }).map((_, i) => R("line", { key: "tm" + i, x1: -44 - i * 22, y1: 4, x2: -44 - i * 22, y2: 16, stroke: rgba(theme.ink, 0.35), strokeWidth: 3 }))),
        R("g", { transform: "translate(" + (W - 420) + "," + (bench + 70) + ")" },
          R("circle", { r: 44, fill: rgba(theme.surface, 0.95), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("line", { x1: 0, y1: 0, x2: Math.cos((t % 60) / 60 * 6.28 - 1.57) * 32, y2: Math.sin((t % 60) / 60 * 6.28 - 1.57) * 32, stroke: rgba(theme.accent, 0.9), strokeWidth: 4, strokeLinecap: "round" }),
          R("rect", { x: -10, y: -58, width: 20, height: 16, rx: 4, fill: rgba(tint, 0.6) })),
        [0, 1, 2, 3, 4].map((i) => {
          const ph = (t * (0.3 + i * 0.06) + i * 0.2) % 1;
          return R("circle", { key: "gr" + i, cx: 240 + i * 180 + Math.sin(t * 1.6 + i) * 34, cy: bench - ph * 420, r: 3 + (i % 2) * 2, fill: rgba(tint, 0.26 * (1 - ph)) });
        }));
    },
  });
})();
