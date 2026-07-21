import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getProject, mediaUrl } from "../api.js";
import { loreFor, fmtDur } from "../packlore.js";

// v2 "SC 08 · FINAL LOOKS" — the premiere on a dark stage with the magenta
// glow, downloads, remix and the production-details monitor.
export default function Premiere({ projectId, onRemix, onNew }) {
  const [project, setProject] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    getProject(projectId).then(setProject).catch(() => {});
  }, [projectId]);

  if (!project) {
    return (
      <div style={{ background: "var(--color-dark)", marginTop: -90, paddingTop: 90, minHeight: "100vh" }}>
        <div style={{ maxWidth: 940, margin: "0 auto", padding: "70px 24px", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em", color: "var(--color-dark-dim)" }}>LOADING…</div>
      </div>
    );
  }

  const cost = project.usage?.totalCostUsd;
  const secs = project.durationMs ? Math.round(project.durationMs / 1000) : null;
  const lore = loreFor(project.framePack);

  // Per-video token consumption: LLM (script + planners + composer + QA + repairs)
  // plus the estimated TTS audio tokens. Output tokens dominate the cost.
  const llm = project.usage?.llm;
  const tts = project.usage?.tts;
  const totalTokens = llm
    ? llm.inputTokens + llm.outputTokens + ((tts?.inputTokensEst || 0) + (tts?.outputTokensEst || 0))
    : null;
  const fmt = (n) => Number(n).toLocaleString();

  return (
    <div style={{ background: "var(--color-dark)", marginTop: -90, paddingTop: 90, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 70% 55% at 50% 110%, rgba(232,50,168,.30), transparent 65%)" }} />

      <div style={{ position: "relative", maxWidth: 960, margin: "0 auto", padding: "clamp(20px,4vw,50px) 24px 90px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <span className="scene-pill" style={{ "--tagc": "#e832a8" }}>SC 08 · FINAL LOOKS</span>
            <h2 className="headline on-dark" style={{ fontSize: "clamp(28px,4.6vw,52px)" }}>
              {project.script?.title || "Your film"}
            </h2>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-dark-dim)" }}>
            {lore.name || project.framePack} · {fmtDur(project.duration)} · {project.width}×{project.height}
          </div>
        </div>

        {/* the screen */}
        <div style={{ position: "relative", marginTop: 26, borderRadius: 20, overflow: "hidden", border: "1px solid rgba(242,237,226,.14)", background: "var(--color-dark-2)", boxShadow: "0 40px 90px rgba(0,0,0,.5)" }}>
          {project.videoUrl ? (
            <>
              <video src={mediaUrl(project.videoUrl)} controls style={{ aspectRatio: "16/9", display: "block", width: "100%" }} />
              {/* curtain reveal on mount */}
              <motion.div initial={{ scaleY: 1 }} animate={{ scaleY: 0 }}
                transition={{ duration: 1.1, ease: [0.83, 0, 0.17, 1], delay: 0.35 }}
                style={{ originY: 0, background: "#0d0b07", position: "absolute", inset: 0, pointerEvents: "none" }} />
            </>
          ) : (
            <div style={{ aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-dark-dim)" }}>
              {project.status === "failed" ? `FAILED: ${project.error}` : "NO VIDEO YET."}
            </div>
          )}
        </div>

        {Array.isArray(project.audioNotes) && project.audioNotes.length > 0 && (
          <div style={{ marginTop: 18, padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(255,176,58,.4)", background: "rgba(255,176,58,.08)" }}>
            {project.audioNotes.map((n, i) => (
              <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em", color: "var(--color-am)", lineHeight: 1.6 }}>⚠ {n}</div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 26, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          {project.videoUrl && (
            <a href={mediaUrl(project.videoUrl)} download className="btn-mag" style={{ textDecoration: "none" }}>
              Download MP4 ↓
            </a>
          )}
          {project.srtUrl && (
            <a href={mediaUrl(project.srtUrl)} download className="btn-outline-dark btn-sm" style={{ textDecoration: "none" }}>
              Subtitles .srt
            </a>
          )}
          {project.vttUrl && (
            <a href={mediaUrl(project.vttUrl)} download className="btn-outline-dark btn-sm" style={{ textDecoration: "none" }}>
              Subtitles .vtt
            </a>
          )}
          {project.script && (
            <button onClick={onRemix} className="btn-outline-dark btn-sm">✂ Remix script</button>
          )}
          <button onClick={onNew} className="link-mono on-dark" style={{ marginLeft: 4 }}>+ NEW FILM</button>
        </div>

        {project.captionQuality && (
          <div style={{ marginTop: 20, padding: "14px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.03)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-dark-dim)", marginBottom: 10 }}>
              {project.captionQuality.voiceLanguage
                ? `🔊 ${project.captionQuality.voiceLanguage} · CC ${project.captionQuality.captionLanguage || project.captionLanguage}`
                : `CAPTIONS · ${project.captionQuality.captionLanguage || project.captionLanguage}`}
              {project.captionMode ? ` · ${project.captionMode.toUpperCase()}` : ""}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px" }}>
              {[
                ["Translation", project.captionQuality.translationQuality],
                ["Sync", project.captionQuality.syncAccuracy],
                ["Readability", project.captionQuality.readabilityScore],
                ["Fonts", project.captionQuality.fontCompatibility],
                ["Coverage", project.captionQuality.subtitleCoverage],
              ].filter(([, v]) => v != null).map(([label, v]) => (
                <div key={label} style={{ minWidth: 68 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600, color: v >= 90 ? "#7ee081" : v >= 70 ? "#ffcf5c" : "#ff8a8a" }}>{v}%</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-dark-dim)" }}>{label}</div>
                </div>
              ))}
            </div>
            {project.captionQuality.degraded && Array.isArray(project.captionQuality.notes) && project.captionQuality.notes.map((n, i) => (
              <div key={i} style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em", color: "var(--color-am)", lineHeight: 1.6 }}>⚠ {n}</div>
            ))}
          </div>
        )}

        {project.localization && project.localization.videoTextLanguage && project.localization.videoTextLanguage !== "en" && (
          <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.03)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-dark-dim)", marginBottom: 8 }}>
              🎬 VIDEO TEXT · {project.localization.videoTextLanguageName || project.localization.videoTextLanguage} · {project.localization.localizationCoverage}% LOCALIZED
            </div>
            {Array.isArray(project.localization.notes) && project.localization.notes.map((n, i) => (
              <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em", color: "var(--color-am)", lineHeight: 1.6 }}>⚠ {n}</div>
            ))}
          </div>
        )}

        <button onClick={() => setDetailsOpen((v) => !v)}
          style={{ marginTop: 34, cursor: "pointer", background: "none", border: "none", padding: 0, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--color-dark-dim)" }}>
          {detailsOpen ? "▾ HIDE" : "▸ SHOW"} PRODUCTION DETAILS
        </button>

        {detailsOpen && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="editor-card" style={{ marginTop: 16 }}>
            <div className="editor-head">
              <span className="tl-dot" style={{ background: "#ff5f57" }} />
              <span className="tl-dot" style={{ background: "#febc2e" }} />
              <span className="tl-dot" style={{ background: "#28c840" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "#7d766a", marginLeft: 10 }}>PRODUCTION REPORT</span>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 20 }}>
                <Stat label="TOTAL COST" value={cost != null ? `$${Number(cost).toFixed(3)}` : "—"} c="#e832a8" />
                <Stat label="PRODUCTION TIME" value={secs ? `${secs}s` : "—"} c="#23c8e0" />
                <Stat label="COMPOSITION" value={project.finalAttempt || "—"} c="#ffb03a" />
                <Stat
                  label="TOKENS USED"
                  value={totalTokens != null ? fmt(totalTokens) : "—"} c="#b9f24a"
                  sub={llm ? `${fmt(llm.inputTokens)} in · ${fmt(llm.outputTokens)} out · ${llm.callCount} calls` : null}
                />
              </div>
              {project.usage?.byStage?.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", color: "#7d766a", marginBottom: 10 }}>TOKENS BY STAGE</div>
                  <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
                    {project.usage.byStage.map((s) => (
                      <li key={s.stage} style={{ display: "flex", alignItems: "baseline", gap: 12, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-dark-dim)" }}>
                        <span style={{ color: "var(--color-dark-ink)", textTransform: "capitalize" }}>{s.stage}</span>
                        <span style={{ flex: 1, borderBottom: "1px solid rgba(242,237,226,.12)", transform: "translateY(-3px)" }} />
                        <span>{fmt(s.totalTokens)} tok · {s.callCount} {s.callCount === 1 ? "call" : "calls"} · ${Number(s.costUsd).toFixed(3)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {project.assets?.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", color: "#7d766a", marginBottom: 10 }}>ASSET ATTRIBUTION</div>
                  <ul style={{ display: "flex", flexDirection: "column", gap: 5, margin: 0, padding: 0, listStyle: "none" }}>
                    {project.assets.map((a, i) => (
                      <li key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-dark-dim)" }}>
                        {a.type} · {a.license} · {a.sourceUrl
                          ? <a href={a.sourceUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", color: "inherit" }}>{a.source}</a>
                          : a.source}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}

        <div style={{ marginTop: 60, textAlign: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, color: "var(--color-dark-ink)", letterSpacing: "0.3em" }}>
          FIN<span style={{ color: "var(--color-mag)" }}>.</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, c }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", color: c || "#7d766a" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: "var(--color-dark-ink)", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-dark-mono)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
