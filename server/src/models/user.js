// MongoDB-backed user + OTP store — the auth counterpart to models/job.js.
// Was a JSON file (server/auth-store.json); moved to Mongo so accounts survive
// a redeploy on hosts with no persistent disk (Render free/standard). See
// services/mongo.js for the connection. Every export here is now async.

const crypto = require("node:crypto");
const mongo = require("../services/mongo");

async function users() { return (await mongo.connect()).collection("users"); }
async function otps() { return (await mongo.connect()).collection("otps"); }

const normEmail = (e) => String(e || "").trim().toLowerCase();

// ---------------------------------------------------------------- users
async function findUserByEmail(email) {
  const e = normEmail(email);
  return (await users()).findOne({ email: e });
}
async function findUserById(id) {
  if (!id) return null;
  return (await users()).findOne({ id });
}
async function createUser({ name, email, passwordHash }) {
  const user = {
    id: crypto.randomUUID(),
    name: String(name || "").trim(),
    email: normEmail(email),
    passwordHash,
    role: "user",
    createdAt: Date.now(),
  };
  await (await users()).insertOne(user);
  return user;
}
async function setUserPassword(id, passwordHash) {
  const r = await (await users()).updateOne({ id }, { $set: { passwordHash, updatedAt: Date.now() } });
  return r.matchedCount > 0;
}

// ---------------------------------------------------------------- admin
// WHO IS AN ADMIN, AND WHY IT IS NOT JUST A COLUMN.
//
// `role` has existed on every user record since the store was written, hardcoded
// to "user" at creation and never read for a decision anywhere in the codebase.
// Turning it into real authority needs an answer to "who grants it?", and a
// promote endpoint is the wrong answer: this store can lose data to operator
// error same as anything else, so a DB-only admin should not be the only way in.
//
// So the allowlist in config is AUTHORITATIVE and the stored role is additive:
//   config.auth.adminEmails: ["you@example.com"]   (or ADMIN_EMAILS env, csv)
// An allowlisted address is an admin on a brand-new box with an empty store, and
// no API call can ever grant admin to anyone — the only way in is deploy config.
// A stored role === "admin" still counts, so a future promote flow can be added
// without changing anything here.
function adminEmails() {
  const config = require("../config");
  const fromEnv = String(process.env.ADMIN_EMAILS || "").split(",");
  const fromCfg = (config.auth && config.auth.adminEmails) || [];
  return new Set([...fromEnv, ...fromCfg].map(normEmail).filter(Boolean));
}
function isAdmin(user) {
  if (!user) return false;
  return String(user.role || "") === "admin" || adminEmails().has(normEmail(user.email));
}
// The EFFECTIVE role — what the allowlist says, not just what was persisted, so
// the UI and the API agree without a migration over existing records.
function roleOf(user) { return isAdmin(user) ? "admin" : (user && user.role) || "user"; }

// Public-safe shape (never leak the hash).
function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, role: roleOf(u), createdAt: u.createdAt };
}

// ---------------------------------------------------------------- otps
// One active OTP per email for password reset. ttlMs default 5 min. expiresAt
// gates the OTP code itself; deleteAt is expiresAt + the hasVerifiedOtp grace
// window below, so Mongo's TTL index (services/mongo.js) only reaps a row
// once the app itself would already treat it as gone — no cron needed.
const VERIFIED_GRACE_MS = 5 * 60_000;
async function saveOtp({ email, otp, ttlMs = 5 * 60_000 }) {
  const e = normEmail(email);
  const expiresAt = new Date(Date.now() + ttlMs);
  const rec = {
    email: e, otp: String(otp), type: "email", status: "pending",
    expiresAt, deleteAt: new Date(expiresAt.getTime() + VERIFIED_GRACE_MS), createdAt: Date.now(),
  };
  // Only the newest OTP for an email is valid — replace, don't accumulate.
  await (await otps()).replaceOne({ email: e }, rec, { upsert: true });
  return rec;
}
async function getOtp(email) {
  const e = normEmail(email);
  return (await otps()).findOne({ email: e });
}
// Returns "ok" | "wrong" | "expired" | "missing"
async function verifyOtp(email, otp) {
  const rec = await getOtp(email);
  if (!rec) return "missing";
  if (Date.now() > rec.expiresAt.getTime()) return "expired";
  if (String(otp) !== rec.otp) return "wrong";
  await (await otps()).updateOne({ email: normEmail(email) }, { $set: { status: "verified", verifiedAt: Date.now() } });
  return "ok";
}
// A verified, still-unexpired OTP authorizes the actual password change.
async function hasVerifiedOtp(email) {
  const rec = await getOtp(email);
  return !!(rec && rec.status === "verified" && Date.now() <= rec.expiresAt.getTime() + VERIFIED_GRACE_MS);
}
async function clearOtp(email) {
  await (await otps()).deleteOne({ email: normEmail(email) });
}

module.exports = {
  findUserByEmail, findUserById, createUser, setUserPassword, publicUser,
  isAdmin, roleOf, adminEmails,
  saveOtp, getOtp, verifyOtp, hasVerifiedOtp, clearOtp,
};
