// SKETCHNOTE ornaments — a hand-drawn doodle journal, fully animated. Every
// vector here is hand-authored ink: washi tape, sparkle stars, a corner spiral,
// ink splats and red margin ticks on EVERY scene; then per-beat set pieces — a
// lightbulb with blinking rays + a paper plane on a dashed swoop (hook), a
// wobbly hand-drawn rising graph with X-mark nodes + a bullseye (stat/proof), a
// hand-drawn checklist with scribbled checkmarks + a steaming coffee cup (text),
// and party bunting + a double pen-scribble circling the headline + curly
// arrows (cta). Everything draws itself on (stroke-dashoffset), pops in
// (back.out) or loops (twinkle / blink / sway / steam) — nothing sits still.
//
// SVG-transform gotcha (see memory): GSAP tweens on transform props CLOBBER a
// static `transform` attribute — so elements that keep a static transform are
// only ever tweened on non-transform props (dashoffset/opacity), and anything
// that rotates does it via svgOrigin (user-space), never a px transformOrigin.

function buildSketchnoteOrnaments({ kind, id, pid, T, L, seed, theme, dims, s0, rgba }) {
  const W = dims.width, H = dims.height;
  const A = theme.accent;                                // red pen
  const B = theme.accent2 || A;                          // highlighter yellow
  const X0 = (theme.extras && theme.extras[0]) || A;     // blue pen
  const X1 = (theme.extras && theme.extras[1]) || X0;    // green pen
  const INK = theme.ink;
  const sv = [], dv = [], sc = [];
  const pt = (x, y) => `${Math.round(x)},${Math.round(y)}`;
  const loops = (dur, lead) => Math.max(1, Math.floor((L - lead) / dur));

  // 4-point sparkle star path (hand-drawn twinkle)
  const spark = (cx, cy, s) =>
    `M${pt(cx, cy - s)} L${pt(cx + s * 0.28, cy - s * 0.28)} L${pt(cx + s, cy)} L${pt(cx + s * 0.28, cy + s * 0.28)} ` +
    `L${pt(cx, cy + s)} L${pt(cx - s * 0.28, cy + s * 0.28)} L${pt(cx - s, cy)} L${pt(cx - s * 0.28, cy - s * 0.28)} Z`;
  // wobbly horizontal squiggle (fake handwriting line)
  const squig = (x, y, w, amp = 5) => {
    const seg = Math.max(3, Math.round(w / 26));
    let d = `M${pt(x, y)}`;
    for (let i = 0; i < seg; i++) d += ` q ${Math.round(w / seg / 2)} ${i % 2 ? amp : -amp} ${Math.round(w / seg)} 0`;
    return d;
  };

  // ---- EVERY SCENE: the journal furniture -------------------------------------
  // washi-tape strips (DOM divs — CSS rotation survives GSAP scale tweens)
  const tapes = [[10, 5, -7, B], [78, 4, 6, X0]];
  tapes.forEach(([lx, ty, rot, c]) => {
    dv.push(`<div class="${pid}tp" style="position:absolute;left:${lx}%;top:${ty}%;width:${Math.round(W * 0.085)}px;height:${Math.round(H * 0.032)}px;transform:rotate(${rot}deg);background:${rgba(c, 0.4)};border:1.5px dashed ${rgba(INK, 0.28)};"></div>`);
  });
  sc.push(`tl.fromTo("#${id} .${pid}tp",{opacity:0,scale:1.6},{opacity:1,scale:1,duration:.45,stagger:.12,ease:"power3.out"},${s0(0.15)});`);
  // sparkle stars — pop, then twinkle forever
  const starSpots = kind === "cta" ? [[0.09, 0.32], [0.93, 0.28], [0.08, 0.72]] : [[0.09, 0.2], [0.94, 0.16], [0.92, 0.86]];
  starSpots.forEach(([fx, fy], i) => {
    sv.push(`<path class="${pid}st" d="${spark(W * fx, H * fy, 13 + (i % 2) * 5)}" fill="${[A, X0, X1][i % 3]}"/>`);
  });
  sc.push(`tl.fromTo("#${id} .${pid}st",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.4,stagger:.1,ease:"back.out(2.6)"},${s0(0.4)});`);
  sc.push(`tl.to("#${id} .${pid}st",{scale:1.35,transformOrigin:"50% 50%",duration:.8,ease:"sine.inOut",yoyo:true,repeat:${loops(0.8, 1.2)},stagger:.2},${s0(1.2)});`);
  // corner spiral doodle (draws itself)
  const spx = Math.round(W * (kind === "text" ? 0.9 : 0.06)), spy = Math.round(H * 0.9);
  sv.push(`<g transform="translate(${spx},${spy})"><path class="${pid}sp" d="M0 0 c 16 -20 40 -10 30 9 c -8 15 -30 9 -25 -5 c 4 -10 16 -9 16 0 c 0 6 -8 7 -10 2" fill="none" stroke="${X0}" stroke-width="3" stroke-linecap="round" stroke-dasharray="160" stroke-dashoffset="160"/></g>`);
  sc.push(`tl.to("#${id} .${pid}sp",{strokeDashoffset:0,duration:.9,ease:"power1.inOut"},${s0(0.7)});`);
  // ink splat cluster
  const spl = kind === "hook" ? [0.62, 0.14] : [0.13, 0.13];
  sv.push(`<circle class="${pid}ik" cx="${Math.round(W * spl[0])}" cy="${Math.round(H * spl[1])}" r="9" fill="${INK}"/>`);
  [[18, -6, 3.5], [26, 5, 2.5], [12, 14, 2]].forEach(([dx, dy, r2]) =>
    sv.push(`<circle class="${pid}ik" cx="${Math.round(W * spl[0] + dx)}" cy="${Math.round(H * spl[1] + dy)}" r="${r2}" fill="${INK}"/>`));
  sc.push(`tl.fromTo("#${id} .${pid}ik",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.35,stagger:.05,ease:"back.out(3)"},${s0(0.55)});`);
  // red margin ticks (the teacher's pen)
  for (let i = 0; i < 3; i++) {
    const ty = Math.round(H * (0.3 + i * 0.18));
    sv.push(`<path class="${pid}mt" d="${squig(Math.round(W * 0.028), ty, 30, 3)}" fill="none" stroke="${A}" stroke-width="3" stroke-linecap="round" stroke-dasharray="46" stroke-dashoffset="46"/>`);
  }
  sc.push(`tl.to("#${id} .${pid}mt",{strokeDashoffset:0,duration:.4,stagger:.15,ease:"power2.out"},${s0(0.9)});`);

  // ---- HOOK: lightbulb (the idea!) + paper plane on a dashed swoop -------------
  if (kind === "hook") {
    const bx = Math.round(W * 0.76), by = Math.round(H * 0.3), br = Math.round(H * 0.075);
    const bulb = [];
    bulb.push(`<circle cx="${bx}" cy="${by}" r="${br}" fill="${rgba(B, 0.35)}" stroke="${INK}" stroke-width="4"/>`);
    bulb.push(`<path d="M${pt(bx - br * 0.34, by + br * 0.9)} l ${Math.round(br * 0.68)} 0 M${pt(bx - br * 0.26, by + br * 1.14)} l ${Math.round(br * 0.52)} 0" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/>`);
    bulb.push(`<path d="M${pt(bx - br * 0.3, by + br * 0.2)} l 8 -12 l 8 12 l 8 -12" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`);
    sv.push(`<g class="${pid}bl">${bulb.join("")}</g>`);
    for (let i = 0; i < 6; i++) {
      const ang = -Math.PI / 2 + (i - 2.5) * 0.45;
      const x1 = bx + Math.cos(ang) * br * 1.35, y1 = by + Math.sin(ang) * br * 1.35;
      const x2 = bx + Math.cos(ang) * br * 1.9, y2 = by + Math.sin(ang) * br * 1.9;
      sv.push(`<line class="${pid}ry" x1="${Math.round(x1)}" y1="${Math.round(y1)}" x2="${Math.round(x2)}" y2="${Math.round(y2)}" stroke="${A}" stroke-width="4" stroke-linecap="round" stroke-dasharray="40" stroke-dashoffset="40"/>`);
    }
    sc.push(`tl.fromTo("#${id} .${pid}bl",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.6,ease:"back.out(2)"},${s0(0.5)});`);
    sc.push(`tl.to("#${id} .${pid}ry",{strokeDashoffset:0,duration:.35,stagger:.06,ease:"power2.out"},${s0(1.0)});`);
    sc.push(`tl.to("#${id} .${pid}ry",{opacity:.2,duration:.55,yoyo:true,repeat:${loops(0.55, 1.6)},stagger:.05},${s0(1.6)});`);
    // dashed swoop + paper plane flying along it
    const px0 = Math.round(W * 0.34), py0 = Math.round(H * 0.86), px1 = Math.round(W * 0.66), py1 = Math.round(H * 0.62);
    sv.push(`<path class="${pid}fp" d="M${pt(px0, py0)} Q ${pt(W * 0.52, H * 0.9)} ${pt(px1, py1)}" fill="none" stroke="${rgba(X0, 0.6)}" stroke-width="3" stroke-dasharray="10 12" opacity="0"/>`);
    sv.push(`<g class="${pid}pl"><path d="M0 12 L38 0 L16 14 L20 26 Z" fill="${rgba(X0, 0.85)}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M16 14 L38 0" stroke="${INK}" stroke-width="2" fill="none"/></g>`);
    sc.push(`tl.to("#${id} .${pid}fp",{opacity:1,duration:.4},${s0(0.8)});`);
    sc.push(`tl.set("#${id} .${pid}pl",{x:${px0 - 20},y:${py0 - 10},rotation:-14},0);`);
    sc.push(`tl.to("#${id} .${pid}pl",{x:${px1 - 20},y:${py1 - 14},rotation:8,duration:1.6,ease:"power1.inOut"},${s0(0.9)});`);
    sc.push(`tl.to("#${id} .${pid}pl",{y:"-=9",duration:.9,ease:"sine.inOut",yoyo:true,repeat:${loops(0.9, 2.6)}},${s0(2.5)});`);
  }

  // ---- STAT/PROOF: hand-drawn rising graph + bullseye --------------------------
  if (kind === "stat") {
    const gx0 = Math.round(W * 0.17), gx1 = Math.round(W * 0.85), gy = Math.round(H * 0.85), top = Math.round(H * 0.6);
    sv.push(`<path class="${pid}ax" d="${squig(gx0 - 14, gy, gx1 - gx0 + 28, 2)}" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="1600" stroke-dashoffset="1600"/>`);
    sv.push(`<path class="${pid}ax" d="M${pt(gx0, gy + 6)} L${pt(gx0 + 3, top - 16)}" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="400" stroke-dashoffset="400"/>`);
    const fr = [0.12, 0.42, 0.3, 0.66, 0.95], P = fr.map((f, i) => ({
      x: Math.round(gx0 + (gx1 - gx0) * (i + 0.5) / fr.length),
      y: Math.round(gy - (gy - top) * f) + ((i % 2) ? 4 : -4),
    }));
    P.forEach((p) => {
      sv.push(`<path class="${pid}xm" d="M${pt(p.x - 9, p.y - 9)} L${pt(p.x + 9, p.y + 9)} M${pt(p.x + 9, p.y - 9)} L${pt(p.x - 9, p.y + 9)}" stroke="${X0}" stroke-width="4.5" stroke-linecap="round" fill="none"/>`);
    });
    sv.push(`<polyline class="${pid}gl" points="${P.map((p) => pt(p.x, p.y)).join(" ")}" fill="none" stroke="${A}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1600" stroke-dashoffset="1600"/>`);
    const last = P[P.length - 1];
    sv.push(`<path class="${pid}ah" d="M${pt(last.x - 18, last.y - 2)} L${pt(last.x + 2, last.y - 8)} L${pt(last.x - 8, last.y + 14)}" fill="none" stroke="${A}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`);
    sc.push(`tl.to("#${id} .${pid}ax",{strokeDashoffset:0,duration:.8,stagger:.2,ease:"power1.inOut"},${s0(0.4)});`);
    sc.push(`tl.fromTo("#${id} .${pid}xm",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.35,stagger:.13,ease:"back.out(2.8)"},${s0(0.9)});`);
    sc.push(`tl.to("#${id} .${pid}gl",{strokeDashoffset:0,duration:1.2,ease:"power1.inOut"},${s0(1.3)});`);
    sc.push(`tl.fromTo("#${id} .${pid}ah",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.4,ease:"back.out(3)"},${s0(2.4)});`);
    // bullseye, top-right — rings pop, center pulses
    const tx = Math.round(W * 0.86), ty2 = Math.round(H * 0.2);
    [[34, A], [22, INK], [11, A]].forEach(([r2, c]) =>
      sv.push(`<circle class="${pid}tg" cx="${tx}" cy="${ty2}" r="${r2}" fill="none" stroke="${c}" stroke-width="4"/>`));
    sv.push(`<circle class="${pid}tc" cx="${tx}" cy="${ty2}" r="5" fill="${A}"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}tg",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.4,stagger:.1,ease:"back.out(2)"},${s0(0.6)});`);
    sc.push(`tl.fromTo("#${id} .${pid}tc",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.3,ease:"back.out(3)"},${s0(1.0)});`);
    sc.push(`tl.to("#${id} .${pid}tc",{scale:1.6,transformOrigin:"50% 50%",duration:.7,yoyo:true,repeat:${loops(0.7, 1.4)},ease:"sine.inOut"},${s0(1.4)});`);
  }

  // ---- TEXT/FEATURE: hand-drawn checklist + steaming coffee cup ----------------
  if (kind === "text") {
    const cx0 = Math.round(W * 0.62), rw = Math.round(W * 0.27), rh = Math.round(H * 0.085);
    for (let i = 0; i < 3; i++) {
      const ry = Math.round(H * 0.3 + i * rh * 1.5);
      const bs = Math.round(rh * 0.62);
      // hand-drawn checkbox: slightly crooked square path
      sv.push(`<path class="${pid}cb" d="M${pt(cx0, ry)} l ${bs} ${i % 2 ? 3 : -3} l ${i % 2 ? -2 : 3} ${bs} l ${-bs} ${i % 2 ? 2 : 3} z" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round" stroke-dasharray="200" stroke-dashoffset="200"/>`);
      // scribbled red checkmark
      sv.push(`<path class="${pid}ck" d="M${pt(cx0 + bs * 0.2, ry + bs * 0.55)} l ${Math.round(bs * 0.25)} ${Math.round(bs * 0.3)} l ${Math.round(bs * 0.55)} ${-Math.round(bs * 0.75)}" fill="none" stroke="${A}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="70" stroke-dashoffset="70"/>`);
      // squiggle handwriting lines
      sv.push(`<path class="${pid}hl" d="${squig(cx0 + bs + 18, ry + Math.round(bs * 0.35), rw - bs - 30, 4)}" fill="none" stroke="${rgba(INK, 0.5)}" stroke-width="3" stroke-linecap="round" stroke-dasharray="500" stroke-dashoffset="500"/>`);
      sv.push(`<path class="${pid}hl" d="${squig(cx0 + bs + 18, ry + Math.round(bs * 0.75), (rw - bs - 30) * 0.66, 4)}" fill="none" stroke="${rgba(INK, 0.32)}" stroke-width="3" stroke-linecap="round" stroke-dasharray="400" stroke-dashoffset="400"/>`);
    }
    sc.push(`tl.to("#${id} .${pid}cb",{strokeDashoffset:0,duration:.5,stagger:.22,ease:"power1.inOut"},${s0(0.4)});`);
    sc.push(`tl.to("#${id} .${pid}hl",{strokeDashoffset:0,duration:.6,stagger:.11,ease:"power1.out"},${s0(0.7)});`);
    sc.push(`tl.to("#${id} .${pid}ck",{strokeDashoffset:0,duration:.35,stagger:.3,ease:"power2.out"},${s0(1.3)});`);
    // coffee cup, lower-right — pops, steam squiggles rise forever
    const cupx = Math.round(W * 0.78), cupy = Math.round(H * 0.8), cw = Math.round(W * 0.045);
    const cup = [];
    cup.push(`<path d="M${pt(cupx, cupy)} l ${cw} 0 l ${-Math.round(cw * 0.12)} ${Math.round(cw * 0.62)} l ${-Math.round(cw * 0.76)} 0 z" fill="${rgba(B, 0.4)}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`);
    cup.push(`<path d="M${pt(cupx + cw, cupy + 6)} c 18 -4 18 18 -2 16" fill="none" stroke="${INK}" stroke-width="3.5"/>`);
    cup.push(`<path d="${squig(cupx - 12, cupy + Math.round(cw * 0.78), cw + 24, 2)}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`);
    sv.push(`<g class="${pid}cp">${cup.join("")}</g>`);
    for (let i = 0; i < 2; i++) {
      sv.push(`<path class="${pid}sm" d="M${pt(cupx + 10 + i * 16, cupy - 8)} q 5 -8 0 -16 q -5 -8 0 -16" fill="none" stroke="${rgba(INK, 0.55)}" stroke-width="3" stroke-linecap="round" opacity="0"/>`);
    }
    sc.push(`tl.fromTo("#${id} .${pid}cp",{scale:0,transformOrigin:"50% 100%"},{scale:1,duration:.5,ease:"back.out(2)"},${s0(0.8)});`);
    sc.push(`tl.fromTo("#${id} .${pid}sm",{opacity:0,y:10},{opacity:.7,y:-12,duration:1.4,stagger:.45,repeat:${loops(1.4, 1.6)},ease:"sine.out"},${s0(1.4)});`);
  }

  // ---- CTA: bunting + pen-scribble circle around the headline + curly arrows ---
  if (kind === "cta") {
    // party bunting across the top (string draws, flags pop, group sways)
    const bx0 = Math.round(W * 0.12), bx1 = Math.round(W * 0.88), by = Math.round(H * 0.06), sag = Math.round(H * 0.07);
    sv.push(`<path class="${pid}bs" d="M${pt(bx0, by)} Q ${pt(W * 0.5, by + sag * 2)} ${pt(bx1, by)}" fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="1700" stroke-dashoffset="1700"/>`);
    const flags = [];
    const FC = [A, X0, X1, B];
    for (let i = 0; i < 7; i++) {
      const ft = (i + 0.5) / 7;
      const fx2 = bx0 + (bx1 - bx0) * ft;
      const fy = by + Math.sin(Math.PI * ft) * sag * 1.02 + 2;
      flags.push(`<path class="${pid}bf" d="M${pt(fx2 - 15, fy)} L${pt(fx2 + 15, fy)} L${pt(fx2, fy + 32)} Z" fill="${FC[i % 4]}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`);
    }
    sv.push(`<g class="${pid}bg2">${flags.join("")}</g>`);
    sc.push(`tl.to("#${id} .${pid}bs",{strokeDashoffset:0,duration:.9,ease:"power1.inOut"},${s0(0.3)});`);
    sc.push(`tl.fromTo("#${id} .${pid}bf",{scale:0,transformOrigin:"50% 0%"},{scale:1,duration:.4,stagger:.07,ease:"back.out(2.4)"},${s0(0.8)});`);
    sc.push(`tl.to("#${id} .${pid}bg2",{rotation:1.6,svgOrigin:"${Math.round(W * 0.5)} ${by}",duration:1.4,yoyo:true,repeat:${loops(1.4, 1.6)},ease:"sine.inOut"},${s0(1.6)});`);
    // double pen-scribble ellipse circling the headline (two passes, like a real pen)
    const ex = Math.round(W * 0.5), ey = Math.round(H * 0.45), rx = Math.round(W * 0.27), ry2 = Math.round(H * 0.135);
    const peri = Math.round(Math.PI * (3 * (rx + ry2) - Math.sqrt((3 * rx + ry2) * (rx + 3 * ry2))));
    sv.push(`<ellipse class="${pid}el" cx="${ex}" cy="${ey}" rx="${rx}" ry="${ry2}" fill="none" stroke="${A}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${peri}" stroke-dashoffset="${peri}" transform="rotate(-2 ${ex} ${ey})"/>`);
    sv.push(`<ellipse class="${pid}el" cx="${ex}" cy="${ey + 6}" rx="${rx + 10}" ry="${ry2 + 5}" fill="none" stroke="${rgba(A, 0.55)}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${peri + 60}" stroke-dashoffset="${peri + 60}" transform="rotate(1.5 ${ex} ${ey})"/>`);
    sc.push(`tl.to("#${id} .${pid}el",{strokeDashoffset:0,duration:1.0,stagger:.35,ease:"power1.inOut"},${s0(0.9)});`);
    // curly doodle arrows from the corners pointing at the CTA
    const arr = (x0, y0, x1c, y1c, x2, y2) =>
      `M${pt(x0, y0)} q ${Math.round(x1c)} ${Math.round(y1c)} ${Math.round(x2)} ${Math.round(y2)}`;
    sv.push(`<path class="${pid}ar" d="${arr(W * 0.14, H * 0.82, W * 0.1, -H * 0.14, W * 0.22, -H * 0.16)}" fill="none" stroke="${X1}" stroke-width="4" stroke-linecap="round" stroke-dasharray="600" stroke-dashoffset="600"/>`);
    sv.push(`<path class="${pid}ar" d="${arr(W * 0.86, H * 0.84, -W * 0.08, -H * 0.16, -W * 0.2, -H * 0.18)}" fill="none" stroke="${X0}" stroke-width="4" stroke-linecap="round" stroke-dasharray="600" stroke-dashoffset="600"/>`);
    sv.push(`<path class="${pid}ah" d="M${pt(W * 0.36 - 16, H * 0.66 + 2)} L${pt(W * 0.36, H * 0.66)} L${pt(W * 0.36 - 8, H * 0.66 + 15)}" fill="none" stroke="${X1}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`);
    sv.push(`<path class="${pid}ah" d="M${pt(W * 0.66 + 16, H * 0.66 + 2)} L${pt(W * 0.66, H * 0.66)} L${pt(W * 0.66 + 8, H * 0.66 + 15)}" fill="none" stroke="${X0}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`);
    sc.push(`tl.to("#${id} .${pid}ar",{strokeDashoffset:0,duration:.8,stagger:.2,ease:"power1.inOut"},${s0(0.6)});`);
    sc.push(`tl.fromTo("#${id} .${pid}ah",{scale:0,transformOrigin:"50% 50%"},{scale:1,duration:.35,stagger:.2,ease:"back.out(3)"},${s0(1.4)});`);
  }

  return { sv, dv, sc };
}

module.exports = { buildSketchnoteOrnaments };
