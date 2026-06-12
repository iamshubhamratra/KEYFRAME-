// OpenRouter TTS via POST /api/v1/tts. OpenAI-compatible shape.
// Returns path to an mp3 file on success; throws on failure.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");

const DEFAULT_MODEL = config.audio?.ttsModel || "openai/gpt-4o-mini-tts-2025-12-15";
// OpenRouter TTS endpoint — confirmed via curl example.
const ENDPOINT = `${config.llm.baseUrl.replace(/\/$/, "")}/audio/speech`;

async function synthesize({ script, voice, instructions, outputPath, model, tracker }) {
  if (!script || !script.trim()) throw new Error("tts: empty script");
  if (!voice) throw new Error("tts: voice required");

  const body = {
    model: model || DEFAULT_MODEL,
    input: script,
    voice,
    response_format: "mp3",
    speed: 1.0,
  };
  if (instructions) body.instructions = instructions;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

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
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(`tts: HTTP ${resp.status} — ${errBody.slice(0, 400)}`);
  }

  const ab = await resp.arrayBuffer();
  if (ab.byteLength < 1000) {
    // Suspiciously tiny response; probably an error payload.
    throw new Error(`tts: response too small (${ab.byteLength} bytes)`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(ab));

  if (tracker) tracker.addTts({ inputChars: script.length });
  return outputPath;
}

module.exports = { synthesize };
