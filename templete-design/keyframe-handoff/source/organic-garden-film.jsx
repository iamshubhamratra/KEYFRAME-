/* organic-garden-film.jsx — "Organic Garden" animated video template (9:16, loop).
   A warm cream garden reel: drifting petals, leaves and soft blobs, Caprasimo
   headlines with a sage seed-ring on the emphasis word, Figtree body copy.
   Built on the SceneStage engine (animations-v2.jsx) + Tweaks (tweaks-panel.jsx).
   Exposes window.OrganicGarden. All copy lives in window.OM_SCENES; brand colours
   / motion in window.OM_TWEAKS. */
(function () {
  const { SceneStage } = window;
  // ambient/world motion (drift, embers, petals, scroll) runs faster than wall clock
  const AMBIENT = 1.75;
  const useTimeline = () => {
    const tl = window.useTimeline();
    return Object.assign({}, tl, { time: tl.time * AMBIENT });
  };
  const { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakText, TweakRadio, TweakToggle } = window;

  /* ---------- helpers ---------- */
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  // normalized sub-range of p in [a,b]
  const segRaw = (p, a, b) => clamp01((p - a) / (b - a || 1e-6));
  /* Scenes are long so copy can be read, but reveals must stay quick. PACE warps
     normalized scene progress: fast in (first 20% of real time covers half the
     reveal timeline), slow hold through the middle, fast out over the last 22%. */
  const PACE = (p) => (p <= 0.2 ? p * 2.5 : p <= 0.78 ? 0.5 + (p - 0.2) * 0.41379 : 0.74 + (p - 0.78) * 1.18182);
  const seg = (p, a, b) => segRaw(PACE(p), a, b);
  const ease = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outElastic: (t) => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  };
  function hexToRgb(h) {
    h = (h || "#000").replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const splitLines = (t) => String(t == null ? "" : t).split("|");
  // seeded pseudo-random so the garden is stable across renders
  function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  const FH = '"Caprasimo", Georgia, serif';        // heading
  const FB = '"Figtree", system-ui, sans-serif';    // body

  /* ---------- garden backdrop (continuous, global clock) ---------- */
  const PETALS = (() => {
    const r = rng(97);
    const arr = [];
    for (let i = 0; i < 26; i++) {
      arr.push({
        x: r(), size: 14 + r() * 34, speed: 22 + r() * 40, sway: 30 + r() * 70,
        swayF: 0.3 + r() * 0.5, phase: r() * Math.PI * 2, spin: (r() - 0.5) * 60,
        kind: Math.floor(r() * 3), tint: r(),
      });
    }
    return arr;
  })();
  const BLOBS = (() => {
    const r = rng(311);
    return Array.from({ length: 5 }, () => ({
      x: r(), y: r(), R: 260 + r() * 260, dx: (r() - 0.5) * 60, dy: (r() - 0.5) * 50,
      f: 0.04 + r() * 0.05, tint: r(),
    }));
  })();

  function GardenWorld({ t, W, H, theme, density }) {
    const petalC = [theme.accent, theme.accent2, theme.accentSoft];
    const blobC = [theme.accent2, theme.accent, theme.accent2];
    const nP = Math.round(PETALS.length * density);
    return (
      React.createElement("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: { position: "absolute", inset: 0 }, "aria-hidden": true },
        React.createElement("defs", null,
          BLOBS.map((b, i) => React.createElement("radialGradient", { id: `blob${i}`, key: i },
            React.createElement("stop", { offset: "0%", stopColor: rgba(blobC[b.tint < 0.5 ? 0 : 1], 0.5) }),
            React.createElement("stop", { offset: "100%", stopColor: rgba(blobC[b.tint < 0.5 ? 0 : 1], 0) })
          ))
        ),
        // soft warm blobs
        BLOBS.map((b, i) => {
          const cx = b.x * W + Math.sin(t * b.f + i) * b.dx;
          const cy = b.y * H + Math.cos(t * b.f * 0.8 + i) * b.dy;
          return React.createElement("circle", { key: `b${i}`, cx, cy, r: b.R, fill: `url(#blob${i})`, opacity: 0.55 });
        }),
        // rolling ground hills
        (() => {
          const base = H * 0.82;
          const y = (x) => base + Math.sin(x / 260 + t * 0.12) * 26 + Math.sin(x / 90 - t * 0.2) * 8;
          let d = `M0,${H} L0,${y(0)}`;
          for (let x = 0; x <= W; x += 40) d += ` L${x},${y(x)}`;
          d += ` L${W},${H} Z`;
          const base2 = H * 0.9;
          const y2 = (x) => base2 + Math.sin(x / 200 - t * 0.16) * 20;
          let d2 = `M0,${H} L0,${y2(0)}`;
          for (let x = 0; x <= W; x += 40) d2 += ` L${x},${y2(x)}`;
          d2 += ` L${W},${H} Z`;
          return React.createElement(React.Fragment, null,
            React.createElement("path", { d, fill: rgba(theme.accent2, 0.16) }),
            React.createElement("path", { d: d2, fill: rgba(theme.accent2, 0.24) })
          );
        })(),
        // drifting petals / leaves
        PETALS.slice(0, nP).map((p, i) => {
          const cycle = H + 200;
          const yy = H + 80 - ((t * p.speed + p.phase * 60) % cycle);
          const xx = p.x * W + Math.sin(t * p.swayF + p.phase) * p.sway;
          const rot = t * p.spin + p.phase * 120;
          const col = petalC[i % petalC.length];
          let shape;
          if (p.kind === 0) shape = React.createElement("path", { d: "M0,-1 C 0.55,-0.7 0.55,0.7 0,1 C -0.55,0.7 -0.55,-0.7 0,-1 Z", transform: `scale(${p.size})`, fill: rgba(col, 0.7) });
          else if (p.kind === 1) shape = React.createElement("ellipse", { rx: p.size * 0.5, ry: p.size, fill: rgba(col, 0.6) });
          else shape = React.createElement("circle", { r: p.size * 0.42, fill: rgba(col, 0.5) });
          return React.createElement("g", { key: `p${i}`, transform: `translate(${xx},${yy}) rotate(${rot})` }, shape);
        })
      )
    );
  }

  /* ---------- camera per scene (varied kind so it never feels like a slideshow) ---------- */
  function cam(kind, p, energy) {
    const inn = ease.outBack(seg(p, 0, 0.22));
    const out = ease.inCubic(seg(p, 0.82, 1));
    const dIn = 1 - inn, dOut = out, k = energy;
    let tx = 0, ty = 0, sc = 1, rot = 0;
    switch (kind) {
      case "left": tx = -90 * dIn + 60 * dOut; rot = -3 * dIn; break;
      case "right": tx = 90 * dIn - 60 * dOut; rot = 3 * dIn; break;
      case "up": ty = 100 * dIn - 60 * dOut; sc = 1 - 0.05 * dIn; break;
      case "drop": ty = -100 * dIn + 60 * dOut; rot = 2 * dIn; break;
      case "zoom": sc = 1 - 0.18 * dIn + 0.07 * dOut; ty = 30 * dIn; break;
      case "scaleout": sc = 1 + 0.16 * dIn - 0.07 * dOut; rot = -2 * dIn; break;
      case "swing": tx = -60 * dIn + 44 * dOut; rot = -5 * dIn + 3 * dOut; break;
      default: sc = 1 - 0.08 * dIn;
    }
    return { transform: `translate(${tx * k}px, ${ty * k}px) rotate(${rot * k}deg) scale(${sc})`, opacity: inn < 0 ? 0 : inn * (1 - out * 0.55) };
  }

  /* ---------- motion presets ---------- */
  const M = {
    rise: (p, i = 0, energy = 1) => { const e = ease.outCubic(clamp01((p - i * 0.06) / 0.4)); return { opacity: e, transform: `translateY(${(1 - e) * 34 * energy}px)` }; },
    pop: (p, i = 0) => { const e = ease.outBack(clamp01((p - i * 0.06) / 0.42)); return { opacity: clamp01(e * 1.5), transform: `scale(${lerp(0.7, 1, e)})` }; },
    draw: (p) => ({ strokeDasharray: 1, strokeDashoffset: 1 - ease.inOut(clamp01(p / 0.5)) }),
  };

  /* ---------- soft leaf-drift transition (a gentle current carries you between scenes) ---------- */
  const LEAF_D = "M0,-1 C 0.62,-0.62 0.5,0.72 0,1 C -0.5,0.72 -0.62,-0.62 0,-1 Z";
  const GUST = (() => {
    const r = rng(53);
    return Array.from({ length: 7 }, (_, i) => ({
      cross: 0.12 + (i / 7) * 0.78 + (r() - 0.5) * 0.06,
      size: 22 + r() * 20, spin: (r() - 0.5) * 120, wob: 18 + r() * 26,
      phase: r() * Math.PI * 2, lead: r() * 0.14, tint: i % 3,
    }));
  })();
  function GustLeaves({ progress, theme, dir, energy }) {
    const W = theme.W, H = theme.H;
    const cols = [theme.accent2, theme.accent, theme.accentSoft];
    const inS = ease.inOut(seg(progress, 0, 0.24));
    const outS = ease.inOut(seg(progress, 0.76, 1));
    const sweep = (s, key) => {
      if (s <= 0 || s >= 1) return null;
      return React.createElement("g", { key }, GUST.map((g, i) => {
        const local = clamp01((s - g.lead) / (1 - g.lead || 1e-6));
        if (local <= 0 || local >= 1) return null;
        const span = (dir === "ttb" ? H : W) + 460;
        let x, y;
        if (dir === "rtl") { x = W + 230 - local * span; y = g.cross * H + Math.sin(local * Math.PI * 2 + g.phase) * g.wob; }
        else if (dir === "ttb") { x = g.cross * W + Math.sin(local * Math.PI * 2 + g.phase) * g.wob; y = -230 + local * span; }
        else { x = -230 + local * span; y = g.cross * H + Math.sin(local * Math.PI * 2 + g.phase) * g.wob; }
        const op = Math.sin(local * Math.PI) * 0.6;
        return React.createElement("g", { key: i, transform: `translate(${x},${y}) rotate(${g.spin * local})`, opacity: op },
          React.createElement("path", { d: LEAF_D, transform: `scale(${g.size})`, fill: rgba(cols[g.tint], 0.85) }));
      }));
    };
    return React.createElement("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4 }, "aria-hidden": true },
      sweep(inS, "in"), sweep(outS, "out"));
  }
  const GUST_DIRS = ["ltr", "rtl", "ltr", "rtl", "ltr", "rtl"];

  /* ---------- reusable pieces ---------- */
  function MediaSlot({ src, label, radius = 22, style, theme, compact }) {
    const base = { width: "100%", height: "100%", borderRadius: radius, overflow: "hidden", ...style };
    if (src) return React.createElement("img", { src, style: { ...base, objectFit: "cover", display: "block" } });
    if (compact) {
      return React.createElement("div", {
        style: { ...base, display: "flex", alignItems: "center", justifyContent: "center", background: rgba(theme.accent, 0.06), border: `3px dashed ${rgba(theme.ink, 0.28)}` },
      },
        React.createElement("svg", { width: 36, height: 36, viewBox: "0 0 24 24", fill: "none", stroke: rgba(theme.ink, 0.5), strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
          React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
          React.createElement("path", { d: "M21 16l-5-5L5 19" })));
    }
    return React.createElement("div", {
      style: {
        ...base, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
        background: rgba(theme.accent, 0.06), border: `3px dashed ${rgba(theme.ink, 0.28)}`, textAlign: "center", padding: 24,
      },
    },
      React.createElement("div", { style: { width: 54, height: 54, borderRadius: 999, background: rgba(theme.accent2, 0.5), display: "flex", alignItems: "center", justifyContent: "center" } },
        React.createElement("svg", { width: 28, height: 28, viewBox: "0 0 24 24", fill: "none", stroke: theme.ink, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("rect", { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
          React.createElement("circle", { cx: 8.5, cy: 10, r: 1.6 }),
          React.createElement("path", { d: "M21 16l-5-5L5 19" }))),
      React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 17, letterSpacing: "0.14em", color: rgba(theme.ink, 0.55) } }, "DROP IMAGE TO REPLACE"),
      label && React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 15, color: rgba(theme.ink, 0.4) } }, label)
    );
  }

  function Phone({ children, theme, style }) {
    return React.createElement("div", {
      style: {
        position: "relative", background: theme.ink, borderRadius: 46, padding: 12,
        boxShadow: `0 40px 80px ${rgba(theme.ink, 0.28)}`, ...style,
      },
    },
      React.createElement("div", { style: { position: "absolute", top: 22, left: "50%", transform: "translateX(-50%)", width: 96, height: 26, background: theme.ink, borderRadius: 999, zIndex: 2 } }),
      React.createElement("div", { style: { borderRadius: 36, overflow: "hidden", background: theme.surface, height: "100%" } }, children)
    );
  }

  function SeedRing({ theme, p, style }) {
    // sage hand-drawn ellipse that draws around the emphasis word
    const draw = ease.inOut(seg(p, 0.25, 0.75));
    const per = 2 * Math.PI * 130;
    return React.createElement("svg", { viewBox: "0 0 300 150", preserveAspectRatio: "none", style: { position: "absolute", inset: "-14% -8%", width: "116%", height: "128%", overflow: "visible", ...style } },
      React.createElement("ellipse", {
        cx: 150, cy: 75, rx: 138, ry: 62, fill: "none", stroke: theme.accent2, strokeWidth: 6, strokeLinecap: "round",
        pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - draw, opacity: 0.9, transform: "rotate(-3 150 75)",
      })
    );
  }

  function Chip({ children, theme, i, p }) {
    const s = M.pop(p, i + 1);
    return React.createElement("div", {
      style: {
        ...s, display: "inline-flex", alignItems: "center", gap: 12, padding: "16px 26px", borderRadius: 999,
        background: theme.bg, border: `2px solid ${rgba(theme.ink, 0.14)}`, boxShadow: `0 10px 24px ${rgba(theme.ink, 0.08)}`,
        fontFamily: FB, fontWeight: 700, fontSize: 30, color: theme.ink,
      },
    },
      React.createElement("span", { style: { width: 16, height: 16, borderRadius: 999, background: theme.accent, flex: "none" } }),
      children
    );
  }

  function Counter({ to, suffix = "", p, theme }) {
    const e = ease.outCubic(seg(p, 0.05, 0.7));
    const val = to * e;
    const txt = Math.abs(to % 1) > 0 ? val.toFixed(1) : Math.round(val).toLocaleString();
    return React.createElement("div", { style: { fontFamily: FH, fontSize: 128, lineHeight: 0.9, color: theme.accent } }, txt, React.createElement("span", { style: { fontSize: 64 } }, suffix));
  }

  function Chrome({ theme, brand }) {
    const { index, count } = window.useScene ? window.useScene() : { index: 0, count: 6 };
    return React.createElement(React.Fragment, null,
      // brand top-left
      React.createElement("div", { style: { position: "absolute", top: 64, left: 72, display: "flex", alignItems: "center", gap: 18, zIndex: 5 } },
        React.createElement("div", { style: { width: 44, height: 44, borderRadius: 999, background: theme.accent, display: "flex", alignItems: "center", justifyContent: "center" } },
          React.createElement("svg", { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: theme.bg, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" },
            React.createElement("path", { d: "M12 20V10" }), React.createElement("path", { d: "M12 10c0-3 2-5 5-5 0 3-2 5-5 5Z" }), React.createElement("path", { d: "M12 13c0-2.5-2-4-4.5-4 0 2.5 2 4 4.5 4Z" }))),
        React.createElement("span", { style: { fontFamily: FH, fontSize: 34, color: theme.ink } }, brand))
    );
  }

  /* ---------- Frame wrapper: backdrop + camera layer + chrome ---------- */
  function Frame({ progress, camKind, theme, energy, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0 };
    const W = theme.W, H = theme.H;
    const CAMS = ["drop", "left", "swing", "right", "zoom", "scaleout"];
    const c = cam(CAMS[sc.index % CAMS.length] || camKind, progress, energy);
    const dir = (GUST_DIRS[sc.index % GUST_DIRS.length] || "ltr").replace("swing-r", "rtl");
    return React.createElement("div", { style: { position: "absolute", inset: 0, background: theme.bg, overflow: "hidden", fontFamily: FB } },
      React.createElement(GardenWorld, { t: clock, W, H, theme, density: theme.density }),
      React.createElement("div", { style: { position: "absolute", inset: 0, transform: c.transform, opacity: c.opacity, willChange: "transform, opacity" } }, children),
      React.createElement(Chrome, { theme, brand: theme.brand })
    );
  }

  const PAD = 72;
  const wrap = (children, extra) => ({ position: "absolute", left: PAD, right: PAD, ...extra }, children);

  /* ---------- scenes ---------- */
  function Hook({ progress, scene, theme }) {
    const lines = splitLines(scene.title || "Your garden|deserves|a film");
    const mark = scene.mark || "film";
    return React.createElement(Frame, { progress, camKind: "drop", theme, energy: theme.energy },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 560 } },
        React.createElement("div", { style: { ...M.rise(progress, 0, theme.energy), fontFamily: FB, fontWeight: 800, fontSize: 26, letterSpacing: "0.22em", textTransform: "uppercase", color: theme.accent700, marginBottom: 30 } }, scene.kicker || "GROWN FROM YOUR STORY"),
        lines.map((ln, i) =>
          React.createElement("div", { key: i, style: { ...M.rise(progress, i + 1, theme.energy), fontFamily: FH, fontSize: 130, lineHeight: 1.02, color: theme.ink, position: "relative", display: "inline-block" } },
            ln,
            ln.trim() === mark && React.createElement(SeedRing, { theme, p: progress }))),
        React.createElement("div", { style: { ...M.rise(progress, lines.length + 1, theme.energy), fontFamily: FB, fontWeight: 500, fontSize: 40, color: rgba(theme.ink, 0.68), marginTop: 34, maxWidth: 720 } }, scene.sub || "Made from your own site, shots and story."))
    );
  }

  function Statement({ progress, scene, theme }) {
    const lines = splitLines(scene.title || "Most product videos|feel like|a spreadsheet.");
    return React.createElement(Frame, { progress, camKind: "left", theme, energy: theme.energy },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 640 } },
        React.createElement("div", { style: { ...M.rise(progress, 0, theme.energy), width: 96, height: 10, borderRadius: 999, background: theme.accent, marginBottom: 46 } }),
        lines.map((ln, i) =>
          React.createElement("div", { key: i, style: { ...M.rise(progress, i + 1, theme.energy), fontFamily: FH, fontSize: 118, lineHeight: 1.05, color: i === 1 ? theme.accent700 : theme.ink } }, ln)),
        React.createElement("div", { style: { ...M.rise(progress, lines.length + 1, theme.energy), fontFamily: FB, fontWeight: 500, fontSize: 38, color: rgba(theme.ink, 0.66), marginTop: 40, maxWidth: 760 } }, scene.sub || "Yours should feel alive — warm, moving, unmistakably you."))
    );
  }

  function Feature({ progress, scene, theme }) {
    const chips = (scene.chips && scene.chips.length) ? scene.chips : ["Drops in your shots", "On-brand every frame", "Ready in minutes"];
    const rise = M.rise(progress, 1, theme.energy);
    return React.createElement(Frame, { progress, camKind: "swing", theme, energy: theme.energy },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 300 } },
        React.createElement("div", { style: { ...M.rise(progress, 0, theme.energy), fontFamily: FH, fontSize: 96, lineHeight: 1.02, color: theme.ink, marginBottom: 40 } }, splitLines(scene.title || "Your screens,|planted center stage.").map((ln, i) => React.createElement("div", { key: i }, ln))),
        React.createElement("div", { style: { ...rise, width: 944, height: 620, margin: "0 auto 44px", background: theme.ink, borderRadius: 30, padding: 12, boxShadow: `0 40px 80px ${rgba(theme.ink, 0.28)}` } },
          React.createElement("div", { style: { display: "flex", gap: 8, padding: "6px 10px 12px" } },
            [0, 1, 2].map((i) => React.createElement("span", { key: i, style: { width: 14, height: 14, borderRadius: 999, background: rgba(theme.bg, i === 0 ? 0.9 : 0.35) } }))),
          React.createElement("div", { style: { borderRadius: 20, overflow: "hidden", height: 556, background: theme.surface } },
            React.createElement(MediaSlot, { src: scene.image, theme, radius: 0, label: "Desktop screenshot \u2014 16:10" }))),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 20, justifyContent: "center" } },
          chips.map((c, i) => React.createElement(Chip, { key: i, theme, i, p: progress }, c))))
    );
  }

  function Montage({ progress, scene, theme }) {
    const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["Home", "Dashboard", "Details", "Mobile"];
    return React.createElement(Frame, { progress, camKind: "right", theme, energy: theme.energy },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 300 } },
        React.createElement("div", { style: { ...M.rise(progress, 0, theme.energy), fontFamily: FH, fontSize: 96, lineHeight: 1.02, color: theme.ink, marginBottom: 46 } }, splitLines(scene.title || "Every corner|of the product.").map((ln, i) => React.createElement("div", { key: i }, ln))),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26 } },
          tiles.slice(0, 4).map((label, i) => {
            const s = M.pop(progress, i + 1);
            return React.createElement("div", { key: i, style: { ...s, height: 290, borderRadius: 28, overflow: "hidden", transformOrigin: "center", boxShadow: `0 24px 50px ${rgba(theme.ink, 0.12)}` } },
              React.createElement(MediaSlot, { src: (scene.images || [])[i], theme, radius: 28, label: `${label} \u2014 desktop` }));
          })))
    );
  }

  function Stats({ progress, scene, theme }) {
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 4, suffix: "×", label: "faster to publish" },
      { to: 92, suffix: "%", label: "watch to the end" },
      { to: 300, suffix: "+", label: "scenes in the garden" },
    ];
    return React.createElement(Frame, { progress, camKind: "zoom", theme, energy: theme.energy },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 360 } },
        React.createElement("div", { style: { ...M.rise(progress, 0, theme.energy), fontFamily: FH, fontSize: 92, lineHeight: 1.02, color: theme.ink, marginBottom: 60 } }, splitLines(scene.title || "Numbers that|keep growing.").map((ln, i) => React.createElement("div", { key: i }, ln))),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 30 } },
          stats.slice(0, 3).map((st, i) => {
            const s = M.rise(progress, i + 1, theme.energy);
            return React.createElement("div", { key: i, style: { ...s, display: "flex", alignItems: "center", gap: 40, background: theme.bg, border: `2px solid ${rgba(theme.ink, 0.1)}`, borderRadius: 30, padding: "34px 44px", boxShadow: `0 16px 36px ${rgba(theme.ink, 0.07)}` } },
              React.createElement("div", { style: { minWidth: 300 } }, React.createElement(Counter, { to: st.to, suffix: st.suffix, p: progress, theme })),
              React.createElement("div", { style: { fontFamily: FB, fontWeight: 600, fontSize: 38, color: rgba(theme.ink, 0.7) } }, st.label));
          })))
    );
  }

  function CTA({ progress, scene, theme }) {
    const btn = M.pop(progress, 2);
    return React.createElement(Frame, { progress, camKind: "scaleout", theme, energy: theme.energy },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 560, textAlign: "left" } },
        React.createElement("div", { style: { ...M.pop(progress, 0), display: "flex", alignItems: "center", gap: 22, marginBottom: 48 } },
          React.createElement("div", { style: { width: 150, height: 150, borderRadius: 999, overflow: "hidden", flex: "none" } },
            React.createElement(MediaSlot, { src: scene.logo, theme, radius: 999, compact: true })),
          !scene.logo && React.createElement("div", { style: { fontFamily: FB, fontWeight: 800, fontSize: 21, letterSpacing: "0.1em", color: rgba(theme.ink, 0.5), maxWidth: 300 } }, "DROP LOGO HERE")),
        React.createElement("div", { style: { ...M.rise(progress, 1, theme.energy), fontFamily: FH, fontSize: 128, lineHeight: 1.0, color: theme.ink } }, splitLines(scene.title || "Let\u2019s grow|your film.").map((ln, i) => React.createElement("div", { key: i }, ln))),
        React.createElement("div", { style: { ...btn, display: "inline-flex", alignItems: "center", gap: 18, marginTop: 54, padding: "28px 52px", borderRadius: 999, background: theme.accent, color: theme.bg, fontFamily: FH, fontSize: 46 } },
          scene.cta || "Start planting",
          React.createElement("svg", { width: 40, height: 40, viewBox: "0 0 24 24", fill: "none", stroke: theme.bg, strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M5 12h14" }), React.createElement("path", { d: "M13 6l6 6-6 6" }))),
        React.createElement("div", { style: { ...M.rise(progress, 3, theme.energy), fontFamily: FB, fontWeight: 700, fontSize: 40, letterSpacing: "0.04em", color: theme.accent700, marginTop: 46 } }, scene.url || "littleacre.studio"))
    );
  }

  const SCENE_MAP = { Hook, Statement, Feature, Montage, Stats, CTA };

  /* ---------- root ---------- */
  const ENERGY = { Calm: 0.6, Lively: 1.0, Bouncy: 1.45 };
  function OrganicGarden() {
    let scenes = [], playback = { mode: "loop" };
    try { scenes = JSON.parse(window.OM_SCENES); } catch (e) {}
    const defaults = (window.OM_TWEAKS && typeof window.OM_TWEAKS === "object") ? window.OM_TWEAKS : {};
    const [t, setTweak] = useTweaks(defaults);
    const W = 1080, H = 1920;
    const theme = {
      W, H, bg: t.bg || "#f5ead8", surface: t.surface || "#ebddc5", ink: t.ink || "#201e1d",
      accent: t.accent || "#c67139", accent700: t.accent || "#8c491a", accent2: t.accent2 || "#7a8a5e",
      accentSoft: "#ffc6a5", brand: t.brand || "Little Acre",
      energy: ENERGY[t.motion] ?? 1.0, density: t.showPetals === false ? 0.28 : (t.density ?? 1),
      gust: t.gust !== false,
    };
    // deep accent for body-size accent text
    theme.accent700 = t.accent === "#7a8a5e" ? "#56633f" : (t.accent === "#8c5cc0" ? "#5b3a86" : "#8c491a");

    return React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: theme.ink } },
      React.createElement(SceneStage, {
        width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.bg,
      }, mapWithTheme(SCENE_MAP, theme)),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Brand name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, {
          label: "Accent", value: t.accent || "#c67139",
          options: ["#c67139", "#7a8a5e", "#8c5cc0", "#b2622d"], onChange: (v) => setTweak("accent", v),
        }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Energy", value: t.motion || "Lively", options: ["Calm", "Lively", "Bouncy"], onChange: (v) => setTweak("motion", v) }),
        React.createElement(TweakToggle, { label: "Drifting petals", value: t.showPetals !== false, onChange: (v) => setTweak("showPetals", v) })
      )
    );
  }

  // bind theme into each scene component
  function mapWithTheme(map, theme) {
    const out = {};
    for (const k in map) { const C = map[k]; out[k] = (props) => React.createElement(C, { ...props, theme }); }
    return out;
  }

  window.OrganicGarden = OrganicGarden;
})();
