// KEYFRAME-branded HTML email templates (editorial identity: cream paper, olive
// ink, lime/green accent, heavy display wordmark). Email-client-safe: inline
// styles + table layout + web-safe font stack (custom fonts don't load in mail,
// so heavy weights approximate the Bricolage display).

const INK = "#1A1D12", GREEN = "#6FAE12", LIME = "#B9F24A", GROUND = "#E9E6DD",
  PAPER = "#FBFAF6", DIM = "#6F7264", LINE = "rgba(20,22,12,0.12)";
const FONT = "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', sans-serif";

function wordmark() {
  return `<span style="font-family:${FONT};font-weight:800;letter-spacing:-0.02em;font-size:26px;">`
    + `<span style="color:${INK};">KEY</span><span style="color:${GREEN};">FRAME</span></span>`;
}

function layout({ title, contentHtml }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:${GROUND};font-family:${FONT};-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GROUND};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${PAPER};border:1px solid ${LINE};border-radius:20px;overflow:hidden;box-shadow:0 14px 40px rgba(20,22,12,0.10);">
        <tr><td style="padding:28px 32px 8px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;padding-right:10px;">
              <span style="display:inline-block;width:22px;height:22px;border-radius:50%;border:2px solid ${INK};line-height:0;text-align:center;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${GREEN};margin-top:5px;"></span>
              </span>
            </td>
            <td style="vertical-align:middle;">${wordmark()}</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:8px 32px 32px 32px;">${contentHtml}</td></tr>
        <tr><td style="padding:18px 32px;background:${GROUND};border-top:1px solid ${LINE};">
          <p style="margin:0;font-family:${FONT};font-size:11px;color:${DIM};letter-spacing:0.04em;">
            KEYFRAME — multi-modal AI video studio · © ${year}<br>
            You received this because an account action used this email. If it wasn't you, you can ignore it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function h2(t) { return `<h1 style="margin:18px 0 8px 0;font-family:${FONT};font-weight:800;font-size:28px;line-height:1.05;letter-spacing:-0.02em;color:${INK};">${t}</h1>`; }
function p(t) { return `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${DIM};">${t}</p>`; }
function button(label, href) {
  return `<a href="${href}" style="display:inline-block;background:${LIME};color:#16200A;font-family:${FONT};font-weight:700;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:999px;">${label}</a>`;
}

// ---- OTP (password reset) ----
function otpEmail({ otp, userName, expiryMinutes = 5 }) {
  const content =
    h2("Reset your password") +
    p(`${userName ? `Hi ${esc(userName)}, w` : "W"}e got a request to reset your KEYFRAME password. Enter this code to continue:`) +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 14px 0;"><tr><td
        style="background:${GROUND};border:2px solid ${GREEN};border-radius:14px;padding:16px 24px;text-align:center;">
        <span style="font-family:${FONT};font-weight:800;font-size:38px;letter-spacing:0.34em;color:${INK};">${esc(otp)}</span>
      </td></tr></table>` +
    p(`This code expires in <b style="color:${INK};">${expiryMinutes} minutes</b>. Never share it — KEYFRAME will never ask you for it.`);
  return layout({ title: "Your KEYFRAME password reset code", contentHtml: content });
}

// ---- Welcome (signup) ----
function welcomeEmail({ userName, appUrl }) {
  const content =
    h2(`Welcome${userName ? `, ${esc(userName)}` : ""}.`) +
    p("Your KEYFRAME account is ready. Feed it a prompt, a URL, or a reference clip — it writes the script, you edit it, then it designs, voices, and renders the film.") +
    (appUrl ? `<div style="margin:10px 0 6px 0;">${button("Open the studio →", appUrl)}</div>` : "") +
    p("Roll your first film whenever you're ready.");
  return layout({ title: "Welcome to KEYFRAME", contentHtml: content });
}

// ---- Login alert ----
function loginAlertEmail({ userName, dateTime, ip, device }) {
  const row = (k, v) => `<tr><td style="padding:5px 0;font-family:${FONT};font-size:13px;color:${DIM};width:90px;">${k}</td><td style="padding:5px 0;font-family:${FONT};font-size:13px;color:${INK};">${esc(v || "Unknown")}</td></tr>`;
  const content =
    h2("New sign-in to KEYFRAME") +
    p(`${userName ? `Hi ${esc(userName)}, w` : "W"}e noticed a new sign-in to your account:`) +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:2px 0 14px 0;background:${GROUND};border:1px solid ${LINE};border-radius:12px;padding:8px 16px;">
      ${row("When", dateTime)}${row("Device", device)}${row("IP", ip)}</table>` +
    p(`If this was you, no action needed. If not, reset your password right away.`);
  return layout({ title: "New sign-in to your KEYFRAME account", contentHtml: content });
}

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

module.exports = { otpEmail, welcomeEmail, loginAlertEmail };
