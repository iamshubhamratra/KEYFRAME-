// TTS via OpenRouter's chat-completions audio modality (the /audio/speech
// endpoint routes no models there as of 2026-06). Scheme, verified live:
//   POST /chat/completions  model=openai/gpt-audio-mini
//   modalities:["text","audio"], audio:{voice,format:"pcm16"}, stream:true
// Audio arrives as base64 pcm16 deltas (24kHz mono) which we collect and
// encode to mp3 with ffmpeg. The stream also yields a transcript of what was
// actually spoken — returned for verification and (later) captions.
//
// Returns the mp3 path on success (v1 contract); throws on failure.

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const config = require("../config");

const DEFAULT_MODEL = config.audio?.ttsModel || "openai/gpt-audio-mini";
const ENDPOINT = `${config.llm.baseUrl.replace(/\/$/, "")}/chat/completions`;

// Voices supported by the gpt-audio family. v1's planner may still emit
// tts-1-era voices (nova/onyx/fable) — map anything unknown to a default.
const AUDIO_VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"]);
const FALLBACK_VOICE = "coral";

function mapVoice(voice) {
  const v = String(voice || "").toLowerCase();
  return AUDIO_VOICES.has(v) ? v : FALLBACK_VOICE;
}

function encodePcmToMp3(pcm, outputPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const ff = spawn("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0",
      "-b:a", "128k", outputPath,
    ]);
    let err = "";
    ff.stderr.on("data", (d) => { err += d.toString(); });
    ff.on("error", reject);
    ff.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tts ffmpeg encode exit ${code}: ${err.slice(-300)}`));
    });
    ff.stdin.write(pcm);
    ff.stdin.end();
  });
}

async function synthesize({ script, voice, instructions, outputPath, model, tracker, meta }) {
  if (!script || !script.trim()) throw new Error("tts: empty script");

  // The gpt-audio models tend to ad-lib around loosely framed input, so the
  // text is delivered as an explicit READ-EXACTLY directive. Callers can pass
  // `meta` to receive {transcript, spokenSec} and verify what was spoken.
  const system = [
    "You are a text-to-speech engine.",
    "Read the text between <script> tags aloud EXACTLY as written: every word, nothing added, nothing removed, no greeting, no sign-off, no commentary, no elaboration.",
    instructions ? `Delivery style: ${instructions}` : "",
  ].filter(Boolean).join(" ");

  const body = {
    model: model || DEFAULT_MODEL,
    modalities: ["text", "audio"],
    audio: { voice: mapVoice(voice), format: "pcm16" },
    stream: true,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `<script>\n${script}\n</script>` },
    ],
  };

  const controller = new AbortController();
  // Scale with script length: ~1s of speech per 2.6 words, streamed roughly
  // realtime, plus generous connect/encode headroom.
  const words = (script.match(/\S+/g) || []).length;
  const timeoutMs = Math.max(90_000, Math.ceil(words / 2.6) * 2_500 + 30_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp;
  try {
    resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.llm.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": config.llm.httpReferer,
        "X-Title": config.llm.xTitle,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      throw new Error(`tts: HTTP ${resp.status} — ${errBody.slice(0, 400)}`);
    }

    const chunks = [];
    let transcript = "";
    const decoder = new TextDecoder();
    let buf = "";
    for await (const part of resp.body) {
      buf += decoder.decode(part, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const audio = j.choices?.[0]?.delta?.audio;
          if (audio?.data) chunks.push(Buffer.from(audio.data, "base64"));
          if (audio?.transcript) transcript += audio.transcript;
        } catch { /* SSE keepalive / partial line */ }
      }
    }

    const pcm = Buffer.concat(chunks);
    if (pcm.length < 4800) { // < 0.1s of audio
      throw new Error(`tts: stream yielded ${pcm.length} bytes of audio`);
    }

    await encodePcmToMp3(pcm, outputPath);
    const spokenSec = pcm.length / 48000;
    console.log(`[tts] ${mapVoice(voice)} spoke ${words} words (${Math.round(spokenSec * 10) / 10}s, transcript ${transcript.length}ch)`);

    if (tracker) tracker.addTts({ inputChars: script.length, spokenSec });
    if (meta) { meta.transcript = transcript; meta.spokenSec = spokenSec; }
    return outputPath;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { synthesize };
