// VIDEO EDIT RENDER ROUTES — POST /:id/render · GET /:id/renders/:rid · GET /:id/exports · POST /:id/logo, and the
// render media kinds (API.md §2, §3).
//
// WHY THIS EXISTS. Everything a user downloads or watches after the analysis is a render of one plan revision, and
// every one of those files is private user data: paths come only from the project's render records (never from the
// URL), keys are validated render ids, and the owner check runs before any of this (routes.js). This module keeps
// that surface in one place and adapts the engine's QA report (ENGINE.md §7: clean/review/weak/blocked, 0–100,
// blocker/major/minor) to what the editor shows (verdict pass/review/fail, a 0–10 score, a short list of checks and
// the per-element findings with 'fail'/'warn' severities).
//
// CONTRACT:
//   createRenderHandlers({ store, renders, settings, log, now, events, admission }) -> {
//     postRender, getRender, getExports, postLogo, logoUpload (multer middleware), mediaResolvers,
//     qaFindingsFor(project, revision) -> { revision, findings:[{ severity:'fail'|'warn', category, elementId?, detail }] } | null
//   }
//   renderView(project, record, { detailed }) · qaClientView(report|summary) · filesView(project, record)

const fs = require("node:fs");
const path = require("node:path");
const multer = require("multer");
const { z } = require("zod");
const fsx = require("./fsx");
const { EditError } = require("./errors");

const RENDER_ID_RE = /^rd_[0-9a-z]{8}$/;
const MB = 1024 * 1024;
const LOGO_MAX_BYTES = 5 * MB;
const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const round1 = (x) => Math.round(x * 10) / 10;

const RenderBody = z.object({
  kind: z.enum(["preview", "export"]).default("preview"),
  planRevision: z.number().int().min(1).optional(),
  profile: z.enum(["preview540", "export720", "export1080"]).optional(),
}).strip();

function httpError(code, status, extra = {}) { return new EditError(code, { status, errorClass: "input", ...extra }); }

function slug(project) {
  const t = String((project && (project.title || (project.source && project.source.displayName))) || "edit")
    .replace(/\.[a-z0-9]{2,4}$/i, "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return t || "edit";
}

function fileSize(store, projectId, rel) {
  try { return fs.statSync(store.abs(projectId, rel)).size; } catch { return null; }
}

// ---- QA adaptation --------------------------------------------------------------------------------
const SEVERITY = { blocker: "fail", major: "warn", minor: "warn" };
function qaClientView(q, { checks = null } = {}) {
  if (!isPlain(q)) return null;
  const verdict = q.verdict === "clean" ? "pass" : q.verdict === "blocked" || q.verdict === "weak" ? "fail" : q.verdict === "pass" || q.verdict === "fail" ? q.verdict : "review";
  const counts = isPlain(q.counts) ? q.counts : {};
  return {
    verdict,
    score: Number.isFinite(q.score) ? round1(q.score > 10 ? q.score / 10 : q.score) : null,
    headline: q.headline || null,
    counts: { blockers: counts.blockers || 0, majors: counts.majors || 0, minors: counts.minors || 0, fail: counts.blockers || 0, warn: (counts.majors || 0) + (counts.minors || 0) },
    unverified: !!q.unverified,
    checks: checks || null,
  };
}

function checksFrom(report, rec) {
  // The export dialog's short list: format, duration, audio, captions, B-roll, sync — each ok unless a finding says otherwise.
  const issues = report && Array.isArray(report.issues) ? report.issues : [];
  const has = (...cats) => issues.filter((i) => cats.includes(i.category) && i.severity !== "minor");
  const out = [];
  const w = rec.width, h = rec.height;
  out.push({ id: "format", ok: !has("DURATION_MISMATCH").length && !!(w && h), label: w && h ? `${w}×${h} · 30fps` : "Format", detail: "H.264 · AAC" });
  const d = Number(rec.durationSec) || 0;
  out.push({ id: "duration", ok: !has("DURATION_MISMATCH").length, label: "Duration matches", detail: `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, "0")}` });
  const lu = rec.audio && Number.isFinite(rec.audio.integratedLufs) ? rec.audio.integratedLufs : null;
  const tp = rec.audio && Number.isFinite(rec.audio.truePeakDb) ? rec.audio.truePeakDb : null;
  out.push({ id: "loudness", ok: !has("LOUDNESS", "SILENCE").length, label: "Audio", detail: lu != null ? `${lu.toFixed(1)} LUFS${tp != null ? ` · peak ${tp.toFixed(1)} dB` : ""}` : "measured" });
  const cap = has("CAPTION_TIMING", "COVERAGE", "CAPTION_COVERS_FACE", "CAPTION_UNREADABLE", "TEXT_OFFSCREEN");
  out.push({ id: "caption_safe", ok: !cap.length, label: cap.length ? "Captions need a look" : "Captions in safe zone", detail: cap.length ? cap[0].detail : "timed to your words" });
  const br = has("BROLL_OFF_TOPIC", "BROLL_LOW_QUALITY", "BROLL_WATERMARK", "ASSET_BROKEN");
  out.push({ id: "broll", ok: !br.length, label: br.length ? "A B-roll needs a look" : "B-roll checked", detail: br.length ? br[0].detail : "on topic" });
  const av = has("AV_OFFSET");
  out.push({ id: "av_sync", ok: !av.length, label: "A/V sync", detail: av.length ? av[0].detail : "in sync" });
  return out;
}

function readQaReport(store, projectId, renderId) {
  try { return JSON.parse(fs.readFileSync(store.abs(projectId, `qa/${renderId}/report.json`), "utf8")); } catch { return null; }
}

// ---- views ----------------------------------------------------------------------------------------
function filesView(store, project, rec) {
  const f = isPlain(rec.files) ? rec.files : {};
  const base = slug(project);
  const kindOfMp4 = rec.kind === "export" ? "export" : "preview";
  const out = {};
  if (f.mp4) out.mp4 = { kind: kindOfMp4, key: rec.id, filename: `${base}.mp4`, sizeBytes: fileSize(store, project.id, f.mp4) };
  if (f.srt) out.srt = { kind: "captions", key: `${rec.id}.srt`, filename: `${base}.srt`, sizeBytes: fileSize(store, project.id, f.srt) };
  if (f.vtt) out.vtt = { kind: "captions", key: `${rec.id}.vtt`, filename: `${base}.vtt`, sizeBytes: fileSize(store, project.id, f.vtt) };
  if (f.credits) out.credits = { kind: "credits", key: rec.id, filename: `${base}-credits.txt`, sizeBytes: fileSize(store, project.id, f.credits) };
  if (f.poster) out.poster = { kind: "frame", key: rec.id, filename: `${base}.jpg`, sizeBytes: fileSize(store, project.id, f.poster) };
  return out;
}

function renderView(store, project, rec, { detailed = false } = {}) {
  const base = {
    renderId: rec.id, kind: rec.kind === "export" ? "export" : "preview", profile: rec.profile || null, planRevision: rec.planRev,
    status: rec.status, pct: Number(rec.pct) || 0, etaSec: rec.etaSec ?? null, stage: rec.stage || null, queuePosition: rec.queuePosition ?? null,
    compositionHash: rec.compositionHash || null, durationSec: rec.durationSec || null, width: rec.width || null, height: rec.height || null, fps: 30,
    createdAt: rec.createdAt || null, finishedAt: rec.finishedAt || null,
    error: isPlain(rec.error) ? { code: String(rec.error.code || "RENDER_FAILED").slice(0, 64), message: String(rec.error.message || "").slice(0, 300) } : null,
    qa: rec.qa ? qaClientView(rec.qa) : null,
  };
  if (!detailed) return base;
  const report = readQaReport(store, project.id, rec.id);
  if (base.qa) {
    base.qa.checks = checksFrom(report, rec);
    const prev = (project.renders || []).find((r) => r && r.kind === "preview" && r.status === "done" && r.planRev === rec.planRev && r.id !== rec.id);
    if (rec.kind === "export") {
      const ok = !!(prev && prev.compositionHash && rec.compositionHash && prev.planHash === rec.planHash);
      base.qa.matchesPreview = { renderId: prev ? prev.id : null, planRevision: rec.planRev, ok };
      base.qa.checks.unshift({ id: "preview_match", ok, label: ok ? `Matches preview r${rec.planRev}` : `No preview of r${rec.planRev} to compare`, detail: ok ? "same edit" : "update the preview to compare" });
    }
  }
  base.files = filesView(store, project, rec);
  base.credits = (Array.isArray(rec.credits) ? rec.credits : []).map((c) => ({ assetId: c.assetId || null, text: c.attribution || c.provider || "", license: c.license || null, sourceUrl: c.sourceUrl || null }));
  base.notes = (Array.isArray(rec.notes) ? rec.notes : []).map((n) => ({ code: String(n.code || "").slice(0, 64), elementId: n.elementId || null }));
  return base;
}

function createRenderHandlers({ store, renders, settings, log = console, now = Date.now, events = null, admission = null } = {}) {
  if (!store || !renders) throw new TypeError("video_edit/render_routes: store and renders are required");
  const say = (level, msg) => { try { (log[level] || log.log || console.log).call(log, msg); } catch { /* noop */ } };
  const publish = (id, type, data) => { try { if (events && typeof events.publish === "function") events.publish(id, type, data); } catch { /* noop */ } };
  const findRender = (p, rid) => (RENDER_ID_RE.test(String(rid)) && Array.isArray(p.renders) ? p.renders.find((r) => r && r.id === rid) || null : null);

  async function postRender(req, res) {
    const parsed = RenderBody.safeParse(req.body || {});
    if (!parsed.success) throw httpError("VALIDATION_FAILED", 422, { extra: { field: String(parsed.error.issues[0] && parsed.error.issues[0].path.join(".")) } });
    const body = parsed.data;
    const r = await renders.request(req.project.id, { kind: body.kind, planRevision: body.planRevision ?? null, profile: body.profile || null });
    if (r.cached) return res.status(200).json({ renderId: r.renderId, cached: true });
    return res.status(202).json({ renderId: r.renderId, queuePosition: r.queuePosition || 0 });
  }

  async function getRender(req, res) {
    const p = store.get(req.project.id);
    const rec = findRender(p, req.params.rid);
    if (!rec) throw httpError("NOT_FOUND", 404);
    res.json(renderView(store, p, rec, { detailed: true }));
  }

  async function getExports(req, res) {
    const p = store.get(req.project.id);
    const head = isPlain(p.plan) ? p.plan.headRevision || 0 : 0;
    const exps = (Array.isArray(p.renders) ? p.renders : []).filter((r) => r && !r.hidden && r.kind === "export" && r.status === "done").sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
    const currentId = isPlain(p.exports) && RENDER_ID_RE.test(String(p.exports.currentId)) ? p.exports.currentId : null;
    const cur = exps.find((r) => r.id === currentId);
    res.json({
      currentId,
      stale: !!(cur && cur.planRev < head) || !!(isPlain(p.exports) && p.exports.stale),
      items: exps.slice(0, 20).map((r) => {
        const v = renderView(store, p, r, { detailed: true });
        return { renderId: r.id, planRev: r.planRev, planRevision: r.planRev, profile: r.profile, createdAt: r.createdAt, qa: v.qa ? { verdict: v.qa.verdict, score: v.qa.score } : null, checks: v.qa ? v.qa.checks : [], credits: v.credits, files: v.files };
      }),
    });
  }

  // ---- logo ---------------------------------------------------------------------------------------
  let logoUploader = null;
  function logoUpload(req, res, next) {
    if (!logoUploader) {
      logoUploader = multer({
        storage: multer.diskStorage({
          destination: (rq, file, cb) => { try { cb(null, fsx.ensureDir(settings.paths.stagingDir)); } catch (e) { cb(e); } },
          filename: (rq, file, cb) => cb(null, `${require("./ids").newId("logo")}.upload`),
        }),
        limits: { fileSize: LOGO_MAX_BYTES, files: 1, fields: 4, fieldSize: 1024, parts: 6 },
      }).single("logo");
    }
    logoUploader(req, res, (err) => {
      if (!err) return next();
      if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
      if (err.code === "LIMIT_FILE_SIZE") return next(httpError("FILE_TOO_LARGE", 413, { extra: { field: "logo", limitMb: LOGO_MAX_BYTES / MB } }));
      return next(httpError("VALIDATION_FAILED", 422, { extra: { field: "logo" } }));
    });
  }

  async function sniffImage(file) {
    const fh = await fs.promises.open(file, "r");
    try {
      const b = Buffer.alloc(16);
      const { bytesRead } = await fh.read(b, 0, 16, 0);
      const x = b.subarray(0, bytesRead);
      if (x.length >= 8 && x.readUInt32BE(0) === 0x89504e47) return "png";
      if (x.length >= 3 && x[0] === 0xff && x[1] === 0xd8 && x[2] === 0xff) return "jpeg";
      if (x.length >= 12 && x.toString("latin1", 0, 4) === "RIFF" && x.toString("latin1", 8, 12) === "WEBP") return "webp";
      return null;
    } finally { await fh.close().catch(() => {}); }
  }

  async function postLogo(req, res) {
    const id = req.project.id;
    const file = req.file;
    if (!file) throw httpError("VALIDATION_FAILED", 422, { extra: { field: "logo" } });
    const cleanup = () => fs.promises.unlink(file.path).catch(() => {});
    try {
      const type = await sniffImage(file.path);
      if (!type) throw httpError("UNSUPPORTED_MEDIA", 415, { userMessage: "The logo must be a PNG, JPEG or WebP image.", extra: { field: "logo" } });
      const p = store.get(id);
      const head = isPlain(p.plan) ? p.plan.headRevision || 0 : 0;
      if (!(head > 0)) throw httpError("NOT_READY", 409, { extra: { reason: "NO_PLAN", status: p.status } });
      // Same gate as plan ops: never commit a revision under a running analysis / re-plan.
      if (!["READY", "RENDERING", "COMPLETED", "NEEDS_ATTENTION"].includes(p.status)) {
        throw httpError("NOT_READY", 409, { retryable: true, extra: { reason: "STATUS", status: p.status } });
      }
      const expected = req.body && req.body.expectedRevision != null ? Number(req.body.expectedRevision) : head;
      if (expected !== head) throw new EditError("REVISION_CONFLICT", { status: 409, errorClass: "input", extra: { headRevision: head } });
      const srcRel = `source/logo-${require("./ids").newId("up").slice(3)}.bin`;
      fsx.renameWithRetrySync(file.path, store.abs(id, srcRel));
      const { processLogo } = require("./render/materialize");
      let logo;
      try { logo = await processLogo(store.projectDir(id), { srcRel }); }
      finally { fs.promises.unlink(store.abs(id, srcRel)).catch(() => {}); }
      if (!logo) throw httpError("UNSUPPORTED_MEDIA", 415, { userMessage: "That image could not be read as a logo.", extra: { field: "logo" } });
      const assetId = `ast_logo${logo.sha.slice(0, 12)}`;   // content-addressed: see materialize.processLogo
      await store.update(id, (d) => { d.uploads = { ...(isPlain(d.uploads) ? d.uploads : {}), logo: { status: "ready", assetId, path: logo.path, width: logo.w, height: logo.h, type, receivedAt: now() } }; });
      const { applyOps } = require("./plan/ops");
      const Rev = require("./plan/revisions");
      const { createContextLoader } = require("./editing/context");
      const project = store.get(id);
      const doc = store.loadRevision(id, head);
      const ops = [{ type: "branding.setLogo", assetId }];
      const ctx = createContextLoader({ store, maxEntries: 1 }).load(project, { plan: doc.plan, ops });
      const t = now();
      const out = applyOps(doc.plan, ops, { ...ctx, now: t, author: "user" });
      const c = await Rev.commitRevision({ store, projectId: id, plan: out.plan, author: "user", summary: "Logo", opsCount: 1, expectedRevision: head, now: t });
      // Like any plan edit (editing/handlers markEdited): the export is stale and COMPLETED goes back to READY.
      await store.update(id, (d) => {
        const exp = isPlain(d.exports) ? d.exports : { currentId: null, stale: false, history: [] };
        if (exp.currentId || d.status === "RENDERING" || d.status === "COMPLETED") exp.stale = true;
        d.exports = exp;
        if (d.status === "COMPLETED") { d.status = "READY"; d.lastTransition = { from: "COMPLETED", to: "READY", actor: "user", reason: "PLAN_EDITED", at: now() }; }
      }, { actor: "user", reason: "PLAN_EDITED" });
      publish(id, "plan", { headRevision: c.revision, headHash: c.hash, author: "user" });
      say("info", `[video-edit] logo set project=${id} rev=${c.revision}`);
      res.json({ revision: c.revision, hash: c.hash, logo: { assetId, width: logo.w, height: logo.h } });
    } finally { await cleanup(); }
  }

  // ---- media ----------------------------------------------------------------------------------------
  const byKey = (p, key) => findRender(p, key);
  const mediaResolvers = Object.freeze({
    preview: { keyed: true, resolve: (p, key) => { const r = byKey(p, key); return r && r.status === "done" && r.files ? r.files.mp4 : null; } },
    export: { keyed: true, resolve: (p, key) => { const r = byKey(p, key); return r && r.kind === "export" && r.status === "done" && r.files ? r.files.mp4 : null; } },
    captions: {
      keyed: true,
      resolve: (p, key) => {
        const m = /^(rd_[0-9a-z]{8})\.(srt|vtt)$/.exec(String(key));
        if (!m) return null;
        const r = findRender(p, m[1]);
        return r && r.files ? r.files[m[2]] || null : null;
      },
    },
    credits: { keyed: true, resolve: (p, key) => { const r = byKey(p, key); return r && r.files ? r.files.credits || null : null; } },
    frame: { keyed: true, resolve: (p, key) => { const r = byKey(p, key); return r && r.files ? r.files.poster || null : null; } },
    logo: { keyed: false, resolve: (p) => (isPlain(p.uploads) && isPlain(p.uploads.logo) && p.uploads.logo.status === "ready" ? p.uploads.logo.path : null) },
  });

  // Latest QA findings for a revision, in the plan's `qa` shape (EDIT_PLAN.md §2) — derived, never stored in a revision.
  function qaFindingsFor(p, revision) {
    const recs = (Array.isArray(p.renders) ? p.renders : []).filter((r) => r && r.planRev === revision && r.status === "done" && r.qa);
    const rec = recs[recs.length - 1];
    if (!rec) return null;
    const report = readQaReport(store, p.id, rec.id);
    if (!report || !Array.isArray(report.issues)) return { revision, findings: [] };
    return {
      revision,
      findings: report.issues.filter((i) => i && i.severity !== "minor").slice(0, 20).map((i) => ({
        severity: SEVERITY[i.severity] || "warn", category: i.category, elementId: i.elementId || undefined, detail: String(i.detail || i.category || "").slice(0, 200),
      })),
    };
  }

  return { postRender, getRender, getExports, postLogo, logoUpload, mediaResolvers, qaFindingsFor };
}

module.exports = { createRenderHandlers, renderView, qaClientView, filesView, checksFrom };
