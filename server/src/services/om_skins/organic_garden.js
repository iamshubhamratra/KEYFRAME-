// ORGANIC GARDEN — skin for the shared OM stage engine (services/om_stage.js).
//
// The source ("organic-garden-film.jsx"): a warm cream garden reel — drifting petals and
// leaves, soft blobs, rolling ground hills, Caprasimo headlines with a sage seed-ring on
// the emphasis word, Figtree body copy, and a gentle leaf-gust carrying you between
// scenes. Ported here as a canvas WORLD painted purely from the renderer's hf-seek time,
// so it flows continuously across every cut exactly as the original did — but
// deterministically, which a wall-clock React ticker never was.
//
// FONTS: the source's own Caprasimo + Figtree, now bundled in fonts/pack_fonts.js — so
// this pack renders in its original typography rather than a substitute.

const stage = require("../om_stage");

const SKIN = {
  id: "organic-garden",
  label: "Organic Garden",

  // ---- type ----
  display: "Caprasimo", displayFallback: "Georgia, 'Times New Roman', serif",
  body: "Figtree",
  em: 0.6,                 // Caprasimo mixed-case measures ~0.58/char; held at 0.60 for margin
  headLine: 1.02, headTrack: "-0.015em", headUpper: false,
  sizes: { hook: 130, statement: 118, feature: 96, montage: 96, stats: 92, cta: 128 },

  // ---- palette ----
  // The authored garden: cream paper, warm terracotta, sage, a soft blush. `accents` are
  // the slots the brand's own colours take over (in order); every other entry rotates
  // onto the brand's lead hue at its authored luminance.
  palette: {
    bg: "#f5ead8", surface: "#ebddc5", ink: "#201e1d",
    accent: "#c67139", accent2: "#7a8a5e", accentSoft: "#ffc6a5", deep: "#8c491a",
  },
  accents: ["accent", "accent2", "accentSoft"],
  groundKey: "bg", inkKey: "ink", paperKey: "surface",
  dark: false,
  // One ground for the whole film — the garden itself carries the change, which is what
  // makes this pack feel like a place rather than a slide deck.
  grounds: ["bg"],
  chipBg: "bg",
  frameStyle: "soft",
  cams: ["drop", "left", "swing", "right", "zoom", "scaleout"],
  cuts: ["push"],           // no opaque cover: the camera and the drifting world cut it
  energy: 0.9,              // the source's "Calm"→"Lively" band; this pack sits low

  strings: {
    hookKicker: "Grown from your story",
    statementKicker: "The problem",
    featureKicker: "Planted center stage",
    montageKicker: "Every corner",
    statsKicker: "Numbers that keep growing",
    ctaKicker: "Ready when you are",
    ctaButton: "Start planting",
    tiles: ["Home", "Detail", "Mobile", "Dashboard"],
  },

  // ---- the world ----
  // Drifting petals + leaves, soft warm blobs and two rolling hills, all pure functions of
  // the seek time `t`. Colours come from the (brand-rotated) theme, so a magenta brand
  // grows a magenta garden — the blobs, hills and every petal, not just the headline.
  world({ theme, W, H, rgba, seed }) {
    const [ar, ag, ab] = stage.hexToRgb(theme.accent);
    const [br, bg2, bb] = stage.hexToRgb(theme.accent2);
    const [sr, sg, sb] = stage.hexToRgb(theme.c.accentSoft);
    const script = `(function(){
  var cv=document.getElementById("om-canvas"); if(!cv||!cv.getContext) return;
  var cx=cv.getContext("2d"); if(!cx) return;
  var W=${W},H=${H};
  function A(a){return "rgba(${ar},${ag},${ab},"+a+")";}
  function B(a){return "rgba(${br},${bg2},${bb},"+a+")";}
  function C(a){return "rgba(${sr},${sg},${sb},"+a+")";}
  // seeded, so the garden is identical on every re-render of the same job
  var sd=${seed >>> 0}||7; function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  var S=Math.min(W,H)/1080;
  var BLOBS=[],PET=[];
  for(var i=0;i<5;i++)BLOBS.push({x:rnd(),y:rnd(),R:(260+rnd()*260)*S,dx:(rnd()-0.5)*60*S,dy:(rnd()-0.5)*50*S,f:0.04+rnd()*0.05,t:rnd()});
  var NP=Math.round(26*(W*H)/(1080*1920));
  for(var j=0;j<NP;j++)PET.push({x:rnd(),size:(14+rnd()*34)*S,speed:(22+rnd()*40)*S,sway:(30+rnd()*70)*S,swayF:0.3+rnd()*0.5,ph:rnd()*6.283,spin:(rnd()-0.5)*60,kind:Math.floor(rnd()*3),tint:Math.floor(rnd()*3)});

  function petal(x,y,rot,size,fill,kind){
    cx.save(); cx.translate(x,y); cx.rotate(rot*Math.PI/180); cx.fillStyle=fill; cx.beginPath();
    if(kind===0){ cx.moveTo(0,-size); cx.bezierCurveTo(size*0.55,-size*0.7,size*0.55,size*0.7,0,size);
                  cx.bezierCurveTo(-size*0.55,size*0.7,-size*0.55,-size*0.7,0,-size); }
    else if(kind===1){ cx.ellipse(0,0,size*0.5,size,0,0,6.283); }
    else { cx.arc(0,0,size*0.42,0,6.283); }
    cx.fill(); cx.restore();
  }
  function draw(t){
    cx.clearRect(0,0,W,H);
    // soft warm blobs
    for(var i=0;i<BLOBS.length;i++){
      var b=BLOBS[i];
      var bx=b.x*W+Math.sin(t*b.f+i)*b.dx, by=b.y*H+Math.cos(t*b.f*0.8+i)*b.dy;
      var g=cx.createRadialGradient(bx,by,0,bx,by,b.R);
      var col=b.t<0.5?B:A;
      g.addColorStop(0,col(0.28)); g.addColorStop(1,col(0));
      cx.fillStyle=g; cx.fillRect(0,0,W,H);
    }
    // two rolling hills
    var base=H*0.82;
    cx.fillStyle=B(0.16); cx.beginPath(); cx.moveTo(0,H);
    for(var x=0;x<=W;x+=40){ cx.lineTo(x, base+Math.sin(x/(260*S)+t*0.12)*26*S+Math.sin(x/(90*S)-t*0.2)*8*S); }
    cx.lineTo(W,H); cx.closePath(); cx.fill();
    var base2=H*0.9;
    cx.fillStyle=B(0.24); cx.beginPath(); cx.moveTo(0,H);
    for(var x2=0;x2<=W;x2+=40){ cx.lineTo(x2, base2+Math.sin(x2/(200*S)-t*0.16)*20*S); }
    cx.lineTo(W,H); cx.closePath(); cx.fill();
    // drifting petals
    var cycle=H+200*S;
    for(var p=0;p<PET.length;p++){
      var q=PET[p];
      var yy=H+80*S-((t*q.speed+q.ph*60)%cycle);
      var xx=q.x*W+Math.sin(t*q.swayF+q.ph)*q.sway;
      var fill=q.tint===0?A(0.7):q.tint===1?B(0.6):C(0.5);
      petal(xx,yy,t*q.spin+q.ph*120,q.size,fill,q.kind);
    }
  }
  // Painted ONLY from the renderer's hf-seek time — deterministic and seek-exact. The
  // GSAP timeline's onUpdate drives it too, so it also animates in live preview.
  window.OM_WORLD=draw;
  window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});
  draw(0);
})();`;
    return { html: "", script };
  },

  css(theme, { X, rgba }) {
    // The seed-ring the source draws around the emphasis word, as a soft underline that
    // costs the timeline nothing.
    return `.om-sc [data-in="rise"] { will-change:transform,opacity; }`;
  },
};

module.exports = {
  buildComposition: (opts) => stage.build(SKIN, opts),
  STRINGS: { ...stage.BASE_STRINGS, ...SKIN.strings },
  SKIN,
};
