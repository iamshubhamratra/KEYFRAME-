// RATE LIMITS FOR THE AUTH SURFACE.
//
// THE HOLE THIS CLOSES. express-rate-limit was already a dependency and already guarded
// /api/generate and /api/projects — the two routes that cost CPU. Nothing guarded the routes
// that cost an ACCOUNT. POST /api/auth/login took unlimited password guesses, and
// POST /api/auth/forgot/verify-otp took unlimited guesses at a SIX-DIGIT code with a five-minute
// window and no attempt counter anywhere in the store. A million candidates against a five-minute
// window is not a theoretical attack; at a few hundred requests a second it is a coin flip per
// window, and the attacker gets a fresh window whenever they like by asking for a new code.
//
// TWO KEYS, ALWAYS, because they fail in different directions:
//
//   · PER IP    cheap, catches the naive script, and is the only thing that can protect an
//               address that does not correspond to an account yet (signup).
//   · PER EMAIL the one that actually matters. X-Forwarded-For is client-supplied and a botnet
//               rotates addresses for free, so an IP quota alone leaves a targeted account
//               exactly as guessable as before. A counter attached to the identity being
//               attacked cannot be shaken off by moving house.
//
// The per-email half lives in store.js next to the record it protects (see noteFailedLogin and
// the OTP attempt cap); this file is the per-IP half plus the shared shape.
const rateLimit = require("express-rate-limit");
const { clientIp } = require("../services/client_ip");

// A limiter keyed by IP. `max` over `windowMs`, answering 429 with the same {error, hint} shape
// the rest of the API uses so the client's json() helper renders it like any other failure.
function ipLimiter({ windowMs, max, hint }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => clientIp(req),
    // COUNT ONLY WHAT FAILED, on the routes where that distinction matters. A person logging in
    // correctly ten times from an office NAT is not an attack; ten wrong passwords is. Leaving
    // successes uncounted keeps the quota tight enough to bite without turning a shared IP into
    // a denial of service against everyone behind it.
    skipSuccessfulRequests: true,
    message: { error: "too many attempts", hint },
  });
}

const MIN = 60 * 1000;

// Login: tight. Five minutes of wrong passwords from one address and that address waits.
const loginLimiter = ipLimiter({
  windowMs: 15 * MIN, max: 10,
  hint: "too many sign-in attempts — wait a few minutes and try again",
});

// Signup: not a guessing attack, an account-flood one. Counts successes too (that IS the abuse),
// so it is built directly rather than through ipLimiter.
const signupLimiter = rateLimit({
  windowMs: 60 * MIN, max: 5,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
  message: { error: "too many attempts", hint: "too many accounts created from here — try again later" },
});

// Sending a code is an OUTBOUND EMAIL triggered by an anonymous caller: the abuse is mailbombing
// somebody else's inbox, so successes count. The per-email half of this is in store.js.
const otpSendLimiter = rateLimit({
  windowMs: 60 * MIN, max: 5,
  standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
  message: { error: "too many attempts", hint: "too many codes requested — try again later" },
});

// Verifying a code is the brute-force surface. The REAL protection is the per-OTP attempt cap in
// store.verifyOtp, which burns the code after a handful of wrong guesses no matter how many
// addresses they come from; this simply makes the attempt expensive as well as futile.
const otpVerifyLimiter = ipLimiter({
  windowMs: 15 * MIN, max: 10,
  hint: "too many code attempts — request a new code",
});

// Setting the password is already gated on a verified OTP; this is belt-and-braces against
// hammering that gate.
const passwordResetLimiter = ipLimiter({
  windowMs: 60 * MIN, max: 10,
  hint: "too many attempts — request a new code",
});

module.exports = {
  loginLimiter, signupLimiter, otpSendLimiter, otpVerifyLimiter, passwordResetLimiter,
};
