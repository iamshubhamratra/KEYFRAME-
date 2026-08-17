import { useAuth } from "../useAuth.js";
import { statusMeta, lineOf } from "../adminApi.js";
import { ORIENTATIONS } from "./Templates.jsx";

// Shared furniture for the three admin screens. Components only — the data
// (STATUS_META, PIPELINE_STAGES, helpers) lives in adminApi.js so this file
// stays fast-refresh friendly, the same split useAuth.js makes.

// THE GATE IS CONVENIENCE, NOT AUTHORIZATION. Hiding a screen hides a button;
// the boundary is requireAdmin on the server, which re-reads the user from the
// store on every request and answers 401/403 before any handler runs. This only
// spares an admin-less visitor a screen full of failed calls, and tells the two
// cases apart the way the middleware does: 401 means log in, 403 means not you.
export function AdminGate({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Denied kind="loading" />;
  if (!user) return <Denied kind="anon" />;
  if (user.role !== "admin") return <Denied kind="forbidden" />;
  return children;
}

function Denied({ kind }) {
  const copy = kind === "loading"
    ? { pill: "CHECKING CREDENTIALS", head: "One moment.", body: "Reading your session." }
    : kind === "anon"
      ? { pill: "401 · NOT SIGNED IN", head: <>You need to <span style={{ color: "var(--color-mag)" }}>log in.</span></>, body: "The template pipeline is an admin surface. Sign in with an admin account to reach it." }
      : { pill: "403 · ADMIN ONLY", head: <>This set is <span style={{ color: "var(--color-rec)" }}>closed.</span></>, body: "Your account is signed in but is not on the admin allowlist. Ask a studio admin to add your address." };
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "clamp(30px,6vw,80px) clamp(16px,4vw,60px) 120px" }}>
      <span className="scene-pill" style={{ "--tagc": kind === "forbidden" ? "#d8271b" : "#7d766a" }}>{copy.pill}</span>
      <h1 className="headline" style={{ fontSize: "clamp(30px,4.6vw,56px)" }}>{copy.head}</h1>
      <p style={{ marginTop: 16, color: "var(--color-dim)", fontSize: 15, lineHeight: 1.65, maxWidth: 460 }}>{copy.body}</p>
    </div>
  );
}

// The lifecycle status, in the store's own vocabulary. `live` statuses blink so
// a queue that is actually working never reads as a stalled one.
export function StatusBadge({ status, big = false }) {
  const m = statusMeta(status);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
      padding: big ? "5px 12px" : "3px 9px", borderRadius: 999,
      border: `1px solid ${m.c}55`, background: `${m.c}18`,
      fontFamily: "var(--font-mono)", fontSize: big ? 10 : 8.5, letterSpacing: "0.16em",
      textTransform: "uppercase", color: m.c, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.c, animation: m.live ? "kf2-blink 1s steps(1) infinite" : "none" }} />
      {m.label}
    </span>
  );
}

// The app's orientation vocabulary, borrowed from the Templates page so a
// template's shape reads the same everywhere. A square template (legal in the
// store, absent from the pack split) falls back to a neutral chip rather than
// rendering nothing.
export function OrientationChip({ orientation }) {
  const o = ORIENTATIONS.find((x) => x.key === orientation);
  const c = o ? o.tagc : "#7d766a";
  const vertical = orientation === "vertical";
  const square = orientation === "square";
  return (
    <span title={`${o ? o.label : "Square"} ${o ? o.ratio : "1:1"}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: c, textTransform: "uppercase", whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{
        display: "block", width: square ? 12 : vertical ? 8 : 14, height: square ? 12 : vertical ? 14 : 8,
        borderRadius: 2, border: `1.5px solid ${c}`, flex: "none",
      }} />
      {o ? o.ratio : "1:1"}
    </span>
  );
}

// Aspect box for a template's thumbnail. Falls back to the pack-card treatment
// (drifting gradient + scanlines) when nothing has been rendered yet, so a
// mid-pipeline template still looks like a template and not like a broken image.
export function ThumbBox({ src, orientation, alt = "", overlay = null, onError }) {
  const ratio = orientation === "vertical" ? "9 / 16" : orientation === "square" ? "1 / 1" : "16 / 9";
  return (
    <div style={{ position: "relative", aspectRatio: ratio, overflow: "hidden", background: "#17130e", display: "grid", placeItems: "center" }}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" onError={onError}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div className="film-drift" style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #e832a8, #6b1050 55%, #2a0a20)", opacity: 0.85 }} />
      )}
      <div className="film-scan" style={{ opacity: src ? 0.24 : 0.5 }} />
      {overlay}
    </div>
  );
}

// ---- report primitives ----
// Same anatomy as the ones inside Premiere.jsx's production report. They are
// module-private there and Premiere is not this task's file to edit, so they are
// mirrored rather than exported out of it — identical tokens, identical look, so
// the QA panel on a template reads exactly like the QA panel on a film. Every
// one of them is sized for the dark .editor-card, which is where they are used.
export function Stat({ label, value, sub, c }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", color: c || "#7d766a" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: "var(--color-dark-ink)", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-dark-mono)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function Pill({ label, value, sub, c }) {
  return (
    <div style={{ padding: "9px 14px", borderRadius: 12, border: `1px solid ${c}44`, background: `${c}14` }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.18em", color: c }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, color: "var(--color-dark-ink)", marginTop: 3 }}>
        {value}{sub && <span style={{ fontFamily: "var(--font-mono)", fontWeight: 400, fontSize: 9, color: "var(--color-dark-mono)", marginLeft: 5 }}>{sub}</span>}
      </div>
    </div>
  );
}

export function QDRow({ ok, label, detail }) {
  return (
    <li style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-dark-dim)", lineHeight: 1.55 }}>
      <span style={{ flexShrink: 0, color: ok ? "var(--color-lm)" : "#ff6a3c" }}>{ok ? "✓" : "⚠"}</span>
      <span style={{ flexShrink: 0, color: "var(--color-dark-ink)" }}>{label}</span>
      <span style={{ flex: 1, borderBottom: "1px solid rgba(242,237,226,.12)", transform: "translateY(-3px)" }} />
      <span>{detail}</span>
    </li>
  );
}

// The dark editor-card head, with the traffic lights the studio screens use.
export function PanelHead({ title, status, statusColor = "var(--color-lm)" }) {
  return (
    <div className="editor-head">
      <span className="tl-dot" style={{ background: "#ff5f57" }} />
      <span className="tl-dot" style={{ background: "#febc2e" }} />
      <span className="tl-dot" style={{ background: "#28c840" }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "#7d766a", marginLeft: 10 }}>{title}</span>
      {status && <span className="editor-status" style={{ marginLeft: "auto", color: statusColor }}>{status}</span>}
    </div>
  );
}

// A refusal or a failure, on paper. `lines` prints server-supplied reasons
// verbatim — publish's 422 `blocking` list is the reason this exists, and an
// admin who is told "cannot publish" without being told why is stuck.
export function Notice({ tone = "warn", title, lines = [], children }) {
  const c = tone === "error" ? "#d8271b" : tone === "ok" ? "#1e7c34" : "#c07a12";
  return (
    <div role={tone === "warn" ? "status" : "alert"}
      style={{ marginTop: 16, padding: "14px 16px", borderRadius: 12, border: `1px solid ${c}55`, background: `${c}12` }}>
      {title && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: c }}>{title}</div>
      )}
      {lines.length > 0 && (
        <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {lines.map((l, i) => (
            <li key={i} style={{ display: "flex", gap: 8, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--color-ink)", lineHeight: 1.6 }}>
              <span style={{ flexShrink: 0, color: c }}>›</span><span>{lineOf(l)}</span>
            </li>
          ))}
        </ul>
      )}
      {children && <div style={{ marginTop: lines.length ? 10 : 8, fontSize: 13, color: "var(--color-dim)", lineHeight: 1.6 }}>{children}</div>}
    </div>
  );
}

// Label + control, the shape every field on the generator and the edit panel
// takes. Kept here because eleven inline copies is where they drift apart.
export function Field({ label, hint, required = false, children }) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span className="label-mono" style={{ display: "block", marginBottom: 6 }}>
        {label}{required && <span style={{ color: "var(--color-mag)" }}> *</span>}
      </span>
      {children}
      {hint && (
        <span style={{ display: "block", marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", color: "var(--color-dim)", lineHeight: 1.6 }}>{hint}</span>
      )}
    </label>
  );
}
