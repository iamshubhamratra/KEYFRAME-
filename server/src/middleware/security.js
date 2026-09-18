// Response-hardening middleware applied to every request.

// Baseline security headers. SAMEORIGIN still permits the studio's own
// same-origin design.html landing iframe while blocking cross-origin framing
// (clickjacking). nosniff + Referrer-Policy are safe defaults for a keyless,
// cookieless API + static SPA.
function securityHeaders(_req, res, next) {
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
}

// CORS — for split deploys the frontend (e.g. Vercel) is a different origin
// than this API (e.g. Render). WEB_ORIGIN is a comma-separated allowlist of
// permitted origins; if unset, any origin is allowed (the API is keyless,
// read + create only, no cookies). Same-origin all-in-one deploys never hit this.
function cors() {
  const allow = (process.env.WEB_ORIGIN || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allow.length === 0 || allow.includes(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      // Auth uses an httpOnly JWT cookie; cross-origin requests must be allowed
      // to send/receive it (frontend uses fetch credentials:"include").
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Max-Age", "86400");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  };
}

module.exports = { securityHeaders, cors };
