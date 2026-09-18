// VIDEO EDIT LLM PAYLOAD GUARD — the last check before user media leaves the machine.
//
// WHY THIS EXISTS. The edit pipeline sends frames, contact sheets and short audio islands to
// third-party models (ANALYSIS.md §2, ENGINE.md §4.14). The consent the user gave covers transcript
// text, ≤ 8 small images per call and short audio — never video, never an unbounded blob. A single
// bug in a prompt builder (a mezzanine read into a data URI, an images loop without a cap) would
// silently ship the user's footage and burn budget. So every multimodal `user` payload passes
// through assertPayload() inside ai/llm.js callJson, and a violation is a loud `bug`-class error.
//
// Audio note: KIE's `kie:` chat routes only hear audio sent as
// `{type:'image_url', image_url:{url:'data:audio/wav;base64,…'}}` (ANALYSIS.md §1), so audio data
// URIs inside image_url parts are ALLOWED and counted as audio, not as images.
//
// CONTRACT:
//   assertPayload(user, { maxImages=8, maxTotalBase64Bytes=1.5e6 })
//     -> { images, audioParts, textParts, base64Bytes }      (string user -> all zeros but textParts 1)
//     throws EditError LLM_PAYLOAD_INVALID | LLM_PAYLOAD_VIDEO | LLM_PAYLOAD_TOO_MANY_IMAGES |
//            LLM_PAYLOAD_TOO_LARGE   (errorClass 'bug', not retryable, extra.reason)
//   parseDataUri(url) -> { mime, base64Bytes } | null

const { EditError } = require("../errors");

const DATA_URI_RE = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)?((?:;[a-z0-9=._+-]+)*),/i;
const VIDEO_EXT_RE = /\.(mp4|m4v|mov|webm|mkv|avi|wmv|flv|ts|m3u8|mpd)(\?|#|$)/i;
const BLOCKED_PART_TYPES = new Set(["file", "video_url", "input_video", "video"]);

function reject(code, reason) {
  return new EditError(code, { errorClass: "bug", retryable: false, detail: reason, extra: { reason } });
}

function parseDataUri(url) {
  if (typeof url !== "string") return null;
  const m = DATA_URI_RE.exec(url.slice(0, 256));
  if (!m) return null;
  return { mime: String(m[1] || "text/plain").toLowerCase(), base64Bytes: url.length - m[0].length };
}

function assertPayload(user, { maxImages = 8, maxTotalBase64Bytes = 1.5e6 } = {}) {
  if (typeof user === "string") return { images: 0, audioParts: 0, textParts: 1, base64Bytes: 0 };
  if (!Array.isArray(user)) throw reject("LLM_PAYLOAD_INVALID", "user content must be a string or an array of parts");

  let images = 0, audioParts = 0, textParts = 0, base64Bytes = 0;
  user.forEach((part, idx) => {
    if (!part || typeof part !== "object") throw reject("LLM_PAYLOAD_INVALID", `part ${idx} is not an object`);
    const type = String(part.type || "");
    if (BLOCKED_PART_TYPES.has(type)) throw reject("LLM_PAYLOAD_VIDEO", `part ${idx} type '${type}' is never sent`);

    if (type === "text") {
      if (typeof part.text !== "string") throw reject("LLM_PAYLOAD_INVALID", `part ${idx} text is not a string`);
      textParts++;
      return;
    }

    if (type === "input_audio") {
      const data = part.input_audio && part.input_audio.data;
      if (typeof data !== "string" || !data) throw reject("LLM_PAYLOAD_INVALID", `part ${idx} input_audio has no data`);
      audioParts++;
      base64Bytes += data.length;
      return;
    }

    if (type === "image_url") {
      const raw = part.image_url;
      const url = typeof raw === "string" ? raw : raw && raw.url;
      if (typeof url !== "string" || !url) throw reject("LLM_PAYLOAD_INVALID", `part ${idx} image_url has no url`);
      const data = parseDataUri(url);
      if (data) {
        if (data.mime.startsWith("video/")) throw reject("LLM_PAYLOAD_VIDEO", `part ${idx} carries ${data.mime}`);
        if (data.mime.startsWith("audio/")) { audioParts++; base64Bytes += data.base64Bytes; return; }
        if (!data.mime.startsWith("image/")) throw reject("LLM_PAYLOAD_INVALID", `part ${idx} carries ${data.mime}`);
        images++;
        base64Bytes += data.base64Bytes;
        return;
      }
      if (!/^https:\/\//i.test(url)) throw reject("LLM_PAYLOAD_INVALID", `part ${idx} url scheme is not allowed`);
      if (VIDEO_EXT_RE.test(url)) throw reject("LLM_PAYLOAD_VIDEO", `part ${idx} url points at a video`);
      images++;
      return;
    }

    throw reject("LLM_PAYLOAD_INVALID", `part ${idx} has unsupported type '${type}'`);
  });

  if (images > maxImages) throw reject("LLM_PAYLOAD_TOO_MANY_IMAGES", `${images} images > ${maxImages}`);
  if (base64Bytes > maxTotalBase64Bytes) throw reject("LLM_PAYLOAD_TOO_LARGE", `${base64Bytes} base64 bytes > ${maxTotalBase64Bytes}`);
  return { images, audioParts, textParts, base64Bytes };
}

module.exports = { assertPayload, parseDataUri };
