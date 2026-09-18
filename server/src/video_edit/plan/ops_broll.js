// VIDEO EDIT OPS — B-roll handlers (EDIT_PLAN.md §5 "B-roll").
//
// WHY THIS EXISTS. B-roll edits are the most frequent user corrections ("wrong clip", "not here",
// "smaller"), and several of them want the network (a new search, an undownloaded candidate, a
// judge pass). The ops engine must stay pure and answer within a request, so these handlers never
// fetch: they choose from the stored ranked candidates when they can, otherwise put the item in
// `status:'pending'` and emit a costEvent (`NEEDS_FETCH` / `NEEDS_AI`) the engine turns into a job.
// Removal is a tombstone (`status:'removed'`), so restore and undo are free and intensity re-plans
// can never resurrect what the user removed.
//
// CONTRACT: HANDLERS { broll.replace, broll.regenerate, broll.remove, broll.restore, broll.setLayout,
//   broll.setTiming, broll.add, broll.setLocked }
//   env.ctx.candidates?: { [itemId]: AssetRef[] }  — the full stored candidate list (broll/candidates/<id>.json)
//   env.ctx.assets?:     { [assetId]: { kind:'broll'|'logo'|'music', ref?:AssetRef, path? } } — uploaded assets
//   candidateId matches AssetRef.assetId, `${provider}:${providerId}` or an `id` field on the stored entry.
//   broll.setLocked does NOT set userModified (locking is ownership, not an edit; unlocking re-enables re-plans).
//   broll.regenerate (no query) walks the stored ranking once: item.seenCandidates records every asset it has shown,
//   and only when no unseen, unused candidate is left does it go pending + NEEDS_FETCH search_broll.

const { z } = require("zod");
const { AssetRefSchema, ENUMS } = require("./schema");
const U = require("./ops_util");

const BrollId = z.string().regex(/^br_[A-Za-z0-9_-]{1,40}$/);
const Offset = z.number().finite().min(-2).max(2);
const ASSET_KEYS = Object.keys(AssetRefSchema.shape);
const STOP = new Set(["the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for", "with", "at", "by", "it", "is", "was",
  "this", "that", "i", "you", "we", "they", "my", "your", "our", "so", "um", "uh", "like", "just", "then", "them", "for"]);

const SEEN_CAP = 64;
const liveItem = (b) => b.status !== "removed" && b.status !== "missing";
const levelFor = (...layouts) => (layouts.includes("SPLIT") ? "BASE" : "COMPOSITE");
const pickAsset = (c) => Object.fromEntries(ASSET_KEYS.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]));

function notRemoved(item) { if (item.status === "removed") U.reject(`B-roll '${item.id}' is removed; restore it first`); }

function storedCandidates(env, item) {
  const extra = env.ctx.candidates && Array.isArray(env.ctx.candidates[item.id]) ? env.ctx.candidates[item.id] : [];
  const seen = new Set();
  const out = [];
  for (const c of [...item.topCandidates, ...extra]) {
    if (!c || typeof c.assetId !== "string" || seen.has(c.assetId)) continue;
    seen.add(c.assetId);
    out.push(c);
  }
  return out;
}

const matches = (c, id) => c.assetId === id || c.id === id || `${c.provider}:${c.providerId}` === id;

function validAsset(c) {
  const parsed = AssetRefSchema.safeParse(pickAsset(c));
  if (!parsed.success) U.reject("the candidate record is incomplete");
  return parsed.data;
}

function slotSec(env, item) {
  const d = env.derived().broll.find((b) => b.id === item.id);
  if (d && d.resolved && !d.resolved.collapsed) return d.resolved.outOut - d.resolved.outIn;
  const r = env.timeMap().resolveAnchor(item.anchor, env.words, { minDur: 0.4 });
  return r.outOut - r.outIn;
}

function choose(env, item, asset) {
  item.chosen = asset;
  item.status = asset.path ? "ok" : "pending";
  if (!asset.path) env.cost({ code: "NEEDS_FETCH", job: "download_broll", elementId: item.id, assetId: asset.assetId, net: "fetch" });
}

function sentenceWords(env, sentenceId) {
  const s = Array.isArray(env.ctx.sentences) ? env.ctx.sentences.find((x) => x.id === sentenceId) : null;
  if (s && Number.isInteger(s.w0) && Number.isInteger(s.w1)) return [s.w0, s.w1];
  const idx = env.words.filter((w) => w.sentenceId === sentenceId).map((w) => w.i);
  return idx.length ? [Math.min(...idx), Math.max(...idx)] : null;
}

function segmentFor(plan, wordIndex) {
  const seg = plan.aRoll.segments.find((s) => s.anchor.kind === "words" && s.anchor.w0 <= wordIndex && s.anchor.w1 >= wordIndex);
  return seg ? seg.id : null;
}

function overlapping(env, itemId, outIn, outOut) {
  return env.derived().broll.find((b) => b.id !== itemId && liveItem(b) && b.resolved && !b.resolved.collapsed
    && Math.min(outOut, b.resolved.outOut) - Math.max(outIn, b.resolved.outIn) > 1e-3) || null;
}

// Sentence-level content analysis wins; segment flags (coarser: one sincere line marks the whole segment)
// are the fallback when no content analysis is passed.
function isFaceRequired(env, sentenceId) {
  const content = env.ctx.content;
  if (content && Array.isArray(content.faceRequired)) return content.faceRequired.some((f) => f && f.sentenceId === sentenceId);
  return env.draft.aRoll.segments.some((s) => s.faceRequired && s.sentenceIds.includes(sentenceId));
}

const HANDLERS = {
  "broll.replace": {
    schema: z.union([
      z.object({ id: BrollId, candidateId: z.string().min(1).max(160) }).strict(),
      z.object({ id: BrollId, assetId: z.string().regex(/^ast_[A-Za-z0-9_-]{1,40}$/) }).strict(),
    ]),
    apply(env, p) {
      const item = U.requireEl(env.draft, "broll", p.id);
      notRemoved(item);
      let raw = null;
      if (p.candidateId) raw = storedCandidates(env, item).find((c) => matches(c, p.candidateId)) || null;
      else {
        const up = env.ctx.assets && env.ctx.assets[p.assetId];
        raw = up && up.ref && (up.kind === "broll" || up.kind == null) ? up.ref : storedCandidates(env, item).find((c) => c.assetId === p.assetId) || null;
      }
      if (!raw) U.reject("that candidate is not in the stored set");
      const asset = validAsset(raw);
      const slot = slotSec(env, item);
      if (asset.type === "video" && asset.durationSec != null && asset.durationSec - asset.trimInSec < slot - 1e-3) {
        U.reject(`the clip is shorter than its ${U.r3(slot)} s slot`);
      }
      choose(env, item, asset);
      U.markUser(item);
      return { level: levelFor(item.layout), targets: [{ el: item.id }], elementIds: [item.id] };
    },
  },

  "broll.regenerate": {
    schema: z.object({ id: BrollId, query: z.string().trim().min(2).max(80).optional() }).strict(),
    apply(env, p) {
      const item = U.requireEl(env.draft, "broll", p.id);
      notRemoved(item);
      if (p.query) {
        item.queries = [{ text: p.query, kind: "user" }, ...item.queries.filter((q) => q.kind !== "user" && q.text !== p.query)].slice(0, 8);
        item.status = "pending";
        env.cost({ code: "NEEDS_FETCH", job: "search_broll", elementId: item.id, query: p.query, net: "fetch" });
        env.cost({ code: "NEEDS_AI", job: "broll_judge", elementId: item.id, net: "ai" });
      } else {
        const used = new Set(), usedHash = new Set();
        for (const b of env.draft.broll) {
          if (b.chosen) { used.add(b.chosen.assetId); if (b.chosen.dhash) usedHash.add(b.chosen.dhash); }
        }
        const ranked = storedCandidates(env, item)
          .map((c, k) => ({ c, k }))
          .sort((a, b) => ((b.c.scores && b.c.scores.total) || 0) - ((a.c.scores && a.c.scores.total) || 0) || a.k - b.k)
          .map((x) => x.c);
        // candidates this item already showed are not offered again: the ranking walks the stored list once,
        // then asks for a new search (instead of flipping between the top two forever)
        const seen = new Set(Array.isArray(item.seenCandidates) ? item.seenCandidates : []);
        if (item.chosen) seen.add(item.chosen.assetId);
        const next = ranked.find((c) => !used.has(c.assetId) && !seen.has(c.assetId) && !(c.dhash && usedHash.has(c.dhash)));
        if (next) seen.add(next.assetId);
        item.seenCandidates = [...seen].slice(-SEEN_CAP);
        if (next) choose(env, item, validAsset(next));
        else {
          item.status = "pending";
          env.cost({ code: "NEEDS_FETCH", job: "search_broll", elementId: item.id, queries: item.queries.map((q) => q.text), net: "fetch" });
          env.cost({ code: "NEEDS_AI", job: "broll_judge", elementId: item.id, net: "ai" });
        }
      }
      U.markUser(item);
      return { level: levelFor(item.layout), targets: [{ el: item.id }], elementIds: [item.id] };
    },
  },

  "broll.remove": {
    schema: z.object({ id: BrollId }).strict(),
    apply(env, p) {
      const item = U.requireEl(env.draft, "broll", p.id);
      if (item.status === "removed") U.reject(`B-roll '${item.id}' is already removed`);
      item.status = "removed";
      U.markUser(item);
      return { level: levelFor(item.layout), targets: [{ el: item.id }], elementIds: [item.id] };
    },
  },

  "broll.restore": {
    schema: z.object({ id: BrollId }).strict(),
    apply(env, p) {
      const item = U.requireEl(env.draft, "broll", p.id);
      if (item.status !== "removed") U.reject(`B-roll '${item.id}' is not removed`);
      if (item.chosen && item.chosen.path) item.status = "ok";
      else {
        item.status = "pending";
        env.cost({ code: "NEEDS_FETCH", job: item.chosen ? "download_broll" : "search_broll", elementId: item.id, net: "fetch" });
      }
      U.markUser(item);
      return { level: levelFor(item.layout), targets: [{ el: item.id }], elementIds: [item.id] };
    },
  },

  "broll.setLayout": {
    schema: z.object({ id: BrollId, layout: z.enum(ENUMS.layout), corner: z.enum(ENUMS.corner).optional(), scale: z.number().finite().min(0.3).max(0.55).optional() }).strict(),
    apply(env, p) {
      const d = env.draft;
      const item = U.requireEl(d, "broll", p.id);
      notRemoved(item);
      const aspect = d.output.aspect;
      if (p.layout === "SPLIT" && aspect === "1:1") U.reject("SPLIT is only available for 9:16 and 16:9 outputs");
      if (p.layout !== "PIP" && (p.corner !== undefined || p.scale !== undefined)) U.reject("corner and scale apply to PIP only");
      const old = item.layout;
      const prev = item.layoutParams || {};
      let params = {};
      if (p.layout === "PIP") {
        params = { corner: p.corner || prev.corner || "tr", scale: p.scale !== undefined ? p.scale : prev.scale !== undefined ? prev.scale : 0.4 };
        const mine = env.derived().broll.find((b) => b.id === item.id);
        const span = mine && mine.resolved ? mine.resolved : null;
        const region = params.corner.startsWith("t") ? "top" : "bottom";
        const clash = span && env.derived().graphics.some((g) => g.enabled && g.region === region && g.resolved && !g.resolved.collapsed
          && Math.min(span.outOut, g.resolved.outOut) - Math.max(span.outIn, g.resolved.outIn) > 0);
        if (clash) {
          const moved = `${region === "top" ? "b" : "t"}${params.corner[1]}`;
          env.warn("PIP_MOVED", { elementId: item.id, from: params.corner, to: moved });
          params.corner = moved;
        }
      } else if (p.layout === "SPLIT" && aspect === "9:16") {
        params = { splitSide: prev.splitSide || "top" };
      }
      item.layout = p.layout;
      item.layoutParams = params;
      U.markUser(item);
      return { level: levelFor(old, p.layout), targets: [{ el: item.id }], elementIds: [item.id] };
    },
  },

  "broll.setTiming": {
    schema: z.object({ id: BrollId, w0: z.number().int().min(0), w1: z.number().int().min(0), offsetIn: Offset.optional(), offsetOut: Offset.optional() }).strict(),
    apply(env, p) {
      const d = env.draft;
      const item = U.requireEl(d, "broll", p.id);
      notRemoved(item);
      const words = env.words;
      if (p.w1 < p.w0 || p.w1 >= words.length) U.reject("word range is outside the transcript");
      const offIn = p.offsetIn || 0, offOut = p.offsetOut || 0;
      const anchor = offIn === 0 && offOut === 0
        ? { kind: "words", w0: p.w0, w1: p.w1 }
        : { kind: "src", srcIn: U.r3(Math.max(0, words[p.w0].start + offIn)), srcOut: U.r3(Math.min(d.source.durationSec, words[p.w1].end + offOut)) };
      if (anchor.kind === "src" && !(anchor.srcOut > anchor.srcIn)) U.reject("B-roll timing ends before it starts");
      const map = env.timeMap();
      const r = map.resolveAnchor(anchor, words, { minDur: 0.4 });
      if (r.collapsed) U.reject("that span is inside a cut");
      const [a, b] = anchor.kind === "src" ? [anchor.srcIn, anchor.srcOut] : [words[p.w0].start, words[p.w1].end];
      const inPiece = (t) => map.pieces.some((pc) => pc.kind !== "hold" && t >= pc.srcIn - 1e-3 && t <= pc.srcOut + 1e-3);
      if (!inPiece(a) || !inPiece(b)) U.reject("B-roll may not start or end inside a cut");
      const dur = r.outOut - r.outIn;
      if (dur < 1 - 1e-9 || dur > 8 + 1e-9) U.reject(`B-roll must last 1–8 s (this span is ${U.r3(dur)} s)`);
      const clash = overlapping(env, item.id, r.outIn, r.outOut);
      if (clash) U.reject(`overlaps B-roll #${clash.ordinal}`);
      item.anchor = anchor;
      item.sentenceId = words[p.w0].sentenceId != null ? words[p.w0].sentenceId : item.sentenceId;
      item.segmentId = segmentFor(d, p.w0) || item.segmentId;
      U.markUser(item);
      return { level: levelFor(item.layout), targets: [{ el: item.id }, { out: [r.outIn, r.outOut] }], elementIds: [item.id] };
    },
  },

  "broll.add": {
    schema: z.object({ sentenceId: z.string().min(1).max(40), layout: z.enum(ENUMS.layout).optional(), useAi: z.boolean().optional(), force: z.boolean().optional() }).strict(),
    apply(env, p) {
      const d = env.draft;
      const span = sentenceWords(env, p.sentenceId);
      if (!span) U.reject(`sentence '${p.sentenceId}' does not exist`);
      if (!p.force && isFaceRequired(env, p.sentenceId)) U.reject(`sentence ${p.sentenceId} keeps the speaker on screen; pass force:true to cover it`, { protected: p.sentenceId });
      const opp = (d.opportunities.broll || []).filter((o) => o.sentenceId === p.sentenceId).sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1))[0] || null;
      const anchor = opp && opp.wordAnchor ? { kind: "words", w0: opp.wordAnchor.w0, w1: opp.wordAnchor.w1 } : { kind: "words", w0: span[0], w1: span[1] };
      const r = env.timeMap().resolveAnchor(anchor, env.words, { minDur: 0.4 });
      if (r.collapsed) U.reject(`sentence ${p.sentenceId} is fully cut`);
      const layout = p.layout || (opp ? opp.layoutPreference : "FULL");
      if (layout === "SPLIT" && d.output.aspect === "1:1") U.reject("SPLIT is only available for 9:16 and 16:9 outputs");
      let queries = opp ? opp.queries.map((text) => ({ text, kind: "visual_noun" })) : [];
      if (!queries.length && env.ctx.content && Array.isArray(env.ctx.content.visualSupport)) {
        const vs = env.ctx.content.visualSupport.find((v) => v.sentenceId === p.sentenceId);
        queries = vs ? vs.visualNouns.slice(0, 4).map((text) => ({ text: String(text).slice(0, 80), kind: "visual_noun" })) : [];
      }
      if (!queries.length) {
        const terms = env.words.slice(span[0], span[1] + 1).map((w) => String(w.text).toLowerCase().replace(/[^\p{L}\p{M}\p{N}-]/gu, ""))
          .filter((t) => t.length > 2 && !STOP.has(t));
        const top = [...new Set(terms)].sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).slice(0, 2);
        queries = top.map((text) => ({ text, kind: "fallback" }));
      }
      const clash = overlapping(env, null, r.outIn, r.outOut);
      if (clash) env.warn("BROLL_OVERLAP", { elementId: clash.id });
      const id = env.newId("br");
      const ordinal = d.broll.reduce((m, b) => Math.max(m, b.ordinal), 0) + 1;
      d.broll.push({
        id, ordinal, anchor, resolved: null, sentenceId: p.sentenceId, segmentId: segmentFor(d, anchor.w0),
        layout, layoutParams: layout === "PIP" ? { corner: "tr", scale: 0.4 } : layout === "SPLIT" && d.output.aspect === "9:16" ? { splitSide: "top" } : {},
        intent: "illustrate", queries, reason: "Added by you.", chosen: null, candidateSetId: null, topCandidates: [],
        judge: p.useAi ? "ok" : "unavailable", status: "pending", origin: "user", locked: false, userModified: true,
      });
      env.cost({ code: "NEEDS_FETCH", job: "search_broll", elementId: id, queries: queries.map((q) => q.text), prefetched: !!(opp && opp.candidatesPrefetched), net: "fetch" });
      if (p.useAi) env.cost({ code: "NEEDS_AI", job: "broll_judge", elementId: id, net: "ai" });
      return { level: levelFor(layout), targets: [{ el: id }], elementIds: [id] };
    },
  },

  "broll.setLocked": {
    schema: z.object({ id: BrollId, locked: z.boolean() }).strict(),
    apply(env, p) {
      const item = U.requireEl(env.draft, "broll", p.id);
      item.locked = p.locked;
      return { level: "NONE", targets: [], elementIds: [item.id] };
    },
  },
};

module.exports = { HANDLERS, storedCandidates };
