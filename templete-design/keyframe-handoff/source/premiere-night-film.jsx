/* premiere-night-film.jsx — "Premiere Night" (9:16, loop). Cinema-grade reel:
   3D perspective camera, letter-flip titles, shimmer text, chasing marquee
   bulbs, sweeping spotlights, film-strip montage, odometer stats, glare
   sweeps, grain + vignette, and covered theater cuts (doors/iris/blinds).
   Organic tokens on a dark house. Exposes window.PremiereNight. */
(function () {
  const { SceneStage } = window;
  // ambient/world motion (drift, embers, petals, scroll) runs faster than wall clock
  const AMBIENT = 1.75;
  const useTimeline = () => {
    const tl = window.useTimeline();
    return Object.assign({}, tl, { time: tl.time * AMBIENT });
  };
  const { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakText, TweakRadio, TweakToggle } = window;

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
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
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
     down until the widest line fits the content column. FlipTitle sets characters with a 0.26em word space. */
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
  const W = 1080, H = 1920;

  /* ================= text effects ================= */
  // letter-by-letter 3D flip-up
  function FlipTitle({ text, p, start = 0.04, step = 0.022, size: size0, color, hiColor, hiWords = [], clock, maxW = 1080 - 128 }) {
    const size = fitSize(text, size0, maxW, FH, 0.26, 0);
    let li = 0;
    // normalize the stagger so the whole title lands by ~p=0.62 regardless of length
    const totalChars = splitLines(text).join("").length || 1;
    const effStep = Math.min(step, Math.max(0.006, (0.62 - start - 0.32) / totalChars));
    return React.createElement("div", { style: { perspective: 900 } },
      splitLines(text).map((ln, row) =>
        React.createElement("div", { key: row, style: { lineHeight: 1.04, whiteSpace: "nowrap" } },
          ln.split("").map((ch, ci) => {
            const idx = li++;
            if (ch === " ") return React.createElement("span", { key: ci, style: { display: "inline-block", width: "0.26em", fontSize: size } });
            const word = ln.slice(0, ci + 1).split(/\s+/).pop() + ln.slice(ci + 1).split(/\s+/)[0];
            const hi = hiWords.some((w) => word.toLowerCase().includes(w.toLowerCase()));
            const e = ease.outBack(clamp01((p - start - idx * effStep) / 0.32));
            const shine = 0.5 + 0.5 * Math.sin(clock * 2 + idx * 0.6);
            return React.createElement("span", {
              key: ci,
              style: {
                display: "inline-block", fontFamily: FH, fontSize: size, color: hi ? hiColor : color,
                textTransform: "uppercase", opacity: clamp01(e * 2),
                transform: `rotateX(${(1 - e) * -88}deg) translateY(${(1 - e) * 24}px)`,
                transformOrigin: "50% 92%",
                textShadow: hi ? `0 0 ${18 + shine * 26}px ${rgba(hiColor, 0.45)}` : "none",
              },
            }, ch);
          }))));
  }

  // shimmering gradient text (gold-shimmer pass driven by the clock)
  function Shimmer({ text, size, base, glow, clock, weight = FH, style }) {
    const pos = ((clock * 60) % 260);
    return React.createElement("div", {
      style: {
        fontFamily: weight, fontSize: size, textTransform: "uppercase", lineHeight: 1.02,
        background: `linear-gradient(105deg, ${base} 38%, ${glow} 50%, ${base} 62%)`,
        backgroundSize: "260% 100%", backgroundPosition: `${-pos}% 0`,
        WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", ...style,
      },
    }, text);
  }

  // odometer digit roll
  function Odometer({ value, suffix, p, color, size = 210 }) {
    const digits = String(value).split("");
    const dh = size * 0.94;
    return React.createElement("div", { style: { display: "flex", alignItems: "baseline" } },
      digits.map((d, i) => {
        if (!/\d/.test(d)) return React.createElement("span", { key: i, style: { fontFamily: FH, fontSize: size, color, lineHeight: 0.9 } }, d);
        const target = +d;
        const e = ease.outQuint(clamp01((p - 0.1 - i * 0.08) / 0.5));
        const off = (target + (1 - e) * 10 * (i + 1)) % 10;
        return React.createElement("div", { key: i, style: { height: dh, overflow: "hidden", position: "relative" } },
          React.createElement("div", { style: { transform: `translateY(${-off * dh}px)` } },
            Array.from({ length: 20 }, (_, k) => React.createElement("div", { key: k, style: { fontFamily: FH, fontSize: size, color, height: dh, lineHeight: `${dh}px`, fontVariantNumeric: "tabular-nums" } }, k % 10))));
      }),
      suffix && React.createElement("span", { style: { fontFamily: FH, fontSize: size * 0.45, color, marginLeft: 10 } }, suffix));
  }

  /* ================= world dressing ================= */
  function Spotlights({ t, theme }) {
    const cone = (cx, ang, col, op) =>
      React.createElement("polygon", { points: `${cx},-80 ${cx - 340},${H + 80} ${cx + 340},${H + 80}`, fill: col, opacity: op, transform: `rotate(${ang} ${cx} 0)` });
    return React.createElement("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: { position: "absolute", inset: 0 } },
      cone(W * 0.3, Math.sin(t * 0.5) * 16, rgba(theme.glow, 0.1), 0.9),
      cone(W * 0.72, Math.sin(t * 0.5 + 2.4) * -14, rgba(theme.accent, 0.09), 0.9),
      React.createElement("circle", { cx: W * 0.3 + Math.sin(t * 0.5) * 60, cy: H * 0.16, r: 200, fill: rgba(theme.glow, 0.05) }));
  }

  function Bulbs({ t, theme, y, count = 13 }) {
    return React.createElement("div", { style: { position: "absolute", left: 40, right: 40, top: y, display: "flex", justifyContent: "space-between", zIndex: 5 } },
      Array.from({ length: count }, (_, i) => {
        const on = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 5 - i * 0.9), 2);
        return React.createElement("div", { key: i, style: { width: 16, height: 16, borderRadius: 999, background: theme.glow, opacity: on, boxShadow: `0 0 ${10 + on * 18}px ${rgba(theme.glow, 0.8 * on)}` } });
      }));
  }

  function GrainVignette({ t, theme }) {
    return React.createElement(React.Fragment, null,
      React.createElement("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 6, background: `radial-gradient(ellipse 120% 90% at 50% 42%, transparent 55%, ${rgba("#0b0a09", 0.55)} 100%)` } }),
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 6, opacity: 0.05, transform: `translate(${(t * 97 % 7) - 3}px, ${(t * 61 % 5) - 2}px)` } },
        React.createElement("filter", { id: "grain" }, React.createElement("feTurbulence", { type: "fractalNoise", baseFrequency: "0.9", numOctaves: 2 })),
        React.createElement("rect", { width: W, height: H, filter: "url(#grain)" })));
  }

  // moving glare stripe over a card
  function Glare({ t, delay = 0 }) {
    const x = ((t * 0.35 + delay) % 1);
    return React.createElement("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", borderRadius: "inherit" } },
      React.createElement("div", { style: { position: "absolute", top: -40, bottom: -40, width: 130, left: `${-15 + x * 130}%`, transform: "rotate(14deg)", background: `linear-gradient(90deg, transparent, ${rgba("#fbf1e3", 0.35)}, transparent)` } }));
  }

  function MediaSlot({ src, label, radius = 16, theme, compact, style }) {
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

  // floating 3D card with live tilt + glare
  function Card3D({ children, t, phase = 0, style }) {
    const ry = Math.sin(t * 0.6 + phase) * 7;
    const rx = Math.cos(t * 0.45 + phase) * 4;
    return React.createElement("div", { style: { perspective: 1400 } },
      React.createElement("div", { style: { position: "relative", transform: `rotateY(${ry}deg) rotateX(${rx}deg)`, transformStyle: "preserve-3d", borderRadius: 24, boxShadow: `0 60px 120px ${rgba("#000000", 0.55)}, 0 0 80px ${rgba("#c67139", 0.12)}`, ...style } },
        children,
        React.createElement(Glare, { t, delay: phase })));
  }

  function Browser({ children, frame, dots, style }) {
    return React.createElement("div", { style: { background: frame, borderRadius: 24, padding: 10, ...style } },
      React.createElement("div", { style: { display: "flex", gap: 7, padding: "4px 8px 9px" } },
        [0.9, 0.4, 0.4].map((o, i) => React.createElement("span", { key: i, style: { width: 12, height: 12, borderRadius: 999, background: rgba(dots, o) } }))),
      React.createElement("div", { style: { borderRadius: 15, overflow: "hidden", height: "calc(100% - 34px)" } }, children));
  }

  function Chrome({ theme }) {
    return React.createElement("div", { style: { position: "absolute", top: 56, left: 64, display: "flex", alignItems: "center", gap: 15, zIndex: 8 } },
      React.createElement("div", { style: { width: 46, height: 46, borderRadius: 999, background: theme.accent, boxShadow: `0 0 26px ${rgba(theme.accent, 0.6)}`, display: "flex", alignItems: "center", justifyContent: "center" } },
        React.createElement("svg", { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: theme.ink, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("path", { d: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" }))),
      React.createElement("span", { style: { fontFamily: FH, fontSize: 32, color: theme.paper } }, theme.brand));
  }

  /* ================= covered theater cuts ================= */
  // kind: doors (two panels meet center) | iris (circle grows to cover) | blinds (bars close)
  function Cover({ kind, color, edge, r }) {
    if (r <= 0) return null;
    const e = ease.inOut(r);
    if (kind === "iris") {
      const rad = e * 120;
      return React.createElement("div", { style: { position: "absolute", inset: -4, zIndex: 9, background: color, clipPath: `circle(${rad}% at 50% 50%)`, willChange: "clip-path" } },
        React.createElement("div", { style: { position: "absolute", inset: 0, boxShadow: `inset 0 0 0 14px ${edge}`, clipPath: `circle(${rad}% at 50% 50%)` } }));
    }
    if (kind === "blinds") {
      return React.createElement("div", { style: { position: "absolute", inset: -4, zIndex: 9, display: "flex", flexDirection: "column" } },
        Array.from({ length: 5 }, (_, i) => {
          const le = ease.inOut(clamp01((r - i * 0.06) / 0.76));
          return React.createElement("div", { key: i, style: { flex: 1, background: color, transform: `scaleY(${le})`, transformOrigin: i % 2 === 0 ? "top" : "bottom", borderBottom: le > 0.9 ? `3px solid ${rgba(edge, 0.4)}` : "none", willChange: "transform" } });
        }));
    }
    // doors
    return React.createElement(React.Fragment, null,
      React.createElement("div", { style: { position: "absolute", top: -4, bottom: -4, left: -4, width: "52%", zIndex: 9, background: color, transform: `translateX(${(e - 1) * 104}%)`, willChange: "transform" } },
        React.createElement("div", { style: { position: "absolute", right: 0, top: 0, bottom: 0, width: 16, background: edge } })),
      React.createElement("div", { style: { position: "absolute", top: -4, bottom: -4, right: -4, width: "52%", zIndex: 9, background: color, transform: `translateX(${(1 - e) * 104}%)`, willChange: "transform" } },
        React.createElement("div", { style: { position: "absolute", left: 0, top: 0, bottom: 0, width: 16, background: edge } })));
  }

  function Frame({ progress: p, theme, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0, count: 6 };
    const KINDS = ["doors", "iris", "blinds", "doors", "iris", "blinds"];
    const COLORS = [theme.accent, theme.ink3, theme.accent2d, theme.ink3, theme.accent, theme.ink3];
    const EDGES = [theme.glow, theme.accent, theme.glow, theme.accent, theme.glow, theme.accent];
    const n = sc.count || 6;
    const cur = sc.index % 6, nxt = ((sc.index + 1) % n) % 6;
    const rIn = 1 - seg(p, 0, 0.13);   // own cover opens
    const rOut = seg(p, 0.87, 1);      // next cover closes
    // 3D dolly: slow push + perspective sway, never still
    const rx = Math.sin(clock * 0.4) * 1.2, ry = Math.cos(clock * 0.33) * 1.6;
    const dz = 1 + p * 0.055 * theme.energy + (1 - ease.outQuint(seg(p, 0, 0.2))) * 0.05;
    return React.createElement("div", { style: { position: "absolute", inset: 0, background: theme.ink2, overflow: "hidden", fontFamily: FB, perspective: 1600 } },
      React.createElement("div", { style: { position: "absolute", inset: 0, transform: `scale(${dz}) rotateX(${rx}deg) rotateY(${ry}deg)`, transformStyle: "preserve-3d", willChange: "transform" } },
        React.createElement(Spotlights, { t: clock, theme }),
        children),
      React.createElement(GrainVignette, { t: clock, theme }),
      React.createElement(Chrome, { theme }),
      React.createElement(Cover, { kind: KINDS[cur], color: COLORS[cur], edge: EDGES[cur], r: rIn }),
      React.createElement(Cover, { kind: KINDS[nxt], color: COLORS[nxt], edge: EDGES[nxt], r: rOut }));
  }

  const PADX = 64;
  const rise = (p, i, e = 1) => { const t = ease.outQuint(clamp01((p - 0.1 - i * 0.06) / 0.4)); return { opacity: t, transform: `translateY(${(1 - t) * 44 * e}px)` }; };

  /* ================= scenes ================= */
  function Hook({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    return React.createElement(Frame, { progress: p, theme },
      React.createElement(Bulbs, { t, theme, y: 150 }),
      React.createElement(Bulbs, { t: t + 0.45, theme, y: H - 190 }),
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 300, textAlign: "center" } },
        React.createElement("div", { style: { ...rise(p, 0, theme.energy), fontFamily: FB, fontWeight: 800, fontSize: 25, letterSpacing: "0.34em", color: theme.glow, marginBottom: 34 } }, scene.kicker || "ONE NIGHT ONLY"),
        React.createElement("div", { style: { display: "flex", justifyContent: "center" } },
          React.createElement(FlipTitle, { text: scene.title || "The premiere|your product|deserves.", p, size: 108, color: theme.paper, hiColor: theme.glow, hiWords: ["premiere"], clock: t })),
        React.createElement("div", { style: { ...rise(p, 4, theme.energy), margin: "52px auto 0", width: 880, height: 560 } },
          React.createElement(Card3D, { t, style: { width: 880, height: 560 } },
            React.createElement(Browser, { frame: theme.ink3, dots: theme.paper, style: { width: "100%", height: "100%" } },
              React.createElement(MediaSlot, { src: scene.image, theme, radius: 0, label: "Desktop screenshot \u2014 16:10" })))),
        React.createElement("div", { style: { ...rise(p, 6, theme.energy), fontFamily: FB, fontWeight: 500, fontSize: 36, color: rgba(theme.paper, 0.62), marginTop: 44 } }, scene.sub || "Roll out the terracotta carpet.")));
  }

  function Statement({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    return React.createElement(Frame, { progress: p, theme },
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 640 } },
        React.createElement("div", { style: { ...rise(p, 0), width: 96, height: 10, borderRadius: 999, background: theme.accent, boxShadow: `0 0 24px ${rgba(theme.accent, 0.7)}`, marginBottom: 48 } }),
        React.createElement(FlipTitle, { text: scene.title || "Most launches|whisper.", p, size: 104, color: theme.paper, hiColor: theme.accent, hiWords: ["whisper"], clock: t, step: 0.04 }),
        React.createElement("div", { style: { marginTop: 26 } },
          React.createElement(Shimmer, { text: scene.mark || "Yours roars.", size: 135, base: theme.glow, glow: "#fbf1e3", clock: t })),
        React.createElement("div", { style: { ...rise(p, 8), fontFamily: FB, fontWeight: 500, fontSize: 37, color: rgba(theme.paper, 0.65), marginTop: 46, maxWidth: 780 } }, scene.sub || "Ten seconds of spotlight beats ten pages of specs.")));
  }

  function Feature({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const chips = (scene.chips && scene.chips.length) ? scene.chips : ["Spotlight your screens", "Graded like film", "Loops all night"];
    return React.createElement(Frame, { progress: p, theme },
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 270 } },
        React.createElement(FlipTitle, { text: scene.title || "Tonight's|main feature.", p, size: 96, color: theme.paper, hiColor: theme.glow, hiWords: ["feature"], clock: t }),
        React.createElement("div", { style: { margin: "50px 0 46px", ...rise(p, 3, theme.energy) } },
          React.createElement(Card3D, { t, phase: 1.4, style: { width: 944, height: 600 } },
            React.createElement(Browser, { frame: theme.accent, dots: theme.paper, style: { width: "100%", height: "100%" } },
              React.createElement(MediaSlot, { src: scene.image, theme, radius: 0, label: "Desktop screenshot \u2014 16:10" })))),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 18, alignItems: "flex-start" } },
          chips.slice(0, 3).map((c, i) => {
            const e = ease.outBack(clamp01((p - 0.4 - i * 0.09) / 0.32));
            return React.createElement("div", { key: i, style: { display: "inline-flex", alignItems: "center", gap: 16, padding: "15px 30px", borderRadius: 999, background: rgba(theme.paper, 0.06), border: `2px solid ${rgba(theme.glow, 0.5)}`, boxShadow: `0 0 26px ${rgba(theme.accent, 0.15)}`, fontFamily: FB, fontWeight: 700, fontSize: 30, color: theme.paper, opacity: clamp01(e * 2), transform: `translateX(${(1 - e) * 120}px)` } },
              React.createElement("span", { style: { width: 12, height: 12, borderRadius: 999, background: theme.glow, boxShadow: `0 0 12px ${theme.glow}` } }), c);
          }))));
  }

  function Montage({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["Opening shot", "The build", "The reveal", "Standing ovation"];
    // film strip: frames + sprocket holes, scrolling continuously
    const strip = (items, x, dir, w = 470) => {
      const all = [...items, ...items, ...items];
      const frameH = 360, gap = 26, unit = frameH + gap;
      const y = -((p * 2.2 + t * 0.06) % 1) * unit * items.length * dir - (dir < 0 ? unit * items.length : 0);
      return React.createElement("div", { style: { position: "absolute", left: x, top: 560, bottom: 0, width: w, overflow: "hidden" } },
        React.createElement("div", { style: { position: "absolute", left: 0, right: 0, transform: `translateY(${y}px)`, willChange: "transform" } },
          all.map((label, i) =>
            React.createElement("div", { key: i, style: { height: frameH, marginBottom: gap, background: theme.ink3, borderRadius: 18, padding: "16px 34px", position: "relative" } },
              [0, 1].map((side) =>
                React.createElement("div", { key: side, style: { position: "absolute", top: 12, bottom: 12, [side ? "right" : "left"]: 8, width: 14, display: "flex", flexDirection: "column", justifyContent: "space-between" } },
                  Array.from({ length: 6 }, (_, k) => React.createElement("div", { key: k, style: { width: 14, height: 20, borderRadius: 4, background: theme.ink2 } })))),
              React.createElement("div", { style: { height: 260, borderRadius: 10, overflow: "hidden", margin: "0 18px" } },
                React.createElement(MediaSlot, { src: (scene.images || [])[items.indexOf(label)], theme, radius: 0, label })),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 22, color: rgba(theme.paper, 0.75), textAlign: "center", marginTop: 12, textTransform: "uppercase", letterSpacing: "0.1em" } }, label)))));
    };
    return React.createElement(Frame, { progress: p, theme },
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 290, zIndex: 2 } },
        React.createElement(FlipTitle, { text: scene.title || "Scene by|scene.", p, size: 104, color: theme.paper, hiColor: theme.glow, hiWords: ["scene."], clock: t })),
      strip(tiles.slice(0, 2), PADX - 10, 1),
      strip(tiles.slice(2, 4), W / 2 + 30, -1));
  }

  function Stats({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 98, suffix: "%", label: "stayed for the credits" },
      { to: 24, suffix: "fps", label: "of pure hand-tuned motion" },
      { to: 5, suffix: "\u2605", label: "reviews from the front row" },
    ];
    const cols = [theme.glow, theme.paper, theme.accent2l];
    return React.createElement(Frame, { progress: p, theme },
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 340 } },
        React.createElement(FlipTitle, { text: scene.title || "The box office|report.", p, size: 96, color: theme.paper, hiColor: theme.accent, hiWords: ["report."], clock: t }),
        React.createElement("div", { style: { marginTop: 70, display: "flex", flexDirection: "column", gap: 60 } },
          stats.slice(0, 3).map((st, i) =>
            React.createElement("div", { key: i, style: { ...rise(p, i * 2 + 3, theme.energy), display: "flex", alignItems: "center", gap: 40, borderBottom: `2px solid ${rgba(theme.glow, 0.22)}`, paddingBottom: 34 } },
              React.createElement(Odometer, { value: st.to, suffix: st.suffix, p: clamp01(p - i * 0.06), color: cols[i], size: 168 }),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 37, color: rgba(theme.paper, 0.72), maxWidth: 480 } }, st.label))))));
  }

  function CTA({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const pulse = 1 + Math.sin(t * 2.4) * 0.03;
    const btnE = ease.outBack(seg(p, 0.28, 0.46));
    return React.createElement(Frame, { progress: p, theme },
      React.createElement(Bulbs, { t, theme, y: 150 }),
      React.createElement(Bulbs, { t: t + 0.45, theme, y: H - 190 }),
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 520, textAlign: "center" } },
        React.createElement("div", { style: { ...rise(p, 0, theme.energy), display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 48 } },
          React.createElement("div", { style: { width: 140, height: 140, borderRadius: 999, overflow: "hidden", flex: "none", boxShadow: `0 0 50px ${rgba(theme.accent, 0.4)}` } },
            React.createElement(MediaSlot, { src: scene.logo, theme, radius: 999, compact: true })),
          !scene.logo && React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 20, letterSpacing: "0.1em", color: rgba(theme.paper, 0.6), textAlign: "left", maxWidth: 220 } }, "DROP LOGO HERE")),
        React.createElement("div", { style: { display: "flex", justifyContent: "center" } },
          React.createElement(FlipTitle, { text: scene.title || "Take your|seat.", p, size: 140, color: theme.paper, hiColor: theme.glow, hiWords: ["seat."], clock: t })),
        React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: 16, marginTop: 56, padding: "27px 56px", borderRadius: 999, background: theme.accent, color: theme.ink, fontFamily: FH, fontSize: 46, opacity: clamp01(btnE * 2), transform: `scale(${btnE * pulse})`, boxShadow: `0 0 ${50 + Math.sin(t * 2.4) * 22}px ${rgba(theme.accent, 0.55)}` } },
          scene.cta || "Book the premiere",
          React.createElement("svg", { width: 38, height: 38, viewBox: "0 0 24 24", fill: "none", stroke: theme.ink, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M5 12h14" }), React.createElement("path", { d: "M13 6l6 6-6 6" }))),
        React.createElement("div", { style: { marginTop: 46, display: "flex", justifyContent: "center" } },
          React.createElement(Shimmer, { text: scene.url || "premierenight.studio", size: 40, base: theme.glow, glow: "#fbf1e3", clock: t, weight: FB, style: { fontWeight: 800, letterSpacing: "0.06em", textTransform: "none" } }))));
  }

  const SCENE_MAP = { Hook, Statement, Feature, Montage, Stats, CTA };
  const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.4 };

  function PremiereNight() {
    const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
    const [t, setTweak] = useTweaks(defaults);
    const theme = {
      W, H,
      paper: t.paper || "#f5ead8", ink: t.ink || "#201e1d", ink2: "#171514", ink3: "#26221f",
      accent: t.accent || "#c67139", accent2: t.accent2 || "#7a8a5e",
      accent2l: "#9aa87c", accent2d: "#40492e", glow: "#e8a066",
      brand: t.brand || "Premiere Night",
      energy: ENERGY[t.motion] ?? 1.0,
    };
    const scenes = {};
    for (const k in SCENE_MAP) { const C = SCENE_MAP[k]; scenes[k] = (props) => React.createElement(C, { ...props, theme }); }
    return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0c0b" } },
      React.createElement(SceneStage, { width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.ink2 }, scenes),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, { label: "Marquee accent", value: theme.accent, options: ["#c67139", "#b2622d", "#e8a066"], onChange: (v) => setTweak("accent", v) }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) })
      )
    );
  }

  window.PremiereNight = PremiereNight;
})();
