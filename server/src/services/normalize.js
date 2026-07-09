// Deterministic, low-risk normalizations applied to composer output BEFORE the
// hyperframes lint gate. These fix mechanical violations the LLM commonly emits
// that are 100% safe to rewrite in code (no layout/z-order impact), so the
// lint+repair loop doesn't burn an LLM lap (or fall back) on them.
//
// Scope is intentionally conservative: only transforms that cannot break a
// valid composition. Structural/animation issues (track overlaps, GSAP
// from/transform conflicts) are left to the prompt + repair LLM, since fixing
// them blindly risks changing the intended visual result.

const fs = require("node:fs");
const path = require("node:path");

// The only font stack the offline renderer + lint resolve without @font-face.
// Two quoting variants: when we inject into a double-quoted inline style="..."
// we MUST use single quotes (and vice-versa) or the injected quote prematurely
// closes the attribute and mangles the tag.
const SAFE_FONT_STACK    = 'Inter, "Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif';
const SAFE_FONT_STACK_SQ = "Inter, 'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif";

// Replace every `font-family: …` declaration inside a CSS value string with the
// safe system stack (bounded by ; or }). Operates on a value/attribute body
// that has ALREADY been isolated, so the closing attribute quote is not in play.
function replaceFamilyDecls(css, stack) {
  return String(css).replace(/font-family\s*:\s*[^;}]*/gi, "font-family: " + stack);
}

// Force every `font-family` to the safe system stack. The renderer can't load
// webfonts and lint rejects any family it can't auto-resolve (e.g. a pack's
// "Space Grotesk") with `font_family_without_font_face`. Done context-aware in
// three passes so we never inject a quote that breaks an inline style attribute
// (the old single-regex version corrupted `style="font-family: X"` because its
// match crossed the attribute's closing quote).
function normalizeFontFamilies(html) {
  let out = String(html);
  // 1) Inline style="..." (double-quoted) — inject the single-quote stack.
  out = out.replace(/style\s*=\s*"([^"]*)"/gi, (_m, css) => `style="${replaceFamilyDecls(css, SAFE_FONT_STACK_SQ)}"`);
  // 2) Inline style='...' (single-quoted) — inject the double-quote stack.
  out = out.replace(/style\s*=\s*'([^']*)'/gi, (_m, css) => `style='${replaceFamilyDecls(css, SAFE_FONT_STACK)}'`);
  // 3) <style> blocks / CSS rules — quotes here are CSS syntax, not delimiters.
  out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open, css, close) => open + replaceFamilyDecls(css, SAFE_FONT_STACK) + close);
  return out;
}

// Strip external font loading — the offline renderer fails on it and the lint
// rejects it (`google_fonts_import`). Also drop `-apple-system` from any
// font-family (lint flags it as an unresolved family). Text then resolves via
// the system stack, exactly what the prompt now asks for.
function stripExternalFonts(html) {
  let out = String(html);

  // <link ... fonts.googleapis.com|fonts.gstatic.com ...> (preconnect + stylesheet)
  out = out.replace(
    /<link\b[^>]*\bhref\s*=\s*["'][^"']*fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*>\s*/gi,
    ""
  );
  // @import url('https://fonts.googleapis.com/...');  (and bare @import "...")
  out = out.replace(
    /@import\s+(?:url\(\s*)?["']?[^"';)]*fonts\.googleapis\.com[^"';)]*["']?\s*\)?\s*;?/gi,
    ""
  );
  // `-apple-system` token inside font-family lists.
  out = out.replace(/\s*,?\s*-apple-system(?=\s*[,;}"'])/gi, "");

  return out;
}

// Inject class="clip" into any element that has BOTH data-start and
// data-duration but is missing `clip` from its class. The lint rule
// `timed_element_missing_clip_class` requires every timed element to be a
// .clip (the runtime keys visibility off it); the LLM — especially weaker
// models — routinely forgets it on a few elements, which fails lint and burns
// a repair lap (or falls back). Adding the class is exactly the lint's own
// suggested fix and is 100% safe: a timed element IS a clip by definition.
// The root composition element (#root / .composition) carries timing attrs but
// is NOT a clip, so it is explicitly skipped.
function ensureClipClass(html) {
  return String(html).replace(/<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g, (full, name, attrs) => {
    if (!/\bdata-start\s*=/.test(attrs) || !/\bdata-duration\s*=/.test(attrs)) return full;
    // Skip the root composition element — it is timed but not a .clip.
    if (/\bid\s*=\s*["']root["']/.test(attrs) || /\bclass\s*=\s*["'][^"']*\bcomposition\b[^"']*["']/.test(attrs)) return full;
    const selfClose = /\/>$/.test(full) ? " /" : "";
    const body = attrs.replace(/\s*\/$/, "");
    const cm = body.match(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/);
    if (cm) {
      const val = cm[1] != null ? cm[1] : cm[2];
      if (/\bclip\b/.test(val)) return full; // already a clip
      const merged = body.replace(cm[0], `class="${(val + " clip").trim()}"`);
      return `<${name}${merged}${selfClose}>`;
    }
    return `<${name}${body} class="clip"${selfClose}>`;
  });
}

// Deterministically remove same-track time overlaps — the single most common
// reason rich compositions get rejected (every model, including opus-4.8, stacks
// e.g. bg+scrim+content or per-scene overlays on one track and trips
// `overlapping_clips_same_track`, which has caused most fallbacks). The lint's
// own suggested fix is "move one clip to a different data-track-index".
//
// Algorithm = greedy interval coloring in DOCUMENT ORDER: walk clips top-to-bottom
// and give each the LOWEST track index on which no already-placed clip overlaps
// its [start, start+duration) window. Two properties make this safe:
//   • Correctness: by construction no two clips on a track overlap in time.
//   • Z-order preserved: clips that DON'T overlap in time never co-exist on
//     screen, so their relative track is visually irrelevant; clips that DO
//     overlap keep their document order (earlier DOM → lower track → behind),
//     which is exactly how composers author stacking (bg first, text last).
// The root composition element is timed but is NOT a clip, so it is skipped.
function reflowTrackOverlaps(html) {
  const src = String(html);
  const tagRe = /<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g;
  const tracks = []; // tracks[t] = [[start,end), ...] already placed
  let changed = false;

  const out = src.replace(tagRe, (full, name, attrs) => {
    if (!/\bdata-start\s*=/.test(attrs) || !/\bdata-duration\s*=/.test(attrs)) return full;
    // Skip the root composition element (timed, but not a track-bearing clip).
    if (/\bid\s*=\s*["']root["']/.test(attrs) || /\bclass\s*=\s*["'][^"']*\bcomposition\b[^"']*["']/.test(attrs)) return full;

    const sm = attrs.match(/\bdata-start\s*=\s*["']?(-?[\d.]+)/);
    const dm = attrs.match(/\bdata-duration\s*=\s*["']?(-?[\d.]+)/);
    if (!sm || !dm) return full;
    const start = parseFloat(sm[1]);
    const dur = parseFloat(dm[1]);
    if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) return full;
    const end = start + dur;

    // Lowest track with no time-overlap (half-open intervals: touching is OK).
    let t = 0;
    while (tracks[t] && tracks[t].some(([s, e]) => start < e && s < end)) t++;
    (tracks[t] = tracks[t] || []).push([start, end]);

    const tm = attrs.match(/\bdata-track-index\s*=\s*["']?(-?\d+)["']?/);
    const cur = tm ? parseInt(tm[1], 10) : null;
    if (cur === t) return full; // already correct, leave verbatim
    changed = true;
    const selfClose = /\/>$/.test(full) ? " /" : "";
    let body = attrs.replace(/\s*\/$/, "");
    if (tm) body = body.replace(/\bdata-track-index\s*=\s*["']?-?\d+["']?/, `data-track-index="${t}"`);
    else body = `${body} data-track-index="${t}"`;
    return `<${name}${body}${selfClose}>`;
  });

  return { html: changed ? out : src, changed };
}

// Defense-in-depth: tag text-bearing elements that may be COVERED with
// data-layout-allow-occlusion so `hyperframes inspect` treats intentional layering
// as allowed. The audit suppresses occlusion ONLY when the flag is on the COVERED
// text element (verified: layout-audit reads element.closest('[data-layout-allow-occlusion]')
// on the text-bearing element) — so we tag the per-scene sticker/content overlays,
// NEVER the occluder. Gated on position:absolute so a genuine content tile in a
// flex/grid (which SHOULD be flagged if it collides) is never silenced.
const COVERED_TEXT_CLASS_RE = /\b(?:badge|chip|stat|pill|sticker|scene-content|content-zone)\b/;
function tagCoveredText(html) {
  return String(html).replace(/<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/g, (full, name, attrs) => {
    if (/\bdata-layout-allow-occlusion\b/.test(attrs)) return full;       // already tagged
    if (!/position\s*:\s*absolute/i.test(attrs)) return full;             // content-grid tiles excluded
    const cm = attrs.match(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/);
    if (!cm) return full;
    const val = cm[1] != null ? cm[1] : cm[2];
    if (!COVERED_TEXT_CLASS_RE.test(val)) return full;
    const selfClose = /\/>$/.test(full) ? " /" : "";
    const body = attrs.replace(/\s*\/$/, "");
    return `<${name}${body} data-layout-allow-occlusion${selfClose}>`;
  });
}

// Remove <img>/<video> whose LOCAL src file does not exist in jobDir. The
// composer sometimes invents sequential filenames (3.jpg, 4.jpg) for assets
// that were never fetched (a failed download leaves a hole in the numbering),
// which ship as broken/blank images and trip the hyperframes "missing asset"
// lint. Stripping them is safe — the scene loses one image (slightly less rich)
// but never shows a broken box, and lint passes without a wasted repair lap.
// data:/http(s) srcs are left untouched.
function stripMissingAssets(html, jobDir) {
  let removed = 0;
  let out = String(html).replace(
    /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*\/?>|<video\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>(?:[\s\S]*?<\/video>)?/gi,
    (full, imgSrc, videoSrc) => {
      const src = imgSrc || videoSrc;
      if (!src || /^(data:|https?:)/i.test(src)) return full;
      const abs = path.join(jobDir, src.split("/").join(path.sep));
      try { if (fs.existsSync(abs)) return full; } catch { return full; }
      removed++;
      return "";
    }
  );
  // Collapse a montage tile (scene_kit's .kftile) whose <img> was just stripped —
  // otherwise it renders as an empty bordered/shadowed box (the "broken image
  // glyph where a photo should be"). A tile holds only an <img> + an optional
  // wash <span> and never nests a <div>, so "a .kftile div with no <img> left
  // before its close" is exactly an emptied tile. Leaves populated tiles intact.
  if (removed) {
    out = out.replace(
      /<div\b[^>]*class="[^"]*\bkftile\b[^"]*"[^>]*>(?:(?!<img\b|<\/div>)[\s\S])*?<\/div>/gi,
      ""
    );
  }
  return { html: out, removed };
}

// Guarantee a real animated graphics layer. The occlusion-repair laps disable
// the composer's inline-vector floor (they pass __lintFeedback), so a comp can
// ship with ~0 inline SVG primitives — reading as a flat photo slideshow ("no
// vectors / no graphics"). If the document is vector-thin, inject a deterministic
// CSS-animated bokeh field as a full-duration background layer: no text (so it
// can never occlude), pointer-events:none, behind content. CSS keyframes are
// seeked deterministically by the renderer, so it animates without GSAP.
const MIN_INLINE_PRIMS = 8;
function ensureVectorField(html) {
  const src = String(html);
  const PRIM_RE = /<(?:circle|ellipse|path|rect|polygon|polyline|line)(?=[\s/>])/gi;
  const svgBlocks = src.match(/<svg[\s\S]*?<\/svg>/gi) || [];
  const prims = svgBlocks.reduce((n, b) => n + (b.match(PRIM_RE) || []).length, 0);
  if (prims >= MIN_INLINE_PRIMS) return { html: src, injected: false };

  const dm = src.match(/data-composition-id\s*=\s*["']vid["'][^>]*?\bdata-duration\s*=\s*["']?([\d.]+)/i)
    || src.match(/\bdata-duration\s*=\s*["']?([\d.]+)/i);
  const dur = dm ? parseFloat(dm[1]) : 15;

  const circles = [];
  for (let i = 0; i < 18; i++) {
    const cx = ((i * 211) % 1900) + 10;
    const cy = ((i * 137) % 1040) + 20;
    const r = 5 + (i % 5) * 8;
    const d = 5 + (i % 4);
    const delay = (i % 6) * 0.5;
    const op = (0.05 + (i % 3) * 0.04).toFixed(2);
    circles.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" opacity="${op}" style="animation:hf-bokeh ${d}s ease-in-out ${delay}s infinite alternate"/>`);
  }
  // Keep the <style> INSIDE the clip so #root's only new child is a .clip
  // (lint wants every direct child of #root to be a clip). @keyframes is global
  // regardless of where the <style> sits.
  const field =
    `<div class="clip" data-start="0" data-duration="${dur}" data-track-index="0" ` +
    `style="position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden">` +
    `<style>@keyframes hf-bokeh{from{transform:translateY(0) scale(1)}to{transform:translateY(-24px) scale(1.16)}}</style>` +
    `<svg width="100%" height="100%" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice" ` +
    `style="position:absolute;inset:0">${circles.join("")}</svg></div>`;

  const out = src.replace(/(<div[^>]*\bid\s*=\s*["']root["'][^>]*>)/i, `$1${field}`);
  return { html: out, injected: out !== src };
}

// Apply all safe normalizations. Returns { html, changed:[...] } so the caller
// can log what was touched.
function normalizeComposition(html) {
  const changed = [];
  let out = String(html);

  const afterFonts = stripExternalFonts(out);
  if (afterFonts !== out) { changed.push("stripped external fonts"); out = afterFonts; }

  const afterFamilies = normalizeFontFamilies(out);
  if (afterFamilies !== out) { changed.push("normalized font-family to system stack"); out = afterFamilies; }

  const afterClip = ensureClipClass(out);
  if (afterClip !== out) { changed.push("added missing class=\"clip\" to timed element(s)"); out = afterClip; }

  // Guarantee a graphics layer when the comp is vector-thin (BEFORE reflow so the
  // injected full-duration field gets its own non-overlapping track).
  const afterField = ensureVectorField(out);
  if (afterField.injected) { changed.push("injected animated bokeh field (vector-thin comp)"); out = afterField.html; }

  // Run AFTER ensureClipClass so newly-marked clips are also de-overlapped.
  const afterReflow = reflowTrackOverlaps(out);
  if (afterReflow.changed) { changed.push("reflowed clips off overlapping tracks"); out = afterReflow.html; }

  const afterTag = tagCoveredText(out);
  if (afterTag !== out) { changed.push("tagged covered-text overlays allow-occlusion"); out = afterTag; }

  return { html: out, changed };
}

module.exports = { normalizeComposition, stripExternalFonts, ensureClipClass, reflowTrackOverlaps, tagCoveredText, stripMissingAssets, ensureVectorField };
