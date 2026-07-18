// BAUHAUS RIOT composer — a native GSAP + SVG/CSS "print poster that came alive".
// The pack `bauhaus-riot` (manifest renderer:"bauhaus-riot") routes here from
// attemptLlmComposition, like the flagship / brightlife / blueprint / bloom composers.
//
// Same envelope as the others: buildComposition -> {indexHtml, metaJson}. A persistent
// PAPER chrome (cream ground, halftone dots, breathing primary-color geometry, a
// numbered sheet masthead + frame) is content-independent; each storyboard scene is
// injected into a bauhaus SCENE-TYPE (title / recipe / stats / manifesto / figure / cta),
// or — when a real screenshot/photo is available — a POSTER-FRAMED panel (plate).
//
// Motion grammar: stamps snap flat, shapes drop and bounce, a curtain wipe lifts on
// the opener, X-marks strike, a highlight sweeps. NO gradients / glows / blur.
//
// Engineering contract (identical to the other composers): one paused GSAP timeline on
// window.__timelines["vid"]; direct-child .clip scenes on unique tracks; a boundary
// opacity:0 hard-kill per scene (the paper persists behind them); ONE seek-safe caption
// node + sheet counter driven by a single onUpdate proxy; finite repeats; pathLength=100
// draw-ons; cqw units + container-type:size; hidden = opacity:0 only. Deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
const DISPLAY = "Archivo Black";
const MONO = "Space Grotesk";
const BODY = "Inter";

// ---- helpers -----------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;

function riotTheme() {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  return {
    paper: "#F4EEE1", cream: "#FFFDF6", ink: "#17161B", body: "#3F3D45",
    red: "#E4432C", blue: "#2B4BD7", yellow: "#F2C21F",
    displayStack: `'${DISPLAY}', 'Inter', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace,
  };
}

// Headline split into <span class="word shadow-*"> with alternating red/blue drop
// shadows; the emphasis word always takes the red shadow. Used with the stamp-in.
function words(scene) {
  const H = String(scene.headline || scene.title || "");
  const E = String(scene.emphasis || "").trim().toLowerCase();
  return H.split(/\s+/).filter(Boolean).map((w, i) => {
    const bare = w.replace(/[.,!?;:]$/, "").toLowerCase();
    const sh = (E && bare === E) ? "shadow-red" : (i % 2 ? "shadow-blue" : "shadow-red");
    return `<span class="word ${sh}">${esc(w)}</span>`;
  }).join(" ");
}

function pickNumber(scene) {
  const src = [scene.emphasis, scene.subtext, scene.headline].map((x) => String(x || "")).find((x) => /\d/.test(x)) || "";
  const m = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)\s?(%|x|\+|k|m|bn?)?/i.exec(src);
  if (!m) return null;
  const target = Math.round(parseFloat(m[2].replace(/,/g, "")));
  if (!isFinite(target)) return null;
  return { pre: m[1] || "", target: Math.min(Math.max(target, 0), 100000), suf: (m[3] || "") };
}

function bullets(scene, n) {
  let list = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean) : [];
  if (!list.length && scene.subtext) list = String(scene.subtext).split(/[.;\n•]|\s—\s/).map((s) => s.trim()).filter((s) => s.length > 2);
  return list.slice(0, n).map((s) => String(s));
}

function pickStats(scene, max) {
  const out = [];
  for (const l of (Array.isArray(scene.onScreenText) ? scene.onScreenText : [])) {
    const m = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)\s?(%|x|\+|k|m)?/i.exec(String(l));
    if (m) out.push({ pre: m[1] || "", target: Math.round(parseFloat(m[2].replace(/,/g, ""))), suf: (m[3] || ""), label: String(l).replace(m[0], "").trim().slice(0, 24) || "metric" });
    if (out.length >= max) break;
  }
  if (!out.length) { const n = pickNumber(scene); if (n) out.push({ ...n, label: String(scene.subtext || scene.headline || "metric").slice(0, 24) }); }
  return out.slice(0, max);
}

// Supporting feature lines (from onScreenText, else voiceover sentences) to fill copy.
function featureLines(scene, n) {
  let src = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean).map(String) : [];
  if (src.length < 2 && scene.voiceover) src = src.concat(String(scene.voiceover).split(/[.!?;\n]|\s—\s/));
  const head = String(scene.headline || "").toLowerCase().trim();
  const sub = String(scene.subtext || "").toLowerCase().trim();
  const seen = new Set(), out = [];
  for (const s of src) {
    const t = String(s).replace(/\s+/g, " ").trim();
    const k = t.toLowerCase();
    if (t.length >= 5 && t.length <= 66 && k !== head && k !== sub && !seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out.slice(0, n);
}

// A square-bulleted feature list + staggered stamp-in. `__AT__` placeholder replaced.
function featList(id, scene, theme) {
  const feats = featureLines(scene, 3);
  if (!feats.length) return { html: "", s: [] };
  const cols = [theme.red, theme.blue, theme.yellow];
  const html = `<ul class="riot-feat" id="${id}-feat">${feats.map((f, i) => `<li class="${id}-fi" style="opacity:0;"><span class="riot-sq" style="background:${cols[i % 3]};"></span>${esc(f)}</li>`).join("")}</ul>`;
  const s = [`tl.fromTo(".${id}-fi",{opacity:0,x:-26},{opacity:1,x:0,duration:0.45,ease:"back.out(1.7)",stagger:0.15},__AT__);`];
  return { html, s };
}

function plateOk(a) {
  if (!a || !a.path) return false;
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  const src = String(a.source || "").toLowerCase();
  return a.source === "website" || a.source === "blog" || src.startsWith("library") || a.visionOk === true || a.cdProminence === "hero" || a.cdProminence === "support";
}

function riotArchetype(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "title";
  if (i === total - 1 || k === "cta" || p === "cta") return "cta";
  if (k === "chart" || k === "stat" || k === "countdown" || pickNumber(scene)) return "stats";
  if (k === "quote" || p === "problem" || p === "comparison") return "manifesto";
  if (bullets(scene, 3).length >= 2 || /how|process|step|feature/.test(p + k)) return "recipe";
  return "figure";
}

const KICK = { title: "AI motion press", recipe: "the recipe — three moves", stats: "the catalogue", manifesto: "the manifesto", figure: "quality control", plate: "the proof — page one", cta: "print your first film" };

// ---- scene-type builders  ((scene, ctx, asset) -> { html, s }) ----------------
function open(id, ctx) { return `<div class="clip riot-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

function riotTitle(scene, ctx) {
  const { id, T, theme, land = true } = ctx;
  const kick = esc(scene.kicker || KICK.title).toUpperCase();
  const sub = esc(scene.subtext || "Type a sentence — get a poster-grade film.");
  const curtain = ctx.i === 0
    ? `<div class="bar" id="${id}-cur1" style="left:0;background:${theme.red};"></div><div class="bar" id="${id}-cur2" style="left:33%;background:${theme.blue};"></div><div class="bar" id="${id}-cur3" style="left:66%;width:34.2%;background:${theme.yellow};"></div>`
    : "";
  const html = `${open(id, ctx)}<div class="safe">
    <span class="kicker" id="${id}-kick" style="opacity:0;"><span class="sq"></span>${kick}</span>
    <div class="display" id="${id}-head" style="margin-top:2.2cqw;font-size:${(scene.headline && scene.headline.length > 22 ? (land ? 7 : 9.5) : (land ? 9 : 12))}cqw;">${words(scene)}</div>
    <div id="${id}-bar" style="width:${land ? 30 : 48}cqw;height:0.75cqw;background:${theme.red};margin-top:1.8cqw;transform:scaleX(0);"></div>
    <div class="body" id="${id}-sub" style="opacity:0;margin-top:1.8cqw;font-size:${land ? 2.1 : 3.2}cqw;">${sub}</div>
  </div>
  <svg id="${id}-aster" width="170" height="170" viewBox="0 0 100 100" style="position:absolute;right:16cqw;top:16cqw;opacity:0;" data-layout-allow-occlusion>
    <g stroke="${theme.red}" stroke-width="11" stroke-linecap="round"><line x1="50" y1="4" x2="50" y2="96"/><line x1="4" y1="50" x2="96" y2="50"/><line x1="17" y1="17" x2="83" y2="83"/><line x1="83" y1="17" x2="17" y2="83"/></g></svg>
  ${curtain}</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    ...(ctx.i === 0 ? [
      `tl.fromTo("#${id}-cur1",{scaleY:1},{scaleY:0,duration:0.75,ease:"power4.inOut"},${r(T + 0.25)});`,
      `tl.fromTo("#${id}-cur2",{scaleY:1},{scaleY:0,duration:0.75,ease:"power4.inOut"},${r(T + 0.4)});`,
      `tl.fromTo("#${id}-cur3",{scaleY:1},{scaleY:0,duration:0.75,ease:"power4.inOut"},${r(T + 0.55)});`,
    ] : [`tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`]),
    `tl.fromTo("#${id}-kick",{opacity:0,y:-22},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.0)});`,
    `stamp("#${id}-head .word",${r(T + 1.2)},-4,0.09);`,
    `tl.fromTo("#${id}-bar",{scaleX:0},{scaleX:1,duration:0.55,ease:"power3.inOut"},${r(T + 1.95)});`,
    `tl.fromTo("#${id}-sub",{opacity:0,y:22},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 2.2)});`,
    `tl.fromTo("#${id}-aster",{opacity:0,scale:0,rotation:-160,transformOrigin:"center center"},{opacity:1,scale:1,rotation:0,duration:0.65,ease:"back.out(1.8)"},${r(T + 1.75)});`,
    `tl.to("#${id}-aster",{rotation:90,duration:${r(Math.max(1.5, ctx.L - 2))},ease:"sine.inOut"},${r(T + 2.5)});`,
  ];
  return { html, s };
}

function riotRecipe(scene, ctx) {
  const { id, T, theme, land = true } = ctx;
  let items = bullets(scene, 3);
  if (items.length < 2) items = ["Write", "Direct", "Render"];
  const shapeFor = (i) => i % 3 === 0
    ? `<div style="width:11cqw;height:11cqw;border-radius:50%;background:${theme.yellow};border:0.24cqw solid ${theme.ink};box-shadow:0.5cqw 0.5cqw 0 ${theme.ink};"></div>`
    : i % 3 === 1
      ? `<svg width="220" height="220" viewBox="0 0 100 100" style="width:11cqw;height:11cqw;overflow:visible;"><polygon points="50 5 97 95 3 95" fill="${theme.red}" stroke="${theme.ink}" stroke-width="5"/></svg>`
      : `<div style="width:11cqw;height:11cqw;background:${theme.blue};border:0.24cqw solid ${theme.ink};box-shadow:0.5cqw 0.5cqw 0 ${theme.ink};"></div>`;
  // Portrait stacks the three moves vertically — the horizontal row + labels
  // collided with the headline on a 9:16 sheet. Arrows point down there.
  const arrow = land
    ? () => `<svg class="${id}-arr" width="120" height="60" viewBox="0 0 100 50" style="margin-top:4.6cqw;overflow:visible;flex:0 0 auto;">
      <path class="draw" pathLength="100" d="M4 25 H74" fill="none" stroke="${theme.ink}" stroke-width="9" stroke-linecap="round"/>
      <polygon class="${id}-arrh" points="70 8 98 25 70 42" fill="${theme.ink}" opacity="0"/></svg>`
    : () => `<svg class="${id}-arr" width="60" height="72" viewBox="0 0 50 60" style="overflow:visible;flex:0 0 auto;">
      <path class="draw" pathLength="100" d="M25 4 V38" fill="none" stroke="${theme.ink}" stroke-width="9" stroke-linecap="round"/>
      <polygon class="${id}-arrh" points="8 34 25 56 42 34" fill="${theme.ink}" opacity="0"/></svg>`;
  const cells = items.map((t, i) => {
    const parts = String(t).split(/[:—-]\s?/);
    const label = (parts[0] || t).trim().slice(0, 14);
    return `<div class="recipe-item"><div class="${id}-shape" style="opacity:0;">${shapeFor(i)}</div><div class="recipe-label ${id}-lab" style="opacity:0;">${esc(label)}</div></div>`;
  });
  const row = cells.slice(1).reduce((acc, c) => acc + arrow() + c, cells[0]);
  const html = `${open(id, ctx)}<div class="safe">
    <span class="kicker" id="${id}-kick" style="opacity:0;"><span class="sq" style="background:${theme.blue};"></span>${esc(scene.kicker || KICK.recipe).toUpperCase()}</span>
    <h1 class="h1" id="${id}-head" style="margin-top:1.6cqw;">${words(scene)}</h1>
    <div style="display:flex;flex-direction:${land ? "row" : "column"};gap:${land ? 5 : 1.4}cqw;margin-top:3cqw;align-items:${land ? "flex-start" : "center"};justify-content:center;">${row}</div>
  </div></div>`;
  const per = Math.max(0.18, (ctx.L - 2.2) / items.length * 0.5);
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo("#${id}-kick",{opacity:0,y:-22},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.15)});`,
    `tl.fromTo("#${id}-head .word",{yPercent:105,opacity:0},{yPercent:0,opacity:1,duration:0.55,ease:"power3.out",stagger:0.1},${r(T + 0.3)});`,
    `tl.fromTo(".${id}-shape",{opacity:0,y:-320},{opacity:1,y:0,duration:0.9,ease:"bounce.out",stagger:0.25},${r(T + 0.65)});`,
    `tl.fromTo(".${id}-lab",{opacity:0,y:16},{opacity:1,y:0,duration:0.45,ease:"power2.out",stagger:0.16},${r(T + 1.3)});`,
    `tl.to(".${id}-arr .draw",{strokeDashoffset:0,duration:0.45,ease:"power2.out",stagger:0.3},${r(T + 1.9)});`,
    `tl.fromTo(".${id}-arrh",{opacity:0,scale:0,transformOrigin:"left center"},{opacity:1,scale:1,duration:0.3,ease:"back.out(2)",stagger:0.3},${r(T + 2.25)});`,
    `tl.to(".${id}-shape",{rotation:6,duration:0.9,ease:"sine.inOut",yoyo:true,repeat:1,stagger:0.12,transformOrigin:"center center"},${r(T + 2.9)});`,
  ];
  return { html, s };
}

function riotStats(scene, ctx) {
  const { id, T, theme, land = true } = ctx;
  const stats = pickStats(scene, 4);
  if (!stats.length) stats.push({ pre: "", target: 40, suf: "", label: "styles" });
  const lead = stats[0];
  const stampCols = [theme.yellow, theme.cream, theme.red, theme.blue, theme.cream, theme.yellow];
  const stampInk = [theme.ink, theme.ink, theme.cream, theme.cream, theme.ink, theme.ink];
  const chips = stats.slice(0, 6).map((st, i) => `<span class="stamp ${id}-stamp" style="background:${stampCols[i % 6]};color:${stampInk[i % 6]};opacity:0;margin-left:${[0, 6, 1.6, 8, 3.4, 9.6][i % 6]}cqw;">${esc(st.label || (st.pre + st.target + st.suf))}</span>`).join("");
  // Landscape: ink panel fills the LEFT 44% with chips right. Portrait: the
  // panel becomes the TOP band (44% height) and the chips stack below it.
  const panelPos = land ? "left:0;top:0;bottom:0;width:44%;" : "left:0;right:0;top:0;height:44%;";
  const chipsPos = land ? "left:48%;right:5%;top:0;bottom:0;" : "left:8%;right:8%;top:47%;bottom:5%;";
  const html = `${open(id, ctx)}
    <div id="${id}-panel" style="position:absolute;${panelPos}background:${theme.ink};display:flex;flex-direction:column;justify-content:center;padding:0 ${land ? 5 : 8}cqw;">
      <div style="font-family:${theme.monoStack};font-weight:700;font-size:${land ? 1.3 : 2.1}cqw;letter-spacing:0.4em;color:${theme.yellow};text-transform:uppercase;">${esc(scene.kicker || KICK.stats).toUpperCase()}</div>
      <div style="display:flex;align-items:baseline;gap:1cqw;margin-top:1cqw;">
        <div id="${id}-count" style="font-family:${theme.displayStack};font-size:${land ? 11 : 16}cqw;line-height:1;color:${theme.yellow};">${esc(lead.pre)}0</div>
        <div style="font-family:${theme.displayStack};font-size:${land ? 3 : 4.6}cqw;color:${theme.cream};">${esc(lead.suf || (lead.label || "").split(" ")[0] || "")}</div>
      </div>
      <div class="body" style="color:#B9B4A6;margin-top:1.4cqw;font-size:${land ? 1.7 : 2.7}cqw;">${esc(scene.subtext || scene.headline || "Every one art-directed. Every one yours.")}</div>
    </div>
    <div style="position:absolute;${chipsPos}display:flex;flex-direction:column;justify-content:center;gap:1.7cqw;align-items:flex-start;">${chips}</div>
  </div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.3},${T});`,
    land
      ? `tl.fromTo("#${id}-panel",{xPercent:-105},{xPercent:0,duration:0.7,ease:"expo.out"},${r(T + 0.1)});`
      : `tl.fromTo("#${id}-panel",{yPercent:-105},{yPercent:0,duration:0.7,ease:"expo.out"},${r(T + 0.1)});`,
    `count("#${id}-count",${lead.target},${r(T + 0.55)},1.2,${JSON.stringify(lead.pre)});`,
    ...stats.slice(0, 6).map((st, i) => `stamp(".${id}-stamp:nth-child(${i + 1})",${r(T + 0.7 + i * 0.22)},${i % 2 ? 6 : -7},0);`),
    `tl.to(".${id}-stamp",{y:-8,duration:0.9,ease:"sine.inOut",yoyo:true,repeat:1,stagger:0.08},${r(T + 2.6)});`,
  ];
  return { html, s };
}

function riotManifesto(scene, ctx) {
  const { id, T, theme, land = true } = ctx;
  let lines = bullets(scene, 3);
  if (lines.length < 2) lines = ["No crew.", "No timeline.", "No render farm."];
  const emph = String(scene.emphasis || scene.headline || "Just words.").slice(0, 22);
  const xmk = () => `<svg class="xmark ${id}-x" viewBox="0 0 100 100"><path class="draw" pathLength="100" d="M12 12 L88 88" stroke="${theme.red}" stroke-width="16" stroke-linecap="round"/><path class="draw" pathLength="100" d="M88 12 L12 88" stroke="${theme.red}" stroke-width="16" stroke-linecap="round"/></svg>`;
  const rows = lines.map((t, i) => `<div style="position:relative;${i ? "margin-top:0.7cqw;" : ""}"><h1 class="display ${id}-line" style="font-size:${land ? 5.4 : 7.4}cqw;opacity:0;">${esc(String(t).toUpperCase())}</h1>${xmk()}</div>`).join("");
  const html = `${open(id, ctx)}<div class="safe" style="align-items:flex-start;text-align:left;padding-left:14%;">
    ${rows}
    <div style="position:relative;margin-top:1.8cqw;">
      <div class="hilite ${id}-hl" style="background:${theme.yellow};"></div>
      <h1 class="display" id="${id}-em" style="font-size:${land ? 7 : 9.6}cqw;opacity:0;padding:0.4cqw 1.2cqw;">${esc(emph.toUpperCase())}</h1>
    </div>
  </div></div>`;
  const per = Math.max(0.24, (ctx.L - 2.6) / lines.length);
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-line",{opacity:0,x:-46},{opacity:1,x:0,duration:0.5,ease:"power3.out",stagger:${r(per)}},${r(T + 0.2)});`,
    `tl.to(".${id}-x .draw",{strokeDashoffset:0,duration:0.24,ease:"power3.in",stagger:0.14},${r(T + 0.2 + per * lines.length + 0.3)});`,
    `tl.to(".${id}-line",{opacity:0.3,x:-8,duration:0.45,ease:"power2.out"},${r(T + ctx.L - 2.0)});`,
    `stamp("#${id}-em",${r(T + ctx.L - 1.8)},-3,0);`,
    `tl.to(".${id}-hl",{scaleX:1,duration:0.5,ease:"power3.inOut"},${r(T + ctx.L - 1.4)});`,
  ];
  return { html, s };
}

function riotFigure(scene, ctx) {
  const { id, T, theme, land = true } = ctx;
  const feat = featList(id, scene, theme);
  const html = `${open(id, ctx)}<div class="safe" style="flex-direction:${land ? "row" : "column"};gap:${land ? 6 : 3.5}cqw;text-align:left;align-items:center;">
    <svg id="${id}-eye" width="560" height="360" viewBox="0 0 280 180" style="width:${land ? 28 : 48}cqw;overflow:visible;flex:0 0 auto;">
      <g id="${id}-rays" opacity="0" stroke="${theme.blue}" stroke-width="5" stroke-linecap="round">
        <line x1="140" y1="-16" x2="140" y2="6"/><line x1="30" y1="10" x2="46" y2="28"/><line x1="250" y1="10" x2="234" y2="28"/>
        <line x1="140" y1="196" x2="140" y2="174"/><line x1="30" y1="170" x2="46" y2="152"/><line x1="250" y1="170" x2="234" y2="152"/></g>
      <path id="${id}-lid" class="draw" pathLength="100" d="M10 90 Q140 -30 270 90 Q140 210 10 90 Z" fill="none" stroke="${theme.ink}" stroke-width="9" stroke-linejoin="round"/>
      <g id="${id}-iris" opacity="0"><circle cx="140" cy="90" r="46" fill="${theme.yellow}" stroke="${theme.ink}" stroke-width="8"/><circle id="${id}-pupil" cx="140" cy="90" r="18" fill="${theme.ink}"/></g></svg>
    <div style="max-width:${land ? 44 : 82}cqw;">
      <span class="kicker" id="${id}-kick" style="opacity:0;"><span class="sq" style="background:${theme.yellow};"></span>${esc(scene.kicker || KICK.figure).toUpperCase()}</span>
      <h1 class="h1" id="${id}-head" style="margin-top:1.4cqw;font-size:${land ? 4.2 : 6}cqw;">${words(scene)}</h1>
      ${scene.subtext ? `<div class="body" id="${id}-sub" style="opacity:0;margin-top:1.3cqw;">${esc(scene.subtext)}</div>` : ""}
      ${feat.html}
    </div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.to("#${id}-lid",{strokeDashoffset:0,duration:0.9,ease:"power2.inOut"},${r(T + 0.2)});`,
    `tl.fromTo("#${id}-iris",{opacity:0,scale:0,transformOrigin:"140px 90px",svgOrigin:"140 90"},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},${r(T + 1.0)});`,
    `tl.fromTo("#${id}-rays",{opacity:0},{opacity:0.9,duration:0.4},${r(T + 1.3)});`,
    `tl.to("#${id}-pupil",{x:16,duration:0.9,ease:"sine.inOut",yoyo:true,repeat:${Math.max(1, Math.floor((ctx.L - 1.6) / 0.9))}},${r(T + 1.5)});`,
    `tl.fromTo("#${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.5)});`,
    `stamp("#${id}-head .word",${r(T + 0.8)},-3,0.07);`,
    scene.subtext ? `tl.fromTo("#${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.3)});` : "",
    ...feat.s.map((x) => x.replace("__AT__", r(T + 1.7))),
  ].filter(Boolean);
  return { html, s };
}

// PLATE — a real screenshot as a poster-framed panel: ink-bordered cream card with a
// hard offset shadow, a color block behind, and a corner sticker stamp. Stamped in.
function riotPlate(scene, ctx, asset) {
  const { id, T, theme, land = true } = ctx;
  const ratio = Number(asset.ratio) || (asset.width && asset.height ? asset.width / asset.height : 0);
  const portrait = ratio && ratio < 0.9; // the ASSET's shape (not the canvas)
  const cardW = land ? (portrait ? "26cqw" : "44cqw") : (portrait ? "52cqw" : "78cqw");
  const winH = land ? (portrait ? "34cqw" : "24cqw") : (portrait ? "66cqw" : "46cqw");
  const tag = esc(String(scene.emphasis || "the proof").toLowerCase()).slice(0, 18);
  const feat = featList(id, scene, theme);
  const bobP = Math.max(1, Math.floor((ctx.L - 1.6) / 1.6));
  const html = `${open(id, ctx)}<div class="safe" style="flex-direction:${land ? "row" : "column"};gap:${land ? 5 : 3}cqw;text-align:left;align-items:center;">
    <div class="riot-plate" id="${id}-pw" style="opacity:0;position:relative;width:${cardW};flex:0 0 auto;">
      <div style="position:absolute;left:1.4cqw;top:1.4cqw;width:100%;height:100%;background:${theme.yellow};border:0.22cqw solid ${theme.ink};"></div>
      <div class="riot-frame" style="position:relative;">
        <div class="riot-win" style="height:${winH};"><img src="${esc(asset.path)}" alt="${esc(asset.alt || "screenshot")}"></div>
      </div>
      <span class="stamp" id="${id}-tag" style="position:absolute;right:-1.4cqw;bottom:-1.6cqw;background:${theme.red};color:${theme.cream};opacity:0;">${tag}</span>
    </div>
    <div style="max-width:${land ? 40 : 82}cqw;">
      <span class="kicker" id="${id}-kick" style="opacity:0;"><span class="sq"></span>${esc(scene.kicker || KICK.plate).toUpperCase()}</span>
      <h1 class="h1" id="${id}-head" style="margin-top:1.2cqw;font-size:${land ? 4 : 5.6}cqw;">${words(scene)}</h1>
      ${scene.subtext ? `<div class="body" id="${id}-sub" style="opacity:0;margin-top:1.1cqw;">${esc(scene.subtext)}</div>` : ""}
      ${feat.html}
    </div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.3},${T});`,
    `tl.fromTo("#${id}-pw",{opacity:0,scale:1.6,rotation:-4,transformOrigin:"center center"},{opacity:1,scale:1,rotation:0,duration:0.5,ease:"power4.in"},${r(T + 0.4)});`,
    `tl.to("#${id}-pw",{y:-9,duration:1.6,ease:"sine.inOut",yoyo:true,repeat:${bobP}},${r(T + 1.6)});`,
    `stamp("#${id}-tag",${r(T + 1.0)},8,0);`,
    `tl.fromTo("#${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.7)});`,
    `stamp("#${id}-head .word",${r(T + 0.9)},-3,0.07);`,
    scene.subtext ? `tl.fromTo("#${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.4)});` : "",
    ...feat.s.map((x) => x.replace("__AT__", r(T + 1.8))),
  ].filter(Boolean);
  return { html, s };
}

function riotCta(scene, ctx) {
  const { id, T, theme, land = true } = ctx;
  const mark = esc(String(scene.headline || scene.title || "KEYFRAME"));
  const cta = esc(String(scene.emphasis || "Start free").slice(0, 22));
  const url = esc(String(scene.subtext || "PRINT YOUR FIRST FILM").toUpperCase()).slice(0, 44);
  const html = `${open(id, ctx)}<div class="safe">
    <h1 class="display" id="${id}-mark" style="font-size:${land ? 6 : 9}cqw;opacity:0;">${mark}</h1>
    <div style="position:relative;margin-top:2.4cqw;display:inline-block;">
      <svg id="${id}-dash" width="560" height="220" viewBox="0 0 560 220" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);overflow:visible;" data-layout-allow-occlusion>
        <rect id="${id}-dashrect" x="8" y="8" width="544" height="204" rx="102" fill="none" stroke="${theme.ink}" stroke-width="4" stroke-dasharray="14 16" opacity="0"/></svg>
      <div class="btn" id="${id}-btn" style="opacity:0;">${cta} <span style="font-size:3.4cqw;">&#8594;</span></div>
    </div>
    <div class="body" id="${id}-url" style="opacity:0;margin-top:2.4cqw;font-family:${theme.monoStack};letter-spacing:0.2em;font-size:${land ? 1.4 : 2.2}cqw;">${url}</div>
  </div>
  <svg id="${id}-aster" width="140" height="140" viewBox="0 0 100 100" style="position:absolute;left:16cqw;top:16cqw;opacity:0;" data-layout-allow-occlusion>
    <g stroke="${theme.blue}" stroke-width="11" stroke-linecap="round"><line x1="50" y1="4" x2="50" y2="96"/><line x1="4" y1="50" x2="96" y2="50"/><line x1="17" y1="17" x2="83" y2="83"/><line x1="83" y1="17" x2="17" y2="83"/></g></svg>
  <div id="${id}-ball" style="position:absolute;left:71%;top:${land ? 31.5 : 56}cqw;width:5.4cqw;height:5.4cqw;border-radius:50%;background:${theme.yellow};border:0.22cqw solid ${theme.ink};opacity:0;"></div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `stamp("#${id}-mark",${r(T + 0.3)},-3,0);`,
    `tl.fromTo("#${id}-aster",{opacity:0,scale:0,rotation:-160,transformOrigin:"center center"},{opacity:1,scale:1,rotation:0,duration:0.6,ease:"back.out(1.8)"},${r(T + 0.6)});`,
    `tl.fromTo("#${id}-ball",{opacity:0,scale:0},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},${r(T + 0.8)});`,
    `tl.fromTo("#${id}-dashrect",{opacity:0},{opacity:1,duration:0.4},${r(T + 0.9)});`,
    `tl.to("#${id}-dashrect",{strokeDashoffset:-60,duration:${r(Math.max(1, ctx.L - 1))},ease:"none"},${r(T + 0.9)});`,
    `stamp("#${id}-btn",${r(T + 1.1)},2,0);`,
    `tl.to("#${id}-btn",{y:-8,duration:0.6,ease:"sine.inOut",yoyo:true,repeat:${Math.max(1, Math.floor((ctx.L - 1.7) / 0.6))}},${r(T + 1.7)});`,
    `tl.fromTo("#${id}-url",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.3)});`,
  ];
  return { html, s };
}

const BUILDERS = { title: riotTitle, recipe: riotRecipe, stats: riotStats, manifesto: riotManifesto, figure: riotFigure, plate: riotPlate, cta: riotCta };

// ---- paper chrome (content-independent) --------------------------------------
function chromeHtml(theme, title) {
  return `
  <div id="bg" class="clip" data-start="0" data-duration="__D__" data-track-index="0" data-layout-allow-occlusion>
    <div class="bigshape" id="bg-cy" style="position:absolute;left:-9cqw;top:-13cqw;width:30cqw;height:30cqw;border-radius:50%;background:${theme.yellow};"></div>
    <div class="bigshape" id="bg-cb" style="position:absolute;right:-11cqw;bottom:-15cqw;width:34cqw;height:34cqw;border-radius:50%;background:${theme.blue};opacity:0.92;"></div>
    <div class="bigshape" id="bg-ring" style="position:absolute;right:5.5cqw;top:7.5cqw;width:10.5cqw;height:10.5cqw;border-radius:50%;border:0.9cqw solid ${theme.red};"></div>
    <div class="bigshape" id="bg-tri" style="position:absolute;left:8cqw;bottom:9cqw;width:11cqw;height:11cqw;"><svg viewBox="0 0 100 100" style="width:100%;height:100%;overflow:visible;"><polygon points="50 6 96 94 4 94" fill="none" stroke="${theme.ink}" stroke-width="7"/></svg></div>
    <div id="dots"></div>
  </div>
  <div id="chrome" class="clip" data-start="0" data-duration="__D__" data-track-index="19" data-layout-allow-occlusion style="opacity:0;">
    <div id="frame"></div>
    <div id="masthead"><span class="sq"></span>${esc(String(title || "KEYFRAME").toUpperCase()).slice(0, 20)}</div>
    <div id="sheetno">01 / 01</div>
    <div id="footline">An AI motion press &middot; est. one sentence ago</div>
  </div>
  <div id="caps" class="clip" data-start="0" data-duration="__D__" data-track-index="20"><div id="cap-pill"><div id="cap-text"></div></div></div>`;
}

function styleBlock(theme, land = true) {
  // PORTRAIT OVERRIDES — cqw units track container WIDTH, so a 1080x1920 canvas
  // renders landscape sizes 44% smaller relative to the frame. Appended last so
  // it wins at equal specificity. Layout stacking lives in the builders.
  const portrait = land ? "" : `
  .safe { padding:10% 7% 13%; }
  .display { font-size:11cqw; }
  .h1 { font-size:6.6cqw; }
  .body { font-size:2.9cqw; }
  .kicker { font-size:2cqw; padding:1cqw 2.2cqw; }
  .recipe-item { width:24cqw; gap:1.2cqw; }
  .recipe-label { font-size:3cqw; }
  .stamp { font-size:2.5cqw; padding:1.5cqw 2.6cqw; }
  .xmark { width:7.4cqw; height:7.4cqw; right:-9.4cqw; margin-top:-3.7cqw; }
  .btn { font-size:4.6cqw; padding:2.3cqw 5.2cqw; }
  .riot-feat li { font-size:2.5cqw; }
  .riot-sq { width:1.9cqw; height:1.9cqw; }
  #masthead { font-size:1.9cqw; }
  #sheetno { font-size:1.9cqw; }
  #footline { font-size:1.7cqw; bottom:2cqw; }
  #cap-pill { max-width:86%; }
  #cap-text { font-size:2.4cqw; }`;
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#111; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.paper}; container-type:size; color:${theme.ink}; font-family:${theme.bodyStack};
    --paper:${theme.paper}; --cream:${theme.cream}; --ink:${theme.ink}; --red:${theme.red}; --blue:${theme.blue}; --yellow:${theme.yellow}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:9% 7% 11%; text-align:center; }
  .display { font-family:${theme.displayStack}; font-weight:400; font-size:8cqw; line-height:0.94; letter-spacing:-0.015em; color:${theme.ink}; text-transform:uppercase; }
  .h1 { font-family:${theme.displayStack}; font-size:4.6cqw; line-height:1.02; color:${theme.ink}; text-transform:uppercase; letter-spacing:-0.01em; }
  .body { font-family:${theme.bodyStack}; font-weight:600; font-size:1.9cqw; line-height:1.45; color:${theme.body}; }
  .word { display:inline-block; will-change:transform,opacity; }
  .shadow-red { text-shadow:0.5cqw 0.5cqw 0 ${theme.red}; }
  .shadow-blue { text-shadow:0.5cqw 0.5cqw 0 ${theme.blue}; }
  .kicker { display:inline-flex; align-items:center; gap:0.9cqw; font-family:${theme.monoStack}; font-weight:700; font-size:1.2cqw; letter-spacing:0.34em; text-transform:uppercase; color:${theme.ink}; border:0.18cqw solid ${theme.ink}; background:${theme.cream}; padding:0.6cqw 1.6cqw; }
  .kicker .sq { width:0.8cqw; height:0.8cqw; background:${theme.red}; }
  #dots { position:absolute; inset:0; pointer-events:none; opacity:0.55; background-image:radial-gradient(rgba(23,22,27,0.13) 1.6px, transparent 1.6px); background-size:2.3cqw 2.3cqw; }
  .bigshape { pointer-events:none; }
  #frame { position:absolute; inset:1.5cqw; border:0.2cqw solid ${theme.ink}; pointer-events:none; }
  #masthead { position:absolute; left:3cqw; top:2.85cqw; display:flex; align-items:center; gap:0.9cqw; font-family:${theme.monoStack}; font-weight:700; font-size:1.15cqw; letter-spacing:0.3em; color:${theme.ink}; background:${theme.cream}; border:0.18cqw solid ${theme.ink}; padding:0.45cqw 1.2cqw; }
  #masthead .sq { width:1.1cqw; height:1.1cqw; background:${theme.red}; }
  #sheetno { position:absolute; right:3cqw; top:2.85cqw; font-family:${theme.monoStack}; font-weight:700; font-size:1.15cqw; letter-spacing:0.26em; color:${theme.ink}; border:0.18cqw solid ${theme.ink}; background:${theme.cream}; padding:0.45cqw 1.2cqw; }
  #footline { position:absolute; left:0; right:0; bottom:2.6cqw; text-align:center; font-family:${theme.monoStack}; font-weight:700; font-size:1cqw; letter-spacing:0.4em; color:#6B6860; text-transform:uppercase; }
  .bar { position:absolute; top:0; bottom:0; width:34.5%; transform-origin:top center; }
  .recipe-item { display:flex; flex-direction:column; align-items:center; gap:1.4cqw; width:15cqw; }
  .recipe-label { font-family:${theme.displayStack}; font-size:1.9cqw; letter-spacing:0.06em; color:${theme.ink}; text-transform:uppercase; }
  .stamp { display:inline-block; font-family:${theme.monoStack}; font-weight:700; font-size:1.6cqw; letter-spacing:0.08em; padding:1.1cqw 2cqw; border:0.22cqw solid ${theme.ink}; box-shadow:0.45cqw 0.45cqw 0 ${theme.ink}; text-transform:uppercase; white-space:nowrap; will-change:transform; }
  .xmark { position:absolute; width:5.4cqw; height:5.4cqw; right:-7cqw; top:50%; margin-top:-2.7cqw; }
  .hilite { position:absolute; left:-3%; top:8%; width:106%; height:88%; z-index:-1; transform:scaleX(0); transform-origin:left center; }
  .btn { display:inline-flex; align-items:center; gap:1.2cqw; font-family:${theme.displayStack}; font-size:3.2cqw; text-transform:uppercase; letter-spacing:0.02em; color:${theme.cream}; background:${theme.red}; border:0.24cqw solid ${theme.ink}; box-shadow:0.7cqw 0.7cqw 0 ${theme.ink}; padding:1.7cqw 4cqw; will-change:transform; }
  .draw { stroke-dasharray:100; stroke-dashoffset:100; }
  .riot-frame { background:${theme.cream}; border:0.24cqw solid ${theme.ink}; box-shadow:0.6cqw 0.6cqw 0 ${theme.ink}; padding:1cqw; }
  .riot-win { position:relative; width:100%; overflow:hidden; background:#FFFFFF; border:0.12cqw solid ${theme.ink}; }
  .riot-win img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; display:block; }
  .riot-feat { list-style:none; margin-top:1.4cqw; display:flex; flex-direction:column; gap:0.85cqw; }
  .riot-feat li { display:flex; align-items:center; gap:1cqw; font-family:${theme.bodyStack}; font-weight:700; font-size:1.5cqw; line-height:1.3; color:${theme.ink}; }
  .riot-sq { width:1.2cqw; height:1.2cqw; flex:0 0 auto; border:0.14cqw solid ${theme.ink}; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:5.6%; z-index:50; pointer-events:none; }
  #cap-pill { max-width:74%; height:fit-content; flex:0 0 auto; text-align:center; padding:0.9cqw 2.4cqw; opacity:0; background:${theme.ink}; border:0.18cqw solid ${theme.ink}; box-shadow:0.4cqw 0.4cqw 0 rgba(23,22,27,0.25); }
  #cap-text { font-family:${theme.bodyStack}; font-weight:700; font-size:1.5cqw; line-height:1.3; color:${theme.cream}; }
  ${portrait}`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets } = {}) {
  const theme = riotTheme();
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1920, H = (dims && dims.height) || 1080;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length ? sb.scenes.slice(0, 12) : [{ id: "s1", start: 0, duration: 4, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);

  const images = (Array.isArray(assets) ? assets : []).filter(plateOk).sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const byScene = new Map();
  const pool = [];
  for (const a of images) { const sid = a.sceneId != null ? String(a.sceneId) : null; if (sid && !byScene.has(sid)) byScene.set(sid, a); else pool.push(a); }
  let pooli = 0;

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [], sceneScripts = [], sceneStarts = [];
  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 4);
    let arch = riotArchetype(scene, i, scenes.length);
    let asset = null;
    const sid = scene.id != null ? String(scene.id) : `s${i + 1}`;
    const ends = arch === "title" || arch === "cta";
    if (!ends && byScene.has(sid)) { arch = "plate"; asset = byScene.get(sid); }
    else if (arch === "figure" && pooli < pool.length) { arch = "plate"; asset = pool[pooli++]; }
    const ctx = { id: `s${i + 1}`, T, L, E: r(T + L), i, isLast: i === scenes.length - 1, track: 2 + i, dims: { width: W, height: H }, land: W >= H, theme };
    const built = (BUILDERS[arch] || riotFigure)(scene, ctx, asset);
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
  function reps(t,c){return Math.max(0,Math.floor(t/c)-1);}
  function kill(id,t){tl.set(id,{opacity:0},t);}
  function pad2(n){return String(Math.round(n)).padStart(2,"0");}
  function count(sel,to,at,dur,pre){var o={v:0};tl.to(o,{v:to,duration:dur,ease:"power2.out",snap:{v:1},onUpdate:function(){var e=$(sel);if(e)e.textContent=(pre||"")+Math.round(o.v);}},at);}
  function stamp(sel,at,rot,stg){tl.fromTo(sel,{opacity:0,scale:1.9,rotation:rot},{opacity:1,scale:1,rotation:0,duration:0.42,ease:"power4.in",stagger:(stg||0)},at);}

  tl.to("#bg-cy",{scale:1.07,duration:9,ease:"sine.inOut",yoyo:true,repeat:reps(D,9)},0);
  tl.to("#bg-cb",{scale:1.06,duration:11,ease:"sine.inOut",yoyo:true,repeat:reps(D,11)},0);
  tl.to("#bg-ring",{rotation:180,y:"+=18",duration:15,ease:"sine.inOut",yoyo:true,repeat:reps(D,15)},0);
  tl.to("#bg-tri",{rotation:-14,duration:8,ease:"sine.inOut",yoyo:true,repeat:reps(D,8),transformOrigin:"center center"},0);
  tl.fromTo("#dots",{backgroundPosition:"0cqw 0cqw"},{backgroundPosition:"2.3cqw 2.3cqw",duration:14,ease:"none",repeat:reps(D,14)},0);
  tl.fromTo("#chrome",{opacity:0},{opacity:1,duration:0.5},0.7);
  tl.fromTo("#masthead",{x:-26,opacity:0},{x:0,opacity:1,duration:0.5,ease:"power2.out"},0.9);
  tl.fromTo("#sheetno",{x:26,opacity:0},{x:0,opacity:1,duration:0.5,ease:"power2.out"},0.95);

  ${sceneScripts.join("\n  ")}

  var cues=${JSON.stringify(cues)};
  var starts=${JSON.stringify(sceneStarts)};
  tl.to({},{duration:D,ease:"none",onUpdate:function(){
    var now=tl.time();var cap=$("#cap-pill"),txt=$("#cap-text");
    if(cap&&txt){var a=null;for(var k=0;k<cues.length;k++){if(now>=cues[k][0]&&now<cues[k][1]){a=cues[k];break;}}if(a){if(txt.textContent!==a[2])txt.textContent=a[2];cap.style.opacity="1";}else cap.style.opacity="0";}
    var sn=$("#sheetno");if(sn){var idx=0;for(var j=0;j<starts.length;j++){if(now>=starts[j])idx=j;}var lab=pad2(idx+1)+" / "+pad2(starts.length);if(sn.textContent!==lab)sn.textContent=lab;}
  }},0);

  window.__timelines=window.__timelines||{};
  window.__timelines["vid"]=tl;
  if(typeof navigator==="undefined"||!navigator.webdriver){tl.play(0);tl.eventCallback("onComplete",function(){tl.restart();});}
})();`;

  const indexHtml = [
    `<!DOCTYPE html>`, `<html lang="en">`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="${GSAP_CDN}"></script>`,
    `<style>`, styleBlock(theme, W >= H), `</style>`, `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
    chrome, bodyParts.join("\n"), `</div>`,
    `<script>`, script, `</script>`, `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson };
}

module.exports = { buildComposition };
