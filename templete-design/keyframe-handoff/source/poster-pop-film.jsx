/* poster-pop-film.jsx — "Poster Pop" animated video template (9:16, loop).
   Loud kinetic-typography poster reel: each scene is a solid color block
   (terracotta / ink / sage / cream), gigantic Caprasimo type slamming in
   word by word, endless scrolling marquee bands, rotating starbursts.
   Organic tokens at full contrast. Exposes window.PosterPop. */
(function () {
  const { SceneStage } = window;
  // ambient/world motion (drift, embers, petals, scroll) runs faster than wall clock
  const AMBIENT = 1.75;
  const useTimeline = () => {
    const tl = window.useTimeline();
    return Object.assign({}, tl, { time: tl.time * AMBIENT });
  };
  const { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakText, TweakRadio } = window;

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
    outBack: (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  };
  function hexToRgb(h) {
    h = (h || "#000").replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const splitLines = (t) => String(t == null ? "" : t).split("|");

  const FH = '"Caprasimo", Georgia, serif';
  const FB = '"Figtree", system-ui, sans-serif';

  /* ---------- reusable motion ---------- */
  const M = {
    slam: (p, i = 0) => {
      const t = ease.outBack(clamp01((p - i * 0.07) / 0.36));
      return { opacity: clamp01(t * 2), transform: `translateY(${(1 - t) * 90}px) scale(${lerp(1.5, 1, clamp01(t))})` };
    },
    rise: (p, i = 0) => { const t = ease.outQuint(clamp01((p - i * 0.06) / 0.4)); return { opacity: t, transform: `translateY(${(1 - t) * 40}px)` }; },
    pop: (p, i = 0) => { const t = ease.outBack(clamp01((p - i * 0.06) / 0.4)); return { opacity: clamp01(t * 1.6), transform: `scale(${lerp(0.6, 1, t)})` }; },
  };

  /* ---------- camera: full-bleed scene pushes + continuous drift ---------- */
  function cam(kind, p, energy, clock, W, H) {
    const inn = ease.outQuint(seg(p, 0, 0.24));
    const out = ease.inCubic(seg(p, 0.8, 1));
    const dIn = 1 - inn, k = Math.min(energy, 1.15);
    // full-frame push: the whole poster (bg included) slides in over the previous one
    let fx = 0, fy = 0, fr = 0, fs = 1, fo = 1;
    switch (kind) {
      case "pushL": fx = W * dIn * k; fx -= W * 0.28 * out; break;
      case "pushR": fx = -W * dIn * k; fx += W * 0.28 * out; break;
      case "pushU": fy = H * dIn * k; fy -= H * 0.2 * out; break;
      case "pushD": fy = -H * dIn * k; fy += H * 0.2 * out; break;
      case "punch": fs = 1 + 0.5 * dIn; fo = inn; fr = -4 * dIn; break;
      case "spin": fs = 1 - 0.4 * dIn; fo = inn; fr = 8 * dIn; break;
      default: fo = inn;
    }
    // continuous inner drift: slow zoom + pan + bob for the WHOLE scene duration
    const live = 1 - out;
    const dz = 1 + p * 0.06 * energy;
    const dx = Math.sin(clock * 0.3) * 8 * energy - p * 18 * energy;
    const dy = Math.sin(clock * 0.45) * 7 * energy;
    return {
      frame: { transform: `translate(${fx}px, ${fy}px) rotate(${fr}deg) scale(${fs})`, opacity: fo },
      drift: { transform: `translate(${dx}px, ${dy}px) scale(${dz})`, opacity: 1 - out * 0.4, willChange: "transform" },
      live,
    };
  }

  /* ---------- pieces ---------- */
  function Starburst({ cx, cy, R, color, t, petals = 12, speed = 8, style }) {
    const pts = [];
    for (let i = 0; i < petals * 2; i++) {
      const a = (i / (petals * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? R : R * 0.55;
      pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
    }
    return React.createElement("polygon", { points: pts.join(" "), fill: color, transform: `rotate(${t * speed} ${cx} ${cy})`, style });
  }

  function Marquee({ text, theme, y, bg, fg, t, dir = 1, size = 44 }) {
    const item = ` ${text} \u2022`;
    const rep = Array.from({ length: 10 }, () => item).join("");
    const shift = ((t * 90 * dir) % 600 + 600) % 600;
    return React.createElement("div", { style: { position: "absolute", left: -100, right: -100, top: y, background: bg, padding: "16px 0", transform: "rotate(-2.5deg)", overflow: "hidden", whiteSpace: "nowrap", zIndex: 3, boxShadow: `0 14px 40px ${rgba("#201e1d", 0.18)}` } },
      React.createElement("div", { style: { fontFamily: FH, fontSize: size, color: fg, transform: `translateX(${-shift}px)`, whiteSpace: "nowrap" } }, rep));
  }

  function MediaSlot({ src, label, radius = 20, theme, style, compact, fg, bgTint }) {
    const line = fg || theme.ink;
    const base = { width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", ...style };
    if (src) return React.createElement("img", { src, style: { ...base, objectFit: "cover", display: "block" } });
    if (compact) {
      return React.createElement("div", { style: { ...base, display: "flex", alignItems: "center", justifyContent: "center", background: bgTint || rgba(line, 0.06), border: `3px dashed ${rgba(line, 0.4)}` } },
        React.createElement("svg", { width: 34, height: 34, viewBox: "0 0 24 24", fill: "none", stroke: rgba(line, 0.6), strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
          React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
          React.createElement("path", { d: "M21 16l-5-5L5 19" })));
    }
    return React.createElement("div", { style: { ...base, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: bgTint || rgba(line, 0.05), border: `3px dashed ${rgba(line, 0.4)}`, textAlign: "center", padding: 22 } },
      React.createElement("div", { style: { width: 50, height: 50, borderRadius: 999, background: rgba(line, 0.14), display: "flex", alignItems: "center", justifyContent: "center" } },
        React.createElement("svg", { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: line, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
          React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
          React.createElement("path", { d: "M21 16l-5-5L5 19" }))),
      React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 16, letterSpacing: "0.13em", color: rgba(line, 0.7) } }, "DROP IMAGE TO REPLACE"),
      label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 14, color: rgba(line, 0.5) } }, label));
  }

  // desktop browser card
  function Browser({ children, theme, frame, dots, style }) {
    return React.createElement("div", { style: { background: frame, borderRadius: 28, padding: 12, boxShadow: `0 34px 70px ${rgba("#201e1d", 0.3)}`, ...style } },
      React.createElement("div", { style: { display: "flex", gap: 8, padding: "4px 8px 10px" } },
        [0.9, 0.4, 0.4].map((o, i) => React.createElement("span", { key: i, style: { width: 13, height: 13, borderRadius: 999, background: rgba(dots, o) } }))),
      React.createElement("div", { style: { borderRadius: 18, overflow: "hidden", height: "calc(100% - 39px)" } }, children));
  }

  function Chrome({ theme, fg }) {
    const { index, count } = window.useScene ? window.useScene() : { index: 0, count: 6 };
    return React.createElement(React.Fragment, null,
      React.createElement("div", { style: { position: "absolute", top: 58, left: 66, display: "flex", alignItems: "center", gap: 16, zIndex: 6 } },
        React.createElement("div", { style: { width: 46, height: 46, borderRadius: 999, background: fg, display: "flex", alignItems: "center", justifyContent: "center" } },
          React.createElement("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.currentBg, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
            React.createElement("path", { d: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" }))),
        React.createElement("span", { style: { fontFamily: FH, fontSize: 33, color: fg } }, theme.brand))
    );
  }

  function Frame({ progress, camKind, theme, bg, fg, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0 };
    const CAMS = ["punch", "pushL", "pushU", "pushR", "spin", "pushD"];
    const c = cam(CAMS[sc.index % CAMS.length] || camKind, progress, theme.energy, clock, theme.W, theme.H);
    theme.currentBg = bg;
    return React.createElement("div", { style: { position: "absolute", inset: 0, ...c.frame, willChange: "transform, opacity" } },
      React.createElement("div", { style: { position: "absolute", inset: 0, background: bg, overflow: "hidden", fontFamily: FB } },
        React.createElement("div", { style: { position: "absolute", inset: 0, ...c.drift } }, children),
        React.createElement(Chrome, { theme, fg })));
  }

  const PAD = 66;
  const BigTitle = (txt, theme, p, fg, hi, size, from = 0) =>
    splitLines(txt).map((ln, i) => {
      const isHi = i === 1;
      return React.createElement("div", { key: i, style: { ...M.slam(p, from + i), fontFamily: FH, fontSize: size, lineHeight: 0.98, color: isHi ? hi : fg, letterSpacing: "-0.01em", textTransform: "uppercase" } }, ln);
    });

  /* ---------- scenes ---------- */
  function Hook({ progress, scene, theme }) {
    const p = progress, clock = useTimeline().time;
    const bg = theme.accent, fg = theme.paper;
    return React.createElement(Frame, { progress, camKind: "punch", theme, bg, fg },
      React.createElement("svg", { width: theme.W, height: theme.H, style: { position: "absolute", inset: 0 } },
        React.createElement(Starburst, { cx: theme.W * 0.85, cy: 300, R: 260, color: rgba(theme.paper, 0.16), t: clock, petals: 14, speed: 10 }),
        React.createElement(Starburst, { cx: 60, cy: theme.H * 0.72, R: 200, color: rgba(theme.ink, 0.14), t: clock, petals: 10, speed: -13 })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 330 } },
        React.createElement("div", { style: { ...M.pop(p, 0), display: "inline-block", padding: "14px 30px", borderRadius: 999, background: theme.ink, color: theme.paper, fontFamily: FB, fontWeight: 800, fontSize: 26, letterSpacing: "0.2em", marginBottom: 44 } }, scene.kicker || "THIS WEEKEND ONLY"),
        BigTitle(scene.title || "Big.|Bold.|Impossible|to miss.", theme, p, fg, theme.ink, 142, 1),
        React.createElement("div", { style: { ...M.rise(p, 6), fontFamily: FB, fontWeight: 600, fontSize: 38, color: rgba(theme.paper, 0.9), marginTop: 40, maxWidth: 760 } }, scene.sub || "The loudest way to say it \u2014 in ten seconds flat.")),
      React.createElement(Marquee, { text: (scene.ticker || "MAKE SOME NOISE").toUpperCase(), theme, y: theme.H - 320, bg: theme.ink, fg: theme.paper, t: clock, size: 46 })
    );
  }

  function Statement({ progress, scene, theme }) {
    const p = progress, clock = useTimeline().time;
    const bg = theme.ink, fg = theme.paper;
    return React.createElement(Frame, { progress, camKind: "pushL", theme, bg, fg },
      React.createElement("svg", { width: theme.W, height: theme.H, style: { position: "absolute", inset: 0 } },
        React.createElement(Starburst, { cx: theme.W * 0.5, cy: theme.H * 0.5, R: 560, color: rgba(theme.accent, 0.14), t: clock, petals: 16, speed: 5 })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 560 } },
        BigTitle(scene.title || "Quiet|doesn't|sell.", theme, p, fg, theme.accent, 210, 0),
        React.createElement("div", { style: { ...M.rise(p, 4), fontFamily: FB, fontWeight: 600, fontSize: 38, color: rgba(theme.paper, 0.7), marginTop: 46, maxWidth: 760 } }, scene.sub || "Say it once, say it huge, and let the color do the rest."))
    );
  }

  function Feature({ progress, scene, theme }) {
    const p = progress, clock = useTimeline().time;
    const bg = theme.paper, fg = theme.ink;
    const chips = (scene.chips && scene.chips.length) ? scene.chips : ["Ready in minutes", "Loops forever", "Zero editing"];
    return React.createElement(Frame, { progress, camKind: "pushU", theme, bg, fg },
      React.createElement("svg", { width: theme.W, height: theme.H, style: { position: "absolute", inset: 0 } },
        React.createElement(Starburst, { cx: theme.W - 80, cy: theme.H * 0.62, R: 240, color: rgba(theme.accent2, 0.3), t: clock, petals: 12, speed: -8 })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 270 } },
        BigTitle(scene.title || "Your product,|poster-sized.", theme, p, fg, theme.accent, 116, 0),
        React.createElement("div", { style: { ...M.pop(p, 2), margin: "50px auto 44px", width: 944, height: 610 } },
          React.createElement(Browser, { theme, frame: theme.ink, dots: theme.paper, style: { width: 944, height: 610 } },
            React.createElement(MediaSlot, { src: scene.image, theme, radius: 0, label: "Desktop screenshot \u2014 16:10", fg: theme.ink, bgTint: theme.paper }))),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "center" } },
          chips.map((c, i) =>
            React.createElement("div", { key: i, style: { ...M.pop(p, i + 3), padding: "16px 30px", borderRadius: 999, background: i % 2 === 0 ? theme.accent : theme.accent2, color: theme.paper, fontFamily: FB, fontWeight: 800, fontSize: 30 } }, c))))
    );
  }

  function Montage({ progress, scene, theme }) {
    const p = progress, clock = useTimeline().time;
    const bg = theme.accent2, fg = theme.paper;
    const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["Home", "Pricing", "Dashboard", "Checkout"];
    const tilts = [-3, 2.5, 2, -2.5];
    return React.createElement(Frame, { progress, camKind: "pushR", theme, bg, fg },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 290 } },
        BigTitle(scene.title || "Every page.|Every angle.", theme, p, fg, theme.ink, 116, 0),
        React.createElement("div", { style: { marginTop: 60, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 } },
          tiles.slice(0, 4).map((label, i) =>
            React.createElement("div", { key: i, style: { ...M.pop(p, i + 2), transform: `rotate(${tilts[i]}deg)` } },
              React.createElement("div", { style: { height: 280, borderRadius: 24, overflow: "hidden", background: theme.paper, padding: 10, boxShadow: `0 24px 50px ${rgba("#201e1d", 0.25)}` } },
                React.createElement("div", { style: { height: "100%", borderRadius: 16, overflow: "hidden" } },
                  React.createElement(MediaSlot, { src: (scene.images || [])[i], theme, radius: 0, label: `${label} \u2014 desktop`, fg: theme.ink }))),
              React.createElement("div", { style: { fontFamily: FH, fontSize: 30, color: theme.paper, marginTop: 16, textAlign: "center", textTransform: "uppercase" } }, label)))))
      ,
      React.createElement(Marquee, { text: (scene.ticker || "SEE IT ALL").toUpperCase(), theme, y: theme.H - 300, bg: theme.ink, fg: theme.paper, t: clock, dir: -1, size: 42 })
    );
  }

  function Stats({ progress, scene, theme }) {
    const p = progress;
    const bg = theme.ink, fg = theme.paper;
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 10, suffix: "s", label: "to make your point" },
      { to: 4, suffix: "\u00d7", label: "more eyes than a static post" },
      { to: 100, suffix: "%", label: "yours \u2014 copy, color, everything" },
    ];
    const cols = [theme.accent, theme.accent2, theme.paper];
    return React.createElement(Frame, { progress, camKind: "spin", theme, bg, fg },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 420 } },
        BigTitle(scene.title || "Numbers,|loud ones.", theme, p, fg, theme.accent, 116, 0),
        React.createElement("div", { style: { marginTop: 70, display: "flex", flexDirection: "column", gap: 58 } },
          stats.slice(0, 3).map((st, i) => {
            const e = ease.outCubic(seg(p, 0.12 + i * 0.08, 0.75));
            const v = st.to * e;
            const txt = Math.abs(st.to % 1) > 0 ? v.toFixed(1) : Math.round(v).toLocaleString();
            return React.createElement("div", { key: i, style: { ...M.rise(p, i + 2), display: "flex", alignItems: "baseline", gap: 34 } },
              React.createElement("div", { style: { fontFamily: FH, fontSize: 190, lineHeight: 0.85, color: cols[i], fontVariantNumeric: "tabular-nums" } }, txt, React.createElement("span", { style: { fontSize: 90 } }, st.suffix)),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 36, color: rgba(theme.paper, 0.75), maxWidth: 420 } }, st.label));
          })))
    );
  }

  function CTA({ progress, scene, theme }) {
    const p = progress, clock = useTimeline().time;
    const bg = theme.accent, fg = theme.paper;
    return React.createElement(Frame, { progress, camKind: "pushD", theme, bg, fg },
      React.createElement("svg", { width: theme.W, height: theme.H, style: { position: "absolute", inset: 0 } },
        React.createElement(Starburst, { cx: theme.W * 0.5, cy: theme.H * 0.32, R: 430, color: rgba(theme.paper, 0.14), t: clock, petals: 18, speed: 7 })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 520, textAlign: "center" } },
        React.createElement("div", { style: { ...M.pop(p, 0), display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 50 } },
          React.createElement("div", { style: { width: 140, height: 140, borderRadius: 999, overflow: "hidden", flex: "none", background: theme.paper } },
            React.createElement(MediaSlot, { src: scene.logo, theme, radius: 999, compact: true, fg: theme.ink })),
          !scene.logo && React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 20, letterSpacing: "0.1em", color: rgba(theme.paper, 0.8), textAlign: "left", maxWidth: 220 } }, "DROP LOGO HERE")),
        BigTitle(scene.title || "Stop|scrolling.|Start now.", theme, p, fg, theme.ink, 150, 1),
        React.createElement("div", { style: { ...M.pop(p, 5), display: "inline-flex", alignItems: "center", gap: 16, marginTop: 56, padding: "28px 58px", borderRadius: 999, background: theme.ink, color: theme.paper, fontFamily: FH, fontSize: 46, boxShadow: `0 24px 60px ${rgba("#201e1d", 0.4)}` } },
          scene.cta || "Make yours",
          React.createElement("svg", { width: 38, height: 38, viewBox: "0 0 24 24", fill: "none", stroke: theme.paper, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M5 12h14" }), React.createElement("path", { d: "M13 6l6 6-6 6" }))),
        React.createElement("div", { style: { ...M.rise(p, 6), fontFamily: FB, fontWeight: 800, fontSize: 38, letterSpacing: "0.04em", color: theme.paper, marginTop: 44 } }, scene.url || "posterpop.studio")),
      React.createElement(Marquee, { text: (scene.ticker || "MAKE YOURS TODAY").toUpperCase(), theme, y: theme.H - 300, bg: theme.paper, fg: theme.ink, t: clock, size: 42 })
    );
  }

  const SCENE_MAP = { Hook, Statement, Feature, Montage, Stats, CTA };
  const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.4 };

  function PosterPop() {
    const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
    const [t, setTweak] = useTweaks(defaults);
    const W = 1080, H = 1920;
    const theme = {
      W, H,
      paper: t.paper || "#f5ead8", ink: t.ink || "#201e1d",
      accent: t.accent || "#c67139", accent2: t.accent2 || "#7a8a5e",
      brand: t.brand || "Poster Pop",
      energy: ENERGY[t.motion] ?? 1.0,
      currentBg: "#c67139",
    };
    const scenes = {};
    for (const k in SCENE_MAP) { const C = SCENE_MAP[k]; scenes[k] = (props) => React.createElement(C, { ...props, theme }); }
    return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#141312" } },
      React.createElement(SceneStage, { width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.accent }, scenes),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, { label: "Poster color", value: theme.accent, options: ["#c67139", "#b2622d", "#7a8a5e", "#8c491a"], onChange: (v) => setTweak("accent", v) }),
        React.createElement(TweakColor, { label: "Second color", value: theme.accent2, options: ["#7a8a5e", "#56633f", "#c67139"], onChange: (v) => setTweak("accent2", v) }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) })
      )
    );
  }

  window.PosterPop = PosterPop;
})();
