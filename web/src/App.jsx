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
import AdminTemplateNew from "./screens/AdminTemplateNew.jsx";
import AdminTemplateDetail from "./screens/AdminTemplateDetail.jsx";
import AdminTemplateBatch from "./screens/AdminTemplateBatch.jsx";
import Auth from "./screens/Auth.jsx";
import { createProject } from "./api.js";
import { useAuth } from "./AuthContext.jsx";

// Landing is the v2 design doc ("the film set") running on its own runtime in
// an iframe. The STUDIO (create → understanding → script → theater → premiere)
// requires login; Templates + Gallery stay public, themed to the same v2 system.
// Deep-link support: ?view=<screen>&project=<id> resumes a studio screen (e.g. a
// running production or a finished premiere) so a link can be shared or reopened.
// Only public/state-driven screens are allowed here; project data loads from the
// (public) project API, so no auth is needed just to watch/replay one.
const DEEP_LINK_VIEWS = new Set(["theater", "premiere", "gallery", "templates"]);
// The admin template screens are deliberately NOT deep-linkable. initialFromUrl() runs before
// /api/auth/me has resolved, so a ?view=admin link would have to pick a screen while the role
// is still unknown — and the honest answer at that moment is "no". They are reached from the
// nav instead, which only renders once the session is known.
const ADMIN_VIEWS = new Set(["admin", "adminNew", "adminTemplate", "adminBatch"]);
function initialFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("view");
    if (v && DEEP_LINK_VIEWS.has(v)) return { view: v, projectId: p.get("project") || null };
  } catch { /* SSR / no window */ }
  return { view: "landing", projectId: null };
}

export default function App() {
  const { user, isAdmin, loading, logout } = useAuth();
  const _init = initialFromUrl();
  const [view, setView] = useState(_init.view);
  const [projectId, setProjectId] = useState(_init.projectId);
  const [templateId, setTemplateId] = useState(null);
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
  // NOTE: this landing quick-start path deliberately carries NO files (no
  // referenceVideo/logo/assets) and must stay a plain-JSON create — a File that
  // sneaks into these fields would JSON.stringify to {} and post garbage. The
  // full uploader lives in CreateScreen's BRAND ASSETS card.
  const runGenerate = useCallback(async ({ prompt, url }) => {
    if (startedRef.current) return;
    const hasPrompt = prompt && prompt.trim().length >= 10;
    const hasUrl = url && /^https?:\/\/.+\..+/.test(url.trim());
    if (!hasPrompt && !hasUrl) { setPrefill({ prompt: prompt || "", url: url || "" }); go("create"); return; }
    startedRef.current = true; setStarting(true);
    try {
      const fields = { duration: 30, orientation: "horizontal", quality: "720p", framePack: "auto", captions: false,
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

  // Open one template's review page. Its own id, not projectId — a template and a project are
  // different entities and sharing the slot would resume the wrong screen after a deep link.
  const openTemplate = useCallback((id) => { setTemplateId(id); setView("adminTemplate"); }, []);

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
    theater: <ProductionTheater projectId={projectId} onDone={() => go("premiere")} onFailed={() => go("create")} />,
    premiere: <Premiere projectId={projectId} onRemix={() => go("script")} onNew={() => enterStudio("create")} />,
    gallery: <Gallery onOpen={(id) => go("premiere", id)} onUseStyle={useStyle} />,
    templates: <Templates onUseStyle={useStyle} />,
    // ADMIN. Registered only for an admin session — but that is COSMETIC ONLY. Hiding a screen
    // is not authorization: every /api/admin route sits behind requireAuth + requireAdmin on the
    // server (routes/admin_templates.js applies it with router.use so a new route is protected
    // by default). Someone who flips `role` in a devtools console gets these three screens and a
    // 403 from every call they make.
    ...(isAdmin ? {
      admin: <AdminTemplates onOpen={openTemplate} onNew={() => go("adminNew")} onBatch={() => go("adminBatch")} />,
      adminNew: <AdminTemplateNew onOpen={openTemplate} onBack={() => go("admin")} />,
      adminBatch: <AdminTemplateBatch onOpenTemplate={openTemplate} onBack={() => go("admin")} />,
      adminTemplate: (
        <AdminTemplateDetail
          templateId={templateId}
          onBack={() => go("admin")}
          onOpenTemplate={openTemplate}
          // A test render is an ordinary project job, so it is watched in the ordinary studio.
          onOpenProject={(id) => go("theater", id)}
        />
      ),
    } : {}),
  };

  const darkPage = view === "gallery" || view === "premiere";

  return (
    <div className="grain min-h-full flex flex-col">
      <div className="studio-ground" aria-hidden="true" />

      <NavBar dark={darkPage}>
        {/* left cluster — the v2 logo + wordmark + REC blip */}
        <div className="nav-group flex items-center gap-3" style={{ pointerEvents: "auto" }}>
          <button onClick={() => go("landing")} className="flex items-center gap-3 cursor-pointer" aria-label="KEYFRAME home">
            <span style={{ width: 34, height: 34, borderRadius: 10, background: darkPage ? "#f2ede2" : "var(--color-ink)", display: "grid", placeItems: "center" }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--color-mag)", boxShadow: "0 0 10px var(--color-mag)" }} />
            </span>
            <span className="wordmark" style={{ fontSize: 18, color: darkPage ? "#f2ede2" : "var(--color-ink)" }}>KEYFRAME</span>
          </button>
          <span className="rec-blip" style={{ marginLeft: 8 }}>REC</span>
        </div>

        {/* right cluster — mono pills + Start rolling */}
        <div className="nav-group flex items-center flex-wrap" style={{ gap: 10, pointerEvents: "auto" }}>
          <button className={`btn-chip ${view === "templates" ? "is-active" : ""}`} onClick={() => go("templates")}>Templates</button>
          <button className={`btn-chip ${view === "gallery" ? "is-active" : ""}`} onClick={() => go("gallery")}>Gallery</button>
          {/* You are already here — this is a WHERE-YOU-ARE marker, not a destination. It was a
              <button> with no onClick, which is the worst of both: it invites a click and eats it.
              A span with aria-current says the same thing truthfully. */}
          {studioViews.includes(view) && (
            <span className="btn-chip is-active" aria-current="page" style={{ cursor: "default" }}>Studio</span>
          )}
          {/* Only an admin is offered the door. The lock is on the server. */}
          {isAdmin && (
            <button className={`btn-chip ${ADMIN_VIEWS.has(view) ? "is-active" : ""}`} onClick={() => go("admin")}>Admin</button>
          )}

          {loading ? (
            <span className="label-mono">…</span>
          ) : user ? (
            // Was `hidden sm:flex`, which removed the ONLY log-out control below 640px — a phone
            // user could sign in and then had no way to sign out. The avatar is the decoration
            // here, so it hides on the narrowest screens; the control never does.
            <span className="flex items-center gap-2.5" style={{ marginLeft: 4 }}>
              <span className="hidden sm:inline-flex items-center justify-center font-display font-bold text-[13px]"
                style={{ width: 30, height: 30, borderRadius: 10, background: "var(--color-mag)", color: "#17130e" }}
                title={user.name || user.email || ""} aria-hidden="true">
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

      {/* paddingTop was a hardcoded 90, which assumed the nav is always exactly one line tall.
          It is not: once the nav is allowed to wrap, its height is a function of the viewport.
          NavBar publishes its measured height as --nav-h and .app-main consumes it. */}
      <main className="app-main flex-1 relative">
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }} className="h-full">
            {/* An admin view held in state while the session drops (log out in another tab, a
                cookie expiring) would otherwise render as a blank page, because the admin
                entries are gone from `screens`. Say what happened instead. */}
            {screens[view] || (
              ADMIN_VIEWS.has(view)
                ? <div style={{ maxWidth: 620, margin: "0 auto", padding: "clamp(30px,6vw,70px) clamp(16px,4vw,60px)", textAlign: "center" }}>
                    <span className="scene-pill" style={{ "--tagc": "#7d766a" }}>ADMIN ONLY</span>
                    <h2 className="headline" style={{ fontSize: "clamp(26px,4vw,42px)" }}>This area needs an admin session.</h2>
                    <p style={{ color: "var(--color-dim)", margin: "16px 0 24px", lineHeight: 1.6 }}>
                      {loading ? "Checking your session…" : "Log in with an admin account to author templates."}
                    </p>
                    <button className="btn-ink" onClick={() => go("templates")}>Browse templates</button>
                  </div>
                : null
            )}
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
  // PUBLISH THE REAL HEIGHT. The nav is fixed, so main has to offset itself by exactly the nav's
  // height or content hides underneath it. That offset used to be the constant 90 — correct only
  // while the nav was guaranteed one line, which stopped being true the moment it was allowed to
  // wrap. Measuring is the only version that cannot drift.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty("--nav-h", `${Math.ceil(el.getBoundingClientRect().height) + 16}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("resize", publish);
    return () => { ro.disconnect(); window.removeEventListener("resize", publish); };
  }, []);
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
    <nav ref={ref} className="app-nav fixed top-0 left-0 right-0 z-50 flex items-center justify-between"
      style={{ padding: "16px clamp(16px,3vw,34px)", borderBottom: "1px solid transparent", transition: "background .35s ease, border-color .35s ease" }}>
      {children}
    </nav>
  );
}
