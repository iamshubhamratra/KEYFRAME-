// VIDEO EDIT FACES — ve_faces: sampled frames → vision boxes + shot semantics → analysis/faces.json (ANALYSIS.md §6).
//
// WHY THIS EXISTS. Auto-reframing a 16:9 talking head into 9:16, keeping captions off the face and knowing when
// the speaker is off-screen all need to know where the head is. There is no local model (user rule), so a cheap
// vision model looks at ≤ 24 frames: `google/gemini-3.5-flash-lite` answered with boxes within IoU .97–.99 of
// gemini-3.5-flash at a tenth of the price, but occasionally nests a box (`box_2d:[[…]]`) — flattened here — so a
// batch whose boxes mostly fail validation (> 1/3) is re-asked once of the escalation model. Frames are labelled
// with LETTER ids (`FRAME C t=12.40s`), because models rewrote numeric ids in the live probe, and unknown or
// duplicate ids fail the schema (callJson's single repair re-ask carries the complaint). A substituted model
// (chat() silently falling back) is treated as a failed batch: a text-only fallback would invent boxes.
// Vision is an ENHANCEMENT (ENGINE.md §6): 429 / 402 / timeouts / bad JSON / no consent / cost cap all end in
// `mode:'assumed'` (centre framing) with a notice — never a failed stage. Only cancellation and our own bugs throw.
// Frames go out as ≤ 640 px JPEG data URIs, ≤ 6 per call (llm_guard enforces ≤ 8 and 1.5 MB).
//
// CONTRACT:
//   analyzeFaces({ projectDir, settings, project, video, durationSec, width, height, fps, runId, signal, pidFile, lowPriority,
//                  threads, tracker, onCost, onNotice, onProgress, chat, callJson, auth, fetchImpl, checkBudget, cacheDir,
//                  withHeavy, spentUsd, write=true, now })
//     -> { faces (analysis/faces.json body), frames, costUsd, calls, escalations, engine, fallbacks, notices,
//          discoveries:{ faceFound, onScreenText:[[start,end]] }, outputs:{ faces:{path} } }
//   buildFaceSchema(ids) · buildUserParts(frames, { projectDir, width, height }) · normalizeFrameReply(raw) ·
//   visionSettings(settings) · SYSTEM_PROMPT · STAGE · PROMPT_VERSION · FACES_REL · VISION_DEFAULTS

const fs = require("node:fs");
const { z } = require("zod");
const { EditError, isEditError } = require("../errors");
const faults = require("../faults");
const fsx = require("../fsx");
const { getBreaker, nextUtcMidnight } = require("../providers/breaker");
const sampler = require("./frame_sampler");
const track = require("./track_smooth");

const STAGE = "ve_faces";
const PROMPT_VERSION = "ve-faces-1";
const FACES_REL = "analysis/faces.json";
const BREAKER = "openrouter_chat";
const PARALLEL_BATCHES = 2;
const EST_BATCH_USD = 0.004;
const INVALID_ESCALATE_RATIO = 1 / 3;
const VISION_DEFAULTS = Object.freeze({
  model: "google/gemini-3.5-flash-lite", escalationModel: "google/gemini-3.5-flash", imageWidth: 384, framesPerCall: 6, maxFaceFrames: 24,
});
const ROLES = new Set(["speaker", "other"]);
const FACINGS = new Set(["camera", "left", "right", "away"]);
const SHOTS = new Set(["closeup", "medium", "wide"]);
const LIGHTING = new Set(["good", "dim", "harsh", "backlit"]);
const QUALITY = new Set(["good", "ok", "poor"]);

const SYSTEM_PROMPT = [
  "You are the camera assistant of a professional video editor. You receive still frames sampled from ONE video, usually a person talking to the camera, each introduced by a label `FRAME <ID> t=<seconds>s`. The editor uses your answer to reframe the shot (for example 16:9 to 9:16) without cutting anyone's head off and to keep captions off faces.",
  "Return ONLY one JSON object: {\"frames\":[…],\"overall\":{…}}. Give exactly one entry per FRAME id you received, using exactly those letter ids, in the same order. Never invent, rename, renumber or merge ids.",
  "Each frame entry: {\"id\", \"faces\":[{\"box_2d\":[ymin,xmin,ymax,xmax], \"role\", \"facing\"}], \"shotType\", \"speakerVisible\", \"background\", \"screenContent\", \"textOnScreen\", \"lighting\"}.",
  "faces: every clearly visible real human head in the frame. Ignore people inside posters, photos or small screens. box_2d is a flat array of four integers normalized 0-1000 (y values relative to the image height, x values relative to the image width) that tightly covers the whole head from the top of the hair to the chin, ears included. role: \"speaker\" for the main person the video is about (the one talking, usually central and facing the camera), \"other\" for anyone else. facing, from the viewer's perspective: \"camera\", \"left\", \"right\" or \"away\". Use an empty array when no person is visible.",
  "shotType: \"closeup\" (head and shoulders fill the frame), \"medium\" (roughly waist up) or \"wide\". speakerVisible: true when the main speaker's face is visible. background: at most 8 concrete words (e.g. \"home office with bookshelf\"). screenContent: when a screen, slide, document, code or product interface is a major part of the frame, at most 12 words describing it, otherwise null. textOnScreen: true only when readable text or graphics are overlaid on or dominate the frame. lighting: \"good\", \"dim\", \"harsh\" or \"backlit\".",
  "overall: {\"setting\": at most 8 words, \"visualQuality\": \"good\" | \"ok\" | \"poor\"}.",
  "Describe positions only. Never guess identity, age, ethnicity, gender or emotion.",
].join("\n");

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const r3 = (x) => Math.round(x * 1000) / 1000;
const r8 = (x) => Math.round(x * 1e8) / 1e8;
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);

function visionSettings(settings) {
  const v = settings && settings.providers && isPlain(settings.providers.vision) ? settings.providers.vision : {};
  const int = (x, lo, hi, d) => (Number.isInteger(Number(x)) && Number(x) >= lo && Number(x) <= hi ? Number(x) : d);
  return {
    model: typeof v.model === "string" && v.model ? v.model : VISION_DEFAULTS.model,
    escalationModel: v.escalationModel === null ? null : (typeof v.escalationModel === "string" && v.escalationModel ? v.escalationModel : VISION_DEFAULTS.escalationModel),
    imageWidth: int(v.imageWidth, 128, 640, VISION_DEFAULTS.imageWidth),
    framesPerCall: int(v.framesPerCall, 1, 8, VISION_DEFAULTS.framesPerCall),
    maxFaceFrames: int(v.maxFaceFrames, 1, 120, VISION_DEFAULTS.maxFaceFrames),
  };
}

function buildFaceSchema(ids) {
  const want = new Set(ids);
  return z.object({
    frames: z.array(z.object({ id: z.string(), faces: z.array(z.unknown()).catch([]) }).passthrough()),
    overall: z.unknown().optional(),
  }).passthrough().superRefine((v, ctx) => {
    const seen = new Set();
    const unknown = [];
    const dup = [];
    for (const f of v.frames) {
      const id = String(f.id).trim().toUpperCase();
      if (!want.has(id)) unknown.push(String(f.id).slice(0, 12));
      else if (seen.has(id)) dup.push(id);
      seen.add(id);
    }
    if (unknown.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["frames"], message: `unknown frame ids ${unknown.slice(0, 6).join(",")}; use only ${[...want].join(",")}` });
    if (dup.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["frames"], message: `duplicate frame ids ${dup.slice(0, 6).join(",")}` });
    if (!unknown.length && ![...seen].some((id) => want.has(id))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["frames"], message: `no frames returned; expected ids ${[...want].join(",")}` });
  });
}

function buildUserParts(frames, { projectDir, width, height }) {
  const parts = [{ type: "text", text: `${frames.length} frame${frames.length === 1 ? "" : "s"} from one video (source ${width || "?"}x${height || "?"}px), in time order.` }];
  for (const f of frames) {
    const b64 = fs.readFileSync(fsx.resolveInside(projectDir, f.file)).toString("base64");
    parts.push({ type: "text", text: `FRAME ${f.id} t=${Number(f.t).toFixed(2)}s` });
    parts.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } });
  }
  return parts;
}

function normalizeFrameReply(raw) {
  const r = isPlain(raw) ? raw : {};
  const faces = [];
  let invalid = 0;
  for (const face of Array.isArray(r.faces) ? r.faces : []) {
    const box = track.flattenBox(isPlain(face) ? face.box_2d : face);
    const v = track.validateBox(box);
    if (!v.ok && v.reason !== "aspect") invalid++;   // pixel aspect is checked later against the real frame size
    faces.push({
      box_2d: box, role: isPlain(face) && ROLES.has(face.role) ? face.role : (isPlain(face) && /speak/i.test(String(face.role || "")) ? "speaker" : "other"),
      facing: isPlain(face) && FACINGS.has(face.facing) ? face.facing : null,
    });
  }
  return {
    faces,
    invalid,
    shotType: SHOTS.has(r.shotType) ? r.shotType : null,
    speakerVisible: typeof r.speakerVisible === "boolean" ? r.speakerVisible : null,
    background: str(r.background, 80),
    screenContent: str(r.screenContent, 120),
    textOnScreen: r.textOnScreen === true,
    lighting: LIGHTING.has(r.lighting) ? r.lighting : null,
  };
}

function capOf(settings, project) {
  const p = isPlain(project) ? project : {};
  const cost = isPlain(p.cost) ? p.cost : {};
  const caps = settings && isPlain(settings.caps) ? settings.caps : {};
  return num(p.settings && p.settings.maxCostUsd) || (num(cost.capUsd) > 0 ? num(cost.capUsd) : null) || num(caps.maxUsdPerProject);
}

function assumedDoc({ reason, width, height, durationSec, vs, frames = [], stats = null }) {
  return {
    schemaVersion: 1, mode: "assumed", reason, promptVersion: PROMPT_VERSION, model: null, models: [],
    frameWidth: width || null, frameHeight: height || null, durationSec: durationSec ? r3(durationSec) : null,
    keyframes: [], absent: [], multiFace: [], frames, overall: null,
    stats: stats || { frames: frames.length, detections: 0, invalidBoxes: 0, boxes: 0, outliers: 0, missingFrames: 0, batches: 0, failedBatches: 0 },
    settings: { model: vs.model, escalationModel: vs.escalationModel, framesPerCall: vs.framesPerCall, maxFaceFrames: vs.maxFaceFrames },
  };
}

const NOTICE_TEXT = {
  privacy: "Cloud vision is turned off; framing stays centred.",
  cost_cap: "The project's AI budget is used up; framing stays centred.",
  budget: "The AI budget is low; framing stays centred.",
  breaker: "The vision service is unavailable right now; framing stays centred.",
  vision_unavailable: "Face tracking was unavailable; framing stays centred.",
};

async function analyzeFaces(opts = {}) {
  const {
    projectDir, settings, project = null, video = null, runId = "run", signal = null, pidFile, lowPriority = false, threads = null,
    tracker = null, onCost = null, onNotice = null, onProgress = null, chat = null, auth = null, fetchImpl = null, cacheDir = null,
    withHeavy = (fn) => fn({ lowPriority, threads }), spentUsd = null, write = true, now = Date.now,
  } = opts;
  const callJson = typeof opts.callJson === "function" ? opts.callJson : require("../ai/llm").callJson;
  const vs = visionSettings(settings);
  const durationSec = num(opts.durationSec) || num(video && video.durationSec) || 0;
  const width = num(opts.width) || num(video && video.width) || 0;
  const height = num(opts.height) || num(video && video.height) || 0;
  const fps = num(opts.fps) || num(video && video.fps) || 30;
  const notices = [];
  const fallbacks = [];
  const progress = (p, m) => { if (typeof onProgress === "function") { try { onProgress(p, m); } catch { /* enhancement */ } } };
  const notice = (code, severity, message) => {
    if (notices.some((n) => n.code === code)) return;
    const n = { code, severity, stage: "ANALYZING_VIDEO", message };
    notices.push(n);
    if (typeof onNotice === "function") { try { onNotice(n); } catch { /* observer */ } }
  };
  const writeDoc = (doc) => { if (write) fsx.writeJsonAtomic(fsx.resolveInside(projectDir, FACES_REL), doc); return doc; };
  const finishAssumed = (reason, extra = {}) => {
    if (reason !== "no_frames" && reason !== "no_faces") {
      notice("FACE_TRACK_ASSUMED", reason === "privacy" ? "info" : "warn", NOTICE_TEXT[reason] || NOTICE_TEXT.vision_unavailable);
      fallbacks.push(`faces_${reason}`.slice(0, 40));
    }
    const doc = writeDoc(assumedDoc({ reason, width, height, durationSec, vs, ...extra }));
    return {
      faces: doc, frames: [], costUsd: r8(extra.costUsd || 0), calls: extra.calls || 0, escalations: extra.escalations || 0,
      engine: "assumed", fallbacks, notices, discoveries: { faceFound: false, onScreenText: onScreenRanges(doc.frames, durationSec) },
      outputs: { faces: { path: FACES_REL } },
    };
  };

  if (isPlain(project && project.settings) && isPlain(project.settings.privacy) && project.settings.privacy.allowCloudVision === false) {
    return finishAssumed("privacy");
  }
  const plan = sampler.planFrames({ durationSec, fps, video, maxFaceFrames: vs.maxFaceFrames });
  if (!plan.length) return finishAssumed("no_frames");

  // Provider breaker (402 / 401 close the key for every chat use) · per-model breakers for rate limits and outages.
  const breaker = getBreaker(BREAKER, { now });
  const modelBreaker = (m) => getBreaker(`${BREAKER}:${m}`, { now });
  const cap = capOf(settings, project);
  const spent0 = spentUsd != null && Number.isFinite(Number(spentUsd)) ? Number(spentUsd) : num(project && project.cost && project.cost.spentUsd) || 0;
  let costUsd = 0;
  const overCap = () => cap != null && cap > 0 && spent0 + costUsd + EST_BATCH_USD > cap + 1e-9;
  if (overCap()) return finishAssumed("cost_cap");
  if (breaker.state().state === "open") return finishAssumed("breaker");
  const checkBudget = typeof opts.checkBudget === "function" ? opts.checkBudget : require("../ai/openrouter_stt").checkBudget;
  try {
    const b = await checkBudget({ settings, auth, fetchImpl, project, now });
    const min = settings && settings.caps && Number.isFinite(Number(settings.caps.minBudgetRemaining)) ? Number(settings.caps.minBudgetRemaining) : 0.15;
    if (b && Number.isFinite(b.remaining) && b.remaining < min) {
      breaker.recordFailure("budget", { untilMs: nextUtcMidnight(now()) });
      return finishAssumed("budget");
    }
  } catch { /* budget probe is optional */ }

  progress(5, "Looking at the video");
  const frames = await withHeavy((slot) => sampler.extractFrames({
    projectDir, frames: plan, fps, width, height, imageWidth: vs.imageWidth, runId, signal, pidFile,
    lowPriority: !!(slot && slot.lowPriority) || lowPriority, threads: (slot && slot.threads) || threads,
  }));
  if (!frames.length) return finishAssumed("no_frames");
  progress(20, "Looking at the video");

  // chat transport: injected (tests) · direct fetch to the override base (dev/mock) · services/openrouter.chat (production)
  let baseChat = typeof chat === "function" ? chat : null;
  if (!baseChat && settings && settings.providerBaseOverride && settings.providerBaseOverride.openrouter) {
    baseChat = require("../ai/openrouter_stt").createDirectChat({ settings, auth, fetchImpl });
  }
  if (!baseChat) baseChat = (o) => require("../../services/openrouter").chat(o);
  const shaping = faults.faultFor("vision", { settings, project });
  const chatFor = (model, primary) => async (o) => {
    const res = await baseChat(o);
    if (!primary || !shaping) return res;
    if (shaping.mode === "invalid_json") return { ...res, text: "I can see a person in these frames." };
    if (shaping.mode === "hallucinated_ids") {
      let j = null;
      try { j = JSON.parse(res.text); } catch { j = null; }
      if (isPlain(j) && Array.isArray(j.frames)) return { ...res, text: JSON.stringify({ ...j, frames: j.frames.map((f, k) => ({ ...f, id: `F${k + 1}` })) }) };
    }
    return res;
  };

  const batches = [];
  for (let i = 0; i < frames.length; i += vs.framesPerCall) batches.push(frames.slice(i, i + vs.framesPerCall));
  const replies = new Map();
  const modelsUsed = new Set();
  let calls = 0;
  let escalations = 0;
  let failedBatches = 0;
  let stopReason = null;
  let done = 0;

  const attempt = async (batch, model, primary) => {
    if (signal && signal.aborted) throw new EditError("CANCELLED", { status: 409, errorClass: "cancelled", stage: "ANALYZING_VIDEO" });
    if (!breaker.canRequest()) throw new EditError("VISION_BREAKER_OPEN", { errorClass: "provider", extra: { skipped: true } });
    if (!modelBreaker(model).canRequest()) throw new EditError("VISION_MODEL_BREAKER_OPEN", { errorClass: "transient", extra: { skipped: true } });
    if (overCap()) throw new EditError("COST_CAP_REACHED", { errorClass: "budget", extra: { cap: true } });
    await faults.maybeFail("vision", { settings, project, signal, stage: "ANALYZING_VIDEO" });
    calls++;
    const ids = batch.map((f) => f.id);
    const res = await callJson({
      stage: STAGE, system: SYSTEM_PROMPT, user: buildUserParts(batch, { projectDir, width, height }), schema: buildFaceSchema(ids),
      model, temperature: 0, tracker, signal, promptVersion: PROMPT_VERSION, cacheDir, chat: chatFor(model, primary), now,
      onCost: (entry) => {
        costUsd += Number(entry && entry.costUsd) || 0;
        if (typeof onCost === "function") { try { onCost({ ...entry, stage: STAGE }); } catch { /* observer */ } }
      },
    });
    if (res.modelFallback) {
      throw new EditError("VISION_MODEL_SUBSTITUTED", { errorClass: "provider", detail: `served ${String(res.model).slice(0, 60)}` });
    }
    const byId = new Map();
    let boxes = 0;
    let invalid = 0;
    for (const f of res.value.frames) {
      const id = String(f.id).trim().toUpperCase();
      if (byId.has(id)) continue;
      const n = normalizeFrameReply(f);
      boxes += n.faces.length;
      invalid += n.invalid;
      byId.set(id, n);
    }
    return { byId, boxes, invalid, overall: res.value.overall, model: res.model || model };
  };

  const classify = (e) => (isEditError(e) ? e.errorClass : "provider");
  const runBatch = async (batch) => {
    if (stopReason) { failedBatches++; return; }
    let result = null;
    let lastErr = null;
    const models = [vs.model, vs.escalationModel].filter((m, k, a) => m && a.indexOf(m) === k);
    for (let m = 0; m < models.length; m++) {
      if (stopReason) break;
      try {
        const r = await attempt(batch, models[m], m === 0);
        breaker.recordSuccess();
        modelBreaker(models[m]).recordSuccess();
        if (r.boxes > 0 && r.invalid / r.boxes > INVALID_ESCALATE_RATIO && m + 1 < models.length) {
          result = r;   // keep as a floor in case escalation fails
          escalations++;
          continue;
        }
        result = r;
        break;
      } catch (e) {
        const cls = classify(e);
        if (cls === "cancelled" || (signal && signal.aborted)) throw e;
        if (cls === "bug") throw e;
        lastErr = e;
        if (isEditError(e) && e.code === "COST_CAP_REACHED") { stopReason = "cost_cap"; break; }
        if (isEditError(e) && e.code === "VISION_BREAKER_OPEN") { stopReason = "breaker"; break; }
        if (cls === "budget") { breaker.recordFailure("budget", { untilMs: nextUtcMidnight(now()) }); stopReason = "budget"; break; }
        if (cls === "config") { breaker.recordFailure("config"); stopReason = "breaker"; break; }
        if (cls === "transient" && !(e.extra && e.extra.skipped)) {
          modelBreaker(models[m]).recordFailure("transient", e.extra && Number.isFinite(e.extra.retryAfterSec) ? { retryAfterSec: e.extra.retryAfterSec } : {});
        }
        if (m + 1 < models.length) escalations++;
      }
    }
    if (result) {
      result.byId.forEach((v, id) => replies.set(id, { ...v, model: result.model }));
      modelsUsed.add(result.model);
      if (result.overall !== undefined) replies.set("__overall", result.overall);
    } else {
      failedBatches++;
      if (lastErr && !stopReason) fallbacks.push(`vision_batch_failed:${String(lastErr.code || "ERR").slice(0, 24)}`);
    }
    done++;
    progress(20 + (75 * done) / batches.length, "Looking at the video");
  };

  let next = 0;
  const worker = async () => { while (next < batches.length) await runBatch(batches[next++]); };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_BATCHES, batches.length) }, worker));

  const semantics = frames.map((f) => {
    const r = replies.get(f.id);
    return {
      id: f.id, idx: f.idx, t: f.t, reason: f.reason, file: f.file, missing: !r,
      faces: r ? r.faces : [], shotType: r ? r.shotType : null, speakerVisible: r ? r.speakerVisible : null,
      background: r ? r.background : null, screenContent: r ? r.screenContent : null, textOnScreen: r ? r.textOnScreen : false,
      lighting: r ? r.lighting : null,
    };
  });
  const answered = semantics.filter((f) => !f.missing);
  const overallRaw = replies.get("__overall");
  const overall = isPlain(overallRaw) ? { setting: str(overallRaw.setting, 80), visualQuality: QUALITY.has(overallRaw.visualQuality) ? overallRaw.visualQuality : null } : null;
  const baseStats = { missingFrames: semantics.length - answered.length, batches: batches.length, failedBatches, calls, escalations };

  if (!answered.length) {
    const reason = stopReason || "vision_unavailable";
    return finishAssumed(reason, { frames: semantics, costUsd, calls, escalations, stats: { frames: semantics.length, detections: 0, invalidBoxes: 0, boxes: 0, outliers: 0, ...baseStats } });
  }
  if (stopReason) { notice("FACE_TRACK_PARTIAL", "info", "Part of the video could not be checked for faces."); fallbacks.push(`faces_partial_${stopReason}`.slice(0, 40)); }

  const sceneChanges = isPlain(video) && Array.isArray(video.sceneChanges) && video.sceneChanges.length
    ? video.sceneChanges.map((c) => (isPlain(c) ? c.t : c))
    : (isPlain(video) && Array.isArray(video.scenes) ? video.scenes.slice(1).map((s) => s.start) : []);
  const tr = track.smoothTrack({ frames: answered, sceneChanges, durationSec, frameW: width || 16, frameH: height || 9 });
  const doc = writeDoc({
    schemaVersion: 1, mode: tr.mode, reason: tr.mode === "assumed" ? "no_faces" : null, promptVersion: PROMPT_VERSION,
    model: [...modelsUsed][0] || null, models: [...modelsUsed],
    frameWidth: width || null, frameHeight: height || null, durationSec: r3(durationSec),
    keyframes: tr.keyframes, absent: tr.absent, multiFace: tr.multiFace, primary: tr.primary,
    frames: semantics, overall,
    stats: { ...tr.stats, ...baseStats },
    settings: { model: vs.model, escalationModel: vs.escalationModel, framesPerCall: vs.framesPerCall, maxFaceFrames: vs.maxFaceFrames },
  });
  progress(100, "Looked at the video");
  return {
    faces: doc, frames: semantics, costUsd: r8(costUsd), calls, escalations,
    engine: tr.mode === "tracked" ? (escalations ? "vision_escalated" : "vision") : "vision_no_faces",
    fallbacks, notices,
    discoveries: { faceFound: tr.mode === "tracked", onScreenText: onScreenRanges(semantics, durationSec) },
    outputs: { faces: { path: FACES_REL } },
  };
}

function onScreenRanges(frames, durationSec) {
  const list = (Array.isArray(frames) ? frames : []).filter((f) => f && Number.isFinite(f.t)).sort((a, b) => a.t - b.t);
  const out = [];
  list.forEach((f, i) => {
    if (!f.textOnScreen) return;
    const a = i > 0 ? Math.max(0, f.t - Math.min(1.5, (f.t - list[i - 1].t) / 2)) : 0;
    const b = i + 1 < list.length ? f.t + Math.min(1.5, (list[i + 1].t - f.t) / 2) : (durationSec || f.t + 1);
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1e-6) last[1] = r3(b);
    else out.push([r3(a), r3(b)]);
  });
  return out.slice(0, 50);
}

module.exports = {
  analyzeFaces, buildFaceSchema, buildUserParts, normalizeFrameReply, visionSettings, onScreenRanges,
  SYSTEM_PROMPT, STAGE, PROMPT_VERSION, FACES_REL, VISION_DEFAULTS,
};
