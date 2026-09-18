// VIDEO EDIT OPS — caption handlers (EDIT_PLAN.md §5 "Captions").
//
// WHY THIS EXISTS. Caption cues are DERIVED on every resolve, so no caption op may write a cue. Every
// op here writes the durable layer underneath — captions track settings or per-word overrides
// (wordText, insertions, hiddenWords, hiddenCues, cueY, emphasis) — and lets resolvePlan rebuild the
// cues. Handlers read cue ids and cue words from the derived view of the evolving batch draft, so an
// edit that follows a style change in the same batch targets the cues the user actually sees.
//
// CONTRACT: HANDLERS { [type]: { schema:zod, apply(env, payload) -> { level, targets, elementIds } } }
//   captions.setEnabled · caption.editText · caption.hide · caption.show · caption.setEmphasis ·
//   caption.setPosition · caption.rebuildFromWords (QA repair only) · captions.setStyle ·
//   captions.setPosition · captions.setLanguage (different language -> costEvent NEEDS_AI, no I/O)
// `env` is built by plan/ops.js (draft, derived(), timeMap(), words, warn, cost, isRepair, …).
// caption.hide / caption.show write overrides.hiddenCueWords (the cue's word keys) and caption.setPosition writes
// overrides.cueYWords (y per word key): cue ids are re-derived on every resolve, so state keyed by cue id would
// silently move to other words after a style / words-per-line change or a cut toggle. Legacy hiddenCues / cueY
// entries of the cue are cleared by show / setPosition.
// caption.editText passes the kept source ranges to retime and warns CAPTION_WORD_CUT { elementId, key, text }
// for an inserted word that would still fall inside removed footage.

const { z } = require("zod");
const { retimeCueEdit } = require("../captions/retime");
const { isStyleId } = require("../captions/styles");
const { clampY } = require("../captions/place");
const { isSupported } = require("../../services/caption_lang");
const { STYLE_HIGHLIGHT } = require("./schema");
const U = require("./ops_util");

const CueId = z.string().regex(/^c_[A-Za-z0-9_:-]{1,48}$/);
const WordKey = z.string().regex(/^[A-Za-z0-9_:-]{1,48}$/);
const Unit = z.number().finite().min(0).max(1);
const ALL = Object.freeze({ all: true });
const r4 = (x) => Math.round(x * 1e4) / 1e4;

function requireCue(env, cueId) {
  const cues = env.derived().captions.cues;
  const index = cues.findIndex((c) => c.id === cueId);
  if (index < 0) U.reject(`caption '${cueId}' does not exist`);
  return { cue: cues[index], index, cues };
}

function sortInsertions(list) {
  return list.sort((a, b) => a.afterWordIndex - b.afterWordIndex || a.order - b.order || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

const HANDLERS = {
  "captions.setEnabled": {
    schema: z.object({ enabled: z.boolean() }).strict(),
    apply(env, p) {
      env.draft.captions.enabled = p.enabled;
      env.draft.settings.captionsEnabled = p.enabled;
      return { level: "COMPOSITE", targets: [ALL], elementIds: ["captions"] };
    },
  },

  "caption.editText": {
    schema: z.object({ cueId: CueId, text: z.string().min(1).max(120) }).strict(),
    apply(env, p) {
      const { cue, index, cues } = requireCue(env, p.cueId);
      const d = env.draft;
      const ov = d.captions.overrides;
      const map = env.timeMap();
      let patch;
      try {
        patch = retimeCueEdit(cue, p.text, {
          lang: d.captions.sourceLanguage || d.source.language,
          neighbours: { prev: cues[index - 1] || null, next: cues[index + 1] || null },
          insertions: ov.insertions,
          existingKeys: ov.insertions.map((x) => x.key),
          maxTokens: 2 * cue.words.length + 4,
          keptRanges: map.pieces.filter((pc) => pc.kind !== "hold").map((pc) => [pc.srcIn, pc.srcOut]),
        });
      } catch (e) {
        const reason = e && e.extra && e.extra.reason;
        if (reason === "all_deleted") U.reject("every word was deleted; use caption.hide to remove a caption");
        if (reason === "punctuation_only") U.reject("caption text cannot be punctuation only");
        if (reason === "too_many_tokens") U.reject(`caption text may have at most ${2 * cue.words.length + 4} words`);
        if (reason) U.reject(`caption edit rejected: ${reason}`);
        throw e;
      }
      if (patch.unchanged) env.warn("NOOP", { elementId: cue.id });
      for (const [k, text] of Object.entries(patch.wordText)) {
        const w = env.words[Number(k)];
        if (w && w.text === text) delete ov.wordText[k];
        else ov.wordText[k] = text;
      }
      ov.hiddenWords = [...new Set([...ov.hiddenWords, ...patch.hiddenWords])].sort((a, b) => a - b);
      const drop = new Set([...patch.removedInsertionKeys, ...patch.insertions.map((x) => x.key)]);
      ov.insertions = sortInsertions([...ov.insertions.filter((x) => !drop.has(x.key)), ...patch.insertions]);
      for (const k of patch.removedInsertionKeys) delete ov.emphasis[k];
      // a new word whose time still falls in removed footage is not captioned: say so instead of silently losing it
      for (const ins of patch.insertions) {
        if (!map.keptAt((ins.srcStart + ins.srcEnd) / 2)) env.warn("CAPTION_WORD_CUT", { elementId: cue.id, key: ins.key, text: ins.text });
      }
      d.captions.userEdited = true;
      return { level: "COMPOSITE", targets: [{ el: cue.id }, { src: [patch.dirty.srcStart, patch.dirty.srcEnd] }], elementIds: [cue.id] };
    },
  },

  "caption.hide": {
    schema: z.object({ cueId: CueId }).strict(),
    apply(env, p) {
      const { cue } = requireCue(env, p.cueId);
      const ov = env.draft.captions.overrides;
      if (cue.hidden) env.warn("NOOP", { elementId: p.cueId });
      else ov.hiddenCueWords = [...new Set([...(ov.hiddenCueWords || []), ...cue.words.map((w) => w.key)])].sort();
      env.draft.captions.userEdited = true;
      return { level: "COMPOSITE", targets: [{ el: p.cueId }], elementIds: [p.cueId] };
    },
  },

  "caption.show": {
    schema: z.object({ cueId: CueId }).strict(),
    apply(env, p) {
      const { cue } = requireCue(env, p.cueId);
      const ov = env.draft.captions.overrides;
      if (!cue.hidden) env.warn("NOOP", { elementId: p.cueId });
      const keys = new Set(cue.words.map((w) => w.key));
      if (ov.hiddenCueWords) ov.hiddenCueWords = ov.hiddenCueWords.filter((k) => !keys.has(k));
      ov.hiddenCues = ov.hiddenCues.filter((id) => id !== p.cueId);
      return { level: "COMPOSITE", targets: [{ el: p.cueId }], elementIds: [p.cueId] };
    },
  },

  "caption.setEmphasis": {
    schema: z.object({ cueId: CueId, wordKey: WordKey, emphasis: z.boolean() }).strict(),
    apply(env, p) {
      const { cue } = requireCue(env, p.cueId);
      if (!cue.words.some((w) => w.key === p.wordKey)) U.reject(`word '${p.wordKey}' is not in caption '${p.cueId}'`);
      env.draft.captions.overrides.emphasis[p.wordKey] = p.emphasis;
      env.draft.captions.userEdited = true;
      return { level: "COMPOSITE", targets: [{ el: p.cueId }], elementIds: [p.cueId] };
    },
  },

  "caption.setPosition": {
    schema: z.object({ cueId: CueId, y: Unit.nullable() }).strict(),
    apply(env, p) {
      const { cue } = requireCue(env, p.cueId);
      const ov = env.draft.captions.overrides;
      const keys = cue.words.map((w) => w.key);
      const byWord = { ...(ov.cueYWords || {}) };
      delete ov.cueY[p.cueId];
      for (const k of keys) delete byWord[k];
      if (p.y !== null) {
        const y = r4(clampY(p.y, env.draft.output.aspect));
        if (Math.abs(y - p.y) > 1e-9) env.warn("CLAMPED_TO_SAFE_BAND", { elementId: p.cueId, y });
        for (const k of keys) byWord[k] = y;
      }
      ov.cueYWords = byWord;
      return { level: "COMPOSITE", targets: [{ el: p.cueId }], elementIds: [p.cueId] };
    },
  },

  "caption.rebuildFromWords": {
    schema: z.object({ range: z.tuple([z.number().finite().min(0), z.number().finite().min(0)]) }).strict(),
    apply(env, p) {
      if (!env.isRepair) U.reject("caption.rebuildFromWords is reserved for QA repair");
      const [a, b] = p.range;
      if (!(b > a)) U.reject("range end must be after its start");
      const derived = env.derived();
      const map = env.timeMap();
      const ov = env.draft.captions.overrides;
      const inRange = (s, e) => Math.min(e, b) - Math.max(s, a) > 0 || (s >= a && s <= b);
      const cues = derived.captions.cues.filter((c) => c.resolved && inRange(c.resolved.outIn, c.resolved.outOut));
      const keys = new Set(cues.flatMap((c) => c.words.map((w) => w.key)));
      const idx = new Set(cues.flatMap((c) => c.words.filter((w) => Number.isInteger(w.i)).map((w) => w.i)));
      for (const k of Object.keys(ov.wordText)) if (idx.has(Number(k))) delete ov.wordText[k];
      ov.insertions = ov.insertions.filter((x) => !keys.has(x.key) && !inRange(map.srcToOutStart(x.srcStart), map.srcToOutEnd(x.srcEnd)));
      ov.hiddenWords = ov.hiddenWords.filter((i) => {
        const w = env.words[i];
        return !w || !inRange(map.srcToOutStart(w.start), map.srcToOutEnd(w.end));
      });
      const ids = new Set(cues.map((c) => c.id));
      ov.hiddenCues = ov.hiddenCues.filter((id) => !ids.has(id));
      for (const id of ids) delete ov.cueY[id];
      if (ov.hiddenCueWords) ov.hiddenCueWords = ov.hiddenCueWords.filter((k) => !keys.has(k));
      if (ov.cueYWords) for (const k of keys) delete ov.cueYWords[k];
      for (const k of keys) delete ov.emphasis[k];
      return { level: "COMPOSITE", targets: [{ out: [a, b] }, ...[...ids].map((id) => ({ el: id }))], elementIds: [...ids].slice(0, 500) };
    },
  },

  "captions.setStyle": {
    schema: z.object({ styleId: z.string().min(1).max(40), maxWordsPerLine: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional() }).strict(),
    apply(env, p) {
      if (!isStyleId(p.styleId)) U.reject(`unknown caption style '${p.styleId}'`);
      const d = env.draft;
      d.captions.styleId = p.styleId;
      d.settings.captionStyle = p.styleId;
      d.captions.highlight = STYLE_HIGHLIGHT[p.styleId] || "none";
      if (p.maxWordsPerLine !== undefined) d.settings.maxWordsPerLine = p.maxWordsPerLine;
      return { level: "COMPOSITE", targets: [ALL], elementIds: ["captions"] };
    },
  },

  "captions.setPosition": {
    schema: z.object({ y: Unit.nullable() }).strict(),
    apply(env, p) {
      const pos = env.draft.captions.position;
      if (p.y === null) delete pos.yOverride;
      else {
        const y = r4(clampY(p.y, env.draft.output.aspect));
        if (Math.abs(y - p.y) > 1e-9) env.warn("CLAMPED_TO_SAFE_BAND", { elementId: "captions", y });
        pos.yOverride = y;
      }
      return { level: "COMPOSITE", targets: [ALL], elementIds: ["captions"] };
    },
  },

  "captions.setLanguage": {
    schema: z.object({ language: z.string().min(2).max(12) }).strict(),
    apply(env, p) {
      const d = env.draft;
      const code = p.language === "auto" ? "auto" : String(p.language).toLowerCase();
      if (code !== "auto" && !isSupported(code)) U.reject(`caption language '${p.language}' is not supported`);
      const effective = code === "auto" ? d.source.language : code;
      d.settings.captionLanguage = code;
      d.captions.language = effective;
      if (effective !== d.captions.sourceLanguage && !d.captions.translations[effective]) {
        env.cost({ code: "NEEDS_AI", job: "translate_captions", elementId: "captions", language: effective, net: "ai" });
        env.warn("TRANSLATION_PENDING", { elementId: "captions", language: effective });
      }
      return { level: "COMPOSITE", targets: [ALL], elementIds: ["captions"] };
    },
  },
};

module.exports = { HANDLERS };
