// Make the portrait-audit-out build_*/ compositions viewable in a plain browser
// (VS Code Live Server on :5500, or file://).
//
// The composed index.html is built for the hyperframes RENDER runtime, not for a
// browser: #root carries data-width/data-height but no CSS size, so a browser
// collapses it to 0px height (all clips are position:absolute inside an
// overflow:hidden #root) and shows a blank white page. GSAP also loads from a
// CDN, and the timeline is PAUSED (built for frame-seeking), so even when sized
// it would sit on frame 0.
//
// This writes a self-contained preview.html next to each index.html:
//   - GSAP inlined (works with no network),
//   - #root sized to data-width x data-height, scaled to fit the viewport, centered,
//   - the "vid" timeline autoplayed and looped, with a spacebar pause/scrub + timecode,
// and a top-level index.html gallery linking every build. Open:
//   http://127.0.0.1:5500/server/scripts/portrait-audit-out/
//
// Re-run any time after a fresh `npm run audit:portrait`. Never rendered — a
// pure dev-viewing aid. Usage: node scripts/view-portrait-audit.js [outDir]

const fs = require("node:fs");
const path = require("node:path");

const OUT = path.resolve(process.argv[2] || path.join(__dirname, "portrait-audit-out"));

function localGsap() {
  for (const p of [
    path.join(__dirname, "..", "..", "web", "node_modules", "gsap", "dist", "gsap.min.js"),
    path.join(__dirname, "..", "node_modules", "gsap", "dist", "gsap.min.js"),
    path.join(__dirname, "..", "showcase", "flagship", "gsap.min.js"),
  ]) {
    try { return fs.readFileSync(p, "utf8"); } catch { /* next */ }
  }
  return null;
}

// The viewer runtime: fit #root to the window and autoplay the paused timeline.
const VIEWER = `
<style id="__pvcss">html,body{margin:0;background:#0d0d10;overflow:hidden}</style>
<div id="__pv" style="position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99999;
  font:12px ui-monospace,monospace;background:rgba(0,0,0,.72);color:#fff;padding:7px 13px;border-radius:999px;
  display:flex;gap:12px;align-items:center;user-select:none;pointer-events:none;white-space:nowrap">
  <span id="__pvt">loading…</span><span style="opacity:.55">space = pause/scrub &middot; click = restart</span></div>
<script>
(function(){
  function fit(){
    var r=document.getElementById("root"); if(!r) return;
    var w=+r.getAttribute("data-width")||1080, h=+r.getAttribute("data-height")||1920;
    r.style.position="fixed"; r.style.top="50%"; r.style.left="50%"; r.style.margin="0";
    r.style.width=w+"px"; r.style.height=h+"px"; r.style.transformOrigin="center center";
    var pad=32, s=Math.min((innerWidth-pad)/w,(innerHeight-pad)/h);
    r.style.transform="translate(-50%,-50%) scale("+s+")";
  }
  addEventListener("resize",fit); fit();
  var lbl=document.getElementById("__pvt");
  (function wait(n){
    var tl=window.__timelines&&window.__timelines["vid"];
    if(!tl){ if(n<250) return setTimeout(function(){wait(n+1);},60); if(lbl)lbl.textContent="no timeline (GSAP failed?)"; return; }
    var dur=tl.duration();
    tl.eventCallback("onUpdate",function(){ if(lbl)lbl.textContent=tl.time().toFixed(1)+"s / "+dur.toFixed(0)+"s"; });
    tl.eventCallback("onComplete",function(){ tl.play(0); });
    tl.play(0);
    addEventListener("keydown",function(e){ if(e.code==="Space"){e.preventDefault(); tl.paused()?tl.play():tl.pause();} });
    addEventListener("click",function(){ tl.play(0); });
  })(0);
})();
</script>`;

function makePreview(indexHtml, gsap) {
  let html = indexHtml;
  // Inline GSAP (any CDN gsap tag) so it works offline / behind a proxy.
  if (gsap) {
    const tag = "<script>/* gsap inlined for offline preview */\n" + gsap + "\n</scr" + "ipt>";
    html = html.replace(/<script\b[^>]*\bsrc="[^"]*gsap[^"]*"[^>]*>\s*<\/script>/i, tag);
  }
  // Drop the viewer just before </body> (fallback: append).
  if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, VIEWER + "\n</body>");
  else html += VIEWER;
  return html;
}

function main() {
  if (!fs.existsSync(OUT)) { console.error(`[view] not found: ${OUT}`); process.exit(2); }
  const gsap = localGsap();
  if (!gsap) console.warn("[view] no local gsap.min.js found — previews will need network for GSAP");

  const builds = fs.readdirSync(OUT)
    .filter((d) => d.startsWith("build_") && fs.existsSync(path.join(OUT, d, "index.html")))
    .sort();

  const cards = [];
  for (const dir of builds) {
    const pack = dir.replace(/^build_/, "");
    const idx = fs.readFileSync(path.join(OUT, dir, "index.html"), "utf8");
    const m = idx.match(/<div id="root"[^>]*data-width="(\d+)"[^>]*data-height="(\d+)"/);
    const w = m ? +m[1] : 1080, h = m ? +m[2] : 1920;
    fs.writeFileSync(path.join(OUT, dir, "preview.html"), makePreview(idx, gsap), "utf8");
    cards.push({ pack, dir, w, h });
    console.log(`[view] ${pack}: preview.html (${w}x${h})`);
  }

  // Gallery index — Live Server serves this at the folder URL.
  const items = cards.map(({ pack, dir, w, h }) =>
    `<a class="card" href="${dir}/preview.html">
      <div class="thumb" style="aspect-ratio:${w}/${h}"><span>${w>h?"▭":"▯"}</span></div>
      <div class="meta"><b>${pack}</b><i>${w}×${h}</i></div></a>`).join("\n");
  const gallery =
`<!doctype html><html><head><meta charset="utf-8"><title>Portrait Audit — ${cards.length} builds</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#0d0d10;color:#eee;font:15px/1.5 ui-sans-serif,system-ui,sans-serif;padding:32px}
  h1{font-size:22px;margin:0 0 4px}p{color:#888;margin:0 0 26px;font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:18px}
  .card{display:block;text-decoration:none;color:inherit;background:#17171c;border:1px solid #26262e;border-radius:12px;overflow:hidden;transition:.2s}
  .card:hover{border-color:#e832a8;transform:translateY(-3px)}
  .thumb{display:grid;place-items:center;background:linear-gradient(135deg,#1c1c24,#111);color:#3a3a44;font-size:34px;max-height:260px}
  .meta{display:flex;justify-content:space-between;align-items:center;padding:11px 14px}
  .meta b{font-weight:600}.meta i{color:#777;font-style:normal;font:12px ui-monospace,monospace}
</style></head><body>
<h1>Portrait Audit builds</h1>
<p>${cards.length} composition${cards.length===1?"":"s"} · click any card to watch it play (scaled to fit, looped)</p>
<div class="grid">${items}</div></body></html>`;
  fs.writeFileSync(path.join(OUT, "index.html"), gallery, "utf8");

  console.log(`\n[view] wrote ${cards.length} preview.html + index.html gallery`);
  console.log(`[view] open  http://127.0.0.1:5500/server/scripts/portrait-audit-out/`);
}

main();
