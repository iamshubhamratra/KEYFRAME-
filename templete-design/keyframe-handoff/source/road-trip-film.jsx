/* road-trip-film.jsx — "Road Trip" (9:16, loop). Friends on the road: paper-map
   ground, a dashed route drawing itself, a scooting van, popping location pins,
   taped polaroids. Permanent Marker + Karla. Exposes window.RoadTrip. */
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
    outBack: (t) => { const c = 2.0; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
  };
  function hexToRgb(h) { h = (h || "#000").replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const splitLines = (t) => String(t == null ? "" : t).split("|");
  const FH = '"Permanent Marker", cursive';
  const FB = '"Karla", system-ui, sans-serif';
  const W = 1080, H = 1920, PAD = 70;

  const M = {
    stamp: (p, i = 0) => { const t = ease.outBack(clamp01((p - i * 0.06) / 0.32)); return { opacity: clamp01(t * 2), transform: `scale(${lerp(1.7, 1, clamp01(t))}) rotate(${(1 - t) * 6}deg)` }; },
    rise: (p, i = 0) => { const t = ease.outQuint(clamp01((p - i * 0.055) / 0.38)); return { opacity: t, transform: `translateY(${(1 - t) * 42}px)` }; },
    drop: (p, i = 0) => { const t = ease.outBack(clamp01((p - i * 0.08) / 0.4)); return { opacity: clamp01(t * 1.8), transform: `translateY(${(1 - t) * -120}px) rotate(${(1 - t) * -10}deg)` }; },
  };

  /* drive-flavoured camera: swerves and odometer punches */
  function cam(kind, p, energy, clock) {
    const inn = ease.outQuint(seg(p, 0, 0.23));
    const out = ease.inCubic(seg(p, 0.81, 1));
    const dIn = 1 - inn, k = Math.min(energy, 1.15);
    let fx = 0, fy = 0, fr = 0, fs = 1, fo = 1;
    switch (kind) {
      case "swerveL": fx = W * dIn * k; fr = 5 * dIn; fx -= W * 0.3 * out; fr -= 3 * out; break;
      case "swerveR": fx = -W * dIn * k; fr = -5 * dIn; fx += W * 0.3 * out; fr += 3 * out; break;
      case "hill": fy = H * dIn * k; fs = 1 - 0.12 * dIn; fy -= H * 0.24 * out; break;
      case "dip": fy = -H * dIn * k; fs = 1 + 0.1 * dIn; fy += H * 0.24 * out; break;
      case "odometer": fs = 1 + 0.5 * dIn; fo = inn; fr = 3 * dIn; break;
      default: fs = 1 - 0.4 * dIn; fo = inn; fr = -6 * dIn;
    }
    const dz = 1 + p * 0.055 * energy;
    const dx = Math.sin(clock * 0.4) * 8 * energy - p * 16;
    const dy = Math.sin(clock * 1.6) * 3.5 * energy;
    return {
      frame: { transform: `translate(${fx}px, ${fy}px) rotate(${fr}deg) scale(${fs})`, opacity: fo },
      drift: { transform: `translate(${dx}px, ${dy}px) scale(${dz})`, opacity: 1 - out * 0.35, willChange: "transform" },
    };
  }

  function Van({ x, y, s = 1, color, windows, t }) {
    const bob = Math.sin(t * 5) * 2.5;
    return React.createElement("g", { transform: `translate(${x},${y + bob}) scale(${s})` },
      React.createElement("rect", { x: -70, y: -52, width: 140, height: 52, rx: 16, fill: color }),
      React.createElement("rect", { x: -70, y: -18, width: 140, height: 20, rx: 8, fill: color }),
      React.createElement("rect", { x: -52, y: -44, width: 34, height: 24, rx: 6, fill: windows }),
      React.createElement("rect", { x: -8, y: -44, width: 34, height: 24, rx: 6, fill: windows }),
      React.createElement("circle", { cx: -38, cy: 6, r: 15, fill: "#2e2a26" }),
      React.createElement("circle", { cx: 42, cy: 6, r: 15, fill: "#2e2a26" }),
      React.createElement("circle", { cx: -38, cy: 6, r: 6, fill: windows }),
      React.createElement("circle", { cx: 42, cy: 6, r: 6, fill: windows }),
      React.createElement("rect", { x: -74, y: -60, width: 148, height: 10, rx: 5, fill: rgba("#2e2a26", 0.8) }));
  }

  function World({ theme, t, p }) {
    const route = "M -60 1560 C 240 1450 180 1180 470 1120 C 760 1060 700 830 980 760 C 1130 720 1160 640 1140 560";
    const len = 2100;
    const draw = seg(p, 0.05, 0.92);
    const vx = -60 + (1140 - -60) * draw;
    const pins = [[470, 1120], [980, 760]];
    return React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
      Array.from({ length: 5 }).map((_, i) =>
        React.createElement("circle", { key: i, cx: (i * 260 + 120) % W, cy: (i * 460 + 240) % H, r: 60 + (i % 3) * 26, fill: "none", stroke: rgba(theme.ink, 0.07), strokeWidth: 2 })),
      React.createElement("path", { d: "M 90 300 l 40 0 m -20 -20 l 0 40", stroke: rgba(theme.ink, 0.16), strokeWidth: 5, strokeLinecap: "round" }),
      React.createElement("path", { d: route, fill: "none", stroke: rgba(theme.route, 0.25), strokeWidth: 12, strokeLinecap: "round", strokeDasharray: "2 30" }),
      React.createElement("path", { d: route, fill: "none", stroke: theme.route, strokeWidth: 12, strokeLinecap: "round", strokeDasharray: `${len}`, strokeDashoffset: `${len * (1 - draw)}`, opacity: 0.9 }),
      pins.map(([px, py], i) => {
        const on = draw > (i === 0 ? 0.33 : 0.68);
        const e = ease.outBack(clamp01((draw - (i === 0 ? 0.33 : 0.68)) * 8));
        return React.createElement("g", { key: i, transform: `translate(${px},${py - 40}) scale(${on ? e : 0})` },
          React.createElement("path", { d: "M0 34 C -22 8 -24 -8 -12 -22 C -4 -30 4 -30 12 -22 C 24 -8 22 8 0 34 Z", fill: theme.ink }),
          React.createElement("circle", { cx: 0, cy: -8, r: 9, fill: theme.paper }));
      }),
      React.createElement(Van, { x: vx, y: 1520 - draw * 940, s: 1.15, color: theme.van, windows: theme.sky, t }));
  }

  function MediaSlot({ src, label, radius = 6, style, fg, compact }) {
    const line = fg || "#33291f";
    const base = { width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", ...style };
    if (src) return React.createElement("img", { src, style: { ...base, objectFit: "cover", display: "block" } });
    return React.createElement("div", { style: { ...base, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: rgba(line, 0.06), border: `3px dashed ${rgba(line, 0.4)}`, textAlign: "center", padding: 14 } },
      React.createElement("svg", { width: compact ? 30 : 38, height: compact ? 30 : 38, viewBox: "0 0 24 24", fill: "none", stroke: rgba(line, 0.6), strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
        React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
        React.createElement("path", { d: "M21 16l-5-5L5 19" })),
      !compact && React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 14, letterSpacing: "0.12em", color: rgba(line, 0.7) } }, "DROP IMAGE TO REPLACE"),
      !compact && label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 13, color: rgba(line, 0.5) } }, label));
  }

  function Polaroid({ children, caption, tilt = 0, theme, style }) {
    return React.createElement("div", { style: { background: "#ffffff", padding: "14px 14px 0", borderRadius: 8, boxShadow: `0 22px 44px ${rgba("#33291f", 0.25)}`, transform: `rotate(${tilt}deg)`, ...style } },
      React.createElement("div", { style: { position: "absolute", top: -16, left: "50%", width: 110, height: 34, background: rgba(theme.sun, 0.75), transform: "translateX(-50%) rotate(-3deg)", borderRadius: 4 } }),
      children,
      React.createElement("div", { style: { fontFamily: FH, fontSize: 26, color: "#33291f", padding: "10px 4px 14px", textAlign: "center" } }, caption));
  }

  function Chrome({ theme, fg }) {
    return React.createElement("div", { style: { position: "absolute", top: 56, left: PAD, display: "flex", alignItems: "center", gap: 15, zIndex: 6 } },
      React.createElement("div", { style: { width: 47, height: 47, borderRadius: 12, background: fg, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-4deg)" } },
        React.createElement("svg", { width: 27, height: 27, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("circle", { cx: 12, cy: 10, r: 3 }),
          React.createElement("path", { d: "M12 2a8 8 0 0 1 8 8c0 5.4-8 12-8 12S4 15.4 4 10a8 8 0 0 1 8-8Z" }))),
      React.createElement("span", { style: { fontFamily: FH, fontSize: 32, color: fg } }, theme.brand));
  }

  function Frame({ progress, theme, bg, fg, world, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0 };
    const CAMS = ["dip", "swerveR", "odometer", "hill", "swerveL", "spinIn"];
    const c = cam(CAMS[(sc.index * 7 + 4) % CAMS.length], progress, theme.energy, clock);
    theme.currentBg = bg;
    return React.createElement("div", { style: { position: "absolute", inset: 0, ...c.frame, willChange: "transform, opacity" } },
      React.createElement("div", { style: { position: "absolute", inset: 0, background: bg, overflow: "hidden", fontFamily: FB } },
        world && React.createElement(World, { theme, t: clock, p: progress }),
        React.createElement("div", { style: { position: "absolute", inset: 0, ...c.drift } }, children),
        React.createElement(Chrome, { theme, fg })));
  }

  const Title = (txt, p, fg, hi, size, from = 0) =>
    splitLines(txt).map((ln, i) =>
      React.createElement("div", { key: i, style: { ...M.stamp(p, from + i), fontFamily: FH, fontSize: size, lineHeight: 1.08, color: i === 1 ? hi : fg } }, ln));

  function Hook({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.paper, fg: theme.ink, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 260 } },
        React.createElement("div", { style: { ...M.stamp(p, 0), display: "inline-block", padding: "12px 26px", background: theme.route, color: "#fff", fontFamily: FB, fontWeight: 800, fontSize: 24, letterSpacing: "0.16em", borderRadius: 8, transform: "rotate(-2deg)", marginBottom: 36 } }, scene.kicker || "FIVE FRIENDS \u2022 ONE VAN"),
        Title(scene.title || "No plan.|Full tank.", p, theme.ink, theme.route, 128, 1),
        React.createElement("div", { style: { ...M.rise(p, 4), fontFamily: FB, fontWeight: 700, fontSize: 35, color: rgba(theme.ink, 0.72), marginTop: 32, maxWidth: 720 } }, scene.sub || "Windows down, playlist up, and the map is more of a suggestion.")));
  }

  function Statement({ progress: p, scene, theme }) {
    const clock = useTimeline().time;
    return React.createElement(Frame, { progress: p, theme, bg: theme.van, fg: "#ffffff", world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement("path", { d: `M -40 ${H - 420} q 270 ${-60 + Math.sin(clock) * 20} 560 0 t 600 0`, stroke: rgba("#ffffff", 0.25), strokeWidth: 10, strokeDasharray: "40 30", strokeDashoffset: -clock * 90, fill: "none" }),
        React.createElement(Van, { x: W * 0.72, y: H - 470, s: 1.6, color: theme.paper, windows: theme.van, t: clock })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 560 } },
        Title(scene.title || "The detour|is the trip.", p, "#ffffff", theme.sun, 150, 1),
        React.createElement("div", { style: { ...M.rise(p, 4), fontFamily: FB, fontWeight: 700, fontSize: 35, color: rgba("#ffffff", 0.75), marginTop: 40, maxWidth: 700 } }, scene.sub || "Best stops are the unplanned ones.")));
  }

  function Feature({ progress: p, scene, theme }) {
    const chips = (scene.chips && scene.chips.length) ? scene.chips : ["Gas station snacks", "Golden hour", "Wrong turns: worth it"];
    return React.createElement(Frame, { progress: p, theme, bg: theme.sun, fg: theme.ink, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement("circle", { cx: W - 110, cy: 260, r: 130, fill: rgba("#ffffff", 0.35) }),
        React.createElement("path", { d: `M -40 ${H - 180} q 300 -60 620 0 t 560 0`, stroke: rgba(theme.ink, 0.15), strokeWidth: 8, strokeDasharray: "34 26", fill: "none" })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 260 } },
        Title(scene.title || "Stop no. 7:|worth it.", p, theme.ink, theme.route, 110, 0),
        React.createElement("div", { style: { ...M.drop(p, 2), position: "relative", margin: "50px auto 44px", width: 900 } },
          React.createElement(Polaroid, { theme, tilt: -2, caption: scene.imageCaption || "the view from the pass" },
            React.createElement("div", { style: { width: "100%", height: 540 } },
              React.createElement(MediaSlot, { src: scene.image, radius: 4, label: "Landscape photo \u2014 16:10", fg: theme.ink })))),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" } },
          chips.map((c, i) => React.createElement("div", { key: i, style: { ...M.stamp(p, i + 5), padding: "14px 26px", borderRadius: 10, background: i % 2 === 0 ? theme.ink : theme.route, color: "#fff", fontFamily: FB, fontWeight: 800, fontSize: 27, transform: `rotate(${(i % 2) * 2 - 1}deg)` } }, c)))));
  }

  function Montage({ progress: p, scene, theme }) {
    const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["Mile 0", "The diner", "Summit", "Campsite"];
    const tilts = [-3.5, 2.5, 3, -2];
    return React.createElement(Frame, { progress: p, theme, bg: theme.paper, fg: theme.ink, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement("path", { d: "M 80 240 C 300 1700 800 200 1000 1680", stroke: rgba(theme.route, 0.18), strokeWidth: 10, strokeDasharray: "2 26", strokeLinecap: "round", fill: "none" })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 250 } },
        Title(scene.title || "Four stops,|zero regrets.", p, theme.ink, theme.route, 106, 0),
        React.createElement("div", { style: { marginTop: 56, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 } },
          tiles.slice(0, 4).map((label, i) =>
            React.createElement("div", { key: i, style: { ...M.drop(p, i + 2), position: "relative" } },
              React.createElement(Polaroid, { theme, tilt: tilts[i], caption: label },
                React.createElement("div", { style: { width: "100%", height: 250 } },
                  React.createElement(MediaSlot, { src: (scene.images || [])[i], radius: 4, label: label, fg: theme.ink, compact: true }))))))));
  }

  function Stats({ progress: p, scene, theme }) {
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 1240, suffix: "", label: "miles on the odometer" },
      { to: 9, suffix: "", label: "roadside attractions visited" },
      { to: 1, suffix: "", label: "playlist, on repeat, no shame" }];
    const cols = [theme.route, theme.van, theme.sun];
    return React.createElement(Frame, { progress: p, theme, bg: theme.ink, fg: theme.paper, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement("path", { d: `M -40 ${H - 260} q 300 -50 620 0 t 560 0`, stroke: rgba(theme.paper, 0.15), strokeWidth: 8, strokeDasharray: "36 28", fill: "none" })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 400 } },
        Title(scene.title || "Trip math.", p, theme.paper, theme.sun, 110, 0),
        React.createElement("div", { style: { marginTop: 64, display: "flex", flexDirection: "column", gap: 54 } },
          stats.slice(0, 3).map((st, i) => {
            const e = ease.outCubic(seg(p, 0.12 + i * 0.08, 0.75));
            return React.createElement("div", { key: i, style: { ...M.rise(p, i + 2), display: "flex", alignItems: "baseline", gap: 30 } },
              React.createElement("div", { style: { fontFamily: FH, fontSize: 158, lineHeight: 0.9, color: cols[i], fontVariantNumeric: "tabular-nums" } }, Math.round(st.to * e).toLocaleString(), React.createElement("span", { style: { fontSize: 80 } }, st.suffix)),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 33, color: rgba(theme.paper, 0.75), maxWidth: 440 } }, st.label));
          }))));
  }

  function CTA({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.route, fg: "#ffffff", world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement("path", { d: "M 540 -40 L 540 1960", stroke: rgba("#ffffff", 0.18), strokeWidth: 12, strokeDasharray: "56 44" })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 460, textAlign: "center" } },
        React.createElement("div", { style: { ...M.stamp(p, 0), width: 148, height: 148, borderRadius: 20, overflow: "hidden", background: "#ffffff", margin: "0 auto 42px", transform: "rotate(-3deg)", boxShadow: `0 20px 44px ${rgba("#33291f", 0.3)}` } },
          React.createElement(MediaSlot, { src: scene.logo, radius: 14, compact: true, fg: theme.ink })),
        Title(scene.title || "Shotgun|is open.", p, "#ffffff", theme.sun, 136, 1),
        React.createElement("div", { style: { ...M.stamp(p, 4), display: "inline-flex", alignItems: "center", gap: 14, marginTop: 52, padding: "26px 52px", borderRadius: 14, background: "#ffffff", color: theme.route, fontFamily: FH, fontSize: 42, transform: "rotate(-1.5deg)", boxShadow: `0 22px 50px ${rgba("#33291f", 0.32)}` } },
          scene.cta || "Get in, loser",
          React.createElement("svg", { width: 34, height: 34, viewBox: "0 0 24 24", fill: "none", stroke: theme.route, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M5 12h14" }), React.createElement("path", { d: "M13 6l6 6-6 6" }))),
        React.createElement("div", { style: { ...M.rise(p, 5), fontFamily: FB, fontWeight: 800, fontSize: 36, color: "#ffffff", marginTop: 42 } }, scene.url || "roadtrip.club")));
  }

  const SCENE_MAP = { Hook, Statement, Feature, Montage, Stats, CTA };
  const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.35 };

  function RoadTrip() {
    const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
    const [t, setTweak] = useTweaks(defaults);
    const theme = {
      W, H,
      paper: t.paper || "#f2e8d5", route: t.route || "#e05e4e", van: t.van || "#3f8f8a",
      sun: "#eec96f", sky: "#cfe8ee", ink: "#33291f",
      brand: t.brand || "Road Trip",
      energy: ENERGY[t.motion] ?? 1.0,
      currentBg: "#f2e8d5",
    };
    const scenes = {};
    for (const k in SCENE_MAP) { const C = SCENE_MAP[k]; scenes[k] = (props) => React.createElement(C, { ...props, theme }); }
    return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1c1712" } },
      React.createElement(SceneStage, { width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.paper }, scenes),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, { label: "Route", value: theme.route, options: ["#e05e4e", "#c94f7c", "#e08a3c"], onChange: (v) => setTweak("route", v) }),
        React.createElement(TweakColor, { label: "Van", value: theme.van, options: ["#3f8f8a", "#4a6fa5", "#6b8f4e"], onChange: (v) => setTweak("van", v) }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) })));
  }
  window.RoadTrip = RoadTrip;
})();
