/* KEYFRAME illustration system — "Soft 2.5D"
   ============================================================================
   ONE art direction, enforced by construction rather than by discipline.

   The rule that makes every figure look like the same illustrator drew it:
   no figure ever picks its own fill, stroke or shading. Every solid form goes
   through form(), which applies a single recipe —

     · fill        a two-stop gradient, light at the upper-right, dark at the
                   lower-left, so all objects are lit from the same direction
     · outline     a warm dark edge derived from the fill, never pure black,
                   at ONE weight ratio across the whole library
     · shade       an inner lower-left shadow shape at fixed opacity
     · highlight   an upper-right sheen at fixed opacity

   Because the recipe is central, a leaf and a bicycle and a dog cannot drift
   apart: changing the recipe restyles the entire library at once.

   Depth: every figure sits on a contact shadow whose softness scales with its
   height, and the demo world stacks sky → hills → trees → props → characters →
   foreground at fixed parallax rates.

   Colour: semantic tokens, not one brand hue smeared over everything. Brand
   colour drives clothing, props and accents; skin, foliage, timber and metal
   keep their natural ranges.

   Motion: every figure is a function of t (seconds), built from phase loops, so
   it animates continuously and identically for a given t — frame-export safe.
   No Math.random at render time.
   ============================================================================ */
(function () {
  const h = React.createElement;

  /* ---- colour maths (self-contained so the file has no load-order deps) ---- */
  const hx = (c) => { c = c.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; };
  const rgb = (a) => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = hx(a), y = hx(b); return rgb(x.map((v, i) => v + (y[i] - v) * t)); };
  const lt = (c, t) => mix(c, '#ffffff', t);
  const dk = (c, t) => mix(c, '#20180f', t);   /* warm dark, never neutral black */
  const al = (c, a) => { const [r, g, b] = hx(c); return `rgba(${r},${g},${b},${a})`; };

  /* ---- the recipe constants: the whole style lives here ---- */
  const R = {
    lift: 0.20,        /* how much lighter the top-right of a form is */
    sink: 0.16,        /* how much darker the bottom-left is */
    edge: 0.46,        /* how far the outline is darkened from the fill */
    weight: 0.028,     /* outline weight as a fraction of figure height */
    shade: 0.16,       /* inner shadow opacity */
    sheen: 0.30,       /* highlight opacity */
    contact: 0.17,     /* ground shadow opacity */
  };

  /* Semantic tokens. Brand colours influence clothing, props and accents only. */
  function tokens(o) {
    o = o || {};
    const primary = o.primary || '#c67139';
    const secondary = o.secondary || '#7a8a5e';
    const accent = o.accent || lt(primary, 0.3);
    return {
      primary, secondary, accent,
      skin: o.skin || '#e8b48c', skin2: o.skin2 || '#c98b62',
      hair: o.hair || '#4a3526',
      fur: o.fur || mix(primary, '#d9a86e', 0.5), fur2: o.fur2 || dk(primary, 0.28),
      leaf: o.leaf || secondary, leaf2: o.leaf2 || dk(secondary, 0.24),
      timber: o.timber || '#9a6f45', metal: o.metal || '#cfd2d4',
      neutral: o.neutral || '#f0e7d8', ink: o.ink || dk(primary, 0.7),
      sky: o.sky || '#dfe8ea', cloud: o.cloud || '#ffffff',
      bg: o.bg || '#f5ead8',
    };
  }

  /* ---- the shared form recipe ----------------------------------------------
     Every solid shape in the library is drawn by this. `d` is the silhouette,
     `c` the semantic colour, `hgt` the figure's nominal height so the outline
     weight stays proportional at any scale. */
  function makeForm(reg, hgt) {
    const w = Math.max(1.1, hgt * R.weight);
    return function form(d, c, o) {
      o = o || {};
      const gid = reg(c);
      return h('g', { key: o.key },
        /* base with the directional gradient */
        h('path', { d, fill: `url(#${gid})`, stroke: o.flat ? 'none' : dk(c, R.edge), strokeWidth: o.flat ? 0 : (o.w || w), strokeLinejoin: 'round', strokeLinecap: 'round' }),
        /* inner lower-left shade, clipped to the form */
        o.shade === false ? null : h('path', { d, fill: dk(c, 0.5), opacity: R.shade, style: { clipPath: 'inset(0)' }, transform: 'translate(-1.2 1.6)', mask: undefined, pointerEvents: 'none' }),
        /* upper-right sheen */
        o.sheen ? h('path', { d: o.sheen, fill: '#fff', opacity: R.sheen }) : null);
    };
  }
  /* line: for spokes, whiskers, stems — one weight family, warm dark */
  function makeLine(hgt) {
    const w = Math.max(0.9, hgt * R.weight * 0.72);
    return (d, c, k) => h('path', { key: k, d, fill: 'none', stroke: c, strokeWidth: w, strokeLinecap: 'round', strokeLinejoin: 'round' });
  }

  /* ---- eyes: one construction for every character in the library ---- */
  function makeEye(T) {
    return function eye(x, y, r, o) {
      o = o || {};
      if (o.shut) return h('path', { key: o.key, d: `M${x - r} ${y} q ${r} ${r * 0.8} ${r * 2} 0`, fill: 'none', stroke: T.ink, strokeWidth: r * 0.42, strokeLinecap: 'round' });
      const lx = (o.lookX || 0) * r * 0.3, ly = (o.lookY || 0) * r * 0.3;
      return h('g', { key: o.key },
        h('ellipse', { cx: x, cy: y, rx: r, ry: r * (o.tall ? 1.16 : 1), fill: '#fff', stroke: T.ink, strokeWidth: r * 0.3 }),
        h('ellipse', { cx: x + lx, cy: y + ly, rx: r * (o.slit ? 0.3 : 0.5), ry: r * (o.slit ? 0.74 : 0.5), fill: T.ink }),
        h('circle', { cx: x + lx - r * 0.22, cy: y + ly - r * 0.26, r: r * 0.19, fill: '#fff' }));
    };
  }

  /* ============================ THE LIBRARY ============================ */
  /* Each figure is authored in a local box with its feet at y=0 and a nominal
     height, declared as .h so callers can scale without guessing. */

  function build(T, form, line, eye) {
    const g = (p, ...k) => h('g', p, ...k);
    const ell = (cx, cy, rx, ry, f, op) => h('ellipse', { cx, cy, rx, ry, fill: f, opacity: op });

    /* contact shadow — softness scales with the figure, so nothing floats */
    const ground = (rx, y) => ell(0, y == null ? 0 : y, rx, rx * 0.17, T.ink, R.contact);

    /* ---------- DOG ---------- pose: 'walk' | 'sit' | 'look' ---------- */
    const dog = (t, o) => {
      o = o || {};
      const pose = o.pose || 'walk';
      const s = o.speed == null ? 1 : o.speed;
      const ph = t * 2.8 * s;
      const bob = pose === 'walk' ? Math.sin(ph * 2) * 2.4 : Math.sin(t * 1.5) * 1.2;
      const wag = Math.sin(t * 8 * s) * (pose === 'sit' ? 30 : 20);
      const earSw = Math.sin(ph * 2 + 0.6) * 11;
      const blink = ((t * 0.42) % 1) > 0.95;
      const up = pose === 'look';

      /* legs: rear carries a haunch bend, front hangs from the shoulder */
      const legRear = (k, ofs, col) => {
        const a = Math.sin(ph + ofs), b = Math.cos(ph + ofs);
        const kx = -26 + a * 4, px = -17 + a * 13, py = -6 - Math.max(0, b) * 8;
        return g({ key: k },
          form(`M-21 -44 Q ${kx} -30 ${kx + 3} -22 L ${kx + 12} -22 Q ${kx + 9} -32 -13 -44 Z`, col),
          form(`M${kx + 3} -22 Q ${px} -12 ${px} ${py} L ${px + 9} ${py} Q ${px + 9} -12 ${kx + 12} -22 Z`, col),
          form(`M${px - 2} ${py} q 9 -4 15 0 q 2 6 -7 6 q -9 0 -8 -6 Z`, col));
      };
      const legFront = (k, ofs, col) => {
        const a = Math.sin(ph + ofs), b = Math.cos(ph + ofs);
        const kx = 26 + a * 8, px = 28 + a * 14, py = -6 - Math.max(0, b) * 9;
        return g({ key: k },
          form(`M22 -42 Q ${kx} -28 ${kx} -20 L ${kx + 10} -20 Q ${kx + 8} -30 30 -42 Z`, col),
          form(`M${kx} -20 Q ${px} -12 ${px} ${py} L ${px + 9} ${py} Q ${px + 9} -12 ${kx + 10} -20 Z`, col),
          form(`M${px - 2} ${py} q 9 -4 15 0 q 2 6 -7 6 q -9 0 -8 -6 Z`, col));
      };

      return g({ transform: o.transform },
        ground(46),
        /* far pair, tonally pushed back */
        pose === 'sit' ? null : g({ opacity: 0.94 }, legRear('r2', Math.PI, T.fur2), legFront('f2', Math.PI * 0.5, T.fur2)),
        /* tail */
        g({ transform: `rotate(${wag} -34 -62)` },
          form('M-34 -62 Q -54 -70 -54 -88 Q -54 -102 -40 -104 Q -34 -96 -40 -92 Q -46 -88 -44 -78 Q -42 -68 -28 -66 Z', T.fur)),
        g({ transform: `translate(0 ${bob}) scale(1.06 0.9)`, style: { transformOrigin: '0px 0px' } },
          /* haunch mass, then barrel, so the barrel laps over it */
          form('M-30 -56 q -14 8 -12 24 q 2 16 16 18 q 14 2 18 -14 q 3 -16 -8 -26 Z', T.fur2),
          /* neck */
          form(pose === 'look'
            ? 'M20 -62 Q 30 -84 44 -92 L 58 -78 Q 44 -66 30 -56 Z'
            : 'M18 -60 Q 30 -74 46 -76 L 50 -56 Q 32 -50 22 -52 Z', T.fur),
          /* barrel: rising back, deep chest, tucked belly */
          form(pose === 'sit'
            ? 'M-32 -58 Q -40 -34 -30 -18 Q -12 -8 8 -14 Q 26 -20 30 -42 Q 34 -62 16 -70 Q -6 -78 -22 -70 Z'
            : 'M-34 -58 Q -44 -46 -40 -30 Q -34 -18 -12 -18 Q 12 -18 26 -24 Q 40 -32 38 -50 Q 36 -68 12 -72 Q -18 -76 -34 -58 Z', T.fur,
            { sheen: pose === 'sit' ? 'M-24 -62 Q -4 -72 12 -64 Q -6 -62 -24 -56 Z' : 'M-26 -60 Q 0 -70 22 -60 Q -2 -58 -26 -52 Z' }),
          pose === 'sit'
            ? g(null, form('M14 -22 Q 26 -12 24 -4 L 6 -4 Q 2 -14 6 -22 Z', T.fur), form('M2 -4 q 12 -5 22 0 q 2 6 -10 6 q -13 0 -12 -6 Z', T.fur))
            : g(null, legRear('r1', 0, T.fur), legFront('f1', Math.PI * 1.5, T.fur)),
          /* head: one profile silhouette, snout in the outline */
          g({ transform: `translate(${up ? 60 : 54} ${up ? -108 : -90}) rotate(${up ? -20 : Math.sin(ph * 2) * 2}) scale(1.52)` },
            form('M-26 -18 Q -20 -40 2 -38 Q 24 -36 30 -16 Q 40 -13 43 -4 Q 45 4 36 7 Q 28 9 24 7 Q 20 16 8 18 Q -12 20 -22 8 Q -30 -2 -26 -18 Z', T.fur,
              { sheen: 'M-19 -24 Q -6 -34 10 -30 Q -6 -26 -19 -17 Z' }),
            /* crown patch */
            h('path', { d: 'M-20 -22 Q -10 -35 5 -32 Q 17 -30 23 -20 Q 4 -28 -20 -22 Z', fill: T.fur2, opacity: 0.55 }),
            form('M34 -4 q 10 -1 10 5 q 0 6 -10 5 q -8 -1 -8 -5 q 0 -5 8 -5 Z', T.ink, { flat: true, shade: false }),
            h('path', { d: 'M36 -3 q 4 -3 6 0', fill: 'none', stroke: '#fff', strokeWidth: 1.8, opacity: 0.9 }),
            line('M32 6 Q 24 11 18 8', dk(T.fur, 0.55)),
            Math.sin(ph) > 0.4 && !up ? form('M32 9 q 8 11 16 5 q -3 -9 -9 -10 Z', T.accent) : null,
            eye(8, -13, 9.6, { shut: blink, tall: true, lookX: up ? 0.2 : 0.5, lookY: up ? -0.7 : 0.1, key: 'e' }),
            line('M-1 -30 q 9 -4 15 2', dk(T.fur, 0.5)),
            /* near ear, hung forward over the cheek */
            g({ transform: `rotate(${earSw} -14 -24)` },
              form('M-16 -26 Q -36 -18 -34 6 Q -32 24 -14 20 Q -6 3 -8 -22 Z', T.fur2,
                { sheen: 'M-19 -20 Q -29 -14 -28 2 Q -22 -10 -17 -16 Z' })),
            /* collar */
            h('ellipse', { cx: 22, cy: 2, rx: 6, ry: 4, fill: T.accent, opacity: 0.42 }),
            form('M-20 6 Q -6 18 11 15 L 13 8 Q -4 11 -17 0 Z', T.secondary),
            form('M-3 17 q 6 -1 7 5 q 1 6 -6 6 q -6 0 -6 -6 q 0 -5 5 -5 Z', T.accent))));
    };
    dog.h = 118;

    /* ---------- CAT ---------- pose: 'sit' | 'walk' | 'stretch' ---------- */
    const cat = (t, o) => {
      o = o || {};
      const pose = o.pose || 'sit';
      const s = o.speed == null ? 1 : o.speed;
      const ph = t * 3 * s;
      const bob = pose === 'walk' ? Math.sin(ph * 2) * 2 : Math.sin(t * 1.4) * 1;
      const tl = Math.sin(t * 1.9) * 20, tl2 = Math.sin(t * 1.9 + 1.2) * 26;
      const earTw = Math.sin(t * 3.1) > 0.88 ? -13 : 0;
      const blink = ((t * 0.36) % 1) > 0.94;
      const leg = (k, ofs, col) => {
        const a = Math.sin(ph + ofs), b = Math.cos(ph + ofs);
        const x = -6 + a * 10, py = -5 - Math.max(0, b) * 7;
        return g({ key: k },
          form(`M${x - 5} -36 Q ${x - 4} -20 ${x - 4} ${py} L ${x + 6} ${py} Q ${x + 6} -20 ${x + 5} -36 Z`, col),
          form(`M${x - 6} ${py} q 8 -4 14 0 q 2 6 -7 6 q -8 0 -7 -6 Z`, col));
      };
      return g({ transform: o.transform },
        ground(38),
        /* tail: two segments so it curls rather than pivots */
        g({ transform: `rotate(${tl} -30 -40)` },
          form('M-30 -40 Q -46 -46 -48 -62 L -38 -66 Q -36 -52 -24 -46 Z', T.fur),
          g({ transform: `rotate(${tl2} -44 -64)` },
            form('M-48 -62 Q -52 -80 -38 -88 L -32 -80 Q -42 -74 -38 -64 Z', T.fur),
            form('M-38 -90 q 8 -3 10 4 q 1 7 -7 7 q -8 -1 -7 -6 q 1 -5 4 -5 Z', T.neutral))),
        pose === 'walk' ? g({ opacity: 0.94 }, leg('l3', Math.PI, T.fur2), leg('l4', Math.PI * 0.5, T.fur2)) : null,
        g({ transform: `translate(0 ${bob})` },
          /* body */
          form(pose === 'sit'
            ? 'M-26 -50 Q -34 -28 -26 -12 Q -10 -2 8 -8 Q 24 -14 26 -34 Q 28 -54 10 -60 Q -12 -66 -26 -50 Z'
            : pose === 'stretch'
              ? 'M-34 -34 Q -44 -22 -38 -12 Q -20 -6 6 -12 Q 30 -18 40 -30 Q 44 -42 26 -46 Q -12 -52 -34 -34 Z'
              : 'M-30 -46 Q -40 -34 -34 -20 Q -18 -10 4 -14 Q 24 -18 30 -34 Q 34 -52 12 -56 Q -14 -60 -30 -46 Z', T.fur,
            { sheen: 'M-20 -50 Q 0 -58 16 -50 Q -2 -48 -20 -42 Z' }),
          /* flank stripes, tonal not linear */
          g({ opacity: 0.4 },
            h('path', { d: 'M-8 -56 q -5 12 -2 24', fill: 'none', stroke: T.fur2, strokeWidth: 4, strokeLinecap: 'round' }),
            h('path', { d: 'M6 -56 q -5 13 -2 25', fill: 'none', stroke: T.fur2, strokeWidth: 4, strokeLinecap: 'round' }),
            h('path', { d: 'M18 -52 q -4 11 -2 21', fill: 'none', stroke: T.fur2, strokeWidth: 4, strokeLinecap: 'round' })),
          pose === 'walk' ? g(null, leg('l1', 0, T.fur), leg('l2', Math.PI * 1.5, T.fur))
            : g(null, form('M8 -18 Q 20 -10 18 -4 L 0 -4 Q -3 -12 0 -18 Z', T.fur), form('M-3 -4 q 12 -5 22 0 q 2 6 -10 6 q -13 0 -12 -6 Z', T.fur)),
          /* head */
          g({ transform: `translate(${pose === 'sit' ? 14 : 30} ${pose === 'sit' ? -78 : -66}) rotate(${Math.sin(t * 1.2) * 4}) scale(1.48)` },
            g({ transform: `rotate(${earTw} -13 -16)` },
              form('M-15 -13 Q -25 -37 -3 -25 Z', T.fur), h('path', { d: 'M-13 -17 Q -19 -30 -6 -23 Z', fill: T.accent, opacity: 0.6 })),
            form('M14 -20 Q 24 -45 33 -18 Z', T.fur), h('path', { d: 'M17 -22 Q 23 -37 28 -21 Z', fill: T.accent, opacity: 0.6 }),
            form('M-16 -6 Q -18 -24 0 -28 Q 20 -32 30 -20 Q 38 -8 32 4 Q 22 16 6 15 Q -12 12 -16 -6 Z', T.fur,
              { sheen: 'M-8 -14 Q 4 -24 20 -20 Q 4 -16 -8 -8 Z' }),
            h('ellipse', { cx: -12, cy: 4, rx: 6, ry: 3.8, fill: T.accent, opacity: 0.4 }),
            h('ellipse', { cx: 32, cy: 2, rx: 6, ry: 3.8, fill: T.accent, opacity: 0.4 }),
            form('M6 0 q 14 -3 20 6 q -2 9 -12 9 q -11 -1 -12 -8 q 0 -6 4 -7 Z', T.neutral, { shade: false }),
            h('path', { d: 'M12 3 l 5 -4 l 5 4 z', fill: T.ink }),
            line('M17 3 q 0 6 -5 7', dk(T.fur, 0.5)), line('M17 3 q 0 6 5 7', dk(T.fur, 0.5)),
            eye(-2, -6, 9, { shut: blink, tall: true, lookX: 0.3, lookY: 0.1, key: 'l' }),
            eye(22, -8, 8.6, { shut: blink, tall: true, lookX: 0.3, lookY: 0.1, key: 'r' }),
            g({ opacity: 0.6 },
              line('M4 2 q -14 -3 -21 -7'), line('M4 6 q -14 1 -22 2'),
              line('M28 2 q 14 -4 21 -8'), line('M28 6 q 14 1 22 1')))));
    };
    cat.h = 96;

    /* ---------- CYCLIST ---------- a character on a real bicycle ---------- */
    const cyclist = (t, o) => {
      o = o || {};
      const s = o.speed == null ? 1 : o.speed;
      const spin = t * 380 * s;
      const ped = t * 4.4 * s;                       /* pedal phase */
      const bump = Math.sin(t * 5.6 * s) * 1.6;
      const hair = Math.sin(t * 6) * 8;
      const kneeL = Math.sin(ped), kneeR = Math.sin(ped + Math.PI);
      const foot = (a) => [10 + Math.cos(a) * 11, -26 + Math.sin(a) * 11];
      const [fx1, fy1] = foot(ped), [fx2, fy2] = foot(ped + Math.PI);
      const wheel = (cx, k) => g({ key: k },
        h('circle', { cx, cy: -26, r: 26, fill: 'none', stroke: T.ink, strokeWidth: 4.4 }),
        h('circle', { cx, cy: -26, r: 22, fill: 'none', stroke: dk(T.metal, 0.35), strokeWidth: 1.8 }),
        g({ transform: `rotate(${spin} ${cx} -26)`, opacity: 0.75 },
          [0, 45, 90, 135].map((a, i) => h('line', { key: i, x1: cx - 21 * Math.cos(a * Math.PI / 180), y1: -26 - 21 * Math.sin(a * Math.PI / 180), x2: cx + 21 * Math.cos(a * Math.PI / 180), y2: -26 + 21 * Math.sin(a * Math.PI / 180), stroke: T.metal, strokeWidth: 1.5 }))),
        form(`M${cx - 4} -30 q 8 -2 8 4 q 0 6 -8 5 q -6 -1 -6 -5 q 0 -3 6 -4 Z`, T.metal, { shade: false }));
      return g({ transform: o.transform },
        ground(56),
        g({ transform: `translate(0 ${bump})` },
          wheel(-38, 'w1'), wheel(40, 'w2'),
          /* frame: real geometry — down tube, seat tube, chain stay, forks */
          g(null,
            line('M-38 -26 L 4 -26', T.primary), line('M4 -26 L -8 -62', T.primary),
            line('M-8 -62 L -38 -26', T.primary), line('M4 -26 L 30 -60', T.primary),
            line('M-8 -62 L 26 -58', T.primary), line('M30 -60 L 40 -26', T.primary),
            line('M30 -62 q 9 -3 14 2', T.ink),      /* handlebar */
            form('M-16 -66 q 12 -4 18 2 q -6 5 -18 2 Z', T.ink, { shade: false })),  /* saddle */
          /* crank + pedals */
          g({ transform: `rotate(${ped * 57.3} 10 -26)` }, line('M10 -26 L 10 -37', T.ink), line('M10 -26 L 10 -15', T.ink)),
          form(`M${fx1 - 6} ${fy1 - 2} h 12 v 4 h -12 Z`, T.ink, { shade: false }),
          /* rider: far leg, body, head, near leg, arm */
          g({ opacity: 0.9 },
            line(`M-2 -74 Q ${4 + kneeR * 6} -52 ${fx2} ${fy2 - 4}`, dk(T.secondary, 0.3), 'lf')),
          form('M-10 -76 Q -6 -100 8 -104 Q 22 -106 26 -92 Q 28 -80 18 -74 Q 2 -70 -10 -76 Z', T.primary,
            { sheen: 'M-4 -84 Q 6 -98 20 -94 Q 6 -90 -4 -80 Z' }),           /* torso, leaning */
          line(`M-1 -75 Q ${6 + kneeL * 7} -50 ${fx1} ${fy1 - 4}`, T.secondary, 'ln'),  /* near leg */
          form(`M${fx1 - 8} ${fy1 - 6} q 10 -4 15 2 q -1 6 -8 6 q -8 0 -7 -8 Z`, T.ink),  /* shoe */
          line('M22 -94 Q 34 -80 43 -66', T.skin, 'arm'),
          form('M40 -68 q 8 -2 9 4 q 0 6 -8 5 q -6 -1 -6 -5 q 0 -3 5 -4 Z', T.skin),      /* hand */
          g({ transform: 'translate(24 -110)' },
            form('M-13 2 Q -15 -14 0 -18 Q 15 -20 18 -6 Q 20 6 8 10 Q -8 12 -13 2 Z', T.skin,
              { sheen: 'M-6 -6 Q 2 -15 14 -12 Q 2 -8 -6 -2 Z' }),
            /* hair with movement */
            form(`M-14 -4 Q -18 -20 0 -20 Q 16 -21 19 -8 Q 10 -16 -2 -14 Q -10 -13 -14 ${-4 + hair * 0.2} Z`, T.hair, { shade: false }),
            eye(7, -3, 5, { lookX: 0.7, key: 'e' }),
            line('M11 6 q 4 1 6 -2', dk(T.skin, 0.4)),
            h('ellipse', { cx: -4, cy: 4, rx: 5, ry: 3, fill: T.accent, opacity: 0.4 }))));
    };
    cyclist.h = 128;

    /* ---------- CHEF ---------- character with a pan ---------- */
    const chef = (t, o) => {
      o = o || {};
      const toss = Math.sin(t * 2.6);
      const bob = Math.sin(t * 1.6) * 1.6;
      const blink = ((t * 0.4) % 1) > 0.95;
      return g({ transform: o.transform },
        ground(44),
        g({ transform: `translate(0 ${bob})` },
          form('M-20 -4 Q -24 -40 -14 -52 L 16 -52 Q 26 -40 22 -4 Z', T.neutral, { sheen: 'M-12 -46 Q 2 -50 14 -46 Q 0 -42 -12 -38 Z' }),  /* apron */
          form('M-16 -52 Q -20 -78 -6 -86 Q 8 -92 18 -84 Q 26 -74 22 -52 Z', T.primary),                       /* jacket */
          form('M-18 -4 q 12 -4 16 0 q 2 6 -8 6 q -10 0 -8 -6 Z', T.ink), form('M6 -4 q 12 -4 16 0 q 2 6 -8 6 q -10 0 -8 -6 Z', T.ink),
          /* arm holding the pan, rising on the toss */
          g({ transform: `rotate(${toss * -9} 18 -76)` },
            line('M16 -78 Q 34 -74 44 -66', T.primary, 'a'),
            form('M40 -68 q 9 -2 10 4 q 0 6 -9 5 q -6 -1 -6 -5 q 1 -3 5 -4 Z', T.skin),
            g({ transform: `translate(56 ${-64 + toss * 2})` },
              form('M-16 -4 Q -16 6 0 6 Q 16 6 16 -4 Z', T.metal, { sheen: 'M-11 -2 q 10 4 21 0 q -10 5 -21 0 Z' }),
              line('M14 -4 L 34 -8', T.ink, 'h'),
              /* ingredients arcing out of the pan */
              [0, 1, 2].map((i) => {
                const p = ((t * 0.9 + i * 0.33) % 1);
                return h('circle', { key: i, cx: -6 + i * 7 + p * 4, cy: -8 - Math.sin(p * Math.PI) * 26, r: 3.4, fill: i === 1 ? T.secondary : T.accent, opacity: 0.95 });
              }))),
          line('M-14 -78 Q -28 -70 -30 -58', T.primary, 'a2'),
          form('M-32 -60 q 9 -2 10 4 q 0 6 -9 5 q -6 -1 -6 -5 q 1 -3 5 -4 Z', T.skin),
          g({ transform: 'translate(4 -98)' },
            form('M-13 2 Q -15 -12 0 -16 Q 15 -18 17 -5 Q 18 6 6 9 Q -9 11 -13 2 Z', T.skin, { sheen: 'M-6 -5 Q 2 -13 12 -10 Q 2 -6 -6 -1 Z' }),
            eye(-3, -3, 4.6, { shut: blink, key: 'l' }), eye(11, -4, 4.4, { shut: blink, key: 'r' }),
            line('M2 5 q 4 3 8 0', dk(T.skin, 0.42)),
            h('ellipse', { cx: -8, cy: 3, rx: 4.4, ry: 2.8, fill: T.accent, opacity: 0.42 }),
            /* toque */
            form('M-15 -14 Q -18 -34 -2 -32 Q 14 -34 17 -18 Q 2 -12 -15 -14 Z', '#ffffff', { sheen: 'M-8 -22 Q 0 -30 10 -26 Q 0 -22 -8 -18 Z' }))));
    };
    chef.h = 112;

    /* ---------- BIRD ---------- */
    const bird = (t, o) => {
      o = o || {};
      const s = o.speed == null ? 1 : o.speed;
      const f = Math.sin(t * 6.4 * s);
      return g({ transform: o.transform },
        g({ transform: `rotate(${-f * 40 - 6} -2 -6)`, opacity: 0.72 },
          form('M-2 -6 Q -22 -20 -34 -8 Q -20 2 -2 -1 Z', T.fur2)),
        g({ transform: `translate(0 ${-f * 4})` },
          form('M-14 -1 Q -30 -6 -34 4 Q -24 8 -12 4 Z', T.fur2),
          form('M-16 0 Q -18 -14 -2 -17 Q 16 -19 23 -8 Q 27 0 19 5 Q 4 11 -10 8 Q -16 6 -16 0 Z', T.fur,
            { sheen: 'M-8 -8 Q 2 -15 14 -12 Q 2 -8 -8 -3 Z' }),
          g({ transform: `rotate(${f * 46} 0 -7)` },
            form('M0 -7 Q -18 -24 -32 -12 Q -16 0 0 -2 Z', T.accent, { sheen: 'M-6 -9 q -9 -7 -16 -6 q 8 0 16 6 Z' })),
          form('M22 -9 q 10 -1 11 4 q 1 5 -10 5 q -8 -1 -8 -5 q 0 -4 7 -4 Z', T.fur),
          form('M31 -6 l 13 3 l -12 4 Z', T.accent, { shade: false }),
          eye(24, -9, 3.8, { key: 'e' })));
    };
    bird.h = 30;

    /* ---------- LEAF ---------- */
    const leaf = (t, o) => {
      o = o || {};
      const sd = o.seed || 0;
      const curl = Math.sin(t * 1.5 + sd) * 9;
      const col = o.alt ? T.leaf2 : T.leaf;
      return g({ transform: o.transform },
        g({ transform: `rotate(${curl})` },
          form('M0 0 Q 20 -17 44 -2 Q 22 16 0 0 Z', col, { sheen: 'M8 -3 Q 20 -12 34 -5 Q 20 -6 8 -1 Z' }),
          line('M3 -1 L 41 -1', dk(col, 0.4)),
          g({ opacity: 0.5 },
            line('M12 -2 q 5 -6 10 -7'), line('M12 0 q 5 6 10 6'),
            line('M25 -2 q 5 -5 9 -5'), line('M25 0 q 5 5 9 4'))));
    };
    leaf.h = 20;

    /* ---------- TREE ---------- layered canopy for depth ---------- */
    const tree = (t, o) => {
      o = o || {};
      const sw = Math.sin(t * 0.7 + (o.seed || 0)) * 2.2;
      return g({ transform: o.transform },
        ground(30),
        form('M-7 0 Q -5 -40 -9 -66 L 9 -66 Q 5 -40 7 0 Z', T.timber, { sheen: 'M-3 -60 q 4 20 2 50 q -4 -28 -2 -50 Z' }),
        g({ transform: `rotate(${sw} 0 -60)` },
          form('M-44 -66 Q -52 -100 -22 -110 Q -14 -132 10 -128 Q 38 -128 42 -104 Q 56 -92 44 -70 Q 4 -58 -44 -66 Z', T.leaf2),
          form('M-34 -74 Q -40 -100 -16 -108 Q -8 -126 12 -122 Q 34 -122 36 -102 Q 46 -92 34 -76 Q 2 -66 -34 -74 Z', T.leaf,
            { sheen: 'M-14 -104 Q 2 -116 22 -110 Q 2 -104 -14 -96 Z' })));
    };
    tree.h = 132;

    /* ---------- BOWL OF FOOD ---------- */
    const bowl = (t, o) => {
      o = o || {};
      const steam = (i) => {
        const p = ((t * 0.42 + i * 0.33) % 1);
        return h('path', { key: i, d: `M${(i - 1) * 11} ${-30 - p * 30} q 8 -10 0 -19`, fill: 'none', stroke: '#fff', strokeWidth: 3.4, strokeLinecap: 'round', opacity: (1 - p) * 0.5 });
      };
      return g({ transform: o.transform },
        ground(30),
        g({ opacity: 0.9 }, [0, 1, 2].map(steam)),
        /* contents mounded above the rim */
        form('M-22 -22 Q -12 -38 4 -34 Q 20 -38 24 -24 Q 2 -16 -22 -22 Z', T.secondary),
        h('circle', { cx: -8, cy: -30, r: 5, fill: T.accent }), h('circle', { cx: 9, cy: -32, r: 4.2, fill: T.primary }),
        form('M-30 -22 Q -28 -2 0 -2 Q 28 -2 30 -22 Z', T.neutral, { sheen: 'M-22 -18 Q 0 -8 22 -18 Q 0 -12 -22 -14 Z' }),
        form('M-33 -24 q 33 8 66 0 q -33 7 -66 0 Z', lt(T.neutral, 0.4), { shade: false }));
    };
    bowl.h = 48;

    /* ---------- CUP ---------- */
    const cup = (t, o) => {
      o = o || {};
      return g({ transform: o.transform },
        ground(20),
        h('path', { d: `M4 ${-30 - ((t * 0.5) % 1) * 22} q 7 -9 0 -17`, fill: 'none', stroke: '#fff', strokeWidth: 3, strokeLinecap: 'round', opacity: 0.42 }),
        form('M18 -24 q 14 -2 14 8 q 0 10 -14 8 L 16 -14 Z', T.neutral),
        form('M-20 -28 Q -18 -2 0 -2 Q 18 -2 20 -28 Z', T.primary, { sheen: 'M-14 -24 Q 0 -14 14 -24 Q 0 -18 -14 -20 Z' }),
        form('M-22 -30 q 22 6 44 0 q -22 6 -44 0 Z', lt(T.primary, 0.35), { shade: false }));
    };
    cup.h = 34;

    /* ---------- PLANT (potted) ---------- */
    const plant = (t, o) => {
      o = o || {};
      const sw = Math.sin(t * 1.1 + (o.seed || 0)) * 3;
      return g({ transform: o.transform },
        ground(24),
        g({ transform: `rotate(${sw} 0 -18)` },
          [-1, 0, 1].map((d, i) => g({ key: i, transform: `rotate(${d * 26} 0 -18)` },
            line(`M0 -18 Q ${d * 6} -34 ${d * 8} -46`, dk(T.leaf, 0.3)),
            form(`M${d * 8} -46 q ${10 + d * 2} -12 ${20 + d * 4} 2 q ${-10 - d * 2} 12 ${-20 - d * 4} -2 Z`, i === 1 ? T.leaf : T.leaf2,
              { sheen: `M${d * 8 + 4} -46 q 6 -6 13 -1 q -7 -1 -13 1 Z` })))),
        form('M-16 -20 Q -14 -2 0 -2 Q 14 -2 16 -20 Z', T.timber, { sheen: 'M-11 -16 Q 0 -8 11 -16 Q 0 -11 -11 -13 Z' }),
        form('M-19 -22 q 19 5 38 0 q -19 6 -38 0 Z', lt(T.timber, 0.3), { shade: false }));
    };
    plant.h = 62;

    /* ---------- CLOUD ---------- */
    const cloud = (t, o) => {
      o = o || {};
      return g({ transform: o.transform, opacity: o.opacity == null ? 0.92 : o.opacity },
        form('M-46 0 Q -54 -14 -38 -18 Q -34 -34 -14 -30 Q 0 -44 20 -32 Q 42 -34 44 -14 Q 56 -10 48 0 Z', T.cloud,
          { sheen: 'M-30 -18 Q -10 -32 14 -26 Q -8 -22 -30 -12 Z', w: 1.2 }));
    };
    cloud.h = 44;

    /* ---------- LAPTOP ---------- */
    const laptop = (t, o) => {
      o = o || {};
      const blink = ((t * 1.4) % 1) > 0.5;
      return g({ transform: o.transform },
        ground(34),
        form('M-24 -8 L -16 -44 L 22 -44 L 26 -8 Z', T.metal, { sheen: 'M-18 -12 L -12 -40 L 0 -40 L -8 -12 Z' }),
        h('path', { d: 'M-20 -12 L -14 -40 L 19 -40 L 22 -12 Z', fill: dk(T.ink, 0.1) }),
        h('rect', { x: -14, y: -36, width: 20, height: 3, rx: 1.5, fill: T.accent, opacity: 0.9 }),
        h('rect', { x: -14, y: -30, width: 28, height: 3, rx: 1.5, fill: T.secondary, opacity: 0.75 }),
        h('rect', { x: -14, y: -24, width: 14, height: 3, rx: 1.5, fill: '#fff', opacity: blink ? 0.85 : 0.3 }),
        form('M-32 -8 L 34 -8 L 30 -2 L -28 -2 Z', lt(T.metal, 0.14), { sheen: 'M-26 -6 L 28 -6 L 27 -4 L -25 -4 Z' }));
    };
    laptop.h = 46;

    return { dog, cat, cyclist, chef, bird, leaf, tree, bowl, cup, plant, cloud, laptop, ground };
  }

  /* ---- factory: one call binds the recipe, the gradient registry and tokens -- */
  function make(o) {
    o = o || {};
    const T = tokens(o);
    const hgt = o.scaleRef || 110;
    const grads = {}; const order = [];
    const uid = 'il' + Math.random().toString(36).slice(2, 7);
    const reg = (c) => {
      if (!grads[c]) { grads[c] = `${uid}-${order.length}`; order.push(c); }
      return grads[c];
    };
    Object.keys(T).forEach((k) => reg(T[k]));
    [lt(T.metal, 0.14), lt(T.neutral, 0.4), lt(T.primary, 0.35), lt(T.timber, 0.3), dk(T.secondary, 0.3), '#ffffff'].forEach(reg);
    const form = makeForm(reg, hgt), line = makeLine(hgt), eye = makeEye(T);
    const lib = build(T, form, line, eye);
    /* defs must render inside the same svg; call after the figures so every
       colour used has been registered */
    lib.defs = () => h('defs', null, order.map((c) => h('linearGradient', { key: c, id: grads[c], x1: '1', y1: '0', x2: '0', y2: '1' },
      h('stop', { offset: '0%', stopColor: lt(c, R.lift) }),
      h('stop', { offset: '100%', stopColor: dk(c, R.sink) }))));
    lib.tokens = T; lib.recipe = R;
    return lib;
  }

  window.Illo = { make, tokens, mix, lighten: lt, darken: dk, alpha: al, RECIPE: R };
})();
