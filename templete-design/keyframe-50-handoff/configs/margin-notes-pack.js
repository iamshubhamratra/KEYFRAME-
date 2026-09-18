/* margin-notes-pack.js — pack 01 of the article set: MARGIN NOTES.
   Cohort: technical / documentation. One FilmKit.make(cfg) call; palette, icon
   and World are pure and self-contained so gen-film-skins.js can carry them
   across verbatim. Hexes appear ONLY in palette(); look and World name slots. */
(function () {
  const R = React.createElement, rgba = FilmKit.rgba;

  FilmKit.make({
    global: "MarginNotes",
    brand: "Margin Notes",
    desk: "#0a0d10",
    ambient: 1.25,
    typeScale: "Default",
    /* No template lockup on any beat — the film shows the user's content only. */
    chrome: false,

    /* Type: geometric grotesque display over the IBM Plex pair.
       Scale ratio 1.25 — 34 / 42 / 53 / 66 / 84 / 105 / 118. */
    FH: '"Space Grotesk", "Helvetica Neue", sans-serif',
    FB: '"IBM Plex Sans", system-ui, sans-serif',
    FM: '"IBM Plex Mono", ui-monospace, monospace',
    titlePreset: "machete",
    itemPreset: "rise",
    titleLine: 1.06,
    titleSpace: "-0.015em",

    /* Luminance ladder, darkest to lightest: bg .02 / surface .05 / rule .11 /
       accent .44 / accent2 .47 / inkMuted .35 / ink .81. Contrast is carried by
       lightness distance, so a brand hue rotation holds AA at any angle. */
    palette: (t) => ({
      bg: t.bg || "#101418",
      surface: "#181f25",
      rule: "#2b363e",
      inkMuted: "#93a3ad",
      ink: "#e7eef3",
      accent: t.accent || "#4fb8e8",
      accent2: t.accent2 || "#f0a04b",
      accentInk: "#08131a",
    }),
    tweaks: [
      { k: "bg", label: "Page", options: ["#101418", "#12161a", "#0e1316"] },
      { k: "accent", label: "Accent", options: ["#4fb8e8", "#5ad1a0", "#8f9df0"] },
      { k: "accent2", label: "Figures", options: ["#f0a04b", "#e8697a", "#d8c96a"] },
    ],

    /* Margin mark: a bracket with a nib rule — the pack's own annotation glyph. */
    icon: (theme, fg, R2) => R2("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" },
      R2("path", { d: "M8 3H5v18h3M16 3h3v18h-3" }),
      R2("path", { d: "M12 8v8" })),

    cams: ["pushU", "zoomIn", "pushL", "drop", "pushR", "zoomOut"],
    camMul: 4, camOff: 2,
    mag: { rot: 0.3, skew: 0, driftX: 5, driftY: 6, driftZ: 0.03, slide: 0.2, inn: 0.2, zin: 0.34, zout: 0.26 },
    variants: { Typing: "terminal", Scroll: "board", Ring: "gauge" },

    look: {
      hook: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 300, size: 118, kicker: { v: "outline", c: "accent" } },
      statement: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 600, size: 132 },
      body: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 560, size: 76, bodySize: 38, ch: 50, lh: 1.52, weight: 450, dim: 0.92, kicker: { v: "bare", c: "accent" } },
      quote: { bg: "surface", fg: "ink", hi: "accent2", world: true, top: 360, size: 84, ch: 24, lh: 1.14, markSize: 200 },
      feature: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 250, size: 96, swap: "body", card: { v: "frame", bg: "surface", r: 14, line: "inkMuted" }, chips: { v: "outline", colors: ["accent", "accent2", "inkMuted"], text: "accentInk" } },
      montage: { bg: "surface", fg: "ink", hi: "accent", world: true, top: 330, size: 88, labelsOnly: true, tile: { bg: "bg", line: "inkMuted", label: "ink", r: 14, h: 640, labelSize: 42 }, tilts: [0, 0, 0, 0] },
      stats: { bg: "bg", fg: "ink", hi: "accent", world: true, top: 400, size: 92, cols: ["accent", "accent2", "ink"], num: 150, rule: true },
      cta: { bg: "accent", fg: "accentInk", hi: "surface", world: true, top: 460, size: 112, align: "left", btn: { v: "block", bg: "accentInk", c: "ink" }, logoShape: "rounded" },
      app: { bg: "bg", fg: "ink", hi: "accent", cardBg: "surface", line: "inkMuted", world: true },
    },

    /* WORLD — a drafting desk. Far: a crosshair grid on a slow drift, a warm
       glow and three baseline rules. Mid: the plotter pen rules the right margin
       on a 12s eased pendulum, laying an ink line and dropping a tick each time
       it passes a stop; a page stack drifts on parallax below; annotation
       brackets are made in sequence along the lower band; a scale bar tracks the
       carriage in counterpoint. Near: paper flecks and slivers. The carriage is
       confined to x 930-1050 and every added element sits below y=1400, so
       nothing crosses the text column. Tone-aware: on the accent CTA ground the
       structural lines flip to the dark slot. */
    World: (theme, t, p, u) => {
      const W = u.W, H = u.H, E = u.ease, cyc = (t % 12) / 12;
      const onAccent = theme.currentBg === theme.accent;
      const tint = onAccent ? theme.accentInk : theme.inkMuted;
      const rule = onAccent ? theme.accentInk : theme.rule;
      const tri = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;
      const trav = E.inOut(tri);
      const railX = W - 132, y0 = 250, y1 = H - 300;
      const car = y0 + (y1 - y0) * trav;
      const gearRot = trav * (y1 - y0) * 0.42;
      const sway = Math.sin(cyc * Math.PI * 2 - 0.7) * 7;
      const drift = Math.sin(t * 0.12) * 10;
      const stack = (t * 9) % 240;
      return R("g", null,
        R("defs", null,
          R("pattern", { id: "mn-grid", width: 90, height: 90, patternUnits: "userSpaceOnUse", patternTransform: "translate(0," + (-((t * 12) % 90)).toFixed(1) + ")" },
            R("path", { d: "M45 37v16M37 45h16", stroke: rgba(rule, onAccent ? 0.5 : 0.9), strokeWidth: 2 }),
            R("circle", { cx: 0, cy: 0, r: 2, fill: rgba(theme.accent, onAccent ? 0.3 : 0.22) })),
          R("radialGradient", { id: "mn-glow", cx: "50%", cy: "50%" },
            R("stop", { offset: "0%", stopColor: rgba(theme.accent, onAccent ? 0.18 : 0.1) }),
            R("stop", { offset: "100%", stopColor: rgba(theme.accent, 0) }))),
        R("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#mn-grid)" }),
        R("circle", { cx: W - 40, cy: 240, r: 380, fill: "url(#mn-glow)" }),
        R("g", { opacity: 0.55, transform: "translate(0," + drift.toFixed(2) + ")" },
          [0, 1, 2].map((i) => R("line", { key: "r" + i, x1: 0, y1: 520 + i * 430, x2: W, y2: 520 + i * 430, stroke: rgba(rule, 0.55), strokeWidth: 2 }))),
        /* page stack drifting on parallax */
        R("g", { opacity: 0.5, transform: "translate(" + (-stack * 0.5).toFixed(1) + ",0)" },
          [0, 1, 2, 3].map((i) => R("path", { key: "pg" + i, d: "M " + (60 + i * 300) + " " + (H - 120) + " v -" + (150 + (i % 2) * 90) + " h 210 v " + (150 + (i % 2) * 90) + " z", fill: "none", stroke: rgba(tint, 0.3), strokeWidth: 3 })),
          [0, 1, 2, 3].map((i) => R("line", { key: "pl" + i, x1: 84 + i * 300, y1: H - 200 - (i % 2) * 90, x2: 240 + i * 300, y2: H - 200 - (i % 2) * 90, stroke: rgba(tint, 0.22), strokeWidth: 3 }))),
        /* annotation brackets, made in sequence */
        [0, 1, 2].map((i) => {
          const ax = 130 + i * 300, ay = 1440 + (i % 2) * 110;
          const on = ((t * 0.5 + i * 0.33) % 1);
          const grow = E.outCubic(Math.min(1, on * 2.6));
          return R("g", { key: "an" + i, opacity: 0.34 + 0.46 * (1 - on) },
            R("path", { d: "M " + ax + " " + ay + " h -18 v " + (110 * grow).toFixed(1) + " h 18", fill: "none", stroke: rgba(theme.accent, 0.85), strokeWidth: 4, strokeLinecap: "round" }),
            R("line", { x1: ax + 12, y1: ay + 55, x2: ax + 12 + 150 * grow, y2: ay + 55, stroke: rgba(tint, 0.5), strokeWidth: 3 }),
            R("circle", { cx: ax + 20 + 150 * grow, cy: ay + 55, r: 4 + 5 * (1 - on), fill: rgba(theme.accent2, 0.9) }));
        }),
        /* scale bar tracking the carriage in counterpoint */
        R("g", { transform: "translate(0," + (H - 176) + ")" },
          R("line", { x1: 72, y1: 0, x2: W - 200, y2: 0, stroke: rgba(tint, 0.4), strokeWidth: 3 }),
          Array.from({ length: 12 }).map((_, i) => R("line", { key: "tk" + i, x1: 72 + i * 66, y1: 0, x2: 72 + i * 66, y2: i % 3 === 0 ? -22 : -12, stroke: rgba(tint, i % 3 === 0 ? 0.45 : 0.28), strokeWidth: 3 })),
          R("path", { d: "M -9 0 l 9 -16 l 9 16 z", fill: rgba(theme.accent, 0.9), transform: "translate(" + (72 + (1 - trav) * (W - 272)).toFixed(1) + ",0)" })),
        /* the rail, the ruled line, and the ticks it has dropped */
        R("line", { x1: railX, y1: y0 - 40, x2: railX, y2: y1 + 40, stroke: rgba(rule, 0.95), strokeWidth: 6, strokeLinecap: "round" }),
        R("line", { x1: railX + 46, y1: y0, x2: railX + 46, y2: car, stroke: rgba(theme.accent, 0.34), strokeWidth: 3 }),
        R("line", { x1: railX + 46, y1: car, x2: railX + 46, y2: Math.min(y1, car + 120), stroke: rgba(theme.accent, 0.1), strokeWidth: 3 }),
        [0, 1, 2, 3, 4, 5, 6].map((i) => {
          const ty = y0 + (y1 - y0) * (i / 6);
          return R("line", { key: "st" + i, x1: railX + 34, y1: ty, x2: railX + 58, y2: ty, stroke: rgba(theme.accent2, car > ty ? 0.75 : 0.16), strokeWidth: 4, strokeLinecap: "round" });
        }),
        /* the carriage */
        R("g", { transform: "translate(" + railX + "," + car.toFixed(2) + ")" },
          R("path", { d: "M -34 -46 L 30 -58 L 30 58 L -34 46 Z", fill: rgba(theme.surface, 0.95), stroke: rgba(tint, 0.5), strokeWidth: 2.5 }),
          R("path", { d: "M -34 -46 L 30 -58 L 30 -26 L -34 -16 Z", fill: rgba(theme.ink, 0.1) }),
          R("path", { d: "M -34 20 L 30 12 L 30 58 L -34 46 Z", fill: rgba(theme.accentInk, 0.35) }),
          R("g", { transform: "rotate(" + gearRot.toFixed(2) + ")" },
            R("circle", { r: 17, fill: "none", stroke: rgba(theme.accent, 0.7), strokeWidth: 4 }),
            [0, 1, 2, 3, 4, 5].map((i) => R("line", { key: "g" + i, x1: Math.cos(i * Math.PI / 3) * 17, y1: Math.sin(i * Math.PI / 3) * 17, x2: Math.cos(i * Math.PI / 3) * 25, y2: Math.sin(i * Math.PI / 3) * 25, stroke: rgba(theme.accent, 0.55), strokeWidth: 4, strokeLinecap: "round" }))),
          R("circle", { r: 5, fill: rgba(theme.accent2, 0.9) }),
          R("path", { d: "M 30 6 L 44 6 L 46 " + (6 + sway).toFixed(2) + " L 46 26", fill: "none", stroke: rgba(tint, 0.75), strokeWidth: 4, strokeLinecap: "round" }),
          R("path", { d: "M 42 26 L 50 26 L 46 44 Z", fill: rgba(onAccent ? theme.accentInk : theme.ink, 0.8) }),
          R("line", { x1: 46, y1: 44, x2: 46, y2: 52, stroke: rgba(theme.accent, 0.85), strokeWidth: 3, strokeLinecap: "round" }),
          R("path", { d: "M -34 -10 q " + (-40 + sway * 2).toFixed(2) + " 40 -26 96", fill: "none", stroke: rgba(rule, 0.85), strokeWidth: 4, strokeLinecap: "round" }),
          R("ellipse", { cx: -4, cy: 62, rx: 40, ry: 7, fill: rgba(theme.accentInk, 0.4) })),
        /* near plane */
        R("g", null,
          [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const ph = (t * (0.12 + i * 0.02) + i * 0.13) % 1;
            const x = 130 + i * 116 + Math.sin(t * 0.7 + i) * 30;
            const y = H - ph * (H + 140);
            return R("rect", { key: "f" + i, x: x, y: y, width: 8, height: 8, rx: 2, fill: rgba(tint, 0.26 * (1 - ph)), transform: "rotate(" + (ph * 260 + i * 40).toFixed(1) + " " + x.toFixed(1) + " " + y.toFixed(1) + ")" });
          }),
          [0, 1].map((i) => {
            const ph = (t * (0.3 + i * 0.09) + i * 0.5) % 1;
            const y = H - ph * (H + 220);
            return R("path", { key: "sl" + i, d: "M 0 0 l 30 -10 l 8 26 l -28 12 z", fill: rgba(theme.accent2, 0.2 * (1 - ph)), transform: "translate(" + (300 + i * 420) + "," + y.toFixed(1) + ") rotate(" + (ph * 300).toFixed(1) + ")" });
          })),
        /* registration mark */
        R("g", { opacity: 0.55, transform: "translate(" + (W - 96) + "," + (H - 150) + ")" },
          R("line", { x1: -18, y1: 0, x2: 18, y2: 0, stroke: rgba(tint, 0.6), strokeWidth: 2 }),
          R("line", { x1: 0, y1: -18, x2: 0, y2: 18, stroke: rgba(tint, 0.6), strokeWidth: 2 }),
          R("circle", { r: 11 * (0.6 + 0.4 * Math.sin(cyc * Math.PI * 2)), fill: "none", stroke: rgba(theme.accent, 0.5), strokeWidth: 2 })));
    },
  });
})();
