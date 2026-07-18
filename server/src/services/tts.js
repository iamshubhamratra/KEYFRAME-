// TTS with provider fallback.
//
//   PRIMARY  — KIE ElevenLabs (async task API). Draws from the funded KIE wallet
//              and is unaffected by the OpenRouter daily limit. Verified live.
//   FALLBACK — OpenRouter gpt-audio (chat-completions audio modality). Used when
//              KIE has no key or its task fails, or when audio.ttsProvider="openrouter".
//
// KIE ElevenLabs flow (verified 2026-07-01):
//   POST /api/v1/jobs/createTask {model, input:{text,voice,stability,similarity_boost,speed}}
//     -> {code:200, data:{taskId}}
//   GET  /api/v1/jobs/recordInfo?taskId=...  (poll)
//     -> {data:{state:"waiting"|"success"|"fail", resultJson:'{"resultUrls":["...mp3"]}', failMsg}}
//   The result is already an mp3 — download it directly (no ffmpeg needed).
//
// OpenRouter flow: POST /chat/completions model=openai/gpt-audio-mini,
//   modalities:["text","audio"], audio:{voice,format:"pcm16"}, stream:true.
//   Base64 pcm16 (24kHz mono) deltas collected and encoded to mp3 with ffmpeg.
//
// Returns the mp3 path on success (v1 contract); throws on failure.

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const config = require("../config");
const { probeDurationSec } = require("./media");

const DEFAULT_MODEL = config.audio?.ttsModel || "openai/gpt-audio-mini";
const ENDPOINT = `${config.llm.baseUrl.replace(/\/$/, "")}/chat/completions`;

// ---------- KIE ElevenLabs (primary) ----------
const KIE_JOBS = "https://api.kie.ai/api/v1/jobs";
const KIE_TTS_MODEL = config.audio?.ttsKieModel || "elevenlabs/text-to-speech-multilingual-v2";
// KIE whitelists a subset of ElevenLabs voice IDs (arbitrary IDs 500 with "voice
// not within the range of allowed options"). Only IDs verified against KIE are
// mapped; unknown planner voices fall back to the verified default. Extend
// EL_VOICE_MAP as more allowed IDs are confirmed.
const KIE_DEFAULT_VOICE = config.audio?.ttsVoiceId || "EkK5I93UQWFDigLMpZcX"; // James (verified)
// Named narration voices — all IDs verified allowed by KIE (2026-07-01).
// Keep in sync with VALID_VOICES in audio_planner.js (the selectable-name gate).
const EL_VOICES = {
  james:    "EkK5I93UQWFDigLMpZcX", // M — husky, engaging, bold (default)
  brian:    "nPczCjzI2devNBz1zQrb", // M — deep, resonant, comforting
  benjamin: "LruHrtVF6PSyGItzMNHS", // M — deep, warm, calming
  tom:      "DYkrAHD8iwork3YSUBbs", // M — natural, conversational
  liam:     "TX3LPaxmHKxFdv7VOQHJ", // M — energetic, social-media
  bella:    "hpp4J3VqNfWAUOO0d1Us", // F — professional, bright, warm
  emma:     "pPdl9cQBQq4p6mRkZy2Z", // F — adorable, upbeat
  laura:    "FGY2WhTYpPnrIDTdsKH5", // F — enthusiast, quirky
  allison:  "1wGbFxmAM3Fgw63G1zZJ", // F — calm, soothing
};
// gpt-audio (OpenRouter) voice names → nearest named EL voice, so a planner pick
// still lands on a varied ElevenLabs voice while KIE is the primary TTS.
const GPT_TO_EL = {
  onyx: "brian", echo: "benjamin", ash: "tom", ballad: "liam", cedar: "james", verse: "james",
  nova: "bella", shimmer: "emma", coral: "laura", sage: "allison", alloy: "bella", fable: "laura", marin: "bella",
};
function mapKieVoice(voice) {
  const v = String(voice || "").toLowerCase();
  if (EL_VOICES[v]) return EL_VOICES[v];               // named EL voice
  if (GPT_TO_EL[v]) return EL_VOICES[GPT_TO_EL[v]];    // gpt-audio name → EL
  if (/^[A-Za-z0-9]{20}$/.test(String(voice))) return String(voice); // caller passed a raw EL id
  return KIE_DEFAULT_VOICE;
}
function kieKey() {
  return config.llm?.primary?.apiKey || process.env.KIE_API_KEY || "";
}
function kieTtsEnabled() {
  if (config.audio?.ttsProvider === "openrouter") return false; // explicit opt-out
  return !!kieKey();
}

async function synthesizeKie({ script, voice, outputPath, tracker, meta, speed = 1 }) {
  const key = kieKey();
  if (!key) throw new Error("tts(kie): no KIE api key");
  const text = String(script).slice(0, 5000); // model hard cap
  const hdr = { Authorization: `Bearer ${key}` };

  // 1) create task. Eleven V3 (text-to-dialogue) takes a `dialogue` array and
  // only stability{0,0.5,1}; the v2/turbo TTS models take a flat text field.
  const voiceId = mapKieVoice(voice);
  const isDialogueV3 = /dialogue|v3/i.test(KIE_TTS_MODEL);
  const input = isDialogueV3
    ? { dialogue: [{ text, voice: voiceId }], stability: 0.5, language_code: "en" }
    : { text, voice: voiceId, stability: 0.5, similarity_boost: 0.75, style: 0, speed };
  const create = await fetch(`${KIE_JOBS}/createTask`, {
    method: "POST",
    headers: { ...hdr, "Content-Type": "application/json" },
    body: JSON.stringify({ model: KIE_TTS_MODEL, input }),
    signal: AbortSignal.timeout(30_000),
  });
  const cj = await create.json().catch(() => ({}));
  if (cj?.code !== 200 || !cj?.data?.taskId) {
    throw new Error(`tts(kie): createTask ${cj?.code || create.status} — ${cj?.msg || JSON.stringify(cj).slice(0, 160)}`);
  }
  const taskId = cj.data.taskId;

  // 2) poll — ElevenLabs multilingual v2 renders a short VO in ~10-20s; scale the
  // ceiling with length and cap generously.
  const words = (text.match(/\S+/g) || []).length;
  const maxPolls = Math.min(120, Math.max(24, Math.ceil(words / 2)));
  let url = null;
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    let d;
    try {
      const q = await fetch(`${KIE_JOBS}/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers: hdr, signal: AbortSignal.timeout(20_000) });
      d = (await q.json())?.data || {};
    } catch { continue; } // transient poll error — keep polling
    const state = String(d.state || d.status || "").toLowerCase();
    if (state === "success") {
      try { url = JSON.parse(d.resultJson || "{}").resultUrls?.[0] || null; } catch { url = null; }
      if (!url) throw new Error("tts(kie): task success but no result url");
      break;
    }
    if (state === "fail" || state === "error") {
      throw new Error(`tts(kie): task failed — ${d.failMsg || d.failCode || "unknown"}`);
    }
  }
  if (!url) throw new Error(`tts(kie): timed out after ${maxPolls} polls`);

  // 3) download the finished mp3.
  const dl = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!dl.ok) throw new Error(`tts(kie): download HTTP ${dl.status}`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(await dl.arrayBuffer()));

  const spokenSec = (await probeDurationSec(outputPath)) || 0; // null → 0 (shared probe reports null on failure)
  console.log(`[tts] kie:elevenlabs ${mapKieVoice(voice)} spoke ${words} words (${Math.round(spokenSec * 10) / 10}s)`);
  if (tracker) tracker.addTts({ inputChars: text.length, spokenSec });
  if (meta) { meta.transcript = text; meta.spokenSec = spokenSec; }
  return outputPath;
}

// ---------- OpenRouter gpt-audio (fallback) ----------
// Voices supported by the gpt-audio family. v1's planner may still emit
// tts-1-era voices (nova/onyx/fable) — map anything unknown to a default.
const AUDIO_VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"]);
const FALLBACK_VOICE = "marin"; // the most natural gpt-audio voice

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
    // Truncated-stream guard: a dropped SSE connection can deliver a partial
    // read that sounds like the narration "breaking off" mid-scene. Even a very
    // fast read can't beat ~6 words/sec — anything shorter is a broken take.
    const gotSec = pcm.length / 48000;
    if (words >= 6 && gotSec < Math.min(words / 6, 2.5)) {
      throw new Error(`tts: stream truncated (${gotSec.toFixed(1)}s of audio for ${words} words)`);
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

// ---------- Edge neural TTS (free last-resort) ----------
// Microsoft Edge's read-aloud neural voices via msedge-tts — no API key, no
// billing. Used ONLY when both paid providers fail (KIE daily points + the
// OpenRouter credit floor): a narrated film with a stock neural voice beats a
// silent film every time. Voice mapping keeps the planner's gender choice.
const EDGE_MALE = "en-US-GuyNeural";
const EDGE_FEMALE = "en-US-AriaNeural";
const FEMALE_VOICES = new Set([
  "bella", "emma", "laura", "allison",                          // EL names
  "nova", "shimmer", "coral", "sage", "alloy", "fable", "marin", // gpt-audio names
]);
function edgeVoiceFor(voice) {
  const v = String(voice || "").toLowerCase();
  return FEMALE_VOICES.has(v) ? EDGE_FEMALE : EDGE_MALE;
}

async function synthesizeEdge({ script, voice, outputPath, tracker, meta }) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
  const text = String(script).slice(0, 5000);
  const edgeVoice = edgeVoiceFor(voice);
  const tts = new MsEdgeTTS();
  await tts.setMetadata(edgeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const dir = path.dirname(path.resolve(outputPath));
  fs.mkdirSync(dir, { recursive: true });
  // toFile writes a fixed "audio.mp3" into the given (existing) directory —
  // synth into a temp dir, then move to the caller's exact path.
  const tmpDir = fs.mkdtempSync(path.join(dir, "edge-"));
  try {
    const { audioFilePath } = await tts.toFile(tmpDir, text);
    fs.renameSync(audioFilePath, outputPath);
  } finally {
    try { tts.close(); } catch { /* noop */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  }
  const spokenSec = (await probeDurationSec(outputPath)) || 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  console.log(`[tts] edge:${edgeVoice} spoke ${words} words (${Math.round(spokenSec * 10) / 10}s) — free fallback voice`);
  if (tracker) tracker.addTts({ inputChars: text.length, spokenSec });
  if (meta) { meta.transcript = text; meta.spokenSec = spokenSec; meta.fallbackVoice = "edge"; }
  return outputPath;
}

// ---------- Per-clip loudness normalization ----------
// Different providers (and even different takes of the same gpt-audio voice)
// come back at wildly different levels — one scene whispers, the next shouts,
// and the hot clips slam the mix limiter (heard as pumping/"breaking"). Align
// every clip to the same integrated loudness with a MEASURED linear gain (no
// dynamic processing → no artifacts) and micro-fade the edges so clip joins
// never click.
const VO_TARGET_LUFS = -16;

function runFfmpeg(ffArgs, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-y", "-hide_banner", ...ffArgs]);
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); });
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, timeoutMs);
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(err);
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(-240)}`));
    });
  });
}

async function normalizeVoClip(filePath) {
  const dur = await probeDurationSec(filePath);
  if (!dur || dur <= 0.2) return;

  // Pass 1 — measure integrated loudness (loudnorm's JSON report on stderr).
  const stderr = await runFfmpeg([
    "-i", filePath, "-af", `loudnorm=I=${VO_TARGET_LUFS}:TP=-2:LRA=11:print_format=json`, "-f", "null", "-",
  ]);
  const jsonMatch = stderr.match(/\{[\s\S]*\}/);
  const measured = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  const inputI = Number(measured?.input_i);
  if (!Number.isFinite(inputI) || inputI < -70) return; // silence/unmeasurable — leave as-is

  // Pass 2 — apply the measured static gain, guard peaks, fade the edges.
  const gain = Math.max(-12, Math.min(12, VO_TARGET_LUFS - inputI));
  const fadeOut = Math.min(0.04, dur / 4);
  const fadeStart = Math.max(0, dur - fadeOut);
  const tmp = filePath + ".norm.mp3";
  await runFfmpeg([
    "-loglevel", "error", "-i", filePath,
    "-af",
    `volume=${gain.toFixed(2)}dB,alimiter=limit=0.94:attack=3:release=40,` +
    `afade=t=in:st=0:d=0.012,afade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeOut.toFixed(3)}`,
    "-ar", "44100", "-b:a", "160k", tmp,
  ]);
  fs.renameSync(tmp, filePath);
  if (Math.abs(gain) >= 3) {
    console.log(`[tts] clip loudness aligned ${inputI.toFixed(1)} LUFS ${gain > 0 ? "+" : ""}${gain.toFixed(1)}dB → ${VO_TARGET_LUFS} LUFS`);
  }
}

// ---------- Dispatcher ----------
// One VOICE per film. Callers that synthesize several clips for the same job
// pass a shared `session` object ({} per job): the provider that speaks the
// first clip is pinned for every later clip, and a provider only falls back
// after TWO attempts — so a single transient error no longer swaps the
// narrator mid-video (the "different voice on some scenes" bug).
const PROVIDER_IMPL = {
  kie: synthesizeKie,
  openrouter: synthesizeOpenRouter,
  edge: synthesizeEdge,
};

function providerChain() {
  const chain = [];
  if (kieTtsEnabled()) chain.push("kie");
  chain.push("openrouter", "edge");
  return chain;
}

async function attemptProvider(name, args, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await PROVIDER_IMPL[name](args);
    } catch (e) {
      lastErr = e;
      console.warn(`[tts] ${name} attempt ${i + 1}/${tries} failed: ${String(e.message).slice(0, 140)}`);
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

async function synthesizeWithChain(args) {
  const session = args.session;
  const chain = providerChain();
  const pinnedIdx = session?.provider ? chain.indexOf(session.provider) : -1;
  let lastErr;
  for (let i = Math.max(0, pinnedIdx); i < chain.length; i++) {
    const name = chain[i];
    try {
      const out = await attemptProvider(name, args);
      if (session) {
        if (!session.provider) {
          session.provider = name;
        } else if (session.provider !== name) {
          // The pinned provider died mid-job — follow the working one for the
          // REST of the clips so at most one voice boundary exists, and flag it.
          session.mixed = true;
          console.warn(`[tts] VOICE CONSISTENCY: job was pinned to "${session.provider}" but this clip needed "${name}" — pinning the remaining clips to "${name}"`);
          session.provider = name;
        }
      }
      if (args.meta) args.meta.provider = name;
      return out;
    } catch (e) {
      lastErr = e;
      // Forced KIE → surface the error rather than silently changing voices.
      if (name === "kie" && config.audio?.ttsProvider === "kie") throw e;
      if (i < chain.length - 1) {
        console.warn(`[tts] ${name} failed after retries; falling back to ${chain[i + 1]}`);
      }
    }
  }
  throw lastErr;
}

async function synthesize(args) {
  if (!args.script || !args.script.trim()) throw new Error("tts: empty script");

  const session = args.session;
  let result;
  if (session && !session._first) {
    // Serialize the job's FIRST clip: parallel first-clips racing different
    // fallback chains is exactly how one film ended up with two narrators.
    // Later clips launch as soon as the first has pinned a provider.
    let release;
    session._first = new Promise((r) => { release = r; });
    try {
      result = await synthesizeWithChain(args);
    } finally {
      release();
    }
  } else {
    if (session) await session._first;
    result = await synthesizeWithChain(args);
  }

  await normalizeVoClip(args.outputPath).catch((e) => {
    console.warn(`[tts] clip normalize skipped: ${String(e.message).slice(0, 140)}`);
  });
  return result;
}

module.exports = { synthesize };
