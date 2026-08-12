// KINETIC SCRIPT LAYER — the narration, on screen, in big type.
//
// Requirement (2026-07-31): while the voiceover plays, ~80% of the spoken script
// should be readable in the video as large animated type. The frame packs each
// have their own text slots with their own character budgets, so distributing a
// full script through them only ever gets partway there and varies per template.
// This layer is template-independent: it renders the narration itself, phrase by
// phrase, over whatever the pack drew.
//
// It is NOT the subtitle node (#cap-pill). Subtitles are small, bottom-anchored
// and opt-in; this is display type sized to fill the frame, always on, and it
// suppresses the subtitle node so the two never double up.
//
// SEEK-SAFETY: a renderer captures frames by seeking, never by playing, so the
// visible phrase must be a pure function of time. Every phrase is emitted as its
// own absolutely-positioned node and shown/hidden by a single time lookup, with
// no transitions or animations that carry state between frames — scrub anywhere
// and the frame is identical to a linear play at that instant.

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;

// #rgb/#rrggbb -> rgba(). Kept local rather than imported from template_engine:
// that module requires THIS one, and closing the loop would leave one of the two
// holding a half-initialised exports object depending on which loaded first.
function hexA(hex, a) {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (!isFinite(n)) return `rgba(0,0,0,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Split a spoken line into readable phrases. Chunking on punctuation first keeps
// natural breath groups; long clauses are then split on word count so a phrase
// never overruns the frame at display size.
function phrasesFor(text, maxWords) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out = [];
  for (const part of clean.split(/(?<=[.!?,;:—])\s+/)) {
    const words = part.replace(/[.,;:—]+$/, "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    for (let i = 0; i < words.length; i += maxWords) out.push(words.slice(i, i + maxWords).join(" "));
  }
  return out;
}

/**
 * Build the overlay for a set of caption cues.
 *
 * @param {Array}  cues  [{ start, end, text }] — the VO clips, already timed
 * @param {number} W,H   composition size
 * @param {object} opts  { coverage } target share of each cue's span to fill (0-1),
 *                       plus the pack's own { ink, ground, font } so this layer
 *                       reads as part of the film rather than pasted onto it
 * @returns {{html:string, css:string, js:string}|null} null when there is nothing to show
 */
function buildScriptOverlay(cues, W, H, opts = {}) {
  const list = (Array.isArray(cues) ? cues : [])
    .map((c) => ({ start: Number(c.start ?? c.t), end: Number(c.end ?? c.e), text: String(c.text ?? c.x ?? "") }))
    .filter((c) => c.text.trim() && isFinite(c.start) && isFinite(c.end) && c.end > c.start)
    .sort((a, b) => a.start - b.start);
  if (!list.length) return null;

  const land = W >= H;
  const maxWords = land ? 5 : 4;               // portrait frames fit fewer words per line
  const coverage = Math.min(1, Math.max(0.5, Number(opts.coverage) || 0.8));

  // Lay every phrase on the timeline inside its cue's own span. The phrases of a
  // cue share that span proportionally to their length, so a long phrase holds
  // longer than a short one and the reading pace tracks the speech.
  const items = [];
  for (const cue of list) {
    const ph = phrasesFor(cue.text, maxWords);
    if (!ph.length) continue;
    const span = cue.end - cue.start;
    const total = ph.reduce((a, p) => a + p.length, 0) || 1;
    let t = cue.start;
    ph.forEach((p, i) => {
      // `coverage` leaves a sliver of breathing room between phrases rather than
      // butting them together, so a cut reads as a change rather than a flicker.
      const share = (p.length / total) * span;
      const dur = Math.max(0.35, share * coverage);
      items.push({ t: r(t), e: r(Math.min(cue.end, t + dur)), x: p, i: items.length });
      t += share;
    });
  }
  if (!items.length) return null;

  // Display size: fill the frame width. Long phrases step down so a line never
  // overruns — measured against the frame, not a fixed breakpoint.
  // Headline scale, not caption scale — this layer is the film's display type.
  const base = land ? W * 0.058 : W * 0.100;
  const sizeFor = (s) => {
    const n = s.length;
    const k = n <= 12 ? 1.25 : n <= 20 ? 1.0 : n <= 30 ? 0.8 : 0.65;
    return Math.round(base * k);
  };

  // THE PACK'S OWN INK, ON THE PACK'S OWN GROUND.
  //
  // This layer used to be hardcoded white with a black text-shadow, on the theory
  // that a hard shadow reads over any ground. It does not: `npm run audit:families`
  // measured 100 AA failures across 40 packs from this node alone — white type on
  // the light-grounded packs came in at 1.1:1 against a 4.5:1 floor. A shadow is
  // not a background, so nothing in the contrast pipeline could rescue it either:
  // the layer is built here, at composition time, out of reach of the pack-token
  // recolor passes.
  //
  // So the caller hands us the pack's resolved ink/ground/display face (already
  // contrast-checked against each other by the family theme), and each phrase
  // carries a plate in that ground colour which HUGS the text rather than boxing
  // the frame. That fixes the measured contrast, survives a photographic scene
  // underneath, and makes the layer look authored by the pack instead of pasted on.
  const ink = /^#[0-9a-f]{3,8}$/i.test(String(opts.ink || "")) ? opts.ink : "#FFFFFF";
  const ground = /^#[0-9a-f]{3,8}$/i.test(String(opts.ground || "")) ? opts.ground : "#0B0B0C";
  const font = String(opts.font || "").trim() || "'Anton','Archivo Black',system-ui,sans-serif";

  const html = `<div id="kf-script" aria-hidden="true">`
    + items.map((it) => `<div class="kf-ph" id="kf-ph-${it.i}" style="font-size:${sizeFor(it.x)}px;"><span>${esc(it.x)}</span></div>`).join("")
    + `</div>`;

  // THE SPOKEN LINE IS THE HEADLINE, NOT A SUBTITLE. It used to sit low on the
  // frame on a solid near-black plate — which is exactly the look of burned-in
  // captions, and the user asked for the opposite: the film's own display type,
  // up in the headline zone.
  //
  // Losing the plate loses the contrast guarantee it bought (these are compiled
  // films; the background underneath is unknowable). A heavy outline replaces it:
  // the glyphs carry their own dark edge, so white display type stays legible on
  // a light ground, a photo or a gradient without a box around it.
  const halo = hexA("#000000", 0.92);
  const edge = (n) => [
    `${n} 0 0 ${halo}`, `-${n} 0 0 ${halo}`, `0 ${n} 0 ${halo}`, `0 -${n} 0 ${halo}`,
    `${n} ${n} 0 ${halo}`, `-${n} ${n} 0 ${halo}`, `${n} -${n} 0 ${halo}`, `-${n} -${n} 0 ${halo}`,
  ].join(",");
  const css = `
#kf-script{position:absolute;left:0;right:0;${land ? "bottom:9%" : "top:20%"};
  z-index:70;pointer-events:none;text-align:center;padding:0 6%;}
#kf-script .kf-ph{display:none;font-family:${font};
  font-weight:900;line-height:1.06;letter-spacing:-0.02em;text-transform:uppercase;}
#kf-script .kf-ph span{color:${ink};display:inline;
  /* No plate — the outline IS the legibility, so this reads as the film's
     typography rather than a caption bar. */
  text-shadow:${edge("0.035em")},0 0.1em 0.35em ${hexA("#000000", 0.55)};
  paint-order:stroke fill;-webkit-text-stroke:0.012em ${hexA(ground, 0.55)};}
/* The pack's own subtitle node is suppressed — this layer IS the spoken text. */
#cap-pill{display:none !important;}`;

  // A single time lookup, no state. Callers drive it from their own seek.
  const js = `(function(){
  var IT=${JSON.stringify(items.map((it) => [it.t, it.e, it.i]))};
  window.__kfScript=function(t){
    var on=-1;
    for(var i=0;i<IT.length;i++){ if(t>=IT[i][0]&&t<IT[i][1]){ on=IT[i][2]; break; } }
    for(var j=0;j<IT.length;j++){
      var el=document.getElementById('kf-ph-'+IT[j][2]);
      if(el) el.style.display=(IT[j][2]===on)?'block':'none';
    }
  };
})();`;

  return { html, css, js, phraseCount: items.length };
}

module.exports = { buildScriptOverlay, phrasesFor };
