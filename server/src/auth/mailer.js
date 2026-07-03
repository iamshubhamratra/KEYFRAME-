// Nodemailer/Gmail mailer (same approach as Taskmate). Reads GMAIL_USER +
// GMAIL_PASS (a Gmail App Password) from env. If they're absent, sending is a
// no-op that logs a warning — so the auth flow still works in dev (the route
// logs the OTP to the console) without blowing up on a missing transporter.

const nodemailer = require("nodemailer");
const { otpEmail, welcomeEmail, loginAlertEmail } = require("./templates");

const GMAIL_USER = (process.env.GMAIL_USER || "").trim();
const GMAIL_PASS = (process.env.GMAIL_PASS || process.env.GMAIL_APP_PASSWORD || "").trim();

let transporter = null;
if (GMAIL_USER && GMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });
  console.log(`[auth] mailer ready (gmail: ${GMAIL_USER})`);
} else {
  console.warn("[auth] GMAIL_USER/GMAIL_PASS not set — emails will be logged, not sent. Set them in .env to deliver OTPs.");
}

function ready() { return !!transporter; }

const FROM = `"KEYFRAME" <${GMAIL_USER || "no-reply@keyframe.local"}>`;

async function send({ to, subject, html }) {
  if (!transporter) {
    console.warn(`[auth] (email not sent — no transporter) to=${to} subject="${subject}"`);
    return { skipped: true };
  }
  const info = await transporter.sendMail({ from: FROM, to, subject, html });
  return { messageId: info.messageId };
}

async function sendOtp({ to, otp, userName }) {
  return send({ to, subject: "🔒 Your KEYFRAME password reset code", html: otpEmail({ otp, userName }) });
}
async function sendWelcome({ to, userName, appUrl }) {
  return send({ to, subject: "🎬 Welcome to KEYFRAME", html: welcomeEmail({ userName, appUrl }) });
}
async function sendLoginAlert({ to, userName, ip, device }) {
  return send({ to, subject: "🔔 New sign-in to KEYFRAME", html: loginAlertEmail({ userName, ip, device, dateTime: new Date().toLocaleString() }) });
}

module.exports = { ready, sendOtp, sendWelcome, sendLoginAlert };
