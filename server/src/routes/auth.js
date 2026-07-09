// Auth routes — /api/auth/*. Ports Taskmate's flow to KEYFRAME's file store:
//   POST /signup                 name+email+password -> create + auto-login + welcome mail
//   POST /login                  email+password -> JWT cookie + login-alert mail
//   POST /logout                 clear cookie
//   GET  /me                     current user (or 401)
//   POST /forgot/send-otp        email -> 6-digit OTP mailed (5-min expiry)
//   POST /forgot/verify-otp      email+otp -> mark verified
//   POST /forgot/set-new-password email+newPassword -> requires a verified OTP

const express = require("express");
const store = require("../auth/store");
const mailer = require("../auth/mailer");
const {
  COOKIE, hashPassword, comparePassword, generateOtp,
  signToken, cookieOptions,
} = require("../auth/helpers");
const { requireAuth } = require("../auth/middleware");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmail = (e) => typeof e === "string" && EMAIL_RE.test(e.trim());
const okPass = (p) => typeof p === "string" && p.length >= 8 && p.length <= 100;

function appUrl(req) {
  return (process.env.WEB_ORIGIN || "").split(",")[0].trim()
    || (req.headers.origin || "")
    || "/";
}
function setSession(res, user) {
  res.cookie(COOKIE, signToken(user.id), cookieOptions());
}

function buildRouter() {
  const r = express.Router();

  // ---- signup ----
  r.post("/signup", async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = req.body?.password;
      if (!name || !isEmail(email) || !okPass(password)) {
        return res.status(400).json({ error: "Provide a name, a valid email, and a password of 8+ characters." });
      }
      if (store.findUserByEmail(email)) {
        return res.status(409).json({ error: "An account with that email already exists — please log in." });
      }
      const user = store.createUser({ name, email, passwordHash: await hashPassword(password) });
      setSession(res, user);
      mailer.sendWelcome({ to: user.email, userName: user.name, appUrl: appUrl(req) })
        .catch((e) => console.warn(`[auth] welcome mail failed: ${e.message}`));
      return res.status(201).json({ user: store.publicUser(user) });
    } catch (e) {
      console.error(`[auth] signup error: ${e.message}`);
      return res.status(500).json({ error: "Could not create the account." });
    }
  });

  // ---- login ----
  r.post("/login", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = req.body?.password;
      if (!isEmail(email) || !password) {
        return res.status(400).json({ error: "Enter your email and password." });
      }
      const user = store.findUserByEmail(email);
      if (!user || !(await comparePassword(password, user.passwordHash))) {
        return res.status(401).json({ error: "Wrong email or password." });
      }
      setSession(res, user);
      const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress;
      mailer.sendLoginAlert({ to: user.email, userName: user.name, ip, device: req.headers["user-agent"] })
        .catch((e) => console.warn(`[auth] login alert failed: ${e.message}`));
      return res.json({ user: store.publicUser(user) });
    } catch (e) {
      console.error(`[auth] login error: ${e.message}`);
      return res.status(500).json({ error: "Could not log in." });
    }
  });

  // ---- logout ----
  r.post("/logout", (_req, res) => {
    res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
    return res.json({ ok: true });
  });

  // ---- current user ----
  r.get("/me", requireAuth, (req, res) => {
    const user = store.findUserById(req.userId);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    return res.json({ user: store.publicUser(user) });
  });

  // ---- forgot: send OTP ----
  r.post("/forgot/send-otp", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!isEmail(email)) return res.status(400).json({ error: "Enter a valid email." });
      const user = store.findUserByEmail(email);
      if (!user) return res.status(404).json({ error: "No account found with that email." });
      const otp = generateOtp(6);
      store.saveOtp({ email, otp });
      const r2 = await mailer.sendOtp({ to: email, otp, userName: user.name }).catch((e) => ({ error: e.message }));
      if (r2?.skipped || r2?.error || process.env.NODE_ENV !== "production") {
        // Dev / no mailer: surface the OTP in the server log so the flow is testable.
        console.log(`[auth] password-reset OTP for ${email}: ${otp}${r2?.error ? ` (mail error: ${r2.error})` : ""}`);
      }
      return res.json({ ok: true, emailed: !!r2?.messageId });
    } catch (e) {
      console.error(`[auth] send-otp error: ${e.message}`);
      return res.status(500).json({ error: "Could not send the code." });
    }
  });

  // ---- forgot: verify OTP ----
  r.post("/forgot/verify-otp", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();
    if (!isEmail(email) || !/^\d{4,8}$/.test(otp)) return res.status(400).json({ error: "Enter the code we emailed you." });
    const result = store.verifyOtp(email, otp);
    if (result === "ok") return res.json({ ok: true });
    const msg = result === "expired" ? "That code has expired — request a new one."
      : result === "missing" ? "No active code — request a new one."
      : "Incorrect code.";
    return res.status(400).json({ error: msg });
  });

  // ---- forgot: set new password (requires a verified OTP) ----
  r.post("/forgot/set-new-password", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const newPassword = req.body?.newPassword;
      if (!isEmail(email) || !okPass(newPassword)) return res.status(400).json({ error: "Choose a new password of 8+ characters." });
      if (!store.hasVerifiedOtp(email)) return res.status(403).json({ error: "Verify the emailed code first." });
      const user = store.findUserByEmail(email);
      if (!user) return res.status(404).json({ error: "No account found." });
      store.setUserPassword(user.id, await hashPassword(newPassword));
      store.clearOtp(email);
      return res.json({ ok: true });
    } catch (e) {
      console.error(`[auth] set-new-password error: ${e.message}`);
      return res.status(500).json({ error: "Could not reset the password." });
    }
  });

  return r;
}

module.exports = { buildRouter };
