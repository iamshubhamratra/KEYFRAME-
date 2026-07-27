// DAYBREAK BAKEHOUSE — skin for the shared OM stage engine (services/om_stage.js).
//
// The source ("daybreak-bakehouse-film.jsx"): a morning bakery — sunrise light raking
// across a counter, continuously rising steam, dust motes turning in the beam, swaying
// pendant lamps. Ported as a canvas WORLD painted purely from the renderer's hf-seek
// time, so the light and steam flow across every cut deterministically.
//
// FONTS: the source's own Caprasimo + Figtree, now bundled in fonts/pack_fonts.js.

const stage = require("../om_stage");

const SKIN = {
  id: "daybreak-bakehouse",
  label: "Daybreak Bakehouse",

  display: "Caprasimo", displayFallback: "Georgia, 'Times New Roman', serif",
  body: "Figtree",
  em: 0.6,                 // Caprasimo mixed-case measures ~0.58/char; held at 0.60 for margin
  headLine: 1.02, headTrack: "-0.015em", headUpper: false,
  sizes: { hook: 126, statement: 114, feature: 92, montage: 92, stats: 90, cta: 122 },

  palette: {
    bg: "#F7EEDD", surface: "#EBDDC5", ink: "#201E1D",
    accent: "#C67139", accent2: "#7A8A5E", sun: "#FFB454",
  },
  accents: ["accent", "sun", "accent2"],
  groundKey: "bg", inkKey: "ink", paperKey: "surface",
  dark: false,
  grounds: ["bg"],
  chipBg: "bg",
  frameStyle: "soft",
  cams: ["up", "right", "zoom", "left", "drop", "scaleout"],
  cuts: ["wipe"],           // a light sweep carries the cut, edge rotating per cut
  energy: 0.95,

  strings: {
    hookKicker: "Since first light",
    statementKicker: "The problem",
    featureKicker: "Fresh out of the oven",
    montageKicker: "Every batch",
    statsKicker: "Before the queue forms",
    ctaKicker: "Doors open at six",
    ctaButton: "Start baking",
  },

  world({ theme, W, H, seed }) {
    const [ar, ag, ab] = stage.hexToRgb(theme.accent);
    const [sr2, sg2, sb2] = stage.hexToRgb(theme.c.sun);
    const [br, bg2, bb] = stage.hexToRgb(theme.accent2);
    const [ir, ig, ib] = stage.hexToRgb(theme.ink);
    const script = `(function(){
  var cv=document.getElementById("om-canvas"); if(!cv||!cv.getContext) return;
  var cx=cv.getContext("2d"); if(!cx) return;
  var W=${W},H=${H},S=Math.min(W,H)/1080;
  function A(a){return "rgba(${ar},${ag},${ab},"+a+")";}
  function SUN(a){return "rgba(${sr2},${sg2},${sb2},"+a+")";}
  function B(a){return "rgba(${br},${bg2},${bb},"+a+")";}
  function I(a){return "rgba(${ir},${ig},${ib},"+a+")";}
  var sd=${seed >>> 0}||7; function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  var MOTES=[],STEAM=[];
  for(var i=0;i<48;i++)MOTES.push({x:rnd(),y:rnd(),R:(1.4+rnd()*3.4)*S,fx:0.08+rnd()*0.2,fy:0.05+rnd()*0.14,ax:(20+rnd()*70)*S,ay:(24+rnd()*90)*S,ph:rnd()*6.28});
  // three steam columns rising off the counter line
  for(var j=0;j<3;j++)STEAM.push({x:0.22+j*0.28,w:(52+rnd()*40)*S,speed:34+rnd()*22,ph:rnd()*6.28,wob:(26+rnd()*22)*S});
  var counterY=H*0.86;

  function draw(t){
    cx.clearRect(0,0,W,H);   // MANDATORY: a world repaints from scratch every seek
    // Sunrise light raking from the top-right. It is a WASH over the paper ground, not a
    // replacement for it: the engine picks text colour from the DECLARED ground, so a world
    // that paints the whole frame at high opacity makes every contrast decision a lie —
    // which is exactly how the accent headline went invisible on the first render.
    var g=cx.createLinearGradient(W*0.95,0,W*0.15,H*0.9);
    g.addColorStop(0,SUN(0.22)); g.addColorStop(0.45,A(0.07)); g.addColorStop(1,A(0));
    cx.fillStyle=g; cx.fillRect(0,0,W,H);
    // the low sun itself, breathing
    var sx=W*0.84,sy=H*0.17,sr=(230+Math.sin(t*0.4)*14)*S;
    var sg=cx.createRadialGradient(sx,sy,0,sx,sy,sr);
    sg.addColorStop(0,SUN(0.34)); sg.addColorStop(0.5,SUN(0.09)); sg.addColorStop(1,SUN(0));
    cx.fillStyle=sg; cx.beginPath(); cx.arc(sx,sy,sr,0,6.283); cx.fill();
    // two raking light shafts drifting across the room
    for(var k=0;k<2;k++){
      var off=Math.sin(t*0.09+k*2.1)*W*0.06;
      cx.save(); cx.globalAlpha=0.06;
      cx.beginPath();
      cx.moveTo(W*(0.62+k*0.16)+off,0); cx.lineTo(W*(0.86+k*0.16)+off,0);
      cx.lineTo(W*(0.24+k*0.2)+off,H); cx.lineTo(W*(0.02+k*0.2)+off,H);
      cx.closePath(); cx.fillStyle=SUN(1); cx.fill(); cx.restore();
    }
    // dust motes turning inside the beam
    for(var m=0;m<MOTES.length;m++){var d=MOTES[m];
      var mx=d.x*W+Math.sin(t*d.fx+d.ph)*d.ax, my=d.y*H+Math.cos(t*d.fy+d.ph)*d.ay;
      cx.globalAlpha=0.10+0.26*(0.5+0.5*Math.sin(t*0.9+d.ph*3));
      cx.fillStyle=SUN(1); cx.beginPath(); cx.arc(mx,my,d.R,0,6.283); cx.fill();
    }
    cx.globalAlpha=1;
    // the counter line
    cx.fillStyle=I(0.1); cx.fillRect(0,counterY,W,H-counterY);
    cx.fillStyle=I(0.16); cx.fillRect(0,counterY,W,6*S);
    // rising steam — the pack's signature continuous motion
    for(var s2=0;s2<STEAM.length;s2++){var st=STEAM[s2];
      var cxp=st.x*W;
      for(var p=0;p<7;p++){
        var life=((t*st.speed*S+p*90*S+st.ph*40)% (H*0.62))/(H*0.62);
        var yy=counterY-life*H*0.62;
        var xx=cxp+Math.sin(life*4+st.ph)*st.wob;
        var rr=st.w*(0.35+life*1.25);
        cx.globalAlpha=Math.max(0,0.11*(1-life));
        var sgm=cx.createRadialGradient(xx,yy,0,xx,yy,rr);
        sgm.addColorStop(0,"rgba(255,255,255,1)"); sgm.addColorStop(1,"rgba(255,255,255,0)");
        cx.fillStyle=sgm; cx.beginPath(); cx.arc(xx,yy,rr,0,6.283); cx.fill();
      }
    }
    cx.globalAlpha=1;
    // swaying pendant lamps
    for(var l=0;l<3;l++){
      var lx=W*(0.18+l*0.32), sway=Math.sin(t*0.5+l*1.3)*16*S;
      var ly=H*0.1;
      cx.strokeStyle=I(0.3); cx.lineWidth=3*S;
      cx.beginPath(); cx.moveTo(lx,0); cx.lineTo(lx+sway,ly); cx.stroke();
      cx.fillStyle=B(0.85); cx.beginPath();
      cx.moveTo(lx+sway-42*S,ly+40*S); cx.lineTo(lx+sway+42*S,ly+40*S); cx.lineTo(lx+sway+18*S,ly); cx.lineTo(lx+sway-18*S,ly); cx.closePath(); cx.fill();
      var bg3=cx.createRadialGradient(lx+sway,ly+52*S,0,lx+sway,ly+52*S,120*S);
      bg3.addColorStop(0,SUN(0.2)); bg3.addColorStop(1,SUN(0));
      cx.fillStyle=bg3; cx.beginPath(); cx.arc(lx+sway,ly+52*S,120*S,0,6.283); cx.fill();
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
