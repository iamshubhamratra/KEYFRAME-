// BLOOM FABLE composer — a native GSAP + SVG/CSS pastel storybook film. The pack
// `bloom-fable` (manifest renderer:"bloom-fable") routes here from attemptLlmComposition,
// exactly like the flagship / brightlife / blueprint composers.
//
// Same envelope as the others: buildComposition -> {indexHtml, metaJson}. A persistent
// MEADOW (sky-to-cream ground, a turning sun, drifting clouds, rolling hills, swaying
// grass, floating sparkles) is content-independent; each storyboard scene is injected
// into a bloom SCENE-TYPE (title / plant / cards / stats / ribbons / cta), or — when a
// real screenshot/photo is available — a framed cream CARD (plate). Botanical motion:
// draw-on flourishes, elastic petal blooms, a butterfly, a rainbow, petal rain.
//
// Engineering contract (identical to the other composers): one paused GSAP timeline
// on window.__timelines["vid"]; direct-child .clip scenes on unique tracks; a boundary
// opacity:0 hard-kill per scene (the meadow persists, so scenes swap over it); ONE
// seek-safe caption node driven by a single onUpdate proxy; finite repeats; pathLength=100
// draw-ons; cqw units + container-type:size; hidden = opacity:0 only. Deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
const DISPLAY = "Fraunces";
const BODY = "Inter";

// ---- helpers -----------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;

function bloomTheme() {
  const fontFace = isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "";
  return {
    groundCss: "linear-gradient(180deg, #E4F1F2 0%, #F8EFDE 46%, #FBF4E8 100%)",
    cream: "#FBF4E8", plum: "#46345A", body: "#6C5B80",
    coral: "#E8705F", coral2: "#F3937F", sun: "#F2B95C", sunEdge: "#E8A94B",
    sage: "#7FA876", sage2: "#9CC08F", blush: "#F3C5BB", sky: "#A9D7E8", card: "#FFFDF7",
    displayStack: `'${DISPLAY}', Georgia, 'Times New Roman', serif`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace,
  };
}

// Headline split into <span class="word">, with the emphasis word tinted coral.
function words(scene, coral) {
  const H = String(scene.headline || scene.title || "");
  const E = String(scene.emphasis || "").trim().toLowerCase();
  return H.split(/\s+/).filter(Boolean).map((w) => {
    const bare = w.replace(/[.,!?;:]$/, "");
    const hit = E && bare.toLowerCase() === E;
    return `<span class="word"${hit ? ` style="color:${coral};"` : ""}>${esc(w)}</span>`;
  }).join(" ");
}

function hl(scene, coral) {
  const H = String(scene.headline || scene.title || "");
  const E = String(scene.emphasis || "").trim();
  if (E) {
    const i = H.toLowerCase().indexOf(E.toLowerCase());
    if (i >= 0) return esc(H.slice(0, i)) + `<span style="color:${coral};">` + esc(H.slice(i, i + E.length)) + `</span>` + esc(H.slice(i + E.length));
  }
  return esc(H);
}

function pickNumber(scene) {
  const src = [scene.emphasis, scene.subtext, scene.headline].map((x) => String(x || "")).find((x) => /\d/.test(x)) || "";
  const m = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)\s?(%|x|\+|k|m|p|bn?)?/i.exec(src);
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

// Short supporting feature lines (leaf-marked bullets) that FILL the copy side —
// on-screen text first, else sentences pulled from the voiceover (richer than the
// one-line subtext). De-duped against the headline/subtext so nothing repeats.
function featureLines(scene, n) {
  let src = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean).map(String) : [];
  if (src.length < 2 && scene.voiceover) src = src.concat(String(scene.voiceover).split(/[.!?;\n]|\s—\s/));
  const head = String(scene.headline || "").toLowerCase().trim();
  const sub = String(scene.subtext || "").toLowerCase().trim();
  const seen = new Set(), out = [];
  for (const s of src) {
    const t = String(s).replace(/\s+/g, " ").trim();
    const k = t.toLowerCase();
    if (t.length >= 5 && t.length <= 68 && k !== head && k !== sub && !seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out.slice(0, n);
}

// A leaf-marked feature list + the GSAP that pops each line in (staggered).
function featList(id, scene, theme, atExpr) {
  const feats = featureLines(scene, 3);
  if (!feats.length) return { html: "", s: [] };
  const cols = [theme.coral, theme.sage, theme.sun];
  const html = `<ul class="bl-feat" id="${id}-feat">${feats.map((f, i) => `<li class="${id}-fi" style="opacity:0;"><span class="bl-fdot" style="background:${cols[i % 3]};"></span>${esc(f)}</li>`).join("")}</ul>`;
  const s = [`tl.fromTo(".${id}-fi",{opacity:0,x:-22},{opacity:1,x:0,duration:0.5,ease:"back.out(1.6)",stagger:0.16},${atExpr});`];
  return { html, s };
}

// Animated underline SVG that draws under a headline.
function underline(id, theme, atExpr) {
  const html = `<svg id="${id}-ul" width="480" height="26" viewBox="0 0 480 26" style="overflow:visible;max-width:26cqw;margin-top:0.6cqw;"><path class="draw" pathLength="100" d="M6 16 C 150 6, 330 6, 474 16" fill="none" stroke="${theme.sun}" stroke-width="5" stroke-linecap="round"/></svg>`;
  const s = [`tl.to("#${id}-ul .draw",{strokeDashoffset:0,duration:0.6,ease:"power2.out"},${atExpr});`];
  return { html, s };
}

// Up to `max` {target,suf,label} stat pairs for the ring scene.
function pickStats(scene, max) {
  const out = [];
  for (const l of (Array.isArray(scene.onScreenText) ? scene.onScreenText : [])) {
    const m = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)\s?(%|x|\+|k|m|p)?/i.exec(String(l));
    if (m) out.push({ pre: m[1] || "", target: Math.round(parseFloat(m[2].replace(/,/g, ""))), suf: (m[3] || ""), label: String(l).replace(m[0], "").trim().slice(0, 26) || "metric" });
    if (out.length >= max) break;
  }
  if (!out.length) { const n = pickNumber(scene); if (n) out.push({ ...n, label: String(scene.subtext || scene.headline || "metric").slice(0, 26) }); }
  return out.slice(0, max);
}

function plateOk(a) {
  if (!a || !a.path) return false;
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  const src = String(a.source || "").toLowerCase();
  return a.source === "website" || a.source === "blog" || src.startsWith("library") || a.visionOk === true || a.cdProminence === "hero" || a.cdProminence === "support";
}

function bloomArchetype(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "title";
  if (i === total - 1 || k === "cta" || p === "cta") return "cta";
  if (k === "chart" || k === "stat" || k === "countdown" || pickNumber(scene)) return "stats";
  if (k === "quote" || p === "problem" || p === "comparison") return "ribbons";
  if (bullets(scene, 3).length >= 2 || /how|process|step|feature/.test(p + k)) return "cards";
  return "plant";
}

const KICK = { title: "~ a little film ~", plant: "chapter one", plate: "a page from the story", cards: "and then, all by itself…", stats: "tended with care", ribbons: "no fuss", cta: "the beginning" };

// ---- scene-type builders  ((scene, ctx, asset) -> { html, s }) ----------------
function open(id, ctx) { return `<div class="clip bl-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

function blTitle(scene, ctx) {
  const { id, T, theme, land = true } = ctx;
  const kick = esc(scene.kicker || KICK.title);
  const sub = esc(scene.subtext || "Whisper it one sentence — and watch it take root.");
  const html = `${open(id, ctx)}<div class="safe">
    <div class="script" id="${id}-kick" style="opacity:0;">${kick}</div>
    <h1 class="display" style="margin-top:1.6cqw;">${words(scene, theme.coral)}</h1>
    <svg id="${id}-fl" width="420" height="30" viewBox="0 0 420 30" style="margin-top:1.6cqw;overflow:visible;max-width:${land ? 24 : 38}cqw;">
      <path class="draw" pathLength="100" d="M8 18 C 110 6, 310 6, 412 18" fill="none" stroke="${theme.coral}" stroke-width="5" stroke-linecap="round"/></svg>
    <div class="body" id="${id}-sub" style="opacity:0;margin-top:1.8cqw;">${sub}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo("#${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 0.5)});`,
    `tl.fromTo("#${id} .word",{opacity:0,y:42,rotation:-3},{opacity:1,y:0,rotation:0,duration:0.7,ease:"power3.out",stagger:0.11},${r(T + 0.9)});`,
    `tl.to("#${id}-fl .draw",{strokeDashoffset:0,duration:0.7,ease:"power2.out"},${r(T + 2.0)});`,
    `tl.fromTo("#${id}-sub",{opacity:0,y:22},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 2.4)});`,
  ];
  return { html, s };
}

function blPlant(scene, ctx) {
  const { id, T, theme, land = true } = ctx;
  const kick = esc(scene.kicker || KICK.plant);
  const ul = underline(id, theme, "__AT__");
  const feat = featList(id, scene, theme, "__AT__");
  const html = `${open(id, ctx)}<div class="safe" style="flex-direction:${land ? "row" : "column"};gap:${land ? 7 : 3}cqw;text-align:left;align-items:center;">
    <svg id="${id}-flower" width="440" height="560" viewBox="0 0 320 420" style="width:${land ? 18 : 26}cqw;flex:0 0 auto;overflow:visible;">
      <path id="${id}-stem" class="draw" pathLength="100" d="M160 410 C 150 340 176 300 160 240 C 148 196 164 170 160 140" fill="none" stroke="#6E9670" stroke-width="10" stroke-linecap="round"/>
      <path id="${id}-lf1" d="M160 320 C 120 316 92 290 96 254 C 132 258 158 284 160 320 Z" fill="${theme.sage2}" opacity="0"/>
      <path id="${id}-lf2" d="M160 262 C 200 258 228 232 224 196 C 188 200 162 226 160 262 Z" fill="${theme.sage}" opacity="0"/>
      <g id="${id}-petals">
        ${[0, 1, 2, 3, 4, 5].map((j) => `<ellipse class="${id}-pt" cx="160" cy="92" rx="26" ry="44" fill="${j % 2 ? theme.coral2 : theme.coral}" opacity="0"/>`).join("")}
      </g>
      <circle id="${id}-heart" cx="160" cy="140" r="26" fill="${theme.sun}" stroke="${theme.sunEdge}" stroke-width="4" opacity="0"/>
    </svg>
    <div style="max-width:${land ? 48 : 82}cqw;padding-bottom:${land ? 4 : 0}cqw;">
      <div class="script" id="${id}-kick" style="opacity:0;">${kick}</div>
      <h1 class="display" id="${id}-head" style="font-size:${land ? 4.8 : 6.6}cqw;margin-top:0.8cqw;">${words(scene, theme.coral)}</h1>
      ${ul.html}
      ${scene.subtext ? `<div class="body" id="${id}-sub" style="opacity:0;margin-top:1.2cqw;">${esc(scene.subtext)}</div>` : ""}
      ${feat.html}
    </div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.to("#${id}-stem",{strokeDashoffset:0,duration:1.1,ease:"power2.inOut"},${r(T + 0.3)});`,
    `tl.fromTo("#${id}-lf1",{opacity:0,scale:0,transformOrigin:"160px 320px"},{opacity:1,scale:1,duration:0.6,ease:"back.out(2)"},${r(T + 1.1)});`,
    `tl.fromTo("#${id}-lf2",{opacity:0,scale:0,transformOrigin:"160px 262px"},{opacity:1,scale:1,duration:0.6,ease:"back.out(2)"},${r(T + 1.35)});`,
    `tl.fromTo(".${id}-pt",{opacity:0,scale:0,rotation:function(i){return i*60;},svgOrigin:"160 140"},{opacity:1,scale:1,rotation:function(i){return i*60;},svgOrigin:"160 140",duration:0.9,ease:"elastic.out(1, 0.6)",stagger:0.09},${r(T + 1.7)});`,
    `tl.fromTo("#${id}-heart",{opacity:0,scale:0,transformOrigin:"160px 140px"},{opacity:1,scale:1,duration:0.55,ease:"back.out(2.4)"},${r(T + 2.3)});`,
    `tl.to("#${id}-flower",{rotation:2.4,duration:1.4,ease:"sine.inOut",yoyo:true,repeat:${Math.max(1, Math.floor((ctx.L - 2.9) / 1.4))},transformOrigin:"50% 96%"},${r(T + 2.9)});`,
    `tl.fromTo("#${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.5)});`,
    `tl.fromTo("#${id}-head .word",{opacity:0,y:32,rotation:-3},{opacity:1,y:0,rotation:0,duration:0.6,ease:"power3.out",stagger:0.08},${r(T + 0.7)});`,
    ...ul.s.map((x) => x.replace("__AT__", r(T + 1.3))),
    scene.subtext ? `tl.fromTo("#${id}-sub",{opacity:0,y:22},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 1.5)});` : "",
    ...feat.s.map((x) => x.replace("__AT__", r(T + 1.9))),
  ].filter(Boolean);
  return { html, s };
}

// PLATE — a real screenshot as a framed cream storybook card (soft shadow, rounded),
// with a leaf-tag label and side copy; gentle grow-in + Ken-Burns.
function blPlate(scene, ctx, asset) {
  const { id, T, theme, land = true } = ctx;
  const ratio = Number(asset.ratio) || (asset.width && asset.height ? asset.width / asset.height : 0);
  const portrait = ratio && ratio < 0.9; // the ASSET's shape (not the canvas)
  const cardW = land ? (portrait ? "25cqw" : "42cqw") : (portrait ? "52cqw" : "78cqw");
  const winH = land ? (portrait ? "34cqw" : "24cqw") : (portrait ? "66cqw" : "46cqw");
  const kick = esc(scene.kicker || KICK.plate);
  const tag = esc(String(scene.emphasis || "a page").toLowerCase()).slice(0, 20);
  const ul = underline(id, theme, "__AT__");
  const feat = featList(id, scene, theme, "__AT__");
  const bobP = Math.max(1, Math.floor((ctx.L - 1.4) / 1.6));
  const html = `${open(id, ctx)}<div class="safe" style="flex-direction:${land ? "row" : "column"};gap:${land ? 5.5 : 3}cqw;text-align:left;align-items:center;">
    <div class="bl-plate-wrap" id="${id}-pw" style="opacity:0;position:relative;width:${cardW};flex:0 0 auto;">
      <div class="card" style="padding:1.1cqw;">
        <div class="bl-plate-win" style="height:${winH};">
          <img src="${esc(asset.path)}" alt="${esc(asset.alt || "screenshot")}">
        </div>
      </div>
      <span class="leaf-tag" id="${id}-tag" style="position:absolute;left:-1.2cqw;bottom:-1.4cqw;opacity:0;"><i style="background:${theme.coral};"></i>${tag}</span>
      <svg id="${id}-spr" width="80" height="120" viewBox="0 0 80 120" style="position:absolute;right:-3cqw;bottom:-1cqw;width:5cqw;overflow:visible;">
        <path class="draw" id="${id}-sprstem" pathLength="100" d="M40 118 C 38 88 48 74 40 52" fill="none" stroke="${theme.sage}" stroke-width="7" stroke-linecap="round"/>
        <path id="${id}-sprlf" d="M40 78 C 20 76 8 62 10 44 C 30 46 40 60 40 78 Z" fill="${theme.sage2}" opacity="0"/></svg>
    </div>
    <div style="max-width:${land ? 40 : 82}cqw;">
      <div class="script" id="${id}-kick" style="opacity:0;">${kick}</div>
      <h1 class="display" id="${id}-head" style="font-size:${land ? 4.2 : 5.8}cqw;margin-top:0.5cqw;">${words(scene, theme.coral)}</h1>
      ${ul.html}
      ${scene.subtext ? `<div class="body" id="${id}-sub" style="opacity:0;margin-top:1.1cqw;">${esc(scene.subtext)}</div>` : ""}
      ${feat.html}
    </div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo("#${id}-pw",{opacity:0,y:38,scale:0.92,rotation:-2},{opacity:1,y:0,scale:1,rotation:0,duration:0.7,ease:"back.out(1.5)"},${r(T + 0.4)});`,
    `tl.to("#${id}-pw",{y:-10,duration:1.6,ease:"sine.inOut",yoyo:true,repeat:${bobP}},${r(T + 1.4)});`,
    `tl.to("#${id}-sprstem",{strokeDashoffset:0,duration:0.8,ease:"power2.out"},${r(T + 0.9)});`,
    `tl.fromTo("#${id}-sprlf",{opacity:0,scale:0,transformOrigin:"40px 78px"},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},${r(T + 1.5)});`,
    `tl.fromTo("#${id}-tag",{opacity:0,scale:0,rotation:-8,transformOrigin:"bottom left"},{opacity:1,scale:1,rotation:0,duration:0.55,ease:"back.out(1.8)"},${r(T + 0.9)});`,
    `tl.fromTo("#${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.7)});`,
    `tl.fromTo("#${id}-head .word",{opacity:0,y:28,rotation:-3},{opacity:1,y:0,rotation:0,duration:0.55,ease:"power3.out",stagger:0.07},${r(T + 0.9)});`,
    ...ul.s.map((x) => x.replace("__AT__", r(T + 1.5))),
    scene.subtext ? `tl.fromTo("#${id}-sub",{opacity:0,y:20},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.6)});` : "",
    ...feat.s.map((x) => x.replace("__AT__", r(T + 2.0))),
  ].filter(Boolean);
  return { html, s };
}

function blCards(scene, ctx) {
  const { id, T, theme, land = true } = ctx;
  let items = bullets(scene, 3);
  if (items.length < 2) items = ["Write", "Grow", "Bloom"];
  const cols = [theme.coral, theme.sage, theme.sun];
  const cardHtml = items.map((t, i) => {
    const parts = String(t).split(/[:—-]\s?/);
    const ct = (parts[0] || t).trim().slice(0, 16);
    const cs = (parts[1] || "").trim().slice(0, 54);
    return `<div class="card ${id}-card" style="width:${land ? 19 : 60}cqw;padding:${land ? 2 : 2.4}cqw;opacity:0;">
      <svg width="72" height="72" viewBox="0 0 72 72" style="overflow:visible;"><g fill="none" stroke="${cols[i % 3]}" stroke-width="5" stroke-linecap="round">
        <circle class="${id}-ic draw" pathLength="100" cx="36" cy="36" r="11"/>
        <path class="${id}-ic draw" pathLength="100" d="M36 6 V18 M36 54 V66 M6 36 H18 M54 36 H66 M15 15 L24 24 M57 15 L48 24 M15 57 L24 48 M57 57 L48 48"/></g></svg>
      <div class="display" style="font-size:${land ? 2.3 : 3.6}cqw;margin-top:1cqw;color:${theme.plum};">${esc(ct)}</div>
      ${cs ? `<div class="body" style="font-size:${land ? 1.35 : 2.2}cqw;margin-top:0.5cqw;">${esc(cs)}</div>` : ""}</div>`;
  }).join("");
  const html = `${open(id, ctx)}
    <svg id="${id}-vine" viewBox="0 0 1920 240" style="position:absolute;left:0;top:44%;width:100%;height:12.5cqw;overflow:visible;" data-layout-allow-occlusion>
      <path class="draw" id="${id}-vp" pathLength="100" d="M-20 150 C 300 40 560 210 880 120 C 1200 30 1460 200 1940 90" fill="none" stroke="${theme.sage}" stroke-width="9" stroke-linecap="round"/></svg>
    <div class="safe">
      <div class="script" id="${id}-kick" style="opacity:0;margin-bottom:2cqw;">${esc(scene.kicker || KICK.cards)}</div>
      <div style="display:flex;flex-direction:${land ? "row" : "column"};gap:${land ? 5 : 2.2}cqw;align-items:${land ? "stretch" : "center"};">${cardHtml}</div>
    </div>
    <div id="${id}-bf" style="position:absolute;left:-7cqw;top:30cqw;width:5.2cqw;opacity:0;" data-layout-allow-occlusion>
      <svg viewBox="0 0 100 80" style="width:100%;overflow:visible;">
        <path class="${id}-bwl" d="M46 40 C 18 8 -8 18 4 42 C 12 60 34 58 46 46 Z" fill="${theme.coral}" opacity="0.92" style="transform-origin:46px 42px;"/>
        <path class="${id}-bwr" d="M54 40 C 82 8 108 18 96 42 C 88 60 66 58 54 46 Z" fill="${theme.sun}" opacity="0.92" style="transform-origin:54px 42px;"/>
        <line x1="50" y1="26" x2="50" y2="58" stroke="${theme.plum}" stroke-width="5" stroke-linecap="round"/></svg></div>
  </div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.to("#${id}-vp",{strokeDashoffset:0,duration:1.5,ease:"power1.inOut"},${r(T + 0.2)});`,
    `tl.fromTo("#${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.25)});`,
    `tl.fromTo(".${id}-card",{opacity:0,y:46,rotation:function(i){return i%2?2.5:-2.5;}},{opacity:1,y:0,rotation:0,duration:0.65,ease:"back.out(1.5)",stagger:0.35},${r(T + 0.5)});`,
    `tl.to(".${id}-ic",{strokeDashoffset:0,duration:0.7,ease:"power2.out",stagger:0.12},${r(T + 1.0)});`,
    `tl.fromTo("#${id}-bf",{opacity:0},{opacity:1,duration:0.4},${r(T + 0.5)});`,
    `tl.to("#${id}-bf",{x:"+=430",y:-46,duration:1.0,ease:"sine.inOut"},${r(T + 0.6)});`,
    `tl.to("#${id}-bf",{x:"+=460",y:30,duration:1.1,ease:"sine.inOut"},${r(T + 1.6)});`,
    `tl.to(".${id}-bwl",{scaleX:0.32,duration:0.16,ease:"sine.inOut",yoyo:true,repeat:reps(${r(ctx.L)},0.16)},${r(T + 0.5)});`,
    `tl.to(".${id}-bwr",{scaleX:0.32,duration:0.16,ease:"sine.inOut",yoyo:true,repeat:reps(${r(ctx.L)},0.16)},${r(T + 0.5)});`,
  ];
  return { html, s };
}

function blStats(scene, ctx) {
  const { id, T, theme, land = true } = ctx;
  const stats = pickStats(scene, 3);
  if (!stats.length) stats.push({ pre: "", target: 100, suf: "%", label: "in full bloom" });
  const cols = [theme.coral, theme.sage, theme.sun];
  // Portrait keeps the ring row (3 × 26cqw fits) but everything scales up.
  const ringHtml = stats.map((st, i) => `<div class="card ${id}-card" style="width:${land ? 17.5 : 26}cqw;padding:${land ? 2.2 : 2.6}cqw;display:flex;flex-direction:column;align-items:center;opacity:0;">
      <div style="position:relative;width:${land ? 7.6 : 11.4}cqw;height:${land ? 7.6 : 11.4}cqw;">
        <svg viewBox="0 0 120 120" style="width:100%;height:100%;overflow:visible;">
          <circle cx="60" cy="60" r="48" fill="none" stroke="#F0E4D2" stroke-width="10"/>
          <circle class="${id}-ring" pathLength="100" cx="60" cy="60" r="48" fill="none" stroke="${cols[i % 3]}" stroke-width="10" stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="100" transform="rotate(-90 60 60)"/></svg>
        <div class="display ${id}-num" id="${id}-n${i}" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:${land ? 2.3 : 3.4}cqw;color:${theme.plum};">${esc(st.pre)}0${esc(st.suf)}</div>
      </div>
      <div class="body" style="font-size:${land ? 1.3 : 2}cqw;margin-top:1.1cqw;text-align:center;">${esc(st.label)}</div></div>`).join("");
  const html = `${open(id, ctx)}<div class="safe">
    <div class="script" id="${id}-kick" style="opacity:0;">${esc(scene.kicker || KICK.stats)}</div>
    <h1 class="display" id="${id}-head" style="font-size:${land ? 4.2 : 6}cqw;margin-top:0.6cqw;opacity:0;">${hl(scene, theme.coral)}</h1>
    <div style="display:flex;gap:${land ? 4 : 3}cqw;margin-top:2.6cqw;justify-content:center;">${ringHtml}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo("#${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.15)});`,
    `tl.fromTo("#${id}-head",{opacity:0,y:26},{opacity:1,y:0,duration:0.6,ease:"power3.out"},${r(T + 0.3)});`,
    `tl.fromTo(".${id}-card",{opacity:0,y:52,scale:0.92},{opacity:1,y:0,scale:1,duration:0.65,ease:"back.out(1.4)",stagger:0.22},${r(T + 0.55)});`,
    `tl.to(".${id}-ring",{strokeDashoffset:function(i){return [10,4,0][i%3];},duration:1.2,ease:"power2.out",stagger:0.2},${r(T + 1.1)});`,
    ...stats.map((st, i) => `count("#${id}-n${i}",${st.target},${r(T + 1.1 + i * 0.2)},1.1,${JSON.stringify(st.pre)},${JSON.stringify(st.suf)});`),
    `tl.to(".${id}-card",{y:-12,duration:1.1,ease:"sine.inOut",yoyo:true,repeat:1,stagger:0.14},${r(T + 2.6)});`,
  ];
  return { html, s };
}

function blRibbons(scene, ctx) {
  const { id, T, theme, land = true } = ctx;
  let rb = bullets(scene, 2);
  if (rb.length < 2) rb = ["No studio.", "No stress."];
  const html = `${open(id, ctx)}
    <svg id="${id}-petals" viewBox="0 0 1920 1080" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;" data-layout-allow-occlusion>
      ${[[300, -40, theme.coral2], [640, -60, theme.coral], [980, -40, theme.blush], [1320, -70, theme.coral2], [1580, -50, theme.coral], [480, -90, theme.blush]].map(([x, y, c]) => `<ellipse class="${id}-pt" cx="${x}" cy="${y}" rx="14" ry="24" fill="${c}"/>`).join("")}
    </svg>
    <div class="safe">
      <div class="ribbon ${id}-r" style="opacity:0;">${esc(rb[0])}</div>
      <div class="ribbon ${id}-r" style="opacity:0;margin-top:1.2cqw;background:${theme.sage};">${esc(rb[1])}</div>
      <h1 class="display" id="${id}-em" style="font-style:italic;font-size:${land ? 6 : 8.6}cqw;margin-top:2.2cqw;opacity:0;">${hl(scene, theme.coral)}</h1>
      <svg id="${id}-fl" width="560" height="34" viewBox="0 0 560 34" style="overflow:visible;max-width:${land ? 30 : 44}cqw;">
        <path class="draw" pathLength="100" d="M8 20 C 150 6, 410 6, 552 20" fill="none" stroke="${theme.sun}" stroke-width="6" stroke-linecap="round"/></svg>
    </div>
  </div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-r",{opacity:1,scaleX:0,transformOrigin:"left center"},{scaleX:1,duration:0.55,ease:"power3.out",stagger:0.35},${r(T + 0.2)});`,
    `tl.fromTo("#${id}-em",{opacity:0,y:34,scale:0.94},{opacity:1,y:0,scale:1,duration:0.7,ease:"power3.out"},${r(T + 1.1)});`,
    `tl.to("#${id}-fl .draw",{strokeDashoffset:0,duration:0.7,ease:"power2.out"},${r(T + 1.8)});`,
    `tl.fromTo(".${id}-pt",{y:0,rotation:0},{y:1240,rotation:function(i){return i%2?200:-160;},x:function(i){return i%2?60:-50;},duration:${r(Math.max(2.0, ctx.L - 0.4))},ease:"none",stagger:0.14},${r(T + 1.4)});`,
  ];
  return { html, s };
}

function blCta(scene, ctx) {
  const { id, T, theme, land = true } = ctx;
  const mark = String(scene.headline || scene.title || "KEYFRAME").toUpperCase().length > 14 ? esc(scene.headline || "KEYFRAME") : esc(String(scene.headline || scene.title || "KEYFRAME"));
  const tag = esc(scene.subtext || "Type a sentence. Watch it grow into a film.");
  const cta = esc(String(scene.emphasis || "Plant your first film").slice(0, 26));
  const html = `${open(id, ctx)}<div class="safe">
    <div class="script" id="${id}-kick" style="opacity:0;">${esc(scene.kicker || KICK.cta)}</div>
    <div style="display:flex;align-items:center;gap:1.6cqw;margin-top:1cqw;">
      <h1 class="display" id="${id}-mark" style="font-size:${land ? 6.4 : 8.8}cqw;opacity:0;">${mark}</h1>
      <svg id="${id}-bloom" width="120" height="120" viewBox="0 0 120 120" style="overflow:visible;opacity:0;"><g>
        ${[[60, 30, 0, theme.coral], [86, 45, 60, theme.coral2], [86, 75, 120, theme.coral], [60, 90, 180, theme.coral2], [34, 75, 240, theme.coral], [34, 45, 300, theme.coral2]].map(([cx, cy, rot, c]) => `<ellipse cx="${cx}" cy="${cy}" rx="14" ry="24" fill="${c}"${rot ? ` transform="rotate(${rot} 60 60)"` : ""}/>`).join("")}
        <circle cx="60" cy="60" r="16" fill="${theme.sun}"/></g></svg>
    </div>
    <div class="body" id="${id}-tag" style="opacity:0;margin-top:0.8cqw;">${tag}</div>
    <div class="cta" id="${id}-cta" style="opacity:0;margin-top:2.4cqw;">${cta} <span style="font-weight:700;">&#8594;</span></div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo("#${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.15)});`,
    `tl.fromTo("#${id}-mark",{opacity:0,y:34},{opacity:1,y:0,duration:0.65,ease:"power3.out"},${r(T + 0.35)});`,
    `tl.fromTo("#${id}-bloom",{opacity:0,scale:0,rotation:-80,transformOrigin:"center center"},{opacity:1,scale:1,rotation:0,duration:0.8,ease:"elastic.out(1, 0.65)"},${r(T + 0.75)});`,
    `tl.fromTo("#${id}-tag",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.95)});`,
    `tl.fromTo("#${id}-cta",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.6,ease:"back.out(1.7)"},${r(T + 1.3)});`,
    `tl.to("#${id}-cta",{scale:1.05,duration:0.6,ease:"sine.inOut",yoyo:true,repeat:2},${r(T + 2.0)});`,
    `tl.to("#${id}-bloom",{rotation:30,duration:1.8,ease:"sine.inOut",transformOrigin:"center center"},${r(T + 1.7)});`,
  ];
  return { html, s };
}

const BUILDERS = { title: blTitle, plant: blPlant, plate: blPlate, cards: blCards, stats: blStats, ribbons: blRibbons, cta: blCta };

// ---- meadow chrome + captions (content-independent) --------------------------
function chromeHtml(theme) {
  return `
  <div id="meadow" class="clip" data-start="0" data-duration="__D__" data-track-index="0" data-layout-allow-occlusion>
    <svg id="sunwrap" width="340" height="340" viewBox="0 0 200 200" style="position:absolute;left:8cqw;top:6cqw;overflow:visible;opacity:0;">
      <g id="sun-rays" stroke="${theme.sun}" stroke-width="7" stroke-linecap="round">
        <line x1="100" y1="6" x2="100" y2="34"/><line x1="100" y1="194" x2="100" y2="166"/>
        <line x1="6" y1="100" x2="34" y2="100"/><line x1="194" y1="100" x2="166" y2="100"/>
        <line x1="34" y1="34" x2="53" y2="53"/><line x1="166" y1="34" x2="147" y2="53"/>
        <line x1="34" y1="166" x2="53" y2="147"/><line x1="166" y1="166" x2="147" y2="147"/></g>
      <circle cx="100" cy="100" r="52" fill="${theme.sun}"/><circle cx="100" cy="100" r="52" fill="none" stroke="${theme.sunEdge}" stroke-width="4"/></svg>
    <svg id="cloud1" width="300" height="110" viewBox="0 0 300 110" style="position:absolute;left:56%;top:9%;opacity:0;"><g fill="#FFFFFF" opacity="0.92"><ellipse cx="90" cy="70" rx="66" ry="34"/><ellipse cx="160" cy="52" rx="58" ry="38"/><ellipse cx="228" cy="72" rx="60" ry="30"/></g></svg>
    <svg id="cloud2" width="230" height="90" viewBox="0 0 300 110" style="position:absolute;left:26%;top:16%;opacity:0;"><g fill="#FFFFFF" opacity="0.85"><ellipse cx="90" cy="70" rx="66" ry="34"/><ellipse cx="160" cy="52" rx="58" ry="38"/><ellipse cx="228" cy="72" rx="60" ry="30"/></g></svg>
    <svg id="hills" viewBox="0 0 1920 420" preserveAspectRatio="none" style="position:absolute;left:0;right:0;bottom:0;width:100%;height:24cqw;">
      <path d="M0 220 Q 480 80 960 190 T 1920 150 V420 H0 Z" fill="#D9E7C8"/>
      <path d="M0 300 Q 520 170 1040 260 T 1920 250 V420 H0 Z" fill="#BBD4A8"/>
      <path d="M0 362 Q 460 258 980 330 T 1920 318 V420 H0 Z" fill="${theme.sage2}"/></svg>
    <svg id="grass" viewBox="0 0 1920 130" preserveAspectRatio="none" style="position:absolute;left:0;right:0;bottom:-0.2cqw;width:100%;height:6.4cqw;overflow:visible;">
      <g stroke="#6E9670" stroke-width="7" stroke-linecap="round" fill="none">
        <path class="blade" d="M120 130 Q 112 84 124 48"/><path class="blade" d="M420 130 Q 412 88 424 56"/>
        <path class="blade" d="M980 130 Q 988 90 976 58"/><path class="blade" d="M1460 130 Q 1452 86 1466 52"/>
        <path class="blade" d="M1740 130 Q 1750 92 1738 60"/><path class="blade" d="M640 130 Q 648 94 636 64"/></g></svg>
    <svg class="spark" width="46" height="46" viewBox="0 0 40 40" style="position:absolute;left:20%;top:30%;"><path d="M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z" fill="${theme.sun}"/></svg>
    <svg class="spark" width="34" height="34" viewBox="0 0 40 40" style="position:absolute;left:78%;top:24%;"><path d="M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z" fill="${theme.coral}"/></svg>
    <svg class="spark" width="40" height="40" viewBox="0 0 40 40" style="position:absolute;left:87%;top:52%;"><path d="M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16 Z" fill="${theme.sky}"/></svg>
    <div id="amb-bf" style="position:absolute;left:-8cqw;top:20%;width:4.2cqw;opacity:0;pointer-events:none;">
      <svg viewBox="0 0 100 80" style="width:100%;overflow:visible;">
        <path class="amb-bwl" d="M46 40 C 18 8 -8 18 4 42 C 12 60 34 58 46 46 Z" fill="${theme.coral}" opacity="0.9" style="transform-origin:46px 42px;"/>
        <path class="amb-bwr" d="M54 40 C 82 8 108 18 96 42 C 88 60 66 58 54 46 Z" fill="${theme.sun}" opacity="0.9" style="transform-origin:54px 42px;"/>
        <line x1="50" y1="26" x2="50" y2="58" stroke="${theme.plum}" stroke-width="5" stroke-linecap="round"/></svg></div>
    <svg class="bl-amb-pt" style="left:16%;top:-5%;width:1.3cqw;height:2cqw;" viewBox="0 0 20 32"><ellipse cx="10" cy="16" rx="9" ry="15" fill="${theme.coral2}"/></svg>
    <svg class="bl-amb-pt" style="left:52%;top:-8%;width:1.1cqw;height:1.7cqw;" viewBox="0 0 20 32"><ellipse cx="10" cy="16" rx="9" ry="15" fill="${theme.blush}"/></svg>
    <svg class="bl-amb-pt" style="left:82%;top:-6%;width:1.2cqw;height:1.9cqw;" viewBox="0 0 20 32"><ellipse cx="10" cy="16" rx="9" ry="15" fill="${theme.coral}"/></svg>
  </div>
  <div id="caps" class="clip" data-start="0" data-duration="__D__" data-track-index="20"><div id="cap-pill"><div id="cap-text"></div></div></div>`;
}

function styleBlock(theme, land = true) {
  // PORTRAIT OVERRIDES — cqw tracks container WIDTH; a 9:16 canvas renders the
  // landscape sizes 44% smaller relative to the frame. Appended last (same
  // specificity, later wins). Layout stacking lives in the builders.
  const portrait = land ? "" : `
  .safe { padding:10% 7% 15%; }
  .display { font-size:9.2cqw; }
  .script { font-size:3cqw; }
  .body { font-size:2.9cqw; }
  .ribbon { font-size:3.8cqw; padding:1.6cqw 4.6cqw; }
  .leaf-tag { font-size:2.3cqw; padding:1.3cqw 2.6cqw; }
  .cta { font-size:3.8cqw; padding:2cqw 4.8cqw; }
  .bl-feat li { font-size:2.3cqw; }
  #cap-pill { max-width:86%; }
  #cap-text { font-size:2.4cqw; }`;
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#111; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.groundCss};
    container-type:size; color:${theme.plum}; font-family:${theme.bodyStack};
    --cream:${theme.cream}; --plum:${theme.plum}; --coral:${theme.coral}; --sun:${theme.sun}; --sage:${theme.sage}; --body:${theme.body}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:9% 7% 13%; text-align:center; }
  .display { font-family:${theme.displayStack}; font-weight:600; font-size:6.4cqw; line-height:1.04; letter-spacing:-0.01em; color:${theme.plum}; }
  .script { font-family:${theme.displayStack}; font-style:italic; font-weight:500; font-size:1.9cqw; color:${theme.coral}; }
  .body { font-family:${theme.bodyStack}; font-weight:600; font-size:1.85cqw; line-height:1.5; color:${theme.body}; }
  .word { display:inline-block; will-change:transform,opacity; }
  .card { background:${theme.card}; border-radius:1.6cqw; box-shadow:0 1.2cqw 3cqw rgba(70,52,90,0.14); }
  .ribbon { display:inline-block; background:${theme.coral}; color:#FFF6EC; font-family:${theme.displayStack}; font-weight:600; font-size:2.5cqw; padding:1.1cqw 3.6cqw; transform-origin:left center; clip-path:polygon(0 0, 100% 0, 96% 50%, 100% 100%, 0 100%, 4% 50%); }
  .leaf-tag { display:inline-flex; align-items:center; gap:0.7cqw; background:${theme.card}; color:${theme.plum}; font-family:${theme.bodyStack}; font-weight:700; font-size:1.45cqw; padding:0.95cqw 2cqw; border-radius:999px 999px 999px 0.3cqw; box-shadow:0 0.7cqw 1.8cqw rgba(70,52,90,0.14); will-change:transform; }
  .leaf-tag i { width:0.95cqw; height:0.95cqw; border-radius:999px 999px 999px 0; display:inline-block; }
  .cta { display:inline-flex; align-items:center; gap:1cqw; font-family:${theme.displayStack}; font-weight:600; font-size:2.4cqw; color:#FFF6EC; background:${theme.coral}; padding:1.4cqw 3.6cqw; border-radius:999px; box-shadow:0 1.4cqw 3.2cqw rgba(232,112,95,0.42); will-change:transform; }
  .draw { stroke-dasharray:100; stroke-dashoffset:100; }
  .bl-plate-win { position:relative; width:100%; overflow:hidden; border-radius:1.1cqw; background:#FFFFFF; box-shadow:inset 0 0 0 1px rgba(70,52,90,0.06); }
  .bl-plate-win img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; display:block; }
  .bl-feat { list-style:none; margin-top:1.3cqw; display:flex; flex-direction:column; gap:0.75cqw; }
  .bl-feat li { display:flex; align-items:center; gap:0.9cqw; font-family:${theme.bodyStack}; font-weight:600; font-size:1.4cqw; line-height:1.3; color:${theme.body}; }
  .bl-fdot { width:1.1cqw; height:1.1cqw; border-radius:999px 999px 999px 0; flex:0 0 auto; box-shadow:0 0.3cqw 0.6cqw rgba(70,52,90,0.12); }
  .bl-amb-pt { position:absolute; will-change:transform; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:4.6%; z-index:50; pointer-events:none; }
  #cap-pill { max-width:74%; height:fit-content; flex:0 0 auto; text-align:center; padding:0.95cqw 2.6cqw; border-radius:999px; opacity:0; background:${theme.plum}; box-shadow:0 0.9cqw 2.4cqw rgba(70,52,90,0.3); }
  #cap-text { font-family:${theme.bodyStack}; font-weight:600; font-size:1.5cqw; line-height:1.3; color:#FBF1E4; }
  ${portrait}`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets } = {}) {
  const theme = bloomTheme();
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1920, H = (dims && dims.height) || 1080;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length ? sb.scenes.slice(0, 12) : [{ id: "s1", start: 0, duration: 4, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);

  // Screenshots as framed cream cards: a pinned one (asset.sceneId) claims its scene
  // even when its headline would route elsewhere; the rest fill plain `plant` scenes.
  const images = (Array.isArray(assets) ? assets : []).filter(plateOk).sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const byScene = new Map();
  const pool = [];
  for (const a of images) {
    const sid = a.sceneId != null ? String(a.sceneId) : null;
    if (sid && !byScene.has(sid)) byScene.set(sid, a); else pool.push(a);
  }
  let pooli = 0;

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [];
  const sceneScripts = [];
  const sceneStarts = [];
  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 4);
    let arch = bloomArchetype(scene, i, scenes.length);
    let asset = null;
    const sid = scene.id != null ? String(scene.id) : `s${i + 1}`;
    const ends = arch === "title" || arch === "cta";
    if (!ends && byScene.has(sid)) { arch = "plate"; asset = byScene.get(sid); }
    else if (arch === "plant" && pooli < pool.length) { arch = "plate"; asset = pool[pooli++]; }
    const ctx = { id: `s${i + 1}`, T, L, E: r(T + L), isLast: i === scenes.length - 1, track: 2 + i, dims: { width: W, height: H }, land: W >= H, theme };
    const built = (BUILDERS[arch] || blPlant)(scene, ctx, asset);
    bodyParts.push(built.html);
    sceneStarts.push(T);
    sceneScripts.push(built.s.join("\n"));
    // Scene hand-off: the meadow persists behind every scene, so a scene simply fades
    // its content in and the framework windows the clip out at its data-duration; a
    // boundary opacity:0 hard-kill keeps backward seeks clean. No exit tween on the
    // .clip itself (that trips gsap_exit_missing_hard_kill — the framework owns it).
    if (!ctx.isLast) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const chrome = chromeHtml(theme).replace(/__D__/g, String(D));

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  function reps(t,c){return Math.max(0,Math.floor(t/c)-1);}
  function kill(id,t){tl.set(id,{opacity:0},t);}
  function count(sel,to,at,dur,pre,suf){var o={v:0};tl.to(o,{v:to,duration:dur,ease:"power2.out",snap:{v:1},onUpdate:function(){var e=$(sel);if(e)e.textContent=(pre||"")+Math.round(o.v)+(suf||"");}},at);}

  tl.fromTo("#sunwrap",{opacity:0,y:150},{opacity:1,y:0,duration:1.3,ease:"power2.out"},0.2);
  tl.fromTo("#sun-rays line",{scale:0,transformOrigin:"center center"},{scale:1,duration:0.5,ease:"back.out(1.8)",stagger:0.05},1.0);
  tl.to("#sun-rays",{rotation:150,duration:D,ease:"none",transformOrigin:"100px 100px"},0);
  tl.fromTo("#cloud1",{opacity:0,x:60},{opacity:1,x:0,duration:1.2,ease:"power2.out"},0.5);
  tl.fromTo("#cloud2",{opacity:0,x:-60},{opacity:1,x:0,duration:1.2,ease:"power2.out"},0.7);
  tl.to("#cloud1",{x:-70,duration:13,ease:"sine.inOut",yoyo:true,repeat:reps(D,13)},1.7);
  tl.to("#cloud2",{x:60,duration:11,ease:"sine.inOut",yoyo:true,repeat:reps(D,11)},1.9);
  tl.to(".blade",{rotation:5,duration:2.8,ease:"sine.inOut",yoyo:true,repeat:reps(D-1,2.8),transformOrigin:"bottom center",stagger:0.2},0.5);
  tl.fromTo(".spark",{opacity:0.2,scale:0.7,transformOrigin:"center center"},{opacity:1,scale:1,duration:1.4,ease:"sine.inOut",yoyo:true,repeat:reps(D-1,1.4),stagger:0.45},0.8);
  /* a butterfly wanders the whole meadow, wings fluttering */
  tl.fromTo("#amb-bf",{opacity:0},{opacity:1,duration:0.8,ease:"power2.out"},1.4);
  tl.to("#amb-bf",{x:${Math.round(W * 1.28)},duration:${r(Math.max(6, D - 2.2))},ease:"none"},1.5);
  tl.to("#amb-bf",{y:"-=70",duration:2.4,ease:"sine.inOut",yoyo:true,repeat:reps(${r(Math.max(6, D - 2.2))},2.4)},1.5);
  tl.to(".amb-bwl",{scaleX:0.34,duration:0.18,ease:"sine.inOut",yoyo:true,repeat:reps(D,0.18)},1.4);
  tl.to(".amb-bwr",{scaleX:0.34,duration:0.18,ease:"sine.inOut",yoyo:true,repeat:reps(D,0.18)},1.4);
  /* soft petals drift down through the whole film */
  tl.to(".bl-amb-pt",{y:${H + 130},rotation:220,x:"+=48",duration:7,ease:"none",repeat:reps(D,7),stagger:1.5},0.6);

  ${sceneScripts.join("\n  ")}

  var cues=${JSON.stringify(cues)};
  var proxy={t:0};
  tl.to(proxy,{t:D,duration:D,ease:"none",onUpdate:function(){
    var now=proxy.t;var cap=$("#cap-pill"),txt=$("#cap-text");if(!cap||!txt)return;
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
    `<style>`, styleBlock(theme, W >= H), `</style>`, `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
    chrome, bodyParts.join("\n"), `</div>`,
    `<script>`, script, `</script>`, `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson };
}

module.exports = { buildComposition };
