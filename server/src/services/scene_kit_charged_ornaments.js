// CHARGED ornaments — animated scene furniture for the two 2026-07-22
// color-adaptive showcase packs:
//
//   KALEIDO  (radial kaleidoscope world) — a central mandala that blooms petal
//            ring by petal ring, concentric pulse rings breathing out from the
//            core, a slowly rotating spoke-ray halo, orbiting satellite dots,
//            and quarter-circle corner fans that draw themselves.
//
//   VOLTAGE  (electric high-voltage world) — a forking lightning bolt that
//            strikes on the hook, a Tesla arc crackling between two electrodes,
//            a capacitor charge-ring that fills, an oscilloscope waveform that
//            sweeps the base, a spark burst on the CTA, and a plasma orb.
//
// EVERYTHING is drawn from the THEME's colors (accent / accent2 / extras / ink /
// ground) — never a hardcoded hue — so the Art Director's brand skin (or a
// user-picked color) re-tints the entire pack. That is the whole point of these
// two packs: one hue drives the feel.
//
// Contract mirrors scene_kit_bespoke_ornaments.js: called from buildSkinOrnaments
// with { framePack, kind, id, pid, T, L, seed, theme, dims, s0, rgba, mix, esc,
// scene, sceneIndex, sceneCount }; returns { sv, dv, sc }. Tweens are anchored
// via s0() (seek-safe), loops are finite via the emitted reps()/sreps() helpers,
// SVG rotation uses svgOrigin (GSAP clobbers the rotate attribute), and all
// variation is seed-derived (no Math.random at runtime).

function buildChargedOrnaments({ framePack, kind, id, pid, T, L, seed, theme, dims, s0, rgba, mix, esc, scene, sceneIndex = 0, sceneCount = 5 }) {
  const W = dims.width, H = dims.height;
  const M = Math.min(W, H);
  const sv = [], dv = [], sc = [];
  const r2 = (v) => Math.round(v * 100) / 100;
  const A = theme.accent, B = theme.accent2 || A;
  const X0 = (theme.extras && theme.extras[0]) || B;
  const X1 = (theme.extras && theme.extras[1]) || A;
  const sd = (seed + sceneIndex * 13) >>> 0;

  /* ============================== KALEIDO ==============================
     Radial symmetry: everything blooms, pulses or turns around the center. */
  if (framePack === "kaleido") {
    const cx = Math.round(W * 0.5), cy = Math.round(H * 0.5);

    // Rotating spoke-ray halo (every scene) — faint radial spokes framing the
    // center, turning slowly one way while a second, finer ring turns the other.
    {
      const rays = 18, rOut = Math.round(M * 0.62), rIn = Math.round(M * 0.2);
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2;
        const x1 = cx + Math.cos(a) * rIn, y1 = cy + Math.sin(a) * rIn;
        const x2 = cx + Math.cos(a) * rOut, y2 = cy + Math.sin(a) * rOut;
        sv.push(`<line class="${pid}spk" x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="${rgba(A, 0.1)}" stroke-width="1.5"/>`);
      }
      sc.push(`tl.fromTo("#${id} .${pid}spk",{opacity:0},{opacity:1,duration:.6},${s0(0.3)});`);
      sc.push(`tl.to("#${id} .${pid}spk",{rotation:${(sd % 2 ? 1 : -1) * 40},svgOrigin:"${cx} ${cy}",duration:${r2(Math.max(6, L * 2))},ease:"none"},${s0(0.3)});`);
    }

    // Concentric pulse rings (every scene) — three rings breathe outward from the
    // core on a loop, a heartbeat at the center of the kaleidoscope.
    {
      for (let i = 0; i < 3; i++) {
        const rr = Math.round(M * 0.16);
        sv.push(`<circle class="${pid}pr${i}" cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="${rgba(i === 1 ? B : A, 0.4)}" stroke-width="2" opacity="0"/>`);
        sc.push(`tl.fromTo("#${id} .${pid}pr${i}",{opacity:.5,scale:.5,svgOrigin:"${cx} ${cy}"},{opacity:0,scale:2.6,duration:2.4,ease:"power1.out",repeat:sreps(${r2(L)},2.6),repeatDelay:.2},${s0(0.4 + i * 0.7)});`);
      }
    }

    // Central mandala (hook / cta) — two rings of petals unfurl outward, petal by
    // petal, behind the headline. Low opacity so the copy stays legible.
    if (kind === "hook" || kind === "cta") {
      const ringDefs = [[Math.round(M * 0.22), 8, A, 0.3], [Math.round(M * 0.34), 12, B, 0.22]];
      ringDefs.forEach(([rad, n, col, op], ri) => {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
          const deg = (a * 180 / Math.PI + 90).toFixed(1);
          sv.push(`<ellipse class="${pid}pt${ri}" cx="${px.toFixed(0)}" cy="${py.toFixed(0)}" rx="${Math.round(M * 0.02)}" ry="${Math.round(M * 0.05)}" fill="none" stroke="${rgba(col, op)}" stroke-width="1.6" transform="rotate(${deg} ${px.toFixed(0)} ${py.toFixed(0)})" opacity="0"/>`);
        }
        sc.push(`tl.fromTo("#${id} .${pid}pt${ri}",{opacity:0,scale:0,svgOrigin:"${cx} ${cy}"},{opacity:1,scale:1,duration:.5,stagger:.05,ease:"back.out(1.7)"},${s0(0.5 + ri * 0.4)});`);
      });
      sc.push(`tl.to("#${id} .${pid}pt0,#${id} .${pid}pt1",{rotation:${(sd % 2 ? -1 : 1) * 24},svgOrigin:"${cx} ${cy}",duration:${r2(Math.max(4, L - 1))},ease:"sine.inOut"},${s0(1.4)});`);
    }

    // Orbiting satellites (stat / text) — three dots circling the center on
    // separate radii and periods, each on its own faint orbit ring.
    if (kind === "stat" || kind === "text" || kind === "quote") {
      for (let i = 0; i < 3; i++) {
        const rad = Math.round(M * (0.26 + i * 0.1));
        const col = [A, B, X0][i];
        sv.push(`<circle cx="${cx}" cy="${cy}" r="${rad}" fill="none" stroke="${rgba(col, 0.14)}" stroke-width="1" class="${pid}orb${i}"/>`);
        sv.push(`<circle class="${pid}sat${i}" cx="${cx + rad}" cy="${cy}" r="${Math.max(3, Math.round(M * 0.008))}" fill="${col}" opacity="0"/>`);
        sc.push(`tl.to("#${id} .${pid}sat${i}",{opacity:.9,duration:.4},${s0(0.6 + i * 0.2)});`);
        sc.push(`tl.fromTo("#${id} .${pid}sat${i}",{rotation:${i * 120},svgOrigin:"${cx} ${cy}"},{rotation:${i * 120 + (i % 2 ? -360 : 360)},svgOrigin:"${cx} ${cy}",duration:${r2(7 + i * 3)},ease:"none",repeat:reps(${r2(7 + i * 3)})},${s0(0.6)});`);
      }
    }

    // Corner radial fans (every scene) — quarter arcs drawing themselves from a
    // seeded corner, echoing the kaleidoscope geometry into the margins.
    {
      const corners = [[0, 0], [W, 0], [W, H], [0, H]];
      const [fx, fy] = corners[sd % 4];
      const dir = fx === 0 ? 1 : -1, vdir = fy === 0 ? 1 : -1;
      for (let i = 1; i <= 3; i++) {
        const rad = Math.round(M * 0.1 * i);
        const arc = Math.round(2 * Math.PI * rad * 0.25);
        sv.push(`<path class="${pid}fan" d="M${fx + dir * rad} ${fy} A ${rad} ${rad} 0 0 ${dir * vdir > 0 ? 1 : 0} ${fx} ${fy + vdir * rad}" fill="none" stroke="${rgba([A, B, X1][i - 1], 0.3)}" stroke-width="1.6" stroke-dasharray="${arc}" stroke-dashoffset="${arc}"/>`);
      }
      sc.push(`tl.to("#${id} .${pid}fan",{strokeDashoffset:0,duration:.7,stagger:.12,ease:"power2.out"},${s0(0.5)});`);
    }

  /* ============================== VOLTAGE ==============================
     High voltage: everything strikes, arcs, charges or crackles. */
  } else if (framePack === "voltage") {
    const glow = (c, w) => `filter:drop-shadow(0 0 ${w}px ${rgba(c, 0.9)}) drop-shadow(0 0 ${w * 2.4}px ${rgba(c, 0.45)});`;

    // Oscilloscope waveform (every scene) — a glowing trace sweeps the base of
    // the frame; the phosphor line redraws its dash so it appears to run.
    {
      const wy = Math.round(H * 0.9), amp = Math.round(H * 0.035), step = Math.round(W / 40);
      let d = `M0 ${wy}`;
      for (let x = 0; x <= W; x += step) {
        const k = x / W;
        const y = wy + Math.sin(k * 22 + sd) * amp * (0.4 + 0.6 * Math.sin(k * 6));
        d += ` L${x} ${Math.round(y)}`;
      }
      const len = Math.round(W * 1.3);
      sv.push(`<path class="${pid}wav" d="${d}" fill="none" stroke="${A}" stroke-width="2" stroke-linecap="round" opacity="0" style="${glow(A, 3)}stroke-dasharray:${len};stroke-dashoffset:${len};"/>`);
      sc.push(`tl.set("#${id} .${pid}wav",{opacity:.8},${s0(0.3)});`);
      sc.push(`tl.fromTo("#${id} .${pid}wav",{strokeDashoffset:${len}},{strokeDashoffset:0,duration:1.1,ease:"power1.inOut"},${s0(0.3)});`);
      sc.push(`tl.to("#${id} .${pid}wav",{strokeDashoffset:${-len},duration:${r2(Math.max(3, L))},ease:"none",repeat:sreps(${r2(L)},${r2(Math.max(3, L))})},${s0(1.4)});`);
    }

    // Tesla arc (every scene) — two electrode discs in a corner with a jagged arc
    // crackling between them; the arc's dash jitters so it reads as live current.
    {
      const ex = Math.round(W * (kind === "cta" ? 0.14 : 0.87)), ey = Math.round(H * 0.2);
      const gap = Math.round(M * 0.12);
      const e1x = ex - gap / 2, e2x = ex + gap / 2;
      // jagged arc path between electrodes
      let d = `M${e1x} ${ey}`;
      const n = 5;
      for (let i = 1; i <= n; i++) {
        const x = e1x + (e2x - e1x) * (i / n);
        const y = ey + ((i % 2 ? -1 : 1) * M * 0.03) * (((sd + i * 7) % 4) / 3 + 0.4) * (i === n ? 0 : 1);
        d += ` L${x.toFixed(0)} ${y.toFixed(0)}`;
      }
      sv.push(`<circle cx="${e1x}" cy="${ey}" r="${Math.round(M * 0.014)}" fill="${rgba(A, 0.9)}" class="${pid}el" style="${glow(A, 3)}"/>`);
      sv.push(`<circle cx="${e2x}" cy="${ey}" r="${Math.round(M * 0.014)}" fill="${rgba(A, 0.9)}" class="${pid}el" style="${glow(A, 3)}"/>`);
      sv.push(`<path class="${pid}arc" d="${d}" fill="none" stroke="${B}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0" style="${glow(B, 2.5)}"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}el",{scale:0,svgOrigin:"${ex} ${ey}"},{scale:1,duration:.4,ease:"back.out(2)"},${s0(0.4)});`);
      // crackle: the arc blinks on/off on a fast irregular-ish cadence (finite)
      sc.push(`tl.fromTo("#${id} .${pid}arc",{opacity:0},{opacity:.9,duration:.08,ease:"steps(1)",yoyo:true,repeat:sreps(${r2(L)},.26)*2},${s0(0.6)});`);
    }

    // Forking lightning bolt (hook) — a bold bolt strikes down one side of the
    // frame, drawn fast via strokeDashoffset, then flickers out.
    if (kind === "hook") {
      const bx = Math.round(W * (sd % 2 ? 0.2 : 0.8));
      let d = `M${bx} 0`;
      const segs = 7;
      let px = bx;
      for (let i = 1; i <= segs; i++) {
        const y = (i / segs) * H;
        const nx = px + ((i % 2 ? 1 : -1) * W * 0.06) * (((sd + i * 5) % 4) / 3 + 0.4);
        d += ` L${nx.toFixed(0)} ${y.toFixed(0)}`;
        px = nx;
      }
      const len = Math.round(H * 1.5);
      sv.push(`<path class="${pid}bolt" d="${d}" fill="none" stroke="${A}" stroke-width="${Math.max(3, Math.round(H * 0.006))}" stroke-linejoin="round" stroke-linecap="round" opacity="0" style="${glow(A, 5)}stroke-dasharray:${len};stroke-dashoffset:${len};"/>`);
      sc.push(`tl.set("#${id} .${pid}bolt",{opacity:1},${s0(0.35)});`);
      sc.push(`tl.fromTo("#${id} .${pid}bolt",{strokeDashoffset:${len}},{strokeDashoffset:0,duration:.22,ease:"none"},${s0(0.35)});`);
      sc.push(`tl.to("#${id} .${pid}bolt",{opacity:.25,duration:.1,yoyo:true,repeat:5,ease:"steps(1)"},${s0(0.6)});`);
      sc.push(`tl.to("#${id} .${pid}bolt",{opacity:0,duration:.6,ease:"power2.out"},${s0(1.4)});`);
    }

    // Capacitor charge-ring (stat / text) — an arc fills like a capacitor topping
    // up, a bolt glyph at its center, in a margin.
    if (kind === "stat" || kind === "text") {
      const rx = Math.round(W * 0.88), ry = Math.round(H * 0.74), rr = Math.round(M * 0.07);
      const circ = Math.round(2 * Math.PI * rr);
      sv.push(`<circle cx="${rx}" cy="${ry}" r="${rr}" fill="none" stroke="${rgba(A, 0.16)}" stroke-width="3"/>`);
      sv.push(`<circle class="${pid}cap" cx="${rx}" cy="${ry}" r="${rr}" fill="none" stroke="${A}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ}" transform="rotate(-90 ${rx} ${ry})" style="${glow(A, 2)}"/>`);
      sv.push(`<path class="${pid}capb" d="M${rx + 3} ${ry - rr * 0.5} L${rx - 5} ${ry + 2} L${rx + 1} ${ry + 2} L${rx - 3} ${ry + rr * 0.5} L${rx + 6} ${ry - 1} L${rx} ${ry - 1} Z" fill="${B}" opacity="0" style="${glow(B, 2)}"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}cap",{strokeDashoffset:${circ}},{strokeDashoffset:0,duration:1.3,ease:"power2.inOut"},${s0(0.6)});`);
      sc.push(`tl.fromTo("#${id} .${pid}capb",{opacity:0,scale:0,svgOrigin:"${rx} ${ry}"},{opacity:1,scale:1,duration:.4,ease:"back.out(2.4)"},${s0(1.7)});`);
    }

    // Plasma orb (hook / cta) + spark burst (cta) — a glowing sphere with inner
    // arcs; on the CTA, sparks fly off it.
    if (kind === "hook" || kind === "cta") {
      const ox = Math.round(W * (kind === "cta" ? 0.5 : 0.85)), oy = Math.round(H * (kind === "cta" ? 0.24 : 0.78)), orr = Math.round(M * 0.05);
      sv.push(`<circle class="${pid}orb" cx="${ox}" cy="${oy}" r="${orr}" fill="${rgba(A, 0.12)}" stroke="${rgba(A, 0.6)}" stroke-width="1.5" opacity="0" style="${glow(A, 3)}"/>`);
      for (let i = 0; i < 3; i++) {
        const a0 = (i / 3) * Math.PI * 2 + (sd % 6) * 0.2;
        sv.push(`<path class="${pid}oa" d="M${ox} ${oy} q ${(Math.cos(a0) * orr * 0.7).toFixed(0)} ${(Math.sin(a0) * orr * 0.4).toFixed(0)} ${(Math.cos(a0) * orr).toFixed(0)} ${(Math.sin(a0) * orr).toFixed(0)}" fill="none" stroke="${rgba(B, 0.8)}" stroke-width="1.5" opacity="0" style="${glow(B, 1.5)}"/>`);
      }
      sc.push(`tl.fromTo("#${id} .${pid}orb",{opacity:0,scale:.4,svgOrigin:"${ox} ${oy}"},{opacity:1,scale:1,duration:.6,ease:"back.out(1.8)"},${s0(0.5)});`);
      sc.push(`tl.fromTo("#${id} .${pid}oa",{opacity:0},{opacity:.9,duration:.3,stagger:.08},${s0(0.9)});`);
      sc.push(`tl.to("#${id} .${pid}oa",{rotation:${(sd % 2 ? 360 : -360)},svgOrigin:"${ox} ${oy}",duration:${r2(Math.max(3, L - 1))},ease:"none"},${s0(1.0)});`);
      if (kind === "cta") {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const sx2 = ox + Math.cos(a) * orr, sy2 = oy + Math.sin(a) * orr;
          const ex2 = ox + Math.cos(a) * orr * 2.4, ey2 = oy + Math.sin(a) * orr * 2.4;
          sv.push(`<line class="${pid}spark" x1="${sx2.toFixed(0)}" y1="${sy2.toFixed(0)}" x2="${ex2.toFixed(0)}" y2="${ey2.toFixed(0)}" stroke="${[A, B, X0][i % 3]}" stroke-width="2" stroke-linecap="round" opacity="0" style="${glow(A, 1.5)}"/>`);
        }
        sc.push(`tl.fromTo("#${id} .${pid}spark",{opacity:0,scale:0,svgOrigin:"${ox} ${oy}"},{opacity:1,scale:1,duration:.4,stagger:.03,ease:"power3.out"},${s0(1.1)});`);
        sc.push(`tl.to("#${id} .${pid}spark",{opacity:.2,duration:.5,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(1, L - 1.3))},.5)},${s0(1.6)});`);
      }
    }
  }

  return { sv, dv, sc };
}

const CHARGED_PACKS = new Set(["kaleido", "voltage"]);

module.exports = { buildChargedOrnaments, CHARGED_PACKS };
