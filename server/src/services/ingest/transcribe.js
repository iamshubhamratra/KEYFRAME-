// Ingest worker 1a: reference video -> transcript + visual style notes.
//
//   1. ffmpeg extracts mono 16kHz wav
//   2. STT: local faster-whisper (scripts/transcribe.py) by default, or a
//      hosted OpenAI-compatible endpoint when config.stt.provider says so
//   3. ffmpeg samples N evenly-spaced frames -> vision-capable LLM writes a
//      one-paragraph visual style summary (pacing, palette, energy)
//
// Output: { transcript, segments[], language, visualStyleNotes }

const fs = require("node:fs");
const path = require("node:path");
const { spawnCompat } = require("../spawn_compat");
const config = require("../../config");
const openrouter = require("../openrouter");

function run(cmd, args, { timeoutMs = 120_000, collectStdout = true } = {}) {
  return new Promise((resolve, reject) => {
    // spawnCompat runs .cmd shims under a shell (CVE-2024-27980) with
    // pre-quoted args (avoids DEP0190); everything else spawns directly.
    const p = spawnCompat(cmd, args);
    let out = "", err = "";
    if (collectStdout) p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", (d) => { err += d.toString(); });
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, timeoutMs);
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout: out, stderr: err });
      else reject(new Error(`${cmd} exit ${code}: ${err.slice(-400)}`));
    });
  });
}

async function extractAudio(videoPath, outDir) {
  const wav = path.join(outDir, "ingest_audio.wav");
  await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", wav], { timeoutMs: 300_000 });
  return wav;
}

async function sttLocal(wavPath) {
  const script = path.join(config.paths.root, "scripts", "transcribe.py");
  const modelSize = config.stt?.localModel || "small";
  const python = config.stt?.pythonBin || (process.platform === "win32" ? "python" : "python3");
  // Whisper small on CPU runs ~1x realtime; allow 10 min for long uploads.
  const { stdout } = await run(python, [script, wavPath, modelSize], { timeoutMs: 600_000 });
  const parsed = JSON.parse(stdout.trim().split("\n").pop());
  if (parsed.error) throw new Error(`local stt: ${parsed.error}`);
  return parsed;
}

async function sttHosted(wavPath) {
  // OpenAI-compatible /audio/transcriptions (Groq, Deepgram's compat layer, etc.)
  const { baseUrl, apiKey, model } = config.stt || {};
  if (!baseUrl || !apiKey) throw new Error("hosted stt: config.stt.baseUrl/apiKey missing");
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(wavPath)]), "audio.wav");
  form.append("model", model || "whisper-large-v3");
  form.append("response_format", "verbose_json");
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(300_000),
  });
  if (!resp.ok) throw new Error(`hosted stt: HTTP ${resp.status} — ${(await resp.text()).slice(0, 300)}`);
  const j = await resp.json();
  return {
    transcript: j.text || "",
    segments: (j.segments || []).map((s) => ({ start: s.start, end: s.end, text: (s.text || "").trim() })),
    language: j.language || "unknown",
    durationSec: j.duration,
  };
}

async function sampleFrames(videoPath, outDir, count = 8) {
  // Probe duration, then grab `count` evenly spaced frames at low resolution
  // (the vision model needs gist, not pixels).
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", videoPath]);
  const duration = Math.max(1, parseFloat(stdout.trim()) || 1);
  const frames = [];
  for (let i = 0; i < count; i++) {
    const t = ((i + 0.5) / count) * duration;
    const out = path.join(outDir, `ingest_frame_${i}.jpg`);
    try {
      await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", t.toFixed(2), "-i", videoPath, "-vframes", "1", "-vf", "scale=480:-2", "-q:v", "5", out], { timeoutMs: 60_000 });
      frames.push(out);
    } catch { /* a missing frame is fine */ }
  }
  return frames;
}

async function describeVisualStyle(framePaths, { signal } = {}) {
  if (!framePaths.length) return null;
  const content = [
    {
      type: "text",
      text: "These are evenly-spaced frames from one video, in order. In ONE paragraph (under 120 words), describe its visual style for a motion-design team: pacing/energy, color palette (name dominant colors), typography if visible, framing, and overall mood. No preamble.",
    },
    ...framePaths.map((p) => ({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}` },
    })),
  ];
  const { text, tokensIn, tokensOut } = await openrouter.chat({
    system: "You are a senior motion-design director with a precise eye.",
    user: content,
    stage: "vision",
    temperature: 0.4,
    signal,
  });
  return { notes: text.trim(), tokensIn, tokensOut };
}

async function transcribeVideo({ videoPath, workDir, signal, tracker }) {
  fs.mkdirSync(workDir, { recursive: true });

  // A reference video with NO audio stream (muted screen recording — common)
  // makes ffmpeg -vn exit non-zero. That must not sink the whole ingest: the
  // visual-style half below is independent of audio, so skip STT and carry on.
  const wav = await extractAudio(videoPath, workDir).catch((e) => {
    console.warn(`[ingest] audio extract failed (likely no audio stream): ${String(e && e.message || e).slice(0, 120)} — skipping STT`);
    return null;
  });
  const provider = config.stt?.provider || "local";

  const sttTask = (wav == null
    ? Promise.resolve({ transcript: "", segments: [], language: "unknown" })
    : (provider === "local" ? sttLocal(wav) : sttHosted(wav)))
    .catch((e) => {
      console.warn(`[ingest] stt failed (${provider}): ${e.message}`);
      return { transcript: "", segments: [], language: "unknown" };
    });

  const visionTask = sampleFrames(videoPath, workDir)
    .then((frames) => describeVisualStyle(frames, { signal }))
    .then((r) => {
      if (r && tracker) tracker.addLlm({ inputTokens: r.tokensIn, outputTokens: r.tokensOut, stage: "transcribe" });
      return r ? r.notes : null;
    })
    .catch((e) => {
      console.warn(`[ingest] visual style notes failed: ${e.message}`);
      return null;
    });

  const [stt, visualStyleNotes] = await Promise.all([sttTask, visionTask]);
  console.log(`[ingest] video transcribed: ${stt.transcript.length}ch transcript, ${stt.segments.length} segments, styleNotes=${visualStyleNotes ? "yes" : "no"}`);

  return {
    transcript: stt.transcript,
    segments: stt.segments,
    language: stt.language,
    visualStyleNotes,
  };
}

module.exports = { transcribeVideo };
