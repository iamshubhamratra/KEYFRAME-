/* KEYFRAME long-form BACKGROUND ENGINE
   A reusable, scene-reactive background system for the 16:9 long-form templates.
   Loaded after film-kit.js; exposes window.BGEngine.

   Layer order, back to front:
     base wash → gradient mesh → depth bands → ambient orbs → animated grid
     → data flow → decorative objects → particle field → light sweep
     → morph shape → grain → vignette
   Everything except the vignette sits inside one camera-drift wrapper, so the
   whole world breathes and drifts as a unit.

   Contract: make(cfg) returns a ground function (bg, p, T, name) suitable for
   FilmKit.makeScene's ground hook.

   Capture safety: every gradient string and node position is computed once at
   construction. Per frame only transforms, opacities and a few numeric
   attributes change, so DOM capture (thumbnails, frame export) stays cheap. No
   Math.random at render time — all scatter is deterministic, so a given frame
   always draws identically. */
(function () {
  const K = window.FilmKit;
  const R = (t, p, c) => window.React.createElement(t, p, c);
  const A = (c, a) => K.alpha(c, a);

  /* ---- scene states: what the background does for each kind of beat ----
     bright — luminance lift of mesh and orbs      energy — particle speed
     grid   — structured grid strength             flow   — data-layer strength
     vig    — vignette strength                    sweep  — light-sweep rate
     orb    — ambient orb scale                                             */
  const STATES = {
    INTRO:    { bright: 0.85, energy: 0.55, grid: 0.00, flow: 0.00, vig: 0.30, sweep: 1.0, orb: 1.15 },
    PROBLEM:  { bright: 0.55, energy: 0.45, grid: 0.00, flow: 0.00, vig: 0.62, sweep: 0.4, orb: 0.85 },
    SOLUTION: { bright: 1.15, energy: 1.10, grid: 0.15, flow: 0.20, vig: 0.24, sweep: 1.4, orb: 1.30 },
    FEATURE:  { bright: 1.00, energy: 0.85, grid: 0.35, flow: 0.45, vig: 0.34, sweep: 0.9, orb: 1.05 },
    DATA:     { bright: 0.90, energy: 0.70, grid: 0.85, flow: 0.75, vig: 0.40, sweep: 0.5, orb: 0.80 },
    MOMENT:   { bright: 1.30, energy: 1.40, grid: 0.00, flow: 0.00, vig: 0.20, sweep: 2.0, orb: 1.55 },
    CTA:      { bright: 1.20, energy: 0.75, grid: 0.10, flow: 0.00, vig: 0.18, sweep: 1.2, orb: 1.35 },
  };
  const lerpS = (a, b, t) => { const o = {}; for (const k in a) o[k] = a[k] + (b[k] - a[k]) * t; return o; };

  function make(cfg) {
    const W = cfg.W || 1920, H = cfg.H || 1080;
    const C = cfg.C;                    /* the template's resolved palette */
    const states = cfg.states || {};    /* scene name → state name */
    const order = cfg.order || [];      /* scene names in playback order */
    const decor = cfg.decor;            /* (t, s, u) => React node */
    const AMB = cfg.ambient || 1;
    const hues = cfg.hues || [C.accent, C.accent2, C.accent];
    const inkOn = cfg.ink || C.ink;
    const lightOn = cfg.light || C.cream || '#ffffff';

    /* ---- built once ---- */
    const MESH = [0, 1, 2, 3].map((i) => ({
      x: [22, 74, 52, 86][i], y: [28, 66, 88, 18][i],
      rx: [46, 42, 38, 30][i], ry: [40, 38, 34, 28][i], c: hues[i % hues.length],
    }));
    const NODES = Array.from({ length: 16 }).map((_, i) => [
      140 + K.rnd(i) * (W - 280), 120 + K.rnd(i + 31) * (H - 240)]);
    const EDGES = [];
    NODES.forEach((a, i) => NODES.forEach((b, j) => {
      if (j > i && Math.hypot(a[0] - b[0], a[1] - b[1]) < 360) EDGES.push([i, j]);
    }));
    /* three depth tiers, so parallax reads as distance */
    const DUST = Array.from({ length: 34 }).map((_, i) => ({
      x: K.rnd(i) * W, y: K.rnd(i + 60) * H, d: 0.35 + (i % 3) * 0.33,
      r: 1.6 + (i % 3) * 1.7 + K.rnd(i + 9) * 1.4,
      sp: 8 + K.rnd(i + 17) * 22, sw: 26 + K.rnd(i + 23) * 70,
    }));
    const GRAIN = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">' +
      '<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3"/>' +
      '<feColorMatrix type="saturate" values="0"/></filter>' +
      '<rect width="180" height="180" filter="url(#n)" opacity="0.5"/></svg>') + '")';
    const meshCss = MESH.map((m) => 'radial-gradient(ellipse ' + m.rx + '% ' + m.ry + '% at ' +
      m.x + '% ' + m.y + '%, ' + A(m.c, 0.5) + ', transparent 72%)').join(', ');
    const stateOf = (n) => STATES[states[n] || cfg.fallback || 'FEATURE'] || STATES.FEATURE;

    /* ---- the ground function makeScene calls each frame ---- */
    return function ground(bg, p, T, name) {
      const t = T * AMB;
      const dark = K.isDark(bg);
      /* Blend out of the previous scene's state over the first fifth, so the
         background transforms between scenes rather than switching. */
      const at = order.indexOf(name);
      const prev = at > 0 ? stateOf(order[at - 1]) : stateOf(name);
      const s = lerpS(prev, stateOf(name), K.ease.inOut(Math.min(p / 0.2, 1)));
      /* Section evolution: five chapters across the runtime, each nudging the
         mesh further round the palette without changing identity. */
      const sect = Math.min(4, Math.floor((T / (cfg.total || 300)) * 5));
      const u = { W: W, H: H, t: t, s: s, dark: dark, sect: sect, ink: dark ? lightOn : inkOn };

      const camX = Math.sin(t * 0.06) * 26 + Math.sin(t * 0.021) * 16;
      const camY = Math.cos(t * 0.05) * 18;
      const camZ = 1.03 + Math.sin(t * 0.075) * 0.018;
      const L = [];

      /* 1 — gradient mesh */
      L.push(R('div', { key: 'mesh', style: {
        position: 'absolute', inset: '-14%', background: meshCss,
        opacity: (dark ? 0.5 : 0.42) * s.bright, filter: 'blur(38px)',
        transform: 'translate(' + (Math.sin(t * 0.08) * 44) + 'px,' + (Math.cos(t * 0.065) * 34) + 'px) scale(' +
          (1.04 + Math.sin(t * 0.05 + sect) * 0.05) + ') rotate(' + (Math.sin(t * 0.02) * 4) + 'deg)',
      } }));

      /* 2 — depth bands */
      L.push(R('div', { key: 'depth', style: { position: 'absolute', inset: 0, overflow: 'hidden' } },
        [0, 1, 2].map((i) => R('div', { key: i, style: {
          position: 'absolute', left: 0, right: 0, bottom: -40 + i * 30, height: 260 + i * 200,
          background: 'linear-gradient(180deg, transparent, ' + A(i === 1 ? C.accent2 : C.accent, 0.1 + i * 0.05) + ')',
          opacity: 0.7 * s.bright,
          transform: 'translateX(' + (Math.sin(t * (0.03 + i * 0.02)) * (30 + i * 40)) + 'px) scaleY(' +
            (1 + Math.sin(t * 0.06 + i) * 0.04) + ')',
        } }))));

      /* 3 — ambient orbs */
      L.push(R('div', { key: 'orbs', style: { position: 'absolute', inset: 0 } },
        [0, 1].map((i) => R('div', { key: i, style: {
          position: 'absolute', left: (i ? 0.72 : 0.2) * W - 400, top: (i ? 0.68 : 0.24) * H - 400,
          width: 800, height: 800, borderRadius: 999,
          background: 'radial-gradient(circle, ' + A(i ? C.accent2 : C.accent, 0.3) + ', transparent 68%)',
          filter: 'blur(30px)', opacity: 0.7 * s.orb * s.bright,
          transform: 'translate(' + (Math.sin(t * 0.045 + i * 2) * 90) + 'px,' + (Math.cos(t * 0.038 + i) * 70) + 'px) scale(' +
            (0.9 + Math.sin(t * 0.07 + i * 1.6) * 0.14) + ')',
        } }))));

      /* 4 — animated grid, with lit intersections */
      if (s.grid > 0.02) {
        const g = A(u.ink, 0.14 * s.grid);
        L.push(R('div', { key: 'grid', style: {
          position: 'absolute', inset: '-8%', opacity: s.grid,
          background: 'linear-gradient(' + g + ' 1px, transparent 1px), linear-gradient(90deg, ' + g + ' 1px, transparent 1px)',
          backgroundSize: '92px 92px',
          transform: 'perspective(900px) rotateX(' + (2 + Math.sin(t * 0.05) * 1.4) + 'deg) translate(' +
            ((t * 5) % 92 - 92) + 'px,' + ((t * 3) % 92 - 92) + 'px)',
        } }));
        L.push(R('svg', { key: 'gx', width: W, height: H, style: { position: 'absolute', inset: 0, opacity: s.grid } },
          [0, 1, 2, 3, 4].map((i) => {
            const b = (Math.sin(t * 0.9 + i * 1.3) + 1) / 2;
            return R('circle', { key: i, cx: 230 + i * 368, cy: 200 + ((i * 197) % (H - 400)),
              r: 3 + b * 5, fill: A(C.accent, 0.2 + b * 0.5) });
          })));
      }

      /* 5 — data flow */
      if (s.flow > 0.02) {
        L.push(R('svg', { key: 'flow', width: W, height: H, style: { position: 'absolute', inset: 0, opacity: s.flow * 0.9 } },
          EDGES.map(([a, b], i) => R('line', { key: 'e' + i,
            x1: NODES[a][0], y1: NODES[a][1], x2: NODES[b][0], y2: NODES[b][1],
            stroke: A(u.ink, 0.1), strokeWidth: 1 }))
            .concat(EDGES.filter((_, i) => i % 3 === 0).map(([a, b], i) => {
              const ph = (t * 0.16 + i * 0.21) % 1;
              return R('circle', { key: 'p' + i,
                cx: NODES[a][0] + (NODES[b][0] - NODES[a][0]) * ph,
                cy: NODES[a][1] + (NODES[b][1] - NODES[a][1]) * ph,
                r: 4, fill: A(C.accent, 0.55) });
            }))
            .concat(NODES.map(([x, y], i) => R('circle', { key: 'n' + i, cx: x, cy: y,
              r: 2.4 + ((Math.sin(t * 1.4 + i) + 1) / 2) * 2.6,
              fill: A(i % 4 === 0 ? C.accent : u.ink, 0.34) })))));
      }

      /* 6 — the template's own decorative world */
      if (decor) L.push(R('div', { key: 'decor', style: { position: 'absolute', inset: 0 } }, decor(t, s, u)));

      /* 7 — particle field, three depth tiers */
      L.push(R('svg', { key: 'dust', width: W, height: H, style: { position: 'absolute', inset: 0 } },
        DUST.map((d, i) => {
          const y = H + 60 - ((d.y + t * d.sp * s.energy) % (H + 120));
          const x = d.x + Math.sin(t * 0.3 * d.d + i) * d.sw * d.d;
          return R('circle', { key: i, cx: x, cy: y, r: d.r * d.d,
            fill: A(i % 5 === 0 ? C.accent : u.ink, (dark ? 0.3 : 0.2) * d.d) });
        })));

      /* 8 — light sweep: enters off-frame, crosses, fades, waits, returns */
      const cyc = 13 / Math.max(0.25, s.sweep);
      const swp = (t % cyc) / cyc;
      if (swp < 0.55) {
        const k = swp / 0.55;
        L.push(R('div', { key: 'sweep', style: {
          position: 'absolute', top: '-30%', bottom: '-30%', left: 0, width: 460,
          background: 'linear-gradient(90deg, transparent, ' + A(lightOn, dark ? 0.14 : 0.3) + ', transparent)',
          filter: 'blur(24px)', transform: 'translateX(' + (-500 + k * (W + 1000)) + 'px) rotate(14deg)',
          opacity: Math.sin(k * Math.PI) * 0.9,
        } }));
      }

      /* 9 — morph shape: at a boundary a soft form expands, deforms and clears,
             so the background carries the cut instead of being interrupted */
      if (p < 0.26) {
        const m = K.ease.out(p / 0.26);
        const a1 = 42 + Math.sin(t * 0.9) * 16, b1 = 58 + Math.cos(t * 0.8) * 16;
        L.push(R('div', { key: 'morph', style: {
          position: 'absolute', left: '50%', top: '50%', width: 1500, height: 1500, marginLeft: -750, marginTop: -750,
          background: 'radial-gradient(circle, ' + A(C.accent, 0.22) + ', transparent 70%)',
          borderRadius: a1 + '% ' + (100 - a1) + '% ' + b1 + '% ' + (100 - b1) + '% / ' +
            b1 + '% ' + a1 + '% ' + (100 - a1) + '% ' + (100 - b1) + '%',
          transform: 'scale(' + (0.2 + m * 1.5) + ') rotate(' + (m * 60) + 'deg)',
          opacity: (1 - m) * 0.9, filter: 'blur(20px)',
        } }));
      }

      /* 10 — animated grain */
      L.push(R('div', { key: 'grain', style: {
        position: 'absolute', inset: '-10%', backgroundImage: GRAIN, backgroundRepeat: 'repeat',
        opacity: dark ? 0.05 : 0.035, mixBlendMode: 'overlay',
        transform: 'translate(' + ((t * 37) % 180 - 180) + 'px,' + ((t * 23) % 180 - 180) + 'px)',
      } }));

      return R('div', { style: { position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' } },
        /* one camera for the whole world, so every layer drifts together */
        R('div', { style: { position: 'absolute', inset: 0,
          transform: 'translate(' + camX + 'px,' + camY + 'px) scale(' + camZ + ')', willChange: 'transform' } }, L),
        /* 11 — dynamic vignette, outside the drift so the frame edge stays put */
        R('div', { style: { position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 78% 74% at 50% 48%, transparent 46%, ' +
            A(dark ? '#000000' : inkOn, 0.5 * s.vig) + ' 100%)' } }));
    };
  }

  window.BGEngine = { make: make, STATES: STATES };
})();
