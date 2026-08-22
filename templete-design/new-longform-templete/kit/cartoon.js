/* KEYFRAME cartoon character set — shared decor figures for the long-form films.
   Every figure is drawn in a consistent cartoon idiom rather than assembled from
   plain geometry: a heavy dark outline on every form, rounded silhouettes with no
   straight edges, a lighter belly/underside tone for volume, big eyes with a white
   sclera and an offset highlight dot, blush patches, and a simple mouth. Figures
   squash and stretch on the beat instead of translating rigidly.

   Palette-agnostic: every function takes P = {ink, body, body2, belly, accent,
   accent2, cream, blush} and time t in seconds. Geometry is authored in a local
   box and positioned by the caller's transform, so nothing here depends on frame
   size. No Math.random at render time — figures draw identically for a given t,
   which keeps frame export stable. */
(function () {
  const h = React.createElement;
  const P0 = { ink: '#201e1d', body: '#c67139', body2: '#a35a25', belly: '#f3e3cc', accent: '#c67139', accent2: '#7a8a5e', cream: '#fdf8ef', blush: '#e08b6a' };
  const pal = (P) => Object.assign({}, P0, P || {});

  /* every form gets the same heavy outline — this is what makes it read as cartoon */
  const OL = (P, w) => ({ stroke: P.ink, strokeWidth: w || 5, strokeLinejoin: 'round', strokeLinecap: 'round' });
  const g = (props, ...kids) => h('g', props, ...kids);
  const path = (d, fill, P, w) => h('path', Object.assign({ d, fill: fill || 'none' }, OL(P, w)));
  const ell = (cx, cy, rx, ry, fill, P, w, extra) => h('ellipse', Object.assign({ cx, cy, rx, ry, fill }, OL(P, w), extra || {}));
  const cir = (cx, cy, r, fill, P, w) => h('circle', Object.assign({ cx, cy, r, fill }, OL(P, w)));

  /* Cartoon eye: white sclera, dark pupil that can look around, offset highlight.
     blink closes it to a curved lash line rather than shrinking the whole eye. */
  function eye(x, y, r, P, o) {
    o = o || {};
    const lookX = (o.lookX || 0) * r * 0.34, lookY = (o.lookY || 0) * r * 0.34;
    if (o.blink > 0.5) return g({ key: o.key },
      path(`M${x - r} ${y} q ${r} ${r * 0.85} ${r * 2} 0`, 'none', P, 4));
    return g({ key: o.key },
      cir(x, y, r, P.cream, P, 4),
      o.slit
        ? ell(x + lookX, y + lookY, r * 0.3, r * 0.72, P.ink, P, 0)
        : cir(x + lookX, y + lookY, r * 0.52, P.ink, P, 0),
      h('circle', { cx: x + lookX - r * 0.24, cy: y + lookY - r * 0.28, r: r * 0.2, fill: P.cream }));
  }
  const blush = (x, y, rx, P, op) => ell(x, y, rx, rx * 0.62, P.blush, P, 0, { opacity: op == null ? 0.5 : op });
  const smile = (x, y, w, P, up) => path(`M${x - w} ${y} q ${w} ${(up == null ? 1 : up) * w * 0.7} ${w * 2} 0`, 'none', P, 4);

  /* ---------------- DOG ----------------
     Side profile. The head is ONE silhouette path with the snout built into the
     outline — an overlapping pale muzzle ellipse reads as a smudge at small size.
     A drawn neck separates head from barrel, the rear leg carries a haunch so it
     differs from the front, and the near ear hangs forward over the cheek. */
  function dog(t, P, o) {
    P = pal(P); o = o || {};
    const s = o.speed == null ? 1 : o.speed;
    const ph = t * 2.6 * s;
    const bob = Math.sin(ph * 2) * 3;
    const sq = 1 + Math.sin(ph * 2) * 0.03;
    const tail = Math.sin(t * 8.5 * s) * 24;
    const ear = Math.sin(ph * 2 + 0.6) * 13;
    const blinkP = (t * 0.4) % 1;
    const tongueOut = Math.sin(ph) > 0.35;

    /* limb: ink underlay wider than the colour on top, so it outlines */
    const limb = (d, col, w) => g(null,
      path(d, 'none', Object.assign({}, P, { ink: P.ink }), w + 8),
      path(d, 'none', Object.assign({}, P, { ink: col }), w));

    /* rear leg swings from a haunch — knee kicks backward, paw forward */
    const rear = (phase, col) => {
      const a = Math.sin(ph + phase), b = Math.cos(ph + phase);
      const kx = -30 + a * 5, px = -20 + a * 15, py = 56 - Math.max(0, b) * 10;
      return g(null,
        limb(`M-24 6 Q ${kx} 22 ${kx + 3} 32`, col, 18),
        limb(`M${kx + 3} 32 Q ${px} 44 ${px} ${py}`, col, 14),
        ell(px + 3, py + 3, 11, 7, col, P, 5));
    };
    /* front leg is straighter, hung from the shoulder */
    const front = (phase, col) => {
      const a = Math.sin(ph + phase), b = Math.cos(ph + phase);
      const kx = 30 + a * 10, px = 32 + a * 17, py = 56 - Math.max(0, b) * 11;
      return g(null,
        limb(`M28 8 Q ${kx} 24 ${kx} 34`, col, 16),
        limb(`M${kx} 34 Q ${px} 46 ${px} ${py}`, col, 13),
        ell(px + 3, py + 3, 10, 7, col, P, 5));
    };

    return g({ transform: o.transform },
      /* far pair, behind the barrel and darkened for depth */
      g({ opacity: 0.9 }, rear(Math.PI, P.body2), front(Math.PI * 0.5, P.body2)),
      /* tail, curling up off the haunch */
      g({ transform: `rotate(${tail} -36 -14)` },
        path('M-36 -14 Q -58 -24 -56 -44 Q -54 -58 -38 -56', 'none', P, 21),
        path('M-36 -14 Q -58 -24 -56 -44 Q -54 -58 -38 -56', 'none', Object.assign({}, P, { ink: P.body }), 13),
        cir(-38, -56, 8, P.belly, P, 5)),
      g({ transform: `translate(0 ${bob}) scale(1 ${sq})`, style: { transformOrigin: '0px 56px' } },
        /* haunch mass behind the barrel */
        cir(-24, -2, 21, P.body2, P, 6),
        /* neck, drawn before the barrel so the barrel laps over it */
        path('M22 -20 Q 38 -34 54 -32 L 58 -10 Q 40 -4 26 -12 Z', P.body, P, 6),
        /* barrel: rising back, deep chest, tucked belly */
        path('M-38 0 Q -46 -20 -26 -26 Q 0 -34 24 -27 Q 44 -21 44 -3 Q 44 13 30 17 Q 6 23 -14 19 Q -34 15 -38 0 Z', P.body, P, 6),
        path('M-30 9 Q 2 21 34 11 Q 30 19 10 21 Q -18 23 -30 11 Z', P.belly, P, 0),
        /* near pair */
        rear(0, P.body), front(Math.PI * 1.5, P.body),
        /* head: one profile silhouette, snout included */
        g({ transform: `translate(56 -36) rotate(${Math.sin(ph * 2) * 2.5})` },
          path('M-26 -22 Q -15 -40 5 -37 Q 23 -34 29 -18 Q 44 -16 51 -7 Q 55 -1 50 4 Q 43 8 33 7 Q 29 15 19 17 Q 0 21 -17 11 Q -30 2 -26 -22 Z', P.body, P, 6),
          /* darker crown patch, following the skull curve */
          path('M-22 -24 Q -12 -38 5 -35 Q 18 -33 25 -22 Q 6 -30 -22 -24 Z', P.body2, P, 0),
          /* nose at the snout tip, and the lip line */
          ell(48, -2, 8, 6.5, P.ink, P, 0),
          path('M50 -5 q 3 -4 6 -1', 'none', Object.assign({}, P, { ink: P.cream }), 2.4),
          path('M42 6 Q 34 10 27 8', 'none', P, 3.6),
          tongueOut ? path('M34 9 q 8 12 17 6 q -3 -10 -9 -11 Z', P.blush, P, 4) : null,
          /* eye high and forward on the skull, clear of the snout */
          eye(11, -18, 8, P, { blink: blinkP > 0.94 ? 1 : 0, lookX: 0.55, key: 'e' }),
          path('M2 -30 q 8 -3 15 2', 'none', P, 3.2),        /* brow */
          blush(-8, 2, 9, P, 0.4),
          /* near ear, hanging forward over the cheek */
          g({ transform: `rotate(${ear} -10 -24)` },
            path('M-12 -26 Q -34 -18 -32 10 Q -30 30 -8 25 Q 2 6 -2 -22 Z', P.body2, P, 6),
            h('path', { d: 'M-14 -20 Q -27 -14 -26 6 Q -25 20 -12 18 Q -6 4 -8 -18 Z', fill: P.blush, opacity: 0.32 })),
          /* collar across the throat */
          path('M-22 6 Q -6 20 12 16', 'none', P, 14),
          path('M-22 6 Q -6 20 12 16', 'none', Object.assign({}, P, { ink: P.accent2 }), 9),
          cir(-4, 21, 6.5, P.accent, P, 4.5))));
  }

  /* ---------------- CAT ----------------
     Walks, then sits and grooms. Arched spine, striped flank, slit pupils,
     whiskers, and a tail that swishes on a two-segment S-curve. */
  function cat(t, P, o) {
    P = pal(P); o = o || {};
    const s = o.speed == null ? 1 : o.speed;
    const cyc = (t * 0.13 * s) % 1;
    const sitting = cyc > 0.62;                       /* pauses to sit */
    const ph = t * 3 * s;
    const bob = sitting ? Math.sin(t * 1.6) * 1.6 : Math.sin(ph * 2) * 3;
    const tail = Math.sin(t * 2.2) * 24, tail2 = Math.sin(t * 2.2 + 1.1) * 30;
    const earTw = Math.sin(t * 3.4) > 0.86 ? -14 : 0;
    const blinkP = (t * 0.34) % 1;
    const limb = (d, col, w) => g(null,
      path(d, 'none', Object.assign({}, P, { ink: P.ink }), w + 8),
      path(d, 'none', Object.assign({}, P, { ink: col }), w));
    const leg = (px, phase, far) => {
      const a = Math.sin(ph + phase), b = Math.cos(ph + phase);
      const kx = px + a * 7, px2 = px + a * 12, py2 = 66 - Math.max(0, b) * 8;
      const col = far ? P.body2 : P.body;
      return g({ key: px + '' + phase },
        limb(`M${px} 36 Q ${kx} 46 ${kx} 52`, col, 14),
        limb(`M${kx} 52 Q ${px2} 60 ${px2} ${py2}`, col, 12),
        ell(px2 + 2, py2 + 1, 9, 6, col, P, 4.5));
    };
    return g({ transform: o.transform },
      /* tail: two segments so it curls rather than pivoting */
      g({ transform: `rotate(${tail} -40 24)` },
        path('M-40 24 Q -66 14 -68 -10', 'none', P, 19),
        path('M-40 24 Q -66 14 -68 -10', 'none', Object.assign({}, P, { ink: P.body }), 12),
        g({ transform: `rotate(${tail2} -66 -8)` },
          path('M-68 -10 Q -72 -34 -54 -42', 'none', P, 17),
          path('M-68 -10 Q -72 -34 -54 -42', 'none', Object.assign({}, P, { ink: P.body }), 11),
          ell(-54, -42, 9, 7, P.belly, P, 4.5))),
      sitting ? null : g({ opacity: 0.85 }, leg(-18, Math.PI, true), leg(28, Math.PI * 0.5, true)),
      g({ transform: `translate(0 ${bob})` },
        /* arched back when walking, upright haunch when sitting */
        sitting
          ? path('M-32 26 Q -40 -4 -14 -14 Q 16 -20 34 -6 Q 46 8 42 30 Q 38 50 10 52 Q -22 54 -30 44 Q -36 36 -32 26 Z', P.body, P, 5)
          : path('M-34 22 Q -30 -12 0 -16 Q 30 -20 48 -4 Q 58 8 54 24 Q 48 44 20 46 Q -12 48 -30 40 Q -38 34 -34 22 Z', P.body, P, 5),
        path(sitting ? 'M-28 38 Q 6 52 40 34 Q 36 50 10 52 Q -20 53 -28 40 Z' : 'M-30 30 Q 4 44 50 26 Q 46 44 20 46 Q -12 48 -28 40 Z', P.belly, P, 0),
        /* flank stripes */
        g({ opacity: 0.55 },
          path('M-6 -14 q -4 14 0 26', 'none', Object.assign({}, P, { ink: P.body2 }), 5),
          path('M10 -16 q -4 15 0 28', 'none', Object.assign({}, P, { ink: P.body2 }), 5),
          path('M26 -14 q -3 13 1 24', 'none', Object.assign({}, P, { ink: P.body2 }), 5)),
        sitting
          ? g(null, path('M22 40 Q 34 50 30 58 Q 18 60 16 50 Z', P.body, P, 4), ell(24, 58, 8, 5, P.body, P, 3.5))
          : g(null, leg(-14, 0), leg(24, Math.PI * 1.5)),
        /* head */
        g({ transform: `translate(${sitting ? 44 : 52} ${sitting ? -22 : -14}) rotate(${sitting ? Math.sin(t * 1.3) * 5 : Math.sin(ph * 2) * 3})` },
          /* ears with an inner tone, one twitching */
          g({ transform: `rotate(${earTw} -8 -18)` },
            path('M-16 -18 Q -26 -44 -2 -30 Z', P.body, P, 5),
            path('M-14 -22 Q -20 -37 -5 -28 Z', P.blush, P, 0)),
          path('M16 -26 Q 26 -52 36 -24 Z', P.body, P, 5),
          path('M19 -28 Q 25 -44 31 -26 Z', P.blush, P, 0),
          cir(8, -4, 30, P.body, P, 6),
          ell(18, 12, 16, 12, P.belly, P, 5),              /* muzzle */
          path('M14 7 l 6 -5 l 6 5 z', P.ink, P, 0),        /* nose */
          smile(16, 16, 8, P, 1),
          eye(-1, -10, 9, P, { slit: true, blink: blinkP > 0.93 ? 1 : 0, lookX: 0.4, key: 'l' }),
          eye(22, -11, 8.5, P, { slit: true, blink: blinkP > 0.93 ? 1 : 0, lookX: 0.4, key: 'r' }),
          blush(-12, 8, 8, P, 0.42),
          /* whiskers */
          g({ opacity: 0.75 },
            path('M6 8 q -14 -3 -22 -6', 'none', P, 2.6),
            path('M6 11 q -14 1 -23 1', 'none', P, 2.6),
            path('M28 8 q 14 -3 22 -6', 'none', P, 2.6),
            path('M28 11 q 14 1 23 1', 'none', P, 2.6)))));
  }

  /* ---------------- BIRD ----------------
     Flapping cartoon bird, side on. Wing rotates about the shoulder and the body
     rises and falls with the downstroke. */
  function bird(t, P, o) {
    P = pal(P); o = o || {};
    const s = o.speed == null ? 1 : o.speed;
    const f = Math.sin(t * 7 * s);
    const rise = -f * 5;
    return g({ transform: o.transform },
      /* far wing, behind */
      g({ transform: `rotate(${-f * 46 - 8} -2 -4)`, opacity: 0.7 },
        path('M-2 -4 Q -26 -20 -40 -6 Q -24 6 -2 2 Z', P.body2, P, 4)),
      g({ transform: `translate(0 ${rise})` },
        /* tail */
        path('M-16 2 Q -34 -2 -40 8 Q -28 12 -14 8 Z', P.body2, P, 4),
        /* body */
        path('M-18 4 Q -20 -12 -2 -16 Q 18 -18 26 -6 Q 30 2 22 8 Q 6 16 -10 12 Q -18 10 -18 4 Z', P.body, P, 4.5),
        path('M-12 8 Q 4 14 20 7 Q 14 14 0 14 Q -10 13 -12 8 Z', P.belly, P, 0),
        /* near wing */
        g({ transform: `rotate(${f * 52} 0 -6)` },
          path('M0 -6 Q -20 -26 -36 -12 Q -18 4 0 0 Z', P.accent, P, 4.5),
          path('M-6 -8 q -10 -8 -18 -6', 'none', P, 2.4)),
        /* head and beak */
        cir(24, -8, 11, P.body, P, 4.5),
        path('M33 -7 l 14 3 l -13 5 z', P.accent, P, 3.5),
        eye(26, -10, 4.6, P, { key: 'e' })));
  }

  /* ---------------- LEAF ---------------- */
  function leaf(t, P, o) {
    P = pal(P); o = o || {};
    const curl = Math.sin(t * 1.7 + (o.seed || 0)) * 8;
    return g({ transform: o.transform },
      g({ transform: `rotate(${curl})` },
        path('M0 0 Q 22 -18 46 0 Q 22 18 0 0 Z', o.fill || P.accent2, P, 4),
        path('M2 0 L 44 0', 'none', P, 2.6),
        g({ opacity: 0.7 },
          path('M12 -1 q 5 -6 10 -7', 'none', P, 2),
          path('M12 1 q 5 6 10 7', 'none', P, 2),
          path('M26 -1 q 5 -5 9 -5', 'none', P, 2),
          path('M26 1 q 5 5 9 5', 'none', P, 2))));
  }

  /* ---------------- SCOOTER RIDER ----------------
     A character on a delivery scooter: helmet with a visor, a face inside it,
     leaning body, arms to the bars, spinning wheels, a strapped delivery box. */
  function scooter(t, P, o) {
    P = pal(P); o = o || {};
    const s = o.speed == null ? 1 : o.speed;
    const spin = t * 520 * s;
    const bump = Math.sin(t * 6 * s) * 2.2;
    const scarf = Math.sin(t * 7) * 12;
    return g({ transform: o.transform },
      g({ transform: `translate(0 ${bump})` },
        /* wheels */
        g({ transform: `rotate(${spin} -34 34)` },
          cir(-34, 34, 17, P.ink, P, 4), cir(-34, 34, 7, P.belly, P, 3.5),
          path('M-34 20 L -34 48 M-48 34 L -20 34', 'none', Object.assign({}, P, { ink: P.belly }), 3)),
        g({ transform: `rotate(${spin} 46 34)` },
          cir(46, 34, 17, P.ink, P, 4), cir(46, 34, 7, P.belly, P, 3.5),
          path('M46 20 L 46 48 M32 34 L 60 34', 'none', Object.assign({}, P, { ink: P.belly }), 3)),
        /* deck, apron and front column */
        path('M-34 34 Q -24 14 -4 12 L 26 12 Q 40 14 44 30', 'none', Object.assign({}, P, { ink: P.accent }), 11),
        path('M-30 12 Q -18 -6 -2 -8 L 20 -8 Q 34 -6 40 8 Q 26 14 -4 14 Q -22 14 -30 12 Z', P.accent, P, 4.5),
        path('M38 6 L 52 -20', 'none', P, 6),
        path('M46 -22 q 10 -4 16 2', 'none', P, 5),        /* handlebar */
        /* delivery box, strapped */
        g({ transform: `rotate(${Math.sin(t * 5) * 1.6} -30 -14)` },
          path('M-46 -14 L -14 -14 L -14 -42 L -46 -42 Z', P.accent2, P, 4.5),
          path('M-46 -28 L -14 -28', 'none', P, 3),
          path('M-34 -42 L -34 -14', 'none', P, 3)),
        /* rider: leg, body, arm, helmeted head */
        path('M6 6 Q 12 22 26 26', 'none', P, 10),
        path('M2 -6 Q 8 -26 20 -32', 'none', Object.assign({}, P, { ink: P.body }), 17),
        path('M2 -6 Q 8 -26 20 -32', 'none', P, 4.5),
        path('M16 -30 Q 34 -26 48 -18', 'none', Object.assign({}, P, { ink: P.body }), 10),
        path('M16 -30 Q 34 -26 48 -18', 'none', P, 4),
        g({ transform: `translate(24 -46)` },
          cir(0, 0, 16, P.belly, P, 4.5),                   /* face */
          path('M-16 -2 Q -14 -20 2 -20 Q 18 -19 18 -2 Q 8 -6 -16 -2 Z', P.accent, P, 4.5), /* helmet shell */
          path('M2 -20 q 12 1 16 12', 'none', Object.assign({}, P, { ink: P.cream }), 3, 0), /* helmet shine */
          path('M6 -6 Q 20 -6 20 2 Q 12 4 6 2 Z', P.cream, P, 3.5),  /* visor */
          eye(1, 0, 5, P, { lookX: 0.6, key: 'e' }),
          smile(-1, 7, 5, P, 1),
          blush(-9, 5, 5, P, 0.45),
          /* scarf trailing back */
          path(`M-14 4 q -14 ${scarf * 0.4} -26 ${scarf}`, 'none', Object.assign({}, P, { ink: P.accent2 }), 7))));
  }

  /* ---------------- KITCHEN ---------------- */
  /* chef's knife with a riveted handle, rocking on the board */
  function knife(t, P, o) {
    P = pal(P); o = o || {};
    const rock = Math.abs(Math.sin(t * 3.4)) * -22;
    return g({ transform: o.transform },
      g({ transform: `rotate(${rock} -46 26)` },
        path('M-46 26 L 34 26 Q 40 26 38 18 Q 20 2 -44 8 Z', P.belly, P, 4.5),
        path('M-40 20 L 30 21', 'none', P, 2.2),
        path('M-46 26 L -84 26 Q -92 26 -92 18 Q -92 10 -84 10 L -46 8 Z', P.body2, P, 4.5),
        cir(-58, 17, 3.4, P.belly, P, 2.4), cir(-74, 17, 3.4, P.belly, P, 2.4)));
  }
  /* pot with a lid that lifts on the boil, steam curling out */
  function pot(t, P, o) {
    P = pal(P); o = o || {};
    const lid = Math.abs(Math.sin(t * 2.2)) * 5;
    return g({ transform: o.transform },
      path('M-44 0 Q -48 44 -30 52 Q 0 60 30 52 Q 48 44 44 0 Z', P.accent, P, 5),
      path('M-40 34 Q 0 48 40 32 Q 36 48 26 52 Q 0 60 -26 52 Q -36 48 -40 34 Z', P.body2, P, 0),
      path('M-56 8 q -12 2 -10 14 q 2 10 12 6', 'none', P, 6),
      path('M56 8 q 12 2 10 14 q -2 10 -12 6', 'none', P, 6),
      g({ transform: `translate(0 ${-lid})` },
        path('M-48 0 Q 0 -14 48 0 Q 0 10 -48 0 Z', P.belly, P, 4.5),
        cir(0, -10, 6, P.body2, P, 4)),
      /* steam: three curls at different phases */
      g({ opacity: 0.6 },
        [0, 1, 2].map((i) => {
          const y = -18 - ((t * 26 + i * 22) % 60);
          const x = (i - 1) * 17 + Math.sin(t * 2 + i) * 7;
          return path(`M${x} ${y} q 9 -12 0 -22`, 'none', Object.assign({}, P, { ink: P.belly }), 5);
        })));
  }
  /* produce with a cartoon face — carrot, tomato, aubergine by index */
  function veg(t, P, o) {
    P = pal(P); o = o || {};
    const i = (o.kind || 0) % 3;
    const bob = Math.sin(t * 2.4 + i) * 3;
    const body = i === 0 ? P.accent : i === 1 ? P.blush : P.accent2;
    return g({ transform: o.transform },
      g({ transform: `translate(0 ${bob})` },
        i === 0
          ? path('M0 -22 Q 14 -8 6 30 Q 0 40 -6 30 Q -14 -8 0 -22 Z', body, P, 4.5)
          : ell(0, 4, 20, 19, body, P, 4.5),
        i === 0
          ? g(null, path('M-2 -22 q -12 -14 -20 -12 q 4 12 18 14', P.accent2, P, 4),
            path('M2 -22 q 10 -16 20 -14 q -4 14 -18 16', P.accent2, P, 4))
          : path('M-8 -14 q 8 -12 16 0 q -8 4 -16 0 Z', P.accent2, P, 4),
        eye(-6, i === 0 ? 2 : 0, 4.4, P, { key: 'l' }),
        eye(7, i === 0 ? 2 : 0, 4.4, P, { key: 'r' }),
        smile(0, i === 0 ? 12 : 10, 5, P, 1)));
  }

  window.Cartoon = { dog, cat, bird, leaf, scooter, knife, pot, veg, eye, blush, smile, pal, OL };
})();
