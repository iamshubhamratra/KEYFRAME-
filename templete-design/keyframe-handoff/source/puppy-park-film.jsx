/* puppy-park-film.jsx — "Puppy Park" (9:16, loop). Sunny dog-park day: rolling
   grass hills, drifting clouds, a bouncing ball with squash, paw prints stamping
   across scenes. Baloo 2 + Nunito. Exposes window.PuppyPark. */
(function () {
  const { SceneStage } = window;
  const AMBIENT = 1.8;
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
    outBack: (t) => { const c = 2.2; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  };
  function hexToRgb(h) { h = (h || "#000").replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const splitLines = (t) => String(t == null ? "" : t).split("|");
  const FH = '"Baloo 2", system-ui, sans-serif';
  const FB = '"Nunito", system-ui, sans-serif';
  const W = 1080, H = 1920, PAD = 70;

  const M = {
    bounce: (p, i = 0) => { const t = ease.outBack(clamp01((p - i * 0.06) / 0.34)); return { opacity: clamp01(t * 2), transform: `translateY(${(1 - t) * 110}px) scale(${lerp(0.7, 1, clamp01(t))})` }; },
    rise: (p, i = 0) => { const t = ease.outQuint(clamp01((p - i * 0.055) / 0.38)); return { opacity: t, transform: `translateY(${(1 - t) * 44}px)` }; },
    wobble: (p, i = 0) => { const t = ease.outBack(clamp01((p - i * 0.06) / 0.4)); return { opacity: clamp01(t * 1.6), transform: `rotate(${(1 - t) * -8}deg) scale(${lerp(0.6, 1, t)})` }; },
  };

  /* hop-flavoured camera; order shuffled vs other templates */
  function cam(kind, p, energy, clock) {
    const inn = ease.outQuint(seg(p, 0, 0.22));
    const out = ease.inCubic(seg(p, 0.82, 1));
    const dIn = 1 - inn, k = Math.min(energy, 1.15);
    let fx = 0, fy = 0, fr = 0, fs = 1, fo = 1;
    switch (kind) {
      case "hopU": fy = H * dIn * k; fy -= H * 0.22 * out; fr = dIn * 3; break;
      case "hopD": fy = -H * dIn * k; fy += H * 0.22 * out; fr = dIn * -3; break;
      case "pushL": fx = W * dIn * k; fx -= W * 0.26 * out; break;
      case "pushR": fx = -W * dIn * k; fx += W * 0.26 * out; break;
      case "pounce": fs = 1 + 0.55 * dIn; fo = inn; fr = -5 * dIn; break;
      case "roll": fs = 1 - 0.42 * dIn; fo = inn; fr = 10 * dIn; break;
      default: fo = inn;
    }
    const dz = 1 + p * 0.05 * energy;
    const dx = Math.sin(clock * 0.34) * 9 * energy;
    const dy = Math.abs(Math.sin(clock * 0.8)) * -10 * energy + p * -14;
    return {
      frame: { transform: `translate(${fx}px, ${fy}px) rotate(${fr}deg) scale(${fs})`, opacity: fo },
      drift: { transform: `translate(${dx}px, ${dy}px) scale(${dz})`, opacity: 1 - out * 0.35, willChange: "transform" },
    };
  }

  function Paw({ x, y, s = 1, color, o = 1, r = 0 }) {
    return React.createElement("g", { transform: `translate(${x},${y}) rotate(${r}) scale(${s})`, opacity: o, fill: color },
      React.createElement("ellipse", { cx: 0, cy: 8, rx: 13, ry: 11 }),
      React.createElement("circle", { cx: -12, cy: -6, r: 5 }),
      React.createElement("circle", { cx: -4, cy: -10, r: 5 }),
      React.createElement("circle", { cx: 4, cy: -10, r: 5 }),
      React.createElement("circle", { cx: 12, cy: -6, r: 5 }));
  }

  /* world: sky, sun rays, clouds, two grass hills, bouncing ball + paw trail */
  function World({ theme, t, p }) {
    const bounceY = Math.abs(Math.sin(t * 2.2));
    const bx = ((t * 130) % (W + 300)) - 150;
    const by = H * 0.66 - bounceY * 240;
    const squash = 1 - (1 - bounceY) * 0.35;
    const clouds = [0, 1, 2].map((i) => {
      const cx = ((t * (16 + i * 7) + i * 400) % (W + 500)) - 250;
      return React.createElement("g", { key: i, transform: `translate(${cx},${170 + i * 130})`, fill: rgba("#ffffff", 0.85) },
        React.createElement("ellipse", { cx: 0, cy: 0, rx: 90 + i * 14, ry: 34 }),
        React.createElement("ellipse", { cx: 60, cy: -16, rx: 52, ry: 26 }),
        React.createElement("ellipse", { cx: -62, cy: -12, rx: 46, ry: 24 }));
    });
    const paws = [0, 1, 2, 3, 4].map((i) => {
      const ph = clamp01((seg(p, 0.1, 0.9) * 6 - i) );
      return React.createElement(Paw, { key: i, x: 140 + i * 200, y: H - 210 - (i % 2) * 60, s: 1.1, r: 12 + (i % 2) * -20, color: theme.ink, o: clamp01(ph * 2) * 0.22 });
    });
    return React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
      React.createElement("g", { transform: `translate(${W - 190},210) rotate(${t * 9})` },
        Array.from({ length: 12 }).map((_, i) =>
          React.createElement("rect", { key: i, x: -7, y: -150, width: 14, height: 66, rx: 7, fill: rgba(theme.sun, 0.75), transform: `rotate(${i * 30})` }))),
      React.createElement("circle", { cx: W - 190, cy: 210, r: 84, fill: theme.sun }),
      clouds,
      React.createElement("ellipse", { cx: W * 0.22, cy: H - 60 + Math.sin(t * 0.5) * 8, rx: W * 0.85, ry: 330, fill: theme.grassDark }),
      React.createElement("ellipse", { cx: W * 0.86, cy: H + 40 - Math.sin(t * 0.5) * 8, rx: W * 0.9, ry: 300, fill: theme.grass }),
      paws,
      React.createElement("g", { transform: `translate(${bx},${by}) scale(${1 / squash},${squash})` },
        React.createElement("circle", { r: 46, fill: theme.ball }),
        React.createElement("path", { d: "M-46 0 A46 46 0 0 1 46 0", fill: "none", stroke: rgba("#ffffff", 0.85), strokeWidth: 9 })),
      React.createElement("ellipse", { cx: bx, cy: H * 0.66 + 58, rx: 60 * (0.5 + bounceY * 0.5), ry: 12, fill: rgba(theme.ink, 0.18) }));
  }

  function MediaSlot({ src, label, radius = 22, style, fg, compact }) {
    const line = fg || "#2b2320";
    const base = { width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", ...style };
    if (src) return React.createElement("img", { src, style: { ...base, objectFit: "cover", display: "block" } });
    return React.createElement("div", { style: { ...base, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: rgba(line, 0.06), border: `3px dashed ${rgba(line, 0.42)}`, textAlign: "center", padding: 16 } },
      React.createElement("svg", { width: compact ? 30 : 40, height: compact ? 30 : 40, viewBox: "0 0 24 24", fill: "none", stroke: rgba(line, 0.62), strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
        React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
        React.createElement("path", { d: "M21 16l-5-5L5 19" })),
      !compact && React.createElement("div", { style: { fontFamily: FB, fontWeight: 900, fontSize: 15, letterSpacing: "0.12em", color: rgba(line, 0.72) } }, "DROP IMAGE TO REPLACE"),
      !compact && label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 13, color: rgba(line, 0.5) } }, label));
  }

  function Chrome({ theme, fg }) {
    return React.createElement("div", { style: { position: "absolute", top: 56, left: PAD, display: "flex", alignItems: "center", gap: 15, zIndex: 6 } },
      React.createElement("div", { style: { width: 48, height: 48, borderRadius: 999, background: fg, display: "flex", alignItems: "center", justifyContent: "center" } },
        React.createElement("svg", { width: 30, height: 30, viewBox: "-20 -20 40 40" }, React.createElement(Paw, { x: 0, y: 2, s: 0.95, color: theme.currentBg }))),
      React.createElement("span", { style: { fontFamily: FH, fontWeight: 700, fontSize: 34, color: fg } }, theme.brand));
  }

  function Frame({ progress, theme, bg, fg, world, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0 };
    const CAMS = ["pounce", "hopU", "pushR", "roll", "pushL", "hopD"];
    const c = cam(CAMS[(sc.index * 5 + 1) % CAMS.length], progress, theme.energy, clock);
    theme.currentBg = bg;
    return React.createElement("div", { style: { position: "absolute", inset: 0, ...c.frame, willChange: "transform, opacity" } },
      React.createElement("div", { style: { position: "absolute", inset: 0, background: bg, overflow: "hidden", fontFamily: FB } },
        world && React.createElement(World, { theme, t: clock, p: progress }),
        React.createElement("div", { style: { position: "absolute", inset: 0, ...c.drift } }, children),
        React.createElement(Chrome, { theme, fg })));
  }

  const Title = (txt, p, fg, hi, size, from = 0) =>
    splitLines(txt).map((ln, i) =>
      React.createElement("div", { key: i, style: { ...M.bounce(p, from + i), fontFamily: FH, fontWeight: 800, fontSize: size, lineHeight: 1.02, color: i === 1 ? hi : fg } }, ln));

  function Hook({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.sky, fg: theme.ink, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 300 } },
        React.createElement("div", { style: { ...M.wobble(p, 0), display: "inline-block", padding: "13px 28px", borderRadius: 999, background: theme.ink, color: "#fff", fontFamily: FB, fontWeight: 900, fontSize: 25, letterSpacing: "0.16em", marginBottom: 38 } }, (scene.kicker || "GOOD BOY ENERGY")),
        Title(scene.title || "The best day|starts with|a leash.", p, theme.ink, theme.ball, 128, 1),
        React.createElement("div", { style: { ...M.rise(p, 5), fontFamily: FB, fontWeight: 800, fontSize: 36, color: rgba(theme.ink, 0.75), marginTop: 34, maxWidth: 740 } }, scene.sub || "One park. One ball. Zero worries.")));
  }

  function Statement({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.grassDark, fg: "#ffffff", world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        [0, 1, 2, 3, 4, 5].map((i) => React.createElement(Paw, { key: i, x: 90 + (i % 3) * 420, y: 340 + Math.floor(i / 3) * 1100, s: 2.4, r: -14 + i * 9, color: "#ffffff", o: 0.08 }))),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, bottom: 380 } },
        Title(scene.title || "Sit.|Stay.|Play.", p, "#ffffff", theme.sun, 190, 0),
        React.createElement("div", { style: { ...M.rise(p, 4), fontFamily: FB, fontWeight: 700, fontSize: 36, color: rgba("#ffffff", 0.72), marginTop: 40, maxWidth: 720 } }, scene.sub || "Three commands. One very good day.")));
  }

  function Feature({ progress: p, scene, theme }) {
    const clock = useTimeline().time;
    const chips = (scene.chips && scene.chips.length) ? scene.chips : ["Ears up", "Tail wagging", "Ball secured"];
    return React.createElement(Frame, { progress: p, theme, bg: theme.paper, fg: theme.ink, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement("ellipse", { cx: W * 0.5, cy: H - 120, rx: W, ry: 260, fill: rgba(theme.grass, 0.5) }),
        React.createElement("g", { transform: `translate(${W - 150},${H - 320}) rotate(${Math.sin(clock * 1.4) * 6})` },
          React.createElement(Paw, { x: 0, y: 0, s: 3, color: theme.grassDark, o: 0.5 }))),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 250 } },
        Title(scene.title || "Caught it.|Every time.", p, theme.ink, theme.ball, 112, 0),
        React.createElement("div", { style: { ...M.wobble(p, 2), margin: "46px auto 40px", width: 940, height: 600, background: "#ffffff", borderRadius: 30, padding: 14, boxShadow: `0 30px 60px ${rgba(theme.ink, 0.22)}`, transform: "rotate(-1.5deg)" } },
          React.createElement(MediaSlot, { src: scene.image, radius: 18, label: (scene.imageLabel || "Landscape photo \u2014 16:10"), fg: theme.ink })),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" } },
          chips.map((c, i) => React.createElement("div", { key: i, style: { ...M.bounce(p, i + 4), padding: "15px 28px", borderRadius: 999, background: i % 2 === 0 ? theme.grassDark : theme.ball, color: "#fff", fontFamily: FB, fontWeight: 900, fontSize: 28 } }, c)))));
  }

  function Montage({ progress: p, scene, theme }) {
    const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["Morning walk", "The catch", "New friends", "Nap time"];
    const tilts = [-4, 3, 2.5, -3];
    return React.createElement(Frame, { progress: p, theme, bg: theme.sky, fg: theme.ink, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 250 } },
        Title(scene.title || "Today's|highlights.", p, theme.ink, theme.ball, 108, 0),
        React.createElement("div", { style: { marginTop: 52, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 } },
          tiles.slice(0, 4).map((label, i) =>
            React.createElement("div", { key: i, style: { ...M.wobble(p, i + 2), transform: `rotate(${tilts[i]}deg)` } },
              React.createElement("div", { style: { height: 300, borderRadius: 26, background: "#ffffff", padding: 12, boxShadow: `0 22px 44px ${rgba(theme.ink, 0.2)}` } },
                React.createElement(MediaSlot, { src: (scene.images || [])[i], radius: 16, label: label, fg: theme.ink })),
              React.createElement("div", { style: { fontFamily: FH, fontWeight: 700, fontSize: 30, color: theme.ink, marginTop: 12, textAlign: "center" } }, label))))));
  }

  function Stats({ progress: p, scene, theme }) {
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 27, suffix: "", label: "fetches before breakfast" },
      { to: 4, suffix: "", label: "new best friends made" },
      { to: 100, suffix: "%", label: "certified good dog" }];
    const cols = [theme.ball, theme.sun, "#ffffff"];
    return React.createElement(Frame, { progress: p, theme, bg: theme.grassDark, fg: "#ffffff", world: false },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 380 } },
        Title(scene.title || "The score|so far.", p, "#ffffff", theme.sun, 110, 0),
        React.createElement("div", { style: { marginTop: 64, display: "flex", flexDirection: "column", gap: 52 } },
          stats.slice(0, 3).map((st, i) => {
            const e = ease.outCubic(seg(p, 0.12 + i * 0.08, 0.75));
            const v = st.to * e;
            return React.createElement("div", { key: i, style: { ...M.rise(p, i + 2), display: "flex", alignItems: "baseline", gap: 30 } },
              React.createElement("div", { style: { fontFamily: FH, fontWeight: 800, fontSize: 176, lineHeight: 0.85, color: cols[i], fontVariantNumeric: "tabular-nums" } }, Math.round(v).toLocaleString(), React.createElement("span", { style: { fontSize: 84 } }, st.suffix)),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 34, color: rgba("#ffffff", 0.78), maxWidth: 430 } }, st.label));
          }))));
  }

  function CTA({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.sky, fg: theme.ink, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 430, textAlign: "center" } },
        React.createElement("div", { style: { ...M.wobble(p, 0), width: 150, height: 150, borderRadius: 999, overflow: "hidden", background: "#ffffff", margin: "0 auto 40px", boxShadow: `0 20px 44px ${rgba(theme.ink, 0.22)}` } },
          React.createElement(MediaSlot, { src: scene.logo, radius: 999, compact: true, fg: theme.ink })),
        Title(scene.title || "Bring the|whole pack.", p, theme.ink, theme.ball, 128, 1),
        React.createElement("div", { style: { ...M.bounce(p, 4), display: "inline-flex", alignItems: "center", gap: 14, marginTop: 52, padding: "26px 54px", borderRadius: 999, background: theme.ball, color: "#fff", fontFamily: FH, fontWeight: 800, fontSize: 44, boxShadow: `0 22px 54px ${rgba(theme.ink, 0.3)}` } },
          scene.cta || "Join the walk",
          React.createElement("svg", { width: 34, height: 34, viewBox: "0 0 24 24", fill: "none", stroke: "#fff", strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M5 12h14" }), React.createElement("path", { d: "M13 6l6 6-6 6" }))),
        React.createElement("div", { style: { ...M.rise(p, 5), fontFamily: FB, fontWeight: 900, fontSize: 36, color: theme.ink, marginTop: 40 } }, scene.url || "puppypark.club")));
  }

  const SCENE_MAP = { Hook, Statement, Feature, Montage, Stats, CTA };
  const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.35 };

  function PuppyPark() {
    const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
    const [t, setTweak] = useTweaks(defaults);
    const theme = {
      W, H,
      sky: t.sky || "#a5d8f0", grass: t.grass || "#8cc063", grassDark: "#4f8a3d",
      sun: "#f7c948", ball: t.ball || "#e8622c", paper: "#fdf6ec", ink: "#2b2320",
      brand: t.brand || "Puppy Park",
      energy: ENERGY[t.motion] ?? 1.0,
      currentBg: "#a5d8f0",
    };
    const scenes = {};
    for (const k in SCENE_MAP) { const C = SCENE_MAP[k]; scenes[k] = (props) => React.createElement(C, { ...props, theme }); }
    return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#17130f" } },
      React.createElement(SceneStage, { width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.sky }, scenes),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, { label: "Sky", value: theme.sky, options: ["#a5d8f0", "#bfe6f7", "#f7d9b8"], onChange: (v) => setTweak("sky", v) }),
        React.createElement(TweakColor, { label: "Ball", value: theme.ball, options: ["#e8622c", "#d64545", "#f7c948"], onChange: (v) => setTweak("ball", v) }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) })));
  }
  window.PuppyPark = PuppyPark;
})();
