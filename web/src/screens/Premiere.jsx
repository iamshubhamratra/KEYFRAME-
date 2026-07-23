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

  // Honor the film's real shape. 9:16 vertical and 1:1 square are shipped
  // orientations, but the player used to force every film into a 16:9 box —
  // squishing portrait and cropping square. Derive the aspect from the rendered
  // dimensions and cap the on-screen width for tall/square films so they don't
  // tower down the page.
  const vw = project.width, vh = project.height;
  const vidAspect = vw && vh ? `${vw} / ${vh}` : "16 / 9";
  const isPortrait = vw && vh && vh > vw;
  const isSquare = vw && vh && vh === vw;
  const screenMax = isPortrait ? 420 : isSquare ? 560 : undefined;

  // Recent pipeline outputs the result page never used to show: the QA verdict
  // (best-lap score + blocker/minor notes) and the Creative Director's asset
  // review (quality score, how many assets were kept vs cut, template fit).
  const qa = project.qa;
  const cr = project.creativeReview;
  // Quality Director — the aggregated, cross-dimension quality summary (contrast
  // auto-fixes, audio loudness, screenshot QA, plus the asset/template/QA scores).
  // Guarded everywhere with `qr &&` so films made before this shipped still render.
  const qr = project.qualityReport;

  // What the pipeline understood before it shot anything — surfaced only
  // transiently on the Understanding screen. Recap it on the finished film so
  // the audience/tone/facts/palette live alongside the QA + cost report.
  const brief = project.brief;
  const briefFacts = brief ? [
    brief.audience && `Audience — ${brief.audience}`,
    brief.tone && `Tone — ${brief.tone}`,
    ...(brief.mustIncludeFacts || []),
  ].filter(Boolean) : [];
  const briefColors = (brief?.brandColors || []).slice(0, 6);
  const qaState = !qa ? null : (qa.skipped || qa.error) ? "skipped" : qa.pass ? "pass" : "flag";
  const approved = cr?.approvedAssets?.length || 0;
  const cut = cr?.rejectedAssets?.length || 0;
  const templateFit = cr?.templateCompatibility?.averageScore;

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
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-dark-dim)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span>{lore.name || project.framePack} · {fmtDur(project.duration)} · {project.width}×{project.height}{project.fps ? ` · ${project.fps}fps` : ""}</span>
            {qaState && qaState !== "skipped" && (
              <span style={{ padding: "3px 8px", borderRadius: 999, background: qaState === "pass" ? "rgba(185,242,74,.16)" : "rgba(255,106,60,.16)", color: qaState === "pass" ? "var(--color-lm)" : "#ff6a3c", border: `1px solid ${qaState === "pass" ? "rgba(185,242,74,.4)" : "rgba(255,106,60,.4)"}` }}>
                {qaState === "pass" ? "✓ QA PASSED" : "⚠ QA FLAGGED"}{qa.score != null ? ` ${qa.score}/10` : ""}
              </span>
            )}
          </div>
        </div>

        {/* the screen */}
        <div style={{ position: "relative", marginTop: 26, borderRadius: 20, overflow: "hidden", border: "1px solid rgba(242,237,226,.14)", background: "var(--color-dark-2)", boxShadow: "0 40px 90px rgba(0,0,0,.5)", maxWidth: screenMax, marginLeft: screenMax ? "auto" : undefined, marginRight: screenMax ? "auto" : undefined }}>
          {project.videoUrl ? (
            <>
              <video src={mediaUrl(project.videoUrl)} controls style={{ aspectRatio: vidAspect, display: "block", width: "100%" }} />
              {/* curtain reveal on mount */}
              <motion.div initial={{ scaleY: 1 }} animate={{ scaleY: 0 }}
                transition={{ duration: 1.1, ease: [0.83, 0, 0.17, 1], delay: 0.35 }}
                style={{ originY: 0, background: "#0d0b07", position: "absolute", inset: 0, pointerEvents: "none" }} />
            </>
          ) : (
            <div style={{ aspectRatio: vidAspect, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-dark-dim)" }}>
              {project.status === "failed" ? `FAILED: ${project.error}` : "NO VIDEO YET."}
            </div>
          )}
        </div>

        {/* report card — the QA + creative-direction outcome, always visible */}
        {(qaState || cr) && (
          <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {qaState === "pass" && <Pill label="QA VERDICT" value="PASSED" sub={qa.score != null ? `${qa.score}/10` : null} c="#b9f24a" />}
            {qaState === "flag" && <Pill label="QA VERDICT" value="FLAGGED" sub={qa.score != null ? `${qa.score}/10` : null} c="#ff6a3c" />}
            {qaState === "skipped" && <Pill label="QA VERDICT" value="NOT RUN" c="#7d766a" />}
            {cr?.qualityScore != null && <Pill label="ASSET QUALITY" value={String(cr.qualityScore)} sub="/100" c="#23c8e0" />}
            {(approved > 0 || cut > 0) && <Pill label="ASSETS" value={`${approved} used`} sub={cut > 0 ? `${cut} cut` : null} c="#2b5bff" />}
            {templateFit != null && <Pill label="TEMPLATE FIT" value={String(templateFit)} sub="/100" c="#ffb03a" />}
            {qr?.contrast?.checked && (qr.contrast.fixed > 0 || qr.contrast.remaining > 0) && (
              <Pill label="CONTRAST" value={`${qr.contrast.fixed} fixed`} sub={qr.contrast.remaining > 0 ? `${qr.contrast.remaining} left` : "AA clean"} c={qr.contrast.remaining > 0 ? "#ff6a3c" : "#b9f24a"} />
            )}
            {qr?.audio?.lufs != null && <Pill label="AUDIO" value={`${qr.audio.lufs} LUFS`} sub={qr.audio.peak != null ? `peak ${qr.audio.peak}` : null} c="#8a63ff" />}
            {qr?.screenshots && (qr.screenshots.kept > 0 || qr.screenshots.dropped > 0) && (
              <Pill label="SCREENSHOTS" value={`${qr.screenshots.kept} kept`} sub={qr.screenshots.dropped > 0 ? `${qr.screenshots.dropped} dropped` : null} c={qr.screenshots.dropped > 0 ? "#ffb03a" : "#23c8e0"} />
            )}
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
              Captions .srt
            </a>
          )}
          {project.script && (
            <button onClick={onRemix} className="btn-outline-dark btn-sm">✂ Remix script</button>
          )}
          <button onClick={onNew} className="link-mono on-dark" style={{ marginLeft: 4 }}>+ NEW FILM</button>
        </div>

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

              {(briefFacts.length > 0 || briefColors.length > 0) && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", color: "#7d766a", marginBottom: 10 }}>THE BRIEF — WHAT WE UNDERSTOOD</div>
                  {briefFacts.length > 0 && (
                    <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: "0 0 12px", padding: 0, listStyle: "none" }}>
                      {briefFacts.map((f, i) => (
                        <li key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-dark-dim)", lineHeight: 1.55 }}>
                          <span style={{ flexShrink: 0, color: "var(--color-cy)" }}>✓</span><span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {briefColors.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "#7d766a" }}>LIFTED PALETTE</span>
                      {briefColors.map((c) => (
                        <span key={c} title={c} style={{ width: 22, height: 22, borderRadius: 6, background: c, border: "1px solid rgba(242,237,226,.16)" }} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {qr && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", color: "#7d766a", marginBottom: 10 }}>
                    QUALITY DIRECTOR — {qr.verdict === "pass" ? "ALL CHECKS CLEAR" : "SHIPPED WITH NOTES"}
                  </div>
                  <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
                    {qr.contrast?.checked && (
                      <QDRow ok={qr.contrast.remaining === 0} label="Text contrast (WCAG AA)"
                        detail={qr.contrast.fixed > 0
                          ? `${qr.contrast.fixed} element(s) auto-fixed${qr.contrast.remaining > 0 ? `, ${qr.contrast.remaining} still below` : ", all clear"}`
                          : (qr.contrast.remaining > 0 ? `${qr.contrast.remaining} element(s) below AA` : "clean, nothing to fix")} />
                    )}
                    {qr.identity && qr.identity.remapped > 0 && (
                      <QDRow ok={true} label="Template identity"
                        detail={`${qr.identity.remapped} off-palette color(s) snapped to the pack`} />
                    )}
                    {qr.layout && (qr.layout.duplicatesRemoved > 0 || qr.layout.collisionsScrimmed > 0) && (
                      <QDRow ok={true} label="Layout"
                        detail={[
                          qr.layout.duplicatesRemoved > 0 ? `${qr.layout.duplicatesRemoved} duplicate(s) hidden` : null,
                          qr.layout.collisionsScrimmed > 0 ? `${qr.layout.collisionsScrimmed} collision(s) scrimmed` : null,
                        ].filter(Boolean).join(" · ")} />
                    )}
                    {qr.audio?.lufs != null && (
                      <QDRow ok={Math.abs(qr.audio.lufs - (qr.audio.target ?? -14)) <= 3} label="Audio loudness"
                        detail={`${qr.audio.lufs} LUFS${qr.audio.peak != null ? ` · peak ${qr.audio.peak} dB` : ""} (target ${qr.audio.target ?? -14})`} />
                    )}
                    {qr.screenshots && (qr.screenshots.kept > 0 || qr.screenshots.dropped > 0 || qr.screenshots.repinned > 0) && (
                      <QDRow ok={qr.screenshots.dropped === 0} label="Screenshot QA"
                        detail={[
                          `${qr.screenshots.kept} kept`,
                          qr.screenshots.repinned > 0 ? `${qr.screenshots.repinned} re-pinned to matching scene` : null,
                          qr.screenshots.dropped > 0 ? `${qr.screenshots.dropped} dropped (${(qr.screenshots.problems || []).slice(0, 3).join(", ") || "failed QA"})` : null,
                        ].filter(Boolean).join(" · ")} />
                    )}
                    {qr.assetFloor && qr.assetFloor.generated > 0 && (
                      <QDRow ok={true} label="Generated imagery"
                        detail={`${qr.assetFloor.generated} on-brief image(s)${qr.assetFloor.scoreBefore != null && qr.assetFloor.scoreAfter != null ? ` · quality ${qr.assetFloor.scoreBefore}→${qr.assetFloor.scoreAfter}` : ""}`} />
                    )}
                    {qr.assetQuality != null && (
                      <QDRow ok={qr.assetQuality >= 55} label="Asset quality" detail={`${qr.assetQuality}/100`} />
                    )}
                    {qr.templateFit != null && (
                      <QDRow ok={qr.templateFit >= 55} label="Template fit" detail={`${qr.templateFit}/100`} />
                    )}
                    <QDRow ok={qr.qa?.pass !== false} label="Final QA review"
                      detail={qr.qa?.skipped ? "not run" : `${qr.qa?.pass === false ? `${qr.qa.blockers} blocker(s)` : "passed"}${qr.qa?.score != null ? ` · ${qr.qa.score}/10` : ""}`} />
                  </ul>
                  {qr.flags?.length > 0 && (
                    <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "#ff6a3c", lineHeight: 1.6 }}>
                      {qr.flags.map((f, i) => <div key={i}>⚠ {f}</div>)}
                    </div>
                  )}
                </div>
              )}

              {qa && (qaState !== "skipped" || qa.issues?.length > 0) && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", color: "#7d766a", marginBottom: 10 }}>
                    QA VERDICT — {qaState === "pass" ? "PASSED" : qaState === "flag" ? "NEEDS WORK" : "NOT RUN"}{qa.score != null ? ` · ${qa.score}/10` : ""}
                  </div>
                  {qa.issues?.length > 0 ? (
                    <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
                      {qa.issues.map((it, i) => (
                        <li key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-dark-dim)", lineHeight: 1.55 }}>
                          <span style={{ flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.08em", color: String(it.severity).toLowerCase() === "blocker" ? "#ff6a3c" : "var(--color-am)" }}>{it.severity}</span>
                          {it.atSec != null && <span style={{ flexShrink: 0, color: "#7d766a" }}>@{it.atSec}s</span>}
                          <span>{it.issue}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-dark-dim)" }}>Clean take — no issues flagged.</div>
                  )}
                </div>
              )}

              {cr && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", color: "#7d766a", marginBottom: 10 }}>
                    CREATIVE DIRECTION{cr.category ? ` · ${cr.category}` : ""}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-dark-dim)", marginBottom: cr.creativeDirectorNotes?.length ? 10 : 0 }}>
                    {[
                      cr.qualityScore != null ? `quality ${cr.qualityScore}/100` : null,
                      `${approved} asset${approved === 1 ? "" : "s"} kept`,
                      cut > 0 ? `${cut} cut` : null,
                      templateFit != null ? `template fit ${templateFit}/100` : null,
                    ].filter(Boolean).join("  ·  ")}
                  </div>
                  {cr.creativeDirectorNotes?.length > 0 && (
                    <ul style={{ display: "flex", flexDirection: "column", gap: 5, margin: 0, padding: 0, listStyle: "none" }}>
                      {cr.creativeDirectorNotes.map((n, i) => (
                        <li key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-dark-dim)", lineHeight: 1.55 }}>› {n}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

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

// Compact outcome chip for the always-visible report card under the video.
function Pill({ label, value, sub, c }) {
  return (
    <div style={{ padding: "9px 14px", borderRadius: 12, border: `1px solid ${c}44`, background: `${c}14` }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.18em", color: c }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, color: "var(--color-dark-ink)", marginTop: 3 }}>
        {value}{sub && <span style={{ fontFamily: "var(--font-mono)", fontWeight: 400, fontSize: 9, color: "var(--color-dark-mono)", marginLeft: 5 }}>{sub}</span>}
      </div>
    </div>
  );
}

// One line of the Quality Director summary: a green ✓ / amber ⚠ status glyph, the
// dimension name, and its detail.
function QDRow({ ok, label, detail }) {
  return (
    <li style={{ display: "flex", alignItems: "baseline", gap: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-dark-dim)", lineHeight: 1.55 }}>
      <span style={{ flexShrink: 0, color: ok ? "var(--color-lm)" : "#ff6a3c" }}>{ok ? "✓" : "⚠"}</span>
      <span style={{ flexShrink: 0, color: "var(--color-dark-ink)" }}>{label}</span>
      <span style={{ flex: 1, borderBottom: "1px solid rgba(242,237,226,.12)", transform: "translateY(-3px)" }} />
      <span>{detail}</span>
    </li>
  );
}
