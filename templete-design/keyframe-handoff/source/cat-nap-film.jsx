/* cat-nap-film.jsx — "Cat Nap" (9:16, loop). Twilight living room: window with
   drifting stars and moon, pulsing lamp glow, rolling yarn ball trailing thread,
   dust motes, a cat silhouette with a slow tail flick. Quicksand + Lora.
   Exposes window.CatNap. */
(function () {
  const { SceneStage } = window;
  const AMBIENT = 1.5;
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
    outBack: (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  };
  function hexToRgb(h) { h = (h || "#000").replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const splitLines = (t) => String(t == null ? "" : t).split("|");
  const FH = '"Lora", Georgia, serif';
  const FB = '"Quicksand", system-ui, sans-serif';
  const W = 1080, H = 1920, PAD = 74;

  const M = {
    drowse: (p, i = 0) => { const t = ease.outQuint(clamp01((p - i * 0.07) / 0.44)); return { opacity: t, transform: `translateY(${(1 - t) * 36}px)` }; },
    curl: (p, i = 0) => { const t = ease.outBack(clamp01((p - i * 0.07) / 0.42)); return { opacity: clamp01(t * 1.6), transform: `scale(${lerp(0.72, 1, t)}) rotate(${(1 - t) * 4}deg)` }; },
    slideL: (p, i = 0) => { const t = ease.outQuint(clamp01((p - i * 0.06) / 0.4)); return { opacity: t, transform: `translateX(${(1 - t) * -70}px)` }; },
  };

  /* slow-blink and stretch flavoured camera */
  function cam(kind, p, energy, clock) {
    const inn = ease.outQuint(seg(p, 0, 0.24));
    const out = ease.inCubic(seg(p, 0.82, 1));
    const dIn = 1 - inn, k = Math.min(energy, 1.1);
    let fx = 0, fy = 0, fr = 0, fs = 1, fo = 1, blink = 0;
    switch (kind) {
      case "stretchR": fx = -W * dIn * k; fx += W * 0.24 * out; fr = -2 * dIn; break;
      case "stretchL": fx = W * dIn * k; fx -= W * 0.24 * out; fr = 2 * dIn; break;
      case "settle": fy = -H * 0.5 * dIn * k; fy += H * 0.18 * out; fs = 1 + 0.14 * dIn; fo = inn; break;
      case "blink": blink = Math.max(dIn, out); fo = 1; break;
      case "curlIn": fs = 1 - 0.36 * dIn; fo = inn; fr = -7 * dIn; break;
      default: fs = 1 + 0.4 * dIn; fo = inn;
    }
    const dz = 1 + p * 0.045 * energy;
    const dx = Math.sin(clock * 0.26) * 7 * energy;
    const dy = Math.cos(clock * 0.36) * 6 * energy;
    return {
      frame: { transform: `translate(${fx}px, ${fy}px) rotate(${fr}deg) scale(${fs})`, opacity: fo },
      drift: { transform: `translate(${dx}px, ${dy}px) scale(${dz})`, opacity: 1 - out * 0.3, willChange: "transform" },
      blink,
    };
  }

  function Cat({ x, y, s = 1, color, t, o = 1 }) {
    const tail = Math.sin(t * 1.3) * 14;
    return React.createElement("g", { transform: `translate(${x},${y}) scale(${s})`, opacity: o },
      React.createElement("path", { d: `M60 0 Q 118 -6 128 -56 Q ${130 + tail} -92 ${106 + tail * 1.4} -96 Q 122 -60 96 -34 Q 78 -18 60 -16 Z`, fill: color }),
      React.createElement("ellipse", { cx: 0, cy: 0, rx: 78, ry: 46, fill: color }),
      React.createElement("circle", { cx: -64, cy: -34, r: 34, fill: color }),
      React.createElement("path", { d: "M-88 -58 L-84 -92 L-62 -66 Z", fill: color }),
      React.createElement("path", { d: "M-46 -62 L-36 -94 L-20 -64 Z", fill: color }),
      React.createElement("path", { d: "M-80 -30 q 8 6 16 0", stroke: rgba("#f6efe4", 0.8), strokeWidth: 2.6, fill: "none", strokeLinecap: "round" }),
      React.createElement("path", { d: "M-56 -30 q 8 6 16 0", stroke: rgba("#f6efe4", 0.8), strokeWidth: 2.6, fill: "none", strokeLinecap: "round" }));
  }

  function World({ theme, t }) {
    const glow = 0.55 + Math.sin(t * 0.9) * 0.12;
    const yx = ((t * 60) % (W + 400)) - 200;
    const motes = Array.from({ length: 9 }).map((_, i) => {
      const mx = W * 0.62 + Math.sin(t * 0.4 + i * 2.2) * (60 + i * 14);
      const my = H * 0.32 + ((t * (10 + i * 3) + i * 90) % 500);
      return React.createElement("circle", { key: i, cx: mx, cy: my, r: 3 + (i % 3), fill: rgba(theme.lamp, 0.5 - (i % 3) * 0.1) });
    });
    return React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
      React.createElement("rect", { x: W * 0.1, y: 180, width: W * 0.52, height: 620, rx: 26, fill: theme.night, stroke: rgba(theme.paper, 0.35), strokeWidth: 10 }),
      React.createElement("line", { x1: W * 0.36, y1: 190, x2: W * 0.36, y2: 795, stroke: rgba(theme.paper, 0.35), strokeWidth: 8 }),
      React.createElement("circle", { cx: W * 0.28, cy: 320 + Math.sin(t * 0.2) * 10, r: 52, fill: theme.paper, opacity: 0.9 }),
      Array.from({ length: 12 }).map((_, i) =>
        React.createElement("circle", { key: i, cx: W * 0.13 + ((i * 137 + t * 14) % (W * 0.46)), cy: 230 + (i * 83) % 540, r: 2.4, fill: rgba("#ffffff", 0.4 + 0.4 * Math.abs(Math.sin(t * 1.1 + i))) })),
      React.createElement("circle", { cx: W * 0.84, cy: H * 0.34, r: 300, fill: rgba(theme.lamp, glow * 0.3) }),
      React.createElement("circle", { cx: W * 0.84, cy: H * 0.34, r: 170, fill: rgba(theme.lamp, glow * 0.4) }),
      motes,
      React.createElement("g", { transform: `translate(${yx},${H - 250}) rotate(${t * 120})` },
        React.createElement("circle", { r: 34, fill: theme.yarn }),
        React.createElement("path", { d: "M-30 -12 Q 0 -34 30 -10 M -32 6 Q 0 -8 32 8 M -24 22 Q 0 12 26 20", stroke: rgba("#ffffff", 0.5), strokeWidth: 5, fill: "none", strokeLinecap: "round" })),
      React.createElement("path", { d: `M${yx - 700} ${H - 216} Q ${yx - 340} ${H - 190 + Math.sin(t) * 20} ${yx} ${H - 250}`, stroke: theme.yarn, strokeWidth: 6, fill: "none", strokeLinecap: "round", opacity: 0.85 }),
      React.createElement(Cat, { x: W * 0.72, y: H - 300, s: 1.35, color: theme.catInk, t, o: 0.97 }));
  }

  function MediaSlot({ src, label, radius = 20, style, fg, compact }) {
    const line = fg || "#f6efe4";
    const base = { width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", ...style };
    if (src) return React.createElement("img", { src, style: { ...base, objectFit: "cover", display: "block" } });
    return React.createElement("div", { style: { ...base, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: rgba(line, 0.05), border: `3px dashed ${rgba(line, 0.4)}`, textAlign: "center", padding: 16 } },
      React.createElement("svg", { width: compact ? 30 : 40, height: compact ? 30 : 40, viewBox: "0 0 24 24", fill: "none", stroke: rgba(line, 0.6), strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
        React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
        React.createElement("path", { d: "M21 16l-5-5L5 19" })),
      !compact && React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 15, letterSpacing: "0.12em", color: rgba(line, 0.72) } }, "DROP IMAGE TO REPLACE"),
      !compact && label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 13, color: rgba(line, 0.5) } }, label));
  }

  function Chrome({ theme, fg }) {
    return React.createElement("div", { style: { position: "absolute", top: 58, left: PAD, display: "flex", alignItems: "center", gap: 15, zIndex: 6 } },
      React.createElement("div", { style: { width: 46, height: 46, borderRadius: 999, background: fg, display: "flex", alignItems: "center", justifyContent: "center" } },
        React.createElement("svg", { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("path", { d: "M12 3c-1 3-4 4-4 8a4 4 0 0 0 8 0c0-4-3-5-4-8Z", transform: "rotate(180 12 11)" }),
          React.createElement("circle", { cx: 12, cy: 16, r: 1 }))),
      React.createElement("span", { style: { fontFamily: FH, fontSize: 33, fontStyle: "italic", color: fg } }, theme.brand));
  }

  function Frame({ progress, theme, bg, fg, world, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0 };
    const CAMS = ["settle", "stretchL", "blink", "curlIn", "stretchR", "zoom"];
    const c = cam(CAMS[(sc.index * 3 + 2) % CAMS.length], progress, theme.energy, clock);
    theme.currentBg = bg;
    return React.createElement("div", { style: { position: "absolute", inset: 0, ...c.frame, willChange: "transform, opacity" } },
      React.createElement("div", { style: { position: "absolute", inset: 0, background: bg, overflow: "hidden", fontFamily: FB } },
        world && React.createElement(World, { theme, t: clock }),
        React.createElement("div", { style: { position: "absolute", inset: 0, ...c.drift } }, children),
        React.createElement(Chrome, { theme, fg }),
        c.blink > 0 && React.createElement("div", { style: { position: "absolute", left: 0, right: 0, top: 0, height: `${c.blink * 52}%`, background: theme.catInk, borderRadius: "0 0 50% 50%/0 0 120px 120px" } }),
        c.blink > 0 && React.createElement("div", { style: { position: "absolute", left: 0, right: 0, bottom: 0, height: `${c.blink * 52}%`, background: theme.catInk, borderRadius: "50% 50% 0 0/120px 120px 0 0" } })));
  }

  const Title = (txt, p, fg, hi, size, from = 0) =>
    splitLines(txt).map((ln, i) =>
      React.createElement("div", { key: i, style: { ...M.drowse(p, from + i), fontFamily: FH, fontSize: size, lineHeight: 1.06, color: i === 1 ? hi : fg } }, ln));

  function Hook({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.night, fg: theme.paper, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 880 } },
        React.createElement("div", { style: { ...M.slideL(p, 0), display: "inline-block", padding: "12px 26px", borderRadius: 999, border: `2px solid ${rgba(theme.lamp, 0.7)}`, color: theme.lamp, fontFamily: FB, fontWeight: 700, fontSize: 24, letterSpacing: "0.18em", marginBottom: 36 } }, scene.kicker || "A FILM ABOUT DOING NOTHING"),
        Title(scene.title || "Nine lives,|one couch.", p, theme.paper, theme.lamp, 124, 1),
        React.createElement("div", { style: { ...M.drowse(p, 4), fontFamily: FB, fontWeight: 600, fontSize: 34, color: rgba(theme.paper, 0.7), marginTop: 34, maxWidth: 760 } }, scene.sub || "The gentle art of the afternoon, taught by a professional.")));
  }

  function Statement({ progress: p, scene, theme }) {
    const clock = useTimeline().time;
    return React.createElement(Frame, { progress: p, theme, bg: theme.plum, fg: theme.paper, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement("circle", { cx: W * 0.82, cy: 360, r: 210, fill: rgba(theme.lamp, 0.16 + Math.sin(clock) * 0.04) }),
        React.createElement(Cat, { x: W * 0.78, y: 430, s: 0.9, color: rgba(theme.paper, 0.2), t: clock })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 640 } },
        Title(scene.title || "Rest is|a skill.", p, theme.paper, theme.lamp, 172, 0),
        React.createElement("div", { style: { ...M.drowse(p, 3), fontFamily: FB, fontWeight: 600, fontSize: 34, color: rgba(theme.paper, 0.68), marginTop: 42, maxWidth: 700 } }, scene.sub || "Practised daily. Perfected in sunbeams.")));
  }

  function Feature({ progress: p, scene, theme }) {
    const chips = (scene.chips && scene.chips.length) ? scene.chips : ["Warm spot located", "Blanket claimed", "Do not disturb"];
    return React.createElement(Frame, { progress: p, theme, bg: theme.paper, fg: theme.catInk, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement("circle", { cx: 130, cy: H - 260, r: 190, fill: rgba(theme.plum, 0.14) }),
        React.createElement("circle", { cx: W - 90, cy: 300, r: 150, fill: rgba(theme.lamp, 0.25) })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 270 } },
        Title(scene.title || "The perfect|napping spot.", p, theme.catInk, theme.plum, 106, 0),
        React.createElement("div", { style: { ...M.curl(p, 2), margin: "44px auto 40px", width: 936, height: 590, background: theme.catInk, borderRadius: 30, padding: 14, boxShadow: `0 30px 60px ${rgba(theme.catInk, 0.3)}` } },
          React.createElement(MediaSlot, { src: scene.image, radius: 18, label: (scene.imageLabel || "Landscape photo \u2014 16:10"), fg: theme.paper })),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 16 } },
          chips.map((c, i) => React.createElement("div", { key: i, style: { ...M.curl(p, i + 4), padding: "14px 26px", borderRadius: 999, background: i % 2 === 0 ? theme.plum : theme.lamp, color: i % 2 === 0 ? theme.paper : theme.catInk, fontFamily: FB, fontWeight: 700, fontSize: 27 } }, c)))));
  }

  function Montage({ progress: p, scene, theme }) {
    const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["The stretch", "The stare", "The loaf", "The nap"];
    return React.createElement(Frame, { progress: p, theme, bg: theme.night, fg: theme.paper, world: false },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        Array.from({ length: 10 }).map((_, i) =>
          React.createElement("circle", { key: i, cx: (i * 131 + 60) % W, cy: (i * 219 + 100) % (H * 0.5), r: 2.2, fill: rgba("#ffffff", 0.35) }))),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 280 } },
        Title(scene.title || "An evening,|documented.", p, theme.paper, theme.lamp, 104, 0),
        React.createElement("div", { style: { marginTop: 54, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 } },
          tiles.slice(0, 4).map((label, i) =>
            React.createElement("div", { key: i, style: { ...M.curl(p, i + 2) } },
              React.createElement("div", { style: { height: 296, borderRadius: 24, background: rgba(theme.paper, 0.07), border: `1px solid ${rgba(theme.paper, 0.2)}`, padding: 12 } },
                React.createElement(MediaSlot, { src: (scene.images || [])[i], radius: 14, label: label, fg: theme.paper })),
              React.createElement("div", { style: { fontFamily: FH, fontStyle: "italic", fontSize: 29, color: rgba(theme.paper, 0.85), marginTop: 12, textAlign: "center" } }, label))))));
  }

  function Stats({ progress: p, scene, theme }) {
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 16, suffix: "h", label: "slept, out of a possible 24" },
      { to: 3, suffix: "", label: "sunbeams followed across the floor" },
      { to: 0, suffix: "", label: "regrets" }];
    const cols = [theme.lamp, theme.paper, theme.yarn];
    return React.createElement(Frame, { progress: p, theme, bg: theme.plum, fg: theme.paper, world: false },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 400 } },
        Title(scene.title || "Today,|in numbers.", p, theme.paper, theme.lamp, 104, 0),
        React.createElement("div", { style: { marginTop: 62, display: "flex", flexDirection: "column", gap: 50 } },
          stats.slice(0, 3).map((st, i) => {
            const e = ease.outCubic(seg(p, 0.12 + i * 0.08, 0.75));
            return React.createElement("div", { key: i, style: { ...M.drowse(p, i + 2), display: "flex", alignItems: "baseline", gap: 30 } },
              React.createElement("div", { style: { fontFamily: FH, fontSize: 172, lineHeight: 0.85, color: cols[i], fontVariantNumeric: "tabular-nums" } }, Math.round(st.to * e).toLocaleString(), React.createElement("span", { style: { fontSize: 82 } }, st.suffix)),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 32, color: rgba(theme.paper, 0.75), maxWidth: 430 } }, st.label));
          }))));
  }

  function CTA({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, bg: theme.night, fg: theme.paper, world: true },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 900 } },
        React.createElement("div", { style: { ...M.curl(p, 0), width: 140, height: 140, borderRadius: 999, overflow: "hidden", background: rgba(theme.paper, 0.1), border: `2px dashed ${rgba(theme.paper, 0.4)}`, marginBottom: 38 } },
          React.createElement(MediaSlot, { src: scene.logo, radius: 999, compact: true, fg: theme.paper })),
        Title(scene.title || "Stay in.|It's nicer.", p, theme.paper, theme.lamp, 122, 1),
        React.createElement("div", { style: { ...M.curl(p, 4), display: "inline-flex", alignItems: "center", gap: 14, marginTop: 48, padding: "24px 50px", borderRadius: 999, background: theme.lamp, color: theme.catInk, fontFamily: FB, fontWeight: 800, fontSize: 40 } },
          scene.cta || "Curl up with us",
          React.createElement("svg", { width: 32, height: 32, viewBox: "0 0 24 24", fill: "none", stroke: theme.catInk, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M5 12h14" }), React.createElement("path", { d: "M13 6l6 6-6 6" }))),
        React.createElement("div", { style: { ...M.drowse(p, 5), fontFamily: FB, fontWeight: 700, fontSize: 34, color: rgba(theme.paper, 0.85), marginTop: 38 } }, scene.url || "catnap.house")));
  }

  const SCENE_MAP = { Hook, Statement, Feature, Montage, Stats, CTA };
  const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.3 };

  function CatNap() {
    const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
    const [t, setTweak] = useTweaks(defaults);
    const theme = {
      W, H,
      night: t.night || "#332a47", plum: t.plum || "#59436b", lamp: t.lamp || "#f0b45c",
      yarn: "#c96b8e", paper: "#f6efe4", catInk: "#241d2e",
      brand: t.brand || "Cat Nap",
      energy: ENERGY[t.motion] ?? 1.0,
      currentBg: "#332a47",
    };
    const scenes = {};
    for (const k in SCENE_MAP) { const C = SCENE_MAP[k]; scenes[k] = (props) => React.createElement(C, { ...props, theme }); }
    return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#191423" } },
      React.createElement(SceneStage, { width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.night }, scenes),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, { label: "Night", value: theme.night, options: ["#332a47", "#241d2e", "#2c3554"], onChange: (v) => setTweak("night", v) }),
        React.createElement(TweakColor, { label: "Lamp glow", value: theme.lamp, options: ["#f0b45c", "#e8935c", "#d9c07a"], onChange: (v) => setTweak("lamp", v) }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) })));
  }
  window.CatNap = CatNap;
})();
