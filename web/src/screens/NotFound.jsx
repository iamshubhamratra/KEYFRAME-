import { Link } from "../router/Link.jsx";

// Shown for any path the router does not know.
export default function NotFound() {
  return (
    <section style={{ padding: "clamp(40px,8vw,110px) clamp(16px,4vw,60px)", maxWidth: 1200, margin: "0 auto" }}>
      <span className="scene-pill" style={{ "--tagc": "#e832a8" }}>404 · CUT FROM THE FILM</span>
      <h1 className="headline" style={{ fontSize: "clamp(38px,6vw,84px)", maxWidth: "14ch" }}>
        This scene <span style={{ color: "var(--color-mag)" }}>doesn't exist.</span>
      </h1>
      <p style={{ color: "var(--color-dim)", maxWidth: 520, margin: "20px 0 28px", lineHeight: 1.6, fontSize: 16 }}>
        The link may be old, or the page was moved. Everything else is still rolling.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link to="landing" className="btn-ink">Back to home</Link>
        <Link to="templates" className="btn-chip">Browse templates</Link>
      </div>
    </section>
  );
}
