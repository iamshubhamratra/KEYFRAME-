// KEYFRAME project routes — the script-checkpoint flow.
//
//   POST /api/projects               scope gate; create; runs intake; pauses at script_review
//   GET  /api/projects/:id           full state incl. brief + script + warnings
//   POST /api/projects/:id/approve   resume production with (edited) script
//   POST /api/projects/:id/regenerate  re-run from "brief" or "script"
//
// Phase 3 turns the create route multipart (video upload + URL ingest); for
// now it accepts JSON with a prompt (and optional websiteUrl, ignored until
// the ingest workers land).

const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const { customAlphabet } = require("nanoid");
const config = require("../config");
const db = require("../db");
const frameRegistry = require("../services/frame_registry");
const { validateScript, normalizeScript } = require("../services/script");
const captionLang = require("../services/caption_lang");
const captionDirector = require("../services/caption_director");
const pacing = require("../services/pacing");
const {
  analyzeScope, forClient: scopeForClient, reduce: reduceScope, logDecision, mergeClarification,
} = require("../services/prompt_scope");

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

// Uploads (multipart). JSON bodies bypass multer entirely. Three file fields:
//   referenceVideo — 1 video, transcribed at intake
//   logo           — 1 image, the user's own brand logo (SVG allowed HERE ONLY)
//   assets         — up to 12 images, the user's own product material (tier-100 pins)
const VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
// SVG is logo-only: a vector logo is safe as an <img> in the headless render page
// (scripts don't execute in <img>), but arbitrary SVGs skip every ffprobe gate
// (asset_sources/util.validateImage returns ok:true for .svg WITHOUT probing),
// so the general assets field stays raster-only.
const LOGO_MIMES = new Set([...IMAGE_MIMES, "image/svg+xml"]);
const MAX_USER_IMAGES = 12;
const IMAGE_MAX_MB = 15;
// The saved extension comes from the MIME, never the client filename: the old
// `extname || ".mp4"` default mislabeled anything extension-less as video, and
// downstream code sniffs extensions.
const MIME_EXT = {
  "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm",
  "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/svg+xml": ".svg",
};
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.paths.uploadsDir),
    filename: (_req, file, cb) => {
      const ext = MIME_EXT[file.mimetype] || (path.extname(file.originalname) || ".bin").toLowerCase().slice(0, 8);
      cb(null, `${nanoid()}${ext}`);
    },
  }),
  // fileSize is multer-GLOBAL and video-sized; the tighter per-image cap is
  // enforced post-parse in the route (multer cannot do per-field sizes).
  limits: { fileSize: (config.ingest?.maxUploadMb || 200) * 1024 * 1024, files: 2 + MAX_USER_IMAGES },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "referenceVideo") {
      if (VIDEO_MIMES.has(file.mimetype)) return cb(null, true);
      return cb(new Error(`unsupported video type ${file.mimetype} (mp4/mov/webm only)`));
    }
    if (file.fieldname === "logo") {
      if (LOGO_MIMES.has(file.mimetype)) return cb(null, true);
      return cb(new Error(`unsupported logo type ${file.mimetype} (png/jpg/webp/svg only)`));
    }
    if (file.fieldname === "assets") {
      if (IMAGE_MIMES.has(file.mimetype)) return cb(null, true);
      return cb(new Error(`unsupported image type ${file.mimetype} (png/jpg/webp only)`));
    }
    return cb(new Error(`unexpected file field "${file.fieldname}" (use referenceVideo, logo, or assets)`));
  },
});
const uploadFields = upload.fields([
  { name: "referenceVideo", maxCount: 1 },
  { name: "logo", maxCount: 1 },
  { name: "assets", maxCount: MAX_USER_IMAGES },
]);

function maybeMultipart(req, res, next) {
  if (req.is("multipart/form-data")) {
    uploadFields(req, res, (err) => {
      if (err) {
        // Multer's field-count errors are cryptic ("Unexpected field") — translate.
        const msg = err.code === "LIMIT_UNEXPECTED_FILE"
          ? `too many files or unknown file field "${err.field}" (referenceVideo ×1, logo ×1, assets ×${MAX_USER_IMAGES})`
          : err.message;
        // Multer (2.x) has already removed what it wrote before reporting the error;
        // this is the same no-op-when-clean sweep every other rejection makes.
        discardUploads(req);
        return res.status(400).json({ error: "upload failed", details: [msg] });
      }
      next();
    });
  } else {
    next();
  }
}

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

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

// Multer writes every accepted file to uploadsDir BEFORE the handler runs, so a request
// the handler then turns away has already left its files behind — up to a 200MB
// reference video per request, each kept until the janitor's TTL. The scope gate made
// that the common case rather than the rare one: an out-of-scope request is refused
// AFTER its upload has landed. Every early exit from the create handler comes through
// here.
//
// Fail-silent: a file that is already gone, or locked, is the janitor's to collect — a
// cleanup failure must never turn a clean 4xx into a 500. The containment check keeps
// this a cleanup and never a delete-anything: multer names these files itself today,
// but a storage change that let a path point elsewhere must not be able to reach here.
function discardUploads(req) {
  const staged = req && req.files && typeof req.files === "object" ? Object.values(req.files).flat() : [];
  const dir = path.resolve(config.paths.uploadsDir);
  for (const f of staged) {
    if (!f || typeof f.path !== "string") continue;
    if (path.dirname(path.resolve(f.path)) !== dir) continue;
    try { fs.rmSync(f.path, { force: true }); } catch { /* janitor TTL collects it */ }
  }
}

// An AbortSignal that fires when the CLIENT goes away — not when the request body has
// been read.
//
// The obvious `req.on("close", ...)` is wrong on this Node (22.x): IncomingMessage now
// emits 'close' as soon as its body has been consumed, which for a create request is
// before the handler even runs (express.json / multer have already read it). Verified
// in isolation — a request whose client is still waiting fires req 'close' first, with
// the response not yet written. Wired to that event, every scope analysis would be
// cancelled at birth and every create would silently return nothing. The response's
// 'close' fires only when the socket closes or the response finishes; if it has not
// finished, the client left.
//
// Express does not abort a handler when the socket closes, so without this a person who
// closes the tab mid-analysis still gets billed for the model call and a job nobody
// will ever open.
function clientDisconnectSignal(res) {
  const ac = new AbortController();
  const gone = () => { if (!ac.signal.aborted && !res.writableEnded) ac.abort(new Error("client disconnected")); };
  res.on("close", gone);
  // A socket that died before this listener existed has already emitted its 'close'.
  // Only a POSITIVE sign of death counts — a false positive here would drop every
  // create without a word, so a missing socket is not read as a closed one.
  if (res.destroyed || (res.socket && res.socket.destroyed)) gone();
  return ac.signal;
}

// THE ANSWER TO THE ONE QUESTION.
//
// The scope gate (services/prompt_scope.js) may answer a submit with NEEDS_CLARIFICATION
// and a single question. The client re-submits the SAME request carrying
// clarification: { question, answer } — an object over JSON, a JSON string over
// multipart (FormData stringifies objects: web/src/api.js createProject), the same two
// spellings captions arrives in.
//
// Unlike captions, a malformed clarification is a 400 rather than a silent drop. A
// dropped caption config degrades to "off"; a dropped answer sends the person straight
// back to the question they just answered, with nothing to tell them why.
//
// The question is our own text echoed back and is context only, so it is clipped rather
// than validated. The answer is the person's words and is kept whole; its length is
// judged on the merged prompt, which is what actually has a cap.
// -> { clarification: { question, answer } | null, error: string | null }
function parseClarification(raw) {
  let c = raw;
  if (c == null) return { clarification: null, error: null };
  if (typeof c === "string") {
    const s = c.trim();
    if (!s) return { clarification: null, error: null }; // how a form spells "absent"
    try { c = JSON.parse(s); } catch { c = undefined; }
  }
  if (!c || typeof c !== "object" || Array.isArray(c)) {
    return { clarification: null, error: "clarification must be a JSON object { question, answer }" };
  }
  if (typeof c.answer !== "string" || !c.answer.trim()) {
    return { clarification: null, error: "clarification.answer must be a non-empty string" };
  }
  const question = typeof c.question === "string" ? c.question.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  return { clarification: { question, answer: c.answer.trim() }, error: null };
}

// The answer becomes part of the PROMPT via prompt_scope.mergeClarification: appended to
// the person's words, and REPLACING them only when they were unmistakable junk (no
// letters, a held-down key, keyboard-row mash). It lives beside the nonsense check it
// depends on — see that module for why "nonsense" is now that strict. It used to be
// defined here on top of a looser check, and a German compound or an acronym read as
// nonsense, so the answer silently replaced the person's subject in the stored job.

function validateCreate(body, { hasUpload = false } = {}) {
  const errs = [];
  const out = {};
  if (typeof body !== "object" || body === null) return { errs: ["body must be JSON object"], out };

  // Multi-modal: at least one of prompt / referenceVideo / websiteUrl.
  out.prompt = "";
  let promptRejected = false;
  if (typeof body.prompt === "string" && body.prompt.trim()) {
    const p = body.prompt.trim();
    if (p.length < 10) { errs.push("prompt, when given, must be at least 10 characters"); promptRejected = true; }
    else if (p.length > 4000) { errs.push("prompt must be at most 4000 characters"); promptRejected = true; }
    else out.prompt = p;
  }

  // CLARIFICATION — the answer to the scope gate's one question, merged into the prompt
  // here so the gate, the job row and every stage after it read the same words. See
  // parseClarification / mergeClarification above.
  //
  // Merged BEFORE the "at least one of" check below, so an answer counts as a prompt.
  // With no original prompt there was nothing to clarify — prompt_scope decides every
  // source-only request without a question — so the answer is simply the prompt and
  // meets the same 10-character floor a typed one does; otherwise this field would be a
  // way round that floor. A short answer that REPLACES a nonsense prompt is not held to
  // it: that prompt already passed, and "my bakery" is a complete reply to "what is the
  // video about?".
  {
    const { clarification, error } = parseClarification(body.clarification);
    if (error) errs.push(error);
    else if (clarification && !promptRejected) {
      const hadPrompt = !!out.prompt;
      const merged = mergeClarification(out.prompt, clarification);
      if (merged.length > 4000) errs.push("prompt and clarification together must be at most 4000 characters");
      else if (!hadPrompt && merged.length < 10) errs.push("prompt, when given, must be at least 10 characters");
      else { out.prompt = merged; out.clarification = clarification; }
    }
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

  // VIDEO PACE — how DENSE the film is, not how fast it plays back. See
  // services/pacing.js for what each mode actually changes. Absent = the server
  // default (normal), which is byte-identical to pre-pacing behaviour.
  //
  // Named modes, not a raw number: the modes are formula sets (word budget,
  // cut rate, motion tilt), not a single multiplier, so accepting an arbitrary
  // float would promise interpolation the engine does not do. normalizeMode
  // still ACCEPTS "1.25" and "Fast" as spellings of a mode — which matters over
  // multipart, where every scalar arrives as a string.
  //
  // NAME NOTE: this is job-level `pace`. It is NOT script.voice.pace, which the
  // LLM authors as "calm | conversational | brisk" and which describes the
  // NARRATOR's delivery. Different level, different meaning, both keep their name.
  // Absent -> the SERVER default from config (defaults.pace), not a hardcoded
  // constant. Every other option in this validator reads its default from
  // config the same way (orientation, quality, fps), and config.js boot-
  // validates this one — a validated setting nothing reads is just a trap.
  if (body.pace == null || body.pace === "") {
    out.pace = pacing.normalizeMode(config.defaults.pace) || pacing.DEFAULT_MODE;
  } else {
    const mode = pacing.normalizeMode(body.pace);
    if (!mode) errs.push(`pace must be one of: ${Object.keys(pacing.MODES).join(", ")}`);
    else out.pace = mode;
  }

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

function buildRouter({ enqueueIntake, enqueueProduction }) {
  const router = express.Router();

  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: config.server.rateLimitPerHourPerIp,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => clientIp(req),
    message: { error: "rate limit exceeded", hint: "try again in an hour" },
  });

  // Express 4 does not await a handler: a throw after the first `await` would become an
  // unhandled rejection and a request that never answers. The wrapper hands it to
  // next() — the same 500 the synchronous handler used to get for free — and discards
  // the uploads first unless the job row already owns them (upload_path is the intake
  // source; the originals are the regenerate recovery source).
  router.post("/projects", limiter, maybeMultipart, (req, res, next) => {
    handleCreate(req, res).catch((e) => {
      if (!res.locals.jobCommitted) discardUploads(req);
      next(e);
    });
  });

  async function handleCreate(req, res) {
    // upload.fields() puts files on req.files (keyed by field); req.file is gone.
    const files = req.files || {};
    const referenceVideo = files.referenceVideo && files.referenceVideo[0] ? files.referenceVideo[0] : null;
    const logoFile = files.logo && files.logo[0] ? files.logo[0] : null;
    const imageFiles = Array.isArray(files.assets) ? files.assets : [];
    const uploadPath = referenceVideo ? referenceVideo.path : null;

    // hasUpload means the VIDEO: images supplement a subject, they cannot BE one.
    const { errs, out } = validateCreate(req.body || {}, { hasUpload: !!uploadPath });
    if (!out.prompt && !out.websiteUrl && !out.blogUrl && !uploadPath && (logoFile || imageFiles.length)) {
      errs.push("images supplement a subject — also provide a prompt, websiteUrl, blogUrl, or referenceVideo");
    }
    for (const f of [logoFile, ...imageFiles].filter(Boolean)) {
      if (f.size > IMAGE_MAX_MB * 1024 * 1024) errs.push(`${f.fieldname} "${f.originalname}" exceeds ${IMAGE_MAX_MB}MB`);
    }
    if (logoFile && logoFile.mimetype === "image/svg+xml" && !looksLikeSvg(logoFile.path)) {
      errs.push("logo claims image/svg+xml but does not look like an SVG");
    }
    if (errs.length) {
      discardUploads(req);
      return res.status(400).json({ error: "invalid request", details: errs });
    }

    // The cap is checked BEFORE the gate so a request that could never be accepted
    // today does not pay for a model call first.
    const capReached = () => db.countJobsSince(Date.now() - 24 * 60 * 60 * 1000) >= config.server.dailyJobCap;
    if (capReached()) {
      discardUploads(req);
      return res.status(429).json({ error: "daily job cap reached" });
    }

    // THE SCOPE GATE — can KEYFRAME fulfil this by making a video? Decided here, on
    // submit, BEFORE the job row, the queue, ingest, the brief, assets, TTS or render:
    // everything that costs money sits behind this line. See services/prompt_scope.js
    // for the order of decision (tier-1 moderation -> source-only -> nonsense ->
    // model under a hard budget -> fail-open).
    //
    // Anything but SUPPORTED stops the request here with a 422 whose body carries the
    // client projection of the decision: the one question (NEEDS_CLARIFICATION), what
    // KEYFRAME can make and how (OUT_OF_SCOPE), or the plain refusal (DISALLOWED). No
    // row, no enqueue, no spend. A refused request is NEVER rewritten into some other
    // film — the person decides what to make next.
    //
    // analyzeScope never throws and fails open to SUPPORTED, so a provider outage costs
    // the gate its judgement, never the person their video.
    const signal = clientDisconnectSignal(res);
    const { scope } = await analyzeScope({
      prompt: out.prompt,
      sources: {
        websiteUrl: out.websiteUrl,
        blogUrl: out.blogUrl,
        referenceVideo: !!uploadPath,
        uploadedImages: !!(logoFile || imageFiles.length),
      },
      preferences: { duration: out.duration, orientation: out.orientation, pace: out.pace },
      clarification: out.clarification || null,
      // This route takes the create screen's inputs (links, uploads, languages, script
      // review, Autopilot), so a refusal's "how to create a video" steps describe those.
      surface: "create-screen",
      signal,
    });
    logDecision(scope, { route: "projects", ip: clientIp(req), ...(signal.aborted ? { clientGone: true } : {}) });

    // The person closed the tab while the gate was deciding. Nobody will ever poll a
    // job made now, and on autopilot it would render to completion regardless.
    if (signal.aborted) {
      discardUploads(req);
      return;
    }

    if (!scope.isSupported) {
      discardUploads(req);
      return res.status(422).json({ error: scope.userMessage, scope: scopeForClient(scope) });
    }

    // Checked AGAIN, not just once. This handler was synchronous from the cap check to
    // the insert, which made the pair atomic; the await above opened a window as long
    // as the gate's budget in which any number of concurrent creates could all pass the
    // first check. One loop over the in-memory store closes it.
    if (capReached()) {
      discardUploads(req);
      return res.status(429).json({ error: "daily job cap reached" });
    }

    const dims = config.dimensionsFor(out.orientation, out.quality);
    const jobId = nanoid();

    // The user's own images become part of the JOB, not transient uploads: copy them
    // into jobs/<id>/uploads/ (jobDir-relative paths — the convention every asset
    // carries, and what hyperframes resolves against since it renders with cwd:jobDir).
    // Originals stay in uploadsDir under its janitor TTL as the regenerate recovery
    // source. Copy failures degrade the manifest, never the create.
    let userAssets = null;
    if (logoFile || imageFiles.length) {
      const upDir = path.join(config.paths.jobsDir, jobId, "uploads");
      fs.mkdirSync(upDir, { recursive: true });
      const manifest = [];
      const stage = (file, id, role) => {
        try {
          const rel = `uploads/${id}${MIME_EXT[file.mimetype] || ".bin"}`;
          fs.copyFileSync(file.path, path.join(config.paths.jobsDir, jobId, rel));
          manifest.push({
            id, role, path: rel,
            originalName: String(file.originalname || "").slice(0, 120),
            mime: file.mimetype, bytes: file.size, classified: false,
          });
        } catch (e) { console.warn(`[projects] failed to stage upload ${file.originalname}: ${e.message}`); }
      };
      if (logoFile) stage(logoFile, "logo", "logo");
      imageFiles.forEach((f, i) => stage(f, `u${i + 1}`, "asset"));
      if (manifest.length) userAssets = manifest;
    }

    db.insert({
      id: jobId,
      kind: "project",
      prompt: out.prompt,
      duration: out.duration,
      orientation: out.orientation,
      quality: out.quality,
      width: dims.width,
      height: dims.height,
      fps: out.fps,
      framePack: out.framePack === "auto" ? null : out.framePack,
      voiceStyle: out.voiceStyle,
      autopilot: out.autopilot,
      captionsEnabled: out.captions,
      captionsConfig: out.captionsConfig || null,
      voiceoverEnabled: out.voiceover,
      brandPalette: out.brandPalette || null,
      render3d: out.render3d,
      composeMode: out.composeMode,
      pace: out.pace,
      uploadPath,
      userAssets,
      // The gate's decision, for audit: how it was reached (moderation / input mode /
      // heuristic / model / fail-open), what it cost and every coercion applied. Kept
      // OFF `intent` deliberately — intent is stringified whole into the brief model's
      // message, and the gate's verdict is not creative direction.
      promptScope: reduceScope(scope),
      intent: {
        prompt: out.prompt,
        websiteUrl: out.websiteUrl || null,
        blogUrl: out.blogUrl || null,
        hasReferenceVideo: !!uploadPath,
        hasUserAssets: userAssets ? { count: userAssets.filter((u) => u.role === "asset").length, hasLogo: userAssets.some((u) => u.role === "logo") } : null,
        preferences: {
          duration: out.duration,
          orientation: out.orientation,
          voiceStyle: out.voiceStyle || "auto",
          framePack: out.framePack,
          // OMITTED at the default pace, so a default-pace brief prompt is
          // byte-identical to the pre-feature one. `intent` is stringified whole
          // into the brief LLM's message, so an always-present `"pace":"normal"`
          // would change every existing job's prompt to say something the model
          // already assumed.
          //
          // This is only the CREATIVE hint (it lets the model pitch tone and
          // music at the right energy). It is NOT how the script gets its
          // budget: BriefSchema strips unknown keys, so the real config is
          // re-attached server-side from the JOB in project_pipeline.runIntake.
          ...(out.pace && out.pace !== pacing.DEFAULT_MODE ? { pace: out.pace } : {}),
        },
      },
      created_at: Date.now(),
      client_ip: clientIp(req),
    });
    res.locals.jobCommitted = true;

    enqueueIntake(jobId);

    res.status(202).json({
      projectId: jobId,
      statusUrl: `/api/projects/${jobId}`,
      autopilot: out.autopilot,
      nextStep: out.autopilot
        ? "pipeline will run end-to-end automatically"
        : "poll statusUrl until status=script_review, then POST .../approve",
      // What the gate understood, so the client can say up front what KEYFRAME will
      // NOT do from this request (unsupportedParts) rather than leave the person to
      // discover it in the finished film. No confidence, no cost — see forClient.
      scope: { status: scope.status, videoIntent: scope.videoIntent, unsupportedParts: scope.unsupportedParts },
    });
  }

  router.get("/projects", (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    // Optional ?limit= (clamped 1-200) — the gallery asks for more than the
    // 30 default so a real finished film isn't crowded out by newer test/
    // failed generations that never produced a video.
    const reqLimit = Number(req.query.limit);
    const limit = Number.isFinite(reqLimit) ? Math.max(1, Math.min(200, Math.round(reqLimit))) : 30;
    res.json({ projects: db.listRecent({ limit, status }) });
  });

  router.get("/projects/:id", (req, res) => {
    if (!/^[0-9a-z]{6,20}$/.test(req.params.id)) return res.status(400).json({ error: "bad id" });
    const job = db.get(req.params.id);
    if (!job) return res.status(404).json({ error: "not found" });
    res.json(job);
  });

  // SSE: push the project state whenever status/progress changes, so the
  // frontend doesn't have to poll. Closes itself on terminal states.
  router.get("/projects/:id/events", (req, res) => {
    if (!/^[0-9a-z]{6,20}$/.test(req.params.id)) return res.status(400).json({ error: "bad id" });
    if (!db.get(req.params.id)) return res.status(404).json({ error: "not found" });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    let lastKey = "";
    const send = () => {
      const p = db.get(req.params.id);
      if (!p) return true;
      const key = `${p.status}|${p.progress}|${(p.assets || []).length}|${p.script ? 1 : 0}`;
      if (key !== lastKey) {
        lastKey = key;
        res.write(`data: ${JSON.stringify(p)}\n\n`);
      }
      return ["done", "failed"].includes(p.status);
    };

    if (send()) { res.end(); return; }
    const timer = setInterval(() => {
      try {
        if (send()) { clearInterval(timer); res.end(); }
      } catch { clearInterval(timer); }
    }, 1000);
    req.on("close", () => clearInterval(timer));
  });

  router.post("/projects/:id/approve", (req, res) => {
    if (!/^[0-9a-z]{6,20}$/.test(req.params.id)) return res.status(400).json({ error: "bad id" });
    const raw = db.getRaw(req.params.id);
    if (!raw) return res.status(404).json({ error: "not found" });
    if (raw.status !== "script_review") {
      return res.status(409).json({ error: `project is "${raw.status}", not script_review` });
    }

    // Accept an edited script, or approve the stored draft as-is.
    let script = raw.script;
    let approveWarnings = null;
    if (req.body && req.body.script) {
      // RE-VALIDATE AT THE PACE THE SCRIPT WAS WRITTEN AT. Judging a Fast script
      // by Normal's expectations is how this endpoint would 400 on a script the
      // pipeline itself authored, at the exact moment the user clicks approve.
      // The stored brief carries the pacing intake resolved; falling back to the
      // job's own pace covers a brief written before this existed.
      const pacingCfg = (raw.brief && raw.brief.pacing) || pacing.resolve(raw.pace, {
        durationSec: raw.duration,
        voiceover: raw.voiceover_enabled !== 0,
        orientation: raw.orientation,
      });
      script = normalizeScript(req.body.script, { targetDuration: raw.duration });
      const check = validateScript(script, { targetDuration: raw.duration, pacing: pacingCfg });
      if (!check.ok) {
        return res.status(400).json({ error: "edited script failed validation", details: check.errors, warnings: check.warnings });
      }
      // The user's edits can push a script back over its pace budget. That is
      // their call to make — approve still succeeds — but the warnings ride
      // along on the job so the Script Room and the delivery report can say so
      // rather than the film quietly coming out longer than the mode promised.
      approveWarnings = check.warnings;
    }

    db.markApproved(req.params.id, { script, warnings: approveWarnings });
    enqueueProduction(req.params.id);
    res.status(202).json({ projectId: req.params.id, status: "queued", statusUrl: `/api/projects/${req.params.id}` });
  });

  router.post("/projects/:id/regenerate", (req, res) => {
    if (!/^[0-9a-z]{6,20}$/.test(req.params.id)) return res.status(400).json({ error: "bad id" });
    const raw = db.getRaw(req.params.id);
    if (!raw) return res.status(404).json({ error: "not found" });
    const from = (req.body && req.body.from) || "script";
    if (!["brief", "script"].includes(from)) {
      return res.status(400).json({ error: 'from must be "brief" or "script"' });
    }
    if (raw.status !== "script_review" && raw.status !== "failed") {
      return res.status(409).json({ error: `project is "${raw.status}"; regenerate only from script_review or failed` });
    }
    if (from === "script" && !raw.brief) {
      return res.status(409).json({ error: "no brief on record; regenerate from=brief instead" });
    }

    db.markRequeued(req.params.id, { clearBrief: from === "brief", progress: `regenerate_${from}` });
    enqueueIntake(req.params.id, { skipBrief: from === "script" });
    res.status(202).json({ projectId: req.params.id, status: "queued", from });
  });

  return router;
}

// The clarification and disconnect helpers are shared with routes/generate.js, so the
// two create routes cannot drift apart on how an answer is read or merged, or on how a
// departed client is detected.
module.exports = { buildRouter, validateCreate, parseClarification, mergeClarification, clientDisconnectSignal };
