// Request validation for POST /api/projects (the script-checkpoint flow).

const fs = require("node:fs");
const config = require("../config");
const frameRegistry = require("../services/frame_registry");
const captionLang = require("../services/caption_lang");
const captionDirector = require("../services/caption_director");
const { PACE_MODES } = require("./common");
const { IMAGE_MAX_MB } = require("../middleware/uploads");

// Belt-and-braces for the one non-raster type we accept: the first bytes of a real
// SVG are "<svg" or an XML prolog. A mislabeled binary posing as image/svg+xml is
// rejected at create.
function looksLikeSvg(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(512);
    const n = fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, n).toString("utf8").trimStart().toLowerCase();
    return head.startsWith("<svg") || head.startsWith("<?xml");
  } catch { return false; }
}

function validateCreate(body, { hasUpload = false } = {}) {
  const errs = [];
  const out = {};
  if (typeof body !== "object" || body === null) return { errs: ["body must be JSON object"], out };

  // Multi-modal: at least one of prompt / referenceVideo / websiteUrl.
  out.prompt = "";
  if (typeof body.prompt === "string" && body.prompt.trim()) {
    const p = body.prompt.trim();
    if (p.length < 10) errs.push("prompt, when given, must be at least 10 characters");
    else if (p.length > 4000) errs.push("prompt must be at most 4000 characters");
    else out.prompt = p;
  }

  if (typeof body.websiteUrl === "string" && body.websiteUrl.trim()) {
    const u = body.websiteUrl.trim().slice(0, 2000);
    if (!/^https?:\/\/.+\..+/i.test(u)) errs.push("websiteUrl must be a valid http(s) URL");
    else out.websiteUrl = u;
  }

  // Blog/article mode: the film is built FROM the post (its argument, sections,
  // numbers, and its own images) — a summary/companion video, not a site promo.
  if (typeof body.blogUrl === "string" && body.blogUrl.trim()) {
    const u = body.blogUrl.trim().slice(0, 2000);
    if (!/^https?:\/\/.+\..+/i.test(u)) errs.push("blogUrl must be a valid http(s) URL");
    else out.blogUrl = u;
  }

  if (!out.prompt && !out.websiteUrl && !out.blogUrl && !hasUpload) {
    errs.push("provide at least one of: prompt, websiteUrl, blogUrl, referenceVideo");
  }

  const d = body.duration == null ? 30 : Number(body.duration);
  if (!Number.isFinite(d) || d < config.server.minDurationSec || d > config.server.maxDurationSec) {
    errs.push(`duration must be ${config.server.minDurationSec}-${config.server.maxDurationSec} seconds`);
  } else {
    out.duration = Math.round(d);
  }

  const orientation = body.orientation || config.defaults.orientation;
  if (!config.orientations[orientation]) errs.push(`orientation must be one of: ${Object.keys(config.orientations).join(", ")}`);
  else out.orientation = orientation;

  const quality = body.quality || config.defaults.quality;
  if (!config.qualities[quality]) errs.push(`quality must be one of: ${Object.keys(config.qualities).join(", ")}`);
  else out.quality = quality;

  let fps = body.fps == null ? config.defaults.fps : Number(body.fps);
  if (!config.allowedFps.includes(fps)) errs.push(`fps must be one of: ${config.allowedFps.join(", ")}`);
  else out.fps = fps;

  out.voiceStyle = typeof body.voiceStyle === "string" ? body.voiceStyle.slice(0, 200) : null;
  out.autopilot = body.autopilot === true || body.autopilot === "true";
  // Subtitles/captions are OPT-IN (default OFF) — baked captions overlap scene
  // content and users overwhelmingly dislike burnt-in subtitles. Matches the
  // /api/generate route. Turn on only with an explicit captions:true (or "true").
  //
  // Now also accepts the MULTI-LANGUAGE config object (ported from Rohit):
  //   { enabled, language, voiceoverLanguage, videoTextLanguage, exportSRT, exportVTT }
  // The three axes are independent — a film can be spoken in English, subtitled
  // in Hindi and have its on-screen type in Hindi too. The legacy boolean still
  // works unchanged. Over multipart (file uploads) the object arrives
  // JSON-stringified, so parse a "{...}" string first.
  {
    let capIn = body.captions;
    if (typeof capIn === "string") {
      const s = capIn.trim();
      if (s === "true" || s === "false") capIn = s === "true";
      else if (s.startsWith("{")) { try { capIn = JSON.parse(s); } catch { capIn = undefined; } }
    }
    if (capIn && typeof capIn === "object" && capIn.enabled !== false) {
      const supported = captionLang.listLanguages().map((l) => l.code).join(", ");
      // "auto" is the video-text default (match the voiceover) and is not a
      // language code, so it skips validation.
      for (const [field, val] of [["caption", capIn.language], ["voiceover", capIn.voiceoverLanguage], ["video text", capIn.videoTextLanguage]]) {
        if (val == null || String(val).toLowerCase() === "auto") continue;
        if (!captionLang.normalizeLang(val)) {
          if (captionLang.isFuture(val)) errs.push(`${field} language "${val}" is coming soon; supported now: ${supported}`);
          else errs.push(`unsupported ${field} language "${val}"; supported: ${supported}`);
        }
      }
    }
    const cfg = captionDirector.normalizeConfig(capIn);
    out.captions = cfg.enabled;   // the legacy boolean the rest of the code reads
    out.captionsConfig = cfg;     // full multi-language settings for the Caption Director
  }

  // VOICEOVER — narration on/off. Default ON; only an explicit false disables it,
  // so every existing client keeps working unchanged. With it off the film is a
  // music-led cinematic mix, the PICTURE is byte-identical, and TTS costs zero.
  out.voiceover = !(body.voiceover === false || body.voiceover === "false");

  // BRAND PALETTE — the user's own primary/secondary/accent, overriding the
  // pack's accents. Travels to the graph as its OWN field (never through the
  // brief: the brief is model input and the model may substitute hexes — a
  // palette is only the user's pick while no model has had an opinion on it).
  // An empty string is how both client paths spell "no colour picked" — absent,
  // not malformed.
  let bp = body.brandPalette;
  if (typeof bp === "string" && bp.trim() !== "") {
    try { bp = JSON.parse(bp); } catch { errs.push("brandPalette must be JSON"); bp = null; }
  }
  if (bp && typeof bp === "object") {
    const hex = (v) => (/^#[0-9a-fA-F]{6}$/.test(String(v || "")) ? String(v).toLowerCase() : null);
    const primary = hex(bp.primary);
    // primary is the one required stop: secondary/accent are derived downstream
    // when absent, but a palette with nothing to lead it cannot steer an accent.
    if (!primary) errs.push("brandPalette.primary must be #RRGGBB");
    else out.brandPalette = {
      v: 1,
      primary,
      secondary: hex(bp.secondary),
      accent: hex(bp.accent),
      source: ["manual", "preset", "website", "logo"].includes(bp.source) ? bp.source : "manual",
      presetId: typeof bp.presetId === "string" ? bp.presetId.slice(0, 32) : null,
      raw: Array.isArray(bp.raw) ? bp.raw.map(hex).filter(Boolean).slice(0, 6) : [],
    };
  }

  // Three.js/WebGL cinematic composer (opt-in). Website screenshots texture the
  // reveal plate. Default off → scene-kit / LLM composer.
  out.render3d = body.render3d === true || body.render3d === "true" || body.threeD === true;

  // Per-video finish: "premium" = the LLM composition agent (slower, costlier,
  // bespoke layouts; scene-kit remains the automatic fallback if it fails its
  // gates) · "standard" = the deterministic scene-kit · absent = server default
  // (USE_LLM_COMPOSER).
  if (body.composeMode != null && body.composeMode !== "") {
    if (body.composeMode !== "standard" && body.composeMode !== "premium") {
      errs.push(`composeMode must be "standard" or "premium"`);
    } else {
      out.composeMode = body.composeMode;
    }
  }

  // PACE — how DENSELY the film is told: shorter scenes and more cuts at the
  // SAME runtime, never a sped-up MP4 (see services/pacing.js). Over multipart
  // every field arrives as String(v), so one string check covers both client
  // paths; an empty string is how a control nobody touched spells "default".
  const pace = body.pace == null || String(body.pace).trim() === ""
    ? config.defaults.pace
    : String(body.pace).trim();
  if (!PACE_MODES.includes(pace)) errs.push(`pace must be one of: ${PACE_MODES.join(", ")}`);
  else out.pace = pace;

  if (body.framePack != null && body.framePack !== "auto") {
    if (typeof body.framePack !== "string" || frameRegistry.resolvePack(body.framePack) == null) {
      errs.push(`framePack must be "auto" or one of: ${frameRegistry.listPacks().join(", ")}`);
    } else {
      out.framePack = body.framePack;
    }
  } else {
    out.framePack = "auto"; // brief suggests; registry default as last resort
  }

  return { errs, out };
}

// Checks that need the parsed files as well as the body: images supplement a
// subject (they cannot BE one), the per-image size cap multer cannot express,
// and the SVG sniff. Appends to `errs`.
function validateUploads(out, { uploadPath, logoFile, imageFiles }, errs) {
  if (!out.prompt && !out.websiteUrl && !out.blogUrl && !uploadPath && (logoFile || imageFiles.length)) {
    errs.push("images supplement a subject — also provide a prompt, websiteUrl, blogUrl, or referenceVideo");
  }
  for (const f of [logoFile, ...imageFiles].filter(Boolean)) {
    if (f.size > IMAGE_MAX_MB * 1024 * 1024) errs.push(`${f.fieldname} "${f.originalname}" exceeds ${IMAGE_MAX_MB}MB`);
  }
  if (logoFile && logoFile.mimetype === "image/svg+xml" && !looksLikeSvg(logoFile.path)) {
    errs.push("logo claims image/svg+xml but does not look like an SVG");
  }
}

module.exports = { validateCreate, validateUploads };
