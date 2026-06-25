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

// Minimum inline-SVG vector primitives a composition must contain. FLAT floor
// (not scene-scaled). Set to 10 so the canonical STEP-9 shared field (11 prims)
// clears in ONE shot — 12 caused a wasted retry on an off-by-one. The real
// anti-sparseness lever is MIN_STICKERS (the 15-prim/0-sticker slideshow that
// prompted this would clear any vector floor but FAILS the sticker floor).
// quickCheck sums primitives across ALL <svg> blocks. Richness shortfalls are
// non-fatal on the final attempt (a real comp ships over the bland fallback).
const MIN_VECTOR_PRIMITIVES = 10;
// Decorative-furniture floor — directly targets the "no pop-in stickers" complaint.
// Counts distinct sticker classes that ALSO appear in a GSAP tween (so a static
// 0×0 decoy can't satisfy a class-token count). Lenient; the template carries quality.
const MIN_STICKERS = 3;

// Relative luminance (WCAG) from a #RRGGBB hex, 0 (black) … 1 (white).
function luminance(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
  if (!m) return null;
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => lin(parseInt(h, 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Build a concrete, deterministic contrast recipe from the pack's actual
// palette hexes, so the composer never guesses which token is safe for text.
// The lightest token is the only safe text color on dark grounds; the darkest
// is the only safe text color on light grounds. Everything chromatic in
// between is accent-only. This kills the #1 amateur tell: text that blends
// into its background.
function contrastRecipe(colors) {
  const entries = Object.entries(colors)
    .map(([name, hex]) => ({ name, hex, L: luminance(hex) }))
    .filter((e) => e.L != null);
  if (entries.length < 2) return null;
  const sorted = [...entries].sort((a, b) => a.L - b.L);
  const darkest = sorted[0];
  const lightest = sorted[sorted.length - 1];
  const fmt = (e) => `${e.hex} (${e.name})`;
  const darkGrounds = entries.filter((e) => e.L < 0.4);
  const lightGrounds = entries.filter((e) => e.L >= 0.4);
  return [
    "## CONTRAST RECIPE — derived from THIS pack's palette (obey on EVERY text element)",
    "",
    `- Text on a DARK ground: use ONLY ${fmt(lightest)} (the lightest token). No exceptions for headlines, body, labels, or captions.`,
    `- Text on a LIGHT ground: use ONLY ${fmt(darkest)} (the darkest token). No exceptions.`,
    darkGrounds.length ? `- DARK grounds (→ light text): ${darkGrounds.map(fmt).join(", ")}.` : "",
    lightGrounds.length ? `- LIGHT grounds (→ dark text): ${lightGrounds.map(fmt).join(", ")}.` : "",
    "- Every OTHER (chromatic) token is an ACCENT — use it for a single emphasized word, an underline/marker draw, a CTA, or a decoration. NEVER as the color of a paragraph, headline, label, or caption.",
    "- Per scene: read the ground's luminance, pick the matching safe text token above, then shrink the scene to a mental thumbnail. If you must squint, the pair FAILS — add a solid contrast device (panel/card/scrim/band in a ground color) behind the text, never just lower its opacity.",
  ].filter(Boolean).join("\n");
}

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
    lines.push(`This design system's typography is "${tokens.fonts.join(", ")}". External/webfonts CANNOT be loaded (offline render, lint-enforced — see hard constraint #2), so approximate that identity with the system stack \`Inter, "Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif\` and reproduce its WEIGHT, CASE, TRACKING and SCALE exactly. Do NOT add a Google Fonts <link>.`);
  }
  const recipe = contrastRecipe(tokens.colors);
  if (recipe) lines.push("", recipe);
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
    parts.push("- Do NOT load external/Google fonts (offline render, lint-enforced). Use the system font stack and express THIS design system's type identity through weight, case, tracking, and scale.");
    parts.push("- Hard technical constraints still apply unchanged: clip structure, exactly one paused GSAP timeline registered on window.__timelines[\"vid\"], asset src whitelist, no extra <script> tags, no fetch/XHR.");
    parts.push("- The design spec below covers composition only; motion is yours. Keep the visual-richness checklist from earlier, but express it ENTIRELY with this system's atoms — animate ITS decorations, ITS rules/blooms/shadows, ITS type. Do not import foreign visual elements (e.g. no neon gradients on a parchment system, no soft blurred shadows on a hard-shadow system).");
    parts.push("");
    parts.push(frameMd);
    const law = paletteLaw(framePack);
    if (law) {
      parts.push("", law);
    }

    // Inject the pack's frame-showcase.html as a CONCRETE premium worked example
    // (only some packs ship one). FRAME.md is the spec; the showcase is the proof
    // — it shows the actual HTML/CSS atoms, layered decorations, and per-scene
    // density to reproduce. Its `.frame.*` blocks are ready-made 16:9 scene
    // layouts in container-query units. Truncated to bound the context budget.
    try {
      const showcasePath = frameRegistry.getShowcasePath(framePack);
      const showcaseHtml = showcasePath ? fs.readFileSync(showcasePath, "utf8") : "";
      if (showcaseHtml) {
        parts.push("", "---", "", `# WORKED EXAMPLE — "${framePack}" frame-showcase.html (PREMIUM REFERENCE — MATCH OR EXCEED)`);
        parts.push("");
        parts.push(
          "Below is the canonical premium reference render for this design system. Its `.frame.*` blocks are ready-made 16:9 SCENE LAYOUTS (cover, feature-cards, stat-grid, closing-plate) built in container-query (cqw) units — exactly how your clips size. REPRODUCE their structure: the precise border/shadow/decoration atoms, the layered decorations (stars, tilted rects, dot grids, label pills, stat cards), the typographic scale and weights, and the per-scene element DENSITY. Your scenes must match or EXCEED this richness — then add a GSAP timeline on top (the showcase is STATIC; you animate every atom: entrances, drifts, draws, exits). Copy its STRUCTURE and ATOMS, not its literal placeholder copy."
        );
        parts.push("");
        parts.push("```html");
        parts.push(showcaseHtml.slice(0, 16000));
        parts.push("```");
      }
    } catch { /* no showcase for this pack — the FRAME.md spec stands alone */ }
  }

  return parts.join("\n");
}

function buildUser(storyboard, { width, height, fps, availableAssets, framePack, captionCues }) {
  // Pull repair signals out of the storyboard so they're surfaced as explicit
  // instructions below, instead of buried inside the JSON dump (where the model
  // ignores them — and regenerates from scratch, dropping required structure).
  // Always clone so we never mutate the caller's object.
  const sb = { ...storyboard };
  const lintFeedback = sb.__lintFeedback; delete sb.__lintFeedback;
  const qaIssues = sb.__qaIssuesToFix;    delete sb.__qaIssuesToFix;
  // With a design system active, the storyboard's palette/fontFamily are a
  // competing signal — remove them entirely rather than asking the model to
  // ignore them.
  if (framePack) {
    delete sb.palette;
    delete sb.fontFamily;
  }

  // Tailor the asset instruction to what ACTUALLY arrived. The hero-screenshot
  // treatment only makes sense when a real product/website screenshot is present
  // (tagged source:"website" / alt:"REAL website screenshot ..." upstream).
  // Emitting it on a stock-only run wastes prompt budget and biases the model
  // toward a photo-centric layout it can't fill.
  const assetList = availableAssets || [];
  const hasAssets = assetList.length > 0;
  const hasScreenshot = assetList.some((a) => a && (a.source === "website" || /screenshot/i.test(a.alt || "")));
  let assetInstruction;
  if (hasAssets && hasScreenshot) {
    assetInstruction = "Use these local asset paths (and ONLY these) in any <img>/<video> src attributes. Use EVERY asset listed — each was fetched for the scene in its sceneId. Give real product/app screenshots HERO treatment: ≥60% of the canvas, inside a browser/device frame in the design system's styling, with a Ken Burns push (scale 1.0→1.12) panning across the UI, plus 1–2 callout chips with connector lines pointing at real UI elements. Background photos go full-bleed under a scrim. An unused asset is a wasted scene. These fetched assets are the FLOOR, not the ceiling: on top of EVERY scene layer your OWN animated vector graphics — an SVG particle/bokeh field (6–12 <circle>s drifting at varied speeds & opacities), drawing underlines/connectors (<path> with strokeDashoffset), rotating rings, burst marks, animated glows — so that, combining the photos AND your vectors, a fresh visual element ENTERS or EXITS the frame at least once every 1–2 seconds for the ENTIRE duration. Walk your timeline second-by-second: any ~1.5s window with nothing entering/leaving is a DEAD STRETCH — fill it. Never let the frame hold static for more than ~1s.";
  } else if (hasAssets) {
    assetInstruction = "Use these local asset paths (and ONLY these) in any <img>/<video> src attributes. Use EVERY asset listed — each was fetched for the scene in its sceneId. Place each as the scene's visual anchor: full-bleed background photos under a readable scrim, or framed insets (rounded card, design-system border/shadow) at ~40–60% of the canvas with a slow Ken Burns push (scale 1.0→1.12). An unused asset is a wasted scene. Some scenes may have NO fetched asset — carry those ENTIRELY with your own dense animated vectors (do NOT reuse another scene's image). On top of EVERY scene layer your OWN animated vector graphics — an SVG particle/bokeh field (6–12 <circle>s drifting at varied speeds & opacities), drawing underlines/connectors (<path> with strokeDashoffset), rotating rings, burst marks, animated glows — so that, combining the images AND your vectors, a fresh visual element ENTERS or EXITS the frame at least once every 1–2 seconds for the ENTIRE duration. Walk your timeline second-by-second: any ~1.5s window with nothing entering/leaving is a DEAD STRETCH — fill it. Never let the frame hold static for more than ~1s.";
  } else {
    assetInstruction = "No image/video assets were pre-fetched, so do NOT include any <img> or <video> tags. Your OWN generated vector graphics are then the PRIMARY material, not a fallback: dense animated SVG in EVERY scene — particle/bokeh fields (8–14 <circle>s drifting at varied speeds), drawing lines/underlines (<path> strokeDashoffset), rotating icons, burst marks, animated gradient meshes — layered continuously so a fresh visual element ENTERS or EXITS the frame at least once every 1–2 seconds. Walk your timeline second-by-second; any ~1.5s dead stretch is a FAILURE. A text-only frame is a FAILURE.";
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
    assetInstruction,
    "",
    `HARD RICHNESS REQUIREMENT (auto-checked, REJECTED if unmet): (1) at least one inline <svg> with >=${MIN_VECTOR_PRIMITIVES} animated vector primitives total — TARGET 12–20 VISIBLE per scene (shared bokeh field + per-scene drawing lines / rotating ring / burst sparks); (2) at least ${MIN_STICKERS} pop-in stickers/badges/chips total — TARGET 3–6 PER SCENE — each an absolute child of its scene with class "sticker badge|chip|stat|callout", popping via back.out and animated by the GSAP timeline. Place stickers in the MARGINS over the image (never over the headline); put data-layout-allow-occlusion on each text-bearing sticker and on any content container a sticker covers. A vector-thin or sticker-less composition is REJECTED.`,
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

  if (lintFeedback || (qaIssues && qaIssues.length)) {
    lines.push("");
    lines.push("## CRITICAL — THIS IS A REPAIR PASS");
    lines.push("Return a CORRECTED full document. Fix ONLY the problems below; keep everything that already worked — the same scenes, the same assets in the same <img>/<video> tags, and the GSAP timeline structure.");
    lines.push("MUST-KEEP (dropping any of these FAILS the build):");
    lines.push('- The exact final lines `window.__timelines = window.__timelines || {}; window.__timelines["vid"] = tl;` — never remove or rename them.');
    lines.push('- `gsap.timeline({ paused: true })`, the root `data-composition-id="vid"` with its data-width/data-height/data-duration.');
    lines.push("- Every asset src already present — do NOT drop any image or video.");
    lines.push("- No external/Google fonts — system font stack only.");
    if (lintFeedback) {
      lines.push("");
      lines.push("Problems to fix (hyperframes lint / runtime):");
      lines.push(String(lintFeedback));
    }
    if (qaIssues && qaIssues.length) {
      lines.push("");
      lines.push("QA issues to fix:");
      for (const q of qaIssues) lines.push(`- ${q}`);
    }
  }

  // LAYOUT & LEGIBILITY LAW — placed LAST (strongest-attention position in a
  // long prompt). These target the concrete failure modes seen in renders:
  // dark off-topic stock photos stretched full-bleed (muddy, unreadable), and
  // tiny low-contrast text parked in a corner. Stated as hard, checkable rules.
  lines.push("");
  lines.push("## LAYOUT & LEGIBILITY LAW — obey on EVERY scene (QA fails the video on any violation)");
  lines.push("1. BACKGROUNDS ARE THE DESIGN SYSTEM, NOT PHOTOS. Every scene's background MUST be one of this design system's ground colors (a solid or its defined gradient). NEVER stretch a fetched photo full-bleed behind a scene, and NEVER use a darkened/scrimmed photo as a backdrop — fetched photos are often off-topic or dark and turn the frame into an unreadable mud. A fetched photo may appear ONLY inside a framed inset CARD (this system's border/radius/shadow) covering ~30–55% of the canvas with clear margin around it — never behind text, never edge-to-edge.");
  lines.push("2. TEXT IS THE HERO. Each scene's primary message/headline is the LARGEST thing in the frame: headline font-size ≥ 7% of canvas height (≥ ~75px at 1080p — scale to THIS canvas). The CTA line (e.g. \"Try … free\") is just as large and CENTERED. Subtitle/body is smaller than the headline but still crisp at thumbnail size.");
  lines.push("2b. CONTRAST IS NON-NEGOTIABLE. Every text element uses the design system's DARKEST token on a light ground and its LIGHTEST token on a dark ground — NEVER a mid-tone, NEVER a tint/shade of its own background. Washed-out light-grey-on-cream or dark-on-dark text is an automatic FAIL. If a headline must sit over imagery or a busy area, place it on a SOLID opaque panel/card filled with the opposite-luminance ground color — never rely on opacity or a blur. Aim for WCAG AA (~4.5:1) minimum; if it looks even borderline at thumbnail size, it fails.");
  lines.push("3. NO CORNER-PARKED OR MICRO TEXT. All meaningful text lives in the central safe area (middle ~80% of the frame) — never floated in a corner, never below ~3% of canvas height. If text sits over any imagery, put a solid contrast panel/card behind it.");
  lines.push("4. DECORATION SERVES, NEVER DOMINATES. No single decorative shape (arrow, disc, band) may be the largest or loudest element. Keep decorations behind the message at low opacity. Hierarchy is always message > content > decoration.");
  lines.push("5. FILL THE FRAME edge-to-edge — no large empty quadrants, no headline floating alone in a void.");

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

function quickCheck(indexHtml, metaJsonStr, { width, height, duration, assets, enforceVectors = true }) {
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
    // Missing registration is almost always a TRUNCATED output (the model ran
    // out of tokens before the closer). Tell a cheap model to make it SHORTER —
    // re-pasting a full vector field per scene is the usual bloat cause.
    errs.push(
      `missing window.__timelines["vid"] registration — your output was likely CUT OFF before the end. ` +
      `Make the document SHORTER: define ONE reusable SVG vector field and reference it per scene (do NOT re-paste a full field in every scene), trim comments, and ensure the final two lines are ` +
      `\`window.__timelines = window.__timelines || {}; window.__timelines["vid"] = tl;\` followed by ===META=== and ===END===.`
    );
  }
  if (!/gsap\.timeline\s*\(\s*\{[^}]*paused\s*:\s*true/.test(indexHtml)) {
    errs.push(`gsap.timeline must be created with paused: true`);
  }
  // repeat:-1 is lint-fatal (breaks deterministic frame capture). Catch it here
  // so the retry loop fixes it in one cheap lap instead of burning a full lint pass.
  if (/repeat\s*:\s*-1\b/.test(indexHtml)) {
    errs.push(
      `forbidden repeat: -1 (infinite repeat breaks the frame engine and FAILS lint). ` +
      `Replace EVERY \`repeat: -1\` with a finite count computed from the timeline, e.g. \`repeat: Math.floor(D / cycleSeconds) - 1\` with \`const D = <DURATION>\`.`
    );
  }

  const allowed = allowedSrcs(assets);
  const imgSrcs = extractSrcs(indexHtml, "img");
  const videoSrcs = extractSrcs(indexHtml, "video");
  for (const src of [...imgSrcs, ...videoSrcs]) {
    if (!allowed.has(src)) {
      errs.push(`forbidden src="${src}" — not in availableAssets`);
    }
  }

  // REAL SCREENSHOT MUST APPEAR — a provided product/website screenshot is the
  // single most credible asset; the weak composer routinely drops it (the
  // black-void / generic-slide failure) and the QA vision proxy doesn't reliably
  // catch it. Deterministically require every screenshot asset's src to appear in
  // an <img> so the cheap same-model retry forces it back in with hero treatment.
  // Skipped on a pure lint/runtime repair (enforceVectors=false) — a narrow
  // technical fix shouldn't be bounced for an unrelated reason.
  if (enforceVectors) {
    const usedImg = new Set(imgSrcs);
    const screenshots = (assets || []).filter(
      (a) => a && a.path && (a.source === "website" || /screenshot/i.test(a.alt || ""))
    );
    const missing = screenshots.filter((a) => !usedImg.has(a.path));
    if (missing.length) {
      errs.push(
        `REQUIRED product screenshot(s) missing from the composition: ${missing.map((a) => a.path).join(", ")}. ` +
        `Place EACH real screenshot in an <img src="..."> with HERO treatment — ≥55% of the canvas, inside a ` +
        `browser/device frame in the design system's styling, with a slow Ken Burns push (scale 1.0→1.12) across the UI ` +
        `and 1–2 callout chips pointing at real UI elements. A product video that hides its real screenshot FAILS.`
      );
    }
  }

  if (/\bfetch\s*\(/i.test(indexHtml)) errs.push("forbidden: fetch() call");
  if (/\bXMLHttpRequest\b/i.test(indexHtml)) errs.push("forbidden: XMLHttpRequest");

  // Vector requirement — the system prompt mandates a dense animated SVG/vector
  // layer in every scene, but nothing enforced it, so models shipped vector-less
  // image slideshows. Reject a composition that has no real inline vectors so the
  // retry loop forces them in. Skipped on a repair pass (enforceVectors=false) so
  // a vector-light but otherwise-correct lint/runtime fix isn't bounced for an
  // unrelated reason.
  //
  // Count primitives ONLY inside <svg>…</svg> (so tag-name mentions in comments,
  // CSS, or <script> string literals can't inflate the count), and use a
  // lookahead so no-space self-closing tags (<circle/>) still count while
  // <radialGradient>/<clipPath> etc. do not.
  if (enforceVectors) {
    const PRIM_RE = /<(?:circle|ellipse|path|rect|polygon|polyline|line)(?=[\s/>])/gi;
    const svgBlocks = indexHtml.match(/<svg[\s\S]*?<\/svg>/gi) || [];
    const svgCount = svgBlocks.length;
    const vectorPrims = svgBlocks.reduce((n, b) => n + (b.match(PRIM_RE) || []).length, 0);
    if (svgCount < 1 || vectorPrims < MIN_VECTOR_PRIMITIVES) {
      errs.push(
        `too few inline vector graphics (found ${svgCount} <svg> block(s) with ${vectorPrims} vector shapes inside; need >=${MIN_VECTOR_PRIMITIVES}). ` +
        `Author ONE shared animated SVG field (bokeh + drawing lines + rotating ring + burst sparks) referenced per scene per STEP 9 — TARGET 12–20 VISIBLE primitives per scene, real graphics not low-alpha dust — animated by the GSAP timeline.`
      );
    }

    // Sticker floor — directly targets the "no pop-in stickers" complaint. Count
    // distinct sticker classes that ALSO appear in a gsap tween call (so a static
    // 0×0/opacity:0 decoy can't satisfy a class-token count). A static check can't
    // see render-time visibility; this is a floor against the EMPTY case.
    const stickerClassRe = /class\s*=\s*["'][^"']*\b(sticker|badge|chip|stat|callout|pill)\b/gi;
    const stickerClasses = new Set();
    let sm;
    while ((sm = stickerClassRe.exec(indexHtml)) != null) stickerClasses.add(sm[1].toLowerCase());
    const tweened = [...stickerClasses].filter(
      (c) => new RegExp(`tl\\.(?:to|from|fromTo|set)\\([^)]*\\.${c}\\b`).test(indexHtml)
    );
    if (tweened.length < MIN_STICKERS) {
      errs.push(
        `too few animated pop-in stickers/badges/chips (found ${tweened.length} distinct sticker class(es) tweened by GSAP, need >=${MIN_STICKERS}). ` +
        `Add decorative pop-in overlays per the POP-IN STICKERS section (burst badge / glass chip / stat sticker / connector callout) — each an absolute child of its scene with class "sticker badge|chip|stat|callout", popping via back.out, in the MARGINS over the image (NOT over the headline). Put data-layout-allow-occlusion on each text-bearing sticker and on any content container a sticker covers.`
      );
    }
  }

  return errs;
}

// Deterministically repair the two lint violations the composer most often
// REINTRODUCES between laps (it fixes one rule and breaks another, exhausting
// the retry budget and falling back to the ugly template). Both are mechanical:
//   1. `repeat: -1` (infinite) — the engine forbids it, but a large FINITE count
//      loops identically across the fixed capture window [0, duration].
//   2. external/forbidden media src — repoint to the nearest allowed asset of the
//      same media type so the element (and its GSAP target) survives.
// Applied before quickCheck so an otherwise-correct attempt isn't bounced for a
// trivially-fixable reason. See keyframe-quality-rootcauses.
function sanitizeComposition(html, assets) {
  let out = html.replace(/repeat\s*:\s*-1\b/g, "repeat: 120");
  // HyperFrames blocks (media_missing_data_start) any timed media that has a
  // src but no data-start — it can't own playback deterministically otherwise.
  // The composer routinely emits a bare background <video src>; default it to
  // data-start="0" so the gate passes instead of burning every repair lap.
  out = out.replace(/<(video|audio)\b([^>]*)>/gi, (m, tag, attrs) =>
    /\bdata-start\s*=/.test(attrs) ? m : `<${tag} data-start="0"${attrs}>`);
  const allowed = allowedSrcs(assets);
  if (allowed.size) {
    const list = [...allowed];
    const firstImg = list.find((s) => /\.(png|jpe?g|webp|gif|svg)$/i.test(s)) || list[0];
    const firstVid = list.find((s) => /\.(mp4|webm|mov)$/i.test(s)) || firstImg;
    out = out.replace(/(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'])/gi,
      (m, p, src, q) => (allowed.has(src) ? m : `${p}${firstImg}${q}`));
    out = out.replace(/(<(?:video|source)\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'])/gi,
      (m, p, src, q) => (allowed.has(src) ? m : `${p}${firstVid}${q}`));
  }
  return out;
}

async function compose(storyboard, { width, height, fps, duration, maxRetries, availableAssets, abortSignal, framePack, captionCues }) {
  const t0 = Date.now();
  console.log(`[composer] start (duration=${duration}s, assets=${(availableAssets||[]).length}, maxRetries=${maxRetries}, framePack=${framePack || "none"}, captions=${(captionCues||[]).length})`);
  const system = await getSystemPromptWithSkills(framePack);
  const user = buildUser(storyboard, { width, height, fps, availableAssets, framePack, captionCues });
  // Enforce the inline-vector/sticker floor on a first-pass compose AND on QA
  // repairs. Disable it ONLY for a structural lint/runtime repair: that pass
  // exists to fix one specific defect, so re-failing its corrected doc over an
  // unrelated vector count would needlessly escalate to the bland fallback.
  // A QA repair is the OPPOSITE case — QA fails on EMPTY/under-illustrated
  // frames, so the recompose MUST still satisfy the richness floor or the
  // "improve it" lap could hand back a sparser video than it started with.
  const enforceVectors = !(storyboard && storyboard.__lintFeedback);
  const tries = (maxRetries ?? 2) + 1;
  let totalIn = 0, totalOut = 0;
  let lastErrors = [];
  // The storyboard+asset `user` prefix is constant across laps; only this
  // feedback suffix changes. Passing them separately lets the LLM client cache
  // the heavy prefix so repair laps don't re-bill it at full price.
  let feedback = "";

  for (let i = 1; i <= tries; i++) {
    if (abortSignal?.aborted) throw abortSignal.reason || new Error("composer aborted");
    console.log(`[composer] attempt ${i}/${tries} — sending to LLM`);
    const { text, tokensIn, tokensOut } = await openrouter.chat({
      system,
      user,
      userSuffix: feedback,
      jsonMode: false, // sentinel envelope — forcing json_object would fight the format
      stage: "composer",
      signal: abortSignal,
    });
    totalIn += tokensIn;
    totalOut += tokensOut;

    let env;
    try {
      env = parseEnvelope(text);
      env.indexHtml = sanitizeComposition(env.indexHtml, availableAssets);
      console.log(`[composer] attempt ${i} parsed (html=${env.indexHtml.length}ch, meta=${env.metaJson.length}ch)`);
    } catch (e) {
      lastErrors = [`envelope parse error: ${e.message}`];
      console.warn(`[composer] attempt ${i} parse failed: ${e.message.slice(0, 200)}`);
      feedback = `\n\nPrevious reply could not be parsed: ${e.message}\nReturn ONLY the sentinel-delimited response: ===HTML=== <the html> ===META=== <the meta json> ===END===`;
      continue;
    }

    const errs = quickCheck(env.indexHtml, env.metaJson, {
      width, height, duration, assets: availableAssets, enforceVectors,
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

    // Richness floors (too-few vectors / too-few stickers) are a PUSH for more,
    // not a structural defect. On the FINAL attempt, if the ONLY remaining errors
    // are richness floors, ACCEPT the composition — a real asset-ful comp with a
    // few vectors short of target beats the bland deterministic fallback. Only
    // STRUCTURAL errors (bad meta, missing timeline, forbidden src, repeat:-1)
    // are fatal enough to escalate.
    const richnessOnly = errs.every((e) => /^too few (inline vector graphics|animated pop-in)/.test(e));
    if (i === tries && richnessOnly) {
      console.warn(`[composer] accepting on final attempt despite richness shortfall (real comp beats fallback): ${errs.join(" | ").slice(0, 200)}`);
      return {
        indexHtml: env.indexHtml,
        metaJson: env.metaJson,
        tokensIn: totalIn,
        tokensOut: totalOut,
      };
    }

    console.warn(`[composer] attempt ${i} validation failed (${errs.length} errs): ${errs.slice(0, 3).join(" | ").slice(0, 300)}`);
    feedback = `\n\nPrevious attempt had these problems — fix them and resend:\n${errs.map(e => `- ${e}`).join("\n")}`;
  }

  const err = new Error(
    `composer failed after ${tries} attempts: ${lastErrors.join("; ")}`
  );
  err.tokensIn = totalIn;
  err.tokensOut = totalOut;
  throw err;
}

module.exports = { compose, getSystemPromptWithSkills };
