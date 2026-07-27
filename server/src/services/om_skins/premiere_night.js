// PREMIERE NIGHT — skin for the shared OM stage engine (services/om_stage.js).
//
// The source ("premiere-night-film.jsx"): a cinema premiere — a dark house, sweeping
// spotlights, a chasing marquee-bulb rail, film strips, grain and vignette, and covered
// theatre cuts (doors / iris / blinds). Ported with the house as a canvas WORLD on
// hf-seek time and the theatre cuts as real covers on the timeline, rotating per cut so
// the same door never opens twice running.
//
// FONTS: the source's own Caprasimo + Figtree, now bundled in fonts/pack_fonts.js.

const stage = require("../om_stage");

const SKIN = {
  id: "premiere-night",
  label: "Premiere Night",

  display: "Caprasimo", displayFallback: "Georgia, 'Times New Roman', serif",
  body: "Figtree",
  em: 0.6,                 // Caprasimo mixed-case measures ~0.58/char; held at 0.60 for margin
  headLine: 0.98, headTrack: "-0.01em", headUpper: false,
  sizes: { hook: 150, statement: 138, feature: 108, montage: 104, stats: 102, cta: 144 },

  palette: {
    house: "#171514", deep: "#0D0C0B", ink: "#201E1D", paper: "#F5EAD8",
    accent: "#C67139", accent2: "#7A8A5E", glow: "#E8A066",
  },
  accents: ["accent", "glow", "accent2"],
  groundKey: "house", inkKey: "ink", paperKey: "paper",
  dark: true,
  grounds: ["house"],
  chipBg: "paper",
  frameStyle: "cinema",
  cams: ["dolly", "zoom", "dolly", "scaleout", "zoom", "dolly"],
  cuts: ["doors", "iris", "blinds"],
  energy: 0.9,

  strings: {
    hookKicker: "Tonight only",
    statementKicker: "The problem",
    featureKicker: "Now showing",
    montageKicker: "Selected scenes",
    statsKicker: "Box office",
    ctaKicker: "Doors are open",
    ctaButton: "Take your seat",
  },

  world({ theme, W, H, seed }) {
    const [ar, ag, ab] = stage.hexToRgb(theme.accent);
    const [gr, gg, gb] = stage.hexToRgb(theme.c.glow);
    const [pr, pg, pb] = stage.hexToRgb(theme.paper);
    const [hr, hg, hb] = stage.hexToRgb(theme.c.house);
    const script = `(function(){
  var cv=document.getElementById("om-canvas"); if(!cv||!cv.getContext) return;
  var cx=cv.getContext("2d"); if(!cx) return;
  var W=${W},H=${H},S=Math.min(W,H)/1080;
  function A(a){return "rgba(${ar},${ag},${ab},"+a+")";}
  function G(a){return "rgba(${gr},${gg},${gb},"+a+")";}
  function P(a){return "rgba(${pr},${pg},${pb},"+a+")";}
  var sd=${seed >>> 0}||7; function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  // a static grain field, sampled once — cheap, and identical on every re-render
  var GRAIN=[]; for(var i=0;i<900;i++)GRAIN.push({x:rnd(),y:rnd(),a:0.02+rnd()*0.05});

  function spotlight(t,phase,cxBase,col){
    var ang=Math.sin(t*0.22+phase)*0.34;                 // the beam sweeps the house
    var topX=cxBase+Math.sin(t*0.17+phase)*W*0.1;
    cx.save(); cx.globalCompositeOperation="lighter";
    cx.beginPath();
    cx.moveTo(topX-40*S,-20); cx.lineTo(topX+40*S,-20);
    cx.lineTo(topX+Math.tan(ang+0.42)*H+260*S,H); cx.lineTo(topX+Math.tan(ang-0.42)*H-260*S,H);
    cx.closePath();
    var g=cx.createLinearGradient(topX,0,topX,H);
    g.addColorStop(0,col(0.3)); g.addColorStop(0.55,col(0.09)); g.addColorStop(1,col(0));
    cx.fillStyle=g; cx.fill(); cx.restore();
  }

  function draw(t){
    cx.clearRect(0,0,W,H);   // MANDATORY: a world repaints from scratch every seek
    // the house: a deep vignette-lit room
    var bg=cx.createRadialGradient(W*0.5,H*0.38,Math.min(W,H)*0.1,W*0.5,H*0.45,Math.max(W,H)*0.8);
    bg.addColorStop(0,"rgba(${hr},${hg},${hb},1)");
    bg.addColorStop(1,"rgba(6,5,5,1)");
    cx.fillStyle=bg; cx.fillRect(0,0,W,H);
    // two sweeping spotlights
    spotlight(t,0,W*0.3,G);
    spotlight(t,2.2,W*0.72,A);
    // marquee bulb rails, top and bottom, chasing
    var rails=[H*0.055,H*0.945];
    for(var rI=0;rI<rails.length;rI++){
      var y=rails[rI],n=13;
      for(var b=0;b<n;b++){
        var x=(b+0.5)/n*W;
        // the chase: a bright bulb travelling the rail
        var lit=0.35+0.65*Math.pow(0.5+0.5*Math.sin(t*3.2-b*0.55+rI*1.6),6);
        var rr=(9+lit*5)*S;
        var gg2=cx.createRadialGradient(x,y,0,x,y,rr*4);
        gg2.addColorStop(0,G(0.55*lit)); gg2.addColorStop(1,G(0));
        cx.fillStyle=gg2; cx.beginPath(); cx.arc(x,y,rr*4,0,6.283); cx.fill();
        cx.fillStyle=P(0.35+0.6*lit); cx.beginPath(); cx.arc(x,y,rr,0,6.283); cx.fill();
      }
    }
    // a film strip drifting up the left edge
    var stepY=120*S, shift=((t*40*S)%stepY);
    cx.fillStyle="rgba(0,0,0,0.5)"; cx.fillRect(0,0,64*S,H);
    cx.fillStyle=P(0.14);
    for(var y2=-stepY+shift;y2<H+stepY;y2+=stepY) cx.fillRect(14*S,y2,36*S,72*S);
    // grain + vignette, the last things the projector adds
    for(var g3=0;g3<GRAIN.length;g3++){var q=GRAIN[g3];
      cx.fillStyle="rgba(255,255,255,"+(q.a*(0.6+0.4*Math.sin(t*7+g3)))+")";
      cx.fillRect(q.x*W,q.y*H,2*S,2*S);
    }
    var vg=cx.createRadialGradient(W*0.5,H*0.44,Math.min(W,H)*0.22,W*0.5,H*0.44,Math.max(W,H)*0.72);
    vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(0,0,0,0.72)");
    cx.fillStyle=vg; cx.fillRect(0,0,W,H);
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
