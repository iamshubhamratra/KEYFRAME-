// VIDEO EDIT OPS — cut and pacing handlers (EDIT_PLAN.md §5 "Cuts and pacing").
//
// WHY THIS EXISTS. Cuts are the only ops that change the output duration, so they decide the most
// expensive invalidation (SHIFT) and carry the rules that keep a user from damaging their own take:
// no adjusted cut may swallow the middle of a word it did not already remove, no added cut may
// remove the whole take, and faceRequired / CTA sentences need an explicit `force`. A user toggle
// also takes the cut out of the pacing settings' control (controlledBy -> null), which is exactly
// "userToggled cuts keep their state" when silence / filler settings change later.
//
// CONTRACT: HANDLERS { cut.toggle, cut.adjust, cut.add, cuts.restoreAll, settings.set }
//   cut.adjust pads are ABSOLUTE and relative to cut.raw: srcIn = raw.srcIn + padStart,
//   srcOut = raw.srcOut − padEnd (positive = more footage kept on that side). Idempotent.
//   cut.add {w0,w1} pads like a filler cut (−30 ms / +50 ms, clamped to the neighbouring words).
//   settings.set on brollIntensity / effects / pacing keys runs plan/replan.replanForSettings.

const { z } = require("zod");
const T = require("./timeline");
const { ENUMS, PlanSettingsSchema } = require("./schema");
const U = require("./ops_util");

const CutId = z.string().regex(/^cut_[A-Za-z0-9_-]{1,40}$/);
const Sec = z.number().finite().min(0);
const ALL = Object.freeze({ all: true });
const MAX_ADD_SEC = 60;
const MIN_CUT_SEC = 2 / T.FPS;

const PACING_KEYS = Object.freeze(["removeSilence", "silencePace", "removeFillers", "autoJumpCuts", "punchInOnJumpCuts"]);
const SETTING_LEVELS = Object.freeze({
  removeSilence: "SHIFT", silencePace: "SHIFT", removeFillers: "SHIFT", autoJumpCuts: "SHIFT", punchInOnJumpCuts: "SHIFT",
  brollIntensity: "COMPOSITE", effects: "BASE", effectsEnabled: "BASE",
  // transitions and the colour look are drawn in the composite: no A-roll chunk is re-encoded
  cutTransition: "COMPOSITE", look: "COMPOSITE",
});
const REPLAN_KEYS = Object.freeze(["brollIntensity", "effects", "removeSilence", "silencePace", "removeFillers", "autoJumpCuts"]);

const mid = (w) => (w.start + w.end) / 2;

// CTA segments are always protected. faceRequired comes from the sentence-level content analysis when it is
// passed, else from the (coarser) segment flags.
function protectedSentences(env) {
  const out = new Map();
  const content = env.ctx.content;
  const sentenceLevel = content && Array.isArray(content.faceRequired);
  for (const s of env.draft.aRoll.segments) {
    if (s.type === "CTA") for (const sid of s.sentenceIds) out.set(sid, "cta");
    else if (!sentenceLevel && s.faceRequired) for (const sid of s.sentenceIds) if (!out.has(sid)) out.set(sid, "faceRequired");
  }
  if (sentenceLevel) {
    for (const f of content.faceRequired) if (f && f.sentenceId && !out.has(f.sentenceId)) out.set(f.sentenceId, f.reason || "faceRequired");
  }
  return out;
}

function checkWordMidpoints(env, cut, srcIn, srcOut) {
  const wr = cut.wordRange;
  for (const w of env.words) {
    const m = mid(w);
    if (!(m > srcIn && m < srcOut)) continue;
    const inRange = wr && w.i >= wr[0] && w.i <= wr[1];
    const wasCut = m > cut.srcIn && m < cut.srcOut;
    if (!inRange && !wasCut) U.reject(`the adjusted cut would cross the middle of kept word ${w.i}`);
  }
}

const HANDLERS = {
  "cut.toggle": {
    schema: z.object({ cutId: CutId, enabled: z.boolean() }).strict(),
    apply(env, p) {
      const cut = U.requireEl(env.draft, "cut", p.cutId);
      cut.enabled = p.enabled;
      cut.userToggled = true;
      cut.controlledBy = null;
      return { level: "SHIFT", targets: [{ src: [cut.srcIn, cut.srcOut] }], elementIds: [cut.id] };
    },
  },

  "cut.adjust": {
    schema: z.object({ cutId: CutId, padStart: z.number().finite().min(-0.3).max(0.3), padEnd: z.number().finite().min(-0.3).max(0.3) }).strict(),
    apply(env, p) {
      const cut = U.requireEl(env.draft, "cut", p.cutId);
      const D = env.draft.source.durationSec;
      const srcIn = U.r3(cut.raw.srcIn + p.padStart);
      const srcOut = U.r3(cut.raw.srcOut - p.padEnd);
      if (srcIn < 0 || srcOut > D + 1e-9) U.reject("the adjusted cut leaves the source");
      if (srcOut - srcIn < MIN_CUT_SEC - 1e-9) U.reject("the adjusted cut is shorter than 2 frames");
      checkWordMidpoints(env, cut, srcIn, srcOut);
      const old = [cut.srcIn, cut.srcOut];
      cut.srcIn = srcIn;
      cut.srcOut = srcOut;
      return { level: "SHIFT", targets: [{ src: old }, { src: [srcIn, srcOut] }], elementIds: [cut.id] };
    },
  },

  "cut.add": {
    schema: z.union([
      z.object({ w0: z.number().int().min(0), w1: z.number().int().min(0), force: z.boolean().optional() }).strict(),
      z.object({ srcIn: Sec, srcOut: Sec, force: z.boolean().optional() }).strict(),
    ]),
    apply(env, p) {
      const d = env.draft;
      const words = env.words;
      const D = d.source.durationSec;
      let srcIn, srcOut, wordRange;
      if (p.w0 !== undefined) {
        if (p.w1 < p.w0 || p.w1 >= words.length) U.reject("word range is outside the transcript");
        const a = words[p.w0], b = words[p.w1];
        srcIn = Math.max(p.w0 > 0 ? words[p.w0 - 1].end : 0, a.start - 0.03, 0);
        srcOut = Math.min(p.w1 + 1 < words.length ? words[p.w1 + 1].start : D, b.end + 0.05, D);
        wordRange = [p.w0, p.w1];
      } else {
        if (!(p.srcOut > p.srcIn) || p.srcOut > D + 1e-9) U.reject("cut span must lie inside the source");
        srcIn = p.srcIn; srcOut = p.srcOut;
        const inside = words.filter((w) => mid(w) > srcIn && mid(w) < srcOut).map((w) => w.i);
        wordRange = inside.length ? [Math.min(...inside), Math.max(...inside)] : null;
      }
      srcIn = U.r3(srcIn); srcOut = U.r3(srcOut);
      if (srcOut - srcIn < MIN_CUT_SEC - 1e-9) U.reject("cut is shorter than 2 frames");
      if (srcOut - srcIn > MAX_ADD_SEC + 1e-9) U.reject("a single cut may remove at most 60 s");
      if (wordRange && !p.force) {
        const prot = protectedSentences(env);
        for (let i = wordRange[0]; i <= wordRange[1]; i++) {
          const sid = words[i] && words[i].sentenceId;
          if (sid && prot.has(sid)) U.reject(`sentence ${sid} is protected (${prot.get(sid)}); pass force:true to cut it`, { protected: sid });
        }
      }
      const id = env.newId("cut");
      const cut = {
        id, kind: "USER", srcIn, srcOut, raw: { srcIn, srcOut }, snap: { method: "none", padIn: 0, padOut: 0 },
        wordRange, confidence: 1, controlledBy: null, enabled: true, userToggled: true,
        reason: "Removed by you.", origin: "user", locked: false,
      };
      const trial = T.keptRanges({ ...d, cuts: [...d.cuts, cut] }, { words, settings: d.settings });
      const survivors = words.filter((w) => trial.ranges.some((r) => mid(w) >= r.srcIn && mid(w) < r.srcOut));
      const keptSec = trial.ranges.reduce((s, r) => s + (r.srcOut - r.srcIn), 0);
      if ((words.length && !survivors.length) || keptSec < 0.5) U.reject("the cut would remove the whole take");
      d.cuts.push(cut);
      return { level: "SHIFT", targets: [{ src: [srcIn, srcOut] }], elementIds: [id] };
    },
  },

  "cuts.restoreAll": {
    schema: z.object({ kind: z.enum(ENUMS.cutKind).optional() }).strict(),
    apply(env, p) {
      const changed = [];
      for (const c of env.draft.cuts) {
        if (p.kind && c.kind !== p.kind) continue;
        if (!c.enabled && c.userToggled && c.controlledBy === null) continue;
        c.enabled = false;
        c.userToggled = true;
        c.controlledBy = null;
        changed.push(c.id);
      }
      if (!changed.length) env.warn("NOOP", { kind: p.kind || null });
      return { level: changed.length ? "SHIFT" : "NONE", targets: [ALL], elementIds: changed.slice(0, 500) };
    },
  },

  "settings.set": {
    schema: z.object({ key: z.enum(Object.keys(SETTING_LEVELS)), value: z.union([z.boolean(), z.string().max(20)]) }).strict(),
    apply(env, p) {
      const check = PlanSettingsSchema.shape[p.key].safeParse(p.value);
      if (!check.success) U.reject(`invalid value for ${p.key}`);
      const d = env.draft;
      if (d.settings[p.key] === check.data) {
        env.warn("NOOP", { key: p.key });
        return { level: "NONE", targets: [], elementIds: [] };
      }
      let elementIds = [];
      if (REPLAN_KEYS.includes(p.key)) {
        const { replanForSettings } = require("./replan");
        const res = replanForSettings(d, { [p.key]: check.data }, { ...env.ctx, words: env.words, now: env.now });
        env.setDraft(res.plan);
        res.warnings.forEach((w) => env.warn(w.code, w));
        res.costEvents.forEach((c) => env.cost(c));
        elementIds = [...res.report.addedIds, ...res.report.removedIds].slice(0, 500);
      } else {
        d.settings[p.key] = check.data;
      }
      return { level: SETTING_LEVELS[p.key], targets: [ALL], elementIds };
    },
  },
};

module.exports = { HANDLERS, PACING_KEYS, REPLAN_KEYS, SETTING_LEVELS, protectedSentences };
