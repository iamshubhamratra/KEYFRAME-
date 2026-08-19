// KEYFRAME project routes — the script-checkpoint flow.
//
//   POST /api/projects               create; runs intake; pauses at script_review
//   GET  /api/projects/:id           full state incl. brief + script + warnings
//   POST /api/projects/:id/approve   resume production with (edited) script
//   POST /api/projects/:id/regenerate  re-run from "brief" or "script"
//
// Phase 3 turns the create route multipart (video upload + URL ingest); for
// now it accepts JSON with a prompt (and optional websiteUrl, ignored until
// the ingest workers land).

const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const { customAlphabet } = require("nanoid");
const config = require("../config");
const db = require("../db");
const frameRegistry = require("../services/frame_registry");
// The same estimator GET /api/jobs/:id uses — see the note in the project status route.
const { estimateEta, estimateRemainingSec } = require("../services/eta");
const captionLang = require("../services/caption_lang");
const captionDirector = require("../services/caption_director");
const { validateScript, normalizeScript } = require("../services/script");

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

// The band above which a render needs real memory — see the duration validator in validateCreate.
// 150s is not arbitrary: it is the ceiling this API enforced for its whole life, so everything
// at or below it is a length the product has always served on whatever host it was given.
const LONGFORM_FLOOR_SEC = 150;
const LONGFORM_MIN_MEMORY_MB = 4096;

// Uploads (multipart). JSON bodies bypass multer entirely. Three file fields:
//   referenceVideo — 1 video, transcribed at intake (style/transcript signal)
//   logo           — 1 image, the user's own brand logo (SVG allowed HERE ONLY)
//   assets         — up to 12 images, the user's own product material; they become
//                    tier-100 PINNED assets that outrank everything the pipeline fetches
const VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
// SVG is logo-only: a vector logo is common and safe as an <img> in the headless
// render page (scripts don't execute in <img>), but arbitrary uploaded SVGs skip
// every ffprobe gate (validateImage trusts the extension), so the general assets
// field stays raster-only.
const LOGO_MIMES = new Set([...IMAGE_MIMES, "image/svg+xml"]);
const MAX_USER_IMAGES = 12;
const IMAGE_MAX_MB = 15;

// The saved extension comes from the MIME, never from the client's filename: the
// old `extname || ".mp4"` default mislabeled anything extension-less as video, and
// downstream code sniffs extensions (validateImage's .svg trust, partitionAssets).
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
  // fileSize is multer-GLOBAL (per file, all fields) — sized for the video; the
  // tighter per-image cap is enforced post-parse in the route (multer cannot do
  // per-field sizes). files caps the whole multipart at video + logo + 12 images.
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
// rejected at create (input validation may 400; render-time code may not).
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
    // Early SSRF rejection (defense-in-depth; the harvester re-resolves + IP-pins every
    // URL at fetch time in ingest/website_assets.assertPublicUrl). Reject non-http(s),
    // IP-literal hosts, and obviously-internal names so a public hostname with a real
    // TLD is required up front.
    let parsed = null;
    try { parsed = new URL(u); } catch { /* invalid */ }
    const host = parsed ? parsed.hostname.replace(/^\[|\]$/g, "") : "";
    const badHost = !parsed
      || (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || require("node:net").isIP(host) !== 0
      || /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)
      || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host);
    if (badHost) errs.push("websiteUrl must be a public http(s) URL with a domain name (IP addresses and internal hosts are not allowed)");
    else out.websiteUrl = u;
  }

  if (!out.prompt && !out.websiteUrl && !hasUpload) {
    errs.push("provide at least one of: prompt, websiteUrl, referenceVideo");
  }

  const d = body.duration == null ? 30 : Number(body.duration);
  if (!Number.isFinite(d) || d < config.server.minDurationSec || d > config.server.maxDurationSec) {
    errs.push(`duration must be ${config.server.minDurationSec}-${config.server.maxDurationSec} seconds`);
  } else if (d > LONGFORM_FLOOR_SEC && config.server.detectedMemoryMb && config.server.detectedMemoryMb < LONGFORM_MIN_MEMORY_MB) {
    // REFUSE AT THE DOOR RATHER THAN OOM AT MINUTE NINETEEN.
    //
    // Measured peak for a 300s / 1920x1080 render on this box: ~1.35 GB resident across Chromium
    // and node at 2 workers, ~1.2 GB at 1. render.yaml still ships `plan: free` (512 MB) with a
    // comment admitting renders will OOM there. Before this check, a long job on such a host
    // accepted cleanly, captured for twenty minutes and died — and the retry loop made it worse,
    // not better: an NTSTATUS crash drops workers 2 -> 1, which MULTIPLIES the watchdog by the
    // slow factor, so an out-of-memory box gets a five-hour hang instead of a fast failure.
    //
    // Short films are untouched: the floor is the ceiling this API enforced for its whole life.
    errs.push(`videos longer than ${LONGFORM_FLOOR_SEC}s need a host with at least ${LONGFORM_MIN_MEMORY_MB} MB of memory (this one reports ${config.server.detectedMemoryMb} MB)`);
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

  // VOICEOVER — OPT-OUT, the mirror image of captions above. Absent means enabled, so
  // every existing client (and every stored job) keeps its narration untouched. Accepts
  // the boolean or its multipart string form, since multipart coerces every field to text.
  //
  // Narration off is a MIX decision, not a script decision: the script model still writes
  // the lines and the storyboard still reads them (they are scene context), so the picture
  // is byte-identical either way and the user can flip narration back on from the Script
  // Room without regenerating. Only synthesis is skipped. See graph.voiceAgent.
  out.voiceover = !(body.voiceover === false || body.voiceover === "false");
  // Captions — OPT-IN. Accepts either the legacy boolean (`captions: true`) or the
  // multi-language config object `{ enabled, language, translateVoiceover |
  // voiceoverLanguage, exportSRT, exportVTT }`. Over multipart (file uploads) the
  // object arrives JSON-stringified, so parse a "{...}" string first.
  {
    let capIn = body.captions;
    if (typeof capIn === "string") {
      const s = capIn.trim();
      if (s === "true" || s === "false") capIn = s === "true";
      else if (s.startsWith("{")) { try { capIn = JSON.parse(s); } catch { capIn = undefined; } }
    }
    if (capIn && typeof capIn === "object" && capIn.enabled !== false) {
      const supported = captionLang.listLanguages().map((l) => l.code).join(", ");
      // Validate the caption language, the (independent) voiceover language, and the
      // on-screen video-text language. "auto" is the video-text default (match voiceover)
      // and is not a language code, so it skips validation.
      for (const [field, val] of [["caption", capIn.language], ["voiceover", capIn.voiceoverLanguage], ["video text", capIn.videoTextLanguage]]) {
        if (val == null || String(val).toLowerCase() === "auto") continue;
        if (!captionLang.normalizeLang(val)) {
          if (captionLang.isFuture(val)) errs.push(`${field} language "${val}" is coming soon; supported now: ${supported}`);
          else errs.push(`unsupported ${field} language "${val}"; supported: ${supported}`);
        }
      }
    }
    const cfg = captionDirector.normalizeConfig(capIn);
    out.captions = cfg.enabled;   // preserve the legacy boolean the rest of the code reads
    out.captionsConfig = cfg;     // full multi-language settings for the Caption Director
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

  if (body.framePack != null && body.framePack !== "auto") {
    if (typeof body.framePack !== "string" || frameRegistry.resolvePack(body.framePack) == null) {
      errs.push(`framePack must be "auto" or one of: ${frameRegistry.listPacks().join(", ")}`);
    } else {
      out.framePack = body.framePack;
    }
  } else {
    out.framePack = "auto"; // brief suggests; registry default as last resort
  }

  // The user's brand colors, from any source (picker, preset, or an extraction the
  // client already ran). Accepted as an object OR a JSON string: multipart coerces
  // every field to a string, so the upload path can only send it encoded — same
  // dual-shape dance as the booleans above.
  //
  // Kept OUT of `intent.preferences` deliberately (see the insert payload below):
  // that object is brief-model input, and the brief may substitute hexes of its
  // own. A palette is only the user's pick for as long as no model has had an
  // opinion about it, so it travels to the graph as its own field.
  let bp = body.brandPalette;
  // An empty string is how both client paths spell "the user picked no color"
  // (api.js drops empty fields before appending; composeMode above reads "" the
  // same way) — that is absent, not malformed, and absent must never be an error.
  if (typeof bp === "string" && bp.trim() !== "") {
    try { bp = JSON.parse(bp); } catch { errs.push("brandPalette must be JSON"); bp = null; }
  }
  if (bp && typeof bp === "object") {
    const hex = (v) => (/^#[0-9a-fA-F]{6}$/.test(String(v || "")) ? String(v).toLowerCase() : null);
    const primary = hex(bp.primary);
    // primary is the one required stop: secondary/accent are derived downstream when
    // absent, but a palette with nothing to lead it cannot steer an accent at all.
    if (!primary) errs.push("brandPalette.primary must be #RRGGBB");
    else out.brandPalette = {
      v: 1,
      primary,
      secondary: hex(bp.secondary),
      accent: hex(bp.accent),
      source: ["manual", "preset", "website", "logo"].includes(bp.source) ? bp.source : "manual",
      presetId: typeof bp.presetId === "string" ? bp.presetId.slice(0, 32) : null,
      // Everything extraction saw, unfiltered — the Art Director does its own
      // distilling and wants the raw evidence, not our summary of it.
      raw: Array.isArray(bp.raw) ? bp.raw.map(hex).filter(Boolean).slice(0, 6) : [],
    };
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

  router.post("/projects", limiter, maybeMultipart, (req, res) => {
    // upload.fields() puts files on req.files (keyed by field); the legacy
    // upload.single() req.file is gone.
    const files = req.files || {};
    const referenceVideo = files.referenceVideo && files.referenceVideo[0] ? files.referenceVideo[0] : null;
    const logoFile = files.logo && files.logo[0] ? files.logo[0] : null;
    const imageFiles = Array.isArray(files.assets) ? files.assets : [];
    const uploadPath = referenceVideo ? referenceVideo.path : null;

    // hasUpload means the VIDEO: images supplement a subject, they cannot BE one
    // (a logo cannot seed a brief). The validation error says so.
    const { errs, out } = validateCreate(req.body || {}, { hasUpload: !!uploadPath });
    if (!out.prompt && !out.websiteUrl && !uploadPath && (logoFile || imageFiles.length)) {
      errs.push("images supplement a subject — also provide a prompt, websiteUrl, or referenceVideo");
    }
    // Per-image size cap (multer's fileSize limit is global and video-sized).
    for (const f of [logoFile, ...imageFiles].filter(Boolean)) {
      if (f.size > IMAGE_MAX_MB * 1024 * 1024) errs.push(`${f.fieldname} "${f.originalname}" exceeds ${IMAGE_MAX_MB}MB`);
    }
    if (logoFile && logoFile.mimetype === "image/svg+xml" && !looksLikeSvg(logoFile.path)) {
      errs.push("logo claims image/svg+xml but does not look like an SVG");
    }
    if (errs.length) return res.status(400).json({ error: "invalid request", details: errs });

    const since = Date.now() - 24 * 60 * 60 * 1000;
    if (db.countJobsSince(since) >= config.server.dailyJobCap) {
      return res.status(429).json({ error: "daily job cap reached" });
    }

    const dims = config.dimensionsFor(out.orientation, out.quality);
    const jobId = nanoid();

    // The user's own images become part of the JOB, not transient uploads: copy
    // them into jobs/<id>/uploads/ (jobDir-relative paths — the convention every
    // asset carries) and record a manifest the intake classifier (Phase 2) enriches
    // and the asset pipeline pins from. Originals stay in uploadsDir under its 24h
    // janitor TTL as the regenerate recovery source. Copy failures degrade to a
    // smaller manifest — user images must never kill a create.
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
            mime: file.mimetype, bytes: file.size,
            classified: false,
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
      brandPalette: out.brandPalette,
      userAssets,
      voiceStyle: out.voiceStyle,
      voiceoverEnabled: out.voiceover,
      autopilot: out.autopilot,
      captionsEnabled: out.captions,
      captionsConfig: out.captionsConfig || null,
      render3d: out.render3d,
      composeMode: out.composeMode,
      uploadPath,
      intent: {
        prompt: out.prompt,
        websiteUrl: out.websiteUrl || null,
        hasReferenceVideo: !!uploadPath,
        // A light flag only — the full manifest rides job.user_assets (like
        // brand_palette, it must never round-trip through the brief model). The
        // Phase-2 intake classifier enriches intent with the real inventory.
        hasUserAssets: userAssets ? { count: userAssets.filter((u) => u.role === "asset").length, hasLogo: userAssets.some((u) => u.role === "logo") } : null,
        // Brief-model input. brandPalette is intentionally absent: it rides the
        // top-level field above so the user's exact hexes reach the Art Director
        // without a model in between.
        preferences: {
          duration: out.duration,
          orientation: out.orientation,
          voiceStyle: out.voiceStyle || "auto",
          framePack: out.framePack,
        },
      },
      created_at: Date.now(),
      client_ip: clientIp(req),
    });

    enqueueIntake(jobId);

    res.status(202).json({
      projectId: jobId,
      statusUrl: `/api/projects/${jobId}`,
      autopilot: out.autopilot,
      nextStep: out.autopilot
        ? "pipeline will run end-to-end automatically"
        : "poll statusUrl until status=script_review, then POST .../approve",
    });
  });

  router.get("/projects", (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ projects: db.listRecent({ limit: 30, status }) });
  });

  router.get("/projects/:id", (req, res) => {
    if (!/^[0-9a-z]{6,20}$/.test(req.params.id)) return res.status(400).json({ error: "bad id" });
    const job = db.get(req.params.id);
    if (!job) return res.status(404).json({ error: "not found" });

    // THE ETA THE CLIENT ALREADY KNOWS HOW TO SHOW.
    //
    // ProductionTheater guards its "about N min to go" line on `estimatedRemainingSec`, and that
    // field was computed in exactly one place — GET /api/jobs/:id — which the web app never
    // calls. So the branch was unreachable and every user got the generic waiting copy instead.
    // Harmless on a two-minute short; on a twenty-minute long-form render it means the one
    // screen whose job is to manage the wait offers no estimate at all, while the stall warning
    // beside it says the run is probably wedged.
    //
    // services/eta.js already models a 300s film correctly, so this is wiring, not arithmetic.
    // Attached to the response copy only — `db.get` returns a shaped object, never the record.
    try {
      if (job.status === "running") {
        job.estimatedRemainingSec = estimateRemainingSec({
          duration: job.duration,
          orientation: job.orientation,
          resolutionQuality: job.quality || config.defaults.quality,
          renderQuality: config.server.renderQuality,
          cpus: config.server.detectedCpus,
          startedAtMs: job.startedAt,
        });
      } else if (job.status === "queued") {
        const posInQueue = db.queuePosition(req.params.id) || 1;
        const jobsAhead = db.activeCount() + (posInQueue - 1);
        const eta = estimateEta({
          duration: job.duration,
          orientation: job.orientation,
          resolutionQuality: job.quality || config.defaults.quality,
          renderQuality: config.server.renderQuality,
          cpus: config.server.detectedCpus,
          jobsAhead,
          concurrency: config.server.jobConcurrency,
        });
        job.queuePosition = posInQueue;
        job.jobsAhead = jobsAhead;
        job.estimatedWaitSec = eta.waitSec;
        job.estimatedRenderSec = eta.renderSec;
        job.estimatedTotalSec = eta.totalSec;
      }
    } catch { /* an estimate is never worth a failed status read */ }

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
    if (req.body && req.body.script) {
      script = normalizeScript(req.body.script, { targetDuration: raw.duration });
      const check = validateScript(script, { targetDuration: raw.duration });
      if (!check.ok) {
        return res.status(400).json({ error: "edited script failed validation", details: check.errors, warnings: check.warnings });
      }
    }

    db.markApproved(req.params.id, { script });
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

module.exports = { buildRouter };
