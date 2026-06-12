import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import SolsticeSky from "./SolsticeSky.jsx";
import CreateScreen from "./screens/CreateScreen.jsx";
import UnderstandingScreen from "./screens/UnderstandingScreen.jsx";
import ScriptRoom from "./screens/ScriptRoom.jsx";
import ProductionTheater from "./screens/ProductionTheater.jsx";
import Premiere from "./screens/Premiere.jsx";
import Gallery from "./screens/Gallery.jsx";

// View state machine:
//   create -> understanding -> script -> theater -> premiere
//   gallery reachable from the header at any time.
//
// SOLSTICE: each view is a time of day. The sun rises while you
// create, crosses the sky through script & production, and becomes
// the moon at the premiere — the premiere is always at midnight.
const PHASES = {
  create: 0.04,
  understanding: 0.28,
  script: 0.46,
  theater: 0.68,
  gallery: 0.4,
  premiere: 1.0,
};

export default function App() {
  const [view, setView] = useState("create");
  const [projectId, setProjectId] = useState(null);

  const go = useCallback((nextView, id) => {
    if (id !== undefined) setProjectId(id);
    setView(nextView);
  }, []);

  const screens = {
    create: <CreateScreen onCreated={(id, autopilot) => go(autopilot ? "theater" : "understanding", id)} />,
    understanding: <UnderstandingScreen projectId={projectId} onScriptReady={() => go("script")} onFailed={() => go("create")} />,
    script: <ScriptRoom projectId={projectId} onApproved={() => go("theater")} />,
    theater: <ProductionTheater projectId={projectId} onDone={() => go("premiere")} onFailed={() => go("create")} />,
    premiere: <Premiere projectId={projectId} onRemix={() => go("script")} onNew={() => go("create", null)} />,
    gallery: <Gallery onOpen={(id) => go("premiere", id)} />,
  };

  return (
    <div className="grain min-h-full flex flex-col">
      <SolsticeSky phase={PHASES[view] ?? 0.4} />

      <header className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 border-b border-line bg-panel backdrop-blur-md">
        <button
          onClick={() => go("create", null)}
          className="font-display font-bold tracking-[0.2em] text-ink text-sm uppercase"
        >
          KEY<span className="text-accent">FRAME</span>
        </button>
        <nav className="flex gap-6 text-xs uppercase tracking-widest text-dim">
          <button onClick={() => go("create", null)} className={view === "create" ? "text-accent" : "hover:text-ink"}>
            Create
          </button>
          <button onClick={() => go("gallery")} className={view === "gallery" ? "text-accent" : "hover:text-ink"}>
            Gallery
          </button>
        </nav>
      </header>

      <main className="flex-1 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="h-full"
          >
            {screens[view]}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
