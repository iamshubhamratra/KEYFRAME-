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
  const skyRef = useRef(null);
  const sunWrapRef = useRef(null);
  const sunRef = useRef(null);
  const moonShadowRef = useRef(null);
  const cratersRef = useRef(null);
  const raysRef = useRef(null);
  const starsRef = useRef(null);
  const cloudsRef = useRef(null);
  const current = useRef(0); // eased phase
  const target = useRef(0);

  const stars = useMemo(
    () =>
      Array.from({ length: 64 }, () => ({
        left: `${(Math.random() * 100).toFixed(2)}%`,
        top: `${(Math.random() * 80).toFixed(2)}%`,
        size: `${(Math.random() * 2.2 + 1).toFixed(1)}px`,
        anim: `twinkle ${(Math.random() * 3 + 2).toFixed(1)}s ease-in-out ${(Math.random() * 4).toFixed(1)}s infinite`,
      })),
    []
  );

  useEffect(() => {
    let raf;
    const apply = (p) => {
      const night = clamp01((p - 0.7) / 0.3);
      const topC = sample(SKY_STOPS, p, "top");
      const botC = sample(SKY_STOPS, p, "bottom");
      if (skyRef.current) skyRef.current.style.background = `linear-gradient(${topC}, ${botC})`;
      if (sunWrapRef.current) {
        const w = window.innerWidth, h = window.innerHeight;
        const x = 0.06 * w + p * 0.78 * w;
        const y = h * (0.12 + 0.42 * (1 - Math.sin(p * Math.PI * 0.9)));
        sunWrapRef.current.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }
      if (sunRef.current) {
        sunRef.current.style.background = sample(SUN_STOPS, p, "c");
        sunRef.current.style.boxShadow = `0 0 80px 30px rgba(255,170,60,${(0.5 * (1 - night)).toFixed(3)}), 0 0 70px 22px rgba(190,205,255,${(0.4 * night).toFixed(3)})`;
      }
      if (moonShadowRef.current) {
        moonShadowRef.current.style.transform = `translateX(${(night <= 0 ? 110 : 110 - 72 * night).toFixed(1)}%)`;
        moonShadowRef.current.style.background = topC;
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
      if (Math.abs(d) > 0.0005) {
        current.current += d * 0.07; // ease toward target
        apply(current.current);
      }
      raf = requestAnimationFrame(tick);
    };
    apply(current.current);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  return (
    <div ref={skyRef} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1, background: "linear-gradient(#FFE9C7, #FFD9C2)", overflow: "hidden" }}>
      <div ref={cloudsRef} style={{ position: "absolute", inset: 0 }}>
        <div style={{ position: "absolute", top: "16vh", left: "12vw", width: 320, height: 84, borderRadius: 999, background: "rgba(255,255,255,.75)", filter: "blur(22px)", animation: "cloudDrift 46s ease-in-out infinite alternate" }} />
        <div style={{ position: "absolute", top: "34vh", right: "8vw", width: 420, height: 100, borderRadius: 999, background: "rgba(255,255,255,.6)", filter: "blur(28px)", animation: "cloudDrift 64s ease-in-out infinite alternate-reverse" }} />
        <div style={{ position: "absolute", top: "7vh", right: "30vw", width: 240, height: 64, borderRadius: 999, background: "rgba(255,255,255,.55)", filter: "blur(18px)", animation: "cloudDrift 54s ease-in-out infinite alternate" }} />
      </div>
      <div ref={starsRef} style={{ position: "absolute", inset: 0, opacity: 0 }}>
        {stars.map((s, i) => (
          <i key={i} style={{ position: "absolute", left: s.left, top: s.top, width: s.size, height: s.size, borderRadius: "50%", background: "#E7ECFA", animation: s.anim }} />
        ))}
      </div>
      <div ref={sunWrapRef} style={{ position: "absolute", left: 0, top: 0, width: 118, height: 118, willChange: "transform", transform: "translate(8vw, 54vh)" }}>
        <div ref={raysRef} style={{ position: "absolute", inset: -26, borderRadius: "50%", border: "2px dashed rgba(255,170,60,.55)", animation: "raysSpin 40s linear infinite" }} />
        <div ref={sunRef} style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#FFD66B", boxShadow: "0 0 80px 30px rgba(255,170,60,.5)", overflow: "hidden" }}>
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
