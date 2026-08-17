/* story-blocks-film.jsx — "Story Blocks" v2: edited-video style (9:16, loop).
   No parked layouts: kinetic word-by-word type, elements that keep traveling
   the whole scene, internal jump-cuts (beats) inside scenes, a conveyor
   montage, and whip-pan cuts between scenes. Organic tokens, bold blocks.
   Exposes window.StoryBlocks. */
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
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inCubic: (t) => t * t * t,
    outBack: (t) => { const c = 1.8; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
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

  /* Display type is set at a fixed px size on a fixed-width stage, so a long word
     runs straight past the frame edge. Measure each line and scale the whole title
     down until the widest line fits the content column. Kinetic sets words at -0.01em with a 0.24em gap. */
  const _fitCtx = (typeof document !== "undefined" && document.createElement("canvas").getContext("2d")) || null;
  function fitSize(text, size, maxW, family, gapEm, trackEm) {
    if (!_fitCtx || !text || !maxW) return size;
    let ratio = 1;
    for (const raw of splitLines(text)) {
      const ln = raw.trim().toUpperCase();
      if (!ln) continue;
      _fitCtx.font = size + "px " + family;
      const words = ln.split(/\s+/);
      // every word carries a trailing gap, and canvas metrics under-read heavy
      // display faces slightly, so leave headroom rather than measure exactly
      const limit = maxW * 0.9;
      const w = _fitCtx.measureText(ln).width
        + size * trackEm * ln.length
        + size * gapEm * words.length;
      if (w > limit) ratio = Math.min(ratio, limit / w);
    }
    return ratio < 1 ? Math.max(size * 0.46, size * ratio) : size;
  }

  const FB = '"Figtree", system-ui, sans-serif';

  /* ---------- kinetic word-by-word type: words keep living after they land ---------- */
  function Kinetic({ text, p, start = 0.05, step = 0.055, size: size0, color, hiColor, hiWords = [], clock, style, maxW = 1080 - 128 }) {
    const size = fitSize(text, size0, maxW, FH, 0.24, -0.01);
    const lines = splitLines(text);
    let w = 0;
    return React.createElement("div", { style: { ...style } },
      lines.map((ln, li) =>
        React.createElement("div", { key: li, style: { lineHeight: 1.02, whiteSpace: "nowrap" } },
          ln.trim().split(/\s+/).map((word, wi) => {
            const idx = w++;
            const e = ease.outBack(clamp01((p - start - idx * step) / 0.3));
            const hi = hiWords.includes(word.replace(/[.,!?]/g, ""));
            const wob = Math.sin(clock * 1.6 + idx * 1.1) * 1.2;
            return React.createElement("span", {
              key: wi,
              style: {
                display: "inline-block", fontFamily: FH, fontSize: size, color: hi ? hiColor : color,
                textTransform: "uppercase", letterSpacing: "-0.01em", marginRight: "0.24em",
                opacity: clamp01(e * 2),
                transform: `translateY(${(1 - e) * 70}px) rotate(${(1 - e) * -8 + wob}deg) scale(${lerp(1.4, 1, clamp01(e))})`,
              },
            }, word);
          }))));
  }

  /* ---------- beat: an element that exists for a sub-range of the scene (jump-cut) ---------- */
  function beat(p, a, b, dirIn = 1, dirOut = -1) {
    const q = segRaw(p, a, b);
    if (q <= 0 || q >= 1) return null;
    // Ramps are deliberately short: a beat is legible almost the whole of its
    // range, then snaps out while the next one is already snapping in. Long
    // ramps here leave a blank frame between beats.
    const inn = ease.outQuint(seg(q, 0, 0.14));
    const out = ease.inOut(seg(q, 0.9, 1));
    return {
      q,
      style: {
        opacity: clamp01(inn * 1.5) * (1 - out),
        transform: `translateX(${(1 - inn) * 90 * dirIn + out * 160 * dirOut}px) skewX(${(1 - inn) * -6 + out * 8}deg)`,
      },
    };
  }

  // continuous travel across the whole scene — nothing ever parks
  const travel = (p, x0, x1, y0 = 0, y1 = 0, r0 = 0, r1 = 0) =>
    `translate(${lerp(x0, x1, p)}px, ${lerp(y0, y1, p)}px) rotate(${lerp(r0, r1, p)}deg)`;

  function Starburst({ cx, cy, R, color, t, petals = 12, speed = 8 }) {
    const pts = [];
    for (let i = 0; i < petals * 2; i++) {
      const a = (i / (petals * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? R : R * 0.55;
      pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
    }
    return React.createElement("polygon", { points: pts.join(" "), fill: color, transform: `rotate(${t * speed} ${cx} ${cy})` });
  }

  function Ticker({ text, t, bg, fg, y, tilt = -2.5, size = 44, dir = 1 }) {
    const item = ` ${text} \u2022`;
    const rep = Array.from({ length: 12 }, () => item).join("");
    const shift = ((t * 110 * dir) % 560 + 560) % 560;
    return React.createElement("div", { style: { position: "absolute", left: -120, right: -120, top: y, background: bg, padding: "15px 0", transform: `rotate(${tilt}deg)`, overflow: "hidden", whiteSpace: "nowrap", zIndex: 4, boxShadow: `0 14px 40px ${rgba("#201e1d", 0.2)}` } },
      React.createElement("div", { style: { fontFamily: FH, fontSize: size, color: fg, transform: `translateX(${-shift}px)`, whiteSpace: "nowrap", textTransform: "uppercase" } }, rep));
  }

  function MediaSlot({ src, label, radius = 18, theme, style, compact }) {
    const base = { width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", ...style };
    if (src) return React.createElement("img", { src, style: { ...base, objectFit: "cover", display: "block" } });
    if (compact) {
      return React.createElement("div", { style: { ...base, display: "flex", alignItems: "center", justifyContent: "center", background: theme.paper, border: `3px dashed ${rgba(theme.ink, 0.35)}` } },
        React.createElement("svg", { width: 34, height: 34, viewBox: "0 0 24 24", fill: "none", stroke: rgba(theme.ink, 0.6), strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
          React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
          React.createElement("path", { d: "M21 16l-5-5L5 19" })));
    }
    return React.createElement("div", { style: { ...base, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: theme.paper, border: `3px dashed ${rgba(theme.ink, 0.35)}`, textAlign: "center", padding: 20 } },
      React.createElement("div", { style: { width: 48, height: 48, borderRadius: 999, background: rgba(theme.ink, 0.12), display: "flex", alignItems: "center", justifyContent: "center" } },
        React.createElement("svg", { width: 25, height: 25, viewBox: "0 0 24 24", fill: "none", stroke: theme.ink, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
          React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
          React.createElement("path", { d: "M21 16l-5-5L5 19" }))),
      React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 16, letterSpacing: "0.13em", color: rgba(theme.ink, 0.7) } }, "DROP IMAGE TO REPLACE"),
      label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 14, color: rgba(theme.ink, 0.5) } }, label));
  }

  function Browser({ children, frame, dots, style }) {
    return React.createElement("div", { style: { background: frame, borderRadius: 24, padding: 10, boxShadow: `0 30px 66px ${rgba("#201e1d", 0.32)}`, ...style } },
      React.createElement("div", { style: { display: "flex", gap: 7, padding: "4px 8px 9px" } },
        [0.9, 0.4, 0.4].map((o, i) => React.createElement("span", { key: i, style: { width: 12, height: 12, borderRadius: 999, background: rgba(dots, o) } }))),
      React.createElement("div", { style: { borderRadius: 15, overflow: "hidden", height: "calc(100% - 34px)" } }, children));
  }

  function Chrome({ theme, fg }) {
    return React.createElement("div", { style: { position: "absolute", top: 56, left: 64, display: "flex", alignItems: "center", gap: 15, zIndex: 8 } },
      React.createElement("div", { style: { width: 46, height: 46, borderRadius: 12, background: fg, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-6deg)" } },
        React.createElement("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.chromeBg, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("rect", { x: 4, y: 4, width: 7, height: 7, rx: 2 }), React.createElement("rect", { x: 13, y: 4, width: 7, height: 7, rx: 2 }), React.createElement("rect", { x: 4, y: 13, width: 7, height: 7, rx: 2 }), React.createElement("rect", { x: 13, y: 13, width: 7, height: 7, rx: 2 }))),
      React.createElement("span", { style: { fontFamily: FH, fontSize: 32, color: fg } }, theme.brand));
  }

  /* ---------- frame with invisible match-cut wipes ----------
     Exit: a solid panel sweeps in and fully covers the frame by p=1.
     Enter: the SAME-colored panel (keyed by the incoming scene's index)
     continues sweeping off. The hard cut lands while both frames are the
     identical solid color, so it reads as one continuous editor wipe. */
  function Frame({ progress: p, bg, fg, theme, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0, count: 6 };
    theme.chromeBg = bg;
    const WIPES = [theme.ink, theme.paper, theme.accent, theme.ink, theme.paper, theme.paper];
    const EDGES = [theme.accent, theme.ink, theme.paper, theme.accent2, theme.accent, theme.ink];
    const AXES = ["y", "x", "y", "x", "y", "x"];
    const n = sc.count || 6;
    const cur = sc.index % 6, nxt = ((sc.index + 1) % n) % 6;
    const rIn = ease.inOut(seg(p, 0, 0.14));
    const rOut = ease.inOut(seg(p, 0.86, 1));
    const panel = (color, edgeColor, axis, off) => {
      // off = 0 → covering the frame; off = ±1 → fully off-screen
      const t = `${axis === "y" ? "translateY" : "translateX"}(${off * 102}%)`;
      const edge = axis === "y"
        ? { position: "absolute", left: 0, right: 0, [off <= 0 ? "bottom" : "top"]: -2, height: 18, background: edgeColor }
        : { position: "absolute", top: 0, bottom: 0, [off <= 0 ? "right" : "left"]: -2, width: 18, background: edgeColor };
      return React.createElement("div", { style: { position: "absolute", inset: -4, background: color, transform: t, zIndex: 9, willChange: "transform" } },
        React.createElement("div", { style: edge }));
    };
    // continuous scene-long drift + a settle-punch out of the wipe
    const dz = (1 + (1 - rIn) * 0.05 + rOut * 0.04) * (1 + p * 0.045 * theme.energy);
    const ddx = Math.sin(clock * 0.32) * 6 - p * 14;
    const ddy = Math.sin(clock * 0.5) * 6;
    return React.createElement("div", { style: { position: "absolute", inset: 0, background: bg, overflow: "hidden", fontFamily: FB } },
      React.createElement("div", { style: { position: "absolute", inset: 0, transform: `translate(${ddx}px, ${ddy}px) scale(${dz})`, willChange: "transform" } }, children),
      React.createElement(Chrome, { theme, fg }),
      rIn < 1 && panel(WIPES[cur], EDGES[cur], AXES[cur], -rIn),
      rOut > 0 && panel(WIPES[nxt], EDGES[nxt], AXES[nxt], 1 - rOut));
  }

  const PADX = 64;

  /* ---------- scenes ---------- */
  function Hook({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const card = { transform: travel(p, 60, -60, 40, -20, 3, -2) };
    return React.createElement(Frame, { progress: p, whip: "u", bg: theme.accent, fg: theme.paper, theme },
      React.createElement("svg", { width: theme.W, height: theme.H, style: { position: "absolute", inset: 0 } },
        React.createElement(Starburst, { cx: theme.W * 0.88, cy: 260, R: 250, color: rgba(theme.paper, 0.16), t, petals: 14, speed: 12 }),
        React.createElement(Starburst, { cx: 40, cy: theme.H * 0.62, R: 190, color: rgba(theme.ink, 0.15), t, petals: 10, speed: -16 })),
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 320 } },
        React.createElement("div", { style: { display: "inline-block", padding: "12px 26px", borderRadius: 12, background: theme.ink, color: theme.paper, fontFamily: FB, fontWeight: 800, fontSize: 25, letterSpacing: "0.18em", marginBottom: 40, transform: `rotate(${-2 + Math.sin(t * 1.2) * 1.5}deg) scale(${ease.outBack(seg(p, 0.02, 0.14))})` } }, scene.kicker || "CHAPTER ONE"),
        React.createElement(Kinetic, { text: scene.title || "Every brand|has a story.", p, size: 110, color: theme.paper, hiColor: theme.ink, hiWords: ["story"], clock: t }),
        React.createElement("div", { style: { marginTop: 44, ...card } },
          React.createElement(Browser, { frame: theme.ink, dots: theme.paper, style: { width: 860, height: 480 } },
            React.createElement(MediaSlot, { src: scene.image, theme, radius: 0, label: "Desktop screenshot \u2014 16:10" })))),
      React.createElement(Ticker, { text: (scene.sub || "TELL YOURS IN BLOCKS").toUpperCase(), t, bg: theme.ink, fg: theme.paper, y: theme.H - 310 })
    );
  }

  function Statement({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const lines = splitLines(scene.title || "Feeds are|noisy.|Blocks cut|through.");
    const first = lines.slice(0, 2).join("|"), second = lines.slice(2).join("|") || "Cut through.";
    const b1 = beat(p, 0, 0.52, 1, -1);
    const b2 = beat(p, 0.47, 1, -1, 1);
    return React.createElement(Frame, { progress: p, whip: "l", bg: theme.ink, fg: theme.paper, theme },
      React.createElement("svg", { width: theme.W, height: theme.H, style: { position: "absolute", inset: 0 } },
        React.createElement(Starburst, { cx: theme.W * 0.5, cy: theme.H * 0.46, R: 520, color: rgba(theme.accent, 0.15), t, petals: 16, speed: 6 })),
      b1 && React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 620, ...b1.style } },
        React.createElement(Kinetic, { text: first, p: b1.q, size: 148, color: theme.paper, hiColor: theme.accent, hiWords: ["noisy"], clock: t, step: 0.09 })),
      b2 && React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 620, ...b2.style } },
        React.createElement(Kinetic, { text: second, p: b2.q, size: 148, color: theme.paper, hiColor: theme.accent2, hiWords: ["cut", "through"], clock: t, step: 0.09 }),
        React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 38, color: rgba(theme.paper, 0.7), marginTop: 40, opacity: seg(b2.q, 0.3, 0.6) } }, scene.sub || "One idea per panel. No fluff between.")),
      React.createElement(Ticker, { text: "LOUD \u2022 FAST \u2022 YOURS", t, bg: theme.accent, fg: theme.paper, y: theme.H - 300, tilt: 2.5, dir: -1 })
    );
  }

  function Feature({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const chips = (scene.chips && scene.chips.length) ? scene.chips : ["Drag in screenshots", "Swap every word", "Recolor in one tap"];
    const card = { transform: travel(p, 90, -90, 20, -30, 2, -3) };
    return React.createElement(Frame, { progress: p, whip: "r", bg: theme.paper, fg: theme.ink, theme },
      React.createElement("svg", { width: theme.W, height: theme.H, style: { position: "absolute", inset: 0 } },
        React.createElement(Starburst, { cx: theme.W - 60, cy: theme.H * 0.7, R: 230, color: rgba(theme.accent2, 0.35), t, petals: 12, speed: -9 })),
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 250 } },
        React.createElement(Kinetic, { text: scene.title || "Built from|your screens.", p, size: 100, color: theme.ink, hiColor: theme.accent, hiWords: ["screens"], clock: t }),
        React.createElement("div", { style: { margin: "46px 0 0", ...card } },
          React.createElement(Browser, { frame: theme.ink, dots: theme.paper, style: { width: 944, height: 590 } },
            React.createElement(MediaSlot, { src: scene.image, theme, radius: 0, label: "Desktop screenshot \u2014 16:10" }))),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 18, marginTop: 44, alignItems: "flex-start" } },
          chips.slice(0, 3).map((c, i) => {
            const e = ease.outBack(clamp01((p - 0.42 - i * 0.1) / 0.3));
            const drift = Math.sin(t * 0.9 + i * 2) * 6;
            return React.createElement("div", { key: i, style: { display: "inline-flex", alignItems: "center", gap: 18, padding: "16px 30px", borderRadius: 14, background: [theme.accent, theme.ink, theme.accent2][i], color: theme.paper, fontFamily: FH, fontSize: 36, textTransform: "uppercase", opacity: clamp01(e * 2), transform: `translateX(${(1 - e) * 160 + drift}px) rotate(${(1 - e) * 4 + Math.sin(t + i) * 0.8}deg)` } },
              React.createElement("span", { style: { fontFamily: FH, fontSize: 28, color: rgba(theme.paper, 0.6) } }, `0${i + 1}`), c);
          }))),
      React.createElement(Ticker, { text: (scene.ticker || "DROP YOUR SCREENS IN").toUpperCase(), t, bg: theme.ink, fg: theme.paper, y: theme.H - 300, tilt: -2, dir: 1 })
    );
  }

  function Montage({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["Home", "Pricing", "Dashboard", "Checkout"];
    const bgs = [theme.accent, theme.ink, theme.accent2, theme.ink];
    // conveyor: two rows sliding opposite directions the whole scene
    const row = (items, y, dir) => {
      const all = [...items, ...items];
      const x = -lerp(120, 1350, p) * dir + (dir < 0 ? -1250 : 0);
      return React.createElement("div", { style: { position: "absolute", top: y, left: 0, display: "flex", gap: 30, transform: `translateX(${x}px)`, willChange: "transform" } },
        all.map((label, i) =>
          React.createElement("div", { key: i, style: { width: 560, flex: "none", background: bgs[(i * 2 + (dir < 0 ? 1 : 0)) % 4], borderRadius: 26, padding: 24, transform: `rotate(${(i % 2 === 0 ? -1.6 : 1.6) + Math.sin(t * 0.8 + i) * 0.6}deg)`, boxShadow: `0 26px 56px ${rgba("#201e1d", 0.28)}` } },
            React.createElement("div", { style: { height: 300 } },
              React.createElement(MediaSlot, { src: (scene.images || [])[items.indexOf(label)], theme, radius: 16, label: `${label} \u2014 desktop` })),
            React.createElement("div", { style: { fontFamily: FH, fontSize: 34, color: theme.paper, textTransform: "uppercase", marginTop: 16, textAlign: "center" } }, label))));
    };
    return React.createElement(Frame, { progress: p, whip: "d", bg: theme.accent2, fg: theme.paper, theme },
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 280 } },
        React.createElement(Kinetic, { text: scene.title || "The whole story,|panel by panel.", p, size: 92, color: theme.paper, hiColor: theme.ink, hiWords: ["panel"], clock: t })),
      row(tiles.slice(0, 2), 660, 1),
      row(tiles.slice(2, 4), 1140, -1),
      React.createElement(Ticker, { text: "SWIPE THROUGH EVERYTHING", t, bg: theme.ink, fg: theme.paper, y: theme.H - 290, tilt: -2 })
    );
  }

  function Stats({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 3, suffix: "\u00d7", label: "longer watch time than static" },
      { to: 6, suffix: "", label: "panels tell the whole arc" },
      { to: 15, suffix: "s", label: "start to cliffhanger" },
    ];
    const cols = [theme.accent, theme.paper, theme.accent2];
    // three jump-cut beats, each stat owns the screen briefly
    const ranges = [[0, 0.37], [0.34, 0.7], [0.67, 1]];
    return React.createElement(Frame, { progress: p, whip: "l", bg: theme.ink, fg: theme.paper, theme },
      React.createElement("svg", { width: theme.W, height: theme.H, style: { position: "absolute", inset: 0 } },
        React.createElement(Starburst, { cx: theme.W * 0.5, cy: theme.H * 0.42, R: 500, color: rgba(theme.accent, 0.12), t, petals: 18, speed: 7 })),
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 300 } },
        React.createElement(Kinetic, { text: scene.title || "Numbers with|weight.", p, size: 92, color: theme.paper, hiColor: theme.accent, hiWords: ["weight"], clock: t })),
      stats.slice(0, 3).map((st, i) => {
        const b = beat(p, ranges[i][0], ranges[i][1], i % 2 === 0 ? 1 : -1, i % 2 === 0 ? -1 : 1);
        if (!b) return null;
        const cnt = ease.outCubic(seg(b.q, 0.1, 0.6));
        const v = st.to * cnt;
        const txt = Math.abs(st.to % 1) > 0 ? v.toFixed(1) : Math.round(v).toLocaleString();
        const pulse = 1 + Math.sin(t * 3) * 0.012;
        return React.createElement("div", { key: i, style: { position: "absolute", left: PADX, right: PADX, top: 760, ...b.style } },
          React.createElement("div", { style: { fontFamily: FH, fontSize: 330, lineHeight: 0.85, color: cols[i], fontVariantNumeric: "tabular-nums", transform: `scale(${pulse})`, transformOrigin: "left bottom" } }, txt,
            React.createElement("span", { style: { fontSize: 140 } }, st.suffix)),
          React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 44, color: rgba(theme.paper, 0.8), marginTop: 34, maxWidth: 820 } }, st.label),
          React.createElement("div", { style: { width: 200, height: 12, borderRadius: 999, background: cols[i], marginTop: 30, transform: `scaleX(${cnt})`, transformOrigin: "left" } }));
      }),
      React.createElement(Ticker, { text: (scene.ticker || "NUMBERS THAT MATTER").toUpperCase(), t, bg: theme.accent, fg: theme.paper, y: theme.H - 300, tilt: 2, dir: -1 })
    );
  }

  function CTA({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const pulse = 1 + Math.sin(t * 2.6) * 0.03;
    const btnE = ease.outBack(seg(p, 0.3, 0.48));
    return React.createElement(Frame, { progress: p, whip: "u", bg: theme.accent, fg: theme.paper, theme },
      React.createElement("svg", { width: theme.W, height: theme.H, style: { position: "absolute", inset: 0 } },
        React.createElement(Starburst, { cx: theme.W * 0.5, cy: theme.H * 0.3, R: 420, color: rgba(theme.paper, 0.15), t, petals: 18, speed: 9 })),
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 500 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 20, marginBottom: 46, transform: `rotate(${Math.sin(t * 0.9) * 2}deg) scale(${ease.outBack(seg(p, 0.02, 0.16))})` } },
          React.createElement("div", { style: { width: 130, height: 130, borderRadius: 24, overflow: "hidden", flex: "none", background: theme.paper, transform: "rotate(-4deg)" } },
            React.createElement(MediaSlot, { src: scene.logo, theme, radius: 24, compact: true })),
          !scene.logo && React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 20, letterSpacing: "0.1em", color: rgba(theme.paper, 0.9), maxWidth: 220 } }, "DROP LOGO HERE")),
        React.createElement(Kinetic, { text: scene.title || "Your turn.|Start the story.", p, size: 96, color: theme.paper, hiColor: theme.ink, hiWords: ["story"], clock: t }),
        React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: 16, marginTop: 56, padding: "27px 56px", borderRadius: 16, background: theme.ink, color: theme.paper, fontFamily: FH, fontSize: 46, opacity: clamp01(btnE * 2), transform: `scale(${btnE * pulse})`, boxShadow: `0 24px 60px ${rgba("#201e1d", 0.4)}` } },
          scene.cta || "Build your blocks",
          React.createElement("svg", { width: 38, height: 38, viewBox: "0 0 24 24", fill: "none", stroke: theme.paper, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M5 12h14" }), React.createElement("path", { d: "M13 6l6 6-6 6" }))),
        React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 40, color: theme.paper, marginTop: 44, opacity: seg(p, 0.45, 0.6) } }, scene.url || "storyblocks.studio")),
      React.createElement(Ticker, { text: (scene.ticker || "EVERY STORY NEEDS A LOUD COVER").toUpperCase(), t, bg: theme.paper, fg: theme.ink, y: theme.H - 300 })
    );
  }

  const SCENE_MAP = { Hook, Statement, Feature, Montage, Stats, CTA };
  const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.4 };

  function StoryBlocks() {
    const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
    const [t, setTweak] = useTweaks(defaults);
    const W = 1080, H = 1920;
    const theme = {
      W, H,
      paper: t.paper || "#f5ead8", ink: t.ink || "#201e1d", ink2: "#161413",
      accent: t.accent || "#c67139", accent2: t.accent2 || "#7a8a5e",
      brand: t.brand || "Story Blocks",
      energy: ENERGY[t.motion] ?? 1.0,
      chromeBg: "#c67139",
    };
    const scenes = {};
    for (const k in SCENE_MAP) { const C = SCENE_MAP[k]; scenes[k] = (props) => React.createElement(C, { ...props, theme }); }
    return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#141312" } },
      React.createElement(SceneStage, { width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.ink2 }, scenes),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, { label: "Block color", value: theme.accent, options: ["#c67139", "#b2622d", "#8c491a"], onChange: (v) => setTweak("accent", v) }),
        React.createElement(TweakColor, { label: "Second block", value: theme.accent2, options: ["#7a8a5e", "#56633f", "#c67139"], onChange: (v) => setTweak("accent2", v) }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) })
      )
    );
  }

  window.StoryBlocks = StoryBlocks;
})();
