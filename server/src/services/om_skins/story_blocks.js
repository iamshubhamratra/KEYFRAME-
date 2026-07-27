// STORY BLOCKS — skin for the shared OM stage engine (services/om_stage.js).
//
// The source ("story-blocks-film.jsx"): an edited-video look — no parked layouts. Bold
// editorial colour panels sliding in from alternating sides, tilted tickers marching
// across the field, rotating starbursts, and whip-pan cuts between scenes. Ported with
// the panels and tickers as a canvas WORLD on hf-seek time, and the whip-pan restated as
// a hard block WIPE whose edge rotates per cut — so the film never arrives from the same
// side twice running.
//
// FONTS: the source's own Caprasimo + Figtree, now bundled in fonts/pack_fonts.js. The
// headlines go back to SENTENCE CASE too — the uppercase here was only ever a way to make
// a condensed stand-in read as a slam face.

const stage = require("../om_stage");

const SKIN = {
  id: "story-blocks",
  label: "Story Blocks",

  display: "Caprasimo", displayFallback: "Georgia, 'Times New Roman', serif",
  body: "Figtree",
  em: 0.6,                 // Caprasimo mixed-case measures ~0.58/char; held at 0.60 for margin
  headLine: 1.0, headTrack: "-0.012em", headUpper: false,
  sizes: { hook: 148, statement: 136, feature: 100, montage: 96, stats: 94, cta: 132 },

  palette: {
    paper: "#F5EAD8", ink: "#201E1D", deep: "#161413",
    accent: "#C67139", accent2: "#7A8A5E", accent3: "#D9B44A",
  },
  accents: ["accent", "accent2", "accent3"],
  groundKey: "paper", inkKey: "ink", paperKey: "paper",
  dark: false,
  // A full-field colour block PER SCENE — the pack's whole idea. Adjacent entries never
  // repeat, so every cut lands on a different field.
  grounds: ["paper", "ink", "accent", "paper", "accent2", "deep"],
  chipBg: "paper",
  frameStyle: "hard",
  cams: ["left", "right", "up", "drop", "zoom", "scaleout"],
  cuts: ["wipe"],
  energy: 1.25,

  strings: {
    hookKicker: "Chapter one",
    statementKicker: "The problem",
    featureKicker: "Here it is",
    montageKicker: "Every angle",
    statsKicker: "The receipts",
    ctaKicker: "Your turn",
    ctaButton: "Start now",
  },

  world({ theme, W, H, seed }) {
    const [ar, ag, ab] = stage.hexToRgb(theme.accent);
    const [br, bg2, bb] = stage.hexToRgb(theme.accent2);
    const [cr, cg, cb] = stage.hexToRgb(theme.c.accent3);
    const [ir, ig, ib] = stage.hexToRgb(theme.ink);
    const script = `(function(){
  var cv=document.getElementById("om-canvas"); if(!cv||!cv.getContext) return;
  var cx=cv.getContext("2d"); if(!cx) return;
  var W=${W},H=${H},S=Math.min(W,H)/1080;
  function A(a){return "rgba(${ar},${ag},${ab},"+a+")";}
  function B(a){return "rgba(${br},${bg2},${bb},"+a+")";}
  function C(a){return "rgba(${cr},${cg},${cb},"+a+")";}
  function I(a){return "rgba(${ir},${ig},${ib},"+a+")";}
  var sd=${seed >>> 0}||7; function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  // Editorial panels travelling in from alternating sides, forever — the pack's whole
  // idea. They are stacked in the RESERVED BANDS (top ~4-20%, bottom ~78-95%): a 0.16
  // alpha that reads as a tint on paper reads as a SOLID BLOCK on this pack's ink and
  // deep grounds, and one landing mid-frame sits straight across the headline.
  // Band extents are budgeted against what the beats actually occupy: the highest kicker
  // sits at 15.6% and the caption plate starts at 90%, so the top stack must finish by
  // ~13% and the bottom stack by ~89% including each panel's own half-height.
  var PANELS=[];
  for(var i=0;i<6;i++){
    var top=i<3;
    PANELS.push({y:top?(0.015+i*0.028):(0.785+(i-3)*0.04),h:(50+rnd()*60)*S,
                 speed:26+rnd()*44,dir:i%2?1:-1,tilt:(rnd()-0.5)*5,tint:i%3});
  }

  function star(cxp,cyp,R,fill,rot,petals){
    cx.save(); cx.translate(cxp,cyp); cx.rotate(rot); cx.fillStyle=fill; cx.beginPath();
    for(var i=0;i<petals*2;i++){
      var a=(i/(petals*2))*6.283, rr=i%2?R*0.46:R;
      if(i===0)cx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr); else cx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);
    }
    cx.closePath(); cx.fill(); cx.restore();
  }

  function draw(t){
    cx.clearRect(0,0,W,H);   // MANDATORY: a world repaints from scratch every seek
    // travelling panels
    for(var p=0;p<PANELS.length;p++){var q=PANELS[p];
      var span=W+560*S;
      var off=((t*q.speed*S)%span);
      var x=q.dir>0? -280*S+off : W+280*S-off;
      cx.save(); cx.translate(x,q.y*H); cx.rotate(q.tilt*Math.PI/180);
      cx.fillStyle=q.tint===0?A(0.42):q.tint===1?B(0.38):C(0.36);
      cx.fillRect(-W*0.55,-q.h/2,W*1.1,q.h);
      cx.restore();
    }
    // two tilted ticker rails marching opposite ways
    for(var k=0;k<2;k++){
      // reserved bands only — an opaque rail across the copy column cuts a headline in half
      var yy=H*(k?0.875:0.085), tilt=(k?2.5:-2.5)*Math.PI/180;
      cx.save(); cx.translate(0,yy); cx.rotate(tilt);
      cx.fillStyle=k?I(0.9):A(0.9); cx.fillRect(-W*0.1,-26*S,W*1.2,52*S);
      // dashes marching along the rail
      var step=64*S, shift=((t*(k?-70:70)*S)%step+step)%step;
      cx.fillStyle=k?C(0.9):I(0.85);
      for(var x2=-W*0.1+shift;x2<W*1.1;x2+=step) cx.fillRect(x2,-10*S,26*S,20*S);
      cx.restore();
    }
    // rotating starbursts anchored off two corners
    star(W*0.9,H*0.12,140*S,C(0.5),t*0.5,12);
    star(W*0.08,H*0.88,110*S,A(0.42),-t*0.4,10);
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
