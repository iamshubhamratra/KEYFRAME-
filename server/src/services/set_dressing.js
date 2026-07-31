// HYBRID SET-DRESSING — bounded LLM creativity on top of the deterministic
// scene-kit. The kit owns structure, motion and safety; the LLM contributes
// per-scene garnish that CANNOT break the layout:
//   - which text layout variant each scene uses (0-3),
//   - which single word of the headline carries the accent,
//   - a tiny decorative SVG cluster (hard-sanitized: whitelisted primitives,
//     palette-only colors, size-capped) echoing the scene's message.
//
// One small LLM call for the whole film (~1-2k tokens) — composer-flavoured
// art direction at ~1/50th of the full composer's cost and none of its
// failure modes. FAIL-OPEN: any error returns null and the kit renders plain.

const openrouter = require("./openrouter");
const frameRegistry = require("./frame_registry");
const { extractFirstJsonObject } = require("./json_lenient");

const MAX_PRIMS = 8;
const MAX_DECOR_CHARS = 4000;
const PRIM_TAGS = new Set(["circle", "ellipse", "rect", "line", "path", "polygon", "polyline"]);
const ATTR_WHITELIST = new Set([
  "cx", "cy", "r", "rx", "ry", "x", "y", "width", "height",
  "x1", "y1", "x2", "y2", "points", "d",
  "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap",
  "opacity", "fill-opacity", "stroke-opacity", "transform",
]);

// A color is legal iff it's a palette hex (any case), an rgba() of a palette
// hex, or none/transparent. Everything else (foreign hexes, named colors,
// url() refs) is rejected — the palette law is what keeps dressing on-brand.
function colorOk(value, palette) {
  const v = String(value).trim().toLowerCase();
  if (v === "none" || v === "transparent") return true;
  if (/^#[0-9a-f]{6}$/.test(v)) return palette.has(v);
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/.exec(v);
  if (m) {
    const hex = `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
    return palette.has(hex);
  }
  return false;
}

// Rebuild the fragment element-by-element from the whitelist. Anything that
// doesn't parse cleanly is silently dropped; if nothing survives, return null.
function sanitizeDecor(fragment, paletteHexes) {
  const src = String(fragment || "").slice(0, MAX_DECOR_CHARS);
  const palette = new Set(paletteHexes.map((h) => String(h).toLowerCase()));
  const out = [];
  const tagRe = /<([a-z]+)((?:\s+[a-z-]+\s*=\s*"[^"<>]*")*)\s*\/?>/gi;
  let m;
  while ((m = tagRe.exec(src)) != null && out.length < MAX_PRIMS) {
    const tag = m[1].toLowerCase();
    if (!PRIM_TAGS.has(tag)) continue;
    const attrs = [];
    const attrRe = /([a-z-]+)\s*=\s*"([^"<>]*)"/gi;
    let a;
    let bad = false;
    while ((a = attrRe.exec(m[2])) != null) {
      const name = a[1].toLowerCase();
      const value = a[2];
      if (!ATTR_WHITELIST.has(name)) continue;              // strip unknown attrs
      if (/on[a-z]+|javascript|url\(|script/i.test(value)) { bad = true; break; }
      if ((name === "fill" || name === "stroke") && !colorOk(value, palette)) { bad = true; break; }
      attrs.push(`${name}="${value.replace(/"/g, "")}"`);
    }
    if (bad) continue;
    out.push(`<${tag} ${attrs.join(" ")}/>`);
  }
  return out.length ? out.join("") : null;
}

function clampVariant(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : null;
}

// -> { [sceneId]: { variant, emphasis, decorSvg } } | null
async function generateDressing({ storyboard, framePack, subject, tracker, signal }) {
  try {
    const scenes = Array.isArray(storyboard?.scenes) ? storyboard.scenes : [];
    if (!scenes.length || !framePack) return null;
    const tokens = frameRegistry.getPackTokens(framePack);
    const paletteHexes = Object.values(tokens?.colors || {});
    if (!paletteHexes.length) return null;
    const vibe = frameRegistry.getPackVibe(framePack) || "";

    const system = [
      "You are the set dresser on a motion-graphics film. A deterministic template already owns layout and motion;",
      "you add per-scene garnish that makes each scene feel individually art-directed. For EVERY scene return:",
      `- "variant": text layout 0-3 (0 left+top-rule, 1 centered+underline, 2 left+side-bar, 3 right-aligned). Vary them; never give adjacent scenes the same variant.`,
      `- "emphasis": the ONE word (or two-word phrase) of that scene's headline that should carry the accent color — the most loaded word, verbatim from the headline.`,
      `- "decor": a small decorative SVG cluster for that scene: 3-${MAX_PRIMS} primitives (circle/ellipse/rect/line/path/polygon/polyline ONLY, no groups, no defs, no text). Abstract shapes that echo the scene's message and this design system's vibe. Position within a ${"${W}x${H}"} viewBox, keep shapes in the MARGINS (outer 20% of the frame), sizes 8-120px.`,
      `HARD RULES: fill/stroke colors ONLY from this exact palette: ${paletteHexes.join(", ")} (or "none"). Anything else is discarded.`,
      `Design system vibe: ${vibe}`,
      'Return STRICT JSON: {"scenes":[{"id":"s1","variant":2,"emphasis":"word","decor":"<circle .../><line .../>"}]}',
    ].join("\n");

    const user = JSON.stringify({
      subject: subject || undefined,
      canvas: { note: "viewBox is per-scene full canvas" },
      scenes: scenes.map((s) => ({ id: s.id, kind: s.kind, headline: s.headline, subtext: s.subtext })),
    });

    const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
      system, user, jsonMode: true, stage: "dressing", temperature: 0.7, signal,
    });
    if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "dressing", costUsd: costUsd });

    const parsed = extractFirstJsonObject(text);
    const list = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
    const byId = {};
    for (const d of list) {
      if (!d || typeof d.id !== "string") continue;
      const entry = {};
      const v = clampVariant(d.variant);
      if (v != null) entry.variant = v;
      if (typeof d.emphasis === "string" && d.emphasis.trim() && d.emphasis.length <= 40) entry.emphasis = d.emphasis.trim();
      const decor = sanitizeDecor(d.decor, paletteHexes);
      if (decor) entry.decorSvg = decor;
      if (Object.keys(entry).length) byId[d.id] = entry;
    }
    return Object.keys(byId).length ? byId : null;
  } catch (e) {
    console.warn(`[dressing] skipped (${String(e?.message || e).slice(0, 120)})`);
    return null;
  }
}

module.exports = { generateDressing, sanitizeDecor };
