// HEARTH ornaments — the 2026-07-25 trio imported from the user's bundled
// dc/x-dc "omelette" reel templates (daybreak-bakehouse-film.jsx /
// organic-garden-film.jsx / lantern-night-film.jsx). These templates ARE their
// worlds, so each pack carries its film's own living furniture:
//
//   daybreak-bakehouse — a sunrise bakery counter: a warm counter slab along the
//     base with a steaming cup, a breathing low sun + raking window beam on the
//     hook, dust motes climbing the margins, pendant lamps swaying overhead.
//   organic-garden — a warm cream garden: double rolling sage hills along the
//     base, petals/leaves drifting down the margins, a sprout that draws itself
//     on the hook, stems that GROW like a chart on stat beats, seed-ring pulses
//     on the CTA.
//   lantern-night — the same world at night: a water band with shimmering
//     reflections, glowing paper lanterns rising up the margins, a haloed moon
//     + twinkling stars on the hook, wandering fireflies, a 3-lantern release
//     on the CTA.
//
// EVERYTHING is painted from the THEME (accent = terracotta/lantern glow,
// accent2 = sage, extras[0] = surface/paper, extras[1] = dawn/glow) so the Art
// Director's brand skin re-tints the whole world.
//
// Contract mirrors scene_kit_ignition_ornaments.js: called from
// buildSkinOrnaments with { framePack, kind, id, pid, T, L, seed, theme, dims,
// s0, rgba, esc, scene, sceneIndex, sceneCount }; returns { sv, dv, sc }.
// Tweens are anchored via s0() (seek-safe), loops are finite via the emitted
// reps()/sreps() helpers, SVG rotation uses svgOrigin, and all variation is
// seed-derived. Landscape props stay OUT of the kicker/headline band
// (y ~ 0.28–0.65): everything lives in the corners, the margins (x < 0.14 /
// x > 0.86), the top band (y < 0.2) or the base band (y > 0.82).

// 2026-07-25 second wave — the same "omelette reel" template zip shipped four
// more worlds, added here as siblings so the whole family lives in one module:
//   hype-wave      — electric pop: scrolling navy/cream checker band, wavy
//                    ribbon, spinning star stickers with hard offset shadows.
//   poster-pop     — kinetic poster: endless marquee ticker bands (top+bottom,
//                    voiced with the scene's own kicker), rotating starburst,
//                    solid edge color strip.
//   premiere-night — dark cinema house: chasing marquee bulb rails, sweeping
//                    spotlight cones, film-strip edge, breathing vignette.
//   story-blocks   — edited-video blocks: edge panels sliding in from
//                    alternating sides, marching conveyor chevrons, stacked
//                    story mini-blocks.
const HEARTH_PACKS = new Set([
  "daybreak-bakehouse", "organic-garden", "lantern-night",
  "hype-wave", "poster-pop", "premiere-night", "story-blocks",
]);

function buildHearthOrnaments({ framePack, kind, id, pid, T, L, seed, theme, dims, s0, rgba, esc, scene, sceneIndex = 0 }) {
  const W = dims.width, H = dims.height;
  const M = Math.min(W, H);
  const land = W >= H;
  const sv = [], dv = [], sc = [];
  const r2 = (v) => Math.round(v * 100) / 100;
  const A = theme.accent, B = theme.accent2 || A;
  const X0 = (theme.extras && theme.extras[0]) || B; // surface / paper
  const X1 = (theme.extras && theme.extras[1]) || A; // dawn light / lantern glow
  const INK = theme.ink;
  const sd = (seed + sceneIndex * 23) >>> 0;
  const left = sd % 2 === 0; // seed-picked margin side for the anchor prop

  // ---------------------------------------------------------------- daybreak
  if (framePack === "daybreak-bakehouse") {
    const cY = Math.round(H * 0.905); // counter top edge

    // counter slab + edge (every scene) — the bakery's ground line
    sv.push(`<rect class="${pid}cnt" x="0" y="${cY}" width="${W}" height="${H - cY}" fill="${rgba(A, 0.13)}" opacity="0"/>`);
    sv.push(`<rect class="${pid}cnt" x="0" y="${cY}" width="${W}" height="${Math.max(3, Math.round(M * 0.004))}" fill="${rgba(INK, 0.14)}" opacity="0"/>`);
    sc.push(`tl.to("#${id} .${pid}cnt",{opacity:1,duration:.6,ease:"power2.out"},${s0(0.25)});`);

    // one steaming cup ON the counter at a seed-picked margin (not on asset beats
    // in portrait, where the montage runs tall)
    if (land || kind !== "asset") {
      const cs = Math.max(0.7, M / 1080); // cup scale
      const cx = Math.round(W * (left ? 0.08 : 0.9)), cyb = cY + Math.round(M * 0.002);
      const cw = Math.round(38 * cs), ch = Math.round(30 * cs);
      const steam = (dx, sw, o) =>
        `<path class="${pid}stm" d="M${cx + dx} ${cyb - ch - 6} c ${-8 * cs} ${-16 * cs}, ${9 * cs} ${-22 * cs}, ${2 * cs} ${-38 * cs} c ${-6 * cs} ${-14 * cs}, ${7 * cs} ${-20 * cs}, ${3 * cs} ${-34 * cs}" fill="none" stroke="${rgba(X0, o)}" stroke-width="${sw * cs}" stroke-linecap="round" opacity="0"/>`;
      sv.push(`<g class="${pid}cup" opacity="0">`
        + `<path d="M${cx - cw} ${cyb - ch} h${cw * 2} l${-Math.round(5 * cs)} ${ch} h${-(cw * 2 - Math.round(10 * cs))} Z" fill="${rgba(X0, 0.9)}" stroke="${rgba(INK, 0.2)}" stroke-width="2"/>`
        + `<ellipse cx="${cx}" cy="${cyb - ch}" rx="${cw}" ry="${Math.round(7 * cs)}" fill="${rgba(INK, 0.12)}"/>`
        + `</g>`);
      sv.push(steam(-8 * cs, 7, 0.5));
      sv.push(steam(8 * cs, 5, 0.32));
      sc.push(`tl.to("#${id} .${pid}cup",{opacity:1,duration:.5},${s0(0.4)});`);
      sc.push(`tl.to("#${id} .${pid}stm",{opacity:1,duration:.6,stagger:.15},${s0(0.55)});`);
      sc.push(`tl.to("#${id} .${pid}stm",{y:${-Math.round(M * 0.016)},rotation:3,svgOrigin:"${cx} ${cyb}",duration:1.6,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(1.5, L - 1))},1.6),stagger:.2},${s0(0.8)});`);
    }

    // hook: low breathing sun + one raking window beam + dust motes
    if (kind === "hook" || kind === "cta") {
      const sx = Math.round(W * (land ? 0.84 : 0.78)), sy = Math.round(H * (land ? 0.17 : 0.12));
      sv.push(`<circle class="${pid}sun" cx="${sx}" cy="${sy}" r="${Math.round(M * 0.085)}" fill="${rgba(A, 0.16)}" opacity="0"/>`);
      sv.push(`<circle class="${pid}sun" cx="${sx}" cy="${sy}" r="${Math.round(M * 0.048)}" fill="${rgba(A, 0.28)}" opacity="0"/>`);
      sc.push(`tl.to("#${id} .${pid}sun",{opacity:1,duration:.8,ease:"power2.out"},${s0(0.35)});`);
      sc.push(`tl.fromTo("#${id} .${pid}sun",{scale:1,svgOrigin:"${sx} ${sy}"},{scale:1.06,svgOrigin:"${sx} ${sy}",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(2, L - 1))},2.2)},${s0(0.6)});`);
      const bx = Math.round(W * (left ? 0.72 : 0.04));
      sv.push(`<polygon class="${pid}beam" points="${bx},0 ${bx + Math.round(W * 0.09)},0 ${bx + Math.round(W * 0.2)},${cY} ${bx + Math.round(W * 0.05)},${cY}" fill="${rgba(X1, 0.24)}" opacity="0"/>`);
      sc.push(`tl.to("#${id} .${pid}beam",{opacity:.8,duration:1.1,ease:"power1.out"},${s0(0.5)});`);
      sc.push(`tl.to("#${id} .${pid}beam",{opacity:.45,duration:1.9,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(2, L - 1.4))},1.9)},${s0(1.4)});`);
    }

    // dust motes climbing the margins (hook / cta / stat)
    if (kind !== "asset") {
      const n = kind === "cta" ? 9 : 6;
      for (let i = 0; i < n; i++) {
        const mx = Math.round(W * (i % 2 ? 0.03 + ((sd >> i) % 9) / 100 : 0.89 + ((sd >> i) % 8) / 100));
        const my = Math.round(H * (0.25 + ((sd >> (i + 2)) % 55) / 100));
        const mr = 2 + ((sd >> i) % 3);
        sv.push(`<circle class="${pid}mt${i}" cx="${mx}" cy="${my}" r="${mr}" fill="${rgba(X1, 0.6)}" opacity="0"/>`);
        sc.push(`tl.to("#${id} .${pid}mt${i}",{opacity:.85,duration:.5},${s0(0.5 + i * 0.12)});`);
        sc.push(`tl.to("#${id} .${pid}mt${i}",{y:${-Math.round(M * (0.05 + (i % 3) * 0.02))},x:${(i % 2 ? -1 : 1) * Math.round(M * 0.012)},duration:${r2(2 + (i % 3) * 0.7)},ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(1.5, L - 0.8))},${r2(2 + (i % 3) * 0.7)})},${s0(0.7 + i * 0.12)});`);
      }
    }

    // pendant lamps swaying overhead (text / quote / stat)
    if (kind === "text" || kind === "quote" || kind === "stat") {
      [left ? 0.06 : 0.9, left ? 0.94 : 0.1].forEach((px, i) => {
        const lx = Math.round(W * px), drop = Math.round(H * 0.1), lr = Math.round(M * 0.022);
        sv.push(`<g class="${pid}lp${i}" opacity="0">`
          + `<line x1="${lx}" y1="0" x2="${lx}" y2="${drop}" stroke="${rgba(INK, 0.35)}" stroke-width="2.5"/>`
          + `<path d="M${lx - lr} ${drop} a${lr} ${lr} 0 0 1 ${lr * 2} 0 Z" fill="${rgba(A, 0.85)}"/>`
          + `<circle cx="${lx}" cy="${drop + Math.round(lr * 0.45)}" r="${Math.max(3, Math.round(lr * 0.3))}" fill="${X1}" style="filter:drop-shadow(0 0 ${Math.round(lr * 0.6)}px ${rgba(X1, 0.9)});"/>`
          + `</g>`);
        sc.push(`tl.to("#${id} .${pid}lp${i}",{opacity:1,duration:.6},${s0(0.45 + i * 0.2)});`);
        sc.push(`tl.fromTo("#${id} .${pid}lp${i}",{rotation:${i % 2 ? 3.2 : -3.2},svgOrigin:"${lx} 0"},{rotation:${i % 2 ? -3.2 : 3.2},svgOrigin:"${lx} 0",duration:1.9,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(1.5, L - 0.6))},1.9)},${s0(0.5)});`);
      });
    }
  }

  // ------------------------------------------------------------------ garden
  if (framePack === "organic-garden") {
    // double rolling hills along the base (every scene) — precomputed sine
    // paths; the whole group breathes sideways so the ground feels alive
    const mkHill = (base, amp1, amp2, ph) => {
      let d = `M-40,${H} L-40,${Math.round(base + Math.sin(ph) * amp1)}`;
      for (let x = 0; x <= W + 40; x += Math.max(30, Math.round(W / 36))) {
        d += ` L${x},${Math.round(base + Math.sin(x / 260 + ph) * amp1 + Math.sin(x / 90 - ph) * amp2)}`;
      }
      return d + ` L${W + 40},${H} Z`;
    };
    sv.push(`<g class="${pid}hl" opacity="0">`
      + `<path d="${mkHill(H * 0.9, M * 0.02, M * 0.007, 1.1)}" fill="${rgba(B, 0.15)}"/>`
      + `<path d="${mkHill(H * 0.945, M * 0.015, M * 0.005, 2.6)}" fill="${rgba(B, 0.23)}"/>`
      + `</g>`);
    sc.push(`tl.to("#${id} .${pid}hl",{opacity:1,duration:.7,ease:"power2.out"},${s0(0.25)});`);
    sc.push(`tl.to("#${id} .${pid}hl",{x:${left ? 14 : -14},duration:2.6,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(2, L - 0.8))},2.6)},${s0(0.5)});`);

    // petals / leaves drifting down the margins (all but asset beats)
    if (kind !== "asset") {
      const petalC = [A, B, X1];
      const n = kind === "cta" ? 8 : 5;
      for (let i = 0; i < n; i++) {
        const px = Math.round(W * (i % 2 ? 0.04 + ((sd >> i) % 8) / 100 : 0.88 + ((sd >> i) % 8) / 100));
        const py = Math.round(H * 0.06 + ((sd >> (i + 3)) % 12) / 100 * H);
        const ps = Math.max(6, Math.round(M * (0.008 + ((sd >> i) % 4) / 400)));
        const col = petalC[i % 3];
        const shape = i % 3 === 0
          ? `<ellipse cx="0" cy="0" rx="${ps}" ry="${Math.round(ps * 0.55)}" fill="${rgba(col, 0.75)}"/>`
          : i % 3 === 1
            ? `<path d="M0 ${-ps} Q ${ps} 0 0 ${ps} Q ${-ps} 0 0 ${-ps} Z" fill="${rgba(col, 0.7)}"/>`
            : `<circle cx="0" cy="0" r="${Math.round(ps * 0.6)}" fill="${rgba(col, 0.65)}"/>`;
        sv.push(`<g class="${pid}pt${i}" opacity="0" transform="translate(${px} ${py})">${shape}</g>`);
        const fall = Math.round(H * (0.5 + (i % 3) * 0.12));
        const dur = r2(Math.max(2.4, L - 0.9));
        sc.push(`tl.to("#${id} .${pid}pt${i}",{opacity:.9,duration:.4},${s0(0.35 + i * 0.16)});`);
        sc.push(`tl.to("#${id} .${pid}pt${i}",{y:${fall},x:${(i % 2 ? 1 : -1) * Math.round(M * 0.025)},rotation:${(i % 2 ? 1 : -1) * (120 + (sd >> i) % 90)},duration:${dur},ease:"none"},${s0(0.4 + i * 0.16)});`);
        sc.push(`tl.to("#${id} .${pid}pt${i}",{opacity:0,duration:.5},${s0(Math.max(0.9, 0.4 + i * 0.16 + dur - 0.5))});`);
      }
    }

    // hook: a sprout draws itself up from the soil at the near margin
    if (kind === "hook") {
      const gx = Math.round(W * (left ? 0.09 : 0.91)), gy = Math.round(H * 0.9);
      const hgt = Math.round(H * 0.13);
      sv.push(`<path class="${pid}spr" d="M${gx} ${gy} q ${left ? 8 : -8} ${-hgt * 0.45} 0 ${-hgt * 0.7} t ${left ? -4 : 4} ${-hgt * 0.3}" fill="none" stroke="${rgba(B, 0.9)}" stroke-width="${Math.max(3, Math.round(M * 0.004))}" stroke-linecap="round" stroke-dasharray="600" stroke-dashoffset="600"/>`);
      [[0.4, -1], [0.66, 1]].forEach(([f, dir], i) => {
        const ly = Math.round(gy - hgt * f), lw = Math.round(M * 0.024);
        sv.push(`<path class="${pid}lf${i}" d="M${gx} ${ly} q ${dir * lw} ${-lw * 0.3} ${dir * lw * 1.7} ${lw * 0.35} q ${-dir * lw} ${lw * 0.5} ${-dir * lw * 1.7} ${-lw * 0.35} Z" fill="${rgba(B, 0.8)}" opacity="0" transform="scale(0)" transform-origin="${gx}px ${ly}px"/>`);
        sc.push(`tl.fromTo("#${id} .${pid}lf${i}",{opacity:1,scale:0,svgOrigin:"${gx} ${ly}"},{scale:1,duration:.6,ease:"back.out(2.2)"},${s0(0.9 + i * 0.25)});`);
      });
      sc.push(`tl.to("#${id} .${pid}spr",{strokeDashoffset:0,duration:1.1,ease:"power1.inOut"},${s0(0.5)});`);
      sc.push(`tl.to("#${id} .${pid}spr",{rotation:${left ? 2.5 : -2.5},svgOrigin:"${gx} ${gy}",duration:1.8,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(1.5, L - 1.6))},1.8)},${s0(1.6)});`);
    }

    // stat: stems GROW at the far margin — the garden's own bar chart
    if (kind === "stat" || kind === "text") {
      const bx = Math.round(W * (left ? 0.9 : 0.045)), gap = Math.round(M * 0.03);
      const gy = Math.round(H * 0.9);
      [0.55, 1, 0.75].forEach((f, i) => {
        const x = bx + i * gap, hgt = Math.round(H * 0.16 * f);
        sv.push(`<line class="${pid}st${i}" x1="${x}" y1="${gy}" x2="${x}" y2="${gy - hgt}" stroke="${rgba(B, 0.85)}" stroke-width="${Math.max(3, Math.round(M * 0.0045))}" stroke-linecap="round" opacity="0"/>`);
        sv.push(`<circle class="${pid}st${i}" cx="${x}" cy="${gy - hgt}" r="${Math.max(4, Math.round(M * 0.007))}" fill="${rgba(A, 0.9)}" opacity="0"/>`);
        sc.push(`tl.fromTo("#${id} .${pid}st${i}",{opacity:1,scaleY:0,svgOrigin:"${x} ${gy}"},{scaleY:1,duration:.8,ease:"back.out(1.4)",stagger:.05},${s0(0.7 + i * 0.22)});`);
      });
    }

    // cta: seed-ring pulses at both margins
    if (kind === "cta") {
      [left ? 0.08 : 0.92, left ? 0.92 : 0.08].forEach((px, i) => {
        const cx = Math.round(W * px), cy = Math.round(H * (land ? 0.5 : 0.16));
        const rr = Math.round(M * 0.05);
        sv.push(`<circle class="${pid}rg${i}" cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="${rgba(A, 0.7)}" stroke-width="2.5" stroke-dasharray="6 9" opacity="0"/>`);
        sc.push(`tl.to("#${id} .${pid}rg${i}",{opacity:1,duration:.5},${s0(0.6 + i * 0.2)});`);
        sc.push(`tl.to("#${id} .${pid}rg${i}",{rotation:360,svgOrigin:"${cx} ${cy}",duration:14,ease:"none",repeat:reps(14)},${s0(0.8)});`);
        sc.push(`tl.fromTo("#${id} .${pid}rg${i}",{scale:.85,svgOrigin:"${cx} ${cy}"},{scale:1.08,svgOrigin:"${cx} ${cy}",duration:1.6,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(1.5, L - 1))},1.6)},${s0(0.8)});`);
      });
    }
  }

  // ----------------------------------------------------------------- lantern
  if (framePack === "lantern-night") {
    const wY = Math.round(H * 0.885); // water line
    const DARK = "#1a140d"; // lantern frame slats — a shadow tone, not a theme hue

    // water band + top glint (every scene)
    sv.push(`<g class="${pid}wt" opacity="0">`
      + `<rect x="0" y="${wY}" width="${W}" height="${H - wY}" fill="${rgba(B, 0.1)}"/>`
      + `<rect x="0" y="${wY}" width="${W}" height="2" fill="${rgba(X0, 0.22)}"/>`
      + `</g>`);
    sc.push(`tl.to("#${id} .${pid}wt",{opacity:1,duration:.7},${s0(0.25)});`);

    // a glowing lantern rising up the seed-picked margin (every scene but asset)
    const lantern = (cls, cx, scale) => {
      const s = scale;
      sv.push(`<g class="${cls}" opacity="0" transform="translate(${cx} ${H + Math.round(120 * s)})">`
        + `<circle r="${Math.round(70 * s)}" fill="${rgba(X1, 0.16)}"/>`
        + `<circle r="${Math.round(34 * s)}" fill="${rgba(X1, 0.22)}"/>`
        + `<path d="M${-24 * s},${-30 * s} C ${-24 * s},${-43 * s} ${24 * s},${-43 * s} ${24 * s},${-30 * s} L ${28 * s},${18 * s} C ${28 * s},${31 * s} ${-28 * s},${31 * s} ${-28 * s},${18 * s} Z" fill="${rgba(A, 0.95)}" style="filter:drop-shadow(0 0 ${Math.round(14 * s)}px ${rgba(X1, 0.65)});"/>`
        + `<path d="M${-24 * s},${-30 * s} C ${-24 * s},${-43 * s} ${24 * s},${-43 * s} ${24 * s},${-30 * s} L ${25 * s},0 L ${-25 * s},0 Z" fill="${rgba(X1, 0.5)}"/>`
        + `<rect x="${-13 * s}" y="${-40 * s}" width="${26 * s}" height="${6 * s}" rx="${3 * s}" fill="${rgba(DARK, 0.6)}"/>`
        + `<rect x="${-10 * s}" y="${27 * s}" width="${20 * s}" height="${5 * s}" rx="${2.5 * s}" fill="${rgba(DARK, 0.6)}"/>`
        + `</g>`);
    };
    if (kind !== "asset") {
      const lx = Math.round(W * (left ? 0.08 : 0.9));
      const ls = Math.max(0.55, M / 1400);
      lantern(`${pid}ln`, lx, ls);
      const rise = r2(Math.max(2.5, L - 0.6));
      sc.push(`tl.to("#${id} .${pid}ln",{opacity:1,duration:.5},${s0(0.35)});`);
      sc.push(`tl.to("#${id} .${pid}ln",{y:${-(H + Math.round(280 * ls))},duration:${rise},ease:"none"},${s0(0.4)});`);
      sc.push(`tl.to("#${id} .${pid}ln",{x:${left ? 16 : -16},duration:1.7,ease:"sine.inOut",yoyo:true,repeat:sreps(${rise},1.7)},${s0(0.4)});`);
      // its shimmering reflection on the water
      const rw = Math.round(M * 0.05);
      sv.push(`<line class="${pid}rf" x1="${lx - rw}" y1="${wY + Math.round((H - wY) * 0.45)}" x2="${lx + rw}" y2="${wY + Math.round((H - wY) * 0.45)}" stroke="${rgba(X1, 0.5)}" stroke-width="3" stroke-linecap="round" opacity="0"/>`);
      sc.push(`tl.to("#${id} .${pid}rf",{opacity:.7,duration:.6},${s0(0.5)});`);
      sc.push(`tl.fromTo("#${id} .${pid}rf",{scaleX:.55,svgOrigin:"${lx} ${wY}"},{scaleX:1.15,svgOrigin:"${lx} ${wY}",duration:1.3,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(1.5, L - 0.8))},1.3)},${s0(0.6)});`);
    }

    // hook: haloed moon + twinkling stars across the top band
    if (kind === "hook") {
      const mx = Math.round(W * (left ? 0.82 : 0.18)), my = Math.round(H * 0.13);
      sv.push(`<circle class="${pid}mo" cx="${mx}" cy="${my}" r="${Math.round(M * 0.105)}" fill="${rgba(X0, 0.12)}" opacity="0"/>`);
      sv.push(`<g class="${pid}mo" opacity="0">`
        + `<circle cx="${mx}" cy="${my}" r="${Math.round(M * 0.042)}" fill="${rgba(X0, 0.92)}"/>`
        + `<circle cx="${mx - Math.round(M * 0.013)}" cy="${my - Math.round(M * 0.006)}" r="${Math.round(M * 0.008)}" fill="${rgba(DARK, 0.14)}"/>`
        + `<circle cx="${mx + Math.round(M * 0.012)}" cy="${my + Math.round(M * 0.009)}" r="${Math.round(M * 0.005)}" fill="${rgba(DARK, 0.12)}"/>`
        + `</g>`);
      sc.push(`tl.to("#${id} .${pid}mo",{opacity:1,duration:.9,ease:"power2.out"},${s0(0.35)});`);
      sc.push(`tl.fromTo("#${id} .${pid}mo",{scale:1,svgOrigin:"${mx} ${my}"},{scale:1.05,svgOrigin:"${mx} ${my}",duration:2.4,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(2, L - 1))},2.4)},${s0(0.6)});`);
    }
    if (kind === "hook" || kind === "stat") {
      for (let i = 0; i < 8; i++) {
        const x = Math.round(W * (0.05 + ((sd >> i) % 90) / 100));
        const y = Math.round(H * (0.03 + ((sd >> (i + 2)) % 15) / 100));
        sv.push(`<circle class="${pid}sr${i}" cx="${x}" cy="${y}" r="${1.5 + ((sd >> i) % 2)}" fill="${rgba(X0, 0.9)}" opacity="0"/>`);
        sc.push(`tl.to("#${id} .${pid}sr${i}",{opacity:.35,duration:.4},${s0(0.4 + i * 0.08)});`);
        sc.push(`tl.to("#${id} .${pid}sr${i}",{opacity:.9,duration:${r2(0.7 + (i % 3) * 0.35)},ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(1.5, L - 1))},${r2(0.7 + (i % 3) * 0.35)})},${s0(0.7 + i * 0.08)});`);
      }
    }

    // text / quote: sage fireflies wandering the margins
    if (kind === "text" || kind === "quote") {
      for (let i = 0; i < 5; i++) {
        const fx = Math.round(W * (i % 2 ? 0.05 + ((sd >> i) % 7) / 100 : 0.88 + ((sd >> i) % 7) / 100));
        const fy = Math.round(H * (0.14 + ((sd >> (i + 4)) % 60) / 100));
        sv.push(`<circle class="${pid}ff${i}" cx="${fx}" cy="${fy}" r="${2.5 + (i % 2)}" fill="${B}" style="filter:drop-shadow(0 0 5px ${rgba(B, 0.9)});" opacity="0"/>`);
        sc.push(`tl.to("#${id} .${pid}ff${i}",{opacity:.9,duration:.5},${s0(0.45 + i * 0.14)});`);
        sc.push(`tl.to("#${id} .${pid}ff${i}",{x:${(i % 2 ? 1 : -1) * Math.round(M * 0.02)},y:${(i % 3 ? -1 : 1) * Math.round(M * 0.028)},duration:${r2(1.6 + (i % 3) * 0.5)},ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(1.5, L - 0.8))},${r2(1.6 + (i % 3) * 0.5)})},${s0(0.6 + i * 0.14)});`);
        sc.push(`tl.to("#${id} .${pid}ff${i}",{opacity:.3,duration:${r2(0.8 + (i % 2) * 0.4)},ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(1.5, L - 0.8))},${r2(0.8 + (i % 2) * 0.4)})},${s0(0.8 + i * 0.14)});`);
      }
    }

    // cta: the release — two more lanterns lift off staggered
    if (kind === "cta") {
      const ls = Math.max(0.42, M / 1750);
      [left ? 0.9 : 0.08, left ? 0.16 : 0.84].forEach((px, i) => {
        const cls = `${pid}lr${i}`;
        lantern(cls, Math.round(W * px), ls * (i ? 0.8 : 1));
        const rise = r2(Math.max(2, L - 1 - i * 0.4));
        sc.push(`tl.to("#${id} .${cls}",{opacity:1,duration:.5},${s0(0.7 + i * 0.5)});`);
        sc.push(`tl.to("#${id} .${cls}",{y:${-(H + 320)},duration:${rise},ease:"none"},${s0(0.8 + i * 0.5)});`);
        sc.push(`tl.to("#${id} .${cls}",{x:${i % 2 ? -14 : 14},duration:1.5,ease:"sine.inOut",yoyo:true,repeat:sreps(${rise},1.5)},${s0(0.8 + i * 0.5)});`);
      });
    }
  }

  // -------------------------------------------------------------- hype-wave
  if (framePack === "hype-wave") {
    const BLUE = A, CORAL = B, YEL = X0, NAVY = X1;

    // scrolling checker band along the bottom edge (every scene) — the pop
    // reel's ground line; tilted a hair, never stops moving
    {
      const cell = Math.max(20, Math.round(M * 0.03));
      const by = H - Math.round(cell * 1.4);
      const cols = Math.ceil(W / cell) + 6;
      const cells = [];
      for (let i = 0; i < cols; i++) {
        if (i % 2 === 0) cells.push(`<rect x="${i * cell - cell * 2}" y="${by}" width="${cell}" height="${cell}" fill="${rgba(NAVY, 0.85)}"/>`);
        else cells.push(`<rect x="${i * cell - cell * 2}" y="${by + Math.round(cell * 0.5)}" width="${cell}" height="${Math.round(cell * 0.5)}" fill="${rgba(BLUE, 0.5)}"/>`);
      }
      sv.push(`<g class="${pid}ck" opacity="0" transform="rotate(-1.6 ${Math.round(W / 2)} ${by})">${cells.join("")}</g>`);
      sc.push(`tl.to("#${id} .${pid}ck",{opacity:1,duration:.4},${s0(0.3)});`);
      sc.push(`tl.to("#${id} .${pid}ck",{x:${-cell * 2},duration:1.1,ease:"none",repeat:sreps(${r2(Math.max(1.5, L - 0.5))},1.1)},${s0(0.35)});`);
    }

    // spinning star sticker with a hard offset shadow (hook / cta / stat)
    if (kind === "hook" || kind === "cta" || kind === "stat") {
      const scx = Math.round(W * (left ? 0.12 : 0.88)), scy = Math.round(H * (land ? 0.16 : 0.1));
      const R0 = Math.round(M * 0.05), R1 = Math.round(R0 * 0.55), OFF = Math.max(4, Math.round(M * 0.008));
      const star = (cx, cy) => { const p = []; for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? R1 : R0; p.push(`${Math.round(cx + Math.cos(a) * rr)},${Math.round(cy + Math.sin(a) * rr)}`); } return p.join(" "); };
      sv.push(`<g class="${pid}st8" opacity="0"><polygon points="${star(scx + OFF, scy + OFF)}" fill="${rgba(NAVY, 0.95)}"/><polygon points="${star(scx, scy)}" fill="${YEL}" stroke="${rgba(NAVY, 0.95)}" stroke-width="3"/></g>`);
      sc.push(`tl.fromTo("#${id} .${pid}st8",{opacity:0,scale:0,svgOrigin:"${scx} ${scy}"},{opacity:1,scale:1,duration:.5,ease:"back.out(2.2)"},${s0(0.45)});`);
      sc.push(`tl.to("#${id} .${pid}st8",{rotation:360,svgOrigin:"${scx} ${scy}",duration:9,ease:"none",repeat:reps(9)},${s0(0.6)});`);
    }

    // wavy ribbon rolling near the top edge (text / quote / cta)
    if (kind === "text" || kind === "quote" || kind === "cta") {
      const ry = Math.round(H * (land ? 0.08 : 0.055));
      let d = `M-60,${ry}`;
      for (let x = 0; x <= W + 60; x += 40) d += ` L${x},${Math.round(ry + Math.sin(x / 130) * M * 0.02)}`;
      sv.push(`<path class="${pid}rb" d="${d}" fill="none" stroke="${rgba(kind === "cta" ? CORAL : BLUE, 0.8)}" stroke-width="${Math.max(8, Math.round(M * 0.013))}" stroke-linecap="round" opacity="0"/>`);
      sc.push(`tl.to("#${id} .${pid}rb",{opacity:1,duration:.5},${s0(0.4)});`);
      sc.push(`tl.to("#${id} .${pid}rb",{x:-40,duration:1.4,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(1.5, L - 0.6))},1.4)},${s0(0.5)});`);
    }

    // wobbling sticker dots at the margins (all but asset)
    if (kind !== "asset") {
      [[0.06, 0.42, BLUE], [0.94, 0.55, CORAL], [0.08, 0.72, YEL]].forEach(([px, py, col], i) => {
        const dx2 = Math.round(W * px), dy2 = Math.round(H * py), rr = Math.max(6, Math.round(M * 0.011));
        sv.push(`<g class="${pid}dt${i}" opacity="0"><circle cx="${dx2 + 3}" cy="${dy2 + 3}" r="${rr}" fill="${rgba(NAVY, 0.9)}"/><circle cx="${dx2}" cy="${dy2}" r="${rr}" fill="${col}" stroke="${rgba(NAVY, 0.9)}" stroke-width="2.5"/></g>`);
        sc.push(`tl.fromTo("#${id} .${pid}dt${i}",{opacity:0,scale:0,svgOrigin:"${dx2} ${dy2}"},{opacity:1,scale:1,duration:.4,ease:"back.out(2.4)"},${s0(0.5 + i * 0.15)});`);
        sc.push(`tl.to("#${id} .${pid}dt${i}",{y:${i % 2 ? 8 : -8},duration:${r2(1.2 + i * 0.3)},ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(1.5, L - 0.7))},${r2(1.2 + i * 0.3)})},${s0(0.7 + i * 0.15)});`);
      });
    }
  }

  // ------------------------------------------------------------- poster-pop
  if (framePack === "poster-pop") {
    // endless marquee ticker bands top + bottom (every scene), voiced with the
    // scene's own kicker/title — the poster's signature chrome
    {
      const kick = String((scene && (scene.kicker || scene.headline || scene.title)) || "").replace(/\|/g, " ").trim().toUpperCase();
      const word = (esc ? esc(kick) : kick) || "&#9679;";
      const one = word + " &#183; ";
      const fs = Math.max(13, Math.round(M * 0.019));
      const runs = Math.max(6, Math.ceil((W * 1.6) / (fs * (kick.length + 3) * 0.62)));
      const line = one.repeat(runs);
      const mono = `font-family:'Figtree',Inter,sans-serif;font-weight:700;letter-spacing:.18em;font-size:${fs}px;`;
      [Math.round(fs * 1.7), H - Math.round(fs * 0.8)].forEach((ty, i) => {
        sv.push(`<text class="${pid}tk${i}" x="0" y="${ty}" style="${mono}" fill="${rgba(INK, 0.7)}" opacity="0">${line}</text>`);
        sc.push(`tl.to("#${id} .${pid}tk${i}",{opacity:1,duration:.4},${s0(0.3 + i * 0.1)});`);
        sc.push(`tl.to("#${id} .${pid}tk${i}",{x:${(i ? 1 : -1) * -Math.round(W * 0.4)},duration:${r2(Math.max(2.5, L - 0.4))},ease:"none"},${s0(0.35)});`);
      });
    }

    // rotating starburst badge (hook / cta)
    if (kind === "hook" || kind === "cta") {
      const cx = Math.round(W * (left ? 0.85 : 0.15)), cy = Math.round(H * (land ? 0.2 : 0.12));
      const R0 = Math.round(M * 0.055), R1 = Math.round(R0 * 0.72);
      const p = []; for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2, rr = i % 2 ? R1 : R0; p.push(`${Math.round(cx + Math.cos(a) * rr)},${Math.round(cy + Math.sin(a) * rr)}`); }
      sv.push(`<g class="${pid}sb" opacity="0"><polygon points="${p.join(" ")}" fill="${rgba(A, 0.92)}"/><circle cx="${cx}" cy="${cy}" r="${Math.round(R1 * 0.55)}" fill="${theme.ground}"/></g>`);
      sc.push(`tl.fromTo("#${id} .${pid}sb",{opacity:0,scale:0,svgOrigin:"${cx} ${cy}"},{opacity:1,scale:1,duration:.55,ease:"back.out(1.8)"},${s0(0.5)});`);
      sc.push(`tl.to("#${id} .${pid}sb",{rotation:360,svgOrigin:"${cx} ${cy}",duration:16,ease:"none",repeat:reps(16)},${s0(0.7)});`);
    }

    // solid edge color strip sliding in (text / stat / quote) — the poster block
    if (kind === "text" || kind === "stat" || kind === "quote") {
      const sw = Math.max(8, Math.round(M * 0.014));
      const sx = left ? 0 : W - sw;
      sv.push(`<rect class="${pid}es" x="${sx}" y="0" width="${sw}" height="${H}" fill="${rgba(kind === "stat" ? B : A, 0.85)}" opacity="0"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}es",{opacity:1,scaleY:0,svgOrigin:"${sx} 0"},{scaleY:1,duration:.7,ease:"power3.out"},${s0(0.4)});`);
    }
  }

  // --------------------------------------------------------- premiere-night
  if (framePack === "premiere-night") {
    const GOLD = B, PAPER = X0, PANEL = X1;

    // chasing marquee bulb rails top + bottom (every scene)
    {
      const n = land ? 16 : 11;
      const m = Math.round(M * 0.03);
      const rr = Math.max(3, Math.round(M * 0.0055));
      [m, H - m].forEach((by, row) => {
        for (let i = 0; i < n; i++) {
          const bx = Math.round((W / (n + 1)) * (i + 1));
          const cls = `${pid}bl${row}_${i}`;
          sv.push(`<circle class="${cls}" cx="${bx}" cy="${by}" r="${rr}" fill="${rgba(GOLD, 0.9)}" opacity="0" style="filter:drop-shadow(0 0 ${rr * 2}px ${rgba(GOLD, 0.8)});"/>`);
          sc.push(`tl.to("#${id} .${cls}",{opacity:.22,duration:.3},${s0(0.3)});`);
          // the chase: each bulb flares in sequence, loops finite
          sc.push(`tl.to("#${id} .${cls}",{opacity:.95,duration:.14,yoyo:true,repeat:1},${s0(r2(0.5 + (i / n) * 1.2 + row * 0.6))});`);
          sc.push(`tl.to("#${id} .${cls}",{opacity:.9,duration:.55,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(1.2, L - 2.2))},.55)},${s0(r2(2.0 + (i / n) * 1.2 + row * 0.6))});`);
        }
      });
    }

    // sweeping spotlight cones from the upper corners (hook / cta)
    if (kind === "hook" || kind === "cta") {
      [[0, 1], [W, -1]].forEach(([ax, dir], i) => {
        const spread = Math.round(W * 0.34);
        sv.push(`<polygon class="${pid}sp${i}" points="${ax},0 ${ax + dir * Math.round(spread * 0.4)},0 ${ax + dir * spread + dir * 120},${H} ${ax + dir * Math.round(spread * 0.5)},${H}" fill="${rgba(PAPER, 0.09)}" opacity="0"/>`);
        sc.push(`tl.to("#${id} .${pid}sp${i}",{opacity:1,duration:.9,ease:"power1.out"},${s0(0.4 + i * 0.25)});`);
        sc.push(`tl.to("#${id} .${pid}sp${i}",{rotation:${dir * 7},svgOrigin:"${ax} 0",duration:2.6,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(2, L - 1.2))},2.6)},${s0(0.6)});`);
      });
    }

    // film-strip edge rail (text / stat / quote / asset)
    if (kind !== "hook" && kind !== "cta") {
      const stw = Math.round(M * 0.045);
      const sx = left ? Math.round(M * 0.012) : W - Math.round(M * 0.012) - stw;
      const frames = [];
      const fh = Math.round(stw * 0.72), gap = Math.round(stw * 0.22);
      const nfr = Math.ceil(H / (fh + gap)) + 2;
      for (let i = 0; i < nfr; i++) {
        const fy = i * (fh + gap);
        frames.push(`<rect x="${sx + Math.round(stw * 0.16)}" y="${fy}" width="${Math.round(stw * 0.68)}" height="${fh}" rx="3" fill="${rgba(PAPER, 0.07)}"/>`);
        frames.push(`<circle cx="${sx + Math.round(stw * 0.08)}" cy="${fy + Math.round(fh * 0.5)}" r="2" fill="${rgba(PAPER, 0.3)}"/>`);
        frames.push(`<circle cx="${sx + stw - Math.round(stw * 0.08)}" cy="${fy + Math.round(fh * 0.5)}" r="2" fill="${rgba(PAPER, 0.3)}"/>`);
      }
      sv.push(`<g class="${pid}fs" opacity="0"><rect x="${sx}" y="-40" width="${stw}" height="${H + 80}" fill="${rgba(PANEL, 0.85)}"/>${frames.join("")}</g>`);
      sc.push(`tl.to("#${id} .${pid}fs",{opacity:1,duration:.7},${s0(0.35)});`);
      sc.push(`tl.to("#${id} .${pid}fs",{y:${-(fh + gap)},duration:${r2(Math.max(2, L - 0.8))},ease:"none"},${s0(0.5)});`);
    }
  }

  // ------------------------------------------------------------ story-blocks
  if (framePack === "story-blocks") {
    const OLIVE = B, CLAY = X1;

    // edge panels sliding in from ALTERNATING sides (every scene)
    {
      const pw = Math.max(10, Math.round(M * 0.016));
      const firstLeft = (sceneIndex + (left ? 0 : 1)) % 2 === 0;
      [[firstLeft ? 0 : W - pw, A, 0], [firstLeft ? W - pw : 0, OLIVE, 0.2]].forEach(([px, col, dly], i) => {
        const fromX = px === 0 ? -pw * 2 : pw * 2;
        sv.push(`<rect class="${pid}ep${i}" x="${px}" y="0" width="${pw}" height="${H}" fill="${rgba(col, 0.85)}" opacity="0"/>`);
        sc.push(`tl.fromTo("#${id} .${pid}ep${i}",{opacity:1,x:${fromX},skewX:-6},{x:0,skewX:0,duration:.6,ease:"power3.out"},${s0(0.3 + dly)});`);
      });
    }

    // conveyor chevrons marching along the base (text / stat / asset)
    if (kind === "text" || kind === "stat" || kind === "asset") {
      const cy = H - Math.round(M * 0.035);
      const chev = Math.round(M * 0.016);
      for (let i = 0; i < 4; i++) {
        const cx = Math.round(W * 0.5) + (i - 1.5) * chev * 3;
        sv.push(`<path class="${pid}cv" d="M${cx - chev} ${cy - chev} L${cx} ${cy} L${cx - chev} ${cy + chev}" fill="none" stroke="${rgba(CLAY, 0.7)}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>`);
      }
      sc.push(`tl.to("#${id} .${pid}cv",{opacity:.9,duration:.35,stagger:.09},${s0(0.5)});`);
      sc.push(`tl.to("#${id} .${pid}cv",{x:${chev * 3},duration:.9,ease:"power1.inOut",stagger:.09,yoyo:true,repeat:sreps(${r2(Math.max(1.5, L - 1))},.9)},${s0(0.8)});`);
    }

    // stacked story mini-blocks stepping in (hook / cta / quote)
    if (kind === "hook" || kind === "cta" || kind === "quote") {
      const bw = Math.round(M * 0.05), bh = Math.round(M * 0.016);
      const bx = Math.round(W * (left ? 0.06 : 0.94 - 0.05));
      const by0 = Math.round(H * (land ? 0.83 : 0.9));
      [A, OLIVE, X0].forEach((col, i) => {
        sv.push(`<rect class="${pid}mb${i}" x="${bx}" y="${by0 - i * (bh + 6)}" width="${bw - i * Math.round(bw * 0.18)}" height="${bh}" rx="3" fill="${rgba(col, 0.9)}" opacity="0"/>`);
        sc.push(`tl.fromTo("#${id} .${pid}mb${i}",{opacity:0,x:${(i % 2 ? 1 : -1) * 40}},{opacity:1,x:0,duration:.45,ease:"power3.out"},${s0(0.5 + i * 0.18)});`);
      });
    }
  }

  return { sv, dv, sc };
}

module.exports = { HEARTH_PACKS, buildHearthOrnaments };
