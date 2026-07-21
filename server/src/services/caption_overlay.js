// Shared burned-in caption overlay for the 3D composers (flagship / brightlife /
// three). Those composers drive a WebGL canvas + DOM text via ONE seek-safe GSAP
// timeline `tl` that HyperFrames scrubs frame-by-frame — but they never rendered
// captions, so a caption-enabled film on a 3D pack shipped an .srt/.vtt yet showed
// NO subtitles on screen (the reported bug). This adds the same seek-safe caption
// pill the 2D composers use.
//
// Contract: returns { html, css, script }.
//   html   — a #caps > #cap-pill > #cap-text element to drop inside #root.
//   css    — styling for those ids (caption pill in the bottom safe area).
//   script — a GSAP driver that hooks the composer's own `tl` (it runs in the same
//            scope where `tl` is defined) and, on each seek, shows the active cue.
// The caption element id `#cap-text` is one of the selectors injectCaptionStyle
// targets (`#kfcap, #cap-text, .cap`), so the language font + RTL override applies
// to it automatically — no per-language work needed here.
//
// A null/empty captionCues yields empty strings, so a caption-off film (or English
// with captions disabled) renders byte-identically to before.

function r(v) { return Math.round((Number(v) || 0) * 100) / 100; }

// safe: the responsive.safeArea(W,H) result ({ bottom: fraction, ... }); we ride
// higher in portrait so captions clear the Reels/TikTok UI band.
function buildCaptionOverlay({ captionCues, dims, D, safe }) {
  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null && String(c.text).trim())
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);
  if (!cues.length) return { html: "", css: "", script: "" };

  const W = dims.width, H = dims.height;
  const bottomPct = Math.round((safe && safe.bottom ? safe.bottom : 0.07) * 1000) / 10;
  const fontPx = Math.round(H * (H > W ? 0.03 : 0.034)); // a touch smaller in portrait
  const padV = Math.round(H * 0.012);
  const padH = Math.round(H * 0.022);

  const html = `<div id="caps"><div id="cap-pill"><div id="cap-text"></div></div></div>`;

  const css = [
    `#caps { position:absolute; left:0; right:0; bottom:${bottomPct}%; z-index:60; display:flex; justify-content:center; align-items:flex-end; pointer-events:none; }`,
    // Default font is a clean sans; injectCaptionStyle overrides font-family +
    // direction for non-Latin caption languages.
    `#cap-pill { max-width:80%; text-align:center; padding:${padV}px ${padH}px; border-radius:12px; background:rgba(8,10,14,0.72); border:1px solid rgba(255,255,255,0.10); box-shadow:0 6px 26px rgba(0,0,0,0.35); opacity:0; }`,
    `#cap-text { font:600 ${fontPx}px/1.34 -apple-system,system-ui,"Segoe UI",sans-serif; color:#F4F7FA; overflow-wrap:anywhere; }`,
  ].join("\n");

  // Seek-safe: one proxy tween spanning the whole timeline; on every scrub it reads
  // tl.time() and shows the matching cue. Never one clip per line (that breaks
  // deterministic seeking). Uses tl.time() the same way the composers' own progress
  // driver does.
  const script = `(function(){var kfcd=${JSON.stringify(cues)};`
    + `tl.to({__cap:0},{__cap:${D},duration:${D},ease:"none",onUpdate:function(){`
    + `var n=tl.time(),pill=document.getElementById("cap-pill"),txt=document.getElementById("cap-text");`
    + `if(!pill||!txt)return;var a=null;for(var k=0;k<kfcd.length;k++){if(n>=kfcd[k][0]&&n<kfcd[k][1]){a=kfcd[k];break;}}`
    + `if(a){if(txt.textContent!==a[2])txt.textContent=a[2];pill.style.opacity="1";}else pill.style.opacity="0";}},0);})();`;

  return { html, css, script };
}

module.exports = { buildCaptionOverlay };
