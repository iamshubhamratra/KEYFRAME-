// TERMINAL DEPARTURES composer — a native GSAP + SVG/CSS "airport departures hall
// for films". The pack `terminal-departures` (manifest renderer:"terminal-departures")
// routes here from attemptLlmComposition, like the flagship / brightlife / blueprint /
// bloom / bauhaus composers.
//
// Same envelope as the others: buildComposition -> {indexHtml, metaJson}. Persistent
// HALL chrome (dark FIDS ground, light sweep, vignette, masthead, an analog clock whose
// second hand laps the whole film, a scrolling ticker band) is content-independent; each
// storyboard scene is injected into an airport SCENE-TYPE (hook / board / signs / baggage
// / security / cta), or — when a real screenshot/photo is available — a mounted GATE
// MONITOR (a FIDS display bezel with the screenshot inside).
//
// SIGNATURE grammar: the SPLIT-FLAP BOARD. Every headline arrives by mechanically cycling
// characters in Solari-style flap cells (deterministic, SEEDED char swaps + a scaleY
// "clack" squash per swap — NO Math.random, identical every render). Around it: hanging
// gate signs that swing in on ceiling pivots, a boarding-pass-style board, a baggage belt
// carrying labelled cases, and a security beam that x-ray-pings each tag it crosses.
//
// Engineering contract (identical to the other composers): one paused GSAP timeline on
// window.__timelines["vid"]; direct-child .clip scenes on unique tracks; a boundary
// opacity:0 hard-kill per scene (the hall persists behind them); ONE seek-safe caption
// node driven by a single onUpdate proxy; finite repeats; pathLength=100 draw-ons; cqw
// units + container-type:size; hidden = opacity:0 only. Fully deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
const DISPLAY = "Space Grotesk";
const MONO = "IBM Plex Mono";

// ---- helpers -----------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;

function terminalTheme() {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  return {
    ground: "#0C0D11", board: "#0B0C0F", cell: "#101116",
    ivory: "#F2EEE3", dim: "#8B8D96",
    yellow: "#FFC61A", green: "#35D07F", red: "#FF4B3E", cyan: "#5FD4E6",
    line: "rgba(242,238,227,0.14)",
    displayStack: `'${DISPLAY}', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    fontFace,
  };
}

// Split-flap text must live in the flap ALPHABET (uppercase + digits + a few marks); the
// engine cycles through those glyphs, so anything outside them just lands as the target.
// Uppercase, strip to legible chars, collapse space, cap length so a row never overflows.
function flapText(s, max) {
  return String(s == null ? "" : s)
    .toUpperCase().replace(/[^A-Z0-9·\-.: %]/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

// The hero splits into up to two flap lines (line 2 is gold): emphasis wins line 2, else
// the headline is split in half by words so each line stays short enough to fit.
function flapHero(scene) {
  const H = String(scene.headline || scene.title || "KEYFRAME").trim();
  const E = String(scene.emphasis || "").trim();
  const w = H.split(/\s+/).filter(Boolean);
  let l1, l2;
  if (E && flapText(E, 12)) { l1 = flapText(w.slice(0, 3).join(" "), 16); l2 = flapText(E, 12); }
  else if (w.length >= 2) { const h = Math.ceil(w.length / 2); l1 = flapText(w.slice(0, h).join(" "), 16); l2 = flapText(w.slice(h).join(" "), 14); }
  else { l1 = flapText(H, 16); l2 = ""; }
  return { l1: l1 || "KEYFRAME", l2 };
}

function pickNumber(scene) {
  const src = [scene.emphasis, scene.subtext, scene.headline].map((x) => String(x || "")).find((x) => /\d/.test(x)) || "";
  const m = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)\s?(%|x|\+|k|m|bn?|p)?/i.exec(src);
  if (!m) return null;
  const target = Math.round(parseFloat(m[2].replace(/,/g, "")));
  if (!isFinite(target)) return null;
  return { pre: m[1] || "", target, suf: (m[3] || "") };
}

function bullets(scene, n) {
  let list = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean) : [];
  if (!list.length && scene.subtext) list = String(scene.subtext).split(/[.;\n•]|\s—\s/).map((s) => s.trim()).filter((s) => s.length > 2);
  return list.slice(0, n).map(String);
}

function pickStats(scene, max) {
  const out = [];
  for (const l of (Array.isArray(scene.onScreenText) ? scene.onScreenText : [])) {
    const m = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)\s?(%|x|\+|k|m|p)?/i.exec(String(l));
    if (m) out.push({ pre: m[1] || "", target: Math.round(parseFloat(m[2].replace(/,/g, ""))), suf: (m[3] || ""), label: String(l).replace(m[0], "").trim().slice(0, 22) || "metric" });
    if (out.length >= max) break;
  }
  if (!out.length) { const n = pickNumber(scene); if (n) out.push({ ...n, label: String(scene.subtext || scene.headline || "metric").slice(0, 22) }); }
  return out.slice(0, max);
}

// Supporting lines (from onScreenText, else voiceover sentences) for board rows / tags.
function featureLines(scene, n) {
  let src = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean).map(String) : [];
  if (src.length < 2 && scene.voiceover) src = src.concat(String(scene.voiceover).split(/[.!?;\n]|\s—\s/));
  const head = String(scene.headline || "").toLowerCase().trim();
  const seen = new Set(), out = [];
  for (const s of src) {
    const t = String(s).replace(/\s+/g, " ").trim();
    const k = t.toLowerCase();
    if (t.length >= 3 && t.length <= 40 && k !== head && !seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out.slice(0, n);
}

// Only ESTABLISHED-relevance assets earn the gate monitor (real screenshots / curated /
// vision-approved). Stills only (a moving belt is busy enough).
function screenOk(a) {
  if (!a || !a.path) return false;
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  const src = String(a.source || "").toLowerCase();
  return a.source === "website" || src.startsWith("library") || a.visionOk === true || a.cdProminence === "hero" || a.cdProminence === "support";
}

function archetype(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "hook";
  if (i === total - 1 || k === "cta" || p === "cta") return "cta";
  if (k === "chart" || k === "stat" || k === "countdown" || pickNumber(scene)) return "signs";
  if (k === "quote" || p === "problem" || p === "comparison" || /\bno\b|without|forget/.test(String(scene.headline || "").toLowerCase())) return "baggage";
  if (bullets(scene, 3).length >= 2 || /how|process|step|feature|list/.test(p + k)) return "board";
  return "security";
}

const KICK = {
  hook: "Gate K·F — now boarding", board: "Departures", signs: "By the numbers",
  baggage: "Baggage claim", security: "Security — style scan", screen: "Gate K·F — live", cta: "Final call",
};

// ---- scene-type builders  ((scene, ctx, asset) -> { html, s }) -----------------
function open(id, ctx) { return `<div class="clip" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }
// Scenes exit via the boundary opacity:0 hard-kill (added in buildComposition) — no fade
// on the clip element itself (an opacity fade-to-0 on the clip trips the linter's
// gsap_exit_missing_hard_kill even with the kill present). The dark hall persists behind.

const FLYSVG = `viewBox="0 0 1920 1080" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;" data-layout-allow-occlusion`;

function tHook(scene, ctx) {
  const { id, T, L } = ctx;
  const chip = flapText(scene.kicker || KICK.hook, 30) ? esc(scene.kicker || KICK.hook).slice(0, 30) : "NOW BOARDING";
  const { l1, l2 } = flapHero(scene);
  const sub = esc(String(scene.subtext || scene.voiceover || "welcome to the film terminal").replace(/\s+/g, " ").trim()).slice(0, 62);
  const html = `${open(id, ctx)}<div class="safe">
    <span class="chip" id="${id}-chip" style="opacity:0;"><span class="dot"></span>${esc(chip)}</span>
    <div class="flap h-flap" id="${id}-l1" data-text="${esc(l1)}" style="margin-top:2.6cqw;"></div>
    ${l2 ? `<div class="flap h-flap gold" id="${id}-l2" data-text="${esc(l2)}" style="margin-top:0.8cqw;"></div>` : ""}
    <div class="sub" id="${id}-sub" style="opacity:0;margin-top:2.2cqw;">${sub}</div>
  </div>
  <svg id="${id}-fly" ${FLYSVG}>
    <path id="${id}-route" d="M180 860 C 560 800, 1100 820, 1740 700" pathLength="100" fill="none" stroke="rgba(242,238,227,0.32)" stroke-width="3" stroke-dasharray="0.9 2.4" stroke-dashoffset="100"/>
    <g id="${id}-plane" opacity="0"><path d="M0 0 L34 8 L0 16 L8 8 Z M-8 4 L2 8 L-8 12 Z" fill="#F2EEE3" transform="translate(-17,-8)"/></g>
  </svg></div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `tl.fromTo("#${id}-chip",{opacity:0,y:-18},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.35)});`,
    `flapTo($("#${id}-l1"),${r(T + 0.6)},{seed:1});`,
    l2 ? `flapTo($("#${id}-l2"),${r(T + 1.5)},{seed:2,cycles:4});` : "",
    `tl.fromTo("#${id}-sub",{opacity:0,y:16},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 2.4)});`,
    `tl.to("#${id}-route",{strokeDashoffset:0,duration:1.1,ease:"power1.inOut"},${r(T + 2.3)});`,
    `tl.fromTo("#${id}-plane",{opacity:0},{opacity:1,duration:0.2},${r(T + 2.35)});`,
    `tl.fromTo("#${id}-plane",{x:180,y:860,rotation:-4},{x:760,y:810,rotation:-2,duration:0.55,ease:"none"},${r(T + 2.35)});`,
    `tl.to("#${id}-plane",{x:1740,y:700,rotation:-12,duration:${r(Math.max(0.5, L - 3.12))},ease:"none"},${r(T + 2.92)});`,
    `tl.to("#${id}-plane",{opacity:0,duration:0.25},${r(T + L - 0.5)});`,
  ].filter(Boolean);
  return { html, s };
}

function tBoard(scene, ctx) {
  const { id, T, L, theme } = ctx;
  let rows = featureLines(scene, 5); if (rows.length < 2) rows = bullets(scene, 5);
  if (rows.length < 2) rows = ["ONE SENTENCE IN", "A PREMIERE OUT"];
  rows = rows.slice(0, 5).map((t) => flapText(t, 22)).filter(Boolean);
  const head = flapText(scene.headline || KICK.board, 22);
  const rowHtml = rows.map((t, i) => {
    const last = i === rows.length - 1;
    const st = last ? "BOARDING" : "ON TIME";
    return `<div class="brd-row"${last ? ` style="background:rgba(255,198,26,0.06);"` : ""}>
      <span class="col-f"${last ? ` style="color:var(--yellow);"` : ""}>KF-0${i + 1}</span>
      <span class="col-d"><span class="flap b-flap${last ? " gold" : ""}" id="${id}-d${i}" data-text="${esc(t)}"></span></span>
      <span class="col-s"><span class="flap s-flap ${last ? "gold" : "grn"}" id="${id}-s${i}" data-text="${st}"></span></span>
    </div>`;
  }).join("");
  const html = `${open(id, ctx)}<div class="safe">
    <div class="chip" id="${id}-chip" style="opacity:0;margin-bottom:1.8cqw;"><span class="dot"></span>${esc(head)}</div>
    <div class="brd" id="${id}-brd" style="opacity:0;">
      <div class="brd-head"><span class="col-f">FLIGHT</span><span class="col-d" style="padding-left:0.4cqw;">DESTINATION</span><span class="col-s">STATUS</span></div>
      ${rowHtml}
    </div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo("#${id}-chip",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo("#${id}-brd",{opacity:0,y:40},{opacity:1,y:0,duration:0.6,ease:"power3.out"},${r(T + 0.35)});`,
    ...rows.flatMap((t, i) => [
      `flapTo($("#${id}-d${i}"),${r(T + 0.7 + i * 0.42)},{seed:${10 + i * 3},per:0.03,step:0.06,cycles:2});`,
      `flapTo($("#${id}-s${i}"),${r(T + 0.9 + i * 0.42)},{seed:${11 + i * 3},per:0.03,step:0.06,cycles:2});`,
    ]),
  ];
  return { html, s };
}

function tSigns(scene, ctx) {
  const { id, T, L, theme } = ctx;
  const stats = pickStats(scene, 3);
  if (!stats.length) stats.push({ pre: "", target: 40, suf: "", label: "destinations" });
  const signHtml = stats.map((st, i) => {
    const num = flapText(`${st.pre}${st.target}${st.suf}`, 6) || String(st.target);
    // Size the flap to the digit count so a long number (e.g. "1080P") fits one row
    // inside the fixed-width sign instead of wrapping.
    const nlen = num.replace(/\s/g, "").length;
    const fsz = nlen >= 5 ? 2.8 : nlen === 4 ? 3.4 : 4;
    return `<div class="sign-wrap"><div class="sign-rod r2"></div><div class="sign-rod r3"></div>
      <div class="sign" id="${id}-sg${i}" style="opacity:0;">
        <div class="flap g-flap gold" id="${id}-n${i}" data-text="${esc(num)}" style="font-size:${fsz}cqw;"></div>
        <div class="g-cap">${esc(String(st.label || "metric").slice(0, 22))}</div>
      </div></div>`;
  }).join("");
  const head = flapText(scene.headline || KICK.signs, 22);
  const html = `${open(id, ctx)}<div class="safe" style="justify-content:flex-end;padding-bottom:16%;">
    <span class="chip" id="${id}-chip" style="opacity:0;position:absolute;top:13%;"><span class="dot"></span>${esc(head)}</span>
    <div style="display:flex;gap:5cqw;align-items:flex-start;">${signHtml}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo("#${id}-chip",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    ...stats.flatMap((st, i) => {
      const at = r(T + 0.5 + i * 0.35);
      return [
        `tl.fromTo("#${id}-sg${i}",{opacity:0,rotation:${i % 2 ? 10 : -10},y:-60,transformOrigin:"50% -9cqw"},{opacity:1,rotation:0,y:0,duration:1.4,ease:"elastic.out(1, 0.35)"},${at});`,
        `tl.to("#${id}-sg${i}",{rotation:${i % 2 ? -1.6 : 1.6},duration:1.4,ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"50% -9cqw"},${r(at + 1.5)});`,
        `flapTo($("#${id}-n${i}"),${r(at + 0.7)},{seed:${20 + i},cycles:4,step:0.08});`,
      ];
    }),
  ];
  return { html, s };
}

function tBaggage(scene, ctx) {
  const { id, T, L, theme } = ctx;
  let tags = bullets(scene, 3);
  if (tags.length < 2) tags = featureLines(scene, 3);
  if (tags.length < 2) tags = ["NO CREW", "NO TIMELINE", "NO RENDER FARM"];
  tags = tags.slice(0, 3).map((t) => esc(flapText(t, 16) || "KEYFRAME"));
  const caseCols = ["#8A4B3B", "#3B5D8A", "#5D5A46"];
  const head = flapText(scene.headline || "NO BAGGAGE REQUIRED", 24);
  const sub = esc(String(scene.subtext || scene.voiceover || "just your words — we pack the rest").replace(/\s+/g, " ").trim()).slice(0, 60);
  const caseHtml = tags.map((t, i) => `<div class="case" id="${id}-c${i}" style="left:-16cqw;top:57.5%;background:${caseCols[i % 3]};"><div class="tag">${t}</div></div>`).join("");
  const html = `${open(id, ctx)}<div class="safe" style="justify-content:flex-start;padding-top:11%;">
    <div class="flap h-flap2" id="${id}-l1" data-text="${esc(head)}"></div>
    <div class="sub" id="${id}-sub" style="opacity:0;margin-top:1.6cqw;">${sub}</div>
  </div>
  <div id="${id}-belt" class="belt" data-layout-allow-occlusion><div class="belt-slats" id="${id}-slats"></div></div>
  ${caseHtml}</div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `flapTo($("#${id}-l1"),${r(T + 0.25)},{seed:30,per:0.032});`,
    `tl.fromTo("#${id}-sub",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.4)});`,
    `tl.fromTo("#${id}-slats",{backgroundPosition:"0cqw 0"},{backgroundPosition:"48cqw 0",duration:${r(Math.max(2, L - 0.6))},ease:"none"},${r(T + 0.05)});`,
    ...tags.flatMap((t, i) => {
      const at = r(T + 0.7 + i * 0.9);
      return [
        `tl.fromTo("#${id}-c${i}",{x:0},{x:2300,duration:${r(Math.max(2, L - 2.4))},ease:"none"},${at});`,
        `tl.fromTo("#${id}-c${i}",{rotation:-1},{rotation:1,duration:0.3,ease:"sine.inOut",yoyo:true,repeat:${Math.max(3, Math.floor((L - 2.4) / 0.6))}},${at});`,
      ];
    }),
  ];
  return { html, s };
}

function tSecurity(scene, ctx) {
  const { id, T, L, theme } = ctx;
  let tags = featureLines(scene, 8); if (tags.length < 3) tags = bullets(scene, 8);
  if (tags.length < 3) tags = ["fast", "on-brand", "cinematic", "cleared", "premium", "yours"];
  tags = tags.slice(0, 8).map((t) => esc(String(t).replace(/\s+/g, " ").trim()).slice(0, 22));
  const dots = [theme.yellow, theme.cyan, theme.green, theme.red];
  const head = flapText(scene.headline || "ALL STYLES CLEARED", 22);
  const tagHtml = tags.map((t, i) => `<span class="scan-tag" id="${id}-t${i}" style="opacity:0;"><i style="background:${dots[i % 4]};"></i>${t}<span class="ok">&#10003;</span></span>`).join("");
  const html = `${open(id, ctx)}<div class="safe" style="justify-content:flex-start;padding-top:11%;">
    <span class="chip" id="${id}-chip" style="opacity:0;"><span class="dot" style="background:var(--cyan);"></span>${esc(scene.kicker || KICK.security).toUpperCase().slice(0, 26)}</span>
    <div class="flap h-flap2" id="${id}-l1" data-text="${esc(head)}" style="margin-top:1.7cqw;"></div>
    <div class="scan-row">${tagHtml}</div>
  </div>
  <div id="${id}-beam" class="beam" data-layout-allow-occlusion></div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo("#${id}-chip",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `flapTo($("#${id}-l1"),${r(T + 0.4)},{seed:40,per:0.032});`,
    `tl.fromTo("#${id} .scan-tag",{opacity:0,y:24},{opacity:1,y:0,duration:0.45,ease:"power2.out",stagger:0.08},${r(T + 1.0)});`,
    `tl.fromTo("#${id}-beam",{x:-100,opacity:0},{x:2020,opacity:1,duration:${r(Math.max(1.4, L - 2.4))},ease:"none"},${r(T + 1.8)});`,
    `tl.to("#${id}-beam",{opacity:0,duration:0.25},${r(T + L - 0.8)});`,
    ...tags.flatMap((t, i) => {
      const hit = r(T + 2.0 + i * 0.2);
      return [
        `tl.to("#${id}-t${i}",{backgroundColor:"rgba(95,212,230,0.9)",color:"#08222A",duration:0.14,yoyo:true,repeat:1,ease:"none"},${hit});`,
        `tl.fromTo("#${id}-t${i} .ok",{opacity:0,scale:0.3},{opacity:1,scale:1,duration:0.35,ease:"back.out(2.2)"},${r(hit + 0.2)});`,
      ];
    }),
  ];
  return { html, s };
}

// GATE MONITOR — a real screenshot mounted in a FIDS display bezel: dark frame, a yellow
// "GATE K·F — LIVE" header bar, the screenshot inside, a soft scan sweep. The signature
// flap headline + supporting copy sit beside it.
function tScreen(scene, ctx, asset) {
  const { id, T, L, theme } = ctx;
  const ratio = Number(asset.ratio) || (asset.width && asset.height ? asset.width / asset.height : 0);
  const portrait = ratio && ratio < 0.9;
  const monW = portrait ? "24cqw" : "46cqw";
  const monH = portrait ? "38cqw" : "27cqw";
  const fit = portrait ? "contain" : "cover";
  const pos = asset.cropFocus || "top center";
  const head = flapText(scene.headline || "SEE IT LIVE", 22);
  const feats = featureLines(scene, 3);
  const featHtml = feats.length
    ? `<ul class="feat">${feats.map((f, i) => `<li class="${id}-fi" style="opacity:0;"><span class="feat-sq" style="background:${[theme.yellow, theme.cyan, theme.green][i % 3]};"></span>${esc(String(f).slice(0, 40))}</li>`).join("")}</ul>` : "";
  const sub = scene.subtext ? `<div class="sub" id="${id}-sub" style="opacity:0;margin-top:1.2cqw;">${esc(String(scene.subtext).slice(0, 70))}</div>` : "";
  const html = `${open(id, ctx)}<div class="safe" style="flex-direction:row;gap:5cqw;text-align:left;align-items:center;">
    <div class="fids" id="${id}-mon" style="opacity:0;width:${monW};">
      <div class="fids-head"><span class="fids-led"></span>GATE K·F — LIVE<span class="fids-time">ON TIME</span></div>
      <div class="fids-screen" style="height:${monH};"><img src="${esc(asset.path)}" alt="${esc(asset.alt || "screenshot")}" style="object-fit:${fit};object-position:${esc(pos)};"><div class="fids-scan" id="${id}-scan"></div></div>
    </div>
    <div style="max-width:38cqw;">
      <span class="chip" id="${id}-chip" style="opacity:0;"><span class="dot"></span>${esc(scene.kicker || KICK.screen).toUpperCase().slice(0, 22)}</span>
      <div class="flap h-flap3-big" id="${id}-l1" data-text="${esc(head)}" style="margin-top:1.4cqw;"></div>
      ${sub}
      ${featHtml}
    </div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo("#${id}-mon",{opacity:0,y:-70,rotation:-2,transformOrigin:"50% -6cqw"},{opacity:1,y:0,rotation:0,duration:1.1,ease:"elastic.out(1, 0.5)"},${r(T + 0.4)});`,
    `tl.fromTo("#${id}-scan",{yPercent:-120,opacity:0.7},{yPercent:120,opacity:0.7,duration:${r(Math.max(1.6, L - 1.4))},ease:"none",repeat:${Math.max(1, Math.floor((L - 1.4) / 2))}},${r(T + 1.2)});`,
    `tl.fromTo("#${id}-chip",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.7)});`,
    `flapTo($("#${id}-l1"),${r(T + 0.9)},{seed:45,per:0.03});`,
    sub ? `tl.fromTo("#${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.5)});` : "",
    feats.length ? `tl.fromTo("#${id} .${id}-fi",{opacity:0,x:-24},{opacity:1,x:0,duration:0.45,ease:"back.out(1.7)",stagger:0.15},${r(T + 1.8)});` : "",
  ].filter(Boolean);
  return { html, s };
}

function tCta(scene, ctx) {
  const { id, T, L, theme } = ctx;
  const mark = flapText(scene.headline || scene.title || "KEYFRAME", 14);
  const sub = esc(String(scene.subtext || scene.voiceover || "your film boards in one sentence").replace(/\s+/g, " ").trim()).slice(0, 60);
  const cta = esc(String(scene.emphasis || "Board now — free").slice(0, 26));
  const html = `${open(id, ctx)}<div class="safe">
    <span class="chip red" id="${id}-chip" style="opacity:0;"><span class="dot" style="background:var(--red);"></span>${esc(scene.kicker || KICK.cta).toUpperCase().slice(0, 18)}</span>
    <div class="flap h-flap gold" id="${id}-l1" data-text="${esc(mark)}" style="margin-top:2.2cqw;font-size:6.4cqw;"></div>
    <div class="sub" id="${id}-sub" style="opacity:0;margin-top:1.6cqw;">${sub}</div>
    <div class="cta" id="${id}-cta" style="opacity:0;margin-top:2.6cqw;">${cta} <span>&#8594;</span></div>
  </div>
  <svg id="${id}-fly" ${FLYSVG}>
    <path id="${id}-route" d="M240 300 C 700 260, 1200 220, 1760 110" pathLength="100" fill="none" stroke="rgba(255,198,26,0.4)" stroke-width="3" stroke-dasharray="1 2.4" stroke-dashoffset="100"/>
    <g id="${id}-plane" opacity="0"><path d="M0 0 L40 9 L0 18 L9 9 Z M-9 4 L2 9 L-9 14 Z" fill="#FFC61A" transform="translate(-20,-9) scale(1.1)"/></g>
  </svg></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo("#${id}-chip",{opacity:0,y:-18},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.15)});`,
    `tl.to("#${id}-chip",{opacity:0.4,duration:0.35,ease:"none",yoyo:true,repeat:5},${r(T + 0.7)});`,
    `flapTo($("#${id}-l1"),${r(T + 0.5)},{seed:50,cycles:4,step:0.08});`,
    `tl.fromTo("#${id}-sub",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.6)});`,
    `tl.fromTo("#${id}-cta",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.55,ease:"back.out(1.7)"},${r(T + 2.0)});`,
    `tl.to("#${id}-cta",{scale:1.06,duration:0.5,ease:"sine.inOut",yoyo:true,repeat:${Math.max(1, Math.floor((L - 2.6) / 0.5))}},${r(T + 2.6)});`,
    `tl.to("#${id}-route",{strokeDashoffset:0,duration:1.2,ease:"power1.inOut"},${r(T + 2.1)});`,
    `tl.fromTo("#${id}-plane",{opacity:0},{opacity:1,duration:0.2},${r(T + 2.15)});`,
    `tl.fromTo("#${id}-plane",{x:240,y:300,rotation:-6},{x:900,y:250,rotation:-8,duration:0.6,ease:"none"},${r(T + 2.15)});`,
    `tl.to("#${id}-plane",{x:1760,y:110,rotation:-16,duration:${r(Math.max(0.5, L - 2.77))},ease:"none"},${r(T + 2.77)});`,
  ];
  return { html, s };
}

const BUILDERS = { hook: tHook, board: tBoard, signs: tSigns, baggage: tBaggage, security: tSecurity, screen: tScreen, cta: tCta };

// ---- hall chrome (content-independent) ---------------------------------------
function chromeHtml(theme, title) {
  const mast = esc(String(title || "KEYFRAME").toUpperCase()).slice(0, 22);
  return `
  <div id="hall" class="clip" data-start="0" data-duration="__D__" data-track-index="0" data-layout-allow-occlusion>
    <div id="hall-sweep"></div><div id="vig"></div>
  </div>
  <div id="chrome" class="clip" data-start="0" data-duration="__D__" data-track-index="19" data-layout-allow-occlusion style="opacity:0;">
    <div id="masthead"><i></i>${mast} · TERMINAL 9 · DEPARTURES</div>
    <div id="clockbox">
      <svg id="aclock" width="110" height="110" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="#0B0C0F" stroke="rgba(242,238,227,0.25)" stroke-width="3"/>
        <g stroke="rgba(242,238,227,0.4)" stroke-width="3"><line x1="60" y1="10" x2="60" y2="20"/><line x1="60" y1="100" x2="60" y2="110"/><line x1="10" y1="60" x2="20" y2="60"/><line x1="100" y1="60" x2="110" y2="60"/></g>
        <line id="ah-min" x1="60" y1="60" x2="60" y2="22" stroke="#F2EEE3" stroke-width="5" stroke-linecap="round"/>
        <line id="ah-sec" x1="60" y1="66" x2="60" y2="16" stroke="#FFC61A" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="60" cy="60" r="4.5" fill="#FFC61A"/>
      </svg>
    </div>
    <div id="ticker-band"><div class="tick-row" id="tick1">
      <span>ALL FILMS DEPART ON TIME <b>·</b> NO CREW <b>·</b> NO TIMELINE <b>·</b> NO RENDER FARM <b>·</b> TYPE A SENTENCE, CATCH A PREMIERE <b>·</b></span>
      <span>ALL FILMS DEPART ON TIME <b>·</b> NO CREW <b>·</b> NO TIMELINE <b>·</b> NO RENDER FARM <b>·</b> TYPE A SENTENCE, CATCH A PREMIERE <b>·</b></span>
    </div></div>
  </div>
  <div id="caps" class="clip" data-start="0" data-duration="__D__" data-track-index="20"><div id="cap-pill"><div id="cap-text"></div></div></div>`;
}

function styleBlock(theme) {
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#0A0B0E; }
  #root { position:relative; overflow:hidden; isolation:isolate; container-type:size; color:var(--ivory); font-family:${theme.displayStack};
    background:
      linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 18%),
      repeating-linear-gradient(90deg, rgba(255,255,255,0.016) 0 2px, transparent 2px 240px),
      linear-gradient(180deg, #17181D 0%, #121317 55%, #0C0D11 100%);
    --board:${theme.board}; --cell:${theme.cell}; --ivory:${theme.ivory}; --dim:${theme.dim};
    --yellow:${theme.yellow}; --green:${theme.green}; --red:${theme.red}; --cyan:${theme.cyan}; --line:${theme.line}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:10% 7% 12%; text-align:center; }
  /* split-flap cells */
  .flap { display:flex; gap:0.28em; justify-content:center; flex-wrap:wrap; }
  .fc { display:inline-flex; align-items:center; justify-content:center; width:0.92em; height:1.34em;
        background:linear-gradient(180deg,#15161C 0%,#101116 48%,#0A0B0E 52%,#0E0F13 100%); border-radius:0.09em;
        color:var(--ivory); font-weight:700; position:relative; will-change:transform;
        box-shadow:inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -2px 5px rgba(0,0,0,0.55), 0 0.06em 0 #000; }
  .fc::after { content:""; position:absolute; left:0; right:0; top:calc(50% - 1px); height:2px; background:rgba(0,0,0,0.75); }
  .fc.sp { background:rgba(16,17,22,0.4); box-shadow:none; } .fc.sp::after { display:none; }
  .flap.gold .fc { color:var(--yellow); } .flap.grn .fc { color:var(--green); }
  .h-flap { font-size:5.4cqw; letter-spacing:0.02em; font-weight:700; }
  .h-flap2 { font-size:3.4cqw; font-weight:700; }
  .h-flap3-big { font-size:3cqw; font-weight:700; }
  .chip { display:inline-flex; align-items:center; gap:0.8cqw; padding:0.6cqw 1.7cqw; border-radius:0.4cqw; background:var(--board);
          border:1px solid var(--line); font-family:${theme.monoStack}; font-weight:600; font-size:1.15cqw; letter-spacing:0.3em; text-transform:uppercase; color:var(--yellow); }
  .chip.red { border-color:rgba(255,75,62,0.6); color:var(--red); }
  .chip .dot { width:0.7cqw; height:0.7cqw; border-radius:50%; background:var(--yellow); }
  .sub { font-family:${theme.monoStack}; font-weight:500; font-size:1.6cqw; color:var(--dim); letter-spacing:0.06em; }
  /* chrome */
  #hall-sweep { position:absolute; top:-10%; bottom:-10%; width:26%; opacity:0.9; pointer-events:none; transform:skewX(-14deg);
                background:linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent); }
  #vig { position:absolute; inset:0; pointer-events:none; background:radial-gradient(120% 115% at 50% 40%, transparent 52%, rgba(0,0,0,0.55) 100%); }
  #masthead { position:absolute; left:3.2cqw; top:3cqw; display:flex; align-items:center; gap:1.2cqw; font-family:${theme.monoStack};
              font-weight:700; font-size:1.2cqw; letter-spacing:0.3em; text-transform:uppercase; color:var(--ivory); }
  #masthead i { width:0.85cqw; height:0.85cqw; border-radius:50%; background:var(--yellow); display:inline-block; }
  #clockbox { position:absolute; right:3.2cqw; top:2.2cqw; }
  #ticker-band { position:absolute; left:0; right:0; bottom:0; height:3.4cqw; background:var(--board); border-top:2px solid var(--yellow); overflow:hidden; display:flex; align-items:center; }
  .tick-row { position:absolute; left:0; display:flex; gap:4cqw; white-space:nowrap; will-change:transform; font-family:${theme.monoStack};
              font-weight:600; font-size:1.1cqw; letter-spacing:0.28em; text-transform:uppercase; color:var(--dim); }
  .tick-row b { color:var(--yellow); font-weight:600; }
  /* departures board */
  .brd { width:74cqw; border:1px solid var(--line); background:rgba(11,12,15,0.75); border-radius:0.6cqw; overflow:hidden; }
  .brd-head { display:flex; padding:0.9cqw 2cqw; font-family:${theme.monoStack}; font-size:1cqw; font-weight:600; letter-spacing:0.3em; color:var(--dim); border-bottom:1px solid var(--line); text-transform:uppercase; }
  .brd-row { display:flex; align-items:center; padding:0.85cqw 2cqw; border-top:1px solid rgba(242,238,227,0.06); }
  .col-f { width:16%; text-align:left; font-family:${theme.monoStack}; font-weight:700; font-size:1.5cqw; color:var(--dim); }
  .col-d { flex:1; text-align:left; } .col-s { width:26%; display:flex; justify-content:flex-end; }
  .b-flap { font-size:1.75cqw; } .s-flap { font-family:${theme.monoStack}; font-size:1.35cqw; }
  .brd .flap { justify-content:flex-start; }
  /* hanging gate signs */
  .sign-wrap { position:relative; width:20cqw; }
  .sign-rod { position:absolute; left:50%; top:-9cqw; width:0.22cqw; height:9cqw; background:#3A3C44; margin-left:-0.11cqw; }
  .sign-rod.r2 { left:20%; } .sign-rod.r3 { left:80%; }
  .sign { background:var(--board); border:1px solid var(--line); border-radius:1cqw; padding:2cqw 1.6cqw 1.6cqw;
          box-shadow:0 1.6cqw 3.6cqw rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06); transform-origin:50% -9cqw; will-change:transform; }
  .sign .g-flap { justify-content:center; flex-wrap:nowrap; } .sign .g-cap { margin-top:1cqw; font-family:${theme.monoStack}; font-size:1.05cqw; letter-spacing:0.24em; text-transform:uppercase; color:var(--dim); }
  /* baggage belt */
  .belt { position:absolute; left:0; right:0; top:56%; height:12cqw; border-top:2px solid #2A2C34; border-bottom:2px solid #000;
          background:linear-gradient(180deg,#1B1D23 0%,#14151A 20%,#101116 80%,#0B0C0F 100%); }
  .belt-slats { position:absolute; inset:0; background:repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 0.35cqw, transparent 0.35cqw 4cqw); }
  .case { position:absolute; width:12cqw; height:8cqw; border-radius:0.9cqw; will-change:transform; border:0.22cqw solid rgba(0,0,0,0.5);
          box-shadow:0 1cqw 2cqw rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.12); }
  .case::before { content:""; position:absolute; left:32%; right:32%; top:-1.5cqw; height:1.7cqw; border:0.35cqw solid rgba(0,0,0,0.55); border-bottom:none; border-radius:0.7cqw 0.7cqw 0 0; }
  .case .tag { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%) rotate(-3deg); background:var(--ivory); color:#15161A;
               font-family:${theme.monoStack}; font-weight:700; font-size:1cqw; letter-spacing:0.12em; padding:0.35cqw 0.9cqw; border-radius:0.25cqw; white-space:nowrap; }
  /* security scan */
  .scan-row { display:flex; gap:1.6cqw; flex-wrap:wrap; justify-content:center; max-width:78cqw; margin-top:3.4cqw; }
  .scan-tag { display:inline-flex; align-items:center; gap:0.7cqw; padding:0.85cqw 1.7cqw; border-radius:0.45cqw; background:var(--board);
              border:1px solid var(--line); font-family:${theme.monoStack}; font-weight:600; font-size:1.35cqw; letter-spacing:0.06em; color:var(--ivory); position:relative; will-change:transform; }
  .scan-tag i { width:0.85cqw; height:0.85cqw; border-radius:0.2cqw; background:var(--yellow); display:inline-block; }
  .scan-tag .ok { position:absolute; right:-0.7cqw; top:-0.7cqw; width:1.7cqw; height:1.7cqw; border-radius:50%; background:var(--green); color:#062;
                  font-weight:700; font-size:1cqw; display:flex; align-items:center; justify-content:center; opacity:0; }
  .beam { position:absolute; top:26%; bottom:24%; width:4cqw; opacity:0; pointer-events:none; box-shadow:0 0 3cqw rgba(95,212,230,0.4);
          background:linear-gradient(90deg, transparent, rgba(95,212,230,0.45) 45%, rgba(95,212,230,0.7) 50%, rgba(95,212,230,0.45) 55%, transparent); }
  /* gate monitor (screenshot) */
  .fids { flex:0 0 auto; background:#050609; border:0.4cqw solid #1B1D24; border-radius:0.9cqw; padding:0.7cqw;
          box-shadow:0 1.6cqw 4cqw rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05); transform-origin:50% -6cqw; will-change:transform; }
  .fids-head { display:flex; align-items:center; gap:0.7cqw; font-family:${theme.monoStack}; font-weight:700; font-size:1cqw; letter-spacing:0.22em;
               text-transform:uppercase; color:#141308; background:var(--yellow); padding:0.5cqw 1cqw; border-radius:0.3cqw; }
  .fids-head .fids-led { width:0.7cqw; height:0.7cqw; border-radius:50%; background:#141308; }
  .fids-head .fids-time { margin-left:auto; }
  .fids-screen { position:relative; width:100%; overflow:hidden; margin-top:0.7cqw; border-radius:0.4cqw; background:#000; }
  .fids-screen img { position:absolute; inset:0; width:100%; height:100%; display:block; }
  .fids-scan { position:absolute; left:0; right:0; height:30%; pointer-events:none; background:linear-gradient(180deg, transparent, rgba(95,212,230,0.14), transparent); }
  .feat { list-style:none; margin-top:1.4cqw; display:flex; flex-direction:column; gap:0.85cqw; }
  .feat li { display:flex; align-items:center; gap:1cqw; font-family:${theme.monoStack}; font-weight:600; font-size:1.35cqw; color:var(--ivory); }
  .feat-sq { width:1.1cqw; height:1.1cqw; flex:0 0 auto; border-radius:0.15cqw; }
  /* cta */
  .cta { display:inline-flex; align-items:center; gap:1.1cqw; font-family:${theme.displayStack}; font-weight:700; font-size:2.4cqw; letter-spacing:0.04em;
         text-transform:uppercase; color:#141308; background:var(--yellow); padding:1.4cqw 3.6cqw; border-radius:0.55cqw;
         box-shadow:0 0 0 0.35cqw rgba(255,198,26,0.2), 0 1.4cqw 3cqw rgba(0,0,0,0.5); will-change:transform; }
  /* captions */
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:5.6%; z-index:50; pointer-events:none; }
  #cap-pill { max-width:74%; height:fit-content; flex:0 0 auto; text-align:center; padding:0.85cqw 2.3cqw; border-radius:0.45cqw; opacity:0; background:rgba(11,12,15,0.9); border:1px solid rgba(255,198,26,0.5); }
  #cap-text { font-family:${theme.monoStack}; font-weight:600; font-size:1.4cqw; line-height:1.35; color:var(--ivory); }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets } = {}) {
  const theme = terminalTheme();
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1920, H = (dims && dims.height) || 1080;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length ? sb.scenes.slice(0, 12) : [{ id: "s1", start: 0, duration: 4, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);

  const images = (Array.isArray(assets) ? assets : []).filter(screenOk).sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const byScene = new Map();
  const pool = [];
  for (const a of images) { const sid = a.sceneId != null ? String(a.sceneId) : null; if (sid && !byScene.has(sid)) byScene.set(sid, a); else pool.push(a); }
  let pooli = 0;

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [], sceneScripts = [], sceneStarts = [];
  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 4);
    let arch = archetype(scene, i, scenes.length);
    let asset = null;
    const sid = scene.id != null ? String(scene.id) : `s${i + 1}`;
    const ends = arch === "hook" || arch === "cta";
    // A real screenshot claims its scene as a gate monitor; leftover images go to any
    // middle scene that would otherwise be a plain security/board frame.
    if (!ends && byScene.has(sid)) { arch = "screen"; asset = byScene.get(sid); }
    else if (!ends && (arch === "security" || arch === "board") && pooli < pool.length) { arch = "screen"; asset = pool[pooli++]; }
    const ctx = { id: `s${i + 1}`, T, L, i, isLast: i === scenes.length - 1, track: 2 + i, dims: { width: W, height: H }, theme };
    const built = (BUILDERS[arch] || tSecurity)(scene, ctx, asset);
    bodyParts.push(built.html);
    sceneStarts.push(T);
    sceneScripts.push(built.s.join("\n"));
    if (!ctx.isLast) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const chrome = chromeHtml(theme, sb.title).replace(/__D__/g, String(D));

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  var $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s));};
  function r(v){return Math.round(v*100)/100;}
  function reps(t,c){return Math.max(0,Math.floor(t/c)-1);}
  function kill(id,t){tl.set(id,{opacity:0},t);}

  /* ===== SPLIT-FLAP ENGINE (deterministic, seeded — NO Math.random) ===== */
  var ALPHA="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·-.:%";
  function initFlap(el){var text=el.getAttribute("data-text")||"";el.textContent="";var cells=[];
    for(var i=0;i<text.length;i++){var ch=text[i];var c=document.createElement("span");c.className="fc"+(ch===" "?" sp":"");c.textContent="";el.appendChild(c);cells.push({el:c,target:ch});}
    el.__cells=cells;return cells;}
  function flapTo(el,at,opts){if(!el)return;var o=opts||{};var cells=el.__cells||initFlap(el);
    var per=o.per!=null?o.per:0.045;var step=o.step!=null?o.step:0.07;
    cells.forEach(function(c,k){if(c.target===" ")return;
      var cycles=(o.cycles!=null?o.cycles:3)+((k*7+(o.seed||0))%3);var start=r(at+k*per);
      for(var j=0;j<cycles;j++){var ch=ALPHA[(k*31+j*17+(o.seed||0)*13)%ALPHA.length];tl.set(c.el,{textContent:ch},r(start+j*step));}
      tl.set(c.el,{textContent:c.target},r(start+cycles*step));
      tl.fromTo(c.el,{scaleY:1},{scaleY:0.12,duration:step/2,yoyo:true,repeat:cycles*2-1,ease:"none"},start);});}
  $$("[data-text]").forEach(initFlap);

  /* ===== HALL CHROME ===== */
  tl.fromTo("#chrome",{opacity:0},{opacity:1,duration:0.7},0.2);
  tl.fromTo("#masthead",{x:-26,opacity:0},{x:0,opacity:1,duration:0.5,ease:"power2.out"},0.6);
  tl.fromTo("#hall-sweep",{xPercent:-160},{xPercent:850,duration:8,ease:"sine.inOut",repeat:reps(D,8)},0.5);
  tl.fromTo("#ah-sec",{rotation:0,svgOrigin:"60 60"},{rotation:${Math.round(D / 60 * 360) || 360},svgOrigin:"60 60",duration:D,ease:"none"},0);
  tl.fromTo("#ah-min",{rotation:0,svgOrigin:"60 60"},{rotation:${r(D / 60 * 6)},svgOrigin:"60 60",duration:D,ease:"none"},0);
  tl.fromTo("#tick1",{xPercent:0},{xPercent:-50,duration:16,ease:"none",repeat:reps(D,16)},0);

  /* ===== SCENES ===== */
  ${sceneScripts.join("\n  ")}

  /* ===== CAPTIONS — one proxy, seek-safe ===== */
  var cues=${JSON.stringify(cues)};
  tl.to({},{duration:D,ease:"none",onUpdate:function(){
    var now=tl.time();var cap=$("#cap-pill"),txt=$("#cap-text");if(!cap||!txt)return;
    var a=null;for(var k=0;k<cues.length;k++){if(now>=cues[k][0]&&now<cues[k][1]){a=cues[k];break;}}
    if(a){if(txt.textContent!==a[2])txt.textContent=a[2];cap.style.opacity="1";}else cap.style.opacity="0";
  }},0);

  window.__timelines=window.__timelines||{};
  window.__timelines["vid"]=tl;
  if(typeof navigator==="undefined"||!navigator.webdriver){tl.play(0);tl.eventCallback("onComplete",function(){tl.restart();});}
})();`;

  const indexHtml = [
    `<!DOCTYPE html>`, `<html lang="en">`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="${GSAP_CDN}"></script>`,
    `<style>`, styleBlock(theme), `</style>`, `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
    chrome, bodyParts.join("\n"), `</div>`,
    `<script>`, script, `</script>`, `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson };
}

module.exports = { buildComposition };
