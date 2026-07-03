// Auth primitives: password hashing (bcryptjs — pure JS, no native build so it
// works on Render's Docker + Windows alike), 6-digit OTP, and JWT issuance in an
// httpOnly cookie. Mirrors Taskmate's encPassword + jwt cookie approach.

const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const COOKIE = "kf_auth";
const IS_PROD = process.env.NODE_ENV === "production";
const SECRET = process.env.SECRET_KEY
  || process.env.JWT_SECRET
  || (IS_PROD ? null : "keyframe-dev-secret-change-me");
if (!SECRET) {
  console.warn("[auth] SECRET_KEY/JWT_SECRET not set in production — auth tokens cannot be issued");
}

async function hashPassword(pw) {
  return bcrypt.hash(String(pw), 10);
}
async function comparePassword(pw, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(pw), hash);
}

function generateOtp(length = 6) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(crypto.randomInt(min, max + 1));
}

function signToken(userId) {
  if (!SECRET) throw new Error("auth secret not configured");
  return jwt.sign({ id: userId }, SECRET, { expiresIn: "7d" });
}
function verifyToken(token) {
  if (!SECRET) return null;
  try { return jwt.verify(token, SECRET); } catch { return null; }
}

// Cross-origin (Vercel↔Render) needs SameSite=None + Secure; local http needs
// Lax + insecure (browsers reject Secure cookies over http). Keyed off NODE_ENV.
function cookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

module.exports = { COOKIE, hashPassword, comparePassword, generateOtp, signToken, verifyToken, cookieOptions };
