import { useEffect, useMemo, useRef } from "react";

/* ============================================================
   <SolsticeSky phase={0..1} />
   The Solstice ground layer: a fixed sky that travels from
   dawn (0) to midnight (1), with a sun that arcs across the
   viewport and becomes a crescent moon, drifting clouds that
   fade out and stars that fade in.

   Two ways to drive it:
   - phase prop (recommended for screen-based apps): map your
     workflow to the time of day, e.g. create=0 → premiere=1.
     Transitions are eased automatically.
   - phase omitted: it follows page scroll (one-pager mode).

   It also toggles `solstice-night` on <html> past phase 0.82
   so the index.css token flip kicks in (light text at night).

   PERFORMANCE: every per-frame mutation is compositor-only
   (opacity / transform). The sky is six stacked static gradient
   layers cross-faded by opacity; the sun glow is two static
   blurred layers cross-faded by opacity — NO box-shadow or
   full-viewport gradient is repainted per frame.

   Mount once, first child of your root:
     <SolsticeSky phase={PHASES[view]} />
   ============================================================ */

const SKY_STOPS = [
  { p: 0.0, top: "#FFE9C7", bottom: "#FFD9C2" }, // dawn
  { p: 0.2, top: "#CFE8FA", bottom: "#EAF6FF" }, // morning
  { p: 0.4, top: "#CFEFF5", bottom: "#E9FAF2" }, // noon
  { p: 0.6, top: "#FFE2B8", bottom: "#FFD7CE" }, // golden hour
  { p: 0.8, top: "#D9CFF0", bottom: "#F0D9E8" }, // dusk
  { p: 1.0, top: "#141A33", bottom: "#232B52" }, // midnight
];

const SUN_STOPS = [
  { p: 0.0, c: "#FFD66B" },
  { p: 0.35, c: "#FFC24D" },
  { p: 0.6, c: "#FF9D42" },
  { p: 0.8, c: "#F4D9B0" },
  { p: 1.0, c: "#E9EDF5" },
];

// Star field is randomized once at module load (render must stay pure).
const STARS = Array.from({ length: 64 }, () => ({
  left: `${(Math.random() * 100).toFixed(2)}%`,
  top: `${(Math.random() * 80).toFixed(2)}%`,
  size: `${(Math.random() * 2.2 + 1).toFixed(1)}px`,
  anim: `twinkle ${(Math.random() * 3 + 2).toFixed(1)}s ease-in-out ${(Math.random() * 4).toFixed(1)}s infinite`,
}));

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function hexLerp(h1, h2, t) {
  const px = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = px(h1), b = px(h2);
  return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(",")})`;
}

function sample(stops, p, key) {
  let i = 0;
  while (i < stops.length - 2 && p > stops[i + 1].p) i++;
  const a = stops[i], b = stops[i + 1];
  return hexLerp(a[key], b[key], clamp01((p - a.p) / (b.p - a.p)));
}

export default function SolsticeSky({ phase = null }) {
  const skyLayerRefs = useRef([]);
  const sunWrapRef = useRef(null);
  const sunRef = useRef(null);
  const glowWarmRef = useRef(null);
  const glowCoolRef = useRef(null);
  const moonShadowRef = useRef(null);
  const cratersRef = useRef(null);
  const raysRef = useRef(null);
  const starsRef = useRef(null);
  const cloudsRef = useRef(null);
  const current = useRef(0); // eased phase
  const target = useRef(0);

  const stars = STARS;

  // One static gradient per sky stop; cross-faded by opacity at runtime.
  const skyLayers = useMemo(
    () => SKY_STOPS.map((s) => `linear-gradient(${s.top}, ${s.bottom})`),
    []
  );

  useEffect(() => {
    let raf;
    const apply = (p) => {
      const night = clamp01((p - 0.7) / 0.3);

      // --- Sky: cross-fade stacked static gradients (opacity only, no repaint).
      let i = 0;
      while (i < SKY_STOPS.length - 2 && p > SKY_STOPS[i + 1].p) i++;
      const a = SKY_STOPS[i], b = SKY_STOPS[i + 1];
      const t = clamp01((p - a.p) / (b.p - a.p));
      const layers = skyLayerRefs.current;
      for (let k = 0; k < layers.length; k++) {
        const el = layers[k];
        if (!el) continue;
        // layers <= i are fully opaque (the topmost opaque one wins); the next
        // layer fades in on top by `t`; everything above is hidden.
        el.style.opacity = k <= i ? "1" : k === i + 1 ? t.toFixed(3) : "0";
      }

      // --- Sun position (GPU transform).
      if (sunWrapRef.current) {
        const w = window.innerWidth, h = window.innerHeight;
        const x = 0.06 * w + p * 0.78 * w;
        const y = h * (0.12 + 0.42 * (1 - Math.sin(p * Math.PI * 0.9)));
        sunWrapRef.current.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      }
      // Sun core colour (tiny 118px repaint).
      if (sunRef.current) sunRef.current.style.background = sample(SUN_STOPS, p, "c");
      // Glow: cross-fade two static blurred layers by opacity (replaces box-shadow).
      if (glowWarmRef.current) glowWarmRef.current.style.opacity = (1 - night).toFixed(3);
      if (glowCoolRef.current) glowCoolRef.current.style.opacity = night.toFixed(3);

      if (moonShadowRef.current) {
        moonShadowRef.current.style.transform = `translateX(${(night <= 0 ? 110 : 110 - 72 * night).toFixed(1)}%)`;
        moonShadowRef.current.style.background = sample(SKY_STOPS, p, "top");
      }
      if (cratersRef.current) cratersRef.current.style.opacity = night.toFixed(2);
      if (raysRef.current) raysRef.current.style.opacity = (1 - night).toFixed(2);
      if (starsRef.current) starsRef.current.style.opacity = night.toFixed(2);
      if (cloudsRef.current) cloudsRef.current.style.opacity = (1 - clamp01((p - 0.5) / 0.3)).toFixed(2);
      document.documentElement.classList.toggle("solstice-night", p > 0.82);
    };

    const fromScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max > 0 ? clamp01(window.scrollY / max) : 0;
    };

    const tick = () => {
      target.current = phase === null ? fromScroll() : clamp01(phase);
      const d = target.current - current.current;
      if (Math.abs(d) > 0.0008) {
        current.current += d * 0.15; // snappier ease — was 0.07 (felt delayed)
        apply(current.current);
      } else if (current.current !== target.current) {
        current.current = target.current; // snap + one exact final frame
        apply(current.current);
      }
      raf = requestAnimationFrame(tick);
    };
    apply(current.current);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, skyLayers]);

  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1, overflow: "hidden", background: "linear-gradient(#FFE9C7, #FFD9C2)" }}>
      {skyLayers.map((g, k) => (
        <div
          key={k}
          ref={(el) => (skyLayerRefs.current[k] = el)}
          style={{ position: "absolute", inset: 0, background: g, opacity: k === 0 ? 1 : 0, willChange: "opacity" }}
        />
      ))}
      <div ref={cloudsRef} style={{ position: "absolute", inset: 0 }}>
        <div style={{ position: "absolute", top: "16vh", left: "12vw", width: 320, height: 84, borderRadius: 999, background: "rgba(255,255,255,.75)", filter: "blur(22px)", willChange: "transform", animation: "cloudDrift 46s ease-in-out infinite alternate" }} />
        <div style={{ position: "absolute", top: "34vh", right: "8vw", width: 420, height: 100, borderRadius: 999, background: "rgba(255,255,255,.6)", filter: "blur(28px)", willChange: "transform", animation: "cloudDrift 64s ease-in-out infinite alternate-reverse" }} />
        <div style={{ position: "absolute", top: "7vh", right: "30vw", width: 240, height: 64, borderRadius: 999, background: "rgba(255,255,255,.55)", filter: "blur(18px)", willChange: "transform", animation: "cloudDrift 54s ease-in-out infinite alternate" }} />
      </div>
      <div ref={starsRef} style={{ position: "absolute", inset: 0, opacity: 0 }}>
        {stars.map((s, i) => (
          <i key={i} style={{ position: "absolute", left: s.left, top: s.top, width: s.size, height: s.size, borderRadius: "50%", background: "#E7ECFA", animation: s.anim }} />
        ))}
      </div>
      <div ref={sunWrapRef} style={{ position: "absolute", left: 0, top: 0, width: 118, height: 118, willChange: "transform", transform: "translate3d(8vw, 54vh, 0)" }}>
        {/* glow layers — cross-faded by opacity instead of an animated box-shadow */}
        <div ref={glowWarmRef} style={{ position: "absolute", inset: -74, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,170,60,.55), rgba(255,170,60,0) 68%)", filter: "blur(6px)", willChange: "opacity", pointerEvents: "none" }} />
        <div ref={glowCoolRef} style={{ position: "absolute", inset: -64, borderRadius: "50%", background: "radial-gradient(circle, rgba(190,205,255,.5), rgba(190,205,255,0) 68%)", filter: "blur(6px)", opacity: 0, willChange: "opacity", pointerEvents: "none" }} />
        <div ref={raysRef} style={{ position: "absolute", inset: -26, borderRadius: "50%", border: "2px dashed rgba(255,170,60,.55)", animation: "raysSpin 40s linear infinite" }} />
        <div ref={sunRef} style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#FFD66B", overflow: "hidden" }}>
          <div ref={moonShadowRef} style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#FFE9C7", transform: "translateX(110%)" }} />
          <div ref={cratersRef} style={{ position: "absolute", inset: 0, opacity: 0 }}>
            <i style={{ position: "absolute", left: "22%", top: "30%", width: 18, height: 18, borderRadius: "50%", background: "rgba(150,165,200,.35)" }} />
            <i style={{ position: "absolute", left: "52%", top: "56%", width: 12, height: 12, borderRadius: "50%", background: "rgba(150,165,200,.3)" }} />
            <i style={{ position: "absolute", left: "38%", top: "70%", width: 8, height: 8, borderRadius: "50%", background: "rgba(150,165,200,.3)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
