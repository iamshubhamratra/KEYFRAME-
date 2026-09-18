import { Component } from "react";
import EditNotice from "./EditNotice.jsx";
import { noticeCopy } from "../editFormat.js";

const keysChanged = (a = [], b = []) => a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));

// Catches a render error inside the editor so one broken panel never blanks the page. The edit
// itself is safe server-side (every change is a saved revision), which is what the copy says.
// Props: resetKeys (reset when any changes, e.g. [editId]), onReset (e.g. remount the provider),
// onList (← My edits).
export default class EditorErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[KEYFRAME] edit bay error:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && keysChanged(prevProps.resetKeys, this.props.resetKeys)) this.reset();
  }

  reset() {
    this.setState({ error: null });
    this.props.onReset?.();
  }

  render() {
    if (!this.state.error) return this.props.children;
    const notice = noticeCopy("EDITOR_CRASH");
    return (
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "clamp(24px,5vw,64px) clamp(16px,4vw,40px)" }}>
        <EditNotice
          notice={notice}
          focusOnMount
          onAction={(id) => { if (id === "reload") this.reset(); else this.props.onList?.(); }}
        />
      </div>
    );
  }
}
