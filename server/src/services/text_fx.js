// Shared TEXT-SPLIT helpers for the native composers.
//
// WHY THIS IS SHARED NOW: thirteen composers had independently copied the same
// char-split line for their CTA wordmark, carrying the same two defects.
//
//   const chars = word.split("").map((c) =>
//     `<span class="${id}-ch" style="display:inline-block;opacity:0;">${esc(c === " " ? " " : c)}</span>`
//   ).join("");
//
//   1) `c === " " ? " " : c` is a no-op ternary — it maps a space to a space. The
//      author plainly meant `&nbsp;`, and the difference is visible in the film:
//      the spans are `display:inline-block` and are joined with no whitespace
//      between them, so an ordinary space inside an inline-block box collapses to
//      zero width. "Write 4x Faster" rendered as "Write4xFaster" on the CTA of the
//      audited video. Every scene using a char entrance had its words welded shut.
//
//   2) `split("")` iterates UTF-16 CODE UNITS. That tears an emoji or any
//      astral-plane character into two broken halves, and for Devanagari/Indic/
//      Arabic it separates a base consonant from its combining matras — each lands
//      in its own span, so the shaper can't form the cluster and the matras render
//      detached. Splitting by GRAPHEME CLUSTER keeps each aksara whole, which is
//      the same fix scene_kit.graphemesOf already made for its own headline spans.
//
// Both are fixed once here rather than thirteen times.

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Split into user-perceived characters (grapheme clusters), not code units.
// Falls back to code points where Intl.Segmenter is unavailable; Node >= 16 and
// the headless-Chrome renderer both have it.
function graphemesOf(text) {
  const s = String(text == null ? "" : text);
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(s), (x) => x.segment);
  } catch {
    return [...s];
  }
}

/**
 * Per-character spans for a staggered entrance.
 *
 * A space becomes a literal `&nbsp;` (NOT escaped) so it survives inside an
 * inline-block box — this is the "Write4xFaster" fix. Everything else is escaped
 * normally.
 *
 * @param {string} text  the word/phrase to split
 * @param {string} cls   class applied to every span (the GSAP stagger target)
 * @param {string} style inline style for each span
 */
function charSpans(text, cls, style = "display:inline-block;opacity:0;") {
  return graphemesOf(text)
    .map((ch) => `<span class="${cls}" style="${style}">${ch === " " ? "&nbsp;" : esc(ch)}</span>`)
    .join("");
}

/**
 * The first line of a scene's copy that the composer has NOT already shown.
 *
 * The storyboard hands every scene a headline plus subtext and 2–3 on-screen lines, and
 * the script model reliably fills all of them — but several builders render only the
 * headline, so a feature or proof beat reaches the film as a picture with two words and
 * nothing explaining it. This picks the best remaining line so a builder can render a
 * supporting deck without duplicating what is already on screen.
 *
 * @param {object} scene
 * @param {string[]} shown  copy already rendered by the caller (headline, a caption, …)
 */
function supportLine(scene, shown = []) {
  if (!scene) return "";
  const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();
  const used = new Set(shown.map(norm).filter(Boolean));
  used.add(norm(scene.headline));
  used.add(norm(scene.title));
  const ost = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean).map(String) : [];
  for (const t of ost) if (!used.has(norm(t))) return t.trim();
  for (const t of [scene.subtext, scene.emphasis]) {
    if (t && !used.has(norm(t))) return String(t).trim();
  }
  return "";
}

module.exports = { charSpans, graphemesOf, esc, supportLine };
