// FLAGSHIP COMPOSER v2 — a world-class, dark-cinematic Three.js launch film.
//
// Register: Apple / Linear / Stripe / Vercel / Framer. A native Three.js scene
// with a real depth stack (aurora + grid-floor background, glass product plates
// midground, bokeh + light-streak foreground), a CINEMATIC CAMERA RIG that
// dollies / parallaxes / orbits / pulls back, SELECTIVE bloom (rims & glows
// bloom, screenshots stay crisp — never blown out), and a continuous-motion
// guarantee (something is always moving). Crisp DOM typography ABOVE the canvas
// with kinetic reveals, supporting stat chips, connectors and data-viz.
//
// THE IDENTITY FIX: when no real product screenshot exists (the common case for
// prompt-only videos) the composer GENERATES a convincing product UI onto a
// CanvasTexture — a real dashboard/analytics/table in the pack palette — so a
// flagship film always presents a product, never off-brand stock or a black box.
//
// Same envelope as scene_kit / three_composer (buildComposition -> {indexHtml,
// metaJson}) so it drops into the render pipeline. The WHOLE animation is driven
// off the single paused GSAP timeline HyperFrames seeks (window.__timelines["vid"])
// via tl.to({onUpdate:()=>render3d(tl.time())}) — deterministic frame-by-frame.
//
// DETERMINISM: seeded PRNG (mulberry32) resolved once; every per-frame value is a
// pure function of tl.time() (no Math.random / Date at runtime); shader uniforms
// are pure functions of time. Text is crisp DOM ABOVE the canvas (never bloomed).

const { deriveTheme } = require("./scene_kit");
const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
const THREE_VER = "0.160.0";
const SAFE_FONTS = "Inter, 'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r2 = (n) => Math.round(n * 1000) / 1000;
const hexInt = (c) => { const m = /^#?([0-9a-fA-F]{6})$/.exec(String(c || "").trim()); return m ? parseInt(m[1], 16) : 0x6E8BFF; };
const hexToRgb = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
// WCAG relative luminance — used to keep emphasis type bright on the dark ground.
const relLum = (h) => { const [r, g, b] = hexToRgb(h).map((v) => v / 255); const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const toHex2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
const lighten = (h, amt) => { const [r, g, b] = hexToRgb(h); const mix = (c) => c + (255 - c) * amt; return `#${toHex2(mix(r))}${toHex2(mix(g))}${toHex2(mix(b))}`; };
// Lighten a color toward white until it clears a legibility floor on the dark ground.
const ensureBright = (h, min = 0.42) => { let c = h; for (let i = 0; i < 8 && relLum(c) < min; i++) c = lighten(c, 0.26); return c; };
function hashSeed(s) { let h = 2166136261; const str = String(s || ""); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// Deep, always-dark cinematic theme. deriveTheme resolves the pack (ground,
// accents, Space Grotesk display face). The flagship ground is authored dark.
function flagshipTheme(framePack, sb) {
  const base = deriveTheme(framePack, sb);
  const ground = (base.manifest && base.manifest.camera3d && base.manifest.camera3d.ground)
    || (base.isDark && /^#/.test(base.ground) ? base.ground : "#07080F");
  const accents = (base.accents && base.accents.length ? base.accents : ["#6E8BFF", "#4ED7FF", "#B16CFF", "#57F2C2"]).slice(0, 4);
  const MONO = "JetBrains Mono";
  const monoFace = isBundled(MONO) ? fontFaceCss(MONO) : "";
  const monoStack = monoFace ? `'${MONO}', ui-monospace, monospace` : "ui-monospace, 'JetBrains Mono', monospace";
  // Emphasis/highlight words must POP against the purple-blue ground. v1's
  // gradient ran accent2 -> accent(periwinkle) -> accent2, and that periwinkle
  // midpoint merged into the aurora background. Anchor a bright GLOSS on the brand
  // accent2 (the same hue as the kicker + chips, so the highlight reads on-brand),
  // guarantee it clears a legibility floor, and keep every stop bright — a glossy
  // near-white top fading to the brand accent — so it never goes muddy/dark.
  const emphMain = ensureBright(accents[1] || accents[0]);
  const emphHi = lighten(emphMain, 0.62);
  const emphSecond = lighten(emphMain, 0.14);
  return {
    ground, ground2: "#0C0E1A", ink: "#F6F8FF", dim: "rgba(214,220,240,0.74)",
    accents, accent: accents[0], accent2: accents[1] || accents[0], accent3: accents[2] || accents[0], accent4: accents[3] || accents[1] || accents[0],
    accentGlow: rgba(accents[1] || accents[0], 0.55),
    emphMain, emphSecond, emphHi,
    displayStack: base.displayStack || SAFE_FONTS,
    fontStack: SAFE_FONTS,
    monoStack,
    fontFace: (base.fontFace || "") + monoFace,
  };
}

// The 6-act narrative. Map each storyboard scene (by index + purpose/kind) to a
// treatment; off-count storyboards degrade gracefully.
function treatmentFor(scene, i, total) {
  const k = `${scene.purpose || scene.kind || ""}`.toLowerCase();
  if (i === 0 || /hook|title|intro/.test(k)) return "hook";
  if (i === total - 1 || /cta|outro|close/.test(k)) return "cta";
  if (/problem|pain|challenge|tension/.test(k)) return "problem";
  if (/solution|reveal|product|intro-product/.test(k)) return "solution";
  if (/benefit|result|metric|proof|stat|growth|outcome/.test(k)) return "benefits";
  if (/feature|how|capabilit|demo/.test(k)) return "features";
  if (i === 1) return "problem";
  if (i === total - 2) return "benefits";
  return i % 2 === 0 ? "solution" : "features";
}

function parseMetric(text) {
  const m = String(text || "").match(/([^\d]*?)(\d[\d,]*(?:\.\d+)?)\s*([%x×+kKmMbB]{0,2})/);
  if (!m) return null;
  const num = parseFloat(m[2].replace(/,/g, ""));
  if (!Number.isFinite(num)) return null;
  const decimals = (m[2].split(".")[1] || "").length;
  return { prefix: m[1].trim(), target: num, decimals, suffix: m[3] || "" };
}

function headlineSpans(headline, emphasis) {
  const words = String(headline || "").trim().split(/\s+/).filter(Boolean);
  const emph = String(emphasis || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words.map((w) => {
    const isE = emph.includes(w.toLowerCase().replace(/[.,!?:;]/g, ""));
    return `<span class="kw${isE ? " kacc" : ""}"><span class="kwi">${esc(w)}</span></span>`;
  }).join(" ");
}

// A short supporting "chip" trio derived from copy — fills the frame with
// designed secondary detail (never a lone headline in a void).
function chipsFor(scene, treatment) {
  const pool = [];
  const push = (t) => { const s = String(t || "").trim(); if (s && s.length <= 22) pool.push(s); };
  (scene.onScreenText || []).forEach(push);
  // derive from subtext words
  const words = String(scene.subtext || scene.headline || "").split(/[,.;]/).map((s) => s.trim()).filter((s) => s && s.length <= 22);
  words.forEach(push);
  const defaults = {
    hook: ["Realtime", "Secure", "Fast"],
    problem: ["Silos", "Delays", "Guesswork"],
    solution: ["Live metrics", "One view", "No setup"],
    features: ["Roles", "Reviews", "Sync"],
    benefits: ["Ship faster", "Fewer meetings", "Clarity"],
    cta: ["Free to start", "No card", "2-min setup"],
  };
  const out = [...new Set(pool)].slice(0, 3);
  while (out.length < 3) out.push((defaults[treatment] || defaults.solution)[out.length]);
  return out.slice(0, 3);
}

// ---- per-scene DOM overlay (crisp, above the canvas) -------------------------
function sceneOverlay(scene, i, total, ctx) {
  const { theme, dims, T, L, title, treatment } = ctx;
  const id = `s${i + 1}`;
  const land = dims.width >= dims.height;
  const centered = treatment === "hook" || treatment === "cta";
  const isHero = treatment === "hook";
  const headStr = String(scene.headline || "").trim();
  const headWords = headStr.split(/\s+/).filter(Boolean);
  const wc = headWords.length || 3;
  const longestWord = headWords.reduce((m, w) => Math.max(m, w.length), 0);
  let measure = wc <= 3 ? 1.14 : wc <= 6 ? 1.0 : 0.82;
  // Long headlines (URLs, code like "<script src=\"…\"></script>") must shrink so
  // they stay on-screen instead of overflowing the right edge (scene 523 bug).
  if (headStr.length > 24) measure = Math.min(measure, 0.82);
  if (headStr.length > 40) measure = Math.min(measure, 0.62);
  // A single very long unbreakable token can't wrap far within maxw — scale to fit it.
  if (longestWord > 14) measure = Math.min(measure, Math.max(0.34, 15 / longestWord));
  // Height-proportional so the (720p-tuned) cinematic scale holds at any resolution.
  const sc = Math.max(0.6, dims.height / 720);
  const baseBig = (isHero ? (land ? 150 : 96) : treatment === "cta" ? (land ? 124 : 80) : (land ? 92 : 60)) * sc;
  const big = Math.round(baseBig * measure);
  const kicker = (treatment === "hook" ? (title || scene.emphasis) : scene.emphasis || (title || "")) || "";
  const metric = treatment === "benefits" ? parseMetric(scene.emphasis || scene.headline || scene.subtext) : null;
  const chips = chipsFor(scene, treatment);

  const align = centered ? "center" : (treatment === "solution" || treatment === "benefits") ? "flex-start" : "flex-start";
  const justify = centered ? "center" : "flex-end";
  const pad = centered ? "0 9%" : land ? "0 7% 8%" : "0 7% 12%";
  const textAlign = align === "flex-start" ? "left" : "center";
  // Interior headlines stay NARROW so they wrap on the left and never reach the
  // upper-right plate zone; hook/cta are centered and can run wider.
  // A long unbreakable token (URL/code) needs more line width so it can wrap
  // instead of running off the right edge.
  const maxw = centered ? (land ? "20ch" : "13ch")
    : longestWord > 14 ? (land ? "17ch" : "13ch")
    : (land ? "11ch" : "10ch");

  const parts = [];
  parts.push(`<div id="${id}" class="ktxt clip" data-start="${T}" data-duration="${L}" data-track-index="${20 + i}" data-layout-allow-occlusion style="opacity:0;align-items:${align};justify-content:${justify};padding:${pad};text-align:${textAlign};">`);
  const scrimAt = centered ? "50% 52%" : align === "flex-start" ? "26% 74%" : "50% 82%";
  parts.push(`  <div class="kscrim" style="background:radial-gradient(58% 50% at ${scrimAt}, rgba(3,4,10,0.74), rgba(3,4,10,0.30) 54%, transparent 78%);"></div>`);
  // Bolder wallpaper index numeral (editorial depth) on interior scenes.
  if (!centered) parts.push(`  <span id="${id}w" class="kwall" style="${align === "flex-start" ? "left:4%;" : "left:50%;transform:translateX(-50%);"}">${String(i + 1).padStart(2, "0")}</span>`);
  parts.push(`  <div class="kstack">`);
  if (kicker) parts.push(`    <span id="${id}k" class="kkick">${esc(kicker)}</span>`);
  if (metric) {
    parts.push(`    <div id="${id}m" class="kmetric" data-target="${metric.target}" data-dec="${metric.decimals}">${metric.prefix ? `<span class="kmpre">${esc(metric.prefix)}</span>` : ""}<span class="kmnum">0</span><span class="kmsuf">${esc(metric.suffix)}</span></div>`);
    if (scene.headline) parts.push(`    <h2 class="kmlabel">${esc(scene.headline)}</h2>`);
  } else {
    parts.push(`    <h1 id="${id}h" class="khead" style="font-size:${big}px;max-width:${maxw};">${headlineSpans(scene.headline, scene.emphasis)}</h1>`);
  }
  if (scene.subtext && !metric) parts.push(`    <p id="${id}s" class="ksub" style="font-size:${Math.round(big * 0.24)}px;">${esc(scene.subtext)}</p>`);
  // Supporting chips row (secondary designed detail) — not on hook (keep it pure).
  if (treatment !== "hook") {
    const chipHtml = chips.map((c, ci) => `<span class="kchip" data-ci="${ci}"><i></i>${esc(c)}</span>`).join("");
    parts.push(`    <div id="${id}c" class="kchips">${chipHtml}</div>`);
  }
  parts.push(`  </div>`);
  parts.push(`</div>`);

  const s = [];
  s.push(`tl.set("#${id}",{opacity:1},${T});`);
  if (!centered) s.push(`tl.fromTo("#${id}w",{opacity:0,scale:1.16,filter:"blur(6px)"},{opacity:0.09,scale:1,filter:"blur(0px)",duration:1.0,ease:"power2.out"},${r2(T + 0.1)});`);
  if (kicker) s.push(`tl.fromTo("#${id}k",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},${r2(T + 0.18)});`);
  if (metric) {
    s.push(`tl.fromTo("#${id}m",{opacity:0,y:28,filter:"blur(10px)"},{opacity:1,y:0,filter:"blur(0px)",duration:0.7,ease:"power3.out"},${r2(T + 0.3)});`);
    s.push(`{const el=document.querySelector("#${id}m .kmnum");const o={v:0};tl.to(o,{v:${metric.target},duration:1.35,ease:"power2.out",onUpdate:()=>{el.textContent=o.v.toFixed(${metric.decimals});}},${r2(T + 0.4)});}`);
    s.push(`tl.fromTo("#${id} .kmlabel",{opacity:0,y:14},{opacity:1,y:0,duration:0.5},${r2(T + 0.85)});`);
  } else {
    // Kinetic reveal — a per-scene VARIED entrance (mask-rise / char-lift / blur-in),
    // chosen by index so no two adjacent headlines animate identically.
    const mode = i % 3;
    if (mode === 0) s.push(`tl.fromTo("#${id} .kwi",{yPercent:118},{yPercent:0,duration:0.72,stagger:0.07,ease:"power4.out"},${r2(T + 0.26)});`);
    else if (mode === 1) s.push(`tl.fromTo("#${id} .kw",{opacity:0,y:34,rotationX:-40,transformOrigin:"50% 100%"},{opacity:1,y:0,rotationX:0,duration:0.8,stagger:0.08,ease:"power3.out"},${r2(T + 0.26)});`);
    else s.push(`tl.fromTo("#${id} .kwi",{yPercent:118,filter:"blur(12px)"},{yPercent:0,filter:"blur(0px)",duration:0.78,stagger:0.06,ease:"power4.out"},${r2(T + 0.26)});`);
  }
  if (scene.subtext && !metric) s.push(`tl.fromTo("#${id}s",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},${r2(T + 0.9)});`);
  if (treatment !== "hook") s.push(`tl.fromTo("#${id}c .kchip",{opacity:0,y:14,scale:0.94},{opacity:1,y:0,scale:1,duration:0.44,stagger:0.09,ease:"back.out(1.7)"},${r2(T + (metric ? 1.05 : 1.0))});`);
  if (treatment !== "cta") {
    s.push(`tl.to("#${id}",{opacity:0,duration:0.42,ease:"power2.in"},${r2(T + L - 0.42)});`);
    s.push(`tl.set("#${id}",{opacity:0},${r2(T + L)});`);
  }
  return { html: parts.join("\n"), script: s.join("\n") };
}

// ---- the Three.js module (deterministic; camera rig + depth + glass plates) --
function threeModule({ theme, dims, D, seed, sceneWindows, plates }) {
  const W = dims.width, H = dims.height;
  const A = theme.accents.map(hexInt);
  const ground = hexInt(theme.ground);
  const gRgb = hexToRgb(theme.ground).map((v) => (v / 255).toFixed(4));
  const aRgb = theme.accents.slice(0, 3).map((h) => hexToRgb(h).map((v) => (v / 255).toFixed(4)));
  const uiPalette = { ground: theme.ground, ground2: theme.ground2, ink: theme.ink, dim: theme.dim, accents: theme.accents };
  return `
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const W=${W},H=${H},D=${D};
const A=[${A.map((c) => "0x" + c.toString(16)).join(",")}];
const PLATES=${JSON.stringify(plates)};
const UIP=${JSON.stringify(uiPalette)};
let __s=${seed}>>>0; function rand(){__s|=0;__s=(__s+0x6D2B79F5)|0;let t=Math.imul(__s^(__s>>>15),1|__s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;}
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;
const BLOOM=1;
function land(){return W>=H;}

const cv=document.getElementById("kfcanvas");
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
renderer.setSize(W,H,false); renderer.setClearColor(${ground},1);
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=0.98;
if("outputColorSpace" in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene(); scene.fog=new THREE.FogExp2(${ground},0.03);
const cam=new THREE.PerspectiveCamera(42,W/H,0.1,140); cam.layers.enable(0); cam.layers.enable(BLOOM);

// ---- lighting ----
scene.add(new THREE.AmbientLight(0xffffff,0.66));
const key=new THREE.DirectionalLight(0xffffff,1.02); key.position.set(3,5,7); scene.add(key);
const rim1=new THREE.PointLight(A[0],1.5,48); rim1.position.set(-7,3,5); scene.add(rim1);
const rim2=new THREE.PointLight(A[1%A.length],1.3,48); rim2.position.set(7,-2,4); scene.add(rim2);

// ---- background: drifting AURORA gradient plane (faster, richer than v1) ----
const AUR_FRAG=\`
uniform float uTime; varying vec2 vUv;
const vec3 G=vec3(${gRgb.join(",")});
const vec3 CA=vec3(${aRgb[0].join(",")});
const vec3 CB=vec3(${(aRgb[1] || aRgb[0]).join(",")});
const vec3 CC=vec3(${(aRgb[2] || aRgb[0]).join(",")});
float blob(vec2 uv,vec2 c,float r){return smoothstep(r,0.0,distance(uv,c));}
void main(){
  vec2 uv=vUv;
  vec2 pA=vec2(0.28+sin(uTime*0.15)*0.14,0.66+cos(uTime*0.12)*0.12);
  vec2 pB=vec2(0.74+cos(uTime*0.11)*0.14,0.34+sin(uTime*0.17)*0.13);
  vec2 pC=vec2(0.52+sin(uTime*0.09+2.0)*0.18,0.5+cos(uTime*0.13+1.0)*0.14);
  vec3 col=G;
  col=mix(col,CA,blob(uv,pA,0.54)*0.60);
  col=mix(col,CC,blob(uv,pC,0.64)*0.34);
  col=mix(col,CB,blob(uv,pB,0.50)*0.52);
  float d=distance(uv,vec2(0.5));
  col*=1.0-d*0.60;
  gl_FragColor=vec4(col,1.0);
}\`;
const AUR_VERT="varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}";
const aurMat=new THREE.ShaderMaterial({vertexShader:AUR_VERT,fragmentShader:AUR_FRAG,uniforms:{uTime:{value:0}},depthWrite:false,fog:false});
const aurora=new THREE.Mesh(new THREE.PlaneGeometry(170,100),aurMat); aurora.position.z=-34; scene.add(aurora);

// ---- background: a faint perspective GRID FLOOR (depth + tech identity) ----
const grid=new THREE.GridHelper(80,48,A[0],A[0]);
grid.material.transparent=true; grid.material.opacity=0.07; grid.material.depthWrite=false;
grid.position.set(0,-6.2,-6); grid.layers.enable(BLOOM); scene.add(grid);

// ---- foreground bokeh (fast parallax) ----
const N=200, PP=new Float32Array(N*3), PC=new Float32Array(N*3), PS=new Float32Array(N);
for(let i=0;i<N;i++){PP[i*3]=(rand()-0.5)*30;PP[i*3+1]=(rand()-0.5)*17;PP[i*3+2]=1.5+rand()*8;const c=new THREE.Color(A[i%A.length]);PC[i*3]=c.r;PC[i*3+1]=c.g;PC[i*3+2]=c.b;PS[i]=0.03+rand()*0.09;}
const pg=new THREE.BufferGeometry(); pg.setAttribute("position",new THREE.BufferAttribute(PP,3)); pg.setAttribute("color",new THREE.BufferAttribute(PC,3));
const bokeh=new THREE.Points(pg,new THREE.PointsMaterial({size:0.07,vertexColors:true,transparent:true,opacity:0.6,blending:THREE.AdditiveBlending,depthWrite:false}));
bokeh.layers.enable(BLOOM); scene.add(bokeh);

// ---- foreground light STREAKS (thin additive bars that drift + parallax) ----
const streaks=new THREE.Group();
for(let i=0;i<5;i++){const w=6+rand()*10, h=0.02+rand()*0.03;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:A[i%A.length],transparent:true,opacity:0.14,blending:THREE.AdditiveBlending,depthWrite:false}));m.position.set((rand()-0.5)*20,(rand()-0.5)*11,3+rand()*5);m.rotation.z=(rand()-0.5)*0.5;m.userData.sp=0.4+rand()*0.6;m.userData.ph=rand()*6.28;streaks.add(m);m.layers.enable(BLOOM);}
scene.add(streaks);

// ================= GENERATED PRODUCT UI (CanvasTexture) =====================
// Draws a convincing dashboard / analytics / table in the pack palette so a
// plate ALWAYS presents a product — even with no real screenshot. Deterministic.
function uiTexture(kind, ci){
  const cw=1024, ch=640, cvs=document.createElement("canvas"); cvs.width=cw; cvs.height=ch;
  const x=cvs.getContext("2d");
  const acc=UIP.accents[ci%UIP.accents.length], acc2=UIP.accents[(ci+1)%UIP.accents.length];
  const rr=(a,b,w,h,r)=>{x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath();};
  // panel bg
  const bg=x.createLinearGradient(0,0,cw,ch); bg.addColorStop(0,"#0e1120"); bg.addColorStop(1,"#0a0c17");
  x.fillStyle=bg; x.fillRect(0,0,cw,ch);
  // sidebar
  x.fillStyle="rgba(255,255,255,0.03)"; x.fillRect(0,0,150,ch);
  x.fillStyle=acc; rr(26,28,26,26,7); x.fill();
  for(let i=0;i<6;i++){x.fillStyle=i===1?"rgba(255,255,255,0.14)":"rgba(255,255,255,0.06)";rr(26,86+i*46,98,20,6);x.fill();}
  const PADX=186, TOP=34;
  // top bar title
  x.fillStyle="rgba(255,255,255,0.9)"; x.font="700 26px 'Space Grotesk',sans-serif"; x.fillText("Overview", PADX, TOP+22);
  x.fillStyle=acc2; rr(cw-150,TOP,120,34,17); x.fill();
  x.fillStyle="#0a0c17"; x.font="600 15px Inter,sans-serif"; x.fillText("Live", cw-118, TOP+22);
  const draw = () => {
    // KPI tiles
    const tw=(cw-PADX-40-32)/3;
    for(let i=0;i<3;i++){const tx=PADX+i*(tw+16), ty=92;
      x.fillStyle="rgba(255,255,255,0.05)"; rr(tx,ty,tw,96,12); x.fill();
      x.fillStyle="rgba(255,255,255,0.5)"; x.font="500 13px Inter,sans-serif"; x.fillText(["Revenue","Active","Uptime"][i], tx+16, ty+26);
      x.fillStyle="#F6F8FF"; x.font="700 34px 'Space Grotesk',sans-serif"; x.fillText(["$48.2k","12,847","99.9%"][i], tx+16, ty+64);
      x.fillStyle=i===2?acc2:acc; x.font="600 13px Inter,sans-serif"; x.fillText(["+18%","+7%","SLA"][i], tx+16, ty+86);
    }
  };
  draw();
  const cx=PADX, cy=214, cwid=cw-PADX-40, chei=ch-cy-34;
  x.fillStyle="rgba(255,255,255,0.04)"; rr(cx,cy,cwid,chei,14); x.fill();
  if(kind==="table"){
    for(let r=0;r<6;r++){x.fillStyle=r%2?"rgba(255,255,255,0.02)":"rgba(255,255,255,0.04)";rr(cx+14,cy+16+r*((chei-24)/6),cwid-28,((chei-24)/6)-6,7);x.fill();
      x.fillStyle="rgba(255,255,255,0.5)";x.font="500 15px Inter,sans-serif";x.fillText(["Acme","Globex","Initech","Umbra","Hooli","Stark"][r], cx+30, cy+16+r*((chei-24)/6)+((chei-24)/12)+5);
      x.fillStyle=acc; rr(cwid-120,cy+16+r*((chei-24)/6)+((chei-24)/12)-8,60+r*8,10,5); x.fill();}
  } else if(kind==="bars"){
    const n=9, bw=(cwid-56)/n; for(let i=0;i<n;i++){const bh=(chei-56)*(0.28+ (Math.sin(i*1.3+ci)*0.5+0.5)*0.66);x.fillStyle=i===n-1?acc2:acc;x.globalAlpha=i===n-1?1:0.72;rr(cx+28+i*bw,cy+chei-28-bh,bw-10,bh,5);x.fill();}
    x.globalAlpha=1;
  } else if(kind==="donut"){
    const ccx=cx+chei*0.55, ccy=cy+chei/2+6, R=chei*0.34, r0=R*0.58;
    const segs=[0.42,0.27,0.19,0.12]; let a0=-Math.PI/2;
    const dc=[acc,acc2,UIP.accents[(ci+2)%UIP.accents.length],"rgba(255,255,255,0.16)"];
    for(let i=0;i<segs.length;i++){const a1=a0+segs[i]*6.2832;x.beginPath();x.moveTo(ccx,ccy);x.arc(ccx,ccy,R,a0,a1);x.closePath();x.fillStyle=dc[i];x.fill();a0=a1;}
    x.fillStyle="#0b0d18";x.beginPath();x.arc(ccx,ccy,r0,0,6.2832);x.fill();
    x.textAlign="center";x.fillStyle="#F6F8FF";x.font="700 44px 'Space Grotesk',sans-serif";x.fillText("68%",ccx,ccy+2);x.fillStyle="rgba(255,255,255,0.5)";x.font="500 15px Inter,sans-serif";x.fillText("Conversion",ccx,ccy+30);x.textAlign="left";
    const lx=ccx+R+54, ly=cy+42, labs=["Direct","Search","Social","Referral"];
    for(let i=0;i<4;i++){x.fillStyle=dc[i];rr(lx,ly+i*46,16,16,4);x.fill();x.fillStyle="rgba(255,255,255,0.72)";x.font="500 17px Inter,sans-serif";x.fillText(labs[i],lx+28,ly+13+i*46);x.fillStyle="rgba(255,255,255,0.42)";x.fillText(Math.round(segs[i]*100)+"%",lx+152,ly+13+i*46);}
  } else if(kind==="kanban"){
    const kc=3, kgap=16, colw=(cwid-32-kgap*(kc-1))/kc, heads=["To do","Active","Done"], nc=[3,2,3];
    for(let c=0;c<kc;c++){const colx=cx+16+c*(colw+kgap);
      x.fillStyle="rgba(255,255,255,0.72)";x.font="600 15px Inter,sans-serif";x.fillText(heads[c],colx+2,cy+24);
      x.fillStyle=c===2?acc2:acc;x.beginPath();x.arc(colx+colw-12,cy+19,5,0,6.2832);x.fill();
      const ch2=(chei-52)/3; for(let k=0;k<nc[c];k++){const cardy=cy+38+k*ch2;
        x.fillStyle="rgba(255,255,255,0.05)";rr(colx,cardy,colw,ch2-12,9);x.fill();
        x.fillStyle=(c===1&&k===0)?acc:"rgba(255,255,255,0.20)";rr(colx+12,cardy+12,colw*0.52,8,4);x.fill();
        x.fillStyle="rgba(255,255,255,0.10)";rr(colx+12,cardy+28,colw*0.74,7,4);x.fill();
        x.fillStyle=[acc,acc2,UIP.accents[(ci+2)%UIP.accents.length]][(c+k)%3];x.beginPath();x.arc(colx+colw-20,cardy+ch2-24,7,0,6.2832);x.fill();}
    }
  } else if(kind==="activity"){
    const rows=5, rh=(chei-20)/rows;
    for(let r=0;r<rows;r++){const ry=cy+10+r*rh;
      x.fillStyle=[acc,acc2,UIP.accents[(ci+2)%UIP.accents.length]][r%3];x.beginPath();x.arc(cx+36,ry+rh/2,15,0,6.2832);x.fill();
      x.fillStyle="rgba(255,255,255,0.68)";rr(cx+64,ry+rh/2-15,cwid*0.32,10,5);x.fill();
      x.fillStyle="rgba(255,255,255,0.14)";rr(cx+64,ry+rh/2+3,cwid*0.5,8,4);x.fill();
      x.strokeStyle=acc;x.lineWidth=2.5;x.beginPath();const sx=cx+cwid*0.72,sw=cwid*0.18;for(let i=0;i<8;i++){const spx=sx+i*(sw/7),spy=ry+rh/2+Math.sin(i*0.9+r+ci)*9;i?x.lineTo(spx,spy):x.moveTo(spx,spy);}x.stroke();
      x.fillStyle="rgba(255,255,255,0.3)";x.font="500 13px Inter,sans-serif";x.fillText((r+1)+"m",cx+cwid-34,ry+rh/2+4);}
  } else {
    // area line chart
    x.strokeStyle="rgba(255,255,255,0.06)"; x.lineWidth=1;
    for(let g=1;g<4;g++){x.beginPath();x.moveTo(cx+20,cy+g*(chei/4));x.lineTo(cx+cwid-20,cy+g*(chei/4));x.stroke();}
    const pts=[]; const n=24; for(let i=0;i<n;i++){const px=cx+24+i*((cwid-48)/(n-1));const t=i/(n-1);const py=cy+chei-30-(chei-70)*(0.30+t*0.42+Math.sin(i*0.7+ci)*0.10);pts.push([px,py]);}
    const grad=x.createLinearGradient(0,cy,0,cy+chei); grad.addColorStop(0,acc+"66"); grad.addColorStop(1,acc+"00");
    x.beginPath();x.moveTo(pts[0][0],cy+chei-24);pts.forEach(p=>x.lineTo(p[0],p[1]));x.lineTo(pts[n-1][0],cy+chei-24);x.closePath();x.fillStyle=grad;x.fill();
    x.beginPath();pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.strokeStyle=acc;x.lineWidth=3;x.lineJoin="round";x.stroke();
    x.fillStyle=acc2; x.beginPath(); x.arc(pts[n-1][0],pts[n-1][1],6,0,6.28); x.fill();
  }
  const tex=new THREE.CanvasTexture(cvs); if("SRGBColorSpace" in THREE)tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=4; tex.needsUpdate=true;
  return tex;
}

// ---- glass plate factory (screenshot OR generated UI) ----
const loader=new THREE.TextureLoader();
function makePlate(spec){
  const g=new THREE.Group();
  const aspect=spec.aspect&&spec.aspect>0.3&&spec.aspect<4?spec.aspect:1.6;
  const w=spec.w, h=w/aspect;
  // back glow (blooms as a soft rim)
  const glowMat=new THREE.MeshBasicMaterial({color:A[spec.ci%A.length],transparent:true,opacity:0.30,blending:THREE.AdditiveBlending,depthWrite:false});
  const glow=new THREE.Mesh(new THREE.PlaneGeometry(w*1.18,h*1.20),glowMat); glow.position.z=-0.06; glow.layers.enable(BLOOM); g.add(glow);
  // dark glass backing
  const back=new THREE.Mesh(new THREE.PlaneGeometry(w*1.04,h*1.08),new THREE.MeshStandardMaterial({color:0x0d1020,roughness:0.5,metalness:0.25,transparent:true,opacity:0.98}));
  back.position.z=-0.02; g.add(back);
  // chrome bar + traffic lights
  const barH=Math.max(0.16,h*0.10);
  const bar=new THREE.Mesh(new THREE.PlaneGeometry(w,barH),new THREE.MeshStandardMaterial({color:0x161a2b,roughness:0.6,metalness:0.15}));
  bar.position.set(0,h/2-barH/2,0.01); g.add(bar);
  const dotCols=[0xff5f57,0xfebc2e,0x28c840];
  for(let i=0;i<3;i++){const dot=new THREE.Mesh(new THREE.CircleGeometry(barH*0.16,18),new THREE.MeshBasicMaterial({color:dotCols[i]}));dot.position.set(-w/2+barH*(0.5+i*0.42),h/2-barH/2,0.02);g.add(dot);}
  // the content: real screenshot OR generated product UI (NEVER a black void)
  const shotH=h-barH;
  let shotMat;
  if(spec.tex){const tex=loader.load(spec.tex);if("SRGBColorSpace" in THREE)tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;shotMat=new THREE.MeshBasicMaterial({map:tex});}
  else{const tex=uiTexture(spec.ui||"line",spec.ci);shotMat=new THREE.MeshBasicMaterial({map:tex});}
  const shot=new THREE.Mesh(new THREE.PlaneGeometry(w*0.985,shotH*0.965),shotMat);
  shot.position.set(0,-barH/2,0.015); g.add(shot);
  // inner light border (subtle, blooms)
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w,h)),new THREE.LineBasicMaterial({color:A[spec.ci%A.length],transparent:true,opacity:0.85}));
  edges.position.z=0.02; edges.layers.enable(BLOOM); g.add(edges);
  g.userData={base:spec, w, h};
  return g;
}

// ---- build one group per scene (its plates), hidden until its window ----
const SCENES=${JSON.stringify(sceneWindows)};
for(const sc of SCENES){
  const g=new THREE.Group();
  const mine=PLATES.filter(p=>p.scene===sc.i);
  mine.forEach((spec,idx)=>{
    const pl=makePlate(spec);
    // Text lives LOWER-LEFT (see sceneOverlay), so plates sit UPPER-RIGHT — never
    // occluding the headline. Portrait stacks the plate above the text instead.
    if(spec.role==="hero"){pl.position.set(land()?2.0:0, land()?1.35:1.5, 0); pl.rotation.y=land()?-0.13:0;}
    else if(spec.role==="feature"){const n=mine.length;const spread=n>1?(idx-(n-1)/2):0;pl.position.set((land()?1.9:0)+spread*3.0, (land()?1.5:1.7)+(idx%2?-0.32:0.32), -idx*1.4);pl.rotation.y=-0.16-spread*0.18;}
    else if(spec.role==="side"){pl.position.set(land()?3.2:0, land()?1.35:1.6, -0.3);pl.rotation.y=-0.24;}
    pl.userData.jit={ph:rand()*6.28, ax:0.05+rand()*0.05, ay:0.06+rand()*0.06};
    g.add(pl);
  });
  g.visible=false; sc.group=g; scene.add(g);
}

// ---- SELECTIVE BLOOM: only rims/glows/particles/streaks bloom; UI stays crisp ----
const bloomPass=new UnrealBloomPass(new THREE.Vector2(W,H),0.9,0.8,0.72); // (strength,radius,threshold)
const bloomComposer=new EffectComposer(renderer); bloomComposer.renderToScreen=false;
bloomComposer.addPass(new RenderPass(scene,cam)); bloomComposer.addPass(bloomPass);
const DARK=new THREE.MeshBasicMaterial({color:0x000000}); const _stash={};
function darkenNonBloom(o){ if(o.isMesh && !o.layers.isEnabled(BLOOM)){_stash[o.uuid]=o.material;o.material=DARK;} }
function restoreMat(o){ if(_stash[o.uuid]){o.material=_stash[o.uuid];delete _stash[o.uuid];} }
const MIX_FRAG=\`uniform sampler2D baseTexture; uniform sampler2D bloomTexture; uniform float uTime; varying vec2 vUv;
float rnd(vec2 c){return fract(sin(dot(c.xy,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec4 base=texture2D(baseTexture,vUv);
  vec4 bloom=texture2D(bloomTexture,vUv);
  vec3 col=base.rgb+bloom.rgb*1.05;
  col+=(rnd(vUv*vec2(\${W}.0,\${H}.0)+vec2(mod(uTime,9.0)*11.3))-0.5)*0.026;      // grain
  float d=distance(vUv,vec2(0.5)); col*=1.0-smoothstep(0.52,1.06,d)*0.5;           // vignette
  gl_FragColor=vec4(col,1.0);
}\`;
const finalComposer=new EffectComposer(renderer);
finalComposer.addPass(new RenderPass(scene,cam));
const mixPass=new ShaderPass(new THREE.ShaderMaterial({
  uniforms:{baseTexture:{value:null},bloomTexture:{value:bloomComposer.renderTarget2.texture},uTime:{value:0}},
  vertexShader:AUR_VERT, fragmentShader:MIX_FRAG, defines:{}
}),"baseTexture");
mixPass.needsSwap=true; finalComposer.addPass(mixPass);

// ---- camera choreography per treatment (BIG, cinematic moves) ----
function cameraFor(type,lt,dur){
  const p=Math.max(0,Math.min(1,lt/Math.max(0.1,dur)));
  const e=smooth(0,1,p);
  // seeded handheld micro-motion (pure fn of time)
  const hx=Math.sin(lt*0.9+1.3)*0.05+Math.sin(lt*0.37)*0.06;
  const hy=Math.cos(lt*0.8+0.6)*0.04+Math.sin(lt*0.28)*0.05;
  if(type==="hook")      return {px:lerp(-0.6,0.8,e)+hx, py:0.3+hy, pz:lerp(11.5,7.4,e), tx:0, ty:0, tz:0, roll:lerp(0.01,-0.01,e)};
  if(type==="problem")   return {px:lerp(-2.4,2.4,e)+hx, py:hy*1.4, pz:9.2, tx:lerp(0.8,-0.8,e), ty:0, tz:-1, roll:lerp(-0.015,0.015,e)};
  if(type==="solution")  return {px:lerp(1.2,-0.4,e)+hx, py:0.65+hy, pz:lerp(9.8,6.4,e), tx:lerp(0.7,-0.4,e), ty:0.55, tz:0, roll:0};
  if(type==="features")  return {px:lerp(-3.2,3.2,e)+hx, py:0.8+hy, pz:8.2, tx:lerp(-1.6,1.6,e), ty:0.5, tz:-0.6, roll:lerp(0.02,-0.02,e)};
  if(type==="benefits")  return {px:lerp(2.0,-0.3,e)+hx, py:0.6+hy, pz:lerp(8.4,6.4,e), tx:lerp(0.9,-0.2,e), ty:0.5, tz:0, roll:0};
  /* cta */               return {px:hx, py:0.25+hy, pz:lerp(4.8,10.5,e), tx:0, ty:0, tz:0, roll:lerp(-0.02,0,e)};
}

function winOpacity(t,s,e){
  if(t<s-0.28||t>e+0.28)return 0;
  const a=s<=0.01?1:Math.min(1,(t-(s-0.28))/0.5);
  const b=e>=D-0.01?1:Math.min(1,((e+0.28)-t)/0.5);
  return Math.max(0,Math.min(a,b));
}
function setOpacity(g,o){g.visible=o>0.01;g.traverse((o2)=>{if(o2.material&&"opacity" in o2.material){o2.userData.__b=o2.userData.__b!==undefined?o2.userData.__b:o2.material.opacity;o2.material.transparent=true;o2.material.opacity=o2.userData.__b*o;}});}

// scene-boundary GLOW WIPE — a full-screen additive flash swept at each cut.
const wipeMat=new THREE.MeshBasicMaterial({color:A[1%A.length],transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false});
const wipe=new THREE.Mesh(new THREE.PlaneGeometry(3,3),wipeMat); wipe.layers.enable(BLOOM);
cam.add(wipe); wipe.position.set(0,0,-1.6); scene.add(cam);
const BOUNDS=SCENES.map(s=>s.start).filter(v=>v>0.05);
function wipeAt(t){let o=0;for(const b of BOUNDS){const d=Math.abs(t-b);if(d<0.26)o=Math.max(o,(1-d/0.26)*0.5);}return o;}

function render3d(t){
  aurMat.uniforms.uTime.value=t; mixPass.material.uniforms.uTime.value=t;
  bokeh.rotation.y=t*0.03; bokeh.position.x=Math.sin(t*0.12)*0.8;
  streaks.children.forEach((m)=>{m.position.x=((m.position.x+ (0)) ); m.userData.x0=m.userData.x0!==undefined?m.userData.x0:m.position.x; m.position.x=m.userData.x0+Math.sin(t*0.1*m.userData.sp+m.userData.ph)*3.0; m.material.opacity=0.10+Math.abs(Math.sin(t*0.4+m.userData.ph))*0.10;});
  grid.position.z=-6+((t*0.5)%2);
  let active=SCENES[0];
  for(const sc of SCENES){const o=winOpacity(t,sc.start,sc.end);setOpacity(sc.group,o);if(t>=sc.start&&t<sc.end)active=sc;
    sc.group.children.forEach((pl)=>{const j=pl.userData.jit;if(!j)return;const lt=t-sc.start;pl.position.y=(pl.userData.baseY!==undefined?pl.userData.baseY:(pl.userData.baseY=pl.position.y))+Math.sin(lt*0.7+j.ph)*0.13;pl.rotation.x=Math.sin(lt*0.5+j.ph)*0.02;});
  }
  const c=cameraFor(active.type,t-active.start,active.end-active.start);
  cam.position.set(c.px,c.py,c.pz); cam.up.set(Math.sin(c.roll||0),Math.cos(c.roll||0),0); cam.lookAt(c.tx,c.ty,c.tz);
  rim1.position.x=Math.sin(t*0.3)*7; rim2.position.x=Math.cos(t*0.26)*7;
  wipeMat.opacity=wipeAt(t);
  // selective bloom: darken non-bloom, bloom pass, restore, final composite
  scene.traverse(darkenNonBloom); bloomComposer.render(); scene.traverse(restoreMat);
  finalComposer.render();
}
render3d(0);

const tl=gsap.timeline({paused:true,defaults:{ease:"power3.out"}});
tl.to({v:0},{v:1,duration:D,ease:"none",onUpdate:()=>render3d(tl.time())},0);
__OVERLAY_TWEENS__
window.__timelines=window.__timelines||{}; window.__timelines["vid"]=tl;
`;
}

// ---- asset → scene plate assignment (heuristic, aspect-aware) ----------------
// v2: EVERY content scene gets a plate. Real screenshots take priority; when the
// pool is empty the plate renders a GENERATED product UI (never a black box).
function assignPlates(scenes, sceneWindows, assets) {
  const imgs = (assets || []).filter((a) => a && a.path && !/\.(mp4|webm|mov)$/i.test(a.path) && !/\.svg($|\?)/i.test(a.path));
  const ratio = (a) => (a.width && a.height ? a.width / a.height : (a.ratio || 1.6));
  const rank = (a) => (a.source === "website" || /screenshot|webpage|landing|dashboard/i.test(a.alt || "") ? 3 : a.visionOk === true ? 2 : 1);
  const pool = imgs.slice().sort((a, b) => rank(b) - rank(a));
  const used = new Set();
  const take = () => { const a = pool.find((x) => !used.has(x)); if (a) used.add(a); return a || null; };
  const avail = () => pool.filter((x) => !used.has(x)).length;
  // Distinct product surfaces per feature plate so a cluster never looks repetitive.
  const UIKINDS = ["donut", "kanban", "activity"];
  const plates = [];
  sceneWindows.forEach((w) => {
    const type = w.type;
    if (type === "solution") {
      const a = take();
      plates.push({ scene: w.i, role: "hero", tex: a ? a.path : null, ui: "line", aspect: a ? ratio(a) : 1.6, w: 4.4, ci: 0 });
    } else if (type === "features") {
      // three feature plates; real screenshots first, generated UI fills the rest.
      for (let k = 0; k < 3; k++) { const a = take(); plates.push({ scene: w.i, role: "feature", tex: a ? a.path : null, ui: UIKINDS[k % 3], aspect: a ? ratio(a) : 1.6, w: 2.5, ci: k }); }
    } else if (type === "benefits") {
      const a = take();
      plates.push({ scene: w.i, role: "side", tex: a ? a.path : null, ui: "bars", aspect: a ? ratio(a) : 1.6, w: 2.9, ci: 2 });
    } else if (type === "cta") {
      if (avail() > 0) { const a = take(); plates.push({ scene: w.i, role: "side", tex: a.path, aspect: ratio(a), w: 2.3, ci: 1 }); }
    }
    // hook stays pure type over aurora (no plate).
  });
  return plates;
}

function buildComposition({ storyboard, dims, framePack, captionCues, assets } = {}) {
  const sb = storyboard || {};
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length ? sb.scenes : [{ id: "s1", start: 0, duration: 6, purpose: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r2(sb.durationSec || scenes.reduce((a, s) => a + (s.duration || 0), 0) || 12);
  const W = dims.width, H = dims.height;
  const theme = flagshipTheme(framePack, sb);
  const seed = hashSeed(`${sb.title || ""}|${scenes.length}|flagship`);
  // Type scale — keep the 720p-tuned proportions at any render resolution.
  const sc = Math.max(0.6, H / 720);
  const px = (n) => Math.round(n * sc);

  let cursor = 0;
  const sceneWindows = scenes.map((scene, i) => {
    const start = r2(scene.start != null ? scene.start : cursor);
    const dur = r2(scene.duration || 4);
    cursor = r2(cursor + dur);
    return { i, type: treatmentFor(scene, i, scenes.length), start, end: r2(start + dur) };
  });

  const plates = assignPlates(scenes, sceneWindows, assets);

  const bodyHtml = [`<canvas id="kfcanvas" class="clip" data-start="0" data-duration="${D}" data-track-index="0" width="${W}" height="${H}"></canvas>`];

  const catalogue = (sb.title || "KEYFRAME").toUpperCase().slice(0, 34);
  bodyHtml.push([
    `<div class="kchrome clip" data-start="0" data-duration="${D}" data-track-index="30" data-layout-allow-occlusion>`,
    `  <span class="kcat">${esc(catalogue)}</span>`,
    `  <span id="kfcount" class="kcount">01 / ${String(sceneWindows.length).padStart(2, "0")}</span>`,
    `  <span class="kbar"><span id="kfprog" class="kbarfill"></span></span>`,
    `</div>`,
  ].join("\n"));

  const overlayTweens = [];
  scenes.forEach((scene, i) => {
    const w = sceneWindows[i];
    const ov = sceneOverlay(scene, i, scenes.length, { theme, dims, T: w.start, L: r2(w.end - w.start), title: sb.title, treatment: w.type });
    bodyHtml.push(ov.html);
    overlayTweens.push(`// ${scene.id || "s" + (i + 1)} (${w.type})`, ov.script);
  });
  overlayTweens.push([
    `{ var __starts=${JSON.stringify(sceneWindows.map((w) => w.start))}, __n=${sceneWindows.length};`,
    `  tl.to({d:0},{d:1,duration:${D},ease:"none",onUpdate:function(){`,
    `    var t=tl.time(), pct=Math.max(0,Math.min(1,t/${D}));`,
    `    var pr=document.getElementById("kfprog"); if(pr) pr.style.transform="scaleX("+pct.toFixed(4)+")";`,
    `    var idx=1; for(var i=0;i<__starts.length;i++){ if(t>=__starts[i]-0.001) idx=i+1; }`,
    `    var cc=document.getElementById("kfcount"); if(cc){ var s=("0"+idx).slice(-2)+" / "+("0"+__n).slice(-2); if(cc.textContent!==s) cc.textContent=s; }`,
    `  }},0); }`,
  ].join("\n"));

  const moduleSrc = threeModule({ theme, dims, D, seed, sceneWindows, plates }).replace("__OVERLAY_TWEENS__", overlayTweens.join("\n"));

  const indexHtml = [
    `<!DOCTYPE html>`, `<html>`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="${GSAP_CDN}"></script>`,
    `<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/"}}</script>`,
    `<style>`,
    theme.fontFace || "",
    `* { margin:0; padding:0; box-sizing:border-box; }`,
    `body { font-family:${theme.fontStack}; }`,
    `#root { position:relative; overflow:hidden; background:${theme.ground}; }`,
    `#kfcanvas { position:absolute; inset:0; z-index:0; }`,
    `.ktxt { position:absolute; inset:0; z-index:10; display:flex; flex-direction:column; }`,
    `.kscrim { position:absolute; inset:0; pointer-events:none; z-index:-1; }`,
    `.kstack { position:relative; display:flex; flex-direction:column; align-items:inherit; }`,
    `.kkick { display:inline-flex; align-items:center; gap:12px; margin-bottom:${px(24)}px; color:${theme.accent2}; font-family:${theme.monoStack}; font-size:${px(14)}px; font-weight:500; letter-spacing:.2em; text-transform:uppercase; }`,
    `.kkick::before { content:""; width:${px(40)}px; height:2px; background:${theme.accent2}; box-shadow:0 0 12px ${rgba(theme.accent2, 0.9)}; }`,
    `.kwall { position:absolute; top:-0.44em; z-index:-1; font-family:${theme.displayStack}; font-weight:700; font-size:${px(W >= H ? 380 : 250)}px; line-height:1; color:${theme.ink}; opacity:0.09; pointer-events:none; letter-spacing:-0.04em; }`,
    `.khead { margin:0; font-family:${theme.displayStack}; font-weight:700; line-height:0.98; letter-spacing:-0.03em; color:${theme.ink}; text-shadow:0 2px 16px rgba(0,0,0,0.85),0 10px 60px rgba(0,0,0,0.5); overflow-wrap:anywhere; }`,
    `.kw { display:inline-block; overflow:hidden; vertical-align:top; max-width:100%; }`,
    `.kwi { display:inline-block; overflow-wrap:anywhere; word-break:break-word; }`,
    `.kacc .kwi { background:linear-gradient(160deg, ${theme.emphHi} 0%, ${theme.emphMain} 58%, ${theme.emphSecond} 100%); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; text-shadow:none; filter:drop-shadow(0 2px 10px rgba(0,0,0,0.55)) drop-shadow(0 0 26px ${rgba(theme.emphMain, 0.6)}); }`,
    `.ksub { margin-top:${px(20)}px; font:500 1em/1.5 ${theme.fontStack}; color:${theme.dim}; max-width:44ch; text-shadow:0 2px 18px rgba(0,0,0,0.6); }`,
    `.kchips { display:flex; gap:${px(12)}px; margin-top:${px(28)}px; flex-wrap:wrap; }`,
    `.kchip { display:inline-flex; align-items:center; gap:${px(9)}px; padding:${px(9)}px ${px(16)}px; border-radius:999px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.10); backdrop-filter:blur(8px); color:${theme.ink}; font:600 ${px(15)}px/1 ${theme.fontStack}; letter-spacing:-0.01em; box-shadow:0 6px 24px rgba(0,0,0,0.35); }`,
    `.kchip i { width:${px(8)}px; height:${px(8)}px; border-radius:50%; background:${theme.accent2}; box-shadow:0 0 10px ${theme.accent2}; }`,
    `.kchip:nth-child(2) i { background:${theme.accent3}; box-shadow:0 0 10px ${theme.accent3}; }`,
    `.kchip:nth-child(3) i { background:${theme.accent}; box-shadow:0 0 10px ${theme.accent}; }`,
    `.kmetric { font-family:${theme.displayStack}; font-weight:700; line-height:1; letter-spacing:-0.03em; color:${theme.accent2}; font-size:${px(W >= H ? 190 : 130)}px; text-shadow:0 0 50px ${rgba(theme.accent2, 0.5)},0 4px 24px rgba(0,0,0,0.6); display:flex; align-items:baseline; }`,
    `.kmpre { font-size:0.5em; color:${theme.ink}; margin-right:0.12em; }`,
    `.kmsuf { font-size:0.6em; color:${theme.accent}; margin-left:0.04em; }`,
    `.kmlabel { margin-top:${px(10)}px; font-family:${theme.displayStack}; font-weight:600; font-size:${px(W >= H ? 52 : 36)}px; color:${theme.ink}; letter-spacing:-0.02em; text-shadow:0 2px 14px rgba(0,0,0,0.7); }`,
    `.kchrome { position:absolute; inset:0; z-index:9; pointer-events:none; font-family:${theme.monoStack}; }`,
    `.kcat { position:absolute; left:${W >= H ? 58 : 40}px; bottom:42px; font-size:${px(12)}px; letter-spacing:.2em; text-transform:uppercase; color:rgba(246,248,255,0.55); }`,
    `.kcount { position:absolute; right:${W >= H ? 58 : 40}px; bottom:42px; font-size:${px(12)}px; letter-spacing:.2em; color:${theme.accent2}; }`,
    `.kbar { position:absolute; left:0; right:0; bottom:0; height:2px; background:rgba(255,255,255,0.07); }`,
    `.kbarfill { display:block; height:100%; width:100%; transform-origin:left; transform:scaleX(0); background:linear-gradient(90deg, ${theme.accent}, ${theme.accent2}); box-shadow:0 0 14px ${theme.accentGlow}; }`,
    `</style>`, `</head>`, `<body>`,
    `<div id="root" data-composition-id="vid" data-start="0" data-width="${W}" data-height="${H}" data-duration="${D}">`,
    bodyHtml.join("\n"),
    `</div>`,
    `<script type="module">`,
    moduleSrc,
    `</script>`, `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: dims.fps || 30, duration: D });
  return { indexHtml, metaJson };
}

module.exports = { buildComposition };
