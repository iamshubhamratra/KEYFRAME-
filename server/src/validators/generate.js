// Request validation for POST /api/generate (the single-shot pipeline).

const config = require("../config");
const { PACE_MODES } = require("./common");

function validateGenerate(body) {
  const errs = [];
  const out = {};

  if (typeof body !== "object" || body === null) return { errs: ["body must be JSON object"], out };

  if (typeof body.prompt !== "string") errs.push("prompt must be a string");
  else {
    const p = body.prompt.trim();
    if (p.length < 10) errs.push("prompt must be at least 10 characters");
    else if (p.length > 2000) errs.push("prompt must be at most 2000 characters");
    else out.prompt = p;
  }

  const d = Number(body.duration);
  if (!Number.isFinite(d)) errs.push("duration must be a number");
  else if (d < config.server.minDurationSec) errs.push(`duration must be >= ${config.server.minDurationSec}`);
  else if (d > config.server.maxDurationSec) errs.push(`duration must be <= ${config.server.maxDurationSec}`);
  else out.duration = Math.round(d);

  const orientation = body.orientation || config.defaults.orientation;
  if (!config.orientations[orientation]) {
    errs.push(`orientation must be one of: ${Object.keys(config.orientations).join(", ")}`);
  } else {
    out.orientation = orientation;
  }

  const quality = body.quality || body.resolution || config.defaults.quality;
  if (!config.qualities[quality]) {
    errs.push(`quality must be one of: ${Object.keys(config.qualities).join(", ")}`);
  } else {
    out.quality = quality;
  }

  let fps = body.fps == null ? config.defaults.fps : Number(body.fps);
  if (!config.allowedFps.includes(fps)) {
    errs.push(`fps must be one of: ${config.allowedFps.join(", ")}`);
  } else {
    out.fps = fps;
  }

  // Pace — how DENSELY the film is told: shorter scenes and more cuts at the
  // SAME runtime, never a sped-up MP4 (see services/pacing.js). JSON-only route,
  // so a strict string check is enough; absent means the configured default.
  if (body.pace != null && body.pace !== "") {
    if (typeof body.pace !== "string" || !PACE_MODES.includes(body.pace)) {
      errs.push(`pace must be one of: ${PACE_MODES.join(", ")}`);
    } else {
      out.pace = body.pace;
    }
  } else {
    out.pace = config.defaults.pace;
  }

  // Voiceover and music default ON. Under `=== true` a bare call — prompt and
  // duration, no flags — asked for nothing, which is how 7 of 12 delivered films
  // shipped with no audio track at all. Omitting the flag now means ON; only an
  // explicit false makes a silent film. Sound effects stay opt-in: they are
  // seasoning over a mix, not what makes a film a film. JSON-only route (only
  // express.json is mounted), so `!== false` sees real booleans, never "false".
  out.tts = body.tts !== false;
  out.music = body.music !== false;
  out.soundEffect = body.sound_effect === true || body.soundEffect === true;

  // Subtitles/captions are OPT-IN (default off) — users overwhelmingly dislike
  // burnt-in subtitles on short promo videos.
  out.captions = body.captions === true;

  // Images default ON for the same reason: two thirds of delivered films held not
  // one photograph, and one 35s film was cream paper end to end (mean content
  // coverage 10%, worst frame 0.6%). Stock VIDEO stays opt-in — b-roll clips are a
  // separate product decision, not the picture floor.
  out.images = body.images !== false;
  out.video = body.video === true;

  // Three.js/WebGL cinematic composer (opt-in). Default off → scene-kit.
  out.render3d = body.render3d === true || body.threeD === true;

  // Compose mode: "premium" = the bespoke LLM composition agent (remix); absent
  // or "standard" = the deterministic scene-kit. Parity with the projects route,
  // so the single-shot endpoint can also request a premium finish.
  if (body.composeMode != null && body.composeMode !== "") {
    if (body.composeMode !== "standard" && body.composeMode !== "premium") {
      errs.push(`composeMode must be "standard" or "premium"`);
    } else {
      out.remix = body.composeMode === "premium";
    }
  }
  if (body.remix === true) out.remix = true;

  // Optional voice override for TTS.
  const { VALID_VOICES } = require("../services/audio_planner");
  if (body.voice != null) {
    if (typeof body.voice !== "string" || !VALID_VOICES.has(body.voice)) {
      errs.push(`voice must be one of: ${[...VALID_VOICES].join(", ")}`);
    } else {
      out.voice = body.voice;
    }
  }

  // Frame pack (design system). An explicit pack is STRICT (honored verbatim
  // through the whole pipeline). Omitted or "auto" stays null so the brief's
  // tone-matched suggestion picks the pack (pre-resolving to the default here
  // used to send every "auto" video to the same pack).
  const frameRegistry = require("../services/frame_registry");
  if (body.framePack != null && body.framePack !== "auto") {
    if (typeof body.framePack !== "string" || frameRegistry.resolvePack(body.framePack) == null) {
      errs.push(`framePack must be "auto" or one of: ${frameRegistry.listPacks().join(", ")}`);
    } else {
      out.framePack = body.framePack;
    }
  } else {
    out.framePack = null; // auto — resolved from the brief after intake
  }

  return { errs, out };
}

module.exports = { validateGenerate };
