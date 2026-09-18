// Auth — /api/auth/*. JWT in an httpOnly cookie, users in models/user.js.
//   POST /signup                  name+email+password -> create + auto-login + welcome mail
//   POST /login                   email+password -> JWT cookie + login-alert mail
//   POST /logout                  clear cookie
//   GET  /me                      current user (or 401)
//   POST /forgot/send-otp         email -> 6-digit OTP mailed (5-min expiry)
//   POST /forgot/verify-otp       email+otp -> mark verified
//   POST /forgot/set-new-password email+newPassword -> requires a verified OTP

const users = require("../models/user");
const mailer = require("../services/mailer");
const {
  COOKIE, hashPassword, comparePassword, generateOtp,
  signToken, cookieOptions,
} = require("../services/auth");
const { isEmail, isValidPassword, normalizeEmail } = require("../validators/auth");

function appUrl(req) {
  return (process.env.WEB_ORIGIN || "").split(",")[0].trim()
    || (req.headers.origin || "")
    || "/";
}
function setSession(res, user) {
  res.cookie(COOKIE, signToken(user.id), cookieOptions());
}

async function signup(req, res) {
  try {
    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!name || !isEmail(email) || !isValidPassword(password)) {
      return res.status(400).json({ error: "Provide a name, a valid email, and a password of 8+ characters." });
    }
    if (await users.findUserByEmail(email)) {
      return res.status(409).json({ error: "An account with that email already exists — please log in." });
    }
    const user = await users.createUser({ name, email, passwordHash: await hashPassword(password) });
    setSession(res, user);
    mailer.sendWelcome({ to: user.email, userName: user.name, appUrl: appUrl(req) })
      .catch((e) => console.warn(`[auth] welcome mail failed: ${e.message}`));
    return res.status(201).json({ user: users.publicUser(user) });
  } catch (e) {
    console.error(`[auth] signup error: ${e.message}`);
    return res.status(500).json({ error: "Could not create the account." });
  }
}

async function login(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!isEmail(email) || !password) {
      return res.status(400).json({ error: "Enter your email and password." });
    }
    const user = await users.findUserByEmail(email);
    if (!user || !(await comparePassword(password, user.passwordHash))) {
      return res.status(401).json({ error: "Wrong email or password." });
    }
    setSession(res, user);
    const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress;
    mailer.sendLoginAlert({ to: user.email, userName: user.name, ip, device: req.headers["user-agent"] })
      .catch((e) => console.warn(`[auth] login alert failed: ${e.message}`));
    return res.json({ user: users.publicUser(user) });
  } catch (e) {
    console.error(`[auth] login error: ${e.message}`);
    return res.status(500).json({ error: "Could not log in." });
  }
}

function logout(_req, res) {
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
  return res.json({ ok: true });
}

// Behind requireAuth, so req.userId is set.
async function me(req, res) {
  try {
    const user = await users.findUserById(req.userId);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    return res.json({ user: users.publicUser(user) });
  } catch (e) {
    console.error(`[auth] me error: ${e.message}`);
    return res.status(500).json({ error: "Could not load the account." });
  }
}

async function sendResetOtp(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!isEmail(email)) return res.status(400).json({ error: "Enter a valid email." });
    const user = await users.findUserByEmail(email);
    if (!user) return res.status(404).json({ error: "No account found with that email." });
    const otp = generateOtp(6);
    await users.saveOtp({ email, otp });
    const sent = await mailer.sendOtp({ to: email, otp, userName: user.name }).catch((e) => ({ error: e.message }));
    if (sent?.skipped || sent?.error || process.env.NODE_ENV !== "production") {
      // Dev / no mailer: surface the OTP in the server log so the flow is testable.
      console.log(`[auth] password-reset OTP for ${email}: ${otp}${sent?.error ? ` (mail error: ${sent.error})` : ""}`);
    }
    return res.json({ ok: true, emailed: !!sent?.messageId });
  } catch (e) {
    console.error(`[auth] send-otp error: ${e.message}`);
    return res.status(500).json({ error: "Could not send the code." });
  }
}

async function verifyResetOtp(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();
    if (!isEmail(email) || !/^\d{4,8}$/.test(otp)) return res.status(400).json({ error: "Enter the code we emailed you." });
    const result = await users.verifyOtp(email, otp);
    if (result === "ok") return res.json({ ok: true });
    const msg = result === "expired" ? "That code has expired — request a new one."
      : result === "missing" ? "No active code — request a new one."
      : "Incorrect code.";
    return res.status(400).json({ error: msg });
  } catch (e) {
    console.error(`[auth] verify-otp error: ${e.message}`);
    return res.status(500).json({ error: "Could not verify the code." });
  }
}

async function setNewPassword(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const newPassword = req.body?.newPassword;
    if (!isEmail(email) || !isValidPassword(newPassword)) return res.status(400).json({ error: "Choose a new password of 8+ characters." });
    if (!(await users.hasVerifiedOtp(email))) return res.status(403).json({ error: "Verify the emailed code first." });
    const user = await users.findUserByEmail(email);
    if (!user) return res.status(404).json({ error: "No account found." });
    await users.setUserPassword(user.id, await hashPassword(newPassword));
    await users.clearOtp(email);
    return res.json({ ok: true });
  } catch (e) {
    console.error(`[auth] set-new-password error: ${e.message}`);
    return res.status(500).json({ error: "Could not reset the password." });
  }
}

module.exports = { signup, login, logout, me, sendResetOtp, verifyResetOtp, setNewPassword };
