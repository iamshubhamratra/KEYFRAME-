/* motion-presets.js — KEYFRAME premium motion system.

   A reusable preset library for the progress-based film engine. Every preset is a
   PURE function of (progress, clock, index) returning a React style object, so
   presets compose and stay scrubbable — no imperative timeline to fall out of sync.

   Motion rules encoded here:
   - text never merely fades: blur -> sharp, with y travel and a word stagger
   - nothing linear-stops: everything settles with a ~2% overshoot
   - cards enter in 3D and then never park (floating idle)
   - transitions are camera/mask moves, never crossfades

   Exposes window.KFMotion.                                                    */
(function () {
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (p, a, b) => clamp01((p - a) / (b - a || 1e-6));
  const TAU = Math.PI * 2;

  const E = {
    power2Out: (t) => 1 - Math.pow(1 - t, 2),
    power3Out: (t) => 1 - Math.pow(1 - t, 3),
    power4Out: (t) => 1 - Math.pow(1 - t, 4),
    power4In: (t) => t * t * t * t,
    expoOut: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    sineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    // settles at 100% via ~102% — the premium overshoot, never a spring bounce
    settle: (t) => {
      const u = 1 - Math.pow(1 - t, 4);
      return u + Math.sin(clamp01(t) * Math.PI) * 0.022 * (1 - t);
    },
  };

  /* Compose preset outputs: transforms concatenate, opacities multiply,
     filters concatenate, everything else is a plain override. */
  function merge() {
    const out = {};
    const tf = [], fl = [];
    let op = 1, hasOp = false;
    for (let i = 0; i < arguments.length; i++) {
      const s = arguments[i];
      if (!s) continue;
      for (const k in s) {
        if (k === "transform") tf.push(s[k]);
        else if (k === "filter") fl.push(s[k]);
        else if (k === "opacity") { op *= s[k]; hasOp = true; }
        else out[k] = s[k];
      }
    }
    if (tf.length) out.transform = tf.join(" ");
    if (fl.length) out.filter = fl.join(" ");
    if (hasOp) out.opacity = clamp01(op);
    return out;
  }

  /* ---------------- text ---------------- */

  // Word i of a headline: blur 18 -> 0, y 40 -> 0, slight scale, 40ms-ish stagger.
  function wordStaggerBlur(p, i, o) {
    o = o || {};
    const start = o.start != null ? o.start : 0.02;
    const stagger = o.stagger != null ? o.stagger : 0.05;
    const dur = o.dur != null ? o.dur : 0.3;
    const t = E.power4Out(clamp01((p - start - i * stagger) / dur));
    return {
      opacity: clamp01(t * 1.7),
      filter: "blur(" + ((1 - t) * (o.blur != null ? o.blur : 18)).toFixed(2) + "px)",
      transform:
        "translateY(" + ((1 - t) * (o.y != null ? o.y : 40)).toFixed(2) + "px)" +
        " scale(" + lerp(0.965, 1, E.settle(t)).toFixed(4) + ")",
    };
  }

  // Hero word: draws as an outline, then the brand colour fills it left-to-right.
  function outlineFillReveal(p, color, o) {
    o = o || {};
    const start = o.start != null ? o.start : 0.04;
    const fillAt = o.fillAt != null ? o.fillAt : 0.26;
    const a = E.power3Out(clamp01(seg(p, start, start + 0.16)));
    const f = E.power3Out(clamp01(seg(p, fillAt, fillAt + 0.24)));
    const pct = (f * 100).toFixed(1) + "%";
    return {
      WebkitTextStroke: lerp(o.stroke != null ? o.stroke : 3, 0, f).toFixed(2) + "px " + color,
      backgroundImage: "linear-gradient(95deg, " + color + " " + pct + ", transparent " + pct + ")",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
      opacity: clamp01(a * 1.6),
      transform: "translateY(" + ((1 - a) * 26).toFixed(2) + "px)",
    };
  }

  // Keyword emphasis only — scale 1 -> 1.06, brightness 1 -> 1.15, soft glow.
  function headlineGlowPulse(clock, color, o) {
    o = o || {};
    const s = (Math.sin(clock * (o.speed != null ? o.speed : 2.1) + (o.phase || 0)) + 1) / 2;
    return {
      transform: "scale(" + lerp(1, o.max != null ? o.max : 1.06, s).toFixed(4) + ")",
      filter: "brightness(" + lerp(1, 1.15, s).toFixed(3) + ")",
      textShadow: "0 0 " + lerp(8, 34, s).toFixed(1) + "px " + color,
    };
  }

  // Character-by-character reveal via a wiping mask (no per-letter opacity pop).
  function characterReveal(p, i, total, o) {
    o = o || {};
    const start = o.start != null ? o.start : 0.03;
    const span = o.span != null ? o.span : 0.42;
    const per = span / Math.max(1, total);
    const t = E.power3Out(clamp01((p - start - i * per) / (per * 4 + 0.08)));
    return {
      opacity: clamp01(t * 2),
      filter: "blur(" + ((1 - t) * 10).toFixed(2) + "px)",
      transform: "translateY(" + ((1 - t) * 26).toFixed(2) + "px)",
    };
  }

  // Morph one word out / the next in, leaving the rest of the line untouched.
  function wordMorph(p, steps, o) {
    o = o || {};
    const n = Math.max(1, steps.length);
    const raw = clamp01(p) * n;
    const idx = Math.min(n - 1, Math.floor(raw));
    const local = raw - idx;
    const outT = E.power4In(clamp01(seg(local, 0.78, 1)));
    const inT = E.power4Out(clamp01(seg(local, 0, 0.2)));
    return {
      word: steps[idx],
      index: idx,
      style: {
        opacity: clamp01((1 - outT) * inT * 1.8),
        filter: "blur(" + ((1 - inT) * 12 + outT * 12).toFixed(2) + "px)",
        transform: "translateY(" + ((1 - inT) * 30 - outT * 30).toFixed(2) + "px)",
      },
    };
  }

  /* ---------------- cards + UI ---------------- */

  // The card entrance: 3D rise out of blur, shadow grows with it.
  function cardRise3D(p, o) {
    o = o || {};
    const start = o.start != null ? o.start : 0.08;
    const dur = o.dur != null ? o.dur : 0.34;
    const t = E.settle(clamp01(seg(p, start, start + dur)));
    const shadow = o.shadow === false;
    const st = {
      opacity: clamp01(t * 1.6),
      filter: "blur(" + ((1 - t) * 12).toFixed(2) + "px)",
      transform:
        "translateY(" + ((1 - t) * 80).toFixed(1) + "px)" +
        " rotateX(" + ((1 - t) * 12).toFixed(2) + "deg)" +
        " rotateY(" + ((1 - t) * -8).toFixed(2) + "deg)" +
        " scale(" + lerp(0.92, 1, t).toFixed(4) + ")",
    };
    if (!shadow) {
      st.boxShadow =
        "0 " + lerp(12, 46, t).toFixed(0) + "px " + lerp(24, 68, t).toFixed(0) +
        "px rgba(26,22,20," + lerp(0.04, 0.26, t).toFixed(3) + ")";
    }
    return st;
  }

  // Nothing parks: a slow sine drift on y and rotation, 4-6s period.
  function floatingIdle(clock, i, o) {
    o = o || {};
    const period = o.period != null ? o.period : 5;
    const a = clock * (TAU / period) + (i || 0) * 1.7;
    return {
      transform:
        "translateY(" + (Math.sin(a) * (o.y != null ? o.y : 5)).toFixed(2) + "px)" +
        " rotate(" + (Math.sin(a * 0.7) * (o.rot != null ? o.rot : 0.8)).toFixed(3) + "deg)",
    };
  }

  // Outgoing card sinks back and left while the incoming one slides over it.
  function cardStackTransition(p, o) {
    o = o || {};
    const at = o.at != null ? o.at : 0.55;
    const t = E.power3Out(clamp01(seg(p, at, at + (o.dur != null ? o.dur : 0.22))));
    return {
      outgoing: {
        opacity: lerp(1, 0.7, t),
        filter: "blur(" + (t * 3).toFixed(2) + "px)",
        transform: "translateX(" + (t * -190).toFixed(1) + "px) scale(" + lerp(1, 0.95, t).toFixed(4) + ")",
      },
      // 200ms overlap: the incoming card is already moving before the old one settles
      incoming: {
        opacity: clamp01(E.power3Out(clamp01(seg(p, at - 0.06, at + 0.16))) * 1.5),
        transform:
          "translateX(" + ((1 - E.settle(clamp01(seg(p, at - 0.06, at + 0.2)))) * 260).toFixed(1) + "px)" +
          " scale(" + lerp(0.96, 1, E.settle(clamp01(seg(p, at - 0.06, at + 0.2)))).toFixed(4) + ")",
      },
      t,
    };
  }

  // Cursor travels a path, lands, clicks; ripple + press feed back into the UI.
  function cursorClickRipple(p, path, o) {
    o = o || {};
    const arrive = o.arrive != null ? o.arrive : 0.46;
    const t = E.power3Out(clamp01(seg(p, o.start != null ? o.start : 0.12, arrive)));
    const legs = Math.max(1, path.length - 1);
    const raw = t * legs;
    const i = Math.min(legs - 1, Math.floor(raw));
    const f = E.sineInOut(raw - i);
    const a = path[i], b = path[i + 1] || path[i];
    const click = clamp01(seg(p, arrive, arrive + 0.06));
    const ripple = clamp01(seg(p, arrive, arrive + 0.26));
    return {
      x: lerp(a[0], b[0], f),
      y: lerp(a[1], b[1], f),
      pressed: click > 0 && ripple < 0.35,
      cursorStyle: {
        opacity: clamp01(seg(p, 0.08, 0.16)) * (1 - clamp01(seg(p, 0.9, 1))),
        transform: "scale(" + lerp(1, 0.86, Math.sin(click * Math.PI)).toFixed(3) + ")",
      },
      rippleStyle: ripple > 0 && ripple < 1
        ? { opacity: (1 - ripple) * 0.5, transform: "scale(" + lerp(0.2, 2.6, E.power2Out(ripple)).toFixed(3) + ")" }
        : { opacity: 0, transform: "scale(0.2)" },
      // the control the cursor hit reacts rather than sitting inert
      targetStyle: { transform: "scale(" + lerp(1, 0.97, Math.sin(click * Math.PI)).toFixed(4) + ")" },
    };
  }

  function buttonPress(clock, o) {
    o = o || {};
    const period = o.period != null ? o.period : 3.2;
    const ph = (clock % period) / period;
    const press = ph < 0.08 ? Math.sin((ph / 0.08) * Math.PI) : 0;
    return {
      transform: "scale(" + lerp(1, 0.965, press).toFixed(4) + ") translateY(" + (press * 2).toFixed(2) + "px)",
      filter: "brightness(" + lerp(1, 1.08, press).toFixed(3) + ")",
    };
  }

  // Rows arrive on a stagger as the list scrolls, rather than teleporting in.
  function scrollReveal(p, i, o) {
    o = o || {};
    const start = o.start != null ? o.start : 0.16;
    const stagger = o.stagger != null ? o.stagger : 0.05;
    const t = E.power4Out(clamp01((p - start - i * stagger) / 0.26));
    return {
      opacity: clamp01(t * 1.8),
      filter: "blur(" + ((1 - t) * 8).toFixed(2) + "px)",
      transform: "translateY(" + ((1 - t) * 44).toFixed(1) + "px)",
    };
  }

  // Continuous scroll offset for a list. Takes MEASURED geometry (track height and
  // viewport height in px) rather than a row count, so the travel is exactly the real
  // overflow and the track can never scroll past its own last row.
  function listScroll(p, trackPx, viewportPx, o) {
    o = o || {};
    const t = E.sineInOut(clamp01(seg(p, o.start != null ? o.start : 0.3, o.end != null ? o.end : 0.95)));
    return -t * Math.max(0, (trackPx || 0) - (viewportPx || 0));
  }

  function counterAnimate(p, to, o) {
    o = o || {};
    const t = E.expoOut(clamp01(seg(p, o.start != null ? o.start : 0.12, o.end != null ? o.end : 0.62)));
    const v = to * t;
    const txt = Math.abs(to % 1) > 0 ? v.toFixed(1) : Math.round(v).toLocaleString();
    return { value: v, text: txt, t };
  }

  /* ---------------- camera, depth, ambience ---------------- */

  // Continuous camera motion for the whole scene, plus a directional in/out so the
  // cut between scenes IS a camera move rather than a crossfade.
  function slowCameraPush(p, clock, kind, o) {
    o = o || {};
    const amt = o.amount != null ? o.amount : 1;
    const ein = E.power4Out(clamp01(seg(p, 0, 0.2)));
    const eout = E.power4In(clamp01(seg(p, 0.82, 1)));
    const A = (1 - ein) * amt, B = eout * amt;
    let x = 0, y = 0, s = 1, r = 0;
    switch (kind) {
      case "pushIn": s = lerp(1.1, 1, ein) * lerp(1, 0.97, eout); break;
      case "pullOut": s = lerp(0.94, 1, ein) * lerp(1, 1.05, eout); break;
      case "panLeft": x = A * 150 - B * 110; break;
      case "panRight": x = -A * 150 + B * 110; break;
      case "tiltUp": y = A * 170 - B * 130; break;
      case "tiltDown": y = -A * 170 + B * 130; break;
      case "orbit": x = A * 110 - B * 90; r = A * 1.6 - B * 1.2; s = lerp(1.06, 1, ein); break;
      default: s = lerp(1.05, 1, ein);
    }
    // the slow continuous drift underneath — no scene is ever fully still
    const dx = Math.sin(clock * 0.22) * 9 * amt;
    const dy = Math.cos(clock * 0.27) * 7 * amt;
    const dz = 1 + p * 0.035 * amt;
    return {
      transform:
        "translate(" + (x + dx).toFixed(2) + "px," + (y + dy).toFixed(2) + "px)" +
        " rotate(" + r.toFixed(3) + "deg)" +
        " scale(" + (s * dz).toFixed(4) + ")",
    };
  }

  // Depth: nearer layers travel further. depth 0 = far, 1 = near.
  //
  // Returns a RESOLVED BOX, not just a transform. A transform makes the element the
  // containing block for its absolutely positioned descendants, and a wrapper holding only
  // absolute children has no in-flow content, so it computes to height 0. Any full-bleed
  // `inset: 0` child then resolves against that 0-height box and — if it clips its own
  // overflow, as a backdrop layer must — paints nothing at all, silently. Pinning the
  // wrapper to its parent keeps the transform and gives children a real box to resolve to.
  function parallaxLayers(p, clock, depth, o) {
    o = o || {};
    const amt = (o.amount != null ? o.amount : 1) * depth;
    return {
      position: "absolute",
      inset: 0,
      transform:
        "translate(" + (Math.sin(clock * 0.3) * 16 * amt).toFixed(2) + "px," +
        (Math.cos(clock * 0.24) * 12 * amt - p * 34 * amt).toFixed(2) + "px)" +
        " scale(" + (1 + depth * 0.03).toFixed(4) + ")",
    };
  }

  // Subtle specular sweep across a card's top edge, every `period` seconds.
  function lightSweep(clock, o) {
    o = o || {};
    const period = o.period != null ? o.period : 4;
    const ph = (clock % period) / period;
    const on = ph < 0.32;
    const k = on ? ph / 0.32 : 0;
    return {
      opacity: on ? Math.sin(k * Math.PI) * (o.strength != null ? o.strength : 0.5) : 0,
      transform: "translateX(" + lerp(-60, 160, k).toFixed(1) + "%) skewX(-18deg)",
    };
  }

  // Depth wipe / panel slide between scenes — a mask move, never a crossfade.
  function maskedSceneTransition(p, dir, o) {
    o = o || {};
    // Entry reveal ONLY. If the mask also closed on exit, the outgoing scene and the
    // incoming scene would both be fully clipped at the cut and the frame would go
    // black — the exit is carried by the camera move instead.
    const inT = E.power4Out(clamp01(seg(p, 0, o.inDur != null ? o.inDur : 0.12)));
    const k = 1 - inT;
    const clip = {
      up: "inset(" + (k * 100).toFixed(2) + "% 0 0 0)",
      down: "inset(0 0 " + (k * 100).toFixed(2) + "% 0)",
      left: "inset(0 0 0 " + (k * 100).toFixed(2) + "%)",
      right: "inset(0 " + (k * 100).toFixed(2) + "% 0 0)",
    }[dir || "up"];
    return { clipPath: clip, WebkitClipPath: clip };
  }

  /* Direction rotation so no two consecutive scenes move the same way. */
  const CAMERA_CYCLE = ["pushIn", "panLeft", "tiltUp", "orbit", "panRight", "pullOut", "tiltDown"];
  const WIPE_CYCLE = ["up", "left", "down", "right"];
  const cameraFor = (i) => CAMERA_CYCLE[i % CAMERA_CYCLE.length];
  const wipeFor = (i) => WIPE_CYCLE[i % WIPE_CYCLE.length];

  window.KFMotion = {
    clamp01, lerp, seg, E, merge,
    wordStaggerBlur, outlineFillReveal, headlineGlowPulse, characterReveal, wordMorph,
    cardRise3D, floatingIdle, cardStackTransition, cursorClickRipple, buttonPress,
    scrollReveal, listScroll, counterAnimate,
    slowCameraPush, parallaxLayers, lightSweep, maskedSceneTransition,
    cameraFor, wipeFor, CAMERA_CYCLE, WIPE_CYCLE,
  };
})();
