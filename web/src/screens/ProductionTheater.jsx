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
  { key: "composing", label: "COMPOSE", c: "#ff6a3c" },
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
            : <>Six stages. <span style={{ color: "var(--color-am)" }}>One take.</span></>}
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

      {/* assets land as chips */}
      {assets.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "var(--color-dim)", textTransform: "uppercase", marginBottom: 14 }}>
            ASSETS GATHERED — {assets.length} ({assets.filter((a) => a.fromCache).length} FROM YOUR LIBRARY)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {assets.map((a, i) => (
              <motion.span key={i} initial={{ scale: 0, rotate: -6 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20, delay: Math.min(i * 0.06, 1.4) }}
                className="chip" style={a.fromCache ? { borderColor: "rgba(232,50,168,.45)", color: "var(--color-mag)" } : undefined}>
                {a.type} · {a.source}
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
