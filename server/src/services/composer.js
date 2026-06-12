// Pass 2: storyboard + (optional) fetched-asset list -> indexHtml + metaJson.
// Augments the system prompt with official HyperFrames "skills" markdown
// fetched from github.com/heygen-com/hyperframes — these docs are the same
// reference material the framework team gives to agents via `npx skills add`.

const fs = require("node:fs");
const path = require("node:path");
const openrouter = require("./openrouter");
const { getComposerSkills } = require("./skills");
const { getCatalogSummary } = require("./catalog");
const frameRegistry = require("./frame_registry");
const { extractFirstJsonObject } = require("./json_lenient");

const SYSTEM_BASE = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_composer.md"),
  "utf8"
);

// "Allowed colors: ..." with concrete hexes survives long-prompt attention
// dilution far better than prose like "use the design system's palette".
function paletteLaw(framePack) {
  const tokens = frameRegistry.getPackTokens(framePack);
  if (!tokens || !Object.keys(tokens.colors).length) return null;
  const colorList = Object.entries(tokens.colors).map(([k, v]) => `${v} (${k})`).join(", ");
  const lines = [
    "## HARD PALETTE LAW — zero tolerance",
    "",
    `The ONLY colors permitted anywhere in the composition — backgrounds, text, borders, shadows, gradients, SVG fills/strokes — are: ${colorList}.`,
    "Opacity/rgba variants of these exact hues are allowed (blooms, overlays); any other hex/hsl/named color is a DEFECT. In particular: NO dark-navy gradients, NO neon cyan/purple accents, NO generic 'AI video' styling — those belong to other design systems, not this one.",
  ];
  if (tokens.fonts.length) {
    lines.push(`The ONLY font families permitted: ${tokens.fonts.join(", ")} (plus generic fallbacks). Load exactly these via ONE Google Fonts <link>. Inter/Roboto are NOT automatically allowed — only if listed here.`);
  }
  return lines.join("\n");
}

async function getSystemPromptWithSkills(framePack) {
  const [skills, catalog] = await Promise.all([
    getComposerSkills().catch(() => ""),
    getCatalogSummary().catch(() => ""),
  ]);
  const parts = [SYSTEM_BASE];
  const frameMd = framePack ? frameRegistry.getFrameMd(framePack) : null;
  // Catalog blocks ship their own (foreign) styling — they'd puncture the
  // design system, so they're only offered when no pack is active.
  if (catalog && !frameMd) {
    parts.push("", "---", "", "# Reference: HyperFrames Catalog");
    parts.push("");
    parts.push("Pre-built blocks, examples, and components are available from the HyperFrames registry. You may reference BLOCKS by adding them to the HTML via:");
    parts.push("");
    parts.push("```html");
    parts.push('<div class="clip" id="intro-logo"');
    parts.push('     data-composition-id="logo-outro"');
    parts.push('     data-composition-src="compositions/logo-outro.html"');
    parts.push('     data-start="5" data-duration="3" data-track-index="4"');
    parts.push('     data-width="1920" data-height="1080"></div>');
    parts.push("```");
    parts.push("");
    parts.push("Any block you reference will be auto-installed into the job dir before render — you do NOT need to write the block's own HTML, only wire it into the host. Use blocks when they cleanly match a scene need (logo outro, social cards, transitions, data viz). Do not invent block names that aren't in the list below.");
    parts.push("");
    parts.push(catalog);
  }
  if (skills) {
    parts.push("", "---", "", "# Reference: HyperFrames Skills");
    parts.push("");
    parts.push("Below is the official HyperFrames documentation. Treat as authoritative.");
    parts.push("");
    parts.push(skills);
  }

  // Inject the selected frame pack's FRAME.md as the authoritative design
  // system. Placed LAST so it wins any stylistic conflict with the generic
  // guidance above; the lint-enforced technical constraints are untouched.
  if (frameMd) {
    parts.push("", "---", "", `# DESIGN SYSTEM — "${framePack}" (AUTHORITATIVE)`);
    parts.push("");
    parts.push("You MUST express every scene in the design system specified below. Its ATOMS —");
    parts.push("colors, typography (families, weights, case, tracking), borders, shadows, spacing,");
    parts.push("and components — are SACRED: reproduce them exactly as specified. Its COMPOSITION");
    parts.push("is FREE: arrange, scale, and animate those atoms however best serves each scene.");
    parts.push("");
    parts.push("Precedence rules:");
    parts.push("- This design system OVERRIDES the storyboard's `palette` and `fontFamily` fields — ignore them.");
    parts.push("- It OVERRIDES the generic typography / gradient-text / color guidance earlier in this prompt wherever they conflict.");
    parts.push("- The single Google Fonts <link> must load the font families THIS design system names (multiple families combined in one <link> is allowed). Do not load any other families.");
    parts.push("- Hard technical constraints still apply unchanged: clip structure, exactly one paused GSAP timeline registered on window.__timelines[\"vid\"], asset src whitelist, no extra <script> tags, no fetch/XHR.");
    parts.push("- The design spec below covers composition only; motion is yours. Keep the visual-richness checklist from earlier, but express it ENTIRELY with this system's atoms — animate ITS decorations, ITS rules/blooms/shadows, ITS type. Do not import foreign visual elements (e.g. no neon gradients on a parchment system, no soft blurred shadows on a hard-shadow system).");
    parts.push("");
    parts.push(frameMd);
    const law = paletteLaw(framePack);
    if (law) {
      parts.push("", law);
    }
  }

  return parts.join("\n");
}

function buildUser(storyboard, { width, height, fps, availableAssets, framePack, captionCues }) {
  // With a design system active, the storyboard's palette/fontFamily are a
  // competing signal — remove them entirely rather than asking the model to
  // ignore them.
  let sb = storyboard;
  if (framePack) {
    sb = { ...storyboard };
    delete sb.palette;
    delete sb.fontFamily;
  }

  const lines = [
    "Storyboard:",
    JSON.stringify(sb, null, 2),
    "",
    `Composition dimensions: ${width}x${height} at ${fps}fps.`,
    `Total duration: ${storyboard.durationSec}s.`,
    "",
    "availableAssets:",
    JSON.stringify(availableAssets || [], null, 2),
    "",
    (availableAssets && availableAssets.length)
      ? "Use these local asset paths (and ONLY these) in any <img> or <video> src attributes. Use EVERY asset listed — each was fetched for the scene named in its sceneId (background = full-bleed mood under a scrim, inset = framed evidence). An unused asset is a wasted scene."
      : "No assets pre-fetched. Do NOT include any <img> or <video> tags.",
  ];

  if (captionCues && captionCues.length) {
    lines.push("");
    lines.push("captionCues (render as the caption track per the Beats contract & captions section):");
    lines.push(JSON.stringify(captionCues));
  }

  if (framePack) {
    const tokens = frameRegistry.getPackTokens(framePack);
    lines.push("");
    lines.push(`CRITICAL: render this video entirely in the "${framePack}" DESIGN SYSTEM defined at the end of the system prompt. Atoms sacred, composition free.`);
    if (tokens && Object.keys(tokens.colors).length) {
      lines.push(`The ONLY allowed colors: ${Object.values(tokens.colors).join(", ")}. The ONLY allowed fonts: ${tokens.fonts.join(", ") || "per the design system"}. Scene backgrounds must be the system's ground colors — never dark navy, never generic gradients.`);
    }
  }

  lines.push("", "Produce the JSON with indexHtml and metaJson strings now.");
  return lines.join("\n");
}

function parseEnvelope(text) {
  // Sentinel format (primary). A 20-30KB HTML document inside a JSON string
  // breaks escaping reliably at this size; raw blocks between sentinels have
  // no escaping to get wrong.
  const m = String(text).match(/===HTML===\s*([\s\S]*?)\s*===META===\s*([\s\S]*?)\s*(?:===END===|$)/);
  if (m && m[1].trim() && m[2].trim()) {
    return { indexHtml: m[1].trim(), metaJson: m[2].trim() };
  }

  // Legacy JSON envelope fallback (older models / cached behaviors).
  const obj = extractFirstJsonObject(text);
  if (typeof obj.indexHtml !== "string" || typeof obj.metaJson !== "string") {
    throw new Error("envelope missing ===HTML===/===META=== sentinels and indexHtml/metaJson fields");
  }
  return obj;
}

function allowedSrcs(assets) {
  const out = new Set();
  for (const a of (assets || [])) if (a.path) out.add(a.path);
  return out;
}

function extractSrcs(html, tag) {
  const re = new RegExp(`<${tag}\\s[^>]*\\bsrc\\s*=\\s*["']([^"']+)["']`, "gi");
  const found = [];
  let m;
  while ((m = re.exec(html)) != null) found.push(m[1]);
  return found;
}

function quickCheck(indexHtml, metaJsonStr, { width, height, duration, assets }) {
  const errs = [];

  let meta;
  try { meta = JSON.parse(metaJsonStr); }
  catch (e) { errs.push(`metaJson not valid JSON: ${e.message}`); return errs; }

  if (meta.compositionId !== "vid") errs.push(`meta.compositionId must be 'vid'`);
  if (meta.width !== width) errs.push(`meta.width ${meta.width} != ${width}`);
  if (meta.height !== height) errs.push(`meta.height ${meta.height} != ${height}`);
  if (Math.abs(meta.duration - duration) > 0.01) {
    errs.push(`meta.duration ${meta.duration} != ${duration}`);
  }

  if (!/<!doctype\s+html/i.test(indexHtml)) errs.push("indexHtml missing doctype");
  if (!/<html[\s>]/i.test(indexHtml)) errs.push("indexHtml missing <html>");
  if (!/<body[\s>]/i.test(indexHtml)) errs.push("indexHtml missing <body>");
  if (!/data-composition-id\s*=\s*["']vid["']/i.test(indexHtml)) {
    errs.push(`missing data-composition-id="vid"`);
  }
  if (!new RegExp(`data-width\\s*=\\s*["']${width}["']`).test(indexHtml)) {
    errs.push(`root must have data-width="${width}"`);
  }
  if (!new RegExp(`data-height\\s*=\\s*["']${height}["']`).test(indexHtml)) {
    errs.push(`root must have data-height="${height}"`);
  }
  if (!new RegExp(`data-duration\\s*=\\s*["']${duration}["']`).test(indexHtml)) {
    errs.push(`root must have data-duration="${duration}"`);
  }
  if (!/window\.__timelines\s*\[\s*["']vid["']\s*\]/.test(indexHtml)) {
    errs.push(`missing window.__timelines["vid"] registration`);
  }
  if (!/gsap\.timeline\s*\(\s*\{[^}]*paused\s*:\s*true/.test(indexHtml)) {
    errs.push(`gsap.timeline must be created with paused: true`);
  }

  const allowed = allowedSrcs(assets);
  const imgSrcs = extractSrcs(indexHtml, "img");
  const videoSrcs = extractSrcs(indexHtml, "video");
  for (const src of [...imgSrcs, ...videoSrcs]) {
    if (!allowed.has(src)) {
      errs.push(`forbidden src="${src}" — not in availableAssets`);
    }
  }

  if (/\bfetch\s*\(/i.test(indexHtml)) errs.push("forbidden: fetch() call");
  if (/\bXMLHttpRequest\b/i.test(indexHtml)) errs.push("forbidden: XMLHttpRequest");

  return errs;
}

async function compose(storyboard, { width, height, fps, duration, maxRetries, availableAssets, abortSignal, framePack, captionCues }) {
  const t0 = Date.now();
  console.log(`[composer] start (duration=${duration}s, assets=${(availableAssets||[]).length}, maxRetries=${maxRetries}, framePack=${framePack || "none"}, captions=${(captionCues||[]).length})`);
  const system = await getSystemPromptWithSkills(framePack);
  const user = buildUser(storyboard, { width, height, fps, availableAssets, framePack, captionCues });
  const tries = (maxRetries ?? 2) + 1;
  let totalIn = 0, totalOut = 0;
  let lastErrors = [];
  let augmentedUser = user;

  for (let i = 1; i <= tries; i++) {
    if (abortSignal?.aborted) throw abortSignal.reason || new Error("composer aborted");
    console.log(`[composer] attempt ${i}/${tries} — sending to LLM`);
    const { text, tokensIn, tokensOut } = await openrouter.chat({
      system,
      user: augmentedUser,
      jsonMode: false, // sentinel envelope — forcing json_object would fight the format
      stage: "composer",
      signal: abortSignal,
    });
    totalIn += tokensIn;
    totalOut += tokensOut;

    let env;
    try {
      env = parseEnvelope(text);
      console.log(`[composer] attempt ${i} parsed (html=${env.indexHtml.length}ch, meta=${env.metaJson.length}ch)`);
    } catch (e) {
      lastErrors = [`envelope parse error: ${e.message}`];
      console.warn(`[composer] attempt ${i} parse failed: ${e.message.slice(0, 200)}`);
      augmentedUser = `${user}\n\nPrevious reply could not be parsed: ${e.message}\nReturn ONLY the sentinel-delimited response: ===HTML=== <the html> ===META=== <the meta json> ===END===`;
      continue;
    }

    const errs = quickCheck(env.indexHtml, env.metaJson, {
      width, height, duration, assets: availableAssets,
    });
    if (errs.length === 0) {
      console.log(`[composer] success in ${Date.now() - t0}ms (tokens in=${totalIn} out=${totalOut})`);
      return {
        indexHtml: env.indexHtml,
        metaJson: env.metaJson,
        tokensIn: totalIn,
        tokensOut: totalOut,
      };
    }
    lastErrors = errs;
    console.warn(`[composer] attempt ${i} validation failed (${errs.length} errs): ${errs.slice(0, 3).join(" | ").slice(0, 300)}`);
    augmentedUser = `${user}\n\nPrevious attempt had these problems — fix them and resend:\n${errs.map(e => `- ${e}`).join("\n")}`;
  }

  const err = new Error(
    `composer failed after ${tries} attempts: ${lastErrors.join("; ")}`
  );
  err.tokensIn = totalIn;
  err.tokensOut = totalOut;
  throw err;
}

module.exports = { compose };
