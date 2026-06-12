import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export default function Gallery({ onOpen }) {
  const [projects, setProjects] = useState(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects((d.projects || []).filter((p) => p.videoUrl)))
      .catch(() => setProjects([]));
  }, []);

  if (!projects) return <div className="max-w-5xl mx-auto px-6 pt-20 text-dim">Loading…</div>;
  if (!projects.length) {
    return (
      <div className="max-w-5xl mx-auto px-6 pt-20 text-dim">
        Nothing here yet — your finished films will appear in this gallery.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 pt-12 pb-24">
      <h2 className="font-display text-3xl font-bold">Gallery</h2>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {projects.map((p, i) => (
          <motion.button
            key={p.jobId}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onOpen(p.jobId)}
            className="text-left rounded-xl overflow-hidden border border-line bg-panel hover:border-accent/50 transition-colors group"
          >
            <div className="aspect-video bg-black relative overflow-hidden">
              {/* Hover-scrub: muted autoplay on hover */}
              <video
                src={p.videoUrl}
                muted
                loop
                playsInline
                preload="metadata"
                className="w-full h-full object-cover"
                onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
              />
            </div>
            <div className="p-4">
              <div className="text-sm font-medium truncate">{p.title || "Untitled"}</div>
              <div className="mt-1 text-[10px] uppercase tracking-widest text-dim">
                {p.framePack || "—"} · {p.duration}s
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
