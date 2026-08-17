/* campfire-tales-film.jsx — "Campfire Tales" (9:16, loop). A story told around a
   fire: flickering flames, rising sparks, twinkling constellation lines, pine
   silhouettes. Chapter-book copy. Caveat + Andada Pro. Exposes window.CampfireTales. */
(function () {
  const { SceneStage } = window;
  const AMBIENT = 1.7;
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
    outBack: (t) => { const c = 1.8; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
  };
  function hexToRgb(h) { h = (h || "#000").replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const splitLines = (t) => String(t == null ? "" : t).split("|");
  const FH = '"Caveat", cursive';
  const FB = '"Andada Pro", Georgia, serif';
  const W = 1080, H = 1920, PAD = 76;

  const M = {
    ember: (p, i = 0) => { const t = ease.outQuint(clamp01((p - i * 0.07) / 0.44)); return { opacity: t, transform: `translateY(${(1 - t) * 52}px)` }; },
    kindle: (p, i = 0) => { const t = ease.outBack(clamp01((p - i * 0.07) / 0.42)); return { opacity: clamp01(t * 1.5), transform: `scale(${lerp(0.7, 1, t)})` }; },
    pageIn: (p, i = 0) => { const t = ease.outQuint(clamp01((p - i * 0.06) / 0.42)); return { opacity: t, transform: `translateX(${(1 - t) * 90}px) rotate(${(1 - t) * 2}deg)` }; },
  };

  /* storybook camera: page turns and ember drifts */
  function cam(kind, p, energy, clock) {
    const inn = ease.outQuint(seg(p, 0, 0.25));
    const out = ease.inCubic(seg(p, 0.8, 1));
    const dIn = 1 - inn, k = Math.min(energy, 1.1);
    let fx = 0, fy = 0, fr = 0, fs = 1, fo = 1;
    switch (kind) {
      case "pageL": fx = W * dIn * k; fr = 3 * dIn; fx -= W * 0.26 * out; fr -= 2 * out; break;
      case "pageR": fx = -W * dIn * k; fr = -3 * dIn; fx += W * 0.26 * out; fr += 2 * out; break;
      case "emberUp": fy = H * dIn * k; fy -= H * 0.22 * out; break;
      case "settleDown": fy = -H * dIn * k; fy += H * 0.22 * out; break;
      case "lean": fs = 1 + 0.45 * dIn; fo = inn; fr = -3 * dIn; break;
      default: fs = 1 - 0.35 * dIn; fo = inn; fr = 5 * dIn;
    }
    const dz = 1 + p * 0.05 * energy;
    const dx = Math.sin(clock * 0.3) * 8 * energy;
    const dy = Math.cos(clock * 0.44) * 7 * energy - p * 10;
    return {
      frame: { transform: `translate(${fx}px, ${fy}px) rotate(${fr}deg) scale(${fs})`, opacity: fo },
      drift: { transform: `translate(${dx}px, ${dy}px) scale(${dz})`, opacity: 1 - out * 0.32, willChange: "transform" },
    };
  }

  function World({ theme, t }) {
    const flick = 0.8 + Math.sin(t * 7) * 0.1 + Math.sin(t * 13.7) * 0.06;
    const sparks = Array.from({ length: 10 }).map((_, i) => {
      const ph = ((t * (0.24 + (i % 4) * 0.07) + i / 10) % 1);
      const sx = W * 0.5 + Math.sin(ph * 9 + i) * (34 + ph * 70) + (i % 2 ? 30 : -30);
      const sy = H - 400 - ph * 820;
      return React.createElement("circle", { key: i, cx: sx, cy: sy, r: 3.5 + (i % 3), fill: rgba(theme.flame, (1 - ph) * 0.85) });
    });
    const stars = Array.from({ length: 16 }).map((_, i) =>
      React.createElement("circle", { key: i, cx: (i * 173 + 60) % W, cy: (i * 97 + 60) % (H * 0.42), r: 2 + (i % 2), fill: rgba("#ffffff", 0.3 + 0.5 * Math.abs(Math.sin(t * 0.9 + i * 1.9))) }));
    return React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
      stars,
      React.createElement("path", { d: `M 120 620 L 320 560 L 560 640 L 800 540 L 960 610`, stroke: rgba("#ffffff", 0.25), strokeWidth: 2, fill: "none", strokeDasharray: "3 10" }),
      React.createElement("path", { d: `M -30 ${H - 240} L 130 ${H - 560} L 290 ${H - 240} Z`, fill: theme.pine }),
      React.createElement("path", { d: `M ${W - 260} ${H - 240} L ${W - 110} ${H - 600} L ${W + 40} ${H - 240} Z`, fill: theme.pine }),
      React.createElement("ellipse", { cx: W * 0.5, cy: H - 330, rx: 420, ry: 200, fill: rgba(theme.flame, 0.1 * flick) }),
      React.createElement("g", { transform: `translate(${W * 0.5},${H - 360})` },
        React.createElement("rect", { x: -110, y: 44, width: 220, height: 22, rx: 11, fill: theme.log, transform: "rotate(-7)" }),
        React.createElement("rect", { x: -110, y: 44, width: 220, height: 22, rx: 11, fill: theme.log, transform: "rotate(7)" }),
        React.createElement("g", { transform: `scale(${0.94 + flick * 0.1})` },
          React.createElement("path", { d: "M0 30 C -66 -8 -40 -80 -6 -122 C 8 -84 40 -80 46 -34 C 50 -6 34 26 0 30 Z", fill: theme.flame, opacity: 0.92 }),
          React.createElement("path", { d: "M0 22 C -34 -4 -22 -48 0 -76 C 16 -48 28 -30 24 -8 C 20 12 14 22 0 22 Z", fill: theme.glow })),
        sparks.length ? null : null),
      sparks);
  }

  function MediaSlot({ src, label, radius = 16, style, fg, compact }) {
    const line = fg || "#f4ecdd";
    const base = { width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", ...style };
    if (src) return React.createElement("img", { src, style: { ...base, objectFit: "cover", display: "block" } });
    return React.createElement("div", { style: { ...base, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: rgba(line, 0.05), border: `3px dashed ${rgba(line, 0.38)}`, textAlign: "center", padding: 16 } },
      React.createElement("svg", { width: compact ? 30 : 40, height: compact ? 30 : 40, viewBox: "0 0 24 24", fill: "none", stroke: rgba(line, 0.6), strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
        React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
        React.createElement("path", { d: "M21 16l-5-5L5 19" })),
      !compact && React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 15, letterSpacing: "0.1em", color: rgba(line, 0.75) } }, "DROP IMAGE TO REPLACE"),
      !compact && label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 400, fontSize: 13, color: rgba(line, 0.5) } }, label));
  }

  function Chrome({ theme, fg }) {
    return React.createElement("div", { style: { position: "absolute", top: 58, left: PAD, display: "flex", alignItems: "center", gap: 15, zIndex: 6 } },
      React.createElement("div", { style: { width: 46, height: 46, borderRadius: 999, background: fg, display: "flex", alignItems: "center", justifyContent: "center" } },
        React.createElement("svg", { width: 25, height: 25, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("path", { d: "M12 2c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-3.5 3-5 4-8Z" }),
          React.createElement("path", { d: "M12 14v7M8 21h8" }))),
      React.createElement("span", { style: { fontFamily: FH, fontWeight: 700, fontSize: 38, color: fg } }, theme.brand));
  }

  function Frame({ progress, theme, bg, fg, world, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0 };
    const CAMS = ["lean", "pageR", "emberUp", "pageL", "settleDown", "spin"];
    const c = cam(CAMS[(sc.index * 3 + 1) % CAMS.length], progress, theme.energy, clock);
    theme.currentBg = bg;
    return React.createElement("div", { style: { position: "absolute", inset: 0, ...c.frame, willChange: "transform, opacity" } },
      React.createElement("div", { style: { position: "absolute", inset: 0, background: bg, overflow: "hidden", fontFamily: FB } },
        world && React.createElement(World, { theme, t: clock }),
        React.createElement("div", { style: { position: "absolute", inset: 0, ...c.drift } }, children),
        React.createElement(Chrome, { theme, fg })));
  }

  const Title = (txt, p, fg, hi, size, from = 0) =>
    splitLines(txt).map((ln, i) =>
      React.createElement("div", { key: i, style: { ...M.ember(p, from + i), fontFamily: FH, fontWeight: 700, fontSize: size, lineHeight: 0.96, color: i === 1 ? hi : fg } }, ln));

  const Kicker = (txt, p, theme) =>
    React.createElement("div", { style: { ...M.kindle(p, 0), display: "inline-block", padding: "10px 26px", borderRadius: 999, border: `2px solid ${rgba(theme.glow, 0.65)}`, color: theme.glow, fontFamily: FB, fontWeight: 700, fontSize: 23, letterSpacing: "0.2em", marginBottom: 36 } }, txt);

  function Hook({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.night, fg: theme.paper, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 300 } },
        Kicker(scene.kicker || "CHAPTER ONE", p, theme),
        Title(scene.title || "We lit a fire|and stayed.", p, theme.paper, theme.glow, 136, 1),
        React.createElement("div", { style: { ...M.ember(p, 4), fontFamily: FB, fontWeight: 400, fontSize: 34, fontStyle: "italic", color: rgba(theme.paper, 0.75), marginTop: 34, maxWidth: 720, lineHeight: 1.5 } }, scene.sub || "No signal. No schedule. Just the crack and pop of a very good idea.")));
  }

  function Statement({ progress: p, scene, theme }) {
    const clock = useTimeline().time;
    return React.createElement(Frame, { progress: p, theme, bg: theme.pine, fg: theme.paper, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        Array.from({ length: 8 }).map((_, i) =>
          React.createElement("circle", { key: i, cx: (i * 151 + 90) % W, cy: (i * 233 + 120) % (H * 0.5), r: 2.2, fill: rgba("#ffffff", 0.28 + 0.4 * Math.abs(Math.sin(clock + i))) })),
        React.createElement("ellipse", { cx: W * 0.5, cy: H - 120, rx: 620, ry: 260, fill: rgba(theme.flame, 0.08 + Math.sin(clock * 6) * 0.02 + 0.02) })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 620 } },
        Title(scene.title || "Stories are|better warm.", p, theme.paper, theme.flame, 148, 1),
        React.createElement("div", { style: { ...M.ember(p, 4), fontFamily: FB, fontWeight: 400, fontStyle: "italic", fontSize: 34, color: rgba(theme.paper, 0.72), marginTop: 42, maxWidth: 700, lineHeight: 1.5 } }, scene.sub || "Everyone leans in when the flames get low.")));
  }

  function Feature({ progress: p, scene, theme }) {
    const chips = (scene.chips && scene.chips.length) ? scene.chips : ["Blankets out", "Cocoa poured", "Phones away"];
    return React.createElement(Frame, { progress: p, theme, bg: theme.night, fg: theme.paper, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 250 } },
        Title(scene.title || "The clearing|we found.", p, theme.paper, theme.glow, 104, 0),
        React.createElement("div", { style: { ...M.pageIn(p, 2), margin: "44px auto 42px", width: 936, height: 588, background: theme.paper, borderRadius: 18, padding: 16, boxShadow: `0 30px 66px rgba(8,10,16,0.6)`, transform: "rotate(-1deg)" } },
          React.createElement(MediaSlot, { src: scene.image, radius: 8, label: (scene.imageLabel || "Landscape photo \u2014 16:10"), fg: theme.ink })),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 16 } },
          chips.map((c, i) => React.createElement("div", { key: i, style: { ...M.kindle(p, i + 4), padding: "13px 26px", borderRadius: 999, background: i % 2 === 0 ? theme.flame : theme.log, color: theme.paper, fontFamily: FB, fontWeight: 700, fontSize: 26 } }, c)))));
  }

  function Montage({ progress: p, scene, theme }) {
    const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["Dusk", "First flame", "The story", "Embers"];
    return React.createElement(Frame, { progress: p, theme, bg: theme.pine, fg: theme.paper, world: false },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 260 } },
        Title(scene.title || "How the night|went down.", p, theme.paper, theme.glow, 102, 0),
        React.createElement("div", { style: { marginTop: 56, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 } },
          tiles.slice(0, 4).map((label, i) =>
            React.createElement("div", { key: i, style: { ...M.pageIn(p, i + 2), transform: `rotate(${[-2.5, 2, 1.5, -2][i]}deg)` } },
              React.createElement("div", { style: { height: 292, background: theme.paper, borderRadius: 12, padding: 12, boxShadow: `0 22px 46px rgba(8,10,16,0.5)` } },
                React.createElement(MediaSlot, { src: (scene.images || [])[i], radius: 6, label: label, fg: theme.ink, compact: true })),
              React.createElement("div", { style: { fontFamily: FH, fontWeight: 700, fontSize: 34, color: theme.glow, marginTop: 12, textAlign: "center" } }, label))))));
  }

  function Stats({ progress: p, scene, theme }) {
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 3, suffix: "", label: "ghost stories, one actually scary" },
      { to: 14, suffix: "", label: "marshmallows, zero survivors" },
      { to: 2, suffix: "am", label: "when the last log gave in" }];
    const cols = [theme.flame, theme.glow, theme.paper];
    return React.createElement(Frame, { progress: p, theme, bg: theme.night, fg: theme.paper, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        Array.from({ length: 12 }).map((_, i) =>
          React.createElement("circle", { key: i, cx: (i * 167 + 70) % W, cy: (i * 139 + 80) % (H * 0.36), r: 2, fill: rgba("#ffffff", 0.35) }))),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 420 } },
        Title(scene.title || "Tallied by|firelight.", p, theme.paper, theme.flame, 104, 0),
        React.createElement("div", { style: { marginTop: 64, display: "flex", flexDirection: "column", gap: 54 } },
          stats.slice(0, 3).map((st, i) => {
            const e = ease.outCubic(seg(p, 0.12 + i * 0.08, 0.75));
            return React.createElement("div", { key: i, style: { ...M.ember(p, i + 2), display: "flex", alignItems: "baseline", gap: 32 } },
              React.createElement("div", { style: { fontFamily: FH, fontWeight: 700, fontSize: 190, lineHeight: 0.8, color: cols[i], fontVariantNumeric: "tabular-nums" } }, Math.round(st.to * e).toLocaleString(), React.createElement("span", { style: { fontSize: 96 } }, st.suffix)),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 400, fontStyle: "italic", fontSize: 33, color: rgba(theme.paper, 0.78), maxWidth: 440, lineHeight: 1.4 } }, st.label));
          }))));
  }

  function CTA({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.night, fg: theme.paper, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 420, textAlign: "center" } },
        Kicker(scene.kicker || "THE LAST CHAPTER", p, theme),
        React.createElement("div", { style: { ...M.kindle(p, 1), width: 146, height: 146, borderRadius: 999, overflow: "hidden", background: rgba(theme.paper, 0.07), border: `2px dashed ${rgba(theme.paper, 0.4)}`, margin: "26px auto 40px" } },
          React.createElement(MediaSlot, { src: scene.logo, radius: 999, compact: true, fg: theme.paper })),
        Title(scene.title || "Save a log|for next time.", p, theme.paper, theme.glow, 118, 1),
        React.createElement("div", { style: { ...M.kindle(p, 5), display: "inline-flex", alignItems: "center", gap: 14, marginTop: 50, padding: "24px 52px", borderRadius: 999, background: theme.flame, color: "#1c130a", fontFamily: FH, fontWeight: 700, fontSize: 44 } },
          scene.cta || "Join the circle",
          React.createElement("svg", { width: 34, height: 34, viewBox: "0 0 24 24", fill: "none", stroke: "#1c130a", strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M5 12h14" }), React.createElement("path", { d: "M13 6l6 6-6 6" }))),
        React.createElement("div", { style: { ...M.ember(p, 6), fontFamily: FB, fontWeight: 700, fontSize: 34, color: rgba(theme.paper, 0.85), marginTop: 40 } }, scene.url || "campfiretales.camp")));
  }

  const SCENE_MAP = { Hook, Statement, Feature, Montage, Stats, CTA };
  const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.3 };

  function CampfireTales() {
    const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
    const [t, setTweak] = useTweaks(defaults);
    const theme = {
      W, H,
      night: t.night || "#1b2233", pine: t.pine || "#2e4038", flame: t.flame || "#f2913d",
      glow: "#f7c66b", log: "#6b4a32", paper: "#f4ecdd", ink: "#241f18",
      brand: t.brand || "Campfire Tales",
      energy: ENERGY[t.motion] ?? 1.0,
      currentBg: "#1b2233",
    };
    const scenes = {};
    for (const k in SCENE_MAP) { const C = SCENE_MAP[k]; scenes[k] = (props) => React.createElement(C, { ...props, theme }); }
    return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#10141f" } },
      React.createElement(SceneStage, { width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.night }, scenes),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, { label: "Night sky", value: theme.night, options: ["#1b2233", "#141b2a", "#231e2e"], onChange: (v) => setTweak("night", v) }),
        React.createElement(TweakColor, { label: "Flame", value: theme.flame, options: ["#f2913d", "#e86a4a", "#f2b13d"], onChange: (v) => setTweak("flame", v) }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) })));
  }
  window.CampfireTales = CampfireTales;
})();
