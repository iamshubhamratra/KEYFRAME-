// TTS — OpenRouter gpt-audio-mini (the "gpt mini tts" model), single provider.
//
// Voiceover is synthesized ONLY via OpenRouter's gpt-audio family through the
// chat-completions audio modality. The former KIE ElevenLabs primary and the free
// Microsoft Edge neural fallback have been removed by request: this is the one and
// only voice. If OpenRouter TTS fails, synthesis throws and the caller ships the
// film without narration (surfacing the existing audio-degradation note) rather
// than swapping in a different-sounding voice.
//
// Flow: POST /chat/completions model=openai/gpt-audio-mini,
//   modalities:["text","audio"], audio:{voice,format:"pcm16"}, stream:true.
//   Base64 pcm16 (24kHz mono) deltas are collected and encoded to mp3 with ffmpeg.
//
// Returns the mp3 path on success (v1 contract); throws on failure.

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const config = require("../config");

const DEFAULT_MODEL = config.audio?.ttsModel || "openai/gpt-audio-mini";
const ENDPOINT = `${config.llm.baseUrl.replace(/\/$/, "")}/chat/completions`;

// Voices supported by the gpt-audio family. The planner/graph may still emit a
// tts-1-era or ElevenLabs-era name — map anything unknown to a natural default.
const AUDIO_VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"]);
const FALLBACK_VOICE = "marin"; // the most natural gpt-audio voice

function mapVoice(voice) {
  const v = String(voice || "").toLowerCase();
  return AUDIO_VOICES.has(v) ? v : FALLBACK_VOICE;
}

// ---------- VO leveling (fix #1) -------------------------------------------
// gpt-audio-mini streams very low-level PCM (~-37 dBFS RMS, ~-20 dBFS peak). We
// stage each clip to a consistent speech level with a SINGLE, DETERMINISTIC,
// LINEAR gain computed from the raw s16le PCM and applied as one ffmpeg `volume`
// filter in the existing encode pass. A constant multiply => no pumping/breathing
// (unlike single-pass loudnorm/dynaudnorm) and preserves the clip's crest factor
// and short-term dynamics (LRA) exactly; only the absolute level shifts. The gain
// is clamped so the post-gain SAMPLE peak stays under a ceiling => no clipping.
// Downstream audio_mix loudnorm (I=-16) then applies only a small, uniform makeup
// instead of ~+21 dB of dynamic makeup, so it stops pumping / lifting the floor.
const VO_TARGET_RMS_DBFS = -20;  // consistent speech staging level
const VO_PEAK_CEIL_DBFS  = -1.5; // sample-peak ceiling; headroom for mp3/intersample -> true peak ~ -1
const VO_GATE_DBFS       = -50;  // ignore near-silent samples (pauses) when measuring SPEECH rms -> inter-clip consistency
const VO_SILENCE_DBFS    = -60;  // whole clip below this = silence/failed take -> leave untouched
const VO_MAX_BOOST_DB    = 30;   // absolute safety clamp so a near-dead clip's floor can't explode

const dbToLin = (db) => Math.pow(10, db / 20);

// Measure raw s16le mono PCM -> LINEAR `volume` factor that lands the gated
// (speech-only) RMS near target while keeping the peak under the ceiling. Pure
// math over the samples, no randomness => identical PCM yields an identical gain.
// Returns 1.0 for silent / all-zero / degenerate input (a plain, unfiltered copy).
function computeVoVolume(pcm) {
  if (!pcm || pcm.length < 2) return 1;
  const gateLin = dbToLin(VO_GATE_DBFS);
  const silenceLin = dbToLin(VO_SILENCE_DBFS);
  const n = pcm.length >> 1; // whole int16 samples (ignore a dangling odd byte)
  let peak = 0, sumSq = 0, gatedN = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(pcm.readInt16LE(i << 1)) / 32768; // 0..1 linear magnitude
    if (a > peak) peak = a;
    if (a >= gateLin) { sumSq += a * a; gatedN++; } // gate out pauses from the loudness measure
  }
  // All-zero / near-silent / failed take: never amplify a (near-)silent floor.
  if (peak < silenceLin) return 1;

  const gainPeak = dbToLin(VO_PEAK_CEIL_DBFS) / peak;         // never exceed the peak ceiling
  const rms = gatedN > 0 ? Math.sqrt(sumSq / gatedN) : 0;     // speech-gated RMS
  const gainRms = rms > 0 ? dbToLin(VO_TARGET_RMS_DBFS) / rms // hit target RMS...
                          : Infinity;                          // ...or (no gated samples) let peak rule
  // Take the SAFER (smaller) of "reach target RMS" and "stay under peak ceiling",
  // then cap the boost. For an already-hot clip gainRms < 1 => a gentle cut toward
  // target (still a static multiply, still consistent); for a high-crest clip
  // gainPeak wins => it lands a touch below target RMS but never clips.
  let gain = Math.min(gainRms, gainPeak, dbToLin(VO_MAX_BOOST_DB));
  if (!(gain > 0) || !Number.isFinite(gain)) return 1;        // NaN/degenerate guard
  return Math.round(gain * 10000) / 10000;                    // stable, deterministic ffmpeg arg
}

function encodePcmToMp3(pcm, outputPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Level the clip AT GENERATION with one constant gain so every VO stem reaches
    // the mixer at a consistent ~-20 dBFS gated RMS. A ~no-op gain (silence guard /
    // already on target) omits the filter so those clips encode exactly as before.
    const gain = computeVoVolume(pcm);
    const gainDb = 20 * Math.log10(gain);
    const args = [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0",
    ];
    if (Math.abs(gainDb) >= 0.3) {
      args.push("-filter:a", `volume=${gain}`);
      console.log(`[tts] vo leveled ${gainDb > 0 ? "+" : ""}${gainDb.toFixed(1)} dB (x${gain}) -> ~${VO_TARGET_RMS_DBFS} dBFS RMS, peak <= ${VO_PEAK_CEIL_DBFS} dBFS`);
    }
    args.push("-b:a", "128k", outputPath);

    const ff = spawn("ffmpeg", args);
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

async function synthesizeOpenRouter({ script, voice, instructions, outputPath, model, tracker, meta }) {
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
    // Bounded so OpenRouter's affordability pre-check (against max_tokens)
    // doesn't 402 short VO clips when the daily budget runs low.
    max_tokens: 8192,
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
    console.log(`[tts] openrouter ${mapVoice(voice)} spoke ${words} words (${Math.round(spokenSec * 10) / 10}s, transcript ${transcript.length}ch)`);

    if (tracker) tracker.addTts({ inputChars: script.length, spokenSec });
    if (meta) { meta.transcript = transcript; meta.spokenSec = spokenSec; }
    return outputPath;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Dispatcher ----------
// Single provider: OpenRouter gpt-audio-mini. No paid-ElevenLabs primary, no free
// Edge fallback. A failure throws; the pipeline's voice stage catches it and ships
// the film without narration plus an audio-degradation note.
async function synthesize(args) {
  if (!args.script || !args.script.trim()) throw new Error("tts: empty script");
  return synthesizeOpenRouter(args);
}

module.exports = { synthesize };
