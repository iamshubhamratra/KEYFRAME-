// RETRO TERMINAL ornaments — terminal-amber / terminal-green.
//
// A live CLI session in the margin: REAL character-reveal typing (width
// 0->Nch on a monospace line, "steps(N)" ease so it lands one character at a
// time, exactly like a terminal, not a blur-wipe) with a blinking caret
// (border-right), a rotating "activity" spinner ring on hook/cta, and a
// genuine joining-the-dots line chart on stat/text scenes — the polyline
// draws on and each dot pops in as the line reaches it. A quick CRT
// power-on flicker opens the hook. Everything sits in the right margin; the
// family's textfx keeps headlines left, so this never fights the text.
//
// Called from scene_kit.js's buildSkinOrnaments — kept in its own module so
// this large addition doesn't collide with concurrent edits to scene_kit.js.
// Returns { sv, dv, sc } arrays for the caller to push into its own buffers.

function buildRetroTerminalOrnaments({ kind, id, pid, T, L, seed, theme, dims, s0, rgba, esc }) {
  const W = dims.width, H = dims.height;
  const A = theme.accent, B = theme.accent2;
  const sv = [], dv = [], sc = [];
  const mono = "'JetBrains Mono','IBM Plex Mono',monospace";

  // corner brackets — drawn on, HUD confidence (shared idiom w/ several packs)
  const tbl = Math.round(W * 0.028);
  sv.push(`<path class="${pid}k" d="M${tbl * 2} ${tbl}H${tbl}V${tbl * 2}" fill="none" stroke="${A}" stroke-width="2.5" opacity=".55" stroke-dasharray="170" stroke-dashoffset="170"/>`);
  sv.push(`<path class="${pid}k" d="M${W - tbl * 2} ${H - tbl}H${W - tbl}V${H - tbl * 2}" fill="none" stroke="${B}" stroke-width="2.5" opacity=".55" stroke-dasharray="170" stroke-dashoffset="170"/>`);
  sc.push(`tl.to("#${id} .${pid}k",{strokeDashoffset:0,duration:.6,stagger:.12,ease:"power2.out"},${s0(0.3)});`);

  // CRT power-on flicker — hook only, resolves right before the headline settles.
  if (kind === "hook") {
    dv.push(`<div class="${pid}flk" style="position:absolute;inset:0;background:${theme.ink};opacity:0;"></div>`);
    sc.push(
      `tl.set("#${id} .${pid}flk",{opacity:.8},${s0(0)});` +
      `tl.to("#${id} .${pid}flk",{opacity:0,duration:.05},${s0(0.05)});` +
      `tl.to("#${id} .${pid}flk",{opacity:.35,duration:.04},${s0(0.11)});` +
      `tl.to("#${id} .${pid}flk",{opacity:0,duration:.07},${s0(0.16)});` +
      `tl.to("#${id} .${pid}flk",{opacity:.12,duration:.05},${s0(0.26)});` +
      `tl.to("#${id} .${pid}flk",{opacity:0,duration:.12},${s0(0.32)});`
    );
  }

  // rotating dashed "activity" ring + orbiting node — hook/cta, upper-right margin
  if (kind === "hook" || kind === "cta") {
    const rcx = Math.round(W * 0.86), rcy = Math.round(H * 0.2), rr0 = Math.round(H * 0.085);
    sv.push(`<circle class="${pid}o" cx="${rcx}" cy="${rcy}" r="${rr0}" fill="none" stroke="${rgba(A, 0.55)}" stroke-width="2" stroke-dasharray="3 9"/>`);
    sv.push(`<circle class="${pid}od" cx="${rcx + rr0}" cy="${rcy}" r="4.5" fill="${B}"/>`);
    sc.push(`tl.to("#${id} .${pid}o",{rotation:360,transformOrigin:"${rcx}px ${rcy}px",duration:9,ease:"none",repeat:reps(9)},0);`);
    sc.push(`tl.fromTo("#${id} .${pid}od",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.4,ease:"back.out(2)"},${s0(0.5)});`);
  }

  // joining-the-dots line chart — TEXT only. archStat already owns a big
  // centered progress ring (min(W,H)*0.285, dead center) that reaches into this
  // same upper-right corner, so adding the chart there too just clutters a
  // scene that's already full; archText has genuine empty margin to fill.
  if (kind === "text") {
    const cx0 = Math.round(W * 0.62), cx1 = Math.round(W * 0.9), cy0 = Math.round(H * 0.14), cy1 = Math.round(H * 0.42);
    const frac = [0.34, 0.54, 0.4, 0.66, 0.8, 1.0];
    const n = frac.length;
    for (let g = 1; g < 3; g++) {
      const gy = Math.round(cy0 + (g / 3) * (cy1 - cy0));
      sv.push(`<line x1="${cx0}" y1="${gy}" x2="${cx1}" y2="${gy}" stroke="${rgba(theme.ink, 0.08)}" stroke-width="1"/>`);
    }
    const pts = frac.map((f, i) => ({ x: Math.round(cx0 + (i / (n - 1)) * (cx1 - cx0)), y: Math.round(cy1 - f * (cy1 - cy0)) }));
    sv.push(`<polyline class="${pid}t" points="${pts.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${A}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="700" stroke-dashoffset="700"/>`);
    pts.forEach((p, i) => sv.push(`<circle class="${pid}d${i}" cx="${p.x}" cy="${p.y}" r="${i === n - 1 ? 4.5 : 3}" fill="${i === n - 1 ? B : A}"/>`));
    sc.push(`tl.to("#${id} .${pid}t",{strokeDashoffset:0,duration:1.1,ease:"power1.inOut"},${s0(0.5)});`);
    for (let i = 0; i < n; i++) {
      sc.push(`tl.fromTo("#${id} .${pid}d${i}",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.3,ease:"back.out(2.4)"},${s0(0.5 + (1.1 * (i + 1)) / n)});`);
    }
    dv.push(`<div class="${pid}lbl" style="position:absolute;left:${cx0}px;top:${cy1 + 10}px;opacity:0;font:600 ${Math.round(H * 0.018)}px/1 ${mono};letter-spacing:.08em;color:${rgba(theme.ink, 0.55)};">req/s <span id="${pid}cnt" style="color:${A};font-weight:700;">0</span></div>`);
    sc.push(`tl.fromTo("#${id} .${pid}lbl",{opacity:0,y:6},{opacity:1,y:0,duration:.4},${s0(0.5)});`);
    sc.push(`countUp("${pid}cnt",${128 + (seed % 60)},${s0(0.6)},1.0,function(v){return v;});`);
  }

  // the terminal window — a REAL typed CLI session, bottom-right margin, every
  // scene. Typing is a width 0->Nch reveal with a steps() ease (discrete
  // per-character reveal, not a smooth wipe) + a border-right caret that's
  // solid while its line types, then hands off to the next line; the LAST
  // line's caret keeps blinking for the rest of the scene.
  {
    const winW = kind === "cta" ? 30 : 34, winH = kind === "cta" ? 24 : 30;
    const winRight = 5, winBottom = kind === "cta" ? 8 : 6;
    const lines = kind === "hook" ? ["$ ./deploy.sh", "Building… done", "✓ Live in production"]
      : kind === "cta" ? ["$ install now", "Fetching package…", "✓ Installed. Welcome!"]
        : kind === "stat" ? ["$ status --uptime", "uptime 99.98%", "✓ Healthy"]
          : ["$ run --tests", "128 passed · 0 failed", "✓ All systems go"];
    const lineColors = [theme.ink, rgba(theme.ink, 0.62), A];
    const fs = Math.max(11, Math.round(H * 0.021));
    dv.push(
      `<div class="${pid}win" style="position:absolute;right:${winRight}%;bottom:${winBottom}%;width:${winW}%;height:${winH}%;border-radius:10px;background:${rgba("#0A0C10", 0.85)};border:1px solid ${rgba(theme.ink, 0.14)};box-shadow:0 ${Math.round(H * 0.02)}px ${Math.round(H * 0.05)}px rgba(0,0,0,.5);overflow:hidden;opacity:0;">` +
      `<div style="height:22%;min-height:20px;display:flex;align-items:center;gap:6px;padding:0 10px;background:rgba(0,0,0,.35);border-bottom:1px solid ${rgba(theme.ink, 0.12)};">` +
      `<span style="width:8px;height:8px;border-radius:50%;background:#FF5F57;"></span>` +
      `<span style="width:8px;height:8px;border-radius:50%;background:#FEBC2E;"></span>` +
      `<span style="width:8px;height:8px;border-radius:50%;background:#28C840;"></span>` +
      `<span style="margin-left:6px;font:600 10px/1 ${mono};color:${rgba(theme.ink, 0.4)};letter-spacing:.04em;">~/deploy</span>` +
      `</div>` +
      `<div style="padding:12px 14px;display:flex;flex-direction:column;gap:7px;">` +
      lines.map((ln, i) => `<div class="${pid}tl${i}" style="white-space:nowrap;overflow:hidden;width:0ch;max-width:100%;border-right:2px solid transparent;font:500 ${fs}px/1.3 ${mono};color:${lineColors[i]};">${esc(ln)}</div>`).join("") +
      `</div></div>`
    );
    sc.push(`tl.fromTo("#${id} .${pid}win",{opacity:0,y:16},{opacity:1,y:0,duration:.5,ease:"power2.out"},${s0(0.3)});`);
    let cursor = 0.5;
    lines.forEach((ln, i) => {
      const len = ln.length;
      const dur = Math.max(0.3, Math.min(0.9, len * 0.045));
      sc.push(`tl.set("#${id} .${pid}tl${i}",{borderRightColor:"${A}"},${s0(cursor)});`);
      sc.push(`tl.to("#${id} .${pid}tl${i}",{width:"${len}ch",duration:${dur.toFixed(2)},ease:"steps(${Math.max(4, Math.min(len, 24))})"},${s0(cursor)});`);
      cursor += dur + 0.12;
      if (i < lines.length - 1) {
        sc.push(`tl.set("#${id} .${pid}tl${i}",{borderRightColor:"transparent"},${s0(cursor - 0.02)});`);
      } else {
        const blinkFor = Math.max(0.6, L - cursor - 0.2);
        sc.push(`tl.to("#${id} .${pid}tl${i}",{borderRightColor:"transparent",duration:.5,ease:"steps(1)",yoyo:true,repeat:${Math.max(1, Math.round(blinkFor / 0.5))}},${s0(cursor)});`);
      }
    });
  }

  return { sv, dv, sc };
}

module.exports = { buildRetroTerminalOrnaments };
