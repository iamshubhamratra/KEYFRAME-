// Stage 11 helper: make a scene's voiceover FIT its scene.
// Measure the synthesized clip with ffprobe; if it overruns the scene by
// more than 10%, ask the fast model ONCE for a tighter line and re-synth.

const { spawn } = require("node:child_process");
const openrouter = require("./openrouter");
const { synthesize } = require("./tts");
const { probeDurationSec } = require("./media"); // shared ffprobe helper (was duplicated here)

async function tightenLine({ line, targetSec, signal }) {
  // ~2.1 words/sec is the REAL delivered rate of the gpt-audio voices (2.6 was
  // optimistic and left every "fitted" line still overrunning its scene). Leave a
  // little headroom so the rewritten line actually fits when spoken.
  const targetWords = Math.max(3, Math.floor(targetSec * 2.1));
  const { text, tokensIn, tokensOut, model, provider } = await openrouter.chat({
    system: "You tighten voiceover lines. Reply with ONLY the rewritten line — no quotes, no commentary. Preserve the meaning and any names/numbers exactly.",
    user: `Rewrite this voiceover line to at most ${targetWords} words so it can be spoken comfortably in ${targetSec} seconds:\n${line}`,
    stage: "vo_fit",
    temperature: 0.4,
    signal,
  });
  // model/provider are forwarded because synthesizeFitted's tracker.addLlm already
  // reads t.model / t.provider — they were simply never returned, so every tighten
  // call was priced at the default (OpenRouter) rate even when KIE served it.
  return { line: text.trim().replace(/^["']|["']$/g, ""), tokensIn, tokensOut, model, provider };
}

// Did the model ad-lib? The spoken transcript materially longer than the
// requested line means extra content was invented.
function transcriptBloated(text, transcript) {
  if (!transcript) return false;
  return transcript.length > text.length * 1.6 + 24;
}

// Synthesize once; if the model embellished (transcript >> input), retry once
// with the same line — the read-exactly framing usually lands on take two.
async function synthOnce({ text, voice, instructions, outputPath, tracker }) {
  const meta = {};
  await synthesize({ script: text, voice, instructions, outputPath, tracker, meta });
  if (transcriptBloated(text, meta.transcript)) {
    console.warn(`[vo_fit] model ad-libbed (${meta.transcript.length}ch spoken for ${text.length}ch line) — one retake`);
    const meta2 = {};
    await synthesize({ script: text, voice, instructions, outputPath, tracker, meta: meta2 });
    return meta2;
  }
  return meta;
}

// Fit a clip to its scene by GENTLY speeding it up (atempo) — keeps every word and
// stays in sync with the scene, unlike a hard trim. Capped so it never sounds
// chipmunky. Returns the new duration (or the old one if nothing was done).
function atempoFit(filePath, targetSec, currentDur, maxTempo) {
  return new Promise((resolve) => {
    const factor = Math.min(maxTempo, Math.max(1.0, currentDur / targetSec));
    if (factor <= 1.02) { resolve(currentDur); return; }
    const tmp = filePath + ".sp.mp3";
    const p = spawn("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error", "-i", filePath,
      "-filter:a", `atempo=${factor.toFixed(4)}`, tmp,
    ]);
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, 30_000);
    p.on("error", () => { clearTimeout(timer); resolve(currentDur); });
    p.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        try { require("node:fs").renameSync(tmp, filePath); resolve(currentDur / factor); return; } catch { /* noop */ }
      }
      try { require("node:fs").unlinkSync(tmp); } catch { /* noop */ }
      resolve(currentDur);
    });
  });
}

// Hard backstop: trim the clip to the scene budget + grace with a fade-out,
// so a slow read can never talk over the next scene's line.
function trimWithFade(filePath, maxSec) {
  return new Promise((resolve) => {
    const tmp = filePath + ".trim.mp3";
    const fadeStart = Math.max(0, maxSec - 0.35);
    const p = spawn("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error", "-i", filePath,
      "-t", String(maxSec), "-af", `afade=t=out:st=${fadeStart}:d=0.35`,
      tmp,
    ]);
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, 30_000);
    p.on("error", () => { clearTimeout(timer); resolve(false); });
    p.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        try { require("node:fs").renameSync(tmp, filePath); resolve(true); return; } catch { /* noop */ }
      }
      try { require("node:fs").unlinkSync(tmp); } catch { /* noop */ }
      resolve(false);
    });
  });
}

// Synthesize one scene's VO, tightening once if it overruns, hard-trimming
// as the last resort. Returns { path, durationSec, text, tightened } or null.
async function synthesizeFitted({ text, targetSec, voice, instructions, outputPath, tracker, signal }) {
  if (!text || !text.trim()) return null;

  let synthMeta = await synthOnce({ text, voice, instructions, outputPath, tracker });
  let dur = await probeDurationSec(outputPath);
  if (dur == null) return { path: outputPath, durationSec: targetSec, text, tightened: false, fallbackVoice: synthMeta?.fallbackVoice || null };

  let spokenText = text;
  let tightened = false;

  if (dur > targetSec * 1.10) {
    console.log(`[vo_fit] scene VO ${dur.toFixed(1)}s > ${targetSec}s budget — tightening once`);
    try {
      const t = await tightenLine({ line: text, targetSec, signal });
      if (tracker) tracker.addLlm({ inputTokens: t.tokensIn, outputTokens: t.tokensOut, stage: "vo_fit", model: t.model, provider: t.provider });
      synthMeta = await synthOnce({ text: t.line, voice, instructions, outputPath, tracker }) || synthMeta;
      dur = (await probeDurationSec(outputPath)) ?? targetSec;
      spokenText = t.line;
      tightened = true;
    } catch (e) {
      console.warn(`[vo_fit] tighten failed (${e.message}); keeping original take`);
    }
  }

  // Fit the clip INSIDE its scene window so consecutive lines can never overlap:
  // gently speed it up (keeps every word, stays synced) rather than trimming. The
  // small maxTempo cap keeps it natural; any residual overrun is absorbed by the
  // mixer's VO sequencing.
  if (dur > targetSec * 1.03) {
    const newDur = await atempoFit(outputPath, targetSec, dur, 1.35);
    if (newDur && newDur < dur - 0.02) {
      console.log(`[vo_fit] fitted VO ${dur.toFixed(2)}s -> ${newDur.toFixed(2)}s into ${targetSec}s scene (atempo)`);
      dur = newDur;
    }
  }
  // Absolute backstop: if it STILL overruns (atempo capped — usually a bad TTS
  // ad-lib), trim close to the scene with a fade so lines never push cumulatively
  // off the end of the film.
  const hardCap = targetSec * 1.05;
  if (dur > hardCap) {
    console.warn(`[vo_fit] VO still ${dur.toFixed(1)}s — trimming to ${hardCap.toFixed(1)}s with fade`);
    if (await trimWithFade(outputPath, hardCap)) dur = hardCap;
  }

  return { path: outputPath, durationSec: dur, text: spokenText, tightened, fallbackVoice: synthMeta?.fallbackVoice || null };
}

module.exports = { synthesizeFitted, probeDurationSec };
