import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { pollProject } from "../api.js";

// v2's demo editor, made real: the render farm monitor. Timeline tracks fill
// as the actual pipeline advances; the preview pane rolls until export.
const STAGES = [
  { key: "brief", label: "BRIEF", c: "#e832a8" },
  { key: "script", label: "SCRIPT", c: "#23c8e0" },
  { key: "approved", label: "APPROVED", c: "#ffb03a" },
  { key: "storyboard", label: "STORYBOARD", c: "#b9f24a" },
  { key: "assets", label: "ASSETS", c: "#2b5bff" },
  { key: "art_direction", label: "BRAND", c: "#ff9f43" },
  { key: "creative_review", label: "CURATION", c: "#c56bff" },
  { key: "layout_direction", label: "LAYOUT", c: "#4ea1ff" },
  { key: "composing", label: "COMPOSE", c: "#ff6a3c" },
  { key: "audio_director", label: "AUDIO DIRECTOR", c: "#23c8e0" },
  { key: "audio", label: "VOICE & MUSIC", c: "#8a63ff" },
  { key: "finalizing", label: "FINALIZE", c: "#e832a8" },
];

const FRAME_GRADS = [
  "linear-gradient(135deg, #e832a8, #6b1050 55%, #2a0a20)",
  "linear-gradient(135deg, #23c8e0, #10505c 55%, #081f24)",
  "linear-gradient(135deg, #ffb03a, #8a4d0e 55%, #2e1a05)",
];

function stageIndex(progress) {
  const i = STAGES.findIndex((s) => s.key === progress);
  return i === -1 ? 0 : i;
}

export default function ProductionTheater({ projectId, onDone, onFailed }) {
  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!projectId) return;
    const ac = new AbortController();
    pollProject(projectId, { onTick: setProject, signal: ac.signal })
      .then((p) => {
        if (p.status === "done") setTimeout(onDone, 1200);
        else if (p.status === "failed") setError(p.error || "production failed");
      })
      .catch((e) => setError(e.message));
    return () => ac.abort();
  }, [projectId]);

  const active = stageIndex(project?.progress);
  const done = project?.status === "done";
  const failed = project?.status === "failed" || error;
  const assets = project?.assets || [];
  const stage = STAGES[Math.min(active, STAGES.length - 1)];
  const prog = done ? 1 : (active + 0.5) / STAGES.length;

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(16px,3vw,40px) clamp(16px,4vw,60px) 100px" }}>
      <span className="scene-pill" style={{ "--tagc": "#ffb03a" }}>SC 04 · THE PIPELINE</span>
      <h2 className="headline" style={{ fontSize: "clamp(30px,4.6vw,56px)" }}>
        {failed ? <>The take got <span style={{ color: "var(--color-rec)" }}>cut.</span></>
          : done ? <>That's a <span style={{ color: "var(--color-am)" }}>wrap.</span></>
            : <>Every stage. <span style={{ color: "var(--color-am)" }}>One take.</span></>}
      </h2>
      <p style={{ marginTop: 12, fontSize: 15, color: "var(--color-dim)", lineHeight: 1.6, maxWidth: 480 }}>
        {project?.estimatedRemainingSec > 0 && project?.status === "running"
          ? `Voiced, scored and cut while you watch — about ${Math.ceil(project.estimatedRemainingSec / 60)} min to go.`
          : failed ? String(error) : "Voiced, scored and cut while you watch. The premiere is next."}
      </p>

      {/* the render monitor */}
      <div className="editor-card" style={{ marginTop: 34 }}>
        <div className="editor-head">
          <span className="tl-dot" style={{ background: "#ff5f57" }} />
          <span className="tl-dot" style={{ background: "#febc2e" }} />
          <span className="tl-dot" style={{ background: "#28c840" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "#7d766a", marginLeft: 10 }}>KEYFRAME — RENDER FARM</span>
          <span className="editor-status" style={{ marginLeft: "auto", color: failed ? "var(--color-rec)" : "var(--color-lm)" }}>
            {failed ? "● CUT" : done ? "● EXPORTED" : "● ASSEMBLING"}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr" }} data-demo-grid="1">
          {/* left — stage checklist + timeline */}
          <div style={{ padding: 24, borderRight: "1px solid rgba(242,237,226,.08)", minWidth: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: "8px 16px" }}>
              {STAGES.map((s, i) => {
                const lit = i < active || done;
                const cur = i === active && project?.status === "running";
                return (
                  <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: lit ? s.c : cur ? "#f2ede2" : "#7d766a" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: lit ? s.c : cur ? "#f2ede2" : "rgba(242,237,226,.2)", animation: cur ? "kf2-blink 1s steps(1) infinite" : "none" }} />
                    {s.label}{lit ? " ✓" : ""}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 20, display: "grid", gap: 8 }}>
              <Row label="V1">
                <span className="clip-block" style={{ flex: 1.3, background: "linear-gradient(135deg, var(--color-mag), #8a1d64)", transform: `scaleX(${active > 2 || done ? 1 : 0})` }} />
                <span className="clip-block" style={{ flex: 1, background: "linear-gradient(135deg, var(--color-cy), #127080)", transform: `scaleX(${active > 3 || done ? 1 : 0})`, transitionDelay: ".08s" }} />
                <span className="clip-block" style={{ flex: 1.6, background: "linear-gradient(135deg, var(--color-am), #a56a12)", transform: `scaleX(${active > 4 || done ? 1 : 0})`, transitionDelay: ".16s" }} />
              </Row>
              <Row label="VO" h={20}>
                <span className="clip-block" style={{ display: "block", height: "100%", width: "82%", background: "repeating-linear-gradient(90deg, var(--color-lm) 0 2px, rgba(185,242,74,.25) 2px 5px)", transform: `scaleX(${active > 5 || done ? 1 : 0})` }} />
              </Row>
              <Row label="MUS" h={20}>
                <span className="clip-block" style={{ display: "block", height: "100%", width: "94%", background: "linear-gradient(90deg, var(--color-cb), rgba(43,91,255,.3))", transform: `scaleX(${active > 6 || done ? 1 : 0})` }} />
              </Row>
            </div>

            <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 999, background: "rgba(242,237,226,.08)", overflow: "hidden" }}>
                <motion.span style={{ display: "block", height: "100%", borderRadius: 999, background: "linear-gradient(90deg, var(--color-mag), var(--color-am))" }}
                  animate={{ width: `${Math.round(prog * 100)}%` }} transition={{ type: "spring", stiffness: 60, damping: 20 }} />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-lm)", opacity: done ? 1 : 0, transition: "opacity .4s" }}>
                EXPORTED ✓ MP4 + SRT
              </span>
            </div>
          </div>

          {/* right — rolling preview */}
          <div style={{ position: "relative", minHeight: 280, background: "var(--color-dark-2)" }}>
            <div className="film-drift" style={{ position: "absolute", inset: 0, background: FRAME_GRADS[active % 3], opacity: failed ? 0.35 : 0.95, transition: "opacity .5s" }} />
            <div className="film-scan" />
            <div style={{ position: "absolute", top: 12, left: 14, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.2em", color: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff4d3c", animation: failed ? "none" : "kf2-blink 1s steps(1) infinite" }} />
              {failed ? "SIGNAL LOST" : done ? "WRAPPED" : "PREVIEW"}
            </div>
            <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, textAlign: "center" }}>
              <span style={{ display: "inline-block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "#fff", background: "rgba(0,0,0,.55)", padding: "6px 12px", borderRadius: 8, backdropFilter: "blur(4px)" }}>
                {failed ? "The crew is investigating." : done ? "Cut. Print." : `${stage.label.charAt(0)}${stage.label.slice(1).toLowerCase()}…`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Art Director — the brand palette match, live */}
      <BrandDirectorPanel review={project?.brandReview} active={project?.progress === "art_direction"} />

      {/* Creative Director — the asset review, live */}
      <CreativeDirectorPanel review={project?.creativeReview} active={project?.progress === "creative_review"} />

      {/* Visual Layout Director — asset sizing / reduction / composition, live */}
      <LayoutDirectorPanel review={project?.layoutReview} active={project?.progress === "layout_direction"} />

      {/* Audio Director — the soundtrack mix, live */}
      <AudioDirectorPanel review={project?.audioReview} active={project?.progress === "audio_director"} />

      {/* Asset Coverage — how much of the film is the user's OWN material */}
      <AssetCoveragePanel coverage={project?.assetCoverage} />

      {/* Screenshot Intelligence — which captured screenshots were kept / dropped / demoted */}
      <ScreenshotReviewPanel review={project?.screenshotReview} />

      {/* assets land as chips */}
      {assets.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "var(--color-dim)", textTransform: "uppercase", marginBottom: 14 }}>
            ASSETS GATHERED — {assets.length}
            {assets.some((a) => a.source === "upload") && ` (${assets.filter((a) => a.source === "upload").length} YOURS)`}
            {assets.some((a) => a.fromCache) && ` (${assets.filter((a) => a.fromCache).length} FROM YOUR LIBRARY)`}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {assets.map((a, i) => (
              <motion.span key={i} initial={{ scale: 0, rotate: -6 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20, delay: Math.min(i * 0.06, 1.4) }}
                className="chip" style={
                  // The user's own uploads read as THEIRS at a glance (cyan);
                  // cache hits keep their magenta tint.
                  a.source === "upload" ? { borderColor: "rgba(74,201,242,.55)", color: "var(--color-cy)" }
                    : a.fromCache ? { borderColor: "rgba(232,50,168,.45)", color: "var(--color-mag)" } : undefined
                }>
                {a.source === "upload" ? `${String(a.role || "") === "logo" ? "logo" : a.type} · yours` : `${a.type} · ${a.source}`}
              </motion.span>
            ))}
          </div>
        </div>
      )}

      {failed && (
        <button onClick={onFailed} className="link-mono" style={{ marginTop: 40 }}>← START OVER</button>
      )}
    </div>
  );
}

function Row({ label, h = 26, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 44, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "#7d766a" }}>{label}</span>
      <div className="clip-track" style={{ flex: 1, height: h }}>{children}</div>
    </div>
  );
}

// The Creative Director's verdict, shown live as it reviews the collected assets
// before composition. Appears while the "ART DIRECTION" stage runs and persists.
function CreativeDirectorPanel({ review, active }) {
  const has = review && (review.approvedAssets || review.rejectedAssets);
  if (!has && !active) return null;
  const approved = (review && review.approvedAssets) || [];
  const rejected = (review && review.rejectedAssets) || [];
  const q = review && typeof review.qualityScore === "number" ? review.qualityScore : null;
  const notes = (review && review.creativeDirectorNotes) || [];
  const category = review && review.category;

  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "#c56bff", textTransform: "uppercase" }}>
          ● CREATIVE DIRECTOR
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-dim)" }}>
          {has ? "REVIEWED THE COLLECTED ASSETS" : "REVIEWING THE COLLECTED ASSETS…"}
        </span>
        {active && !has && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#c56bff", animation: "kf2-blink 1s steps(1) infinite" }} />
        )}
      </div>

      {has && (
        <div className="editor-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 26, alignItems: "center" }}>
            {q != null && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 700, lineHeight: 1, color: "#c56bff" }}>{q}<span style={{ fontSize: 13, color: "var(--color-dim)" }}>/100</span></span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--color-dim)", textTransform: "uppercase", marginTop: 4 }}>QUALITY</span>
              </div>
            )}
            <Tally n={approved.length} label="approved" c="#39c98d" />
            <Tally n={rejected.length} label="rejected" c="#f0705f" />
            {category && (
              <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
                CATEGORY · <span style={{ color: "#f2ede2" }}>{String(category).toUpperCase()}</span>
              </div>
            )}
          </div>

          {rejected.length > 0 && (
            <div style={{ marginTop: 16, borderTop: "1px solid rgba(242,237,226,.08)", paddingTop: 14 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: "#f0705f", textTransform: "uppercase", marginBottom: 8 }}>REJECTED</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {rejected.slice(0, 6).map((r, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: "var(--color-dim)", lineHeight: 1.4 }}>
                    <span style={{ color: "#f0705f", marginRight: 6 }}>✕</span>
                    {r.reason || "off-brief"}{r.source ? <span style={{ opacity: 0.6 }}> · {r.source}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {notes.length > 0 && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
              {notes.slice(0, 3).map((n, i) => (
                <div key={i} style={{ fontSize: 12.5, color: "var(--color-dim)", lineHeight: 1.5, fontStyle: "italic" }}>“{n}”</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Tally({ n, label, c }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700, lineHeight: 1, color: c }}>{n}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--color-dim)", textTransform: "uppercase", marginTop: 4 }}>{label}</span>
    </div>
  );
}

// Screenshot Intelligence — the disclosure panel for website screenshots: what
// Puppeteer captured, what the deterministic intake dropped (blank / near-duplicate),
// what an auth wall suppressed, and what the Creative Director's vision verdict
// demoted (popup residue / loading / broken). Only appears when a website was
// ingested (screenshotReview populated), so prompt-only / upload-only jobs never
// see it. Same disclosure voice as the Brand and Asset-Coverage panels.
function ScreenshotReviewPanel({ review }) {
  if (!review) return null;
  const captured = review.captured || 0;
  const kept = review.kept || 0;
  const dropped = review.dropped || [];
  const suppressed = review.suppressed || [];
  const demoted = review.demoted || [];
  // Nothing worth showing (a clean single-shot capture with no events) → stay quiet.
  if (!captured && !suppressed.length) return null;
  const blanks = dropped.filter((d) => d.reason === "blank").length;
  const dups = dropped.filter((d) => d.reason === "duplicate").length;
  const AC = "#4ac9f2";
  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: AC, textTransform: "uppercase" }}>
          ● SCREENSHOT INTELLIGENCE
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-dim)" }}>
          ONLY CLEAN PRODUCT SCREENS REACH THE FILM
        </span>
      </div>
      <div className="editor-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 26, alignItems: "center" }}>
          <Tally n={captured} label="captured" c="#f2ede2" />
          <Tally n={kept} label="kept clean" c="#39c98d" />
          {(blanks + dups) > 0 && <Tally n={blanks + dups} label="dropped" c="#f0a35f" />}
          {demoted.length > 0 && <Tally n={demoted.length} label="demoted" c="#f0705f" />}
          {suppressed.includes("auth-wall") && (
            <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "#f0a35f" }}>
              ⚠ AUTH WALL — SCREENS SUPPRESSED
            </div>
          )}
        </div>

        {dropped.length > 0 && (
          <div style={{ marginTop: 16, borderTop: "1px solid rgba(242,237,226,.08)", paddingTop: 14 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: "#f0a35f", textTransform: "uppercase", marginBottom: 8 }}>
              DROPPED AT CAPTURE — {dropped.length}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {dropped.slice(0, 6).map((d, i) => (
                <div key={i} style={{ fontSize: 12.5, color: "var(--color-dim)", lineHeight: 1.4 }}>
                  <span style={{ color: "#f0a35f", marginRight: 6 }}>✕</span>
                  {d.reason === "blank" ? "blank / low-detail capture" : "near-duplicate of a stronger shot"}
                  <span style={{ opacity: 0.6 }}> · {d.path}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {demoted.length > 0 && (
          <div style={{ marginTop: 14, borderTop: "1px solid rgba(242,237,226,.08)", paddingTop: 14 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: "#f0705f", textTransform: "uppercase", marginBottom: 8 }}>
              DEMOTED — POPUP / LOADING / BROKEN — {demoted.length}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {demoted.slice(0, 6).map((d, i) => (
                <div key={i} style={{ fontSize: 12.5, color: "var(--color-dim)", lineHeight: 1.4 }}>
                  <span style={{ color: "#f0705f", marginRight: 6 }}>▽</span>
                  {d.reason === "popup"
                    ? `overlay covering ~${d.coveragePct != null ? `${d.coveragePct}%` : "part"} of the frame${d.obstruction ? ` (${d.obstruction})` : ""}`
                    : `${d.reason} screen`}
                  <span style={{ opacity: 0.6 }}> · {d.path}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(review.notes || []).length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
            {(review.notes || []).slice(0, 2).map((n, i) => (
              <div key={i} style={{ fontSize: 12.5, color: "var(--color-dim)", lineHeight: 1.5 }}>{n}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Asset Coverage — the honesty panel for user uploads. Shows how much of the
// finished film is the user's OWN material and, crucially, what did NOT fit (the
// adjusted[]/dropped[] disclosure voice from the Brand panel). Only appears when
// the user actually uploaded assets, so a stock-only job never sees it.
function AssetCoveragePanel({ coverage }) {
  if (!coverage || !coverage.uploadedAssets) return null;
  const pct = coverage.usagePercentage;
  const AC = pct >= 70 ? "#39c98d" : pct >= 40 ? "#f0a35f" : "#f0705f";
  const notes = coverage.notes || [];
  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "#4ac9f2", textTransform: "uppercase" }}>
          ● ASSET COVERAGE
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-dim)" }}>
          THE FILM, BUILT FROM YOUR OWN MATERIAL
        </span>
      </div>
      <div className="editor-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 26, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 700, lineHeight: 1, color: AC }}>{pct}<span style={{ fontSize: 13, color: "var(--color-dim)" }}>%</span></span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--color-dim)", textTransform: "uppercase", marginTop: 4 }}>YOURS ON SCREEN</span>
          </div>
          <Tally n={`${coverage.assetsUsed}/${coverage.uploadedAssets}`} label="uploads shown" c="#4ac9f2" />
          <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: coverage.logoUsed ? "#39c98d" : "var(--color-dim)" }}>
            LOGO · <span style={{ color: coverage.logoUsed ? "#39c98d" : "#f0705f" }}>
              {coverage.logoUsed ? (coverage.logoPlacements || []).join(" + ").toUpperCase() || "SHOWN" : "NOT PLACED"}
            </span>
          </div>
        </div>

        {coverage.repairLap && coverage.repairLap.ran && (
          <div style={{ marginTop: 14, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
            RE-WOVE TO FIT MORE · <span style={{ color: "#f2ede2" }}>{coverage.repairLap.before}% → {coverage.repairLap.after}%</span>
          </div>
        )}

        {notes.length > 0 && (
          <div style={{ marginTop: 16, borderTop: "1px solid rgba(242,237,226,.08)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            {notes.slice(0, 3).map((n, i) => (
              <div key={i} style={{ fontSize: 12.5, color: "var(--color-dim)", lineHeight: 1.5 }}>{n}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Where the palette came from — a different question from `source` (which model or
// rule chose the accents). A palette the user picked, one lifted off their site and
// one a model invented are three different claims, and the panel is the only place
// that ever tells them apart. An INFERRED palette is the brief model's own guess, so
// it says so in plain words: passing a guess off as someone's brand is the one thing
// this panel must never do.
const PROVENANCE = {
  explicit: { label: "YOURS — YOU PICKED IT" },
  logo: { label: "LIFTED FROM YOUR LOGO" },
  extracted: { label: "LIFTED FROM YOUR SITE" },
  inferred: { label: "WE GUESSED — PICK YOUR OWN", warn: true },
};

// The Art Director's verdict — the accent-only brand skin distilled from the site's
// real colors. Shown live while the "BRAND" stage runs. Sibling to the other review
// panels; the panel tints itself in the brand's own primary accent.
function BrandDirectorPanel({ review, active }) {
  const has = review && Array.isArray(review.accents) && review.accents.length > 0;
  if (!has && !active) return null;
  const accents = (review && review.accents) || [];
  const emphasis = (review && review.emphasis) || [];
  const AC = accents[0] || "#ff9f43";
  const source = review && review.source;
  const reason = review && review.reason;
  const prov = (review && PROVENANCE[review.provenance]) || null;
  // What the pack's ground did to the palette on the way in. A shifted or refused
  // brand color is exactly what its owner must be told — a correction they can't
  // see reads as us getting their color wrong.
  const adjusted = (review && review.adjusted) || [];
  const dropped = (review && review.dropped) || [];

  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: AC, textTransform: "uppercase" }}>
          ● ART DIRECTOR
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-dim)" }}>
          {!has ? "READING THE BRAND PALETTE…" : prov && prov.warn ? "GUESSED A BRAND PALETTE" : "MATCHED THE BRAND PALETTE"}
        </span>
        {active && !has && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: AC, animation: "kf2-blink 1s steps(1) infinite" }} />
        )}
      </div>

      {has && (
        <div className="editor-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 30, alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: "var(--color-dim)", textTransform: "uppercase" }}>ACCENTS</span>
              <div style={{ display: "flex", gap: 10 }}>
                {accents.map((c, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 36, height: 36, borderRadius: 10, background: c, boxShadow: "0 3px 10px rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.18)" }} />
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--color-dim)" }}>{c}</span>
                  </div>
                ))}
              </div>
            </div>
            {emphasis.length >= 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: "var(--color-dim)", textTransform: "uppercase" }}>EMPHASIS</span>
                <span style={{ width: 104, height: 36, borderRadius: 10, background: `linear-gradient(120deg, ${emphasis[0]}, ${emphasis[1] || emphasis[0]})`, border: "1px solid rgba(255,255,255,.18)" }} />
              </div>
            )}
            <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--color-dim)", textAlign: "right", lineHeight: 1.6 }}>
              SOURCE · <span style={{ color: "#f2ede2" }}>{String(source || "default").toUpperCase()}</span>
              {prov && <><br />PALETTE · <span style={{ color: prov.warn ? "#f0a35f" : "#f2ede2" }}>{prov.label}</span></>}
            </div>
          </div>

          {adjusted.length > 0 && (
            <div style={{ marginTop: 16, borderTop: "1px solid rgba(242,237,226,.08)", paddingTop: 14 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: "#f0a35f", textTransform: "uppercase", marginBottom: 10 }}>
                SHIFTED TO STAY LEGIBLE — {adjusted.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {adjusted.slice(0, 6).map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 12.5, color: "var(--color-dim)", lineHeight: 1.4 }}>
                    <Stop c={a.from} /><span style={{ color: "#f0a35f" }}>→</span><Stop c={a.to} />
                    <span>{a.reason || "lifted to clear this pack's ground"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dropped.length > 0 && (
            <div style={{ marginTop: 14, borderTop: "1px solid rgba(242,237,226,.08)", paddingTop: 14 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: "#f0705f", textTransform: "uppercase", marginBottom: 10 }}>
                LEFT OUT — {dropped.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dropped.slice(0, 4).map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 12.5, color: "var(--color-dim)", lineHeight: 1.4 }}>
                    <span style={{ color: "#f0705f" }}>✕</span><Stop c={d.hex} />
                    <span>{d.reason || "could not read on this pack's ground"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {reason && (
            <div style={{ marginTop: 16, fontSize: 12.5, color: "var(--color-dim)", lineHeight: 1.5, fontStyle: "italic" }}>“{reason}”</div>
          )}
        </div>
      )}
    </div>
  );
}

// The panel's swatch language at correction scale. A shifted color is SHOWN next to
// its hex, never only named: "we darkened it" is a claim, and the whole point of the
// disclosure is that the user can check it against the color they handed us.
function Stop({ c }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 18, height: 18, borderRadius: 6, background: c, border: "1px solid rgba(255,255,255,.18)" }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#f2ede2" }}>{String(c).toUpperCase()}</span>
    </span>
  );
}

// The Visual Layout Director's verdict — how it presented the assets: how many were
// kept prominent (quality over quantity), how many demoted to B-roll, the hero size,
// and the montage budget. Shown live while the "LAYOUT" stage runs.
function LayoutDirectorPanel({ review, active }) {
  const has = review && (typeof review.keptScreenshots === "number" || typeof review.demoted === "number");
  if (!has && !active) return null;
  const AC = "#4ea1ff";
  const score = review && review.score;
  const q = score && typeof score.compositionQuality === "number" ? score.compositionQuality : null;
  const heroPct = review && review.heroScale ? Math.round(review.heroScale * 100) : null;

  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: AC, textTransform: "uppercase" }}>
          ● VISUAL LAYOUT DIRECTOR
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-dim)" }}>
          {has ? "COMPOSED THE FRAME" : "COMPOSING THE FRAME…"}
        </span>
        {active && !has && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: AC, animation: "kf2-blink 1s steps(1) infinite" }} />
        )}
      </div>

      {has && (
        <div className="editor-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 26, alignItems: "center" }}>
            {q != null && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 700, lineHeight: 1, color: AC }}>{q}<span style={{ fontSize: 13, color: "var(--color-dim)" }}>/100</span></span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--color-dim)", textTransform: "uppercase", marginTop: 4 }}>COMPOSITION</span>
              </div>
            )}
            <Tally n={review.keptScreenshots || 0} label="screens kept" c="#39c98d" />
            <Tally n={review.keptPhotos || 0} label="photos kept" c="#39c98d" />
            <Tally n={review.demoted || 0} label="to b-roll" c="#f0a35f" />
            <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--color-dim)", textAlign: "right", lineHeight: 1.6 }}>
              {heroPct != null && <>HERO · <span style={{ color: "#f2ede2" }}>{heroPct}% of frame</span><br /></>}
              MONTAGE · <span style={{ color: "#f2ede2" }}>≤{review.montageMax ?? 4} tiles</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// The Audio Director's mix verdict — shown live as it masters the soundtrack
// (loudness targets, per-scene music curve, ducking, SFX curation) before the
// final cut. Sibling to CreativeDirectorPanel; cyan to read as "audio / signal".
function AudioDirectorPanel({ review, active }) {
  const has = review && Array.isArray(review.scenes) && review.scenes.length > 0;
  if (!has && !active) return null;
  const AC = "#23c8e0";
  const scenes = (review && review.scenes) || [];
  const sfx = (review && review.sfx) || [];
  const score = review && review.score;
  const master = (review && review.master) || {};
  const kept = sfx.filter((x) => x.accept);
  const rejected = sfx.filter((x) => !x.accept);

  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: AC, textTransform: "uppercase" }}>
          ● AUDIO DIRECTOR
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-dim)" }}>
          {has ? "MIXED THE SOUNDTRACK" : "MIXING THE SOUNDTRACK…"}
        </span>
        {active && !has && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: AC, animation: "kf2-blink 1s steps(1) infinite" }} />
        )}
      </div>

      {has && (
        <div className="editor-card" style={{ padding: 20 }}>
          {/* scores + master targets */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 26, alignItems: "center" }}>
            {score && typeof score.overall === "number" && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 700, lineHeight: 1, color: AC }}>{score.overall}<span style={{ fontSize: 13, color: "var(--color-dim)" }}>/100</span></span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--color-dim)", textTransform: "uppercase", marginTop: 4 }}>MIX SCORE</span>
              </div>
            )}
            {score && typeof score.voiceoverClarity === "number" && <Tally n={score.voiceoverClarity} label="voice" c={AC} />}
            {score && typeof score.musicBalance === "number" && <Tally n={score.musicBalance} label="music" c={AC} />}
            {score && typeof score.sfxQuality === "number" && <Tally n={score.sfxQuality} label="sfx" c={AC} />}
            <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--color-dim)", textAlign: "right", lineHeight: 1.6 }}>
              VOICE · <span style={{ color: "#f2ede2" }}>{master.voLufs ?? -16} LUFS</span><br />
              MUSIC DUCKS · <span style={{ color: "#f2ede2" }}>{master.musicUnderVoDuckDb ?? -11} dB</span>
            </div>
          </div>

          {/* the anchor: per-scene music level — a mini mixing desk */}
          <div style={{ marginTop: 18, borderTop: "1px solid rgba(242,237,226,.08)", paddingTop: 14 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: "var(--color-dim)", textTransform: "uppercase", marginBottom: 12 }}>
              MUSIC LEVEL / SCENE — DIPS UNDER THE VOICE
            </div>
            <MusicCurve scenes={scenes} accent={AC} />
          </div>

          {/* SFX curation — kept vs rejected */}
          {(kept.length > 0 || rejected.length > 0) && (
            <div style={{ marginTop: 16, borderTop: "1px solid rgba(242,237,226,.08)", paddingTop: 14 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: "var(--color-dim)", textTransform: "uppercase", marginBottom: 10 }}>
                SOUND EFFECTS — {kept.length} KEPT · {rejected.length} CUT
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {kept.map((s, i) => (
                  <span key={"k" + i} className="chip" style={{ borderColor: "rgba(57,201,141,.4)", color: "#39c98d" }}>✓ {s.cue}</span>
                ))}
                {rejected.map((s, i) => (
                  <span key={"r" + i} className="chip" title={s.reason || ""} style={{ borderColor: "rgba(240,112,95,.35)", color: "#f0705f", opacity: 0.85 }}>✕ <span style={{ textDecoration: "line-through" }}>{s.cue}</span></span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Per-scene music-level meter. Bars above the 0 dB line = louder (e.g. the CTA
// swells); bars below = pulled down so the voice leads. A "VO" tick marks scenes
// where the voice is ducking the music. This is the panel's memorable anchor —
// it shows the dynamic mix at a glance instead of a flat volume number.
function MusicCurve({ scenes, accent }) {
  const G_MIN = -12, G_MAX = 4, H = 54;
  const zeroTop = (G_MAX / (G_MAX - G_MIN)) * H; // px from top to the 0 dB line
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
      {scenes.map((s, i) => {
        const g = Math.max(G_MIN, Math.min(G_MAX, Number(s.musicGainDb) || 0));
        const up = g >= 0;
        const barH = Math.max(2, (Math.abs(g) / (G_MAX - G_MIN)) * H);
        return (
          <div key={i} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ position: "relative", width: "100%", height: H, background: "rgba(242,237,226,.05)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: zeroTop, height: 1, background: "rgba(242,237,226,.2)" }} />
              <div style={{
                position: "absolute", left: "20%", right: "20%",
                top: up ? zeroTop - barH : zeroTop, height: barH,
                background: up ? accent : `linear-gradient(180deg, ${accent}, rgba(35,200,224,.3))`,
                opacity: s.voPresent ? 0.95 : 0.5, borderRadius: 2,
              }} />
              {s.voPresent && (
                <div style={{ position: "absolute", bottom: 2, left: 0, right: 0, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.1em", color: "rgba(242,237,226,.5)" }}>VO</div>
              )}
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.04em", color: "var(--color-dim)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(s.kind || "").slice(0, 4)}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: up ? accent : "var(--color-dim)" }}>{g > 0 ? "+" : ""}{g}</span>
          </div>
        );
      })}
    </div>
  );
}
