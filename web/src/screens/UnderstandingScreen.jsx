import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { pollProject } from "../api.js";
import { loreFor } from "../packlore.js";

// v2 "SC 02 · THE BRIEF": it plays back what it understood — audience, facts,
// tone. Nothing invented, everything sourced. Signals tick into the card live
// as ingest → brief → script run.
const STAGE_COPY = {
  null: "WARMING UP",
  ingest: "READING YOUR SOURCES",
  brief: "PLAYING IT BACK",
  script: "WRITING YOUR SCRIPT",
  script_review: "SCRIPT READY",
};

export default function UnderstandingScreen({ projectId, onScriptReady, onFailed }) {
  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!projectId) return;
    const ac = new AbortController();
    pollProject(projectId, {
      onTick: setProject,
      predicate: (p) => p.status === "script_review",
      signal: ac.signal,
    })
      .then((p) => {
        if (p.status === "script_review") setTimeout(onScriptReady, 900);
        else if (p.status === "failed") setError(p.error || "intake failed");
      })
      .catch((e) => setError(e.message));
    return () => ac.abort();
  }, [projectId]);

  const brief = project?.brief;
  const stage = project?.progress;
  const source = hostOf(project?.websiteUrl) || (project?.referenceVideo ? "your reference film" : "your brief");
  const packLore = brief?.suggestedFramePack ? loreFor(brief.suggestedFramePack) : null;

  const facts = [
    brief?.improvedPrompt,
    brief?.audience && `Audience: ${brief.audience}`,
    brief?.tone && `Tone: ${brief.tone}`,
    ...(brief?.mustIncludeFacts || []),
  ].filter(Boolean);

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(20px,4vw,50px) clamp(16px,4vw,60px) 100px" }}>
      {/* live status line */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: "clamp(26px,4vw,44px)", flexWrap: "wrap" }}>
        <span className="rec-blip" style={error ? { color: "var(--color-rec)" } : { color: "var(--color-mag)" }}>
          {error ? "CUT" : (STAGE_COPY[stage] || "UNDERSTANDING")}
        </span>
        {!error && stage !== "script_review" && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", color: "var(--color-dim)", textTransform: "uppercase" }}>
            THE PIPELINE PAUSES FOR YOU AT THE SCRIPT
          </span>
        )}
      </div>

      {error && (
        <div className="card" style={{ padding: "24px 26px 24px 31px", marginBottom: 36 }}>
          <span className="spine" style={{ "--spine": "var(--color-rec)" }} />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "var(--color-rec)", marginBottom: 8 }}>TAKE FAILED</div>
          <p style={{ color: "var(--color-ink)", fontSize: 15, margin: 0 }}>{error}</p>
          <button onClick={onFailed} className="link-mono" style={{ marginTop: 18 }}>← START OVER</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))", gap: "clamp(28px,5vw,60px)", alignItems: "center" }}>
        {/* left — the v2 copy */}
        <div>
          <span className="scene-pill" style={{ "--tagc": "#23c8e0" }}>SC 02 · THE BRIEF</span>
          <h2 className="headline" style={{ fontSize: "clamp(30px,4.4vw,56px)" }}>
            It plays back what it <span style={{ color: "var(--color-cy)" }}>understood.</span>
          </h2>
          <p style={{ color: "var(--color-dim)", margin: "18px 0 0", lineHeight: 1.65, fontSize: 16 }}>
            KEYFRAME opens a real browser, reads your page and lifts the facts —
            nothing invented, everything sourced. You approve the understanding
            before a single frame is drawn.
          </p>
        </div>

        {/* right — the understanding card, filling in live */}
        <div className="card" style={{ padding: "24px 26px 26px 31px" }}>
          <span className="spine" style={{ "--spine": "var(--color-cy)" }} />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "var(--color-dim)", textTransform: "uppercase" }}>
            UNDERSTANDING · {source}
          </div>

          <div style={{ margin: "16px 0", display: "flex", flexDirection: "column", gap: 10, minHeight: 90 }}>
            <AnimatePresence>
              {facts.length === 0 && !error && (
                <motion.div key="scanning" exit={{ opacity: 0 }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ height: 14, borderRadius: 6, background: "var(--color-ground-2)", width: `${82 - i * 14}%`, animation: `softPulse 1.6s ease-in-out ${i * 0.25}s infinite` }} />
                  ))}
                </motion.div>
              )}
              {facts.map((f, i) => (
                <motion.div key={f} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "var(--color-ink)", lineHeight: 1.45 }}>
                  <span style={{ color: "var(--color-mag)" }}>✓</span> <span>{f}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "var(--color-dim)", textTransform: "uppercase", marginTop: 16 }}>
            LIFTED PALETTE
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {(brief?.brandColors || []).slice(0, 4).map((c, i) => (
              <motion.span key={c} initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 18, delay: i * 0.08 }}
                title={c} style={{ width: 36, height: 36, borderRadius: 9, background: c, border: "1px solid rgba(23,19,14,.12)" }} />
            ))}
            {(!brief?.brandColors || brief.brandColors.length === 0) && (
              [0, 1, 2, 3].map((i) => (
                <span key={i} style={{ width: 36, height: 36, borderRadius: 9, background: "var(--color-ground-2)", animation: `softPulse 1.6s ease-in-out ${i * 0.2}s infinite` }} />
              ))
            )}
            <span style={{ flex: 1, minWidth: 130, display: "grid", placeItems: "center", borderRadius: 9, border: "1px dashed rgba(23,19,14,.25)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)", padding: "6px 8px", textTransform: "uppercase" }}>
              {packLore ? `+ PACK: ${packLore.name}` : "+ PACK: CASTING…"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function hostOf(url) {
  try { return url ? new URL(url).host.replace(/^www\./, "") : null; } catch { return null; }
}
