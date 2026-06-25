import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// The KEYFRAME hero: a giant KEY+FRAME wordmark over a CSS-drawn camera that,
// as you scroll, ASSEMBLES → opens its APERTURE → EXPLODES into the six pipeline
// stages → reassembles and "records". Driven by one scrubbed GSAP timeline.
// Recreation of the export's signature scroll sequence (aesthetic 1:1).

const STEPS = [
  { n: "01", label: "Camera" },
  { n: "02", label: "Lens" },
  { n: "03", label: "Explode" },
  { n: "04", label: "Rebuild" },
];

// The six exploded parts == the six pipeline stages, placed around the frame.
const PARTS = [
  { id: "ingest",  label: "Ingest",          x: -360, y: -150, rot: -8 },
  { id: "brief",   label: "Brief",           x:  -90, y: -200, rot:  7 },
  { id: "script",  label: "Script",          x: -420, y:   60, rot: -5 },
  { id: "design",  label: "Design",          x:  120, y:  210, rot:  6 },
  { id: "assets",  label: "Assets",          x: -300, y:  230, rot:  4 },
  { id: "render",  label: "Render & Export", x: -120, y:   30, rot: -6 },
];

export default function Hero({ onStart }) {
  const root = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context((self) => {
      const q = self.selector;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // Steady-state idle: aperture spectrum slowly rotates, camera floats.
      gsap.to(q(".cam-spectrum"), { rotate: 360, duration: 26, ease: "none", repeat: -1 });

      if (reduce) {
        // Show everything assembled + the exploded stages, skip choreography.
        gsap.set(q(".cam-part"), { x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 });
        gsap.set(q(".cam-aperture"), { scale: 1, opacity: 1 });
        q(".explode-tile").forEach((el) => gsap.set(el, {
          xPercent: -50, yPercent: -50, x: Number(el.dataset.x), y: Number(el.dataset.y),
          rotate: Number(el.dataset.rot), opacity: 1, scale: 1,
        }));
        return;
      }

      // --- Initial states: parts scattered + invisible, aperture closed ---
      q(".cam-part").forEach((el) => {
        gsap.set(el, {
          x: () => gsap.utils.random(-260, 260),
          y: () => gsap.utils.random(-200, 200),
          rotate: () => gsap.utils.random(-40, 40),
          opacity: 0, scale: 0.7,
        });
      });
      gsap.set(q(".cam-aperture"), { scale: 0.04, opacity: 0 });
      gsap.set(q(".explode-tile"), { xPercent: -50, yPercent: -50 });
      q(".explode-tile").forEach((el) => gsap.set(el, {
        x: gsap.utils.random(-120, 120), y: gsap.utils.random(-120, 120),
        rotate: gsap.utils.random(-20, 20), opacity: 0, scale: 0.6,
      }));
      gsap.set(q(".h-aperture, .h-stages, .h-records"), { opacity: 0, y: 20 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: q(".hero-pin")[0],
          start: "top top",
          end: "+=2600",
          scrub: 0.8,
          pin: true,
          anticipatePin: 1,
        },
      });

      // PHASE 1 — ASSEMBLE (01 / Camera): parts fly in, wordmark ghosts out.
      tl.to(q(".cam-part"), {
        x: 0, y: 0, rotate: 0, opacity: 1, scale: 1,
        duration: 1, ease: "power3.out", stagger: 0.04,
      }, 0);
      tl.to(q(".wordmark-hero"), { scale: 0.78, opacity: 0.12, duration: 1 }, 0);
      tl.to(q(".wordmark-eyebrow"), { opacity: 0, duration: 0.45 }, 0);
      tl.to(q(".headline"), { opacity: 0, duration: 0.45 }, 0);
      tl.addLabel("assembled", 1);

      // PHASE 2 — APERTURE (02 / Lens): the iris opens, headline enters right.
      tl.to(q(".cam-aperture"), { scale: 1, opacity: 1, duration: 0.8, ease: "power2.out" }, "assembled");
      tl.to(q(".cam-lens-glass"), { opacity: 0.35, duration: 0.5 }, "assembled");
      tl.to(q(".h-aperture"), { opacity: 1, y: 0, duration: 0.4 }, "assembled+=0.25");
      tl.addLabel("opened", "+=0.8");

      // PHASE 3 — EXPLODE into pipeline stages (03 / Explode): parts fly out to
      // their stage positions (each tile to its OWN data-x/y, via GSAP transforms).
      tl.to(q(".cam-core"), { scale: 0.52, opacity: 0.9, duration: 0.9, ease: "power2.inOut" }, "opened");
      q(".explode-tile").forEach((el, i) => {
        tl.to(el, {
          x: Number(el.dataset.x), y: Number(el.dataset.y), rotate: Number(el.dataset.rot),
          opacity: 1, scale: 1, duration: 0.9, ease: "power3.out",
        }, "opened+=" + (0.1 + i * 0.05));
      });
      tl.to(q(".h-aperture"), { opacity: 0, y: -20, duration: 0.3 }, "opened");
      tl.to(q(".h-stages"), { opacity: 1, y: 0, duration: 0.4 }, "opened+=0.3");
      tl.addLabel("exploded", "+=1.2");

      // PHASE 4 — REBUILD + record (04 / Rebuild)
      tl.to(q(".explode-tile"), { opacity: 0, scale: 0.6, duration: 0.6, ease: "power2.in", stagger: 0.03 }, "exploded");
      tl.to(q(".cam-core"), { scale: 1, opacity: 1, duration: 0.8, ease: "power3.out" }, "exploded+=0.2");
      tl.to(q(".cam-spectrum"), { filter: "saturate(1.5) brightness(1.1)", duration: 0.6 }, "exploded+=0.3");
      tl.to(q(".h-stages"), { opacity: 0, y: -20, duration: 0.3 }, "exploded");
      tl.to(q(".h-records"), { opacity: 1, y: 0, duration: 0.4 }, "exploded+=0.3");
      tl.to(q(".film-strip"), { opacity: 1, y: 0, duration: 0.6, stagger: 0.08 }, "exploded+=0.4");

      // Step indicator highlight, mapped to scroll progress.
      const steps = q(".step");
      tl.eventCallback("onUpdate", () => {
        const p = tl.progress();
        const active = p < 0.28 ? 0 : p < 0.52 ? 1 : p < 0.8 ? 2 : 3;
        steps.forEach((s, i) => s.classList.toggle("step-on", i === active));
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} className="hero-wrap relative">
      <div className="hero-pin relative h-screen w-full overflow-hidden">
        {/* Step rail */}
        <div className="absolute left-6 sm:left-10 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-5">
          {STEPS.map((s, i) => (
            <div key={s.n} className={`step ${i === 0 ? "step-on" : ""} flex items-center gap-3`}>
              <span className="step-bar" />
              <span className="label-mono step-text">{s.n} / {s.label}</span>
            </div>
          ))}
        </div>

        {/* Wordmark (fades to a faint ghost as the camera builds) */}
        <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center pointer-events-none px-6">
          <div className="wordmark-eyebrow eyebrow mb-5 text-center">Multi-modal AI video studio</div>
          <h1 className="wordmark-hero wordmark text-center text-[clamp(64px,13vw,200px)]">
            <span style={{ color: "var(--color-ink)" }}>KEY</span><span style={{ color: "var(--color-green)" }}>FRAME</span>
          </h1>
          <div className="headline label-mono mt-6 text-center">Scroll to build the camera ↓</div>
        </div>

        {/* Phase headlines — right column, right-aligned, cross-fading (like the export).
            Each centers via a flex wrapper so GSAP can own the inner y/opacity. */}
        <div className="absolute z-20 right-[6%] sm:right-[9%] top-0 bottom-0 pointer-events-none" style={{ width: "min(40vw, 440px)" }}>
          <div className="hero-sub-r">
            <div className="h-aperture hero-h-inner">
              <h2 className="hero-h2">A real aperture opens.</h2>
              <p className="hero-h2-sub">Every frame begins the moment KEYFRAME reads your idea.</p>
            </div>
          </div>
          <div className="hero-sub-r">
            <div className="h-stages hero-h-inner">
              <h2 className="hero-h2">One camera.<br />Every stage.</h2>
              <p className="hero-h2-sub">Each part is a stage in the pipeline — ingest, brief, script, design, render, export.</p>
            </div>
          </div>
          <div className="hero-sub-r">
            <div className="h-records hero-h-inner">
              <h2 className="hero-h2">It comes together,<br />and records.</h2>
              <p className="hero-h2-sub">Voiced, captioned, scored and styled — it all rolls out, frame by frame.</p>
            </div>
          </div>
        </div>

        {/* Camera + exploded pipeline tiles */}
        <div className="absolute inset-0 z-[5] flex items-center justify-center">
          <div className="cam-stage relative" style={{ width: 460, height: 340 }}>
            {/* exploded pipeline tiles (revealed in phase 3) */}
            {PARTS.map((p) => (
              <div
                key={p.id}
                className="explode-tile absolute left-1/2 top-1/2"
                data-x={p.x} data-y={p.y} data-rot={p.rot}
              >
                <div className="tile-card">
                  <span className="tile-dot" />
                  <span className="label-mono">{p.label}</span>
                </div>
              </div>
            ))}

            {/* the camera core (assembles, then opens its aperture) */}
            <div className="cam-core absolute inset-0">
              <div className="cam-part cam-body" />
              <div className="cam-part cam-hump" />
              <div className="cam-part cam-shutter" />
              <div className="cam-part cam-dial" />
              <div className="cam-part cam-grip" />
              <div className="cam-part cam-lens">
                <div className="cam-lens-ring" />
                <div className="cam-aperture"><div className="cam-spectrum" /></div>
                <div className="cam-lens-glass" />
              </div>
              <div className="cam-part cam-badge label-mono">KEYFRAME · 01</div>
            </div>

            {/* film frames that emerge when it records */}
            <div className="absolute left-1/2 -bottom-24 -translate-x-1/2 flex gap-4">
              <span className="film-strip" style={{ background: "linear-gradient(135deg,#9be7a0,#6fae12)" }} />
              <span className="film-strip" style={{ background: "linear-gradient(135deg,#9fb4ff,#7a5cff)" }} />
              <span className="film-strip" style={{ background: "linear-gradient(135deg,#ffb37a,#e2563c)" }} />
            </div>
          </div>
        </div>
      </div>

      {/* scoped styles for the camera + hero */}
      <style>{`
        .step-bar { width: 30px; height: 2px; background: var(--color-line-strong); transition: all .3s; }
        .step-text { color: var(--color-dim); transition: color .3s; }
        .step-on .step-bar { width: 46px; background: var(--color-green); }
        .step-on .step-text { color: var(--color-accent-text); }
        .hero-h2 { font-family: var(--font-display); font-weight: 800; font-size: clamp(30px,3.6vw,52px); letter-spacing: -0.02em; line-height: 1.0; color: var(--color-ink); text-align: right; }
        .hero-h2-sub { font-family: var(--font-body); font-size: 14px; line-height: 1.5; color: var(--color-dim); margin-top: 14px; margin-left: auto; max-width: 330px; }
        .hero-sub-r { position: absolute; inset: 0; display: flex; align-items: center; justify-content: flex-end; }
        .hero-h-inner { opacity: 0; }

        .cam-core { filter: drop-shadow(0 40px 60px rgba(20,22,12,0.28)); }
        .cam-body { position: absolute; inset: 18% 6% 8% 6%; border-radius: 22px;
          background: linear-gradient(150deg,#33392a 0%, #1c2014 55%, #11140b 100%);
          box-shadow: inset 0 2px 0 rgba(255,255,255,0.06), inset 0 -10px 24px rgba(0,0,0,0.5); }
        .cam-hump { position: absolute; left: 38%; right: 38%; top: 6%; height: 18%;
          background: linear-gradient(180deg,#2a3020,#15180d); border-radius: 12px 12px 6px 6px;
          box-shadow: inset 0 2px 0 rgba(255,255,255,0.06); }
        .cam-shutter { position: absolute; right: 12%; top: 10%; width: 30px; height: 30px; border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, #ff7a5c, #d8473a); box-shadow: 0 2px 6px rgba(0,0,0,0.4), inset 0 -2px 4px rgba(0,0,0,0.35); }
        .cam-dial { position: absolute; left: 12%; top: 12%; width: 34px; height: 34px; border-radius: 50%;
          background: repeating-conic-gradient(#2a3020 0 8deg, #11140b 8deg 16deg); border: 2px solid #11140b; }
        .cam-grip { position: absolute; right: 7%; top: 24%; bottom: 12%; width: 9%; border-radius: 8px;
          background: repeating-linear-gradient(0deg,#1a1d12 0 4px,#0d0f08 4px 8px); }
        .cam-badge { position: absolute; left: 10%; bottom: 13%; color: rgba(244,242,234,0.55); font-size: 9px; }

        .cam-lens { position: absolute; left: 50%; top: 56%; transform: translate(-50%,-50%);
          width: 168px; height: 168px; border-radius: 50%;
          background: radial-gradient(circle at 50% 50%, #20251a 0 44%, #0c0f07 46% 100%);
          box-shadow: inset 0 0 0 6px #0c0f07, inset 0 0 26px rgba(0,0,0,0.7), 0 6px 18px rgba(0,0,0,0.4); }
        .cam-lens-ring { position: absolute; inset: 12px; border-radius: 50%; border: 3px solid rgba(244,242,234,0.06);
          box-shadow: inset 0 0 0 8px rgba(0,0,0,0.4); }
        .cam-aperture { position: absolute; inset: 26px; border-radius: 50%; overflow: hidden;
          box-shadow: inset 0 0 18px rgba(0,0,0,0.7); }
        .cam-spectrum { position: absolute; inset: -25%;
          background: conic-gradient(from 0deg, #ff4d3c, #f1ee2e, #6fae12, #00d3a7, #3d8bd9, #7a5cff, #e26b4a, #ff4d3c); }
        .cam-lens-glass { position: absolute; inset: 26px; border-radius: 50%; pointer-events: none;
          background: radial-gradient(circle at 36% 30%, rgba(255,255,255,0.5), transparent 42%); opacity: 0.85; }

        .tile-card { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: 14px;
          background: var(--color-paper); border: 1px solid var(--color-line);
          box-shadow: 8px 8px 20px rgba(20,22,12,0.10), -6px -6px 16px rgba(255,255,255,0.85); white-space: nowrap; }
        .tile-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--color-green); box-shadow: 0 0 0 3px rgba(111,174,18,0.18); }

        .film-strip { width: 96px; height: 60px; border-radius: 10px; opacity: 0; transform: translateY(20px);
          border: 2px solid var(--color-ink); box-shadow: 6px 6px 0 var(--color-ink); }
      `}</style>
    </section>
  );
}
