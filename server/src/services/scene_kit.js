// DETERMINISTIC SCENE-KIT — builds a complete, lint-valid, showcase-grade
// HyperFrames composition from a storyboard WITHOUT asking the LLM to freehand
// layout/motion. The kit OWNS structure + motion (guaranteed by code, so the
// budget model can never produce an overlapping/truncated mess); the PACK owns
// STYLE (colors/fonts/atoms, re-skinned per pack — flat packs get NO gradients);
// the AGENTS own CONTENT (copy, archetype choice, asset/screenshot selection,
// carried on the storyboard). This is the codification of the two hand-authored
// reference films (flagship, amazon-premium) into reusable, parameterized scenes.
//
// Entry: buildComposition({ storyboard, dims, framePack, assets, captionCues, seedKey })
//        -> { indexHtml, metaJson }   (the same envelope the LLM composer returns)
//        seedKey (usually the jobId) salts the variety seed so two jobs with the
//        same title still get different layouts/backgrounds.
//
// NOTE: this is the FOUNDATION (helpers + theme + background + hook/stat/cta +
// generic text). Screenshot-hero, split-diagram, asset-grid, terminal, and the
// full per-pack skinning table are filled in from the scenekit-design pass.

const frameRegistry = require("./frame_registry");
const { themeFromTokens } = require("./enrich");

// SINGLE-quoted family names — these are embedded in double-quoted style="..."
// attributes, so a double quote here would terminate the attribute early and kill
// every font-size/color after it (CSS accepts single quotes for family names).
const SAFE_FONTS = "Inter, 'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif";

// Packs that are FLAT by design (no gradients / glows — solid color + hard edges).
// The scenekit-design pass produces the authoritative per-pack table; this is a
// safe default so the kit never paints gradients onto a neo-brutalist/print pack.
const FLAT_PACKS = new Set([
  "blockframe", "bauhaus-print", "biennale-yellow", "kinetic-bold", "noir-spotlight",
]);

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
// Deterministic per-video seed (from the jobId + title) — drives layout/motion
// VARIANT choices so two different videos never render the identical template,
// while a single video stays stable (re-renders are identical). FNV-1a.
function hashSeed(s) {
  let h = 2166136261; const str = String(s || "");
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function lum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return 128;
  const n = parseInt(m[1], 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}

// Derive the scene THEME from the chosen pack (authoritative) or, when no pack is
// bound, the storyboard's own palette. Returns the knobs every archetype re-skins.
function deriveTheme(framePack, storyboard) {
  const tokens = framePack && framePack !== "auto" ? frameRegistry.getPackTokens(framePack) : null;
  const pal = (storyboard && storyboard.palette) || {};
  let ground, ink, accents, fonts;

  if (tokens) {
    const t = themeFromTokens(tokens);
    const colorVals = Object.values(tokens.colors || {});
    const flat = FLAT_PACKS.has(framePack);
    // Flat packs sit on their lightest/offwhite (or black) ground; cinematic packs
    // on their darkest. Pick ground by the pack's character.
    ground = flat ? (t.lightBase || "#FFFDF5") : (t.darkBase || "#0B1020");
    ink = lum(ground) > 140 ? "#15140F" : "#F6F4EE";
    accents = (t.accents && t.accents.length ? t.accents : colorVals).slice(0, 4);
    fonts = (tokens.fonts && tokens.fonts.length) ? tokens.fonts : ["Inter"];
  } else {
    ground = pal.background && /^#/.test(pal.background) ? pal.background : "#0B1020";
    ink = pal.text || (lum(ground) > 140 ? "#15140F" : "#F6F4EE");
    accents = [pal.accent, pal.primary].filter(Boolean);
    if (!accents.length) accents = ["#7CC4FF", "#FF7DB4", "#FFC878"];
    fonts = [(storyboard && storyboard.fontFamily) || "Inter"];
  }
  const isDark = lum(ground) < 140;
  const flat = framePack && FLAT_PACKS.has(framePack);
  // Drop any "accent" whose luminance sits too close to the ground (packs often
  // include a near-black/near-white base among their tokens) — otherwise an accent
  // word or gradient fades into the background. Backfill with safe brights so we
  // always have ≥2 visible accents.
  const safeBright = isDark ? ["#7CC4FF", "#FF7DB4", "#FFC878", "#8BE0A4"] : ["#3B5BFF", "#E2563C", "#1E9E5A", "#C9A227"];
  accents = accents.filter((a) => Math.abs(lum(a) - lum(ground)) > 55);
  for (const c of safeBright) { if (accents.length >= 2) break; if (!accents.includes(c)) accents.push(c); }
  accents = accents.slice(0, 4);
  // Force maximum text contrast against the ground (the storyboard's text hex is
  // often a mid-tone that reads as muddy).
  ink = isDark ? "#FFFFFF" : "#14130E";
  // Only fonts the offline renderer can auto-resolve may appear in CSS — a pack's
  // display font (e.g. "Space Grotesk") would fall back anyway and trips lint, so
  // (matching the composer's normalize) we render on the safe stack and express
  // the pack's type identity through weight / case / tracking instead.
  const RESOLVABLE = new Set(["inter", "roboto", "arial", "helvetica", "georgia", "system-ui"]);
  const lead = fonts.filter((f) => RESOLVABLE.has(String(f).toLowerCase().trim()));
  return {
    ground, ink, accents,
    accent: accents[0],
    accent2: accents[1] || accents[0],
    fontStack: lead.length ? `${lead.map((f) => `'${f}'`).join(", ")}, ${SAFE_FONTS}` : SAFE_FONTS,
    isDark,
    gradients: !flat,          // flat packs: solid fills + hard borders only
    dim: isDark ? "rgba(255,255,255,0.62)" : "rgba(20,18,12,0.62)",
    line: isDark ? "rgba(255,255,255,0.14)" : "rgba(20,18,12,0.14)",
    panel: isDark ? "rgba(255,255,255,0.05)" : "rgba(20,18,12,0.04)",
  };
}

// The GSAP helper functions — emitted ONCE. They mechanically satisfy the five
// most error-prone lint rules (camera, word-stagger, counter, exit-kill, finite
// repeats) so every archetype stays clean with almost no per-scene code.
function emitHelpers(D) {
  return [
    `var tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });`,
    `var D = ${D};`,
    `function reps(c){ return Math.max(0, Math.floor(D/c)-1); }`,
    `function sreps(span,c){ return Math.max(0, Math.floor(span/c)-1); }`,
    `function wordsIn(sel,at,stg){ tl.fromTo(sel,{yPercent:80,opacity:0,filter:"blur(8px)"},{yPercent:0,opacity:1,filter:"blur(0px)",duration:0.62,stagger:stg||0.08,ease:"power3.out"},at); }`,
    `function pushIn(sel,at,dur,from,to){ tl.fromTo(sel,{scale:from},{scale:to,duration:dur,ease:"none"},at); }`,
    `function countUp(id,to,at,dur,fmt){ var o={v:0}; tl.to(o,{v:to,duration:dur,ease:"power2.out",snap:{v:1},onUpdate:function(){var el=document.getElementById(id);if(el)el.textContent=fmt(Math.round(o.v));}},at); }`,
    `function exitScene(sel,at,end){ tl.to(sel,{opacity:0,duration:0.3,ease:"power2.in"},at); tl.set(sel,{opacity:0},end); }`,
  ].join("\n");
}

// Background depth stack — persistent, tracks 0–3, full duration, never exits.
// CANVAS FX — the living backdrop. One HTML5 canvas inside the ground clip,
// painted as a PURE function of the renderer's hf-seek time (deterministic:
// re-rendering the same job is byte-identical; seeking is exact). The CSS
// ground stays behind it as the fail-safe, so a canvas hiccup can never black
// the frame. Effects are art-directed per pack family and colored only with
// theme tokens, kept low-alpha so content always owns the frame.
function fxModeFor(framePack, theme) {
  const p = String(framePack || "");
  if (/vapor/.test(p)) return "grid";        // synthwave horizon grid pulse
  if (/noir/.test(p)) return "rays";         // rotating spotlight wedge + dust
  if (/midnight|aurora/.test(p)) return "flow"; // orbiting gradient blobs
  if (!theme.gradients) return "confetti";   // flat packs: hard shapes, no blur
  return "bokeh";                            // bloom/mono/default: soft drift
}

function buildCanvasFx(theme, dims, D, seed, framePack) {
  const W = dims.width, H = dims.height;
  const mode = fxModeFor(framePack, theme);
  const A = rgba(theme.accent, 1).replace(",1)", ",%A%)");
  const B = rgba(theme.accent2 || theme.accent, 1).replace(",1)", ",%A%)");
  const I = rgba(theme.ink, 1).replace(",1)", ",%A%)");
  const col = (tpl, a) => tpl.replace("%A%", a);
  const html = `<canvas id="kffx" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;"></canvas>`;

  // Mode-specific painter body — everything derives from t and the seeded set.
  let init = "", paint = "";
  if (mode === "flow") {
    init = `var BL=[];for(var i=0;i<3;i++)BL.push({ph:rnd()*6.28,sp:.06+rnd()*.05,rx:W*(.22+rnd()*.18),ry:H*(.3+rnd()*.2),r:H*(.45+rnd()*.25)});var BC=[${JSON.stringify(col(A, ".16"))},${JSON.stringify(col(B, ".13"))},${JSON.stringify(col(A, ".09"))}];`;
    paint = `for(var i=0;i<BL.length;i++){var b=BL[i],x=W*.5+Math.cos(t*b.sp+b.ph)*b.rx,y=H*.45+Math.sin(t*b.sp*.8+b.ph)*b.ry;var g=cx.createRadialGradient(x,y,0,x,y,b.r);g.addColorStop(0,BC[i]);g.addColorStop(1,"rgba(0,0,0,0)");cx.fillStyle=g;cx.fillRect(0,0,W,H);}`;
  } else if (mode === "grid") {
    init = `var HZ=H*.62,VP=W*.5,NL=9,NV=13,GA=${JSON.stringify(col(A, ".22"))},GB=${JSON.stringify(col(B, ".30"))};`;
    paint =
      `cx.strokeStyle=GA;cx.lineWidth=1.5;` +
      `for(var v=0;v<=NV;v++){var fx=(v/NV-.5)*W*3;cx.beginPath();cx.moveTo(VP,HZ);cx.lineTo(VP+fx,H);cx.stroke();}` +
      `var sp=(H-HZ)/NL;for(var l=0;l<NL;l++){var off=(t*22)%sp,yy=HZ+l*sp+off;if(yy>H)continue;var k=(yy-HZ)/(H-HZ);cx.globalAlpha=.12+k*.3;cx.beginPath();cx.moveTo(0,yy);cx.lineTo(W,yy);cx.stroke();}cx.globalAlpha=1;` +
      `var hg=cx.createLinearGradient(0,HZ-H*.06,0,HZ+H*.02);hg.addColorStop(0,"rgba(0,0,0,0)");hg.addColorStop(.7,GB);hg.addColorStop(1,"rgba(0,0,0,0)");cx.fillStyle=hg;cx.fillRect(0,HZ-H*.06,W,H*.08);`;
  } else if (mode === "rays") {
    init = `var RA=${JSON.stringify(col(A, ".14"))},DUST=[];for(var i=0;i<26;i++)DUST.push({x:rnd()*W,y:rnd()*H,r:.8+rnd()*2.2,s:.15+rnd()*.5,p:rnd()*6.28});`;
    paint =
      `cx.save();cx.translate(W*.68,-H*.15);cx.rotate(-.5+Math.sin(t*.12)*.22);` +
      `var rg=cx.createLinearGradient(0,0,0,H*1.5);rg.addColorStop(0,RA);rg.addColorStop(1,"rgba(0,0,0,0)");cx.fillStyle=rg;` +
      `cx.beginPath();cx.moveTo(0,0);cx.lineTo(-W*.22,H*1.5);cx.lineTo(W*.22,H*1.5);cx.closePath();cx.fill();cx.restore();` +
      `cx.fillStyle=${JSON.stringify(col(A, ".5"))};for(var i=0;i<DUST.length;i++){var d=DUST[i],y=(d.y-t*9*d.s%H+H)%H,x=d.x+Math.sin(t*d.s+d.p)*14;cx.globalAlpha=.10+.12*Math.abs(Math.sin(t*.8+d.p));cx.beginPath();cx.arc(x,y,d.r,0,6.283);cx.fill();}cx.globalAlpha=1;`;
  } else if (mode === "confetti") {
    init = `var CF=[],CC=[${JSON.stringify(col(A, ".55"))},${JSON.stringify(col(B, ".5"))},${JSON.stringify(col(I, ".35"))}];for(var i=0;i<22;i++)CF.push({x:rnd()*W,y:rnd()*H,s:5+rnd()*9,w:.4+rnd()*.9,sp:12+rnd()*22,p:rnd()*6.28,c:i%3});`;
    paint = `for(var i=0;i<CF.length;i++){var f=CF[i],y=(f.y+t*f.sp)%(H+40)-20,x=f.x+Math.sin(t*.5+f.p)*18;cx.save();cx.translate(x,y);cx.rotate(t*f.w+f.p);cx.fillStyle=CC[f.c];cx.fillRect(-f.s/2,-f.s/2,f.s,f.s);cx.restore();}`;
  } else { // bokeh
    init = `var BK=[],KC=[${JSON.stringify(col(A, ".3"))},${JSON.stringify(col(B, ".24"))}];for(var i=0;i<24;i++)BK.push({x:rnd()*W,y:rnd()*H,r:5+rnd()*22,s:.2+rnd()*.7,p:rnd()*6.28,c:i%2});`;
    paint = `for(var i=0;i<BK.length;i++){var b=BK[i],y=(b.y-t*7*b.s%H+H)%H,x=b.x+Math.sin(t*b.s*.7+b.p)*22;var g=cx.createRadialGradient(x,y,0,x,y,b.r);g.addColorStop(0,KC[b.c]);g.addColorStop(1,"rgba(0,0,0,0)");cx.globalAlpha=.5+.5*Math.sin(t*.9+b.p)*.4;cx.fillStyle=g;cx.beginPath();cx.arc(x,y,b.r,0,6.283);cx.fill();}cx.globalAlpha=1;`;
  }

  const script =
    `(function(){var cv=document.getElementById("kffx");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;` +
    `var W=${W},H=${H};var sd=${(seed >>> 0) || 7};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}` +
    init +
    `function kffxDraw(t){cx.clearRect(0,0,W,H);${paint}}` +
    `window.addEventListener("hf-seek",function(e){kffxDraw((e.detail&&e.detail.time)||0);});kffxDraw(0);})();`;

  return { html, script, mode };
}

// Gradient/glow for cinematic packs; solid ground + an authored particle field +
// (for flat packs) a hard-edged dot or rule motif instead of blurred gradients.
function buildBackground(theme, dims, D, seed = 0, framePack = null) {
  const { ground, accent, accent2, gradients } = theme;
  const W = dims.width, H = dims.height;
  const groundCss = gradients
    ? `background:radial-gradient(120% 95% at 50% -8%, ${mix(ground, "#ffffff", theme.isDark ? 0.10 : 0.04)}, ${ground} 55%, ${mix(ground, "#000000", theme.isDark ? 0.35 : 0.06)});`
    : `background:${ground};`;
  const parts = [];
  // The canvas FX painter lives INSIDE the ground clip: CSS ground behind it is
  // the fail-safe, and no extra track index is consumed.
  const fx = buildCanvasFx(theme, dims, D, seed, framePack);
  parts.push(`<div class="clip" data-start="0" data-duration="${D}" data-track-index="0" style="${groundCss}">${fx.html}</div>`);

  // glow layer — ONLY for gradient packs (flat packs stay flat). Blob positions
  // vary per video (seed) so the depth reads differently each time.
  if (gradients) {
    const gx1 = 14 + (seed % 26), gy1 = 20 + ((seed >> 3) % 24);
    const gx2 = 60 + ((seed >> 6) % 28), gy2 = 56 + ((seed >> 9) % 28);
    parts.push(`<div id="kfbgGlow" class="clip" data-start="0" data-duration="${D}" data-track-index="1" data-layout-allow-occlusion style="background:radial-gradient(38% 46% at ${gx1}% ${gy1}%, ${rgba(accent, 0.20)}, transparent 70%), radial-gradient(34% 42% at ${gx2}% ${gy2}%, ${rgba(accent2, 0.14)}, transparent 72%); filter:blur(8px);"></div>`);
  }

  // ambient particle field (authored — drifts on a finite-repeat tween). The
  // seed offsets the distribution so no two videos share the same star pattern.
  const N = 12;
  const sx = seed % 100, sy = (seed >> 4) % 100;
  const circ = [];
  for (let i = 0; i < N; i++) {
    const cx = Math.round(((i * 97 + 60 + sx) % 100) / 100 * W);
    const cy = Math.round(((i * 53 + 40 + sy) % 100) / 100 * H);
    const r = 2 + (i % 4);
    const col = [accent, accent2, theme.ink][i % 3];
    const op = (0.28 + (i % 5) * 0.05).toFixed(2);
    circ.push(`<circle class="kfp${i}" cx="${cx}" cy="${cy}" r="${r}" fill="${col}" opacity="${op}"/>`);
  }
  parts.push(`<div class="clip" data-start="0" data-duration="${D}" data-track-index="2" data-layout-allow-occlusion><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;">${circ.join("")}</svg></div>`);

  // grid / rule motif (masked for gradient packs; faint solid for flat packs)
  const gridCol = rgba(theme.ink, gradients ? 0.04 : 0.06);
  const mask = gradients ? "-webkit-mask-image:radial-gradient(80% 80% at 50% 45%,#000 35%,transparent 90%);mask-image:radial-gradient(80% 80% at 50% 45%,#000 35%,transparent 90%);" : "";
  parts.push(`<div class="clip" data-start="0" data-duration="${D}" data-track-index="3" data-layout-allow-occlusion style="background-image:linear-gradient(${gridCol} 1px,transparent 1px),linear-gradient(90deg,${gridCol} 1px,transparent 1px);background-size:46px 46px;${mask}"></div>`);

  const script = [];
  if (gradients) script.push(`tl.fromTo("#kfbgGlow",{xPercent:-4,yPercent:-3,scale:1},{xPercent:4,yPercent:3,scale:1.07,duration:10,ease:"sine.inOut",yoyo:true,repeat:reps(10)},0);`);
  script.push(`for(var i=0;i<${N};i++){var pd=7+(i%5);tl.to(".kfp"+i,{attr:{cy:"-="+(40+(i%4)*18)},x:(i%2?12:-12),duration:pd,ease:"sine.inOut",yoyo:true,repeat:reps(pd)},0);}`);
  script.push(fx.script);
  return { html: parts.join("\n  "), script: script.join("\n"), fxMode: fx.mode };
}

// ---- color utils -------------------------------------------------------------
function hexToRgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim()); if (!m) return [124, 124, 124]; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function mix(hex, with_, t) { const a = hexToRgb(hex), b = hexToRgb(with_); const c = a.map((v, i) => Math.round(v + (b[i] - v) * t)); return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`; }

// ---- archetypes --------------------------------------------------------------
// Each archetype is a pure function: (scene, ctx) -> { html, script } where the
// scene clip(s) live on ctx.track..ctx.track+K and animate within [T, T+L].
// They re-skin from ctx.theme; structure + motion are fixed.

// split a headline into <span class="kfw"> words, marking the emphasis word(s) as
// the single gradient/accent word.
function headlineSpans(headline, emphasis, theme) {
  const words = String(headline || "").trim().split(/\s+/).filter(Boolean);
  const emph = String(emphasis || "").trim().toLowerCase();
  return words.map((w) => {
    const isEmph = emph && emph.split(/\s+/).includes(w.toLowerCase().replace(/[.,!?]/g, ""));
    const cls = isEmph ? "kfw kfacc" : "kfw";
    return `<span class="${cls}">${esc(w)}</span>`;
  }).join(" ");
}

function archHook(scene, ctx) {
  const { theme, id, T, L, track, dims } = ctx;
  const accentText = theme.gradients
    ? `background:linear-gradient(100deg,${theme.accent},${theme.accent2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${theme.accent};`
    : `color:${theme.accent};`;
  const big = dims.width >= dims.height ? 92 : 66;
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  <div style="position:absolute;left:7%;right:7%;top:50%;transform:translateY(-50%);">
    <span id="${id}k" style="opacity:0;display:inline-flex;align-items:center;gap:10px;padding:8px 16px;border-radius:9999px;background:${theme.panel};border:1px solid ${theme.line};color:${theme.accent};font:700 15px/1 ${cssFont(theme)};letter-spacing:.2em;text-transform:uppercase;"><span style="width:8px;height:8px;border-radius:50%;background:${theme.accent};"></span>${esc(ctx.kicker || "KEYFRAME")}</span>
    <h1 style="margin-top:18px;font:800 ${big}px/0.99 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};max-width:14ch;"><style>#${id} .kfacc{${accentText}}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h1>
    ${scene.subtext ? `<p id="${id}s" style="opacity:0;margin-top:16px;font:500 ${Math.round(big * 0.3)}px/1.45 ${cssFont(theme)};color:${theme.dim};max-width:42ch;">${esc(scene.subtext)}</p>` : ""}
  </div>
  <svg viewBox="0 0 ${dims.width} ${dims.height}" style="position:absolute;inset:0;pointer-events:none;" data-layout-allow-occlusion><line id="${id}u" x1="${Math.round(dims.width * 0.07)}" y1="${Math.round(dims.height * 0.66)}" x2="${Math.round(dims.width * 0.34)}" y2="${Math.round(dims.height * 0.66)}" stroke="${theme.accent}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${Math.round(dims.width * 0.27)}" stroke-dashoffset="${Math.round(dims.width * 0.27)}"/></svg>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `tl.fromTo("#${id}k",{opacity:0,y:14},{opacity:1,y:0,duration:0.5},${r(T + 0.25)});`,
    `wordsIn("#${id} .kfw",${r(T + 0.45)},0.09);`,
    scene.subtext ? `tl.fromTo("#${id}s",{opacity:0,y:20},{opacity:1,y:0,duration:0.55},${r(T + 1.05)});` : "",
    `tl.to("#${id}u",{strokeDashoffset:0,duration:0.7,ease:"power2.inOut"},${r(T + 1.1)});`,
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

function archStat(scene, ctx) {
  const { theme, id, T, L, track, dims } = ctx;
  // derive a number from the headline/emphasis, else a default
  const num = pickNumber(scene) || { value: 95, suffix: "%" };
  const big = dims.width >= dims.height ? 128 : 92;
  const cardBg = theme.gradients ? `linear-gradient(180deg,${mix(theme.ground, "#ffffff", theme.isDark ? 0.07 : 0.02)},${theme.ground})` : mix(theme.ground, theme.isDark ? "#ffffff" : "#000000", 0.03);
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;display:flex;align-items:center;justify-content:center;">
  <div class="kfstage" style="display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;padding:0 8%;width:100%;">
    <div id="${id}n" style="font:800 ${big}px/1 ${cssFont(theme)};letter-spacing:-0.04em;color:${theme.accent};">0${esc(num.suffix || "")}</div>
    <div style="font:700 ${Math.round(big * 0.26)}px/1.15 ${cssFont(theme)};color:${theme.ink};max-width:18ch;"><style>#${id} .kfacc{color:${theme.accent2};}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</div>
    ${scene.subtext ? `<div id="${id}s" style="opacity:0;font:500 ${Math.round(big * 0.18)}px/1.4 ${cssFont(theme)};color:${theme.dim};max-width:40ch;">${esc(scene.subtext)}</div>` : ""}
  </div>
</div>`;
  const fmt = num.suffix === "%" ? `function(v){return v+"%";}` : (num.prefix ? `function(v){return ${JSON.stringify(num.prefix)}+v.toLocaleString();}` : `function(v){return v.toLocaleString()+${JSON.stringify(num.suffix || "")};}`);
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `pushIn("#${id} .kfstage",${T},${r(L - 0.4)},1.0,1.04);`,
    `countUp("${id}n",${num.value},${r(T + 0.3)},${r(Math.min(1.6, L - 1))},${fmt});`,
    `wordsIn("#${id} .kfw",${r(T + 0.45)},0.07);`,
    scene.subtext ? `tl.fromTo("#${id}s",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},${r(T + 0.9)});` : "",
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

function archCta(scene, ctx) {
  const { theme, id, T, L, track, dims } = ctx;
  const big = dims.width >= dims.height ? 78 : 60;
  const btnBg = theme.gradients ? `linear-gradient(180deg,${theme.accent2 || theme.accent},${theme.accent})` : theme.accent;
  const btnInk = lum(theme.accent) > 150 ? "#15140F" : "#FFFFFF";
  const accentText = theme.gradients ? `background:linear-gradient(100deg,${theme.accent},${theme.accent2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${theme.accent};` : `color:${theme.accent};`;
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  ${theme.gradients ? `<div id="${id}g" class="clip" data-layout-allow-occlusion style="position:absolute;left:50%;top:46%;width:46%;height:60%;transform:translate(-50%,-50%);border-radius:50%;filter:blur(54px);background:radial-gradient(circle,${rgba(theme.accent, 0.30)},transparent 66%);"></div>` : ""}
  <div style="position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:24px;text-align:center;padding:0 8%;">
    <h2 style="font:800 ${big}px/1.02 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};max-width:16ch;"><style>#${id} .kfacc{${accentText}}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
    ${scene.subtext ? `<div id="${id}b" style="opacity:0;display:inline-flex;align-items:center;gap:11px;padding:16px 36px;border-radius:9999px;background:${btnBg};color:${btnInk};font:800 ${Math.round(big * 0.34)}px/1 ${cssFont(theme)};">${esc(scene.subtext)} <span style="width:11px;height:11px;border-right:3px solid ${btnInk};border-top:3px solid ${btnInk};transform:rotate(45deg);display:inline-block;"></span></div>` : ""}
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    theme.gradients ? `tl.fromTo("#${id}g",{opacity:0,scale:0.85},{opacity:1,scale:1,duration:0.8},${r(T + 0.05)});` : "",
    `wordsIn("#${id} .kfw",${r(T + 0.25)},0.08);`,
    scene.subtext ? `tl.fromTo("#${id}b",{opacity:0,scale:0.85,y:16},{opacity:1,scale:1,y:0,duration:0.6,ease:"back.out(1.7)"},${r(T + 0.9)});` : "",
    scene.subtext ? `tl.to("#${id}b",{scale:1.04,duration:0.8,ease:"sine.inOut",yoyo:true,repeat:sreps(${r(L - 1)},1.6)},${r(T + 1.5)});` : "",
    // last scene: NO exit (holds to D)
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// Generic text scene (bullet/quote/caption/shape-motion) — kicker + headline +
// sub, with a side accent rule. A safe, dense default until per-kind archetypes
// (asset-grid, split-diagram, terminal) are added from the design pass.
function archText(scene, ctx) {
  const { theme, id, T, L, track, dims, variant } = ctx;
  const big = dims.width >= dims.height ? 68 : 52;
  const accentText = theme.gradients ? `background:linear-gradient(100deg,${theme.accent},${theme.accent2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${theme.accent};` : `color:${theme.accent};`;
  const bullets = Array.isArray(scene.bullets) ? scene.bullets.filter(Boolean).slice(0, 3) : [];
  // Four layout variants so text scenes don't all look identical:
  //   v0 = left-aligned with a short top rule (the original)
  //   v1 = centered with an underline that draws in beneath the headline
  //   v2 = left-aligned with a tall accent bar running down the left edge
  //   v3 = right-aligned mirror with a right accent bar (top rule hugs the right)
  const v = variant || 0;
  const centered = v === 1;
  const right = v === 3;
  const wrap = centered
    ? `position:absolute;left:8%;right:8%;top:50%;transform:translateY(-50%);text-align:center;`
    : right
      ? `position:absolute;left:7%;right:9%;top:50%;transform:translateY(-50%);text-align:right;`
      : `position:absolute;left:${v === 2 ? "9%" : "7%"};right:7%;top:50%;transform:translateY(-50%);`;
  const topRule = v === 0
    ? `<div style="width:54px;height:5px;border-radius:3px;background:${theme.accent};margin-bottom:22px;"></div>`
    : right
      ? `<div style="width:54px;height:5px;border-radius:3px;background:${theme.accent};margin:0 0 22px auto;"></div>`
      : "";
  const sideBar = v === 2
    ? `<div data-layout-allow-occlusion style="position:absolute;left:0;top:22%;bottom:22%;width:8px;border-radius:0 6px 6px 0;background:${theme.accent};"></div>`
    : right
      ? `<div data-layout-allow-occlusion style="position:absolute;right:0;top:22%;bottom:22%;width:8px;border-radius:6px 0 0 6px;background:${theme.accent};"></div>`
      : "";
  const underline = centered ? `<div id="${id}u" style="height:5px;width:120px;margin:18px auto 0;border-radius:3px;background:${theme.accent};transform:scaleX(0);transform-origin:center;"></div>` : "";
  const subCenter = centered ? "margin-left:auto;margin-right:auto;" : right ? "margin-left:auto;" : "";
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  ${sideBar}
  <div style="${wrap}">
    ${topRule}
    <h2 style="font:800 ${big}px/1.05 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};max-width:${centered ? "22ch" : "20ch"};${right ? "margin-left:auto;" : ""}"><style>#${id} .kfacc{${accentText}}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
    ${underline}
    ${scene.subtext ? `<p id="${id}s" style="opacity:0;margin-top:14px;font:500 ${Math.round(big * 0.36)}px/1.45 ${cssFont(theme)};color:${theme.dim};max-width:44ch;${subCenter}">${esc(scene.subtext)}</p>` : ""}
    ${bullets.length ? `<div id="${id}bl" style="margin-top:20px;display:flex;flex-direction:column;gap:10px;${centered ? "align-items:center;" : right ? "align-items:flex-end;" : ""}">${bullets.map((b) => `<div class="kfbl" style="opacity:0;display:flex;align-items:center;gap:12px;font:600 ${Math.round(big * 0.3)}px/1.2 ${cssFont(theme)};color:${theme.ink};"><span style="width:9px;height:9px;border-radius:2px;background:${theme.accent};"></span>${esc(b)}</div>`).join("")}</div>` : ""}
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `wordsIn("#${id} .kfw",${r(T + 0.3)},0.07);`,
    underline ? `tl.to("#${id}u",{scaleX:1,duration:0.6,ease:"power2.inOut"},${r(T + 0.78)});` : "",
    scene.subtext ? `tl.fromTo("#${id}s",{opacity:0,y:18},{opacity:1,y:0,duration:0.5},${r(T + 0.85)});` : "",
    bullets.length ? `tl.fromTo("#${id} .kfbl",{opacity:0,x:${right ? 18 : -18}},{opacity:1,x:0,duration:0.45,stagger:0.12,ease:"power2.out"},${r(T + 1.0)});` : "",
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// Partition the fetched assets into the kinds the kit places differently:
// website screenshots (device-framed hero), vectors/illustrations (drawn-in side
// art or grids), and photos (scrimmed full-bleed). Paths are relative to jobDir.
function partitionAssets(assets) {
  const screenshots = [], vectors = [], photos = [], videos = [];
  for (const a of (assets || [])) {
    if (!a || !a.path) continue;
    // Videos go in their own pool — the img-based archetypes would render an mp4
    // as a broken <img>. They're placed as full-bleed <video> backgrounds instead.
    if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) { videos.push(a); continue; }
    const s = `${a.source || ""} ${a.style || ""} ${a.alt || ""}`.toLowerCase();
    if (a.source === "website" || /screenshot|webpage|web page|landing|\bsite\b/.test(s)) screenshots.push(a);
    else if (/\.svg($|\?)/i.test(a.path) || /vector|illustration|icon|line.?art|graphic/.test(s)) vectors.push(a);
    else photos.push(a);
  }
  return { screenshots, vectors, photos, videos };
}

// SCREENSHOT-HERO — the user's real website screenshot in a per-pack device frame
// (rounded glass chrome for cinematic packs; a hard-bordered card with an offset
// solid shadow for flat packs), with side copy and a slow Ken-Burns scroll inside
// the frame (the reactive beat). Landscape = side-by-side; portrait = stacked.
function archScreenshotHero(scene, ctx) {
  const { theme, id, T, L, track, dims, asset } = ctx;
  const land = dims.width >= dims.height;
  const flat = !theme.gradients;
  const chrome = flat
    ? `background:${theme.ground};border:3px solid ${theme.ink};border-radius:14px;box-shadow:10px 10px 0 ${theme.accent};`
    : `background:${mix(theme.ground, "#ffffff", 0.06)};border:1px solid ${theme.line};border-radius:16px;box-shadow:0 40px 90px rgba(0,0,0,0.5);`;
  const barBg = flat ? mix(theme.ground, theme.ink, 0.06) : rgba("#ffffff", 0.05);
  const big = land ? 56 : 46;
  const accentText = theme.gradients ? `background:linear-gradient(100deg,${theme.accent},${theme.accent2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${theme.accent};` : `color:${theme.accent};`;
  const dots = ["#FF5F57", "#FEBC2E", "#28C840"].map((c) => `<span style="width:11px;height:11px;border-radius:50%;background:${flat ? theme.ink : c};display:inline-block;"></span>`).join("");
  const frameW = land ? "52%" : "84%";
  // The OUTER wrapper owns positioning/centering; the INNER #fr owns the GSAP
  // entrance (opacity/yPercent/rotationX). They MUST be separate elements: GSAP
  // rewrites the whole `transform` of whatever it animates, so animating yPercent
  // on an element that also carries `translateY(-50%)` clobbers the -50% and drops
  // the frame into the lower half (bottom gets clipped). Keep centering off #fr.
  // Center with a FULL-HEIGHT flex box (top:0;bottom:0;justify-content:center)
  // instead of translateY(-50%): flex centering is layout-based, so the GSAP
  // entrance transform on the inner #fr can't clobber it and drop the frame low
  // (the old bug where the screenshot's bottom clipped off the canvas).
  const frameOuter = land
    ? `position:absolute;left:5%;top:0;bottom:0;width:${frameW};display:flex;flex-direction:column;justify-content:center;`
    : `position:absolute;left:8%;right:8%;top:0;bottom:0;width:84%;display:flex;flex-direction:column;justify-content:center;`;
  const copyWrap = land
    ? `position:absolute;right:5%;top:0;bottom:0;width:34%;display:flex;flex-direction:column;justify-content:center;`
    : `position:absolute;left:8%;right:8%;top:0;bottom:0;width:84%;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:8%;text-align:center;`;
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  <div style="${frameOuter}">
  <div id="${id}fr" class="kfstage" style="${chrome}overflow:hidden;width:100%;">
    <div style="height:42px;display:flex;align-items:center;gap:9px;padding:0 16px;background:${barBg};border-bottom:1px solid ${theme.line};">${dots}<span style="margin-left:12px;flex:1;max-width:340px;height:22px;border-radius:9999px;background:${rgba(theme.ink, 0.08)};"></span></div>
    <div style="position:relative;width:100%;height:${land ? Math.round(dims.height * 0.52) : Math.round(dims.height * 0.40)}px;overflow:hidden;"><img id="${id}img" src="${esc(asset.path)}" alt="${esc(asset.alt || "screenshot")}" style="position:absolute;top:0;left:0;width:100%;height:auto;min-height:100%;object-fit:cover;object-position:top center;"></div>
  </div>
  </div>
  <div style="${copyWrap}">
    <span id="${id}k" style="opacity:0;display:inline-flex;align-items:center;gap:9px;padding:7px 15px;border-radius:9999px;background:${theme.panel};border:1px solid ${theme.line};color:${theme.accent};font:700 13px/1 ${cssFont(theme)};letter-spacing:.2em;text-transform:uppercase;"><span style="width:7px;height:7px;border-radius:50%;background:${theme.accent};"></span>${esc(ctx.kicker || "Live")}</span>
    <h2 style="margin-top:14px;font:800 ${big}px/1.05 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};"><style>#${id} .kfacc{${accentText}}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
    ${scene.subtext ? `<p id="${id}s" style="opacity:0;margin-top:13px;font:500 ${Math.round(big * 0.42)}px/1.45 ${cssFont(theme)};color:${theme.dim};">${esc(scene.subtext)}</p>` : ""}
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `tl.fromTo("#${id}fr",{opacity:0,yPercent:6,rotationX:12,transformPerspective:1200,transformOrigin:"50% 100%"},{opacity:1,yPercent:0,rotationX:0,duration:0.85,ease:"expo.out"},${r(T + 0.1)});`,
    `tl.fromTo("#${id}img",{y:0},{y:function(i,el){var h=el.scrollHeight-el.clientHeight;return -(h>0?Math.min(h,el.clientHeight*0.5):0);},duration:${r(L - 0.6)},ease:"sine.inOut"},${r(T + 0.4)});`,
    `tl.fromTo("#${id}k",{opacity:0,y:12},{opacity:1,y:0,duration:0.5},${r(T + 0.5)});`,
    `wordsIn("#${id} .kfw",${r(T + 0.65)},0.08);`,
    scene.subtext ? `tl.fromTo("#${id}s",{opacity:0,y:14},{opacity:1,y:0,duration:0.5},${r(T + 1.1)});` : "",
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// SPLIT-VECTOR — headline on one side, a vector/illustration on the other that
// floats/draws in. The reactive beat is the art's entrance + a gentle float.
function archSplitVector(scene, ctx) {
  const { theme, id, T, L, track, dims, asset } = ctx;
  const land = dims.width >= dims.height;
  const big = land ? 64 : 50;
  const accentText = theme.gradients ? `background:linear-gradient(100deg,${theme.accent},${theme.accent2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${theme.accent};` : `color:${theme.accent};`;
  const dir = land ? "row" : "column";
  const artGlow = theme.gradients ? `filter:drop-shadow(0 18px 40px ${rgba(theme.accent, 0.35)});` : "";
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;display:flex;align-items:center;justify-content:center;">
  <div class="kfstage" style="display:flex;flex-direction:${dir};align-items:center;gap:${land ? 56 : 28}px;width:100%;padding:0 7%;">
    <div style="flex:1;">
      <div style="width:54px;height:5px;border-radius:3px;background:${theme.accent};margin-bottom:20px;"></div>
      <h2 style="font:800 ${big}px/1.05 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};"><style>#${id} .kfacc{${accentText}}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
      ${scene.subtext ? `<p id="${id}s" style="opacity:0;margin-top:14px;font:500 ${Math.round(big * 0.4)}px/1.45 ${cssFont(theme)};color:${theme.dim};">${esc(scene.subtext)}</p>` : ""}
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;"><img id="${id}art" src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;max-width:${land ? "44%" : "60%"};height:auto;max-height:${Math.round(dims.height * (land ? 0.6 : 0.34))}px;object-fit:contain;${artGlow}"></div>
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `tl.from("#${id} .h1, #${id} h2",{x:-36,opacity:0,duration:0.6,ease:"expo.out"},${r(T + 0.15)});`,
    `wordsIn("#${id} .kfw",${r(T + 0.25)},0.07);`,
    scene.subtext ? `tl.fromTo("#${id}s",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},${r(T + 0.8)});` : "",
    `tl.fromTo("#${id}art",{opacity:0,scale:0.82,y:24},{opacity:1,scale:1,y:0,duration:0.7,ease:"back.out(1.5)"},${r(T + 0.4)});`,
    `tl.to("#${id}art",{y:"-=14",duration:1.6,ease:"sine.inOut",yoyo:true,repeat:sreps(${r(L - 0.8)},1.6)},${r(T + 1.1)});`,
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// ASSET MONTAGE — a tiled grid of 3–6 real assets (extra screenshots, curated
// vectors, photos) that pop in on a stagger under a headline. This is the
// work-horse that surfaces the bulk of the fetched pool the single-feature
// archetypes (hero / split) leave unused.
function archAssetMontage(scene, ctx) {
  const { theme, id, T, L, track, dims } = ctx;
  const items = (ctx.assets || []).slice(0, 6);
  const n = items.length || 1;
  const land = dims.width >= dims.height;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  const big = land ? 54 : 44;
  const flat = !theme.gradients;
  const accentText = theme.gradients
    ? `background:linear-gradient(100deg,${theme.accent},${theme.accent2});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${theme.accent};`
    : `color:${theme.accent};`;
  const tileChrome = flat
    ? `border:3px solid ${theme.ink};box-shadow:6px 6px 0 ${theme.accent};`
    : `border:1px solid ${theme.line};box-shadow:0 22px 50px rgba(0,0,0,0.45);`;
  const tileH = Math.round(dims.height * (land ? 0.2 : 0.15));
  const tiles = items.map((a) => {
    const meta = `${a.source || ""} ${a.style || ""} ${a.alt || ""}`.toLowerCase();
    const isVec = /\.svg($|\?)/i.test(a.path) || /vector|illustration|icon|line.?art|graphic/.test(meta);
    const fit = isVec ? "contain" : "cover";
    const pad = isVec ? `background:${rgba(theme.ink, theme.isDark ? 0.06 : 0.04)};padding:14px;` : "";
    return `<div class="kftile" style="opacity:0;overflow:hidden;border-radius:${flat ? 8 : 14}px;${tileChrome}${pad}height:${tileH}px;display:flex;align-items:center;justify-content:center;"><img src="${esc(a.path)}" alt="${esc(a.alt || "")}" style="width:100%;height:100%;object-fit:${fit};display:block;"></div>`;
  }).join("");
  const html = `<div id="${id}" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${track}" style="opacity:0;">
  <div style="position:absolute;left:6%;right:6%;top:50%;transform:translateY(-50%);">
    <div style="width:54px;height:5px;border-radius:3px;background:${theme.accent};margin-bottom:18px;"></div>
    <h2 style="font:800 ${big}px/1.05 ${cssFont(theme)};letter-spacing:-0.02em;color:${theme.ink};max-width:22ch;"><style>#${id} .kfacc{${accentText}}</style>${headlineSpans(scene.headline, scene.emphasis, theme)}</h2>
    <div id="${id}g" style="margin-top:22px;display:grid;grid-template-columns:repeat(${cols},1fr);gap:${land ? 18 : 12}px;">${tiles}</div>
  </div>
</div>`;
  const s = [
    `tl.set("#${id}",{opacity:1},${T});`,
    `wordsIn("#${id} .kfw",${r(T + 0.25)},0.06);`,
    `tl.fromTo("#${id} .kftile",{opacity:0,scale:0.82,y:26},{opacity:1,scale:1,y:0,duration:0.55,stagger:0.1,ease:"back.out(1.5)"},${r(T + 0.55)});`,
    `tl.to("#${id} .kftile",{y:"-=8",duration:1.8,ease:"sine.inOut",yoyo:true,stagger:0.12,repeat:sreps(${r(L - 1.2)},1.8)},${r(T + 1.5)});`,
    ctx.isLast ? "" : `exitScene("#${id}",${r(T + L - 0.35)},${r(T + L)});`,
  ].filter(Boolean).join("\n");
  return { html, script: s };
}

// SCRIM B-ROLL — a leftover photo as a full-bleed, darkened, slowly-scaling
// background behind a scene that carries no foreground asset. The scrim gradient
// guarantees text contrast; data-layout-allow-occlusion keeps occlusion lint
// calm (the scene's text clip is meant to sit over it). Cinematic packs only.
function scrimBg(asset, ctx) {
  const { theme, id, T, L } = ctx;
  if (!asset) return null;
  const g = theme.ground;
  const scrim = `linear-gradient(180deg, ${rgba(g, 0.55)} 0%, ${rgba(g, 0.74)} 55%, ${rgba(g, 0.9)} 100%)`;
  const html = `<div id="${id}bg" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${ctx.bgTrack}" data-layout-allow-occlusion style="opacity:0;overflow:hidden;"><img id="${id}bgi" src="${esc(asset.path)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"><div style="position:absolute;inset:0;background:${scrim};"></div></div>`;
  const s = [
    `tl.fromTo("#${id}bg",{opacity:0},{opacity:1,duration:0.6},${r(T)});`,
    `tl.fromTo("#${id}bgi",{scale:1.09},{scale:1.0,duration:${r(L)},ease:"none"},${r(T)});`,
    ctx.isLast ? "" : `tl.to("#${id}bg",{opacity:0,duration:0.3},${r(T + L - 0.3)});`,
  ].join("\n");
  return { html, script: s };
}

// VIDEO B-ROLL — a stock clip as a full-bleed, scrimmed background behind a text
// scene. HyperFrames seeks <video> deterministically per captured frame (stock
// clips are re-encoded keyframe-dense upstream), so the clip plays through the
// scene; the ground-colored scrim guarantees text contrast on any pack.
function videoBg(asset, ctx) {
  const { theme, id, T, L } = ctx;
  if (!asset) return null;
  const g = theme.ground;
  const scrim = `linear-gradient(180deg, ${rgba(g, 0.5)} 0%, ${rgba(g, 0.72)} 55%, ${rgba(g, 0.9)} 100%)`;
  const html = `<div id="${id}bg" class="clip" data-start="${T}" data-duration="${L}" data-track-index="${ctx.bgTrack}" data-layout-allow-occlusion style="opacity:0;overflow:hidden;"><video id="${id}vid" src="${esc(asset.path)}" muted playsinline preload="auto" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></video><div style="position:absolute;inset:0;background:${scrim};"></div></div>`;
  const s = [
    `tl.fromTo("#${id}bg",{opacity:0},{opacity:1,duration:0.6},${r(T)});`,
    // Drive the clip's playhead off the (paused, frame-seeked) timeline so it plays.
    `tl.to({},{duration:${r(L)},ease:"none",onUpdate:function(){var v=document.getElementById("${id}vid");if(v&&isFinite(v.duration)&&v.duration>0){var lt=tl.time()-${r(T)};v.currentTime=Math.max(0,Math.min(v.duration,lt));}}},${r(T)});`,
    ctx.isLast ? "" : `tl.to("#${id}bg",{opacity:0,duration:0.3},${r(T + L - 0.3)});`,
  ].join("\n");
  return { html, script: s };
}

// Pull up to `max` assets for a montage, round-robin across kinds for variety.
function takeMontage(pools, max) {
  const out = [];
  const order = [pools.screenshots, pools.vectors, pools.photos];
  let progressed = true;
  while (out.length < max && progressed) {
    progressed = false;
    for (const arr of order) {
      if (out.length < max && arr.length) { out.push(arr.shift()); progressed = true; }
    }
  }
  return out;
}

function cssFont(theme) { return theme.fontStack; }
function r(n) { return Math.round(n * 100) / 100; }

function pickNumber(scene) {
  const hay = `${scene.headline || ""} ${scene.emphasis || ""} ${scene.subtext || ""}`;
  const m = /([₹$€£]?)\s?(\d[\d,]*)\s?([%x+]|M|K|B|hrs?|hours?|days?)?/i.exec(hay);
  if (!m) return null;
  const value = clamp(parseInt(m[2].replace(/,/g, ""), 10) || 0, 0, 9_999_999);
  if (!value) return null;
  return { value, prefix: m[1] || "", suffix: (m[3] || "").replace(/hours?|hrs?/i, "") };
}

// Map a storyboard scene.kind to an archetype builder.
function archetypeFor(scene, idx, total) {
  const k = (scene.kind || "").toLowerCase();
  if (idx === 0 || k === "hook" || k === "title") return archHook;
  if (idx === total - 1 || k === "cta") return archCta;
  if (k === "chart" || k === "countdown") return archStat;
  if (pickNumber(scene)) return archStat;        // any scene with a strong number
  return archText;                                // bullet / quote / caption / shape-motion
}

// Seek-safe caption track (one node, recomputed each frame — never one clip/line).
function buildCaptions(captionCues, dims, D, theme, track) {
  const cues = Array.isArray(captionCues) ? captionCues.filter((c) => c && c.text) : [];
  if (!cues.length) return null;
  const data = JSON.stringify(cues.map((c) => [r(c.start || 0), r(c.end || (c.start || 0) + 2), String(c.text)]));
  const html = `<div class="clip" data-start="0" data-duration="${D}" data-track-index="${track}"><div id="kfcap" style="position:absolute;left:50%;bottom:5%;transform:translateX(-50%);max-width:76%;text-align:center;padding:11px 22px;border-radius:12px;background:${rgba(theme.isDark ? "#080c12" : "#0c0c0c", 0.72)};border:1px solid ${rgba("#ffffff", 0.10)};color:#F4F7FA;font:600 ${Math.round(dims.height * 0.034)}px/1.3 ${cssFont(theme)};opacity:0;"></div></div>`;
  const script = `var kfcd=${data};var kfcp={t:0};tl.to(kfcp,{t:${D},duration:${D},ease:"none",onUpdate:function(){var el=document.getElementById("kfcap");if(!el)return;var n=kfcp.t,a=null;for(var k=0;k<kfcd.length;k++){if(n>=kfcd[k][0]&&n<kfcd[k][1]){a=kfcd[k];break;}}if(a){if(el.textContent!==a[2])el.textContent=a[2];el.style.opacity="1";}else el.style.opacity="0";}},0);`;
  return { html, script };
}

// MAIN ENTRY — assemble the full composition.
function buildComposition({ storyboard, dims, framePack, assets, captionCues, seedKey, dressing } = {}) {
  const sb = storyboard || {};
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length ? sb.scenes : [{ id: "s1", start: 0, duration: dims.fps ? 4 : 4, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => a + (s.duration || 0), 0) || 12);
  const theme = deriveTheme(framePack, sb);
  const W = dims.width, H = dims.height;
  // seedKey (jobId) first: two jobs with the same title must not be twins.
  const seed = hashSeed(`${seedKey || ""}|${sb.title || ""}|${scenes.length}`);

  const bg = buildBackground(theme, dims, D, seed, framePack);
  const bodyHtml = [bg.html];
  const scriptLines = [emitHelpers(D), bg.script];

  // ---- ASSET WEAVING ---------------------------------------------------------
  // The agents fetch a POOL of candidate assets (often 8–15); the single-feature
  // archetypes alone consume only 1–2 and the rest are dropped. To actually
  // surface the pool we weave in three tiers, ordered by credibility:
  //   • real screenshots + curated vectors  -> PROMINENT foreground (hero/split)
  //   • leftover assets (≥3)                 -> a MONTAGE grid scene (3–6 at once)
  //   • leftover photos                      -> scrimmed B-roll BACKGROUNDS behind
  //                                             text scenes (cinematic packs only;
  //                                             the scrim guarantees text contrast)
  // The agents still "think" (they picked these assets); the kit places them,
  // guaranteed clean. Each scene owns a 3-track block [bg, content, spare] so a
  // background never collides with (or covers) another scene's content.
  const pools = partitionAssets(assets);
  const plan = scenes.map((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(scenes, i));
    const L = r(scene.duration || 4);
    const base = 4 + i * 3;                  // [bg=base, content=base+1] — unique, no overlap
    // LLM set-dressing (premium hybrid): the dresser may pick this scene's
    // layout variant, the accent word, and a sanitized decorative SVG cluster.
    const dress = dressing && dressing[scene.id] ? dressing[scene.id] : null;
    if (dress?.emphasis && !scene.emphasis) scene = { ...scene, emphasis: dress.emphasis };
    const ctx = {
      theme, dims, id: `s${i + 1}`, T, L,
      track: base + 1, bgTrack: base,
      isLast: i === scenes.length - 1,
      kicker: i === 0 ? (sb.title || "KEYFRAME") : "",
      asset: null, assets: null, bgAsset: null,
      seed,
      variant: dress?.variant != null ? dress.variant : (seed + i * 7) % 4, // 0-3 layout variant
      decorSvg: dress?.decorSvg || null,
    };
    return { scene, i, ctx, isContent: i > 0 && i < scenes.length - 1, build: archetypeFor(scene, i, scenes.length) };
  });

  const leftover = () => pools.screenshots.length + pools.vectors.length + pools.photos.length;
  let usedShot = false, montageDone = false;

  // Pass 1 — FOREGROUND features on every CONTENT scene. The old guard only wove
  // assets into `archText` scenes, so a video whose middle scenes were stat/number
  // scenes dropped the ENTIRE fetched pool (0 images/screenshots on screen). Now
  // any content scene takes an asset: screenshots get hero treatment, a deep pool
  // spends one scene on a montage, the rest become split-art.
  for (const p of plan) {
    if (!p.isContent) continue;
    if (!leftover()) break;
    if (!usedShot && pools.screenshots.length) {
      p.ctx.asset = pools.screenshots.shift(); p.build = archScreenshotHero; usedShot = true;
      p.ctx.kicker = p.scene.emphasis || "Live preview";
    } else if (!montageDone && leftover() >= 3) {
      p.ctx.assets = takeMontage(pools, 6); p.build = archAssetMontage; montageDone = true;
    } else if (pools.vectors.length) {
      p.ctx.asset = pools.vectors.shift(); p.build = archSplitVector;
    } else if (pools.photos.length) {
      p.ctx.asset = pools.photos.shift(); p.build = archSplitVector;
    } else if (pools.screenshots.length) {
      p.ctx.asset = pools.screenshots.shift(); p.build = archScreenshotHero;
      p.ctx.kicker = p.scene.emphasis || "Live preview";
    }
  }

  // Pass 2 — BACKGROUND B-roll behind any scene still without a foreground asset,
  // on ALL packs now (flat packs used to be skipped, which is why blockframe videos
  // showed nothing). A leftover VIDEO becomes a moving background; otherwise a
  // scrimmed photo/screenshot/vector. Never the branded hook (i===0).
  for (const p of plan) {
    if (p.i === 0 || p.ctx.asset || p.ctx.assets) continue;
    if (pools.videos.length) {
      p.ctx.bgVideo = pools.videos.shift();
    } else {
      const a = pools.photos.shift() || pools.screenshots.shift() || pools.vectors.shift();
      if (a) p.ctx.bgAsset = a;
    }
  }

  // Pass 3 — emit each scene (its scrim background first, so it sits under the
  // content clip), in storyboard order.
  for (const p of plan) {
    const bg = p.ctx.bgVideo ? videoBg(p.ctx.bgVideo, p.ctx)
             : p.ctx.bgAsset ? scrimBg(p.ctx.bgAsset, p.ctx) : null;
    const out = p.build(p.scene, p.ctx);
    // Set-dressing decor: a sanitized SVG cluster injected as the scene clip's
    // FIRST child (absolute, pointer-less, behind content), revealed gently.
    if (p.ctx.decorSvg) {
      const decorHtml = `<svg class="kfdress" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;" data-layout-allow-occlusion>${p.ctx.decorSvg}</svg>`;
      const opened = out.html.replace(new RegExp(`(<div id="${p.ctx.id}"[^>]*>)`), `$1${decorHtml}`);
      if (opened !== out.html) {
        out.html = opened;
        out.script += `\ntl.fromTo("#${p.ctx.id} .kfdress",{opacity:0,scale:1.04},{opacity:0.85,scale:1,duration:0.9,ease:"power2.out"},${r(p.ctx.T + 0.35)});`;
      }
    }
    const tag = p.ctx.assets ? " +montage" : p.ctx.asset ? " +asset" : p.ctx.bgVideo ? " +video" : p.ctx.bgAsset ? " +bg" : "";
    bodyHtml.push(`<!-- s${p.i + 1} ${p.scene.kind || ""}${tag} [${p.ctx.T}–${r(p.ctx.T + p.ctx.L)}] -->`);
    if (bg) bodyHtml.push(bg.html);
    bodyHtml.push(out.html);
    scriptLines.push(`// s${p.i + 1}`);
    if (bg) scriptLines.push(bg.script);
    scriptLines.push(out.script);
  }

  const cap = buildCaptions(captionCues, dims, D, theme, 90);
  if (cap) { bodyHtml.push(cap.html); scriptLines.push("// captions", cap.script); }

  scriptLines.push(`window.__timelines = window.__timelines || {};`, `window.__timelines["vid"] = tl;`);

  const indexHtml = [
    `<!DOCTYPE html>`, `<html>`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>`,
    `<style>`,
    `* { margin:0; padding:0; box-sizing:border-box; }`,
    `body { font-family:${theme.fontStack}; }`,
    `#root { position:relative; overflow:hidden; background:${theme.ground}; }`,
    `.clip { position:absolute; inset:0; }`,
    `</style>`, `</head>`, `<body>`,
    `<div id="root" data-composition-id="vid" data-start="0" data-width="${W}" data-height="${H}" data-duration="${D}">`,
    bodyHtml.join("\n"),
    `</div>`,
    `<script>`,
    scriptLines.join("\n"),
    `</script>`, `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: dims.fps || 30, duration: D });
  return { indexHtml, metaJson };
}

function scriptStart(scenes, i) { let s = 0; for (let k = 0; k < i; k++) s += scenes[k].duration || 0; return s; }

module.exports = { buildComposition, deriveTheme, FLAT_PACKS };
