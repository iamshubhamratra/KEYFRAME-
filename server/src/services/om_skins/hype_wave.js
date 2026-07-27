// HYPE WAVE — skin for the shared OM stage engine (services/om_stage.js).
//
// The source ("hype-wave-film.jsx"): electric blue / yellow / coral / navy sticker pop —
// Archivo Black mega slams, sticker chips with hard offset shadows, scrolling
// checkerboards, wavy ribbons, spinning star stickers, and covered zigzag / checker /
// iris cuts. Ported with the checkers, ribbons and stars as a canvas WORLD on hf-seek
// time and the covers as real timeline cuts.
//
// FONTS: this is the one source pack whose faces are BOTH bundled — Archivo Black and
// Space Grotesk — so it keeps its exact original typography.

const stage = require("../om_stage");

const SKIN = {
  id: "hype-wave",
  label: "Hype Wave",

  display: "Archivo Black", displayFallback: "'Arial Black', sans-serif",
  body: "Space Grotesk",
  em: 0.84,                 // Archivo Black is very wide — measured, not guessed
  headLine: 0.9, headTrack: "-0.02em", headUpper: true, headTransform: "uppercase",
  sizes: { hook: 150, statement: 138, feature: 104, montage: 104, stats: 102, cta: 144 },

  palette: {
    blue: "#2B5BFF", navy: "#101433", cream: "#FDF8EC",
    accent: "#FFD234", accent2: "#FF5A48", accent3: "#2B5BFF",
  },
  accents: ["accent", "accent2", "accent3"],
  groundKey: "blue", inkKey: "navy", paperKey: "cream",
  dark: true,
  // Loud full-field swaps — the pack's whole personality.
  grounds: ["blue", "navy", "accent2", "blue", "accent", "navy"],
  chipBg: "cream",
  frameStyle: "hard",
  cams: ["left", "zoom", "up", "right", "scaleout", "drop"],
  cuts: ["blinds", "iris"],
  energy: 1.45,

  strings: {
    hookKicker: "Turn it up",
    statementKicker: "Beige is a choice",
    featureKicker: "Watch this",
    montageKicker: "All angles",
    statsKicker: "Receipts",
    ctaKicker: "Go on",
    ctaButton: "Start free",
  },

  world({ theme, W, H, seed }) {
    const [yr, yg, yb] = stage.hexToRgb(theme.accent);
    const [cr, cg, cb] = stage.hexToRgb(theme.accent2);
    const [br, bg2, bb] = stage.hexToRgb(theme.c.blue);
    const [nr, ng, nb] = stage.hexToRgb(theme.c.navy);
    const [mr, mg, mb] = stage.hexToRgb(theme.c.cream);
    const script = `(function(){
  var cv=document.getElementById("om-canvas"); if(!cv||!cv.getContext) return;
  var cx=cv.getContext("2d"); if(!cx) return;
  var W=${W},H=${H},S=Math.min(W,H)/1080;
  function Y(a){return "rgba(${yr},${yg},${yb},"+a+")";}
  function C(a){return "rgba(${cr},${cg},${cb},"+a+")";}
  function B(a){return "rgba(${br},${bg2},${bb},"+a+")";}
  function N(a){return "rgba(${nr},${ng},${nb},"+a+")";}
  function M(a){return "rgba(${mr},${mg},${mb},"+a+")";}

  // a scrolling checkerboard rail — the pack's signature band
  function checker(t,y,h,c1,c2,dir,tilt,speed){
    cx.save(); cx.translate(0,y); cx.rotate(tilt*Math.PI/180);
    var cell=h; var shift=((t*speed*S*dir)%(cell*2)+cell*2)%(cell*2);
    for(var x=-cell*2+shift-W*0.1;x<W*1.15;x+=cell){
      cx.fillStyle=(Math.round((x-shift)/cell)%2===0)?c1:c2;
      cx.fillRect(x,-h/2,cell,h);
    }
    cx.restore();
  }
  // a wavy ribbon crossing the field
  function ribbon(t,y,col,amp,thick,speed){
    cx.beginPath();
    for(var x=-40;x<=W+40;x+=16){
      var yy=y+Math.sin(x/(150*S)+t*speed)*amp;
      if(x===-40)cx.moveTo(x,yy); else cx.lineTo(x,yy);
    }
    cx.strokeStyle=col; cx.lineWidth=thick; cx.lineCap="round"; cx.stroke();
  }
  function star(cxp,cyp,R,fill,border,rot){
    cx.save(); cx.translate(cxp,cyp); cx.rotate(rot); cx.beginPath();
    for(var i=0;i<16;i++){
      var a=(i/16)*6.283, rr=i%2?R*0.5:R;
      if(i===0)cx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr); else cx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);
    }
    cx.closePath(); cx.fillStyle=fill; cx.fill();
    cx.lineWidth=8*S; cx.strokeStyle=border; cx.stroke(); cx.restore();
  }

  function draw(t){
    cx.clearRect(0,0,W,H);   // MANDATORY: a world repaints from scratch every seek
    // Ribbons are translucent and may cross the copy column; the CHECKERS and STAR
    // STICKERS are opaque, so they stay in the reserved bands — above ~10% and below ~80%,
    // where no beat places copy. An opaque sticker landing behind a headline is the one
    // way this world can damage the film, and it did on the first render.
    ribbon(t,H*0.235,M(0.2),46*S,22*S,1.2);
    ribbon(t+2,H*0.79,C(0.34),50*S,26*S,-1.1);
    checker(t,H*0.075,58*S,N(0.95),Y(0.95),1,-3,60);
    checker(t,H*0.885,52*S,Y(0.95),N(0.95),-1,2.5,52);
    star(W*0.86,H*0.075,110*S,Y(0.95),N(1),t*0.5);
    star(W*0.11,H*0.845,84*S,C(0.95),N(1),-t*0.75);
    star(W*0.8,H*0.815,60*S,M(0.9),N(1),t*0.62);
  }
  window.OM_WORLD=draw;
  window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});
  draw(0);
})();`;
    return { html: "", script };
  },
};

module.exports = {
  buildComposition: (opts) => stage.build(SKIN, opts),
  STRINGS: { ...stage.BASE_STRINGS, ...SKIN.strings },
  SKIN,
};
