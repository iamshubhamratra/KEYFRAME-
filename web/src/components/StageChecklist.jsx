// The analysis call sheet: every stage as a numbered take on a vertical slate line.
// Semantics: an ordered list, the running stage marked aria-current="step", and each row's state
// spelled out for screen readers (the glyphs and colours are decoration, not the message).
// rows come from editFormat.stageRows(view): [{ key, label, sub, state }].

const STATE_WORDS = { done: "done", current: "in progress", pending: "not started", failed: "failed", skipped: "skipped", stopped: "stopped" };
const TAGS = { current: "NOW", failed: "CUT", skipped: "SKIPPED", stopped: "STOPPED" };

export default function StageChecklist({ rows = [], label = "Edit stages", onDark = true, showSubs = "current" }) {
  const ink = onDark ? "var(--color-dark-ink)" : "var(--color-ink)";
  const dim = onDark ? "var(--color-dark-dim)" : "var(--color-dim)";
  const line = onDark ? "rgba(242,237,226,.10)" : "rgba(23,19,14,.12)";
  const failRed = onDark ? "#ff6a3c" : "var(--color-rec)";

  return (
    <ol aria-label={label} style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {rows.map((r, i) => {
        const done = r.state === "done";
        const current = r.state === "current";
        const failed = r.state === "failed";
        const muted = r.state === "pending" || r.state === "skipped" || r.state === "stopped";
        const labelColor = failed ? failRed : current ? ink : done ? ink : dim;
        const showSub = r.sub && (showSubs === "all" || ((current || failed) && showSubs === "current"));
        const last = i === rows.length - 1;
        return (
          <li
            key={r.key}
            aria-current={current ? "step" : undefined}
            style={{ position: "relative", display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", columnGap: 12, alignItems: "start", padding: "9px 0" }}
          >
            {!last && (
              <span aria-hidden="true" style={{ position: "absolute", left: 13, top: 31, bottom: -9, width: 2, borderRadius: 2, background: done ? "var(--color-lm)" : line, opacity: done ? 0.55 : 1 }} />
            )}
            <span
              aria-hidden="true"
              style={{
                position: "relative", zIndex: 1, width: 28, height: 22, borderRadius: 6, display: "grid", placeItems: "center",
                fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.02em", fontVariantNumeric: "tabular-nums",
                background: done ? "rgba(185,242,74,.14)" : current ? "rgba(232,50,168,.16)" : failed ? "rgba(216,39,27,.16)" : "transparent",
                border: `1px solid ${done ? "rgba(185,242,74,.45)" : current ? "var(--color-mag)" : failed ? failRed : line}`,
                color: done ? "var(--color-lm)" : current ? "var(--color-mag)" : failed ? failRed : dim,
              }}
            >
              {done ? "✓" : failed ? "✕" : current ? <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-mag)", animation: "kf2-blink 1s steps(1) infinite" }} /> : String(i + 1).padStart(2, "0")}
            </span>
            <span style={{ minWidth: 0, paddingTop: 3 }}>
              <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: labelColor, opacity: muted ? 0.9 : 1, textDecoration: r.state === "skipped" ? "line-through" : "none" }}>
                {r.label}
              </span>
              {showSub && <span style={{ display: "block", marginTop: 4, fontSize: 13, lineHeight: 1.45, color: dim }}>{r.sub}</span>}
              <span className="sr-only">{`, ${STATE_WORDS[r.state] || r.state}`}</span>
            </span>
            {TAGS[r.state] ? (
              <span aria-hidden="true" style={{ paddingTop: 4, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.2em", color: current ? "var(--color-mag)" : failed ? failRed : dim }}>
                {TAGS[r.state]}
              </span>
            ) : <span aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
