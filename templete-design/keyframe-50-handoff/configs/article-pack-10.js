/* article-pack-10.js — cohort 10, opinion / manifesto: packs 46-50. The last five.
   Hard Stop · Plain Speech · Bold Claim · No Comment · Last Word
   Contract per HANDOFF.md: hexes only in palette(), look and World name slots,
   chrome:false, three depth planes, an object on a route with secondary motion,
   nothing between y=290 and y=1330 except margin clusters (x>820), tone-aware
   tints, comparison tiles on tile.bg "rule". Worlds are built FLAT — children go
   into named arrays, nesting never exceeds two levels. */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  const LOOK = (o) => ({
    hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: o.h, upper: o.upper, kicker: o.kicker },
    statement: { bg: o.sBg, fg: o.sFg, hi: "accent2", world: true, top: 610, size: o.h + 12, upper: o.upper },
    body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 540, size: o.h - 30, bodySize: 38, ch: 54, lh: 1.52, weight: 400, dim: 0.9, kicker: { v: "bare", c: "accent" } },
    quote: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 360, size: o.h - 20, ch: 24, lh: o.qlh, markSize: 210, altLine: o.alt },
    feature: { bg: "bg", fg: "ink", hi: "accent2", world: true, top: 255, size: o.h - 20, upper: o.upper, swap: o.swap, card: { v: o.card, bg: "surface", glow: "accent", r: o.r, line: "inkMuted" }, chips: { v: o.chip, colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
    montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: o.h - 26, upper: o.upper, labelsOnly: true, tile: { bg: "rule", line: "inkMuted", label: "ink", r: o.r, h: 640, labelSize: 42 }, tilts: [0, 0, 0, 0] },
    stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 390, size: o.h - 24, upper: o.upper, cols: ["accent", "accent2", "ink"], num: 152, rule: !o.glow, glowNums: o.glow },
    cta: { bg: o.cBg, fg: o.cFg, hi: "accent2", world: true, top: 470, size: o.h - 8, upper: o.upper, align: "left", btn: { v: o.btn, bg: o.btnBg, c: o.btnC }, logoShape: o.logo },
    app: { bg: "surface", fg: "ink", hi: "accent", cardBg: "bg", line: "inkMuted", world: true },
  });

  /* ── 46 HARD STOP — a megaphone on a stand, cone pulsing ── */
  FilmKit.make({
    global: "HardStop", brand: "Hard Stop", desk: "#100c0c", ambient: 1.75, chrome: false,
    FH: '"Bebas Neue", system-ui, sans-serif', FB: '"Chivo", system-ui, sans-serif', FM: '"IBM Plex Mono", monospace',
    titlePreset: "slam", itemPreset: "stamp", titleLine: 0.92, titleSpace: "0.005em",
    /* ladder: bg .88 / surface .97 / rule .74 / inkMuted .44 / ink .06 / accent .5 / accent2 .4 */
    palette: (t) => ({ bg: t.bg || "#eeecea", surface: "#fcfbfa", rule: "#c9c5c1", inkMuted: "#6b6764", ink: "#0f0d0d", accent: t.accent || "#e02020", accent2: t.accent2 || "#20507a", accentInk: "#fcfbfa" }),
    tweaks: [{ k: "bg", label: "Paper", options: ["#eeecea", "#f0eeec", "#eae8e6"] }, { k: "accent", label: "Red", options: ["#e02020", "#e07020", "#2020e0"] }, { k: "accent2", label: "Second", options: ["#20507a", "#7a2050", "#507a20"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(88% 46% at 78% 6%, " + rgba(theme.accent, 0.12) + " 0%, transparent 60%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M4 9h5l8-5v16l-8-5H4z" })),
    cams: ["slamL", "zoomIn", "slamR", "drop", "pushU", "zoomOut"], camMul: 1, camOff: 2,
    mag: { rot: 0.5, driftX: 6, driftY: 6, driftZ: 0.04, slide: 0.3, inn: 0.14, zin: 0.4, zout: 0.3 },
    variants: { Scroll: "board", Typing: "caret", Ring: "bar" },
    look: LOOK({ h: 132, upper: true, kicker: { v: "tag", bg: "accent", c: "accentInk" }, sBg: "accent", sFg: "accentInk", qlh: 1.0, swap: "quote", card: "frame", chip: "square", r: 2, cBg: "ink", cFg: "surface", btn: "block", btnBg: "accent", btnC: "accentInk", logo: "rounded" }),
    /* WORLD — a public square before a rally. Overhead: a scaffold of loudspeakers
       and a taut banner. Margin: the megaphone on its stand, cone pulsing on the
       beat with rings leaving it and the trigger clicking. Floor: barriers, a
       crate to stand on, pasted notices. Near: a torn paper scrap. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, ground = H - 280;
      const beat = Math.abs(Math.sin(t * 1.9));
      const hit = beat > 0.94 ? 1 : 0;
      const out = [];

      out.push(R("defs", { key: "d" },
        R("pattern", { id: "hs-halftone", width: 18, height: 18, patternUnits: "userSpaceOnUse" },
          R("circle", { cx: 9, cy: 9, r: 3, fill: rgba(theme.rule, inv ? 0.22 : 0.62) }))));
      out.push(R("rect", { key: "ht", x: 0, y: 0, width: W, height: H, fill: "url(#hs-halftone)" }));

      /* overhead: a speaker scaffold and a taut banner */
      out.push(R("rect", { key: "sc", x: -20, y: 54, width: W + 40, height: 16, rx: 4, fill: rgba(tint, 0.6) }));
      const braces = [0, 1, 2, 3, 4, 5].map((i) => R("path", { key: "br" + i, d: "M " + (40 + i * 200) + " 70 l 60 74 M " + (100 + i * 200) + " 70 l -60 74", stroke: rgba(tint, 0.35), strokeWidth: 4 }));
      out.push(R("g", { key: "brg" }, braces));
      const speakers = [0, 1, 2, 3].map((i) => R("g", { key: "sp" + i, transform: "translate(" + (170 + i * 250) + ",70) rotate(" + (Math.sin(t * 0.6 + i) * 1.4).toFixed(2) + ")" },
        R("path", { d: "M -44 0 h 88 l -14 96 h -60 z", fill: rgba(theme.ink, 0.82) }),
        R("ellipse", { cx: 0, cy: 84, rx: 32, ry: 12, fill: rgba(theme.accent, 0.5 + 0.4 * beat) }),
        R("ellipse", { cx: 0, cy: 84, rx: 46 * (0.5 + beat * 0.6), ry: 16, fill: "none", stroke: rgba(theme.accent, 0.3 * beat), strokeWidth: 4 })));
      out.push(R("g", { key: "spk" }, speakers));
      out.push(R("g", { key: "ban", transform: "translate(" + (W * 0.5) + ",200) rotate(" + (Math.sin(t * 0.5) * 0.8).toFixed(2) + ")" },
        R("path", { d: "M -300 0 q 300 " + (18 + Math.sin(t * 0.8) * 5).toFixed(1) + " 600 0 v 74 q -300 " + (18 + Math.sin(t * 0.8) * 5).toFixed(1) + " -600 0 z", fill: rgba(theme.accent, 0.75) }),
        R("rect", { x: -220, y: 26, width: 300, height: 16, rx: 8, fill: rgba(theme.accentInk, 0.5) }),
        R("rect", { x: 110, y: 26, width: 90, height: 16, rx: 8, fill: rgba(theme.accentInk, 0.3) })));

      /* margin: the megaphone on its stand */
      const rings = [0, 1, 2].map((i) => R("ellipse", { key: "rg" + i, cx: -120 - i * 44, cy: 0, rx: 16 + i * 12, ry: 60 + i * 30, fill: "none", stroke: rgba(theme.accent, 0.5 * beat * (1 - i * 0.3)), strokeWidth: 5 }));
      out.push(R("g", { key: "meg", transform: "translate(" + (W - 130) + ",1190)" },
        R("path", { d: "M 40 -66 h 44 v 132 h -44 z", fill: rgba(theme.ink, 0.85) }),
        R("path", { d: "M 40 -66 L -110 -" + (110 + hit * 8) + " L -110 " + (110 + hit * 8) + " L 40 66 Z", fill: rgba(theme.accent, 0.8), stroke: rgba(tint, 0.35), strokeWidth: 4 }),
        R("ellipse", { cx: -110, cy: 0, rx: 14, ry: 110 + hit * 8, fill: rgba(theme.accentInk, 0.28) }),
        R("path", { d: "M 84 20 h 40 v 40 h -40 z", fill: rgba(theme.accent2, 0.8) }),
        R("circle", { cx: 104, cy: 40, r: 8 + hit * 3, fill: rgba(theme.accent, 0.9) }),
        R("line", { x1: 62, y1: 66, x2: 62, y2: 300, stroke: rgba(tint, 0.6), strokeWidth: 10 }),
        R("path", { d: "M -10 300 h 144 M 62 300 l -50 60 M 62 300 l 50 60", stroke: rgba(tint, 0.55), strokeWidth: 8, strokeLinecap: "round" }),
        rings));

      /* floor: barriers, a crate, pasted notices */
      out.push(R("line", { key: "gl", x1: 0, y1: ground, x2: W, y2: ground, stroke: rgba(tint, 0.6), strokeWidth: 8 }));
      out.push(R("rect", { key: "gr", x: 0, y: ground, width: W, height: H - ground, fill: rgba(theme.rule, 0.32) }));
      const barriers = [0, 1, 2].map((i) => R("g", { key: "bar" + i, transform: "translate(" + (160 + i * 300) + "," + (ground + 60) + ")" },
        R("path", { d: "M -110 0 v -110 M 110 0 v -110", stroke: rgba(tint, 0.6), strokeWidth: 9 }),
        R("path", { d: "M -110 -100 h 220 M -110 -60 h 220", stroke: rgba(theme.accent, 0.6), strokeWidth: 8 }),
        R("path", { d: "M -110 -110 L 110 -60", stroke: rgba(tint, 0.3), strokeWidth: 5 })));
      out.push(R("g", { key: "bars" }, barriers));
      out.push(R("g", { key: "crate", transform: "translate(" + (W * 0.76) + "," + (ground + 50) + ")" },
        R("path", { d: "M -80 0 h 160 v -100 h -160 z", fill: "none", stroke: rgba(tint, 0.6), strokeWidth: 6 }),
        R("path", { d: "M -80 -50 h 160 M 0 -100 v 100", stroke: rgba(tint, 0.35), strokeWidth: 5 })));
      const notices = [0, 1, 2, 3].map((i) => R("g", { key: "nt" + i, transform: "translate(" + (((i * 300 - (t * 8) % 300) % (W + 300)) - 150).toFixed(1) + "," + (ground - 150) + ") rotate(" + (-3 + i * 2) + ")" },
        R("rect", { x: -66, y: -56, width: 132, height: 112, rx: 2, fill: rgba(theme.surface, inv ? 0.42 : 0.9), stroke: rgba(tint, 0.3), strokeWidth: 2 }),
        R("rect", { x: -46, y: -34, width: 92, height: 16, rx: 3, fill: rgba(theme.accent, 0.7) }),
        R("rect", { x: -46, y: -4, width: 62, height: 9, rx: 3, fill: rgba(tint, 0.4) })));
      out.push(R("g", { key: "nts", opacity: 0.7 }, notices));

      /* near: a torn scrap tumbling */
      const scraps = [0, 1, 2].map((i) => {
        const ph = (t * (0.24 + i * 0.06) + i * 0.3) % 1;
        const x = 220 + i * 300 + Math.sin(t * 1.3 + i) * 44, y = -60 + ph * (H + 120);
        return R("path", { key: "sr" + i, d: "M 0 0 l 44 -10 l 10 34 l -40 12 z", fill: rgba(theme.surface, 0.85 * (1 - ph * 0.5)), stroke: rgba(tint, 0.3), strokeWidth: 2, transform: "translate(" + x.toFixed(1) + "," + y.toFixed(1) + ") rotate(" + (ph * 420 + i * 60).toFixed(1) + ")" });
      });
      out.push(R("g", { key: "scr" }, scraps));

      return R("g", null, out);
    },
  });

  /* ── 47 PLAIN SPEECH — a flag running up its halyard ── */
  FilmKit.make({
    global: "PlainSpeech", brand: "Plain Speech", desk: "#0c1014", ambient: 1.6, chrome: false,
    FH: '"Staatliches", system-ui, sans-serif', FB: '"Catamaran", system-ui, sans-serif', FM: '"IBM Plex Mono", monospace',
    titlePreset: "machete", itemPreset: "rise", titleLine: 0.98, titleSpace: "0.01em",
    /* ladder: bg .9 / surface .98 / rule .77 / inkMuted .45 / ink .06 / accent .34 / accent2 .5 */
    palette: (t) => ({ bg: t.bg || "#f0f1f2", surface: "#fcfdfd", rule: "#ccd0d2", inkMuted: "#6c7174", ink: "#0f1112", accent: t.accent || "#1f4f7a", accent2: t.accent2 || "#c9a13a", accentInk: "#fcfdfd" }),
    tweaks: [{ k: "bg", label: "Sky", options: ["#f0f1f2", "#f2f3f4", "#eceff0"] }, { k: "accent", label: "Navy", options: ["#1f4f7a", "#7a1f4f", "#4f7a1f"] }, { k: "accent2", label: "Second", options: ["#c9a13a", "#3ac9a1", "#a13ac9"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(178deg, " + rgba(theme.surface, 0.97) + " 0%, " + bg + " 52%, " + rgba(theme.rule, 0.4) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M6 21V3l12 4-12 4" })),
    cams: ["pushU", "zoomIn", "pushR", "drop", "zoomOut", "pushL"], camMul: 3, camOff: 3,
    mag: { rot: 0.2, driftX: 6, driftY: 7, driftZ: 0.035, slide: 0.24, inn: 0.18, zin: 0.3, zout: 0.28 },
    variants: { Scroll: "feed", Typing: "terminal", Ring: "gauge" },
    look: LOOK({ h: 122, upper: true, kicker: { v: "square", bg: "accent", c: "accentInk" }, sBg: "ink", sFg: "surface", qlh: 1.04, swap: "body", card: "frame", chip: "square", r: 4, cBg: "accent", cFg: "accentInk", btn: "block", btnBg: "accentInk", btnC: "accent", logo: "rounded" }),
    /* WORLD — a civic forecourt. Overhead: a portico cornice and a row of pennants.
       Margin: the flag running up its halyard on a 14s cycle, cloth rippling,
       cleat knot swinging. Floor: steps, a plinth with a notice, two figures.
       Near: gulls crossing high. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, steps = H - 300;
      const cyc = (t % 14) / 14;
      const rise = cyc < 0.62 ? E.inOut(cyc / 0.62) : 1;
      const flagY = 1440 - rise * 1100;
      const ripple = Math.sin(t * 2.4);
      const out = [];

      out.push(R("defs", { key: "d" },
        R("pattern", { id: "ps2-ashlar", width: 160, height: 60, patternUnits: "userSpaceOnUse" },
          R("path", { d: "M0 59h160M120 0v60", stroke: rgba(theme.rule, inv ? 0.24 : 0.66), strokeWidth: 2 }))));
      out.push(R("rect", { key: "as", x: 0, y: 0, width: W, height: H, fill: "url(#ps2-ashlar)" }));

      /* overhead: a cornice and a row of pennants */
      out.push(R("rect", { key: "cor", x: -20, y: 40, width: W + 40, height: 30, rx: 4, fill: rgba(tint, 0.55) }));
      out.push(R("rect", { key: "cor2", x: -20, y: 78, width: W + 40, height: 14, rx: 4, fill: rgba(tint, 0.4) }));
      const dentils = [];
      for (let i = 0; i < 22; i++) dentils.push(R("rect", { key: "dn" + i, x: 24 + i * 48, y: 96, width: 24, height: 22, rx: 3, fill: rgba(tint, 0.42) }));
      out.push(R("g", { key: "dns" }, dentils));
      const pennants = [0, 1, 2, 3, 4, 5, 6].map((i) => {
        const px = 80 + i * ((W - 160) / 6);
        const py = 132 + Math.sin((i / 6) * Math.PI) * (30 + Math.sin(t * 0.7) * 5);
        return R("path", { key: "pn" + i, d: "M -22 0 h 44 l -22 50 z", fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.6), transform: "translate(" + px.toFixed(1) + "," + py.toFixed(1) + ") rotate(" + (Math.sin(t * 1.3 + i * 0.6) * 5).toFixed(2) + ")" });
      });
      out.push(R("path", { key: "pline", d: "M 60 132 q " + (W / 2 - 60) + " " + (34 + Math.sin(t * 0.7) * 6).toFixed(1) + " " + (W - 120) + " 0", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 3 }));
      out.push(R("g", { key: "pns" }, pennants));

      /* margin: the flagpole, halyard and flag */
      out.push(R("g", { key: "pole", transform: "translate(" + (W - 140) + ",0)" },
        R("line", { x1: 0, y1: 300, x2: 0, y2: 1560, stroke: rgba(tint, 0.6), strokeWidth: 12 }),
        R("circle", { cx: 0, cy: 292, r: 16, fill: rgba(theme.accent2, 0.9) }),
        R("line", { x1: -16, y1: 300, x2: -16, y2: 1520, stroke: rgba(tint, 0.4), strokeWidth: 3 }),
        R("path", { d: "M 0 " + flagY.toFixed(1) + " q 30 " + (-14 + ripple * 12).toFixed(1) + " 60 0 q 30 " + (14 + ripple * 12).toFixed(1) + " 60 0 v 96 q -30 " + (14 - ripple * 12).toFixed(1) + " -60 0 q -30 " + (-14 - ripple * 12).toFixed(1) + " -60 0 z", fill: rgba(theme.accent, 0.82), transform: "translate(-120,0)" }),
        R("rect", { x: -122, y: flagY, width: 12, height: 96, rx: 4, fill: rgba(theme.accentInk, 0.2) }),
        R("g", { transform: "translate(-16,1520) rotate(" + (Math.sin(t * 1.6) * 9).toFixed(2) + ")" },
          R("rect", { x: -14, y: 0, width: 28, height: 54, rx: 6, fill: rgba(theme.accent2, 0.8) }),
          R("path", { d: "M 0 54 v 48", stroke: rgba(tint, 0.5), strokeWidth: 4 }))));

      /* floor: steps, a plinth with a notice, two figures */
      const treads = [0, 1, 2, 3].map((i) => R("g", { key: "tr" + i },
        R("rect", { x: -20 - i * 40, y: steps + i * 46, width: W + 40 + i * 80, height: 46, fill: rgba(theme.rule, 0.28 + i * 0.06) }),
        R("line", { x1: -20 - i * 40, y1: steps + i * 46, x2: W + 20 + i * 40, y2: steps + i * 46, stroke: rgba(tint, 0.5), strokeWidth: 5 })));
      out.push(R("g", { key: "stps" }, treads));
      out.push(R("g", { key: "plinth", transform: "translate(200," + (steps + 40) + ")" },
        R("path", { d: "M -80 0 h 160 v -190 h -160 z", fill: rgba(theme.surface, inv ? 0.4 : 0.94), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
        R("rect", { x: -56, y: -160, width: 112, height: 96, rx: 4, fill: rgba(theme.accent, 0.2) }),
        R("rect", { x: -42, y: -140, width: 84, height: 12, rx: 4, fill: rgba(theme.accent, 0.7) }),
        R("rect", { x: -42, y: -114, width: 56, height: 9, rx: 4, fill: rgba(tint, 0.45) })));
      const figures = [0, 1].map((i) => {
        const fx = ((i ? -1 : 1) * (t * (24 + i * 14)) % (W + 400) + W + 400) % (W + 400) - 200;
        const bob = Math.abs(Math.sin(t * (2.6 + i))) * 5;
        return R("g", { key: "fg" + i, opacity: 0.36, transform: "translate(" + fx.toFixed(1) + "," + (steps + 40 - bob).toFixed(1) + ")" },
          R("circle", { cx: 0, cy: -160, r: 28, fill: rgba(tint, 0.72) }),
          R("path", { d: "M -28 -132 h 56 l -10 132 h -36 z", fill: rgba(tint, 0.72) }));
      });
      out.push(R("g", { key: "figs" }, figures));

      /* near: gulls crossing high */
      const gulls = [0, 1, 2].map((i) => {
        const gc = ((t + i * 6) % 24) / 24;
        const gx = W + 60 - gc * (W + 220), gy = 230 + Math.sin(gc * Math.PI * 3 + i) * 60;
        const flap = Math.sin(t * 6 + i * 2) * 0.85;
        return R("path", { key: "gu" + i, d: "M -28 0 q 14 " + (-19 - flap * 16).toFixed(1) + " 28 0 q 14 " + (-19 + flap * 16).toFixed(1) + " 28 0", fill: "none", stroke: rgba(tint, 0.4), strokeWidth: 4, strokeLinecap: "round", transform: "translate(" + gx.toFixed(1) + "," + gy.toFixed(1) + ")" });
      });
      out.push(R("g", { key: "gls" }, gulls));

      return R("g", null, out);
    },
  });

  /* ── 48 BOLD CLAIM — a printing stone under a rolling press ── */
  FilmKit.make({
    global: "BoldClaim", brand: "Bold Claim", desk: "#0a0a0b", ambient: 1.7, chrome: false,
    FH: '"Passion One", system-ui, sans-serif', FB: '"Be Vietnam Pro", system-ui, sans-serif', FM: '"IBM Plex Mono", monospace',
    titlePreset: "slam", itemPreset: "slam", titleLine: 0.94, titleSpace: "-0.02em",
    /* ladder: bg .03 / surface .08 / rule .16 / inkMuted .42 / ink .92 / accent .58 / accent2 .46 */
    palette: (t) => ({ bg: t.bg || "#101012", surface: "#1a1a1e", rule: "#2d2d33", inkMuted: "#8c8c94", ink: "#f7f7f9", accent: t.accent || "#ffe14c", accent2: t.accent2 || "#4c9bff", accentInk: "#0b0b0d" }),
    tweaks: [{ k: "bg", label: "Press", options: ["#101012", "#121215", "#0e0e10"] }, { k: "accent", label: "Yellow", options: ["#ffe14c", "#ff4c7a", "#4cff9b"] }, { k: "accent2", label: "Second", options: ["#4c9bff", "#9b4cff", "#ff9b4c"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(84% 44% at 50% 98%, " + rgba(theme.accent, 0.16) + " 0%, transparent 58%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" }, R2("rect", { x: 3, y: 8, width: 18, height: 8, rx: 2 }), R2("path", { d: "M7 8V4h10v4M7 16v4h10v-4" })),
    cams: ["slamR", "zoomIn", "spin", "slamL", "drop", "zoomOut"], camMul: 7, camOff: 4,
    mag: { rot: 1.1, skew: 3, driftX: 7, driftY: 8, driftZ: 0.05, slide: 0.32, inn: 0.14, zin: 0.42, zout: 0.34 },
    variants: { Scroll: "board", Typing: "typewriter", Ring: "ring" },
    look: LOOK({ h: 128, upper: true, kicker: { v: "tag", bg: "accent", c: "accentInk" }, sBg: "accent", sFg: "accentInk", qlh: 1.0, alt: true, swap: "quote", card: "glow", chip: "square", r: 6, cBg: "ink", cFg: "accentInk", btn: "glow", btnBg: "accent", btnC: "accentInk", logo: "rounded", glow: true }),
    /* WORLD — a letterpress shop at proof. Overhead: a shaft-and-belt drive and a
       row of galley trays. Margin: the stone with a cylinder rolling across it on
       a 6s cycle, inked type beneath, a sheet peeling away after each pass.
       Floor: a type case, an ink drum, a stack of proofs. Near: ink flecks. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.accentInk : theme.inkMuted, bench = H - 290;
      const cyc = (t % 6) / 6;
      const roll = cyc < 0.55 ? E.inOut(cyc / 0.55) : 1 - E.inOut((cyc - 0.55) / 0.45);
      const peel = cyc > 0.58 ? Math.min(1, (cyc - 0.58) / 0.3) : 0;
      const belt = (t * 120) % 60;
      const out = [];

      out.push(R("defs", { key: "d" },
        R("pattern", { id: "bc-grid", width: 60, height: 60, patternUnits: "userSpaceOnUse" },
          R("path", { d: "M60 0H0v60", fill: "none", stroke: rgba(theme.rule, inv ? 0.5 : 0.8), strokeWidth: 2 }))));
      out.push(R("rect", { key: "gd", x: 0, y: 0, width: W, height: bench, fill: "url(#bc-grid)", opacity: 0.6 }));

      /* overhead: a line shaft with belts, and galley trays */
      out.push(R("line", { key: "shaft", x1: -20, y1: 90, x2: W + 20, y2: 90, stroke: rgba(tint, 0.6), strokeWidth: 16, strokeLinecap: "round" }));
      const pulleys = [0, 1, 2, 3].map((i) => R("g", { key: "pu" + i, transform: "translate(" + (170 + i * 250) + ",90) rotate(" + ((t * 200) % 360).toFixed(1) + ")" },
        R("circle", { r: 34, fill: "none", stroke: rgba(theme.accent, 0.7), strokeWidth: 8 }),
        R("path", { d: "M -34 0 h 68 M 0 -34 v 68", stroke: rgba(theme.accent, 0.4), strokeWidth: 5 })));
      out.push(R("g", { key: "pus" }, pulleys));
      const belts = [0, 1, 2, 3].map((i) => R("path", { key: "bt" + i, d: "M " + (140 + i * 250) + " 120 v 130 M " + (200 + i * 250) + " 120 v 130", stroke: rgba(tint, 0.35), strokeWidth: 6, strokeDasharray: "20 14", strokeDashoffset: -belt }));
      out.push(R("g", { key: "bts" }, belts));
      const galleys = [0, 1, 2, 3, 4].map((i) => R("g", { key: "gy" + i, transform: "translate(" + (110 + i * 210) + ",250)" },
        R("rect", { x: -84, y: -8, width: 168, height: 40, rx: 4, fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 4 }),
        R("rect", { x: -68, y: 2, width: 100 - (i % 3) * 24, height: 18, rx: 2, fill: rgba(i % 2 ? theme.accent : theme.accent2, 0.5) })));
      out.push(R("g", { key: "gys", opacity: 0.8 }, galleys));

      /* margin: the stone, the rolling cylinder and the peeling sheet */
      const typeRows = [0, 1, 2, 3, 4].map((i) => R("rect", { key: "ty" + i, x: -96, y: -80 + i * 34, width: 190 - (i % 3) * 44, height: 22, rx: 2, fill: rgba(theme.accent, 0.42) }));
      out.push(R("g", { key: "stone", transform: "translate(" + (W - 150) + ",1180)" },
        R("rect", { x: -130, y: -200, width: 260, height: 400, rx: 8, fill: rgba(theme.surface, 0.95), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
        R("rect", { x: -110, y: -120, width: 220, height: 250, rx: 4, fill: rgba(theme.accentInk, 0.6) }),
        typeRows,
        R("g", { transform: "translate(0," + (-110 + roll * 240).toFixed(1) + ")" },
          R("rect", { x: -122, y: -20, width: 244, height: 40, rx: 20, fill: rgba(theme.rule, 0.95), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("g", { transform: "rotate(" + (roll * 720).toFixed(1) + ")" },
            R("path", { d: "M -14 0 h 28", stroke: rgba(theme.accent, 0.8), strokeWidth: 6 }))),
        R("path", { d: "M -110 " + (130 - peel * 200).toFixed(1) + " h 220 l " + (-30 * peel).toFixed(1) + " " + (-60 * peel).toFixed(1) + " h -" + (220 - 60 * peel).toFixed(1) + " z", fill: rgba(theme.ink, 0.9 * peel), stroke: rgba(tint, 0.3 * peel), strokeWidth: 3 }),
        R("rect", { x: -110, y: 148, width: 220, height: 40, rx: 6, fill: rgba(theme.accent2, 0.4) })));

      /* clerestory windows high on the wall, and an inspection lamp */
      const cler = [0, 1, 2, 3].map((i) => R("g", { key: "cw" + i, transform: "translate(" + (160 + i * 250) + ",330)" },
        R("rect", { x: -78, y: -60, width: 156, height: 120, rx: 5, fill: rgba(theme.accent2, 0.14), stroke: rgba(tint, 0.4), strokeWidth: 5 }),
        R("line", { x1: 0, y1: -60, x2: 0, y2: 60, stroke: rgba(tint, 0.25), strokeWidth: 4 }),
        R("path", { d: "M -78 60 L -30 " + (bench - 390) + " L 130 " + (bench - 390) + " L 78 60 Z", fill: rgba(theme.accent2, 0.03) })));
      out.push(R("g", { key: "clers", opacity: 0.7 }, cler));
      out.push(R("g", { key: "insp", transform: "translate(" + (W * 0.78) + ",150) rotate(" + (Math.sin(t * 0.8) * 2.2).toFixed(2) + ")" },
        R("line", { x1: 0, y1: 0, x2: 0, y2: 120, stroke: rgba(tint, 0.45), strokeWidth: 4 }),
        R("path", { d: "M -54 120 h 108 l -22 48 h -64 z", fill: rgba(theme.rule, 0.9), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
        R("circle", { cx: 0, cy: 180, r: 17, fill: rgba(theme.accent, 0.85) }),
        R("circle", { cx: 0, cy: 180, r: 70, fill: rgba(theme.accent, 0.07) })));

      /* a composing stick with type being set, one slug at a time */
      const setCount = 3 + (Math.floor(t / 1.4) % 6);
      const slugs = [];
      for (let i = 0; i < setCount; i++) slugs.push(R("rect", { key: "sg" + i, x: -132 + i * 34, y: -22, width: 28, height: 44, rx: 2, fill: rgba(theme.accent, 0.62), stroke: rgba(tint, 0.3), strokeWidth: 2 }));
      out.push(R("g", { key: "stick", transform: "translate(" + (W - 168) + ",1520)" },
        R("path", { d: "M -150 34 h 300 v -12 h -300 z", fill: rgba(theme.rule, 0.9) }),
        R("path", { d: "M -150 34 v -80 M 150 34 v -80", stroke: rgba(tint, 0.5), strokeWidth: 8 }),
        slugs));

      /* a chase locked up with quoins, in the margin */
      out.push(R("g", { key: "chase", opacity: 0.78, transform: "translate(190,1440)" },
        R("rect", { x: -130, y: -110, width: 260, height: 220, rx: 4, fill: "none", stroke: rgba(tint, 0.55), strokeWidth: 8 }),
        R("rect", { x: -96, y: -78, width: 160, height: 156, rx: 2, fill: rgba(theme.accentInk, 0.5) }),
        R("g", null, [0, 1, 2, 3].map((i) => R("rect", { key: "tr" + i, x: -84, y: -62 + i * 36, width: 130 - (i % 3) * 32, height: 22, rx: 2, fill: rgba(theme.accent, 0.5) }))),
        R("g", null, [0, 1].map((i) => R("path", { key: "qn" + i, d: "M 70 " + (-70 + i * 100) + " h " + (46 + Math.sin(t * 0.9 + i) * 6).toFixed(1) + " l -14 34 h -32 z", fill: rgba(theme.accent2, 0.7) })))));

      /* a treadle press working the floor */
      out.push((function () {
        const cy2 = (t % 3) / 3;
        const stroke = Math.sin(cy2 * Math.PI * 2);
        return R("g", { key: "treadle", transform: "translate(" + (W * 0.45) + "," + (H - 60) + ") scale(0.82)" },
          R("path", { d: "M -90 0 h 180 l -20 -40 h -140 z", fill: rgba(theme.rule, 0.85), stroke: rgba(tint, 0.4), strokeWidth: 5 }),
          R("g", { transform: "translate(-56,-160) rotate(" + (cy2 * 360).toFixed(1) + ")" },
            R("circle", { r: 58, fill: "none", stroke: rgba(theme.accent2, 0.7), strokeWidth: 9 }),
            R("path", { d: "M -58 0 h 116 M 0 -58 v 116", stroke: rgba(theme.accent2, 0.4), strokeWidth: 6 })),
          R("line", { x1: -56, y1: -160, x2: -20, y2: (-40 + stroke * 18).toFixed(1), stroke: rgba(tint, 0.55), strokeWidth: 7 }),
          R("path", { d: "M 20 -300 h 90 v " + (150 + stroke * 40).toFixed(1) + " h -90 z", fill: rgba(theme.accent, 0.5), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("path", { d: "M 10 -320 h 110", stroke: rgba(tint, 0.5), strokeWidth: 8, strokeLinecap: "round" }));
      })());

      /* floor: a type case, an ink drum, a stack of proofs */
      out.push(R("line", { key: "bl", x1: 0, y1: bench, x2: W, y2: bench, stroke: rgba(tint, 0.6), strokeWidth: 8 }));
      out.push(R("rect", { key: "br", x: 0, y: bench, width: W, height: H - bench, fill: rgba(theme.surface, 0.5) }));
      const cells = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) cells.push(R("rect", { key: "cl" + r + c, x: -160 + c * 54, y: -100 + r * 34, width: 46, height: 26, rx: 2, fill: rgba((r + c) % 4 === 0 ? theme.accent : theme.rule, 0.55) }));
      out.push(R("g", { key: "case", transform: "translate(200," + (bench + 120) + ")" },
        R("rect", { x: -176, y: -116, width: 352, height: 128, rx: 5, fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 5 }),
        cells));
      out.push(R("g", { key: "drum", transform: "translate(" + (W * 0.56) + "," + (H - 70) + ")" },
        R("path", { d: "M -54 0 h 108 v -120 h -108 z", fill: rgba(theme.accent2, 0.35), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
        R("ellipse", { cx: 0, cy: -120, rx: 54, ry: 15, fill: rgba(theme.accent2, 0.55), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
        R("rect", { x: -34, y: -70, width: 68, height: 14, rx: 6, fill: rgba(theme.accent, 0.6) })));
      const proofs = [0, 1, 2, 3, 4].map((i) => R("rect", { key: "pf" + i, x: -100 + (i % 2) * 10, y: -i * 16, width: 200 - (i % 2) * 18, height: 13, rx: 2, fill: rgba(theme.ink, 0.85), stroke: rgba(tint, 0.3), strokeWidth: 2 }));
      out.push(R("g", { key: "prfs", transform: "translate(" + (W * 0.8) + "," + (H - 60) + ") rotate(-2)" }, proofs));

      /* near: ink flecks */
      const flecks = [0, 1, 2, 3, 4, 5].map((i) => {
        const ph = (t * (0.34 + i * 0.06) + i * 0.2) % 1;
        return R("circle", { key: "fk" + i, cx: 180 + i * 160 + Math.sin(t * 1.8 + i) * 40, cy: bench - ph * 620, r: 3 + (i % 3) * 2, fill: rgba(theme.accent, 0.34 * (1 - ph)) });
      });
      out.push(R("g", { key: "fks" }, flecks));

      return R("g", null, out);
    },
  });

  /* ── 49 NO COMMENT — a shutter coming down over a frontage ── */
  FilmKit.make({
    global: "NoComment", brand: "No Comment", desk: "#12100e", ambient: 1.65, chrome: false,
    FH: '"Alfa Slab One", Georgia, serif', FB: '"Wix Madefor Text", system-ui, sans-serif', FM: '"IBM Plex Mono", monospace',
    titlePreset: "slam", itemPreset: "stamp", titleLine: 1.0, titleSpace: "-0.015em",
    /* ladder: bg .86 / surface .96 / rule .73 / inkMuted .43 / ink .07 / accent .46 / accent2 .38 */
    palette: (t) => ({ bg: t.bg || "#ece8e1", surface: "#fbf9f5", rule: "#c9c2b6", inkMuted: "#6d675e", ink: "#151310", accent: t.accent || "#c94f2f", accent2: t.accent2 || "#2f4f5f", accentInk: "#fbf9f5" }),
    tweaks: [{ k: "bg", label: "Wall", options: ["#ece8e1", "#eeeae3", "#e8e4dd"] }, { k: "accent", label: "Rust", options: ["#c94f2f", "#2f7fc9", "#7fc92f"] }, { k: "accent2", label: "Second", options: ["#2f4f5f", "#5f2f4f", "#4f5f2f"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "linear-gradient(180deg, " + rgba(theme.surface, 0.94) + " 0%, " + bg + " 46%, " + rgba(theme.rule, 0.5) + " 100%)"),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.6, strokeLinecap: "round" }, R2("path", { d: "M4 4h16M4 9h16M4 14h16M4 19h16" })),
    cams: ["drop", "slamL", "zoomIn", "pushD", "slamR", "zoomOut"], camMul: 1, camOff: 5,
    mag: { rot: 0.6, driftX: 6, driftY: 9, driftZ: 0.045, slide: 0.3, inn: 0.16, zin: 0.38, zout: 0.32 },
    variants: { Scroll: "feed", Typing: "hand", Ring: "bar" },
    look: LOOK({ h: 120, upper: false, kicker: { v: "square", bg: "accent", c: "accentInk" }, sBg: "ink", sFg: "surface", qlh: 1.06, swap: "body", card: "frame", chip: "square", r: 4, cBg: "accent", cFg: "accentInk", btn: "block", btnBg: "ink", btnC: "accentInk", logo: "rounded" }),
    /* WORLD — a shuttered frontage. Overhead: a fascia sign and a lamp on a bracket.
       Margin: the shutter running down and up on a 13s cycle, slats accumulating,
       the drum turning, a padlock swinging at the foot. Floor: pavement, a
       discarded flyer, a bollard. Near: grit blowing past. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, pave = H - 280;
      const cyc = (t % 13) / 13;
      const down = cyc < 0.45 ? E.inOut(cyc / 0.45) : cyc < 0.62 ? 1 : 1 - E.inOut((cyc - 0.62) / 0.38);
      const closed = down > 0.96 ? 1 : 0;
      const out = [];

      out.push(R("defs", { key: "d" },
        R("pattern", { id: "nc-brick", width: 130, height: 46, patternUnits: "userSpaceOnUse" },
          R("path", { d: "M0 45h130M96 0v46", stroke: rgba(theme.rule, inv ? 0.26 : 0.7), strokeWidth: 2 }))));
      out.push(R("rect", { key: "bk", x: 0, y: 0, width: W, height: H, fill: "url(#nc-brick)" }));

      /* overhead: a fascia sign and a lamp on a bracket */
      out.push(R("g", { key: "fascia" },
        R("rect", { x: -20, y: 40, width: W + 40, height: 130, rx: 6, fill: rgba(theme.accent2, 0.45), stroke: rgba(tint, 0.4), strokeWidth: 5 }),
        R("rect", { x: 70, y: 78, width: 380, height: 24, rx: 8, fill: rgba(theme.surface, 0.72) }),
        R("rect", { x: 70, y: 118, width: 220, height: 18, rx: 8, fill: rgba(theme.surface, 0.42) }),
        R("rect", { x: W - 250, y: 78, width: 170, height: 58, rx: 6, fill: rgba(theme.accent, 0.62) })));
      out.push(R("g", { key: "lamp", transform: "translate(" + (W - 190) + ",180) rotate(" + (Math.sin(t * 0.9) * 1.6).toFixed(2) + ")" },
        R("path", { d: "M 0 0 h 96", stroke: rgba(tint, 0.55), strokeWidth: 7 }),
        R("path", { d: "M 60 0 q 36 0 36 34", fill: "none", stroke: rgba(tint, 0.45), strokeWidth: 5 }),
        R("path", { d: "M 62 34 h 68 l -16 44 h -36 z", fill: rgba(theme.accent, 0.55) }),
        R("circle", { cx: 96, cy: 88, r: 14 + Math.sin(t * 1.5) * 2, fill: rgba(theme.accent, 0.8) })));

      /* margin: the shutter, its drum and a padlock */
      const slatCount = Math.max(0, Math.round(down * 11));
      const slats = [];
      for (let i = 0; i < slatCount; i++) slats.push(R("rect", { key: "sl" + i, x: -116, y: -166 + i * 38, width: 232, height: 32, rx: 5, fill: rgba(theme.rule, 0.9), stroke: rgba(tint, 0.35), strokeWidth: 3 }));
      out.push(R("g", { key: "shut", transform: "translate(" + (W - 150) + ",1190)" },
        R("rect", { x: -128, y: -200, width: 256, height: 420, rx: 6, fill: rgba(theme.accentInk, 0.12), stroke: rgba(tint, 0.5), strokeWidth: 6 }),
        R("g", { transform: "translate(0,-196) rotate(" + (down * 620).toFixed(1) + ")" },
          R("circle", { r: 26, fill: rgba(theme.accent, 0.7), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
          R("path", { d: "M -26 0 h 52", stroke: rgba(theme.accentInk, 0.4), strokeWidth: 5 })),
        slats,
        R("rect", { x: -122, y: 206, width: 244, height: 18, rx: 5, fill: rgba(tint, 0.6) }),
        R("g", { transform: "translate(0,214) rotate(" + (Math.sin(t * 1.7) * (closed ? 12 : 3)).toFixed(2) + ")" },
          R("path", { d: "M -14 26 q 14 -22 28 0", fill: "none", stroke: rgba(tint, 0.6), strokeWidth: 6 }),
          R("rect", { x: -18, y: 26, width: 36, height: 30, rx: 5, fill: rgba(theme.accent2, 0.8) }))));

      /* a row of first-floor windows above the fascia, blinds part-drawn */
      const upper = [0, 1, 2, 3].map((i) => R("g", { key: "uw" + i, transform: "translate(" + (150 + i * 250) + ",190)" },
        R("rect", { x: -74, y: 0, width: 148, height: 190, rx: 5, fill: rgba(theme.accent2, 0.16), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
        R("line", { x1: 0, y1: 0, x2: 0, y2: 190, stroke: rgba(tint, 0.3), strokeWidth: 4 }),
        R("rect", { x: -68, y: 6, width: 136, height: 40 + ((i * 37) % 4) * 26, rx: 4, fill: rgba(tint, 0.4) }),
        R("rect", { x: -84, y: 190, width: 168, height: 14, rx: 4, fill: rgba(tint, 0.5) })));
      out.push(R("g", { key: "uws", opacity: 0.62 }, upper));

      /* a trade sign on a bracket, swinging */
      out.push(R("g", { key: "trade", transform: "translate(" + (W * 0.24) + ",190)" },
        R("path", { d: "M 0 0 h 120 M 96 0 v 26", stroke: rgba(tint, 0.55), strokeWidth: 7 }),
        R("g", { transform: "translate(96,26) rotate(" + (Math.sin(t * 0.85) * 5).toFixed(2) + ")" },
          R("path", { d: "M -70 0 h 140 v 96 l -70 34 l -70 -34 z", fill: rgba(theme.accent, 0.7), stroke: rgba(tint, 0.35), strokeWidth: 4 }),
          R("rect", { x: -44, y: 28, width: 88, height: 14, rx: 7, fill: rgba(theme.accentInk, 0.45) }),
          R("rect", { x: -30, y: 56, width: 60, height: 10, rx: 5, fill: rgba(theme.accentInk, 0.28) }))));

      /* a doorway with a letter slot, and a wheelie bin */
      out.push(R("g", { key: "door", opacity: 0.78, transform: "translate(200,1560)" },
        R("rect", { x: -96, y: -220, width: 192, height: 340, rx: 5, fill: rgba(theme.accent2, 0.24), stroke: rgba(tint, 0.5), strokeWidth: 6 }),
        R("rect", { x: -70, y: -190, width: 140, height: 90, rx: 4, fill: rgba(theme.accentInk, 0.2) }),
        R("rect", { x: -50, y: -50, width: 100, height: 16, rx: 6, fill: rgba(theme.accent, 0.7) }),
        R("circle", { cx: 62, cy: -14, r: 11, fill: rgba(theme.accent2, 0.85) }),
        R("g", { transform: "translate(0," + (-36 + Math.abs(Math.sin(t * 0.5)) * 8).toFixed(1) + ")" },
          R("rect", { x: -34, y: -12, width: 68, height: 24, rx: 3, fill: rgba(theme.surface, inv ? 0.5 : 0.94), stroke: rgba(tint, 0.3), strokeWidth: 2 }))));
      out.push(R("g", { key: "bin", transform: "translate(" + (W - 170) + ",1560)" },
        R("path", { d: "M -74 0 h 148 l -14 -170 h -120 z", fill: rgba(theme.accent2, 0.4), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
        R("g", { transform: "rotate(" + (-6 - Math.sin(t * 0.6) * 4).toFixed(2) + " -88 -170)" },
          R("path", { d: "M -88 -170 h 176 l -8 -26 h -160 z", fill: rgba(theme.accent2, 0.62), stroke: rgba(tint, 0.45), strokeWidth: 5 })),
        R("circle", { cx: -46, cy: 14, r: 18, fill: rgba(theme.ink, 0.55) }),
        R("circle", { cx: 46, cy: 14, r: 18, fill: rgba(theme.ink, 0.55) })));

      /* a lamp post, a puddle catching it, and a passer-by */
      out.push(R("g", { key: "post", transform: "translate(" + (W * 0.76) + "," + (H - 60) + ")" },
        R("path", { d: "M -30 0 h 60 l -10 -34 h -40 z", fill: rgba(tint, 0.6) }),
        R("line", { x1: 0, y1: -34, x2: 0, y2: -520, stroke: rgba(tint, 0.55), strokeWidth: 12 }),
        R("path", { d: "M 0 -520 q 0 -50 -56 -50", fill: "none", stroke: rgba(tint, 0.5), strokeWidth: 9 }),
        R("path", { d: "M -92 -570 h 72 l -16 54 h -40 z", fill: rgba(theme.accent, 0.55) }),
        R("circle", { cx: -56, cy: -502, r: 20 + Math.sin(t * 1.4) * 2, fill: rgba(theme.accent, 0.7) })));
      out.push(R("g", { key: "puddle", opacity: 0.5, transform: "translate(" + (W * 0.7) + "," + (H - 40) + ")" },
        R("ellipse", { cx: 0, cy: 0, rx: 110, ry: 24, fill: rgba(theme.accent2, 0.3) }),
        R("ellipse", { cx: -20, cy: -2, rx: 34 + Math.sin(t * 1.2) * 5, ry: 8, fill: rgba(theme.accent, 0.35) })));
      out.push((function () {
        const pc = ((t * 22) % (W + 400)) - 200;
        const bob = Math.abs(Math.sin(t * 2.4)) * 6;
        return R("g", { key: "walker", opacity: 0.34, transform: "translate(" + pc.toFixed(1) + "," + (H - 56 - bob).toFixed(1) + ")" },
          R("circle", { cx: 0, cy: -168, r: 29, fill: rgba(tint, 0.72) }),
          R("path", { d: "M -29 -140 h 58 l -11 140 h -36 z", fill: rgba(tint, 0.72) }));
      })());

      /* floor: pavement, a discarded flyer, a bollard */
      out.push(R("line", { key: "pl", x1: 0, y1: pave, x2: W, y2: pave, stroke: rgba(tint, 0.6), strokeWidth: 8 }));
      out.push(R("rect", { key: "pr", x: 0, y: pave, width: W, height: H - pave, fill: rgba(theme.rule, 0.34) }));
      const flags = [];
      for (let i = 0; i < 5; i++) flags.push(R("line", { key: "fg" + i, x1: 60 + i * 220, y1: pave, x2: 60 + i * 220, y2: H, stroke: rgba(tint, 0.28), strokeWidth: 4 }));
      out.push(R("g", { key: "flags" }, flags));
      out.push(R("g", { key: "flyer", transform: "translate(" + (W * 0.3) + "," + (H - 90) + ") rotate(" + (-10 + Math.sin(t * 0.9) * 3).toFixed(2) + ")" },
        R("rect", { x: -66, y: -46, width: 132, height: 92, rx: 3, fill: rgba(theme.surface, inv ? 0.5 : 0.94), stroke: rgba(tint, 0.3), strokeWidth: 2 }),
        R("rect", { x: -46, y: -26, width: 92, height: 14, rx: 3, fill: rgba(theme.accent, 0.7) }),
        R("rect", { x: -46, y: 2, width: 60, height: 9, rx: 3, fill: rgba(tint, 0.4) })));
      out.push(R("g", { key: "bollard", transform: "translate(" + (W * 0.56) + "," + (H - 60) + ")" },
        R("path", { d: "M -26 0 h 52 v -150 a 26 26 0 0 0 -52 0 z", fill: rgba(theme.accent2, 0.55), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
        R("rect", { x: -26, y: -110, width: 52, height: 16, rx: 4, fill: rgba(theme.accent, 0.75) })));

      /* near: grit blowing past */
      const grit = [0, 1, 2, 3, 4, 5, 6].map((i) => {
        const ph = (t * (0.5 + i * 0.1) + i * 0.15) % 1;
        return R("circle", { key: "gt" + i, cx: -40 + ph * (W + 80), cy: pave - 30 - Math.sin(ph * Math.PI * 2 + i) * 60, r: 3 + (i % 2) * 2, fill: rgba(tint, 0.3 * (1 - Math.abs(ph - 0.5) * 1.4)) });
      });
      out.push(R("g", { key: "grits" }, grit));

      return R("g", null, out);
    },
  });

  /* ── 50 LAST WORD — a bell on a rope, rung and left to ring ── */
  FilmKit.make({
    global: "LastWord", brand: "Last Word", desk: "#14100a", ambient: 1.4, chrome: false,
    FH: '"Abril Fatface", Georgia, serif', FB: '"Lora", Georgia, serif', FM: '"IBM Plex Mono", monospace',
    titlePreset: "drowse", itemPreset: "rise", titleLine: 1.02, titleSpace: "-0.02em",
    /* ladder: bg .87 / surface .96 / rule .74 / inkMuted .44 / ink .07 / accent .34 / accent2 .5 */
    palette: (t) => ({ bg: t.bg || "#f0ece3", surface: "#fbf9f4", rule: "#cbc4b5", inkMuted: "#6e675c", ink: "#16130d", accent: t.accent || "#7a2f2f", accent2: t.accent2 || "#b08c3a", accentInk: "#fbf9f4" }),
    tweaks: [{ k: "bg", label: "Page", options: ["#f0ece3", "#f2eee6", "#ebe7de"] }, { k: "accent", label: "Oxblood", options: ["#7a2f2f", "#2f4f7a", "#4f7a2f"] }, { k: "accent2", label: "Gilt", options: ["#b08c3a", "#8c3ab0", "#3ab08c"] }],
    groundCss: (theme, bg) => (bg !== theme.bg ? bg : "radial-gradient(100% 54% at 50% 2%, " + rgba(theme.surface, 0.96) + " 0%, transparent 58%), " + bg),
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" }, R2("path", { d: "M12 3a6 6 0 016 6v7H6V9a6 6 0 016-6z" }), R2("path", { d: "M10 19h4" })),
    cams: ["zoomIn", "pushU", "drop", "pushL", "zoomOut", "pushR"], camMul: 5, camOff: 1,
    mag: { rot: 0.25, driftX: 5, driftY: 7, driftZ: 0.045, slide: 0.2, inn: 0.24, zin: 0.3, zout: 0.28 },
    variants: { Scroll: "board", Typing: "caret", Ring: "gauge" },
    look: LOOK({ h: 118, kicker: { v: "bare", c: "accent" }, sBg: "accent", sFg: "accentInk", qlh: 1.08, swap: "quote", card: "paper", chip: "outline", r: 6, cBg: "ink", cFg: "surface", btn: "pill", btnBg: "accent2", btnC: "ink", logo: "circle" }),
    /* WORLD — a belfry room. Overhead: a beamed frame and a louvre letting light in.
       Margin: the bell on its rope, rung every 8s — it swings, the clapper lags and
       strikes on the return, rings leaving the mouth. Floor: the rope coiled, a
       ledger on a stand, a stack of hymn boards. Near: dust in the louvre light. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, inv = theme.currentBg !== theme.bg;
      const tint = inv ? theme.surface : theme.inkMuted, floor = H - 290;
      const onAccent = theme.currentBg === theme.accent;
      const bellBody = onAccent ? theme.surface : theme.accent;
      const beat = Math.sin((t / 8) * Math.PI * 2);
      const swing = beat * 22;
      const clap = Math.sin((t / 8) * Math.PI * 2 - 0.7) * 30;
      const strike = Math.abs(beat) < 0.06 ? 1 : 0;
      const out = [];

      out.push(R("defs", { key: "d" },
        R("pattern", { id: "lw2-grain", width: 220, height: 12, patternUnits: "userSpaceOnUse" },
          R("path", { d: "M0 11h220", stroke: rgba(theme.rule, inv ? 0.24 : 0.6), strokeWidth: 2 })),
        R("linearGradient", { id: "lw2-light", x1: "0%", y1: "0%", x2: "50%", y2: "100%" },
          R("stop", { offset: "0%", stopColor: rgba(theme.accent2, 0.24) }),
          R("stop", { offset: "100%", stopColor: rgba(theme.accent2, 0) }))));
      out.push(R("rect", { key: "gr", x: 0, y: 0, width: W, height: H, fill: "url(#lw2-grain)" }));

      /* overhead: beams and a louvre throwing light */
      const beams = [0, 1].map((i) => R("rect", { key: "bm" + i, x: -20, y: 40 + i * 90, width: W + 40, height: 26, rx: 5, fill: rgba(tint, 0.5) }));
      out.push(R("g", { key: "bms", opacity: 0.7 }, beams));
      const struts = [0, 1, 2, 3, 4].map((i) => R("path", { key: "sr" + i, d: "M " + (80 + i * 220) + " 66 l 70 64 M " + (150 + i * 220) + " 66 l -70 64", stroke: rgba(tint, 0.34), strokeWidth: 5 }));
      out.push(R("g", { key: "srs" }, struts));
      const louvres = [];
      for (let i = 0; i < 7; i++) louvres.push(R("rect", { key: "lv" + i, x: 60, y: 168 + i * 22, width: 300, height: 13, rx: 4, fill: rgba(tint, 0.42) }));
      out.push(R("g", { key: "louv" }, louvres));
      out.push(R("path", { key: "shaft", d: "M 60 168 L 360 168 L 720 " + floor + " L 200 " + floor + " Z", fill: "url(#lw2-light)" }));

      /* margin: the bell on its rope */
      const rings = [0, 1, 2].map((i) => R("ellipse", { key: "rg" + i, cx: 0, cy: 150, rx: (90 + i * 50) * (0.6 + strike * 0.7), ry: (26 + i * 14) * (0.6 + strike * 0.7), fill: "none", stroke: rgba(theme.accent2, 0.55 * strike * (1 - i * 0.28)), strokeWidth: 5 }));
      out.push(R("g", { key: "bell", transform: "translate(" + (W - 160) + ",1120)" },
        R("line", { x1: 0, y1: -880, x2: 0, y2: -160, stroke: rgba(tint, 0.5), strokeWidth: 5 }),
        R("g", { transform: "rotate(" + swing.toFixed(2) + " 0 -160)" },
          R("rect", { x: -18, y: -170, width: 36, height: 34, rx: 8, fill: rgba(theme.accent2, 0.85) }),
          R("path", { d: "M -110 130 q 0 -300 110 -300 q 110 0 110 300 z", fill: rgba(bellBody, onAccent ? 0.5 : 0.78), stroke: rgba(tint, 0.45), strokeWidth: 5 }),
          R("path", { d: "M -110 130 h 220 l -14 34 h -192 z", fill: rgba(theme.accent2, 0.7) }),
          R("path", { d: "M -70 -80 q 70 -40 140 0", fill: "none", stroke: rgba(theme.accentInk, 0.16), strokeWidth: 8 }),
          R("g", { transform: "rotate(" + clap.toFixed(2) + " 0 -130)" },
            R("line", { x1: 0, y1: -130, x2: 0, y2: 90, stroke: rgba(theme.ink, 0.5), strokeWidth: 5 }),
            R("circle", { cx: 0, cy: 106, r: 22, fill: rgba(theme.ink, 0.72) }))),
        rings));

      /* a smaller bell hung on the frame, swinging against the beat */
      const smallSwing = Math.sin((t / 8) * Math.PI * 2 + 1.4) * 15;
      out.push(R("g", { key: "bell2", opacity: 0.72, transform: "translate(" + (W - 380) + ",250) rotate(" + smallSwing.toFixed(2) + " 0 0)" },
        R("rect", { x: -11, y: -14, width: 22, height: 22, rx: 5, fill: rgba(theme.accent2, 0.8) }),
        R("path", { d: "M -62 132 q 0 -164 62 -164 q 62 0 62 164 z", fill: rgba(bellBody, onAccent ? 0.42 : 0.5), stroke: rgba(tint, 0.42), strokeWidth: 4 }),
        R("path", { d: "M -62 132 h 124 l -9 20 h -106 z", fill: rgba(theme.accent2, 0.55) }),
        R("line", { x1: 0, y1: -30, x2: 0, y2: 116, stroke: rgba(theme.ink, 0.4), strokeWidth: 4 }),
        R("circle", { cx: 0, cy: 124, r: 13, fill: rgba(theme.ink, 0.6) })));

      /* a clock face set into the frame, hands turning */
      out.push(R("g", { key: "clock", transform: "translate(" + (W * 0.62) + ",190)" },
        R("circle", { r: 92, fill: rgba(theme.surface, inv ? 0.4 : 0.94), stroke: rgba(tint, 0.55), strokeWidth: 7 }),
        R("circle", { r: 74, fill: "none", stroke: rgba(tint, 0.25), strokeWidth: 3 }),
        R("g", null, [0, 1, 2, 3].map((i) => R("line", { key: "hm" + i, x1: Math.cos(i * 1.571) * 62, y1: Math.sin(i * 1.571) * 62, x2: Math.cos(i * 1.571) * 78, y2: Math.sin(i * 1.571) * 78, stroke: rgba(theme.accent, 0.6), strokeWidth: 5 }))),
        R("line", { x1: 0, y1: 0, x2: Math.cos(t * 0.09 - 1.57) * 42, y2: Math.sin(t * 0.09 - 1.57) * 42, stroke: rgba(tint, 0.8), strokeWidth: 7, strokeLinecap: "round" }),
        R("line", { x1: 0, y1: 0, x2: Math.cos(t * 1.05 - 1.57) * 66, y2: Math.sin(t * 1.05 - 1.57) * 66, stroke: rgba(theme.accent, 0.9), strokeWidth: 4, strokeLinecap: "round" }),
        R("circle", { r: 8, fill: rgba(theme.accent2, 0.9) })));

      /* a rope guide wheel and a nesting box, in the margin band */
      out.push(R("g", { key: "guide", transform: "translate(" + (W - 152) + ",1500) rotate(" + (beat * 90).toFixed(1) + ")" },
        R("circle", { r: 46, fill: "none", stroke: rgba(theme.accent2, 0.7), strokeWidth: 9 }),
        R("path", { d: "M -46 0 h 92 M 0 -46 v 92", stroke: rgba(theme.accent2, 0.4), strokeWidth: 6 }),
        R("circle", { r: 12, fill: rgba(tint, 0.6) })));
      out.push(R("g", { key: "nest", opacity: 0.7, transform: "translate(190,1330) rotate(-2)" },
        R("path", { d: "M -60 0 h 120 v -110 l -60 -34 l -60 34 z", fill: rgba(theme.surface, inv ? 0.4 : 0.9), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
        R("circle", { cx: 0, cy: -60, r: 20, fill: rgba(theme.accentInk, 0.42) }),
        R("path", { d: "M -22 -6 h 44", stroke: rgba(tint, 0.4), strokeWidth: 5 })));

      /* a trapdoor with a ladder up through it, and a broom */
      out.push(R("g", { key: "trap", transform: "translate(" + (W * 0.24) + "," + (H - 66) + ")" },
        R("path", { d: "M -120 0 h 240 l -34 -50 h -172 z", fill: rgba(theme.accentInk, 0.28), stroke: rgba(tint, 0.5), strokeWidth: 5 }),
        R("path", { d: "M -74 -50 L -46 -330 M 40 -50 L 12 -330", stroke: rgba(tint, 0.6), strokeWidth: 9, strokeLinecap: "round" }),
        R("g", null, [0, 1, 2, 3].map((i) => R("line", { key: "rg" + i, x1: -68 + i * 6, y1: -96 - i * 70, x2: 34 - i * 6, y2: -96 - i * 70, stroke: rgba(tint, 0.5), strokeWidth: 7 })))));
      out.push(R("g", { key: "broom", opacity: 0.75, transform: "translate(" + (W * 0.78) + "," + (H - 60) + ") rotate(10)" },
        R("line", { x1: 0, y1: 0, x2: -30, y2: -300, stroke: rgba(tint, 0.55), strokeWidth: 9, strokeLinecap: "round" }),
        R("path", { d: "M -14 -6 h 32 l 12 66 h -56 z", fill: rgba(theme.accent2, 0.55) }),
        R("g", null, [0, 1, 2, 3].map((i) => R("line", { key: "bs" + i, x1: -12 + i * 10, y1: 56, x2: -18 + i * 12, y2: 82, stroke: rgba(tint, 0.45), strokeWidth: 5, strokeLinecap: "round" })))));

      /* a swallow crossing the louvre light */
      out.push((function () {
        const sc = (t % 17) / 17;
        const sx = -60 + sc * (W + 140), sy = 420 + Math.sin(sc * Math.PI * 3) * 130;
        const flap = Math.sin(t * 8) * 0.85;
        return R("path", { key: "swal", d: "M -26 0 q 13 " + (-18 - flap * 15).toFixed(1) + " 26 0 q 13 " + (-18 + flap * 15).toFixed(1) + " 26 0", fill: "none", stroke: rgba(tint, 0.42), strokeWidth: 4, strokeLinecap: "round", transform: "translate(" + sx.toFixed(1) + "," + sy.toFixed(1) + ")" });
      })());

      /* floor: coiled rope, a ledger on a stand, hymn boards */
      out.push(R("line", { key: "fl", x1: 0, y1: floor, x2: W, y2: floor, stroke: rgba(tint, 0.55), strokeWidth: 8 }));
      out.push(R("rect", { key: "fr", x: 0, y: floor, width: W, height: H - floor, fill: rgba(theme.rule, 0.3) }));
      const coils = [0, 1, 2, 3].map((i) => R("ellipse", { key: "co" + i, cx: 0, cy: -i * 12, rx: 78 - i * 14, ry: 24 - i * 4, fill: "none", stroke: rgba(theme.accent2, 0.7), strokeWidth: 9 }));
      out.push(R("g", { key: "rope", transform: "translate(" + (W - 380) + "," + (H - 90) + ")" }, coils));
      const ledgerLines = [0, 1, 2, 3].map((i) => R("line", { key: "ll" + i, x1: -80, y1: -34 + i * 26, x2: 40 + (i % 2) * 40, y2: -34 + i * 26, stroke: rgba(tint, 0.34), strokeWidth: 4 }));
      out.push(R("g", { key: "ledger", transform: "translate(200," + (floor + 60) + ") rotate(-3)" },
        R("path", { d: "M -120 130 h 240 l -30 -40 h -180 z", fill: rgba(theme.surface, inv ? 0.42 : 0.92), stroke: rgba(tint, 0.45), strokeWidth: 4 }),
        R("rect", { x: -110, y: -80, width: 220, height: 170, rx: 4, fill: rgba(theme.surface, inv ? 0.5 : 0.97), stroke: rgba(tint, 0.4), strokeWidth: 4 }),
        ledgerLines));
      const boards = [0, 1, 2].map((i) => R("g", { key: "hb" + i, transform: "translate(" + (i * 96) + ",0) rotate(" + (-3 + i * 3) + ")" },
        R("rect", { x: -40, y: -120, width: 80, height: 120, rx: 3, fill: rgba(theme.ink, 0.78) }),
        R("rect", { x: -26, y: -96, width: 52, height: 16, rx: 3, fill: rgba(theme.accent2, 0.8) }),
        R("rect", { x: -26, y: -64, width: 52, height: 16, rx: 3, fill: rgba(theme.surface, 0.6) })));
      out.push(R("g", { key: "hbs", opacity: 0.85, transform: "translate(" + (W * 0.52) + "," + (H - 60) + ")" }, boards));

      /* near: dust in the louvre light */
      const dust = [0, 1, 2, 3, 4, 5, 6].map((i) => {
        const ph = (t * (0.08 + i * 0.02) + i * 0.16) % 1;
        return R("circle", { key: "du" + i, cx: 140 + i * 90 + Math.sin(t * 0.5 + i) * 34, cy: floor - ph * (floor - 200), r: 3 + (i % 3) * 2, fill: rgba(theme.accent2, 0.32 * (1 - ph)) });
      });
      out.push(R("g", { key: "dus" }, dust));

      return R("g", null, out);
    },
  });
})();
