/* studio-launch-film.jsx — "Studio Launch": premium SaaS launch film (9:16, loop).

   Every motion in here comes from window.KFMotion (motion-presets.js) so the
   vocabulary is consistent: blur->sharp word staggers, 3D card rises that never
   park, a continuously moving camera, and mask/camera cuts instead of crossfades.
   Organic tokens on a warm dark house. Exposes window.StudioLaunch.            */
(function () {
  const { SceneStage } = window;
  const { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakText, TweakRadio, TweakToggle } = window;
  const M = window.KFMotion;
  const { clamp01, lerp, seg, E, merge } = M;

  const AMBIENT = 1.6;
  const useTimeline = () => {
    const tl = window.useTimeline();
    return Object.assign({}, tl, { time: tl.time * AMBIENT });
  };

  const FH = '"Caprasimo", Georgia, serif';
  const FB = '"Figtree", system-ui, sans-serif';
  const W = 1080, H = 1920, PAD = 76;
  const splitLines = (t) => String(t == null ? "" : t).split("|");
  const mix = (a, b, t) => {
    const p = (h) => {
      const x = String(h || "#000").replace("#", "");
      const n = parseInt(x.length === 3 ? x.split("").map((c) => c + c).join("") : x, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const A = p(a), B = p(b);
    const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  };
  const rgba = (hex, a) => {
    const h = String(hex || "#000").replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };

  /* ---------- ambient layer ----------
     A colour field, not a tint: six mesh blobs and three aurora bands drift across each
     other in six different hues, over a rotating sweep, expanding rings, parallax motes,
     vignette and moving grain. Every hue is an Organic ramp step, and the field is built
     from the MID and DEEP steps (400-700) rather than the light ones — cream type sits
     directly on this ground, so the composite has to stay under luminance 0.24 to hold
     3:1. The light steps appear only as small motes, where area is too small to matter. */
  const RAMP = {
    a400: "#f6a06b", a500: "#d67f48", a600: "#b2622d", a700: "#8c491a",
    b400: "#aebf92", b500: "#8fa073", b600: "#728157", b700: "#56633f",
    a300: "#ffc6a5", b300: "#ccdbb2",
  };

  /* The ground is a user tweak, so the field cannot hardcode one ramp family: set the
     ground to a terracotta step and a terracotta field collapses into it (same hue, only
     lighter — reads as tonal warmth, not colour). fieldPalette derives the voices from the
     CURRENT ground. Whichever Organic family is further from the ground hue LEADS, carrying
     the mid and deep steps that give the field its hue contrast. The nearer family cannot
     compete on hue, so it is demoted to its light steps only, separating from the ground by
     lightness instead — Organic has just two accent ramps, so inventing a third hue to force
     contrast would leave the system, while a light-vs-deep pairing stays inside it. */
  const MIN_DELTA = 26;

  function hexToHsl(hex) {
    const n = hex.replace("#", "");
    const r = parseInt(n.slice(0, 2), 16) / 255, g = parseInt(n.slice(2, 4), 16) / 255, b = parseInt(n.slice(4, 6), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    const l = (mx + mn) / 2;
    return { h, s: d ? d / (1 - Math.abs(2 * l - 1)) : 0, l };
  }

  function relLum(hex) {
    const n = hex.replace("#", "");
    const v = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }

  /* Hand-tuned alphas cannot hold across an arbitrary ground: a deep terracotta ground left
     cream type at 2.90:1, a sand ground left ink type at 3.00:1. So each large layer's alpha
     is FITTED to the contrast budget instead of guessed — the largest alpha whose composite
     still clears 3:1 against whichever text colour the ground selected. Note the budget flips
     direction: over a dark ground the composite must stay light-capped, over a light ground it
     must stay above a floor, since the text is ink there. */
  function fitAlpha(colorHex, groundHex, capMax, limit, alpha) {
    const c = colorHex.replace("#", ""), g = groundHex.replace("#", "");
    const ca = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
    const ga = [0, 2, 4].map((i) => parseInt(g.slice(i, i + 2), 16));
    const lumAt = (t) => {
      const v = ca.map((x, i) => (x * t + ga[i] * (1 - t)) / 255)
        .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const ok = (t) => (capMax ? lumAt(t) <= limit : lumAt(t) >= limit);
    if (ok(alpha)) return alpha;
    let lo = 0, hi = alpha;
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
    return lo;
  }

  /* The field's alpha fit budgets contrast for theme.paper ONLY, so accentText/accent2Text —
     fixed cream mixes of 0.34/0.44 — sat outside it: brightening the field lifted the backdrop
     under accent type with nothing watching, and the Feature chips fell to 2.83:1. Both now
     derive from the SAME budget the field is fitted to, solving the mix toward the text colour
     until they clear 3:1 against the worst lit backdrop. Accent type therefore cannot fall out
     of contrast when the field intensity or the ground changes.

     Margins solved against EVERY overlapping pair across 14 grounds, not just the two extremes:
     0.97/1.03 left four grounds at 2.91-2.97:1 because the same-colour stack model under-predicts
     mixed pairs. 0.80/1.20 is the loosest pair that holds 3:1 everywhere. */
  function groundBudget(paperHex) {
    const capMax = paperHex.toLowerCase() === "#f5ead8";
    const lp = relLum(paperHex);
    // Some type sits over a translucent chip (rgba(paper, 0.08)) rather than the bare ground,
    // which lifts its local backdrop past the field's ceiling — that overlay is now inside the
    // budget, so the ceiling is whatever leaves the CHIP composite at 3:1, not the bare ground.
    const raw = capMax ? (0.244 - 0.08 * lp) / 0.92 : (0.133 - 0.08 * lp) / 0.92;
    return { capMax, limit: capMax ? Math.min(0.244 * 0.8, raw) : Math.max(0.133 * 1.2, raw) };
  }

  const contrastOf = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  function hueDist(a, b) {
    const d = Math.abs(((a - b) % 360 + 360) % 360);
    return Math.min(d, 360 - d);
  }

  /* Alpha-blending is not hue-preserving: a low-chroma colour laid over a high-chroma ground
     at moderate alpha pulls toward the GROUND's hue, so it lightens instead of recolouring.
     Sage mid (HSL sat 0.19-0.26) over this terracotta ground (sat 0.69) at 0.4 shifted the
     composite by only 9 degrees. The lead therefore runs at high alpha, where the composite
     is essentially the lead colour itself. That is only safe on the DEEP ramp steps: sage
     mid is luminance 0.322, over the 0.244 ceiling cream type needs, while sage 600 is 0.200
     and sage 700 lower still. So the lead carries 600/700 at 0.85-0.9 and the hue survives. */
  function fieldPalette(groundHex) {
    const gh = hexToHsl(groundHex).h;
    const TERRA = { strong: RAMP.a600, deep: RAMP.a700, light: RAMP.a400, pale: RAMP.a300 };
    const SAGE = { strong: RAMP.b600, deep: RAMP.b700, light: RAMP.b400, pale: RAMP.b300 };
    const dT = hueDist(gh, hexToHsl(RAMP.a500).h), dS = hueDist(gh, hexToHsl(RAMP.b500).h);
    const lead = dT >= dS ? TERRA : SAGE;
    const near = dT >= dS ? SAGE : TERRA;
    const clears = Math.min(dT, dS) >= MIN_DELTA;
    // the nearer family cannot win on hue; it separates by lightness instead
    const foil = clears ? near : { strong: near.light, deep: near.light, light: near.pale, pale: near.pale };
    return { lead, foil, foilMuted: !clears };
  }

  function Ambient({ t, theme }) {
    const a = theme.amb;
    // x, y, radius, colour, alpha, drift speed — deliberately unequal so the field never
    // settles into a symmetric pattern
    const P = fieldPalette(theme.ground);
    /* Blobs overlap by construction, so a per-layer cap is not enough — two layers each
       inside the budget can stack past it (measured 2.43:1 on a deep terracotta ground).
       fit therefore solves for the EFFECTIVE alpha of two stacked layers and derives the
       per-layer value from it: alpha_eff = 1-(1-a)^2, so a = 1-sqrt(1-alpha_eff). Layers whose
       colour is already inside the budget are untouched, which is why the deep leads keep
       full strength and only the bright steps get clamped. */
    const { capMax, limit: LIMIT } = groundBudget(theme.paper);
    const fit = (c, alpha) => {
      const eff = fitAlpha(c, theme.ground, capMax, LIMIT, 1);
      const per = 1 - Math.sqrt(Math.max(0, 1 - eff));
      return Math.min(alpha, per);
    };
    const mesh = [
      { x: 0.16, y: 0.18, r: 520, c: P.lead.strong, o: 0.88, s: 0.13 },
      { x: 0.86, y: 0.30, r: 560, c: P.foil.strong, o: P.foilMuted ? 0.42 : 0.72, s: -0.1 },
      { x: 0.46, y: 0.58, r: 640, c: P.lead.deep, o: 0.9, s: 0.077 },
      { x: 0.08, y: 0.68, r: 420, c: P.foil.deep, o: P.foilMuted ? 0.38 : 0.78, s: -0.16 },
      { x: 0.92, y: 0.82, r: 500, c: P.lead.light, o: 0.5, s: 0.11 },
      { x: 0.34, y: 0.96, r: 460, c: P.foil.light, o: P.foilMuted ? 0.3 : 0.44, s: -0.13 },
    ];
    const bands = [
      { y: 0.22, h: 300, c: P.foil.light, o: P.foilMuted ? 0.24 : 0.34, sp: 0.055, rot: -13 },
      { y: 0.52, h: 260, c: P.lead.strong, o: 0.4, sp: -0.042, rot: 9 },
      { y: 0.78, h: 320, c: P.foil.strong, o: P.foilMuted ? 0.22 : 0.32, sp: 0.033, rot: -7 },
    ];
    return React.createElement("div", { style: { position: "absolute", inset: 0, overflow: "hidden" } },
      React.createElement("div", { style: { position: "absolute", inset: 0, background: theme.ground } }),

      // mesh gradient field — the colour itself
      mesh.map((b, i) => {
        const dx = Math.sin(t * b.s + i * 1.4) * 120;
        const dy = Math.cos(t * b.s * 0.8 + i * 2.1) * 96;
        const pulse = 1 + Math.sin(t * 0.26 + i * 1.1) * 0.1;
        const oa = fit(b.c, b.o * a);
        return React.createElement("div", {
          key: "m" + i,
          style: {
            position: "absolute", left: W * b.x - b.r, top: H * b.y - b.r,
            width: b.r * 2, height: b.r * 2, borderRadius: "50%",
            background: `radial-gradient(circle at 42% 40%, ${rgba(b.c, oa)}, ${rgba(b.c, oa * 0.45)} 42%, ${rgba(b.c, 0)} 70%)`,
            transform: `translate(${dx}px, ${dy}px) scale(${pulse})`,
            filter: "blur(24px)", willChange: "transform",
          },
        });
      }),

      // aurora bands sweeping across, each at its own speed and angle
      bands.map((b, i) => {
        const span = W * 2.3;
        const x = ((t * b.sp * span) % span + span) % span - span * 0.62;
        const yb = Math.sin(t * 0.17 + i * 1.7) * 44;
        const oa = fit(b.c, b.o * a);
        return React.createElement("div", {
          key: "n" + i,
          style: {
            position: "absolute", left: 0, top: H * b.y - b.h / 2, width: span, height: b.h,
            background: `linear-gradient(90deg, ${rgba(b.c, 0)} 0%, ${rgba(b.c, oa)} 32%, ${rgba(b.c, oa * 0.7)} 54%, ${rgba(b.c, 0)} 88%)`,
            transform: `translate(${x}px, ${yb}px) rotate(${b.rot}deg)`,
            filter: "blur(58px)", willChange: "transform",
          },
        });
      }),

      // rotating sweep tying the hues together
      React.createElement("div", {
        style: {
          position: "absolute", left: -W * 0.45, top: -W * 0.1, width: W * 1.9, height: W * 1.9,
          background: `conic-gradient(from ${(t * 5) % 360}deg, ${rgba(P.lead.strong, 0.3 * a)}, transparent 22%, ${rgba(P.foil.strong, 0.26 * a)} 44%, transparent 62%, ${rgba(P.lead.deep, 0.3 * a)} 80%, transparent 96%)`,
          filter: "blur(70px)", willChange: "background",
        },
      }),

      // rings expanding out of the lower third
      [0, 1, 2, 3].map((i) => {
        const ph = ((t / 3.4) + i * 0.25) % 1;
        const r = lerp(200, 980, ph);
        const op = Math.sin(ph * Math.PI) * 0.26 * a;
        return React.createElement("div", {
          key: "r" + i,
          style: {
            position: "absolute", left: W * 0.5 - r, top: H * 0.62 - r,
            width: r * 2, height: r * 2, borderRadius: "50%",
            border: `3px solid ${rgba(theme.paper, op)}`, willChange: "width, height",
          },
        });
      }),

      // parallax motes: deterministic seeds so they never reshuffle between frames
      Array.from({ length: 34 }).map((_, i) => {
        const seed = i * 12.9898;
        const bx = Math.sin(seed) * 0.5 + 0.5;
        const by = Math.cos(seed * 1.7) * 0.5 + 0.5;
        const depth = 0.35 + ((i % 5) / 5) * 0.65;
        const size = 4 + depth * 9;
        const y = ((by * H - t * 16 * depth) % (H + 90) + H + 90) % (H + 90) - 45;
        const x = bx * W + Math.sin(t * 0.3 * depth + i) * 44;
        const tw = 0.5 + 0.5 * Math.sin(t * 1.1 + i * 2.3);
        return React.createElement("div", {
          key: "p" + i,
          style: {
            position: "absolute", left: x, top: y, width: size, height: size, borderRadius: "50%",
            background: i % 3 === 0 ? P.lead.pale : i % 3 === 1 ? P.foil.pale : theme.paper,
            opacity: (0.22 + tw * 0.4) * depth * a,
            filter: depth > 0.8 ? "none" : "blur(1.5px)",
            willChange: "transform, opacity",
          },
        });
      }),

      React.createElement("div", {
        style: {
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `radial-gradient(120% 80% at 50% 40%, transparent 38%, ${rgba("#000000", 0.36)} 100%)`,
        },
      }),
      React.createElement("div", {
        style: {
          position: "absolute", inset: 0, opacity: 0.055, mixBlendMode: "overlay",
          backgroundImage:
            "radial-gradient(rgba(255,255,255,.9) 1px, transparent 1px), radial-gradient(rgba(255,255,255,.7) 1px, transparent 1px)",
          backgroundSize: "4px 4px, 7px 7px",
          backgroundPosition: `${(t * 9) % 4}px ${(t * 6) % 4}px, ${(t * -7) % 7}px ${(t * 5) % 7}px`,
        },
      }));
  }

  function Chrome({ theme }) {
    return React.createElement("div", {
      style: { position: "absolute", top: 62, left: PAD, display: "flex", alignItems: "center", gap: 16, zIndex: 9 },
    },
      React.createElement("div", { style: { width: 34, height: 34, borderRadius: 999, background: theme.accent } }),
      React.createElement("div", {
        style: { fontFamily: FB, fontWeight: 800, fontSize: 26, letterSpacing: "0.2em", textTransform: "uppercase", color: rgba(theme.paper, 0.82) },
      }, theme.brand));
  }

  /* ---------- frame: ambient + parallax + moving camera + mask cut ---------- */
  function Frame({ progress: p, theme, note, children }) {
    const clock = useTimeline().time;
    const sc = window.useScene ? window.useScene() : { index: 0 };
    const cam = M.slowCameraPush(p, clock, M.cameraFor(sc.index), { amount: theme.energy });
    const wipe = M.maskedSceneTransition(p, M.wipeFor(sc.index));
    return React.createElement("div", {
      style: merge({ position: "absolute", inset: 0, overflow: "hidden", fontFamily: FB, background: theme.ground }, wipe),
    },
      React.createElement("div", { style: M.parallaxLayers(p, clock, 0.25, { amount: theme.energy }) },
        React.createElement(Ambient, { t: clock, theme })),
      // Scrim between ambience and content. The ambient layer can brighten locally where a
      // blob centre and the gradient sweep coincide, which would drop accent type under 3:1;
      // this holds the backdrop behind text predictable while the motion stays visible.
      React.createElement("div", {
        style: {
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `linear-gradient(180deg, ${rgba(theme.ground, 0.16)} 0%, ${rgba(theme.ground, 0.08)} 44%, ${rgba(theme.ground, 0.2)} 100%)`,
        },
      }),
      React.createElement("div", {
        style: merge({ position: "absolute", inset: 0, transformStyle: "preserve-3d", willChange: "transform" }, cam),
      }, children),
      React.createElement(Chrome, { theme }),
      React.createElement(Rail, { note, theme, p }));
  }

  // lower third: keyline that draws in, plus a small caption
  function Rail({ note, theme, p }) {
    const draw = E.power4Out(clamp01(seg(p, 0.1, 0.4)));
    return React.createElement("div", {
      style: { position: "absolute", left: PAD, right: PAD, bottom: 92, display: "flex", alignItems: "center", gap: 24, zIndex: 8 },
    },
      React.createElement("div", {
        style: {
          height: 3, flex: 1, background: rgba(theme.paper, 0.2),
          transform: `scaleX(${draw})`, transformOrigin: "left", borderRadius: 999,
        },
      }),
      React.createElement("div", {
        style: merge({
          fontFamily: FB, fontWeight: 800, fontSize: 26, letterSpacing: "0.24em",
          textTransform: "uppercase", color: rgba(theme.paper, 0.55), whiteSpace: "nowrap",
        }, M.wordStaggerBlur(p, 0, { start: 0.16, blur: 8, y: 14 })),
      }, note),
      React.createElement("div", {
        style: { width: 12, height: 12, borderRadius: 999, flex: "none", background: theme.accent, opacity: draw },
      }));
  }

  /* ---------- headline: word stagger blur, glow pulse on the marked word ---------- */
  function Headline({ text, p, theme, size, mark, color, hi, start, align }) {
    const clock = useTimeline().time;
    const lines = splitLines(text);
    let wi = 0;
    return React.createElement("div", { style: { textAlign: align || "left" } },
      lines.map((ln, li) =>
        React.createElement("div", { key: li, style: { lineHeight: 1.04, fontSize: size, display: "flex", flexWrap: "wrap", gap: "0 0.26em", justifyContent: align === "center" ? "center" : "flex-start" } },
          ln.trim().split(/\s+/).map((word, k) => {
            const idx = wi++;
            const base = M.wordStaggerBlur(p, idx, { start: start != null ? start : 0.02, stagger: 0.045 });
            const isHi = mark && word.replace(/[.,!?]/g, "").toLowerCase() === String(mark).replace(/[.,!?]/g, "").toLowerCase();
            const glow = isHi ? M.headlineGlowPulse(clock, rgba(hi || theme.accentText, 0.5), { phase: idx }) : null;
            return React.createElement("span", {
              key: k,
              style: merge({
                display: "inline-block", fontFamily: FH, fontSize: size, color: isHi ? (hi || theme.accentText) : (color || theme.paper),
                willChange: "transform, filter",
              }, base, glow),
            }, word);
          }))));
  }

  /* ---------- screenshot drop target ---------- */
  /* Screenshot drop target. The label treatment is chosen from the slot's own measured
     width, not passed in by hand — a small slot (logo mark) shows the icon alone rather
     than wrapping a full caption wall-to-wall, and type never drops below the 24px floor. */
  function MediaSlot({ src, theme, label, radius = 14 }) {
    const ref = React.useRef(null);
    const [w, setW] = React.useState(0);
    React.useLayoutEffect(() => {
      const n = ref.current;
      if (!n) return;
      const next = n.clientWidth;
      setW((prev) => (Math.abs(prev - next) > 1 ? next : prev));
    });
    if (src) {
      return React.createElement("div", { style: { position: "absolute", inset: 0, borderRadius: radius, overflow: "hidden" } },
        React.createElement("img", { src, alt: "", style: { width: "100%", height: "100%", objectFit: "cover", display: "block" } }));
    }
    const compact = w > 0 && w < 300;
    return React.createElement("div", {
      ref,
      style: {
        position: "absolute", inset: 0, borderRadius: radius,
        border: `3px dashed ${rgba(theme.cardInk, 0.4)}`, background: rgba(theme.cardInk, 0.05),
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: compact ? 0 : 12, padding: compact ? 12 : 20,
      },
    },
      React.createElement("div", {
        style: {
          width: compact ? 62 : 54, height: compact ? 50 : 44, borderRadius: 8,
          border: `3px solid ${rgba(theme.cardInk, 0.46)}`, flex: "none",
        },
      }),
      !compact && React.createElement("div", {
        style: {
          fontFamily: FB, fontWeight: 800, fontSize: 26, letterSpacing: "0.16em",
          color: rgba(theme.cardInk, 0.74), textTransform: "uppercase", textAlign: "center",
        },
      }, "Drop image to replace"),
      !compact && label && React.createElement("div", {
        style: { fontFamily: FB, fontWeight: 600, fontSize: 24, color: rgba(theme.cardInk, 0.64), textAlign: "center" },
      }, label));
  }

  /* ---------- surface card: 3D rise, floating idle, animated edge light ---------- */
  function Card({ p, t, theme, style, children, index = 0, start, extra }) {
    return React.createElement("div", {
      style: merge(
        {
          position: "relative", borderRadius: 26, background: theme.surface, overflow: "hidden",
          transformStyle: "preserve-3d", willChange: "transform, filter",
        },
        M.cardRise3D(p, { start }),
        M.floatingIdle(t, index, { period: 5.4 }),
        extra,
        style
      ),
    },
      children,
      React.createElement("div", {
        style: merge({
          position: "absolute", top: 0, left: 0, width: "42%", height: 5,
          background: `linear-gradient(90deg, transparent, ${rgba("#ffffff", 0.95)}, transparent)`,
          pointerEvents: "none",
        }, M.lightSweep(t, { period: 4, strength: 0.55 })),
      }));
  }

  function Cursor({ x, y, theme, cursorStyle, rippleStyle }) {
    return React.createElement("div", { style: { position: "absolute", left: x, top: y, zIndex: 7, pointerEvents: "none" } },
      React.createElement("div", {
        style: merge({
          position: "absolute", left: -46, top: -46, width: 92, height: 92, borderRadius: 999,
          background: rgba(theme.accent, 0.5),
        }, rippleStyle),
      }),
      React.createElement("div", {
        style: merge({
          width: 0, height: 0,
          borderLeft: `18px solid ${theme.paper}`, borderRight: "12px solid transparent",
          borderBottom: "12px solid transparent", borderTop: `24px solid ${theme.paper}`,
          filter: "drop-shadow(0 4px 10px rgba(0,0,0,.45))", transformOrigin: "0 0",
        }, cursorStyle),
      }));
  }

  /* ================= scenes ================= */

  function Hook({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const lines = splitLines(scene.title || "Ship the film,|not the|slide deck");
    const heroLine = lines[lines.length - 1];
    return React.createElement(Frame, { progress: p, theme, note: scene.note || "Made in one file" },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 380 } },
        React.createElement("div", {
          style: merge({
            fontFamily: FB, fontWeight: 800, fontSize: 25, letterSpacing: "0.26em",
            textTransform: "uppercase", color: theme.accentText, marginBottom: 40,
          }, M.wordStaggerBlur(p, 0, { start: 0, blur: 10, y: 20 })),
        }, scene.kicker || "A launch film in one file"),
        lines.slice(0, -1).map((ln, i) =>
          React.createElement(Headline, { key: i, text: ln, p, theme, size: 104, start: 0.04 + i * 0.05 })),
        // hero line: outline first, then the brand colour fills it
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", fontSize: 104, gap: "0 0.24em", marginTop: 6 } },
          heroLine.trim().split(/\s+/).map((word, i) =>
            React.createElement("span", {
              key: i,
              style: merge(
                { display: "inline-block", fontFamily: FH, fontSize: 104, willChange: "transform, filter" },
                M.outlineFillReveal(p, theme.accentText, { start: 0.16 + i * 0.05, fillAt: 0.34 + i * 0.05 })
              ),
            }, word))),
        React.createElement("div", {
          style: merge({
            fontFamily: FB, fontWeight: 500, fontSize: 38, color: rgba(theme.paper, 0.68),
            marginTop: 46, maxWidth: 780, lineHeight: 1.4,
          }, M.wordStaggerBlur(p, 7, { start: 0.3, blur: 12, y: 26 })),
        }, scene.sub || "Drop in your screens. Edit every word. Publish in an hour.")),
      React.createElement(Card, {
        p, t, theme, index: 1, start: 0.3,
        style: { position: "absolute", left: PAD, right: PAD, top: 1180, height: 520, padding: 16 },
      }, React.createElement(MediaSlot, { src: scene.image, theme, label: "Desktop screenshot — 16:10" })));
  }

  function Statement({ progress: p, scene, theme }) {
    return React.createElement(Frame, { progress: p, theme, note: scene.note || "Why it matters" },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 700 } },
        React.createElement("div", {
          style: merge({ width: 96, height: 8, borderRadius: 999, background: theme.accent, marginBottom: 48 },
            M.wordStaggerBlur(p, 0, { start: 0, blur: 6, y: 16 })),
        }),
        React.createElement(Headline, { text: scene.title || "Most launch videos|are a slideshow|with music.", p, theme, size: 96, mark: scene.mark, hi: theme.accentText }),
        React.createElement("div", {
          style: merge({
            fontFamily: FB, fontWeight: 500, fontSize: 38, color: rgba(theme.paper, 0.66),
            marginTop: 48, maxWidth: 800, lineHeight: 1.4,
          }, M.wordStaggerBlur(p, 6, { start: 0.34, blur: 12, y: 26 })),
        }, scene.sub || "Motion is the whole difference between watched and scrolled.")));
  }

  /* the onboarding card: 3D entrance, idle float, cursor click, UI reacts */
  function Onboard({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const rows = (scene.rows && scene.rows.length) ? scene.rows : ["Connect your product", "Pick a template", "Publish the film"];
    const cur = M.cursorClickRipple(p, [[820, 1500], [560, 1360], [300, 1236]], { start: 0.16, arrive: 0.56 });
    const toggled = clamp01(seg(p, 0.58, 0.68));
    return React.createElement(Frame, { progress: p, theme, note: scene.note || "Onboarding" },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 300 } },
        React.createElement(Headline, { text: scene.title || "Set up in|three steps.", p, theme, size: 92, mark: scene.mark || "three", hi: theme.accent2Text })),
      React.createElement(Card, {
        p, t, theme, index: 0, start: 0.12,
        style: { position: "absolute", left: PAD, right: PAD, top: 660, padding: 46 },
      },
        React.createElement("div", {
          style: { fontFamily: FB, fontWeight: 800, fontSize: 24, letterSpacing: "0.2em", textTransform: "uppercase", color: rgba(theme.cardInk, 0.7), marginBottom: 34 },
        }, scene.cardLabel || "Getting started"),
        rows.slice(0, 3).map((r, i) => {
          const done = i >= rows.length - 1 ? toggled : 1;
          const tick = clamp01(seg(p, 0.2 + i * 0.09, 0.34 + i * 0.09));
          return React.createElement("div", {
            key: i,
            style: merge({
              display: "flex", alignItems: "center", gap: 26, padding: "26px 4px",
              borderBottom: i < 2 ? `2px solid ${rgba(theme.cardInk, 0.12)}` : "none",
            }, M.scrollReveal(p, i, { start: 0.18, stagger: 0.06 }), i === 2 ? cur.targetStyle : null),
          },
            React.createElement("div", {
              style: {
                width: 54, height: 54, borderRadius: 999, flex: "none",
                background: done > 0.5 ? theme.accent2 : rgba(theme.cardInk, 0.1),
                display: "flex", alignItems: "center", justifyContent: "center",
                transform: `scale(${lerp(0.86, 1, Math.max(tick, done))})`,
              },
            },
              React.createElement("svg", { width: 28, height: 28, viewBox: "0 0 24 24", fill: "none" },
                React.createElement("path", {
                  d: "M5 12.5 10 17.5 19 7",
                  stroke: done > 0.5 ? theme.surface : rgba(theme.cardInk, 0.36),
                  strokeWidth: 2.75, strokeLinecap: "round", strokeLinejoin: "round",
                  strokeDasharray: 26, strokeDashoffset: 26 * (1 - Math.max(tick, done)),
                }))),
            React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 38, color: theme.cardInk } }, r));
        }),
        React.createElement("div", {
          style: merge({
            marginTop: 40, display: "inline-flex", alignItems: "center", gap: 14,
            padding: "22px 42px", borderRadius: 999, background: theme.accent, color: theme.surface,
            fontFamily: FB, fontWeight: 800, fontSize: 34,
          }, M.scrollReveal(p, 3, { start: 0.2 }), M.buttonPress(t, { period: 3.4 })),
        }, scene.cta || "Continue")),
      React.createElement(Cursor, { x: cur.x, y: cur.y, theme, cursorStyle: cur.cursorStyle, rippleStyle: cur.rippleStyle }));
  }

  /* two cards handing off: previous sinks back and left, next slides over */
  function Stack({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const tiles = (scene.tiles && scene.tiles.length) ? scene.tiles : ["Dashboard", "Insights"];
    const st = M.cardStackTransition(p, { at: 0.5, dur: 0.24 });
    return React.createElement(Frame, { progress: p, theme, note: scene.note || "Screen by screen" },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 300 } },
        React.createElement(Headline, { text: scene.title || "Every screen,|one after|another.", p, theme, size: 92, mark: scene.mark, hi: theme.accentText })),
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 740, height: 720, perspective: 1400 } },
        React.createElement(Card, {
          p, t, theme, index: 0, start: 0.1, extra: st.outgoing,
          style: { position: "absolute", inset: 0, padding: 16 },
        },
          React.createElement(MediaSlot, { src: (scene.images || [])[0], theme, label: tiles[0] + " — desktop" })),
        React.createElement("div", { style: merge({ position: "absolute", inset: 0 }, st.incoming) },
          React.createElement(Card, {
            p, t, theme, index: 1, start: 0.44, shadow: true,
            style: { position: "absolute", inset: 0, padding: 16 },
          },
            React.createElement(MediaSlot, { src: (scene.images || [])[1], theme, label: tiles[1] + " — desktop" })))));
  }

  function Feature({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const chips = (scene.chips && scene.chips.length) ? scene.chips : ["Drop in your shots", "Edit every word", "Recolour in one tap"];
    return React.createElement(Frame, { progress: p, theme, note: scene.note || "What you get" },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 280 } },
        React.createElement(Headline, { text: scene.title || "Your product,|in focus.", p, theme, size: 96, mark: scene.mark, hi: theme.accentText })),
      React.createElement(Card, {
        p, t, theme, index: 0, start: 0.14,
        style: { position: "absolute", left: PAD, right: PAD, top: 640, height: 590, padding: 16 },
      }, React.createElement(MediaSlot, { src: scene.image, theme, label: "Desktop screenshot — 16:10" })),
      React.createElement("div", {
        style: { position: "absolute", left: PAD, right: PAD, top: 1300, display: "flex", flexDirection: "column", gap: 20, alignItems: "flex-start" },
      },
        chips.slice(0, 3).map((c, i) =>
          React.createElement("div", {
            key: i,
            style: merge({
              display: "inline-flex", alignItems: "center", gap: 18, padding: "20px 36px", borderRadius: 999,
              background: rgba(theme.paper, 0.08), border: `2px solid ${rgba(theme.paper, 0.16)}`,
              color: theme.paper, fontFamily: FB, fontWeight: 700, fontSize: 34,
            }, M.scrollReveal(p, i, { start: 0.36, stagger: 0.07 }), M.floatingIdle(t, i + 2, { period: 6, y: 3, rot: 0.3 })),
          },
            React.createElement("span", { style: { color: theme.paper, fontFamily: FH, fontSize: 26 } }, "0" + (i + 1)),
            c))));
  }

  /* only the changing word animates — the rest of the line holds still */
  function Morph({ progress: p, scene, theme }) {
    const steps = (scene.steps && scene.steps.length) ? scene.steps : ["Applying", "Approved", "Interview", "Offer"];
    const m = M.wordMorph(p, steps);
    return React.createElement(Frame, { progress: p, theme, note: scene.note || "Live copy" },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 720 } },
        React.createElement("div", {
          style: merge({ fontFamily: FH, fontSize: 92, color: theme.paper, lineHeight: 1.05 },
            M.wordStaggerBlur(p, 0, { start: 0, blur: 12, y: 26 })),
        }, scene.prefix || "Status:"),
        React.createElement("div", { style: { height: 150, marginTop: 18, position: "relative" } },
          React.createElement("div", {
            style: merge({
              position: "absolute", left: 0, top: 0, fontFamily: FH, fontSize: 128,
              color: theme.accentText, whiteSpace: "nowrap", willChange: "transform, filter",
            }, m.style),
          }, m.word)),
        React.createElement("div", {
          style: { display: "flex", gap: 14, marginTop: 54 },
        }, steps.map((s, i) =>
          React.createElement("div", {
            key: i,
            style: {
              flex: 1, height: 10, borderRadius: 999,
              background: i <= m.index ? theme.accent : rgba(theme.paper, 0.16),
              transform: `scaleY(${i === m.index ? 1.6 : 1})`, transformOrigin: "center",
            },
          }))),
        React.createElement("div", {
          style: merge({ fontFamily: FB, fontWeight: 500, fontSize: 36, color: rgba(theme.paper, 0.62), marginTop: 44, maxWidth: 760 },
            M.wordStaggerBlur(p, 4, { start: 0.3, blur: 10, y: 22 })),
        }, scene.sub || "One word changes. Everything else stays put.")));
  }

  function Stats({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const stats = (scene.stats && scene.stats.length) ? scene.stats : [
      { to: 4, suffix: "×", label: "faster to publish" },
      { to: 92, suffix: "%", label: "watch to the end" },
      { to: 1, suffix: "hr", label: "start to finish" },
    ];
    const cols = [theme.accentText, theme.paper, theme.accent2Text];
    return React.createElement(Frame, { progress: p, theme, note: scene.note || "By the numbers" },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 340 } },
        React.createElement(Headline, { text: scene.title || "The numbers|behind it.", p, theme, size: 92, mark: scene.mark, hi: theme.accentText })),
      React.createElement("div", {
        style: { position: "absolute", left: PAD, right: PAD, top: 700, display: "flex", flexDirection: "column", gap: 46 },
      },
        stats.slice(0, 3).map((st, i) => {
          const c = M.counterAnimate(p, st.to, { start: 0.14 + i * 0.07, end: 0.62 + i * 0.07 });
          return React.createElement("div", {
            key: i,
            style: merge({ display: "flex", alignItems: "baseline", gap: 32 },
              M.scrollReveal(p, i, { start: 0.12, stagger: 0.08 }),
              M.floatingIdle(t, i, { period: 6.5, y: 3, rot: 0.15 })),
          },
            React.createElement("div", {
              style: {
                fontFamily: FH, fontSize: 168, lineHeight: 0.9, color: cols[i],
                fontVariantNumeric: "tabular-nums", minWidth: 300,
              },
            }, c.text, React.createElement("span", { style: { fontSize: 76 } }, st.suffix)),
            React.createElement("div", {
              style: { fontFamily: FB, fontWeight: 600, fontSize: 38, color: rgba(theme.paper, 0.72), maxWidth: 480, lineHeight: 1.3 },
            }, st.label));
        })));
  }

  /* a list that actually scrolls rather than teleporting */
  function List({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    const items = (scene.items && scene.items.length) ? scene.items : [
      "Home", "Pricing", "Dashboard", "Insights", "Settings", "Billing", "Team", "Integrations",
    ];
    const rowH = 132;
    // measure the real track/viewport heights instead of guessing a visible row count
    const clipRef = React.useRef(null), trackRef = React.useRef(null);
    const [geo, setGeo] = React.useState({ track: 0, view: 0 });
    React.useLayoutEffect(() => {
      const c = clipRef.current, tr = trackRef.current;
      if (!c || !tr) return;
      const track = tr.scrollHeight, view = c.clientHeight;
      setGeo((g) => (Math.abs(g.track - track) > 1 || Math.abs(g.view - view) > 1 ? { track, view } : g));
    });
    const offset = M.listScroll(p, geo.track, geo.view, { start: 0.24, end: 0.94 });
    return React.createElement(Frame, { progress: p, theme, note: scene.note || "Your screens" },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 300 } },
        React.createElement(Headline, { text: scene.title || "Every screen|you have.", p, theme, size: 92, mark: scene.mark, hi: theme.accent2Text })),
      React.createElement(Card, {
        p, t, theme, index: 0, start: 0.12,
        style: { position: "absolute", left: PAD, right: PAD, top: 660, height: 900, padding: 0 },
      },
        React.createElement("div", { ref: clipRef, style: { position: "absolute", inset: 0, overflow: "hidden" } },
          React.createElement("div", { ref: trackRef, style: { transform: `translateY(${offset}px)`, willChange: "transform" } },
            items.map((it, i) =>
              React.createElement("div", {
                key: i,
                style: merge({
                  height: rowH, display: "flex", alignItems: "center", gap: 28, padding: "0 44px",
                  borderBottom: `2px solid ${rgba(theme.cardInk, 0.1)}`,
                }, M.scrollReveal(p, Math.min(i, 5), { start: 0.14, stagger: 0.05 })),
              },
                React.createElement("div", {
                  style: { width: 66, height: 66, borderRadius: 16, flex: "none", background: i % 2 ? rgba(theme.accent2, 0.22) : rgba(theme.accent, 0.22) },
                }),
                React.createElement("div", { style: { fontFamily: FB, fontWeight: 700, fontSize: 40, color: theme.cardInk } }, it),
                React.createElement("div", {
                  style: { marginLeft: "auto", fontFamily: FB, fontWeight: 700, fontSize: 28, color: rgba(theme.cardInk, 0.64) },
                }, "Ready"))))),
        React.createElement("div", {
          style: {
            position: "absolute", left: 0, right: 0, bottom: 0, height: 150, pointerEvents: "none",
            background: `linear-gradient(180deg, ${rgba(theme.surface, 0)}, ${theme.surface})`,
          },
        })));
  }

  function CTA({ progress: p, scene, theme }) {
    const t = useTimeline().time;
    return React.createElement(Frame, { progress: p, theme, note: scene.note || "Start today" },
      React.createElement("div", { style: { position: "absolute", left: PAD, right: PAD, top: 620, textAlign: "center" } },
        // flex-centred rather than margin:auto — the auto margin does not survive the
        // composed style object, so the card was pinning to the container's left edge
        React.createElement("div", { style: { display: "flex", justifyContent: "center", marginBottom: 56 } },
          React.createElement(Card, {
            p, t, theme, index: 0, start: 0.08,
            style: { width: 168, height: 168, flex: "none", padding: 14 },
          }, React.createElement(MediaSlot, { src: scene.logo, theme, label: null, radius: 14 }))),
        React.createElement(Headline, { text: scene.title || "Make yours|this week.", p, theme, size: 108, mark: scene.mark, hi: theme.accentText, align: "center", start: 0.14 }),
        React.createElement("div", {
          style: merge({
            display: "inline-flex", alignItems: "center", gap: 18, marginTop: 56,
            padding: "30px 64px", borderRadius: 999, background: theme.accent, color: theme.surface,
            fontFamily: FB, fontWeight: 800, fontSize: 42,
          }, M.cardRise3D(p, { start: 0.32, dur: 0.26, shadow: true }), M.buttonPress(t, { period: 3 })),
        }, scene.cta || "Start your film", React.createElement("span", null, "→")),
        React.createElement("div", {
          style: merge({
            fontFamily: FB, fontWeight: 700, fontSize: 34, letterSpacing: "0.14em",
            color: rgba(theme.paper, 0.6), marginTop: 44, textTransform: "lowercase",
          }, M.wordStaggerBlur(p, 5, { start: 0.44, blur: 10, y: 20 })),
        }, scene.url || "studiolaunch.film")));
  }

  const SCENE_MAP = { Hook, Statement, Onboard, Stack, Feature, Morph, Stats, List, CTA };
  const ENERGY = { Subtle: 0.65, Balanced: 1, Cinematic: 1.35 };
  const AMB = { Soft: 0.85, Rich: 1, Vivid: 1.15 };

  function StudioLaunch() {
    const [tw, setTweak] = useTweaks(window.OM_TWEAKS || {});
    const t = tw || {};
    const groundHex = t.ground || "#3d472b";
    const paperHex = relLum(groundHex) > 0.3 ? "#201e1d" : "#f5ead8";
    const theme = {
      ground: groundHex,
      surface: t.surface || "#f5ead8",
      // ink for anything painted ON theme.surface — fixed, never follows the ground
      cardInk: "#201e1d",
      // ...but anything painted directly ON the ground must follow it. ground is a tweak, and
      // cream type on a light ground measures 1.06:1 — unreadable. Flip to ink past mid.
      paper: paperHex,
      accent: t.accent || "#c67139",
      accent2: t.accent2 || "#7a8a5e",
      // lighter steps for type on the dark ground; the base hexes stay for fills
      accentText: mix(t.accent || "#c67139", paperHex, 0.34),
      accent2Text: mix(t.accent2 || "#7a8a5e", paperHex, 0.44),
      brand: t.brand || "Studio",
      energy: ENERGY[t.motion] ?? 1,
      amb: AMB[t.ambience] ?? 1,
    };
    // ground is tweakable, so the page surround has to follow it — a static body colour
    // leaves a mismatched letterbox around the film on every ground change
    React.useLayoutEffect(() => {
      const prevBody = document.body.style.background, prevRoot = document.documentElement.style.background;
      document.body.style.background = theme.ground;
      document.documentElement.style.background = theme.ground;
      return () => { document.body.style.background = prevBody; document.documentElement.style.background = prevRoot; };
    }, [theme.ground]);
    return React.createElement("div", {
      style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: theme.ground },
    },
      React.createElement(SceneStage, {
        width: W, height: H, scenes: window.OM_SCENES, playback: window.OM_PLAYBACK, bg: theme.ground,
      }, mapWithTheme(SCENE_MAP, theme)),
      React.createElement(TweaksPanel, null,
        React.createElement(TweakSection, { label: "Brand" }),
        React.createElement(TweakText, { label: "Name", value: theme.brand, onChange: (v) => setTweak("brand", v) }),
        React.createElement(TweakColor, { label: "Accent", value: theme.accent, options: ["#c67139", "#b2622d", "#a8552a"], onChange: (v) => setTweak("accent", v) }),
        React.createElement(TweakColor, { label: "Second accent", value: theme.accent2, options: ["#7a8a5e", "#8c9a6e", "#6b7a52"], onChange: (v) => setTweak("accent2", v) }),
        React.createElement(TweakColor, { label: "Background", value: theme.ground, options: ["#3d472b", "#643312", "#474238", "#272e1b"], onChange: (v) => setTweak("ground", v) }),
        React.createElement(TweakSection, { label: "Motion" }),
        React.createElement(TweakRadio, { label: "Camera", value: t.motion || "Balanced", options: ["Subtle", "Balanced", "Cinematic"], onChange: (v) => setTweak("motion", v) }),
        React.createElement(TweakRadio, { label: "Background", value: t.ambience || "Rich", options: ["Soft", "Rich", "Vivid"], onChange: (v) => setTweak("ambience", v) })));
  }

  // bind theme into each scene component
  function mapWithTheme(map, theme) {
    const out = {};
    for (const k in map) { const C = map[k]; out[k] = (props) => React.createElement(C, Object.assign({}, props, { theme })); }
    return out;
  }

  window.StudioLaunch = StudioLaunch;
})();
