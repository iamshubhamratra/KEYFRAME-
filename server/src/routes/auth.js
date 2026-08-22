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
const { wrap } = require("./wrap");
const {
  loginLimiter, signupLimiter, otpSendLimiter, otpVerifyLimiter, passwordResetLimiter,
} = require("../auth/limits");

// A REAL BCRYPT HASH OF A VALUE NOTHING WILL EVER SUBMIT, used to spend the same ~100ms on a
// login for an address that does not exist as on one that does. It must be a genuine hash at the
// same cost factor the live ones use (10), or the comparison returns early and the timing
// difference it exists to erase comes straight back.
const DUMMY_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

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
  r.post("/signup", signupLimiter, wrap(async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = req.body?.password;
      if (!name || !isEmail(email) || !okPass(password)) {
        return res.status(400).json({ error: "Provide a name, a valid email, and a password of 8+ characters." });
      }
      // KNOWN, DELIBERATE, AND THE LAST ONE LEFT. This 409 confirms that an address is
      // registered, exactly like the send-otp 404 that was just closed. It is NOT closed the
      // same way because it cannot be: the flow signs the user straight in on success, so the
      // two outcomes must differ visibly — a new address gets 201 and a session, and there is no
      // response that both hides the duplicate AND tells a genuinely new user they are in.
      //
      // Closing it properly means making every signup go through an emailed verification link,
      // so BOTH cases answer "check your email" and neither creates a session. That is a feature
      // with its own UX, not a line change, and it is not being smuggled in here.
      //
      // What blunts it meanwhile: signupLimiter caps this route at 5 attempts per hour per IP,
      // which turns list-enumeration from a script into a months-long project. That is
      // mitigation, not a fix, and it is written down here so the next person reads it as a
      // known gap rather than an oversight.
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
  }));

  // ---- login ----
  r.post("/login", loginLimiter, wrap(async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = req.body?.password;
      if (!isEmail(email) || !password) {
        return res.status(400).json({ error: "Enter your email and password." });
      }
      // THE PER-ACCOUNT LOCKOUT, checked BEFORE the password is compared. The IP limiter above
      // stops one address; this stops one mailbox being worked on from many. Deliberately the
      // same 401 wording either way — announcing "this account is locked" would confirm the
      // address is registered to anyone who asks.
      const lockedUntil = store.loginLockedUntil(email);
      if (lockedUntil) {
        const mins = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
        return res.status(429).json({ error: `Too many sign-in attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` });
      }
      // A TIMING ORACLE IS STILL AN ORACLE. The message was already identical for both cases,
      // but the WORK was not: a registered address ran bcrypt (~100ms by design) and an
      // unregistered one returned immediately, so the response time answered the question the
      // wording refused to. comparePassword against a dummy hash keeps the cost the same
      // whether or not the account exists.
      const user = store.findUserByEmail(email);
      const ok = user
        ? await comparePassword(password, user.passwordHash)
        : (await comparePassword(password, DUMMY_HASH), false);
      if (!ok) {
        store.noteFailedLogin(email);
        return res.status(401).json({ error: "Wrong email or password." });
      }
      store.clearFailedLogins(email);
      setSession(res, user);
      const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress;
      mailer.sendLoginAlert({ to: user.email, userName: user.name, ip, device: req.headers["user-agent"] })
        .catch((e) => console.warn(`[auth] login alert failed: ${e.message}`));
      // Same reason as /me below: bring the stored role into line with the ADMIN_EMAILS allowlist
      // so a freshly-allowlisted account sees the Admin door on its very first login.
      return res.json({ user: store.publicUser(store.syncRole(user)) });
    } catch (e) {
      console.error(`[auth] login error: ${e.message}`);
      return res.status(500).json({ error: "Could not log in." });
    }
  }));

  // ---- logout ----
  r.post("/logout", (_req, res) => {
    res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
    return res.json({ ok: true });
  });

  // ---- current user ----
  //
  // syncRole FIRST. `requireAdmin` decides from the ADMIN_EMAILS allowlist directly, so adding an
  // address grants API access immediately — but the CLIENT decides whether to show the Admin door
  // from `user.role`, which is the value stored on the record. For an account that existed before
  // the address was allowlisted that value is still "user", so the admin API would work while the
  // UI offered no way in. Syncing on the session read is what makes the allowlist take effect in
  // both directions without anyone having to re-register.
  r.get("/me", requireAuth, (req, res) => {
    const user = store.findUserById(req.userId);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    return res.json({ user: store.publicUser(store.syncRole(user)) });
  });

  // ---- forgot: send OTP ----
  r.post("/forgot/send-otp", otpSendLimiter, wrap(async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      if (!isEmail(email)) return res.status(400).json({ error: "Enter a valid email." });
      const user = store.findUserByEmail(email);
      // THE CLASSIC ENUMERATION ORACLE, CLOSED. This answered 404 "No account found with that
      // email" for an unregistered address and 200 for a registered one, which turns an
      // anonymous, unauthenticated endpoint into a membership test: feed it a list, keep the
      // 200s. A password-reset form has no legitimate need to confirm who has an account here.
      //
      // The reply is now identical either way. A real address still gets a real code; an
      // unknown one gets the same sentence and no mail. `emailed` is deliberately NOT reported
      // any more — it was a second copy of the same signal wearing a boolean.
      if (!user) return res.json({ ok: true, sent: true });
      const otp = generateOtp(6);
      store.saveOtp({ email, otp });
      const r2 = await mailer.sendOtp({ to: email, otp, userName: user.name }).catch((e) => ({ error: e.message }));
      if (r2?.skipped || r2?.error || process.env.NODE_ENV !== "production") {
        // Dev / no mailer: surface the OTP in the server log so the flow is testable.
        console.log(`[auth] password-reset OTP for ${email}: ${otp}${r2?.error ? ` (mail error: ${r2.error})` : ""}`);
      }
      return res.json({ ok: true, sent: true });
    } catch (e) {
      console.error(`[auth] send-otp error: ${e.message}`);
      return res.status(500).json({ error: "Could not send the code." });
    }
  }));

  // ---- forgot: verify OTP ----
  r.post("/forgot/verify-otp", otpVerifyLimiter, (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otp = String(req.body?.otp || "").trim();
    if (!isEmail(email) || !/^\d{4,8}$/.test(otp)) return res.status(400).json({ error: "Enter the code we emailed you." });
    const result = store.verifyOtp(email, otp);
    if (result === "ok") return res.json({ ok: true });
    const msg = result === "expired" ? "That code has expired — request a new one."
      : result === "missing" ? "No active code — request a new one."
      // The code was burnt after too many wrong guesses; say so, because the next thing this
      // person needs to do is request a new one rather than keep typing.
      : result === "locked" ? "Too many incorrect attempts — that code is no longer valid. Request a new one."
      : "Incorrect code.";
    return res.status(400).json({ error: msg });
  });

  // ---- forgot: set new password (requires a verified OTP) ----
  r.post("/forgot/set-new-password", passwordResetLimiter, wrap(async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const newPassword = req.body?.newPassword;
      if (!isEmail(email) || !okPass(newPassword)) return res.status(400).json({ error: "Choose a new password of 8+ characters." });
      // Both branches answer the same 403. Splitting them into "verify the code first" and
      // "no account found" would hand back the membership test that send-otp just stopped
      // giving away — and a caller who has not verified a code cannot tell the two apart
      // legitimately, because without a verified code they have no business here either way.
      const user = store.findUserByEmail(email);
      if (!store.hasVerifiedOtp(email) || !user) {
        return res.status(403).json({ error: "Verify the emailed code first." });
      }
      store.setUserPassword(user.id, await hashPassword(newPassword));
      store.clearOtp(email);
      return res.json({ ok: true });
    } catch (e) {
      console.error(`[auth] set-new-password error: ${e.message}`);
      return res.status(500).json({ error: "Could not reset the password." });
    }
  }));

  return r;
}

module.exports = { buildRouter };
