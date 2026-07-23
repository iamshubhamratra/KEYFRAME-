// BESPOKE-WAVE ornaments — animated scene furniture for the five 2026-07-18
// packs (sumi-kaze · orrery-brass · claymotion · folk-stitch · abyssal-glow).
//
// These packs shipped with fully bespoke motion grammars (entrance + cut +
// canvas fx + emphasis each) but NO scene-ornament branch — they fell into
// buildSkinOrnaments' generic corner-bracket fallback, so beside packs like
// terminal-departures (boarding pass, clock, ticker) they read under-dressed.
// This module gives each its own PROP FAMILY in the same pattern as the
// papertales/departures modules: hand-authored SVG/DOM atoms, kind-gated,
// seed-varied, and filled with the SCENE'S OWN COPY where a label fits — so a
// bakery film and a SaaS film wear different props, not one demo re-colored.
//
//   sumi-kaze     hanging scroll tab (scene word, vertical), gliding cranes,
//                 self-drawing enso ring, rising sun disc, growing bamboo
//   orrery-brass  meshing gear pair, roman chapter ring, swinging pendulum,
//                 waxing moon dial, ticking escapement hand
//   claymotion    8fps frame-counter chip, inching caterpillar, wobbly clay
//                 sun, bouncing squash-ball, popping clay pellets
//   folk-stitch   crawling blanket-stitch borders, stitched corner buttons,
//                 needle pulling a live thread, cross-stitch heart bloom,
//                 tying bow (cta)
//   abyssal-glow  rising bubble columns, per-scene depth gauge, pulsing
//                 jellyfish, sonar ping rings, fish school, anglerfish lure
//
// Contract: called from scene_kit.js buildSkinOrnaments with the standard ctx;
// returns { sv, dv, sc }. Every tween is timeline-anchored via s0() (seek-safe);
// loops are finite via the emitted reps()/sreps() helpers; SVG rotation uses
// svgOrigin (the GSAP-clobbers-rotate-attr gotcha); no Math.random at runtime —
// all variation derives from the seed.

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
  "XXI", "XXII", "XXIII", "XXIV", "XXV", "XXVI", "XXVII", "XXVIII", "XXIX", "XXX"];

// Clamp on a word boundary (a scroll tab reading "12,000 KITCH" is a misprint).
const clampWords = (s, n) => {
  const t = String(s || "").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut).trim();
};

// Gear outline path: `teeth` square teeth around radius r at (cx,cy). The
// classic clockwork silhouette — outer radius r, tooth depth r*0.22.
function gearPath(cx, cy, r, teeth) {
  const rt = r * 1.22, seg = (Math.PI * 2) / teeth;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * seg;
    for (const [rr, off] of [[r, 0.08], [rt, 0.16], [rt, 0.34], [r, 0.42]]) {
      const t = a + seg * off;
      pts.push(`${(cx + Math.cos(t) * rr).toFixed(1)} ${(cy + Math.sin(t) * rr).toFixed(1)}`);
    }
  }
  return `M${pts.join(" L")} Z`;
}

// Pixel map for the folk-stitch cross-stitch heart (1 = stitch an X).
const HEART = [
  "0110110",
  "1111111",
  "1111111",
  "0111110",
  "0011100",
  "0001000",
];

function buildBespokeOrnaments({ framePack, kind, id, pid, T, L, seed, theme, dims, s0, rgba, esc, scene, sceneIndex = 0, sceneCount = 5 }) {
  const W = dims.width, H = dims.height;
  const M = Math.min(W, H); // scale base that survives 16:9, 9:16 and 1:1
  const sv = [], dv = [], sc = [];
  const s = scene || {};
  const sd = (seed + sceneIndex * 13) >>> 0;
  const r2 = (v) => Math.round(v * 100) / 100;
  const A = theme.accent, B = theme.accent2;
  const late = r2(Math.max(0.4, L - 0.6)); // last-moment anchor inside the scene
  const tag = clampWords(s.emphasis || s.purpose || "", 10);

  /* ============================== SUMI-KAZE ==============================
     An ink scroll: everything is brushwork — strokes DRAW, they don't fade. */
  if (framePack === "sumi-kaze") {
    const INK = "#201D18", VERM = "#C93A2B", INDIGO = "#39587A";
    const serif = "'Zen Old Mincho','Noto Serif JP',serif";

    // Hanging scroll tab (every scene) — a narrow vertical banner off the
    // margin with the scene's word in vertical writing, a hanko square at its
    // foot. Unrolls from the top (scaleY), like silk dropping.
    {
      const sw = Math.round(M * 0.052), sx = Math.round(W * (kind === "cta" ? 0.07 : 0.9));
      const label = clampWords(tag || (kind === "hook" ? "序" : kind === "cta" ? "結" : "巻"), 8);
      dv.push(
        `<div class="${pid}scr" style="position:absolute;left:${sx}px;top:0;width:${sw}px;padding:${Math.round(M * 0.02)}px 0 ${Math.round(M * 0.014)}px;background:${rgba("#EDE4D2", 0.92)};border:1px solid ${rgba(INK, 0.25)};border-top:none;box-shadow:0 ${Math.round(M * 0.008)}px ${Math.round(M * 0.02)}px ${rgba(INK, 0.2)};display:flex;flex-direction:column;align-items:center;gap:${Math.round(M * 0.012)}px;transform-origin:50% 0;">` +
        `<span style="writing-mode:vertical-rl;font:600 ${Math.round(M * 0.024)}px/1.1 ${serif};color:${INK};letter-spacing:.14em;">${esc(label)}</span>` +
        `<span style="width:${Math.round(sw * 0.52)}px;height:${Math.round(sw * 0.52)}px;background:${VERM};border-radius:2px;"></span></div>`
      );
      sc.push(`tl.fromTo("#${id} .${pid}scr",{scaleY:0},{scaleY:1,duration:.8,ease:"power3.out"},${s0(0.35)});`);
      sc.push(`tl.to("#${id} .${pid}scr",{rotation:1.6,transformOrigin:"50% 0%",duration:2.6,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(L)},2.6)},${s0(1.2)});`);
    }

    // Gliding cranes (every scene) — two brush-stroke birds crossing the sky
    // with a slow wingbeat (the M-stroke scaleY breathes).
    {
      const cy0 = Math.round(H * (0.14 + (sd % 3) * 0.05));
      for (let i = 0; i < 2; i++) {
        const cs = Math.round(M * (0.026 - i * 0.007)), cyi = cy0 + i * Math.round(H * 0.07);
        sv.push(`<path class="${pid}cr${i}" d="M${-cs * 2} ${cyi} q ${cs} ${-cs} ${cs * 2} 0 q ${cs} ${-cs} ${cs * 2} 0" fill="none" stroke="${INK}" stroke-width="${Math.max(2, M * 0.004)}" stroke-linecap="round" opacity="0"/>`);
        sc.push(`tl.to("#${id} .${pid}cr${i}",{opacity:.6,duration:.5},${s0(0.6 + i * 0.3)});`);
        sc.push(`tl.to("#${id} .${pid}cr${i}",{x:${W * (1.1 + i * 0.1)},y:${-H * 0.05},duration:${r2(Math.max(4, L * 1.4))},ease:"none"},${s0(0.6 + i * 0.3)});`);
        sc.push(`tl.to("#${id} .${pid}cr${i}",{scaleY:.65,svgOrigin:"0 ${cyi}",duration:.5,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(L)},.5)},${s0(0.6)});`);
      }
    }

    if (kind === "hook" || kind === "cta") {
      // Enso — the one-breath zen circle, drawn as a single brush stroke that
      // deliberately doesn't close. Behind the headline zone, huge and faint.
      const ex = Math.round(W * 0.5), ey = Math.round(H * 0.48), er = Math.round(M * 0.34);
      const circ = Math.round(2 * Math.PI * er);
      sv.push(`<circle class="${pid}en" cx="${ex}" cy="${ey}" r="${er}" fill="none" stroke="${rgba(INK, 0.14)}" stroke-width="${Math.round(M * 0.022)}" stroke-linecap="round" stroke-dasharray="${Math.round(circ * 0.93)} ${circ}" stroke-dashoffset="${Math.round(circ * 0.93)}" transform="rotate(-80 ${ex} ${ey})"/>`);
      sc.push(`tl.to("#${id} .${pid}en",{strokeDashoffset:0,duration:1.3,ease:"power2.inOut"},${s0(0.25)});`);
      // Rising sun — a vermillion disc climbing from the horizon haze.
      const sx2 = Math.round(W * 0.16), sy2 = Math.round(H * 0.3), sr = Math.round(M * 0.045);
      sv.push(`<circle class="${pid}sun" cx="${sx2}" cy="${sy2}" r="${sr}" fill="${VERM}" opacity="0"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}sun",{opacity:0,y:${Math.round(H * 0.12)}},{opacity:.85,y:0,duration:1.6,ease:"power2.out"},${s0(0.5)});`);
    } else {
      // Bamboo — a stalk growing up the margin, segment by segment, each node
      // ringed; two leaves flick out at the top when it finishes.
      const bx = Math.round(W * 0.055), by = Math.round(H * 0.9), segH = Math.round(H * 0.13), n = 4;
      for (let i = 0; i < n; i++) {
        const y1 = by - i * segH, y2 = y1 - segH + Math.round(M * 0.008);
        sv.push(`<line class="${pid}bb" x1="${bx}" y1="${y1}" x2="${bx}" y2="${y2}" stroke="${INDIGO}" stroke-width="${Math.round(M * 0.011)}" stroke-linecap="round" opacity=".55" stroke-dasharray="${segH}" stroke-dashoffset="${segH}"/>`);
      }
      const ty = by - n * segH;
      sv.push(`<path class="${pid}bl" d="M${bx} ${ty} q ${M * 0.03} ${-M * 0.02} ${M * 0.062} ${-M * 0.012}" fill="none" stroke="${INDIGO}" stroke-width="${Math.round(M * 0.008)}" stroke-linecap="round" opacity="0"/>`);
      sv.push(`<path class="${pid}bl" d="M${bx} ${ty + 6} q ${-M * 0.024} ${-M * 0.022} ${-M * 0.05} ${-M * 0.016}" fill="none" stroke="${INDIGO}" stroke-width="${Math.round(M * 0.008)}" stroke-linecap="round" opacity="0"/>`);
      sc.push(`tl.to("#${id} .${pid}bb",{strokeDashoffset:0,duration:.45,stagger:.3,ease:"power2.out"},${s0(0.5)});`);
      sc.push(`tl.to("#${id} .${pid}bl",{opacity:.6,duration:.4,stagger:.15},${s0(0.5 + 0.3 * n)});`);
    }

  /* ============================= ORRERY-BRASS =============================
     A clockwork sky: everything TICKS, meshes or swings — nothing floats. */
  } else if (framePack === "orrery-brass") {
    const BRASS = "#C9973F", VERD = "#4E9C82", PARCH = "#EFE3C8";
    const serif = "'Cormorant Garamond',serif";

    // Meshing gear pair (every scene) — big + small, counter-rotating at the
    // correct tooth ratio, engraved into a corner. The heartbeat of the pack.
    {
      const gx = Math.round(W * (kind === "cta" ? 0.09 : 0.885)), gy = Math.round(H * 0.82);
      const r1 = Math.round(M * 0.062), r22 = Math.round(M * 0.038);
      const gx2 = gx - Math.round(r1 * 1.55), gy2 = gy - Math.round(r22 * 1.35);
      sv.push(`<path class="${pid}g1" d="${gearPath(gx, gy, r1, 10)}" fill="none" stroke="${BRASS}" stroke-width="2" opacity=".55"/>`);
      sv.push(`<circle cx="${gx}" cy="${gy}" r="${Math.round(r1 * 0.3)}" fill="none" stroke="${BRASS}" stroke-width="2" opacity=".5" class="${pid}g1"/>`);
      sv.push(`<path class="${pid}g2" d="${gearPath(gx2, gy2, r22, 7)}" fill="none" stroke="${VERD}" stroke-width="2" opacity=".55"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}g1,#${id} .${pid}g2",{opacity:0},{opacity:.55,duration:.5},${s0(0.4)});`);
      sc.push(`tl.to("#${id} .${pid}g1",{rotation:360,svgOrigin:"${gx} ${gy}",duration:11,ease:"none",repeat:reps(11)},0);`);
      sc.push(`tl.to("#${id} .${pid}g2",{rotation:-514,svgOrigin:"${gx2} ${gy2}",duration:11,ease:"none",repeat:reps(11)},0);`); // 10/7 tooth ratio
    }

    // Roman chapter ring (every scene) — an engraved arc with the film's own
    // scene numeral; the arc draws, the numeral settles like a stamped plate.
    {
      const cx2 = Math.round(W * 0.5), cy2 = Math.round(H * 0.085), rr = Math.round(M * 0.048);
      const arc = Math.round(2 * Math.PI * rr);
      sv.push(`<circle class="${pid}ch" cx="${cx2}" cy="${cy2}" r="${rr}" fill="none" stroke="${BRASS}" stroke-width="1.5" opacity=".6" stroke-dasharray="${arc}" stroke-dashoffset="${arc}"/>`);
      dv.push(`<div class="${pid}chn" style="position:absolute;left:${cx2 - rr}px;top:${cy2 - rr}px;width:${rr * 2}px;height:${rr * 2}px;display:grid;place-items:center;font:600 ${Math.round(M * 0.03)}px/1 ${serif};color:${BRASS};opacity:0;">${ROMAN[Math.min(sceneIndex, ROMAN.length - 1)]}</div>`);
      sc.push(`tl.to("#${id} .${pid}ch",{strokeDashoffset:0,duration:.9,ease:"power2.inOut"},${s0(0.3)});`);
      sc.push(`tl.fromTo("#${id} .${pid}chn",{opacity:0,scale:1.6},{opacity:1,scale:1,duration:.5,ease:"power4.in"},${s0(0.7)});`);
    }

    if (kind === "hook" || kind === "cta") {
      // Pendulum — a long brass rod + bob swinging on a real period, hung from
      // the top edge. svgOrigin at the pivot; sine yoyo forever (finite reps).
      const px = Math.round(W * 0.13), plen = Math.round(H * 0.34);
      sv.push(`<g class="${pid}pd" opacity="0"><line x1="${px}" y1="0" x2="${px}" y2="${plen}" stroke="${BRASS}" stroke-width="2.5"/><circle cx="${px}" cy="${plen}" r="${Math.round(M * 0.025)}" fill="${BRASS}" opacity=".85"/><circle cx="${px}" cy="${plen}" r="${Math.round(M * 0.012)}" fill="${PARCH}"/></g>`);
      sc.push(`tl.to("#${id} .${pid}pd",{opacity:.8,duration:.5},${s0(0.4)});`);
      sc.push(`tl.fromTo("#${id} .${pid}pd",{rotation:-16,svgOrigin:"${px} 0"},{rotation:16,svgOrigin:"${px} 0",duration:1.4,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(L)},1.4)},${s0(0.4)});`);
      // Moon-phase dial — a disc waxing via an offset shadow disc sliding off.
      const mx = Math.round(W * 0.86), my = Math.round(H * 0.16), mr = Math.round(M * 0.032);
      sv.push(`<circle cx="${mx}" cy="${my}" r="${mr}" fill="${PARCH}" opacity=".8" class="${pid}mn"/>`);
      sv.push(`<circle class="${pid}ms" cx="${mx - mr * 0.3}" cy="${my}" r="${mr}" fill="#191410" opacity=".92"/>`);
      sv.push(`<circle cx="${mx}" cy="${my}" r="${mr + 4}" fill="none" stroke="${BRASS}" stroke-width="1.5" opacity=".6" class="${pid}mn"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}mn",{opacity:0},{opacity:.8,duration:.5},${s0(0.6)});`);
      sc.push(`tl.to("#${id} .${pid}ms",{x:${-mr * 1.6},duration:${r2(Math.max(2, L - 1.4))},ease:"none"},${s0(0.8)});`);
    } else {
      // Escapement hand — a quadrant arc with tick marks and a hand that
      // advances in discrete TICKS (stepped ease), never sweeping smoothly.
      const qx = Math.round(W * 0.115), qy = Math.round(H * 0.2), qr = Math.round(M * 0.075);
      for (let i = 0; i <= 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
        const x1 = qx + Math.cos(a) * qr, y1 = qy + Math.sin(a) * qr;
        sv.push(`<line class="${pid}qt" x1="${(qx + Math.cos(a) * qr * 0.88).toFixed(1)}" y1="${(qy + Math.sin(a) * qr * 0.88).toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${BRASS}" stroke-width="1.5" opacity=".55"/>`);
      }
      sv.push(`<line class="${pid}qh" x1="${qx}" y1="${qy}" x2="${qx}" y2="${qy - qr * 0.82}" stroke="${VERD}" stroke-width="2.5" stroke-linecap="round" opacity="0"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}qt",{opacity:0},{opacity:.55,duration:.3,stagger:.06},${s0(0.4)});`);
      sc.push(`tl.to("#${id} .${pid}qh",{opacity:.85,duration:.3},${s0(0.7)});`);
      sc.push(`tl.to("#${id} .${pid}qh",{rotation:90,svgOrigin:"${qx} ${qy}",duration:${r2(Math.max(2, L - 1.2))},ease:function(p){return Math.floor(p*8)/8;}},${s0(0.8)});`);
    }

  /* ============================== CLAYMOTION ==============================
     A stop-motion tabletop: everything moves at 8fps with squash & stretch. */
  } else if (framePack === "claymotion") {
    const TERRA = "#DD6B4A", LEAF = "#7FA05F", SKYB = "#6FAEC6", INKC = "#37281F", PURP = "#96639B";
    const round = "'Baloo 2','Quicksand',sans-serif";
    const q8 = `function(p){return Math.ceil(p*8)/8;}`; // the 8fps stepper

    // Frame-counter chip (every scene) — "FR 0083 · 8 FPS" counting the film's
    // real frames, quantized to eighths. Timeline-anchored sets = seek-safe.
    {
      const chH = Math.round(M * 0.042), fs = Math.round(chH * 0.42);
      dv.push(`<div class="${pid}fc" style="position:absolute;left:${Math.round(W * 0.045)}px;top:${Math.round(H * 0.065)}px;height:${chH}px;display:inline-flex;align-items:center;gap:8px;padding:0 ${Math.round(chH * 0.45)}px;background:${rgba("#FFF8EF", 0.9)};border:2px solid ${INKC};border-radius:${chH}px;box-shadow:2px 3px 0 ${rgba(INKC, 0.3)};font:700 ${fs}px/1 ${round};color:${INKC};opacity:0;"><span style="width:${Math.round(chH * 0.3)}px;height:${Math.round(chH * 0.3)}px;border-radius:50%;background:${TERRA};"></span><span id="${pid}fcv">FR ${String(Math.round(T * 8)).padStart(4, "0")} · 8 FPS</span></div>`);
      sc.push(`tl.fromTo("#${id} .${pid}fc",{opacity:0,scale:.6},{opacity:1,scale:1,duration:.45,ease:"back.out(2)"},${s0(0.35)});`);
      const steps = Math.min(24, Math.floor(L * 2)); // a set every half-second
      for (let i = 0; i <= steps; i++) {
        const tt = r2(T + 0.35 + (i * (L - 0.5)) / steps);
        sc.push(`tl.set("#${pid}fcv",{textContent:"FR ${String(Math.round((T + 0.35 + (i * (L - 0.5)) / steps) * 8)).padStart(4, "0")} · 8 FPS"},${tt});`);
      }
    }

    // Inching caterpillar (every scene) — five clay beads inchworming along
    // the bottom edge: contract (squash) then extend (stretch), stepping right.
    {
      const cy3 = Math.round(H * 0.93), br = Math.round(M * 0.017), n = 5;
      const cols = [LEAF, LEAF, LEAF, LEAF, TERRA];
      for (let i = 0; i < n; i++) {
        sv.push(`<circle class="${pid}cw${i}" cx="${Math.round(W * 0.1 + i * br * 1.7)}" cy="${cy3}" r="${br * (i === n - 1 ? 1.25 : 1)}" fill="${cols[i]}" opacity="0"/>`);
      }
      sv.push(`<circle class="${pid}cwe" cx="${Math.round(W * 0.1 + (n - 1) * br * 1.7 + br * 0.5)}" cy="${cy3 - br * 0.4}" r="${Math.max(2, br * 0.22)}" fill="${INKC}" opacity="0"/>`);
      sc.push(`tl.to("#${id} .${pid}cw0,#${id} .${pid}cw1,#${id} .${pid}cw2,#${id} .${pid}cw3,#${id} .${pid}cw4,#${id} .${pid}cwe",{opacity:.9,duration:.4},${s0(0.5)});`);
      const hop = Math.round(W * 0.055), hops = Math.max(2, Math.floor((L - 1) / 1.1));
      for (let h = 0; h < hops; h++) {
        const t0 = r2(T + 0.9 + h * 1.1);
        for (let i = 0; i < n; i++) {
          sc.push(`tl.to("#${id} .${pid}cw${i}",{x:"+=${hop}",scaleX:1.28,scaleY:.8,duration:.28,ease:${q8}},${r2(t0 + i * 0.07)});`);
          sc.push(`tl.to("#${id} .${pid}cw${i}",{scaleX:1,scaleY:1,duration:.2,ease:${q8}},${r2(t0 + 0.3 + i * 0.07)});`);
        }
        sc.push(`tl.to("#${id} .${pid}cwe",{x:"+=${hop}",duration:.28,ease:${q8}},${r2(t0 + (n - 1) * 0.07)});`);
      }
    }

    if (kind === "hook" || kind === "cta") {
      // Clay sun — a fat disc with sausage rays, wobbling like it's re-posed
      // between frames; squashes IN like it was dropped onto the set.
      const sx3 = Math.round(W * 0.86), sy3 = Math.round(H * 0.18), sr3 = Math.round(M * 0.05);
      const rays = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        rays.push(`<line x1="${(sx3 + Math.cos(a) * sr3 * 1.35).toFixed(1)}" y1="${(sy3 + Math.sin(a) * sr3 * 1.35).toFixed(1)}" x2="${(sx3 + Math.cos(a) * sr3 * 1.8).toFixed(1)}" y2="${(sy3 + Math.sin(a) * sr3 * 1.8).toFixed(1)}" stroke="${TERRA}" stroke-width="${Math.round(M * 0.014)}" stroke-linecap="round"/>`);
      }
      sv.push(`<g class="${pid}cs" opacity="0">${rays.join("")}<circle cx="${sx3}" cy="${sy3}" r="${sr3}" fill="${TERRA}"/><circle cx="${sx3 - sr3 * 0.3}" cy="${sy3 - sr3 * 0.32}" r="${Math.round(sr3 * 0.16)}" fill="${rgba("#FFF8EF", 0.75)}"/></g>`);
      sc.push(`tl.fromTo("#${id} .${pid}cs",{opacity:0,scale:.3,svgOrigin:"${sx3} ${sy3}"},{opacity:1,scale:1,duration:.55,ease:"back.out(2.4)"},${s0(0.5)});`);
      sc.push(`tl.to("#${id} .${pid}cs",{rotation:9,svgOrigin:"${sx3} ${sy3}",duration:.9,ease:${q8},yoyo:true,repeat:sreps(${r2(L)},.9)},${s0(1.1)});`);
    }
    if (kind === "stat" || kind === "text") {
      // Bouncing clay ball — drops in, squashes flat on the floor line, pops
      // back with visible 8fps steps; leaves a dent shadow that breathes.
      const bx3 = Math.round(W * 0.9), fy3 = Math.round(H * 0.86), br3 = Math.round(M * 0.028);
      sv.push(`<ellipse class="${pid}bsh" cx="${bx3}" cy="${fy3 + br3 * 0.9}" rx="${br3 * 1.1}" ry="${br3 * 0.28}" fill="${rgba(INKC, 0.18)}" opacity="0"/>`);
      sv.push(`<circle class="${pid}bl2" cx="${bx3}" cy="${fy3 - br3}" r="${br3}" fill="${SKYB}" opacity="0"/>`);
      sc.push(`tl.to("#${id} .${pid}bsh",{opacity:1,duration:.2},${s0(0.9)});`);
      sc.push(`tl.fromTo("#${id} .${pid}bl2",{opacity:1,y:${-Math.round(H * 0.4)}},{y:0,duration:.5,ease:${q8}},${s0(0.7)});`);
      sc.push(`tl.to("#${id} .${pid}bl2",{scaleY:.6,scaleX:1.35,svgOrigin:"${bx3} ${fy3}",duration:.12,ease:${q8}},${s0(1.2)});`);
      sc.push(`tl.to("#${id} .${pid}bl2",{scaleY:1,scaleX:1,y:${-Math.round(H * 0.11)},duration:.4,ease:${q8}},${s0(1.32)});`);
      sc.push(`tl.to("#${id} .${pid}bl2",{y:0,duration:.35,ease:${q8}},${s0(1.72)});`);
      sc.push(`tl.to("#${id} .${pid}bl2",{scaleY:.82,scaleX:1.14,svgOrigin:"${bx3} ${fy3}",duration:.1,ease:${q8},yoyo:true,repeat:1},${s0(2.07)});`);
    }
    if (kind === "cta") {
      // Clay pellet confetti — irregular blobs popping in around the CTA with
      // hard-stepped rotations, like pressed-on decorations.
      const cols2 = [TERRA, LEAF, SKYB, PURP];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + (sd % 7) * 0.3;
        const px2 = Math.round(W * 0.5 + Math.cos(a) * W * 0.3), py2 = Math.round(H * 0.5 + Math.sin(a) * H * 0.33);
        const pr = Math.round(M * (0.012 + (i % 3) * 0.005));
        sv.push(`<circle class="${pid}pp" cx="${px2}" cy="${py2}" r="${pr}" fill="${cols2[i % 4]}" opacity="0"/>`);
      }
      sc.push(`tl.fromTo("#${id} .${pid}pp",{opacity:0,scale:0},{opacity:.9,scale:1,duration:.35,stagger:.09,ease:"back.out(3)"},${s0(0.8)});`);
    }

  /* ============================== FOLK-STITCH =============================
     An embroidery sampler: thread CRAWLS, buttons POP, nothing glows. */
  } else if (framePack === "folk-stitch") {
    const GOLD = "#F0A83C", BRICK = "#E15546", TEALT = "#5FB0A0", CREAM = "#F2E9D8";

    // Blanket-stitch borders (every scene) — dashed thread crawling along the
    // top and bottom edges; the dash offset animates so the stitching MOVES.
    {
      const dashLen = Math.round(M * 0.024);
      for (const [cls, y, col] of [["bt", Math.round(H * 0.035), GOLD], ["bb", Math.round(H * 0.965), TEALT]]) {
        sv.push(`<line class="${pid}${cls}" x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${col}" stroke-width="${Math.round(M * 0.007)}" stroke-dasharray="${dashLen} ${Math.round(dashLen * 0.8)}" opacity="0"/>`);
        sc.push(`tl.to("#${id} .${pid}${cls}",{opacity:.7,duration:.5},${s0(0.3)});`);
        sc.push(`tl.to("#${id} .${pid}${cls}",{strokeDashoffset:${-dashLen * 8},duration:${r2(L)},ease:"none"},${s0(0.3)});`);
      }
    }

    // Stitched corner buttons (every scene) — a button with 4 holes and a
    // thread X, screwing in with a quarter turn.
    {
      const br4 = Math.round(M * 0.023);
      const spots = [[W * 0.06, H * 0.11], [W * 0.94, H * 0.89]];
      spots.forEach(([bx4, by4], i) => {
        const hx = br4 * 0.32;
        sv.push(
          `<g class="${pid}bt${i}" opacity="0"><circle cx="${bx4}" cy="${by4}" r="${br4}" fill="${i ? TEALT : BRICK}" stroke="${CREAM}" stroke-width="2"/>` +
          `<path d="M${bx4 - hx} ${by4 - hx} L${bx4 + hx} ${by4 + hx} M${bx4 + hx} ${by4 - hx} L${bx4 - hx} ${by4 + hx}" stroke="${CREAM}" stroke-width="2" stroke-linecap="round"/></g>`
        );
        sc.push(`tl.fromTo("#${id} .${pid}bt${i}",{opacity:0,scale:.4,rotation:-90,svgOrigin:"${Math.round(bx4)} ${Math.round(by4)}"},{opacity:1,scale:1,rotation:0,duration:.55,ease:"back.out(2)"},${s0(0.45 + i * 0.2)});`);
      });
    }

    if (kind === "hook" || kind === "quote") {
      // The needle pulling a live thread — a running-stitch sine path draws
      // across under the headline while the needle rides its tip.
      const ny = Math.round(H * 0.72), amp = Math.round(H * 0.02), nx0 = Math.round(W * 0.12), nx1 = Math.round(W * 0.88);
      const segs = 6, step = (nx1 - nx0) / segs;
      let d = `M${nx0} ${ny}`;
      for (let i = 1; i <= segs; i++) d += ` Q ${nx0 + (i - 0.5) * step} ${ny + (i % 2 ? -amp : amp) * 2} ${nx0 + i * step} ${ny}`;
      const plen = Math.round((nx1 - nx0) * 1.18);
      sv.push(`<path class="${pid}th" d="${d}" fill="none" stroke="${BRICK}" stroke-width="${Math.round(M * 0.006)}" stroke-dasharray="${Math.round(M * 0.016)} ${Math.round(M * 0.011)}" opacity=".85" style="stroke-dashoffset:${plen}px;"/>`);
      sv.push(`<g class="${pid}nd" opacity="0"><line x1="0" y1="0" x2="${Math.round(M * 0.052)}" y2="${-Math.round(M * 0.02)}" stroke="${CREAM}" stroke-width="3" stroke-linecap="round"/><circle cx="${Math.round(M * 0.049)}" cy="${-Math.round(M * 0.019)}" r="3" fill="none" stroke="${CREAM}" stroke-width="1.5"/></g>`);
      sc.push(`tl.set("#${id} .${pid}th",{strokeDashoffset:${plen}},0);`);
      sc.push(`tl.to("#${id} .${pid}th",{strokeDashoffset:0,duration:1.7,ease:"power1.inOut"},${s0(0.6)});`);
      sc.push(`tl.to("#${id} .${pid}nd",{opacity:1,duration:.2},${s0(0.55)});`);
      sc.push(`tl.fromTo("#${id} .${pid}nd",{x:${nx0},y:${ny}},{x:${nx1},y:${ny},duration:1.7,ease:"power1.inOut"},${s0(0.6)});`);
      sc.push(`tl.to("#${id} .${pid}nd",{opacity:0,duration:.25},${s0(2.4)});`);
    }
    if (kind === "stat" || kind === "text") {
      // Cross-stitch heart — the pixel map blooms X by X in reading order,
      // like someone stitching it live.
      const cellB = Math.round(M * 0.016), hx0 = Math.round(W * 0.855), hy0 = Math.round(H * 0.68);
      let ci = 0;
      HEART.forEach((row, ry) => {
        [...row].forEach((c, cx4) => {
          if (c === "1") {
            const x0 = hx0 + cx4 * cellB, y0 = hy0 + ry * cellB, sx = cellB * 0.36;
            const mx2 = x0 + cellB / 2, my2 = y0 + cellB / 2;
            sv.push(`<path class="${pid}hx" d="M${mx2 - sx} ${my2 - sx} L${mx2 + sx} ${my2 + sx} M${mx2 + sx} ${my2 - sx} L${mx2 - sx} ${my2 + sx}" stroke="${ci % 5 === 4 ? GOLD : BRICK}" stroke-width="2" stroke-linecap="round" opacity="0"/>`);
            ci++;
          }
        });
      });
      sc.push(`tl.to("#${id} .${pid}hx",{opacity:.95,duration:.06,stagger:.045,ease:"none"},${s0(0.6)});`);
    }
    if (kind === "cta") {
      // A bow tying itself — two thread loops draw in sequence, then the knot
      // dot pops. Centered under the CTA block.
      const bx5 = Math.round(W * 0.5), by5 = Math.round(H * 0.8), lw = Math.round(M * 0.05);
      const loopL = `M${bx5} ${by5} C ${bx5 - lw * 1.6} ${by5 - lw * 1.2}, ${bx5 - lw * 1.6} ${by5 + lw * 0.6}, ${bx5} ${by5}`;
      const loopR = `M${bx5} ${by5} C ${bx5 + lw * 1.6} ${by5 - lw * 1.2}, ${bx5 + lw * 1.6} ${by5 + lw * 0.6}, ${bx5} ${by5}`;
      for (const [cls, dd] of [["lw1", loopL], ["lw2", loopR]]) {
        sv.push(`<path class="${pid}${cls}" d="${dd}" fill="none" stroke="${GOLD}" stroke-width="${Math.round(M * 0.008)}" stroke-linecap="round" stroke-dasharray="300" stroke-dashoffset="300" opacity=".9"/>`);
      }
      sv.push(`<circle class="${pid}kn" cx="${bx5}" cy="${by5}" r="${Math.round(M * 0.011)}" fill="${BRICK}" opacity="0"/>`);
      sc.push(`tl.to("#${id} .${pid}lw1",{strokeDashoffset:0,duration:.7,ease:"power2.inOut"},${s0(0.8)});`);
      sc.push(`tl.to("#${id} .${pid}lw2",{strokeDashoffset:0,duration:.7,ease:"power2.inOut"},${s0(1.3)});`);
      sc.push(`tl.fromTo("#${id} .${pid}kn",{opacity:0,scale:0},{opacity:1,scale:1,duration:.35,ease:"back.out(3)"},${s0(1.95)});`);
    }

  /* ============================== ABYSSAL-GLOW ============================
     4000m down: light is ALIVE — it pulses, pings and swims. */
  } else if (framePack === "abyssal-glow") {
    const CYAN = "#3FE8CE", MAG = "#E06BC4", FOAM = "#E6FAF4";
    const mono = "'IBM Plex Mono',monospace";

    // Rising bubble columns (every scene) — two seeded columns of bubbles
    // wobbling upward and fading out near the surface.
    {
      for (let c = 0; c < 2; c++) {
        const bx6 = Math.round(W * (c ? 0.07 : 0.94)) + (sd % 5) * 3;
        for (let i = 0; i < 4; i++) {
          const br6 = Math.max(2, Math.round(M * (0.004 + ((i + c) % 3) * 0.003)));
          sv.push(`<circle class="${pid}bu${c}" cx="${bx6 + ((i * 7 + sd) % 11) - 5}" cy="${Math.round(H * (0.95 - i * 0.04))}" r="${br6}" fill="none" stroke="${rgba(CYAN, 0.55)}" stroke-width="1.5" opacity="0"/>`);
        }
        sc.push(`tl.to("#${id} .${pid}bu${c}",{opacity:.7,duration:.4,stagger:.1},${s0(0.4 + c * 0.3)});`);
        sc.push(`tl.to("#${id} .${pid}bu${c}",{y:${-Math.round(H * 0.75)},x:"+=${c ? -14 : 12}",duration:${r2(Math.max(3, L - 0.8))},ease:"sine.in",stagger:.28},${s0(0.5 + c * 0.3)});`);
        sc.push(`tl.to("#${id} .${pid}bu${c}",{opacity:0,duration:.6,stagger:.28},${r2(T + Math.max(2.4, L - 1.2))});`);
      }
    }

    // Depth gauge (every scene) — a mono chip diving deeper scene by scene:
    // the film DESCENDS as it plays. Deterministic: depth = f(sceneIndex).
    {
      const depth = 3800 + sceneIndex * 240 + (sd % 40);
      const chH2 = Math.round(M * 0.038);
      dv.push(`<div class="${pid}dg" style="position:absolute;right:${Math.round(W * 0.045)}px;top:${Math.round(H * 0.065)}px;height:${chH2}px;display:inline-flex;align-items:center;gap:8px;padding:0 ${Math.round(chH2 * 0.5)}px;background:${rgba("#06202A", 0.8)};border:1px solid ${rgba(CYAN, 0.45)};border-radius:4px;font:600 ${Math.round(chH2 * 0.42)}px/1 ${mono};letter-spacing:.14em;color:${rgba(FOAM, 0.92)};opacity:0;"><span style="width:7px;height:7px;border-radius:50%;background:${CYAN};box-shadow:0 0 8px ${rgba(CYAN, 0.9)};"></span>DEPTH −${depth.toLocaleString("en-US")} M</div>`);
      sc.push(`tl.fromTo("#${id} .${pid}dg",{opacity:0,y:-8},{opacity:1,y:0,duration:.45},${s0(0.35)});`);
    }

    if (kind === "hook" || kind === "quote") {
      // Jellyfish — a luminous dome + four trailing tentacles, PULSING (the
      // dome squashes as it pushes water) while rising through the scene.
      const jx = Math.round(W * 0.85), jy = Math.round(H * 0.62), jr = Math.round(M * 0.045);
      const tent = [];
      for (let i = 0; i < 4; i++) {
        const tx = jx - jr * 0.6 + i * jr * 0.4;
        tent.push(`<path class="${pid}jt" d="M${tx} ${jy} q ${(i % 2 ? 8 : -8)} ${jr * 1.1} 0 ${jr * 2.1}" fill="none" stroke="${rgba(MAG, 0.6)}" stroke-width="2" stroke-linecap="round"/>`);
      }
      sv.push(`<g class="${pid}jf" opacity="0">${tent.join("")}<path class="${pid}jd" d="M${jx - jr} ${jy} a ${jr} ${jr * 0.85} 0 0 1 ${jr * 2} 0 q ${-jr * 0.24} ${jr * 0.3} ${-jr * 0.5} 0 q ${-jr * 0.26} ${jr * 0.3} ${-jr * 0.5} 0 q ${-jr * 0.26} ${jr * 0.3} ${-jr * 0.5} 0 q ${-jr * 0.26} ${jr * 0.3} ${-jr * 0.5} 0 Z" fill="${rgba(CYAN, 0.3)}" stroke="${rgba(CYAN, 0.85)}" stroke-width="2"/></g>`);
      sc.push(`tl.to("#${id} .${pid}jf",{opacity:1,duration:.6},${s0(0.5)});`);
      sc.push(`tl.to("#${id} .${pid}jd",{scaleY:.82,svgOrigin:"${jx} ${jy}",duration:.7,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(L)},.7)},${s0(0.6)});`);
      sc.push(`tl.to("#${id} .${pid}jf",{y:${-Math.round(H * 0.16)},duration:${r2(Math.max(2.5, L - 0.7))},ease:"sine.inOut"},${s0(0.6)});`);
    }
    if (kind === "stat" || kind === "text") {
      // Sonar ping — three rings expanding from a source point with a fading
      // echo, on a repeating ping cycle; plus a school of fish crossing.
      const px3 = Math.round(W * 0.1), py3 = Math.round(H * 0.24);
      for (let i = 0; i < 3; i++) {
        sv.push(`<circle class="${pid}sn${i}" cx="${px3}" cy="${py3}" r="${Math.round(M * 0.012)}" fill="none" stroke="${rgba(CYAN, 0.75)}" stroke-width="2" opacity="0"/>`);
        sc.push(`tl.fromTo("#${id} .${pid}sn${i}",{opacity:.8,scale:1,svgOrigin:"${px3} ${py3}"},{opacity:0,scale:${7 + i * 2},duration:1.8,ease:"power1.out",repeat:sreps(${r2(L)},2.2),repeatDelay:.4},${s0(0.5 + i * 0.55)});`);
      }
      sv.push(`<circle cx="${px3}" cy="${py3}" r="4" fill="${CYAN}" class="${pid}sndot" opacity="0"/>`);
      sc.push(`tl.to("#${id} .${pid}sndot",{opacity:.95,duration:.3},${s0(0.4)});`);
      const fy4 = Math.round(H * (0.78 + (sd % 3) * 0.04));
      for (let i = 0; i < 5; i++) {
        const fs2 = Math.round(M * 0.012);
        sv.push(`<path class="${pid}fs" d="M0 0 q ${fs2} ${-fs2 * 0.5} ${fs2 * 2} 0 q ${-fs2} ${fs2 * 0.5} ${-fs2 * 2} 0 l ${-fs2 * 0.7} ${-fs2 * 0.5} v ${fs2} Z" fill="${rgba(MAG, 0.55)}" transform="translate(${-fs2 * 3 - i * fs2 * 2.6} ${fy4 + (i % 2) * fs2 * 1.4})" opacity="0"/>`);
      }
      sc.push(`tl.to("#${id} .${pid}fs",{opacity:.8,duration:.3,stagger:.08},${s0(0.8)});`);
      sc.push(`tl.to("#${id} .${pid}fs",{x:${Math.round(W * 1.25)},duration:${r2(Math.max(3.4, L))},ease:"power1.inOut",stagger:.12},${s0(0.8)});`);
    }
    if (kind === "cta") {
      // Anglerfish — a dark silhouette gliding in from the edge, its lure bulb
      // blinking; the deep's own spotlight pointing at the CTA.
      const ax = Math.round(W * 0.14), ay = Math.round(H * 0.76), as2 = Math.round(M * 0.05);
      sv.push(
        `<g class="${pid}af" opacity="0"><path d="M${ax} ${ay} q ${as2 * 0.9} ${-as2 * 0.75} ${as2 * 2} ${-as2 * 0.15} q ${as2 * 0.5} ${as2 * 0.28} 0 ${as2 * 0.5} q ${-as2 * 1.1} ${as2 * 0.5} ${-as2 * 2} ${-as2 * 0.35} Z" fill="${rgba("#0D3B46", 0.9)}" stroke="${rgba(CYAN, 0.35)}" stroke-width="1.5"/>` +
        `<path d="M${ax + as2 * 1.15} ${ay - as2 * 0.62} q ${as2 * 0.32} ${-as2 * 0.5} ${as2 * 0.75} ${-as2 * 0.42}" fill="none" stroke="${rgba(FOAM, 0.6)}" stroke-width="1.5"/>` +
        `<circle class="${pid}lu" cx="${ax + as2 * 1.9}" cy="${ay - as2 * 1.04}" r="${Math.max(3, as2 * 0.12)}" fill="${MAG}"/>` +
        `<circle cx="${ax + as2 * 1.52}" cy="${ay - as2 * 0.28}" r="${Math.max(2, as2 * 0.07)}" fill="${FOAM}" opacity=".9"/></g>`
      );
      sc.push(`tl.fromTo("#${id} .${pid}af",{opacity:0,x:${-Math.round(W * 0.12)}},{opacity:1,x:0,duration:1.1,ease:"power2.out"},${s0(0.6)});`);
      sc.push(`tl.to("#${id} .${pid}af",{x:${Math.round(W * 0.06)},y:${-Math.round(H * 0.03)},duration:${r2(Math.max(2, L - 1.8))},ease:"sine.inOut"},${s0(1.7)});`);
      sc.push(`tl.fromTo("#${id} .${pid}lu",{opacity:.35},{opacity:1,duration:.5,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(1, L - 0.8))},.5)},${s0(0.8)});`);
    }
  }

  return { sv, dv, sc };
}

const BESPOKE_PACKS = new Set(["sumi-kaze", "orrery-brass", "claymotion", "folk-stitch", "abyssal-glow"]);

module.exports = { buildBespokeOrnaments, BESPOKE_PACKS };
