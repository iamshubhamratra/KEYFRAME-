// POSTER POP — skin for the shared OM stage engine (services/om_stage.js).
//
// The source ("poster-pop-film.jsx"): a loud kinetic-typography poster reel — every scene
// is a solid colour block (terracotta / ink / sage / cream), gigantic type slamming in,
// endless scrolling marquee bands and rotating starbursts, Organic tokens at full
// contrast. Ported with the marquees and starbursts as a canvas WORLD on hf-seek time and
// the colour-block swap as a hard WIPE whose edge rotates per cut.
//
// FONTS: the source's own Caprasimo + Figtree, now bundled in fonts/pack_fonts.js. The
// headlines go back to SENTENCE CASE, as the source set them.

const stage = require("../om_stage");

const SKIN = {
  id: "poster-pop",
  label: "Poster Pop",

  display: "Caprasimo", displayFallback: "Georgia, 'Times New Roman', serif",
  body: "Figtree",
  em: 0.6,                 // Caprasimo mixed-case measures ~0.58/char; held at 0.60 for margin
  headLine: 0.98, headTrack: "-0.012em", headUpper: false,
  sizes: { hook: 172, statement: 152, feature: 116, montage: 112, stats: 110, cta: 158 },

  palette: {
    paper: "#F5EAD8", ink: "#201E1D",
    accent: "#C67139", accent2: "#7A8A5E", accent3: "#D9B44A",
  },
  accents: ["accent", "accent2", "accent3"],
  groundKey: "accent", inkKey: "ink", paperKey: "paper",
  dark: false,
  // The whole pack IS the colour swap: a different full-bleed field every scene.
  grounds: ["accent", "ink", "accent2", "paper", "accent3", "ink"],
  chipBg: "paper",
  frameStyle: "hard",
  cams: ["zoom", "scaleout", "left", "right", "drop", "up"],
  cuts: ["wipe"],
  energy: 1.35,

  strings: {
    hookKicker: "Read this",
    statementKicker: "The problem",
    featureKicker: "Look closer",
    montageKicker: "All of it",
    statsKicker: "The numbers",
    ctaKicker: "Go on then",
    ctaButton: "Start now",
  },

  world({ theme, W, H, seed }) {
    const [ar, ag, ab] = stage.hexToRgb(theme.accent);
    const [br, bg2, bb] = stage.hexToRgb(theme.accent2);
    const [cr, cg, cb] = stage.hexToRgb(theme.c.accent3);
    const [pr, pg, pb] = stage.hexToRgb(theme.paper);
    const [ir, ig, ib] = stage.hexToRgb(theme.ink);
    const script = `(function(){
  var cv=document.getElementById("om-canvas"); if(!cv||!cv.getContext) return;
  var cx=cv.getContext("2d"); if(!cx) return;
  var W=${W},H=${H},S=Math.min(W,H)/1080;
  function A(a){return "rgba(${ar},${ag},${ab},"+a+")";}
  function B(a){return "rgba(${br},${bg2},${bb},"+a+")";}
  function C(a){return "rgba(${cr},${cg},${cb},"+a+")";}
  function P(a){return "rgba(${pr},${pg},${pb},"+a+")";}
  function I(a){return "rgba(${ir},${ig},${ib},"+a+")";}

  function star(cxp,cyp,R,fill,rot,petals){
    cx.save(); cx.translate(cxp,cyp); cx.rotate(rot); cx.fillStyle=fill; cx.beginPath();
    for(var i=0;i<petals*2;i++){
      var a=(i/(petals*2))*6.283, rr=i%2?R*0.44:R;
      if(i===0)cx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr); else cx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);
    }
    cx.closePath(); cx.fill(); cx.restore();
  }
  // A marquee band: a tilted rail carrying a repeating run of blocks that never stops.
  function marquee(t,y,tilt,h,bg,fg,dir,speed){
    cx.save(); cx.translate(0,y); cx.rotate(tilt*Math.PI/180);
    cx.fillStyle=bg; cx.fillRect(-W*0.12,-h/2,W*1.24,h);
    var step=140*S, shift=((t*speed*S*dir)%step+step)%step;
    cx.fillStyle=fg;
    for(var x=-W*0.12+shift;x<W*1.12;x+=step){
      cx.fillRect(x,-h*0.24,72*S,h*0.48);
      cx.beginPath(); cx.arc(x+104*S,0,h*0.17,0,6.283); cx.fill();
    }
    cx.restore();
  }

  function draw(t){
    cx.clearRect(0,0,W,H);   // MANDATORY: a world repaints from scratch every seek
    // one giant slow starburst behind everything — the pack's spinning poster mark
    star(W*0.5,H*0.42,W*0.62,P(0.10),t*0.16,14);
    star(W*0.88,H*0.1,150*S,C(0.5),t*0.55,12);
    star(W*0.1,H*0.9,120*S,B(0.45),-t*0.45,10);
    // The rails are OPAQUE, so they live only in the reserved bands — above 10% and
    // below 87%, where no beat places copy and the caption plate has not started. A rail
    // crossing the copy column sits straight across a kicker or a stat card.
    marquee(t,H*0.075,-3,64*S,I(0.92),C(0.95),1,90);
    marquee(t,H*0.875,2.4,58*S,P(0.9),A(0.95),-1,74);
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
