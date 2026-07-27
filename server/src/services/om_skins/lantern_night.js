// LANTERN NIGHT — skin for the shared OM stage engine (services/om_stage.js).
//
// The source ("lantern-night-film.jsx"): the Organic palette inverted into a night
// lantern festival — an ink sky, twinkling stars, a breathing moon with a halo, far hill
// silhouettes, terracotta lanterns rising endlessly through three parallax layers, sage
// fireflies weaving, and a water band carrying shimmering reflections. Ported as a canvas
// WORLD painted purely from the renderer's hf-seek time, so the whole festival flows
// across every cut exactly as it did — and deterministically, which the original's
// wall-clock React ticker never was.
//
// FONTS: the source's own Caprasimo + Figtree, now bundled in fonts/pack_fonts.js —
// so this pack renders in its original typography rather than a substitute.

const stage = require("../om_stage");

const SKIN = {
  id: "lantern-night",
  label: "Lantern Night",

  display: "Caprasimo", displayFallback: "Georgia, 'Times New Roman', serif",
  body: "Figtree",
  em: 0.6,                 // Caprasimo mixed-case measures ~0.58/char; held at 0.60 for margin
  headLine: 1.03, headTrack: "-0.015em", headUpper: false,
  sizes: { hook: 124, statement: 114, feature: 92, montage: 92, stats: 90, cta: 122 },

  palette: {
    sky: "#1A1817", skyDeep: "#0F0D0C", ink: "#201E1D", paper: "#F5EAD8",
    accent: "#C67139", accent2: "#7A8A5E", glow: "#E8A066",
  },
  accents: ["accent", "accent2", "glow"],
  groundKey: "sky", inkKey: "ink", paperKey: "paper",
  dark: true,
  grounds: ["sky"],          // one night; the festival itself carries the change
  chipBg: "paper",
  frameStyle: "cinema",
  cams: ["up", "zoom", "up", "drop", "zoom", "scaleout"],
  cuts: ["iris"],            // a lantern-glow iris opens and closes the cut
  energy: 0.85,

  strings: {
    hookKicker: "After dark",
    statementKicker: "The problem",
    featureKicker: "Lit from within",
    montageKicker: "Every angle",
    statsKicker: "By lantern light",
    ctaKicker: "Ready when you are",
    ctaButton: "Light it up",
  },

  world({ theme, W, H, seed }) {
    const [ar, ag, ab] = stage.hexToRgb(theme.accent);
    const [br, bg2, bb] = stage.hexToRgb(theme.accent2);
    const [gr, gg, gb] = stage.hexToRgb(theme.c.glow);
    const [pr, pg, pb] = stage.hexToRgb(theme.paper);
    const [dr, dg, db] = stage.hexToRgb(theme.c.skyDeep);
    const [ir, ig, ib] = stage.hexToRgb(theme.c.sky);
    const script = `(function(){
  var cv=document.getElementById("om-canvas"); if(!cv||!cv.getContext) return;
  var cx=cv.getContext("2d"); if(!cx) return;
  var W=${W},H=${H},S=Math.min(W,H)/1080;
  function A(a){return "rgba(${ar},${ag},${ab},"+a+")";}
  function B(a){return "rgba(${br},${bg2},${bb},"+a+")";}
  function G(a){return "rgba(${gr},${gg},${gb},"+a+")";}
  function P(a){return "rgba(${pr},${pg},${pb},"+a+")";}
  var sd=${seed >>> 0}||7; function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  var STARS=[],LANT=[],FLY=[];
  for(var i=0;i<60;i++)STARS.push({x:rnd(),y:rnd()*0.55,R:(1+rnd()*2.4)*S,tw:0.5+rnd()*1.6,ph:rnd()*6.28});
  for(var j=0;j<10;j++)LANT.push({x:0.06+(j/10)*0.9+(rnd()-0.5)*0.06,s:(0.5+rnd()*0.8)*S,speed:(26+rnd()*34)*S,sway:(20+rnd()*40)*S,swayF:0.22+rnd()*0.3,ph:rnd()*6.28,layer:j%3});
  for(var k=0;k<14;k++)FLY.push({x:rnd(),y:0.35+rnd()*0.4,ax:(30+rnd()*70)*S,ay:(20+rnd()*44)*S,fx:0.16+rnd()*0.3,fy:0.2+rnd()*0.34,ph:rnd()*6.28});
  var waterY=H*0.845;

  function lantern(x,y,s,flick){
    // halo
    var g=cx.createRadialGradient(x,y,0,x,y,120*s);
    g.addColorStop(0,G(0.5*flick)); g.addColorStop(0.55,A(0.16*flick)); g.addColorStop(1,A(0));
    cx.fillStyle=g; cx.beginPath(); cx.arc(x,y,120*s,0,6.283); cx.fill();
    cx.save(); cx.translate(x,y); cx.scale(s,s);
    // paper body
    cx.fillStyle=A(0.95); cx.beginPath();
    cx.moveTo(-34,-46); cx.bezierCurveTo(-34,-64,34,-64,34,-46);
    cx.lineTo(40,26); cx.bezierCurveTo(40,44,-40,44,-40,26); cx.closePath(); cx.fill();
    // lit upper half
    cx.fillStyle=G(0.5); cx.beginPath();
    cx.moveTo(-34,-46); cx.bezierCurveTo(-34,-64,34,-64,34,-46); cx.lineTo(36,0); cx.lineTo(-36,0); cx.closePath(); cx.fill();
    // caps + ribs
    cx.fillStyle="rgba(20,18,17,0.55)";
    cx.fillRect(-18,-56,36,8); cx.fillRect(-14,40,28,7);
    cx.strokeStyle="rgba(20,18,17,0.28)"; cx.lineWidth=2.4;
    for(var r0=-20;r0<=20;r0+=20){ cx.beginPath(); cx.moveTo(r0,-50); cx.lineTo(r0*1.14,42); cx.stroke(); }
    cx.restore();
  }

  function draw(t){
    cx.clearRect(0,0,W,H);   // MANDATORY: a world repaints from scratch every seek
    // sky gradient
    var sky=cx.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,"rgb(${dr},${dg},${db})");
    sky.addColorStop(0.7,"rgb(${ir},${ig},${ib})");
    sky.addColorStop(1,A(0.14));
    cx.fillStyle=sky; cx.fillRect(0,0,W,H);
    // stars
    for(var i=0;i<STARS.length;i++){var s=STARS[i];
      cx.globalAlpha=0.25+0.5*(0.5+0.5*Math.sin(t*s.tw+s.ph));
      cx.fillStyle=P(1); cx.beginPath(); cx.arc(s.x*W,s.y*H,s.R,0,6.283); cx.fill();}
    cx.globalAlpha=1;
    // moon + breathing halo
    var mx=W*0.78,my=H*0.14,mr=(210+Math.sin(t*0.5)*10)*S;
    var mg=cx.createRadialGradient(mx,my,0,mx,my,mr);
    mg.addColorStop(0,P(0.9)); mg.addColorStop(0.45,P(0.28)); mg.addColorStop(1,P(0));
    cx.fillStyle=mg; cx.beginPath(); cx.arc(mx,my,mr,0,6.283); cx.fill();
    cx.fillStyle=P(0.92); cx.beginPath(); cx.arc(mx,my,62*S,0,6.283); cx.fill();
    cx.fillStyle="rgba(32,30,29,0.12)"; cx.beginPath(); cx.arc(mx-27*S,my-15*S,13*S,0,6.283); cx.fill();
    cx.beginPath(); cx.arc(mx+18*S,my+30*S,8*S,0,6.283); cx.fill();
    // far hills
    cx.fillStyle="rgba(15,13,12,0.9)"; cx.beginPath(); cx.moveTo(0,H);
    var y0=H*0.78;
    for(var x=0;x<=W;x+=60) cx.lineTo(x, y0-Math.sin(x/(300*S)+1.2)*60*S-20*S);
    cx.lineTo(W,H); cx.closePath(); cx.fill();
    // rising lanterns, three parallax layers
    var LK=[0.45,0.75,1.1];
    for(var l=0;l<LANT.length;l++){var L=LANT[l];
      var k=LK[L.layer],cycle=H+500*S;
      var yy=H+240*S-((t*L.speed*k+L.ph*90)%cycle);
      var xx=L.x*W+Math.sin(t*L.swayF+L.ph)*L.sway;
      var flick=0.9+Math.sin(t*2.4+L.ph*3)*0.1;
      cx.globalAlpha=(0.45+L.layer*0.27)*flick;
      lantern(xx,yy,L.s*k,flick);
    }
    cx.globalAlpha=1;
    // water band + shimmering reflections
    var wg=cx.createLinearGradient(0,waterY,0,H);
    wg.addColorStop(0,B(0.22)); wg.addColorStop(1,"rgb(${dr},${dg},${db})");
    cx.fillStyle=wg; cx.fillRect(0,waterY,W,H-waterY);
    var px=[0.2,0.45,0.7,0.9];
    for(var w=0;w<px.length;w++){
      cx.fillStyle=G(0.16+0.08*Math.sin(t*1.1+w*1.7));
      cx.beginPath(); cx.ellipse(px[w]*W+Math.sin(t*0.4+w*2)*30*S, waterY+(40+w*22)*S, (120+Math.sin(t*0.8+w)*26)*S, 5*S, 0,0,6.283); cx.fill();
    }
    // fireflies
    for(var f=0;f<FLY.length;f++){var q=FLY[f];
      var fx=q.x*W+Math.sin(t*q.fx+q.ph)*q.ax, fy=q.y*H+Math.sin(t*q.fy+q.ph*2)*q.ay;
      var o=0.25+0.75*Math.pow(0.5+0.5*Math.sin(t*1.6+q.ph*5),2);
      cx.fillStyle=B(0.25*o); cx.beginPath(); cx.arc(fx,fy,10*S,0,6.283); cx.fill();
      cx.fillStyle=P(o); cx.beginPath(); cx.arc(fx,fy,3.4*S,0,6.283); cx.fill();
    }
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
