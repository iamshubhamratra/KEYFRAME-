import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import CreateScreen from "./screens/CreateScreen.jsx";
import UnderstandingScreen from "./screens/UnderstandingScreen.jsx";
import ScriptRoom from "./screens/ScriptRoom.jsx";
import ProductionTheater from "./screens/ProductionTheater.jsx";
import Premiere from "./screens/Premiere.jsx";
import Gallery from "./screens/Gallery.jsx";

// View state machine:
//   create -> understanding -> script -> theater -> premiere
//   gallery reachable from the header at any time.
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
      <header className="flex items-center justify-between px-8 py-5 border-b border-line">
        <button
          onClick={() => go("create", null)}
          className="font-display font-bold tracking-[0.25em] text-ink text-sm uppercase"
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
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="h-full"
          >
            {screens[view]}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
