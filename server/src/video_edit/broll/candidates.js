// VIDEO EDIT B-ROLL CANDIDATES — the route-facing view of scored candidates, and the editor's own search.
//
// WHY THIS EXISTS. `broll/candidates/<slotId>.json` is an engine file: it holds project-relative thumbnail
// and frame paths, raw detail blobs and scoring internals. The editor's Replace panel (API.md
// GET /:id/candidates, POST /:id/candidates/search) must never see a server path, so this module is the
// only reader routes use: it resolves a BrollItem id or a slot id to its candidate set, strips every
// local path, and hands out media KEYS (`broll-thumb` kind, key = assetId) that the media route resolves
// back through resolveThumbFile — which checks the key against the candidate files, never the URL path.
// A user search goes through the same retrieval (search.searchStock) and scoring (score.scoreSlots: prior,
// thumbnails, contact sheet, optional judge, ≤ 8 results) as the pipeline, and is persisted as a user slot
// `us_<hash>` so the Replace panel can reopen it without refetching. The pipeline's
// `analysis/broll_scored.json` is never touched by a user search (its summary goes to
// `broll/user_searches/<slotId>.json`). Per-user rate limits live in routes; pass `rateLimit` to run one first.
//
// CONTRACT:
//   listCandidates(project, slotIdOrItemId, { projectDir?, plan?, limit=20 })
//     -> { slotId, sentenceId, judge, judgeReason, bestAssetId, queries, candidates:[CandidateView] }   (EditError NOT_FOUND 404)
//     CandidateView = { id, provider, type, durationSec, w, h, thumbKey|null, previewUrl|null, sourceUrl|null,
//       author:{name,url}|null, license, attribution, letter|null, score:{ total, lexical, judgeRelevance, quality, fit },
//       issues, accepted, acceptedByIntensity, blocked, used }
//   searchCandidates(project, { query, kind='video', itemId?, judge=true, needSec? },
//                    { projectDir?, plan?, settings, fetch?, callJson?, signal?, tracker?, keys?, cache?, output?, lang?,
//                      sentenceText?, rateLimit?, judgeBlockedReason?, pidFile?, log?, now? })
//     -> { slotId, itemId, query, kind, judge, costUsd, providers:{name:status}, notices, candidates:[CandidateView] }
//   resolveThumbFile(project, key, { projectDir? }) -> { rel, contentType } | null
//   USER_SLOTS_REL · userSummaryRel(slotId) · KEY_RE

const fs = require("node:fs");
const path = require("node:path");
const fsx = require("../fsx");
const { EditError } = require("../errors");
const { isPlain, num, round, sha1, safeSlotId } = require("./common");

const KEY_RE = /^[a-z0-9_.-]{1,64}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const USER_SLOTS_REL = "broll/user_slots.json";
const CANDIDATES_DIR = "broll/candidates";
const userSummaryRel = (slotId) => `broll/user_searches/${slotId}.json`;
const candidatesRel = (slotId) => `${CANDIDATES_DIR}/${slotId}.json`;
const MAX_USER_SLOTS = 100;
const CONTENT_TYPES = Object.freeze({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" });

const httpsUrl = (v) => (typeof v === "string" && v.length <= 2048 && /^https:\/\/[^\s]+$/i.test(v) ? v : null);
const stripCtl = (s) => Array.from(s, (ch) => { const c = ch.codePointAt(0); return c < 32 || c === 127 || c === 8232 || c === 8233 ? " " : ch; }).join("");
const text = (v, max) => (typeof v === "string" && v.trim() ? stripCtl(v).trim().slice(0, max) : null);

function notFound(detail) { return new EditError("NOT_FOUND", { status: 404, errorClass: "input", detail }); }

function dirOf(project, opts) {
  const d = (opts && opts.projectDir) || (project && project.projectDir);
  if (typeof d !== "string" || !d) throw new EditError("BROLL_CANDIDATES_BAD_REQUEST", { errorClass: "bug", detail: "projectDir required" });
  return d;
}

function readDoc(projectDir, slotId) {
  let abs;
  try { abs = fsx.resolveInside(projectDir, candidatesRel(slotId)); } catch { return null; }
  const r = fsx.readJsonSafe(abs);
  return r.ok && isPlain(r.value) && Array.isArray(r.value.candidates) ? r.value : null;
}

function resolveSlot(projectDir, id, plan) {
  const s = String(id == null ? "" : id);
  if (!ID_RE.test(s)) throw notFound("bad id");
  const direct = readDoc(projectDir, s);
  if (direct) return { slotId: s, doc: direct, item: null };
  const item = isPlain(plan) && Array.isArray(plan.broll) ? plan.broll.find((b) => isPlain(b) && b.id === s) : null;
  if (item) {
    for (const cand of [item.candidateSetId, item.sentenceId != null ? `sl_${item.sentenceId}` : null]) {
      const sid = cand ? safeSlotId(cand) : null;
      const doc = sid ? readDoc(projectDir, sid) : null;
      if (doc) return { slotId: sid, doc, item };
    }
  }
  throw notFound("no candidates");
}

function usedAssetIds(plan) {
  const used = new Set();
  for (const b of isPlain(plan) && Array.isArray(plan.broll) ? plan.broll : []) {
    if (isPlain(b) && b.status !== "removed" && isPlain(b.chosen) && b.chosen.assetId) used.add(b.chosen.assetId);
  }
  return used;
}

function smallestLink(renditions) {
  const list = (Array.isArray(renditions) ? renditions : []).filter((r) => isPlain(r) && httpsUrl(r.link || r.url));
  list.sort((a, b) => ((num(a.width) || 1e9) * (num(a.height) || 1e9)) - ((num(b.width) || 1e9) * (num(b.height) || 1e9)));
  return list.length ? httpsUrl(list[0].link || list[0].url) : null;
}

function viewOf(ref, detail, used) {
  const s = isPlain(ref.scores) ? ref.scores : {};
  const det = isPlain(detail) ? detail : {};
  const fitParts = [s.resolution, s.aspect, s.duration].map(num).filter((x) => x != null);
  const author = isPlain(det.author) && (det.author.name || det.author.url)
    ? { name: text(det.author.name, 120), url: httpsUrl(det.author.url) } : null;
  return {
    id: ref.assetId,
    provider: ref.provider,
    type: ref.type,
    durationSec: num(ref.durationSec),
    w: num(ref.width) || 0,
    h: num(ref.height) || 0,
    thumbKey: ref.thumbPath && KEY_RE.test(String(ref.assetId)) ? ref.assetId : null,
    previewUrl: ref.type === "video" ? smallestLink(det.renditions) : null,
    sourceUrl: httpsUrl(ref.sourceUrl),
    author,
    license: text(ref.license, 120) || "",
    attribution: text(ref.attribution, 300),
    letter: typeof det.letter === "string" ? det.letter.slice(0, 2) : null,
    score: {
      total: num(s.total) == null ? null : round(num(s.total), 3),
      lexical: num(s.lexical) == null ? null : round(num(s.lexical), 3),
      judgeRelevance: num(s.judgeRelevance),
      quality: num(s.judgeQuality),
      fit: fitParts.length ? round(fitParts.reduce((a, b) => a + b, 0) / fitParts.length, 3) : null,
    },
    issues: Array.isArray(s.issues) ? s.issues.filter((x) => typeof x === "string").slice(0, 12) : [],
    accepted: !!det.accepted,
    acceptedByIntensity: isPlain(det.acceptedByIntensity) ? { low: !!det.acceptedByIntensity.low, medium: !!det.acceptedByIntensity.medium, high: !!det.acceptedByIntensity.high } : null,
    blocked: typeof det.blocked === "string" ? det.blocked.slice(0, 40) : null,
    used: used.has(ref.assetId),
  };
}

function listCandidates(project, slotIdOrItemId, opts = {}) {
  const projectDir = dirOf(project, opts);
  const { slotId, doc } = resolveSlot(projectDir, slotIdOrItemId, opts.plan);
  const limit = Math.max(1, Math.min(20, Math.floor(num(opts.limit) || 20)));
  const used = usedAssetIds(opts.plan);
  const details = isPlain(doc.details) ? doc.details : {};
  const candidates = doc.candidates
    .filter((c) => isPlain(c) && typeof c.assetId === "string")
    .slice(0, limit)
    .map((c) => viewOf(c, details[c.assetId], used));
  return {
    slotId,
    sentenceId: doc.sentenceId == null ? null : String(doc.sentenceId).slice(0, 64),
    judge: doc.judge === "ok" ? "ok" : "unavailable",
    judgeReason: typeof doc.judgeReason === "string" ? doc.judgeReason.slice(0, 40) : null,
    bestAssetId: typeof doc.bestAssetId === "string" ? doc.bestAssetId : null,
    queries: (Array.isArray(doc.queries) ? doc.queries : []).map((q) => (isPlain(q) ? q.text : q)).filter((q) => typeof q === "string").slice(0, 4),
    candidates,
  };
}

function resolveThumbFile(project, key, opts = {}) {
  const projectDir = dirOf(project, opts);
  if (typeof key !== "string" || !KEY_RE.test(key)) return null;
  let dir;
  try { dir = fsx.resolveInside(projectDir, CANDIDATES_DIR); } catch { return null; }
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.json$/i.test(f)).sort(); } catch { return null; }
  for (const f of files) {
    const r = fsx.readJsonSafe(path.join(dir, f));
    const cands = r.ok && isPlain(r.value) && Array.isArray(r.value.candidates) ? r.value.candidates : [];
    const hit = cands.find((c) => isPlain(c) && c.assetId === key && typeof c.thumbPath === "string");
    if (!hit) continue;
    const rel = hit.thumbPath.replace(/\\/g, "/");
    if (!/^broll\/thumbs\/[A-Za-z0-9_\-/.]+$/.test(rel) || rel.includes("..")) return null;
    let abs;
    try { abs = fsx.resolveInside(projectDir, rel); } catch { return null; }
    try { if (!fs.statSync(abs).isFile()) return null; } catch { return null; }
    const contentType = CONTENT_TYPES[path.extname(rel).toLowerCase()];
    return contentType ? { rel, contentType } : null;
  }
  return null;
}

function writeRel(projectDir, rel, obj) {
  const abs = fsx.resolveInside(projectDir, rel);
  fsx.ensureDir(path.dirname(abs));
  fsx.writeJsonAtomic(abs, obj);
  return rel;
}

async function searchCandidates(project, request = {}, opts = {}) {
  const projectDir = dirOf(project, opts);
  const req = isPlain(request) ? request : {};
  const kind = req.kind == null ? "video" : req.kind;
  const itemId = req.itemId == null ? null : String(req.itemId);
  if (itemId != null && !ID_RE.test(itemId)) {
    throw new EditError("VALIDATION_FAILED", { status: 422, errorClass: "input", detail: "bad itemId", extra: { field: "itemId" } });
  }
  const search = require("./search");
  const score = require("./score");
  if (typeof opts.rateLimit === "function") await opts.rateLimit({ projectId: project && project.id, query: req.query, kind });

  const output = isPlain(opts.output) ? opts.output : require("../engine/handlers/phase5").outputGeometry(project);
  const res = await search.searchStock({
    query: req.query, kind, output, page: 1, settings: opts.settings, signal: opts.signal, fetch: opts.fetch,
    tracker: opts.tracker, keys: opts.keys, cache: opts.cache, project,
  });
  const plan = opts.plan;
  const item = itemId && isPlain(plan) && Array.isArray(plan.broll) ? plan.broll.find((b) => isPlain(b) && b.id === itemId) : null;
  const slotId = safeSlotId(`us_${sha1(`${itemId || ""}|${res.query.toLowerCase()}|${kind}`).slice(0, 12)}`);
  const resolvedSec = item && isPlain(item.resolved) ? num(item.resolved.outOut) - num(item.resolved.outIn) : null;
  const slot = {
    slotId, sentenceId: item && item.sentenceId != null ? String(item.sentenceId) : null, rank: 0,
    queries: [res.query], mediaPreference: kind, text: text(opts.sentenceText, 300) || res.query,
    clipNeedSec: num(req.needSec) > 0 ? num(req.needSec) : (resolvedSec > 0 ? Math.min(8, resolvedSec) : 3),
    keywords: [], avoid: [],
  };
  writeRel(projectDir, `analysis/broll_raw/${slotId}.json`, {
    schemaVersion: 1, stage: "USER_SEARCH", slotId, sentenceId: slot.sentenceId, queries: slot.queries, kind,
    items: res.items, counts: res.counts, searchedAt: typeof opts.now === "function" ? opts.now() : Date.now(),
  });

  const judgeRequested = req.judge !== false;
  const scored = await score.scoreSlots({
    slots: [slot], candidatesBySlot: { [slotId]: res.items }, projectDir, output,
    projectSettings: project && isPlain(project.settings) ? project.settings : {},
    lang: typeof opts.lang === "string" ? opts.lang : "en",
    fetch: opts.fetch || null, callJson: opts.callJson || null, signal: opts.signal || null, tracker: opts.tracker || null,
    settings: opts.settings || null, pidFile: opts.pidFile, log: opts.log,
    cacheDir: fsx.resolveInside(projectDir, "analysis/llm-cache"),
    judgeBlockedReason: judgeRequested ? (opts.judgeBlockedReason || null) : "not_requested",
    writeJson: async (rel, obj) => writeRel(projectDir, rel === score.SCORED_REL ? userSummaryRel(slotId) : rel, obj),
    now: opts.now,
  });

  let index = [];
  try {
    const r = fsx.readJsonSafe(fsx.resolveInside(projectDir, USER_SLOTS_REL));
    index = r.ok && isPlain(r.value) && Array.isArray(r.value.slots) ? r.value.slots : [];
  } catch { index = []; }
  index = index.filter((e) => isPlain(e) && e.slotId !== slotId);
  index.push({ slotId, itemId, query: res.query, kind, judge: scored.judge, createdAt: typeof opts.now === "function" ? opts.now() : Date.now(), candidates: candidatesRel(slotId) });
  writeRel(projectDir, USER_SLOTS_REL, { schemaVersion: 1, slots: index.slice(-MAX_USER_SLOTS) });

  const notices = [...res.notices, ...scored.notices]
    .filter((n) => judgeRequested || n.code !== "BROLL_JUDGE_UNAVAILABLE")
    .map((n) => ({ code: n.code, severity: n.severity === "warn" ? "warn" : "info", message: n.message || null }));
  const listed = listCandidates(project, slotId, { projectDir, plan, limit: 8 });
  return {
    slotId, itemId, query: res.query, kind, judge: scored.judge, costUsd: scored.costUsd,
    providers: Object.fromEntries(Object.entries(res.providers || {}).map(([k, v]) => [k, v && v.status])),
    notices, candidates: listed.candidates,
  };
}

module.exports = { listCandidates, searchCandidates, resolveThumbFile, USER_SLOTS_REL, userSummaryRel, KEY_RE };
