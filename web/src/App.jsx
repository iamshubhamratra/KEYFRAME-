import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import CreateScreen from "./screens/CreateScreen.jsx";
import UnderstandingScreen from "./screens/UnderstandingScreen.jsx";
import ScriptRoom from "./screens/ScriptRoom.jsx";
import ProductionTheater from "./screens/ProductionTheater.jsx";
import Premiere from "./screens/Premiere.jsx";
import Gallery from "./screens/Gallery.jsx";
import Templates from "./screens/Templates.jsx";
import Auth from "./screens/Auth.jsx";
import { createProject } from "./api.js";
import { useAuth } from "./AuthContext.jsx";

// Landing is the v2 design doc ("the film set") running on its own runtime in
// an iframe. The STUDIO (create → understanding → script → theater → premiere)
// requires login; Templates + Gallery stay public, themed to the same v2 system.
export default function App() {
  const { user, loading, logout } = useAuth();
  const [view, setView] = useState("landing");
  const [projectId, setProjectId] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [starting, setStarting] = useState(false);
  const pending = useRef(null);   // action to resume after login
  const startedRef = useRef(false);

  const go = useCallback((nextView, id) => {
    if (id !== undefined) setProjectId(id);
    setView(nextView);
  }, []);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);

  // Actually start a generation (assumes authenticated).
  const runGenerate = useCallback(async ({ prompt, url }) => {
    if (startedRef.current) return;
    const hasPrompt = prompt && prompt.trim().length >= 10;
    const hasUrl = url && /^https?:\/\/.+\..+/.test(url.trim());
    if (!hasPrompt && !hasUrl) { setPrefill({ prompt: prompt || "", url: url || "" }); go("create"); return; }
    startedRef.current = true; setStarting(true);
    try {
      const fields = { duration: 30, orientation: "horizontal", quality: "1080p", framePack: "auto", captions: false, composeMode: "premium",
        ...(hasPrompt ? { prompt: prompt.trim() } : {}), ...(hasUrl ? { websiteUrl: url.trim() } : {}) };
      const r = await createProject(fields);
      go("understanding", r.projectId);
    } catch (e) {
      setPrefill({ prompt: prompt || "", url: url || "", error: e.message }); go("create");
    } finally { setStarting(false); startedRef.current = false; }
  }, [go]);

  // Gate: run `action` if logged in, else open Auth and resume after.
  const requireAuth = useCallback((action, mode = "login") => {
    if (user) { action(); return; }
    pending.current = action; setAuthMode(mode); setView("auth");
  }, [user]);

  const enterStudio = useCallback((targetView = "create") => requireAuth(() => go(targetView), "login"), [requireAuth, go]);
  const startGeneration = useCallback(({ prompt, url }) => requireAuth(() => runGenerate({ prompt: prompt || "", url: url || "" }), "signup"), [requireAuth, runGenerate]);
  const useStyle = useCallback((packName) => {
    setPrefill({ framePack: packName });
    requireAuth(() => go("create"), "signup");
  }, [requireAuth, go]);

  const onAuthed = useCallback(() => {
    const action = pending.current; pending.current = null;
    if (action) action(); else go("create");
  }, [go]);

  // Landing iframe bridge.
  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data || {};
      if (d.type === "kf-create") startGeneration({ prompt: d.prompt, url: d.url });
      else if (d.type === "kf-gallery") go("gallery");
      else if (d.type === "kf-templates") go("templates");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [startGeneration, go]);

  // ---- Landing: the v2 design doc, full-screen ----
  if (view === "landing") {
    return (
      <div className="fixed inset-0" style={{ background: "#f4f0e6" }}>
        <iframe src="/design.html" title="KEYFRAME" className="w-full h-full" style={{ border: 0, display: "block" }} />
        {starting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(244,240,230,0.88)", backdropFilter: "blur(6px)" }}>
            <div className="text-center">
              <div className="rec-blip" style={{ justifyContent: "center" }}>ROLLING</div>
              <div className="wordmark text-3xl mt-3">KEYFRAME<span style={{ color: "var(--color-mag)" }}>.</span></div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const studioViews = ["create", "understanding", "script", "theater", "premiere"];
  const screens = {
    auth: <Auth initialMode={authMode} onAuthed={onAuthed} onBack={() => go("landing")} />,
    create: <CreateScreen onCreated={(id) => go("understanding", id)} prefill={prefill} />,
    understanding: <UnderstandingScreen projectId={projectId} onScriptReady={() => go("script")} onFailed={() => go("create")} />,
    script: <ScriptRoom projectId={projectId} onApproved={() => go("theater")} />,
    theater: <ProductionTheater projectId={projectId} onDone={() => go("premiere")} onFailed={() => go("create")} onScriptReview={() => go("script")} />,
    premiere: <Premiere projectId={projectId} onRemix={() => go("script")} onNew={() => enterStudio("create")} />,
    gallery: <Gallery onOpen={(id) => go("premiere", id)} onUseStyle={useStyle} />,
    templates: <Templates onUseStyle={useStyle} />,
  };

  const darkPage = view === "gallery" || view === "premiere";

  return (
    <div className="grain min-h-full flex flex-col">
      <div className="studio-ground" aria-hidden="true" />

      <NavBar dark={darkPage}>
        {/* left cluster — the v2 logo + wordmark + REC blip */}
        <div className="flex items-center gap-3" style={{ pointerEvents: "auto" }}>
          <button onClick={() => go("landing")} className="flex items-center gap-3 cursor-pointer" aria-label="KEYFRAME home">
            <span style={{ width: 34, height: 34, borderRadius: 10, background: darkPage ? "#f2ede2" : "var(--color-ink)", display: "grid", placeItems: "center" }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--color-mag)", boxShadow: "0 0 10px var(--color-mag)" }} />
            </span>
            <span className="wordmark" style={{ fontSize: 18, color: darkPage ? "#f2ede2" : "var(--color-ink)" }}>KEYFRAME</span>
          </button>
          <span className="rec-blip" style={{ marginLeft: 8 }}>REC</span>
        </div>

        {/* right cluster — mono pills + Start rolling */}
        <div className="flex items-center" style={{ gap: 10, pointerEvents: "auto" }}>
          <button className={`btn-chip ${view === "templates" ? "is-active" : ""}`} onClick={() => go("templates")}>Templates</button>
          <button className={`btn-chip ${view === "gallery" ? "is-active" : ""}`} onClick={() => go("gallery")}>Gallery</button>
          {studioViews.includes(view) && <button className="btn-chip is-active">Studio</button>}

          {loading ? (
            <span className="label-mono">…</span>
          ) : user ? (
            <span className="hidden sm:flex items-center gap-2.5" style={{ marginLeft: 4 }}>
              <span className="inline-flex items-center justify-center font-display font-bold text-[13px]"
                style={{ width: 30, height: 30, borderRadius: 10, background: "var(--color-mag)", color: "#17130e" }}>
                {(user.name || user.email || "?").trim().charAt(0).toUpperCase()}
              </span>
              <button onClick={() => { logout(); go("landing"); }}
                style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-dim)", cursor: "pointer" }}>
                Log out
              </button>
            </span>
          ) : (
            <button onClick={() => { setAuthMode("login"); pending.current = () => go("create"); setView("auth"); }}
              style={{ marginLeft: 4, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-dim)", cursor: "pointer" }}>
              Log in
            </button>
          )}

          <button className="btn-ink" onClick={() => (user ? enterStudio("create") : (setAuthMode("signup"), pending.current = () => go("create"), setView("auth")))}>
            Start rolling <span className="dot-mag">●</span>
          </button>
        </div>
      </NavBar>

      <main className="flex-1 relative" style={{ paddingTop: 90 }}>
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }} className="h-full">
            {screens[view]}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="w-full flex items-center justify-between flex-wrap gap-3"
        style={{ padding: "26px clamp(16px,4vw,60px) 30px", borderTop: "1px solid rgba(23,19,14,.12)" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--color-dim)" }}>
          © 2026 KEYFRAME STUDIO — SHOT ENTIRELY ON SCROLL
        </span>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, color: "var(--color-ink)", letterSpacing: "0.3em" }}>
          FIN<span style={{ color: "var(--color-mag)" }}>.</span>
        </span>
      </footer>
    </div>
  );
}

// The v2 nav: fixed and minimal; gains a veil once scrolled so app pages stay
// legible beneath it — paper veil on light pages, deep-set veil on dark ones.
function NavBar({ dark = false, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      if (window.scrollY > 40) {
        el.style.background = dark ? "rgba(13,11,7,.88)" : "rgba(244,240,230,.85)";
        el.style.backdropFilter = "blur(10px)";
        el.style.borderBottomColor = dark ? "rgba(242,237,226,.12)" : "rgba(23,19,14,.10)";
      } else {
        el.style.background = "transparent";
        el.style.backdropFilter = "none";
        el.style.borderBottomColor = "transparent";
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [dark]);
  return (
    <nav ref={ref} className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between"
      style={{ padding: "16px clamp(16px,3vw,34px)", borderBottom: "1px solid transparent", transition: "background .35s ease, border-color .35s ease" }}>
      {children}
    </nav>
  );
}
