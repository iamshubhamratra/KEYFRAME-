/* night-drive-film.jsx — "Night Drive" (9:16, loop). Midnight city run: neon
   light trails streaking past, a perspective road with rushing dashes, skyline
   window grids, headlight sweeps. Orbitron + Exo 2. Exposes window.NightDrive. */
(function () {
  const { SceneStage } = window;
  const AMBIENT = 2.1;
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
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  };
  function hexToRgb(h) { h = (h || "#000").replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const splitLines = (t) => String(t == null ? "" : t).split("|");
  const FH = '"Orbitron", system-ui, sans-serif';
  const FB = '"Exo 2", system-ui, sans-serif';
  const W = 1080, H = 1920, PAD = 72;

  const M = {
    streak: (p, i = 0) => { const t = ease.outExpo(clamp01((p - i * 0.05) / 0.34)); return { opacity: t, transform: `translateX(${(1 - t) * 160}px) skewX(${(1 - t) * -14}deg)` }; },
    rise: (p, i = 0) => { const t = ease.outQuint(clamp01((p - i * 0.05) / 0.36)); return { opacity: t, transform: `translateY(${(1 - t) * 40}px)` }; },
    flash: (p, i = 0) => { const t = clamp01((p - i * 0.06) / 0.3); const fl = t < 1 ? (Math.sin(t * 26) > -0.2 ? 1 : 0.25) * t : 1; return { opacity: fl, transform: `scale(${lerp(1.12, 1, ease.outCubic(t))})` }; },
  };

  /* gearshift camera: hard lateral slams with skew, like changing lanes at speed */
  function cam(kind, p, energy, clock) {
    const inn = ease.outExpo(seg(p, 0, 0.2));
    const out = ease.inCubic(seg(p, 0.82, 1));
    const dIn = 1 - inn, k = Math.min(energy, 1.15);
    let fx = 0, fy = 0, fr = 0, fs = 1, fo = 1, sk = 0;
    switch (kind) {
      case "laneL": fx = W * dIn * k; sk = -10 * dIn; fx -= W * 0.3 * out; sk += 6 * out; break;
      case "laneR": fx = -W * dIn * k; sk = 10 * dIn; fx += W * 0.3 * out; sk -= 6 * out; break;
      case "tunnel": fs = 1 + 0.7 * dIn; fo = inn; break;
      case "brake": fs = 1 - 0.3 * dIn; fo = inn; fy = -60 * dIn; break;
      case "overpass": fy = H * dIn * k; fy -= H * 0.24 * out; fr = 2 * dIn; break;
      default: fy = -H * dIn * k; fy += H * 0.24 * out; fr = -2 * dIn;
    }
    const dz = 1 + p * 0.07 * energy;
    const dx = Math.sin(clock * 0.5) * 6 * energy - p * 20;
    const dy = Math.sin(clock * 2.3) * 2.5 * energy;
    return {
      frame: { transform: `translate(${fx}px, ${fy}px) rotate(${fr}deg) skewX(${sk}deg) scale(${fs})`, opacity: fo },
      drift: { transform: `translate(${dx}px, ${dy}px) scale(${dz})`, opacity: 1 - out * 0.35, willChange: "transform" },
    };
  }

  function World({ theme, t }) {
    const trails = Array.from({ length: 9 }).map((_, i) => {
      const speed = 340 + (i % 4) * 140;
      const x = W + 400 - ((t * speed + i * 470) % (W + 900));
      const y = 210 + (i * 173) % (H - 700);
      const len = 180 + (i % 3) * 160;
      const col = i % 3 === 0 ? theme.neon : i % 3 === 1 ? theme.magenta : theme.amber;
      return React.createElement("rect", { key: i, x, y, width: len, height: 5 + (i % 2) * 3, rx: 4, fill: col, opacity: 0.5 + (i % 3) * 0.16 });
    });
    const dashes = Array.from({ length: 6 }).map((_, i) => {
      const ph = ((t * 0.55 + i / 6) % 1);
      const e = ph * ph;
      const y = H * 0.62 + e * (H * 0.38);
      const w = 10 + e * 150;
      return React.createElement("rect", { key: i, x: W / 2 - w / 2, y, width: w, height: 8 + e * 40, rx: 6, fill: rgba(theme.paper, 0.25 + e * 0.4) });
    });
    const windows = Array.from({ length: 24 }).map((_, i) => {
      const bx = 60 + (i % 8) * 130, by = 300 + Math.floor(i / 8) * 90;
      const on = Math.sin(t * 0.7 + i * 2.6) > 0.1;
      return React.createElement("rect", { key: i, x: bx, y: by, width: 30, height: 44, rx: 3, fill: on ? rgba(theme.amber, 0.55) : rgba(theme.paper, 0.07) });
    });
    return React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
      React.createElement("rect", { x: 0, y: 260, width: W, height: 320, fill: rgba(theme.paper, 0.03) }),
      windows, trails,
      React.createElement("path", { d: `M 0 ${H} L ${W * 0.34} ${H * 0.6} L ${W * 0.66} ${H * 0.6} L ${W} ${H} Z`, fill: rgba(theme.paper, 0.045) }),
      dashes,
      React.createElement("ellipse", { cx: W / 2, cy: H * 0.6, rx: 320, ry: 60, fill: rgba(theme.neon, 0.1 + Math.abs(Math.sin(t * 0.8)) * 0.08) }));
  }

  function MediaSlot({ src, label, radius = 14, style, fg, compact }) {
    const line = fg || "#eef2f7";
    const base = { width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", ...style };
    if (src) return React.createElement("img", { src, style: { ...base, objectFit: "cover", display: "block" } });
    return React.createElement("div", { style: { ...base, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: rgba(line, 0.04), border: `2px dashed ${rgba(line, 0.4)}`, textAlign: "center", padding: 16 } },
      React.createElement("svg", { width: compact ? 30 : 40, height: compact ? 30 : 40, viewBox: "0 0 24 24", fill: "none", stroke: rgba(line, 0.6), strokeWidth: 2.25, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
        React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
        React.createElement("path", { d: "M21 16l-5-5L5 19" })),
      !compact && React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 15, letterSpacing: "0.14em", color: rgba(line, 0.75) } }, "DROP IMAGE TO REPLACE"),
      !compact && label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 500, fontSize: 13, color: rgba(line, 0.5) } }, label));
  }

  function Chrome({ theme, fg }) {
    return React.createElement("div", { style: { position: "absolute", top: 58, left: PAD, display: "flex", alignItems: "center", gap: 16, zIndex: 6 } },
      React.createElement("div", { style: { width: 46, height: 46, borderRadius: 10, border: `2px solid ${fg}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 18px ${rgba(theme.neon, 0.5)}` } },
        React.createElement("svg", { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: fg, strokeWidth: 2.25, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("path", { d: "M12 2v4M12 18v4M2 12h4M18 12h4" }),
          React.createElement("circle", { cx: 12, cy: 12, r: 5 }))),
      React.createElement("span", { style: { fontFamily: FH, fontWeight: 700, fontSize: 28, color: fg, letterSpacing: "0.14em", textTransform: "uppercase" } }, theme.brand));
  }

  function Frame({ progress, theme, bg, fg, world, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0 };
    const CAMS = ["tunnel", "laneR", "overpass", "laneL", "brake", "underpass"];
    const c = cam(CAMS[(sc.index * 7 + 2) % CAMS.length], progress, theme.energy, clock);
    theme.currentBg = bg;
    return React.createElement("div", { style: { position: "absolute", inset: 0, ...c.frame, willChange: "transform, opacity" } },
      React.createElement("div", { style: { position: "absolute", inset: 0, background: bg, overflow: "hidden", fontFamily: FB } },
        world && React.createElement(World, { theme, t: clock }),
        React.createElement("div", { style: { position: "absolute", inset: 0, ...c.drift } }, children),
        React.createElement(Chrome, { theme, fg })));
  }

  const Title = (txt, p, fg, hi, size, from = 0) =>
    splitLines(txt).map((ln, i) =>
      React.createElement("div", { key: i, style: { ...M.streak(p, from + i), fontFamily: FH, fontWeight: 800, fontSize: size, lineHeight: 1.08, color: i === 1 ? hi : fg, letterSpacing: "0.02em", textTransform: "uppercase", textShadow: i === 1 ? `0 0 34px ${rgba(hi, 0.65)}` : "none" } }, ln));

  function Hook({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.asphalt, fg: theme.paper, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 700 } },
        React.createElement("div", { style: { ...M.flash(p, 0), display: "inline-block", padding: "12px 26px", borderRadius: 8, border: `2px solid ${theme.neon}`, color: theme.neon, fontFamily: FH, fontWeight: 700, fontSize: 22, letterSpacing: "0.26em", marginBottom: 40, boxShadow: `0 0 24px ${rgba(theme.neon, 0.35)}` } }, scene.kicker || "00:47 AM"),
        Title(scene.title || "The city|never blinks.", p, theme.paper, theme.neon, 108, 1),
        React.createElement("div", { style: { ...M.rise(p, 4), fontFamily: FB, fontWeight: 500, fontSize: 34, color: rgba(theme.paper, 0.72), marginTop: 36, maxWidth: 740 } }, scene.sub || "Empty lanes, full playlist, green lights all the way.")));
  }

  function Statement({ progress: p, scene, theme }) {
    const clock = useTimeline().time;
    return React.createElement(Frame, { progress: p, theme, bg: "#080a10", fg: theme.paper, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        Array.from({ length: 5 }).map((_, i) => {
          const x = W + 300 - ((clock * (420 + i * 90) + i * 500) % (W + 800));
          return React.createElement("rect", { key: i, x, y: 420 + i * 240, width: 300 + i * 40, height: 4, rx: 3, fill: i % 2 === 0 ? rgba(theme.magenta, 0.6) : rgba(theme.neon, 0.6) });
        })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 640 } },
        Title(scene.title || "Speed is|a mood.", p, theme.paper, theme.magenta, 132, 1),
        React.createElement("div", { style: { ...M.rise(p, 4), fontFamily: FB, fontWeight: 500, fontSize: 34, color: rgba(theme.paper, 0.68), marginTop: 42, maxWidth: 680 } }, scene.sub || "Not the number on the dial. The feeling under it.")));
  }

  function Feature({ progress: p, scene, theme }) {
    const chips = (scene.chips && scene.chips.length) ? scene.chips : ["Tank full", "Cabin lit", "Bass up"];
    return React.createElement(Frame, { progress: p, theme, bg: theme.asphalt, fg: theme.paper, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 250 } },
        Title(scene.title || "Dashboard|view.", p, theme.paper, theme.amber, 100, 0),
        React.createElement("div", { style: { ...M.flash(p, 2), margin: "46px auto 42px", width: 936, height: 590, background: "#0a0d14", borderRadius: 22, padding: 12, border: `1px solid ${rgba(theme.neon, 0.5)}`, boxShadow: `0 0 44px ${rgba(theme.neon, 0.25)}, 0 30px 60px rgba(0,0,0,0.6)` } },
          React.createElement(MediaSlot, { src: scene.image, radius: 12, label: (scene.imageLabel || "Landscape photo \u2014 16:10"), fg: theme.paper })),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 16 } },
          chips.map((c, i) => React.createElement("div", { key: i, style: { ...M.streak(p, i + 4), padding: "13px 26px", borderRadius: 8, border: `2px solid ${[theme.neon, theme.magenta, theme.amber][i % 3]}`, color: [theme.neon, theme.magenta, theme.amber][i % 3], fontFamily: FH, fontWeight: 700, fontSize: 24, letterSpacing: "0.1em" } }, c)))));
  }

  function Montage({ progress: p, scene, theme }) {
    const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["The bridge", "Neon row", "The tunnel", "Lookout"];
    return React.createElement(Frame, { progress: p, theme, bg: "#080a10", fg: theme.paper, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        Array.from({ length: 14 }).map((_, i) =>
          React.createElement("circle", { key: i, cx: (i * 197 + 80) % W, cy: (i * 311 + 90) % 260, r: 2.4, fill: rgba(theme.paper, 0.4) }))),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 260 } },
        Title(scene.title || "Tonight's|route.", p, theme.paper, theme.neon, 100, 0),
        React.createElement("div", { style: { marginTop: 56, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 } },
          tiles.slice(0, 4).map((label, i) =>
            React.createElement("div", { key: i, style: { ...M.flash(p, i + 2) } },
              React.createElement("div", { style: { height: 296, borderRadius: 18, background: "#0a0d14", border: `1px solid ${rgba([theme.neon, theme.magenta, theme.amber, theme.neon][i], 0.55)}`, padding: 10, boxShadow: `0 0 26px ${rgba([theme.neon, theme.magenta, theme.amber, theme.neon][i], 0.18)}` } },
                React.createElement(MediaSlot, { src: (scene.images || [])[i], radius: 10, label: label, fg: theme.paper })),
              React.createElement("div", { style: { fontFamily: FH, fontWeight: 700, fontSize: 24, color: rgba(theme.paper, 0.85), marginTop: 14, textAlign: "center", letterSpacing: "0.12em", textTransform: "uppercase" } }, label))))));
  }

  function Stats({ progress: p, scene, theme }) {
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 212, suffix: "km", label: "of empty motorway" },
      { to: 14, suffix: "", label: "green lights in a row" },
      { to: 3, suffix: "am", label: "and not even tired" }];
    const cols = [theme.neon, theme.magenta, theme.amber];
    return React.createElement(Frame, { progress: p, theme, bg: theme.asphalt, fg: theme.paper, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement("path", { d: `M 0 ${H - 200} L ${W} ${H - 260}`, stroke: rgba(theme.neon, 0.3), strokeWidth: 3 })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 400 } },
        Title(scene.title || "Night|numbers.", p, theme.paper, theme.neon, 100, 0),
        React.createElement("div", { style: { marginTop: 64, display: "flex", flexDirection: "column", gap: 56 } },
          stats.slice(0, 3).map((st, i) => {
            const e = ease.outCubic(seg(p, 0.12 + i * 0.08, 0.75));
            return React.createElement("div", { key: i, style: { ...M.rise(p, i + 2), display: "flex", alignItems: "baseline", gap: 30 } },
              React.createElement("div", { style: { fontFamily: FH, fontWeight: 800, fontSize: 148, lineHeight: 0.9, color: cols[i], fontVariantNumeric: "tabular-nums", textShadow: `0 0 38px ${rgba(cols[i], 0.5)}` } }, Math.round(st.to * e).toLocaleString(), React.createElement("span", { style: { fontSize: 72 } }, st.suffix)),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 33, color: rgba(theme.paper, 0.75), maxWidth: 430 } }, st.label));
          }))));
  }

  function CTA({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: "#080a10", fg: theme.paper, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 470, textAlign: "center" } },
        React.createElement("div", { style: { ...M.flash(p, 0), width: 146, height: 146, borderRadius: 18, overflow: "hidden", background: "#0a0d14", border: `2px dashed ${rgba(theme.paper, 0.4)}`, margin: "0 auto 42px", boxShadow: `0 0 34px ${rgba(theme.magenta, 0.3)}` } },
          React.createElement(MediaSlot, { src: scene.logo, radius: 12, compact: true, fg: theme.paper })),
        Title(scene.title || "Keys.|Go.", p, theme.paper, theme.neon, 140, 1),
        React.createElement("div", { style: { ...M.flash(p, 4), display: "inline-flex", alignItems: "center", gap: 14, marginTop: 54, padding: "24px 52px", borderRadius: 12, background: theme.neon, color: "#06121a", fontFamily: FH, fontWeight: 800, fontSize: 38, letterSpacing: "0.08em", boxShadow: `0 0 54px ${rgba(theme.neon, 0.55)}` } },
          (scene.cta || "START ENGINE"),
          React.createElement("svg", { width: 32, height: 32, viewBox: "0 0 24 24", fill: "none", stroke: "#06121a", strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M5 12h14" }), React.createElement("path", { d: "M13 6l6 6-6 6" }))),
        React.createElement("div", { style: { ...M.rise(p, 5), fontFamily: FB, fontWeight: 600, fontSize: 34, color: rgba(theme.paper, 0.85), marginTop: 42, letterSpacing: "0.06em" } }, scene.url || "nightdrive.fm")));
  }

  const SCENE_MAP = { Hook, Statement, Feature, Montage, Stats, CTA };
  const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.35 };

  function NightDrive() {
    const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
    const [t, setTweak] = useTweaks(defaults);
    const theme = {
      W, H,
      asphalt: t.asphalt || "#0c0e14", neon: t.neon || "#39e6d0", magenta: t.magenta || "#e04fa3",
      amber: "#f5b942", paper: "#eef2f7",
      brand: t.brand || "Night Drive",
      energy: ENERGY[t.motion] ?? 1.0,
      currentBg: "#0c0e14",
    };
    const scenes = {};
    for (const k in SCENE_MAP) { const C = SCENE_MAP[k]; scenes[k] = (props) => React.createElement(C, { ...props, theme }); }
    return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#05060a" } },
      React.createElement(SceneStage, { width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.asphalt }, scenes),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, { label: "Neon", value: theme.neon, options: ["#39e6d0", "#7ab8ff", "#b7ff5c"], onChange: (v) => setTweak("neon", v) }),
        React.createElement(TweakColor, { label: "Second neon", value: theme.magenta, options: ["#e04fa3", "#a06bff", "#ff7a5c"], onChange: (v) => setTweak("magenta", v) }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) })));
  }
  window.NightDrive = NightDrive;
})();
