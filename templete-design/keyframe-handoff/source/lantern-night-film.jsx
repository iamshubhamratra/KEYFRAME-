/* lantern-night-film.jsx — "Lantern Night" animated video template (9:16, loop).
   A night lantern-festival world on the Organic palette inverted: ink sky,
   glowing terracotta lanterns endlessly rising, sage fireflies, moon halo,
   and a water line with live reflections. Deep 3-layer parallax camera.
   Exposes window.LanternNight. Copy lives in window.OM_SCENES. */
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
    outBack: (t) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
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

  /* ---------- world data (seeded, stable) ---------- */
  const STARS = (() => { const r = rng(7); return Array.from({ length: 60 }, () => ({ x: r(), y: r() * 0.55, R: 1 + r() * 2.4, tw: 0.5 + r() * 1.6, ph: r() * 6.28 })); })();
  const LANTERNS = (() => {
    const r = rng(41);
    return Array.from({ length: 10 }, (_, i) => ({
      x: 0.06 + (i / 10) * 0.9 + (r() - 0.5) * 0.06, s: 0.5 + r() * 0.8,
      speed: 26 + r() * 34, sway: 20 + r() * 40, swayF: 0.22 + r() * 0.3, ph: r() * 6.28,
      layer: i % 3, // 0 far, 1 mid, 2 near
    }));
  })();
  const FLIES = (() => { const r = rng(88); return Array.from({ length: 14 }, () => ({ x: r(), y: 0.35 + r() * 0.4, ax: 30 + r() * 70, ay: 20 + r() * 44, fx: 0.16 + r() * 0.3, fy: 0.2 + r() * 0.34, ph: r() * 6.28 })); })();

  /* ---------- world: night sky, lanterns, fireflies, water ---------- */
  function NightWorld({ t, W, H, theme, par }) {
    const waterY = H * 0.845;
    const lant = (cx, cy, s, glowId) =>
      React.createElement("g", { transform: `translate(${cx},${cy}) scale(${s})` },
        React.createElement("circle", { r: 120, fill: `url(#${glowId})` }),
        React.createElement("path", { d: "M-34,-46 C -34,-64 34,-64 34,-46 L 40,26 C 40,44 -40,44 -40,26 Z", fill: theme.accent, opacity: 0.95 }),
        React.createElement("path", { d: "M-34,-46 C -34,-64 34,-64 34,-46 L 36,0 L -36,0 Z", fill: rgba(theme.glow, 0.5) }),
        React.createElement("rect", { x: -18, y: -56, width: 36, height: 8, rx: 4, fill: rgba(theme.ink, 0.55) }),
        React.createElement("rect", { x: -14, y: 40, width: 28, height: 7, rx: 3.5, fill: rgba(theme.ink, 0.55) }),
        [-20, 0, 20].map((lx, i) => React.createElement("line", { key: i, x1: lx, y1: -50, x2: lx * 1.14, y2: 42, stroke: rgba(theme.ink, 0.28), strokeWidth: 2.4 })));
    return React.createElement("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: { position: "absolute", inset: 0 }, "aria-hidden": true },
      React.createElement("defs", null,
        React.createElement("radialGradient", { id: "lg" },
          React.createElement("stop", { offset: "0%", stopColor: rgba(theme.glow, 0.5) }),
          React.createElement("stop", { offset: "55%", stopColor: rgba(theme.accent, 0.16) }),
          React.createElement("stop", { offset: "100%", stopColor: rgba(theme.accent, 0) })),
        React.createElement("radialGradient", { id: "moon" },
          React.createElement("stop", { offset: "0%", stopColor: rgba(theme.paper, 0.9) }),
          React.createElement("stop", { offset: "45%", stopColor: rgba(theme.paper, 0.28) }),
          React.createElement("stop", { offset: "100%", stopColor: rgba(theme.paper, 0) })),
        React.createElement("linearGradient", { id: "water", x1: "0", y1: "0", x2: "0", y2: "1" },
          React.createElement("stop", { offset: "0%", stopColor: rgba(theme.accent2, 0.22) }),
          React.createElement("stop", { offset: "100%", stopColor: rgba(theme.ink2, 1) })),
        React.createElement("linearGradient", { id: "sky", x1: "0", y1: "0", x2: "0", y2: "1" },
          React.createElement("stop", { offset: "0%", stopColor: theme.ink2 }),
          React.createElement("stop", { offset: "70%", stopColor: theme.ink }),
          React.createElement("stop", { offset: "100%", stopColor: rgba(theme.accent, 0.14) }))),
      React.createElement("rect", { width: W, height: H, fill: "url(#sky)" }),
      // stars, twinkling
      STARS.map((s, i) => React.createElement("circle", { key: `s${i}`, cx: s.x * W + par * 8, cy: s.y * H, r: s.R, fill: theme.paper, opacity: 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph)) })),
      // moon with halo, breathing
      React.createElement("circle", { cx: W * 0.78 + par * 14, cy: H * 0.14, r: 210 + Math.sin(t * 0.5) * 10, fill: "url(#moon)" }),
      React.createElement("circle", { cx: W * 0.78 + par * 14, cy: H * 0.14, r: 62, fill: theme.paper, opacity: 0.92 }),
      React.createElement("circle", { cx: W * 0.755 + par * 14, cy: H * 0.132, r: 13, fill: rgba(theme.ink, 0.12) }),
      React.createElement("circle", { cx: W * 0.795 + par * 14, cy: H * 0.155, r: 8, fill: rgba(theme.ink, 0.10) }),
      // far hills silhouette
      (() => {
        const y0 = H * 0.78;
        let d = `M0,${H} L0,${y0}`;
        for (let x = 0; x <= W; x += 60) d += ` L${x},${y0 - Math.sin(x / 300 + 1.2) * 60 - 20}`;
        d += ` L${W},${H} Z`;
        return React.createElement("path", { d, fill: rgba(theme.ink2, 0.9), transform: `translate(${par * 6},0)` });
      })(),
      // rising lanterns in 3 parallax layers
      LANTERNS.map((L, i) => {
        const layerK = [0.45, 0.75, 1.1][L.layer];
        const cycle = H + 500;
        const yy = (H + 240 - ((t * L.speed * layerK + L.ph * 90) % cycle));
        const xx = L.x * W + Math.sin(t * L.swayF + L.ph) * L.sway + par * 24 * layerK;
        const flick = 0.9 + Math.sin(t * 2.4 + L.ph * 3) * 0.1;
        return React.createElement("g", { key: `l${i}`, opacity: (0.45 + L.layer * 0.27) * flick }, lant(xx, yy, L.s * layerK, "lg"));
      }),
      // water band + shimmering lantern reflections
      React.createElement("rect", { x: 0, y: waterY, width: W, height: H - waterY, fill: "url(#water)" }),
      [0.2, 0.45, 0.7, 0.9].map((px, i) =>
        React.createElement("ellipse", { key: `w${i}`, cx: px * W + Math.sin(t * 0.4 + i * 2) * 30, cy: waterY + 40 + i * 22, rx: 120 + Math.sin(t * 0.8 + i) * 26, ry: 5, fill: rgba(theme.glow, 0.16 + 0.08 * Math.sin(t * 1.1 + i * 1.7)) })),
      // fireflies weaving
      FLIES.map((f, i) => {
        const x = f.x * W + Math.sin(t * f.fx + f.ph) * f.ax;
        const y = f.y * H + Math.sin(t * f.fy + f.ph * 2) * f.ay;
        const o = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(t * 1.6 + f.ph * 5), 2);
        return React.createElement("g", { key: `f${i}` },
          React.createElement("circle", { cx: x, cy: y, r: 10, fill: rgba(theme.accent2, 0.25 * o) }),
          React.createElement("circle", { cx: x, cy: y, r: 3.4, fill: rgba("#cdd8b4", o) }));
      })
    );
  }

  /* ---------- camera: parallax float — every scene drifts upward like a lantern ---------- */
  function cam(kind, p, energy, clock) {
    const inn = ease.outQuint(seg(p, 0, 0.24));
    const out = ease.inCubic(seg(p, 0.82, 1));
    const dIn = 1 - inn, k = energy;
    let tx = 0, ty = 0, sc = 1, rot = 0;
    switch (kind) {
      case "floatup": ty = 160 * dIn - 120 * out; break;
      case "floatdown": ty = -160 * dIn + 120 * out; break;
      case "zoomdeep": sc = 1 - 0.24 * dIn + 0.1 * out; ty = 40 * dIn; break;
      case "swayl": tx = -120 * dIn + 80 * out; rot = -2.4 * dIn + 1.2 * out; break;
      case "swayr": tx = 120 * dIn - 80 * out; rot = 2.4 * dIn - 1.2 * out; break;
      case "rise-sc": ty = 130 * dIn - 90 * out; sc = 1 + 0.12 * dIn; break;
      default: sc = 1 - 0.08 * dIn;
    }
    const bobY = Math.sin(clock * 0.6) * 7 * energy;   // lantern-like float, never still
    const bobR = Math.sin(clock * 0.4 + 1) * 0.5 * energy;
    return {
      transform: `translate(${tx * k}px, ${ty * k + bobY}px) rotate(${rot * k + bobR}deg) scale(${sc + p * 0.03 * energy})`,
      opacity: clamp01(inn) * (1 - out * 0.6),
      par: Math.sin(clock * 0.18) * 2, // slow parallax drift handed to the world
    };
  }

  const M = {
    rise: (p, i = 0, e = 1) => { const t = ease.outQuint(clamp01((p - i * 0.06) / 0.44)); return { opacity: t, transform: `translateY(${(1 - t) * 44 * e}px)` }; },
    pop: (p, i = 0) => { const t = ease.outBack(clamp01((p - i * 0.06) / 0.44)); return { opacity: clamp01(t * 1.6), transform: `scale(${lerp(0.72, 1, t)})` }; },
    glowIn: (p, i = 0) => { const t = ease.inOut(clamp01((p - i * 0.06) / 0.5)); return t; },
  };

  /* ---------- pieces ---------- */
  function MediaSlot({ src, label, radius = 20, theme, style, compact }) {
    const base = { width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", ...style };
    if (src) return React.createElement("img", { src, style: { ...base, objectFit: "cover", display: "block" } });
    if (compact) {
      return React.createElement("div", { style: { ...base, display: "flex", alignItems: "center", justifyContent: "center", background: rgba(theme.paper, 0.06), border: `3px dashed ${rgba(theme.paper, 0.4)}` } },
        React.createElement("svg", { width: 34, height: 34, viewBox: "0 0 24 24", fill: "none", stroke: rgba(theme.paper, 0.6), strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
          React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
          React.createElement("path", { d: "M21 16l-5-5L5 19" })));
    }
    return React.createElement("div", { style: { ...base, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: rgba(theme.paper, 0.05), border: `3px dashed ${rgba(theme.paper, 0.38)}`, textAlign: "center", padding: 22 } },
      React.createElement("div", { style: { width: 50, height: 50, borderRadius: 999, background: rgba(theme.accent, 0.4), display: "flex", alignItems: "center", justifyContent: "center" } },
        React.createElement("svg", { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: theme.paper, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
          React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
          React.createElement("path", { d: "M21 16l-5-5L5 19" }))),
      React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 16, letterSpacing: "0.13em", color: rgba(theme.paper, 0.75) } }, "DROP IMAGE TO REPLACE"),
      label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 14, color: rgba(theme.paper, 0.5) } }, label));
  }

  // a floating glass card with a lantern-glow rim, swinging from a string
  function GlowCard({ children, theme, style, glow = 0.5, swing = 0, string }) {
    return React.createElement("div", { style: { position: "relative", transform: `rotate(${swing}deg)`, transformOrigin: "50% -300px", ...style } },
      string && React.createElement("div", { style: { position: "absolute", left: "50%", bottom: "100%", width: 3, height: 300, background: `linear-gradient(${rgba(theme.paper, 0)}, ${rgba(theme.paper, 0.35)})` } }),
      React.createElement("div", { style: { position: "relative", height: "100%", borderRadius: 30, padding: 14, background: rgba(theme.paper, 0.07), border: `2px solid ${rgba(theme.glow, 0.4)}`, boxShadow: `0 0 ${60 * glow + 20}px ${rgba(theme.accent, 0.35 * glow)}, 0 30px 70px ${rgba("#000000", 0.5)}`, backdropFilter: "blur(4px)" } },
        React.createElement("div", { style: { borderRadius: 20, overflow: "hidden", height: "100%" } }, children)));
  }

  function GlowWord({ children, theme, on }) {
    return React.createElement("span", { style: { color: theme.glow, textShadow: `0 0 ${24 + on * 36}px ${rgba(theme.accent, 0.4 + on * 0.5)}, 0 0 90px ${rgba(theme.accent, 0.35 * on)}` } }, children);
  }

  function Counter({ to, suffix = "", p, theme }) {
    const e = ease.outCubic(seg(p, 0.06, 0.72));
    const v = to * e;
    const txt = Math.abs(to % 1) > 0 ? v.toFixed(1) : Math.round(v).toLocaleString();
    const on = M.glowIn(p, 2);
    return React.createElement("div", { style: { fontFamily: FH, fontSize: 132, lineHeight: 0.92, color: theme.glow, textShadow: `0 0 ${20 + on * 30}px ${rgba(theme.accent, 0.55)}`, fontVariantNumeric: "tabular-nums" } }, txt, React.createElement("span", { style: { fontSize: 64 } }, suffix));
  }

  function Chrome({ theme }) {
    const { index, count } = window.useScene ? window.useScene() : { index: 0, count: 6 };
    return React.createElement(React.Fragment, null,
      React.createElement("div", { style: { position: "absolute", top: 60, left: 68, display: "flex", alignItems: "center", gap: 16, zIndex: 6 } },
        React.createElement("div", { style: { width: 46, height: 46, borderRadius: 999, background: theme.accent, boxShadow: `0 0 30px ${rgba(theme.accent, 0.6)}`, display: "flex", alignItems: "center", justifyContent: "center" } },
          React.createElement("svg", { width: 25, height: 25, viewBox: "0 0 24 24", fill: "none", stroke: theme.ink, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
            React.createElement("path", { d: "M8 4h8l2 7c0 4-3 7-6 7s-6-3-6-7Z" }), React.createElement("path", { d: "M10 18v2h4v-2" }))),
        React.createElement("span", { style: { fontFamily: FH, fontSize: 33, color: theme.paper } }, theme.brand))
    );
  }

  function Frame({ progress, camKind, theme, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0 };
    const CAMS = ["floatup", "swayl", "zoomdeep", "swayr", "rise-sc", "floatdown"];
    const c = cam(CAMS[sc.index % CAMS.length] || camKind, progress, theme.energy, clock);
    return React.createElement("div", { style: { position: "absolute", inset: 0, background: theme.ink, overflow: "hidden", fontFamily: FB } },
      React.createElement(NightWorld, { t: clock, W: theme.W, H: theme.H, theme, par: c.par }),
      React.createElement("div", { style: { position: "absolute", inset: 0, transform: c.transform, opacity: c.opacity, willChange: "transform, opacity" } }, children),
      React.createElement(Chrome, { theme })
    );
  }

  const PAD = 68;
  const Title = (txt, mark, theme, p, e, size, from = 0) =>
    splitLines(txt).map((ln, i) =>
      React.createElement("div", { key: i, style: { ...M.rise(p, from + i, e), fontFamily: FH, fontSize: size, lineHeight: 1.04, color: theme.paper } },
        ln.trim() === (mark || "").trim() ? React.createElement(GlowWord, { theme, on: M.glowIn(p, from + i + 1) }, ln) : ln));

  /* ---------- scenes ---------- */
  function Hook({ progress, scene, theme }) {
    const p = progress, e = theme.energy;
    return React.createElement(Frame, { progress, camKind: "floatup", theme },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 420, textAlign: "center" } },
        React.createElement("div", { style: { ...M.pop(p, 0), width: 520, height: 320, margin: "0 auto 60px" } },
          React.createElement(GlowCard, { theme, glow: 0.8, string: true, style: { width: 520, height: 320 } },
            React.createElement(MediaSlot, { src: scene.image, theme, radius: 20, label: "Desktop hero shot" }))),
        React.createElement("div", { style: { ...M.rise(p, 1, e), fontFamily: FB, fontWeight: 800, fontSize: 25, letterSpacing: "0.26em", color: rgba(theme.glow, 0.9), marginBottom: 28 } }, scene.kicker || "WHEN THE SUN GOES DOWN"),
        Title(scene.title || "The night|comes|alive.", scene.mark || "alive.", theme, p, e, 128, 2),
        React.createElement("div", { style: { ...M.rise(p, 6, e), fontFamily: FB, fontWeight: 500, fontSize: 37, color: rgba(theme.paper, 0.65), marginTop: 32 } }, scene.sub || "One night. A thousand lanterns. Your story in lights."))
    );
  }

  function Statement({ progress, scene, theme }) {
    const p = progress, e = theme.energy;
    return React.createElement(Frame, { progress, camKind: "swayl", theme },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 680 } },
        React.createElement("div", { style: { ...M.rise(p, 0, e), width: 88, height: 10, borderRadius: 999, background: theme.accent, boxShadow: `0 0 24px ${rgba(theme.accent, 0.7)}`, marginBottom: 44 } }),
        Title(scene.title || "Everything looks|the same|in daylight.", scene.mark || "in daylight.", theme, p, e, 112, 1),
        React.createElement("div", { style: { ...M.rise(p, 5, e), fontFamily: FB, fontWeight: 500, fontSize: 36, color: rgba(theme.paper, 0.62), marginTop: 38, maxWidth: 760 } }, scene.sub || "Stand out where nobody else is even looking."))
    );
  }

  function Feature({ progress, scene, theme }) {
    const p = progress, e = theme.energy;
    const chips = (scene.chips && scene.chips.length) ? scene.chips : ["Glows on any feed", "Loops forever", "Yours in one evening"];
    return React.createElement(Frame, { progress, camKind: "zoomdeep", theme },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 260 } },
        Title(scene.title || "Light up|the main event.", scene.mark || "Light up", theme, p, e, 92, 0),
        React.createElement("div", { style: { ...M.pop(p, 2), margin: "48px auto 46px", width: 944, height: 620 } },
          React.createElement(GlowCard, { theme, glow: 1, style: { width: 944, height: 620 } },
            React.createElement(MediaSlot, { src: scene.image, theme, radius: 20, label: "Desktop screenshot \u2014 16:10" }))),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "center" } },
          chips.map((c, i) => {
            const s = M.pop(p, i + 3);
            return React.createElement("div", { key: i, style: { ...s, display: "inline-flex", alignItems: "center", gap: 12, padding: "15px 28px", borderRadius: 999, background: rgba(theme.paper, 0.07), border: `2px solid ${rgba(theme.glow, 0.45)}`, boxShadow: `0 0 26px ${rgba(theme.accent, 0.18)}`, fontFamily: FB, fontWeight: 700, fontSize: 29, color: theme.paper } },
              React.createElement("span", { style: { width: 13, height: 13, borderRadius: 999, background: theme.glow, boxShadow: `0 0 12px ${rgba(theme.accent, 0.9)}`, flex: "none" } }), c);
          })))
    );
  }

  function Montage({ progress, scene, theme }) {
    const p = progress, e = theme.energy;
    const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["The gates", "Food row", "Main stage", "River launch"];
    const tilts = [-4, 3, 2.5, -3];
    return React.createElement(Frame, { progress, camKind: "swayr", theme },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 300 } },
        Title(scene.title || "Four corners|of the night.", scene.mark || "of the night.", theme, p, e, 92, 0),
        React.createElement("div", { style: { marginTop: 54, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 } },
          tiles.slice(0, 4).map((label, i) => {
            const s = M.pop(p, i + 2);
            return React.createElement("div", { key: i, style: { ...s } },
              React.createElement(GlowCard, { theme, glow: 0.45, swing: tilts[i], style: { height: 286 } },
                React.createElement(MediaSlot, { src: (scene.images || [])[i], theme, radius: 18, label })),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 27, color: rgba(theme.paper, 0.85), marginTop: 16, textAlign: "center" } }, label));
          })))
    );
  }

  function Stats({ progress, scene, theme }) {
    const p = progress, e = theme.energy;
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 1000, suffix: "+", label: "lanterns released at once" },
      { to: 9, suffix: "pm", label: "the sky catches fire" },
      { to: 1, suffix: " night", label: "is all it takes" },
    ];
    return React.createElement(Frame, { progress, camKind: "rise-sc", theme },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 460 } },
        Title(scene.title || "The night,|measured.", scene.mark || "measured.", theme, p, e, 88, 0),
        React.createElement("div", { style: { marginTop: 64, display: "flex", flexDirection: "column", gap: 54 } },
          stats.slice(0, 3).map((st, i) =>
            React.createElement("div", { key: i, style: { ...M.rise(p, i + 2, e), display: "flex", alignItems: "baseline", gap: 36, borderBottom: `2px solid ${rgba(theme.glow, 0.25)}`, paddingBottom: 30 } },
              React.createElement(Counter, { to: st.to, suffix: st.suffix, p, theme }),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 37, color: rgba(theme.paper, 0.68) } }, st.label)))))
    );
  }

  function CTA({ progress, scene, theme }) {
    const p = progress, e = theme.energy;
    const on = M.glowIn(p, 3);
    return React.createElement(Frame, { progress, camKind: "floatdown", theme },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 620, textAlign: "center" } },
        React.createElement("div", { style: { ...M.pop(p, 0), display: "flex", alignItems: "center", justifyContent: "center", gap: 22, marginBottom: 48 } },
          React.createElement("div", { style: { width: 148, height: 148, borderRadius: 999, overflow: "hidden", flex: "none", boxShadow: `0 0 50px ${rgba(theme.accent, 0.35)}` } },
            React.createElement(MediaSlot, { src: scene.logo, theme, radius: 999, compact: true })),
          !scene.logo && React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 21, letterSpacing: "0.1em", color: rgba(theme.paper, 0.55), textAlign: "left", maxWidth: 260 } }, "DROP LOGO HERE")),
        Title(scene.title || "Send yours|into the sky.", scene.mark || "into the sky.", theme, p, e, 116, 1),
        React.createElement("div", { style: { ...M.pop(p, 3), display: "inline-flex", alignItems: "center", gap: 16, marginTop: 54, padding: "27px 54px", borderRadius: 999, background: theme.accent, color: theme.ink, fontFamily: FH, fontSize: 44, boxShadow: `0 0 ${40 + on * 50}px ${rgba(theme.accent, 0.35 + on * 0.35)}` } },
          scene.cta || "Get your lantern",
          React.createElement("svg", { width: 38, height: 38, viewBox: "0 0 24 24", fill: "none", stroke: theme.ink, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M12 19V5" }), React.createElement("path", { d: "M6 11l6-6 6 6" }))),
        React.createElement("div", { style: { ...M.rise(p, 5, e), fontFamily: FB, fontWeight: 700, fontSize: 38, letterSpacing: "0.04em", color: rgba(theme.glow, 0.95), marginTop: 44 } }, scene.url || "lanternnight.live"))
    );
  }

  const SCENE_MAP = { Hook, Statement, Feature, Montage, Stats, CTA };
  const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.4 };

  function LanternNight() {
    const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
    const [t, setTweak] = useTweaks(defaults);
    const W = 1080, H = 1920;
    const theme = {
      W, H,
      ink: t.ink || "#201e1d", ink2: "#161413",
      paper: t.paper || "#f5ead8",
      accent: t.accent || "#c67139", accent2: t.accent2 || "#7a8a5e",
      glow: "#e8a066",
      brand: t.brand || "Lantern Night",
      energy: ENERGY[t.motion] ?? 1.0,
    };
    const scenes = {};
    for (const k in SCENE_MAP) { const C = SCENE_MAP[k]; scenes[k] = (props) => React.createElement(C, { ...props, theme }); }
    return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0c0b" } },
      React.createElement(SceneStage, { width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.ink }, scenes),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, { label: "Lantern accent", value: theme.accent, options: ["#c67139", "#b2622d", "#7a8a5e", "#e8a066"], onChange: (v) => setTweak("accent", v) }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) })
      )
    );
  }

  window.LanternNight = LanternNight;
})();
