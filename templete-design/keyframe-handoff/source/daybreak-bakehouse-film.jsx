/* daybreak-bakehouse-film.jsx — "Daybreak Bakehouse" animated video template (9:16, loop).
   A real-world morning bakery/cafe reel: sunrise light raking across a counter,
   continuously rising steam, dust motes in the beam, swaying pendant lamps.
   Organic design-system tokens; Caprasimo display over Figtree.
   Exposes window.DaybreakBakehouse. Copy lives in window.OM_SCENES. */
(function () {
  const { SceneStage } = window;
  // ambient/world motion (drift, embers, petals, scroll) runs faster than wall clock
  const AMBIENT = 1.75;
  const useTimeline = () => {
    const tl = window.useTimeline();
    return Object.assign({}, tl, { time: tl.time * AMBIENT });
  };
  const { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakText, TweakRadio, TweakToggle } = window;

  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const segRaw = (p, a, b) => clamp01((p - a) / (b - a || 1e-6));
  /* Scenes are long so copy can be read, but reveals must stay quick. PACE warps
     normalized scene progress: fast in (first 20% of real time covers half the
     reveal timeline), slow hold through the middle, fast out over the last 22%. */
  const PACE = (p) => (p <= 0.2 ? p * 2.5 : p <= 0.78 ? 0.5 + (p - 0.2) * 0.41379 : 0.74 + (p - 0.78) * 1.18182);
  const seg = (p, a, b) => segRaw(PACE(p), a, b);
  const ease = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => { const c = 1.5; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  };
  function hexToRgb(h) {
    h = (h || "#000").replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const splitLines = (t) => String(t == null ? "" : t).split("|");
  function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  const FH = '"Caprasimo", Georgia, serif';
  const FB = '"Figtree", system-ui, sans-serif';

  /* ---------- world: sunrise bakehouse (driven by the global clock) ---------- */
  const MOTES = (() => {
    const r = rng(19);
    return Array.from({ length: 22 }, () => ({ x: r(), y: r(), R: 3 + r() * 7, f: 0.12 + r() * 0.22, amp: 24 + r() * 70, ph: r() * 6.28 }));
  })();
  const STEAMS = [
    { x: 0.30, y: 0.60, s: 1.0, ph: 0 },
    { x: 0.52, y: 0.575, s: 1.25, ph: 1.9 },
    { x: 0.72, y: 0.60, s: 0.85, ph: 3.6 },
  ];

  function Bakehouse({ t, W, H, theme, motes }) {
    const counterY = H * 0.86;
    // steam ribbon path: a slow sinuous curl that never stops
    const steamPath = (sx, sy, s, ph) => {
      let d = `M${sx},${sy}`;
      for (let i = 1; i <= 10; i++) {
        const k = i / 10;
        const y = sy - k * 300 * s;
        const x = sx + Math.sin(t * 0.7 + ph + k * 3.4) * 34 * s * k;
        d += ` L${x.toFixed(1)},${y.toFixed(1)}`;
      }
      return d;
    };
    return React.createElement("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: { position: "absolute", inset: 0 }, "aria-hidden": true },
      React.createElement("defs", null,
        React.createElement("linearGradient", { id: "dawn", x1: "0", y1: "0", x2: "0", y2: "1" },
          React.createElement("stop", { offset: "0%", stopColor: rgba(theme.accent, 0.30) }),
          React.createElement("stop", { offset: "45%", stopColor: rgba(theme.accent, 0.06) }),
          React.createElement("stop", { offset: "100%", stopColor: rgba(theme.bg, 0) })),
        React.createElement("linearGradient", { id: "ray", x1: "0", y1: "0", x2: "0", y2: "1" },
          React.createElement("stop", { offset: "0%", stopColor: rgba("#f7d9b8", 0.42) }),
          React.createElement("stop", { offset: "100%", stopColor: rgba("#f7d9b8", 0) })),
        React.createElement("linearGradient", { id: "counter", x1: "0", y1: "0", x2: "0", y2: "1" },
          React.createElement("stop", { offset: "0%", stopColor: theme.surface }),
          React.createElement("stop", { offset: "100%", stopColor: rgba(theme.accent, 0.30) }))),
      React.createElement("rect", { width: W, height: H, fill: theme.bg }),
      React.createElement("rect", { width: W, height: H * 0.7, fill: "url(#dawn)" }),
      // low sun disc, drifting up almost imperceptibly
      React.createElement("circle", { cx: W * 0.76, cy: H * 0.30 - Math.sin(t * 0.06) * 16, r: 132, fill: rgba(theme.accent, 0.20) }),
      React.createElement("circle", { cx: W * 0.76, cy: H * 0.30 - Math.sin(t * 0.06) * 16, r: 74, fill: rgba(theme.accent, 0.30) }),
      // raking light beams through the window, slowly breathing
      [0, 1, 2].map((i) => {
        const sway = Math.sin(t * 0.14 + i * 1.1) * 40;
        const x = W * (0.18 + i * 0.26) + sway;
        return React.createElement("polygon", { key: `r${i}`, points: `${x},0 ${x + 150},0 ${x + 330},${counterY} ${x + 40},${counterY}`, fill: "url(#ray)", opacity: 0.5 + Math.sin(t * 0.2 + i) * 0.12 });
      }),
      // dust motes floating in the beam
      motes && MOTES.map((m, i) => {
        const x = m.x * W + Math.sin(t * m.f + m.ph) * m.amp;
        const y = (m.y * counterY - ((t * 12 + m.ph * 40) % counterY) + counterY) % counterY;
        return React.createElement("circle", { key: `m${i}`, cx: x, cy: y, r: m.R, fill: rgba("#faeeda", 0.55) });
      }),
      // counter slab
      React.createElement("rect", { x: 0, y: counterY, width: W, height: H - counterY, fill: "url(#counter)" }),
      React.createElement("rect", { x: 0, y: counterY, width: W, height: 12, fill: rgba(theme.ink, 0.10) }),
      // cups on the counter + endless steam
      STEAMS.map((s, i) => {
        const cx = s.x * W, cy = counterY + 26;
        return React.createElement("g", { key: `c${i}` },
          React.createElement("path", { d: steamPath(cx, cy - 46, s.s, s.ph), fill: "none", stroke: rgba("#fbf1e3", 0.55), strokeWidth: 13 * s.s, strokeLinecap: "round" }),
          React.createElement("path", { d: steamPath(cx + 16, cy - 40, s.s * 0.8, s.ph + 2), fill: "none", stroke: rgba("#fbf1e3", 0.32), strokeWidth: 9 * s.s, strokeLinecap: "round" }),
          React.createElement("path", { d: `M${cx - 42 * s.s},${cy - 46} h${84 * s.s} l${-11 * s.s},${52 * s.s} h${-62 * s.s} Z`, fill: theme.bg, stroke: rgba(theme.ink, 0.16), strokeWidth: 3 }),
          React.createElement("ellipse", { cx, cy: cy - 46, rx: 43 * s.s, ry: 9 * s.s, fill: rgba(theme.ink, 0.10) }));
      }),
      // pendant lamps swaying above
      [0.22, 0.5, 0.78].map((px, i) => {
        const ang = Math.sin(t * 0.5 + i * 1.4) * 3.2;
        return React.createElement("g", { key: `l${i}`, transform: `rotate(${ang} ${px * W} 0)` },
          React.createElement("line", { x1: px * W, y1: 0, x2: px * W, y2: 190, stroke: rgba(theme.ink, 0.34), strokeWidth: 5 }),
          React.createElement("path", { d: `M${px * W - 54},190 h108 l-20,58 h-68 Z`, fill: rgba(theme.ink, 0.80) }),
          React.createElement("circle", { cx: px * W, cy: 256, r: 15, fill: rgba("#f7d9b8", 0.95) }),
          React.createElement("circle", { cx: px * W, cy: 256, r: 46, fill: rgba("#f7d9b8", 0.20) }));
      })
    );
  }

  /* ---------- camera: varied per scene, always with a slow live drift ---------- */
  function cam(kind, p, energy, clock) {
    const inn = ease.outCubic(seg(p, 0, 0.2));
    const out = ease.inCubic(seg(p, 0.84, 1));
    const dIn = 1 - inn, dOut = out, k = energy;
    let tx = 0, ty = 0, sc = 1, rot = 0;
    switch (kind) {
      case "left": tx = -96 * dIn + 62 * dOut; break;
      case "right": tx = 96 * dIn - 62 * dOut; break;
      case "up": ty = 108 * dIn - 64 * dOut; break;
      case "drop": ty = -108 * dIn + 64 * dOut; break;
      case "zoom": sc = 1 - 0.16 * dIn + 0.06 * dOut; break;
      case "scaleout": sc = 1 + 0.15 * dIn - 0.06 * dOut; rot = -1.6 * dIn; break;
      default: sc = 1 - 0.07 * dIn;
    }
    // continuous slow push so the scene never freezes after its reveal
    const drift = 1 + p * 0.035 * energy;
    const bob = Math.sin(clock * 0.35) * 5 * energy;
    return { transform: `translate(${tx * k}px, ${ty * k + bob}px) rotate(${rot * k}deg) scale(${sc * drift})`, opacity: clamp01(inn) * (1 - out * 0.5) };
  }

  const M = {
    rise: (p, i = 0, e = 1) => { const t = ease.outCubic(clamp01((p - i * 0.055) / 0.38)); return { opacity: t, transform: `translateY(${(1 - t) * 32 * e}px)` }; },
    pop: (p, i = 0) => { const t = ease.outBack(clamp01((p - i * 0.055) / 0.4)); return { opacity: clamp01(t * 1.6), transform: `scale(${lerp(0.76, 1, t)})` }; },
    wipe: (p, i = 0) => { const t = ease.outCubic(clamp01((p - i * 0.05) / 0.42)); return { opacity: t, transform: `translateX(${(1 - t) * -26}px)` }; },
  };

  /* ---------- pieces ---------- */
  function MediaSlot({ src, label, radius = 20, theme, style, compact }) {
    const base = { width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", ...style };
    if (src) return React.createElement("img", { src, style: { ...base, objectFit: "cover", display: "block" } });
    if (compact) {
      return React.createElement("div", {
        style: { ...base, display: "flex", alignItems: "center", justifyContent: "center", background: rgba(theme.accent, 0.07), border: `3px dashed ${rgba(theme.ink, 0.26)}` },
      },
        React.createElement("svg", { width: 34, height: 34, viewBox: "0 0 24 24", fill: "none", stroke: rgba(theme.ink, 0.5), strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
          React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
          React.createElement("path", { d: "M21 16l-5-5L5 19" })));
    }
    return React.createElement("div", {
      style: { ...base, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: rgba(theme.accent, 0.07), border: `3px dashed ${rgba(theme.ink, 0.26)}`, textAlign: "center", padding: 22 },
    },
      React.createElement("div", { style: { width: 50, height: 50, borderRadius: 999, background: rgba(theme.accent2, 0.45), display: "flex", alignItems: "center", justifyContent: "center" } },
        React.createElement("svg", { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: theme.ink, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
          React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
          React.createElement("path", { d: "M21 16l-5-5L5 19" }))),
      React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 16, letterSpacing: "0.13em", color: rgba(theme.ink, 0.55) } }, "DROP IMAGE TO REPLACE"),
      label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 14, color: rgba(theme.ink, 0.4) } }, label)
    );
  }

  // a hanging framed print — the bakery's wall frame, used as a media mount
  function WallFrame({ children, theme, style, tilt = 0 }) {
    return React.createElement("div", { style: { position: "relative", padding: 16, background: theme.bg, borderRadius: 24, border: `10px solid ${rgba(theme.ink, 0.82)}`, boxShadow: `0 30px 60px ${rgba(theme.ink, 0.22)}`, transform: `rotate(${tilt}deg)`, ...style } },
      React.createElement("div", { style: { borderRadius: 12, overflow: "hidden", height: "100%" } }, children));
  }

  // the menu board behind the counter — holds the big product shot
  function MenuBoard({ children, theme, style }) {
    return React.createElement("div", { style: { position: "relative", padding: 20, background: rgba(theme.ink, 0.9), borderRadius: 28, boxShadow: `0 34px 70px ${rgba(theme.ink, 0.26)}`, ...style } },
      React.createElement("div", { style: { position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)", width: 120, height: 12, borderRadius: 999, background: rgba(theme.ink, 0.6) } }),
      React.createElement("div", { style: { borderRadius: 16, overflow: "hidden", height: "100%", background: theme.surface } }, children));
  }

  function Tag({ children, theme, i, p }) {
    const s = M.pop(p, i + 1);
    return React.createElement("div", {
      style: { ...s, display: "inline-flex", alignItems: "center", gap: 12, padding: "15px 26px", borderRadius: 999, background: rgba(theme.accent2, 0.22), border: `2px solid ${rgba(theme.accent2, 0.55)}`, fontFamily: FB, fontWeight: 700, fontSize: 29, color: theme.ink2 },
    },
      React.createElement("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.accent700, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M20 6L9 17l-5-5" })),
      children);
  }

  function Counter({ to, suffix = "", p, theme }) {
    const e = ease.outCubic(seg(p, 0.06, 0.72));
    const v = to * e;
    const txt = Math.abs(to % 1) > 0 ? v.toFixed(1) : Math.round(v).toLocaleString();
    return React.createElement("div", { style: { fontFamily: FH, fontSize: 116, lineHeight: 0.92, color: theme.accent700, fontVariantNumeric: "tabular-nums" } }, txt, React.createElement("span", { style: { fontSize: 58 } }, suffix));
  }

  function Chrome({ theme }) {
    const { index, count } = window.useScene ? window.useScene() : { index: 0, count: 6 };
    return React.createElement(React.Fragment, null,
      React.createElement("div", { style: { position: "absolute", top: 60, left: 68, display: "flex", alignItems: "center", gap: 16, zIndex: 6 } },
        React.createElement("div", { style: { width: 46, height: 46, borderRadius: 999, background: theme.accent, display: "flex", alignItems: "center", justifyContent: "center" } },
          React.createElement("svg", { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: theme.bg, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
            React.createElement("path", { d: "M4 19h16" }), React.createElement("path", { d: "M5 19c-1-5 2-9 7-9s8 4 7 9" }), React.createElement("path", { d: "M12 6c0-1.5 1-2.5 2.5-2.5" }))),
        React.createElement("span", { style: { fontFamily: FH, fontSize: 33, color: theme.ink } }, theme.brand))
    );
  }

  function Frame({ progress, camKind, theme, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0 };
    const CAMS = ["drop", "left", "up", "right", "zoom", "scaleout"];
    const c = cam(CAMS[sc.index % CAMS.length] || camKind, progress, theme.energy, clock);
    return React.createElement("div", { style: { position: "absolute", inset: 0, background: theme.bg, overflow: "hidden", fontFamily: FB } },
      React.createElement(Bakehouse, { t: clock, W: theme.W, H: theme.H, theme, motes: theme.motes }),
      React.createElement("div", { style: { position: "absolute", inset: 0, transform: c.transform, opacity: c.opacity, willChange: "transform, opacity" } }, children),
      React.createElement(Chrome, { theme })
    );
  }

  const PAD = 68;
  const Lines = (txt, style, p, e, from = 0) =>
    splitLines(txt).map((ln, i) => React.createElement("div", { key: i, style: { ...M.rise(p, from + i, e), ...style } }, ln));

  /* ---------- scenes ---------- */
  function Hook({ progress, scene, theme }) {
    const p = progress, e = theme.energy;
    return React.createElement(Frame, { progress, camKind: "drop", theme },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 330 } },
        React.createElement("div", { style: { ...M.pop(p, 0), width: 400, height: 300, margin: "0 auto 54px" } },
          React.createElement(WallFrame, { theme, tilt: -2, style: { width: 400, height: 300 } },
            React.createElement(MediaSlot, { src: scene.image, theme, radius: 12, label: "Shopfront or hero shot" }))),
        React.createElement("div", { style: { ...M.rise(p, 1, e), fontFamily: FB, fontWeight: 800, fontSize: 25, letterSpacing: "0.24em", color: theme.accent700, marginBottom: 26 } }, scene.kicker || "OPEN AT SIX, WARM BY SEVEN"),
        Lines(scene.title || "Baked before|the town|wakes up.", { fontFamily: FH, fontSize: 116, lineHeight: 1.03, color: theme.ink }, p, e, 2),
        React.createElement("div", { style: { ...M.rise(p, 5, e), fontFamily: FB, fontWeight: 500, fontSize: 37, color: rgba(theme.ink, 0.7), marginTop: 30, maxWidth: 700 } }, scene.sub || "A neighbourhood bakehouse, one honest batch at a time."))
    );
  }

  function Statement({ progress, scene, theme }) {
    const p = progress, e = theme.energy;
    return React.createElement(Frame, { progress, camKind: "left", theme },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 700 } },
        React.createElement("div", { style: { ...M.rise(p, 0, e), width: 88, height: 10, borderRadius: 999, background: theme.accent, marginBottom: 42 } }),
        Lines(scene.title || "Most mornings|taste like|a queue.", { fontFamily: FH, fontSize: 112, lineHeight: 1.05, color: theme.ink }, p, e, 1),
        React.createElement("div", { style: { ...M.rise(p, 5, e), fontFamily: FB, fontWeight: 500, fontSize: 36, color: rgba(theme.ink, 0.68), marginTop: 36, maxWidth: 740 } }, scene.sub || "Ours tastes like someone was up at four, thinking about you."))
    );
  }

  function Feature({ progress, scene, theme }) {
    const p = progress, e = theme.energy;
    const tags = (scene.chips && scene.chips.length) ? scene.chips : ["Milled that week", "Slow overnight rise", "Out of the oven at 6"];
    return React.createElement(Frame, { progress, camKind: "up", theme },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 250 } },
        Lines(scene.title || "Today's board,|written at dawn.", { fontFamily: FH, fontSize: 90, lineHeight: 1.03, color: theme.ink }, p, e, 0),
        React.createElement("div", { style: { ...M.pop(p, 2), margin: "42px auto 40px", width: 944, height: 620 } },
          React.createElement(MenuBoard, { theme, style: { width: 944, height: 620 } },
            React.createElement(MediaSlot, { src: scene.image, theme, radius: 16, label: "Desktop screenshot \u2014 16:10" }))),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" } },
          tags.map((c, i) => React.createElement(Tag, { key: i, theme, i, p }, c))))
    );
  }

  function Montage({ progress, scene, theme }) {
    const p = progress, e = theme.energy;
    const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["Sourdough", "Croissant", "Rye tin", "Cardamom bun"];
    return React.createElement(Frame, { progress, camKind: "right", theme },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 290 } },
        Lines(scene.title || "Straight from|the cooling rack.", { fontFamily: FH, fontSize: 90, lineHeight: 1.03, color: theme.ink }, p, e, 0),
        React.createElement("div", { style: { marginTop: 46, display: "flex", flexDirection: "column", gap: 26 } },
          [0, 1].map((row) =>
            React.createElement("div", { key: row, style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 } },
              [0, 1].map((col) => {
                const i = row * 2 + col;
                const s = M.wipe(p, i + 1);
                return React.createElement("div", { key: col, style: { ...s } },
                  React.createElement("div", { style: { height: 286, borderRadius: 22, overflow: "hidden", boxShadow: `0 22px 44px ${rgba(theme.ink, 0.14)}` } },
                    React.createElement(MediaSlot, { src: (scene.images || [])[i], theme, radius: 22, label: `${tiles[i]} \u2014 desktop` })),
                  React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 28, color: theme.ink, marginTop: 14 } }, tiles[i]));
              }))
          )))
    );
  }

  function Stats({ progress, scene, theme }) {
    const p = progress, e = theme.energy;
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 4, suffix: "am", label: "the ovens come on" },
      { to: 32, suffix: "", label: "loaves in the first batch" },
      { to: 11, suffix: "yrs", label: "on the same corner" },
    ];
    return React.createElement(Frame, { progress, camKind: "zoom", theme },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 480 } },
        Lines(scene.title || "The day, by|the numbers.", { fontFamily: FH, fontSize: 88, lineHeight: 1.03, color: theme.ink }, p, e, 0),
        React.createElement("div", { style: { marginTop: 56, display: "flex", flexDirection: "column", gap: 26 } },
          stats.slice(0, 3).map((st, i) =>
            React.createElement("div", { key: i, style: { ...M.rise(p, i + 2, e), display: "flex", alignItems: "center", gap: 34, background: theme.bg, border: `2px solid ${rgba(theme.ink, 0.1)}`, borderRadius: 26, padding: "30px 40px", boxShadow: `0 14px 32px ${rgba(theme.ink, 0.07)}` } },
              React.createElement("div", { style: { minWidth: 280 } }, React.createElement(Counter, { to: st.to, suffix: st.suffix, p, theme })),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 36, color: rgba(theme.ink, 0.7) } }, st.label)))))
    );
  }

  function CTA({ progress, scene, theme }) {
    const p = progress, e = theme.energy;
    return React.createElement(Frame, { progress, camKind: "scaleout", theme },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 620 } },
        React.createElement("div", { style: { ...M.pop(p, 0), display: "flex", alignItems: "center", gap: 22, marginBottom: 44 } },
          React.createElement("div", { style: { width: 148, height: 148, borderRadius: 999, overflow: "hidden", flex: "none" } },
            React.createElement(MediaSlot, { src: scene.logo, theme, radius: 999, compact: true })),
          !scene.logo && React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 21, letterSpacing: "0.1em", color: rgba(theme.ink, 0.5), maxWidth: 300 } }, "DROP LOGO HERE")),
        Lines(scene.title || "Come in while|it's still warm.", { fontFamily: FH, fontSize: 112, lineHeight: 1.02, color: theme.ink }, p, e, 1),
        React.createElement("div", { style: { ...M.pop(p, 3), display: "inline-flex", alignItems: "center", gap: 16, marginTop: 50, padding: "26px 50px", borderRadius: 999, background: theme.accent, color: theme.bg, fontFamily: FH, fontSize: 44 } },
          scene.cta || "Find the bakehouse",
          React.createElement("svg", { width: 38, height: 38, viewBox: "0 0 24 24", fill: "none", stroke: theme.bg, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M5 12h14" }), React.createElement("path", { d: "M13 6l6 6-6 6" }))),
        React.createElement("div", { style: { ...M.rise(p, 5, e), fontFamily: FB, fontWeight: 700, fontSize: 38, letterSpacing: "0.04em", color: theme.accent700, marginTop: 42 } }, scene.url || "daybreakbakehouse.co"))
    );
  }

  const SCENE_MAP = { Hook, Statement, Feature, Montage, Stats, CTA };
  const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.4 };

  function DaybreakBakehouse() {
    const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
    const [t, setTweak] = useTweaks(defaults);
    const W = 1080, H = 1920;
    const accent = t.accent || "#c67139";
    const theme = {
      W, H, bg: t.bg || "#f5ead8", surface: t.surface || "#ebddc5", ink: t.ink || "#201e1d",
      ink2: "#201e1d", accent, accent2: t.accent2 || "#7a8a5e",
      accent700: accent === "#7a8a5e" ? "#56633f" : "#8c491a",
      brand: t.brand || "Daybreak Bakehouse",
      energy: ENERGY[t.motion] ?? 1.0, motes: t.motes !== false,
    };
    const scenes = {};
    for (const k in SCENE_MAP) { const C = SCENE_MAP[k]; scenes[k] = (props) => React.createElement(C, { ...props, theme }); }

    return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: theme.ink } },
      React.createElement(SceneStage, { width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.bg }, scenes),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, { label: "Accent", value: accent, options: ["#c67139", "#b2622d", "#7a8a5e", "#8c491a"], onChange: (v) => setTweak("accent", v) }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) }),
        React.createElement(TweakToggle, { label: "Dust in the light", value: t.motes !== false, onChange: (v) => setTweak("motes", v) })
      )
    );
  }

  window.DaybreakBakehouse = DaybreakBakehouse;
})();
