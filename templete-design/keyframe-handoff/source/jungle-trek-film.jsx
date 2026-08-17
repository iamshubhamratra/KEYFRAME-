/* jungle-trek-film.jsx — "Jungle Trek" (9:16, loop). Deep rainforest: layered
   swaying leaves framing the edges, wandering fireflies, hanging vines, drifting
   mist. Alfa Slab One + Cabin. Exposes window.JungleTrek. */
(function () {
  const { SceneStage } = window;
  const AMBIENT = 1.6;
  const useTimeline = () => { const tl = window.useTimeline(); return Object.assign({}, tl, { time: tl.time * AMBIENT }); };
  const { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakText, TweakRadio } = window;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const segRaw = (p, a, b) => clamp01((p - a) / (b - a || 1e-6));
  const PACE = (p) => (p <= 0.2 ? p * 2.5 : p <= 0.78 ? 0.5 + (p - 0.2) * 0.41379 : 0.74 + (p - 0.78) * 1.18182);
  const seg = (p, a, b) => segRaw(PACE(p), a, b);
  const ease = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    outBack: (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
  };
  function hexToRgb(h) { h = (h || "#000").replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const splitLines = (t) => String(t == null ? "" : t).split("|");
  const FH = '"Alfa Slab One", Georgia, serif';
  const FB = '"Cabin", system-ui, sans-serif';
  const W = 1080, H = 1920, PAD = 72;

  const M = {
    machete: (p, i = 0) => { const t = ease.outQuint(clamp01((p - i * 0.055) / 0.36)); return { opacity: t, transform: `translateX(${(1 - t) * -90}px) skewX(${(1 - t) * -6}deg)` }; },
    grow: (p, i = 0) => { const t = ease.outBack(clamp01((p - i * 0.06) / 0.4)); return { opacity: clamp01(t * 1.6), transform: `scale(${lerp(0.55, 1, t)})`, transformOrigin: "bottom center" }; },
    rise: (p, i = 0) => { const t = ease.outQuint(clamp01((p - i * 0.055) / 0.38)); return { opacity: t, transform: `translateY(${(1 - t) * 46}px)` }; },
  };

  /* canopy-flavoured camera: part the leaves / swing on a vine */
  function cam(kind, p, energy, clock) {
    const inn = ease.outQuint(seg(p, 0, 0.24));
    const out = ease.inCubic(seg(p, 0.8, 1));
    const dIn = 1 - inn, k = Math.min(energy, 1.15);
    let fx = 0, fy = 0, fr = 0, fs = 1, fo = 1;
    switch (kind) {
      case "vineSwing": fx = W * dIn * k; fr = 8 * dIn; fx -= W * 0.3 * out; fr -= 5 * out; break;
      case "vineBack": fx = -W * dIn * k; fr = -8 * dIn; fx += W * 0.3 * out; fr += 5 * out; break;
      case "canopyDrop": fy = -H * dIn * k; fs = 1 + 0.16 * dIn; fy += H * 0.26 * out; break;
      case "climb": fy = H * dIn * k; fy -= H * 0.26 * out; break;
      case "part": fs = 1 + 0.6 * dIn; fo = inn; break;
      default: fs = 1 - 0.45 * dIn; fo = inn; fr = 6 * dIn;
    }
    const dz = 1 + p * 0.06 * energy;
    const dx = Math.sin(clock * 0.3) * 10 * energy;
    const dy = Math.cos(clock * 0.42) * 8 * energy - p * 12;
    return {
      frame: { transform: `translate(${fx}px, ${fy}px) rotate(${fr}deg) scale(${fs})`, opacity: fo },
      drift: { transform: `translate(${dx}px, ${dy}px) scale(${dz})`, opacity: 1 - out * 0.35, willChange: "transform" },
    };
  }

  function Leaf({ x, y, s = 1, r = 0, color, sway = 0 }) {
    return React.createElement("g", { transform: `translate(${x},${y}) rotate(${r + sway}) scale(${s})` },
      React.createElement("path", { d: "M0 0 C 60 -40 150 -50 210 -10 C 150 40 60 40 0 0 Z", fill: color }),
      React.createElement("path", { d: "M6 -2 L 200 -12", stroke: rgba("#0d1f12", 0.3), strokeWidth: 4, strokeLinecap: "round" }));
  }

  function World({ theme, t }) {
    const flies = Array.from({ length: 7 }).map((_, i) => {
      const fx = W * 0.5 + Math.sin(t * (0.5 + i * 0.11) + i * 2) * (W * 0.36);
      const fy = H * 0.44 + Math.cos(t * (0.4 + i * 0.09) + i * 3) * (H * 0.3);
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2.2 + i * 1.7));
      return React.createElement("g", { key: i },
        React.createElement("circle", { cx: fx, cy: fy, r: 12, fill: rgba(theme.fly, 0.18 * tw) }),
        React.createElement("circle", { cx: fx, cy: fy, r: 4.5, fill: rgba(theme.fly, 0.95 * tw) }));
    });
    const sway = Math.sin(t * 0.8) * 4;
    return React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
      React.createElement("ellipse", { cx: W * 0.5, cy: H * 0.4, rx: W * 0.8, ry: 700, fill: rgba(theme.mist, 0.06) }),
      React.createElement("path", { d: `M ${W * 0.82} -20 q ${10 + sway} 200 -30 420 q ${-20 - sway} 160 24 320`, stroke: theme.leafDark, strokeWidth: 10, fill: "none", strokeLinecap: "round" }),
      React.createElement(Leaf, { x: W * 0.78, y: 700, s: 0.7, r: 60, color: theme.leafDark, sway }),
      React.createElement(Leaf, { x: -30, y: 180, s: 1.25, r: 26, color: theme.leafDark, sway }),
      React.createElement(Leaf, { x: -60, y: 380, s: 1.5, r: 10, color: theme.leaf, sway: -sway }),
      React.createElement(Leaf, { x: W + 40, y: 260, s: 1.4, r: 156, color: theme.leaf, sway }),
      React.createElement(Leaf, { x: W + 60, y: H - 500, s: 1.6, r: 196, color: theme.leafDark, sway: -sway }),
      React.createElement(Leaf, { x: -40, y: H - 320, s: 1.7, r: -16, color: theme.leaf, sway }),
      React.createElement(Leaf, { x: W * 0.3, y: H + 40, s: 1.5, r: -60, color: theme.leafDark, sway: -sway }),
      flies,
      Array.from({ length: 4 }).map((_, i) =>
        React.createElement("ellipse", { key: i, cx: ((t * (22 + i * 8) + i * 300) % (W + 600)) - 300, cy: 500 + i * 330, rx: 240, ry: 40, fill: rgba(theme.mist, 0.07) })));
  }

  function MediaSlot({ src, label, radius = 20, style, fg, compact }) {
    const line = fg || "#f1e9d2";
    const base = { width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", ...style };
    if (src) return React.createElement("img", { src, style: { ...base, objectFit: "cover", display: "block" } });
    return React.createElement("div", { style: { ...base, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: rgba(line, 0.05), border: `3px dashed ${rgba(line, 0.4)}`, textAlign: "center", padding: 16 } },
      React.createElement("svg", { width: compact ? 30 : 40, height: compact ? 30 : 40, viewBox: "0 0 24 24", fill: "none", stroke: rgba(line, 0.6), strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
        React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
        React.createElement("path", { d: "M21 16l-5-5L5 19" })),
      !compact && React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 15, letterSpacing: "0.12em", color: rgba(line, 0.75) } }, "DROP IMAGE TO REPLACE"),
      !compact && label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 13, color: rgba(line, 0.55) } }, label));
  }

  function Chrome({ theme, fg }) {
    return React.createElement("div", { style: { position: "absolute", top: 58, left: PAD, display: "flex", alignItems: "center", gap: 15, zIndex: 6 } },
      React.createElement("div", { style: { width: 47, height: 47, borderRadius: 999, background: fg, display: "flex", alignItems: "center", justifyContent: "center" } },
        React.createElement("svg", { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("path", { d: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" }),
          React.createElement("path", { d: "M2 21c0-3 1.85-5.36 5.08-6" }))),
      React.createElement("span", { style: { fontFamily: FH, fontSize: 30, color: fg, letterSpacing: "0.02em" } }, theme.brand));
  }

  function Frame({ progress, theme, bg, fg, world, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0 };
    const CAMS = ["part", "vineSwing", "climb", "vineBack", "canopyDrop", "spin"];
    const c = cam(CAMS[(sc.index * 5 + 3) % CAMS.length], progress, theme.energy, clock);
    theme.currentBg = bg;
    return React.createElement("div", { style: { position: "absolute", inset: 0, ...c.frame, willChange: "transform, opacity" } },
      React.createElement("div", { style: { position: "absolute", inset: 0, background: bg, overflow: "hidden", fontFamily: FB } },
        world && React.createElement(World, { theme, t: clock }),
        React.createElement("div", { style: { position: "absolute", inset: 0, ...c.drift } }, children),
        React.createElement(Chrome, { theme, fg })));
  }

  const Title = (txt, p, fg, hi, size, from = 0) =>
    splitLines(txt).map((ln, i) =>
      React.createElement("div", { key: i, style: { ...M.machete(p, from + i), fontFamily: FH, fontSize: size, lineHeight: 1.08, color: i === 1 ? hi : fg, textTransform: "uppercase" } }, ln));

  function Hook({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.deep, fg: theme.paper, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 620 } },
        React.createElement("div", { style: { ...M.rise(p, 0), display: "inline-block", padding: "12px 26px", borderRadius: 8, background: theme.fly, color: theme.deep, fontFamily: FB, fontWeight: 700, fontSize: 24, letterSpacing: "0.2em", marginBottom: 38 } }, scene.kicker || "DAY 1 \u2014 UNDER THE CANOPY"),
        Title(scene.title || "Into the|green.", p, theme.paper, theme.fly, 138, 1),
        React.createElement("div", { style: { ...M.rise(p, 4), fontFamily: FB, fontWeight: 600, fontSize: 35, color: rgba(theme.paper, 0.75), marginTop: 36, maxWidth: 720 } }, scene.sub || "Where the map ends and the good part starts.")));
  }

  function Statement({ progress: p, scene, theme }) {
    const clock = useTimeline().time;
    return React.createElement(Frame, { progress: p, theme, bg: theme.leafDark, fg: theme.paper, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement(Leaf, { x: W + 30, y: 300, s: 2, r: 170, color: rgba("#0d1f12", 0.5), sway: Math.sin(clock) * 3 }),
        React.createElement(Leaf, { x: -50, y: H - 420, s: 2.2, r: -8, color: rgba("#0d1f12", 0.5), sway: Math.sin(clock + 2) * 3 })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 640 } },
        Title(scene.title || "Louder|than quiet.", p, theme.paper, theme.fly, 148, 1),
        React.createElement("div", { style: { ...M.rise(p, 4), fontFamily: FB, fontWeight: 600, fontSize: 35, color: rgba(theme.paper, 0.72), marginTop: 40, maxWidth: 700 } }, scene.sub || "A billion insects agree: this is the place.")));
  }

  function Feature({ progress: p, scene, theme }) {
    const chips = (scene.chips && scene.chips.length) ? scene.chips : ["Waterproof everything", "Boots broken in", "Eyes open"];
    return React.createElement(Frame, { progress: p, theme, bg: theme.deep, fg: theme.paper, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 250 } },
        Title(scene.title || "The clearing|at kilometre 9.", p, theme.paper, theme.fly, 100, 0),
        React.createElement("div", { style: { ...M.grow(p, 2), margin: "46px auto 42px", width: 936, height: 590, background: theme.leafDark, borderRadius: 28, padding: 14, boxShadow: `0 32px 64px ${rgba("#0d1f12", 0.55)}` } },
          React.createElement(MediaSlot, { src: scene.image, radius: 16, label: (scene.imageLabel || "Landscape photo \u2014 16:10"), fg: theme.paper })),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 16 } },
          chips.map((c, i) => React.createElement("div", { key: i, style: { ...M.grow(p, i + 4), padding: "14px 26px", borderRadius: 999, background: i % 2 === 0 ? theme.fly : theme.leaf, color: theme.deep, fontFamily: FB, fontWeight: 700, fontSize: 27 } }, c)))));
  }

  function Montage({ progress: p, scene, theme }) {
    const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["The river", "Canopy walk", "Camp two", "The falls"];
    return React.createElement(Frame, { progress: p, theme, bg: theme.leaf, fg: theme.deep, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement(Leaf, { x: W + 20, y: H - 300, s: 1.8, r: 200, color: rgba(theme.deep, 0.25), sway: 0 })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 260 } },
        Title(scene.title || "Field notes,|day three.", p, theme.deep, theme.paper, 100, 0),
        React.createElement("div", { style: { marginTop: 56, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 } },
          tiles.slice(0, 4).map((label, i) =>
            React.createElement("div", { key: i, style: { ...M.grow(p, i + 2) } },
              React.createElement("div", { style: { height: 298, borderRadius: 24, background: theme.deep, padding: 12 } },
                React.createElement(MediaSlot, { src: (scene.images || [])[i], radius: 14, label: label, fg: theme.paper })),
              React.createElement("div", { style: { fontFamily: FH, fontSize: 27, color: theme.deep, marginTop: 12, textAlign: "center", textTransform: "uppercase" } }, label))))));
  }

  function Stats({ progress: p, scene, theme }) {
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 42, suffix: "km", label: "cut through the undergrowth" },
      { to: 130, suffix: "", label: "species heard before breakfast" },
      { to: 100, suffix: "%", label: "humidity, and proud of it" }];
    const cols = [theme.fly, theme.leaf, theme.paper];
    return React.createElement(Frame, { progress: p, theme, bg: theme.deep, fg: theme.paper, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement(Leaf, { x: -40, y: 300, s: 1.6, r: 20, color: rgba(theme.leafDark, 0.8), sway: 0 }),
        React.createElement(Leaf, { x: W + 30, y: H - 360, s: 1.9, r: 190, color: rgba(theme.leafDark, 0.8), sway: 0 })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 420 } },
        Title(scene.title || "Trail|tally.", p, theme.paper, theme.fly, 108, 0),
        React.createElement("div", { style: { marginTop: 66, display: "flex", flexDirection: "column", gap: 54 } },
          stats.slice(0, 3).map((st, i) => {
            const e = ease.outCubic(seg(p, 0.12 + i * 0.08, 0.75));
            return React.createElement("div", { key: i, style: { ...M.rise(p, i + 2), display: "flex", alignItems: "baseline", gap: 30 } },
              React.createElement("div", { style: { fontFamily: FH, fontSize: 156, lineHeight: 0.9, color: cols[i], fontVariantNumeric: "tabular-nums" } }, Math.round(st.to * e).toLocaleString(), React.createElement("span", { style: { fontSize: 76 } }, st.suffix)),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 33, color: rgba(theme.paper, 0.78), maxWidth: 430 } }, st.label));
          }))));
  }

  function CTA({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.deep, fg: theme.paper, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 520, textAlign: "center" } },
        React.createElement("div", { style: { ...M.grow(p, 0), width: 146, height: 146, borderRadius: 999, overflow: "hidden", background: rgba(theme.paper, 0.08), border: `2px dashed ${rgba(theme.paper, 0.4)}`, margin: "0 auto 40px" } },
          React.createElement(MediaSlot, { src: scene.logo, radius: 999, compact: true, fg: theme.paper })),
        Title(scene.title || "The trail|is calling.", p, theme.paper, theme.fly, 124, 1),
        React.createElement("div", { style: { ...M.grow(p, 4), display: "inline-flex", alignItems: "center", gap: 14, marginTop: 52, padding: "26px 52px", borderRadius: 999, background: theme.fly, color: theme.deep, fontFamily: FH, fontSize: 40 } },
          scene.cta || "Book the trek",
          React.createElement("svg", { width: 34, height: 34, viewBox: "0 0 24 24", fill: "none", stroke: theme.deep, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M5 12h14" }), React.createElement("path", { d: "M13 6l6 6-6 6" }))),
        React.createElement("div", { style: { ...M.rise(p, 5), fontFamily: FB, fontWeight: 700, fontSize: 35, color: theme.paper, marginTop: 40 } }, scene.url || "jungletrek.travel")));
  }

  const SCENE_MAP = { Hook, Statement, Feature, Montage, Stats, CTA };
  const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.35 };

  function JungleTrek() {
    const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
    const [t, setTweak] = useTweaks(defaults);
    const theme = {
      W, H,
      deep: t.deep || "#17301f", leaf: t.leaf || "#4e8a4a", leafDark: "#27502e",
      fly: t.fly || "#cde34f", mist: "#bfe6c8", paper: "#f1e9d2",
      brand: t.brand || "Jungle Trek",
      energy: ENERGY[t.motion] ?? 1.0,
      currentBg: "#17301f",
    };
    const scenes = {};
    for (const k in SCENE_MAP) { const C = SCENE_MAP[k]; scenes[k] = (props) => React.createElement(C, { ...props, theme }); }
    return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d1a10" } },
      React.createElement(SceneStage, { width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.deep }, scenes),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, { label: "Deep green", value: theme.deep, options: ["#17301f", "#122436", "#2b2418"], onChange: (v) => setTweak("deep", v) }),
        React.createElement(TweakColor, { label: "Firefly", value: theme.fly, options: ["#cde34f", "#f2c14e", "#7ee0c3"], onChange: (v) => setTweak("fly", v) }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) })));
  }
  window.JungleTrek = JungleTrek;
})();
