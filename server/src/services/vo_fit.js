// Stage 11 helper: make a scene's voiceover FIT its scene.
// Measure the synthesized clip with ffprobe; if it overruns the scene by
// more than 10%, ask the fast model ONCE for a tighter line and re-synth.

const { spawn } = require("node:child_process");
const openrouter = require("./openrouter");
const { synthesize } = require("./tts");

function probeDurationSec(filePath) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath]);
    let out = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, 15_000);
    p.on("error", () => { clearTimeout(timer); resolve(null); });
    p.on("exit", (code) => {
      clearTimeout(timer);
      const v = parseFloat(out.trim());
      resolve(code === 0 && Number.isFinite(v) ? v : null);
    });
  });
}

async function tightenLine({ line, targetSec, signal }) {
  const targetWords = Math.max(3, Math.floor(targetSec * 2.6));
  const { text, tokensIn, tokensOut } = await openrouter.chat({
    system: "You tighten voiceover lines. Reply with ONLY the rewritten line — no quotes, no commentary. Preserve the meaning and any names/numbers exactly.",
    user: `Rewrite this voiceover line to at most ${targetWords} words so it can be spoken comfortably in ${targetSec} seconds:\n${line}`,
    stage: "vo_fit",
    temperature: 0.4,
    signal,
  });
  return { line: text.trim().replace(/^["']|["']$/g, ""), tokensIn, tokensOut };
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

  await synthOnce({ text, voice, instructions, outputPath, tracker });
  let dur = await probeDurationSec(outputPath);
  if (dur == null) return { path: outputPath, durationSec: targetSec, text, tightened: false };

  let spokenText = text;
  let tightened = false;

  if (dur > targetSec * 1.10) {
    console.log(`[vo_fit] scene VO ${dur.toFixed(1)}s > ${targetSec}s budget — tightening once`);
    try {
      const t = await tightenLine({ line: text, targetSec, signal });
      if (tracker) tracker.addLlm({ inputTokens: t.tokensIn, outputTokens: t.tokensOut });
      await synthOnce({ text: t.line, voice, instructions, outputPath, tracker });
      dur = (await probeDurationSec(outputPath)) ?? targetSec;
      spokenText = t.line;
      tightened = true;
    } catch (e) {
      console.warn(`[vo_fit] tighten failed (${e.message}); keeping original take`);
    }
  }

  // Last resort: never let a clip exceed scene + 25% — fade it out.
  const hardCap = targetSec * 1.25;
  if (dur > hardCap) {
    console.warn(`[vo_fit] VO still ${dur.toFixed(1)}s after tighten — trimming to ${hardCap.toFixed(1)}s with fade`);
    if (await trimWithFade(outputPath, hardCap)) dur = hardCap;
  }

  return { path: outputPath, durationSec: dur, text: spokenText, tightened };
}

module.exports = { synthesizeFitted, probeDurationSec };
