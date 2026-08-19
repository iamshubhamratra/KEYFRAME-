import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getProject, mediaUrl } from "../api.js";
import { loreFor, fmtDur } from "../packlore.js";

// v2 "SC 08 · FINAL LOOKS" — the premiere on a dark stage with the magenta
// glow, downloads, remix and the production-details monitor.
// The film is shown in the shape it was ORDERED in. The player used to be hardcoded to 16/9,
// which is the one aspect most of this product does not make: 9:16 is the default and the bulk
// of the library. A vertical film in a 16/9 box is either squashed or shown as a thin strip
// between two black slabs, on the screen whose entire job is presenting the finished work.
const ASPECT = { vertical: "9 / 16", square: "1 / 1", horizontal: "16 / 9" };
// A portrait film at full container width would be ~1670px tall, so cap by viewport height and
// let the box find its own width from the aspect instead.
const MAXH = { vertical: "76vh", square: "70vh", horizontal: "none" };

export default function Premiere({ projectId, onRemix, onNew }) {
  const [project, setProject] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    getProject(projectId)
      .then((p) => { if (alive) { setProject(p); setLoadError(null); } })
      // Was `.catch(() => {})`. A failed fetch left `project` null forever, so the screen that
      // presents the finished film sat on "LOADING…" with no error, no retry and no way out.
      .catch((e) => { if (alive) setLoadError(e.message || "could not load this project"); });
    return () => { alive = false; };
  }, [projectId]);

  if (!project) {
    return (
      <div style={{ background: "var(--color-dark)", minHeight: "100vh" }}>
        <div style={{ maxWidth: 940, margin: "0 auto", padding: "70px 24px" }}>
          {loadError ? (
            <>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-mono)", letterSpacing: "0.14em", textTransform: "uppercase", color: "#ff8f83" }}>
                COULD NOT LOAD THIS FILM
              </p>
              <p className="break-long" style={{ color: "var(--color-dark-dim)", marginTop: 10, lineHeight: 1.6, fontSize: "var(--text-base)" }}>{loadError}</p>
              <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
                <button className="btn-mag" onClick={() => setProject(null) || window.location.reload()}>Try again</button>
                <button className="btn-outline-dark btn-sm" onClick={onNew}>Start a new film</button>
              </div>
            </>
          ) : (
            <p className="state-loading" style={{ color: "var(--color-dark-dim)" }} role="status" aria-live="polite">LOADING…</p>
          )}
        </div>
      </div>
    );
  }

  const lore = loreFor(project.framePack);

  // `project.usage` (cost, per-stage tokens, TTS estimates) is still returned by the API and
  // still worth having — it just no longer has a reader on this screen.

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
              <video src={mediaUrl(project.videoUrl)} controls
                style={{
                  aspectRatio: ASPECT[project.orientation] || "16 / 9",
                  maxHeight: MAXH[project.orientation] || "none",
                  display: "block", width: "100%", margin: "0 auto", objectFit: "contain", background: "#0d0b07",
                }} />
              {/* curtain reveal on mount */}
              <motion.div initial={{ scaleY: 1 }} animate={{ scaleY: 0 }}
                transition={{ duration: 1.1, ease: [0.83, 0, 0.17, 1], delay: 0.35 }}
                style={{ originY: 0, background: "#0d0b07", position: "absolute", inset: 0, pointerEvents: "none" }} />
            </>
          ) : (
            <div className="break-long" style={{
              aspectRatio: ASPECT[project.orientation] || "16 / 9",
              maxHeight: MAXH[project.orientation] || "none",
              display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
              padding: "0 24px", margin: "0 auto",
              fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)",
              color: project.status === "failed" ? "#ff8f83" : "var(--color-dark-dim)",
            }}>
              {project.status === "failed" ? `FAILED: ${project.error}` : "NO VIDEO YET."}
            </div>
          )}
        </div>

        <QualityPanel q={project.deliveryQuality} onRemix={onRemix} />

        {/* TEMPLATE-FIT DISCLOSURES — the pipeline's only channel for "your template does not
            match this film", and until now it had no reader anywhere in the client.
            frame_selector writes here whenever it HONOURS an explicit pick it would otherwise
            have corrected: a landscape pack on a vertical job, a five-minute template on a
            thirty-second film. Those are exactly the cases where the delivered video looks
            wrong for a reason the user cannot possibly infer — a 40-beat template on a 30s job
            plays four scenes and freezes on the fourth. Delivering that silently is the defect;
            the explanation already existed and was simply never shown. */}
        {Array.isArray(project.validationReport?.notes) && project.validationReport.notes.length > 0 && (
          <div style={{ marginTop: 18, padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(255,176,58,.4)", background: "rgba(255,176,58,.08)" }}>
            {project.validationReport.notes.map((n, i) => (
              <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.04em", color: "var(--color-am)", lineHeight: 1.6 }}>⚠ {n}</div>
            ))}
          </div>
        )}

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

        {/* THE PRODUCTION REPORT IS GONE — cost, production time, composition attempt and
            the per-stage token ledger are what it costs US to make the film, not something
            the person watching it asked for. NOTE FOR WHOEVER READS THIS NEXT: the report
            also carried the ASSET ATTRIBUTION list (type · license · source, linked), which
            was the only place in the UI a stock asset's license was ever shown. If any
            provider in the pool requires visible attribution, it has to come back somewhere
            — this comment is the trail, since the panel that used to say it is deleted. */}

        <div style={{ marginTop: 60, textAlign: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, color: "var(--color-dark-ink)", letterSpacing: "0.3em" }}>
          FIN<span style={{ color: "var(--color-mag)" }}>.</span>
        </div>
      </div>
    </div>
  );
}

// DELIVER-AND-FLAG. The film is handed over either way — a watchable video beats a hard
// failure — but when the automated review found something, it is stated here instead of
// being buried in a log. Every issue names WHERE (timestamp or area) and, where the
// pipeline supplied one, what would fix it.
//
// Silent on a clean film: a panel that always appears becomes furniture and stops being read.
function QualityPanel({ q, onRemix }) {
  if (!q || q.verdict === "clean" || !q.issues || !q.issues.length) return null;
  const weak = q.verdict === "weak";
  const accent = weak ? "var(--color-rec)" : "var(--color-am)";
  const tint = weak ? "rgba(216,39,27,.09)" : "rgba(255,176,58,.08)";
  const border = weak ? "rgba(216,39,27,.42)" : "rgba(255,176,58,.40)";
  const AREA = { picture: "PICTURE", composition: "LAYOUT", assets: "ASSETS", audio: "AUDIO", motion: "MOTION", language: "LANGUAGE" };

  return (
    <div style={{ marginTop: 18, borderRadius: 12, border: `1px solid ${border}`, background: tint, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", padding: "12px 16px 8px" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: accent }}>
          {weak ? "⚠ Quality review" : "Quality review"}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--color-dark-dim)" }}>
          {q.score}/100
          {q.signals && q.signals.qaScore != null && ` · frame review ${q.signals.qaScore}/10`}
          {q.counts && q.counts.blockers > 0 && ` · ${q.counts.blockers} blocking`}
        </span>
      </div>

      <div style={{ padding: "0 16px 4px", fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.6, color: "var(--color-dark-ink)" }}>
        {q.headline}
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: "8px 16px 14px", display: "grid", gap: 8 }}>
        {q.issues.map((it, i) => (
          <li key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "start" }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.14em", padding: "3px 6px", borderRadius: 4,
              whiteSpace: "nowrap", marginTop: 2,
              color: it.severity === "blocker" ? "var(--color-ink-2)" : accent,
              background: it.severity === "blocker" ? accent : "transparent",
              border: it.severity === "blocker" ? "none" : `1px solid ${border}`,
            }}>
              {AREA[it.area] || String(it.area || "").toUpperCase()}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.55, color: "var(--color-dark-ink)" }}>
              {it.detail}
              {it.fix && (
                <span style={{ display: "block", color: "var(--color-dark-dim)", marginTop: 3 }}>→ {it.fix}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {weak && onRemix && (
        <div style={{ padding: "0 16px 14px" }}>
          <button onClick={onRemix} className="btn-outline-dark btn-sm">✂ Edit the script and regenerate</button>
        </div>
      )}
    </div>
  );
}

