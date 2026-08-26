// Stage 11 helper: make a scene's voiceover FIT its scene.
// Measure the synthesized clip with ffprobe; if it overruns the scene by
// more than 10%, ask the fast model ONCE for a tighter line and re-synth.

const fs = require("node:fs");
const { spawn } = require("node:child_process");
const openrouter = require("./openrouter");
const { synthesize } = require("./tts");
const { probeDurationSec } = require("./media"); // shared ffprobe helper (was duplicated here)

async function tightenLine({ line, targetSec, signal }) {
  const targetWords = Math.max(3, Math.floor(targetSec * 2.6));
  const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
    system: "You tighten voiceover lines. Reply with ONLY the rewritten line — no quotes, no commentary. Preserve the meaning and any names/numbers exactly.",
    user: `Rewrite this voiceover line to at most ${targetWords} words so it can be spoken comfortably in ${targetSec} seconds:\n${line}`,
    stage: "vo_fit",
    temperature: 0.4,
    signal,
  });
  return { line: text.trim().replace(/^["']|["']$/g, ""), tokensIn, tokensOut, costUsd };
}

// Did the model ad-lib? The spoken transcript materially longer than the
// requested line means extra content was invented.
function transcriptBloated(text, transcript) {
  if (!transcript) return false;
  return transcript.length > text.length * 1.6 + 24;
}

// Synthesize once; if the model embellished (transcript >> input), retry once
// with the same line — the read-exactly framing usually lands on take two. The
// retake carries an explicit word count (observed: gpt-audio turning an 8-word
// line into 40s of invented copy that then gets hard-trimmed mid-sentence),
// and when BOTH takes ramble we keep the one closer to the written line
// instead of blindly shipping take two.
async function synthOnce({ text, voice, instructions, outputPath, tracker, session, lang }) {
  const meta = {};
  await synthesize({ script: text, voice, instructions, outputPath, tracker, meta, session, lang });
  if (transcriptBloated(text, meta.transcript)) {
    console.warn(`[vo_fit] model ad-libbed (${meta.transcript.length}ch spoken for ${text.length}ch line) — one retake`);
    const words = (text.match(/\S+/g) || []).length;
    const strict = `${instructions ? `${instructions} ` : ""}CRITICAL: the script is exactly ${words} word${words === 1 ? "" : "s"} long — speak ONLY those words and stop.`;
    const retakePath = outputPath + ".retake.mp3";
    const meta2 = {};
    try {
      await synthesize({ script: text, voice, instructions: strict, outputPath: retakePath, tracker, meta: meta2, session, lang });
      const better = !meta2.transcript || !meta.transcript
        || Math.abs(meta2.transcript.length - text.length) <= Math.abs(meta.transcript.length - text.length);
      if (better) {
        fs.renameSync(retakePath, outputPath);
        return meta2;
      }
      console.warn(`[vo_fit] retake rambled worse (${meta2.transcript.length}ch vs ${meta.transcript.length}ch) — keeping take one`);
      try { fs.unlinkSync(retakePath); } catch { /* noop */ }
    } catch {
      try { fs.unlinkSync(retakePath); } catch { /* noop */ }
    }
  }
  return meta;
}

// Gentle backstop: SPEED the read to fit instead of cutting it. An atempo of
// ≤1.18× is imperceptible next to a mid-sentence fade-out, and it keeps every
// word — the tighten pass routinely lands a hair over budget (TTS reads slower
// than the words/sec heuristic), and trimming those takes was the #1 source of
// "the voice cuts off mid-line".
function atempoFit(filePath, rate) {
  return new Promise((resolve) => {
    const tmp = filePath + ".atempo.mp3";
    const p = spawn("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error", "-i", filePath,
      "-af", `atempo=${rate.toFixed(4)}`,
      tmp,
    ]);
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, 30_000);
    p.on("error", () => { clearTimeout(timer); resolve(false); });
    p.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        try { fs.renameSync(tmp, filePath); resolve(true); return; } catch { /* noop */ }
      }
      try { fs.unlinkSync(tmp); } catch { /* noop */ }
      resolve(false);
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
async function synthesizeFitted({ text, targetSec, voice, instructions, outputPath, tracker, signal, session, lang }) {
  if (!text || !text.trim()) return null;

  let synthMeta = await synthOnce({ text, voice, instructions, outputPath, tracker, session, lang });
  let dur = await probeDurationSec(outputPath);
  if (dur == null) return { path: outputPath, durationSec: targetSec, text, tightened: false, fallbackVoice: synthMeta?.fallbackVoice || null };

  let spokenText = text;
  let tightened = false;

  if (dur > targetSec * 1.10) {
    console.log(`[vo_fit] scene VO ${dur.toFixed(1)}s > ${targetSec}s budget — tightening once`);
    try {
      const t = await tightenLine({ line: text, targetSec, signal });
      if (tracker) tracker.addLlm({ inputTokens: t.tokensIn, outputTokens: t.tokensOut, stage: "vo_fit", costUsd: t.costUsd });
      synthMeta = await synthOnce({ text: t.line, voice, instructions, outputPath, tracker, session, lang }) || synthMeta;
      dur = (await probeDurationSec(outputPath)) ?? targetSec;
      spokenText = t.line;
      tightened = true;
    } catch (e) {
      console.warn(`[vo_fit] tighten failed (${e.message}); keeping original take`);
    }
  }

  // Never let a clip exceed scene + 25%. First choice: speed the read up to
  // 1.18× so the WHOLE line survives; only a take that is still over after
  // that (a rambling ad-lib the retake didn't cure) gets the trim+fade.
  const hardCap = targetSec * 1.25;
  if (dur > hardCap) {
    const rate = Math.min(dur / hardCap, 1.18);
    if (rate > 1.01 && (await atempoFit(outputPath, rate))) {
      dur = (await probeDurationSec(outputPath)) ?? dur / rate;
      console.log(`[vo_fit] VO over budget — sped ${rate.toFixed(2)}x to ${dur.toFixed(1)}s (cap ${hardCap.toFixed(1)}s), no words lost`);
    }
    if (dur > hardCap + 0.05) {
      console.warn(`[vo_fit] VO still ${dur.toFixed(1)}s after tighten+atempo — trimming to ${hardCap.toFixed(1)}s with fade`);
      if (await trimWithFade(outputPath, hardCap)) dur = hardCap;
    }
  }

  return { path: outputPath, durationSec: dur, text: spokenText, tightened, fallbackVoice: synthMeta?.fallbackVoice || null };
}

module.exports = { synthesizeFitted, probeDurationSec };
