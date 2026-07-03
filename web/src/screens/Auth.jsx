import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../AuthContext.jsx";
import * as api from "../api.js";

// Unified auth screen: login · signup · forgot-password (3-step OTP), all in the
// editorial design system. Shown by App when an unauthenticated visitor tries to
// enter the studio. onAuthed() fires after a successful login/signup; onBack()
// returns to the public landing.
export default function Auth({ initialMode = "login", onAuthed, onBack }) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState(initialMode); // login | signup | forgot
  // Sync when the parent changes the requested mode (e.g. nav Log in / Sign up
  // while the Auth screen is already mounted).
  useEffect(() => { setMode(initialMode); setError(null); setNotice(null); setFStep(1); }, [initialMode]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // forgot-password sub-flow
  const [fStep, setFStep] = useState(1); // 1=email 2=otp 3=newpass
  const [otp, setOtp] = useState("");
  const [newPass, setNewPass] = useState("");

  const go = (m) => { setMode(m); setError(null); setNotice(null); setFStep(1); setOtp(""); setNewPass(""); };

  async function wrap(fn) {
    setBusy(true); setError(null);
    try { await fn(); }
    catch (e) { setError(e.message || "Something went wrong."); }
    finally { setBusy(false); }
  }

  const doLogin = () => wrap(async () => { await login({ email, password }); onAuthed?.(); });
  const doSignup = () => wrap(async () => {
    if (!name.trim()) throw new Error("Enter your name.");
    await signup({ name, email, password }); onAuthed?.();
  });
  const doSendOtp = () => wrap(async () => { await api.sendResetOtp(email); setNotice("We emailed you a 6-digit code (check spam)."); setFStep(2); });
  const doVerifyOtp = () => wrap(async () => { await api.verifyResetOtp(email, otp); setNotice("Code verified — choose a new password."); setFStep(3); });
  const doReset = () => wrap(async () => {
    await api.setNewPassword(email, newPass);
    setNotice("Password reset — you can log in now."); go("login"); setNotice("Password reset — log in with your new password.");
  });

  const title = mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back";
  const eyebrow = mode === "signup" ? "Join KEYFRAME" : mode === "forgot" ? "Account recovery" : "Sign in to the studio";

  return (
    <div className="min-h-[calc(100vh-72px)] flex items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="card w-full max-w-md p-8 sm:p-10"
      >
        <span className="spine" style={{ "--spine": "var(--color-mag)" }} />
        {/* brand — the v2 ink square + glowing magenta dot */}
        <div className="flex items-center gap-3 mb-7">
          <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--color-ink)", display: "grid", placeItems: "center" }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--color-mag)", boxShadow: "0 0 10px var(--color-mag)" }} />
          </span>
          <span className="wordmark" style={{ fontSize: 18 }}>KEYFRAME</span>
        </div>

        <div className="eyebrow">{eyebrow}</div>
        <h1 className="mt-2 font-display font-extrabold tracking-tight text-[34px] leading-[1.05]" style={{ color: "var(--color-ink)" }}>{title}</h1>

        <AnimatePresence mode="wait">
          <motion.div key={mode + fStep} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="mt-6">
            {/* ---------- LOGIN ---------- */}
            {mode === "login" && (
              <form onSubmit={(e) => { e.preventDefault(); doLogin(); }} className="space-y-3">
                <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@studio.com" autoComplete="email" />
                <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" autoComplete="current-password" />
                <div className="text-right">
                  <button type="button" onClick={() => go("forgot")} className="label-mono" style={{ color: "var(--color-accent-text)" }}>Forgot password?</button>
                </div>
                <Submit busy={busy} label="Log in" />
                <Switch>New here? <Link onClick={() => go("signup")}>Create an account</Link></Switch>
              </form>
            )}

            {/* ---------- SIGNUP ---------- */}
            {mode === "signup" && (
              <form onSubmit={(e) => { e.preventDefault(); doSignup(); }} className="space-y-3">
                <Field label="Name" value={name} onChange={setName} placeholder="Ada Lovelace" autoComplete="name" />
                <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@studio.com" autoComplete="email" />
                <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 8 characters" autoComplete="new-password" />
                <Submit busy={busy} label="Create account" />
                <Switch>Already have an account? <Link onClick={() => go("login")}>Log in</Link></Switch>
              </form>
            )}

            {/* ---------- FORGOT (3 steps) ---------- */}
            {mode === "forgot" && fStep === 1 && (
              <form onSubmit={(e) => { e.preventDefault(); doSendOtp(); }} className="space-y-3">
                <p className="text-sm text-dim">Enter your email and we'll send a one-time code.</p>
                <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@studio.com" autoComplete="email" />
                <Submit busy={busy} label="Send code" />
                <Switch><Link onClick={() => go("login")}>← Back to log in</Link></Switch>
              </form>
            )}
            {mode === "forgot" && fStep === 2 && (
              <form onSubmit={(e) => { e.preventDefault(); doVerifyOtp(); }} className="space-y-3">
                <p className="text-sm text-dim">Enter the 6-digit code we emailed to <b style={{ color: "var(--color-ink)" }}>{email}</b>.</p>
                <Field label="Code" value={otp} onChange={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))} placeholder="000000" inputMode="numeric" />
                <Submit busy={busy} label="Verify code" />
                <Switch><Link onClick={() => doSendOtp()}>Resend code</Link> · <Link onClick={() => go("login")}>Cancel</Link></Switch>
              </form>
            )}
            {mode === "forgot" && fStep === 3 && (
              <form onSubmit={(e) => { e.preventDefault(); doReset(); }} className="space-y-3">
                <Field label="New password" type="password" value={newPass} onChange={setNewPass} placeholder="At least 8 characters" autoComplete="new-password" />
                <Submit busy={busy} label="Reset password" />
              </form>
            )}
          </motion.div>
        </AnimatePresence>

        {notice && <p className="mt-4 text-sm" style={{ color: "var(--color-accent-text)" }}>{notice}</p>}
        {error && <p className="mt-4 text-sm" style={{ color: "var(--color-coral)" }}>{error}</p>}

        {onBack && (
          <div className="mt-6 pt-5" style={{ borderTop: "1px solid var(--color-line)" }}>
            <button onClick={onBack} className="label-mono" style={{ color: "var(--color-dim)" }}>← Back to home</button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Field({ label, type = "text", value, onChange, placeholder, ...rest }) {
  return (
    <label className="block">
      <span className="label-mono block mb-1.5">{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="field w-full px-4 py-3 text-[15px]" {...rest}
      />
    </label>
  );
}
function Submit({ busy, label }) {
  return <button type="submit" disabled={busy} className="btn-lime w-full mt-2 py-3.5 text-[15px]">{busy ? "…" : label}</button>;
}
function Switch({ children }) {
  return <p className="mt-4 text-center text-sm text-dim">{children}</p>;
}
function Link({ onClick, children }) {
  return <button type="button" onClick={onClick} className="font-semibold" style={{ color: "var(--color-accent-text)" }}>{children}</button>;
}
