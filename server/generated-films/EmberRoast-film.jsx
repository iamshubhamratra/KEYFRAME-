/* EmberRoast — spike film. Hand-authored to the animated-HTML-template spec so
 * the runtime, the bundle format and the QA path can be proven BEFORE a model is
 * asked to write one. Every rule the spec calls non-negotiable is exercised here:
 * one mechanic per scene, continuous motion, disjoint sub-beats, a garnish on
 * every frame, a landscape media slot on the first scene, inline styles only.
 *
 * Reads window.OM_SCENES (the adapter rewrites it per film) and mounts #root.
 */
(function () {
  const { useState, useEffect, useRef, createElement: h } = React;

  // ---- helpers ------------------------------------------------------------
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, u) => a + (b - a) * u;
  const outQuint = (p) => 1 - Math.pow(1 - p, 5);
  const outCubic = (p) => 1 - Math.pow(1 - p, 3);
  const inCubic = (p) => p * p * p;
  const outBack = (p) => 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);
  const rgba = (hex, a) => {
    const n = parseInt(String(hex).slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const splitLines = (s) => String(s || "").split("|");
  // Reveals land fast, the middle holds readable, the exit is quick.
  const PACE = (p) => (p <= 0.18 ? p * 2.78 : p <= 0.8 ? 0.5 + (p - 0.18) * 0.645 : 0.9 + (p - 0.8) * 0.5);
  const seg = (p, a, b) => clamp01((PACE(p) - a) / (b - a));

  // Measure-and-shrink so a long word can never run off frame.
  let _ctx = null;
  function fitSize(text, size, maxW, font) {
    if (!text) return size;
    if (!_ctx) _ctx = document.createElement("canvas").getContext("2d");
    let s = size;
    for (let i = 0; i < 24; i++) {
      _ctx.font = `700 ${s}px ${font}`;
      const w = Math.max(...splitLines(text).map((l) => _ctx.measureText(l).width));
      if (w <= maxW) break;
      s = Math.round(s * 0.94);
    }
    return s;
  }

  // ---- identity -----------------------------------------------------------
  const T = {
    brand: "Ember Roast",
    desk: "#201510",
    FH: '"Alfa Slab One", serif',
    FB: '"Karla", sans-serif',
    pal: { roast: "#2b1d16", cream: "#f3e9dc", ember: "#e0662c", gold: "#caa465", ink: "#1c110c" },
    cams: ["pushL", "zoomIn", "hopU", "pushR", "zoomOut", "drop", "spin", "pushD"],
  };
  const P = T.pal;

  // ---- the world: a roasting drum, falling beans, steam -------------------
  // 3 layers, all functions of the global clock; `p` drives one element that
  // grows across the scene so each beat has its own arc over the ambient loop.
  function World(t, p, W, H) {
    const beans = [];
    for (let i = 0; i < 14; i++) {
      const sp = 0.6 + (i % 5) * 0.18;
      const y = ((t * sp * 120) + i * 137) % (H + 160) - 80;
      const x = 90 + ((i * 271) % (W - 180));
      beans.push(h("ellipse", {
        key: "b" + i, cx: x, cy: y, rx: 9, ry: 13,
        fill: i % 3 === 0 ? P.gold : P.ember, opacity: 0.22,
        transform: `rotate(${(t * 40 + i * 30) % 360} ${x} ${y})`,
      }));
    }
    const steam = [0, 1, 2].map((k) => {
      const ph = t * 0.9 + k * 2.1;
      const sway = Math.sin(ph) * 26;
      return h("path", {
        key: "s" + k,
        d: `M ${W * 0.5 + k * 60 - 60} ${H * 0.34} q ${sway} -70 ${sway * 0.3} -140 q ${-sway} -70 ${sway * 0.2} -130`,
        stroke: rgba(P.cream, 0.14), strokeWidth: 10, fill: "none", strokeLinecap: "round",
      });
    });
    const drumR = 190;
    const spin = (t * 46) % 360;
    const grow = 0.86 + 0.14 * outCubic(clamp01(p));
    return h("g", null,
      h("g", { opacity: 0.5, transform: `translate(${W * 0.5} ${H * 0.34}) scale(${grow})` },
        h("circle", { r: drumR, fill: "none", stroke: rgba(P.gold, 0.30), strokeWidth: 12 }),
        h("g", { transform: `rotate(${spin})` },
          [0, 1, 2, 3, 4, 5].map((k) => h("line", {
            key: "v" + k, x1: 0, y1: 0, x2: drumR * 0.82, y2: 0,
            stroke: rgba(P.ember, 0.34), strokeWidth: 7, strokeLinecap: "round",
            transform: `rotate(${k * 60})`,
          }))
        )
      ),
      steam, beans
    );
  }

  // ---- camera -------------------------------------------------------------
  function cam(kind, p, t, mult) {
    const inn = outQuint(clamp01(p / 0.15));
    const out = inCubic(clamp01((p - 0.85) / 0.15));
    const m = mult || 1;
    // Continuous drift so nothing ever freezes after its reveal.
    const dx = Math.sin(t * 0.7) * 8 * m, dy = Math.cos(t * 0.55) * 9 * m;
    let x = dx, y = dy, s = 1, r = 0;
    if (kind === "pushL") { x += lerp(-260, 0, inn) - out * 240; r = lerp(-2.2, 0, inn) + out * 1.6; }
    else if (kind === "pushR") { x += lerp(260, 0, inn) + out * 240; r = lerp(2.2, 0, inn) - out * 1.6; }
    else if (kind === "pushU") { y += lerp(240, 0, inn) + out * 220; }
    else if (kind === "pushD") { y += lerp(-240, 0, inn) - out * 220; }
    else if (kind === "zoomIn") { s = lerp(1.3, 1, inn) - out * 0.15; }
    else if (kind === "zoomOut") { s = lerp(0.75, 1, inn) + out * 0.25; }
    else if (kind === "drop") { y += lerp(-320, 0, outBack(clamp01(p / 0.18))) + out * 200; }
    else if (kind === "hopU") { y += lerp(300, 0, outBack(clamp01(p / 0.2))) + out * 200; }
    else if (kind === "spin") { r = lerp(-5, 0, inn) + out * 4; s = lerp(0.92, 1, inn); }
    return { transform: `translate(${x}px,${y}px) scale(${s * (1 + Math.sin(t * 0.4) * 0.004)}) rotate(${r}deg)` };
  }

  // ---- chrome + garnish ---------------------------------------------------
  // Rotated by scene index so no garnish repeats back to back. No scene numbers.
  function Garnish(i, t, W, H, fg) {
    const k = i % 4;
    const st = { position: "absolute", fontFamily: T.FB, fontSize: 26, letterSpacing: "0.32em", color: rgba(fg, 0.5) };
    if (k === 0) return h("div", { style: { ...st, right: 52, top: H * 0.42, transform: "rotate(90deg)", transformOrigin: "right top" } }, "SMALL BATCH");
    if (k === 1) return h("div", { style: { ...st, left: 64, bottom: 120, fontStyle: "italic", letterSpacing: "0.04em" } }, "— roasted to order");
    if (k === 2) {
      return h("svg", { width: 74, height: 74, style: { position: "absolute", right: 64, bottom: 132 } },
        h("g", { transform: `translate(37 37) rotate(${(t * 55) % 360})` },
          h("path", { d: "M0,-26 L7,-7 L26,0 L7,7 L0,26 L-7,7 L-26,0 L-7,-7 Z", fill: rgba(P.gold, 0.6) })));
    }
    return h("div", { style: { ...st, left: 64, top: 150, letterSpacing: "0.5em" } }, "EST. 2016");
  }

  function Frame({ p, i, bg, fg, world, t, children }) {
    const W = 1080, H = 1920;
    return h("div", {
      style: {
        position: "absolute", inset: 0, background: bg, overflow: "hidden",
        ...cam(T.cams[(i * 3) % T.cams.length], p, t, 1),
      },
    },
      world !== false && h("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: { position: "absolute", inset: 0 } }, World(t, p, W, H)),
      children,
      h("div", { style: { position: "absolute", left: 64, top: 72, fontFamily: T.FH, fontSize: 34, color: rgba(fg, 0.9), letterSpacing: "0.02em" } }, T.brand),
      Garnish(i, t, W, H, fg)
    );
  }

  // A landscape slot at every canvas size — real screenshots are landscape.
  function MediaSlot({ url, cap, w, h: hh, fg }) {
    return h("div", { style: { width: w, height: hh, position: "relative", borderRadius: 18, overflow: "hidden", background: rgba(fg, 0.06), border: `3px dashed ${rgba(fg, 0.34)}`, display: "grid", placeItems: "center" } },
      url
        ? h("img", { src: url, alt: cap || "", style: { width: "100%", height: "100%", objectFit: "cover" } })
        : h("div", { style: { textAlign: "center", fontFamily: T.FB, color: rgba(fg, 0.62) } },
            h("div", { style: { fontSize: 26, letterSpacing: "0.22em", fontWeight: 700 } }, "DROP IMAGE TO REPLACE"),
            cap && h("div", { style: { fontSize: 24, marginTop: 10, opacity: 0.8 } }, cap))
    );
  }

  const Head = ({ text, size, fg, hi, top, upper, align }) => {
    const fs = fitSize(text, size, 1080 - 128, T.FH);
    return h("div", { style: { position: "absolute", left: 64, right: 64, top, fontFamily: T.FH, fontSize: fs, lineHeight: 1.02, color: fg, textTransform: upper ? "uppercase" : "none", textAlign: align || "left" } },
      splitLines(text).map((l, k) => h("div", { key: k }, l.split(/(\*[^*]+\*)/g).map((seg2, j) => seg2.startsWith("*")
        ? h("span", { key: j, style: { color: hi } }, seg2.slice(1, -1))
        : seg2)))
    );
  };
  const Sub = ({ text, top, fg }) => text ? h("div", { style: { position: "absolute", left: 64, right: 120, top, fontFamily: T.FB, fontSize: 40, lineHeight: 1.4, color: rgba(fg, 0.76) } }, text) : null;

  // ---- scenes — one distinct mechanic each -------------------------------
  // 1. letters drop with rotation
  function Hook({ s, progress: p, localTime: lt }) {
    const chars = String(s.title || "").split("");
    let n = -1;
    return h(Frame, { p, i: 0, bg: P.roast, fg: P.cream, t: lt },
      h("div", { style: { position: "absolute", left: 64, right: 64, top: 300, fontFamily: T.FH, fontSize: 126, lineHeight: 1.04, color: P.cream, textTransform: "uppercase" } },
        splitLines(s.title).map((line, li) => h("div", { key: li }, line.split("").map((c, ci) => {
          n++;
          const u = outBack(seg(p, 0.04 + n * 0.012, 0.3 + n * 0.012));
          return h("span", { key: ci, style: { display: "inline-block", transform: `translateY(${(1 - u) * -140}px) rotate(${(1 - u) * (ci % 2 ? 22 : -22)}deg)`, opacity: clamp01(u * 1.3) } }, c === " " ? " " : c);
        })))),
      s.kicker && h("div", { style: { position: "absolute", left: 64, top: 220, background: P.ember, color: P.ink, fontFamily: T.FB, fontWeight: 700, fontSize: 28, letterSpacing: "0.2em", padding: "12px 22px", borderRadius: 999, opacity: seg(p, 0, 0.14) } }, s.kicker),
      h("div", { style: { position: "absolute", left: 64, top: 1080, opacity: seg(p, 0.34, 0.62), transform: `translateY(${(1 - seg(p, 0.34, 0.62)) * 40}px)` } },
        h(MediaSlot, { url: s.img, cap: s.imgCap || "the roastery floor", w: 952, h: 536, fg: P.cream })),
      h(Sub, { text: s.sub, top: 1680, fg: P.cream })
    );
  }

  // 2. letter-spacing collapses from very wide
  function Statement({ s, progress: p, localTime: lt, index: i }) {
    const u = outQuint(seg(p, 0.05, 0.55));
    return h(Frame, { p, i, bg: P.ink, fg: P.cream, world: false, t: lt },
      h("div", { style: { position: "absolute", left: 64, right: 64, top: 700, fontFamily: T.FH, fontSize: 150, color: P.cream, textTransform: "uppercase", letterSpacing: `${lerp(0.52, -0.01, u)}em`, opacity: clamp01(u * 1.6) } }, splitLines(s.title)[0]),
      h("div", { style: { position: "absolute", left: 64, top: 960, width: lerp(0, 420, outCubic(seg(p, 0.4, 0.8))), height: 10, background: P.gold, borderRadius: 6 } }),
      h(Sub, { text: s.sub, top: 1030, fg: P.cream })
    );
  }

  // 3. tilted card + chips popping in sequence
  function Feature({ s, progress: p, localTime: lt, index: i }) {
    const u = outBack(seg(p, 0.06, 0.42));
    const chips = (s.chips || "").split("|").filter(Boolean);
    return h(Frame, { p, i, bg: P.roast, fg: P.cream, t: lt },
      h(Head, { text: s.title, size: 104, fg: P.cream, hi: P.ember, top: 250, upper: true }),
      h("div", { style: { position: "absolute", left: 64, top: 640, transform: `rotate(${lerp(-7, -2.2, u)}deg) translateY(${(1 - u) * 90}px)`, opacity: clamp01(u * 1.4), padding: 18, background: P.ink, borderRadius: 22, border: `2px solid ${rgba(P.cream, 0.25)}` } },
        h(MediaSlot, { url: s.img, cap: s.imgCap || "the order screen", w: 916, h: 516, fg: P.cream })),
      h("div", { style: { position: "absolute", left: 64, top: 1300, display: "flex", gap: 16, flexWrap: "wrap", width: 952 } },
        chips.map((c, k) => {
          const cu = outBack(seg(p, 0.46 + k * 0.09, 0.68 + k * 0.09));
          return h("div", { key: k, style: { background: k % 2 ? P.gold : P.ember, color: P.ink, fontFamily: T.FB, fontWeight: 700, fontSize: 30, padding: "14px 26px", borderRadius: 999, transform: `scale(${lerp(0.6, 1, cu)})`, opacity: clamp01(cu * 1.5) } }, c);
        })),
      h(Sub, { text: s.sub, top: 1500, fg: P.cream })
    );
  }

  // 4. counters rolling at different speeds with growing bars
  function Stats({ s, progress: p, localTime: lt, index: i }) {
    const rows = (s.rows || "").split("|").filter(Boolean).map((r) => r.split("~"));
    return h(Frame, { p, i, bg: P.cream, fg: P.ink, t: lt },
      h(Head, { text: s.title, size: 100, fg: P.ink, hi: P.ember, top: 260, upper: true }),
      h("div", { style: { position: "absolute", left: 64, right: 64, top: 620 } },
        rows.map((r, k) => {
          const u = outCubic(seg(p, 0.1 + k * 0.13, 0.62 + k * 0.13));
          const target = parseFloat(r[0]) || 0;
          const val = Math.round(target * u);
          return h("div", { key: k, style: { marginBottom: 74 } },
            h("div", { style: { fontFamily: T.FH, fontSize: 148, color: k === 1 ? P.ember : P.ink, lineHeight: 1 } }, val + (r[2] || "")),
            h("div", { style: { height: 14, background: rgba(P.ink, 0.12), borderRadius: 8, marginTop: 12 } },
              h("div", { style: { width: `${u * (55 + k * 18)}%`, height: "100%", background: k === 1 ? P.ember : P.gold, borderRadius: 8 } })),
            h("div", { style: { fontFamily: T.FB, fontSize: 34, color: rgba(P.ink, 0.7), marginTop: 12 } }, r[1] || ""));
        })),
      h(Sub, { text: s.sub, top: 1700, fg: P.ink })
    );
  }

  // 5. giant quote marks drawing themselves
  function Quote({ s, progress: p, localTime: lt, index: i }) {
    const draw = outCubic(seg(p, 0.05, 0.5));
    return h(Frame, { p, i, bg: P.roast, fg: P.cream, t: lt },
      h("svg", { width: 300, height: 220, style: { position: "absolute", left: 60, top: 500 } },
        h("path", {
          d: "M20,170 C20,60 80,20 140,20 M160,170 C160,60 220,20 280,20",
          stroke: P.gold, strokeWidth: 22, fill: "none", strokeLinecap: "round",
          strokeDasharray: 460, strokeDashoffset: 460 * (1 - draw),
        })),
      h(Head, { text: s.title, size: 112, fg: P.cream, hi: P.gold, top: 760, upper: false }),
      h(Sub, { text: s.sub, top: 1220, fg: P.cream })
    );
  }

  // 6. step timeline: spine draws, nodes pop alternately
  function Steps({ s, progress: p, localTime: lt, index: i }) {
    const items = (s.steps || "").split("|").filter(Boolean);
    const draw = outCubic(seg(p, 0.08, 0.7));
    return h(Frame, { p, i, bg: P.ink, fg: P.cream, t: lt },
      h(Head, { text: s.title, size: 96, fg: P.cream, hi: P.ember, top: 240, upper: true }),
      h("div", { style: { position: "absolute", left: 130, top: 620, width: 12, height: 900 * draw, background: rgba(P.gold, 0.55), borderRadius: 8 } }),
      items.map((it, k) => {
        const u = outBack(seg(p, 0.18 + k * 0.16, 0.44 + k * 0.16));
        return h("div", { key: k, style: { position: "absolute", left: 190, top: 640 + k * 300, opacity: clamp01(u * 1.4), transform: `translateX(${(1 - u) * 70}px)` } },
          h("div", { style: { position: "absolute", left: -96, top: 8, width: 52, height: 52, borderRadius: 999, background: P.ember, transform: `scale(${lerp(0.3, 1, u)})` } }),
          h("div", { style: { fontFamily: T.FH, fontSize: 62, color: P.cream, width: 780 } }, it));
      }),
      h(Sub, { text: s.sub, top: 1660, fg: P.cream })
    );
  }

  // 7. two large horizontal cards, staggered from alternating sides
  function Montage({ s, progress: p, localTime: lt, index: i }) {
    const caps = (s.caps || "|").split("|");
    return h(Frame, { p, i, bg: P.roast, fg: P.cream, t: lt },
      h(Head, { text: s.title, size: 92, fg: P.cream, hi: P.gold, top: 230, upper: true }),
      [0, 1].map((k) => {
        const u = outQuint(seg(p, 0.12 + k * 0.18, 0.5 + k * 0.18));
        return h("div", { key: k, style: { position: "absolute", left: 64, top: 620 + k * 620, opacity: clamp01(u * 1.3), transform: `translateX(${(1 - u) * (k ? 320 : -320)}px)` } },
          h(MediaSlot, { url: k ? s.img2 : s.img, cap: caps[k] || "", w: 952, h: 512, fg: P.cream }));
      }),
      h(Sub, { text: s.sub, top: 1810, fg: P.cream })
    );
  }

  // 8. CTA — logo circle, headline, button
  function Cta({ s, progress: p, localTime: lt, index: i }) {
    const u = outBack(seg(p, 0.08, 0.5));
    return h(Frame, { p, i, bg: P.ember, fg: P.ink, world: false, t: lt },
      h("div", { style: { position: "absolute", left: "50%", top: 560, width: 190, height: 190, marginLeft: -95, borderRadius: 999, background: P.ink, display: "grid", placeItems: "center", transform: `scale(${lerp(0.5, 1, u)})`, fontFamily: T.FH, color: P.ember, fontSize: 76 } }, "ER"),
      h(Head, { text: s.title, size: 124, fg: P.ink, hi: P.cream, top: 830, upper: true, align: "center" }),
      h("div", { style: { position: "absolute", left: "50%", top: 1180, transform: `translateX(-50%) scale(${lerp(0.8, 1, outBack(seg(p, 0.4, 0.72)))})`, background: P.ink, color: P.cream, fontFamily: T.FB, fontWeight: 700, fontSize: 38, padding: "24px 54px", borderRadius: 999 } }, s.btn || "Order a bag"),
      h("div", { style: { position: "absolute", left: 0, right: 0, top: 1340, textAlign: "center", fontFamily: T.FB, fontSize: 34, color: rgba(P.ink, 0.8) } }, s.sub || "")
    );
  }

  const SCENE_MAP = { Hook, Statement, Feature, Stats, Quote, Steps, Montage, Cta };

  // ---- the stage: ONE clock, elapsed time -> current scene ----------------
  function Stage() {
    const [scenes] = useState(() => {
      try { return JSON.parse(window.OM_SCENES); } catch { return []; }
    });
    const [t, setT] = useState(0);
    const raf = useRef(0), t0 = useRef(0), seeking = useRef(false);
    const total = scenes.reduce((a, s) => a + (Number(s.dur) || 3), 0) || 1;

    // ONE CLOCK, AND IT IS A GSAP TIMELINE.
    //
    // hyperframes renders by SEEKING, and it finds the composition by patching
    // gsap.timeline() into window.__timelines — that timeline is both its duration
    // source and its seek handle. A requestAnimationFrame clock fails the capture
    // outright ("Composition has zero duration … GSAP timeline: false"), and a
    // static data-duration clip does not rescue it. So the film owns one PAUSED
    // timeline whose only job is to hold the playhead: GSAP keeps the time, React
    // draws the frame, and every frame is a pure function of that time — which is
    // exactly what makes a seek reproducible.
    useEffect(() => {
      // The bundle already created and REGISTERED this timeline synchronously (see
      // film_bundle.js) — creating one here instead would miss window.__timelines
      // and the capture would report zero duration. Attach to it, don't replace it.
      const tl = window.__filmTimeline;
      if (!tl) return undefined;
      tl.eventCallback("onUpdate", () => setT(tl.time()));
      setT(tl.time());
      // Live browsing still wants it to play; a capture drives tl.time() itself, so
      // stop advancing the moment the renderer has moved the playhead for us.
      const t0m = performance.now();
      let last = -1;
      const tick = (now) => {
        const cur = tl.time();
        if (last >= 0 && Math.abs(cur - last) > 0.001 && !window.__filmSelfDriven) {
          return; // someone else (the renderer) owns the playhead
        }
        window.__filmSelfDriven = true;
        last = ((now - t0m) / 1000) % total;
        tl.time(last);
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
      return () => {
        if (raf.current) cancelAnimationFrame(raf.current);
        tl.eventCallback("onUpdate", null);
      };
    }, [total]);

    if (!scenes.length) return h("div", { style: { color: "#fff", fontFamily: "sans-serif", padding: 40 } }, "no scenes");
    const loop = t % total;
    let acc = 0, idx = 0, local = 0;
    for (let k = 0; k < scenes.length; k++) {
      const d = Number(scenes[k].dur) || 3;
      if (loop < acc + d) { idx = k; local = loop - acc; break; }
      acc += d;
    }
    const s = scenes[idx];
    const dur = Number(s.dur) || 3;
    const Comp = SCENE_MAP[s.name] || Statement;
    // class="clip" + data-duration is how the renderer learns the film's length;
    // without it the capture reports zero duration and the render fails outright.
    return h("div", {
      className: "clip",
      "data-start": 0,
      "data-duration": total,
      "data-track-index": 0,
      style: { position: "absolute", inset: 0, background: T.desk, overflow: "hidden" },
    }, h(Comp, { s, progress: clamp01(local / dur), index: idx, localTime: t, scene: s }));
  }

  window.EmberRoast = Stage;
  const mount = document.getElementById("root");
  if (mount) ReactDOM.createRoot(mount).render(h(Stage));
})();
