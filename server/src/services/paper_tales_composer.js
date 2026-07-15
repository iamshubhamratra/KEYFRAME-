// PAPER TALES composer — a native GSAP + SVG/CSS "pop-up storybook". The whole film
// lives inside ONE physical book on a soft desk: the cover opens, real 3D PAGES TURN
// between chapters, and every scene is a paper spread whose contents FOLD UP from the
// page crease like a children's pop-up book. Routes here from attemptLlmComposition when
// the pack `paper-tales` (manifest renderer:"paper-tales") is selected, like the other
// native GSAP/SVG composers (blueprint / bloom-fable / bauhaus-riot / terminal-departures).
//
// Signature grammar (all hand-built): 3D page turns (two-faced turning leaves + a
// brightness dip at edge-on), pop-up FOLD-UPS (rotateX from the crease + a cast shadow),
// a pen that HANDWRITES the line (clip-path reveal + a moving nib), paper friends that
// blink, watercolor blooms, a paper sun, drifting clouds, confetti, a ribbon bookmark —
// and a pop-up paper CINEMA that shows a real product screenshot.
//
// Envelope: buildComposition -> {indexHtml, metaJson}. Engineering contract identical to
// the other composers: one paused GSAP timeline on window.__timelines["vid"]; direct-child
// .clip scenes on unique tracks; a boundary opacity:0 hard-kill per scene; ONE seek-safe
// caption node driven by a single onUpdate proxy; finite repeats; cqw units +
// container-type:size; hidden = opacity:0 only. Deterministic (no Math.random/Date at
// runtime). GOTCHA (documented in the source template): initial off-screen transforms are
// set with gsap.set (never an inline translate) so they don't SUM with the tween channel.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
// Quicksand + Caveat (the source template's fonts) are NOT bundled and naming them in CSS
// fails the font lint gate — so the storybook face is Fraunces (bundled serif), with the
// "hand" text set in Fraunces italic for a warm handwritten feel.
const STORY = "Fraunces";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;

function tealTheme() {
  const fontFace = isBundled(STORY) ? fontFaceCss(STORY) : "";
  return {
    paper: "#FFF9F0", paper2: "#FBF1E1", ink: "#6B5B73", soft: "#A08D97",
    rose: "#E8938C", butter: "#F7C873", sky: "#9CCFE8", mint: "#9CCEA4", lilac: "#C5AEDD",
    accents: ["#E8938C", "#9CCFE8", "#9CCEA4", "#C5AEDD", "#F7C873"],
    storyStack: `'${STORY}', serif`,
    fontFace,
  };
}

// Chapter tab colours + the matching emphasis-word colour, rotated per scene.
const TABS = [
  { tab: "#E8938C", emph: "#C96A63" },
  { tab: "#9CCFE8", emph: "#4E90B4" },
  { tab: "#7FB88A", emph: "#4E8C5C" },
  { tab: "#B79BD4", emph: "#7E5EB0" },
  { tab: "#F7C873", emph: "#C9922F" },
];

function words(scene) { return String(scene.headline || scene.title || "").trim().split(/\s+/).filter(Boolean); }
function emphWord(scene) { return String(scene.emphasis || "").trim().toLowerCase(); }

// Headline with the emphasis word tinted the chapter colour (a warm storybook headline).
function headHtml(scene, emphCol) {
  const E = emphWord(scene);
  const w = words(scene);
  // Each word is its own span so the headline can reveal word-by-word (storybook charm).
  if (!w.length) return `<span class="hw">Once</span> <span class="hw">upon</span> <span class="hw">a</span> <span class="hw">time</span>`;
  return w.map((word) => {
    const bare = word.replace(/[.,!?;:]$/, "").toLowerCase();
    const style = (E && bare === E) ? ` style="color:${emphCol};"` : "";
    return `<span class="hw"${style}>${esc(word)}</span>`;
  }).join(" ");
}

// The hand-written line under a chapter: subtext, else a voiceover sentence, else a default.
function penLine(scene) {
  let t = String(scene.subtext || "").trim();
  if (!t && scene.voiceover) t = String(scene.voiceover).split(/[.!?]/)[0].trim();
  if (!t && Array.isArray(scene.onScreenText) && scene.onScreenText[0]) t = String(scene.onScreenText[0]).trim();
  return (t || "…and the little idea grew").replace(/\s+/g, " ").slice(0, 82);
}

// Estimate the pen-nib travel in px so the nib roughly tracks the writing edge (GSAP can't
// tween cqw). ~font-px * 0.5 per char at the pen font-size (2.05cqw of a 1920 stage).
function penWidthPx(text, W) { const fontPx = 2.05 * (W / 100); return Math.min(Math.round(String(text).length * fontPx * 0.5), Math.round(W * 0.34)); }

function bullets(scene, n) {
  let list = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean) : [];
  if (!list.length && scene.subtext) list = String(scene.subtext).split(/[,.;]|\s—\s/).map((s) => s.trim()).filter((s) => s.length > 1);
  return list.slice(0, n).map(String);
}

// Supporting story lines (onScreenText items / voiceover sentences) BEYOND the single
// pen line — this is the "more text per page" fix. Excludes the headline + the pen line.
function notesFor(scene, penTxt) {
  let src = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean).map(String) : [];
  if (src.length < 2 && scene.voiceover) src = src.concat(String(scene.voiceover).split(/[.!?;\n]|\s—\s/));
  const pen = String(penTxt || "").toLowerCase().trim();
  const head = String(scene.headline || "").toLowerCase().replace(/\s+/g, " ").trim();
  const seen = new Set(), out = [];
  for (const raw of src) {
    const t = String(raw).replace(/\s+/g, " ").trim();
    const k = t.toLowerCase();
    if (t.length >= 4 && t.length <= 48 && k !== pen && k !== head && !seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out.slice(0, 3);
}

// Per-page EXTRAS dropped into the text pad: a "story notes" list (copy density) + a few
// drifting paper marks (ambient motion). Returns {html} + {s} tweens.
function storyExtras(id, scene, ctx, penTxt, notesAt, floatAt) {
  const { theme, tab, i } = ctx;
  const notes = notesFor(scene, penTxt);
  const notesHtml = notes.length
    ? `<div class="story-notes" id="${id}-notes">${notes.map((t) => `<div class="story-note ${id}-note" style="opacity:0;"><span class="story-dot" style="background:${tab.tab};"></span>${esc(t)}</div>`).join("")}</div>`
    : "";
  const marks = ["♥", "★", "✦", "♪", "❀"];
  const cols = [theme.rose, theme.butter, theme.sky, theme.mint, theme.lilac];
  const spots = [["6%", "6%"], ["18%", "17%"], ["3%", "31%"]];
  const floatHtml = spots.map((p, k) => `<span class="story-float ${id}-fl" style="top:${p[0]};right:${p[1]};color:${cols[(k + i) % 5]};opacity:0;">${marks[(k + i) % marks.length]}</span>`).join("");
  const s = [];
  if (notes.length) s.push(`tl.fromTo("#${id} .${id}-note",{opacity:0,x:-18},{opacity:1,x:0,duration:0.5,ease:"power2.out",stagger:0.2},${r(notesAt)});`);
  s.push(`$$("#${id} .${id}-fl").forEach(function(el,k){ tl.fromTo(el,{opacity:0,y:12,scale:0.4,rotation:-12},{opacity:0.9,y:0,scale:1,rotation:0,duration:0.9,ease:"back.out(1.7)"},r(${r(floatAt)}+k*0.35)); tl.to(el,{y:-14,rotation:10,duration:2.2,ease:"sine.inOut",yoyo:true,repeat:1},r(${r(floatAt + 1.0)}+k*0.35)); });`);
  return { html: notesHtml + floatHtml, s };
}

function pickNumber(scene) {
  const src = [scene.emphasis, scene.subtext, scene.headline].map((x) => String(x || "")).find((x) => /\d/.test(x)) || "";
  const m = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)\s?(%|x|\+|k|m)?/i.exec(src);
  if (!m) return null;
  return { pre: m[1] || "", val: m[2].replace(/,/g, ""), suf: (m[3] || "") };
}

function screenOk(a) {
  if (!a || !a.path) return false;
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  const src = String(a.source || "").toLowerCase();
  return a.source === "website" || src.startsWith("library") || a.visionOk === true || a.cdProminence === "hero" || a.cdProminence === "support";
}

function archetype(scene, i, total) {
  const k = `${scene.purpose || ""} ${scene.kind || ""}`.toLowerCase();
  // Cover/end are POSITION-gated (never mid-film): the cover is always scene 0 and the
  // end-card only the last scene (or a cta tagged in the final pair) — so a mid-roll
  // scene tagged cta/hook can't render a stray "The End"/closed-cover in the middle.
  if (i === 0) return "cover";
  if (i === total - 1 || (/cta|outro|end|close/.test(k) && i >= total - 2)) return "end";
  if (/team|friend|people|who|role|crew/.test(k)) return "friends";
  if (/paint|create|design|build|world|craft|make/.test(k)) return "paint";
  if (pickNumber(scene) && /stat|number|metric|proof|result|data|chart/.test(k)) return "stat";
  return "chapter";
}

// ---- pop-up illustrations (SVG) — simple, charming, deterministic --------------
function illoBulb(theme) {
  return `<svg viewBox="0 0 140 170" style="width:100%;height:100%;overflow:visible;">
    <rect x="58" y="120" width="24" height="34" rx="8" fill="#C9A96A"/><rect x="54" y="146" width="32" height="10" rx="5" fill="#B8935A"/>
    <circle cx="70" cy="72" r="46" fill="#FFE9A8" stroke="#F5C86E" stroke-width="5"/>
    <path d="M52 66 Q70 46 88 66" fill="none" stroke="#F0B75A" stroke-width="4" stroke-linecap="round"/>
    <circle cx="58" cy="76" r="4" fill="#8A6D3B"/><circle cx="82" cy="76" r="4" fill="#8A6D3B"/>
    <path d="M60 88 Q70 96 80 88" fill="none" stroke="#8A6D3B" stroke-width="3.4" stroke-linecap="round"/></svg>`;
}
function illoHouse(theme) {
  return `<svg viewBox="0 0 90 90" style="width:100%;height:100%;overflow:visible;">
    <rect x="18" y="42" width="54" height="40" rx="6" fill="#FFF3DF" stroke="#E8C9A0" stroke-width="3"/>
    <polygon points="12 46 45 16 78 46" fill="${theme.rose}" stroke="#D97F82" stroke-width="3" stroke-linejoin="round"/>
    <rect x="38" y="58" width="14" height="24" rx="4" fill="${theme.sky}"/><circle cx="62" cy="58" r="5" fill="${theme.butter}"/></svg>`;
}
function illoStar(theme) {
  return `<svg viewBox="0 0 120 120" style="width:100%;height:100%;overflow:visible;">
    <path d="M60 8 l14 34 37 3 -28 24 9 36 -32 -20 -32 20 9 -36 -28 -24 37 -3 Z" fill="${theme.butter}" stroke="#E0AF5B" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="50" cy="58" r="3.6" fill="#8A6D3B"/><circle cx="70" cy="58" r="3.6" fill="#8A6D3B"/>
    <path d="M52 68 Q60 75 68 68" fill="none" stroke="#8A6D3B" stroke-width="3" stroke-linecap="round"/></svg>`;
}
function illoHeart(theme) {
  return `<svg viewBox="0 0 120 110" style="width:100%;height:100%;overflow:visible;">
    <path d="M60 100 C 10 62, 16 20, 44 22 C 56 23, 60 34, 60 38 C 60 34, 64 23, 76 22 C 104 20, 110 62, 60 100 Z" fill="${theme.rose}" stroke="#D97F82" stroke-width="4" stroke-linejoin="round"/></svg>`;
}
const ILLOS = [illoBulb, illoStar, illoHouse, illoHeart];

// ---- scene-type builders ((scene, ctx, asset) -> { html, s }) -------------------
function pageOpen(id, ctx) { return `<div class="clip" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

// A chapter spread: text page (tab + headline + pen-write) on one side, illustration
// pop-up on the other. `illoOnLeft` alternates the layout per scene.
function chapterSpread(scene, ctx, opts) {
  const { id, T, theme, tab } = ctx;
  const pen = penLine(scene);
  const penW = penWidthPx(pen, ctx.W);
  const extras = storyExtras(id, scene, ctx, pen, r(T + 2.2), r(T + 1.0));
  const illoOnLeft = ctx.i % 2 === 1;
  const illo = opts.illo || `<div class="popcard">${(ILLOS[ctx.i % ILLOS.length])(theme)}</div>`;
  const textPage = `<div class="pg ${illoOnLeft ? "pgR" : "pgL"}">
    <div class="chapter-tab" id="${id}-tab" style="background:${tab.tab};${tab.tab === theme.butter ? "color:#7A5B23;" : ""}">${esc(ctx.tabLabel)}</div>
    <div class="pad" style="display:flex;flex-direction:column;justify-content:center;">
      <div class="h-story" id="${id}-h" style="font-size:2.7cqw;opacity:0;">${headHtml(scene, tab.emph)}</div>
      <div class="penwrap" style="margin-top:1.8cqw;">
        <span class="hand pen-clip" id="${id}-write" style="font-size:2.05cqw;color:${theme.soft};white-space:normal;">${esc(pen)}</span>
        ${penSvg(id, tab.tab)}
      </div>
      ${extras.html}
    </div></div>`;
  const illoPage = `<div class="pg ${illoOnLeft ? "pgL" : "pgR"}">
    <div class="pad" style="display:flex;align-items:center;justify-content:center;">
      <div class="popwrap" id="${id}-popw" style="width:21cqw;height:25cqw;bottom:4.5cqw;left:50%;margin-left:-10.5cqw;">
        <div class="popshadow" id="${id}-popsh" style="opacity:0;"></div>
        <div class="pop" id="${id}-pop">${illo}</div>
      </div>
    </div></div>`;
  const html = `${pageOpen(id, ctx)}${illoOnLeft ? illoPage + textPage : textPage + illoPage}</div>`;
  const s = [
    ...spreadIn(id, T),
    `popUp("#${id}-pop","#${id}-popsh",${r(T + 0.7)},0.95);`,
    `tl.to("#${id}-pop",{rotation:2,duration:1.2,ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"50% 100%"},${r(T + 2.1)});`,
    `penWrite("#${id}-write","#${id}-pen",${r(T + 1.3)},1.7,${penW});`,
    ...extras.s,
    ...spreadOut(id, ctx),
  ];
  return { html, s };
}

// PAPER FRIENDS — a row of cut-out characters that fold up, bounce and blink.
function friendsSpread(scene, ctx) {
  const { id, T, theme, tab } = ctx;
  const cols = [theme.rose, theme.butter, theme.sky, theme.mint, theme.lilac];
  const list = bullets(scene, 5);
  const n = Math.max(3, Math.min(5, list.length || 5));
  const totalN = (pickNumber(scene) && Number(pickNumber(scene).val)) || 12;
  const moreN = Math.max(0, totalN - n);   // reconcile "Twelve friends" with the 5 shown
  const pen = penLine(scene); const penW = penWidthPx(pen, ctx.W);
  const extras = storyExtras(id, scene, ctx, pen, r(T + 2.2), r(T + 1.0));
  const friends = Array.from({ length: n }, (_, k) => `<div class="popwrap ${id}-fw" style="position:relative;width:5.2cqw;height:7.4cqw;">
      <div class="popshadow ${id}-fsh" style="opacity:0;"></div>
      <div class="pop ${id}-fpop"><div class="friend"><div class="head"><span class="eye ${id}-eye" style="left:0.85cqw;"></span><span class="eye ${id}-eye" style="right:0.85cqw;"></span><span class="cheek" style="left:0.45cqw;"></span><span class="cheek" style="right:0.45cqw;"></span><span class="smile"></span></div><div class="body" style="background:${cols[k % 5]};"></div></div></div>
    </div>`).join("");
  const html = `${pageOpen(id, ctx)}
    <div class="pg pgL"><div class="pad" style="display:flex;align-items:flex-end;justify-content:center;padding-bottom:4.5cqw;">
      <div style="display:flex;gap:1.4cqw;align-items:flex-end;">${friends}</div>
      ${moreN > 0 ? `<div class="hand" id="${id}-plus" style="position:absolute;right:2.2cqw;bottom:3.2cqw;font-size:2cqw;color:${theme.soft};opacity:0;">…and ${moreN} more! ✂</div>` : ""}
    </div></div>
    <div class="pg pgR">
      <div class="chapter-tab" id="${id}-tab" style="background:${tab.tab};">${esc(ctx.tabLabel)}</div>
      <div class="pad" style="display:flex;flex-direction:column;justify-content:center;">
        <div class="h-story" id="${id}-h" style="font-size:2.7cqw;opacity:0;">${headHtml(scene, tab.emph)}</div>
        <div class="penwrap" style="margin-top:1.8cqw;">
          <span class="hand pen-clip" id="${id}-write" style="font-size:2.05cqw;color:${theme.soft};">${esc(pen)}</span>${penSvg(id, tab.tab)}
        </div>
        ${extras.html}
      </div></div></div>`;
  const s = [
    ...spreadIn(id, T),
    `$$(".${id}-fpop").forEach(function(el,i){ popUp(el,$$(".${id}-fsh")[i],r(${r(T + 0.65)}+i*0.2),0.8); });`,
    `tl.to(".${id}-fpop",{y:-8,duration:0.32,ease:"sine.inOut",yoyo:true,repeat:1,stagger:0.09},${r(T + 2.6)});`,
    `blink(".${id}-eye",${r(T + 2.4)}); blink(".${id}-eye",${r(T + 3.9)});`,
    moreN > 0 ? `tl.fromTo("#${id}-plus",{opacity:0,rotation:-6},{opacity:1,rotation:0,duration:0.5,ease:"back.out(1.7)"},${r(T + 2.2)});` : "",
    `penWrite("#${id}-write","#${id}-pen",${r(T + 1.3)},1.8,${penW});`,
    ...extras.s,
    ...spreadOut(id, ctx),
  ].filter(Boolean);
  return { html, s };
}

// PAINT — watercolor blooms + a paper sun + a little house pop-up.
function paintSpread(scene, ctx) {
  const { id, T, theme, tab } = ctx;
  const pen = penLine(scene); const penW = penWidthPx(pen, ctx.W);
  const extras = storyExtras(id, scene, ctx, pen, r(T + 2.2), r(T + 1.0));
  const html = `${pageOpen(id, ctx)}
    <div class="pg pgL">
      <div class="chapter-tab" id="${id}-tab" style="background:${tab.tab};">${esc(ctx.tabLabel)}</div>
      <div class="pad" style="display:flex;flex-direction:column;justify-content:center;">
        <div class="h-story" id="${id}-h" style="font-size:2.7cqw;opacity:0;">${headHtml(scene, tab.emph)}</div>
        <div class="penwrap" style="margin-top:1.8cqw;">
          <span class="hand pen-clip" id="${id}-write" style="font-size:2.05cqw;color:${theme.soft};">${esc(pen)}</span>${penSvg(id, tab.tab)}
        </div>
        ${extras.html}
      </div></div>
    <div class="pg pgR"><div class="pad">
      <div class="wc ${id}-wc" style="left:6%;bottom:12%;width:16cqw;height:9cqw;background:radial-gradient(50% 50% at 50% 50%, #BCE0C2, transparent 70%);"></div>
      <div class="wc ${id}-wc" style="left:36%;bottom:8%;width:20cqw;height:10cqw;background:radial-gradient(50% 50% at 50% 50%, #A8D3AE, transparent 70%);"></div>
      <div class="wc ${id}-wc" style="left:16%;top:18%;width:12cqw;height:6cqw;background:radial-gradient(50% 50% at 50% 50%, #BFE0F2, transparent 70%);"></div>
      <div class="wc ${id}-wc" style="right:2%;top:10%;width:9cqw;height:9cqw;background:radial-gradient(50% 50% at 50% 50%, #FFDD9C, transparent 68%);"></div>
      <svg id="${id}-sun" width="130" height="130" viewBox="0 0 120 120" style="position:absolute;right:8%;top:8%;overflow:visible;opacity:0;">
        <g id="${id}-rays" fill="${theme.butter}"><polygon points="60 0 66 20 54 20"/><polygon points="60 120 66 100 54 100"/><polygon points="0 60 20 54 20 66"/><polygon points="120 60 100 54 100 66"/><polygon points="18 18 34 26 26 34"/><polygon points="102 18 94 34 86 26"/><polygon points="18 102 26 86 34 94"/><polygon points="102 102 86 94 94 86"/></g>
        <circle cx="60" cy="60" r="28" fill="#FFD98E" stroke="#F5B95A" stroke-width="4"/></svg>
      <div class="popwrap" id="${id}-popw" style="width:9cqw;height:9cqw;left:34%;bottom:14%;">
        <div class="popshadow" id="${id}-popsh" style="opacity:0;"></div>
        <div class="pop" id="${id}-pop">${illoHouse(theme)}</div>
      </div>
    </div></div></div>`;
  const s = [
    ...spreadIn(id, T),
    `$$(".${id}-wc").forEach(function(el,i){ tl.fromTo(el,{opacity:0,scale:0.4},{opacity:1,scale:1,duration:1.0,ease:"power2.out",transformOrigin:"center center"},r(${r(T + 0.55)}+i*0.3)); });`,
    `tl.fromTo("#${id}-sun",{opacity:0,scale:0.4,transformOrigin:"center center"},{opacity:1,scale:1,duration:0.7,ease:"back.out(1.7)"},${r(T + 1.7)});`,
    `tl.to("#${id}-rays",{rotation:60,duration:2.6,ease:"sine.inOut",svgOrigin:"60 60"},${r(T + 2.1)});`,
    `popUp("#${id}-pop","#${id}-popsh",${r(T + 1.9)},0.9);`,
    `penWrite("#${id}-write","#${id}-pen",${r(T + 1.3)},1.8,${penW});`,
    ...extras.s,
    ...spreadOut(id, ctx),
  ];
  return { html, s };
}

// STAT — a big storybook number folds up on a paper card.
function statSpread(scene, ctx) {
  const { id, T, theme, tab } = ctx;
  const num = pickNumber(scene) || { pre: "", val: "12", suf: "" };
  const pen = penLine(scene); const penW = penWidthPx(pen, ctx.W);
  const extras = storyExtras(id, scene, ctx, pen, r(T + 2.2), r(T + 1.0));
  const html = `${pageOpen(id, ctx)}
    <div class="pg pgL"><div class="pad" style="display:flex;align-items:center;justify-content:center;">
      <div class="popwrap" id="${id}-popw" style="width:20cqw;height:15cqw;bottom:6cqw;left:50%;margin-left:-10cqw;">
        <div class="popshadow" id="${id}-popsh" style="opacity:0;"></div>
        <div class="pop" id="${id}-pop">
          <div class="popcard" style="display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <div class="h-story" style="font-size:6cqw;color:${tab.emph};line-height:1;">${esc(num.pre)}<span id="${id}-num">0</span>${esc(num.suf)}</div>
            <div class="hand" style="font-size:1.5cqw;color:${theme.soft};margin-top:0.4cqw;">${esc(String(scene.subtext || scene.headline || "").slice(0, 22) || "and counting")}</div>
          </div></div></div>
    </div></div>
    <div class="pg pgR">
      <div class="chapter-tab" id="${id}-tab" style="background:${tab.tab};">${esc(ctx.tabLabel)}</div>
      <div class="pad" style="display:flex;flex-direction:column;justify-content:center;">
        <div class="h-story" id="${id}-h" style="font-size:2.7cqw;opacity:0;">${headHtml(scene, tab.emph)}</div>
        <div class="penwrap" style="margin-top:1.8cqw;"><span class="hand pen-clip" id="${id}-write" style="font-size:2.05cqw;color:${theme.soft};">${esc(pen)}</span>${penSvg(id, tab.tab)}</div>${extras.html}
      </div></div></div>`;
  const isNum = /^\d+$/.test(String(num.val));
  const s = [
    ...spreadIn(id, T),
    `popUp("#${id}-pop","#${id}-popsh",${r(T + 0.7)},0.95);`,
    isNum
      ? `{var o={v:0};tl.to(o,{v:${Number(num.val)},duration:1.3,ease:"power2.out",snap:{v:1},onUpdate:function(){var e=$("#${id}-num");if(e)e.textContent=Math.round(o.v);}},${r(T + 1.6)});}`
      : `tl.set("#${id}-num",{textContent:${JSON.stringify(String(num.val))}},${r(T + 1.6)});`,
    `penWrite("#${id}-write","#${id}-pen",${r(T + 1.3)},1.7,${penW});`,
    ...extras.s,
    ...spreadOut(id, ctx),
  ];
  return { html, s };
}

// SCREEN — a pop-up paper CINEMA showing a real product screenshot (or a paper filmstrip
// when there is none). The screenshot IS the "little film" the story is about.
function screenSpread(scene, ctx, asset) {
  const { id, T, theme, tab } = ctx;
  const pen = penLine(scene); const penW = penWidthPx(pen, ctx.W);
  const extras = storyExtras(id, scene, ctx, pen, r(T + 2.2), r(T + 1.0));
  const inner = asset
    ? `<div class="cine-screen"><img src="${esc(asset.path)}" alt="${esc(asset.alt || "screenshot")}" style="object-fit:cover;object-position:${esc(asset.cropFocus || "top center")};"></div>`
    : `<div class="cine-screen"><div id="${id}-strip" style="position:absolute;top:14%;left:0;display:flex;gap:0.8cqw;">${["#F3B8B1", "#FFE1A6", "#BFE0F2", "#C9E8CE", "#DCC9EE", "#F3B8B1"].map((c) => `<div style="width:6.4cqw;height:8cqw;border-radius:0.5cqw;background:linear-gradient(160deg,${c},${c});"></div>`).join("")}</div></div>`;
  const html = `${pageOpen(id, ctx)}
    <div class="pg pgL"><div class="pad" style="display:flex;align-items:center;justify-content:center;">
      <div class="popwrap" id="${id}-popw" style="width:26cqw;height:18cqw;bottom:5cqw;left:50%;margin-left:-13cqw;">
        <div class="popshadow" id="${id}-popsh" style="opacity:0;"></div>
        <div class="pop" id="${id}-pop">
          <div class="cine-body">
            ${inner}
            <div id="${id}-shine" style="position:absolute;top:0;left:-30%;width:22%;height:100%;transform:skewX(-16deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent);pointer-events:none;"></div>
          </div>
        </div></div>
    </div></div>
    <div class="pg pgR">
      <div class="chapter-tab" id="${id}-tab" style="background:${tab.tab};${tab.tab === theme.butter ? "color:#7A5B23;" : ""}">${esc(ctx.tabLabel)}</div>
      <div class="pad" style="display:flex;flex-direction:column;justify-content:center;">
        <div class="h-story" id="${id}-h" style="font-size:2.7cqw;opacity:0;">${headHtml(scene, tab.emph)}</div>
        <div class="penwrap" style="margin-top:1.8cqw;"><span class="hand pen-clip" id="${id}-write" style="font-size:2.05cqw;color:${theme.soft};">${esc(pen)}</span>${penSvg(id, tab.tab)}</div>${extras.html}
      </div></div></div>`;
  const s = [
    ...spreadIn(id, T),
    `popUp("#${id}-pop","#${id}-popsh",${r(T + 0.7)},0.95);`,
    asset ? "" : `tl.fromTo("#${id}-strip",{x:0},{x:-460,duration:3.2,ease:"none"},${r(T + 1.9)});`,
    `tl.fromTo("#${id}-shine",{xPercent:0},{xPercent:620,duration:1.1,ease:"power1.inOut"},${r(T + 2.2)});`,
    `penWrite("#${id}-write","#${id}-pen",${r(T + 1.3)},1.8,${penW});`,
    ...extras.s,
    ...spreadOut(id, ctx),
  ].filter(Boolean);
  return { html, s };
}

// COVER — the closed book cover with the title, a paper sun and "open me".
function coverSpread(scene, ctx) {
  const { id, T, theme } = ctx;
  const title = esc(String(scene.headline || scene.title || "The Little Idea"));
  const kicker = esc(String(scene.kicker || scene.emphasis || "a keyframe bedtime story").slice(0, 40));
  const html = `${pageOpen(id, ctx)}
    <div class="pg pgL" style="background:linear-gradient(120deg,#F3B8B1,#E8938C);box-shadow:none;border-radius:1.2cqw 0.3cqw 0.3cqw 1.2cqw;">
      <div style="position:absolute;inset:2cqw;border:0.18cqw dashed rgba(255,255,255,0.55);border-radius:0.9cqw;"></div></div>
    <div class="pg pgR" style="background:linear-gradient(120deg,#F3B8B1 0%,#E8938C 100%);box-shadow:inset 1.2cqw 0 2cqw rgba(0,0,0,0.06);">
      <div style="position:absolute;inset:1.8cqw;border:0.18cqw dashed rgba(255,255,255,0.55);border-radius:0.9cqw;"></div>
      <div class="pad" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
        <svg id="${id}-sun" width="150" height="150" viewBox="0 0 120 120" style="overflow:visible;opacity:0;">
          <g id="${id}-rays" fill="${theme.butter}"><polygon points="60 0 66 20 54 20"/><polygon points="60 120 66 100 54 100"/><polygon points="0 60 20 54 20 66"/><polygon points="120 60 100 54 100 66"/><polygon points="18 18 34 26 26 34"/><polygon points="102 18 94 34 86 26"/><polygon points="18 102 26 86 34 94"/><polygon points="102 102 86 94 94 86"/></g>
          <circle cx="60" cy="60" r="30" fill="#FFD98E" stroke="#F5B95A" stroke-width="4"/>
          <circle cx="51" cy="56" r="3.4" fill="#8A6D3B"/><circle cx="69" cy="56" r="3.4" fill="#8A6D3B"/><path d="M52 66 Q60 73 68 66" fill="none" stroke="#8A6D3B" stroke-width="3" stroke-linecap="round"/></svg>
        <div class="hand" id="${id}-once" style="font-size:2.2cqw;color:#fff;opacity:0;margin-top:1.2cqw;">${kicker}</div>
        <div class="h-story" id="${id}-title" style="font-size:4cqw;line-height:1.05;color:#FFF9F0;opacity:0;text-shadow:0 0.2cqw 0 rgba(0,0,0,0.08);">${title}</div>
        <div class="h-story" id="${id}-open" style="font-size:1.1cqw;letter-spacing:0.3em;color:rgba(255,255,255,0.9);opacity:0;margin-top:2cqw;">· OPEN ME ·</div>
      </div></div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:1},{opacity:1,duration:0.01},${T});`,
    `tl.fromTo("#${id}-sun",{opacity:0,scale:0.4,rotation:-40,transformOrigin:"center center"},{opacity:1,scale:1,rotation:0,duration:0.8,ease:"back.out(1.6)"},${r(T + 0.5)});`,
    `tl.to("#${id}-rays",{rotation:40,duration:4.2,ease:"sine.inOut",svgOrigin:"60 60"},${r(T + 0.9)});`,
    `tl.fromTo("#${id}-once",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 1.0)});`,
    `tl.fromTo("#${id}-title",{opacity:0,y:22,scale:0.92},{opacity:1,y:0,scale:1,duration:0.7,ease:"back.out(1.4)"},${r(T + 1.35)});`,
    `tl.fromTo("#${id}-open",{opacity:0},{opacity:1,duration:0.5},${r(T + 2.2)});`,
    `tl.to("#${id}-open",{opacity:0.35,duration:0.5,ease:"sine.inOut",yoyo:true,repeat:3},${r(T + 2.8)});`,
    ...spreadOut(id, ctx),
  ];
  return { html, s };
}

// END — "The End" + the brand mark + a CTA sticker + a swinging ribbon bookmark.
function endSpread(scene, ctx) {
  const { id, T, theme } = ctx;
  const mark = esc(String(scene.headline || "KEYFRAME").slice(0, 20));
  const tag = esc(String(scene.subtext || "every idea deserves a story").slice(0, 40));
  const cta = esc(String(scene.emphasis || "Write yours — free ✎").slice(0, 26));
  const html = `${pageOpen(id, ctx)}
    <div class="pg pgL" style="background:linear-gradient(120deg,#F3B8B1,#E8938C);box-shadow:none;">
      <div style="position:absolute;inset:2cqw;border:0.18cqw dashed rgba(255,255,255,0.55);border-radius:0.9cqw;"></div>
      <div class="pad" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
        <div class="hand" id="${id}-end" style="font-size:5cqw;color:#FFF9F0;opacity:0;">The End</div>
        <div class="hand" id="${id}-endsub" style="font-size:1.9cqw;color:rgba(255,255,255,0.92);opacity:0;margin-top:0.6cqw;">(or rather — the beginning)</div>
      </div></div>
    <div class="pg pgR" style="background:linear-gradient(120deg,#F3B8B1,#E8938C);box-shadow:none;">
      <div style="position:absolute;inset:2cqw;border:0.18cqw dashed rgba(255,255,255,0.55);border-radius:0.9cqw;"></div>
      <div class="pad" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
        <div class="h-story" id="${id}-mark" style="font-size:3.2cqw;color:#FFF9F0;opacity:0;">${mark}</div>
        <div class="hand" id="${id}-tag" style="font-size:2cqw;color:rgba(255,255,255,0.94);opacity:0;margin-top:0.5cqw;">${tag}</div>
        <div class="cta-sticker" id="${id}-cta" style="opacity:0;margin-top:2.2cqw;background:#FFF9F0;color:${theme.rose};">${cta}</div>
        <div id="${id}-ribbon" style="position:absolute;right:4cqw;top:-0.4cqw;width:2.4cqw;height:12cqw;opacity:0;transform-origin:50% 0%;">
          <div style="position:absolute;inset:0;background:linear-gradient(180deg,#F7C873,#F0B75A);border-radius:0 0 0.3cqw 0.3cqw;clip-path:polygon(0 0,100% 0,100% 100%,50% 88%,0 100%);box-shadow:0 0.4cqw 1cqw rgba(107,91,115,0.25);"></div>
        </div>
      </div></div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.3},${r(T + 0.3)});`,
    `tl.fromTo("#${id}-end",{opacity:0,scale:0.7,rotation:-4},{opacity:1,scale:1,rotation:0,duration:0.7,ease:"back.out(1.5)"},${r(T + 0.8)});`,
    `tl.fromTo("#${id}-endsub",{opacity:0,y:12},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.4)});`,
    `tl.fromTo("#${id}-mark",{opacity:0,y:18},{opacity:1,y:0,duration:0.6,ease:"power3.out"},${r(T + 1.1)});`,
    `tl.fromTo("#${id}-tag",{opacity:0,y:12},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.6)});`,
    `tl.fromTo("#${id}-cta",{opacity:0,scale:0.6,rotation:-5},{opacity:1,scale:1,rotation:0,duration:0.6,ease:"back.out(1.8)"},${r(T + 2.1)});`,
    `tl.to("#${id}-cta",{scale:1.05,duration:0.6,ease:"sine.inOut",yoyo:true,repeat:3},${r(T + 2.9)});`,
    `tl.fromTo("#${id}-ribbon",{opacity:0,y:-60},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 1.7)});`,
    `tl.fromTo("#${id}-ribbon",{rotation:9},{rotation:-7,duration:1.1,ease:"sine.inOut",yoyo:true,repeat:2},${r(T + 2.1)});`,
    ...spreadOut(id, ctx),   // fades out if this end-card is ever mid-film (position-gated, but safe)
  ];
  return { html, s };
}

// shared: a chapter's paper pen SVG (nib colour matches the chapter tab).
function penSvg(id, col) {
  return `<svg class="pen" id="${id}-pen" viewBox="0 0 48 48"><g transform="rotate(38 24 24)"><rect x="19" y="2" width="10" height="26" rx="3" fill="${col}"/><path d="M19 28 H29 L24 42 Z" fill="#F7C873"/><path d="M22.6 37 L24 42 L25.4 37 Z" fill="#6B5B73"/></g></svg>`;
}
// shared spread intro (tab drops in, headline rises).
function spreadIn(id, T) {
  // Content enters EARLY (during the page-turn that reveals this spread) so the turning
  // leaf never lifts to expose a blank cream page — kills the dead-air at transitions.
  return [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.3},${r(T + 0.12)});`,
    `tl.fromTo("#${id}-tab",{yPercent:-110},{yPercent:0,duration:0.5,ease:"back.out(1.6)"},${r(T + 0.45)});`,
    `tl.set("#${id}-h",{opacity:1},${r(T + 0.5)});`,
    `tl.fromTo("#${id}-h .hw",{opacity:0,y:24,rotationZ:-4},{opacity:1,y:0,rotationZ:0,duration:0.5,stagger:0.08,ease:"back.out(1.4)"},${r(T + 0.5)});`,
  ];
}
// shared spread outro (fade + boundary hard-kill). Not for the last scene (handled by kill()).
function spreadOut(id, ctx) {
  if (ctx.isLast) return [];
  return [
    `tl.to("#${id}",{opacity:0,duration:0.35},${r(ctx.E + 0.35)});`,
  ];
}

const BUILDERS = { cover: coverSpread, end: endSpread, friends: friendsSpread, paint: paintSpread, stat: statSpread, screen: screenSpread, chapter: chapterSpread };

function styleBlock(theme) {
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#F4E3D7; }
  #root { position:relative; overflow:hidden; isolation:isolate; container-type:size; color:${theme.ink}; font-family:${theme.storyStack};
    background:radial-gradient(90% 80% at 50% 18%, #FBEFE2 0%, #F6E2D2 55%, #EFD3BF 100%);
    --paper:${theme.paper}; --paper2:${theme.paper2}; --ink:${theme.ink}; --soft:${theme.soft};
    --rose:${theme.rose}; --butter:${theme.butter}; --sky:${theme.sky}; --mint:${theme.mint}; --lilac:${theme.lilac}; --crease:rgba(107,91,115,0.10); }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .pg { position:absolute; top:7.6cqw; width:38cqw; height:41cqw; overflow:hidden; }
  .pgL { left:12cqw; border-radius:1.2cqw 0.3cqw 0.3cqw 1.2cqw; background:linear-gradient(90deg, var(--paper2) 0%, var(--paper) 12%, var(--paper) 100%); box-shadow:inset -1.2cqw 0 2cqw rgba(107,91,115,0.08); }
  .pgR { left:50cqw; border-radius:0.3cqw 1.2cqw 1.2cqw 0.3cqw; background:linear-gradient(90deg, var(--paper) 0%, var(--paper) 88%, var(--paper2) 100%); box-shadow:inset 1.2cqw 0 2cqw rgba(107,91,115,0.08); }
  .pad { position:absolute; inset:2.6cqw 2.8cqw; }
  .h-story { font-family:${theme.storyStack}; font-weight:700; color:${theme.ink}; line-height:1.12; }
  .hand { font-family:${theme.storyStack}; font-style:italic; font-weight:600; color:${theme.ink}; }
  .hw { display:inline-block; will-change:transform; }
  .story-notes { margin-top:1.5cqw; display:flex; flex-direction:column; gap:0.7cqw; max-width:32cqw; }
  .story-note { display:flex; align-items:flex-start; gap:0.9cqw; font-family:${theme.storyStack}; font-style:italic; font-weight:600; font-size:1.5cqw; line-height:1.28; color:${theme.ink}; }
  .story-dot { width:0.7cqw; height:0.7cqw; border-radius:50%; flex:0 0 auto; margin-top:0.42cqw; }
  .story-float { position:absolute; font-size:1.9cqw; pointer-events:none; will-change:transform; }
  .chapter-tab { position:absolute; top:-0.2cqw; left:2.8cqw; padding:0.9cqw 1.5cqw 0.6cqw; border-radius:0 0 0.7cqw 0.7cqw; font-weight:700; font-size:0.95cqw; letter-spacing:0.24em; color:#fff; text-transform:uppercase; }
  .popwrap { position:absolute; perspective:1300px; }
  .pop { width:100%; height:100%; transform-origin:50% 100%; will-change:transform; }
  .popshadow { position:absolute; left:8%; right:8%; bottom:-0.7cqw; height:1.2cqw; border-radius:50%; background:radial-gradient(50% 50% at 50% 50%, rgba(107,91,115,0.22), transparent 70%); }
  .popcard { width:100%; height:100%; background:var(--paper); border:0.2cqw solid #EBCDB2; border-radius:1cqw; box-shadow:0 0.6cqw 1.6cqw rgba(107,91,115,0.16); padding:0.8cqw; }
  .penwrap { position:relative; display:inline-block; }
  .pen-clip { display:inline-block; clip-path:inset(0 100% 0 0); line-height:1.3; }
  .pen { position:absolute; width:2.6cqw; top:-1.4cqw; left:0; opacity:0; will-change:transform; }
  .friend { position:relative; width:5.2cqw; height:7.4cqw; }
  .friend .body { position:absolute; left:8%; right:8%; bottom:0; height:56%; border-radius:1.4cqw 1.4cqw 0.9cqw 0.9cqw; }
  .friend .head { position:absolute; left:50%; top:0; width:3.4cqw; height:3.4cqw; margin-left:-1.7cqw; border-radius:50%; background:#FDE8D8; }
  .friend .eye { position:absolute; top:1.35cqw; width:0.42cqw; height:0.52cqw; border-radius:50%; background:#5A4A62; }
  .friend .smile { position:absolute; top:2.1cqw; left:50%; width:0.95cqw; height:0.5cqw; margin-left:-0.475cqw; border:0.14cqw solid #5A4A62; border-top:none; border-radius:0 0 1cqw 1cqw; }
  .friend .cheek { position:absolute; top:1.9cqw; width:0.55cqw; height:0.34cqw; border-radius:50%; background:rgba(232,147,140,0.55); }
  .wc { position:absolute; border-radius:50%; filter:blur(4px); opacity:0; mix-blend-mode:multiply; }
  .cine-body { position:absolute; inset:0; background:#6B5B73; border-radius:1.2cqw; box-shadow:0 0.6cqw 1.6cqw rgba(107,91,115,0.3); padding:0.9cqw; }
  .cine-screen { position:absolute; inset:0.9cqw; background:#FFF9F0; border-radius:0.7cqw; overflow:hidden; }
  .cine-screen img { position:absolute; inset:0; width:100%; height:100%; display:block; }
  .cta-sticker { display:inline-flex; align-items:center; gap:0.9cqw; font-weight:700; font-size:2cqw; color:#fff; background:var(--rose); padding:1.2cqw 3cqw; border-radius:999px; box-shadow:0 0.8cqw 2cqw rgba(232,147,140,0.5), inset 0 -0.35cqw 0 rgba(0,0,0,0.08); will-change:transform; }
  .leaf { position:absolute; left:50%; top:0; width:50%; height:100%; transform-style:preserve-3d; transform-origin:0% 50%; will-change:transform; }
  .face { position:absolute; inset:0; backface-visibility:hidden; border-radius:0.3cqw 1.2cqw 1.2cqw 0.3cqw; background:linear-gradient(90deg,#FFF9F0,#FBF1E1); background-image:repeating-linear-gradient(180deg, transparent 0 2.2cqw, rgba(107,91,115,0.05) 2.2cqw calc(2.2cqw + 1px)); }
  .f-back { transform:rotateY(180deg); border-radius:1.2cqw 0.3cqw 0.3cqw 1.2cqw; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:3.4%; z-index:50; pointer-events:none; }
  #cap-pill { max-width:74%; height:fit-content; flex:0 0 auto; text-align:center; padding:0.8cqw 2.4cqw; border-radius:999px; opacity:0; background:rgba(255,249,240,0.95); border:1px solid rgba(107,91,115,0.18); box-shadow:0 0.6cqw 1.8cqw rgba(107,91,115,0.14); }
  #cap-text { font-family:${theme.storyStack}; font-weight:600; font-size:1.45cqw; line-height:1.35; color:${theme.ink}; }`;
}

// persistent desk + book + turning leaves + captions.
function chromeHtml(theme, nLeaves) {
  const leaves = Array.from({ length: nLeaves }, (_, i) => `<div class="leaf" id="leaf${i}" style="opacity:0;">${i === 0
    ? `<div class="face f-front" style="background:linear-gradient(120deg,#F3B8B1,#E8938C);"><div style="position:absolute;inset:1.8cqw;border:0.18cqw dashed rgba(255,255,255,0.5);border-radius:0.9cqw;"></div></div><div class="face f-back"></div>`
    : `<div class="face f-front"></div><div class="face f-back"></div>`}</div>`).join("");
  return `
  <div class="clip" data-start="0" data-duration="__D__" data-track-index="0" data-layout-allow-occlusion>
    <div style="position:absolute;inset:0;background:radial-gradient(120% 110% at 50% 45%, transparent 55%, rgba(160,120,95,0.18) 100%);"></div>
    <div class="mote" style="position:absolute;left:14%;top:22%;width:0.5cqw;height:0.5cqw;border-radius:50%;background:rgba(255,255,255,0.8);"></div>
    <div class="mote" style="position:absolute;left:82%;top:18%;width:0.4cqw;height:0.4cqw;border-radius:50%;background:rgba(255,255,255,0.7);"></div>
    <div class="mote" style="position:absolute;left:88%;top:62%;width:0.55cqw;height:0.55cqw;border-radius:50%;background:rgba(255,255,255,0.75);"></div>
    <div class="mote" style="position:absolute;left:8%;top:66%;width:0.38cqw;height:0.38cqw;border-radius:50%;background:rgba(255,255,255,0.7);"></div>
    <div style="position:absolute;left:11cqw;top:9.4cqw;width:78cqw;height:41cqw;border-radius:2cqw;background:rgba(120,85,70,0.28);filter:blur(26px);"></div>
    <div style="position:absolute;left:11.2cqw;top:7cqw;width:77.6cqw;height:42.2cqw;border-radius:1.6cqw;background:linear-gradient(120deg,#E8938C, #D97F82);box-shadow:inset 0 0 0 0.22cqw rgba(255,255,255,0.25);"></div>
    <div style="position:absolute;left:11.9cqw;top:7.35cqw;width:76.2cqw;height:41.5cqw;border-radius:1.3cqw;background:repeating-linear-gradient(180deg,#FDF4E7 0 0.24cqw,#EFE2CF 0.24cqw 0.42cqw);"></div>
    <div style="position:absolute;left:49.7cqw;top:7.6cqw;width:0.6cqw;height:41cqw;background:linear-gradient(90deg,transparent,var(--crease),transparent);z-index:3;"></div>
  </div>
  <div class="clip" data-start="0" data-duration="__D__" data-track-index="15" data-layout-allow-occlusion style="background:none;">
    <div id="flipwrap" style="position:absolute;left:12cqw;top:7.6cqw;width:76cqw;height:41cqw;perspective:2400px;pointer-events:none;">${leaves}</div>
  </div>
  <div id="caps" class="clip" data-start="0" data-duration="__D__" data-track-index="20"><div id="cap-pill"><div id="cap-text"></div></div></div>`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets } = {}) {
  const theme = tealTheme();
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1920, H = (dims && dims.height) || 1080;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length ? sb.scenes.slice(0, 10) : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);

  const images = (Array.isArray(assets) ? assets : []).filter(screenOk).sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const byScene = new Map(); const pool = [];
  for (const a of images) { const sid = a.sceneId != null ? String(a.sceneId) : null; if (sid && !byScene.has(sid)) byScene.set(sid, a); else pool.push(a); }
  let pooli = 0;

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [], sceneScripts = [], sceneStarts = [];
  const N = scenes.length;
  scenes.forEach((scene, i) => {
    const T = r(scriptStart(i));   // contiguous/gapless — page turns anchor exactly to boundaries
    const L = r(scene.duration || 5);
    let arch = archetype(scene, i, N);
    let asset = null;
    const sid = scene.id != null ? String(scene.id) : `s${i + 1}`;
    const ends = arch === "cover" || arch === "end";
    // A screenshot pinned to the cover/end (which never show one) is NOT dropped — it
    // falls back into the pool so a later chapter can show it in the paper cinema.
    if (ends && byScene.has(sid)) { pool.push(byScene.get(sid)); byScene.delete(sid); }
    if (!ends && byScene.has(sid)) { arch = "screen"; asset = byScene.get(sid); }
    else if (!ends && arch === "screen" && pooli < pool.length) { asset = pool[pooli++]; }
    else if (!ends && arch === "chapter" && pooli < pool.length && i >= 2) { arch = "screen"; asset = pool[pooli++]; }
    const tab = TABS[(i - 1 + TABS.length) % TABS.length];
    const ctx = { id: `s${i + 1}`, T, L, E: r(T + L), i, isLast: i === N - 1, track: 2 + i, W, H, theme, tab, tabLabel: `Chapter ${["one", "two", "three", "four", "five", "six", "seven", "eight"][Math.max(0, i - 1)] || i}` };
    // screenSpread takes (scene, ctx, asset); the others take (scene, ctx, opts).
    const built = arch === "screen"
      ? screenSpread(scene, ctx, asset)
      : (BUILDERS[arch] || chapterSpread)(scene, ctx, { asset });
    bodyParts.push(built.html);
    sceneStarts.push(T);
    sceneScripts.push(built.s.join("\n"));
    // boundary hard-kill (all but last)
    if (i < N - 1) sceneScripts.push(`kill("#${ctx.id}",${r(ctx.E + 0.75)});`);
    // page turn INTO the next scene, on leaf(i)
    if (i < N - 1) sceneScripts.push(`pageTurn("#leaf${i}",${r(ctx.E)},0.9);`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const chrome = chromeHtml(theme, Math.max(1, N - 1)).replace(/__D__/g, String(D));

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  var $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s));};
  var r=function(v){return Math.round(v*100)/100;};
  function reps(t,c){return Math.max(0,Math.floor(t/c)-1);}
  function kill(id,t){tl.set(id,{opacity:0},t);}

  /* ===== self-made helpers (deterministic) ===== */
  function pageTurn(sel,at,dur){var d=dur||0.85;
    tl.set(sel,{opacity:1,rotationY:0},r(at-0.01));
    tl.fromTo(sel,{rotationY:0},{rotationY:-178,duration:d,ease:"power2.inOut"},at);
    tl.fromTo(sel,{filter:"brightness(1)"},{filter:"brightness(0.86)",duration:d/2,yoyo:true,repeat:1,ease:"sine.inOut"},at);
    tl.set(sel,{opacity:0},r(at+d+0.02));}
  function popUp(popSel,shSel,at,dur){var d=dur||0.9;
    tl.fromTo(popSel,{rotationX:-88,transformPerspective:1300},{rotationX:0,duration:d,ease:"back.out(1.35)"},at);
    tl.fromTo(shSel,{opacity:0,scaleX:0.4},{opacity:1,scaleX:1,duration:d*0.8,ease:"power2.out"},at);}
  function penWrite(clipSel,penSel,at,dur,w){var d=dur||1.6;
    tl.fromTo(clipSel,{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0% 0 0)",duration:d,ease:"none"},at);
    tl.fromTo(penSel,{opacity:0},{opacity:1,duration:0.15},at);
    tl.fromTo(penSel,{x:0},{x:w,duration:d,ease:"none"},at);
    tl.to(penSel,{y:-3,duration:d/8,yoyo:true,repeat:7,ease:"sine.inOut"},at);
    tl.to(penSel,{opacity:0,y:-12,duration:0.3,ease:"power2.in"},r(at+d+0.05));}
  function blink(sel,at){tl.fromTo(sel,{scaleY:1},{scaleY:0.12,duration:0.08,yoyo:true,repeat:1,ease:"none",transformOrigin:"50% 50%"},at);}

  /* ambient dust */
  tl.to(".mote",{y:-26,x:10,duration:6,ease:"sine.inOut",yoyo:true,repeat:reps(D,6),stagger:0.9},0);

  /* ===== scenes ===== */
  ${sceneScripts.join("\n  ")}

  /* ===== captions — one proxy, seek-safe ===== */
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
