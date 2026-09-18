// Per-IP rate limiting for the routes that start paid pipeline work.

const rateLimit = require("express-rate-limit");
const config = require("../config");

// The caller's address, preferring the first X-Forwarded-For hop (the app runs
// behind a proxy on every deploy target).
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

// A fresh hourly limiter. Each route that creates jobs builds its OWN, so
// /api/generate and /api/projects keep separate budgets.
function hourlyJobLimit() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: config.server.rateLimitPerHourPerIp,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => clientIp(req),
    message: { error: "rate limit exceeded", hint: "try again in an hour" },
  });
}

module.exports = { clientIp, hourlyJobLimit };
