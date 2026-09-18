// TTS with provider fallback.
//
//   PRIMARY  — KIE (async task API). Draws from the funded KIE wallet and is
//              unaffected by the OpenRouter daily limit. The model is chosen by
//              audio.ttsKieModel; two request schemas are supported (below).
//   FALLBACK — OpenRouter gpt-audio (chat-completions audio modality). Used when
//              KIE has no key or its task fails, or when audio.ttsProvider="openrouter".
//
// KIE transport (shared by both schemas):
//   POST /api/v1/jobs/createTask {model, input:{...}}  -> {code:200, data:{taskId}}
//   GET  /api/v1/jobs/recordInfo?taskId=...  (poll)
//     -> {data:{state:"waiting"|"success"|"fail", resultJson:'{"resultUrls":["..."]}', failMsg}}
//
// SCHEMA A — Gemini TTS (audio.ttsKieModel = "google/gemini-3-1-flash-tts").
//   Verified live 2026-09-07. A dialogue-shaped API even for single-narrator VO:
//     input: {
//       speakers:      [{speaker_id:"Speaker 1", voice_name:"Charon",
//                        style:"", pace:"Natural", accent:"Neutral"}],
//       dialogue_turns:[{speaker_id:"Speaker 1", text:"..."}],
//       dialogue_mode: "single",
//     }
//   Omitting speakers/dialogue_turns/speaker_id/voice_name each 422s with the
//   missing field named. Renders in ~2-3s (vs ElevenLabs' 10-20s) and returns a
//   **WAV**, not an mp3 — step 3 below transcodes it, and says why that matters.
//
// SCHEMA B — ElevenLabs (audio.ttsKieModel = "elevenlabs/..."), the previous
//   primary, kept so a one-line config.json edit rolls back to it:
//   input:{text,voice,stability,similarity_boost,speed}; v3/dialogue models take
//   a `dialogue` array instead. Returns an mp3 directly.
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
const KIE_TTS_MODEL = config.audio?.ttsKieModel || "google/gemini-3-1-flash-tts";
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

// ---------- Gemini TTS voices ----------
// Gemini exposes 30 named voices (all confirmed available on KIE). The planner
// speaks a fixed vocabulary — the 9 named "EL" voices plus the gpt-audio names
// (VALID_VOICES in audio_planner.js) — so map that vocabulary onto the nearest
// Gemini voice by CHARACTER, keeping each narrator persona recognisable across
// a provider swap rather than collapsing every film onto one default voice.
const GEMINI_VOICES = {
  james:    "Charon",        // M — informative, bold (default narrator)
  brian:    "Algenib",       // M — gravelly, deep, resonant
  benjamin: "Umbriel",       // M — easy-going, warm, calming
  tom:      "Zubenelgenubi", // M — casual, conversational
  liam:     "Puck",          // M — upbeat, energetic
  bella:    "Autonoe",       // F — bright, professional
  emma:     "Laomedeia",     // F — upbeat
  laura:    "Pulcherrima",   // F — forward, characterful
  allison:  "Achernar",      // F — soft, soothing
};
// Every Gemini voice id, so a caller may also name one directly (e.g. from
// TTS_VOICE=Sulafat) instead of going through the persona vocabulary above.
const GEMINI_VOICE_IDS = new Set([
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
  "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
  "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
  "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
]);
const GEMINI_DEFAULT_VOICE =
  GEMINI_VOICE_IDS.has(String(config.audio?.ttsVoiceId)) ? String(config.audio.ttsVoiceId) : "Charon";

function mapGeminiVoice(voice) {
  const v = String(voice || "").toLowerCase();
  if (GEMINI_VOICES[v]) return GEMINI_VOICES[v];                    // persona name
  if (GPT_TO_EL[v]) return GEMINI_VOICES[GPT_TO_EL[v]];             // gpt-audio name → persona
  // Case-insensitive match on a raw Gemini voice id ("charon" → "Charon").
  for (const id of GEMINI_VOICE_IDS) if (id.toLowerCase() === v) return id;
  return GEMINI_DEFAULT_VOICE;
}

// Which KIE schema does the configured model speak? Gemini TTS is dialogue-shaped
// and returns WAV; the ElevenLabs family is flat and returns mp3.
const KIE_IS_GEMINI = /gemini/i.test(KIE_TTS_MODEL) && /tts/i.test(KIE_TTS_MODEL);

function kieKey() {
  // audio.ttsKieKey first: KIE is a TTS-only provider now, so the key no longer
  // lives under llm.primary (which config.json dropped). The other two are kept
  // so an older config.json / a bare shell export still keys the voice-over.
  return config.audio?.ttsKieKey || config.llm?.primary?.apiKey || process.env.KIE_API_KEY || "";
}
// CIRCUIT BREAKER for a stalled KIE TTS queue. Discovering the stall costs 20s
// (see STALL_MS); paying that on EVERY clip of a 30-scene film is minutes of dead
// wall clock for the same answer. One clip's discovery stands down the provider
// for the rest of the job (and a few minutes beyond), and it re-arms by itself so
// a recovered queue is picked up without a restart or a config edit.
const KIE_STALL_COOLDOWN_MS = 10 * 60 * 1000;
let kieStalledUntil = 0;

function kieTtsEnabled() {
  if (config.audio?.ttsProvider === "openrouter") return false; // explicit opt-out
  if (Date.now() < kieStalledUntil) return false;               // stood down after a stall
  return !!kieKey();
}

// Gemini's style/pace/accent are CLOSED ENUMS, not free text: a value outside
// the list is rejected outright ("The style parameter is invalid", HTTP 422) —
// while an EMPTY string is accepted and means "use the voice's own delivery".
// So anything we cannot map confidently is omitted rather than guessed.
const GEMINI_STYLES = ["Vocal Smile", "Newscaster", "Whisper", "Empathetic", "Promo/Hype", "Deadpan"];
const GEMINI_PACES  = ["Natural", "Rapid Fire", "The Drift", "Staccato"];

// The planner writes `instructions` as a free-text delivery note ("warm and
// confident, like a product launch narrator"). Classify it onto the enum by
// keyword, most-specific first; no match -> "" (the voice's natural delivery).
const STYLE_PATTERNS = [
  [/whisper|hushed|intimate|breathy|soft[- ]spoken/i,                    "Whisper"],
  [/deadpan|monotone|flat|dry|matter[- ]of[- ]fact|impassive/i,          "Deadpan"],
  [/news|anchor|announcer|report|authoritative|formal|corporate|serious/i, "Newscaster"],
  [/hype|promo|energetic|excited|upbeat|punchy|bold|launch|dynamic|trailer/i, "Promo/Hype"],
  [/empathetic|warm|caring|gentle|calm|reassuring|comforting|sincere|soothing/i, "Empathetic"],
  [/smile|friendly|cheerful|bright|inviting|conversational|approachable/i, "Vocal Smile"],
];
function geminiStyle(instructions) {
  const t = String(instructions || "").trim();
  if (!t) return "";
  if (GEMINI_STYLES.includes(t)) return t;            // caller named an enum value outright
  for (const [re, style] of STYLE_PATTERNS) if (re.test(t)) return style;
  return "";
}

// `pace` is a word, not a multiplier — translate the numeric speed the rest of
// the pipeline speaks (vo_fit nudges it to make a clip fit its scene). Note the
// enum has no plain "Fast"/"Slow": faster is "Rapid Fire", slower is "The Drift".
function geminiPace(speed) {
  const n = Number(speed);
  if (!Number.isFinite(n) || Math.abs(n - 1) < 0.06) return "Natural";
  const pace = n > 1 ? "Rapid Fire" : "The Drift";
  return GEMINI_PACES.includes(pace) ? pace : "Natural"; // never ship an off-enum value
}

async function synthesizeKie({ script, voice, instructions, outputPath, tracker, meta, speed = 1 }) {
  const key = kieKey();
  if (!key) throw new Error("tts(kie): no KIE api key");
  const text = String(script).slice(0, 5000); // model hard cap
  const hdr = { Authorization: `Bearer ${key}` };

  // 1) create task. Three request schemas, picked by the configured model:
  //    - Gemini TTS: dialogue-shaped (speakers + dialogue_turns), see header.
  //    - Eleven V3 (text-to-dialogue): a `dialogue` array, stability {0,0.5,1}.
  //    - Eleven v2/turbo: a flat text field.
  const voiceId = KIE_IS_GEMINI ? mapGeminiVoice(voice) : mapKieVoice(voice);
  const isDialogueV3 = /dialogue|v3/i.test(KIE_TTS_MODEL);
  let input;
  if (KIE_IS_GEMINI) {
    input = {
      speakers: [{
        speaker_id: "Speaker 1",
        voice_name: voiceId,
        style: geminiStyle(instructions), // "" when unmappable — see geminiStyle
        pace: geminiPace(speed),
        accent: "Neutral",
      }],
      dialogue_turns: [{ speaker_id: "Speaker 1", text }],
      dialogue_mode: "single",
    };
  } else if (isDialogueV3) {
    input = { dialogue: [{ text, voice: voiceId }], stability: 0.5, language_code: "en" };
  } else {
    input = { text, voice: voiceId, stability: 0.5, similarity_boost: 0.75, style: 0, speed };
  }
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
  // STALL DEADLINE. A task that is RENDERING deserves the full poll ceiling; a
  // task that never leaves `waiting` is a queue that is not serving this account
  // at all, and waiting 60s to discover that — twice, per clip — costs minutes of
  // wall clock on every film for an answer that never changes. Measured: the
  // queue held `waiting` indefinitely, so a 5-scene film burned ~10 minutes
  // before falling through to a voice it could have used immediately.
  // Once ANY progress state appears we stop applying it and let the render finish.
  const STALL_MS = 20_000;
  const t0 = Date.now();
  let sawProgress = false;
  let url = null;
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    let d;
    try {
      const q = await fetch(`${KIE_JOBS}/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers: hdr, signal: AbortSignal.timeout(20_000) });
      d = (await q.json())?.data || {};
    } catch { continue; } // transient poll error — keep polling
    const state = String(d.state || d.status || "").toLowerCase();
    if (state && state !== "waiting" && state !== "queuing" && state !== "queued") sawProgress = true;
    if (state === "success") {
      try { url = JSON.parse(d.resultJson || "{}").resultUrls?.[0] || null; } catch { url = null; }
      if (!url) throw new Error("tts(kie): task success but no result url");
      break;
    }
    if (state === "fail" || state === "error") {
      throw new Error(`tts(kie): task failed — ${d.failMsg || d.failCode || "unknown"}`);
    }
    if (!sawProgress && Date.now() - t0 > STALL_MS) {
      kieStalledUntil = Date.now() + KIE_STALL_COOLDOWN_MS;
      throw new Error(`tts(kie): queue still "waiting" after ${Math.round(STALL_MS / 1000)}s — treating as stalled`);
    }
  }
  if (!url) throw new Error(`tts(kie): timed out after ${maxPolls} polls`);

  // 3) download the finished clip, as mp3.
  //
  // This function's contract is "returns an mp3 at outputPath", and the rest of
  // the pipeline trusts the extension: audio_mix concatenates these clips and
  // normalizeVoClip re-encodes via a ".norm.mp3" temp whose extension is what
  // tells ffmpeg the output codec. ElevenLabs already returns mp3, so the old
  // code wrote the bytes straight through — but Gemini TTS returns a **WAV**,
  // and writing WAV bytes to a .mp3 path leaves a file whose contents and name
  // disagree. normalizeVoClip would usually launder that (it re-encodes to real
  // mp3), but it BAILS on clips under 0.2s or of unmeasurable loudness, and
  // synthesize() only warns when it throws — so the mislabelled file survives
  // exactly in the edge cases. Transcode by content type instead of hoping.
  const dl = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!dl.ok) throw new Error(`tts(kie): download HTTP ${dl.status}`);
  const bytes = Buffer.from(await dl.arrayBuffer());
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  // Trust the payload, not the URL: sniff the RIFF/WAVE magic.
  const isWav = bytes.length > 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE";
  if (isWav) {
    const tmpWav = `${outputPath}.src.wav`;
    fs.writeFileSync(tmpWav, bytes);
    try {
      await runFfmpeg(["-loglevel", "error", "-i", tmpWav, "-b:a", "160k", "-ar", "44100", outputPath]);
    } finally {
      try { fs.unlinkSync(tmpWav); } catch { /* best effort */ }
    }
  } else {
    fs.writeFileSync(outputPath, bytes);
  }

  const spokenSec = (await probeDurationSec(outputPath)) || 0; // null → 0 (shared probe reports null on failure)
  console.log(`[tts] kie:${KIE_IS_GEMINI ? "gemini" : "elevenlabs"} ${voiceId} spoke ${words} words (${Math.round(spokenSec * 10) / 10}s)`);
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
    ], { windowsHide: true });
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
// LANGUAGE-AWARE FREE FALLBACK.
//
// Edge is the last resort in the chain, and it used to be hard-wired to two
// en-US voices. On a localized film that produced the worst possible outcome: a
// Hindi script handed to an American English voice, which reads Devanagari as
// noise. Measured — a Hindi clip fell to `edge:en-US-AriaNeural`.
//
// Edge ships neural voices for every language this pipeline supports (see
// services/caption_lang.js), so the fallback picks the one matching the film's
// VOICEOVER language. Unknown/absent language keeps the en-US pair exactly as
// before, so the English path is unchanged.
const EDGE_BY_LANG = {
  en: { male: "en-US-GuyNeural",   female: "en-US-AriaNeural" },
  hi: { male: "hi-IN-MadhurNeural", female: "hi-IN-SwaraNeural" },
  es: { male: "es-ES-AlvaroNeural", female: "es-ES-ElviraNeural" },
  fr: { male: "fr-FR-HenriNeural",  female: "fr-FR-DeniseNeural" },
  de: { male: "de-DE-ConradNeural", female: "de-DE-KatjaNeural" },
  pt: { male: "pt-BR-AntonioNeural", female: "pt-BR-FranciscaNeural" },
  ar: { male: "ar-SA-HamedNeural",  female: "ar-SA-ZariyahNeural" },
  ja: { male: "ja-JP-KeitaNeural",  female: "ja-JP-NanamiNeural" },
};

function edgeVoiceFor(voice, lang) {
  const v = String(voice || "").toLowerCase();
  const female = FEMALE_VOICES.has(v);
  const pair = EDGE_BY_LANG[String(lang || "en").toLowerCase()] || EDGE_BY_LANG.en;
  const picked = female ? pair.female : pair.male;
  // Defensive: an unmapped entry must never yield undefined into setMetadata.
  return picked || (female ? EDGE_FEMALE : EDGE_MALE);
}

async function synthesizeEdge({ script, voice, outputPath, tracker, meta, lang }) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
  const text = String(script).slice(0, 5000);
  const edgeVoice = edgeVoiceFor(voice, lang);
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
    const p = spawn("ffmpeg", ["-y", "-hide_banner", ...ffArgs], { windowsHide: true });
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
