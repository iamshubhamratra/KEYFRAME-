// VIDEO EDIT PLAYBACK TOKENS — short-lived, project-bound URLs for <video> and EventSource.
//
// WHY THIS EXISTS. On split deploys (web on one origin, API on another) a <video src> or an
// EventSource cannot always carry the auth cookie (third-party cookie blocking), and neither can set
// headers. A playback token is a signed, expiring capability for exactly one media item of one
// project for one user. It is not a session: it cannot list, mutate or read any other kind/key, the
// owner check is re-run on every request (a deleted project or user kills it), and it is never sent
// to AI providers (API.md §6).
//
// FORMAT. token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(key, <payload part>))
//   payload = { p: projectId, u: userId, k: kind, key: string|null, exp: unix seconds }
//   key     = HKDF-SHA256(SECRET_KEY || JWT_SECRET || dev-only fallback, info "video-edit-media")
// The dev fallback is refused when NODE_ENV === "production" (sign throws 503, verify returns null).
//
// CONTRACT:
//   signMediaToken({ projectId, userId, kind, key }, { ttlSec = 900, secret, env, now }) -> token string
//   verifyMediaToken(token, { secret, env, now }) -> { projectId, userId, kind, key, exp } | null
//   MEDIA_KINDS (API.md §3 media kinds) · TOKEN_KINDS (MEDIA_KINDS + "events") · KEY_RE
// Verification is constant-time on the MAC and never throws.

const crypto = require("node:crypto");
const ids = require("../ids");
const { EditError } = require("../errors");

const MEDIA_KINDS = Object.freeze([
  "source-proxy", "poster", "preview", "export", "captions", "credits", "thumbs", "waveform",
  "broll-thumb", "broll-preview", "card-preview", "logo", "frame",
]);
const TOKEN_KINDS = Object.freeze([...MEDIA_KINDS, "events"]);
const KEY_RE = /^[a-z0-9_.-]{1,64}$/;
const USER_RE = /^[A-Za-z0-9_.:@-]{1,128}$/;
const DEFAULT_TTL_SEC = 900;
const MAX_TTL_SEC = 3600;
const MAX_TOKEN_LEN = 1024;
const DEV_SECRET = "keyframe-video-edit-dev-only-media-secret";
const HKDF_SALT = "keyframe.video-edit";
const HKDF_INFO = "video-edit-media";

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function resolveSecret({ secret, env = process.env } = {}) {
  if (typeof secret === "string" && secret) return secret;
  if (env.SECRET_KEY) return String(env.SECRET_KEY);
  if (env.JWT_SECRET) return String(env.JWT_SECRET);
  if (env.NODE_ENV === "production") return null;
  return DEV_SECRET;
}

// Derived keys are cached by a digest of the secret, never by the secret itself.
const keyCache = new Map();
function deriveKey(secret) {
  const id = crypto.createHash("sha256").update(secret).digest("hex");
  let key = keyCache.get(id);
  if (!key) {
    key = Buffer.from(crypto.hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.from(HKDF_SALT), Buffer.from(HKDF_INFO), 32));
    if (keyCache.size >= 8) keyCache.clear();
    keyCache.set(id, key);
  }
  return key;
}

const mac = (key, payloadPart) => crypto.createHmac("sha256", key).update(payloadPart).digest();

function invalid(field) {
  return new EditError("VALIDATION_FAILED", { status: 422, errorClass: "input", extra: { field } });
}

function signMediaToken({ projectId, userId, kind, key = null } = {}, { ttlSec = DEFAULT_TTL_SEC, secret, env = process.env, now = Date.now } = {}) {
  if (!ids.isProjectId(projectId)) throw invalid("projectId");
  if (typeof userId !== "string" || !USER_RE.test(userId)) throw invalid("userId");
  if (!TOKEN_KINDS.includes(kind)) throw invalid("kind");
  if (key != null && (typeof key !== "string" || !KEY_RE.test(key))) throw invalid("key");
  const s = resolveSecret({ secret, env });
  if (!s) throw new EditError("EDITS_DISABLED", { status: 503, errorClass: "config", extra: { reason: "NO_SECRET_KEY" } });
  const ttl = Math.min(MAX_TTL_SEC, Math.max(1, Math.round(Number(ttlSec) || DEFAULT_TTL_SEC)));
  const payload = { p: projectId, u: userId, k: kind, key: key || null, exp: Math.floor(now() / 1000) + ttl };
  const part = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${part}.${mac(deriveKey(s), part).toString("base64url")}`;
}

function verifyMediaToken(token, { secret, env = process.env, now = Date.now } = {}) {
  try {
    if (typeof token !== "string" || token.length > MAX_TOKEN_LEN) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [part, sig] = parts;
    if (!/^[A-Za-z0-9_-]{8,900}$/.test(part) || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return null;
    const s = resolveSecret({ secret, env });
    if (!s) return null;
    const expected = mac(deriveKey(s), part);
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    // Reject non-canonical encodings (differing only in the unused trailing bits): one token, one spelling.
    if (given.toString("base64url") !== sig) return null;
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    if (!isPlain(payload)) return null;
    const { p, u, k, key, exp } = payload;
    if (!ids.isProjectId(p) || typeof u !== "string" || !USER_RE.test(u) || !TOKEN_KINDS.includes(k)) return null;
    if (key != null && (typeof key !== "string" || !KEY_RE.test(key))) return null;
    if (!Number.isInteger(exp) || exp * 1000 <= now()) return null;
    return { projectId: p, userId: u, kind: k, key: key || null, exp };
  } catch {
    return null;
  }
}

module.exports = { signMediaToken, verifyMediaToken, MEDIA_KINDS, TOKEN_KINDS, KEY_RE, DEFAULT_TTL_SEC, MAX_TTL_SEC };
