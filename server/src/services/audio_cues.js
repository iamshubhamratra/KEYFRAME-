// AUDIO CUES — the sound-design vocabulary, and the conditioning every cue passes
// through before it is allowed near the mix.
//
// TWO PROBLEMS THIS SOLVES (see AUDIO-AUDIT-2026-07-28.md §0-§2):
//
// 1. TIMBRE WAS NEVER DECIDED. The candidate cue names came from the script model's
//    free-text `scene.sfx[]` and were matched against a 9-word library, so a logo reveal,
//    a counter, a card slide and a CTA all asked for "whoosh". Nothing in the pipeline
//    mapped what a scene DOES to what it should SOUND like. The Audio Director could not
//    fix it either — it curates candidates that were already fetched, so given a bad
//    whoosh its only options were to accept it or leave silence.
//
// 2. LEVELS WERE NOT COMPARABLE. Cues arrived from a live keyword search with no gate at
//    all, and even the shipped library was program-normalized (`loudnorm=I=-18`) — which
//    is meaningless on a sub-second one-shot. Measured: `impact` sat 8 dB below every
//    other cue, so the film's climax hit was inaudible by construction.
//
// The vocabulary below is INTENT-first: a scene declares what is happening, and the cue
// table decides the sound. Conditioning then makes every cue — curated or fetched —
// arrive at the mixer peak-normalized, trimmed, edge-faded and length-bounded, so the
// director's dB decisions mean the same thing for every cue.

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

// ---------------------------------------------------------------- vocabulary
//
// `file` is the curated asset that best carries the intent (the library is small, so
// several intents share a source — the FAMILY trim and the director's gain differentiate
// them). `query` is what to search for if the curated file is missing. `trimDb` is a
// family-level offset applied after peak normalization, because a click and a riser
// peaking at the same level are not perceived at the same level.
const CUES = {
  // — UI / interface -------------------------------------------------------------
  "ui-click":      { file: "click",      query: "ui click",            trimDb: -3, maxSec: 0.6, family: "ui" },
  "soft-tap":      { file: "click",      query: "soft tap",            trimDb: -5, maxSec: 0.6, family: "ui" },
  "pop":           { file: "pop",        query: "ui pop",              trimDb: -3, maxSec: 0.8, family: "ui" },
  "notification":  { file: "ding",       query: "notification tone",   trimDb: -4, maxSec: 1.5, family: "ui" },
  // — motion / transition --------------------------------------------------------
  "card-slide":    { file: "swoosh",     query: "soft swoosh",         trimDb: -6, maxSec: 1.2, family: "motion" },
  "whoosh":        { file: "whoosh",     query: "whoosh transition",   trimDb: -5, maxSec: 1.5, family: "motion" },
  "light-sweep":   { file: "transition", query: "light sweep",         trimDb: -5, maxSec: 1.8, family: "motion" },
  // — reveal / emphasis ----------------------------------------------------------
  "logo-rise":     { file: "riser",      query: "cinematic rise",      trimDb: -4, maxSec: 2.5, family: "reveal" },
  "product-reveal":{ file: "impact",     query: "cinematic impact",    trimDb:  0, maxSec: 2.5, family: "reveal" },
  "gentle-impact": { file: "impact",     query: "soft impact",         trimDb: -4, maxSec: 2.0, family: "reveal" },
  "shimmer":       { file: "sparkle",    query: "ambient shimmer",     trimDb: -6, maxSec: 2.0, family: "reveal" },
  // — data -----------------------------------------------------------------------
  "counter-tick":  { file: "click",      query: "digital tick",        trimDb: -7, maxSec: 0.4, family: "data" },
  "data-ping":     { file: "ding",       query: "digital ping",        trimDb: -6, maxSec: 1.0, family: "data" },
  // — outcome --------------------------------------------------------------------
  "success":       { file: "ding",       query: "positive confirmation", trimDb: -3, maxSec: 1.5, family: "outcome" },
  "cta-impact":    { file: "impact",     query: "cinematic impact",    trimDb:  0, maxSec: 2.5, family: "outcome" },
};
const CUE_NAMES = Object.keys(CUES);

// What the script model actually writes, mapped onto the intent vocabulary. Free text is
// never used directly — an unrecognised word resolves through `intentFor` instead.
const SYNONYMS = {
  click: "ui-click", tap: "soft-tap", "ui click": "ui-click", button: "ui-click",
  pop: "pop", bubble: "pop", "pop in": "pop",
  ding: "notification", bell: "notification", chime: "notification", notify: "notification", notification: "notification",
  swoosh: "card-slide", swipe: "card-slide", slide: "card-slide",
  whoosh: "whoosh", woosh: "whoosh", sweep: "light-sweep", transition: "light-sweep", pass: "whoosh",
  riser: "logo-rise", rise: "logo-rise", build: "logo-rise", buildup: "logo-rise", ramp: "logo-rise",
  impact: "product-reveal", boom: "product-reveal", hit: "gentle-impact", slam: "product-reveal", thud: "gentle-impact",
  "bass drop": "product-reveal", drop: "product-reveal",
  sparkle: "shimmer", shimmer: "shimmer", twinkle: "shimmer", magic: "shimmer", glitter: "shimmer",
  tick: "counter-tick", ping: "data-ping", blip: "data-ping", beep: "data-ping",
  success: "success", confirm: "success", complete: "success",
};

// SCENE SEMANTICS → INTENT. This is the table the audit found missing: it decides the cue
// from what the scene actually does, so the sound reinforces the picture instead of being
// whatever word the script model happened to type.
//
// Order matters — the most specific signal wins.
function intentFor({ role, kind, animation, hasNumber, hasAsset, isLogo, isFirst, isLast } = {}) {
  const k = String(kind || "").toLowerCase();
  const a = String(animation || "").toLowerCase();
  const r = String(role || "").toLowerCase();

  if (isLogo) return "logo-rise";                                   // the mark arrives
  if (isLast || r === "cta" || k === "cta") return "cta-impact";     // the close lands
  if (hasNumber || k === "chart" || k === "countdown" || k === "stat") return "counter-tick";
  if (r === "proof") return "success";                              // a result confirmed
  if (isFirst || r === "hook" || k === "hook" || k === "title") return "logo-rise";
  if (hasAsset || r === "feature" || k === "showcase") return "product-reveal";
  if (a === "scale-pop" || a === "char-pop") return "pop";
  if (a === "typewriter") return "counter-tick";
  if (a === "slide-left" || a === "slide-up" || a === "drift") return "card-slide";
  if (a === "mask-reveal" || a === "line-wipe") return "light-sweep";
  return "whoosh";                                                  // a plain cut
}

// Free text (script `sfx[]`) → intent, or null when the word means nothing to us.
function resolveIntent(name) {
  const n = String(name || "").toLowerCase().trim();
  if (!n) return null;
  if (CUES[n]) return n;
  if (SYNONYMS[n]) return SYNONYMS[n];
  for (const w of n.split(/[^a-z]+/).filter(Boolean)) {
    if (CUES[w]) return w;
    if (SYNONYMS[w]) return SYNONYMS[w];
  }
  return null;
}

// ---------------------------------------------------------------- conditioning
//
// Every cue passes through this, whatever its origin, so the mixer's dB decisions mean the
// same thing for all of them:
//
//   silenceremove  leading silence stripped — a cue must fire ON its beat, not 300ms late
//   atrim          bounded to the family's maxSec — a 6s "click" is a mis-tagged file
//   highpass       sub-bass removed; it only muddies the voice and eats headroom
//   afade          3ms in / 60ms out — kills the edge click on a hard-cut file
//   volume + peak  PEAK-normalized (not program-normalized): the audit's A2. A one-shot
//                  has no meaningful integrated loudness, which is exactly how `impact`
//                  ended up 8 dB below the rest of the library.
const TARGET_PEAK_DB = -1.5;

function ffprobePeakDb(absPath) {
  return new Promise((resolve) => {
    // NOTE THE LOG LEVEL. astats writes its measurements at INFO; running it under
    // `-v error` (the habit everywhere else in this codebase) prints nothing at all, and
    // this function then reports every cue as "unmeasurable" and conditions none of them.
    const p = spawn("ffmpeg", ["-hide_banner", "-nostats", "-i", absPath, "-af", "astats=measure_overall=Peak_level:measure_perchannel=none", "-f", "null", "-"], { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", () => resolve(null));
    p.on("exit", () => {
      const m = err.match(/Peak level dB:\s*(-?[\d.]+|-?inf)/i);
      if (!m) return resolve(null);
      // ffmpeg reports digital silence as "-inf", which parseFloat turns into NaN. Left
      // as null that reads as "unmeasurable → keep", so a silent file would ship as a cue.
      // It is not unmeasurable; it is silent, and -120 dBFS says so to the caller's gate.
      if (/inf/i.test(m[1])) return resolve(-120);
      const v = parseFloat(m[1]);
      resolve(Number.isFinite(v) ? v : null);
    });
  });
}

/**
 * conditionCue(absPath, intent) → { ok, peakDb, gainDb, durationSec } | { ok:false, reason }
 * Rewrites the file in place. Fail-open: an unmeasurable file is left alone rather than
 * dropped, because a slightly-hot cue beats a silent film.
 */
async function conditionCue(absPath, intent) {
  const spec = CUES[intent] || { trimDb: -4, maxSec: 2.5 };
  const peak = await ffprobePeakDb(absPath);
  if (peak === null) return { ok: true, peakDb: null, gainDb: 0, skipped: "unmeasurable" };
  // Silence / near-silence is not a cue.
  if (peak < -45) return { ok: false, reason: `silent (peak ${peak.toFixed(1)} dBFS)` };
  const gainDb = Math.round(((TARGET_PEAK_DB - peak) + spec.trimDb) * 10) / 10;

  const tmp = absPath + ".cond.mp3";
  const fadeOut = Math.max(0.03, Math.min(0.12, spec.maxSec * 0.08));
  const filter = [
    "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.01",
    `atrim=0:${spec.maxSec}`,
    "highpass=f=60",
    `volume=${gainDb}dB`,
    `afade=t=in:st=0:d=0.003`,
    `areverse,afade=t=in:st=0:d=${fadeOut},areverse`,   // trailing fade without knowing the length
    "aresample=44100",
  ].join(",");

  const ok = await new Promise((resolve) => {
    const p = spawn("ffmpeg", ["-y", "-v", "error", "-i", absPath, "-af", filter, "-ar", "44100", "-b:a", "160k", tmp], { windowsHide: true });
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, 20_000);
    p.on("error", () => { clearTimeout(timer); resolve(false); });
    p.on("exit", (code) => { clearTimeout(timer); resolve(code === 0 && fs.existsSync(tmp) && fs.statSync(tmp).size > 512); });
  });
  if (!ok) { try { fs.unlinkSync(tmp); } catch { /* noop */ } return { ok: true, peakDb: peak, gainDb: 0, skipped: "conditioning failed" }; }
  try { fs.renameSync(tmp, absPath); } catch { try { fs.copyFileSync(tmp, absPath); fs.unlinkSync(tmp); } catch { /* noop */ } }
  return { ok: true, peakDb: peak, gainDb, conditioned: true };
}

// What an intent needs to be TRUE ON SCREEN to be worth firing (consumed by sfx_plan).
// A cue with nothing to land on is the "sound unrelated to the visuals" complaint.
//   cut     — a scene boundary; every composer animates an entrance there
//   reveal  — something arrives mid-scene (a stat, a plate, a second line)
//   build   — only meaningful heading INTO the climax
const FAMILY_NEEDS = { motion: "cut", ui: "reveal", reveal: "reveal", data: "reveal", outcome: "build" };
function needsFor(intent) {
  const spec = CUES[intent];
  if (!spec) return "cut";
  if (intent === "success") return "reveal";      // a confirmation lands on the result, not a build
  return FAMILY_NEEDS[spec.family] || "cut";
}

module.exports = { CUES, CUE_NAMES, SYNONYMS, intentFor, resolveIntent, conditionCue, needsFor, TARGET_PEAK_DB };
