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

// ---------------------------------------------------------------- roles
//
// The `role` field has existed on every user record since auth landed (createUser stamps it,
// publicUser returns it, the frontend's AuthContext holds it) and NOTHING has ever read it — a
// whole-repo grep for a role comparison returns only scene-role and ARIA noise. The admin
// template system is its first consumer.
//
// TWO SOURCES, DELIBERATELY. The record is the durable store, but server/auth-store.json is
// both gitignored AND dockerignored, so on Render it is recreated empty on every redeploy: a
// role flag that lives only there cannot survive a deploy, and there is no way to commit one.
// So an env allowlist is the bootstrap — set ADMIN_EMAILS and those accounts are admins the
// moment they exist, on a fresh container, with no manual step. The record is then stamped to
// match so `publicUser` reports it to the client and the UI can render the admin entry point.
const ADMIN_EMAILS = new Set(
  String(process.env.ADMIN_EMAILS || "")
    .split(",").map((e) => normEmail(e)).filter(Boolean)
);
if (ADMIN_EMAILS.size) console.log(`[auth] admin allowlist: ${ADMIN_EMAILS.size} address(es)`);

function isAdminEmail(email) { return ADMIN_EMAILS.has(normEmail(email)); }

// Is this user an admin? The allowlist wins over the stored role in BOTH directions: adding an
// address promotes without a manual edit, and removing it demotes even if a stale record still
// says "admin". That is what makes the env var an actual control rather than a one-way seed.
function isAdmin(user) {
  if (!user) return false;
  if (ADMIN_EMAILS.size) return isAdminEmail(user.email);
  return user.role === "admin";
}

// Bring the stored role into line with the allowlist. Called on the paths that already load a
// user (login, session read), so the field the client sees is never stale.
function syncRole(user) {
  if (!user || !ADMIN_EMAILS.size) return user;
  const want = isAdminEmail(user.email) ? "admin" : "user";
  if (user.role !== want) {
    user.role = want;
    user.updatedAt = Date.now();
    persist();
  }
  return user;
}

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
    role: isAdminEmail(email) ? "admin" : "user",
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
// A SIX-DIGIT CODE SURVIVES ONLY IF GUESSES ARE COUNTED.
//
// This used to compare and return, with no counter anywhere: a caller could try all 10^6
// candidates against the five-minute window, and on a wrong guess nothing was recorded, so the
// millionth attempt was exactly as welcome as the first. An IP quota does not fix that on its
// own — the attempts can come from anywhere — so the cap lives HERE, on the record being
// attacked, where the attacker's address is irrelevant.
//
// The code is BURNT at the cap rather than merely paused. A code that keeps living after five
// wrong guesses just asks the attacker to come back through a different address; deleting it
// costs a legitimate user one "request a new code" and costs an attacker the whole window.
const OTP_MAX_ATTEMPTS = 5;

// Returns "ok" | "wrong" | "expired" | "missing" | "locked"
function verifyOtp(email, otp) {
  const rec = getOtp(email);
  if (!rec) return "missing";
  if (Date.now() > rec.expiringAt) return "expired";
  if (String(otp) !== rec.otp) {
    rec.attempts = (rec.attempts || 0) + 1;
    if (rec.attempts >= OTP_MAX_ATTEMPTS) { clearOtp(email); return "locked"; }
    persist();
    return "wrong";
  }
  rec.status = "verified";
  rec.verifiedAt = Date.now();
  persist();
  return "ok";
}

// ---------------------------------------------------------------- login throttle
//
// The per-ACCOUNT half of the login limit. src/auth/limits.js caps attempts per IP, which stops
// a script on one address and does nothing at all about a botnet working through one mailbox's
// password. This counter is attached to the email, so rotating addresses buys the attacker
// nothing; a correct password clears it, so a person who mistypes twice and then succeeds never
// notices it exists.
//
// In memory, deliberately not persisted: the window is fifteen minutes, the store is rewritten
// on every failure otherwise, and a process restart forgetting a lockout is a far smaller
// problem than a disk write per wrong password.
const LOGIN_MAX_FAILURES = 8;
const LOGIN_WINDOW_MS = 15 * 60_000;
const loginFailures = new Map(); // email -> { n, first }

function loginLockedUntil(email) {
  const rec = loginFailures.get(normEmail(email));
  if (!rec) return 0;
  if (Date.now() - rec.first > LOGIN_WINDOW_MS) { loginFailures.delete(normEmail(email)); return 0; }
  return rec.n >= LOGIN_MAX_FAILURES ? rec.first + LOGIN_WINDOW_MS : 0;
}
function noteFailedLogin(email) {
  const e = normEmail(email);
  const rec = loginFailures.get(e);
  if (!rec || Date.now() - rec.first > LOGIN_WINDOW_MS) loginFailures.set(e, { n: 1, first: Date.now() });
  else rec.n += 1;
}
function clearFailedLogins(email) { loginFailures.delete(normEmail(email)); }
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
  loginLockedUntil, noteFailedLogin, clearFailedLogins,
  isAdmin, isAdminEmail, syncRole, ADMIN_EMAILS,
};
