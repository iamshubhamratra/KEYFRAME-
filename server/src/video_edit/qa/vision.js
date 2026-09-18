// VIDEO EDIT QA VISION — ve_qa: a handful of rendered frames → one vision verdict (ENGINE.md §7 "Vision QA").
//
// WHY THIS EXISTS. The deterministic checks measure geometry and timing, but only looking at the pixels
// tells an unreadable caption, a watermarked or off-topic B-roll clip, a broken card or a colour jump
// apart. That look is paid (OpenRouter/KIE only — no local model, user rule) and runs inside a repair
// loop, so it is shaped for cheap and verifiable:
//   - ≤ 8 frames on lap 0, picked at informative moments (B-roll entries, cards, captions over the face,
//     the logo), ≤ 4 on later laps, only inside the windows the repair changed; findings of the previous
//     lap outside those windows carry over (the pixels there did not change);
//   - frames come from the delivered mp4 decoded as BT.709 (`scale=in_color_matrix=bt709`, spike S3: an
//     untagged decode shifts brand colours by ΔE ≈ 5), ≤ 512 px long edge JPEGs (llm_guard: ≤ 8 images);
//   - each frame is introduced by a text part `{i, atSec, segmentType, expectedCaption, overlays,
//     orientation, language}` so the model can compare what it sees with what the plan says is there;
//   - the reply must pass the zod VisionVerdict EXACTLY as ENGINE.md §7 defines it (callJson's single repair
//     re-ask, then one escalation to the stronger model); anything still invalid → `visionUnverified` and
//     no vision-driven repairs. An unknown elementId is re-resolved from the frame's time or dropped, and
//     CAPTION_MISMATCH is capped at minor for hi/ar/ja (the model's reading of those scripts is unreliable);
//   - skipped with zero calls when cloud vision is off (`project.settings.privacy.allowCloudVision===false`),
//     the project cost cap would be crossed, the OpenRouter chat breaker is open, or checkBudget < 0.15 —
//     exactly like analysis/faces.js. Cancellation always propagates.
//
// CONTRACT:
//   QaCategory · VisionVerdict (zod, ENGINE.md §7) · STAGE ('ve_qa') · PROMPT_VERSION · SYSTEM_PROMPT · VISUAL_CATEGORIES
//   selectFrames(pc, { lap=0, changedRanges=[], previousFindings=[], maxFrames }) -> [{ i, atSec, reason, segmentType,
//        expectedCaption, overlays:[{id,kind,box}], orientation, language }]
//   extractFrames({ file, frames, projectDir, outRel, width, height, signal, withHeavy, pidFile, cwd, deps }) -> frames + { file(abs) }
//   interpretVerdict(verdict, frames, pc) -> finding[]   (pure: re-resolve / drop / cap)
//   runVision({ pc, file, projectDir, renderId, lap, changedRanges, previous, settings, project, signal, tracker,
//               callVision, chat, checkBudget, cacheDir, onCost, onNotice, withHeavy, spentUsd, now, deps })
//     -> { status:'ok'|'skipped'|'failed', reason, findings, carried, frames:[{i,atSec,reason}], pass, score,
//          costUsd, calls, model, visionUnverified }

const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const { EditError, isEditError } = require("../errors");
const faults = require("../faults");
const fsx = require("../fsx");
const { getBreaker, nextUtcMidnight } = require("../providers/breaker");
const { visionSettings } = require("../analysis/faces");
const C = require("./common");
const { visibleCues, captionsOn, liveBroll } = require("./checks");

const STAGE = "ve_qa";
const PROMPT_VERSION = "ve-qa-1";
const BREAKER = "openrouter_chat";
const EST_CALL_USD = 0.006;
const MAX_FRAMES_LAP0 = 8;
const MAX_FRAMES_LATER = 4;
const LONG_EDGE = 512;
const MIN_GAP_SEC = 0.4;

const QaCategory = z.enum(C.QA_CATEGORIES);
const VisionVerdict = z.object({
  pass: z.boolean(), score: z.number().min(0).max(10),
  issues: z.array(z.object({
    frameIndex: z.number().int().min(0), atSec: z.number().min(0), category: QaCategory,
    severity: z.enum(["blocker", "major", "minor"]), elementId: z.string().max(40).optional(),
    evidence: z.string().max(200), fix: z.string().max(200).optional(),
  })).max(12),
});

// What a picture can show. Deterministic-only categories (audio, timing, duration) are dropped from replies.
const VISUAL_CATEGORIES = Object.freeze(C.QA_CATEGORIES.slice(0, C.QA_CATEGORIES.indexOf("OTHER") + 1));
const ELEMENT_KIND_FOR = Object.freeze({
  CAPTION_UNREADABLE: ["caption"], CAPTION_MISMATCH: ["caption"], CAPTION_COVERS_FACE: ["caption"],
  BROLL_OFF_TOPIC: ["broll", "pip"], BROLL_LOW_QUALITY: ["broll", "pip"], BROLL_WATERMARK: ["broll", "pip"],
  CARD_RENDER_BROKEN: ["card"], LOGO_PROBLEM: ["logo"],
  OVERLAY_COLLISION: ["pip", "logo", "card", "caption"], TEXT_OFFSCREEN: ["caption", "card", "logo", "pip"],
});
const NEEDS_ELEMENT = new Set(["BROLL_OFF_TOPIC", "BROLL_LOW_QUALITY", "BROLL_WATERMARK", "CARD_RENDER_BROKEN"]);
const LOW_TRUST_SCRIPTS = new Set(["hi", "ar", "ja"]);

const SYSTEM_PROMPT = [
  "You are the final quality reviewer of a professionally edited talking-head video (a person speaking to camera, with captions, cut-away B-roll clips, picture-in-picture boxes, title cards and a logo).",
  "You receive a few still frames of the FINISHED video. Each frame is introduced by a JSON line: i (frame index), atSec (time), segmentType (aroll = the speaker, broll_full = full-screen cut-away, broll_pip = small inset clip over the speaker, split = half/half, card = a title/stat card is on screen), expectedCaption (the caption text that should be visible, or null), overlays (elements that should be on screen with their id, kind and normalized box x,y,w,h), orientation and language.",
  "Report only problems you can SEE in a frame. Categories:",
  "CAPTION_UNREADABLE (caption too small, low contrast, cut off), CAPTION_MISMATCH (visible caption text clearly differs from expectedCaption or is missing), CAPTION_COVERS_FACE (caption over the speaker's eyes or mouth), OVERLAY_COLLISION (two overlays overlap each other), TEXT_OFFSCREEN (text or logo partly outside the frame or in the outer platform-UI margin), BROLL_OFF_TOPIC (cut-away unrelated to the caption / topic), BROLL_LOW_QUALITY (blurry, pixelated, badly cropped cut-away), BROLL_WATERMARK (a stock watermark or burned-in foreign text on a cut-away), SPEAKER_CROPPED (the speaker's head is cut off by the frame edge), BLACK_OR_BLANK_FRAME (black, blank or corrupted picture), CARD_RENDER_BROKEN (a title card is garbled, empty or partly drawn), LOGO_PROBLEM (logo distorted, unreadable or on top of something important), EXPOSURE_OR_COLOR_JUMP (sudden brightness or colour mismatch), OTHER.",
  "severity: blocker = a viewer would call the video broken; major = clearly unprofessional; minor = small polish issue.",
  "elementId: when the problem belongs to one of the listed overlays, copy its id exactly; otherwise omit it. Never invent ids.",
  "frameIndex must be the i of the frame showing the problem; atSec its atSec. evidence: what you see, at most 200 characters. fix: optional short suggestion.",
  "score 0-10 for overall visual quality of these frames; pass = true when there is no blocker or major problem.",
  "Return ONLY one JSON object: {\"pass\":true,\"score\":8,\"issues\":[{\"frameIndex\":0,\"atSec\":1.2,\"category\":\"CAPTION_COVERS_FACE\",\"severity\":\"major\",\"elementId\":\"c_12\",\"evidence\":\"...\",\"fix\":\"...\"}]}. At most 12 issues. Never guess identity, age, ethnicity, gender or emotion.",
].join("\n");

const isPlain = C.isPlain;
const num = (v) => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const r8 = (x) => Math.round(x * 1e8) / 1e8;
const active = (e, t) => t >= e.outIn - 1e-6 && t < e.outOut - 1e-6;

function capOf(settings, project) {
  const p = isPlain(project) ? project : {};
  const cost = isPlain(p.cost) ? p.cost : {};
  const caps = settings && isPlain(settings.caps) ? settings.caps : {};
  return num(p.settings && p.settings.maxCostUsd) || (num(cost.capUsd) > 0 ? num(cost.capUsd) : null) || num(caps.maxUsdPerProject);
}

// ---- frame selection --------------------------------------------------------------------------------
function describeFrame(pc, t) {
  const plan = pc.plan;
  const overlays = pc.elements.filter((e) => active(e, t) && e.box)
    .map((e) => ({ id: e.id.slice(0, 40), kind: e.kind, box: { x: C.r3(e.box.x), y: C.r3(e.box.y), w: C.r3(e.box.w), h: C.r3(e.box.h) } }))
    .slice(0, 8);
  let segmentType = "aroll";
  const br = (plan.broll || []).find((b) => liveBroll(b) && t >= b.resolved.outIn && t < b.resolved.outOut);
  if (br) segmentType = br.layout === "PIP" ? "broll_pip" : br.layout === "SPLIT" ? "split" : "broll_full";
  else if (pc.elements.some((e) => e.kind === "card" && active(e, t))) segmentType = "card";
  let expectedCaption = null;
  if (captionsOn(plan)) {
    const cue = visibleCues(plan).find((c) => t >= c.resolved.outIn && t < c.resolved.outOut);
    if (cue) expectedCaption = String(cue.text || cue.words.map((w) => w.text).join(" ")).slice(0, 120);
  }
  return { segmentType, expectedCaption, overlays, orientation: pc.aspect, language: pc.lang };
}

function selectFrames(pc, { lap = 0, changedRanges = [], previousFindings = [], maxFrames } = {}) {
  const D = pc.outDur;
  if (!(D > 0.3)) return [];
  const clampT = (t) => C.clamp(t, 0.1, Math.max(0.1, D - 0.1));
  const picks = [];
  const add = (t, reason) => {
    const x = C.r3(clampT(t));
    if (picks.some((p) => Math.abs(p.atSec - x) < MIN_GAP_SEC)) return false;
    picks.push({ atSec: x, reason });
    return true;
  };
  if (lap > 0) {
    const cap = Math.min(maxFrames || MAX_FRAMES_LATER, MAX_FRAMES_LATER);
    const windows = C.mergeRanges([
      ...(Array.isArray(changedRanges) ? changedRanges : []).filter((r) => Array.isArray(r)).map((r) => [Number(r[0]), Math.min(D, Number(r[1]))]),
      ...(Array.isArray(previousFindings) ? previousFindings : []).filter((f) => f && Number.isFinite(f.atSec)).map((f) => [f.atSec - 0.2, f.atSec + 0.2]),
    ].filter((r) => r[1] > r[0]), 0.5);
    for (const w of windows) { if (picks.length >= cap) break; add((w[0] + Math.min(w[1], D)) / 2, "changed"); }
  } else {
    const cap = Math.min(maxFrames || MAX_FRAMES_LAP0, MAX_FRAMES_LAP0);
    const groups = [];
    groups.push((pc.plan.broll || []).filter(liveBroll).map((b) => ({ t: b.resolved.outIn + Math.min(0.6, (b.resolved.outOut - b.resolved.outIn) / 2), reason: "broll" })));
    const cards = pc.elements.filter((e) => e.kind === "card").map((e) => ({ t: (e.outIn + e.outOut) / 2, reason: "card" }));
    groups.push(cards.length ? cards : (pc.plan.graphics || []).filter((g) => g && g.enabled !== false && g.resolved && !g.resolved.collapsed)
      .map((g) => ({ t: (g.resolved.outIn + g.resolved.outOut) / 2, reason: "card" })));
    const cues = captionsOn(pc.plan) ? visibleCues(pc.plan).filter((c) => !pc.fullCover.some((r) => c.resolved.outIn >= r[0] && c.resolved.outIn < r[1])) : [];
    const step = Math.max(1, Math.floor(cues.length / 3));
    groups.push(cues.filter((_, k) => k % step === 0).map((c) => ({ t: (c.resolved.outIn + c.resolved.outOut) / 2, reason: "caption_face" })));
    groups.push(pc.elements.filter((e) => e.kind === "logo").slice(0, 1).map((e) => ({ t: e.outIn + Math.min(1, (e.outOut - e.outIn) / 2), reason: "logo" })));
    const quotas = [3, 2, 2, 1];
    groups.forEach((g, k) => { let n = 0; for (const c of g) { if (picks.length >= cap || n >= quotas[k]) break; if (add(c.t, c.reason)) n++; } });
    for (const g of groups) for (const c of g) { if (picks.length >= cap) break; add(c.t, c.reason); }
    for (let k = 0; picks.length < Math.min(cap, 4) && k < 12; k++) add(((k % 4) + 0.5) * (D / 4) + Math.floor(k / 4) * 0.45, "sample");
  }
  return picks.sort((a, b) => a.atSec - b.atSec).map((p, i) => ({ i, ...p, ...describeFrame(pc, p.atSec) }));
}

// ---- frame extraction (BT.709, small JPEGs) -----------------------------------------------------------
function frameSize(width, height) {
  const W = Number(width) || 1080, H = Number(height) || 1920;
  const s = LONG_EDGE / Math.max(W, H);
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  return { w: even(W * Math.min(1, s)), h: even(H * Math.min(1, s)) };
}

async function extractFrames({ file, frames, projectDir, outRel, width, height, signal, withHeavy = (fn) => fn({}), pidFile, deps = {} } = {}) {
  const proc = deps.proc || require("../engine/proc");
  if (!frames.length) return [];
  const outAbs = fsx.resolveInside(projectDir, outRel);
  fsx.ensureDir(outAbs);
  const { w, h } = frameSize(width, height);
  const vf = `scale=${w}:${h}:in_color_matrix=bt709:out_color_matrix=bt709:in_range=tv:out_range=pc:flags=bicubic,setsar=1,format=yuvj420p`;
  const out = [];
  await withHeavy(async (slot) => {
    for (const f of frames) {
      const dest = path.join(outAbs, `f${String(f.i).padStart(2, "0")}.jpg`);
      try { fs.unlinkSync(dest); } catch { /* absent */ }
      await proc.ffmpeg(["-y", "-ss", Number(f.atSec).toFixed(6), "-protocol_whitelist", "file", "-i", `file:${String(file).split(path.sep).join("/")}`,
        "-an", "-sn", "-dn", "-frames:v", "1", "-vf", vf, "-q:v", "5", ...(slot && slot.threads ? ["-threads", String(slot.threads)] : []), dest],
      { signal, pidFile, lowPriority: !!(slot && slot.lowPriority), timeoutMs: 30000, label: "qa-frame", stage: "QUALITY_CHECK" });
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) out.push({ ...f, file: dest, width: w, height: h });
    }
  });
  return out;
}

function buildUserParts(frames) {
  const parts = [{ type: "text", text: `${frames.length} frame${frames.length === 1 ? "" : "s"} of the finished video, in time order.` }];
  for (const f of frames) {
    const meta = { i: f.i, atSec: f.atSec, segmentType: f.segmentType, expectedCaption: f.expectedCaption, overlays: f.overlays, orientation: f.orientation, language: f.language };
    parts.push({ type: "text", text: `FRAME ${JSON.stringify(meta)}` });
    parts.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(f.file).toString("base64")}` } });
  }
  return parts;
}

// ---- verdict → findings -------------------------------------------------------------------------------
function knownIds(pc) {
  const ids = new Set(pc.elements.map((e) => e.id));
  const p = pc.plan;
  for (const c of (p.captions && p.captions.cues) || []) ids.add(c.id);
  for (const b of p.broll || []) if (b.status !== "removed") ids.add(b.id);
  for (const g of p.graphics || []) ids.add(g.id);
  for (const s of (p.aRoll && p.aRoll.segments) || []) ids.add(s.id);
  return ids;
}

function resolveByTime(pc, category, t) {
  if (category === "SPEAKER_CROPPED") {
    const s = ((pc.plan.aRoll && pc.plan.aRoll.segments) || []).find((x) => x.resolved && t >= x.resolved.outIn && t < x.resolved.outOut);
    return s ? s.id : null;
  }
  const kinds = ELEMENT_KIND_FOR[category];
  if (!kinds) return null;
  const hit = pc.elements.filter((e) => kinds.includes(e.kind) && active(e, t)).sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind))[0];
  if (hit) return hit.id;
  if (kinds.includes("caption")) {
    const cue = captionsOn(pc.plan) ? visibleCues(pc.plan).find((c) => t >= c.resolved.outIn && t < c.resolved.outOut) : null;
    if (cue) return cue.id;
  }
  if (kinds.includes("broll")) {
    const b = (pc.plan.broll || []).find((x) => liveBroll(x) && t >= x.resolved.outIn && t < x.resolved.outOut);
    if (b) return b.id;
  }
  if (kinds.includes("card")) {
    const g = (pc.plan.graphics || []).find((x) => x && x.enabled !== false && x.resolved && t >= x.resolved.outIn && t < x.resolved.outOut);
    if (g) return g.id;
  }
  return null;
}

function interpretVerdict(verdict, frames, pc) {
  const ids = knownIds(pc);
  const out = [];
  for (const issue of (verdict && verdict.issues) || []) {
    if (!VISUAL_CATEGORIES.includes(issue.category)) continue;
    let frame = frames.find((f) => f.i === issue.frameIndex) || null;
    if (!frame) {
      frame = frames.slice().sort((a, b) => Math.abs(a.atSec - issue.atSec) - Math.abs(b.atSec - issue.atSec))[0] || null;
      if (!frame || Math.abs(frame.atSec - issue.atSec) > 0.6) continue;
    }
    const t = frame.atSec;
    let elementId = issue.elementId && ids.has(issue.elementId) ? issue.elementId : null;
    let reResolved = false;
    if (!elementId && (issue.elementId || ELEMENT_KIND_FOR[issue.category] || issue.category === "SPEAKER_CROPPED")) {
      elementId = resolveByTime(pc, issue.category, t);
      reResolved = !!elementId && !!issue.elementId;
    }
    if (!elementId && NEEDS_ELEMENT.has(issue.category)) continue;
    let severity = issue.severity;
    if (issue.category === "CAPTION_MISMATCH" && LOW_TRUST_SCRIPTS.has(pc.lang)) severity = "minor";
    const area = issue.category.startsWith("CAPTION") ? "captions" : issue.category.startsWith("BROLL") ? "broll"
      : issue.category === "CARD_RENDER_BROKEN" ? "cards" : issue.category === "LOGO_PROBLEM" ? "logo" : "picture";
    out.push(C.makeFinding({
      severity, cls: "Q", category: issue.category, area, atSec: t, elementId,
      detail: issue.evidence, fix: issue.fix || null, source: "vision",
      data: { frameIndex: frame.i, reResolved, range: [C.r3(Math.max(0, t - 0.5)), C.r3(t + 0.5)] },
    }));
  }
  return out;
}

// Vision findings of the previous lap outside the re-checked windows still describe unchanged pixels.
function carryForward(previous, windows, pc) {
  const ids = knownIds(pc);
  return ((previous && Array.isArray(previous.issues)) ? previous.issues : [])
    .filter((f) => f && f.source === "vision" && Number.isFinite(f.atSec))
    .filter((f) => !windows.some((w) => f.atSec >= w[0] - 0.5 && f.atSec <= w[1] + 0.5))
    .filter((f) => !f.elementId || ids.has(f.elementId))
    .map((f) => ({ ...f, data: { ...(f.data || {}), carried: true } }));
}

// ---- main ----------------------------------------------------------------------------------------------
async function runVision(opts = {}) {
  const {
    pc, file, projectDir, renderId = "r", lap = 0, changedRanges = [], previous = null, settings = null, project = null,
    signal = null, tracker = null, cacheDir = null, onCost = null, onNotice = null, withHeavy = (fn) => fn({}), spentUsd = null,
    now = Date.now, auth = null, fetchImpl = null, pidFile, deps = {},
  } = opts;
  const vs = visionSettings(settings);
  const res = { status: "skipped", reason: null, findings: [], carried: [], frames: [], pass: null, score: null, costUsd: 0, calls: 0, model: null, visionUnverified: true };
  const skip = (reason, unverified = true) => ({ ...res, reason, visionUnverified: unverified });
  const cancelled = (e) => (signal && signal.aborted) || (isEditError(e) && e.errorClass === "cancelled");

  const windows = lap > 0 ? C.mergeRanges((Array.isArray(changedRanges) ? changedRanges : []).filter(Array.isArray)) : [];
  const prevVisionFindings = previous && Array.isArray(previous.issues) ? previous.issues.filter((f) => f && f.source === "vision") : [];
  // re-check the changed windows; previous findings are re-checked only when nothing says what changed
  const frames = selectFrames(pc, { lap, changedRanges: windows, previousFindings: windows.length ? [] : prevVisionFindings });
  if (lap > 0) res.carried = carryForward(previous, windows.length ? windows : prevVisionFindings.map((f) => [f.atSec - 0.2, f.atSec + 0.2]), pc);
  if (!frames.length) {
    if (lap > 0 && previous && previous.visionUnverified === false) return { ...res, status: "skipped", reason: "no_changes", visionUnverified: false };
    return skip("no_frames");
  }
  if (isPlain(project && project.settings) && isPlain(project.settings.privacy) && project.settings.privacy.allowCloudVision === false) return skip("privacy");
  const cap = capOf(settings, project);
  const spent0 = spentUsd != null && Number.isFinite(Number(spentUsd)) ? Number(spentUsd) : num(project && project.cost && project.cost.spentUsd) || 0;
  if (cap != null && cap > 0 && spent0 + EST_CALL_USD > cap + 1e-9) return skip("cost_cap");
  const breaker = deps.breaker || getBreaker(BREAKER, { now });
  if (breaker.state().state === "open" || !breaker.canRequest()) return skip("breaker_open");
  const checkBudget = typeof opts.checkBudget === "function" ? opts.checkBudget : require("../ai/openrouter_stt").checkBudget;
  try {
    const b = await checkBudget({ settings, auth, fetchImpl, project, now });
    const min = settings && settings.caps && Number.isFinite(Number(settings.caps.minBudgetRemaining)) ? Number(settings.caps.minBudgetRemaining) : 0.15;
    if (b && Number.isFinite(b.remaining) && b.remaining < min) {
      breaker.recordFailure("budget", { untilMs: nextUtcMidnight(now()) });
      return skip("budget_low");
    }
  } catch (e) { if (cancelled(e)) throw e; /* the budget probe is optional */ }

  let shots;
  try {
    shots = await extractFrames({ file, frames, projectDir, outRel: `render/qa/${renderId}/lap${lap}`, width: pc.W, height: pc.H, signal, withHeavy, pidFile, deps });
  } catch (e) {
    if (cancelled(e)) throw e;
    return { ...skip("frames_failed"), status: "failed" };
  }
  if (!shots.length) return { ...skip("frames_failed"), status: "failed" };
  res.frames = shots.map((f) => ({ i: f.i, atSec: f.atSec, reason: f.reason }));

  const callVision = typeof opts.callVision === "function" ? opts.callVision : require("../ai/llm").callJson;
  let baseChat = typeof opts.chat === "function" ? opts.chat : null;
  if (!baseChat && settings && settings.providerBaseOverride && settings.providerBaseOverride.openrouter) {
    baseChat = require("../ai/openrouter_stt").createDirectChat({ settings, auth, fetchImpl });
  }
  const shaping = faults.faultFor("vision", { settings, project });
  const chatFor = (primary) => {
    if (!baseChat && !shaping) return undefined;
    const base = baseChat || ((o) => require("../../services/openrouter").chat(o));
    return async (o) => {
      const r = await base(o);
      if (!primary || !shaping) return r;
      if (shaping.mode === "invalid_json") return { ...r, text: "The frames look fine to me." };
      if (shaping.mode === "hallucinated_ids") {
        let j = null;
        try { j = JSON.parse(r.text); } catch { j = null; }
        if (isPlain(j) && Array.isArray(j.issues)) return { ...r, text: JSON.stringify({ ...j, issues: j.issues.map((x, k) => ({ ...x, elementId: `zz_${k}` })) }) };
      }
      return r;
    };
  };
  const user = buildUserParts(shots);
  let costUsd = 0;
  const attempt = async (model, primary) => {
    if (signal && signal.aborted) throw new EditError("CANCELLED", { status: 409, errorClass: "cancelled", stage: "QUALITY_CHECK" });
    await faults.maybeFail("vision", { settings, project, signal, stage: "QUALITY_CHECK" });
    res.calls++;
    const chat = chatFor(primary);
    return callVision({
      stage: STAGE, system: SYSTEM_PROMPT, user, schema: VisionVerdict, model, temperature: 0, tracker, signal,
      promptVersion: PROMPT_VERSION, cacheDir, now, ...(chat ? { chat } : {}),
      onNotice: (n) => { if (typeof onNotice === "function") { try { onNotice(n); } catch { /* observer */ } } },
      onCost: (entry) => {
        costUsd += Number(entry && entry.costUsd) || 0;
        if (typeof onCost === "function") { try { onCost({ ...entry, stage: STAGE }); } catch { /* observer */ } }
      },
    });
  };

  const models = [vs.model, vs.escalationModel].filter((m, k, a) => m && a.indexOf(m) === k);
  let reply = null, reason = null;
  for (let m = 0; m < models.length && !reply; m++) {
    try {
      const r = await attempt(models[m], m === 0);
      if (r.modelFallback) throw new EditError("VISION_MODEL_SUBSTITUTED", { errorClass: "provider", detail: `served ${String(r.model).slice(0, 60)}` });
      reply = r;
      breaker.recordSuccess();
    } catch (e) {
      if (cancelled(e)) throw e;
      if (isEditError(e) && e.errorClass === "bug") throw e;
      costUsd += Number(e && e.extra && e.extra.costUsd) || 0;
      reason = isEditError(e) ? String(e.code).toLowerCase() : "call_failed";
      if (isEditError(e) && e.code === "LLM_INVALID_JSON") continue;          // escalate once
      if (isEditError(e) && e.code === "VISION_MODEL_SUBSTITUTED") continue;
      if (isEditError(e) && ["transient", "provider", "config", "budget"].includes(e.errorClass)) {
        breaker.recordFailure(e.errorClass, e.errorClass === "budget" ? { untilMs: nextUtcMidnight(now()) } : {});
      }
      break;
    }
  }
  res.costUsd = r8(costUsd);
  if (!reply) return { ...res, status: "failed", reason: reason || "invalid_json", visionUnverified: true };
  res.status = "ok";
  res.visionUnverified = false;
  res.model = reply.model || models[0];
  res.pass = reply.value.pass;
  res.score = reply.value.score;
  res.findings = interpretVerdict(reply.value, shots, pc);
  return res;
}

module.exports = {
  QaCategory, VisionVerdict, STAGE, PROMPT_VERSION, SYSTEM_PROMPT, VISUAL_CATEGORIES,
  selectFrames, extractFrames, interpretVerdict, carryForward, runVision, buildUserParts, frameSize,
};
