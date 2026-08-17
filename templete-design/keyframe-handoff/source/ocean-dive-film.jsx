/* ocean-dive-film.jsx — "Ocean Dive" (9:16, loop). Descent into deep water:
   rising bubble columns, slow-rotating light rays from the surface, a drifting
   fish school, floating content. Comfortaa + Mulish. Exposes window.OceanDive. */
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
    outBack: (t) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
  };
  function hexToRgb(h) { h = (h || "#000").replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const splitLines = (t) => String(t == null ? "" : t).split("|");
  const FH = '"Comfortaa", system-ui, sans-serif';
  const FB = '"Mulish", system-ui, sans-serif';
  const W = 1080, H = 1920, PAD = 74;

  const M = {
    float: (p, i = 0) => { const t = ease.outQuint(clamp01((p - i * 0.06) / 0.44)); return { opacity: t, transform: `translateY(${(1 - t) * 60}px)` }; },
    buoy: (p, i = 0) => { const t = ease.outBack(clamp01((p - i * 0.06) / 0.44)); return { opacity: clamp01(t * 1.5), transform: `translateY(${(1 - t) * 90}px) scale(${lerp(0.8, 1, t)})` }; },
    swimL: (p, i = 0) => { const t = ease.outQuint(clamp01((p - i * 0.055) / 0.4)); return { opacity: t, transform: `translateX(${(1 - t) * -110}px)` }; },
  };

  /* submersion camera: sink, surface, current-push */
  function cam(kind, p, energy, clock) {
    const inn = ease.outQuint(seg(p, 0, 0.26));
    const out = ease.inCubic(seg(p, 0.8, 1));
    const dIn = 1 - inn, k = Math.min(energy, 1.1);
    let fx = 0, fy = 0, fr = 0, fs = 1, fo = 1;
    switch (kind) {
      case "sink": fy = -H * dIn * k; fy += H * 0.26 * out; fr = 2 * dIn; break;
      case "surface": fy = H * dIn * k; fy -= H * 0.26 * out; fr = -2 * dIn; break;
      case "currentL": fx = W * dIn * k; fr = 4 * dIn; fx -= W * 0.28 * out; break;
      case "currentR": fx = -W * dIn * k; fr = -4 * dIn; fx += W * 0.28 * out; break;
      case "pressure": fs = 1 + 0.5 * dIn; fo = inn; break;
      default: fs = 1 - 0.4 * dIn; fo = inn; fr = 6 * dIn;
    }
    const dz = 1 + p * 0.05 * energy;
    const dx = Math.sin(clock * 0.28) * 12 * energy;
    const dy = Math.sin(clock * 0.5) * 14 * energy;
    return {
      frame: { transform: `translate(${fx}px, ${fy}px) rotate(${fr}deg) scale(${fs})`, opacity: fo },
      drift: { transform: `translate(${dx}px, ${dy}px) scale(${dz})`, opacity: 1 - out * 0.3, willChange: "transform" },
    };
  }

  function Fish({ x, y, s = 1, color, flip = false }) {
    return React.createElement("g", { transform: `translate(${x},${y}) scale(${flip ? -s : s},${s})` },
      React.createElement("path", { d: "M0 0 Q 24 -16 48 0 Q 24 16 0 0 Z", fill: color }),
      React.createElement("path", { d: "M46 0 L 62 -10 L 62 10 Z", fill: color }));
  }

  function World({ theme, t }) {
    const bubbles = Array.from({ length: 14 }).map((_, i) => {
      const bx = 70 + (i * 83) % (W - 120) + Math.sin(t * 0.9 + i) * 26;
      const by = H + 60 - ((t * (70 + (i % 4) * 36) + i * 260) % (H + 300));
      return React.createElement("circle", { key: i, cx: bx, cy: by, r: 5 + (i % 4) * 5, fill: "none", stroke: rgba(theme.aqua, 0.4), strokeWidth: 2.5 });
    });
    const school = Array.from({ length: 7 }).map((_, i) => {
      const fx = ((t * 90 + i * 150) % (W + 500)) - 250;
      const fy = H * 0.55 + Math.sin(t * 1.1 + i * 1.4) * 60 + (i % 3) * 70;
      return React.createElement(Fish, { key: i, x: fx, y: fy, s: 0.8 + (i % 3) * 0.25, color: rgba(theme.aqua, 0.5), flip: false });
    });
    return React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
      React.createElement("g", { transform: `rotate(${Math.sin(t * 0.22) * 5} ${W / 2} -200)` },
        [-260, 0, 260].map((off, i) =>
          React.createElement("polygon", { key: i, points: `${W / 2 + off - 130},-40 ${W / 2 + off + 130},-40 ${W / 2 + off + 320},${H * 0.72} ${W / 2 + off - 320},${H * 0.72}`, fill: rgba(theme.aqua, 0.05 + i * 0.012) }))),
      bubbles, school,
      React.createElement("path", { d: `M -40 ${H - 140} q 140 ${-30 + Math.sin(t * 0.7) * 14} 280 0 t 280 0 t 280 0 t 280 0`, stroke: rgba(theme.aqua, 0.25), strokeWidth: 5, fill: "none", strokeLinecap: "round" }),
      Array.from({ length: 5 }).map((_, i) =>
        React.createElement("path", { key: i, d: `M ${90 + i * 220} ${H - 40} q ${Math.sin(t * 1.3 + i) * 18} -70 0 -130`, stroke: rgba(theme.coral, 0.5), strokeWidth: 8, fill: "none", strokeLinecap: "round" })));
  }

  function MediaSlot({ src, label, radius = 26, style, fg, compact }) {
    const line = fg || "#eafaf6";
    const base = { width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", ...style };
    if (src) return React.createElement("img", { src, style: { ...base, objectFit: "cover", display: "block" } });
    return React.createElement("div", { style: { ...base, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: rgba(line, 0.05), border: `3px dashed ${rgba(line, 0.38)}`, textAlign: "center", padding: 16 } },
      React.createElement("svg", { width: compact ? 30 : 40, height: compact ? 30 : 40, viewBox: "0 0 24 24", fill: "none", stroke: rgba(line, 0.6), strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
        React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
        React.createElement("path", { d: "M21 16l-5-5L5 19" })),
      !compact && React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 15, letterSpacing: "0.12em", color: rgba(line, 0.75) } }, "DROP IMAGE TO REPLACE"),
      !compact && label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 13, color: rgba(line, 0.5) } }, label));
  }

  function Chrome({ theme, fg }) {
    return React.createElement("div", { style: { position: "absolute", top: 58, left: PAD, display: "flex", alignItems: "center", gap: 15, zIndex: 6 } },
      React.createElement("div", { style: { width: 47, height: 47, borderRadius: 999, background: fg, display: "flex", alignItems: "center", justifyContent: "center" } },
        React.createElement("svg", { width: 27, height: 27, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("path", { d: "M2 12c2-3 5-5 10-5s8 2 10 5c-2 3-5 5-10 5s-8-2-10-5Z" }),
          React.createElement("circle", { cx: 12, cy: 12, r: 2.5 }))),
      React.createElement("span", { style: { fontFamily: FH, fontWeight: 700, fontSize: 31, color: fg } }, theme.brand));
  }

  function Frame({ progress, theme, bg, fg, world, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0 };
    const CAMS = ["pressure", "sink", "currentR", "surface", "currentL", "spin"];
    const c = cam(CAMS[(sc.index * 5 + 2) % CAMS.length], progress, theme.energy, clock);
    theme.currentBg = bg;
    return React.createElement("div", { style: { position: "absolute", inset: 0, ...c.frame, willChange: "transform, opacity" } },
      React.createElement("div", { style: { position: "absolute", inset: 0, background: `linear-gradient(180deg, ${theme.shallow} 0%, ${bg} 55%, ${theme.abyss} 100%)`, overflow: "hidden", fontFamily: FB } },
        world && React.createElement(World, { theme, t: clock }),
        React.createElement("div", { style: { position: "absolute", inset: 0, ...c.drift } }, children),
        React.createElement(Chrome, { theme, fg })));
  }

  const Title = (txt, p, fg, hi, size, from = 0) =>
    splitLines(txt).map((ln, i) =>
      React.createElement("div", { key: i, style: { ...M.float(p, from + i), fontFamily: FH, fontWeight: 700, fontSize: size, lineHeight: 1.1, color: i === 1 ? hi : fg } }, ln));

  function Hook({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.mid, fg: theme.paper, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 660 } },
        React.createElement("div", { style: { ...M.buoy(p, 0), display: "inline-block", padding: "13px 28px", borderRadius: 999, background: rgba(theme.aqua, 0.18), border: `2px solid ${rgba(theme.aqua, 0.6)}`, color: theme.aqua, fontFamily: FB, fontWeight: 800, fontSize: 24, letterSpacing: "0.2em", marginBottom: 40 } }, scene.kicker || "DEPTH: 20 METRES"),
        Title(scene.title || "Go where|it's quiet.", p, theme.paper, theme.aqua, 122, 1),
        React.createElement("div", { style: { ...M.float(p, 4), fontFamily: FB, fontWeight: 600, fontSize: 35, color: rgba(theme.paper, 0.75), marginTop: 36, maxWidth: 720 } }, scene.sub || "Thirty feet down, the week stops existing.")));
  }

  function Statement({ progress: p, scene, theme }) {
    const clock = useTimeline().time;
    return React.createElement(Frame, { progress: p, theme, bg: theme.abyss, fg: theme.paper, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        Array.from({ length: 10 }).map((_, i) =>
          React.createElement("circle", { key: i, cx: 100 + (i * 107) % (W - 160), cy: H + 40 - ((clock * (54 + i * 12) + i * 210) % (H + 200)), r: 4 + (i % 3) * 4, fill: "none", stroke: rgba(theme.aqua, 0.3), strokeWidth: 2 })),
        React.createElement(Fish, { x: W * 0.7 + Math.sin(clock * 0.6) * 60, y: 420, s: 1.6, color: rgba(theme.coral, 0.75), flip: true })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 660 } },
        Title(scene.title || "Deeper|is calmer.", p, theme.paper, theme.coral, 140, 1),
        React.createElement("div", { style: { ...M.float(p, 4), fontFamily: FB, fontWeight: 600, fontSize: 35, color: rgba(theme.paper, 0.7), marginTop: 42, maxWidth: 680 } }, scene.sub || "Pressure outside, none inside.")));
  }

  function Feature({ progress: p, scene, theme }) {
    const chips = (scene.chips && scene.chips.length) ? scene.chips : ["Tank checked", "Buddy paired", "Camera sealed"];
    return React.createElement(Frame, { progress: p, theme, bg: theme.mid, fg: theme.paper, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 250 } },
        Title(scene.title || "The reef at|first light.", p, theme.paper, theme.aqua, 102, 0),
        React.createElement("div", { style: { ...M.buoy(p, 2), margin: "46px auto 42px", width: 936, height: 590, background: rgba("#04222e", 0.85), borderRadius: 34, padding: 14, border: `1px solid ${rgba(theme.aqua, 0.4)}`, boxShadow: `0 34px 70px rgba(2,16,22,0.6)` } },
          React.createElement(MediaSlot, { src: scene.image, radius: 22, label: (scene.imageLabel || "Landscape photo \u2014 16:10"), fg: theme.paper })),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 16 } },
          chips.map((c, i) => React.createElement("div", { key: i, style: { ...M.buoy(p, i + 4), padding: "14px 28px", borderRadius: 999, background: i % 2 === 0 ? theme.aqua : theme.coral, color: "#04222e", fontFamily: FB, fontWeight: 800, fontSize: 27 } }, c)))));
  }

  function Montage({ progress: p, scene, theme }) {
    const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["The wall", "Turtle bay", "The wreck", "Blue hole"];
    return React.createElement(Frame, { progress: p, theme, bg: theme.abyss, fg: theme.paper, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        Array.from({ length: 8 }).map((_, i) =>
          React.createElement("circle", { key: i, cx: 80 + (i * 137) % (W - 140), cy: (i * 251 + 140) % H, r: 3 + (i % 3) * 3, fill: "none", stroke: rgba(theme.aqua, 0.22), strokeWidth: 2 }))),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 260 } },
        Title(scene.title || "Four dives,|one weekend.", p, theme.paper, theme.coral, 100, 0),
        React.createElement("div", { style: { marginTop: 56, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 } },
          tiles.slice(0, 4).map((label, i) =>
            React.createElement("div", { key: i, style: { ...M.buoy(p, i + 2), transform: `rotate(${[-2, 1.5, 2, -1.5][i]}deg)` } },
              React.createElement("div", { style: { height: 298, borderRadius: 30, background: rgba("#04222e", 0.85), border: `1px solid ${rgba(theme.aqua, 0.35)}`, padding: 12 } },
                React.createElement(MediaSlot, { src: (scene.images || [])[i], radius: 20, label: label, fg: theme.paper })),
              React.createElement("div", { style: { fontFamily: FH, fontWeight: 700, fontSize: 27, color: rgba(theme.paper, 0.9), marginTop: 12, textAlign: "center" } }, label))))));
  }

  function Stats({ progress: p, scene, theme }) {
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 32, suffix: "m", label: "deepest point of the day" },
      { to: 61, suffix: "min", label: "of bottom time" },
      { to: 1, suffix: "", label: "very unbothered sea turtle" }];
    const cols = [theme.aqua, theme.coral, theme.paper];
    return React.createElement(Frame, { progress: p, theme, bg: theme.mid, fg: theme.paper, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement("path", { d: "M 0 300 L 60 300 M 0 700 L 60 700 M 0 1100 L 60 1100 M 0 1500 L 60 1500", stroke: rgba(theme.aqua, 0.4), strokeWidth: 4 }),
        React.createElement("path", { d: "M 0 200 L 0 1700", stroke: rgba(theme.aqua, 0.25), strokeWidth: 4 })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 410 } },
        Title(scene.title || "The dive|log says:", p, theme.paper, theme.aqua, 100, 0),
        React.createElement("div", { style: { marginTop: 64, display: "flex", flexDirection: "column", gap: 54 } },
          stats.slice(0, 3).map((st, i) => {
            const e = ease.outCubic(seg(p, 0.12 + i * 0.08, 0.75));
            return React.createElement("div", { key: i, style: { ...M.float(p, i + 2), display: "flex", alignItems: "baseline", gap: 30 } },
              React.createElement("div", { style: { fontFamily: FH, fontWeight: 700, fontSize: 158, lineHeight: 0.9, color: cols[i], fontVariantNumeric: "tabular-nums" } }, Math.round(st.to * e).toLocaleString(), React.createElement("span", { style: { fontSize: 78 } }, st.suffix)),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 33, color: rgba(theme.paper, 0.75), maxWidth: 430 } }, st.label));
          }))));
  }

  function CTA({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.mid, fg: theme.paper, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 500, textAlign: "center" } },
        React.createElement("div", { style: { ...M.buoy(p, 0), width: 148, height: 148, borderRadius: 999, overflow: "hidden", background: rgba("#04222e", 0.8), border: `2px dashed ${rgba(theme.paper, 0.4)}`, margin: "0 auto 42px" } },
          React.createElement(MediaSlot, { src: scene.logo, radius: 999, compact: true, fg: theme.paper })),
        Title(scene.title || "Come up|for air later.", p, theme.paper, theme.aqua, 116, 1),
        React.createElement("div", { style: { ...M.buoy(p, 4), display: "inline-flex", alignItems: "center", gap: 14, marginTop: 52, padding: "26px 54px", borderRadius: 999, background: theme.aqua, color: "#04222e", fontFamily: FH, fontWeight: 700, fontSize: 40, boxShadow: `0 24px 60px rgba(2,16,22,0.5)` } },
          scene.cta || "Book a dive",
          React.createElement("svg", { width: 34, height: 34, viewBox: "0 0 24 24", fill: "none", stroke: "#04222e", strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M5 12h14" }), React.createElement("path", { d: "M13 6l6 6-6 6" }))),
        React.createElement("div", { style: { ...M.float(p, 5), fontFamily: FB, fontWeight: 800, fontSize: 35, color: theme.paper, marginTop: 42 } }, scene.url || "oceandive.blue")));
  }

  const SCENE_MAP = { Hook, Statement, Feature, Montage, Stats, CTA };
  const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.3 };

  function OceanDive() {
    const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
    const [t, setTweak] = useTweaks(defaults);
    const theme = {
      W, H,
      shallow: "#14657a", mid: t.mid || "#0a3d52", abyss: "#06222e",
      aqua: t.aqua || "#57d6c9", coral: t.coral || "#ff8a5c", paper: "#eafaf6",
      brand: t.brand || "Ocean Dive",
      energy: ENERGY[t.motion] ?? 1.0,
      currentBg: "#0a3d52",
    };
    const scenes = {};
    for (const k in SCENE_MAP) { const C = SCENE_MAP[k]; scenes[k] = (props) => React.createElement(C, { ...props, theme }); }
    return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#04141c" } },
      React.createElement(SceneStage, { width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.mid }, scenes),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, { label: "Water", value: theme.mid, options: ["#0a3d52", "#0d2b4a", "#0f4a44"], onChange: (v) => setTweak("mid", v) }),
        React.createElement(TweakColor, { label: "Aqua glow", value: theme.aqua, options: ["#57d6c9", "#7ab8ff", "#9fe07a"], onChange: (v) => setTweak("aqua", v) }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) })));
  }
  window.OceanDive = OceanDive;
})();
