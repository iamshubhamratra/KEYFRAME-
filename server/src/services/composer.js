// Pass 2: storyboard + (optional) fetched-asset list -> indexHtml + metaJson.
// Augments the system prompt with official HyperFrames "skills" markdown
// fetched from github.com/heygen-com/hyperframes — these docs are the same
// reference material the framework team gives to agents via `npx skills add`.

const fs = require("node:fs");
const path = require("node:path");
const openrouter = require("./openrouter");
const { getComposerSkills } = require("./skills");
const { getCatalogSummary } = require("./catalog");

const SYSTEM_BASE = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_composer.md"),
  "utf8"
);

async function getSystemPromptWithSkills() {
  const [skills, catalog] = await Promise.all([
    getComposerSkills().catch(() => ""),
    getCatalogSummary().catch(() => ""),
  ]);
  const parts = [SYSTEM_BASE];
  if (catalog) {
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
  return parts.join("\n");
}

function buildUser(storyboard, { width, height, fps, availableAssets }) {
  const lines = [
    "Storyboard:",
    JSON.stringify(storyboard, null, 2),
    "",
    `Composition dimensions: ${width}x${height} at ${fps}fps.`,
    `Total duration: ${storyboard.durationSec}s.`,
    "",
    "availableAssets:",
    JSON.stringify(availableAssets || [], null, 2),
    "",
    (availableAssets && availableAssets.length)
      ? "Use these local asset paths (and ONLY these) in any <img> or <video> src attributes."
      : "No assets pre-fetched. Do NOT include any <img> or <video> tags.",
    "",
    "Produce the JSON with indexHtml and metaJson strings now.",
  ];
  return lines.join("\n");
}

function parseEnvelope(text) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const obj = JSON.parse(trimmed);
  if (typeof obj.indexHtml !== "string" || typeof obj.metaJson !== "string") {
    throw new Error("envelope missing indexHtml or metaJson string fields");
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

async function compose(storyboard, { width, height, fps, duration, maxRetries, availableAssets, abortSignal }) {
  const t0 = Date.now();
  console.log(`[composer] start (duration=${duration}s, assets=${(availableAssets||[]).length}, maxRetries=${maxRetries})`);
  const system = await getSystemPromptWithSkills();
  const user = buildUser(storyboard, { width, height, fps, availableAssets });
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
      jsonMode: true,
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
      augmentedUser = `${user}\n\nPrevious reply could not be parsed: ${e.message}\nReturn ONLY the JSON object with indexHtml and metaJson.`;
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
