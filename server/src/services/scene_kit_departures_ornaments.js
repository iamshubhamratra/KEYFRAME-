// TERMINAL DEPARTURES ornaments — the pack's FRAME.md atoms, TOPIC-DRIVEN.
//
// The showcase reference (frames/terminal-departures/) is an airport hall:
// split-flap headlines (textfx enter "flap", handled by scene_kit), a ticker
// band that runs the film, hanging gate signs, status chips, an analog clock
// and a boarding-pass that prints for the CTA. This module implements those
// atoms as scene furniture and fills them with the STORYBOARD's own copy —
// the ticker marquees the film's actual headlines, the gate sign carries a
// real stat parsed from the scene, chips carry the scene's bullets — so an
// Amazon film and a bakery film read as different departure halls, not the
// same demo with recolored text.
//
// Design constants come from FRAME.md (yellow/green/cyan/red are semantic:
// yellow = signal, green = ON TIME, red = FINAL CALL and appears ONCE, on the
// CTA). Motion is mechanical — clacks, sweeps, pendulums, tractor-feed steps —
// never blur. Every tween is timeline-anchored (deterministic under seek).
//
// Called from scene_kit.js buildSkinOrnaments; returns { sv, dv, sc }.

const BOARD = "#0B0C0F";
const IVORY = "#F2EEE3";
const MUTED = "#8B8D96";
const YELLOW = "#FFC61A";
const GREEN = "#35D07F";
const CYAN = "#5FD4E6";
const RED = "#FF4B3E";
const MONO = "'IBM Plex Mono','JetBrains Mono',ui-monospace,monospace";

// Uppercase + clamp on a WORD boundary — a chip reading "SHIPPED WITHIN 24 HO"
// looks like a broken board; "SHIPPED WITHIN 24" reads as intended.
const up = (s, n) => {
  const t = String(s || "").trim().toUpperCase();
  const lim = n || 80;
  if (t.length <= lim) return t;
  const cut = t.slice(0, lim);
  const sp = cut.lastIndexOf(" ");
  return (sp > lim * 0.5 ? cut.slice(0, sp) : cut).trim();
};
// First metric-looking token in the scene copy (real stat > invented one).
function findStat(scene) {
  const hay = [scene?.headline, scene?.subtext, ...(scene?.bullets || [])].filter(Boolean).join(" ");
  // (?![A-Za-z0-9]) — don't scrape a magnitude letter off the front of a longer
  // word ("12,000 kitchens" is 12,000, not 12,000k). Same guard as pickNumber.
  const m = hay.match(/\d[\d,.]*\s?(?:%|x|×|\+|k|K|m|M|b|B)?(?![A-Za-z0-9])/);
  return m ? m[0].replace(/\s+/g, "") : null;
}

function buildDeparturesOrnaments({ kind, id, pid, T, L, seed, theme, dims, s0, rgba, esc, scene, sceneIndex = 0, sceneCount = 5, sbTitle = "" }) {
  const W = dims.width, H = dims.height;
  const sv = [], dv = [], sc = [];
  const sd = (seed + sceneIndex * 7) >>> 0;
  const grotesk = theme.displayStack || "'Space Grotesk',sans-serif";
  const s = scene || {};

  // ---- TICKER (every scene) — the band that runs the film, marqueeing the
  // film's OWN copy. Two copies translate -50% on a linear loop (seamless).
  const items = [sbTitle, s.headline, s.subtext, ...(s.bullets || []), s.emphasis]
    .filter(Boolean).map((t) => up(t, 60));
  const tickerText = (items.length ? items : ["NOW BOARDING"]).join("  ···  ") + "  ···  ";
  const th = Math.round(H * 0.042);
  dv.push(
    `<div class="${pid}tk" style="position:absolute;left:0;right:0;bottom:0;height:${th}px;background:${BOARD};border-top:2px solid ${YELLOW};overflow:hidden;opacity:0;z-index:1;">` +
    `<div class="${pid}tki" style="display:flex;white-space:nowrap;align-items:center;height:100%;will-change:transform;">` +
    `<span style="font:600 ${Math.round(th * 0.42)}px/1 ${MONO};letter-spacing:.22em;color:${rgba(IVORY, 0.8)};padding:0 1em;">${esc(tickerText)}</span>` +
    `<span style="font:600 ${Math.round(th * 0.42)}px/1 ${MONO};letter-spacing:.22em;color:${rgba(IVORY, 0.8)};padding:0 1em;">${esc(tickerText)}</span>` +
    `</div></div>`
  );
  sc.push(`tl.to("#${id} .${pid}tk",{opacity:1,duration:.4},${s0(0.15)});`);
  sc.push(`tl.to("#${id} .${pid}tki",{xPercent:-50,duration:16,ease:"none",repeat:reps(16)},0);`);

  // ---- ANALOG CLOCK (hook + cta) — laps the scene; rotation is a linear
  // function of the timeline (deterministic under seeking, per FRAME.md).
  if (kind === "hook" || kind === "cta") {
    const cr = Math.round(H * 0.052), ccx = Math.round(W * 0.915), ccy = Math.round(H * 0.16);
    const ticks = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x1 = ccx + Math.sin(a) * (cr - 4), y1 = ccy - Math.cos(a) * (cr - 4);
      const x2 = ccx + Math.sin(a) * (cr - (i % 3 === 0 ? 11 : 7)), y2 = ccy - Math.cos(a) * (cr - (i % 3 === 0 ? 11 : 7));
      ticks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${rgba(IVORY, i % 3 === 0 ? 0.7 : 0.35)}" stroke-width="${i % 3 === 0 ? 2.5 : 1.5}"/>`);
    }
    sv.push(
      `<g class="${pid}ck" opacity="0"><circle cx="${ccx}" cy="${ccy}" r="${cr}" fill="${rgba(BOARD, 0.85)}" stroke="${rgba(IVORY, 0.5)}" stroke-width="2"/>${ticks.join("")}` +
      `<line class="${pid}mh" x1="${ccx}" y1="${ccy}" x2="${ccx}" y2="${ccy - cr * 0.52}" stroke="${IVORY}" stroke-width="3.5" stroke-linecap="round"/>` +
      `<line class="${pid}sh" x1="${ccx}" y1="${ccy + cr * 0.16}" x2="${ccx}" y2="${ccy - cr * 0.78}" stroke="${YELLOW}" stroke-width="2" stroke-linecap="round"/>` +
      `<circle cx="${ccx}" cy="${ccy}" r="3" fill="${YELLOW}"/></g>`
    );
    sc.push(`tl.to("#${id} .${pid}ck",{opacity:1,duration:.5},${s0(0.35)});`);
    sc.push(`tl.set("#${id} .${pid}mh",{svgOrigin:"${ccx} ${ccy}",rotation:${(sd % 12) * 30}},0);`);
    sc.push(`tl.fromTo("#${id} .${pid}sh",{svgOrigin:"${ccx} ${ccy}",rotation:0},{rotation:${Math.round((L / 60) * 360 * 4)},duration:${L},ease:"none"},${s0(0)});`);
  }

  // ---- GATE SIGN (stat/text) — hanging panel on two rods, pendulum swing-in.
  // Value = a REAL stat parsed from the scene copy when one exists, else the
  // scene's gate code; caption = the scene's emphasis / headline words.
  if (kind === "stat" || kind === "text") {
    const stat = findStat(s);
    const value = stat || `A${sceneIndex + 1}`;
    const caption = up(s.emphasis || s.purpose || (s.headline || "").split(/\s+/).slice(0, 2).join(" "), 16) || "DEPARTURE";
    const gw = Math.round(W * 0.15), gh = Math.round(H * 0.15);
    const gx = (sd % 2) ? Math.round(W * 0.055) : Math.round(W * 0.79);
    const rodH = Math.round(H * 0.085);
    dv.push(
      `<div class="${pid}gs" style="position:absolute;left:${gx}px;top:0;width:${gw}px;height:${rodH + gh}px;transform-origin:50% 0;opacity:0;">` +
      `<div style="position:absolute;left:22%;top:0;width:2px;height:${rodH}px;background:${rgba(IVORY, 0.35)};"></div>` +
      `<div style="position:absolute;right:22%;top:0;width:2px;height:${rodH}px;background:${rgba(IVORY, 0.35)};"></div>` +
      `<div style="position:absolute;left:0;right:0;top:${rodH}px;height:${gh}px;background:${BOARD};border:1px solid ${rgba(IVORY, 0.22)};border-radius:${Math.round(H * 0.012)}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;box-shadow:0 ${Math.round(H * 0.014)}px ${Math.round(H * 0.03)}px rgba(0,0,0,.45);">` +
      `<div style="font:700 ${Math.round(gh * 0.4)}px/1 ${grotesk};color:${YELLOW};letter-spacing:.02em;">${esc(value)}</div>` +
      `<div style="font:600 ${Math.round(gh * 0.13)}px/1 ${MONO};letter-spacing:.3em;color:${MUTED};">${esc(caption)}</div>` +
      `</div></div>`
    );
    sc.push(`tl.fromTo("#${id} .${pid}gs",{opacity:0,rotation:-14,y:-24},{opacity:1,rotation:0,y:0,duration:1.1,ease:"elastic.out(1,0.45)"},${s0(0.5)});`);
    sc.push(`tl.to("#${id} .${pid}gs",{rotation:1.6,duration:2.4,ease:"sine.inOut",yoyo:true,repeat:${Math.max(0, Math.floor((L - 1.8) / 2.4) - 1)}},${s0(1.6)});`);
  }

  // ---- STATUS CHIPS (text/asset) — the scene's own bullets as board chips
  // with status dots: green = ON TIME grammar, yellow = signal.
  if (kind === "asset" || kind === "text") {
    const labels = (s.bullets || []).slice(0, 2).map((b) => up(b, 20));
    if (!labels.length && s.emphasis) labels.push(up(s.emphasis, 20));
    const ch = Math.round(H * 0.036);
    labels.forEach((label, i) => {
      dv.push(
        `<div class="${pid}ch" style="position:absolute;left:${Math.round(W * 0.045)}px;top:${Math.round(H * 0.075) + i * (ch + 10)}px;height:${ch}px;display:inline-flex;align-items:center;gap:8px;padding:0 ${Math.round(ch * 0.5)}px;background:${rgba(BOARD, 0.92)};border:1px solid ${rgba(IVORY, 0.22)};border-radius:${Math.round(ch * 0.28)}px;opacity:0;">` +
        `<span style="width:7px;height:7px;border-radius:50%;background:${i === 0 ? GREEN : YELLOW};box-shadow:0 0 8px ${rgba(i === 0 ? GREEN : YELLOW, 0.8)};"></span>` +
        `<span style="font:600 ${Math.round(ch * 0.36)}px/1 ${MONO};letter-spacing:.24em;color:${rgba(IVORY, 0.85)};">${esc(label)}</span></div>`
      );
    });
    if (labels.length) {
      sc.push(`tl.fromTo("#${id} .${pid}ch",{opacity:0,y:-12},{opacity:1,y:0,duration:.5,stagger:.14,ease:"power2.out"},${s0(0.7)});`);
    }
  }

  // ---- CTA — FINAL CALL (the film's single red element) + a boarding pass
  // that prints out of a slot in tractor-feed steps, then wobbles to rest.
  if (kind === "cta") {
    const ch = Math.round(H * 0.042);
    dv.push(
      `<div class="${pid}fc" style="position:absolute;left:${Math.round(W * 0.045)}px;top:${Math.round(H * 0.075)}px;height:${ch}px;display:inline-flex;align-items:center;gap:9px;padding:0 ${Math.round(ch * 0.55)}px;background:${rgba(RED, 0.12)};border:1px solid ${rgba(RED, 0.65)};border-radius:${Math.round(ch * 0.26)}px;opacity:0;">` +
      `<span class="${pid}fcd" style="width:8px;height:8px;border-radius:50%;background:${RED};box-shadow:0 0 10px ${rgba(RED, 0.9)};"></span>` +
      `<span style="font:700 ${Math.round(ch * 0.38)}px/1 ${MONO};letter-spacing:.3em;color:${RED};">FINAL CALL</span></div>`
    );
    sc.push(`tl.fromTo("#${id} .${pid}fc",{opacity:0,y:-12},{opacity:1,y:0,duration:.45,ease:"power2.out"},${s0(0.5)});`);
    sc.push(`tl.to("#${id} .${pid}fcd",{opacity:.25,duration:.5,yoyo:true,repeat:${Math.max(1, Math.floor((L - 1.5) / 0.5))},ease:"steps(1)"},${s0(1.0)});`);

    const pw = Math.round(W * 0.165), ph = Math.round(pw * 1.18);
    // top 0.26H keeps the pass clear of the analog clock (cy 0.16H, r ~0.052H).
    const px = Math.round(W * 0.79), py = Math.round(H * 0.26);
    const flight = up(sbTitle || s.headline, 12) || "KEYFRAME";
    dv.push(
      `<div style="position:absolute;left:${px - 8}px;top:${py - 12}px;width:${pw + 16}px;height:12px;background:${BOARD};border-radius:4px;border:1px solid ${rgba(IVORY, 0.25)};"></div>` +
      `<div class="${pid}bp" style="position:absolute;left:${px}px;top:${py}px;width:${pw}px;height:${ph}px;background:${IVORY};border-radius:6px;clip-path:inset(0 0 100% 0);box-shadow:0 ${Math.round(H * 0.015)}px ${Math.round(H * 0.035)}px rgba(0,0,0,.5);padding:${Math.round(pw * 0.09)}px;box-sizing:border-box;display:flex;flex-direction:column;gap:${Math.round(ph * 0.045)}px;transform-origin:50% 0;">` +
      `<div style="font:600 ${Math.round(pw * 0.055)}px/1 ${MONO};letter-spacing:.3em;color:${MUTED};">BOARDING PASS</div>` +
      `<div style="font:700 ${Math.round(pw * 0.115)}px/1.15 ${grotesk};color:#121317;">${esc(flight)}</div>` +
      `<div style="display:flex;gap:${Math.round(pw * 0.09)}px;">` +
      `<div><div style="font:600 ${Math.round(pw * 0.048)}px/1.6 ${MONO};letter-spacing:.22em;color:${MUTED};">GATE</div><div style="font:700 ${Math.round(pw * 0.1)}px/1 ${grotesk};color:#121317;">A${sceneCount}</div></div>` +
      `<div><div style="font:600 ${Math.round(pw * 0.048)}px/1.6 ${MONO};letter-spacing:.22em;color:${MUTED};">DEPARTS</div><div style="font:700 ${Math.round(pw * 0.1)}px/1 ${grotesk};color:${GREEN === "#35D07F" ? "#1F8F58" : "#1F8F58"};">NOW</div></div>` +
      `</div>` +
      `<div style="margin-top:auto;height:${Math.round(ph * 0.09)}px;background:repeating-linear-gradient(90deg,#121317 0 2px,transparent 2px 5px);"></div>` +
      `</div>`
    );
    sc.push(`tl.to("#${id} .${pid}bp",{clipPath:"inset(0% 0% 0% 0%)",duration:.9,ease:"steps(5)"},${s0(0.8)});`);
    sc.push(`tl.fromTo("#${id} .${pid}bp",{rotation:-1.6},{rotation:0.8,duration:.35,ease:"power1.inOut"},${s0(1.7)});`);
    sc.push(`tl.to("#${id} .${pid}bp",{rotation:0,duration:.4,ease:"elastic.out(1,0.4)"},${s0(2.05)});`);
  }

  // ---- HOOK — a NOW BOARDING chip so the opening reads as a departures hall
  // even before the board finishes clacking.
  if (kind === "hook") {
    const ch = Math.round(H * 0.038);
    dv.push(
      `<div class="${pid}nb" style="position:absolute;left:${Math.round(W * 0.045)}px;top:${Math.round(H * 0.075)}px;height:${ch}px;display:inline-flex;align-items:center;gap:8px;padding:0 ${Math.round(ch * 0.5)}px;background:${rgba(BOARD, 0.92)};border:1px solid ${rgba(IVORY, 0.22)};border-radius:${Math.round(ch * 0.28)}px;opacity:0;">` +
      `<span style="width:7px;height:7px;border-radius:50%;background:${GREEN};box-shadow:0 0 8px ${rgba(GREEN, 0.8)};"></span>` +
      `<span style="font:600 ${Math.round(ch * 0.37)}px/1 ${MONO};letter-spacing:.28em;color:${rgba(IVORY, 0.85)};">NOW BOARDING</span></div>`
    );
    sc.push(`tl.fromTo("#${id} .${pid}nb",{opacity:0,y:-12},{opacity:1,y:0,duration:.5,ease:"power2.out"},${s0(0.4)});`);
  }

  return { sv, dv, sc };
}

module.exports = { buildDeparturesOrnaments };
