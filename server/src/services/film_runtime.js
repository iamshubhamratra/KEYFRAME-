// FILM RUNTIME — the browser-side half of the FilmKit port.
//
// Everything in this file is emitted as a <script> into the composed document. It exists
// because two parts of a FilmKit template are genuinely PER-FRAME functions and cannot be
// restated as GSAP tweens without becoming an approximation:
//
//   1. THE WORLD. `cfg.World(theme, t, progress, utils)` returns SVG for a given time. All
//      70 packs are pure functions of `t` — verified: zero Math.random, zero Date across
//      every pack file — so the AUTHORED SOURCE is embedded unmodified and re-evaluated on
//      each seek against an SVG-DOM shim. The backdrop is not a reinterpretation of the
//      original; it is the original.
//
//   2. THE INTERACTION MECHANICS. Typing counts characters, Ring sweeps an arc, Scroll
//      travels a list, Cursor walks a path, Morph flips a word. The source computes each
//      from scene-local progress every frame; so does this. That makes them seek-EXACT
//      (scrub backwards and the typewriter un-types) rather than merely seek-safe.
//
// Both are driven from the SAME single proxy tween the captions already use, so the whole
// document still has exactly one paused timeline and no rAF loop.

// The SVG-DOM shim. `R` mirrors React.createElement closely enough for the world sources,
// which use only: element type, a props object (attributes + `key` + `transform`), and
// children (elements, arrays, strings, numbers, null/false).
const SVG_SHIM = `
var FKNS="http://www.w3.org/2000/svg";
// React prop -> SVG attribute. The world sources are written in React's camelCase, so the
// names have to be translated or the attributes are silently ignored by the DOM.
var FKATTR={strokeWidth:"stroke-width",strokeLinecap:"stroke-linecap",strokeLinejoin:"stroke-linejoin",
strokeDasharray:"stroke-dasharray",strokeDashoffset:"stroke-dashoffset",strokeOpacity:"stroke-opacity",
fillOpacity:"fill-opacity",fillRule:"fill-rule",clipPath:"clip-path",clipRule:"clip-rule",
textAnchor:"text-anchor",dominantBaseline:"dominant-baseline",alignmentBaseline:"alignment-baseline",
fontFamily:"font-family",fontSize:"font-size",fontWeight:"font-weight",fontStyle:"font-style",
letterSpacing:"letter-spacing",markerEnd:"marker-end",markerStart:"marker-start",
stopColor:"stop-color",stopOpacity:"stop-opacity",gradientUnits:"gradientUnits",
gradientTransform:"gradientTransform",patternUnits:"patternUnits",spreadMethod:"spreadMethod",
xlinkHref:"href",vectorEffect:"vector-effect",paintOrder:"paint-order",mixBlendMode:"mix-blend-mode",
strokeMiterlimit:"stroke-miterlimit",filterUnits:"filterUnits",maskUnits:"maskUnits",
preserveAspectRatio:"preserveAspectRatio",viewBox:"viewBox"};
function FKappend(el,ch){
  if(ch==null||ch===false||ch===true)return;
  if(Array.isArray(ch)){for(var i=0;i<ch.length;i++)FKappend(el,ch[i]);return;}
  if(ch&&ch.__fkel){el.appendChild(ch.node);return;}
  if(ch&&ch.nodeType){el.appendChild(ch);return;}
  el.appendChild(document.createTextNode(String(ch)));
}
function R(type,props){
  // A Fragment collapses to a <g> — the world sources only ever use fragments to group.
  var tag=(typeof type==="string")?type:"g";
  var node=document.createElementNS(FKNS,tag);
  if(props){
    for(var k in props){
      if(!Object.prototype.hasOwnProperty.call(props,k))continue;
      if(k==="key"||k==="children"||k==="ref")continue;
      var v=props[k];
      if(v==null||v===false)continue;
      if(k==="style"&&typeof v==="object"){for(var s in v){try{node.style[s]=v[s];}catch(e){}}continue;}
      node.setAttribute(FKATTR[k]||k,String(v));
    }
  }
  for(var a=2;a<arguments.length;a++)FKappend(node,arguments[a]);
  if(props&&props.children!==undefined)FKappend(node,props.children);
  return {__fkel:true,node:node};
}
R.Fragment="g";
`;

// The utils object the world sources receive as their 4th argument (`u`). Identical maths
// to film-kit.js so a world's easing and segment calls behave exactly as authored.
const UTILS_SHIM = `
function FKclamp01(x){return x<0?0:x>1?1:x;}
function FKlerp(a,b,t){return a+(b-a)*t;}
function FKsegRaw(p,a,b){return FKclamp01((p-a)/(b-a||1e-6));}
function FKPACE(p){return p<=0.2?p*2.5:p<=0.78?0.5+(p-0.2)*0.41379:0.74+(p-0.78)*1.18182;}
function FKseg(p,a,b){return FKsegRaw(FKPACE(p),a,b);}
var FKease={
  outCubic:function(t){return 1-Math.pow(1-t,3);},
  inCubic:function(t){return t*t*t;},
  outQuint:function(t){return 1-Math.pow(1-t,5);},
  outExpo:function(t){return t>=1?1:1-Math.pow(2,-10*t);},
  outBack:function(t){var c=2.0;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2);},
  inOut:function(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
};
function FKhexToRgb(h){h=(h||"#000").replace("#","");if(h.length===3)h=h.split("").map(function(c){return c+c;}).join("");var n=parseInt(h,16);return [(n>>16)&255,(n>>8)&255,n&255];}
function rgba(h,a){var c=FKhexToRgb(h);return "rgba("+c[0]+","+c[1]+","+c[2]+","+a+")";}
`;

// The ten interaction mechanics, recomputed per seek from scene-local progress. Each reads
// a descriptor emitted at build time and writes only text/width/transform on nodes the beat
// builder already created — no node is created or destroyed at runtime, so a seek can never
// leave a half-built DOM.
const MECHANICS_SHIM = `
function FKq(id){return document.getElementById(id);}
function FKall(sel){return Array.prototype.slice.call(document.querySelectorAll(sel));}
// TYPING / CODE — a character budget spent across one or more lines.
function FKtype(m,p){
  var budget=Math.floor(FKseg(p,m.a,m.b)*m.total);
  var done=budget>=m.total;
  for(var i=0;i<m.lines.length;i++){
    var el=FKq(m.id+"-l"+i);if(!el)continue;
    var len=m.lines[i].length;
    var take=Math.max(0,Math.min(len,budget));budget-=take;
    var txt=m.lines[i].slice(0,take);
    if(el.firstChild&&el.firstChild.nodeType===3){if(el.firstChild.nodeValue!==txt)el.firstChild.nodeValue=txt;}
    else if(el.textContent!==txt)el.textContent=txt;
    // WRITTEN SO A STATIC READER CAN SEE THE REVEAL. Behaviourally identical to the ternary
    // it replaces, but the ghost guard (scripts/test-ghosts.js) verifies that anything hidden
    // at birth is turned back on by a literal \`opacity = "1"\` somewhere — and a caret that
    // only ever gets a computed value is indistinguishable, to that reader, from content the
    // film hides and never shows. Keeping the assignment literal keeps the guard useful.
    var car=FKq(m.id+"-c"+i);
    if(car){ if(!done&&take<len&&take>0){car.style.opacity="1";} else {car.style.opacity="0";} }
  }
  var out=FKq(m.id+"-out");
  if(out){ if(done){out.style.opacity="1";} else {out.style.opacity="0";} }
}
// RING / GAUGE / BAR — one eased sweep to a target.
function FKring(m,p){
  var e=FKease.inOut(FKseg(p,0.14,0.78));
  var n=FKq(m.id+"-n");if(n){var s=String(Math.round(e*m.to));if(n.textContent!==s)n.textContent=s;}
  var arc=FKq(m.id+"-arc");
  if(arc)arc.setAttribute("stroke-dashoffset",String(m.len*(1-e*(m.to/100))));
  var nd=FKq(m.id+"-needle");
  if(nd)nd.setAttribute("transform","rotate("+(-90+e*(m.to/100)*180)+" 280 300)");
  var bar=FKq(m.id+"-bar");
  if(bar)bar.style.height="calc("+(e*m.to)+"% - 8px)";
}
// SCROLL — a list travelling inside its own window, plus the thumb that tracks it.
function FKscroll(m,p){
  var ty=-FKease.inOut(FKseg(p,0.22,0.9))*m.travel;
  var inner=FKq(m.id+"-inner");
  if(inner)inner.style.transform="translateY("+ty+"px)";
  var th=FKq(m.id+"-thumb");
  if(th)th.style.top=((m.travel?(-ty/m.travel):0)*(100-m.thumb))+"%";
}
// SCROLL:board — rows unrolling one after another.
function FKboard(m,p){
  for(var i=0;i<m.n;i++){
    var el=FKq(m.id+"-r"+i);if(!el)continue;
    var fl=FKclamp01(FKease.outBack(FKseg(p,0.08+i*0.07,0.2+i*0.07)));
    el.style.transform="scaleY("+fl+")";
    el.style.opacity=String(FKclamp01(fl*1.6));
  }
}
// SCROLL:stack — a card deck dealt one at a time.
function FKstack(m,p){
  var q=FKseg(p,0.1,0.9)*(m.n-0.001);
  var idx=Math.min(m.n-1,Math.floor(q)),frac=q-idx;
  var off=frac>0.72?(frac-0.72)/0.28:0;
  for(var i=0;i<m.n;i++){
    var el=FKq(m.id+"-card"+i);if(!el)continue;
    if(i===idx){el.style.opacity=String(1-off);el.style.transform="translateY("+(-off*240)+"px) rotate("+(-off*5)+"deg)";el.style.zIndex="2";}
    else if(i===idx+1){el.style.opacity="1";el.style.transform="translateY("+(44-off*44)+"px) scale("+(0.94+off*0.06)+")";el.style.zIndex="1";}
    else{el.style.opacity="0";el.style.zIndex="0";}
  }
  var c=FKq(m.id+"-count");if(c){var s=(idx+1)+" / "+m.n;if(c.textContent!==s)c.textContent=s;}
}
// SCROLL:ticker — three rows drifting at different speeds, driven by the FILM clock so the
// rails never stop (the source drives them off its ambient clock, not scene progress).
function FKticker(m,p,clock){
  for(var i=0;i<3;i++){
    var el=FKq(m.id+"-t"+i);if(!el)continue;
    var dir=i%2===0?1:-1;
    var shift=(((clock*(70+i*45)*dir)%1400)+1400)%1400;
    var e=FKease.outExpo(FKseg(p,0.04+i*0.07,0.24+i*0.07));
    el.style.transform="translateX("+(-shift-(1-e)*dir*400)+"px)";
    el.style.opacity=String(e);
  }
}
// TOGGLE — switches / checkboxes / dials flipping in sequence.
function FKtoggle(m,p){
  for(var i=0;i<m.n;i++){
    var on=FKseg(p,0.18+i*0.14,0.26+i*0.14)>=1;
    var knob=FKclamp01(FKease.outBack(FKseg(p,0.18+i*0.14,0.3+i*0.14)));
    var k=FKq(m.id+"-k"+i);
    if(k){
      if(m.v==="dial"){k.style.transform="rotate("+(-120+knob*(150+(i%3)*35))+"deg)";}
      else{k.style.transform="translateX("+(knob*(m.v==="check"?0:48))+"px)";k.style.opacity=m.v==="check"?String(knob):"1";}
    }
    var tr=FKq(m.id+"-t"+i);
    if(tr)tr.style.background=on?m.on:m.off;
    var lb=FKq(m.id+"-lb"+i);
    if(lb)lb.style.color=on?m.onInk:m.offInk;
  }
}
// NOTIFY — toasts arriving, each with its own life bar.
function FKnotify(m,p){
  for(var i=0;i<m.n;i++){
    var el=FKq(m.id+"-n"+i);if(!el)continue;
    var s0=m.v==="side"?0.12+i*0.16:m.v==="pop"?0.14+i*0.17:0.14+i*0.16;
    var e=m.v==="side"?FKease.outExpo(FKseg(p,s0,s0+0.16)):FKease.outBack(FKseg(p,s0,s0+(m.v==="pop"?0.16:0.2)));
    el.style.opacity=String(FKclamp01(e*(m.v==="side"?1.5:m.v==="pop"?1.6:1.4)));
    if(m.v==="side")el.style.transform="translateX("+((1-e)*460)+"px)";
    else if(m.v==="pop")el.style.transform="scale("+FKlerp(0.3,1,FKclamp01(e))+") rotate("+m.rot[i]+"deg)";
    else el.style.transform="translateY("+((1-e)*-150)+"px) rotate("+((1-e)*(i%2?3:-3))+"deg)";
    var life=FKq(m.id+"-life"+i);
    if(life)life.style.width=((1-FKclamp01(FKseg(p,s0+0.16,1)))*100)+"%";
  }
}
// MORPH — a word rolling / fading / split-flapping through a list of steps.
function FKmorph(m,p){
  var q=FKseg(p,0.12,0.88)*(m.n-0.001);
  var idx=Math.min(m.n-1,Math.floor(q)),frac=q-idx;
  var nxt=Math.min(m.n-1,idx+1);
  var bar=FKq(m.id+"-bar");
  if(bar)bar.style.width=(((idx+frac)/m.n)*320)+"px";
  if(m.v==="flap"){
    for(var ci=0;ci<m.maxLen;ci++){
      var el=FKq(m.id+"-ch"+ci);if(!el)continue;
      var startFl=0.72+(ci/m.maxLen)*0.2;
      var fl=frac<=startFl?0:Math.min(1,(frac-startFl)/0.08);
      var ch=(fl<0.5?(m.steps[idx][ci]||" "):(m.steps[nxt][ci]||" "));
      if(el.textContent!==ch)el.textContent=ch;
      el.style.transform="scaleY("+Math.abs(1-fl*2)+")";
    }
    return;
  }
  var a=FKq(m.id+"-a"),b=FKq(m.id+"-b");
  if(m.v==="fade"){
    var fr2=frac>0.7?FKease.inOut((frac-0.7)/0.3):0;
    if(a){if(a.textContent!==m.steps[idx])a.textContent=m.steps[idx];a.style.opacity=String(1-fr2);a.style.transform="scale("+(1+fr2*0.08)+")";}
    if(b){if(b.textContent!==m.steps[nxt])b.textContent=m.steps[nxt];b.style.opacity=String(fr2);b.style.transform="scale("+(0.92+fr2*0.08)+")";}
  }else{
    var roll=frac>0.75?(frac-0.75)*4:0;
    var wrap=FKq(m.id+"-roll");
    if(wrap)wrap.style.transform="translateY("+(-roll*190)+"px)";
    if(a&&a.textContent!==m.steps[idx])a.textContent=m.steps[idx];
    if(b&&b.textContent!==m.steps[nxt])b.textContent=m.steps[nxt];
  }
}
// SWIPE — a deck being thrown, or a card flipping on its Y axis.
function FKswipe(m,p){
  if(m.v==="flip"){
    var f1=FKseg(p,0.3,0.46),f2=FKseg(p,0.62,0.78);
    var k=0,sx=1;
    if(f1>0&&f1<1){sx=Math.abs(1-f1*2);k=f1<0.5?0:1;}
    else if(f1>=1&&f2<=0){k=1;}
    else if(f2>0&&f2<1){sx=Math.abs(1-f2*2);k=f2<0.5?1:2;}
    else if(f2>=1){k=2;}
    k=Math.min(k,m.n-1);
    var card=FKq(m.id+"-flip");
    if(card)card.style.transform="scaleX("+Math.max(0.02,sx)+")";
    for(var i=0;i<m.n;i++){
      var f=FKq(m.id+"-f"+i);if(f)f.style.opacity=(i===k)?"1":"0";
      var d=FKq(m.id+"-dot"+i);
      if(d){d.style.width=(i===k?44:14)+"px";d.style.background=i===k?m.on:m.off;}
    }
    return;
  }
  var sw=FKease.inCubic(FKseg(p,0.34,0.6));
  var promo=FKease.outCubic(FKseg(p,0.55,0.75));
  var c0=FKq(m.id+"-c0");
  if(c0){c0.style.transform="translate("+(sw*1100)+"px,"+(sw*-80)+"px) rotate("+(sw*18)+"deg)";c0.style.opacity=String(1-sw*0.2);}
  var c1=FKq(m.id+"-c1");
  if(c1)c1.style.transform="translateY("+FKlerp(30,0,promo)+"px) scale("+FKlerp(0.94,1,promo)+")";
  var c2=FKq(m.id+"-c2");
  if(c2)c2.style.transform="translateY("+FKlerp(60,30,promo)+"px) scale("+FKlerp(0.88,0.94,promo)+")";
  var st=FKq(m.id+"-stamp");
  if(st)st.style.opacity=String(Math.min(1,sw*3));
}
// CURSOR — a pointer walking to a button and then to a switch, with a click ring.
function FKcursor(m,p){
  if(m.v==="slider"){
    var mv=FKease.inOut(FKseg(p,0.2,0.6));
    var kx=40+mv*560;
    var fill=FKq(m.id+"-fill");if(fill)fill.style.width=(mv*600)+"px";
    var knob=FKq(m.id+"-knob");if(knob)knob.style.left=(kx-26)+"px";
    var val=FKq(m.id+"-val");if(val){var s=String(Math.round(10+mv*80));if(val.textContent!==s)val.textContent=s;}
    var ptr=FKq(m.id+"-ptr");if(ptr)ptr.setAttribute("transform","translate("+(kx+30)+",300) scale("+((mv>0.02&&mv<0.98)?0.88:1)+")");
    var tg=FKq(m.id+"-tg");if(tg)tg.style.background=FKseg(p,0.74,0.82)>0?m.on:m.off;
    var tk=FKq(m.id+"-tk");if(tk)tk.style.left=(FKseg(p,0.74,0.82)>0?48:6)+"px";
    return;
  }
  if(m.v==="keys"){
    for(var i=0;i<m.n;i++){
      var s0=0.2+i*0.15;
      var pr=Math.sin(FKclamp01(FKseg(p,s0,s0+0.1))*Math.PI);
      var did=p>s0+0.1;
      var el=FKq(m.id+"-k"+i);if(!el)continue;
      el.style.transform="translateY("+(pr*8)+"px)";
      el.style.borderBottomWidth=(8-pr*6)+"px";
      el.style.background=did?m.hitBg:m.idleBg;
      el.style.borderColor=did?m.on:m.off;
      el.style.color=did?m.on:m.ink;
    }
    var af=FKq(m.id+"-after");
    if(af){var e=FKclamp01(FKease.outBack(FKseg(p,0.72,0.86)));af.style.opacity=String(FKclamp01(e*1.6));af.style.transform="scale("+FKlerp(0.6,1,e)+")";}
    return;
  }
  var toBtn=FKease.inOut(FKseg(p,0.1,0.34)),click=FKseg(p,0.36,0.44);
  var toTog=FKease.inOut(FKseg(p,0.52,0.72));
  var cx=FKlerp(FKlerp(140,450,toBtn),700,toTog),cy=FKlerp(FKlerp(620,300,toBtn),490,toTog);
  var ptr2=FKq(m.id+"-ptr");
  if(ptr2)ptr2.setAttribute("transform","translate("+cx+","+cy+") scale("+((click>0&&click<1)?0.88:1)+")");
  var ring=FKq(m.id+"-ring");
  if(ring){ring.setAttribute("r",String(20+click*70));ring.style.opacity=String((click>0&&click<1)?(1-click):0);}
  var btn=FKq(m.id+"-btn");
  if(btn){var cl=p>0.4;btn.style.background=cl?m.on:m.off;btn.style.color=cl?m.onInk:m.ink;btn.style.transform="scale("+(1-Math.sin(FKclamp01(click)*Math.PI)*0.08)+")";}
  var lbl=FKq(m.id+"-btnlabel");
  if(lbl&&m.after){var want=(p>0.4)?m.after:m.before;if(lbl.textContent!==want)lbl.textContent=want;}
  var tg2=FKq(m.id+"-tg");if(tg2)tg2.style.background=FKseg(p,0.74,0.82)>0?m.on:m.off;
  var tk2=FKq(m.id+"-tk");if(tk2)tk2.style.left=(FKseg(p,0.74,0.82)>0?50:6)+"px";
}
// DRAGDROP — a chip carried to a slot on an arc, then settling with a bounce.
function FKdrag(m,p){
  var assemble=m.v==="assemble";
  var move=FKease.inOut(FKseg(p,assemble?0.16:0.28,assemble?0.5:0.6));
  var dropped=p>(assemble?0.52:0.64);
  var sx=assemble?-60:150,sy=assemble?80:210,tx=assemble?330:560,ty=assemble?300:480;
  var chip=FKq(m.id+"-chip");
  if(chip){
    var cx=FKlerp(sx,tx,move),cy=FKlerp(sy,ty,move)-Math.sin(move*Math.PI)*(assemble?160:90);
    var shakeT=FKclamp01(FKseg(p,0.52,0.64));
    var shake=assemble&&dropped?Math.sin(shakeT*Math.PI*5)*(1-shakeT)*9:0;
    chip.style.left=(dropped?(assemble?tx:tx+25)+shake:cx)+"px";
    chip.style.top=(dropped?(assemble?ty+15:ty+25):cy)+"px";
    chip.style.transform="rotate("+(dropped?0:FKlerp(assemble?-14:-4,0,move))+"deg)";
  }
  var slot=FKq(m.id+"-slot");
  if(slot){slot.style.borderStyle=dropped&&assemble?"solid":"dashed";slot.style.borderColor=dropped?m.on:m.off;slot.style.background=dropped?m.tint:"transparent";}
  var lab=FKq(m.id+"-slotlabel");if(lab)lab.style.opacity=dropped?"0":"1";
  var tick=FKq(m.id+"-tick");
  if(tick){var e=FKclamp01(FKease.outBack(FKseg(p,dropped?0.68:0.74,dropped?0.82:0.9)));tick.style.opacity=dropped?String(FKclamp01(e*1.6)):"0";tick.style.transform="scale("+FKlerp(0.6,1,e)+")";}
  var ptr=FKq(m.id+"-ptr");
  if(ptr)ptr.setAttribute("transform","translate("+(FKlerp(sx,tx,move)+90)+","+(FKlerp(sy,ty,move)-Math.sin(move*Math.PI)*90+40)+") scale("+(FKseg(p,0.14,0.24)>=1?0.88:1)+")"),ptr.style.opacity=dropped?"0":"1";
  var note=FKq(m.id+"-note");if(note)note.style.opacity=dropped?"1":"0";
}
var FKMECH={typing:FKtype,code:FKtype,ring:FKring,scroll:FKscroll,board:FKboard,stack:FKstack,
ticker:FKticker,toggle:FKtoggle,notify:FKnotify,morph:FKmorph,swipe:FKswipe,cursor:FKcursor,drag:FKdrag};
`;

module.exports = { SVG_SHIM, UTILS_SHIM, MECHANICS_SHIM };
