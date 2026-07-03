import { useEffect, useMemo, useState } from "react";
import { motion, Reorder } from "framer-motion";
import { getProject, approveProject, regenerateProject, pollProject } from "../api.js";

const WORDS_PER_SEC = 2.6;
const wc = (s) => (String(s || "").match(/\S+/g) || []).length;
const SPINES = ["#e832a8", "#23c8e0", "#ffb03a", "#b9f24a", "#2b5bff", "#ff6a3c"];

// v2 "SC 03 · THE ONE PAUSE" — the script as takes on white cards with color
// spines; the approve bar is the editor scrubber. Change a line and that
// exact line is spoken.
export default function ScriptRoom({ projectId, onApproved }) {
  const [project, setProject] = useState(null);
  const [scenes, setScenes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!projectId) return;
    getProject(projectId).then((p) => {
      setProject(p);
      if (p.script?.scenes) setScenes(structuredClone(p.script.scenes));
    }).catch((e) => setError(e.message));
  }, [projectId]);

  // Re-derive starts whenever durations/order change (server re-normalizes too).
  const timedScenes = useMemo(() => {
    if (!scenes) return [];
    let t = 0;
    return scenes.map((s) => {
      const out = { ...s, start: Math.round(t * 10) / 10 };
      t += s.duration;
      return out;
    });
  }, [scenes]);

  const totalSec = useMemo(() => timedScenes.reduce((a, s) => a + s.duration, 0), [timedScenes]);
  const targetSec = project?.duration || totalSec;

  function patchScene(id, patch) {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeScene(id) {
    setScenes((prev) => prev.length > 2 ? prev.filter((s) => s.id !== id) : prev);
  }

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      await approveProject(projectId, { ...project.script, scenes: timedScenes });
      onApproved();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      await regenerateProject(projectId, "script");
      const p = await pollProject(projectId, { predicate: (x) => x.status === "script_review" });
      setProject(p);
      setScenes(structuredClone(p.script.scenes));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!scenes) {
    return <div style={{ maxWidth: 780, margin: "0 auto", padding: "60px 24px", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em", color: "var(--color-dim)" }}>{error || "LOADING SCRIPT…"}</div>;
  }

  const tc = (sec) => {
    const s = Math.floor(sec);
    return `00:00:${String(s).padStart(2, "0")}:${String(Math.round((sec % 1) * 24)).padStart(2, "0")}`;
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "clamp(16px,3vw,40px) 24px 170px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <span className="scene-pill" style={{ "--tagc": "#ffb03a" }}>SC 03 · THE ONE PAUSE</span>
          <h2 className="headline" style={{ fontSize: "clamp(28px,4.4vw,48px)" }}>{project?.script?.title}</h2>
        </div>
        <button onClick={regenerate} disabled={busy} className="link-mono">↻ REWRITE WHOLE SCRIPT</button>
      </div>
      <p style={{ marginTop: 14, fontSize: 15, color: "var(--color-dim)", lineHeight: 1.6, maxWidth: 560 }}>
        Every word below will be spoken and shown exactly as written. Change a line and
        that exact line is spoken — drag to reorder, pull the duration handle, cut what
        you don't want.
      </p>

      <Reorder.Group axis="y" values={scenes} onReorder={setScenes} style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 14, padding: 0 }}>
        {timedScenes.map((scene, i) => (
          <SceneCard key={scene.id} scene={scene} index={i}
            onPatch={(patch) => patchScene(scene.id, patch)}
            onRemove={() => removeScene(scene.id)}
            originalScene={scenes.find((s) => s.id === scene.id)}
          />
        ))}
      </Reorder.Group>

      {error && <p style={{ marginTop: 16, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-rec)" }}>{error}</p>}

      {/* the approve bar — v2's editor scrubber */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, background: "rgba(13,11,7,.92)", backdropFilter: "blur(12px)", borderTop: "1px solid rgba(242,237,226,.14)", display: "flex", alignItems: "center", gap: 14, padding: "9px clamp(12px,2.5vw,28px)", minHeight: 58 }}>
        <span className="timecode" style={{ minWidth: 92 }}><b>{tc(totalSec)}</b></span>
        <div className="clip-track" style={{ flex: 1 }}>
          {timedScenes.map((s, i) => (
            <span key={s.id} className="clip-block" title={s.purpose}
              style={{ flex: Math.max(0.4, s.duration), background: `linear-gradient(180deg, ${SPINES[i % SPINES.length]}cc, ${SPINES[i % SPINES.length]}77)`, transform: "scaleX(1)", display: "grid", placeItems: "center", overflow: "hidden" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color: "rgba(255,255,255,.85)", textTransform: "uppercase", pointerEvents: "none" }}>{s.purpose}</span>
            </span>
          ))}
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: Math.abs(totalSec - targetSec) > 1 ? "var(--color-am)" : "#7d766a", whiteSpace: "nowrap" }}>
          {totalSec.toFixed(1)}S / {targetSec}S
        </span>
        <motion.button whileTap={{ scale: 0.97 }} onClick={approve} disabled={busy} className="btn-mag" style={{ padding: "11px 24px", fontSize: 14 }}>
          {busy ? "Sending…" : "Approve & roll →"}
        </motion.button>
      </div>
    </div>
  );
}

function SceneCard({ scene, originalScene, index, onPatch, onRemove }) {
  const words = wc(scene.voiceover);
  const capacity = Math.floor(scene.duration * WORDS_PER_SEC);
  const over = words > capacity * 1.35;
  const spine = SPINES[index % SPINES.length];

  return (
    <Reorder.Item value={originalScene} className="list-none">
      <motion.div
        layout
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="card"
        style={{ padding: "20px 22px 20px 27px", cursor: "grab" }}
      >
        <span className="spine" style={{ "--spine": spine }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: spine, textTransform: "uppercase" }}>
              TAKE {String(index + 1).padStart(2, "0")} · {scene.purpose}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-dim)" }}>{scene.start.toFixed(1)}s</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: over ? "var(--color-rec)" : "var(--color-dim)", textTransform: "uppercase" }}>
              {words} WORDS · FITS ~{capacity}
            </span>
            <button onClick={onRemove} title="delete scene"
              style={{ color: "var(--color-dim)", fontSize: 14, cursor: "pointer", transition: "color .2s" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-rec)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-dim)")}>✕</button>
          </div>
        </div>

        <textarea
          value={scene.voiceover}
          onChange={(e) => onPatch({ voiceover: e.target.value })}
          placeholder="(no narration this take)"
          style={{ marginTop: 12, width: "100%", background: "transparent", outline: "none", resize: "none", fontSize: 18, lineHeight: 1.4, color: over ? "var(--color-rec)" : "var(--color-ink)", fontFamily: "var(--font-body)", border: "none", caretColor: "var(--color-mag)" }}
          rows={Math.max(1, Math.ceil(scene.voiceover.length / 70))}
        />

        <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--color-dim)", textTransform: "uppercase" }}>
          {scene.visualDirection}
        </div>

        {scene.assetNeeds?.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {scene.assetNeeds.map((a, i) => (
              <span key={i} className="chip">
                {a.type}: {a.query}
                <button
                  onClick={() => onPatch({ assetNeeds: scene.assetNeeds.filter((_, j) => j !== i) })}
                  style={{ marginLeft: 6, cursor: "pointer" }}
                >✕</button>
              </span>
            ))}
          </div>
        )}

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--color-dim)", width: 52 }}>{scene.duration.toFixed(1)}S</span>
          <input type="range" min="2.5" max="8" step="0.5" value={scene.duration}
            onChange={(e) => onPatch({ duration: Number(e.target.value) })}
            style={{ flex: 1, accentColor: spine }} />
        </div>
      </motion.div>
    </Reorder.Item>
  );
}
