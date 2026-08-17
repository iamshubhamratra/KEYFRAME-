/* film-kit.js — shared engine for the themed video templates. Each template file
   calls FilmKit.make(cfg) with its own palette, fonts, camera set, motion presets,
   an SVG World, and per-beat layout descriptors; the kit supplies the generic
   scene machinery (Hook/Statement/Feature/Montage/Stats/CTA), the seek-safe
   camera, media slots, chrome and the tweaks panel. Visual identity lives
   entirely in the cfg, so no two templates share a look. */
window.FilmKit = (function () {
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
    outBack: (t) => { const c = 2.0; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  };
  function hexToRgb(h) { h = (h || "#000").replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const splitLines = (t) => String(t == null ? "" : t).split("|");

  /* entrance presets — each template picks one for titles and one for items */
  const PRESETS = {
    slam: (p, i) => { const t = ease.outExpo(clamp01((p - i * 0.055) / 0.28)); return { opacity: clamp01(t * 2), transform: `scale(${lerp(2.2, 1, t)}) rotate(${(1 - t) * -4}deg)` }; },
    bounce: (p, i) => { const t = ease.outBack(clamp01((p - i * 0.06) / 0.34)); return { opacity: clamp01(t * 2), transform: `translateY(${(1 - t) * 110}px) scale(${lerp(0.7, 1, clamp01(t))})` }; },
    rise: (p, i) => { const t = ease.outQuint(clamp01((p - i * 0.055) / 0.38)); return { opacity: t, transform: `translateY(${(1 - t) * 46}px)` }; },
    streak: (p, i) => { const t = ease.outExpo(clamp01((p - i * 0.05) / 0.3)); return { opacity: t, transform: `translateX(${(1 - t) * 150}px) skewX(${(1 - t) * -12}deg)` }; },
    stamp: (p, i) => { const t = ease.outBack(clamp01((p - i * 0.06) / 0.32)); return { opacity: clamp01(t * 2), transform: `scale(${lerp(1.7, 1, clamp01(t))}) rotate(${(1 - t) * 6}deg)` }; },
    drowse: (p, i) => { const t = ease.outQuint(clamp01((p - i * 0.07) / 0.46)); return { opacity: t, transform: `translateY(${(1 - t) * 34}px)` }; },
    machete: (p, i) => { const t = ease.outQuint(clamp01((p - i * 0.055) / 0.36)); return { opacity: t, transform: `translateX(${(1 - t) * -90}px) skewX(${(1 - t) * -6}deg)` }; },
    flip: (p, i) => { const t = ease.outQuint(clamp01((p - i * 0.06) / 0.4)); return { opacity: t, transform: `translateY(${(1 - t) * 30}px) scaleY(${lerp(0.2, 1, t)})`, transformOrigin: "bottom left" }; },
    pop: (p, i) => { const t = ease.outBack(clamp01((p - i * 0.06) / 0.4)); return { opacity: clamp01(t * 1.6), transform: `scale(${lerp(0.6, 1, t)})` }; },
  };

  /* camera library; mag scales the character of the moves per template */
  function makeCam(mag) {
    const m = Object.assign({ x: 1, y: 1, rot: 1, skew: 0, zin: 0.5, zout: 0.4, driftX: 8, driftY: 7, driftZ: 0.055, slide: 0.27, inn: 0.23, out: 0.81 }, mag || {});
    return function (kind, p, energy, clock, W, H) {
      const inn = ease.outQuint(seg(p, 0, m.inn));
      const out = ease.inCubic(seg(p, m.out, 1));
      const dIn = 1 - inn, k = Math.min(energy, 1.15);
      let fx = 0, fy = 0, fr = 0, fs = 1, fo = 1, sk = 0;
      switch (kind) {
        case "pushL": fx = W * dIn * k * m.x; fx -= W * m.slide * out; fr = 3 * dIn * m.rot; sk = -m.skew * dIn; break;
        case "pushR": fx = -W * dIn * k * m.x; fx += W * m.slide * out; fr = -3 * dIn * m.rot; sk = m.skew * dIn; break;
        case "pushU": fy = H * dIn * k * m.y; fy -= H * (m.slide * 0.8) * out; break;
        case "pushD": fy = -H * dIn * k * m.y; fy += H * (m.slide * 0.8) * out; break;
        case "zoomIn": fs = 1 + m.zin * dIn; fo = inn; fr = -3 * dIn * m.rot; break;
        case "zoomOut": fs = 1 - m.zout * dIn; fo = inn; fr = 5 * dIn * m.rot; break;
        case "spin": fs = 1 - 0.3 * dIn; fo = inn; fr = 10 * dIn * m.rot; break;
        case "hopU": fy = H * dIn * k * m.y; fy -= H * 0.22 * out; fr = 3 * dIn * m.rot; break;
        case "drop": fy = -H * dIn * k * m.y; fy += H * 0.22 * out; fs = 1 + 0.12 * dIn; break;
        default: fo = inn;
      }
      const dz = 1 + p * m.driftZ * energy;
      const dx = Math.sin(clock * 0.34) * m.driftX * energy - p * 14;
      const dy = Math.cos(clock * 0.46) * m.driftY * energy;
      return {
        frame: { transform: `translate(${fx}px, ${fy}px) rotate(${fr}deg) skewX(${sk}deg) scale(${fs})`, opacity: fo },
        drift: { transform: `translate(${dx}px, ${dy}px) scale(${dz})`, opacity: 1 - out * 0.35, willChange: "transform" },
      };
    };
  }

  function make(cfg) {
    const W = cfg.W || 1080, H = cfg.H || 1920, PAD = cfg.PAD || 72;
    const FH = cfg.FH, FB = cfg.FB;
    const useTl = () => { const tl = window.useTimeline(); return tl.time * (cfg.ambient || 1.7); };
    const cam = makeCam(cfg.mag);
    const tM = PRESETS[cfg.titlePreset || "rise"];
    const iM = PRESETS[cfg.itemPreset || "pop"];
    const col = (theme, s) => (s && s[0] === "#" ? s : theme[s]);
    const u = { rgba, seg, segRaw, clamp01, lerp, ease, W, H };

    function MediaSlot({ src, label, radius, line, bgTint, compact }) {
      const base = { width: "100%", height: "100%", borderRadius: radius == null ? 16 : radius, overflow: "hidden" };
      if (src) return React.createElement("img", { src, style: { ...base, objectFit: "cover", display: "block" } });
      return React.createElement("div", { style: { ...base, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: bgTint || rgba(line, 0.05), border: `3px dashed ${rgba(line, 0.4)}`, textAlign: "center", padding: 14 } },
        React.createElement("svg", { width: compact ? 30 : 38, height: compact ? 30 : 38, viewBox: "0 0 24 24", fill: "none", stroke: rgba(line, 0.6), strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
          React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
          React.createElement("path", { d: "M21 16l-5-5L5 19" })),
        !compact && React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 15, letterSpacing: "0.12em", color: rgba(line, 0.75) } }, "DROP IMAGE TO REPLACE"),
        !compact && label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 13, color: rgba(line, 0.52) } }, label));
    }

    function Chrome({ theme, fg }) {
      const badge = cfg.badge || "circle";
      const inner = cfg.icon ? cfg.icon(theme, fg, React.createElement) : null;
      return React.createElement("div", { style: { position: "absolute", top: 56, left: PAD, display: "flex", alignItems: "center", gap: 15, zIndex: 6 } },
        badge !== "none" && React.createElement("div", { style: { width: 47, height: 47, borderRadius: badge === "circle" ? 999 : 11, background: badge === "outline" ? "transparent" : fg, border: badge === "outline" ? `2px solid ${fg}` : "none", display: "flex", alignItems: "center", justifyContent: "center" } }, inner),
        React.createElement("span", { style: Object.assign({ fontFamily: FH, fontSize: 31, color: fg }, cfg.brandStyle || {}) }, theme.brand));
    }

    function Frame({ progress, theme, bg, fg, world, children }) {
      const clock = useTl();
      const sc = window.useScene ? window.useScene() : { index: 0 };
      const kinds = cfg.cams;
      const c = cam(kinds[(sc.index * (cfg.camMul || 5) + (cfg.camOff || 1)) % kinds.length], progress, theme.energy, clock, W, H);
      theme.currentBg = bg;
      const ground = cfg.groundCss ? cfg.groundCss(theme, bg) : bg;
      return React.createElement("div", { style: { position: "absolute", inset: 0, ...c.frame, willChange: "transform, opacity" } },
        React.createElement("div", { style: { position: "absolute", inset: 0, background: ground, overflow: "hidden", fontFamily: FB } },
          world && cfg.World && React.createElement("svg", { width: W, height: H, style: { position: "absolute", inset: 0 } }, cfg.World(theme, clock, progress, u)),
          React.createElement("div", { style: { position: "absolute", inset: 0, ...c.drift } }, children),
          React.createElement(Chrome, { theme, fg })));
    }

    const Title = (txt, p, fg, hi, size, from, upper) =>
      splitLines(txt).map((ln, i) =>
        React.createElement("div", { key: i, style: { ...tM(p, (from || 0) + i), fontFamily: FH, fontSize: size, lineHeight: cfg.titleLine || 1.04, color: i === 1 ? hi : fg, textTransform: upper ? "uppercase" : "none", letterSpacing: cfg.titleSpace || "0" } }, ln));

    function Kicker({ k, p, theme }) {
      if (!k || !k.text) return null;
      const v = k.v || "pill", c = col(theme, k.c), bg = col(theme, k.bg);
      const base = { display: "inline-block", fontFamily: FB, fontWeight: 800, fontSize: 24, letterSpacing: "0.2em", marginBottom: 38, ...iM(p, 0) };
      if (v === "outline") return React.createElement("div", { style: { ...base, padding: "12px 26px", borderRadius: k.r == null ? 999 : k.r, border: `2px solid ${rgba(c, 0.75)}`, color: c } }, k.text);
      if (v === "tag") return React.createElement("div", { style: { ...base, padding: "12px 26px", borderRadius: 8, background: bg, color: c, transform: "rotate(-2deg)" } }, k.text);
      if (v === "bare") return React.createElement("div", { style: { ...base, color: c, letterSpacing: "0.3em" } }, k.text);
      return React.createElement("div", { style: { ...base, padding: "13px 28px", borderRadius: 999, background: bg, color: c } }, k.text);
    }

    function chipStyle(v, c, fill, i) {
      if (v === "outline") return { border: `2px solid ${c}`, color: c, borderRadius: 10, background: "transparent" };
      if (v === "square") return { background: c, color: fill, borderRadius: 8, transform: `rotate(${(i % 2) * 2 - 1}deg)` };
      return { background: c, color: fill, borderRadius: 999 };
    }

    function Hook({ progress: p, scene, theme }) {
      const L = cfg.look.hook, bg = col(theme, L.bg), fg = col(theme, L.fg), hi = col(theme, L.hi);
      return React.createElement(Frame, { progress: p, theme, bg, fg, world: L.world },
        React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: L.top, textAlign: L.align || "left" } },
          React.createElement(Kicker, { k: { ...(L.kicker || {}), text: scene.kicker }, p, theme }),
          Title(scene.title, p, fg, hi, L.size || 126, 1, L.upper),
          scene.sub && React.createElement("div", { style: { ...PRESETS.rise(p, 5), fontFamily: FB, fontWeight: 600, fontSize: 35, color: rgba(fg, 0.74), marginTop: 36, maxWidth: 740, lineHeight: 1.45, marginLeft: L.align === "center" ? "auto" : 0, marginRight: L.align === "center" ? "auto" : 0 } }, scene.sub)));
    }

    function Statement({ progress: p, scene, theme }) {
      const L = cfg.look.statement, bg = col(theme, L.bg), fg = col(theme, L.fg), hi = col(theme, L.hi);
      return React.createElement(Frame, { progress: p, theme, bg, fg, world: L.world },
        React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: L.top, textAlign: L.align || "left" } },
          Title(scene.title, p, fg, hi, L.size || 160, 0, L.upper),
          scene.sub && React.createElement("div", { style: { ...PRESETS.rise(p, 4), fontFamily: FB, fontWeight: 600, fontSize: 35, color: rgba(fg, 0.7), marginTop: 42, maxWidth: 700, lineHeight: 1.45, marginLeft: L.align === "center" ? "auto" : 0, marginRight: L.align === "center" ? "auto" : 0 } }, scene.sub)));
    }

    function card(L, theme, children) {
      const v = L.card.v || "frame", cbg = col(theme, L.card.bg), r = L.card.r == null ? 28 : L.card.r;
      const base = { margin: "46px auto 42px", width: 936, height: 588, borderRadius: r, padding: 13, background: cbg };
      if (v === "tilt") return { style: { ...base, transform: "rotate(-1.5deg)", boxShadow: "0 30px 62px rgba(10,10,12,0.4)" } };
      if (v === "glow") { const g = col(theme, L.card.glow); return { style: { ...base, border: `1px solid ${rgba(g, 0.55)}`, boxShadow: `0 0 44px ${rgba(g, 0.25)}, 0 28px 56px rgba(0,0,0,0.5)` } }; }
      if (v === "paper") return { style: { ...base, background: "#ffffff", borderRadius: 10, boxShadow: "0 26px 54px rgba(20,16,10,0.3)" } };
      return { style: { ...base, boxShadow: "0 30px 62px rgba(10,10,12,0.38)" } };
    }

    function Feature({ progress: p, scene, theme }) {
      const L = cfg.look.feature, bg = col(theme, L.bg), fg = col(theme, L.fg), hi = col(theme, L.hi);
      const chips = (scene.chips && scene.chips.length) ? scene.chips : [];
      const chipCols = L.chips.colors.map((k) => col(theme, k));
      const fill = col(theme, L.chips.text);
      return React.createElement(Frame, { progress: p, theme, bg, fg, world: L.world },
        React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: L.top || 250 } },
          Title(scene.title, p, fg, hi, L.size || 104, 0, L.upper),
          cfg.media === false
            ? React.createElement("div", { style: { margin: "52px 0 10px", display: "flex", flexDirection: "column", gap: 30 } },
                chips.map((c, i) => React.createElement("div", { key: i, style: { ...iM(p, i + 2), fontFamily: FH, fontSize: 74, lineHeight: 1.05, color: i === 1 ? hi : fg, borderBottom: `3px solid ${rgba(i === 1 ? hi : fg, 0.5)}`, paddingBottom: 22 } }, c)))
            : React.createElement(React.Fragment, null,
                React.createElement("div", { ...(function () { const c = card(L, theme); return { style: { ...iM(p, 2), ...c.style } }; })() },
                  React.createElement(MediaSlot, { src: scene.image, radius: Math.max(6, (L.card.r == null ? 28 : L.card.r) - 10), label: "Landscape photo \u2014 16:10", line: col(theme, L.card.line) })),
                React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 16, justifyContent: L.chips.center ? "center" : "flex-start" } },
                  chips.map((c, i) => React.createElement("div", { key: i, style: { ...iM(p, i + 4), padding: "14px 27px", fontFamily: FB, fontWeight: 800, fontSize: 27, ...chipStyle(L.chips.v, chipCols[i % chipCols.length], fill, i) } }, c))))));
    }

    function Montage({ progress: p, scene, theme }) {
      const L = cfg.look.montage, bg = col(theme, L.bg), fg = col(theme, L.fg), hi = col(theme, L.hi);
      const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["One", "Two", "Three", "Four"];
      const tilts = L.tilts || [-3, 2.5, 2, -2.5];
      const tbg = col(theme, L.tile.bg), tline = col(theme, L.tile.line), tlabel = col(theme, L.tile.label);
      return React.createElement(Frame, { progress: p, theme, bg, fg, world: L.world },
        React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: L.top || 258 } },
          Title(scene.title, p, fg, hi, L.size || 102, 0, L.upper),
          React.createElement("div", { style: { marginTop: 54, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 } },
            tiles.slice(0, 4).map((label, i) =>
              React.createElement("div", { key: i, style: { ...iM(p, i + 2), transform: `rotate(${tilts[i]}deg)` } },
                cfg.media === false
                  ? React.createElement("div", { style: { height: 250, borderRadius: L.tile.r == null ? 22 : L.tile.r, background: tbg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FH, fontSize: 52, color: tlabel, textTransform: L.upper ? "uppercase" : "none", padding: 16, textAlign: "center", lineHeight: 1.05 } }, label)
                  : React.createElement(React.Fragment, null,
                      React.createElement("div", { style: { height: 292, borderRadius: L.tile.r == null ? 22 : L.tile.r, background: tbg, padding: 11, border: L.tile.glow ? `1px solid ${rgba(col(theme, L.tile.glow), 0.55)}` : "none", boxShadow: L.tile.glow ? `0 0 26px ${rgba(col(theme, L.tile.glow), 0.2)}` : "0 20px 44px rgba(10,10,12,0.3)" } },
                        React.createElement(MediaSlot, { src: (scene.images || [])[i], radius: Math.max(4, (L.tile.r == null ? 22 : L.tile.r) - 9), label, line: tline, compact: false })),
                      React.createElement("div", { style: { fontFamily: FH, fontSize: L.tile.labelSize || 28, color: tlabel, marginTop: 13, textAlign: "center", textTransform: L.upper ? "uppercase" : "none" } }, label)))))));
    }

    function Stats({ progress: p, scene, theme }) {
      const L = cfg.look.stats, bg = col(theme, L.bg), fg = col(theme, L.fg), hi = col(theme, L.hi);
      const stats = (scene.stats && scene.stats.length) ? scene.stats : [];
      const cols = L.cols.map((k) => col(theme, k));
      return React.createElement(Frame, { progress: p, theme, bg, fg, world: L.world },
        React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: L.top || 410 } },
          Title(scene.title, p, fg, hi, L.size || 102, 0, L.upper),
          React.createElement("div", { style: { marginTop: 62, display: "flex", flexDirection: "column", gap: L.rule ? 42 : 52 } },
            stats.slice(0, 3).map((st, i) => {
              const e = ease.outCubic(seg(p, 0.12 + i * 0.08, 0.75));
              return React.createElement("div", { key: i, style: { ...PRESETS.rise(p, i + 2), display: "flex", alignItems: "baseline", gap: 30, borderBottom: L.rule ? `4px solid ${cols[i]}` : "none", paddingBottom: L.rule ? 24 : 0 } },
                React.createElement("div", { style: { fontFamily: FH, fontSize: L.num || 156, lineHeight: 0.9, color: cols[i], fontVariantNumeric: "tabular-nums", textShadow: L.glowNums ? `0 0 36px ${rgba(cols[i], 0.5)}` : "none" } }, Math.round(st.to * e).toLocaleString(), React.createElement("span", { style: { fontSize: Math.round((L.num || 156) * 0.5) } }, st.suffix)),
                React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 33, color: rgba(fg, 0.76), maxWidth: 440, lineHeight: 1.35 } }, st.label));
            }))));
    }

    function CTA({ progress: p, scene, theme }) {
      const L = cfg.look.cta, bg = col(theme, L.bg), fg = col(theme, L.fg), hi = col(theme, L.hi);
      const bbg = col(theme, L.btn.bg), bc = col(theme, L.btn.c);
      const center = (L.align || "center") === "center";
      const btnBase = { display: "inline-flex", alignItems: "center", gap: 15, marginTop: 52, padding: "26px 54px", fontFamily: FH, fontSize: 43, background: bbg, color: bc };
      const btnV = L.btn.v === "block" ? { borderRadius: 10 } : L.btn.v === "glow" ? { borderRadius: 12, boxShadow: `0 0 52px ${rgba(bbg, 0.55)}` } : { borderRadius: 999, boxShadow: "0 22px 54px rgba(10,10,12,0.35)" };
      return React.createElement(Frame, { progress: p, theme, bg, fg, world: L.world },
        React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: L.top || 470, textAlign: center ? "center" : "left" } },
          React.createElement("div", { style: { ...iM(p, 0), width: 148, height: 148, borderRadius: L.logoShape === "rounded" ? 20 : 999, overflow: "hidden", background: rgba(fg, 0.08), border: `2px dashed ${rgba(fg, 0.4)}`, margin: center ? "0 auto 42px" : "0 0 42px" } },
            React.createElement(MediaSlot, { src: scene.logo, radius: L.logoShape === "rounded" ? 14 : 999, compact: true, line: fg })),
          Title(scene.title, p, fg, hi, L.size || 126, 1, L.upper),
          React.createElement("div", { style: { ...iM(p, 4), ...btnBase, ...btnV } },
            scene.cta,
            React.createElement("svg", { width: 34, height: 34, viewBox: "0 0 24 24", fill: "none", stroke: bc, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M5 12h14" }), React.createElement("path", { d: "M13 6l6 6-6 6" }))),
          scene.url && React.createElement("div", { style: { ...PRESETS.rise(p, 5), fontFamily: FB, fontWeight: 800, fontSize: 35, color: fg, marginTop: 42 } }, scene.url)));
    }

    /* ---------- interaction scenes: per-template VARIANTS so no two templates
       share a mechanism. cfg.variants = { Scroll: "board", Ring: "gauge", ... } ---------- */
    const V = (k, d) => (cfg.variants && cfg.variants[k]) || d;
    const A = () => cfg.look.app || {
      bg: cfg.look.statement.bg, fg: cfg.look.statement.fg, hi: cfg.look.hook.hi,
      cardBg: (cfg.look.feature.card && cfg.look.feature.card.bg) || "ink",
      line: (cfg.look.feature.card && cfg.look.feature.card.line) || "paper",
      world: false, upper: cfg.look.statement.upper,
    };
    const panelR = () => (cfg.look.feature.card && cfg.look.feature.card.r != null ? Math.max(10, cfg.look.feature.card.r) : 22);
    const MONO = cfg.codeFont || 'ui-monospace, SFMono-Regular, Menlo, monospace';

    function Shell({ progress: p, theme, title, children }) {
      const L = A(), bg = col(theme, L.bg), fg = col(theme, L.fg), hi = col(theme, L.hi);
      return React.createElement(Frame, { progress: p, theme, bg, fg, world: L.world },
        React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 180, bottom: 140, display: "flex", flexDirection: "column", justifyContent: "center" } },
          Title(title, p, fg, hi, 92, 0, L.upper),
          React.createElement("div", { style: { marginTop: 48 } }, children)));
    }
    const panel = (theme, h, extra) => ({ background: col(theme, A().cardBg), borderRadius: panelR(), padding: 30, height: h, border: "1px solid " + rgba(col(theme, A().line), 0.2), boxShadow: "0 26px 56px rgba(8,8,10,0.35)", position: "relative", overflow: "hidden", ...extra });
    const Pointer = (x, y, fg, press) => React.createElement("g", { transform: "translate(" + x + "," + y + ") scale(" + (press ? 0.88 : 1) + ")" },
      React.createElement("path", { d: "M0 0 L0 30 L8 24 L14 38 L20 35 L14 22 L24 21 Z", fill: fg, stroke: "rgba(0,0,0,0.4)", strokeWidth: 1.5 }));

    function Cursor({ progress: p, scene, theme }) {
      const v = V("Cursor", "click"), clock = useTl();
      const L = A(), fg = col(theme, L.fg), hi = col(theme, L.hi), line = col(theme, L.line), cardBg = col(theme, L.cardBg);
      if (v === "slider") {
        const mv = ease.inOut(seg(p, 0.2, 0.6));
        const val = Math.round(10 + mv * 80);
        const flip = seg(p, 0.74, 0.82) > 0;
        const kx = 40 + mv * 560;
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { ...iM(p, 2), ...panel(theme, 560) } },
            React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 26, color: rgba(line, 0.6) } }, scene.caption || ""),
            React.createElement("div", { style: { fontFamily: FH, fontSize: 120, color: hi, marginTop: 40, fontVariantNumeric: "tabular-nums" } }, val, React.createElement("span", { style: { fontSize: 54, color: rgba(line, 0.6) } }, "%")),
            React.createElement("div", { style: { position: "relative", height: 60, marginTop: 40 } },
              React.createElement("div", { style: { position: "absolute", top: 24, left: 40, width: 600, height: 14, borderRadius: 999, background: rgba(line, 0.15) } }),
              React.createElement("div", { style: { position: "absolute", top: 24, left: 40, width: mv * 600, height: 14, borderRadius: 999, background: hi } }),
              React.createElement("div", { style: { position: "absolute", top: 4, left: kx - 26, width: 52, height: 52, borderRadius: 999, background: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,0.4)" } })),
            React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "50px 20px 0", padding: "22px 30px", borderRadius: 16, background: rgba(line, 0.08) } },
              React.createElement("span", { style: { fontFamily: FB, fontWeight: 700, fontSize: 28, color: line } }, scene.toggle),
              React.createElement("div", { style: { width: 92, height: 50, borderRadius: 999, background: flip ? hi : rgba(line, 0.25), position: "relative" } },
                React.createElement("div", { style: { position: "absolute", top: 6, left: flip ? 48 : 6, width: 38, height: 38, borderRadius: 999, background: "#fff" } }))),
            React.createElement("svg", { width: 940, height: 560, style: { position: "absolute", inset: 0, pointerEvents: "none" } },
              Pointer(kx + 30, 300, fg, mv > 0.02 && mv < 0.98))));
      }
      if (v === "keys") {
        const keys = scene.keys || [(scene.btn || "GO").slice(0, 5), "+", (scene.toggle || "OK").split(" ")[0].slice(0, 6)];
        const allDone = p > 0.2 + (keys.length - 1) * 0.15 + 0.1;
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { ...iM(p, 2), ...panel(theme, 560) } },
            React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 26, color: rgba(line, 0.6), marginBottom: 46 } }, scene.caption || ""),
            React.createElement("div", { style: { display: "flex", gap: 26, justifyContent: "center" } },
              keys.map((k, i) => {
                const s0 = 0.2 + i * 0.15;
                const pr = Math.sin(clamp01(seg(p, s0, s0 + 0.1)) * Math.PI);
                const did = p > s0 + 0.1;
                return React.createElement("div", { key: i, style: { minWidth: 170, padding: "34px 20px", textAlign: "center", borderRadius: 18, background: did ? rgba(hi, 0.18) : rgba(line, 0.08), border: "2px solid " + (did ? hi : rgba(line, 0.25)), borderBottomWidth: 8 - pr * 6, transform: "translateY(" + (pr * 8) + "px)", fontFamily: FH, fontSize: 40, color: did ? hi : line } }, k);
              })),
            allDone && React.createElement("div", { style: { ...PRESETS.pop(seg(p, 0.72, 0.86), 0), textAlign: "center", marginTop: 52, fontFamily: FH, fontSize: 52, color: hi } }, scene.after || "DONE")));
      }
      const toBtn = ease.inOut(seg(p, 0.1, 0.34)), click = seg(p, 0.36, 0.44);
      const toTog = ease.inOut(seg(p, 0.52, 0.72)), flip = seg(p, 0.74, 0.82) > 0;
      const bx = 450, by = 300, tx = 700, ty = 490;
      const cx = lerp(lerp(140, bx, toBtn), tx, toTog), cy = lerp(lerp(620, by, toBtn), ty, toTog);
      const clicked = p > 0.4;
      return React.createElement(Shell, { progress: p, theme, title: scene.title },
        React.createElement("div", { style: { ...iM(p, 2), ...panel(theme, 620) } },
          React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 26, color: rgba(line, 0.6), marginBottom: 34 } }, scene.caption || ""),
          React.createElement("div", { style: { display: "flex", justifyContent: "center", marginTop: 40 } },
            React.createElement("div", { style: { padding: "26px 60px", borderRadius: 999, background: clicked ? hi : rgba(line, 0.14), color: clicked ? cardBg : line, fontFamily: FH, fontSize: 42, transform: "scale(" + (1 - Math.sin(clamp01(click) * Math.PI) * 0.08) + ")" } }, clicked ? (scene.after || scene.btn) : scene.btn)),
          React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "70px 40px 0", padding: "26px 34px", borderRadius: 18, background: rgba(line, 0.08) } },
            React.createElement("span", { style: { fontFamily: FB, fontWeight: 700, fontSize: 30, color: line } }, scene.toggle),
            React.createElement("div", { style: { width: 96, height: 52, borderRadius: 999, background: flip ? hi : rgba(line, 0.25), position: "relative" } },
              React.createElement("div", { style: { position: "absolute", top: 6, left: flip ? 50 : 6, width: 40, height: 40, borderRadius: 999, background: "#fff" } }))),
          React.createElement("svg", { width: 940, height: 620, style: { position: "absolute", inset: 0, pointerEvents: "none" } },
            click > 0 && click < 1 && React.createElement("circle", { cx: bx, cy: by, r: 20 + click * 70, fill: "none", stroke: hi, strokeWidth: 4, opacity: 1 - click }),
            Pointer(cx, cy, fg, click > 0 && click < 1))));
    }

    function Typing({ progress: p, scene, theme }) {
      const v = V("Typing", "caret"), clock = useTl();
      const L = A(), fg = col(theme, L.fg), hi = col(theme, L.hi), line = col(theme, L.line);
      const text = scene.text || "";
      const n = Math.floor(seg(p, 0.1, 0.78) * text.length);
      const done = n >= text.length;
      const blink = Math.sin(clock * 6) > 0;
      if (v === "terminal") {
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { ...iM(p, 2), ...panel(theme, 480, { background: "#10131a", border: "1px solid " + rgba(hi, 0.4), padding: 40 } ) } },
            scene.prompt && React.createElement("div", { style: { fontFamily: MONO, fontSize: 24, color: rgba("#9aa4b2", 0.7), marginBottom: 26 } }, "# " + scene.prompt),
            React.createElement("div", { style: { fontFamily: MONO, fontSize: 34, lineHeight: 1.6, color: "#e6edf3" } },
              React.createElement("span", { style: { color: hi } }, "$ "),
              text.slice(0, n),
              !done && React.createElement("span", { style: { opacity: blink ? 1 : 0, color: hi } }, "\u2588")),
            done && React.createElement("div", { style: { ...PRESETS.rise(seg(p, 0.8, 0.92), 0), fontFamily: MONO, fontSize: 30, color: "#27c93f", marginTop: 30 } }, "\u203a " + (scene.stamp || "OK"))));
      }
      if (v === "typewriter") {
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { ...iM(p, 2) } },
            scene.prompt && React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 24, letterSpacing: "0.2em", color: rgba(fg, 0.55), marginBottom: 34 } }, scene.prompt),
            React.createElement("div", { style: { fontFamily: FH, fontSize: 76, lineHeight: 1.3, color: fg, minHeight: 400 } },
              text.slice(0, n).split("").map((ch, i) =>
                React.createElement("span", { key: i, style: { display: "inline-block", whiteSpace: "pre", transform: "rotate(" + (((i % 5) - 2) * 1.3) + "deg) translateY(" + (((i * 7) % 3) - 1) * 2 + "px)" } }, ch)),
              !done && React.createElement("span", { style: { opacity: blink ? 1 : 0, color: hi } }, "_")),
            done && scene.stamp && React.createElement("div", { style: { ...PRESETS.stamp(seg(p, 0.8, 1), 0), display: "inline-block", padding: "12px 28px", border: "4px double " + hi, color: hi, fontFamily: FH, fontSize: 36, transform: "rotate(-2deg)" } }, scene.stamp)));
      }
      if (v === "hand") {
        const words = text.split(" ");
        const wn = Math.floor(seg(p, 0.1, 0.74) * words.length + 0.999);
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { ...iM(p, 2) } },
            scene.prompt && React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 25, letterSpacing: "0.14em", color: rgba(fg, 0.55), marginBottom: 34 } }, scene.prompt),
            React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "10px 22px", minHeight: 380, alignContent: "flex-start" } },
              words.slice(0, wn).map((w, i) => {
                const e = ease.outBack(clamp01(seg(p, 0.1, 0.74) * words.length - i));
                return React.createElement("span", { key: i, style: { fontFamily: FH, fontSize: 82, lineHeight: 1.15, color: i % 4 === 2 ? hi : fg, display: "inline-block", opacity: clamp01(e * 2), transform: "rotate(" + ((i % 2 ? 2 : -2.6)) + "deg) scale(" + lerp(1.35, 1, clamp01(e)) + ")" } }, w);
              })),
            (wn >= words.length) && scene.stamp && React.createElement("div", { style: { ...PRESETS.pop(seg(p, 0.82, 0.95), 0), display: "inline-block", marginTop: 26, fontFamily: FH, fontSize: 40, color: hi, borderBottom: "6px solid " + hi, paddingBottom: 6, transform: "rotate(-1.5deg)" } }, scene.stamp)));
      }
      return React.createElement(Shell, { progress: p, theme, title: scene.title },
        React.createElement("div", { style: { ...iM(p, 2) } },
          scene.prompt && React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 25, letterSpacing: "0.18em", color: rgba(fg, 0.55), marginBottom: 30 } }, scene.prompt),
          React.createElement("div", { style: { fontFamily: FH, fontSize: 84, lineHeight: 1.14, color: fg, minHeight: 420, borderLeft: "10px solid " + hi, paddingLeft: 40 } },
            text.slice(0, n),
            React.createElement("span", { style: { opacity: blink ? 1 : 0, color: hi } }, "|")),
          done && scene.stamp && React.createElement("div", { style: { ...PRESETS.stamp(seg(p, 0.8, 1), 0), display: "inline-block", marginTop: 40, padding: "14px 30px", border: "4px solid " + hi, borderRadius: 12, color: hi, fontFamily: FH, fontSize: 38, transform: "rotate(-3deg)" } }, scene.stamp)));
    }

    function Code({ progress: p, scene, theme }) {
      const v = V("Code", "editor"), clock = useTl();
      const L = A(), hi = col(theme, L.hi), line = col(theme, L.line);
      const lines = scene.lines || [];
      const blink = Math.sin(clock * 7) > 0;
      if (v === "diff") {
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { ...iM(p, 2), ...panel(theme, 700, { background: "#10131a", border: "1px solid " + rgba(hi, 0.4) }) } },
            React.createElement("div", { style: { fontFamily: MONO, fontSize: 22, color: rgba("#9aa4b2", 0.6), marginBottom: 22 } }, "\u25cf changes (" + lines.length + ")"),
            lines.map((ln, i) => {
              const e = PRESETS.machete(seg(p, 0.08 + i * 0.09, 0.22 + i * 0.09), 0);
              const add = ln.trim().indexOf("+") === 0, del = ln.trim().indexOf("-") === 0;
              const c = add ? "#3fb950" : del ? "#f85149" : "#e6edf3";
              const bg = add ? "rgba(63,185,80,0.12)" : del ? "rgba(248,81,73,0.12)" : "transparent";
              return React.createElement("div", { key: i, style: { ...e, fontFamily: MONO, fontSize: 29, lineHeight: 1.8, color: c, background: bg, padding: "2px 14px", borderRadius: 6, whiteSpace: "pre" } }, ln);
            }),
            (seg(p, 0.78, 0.9) > 0) && scene.out && React.createElement("div", { style: { ...PRESETS.pop(seg(p, 0.78, 0.92), 0), display: "inline-block", marginTop: 28, padding: "12px 26px", borderRadius: 8, background: rgba(hi, 0.16), border: "1px solid " + hi, color: hi, fontFamily: MONO, fontSize: 27 } }, scene.out)));
      }
      if (v === "terminal") {
        const total = lines.reduce((a, l) => a + l.length, 0) || 1;
        let budget = Math.floor(seg(p, 0.08, 0.7) * total);
        const done = budget >= total;
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { ...iM(p, 2), ...panel(theme, 700, { background: "#0c0f14", border: "1px solid " + rgba(hi, 0.45), padding: 40 }) } },
            lines.map((ln, i) => {
              const take = Math.max(0, Math.min(ln.length, budget)); budget -= take;
              if (take <= 0) return null;
              return React.createElement("div", { key: i, style: { fontFamily: MONO, fontSize: 31, lineHeight: 1.9, color: "#d8e2ec", whiteSpace: "pre" } },
                React.createElement("span", { style: { color: hi } }, "$ "), ln.slice(0, take),
                take < ln.length && React.createElement("span", { style: { opacity: blink ? 1 : 0, color: hi } }, "\u2588"));
            }),
            done && React.createElement("div", { style: { fontFamily: MONO, fontSize: 31, color: "#27c93f", marginTop: 16 } }, "\u2714 " + (scene.out || "done")),
            done && React.createElement("div", { style: { fontFamily: MONO, fontSize: 31, color: "#d8e2ec", marginTop: 8 } },
              React.createElement("span", { style: { color: hi } }, "$ "),
              React.createElement("span", { style: { opacity: blink ? 1 : 0, color: hi } }, "\u2588"))));
      }
      const total = lines.reduce((a, l) => a + l.length, 0) || 1;
      let budget = Math.floor(seg(p, 0.08, 0.72) * total);
      const done = budget >= total;
      let caretShown = false;
      return React.createElement(Shell, { progress: p, theme, title: scene.title },
        React.createElement("div", { style: { ...iM(p, 2), ...panel(theme, 700, { background: "#10131a", border: "1px solid " + rgba(hi, 0.4) }) } },
          React.createElement("div", { style: { display: "flex", gap: 10, marginBottom: 26 } },
            ["#ff5f56", "#ffbd2e", "#27c93f"].map((c, i) => React.createElement("span", { key: i, style: { width: 16, height: 16, borderRadius: 999, background: c } }))),
          lines.map((ln, i) => {
            const take = Math.max(0, Math.min(ln.length, budget)); budget -= take;
            const isC = ln.trim().indexOf("//") === 0 || ln.trim().indexOf("#") === 0;
            const shown = ln.slice(0, take);
            const sp = shown.indexOf(" ");
            const showCaret = !done && !caretShown && take < ln.length;
            if (showCaret) caretShown = true;
            return React.createElement("div", { key: i, style: { fontFamily: MONO, fontSize: 30, lineHeight: 1.75, color: isC ? rgba("#9aa4b2", 0.7) : "#e6edf3", whiteSpace: "pre" } },
              React.createElement("span", { style: { color: rgba("#9aa4b2", 0.4), marginRight: 26 } }, String(i + 1).padStart(2, " ")),
              !isC && sp > 0 ? React.createElement(React.Fragment, null, React.createElement("span", { style: { color: hi } }, shown.slice(0, sp)), shown.slice(sp)) : shown,
              showCaret && React.createElement("span", { style: { opacity: blink ? 1 : 0, color: hi } }, "\u2588"));
          }),
          done && scene.out && React.createElement("div", { style: { ...PRESETS.pop(seg(p, 0.78, 0.95), 0), display: "inline-block", marginTop: 30, padding: "12px 26px", borderRadius: 8, background: rgba(hi, 0.16), border: "1px solid " + hi, color: hi, fontFamily: MONO, fontSize: 27 } }, scene.out)));
    }

    function Scroll({ progress: p, scene, theme }) {
      const v = V("Scroll", "feed"), clock = useTl();
      const L = A(), hi = col(theme, L.hi), line = col(theme, L.line), fg = col(theme, L.fg);
      const items = scene.items || [];
      const lab = (it) => (typeof it === "string" ? it : it.t);
      const val = (it) => (typeof it === "string" ? null : it.v);
      if (v === "board") {
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { ...iM(p, 2), ...panel(theme, null, { padding: "26px 34px" }) } },
            items.slice(0, 7).map((it, i) => {
              const fl = ease.outBack(seg(p, 0.08 + i * 0.07, 0.2 + i * 0.07));
              const flick = seg(p, 0.66 + i * 0.01, 0.7 + i * 0.01);
              return React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 22, padding: "17px 0", borderBottom: "1px solid " + rgba(line, 0.12), transform: "scaleY(" + clamp01(fl) + ")", transformOrigin: "top", opacity: clamp01(fl * 1.6) } },
                React.createElement("span", { style: { fontFamily: MONO, fontSize: 26, color: hi, background: rgba(hi, 0.12), padding: "5px 12px", borderRadius: 6, flex: "none" } }, String(i + 1).padStart(2, "0")),
                React.createElement("span", { style: { fontFamily: FB, fontWeight: 700, fontSize: 31, color: line, flex: "none" } }, lab(it)),
                React.createElement("span", { style: { flex: 1, borderBottom: "3px dotted " + rgba(line, 0.3), margin: "0 6px", height: 1 } }),
                val(it) && React.createElement("span", { style: { fontFamily: MONO, fontSize: 29, color: hi, opacity: flick > 0 && flick < 1 ? (Math.sin(flick * 22) > 0 ? 1 : 0.25) : 1 } }, val(it)));
            })));
      }
      if (v === "ticker") {
        const rowText = items.map(lab).join("   \u2022   ");
        const rep = rowText + "   \u2022   " + rowText + "   \u2022   " + rowText;
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { marginTop: 20, display: "flex", flexDirection: "column", gap: 40 } },
            [0, 1, 2].map((r) => {
              const dir = r % 2 === 0 ? 1 : -1;
              const shift = ((clock * (70 + r * 45) * dir) % 1400 + 1400) % 1400;
              const e = ease.outExpo(seg(p, 0.04 + r * 0.07, 0.24 + r * 0.07));
              const cols = [fg, hi, rgba(fg, 0.5)];
              return React.createElement("div", { key: r, style: { whiteSpace: "nowrap", overflow: "visible", transform: "translateX(" + (-shift - (1 - e) * dir * 400) + "px)", opacity: e, fontFamily: FH, fontSize: 66 - r * 8, lineHeight: 1.2, color: cols[r] } }, rep);
            }),
            React.createElement("div", { style: { ...PRESETS.rise(p, 5), fontFamily: FB, fontWeight: 600, fontSize: 30, color: rgba(fg, 0.65), marginTop: 20 } }, (items.length ? items.length : "") + " entries \u00b7 live")));
      }
      if (v === "stack") {
        const nItems = Math.max(1, items.length);
        const q = seg(p, 0.1, 0.9) * (nItems - 0.001);
        const idx = Math.min(nItems - 1, Math.floor(q));
        const frac = q - idx;
        const off = frac > 0.72 ? (frac - 0.72) / 0.28 : 0;
        const cur = items[idx] || "", nxt = items[Math.min(nItems - 1, idx + 1)] || "";
        const card = (it, st) => React.createElement("div", { style: { position: "absolute", left: 0, right: 0, top: 0, ...panel(theme, 360, { padding: 44 }), ...st } },
          React.createElement("div", { style: { fontFamily: FH, fontSize: 56, lineHeight: 1.12, color: line } }, lab(it)),
          val(it) && React.createElement("div", { style: { fontFamily: MONO, fontSize: 40, color: hi, marginTop: 26 } }, val(it)));
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { ...iM(p, 2), position: "relative", height: 470 } },
            idx + 1 < nItems && card(nxt, { transform: "translateY(" + (44 - off * 44) + "px) scale(" + (0.94 + off * 0.06) + ")", zIndex: 1 }),
            card(cur, { transform: "translateY(" + (-off * 240) + "px) rotate(" + (-off * 5) + "deg)", opacity: 1 - off, zIndex: 2 }),
            React.createElement("div", { style: { position: "absolute", bottom: 0, left: 0, fontFamily: MONO, fontSize: 26, color: rgba(fg, 0.6) } }, (idx + 1) + " / " + nItems)));
      }
      const rowH = 118, viewH = 840, inner = items.length * rowH;
      const travel = Math.max(0, inner - (viewH - 60));
      const ty = -ease.inOut(seg(p, 0.22, 0.9)) * travel;
      return React.createElement(Shell, { progress: p, theme, title: scene.title },
        React.createElement("div", { style: { ...iM(p, 2), ...panel(theme, viewH) } },
          React.createElement("div", { style: { position: "absolute", top: 30, bottom: 30, left: 30, right: 60, overflow: "hidden" } },
            React.createElement("div", { style: { transform: "translateY(" + ty + "px)", willChange: "transform" } },
              items.map((it, i) => React.createElement("div", { key: i, style: { height: rowH, display: "flex", alignItems: "center", gap: 26, borderBottom: "1px solid " + rgba(line, 0.14) } },
                React.createElement("span", { style: { fontFamily: FH, fontSize: 30, color: hi, width: 66, flex: "none" } }, String(i + 1).padStart(2, "0")),
                React.createElement("span", { style: { fontFamily: FB, fontWeight: 700, fontSize: 32, color: line, flex: 1 } }, lab(it)),
                val(it) && React.createElement("span", { style: { fontFamily: FH, fontSize: 30, color: rgba(line, 0.65) } }, val(it)))))),
          React.createElement("div", { style: { position: "absolute", top: 30, bottom: 30, right: 22, width: 10, borderRadius: 999, background: rgba(line, 0.12) } },
            React.createElement("div", { style: { position: "absolute", left: 0, right: 0, borderRadius: 999, background: hi, height: Math.max(14, (viewH - 60) / Math.max(inner, 1) * 100) + "%", top: ((-ty / Math.max(travel, 1)) * (100 - Math.max(14, (viewH - 60) / Math.max(inner, 1) * 100))) + "%" } }))));
    }

    function DragDrop({ progress: p, scene, theme }) {
      const v = V("DragDrop", "drag");
      const L = A(), hi = col(theme, L.hi), line = col(theme, L.line), fg = col(theme, L.fg), cardBg = col(theme, L.cardBg);
      if (v === "assemble") {
        const fly = ease.inOut(seg(p, 0.16, 0.5));
        const landed = p > 0.52;
        const shakeT = clamp01(seg(p, 0.52, 0.64));
        const shake = Math.sin(shakeT * Math.PI * 5) * (1 - shakeT) * 9;
        const chipX = lerp(-60, 330, fly), chipY = lerp(80, 300, fly) - Math.sin(fly * Math.PI) * 160;
        const rot = lerp(-14, 0, fly);
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { ...iM(p, 2), ...panel(theme, 620) } },
            React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 26, color: rgba(line, 0.6) } }, scene.caption || ""),
            React.createElement("div", { style: { position: "absolute", left: 300, top: 280, width: 340, height: 150, borderRadius: 22, border: "4px " + (landed ? "solid" : "dashed") + " " + (landed ? hi : rgba(line, 0.4)), background: landed ? rgba(hi, 0.1) : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FB, fontWeight: 700, fontSize: 24, color: rgba(line, 0.5), letterSpacing: "0.12em" } }, landed ? "" : (scene.slot || "SLOT")),
            React.createElement("div", { style: { position: "absolute", left: (landed ? 330 : chipX) + (landed ? shake : 0), top: landed ? 315 : chipY, padding: "24px 42px", borderRadius: 16, background: hi, color: cardBg, fontFamily: FH, fontSize: 36, transform: "rotate(" + (landed ? 0 : rot) + "deg)", boxShadow: landed ? "0 6px 14px rgba(0,0,0,0.25)" : "0 30px 50px rgba(0,0,0,0.45)" } }, scene.item),
            landed && React.createElement("div", { style: { ...PRESETS.pop(seg(p, 0.68, 0.82), 0), position: "absolute", left: 660, top: 322, width: 64, height: 64, borderRadius: 999, background: hi, display: "flex", alignItems: "center", justifyContent: "center" } },
              React.createElement("svg", { width: 34, height: 34, viewBox: "0 0 24 24", fill: "none", stroke: cardBg, strokeWidth: 3.5, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M4 12l5 5L20 6" }))),
            landed && React.createElement("div", { style: { ...PRESETS.rise(seg(p, 0.72, 0.9), 0), position: "absolute", left: 40, bottom: 40, fontFamily: FB, fontWeight: 700, fontSize: 28, color: rgba(line, 0.75) } }, (scene.slot || "SLOT") + " \u00b7 locked in")));
      }
      const grab = seg(p, 0.14, 0.24) >= 1, move = ease.inOut(seg(p, 0.28, 0.6));
      const dropped = p > 0.64;
      const sx = 150, sy = 210, txx = 560, tyy = 480;
      const chipX = lerp(sx, txx, move), chipY = lerp(sy, tyy, move) - Math.sin(move * Math.PI) * 90;
      const settle = PRESETS.pop(seg(p, 0.64, 0.8), 0);
      return React.createElement(Shell, { progress: p, theme, title: scene.title },
        React.createElement("div", { style: { ...iM(p, 2), ...panel(theme, 660) } },
          React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 26, color: rgba(line, 0.6) } }, scene.caption || ""),
          React.createElement("div", { style: { position: "absolute", left: txx, top: tyy, width: 330, height: 130, borderRadius: 20, border: "4px dashed " + (dropped ? hi : rgba(line, 0.4)), background: dropped ? rgba(hi, 0.12) : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FB, fontWeight: 700, fontSize: 24, color: rgba(line, 0.55), letterSpacing: "0.1em" } }, dropped ? "" : (scene.slot || "DROP HERE")),
          React.createElement("div", { style: { position: "absolute", left: dropped ? txx + 25 : chipX, top: dropped ? tyy + 25 : chipY, ...(dropped ? settle : {}), padding: "22px 40px", borderRadius: 16, background: hi, color: cardBg, fontFamily: FH, fontSize: 34, boxShadow: grab && !dropped ? "0 26px 44px rgba(0,0,0,0.45)" : "0 8px 18px rgba(0,0,0,0.25)", transform: ((dropped ? settle.transform : "") || "") + " rotate(" + (grab && !dropped ? -4 : 0) + "deg)" } }, scene.item),
          dropped && React.createElement("div", { style: { ...PRESETS.pop(seg(p, 0.74, 0.9), 0), position: "absolute", left: txx + 350, top: tyy + 34, width: 60, height: 60, borderRadius: 999, background: hi, display: "flex", alignItems: "center", justifyContent: "center" } },
            React.createElement("svg", { width: 32, height: 32, viewBox: "0 0 24 24", fill: "none", stroke: cardBg, strokeWidth: 3.5, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M4 12l5 5L20 6" }))),
          React.createElement("svg", { width: 940, height: 660, style: { position: "absolute", inset: 0, pointerEvents: "none" } },
            !dropped && Pointer(chipX + 90, chipY + 40, fg, grab))));
    }

    function Toggle({ progress: p, scene, theme }) {
      const v = V("Toggle", "switch");
      const L = A(), hi = col(theme, L.hi), line = col(theme, L.line);
      const items = scene.items || [];
      if (v === "check") {
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 24 } },
            items.slice(0, 4).map((label, i) => {
              const on = seg(p, 0.16 + i * 0.14, 0.24 + i * 0.14) >= 1;
              const e = ease.outBack(seg(p, 0.16 + i * 0.14, 0.3 + i * 0.14));
              return React.createElement("div", { key: i, style: { ...iM(p, i + 2), ...panel(theme, 116, { padding: "0 34px", display: "flex", alignItems: "center", gap: 28 }) } },
                React.createElement("div", { style: { width: 52, height: 52, borderRadius: 12, flex: "none", border: "3px solid " + (on ? hi : rgba(line, 0.35)), background: on ? hi : "transparent", display: "flex", alignItems: "center", justifyContent: "center" } },
                  on && React.createElement("svg", { width: 34, height: 34, viewBox: "0 0 24 24", fill: "none", stroke: col(theme, L.cardBg), strokeWidth: 4, strokeLinecap: "round", strokeLinejoin: "round", style: { transform: "scale(" + clamp01(e) + ")" } }, React.createElement("path", { d: "M4 12l5 5L20 6" }))),
                React.createElement("span", { style: { fontFamily: FB, fontWeight: 700, fontSize: 33, color: on ? line : rgba(line, 0.55) } }, label),
                on && React.createElement("span", { style: { marginLeft: "auto", fontFamily: MONO, fontSize: 24, color: hi } }, "\u2713"));
            })));
      }
      if (v === "dial") {
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 } },
            items.slice(0, 4).map((label, i) => {
              const e = ease.outBack(seg(p, 0.14 + i * 0.13, 0.34 + i * 0.13));
              const ang = -120 + clamp01(e) * (150 + (i % 3) * 35);
              return React.createElement("div", { key: i, style: { ...iM(p, i + 2), ...panel(theme, 250, { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }) } },
                React.createElement("div", { style: { width: 104, height: 104, borderRadius: 999, border: "6px solid " + rgba(line, 0.25), position: "relative", background: rgba(line, 0.05) } },
                  React.createElement("div", { style: { position: "absolute", left: 43, top: 6, width: 6, height: 34, borderRadius: 4, background: e > 0.9 ? hi : line, transformOrigin: "3px 40px", transform: "rotate(" + ang + "deg)" } }),
                  e > 0.9 && React.createElement("div", { style: { position: "absolute", inset: -12, borderRadius: 999, border: "2px solid " + rgba(hi, 0.5) } })),
                React.createElement("span", { style: { fontFamily: FB, fontWeight: 700, fontSize: 26, color: line, textAlign: "center" } }, label));
            })));
      }
      return React.createElement(Shell, { progress: p, theme, title: scene.title },
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 24 } },
          items.slice(0, 4).map((label, i) => {
            const on = seg(p, 0.18 + i * 0.14, 0.26 + i * 0.14) >= 1;
            const knob = ease.outBack(seg(p, 0.18 + i * 0.14, 0.3 + i * 0.14));
            return React.createElement("div", { key: i, style: { ...iM(p, i + 2), ...panel(theme, 118, { padding: "0 36px", display: "flex", alignItems: "center", justifyContent: "space-between" }) } },
              React.createElement("span", { style: { fontFamily: FB, fontWeight: 700, fontSize: 33, color: on ? line : rgba(line, 0.55) } }, label),
              React.createElement("div", { style: { width: 104, height: 56, borderRadius: 999, background: on ? hi : rgba(line, 0.22), position: "relative", flex: "none" } },
                React.createElement("div", { style: { position: "absolute", top: 7, left: 7 + knob * 48, width: 42, height: 42, borderRadius: 999, background: "#fff", boxShadow: "0 3px 8px rgba(0,0,0,0.3)" } })));
          })));
    }

    function Notify({ progress: p, scene, theme }) {
      const v = V("Notify", "drop");
      const L = A(), hi = col(theme, L.hi), line = col(theme, L.line);
      const notes = scene.notes || [];
      if (v === "side") {
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 26 } },
            notes.slice(0, 3).map((nt, i) => {
              const s0 = 0.12 + i * 0.16;
              const e = ease.outExpo(seg(p, s0, s0 + 0.16));
              const life = clamp01(seg(p, s0 + 0.16, 1));
              return React.createElement("div", { key: i, style: { opacity: clamp01(e * 1.5), transform: "translateX(" + ((1 - e) * 460) + "px)", ...panel(theme, 158, { padding: "24px 32px 18px" }) } },
                React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 29, color: line } }, nt[0]),
                React.createElement("div", { style: { fontFamily: FB, fontWeight: 500, fontSize: 25, color: rgba(line, 0.65), marginTop: 5 } }, nt[1]),
                React.createElement("div", { style: { position: "absolute", left: 0, bottom: 0, height: 6, width: ((1 - life) * 100) + "%", background: hi, borderRadius: 3 } }));
            })));
      }
      if (v === "pop") {
        const offs = [{ x: 0, r: -3 }, { x: 110, r: 2.5 }, { x: 30, r: -1.5 }];
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 34, marginTop: 10 } },
            notes.slice(0, 3).map((nt, i) => {
              const e = ease.outBack(seg(p, 0.14 + i * 0.17, 0.3 + i * 0.17));
              return React.createElement("div", { key: i, style: { alignSelf: "flex-start", marginLeft: offs[i].x, opacity: clamp01(e * 1.6), transform: "scale(" + lerp(0.3, 1, clamp01(e)) + ") rotate(" + offs[i].r + "deg)", ...panel(theme, null, { padding: "22px 34px", borderRadius: 999, display: "flex", alignItems: "center", gap: 20, border: "2px solid " + rgba(hi, 0.6) }) } },
                React.createElement("span", { style: { width: 16, height: 16, borderRadius: 999, background: hi, flex: "none" } }),
                React.createElement("span", { style: { fontFamily: FB, fontWeight: 800, fontSize: 29, color: line } }, nt[0]),
                React.createElement("span", { style: { fontFamily: FB, fontWeight: 500, fontSize: 24, color: rgba(line, 0.6) } }, nt[1]));
            })));
      }
      return React.createElement(Shell, { progress: p, theme, title: scene.title },
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 26 } },
          notes.slice(0, 3).map((nt, i) => {
            const e = ease.outBack(seg(p, 0.14 + i * 0.16, 0.34 + i * 0.16));
            return React.createElement("div", { key: i, style: { opacity: clamp01(e * 1.4), transform: "translateY(" + ((1 - e) * -150) + "px) rotate(" + ((1 - e) * (i % 2 ? 3 : -3)) + "deg)", ...panel(theme, 150, { padding: "26px 32px", display: "flex", gap: 24, alignItems: "center" }) } },
              React.createElement("div", { style: { width: 66, height: 66, borderRadius: 18, background: hi, color: col(theme, L.cardBg), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FH, fontSize: 34, flex: "none" } }, (theme.brand || "A")[0]),
              React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 29, color: line } }, nt[0]),
                React.createElement("div", { style: { fontFamily: FB, fontWeight: 500, fontSize: 25, color: rgba(line, 0.65), marginTop: 4 } }, nt[1])),
              React.createElement("span", { style: { fontFamily: FB, fontSize: 22, color: rgba(line, 0.45), flex: "none" } }, "now"));
          })));
    }

    function Swipe({ progress: p, scene, theme }) {
      const v = V("Swipe", "swipe");
      const L = A(), hi = col(theme, L.hi), line = col(theme, L.line);
      const cards = scene.cards || [];
      const T = (c) => (typeof c === "string" ? c : c.t), S = (c) => (typeof c === "string" ? "" : c.s);
      if (v === "flip") {
        const f1 = seg(p, 0.3, 0.46), f2 = seg(p, 0.62, 0.78);
        let k = 0, sx = 1;
        if (f1 > 0 && f1 < 1) { sx = Math.abs(1 - f1 * 2); k = f1 < 0.5 ? 0 : 1; }
        else if (f1 >= 1 && f2 <= 0) { k = 1; }
        else if (f2 > 0 && f2 < 1) { sx = Math.abs(1 - f2 * 2); k = f2 < 0.5 ? 1 : 2; }
        else if (f2 >= 1) { k = 2; }
        const c = cards[Math.min(k, cards.length - 1)] || "";
        return React.createElement(Shell, { progress: p, theme, title: scene.title },
          React.createElement("div", { style: { ...iM(p, 2) } },
            React.createElement("div", { style: { transform: "scaleX(" + Math.max(0.02, sx) + ")", ...panel(theme, 560, { padding: 48 }) } },
              React.createElement("div", { style: { fontFamily: FH, fontSize: 62, lineHeight: 1.1, color: line } }, T(c)),
              S(c) && React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 30, color: rgba(line, 0.65), marginTop: 24, lineHeight: 1.45 } }, S(c)),
              React.createElement("div", { style: { position: "absolute", bottom: 36, left: 48, fontFamily: FH, fontSize: 30, color: hi } }, scene.stamp || "")),
            React.createElement("div", { style: { display: "flex", gap: 14, justifyContent: "center", marginTop: 34 } },
              cards.slice(0, 3).map((_, i) => React.createElement("span", { key: i, style: { width: i === k ? 44 : 14, height: 14, borderRadius: 999, background: i === k ? hi : rgba(line, 0.3) } })))));
      }
      const sw = ease.inCubic(seg(p, 0.34, 0.6));
      const promo = ease.outCubic(seg(p, 0.55, 0.75));
      const layers = cards.slice(0, 3).map((c, i) => ({ label: T(c), sub: S(c), i }));
      return React.createElement(Shell, { progress: p, theme, title: scene.title },
        React.createElement("div", { style: { position: "relative", height: 700, marginTop: 20 } },
          layers.map(({ label, sub, i }) => {
            let st;
            if (i === 0) st = { transform: "translate(" + (sw * 1100) + "px, " + (sw * -80) + "px) rotate(" + (sw * 18) + "deg)", opacity: 1 - sw * 0.2, zIndex: 3 };
            else if (i === 1) st = { transform: "translateY(" + lerp(30, 0, promo) + "px) scale(" + lerp(0.94, 1, promo) + ")", zIndex: 2 };
            else st = { transform: "translateY(" + lerp(60, 30, promo) + "px) scale(" + lerp(0.88, 0.94, promo) + ")", zIndex: 1 };
            return React.createElement("div", { key: i, style: { position: "absolute", left: 60, right: 60, top: 0, height: 620, ...panel(theme, 620, { padding: 44 }), ...st } },
              React.createElement("div", { style: { fontFamily: FH, fontSize: 64, color: line, lineHeight: 1.08 } }, label),
              sub && React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 30, color: rgba(line, 0.65), marginTop: 22, lineHeight: 1.45 } }, sub),
              i === 0 && sw > 0.05 && React.createElement("div", { style: { position: "absolute", top: 44, right: 44, padding: "12px 26px", border: "5px solid " + hi, borderRadius: 12, color: hi, fontFamily: FH, fontSize: 40, transform: "rotate(12deg)", opacity: Math.min(1, sw * 3) } }, scene.stamp || "YES"));
          })));
    }

    function Morph({ progress: p, scene, theme }) {
      const v = V("Morph", "roll");
      const L = A(), fg = col(theme, L.fg), hi = col(theme, L.hi);
      const steps = scene.steps || [];
      const q = seg(p, 0.12, 0.88) * (steps.length - 0.001);
      const idx = Math.min(steps.length - 1, Math.floor(q));
      const frac = q - idx;
      const nxt = steps[Math.min(steps.length - 1, idx + 1)];
      let word;
      if (v === "flap") {
        const maxLen = Math.max(String(steps[idx]).length, String(nxt).length);
        const cw = Math.max(44, Math.min(92, Math.floor(830 / maxLen) - 9));
        const chars = [];
        for (let ci = 0; ci < maxLen; ci++) {
          const startFl = 0.72 + (ci / maxLen) * 0.2;
          const fl = frac <= startFl ? 0 : Math.min(1, (frac - startFl) / 0.08);
          const ch = fl < 0.5 ? (String(steps[idx])[ci] || " ") : (String(nxt)[ci] || " ");
          chars.push(React.createElement("span", { key: ci, style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: cw, height: Math.round(cw * 1.62), margin: "0 4px", background: rgba(fg, 0.1), border: "1px solid " + rgba(fg, 0.2), borderRadius: Math.max(6, Math.round(cw * 0.13)), fontFamily: FH, fontSize: Math.round(cw * 1.1), color: hi, transform: "scaleY(" + Math.abs(1 - fl * 2) + ")", boxShadow: "inset 0 -2px 0 " + rgba(fg, 0.2), whiteSpace: "pre" } }, ch));
        }
        word = React.createElement("div", { style: { display: "flex", flexWrap: "nowrap" } }, chars);
      } else if (v === "fade") {
        const fr2 = frac > 0.7 ? ease.inOut((frac - 0.7) / 0.3) : 0;
        word = React.createElement("div", { style: { position: "relative", height: 190 } },
          React.createElement("div", { style: { position: "absolute", fontFamily: FH, fontSize: 150, lineHeight: "190px", color: hi, opacity: 1 - fr2, transform: "scale(" + (1 + fr2 * 0.08) + ")", transformOrigin: "left center", whiteSpace: "nowrap" } }, steps[idx]),
          fr2 > 0 && React.createElement("div", { style: { position: "absolute", fontFamily: FH, fontSize: 150, lineHeight: "190px", color: hi, opacity: fr2, transform: "scale(" + (0.92 + fr2 * 0.08) + ")", transformOrigin: "left center", whiteSpace: "nowrap" } }, nxt));
      } else {
        const roll = frac > 0.75 ? (frac - 0.75) * 4 : 0;
        word = React.createElement("div", { style: { height: 190, overflow: "hidden", position: "relative" } },
          React.createElement("div", { style: { transform: "translateY(" + (-roll * 190) + "px)" } },
            React.createElement("div", { style: { fontFamily: FH, fontSize: 150, lineHeight: "190px", color: hi, whiteSpace: "nowrap" } }, steps[idx]),
            React.createElement("div", { style: { fontFamily: FH, fontSize: 150, lineHeight: "190px", color: hi, whiteSpace: "nowrap" } }, nxt)));
      }
      return React.createElement(Shell, { progress: p, theme, title: scene.title },
        React.createElement("div", { style: { marginTop: 40 } },
          scene.prefix && React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 40, color: rgba(fg, 0.6), marginBottom: 24 } }, scene.prefix),
          word,
          React.createElement("div", { style: { width: 320, height: 10, borderRadius: 999, background: rgba(fg, 0.15), marginTop: 30 } },
            React.createElement("div", { style: { width: (((idx + frac) / steps.length) * 320) + "px", height: 10, borderRadius: 999, background: hi } })),
          scene.sub && React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 34, color: rgba(fg, 0.7), marginTop: 44, maxWidth: 700, lineHeight: 1.45 } }, scene.sub)));
    }

    function Ring({ progress: p, scene, theme }) {
      const v = V("Ring", "ring");
      const L = A(), fg = col(theme, L.fg), hi = col(theme, L.hi);
      const e = ease.inOut(seg(p, 0.14, 0.78));
      const to = scene.to == null ? 100 : scene.to;
      const unit = scene.unit == null ? "%" : scene.unit;
      const num = React.createElement("div", { style: { fontFamily: FH, fontSize: 130, color: fg, fontVariantNumeric: "tabular-nums", lineHeight: 1 } }, Math.round(e * to), React.createElement("span", { style: { fontSize: 64, color: hi } }, unit));
      let viz;
      if (v === "gauge") {
        const arcLen = Math.PI * 220;
        const ang = -90 + e * (to / 100) * 180;
        viz = React.createElement("div", { style: { position: "relative", width: 560, height: 340 } },
          React.createElement("svg", { width: 560, height: 340, viewBox: "0 0 560 340" },
            React.createElement("path", { d: "M 60 300 A 220 220 0 0 1 500 300", fill: "none", stroke: rgba(fg, 0.15), strokeWidth: 30, strokeLinecap: "round" }),
            React.createElement("path", { d: "M 60 300 A 220 220 0 0 1 500 300", fill: "none", stroke: hi, strokeWidth: 30, strokeLinecap: "round", strokeDasharray: String(arcLen), strokeDashoffset: String(arcLen * (1 - e * (to / 100))) }),
            [0, 1, 2, 3, 4].map((i) => { const a = (-180 + i * 45) * Math.PI / 180; return React.createElement("line", { key: i, x1: 280 + Math.cos(a) * 250, y1: 300 + Math.sin(a) * 250, x2: 280 + Math.cos(a) * 232, y2: 300 + Math.sin(a) * 232, stroke: rgba(fg, 0.35), strokeWidth: 4 }); }),
            React.createElement("g", { transform: "rotate(" + ang + " 280 300)" },
              React.createElement("line", { x1: 280, y1: 300, x2: 280, y2: 118, stroke: fg, strokeWidth: 8, strokeLinecap: "round" }),
              React.createElement("circle", { cx: 280, cy: 300, r: 20, fill: fg })),
            React.createElement("circle", { cx: 280, cy: 300, r: 9, fill: hi })),
          React.createElement("div", { style: { position: "absolute", left: 0, right: 0, bottom: -76, textAlign: "center" } }, num));
      } else if (v === "bar") {
        viz = React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 56 } },
          React.createElement("div", { style: { position: "relative", width: 210, height: 500 } },
            React.createElement("div", { style: { position: "absolute", top: -22, left: 65, width: 80, height: 22, borderRadius: "8px 8px 0 0", background: rgba(fg, 0.3) } }),
            React.createElement("div", { style: { position: "absolute", inset: 0, border: "5px solid " + rgba(fg, 0.35), borderRadius: 28, overflow: "hidden" } },
              React.createElement("div", { style: { position: "absolute", left: 8, right: 8, bottom: 8, height: "calc(" + (e * to) + "% - 8px)", minHeight: 8, borderRadius: 18, background: hi } })),
            [0.25, 0.5, 0.75].map((f, i) => React.createElement("div", { key: i, style: { position: "absolute", right: -26, bottom: (f * 100) + "%", width: 18, height: 4, background: rgba(fg, 0.35) } }))),
          React.createElement("div", null, num,
            scene.label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 30, color: rgba(fg, 0.65), marginTop: 16 } }, scene.label)));
      } else {
        const rr = 240, C = 2 * Math.PI * rr;
        viz = React.createElement("div", { style: { position: "relative", width: 560, height: 560 } },
          React.createElement("svg", { width: 560, height: 560, viewBox: "0 0 560 560" },
            Array.from({ length: 12 }).map((_, i) => React.createElement("line", { key: i, x1: 280 + Math.cos(i * Math.PI / 6) * 268, y1: 280 + Math.sin(i * Math.PI / 6) * 268, x2: 280 + Math.cos(i * Math.PI / 6) * 254, y2: 280 + Math.sin(i * Math.PI / 6) * 254, stroke: rgba(fg, 0.3), strokeWidth: 4 })),
            React.createElement("circle", { cx: 280, cy: 280, r: rr, fill: "none", stroke: rgba(fg, 0.14), strokeWidth: 30 }),
            React.createElement("circle", { cx: 280, cy: 280, r: rr, fill: "none", stroke: hi, strokeWidth: 30, strokeLinecap: "round", strokeDasharray: String(C), strokeDashoffset: String(C * (1 - e * (to / 100))), transform: "rotate(-90 280 280)" })),
          React.createElement("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" } }, num,
            scene.label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 30, color: rgba(fg, 0.65), marginTop: 14 } }, scene.label)));
      }
      return React.createElement(Shell, { progress: p, theme, title: scene.title },
        React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", marginTop: 30, gap: v === "gauge" ? 180 : 30 } },
          viz,
          scene.sub && React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 33, color: rgba(fg, 0.72), textAlign: "center", maxWidth: 720, lineHeight: 1.45, marginTop: v === "bar" ? 0 : 10 } }, scene.sub)));
    }

    const SCENE_MAP = { Hook, Statement, Feature, Montage, Stats, CTA, Cursor, Typing, Code, Scroll, DragDrop, Toggle, Notify, Swipe, Morph, Ring };
    const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.35 };

    function Root() {
      const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
      const [t, setTweak] = window.useTweaks(defaults);
      const theme = cfg.palette(t);
      theme.energy = ENERGY[t.motion] ?? 1.0;
      theme.brand = t.brand || cfg.brand;
      const scenes = {};
      for (const k in SCENE_MAP) { const C = SCENE_MAP[k]; scenes[k] = (props) => React.createElement(C, { ...props, theme }); }
      const TP = window.TweaksPanel, TS = window.TweakSection, TT = window.TweakText, TC = window.TweakColor, TR = window.TweakRadio;
      return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: cfg.desk } },
        React.createElement(window.SceneStage, { width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: col(theme, cfg.look.hook.bg) }, scenes),
        React.createElement(TP, null,
          React.createElement(TS, { label: "Brand" }),
          React.createElement(TT, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
          (cfg.tweaks || []).map((tw, i) =>
            React.createElement(TC, { key: i, label: tw.label, value: t[tw.k] || tw.options[0], options: tw.options, onChange: (v) => setTweak(tw.k, v) })),
          React.createElement(TS, { label: "Motion" }),
          React.createElement(TR, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) })));
    }
    window[cfg.global] = Root;
    return Root;
  }

  return { make, rgba, PRESETS };
})();
