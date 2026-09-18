// VIDEO EDIT RENDER ORCHESTRATION — one plan revision -> preview/export files (RENDER.md §10).
//
// WHY THIS EXISTS. The render stages are a fixed pipeline over the modules that each own one layer:
//   PREPARING_RENDER  load the revision → media (materialize.resolveMedia: B-roll, music, SFX, logo, cards) →
//                     compose.buildComposition → conform every B-roll / PIP overlay (cached)
//   RENDERING         aroll.renderBase (chunks in the heavy-CPU slot, cached) → composite.renderComposite
//   POST_PROCESSING   audio/voice.buildVoiceStem → audio/mix.mixFinal (music, SFX, ducking, loudness, TP post-pass)
//                     → SRT/VTT → poster → credits → render/layout/<rid>.json
// The QUALITY_CHECK stage (qa/*) runs over what this returns. Each step reports progress in its own stage so the
// analysis screen and the editor's "UPDATING n%" line move smoothly, and every step is cancellable (the signal kills
// the ffmpeg tree). Failure ladder (ENGINE.md §6): a failing chunk is retried once single-threaded; if the composite
// still fails, the render degrades to base + captions (notice RENDER_OVERLAYS_DROPPED); only then does it fail, and
// the plan, the cache and any previous export stay untouched. Output files are immutable per renderId.
//
// CONTRACT:
//   renderRevision({ store, projectId, renderId, revision, profileName, kind, signal, runId, pidFile, queue, log,
//                    progress(stage, pct, message), settings, deps })
//     -> Promise<{ files:{ mp4, srt?, vtt?, poster?, credits?, layout, audioReport, composition }, compositionHash, planHash,
//                  durationSec, width, height, segments:{ total, cacheHits }, notes, voiceRel, comp, plan, timings,
//                  revision, context:{ words, sentences, faces, mezz } }>
//   loadRenderContext(store, project) -> { words, sentences, faces, scenes, mezz, voiceChain, mezzRel }
//   OUT_DIR · outRel(renderId, ext)

const fs = require("node:fs");
const path = require("node:path");
const proc = require("../engine/proc");
const fsx = require("../fsx");
const compose = require("./compose");
const aroll = require("./aroll");
const composite = require("./composite");
const materialize = require("./materialize");
const { resolvePlan } = require("../plan/resolve");
const { EditError, isEditError } = require("../errors");

const OUT_DIR = "render/out";
const FPS = 30;
const RENDER_ID_RE = /^rd_[0-9a-z]{8}$/;

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const outRel = (rid, ext) => `${OUT_DIR}/${rid}.${ext}`;
const now = () => Date.now();

function mods(deps = {}) {
  return {
    conformClip: deps.conformClip || ((a, o) => require("../broll/conform").conformClip(a, o)),
    buildVoiceStem: deps.buildVoiceStem || ((o) => require("../audio/voice").buildVoiceStem(o)),
    mixFinal: deps.mixFinal || ((o) => require("../audio/mix").mixFinal(o)),
    writeSubs: deps.writeSubs || ((c, d, b) => require("../captions/export").writeSubs(c, d, b)),
    createContextLoader: deps.createContextLoader || ((o) => require("../editing/context").createContextLoader(o)),
  };
}

function stageOutputSha(project, stage, name) {
  const r = isPlain(project.stages) && isPlain(project.stages[stage]) ? project.stages[stage] : null;
  const o = r && isPlain(r.outputs) && isPlain(r.outputs[name]) ? r.outputs[name] : null;
  return o && typeof o.sha256 === "string" ? o.sha256 : null;
}

function mezzRelOf(project) {
  const r = isPlain(project.stages) && isPlain(project.stages.COMPRESSING) ? project.stages.COMPRESSING : null;
  const o = r && isPlain(r.outputs) && isPlain(r.outputs.mezz) ? r.outputs.mezz : null;
  return (o && typeof o.path === "string" && o.path) || "work/mezz.mp4";
}

function loadRenderContext(store, project, deps = {}) {
  const M = mods(deps);
  const loader = M.createContextLoader({ store, maxEntries: 1 });
  const data = loader.load(project);
  const projectDir = store.projectDir(project.id);
  let voiceChain = null;
  try {
    const a = JSON.parse(fs.readFileSync(path.join(projectDir, "analysis/audio.json"), "utf8"));
    if (a && isPlain(a.voiceChain)) voiceChain = a.voiceChain;
  } catch { /* no audio analysis: default chain */ }
  const mezz = data.mezz || (project.source && project.source.mezzanine ? { w: project.source.mezzanine.width, h: project.source.mezzanine.height } : null);
  if (!mezz || !(mezz.w > 0 && mezz.h > 0)) throw new EditError("RENDER_NO_MEZZANINE", { status: 409, errorClass: "input", stage: "PREPARING_RENDER" });
  return {
    words: data.words || [], sentences: data.sentences || [], faces: data.faces || null, scenes: data.scenes || [],
    mezz: { w: mezz.w, h: mezz.h, sha: stageOutputSha(project, "COMPRESSING", "mezz") || (project.source && project.source.sha256) || project.id },
    voiceChain, mezzRel: mezzRelOf(project), envelope: data.envelope,
  };
}

async function heavy(queue, fn, { signal, label, onWait }) {
  if (queue && typeof queue.heavy === "function") return queue.heavy(fn, { label, signal, onWait });
  return fn({ lowPriority: false, waitedMs: 0, threads: null });
}

async function extractPoster({ projectDir, mp4Rel, comp, rid, signal, pidFile }) {
  // A frame on the speaker: no B-roll / PIP / card over it, a third of the way in (hooks are busy in the first second).
  const busy = comp.overlays.filter((o) => ["broll", "pip", "card"].includes(o.kind));
  const D = comp.durationFrames;
  const candidates = [0.33, 0.5, 0.2, 0.7, 0.1].map((f) => Math.round(D * f));
  const f = candidates.find((x) => !busy.some((o) => x >= o.outInF - 6 && x < o.outOutF + 6)) ?? candidates[0];
  const rel = outRel(rid, "jpg");
  await proc.ffmpeg(["-y", "-ss", ((f + 0.5) / FPS).toFixed(6), "-protocol_whitelist", "file", "-i", `file:${mp4Rel}`,
    "-frames:v", "1", "-vf", "scale=in_color_matrix=bt709:flags=lanczos", "-q:v", "3", rel],
  { cwd: projectDir, signal, pidFile, timeoutMs: 60000, label: "poster", stage: "POST_PROCESSING" });
  return rel;
}

function creditsText(comp, plan) {
  const seen = new Set();
  const lines = [];
  for (const c of comp.credits || []) {
    const k = `${c.kind}|${c.assetId || c.attribution}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const who = c.attribution || (c.provider ? `${c.provider[0].toUpperCase()}${c.provider.slice(1)}` : "");
    const parts = [who, c.license, c.sourceUrl].filter(Boolean);
    if (parts.length) lines.push(`${c.kind === "music" ? "Music" : c.kind === "sfx" ? "Sound" : "Footage"}: ${parts.join(" · ")}`);
  }
  void plan;
  return lines;
}

async function renderRevision(opts = {}) {
  const { store, projectId, renderId, revision, profileName, kind = "preview", signal = null, runId, pidFile, queue, log = console, settings, deps = {} } = opts;
  const progress = typeof opts.progress === "function" ? opts.progress : () => {};
  if (!RENDER_ID_RE.test(String(renderId))) throw new EditError("RENDER_BAD_ID", { errorClass: "bug" });
  const M = mods(deps);
  const timings = {};
  const t = () => now();
  const project = store.get(projectId);
  if (!project) throw new EditError("NOT_FOUND", { status: 404, errorClass: "input" });
  const projectDir = store.projectDir(projectId);
  const checkAbort = () => { if (signal && signal.aborted) throw isEditError(signal.reason) ? signal.reason : new EditError("CANCELLED", { status: 409, errorClass: "cancelled" }); };
  const fault = { settings, project };   // fault injection (dev/test only; faults.js decides whether it is active)
  const threadsFor = (slot) => (slot && slot.lowPriority ? 2 : (slot && slot.threads) || 3);

  // ---- PREPARING_RENDER --------------------------------------------------------------------------
  let t0 = t();
  progress("PREPARING_RENDER", 0, "Preparing the render", { started: true });
  const doc = store.loadRevision(projectId, revision);
  if (!doc || !isPlain(doc.plan)) throw new EditError("REVISION_NOT_FOUND", { status: 404, errorClass: "input", stage: "PREPARING_RENDER", extra: { revision } });
  const rctx = loadRenderContext(store, project, deps);
  // Stored revisions are committed resolved (ops.finalize / buildInitialPlan); re-resolve only an unresolved one.
  let plan = doc.plan;
  if (!plan.timeline || !Array.isArray(plan.timeline.pieces) || !plan.timeline.pieces.length) {
    plan = resolvePlan(plan, { words: rctx.words, sentences: rctx.sentences, faces: rctx.faces, mezz: rctx.mezz, scenes: rctx.scenes });
  }
  const planHash = compose.planHashOf(doc.plan);
  const { media, notes: mediaNotes } = await materialize.resolveMedia(plan, {
    projectDir, project, profileName, kind, signal, runId, log, pidFile, settings,
    onProgress: (pct, msg) => progress("PREPARING_RENDER", Math.min(90, pct), msg), deps: deps.materialize,
  });
  checkAbort();
  const comp = compose.buildComposition(plan, { words: rctx.words, faces: rctx.faces, scenes: rctx.scenes, mezz: rctx.mezz, voiceChain: rctx.voiceChain, media }, profileName);
  comp.notes.push(...mediaNotes);

  // Conform every B-roll / PIP overlay to exactly its box, frame count and 30 fps (cached per asset+geometry+span).
  const clips = {};
  const overlaysToConform = comp.overlays.filter((o) => o.kind === "broll" || o.kind === "pip");
  let ci = 0;
  for (const o of overlaysToConform) {
    progress("PREPARING_RENDER", 90 + Math.round((ci++ / Math.max(1, overlaysToConform.length)) * 10), "Fitting the B-roll");
    try {
      const c = await heavy(queue, () => M.conformClip({ path: o.source.path, type: o.source.type, assetId: o.id }, {
        box: { w: o.geom.w, h: o.geom.h }, durationSec: (o.outOutF - o.outInF) / FPS, trimInSec: o.source.trimInSec || 0,
        focus: o.source.focus, profile: profileName, projectDir, runId, signal, pidFile,
      }), { signal, label: `conform:${projectId}` });
      clips[o.id] = { rel: c.relPath, headFrames: c.headFrames || 0 };
    } catch (e) {
      if (signal && signal.aborted) throw e;
      comp.notes.push({ code: "BROLL_CONFORM_FAILED", elementId: o.id });
      log.warn && log.warn(`[video-edit] conform failed project=${projectId} item=${o.id} code=${(e && e.code) || "INTERNAL"}`);
    }
  }
  comp.overlays = comp.overlays.filter((o) => !(o.kind === "broll" || o.kind === "pip") || clips[o.id]);
  const compRel = `render/comp/${renderId}.json`;
  fsx.ensureDir(path.join(projectDir, "render/comp"));
  fsx.writeJsonAtomic(path.join(projectDir, compRel), { ...comp, captions: comp.captions ? { ...comp.captions, ass: undefined } : null });
  timings.prepareMs = t() - t0;
  progress("PREPARING_RENDER", 100, null, { finished: true });

  // ---- RENDERING ---------------------------------------------------------------------------------
  t0 = t();
  progress("RENDERING", 0, "Rendering your edit", { started: true });
  const conformSplit = async (source, box, prof) => {
    const c = await M.conformClip({ path: source.path, type: source.type }, { box, durationSec: source.durationSec, trimInSec: source.trimInSec || 0, focus: source.focus, profile: prof, projectDir, runId, signal, pidFile });
    return { path: c.path, headFrames: c.headFrames || 0 };
  };
  const chunkW = 0.6;
  const onChunk = (i, n, cached, pct) => progress("RENDERING", Math.round((((i + (pct || 0) / 100) / Math.max(1, n)) * chunkW) * 100), cached ? "Reusing unchanged shots" : "Rendering your footage");
  let base;
  try {
    base = await heavy(queue, (slot) => aroll.renderBase({ comp, projectDir, mezzRel: rctx.mezzRel, runId, signal, pidFile, threads: threadsFor(slot), conformSplit, onChunk, fault }), { signal, label: `render:${projectId}` });
  } catch (e) {
    if (signal && signal.aborted) throw e;
    log.warn && log.warn(`[video-edit] base render failed, retrying single-threaded project=${projectId} code=${(e && e.code) || "INTERNAL"}`);
    base = await heavy(queue, () => aroll.renderBase({ comp, projectDir, mezzRel: rctx.mezzRel, runId: `${runId}r`, signal, pidFile, threads: 1, conformSplit, onChunk, fault, preset: { preset: "ultrafast", crf: comp.profile.inter.crf } }), { signal, label: `render:${projectId}` });
  }
  checkAbort();
  let comped;
  const compProgress = (pct) => progress("RENDERING", Math.round(chunkW * 100 + pct * (1 - chunkW)), "Adding captions, B-roll and graphics");
  try {
    comped = await heavy(queue, (slot) => composite.renderComposite({ comp, projectDir, baseRel: base.relPath, clips, runId, signal, pidFile, threads: threadsFor(slot), onProgress: compProgress }), { signal, label: `composite:${projectId}` });
  } catch (e) {
    if (signal && signal.aborted) throw e;
    // Degrade: base + captions only (no overlays, no cards, no logo) — the edit still ships with its cuts and captions.
    log.warn && log.warn(`[video-edit] composite failed, dropping overlays project=${projectId} code=${(e && e.code) || "INTERNAL"}`);
    const lean = { ...comp, overlays: [], cardAss: [] };
    comped = await heavy(queue, () => composite.renderComposite({ comp: lean, projectDir, baseRel: base.relPath, clips: {}, runId: `${runId}d`, signal, pidFile, threads: 1, onProgress: compProgress }), { signal, label: `composite:${projectId}` });
    comp.notes.push({ code: "RENDER_OVERLAYS_DROPPED" });
  }
  timings.renderMs = t() - t0;
  progress("RENDERING", 100, null, { finished: true });

  // ---- POST_PROCESSING ---------------------------------------------------------------------------
  t0 = t();
  progress("POST_PROCESSING", 0, "Mixing voice and music", { started: true });
  fsx.ensureDir(path.join(projectDir, OUT_DIR));
  const voice = await M.buildVoiceStem({ projectDir, pieces: comp.audio.voice.pieces, chain: comp.audio.voice.chain, runId, signal, sourceRel: "work/voice48k.wav" });
  checkAbort();
  progress("POST_PROCESSING", 35, "Balancing the audio");
  const mp4Rel = outRel(renderId, "mp4");
  let mix;
  const music = comp.audio.music ? { path: comp.audio.music.path, volume: comp.audio.music.volume, envelope: comp.audio.music.envelope, startOffsetSec: comp.audio.music.startOffsetSec || 0 } : null;
  try {
    mix = await M.mixFinal({ compositePath: comped.path, voicePath: voice.path, music, sfx: comp.audio.sfx.map((s) => ({ path: s.path, startSec: s.startSec, volume: s.volume })), durationSec: comp.durationFrames / FPS, outPath: path.join(projectDir, mp4Rel), runId, signal, projectDir });
  } catch (e) {
    if (signal && signal.aborted) throw e;
    // POST_PROCESSING failure policy: retry once without music/SFX (voice only), never lose the edit to a music file.
    log.warn && log.warn(`[video-edit] mix failed, retrying voice-only project=${projectId} code=${(e && e.code) || "INTERNAL"}`);
    mix = await M.mixFinal({ compositePath: comped.path, voicePath: voice.path, music: null, sfx: [], durationSec: comp.durationFrames / FPS, outPath: path.join(projectDir, mp4Rel), runId: `${runId}v`, signal, projectDir });
    comp.notes.push({ code: "MUSIC_DROPPED" });
  }
  progress("POST_PROCESSING", 70, "Writing captions and credits");
  const files = { mp4: mp4Rel, composition: compRel };
  if (mix && mix.reportPath) files.audioReport = path.relative(projectDir, mix.reportPath).split(path.sep).join("/");
  if (comp.captions) {
    const cues = comp.captionCues || null;
    if (cues && cues.length) {
      try {
        const subs = M.writeSubs(cues, path.join(projectDir, OUT_DIR), renderId);
        files.srt = outRel(renderId, "srt");
        files.vtt = outRel(renderId, "vtt");
        void subs;
      } catch (e) { comp.notes.push({ code: "SUBS_FAILED" }); log.warn && log.warn(`[video-edit] subs failed code=${(e && e.code) || "INTERNAL"}`); }
    }
  }
  try { files.poster = await extractPoster({ projectDir, mp4Rel, comp, rid: renderId, signal, pidFile }); }
  catch (e) { if (signal && signal.aborted) throw e; comp.notes.push({ code: "POSTER_FAILED" }); }
  const credits = creditsText(comp, plan);
  if (credits.length) {
    files.credits = outRel(renderId, "credits.txt");
    fs.writeFileSync(path.join(projectDir, files.credits), credits.join("\n") + "\n", "utf8");
  }
  const layoutRel = `render/layout/${renderId}.json`;
  fsx.ensureDir(path.join(projectDir, "render/layout"));
  fsx.writeJsonAtomic(path.join(projectDir, layoutRel), comp.layout);
  files.layout = layoutRel;
  timings.postMs = t() - t0;
  progress("POST_PROCESSING", 100, null, { finished: true });

  let bytes = 0;
  try { bytes = fs.statSync(path.join(projectDir, mp4Rel)).size; } catch { /* reported below */ }
  if (!(bytes > 0)) throw new EditError("RENDER_OUTPUT_MISSING", { errorClass: "bug", stage: "POST_PROCESSING" });
  return {
    files, compositionHash: comp.compositionHash, planHash, durationSec: comp.durationFrames / FPS,
    width: comp.profile.W, height: comp.profile.H, fps: FPS, bytes,
    segments: base.chunks, notes: comp.notes, voiceRel: voice.relPath, audio: mix && mix.report ? mix.report : null,
    comp, plan, credits: comp.credits, timings, revision,
    // The analysis the render was built from — QA checks the output against the same words, faces and mezzanine.
    context: { words: rctx.words, sentences: rctx.sentences, faces: rctx.faces, mezz: rctx.mezz },
  };
}

module.exports = { renderRevision, loadRenderContext, outRel, OUT_DIR, creditsText };
