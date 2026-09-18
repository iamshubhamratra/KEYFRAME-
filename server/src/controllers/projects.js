// Projects — the script-checkpoint flow.
//
//   POST /api/projects                 create; runs intake; pauses at script_review
//   GET  /api/projects                 recent projects (gallery)
//   GET  /api/projects/:id             full state incl. brief + script + warnings
//   GET  /api/projects/:id/events      SSE: the project whenever it changes
//   POST /api/projects/:id/approve     resume production with (edited) script
//   POST /api/projects/:id/regenerate  re-run from "brief" or "script"

const path = require("node:path");
const fs = require("node:fs");
const { customAlphabet } = require("nanoid");
const config = require("../config");
const jobs = require("../models/job");
const jobView = require("../views/job");
const { validateScript, normalizeScript } = require("../services/script");
const { validateCreate, validateUploads } = require("../validators/project");
const { isJobId } = require("../validators/common");
const { clientIp } = require("../middleware/rate_limit");
const { MIME_EXT } = require("../middleware/uploads");

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

// The user's own images become part of the JOB, not transient uploads: copy them
// into jobs/<id>/uploads/ (jobDir-relative paths — the convention every asset
// carries, and what hyperframes resolves against since it renders with cwd:jobDir).
// Originals stay in uploadsDir under its janitor TTL as the regenerate recovery
// source. Copy failures degrade the manifest, never the create.
function stageUserAssets(jobId, logoFile, imageFiles) {
  if (!logoFile && !imageFiles.length) return null;
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
  return manifest.length ? manifest : null;
}

function projectsController({ enqueueIntake, enqueueProduction }) {
  function create(req, res) {
    // upload.fields() puts files on req.files (keyed by field); req.file is gone.
    const files = req.files || {};
    const referenceVideo = files.referenceVideo && files.referenceVideo[0] ? files.referenceVideo[0] : null;
    const logoFile = files.logo && files.logo[0] ? files.logo[0] : null;
    const imageFiles = Array.isArray(files.assets) ? files.assets : [];
    const uploadPath = referenceVideo ? referenceVideo.path : null;

    // hasUpload means the VIDEO: images supplement a subject, they cannot BE one.
    const { errs, out } = validateCreate(req.body || {}, { hasUpload: !!uploadPath });
    validateUploads(out, { uploadPath, logoFile, imageFiles }, errs);
    if (errs.length) return res.status(400).json({ error: "invalid request", details: errs });

    const since = Date.now() - 24 * 60 * 60 * 1000;
    if (jobs.countJobsSince(since) >= config.server.dailyJobCap) {
      return res.status(429).json({ error: "daily job cap reached" });
    }

    const dims = config.dimensionsFor(out.orientation, out.quality);
    const jobId = nanoid();
    const userAssets = stageUserAssets(jobId, logoFile, imageFiles);

    jobs.insert({
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
          // The brief sees the pace as a HINT (write punchier for "fast"). The
          // binding budget is the job's own `pace` column — a preference the
          // model reads can be ignored by it, so it is never the source of truth.
          pace: out.pace,
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
  }

  function index(req, res) {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    // Optional ?limit= (clamped 1-200) — the gallery asks for more than the
    // 30 default so a real finished film isn't crowded out by newer test/
    // failed generations that never produced a video.
    const reqLimit = Number(req.query.limit);
    const limit = Number.isFinite(reqLimit) ? Math.max(1, Math.min(200, Math.round(reqLimit))) : 30;
    res.json({ projects: jobs.listRecent({ limit, status }).map(jobView.presentSummary) });
  }

  function show(req, res) {
    if (!isJobId(req.params.id)) return res.status(400).json({ error: "bad id" });
    const job = jobView.present(jobs.getRaw(req.params.id));
    if (!job) return res.status(404).json({ error: "not found" });
    res.json(job);
  }

  // SSE: push the project state whenever status/progress changes, so the
  // frontend doesn't have to poll. Closes itself on terminal states.
  function events(req, res) {
    if (!isJobId(req.params.id)) return res.status(400).json({ error: "bad id" });
    if (!jobs.getRaw(req.params.id)) return res.status(404).json({ error: "not found" });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    let lastKey = "";
    const send = () => {
      const p = jobView.present(jobs.getRaw(req.params.id));
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
  }

  function approve(req, res) {
    if (!isJobId(req.params.id)) return res.status(400).json({ error: "bad id" });
    const raw = jobs.getRaw(req.params.id);
    if (!raw) return res.status(404).json({ error: "not found" });
    if (raw.status !== "script_review") {
      return res.status(409).json({ error: `project is "${raw.status}", not script_review` });
    }

    // Accept an edited script, or approve the stored draft as-is.
    let script = raw.script;
    if (req.body && req.body.script) {
      // Measured against the job's OWN pace: the draft was written to that word
      // budget, so re-checking an edit at Normal's 2.6 w/s would wave through
      // copy a Fast film's narrator cannot read inside its scene. raw.pace is
      // absent on pre-pacing projects and pacing.resolve() reads that as normal.
      script = normalizeScript(req.body.script, { targetDuration: raw.duration, pacing: raw.pace });
      const check = validateScript(script, { targetDuration: raw.duration, pacing: raw.pace });
      if (!check.ok) {
        return res.status(400).json({ error: "edited script failed validation", details: check.errors, warnings: check.warnings });
      }
    }

    jobs.markApproved(req.params.id, { script });
    enqueueProduction(req.params.id);
    res.status(202).json({ projectId: req.params.id, status: "queued", statusUrl: `/api/projects/${req.params.id}` });
  }

  function regenerate(req, res) {
    if (!isJobId(req.params.id)) return res.status(400).json({ error: "bad id" });
    const raw = jobs.getRaw(req.params.id);
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

    jobs.markRequeued(req.params.id, { clearBrief: from === "brief", progress: `regenerate_${from}` });
    enqueueIntake(req.params.id, { skipBrief: from === "script" });
    res.status(202).json({ projectId: req.params.id, status: "queued", from });
  }

  return { create, index, show, events, approve, regenerate };
}

module.exports = projectsController;
