// THREE.JS COMPOSER — cinematic 3D/WebGL compositions from a storyboard.
// Same envelope as scene_kit (buildComposition -> {indexHtml, metaJson}) so it
// drops into the render pipeline (opt-in via render3d; scene-kit stays default).
//
// Renders through the pipeline's HyperFrames headless Chromium (software WebGL,
// verified). A full-bleed <canvas> runs the scene; the WHOLE animation is driven
// off the single paused GSAP timeline HyperFrames seeks (window.__timelines["vid"])
// — tl.to({onUpdate:()=>render3d(tl.time())}) re-renders every frame-seek, so it's
// deterministic. Crisp headline/subtext are DOM overlays ABOVE the canvas.
//
// EXTENSIONS (v2): UnrealBloom post-processing (via EffectComposer) + FIVE distinct
// per-scene 3D TREATMENTS (hero cluster / orbit system / data grid / tunnel /
// burst), each faded in while its scene is on screen so scenes look different.
//
// EXTENSIONS (v3, "html-in-canvas" style — codrops.com/motiontx): a CRT treatment
// that shows the real product screenshot on the screen of a procedural retro
// computer through the ported CRT shader (simplex-noise line jitter, scanlines,
// RGB fringe, barrel curvature, phosphor edge falloff), plus a full-frame FILM
// pass (grain + vignette + a pixelation spike at every scene cut, the demo's
// Pixelation effect used as a transition).
//
// DETERMINISM: object placement uses a seeded PRNG resolved once at init; the
// per-frame render is pure Math.sin/cos of tl.time() (no Math.random/Date at
// runtime); every shader uniform is a pure function of tl.time().
// Post-processing needs the Three.js addons, so this uses an importmap + ES module.

const { deriveTheme } = require("./scene_kit");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
const THREE_VER = "0.160.0";
const SAFE_FONTS = "Inter, 'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif";

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function r2(n) { return Math.round(n * 1000) / 1000; }
function hexInt(c) { const m = /^#?([0-9a-fA-F]{6})$/.exec(String(c || "").trim()); return m ? parseInt(m[1], 16) : 0x7CC4FF; }
function hashSeed(s) { let h = 2166136261; const str = String(s || ""); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// --- color helpers: make pack accents legible on the DARK 3D ground -----------
// deriveTheme() picks accents to contrast the pack's OWN ground (often light —
// e.g. Bauhaus parchment), but the 3D composer ALWAYS renders on a dark ground,
// so a dark accent (a navy or a deep red) collapses into black and the emphasis
// word vanishes. neonize() lifts an accent's lightness — hue and vividness kept
// — until it clears a strong luminance floor over the ground; already-bright
// accents (cyan, mint) clear it immediately and pass through unchanged.
function hexToRgb(h) { const n = parseInt(String(h).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex(r, g, b) { const f = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"); return `#${f(r)}${f(g)}${f(b)}`; }
function lum(h) { const [r, g, b] = hexToRgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function rgbToHsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; let h = 0, s = 0; if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; } return [h, s, l]; }
function hslToRgb(h, s, l) { if (!s) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const hue = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255]; }
function neonize(hex, ground) {
  if (!/^#?[0-9a-fA-F]{6}$/.test(String(hex || "").trim())) return hex;
  const gl = lum(ground);
  let [h, s, l] = rgbToHsl(...hexToRgb(hex));
  s = Math.max(s, 0.78);                        // punchy neon, not a pastel wash
  let out = rgbToHex(...hslToRgb(h, s, l)), guard = 0;
  // raise lightness until the accent is clearly brighter than the dark ground,
  // capped so a luminance-poor hue (deep blue/red) brightens without going white.
  while (guard++ < 26 && lum(out) - gl < 114 && l < 0.68) { l += 0.03; out = rgbToHex(...hslToRgb(h, s, l)); }
  return out;
}

function headlineSpans(headline, emphasis) {
  const words = String(headline || "").trim().split(/\s+/).filter(Boolean);
  const emph = String(emphasis || "").trim().toLowerCase().split(/\s+/);
  return words.map((w) => {
    const isE = emph.includes(w.toLowerCase().replace(/[.,!?]/g, ""));
    return `<span class="kfw${isE ? " kfacc" : ""}">${esc(w)}</span>`;
  }).join(" ");
}

// Deep cinematic theme (3D reads best dark); accent colors from the pack/storyboard.
function theme3d(framePack, sb) {
  const base = deriveTheme(framePack, sb);
  const rawAccents = (base.accents && base.accents.length ? base.accents : ["#7CC4FF", "#FF7DB4", "#FFC878"]).slice(0, 3);
  // Pack-aware 3D ground (Phase 3): the pack's authored camera3d.ground — its OWN
  // branded dark — instead of one generic #05060E for every light pack. 3D still
  // reads dark; each pack keeps its identity (navy for summit, indigo for
  // biennale, plum for bloom…). Falls back to the pack's dark ground, then #05060E.
  const cam = (base.manifest && base.manifest.camera3d) || null;
  const ground = (cam && cam.ground) || (base.isDark && /^#/.test(base.ground) ? base.ground : "#05060E");
  // Brighten the accents FOR THIS DARK GROUND so the emphasis word + kicker read
  // (and the emissive 3D shapes glow harder). Hue is preserved — a Bauhaus navy
  // becomes a bright cobalt, a deep red a warm coral, cyan stays cyan.
  const accents = rawAccents.map((a) => neonize(a, ground));
  return {
    ground, ink: "#FFFFFF", dim: "rgba(255,255,255,0.66)",
    accents, accent: accents[0], accent2: accents[1] || accents[0], accent3: accents[2] || accents[0],
    accentGlow: rgba(accents[0], 0.5),
    // Body stays neutral; headline words (.kfw) render in the pack DISPLAY face —
    // deriveTheme already resolved displayStack + the @font-face to inject.
    fontStack: SAFE_FONTS,
    displayStack: base.displayStack || SAFE_FONTS,
    fontFace: base.fontFace || "",
    panel: "rgba(255,255,255,0.06)", line: "rgba(255,255,255,0.14)",
  };
}

// Choose a 3D treatment per scene: hook→hero, cta→burst, middle→rotate
// orbit/crt/reveal/tunnel/grid (crt = the html-in-canvas retro-computer showcase).
function treatmentFor(scene, i, total, seed) {
  const k = String(scene.kind || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title") return "hero";
  if (i === total - 1 || k === "cta") return "burst";
  if (k === "chart" || k === "countdown" || /\d/.test(`${scene.headline || ""}${scene.emphasis || ""}`)) return "grid";
  const rot = ["orbit", "crt", "reveal", "tunnel", "grid"];
  return rot[(seed + i) % rot.length];
}

// ---- per-scene DOM text overlay (crisp, above the canvas) --------------------
function sceneOverlay(scene, i, total, ctx) {
  const { theme, dims, T, L } = ctx;
  const id = `s${i + 1}`;
  const isHook = i === 0, isCta = i === total - 1;
  const land = dims.width >= dims.height;
  const big = isHook ? (land ? 96 : 70) : isCta ? (land ? 82 : 62) : (land ? 64 : 50);
  // Emphasis word: a SOLID neon fill + layered glow. A background-clip:text
  // gradient is fragile over a busy 3D backdrop — under a filter the transparent
  // fill drops out and the dark 3D shapes show THROUGH the glyphs (the emphasis
  // word vanishes). A solid bright color is opaque, always legible, and the
  // neon halo (accent glow) + a dark drop keep it reading as a cinematic accent.
  const accentText = `color:${theme.accent};text-shadow:0 0 0.11em ${theme.accentGlow},0 0 0.4em ${theme.accentGlow},0 0.03em 0.11em rgba(0,0,0,0.92);`;
  const wrap = (isHook || isCta)
    ? `position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 9%;`
    : `position:absolute;left:0;right:0;bottom:8.5%;display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 9%;`;
  const kicker = isHook ? (ctx.title || "") : (scene.emphasis || "");
  const parts = [];
  parts.push(`<div id="${id}" class="kf-txt clip" data-start="${T}" data-duration="${L}" data-track-index="${10 + i}" data-layout-allow-occlusion style="opacity:0;">`);
  // Legibility scrim: a soft dark radial behind the headline so a bright, glowing
  // 3D shape sitting directly behind centered text can't wash it out. Positioned
  // where the text lands (centered for hook/CTA, lower-third for interior scenes);
  // ink is always white in this composer, so darkening the region always helps.
  const scrimAt = (isHook || isCta) ? "50% 50%" : "50% 84%";
  const scrimShape = (isHook || isCta) ? "58% 46%" : "68% 34%";
  parts.push(`  <div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse ${scrimShape} at ${scrimAt},rgba(0,0,0,0.64),rgba(0,0,0,0.32) 48%,transparent 72%);"></div>`);
  parts.push(`  <div style="${wrap}">`);
  if (kicker) parts.push(`    <span id="${id}k" style="opacity:0;display:inline-flex;align-items:center;gap:9px;margin-bottom:18px;padding:8px 17px;border-radius:9999px;background:${theme.panel};border:1px solid ${theme.line};color:${theme.accent};font:700 14px/1 ${theme.fontStack};letter-spacing:.24em;text-transform:uppercase;"><span style="width:8px;height:8px;border-radius:50%;background:${theme.accent};"></span>${esc(kicker)}</span>`);
  parts.push(`    <h1 style="margin:0;font:800 ${big}px/1.02 ${theme.fontStack};letter-spacing:-0.02em;color:${theme.ink};max-width:${land ? "17ch" : "13ch"};text-shadow:0 2px 10px rgba(0,0,0,0.9),0 6px 44px rgba(0,0,0,0.6);"><style>#${id} .kfacc{${accentText}}</style>${headlineSpans(scene.headline, scene.emphasis)}</h1>`);
  if (scene.subtext) parts.push(`    <p id="${id}s" style="opacity:0;margin-top:16px;font:500 ${Math.round(big * 0.32)}px/1.45 ${theme.fontStack};color:${theme.dim};max-width:44ch;text-shadow:0 2px 20px rgba(0,0,0,0.55);">${esc(scene.subtext)}</p>`);
  parts.push(`  </div>`);
  parts.push(`</div>`);

  const s = [];
  s.push(`tl.set("#${id}",{opacity:1},${T});`);
  if (kicker) s.push(`tl.fromTo("#${id}k",{opacity:0,y:16},{opacity:1,y:0,duration:0.5},${r2(T + 0.2)});`);
  s.push(`tl.fromTo("#${id} .kfw",{yPercent:90,opacity:0,filter:"blur(9px)"},{yPercent:0,opacity:1,filter:"blur(0px)",duration:0.62,stagger:0.07,ease:"power3.out"},${r2(T + 0.35)});`);
  if (scene.subtext) s.push(`tl.fromTo("#${id}s",{opacity:0,y:18},{opacity:1,y:0,duration:0.5},${r2(T + 0.95)});`);
  if (!isCta) { s.push(`tl.to("#${id}",{opacity:0,duration:0.4,ease:"power2.in"},${r2(T + L - 0.4)});`); s.push(`tl.set("#${id}",{opacity:0},${r2(T + L)});`); }
  return { html: parts.join("\n"), script: s.join("\n") };
}

// ---- the Three.js module (bloom + film pass + treatments; deterministic) -----
function threeModule(theme, dims, D, seed, sceneWindows, plateTex, screenTitle) {
  const W = dims.width, H = dims.height;
  const C = theme.accents.map(hexInt);
  const ground = hexInt(theme.ground);
  return `
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const W=${W},H=${H},D=${D};
const C=[${C.map((c) => "0x" + c.toString(16)).join(",")}];
const PLATE_TEX=${JSON.stringify(plateTex || null)}; // real screenshot for the CRT/reveal, or null
const SCREEN_TITLE=${JSON.stringify(String(screenTitle || "KEYFRAME").slice(0, 42))};
// seeded PRNG (mulberry32) — deterministic object placement, no Math.random.
let __s=${seed}>>>0; function rand(){__s|=0;__s=(__s+0x6D2B79F5)|0;let t=Math.imul(__s^(__s>>>15),1|__s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;}

const cv=document.getElementById("kfcanvas");
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
renderer.setSize(W,H,false); renderer.setClearColor(${ground},1);
const scene=new THREE.Scene(); scene.fog=new THREE.FogExp2(${ground},0.03);
const cam=new THREE.PerspectiveCamera(52,W/H,0.1,200); cam.position.set(0,0,8);
scene.add(new THREE.AmbientLight(0xffffff,0.5));
const l1=new THREE.DirectionalLight(C[0],1.4); l1.position.set(4,5,6); scene.add(l1);
const l2=new THREE.PointLight(C[1%C.length],1.3,80); l2.position.set(-6,-2,5); scene.add(l2);

// ---- the CRT screen shader (ported from html-in-canvas / codrops, toned down
// for product footage: line jitter + scanlines + RGB fringe + curvature + edge
// falloff; the heavy full-screen static of the demo is reduced to a whisper).
const CRT_FRAG=\`
uniform sampler2D map; uniform float uTime; uniform float curve; uniform float uFade; varying vec2 vUv;
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
float snoise(vec2 v){const vec4 Cc=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);vec2 i=floor(v+dot(v,Cc.yy));vec2 x0=v-i+dot(i,Cc.xx);vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);vec4 x12=x0.xyxy+Cc.xxzz;x12.xy-=i1;i=mod289(i);vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);m=m*m;m=m*m;vec3 x=2.0*fract(p*Cc.www)-1.0;vec3 h=abs(x)-0.5;vec3 ox=floor(x+0.5);vec3 a0=x-ox;m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.0*dot(m,g);}
float rnd(vec2 co){return fract(sin(dot(co.xy,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec2 uv=vUv;
  vec2 cu=uv*2.0-1.0; vec2 off=cu.yx*curve; cu+=cu*off*off; cu=cu*0.5+0.5; uv=cu;
  float time=uTime*2.0;
  float noise=max(0.0,snoise(vec2(time,uv.y*0.3))-0.3)*(1.0/0.95);
  noise=noise+(snoise(vec2(time*10.0,uv.y*2.4))-0.5)*0.05;
  float xpos=uv.x-noise*noise*0.06;
  vec4 col=texture2D(map,vec2(xpos,uv.y));
  col.rgb=mix(col.rgb,vec3(rnd(vec2(uv.y*time))),noise*0.18);
  if(floor(mod(gl_FragCoord.y*0.5,2.0))==0.0){col.rgb*=0.93;}
  col.g=mix(col.r,texture2D(map,vec2(xpos+0.0016,uv.y)).g,0.35);
  col.b=mix(col.r,texture2D(map,vec2(xpos-0.0016,uv.y)).b,0.35);
  vec2 edge=smoothstep(0.0,0.05,cu)*(1.0-smoothstep(0.95,1.0,cu));
  col.rgb*=edge.x*edge.y;
  col.rgb=mix(col.rgb,vec3(rnd(vec2(uv.y*time))),0.04);
  gl_FragColor=vec4(col.rgb*1.12*uFade,uFade);
}\`;
const CRT_VERT="varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}";

// Deterministic fallback screen (no screenshot): a drawn retro desktop.
function drawScreenFallback(){
  const c=document.createElement("canvas"); c.width=760; c.height=570; const x=c.getContext("2d");
  x.fillStyle="#0d1420"; x.fillRect(0,0,760,570);
  x.fillStyle="#e9e4d8"; x.fillRect(0,0,760,34);
  x.fillStyle="#0d1420"; x.font="700 17px monospace"; x.fillText("\\u25A0  File  Edit  View  Special",14,23);
  x.strokeStyle="#e9e4d8"; x.lineWidth=3; x.strokeRect(56,70,648,440);
  x.fillStyle="#e9e4d8"; x.fillRect(56,70,648,40);
  x.fillStyle="#0d1420"; x.font="700 19px monospace";
  x.fillText(SCREEN_TITLE.toUpperCase().slice(0,34),76,97);
  const col="#"+("00000"+C[0].toString(16)).slice(-6);
  x.fillStyle=col; x.font="800 44px monospace";
  const words=SCREEN_TITLE.split(" "); let yy=190;
  for(let i=0;i<Math.min(3,words.length);i++){x.fillText(words.slice(i,i+3).join(" ").slice(0,22),88,yy); yy+=62; i+=2;}
  x.fillStyle="rgba(233,228,216,0.75)"; x.font="17px monospace";
  for(let i=0;i<6;i++){const wln=520-((i*97)%260); x.fillRect(88,330+i*26,wln,9);}
  x.fillStyle=col; x.fillRect(88,472,190,30);
  return new THREE.CanvasTexture(c);
}
let screenTex;
if(PLATE_TEX){screenTex=new THREE.TextureLoader().load(PLATE_TEX);if("SRGBColorSpace" in THREE)screenTex.colorSpace=THREE.SRGBColorSpace;}
else{screenTex=drawScreenFallback();}
const crtMat=new THREE.ShaderMaterial({vertexShader:CRT_VERT,fragmentShader:CRT_FRAG,transparent:true,uniforms:{map:{value:screenTex},uTime:{value:0},curve:{value:0.22},uFade:{value:1}}});

// ---- post-processing: bloom, then the FILM pass (grain + vignette + a
// pixelation spike at scene cuts — the demo's Pixelation effect as transition).
const composer=new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,cam));
// bloom is retuned per frame: gentle on showcase scenes (crt/reveal — a large
// bright screenshot would detonate it), punchy on the abstract neon scenes.
const bloomPass=new UnrealBloomPass(new THREE.Vector2(W,H),1.1,0.72,0.3);
composer.addPass(bloomPass);
const filmPass=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uTime:{value:0},uPix:{value:0}},
  vertexShader:CRT_VERT,
  fragmentShader:\`
uniform sampler2D tDiffuse; uniform float uTime; uniform float uPix; varying vec2 vUv;
float rnd(vec2 co){return fract(sin(dot(co.xy,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec2 uv=vUv;
  if(uPix>0.5){vec2 g=vec2(uPix)/vec2(\${W}.0,\${H}.0);uv=(floor(vUv/g)+0.5)*g;}
  vec4 c=texture2D(tDiffuse,uv);
  c.rgb+=(rnd(vUv*vec2(\${W}.0,\${H}.0)+vec2(mod(uTime,7.0)*13.7))-0.5)*0.055;
  float d=distance(vUv,vec2(0.5));
  c.rgb*=1.0-smoothstep(0.5,0.98,d)*0.42;
  gl_FragColor=c;
}\`,
});
composer.addPass(filmPass);

// persistent atmospheric starfield (always on, subtle)
const N=460, PP=new Float32Array(N*3), CC=new Float32Array(N*3);
for(let i=0;i<N;i++){PP[i*3]=(rand()-0.5)*38;PP[i*3+1]=(rand()-0.5)*22;PP[i*3+2]=(rand()-0.5)*30-6;const col=new THREE.Color(C[i%C.length]);CC[i*3]=col.r;CC[i*3+1]=col.g;CC[i*3+2]=col.b;}
const pg=new THREE.BufferGeometry(); pg.setAttribute("position",new THREE.BufferAttribute(PP,3)); pg.setAttribute("color",new THREE.BufferAttribute(CC,3));
const points=new THREE.Points(pg,new THREE.PointsMaterial({size:0.08,vertexColors:true,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false}));
scene.add(points);

function mat(col,emi,wire){return new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:emi,metalness:0.4,roughness:0.3,wireframe:!!wire,transparent:true,opacity:1});}

// ---- treatment builders (once) ----
function buildHero(g){const S=["ico","knot","octa"];for(let i=0;i<3;i++){const geo=S[i]==="knot"?new THREE.TorusKnotGeometry(0.5,0.18,110,16):S[i]==="octa"?new THREE.OctahedronGeometry(0.85,0):new THREE.IcosahedronGeometry(0.85,0);const wire=i===1;const m=new THREE.Mesh(geo,mat(C[i%C.length],wire?0.85:0.32,wire));m.position.set((rand()-0.5)*5,(rand()-0.5)*2.4,-1-rand()*3);m.userData={sx:0.1+rand()*0.2,sy:0.14+rand()*0.24,ph:rand()*6.28,y0:m.position.y};g.add(m);}}
function buildOrbit(g){const core=new THREE.Mesh(new THREE.IcosahedronGeometry(0.75,1),mat(C[0],0.6,false));g.add(core);g.userData.core=core;const sats=new THREE.Group();for(let i=0;i<10;i++){const a=i/10*6.283;const s=new THREE.Mesh(new THREE.SphereGeometry(0.15,16,16),mat(C[(i+1)%C.length],0.8,false));s.position.set(Math.cos(a)*2.4,Math.sin(a)*1.2,Math.sin(a)*2.4);sats.add(s);}g.add(sats);g.userData.sats=sats;}
function buildTunnel(g){for(let i=0;i<14;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(1.7,0.055,8,64),mat(C[i%C.length],0.9,false));ring.userData.z0=-i*2.2;ring.position.z=ring.userData.z0;g.add(ring);}}
function buildGrid(g){const cols=9,rows=5,bx=new THREE.Group();for(let x=0;x<cols;x++)for(let y=0;y<rows;y++){const b=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.2,0.2),mat(C[(x+y)%C.length],0.55,false));b.position.set((x-(cols-1)/2)*0.56,(y-(rows-1)/2)*0.56,-2);b.userData={x,y};bx.add(b);}bx.rotation.x=-0.5;g.add(bx);g.userData.bx=bx;}
function buildBurst(g){const core=new THREE.Mesh(new THREE.IcosahedronGeometry(0.68,1),mat(C[0],0.85,false));g.add(core);g.userData.core=core;const sh=new THREE.Group();for(let i=0;i<26;i++){const s=new THREE.Mesh(new THREE.TetrahedronGeometry(0.17),mat(C[i%C.length],0.8,false));const d=new THREE.Vector3(rand()-0.5,rand()-0.5,rand()-0.5);if(d.length()<0.01)d.set(1,0,0);d.normalize();s.userData={dir:d,rs:0.2+rand()*0.4};sh.add(s);}g.add(sh);g.userData.sh=sh;}
function buildReveal(g){const plate=new THREE.Mesh(new THREE.BoxGeometry(2.6,1.6,0.16),mat(C[0],0.45,false));g.add(plate);g.userData.plate=plate;let innerMat;if(PLATE_TEX){const tex=new THREE.TextureLoader().load(PLATE_TEX);if("SRGBColorSpace" in THREE)tex.colorSpace=THREE.SRGBColorSpace;innerMat=new THREE.MeshBasicMaterial({map:tex,color:0xc2c2c2,transparent:true,opacity:1});}else{innerMat=mat(C[1%C.length],0.95,false);}const inner=new THREE.Mesh(new THREE.PlaneGeometry(2.3,1.32),innerMat);inner.position.z=0.09;plate.add(inner);const ring=new THREE.Mesh(new THREE.TorusGeometry(2.25,0.05,10,90),mat(C[2%C.length],0.95,false));ring.position.z=-0.6;g.add(ring);g.userData.ring=ring;const orb=new THREE.Group();for(let i=0;i<8;i++){const a=i/8*6.283;const s=new THREE.Mesh(new THREE.OctahedronGeometry(0.14,0),mat(C[i%C.length],0.85,false));s.position.set(Math.cos(a)*3.0,Math.sin(a)*3.0,0.2);orb.add(s);}g.add(orb);g.userData.orb=orb;}
function buildCrt(g){
  // procedural retro computer (the html-in-canvas mac, built from primitives)
  const putty=new THREE.MeshStandardMaterial({color:0xcfc7b6,roughness:0.85,metalness:0.04});
  const dark=new THREE.MeshStandardMaterial({color:0x14161c,roughness:0.5,metalness:0.2});
  const body=new THREE.Group();
  const shell=new THREE.Mesh(new THREE.BoxGeometry(3.5,2.95,2.3),putty); shell.position.z=-1.15; body.add(shell);
  const face=new THREE.Mesh(new THREE.BoxGeometry(3.5,2.95,0.22),putty); face.position.z=0.02; body.add(face);
  const bezel=new THREE.Mesh(new THREE.BoxGeometry(2.62,1.98,0.1),dark); bezel.position.set(0,0.28,0.14); body.add(bezel);
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(2.42,1.8),crtMat); screen.position.set(0,0.28,0.2); body.add(screen);
  const slit=new THREE.Mesh(new THREE.BoxGeometry(1.15,0.09,0.05),dark); slit.position.set(0.6,-1.05,0.15); body.add(slit);
  const logo=new THREE.Mesh(new THREE.CircleGeometry(0.07,20),new THREE.MeshBasicMaterial({color:C[0]})); logo.position.set(-1.35,-1.05,0.16); body.add(logo);
  const base=new THREE.Mesh(new THREE.BoxGeometry(2.5,0.34,1.7),putty); base.position.set(0,-1.66,-0.7); body.add(base);
  const kbd=new THREE.Mesh(new THREE.BoxGeometry(3.1,0.16,1.05),putty); kbd.position.set(0,-1.78,1.35); kbd.rotation.x=0.06; body.add(kbd);
  const keys=new THREE.Mesh(new THREE.BoxGeometry(2.8,0.06,0.8),dark); keys.position.set(0,-1.69,1.33); keys.rotation.x=0.06; body.add(keys);
  body.position.y=0.35; g.add(body); g.userData.body=body;
  const glow=new THREE.PointLight(C[0],0.65,7); glow.position.set(0,0.4,2.2); g.add(glow); g.userData.glow=glow;
  // neutral key light so the computer reads warm-putty (the scene's colored
  // lights are tuned for neon shapes); lives in the group → off when hidden.
  const fill=new THREE.DirectionalLight(0xfff3e2,1.35); fill.position.set(2.5,3.5,6); g.add(fill);
  const fill2=new THREE.DirectionalLight(0xffffff,0.5); fill2.position.set(-3,-1,4); g.add(fill2);
}
const BUILD={hero:buildHero,orbit:buildOrbit,tunnel:buildTunnel,grid:buildGrid,burst:buildBurst,reveal:buildReveal,crt:buildCrt};

// ---- treatment updaters (per frame; lt = local scene time) ----
function upHero(t,lt,g){for(let i=0;i<g.children.length;i++){const m=g.children[i],d=m.userData;m.rotation.x=t*d.sx;m.rotation.y=t*d.sy;m.position.y=d.y0+Math.sin(t*0.7+d.ph)*0.4;}cam.position.set(Math.sin(t*0.15)*1.6,Math.sin(t*0.11)*0.8,7-Math.min(lt,4)*0.4);cam.lookAt(0,0,-1);}
function upOrbit(t,lt,g){const s=g.userData.sats,c=g.userData.core;if(s){s.rotation.y=lt*0.8;s.rotation.x=lt*0.3;}if(c){c.rotation.y=lt*0.5;const p=1+Math.sin(lt*2)*0.09;c.scale.setScalar(p);}cam.position.set(Math.sin(lt*0.3)*1.2,0.4,6);cam.lookAt(0,0,0);}
function upTunnel(t,lt,g){const span=14*2.2;for(let i=0;i<g.children.length;i++){const r=g.children[i];if(r.userData.z0===undefined)continue;r.position.z=((r.userData.z0+lt*5)%span+span)%span-span+4;r.rotation.z=lt*0.6+i*0.3;}cam.position.set(Math.sin(lt*0.4)*0.5,Math.sin(lt*0.3)*0.4,3);cam.lookAt(0,0,-10);}
function upGrid(t,lt,g){const bx=g.userData.bx;if(bx){bx.rotation.y=Math.sin(lt*0.3)*0.4;for(let i=0;i<bx.children.length;i++){const b=bx.children[i],d=b.userData;const h=1+(Math.sin(d.x*0.6+d.y*0.4+lt*2.2)+1)*1.1;b.scale.y=h;}}cam.position.set(0,1.4,6);cam.lookAt(0,0,-2);}
function upBurst(t,lt,g){const sh=g.userData.sh,c=g.userData.core;const e=Math.min(lt,2.2);if(sh){sh.rotation.y=lt*0.4;for(let i=0;i<sh.children.length;i++){const s=sh.children[i],d=s.userData;const dist=0.5+e*1.7;s.position.set(d.dir.x*dist,d.dir.y*dist,d.dir.z*dist);s.rotation.x=lt*d.rs*4;s.rotation.y=lt*d.rs*3;}}if(c){c.rotation.y=lt*0.6;c.scale.setScalar(1+Math.sin(lt*3)*0.1);}cam.position.set(0,0,5+Math.min(lt,3)*0.6);cam.lookAt(0,0,0);}
function upReveal(t,lt,g){const plate=g.userData.plate,ring=g.userData.ring,orb=g.userData.orb;const rp=Math.min(lt/1.4,1),e=1-Math.pow(1-rp,3);if(plate){plate.scale.setScalar(0.15+e*0.85);plate.rotation.y=-1.35*(1-e)+(lt>1.4?(lt-1.4)*0.22:0);plate.rotation.x=Math.sin(lt*0.5)*0.06;plate.position.y=Math.sin(lt*0.8)*0.12*e;}if(ring){ring.rotation.z=lt*0.5;ring.scale.setScalar(0.55+e*0.45);}if(orb){orb.rotation.y=lt*0.5;orb.rotation.z=lt*0.2;}cam.position.set(Math.sin(lt*0.2)*0.8,0.2,6.6-e*1.4);cam.lookAt(0,0,0);}
function upCrt(t,lt,g){
  const body=g.userData.body,glow=g.userData.glow;
  if(body){body.rotation.y=Math.sin(lt*0.4)*0.09;body.rotation.x=Math.sin(lt*0.55+1.3)*0.03;body.position.y=0.35+Math.sin(lt*0.8)*0.05;}
  if(glow){glow.intensity=1.4+Math.sin(lt*2.1)*0.35;}
  const e=1-Math.pow(1-Math.min(lt/2.4,1),3); // slow dolly-in on the screen
  cam.position.set(Math.sin(lt*0.22)*0.7,0.35+Math.sin(lt*0.17)*0.2,7.2-e*1.5);
  cam.lookAt(0,0.3,0);
}
const UPDATE={hero:upHero,orbit:upOrbit,tunnel:upTunnel,grid:upGrid,burst:upBurst,reveal:upReveal,crt:upCrt};

// ---- build one group per scene, keyed by treatment ----
const SCENES=${JSON.stringify(sceneWindows)};
for(const sc of SCENES){const g=new THREE.Group();(BUILD[sc.type]||buildHero)(g);g.visible=false;sc.group=g;scene.add(g);}

// Crossfade CENTERED on the cut (both scenes ~50% at the boundary) so the
// pixelation transition never lands on a black frame. First/last scene edges
// stay fully opaque.
function winOpacity(t,s,e){
  if(t<s-0.221||t>e+0.221)return 0;
  const a=s<=0.01?1:Math.min(1,(t-(s-0.22))/0.44);
  const b=e>=D-0.01?1:Math.min(1,((e+0.22)-t)/0.44);
  return Math.max(0,Math.min(a,b));
}
function setOpacity(g,o){g.visible=o>0.01;g.traverse((obj)=>{if(!obj.material)return;if(obj.material.uniforms&&obj.material.uniforms.uFade){obj.material.uniforms.uFade.value=o;}else{obj.material.opacity=o;obj.material.transparent=true;}});}

function render3d(t){
  points.rotation.y=t*0.03; points.rotation.x=Math.sin(t*0.06)*0.1;
  // shader clocks (pure functions of timeline time — deterministic per frame)
  crtMat.uniforms.uTime.value=t;
  filmPass.uniforms.uTime.value=t;
  // pixelation spike at every scene cut (the demo's Pixelation effect as transition)
  let pix=0;
  for(const sc of SCENES){if(sc.start>0.01){const x=Math.abs(t-sc.start);if(x<0.24)pix=Math.max(pix,(1-x/0.24)*22);}}
  filmPass.uniforms.uPix.value=pix;
  let active=SCENES[0];
  for(const sc of SCENES){const o=winOpacity(t,sc.start,sc.end);setOpacity(sc.group,o);if(t>=sc.start&&t<sc.end)active=sc;}
  // gentle bloom while a screenshot is on screen; restrained on the abstract
  // neon scenes too — a strength-1.1/threshold-0.3 bloom lit the whole frame and
  // the emissive shapes bled THROUGH the headline overlay, washing the text out
  // (reported: "so much glowing colour the text isn't visible"). Lower strength +
  // a higher threshold so only the very brightest neon blooms, not every shape.
  const showcase=active.type==="crt"||active.type==="reveal";
  bloomPass.strength=showcase?0.32:0.6;
  bloomPass.threshold=showcase?0.6:0.48;
  (UPDATE[active.type]||upHero)(t,t-active.start,active.group);
  composer.render();
}
render3d(0);

const tl=gsap.timeline({paused:true,defaults:{ease:"power3.out"}});
tl.to({v:0},{v:1,duration:D,ease:"none",onUpdate:()=>render3d(tl.time())},0);
__OVERLAY_TWEENS__
window.__timelines=window.__timelines||{}; window.__timelines["vid"]=tl;
`;
}

function buildComposition({ storyboard, dims, framePack, captionCues, assets } = {}) {
  const sb = storyboard || {};
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length ? sb.scenes : [{ id: "s1", start: 0, duration: 6, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r2(sb.durationSec || scenes.reduce((a, s) => a + (s.duration || 0), 0) || 12);
  const W = dims.width, H = dims.height;
  const theme = theme3d(framePack, sb);
  const seed = hashSeed(`${sb.title || ""}|${scenes.length}|3d`);

  // The real website screenshot (if any) becomes the texture on the reveal plate,
  // so the product reveal shows the actual product — not a stylized card. Prefer a
  // website screenshot; fall back to the first image asset; else a stylized screen.
  const pool = (assets || []).filter((a) => a && a.path && !/\.(mp4|webm|mov)$/i.test(a.path));
  const websiteShot = pool.find((a) => a.source === "website" || /screenshot|webpage|landing/i.test(a.alt || ""));
  // Prefer vision-VERIFIED stock over a blind pool[0] — the plate is the most
  // prominent asset slot in the 3D film, same eligibility bar as scene-kit.
  const shot = websiteShot || pool.find((a) => a.visionOk === true) || pool[0] || null;
  const plateTex = shot ? shot.path : null;

  // Per-scene time windows + treatment type (literal, for the module).
  let cursor = 0;
  const sceneWindows = scenes.map((scene, i) => {
    const start = r2(scene.start != null ? scene.start : cursor);
    const dur = r2(scene.duration || 4);
    cursor = r2(cursor + dur);
    return { type: treatmentFor(scene, i, scenes.length, seed), start, end: r2(start + dur) };
  });

  // GUARANTEE the site is showcased: for a website→3D video the screenshot is the
  // whole point, but treatmentFor()'s seed rotation can skip the showcase scenes
  // entirely (e.g. two middle scenes both land on "grid"). If we have a real
  // website screenshot yet no scene shows it, promote the longest interior scene
  // to "crt" — the html-in-canvas retro computer with the product on its screen.
  if (websiteShot && sceneWindows.length >= 3 && !sceneWindows.some((w) => w.type === "crt" || w.type === "reveal")) {
    let best = 1, bestLen = -1;
    for (let i = 1; i < sceneWindows.length - 1; i++) {
      const len = sceneWindows[i].end - sceneWindows[i].start;
      if (len > bestLen) { bestLen = len; best = i; }
    }
    sceneWindows[best].type = "crt";
  }

  const bodyHtml = [`<canvas id="kfcanvas" class="clip" data-start="0" data-duration="${D}" data-track-index="0" width="${W}" height="${H}"></canvas>`];
  const overlayTweens = [];
  scenes.forEach((scene, i) => {
    const w = sceneWindows[i];
    const ov = sceneOverlay(scene, i, scenes.length, { theme, dims, T: w.start, L: r2(w.end - w.start), title: sb.title });
    bodyHtml.push(ov.html);
    overlayTweens.push(`// ${scene.id || "s" + (i + 1)}`, ov.script);
  });

  const moduleSrc = threeModule(theme, dims, D, seed, sceneWindows, plateTex, sb.title).replace("__OVERLAY_TWEENS__", overlayTweens.join("\n"));

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
    `.kf-txt { position:absolute; inset:0; z-index:10; }`,
    // Headline words render in the pack DISPLAY face (Phase 3 typography fix).
    `.kfw { display:inline-block; font-family:${theme.displayStack}; }`,
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
