/* type-riot-film.jsx — "Type Riot" (9:16, loop). Pure kinetic typography: giant
   Anton word slams, per-letter cascades, outline/fill flips, a huge drifting
   ghost word behind everything. Black / off-white / riot red. Exposes window.TypeRiot. */
(function () {
  const { SceneStage } = window;
  const AMBIENT = 2.0;
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
    outBack: (t) => { const c = 2.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  };
  function hexToRgb(h) { h = (h || "#000").replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const splitLines = (t) => String(t == null ? "" : t).split("|");
  const FH = '"Anton", Impact, sans-serif';
  const FB = '"Space Grotesk", system-ui, sans-serif';
  const W = 1080, H = 1920, PAD = 70;

  /* per-letter cascade */
  function Cascade({ text, p, size, color, from = 0, stagger = 0.03 }) {
    const letters = String(text).split("");
    return React.createElement("div", { style: { display: "flex", flexWrap: "wrap", overflow: "hidden" } },
      letters.map((ch, i) => {
        const t = ease.outExpo(clamp01((p - from * 0.06 - i * stagger) / 0.3));
        return React.createElement("span", { key: i, style: { fontFamily: FH, fontSize: size, lineHeight: 1, color, display: "inline-block", transform: `translateY(${(1 - t) * 110}%) rotate(${(1 - t) * 6}deg)`, opacity: t, whiteSpace: "pre" } }, ch);
      }));
  }

  const M = {
    slam: (p, i = 0) => { const t = ease.outExpo(clamp01((p - i * 0.055) / 0.26)); return { opacity: clamp01(t * 2), transform: `scale(${lerp(2.4, 1, t)}) rotate(${(1 - t) * -5}deg)` }; },
    rise: (p, i = 0) => { const t = ease.outQuint(clamp01((p - i * 0.05) / 0.34)); return { opacity: t, transform: `translateY(${(1 - t) * 46}px)` }; },
    slideX: (p, i = 0) => { const t = ease.outExpo(clamp01((p - i * 0.05) / 0.3)); return { opacity: t, transform: `translateX(${(1 - t) * (i % 2 === 0 ? -140 : 140)}px)` }; },
  };

  /* typographic camera: hard snaps, no soft drifts */
  function cam(kind, p, energy, clock) {
    const inn = ease.outExpo(seg(p, 0, 0.18));
    const out = ease.inCubic(seg(p, 0.84, 1));
    const dIn = 1 - inn, k = Math.min(energy, 1.15);
    let fx = 0, fy = 0, fr = 0, fs = 1, fo = 1;
    switch (kind) {
      case "snapL": fx = W * dIn * k; fx -= W * 0.34 * out; break;
      case "snapR": fx = -W * dIn * k; fx += W * 0.34 * out; break;
      case "snapU": fy = H * dIn * k; fy -= H * 0.28 * out; break;
      case "snapD": fy = -H * dIn * k; fy += H * 0.28 * out; break;
      case "smash": fs = 1 + 0.9 * dIn; fo = inn; break;
      default: fs = 1 - 0.5 * dIn; fo = inn; fr = 4 * dIn;
    }
    const dz = 1 + p * 0.05 * energy;
    const dx = -p * 26 * energy;
    const dy = Math.sin(clock * 0.6) * 4 * energy;
    return {
      frame: { transform: `translate(${fx}px, ${fy}px) rotate(${fr}deg) scale(${fs})`, opacity: fo },
      drift: { transform: `translate(${dx}px, ${dy}px) scale(${dz})`, opacity: 1 - out * 0.4, willChange: "transform" },
    };
  }

  /* giant ghost word drifting behind every scene */
  function Ghost({ word, t, color }) {
    const x = -((t * 60) % 2400);
    return React.createElement("div", { style: { position: "absolute", top: "34%", left: 0, whiteSpace: "nowrap", transform: `translateX(${x}px) rotate(-6deg)`, fontFamily: FH, fontSize: 460, lineHeight: 1, color: "transparent", WebkitTextStroke: `3px ${rgba(color, 0.14)}`, pointerEvents: "none" } },
      `${word} ${word} ${word}`);
  }

  function Chrome({ theme, fg }) {
    return React.createElement("div", { style: { position: "absolute", top: 56, left: PAD, right: PAD, display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 6 } },
      React.createElement("span", { style: { fontFamily: FH, fontSize: 34, color: fg, letterSpacing: "0.04em", textTransform: "uppercase" } }, theme.brand),
      React.createElement("span", { style: { fontFamily: FB, fontWeight: 700, fontSize: 22, color: fg, border: `2px solid ${fg}`, padding: "6px 16px", borderRadius: 4, letterSpacing: "0.18em" } }, "SOUND OFF"));
  }

  function Frame({ progress, theme, bg, fg, ghost, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0 };
    const CAMS = ["smash", "snapR", "snapU", "snapL", "snapD", "shrink"];
    const c = cam(CAMS[(sc.index * 7 + 1) % CAMS.length], progress, theme.energy, clock);
    theme.currentBg = bg;
    return React.createElement("div", { style: { position: "absolute", inset: 0, ...c.frame, willChange: "transform, opacity" } },
      React.createElement("div", { style: { position: "absolute", inset: 0, background: bg, overflow: "hidden", fontFamily: FB } },
        React.createElement(Ghost, { word: ghost || "RIOT", t: clock, color: fg }),
        React.createElement("div", { style: { position: "absolute", inset: 0, ...c.drift } }, children),
        React.createElement(Chrome, { theme, fg })));
  }

  const Lines = (txt, p, fg, hi, size, from = 0, filled = true) =>
    splitLines(txt).map((ln, i) => {
      const isHi = i === 1;
      const st = isHi && !filled
        ? { color: "transparent", WebkitTextStroke: `4px ${hi}` }
        : { color: isHi ? hi : fg };
      return React.createElement("div", { key: i, style: { ...M.slam(p, from + i), fontFamily: FH, fontSize: size, lineHeight: 0.94, textTransform: "uppercase", letterSpacing: "0.01em", ...st } }, ln);
    });

  function Hook({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.ink, fg: theme.paper, ghost: scene.ghost },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 420 } },
        React.createElement("div", { style: { ...M.slideX(p, 0), display: "inline-block", padding: "12px 24px", background: theme.red, color: theme.paper, fontFamily: FB, fontWeight: 700, fontSize: 25, letterSpacing: "0.22em", marginBottom: 46 } }, scene.kicker || "TURN IT UP"),
        Lines(scene.title || "Words|hit|harder.", p, theme.paper, theme.red, 200, 1),
        React.createElement("div", { style: { ...M.rise(p, 5), fontFamily: FB, fontWeight: 500, fontSize: 36, color: rgba(theme.paper, 0.72), marginTop: 44, maxWidth: 700 } }, scene.sub || "No footage. No filters. Just type, timed to the beat.")));
  }

  function Statement({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.red, fg: theme.paper, ghost: scene.ghost || "LOUD" },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 520 } },
        Lines(scene.title || "Silence|is a|choice.", p, theme.paper, theme.ink, 224, 0, false),
        React.createElement("div", { style: { ...M.rise(p, 4), fontFamily: FB, fontWeight: 500, fontSize: 36, color: rgba(theme.paper, 0.85), marginTop: 46, maxWidth: 680 } }, scene.sub || "Make the other one.")));
  }

  function Cascader({ progress: p, scene, theme }) {
    const lines = splitLines(scene.title || "EVERY|LETTER|LANDS");
    return React.createElement(Frame, { progress: p, theme, bg: theme.paper, fg: theme.ink, ghost: scene.ghost || "TYPE" },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 460, display: "flex", flexDirection: "column", gap: 8 } },
        lines.map((ln, i) =>
          React.createElement(Cascade, { key: i, text: ln, p, size: 176, color: i === 1 ? theme.red : theme.ink, from: i * 3, stagger: 0.035 })),
        React.createElement("div", { style: { ...M.rise(p, 7), fontFamily: FB, fontWeight: 500, fontSize: 35, color: rgba(theme.ink, 0.7), marginTop: 40, maxWidth: 680 } }, scene.sub || "One at a time, right on the kick drum.")));
  }

  function Ticker({ progress: p, scene, theme }) {
    const clock = useTimeline().time;
    const rows = (scene.rows && scene.rows.length) ? scene.rows : ["BOLD IS A STRATEGY", "QUIET IS A COST", "SAY IT BIGGER"];
    return React.createElement(Frame, { progress: p, theme, bg: theme.ink, fg: theme.paper, ghost: scene.ghost || "SCROLL" },
      React.createElement("div", { style: { position: "absolute", left: 0, right: 0, top: 430, display: "flex", flexDirection: "column", gap: 34 } },
        rows.slice(0, 3).map((row, i) => {
          const dir = i % 2 === 0 ? 1 : -1;
          const shift = ((clock * (120 + i * 40) * dir) % 800 + 800) % 800;
          const rep = Array.from({ length: 6 }, () => ` ${row} \u2014`).join("");
          const colors = [theme.paper, theme.red, theme.paper];
          const e = ease.outExpo(seg(p, 0.04 + i * 0.07, 0.3 + i * 0.07));
          return React.createElement("div", { key: i, style: { whiteSpace: "nowrap", transform: `translateX(${-shift - (1 - e) * dir * 500}px)`, opacity: e, fontFamily: FH, fontSize: 108, lineHeight: 1, color: colors[i], textTransform: "uppercase" } },
            i === 1 ? React.createElement("span", { style: { color: "transparent", WebkitTextStroke: `3px ${theme.red}` } }, rep) : rep);
        }),
        React.createElement("div", { style: { ...M.rise(p, 5), fontFamily: FB, fontWeight: 500, fontSize: 34, color: rgba(theme.paper, 0.7), padding: `40px ${PAD}px 0`, maxWidth: 760 } }, scene.sub || "Three lines, three speeds, zero apologies.")));
  }

  function Stats({ progress: p, scene, theme }) {
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 3, suffix: "", label: "words per second, max" },
      { to: 96, suffix: "pt", label: "minimum type size" },
      { to: 0, suffix: "", label: "stock photos harmed" }];
    return React.createElement(Frame, { progress: p, theme, bg: theme.paper, fg: theme.ink, ghost: scene.ghost || "COUNT" },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 380 } },
        Lines(scene.title || "The|numbers.", p, theme.ink, theme.red, 150, 0),
        React.createElement("div", { style: { marginTop: 60, display: "flex", flexDirection: "column", gap: 44 } },
          stats.slice(0, 3).map((st, i) => {
            const e = ease.outCubic(seg(p, 0.14 + i * 0.08, 0.72));
            return React.createElement("div", { key: i, style: { ...M.slideX(p, i + 2), display: "flex", alignItems: "baseline", gap: 30, borderBottom: `4px solid ${i === 1 ? theme.red : theme.ink}`, paddingBottom: 26 } },
              React.createElement("div", { style: { fontFamily: FH, fontSize: 150, lineHeight: 0.9, color: i === 1 ? theme.red : theme.ink, fontVariantNumeric: "tabular-nums" } }, Math.round(st.to * e), React.createElement("span", { style: { fontSize: 74 } }, st.suffix)),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 34, color: rgba(theme.ink, 0.72), maxWidth: 460 } }, st.label));
          }))));
  }

  function CTA({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.red, fg: theme.paper, ghost: scene.ghost || "NOW" },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 540 } },
        Lines(scene.title || "Your|turn.", p, theme.paper, theme.ink, 240, 1),
        React.createElement("div", { style: { ...M.slam(p, 3), display: "inline-flex", alignItems: "center", gap: 16, marginTop: 60, padding: "26px 54px", background: theme.ink, color: theme.paper, fontFamily: FH, fontSize: 46, letterSpacing: "0.04em", textTransform: "uppercase" } },
          scene.cta || "Steal this style",
          React.createElement("svg", { width: 36, height: 36, viewBox: "0 0 24 24", fill: "none", stroke: theme.paper, strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M5 12h14" }), React.createElement("path", { d: "M13 6l6 6-6 6" }))),
        React.createElement("div", { style: { ...M.rise(p, 5), fontFamily: FB, fontWeight: 700, fontSize: 38, color: theme.paper, marginTop: 46, letterSpacing: "0.05em" } }, scene.url || "typeriot.studio")));
  }

  const SCENE_MAP = { Hook, Statement, Cascader, Ticker, Stats, CTA };
  const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.4 };

  function TypeRiot() {
    const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
    const [t, setTweak] = useTweaks(defaults);
    const theme = {
      W, H,
      ink: t.ink || "#141414", paper: t.paper || "#f4f1ea", red: t.red || "#e63329",
      brand: t.brand || "Type Riot",
      energy: ENERGY[t.motion] ?? 1.0,
      currentBg: "#141414",
    };
    const scenes = {};
    for (const k in SCENE_MAP) { const C = SCENE_MAP[k]; scenes[k] = (props) => React.createElement(C, { ...props, theme }); }
    return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0c0c0c" } },
      React.createElement(SceneStage, { width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.ink }, scenes),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, { label: "Riot color", value: theme.red, options: ["#e63329", "#2e5bff", "#ff9f1c"], onChange: (v) => setTweak("red", v) }),
        React.createElement(TweakColor, { label: "Paper", value: theme.paper, options: ["#f4f1ea", "#eef2f7", "#f7e8d3"], onChange: (v) => setTweak("paper", v) }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) })));
  }
  window.TypeRiot = TypeRiot;
})();
