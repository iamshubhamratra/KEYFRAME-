// VIDEO EDIT OPS — effects, transitions, graphics, audio, branding, framing, output and meta handlers
// (EDIT_PLAN.md §5).
//
// WHY THIS EXISTS. These ops are individually simple but each carries one rule that is easy to get
// wrong in a client: zoom limits differ per effect kind, a picture transition needs a longer window than a
// dip, graphic text limits depend on the kind, music/SFX volumes are dB on the wire but a clamped
// linear gain in the plan, a palette change re-renders every card, and an aspect change must not leave
// a SPLIT layout on a square video. Centralizing them keeps the plan valid no matter which client sent
// the op. Nothing here performs I/O: a new music search is `music.track = null` + costEvent NEEDS_FETCH.
//
// CONTRACT: HANDLERS { effect.toggle, effect.adjust, transition.set, graphic.editText, graphic.toggle,
//   music.change, music.remove, music.restore, music.setVolume, music.setDucking, sfx.toggle, sfx.setVolume,
//   sfx.muteAll, branding.setLogo, branding.removeLogo, branding.setLogoPlacement, branding.setPalette,
//   framing.adjust, framing.reset, output.setAspect, edit.setTitle }
//   Gains, linear in dB between anchors (every slider position distinct, never clamped):
//   music −30…0 dB -> 0.06…0.16; sfx −30…0 dB -> 0.15…0.25 and 0…+6 dB -> 0.25…0.45.
//   sfx.muteAll writes settings.sfxEnabled only — per-cue enabled flags survive; composition must AND them.
//   framing.adjust: userCrop.cx/cy = face at segment start + 0.5·offset (clamped 0..1); warns FACE_OUTSIDE_CROP.
//   edit.setTitle has no plan field: it returns env.projectPatch.title for the route to persist (level NONE).

const { z } = require("zod");
const T = require("./timeline");
const { ENUMS, GRAPHIC_USER_LIMITS, outputDims } = require("./schema");
const U = require("./ops_util");
const { XFADE_KINDS } = require("../render/transitions");

const FxId = z.string().regex(/^fx_[A-Za-z0-9_-]{1,40}$/);
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const ALL = Object.freeze({ all: true });
const r4 = (x) => Math.round(x * 1e4) / 1e4;

const ZOOM_FIELD = Object.freeze({
  PUNCH_IN: ["zoom", 1.05, 1.35], PUNCH_OUT: ["toZoom", 1, 1.35], JUMP_ZOOM: ["zoom", 1, 1.35],
  ZOOM_EMPHASIS: ["toZoom", 1, 1.5], REFRAME: ["zoom", 1, 2],
});

function effectLevel(e) {
  if (e.kind === "FREEZE") return "SHIFT";
  if (e.kind === "SPEED") return e.target === "aroll_nonspeech" ? "SHIFT" : "COMPOSITE";
  return "BASE";
}

function requireMusic(env) {
  if (!env.draft.music) U.reject("this edit has no music");
  return env.draft.music;
}

// The wire range of an op (dB) maps monotonically onto the plan's gain range, linear in dB between anchor
// points, so every slider position is audible and distinct. (A reference·10^(dB/20) gain clamped to the plan
// range left −30…−8.5 dB of the music slider identical.) anchors: [[db, gain], …] ascending.
function volumeFromDb(db, anchors) {
  const d = U.clamp(db, anchors[0][0], anchors[anchors.length - 1][0]);
  for (let k = 1; k < anchors.length; k++) {
    const [d0, g0] = anchors[k - 1], [d1, g1] = anchors[k];
    if (d <= d1 + 1e-9) return r4(g0 * Math.pow(g1 / g0, (d - d0) / (d1 - d0)));
  }
  return r4(anchors[anchors.length - 1][1]);
}
const MUSIC_DB_ANCHORS = Object.freeze([[-30, 0.06], [0, 0.16]]);
const SFX_DB_ANCHORS = Object.freeze([[-30, 0.15], [0, 0.25], [6, 0.45]]);

function cardsDirty(plan) {
  for (const g of plan.graphics) g.render = { cardHash: null, path: null, status: "pending" };
}

function segmentStart(env, seg) {
  if (seg.anchor.kind === "words") return env.words[seg.anchor.w0] ? env.words[seg.anchor.w0].start : 0;
  if (seg.anchor.kind === "src") return seg.anchor.srcIn;
  return env.timeMap().outToSrc(seg.anchor.outIn);
}

function sameTrack(a, b) { return !!a && !!b && ((a.assetId && a.assetId === b.assetId) || (a.path && a.path === b.path)); }

function defaultMusic() {
  return {
    enabled: true, track: null, candidates: [], volume: 0.1, envelope: [], duck: { enabled: true, depthDb: -9 },
    startOffsetSec: 0, fadeInSec: 0.5, fadeOutSec: 1.5, reason: "Added by you.", origin: "user", locked: false,
  };
}

const HANDLERS = {
  "effect.toggle": {
    schema: z.object({ id: FxId, enabled: z.boolean() }).strict(),
    apply(env, p) {
      const e = U.requireEl(env.draft, "effect", p.id);
      e.enabled = p.enabled;
      U.markUser(e);
      const targets = [{ el: e.id }];
      if (e.kind === "FREEZE") targets.push({ src: [e.atSrc, e.atSrc] });
      return { level: effectLevel(e), targets, elementIds: [e.id] };
    },
  },

  "effect.adjust": {
    schema: z.object({ id: FxId, zoom: z.number().finite().min(1.05).max(1.4).optional(), w0: z.number().int().min(0).optional(), w1: z.number().int().min(0).optional() }).strict()
      .refine((p) => (p.w0 === undefined) === (p.w1 === undefined), { message: "w0 and w1 go together" })
      .refine((p) => p.zoom !== undefined || p.w0 !== undefined, { message: "nothing to adjust" }),
    apply(env, p) {
      const e = U.requireEl(env.draft, "effect", p.id);
      if (p.zoom !== undefined) {
        const f = ZOOM_FIELD[e.kind];
        if (!f) U.reject(`${e.kind} has no zoom`);
        const z0 = U.clamp(p.zoom, f[1], f[2]);
        if (z0 !== p.zoom) env.warn("ZOOM_CLAMPED", { elementId: e.id, zoom: z0 });
        e[f[0]] = U.r3(z0);
      }
      const targets = [{ el: e.id }];
      if (p.w0 !== undefined) {
        if (p.w1 < p.w0 || p.w1 >= env.words.length) U.reject("word range is outside the transcript");
        const anchor = { kind: "words", w0: p.w0, w1: p.w1 };
        const r = env.timeMap().resolveAnchor(anchor, env.words, { minDur: 2 / T.FPS });
        if (r.collapsed || r.outOut - r.outIn < 0.4 - 1e-9) U.reject("an effect must cover at least 0.4 s of kept footage");
        if (e.kind === "FREEZE") { targets.push({ src: [e.atSrc, e.atSrc] }); e.atSrc = U.r3(env.words[p.w1].end); targets.push({ src: [e.atSrc, e.atSrc] }); }
        e.anchor = anchor;
      }
      U.markUser(e);
      return { level: effectLevel(e) === "COMPOSITE" ? "COMPOSITE" : effectLevel(e), targets, elementIds: [e.id] };
    },
  },

  "transition.set": {
    schema: z.object({ id: z.string().regex(/^tr_[A-Za-z0-9_-]{1,40}$/), kind: z.enum(ENUMS.transitionKind) }).strict(),
    apply(env, p) {
      const t = U.requireEl(env.draft, "transition", p.id);
      const derived = env.derived();
      const at = t.at;
      let outAt = Number.isFinite(at.outAt) ? at.outAt : null;
      const segs = derived.aRoll.segments;
      const k = at.elementId ? segs.findIndex((s) => s.id === at.elementId) : -1;
      if (k >= 0 && segs[k].resolved) outAt = segs[k].resolved.outOut;
      t.kind = p.kind;
      // A picture transition (crossfade, zoom, whip …) needs a longer window than a dip; never shorten one.
      const spec = XFADE_KINDS[p.kind];
      if (spec && !(t.durationSec >= spec.sec - 1e-9)) t.durationSec = Math.min(0.8, spec.sec);
      // Every kind is drawn in the composite (a real crossfade uses frozen handles, not overlapping A-roll), so a
      // change never re-encodes A-roll chunks.
      const targets = outAt == null ? [ALL] : [{ out: [outAt - t.durationSec, outAt + t.durationSec] }];
      return { level: "COMPOSITE", targets, elementIds: [t.id] };
    },
  },

  "graphic.editText": {
    schema: z.object({ id: z.string().regex(/^gfx_[A-Za-z0-9_-]{1,40}$/), title: z.string().trim().min(1).max(60).optional(), subtitle: z.string().trim().max(50).optional(), value: z.string().trim().max(24).optional() }).strict()
      .refine((p) => p.title !== undefined || p.subtitle !== undefined || p.value !== undefined, { message: "nothing to edit" }),
    apply(env, p) {
      const g = U.requireEl(env.draft, "graphic", p.id);
      const lim = GRAPHIC_USER_LIMITS[g.kind];
      if (p.title !== undefined && p.title.length > lim.title) U.reject(`${g.kind} titles are at most ${lim.title} characters`);
      if (p.subtitle !== undefined && p.subtitle.length > lim.subtitle) U.reject(`${g.kind} subtitles are at most ${lim.subtitle} characters`);
      if (p.title !== undefined) g.text.title = p.title;
      if (p.subtitle !== undefined) { if (p.subtitle) g.text.subtitle = p.subtitle; else delete g.text.subtitle; }
      if (p.value !== undefined) { if (p.value) g.text.value = p.value; else delete g.text.value; }
      g.render = { cardHash: null, path: null, status: "pending" };
      U.markUser(g);
      return { level: "COMPOSITE", targets: [{ el: g.id }], elementIds: [g.id] };
    },
  },

  "graphic.toggle": {
    schema: z.object({ id: z.string().regex(/^gfx_[A-Za-z0-9_-]{1,40}$/), enabled: z.boolean() }).strict(),
    apply(env, p) {
      const g = U.requireEl(env.draft, "graphic", p.id);
      g.enabled = p.enabled;
      U.markUser(g);
      return { level: "COMPOSITE", targets: [{ el: g.id }], elementIds: [g.id] };
    },
  },

  "music.change": {
    schema: z.union([
      z.object({ candidateId: z.string().min(1).max(120) }).strict(),
      z.object({ query: z.string().trim().min(1).max(80).optional(), mood: z.string().trim().min(1).max(40).optional() }).strict()
        .refine((p) => p.query !== undefined || p.mood !== undefined, { message: "query or mood required" }),
    ]),
    apply(env, p) {
      const d = env.draft;
      if (p.candidateId !== undefined) {
        const m = requireMusic(env);
        const idx = m.candidates.findIndex((c, k) => c.assetId === p.candidateId || String(k) === p.candidateId);
        if (idx < 0) U.reject("that music candidate does not exist");
        const next = m.candidates[idx];
        const rest = m.candidates.filter((_, k) => k !== idx);
        m.candidates = (m.track ? [m.track, ...rest] : rest).filter((c, k, arr) => arr.findIndex((x) => sameTrack(x, c)) === k).slice(0, 3);
        m.track = next;
        m.enabled = true;
        if (!next.path) env.cost({ code: "NEEDS_FETCH", job: "download_music", elementId: "music", assetId: next.assetId, net: "fetch" });
      } else {
        if (!d.music) d.music = defaultMusic();
        const m = d.music;
        const prev = m.track;
        if (prev && prev.path) m.candidates = [prev, ...m.candidates.filter((c) => !sameTrack(c, prev))].slice(0, 3);
        // A pending track (same shape the rhythm engine writes) carries the request to the render, which fetches it
        // (render/materialize ledger); a null track would lose the mood/query the user just picked.
        const mood = p.mood || (prev && prev.mood) || "calm";
        m.track = {
          assetId: null, path: null, provider: "pixabay_bridge", query: String(p.query || `${mood} background`).slice(0, 80),
          mood: String(mood).slice(0, 40), license: "pending", durationSec: 0,
        };
        m.enabled = true;
        env.cost({ code: "NEEDS_FETCH", job: "search_music", elementId: "music", query: p.query || null, mood: p.mood || null, net: "fetch" });
      }
      d.settings.musicEnabled = true;
      return { level: "AUDIO", targets: [ALL], elementIds: ["music"] };
    },
  },

  "music.remove": {
    schema: z.object({}).strict(),
    apply(env) {
      const m = requireMusic(env);
      if (!m.enabled) env.warn("NOOP", { elementId: "music" });
      m.enabled = false;
      env.draft.settings.musicEnabled = false;
      return { level: "AUDIO", targets: [ALL], elementIds: ["music"] };
    },
  },

  "music.restore": {
    schema: z.object({}).strict(),
    apply(env) {
      const m = requireMusic(env);
      if (m.enabled) env.warn("NOOP", { elementId: "music" });
      m.enabled = true;
      env.draft.settings.musicEnabled = true;
      if (!m.track) env.cost({ code: "NEEDS_FETCH", job: "search_music", elementId: "music", net: "fetch" });
      return { level: "AUDIO", targets: [ALL], elementIds: ["music"] };
    },
  },

  "music.setVolume": {
    schema: z.object({ volumeDb: z.number().finite().min(-30).max(0) }).strict(),
    apply(env, p) {
      const m = requireMusic(env);
      m.volume = volumeFromDb(p.volumeDb, MUSIC_DB_ANCHORS);
      return { level: "AUDIO", targets: [ALL], elementIds: ["music"] };
    },
  },

  "music.setDucking": {
    schema: z.object({ enabled: z.boolean(), depthDb: z.number().finite().min(-24).max(-3) }).strict(),
    apply(env, p) {
      const m = requireMusic(env);
      m.duck = { enabled: p.enabled, depthDb: p.depthDb };
      return { level: "AUDIO", targets: [ALL], elementIds: ["music"] };
    },
  },

  "sfx.toggle": {
    schema: z.object({ id: z.string().regex(/^sfx_[A-Za-z0-9_-]{1,40}$/), enabled: z.boolean() }).strict(),
    apply(env, p) {
      const s = U.requireEl(env.draft, "sfx", p.id);
      s.enabled = p.enabled;
      return { level: "AUDIO", targets: [ALL], elementIds: [s.id] };
    },
  },

  "sfx.setVolume": {
    schema: z.object({ id: z.string().regex(/^sfx_[A-Za-z0-9_-]{1,40}$/), volumeDb: z.number().finite().min(-30).max(6) }).strict(),
    apply(env, p) {
      const s = U.requireEl(env.draft, "sfx", p.id);
      s.volume = volumeFromDb(p.volumeDb, SFX_DB_ANCHORS);
      return { level: "AUDIO", targets: [ALL], elementIds: [s.id] };
    },
  },

  "sfx.muteAll": {
    schema: z.object({ muted: z.boolean() }).strict(),
    apply(env, p) {
      env.draft.settings.sfxEnabled = !p.muted;
      return { level: "AUDIO", targets: [ALL], elementIds: [] };
    },
  },

  "branding.setLogo": {
    schema: z.object({ assetId: z.string().regex(/^ast_[A-Za-z0-9_-]{1,40}$/) }).strict(),
    apply(env, p) {
      const a = env.ctx.assets && env.ctx.assets[p.assetId];
      if (!a || a.kind !== "logo" || typeof a.path !== "string" || !a.path) U.reject("that asset is not an uploaded logo");
      const old = env.draft.branding.logo || {};
      env.draft.branding.logo = {
        assetId: p.assetId, path: a.path, placement: old.placement || "tr", scale: old.scale !== undefined ? old.scale : 0.12,
        opacity: old.opacity !== undefined ? old.opacity : 0.9, marginPct: old.marginPct !== undefined ? old.marginPct : 0.04, show: old.show || "always",
      };
      return { level: "COMPOSITE", targets: [ALL], elementIds: ["branding"] };
    },
  },

  "branding.removeLogo": {
    schema: z.object({}).strict(),
    apply(env) {
      if (!env.draft.branding.logo) U.reject("there is no logo to remove");
      env.draft.branding.logo = null;
      return { level: "COMPOSITE", targets: [ALL], elementIds: ["branding"] };
    },
  },

  "branding.setLogoPlacement": {
    schema: z.object({
      placement: z.enum(ENUMS.corner), scale: z.number().finite().min(0.08).max(0.2), opacity: z.number().finite().min(0.6).max(1),
      show: z.enum(ENUMS.logoShow).optional(), marginPct: z.number().finite().min(0.03).max(0.08).optional(),
    }).strict(),
    apply(env, p) {
      const logo = env.draft.branding.logo;
      if (!logo) U.reject("upload a logo first");
      Object.assign(logo, { placement: p.placement, scale: p.scale, opacity: p.opacity });
      if (p.show !== undefined) logo.show = p.show;
      if (p.marginPct !== undefined) logo.marginPct = p.marginPct;
      return { level: "COMPOSITE", targets: [ALL], elementIds: ["branding"] };
    },
  },

  "branding.setPalette": {
    schema: z.object({ primary: Hex, accent: Hex.optional(), presetId: z.string().min(1).max(40).optional() }).strict(),
    apply(env, p) {
      const d = env.draft;
      const primary = p.primary.toLowerCase(), accent = (p.accent || p.primary).toLowerCase();
      d.branding.palette = { ...d.branding.palette, primary, accent, source: "user" };
      d.settings.brandColors = [...new Set([primary, accent])];
      cardsDirty(d);
      return { level: "COMPOSITE", targets: [ALL], elementIds: ["branding", ...d.graphics.map((g) => g.id)].slice(0, 500) };
    },
  },

  "framing.adjust": {
    schema: z.object({ segmentId: z.string().regex(/^seg_[A-Za-z0-9_-]{1,40}$/), offsetX: z.number().finite().min(-1).max(1), offsetY: z.number().finite().min(-1).max(1), zoom: z.number().finite().min(1).max(2) }).strict(),
    apply(env, p) {
      const d = env.draft;
      const seg = U.requireEl(d, "segment", p.segmentId);
      const face = T.faceAt(env.ctx.faces || null, segmentStart(env, seg));
      const cx = r4(U.clamp(face.cx + 0.5 * p.offsetX, 0, 1)), cy = r4(U.clamp(face.cy + 0.5 * p.offsetY, 0, 1));
      seg.framing.userCrop = { cx, cy, zoom: U.r3(p.zoom) };
      seg.framing.mode = "static";
      seg.framing.locked = true;
      const W = env.ctx.mezz && env.ctx.mezz.w > 0 ? env.ctx.mezz.w : d.source.width;
      const H = env.ctx.mezz && env.ctx.mezz.h > 0 ? env.ctx.mezz.h : d.source.height;
      const A = d.output.width / d.output.height;
      const bw = Math.min(W, H * A);
      const crop = T.cropFor({ W, H, bw, bh: bw / A }, p.zoom, { cx, cy, h: 0 }, 0, T.FACE_Y_TARGET[d.output.aspect] || 0.4);
      const fw = (face.h * H * 0.8), fh = face.h * H;
      const fx = face.cx * W - fw / 2, fy = face.cy * H - fh / 2;
      const inside = fx >= crop.x - 1 && fy >= crop.y - 1 && fx + fw <= crop.x + crop.w + 1 && fy + fh <= crop.y + crop.h + 1;
      if (!inside) env.warn("FACE_OUTSIDE_CROP", { elementId: seg.id });
      return { level: "BASE", targets: [{ el: seg.id }], elementIds: [seg.id] };
    },
  },

  "framing.reset": {
    schema: z.object({ segmentId: z.string().regex(/^seg_[A-Za-z0-9_-]{1,40}$/) }).strict(),
    apply(env, p) {
      const seg = U.requireEl(env.draft, "segment", p.segmentId);
      delete seg.framing.userCrop;
      seg.framing.mode = "auto";
      seg.framing.locked = false;
      return { level: "BASE", targets: [{ el: seg.id }], elementIds: [seg.id] };
    },
  },

  "output.setAspect": {
    schema: z.object({ aspect: z.enum(["9:16", "16:9", "1:1"]) }).strict(),
    apply(env, p) {
      const d = env.draft;
      if (d.output.aspect === p.aspect) U.reject(`the output is already ${p.aspect}`);
      const dims = outputDims(p.aspect, Math.min(d.output.width, d.output.height));
      d.output = { ...d.output, aspect: p.aspect, width: dims.width, height: dims.height };
      for (const b of d.broll) {
        if (b.layout !== "SPLIT") continue;
        if (p.aspect === "1:1") { b.layout = "FULL"; b.layoutParams = {}; env.warn("LAYOUT_CHANGED", { elementId: b.id, from: "SPLIT", to: "FULL" }); }
        else b.layoutParams = p.aspect === "9:16" ? { splitSide: "top" } : {};
      }
      if (d.broll.some((b) => b.status !== "removed" && b.topCandidates.length > 1)) env.cost({ code: "RERANK_BROLL", job: "rerank_broll", elementId: "broll", net: "none" });
      cardsDirty(d);
      return { level: "BASE", targets: [ALL], elementIds: ["output"] };
    },
  },

  "edit.setTitle": {
    schema: z.object({ title: z.string().trim().min(1).max(80) }).strict(),
    apply(env, p) {
      env.projectPatch.title = p.title;
      return { level: "NONE", targets: [], elementIds: [] };
    },
  },
};

module.exports = { HANDLERS, ZOOM_FIELD };
