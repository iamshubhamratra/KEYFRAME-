import { Component } from "react";

// Catches render/runtime errors in any studio screen so a thrown component shows
// a friendly, on-brand retry instead of a blank white page. Styled with the
// editorial design-system classes from index.css.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surfaced for debugging; never sends anything off-box.
    console.error("[KEYFRAME] UI error:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-ground, #e9e6dd)",
          padding: 24,
        }}
      >
        <div className="card" style={{ maxWidth: 440, padding: 36, textAlign: "center" }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Something jammed in the camera</div>
          <h2 className="wordmark" style={{ fontSize: 34, lineHeight: 1, marginBottom: 14 }}>
            <span style={{ color: "var(--color-ink)" }}>KEY</span>
            <span style={{ color: "var(--color-green)" }}>FRAME</span>
          </h2>
          <p style={{ color: "var(--color-dim)", fontSize: 14, lineHeight: 1.55, marginBottom: 22 }}>
            A screen hit an unexpected error. Your films aren't affected — reload to get back to the studio.
          </p>
          <button className="btn-lime" onClick={() => window.location.assign("/")}>
            Reload studio
          </button>
        </div>
      </div>
    );
  }
}
