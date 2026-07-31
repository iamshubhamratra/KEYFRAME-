// EDITORIAL ORNAMENT LIBRARY — bespoke per-scene furniture for the 15 packs
// that previously shared the generic corner-bracket fallback (the identity
// audit's look-alike tail: ledger-noir ~ signal-mono at 93%, cobalt-grid ~
// coral at 87%, …). Same contract as the other ornament modules: pure
// deterministic (seed only), one call per scene, returns {sv, dv, sc} — svg
// inner elements, absolute divs, gsap timeline lines. Content always paints
// above (the caller injects this as the clip's first child).
//
// Each recipe is the pack's OWN design language, not a shared builder with
// different params — that's what makes two packs on the same storyboard read
// as different templates:
//   bold-poster   giant outlined folio numeral + snapping baseline rule
//   broadside     masthead double-rule + column rules + № dateline chip
//   capsule       floating capsule outlines + status dots
//   care-lavender breathing petal arcs + small plus marks
//   care-mint     leaf strokes + a drawing heartbeat pulse line
//   cartesian     axis ticks + plotted polyline with point markers
//   cobalt-grid   coordinate crosshairs + a sweeping cell highlight
//   coral         halftone dot-matrix cluster + wavy underline
//   creative-mode washi tape strips + marker oval scribble
//   flux-analytics sparkline + candle ticks + trend chip
//   ledger-noir   gold ledger rules + serif folio + balance underline
//   mint-launch   dashed trajectory arc + payload dot + launch rings
//   nimbus-saas   stacked panel echoes + status dot row
//   signal-mono   equalizer bars + scanline sweep + mono brackets
//   vault-gold    tick-ring vault dial + filigree corner lines

const MONO = "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace";

const EDITORIAL_PACKS = new Set([
  "bold-poster", "broadside", "capsule", "care-lavender", "care-mint",
  "cartesian", "cobalt-grid", "coral", "creative-mode", "flux-analytics",
  "ledger-noir", "mint-launch", "nimbus-saas", "signal-mono", "vault-gold",
  "sumi-kaze", "orrery-brass", "claymotion", "folk-stitch", "abyssal-glow",
  "momentum",
]);

function buildEditorialOrnaments({ framePack, kind, id, pid, T, L, seed, theme, dims, s0, rgba, esc, sceneIndex, sceneCount }) {
  if (!EDITORIAL_PACKS.has(framePack)) return null;
  const W = dims.width, H = dims.height;
  const A = theme.accent, B = theme.accent2, INK = theme.ink;
  const X0 = (theme.extras && theme.extras[0]) || B;
  const sv = [], dv = [], sc = [];
  const reps = (p) => Math.max(1, Math.floor((L - 0.8) / p));
  const idx2 = String((sceneIndex || 0) + 1).padStart(2, "0");

  if (framePack === "momentum") {
    // MOMENTUM — mission-control HUD chrome, straight from its FRAME.md atoms:
    // thin corner brackets with orange tick accents, a running "SCN 0X / 0N"
    // mono timecode bottom-left, a huge ghosted "/0X" section number pinned
    // upper-right (one shade above the ground, structure not decoration), and
    // a low live audio-waveform line skimming the base edge.
    const mono = "font-family:'JetBrains Mono',ui-monospace,monospace;";
    const m = Math.round(Math.min(W, H) * 0.03), bl = Math.round(Math.min(W, H) * 0.032);
    // corner brackets (4) + a short accent tick riding each horizontal rail
    [[`M${m + bl} ${m}H${m}V${m + bl}`], [`M${W - m - bl} ${m}H${W - m}V${m + bl}`],
     [`M${m + bl} ${H - m}H${m}V${H - m - bl}`], [`M${W - m - bl} ${H - m}H${W - m}V${H - m - bl}`]].forEach(([d]) => {
      sv.push(`<path class="${pid}hk" d="${d}" fill="none" stroke="${rgba(INK, 0.4)}" stroke-width="2" stroke-dasharray="140" stroke-dashoffset="140"/>`);
    });
    sv.push(`<line class="${pid}tk" x1="${m + bl + 10}" y1="${m}" x2="${m + bl + 34}" y2="${m}" stroke="${A}" stroke-width="3" opacity="0"/>`);
    sv.push(`<line class="${pid}tk" x1="${W - m - bl - 34}" y1="${H - m}" x2="${W - m - bl - 10}" y2="${H - m}" stroke="${A}" stroke-width="3" opacity="0"/>`);
    sc.push(`tl.to("#${id} .${pid}hk",{strokeDashoffset:0,duration:.5,stagger:.07,ease:"power2.out"},${s0(0.25)});`);
    sc.push(`tl.to("#${id} .${pid}tk",{opacity:.9,duration:.3,stagger:.1},${s0(0.6)});`);
    // running timecode bottom-left (persists the mission-control feel per scene)
    const tcN = String((sceneCount || 5)).padStart(2, "0");
    dv.push(`<div class="${pid}tc" style="position:absolute;left:${m + 4}px;bottom:${m + 6}px;${mono}font-size:${Math.round(Math.min(W, H) * 0.016)}px;letter-spacing:.22em;color:${rgba(INK, 0.55)};opacity:0;">SCN ${idx2} / ${tcN} <span style="color:${A};">●</span></div>`);
    sc.push(`tl.fromTo("#${id} .${pid}tc",{opacity:0,x:-12},{opacity:1,x:0,duration:.45,ease:"power2.out"},${s0(0.5)});`);
    // ghosted section number upper-right — one shade above the ground
    const gfs = Math.round(H * 0.30);
    dv.push(`<div class="${pid}gn" style="position:absolute;right:${Math.round(W * 0.03)}px;top:${-Math.round(gfs * 0.12)}px;font:800 ${gfs}px/1 ${theme.displayStack};letter-spacing:-.03em;color:${rgba(INK, 0.055)};opacity:0;">/${idx2}</div>`);
    sc.push(`tl.fromTo("#${id} .${pid}gn",{opacity:0,y:20},{opacity:1,y:0,duration:.7,ease:"power2.out"},${s0(0.35)});`);
    // live audio waveform skimming the base — drawn once, then its dash crawls
    const wy = H - m - Math.round(H * 0.012), amp = Math.round(H * 0.012), step = Math.round(W / 56);
    let wd = `M${m + bl + 46} ${wy}`;
    for (let x = m + bl + 46; x <= W - m - bl - 46; x += step) {
      const k = x / W;
      wd += ` L${x} ${Math.round(wy + Math.sin(k * 30 + (seed % 7)) * amp * (0.35 + 0.65 * Math.abs(Math.sin(k * 9))))}`;
    }
    sv.push(`<path class="${pid}wv" d="${wd}" fill="none" stroke="${rgba(A, 0.5)}" stroke-width="1.6" stroke-dasharray="5 4" opacity="0"/>`);
    sc.push(`tl.to("#${id} .${pid}wv",{opacity:1,duration:.4},${s0(0.55)});`);
    sc.push(`tl.to("#${id} .${pid}wv",{strokeDashoffset:-180,duration:${Math.max(2, L - 1)},ease:"none"},${s0(0.6)});`);
  } else if (framePack === "bold-poster") {
    // giant outlined folio numeral, bottom-right, poster-style; CTA fills it
    const fs = Math.round(H * 0.34);
    const fill = kind === "cta" ? A : "transparent";
    dv.push(`<div class="${pid}fol" style="position:absolute;right:${Math.round(W * 0.035)}px;bottom:${-Math.round(fs * 0.16)}px;font:900 ${fs}px/1 ${theme.displayStack};letter-spacing:-.04em;color:${fill};-webkit-text-stroke:3px ${rgba(INK, 0.8)};opacity:0;">${idx2}</div>`);
    sc.push(`tl.fromTo("#${id} .${pid}fol",{opacity:0,y:26},{opacity:.9,y:0,duration:.5,ease:"power4.out"},${s0(0.45)});`);
    const by = Math.round(H * 0.9);
    sv.push(`<line class="${pid}base" x1="${Math.round(W * 0.05)}" y1="${by}" x2="${Math.round(W * 0.95)}" y2="${by}" stroke="${INK}" stroke-width="6" transform="scale(0,1)"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}base",{scaleX:0,transformOrigin:"0% 50%"},{scaleX:1,duration:.45,ease:"power4.inOut"},${s0(0.25)});`);
  } else if (framePack === "broadside") {
    // newspaper masthead: double rule top, three column rules, № dateline chip
    const mx = Math.round(W * 0.05), mw = Math.round(W * 0.9), my = Math.round(H * 0.075);
    sv.push(`<line class="${pid}m" x1="${mx}" y1="${my}" x2="${mx + mw}" y2="${my}" stroke="${INK}" stroke-width="5"/>`);
    sv.push(`<line class="${pid}m" x1="${mx}" y1="${my + 9}" x2="${mx + mw}" y2="${my + 9}" stroke="${INK}" stroke-width="1.6"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}m",{scaleX:0,transformOrigin:"0% 50%"},{scaleX:1,duration:.5,stagger:.09,ease:"power3.inOut"},${s0(0.2)});`);
    for (let c = 1; c <= 3; c++) {
      const cx = Math.round(mx + (mw * c) / 4);
      sv.push(`<line class="${pid}c" x1="${cx}" y1="${Math.round(H * 0.16)}" x2="${cx}" y2="${Math.round(H * 0.86)}" stroke="${rgba(INK, 0.16)}" stroke-width="1.4"/>`);
    }
    sc.push(`tl.fromTo("#${id} .${pid}c",{scaleY:0,transformOrigin:"50% 0%"},{scaleY:1,duration:.7,stagger:.12,ease:"power2.out"},${s0(0.5)});`);
    dv.push(`<div class="${pid}no" style="position:absolute;right:${Math.round(W * 0.05)}px;top:${Math.round(H * 0.032)}px;font:700 ${Math.round(H * 0.022)}px/1 ${MONO};letter-spacing:.22em;color:${rgba(INK, 0.75)};opacity:0;">№ ${idx2} / ${String(sceneCount || 1).padStart(2, "0")}</div>`);
    sc.push(`tl.to("#${id} .${pid}no",{opacity:1,duration:.4},${s0(0.6)});`);
  } else if (framePack === "capsule") {
    // floating capsule outlines with status dots; CTA draws a big capsule ring
    const caps = [[0.09, 0.14, 0.16], [0.76, 0.82, 0.13]];
    caps.forEach(([fx, fy, fw], i) => {
      const cw = Math.round(W * fw), ch = Math.round(cw * 0.34), x = Math.round(W * fx), y = Math.round(H * fy);
      sv.push(`<rect class="${pid}cap" x="${x}" y="${y}" width="${cw}" height="${ch}" rx="${Math.round(ch / 2)}" fill="none" stroke="${i ? B : A}" stroke-width="3" opacity="0"/>`);
      sv.push(`<circle class="${pid}cd" cx="${x + Math.round(ch / 2)}" cy="${y + Math.round(ch / 2)}" r="${Math.round(ch * 0.16)}" fill="${i ? B : A}" opacity="0"/>`);
    });
    sc.push(`tl.fromTo("#${id} .${pid}cap",{opacity:0,scale:.7,transformOrigin:"50% 50%"},{opacity:.75,scale:1,duration:.55,stagger:.12,ease:"back.out(2)"},${s0(0.35)});`);
    sc.push(`tl.to("#${id} .${pid}cd",{opacity:.9,duration:.3,stagger:.12},${s0(0.6)});`);
    sc.push(`tl.to("#${id} .${pid}cap",{y:-9,duration:1.6,ease:"sine.inOut",yoyo:true,repeat:${reps(1.6)},stagger:.2},${s0(0.9)});`);
    if (kind === "cta") {
      const rw = Math.round(W * 0.34), rh = Math.round(H * 0.15), rx0 = Math.round(W / 2 - rw / 2), ry0 = Math.round(H * 0.55);
      const per = 2 * (rw + rh);
      sv.push(`<rect class="${pid}ring" x="${rx0}" y="${ry0}" width="${rw}" height="${rh}" rx="${Math.round(rh / 2)}" fill="none" stroke="${A}" stroke-width="3.5" stroke-dasharray="${per}" stroke-dashoffset="${per}"/>`);
      sc.push(`tl.to("#${id} .${pid}ring",{strokeDashoffset:0,duration:.9,ease:"power2.inOut"},${s0(0.7)});`);
    }
  } else if (framePack === "care-lavender") {
    // breathing petal arcs + small plus marks (soft, medical-adjacent calm)
    const r0 = Math.round(H * 0.34);
    sv.push(`<path class="${pid}p" d="M ${-r0 * 0.3} ${Math.round(H * 0.16)} A ${r0} ${r0} 0 0 1 ${Math.round(r0 * 0.72)} ${H + r0 * 0.1}" fill="none" stroke="${rgba(A, 0.5)}" stroke-width="${Math.round(H * 0.02)}" stroke-linecap="round" opacity="0"/>`);
    sv.push(`<path class="${pid}p" d="M ${W + r0 * 0.3} ${H - Math.round(H * 0.16)} A ${r0} ${r0} 0 0 1 ${W - Math.round(r0 * 0.72)} ${-r0 * 0.1}" fill="none" stroke="${rgba(B, 0.42)}" stroke-width="${Math.round(H * 0.014)}" stroke-linecap="round" opacity="0"/>`);
    sc.push(`tl.to("#${id} .${pid}p",{opacity:1,duration:.8,stagger:.2,ease:"sine.out"},${s0(0.3)});`);
    sc.push(`tl.fromTo("#${id} .${pid}p",{scale:.985,transformOrigin:"50% 50%"},{scale:1.015,duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(2.2)}},${s0(0.3)});`);
    [[0.16, 0.24], [0.85, 0.2], [0.78, 0.78]].forEach(([fx, fy], i) => {
      const x = Math.round(W * fx), y = Math.round(H * fy), s = 7 + (i + seed) % 4 * 2;
      sv.push(`<path class="${pid}x" d="M${x - s} ${y}H${x + s}M${x} ${y - s}V${y + s}" stroke="${rgba(i % 2 ? B : A, 0.65)}" stroke-width="3" stroke-linecap="round" opacity="0"/>`);
    });
    sc.push(`tl.fromTo("#${id} .${pid}x",{opacity:0,scale:0,transformOrigin:"50% 50%"},{opacity:1,scale:1,duration:.4,stagger:.14,ease:"back.out(2.4)"},${s0(0.7)});`);
  } else if (framePack === "care-mint") {
    // leaf strokes + a drawing heartbeat pulse on stat/text scenes
    const lx = Math.round(W * 0.09), ly = Math.round(H * 0.18), ls = Math.round(H * 0.09);
    sv.push(`<path class="${pid}lf" d="M ${lx} ${ly + ls} Q ${lx} ${ly}, ${lx + ls} ${ly} Q ${lx + ls} ${ly + ls}, ${lx} ${ly + ls} Z" fill="${rgba(A, 0.32)}" stroke="${A}" stroke-width="2.5" opacity="0"/>`);
    sv.push(`<path class="${pid}lf" d="M ${lx + ls * 0.7} ${ly + ls * 1.5} Q ${lx + ls * 0.7} ${ly + ls * 0.8}, ${lx + ls * 1.4} ${ly + ls * 0.8} Q ${lx + ls * 1.4} ${ly + ls * 1.5}, ${lx + ls * 0.7} ${ly + ls * 1.5} Z" fill="${rgba(B, 0.26)}" stroke="${B}" stroke-width="2" opacity="0"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}lf",{opacity:0,scale:.4,rotation:-14,transformOrigin:"0% 100%"},{opacity:1,scale:1,rotation:0,duration:.6,stagger:.14,ease:"back.out(1.8)"},${s0(0.35)});`);
    if (kind === "stat" || kind === "text" || kind === "cta") {
      const py = Math.round(H * 0.84), px0 = Math.round(W * 0.58), pw = Math.round(W * 0.34);
      const mid = px0 + pw * 0.45;
      const d = `M ${px0} ${py} H ${mid - 30} L ${mid - 18} ${py - 26} L ${mid} ${py + 20} L ${mid + 14} ${py - 12} L ${mid + 24} ${py} H ${px0 + pw}`;
      sv.push(`<path class="${pid}hb" d="${d}" fill="none" stroke="${A}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>`);
      sv.push(`<circle class="${pid}hd" cx="${px0 + pw}" cy="${py}" r="5" fill="${A}" opacity="0"/>`);
      sc.push(`tl.to("#${id} .${pid}hb",{strokeDashoffset:0,duration:1.0,ease:"power1.inOut"},${s0(0.6)});`);
      sc.push(`tl.to("#${id} .${pid}hd",{opacity:1,duration:.25},${s0(1.5)});`);
      sc.push(`tl.to("#${id} .${pid}hd",{scale:1.7,transformOrigin:"50% 50%",duration:.7,ease:"sine.inOut",yoyo:true,repeat:${reps(0.7)}},${s0(1.75)});`);
    }
  } else if (framePack === "cartesian") {
    // axis ticks + a plotted polyline with point markers (graph-paper soul)
    const ax = Math.round(W * 0.06), ay = Math.round(H * 0.88);
    for (let i = 0; i < 8; i++) {
      sv.push(`<line class="${pid}tx" x1="${ax + i * Math.round(W * 0.115)}" y1="${ay}" x2="${ax + i * Math.round(W * 0.115)}" y2="${ay + 8}" stroke="${rgba(INK, 0.6)}" stroke-width="2"/>`);
      if (i < 5) sv.push(`<line class="${pid}ty" x1="${ax - 8}" y1="${ay - i * Math.round(H * 0.16)}" x2="${ax}" y2="${ay - i * Math.round(H * 0.16)}" stroke="${rgba(INK, 0.6)}" stroke-width="2"/>`);
    }
    sv.push(`<line class="${pid}axl" x1="${ax}" y1="${Math.round(H * 0.12)}" x2="${ax}" y2="${ay}" stroke="${rgba(INK, 0.5)}" stroke-width="2.5"/>`);
    sv.push(`<line class="${pid}axl" x1="${ax}" y1="${ay}" x2="${Math.round(W * 0.94)}" y2="${ay}" stroke="${rgba(INK, 0.5)}" stroke-width="2.5"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}axl",{opacity:0},{opacity:1,duration:.4},${s0(0.2)});`);
    sc.push(`tl.fromTo("#${id} .${pid}tx, #${id} .${pid}ty",{opacity:0,scale:0,transformOrigin:"50% 50%"},{opacity:1,scale:1,duration:.3,stagger:.03,ease:"power2.out"},${s0(0.35)});`);
    if (kind !== "hook") {
      const pts = [0, 1, 2, 3].map((i) => {
        const x = ax + Math.round(W * (0.14 + i * 0.2));
        const y = ay - Math.round(H * (0.12 + ((i * 37 + seed) % 4) * 0.09 + i * 0.1));
        return [x, y];
      });
      sv.push(`<polyline class="${pid}pl" points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${A}" stroke-width="3.5" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>`);
      pts.forEach(([x, y]) => sv.push(`<circle class="${pid}pt" cx="${x}" cy="${y}" r="6" fill="${theme.ground}" stroke="${A}" stroke-width="3" opacity="0"/>`));
      sc.push(`tl.to("#${id} .${pid}pl",{strokeDashoffset:0,duration:1.0,ease:"power2.inOut"},${s0(0.6)});`);
      sc.push(`tl.fromTo("#${id} .${pid}pt",{opacity:0,scale:0,transformOrigin:"50% 50%"},{opacity:1,scale:1,duration:.35,stagger:.18,ease:"back.out(2.6)"},${s0(0.75)});`);
    }
  } else if (framePack === "cobalt-grid") {
    // coordinate crosshairs + a sweeping cell highlight
    [[0.22, 0.22], [0.78, 0.2], [0.24, 0.8], [0.8, 0.78]].forEach(([fx, fy], i) => {
      const x = Math.round(W * fx), y = Math.round(H * fy), s = 11;
      sv.push(`<path class="${pid}ch" d="M${x - s} ${y}H${x + s}M${x} ${y - s}V${y + s}" stroke="${i % 2 ? B : A}" stroke-width="3" opacity="0"/>`);
    });
    sc.push(`tl.fromTo("#${id} .${pid}ch",{opacity:0,scale:2.2,transformOrigin:"50% 50%"},{opacity:.9,scale:1,duration:.4,stagger:.09,ease:"power3.out"},${s0(0.3)});`);
    const cw = 46 * 2, cy0 = Math.round(H * (kind === "hook" ? 0.3 : 0.76) / 46) * 46;
    sv.push(`<rect class="${pid}cell" x="0" y="${cy0}" width="${cw}" height="46" fill="${rgba(A, 0.2)}" stroke="${A}" stroke-width="2" opacity="0"/>`);
    sc.push(`tl.to("#${id} .${pid}cell",{opacity:1,duration:.2},${s0(0.65)});`);
    sc.push(`tl.to("#${id} .${pid}cell",{x:${Math.round(W * 0.7 / 92) * 92},duration:${Math.max(1.6, L - 1.6)},ease:"steps(${Math.max(3, Math.round(W * 0.7 / 92))})"},${s0(0.85)});`);
  } else if (framePack === "coral") {
    // halftone dot-matrix cluster + wavy underline
    const gx = Math.round(W * 0.76), gy = Math.round(H * 0.68);
    for (let ro = 0; ro < 3; ro++) for (let co = 0; co < 5; co++) {
      const rr = 3 + (2 - ro) * 2.2;
      sv.push(`<circle class="${pid}d" cx="${gx + co * 26}" cy="${gy + ro * 26}" r="${rr.toFixed(1)}" fill="${ro === 1 ? B : A}" opacity="0"/>`);
    }
    sc.push(`tl.fromTo("#${id} .${pid}d",{opacity:0,scale:0,transformOrigin:"50% 50%"},{opacity:.85,scale:1,duration:.35,stagger:.035,ease:"back.out(2)"},${s0(0.4)});`);
    if (kind === "hook" || kind === "cta") {
      const uy = Math.round(H * 0.66), ux = Math.round(W * 0.07);
      let d = `M ${ux} ${uy}`;
      for (let i = 1; i <= 6; i++) d += ` q 14 ${i % 2 ? -12 : 12} 28 0`;
      sv.push(`<path class="${pid}w" d="${d}" fill="none" stroke="${A}" stroke-width="4" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>`);
      sc.push(`tl.to("#${id} .${pid}w",{strokeDashoffset:0,duration:.7,ease:"power2.out"},${s0(0.7)});`);
    }
  } else if (framePack === "creative-mode") {
    // washi tape strips + a marker oval scribble
    const tw = Math.round(W * 0.13), th = Math.round(tw * 0.26);
    [[0.1, 0.09, -8], [0.79, 0.1, 7]].forEach(([fx, fy, rot], i) => {
      const x = Math.round(W * fx), y = Math.round(H * fy);
      sv.push(`<g class="${pid}tp" data-rot="${rot}" transform="translate(${x},${y})"><rect x="${-tw / 2}" y="${-th / 2}" width="${tw}" height="${th}" fill="${rgba(i ? B : A, 0.55)}" stroke="${rgba(INK, 0.5)}" stroke-width="1.6" stroke-dasharray="4 3"/></g>`);
    });
    sc.push(`tl.fromTo("#${id} .${pid}tp",{opacity:0,scale:1.7,rotation:function(i,el){return +el.getAttribute("data-rot")+10;}},{opacity:1,scale:1,rotation:function(i,el){return +el.getAttribute("data-rot");},duration:.4,stagger:.12,ease:"power4.in",svgOrigin:"${Math.round(W / 2)} ${Math.round(H / 2)}"},${s0(0.3)});`);
    if (kind === "hook" || kind === "cta") {
      const ex = Math.round(W * 0.5), ey = Math.round(H * (kind === "cta" ? 0.62 : 0.7));
      sv.push(`<ellipse class="${pid}sc" cx="${ex}" cy="${ey}" rx="${Math.round(W * 0.14)}" ry="${Math.round(H * 0.055)}" fill="none" stroke="${X0}" stroke-width="3.5" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" transform="rotate(-3 ${ex} ${ey})"/>`);
      sc.push(`tl.to("#${id} .${pid}sc",{strokeDashoffset:0,duration:.8,ease:"power2.inOut"},${s0(0.9)});`);
    }
  } else if (framePack === "flux-analytics") {
    // sparkline + candle ticks + trend chip
    const sx = Math.round(W * 0.66), sy = Math.round(H * 0.8), sw = Math.round(W * 0.26);
    const pts = [0, 1, 2, 3, 4, 5].map((i) => {
      const x = sx + (sw / 5) * i;
      const y = sy - Math.round(H * (0.02 + ((i * 29 + seed * 7) % 5) * 0.016 + i * 0.02));
      return `${x},${y}`;
    });
    sv.push(`<polyline class="${pid}sp" points="${pts.join(" ")}" fill="none" stroke="${A}" stroke-width="3" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>`);
    for (let i = 0; i < 4; i++) {
      const x = sx + 10 + i * 22, base = sy + 16, hh = 8 + ((i * 13 + seed) % 3) * 5;
      sv.push(`<line class="${pid}cn" x1="${x}" y1="${base}" x2="${x}" y2="${base + hh}" stroke="${i % 2 ? B : rgba(INK, 0.55)}" stroke-width="4"/>`);
    }
    sc.push(`tl.to("#${id} .${pid}sp",{strokeDashoffset:0,duration:.9,ease:"power2.inOut"},${s0(0.5)});`);
    sc.push(`tl.fromTo("#${id} .${pid}cn",{scaleY:0,transformOrigin:"50% 0%"},{scaleY:1,duration:.4,stagger:.08,ease:"power3.out"},${s0(0.8)});`);
    dv.push(`<div class="${pid}tc" style="position:absolute;left:${Math.round(W * 0.05)}px;top:${Math.round(H * 0.07)}px;padding:5px 12px;border:1px solid ${rgba(A, 0.5)};border-radius:6px;font:700 ${Math.round(H * 0.024)}px/1 ${MONO};letter-spacing:.14em;color:${A};opacity:0;">▲ FLUX·${idx2}</div>`);
    sc.push(`tl.fromTo("#${id} .${pid}tc",{opacity:0,y:-8},{opacity:1,y:0,duration:.4},${s0(0.35)});`);
  } else if (framePack === "ledger-noir") {
    // gold ledger rules + serif folio + double balance underline on stat
    const lx = Math.round(W * 0.06), lw = Math.round(W * 0.36);
    for (let i = 0; i < 3; i++) {
      const y = Math.round(H * (0.74 + i * 0.06));
      sv.push(`<line class="${pid}lr" x1="${lx}" y1="${y}" x2="${lx + lw - i * Math.round(lw * 0.18)}" y2="${y}" stroke="${rgba(A, 0.75)}" stroke-width="${i === 0 ? 2.5 : 1.4}"/>`);
    }
    sc.push(`tl.fromTo("#${id} .${pid}lr",{scaleX:0,transformOrigin:"0% 50%"},{scaleX:1,duration:.6,stagger:.12,ease:"power2.inOut"},${s0(0.4)});`);
    dv.push(`<div class="${pid}fo" style="position:absolute;right:${Math.round(W * 0.05)}px;top:${Math.round(H * 0.06)}px;font:600 ${Math.round(H * 0.026)}px/1 ${theme.displayStack};letter-spacing:.3em;color:${rgba(A, 0.85)};opacity:0;">№ ${idx2}</div>`);
    sc.push(`tl.to("#${id} .${pid}fo",{opacity:1,duration:.5},${s0(0.3)});`);
    if (kind === "stat") {
      const ux = Math.round(W * 0.5 - W * 0.11), uw = Math.round(W * 0.22), uy = Math.round(H * 0.7);
      sv.push(`<line class="${pid}bal" x1="${ux}" y1="${uy}" x2="${ux + uw}" y2="${uy}" stroke="${A}" stroke-width="2.5"/>`);
      sv.push(`<line class="${pid}bal" x1="${ux}" y1="${uy + 6}" x2="${ux + uw}" y2="${uy + 6}" stroke="${A}" stroke-width="1.2"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}bal",{scaleX:0,transformOrigin:"50% 50%"},{scaleX:1,duration:.55,stagger:.1,ease:"power2.out"},${s0(0.9)});`);
    }
  } else if (framePack === "mint-launch") {
    // dashed trajectory arc + payload dot + launch rings on cta
    const x0 = Math.round(W * 0.1), y0 = Math.round(H * 0.86), x1 = Math.round(W * 0.88), y1 = Math.round(H * 0.16);
    const cx0 = Math.round(W * 0.55), cy0 = Math.round(H * 0.82);
    sv.push(`<path class="${pid}tr" d="M ${x0} ${y0} Q ${cx0} ${cy0}, ${x1} ${y1}" fill="none" stroke="${rgba(A, 0.7)}" stroke-width="2.5" stroke-dasharray="7 8" pathLength="100" stroke-dashoffset="100" opacity="0"/>`);
    sv.push(`<circle class="${pid}pd" cx="${x1}" cy="${y1}" r="7" fill="${A}" opacity="0"/>`);
    sv.push(`<circle class="${pid}pd" cx="${x1}" cy="${y1}" r="14" fill="none" stroke="${rgba(A, 0.5)}" stroke-width="2" opacity="0"/>`);
    sc.push(`tl.to("#${id} .${pid}tr",{opacity:1,duration:.2},${s0(0.35)});`);
    sc.push(`tl.to("#${id} .${pid}tr",{strokeDashoffset:0,duration:1.1,ease:"power2.inOut"},${s0(0.4)});`);
    sc.push(`tl.fromTo("#${id} .${pid}pd",{opacity:0,scale:0,transformOrigin:"50% 50%"},{opacity:1,scale:1,duration:.4,stagger:.1,ease:"back.out(2.2)"},${s0(1.4)});`);
    if (kind === "cta") {
      const rx0 = Math.round(W / 2), ry0 = Math.round(H * 0.5);
      for (let i = 0; i < 2; i++) sv.push(`<circle class="${pid}lr2" cx="${rx0}" cy="${ry0}" r="${Math.round(H * (0.3 + i * 0.09))}" fill="none" stroke="${rgba(i ? B : A, 0.35)}" stroke-width="2" opacity="0"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}lr2",{opacity:0,scale:.7,transformOrigin:"50% 50%"},{opacity:1,scale:1,duration:.8,stagger:.14,ease:"power2.out"},${s0(0.5)});`);
    }
  } else if (framePack === "nimbus-saas") {
    // stacked panel echoes + a status dot row
    const pw = Math.round(W * 0.24), ph = Math.round(H * 0.3), px0 = Math.round(W * 0.7), py0 = Math.round(H * 0.6);
    for (let i = 2; i >= 1; i--) {
      sv.push(`<rect class="${pid}st" x="${px0 + i * 12}" y="${py0 + i * 12}" width="${pw}" height="${ph}" rx="14" fill="none" stroke="${rgba(i === 1 ? A : B, 0.4)}" stroke-width="2" opacity="0"/>`);
    }
    sc.push(`tl.fromTo("#${id} .${pid}st",{opacity:0,y:18},{opacity:1,y:0,duration:.6,stagger:.14,ease:"power3.out"},${s0(0.4)});`);
    const dy = Math.round(H * 0.085);
    [A, B, X0].forEach((c, i) => {
      sv.push(`<circle class="${pid}dt" cx="${Math.round(W * 0.06) + i * 24}" cy="${dy}" r="6" fill="${c}" opacity="0"/>`);
    });
    sc.push(`tl.fromTo("#${id} .${pid}dt",{opacity:0,scale:0,transformOrigin:"50% 50%"},{opacity:.95,scale:1,duration:.35,stagger:.1,ease:"back.out(2.6)"},${s0(0.3)});`);
    sc.push(`tl.to("#${id} .${pid}dt",{opacity:.45,duration:.9,ease:"sine.inOut",yoyo:true,repeat:${reps(0.9)},stagger:.2},${s0(0.8)});`);
  } else if (framePack === "signal-mono") {
    // equalizer bars + a scanline sweep + mono end-brackets
    const bx0 = Math.round(W * 0.06), by = Math.round(H * 0.88);
    for (let i = 0; i < 7; i++) {
      const hh = Math.round(H * (0.03 + ((i * 17 + seed) % 5) * 0.014));
      sv.push(`<rect class="${pid}eq" x="${bx0 + i * 16}" y="${by - hh}" width="8" height="${hh}" fill="${i % 3 === 2 ? B : A}"/>`);
    }
    sc.push(`tl.fromTo("#${id} .${pid}eq",{scaleY:.15,transformOrigin:"50% 100%"},{scaleY:1,duration:.5,stagger:.06,ease:"power2.out"},${s0(0.3)});`);
    sc.push(`tl.to("#${id} .${pid}eq",{scaleY:.35,transformOrigin:"50% 100%",duration:.55,ease:"sine.inOut",yoyo:true,repeat:${reps(0.55)},stagger:{each:.09,from:"random"}},${s0(0.9)});`);
    sv.push(`<rect class="${pid}scan" x="0" y="0" width="${W}" height="3" fill="${rgba(A, 0.35)}" opacity="0"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}scan",{opacity:.9,y:0},{y:${H},opacity:.9,duration:${Math.max(1.8, L - 0.8)},ease:"none"},${s0(0.4)});`);
    dv.push(`<div class="${pid}bk" style="position:absolute;right:${Math.round(W * 0.05)}px;bottom:${Math.round(H * 0.06)}px;font:600 ${Math.round(H * 0.024)}px/1 ${MONO};letter-spacing:.2em;color:${rgba(INK, 0.8)};opacity:0;">[ SIG ${idx2} ]</div>`);
    sc.push(`tl.to("#${id} .${pid}bk",{opacity:1,duration:.4},${s0(0.6)});`);
  } else if (framePack === "vault-gold") {
    // tick-ring vault dial (rotates in) + filigree corner lines
    const cx0 = Math.round(W * 0.87), cy0 = Math.round(H * 0.2), r0 = Math.round(H * 0.16);
    const ticks = [];
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const x1p = cx0 + Math.cos(ang) * (r0 - 8), y1p = cy0 + Math.sin(ang) * (r0 - 8);
      const x2p = cx0 + Math.cos(ang) * r0, y2p = cy0 + Math.sin(ang) * r0;
      ticks.push(`<line x1="${x1p.toFixed(1)}" y1="${y1p.toFixed(1)}" x2="${x2p.toFixed(1)}" y2="${y2p.toFixed(1)}" stroke="${A}" stroke-width="2.5"/>`);
    }
    sv.push(`<g class="${pid}dial" opacity="0"><circle cx="${cx0}" cy="${cy0}" r="${r0}" fill="none" stroke="${rgba(A, 0.8)}" stroke-width="2.5"/><circle cx="${cx0}" cy="${cy0}" r="${Math.round(r0 * 0.62)}" fill="none" stroke="${rgba(A, 0.45)}" stroke-width="1.5"/>${ticks.join("")}</g>`);
    sc.push(`tl.fromTo("#${id} .${pid}dial",{opacity:0,rotation:-70,svgOrigin:"${cx0} ${cy0}"},{opacity:1,rotation:0,duration:.9,ease:"power3.out"},${s0(0.35)});`);
    sc.push(`tl.to("#${id} .${pid}dial",{rotation:14,svgOrigin:"${cx0} ${cy0}",duration:${Math.max(2, L - 1.4)},ease:"sine.inOut"},${s0(1.3)});`);
    const fl = Math.round(W * 0.05);
    sv.push(`<path class="${pid}fg" d="M${fl} ${Math.round(H * 0.9)} h${Math.round(W * 0.1)} M${fl} ${Math.round(H * 0.9)} v${-Math.round(H * 0.07)}" fill="none" stroke="${rgba(A, 0.65)}" stroke-width="2" stroke-dasharray="160" stroke-dashoffset="160"/>`);
    sc.push(`tl.to("#${id} .${pid}fg",{strokeDashoffset:0,duration:.6,ease:"power2.out"},${s0(0.6)});`);
  } else if (framePack === "sumi-kaze") {
    // hanging-scroll margin rule (gold, draws down) + a tapered brush-rule +
    // an ensō circle that paints itself on CTA scenes
    const mx = Math.round(W * 0.955);
    sv.push(`<line class="${pid}sm" x1="${mx}" y1="${Math.round(H * 0.08)}" x2="${mx}" y2="${Math.round(H * 0.92)}" stroke="${rgba(X0, 0.6)}" stroke-width="2"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}sm",{scaleY:0,transformOrigin:"50% 0%"},{scaleY:1,duration:.9,ease:"power2.inOut"},${s0(0.25)});`);
    const bx = Math.round(W * 0.07), by = Math.round(H * 0.84), bw = Math.round(W * 0.2);
    sv.push(`<path class="${pid}br" d="M ${bx} ${by} q ${Math.round(bw * 0.3)} -7 ${Math.round(bw * 0.55)} -3 q ${Math.round(bw * 0.28)} 4 ${Math.round(bw * 0.45)} -2" fill="none" stroke="${rgba(INK, 0.75)}" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>`);
    sc.push(`tl.to("#${id} .${pid}br",{strokeDashoffset:0,duration:.6,ease:"power2.inOut"},${s0(0.55)});`);
    if (kind === "cta") {
      const ex = Math.round(W * 0.82), ey = Math.round(H * 0.3), er = Math.round(H * 0.13);
      sv.push(`<circle class="${pid}en" cx="${ex}" cy="${ey}" r="${er}" fill="none" stroke="${rgba(INK, 0.65)}" stroke-width="${Math.round(er * 0.16)}" stroke-linecap="round" pathLength="100" stroke-dasharray="88 12" stroke-dashoffset="88" transform="rotate(-80 ${ex} ${ey})"/>`);
      sc.push(`tl.to("#${id} .${pid}en",{strokeDashoffset:0,duration:1.1,ease:"power2.inOut"},${s0(0.6)});`);
    }
  } else if (framePack === "orrery-brass") {
    // cartouche corner label + a graduation arc + moon-phase progress dots
    const cw = Math.round(W * 0.16), chh = Math.round(H * 0.052), cx1 = Math.round(W * 0.05), cy1 = Math.round(H * 0.06);
    sv.push(`<g class="${pid}ct" opacity="0"><rect x="${cx1}" y="${cy1}" width="${cw}" height="${chh}" fill="none" stroke="${rgba(A, 0.7)}" stroke-width="1.4"/><rect x="${cx1 + 5}" y="${cy1 + 5}" width="${cw - 10}" height="${chh - 10}" fill="none" stroke="${rgba(A, 0.4)}" stroke-width="1"/></g>`);
    dv.push(`<div class="${pid}cl" style="position:absolute;left:${cx1}px;top:${cy1}px;width:${cw}px;height:${chh}px;display:flex;align-items:center;justify-content:center;font:600 ${Math.round(chh * 0.36)}px/1 ${MONO};letter-spacing:.3em;color:${rgba(A, 0.85)};opacity:0;">TAB ${idx2}</div>`);
    sc.push(`tl.to("#${id} .${pid}ct,#${id} .${pid}cl",{opacity:1,duration:.6},${s0(0.3)});`);
    const gx = Math.round(W * 0.88), gy = Math.round(H * 0.16), gr = Math.round(H * 0.13);
    const gt = [];
    for (let i = 0; i <= 10; i++) {
      const ang = -Math.PI * 0.75 + (i / 10) * Math.PI * 0.5;
      gt.push(`<line x1="${(gx + Math.cos(ang) * (gr - 7)).toFixed(1)}" y1="${(gy + Math.sin(ang) * (gr - 7)).toFixed(1)}" x2="${(gx + Math.cos(ang) * gr).toFixed(1)}" y2="${(gy + Math.sin(ang) * gr).toFixed(1)}" stroke="${rgba(B, 0.7)}" stroke-width="${i % 5 ? 1.2 : 2.4}"/>`);
    }
    sv.push(`<g class="${pid}gr" opacity="0">${gt.join("")}</g>`);
    sc.push(`tl.fromTo("#${id} .${pid}gr",{opacity:0,rotation:-16,svgOrigin:"${gx} ${gy}"},{opacity:1,rotation:0,duration:.8,ease:"power2.out"},${s0(0.5)});`);
    const n = Math.max(1, sceneCount || 1);
    for (let i = 0; i < Math.min(n, 8); i++) {
      const dx = Math.round(W * 0.5 + (i - Math.min(n, 8) / 2) * 26);
      sv.push(`<circle class="${pid}mp" cx="${dx}" cy="${Math.round(H * 0.94)}" r="6" fill="${i <= (sceneIndex || 0) ? A : "none"}" stroke="${rgba(A, 0.6)}" stroke-width="1.5" opacity="0"/>`);
    }
    sc.push(`tl.fromTo("#${id} .${pid}mp",{opacity:0,scale:0,transformOrigin:"50% 50%"},{opacity:1,scale:1,duration:.35,stagger:.07,ease:"back.out(2)"},${s0(0.7)});`);
  } else if (framePack === "claymotion") {
    // tilted set-floor line + a rolled clay worm-rule (squashes in, in ticks) +
    // googly-dot pair; CTA gets a clay star popping in stepped
    dv.push(`<div class="${pid}fl" style="position:absolute;left:-4%;right:-4%;top:${Math.round(H * 0.78)}px;height:3px;background:${rgba(INK, 0.14)};transform:rotate(-1.6deg);opacity:0;"></div>`);
    sc.push(`tl.to("#${id} .${pid}fl",{opacity:1,duration:.4,ease:"steps(4)"},${s0(0.3)});`);
    const wx = Math.round(W * 0.07), wy = Math.round(H * 0.13), ww = Math.round(W * 0.16);
    sv.push(`<path class="${pid}wm" d="M ${wx} ${wy} q ${Math.round(ww * 0.25)} -10 ${Math.round(ww * 0.5)} 0 q ${Math.round(ww * 0.25)} 10 ${Math.round(ww * 0.5)} 0" fill="none" stroke="${B}" stroke-width="${Math.round(H * 0.018)}" stroke-linecap="round" opacity="0"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}wm",{opacity:0,scaleX:.3,transformOrigin:"0% 50%"},{opacity:1,scaleX:1,duration:.5,ease:"steps(6)"},${s0(0.45)});`);
    const gx2 = Math.round(W * 0.86), gy2 = Math.round(H * 0.72);
    sv.push(`<g class="${pid}gg" opacity="0"><circle cx="${gx2}" cy="${gy2}" r="13" fill="#FFF8F0" stroke="${rgba(INK, 0.5)}" stroke-width="2"/><circle cx="${gx2 + 30}" cy="${gy2}" r="13" fill="#FFF8F0" stroke="${rgba(INK, 0.5)}" stroke-width="2"/><circle class="${pid}gp" cx="${gx2 + 4}" cy="${gy2 + 3}" r="5" fill="${INK}"/><circle class="${pid}gp" cx="${gx2 + 34}" cy="${gy2 + 3}" r="5" fill="${INK}"/></g>`);
    sc.push(`tl.fromTo("#${id} .${pid}gg",{opacity:0,scale:0,transformOrigin:"${gx2 + 15} ${gy2}"},{opacity:1,scale:1,duration:.45,ease:"steps(5)"},${s0(0.8)});`);
    sc.push(`tl.to("#${id} .${pid}gp",{x:-6,duration:1.4,ease:"steps(3)",yoyo:true,repeat:${reps(1.4)}},${s0(1.4)});`);
    if (kind === "cta") {
      const sx = Math.round(W * 0.12), sy = Math.round(H * 0.62), ss = Math.round(H * 0.07);
      const star = [];
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? ss * 0.45 : ss;
        star.push(`${(sx + Math.cos(ang) * rr).toFixed(1)},${(sy + Math.sin(ang) * rr).toFixed(1)}`);
      }
      sv.push(`<polygon class="${pid}st" points="${star.join(" ")}" fill="${X0}" opacity="0"/>`);
      sc.push(`tl.fromTo("#${id} .${pid}st",{opacity:0,scale:0,rotation:-40,svgOrigin:"${sx} ${sy}"},{opacity:1,scale:1,rotation:0,duration:.5,ease:"steps(6)"},${s0(0.9)});`);
    }
  } else if (framePack === "folk-stitch") {
    // sampler border sewing itself + zigzag hem + button dots
    const m = Math.round(Math.min(W, H) * 0.035);
    const per = 2 * ((W - 2 * m) + (H - 2 * m));
    sv.push(`<rect class="${pid}sf" x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" fill="none" stroke="${rgba(A, 0.75)}" stroke-width="3" stroke-dasharray="14 10" opacity="0"/>`);
    sv.push(`<rect class="${pid}sd" x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" fill="none" stroke="${rgba(A, 0.75)}" stroke-width="3" stroke-dasharray="${per}" stroke-dashoffset="${per}"/>`);
    sc.push(`tl.to("#${id} .${pid}sd",{strokeDashoffset:0,duration:1.1,ease:"power1.inOut"},${s0(0.2)});`);
    sc.push(`tl.to("#${id} .${pid}sd",{opacity:0,duration:.01},${s0(1.32)});`);
    sc.push(`tl.to("#${id} .${pid}sf",{opacity:1,duration:.01},${s0(1.31)});`);
    const zz = [], zy = Math.round(H * 0.905), zs = 16;
    for (let x = m * 2; x <= W - m * 2; x += zs) zz.push(`${x},${zy + (((x / zs) | 0) % 2 ? 0 : 10)}`);
    sv.push(`<polyline class="${pid}zz" points="${zz.join(" ")}" fill="none" stroke="${rgba(B, 0.6)}" stroke-width="2.5" opacity="0"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}zz",{opacity:0,scaleX:0,transformOrigin:"0% 50%"},{opacity:1,scaleX:1,duration:.7,ease:"power2.out"},${s0(0.7)});`);
    [[0.09, 0.12], [0.91, 0.12]].forEach(([fx, fy]) => {
      const bx2 = Math.round(W * fx), by2 = Math.round(H * fy);
      sv.push(`<g class="${pid}bt" opacity="0"><circle cx="${bx2}" cy="${by2}" r="11" fill="none" stroke="${X0}" stroke-width="3"/><circle cx="${bx2 - 3}" cy="${by2 - 3}" r="1.6" fill="${X0}"/><circle cx="${bx2 + 3}" cy="${by2 - 3}" r="1.6" fill="${X0}"/><circle cx="${bx2 - 3}" cy="${by2 + 3}" r="1.6" fill="${X0}"/><circle cx="${bx2 + 3}" cy="${by2 + 3}" r="1.6" fill="${X0}"/></g>`);
    });
    sc.push(`tl.fromTo("#${id} .${pid}bt",{opacity:0,scale:0,transformOrigin:"50% 50%"},{opacity:1,scale:1,duration:.4,stagger:.15,ease:"back.out(2.2)"},${s0(1.0)});`);
  } else if (framePack === "abyssal-glow") {
    // depth-gauge scale on the left + sonar ping rings + a drifting jellyfish
    const gx3 = Math.round(W * 0.045), gy0 = Math.round(H * 0.14), gy1 = Math.round(H * 0.86);
    sv.push(`<line class="${pid}dg" x1="${gx3}" y1="${gy0}" x2="${gx3}" y2="${gy1}" stroke="${rgba(A, 0.5)}" stroke-width="1.6"/>`);
    for (let i = 0; i <= 6; i++) {
      const yy = Math.round(gy0 + ((gy1 - gy0) * i) / 6);
      sv.push(`<line class="${pid}dg" x1="${gx3}" y1="${yy}" x2="${gx3 + (i % 3 ? 8 : 14)}" y2="${yy}" stroke="${rgba(A, 0.5)}" stroke-width="1.6"/>`);
    }
    dv.push(`<div class="${pid}dr" style="position:absolute;left:${gx3 + 20}px;top:${Math.round(gy0 + ((gy1 - gy0) * (sceneIndex || 0)) / Math.max(1, (sceneCount || 1)))}px;font:600 ${Math.round(H * 0.02)}px/1 ${MONO};letter-spacing:.18em;color:${rgba(A, 0.8)};opacity:0;">-${(3200 + (sceneIndex || 0) * 240)}m</div>`);
    sc.push(`tl.fromTo("#${id} .${pid}dg",{opacity:0},{opacity:1,duration:.7,stagger:.05},${s0(0.3)});`);
    sc.push(`tl.to("#${id} .${pid}dr",{opacity:1,duration:.5},${s0(0.7)});`);
    const px2 = Math.round(W * 0.85), py2 = Math.round(H * 0.24);
    for (let i = 0; i < 3; i++) sv.push(`<circle class="${pid}sr" cx="${px2}" cy="${py2}" r="${12 + i * 16}" fill="none" stroke="${rgba(B, 0.55 - i * 0.14)}" stroke-width="2" opacity="0"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}sr",{opacity:0,scale:.4,transformOrigin:"${px2} ${py2}"},{opacity:1,scale:1,duration:.9,stagger:.18,ease:"sine.out"},${s0(0.6)});`);
    sc.push(`tl.to("#${id} .${pid}sr",{scale:1.25,opacity:.2,duration:1.6,ease:"sine.inOut",yoyo:true,repeat:${reps(1.6)},stagger:.18},${s0(1.6)});`);
    if (kind === "stat" || kind === "cta") {
      const jx = Math.round(W * 0.13), jy = Math.round(H * 0.3), jr = Math.round(H * 0.055);
      const tent = [];
      for (let i = 0; i < 4; i++) tent.push(`<path d="M ${jx - jr * 0.6 + i * jr * 0.4} ${jy + 2} q ${i % 2 ? 6 : -6} ${jr * 0.9} 0 ${jr * 1.7}" fill="none" stroke="${rgba(B, 0.5)}" stroke-width="2"/>`);
      sv.push(`<g class="${pid}jf" opacity="0"><path d="M ${jx - jr} ${jy} a ${jr} ${jr} 0 0 1 ${jr * 2} 0 z" fill="${rgba(B, 0.35)}" stroke="${rgba(B, 0.6)}" stroke-width="2"/>${tent.join("")}</g>`);
      sc.push(`tl.fromTo("#${id} .${pid}jf",{opacity:0,y:26},{opacity:1,y:0,duration:1.0,ease:"sine.out"},${s0(0.8)});`);
      sc.push(`tl.to("#${id} .${pid}jf",{y:-14,scaleY:1.06,transformOrigin:"${jx} ${jy}",duration:1.8,ease:"sine.inOut",yoyo:true,repeat:${reps(1.8)}},${s0(1.8)});`);
    }
  }

  if (!sv.length && !dv.length) return null;
  return { sv, dv, sc };
}

module.exports = { buildEditorialOrnaments, EDITORIAL_PACKS };
