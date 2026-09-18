// AI Video Edit end-to-end harness: a real upload through the real pipeline, render, edit, export — in process.
//
// Run (live providers, billed; keys come from server/.env through src/config):
//   node scripts/video_edit_e2e.js --live [--fixture test-fixtures/video_edit/talking_20s_en_vertical.mp4]
//        [--settings '{"output":{"aspect":"16:9"}}'] [--export] [--edit] [--keep] [--dir <root>] [--max-usd 0.5]
//        [--out report.json] [--faults 'assets:http500'] [--serve 8080]   (--serve keeps the API up for a browser)
//
// WHY THIS EXISTS. Unit suites stub every seam. This harness wires the pieces exactly the way server.js does —
// videoEdit.buildRouter over its own store / event bus / queue / runner / render jobs in a scratch directory, with
// only authentication injected — and drives the HTTP API like the editor does: multipart create → stage progress →
// READY with an automatic first preview → (optionally) a small edit that must re-render without re-analysis and with
// A-roll chunk cache hits → (optionally) an export → ffprobe / loudness / caption-file assertions → delete leaves
// nothing behind. Output: a JSON report (stages, timings, plan summary, render records, QA, cost) for the acceptance
// matrix in docs/ai-video-edit/TESTING.md.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const ARGS = parseArgs(process.argv.slice(2));
const SERVER_ROOT = path.resolve(__dirname, "..");
const TERMINAL = new Set(["READY", "COMPLETED", "NEEDS_ATTENTION", "FAILED", "CANCELLED"]);
const USER = "e2e-user";

function parseArgs(argv) {
  const out = { serve: null, live: false, export: false, edit: false, keep: false, fixture: null, settings: null, dir: null, out: null, maxUsd: 0.5, faults: null, timeoutSec: 1800 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === "--live") out.live = true;
    else if (a === "--export") out.export = true;
    else if (a === "--edit") out.edit = true;
    else if (a === "--keep") out.keep = true;
    else if (a === "--fixture") out.fixture = v();
    else if (a === "--settings") out.settings = JSON.parse(v());
    else if (a === "--dir") out.dir = v();
    else if (a === "--out") out.out = v();
    else if (a === "--max-usd") out.maxUsd = Number(v());
    else if (a === "--faults") out.faults = v();
    else if (a === "--timeout") out.timeoutSec = Number(v());
    else if (a === "--serve") { out.serve = Number(v()); out.keep = true; }
    else if (a === "--idle") out.idle = true;
    else if (a === "--recover") out.recover = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

const log = {
  info: (m) => { if (/render|pipeline|auto|qa|failed|error/i.test(m)) process.stderr.write(`  · ${m}\n`); },
  warn: (m) => process.stderr.write(`  ! ${m}\n`),
  error: (m) => process.stderr.write(`  ✖ ${m}\n`),
  log: () => {},
};

function request(port, { method = "GET", path: p, headers = {}, body = null, timeoutMs = 120000 }) {
  return new Promise((resolve, reject) => {
    const h = { cookie: `ve_e2e_user=${USER}`, ...headers };
    let payload = body;
    if (body && !Buffer.isBuffer(body)) { payload = Buffer.from(JSON.stringify(body)); h["content-type"] = "application/json"; }
    if (payload) h["content-length"] = payload.length;
    const req = http.request({ host: "127.0.0.1", port, method, path: `/api/video-edits${p}`, headers: h, agent: false }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(buf.toString("utf8")); } catch { /* binary */ }
        resolve({ status: res.statusCode, headers: res.headers, buf, json });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function multipart(parts) {
  const boundary = `----vee2e${crypto.randomBytes(8).toString("hex")}`;
  const bufs = [];
  for (const part of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"`;
    if (part.filename !== undefined) head += `; filename="${part.filename}"\r\nContent-Type: ${part.contentType || "application/octet-stream"}`;
    bufs.push(Buffer.from(`${head}\r\n\r\n`), Buffer.isBuffer(part.data) ? part.data : Buffer.from(String(part.data)), Buffer.from("\r\n"));
  }
  bufs.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(bufs), contentType: `multipart/form-data; boundary=${boundary}` };
}

function ffprobe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,sample_rate,channels,nb_frames:format=duration,size", "-of", "json", file], { encoding: "utf8", windowsHide: true });
  try { return JSON.parse(r.stdout); } catch { return null; }
}

function loudness(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8", windowsHide: true });
  const s = String(r.stderr || "");
  const tail = s.slice(s.lastIndexOf("Summary:"));
  const I = /I:\s+(-?[\d.]+) LUFS/.exec(tail), TP = /Peak:\s+(-?[\d.]+) dBFS/.exec(tail);
  return { integratedLufs: I ? Number(I[1]) : null, truePeakDbtp: TP ? Number(TP[1]) : null };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(port, id, pred, { timeoutSec, label, onTick }) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutSec * 1000) {
    const r = await request(port, { path: `/${id}` });
    if (r.status !== 200) throw new Error(`${label}: GET /${id} → ${r.status}`);
    const v = r.json;
    const line = `${v.status} ${v.progress && v.progress.stage ? v.progress.stage : ""} ${v.progress ? Math.round(v.progress.overallPct || 0) : 0}%`;
    if (line !== last) { process.stderr.write(`  [${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s] ${line}\n`); last = line; }
    if (typeof onTick === "function") onTick(v);
    if (pred(v)) return v;
    await sleep(1500);
  }
  throw new Error(`${label}: timed out after ${timeoutSec} s`);
}

async function waitRender(port, id, renderId, { timeoutSec }) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutSec * 1000) {
    const r = await request(port, { path: `/${id}/renders/${renderId}` });
    if (r.status !== 200) throw new Error(`render ${renderId} → ${r.status}`);
    const line = `${r.json.status} ${r.json.stage || ""} ${Math.round(r.json.pct || 0)}%`;
    if (line !== last) { process.stderr.write(`  [${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s] render ${line}\n`); last = line; }
    if (["done", "failed", "cancelled"].includes(r.json.status)) return { ...r.json, wallSec: (Date.now() - t0) / 1000 };
    await sleep(1000);
  }
  throw new Error(`render ${renderId} timed out`);
}

function summarizeMedia(projectDir, rec, kind) {
  const f = rec && rec.files;
  if (!f || !f.mp4) return null;
  const file = path.join(projectDir, f.mp4.kind === "preview" || f.mp4.kind === "export" ? `render/out/${rec.renderId}.mp4` : "");
  const probe = ffprobe(file);
  const v = probe && probe.streams.find((s) => s.codec_type === "video");
  const a = probe && probe.streams.find((s) => s.codec_type === "audio");
  return {
    kind, file: path.relative(projectDir, file), bytes: Number(probe && probe.format && probe.format.size) || null,
    durationSec: Number(probe && probe.format && probe.format.duration) || null,
    video: v ? { codec: v.codec_name, w: v.width, h: v.height, fps: v.r_frame_rate, pix: v.pix_fmt, frames: Number(v.nb_frames) || null } : null,
    audio: a ? { codec: a.codec_name, rate: Number(a.sample_rate), ch: a.channels } : null,
    loudness: loudness(file),
  };
}

async function main() {
  if (!ARGS.live) {
    console.error("This harness drives real OpenRouter/KIE/stock providers. Re-run with --live (billed; capped by --max-usd).");
    process.exit(2);
  }
  require("../src/config");   // loads server/.env into process.env (keys are never printed)
  const fixture = path.resolve(SERVER_ROOT, ARGS.fixture || "test-fixtures/video_edit/talking_20s_en_vertical.mp4");
  if (!fs.existsSync(fixture)) throw new Error(`fixture not found: ${fixture}`);
  const root = ARGS.dir ? path.resolve(ARGS.dir) : fs.mkdtempSync(path.join(os.tmpdir(), "ve-e2e-"));
  fs.mkdirSync(root, { recursive: true });
  process.env.VIDEO_EDIT_DIR = path.join(root, "edits");
  process.env.VIDEO_EDIT_INDEX = path.join(root, "video-edits.json");
  if (ARGS.faults) { process.env.VIDEO_EDIT_FAULTS = ARGS.faults; process.env.VIDEO_EDIT_FAULTS_ALLOW = "1"; }

  const express = require("express");
  const videoEdit = require("../src/video_edit");
  const { resolveSettings } = require("../src/video_edit/settings");
  const config = { paths: { root, jobsDir: path.join(root, "jobs"), uploadsDir: path.join(root, "uploads"), videosDir: path.join(root, "public", "videos") } };
  const settings = resolveSettings({ config, env: { ...process.env, NODE_ENV: "development" }, cpus: os.cpus().length });
  if (!settings.enabled) throw new Error(`video edit disabled: ${settings.disabledReason}`);

  const readUserId = (req) => { const m = /(?:^|;\s*)ve_e2e_user=([^;]+)/.exec(String(req.headers.cookie || "")); return m ? decodeURIComponent(m[1]) : null; };
  const router = videoEdit.buildRouter({ settings, readUserId, findUserById: (id) => (id === USER ? { id } : null), env: { ...process.env, NODE_ENV: "development" }, log });
  if (router.videoEdit && router.videoEdit.disabled) throw new Error(`router disabled: ${router.videoEdit.reason}`);
  const rt = videoEdit.getRuntime();
  rt.store.init();
  const app = express();
  app.use("/api/video-edits", videoEdit.jsonBodyParser({ log }));
  app.use("/api/video-edits", router);
  app.use("/api/video-edits", videoEdit.errorHandler({ log }));
  const server = http.createServer(app);
  const port = await new Promise((r) => server.listen(ARGS.serve || 0, "127.0.0.1", () => r(server.address().port)));
  const report = { fixture: path.relative(SERVER_ROOT, fixture), root, startedAt: new Date().toISOString(), steps: [] };
  const step = (name, data) => { report.steps.push({ name, ...data }); process.stderr.write(`\n▸ ${name}\n`); };

  let id = null;
  if (ARGS.idle) {
    process.stderr.write(`idle: serving the API on http://127.0.0.1:${port}/api/video-edits (cookie ve_e2e_user=${USER}); Ctrl+C to stop
`);
    return;
  }
  try {
    // ---- create --------------------------------------------------------------------------------
    const settingsBody = { consent: { thirdPartyAi: true, termsVersion: "2026-09" }, maxCostUsd: ARGS.maxUsd, ...(ARGS.settings || {}) };
    const form = multipart([
      { name: "settings", data: JSON.stringify(settingsBody) },
      { name: "clientRequestId", data: `e2e_${crypto.randomBytes(6).toString("hex")}` },
      { name: "video", filename: path.basename(fixture), contentType: "video/mp4", data: fs.readFileSync(fixture) },
    ]);
    const t0 = Date.now();
    const created = await request(port, { method: "POST", path: "/", headers: { "content-type": form.contentType }, body: form.body, timeoutMs: 300000 });
    if (created.status !== 202 && created.status !== 201 && created.status !== 200) throw new Error(`create → ${created.status} ${JSON.stringify(created.json)}`);
    id = (created.json.project && created.json.project.id) || created.json.id;
    step("created", { status: created.status, id, ms: Date.now() - t0 });

    // ---- pipeline (+ automatic first preview) -----------------------------------------------------
    let ready = await waitFor(port, id, (v) => TERMINAL.has(v.status), { timeoutSec: ARGS.timeoutSec, label: "pipeline" });
    if (ARGS.recover && ready.status === "NEEDS_ATTENTION" && ready.statusReason && (ready.statusReason.actions || []).includes("continue_without_transcript")) {
      // Take the way out the parked status offers (UX: "Continue without captions").
      step("parked", { reason: ready.statusReason, allowedActions: ready.allowedActions });
      const rr = await request(port, { method: "POST", path: `/${id}/retry`, body: { mode: "resume", continueWithout: "transcript" } });
      if (rr.status !== 202) throw new Error(`retry → ${rr.status} ${JSON.stringify(rr.json)}`);
      ready = await waitFor(port, id, (v) => TERMINAL.has(v.status) && v.status !== "QUEUED", { timeoutSec: ARGS.timeoutSec, label: "recovered pipeline" });
    }
    const project = rt.store.get(id);
    const stages = Object.fromEntries(Object.entries(project.stages || {}).map(([k, v]) => [k, { status: v.status, ms: v.durationMs || (v.finishedAt && v.startedAt ? v.finishedAt - v.startedAt : null), engine: v.engine || null, fallbacks: v.fallbacks || [] }]));
    step("pipeline", { status: ready.status, reason: ready.statusReason || null, wallSec: (Date.now() - t0) / 1000, stages, notices: ready.notices, cost: ready.cost, discoveries: ready.discoveries });
    if (ready.status !== "READY" && ready.status !== "COMPLETED") throw new Error(`pipeline ended ${ready.status}`);

    const planRes = await request(port, { path: `/${id}/plan` });
    const plan = planRes.json && planRes.json.plan;
    const outline = planRes.json && planRes.json.outline;
    step("plan", {
      revision: planRes.json && planRes.json.revision, createdBy: plan && plan.createdBy, summary: outline && outline.summary,
      duration: plan && plan.timeline && plan.timeline.outDurationSec, source: plan && plan.source && { durationSec: plan.source.durationSec, language: plan.source.language, timing: plan.source.timing },
      broll: plan && plan.broll.map((b) => ({ id: b.id, status: b.status, layout: b.layout, query: b.queries && b.queries[0] && b.queries[0].text, provider: b.chosen && b.chosen.provider, reason: b.reason })),
      effects: plan && plan.effects.map((e) => `${e.kind}${e.enabled ? "" : "(off)"}`),
      graphics: plan && plan.graphics.map((g) => `${g.kind}:${g.text && g.text.title}`),
      music: plan && plan.music && { enabled: plan.music.enabled, title: plan.music.track && plan.music.track.title, provider: plan.music.track && plan.music.track.provider },
      sfx: plan && plan.sfx.map((s) => s.cue), cuts: plan && plan.cuts.filter((c) => c.enabled).length, cues: plan && plan.captions.cues.length,
      qa: plan && plan.qa,
    });

    const view = (await request(port, { path: `/${id}` })).json;
    const auto = (view.renders || []).filter((r) => r.kind === "preview").pop();
    if (!auto) throw new Error("no automatic preview render");
    const autoRec = (await request(port, { path: `/${id}/renders/${auto.renderId}` })).json;
    const projectDir = rt.store.projectDir(id);
    step("auto-preview", { record: autoRec, media: summarizeMedia(projectDir, autoRec, "preview"), qaSummary: view.qaSummary });
    if (autoRec.status !== "done") throw new Error(`automatic preview ${autoRec.status}: ${JSON.stringify(autoRec.error)}`);

    // ---- small edit: must not re-analyse, must reuse A-roll chunks --------------------------------
    if (ARGS.edit) {
      const p1 = rt.store.get(id);
      const head = p1.plan.headRevision;
      const b = plan.broll.find((x) => x.status === "ok");
      const ops = b ? [{ type: "broll.remove", id: b.id }] : [{ type: "captions.setStyle", styleId: "clean" }];
      const stagesBefore = JSON.stringify(Object.fromEntries(Object.entries(p1.stages).filter(([k]) => !["PREPARING_RENDER", "RENDERING", "POST_PROCESSING", "QUALITY_CHECK"].includes(k)).map(([k, v]) => [k, v.finishedAt])));
      const opsRes = await request(port, { method: "POST", path: `/${id}/ops`, body: { expectedRevision: head, batchId: `b_${crypto.randomBytes(4).toString("hex")}`, ops } });
      if (opsRes.status !== 200) throw new Error(`ops → ${opsRes.status} ${JSON.stringify(opsRes.json)}`);
      const rr = await request(port, { method: "POST", path: `/${id}/render`, body: { kind: "preview", planRevision: opsRes.json.revision, profile: "preview540" } });
      const rec = await waitRender(port, id, rr.json.renderId, { timeoutSec: 900 });
      const p2 = rt.store.get(id);
      const stagesAfter = JSON.stringify(Object.fromEntries(Object.entries(p2.stages).filter(([k]) => !["PREPARING_RENDER", "RENDERING", "POST_PROCESSING", "QUALITY_CHECK"].includes(k)).map(([k, v]) => [k, v.finishedAt])));
      const raw = (p2.renders || []).find((r) => r.id === rr.json.renderId);
      step("edit-rerender", { ops, revision: opsRes.json.revision, invalidates: opsRes.json.invalidates, wallSec: rec.wallSec, status: rec.status, segments: raw && raw.segments, reanalysed: stagesBefore !== stagesAfter, autoWallSec: null });
      if (stagesBefore !== stagesAfter) throw new Error("a small edit re-ran analysis");
    }

    // ---- export ----------------------------------------------------------------------------------
    if (ARGS.export) {
      const head = rt.store.get(id).plan.headRevision;
      const rr = await request(port, { method: "POST", path: `/${id}/render`, body: { kind: "export", planRevision: head, profile: "export1080" } });
      if (rr.status !== 202 && rr.status !== 200) throw new Error(`export → ${rr.status} ${JSON.stringify(rr.json)}`);
      const rec = await waitRender(port, id, rr.json.renderId, { timeoutSec: 1800 });
      const exps = (await request(port, { path: `/${id}/exports` })).json;
      const media = summarizeMedia(projectDir, rec, "export");
      const srt = rec.files && rec.files.srt ? (await request(port, { path: `/${id}/media/captions/${rec.renderId}.srt` })) : null;
      step("export", { record: rec, exports: exps, media, srt: srt ? { status: srt.status, cues: (srt.buf.toString("utf8").match(/-->/g) || []).length } : null, projectStatus: rt.store.get(id).status });
      if (rec.status !== "done") throw new Error(`export ${rec.status}: ${JSON.stringify(rec.error)}`);
    }

    // ---- security spot checks ---------------------------------------------------------------------
    const anon = await request(port, { path: `/${id}`, headers: { cookie: "" } });
    const other = await request(port, { path: `/${id}`, headers: { cookie: "ve_e2e_user=someone-else" } });
    step("security", { anonymous: anon.status, otherUser: other.status });

    report.cost = rt.store.get(id).cost;
    report.ok = true;
  } catch (e) {
    report.ok = false;
    report.error = String(e && e.stack || e).slice(0, 2000);
    process.stderr.write(`\n✖ ${e && e.message}\n`);
  } finally {
    if (id && !ARGS.keep) {
      const del = await request(port, { method: "POST", path: `/${id}/delete`, body: { confirm: id } }).catch(() => null);
      report.deleted = del ? del.status : null;
    }
    report.finishedAt = new Date().toISOString();
    if (ARGS.serve && report.ok) {
      // --serve: keep the real API up for a browser session (cookie ve_e2e_user=e2e-user); Ctrl+C to stop.
      fs.writeFileSync(ARGS.out ? path.resolve(ARGS.out) : path.join(root, "e2e-report.json"), JSON.stringify(report, null, 1));
      process.stderr.write(`
serving project ${id} on http://127.0.0.1:${port}/api/video-edits (cookie ve_e2e_user=${USER})
`);
      return;
    }
    const outFile = ARGS.out ? path.resolve(ARGS.out) : path.join(root, "e2e-report.json");
    fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
    process.stderr.write(`\nreport: ${outFile}\n`);
    try { await rt.runner.stopAll({ timeoutMs: 5000 }); } catch { /* noop */ }
    try { if (rt.renders) await rt.renders.stopAll({ timeoutMs: 5000 }); } catch { /* noop */ }
    server.closeAllConnections();
    server.close();
    setTimeout(() => process.exit(report.ok ? 0 : 1), 500).unref();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
