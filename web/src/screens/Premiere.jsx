import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getProject } from "../api.js";

// The reveal: player with a curtain animation on first load, downloads,
// remix, and the cost/timing/attribution breakdown.
export default function Premiere({ projectId, onRemix, onNew }) {
  const [project, setProject] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    getProject(projectId).then(setProject).catch(() => {});
  }, [projectId]);

  if (!project) return <div className="max-w-4xl mx-auto px-6 pt-20 text-dim">Loading…</div>;

  const cost = project.usage?.totalCostUsd;
  const secs = project.durationMs ? Math.round(project.durationMs / 1000) : null;

  return (
    <div className="max-w-4xl mx-auto px-6 pt-12 pb-24">
      <div className="flex items-end justify-between">
        <h2 className="font-display text-3xl font-bold">{project.script?.title || "Your film"}</h2>
        <div className="text-[10px] uppercase tracking-widest text-dim">
          {project.framePack} · {project.duration}s · {project.width}×{project.height}
        </div>
      </div>

      <div className="relative mt-6 rounded-2xl overflow-hidden border border-line bg-black shadow-[0_24px_60px_rgba(8,10,24,0.45)]">
        {project.videoUrl ? (
          <>
            <video src={project.videoUrl} controls className="w-full aspect-video" />
            {/* Curtain reveal on mount — midnight curtain for the premiere */}
            <motion.div initial={{ scaleY: 1 }} animate={{ scaleY: 0 }}
              transition={{ duration: 1.1, ease: [0.83, 0, 0.17, 1], delay: 0.35 }}
              style={{ originY: 0, background: "var(--color-night)" }}
              className="absolute inset-0 pointer-events-none" />
          </>
        ) : (
          <div className="aspect-video flex items-center justify-center text-dim text-sm">
            {project.status === "failed" ? `Failed: ${project.error}` : "No video yet."}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {project.videoUrl && (
          <a href={project.videoUrl} download className="btn-solstice uppercase text-xs">
            Download MP4
          </a>
        )}
        {project.srtUrl && (
          <a href={project.srtUrl} download
            className="px-6 py-3 rounded-xl border border-line text-xs uppercase tracking-widest hover:border-accent transition-colors">
            Captions .srt
          </a>
        )}
        {project.script && (
          <button onClick={onRemix}
            className="px-6 py-3 rounded-xl border border-line text-xs uppercase tracking-widest hover:border-accent transition-colors">
            ✂ Remix script
          </button>
        )}
        <button onClick={onNew}
          className="px-6 py-3 rounded-xl border border-line text-xs uppercase tracking-widest text-dim hover:text-ink transition-colors">
          + New video
        </button>
      </div>

      <button onClick={() => setDetailsOpen((v) => !v)}
        className="mt-8 text-[10px] uppercase tracking-widest text-dim hover:text-ink">
        {detailsOpen ? "▾ hide" : "▸ show"} production details
      </button>

      {detailsOpen && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 glass-card p-5 text-sm space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="LLM cost" value={cost != null ? `$${Number(cost).toFixed(3)}` : "—"} />
            <Stat label="Production time" value={secs ? `${secs}s` : "—"} />
            <Stat label="Composition" value={project.finalAttempt || "—"} />
            <Stat label="Tokens" value={project.usage?.llm ? `${project.usage.llm.inputTokens}/${project.usage.llm.outputTokens}` : "—"} />
          </div>
          {project.assets?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-dim mb-2">Asset attribution</div>
              <ul className="space-y-1">
                {project.assets.map((a, i) => (
                  <li key={i} className="text-xs text-dim">
                    {a.type} · {a.license} · {a.sourceUrl
                      ? <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="underline hover:text-accent">{a.source}</a>
                      : a.source}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-dim">{label}</div>
      <div className="font-display font-bold mt-0.5">{value}</div>
    </div>
  );
}
