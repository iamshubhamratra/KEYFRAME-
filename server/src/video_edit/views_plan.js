// VIDEO EDIT PLAN VIEWS — the only shapes of an Edit Plan, its history, the transcript and B-roll candidates that
// leave the server (API.md GET /:id/plan, /plan/revisions, /transcript, /candidates, POST /:id/ops responses).
//
// WHY THIS EXISTS. A plan revision is an engine record: AssetRefs carry project-relative file paths and dHashes,
// graphics carry card render paths and hashes, the timeline carries sha1 chunk keys, the source carries the
// upload's sha1 and the director's prompt hash, QA findings carry free-text detail. The editor needs none of it,
// and a "plan minus a few fields" serializer would leak whatever the next phase adds. The plan schema is closed
// (zod `.strict()` at every level, EDIT_PLAN.md §2), so this projection walks it and DROPS every key that is a
// path, a hash, a font file, provider tags or diagnostics — by exact name AND by suffix (`…Path`, `…Hash`,
// `sha…`), so a future `previewPath` / `audioHash` is stripped by construction — then REPLACES what the editor
// does need by route URLs: a B-roll asset with a thumbnail gets `thumbUrl` (`media/broll-thumb/<assetId>`, served
// through broll/candidates.resolveThumbFile which re-checks the key against the candidate files) and a
// `downloaded` flag; a card render gets `ready`. The source block and op/QA lists are whitelisted and capped.
//
// CONTRACT (pure; no I/O):
//   toPlanView(plan, { projectId, basePath }) -> PlanView
//   outlineView(plan) -> outline(plan) (EDIT_PLAN.md §7), sanitized
//   planEnvelope(revisionDoc, { projectId, basePath, head, history }) ->
//     { revision, hash, parent, author, summary, opsCount, createdAt, isHead, canUndo, canRedo, undoLabel, redoLabel, outline, plan }
//   revisionsView(project, { limit=200 }) -> { head, headHash, revisions:[{ rev, hash, parent, author, opsCount, summary, createdAt }]
//     newest first, canUndo, canRedo, undoLabel, redoLabel }
//   transcriptView({ words, sentences, language, timing, plan, planRevision, offset=0, limit=2000 }) ->
//     { language, timing, planRevision, totalWords, offset, limit, nextOffset,
//       words:[{ i, text, start, end, conf, isFiller, fillerKind, sentenceId, cut, cutId, cutKind, hidden }],
//       sentences:[{ id, w0, w1, start, end, text, cut:'none'|'partial'|'full' }] (those overlapping the page) }
//     cut state = the head plan's EFFECTIVE cuts (settings switches + timeline suppression), word midpoint inside the cut.
//   candidateListView(listResult, { projectId, basePath }) -> { slotId, sentenceId, judge, judgeReason, bestAssetId, queries, candidates }
//   eventListView(warningsOrCostEvents, { max=50 }) -> flat, path-free entries · invalidatesView(inv) · costSummary(costEvents)
//   historyFields(project) -> { canUndo, canRedo, undoLabel, redoLabel }
//   DROP_KEY_RE · TRANSCRIPT_PAGE_MAX

const T = require("./plan/timeline");
const { outline } = require("./plan/outline");
const { historyView } = require("./plan/revisions");

const TRANSCRIPT_PAGE_MAX = 2000;
const KEY_RE = /^[a-z0-9_.-]{1,64}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const LEVELS = ["NONE", "AUDIO", "COMPOSITE", "BASE", "SHIFT"];
// Exact names plus the `…Path` / `…Hash` / `sha…` families. `file` and `detail` are engine diagnostics.
// Provider URLs (`sourceUrl`, `previewUrl`, `downloadUrl`, `url`) are dropped from the PLAN view on purpose:
// the editor shows `attribution` text and the `thumbUrl` this function mints, while the clickable provider
// links belong to `candidateListView` and the credits file. `thumbUrl` is added after this filter runs.
const DROP_KEY_RE = /^(?:path|hash|sha1|sha256|ttf|dhash|tags|chunkKey|analysisVersion|file|detail|stderr|sourceUrl|previewUrl|downloadUrl|url)$|Path$|Hash$|^sha[0-9A-Z_]/;
const PATH_LIKE_RE = /^[A-Za-z]:[\\/]|\\|^\/|(?:^|\/)(?:assets|analysis|broll|render|work|source|plan|edits|logs)\//;
const EVENT_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;
const SOURCE_KEYS = Object.freeze(["durationSec", "fps", "width", "height", "timing", "language"]);
const PROVENANCE_OPS_MAX = 200;

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const int = (v) => (Number.isInteger(v) ? v : null);
const text = (v, max) => (typeof v === "string" && v.length ? v.slice(0, max) : null);
const hex64 = (v) => (typeof v === "string" && HEX64_RE.test(v) ? v : null);
const https = (v) => (typeof v === "string" && v.length <= 2048 && /^https:\/\/[^\s]+$/i.test(v) ? v : null);

// ---------------------------------------------------------------- plan
function sanitize(v, ctx, key) {
  if (Array.isArray(v)) return v.map((x) => sanitize(x, ctx, key)).filter((x) => x !== undefined);
  if (!isPlain(v)) return typeof v === "number" && !Number.isFinite(v) ? null : v;
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (DROP_KEY_RE.test(k)) continue;
    const y = sanitize(x, ctx, k);
    if (y !== undefined) out[k] = y;
  }
  const hasPath = Object.prototype.hasOwnProperty.call(v, "path");
  if (typeof v.assetId === "string" && Object.prototype.hasOwnProperty.call(v, "thumbPath")) {
    out.thumbUrl = ctx && typeof v.thumbPath === "string" && v.thumbPath && KEY_RE.test(v.assetId)
      ? `${ctx.basePath}/${ctx.projectId}/media/broll-thumb/${v.assetId}` : null;
    out.downloaded = typeof v.path === "string" && v.path.length > 0;
  } else if (hasPath && typeof v.assetId === "string") {
    out.downloaded = typeof v.path === "string" && v.path.length > 0;
  } else if (key === "render" && hasPath) {
    out.ready = v.status === "ok" && typeof v.path === "string" && v.path.length > 0;
  }
  return out;
}

function toPlanView(plan, { projectId = null, basePath = "/api/video-edits" } = {}) {
  if (!isPlain(plan)) return null;
  const ctx = { projectId: typeof projectId === "string" ? projectId : plan.projectId, basePath };
  const view = sanitize(plan, ctx, null);
  const src = isPlain(plan.source) ? plan.source : {};
  view.source = Object.fromEntries(SOURCE_KEYS.filter((k) => src[k] !== undefined).map((k) => [k, src[k]]));
  if (isPlain(view.provenance) && Array.isArray(view.provenance.ops)) view.provenance.ops = view.provenance.ops.slice(-PROVENANCE_OPS_MAX);
  if (isPlain(view.qa) && Array.isArray(view.qa.findings)) view.qa.findings = view.qa.findings.slice(0, 100);
  return view;
}

function outlineView(plan) {
  if (!isPlain(plan)) return null;
  return sanitize(outline(plan), null, null);
}

function historyFields(project) {
  const h = historyView(project || {});
  return { canUndo: !!h.canUndo, canRedo: !!h.canRedo, undoLabel: text(h.undoLabel, 160), redoLabel: text(h.redoLabel, 160) };
}

function planEnvelope(doc, { projectId, basePath, head = null, history = null } = {}) {
  const d = isPlain(doc) ? doc : {};
  const h = isPlain(history) ? history : { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null };
  return {
    revision: int(d.rev),
    hash: hex64(d.hash),
    parent: int(d.parent),
    author: text(d.author, 32),
    summary: text(d.summary, 200),
    opsCount: int(d.opsCount) != null && d.opsCount >= 0 ? d.opsCount : 0,
    createdAt: num(d.createdAt),
    isHead: head != null && d.rev === head,
    canUndo: !!h.canUndo, canRedo: !!h.canRedo, undoLabel: text(h.undoLabel, 160), redoLabel: text(h.redoLabel, 160),
    outline: outlineView(d.plan),
    plan: toPlanView(d.plan, { projectId, basePath }),
  };
}

function revisionsView(project, { limit = 200 } = {}) {
  const p = isPlain(project) ? project : {};
  const pl = isPlain(p.plan) ? p.plan : {};
  const list = Array.isArray(pl.revisions) ? pl.revisions : [];
  const revisions = list.filter((r) => isPlain(r) && Number.isInteger(r.rev) && r.rev > 0).slice(-Math.max(1, limit)).reverse().map((r) => ({
    rev: r.rev,
    hash: hex64(r.hash),
    parent: int(r.parent),
    author: text(r.author, 32),
    opsCount: int(r.opsCount) != null && r.opsCount >= 0 ? r.opsCount : 0,
    summary: text(r.summary, 200),
    createdAt: num(r.createdAt),
  }));
  return { head: int(pl.headRevision) || 0, headHash: hex64(pl.headHash), revisions, ...historyFields(p) };
}

// ---------------------------------------------------------------- transcript
function effectiveCuts(plan) {
  if (!isPlain(plan) || !Array.isArray(plan.cuts)) return [];
  const settings = plan.settings || {};
  const adjustments = (plan.provenance && plan.provenance.rhythm && Array.isArray(plan.provenance.rhythm.adjustments)) ? plan.provenance.rhythm.adjustments : [];
  const suppressed = new Set(adjustments.filter((a) => a && T.TIMELINE_RULES.includes(a.rule) && a.action === "disabled").map((a) => a.elementId));
  return plan.cuts
    .filter((c) => isPlain(c) && T.isEffective(c, settings) && !suppressed.has(c.id) && Number.isFinite(c.srcIn) && Number.isFinite(c.srcOut))
    .map((c) => ({ id: c.id, kind: c.kind, a: c.srcIn, b: c.srcOut }))
    .sort((x, y) => x.a - y.a || x.b - y.b);
}

function transcriptView({ words = [], sentences = [], language = null, timing = "word", plan = null, planRevision = 0, offset = 0, limit = TRANSCRIPT_PAGE_MAX } = {}) {
  const list = Array.isArray(words) ? words : [];
  const cuts = effectiveCuts(plan);
  const hidden = new Set(isPlain(plan) && plan.captions && plan.captions.overrides && Array.isArray(plan.captions.overrides.hiddenWords) ? plan.captions.overrides.hiddenWords : []);
  // Words are time-ordered and cuts sorted: one forward pass (a cut may span many words).
  const cutOf = new Array(list.length).fill(null);
  let k = 0;
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    if (!isPlain(w) || !Number.isFinite(w.start) || !Number.isFinite(w.end)) continue;
    const mid = (w.start + w.end) / 2;
    while (k < cuts.length && cuts[k].b < mid) k++;
    for (let j = k; j < cuts.length && cuts[j].a <= mid; j++) {
      if (cuts[j].b >= mid) { cutOf[i] = cuts[j]; break; }
    }
  }
  const off = Math.max(0, Math.min(list.length, Number.isInteger(offset) ? offset : 0));
  const lim = Math.max(1, Math.min(TRANSCRIPT_PAGE_MAX, Number.isInteger(limit) ? limit : TRANSCRIPT_PAGE_MAX));
  const end = Math.min(list.length, off + lim);
  const pageWords = [];
  for (let i = off; i < end; i++) {
    const w = isPlain(list[i]) ? list[i] : {};
    const c = cutOf[i];
    pageWords.push({
      i,
      text: text(w.text, 64) || "",
      start: num(w.start),
      end: num(w.end),
      conf: num(w.conf),
      isFiller: w.isFiller === true,
      fillerKind: w.fillerKind === "discourse" || w.fillerKind === "pure" ? w.fillerKind : null,
      sentenceId: typeof w.sentenceId === "string" ? w.sentenceId.slice(0, 32) : null,
      cut: !!c,
      cutId: c ? String(c.id).slice(0, 48) : null,
      cutKind: c ? String(c.kind).slice(0, 16) : null,
      hidden: hidden.has(i),
    });
  }
  const sentenceViews = (Array.isArray(sentences) ? sentences : [])
    .filter((s) => isPlain(s) && typeof s.id === "string" && Number.isInteger(s.w0) && Number.isInteger(s.w1) && s.w1 >= off && s.w0 < end)
    .map((s) => {
      let n = 0, total = 0;
      for (let i = Math.max(0, s.w0); i <= s.w1 && i < list.length; i++) { total++; if (cutOf[i]) n++; }
      return {
        id: s.id.slice(0, 32), w0: s.w0, w1: s.w1, start: num(s.start), end: num(s.end), text: text(s.text, 2000) || "",
        cut: n === 0 ? "none" : n === total ? "full" : "partial",
      };
    });
  return {
    language: typeof language === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(language) ? language : null,
    timing: timing === "approx" ? "approx" : "word",
    planRevision: int(planRevision) || 0,
    totalWords: list.length,
    offset: off,
    limit: lim,
    nextOffset: end < list.length ? end : null,
    words: pageWords,
    sentences: sentenceViews,
  };
}

// ---------------------------------------------------------------- candidates
function candidateListView(r, { projectId, basePath = "/api/video-edits" } = {}) {
  const x = isPlain(r) ? r : {};
  const media = `${basePath}/${projectId}/media/broll-thumb/`;
  const candidates = (Array.isArray(x.candidates) ? x.candidates : []).filter(isPlain).slice(0, 20).map((c) => {
    const s = isPlain(c.score) ? c.score : {};
    const a = isPlain(c.author) ? c.author : null;
    const abi = isPlain(c.acceptedByIntensity) ? c.acceptedByIntensity : null;
    return {
      id: text(c.id, 64),
      provider: text(c.provider, 24),
      type: c.type === "image" ? "image" : "video",
      durationSec: num(c.durationSec),
      w: num(c.w) || 0,
      h: num(c.h) || 0,
      thumbUrl: typeof c.thumbKey === "string" && KEY_RE.test(c.thumbKey) ? `${media}${c.thumbKey}` : null,
      previewUrl: https(c.previewUrl),
      author: a && (a.name || a.url) ? { name: text(a.name, 120), url: https(a.url) } : null,
      license: text(c.license, 120) || "",
      attribution: text(c.attribution, 300),
      score: { total: num(s.total), lexical: num(s.lexical), judgeRelevance: num(s.judgeRelevance), quality: num(s.quality), fit: num(s.fit) },
      issues: Array.isArray(c.issues) ? c.issues.filter((i) => typeof i === "string").slice(0, 12).map((i) => i.slice(0, 24)) : [],
      accepted: !!c.accepted,
      acceptedByIntensity: abi ? { low: !!abi.low, medium: !!abi.medium, high: !!abi.high } : null,
      blocked: text(c.blocked, 40),
      used: !!c.used,
    };
  });
  return {
    slotId: text(x.slotId, 64),
    sentenceId: text(x.sentenceId, 64),
    judge: x.judge === "ok" ? "ok" : "unavailable",
    judgeReason: text(x.judgeReason, 40),
    bestAssetId: text(x.bestAssetId, 64),
    queries: (Array.isArray(x.queries) ? x.queries : []).filter((q) => typeof q === "string").slice(0, 4).map((q) => q.slice(0, 80)),
    candidates,
  };
}

// ---------------------------------------------------------------- op results
function scalar(v) {
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") return PATH_LIKE_RE.test(v) ? undefined : v.slice(0, 200);
  return undefined;
}

function eventListView(list, { max = 50 } = {}) {
  return (Array.isArray(list) ? list : []).filter(isPlain).slice(0, max).map((e) => {
    const out = {};
    for (const [k, v] of Object.entries(e)) {
      if (!EVENT_KEY_RE.test(k) || DROP_KEY_RE.test(k)) continue;
      if (Array.isArray(v)) {
        const arr = v.map(scalar).filter((x) => x !== undefined && x !== null && typeof x !== "boolean").slice(0, 50);
        out[k] = arr;
        continue;
      }
      const s = scalar(v);
      if (s !== undefined) out[k] = s;
    }
    return out;
  });
}

function invalidatesView(inv) {
  const x = isPlain(inv) ? inv : {};
  const level = LEVELS.includes(x.level) ? x.level : "NONE";
  const ranges = (Array.isArray(x.ranges) ? x.ranges : [])
    .filter((r) => Array.isArray(r) && r.length === 2 && num(r[0]) != null && num(r[1]) != null)
    .slice(0, 200).map((r) => [r[0], r[1]]);
  const out = { level, ranges: level === "NONE" ? [] : ranges };
  if (x.estimated === true) out.estimated = true;
  return out;
}

function costSummary(costEvents) {
  const list = Array.isArray(costEvents) ? costEvents.filter(isPlain) : [];
  return { aiCalls: list.filter((c) => c.net === "ai").length, fetches: list.filter((c) => c.net === "fetch").length };
}

module.exports = {
  toPlanView, outlineView, planEnvelope, revisionsView, transcriptView, candidateListView, eventListView, invalidatesView,
  costSummary, historyFields, DROP_KEY_RE, TRANSCRIPT_PAGE_MAX,
};
