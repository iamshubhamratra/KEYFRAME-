// Patch 58 long-form packs: they all ship identical layout/textfx/motion/fx
// even though the template kit carries 74 distinct scene renderers and each
// film paints a different SVG world. Uniform tokens mean any scene-kit fallback
// (auto jobs, portrait, runtime smoke) renders the same "rise/accent/panel"
// film regardless of which Long Form shelf card the user picked — which is the
// "all long-form look the same" report.
// This diversifies the manifest-declared tokens deterministically per slug
// so every long-form pack keeps a distinct cut, entrance, emphasis, case,
// layout and drift while preserving its authored colours/fonts/world.

const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "../..");
const FRAMES = path.join(ROOT, "frames");

// pools drawn from the shipped short packs (so every value is a real style)
const ENTERS = ["rise","glitch","zap","pop","slide","reveal","fade","type"];
const EMPHASIS = ["accent","marker","ring","glow","underline","bold","soft"];
const CASES = ["mixed","upper","lower"];
const CUTS = ["panel","cut","flux","zoom","glide","shutter"];
const STATS = ["inline","card","strip","badge"];
const ASSET_STYLES = ["plain","browser","card","polaroid"];
const alignFor = (slug) => {
  const h = [...slug].reduce((a,c)=>a+c.charCodeAt(0),0);
  return ["left","center","left"][h % 3];
};
function pick(arr, slug, offset=0){
  const h = [...slug].reduce((a,c)=>a+c.charCodeAt(0),0) + offset*31;
  return arr[h % arr.length];
}
function hash01(slug, salt=""){
  let h=5381;
  for(let i=0;i<slug.length;i++) h = ((h<<5)+h) ^ slug.charCodeAt(i);
  for(let i=0;i<salt.length;i++) h = ((h<<5)+h) ^ salt.charCodeAt(i);
  return (h>>>0) % 1000 / 1000;
}

let changed=0;
for(const slug of fs.readdirSync(FRAMES)){
  const pj = path.join(FRAMES, slug, "pack.json");
  if(!fs.existsSync(pj)) continue;
  const m = JSON.parse(fs.readFileSync(pj,"utf8"));
  if(!m.longForm) continue;
  // keep colours/fonts/vibe/surface/assets/camera3d/portraitNative/renderer as-is
  const prev = JSON.stringify({layout:m.layout,textfx:m.textfx,motion:m.motion,fx:m.fx});
  // derive distinct tokens
  const enter = pick(ENTERS, slug, 1);
  const emphasis = pick(EMPHASIS, slug, 2);
  const c = pick(CASES, slug, 3);
  const cut = pick(CUTS, slug, 4);
  const stat = pick(STATS, slug, 5);
  const assetStyle = pick(ASSET_STYLES, slug, 6);
  const align = alignFor(slug);
  const tracking = c==="upper" ? -0.02 : 0;
  const weight = c==="upper" && hash01(slug,"w")>0.6 ? 800 : null;
  const drift = 0.96 + hash01(slug,"d")*0.08; // 0.96 - 1.04
  const propFill = hash01(slug,"pf")>0.7;
  const kicker = true;
  const underline = hash01(slug,"ul")>0.5;
  const sizeScale = 0.98 + hash01(slug,"ss")*0.08; // 0.98-1.06

  m.layout = { propFill, kicker, underline, stat, assetStyle };
  m.textfx = { enter, emphasis, case: c, tracking, weight, sizeScale: Math.round(sizeScale*100)/100, align: c==="upper" ? "center" : align };
  m.motion = { cut, drift: Math.round(drift*100)/100 };
  // fx.canvas: short packs show variety clay/none etc; keep none for longform
  // but diversify where hash says so — gives subtle grain/noise per pack without
  // hiding the SVG world
  const canvasPool = ["none","none","none","grain","clay"];
  m.fx = { canvas: pick(canvasPool, slug, 7), three: null };

  const next = JSON.stringify({layout:m.layout,textfx:m.textfx,motion:m.motion,fx:m.fx});
  if(prev!==next){
    fs.writeFileSync(pj, JSON.stringify(m,null,2)+"\n","utf8");
    changed++;
    console.log(`${slug.padEnd(18)} enter:${enter.padEnd(8)} emphasis:${emphasis.padEnd(9)} cut:${cut.padEnd(7)} case:${c.padEnd(6)} stat:${stat}`);
  }
}
console.log(`\npatched ${changed} long-form pack(s)`);
