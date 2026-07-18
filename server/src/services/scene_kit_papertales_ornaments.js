// PAPER TALES ornaments — the pack's FRAME.md atoms, TOPIC-DRIVEN.
//
// The showcase reference (frames/paper-tales/) is a pop-up storybook: chapter
// tabs hang from the page top, a pen HANDWRITES the asides in Caveat, pop-ups
// fold UP from the page crease with a cast shadow, paper-cutout friends blink,
// watercolor blooms soak in with multiply blending, and the finale drops a
// swinging ribbon bookmark and torn-paper confetti. This module implements
// those atoms as scene furniture and fills them with the STORYBOARD's own
// copy — the hook's pen writes the film's actual title, the chapter tabs
// count the film's own chapters, the washi strips carry each scene's emphasis
// word — so a bakery film and a SaaS film read as different storybooks, not
// the same demo re-colored.
//
// Design constants come from FRAME.md (bedtime pastels; ink is dusty plum;
// chapters own ONE accent each). Motion settles like paper — soft back.out
// overshoot, no blur storms — and every tween is timeline-anchored via s0()
// so seeking replays identically. Loops are finite (sreps/computed repeats).
//
// Called from scene_kit.js buildSkinOrnaments; returns { sv, dv, sc }.

const PAPER = "#FFF9F0";
const INK = "#6B5B73";
const SOFT = "#A08D97";
const ROSE = "#E8938C";
const BUTTER = "#F7C873";
const SKY = "#9CCFE8";
const MINT = "#9CCEA4";
const LILAC = "#C5AEDD";
const HAND = "'Caveat','Segoe Script','Bradley Hand',cursive";

// One accent per chapter (FRAME.md: "chapters own one color each").
const CHAPTER = [ROSE, SKY, MINT, LILAC, BUTTER];
const CH_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

// Clamp on a WORD boundary (a tab reading "12,000 KITCHEN" looks like a
// misprint). Whenever the clamped text contains a space we cut there — a
// shorter whole word always beats a truncated one; only a single unbroken
// word gets the hard cut.
const clampWords = (s, n) => {
  const t = String(s || "").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut).trim();
};

// A 4-point paper sparkle at (x,y), size s — the showcase's cover-sun glints.
const sparklePath = (x, y, s) =>
  `M${x} ${y - s} L${x + s * 0.28} ${y - s * 0.28} L${x + s} ${y} L${x + s * 0.28} ${y + s * 0.28} ` +
  `L${x} ${y + s} L${x - s * 0.28} ${y + s * 0.28} L${x - s} ${y} L${x - s * 0.28} ${y - s * 0.28} Z`;

function buildPapertalesOrnaments({ kind, id, pid, T, L, seed, theme, dims, s0, rgba, esc, scene, sceneIndex = 0, sceneCount = 5, sbTitle = "" }) {
  const W = dims.width, H = dims.height;
  const sv = [], dv = [], sc = [];
  const s = scene || {};
  const sd = (seed + sceneIndex * 11) >>> 0;
  const M = Math.min(W, H); // scale base that works for 16:9, 9:16 and 1:1
  const r2 = (v) => Math.round(v * 100) / 100;
  const quicksand = theme.displayStack || "'Quicksand',sans-serif";
  const accent = CHAPTER[sceneIndex % CHAPTER.length];
  const accent2 = CHAPTER[(sceneIndex + 1) % CHAPTER.length];

  // ---- CHAPTER TAB (every scene) — hangs from the page top, one accent per
  // chapter, drops in with a paper-soft overshoot. Hook reads as the cover
  // ("once upon a time"), the CTA as the last page ("the end"); middle scenes
  // count the film's own chapters.
  {
    const label = kind === "hook" ? "once upon a time"
      : kind === "cta" ? "the end"
      : `chapter ${CH_WORDS[Math.min(Math.max(0, sceneIndex - 1), CH_WORDS.length - 1)]}`;
    const tabFs = Math.round(M * 0.017);
    const dark = accent === BUTTER; // butter tab needs dark lettering (showcase rule)
    dv.push(
      `<div class="${pid}tab" style="position:absolute;left:${Math.round(W * 0.055)}px;top:0;padding:${Math.round(M * 0.016)}px ${Math.round(M * 0.026)}px ${Math.round(M * 0.011)}px;border-radius:0 0 ${Math.round(M * 0.012)}px ${Math.round(M * 0.012)}px;background:${accent};color:${dark ? "#7A5B23" : "#FFFFFF"};font:700 ${tabFs}px/1 ${quicksand};letter-spacing:.24em;text-transform:uppercase;box-shadow:0 ${Math.round(M * 0.006)}px ${Math.round(M * 0.016)}px ${rgba(INK, 0.18)};opacity:0;">${esc(label)}</div>`
    );
    sc.push(`tl.fromTo("#${id} .${pid}tab",{opacity:0,yPercent:-110},{opacity:1,yPercent:0,duration:.55,ease:"back.out(1.6)"},${s0(0.35)});`);
  }

  // ---- WATERCOLOR BLOOMS (every scene) — soak into the margins with multiply
  // blending, chapter-accented, kept off the center where content lives.
  {
    const corner = (sd % 2) === 0;
    const blobs = [
      { x: corner ? 0.06 : 0.72, y: 0.14, w: 0.22, h: 0.2, c: accent },
      { x: corner ? 0.74 : 0.04, y: 0.72, w: 0.2, h: 0.18, c: accent2 },
    ];
    blobs.forEach((b, i) => {
      dv.push(
        `<div class="${pid}wc" style="position:absolute;left:${Math.round(W * b.x)}px;top:${Math.round(H * b.y)}px;width:${Math.round(W * b.w)}px;height:${Math.round(H * b.h)}px;border-radius:50%;filter:blur(${Math.round(M * 0.008)}px);mix-blend-mode:multiply;background:radial-gradient(50% 50% at 50% 50%, ${rgba(b.c, 0.34)}, transparent 70%);opacity:0;"></div>`
      );
    });
    sc.push(`tl.fromTo("#${id} .${pid}wc",{opacity:0,scale:.35},{opacity:.85,scale:1,duration:1.2,stagger:.3,ease:"power2.out"},${s0(0.4)});`);
    sc.push(`tl.to("#${id} .${pid}wc",{x:${(sd % 2) ? 12 : -12},y:-8,duration:${r2(Math.max(2, L - 1.6))},ease:"sine.inOut"},${s0(1.6)});`);
  }

  // ---- PEN HANDWRITING (hook + cta) — the pack's signature: a Caveat aside
  // unclips left→right while a pen nib travels the span with tiny bobbing
  // strokes. The hook's pen writes the FILM'S OWN TITLE onto the cover.
  if (kind === "hook" || kind === "cta") {
    const note = kind === "hook"
      ? (clampWords(sbTitle || s.emphasis || "", 30) || "a little story") + "…"
      : "the end — or the beginning ✎";
    const noteFs = Math.round(M * 0.052);
    const noteW = Math.round(note.length * noteFs * 0.36) + Math.round(M * 0.02);
    const nx = Math.round(W * 0.055), ny = Math.round(H * (kind === "hook" ? 0.855 : 0.84));
    const penS = Math.round(M * 0.05);
    dv.push(
      `<div style="position:absolute;left:${nx}px;top:${ny}px;">` +
      `<span class="${pid}pnc" style="display:inline-block;clip-path:inset(0 100% 0 0);font:600 ${noteFs}px/1.15 ${HAND};color:${INK};white-space:nowrap;">${esc(note)}</span>` +
      `<svg class="${pid}pen" viewBox="0 0 48 48" style="position:absolute;left:0;top:${-Math.round(noteFs * 0.62)}px;width:${penS}px;height:${penS}px;opacity:0;"><g transform="rotate(38 24 24)"><rect x="19" y="2" width="10" height="26" rx="3" fill="${accent}"/><path d="M19 28 H29 L24 42 Z" fill="${BUTTER}"/><path d="M22.6 37 L24 42 L25.4 37 Z" fill="${INK}"/></g></svg>` +
      `</div>`
    );
    const wd = r2(Math.min(2.0, Math.max(1.2, L * 0.32)));
    const at = r2(kind === "hook" ? 1.1 : 1.4);
    sc.push(`tl.fromTo("#${id} .${pid}pnc",{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0% 0 0)",duration:${wd},ease:"none"},${s0(at)});`);
    sc.push(`tl.fromTo("#${id} .${pid}pen",{opacity:0},{opacity:1,duration:.15},${s0(at)});`);
    sc.push(`tl.fromTo("#${id} .${pid}pen",{x:0},{x:${noteW},duration:${wd},ease:"none"},${s0(at)});`);
    sc.push(`tl.to("#${id} .${pid}pen",{y:-3,duration:${r2(wd / 8)},yoyo:true,repeat:7,ease:"sine.inOut"},${s0(at)});`);
    sc.push(`tl.to("#${id} .${pid}pen",{opacity:0,y:-12,duration:.3,ease:"power2.in"},${s0(at + wd + 0.05)});`);
  }

  // ---- PAPER SUN (hook) — the cover's smiling cutout sun, top corner, rays
  // easing through a slow arc (svgOrigin, not px transformOrigin — SVG gotcha).
  if (kind === "hook") {
    const scx = Math.round(W * 0.885), scy = Math.round(H * 0.17), sr = Math.round(M * 0.052);
    const rays = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x1 = scx + Math.sin(a) * sr * 1.25, y1 = scy - Math.cos(a) * sr * 1.25;
      const x2 = scx + Math.sin(a) * sr * 1.8, y2 = scy - Math.cos(a) * sr * 1.8;
      rays.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${BUTTER}" stroke-width="${Math.max(3, Math.round(sr * 0.16))}" stroke-linecap="round"/>`);
    }
    sv.push(
      `<g class="${pid}sun" opacity="0"><g class="${pid}rays">${rays.join("")}</g>` +
      `<circle cx="${scx}" cy="${scy}" r="${sr}" fill="#FFD98E" stroke="#F5B95A" stroke-width="${Math.max(2, Math.round(sr * 0.09))}"/>` +
      `<circle cx="${scx - sr * 0.32}" cy="${scy - sr * 0.12}" r="${Math.max(2, sr * 0.1).toFixed(1)}" fill="#8A6D3B"/>` +
      `<circle cx="${scx + sr * 0.32}" cy="${scy - sr * 0.12}" r="${Math.max(2, sr * 0.1).toFixed(1)}" fill="#8A6D3B"/>` +
      `<path d="M${scx - sr * 0.3} ${scy + sr * 0.22} Q${scx} ${scy + sr * 0.48} ${scx + sr * 0.3} ${scy + sr * 0.22}" fill="none" stroke="#8A6D3B" stroke-width="${Math.max(2, Math.round(sr * 0.08))}" stroke-linecap="round"/></g>`
    );
    sc.push(`tl.fromTo("#${id} .${pid}sun",{opacity:0,scale:.4,rotation:-30,svgOrigin:"${scx} ${scy}"},{opacity:1,scale:1,rotation:0,duration:.8,ease:"back.out(1.6)"},${s0(0.5)});`);
    sc.push(`tl.to("#${id} .${pid}rays",{rotation:38,duration:${r2(Math.max(2.4, L - 1.4))},ease:"sine.inOut",svgOrigin:"${scx} ${scy}"},${s0(1.0)});`);

    // paper plane glides across the top on a gentle arc
    const px0 = Math.round(W * 0.06), py0 = Math.round(H * 0.3);
    sv.push(`<g class="${pid}pp" opacity="0"><path d="M0 0 L52 15 L12 21 Z" fill="${rgba("#FFFFFF", 0.95)}" stroke="${rgba(INK, 0.5)}" stroke-width="1.5"/><path d="M12 21 L21 33 L24 18 Z" fill="${rgba(ROSE, 0.8)}"/></g>`);
    sc.push(`tl.set("#${id} .${pid}pp",{x:${px0},y:${py0}},0);`);
    sc.push(`tl.to("#${id} .${pid}pp",{opacity:1,duration:.4},${s0(0.6)});`);
    sc.push(`tl.to("#${id} .${pid}pp",{x:${Math.round(W * 0.74)},y:${Math.round(H * 0.14)},rotation:8,duration:${r2(Math.max(2.4, L - 1))},ease:"sine.inOut"},${s0(0.6)});`);
  }

  // ---- WASHI STRIP (stat + asset) — a tape strip carrying the scene's OWN
  // emphasis word, pressed onto the page at a slight angle. On asset scenes it
  // reads as the tape holding the picture into the scrapbook.
  if (kind === "stat" || kind === "asset") {
    const label = clampWords(String(s.emphasis || s.purpose || "").toUpperCase(), 14);
    const wW = Math.round(W * 0.13), wH = Math.round(M * 0.045);
    const wx = (sd % 2) ? Math.round(W * 0.78) : Math.round(W * 0.055);
    dv.push(
      `<div class="${pid}wt" style="position:absolute;left:${wx}px;top:${Math.round(H * 0.08)}px;min-width:${wW}px;height:${wH}px;padding:0 ${Math.round(wH * 0.5)}px;background:${rgba(accent, 0.34)};border-left:2px dashed ${rgba(INK, 0.35)};border-right:2px dashed ${rgba(INK, 0.35)};transform:rotate(${(sd % 2) ? 3 : -4}deg);display:inline-flex;align-items:center;justify-content:center;font:600 ${Math.round(wH * 0.4)}px/1 ${quicksand};letter-spacing:.22em;color:${INK};opacity:0;">${esc(label)}</div>`
    );
    sc.push(`tl.fromTo("#${id} .${pid}wt",{opacity:0,scale:1.3,rotation:${(sd % 2) ? 8 : -9}},{opacity:${label ? 0.95 : 0.55},scale:1,rotation:${(sd % 2) ? 3 : -4},duration:.5,ease:"power3.in"},${s0(0.55)});`);
  }

  // ---- SPARKLES (stat) — paper glints pop around the number with a scale
  // overshoot, the showcase's "little idea" moment.
  if (kind === "stat") {
    const pts = [
      [0.2, 0.24, 0.014], [0.82, 0.2, 0.011], [0.86, 0.66, 0.012],
      [0.14, 0.7, 0.01], [0.76, 0.4, 0.008],
    ];
    pts.forEach(([fx, fy, fs], i) => {
      sv.push(`<path class="${pid}sk" d="${sparklePath(Math.round(W * fx), Math.round(H * fy), Math.round(M * (fs + 0.006)))}" fill="${i % 2 ? accent : BUTTER}" opacity="0"/>`);
    });
    sc.push(`tl.fromTo("#${id} .${pid}sk",{opacity:0,scale:0,transformOrigin:"50% 50%"},{opacity:.9,scale:1,duration:.5,stagger:.13,ease:"back.out(2.4)"},${s0(0.9)});`);
    sc.push(`tl.to("#${id} .${pid}sk",{rotation:18,duration:${r2(Math.max(2, L - 1.8))},ease:"sine.inOut",transformOrigin:"50% 50%"},${s0(1.5)});`);
  }

  // ---- PAPER FRIEND (text) — a cutout character folds up from the page's
  // bottom edge with a cast shadow, bounces hello and BLINKS. Chapter-colored.
  if (kind === "text") {
    const fh = Math.round(M * 0.15), fw = Math.round(fh * 0.7);
    const fx = (sd % 2) ? Math.round(W * 0.845) : Math.round(W * 0.06);
    const fy = H - fh - Math.round(H * 0.045);
    const headR = Math.round(fw * 0.62), eye = Math.max(3, Math.round(fw * 0.08));
    dv.push(
      `<div style="position:absolute;left:${fx}px;top:${fy}px;width:${fw}px;height:${fh}px;">` +
      `<div class="${pid}fsh" style="position:absolute;left:6%;right:6%;bottom:${-Math.round(fh * 0.06)}px;height:${Math.round(fh * 0.1)}px;border-radius:50%;background:radial-gradient(50% 50% at 50% 50%, ${rgba(INK, 0.22)}, transparent 70%);opacity:0;"></div>` +
      `<div class="${pid}fpp" style="position:absolute;inset:0;transform-origin:50% 100%;">` +
      `<div style="position:absolute;left:8%;right:8%;bottom:0;height:64%;border-radius:${Math.round(fw * 0.26)}px ${Math.round(fw * 0.26)}px ${Math.round(fw * 0.17)}px ${Math.round(fw * 0.17)}px;background:${accent};box-shadow:inset 0 0 0 2px ${rgba(INK, 0.1)};"></div>` +
      // the head gets a soft ink outline — the paper-tales GROUND is nearly the
      // same cream as the cutout's face, so without it the head vanishes
      `<div style="position:absolute;left:50%;top:0;width:${headR}px;height:${headR}px;margin-left:${-Math.round(headR / 2)}px;border-radius:50%;background:#FDE8D8;box-shadow:inset 0 0 0 2px ${rgba(INK, 0.16)}, 0 ${Math.round(fh * 0.02)}px ${Math.round(fh * 0.05)}px ${rgba(INK, 0.12)};">` +
      `<span class="${pid}fe" style="position:absolute;top:40%;left:24%;width:${eye}px;height:${Math.round(eye * 1.25)}px;border-radius:50%;background:#5A4A62;"></span>` +
      `<span class="${pid}fe" style="position:absolute;top:40%;right:24%;width:${eye}px;height:${Math.round(eye * 1.25)}px;border-radius:50%;background:#5A4A62;"></span>` +
      `<span style="position:absolute;top:52%;left:12%;width:${Math.round(eye * 1.3)}px;height:${Math.round(eye * 0.8)}px;border-radius:50%;background:${rgba(ROSE, 0.55)};"></span>` +
      `<span style="position:absolute;top:52%;right:12%;width:${Math.round(eye * 1.3)}px;height:${Math.round(eye * 0.8)}px;border-radius:50%;background:${rgba(ROSE, 0.55)};"></span>` +
      `<span style="position:absolute;top:60%;left:50%;width:${Math.round(headR * 0.28)}px;height:${Math.round(headR * 0.15)}px;margin-left:${-Math.round(headR * 0.14)}px;border:${Math.max(2, Math.round(headR * 0.045))}px solid #5A4A62;border-top:none;border-radius:0 0 ${headR}px ${headR}px;"></span>` +
      `</div></div></div>`
    );
    sc.push(`tl.fromTo("#${id} .${pid}fpp",{rotationX:-88,transformPerspective:1300},{rotationX:0,duration:.85,ease:"back.out(1.35)"},${s0(0.7)});`);
    sc.push(`tl.fromTo("#${id} .${pid}fsh",{opacity:0,scaleX:.4},{opacity:1,scaleX:1,duration:.7,ease:"power2.out"},${s0(0.7)});`);
    sc.push(`tl.to("#${id} .${pid}fpp",{y:-8,duration:.32,yoyo:true,repeat:1,ease:"sine.inOut"},${s0(1.8)});`);
    sc.push(`tl.fromTo("#${id} .${pid}fe",{scaleY:1},{scaleY:.12,duration:.08,yoyo:true,repeat:1,ease:"none",transformOrigin:"50% 50%"},${s0(1.7)});`);
    if (L > 3.6) sc.push(`tl.fromTo("#${id} .${pid}fe",{scaleY:1},{scaleY:.12,duration:.08,yoyo:true,repeat:1,ease:"none",transformOrigin:"50% 50%"},${s0(r2(L - 1.2))});`);
  }

  // ---- PAPER CLOUD (text + asset) — a cutout cloud drifting near the top.
  if (kind === "text" || kind === "asset") {
    const cw = Math.round(M * 0.11);
    const cx2 = (sd % 2) ? Math.round(W * 0.07) : Math.round(W * 0.8);
    dv.push(
      `<svg class="${pid}cl" viewBox="0 0 120 52" style="position:absolute;left:${cx2}px;top:${Math.round(H * 0.1)}px;width:${cw}px;opacity:0;">` +
      `<g fill="#DCEFF9" stroke="#BCDCEE" stroke-width="3"><ellipse cx="34" cy="34" rx="26" ry="14"/><ellipse cx="64" cy="26" rx="24" ry="16"/><ellipse cx="92" cy="36" rx="22" ry="12"/></g></svg>`
    );
    sc.push(`tl.fromTo("#${id} .${pid}cl",{opacity:0,x:${(sd % 2) ? -40 : 40}},{opacity:1,x:0,duration:.8,ease:"power2.out"},${s0(0.6)});`);
    sc.push(`tl.to("#${id} .${pid}cl",{x:${(sd % 2) ? 14 : -14},duration:2.4,ease:"sine.inOut",yoyo:true,repeat:sreps(${r2(Math.max(0, L - 1.4))},2.4)},${s0(1.4)});`);
  }

  // ---- CTA — the last page: a ribbon bookmark drops in and swings like a
  // pendulum, torn-paper confetti falls with a sway, and the page corner curls.
  if (kind === "cta") {
    const rw = Math.round(M * 0.038), rh = Math.round(M * 0.19);
    dv.push(
      `<div class="${pid}rb" style="position:absolute;left:${Math.round(W * 0.9)}px;top:0;width:${rw}px;height:${rh}px;transform-origin:50% 0;opacity:0;">` +
      `<div style="position:absolute;inset:0;background:linear-gradient(180deg,${BUTTER},#F0B75A);border-radius:0 0 4px 4px;clip-path:polygon(0 0,100% 0,100% 100%,50% 88%,0 100%);box-shadow:0 ${Math.round(M * 0.006)}px ${Math.round(M * 0.016)}px ${rgba(INK, 0.25)};"></div></div>`
    );
    sc.push(`tl.fromTo("#${id} .${pid}rb",{opacity:0,y:-${Math.round(rh * 0.5)}},{opacity:1,y:0,duration:.6,ease:"power2.out"},${s0(0.5)});`);
    sc.push(`tl.fromTo("#${id} .${pid}rb",{rotation:9},{rotation:-7,duration:1.1,ease:"sine.inOut",yoyo:true,repeat:${Math.max(1, Math.min(4, Math.floor((L - 1.2) / 1.1)))}},${s0(1.1)});`);

    // torn-paper confetti — timeline-anchored fall, sway, spin, fade (finite)
    const bits = [[0.14, ROSE], [0.3, BUTTER], [0.46, SKY], [0.6, MINT], [0.74, LILAC], [0.86, ROSE]];
    const fall = r2(Math.min(2.6, Math.max(1.8, L - 1.6)));
    bits.forEach(([fx, col], i) => {
      const bw = Math.round(M * 0.011);
      dv.push(`<div class="${pid}cf${i}" style="position:absolute;left:${Math.round(W * fx)}px;top:${-Math.round(H * 0.04)}px;width:${bw}px;height:${Math.round(bw * 1.35)}px;border-radius:2px;background:${col};opacity:0;"></div>`);
      const at = r2(0.8 + i * 0.14);
      sc.push(`tl.to("#${id} .${pid}cf${i}",{opacity:1,duration:.2},${s0(at)});`);
      sc.push(`tl.fromTo("#${id} .${pid}cf${i}",{y:0},{y:${Math.round(H * 0.6)},duration:${fall},ease:"sine.in"},${s0(at)});`);
      sc.push(`tl.fromTo("#${id} .${pid}cf${i}",{x:0},{x:${i % 2 ? 30 : -26},duration:${r2(fall / 3)},yoyo:true,repeat:2,ease:"sine.inOut"},${s0(at)});`);
      sc.push(`tl.fromTo("#${id} .${pid}cf${i}",{rotation:0},{rotation:${i % 2 ? 200 : -180},duration:${fall},ease:"none"},${s0(at)});`);
      sc.push(`tl.to("#${id} .${pid}cf${i}",{opacity:0,duration:.3},${s0(r2(at + fall - 0.3))});`);
    });

    // folded page-corner curl, bottom-right
    const cs = Math.round(M * 0.09);
    sv.push(`<path class="${pid}cc" d="M${W} ${H - cs} L${W} ${H} L${W - cs} ${H} Z" fill="${rgba(INK, 0.16)}"/>`);
    sv.push(`<path class="${pid}cc" d="M${W} ${H - cs} L${W - cs} ${H} L${W - cs * 0.45} ${H - cs * 0.45} Z" fill="${rgba("#FFFFFF", 0.9)}"/>`);
    sc.push(`tl.fromTo("#${id} .${pid}cc",{opacity:0},{opacity:1,duration:.5},${s0(0.8)});`);
  }

  return { sv, dv, sc };
}

module.exports = { buildPapertalesOrnaments };
