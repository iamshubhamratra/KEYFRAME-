import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { pollProject } from "../api.js";

// Makes the AI's comprehension visible: extracted signals appear as cards
// while ingest -> brief -> script run.
const STAGE_COPY = {
  null: "Warming up…",
  ingest: "Reading your sources…",
  brief: "Distilling the creative brief…",
  script: "Writing your script…",
  script_review: "Script ready.",
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

  return (
    <div className="max-w-3xl mx-auto px-6 pt-20 pb-24">
      <div className="flex items-center gap-4">
        <Pulse />
        <h2 className="font-display text-2xl font-bold">{STAGE_COPY[stage] || "Understanding…"}</h2>
      </div>

      {error && (
        <div className="mt-8 rounded-xl border border-red-900 bg-red-950/40 p-5 text-sm text-red-300">
          {error}
          <button onClick={onFailed} className="block mt-3 text-accent text-xs uppercase tracking-widest">← start over</button>
        </div>
      )}

      <div className="mt-10 space-y-4">
        <AnimatePresence>
          {brief?.improvedPrompt && (
            <Card title="What this video is">
              <p className="text-sm leading-relaxed">{brief.improvedPrompt}</p>
            </Card>
          )}
          {brief?.audience && (
            <Card title="Audience & tone">
              <p className="text-sm">{brief.audience}</p>
              <p className="text-xs text-dim mt-1">{brief.tone}</p>
            </Card>
          )}
          {brief?.mustIncludeFacts?.length > 0 && (
            <Card title="Facts pulled from your sources">
              <ul className="space-y-1.5">
                {brief.mustIncludeFacts.map((f, i) => (
                  <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }}
                    className="text-sm flex gap-2">
                    <span className="text-accent">·</span>{f}
                  </motion.li>
                ))}
              </ul>
            </Card>
          )}
          {brief?.brandColors?.length > 0 && (
            <Card title="Brand colors detected">
              <div className="flex gap-2">
                {brief.brandColors.map((c) => (
                  <motion.div key={c} initial={{ scale: 0 }} animate={{ scale: 1 }}
                    className="w-10 h-10 rounded-lg border border-line" style={{ background: c }} title={c} />
                ))}
              </div>
            </Card>
          )}
          {brief?.suggestedFramePack && (
            <Card title="Design system pick">
              <span className="text-accent font-display font-bold uppercase tracking-wider text-sm">{brief.suggestedFramePack}</span>
            </Card>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="rounded-xl border border-line bg-panel p-5"
    >
      <div className="text-[10px] uppercase tracking-widest text-dim mb-2">{title}</div>
      {children}
    </motion.div>
  );
}

function Pulse() {
  return (
    <span className="relative flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-accent" />
    </span>
  );
}
