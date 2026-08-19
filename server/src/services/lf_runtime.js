// LF RUNTIME — the browser-side half of the long-form port.
//
// WHY THIS EXISTS AT ALL, AND WHY IT IS NOT A PILE OF GSAP TWEENS.
//
// A FilmKit template separates structure from motion: `film_beats` emits HTML once and GSAP
// tweens it. The long-form kit does not work that way. Every one of its sixty renderers is a
// pure function of scene-local progress that returns the WHOLE frame — `Open` computes each
// letter's y-offset and rotation from `seg(p, …)`, `Tally` computes how many marks are
// scratched in, `Gauge` computes the needle angle. There is no entrance to lift out and no
// resting state to tween towards; the function IS the animation.
//
// So the port hosts them the way film_stage already hosts `World` and its ten mechanics:
// the AUTHORED FUNCTION is embedded and re-evaluated per seek. Two consequences worth being
// explicit about, because they are the whole argument for this file:
//
//   • It is a TRANSCRIPTION, not a reinterpretation. Re-expressing `Open`'s per-letter
//     `seg(PACE(p), a, b)` windows as a GSAP stagger would be a designer's judgement about
//     which easing "looks the same", applied sixty times. The brief forbids exactly that.
//   • It is seek-EXACT rather than seek-safe. Scrub backwards and the tally un-scratches,
//     because the renderer is recomputed from `p` and holds no state between frames.
//
// THE SAME SOURCE IS EVALUATED TWICE, which is what keeps the static document honest:
//
//   build time   `renderToHtml(fn, …)` runs the renderer against an HTML-string shim at its
//                settled progress and emits real markup — so a scene block contains real text
//                before a single frame is seeked. Without this the document would be forty
//                empty divs, `test:ghosts` and `test:frame-fill` would both be right to fail
//                it, and a render that never reached the timeline would ship blank.
//   render time  `LFR(...)` runs the identical function against a live DOM shim and swaps the
//                scene's subtree.
//
// One paused GSAP timeline still drives everything: a single proxy tween's onUpdate resolves
// the active scene, recomputes it, recomputes the world, and moves the caption. No rAF, no
// wall clock, no state that survives a seek.

// The SVG element shim is SHARED with film_runtime rather than copied. It is a pure
// React.createElement -> DOM translation with no FilmKit semantics in it (an attribute-name
// table and a child flattener), and the failure this avoids is the one the Phase 0 report
// named as the standing risk of a second engine: a fix applied to one shim and forgotten in
// the other. `test-lf-packs.js` evaluates all 27 authored Worlds through the emitted shim, so
// a FilmKit-motivated edit that breaks long-form fails a long-form test rather than shipping.
const { SVG_SHIM } = require("./film_runtime");

// ---------------------------------------------------------------- the element shim
// The long-form renderers emit HTML (positioned divs carrying style objects) as well as SVG,
// which is the one place they differ from a World. `LFR` therefore dispatches on tag name:
// anything in SVG_TAGS is created in the SVG namespace and handed to the shared attribute
// path, everything else is an HTML element whose `style` object is applied as CSS.
const ELEMENT_SHIM = `
var LFSVG={svg:1,g:1,path:1,rect:1,circle:1,ellipse:1,line:1,polyline:1,polygon:1,text:1,tspan:1,
defs:1,clipPath:1,mask:1,linearGradient:1,radialGradient:1,stop:1,use:1,pattern:1,filter:1,
feGaussianBlur:1,feOffset:1,feMerge:1,feMergeNode:1,image:1,foreignObject:1,marker:1,symbol:1};
// React camelCase style key -> CSS property. Anything already hyphenated passes through, and
// a numeric value on a length-ish property gets "px" the way React does — the renderers rely
// on that (they write fontSize: 210, not "210px").
var LFUNITLESS={opacity:1,zIndex:1,fontWeight:1,lineHeight:1,flex:1,flexGrow:1,flexShrink:1,
order:1,zoom:1,tabSize:1,columnCount:1,fillOpacity:1,strokeOpacity:1,strokeWidth:1,aspectRatio:1};
function LFcss(k){return k.replace(/[A-Z]/g,function(m){return "-"+m.toLowerCase();});}
function LFval(k,v){return (typeof v==="number"&&!LFUNITLESS[k])?(v+"px"):String(v);}
function LFappend(el,ch){
  if(ch==null||ch===false||ch===true)return;
  if(Array.isArray(ch)){for(var i=0;i<ch.length;i++)LFappend(el,ch[i]);return;}
  if(ch&&ch.__fkel){el.appendChild(ch.node);return;}
  if(ch&&ch.nodeType){el.appendChild(ch);return;}
  el.appendChild(document.createTextNode(String(ch)));
}
function LFR(type,props){
  var tag=(typeof type==="string")?type:"div";
  if(LFSVG[tag])return R.apply(null,arguments);
  var node=document.createElement(tag);
  if(props){
    for(var k in props){
      if(!Object.prototype.hasOwnProperty.call(props,k))continue;
      if(k==="key"||k==="children"||k==="ref")continue;
      var v=props[k];
      if(v==null||v===false)continue;
      if(k==="style"&&typeof v==="object"){
        var out="";
        for(var s in v){if(v[s]==null||v[s]===false)continue;out+=LFcss(s)+":"+LFval(s,v[s])+";";}
        node.setAttribute("style",out);continue;
      }
      if(k==="className"){node.setAttribute("class",String(v));continue;}
      node.setAttribute(k,String(v));
    }
  }
  for(var a=2;a<arguments.length;a++)LFappend(node,arguments[a]);
  if(props&&props.children!==undefined)LFappend(node,props.children);
  return {__fkel:true,node:node};
}
LFR.Fragment="div";
`;

// ---------------------------------------------------------------- the utils shim
// Transcribed from lf-kit.js:5-17 with the constants unchanged. These are NOT the FilmKit
// values and must not be unified with them: LF's PACE breaks at 0.18/0.8 where FilmKit's
// breaks at 0.2/0.78, and LF's outBack overshoots at c=1.8 where FilmKit's uses 2.0. Those
// differences are visible in every frame of every scene, so they are quoted here exactly and
// asserted against the source by `npm run test:lf-runtime`.
const LF_UTILS_SHIM = `
function LFclamp01(x){return x<0?0:x>1?1:x;}
function LFlerp(a,b,t){return a+(b-a)*t;}
function LFsegRaw(p,a,b){return LFclamp01((p-a)/(b-a||1e-6));}
function LFPACE(p){return p<=0.18?p*2.78:p<=0.8?0.5+(p-0.18)*0.645:0.9+(p-0.8)*0.5;}
function LFseg(p,a,b){return LFsegRaw(LFPACE(p),a,b);}
var LFease={
  outQuint:function(t){return 1-Math.pow(1-t,5);},
  outCubic:function(t){return 1-Math.pow(1-t,3);},
  inCubic:function(t){return t*t*t;},
  outBack:function(t){var c=1.8;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2);},
  inOut:function(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;},
  outElastic:function(t){return t===0?0:t===1?1:Math.pow(2,-10*t)*Math.sin((t*10-0.75)*2.094)+1;}
};
function LFhexToRgb(h){h=(h||"#000").replace("#","");if(h.length===3)h=h.split("").map(function(c){return c+c;}).join("");var n=parseInt(h,16);return [(n>>16)&255,(n>>8)&255,n&255];}
function rgba(h,a){var c=LFhexToRgb(h);return "rgba("+c[0]+","+c[1]+","+c[2]+","+a+")";}
function LFsplitLines(t){return String(t==null?"":t).split("|");}
function LFwordsOf(s){return String(s||"").trim().split(/\\s+/);}
`;

// ---------------------------------------------------------------- the utils object
// What a World and a renderer both receive as their last argument. lf-kit.js:49-52 hands the
// World exactly {W,H,ease,seg,segRaw,clamp01,lerp,rgba,dark,R}; measured across all 30
// authored Worlds only W, H, dark, ease and clamp01 are ever touched, but the full set is
// supplied because the contract — not the current usage — is what a re-run of the generator
// has to keep satisfying.
const LF_CONTEXT_SHIM = `
// The three type helpers every renderer shares (lf-kit.js:105-108). They travel INSIDE the
// utils object rather than as module globals so a renderer never closes over anything — which
// is the property that lets lf_beats emit all sixty functions by toString and have them behave
// identically in Node and in the browser.
function LFkick(theme,extra){
  var o={display:"inline-block",fontFamily:LFFB,fontWeight:800,fontSize:24,letterSpacing:"0.2em",
    textTransform:"uppercase",padding:"12px 26px",borderRadius:999,background:theme.accent,color:theme.paper};
  if(extra)for(var k in extra)o[k]=extra[k];
  return o;
}
function LFsub(theme,dark,size){
  return {fontFamily:LFFB,fontWeight:600,fontSize:size===undefined?38:size,lineHeight:1.4,
    color:rgba(dark?theme.paper:theme.ink,0.78),maxWidth:1100};
}
function LFttl(theme,dark,size){
  return {fontFamily:LFFH,fontSize:size,lineHeight:1.02,color:dark?theme.paper:theme.ink};
}
function LFutils(dark){
  return {W:LFW,H:LFH,ease:LFease,seg:LFseg,segRaw:LFsegRaw,clamp01:LFclamp01,
          lerp:LFlerp,rgba:rgba,dark:!!dark,R:LFR,
          splitLines:LFsplitLines,wordsOf:LFwordsOf,fitSize:LFfitSize,
          kick:LFkick,sub:LFsub,ttl:LFttl,
          PADX:LFPADX,COLW:LFCOLW,FH:LFFH,FB:LFFB};
}
`;

// ---------------------------------------------------------------- the camera
// Transcribed from lf-kit.js:83-101 with every constant intact. It lives here rather than in a
// renderer because the source applies it in `Frame`, around the scene's children and around
// nothing else: the world, the brand chrome and the garnish all sit OUTSIDE it and do not move.
// Reproducing that layering is the difference between a film whose backdrop is steady under a
// travelling foreground and one where the whole frame slides.
//
// Two details that are easy to lose and visible when lost: the enter/exit windows read the RAW
// progress (segRaw), not the PACE-warped one every renderer uses internally; and the continuous
// drift is added on top of the camera offset, so a scene is never perfectly still.
const LF_CAMERA_SHIM = `
function LFcam(kind,p,t,energy){
  var ein=LFease.outQuint(LFsegRaw(p,0,0.12)),eout=LFease.inCubic(LFsegRaw(p,0.88,1));
  var A=1-ein,B=eout,cx=0,cy=0,cs=1,cr=0;
  if(kind==="pushL"){cx=A*620-B*620;cr=A*2-B*2;}
  else if(kind==="pushR"){cx=-A*620+B*620;cr=-A*2+B*2;}
  else if(kind==="pushU"){cy=A*480-B*480;}
  else if(kind==="pushD"){cy=-A*480+B*480;}
  else if(kind==="drop"){cy=-A*520+B*520;cr=A*-2.5;}
  else if(kind==="hopU"){cy=A*480-B*480;cs=LFlerp(0.94,1,ein);}
  else if(kind==="zoomIn"){cs=LFlerp(1.24,1,ein)*LFlerp(1,0.86,eout);cr=A*-2;}
  else if(kind==="zoomOut"){cs=LFlerp(0.8,1,ein)*LFlerp(1,1.2,eout);cr=A*2;}
  else {cr=A*-5+B*5;cs=LFlerp(1.1,1,ein);}
  var dx=Math.sin(t*0.5)*6*energy+cx,dy=Math.cos(t*0.62)*5*energy+cy;
  var dz=cs*(1+Math.sin(t*0.24)*0.008*energy);
  return "translate("+dx+"px,"+dy+"px) rotate("+cr+"deg) scale("+dz+")";
}
function LFcamFor(i){return LFCAMS[(i*LFCSTRIDE+LFCOFF)%LFCAMS.length];}
`;

// ---------------------------------------------------------------- text fitting
// THE ONE PLACE THE PORT CANNOT BE VERBATIM, AND WHY.
//
// lf-kit.js:23 opens a <canvas> and lf-kit.js:44 calls measureText on it. That is a real
// measurement against a real loaded font, and it is the only DOM- and font-load-dependent
// value in the whole kit: run it before the webfont resolves and every headline is sized for
// the fallback face. The repo already solved this for FilmKit — fonts/font_metrics.js carries
// measured per-character advances for all 140 bundled families, and all 51 the long-form drop
// uses are among them — so the advance is resolved at BUILD time and baked in.
//
// The authored arithmetic is preserved exactly: the same uppercase transform, the same 1.06
// fudge, the same per-line max, the same `Math.max(size*0.5, size*ratio)` floor. Only the
// source of the width changes, from a live canvas to a measured table.
const LF_FIT_SHIM = `
function LFfitSize(text,size,maxW){
  if(!text)return size;
  var ratio=1,lines=LFsplitLines(text);
  for(var i=0;i<lines.length;i++){
    var ln=lines[i].trim();if(!ln)continue;
    var w=LFadvance(ln.toUpperCase())*size*1.06;
    if(w>maxW)ratio=Math.min(ratio,maxW/w);
  }
  return ratio<1?Math.max(size*0.5,size*ratio):size;
}
`;

// The per-character advance table for THIS pack's display face, emitted as a literal by
// lf_stage (it knows the skin). Kept separate from the fitter so the fitter stays constant
// across packs and only the data changes.
function advanceShim(table, avg) {
  return `
var LFADV=${JSON.stringify(table)};
var LFAVG=${Number(avg) || 0.58};
function LFadvance(s){var t=0;for(var i=0;i<s.length;i++){var a=LFADV[s[i]];t+=(a===undefined?LFAVG:a);}return t;}
`;
}

// ---------------------------------------------------------------- the draw loop
// ONE proxy tween drives everything. `LFdraw(now)` is called from its onUpdate and from a
// `hf-seek` listener, and it is a pure function of `now`: it resolves the active scene from
// the emitted bounds table, recomputes that scene's subtree and the world, and moves the
// caption. Nothing accumulates; calling it twice with the same `now` produces the same DOM.
//
// Only the ACTIVE scene is recomputed, not all forty. During a crossfade both the outgoing
// and incoming scene are live, so at most two renderers run per frame — the same order of
// per-frame work film_stage already does for its world.
const LF_DRAW_SHIM = `
var LFLAST={};
function LFdrawScene(i,now){
  var sc=LFSCENES[i];if(!sc)return;
  var host=document.getElementById("lfs"+i);if(!host)return;
  var cam=document.getElementById("lfc"+i);if(!cam)cam=host;
  var p=LFclamp01((now-sc.start)/(sc.duration||1e-6));
  var t=now*LFAMBIENT;
  cam.style.transform=LFcam(LFcamFor(i),p,t,LFTHEME.energy||1);
  var fn=LFBEATS[sc.name];if(!fn)return;
  var tree;
  try{tree=fn({progress:p,index:i,localTime:now-sc.start,scene:sc.data,theme:LFTHEME,t:t,u:LFutils(sc.dark)});}
  catch(e){return;}
  if(!tree||!tree.node)return;
  while(cam.firstChild)cam.removeChild(cam.firstChild);
  cam.appendChild(tree.node);
}
function LFdrawWorld(now,dark){
  // TARGET THE <svg>, NOT ITS WRAPPER. A World returns a <g>, and a <g> appended to an HTML
  // <div> is inert — it parses, it sits in the DOM, and it paints nothing. The first render of
  // this port did exactly that: every frame came out with correct type on a bare ground and no
  // backdrop at all, with no error anywhere to explain it.
  var host=document.getElementById("lf-world-svg");
  if(!host||typeof World!=="function")return;
  var t=now*LFAMBIENT,tree;
  try{tree=World(LFTHEME,t,LFutils(dark));}catch(e){return;}
  while(host.firstChild)host.removeChild(host.firstChild);
  if(tree&&tree.node)host.appendChild(tree.node);
}
function LFactive(now){
  for(var i=0;i<LFSCENES.length;i++){
    var s=LFSCENES[i];
    if(now>=s.start&&now<s.start+s.duration)return i;
  }
  return now<=0?0:LFSCENES.length-1;
}
function LFdraw(now){
  var i=LFactive(now);
  var sc=LFSCENES[i];
  // The world runs UNDER every scene and keeps its own clock across cuts, but a scene that
  // declares world:false hides it rather than stopping it — so the phase is continuous when
  // it comes back, exactly as the source's global clock behaves.
  var wrap=document.getElementById("lf-world");
  if(wrap){wrap.style.opacity=sc&&sc.world===false?"0":"1";}
  if(LFLAST.world!==now){LFdrawWorld(now,sc&&sc.dark);LFLAST.world=now;}
  // ONE CLASS QUERY, NOT N ID LOOKUPS — and the selector is a STRING LITERAL on purpose.
  //
  // scripts/test-ghosts.js exists to catch content that is hidden at birth and never revealed,
  // which is a defect this repo has shipped six times. Its imperative-reveal rule credits a
  // node only when the selector that reaches it appears as a literal inside $() or
  // querySelector(All)(). The first version of this loop resolved each scene with
  // getElementById("lfs" + k) — a concatenation the guard cannot read — so all 27 long-form
  // packs were reported as hiding forty scenes they never reveal. The render was correct; the
  // guard simply had no way to prove it.
  //
  // Writing it as one querySelectorAll(".lf-scene") makes the reveal legible to the guard AND
  // is less work per frame: one selector match instead of forty id lookups, forty times a
  // second. Document order is emission order, so the index still lines up with LFSCENES.
  var hosts=document.querySelectorAll(".lf-scene");
  for(var k=0;k<hosts.length;k++){
    var host=hosts[k];
    var live=(k===i);
    host.style.opacity=live?"1":"0";
    if(live)LFdrawScene(k,now);
  }
  if(sc){
    var g=document.getElementById("lf-ground");
    if(g)g.style.background=sc.bg;
  }
}
`;

// The whole browser payload, in dependency order. lf_stage concatenates this after the
// pack-specific literals (theme, scenes, advance table) and before the timeline.
function runtimeScript({ advanceTable, advanceAvg }) {
  return [
    SVG_SHIM,
    ELEMENT_SHIM,
    LF_UTILS_SHIM,
    advanceShim(advanceTable, advanceAvg),
    LF_FIT_SHIM,
    LF_CONTEXT_SHIM,
    LF_CAMERA_SHIM,
    LF_DRAW_SHIM,
  ].join("\n");
}

// ---------------------------------------------------------------- build-time evaluation
// The SERVER-SIDE twin of LFR: the identical renderer function, run against a shim that
// returns HTML strings instead of DOM nodes. This is what puts real text in the static
// document — see the header. It has to agree with the browser shim on every detail that
// reaches the page (attribute names, the camelCase-to-CSS transform, the px rule for numeric
// values), because a disagreement shows up as a frame that changes the instant the first seek
// lands. `test-lf-packs.js` renders every beat both ways and diffs them.
const SVG_TAGS = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "defs", "clipPath", "mask", "linearGradient", "radialGradient", "stop", "use",
  "pattern", "filter", "feGaussianBlur", "feOffset", "feMerge", "feMergeNode", "image",
  "foreignObject", "marker", "symbol"]);

const UNITLESS = new Set(["opacity", "zIndex", "fontWeight", "lineHeight", "flex", "flexGrow",
  "flexShrink", "order", "zoom", "tabSize", "columnCount", "fillOpacity", "strokeOpacity",
  "strokeWidth", "aspectRatio"]);

// Mirrors FKATTR in film_runtime's SVG_SHIM. Kept as data rather than inherited because the
// server side needs the map itself, not a string of JavaScript that defines it.
const SVG_ATTR = {
  strokeWidth: "stroke-width", strokeLinecap: "stroke-linecap", strokeLinejoin: "stroke-linejoin",
  strokeDasharray: "stroke-dasharray", strokeDashoffset: "stroke-dashoffset", strokeOpacity: "stroke-opacity",
  fillOpacity: "fill-opacity", fillRule: "fill-rule", clipPath: "clip-path", clipRule: "clip-rule",
  textAnchor: "text-anchor", dominantBaseline: "dominant-baseline", alignmentBaseline: "alignment-baseline",
  fontFamily: "font-family", fontSize: "font-size", fontWeight: "font-weight", fontStyle: "font-style",
  letterSpacing: "letter-spacing", markerEnd: "marker-end", markerStart: "marker-start",
  stopColor: "stop-color", stopOpacity: "stop-opacity", xlinkHref: "href",
  vectorEffect: "vector-effect", paintOrder: "paint-order", mixBlendMode: "mix-blend-mode",
  strokeMiterlimit: "stroke-miterlimit",
};

const VOID_HTML = new Set(["img", "br", "hr", "input", "source"]);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const cssName = (k) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
const cssValue = (k, v) => (typeof v === "number" && !UNITLESS.has(k) ? `${v}px` : String(v));

function styleString(obj) {
  let out = "";
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v == null || v === false) continue;
    out += `${cssName(k)}:${cssValue(k, v)};`;
  }
  return out;
}

function childHtml(ch) {
  if (ch == null || ch === false || ch === true) return "";
  if (Array.isArray(ch)) return ch.map(childHtml).join("");
  if (ch && ch.__lfhtml) return ch.html;
  return esc(ch);
}

// The build-time element factory. Same signature as LFR, returns { __lfhtml, html }.
function H(type, props, ...children) {
  const tag = typeof type === "string" ? type : "div";
  const isSvg = SVG_TAGS.has(tag);
  let attrs = "";
  if (props) {
    for (const k of Object.keys(props)) {
      if (k === "key" || k === "children" || k === "ref") continue;
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === "style" && typeof v === "object") { attrs += ` style="${escAttr(styleString(v))}"`; continue; }
      if (k === "className") { attrs += ` class="${escAttr(v)}"`; continue; }
      const name = isSvg ? (SVG_ATTR[k] || k) : k;
      attrs += ` ${name}="${escAttr(v)}"`;
    }
  }
  let inner = children.map(childHtml).join("");
  if (props && props.children !== undefined) inner += childHtml(props.children);
  if (!isSvg && VOID_HTML.has(tag)) return { __lfhtml: true, html: `<${tag}${attrs}>` };
  return { __lfhtml: true, html: `<${tag}${attrs}>${inner}</${tag}>` };
}
H.Fragment = "div";

// The build-time twin of the utils object and the fitter. Same maths, same constants.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const segRaw = (p, a, b) => clamp01((p - a) / (b - a || 1e-6));
const PACE = (p) => (p <= 0.18 ? p * 2.78 : p <= 0.8 ? 0.5 + (p - 0.18) * 0.645 : 0.9 + (p - 0.8) * 0.5);
const seg = (p, a, b) => segRaw(PACE(p), a, b);
const ease = {
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  outBack: (t) => { const c = 1.8; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * 2.094) + 1),
};
function hexToRgb(h) {
  h = String(h || "#000").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
const splitLines = (t) => String(t == null ? "" : t).split("|");
const wordsOf = (s) => String(s || "").trim().split(/\s+/);

// The fitter, build-time side. `advance` is a function from a string to its width in em,
// supplied by lf_stage from fonts/font_metrics.
function makeFitSize(advance) {
  return function fitSize(text, size, maxW) {
    if (!text) return size;
    let ratio = 1;
    for (const raw of splitLines(text)) {
      const ln = raw.trim();
      if (!ln) continue;
      const w = advance(ln.toUpperCase()) * size * 1.06;
      if (w > maxW) ratio = Math.min(ratio, maxW / w);
    }
    return ratio < 1 ? Math.max(size * 0.5, size * ratio) : size;
  };
}

// ---------------------------------------------------------------- compiling authored source
// AN AUTHORED FUNCTION IS SOURCE, NOT A CLOSURE — and that distinction is load-bearing.
//
// In lf-kit.js a World is written inside the kit's own scope, so `R` and `rgba` are free
// identifiers it captures from there. Emitting it verbatim into a skin module (which is the
// whole point — see gen-lf-skins.js) carries the TEXT across but not the scope, so calling
// `SKIN.World(...)` directly throws `R is not defined`. In the browser that never surfaces,
// because the emitted <script> defines R and rgba as globals before the World runs; on the
// build side there are no globals to catch it, which is exactly where it did surface.
//
// The fix is to give the source the scope it was written in, rather than to rewrite the
// source. `compileAuthored` recompiles the authored text with R and rgba as parameters, which
// is the server-side equivalent of what the emitted script already does — and it keeps the
// skin file a pure artifact of data plus verbatim source, with no import of its own.
//
// Verified over all 30 authored Worlds: the complete set of free identifiers is exactly
// {R, rgba}. Anything a future drop adds will fail loudly here at build time rather than
// rendering a blank backdrop behind a try/catch.
const AUTHORED_SCOPE = ["R", "rgba"];
const compiledCache = new WeakMap();

function compileAuthored(fn, scope) {
  const src = typeof fn === "function" ? fn.toString() : String(fn);
  let factory = typeof fn === "function" ? compiledCache.get(fn) : null;
  if (!factory) {
    // eslint-disable-next-line no-new-func
    factory = new Function(...AUTHORED_SCOPE, `"use strict";return (${src});`);
    if (typeof fn === "function") compiledCache.set(fn, factory);
  }
  return factory(scope.R, scope.rgba);
}

// The build-time twin of LFcam. Same constants, same reading of raw vs PACE-warped progress —
// they are asserted identical by test-lf-packs.js, because a camera that disagrees between the
// static document and the first seek shows up as a frame that jumps the instant playback starts.
function camTransform(kind, p, t, energy) {
  const ein = ease.outQuint(segRaw(p, 0, 0.12)), eout = ease.inCubic(segRaw(p, 0.88, 1));
  const A = 1 - ein, B = eout;
  let cx = 0, cy = 0, cs = 1, cr = 0;
  if (kind === "pushL") { cx = A * 620 - B * 620; cr = A * 2 - B * 2; }
  else if (kind === "pushR") { cx = -A * 620 + B * 620; cr = -A * 2 + B * 2; }
  else if (kind === "pushU") { cy = A * 480 - B * 480; }
  else if (kind === "pushD") { cy = -A * 480 + B * 480; }
  else if (kind === "drop") { cy = -A * 520 + B * 520; cr = A * -2.5; }
  else if (kind === "hopU") { cy = A * 480 - B * 480; cs = lerp(0.94, 1, ein); }
  else if (kind === "zoomIn") { cs = lerp(1.24, 1, ein) * lerp(1, 0.86, eout); cr = A * -2; }
  else if (kind === "zoomOut") { cs = lerp(0.8, 1, ein) * lerp(1, 1.2, eout); cr = A * 2; }
  else { cr = A * -5 + B * 5; cs = lerp(1.1, 1, ein); }
  const dx = Math.sin(t * 0.5) * 6 * energy + cx, dy = Math.cos(t * 0.62) * 5 * energy + cy;
  const dz = cs * (1 + Math.sin(t * 0.24) * 0.008 * energy);
  return `translate(${dx}px,${dy}px) rotate(${cr}deg) scale(${dz})`;
}

// Build the utils object a renderer receives at build time — the exact counterpart of
// LFutils() in the browser.
function buildUtils({ W, H: HH, dark, advance, PADX, COLW, FH, FB }) {
  return {
    W, H: HH, ease, seg, segRaw, clamp01, lerp, rgba, dark: !!dark, R: H,
    splitLines, wordsOf, fitSize: makeFitSize(advance), PADX, COLW, FH, FB,
    kick: (theme, extra) => ({ display: "inline-block", fontFamily: FB, fontWeight: 800, fontSize: 24,
      letterSpacing: "0.2em", textTransform: "uppercase", padding: "12px 26px", borderRadius: 999,
      background: theme.accent, color: theme.paper, ...(extra || {}) }),
    sub: (theme, dark2, size = 38) => ({ fontFamily: FB, fontWeight: 600, fontSize: size, lineHeight: 1.4,
      color: rgba(dark2 ? theme.paper : theme.ink, 0.78), maxWidth: 1100 }),
    ttl: (theme, dark2, size) => ({ fontFamily: FH, fontSize: size, lineHeight: 1.02,
      color: dark2 ? theme.paper : theme.ink }),
  };
}

module.exports = {
  runtimeScript,
  // build-time evaluation
  H, buildUtils, makeFitSize, compileAuthored, AUTHORED_SCOPE, camTransform,
  // the shared maths, exported so lf_stage and the tests use ONE definition
  clamp01, lerp, segRaw, PACE, seg, ease, rgba, hexToRgb, splitLines, wordsOf,
  // exposed for the guard that asserts the two shims agree
  __shims: { ELEMENT_SHIM, LF_UTILS_SHIM, LF_FIT_SHIM, LF_CONTEXT_SHIM, LF_CAMERA_SHIM, LF_DRAW_SHIM, advanceShim },
};
