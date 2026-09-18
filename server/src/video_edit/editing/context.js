// VIDEO EDIT EDITING CONTEXT — analysis artifacts -> the `ctx` the ops engine, re-plans and transcript view read.
//
// WHY THIS EXISTS. An op is validated against the transcript (caption re-timing, cut.add word ranges), the RMS
// envelope (cut snapping), the face track (framing, jump-cut punch-ins), the content analysis (protected
// sentences, B-roll queries), the scored B-roll slots (intensity re-plans attach prefetched candidates without a
// network call) and the stored candidate lists (broll.replace picks from them). Those files are written by the
// analysis stages (ANALYSIS.md §4.5–§8) and never change between two edits, while ops arrive up to 120 times a
// minute — so they are read once per artifact version (mtime + size signature) and shared read-only. Every read
// is optional: a project that continued without a transcript, vision or B-roll still edits, and a damaged
// artifact degrades to "absent" with a logged code instead of failing the request.
//
// CONTRACT:
//   createContextLoader({ store, log, maxEntries=4 }) -> {
//     load(project, { plan=null, ops=null }) -> ctx
//       ctx = { words, sentences, transcriptMeta, language, timing, faces, content, audio, envelope, scenes, shaky, mezz,
//               brollSlots, candidates:{ [itemId]: AssetRef-like[] }, assets:{ [assetId]: { kind:'logo', path } },
//               available:{ transcript, faces, content, broll } }
//       candidates are loaded only for broll.replace / broll.regenerate items named by `ops` (from the item's candidate
//       set, its sentence slot `sl_<sentenceId>` and the user searches for that item in broll/user_slots.json).
//     transcript(project) -> { available, words, sentences, language, timing, meta }
//     forget(projectId)
//   }
//   candidateItemIds(ops) -> string[] · ARTIFACTS
// Treat returned arrays as read-only: they are cached across requests.

const fs = require("node:fs");
const fsx = require("../fsx");

const ARTIFACTS = Object.freeze({
  transcript: "analysis/transcript.json",
  words: "analysis/transcript.words.json",
  faces: "analysis/faces.json",
  content: "analysis/content.json",
  audio: "analysis/audio.json",
  envelope: "analysis/rms.f32",
  video: "analysis/video.json",
  brollScored: "analysis/broll_scored.json",
  userSlots: "broll/user_slots.json",
});
const BASE_KEYS = Object.freeze(["transcript", "words", "faces", "content", "audio", "envelope", "video", "brollScored"]);
const SLOT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const BROLL_ID_RE = /^br_[A-Za-z0-9_-]{1,40}$/;
const CANDIDATE_OPS = Object.freeze(["broll.replace", "broll.regenerate"]);
const MAX_CANDIDATES_PER_ITEM = 60;
const MAX_ENVELOPE_BYTES = 64 * 1024 * 1024;

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function candidateItemIds(ops) {
  const out = [];
  for (const op of Array.isArray(ops) ? ops : []) {
    if (!isPlain(op) || !CANDIDATE_OPS.includes(op.type)) continue;
    const body = isPlain(op.payload) ? op.payload : op;
    if (typeof body.id === "string" && BROLL_ID_RE.test(body.id) && !out.includes(body.id)) out.push(body.id);
  }
  return out.slice(0, 100);
}

function normalizeWords(rawWords, sentences, fillerCandidates) {
  const list = Array.isArray(rawWords) ? rawWords : [];
  const sentenceOf = new Map();
  for (const s of sentences) {
    if (!isPlain(s) || !Number.isInteger(s.w0) || !Number.isInteger(s.w1)) continue;
    for (let i = s.w0; i <= s.w1 && i < list.length; i++) if (!sentenceOf.has(i)) sentenceOf.set(i, s.id);
  }
  const fillers = new Map((Array.isArray(fillerCandidates) ? fillerCandidates : []).filter((f) => isPlain(f) && Number.isInteger(f.i)).map((f) => [f.i, f.kind === "discourse" ? "discourse" : "pure"]));
  return list.map((w, k) => {
    const x = isPlain(w) ? { ...w } : {};
    x.i = k;
    if (x.sentenceId == null && sentenceOf.has(k)) x.sentenceId = sentenceOf.get(k);
    if (x.isFiller === undefined) x.isFiller = fillers.has(k);
    if (x.fillerKind === undefined) x.fillerKind = fillers.has(k) ? fillers.get(k) : null;
    return x;
  });
}

function mezzOf(project) {
  const src = isPlain(project.source) ? project.source : {};
  const m = isPlain(src.mezzanine) ? src.mezzanine : null;
  if (m && m.width > 0 && m.height > 0) return { w: m.width, h: m.height };
  const rec = isPlain(project.stages) && isPlain(project.stages.COMPRESSING) ? project.stages.COMPRESSING : null;
  const out = rec && isPlain(rec.outputs) && isPlain(rec.outputs.mezz) ? rec.outputs.mezz : null;
  if (out && out.width > 0 && out.height > 0) return { w: out.width, h: out.height };
  return null;
}

// Uploaded assets an op may reference: the processed logo (POST /:id/logo, or the create-time logo once the
// plan/render phase has re-encoded it) — recorded in project.uploads.logo with status 'ready'.
function uploadedAssets(project) {
  const l = isPlain(project.uploads) && isPlain(project.uploads.logo) ? project.uploads.logo : null;
  if (!l || l.status !== "ready" || typeof l.assetId !== "string" || typeof l.path !== "string") return {};
  return { [l.assetId]: { kind: "logo", path: l.path, width: l.width || null, height: l.height || null } };
}

function createContextLoader({ store, log = console, maxEntries = 4 } = {}) {
  if (!store) throw new TypeError("video_edit/editing/context: store is required");
  const cache = new Map();   // projectId -> { sig, value }
  const say = (msg) => { try { (log.warn || log.log || console.warn).call(log, msg); } catch { /* noop */ } };

  function absOf(projectId, rel) {
    try { return store.abs(projectId, rel); } catch { return null; }
  }

  function statSig(abs) {
    if (!abs) return "x";
    try { const st = fs.statSync(abs); return `${Math.round(st.mtimeMs)}:${st.size}`; } catch { return "-"; }
  }

  function readJson(projectId, rel) {
    const abs = absOf(projectId, rel);
    if (!abs || !fs.existsSync(abs)) return null;
    const r = fsx.readJsonSafe(abs);
    if (!r.ok) { say(`[video-edit] artifact unreadable project=${projectId} artifact=${rel.split("/").pop()}`); return null; }
    return r.value;
  }

  function readEnvelope(projectId) {
    const abs = absOf(projectId, ARTIFACTS.envelope);
    if (!abs) return null;
    let buf;
    try {
      const st = fs.statSync(abs);
      if (!st.isFile() || st.size < 4 || st.size > MAX_ENVELOPE_BYTES) return null;
      buf = fs.readFileSync(abs);
    } catch { return null; }
    const out = new Float32Array(Math.floor(buf.length / 4));
    for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
    return out;
  }

  function build(projectId) {
    const t = readJson(projectId, ARTIFACTS.transcript);
    const wd = readJson(projectId, ARTIFACTS.words);
    const tr = isPlain(t) ? t : null;
    const wordsDoc = isPlain(wd) ? wd : null;
    const sentences = tr && Array.isArray(tr.sentences) ? tr.sentences.filter(isPlain) : [];
    const rawWords = tr && Array.isArray(tr.words) ? tr.words : wordsDoc && Array.isArray(wordsDoc.words) ? wordsDoc.words : [];
    const words = normalizeWords(rawWords, sentences, tr && tr.fillerCandidates);
    const transcriptMeta = tr ? {
      fillerCandidates: Array.isArray(tr.fillerCandidates) ? tr.fillerCandidates : [],
      repeatCandidates: Array.isArray(tr.repeatCandidates) ? tr.repeatCandidates : [],
      retakeCandidates: Array.isArray(tr.retakeCandidates) ? tr.retakeCandidates : [],
      ctaCandidates: Array.isArray(tr.ctaCandidates) ? tr.ctaCandidates : [],
    } : { fillerCandidates: [], repeatCandidates: [], retakeCandidates: [], ctaCandidates: [] };
    const video = readJson(projectId, ARTIFACTS.video);
    const faces = readJson(projectId, ARTIFACTS.faces);
    const content = readJson(projectId, ARTIFACTS.content);
    const scored = readJson(projectId, ARTIFACTS.brollScored);
    const audio = readJson(projectId, ARTIFACTS.audio);
    return {
      words, sentences, transcriptMeta,
      language: (tr && tr.language) || (wordsDoc && wordsDoc.language) || null,
      timing: (tr && tr.timing) || (wordsDoc && wordsDoc.timing) || "word",
      faces: isPlain(faces) ? faces : null,
      content: isPlain(content) ? content : null,
      audio: isPlain(audio) ? audio : null,
      envelope: readEnvelope(projectId),
      scenes: isPlain(video) && Array.isArray(video.scenes) ? video.scenes : [],
      shaky: isPlain(video) && Array.isArray(video.shaky) ? video.shaky : [],
      brollSlots: isPlain(scored) && Array.isArray(scored.slots) ? scored : null,
      available: { transcript: !!(tr || wordsDoc), faces: isPlain(faces), content: isPlain(content), broll: isPlain(scored) },
    };
  }

  function base(projectId) {
    const sig = BASE_KEYS.map((k) => statSig(absOf(projectId, ARTIFACTS[k]))).join("|");
    const hit = cache.get(projectId);
    if (hit && hit.sig === sig) {
      cache.delete(projectId);
      cache.set(projectId, hit);
      return hit.value;
    }
    const value = build(projectId);
    cache.set(projectId, { sig, value });
    while (cache.size > Math.max(1, maxEntries)) cache.delete(cache.keys().next().value);
    return value;
  }

  function loadCandidates(projectId, plan, itemIds) {
    const out = {};
    if (!itemIds.length || !isPlain(plan) || !Array.isArray(plan.broll)) return out;
    const userSlots = readJson(projectId, ARTIFACTS.userSlots);
    const userList = isPlain(userSlots) && Array.isArray(userSlots.slots) ? userSlots.slots.filter(isPlain) : [];
    for (const itemId of itemIds) {
      const item = plan.broll.find((b) => isPlain(b) && b.id === itemId);
      if (!item) continue;
      const slotIds = [item.candidateSetId, item.sentenceId != null ? `sl_${item.sentenceId}` : null, ...userList.filter((e) => e.itemId === itemId).map((e) => e.slotId)]
        .filter((s, k, arr) => typeof s === "string" && SLOT_ID_RE.test(s) && arr.indexOf(s) === k);
      const list = [];
      const seen = new Set();
      for (const slotId of slotIds) {
        const doc = readJson(projectId, `broll/candidates/${slotId}.json`);
        for (const c of isPlain(doc) && Array.isArray(doc.candidates) ? doc.candidates : []) {
          if (list.length >= MAX_CANDIDATES_PER_ITEM) break;
          if (!isPlain(c) || typeof c.assetId !== "string" || seen.has(c.assetId)) continue;
          seen.add(c.assetId);
          list.push(c);
        }
      }
      if (list.length) out[itemId] = list;
    }
    return out;
  }

  function load(project, { plan = null, ops = null } = {}) {
    if (!project || typeof project.id !== "string") throw new TypeError("video_edit/editing/context: project required");
    const b = base(project.id);
    return {
      ...b,
      mezz: mezzOf(project),
      candidates: loadCandidates(project.id, plan, candidateItemIds(ops)),
      assets: uploadedAssets(project),
    };
  }

  function transcript(project) {
    const b = base(project.id);
    return { available: b.available.transcript, words: b.words, sentences: b.sentences, language: b.language, timing: b.timing, meta: b.transcriptMeta };
  }

  function forget(projectId) { cache.delete(projectId); }

  return { load, transcript, forget };
}

module.exports = { createContextLoader, candidateItemIds, normalizeWords, ARTIFACTS };
