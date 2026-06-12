import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { pollProject } from "../api.js";

// The film-strip stage tracker: each pipeline stage is a frame that
// illuminates as production advances.
const STAGES = [
  { key: "brief", label: "Brief" },
  { key: "script", label: "Script" },
  { key: "approved", label: "Approved" },
  { key: "storyboard", label: "Storyboard" },
  { key: "assets", label: "Assets" },
  { key: "composing", label: "Compose" },
  { key: "audio", label: "Voice & music" },
  { key: "finalizing", label: "Finalize" },
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
  const failed = project?.status === "failed" || error;
  const assets = project?.assets || [];

  return (
    <div className="max-w-4xl mx-auto px-6 pt-20 pb-24">
      <h2 className="font-display text-2xl font-bold">
        {failed ? "Production hit a wall." : project?.status === "done" ? "Cut. Print." : "In production…"}
      </h2>
      <p className="mt-2 text-sm text-dim">
        {project?.estimatedRemainingSec > 0 && project?.status === "running"
          ? `~${Math.ceil(project.estimatedRemainingSec / 60)} min remaining`
          : failed ? error : "This usually takes 3–6 minutes."}
      </p>

      {/* Film strip */}
      <div className="mt-10 flex gap-1.5">
        {STAGES.map((s, i) => {
          const lit = i < active || project?.status === "done";
          const current = i === active && project?.status === "running";
          return (
            <div key={s.key} className="flex-1">
              <motion.div
                className={`h-16 rounded-xl border backdrop-blur-md ${lit ? "bg-accent/15 border-accent/50" : current ? "border-accent bg-panel" : "border-line bg-panel"}`}
                animate={current ? { opacity: [1, 0.45, 1], scale: [1, 1.03, 1] } : {}}
                transition={current ? { repeat: Infinity, duration: 1.6, ease: "easeInOut" } : {}}
              />
              <div className={`mt-2 text-[9px] uppercase tracking-wider text-center ${lit || current ? "text-accent" : "text-dim"}`}>
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Asset mosaic pops in as assets land */}
      {assets.length > 0 && (
        <div className="mt-12">
          <div className="text-[10px] uppercase tracking-widest text-dim mb-3">
            Assets gathered — {assets.length} ({assets.filter((a) => a.fromCache).length} from your library)
          </div>
          <div className="flex flex-wrap gap-2">
            {assets.map((a, i) => (
              <motion.div key={i} initial={{ scale: 0, rotate: -6 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20, delay: i * 0.08 }}
                className="chip"
                style={{ "--chip": a.fromCache ? "var(--color-mint)" : "var(--color-sky)" }}>
                {a.type} · {a.source}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {failed && (
        <button onClick={onFailed} className="mt-10 text-accent text-xs uppercase tracking-widest">← start over</button>
      )}
    </div>
  );
}
