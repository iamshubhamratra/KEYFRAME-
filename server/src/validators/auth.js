// Field checks for the /api/auth routes.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isEmail = (e) => typeof e === "string" && EMAIL_RE.test(e.trim());
const isValidPassword = (p) => typeof p === "string" && p.length >= 8 && p.length <= 100;
const normalizeEmail = (e) => String(e || "").trim().toLowerCase();

module.exports = { isEmail, isValidPassword, normalizeEmail };
