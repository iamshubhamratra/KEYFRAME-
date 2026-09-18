import { useState, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import CreateScreen from "./screens/CreateScreen.jsx";
import UnderstandingScreen from "./screens/UnderstandingScreen.jsx";
import ScriptRoom from "./screens/ScriptRoom.jsx";
import ProductionTheater from "./screens/ProductionTheater.jsx";
import Premiere from "./screens/Premiere.jsx";
import Gallery from "./screens/Gallery.jsx";
import Templates from "./screens/Templates.jsx";
import AdminTemplates from "./screens/AdminTemplates.jsx";
import AdminGenerate from "./screens/AdminGenerate.jsx";
import AdminTemplateDetail from "./screens/AdminTemplateDetail.jsx";
import Auth from "./screens/Auth.jsx";
import { createProject } from "./api.js";
import { useAuth } from "./useAuth.js";
import AiEditUpload from "./screens/aiEdit/AiEditUpload.jsx";
import AiEditSession from "./screens/aiEdit/AiEditSession.jsx";
import AiEditList from "./screens/aiEdit/AiEditList.jsx";
import ModeSwitch from "./components/ModeSwitch.jsx";
import AiEditNavChip from "./components/AiEditNavChip.jsx";
import { readDeepLink } from "./deepLink.js";

// Landing is the v2 design doc ("the film set") running on its own runtime in
// an iframe. The STUDIO (create → understanding → script → theater → premiere)
// requires login; Templates + Gallery stay public, themed to the same v2 system.
export default function App() {
  const { user, loading, logout } = useAuth();
  const [view, setView] = useState(() => readDeepLink()?.view ?? "landing");
  const [projectId, setProjectId] = useState(() => readDeepLink()?.id ?? null);
  const [prefill, setPrefill] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [starting, setStarting] = useState(false);
  const [autopilot, setAutopilot] = useState(false); // set at creation; routes Understanding→Theater past the Script Room
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
    setAutopilot(false); // landing quick-start always pauses at the script
    startedRef.current = true; setStarting(true);
    try {
      // `pace` is explicit rather than omitted: the server backfills `normal`, so
      // leaving it out was correct only by accident and would silently drift the
      // day that default changes.
      const fields = { duration: 30, orientation: "horizontal", quality: "1080p", framePack: "auto", captions: false, composeMode: "standard", pace: "normal",
        ...(hasPrompt ? { prompt: prompt.trim() } : {}), ...(hasUrl ? { websiteUrl: url.trim() } : {}) };
      const r = await createProject(fields);
      // A film now exists, so whatever an EARLIER handoff left in prefill no longer
      // describes anything pending — see the CreateScreen onCreated callback below.
      setPrefill(null);
      go("understanding", r.projectId);
    } catch (e) {
      // The landing iframe never mounts CreateScreen, so the scope gate's decision
      // has to travel back as prefill — this is the only route by which that path
      // can show the question, or what KEYFRAME can make and how, rather than a bare
      // failure.
      //
      // A decision is NOT an error, so it deliberately carries no `error`: the red
      // line under the editor would print e.message, which for an out-of-scope
      // request is the server's whole plain-text guidance flattened into one
      // run-on paragraph, directly above the panel that renders it properly.
      setPrefill(e.body?.scope
        ? { prompt: prompt || "", url: url || "", scope: e.body.scope }
        : { prompt: prompt || "", url: url || "", error: e.message });
      go("create");
    } finally { setStarting(false); startedRef.current = false; }
  }, [go]);

  // Gate: run `action` if logged in, else open Auth and resume after.
  const requireAuth = useCallback((action, mode = "login") => {
    if (user) { action(); return; }
    pending.current = action; setAuthMode(mode); setView("auth");
  }, [user]);

  // A fresh entry into the studio starts from a clean prefill. Prefill lives in App
  // state, so a scope decision handed over by the landing quick-start would otherwise
  // survive a whole film and reappear — refusal panel, locked Produce — the next time
  // someone chose "new film" from the Premiere.
  const enterStudio = useCallback((targetView = "create") => requireAuth(() => { setPrefill(null); go(targetView); }, "login"), [requireAuth, go]);
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
      else if (d.type === "kf-ai-edit") requireAuth(() => go("aiUpload"), "signup");
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
  // The admin template pipeline. Its screens carry their own gate (and the
  // server's requireAdmin is the actual boundary), so they are registered for
  // everyone and simply refuse to render for anyone who isn't an admin — only
  // the NAV entry below is conditional.
  const adminViews = ["adminTemplates", "adminGenerate", "adminTemplate"];
  const aiViews = ["aiUpload", "aiEdit", "aiEdits"];
  const screens = {
    auth: <Auth initialMode={authMode} onAuthed={onAuthed} onBack={() => go("landing")} />,
    // prefill is cleared the moment a film is created. It is only ever a request that has
    // NOT become a film yet — landing words, a chosen pack, a scope decision — and it lives
    // here in App, outliving the CreateScreen that consumed it. Left in place, a failed
    // film's onFailed -> go("create") remounted the editor from it: a landing refusal the
    // person had long since edited past came back as the refused words, the refusal panel
    // and a CUT lock on both CTAs.
    create: <CreateScreen onCreated={(id, opts) => { setPrefill(null); setAutopilot(!!opts?.autopilot); go("understanding", id); }} prefill={prefill} />,
    understanding: <UnderstandingScreen projectId={projectId} autopilot={autopilot} onScriptReady={() => go("script")} onProducing={() => go("theater")} onFailed={() => go("create")} />,
    script: <ScriptRoom projectId={projectId} onApproved={() => go("theater")} />,
    theater: <ProductionTheater projectId={projectId} autopilot={autopilot} onDone={() => go("premiere")} onFailed={() => go("create")} onScriptReview={() => go("script")} />,
    premiere: <Premiere projectId={projectId} onRemix={() => go("script")} onNew={() => enterStudio("create")} />,
    gallery: <Gallery onOpen={(id) => go("premiere", id)} onUseStyle={useStyle} />,
    templates: <Templates onUseStyle={useStyle} />,
    // go()'s second argument is the registry's one id channel — a film id in the
    // studio, a template id here.
    adminTemplates: <AdminTemplates onOpen={(id) => go("adminTemplate", id)} onNew={() => go("adminGenerate")} />,
    adminGenerate: <AdminGenerate onOpen={(id) => go("adminTemplate", id)} onCancel={() => go("adminTemplates")} />,
    adminTemplate: <AdminTemplateDetail templateId={projectId} onBack={() => go("adminTemplates")} />,
    aiUpload: <AiEditUpload onStarted={(id) => go("aiEdit", id)} onOpenEdit={(id) => go("aiEdit", id)} onOpenList={() => go("aiEdits")} onNeedAuth={(retry) => requireAuth(retry, "login")} />,
    aiEdit: <AiEditSession key={projectId} editId={projectId} onList={() => go("aiEdits")} onNew={() => go("aiUpload")} onNeedAuth={(retry) => requireAuth(retry, "login")} />,
    aiEdits: <AiEditList onOpen={(id) => go("aiEdit", id)} onNew={() => go("aiUpload")} onNeedAuth={(retry) => requireAuth(retry, "login")} />,
  };

  const darkPage = view === "gallery" || view === "premiere" || view === "aiEdit";

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
          <AiEditNavChip active={aiViews.includes(view)} onClick={() => requireAuth(() => go("aiUpload"), "signup")} />
          {studioViews.includes(view) && <button className="btn-chip is-active">Studio</button>}
          {/* Admin-only entry. Hiding it is a courtesy, not a control — the
              template routes are behind requireAdmin server-side. */}
          {user?.role === "admin" && (
            <button className={`btn-chip ${adminViews.includes(view) ? "is-active" : ""}`} onClick={() => go("adminTemplates")}>Admin</button>
          )}

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
        {(view === "create" || view === "aiUpload") && (
          <ModeSwitch mode={view === "create" ? "TEMPLATE_GENERATION" : "AI_VIDEO_EDIT"}
            onSelect={(m) => (m === "AI_VIDEO_EDIT" ? requireAuth(() => go("aiUpload"), "signup") : enterStudio("create"))} />
        )}
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
