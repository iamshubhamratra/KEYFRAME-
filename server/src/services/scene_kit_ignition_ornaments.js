// IGNITION ornaments — animated mission-control furniture for the launch-
// countdown pack. The world: a launch pad at night, the guidance computer
// watching the vehicle. Prop family:
//
//   • HUD corner brackets  (every scene)  — thin frame-lock marks drawing in,
//     with a blinking pad-status dot.
//   • Telemetry column     (hook/text/stat/quote) — a margin readout of three
//     mono labels (ALT / VEL / FUEL) whose bars fill to seeded values.
//   • T-minus countdown    (hook) — a 60-tick ring with a depleting accent arc,
//     a rotating sweep hand, and a mono digit block stepping T-09 → T-01.
//   • Trajectory arc       (stat/text/quote) — a dotted ascent parabola drawing
//     itself while a small vessel climbs it, ember dots trailing behind.
//   • Engine start         (cta) — a radial spark burst from the pad, expanding
//     GO rings, and a three-light launch status row cycling to green.
//
// EVERYTHING is painted from the THEME's colors (accent = ember exhaust,
// accent2 = signal cyan, extras = caution amber / telemetry green) so the Art
// Director's brand skin re-tints the whole pack.
//
// Contract mirrors scene_kit_charged_ornaments.js: called from buildSkinOrnaments
// with { framePack, kind, id, pid, T, L, seed, theme, dims, s0, rgba, mix, esc,
// scene, sceneIndex, sceneCount }; returns { sv, dv, sc }. Tweens are anchored
// via s0() (seek-safe), loops are finite via the emitted reps()/sreps() helpers,
// SVG rotation uses svgOrigin, and all variation is seed-derived.

const IGNITION_PACKS = new Set(["ignition"]);

function buildIgnitionOrnaments({ kind, id, pid, T, L, seed, theme, dims, s0, rgba, scene, sceneIndex = 0, sceneCount = 5 }) {
  const W = dims.width, H = dims.height;
  const M = Math.min(W, H);
  const land = W >= H;
  const sv = [], dv = [], sc = [];
  const r2 = (v) => Math.round(v * 100) / 100;
  const A = theme.accent, B = theme.accent2 || A;
  const X0 = (theme.extras && theme.extras[0]) || B; // caution amber
  const X1 = (theme.extras && theme.extras[1]) || A; // telemetry green
  const INK = theme.ink;
  const sd = (seed + sceneIndex * 17) >>> 0;
  const mono = "font-family:'IBM Plex Mono',ui-monospace,monospace;";

  // ---- HUD corner brackets + status dot (every scene) ----------------------
  {
    const bl = Math.round(M * 0.035), m = Math.round(M * 0.028);
    const corners = [
      `M${m + bl} ${m}H${m}V${m + bl}`,                       // TL
      `M${W - m - bl} ${m}H${W - m}V${m + bl}`,               // TR
      `M${m + bl} ${H - m}H${m}V${H - m - bl}`,               // BL
      `M${W - m - bl} ${H - m}H${W - m}V${H - m - bl}`,       // BR
    ];
    corners.forEach((d) => {
      sv.push(`<path class="${pid}hud" d="${d}" fill="none" stroke="${rgba(B, 0.55)}" stroke-width="2.5" stroke-dasharray="160" stroke-dashoffset="160"/>`);
    });
    sc.push(`tl.to("#${id} .${pid}hud",{strokeDashoffset:0,duration:.55,stagger:.08,ease:"power2.out"},${s0(0.3)});`);
    // blinking pad-status dot beside the BL bracket (finite blink)
    const dx = m + bl + Math.round(M * 0.018), dy = H - m - Math.round(M * 0.008);
    sv.push(`<circle class="${pid}st" cx="${dx}" cy="${dy}" r="${Math.max(3, Math.round(M * 0.006))}" fill="${A}" opacity="0"/>`);
    sc.push(`tl.to("#${id} .${pid}st",{opacity:.9,duration:.2},${s0(0.5)});`);
    sc.push(`tl.to("#${id} .${pid}st",{opacity:.25,duration:.55,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(L)},.55)},${s0(0.8)});`);
  }

  // ---- Telemetry readout column (hook / text / stat / quote) ---------------
  if (kind !== "cta" && kind !== "asset") {
    // Left margin, tucked in the UPPER band (the kicker chip + headline block
    // own the 0.28–0.65 band — the first cut of this pack parked the column at
    // 0.30 and the kicker chip sat right on the VEL bar). Portrait tucks it low
    // under the stacked copy instead.
    const colX = Math.round(W * 0.045);
    const colY = land ? Math.round(H * (0.115 + (sd % 3) * 0.022)) : Math.round(H * 0.80);
    const rowH = Math.round(M * 0.052);
    const barW = Math.round(M * 0.16), barH = Math.max(4, Math.round(M * 0.008));
    const labels = ["ALT", "VEL", "FUEL"];
    const fills = [0.35 + ((sd >> 2) % 40) / 100, 0.5 + ((sd >> 4) % 35) / 100, 0.9 - ((sd >> 6) % 30) / 100];
    labels.forEach((lb, i) => {
      const y = colY + i * rowH;
      const col = i === 2 ? X0 : B;
      sv.push(`<text class="${pid}tlb" x="${colX}" y="${y}" style="${mono}font-size:${Math.round(M * 0.018)}px;letter-spacing:.14em;" fill="${rgba(INK, 0.5)}" opacity="0">${lb}</text>`);
      sv.push(`<rect x="${colX}" y="${y + Math.round(rowH * 0.22)}" width="${barW}" height="${barH}" rx="${barH / 2}" fill="${rgba(INK, 0.12)}"/>`);
      sv.push(`<rect class="${pid}tb${i}" x="${colX}" y="${y + Math.round(rowH * 0.22)}" width="${barW}" height="${barH}" rx="${barH / 2}" fill="${rgba(col, 0.85)}" transform="scale(${fills[i].toFixed(2)} 1)" transform-origin="${colX} 0" opacity="0"/>`);
    });
    sc.push(`tl.to("#${id} .${pid}tlb",{opacity:1,duration:.4,stagger:.12},${s0(0.55)});`);
    for (let i = 0; i < 3; i++) {
      sc.push(`tl.fromTo("#${id} .${pid}tb${i}",{opacity:1,scaleX:0,svgOrigin:"${colX} 0"},{scaleX:${fills[i].toFixed(2)},duration:.9,ease:"power2.out"},${s0(0.7 + i * 0.15)});`);
    }
  }

  // ---- T-minus countdown ring (hook) ----------------------------------------
  if (kind === "hook") {
    const cxp = land ? Math.round(W * 0.84) : Math.round(W * 0.78);
    const cyp = land ? Math.round(H * 0.26) : Math.round(H * 0.14);
    const rr = Math.round(M * 0.085);
    const circ = Math.round(2 * Math.PI * rr);
    // tick ring (60 minor ticks via dasharray) + depleting accent arc + sweep hand
    sv.push(`<circle cx="${cxp}" cy="${cyp}" r="${rr}" fill="none" stroke="${rgba(INK, 0.22)}" stroke-width="2" stroke-dasharray="1.5 ${(circ / 60 - 1.5).toFixed(2)}"/>`);
    sv.push(`<circle class="${pid}arc" cx="${cxp}" cy="${cyp}" r="${rr}" fill="none" stroke="${A}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="0" transform="rotate(-90 ${cxp} ${cyp})" opacity="0" style="filter:drop-shadow(0 0 6px ${rgba(A, 0.7)});"/>`);
    sv.push(`<line class="${pid}hand" x1="${cxp}" y1="${cyp}" x2="${cxp}" y2="${cyp - rr + 5}" stroke="${rgba(B, 0.85)}" stroke-width="2" opacity="0"/>`);
    // mono T-minus digits under the ring, stepping down over the scene
    const fs = Math.round(M * 0.026);
    sv.push(`<text class="${pid}tmn" x="${cxp}" y="${cyp + rr + fs + 8}" text-anchor="middle" style="${mono}font-size:${fs}px;letter-spacing:.1em;" fill="${rgba(B, 0.9)}" opacity="0">T-09</text>`);
    sc.push(`tl.to("#${id} .${pid}arc,#${id} .${pid}hand,#${id} .${pid}tmn",{opacity:1,duration:.4},${s0(0.5)});`);
    // the arc DEPLETES across the scene — time running out to launch
    sc.push(`tl.to("#${id} .${pid}arc",{strokeDashoffset:${circ},duration:${r2(Math.max(2, L - 1))},ease:"none"},${s0(0.6)});`);
    sc.push(`tl.to("#${id} .${pid}hand",{rotation:360,svgOrigin:"${cxp} ${cyp}",duration:${r2(Math.max(2, L - 1))},ease:"none"},${s0(0.6)});`);
    // digits count down T-09 → T-01 (timeline-anchored sets — seek replays them)
    const steps = 8, span = Math.max(1.6, L - 1.4);
    for (let i = 1; i <= steps; i++) {
      sc.push(`tl.set("#${id} .${pid}tmn",{textContent:"T-0${9 - i}"},${s0(0.6 + (span / steps) * i)});`);
    }
  }

  // ---- Trajectory ascent arc (stat / text / quote) ---------------------------
  if (kind === "stat" || kind === "text" || kind === "quote") {
    // dotted parabola climbing from lower-left toward upper-right margin
    const x0p = Math.round(W * 0.06), y0p = Math.round(H * (land ? 0.88 : 0.93));
    const x1p = Math.round(W * (land ? 0.42 : 0.6)), y1p = Math.round(H * (land ? 0.52 : 0.72));
    const cxq = Math.round(x0p + (x1p - x0p) * 0.72), cyq = Math.round(y0p - (y0p - y1p) * 0.12);
    const plen = Math.round(Math.hypot(x1p - x0p, y0p - y1p) * 1.25);
    sv.push(`<path class="${pid}tj" d="M${x0p} ${y0p} Q${cxq} ${cyq} ${x1p} ${y1p}" fill="none" stroke="${rgba(B, 0.5)}" stroke-width="2" stroke-dasharray="3 8" opacity="0"/>`);
    // the vessel: a small pointed triangle with an ember tail dot
    const vs = Math.max(7, Math.round(M * 0.013));
    sv.push(`<g class="${pid}vs" opacity="0" transform="translate(${x0p} ${y0p})"><path d="M0 ${-vs} L${Math.round(vs * 0.7)} ${vs} L${-Math.round(vs * 0.7)} ${vs} Z" fill="${INK}" transform="rotate(38)"/><circle cx="${-Math.round(vs * 0.9)}" cy="${Math.round(vs * 1.1)}" r="${Math.max(2.5, vs * 0.35)}" fill="${A}" style="filter:drop-shadow(0 0 5px ${rgba(A, 0.8)});"/></g>`);
    sc.push(`tl.to("#${id} .${pid}tj",{opacity:1,duration:.3},${s0(0.6)});`);
    sc.push(`tl.fromTo("#${id} .${pid}tj",{strokeDasharray:"3 8",strokeDashoffset:${plen}},{strokeDashoffset:0,duration:1.2,ease:"power1.inOut"},${s0(0.6)});`);
    // climb: x linear, y decelerating → reads as a gravity turn
    const dur = r2(Math.min(2.6, Math.max(1.8, L - 1.2)));
    sc.push(`tl.to("#${id} .${pid}vs",{opacity:1,duration:.25},${s0(0.75)});`);
    sc.push(`tl.to("#${id} .${pid}vs",{x:${x1p - x0p},duration:${dur},ease:"none"},${s0(0.8)});`);
    sc.push(`tl.to("#${id} .${pid}vs",{y:${y1p - y0p},duration:${dur},ease:"power2.out"},${s0(0.8)});`);
    // ember trail dots popping in behind the climb
    for (let i = 1; i <= 3; i++) {
      const f = i / 4;
      const tx = Math.round(x0p + (x1p - x0p) * f), ty = Math.round(y0p - (y0p - y1p) * (2 * f - f * f));
      sv.push(`<circle class="${pid}tr${i}" cx="${tx}" cy="${ty}" r="${Math.max(2, Math.round(M * 0.004))}" fill="${rgba(A, 0.75)}" opacity="0"/>`);
      sc.push(`tl.to("#${id} .${pid}tr${i}",{opacity:.8,duration:.25},${s0(0.8 + dur * f)});`);
      sc.push(`tl.to("#${id} .${pid}tr${i}",{opacity:.15,duration:.9},${s0(1.1 + dur * f)});`);
    }
  }

  // ---- Engine start (cta) ----------------------------------------------------
  if (kind === "cta") {
    const bx = Math.round(W * 0.5), by = Math.round(H * (land ? 0.9 : 0.94));
    // radial spark burst — 12 accent lines shooting out from the pad, one-shot
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI - Math.PI; // upper half fan
      const len = Math.round(M * (0.05 + ((sd >> (i % 5)) % 4) * 0.012));
      const x2 = Math.round(bx + Math.cos(a) * len), y2 = Math.round(by + Math.sin(a) * len);
      sv.push(`<line class="${pid}sp" x1="${bx}" y1="${by}" x2="${x2}" y2="${y2}" stroke="${i % 3 === 2 ? X0 : A}" stroke-width="${i % 2 ? 2 : 3}" stroke-linecap="round" opacity="0"/>`);
    }
    sc.push(`tl.fromTo("#${id} .${pid}sp",{opacity:1,scale:.1,svgOrigin:"${bx} ${by}"},{opacity:0,scale:1,duration:.8,stagger:.02,ease:"power2.out"},${s0(0.45)});`);
    // GO rings — two circles breathing outward from the pad (finite)
    for (let i = 0; i < 2; i++) {
      sv.push(`<circle class="${pid}go${i}" cx="${bx}" cy="${by}" r="${Math.round(M * 0.05)}" fill="none" stroke="${rgba(X1, 0.6)}" stroke-width="2" opacity="0"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}go${i}",{opacity:.7,scale:.3,svgOrigin:"${bx} ${by}"},{opacity:0,scale:2.4,duration:2,ease:"power1.out",repeat:sreps(${r2(L)},2.2),repeatDelay:.2},${s0(0.6 + i * 1.0)});`);
    }
    // launch status lights — three chips cycling from amber to GO green
    const lw = Math.round(M * 0.03), lh = Math.max(6, Math.round(M * 0.012)), lg = Math.round(M * 0.012);
    const lx = Math.round(W * 0.5 - (lw * 3 + lg * 2) / 2), ly = by - Math.round(M * 0.085);
    for (let i = 0; i < 3; i++) {
      sv.push(`<rect class="${pid}ls${i}" x="${lx + i * (lw + lg)}" y="${ly}" width="${lw}" height="${lh}" rx="${lh / 2}" fill="${rgba(X0, 0.8)}" opacity="0"/>`);
      sc.push(`tl.to("#${id} .${pid}ls${i}",{opacity:1,duration:.3},${s0(0.5 + i * 0.15)});`);
      sc.push(`tl.set("#${id} .${pid}ls${i}",{fill:"${X1}"},${s0(1.1 + i * 0.4)});`);
    }
  }

  return { sv, dv, sc };
}

module.exports = { buildIgnitionOrnaments, IGNITION_PACKS };
