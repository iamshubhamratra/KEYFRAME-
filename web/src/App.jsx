import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import CreateScreen from "./screens/CreateScreen.jsx";
import UnderstandingScreen from "./screens/UnderstandingScreen.jsx";
import ScriptRoom from "./screens/ScriptRoom.jsx";
import ProductionTheater from "./screens/ProductionTheater.jsx";
import Premiere from "./screens/Premiere.jsx";
import Gallery from "./screens/Gallery.jsx";
import { createProject } from "./api.js";

// View machine. The LANDING is the exact design export (served as /design.html
// in an iframe) so the scroll-build camera is pixel + motion identical to the
// zip. Its CTAs postMessage up here to drive the real, functional studio:
//   landing -> create -> understanding -> script -> theater -> premiere
//   gallery reachable from the header.
export default function App() {
  const [view, setView] = useState("landing");
  const [projectId, setProjectId] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [starting, setStarting] = useState(false);
  const startedRef = useRef(false);

  const go = useCallback((nextView, id) => {
    if (id !== undefined) setProjectId(id);
    setView(nextView);
  }, []);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);

  // Kick off a real generation from a landing CTA (prompt or URL captured in the
  // bundle's own "Feed it anything" card). Falls back to the studio form if empty.
  const startGeneration = useCallback(async ({ prompt, url }) => {
    if (startedRef.current) return;
    const hasPrompt = prompt && prompt.trim().length >= 10;
    const hasUrl = url && /^https?:\/\/.+\..+/.test(url.trim());
    if (!hasPrompt && !hasUrl) {
      setPrefill({ prompt: prompt || "", url: url || "" });
      go("create");
      return;
    }
    startedRef.current = true;
    setStarting(true);
    try {
      const fields = {
        duration: 30, orientation: "horizontal", quality: "720p",
        framePack: "auto", captions: false,
        ...(hasPrompt ? { prompt: prompt.trim() } : {}),
        ...(hasUrl ? { websiteUrl: url.trim() } : {}),
      };
      const r = await createProject(fields);
      go("understanding", r.projectId);
    } catch (e) {
      setPrefill({ prompt: prompt || "", url: url || "", error: e.message });
      go("create");
    } finally {
      setStarting(false);
      startedRef.current = false;
    }
  }, [go]);

  // Listen for the landing iframe's bridge messages.
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data || {};
      if (d.type === "kf-create") startGeneration({ prompt: d.prompt, url: d.url });
      else if (d.type === "kf-gallery") go("gallery");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [startGeneration, go]);

  // ---- Landing: the exact design export, full-screen ----
  if (view === "landing") {
    return (
      <div className="fixed inset-0">
        <iframe
          src="/design.html"
          title="KEYFRAME"
          className="w-full h-full"
          style={{ border: 0, display: "block" }}
        />
        {starting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(233,230,221,0.85)", backdropFilter: "blur(6px)" }}>
            <div className="text-center">
              <div className="eyebrow">Opening the aperture…</div>
              <div className="wordmark text-3xl mt-2"><span style={{ color: "var(--color-ink)" }}>KEY</span><span style={{ color: "var(--color-green)" }}>FRAME</span></div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const screens = {
    create: <CreateScreen onCreated={(id) => go("understanding", id)} prefill={prefill} />,
    understanding: <UnderstandingScreen projectId={projectId} onScriptReady={() => go("script")} onFailed={() => go("create")} />,
    script: <ScriptRoom projectId={projectId} onApproved={() => go("theater")} />,
    theater: <ProductionTheater projectId={projectId} onDone={() => go("premiere")} onFailed={() => go("create")} />,
    premiere: <Premiere projectId={projectId} onRemix={() => go("script")} onNew={() => go("create", null)} />,
    gallery: <Gallery onOpen={(id) => go("premiere", id)} />,
  };

  return (
    <div className="grain min-h-full flex flex-col">
      <div className="studio-ground" aria-hidden="true" />

      <header
        className="sticky top-0 z-50 flex items-center justify-between px-6 sm:px-10 py-4 border-b"
        style={{ borderColor: "var(--color-line)", background: "rgba(233,230,221,0.72)", backdropFilter: "blur(12px)" }}
      >
        <button onClick={() => go("landing", null)} className="flex items-center gap-2.5" aria-label="KEYFRAME home">
          <span className="relative inline-flex" style={{ width: 22, height: 22 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10.5" fill="none" stroke="var(--color-ink)" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="4" fill="var(--color-green)" />
              {[0, 60, 120, 180, 240, 300].map((a) => (
                <line key={a} x1="12" y1="12" x2="12" y2="3" stroke="var(--color-ink)" strokeWidth="1" opacity="0.55" transform={`rotate(${a} 12 12)`} />
              ))}
            </svg>
          </span>
          <span className="wordmark text-lg" style={{ letterSpacing: "0.04em" }}>
            <span style={{ color: "var(--color-ink)" }}>KEY</span><span style={{ color: "var(--color-green)" }}>FRAME</span>
          </span>
        </button>

        <nav className="hidden sm:flex items-center gap-7">
          <button className="label-mono" style={{ color: "var(--color-dim)" }} onClick={() => go("landing")}>Home</button>
          <button className="label-mono" style={{ color: view === "create" ? "var(--color-accent-text)" : "var(--color-dim)" }} onClick={() => go("create")}>Studio</button>
          <button className="label-mono" style={{ color: view === "gallery" ? "var(--color-accent-text)" : "var(--color-dim)" }} onClick={() => go("gallery")}>Gallery</button>
        </nav>

        <button className="btn-lime" style={{ padding: "11px 22px", fontSize: 13 }} onClick={() => go("create")}>Create film</button>
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
