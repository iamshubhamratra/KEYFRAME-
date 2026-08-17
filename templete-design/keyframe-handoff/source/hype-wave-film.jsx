/* hype-wave-film.jsx — "Hype Wave" (9:16, loop). Electric pop reel:
   blue/yellow/coral/navy palette, Archivo Black mega type, sticker chips
   with hard offset shadows, scrolling checkerboards, wavy ribbons, spinning
   star stickers, zigzag / checker / iris covered cuts, odometer stats,
   conveyor montage. Exposes window.HypeWave. */
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
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  };
  function hexToRgb(h) {
    h = (h || "#000").replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const splitLines = (t) => String(t == null ? "" : t).split("|");

  const FD = '"Archivo Black", "Arial Black", sans-serif';

  /* Display type is set at a fixed px size on a fixed-width stage, so a long word
     runs straight past the frame edge. Measure each line and scale the whole title
     down until the widest line fits the content column. Slam sets words at -0.02em with a 0.22em gap. */
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

  const FB = '"Space Grotesk", system-ui, sans-serif';
  const W = 1080, H = 1920;

  /* ---------- mega slam type: words slam in, alternating fill/outline ---------- */
  function Slam({ text, p, size: size0, fill, alt, clock, start = 0.05, style, maxW = 1080 - 124 }) {
    const size = fitSize(text, size0, maxW, FD, 0.22, -0.02);
    const lines = splitLines(text);
    const total = lines.join(" ").split(/\s+/).length || 1;
    const step = Math.min(0.07, (0.55 - start - 0.3) / total);
    let w = 0;
    return React.createElement("div", { style },
      lines.map((ln, li) =>
        React.createElement("div", { key: li, style: { lineHeight: 0.98, whiteSpace: "nowrap" } },
          ln.trim().split(/\s+/).map((word, wi) => {
            const idx = w++;
            const e = ease.outBack(clamp01((p - start - idx * step) / 0.3));
            const outlined = idx % 3 === 2;
            const jig = Math.sin(clock * 1.8 + idx * 1.7) * 1.1;
            return React.createElement("span", {
              key: wi,
              style: {
                display: "inline-block", fontFamily: FD, fontSize: size, textTransform: "uppercase",
                letterSpacing: "-0.02em", marginRight: "0.22em",
                color: outlined ? "transparent" : (idx % 3 === 1 ? alt : fill),
                WebkitTextStroke: outlined ? `3px ${fill}` : "0",
                opacity: clamp01(e * 2),
                transform: `translateY(${(1 - e) * 80}px) rotate(${(1 - e) * 6 + jig}deg) scale(${lerp(1.6, 1, clamp01(e))})`,
              },
            }, word);
          }))));
  }

  /* ---------- world dressing ---------- */
  function Checker({ y, h = 64, t, c1, c2, dir = 1, tilt = -2 }) {
    const cell = 64;
    const shift = ((t * 90 * dir) % (cell * 2) + cell * 2) % (cell * 2);
    return React.createElement("div", { style: { position: "absolute", left: -140, right: -140, top: y, height: h, transform: `rotate(${tilt}deg)`, overflow: "hidden", zIndex: 3 } },
      React.createElement("div", { style: { position: "absolute", inset: 0, transform: `translateX(${-shift}px)`, background: `repeating-conic-gradient(${c1} 0% 25%, ${c2} 25% 50%) 0 0 / ${cell * 2}px ${cell * 2}px` } }));
  }

  function Ribbon({ t, color, y, amp = 46, thick = 26, speed = 1 }) {
    let d = `M-40,${y}`;
    for (let x = 0; x <= W + 80; x += 40) d += ` L${x},${y + Math.sin(x / 130 + t * speed) * amp}`;
    return React.createElement("path", { d, fill: "none", stroke: color, strokeWidth: thick, strokeLinecap: "round" });
  }

  function Star({ cx, cy, R, color, t, speed = 40, border }) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? R : R * 0.46;
      pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
    }
    return React.createElement("g", { transform: `rotate(${t * speed} ${cx} ${cy})` },
      React.createElement("polygon", { points: pts.join(" "), fill: color, stroke: border || "none", strokeWidth: border ? 6 : 0 }));
  }

  function MediaSlot({ src, label, radius = 14, theme, compact, style }) {
    const base = { width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", ...style };
    if (src) return React.createElement("img", { src, style: { ...base, objectFit: "cover", display: "block" } });
    if (compact) {
      return React.createElement("div", { style: { ...base, display: "flex", alignItems: "center", justifyContent: "center", background: theme.cream, border: `4px dashed ${rgba(theme.navy, 0.4)}` } },
        React.createElement("svg", { width: 36, height: 36, viewBox: "0 0 24 24", fill: "none", stroke: rgba(theme.navy, 0.6), strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
          React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
          React.createElement("path", { d: "M21 16l-5-5L5 19" })));
    }
    return React.createElement("div", { style: { ...base, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: theme.cream, border: `4px dashed ${rgba(theme.navy, 0.4)}`, textAlign: "center", padding: 20 } },
      React.createElement("div", { style: { width: 52, height: 52, borderRadius: 12, background: theme.yellow, border: `3px solid ${theme.navy}`, display: "flex", alignItems: "center", justifyContent: "center" } },
        React.createElement("svg", { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: theme.navy, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
          React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
          React.createElement("path", { d: "M21 16l-5-5L5 19" }))),
      React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 17, letterSpacing: "0.12em", color: rgba(theme.navy, 0.75) } }, "DROP IMAGE TO REPLACE"),
      label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 500, fontSize: 14, color: rgba(theme.navy, 0.5) } }, label));
  }

  // hard-shadow sticker card (brutalist pop)
  function Sticker({ children, bg, shadow, border, rot = 0, t, phase = 0, style }) {
    const bob = Math.sin((t || 0) * 1.1 + phase) * 4;
    return React.createElement("div", { style: { position: "relative", background: bg, border: `4px solid ${border}`, borderRadius: 18, boxShadow: `10px 10px 0 ${shadow}`, transform: `rotate(${rot + Math.sin((t || 0) * 0.9 + phase) * 1.2}deg) translateY(${bob}px)`, ...style } }, children);
  }

  function Odometer({ value, suffix, p, color, size = 190, stroke }) {
    const digits = String(value).split("");
    const dh = size * 0.95;
    return React.createElement("div", { style: { display: "flex", alignItems: "baseline" } },
      digits.map((d, i) => {
        if (!/\d/.test(d)) return React.createElement("span", { key: i, style: { fontFamily: FD, fontSize: size, color, lineHeight: 0.9 } }, d);
        const target = +d;
        const e = ease.outQuint(clamp01((p - 0.08 - i * 0.07) / 0.5));
        const off = (target + (1 - e) * 10 * (i + 1)) % 10;
        return React.createElement("div", { key: i, style: { height: dh, overflow: "hidden" } },
          React.createElement("div", { style: { transform: `translateY(${-off * dh}px)` } },
            Array.from({ length: 20 }, (_, k) => React.createElement("div", { key: k, style: { fontFamily: FD, fontSize: size, color, height: dh, lineHeight: `${dh}px`, WebkitTextStroke: stroke ? `3px ${stroke}` : "0" } }, k % 10))));
      }),
      suffix && React.createElement("span", { style: { fontFamily: FD, fontSize: size * 0.42, color, marginLeft: 12 } }, suffix));
  }

  function Chrome({ theme, fg, bg }) {
    const t = useTimeline().time;
    return React.createElement("div", { style: { position: "absolute", top: 54, left: 62, zIndex: 8 } },
      React.createElement(Sticker, { bg, border: fg, shadow: rgba(fg, 0.9), rot: -3, t, style: { display: "inline-flex", alignItems: "center", gap: 12, padding: "10px 22px" } },
        React.createElement("svg", { width: 26, height: 26, viewBox: "0 0 24 24", fill: fg, stroke: fg, strokeWidth: 1.5, strokeLinejoin: "round" },
          React.createElement("path", { d: "M12 2l2.9 6.9L22 9.2l-5 5.2 1.2 7.6L12 18.6 5.8 22l1.2-7.6-5-5.2 7.1-.3Z" })),
        React.createElement("span", { style: { fontFamily: FD, fontSize: 26, color: fg, textTransform: "uppercase", letterSpacing: "0.02em" } }, theme.brand)));
  }

  function Frame({ progress: p, theme, bg, fg, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0, count: 6 };
    const n = sc.count || 6;
    const cur = sc.index % 6;
    // no opaque wipes — the cut IS the motion: content pushes/zooms through the boundary
    const CAM = ["pushLeft", "zoomIn", "pushUp", "pushRight", "zoomOut", "pushDown"];
    const kind = CAM[cur];
    const ein = ease.outQuint(seg(p, 0, 0.18));
    const eout = ease.inCubic(seg(p, 0.84, 1));
    let cx = 0, cy = 0, cs = 1, cr = 0;
    const A = 1 - ein, B = eout;
    if (kind === "pushLeft") { cx = A * 170 - B * 130; cr = A * 2 - B * 1.5; }
    else if (kind === "pushRight") { cx = -A * 170 + B * 130; cr = -A * 2 + B * 1.5; }
    else if (kind === "pushUp") { cy = A * 210 - B * 160; }
    else if (kind === "pushDown") { cy = -A * 210 + B * 160; }
    else if (kind === "zoomIn") { cs = lerp(1.12, 1, ein) * lerp(1, 0.95, eout); cr = A * -2 + B * 1.5; }
    else { cs = lerp(0.94, 1, ein) * lerp(1, 1.06, eout); cr = A * 2 - B * 1.5; }
    const fade = clamp01(seg(p, 0, 0.035)) * (1 - eout * 0.25);
    const dz = (1 + p * 0.05 * theme.energy) * cs;
    const dx = Math.sin(clock * 0.35) * 7 + cx, dy = Math.cos(clock * 0.45) * 6 + cy;
    return React.createElement("div", { style: { position: "absolute", inset: 0, background: bg, overflow: "hidden", fontFamily: FB } },
      React.createElement("div", { style: { position: "absolute", inset: 0, opacity: fade, transform: `translate(${dx}px, ${dy}px) rotate(${cr}deg) scale(${dz})`, willChange: "transform" } }, children),
      React.createElement(Chrome, { theme, fg, bg }));
  }

  const PADX = 62;
  const rise = (p, i, e = 1) => { const t = ease.outQuint(clamp01((p - 0.1 - i * 0.06) / 0.4)); return { opacity: t, transform: `translateY(${(1 - t) * 46 * e}px)` }; };

  /* ---------- scenes ---------- */
  function Hook({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    return React.createElement(Frame, { progress: p, theme, bg: theme.blue, fg: theme.cream },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement(Star, { cx: W * 0.86, cy: 300, R: 130, color: theme.yellow, border: theme.navy, t, speed: 30 }),
        React.createElement(Star, { cx: 90, cy: H * 0.56, R: 80, color: theme.coral, border: theme.navy, t, speed: -44 }),
        React.createElement(Ribbon, { t, color: rgba(theme.cream, 0.25), y: H * 0.28, amp: 40, thick: 20, speed: 1.2 })),
      React.createElement(Checker, { y: 210, t, c1: theme.navy, c2: theme.yellow, tilt: -3 }),
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 400 } },
        React.createElement("div", { style: { ...rise(p, 0, theme.energy), marginBottom: 36 } },
          React.createElement(Sticker, { bg: theme.yellow, border: theme.navy, shadow: theme.navy, rot: -2, t, style: { display: "inline-block", padding: "12px 26px", fontFamily: FB, fontWeight: 700, fontSize: 26, letterSpacing: "0.16em", color: theme.navy } }, scene.kicker || "TURN IT UP")),
        React.createElement(Slam, { text: scene.title || "Make some|actual|noise.", p, size: 148, fill: theme.cream, alt: theme.yellow, clock: t }),
        React.createElement("div", { style: { margin: "48px 0 0", ...rise(p, 4, theme.energy) } },
          React.createElement(Sticker, { bg: theme.cream, border: theme.navy, shadow: theme.navy, rot: 1.5, t, phase: 2, style: { width: 900, height: 560, padding: 14 } },
            React.createElement(MediaSlot, { src: scene.image, theme, label: "Desktop screenshot \u2014 16:10" }))),
        React.createElement("div", { style: { ...rise(p, 6, theme.energy), fontFamily: FB, fontWeight: 500, fontSize: 36, color: rgba(theme.cream, 0.85), marginTop: 42 } }, scene.sub || "Ten loud seconds. Zero boring frames.")));
  }

  function Statement({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    return React.createElement(Frame, { progress: p, theme, bg: theme.navy, fg: theme.yellow },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement(Ribbon, { t, color: rgba(theme.blue, 0.55), y: H * 0.2, amp: 56, thick: 30, speed: 0.9 }),
        React.createElement(Ribbon, { t: t + 2, color: rgba(theme.coral, 0.5), y: H * 0.82, amp: 50, thick: 26, speed: -1.1 }),
        React.createElement(Star, { cx: W * 0.82, cy: H * 0.68, R: 110, color: theme.yellow, border: theme.cream, t, speed: 26 })),
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 600 } },
        React.createElement(Slam, { text: scene.title || "Beige is|a choice.|Refuse it.", p, size: 158, fill: theme.cream, alt: theme.coral, clock: t }),
        React.createElement("div", { style: { ...rise(p, 6), fontFamily: FB, fontWeight: 500, fontSize: 37, color: rgba(theme.cream, 0.7), marginTop: 44, maxWidth: 800 } }, scene.sub || "Feeds reward the brave. Bring colour or bring nothing.")),
      React.createElement(Checker, { y: H - 330, t, c1: theme.yellow, c2: theme.navy, dir: -1, tilt: 2.5 }));
  }

  function Feature({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const chips = (scene.chips && scene.chips.length) ? scene.chips : ["Drop screenshots in", "Recolour in one tap", "Loops forever"];
    const stickers = [theme.coral, theme.blue, theme.navy];
    return React.createElement(Frame, { progress: p, theme, bg: theme.yellow, fg: theme.navy },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement(Star, { cx: W - 90, cy: H * 0.66, R: 120, color: theme.blue, border: theme.navy, t, speed: -22 }),
        React.createElement(Ribbon, { t, color: rgba(theme.coral, 0.5), y: H * 0.14, amp: 36, thick: 22, speed: 1.3 })),
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 280 } },
        React.createElement(Slam, { text: scene.title || "Your product,|front row.", p, size: 104, fill: theme.navy, alt: theme.coral, clock: t }),
        React.createElement("div", { style: { margin: "50px 0 46px", ...rise(p, 3, theme.energy) } },
          React.createElement(Sticker, { bg: theme.cream, border: theme.navy, shadow: theme.navy, rot: -1.5, t, phase: 1, style: { width: 944, height: 600, padding: 14 } },
            React.createElement(MediaSlot, { src: scene.image, theme, label: "Desktop screenshot \u2014 16:10" }))),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 22, alignItems: "flex-start" } },
          chips.slice(0, 3).map((c, i) => {
            const e = ease.outBack(clamp01((p - 0.4 - i * 0.09) / 0.32));
            return React.createElement("div", { key: i, style: { opacity: clamp01(e * 2), transform: `translateX(${(1 - e) * 140}px)` } },
              React.createElement(Sticker, { bg: stickers[i], border: theme.navy, shadow: theme.navy, rot: i % 2 === 0 ? -1.5 : 1.5, t, phase: i * 2, style: { display: "inline-flex", alignItems: "center", gap: 14, padding: "14px 28px", fontFamily: FD, fontSize: 32, color: i === 2 ? theme.yellow : theme.cream, textTransform: "uppercase" } },
                `0${i + 1}`, " ", c));
          }))));
  }

  function Montage({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["Home", "Pricing", "Dashboard", "Checkout"];
    const bgs = [theme.blue, theme.coral, theme.navy, theme.yellow];
    const strip = (items, y, dir) => {
      const all = [...items, ...items, ...items];
      const cardW = 600, gap = 30, unit = cardW + gap;
      const x = -((p * 1.6 + t * 0.045) % 1) * unit * items.length * dir - (dir < 0 ? unit * items.length : 0);
      return React.createElement("div", { style: { position: "absolute", left: 0, right: 0, top: y, height: 470, overflow: "hidden" } },
        React.createElement("div", { style: { position: "absolute", display: "flex", gap, transform: `translateX(${x}px)`, willChange: "transform" } },
          all.map((label, i) =>
            React.createElement("div", { key: i, style: { width: cardW, flex: "none" } },
              React.createElement(Sticker, { bg: bgs[i % 4], border: theme.navy, shadow: theme.navy, rot: i % 2 === 0 ? -1.6 : 1.6, t, phase: i, style: { padding: 14 } },
                React.createElement("div", { style: { height: 330 } },
                  React.createElement(MediaSlot, { src: (scene.images || [])[items.indexOf(label)], theme, label: `${label} \u2014 desktop` })),
                React.createElement("div", { style: { fontFamily: FD, fontSize: 30, color: i % 4 === 3 ? theme.navy : theme.cream, textTransform: "uppercase", textAlign: "center", padding: "14px 0 4px" } }, label))))));
    };
    return React.createElement(Frame, { progress: p, theme, bg: theme.cream, fg: theme.navy },
      React.createElement(Checker, { y: 190, t, c1: theme.blue, c2: theme.cream, tilt: -2.5 }),
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 330 } },
        React.createElement(Slam, { text: scene.title || "Every page|slaps.", p, size: 124, fill: theme.navy, alt: theme.blue, clock: t })),
      strip(tiles.slice(0, 2), 700, 1),
      strip(tiles.slice(2, 4), 1230, -1));
  }

  function Stats({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 5, suffix: "\u00d7", label: "more shares than static posts" },
      { to: 12, suffix: "s", label: "average watch \u2014 the whole loop" },
      { to: 1, suffix: " tap", label: "to make it yours" },
    ];
    const cols = [theme.yellow, theme.cream, theme.blue];
    return React.createElement(Frame, { progress: p, theme, bg: theme.coral, fg: theme.cream },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement(Star, { cx: W * 0.85, cy: 340, R: 100, color: theme.yellow, border: theme.navy, t, speed: 36 }),
        React.createElement(Ribbon, { t, color: rgba(theme.navy, 0.35), y: H * 0.86, amp: 44, thick: 24, speed: 1 })),
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 340 } },
        React.createElement(Slam, { text: scene.title || "Numbers|that pop.", p, size: 124, fill: theme.cream, alt: theme.navy, clock: t }),
        React.createElement("div", { style: { marginTop: 66, display: "flex", flexDirection: "column", gap: 52 } },
          stats.slice(0, 3).map((st, i) =>
            React.createElement("div", { key: i, style: { ...rise(p, i * 2 + 3, theme.energy), display: "flex", alignItems: "center", gap: 38 } },
              React.createElement(Odometer, { value: st.to, suffix: st.suffix, p: clamp01(p - i * 0.06), color: cols[i], size: 172 }),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 37, color: rgba(theme.cream, 0.92), maxWidth: 520 } }, st.label))))));
  }

  function CTA({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const pulse = 1 + Math.sin(t * 2.6) * 0.03;
    const btnE = ease.outBack(seg(p, 0.3, 0.48));
    return React.createElement(Frame, { progress: p, theme, bg: theme.blue, fg: theme.cream },
      React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } },
        React.createElement(Star, { cx: W * 0.5, cy: H * 0.24, R: 200, color: rgba(theme.cream, 0.14), t, speed: 14 }),
        React.createElement(Star, { cx: W * 0.16, cy: H * 0.74, R: 90, color: theme.yellow, border: theme.navy, t, speed: -30 }),
        React.createElement(Ribbon, { t, color: rgba(theme.cream, 0.25), y: H * 0.12, amp: 34, thick: 18, speed: 1.4 })),
      React.createElement(Checker, { y: H - 300, t, c1: theme.yellow, c2: theme.blue, dir: -1, tilt: 2 }),
      React.createElement("div", { style: { position: "absolute", left: PADX, right: PADX, top: 540, textAlign: "center" } },
        React.createElement("div", { style: { ...rise(p, 0, theme.energy), display: "flex", alignItems: "center", justifyContent: "center", gap: 22, marginBottom: 46 } },
          React.createElement(Sticker, { bg: theme.cream, border: theme.navy, shadow: theme.navy, rot: -4, t, style: { width: 140, height: 140, padding: 10 } },
            React.createElement(MediaSlot, { src: scene.logo, theme, radius: 10, compact: true })),
          !scene.logo && React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 21, letterSpacing: "0.1em", color: rgba(theme.cream, 0.9), textAlign: "left", maxWidth: 220 } }, "DROP LOGO HERE")),
        React.createElement("div", { style: { display: "flex", justifyContent: "center" } },
          React.createElement(Slam, { text: scene.title || "Go be|loud.", p, size: 170, fill: theme.cream, alt: theme.yellow, clock: t })),
        React.createElement("div", { style: { display: "inline-block", marginTop: 56, opacity: clamp01(btnE * 2), transform: `scale(${btnE * pulse})` } },
          React.createElement(Sticker, { bg: theme.yellow, border: theme.navy, shadow: theme.navy, rot: -1.5, t, style: { display: "inline-flex", alignItems: "center", gap: 16, padding: "24px 52px", fontFamily: FD, fontSize: 44, color: theme.navy, textTransform: "uppercase" } },
            scene.cta || "Make yours",
            React.createElement("svg", { width: 40, height: 40, viewBox: "0 0 24 24", fill: "none", stroke: theme.navy, strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M5 12h14" }), React.createElement("path", { d: "M13 6l6 6-6 6" })))),
        React.createElement("div", { style: { ...rise(p, 5), fontFamily: FB, fontWeight: 700, fontSize: 40, color: theme.yellow, marginTop: 46 } }, scene.url || "hypewave.studio")));
  }

  const SCENE_MAP = { Hook, Statement, Feature, Montage, Stats, CTA };
  const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.4 };

  function HypeWave() {
    const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
    const [t, setTweak] = useTweaks(defaults);
    const theme = {
      W, H,
      blue: t.blue || "#2b5bff", yellow: t.yellow || "#ffd234", coral: t.coral || "#ff5a48",
      cream: "#fdf8ec", navy: "#101433",
      brand: t.brand || "Hype Wave",
      energy: ENERGY[t.motion] ?? 1.0,
    };
    const scenes = {};
    for (const k in SCENE_MAP) { const C = SCENE_MAP[k]; scenes[k] = (props) => React.createElement(C, { ...props, theme }); }
    return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0c0f26" } },
      React.createElement(SceneStage, { width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.blue }, scenes),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, { label: "Electric blue", value: theme.blue, options: ["#2b5bff", "#1d3fd8", "#7a3bff", "#0aa5ff"], onChange: (v) => setTweak("blue", v) }),
        React.createElement(TweakColor, { label: "Pop yellow", value: theme.yellow, options: ["#ffd234", "#ffb800", "#c8f051"], onChange: (v) => setTweak("yellow", v) }),
        React.createElement(TweakColor, { label: "Hot coral", value: theme.coral, options: ["#ff5a48", "#ff3d7f", "#ff7a1a"], onChange: (v) => setTweak("coral", v) }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) })
      )
    );
  }

  window.HypeWave = HypeWave;
})();
