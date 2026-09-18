/* article-pack-09.js — cohort 09, lifestyle / culture: packs 41-45.
   Table Six · City Guide · Slow Room · Second Season · Long Table
   Contract per HANDOFF.md: hexes only in palette(), look and World name slots,
   chrome:false, three depth planes, an object on a route with secondary motion,
   nothing between y=290 and y=1330 except margin clusters (x>820), tone-aware
   tints, comparison tiles on tile.bg "rule". Built at full density: an overhead
   element, a mid-band margin cluster and a populated floor in every world. */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  const LOOK = (o) => ({
    hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: o.h, upper: o.upper, kicker: o.kicker },
    statement: { bg: o.sBg, fg: o.sFg, hi: "accent2", world: true, top: 610, size: o.h + 12, upper: o.upper },
    body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: o.h - 26, bodySize: 38, ch: 54, lh: 1.54, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent" } },
    quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: o.h - 16, ch: 25, lh: o.qlh, markSize: 220 },
    feature: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 255, size: o.h - 16, upper: o.upper, swap: o.swap, card: { v: o.card, bg: "surface", glow: "accent", r: o.r, line: "inkMuted" }, chips: { v: o.chip, colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
    montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: o.h - 22, upper: o.upper, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: o.r, h: 640, labelSize: 42 }, tilts: o.tilts || [0, 0, 0, 0] },
    stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: o.h - 20, upper: o.upper, cols: ["accent", "accent2", "ink"], num: 148, rule: !o.glow, glowNums: o.glow },
    cta: { bg: o.cBg, fg: o.cFg, hi: "accent2", world: true, top: 470, size: o.h - 6, upper: o.upper, align: "left", btn: { v: o.btn, bg: o.btnBg, c: o.btnC }, logoShape: o.logo },
    app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
  });

  /* ── 41 TABLE SIX — a dumbwaiter running between kitchen and floor ── */
  FilmKit.make({
    global: "TableSix", brand: "Table Six", desk: "#171310", ambient: 1.45, chrome: false,
    FH: '"DM Serif Display", Georgia, serif', FB: '"DM Sans", system-ui, sans-serif', FM: '"IBM Plex Mono", monospace',
    titlePreset: "drowse", itemPreset: "rise", titleLine: 1.06, titleSpace: "-0.01em",
    /* ladder: bg .87 / surface .96 / rule .74 / inkMuted .44 / ink .07 / accent .36 / accent2 .48 */
    palette: (t) => ({ bg: t.bg || "#efe9e2", surface: "#fbf8f4", rule: "#cbc0b3", inkMuted: "#6e665c", ink: "#16130f", accent: t.accent || "#8c3a2f", accent2: t.accent2 || "#5f7a4a", accentInk: "#fbf8f4" }),
    tweaks: [{ k: "bg", label: "Linen", options: ["#efe9e2", "#f1ebe4", "#ece6df"] }, { k: "accent", label: "Wine", options: ["#8c3a2f", "#2f5f8c", "#5f2f8c"] }, { k: "accent2", label: "Herb", options: ["#5f7a4a", "#7a5f4a", "#4a5f7a"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(94% 52% at 26% 6%, " + rgba(theme.surface, 0.95) + " 0%, transparent 60%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.3, strokeLinecap: "round" }, R2("path", { d: "M7 3v8a2 2 0 004 0V3M9 11v10M17 3c-2 3-2 6 0 8v10" })),
    cams: ["pushU", "zoomIn", "pushL", "drop", "zoomOut", "pushR"], camMul: 5, camOff: 2,
    mag: { rot: 0.2, driftX: 5, driftY: 6, driftZ: 0.04, slide: 0.2, inn: 0.24, zin: 0.3, zout: 0.26 },
    variants: { Scroll: "board", Typing: "hand", Ring: "ring" },
    look: LOOK({ h: 110, kicker: { v: "bare", c: "accent" }, sBg: "accent", sFg: "accentInk", qlh: 1.14, swap: "body", card: "paper", chip: "outline", r: 8, cBg: "ink", cFg: "surface", btn: "pill", btnBg: "accent2", btnC: "ink", logo: "circle" }),
    /* WORLD — a restaurant, service on. Overhead: a rail of copper pans and a
       ticket line with orders clipped along it. Margin: the dumbwaiter running a
       10s cycle in its shaft, doors easing, plates loaded and gone. Floor: a pass
       with plated dishes under lamps, a bin of linen, a wine rack. Near: steam. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, pass = H - 290;
      const cyc = (t % 10) / 10, tri = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;
      const car = 1420 - E.inOut(tri) * 300;
      const open = tri > 0.94 || tri < 0.06 ? 1 : 0;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "ts-tile", width: 74, height: 74, patternUnits: "userSpaceOnUse" },
            R("rect", { x: 4, y: 4, width: 66, height: 66, rx: 4, fill: "none", stroke: rgba(theme.rule, inv ? 0.25 : 0.7), strokeWidth: 2 }))),
        R("rect", { x: 0, y: 0, width: W, height: pass, fill: "url(#ts-tile)", opacity: 0.6 }),
        /* overhead: a rail of pans, and a ticket line */
        R("g", { opacity: 0.8 },
          R("rect", { x: -20, y: 44, width: W + 40, height: 14, rx: 5, fill: rgba(tint, 0.55) }),
          [0, 1, 2, 3, 4].map((i) => R("g", { key: "pn" + i, transform: "translate(" + (150 + i * 190) + ",58) rotate(" + (Math.sin(t * 0.7 + i) * 1.6).toFixed(2) + ")" },
            R("path", { d: "M 0 0 v 26", stroke: rgba(tint, 0.5), strokeWidth: 4 }),
            R("path", { d: "M " + (-44 + (i % 2) * 8) + " 26 h " + (88 - (i % 2) * 16) + " l -12 " + (54 + (i % 3) * 12) + " h -" + (64 - (i % 2) * 16) + " z", fill: rgba(theme.accent2, 0.45), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
            R("path", { d: "M " + (44 - (i % 2) * 8) + " 34 h 40", stroke: rgba(tint, 0.5), strokeWidth: 6, strokeLinecap: "round" }))),
          R("path", { d: "M 40 236 q " + (W / 2 - 40) + " " + (30 + Math.sin(t * 0.6) * 5).toFixed(1) + " " + (W - 80) + " 0", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 3 }),
          [0, 1, 2, 3, 4, 5].map((i) => {
            const tx = 90 + i * 180, ty = 240 + Math.sin((i / 5) * Math.PI) * (24 + Math.sin(t * 0.6) * 4);
            return R("g", { key: "tk" + i, transform: "translate(" + tx + "," + ty.toFixed(1) + ") rotate(" + (Math.sin(t * 1.3 + i * 0.7) * 3).toFixed(2) + ")" },
              R("rect", { x: -34, y: 0, width: 68, height: 46, rx: 2, fill: rgba(theme.surface, inv ? 0.4 : 0.97), stroke: rgba(tint, 0.3), strokeWidth: 2 }),
              R("rect", { x: -24, y: 10, width: 48, height: 6, rx: 3, fill: rgba(theme.accent, 0.65) }),
              R("rect", { x: -24, y: 24, width: 30, height: 5, rx: 3, fill: rgba(tint, 0.35) }));
          })),
        /* margin: the dumbwaiter */
        R("g", { transform: "translate(" + (W - 130) + ",0)" },
          R("rect", { x: -104, y: 1040, width: 208, height: 470, rx: 8, fill: rgba(theme.accent, 0.07), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
          R("line", { x1: 0, y1: 1040, x2: 0, y2: car - 66, stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          R("g", { transform: "translate(0," + car.toFixed(1) + ")" },
            R("rect", { x: -86, y: -66, width: 172, height: 132, rx: 6, fill: rgba(theme.surface, inv ? 0.4 : 0.96), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
            R("rect", { x: -70 + open * 26, y: -50, width: 62 - open * 24, height: 100, rx: 3, fill: rgba(theme.accent, 0.26) }),
            R("rect", { x: 8 - open * 2, y: -50, width: 62 - open * 24, height: 100, rx: 3, fill: rgba(theme.accent, 0.26) }),
            open ? R("g", null,
              R("ellipse", { cx: 0, cy: 18, rx: 46, ry: 14, fill: rgba(theme.surface, 0.95), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
              R("ellipse", { cx: 0, cy: 14, rx: 24, ry: 8, fill: rgba(theme.accent2, 0.6) })) : null),
          R("rect", { x: -60, y: 1494, width: 120, height: 32, rx: 6, fill: rgba(theme.ink, 0.8) }),
          R("text", { x: 0, y: 1518, textAnchor: "middle", fontFamily: '"IBM Plex Mono", monospace', fontSize: 19, fill: rgba(theme.accent2, 0.95) }, open ? "OPEN" : "T-06")),
        /* a swing door beating open and shut on service */
        (function () {
          const k = Math.abs(Math.cos(t * 1.15));
          return R("g", { key: "door", opacity: 0.6, transform: "translate(" + (W * 0.16) + "," + (H - 60) + ")" },
            R("rect", { x: -116, y: -300, width: 232, height: 300, rx: 5, fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 6 }),
            R("g", { transform: "translate(-112,0) scale(" + (0.28 + 0.72 * k).toFixed(3) + ",1)" },
              R("rect", { x: 0, y: -292, width: 106, height: 288, rx: 4, fill: rgba(theme.surface, 0.6), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
              R("rect", { x: 18, y: -250, width: 70, height: 84, rx: 4, fill: rgba(theme.accent, 0.2) }),
              R("circle", { cx: 88, cy: -140, r: 8, fill: rgba(theme.accent, 0.7) })),
            R("g", { transform: "translate(112,0) scale(" + (-0.28 - 0.72 * k).toFixed(3) + ",1)" },
              R("rect", { x: 0, y: -292, width: 106, height: 288, rx: 4, fill: rgba(theme.surface, 0.6), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
              R("rect", { x: 18, y: -250, width: 70, height: 84, rx: 4, fill: rgba(theme.accent, 0.2) }),
              R("circle", { cx: 88, cy: -140, r: 8, fill: rgba(theme.accent, 0.7) })));
        })(),
        /* a window onto the dining room, candles guttering behind it */
        (function () {
          const candles = [0, 1, 2].map((i) => R("g", { key: "cd" + i, transform: "translate(" + (-60 + i * 60) + ",0)" },
            R("rect", { x: -6, y: -30, width: 12, height: 30, rx: 3, fill: rgba(theme.surface, 0.85) }),
            R("ellipse", { cx: 0, cy: -40, rx: 6, ry: 12 + Math.sin(t * 3 + i * 2) * 3, fill: rgba(theme.accent, 0.85) })));
          return R("g", { key: "dining", opacity: 0.7, transform: "translate(" + (W - 150) + ",1560)" },
            R("rect", { x: -122, y: -150, width: 244, height: 200, rx: 6, fill: rgba(theme.accent, 0.09), stroke: rgba(tint, 0.5), strokeWidth: 6 }),
            R("line", { x1: 0, y1: -150, x2: 0, y2: 50, stroke: rgba(tint, 0.3), strokeWidth: 4 }),
            R("g", { transform: "translate(0,-20)" }, candles));
        })(),
        /* a mise-en-place tray, a stack of pans and a mop bucket */
        (function () {
          const pots = [0, 1, 2, 3, 4, 5].map((i) => R("circle", { key: "mp" + i, cx: -70 + (i % 3) * 70, cy: -18 - Math.floor(i / 3) * 8, r: 26, fill: rgba(i % 2 ? theme.accent2 : theme.accent, 0.4), stroke: rgba(tint, 0.35), strokeWidth: 3 }));
          return R("g", { key: "mise", transform: "translate(" + (W * 0.3) + "," + (H - 96) + ")" },
            R("rect", { x: -120, y: 0, width: 240, height: 20, rx: 5, fill: rgba(tint, 0.55) }),
            pots);
        })(),
        (function () {
          const pans = [0, 1, 2, 3].map((i) => R("ellipse", { key: "pn" + i, cx: 0, cy: -i * 17, rx: 52 - i * 4, ry: 15, fill: rgba(theme.rule, 0.85), stroke: rgba(tint, 0.4), strokeWidth: 3 }));
          return R("g", { key: "pans", opacity: 0.85, transform: "translate(" + (W * 0.62) + "," + (H - 66) + ")" }, pans);
        })(),
        R("g", { key: "bucket", opacity: 0.7, transform: "translate(" + (W * 0.86) + "," + (H - 62) + ")" },
          R("path", { d: "M -40 0 h 80 l -10 -74 h -60 z", fill: rgba(theme.accent2, 0.35), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("path", { d: "M -30 -74 q 30 -22 60 0", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("line", { x1: 14, y1: -74, x2: 44, y2: -240, stroke: rgba(tint, 0.5), strokeWidth: 7, strokeLinecap: "round" })),
        /* floor: the pass with plated dishes, linen bin, wine rack */
        R("line", { x1: 0, y1: pass, x2: W, y2: pass, stroke: rgba(tint, 0.55), strokeWidth: 8 }),
        R("rect", { x: 0, y: pass, width: W, height: H - pass, fill: rgba(theme.rule, 0.32) }),
        [0, 1, 2].map((i) => R("g", { key: "dh" + i, transform: "translate(" + (170 + i * 180) + "," + (pass + 40) + ")" },
          R("line", { x1: 0, y1: -160, x2: 0, y2: -96, stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("path", { d: "M -34 -96 h 68 l -14 34 h -40 z", fill: rgba(theme.accent, 0.5) }),
          R("ellipse", { cx: 0, cy: 0, rx: 58, ry: 18, fill: rgba(theme.surface, 0.95), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("ellipse", { cx: 0, cy: -4, rx: 30, ry: 10, fill: rgba(i === 1 ? theme.accent2 : theme.accent, 0.55) }))),
        R("g", { opacity: 0.8, transform: "translate(" + (W * 0.5) + "," + (H - 80) + ")" },
          R("path", { d: "M -70 0 h 140 l -14 -96 h -112 z", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          [0, 1, 2].map((i) => R("path", { key: "ln" + i, d: "M " + (-46 + i * 32) + " -60 q 22 -22 44 0", fill: "none", stroke: rgba(theme.surface, inv ? 0.5 : 0.9), strokeWidth: 12, strokeLinecap: "round" }))),
        R("g", { opacity: 0.7, transform: "translate(" + (W - 250) + "," + (H - 70) + ")" },
          [0, 1].map((r) => [0, 1, 2].map((cIdx) => R("g", { key: "wr" + r + cIdx, transform: "translate(" + (cIdx * 46) + "," + (-r * 50) + ")" },
            R("circle", { r: 20, fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 4 }),
            R("circle", { r: 10, fill: rgba((r + cIdx) % 2 ? theme.accent : theme.accent2, 0.6) }))))),
        [0, 1, 2, 3, 4].map((i) => {
          const ph = (t * (0.18 + i * 0.03) + i * 0.2) % 1;
          return R("circle", { key: "sm" + i, cx: 180 + i * 180 + Math.sin(t * 0.9 + i) * 30, cy: pass - ph * 620, r: 12 + ph * 34, fill: rgba(theme.surface, 0.16 * (1 - ph)) });
        }));
    },
  });

  /* ── 42 CITY GUIDE — a tram working its way along the street ── */
  FilmKit.make({
    global: "CityGuide", brand: "City Guide", desk: "#0f1216", ambient: 1.6, chrome: false,
    FH: '"Playfair Display", Georgia, serif', FB: '"Poppins", system-ui, sans-serif', FM: '"IBM Plex Mono", monospace',
    titlePreset: "rise", itemPreset: "pop", titleLine: 1.04, titleSpace: "-0.015em",
    /* ladder: bg .88 / surface .97 / rule .75 / inkMuted .44 / ink .07 / accent .34 / accent2 .5 */
    palette: (t) => ({ bg: t.bg || "#eef0f2", surface: "#fbfcfd", rule: "#c8cdd2", inkMuted: "#6a7075", ink: "#111417", accent: t.accent || "#2f4f8c", accent2: t.accent2 || "#c9803a", accentInk: "#fbfcfd" }),
    tweaks: [{ k: "bg", label: "Stone", options: ["#eef0f2", "#f0f2f4", "#ecEEf0"] }, { k: "accent", label: "Blue", options: ["#2f4f8c", "#2f8c6f", "#6f2f8c"] }, { k: "accent2", label: "Awning", options: ["#c9803a", "#c93a5f", "#3ac980"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(178deg, " + rgba(theme.surface, 0.96) + " 0%, " + bg + " 48%, " + rgba(theme.rule, 0.44) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.3, strokeLinecap: "round", strokeLinejoin: "round" }, R2("rect", { x: 5, y: 4, width: 14, height: 14, rx: 3 }), R2("path", { d: "M5 10h14M8 18v3M16 18v3" })),
    cams: ["pushR", "zoomIn", "pushL", "hopU", "zoomOut", "drop"], camMul: 3, camOff: 4,
    mag: { rot: 0.4, driftX: 9, driftY: 6, driftZ: 0.04, slide: 0.26, inn: 0.2, zin: 0.32, zout: 0.3 },
    variants: { Scroll: "feed", Typing: "caret", Ring: "bar" },
    look: LOOK({ h: 106, kicker: { v: "tag", bg: "accent", c: "accentInk" }, sBg: "ink", sFg: "surface", qlh: 1.12, swap: "quote", card: "frame", chip: "pill", r: 12, cBg: "accent", cFg: "accentInk", btn: "pill", btnBg: "accentInk", btnC: "surface", logo: "circle", tilts: [-1, 1, 0, 0] }),
    /* WORLD — a street at the end of the day. Overhead: a catenary wire with
       hanging lamps and a strip of shopfront signs. Mid: a tram running a 16s
       traverse, pantograph sparking on joints, wheels at travel speed, and a
       stop with a shelter. Floor: kerb, planters, cobbles, a cyclist passing. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, kerb = H - 280;
      const cyc = (t % 16) / 16, tx = -420 + cyc * (W + 840);
      const wheel = (tx / 34) * 57.3;
      const spark = (Math.floor(tx / 220) % 2 === 0 && Math.abs(tx % 220) < 26) ? 1 : 0;
      const facade = (t * 7) % 300;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "cg-cobble", width: 56, height: 30, patternUnits: "userSpaceOnUse" },
            R("path", { d: "M0 15h56M28 0v30", stroke: rgba(theme.rule, inv ? 0.24 : 0.66), strokeWidth: 2 }))),
        /* overhead: facades, signs, the catenary and its lamps */
        R("g", { opacity: 0.55, transform: "translate(" + (-facade).toFixed(1) + ",0)" },
          [0, 1, 2, 3, 4].map((i) => R("g", { key: "fc" + i },
            R("rect", { x: 20 + i * 300, y: -20, width: 240, height: 250, rx: 5, fill: rgba(theme.accent, 0.1), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
            [0, 1, 2].map((j) => R("rect", { key: "wn" + j, x: 44 + i * 300 + j * 74, y: 40, width: 50, height: 74, rx: 4, fill: rgba(theme.accent2, 0.2 + (j % 2) * 0.12) })),
            R("rect", { x: 44 + i * 300, y: 156, width: 190, height: 34, rx: 5, fill: rgba(i % 2 ? theme.accent2 : theme.accent, 0.5) })))),
        R("path", { d: "M -20 224 q " + (W / 2) + " " + (26 + Math.sin(t * 0.5) * 4).toFixed(1) + " " + (W + 40) + " 0", fill: "none", stroke: rgba(tint, 0.55), strokeWidth: 4 }),
        [0, 1, 2, 3].map((i) => {
          const lxp = 130 + i * 270;
          const lyp = 226 + Math.sin(((lxp + 20) / (W + 40)) * Math.PI) * (22 + Math.sin(t * 0.5) * 4);
          return R("g", { key: "lp" + i, transform: "translate(" + lxp + "," + lyp.toFixed(1) + ") rotate(" + (Math.sin(t * 0.9 + i) * 2.2).toFixed(2) + ")" },
            R("line", { x1: 0, y1: 0, x2: 0, y2: 40, stroke: rgba(tint, 0.5), strokeWidth: 3 }),
            R("path", { d: "M -30 40 h 60 l -14 40 h -32 z", fill: rgba(theme.accent2, 0.65) }),
            R("circle", { cx: 0, cy: 88, r: 11, fill: rgba(theme.accent2, 0.85) }));
        }),
        /* mid: the tram stop with its shelter, in the margin band */
        R("g", { transform: "translate(" + (W - 150) + "," + (kerb - 30) + ")" },
          R("rect", { x: -130, y: -300, width: 260, height: 22, rx: 6, fill: rgba(theme.accent, 0.6) }),
          R("path", { d: "M -114 -278 v 278 M 114 -278 v 278", stroke: rgba(tint, 0.55), strokeWidth: 9 }),
          R("rect", { x: -114, y: -246, width: 228, height: 130, rx: 6, fill: rgba(theme.surface, inv ? 0.3 : 0.9), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          [0, 1, 2, 3].map((i) => R("rect", { key: "tt" + i, x: -92, y: -224 + i * 30, width: 130 - (i % 2) * 40, height: 9, rx: 4, fill: rgba(tint, 0.4) })),
          R("circle", { cx: 66, cy: -196, r: 16, fill: rgba(theme.accent2, Math.sin(t * 1.6) > 0 ? 0.85 : 0.3) }),
          R("rect", { x: -100, y: -70, width: 200, height: 18, rx: 6, fill: rgba(tint, 0.5) })),
        /* mid: rails and the tram */
        R("rect", { x: 0, y: kerb, width: W, height: H - kerb, fill: "url(#cg-cobble)" }),
        R("line", { x1: 0, y1: kerb, x2: W, y2: kerb, stroke: rgba(tint, 0.5), strokeWidth: 6 }),
        R("line", { x1: 0, y1: kerb + 34, x2: W, y2: kerb + 34, stroke: rgba(tint, 0.3), strokeWidth: 4 }),
        R("g", { transform: "translate(" + tx.toFixed(1) + "," + kerb + ")" },
          R("path", { d: "M -20 -232 L -6 -286 M 20 -232 L -6 -286", stroke: rgba(theme.ink, 0.6), strokeWidth: 5 }),
          spark ? R("circle", { cx: -6, cy: -288, r: 12, fill: rgba(theme.accent2, 0.9) }) : null,
          R("rect", { x: -220, y: -232, width: 440, height: 190, rx: 16, fill: rgba(theme.accent, 0.8), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("rect", { x: -220, y: -232, width: 440, height: 44, rx: 14, fill: rgba(theme.surface, 0.2) }),
          [0, 1, 2, 3].map((i) => R("rect", { key: "tw" + i, x: -196 + i * 104, y: -180, width: 78, height: 74, rx: 6, fill: rgba(theme.surface, 0.75) })),
          R("rect", { x: -240, y: -46, width: 480, height: 22, rx: 6, fill: rgba(theme.accent2, 0.85) }),
          [-140, -40, 120].map((wx, i) => R("g", { key: "wl" + i, transform: "translate(" + wx + ",-8) rotate(" + wheel.toFixed(1) + ")" },
            R("circle", { r: 26, fill: "none", stroke: rgba(theme.ink, 0.8), strokeWidth: 8 }),
            R("path", { d: "M -26 0 h 52", stroke: rgba(theme.ink, 0.6), strokeWidth: 6 })))),
        /* a flock crossing above the facades */
        (function () {
          const fc = (t % 21) / 21;
          const birds = [0, 1, 2, 3, 4].map((i) => {
            const bx = W + 80 - fc * (W + 260) - i * 46;
            const by = 120 + Math.sin(fc * Math.PI * 3 + i * 0.5) * 44 + i * 12;
            const flap = Math.sin(t * 7 + i * 1.6) * 0.8;
            return R("path", { key: "bd" + i, d: "M -22 0 q 11 " + (-15 - flap * 13).toFixed(1) + " 22 0 q 11 " + (-15 + flap * 13).toFixed(1) + " 22 0", fill: "none", stroke: rgba(tint, 0.42), strokeWidth: 3.5, strokeLinecap: "round", transform: "translate(" + bx.toFixed(1) + "," + by.toFixed(1) + ")" });
          });
          return R("g", { key: "flock" }, birds);
        })(),
        /* a cafe terrace with parasols, in the margin band */
        (function () {
          const sets = [0, 1].map((i) => R("g", { key: "ct" + i, transform: "translate(" + (i * 172) + ",0)" },
            R("path", { d: "M -82 -150 h 164 l -82 -54 z", fill: rgba(theme.accent2, 0.6), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
            R("path", { d: "M -82 -150 q 41 22 82 0 q 41 22 82 0", fill: "none", stroke: rgba(tint, 0.4), strokeWidth: 4 }),
            R("line", { x1: 0, y1: -150, x2: 0, y2: 20, stroke: rgba(tint, 0.55), strokeWidth: 7 }),
            R("ellipse", { cx: 0, cy: 20, rx: 62, ry: 17, fill: rgba(theme.surface, 0.9), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
            R("path", { d: "M -36 24 v 46 M 36 24 v 46", stroke: rgba(tint, 0.45), strokeWidth: 6 }),
            R("circle", { cx: 24, cy: 12, r: 9, fill: rgba(theme.accent, 0.6) })));
          return R("g", { key: "terrace", opacity: 0.68, transform: "translate(" + (W - 430) + ",1290)" }, sets);
        })(),
        /* a newspaper kiosk and a scooter at the kerb */
        R("g", { key: "kiosk", transform: "translate(" + (W * 0.2) + "," + (H - 60) + ")" },
          R("rect", { x: -96, y: -210, width: 192, height: 210, rx: 6, fill: rgba(theme.surface, inv ? 0.35 : 0.92), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
          R("rect", { x: -110, y: -232, width: 220, height: 26, rx: 6, fill: rgba(theme.accent, 0.6) }),
          R("rect", { x: -74, y: -180, width: 148, height: 84, rx: 4, fill: rgba(theme.accent2, 0.24) }),
          R("path", { d: "M -74 -80 h 148 M -74 -50 h 100", stroke: rgba(tint, 0.4), strokeWidth: 6 })),
        R("g", { key: "scooter", opacity: 0.7, transform: "translate(" + (W * 0.42) + "," + (H - 66) + ")" },
          R("circle", { cx: -56, cy: 0, r: 26, fill: "none", stroke: rgba(tint, 0.6), strokeWidth: 7 }),
          R("circle", { cx: 62, cy: 0, r: 26, fill: "none", stroke: rgba(tint, 0.6), strokeWidth: 7 }),
          R("path", { d: "M -56 0 q 20 -40 66 -34 h 40", fill: "none", stroke: rgba(theme.accent, 0.7), strokeWidth: 10, strokeLinecap: "round" }),
          R("path", { d: "M 24 -34 v -46 h 34", fill: "none", stroke: rgba(tint, 0.55), strokeWidth: 7, strokeLinecap: "round" })),
        /* a zebra crossing painted across the cobbles */
        (function () {
          const bars = [0, 1, 2, 3, 4, 5].map((i) => R("rect", { key: "zb" + i, x: 44 + i * 62, y: 0, width: 34, height: 90, rx: 3, fill: rgba(theme.surface, 0.62) }));
          return R("g", { key: "zebra", opacity: 0.7, transform: "translate(" + (W * 0.56) + "," + (H - 130) + ")" }, bars);
        })(),
        /* floor: planters and a cyclist passing */
        [0, 1, 2].map((i) => R("g", { key: "pl" + i, transform: "translate(" + (150 + i * 230) + "," + (H - 60) + ")" },
          R("path", { d: "M -40 0 h 80 l -10 -56 h -60 z", fill: rgba(theme.accent2, 0.4), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          [0, 1, 2].map((j) => R("path", { key: "lf" + j, d: "M 0 -56 q " + (-38 + j * 38 + Math.sin(t * 0.7 + i + j) * 7).toFixed(1) + " -40 " + (-18 + j * 18).toFixed(1) + " -86", fill: "none", stroke: rgba(theme.accent2, 0.7), strokeWidth: 7, strokeLinecap: "round" })))),
        (function () {
          const bc = ((t * 1.6) % (W + 300)) - 150;
          const wl = (bc / 20) * 57.3;
          return R("g", { opacity: 0.55, transform: "translate(" + bc.toFixed(1) + "," + (H - 74) + ")" },
            [-40, 40].map((wx, i) => R("g", { key: "bw" + i, transform: "translate(" + wx + ",0) rotate(" + wl.toFixed(1) + ")" },
              R("circle", { r: 30, fill: "none", stroke: rgba(tint, 0.6), strokeWidth: 5 }))),
            R("path", { d: "M -40 0 L -4 0 L 18 -48 L 40 0 M -4 0 L 18 -48 M -4 0 L 4 -46 L 18 -48", fill: "none", stroke: rgba(theme.accent, 0.6), strokeWidth: 6, strokeLinejoin: "round" }),
            R("circle", { cx: 12, cy: -78, r: 14, fill: rgba(tint, 0.6) }));
        })());
    },
  });

  /* ── 43 SLOW ROOM — a ceiling fan turning over a veranda ── */
  FilmKit.make({
    global: "SlowRoom", brand: "Slow Room", desk: "#1a140f", ambient: 1.35, chrome: false,
    FH: '"Yeseva One", Georgia, serif', FB: '"Outfit", system-ui, sans-serif', FM: '"IBM Plex Mono", monospace',
    titlePreset: "drowse", itemPreset: "rise", titleLine: 1.08, titleSpace: "-0.005em",
    /* ladder: bg .86 / surface .96 / rule .73 / inkMuted .43 / ink .07 / accent .4 / accent2 .5 */
    palette: (t) => ({ bg: t.bg || "#efe6d9", surface: "#fbf6ee", rule: "#cec0ac", inkMuted: "#6f6558", ink: "#17130e", accent: t.accent || "#b0623a", accent2: t.accent2 || "#5f7f72", accentInk: "#fbf6ee" }),
    tweaks: [{ k: "bg", label: "Warm", options: ["#efe6d9", "#f1e9dd", "#ece3d5"] }, { k: "accent", label: "Terracotta", options: ["#b0623a", "#3a70b0", "#70b03a"] }, { k: "accent2", label: "Second", options: ["#5f7f72", "#7f5f72", "#727f5f"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(96% 54% at 74% 96%, " + rgba(theme.accent, 0.22) + " 0%, transparent 62%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.3, strokeLinecap: "round" }, R2("circle", { cx: 12, cy: 12, r: 2.5 }), R2("path", { d: "M12 9.5C12 5 15 3 18 5s1 6-6 4.5M12 14.5C12 19 9 21 6 19s-1-6 6-4.5" })),
    cams: ["zoomOut", "drop", "pushL", "zoomIn", "pushR", "pushU"], camMul: 7, camOff: 3,
    mag: { rot: 0.22, driftX: 5, driftY: 7, driftZ: 0.045, slide: 0.18, inn: 0.26, zin: 0.28, zout: 0.26 },
    variants: { Scroll: "board", Typing: "typewriter", Ring: "gauge" },
    look: LOOK({ h: 104, kicker: { v: "bare", c: "accent" }, sBg: "ink", sFg: "surface", qlh: 1.18, swap: "body", card: "tilt", chip: "outline", r: 16, cBg: "accent", cFg: "accentInk", btn: "pill", btnBg: "accentInk", btnC: "ink", logo: "circle" }),
    /* WORLD — a veranda in the late afternoon. Overhead: a beamed ceiling with a
       fan turning slowly and a hanging plant swaying. Margin: a shuttered window
       with light bars crossing it, and a wicker chair. Floor: floorboards, a low
       table with a glass and a book, a rug edge. Near: dust in the light. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, floor = H - 300;
      const fan = (t * 62) % 360;
      const sway = Math.sin(t * 0.7) * 2.4;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "sr-board", width: 200, height: 46, patternUnits: "userSpaceOnUse" },
            R("line", { x1: 0, y1: 45, x2: 200, y2: 45, stroke: rgba(theme.rule, inv ? 0.28 : 0.7), strokeWidth: 2.5 }),
            R("line", { x1: 160, y1: 0, x2: 160, y2: 46, stroke: rgba(theme.rule, inv ? 0.2 : 0.5), strokeWidth: 2 })),
          R("linearGradient", { id: "sr-shaft", x1: "0%", y1: "0%", x2: "40%", y2: "100%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent, 0.2) }), R("stop", { offset: "100%", stopColor: rgba(theme.accent, 0) }))),
        /* overhead: beams, the fan, a hanging plant */
        R("g", { opacity: 0.6 },
          [0, 1, 2].map((i) => R("rect", { key: "bm" + i, x: -20, y: 30 + i * 84, width: W + 40, height: 22, rx: 5, fill: rgba(tint, 0.45) }))),
        R("g", { transform: "translate(" + (W * 0.42) + ",120)" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: 76, stroke: rgba(tint, 0.55), strokeWidth: 7 }),
          R("g", { transform: "rotate(" + fan.toFixed(1) + ")" },
            [0, 1, 2, 3, 4].map((i) => R("ellipse", { key: "bl" + i, cx: Math.cos(i * 1.257) * 130, cy: 76 + Math.sin(i * 1.257) * 34, rx: 96, ry: 20, fill: rgba(theme.accent, 0.4), transform: "rotate(" + (i * 72) + " " + (Math.cos(i * 1.257) * 130).toFixed(1) + " " + (76 + Math.sin(i * 1.257) * 34).toFixed(1) + ")" }))),
          R("circle", { cx: 0, cy: 76, r: 26, fill: rgba(theme.accent2, 0.7), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("circle", { cx: 0, cy: 76, r: 10, fill: rgba(theme.accent, 0.85) })),
        R("g", { transform: "translate(" + (W - 190) + ",30) rotate(" + sway.toFixed(2) + ")" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: 130, stroke: rgba(tint, 0.45), strokeWidth: 3 }),
          R("path", { d: "M -54 130 h 108 l -14 60 h -80 z", fill: rgba(theme.accent, 0.45), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          [0, 1, 2, 3].map((i) => R("path", { key: "vn" + i, d: "M " + (-30 + i * 20) + " 190 q " + (-20 + i * 14).toFixed(1) + " 60 " + (-34 + i * 22).toFixed(1) + " 120", fill: "none", stroke: rgba(theme.accent2, 0.6), strokeWidth: 6, strokeLinecap: "round" }))),
        /* margin: a shuttered window with light bars, and a wicker chair */
        R("g", { opacity: 0.62, transform: "translate(" + (W - 150) + ",1210)" },
          R("rect", { x: -122, y: -200, width: 244, height: 400, rx: 6, fill: rgba(theme.accent, 0.07), stroke: rgba(tint, 0.4), strokeWidth: 5 }),
          Array.from({ length: 9 }).map((_, i) => R("rect", { key: "sl" + i, x: -104, y: -180 + i * 42, width: 208, height: 22, rx: 4, fill: rgba(tint, 0.32 + 0.14 * Math.abs(Math.sin(t * 0.4 + i * 0.5))) })),
          R("path", { d: "M -104 -180 L 260 200 L 60 200 L -104 20 Z", fill: "url(#sr-shaft)" })),
        R("g", { opacity: 0.72, transform: "translate(" + (W - 330) + "," + (floor + 20) + ")" },
          R("path", { d: "M -80 0 h 160 l -14 -110 h -132 z", fill: rgba(theme.accent2, 0.3), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          Array.from({ length: 5 }).map((_, i) => R("line", { key: "wk" + i, x1: -66 + i * 33, y1: -104, x2: -60 + i * 30, y2: -6, stroke: rgba(tint, 0.35), strokeWidth: 3 })),
          R("path", { d: "M -80 -110 v -90 q 0 -26 40 -26 h 80 q 40 0 40 26 v 90", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 8 })),
        /* wind bells on the beam, and a bird passing beyond the veranda */
        R("g", { transform: "translate(" + (W * 0.14) + ",52)" },
          [0, 1, 2].map((i) => R("g", { key: "wb" + i, transform: "translate(" + (i * 62) + ",0) rotate(" + (Math.sin(t * 1.1 + i * 0.9) * 5).toFixed(2) + ")" },
            R("line", { x1: 0, y1: 0, x2: 0, y2: 88 + i * 22, stroke: rgba(tint, 0.45), strokeWidth: 3 }),
            R("path", { d: "M -16 " + (88 + i * 22) + " h 32 l -6 34 h -20 z", fill: rgba(theme.accent2, 0.6) }),
            R("circle", { cx: 0, cy: 128 + i * 22, r: 6, fill: rgba(theme.accent, 0.8) })))),
        (function () {
          const bc = (t % 19) / 19;
          const bx = W + 60 - bc * (W + 200), by = 190 + Math.sin(bc * Math.PI * 3) * 70;
          const flap = Math.sin(t * 6.5) * 0.8;
          return R("path", { d: "M -30 0 q 15 " + (-20 - flap * 18).toFixed(1) + " 30 0 q 15 " + (-20 + flap * 18).toFixed(1) + " 30 0", fill: "none", stroke: rgba(tint, 0.4), strokeWidth: 4, strokeLinecap: "round", transform: "translate(" + bx.toFixed(1) + "," + by.toFixed(1) + ")" });
        })(),
        /* a standing plant and a floor lamp in the margin band */
        R("g", { transform: "translate(" + (W - 190) + "," + (floor + 40) + ")" },
          R("path", { d: "M -62 0 h 124 l -14 -96 h -96 z", fill: rgba(theme.accent, 0.4), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          [0, 1, 2, 3, 4].map((i) => R("path", { key: "fr" + i, d: "M 0 -96 q " + (-84 + i * 42 + Math.sin(t * 0.6 + i) * 9).toFixed(1) + " -78 " + (-46 + i * 23).toFixed(1) + " -176", fill: "none", stroke: rgba(theme.accent2, 0.6), strokeWidth: 9, strokeLinecap: "round" }))),
        R("g", { opacity: 0.75, transform: "translate(" + (W - 400) + "," + (floor + 60) + ")" },
          R("path", { d: "M -44 0 h 88 l -14 -26 h -60 z", fill: rgba(tint, 0.55) }),
          R("line", { x1: 0, y1: -26, x2: 0, y2: -290, stroke: rgba(tint, 0.5), strokeWidth: 7 }),
          R("path", { d: "M -74 -290 h 148 l -28 -104 h -92 z", fill: rgba(theme.accent, 0.38), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("circle", { cx: 0, cy: -272, r: 24 + Math.sin(t * 1.4) * 3, fill: rgba(theme.accent, 0.3) })),
        /* a sleeping dog on the rug, and a stack of magazines */
        R("g", { opacity: 0.7, transform: "translate(" + (W * 0.56) + "," + (H - 84) + ") scale(1," + (1 + Math.sin(t * 0.7) * 0.035).toFixed(3) + ")" },
          R("path", { d: "M -96 0 q -14 -54 34 -64 q 62 -14 96 22 q 24 26 -6 42 z", fill: rgba(tint, 0.55) }),
          R("path", { d: "M -96 0 q -40 -16 -50 4 q 22 10 50 -4 z", fill: rgba(tint, 0.45) }),
          R("path", { d: "M 38 -46 q 24 -20 34 4 q -20 20 -34 -4 z", fill: rgba(tint, 0.5) })),
        R("g", { transform: "translate(" + (W * 0.14) + "," + (H - 66) + ") rotate(-3)" },
          [0, 1, 2, 3].map((i) => R("rect", { key: "mg" + i, x: -70 + (i % 2) * 10, y: -i * 16, width: 140 - (i % 2) * 16, height: 13, rx: 2, fill: rgba(i % 2 ? theme.accent : theme.surface, 0.85), stroke: rgba(tint, 0.3), strokeWidth: 2 }))),
        /* floor: boards, low table with a glass and a book, rug edge */
        R("rect", { x: 0, y: floor, width: W, height: H - floor, fill: "url(#sr-board)" }),
        R("line", { x1: 0, y1: floor, x2: W, y2: floor, stroke: rgba(tint, 0.5), strokeWidth: 7 }),
        R("path", { d: "M 0 " + (H - 130) + " h " + (W * 0.6) + " l -40 130 h -" + (W * 0.6 - 40) + " z", fill: rgba(theme.accent, 0.14) }),
        R("g", { transform: "translate(" + (W * 0.3) + "," + (floor + 130) + ")" },
          R("rect", { x: -160, y: -18, width: 320, height: 20, rx: 6, fill: rgba(tint, 0.6) }),
          R("path", { d: "M -130 2 v 60 M 130 2 v 60", stroke: rgba(tint, 0.5), strokeWidth: 9 }),
          R("path", { d: "M -60 -18 h 44 l -6 -62 h -32 z", fill: rgba(theme.accent2, 0.28), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          R("ellipse", { cx: -38, cy: -46, rx: 16, ry: 5, fill: rgba(theme.accent, 0.5) }),
          R("g", { transform: "translate(70,-24) rotate(-6)" },
            R("rect", { x: -50, y: -12, width: 100, height: 14, rx: 3, fill: rgba(theme.surface, inv ? 0.5 : 0.96), stroke: rgba(tint, 0.35), strokeWidth: 2 }),
            R("rect", { x: -46, y: -24, width: 92, height: 12, rx: 3, fill: rgba(theme.accent, 0.55) }))),
        [0, 1, 2, 3, 4, 5].map((i) => {
          const ph = (t * (0.08 + i * 0.02) + i * 0.18) % 1;
          return R("circle", { key: "mo" + i, cx: 620 + i * 80 + Math.sin(t * 0.5 + i) * 34, cy: H - ph * (H - 240), r: 3 + (i % 3) * 2, fill: rgba(theme.accent, 0.3 * (1 - ph)) });
        }));
    },
  });

  /* ── 44 SECOND SEASON — a market awning being cranked out ── */
  FilmKit.make({
    global: "SecondSeason", brand: "Second Season", desk: "#140f14", ambient: 1.7, chrome: false,
    FH: '"Chonburi", Georgia, serif', FB: '"Prompt", system-ui, sans-serif', FM: '"IBM Plex Mono", monospace',
    titlePreset: "slam", itemPreset: "pop", titleLine: 1.02, titleSpace: "-0.01em",
    /* ladder: bg .87 / surface .96 / rule .73 / inkMuted .43 / ink .07 / accent .52 / accent2 .42 */
    palette: (t) => ({ bg: t.bg || "#f0ebe6", surface: "#fcf9f6", rule: "#ccc3ba", inkMuted: "#6e675f", ink: "#16120f", accent: t.accent || "#e0673a", accent2: t.accent2 || "#3a6b7a", accentInk: "#fcf9f6" }),
    tweaks: [{ k: "bg", label: "Canvas", options: ["#f0ebe6", "#f2eee9", "#ede8e3"] }, { k: "accent", label: "Awning", options: ["#e0673a", "#e03a67", "#3ae067"] }, { k: "accent2", label: "Second", options: ["#3a6b7a", "#7a3a6b", "#6b7a3a"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(180deg, " + rgba(theme.surface, 0.94) + " 0%, " + bg + " 44%, " + rgba(theme.accent, 0.16) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M3 9l2-5h14l2 5zM3 9c2 3 4 3 6 0 2 3 4 3 6 0 2 3 4 3 6 0M6 9v11h12V9" })),
    cams: ["drop", "pushR", "hopU", "zoomIn", "pushL", "zoomOut"], camMul: 3, camOff: 5,
    mag: { rot: 0.7, driftX: 8, driftY: 8, driftZ: 0.045, slide: 0.28, inn: 0.18, zin: 0.36, zout: 0.32 },
    variants: { Scroll: "feed", Typing: "hand", Ring: "ring" },
    look: LOOK({ h: 100, kicker: { v: "pill", bg: "accent", c: "accentInk" }, sBg: "accent", sFg: "accentInk", qlh: 1.08, swap: "quote", card: "tilt", chip: "pill", r: 14, cBg: "ink", cFg: "surface", btn: "pill", btnBg: "accent", btnC: "accentInk", logo: "circle", tilts: [-2, 2, 0, 0] }),
    /* WORLD — a market stall opening up. Overhead: a bunting run and a signboard.
       Mid: the awning cranked out and back on a 12s cycle — the crank turns, the
       valance ripples, the shadow it throws grows with it. Floor: crates of
       produce, a set of scales, a chalked price board. Near: leaves. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, ground = H - 280;
      const cyc = (t % 12) / 12, tri = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;
      const out = E.inOut(tri);
      const reach = 110 + out * 250;
      const crank = out * 900;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "ss-stripe", width: 84, height: 84, patternUnits: "userSpaceOnUse" },
            R("rect", { x: 0, y: 0, width: 42, height: 84, fill: rgba(theme.accent, 0.5) }),
            R("rect", { x: 42, y: 0, width: 42, height: 84, fill: rgba(theme.surface, 0.85) }))),
        /* overhead: bunting and a signboard */
        R("g", null,
          R("path", { d: "M -20 60 q " + (W / 2) + " " + (74 + Math.sin(t * 0.7) * 10).toFixed(1) + " " + (W + 40) + " 10", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 4 }),
          Array.from({ length: 10 }).map((_, i) => {
            const bx = 50 + i * ((W - 100) / 9);
            const by = 60 + Math.sin((i / 9) * Math.PI) * (62 + Math.sin(t * 0.7) * 8) - (i / 9) * 50;
            return R("path", { key: "bt" + i, d: "M -20 0 h 40 l -20 42 z", fill: rgba(i % 3 === 0 ? theme.accent : (i % 3 === 1 ? theme.accent2 : tint), 0.6), transform: "translate(" + bx.toFixed(1) + "," + by.toFixed(1) + ") rotate(" + (Math.sin(t * 1.4 + i * 0.6) * 5).toFixed(2) + ")" });
          })),
        R("g", { transform: "translate(" + (W - 250) + ",200) rotate(" + (Math.sin(t * 0.8) * 1.4).toFixed(2) + ")" },
          R("rect", { x: -110, y: 0, width: 220, height: 76, rx: 8, fill: rgba(theme.accent2, 0.6), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("rect", { x: -84, y: 22, width: 130, height: 12, rx: 6, fill: rgba(theme.surface, 0.7) }),
          R("rect", { x: -84, y: 46, width: 84, height: 10, rx: 5, fill: rgba(theme.surface, 0.45) })),
        /* mid: the awning, its crank and the shadow it throws */
        R("g", { transform: "translate(" + (W - 72) + ",1400) scale(1.16)" },
          R("rect", { x: -40, y: -40, width: 80, height: 26, rx: 6, fill: rgba(tint, 0.6) }),
          R("path", { d: "M 0 -14 h -" + reach.toFixed(0) + " l 30 96 h " + (reach - 60).toFixed(0) + " z", fill: "url(#ss-stripe)", stroke: rgba(tint, 0.35), strokeWidth: 4 }),
          R("path", { d: "M " + (-reach + 30).toFixed(0) + " 82 " + Array.from({ length: 8 }).map((_, i) => "q 18 " + (16 + Math.sin(t * 2 + i) * 7).toFixed(1) + " 36 0").join(" "), fill: "none", stroke: rgba(theme.accent, 0.8), strokeWidth: 10 }),
          R("line", { x1: 0, y1: -14, x2: (-reach + 24).toFixed(0), y2: 60, stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("g", { transform: "translate(-24,150) rotate(" + crank.toFixed(1) + ")" },
            R("circle", { r: 22, fill: "none", stroke: rgba(theme.accent2, 0.8), strokeWidth: 6 }),
            R("path", { d: "M 0 0 h 22", stroke: rgba(theme.accent2, 0.7), strokeWidth: 6 }),
            R("circle", { cx: 22, cy: 0, r: 7, fill: rgba(theme.accent, 0.9) })),
          R("path", { d: "M 0 " + (ground - 1090) + " h -" + (reach * 0.9).toFixed(0) + " l -60 40 h " + (reach * 0.9 + 60).toFixed(0) + " z", fill: rgba(theme.ink, 0.08) })),
        /* a neighbouring stall behind, drifting on parallax */
        R("g", { opacity: 0.34, transform: "translate(" + (-((t * 6) % 320)).toFixed(1) + ",0)" },
          [0, 1, 2].map((i) => R("g", { key: "ns" + i },
            R("path", { d: "M " + (60 + i * 320) + " " + (ground - 210) + " h 240 l -20 44 h -200 z", fill: rgba(theme.accent2, 0.5) }),
            R("path", { d: "M " + (80 + i * 320) + " " + (ground - 166) + " v 166 M " + (280 + i * 320) + " " + (ground - 166) + " v 166", stroke: rgba(tint, 0.5), strokeWidth: 6 }),
            R("rect", { x: 96 + i * 320, y: ground - 96, width: 170, height: 14, rx: 4, fill: rgba(tint, 0.45) })))),
        /* a string of garlic hung along the frame */
        R("g", { transform: "translate(0,286)" },
          R("path", { d: "M 40 0 q " + (W / 2 - 40) + " " + (34 + Math.sin(t * 0.8) * 6).toFixed(1) + " " + (W - 80) + " 0", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const gx = 80 + i * ((W - 160) / 7);
            const gy = Math.sin((i / 7) * Math.PI) * (28 + Math.sin(t * 0.8) * 5);
            return R("g", { key: "gl" + i, transform: "translate(" + gx.toFixed(1) + "," + gy.toFixed(1) + ") rotate(" + (Math.sin(t * 1.2 + i * 0.7) * 4).toFixed(2) + ")" },
              R("ellipse", { cx: 0, cy: 40, rx: 28, ry: 36, fill: rgba(theme.surface, 0.92), stroke: rgba(tint, 0.5), strokeWidth: 4 }),
              R("path", { d: "M -14 30 q 14 -18 28 0", fill: "none", stroke: rgba(tint, 0.35), strokeWidth: 3 }),
              R("path", { d: "M 0 6 v -22", stroke: rgba(theme.accent2, 0.8), strokeWidth: 5 }));
          })),
        /* a barrow wheeled past the front of the stall */
        (function () {
          const bx = ((t * 34) % (W + 560)) - 280;
          const wl = (bx / 26) * 57.3;
          return R("g", { opacity: 0.7, transform: "translate(" + bx.toFixed(1) + "," + (H - 96) + ")" },
            R("path", { d: "M -110 -60 h 220 l -26 60 h -168 z", fill: rgba(theme.accent2, 0.5), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
            R("path", { d: "M 110 -60 l 76 -34", stroke: rgba(tint, 0.55), strokeWidth: 8, strokeLinecap: "round" }),
            [0, 1, 2].map((i) => R("circle", { key: "pr" + i, cx: -60 + i * 54, cy: -76, r: 20, fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.7) })),
            R("g", { transform: "translate(-70,0) rotate(" + wl.toFixed(1) + ")" },
              R("circle", { r: 26, fill: "none", stroke: rgba(tint, 0.6), strokeWidth: 6 }),
              R("path", { d: "M -26 0 h 52", stroke: rgba(tint, 0.5), strokeWidth: 5 })));
        })(),
        /* a sack of produce and a cat under the trestle */
        R("g", { transform: "translate(" + (W * 0.82) + "," + (ground + 60) + ")" },
          R("path", { d: "M -50 0 q -14 -90 20 -110 q 30 -18 60 4 q 30 22 16 106 z", fill: rgba(theme.accent2, 0.42), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("path", { d: "M -14 -108 q 20 -20 44 -2", fill: "none", stroke: rgba(tint, 0.4), strokeWidth: 5 })),
        R("g", { opacity: 0.6, transform: "translate(" + (W * 0.2) + "," + (H - 52) + ") scale(1," + (1 + Math.sin(t * 0.9) * 0.03).toFixed(3) + ")" },
          R("path", { d: "M -56 0 q -8 -42 28 -50 q 40 -8 58 18 q 12 20 -4 32 z", fill: rgba(tint, 0.6) }),
          R("path", { d: "M 20 -32 l 6 -16 l 11 12 z", fill: rgba(tint, 0.6) }),
          R("path", { d: "M -56 0 q -28 -12 -36 4 q 16 8 36 -4 z", fill: rgba(tint, 0.5) })),
        /* floor: crates, scales, a chalk board */
        R("line", { x1: 0, y1: ground, x2: W, y2: ground, stroke: rgba(tint, 0.55), strokeWidth: 8 }),
        R("rect", { x: 0, y: ground, width: W, height: H - ground, fill: rgba(theme.rule, 0.34) }),
        [0, 1, 2].map((i) => R("g", { key: "cr" + i, transform: "translate(" + (150 + i * 200) + "," + (ground + 40) + ") rotate(" + (-2 + i * 2) + ")" },
          R("path", { d: "M -74 0 h 148 v -84 h -148 z", fill: "none", stroke: rgba(tint, 0.55), strokeWidth: 5 }),
          R("path", { d: "M -74 -42 h 148", stroke: rgba(tint, 0.35), strokeWidth: 4 }),
          [0, 1, 2, 3].map((j) => R("circle", { key: "fr" + j, cx: -50 + j * 34, cy: -96 - (j % 2) * 14, r: 20, fill: rgba(j % 2 ? theme.accent : theme.accent2, 0.6) })))),
        R("g", { transform: "translate(" + (W * 0.62) + "," + (ground + 30) + ")" },
          R("path", { d: "M -50 0 h 100 l -12 -40 h -76 z", fill: rgba(tint, 0.55) }),
          R("line", { x1: 0, y1: -40, x2: 0, y2: -140, stroke: rgba(tint, 0.6), strokeWidth: 7 }),
          R("g", { transform: "rotate(" + (Math.sin(t * 1.1) * 7).toFixed(2) + " 0 -140)" },
            R("line", { x1: -84, y1: -140, x2: 84, y2: -140, stroke: rgba(theme.accent2, 0.85), strokeWidth: 8, strokeLinecap: "round" }),
            [-84, 84].map((sx, i) => R("g", { key: "pn" + i, transform: "translate(" + sx + ",-140)" },
              R("line", { x1: 0, y1: 0, x2: 0, y2: 40, stroke: rgba(tint, 0.5), strokeWidth: 3 }),
              R("path", { d: "M -34 40 q 34 26 68 0 z", fill: rgba(theme.accent, i ? 0.6 : 0.4), stroke: rgba(tint, 0.45), strokeWidth: 3 }))))),
        R("g", { opacity: 0.85, transform: "translate(" + (W - 220) + "," + (H - 110) + ") rotate(-3)" },
          R("rect", { x: -100, y: -110, width: 200, height: 220, rx: 6, fill: rgba(theme.ink, 0.82), stroke: rgba(theme.accent, 0.5), strokeWidth: 6 }),
          [0, 1, 2, 3].map((i) => R("line", { key: "ch" + i, x1: -74, y1: -66 + i * 50, x2: 30 + (i % 2) * 40, y2: -66 + i * 50, stroke: rgba(theme.surface, 0.62 - i * 0.08), strokeWidth: 6, strokeLinecap: "round" }))),
        [0, 1, 2, 3, 4].map((i) => {
          const lc = ((t / (7 + i * 1.2)) % 1);
          const lx = 120 + i * 210 + Math.sin(lc * Math.PI * 6 + i) * 110;
          return R("path", { key: "lf" + i, d: "M 0 0 q 24 -20 42 4 q -20 24 -42 -4 z", fill: rgba(i % 2 ? theme.accent2 : theme.accent, 0.45), transform: "translate(" + lx.toFixed(1) + "," + (-60 + lc * (H + 120)).toFixed(1) + ") rotate(" + (lc * 800 + i * 60).toFixed(1) + ")" });
        }));
    },
  });

  /* ── 45 LONG TABLE — a rotisserie turning in an open kitchen ── */
  FilmKit.make({
    global: "LongTable", brand: "Long Table", desk: "#160f0c", ambient: 1.65, chrome: false,
    FH: '"Shrikhand", Georgia, serif', FB: '"Mukta", system-ui, sans-serif', FM: '"IBM Plex Mono", monospace',
    titlePreset: "rise", itemPreset: "stamp", titleLine: 1.12, titleSpace: "0em",
    /* ladder: bg .04 / surface .09 / rule .17 / inkMuted .43 / ink .88 / accent .56 / accent2 .46 */
    palette: (t) => ({ bg: t.bg || "#1a1512", surface: "#251e19", rule: "#3b302a", inkMuted: "#9a8d84", ink: "#f4efe9", accent: t.accent || "#e8903c", accent2: t.accent2 || "#7fb06a", accentInk: "#120d0a" }),
    tweaks: [{ k: "bg", label: "Kitchen", options: ["#1a1512", "#1c1714", "#181310"] }, { k: "accent", label: "Ember", options: ["#e8903c", "#e83c6a", "#3ce890"] }, { k: "accent2", label: "Second", options: ["#7fb06a", "#6a7fb0", "#b06a7f"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(90% 50% at 50% 96%, " + rgba(theme.accent, 0.26) + " 0%, transparent 60%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round" }, R2("path", { d: "M3 12h18" }), R2("circle", { cx: 9, cy: 12, r: 3.5 }), R2("circle", { cx: 16, cy: 12, r: 2.5 })),
    cams: ["zoomIn", "pushL", "drop", "pushR", "pushU", "zoomOut"], camMul: 5, camOff: 1,
    mag: { rot: 0.4, driftX: 7, driftY: 7, driftZ: 0.05, slide: 0.24, inn: 0.2, zin: 0.36, zout: 0.3 },
    variants: { Scroll: "board", Typing: "caret", Ring: "bar" },
    look: LOOK({ h: 92, kicker: { v: "tag", bg: "accent", c: "accentInk" }, sBg: "surface", sFg: "ink", qlh: 1.16, swap: "body", card: "glow", chip: "pill", r: 16, cBg: "accent", cFg: "accentInk", btn: "glow", btnBg: "accentInk", btnC: "ink", logo: "circle", glow: true }),
    /* WORLD — an open kitchen at service. Overhead: a heat lamp row and a rack of
       hanging herbs. Margin: the rotisserie — a spit turning on a 9s revolution
       with three birds on it, the fire beneath breathing and fat dripping. Floor:
       a long table laid down the room, a stockpot, a knife block. Near: sparks. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.accentInk : theme.inkMuted, floor = H - 290;
      const spit = (t * 40) % 360;
      const fire = 0.7 + 0.3 * Math.abs(Math.sin(t * 2.6) * Math.cos(t * 1.1));
      const drip = (t * 0.9) % 1;
      const out = [];

      out.push(R("defs", { key: "d" },
        R("pattern", { id: "lt2-tile", width: 66, height: 66, patternUnits: "userSpaceOnUse" },
          R("rect", { x: 3, y: 3, width: 60, height: 60, rx: 4, fill: "none", stroke: rgba(theme.rule, inv ? 0.5 : 0.85), strokeWidth: 2 }))));
      out.push(R("rect", { key: "tile", x: 0, y: 0, width: W, height: floor, fill: "url(#lt2-tile)", opacity: 0.6 }));

      /* overhead: the lamp rail, four heat lamps and a rack of hanging herbs */
      out.push(R("rect", { key: "rail", x: -20, y: 40, width: W + 40, height: 16, rx: 5, fill: rgba(tint, 0.5) }));
      [0, 1, 2, 3].forEach((i) => {
        out.push(R("g", { key: "hl" + i, transform: "translate(" + (170 + i * 250) + ",56)" },
          R("line", { x1: 0, y1: 0, x2: 0, y2: 34, stroke: rgba(tint, 0.45), strokeWidth: 4 }),
          R("path", { d: "M -48 34 h 96 l -20 44 h -56 z", fill: rgba(theme.accent, 0.45) }),
          R("ellipse", { cx: 0, cy: 84, rx: 26, ry: 10, fill: rgba(theme.accent, 0.6 + 0.3 * fire) }),
          R("path", { d: "M -50 88 L 50 88 L 96 380 L -96 380 Z", fill: rgba(theme.accent, 0.05 + 0.04 * fire) }),
          R("ellipse", { cx: 0, cy: 380, rx: 96, ry: 16, fill: rgba(theme.accent, 0.05) })));
      });
      [0, 1, 2, 3, 4, 5].forEach((i) => {
        const sprigs = [0, 1, 2].map((j) => R("path", { key: "sp" + j, d: "M 0 0 q " + (-22 + j * 22) + " 40 " + (-12 + j * 12) + " 82", fill: "none", stroke: rgba(theme.accent2, 0.55), strokeWidth: 6, strokeLinecap: "round" }));
        out.push(R("g", { key: "hb" + i, transform: "translate(" + (110 + i * 170) + ",166) rotate(" + (Math.sin(t * 0.9 + i) * 2.6).toFixed(2) + ")" },
          R("line", { x1: 0, y1: -110, x2: 0, y2: 0, stroke: rgba(tint, 0.35), strokeWidth: 3 }),
          sprigs));
      });

      /* margin: the rotisserie — spit turning, fire breathing, fat dripping */
      const birds = [-1, 0, 1].map((i) => R("g", { key: "bd" + i, transform: "translate(0," + (-60 + i * 52) + ")" },
        R("ellipse", { cx: 0, cy: 0, rx: 44, ry: 22, fill: rgba(theme.accent, 0.75), stroke: rgba(tint, 0.35), strokeWidth: 3 }),
        R("path", { d: "M -22 -8 q 22 -12 44 2", fill: "none", stroke: rgba(theme.accentInk, 0.3), strokeWidth: 4 })));
      const flames = [0, 1, 2, 3, 4, 5, 6].map((i) => R("path", { key: "fm" + i, d: "M " + (-84 + i * 28) + " 96 q " + (Math.sin(t * 3 + i) * 12).toFixed(1) + " -" + (30 + fire * 40).toFixed(0) + " 0 -" + (60 + fire * 70).toFixed(0), fill: "none", stroke: rgba(i % 2 ? theme.accent : theme.accent2, 0.4 + 0.4 * fire), strokeWidth: 9, strokeLinecap: "round" }));
      out.push(R("g", { key: "rot", transform: "translate(" + (W - 160) + ",1150)" },
        R("rect", { x: -132, y: -200, width: 264, height: 400, rx: 10, fill: rgba(theme.surface, 0.92), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
        R("rect", { x: -110, y: -178, width: 220, height: 250, rx: 6, fill: rgba(theme.accentInk, 0.5) }),
        R("line", { x1: -110, y1: -60, x2: 110, y2: -60, stroke: rgba(tint, 0.4), strokeWidth: 5 }),
        R("g", { transform: "rotate(" + spit.toFixed(1) + " 0 -60)" }, birds),
        R("g", { transform: "rotate(" + (-spit * 0.5).toFixed(1) + " -110 -60)" },
          R("circle", { cx: -110, cy: -60, r: 20, fill: "none", stroke: rgba(theme.accent2, 0.8), strokeWidth: 6 }),
          R("path", { d: "M -130 -60 h 40", stroke: rgba(theme.accent2, 0.6), strokeWidth: 5 })),
        flames,
        R("circle", { cx: 10, cy: 40 + drip * 60, r: 5, fill: rgba(theme.accent, 0.8 * (1 - drip)) }),
        R("rect", { x: -110, y: 108, width: 220, height: 62, rx: 6, fill: rgba(theme.accentInk, 0.4) }),
        R("rect", { x: -92, y: 126, width: 100, height: 12, rx: 6, fill: rgba(theme.accent, 0.6) })));

      /* floor: the long table laid down the room, a stockpot, a knife block */
      out.push(R("line", { key: "fl", x1: 0, y1: floor, x2: W, y2: floor, stroke: rgba(tint, 0.55), strokeWidth: 8 }));
      out.push(R("rect", { key: "fr", x: 0, y: floor, width: W, height: H - floor, fill: rgba(theme.surface, 0.5) }));
      const settings = [0, 1, 2, 3, 4].map((i) => R("g", { key: "pl" + i, transform: "translate(" + (90 + i * 150) + ",-34)" },
        R("ellipse", { cx: 0, cy: 0, rx: 44, ry: 14, fill: rgba(theme.ink, 0.85) }),
        R("ellipse", { cx: 0, cy: -3, rx: 22, ry: 7, fill: rgba(i % 2 ? theme.accent2 : theme.accent, 0.6) }),
        R("line", { x1: 56, y1: -12, x2: 56, y2: 12, stroke: rgba(tint, 0.5), strokeWidth: 4 })));
      out.push(R("g", { key: "tbl", transform: "translate(0," + (floor + 90) + ")" },
        R("rect", { x: -20, y: -20, width: W * 0.72, height: 24, rx: 6, fill: rgba(theme.accent, 0.4) }),
        settings,
        R("path", { d: "M 40 4 v 70 M " + (W * 0.62) + " 4 v 70", stroke: rgba(tint, 0.45), strokeWidth: 10 })));
      const steam = [0, 1, 2].map((i) => {
        const ph = ((t * 0.4 + i * 0.34) % 1);
        return R("circle", { key: "st" + i, cx: -20 + i * 20, cy: -110 - ph * 90, r: 12 + ph * 26, fill: rgba(theme.ink, 0.08 * (1 - ph)) });
      });
      out.push(R("g", { key: "pot", transform: "translate(" + (W * 0.82) + "," + (H - 70) + ")" },
        R("path", { d: "M -56 0 h 112 v -96 h -112 z", fill: rgba(theme.rule, 0.8), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
        R("ellipse", { cx: 0, cy: -96, rx: 56, ry: 16, fill: rgba(theme.rule, 0.9), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
        steam));
      const knives = [0, 1, 2, 3].map((i) => R("line", { key: "kn" + i, x1: -28 + i * 18, y1: -70, x2: -34 + i * 22, y2: -70 - (40 + (i % 3) * 26), stroke: rgba(theme.ink, 0.5), strokeWidth: 7, strokeLinecap: "round" }));
      out.push(R("g", { key: "blk", opacity: 0.85, transform: "translate(" + (W * 0.32) + "," + (H - 66) + ")" },
        R("path", { d: "M -50 0 h 100 l -14 -70 h -72 z", fill: rgba(theme.rule, 0.75), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
        knives));

      /* a pass window with tickets clipped along its rail */
      const tickets = [0, 1, 2, 3, 4].map((i) => R("g", { key: "tk" + i, transform: "translate(" + (-150 + i * 76) + ",0) rotate(" + (Math.sin(t * 1.3 + i * 0.7) * 3).toFixed(2) + ")" },
        R("rect", { x: -28, y: 0, width: 56, height: 44, rx: 2, fill: rgba(theme.surface, 0.9), stroke: rgba(tint, 0.3), strokeWidth: 2 }),
        R("rect", { x: -18, y: 10, width: 38, height: 6, rx: 3, fill: rgba(theme.accent, 0.7) }),
        R("rect", { x: -18, y: 24, width: 22, height: 5, rx: 3, fill: rgba(tint, 0.4) })));
      out.push(R("g", { key: "pass", transform: "translate(" + (W * 0.46) + "," + (H - 168) + ") scale(0.86)" },
        R("rect", { x: -196, y: -20, width: 392, height: 12, rx: 5, fill: rgba(theme.accent, 0.55) }),
        tickets));

      /* a shelf of copper pots and a stack of plates on the back wall */
      const pots = [0, 1, 2, 3].map((i) => R("g", { key: "pt" + i, transform: "translate(" + (-120 + i * 82) + ",0)" },
        R("path", { d: "M -30 0 h 60 l -8 " + (44 + (i % 3) * 12) + " h -44 z", fill: rgba(theme.accent, 0.5), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
        R("path", { d: "M 30 12 h 26", stroke: rgba(tint, 0.45), strokeWidth: 5, strokeLinecap: "round" })));
      out.push(R("g", { key: "shelf", transform: "translate(180," + (H - 240) + ") scale(0.8)" },
        R("rect", { x: -180, y: 62, width: 360, height: 14, rx: 4, fill: rgba(tint, 0.5) }),
        pots));

      /* a chalk menu and a stack of warm plates, in the margin band */
      const menu = [0, 1, 2, 3].map((i) => R("line", { key: "ml" + i, x1: -76, y1: -60 + i * 44, x2: 26 + (i % 2) * 40, y2: -60 + i * 44, stroke: rgba(theme.surface, 0.6 - i * 0.08), strokeWidth: 6, strokeLinecap: "round" }));
      out.push(R("g", { key: "menu", transform: "translate(" + (W - 168) + ",1500) rotate(-2)" },
        R("rect", { x: -104, y: -120, width: 208, height: 240, rx: 6, fill: rgba(theme.accentInk, 0.72), stroke: rgba(theme.accent, 0.5), strokeWidth: 6 }),
        menu));
      const stack = [0, 1, 2, 3, 4].map((i) => R("ellipse", { key: "pl" + i, cx: 0, cy: -i * 13, rx: 46 - (i % 2) * 3, ry: 13, fill: rgba(theme.surface, 0.9), stroke: rgba(tint, 0.32), strokeWidth: 2 }));
      out.push(R("g", { key: "stk", transform: "translate(180,1560)" }, stack));

      /* a service hatch bell, dinged on the beat */
      const ding = Math.abs(Math.sin(t * 1.6)) > 0.96 ? 1 : 0;
      out.push(R("g", { key: "bell", transform: "translate(" + (W * 0.16) + "," + (floor + 116) + ")" },
        R("path", { d: "M -34 0 h 68 l -10 -46 a 24 24 0 0 0 -48 0 z", fill: rgba(theme.accent2, 0.6), stroke: rgba(tint, 0.4), strokeWidth: 3 }),
        R("circle", { cx: 0, cy: -54, r: 7 + ding * 3, fill: rgba(theme.accent, 0.8 + 0.2 * ding) }),
        R("circle", { cx: 0, cy: -54, r: 26 * (0.4 + ding * 0.8), fill: "none", stroke: rgba(theme.accent, 0.4 * ding), strokeWidth: 4 })));

      /* near: sparks off the fire */
      [0, 1, 2, 3, 4, 5].forEach((i) => {
        const ph = (t * (0.4 + i * 0.08) + i * 0.2) % 1;
        out.push(R("circle", { key: "sk" + i, cx: W - 220 + Math.sin(t * 2 + i) * 60, cy: floor - ph * 500, r: 3 + (i % 2) * 2, fill: rgba(theme.accent, 0.5 * (1 - ph)) }));
      });

      return R("g", null, out);
    },
  });
})();
