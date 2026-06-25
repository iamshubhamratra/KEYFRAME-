import { useEffect, useMemo, useState } from "react";
import { motion, Reorder } from "framer-motion";
import { getProject, approveProject, regenerateProject, pollProject } from "../api.js";

const WORDS_PER_SEC = 2.6;
const wc = (s) => (String(s || "").match(/\S+/g) || []).length;

// Solstice department colors cycled by scene purpose.
const PURPOSE_CHIP = {
  hook: "var(--color-sun)",
  context: "var(--color-sky)",
  feature: "var(--color-violet)",
  proof: "var(--color-mint)",
  how: "var(--color-sky)",
  quote: "var(--color-pink)",
  cta: "var(--color-accent)",
};

// The product's signature moment: the script as an editable vertical timeline
// of scene cards. VO inline-editable, scenes reorderable/deletable, per-scene
// pace meter, then Approve & Produce.
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
    return <div className="max-w-3xl mx-auto px-6 pt-20 text-dim">{error || "Loading script…"}</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 pt-12 pb-40">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-dim">Script room</div>
          <h2 className="font-display text-3xl font-bold mt-1">{project?.script?.title}</h2>
        </div>
        <button onClick={regenerate} disabled={busy}
          className="text-xs uppercase tracking-widest text-dim hover:text-accent transition-colors">
          ↻ rewrite whole script
        </button>
      </div>
      <p className="mt-2 text-sm text-dim">
        Every word below will be spoken and shown exactly as written. Edit freely — drag to reorder, pull the
        duration handle, delete what you don't want.
      </p>

      <Reorder.Group axis="y" values={scenes} onReorder={setScenes} className="mt-8 space-y-4">
        {timedScenes.map((scene) => (
          <SceneCard key={scene.id} scene={scene}
            onPatch={(patch) => patchScene(scene.id, patch)}
            onRemove={() => removeScene(scene.id)}
            originalScene={scenes.find((s) => s.id === scene.id)}
          />
        ))}
      </Reorder.Group>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {/* Sticky footer: total duration + CTA */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-line bg-panel backdrop-blur-md px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-6">
          <div className="flex-1">
            <div className="flex justify-between text-[10px] uppercase tracking-widest text-dim mb-1">
              <span>Total</span>
              <span className={Math.abs(totalSec - targetSec) > 1 ? "text-amber-600" : ""}>
                {totalSec.toFixed(1)}s / {targetSec}s
              </span>
            </div>
            <div className="h-1.5 rounded bg-line overflow-hidden">
              <motion.div className="h-full bg-accent rounded"
                animate={{ width: `${Math.min(100, (totalSec / targetSec) * 100)}%` }}
                transition={{ type: "spring", stiffness: 160, damping: 24 }} />
            </div>
          </div>
          <motion.button whileTap={{ scale: 0.97 }} onClick={approve} disabled={busy}
            className="btn-solstice uppercase text-sm">
            {busy ? "Sending…" : "Approve & produce"}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

function SceneCard({ scene, originalScene, onPatch, onRemove }) {
  const words = wc(scene.voiceover);
  const capacity = Math.floor(scene.duration * WORDS_PER_SEC);
  const over = words > capacity * 1.35;

  return (
    <Reorder.Item value={originalScene} className="list-none">
      <motion.div
        layout
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="glass-card p-5 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="chip uppercase" style={{ "--chip": PURPOSE_CHIP[scene.purpose] || "var(--color-sky)" }}>{scene.purpose}</span>
            <span className="text-[10px] text-dim font-mono">{scene.start.toFixed(1)}s</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] ${over ? "text-red-500" : "text-dim"}`}>
              {words} words · fits ~{capacity}
            </span>
            <button onClick={onRemove} className="text-dim hover:text-red-500 text-sm transition-colors" title="delete scene">✕</button>
          </div>
        </div>

        <textarea
          value={scene.voiceover}
          onChange={(e) => onPatch({ voiceover: e.target.value })}
          placeholder="(no narration this scene)"
          className={`mt-3 w-full bg-transparent outline-none resize-none text-lg leading-snug ${over ? "text-red-500" : ""}`}
          rows={Math.max(1, Math.ceil(scene.voiceover.length / 70))}
        />

        <div className="mt-2 text-xs text-dim italic">{scene.visualDirection}</div>

        {scene.assetNeeds?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {scene.assetNeeds.map((a, i) => (
              <span key={i} className="chip" style={{ "--chip": "var(--color-sky)" }}>
                {a.type}: {a.query}
                <button
                  onClick={() => onPatch({ assetNeeds: scene.assetNeeds.filter((_, j) => j !== i) })}
                  className="ml-1.5 hover:text-red-500 transition-colors"
                >✕</button>
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest text-dim w-16">{scene.duration.toFixed(1)}s</span>
          <input type="range" min="2.5" max="8" step="0.5" value={scene.duration}
            onChange={(e) => onPatch({ duration: Number(e.target.value) })}
            className="flex-1" style={{ accentColor: "var(--color-green)" }} />
        </div>
      </motion.div>
    </Reorder.Item>
  );
}
