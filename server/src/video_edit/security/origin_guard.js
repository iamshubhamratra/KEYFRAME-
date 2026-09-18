// VIDEO EDIT ORIGIN GUARD — refuse cross-site requests before a byte of their body is stored.
//
// WHY THIS EXISTS. Auth is an httpOnly cookie, and the global CORS middleware in server.js reflects ANY
// Origin with `Access-Control-Allow-Credentials: true` when WEB_ORIGIN is unset. Without this guard a
// page on evil.example could read a signed-in user's projects (GET with credentials) or post a
// multipart upload that lands 500 MB on our disk before auth even runs. So, for every route except
// /health and BEFORE multer (API.md §2 step 2):
//   - an `Origin` that is not WEB_ORIGIN, the same origin, or (outside production) the Vite dev server
//     → the reflected ACAO/ACAC headers are removed and 403 ORIGIN_NOT_ALLOWED (GET included);
//   - no `Origin` on an unsafe method with `Sec-Fetch-Site: cross-site` → 403 (old/odd browsers);
//     no Origin and no Sec-Fetch-Site (curl, the e2e harness) → allowed, auth still applies;
//   - unsafe methods must declare the body they carry: JSON routes `application/json` (a cross-site
//     form cannot send that without a CORS preflight), multipart routes `multipart/form-data` → 415.
//
// CONTRACT:
//   originGuard({ settings, env = process.env, isMultipart }) -> express middleware (named `originGuard`)
//   allowedOrigins(req, { env }) -> Set<string>   (normalized: lowercase, no trailing slash)
//   normalizeOrigin(value) -> string | null
// Logs nothing: a rejected Origin is attacker-chosen text.

const { EditError, toErrorBody } = require("../errors");

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DEV_ORIGIN = "http://localhost:5173";

function normalizeOrigin(value) {
  if (typeof value !== "string") return null;
  const s = value.trim().replace(/\/+$/, "").toLowerCase();
  return s && s.length <= 300 ? s : null;
}

function allowedOrigins(req, { env = process.env } = {}) {
  const set = new Set();
  for (const raw of String(env.WEB_ORIGIN || "").split(",")) {
    const n = normalizeOrigin(raw);
    if (n) set.add(n);
  }
  const host = typeof req.get === "function" ? req.get("host") : req.headers && req.headers.host;
  if (host) {
    const same = normalizeOrigin(`${req.protocol || "http"}://${host}`);
    if (same) set.add(same);
  }
  if (env.NODE_ENV !== "production") set.add(DEV_ORIGIN);
  return set;
}

// Multipart routes of API.md §3 (paths are relative to the router mount).
function defaultIsMultipart(req) {
  return req.method === "POST" && (req.path === "/" || /^\/[^/]+\/logo\/?$/.test(req.path));
}

function contentTypeOf(req) {
  return String((req.headers && req.headers["content-type"]) || "").split(";")[0].trim().toLowerCase();
}

function stripCors(res) {
  res.removeHeader("Access-Control-Allow-Origin");
  res.removeHeader("Access-Control-Allow-Credentials");
}

function reject(req, res, err) {
  res.status(err.status).json(toErrorBody(err, req.requestId || null));
}

function originGuard({ settings = null, env = process.env, isMultipart = defaultIsMultipart } = {}) {
  void settings; // accepted for symmetry with the other middleware factories
  return function originGuard(req, res, next) {
    const origin = req.headers.origin;
    const unsafe = UNSAFE_METHODS.has(req.method);
    if (origin !== undefined) {
      const n = normalizeOrigin(Array.isArray(origin) ? origin[0] : origin);
      if (!n || !allowedOrigins(req, { env }).has(n)) {
        stripCors(res);
        return reject(req, res, new EditError("ORIGIN_NOT_ALLOWED", { status: 403, errorClass: "input" }));
      }
    } else if (unsafe && String(req.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") {
      stripCors(res);
      return reject(req, res, new EditError("ORIGIN_NOT_ALLOWED", { status: 403, errorClass: "input" }));
    }
    if (unsafe) {
      const ct = contentTypeOf(req);
      const multipart = isMultipart(req);
      const expected = multipart ? "multipart/form-data" : "application/json";
      if (ct !== expected) {
        return reject(req, res, new EditError("UNSUPPORTED_MEDIA", {
          status: 415, errorClass: "input",
          userMessage: multipart ? "Uploads must be sent as multipart/form-data." : "This request must be sent as JSON.",
          extra: { reason: "CONTENT_TYPE", expected },
        }));
      }
    }
    return next();
  };
}

module.exports = { originGuard, allowedOrigins, normalizeOrigin, defaultIsMultipart, DEV_ORIGIN };
