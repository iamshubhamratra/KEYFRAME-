// TEMPLATE AUDIO PROFILE — a frame pack's audio identity, and how it becomes a
// music query and a sound-effect palette.
//
// THE DEFECT THIS REPLACES. The music query was:
//
//     [script.music.mood, script.music.query].join(" ")        (graph.voiceAgent)
//
// — two free-text fields the SCRIPT model invented from the film's SUBJECT. Nothing in
// that path has ever seen which template the film is wearing, so a Bauhaus print poster,
// a paper storybook and a cyberpunk departures board all searched for the same bed.
// "Random music from Pixabay" is exactly right as a description: the only steering was a
// subject word, and the provider returned whatever matched it first.
//
// A pack's LOOK is already declared in `frames/<pack>/pack.json` (colors, motion, fx,
// textfx, brand). Its SOUND now is too, in an `audio` block. This module resolves that
// block, and a pack that declares none falls back to NEUTRAL — which is, exactly and
// deliberately, today's behaviour. That is what makes the system shippable pack-by-pack.
//
// Pure + deterministic. No I/O beyond the manifest read, no LLM, no Math.random —
// keyword rotation is seeded on the job id so a re-render of the same job picks the same
// track family. See pickMusicKeywords.

const { CUES } = require("./audio_cues");

// ---------------------------------------------------------------- the neutral profile
//
// NEUTRAL is not "no opinion" — it is "the behaviour this pipeline had before profiles
// existed". `musicKeywords: []` makes musicCandidatesFor fall through to the script's own
// mood/query, `sfxPalette: {}` leaves audio_cues.intentFor deciding every cue by itself,
// and noVo carries the house defaults. A pack with no audio block is therefore not
// degraded; it is unchanged.
const NEUTRAL = Object.freeze({
  mood: "",
  energy: "medium",
  tempo: "mid",
  style: [],
  musicKeywords: [],
  sfxPalette: {},
  noVo: Object.freeze({ energyBoost: 1, sfxDensity: "rich", ambient: false }),
  source: "neutral",
});

const ENERGY = ["low", "medium", "high"];
const TEMPO = ["slow", "mid", "fast"];

// ---------------------------------------------------------------- resolution

/**
 * profileFor(framePack) → the pack's audio identity, never null.
 *
 * Mirrors pack_style.styleFor one-for-one: manifest first, NEUTRAL as the floor. Required
 * lazily so a missing frames dir (or a require cycle) degrades to NEUTRAL instead of
 * throwing inside a render.
 */
function profileFor(framePack) {
  if (!framePack || framePack === "auto") return NEUTRAL;
  let a = null;
  try { a = require("./frame_manifest").getManifest(framePack)?.audio || null; }
  catch { return NEUTRAL; }
  if (!a || typeof a !== "object") return NEUTRAL;

  const keywords = clean(a.musicKeywords).slice(0, 12);
  const style = clean(a.style).slice(0, 8);
  // A block with neither keywords nor style steers nothing — report it as neutral so
  // downstream `source === "manifest"` checks (and the validation report) stay honest
  // about whether the template actually drove the search.
  if (!keywords.length && !style.length) return NEUTRAL;

  const noVo = (a.noVo && typeof a.noVo === "object") ? a.noVo : {};
  return Object.freeze({
    mood: str(a.mood, 40),
    energy: ENERGY.includes(a.energy) ? a.energy : "medium",
    tempo: TEMPO.includes(a.tempo) ? a.tempo : "mid",
    style,
    musicKeywords: keywords,
    // Only palette entries naming a REAL cue survive. Boot validation
    // (frame_manifest.validateAll) rejects a bad name loudly; this is the runtime
    // belt-and-braces so a hand-edited manifest can never inject a cue the library
    // cannot resolve into the middle of a render.
    sfxPalette: Object.freeze(Object.fromEntries(
      Object.entries(a.sfxPalette || {}).filter(([, v]) => typeof v === "string" && CUES[v])
    )),
    noVo: Object.freeze({
      // How much the bed lifts when nothing is being said. A NUDGE WITHIN THE PACK'S
      // RANGE, not a genre change: a calm storybook pack asks for its most driving
      // acoustic track, it does not become future bass. See musicCandidatesFor.
      energyBoost: clampInt(noVo.energyBoost, 0, 2, 1),
      sfxDensity: noVo.sfxDensity === "normal" ? "normal" : "rich",
      ambient: noVo.ambient === true,
    }),
    source: "manifest",
  });
}

const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
const clean = (v) => (Array.isArray(v) ? v : []).map((x) => str(x, 48).toLowerCase()).filter(Boolean);
function clampInt(v, lo, hi, d) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d;
}

// ---------------------------------------------------------------- deterministic rotation
//
// Math.random is forbidden in the render path (a re-render of the same job must produce
// the same film), so "randomly choose one or more keywords" is implemented as a SEEDED
// choice: same job + same pack → same keywords, different jobs on the same template →
// different ones. That is what makes two films on one pack sound related but not identical.

function hash32(s) {
  let h = 2166136261;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded shuffle — a full permutation, so callers can take as many as they need. */
function shuffled(list, seedKey) {
  const rnd = mulberry32(hash32(seedKey));
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * pickMusicKeywords({ profile, seedKey, narration, count })
 *   → the 1–2 template keywords this job searches with.
 *
 * With narration OFF the pack's LATER keywords are preferred. Profiles are authored
 * calmest-first, so this reaches for the pack's more driving end without leaving its
 * genre — the "nudge within character" rule. energyBoost 0 opts a pack out of the tilt
 * entirely (a pack that should stay exactly as calm with no voice).
 */
function pickMusicKeywords({ profile, seedKey = "kf", narration = "on", count = 2 } = {}) {
  const p = profile || NEUTRAL;
  const kws = p.musicKeywords || [];
  if (!kws.length) return [];
  const n = Math.max(1, Math.min(count, kws.length));

  if (narration === "off" && p.noVo.energyBoost > 0 && kws.length > 2) {
    // Draw from the back half (the pack's higher-energy phrasings), still seeded so the
    // pick is stable per job. Boost 2 narrows the pool further toward the very end.
    const from = p.noVo.energyBoost >= 2
      ? Math.floor(kws.length * 0.66)
      : Math.floor(kws.length / 2);
    const pool = kws.slice(from);
    const rest = kws.slice(0, from);
    const picked = shuffled(pool, `${seedKey}|hot`).slice(0, n);
    // Top up from the calm end only if the hot pool was too small to fill the request.
    return picked.length >= n ? picked : [...picked, ...shuffled(rest, `${seedKey}|calm`).slice(0, n - picked.length)];
  }
  return shuffled(kws, seedKey).slice(0, n);
}

/**
 * musicCandidatesFor({ framePack, jobId, narration, scriptMusic, subject })
 *   → { candidates: string[], source, keywords, profile }
 *
 * The ordered query list handed to audio_sources.fetchMusic. Priority, per the brief:
 *
 *   1. TEMPLATE IDENTITY  — 1–2 rotated keywords, optionally coloured by the pack's mood
 *   2. SUBJECT RELEVANCE  — the script's own query, but only as a LATER candidate, so a
 *                           subject word can never outrank the template's genre
 *   3. MODE               — narration off tilts the rotation toward the pack's driving end
 *
 * A NEUTRAL profile returns exactly today's query and `source: "script"`, which is what
 * the validation report reads to say whether the template actually steered the search.
 */
function musicCandidatesFor({ framePack, jobId, narration = "on", scriptMusic = null, profile = null } = {}) {
  const p = profile || profileFor(framePack);
  const scriptQuery = [scriptMusic && scriptMusic.mood, scriptMusic && scriptMusic.query]
    .map((x) => str(x, 60)).filter(Boolean).join(" ").trim();

  if (p.source !== "manifest") {
    return {
      candidates: scriptQuery ? [scriptQuery] : [],
      source: "script", keywords: [], profile: p,
    };
  }

  const keywords = pickMusicKeywords({ profile: p, seedKey: `${jobId || "kf"}|${framePack || ""}`, narration });
  const candidates = [];
  // The lead query is the pack's keywords plus its mood word — specific enough to land in
  // the right genre, short enough that the provider returns something. fetchMusic already
  // dedupes words and widens a dry query, so a two-keyword phrase is safe to lead with.
  if (keywords.length) candidates.push([...keywords, p.mood].filter(Boolean).join(" "));
  // Then each keyword alone (a widening step inside the template's own vocabulary),
  // then the script's subject-derived query, then the pack's raw style tags.
  for (const k of keywords) candidates.push(k);
  if (scriptQuery) candidates.push(scriptQuery);
  if (p.style.length) candidates.push(p.style.slice(0, 2).join(" "));

  return {
    candidates: [...new Set(candidates.map((c) => c.trim()).filter(Boolean))].slice(0, 5),
    source: "template", keywords, profile: p,
  };
}

/**
 * paletteCueFor(profile, intent) → the pack's variant of a resolved cue intent, or the
 * intent unchanged.
 *
 * A BIAS, never a filter. audio_cues.intentFor still decides WHAT this moment is (a
 * transition, a reveal, a data tick, the close); the palette only decides what that
 * function SOUNDS like on this template — terminal-departures' transition is a synthy
 * sweep, paper-tales' is a paper slide. An intent the pack does not map keeps today's
 * resolution exactly.
 */
const INTENT_ROLE = {
  "whoosh": "transition", "card-slide": "transition", "light-sweep": "transition",
  "ui-click": "ui", "soft-tap": "ui", "pop": "ui", "notification": "ui",
  "product-reveal": "reveal", "gentle-impact": "reveal", "shimmer": "reveal", "logo-rise": "reveal",
  "counter-tick": "data", "data-ping": "data",
  "cta-impact": "cta", "success": "cta",
};

function paletteCueFor(profile, intent) {
  const p = profile || NEUTRAL;
  const role = INTENT_ROLE[intent];
  if (!role) return intent;
  const mapped = p.sfxPalette && p.sfxPalette[role];
  return (mapped && CUES[mapped]) ? mapped : intent;
}

/** The scene functions a palette may map. Exported so the manifest schema and the
 *  validator agree on one list rather than two that can drift. */
const PALETTE_ROLES = ["transition", "ui", "reveal", "data", "cta", "ambient"];

module.exports = {
  profileFor, pickMusicKeywords, musicCandidatesFor, paletteCueFor,
  PALETTE_ROLES, NEUTRAL, ENERGY, TEMPO,
};
// Test seam: the rotation must be deterministic and the palette must never emit a cue
// the library cannot resolve — both are asserted directly in scripts/test-audio.js.
module.exports.__test = { hash32, mulberry32, shuffled, INTENT_ROLE };
