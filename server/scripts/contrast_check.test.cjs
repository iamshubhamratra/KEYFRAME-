// GROUND TRUTH for the contrast checker itself.
//
// The checker reads a backdrop from PIXELS, which made it mis-measure any
// element whose own furniture is drawn in the text colour: a monogram disc with
// a same-colour ring had the ring counted as glyph, and since a ring does not
// change when text is hidden, the ring became its own backdrop — 1.28:1 on type
// that is plainly legible, across nine packs. Fixing that must NOT cost the
// ability to catch genuinely same-colour text, so both are pinned here.
// Run: npm run test:checker
const fs = require("fs"), os = require("os"), path = require("path");
const { contrastCheck } = require("../src/services/contrast_check.js");
const CASES={
 "legible-dark-on-light": {bg:"#F7F1E3",fg:"#3A2A26",extra:"", expectFail:false},
 "monogram-ring-same-colour-as-glyph": {bg:"#F7F1E3",fg:"#7E534D",
   extra:"border:6px solid #7E534D;border-radius:50%;width:120px;height:120px;display:flex;align-items:center;justify-content:center;background:rgba(126,83,77,0.08);", expectFail:false},
 "white-on-white-invisible": {bg:"#FFFFFF",fg:"#FFFFFF",extra:"", expectFail:true},
 // A bright decoration crossing light type is fill-COLOURED but is not the text.
 // Counting it as evidence of invisibility reported 1:1 for a line verified by
 // screenshot as legible (voltage's hero body under its beam).
 // An odometer digit roll: a column of 0-9 inside a masked window. Only one
 // digit is visible; the rest are clipped out but still carry text nodes and
 // bounding boxes. Measuring them read 1:1 on a roll that renders perfectly.
 "clipped-odometer-column": {bg:"#0B0B12",fg:"#F5F2EA",
   wrap:(inner)=>`<div style="height:60px;overflow:hidden;">${inner}<div style="font-size:44px;font-weight:700;color:#F5F2EA">8</div><div style="font-size:44px;font-weight:700;color:#F5F2EA">7</div></div>`,
   extra:"", expectFail:false},
 "light-beam-crossing-white-text": {bg:"#140A2E",fg:"#EAF6FF",
   extra:"background:linear-gradient(105deg,transparent 42%,#FFFFFF 47%,#EAF6FF 53%,transparent 58%);padding:10px 40px;", expectFail:false},
};
(async()=>{
 let bad=0;
 for(const [name,c] of Object.entries(CASES)){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"st-"));
  const html=`<!DOCTYPE html><html><head><script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script></head><body style="margin:0">
   <div id="root" class="composition" data-composition-id="vid" data-width="720" data-height="1280" data-start="0" data-duration="4" style="width:720px;height:1280px;position:relative;background:${c.bg};">
     <div class="clip" data-start="0" data-duration="4.5" data-track-index="2" style="position:absolute;inset:0;"><div style="position:absolute;left:80px;top:500px;">
       ${(c.wrap||((x)=>x))(`<div id="probe" style="font-family:sans-serif;font-size:44px;font-weight:700;color:${c.fg};${c.extra}">A</div>`)}
     </div></div>
   </div>
   <script>var tl=gsap.timeline({paused:true});tl.to({},{duration:4});window.__timelines={vid:tl};</script>
   </body></html>`;
  fs.writeFileSync(path.join(dir,"index.html"),html,"utf8");
  fs.writeFileSync(path.join(dir,"meta.json"),JSON.stringify({durationSec:4}),"utf8");
  const res=await contrastCheck(dir,{samples:3});
  const failed=(res.failures||[]).some(f=>f.selector&&f.selector.includes("probe"));
  const ok=failed===c.expectFail;
  if(!ok)bad++;
  console.log(`  ${ok?"✓":"✗"}  ${name}: expected ${c.expectFail?"FAIL":"PASS"}, got ${failed?"FAIL":"PASS"}`
    +(res.failures?.length?` (${res.failures.map(f=>f.ratio+":1").join(",")})`:""));
  fs.rmSync(dir,{recursive:true,force:true});
 }
 console.log(bad?`\n${bad} checker case(s) wrong`:"\nchecker verdicts correct on all ground-truth cases");
 process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
