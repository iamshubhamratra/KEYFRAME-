// File-based user + OTP store — the auth counterpart to db.js. Persists to
// server/auth-store.json (gitignored). KEYFRAME deliberately has no real DB, so
// this mirrors the existing JSON-file approach. NOTE: on an ephemeral host
// (Render free/standard disk) this resets on redeploy — accepted trade-off for
// "no new infra". Swap to a real DB later by re-implementing this module's API.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("../config");

const FILE = path.join(config.paths.root, "auth-store.json");

let state = { users: [], otps: [] };
try {
  const raw = fs.readFileSync(FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object") {
    state.users = Array.isArray(parsed.users) ? parsed.users : [];
    state.otps = Array.isArray(parsed.otps) ? parsed.otps : [];
  }
} catch { /* fresh store */ }

let writeTimer = null;
function persist() {
  // Debounced atomic write (tmp -> rename), like db.js.
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      const tmp = FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(state), "utf8");
      fs.renameSync(tmp, FILE);
    } catch (e) {
      console.warn(`[auth] store write failed: ${e.message}`);
    }
  }, 50);
}

const normEmail = (e) => String(e || "").trim().toLowerCase();

// ---------------------------------------------------------------- users
function findUserByEmail(email) {
  const e = normEmail(email);
  return state.users.find((u) => u.email === e) || null;
}
function findUserById(id) {
  return state.users.find((u) => u.id === id) || null;
}
function createUser({ name, email, passwordHash }) {
  const user = {
    id: crypto.randomUUID(),
    name: String(name || "").trim(),
    email: normEmail(email),
    passwordHash,
    role: "user",
    createdAt: Date.now(),
  };
  state.users.push(user);
  persist();
  return user;
}
function setUserPassword(id, passwordHash) {
  const u = findUserById(id);
  if (!u) return false;
  u.passwordHash = passwordHash;
  u.updatedAt = Date.now();
  persist();
  return true;
}
// Public-safe shape (never leak the hash).
function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt };
}

// ---------------------------------------------------------------- otps
// One active OTP per email for password reset. ttlMs default 5 min.
function saveOtp({ email, otp, ttlMs = 5 * 60_000 }) {
  const e = normEmail(email);
  // drop any previous OTPs for this email (only the newest is valid)
  state.otps = state.otps.filter((o) => o.email !== e);
  const rec = { email: e, otp: String(otp), type: "email", status: "pending", expiringAt: Date.now() + ttlMs, createdAt: Date.now() };
  state.otps.push(rec);
  persist();
  return rec;
}
function getOtp(email) {
  const e = normEmail(email);
  return state.otps.find((o) => o.email === e) || null;
}
// Returns "ok" | "wrong" | "expired" | "missing"
function verifyOtp(email, otp) {
  const rec = getOtp(email);
  if (!rec) return "missing";
  if (Date.now() > rec.expiringAt) return "expired";
  if (String(otp) !== rec.otp) return "wrong";
  rec.status = "verified";
  rec.verifiedAt = Date.now();
  persist();
  return "ok";
}
// A verified, still-unexpired OTP authorizes the actual password change.
function hasVerifiedOtp(email) {
  const rec = getOtp(email);
  return !!(rec && rec.status === "verified" && Date.now() <= rec.expiringAt + 5 * 60_000);
}
function clearOtp(email) {
  const e = normEmail(email);
  state.otps = state.otps.filter((o) => o.email !== e);
  persist();
}

module.exports = {
  findUserByEmail, findUserById, createUser, setUserPassword, publicUser,
  saveOtp, getOtp, verifyOtp, hasVerifiedOtp, clearOtp,
};
