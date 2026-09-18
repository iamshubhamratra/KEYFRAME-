import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import UploadDropzone from "../../components/UploadDropzone.jsx";
import ProgressBar from "../../components/ProgressBar.jsx";
import RadioChips from "../../components/RadioChips.jsx";
import Switch from "../../components/Switch.jsx";
import LanguageSelect from "../../components/LanguageSelect.jsx";
import BrandPalettePicker from "../../components/BrandPalettePicker.jsx";
import Dialog from "../../components/Dialog.jsx";
import { RichText } from "../../components/EditNotice.jsx";
import { PanelHead } from "../AdminShared.jsx";
import { EditStatusBadge } from "./AiEditList.jsx";
import {
  useUpload, checkFile, start, cancel, reset, isBusy, clearConsentIssue, DEFAULT_LIMITS,
  subscribe as subscribeUpload, getSnapshot as getUploadSnapshot,
} from "../../uploadStore.js";
import { getCapabilities, listEdits, mediaSrc } from "../../editApi.js";
import {
  UPLOAD_COPY, DEFAULT_UPLOAD_SETTINGS, FORMAT_OPTIONS, CAPTION_STYLE_OPTIONS, WORDS_PER_LINE_OPTIONS, BROLL_OPTIONS,
  EFFECTS_OPTIONS, FILLER_OPTIONS, PACE_OPTIONS, WHAT_YOU_GET, defaultsLine, uploadStatusLine, statusBadge, fmtBytes, fmtWhen,
} from "../../editFormat.js";
import { LOGO_CORNERS, LOGO_LIMITS, LANGUAGES } from "../../brand.js";
import { subscribeRecent, getRecentSnapshot } from "../../recentEdits.js";
import { useNow } from "../../clockStore.js";

// SC 01 · THE FOOTAGE (UX.md §1b). One take in, one decision out: drop a video, agree to what
// leaves the building, press Start. Everything else (format, captions, brand, sound, the cut) is
// already decided sensibly and lives behind "Customize". The upload itself runs in uploadStore, so
// leaving this page never stops the bytes; coming back shows exactly where it is.

const EASE = [0.16, 1, 0.3, 1];
const CSS = `
.kf-up-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:20px;align-items:start}
@media (min-width:861px){.kf-up-bay{position:sticky;top:96px}}
@media (max-width:860px){.kf-up-cta{width:100%}}
.kf-up-consent input{width:20px;height:20px;margin:0;accent-color:var(--color-mag);cursor:pointer;flex-shrink:0}
.kf-up-fieldset{border:0;margin:0;padding:18px 0 0;min-width:0;display:grid;gap:16px}
.kf-up-fieldset + .kf-up-fieldset{border-top:1px solid rgba(23,19,14,.10);margin-top:18px}
.kf-up-legend{padding:0;font-family:var(--font-mono);font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:var(--color-ink)}
.kf-up-strip{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;list-style:none;margin:0;padding:0}
.kf-up-strip-btn{width:100%;min-height:64px;display:flex;align-items:center;gap:12px;padding:8px 12px 8px 8px;text-align:left;cursor:pointer;border-radius:14px;border:1px solid rgba(23,19,14,.12);background:rgba(255,255,255,.72);transition:border-color .25s,background .25s}
.kf-up-strip-btn:hover{border-color:var(--color-ink);background:#fff}
.kf-fit-head .editor-head{flex-wrap:nowrap;min-width:0}
.kf-fit-head .editor-head>span{flex-shrink:0}
.kf-fit-head .editor-head>span:nth-child(4){flex-shrink:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kf-fit-head .editor-status{white-space:nowrap;padding-left:10px}
`;

const cloneDefaults = () => JSON.parse(JSON.stringify(DEFAULT_UPLOAD_SETTINGS));
function setPath(obj, path, value) {
  const [k, ...rest] = path;
  return { ...obj, [k]: rest.length ? setPath(obj?.[k] || {}, rest, value) : value };
}
const extOf = (name) => {
  const i = String(name || "").lastIndexOf(".");
  return i > 0 ? String(name).slice(i).toLowerCase() : "";
};
const GOT_ON = {
  Captions: (s) => s.captions.enabled,
  "B-roll": (s) => s.broll.enabled !== false,
  "Punch-ins": () => true,
  "Jump cuts": (s) => s.effects.autoJumpCuts,
  "Silence & filler removal": (s) => s.removeFillers !== "off" || s.removeSilence.enabled,
  Music: (s) => s.music.enabled,
};

// The status line in the edit bay's head, per upload phase.
function bayStatus(up) {
  switch (up.phase) {
    case "checking": return ["● READING THE FILE", "var(--color-cy)"];
    case "rejected": return ["● CUT", "#ff6a3c"];
    case "ready": return ["● READY TO ROLL", "var(--color-lm)"];
    case "uploading": return [`● UPLOADING ${Math.floor(up.progress?.pct ?? 0)}%`, "var(--color-mag)"];
    case "verifying": return ["● CHECKING", "var(--color-am)"];
    case "started": return ["● ROLLING", "var(--color-lm)"];
    case "failed": return [up.error?.status === 0 ? "● SIGNAL LOST" : "● CUT", "#ff6a3c"];
    case "cancelled": return ["● STOPPED", "var(--color-dark-dim)"];
    default: return ["● STANDBY", "var(--color-dark-dim)"];
  }
}

export default function AiEditUpload({ onStarted, onOpenEdit, onOpenList, onNeedAuth }) {
  const reduce = useReducedMotion();
  const uid = useId();
  const up = useUpload();
  const now = useNow();
  const recent = useSyncExternalStore(subscribeRecent, getRecentSnapshot, getRecentSnapshot);

  const [caps, setCaps] = useState(null);
  const [capsAuth, setCapsAuth] = useState(false);
  const [server, setServer] = useState({ settled: false, ok: false, projects: [] });
  const [settings, setSettings] = useState(cloneDefaults);
  const [consent, setConsent] = useState(false);
  const [open, setOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [logo, setLogo] = useState(null);
  const [logoError, setLogoError] = useState(null);

  const alive = useRef(false);
  const consentRef = useRef(null);
  const logoInputRef = useRef(null);
  const privacyCloseRef = useRef(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const startedRef = useRef(onStarted);
  useEffect(() => { startedRef.current = onStarted; }, [onStarted]);

  // Hand the new edit to the session the moment the upload lands — but only when this screen saw it
  // land. Coming back after it finished elsewhere shows TAKE RECEIVED instead of yanking the page.
  useEffect(() => {
    let prev = getUploadSnapshot().phase;
    return subscribeUpload(() => {
      const s = getUploadSnapshot();
      if (s.phase === "started" && s.projectId && (prev === "uploading" || prev === "verifying")) startedRef.current?.(s.projectId);
      prev = s.phase;
    });
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    getCapabilities({ signal: ac.signal })
      .then((c) => setCaps(c))
      .catch((err) => { if (err?.status === 401) setCapsAuth(true); });
    listEdits({ limit: 12, signal: ac.signal })
      .then((res) => setServer({ settled: true, ok: true, projects: Array.isArray(res?.projects) ? res.projects : [] }))
      .catch((err) => { if (err?.name !== "AbortError") setServer({ settled: true, ok: false, projects: [] }); });
    return () => ac.abort();
  }, []);

  // The logo preview is a blob URL owned by this screen.
  useEffect(() => () => { if (logo?.url) URL.revokeObjectURL(logo.url); }, [logo]);

  const limits = { ...DEFAULT_LIMITS, ...(caps?.limits || {}) };
  const logoLimits = { maxBytes: caps?.limits?.logo?.maxBytes ?? LOGO_LIMITS.maxBytes, types: caps?.limits?.logo?.types ?? LOGO_LIMITS.types };
  const languages = Array.isArray(caps?.languages) && caps.languages.length ? caps.languages : LANGUAGES;
  const busy = isBusy(up);
  const canStart = ["ready", "failed", "cancelled"].includes(up.phase);
  const locked = busy || up.phase === "started";
  const consentIssue = up.issues.find((i) => i.code === "CONSENT_MISSING");
  const dropIssues = up.issues.filter((i) => i.code !== "CONSENT_MISSING");
  const statusLine = uploadStatusLine(up);
  const [headText, headColor] = bayStatus(up);

  const put = (path, value) => setSettings((s) => setPath(s, path, value));

  const onFile = (file) => { checkFile(file, { limits }); };

  const begin = async () => {
    const chosenLogo = logo?.file || null;
    const payload = settings;
    const agreed = consent;
    // Navigation on success happens in the upload-store subscription below, so it also works when
    // this screen was left and re-entered while the bytes were still going.
    const id = await start({ settings: payload, logo: chosenLogo, consent: agreed });
    if (!id && !agreed && alive.current) consentRef.current?.focus();
  };

  const loginThenRetry = () => {
    const chosenLogo = logo?.file || null;
    const payload = settings;
    onNeedAuth?.(() => {
      if (alive.current) { begin(); return; }
      // Auth replaced this screen: resume the upload in the store and show it on My edits.
      start({ settings: payload, logo: chosenLogo, consent: true });
      onOpenList?.();
    });
  };

  const pickLogo = (file) => {
    if (!file) return;
    if (!logoLimits.types.includes(file.type)) {
      setLogoError(`That's a **${extOf(file.name) || file.type || "unknown"}** file. Logos can be PNG, JPG or WEBP.`);
      return;
    }
    if (file.size > logoLimits.maxBytes) {
      setLogoError(`This logo is **${fmtBytes(file.size)}**. Logos can be up to **${fmtBytes(logoLimits.maxBytes)}**.`);
      return;
    }
    setLogoError(null);
    setLogo({ file, url: URL.createObjectURL(file) });
  };

  const toggleConsent = (checked) => {
    setConsent(checked);
    if (checked) clearConsentIssue();
  };

  // Continue strip: this browser's recent edits first (enriched and filtered by the server list when
  // it answered), then the newest server edits, three at most.
  const strip = [];
  if (server.settled) {
    const byId = new Map(server.projects.map((p) => [p.id, p]));
    for (const r of recent) {
      if (strip.length >= 3) break;
      const p = byId.get(r.id);
      if (server.ok && !p) continue;
      strip.push(p || { id: r.id, title: r.title, status: null, updatedAt: r.at });
    }
    for (const p of server.projects) {
      if (strip.length >= 3) break;
      if (!strip.some((s) => s.id === p.id)) strip.push(p);
    }
  }

  const captionStyle = settings.captions.enabled ? settings.captions.styleId : "off";
  const fillersOn = settings.removeFillers !== "off";
  const consentId = `kf-up-consent-${uid}`;
  const consentErrId = `${consentId}-err`;
  const customizeId = `kf-up-customize-${uid}`;
  const logoErrId = `kf-up-logo-err-${uid}`;
  const pct = up.progress?.pct ?? 0;

  const rise = (delay = 0) => (reduce ? {} : { initial: { opacity: 0, y: 36 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, ease: EASE, delay } });

  return (
    <div className="pb-24">
      <style href="kf-ai-edit-upload" precedence="kf">{CSS}</style>
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(16px,3vw,40px) clamp(16px,4vw,60px) 0" }}>
        <span className="scene-pill" style={{ "--tagc": "#e832a8" }}>SC 01 · THE FOOTAGE</span>
        <h1 className="headline" style={{ fontSize: "clamp(34px,5.4vw,72px)" }}>
          Drop the take.<br /><span style={{ color: "var(--color-mag)" }}>We'll make the cut.</span>
        </h1>
        <p style={{ marginTop: 16, maxWidth: 560, fontSize: 16, lineHeight: 1.6, color: "var(--color-dim)" }}>
          Record yourself talking. KEYFRAME transcribes it, trims the dead air, adds B-roll, captions and music — then hands you an edit you can change.
        </p>

        {strip.length > 0 && (
          <nav aria-label="Continue an edit" style={{ marginTop: 26 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <span className="label-mono">Continue where you left off</span>
              <button type="button" className="link-mono" onClick={onOpenList} style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>All my edits →</button>
            </div>
            <ul className="kf-up-strip">
              {strip.map((p) => (
                <li key={p.id} style={{ minWidth: 0 }}>
                  <button type="button" className="kf-up-strip-btn" onClick={() => onOpenEdit?.(p.id)}>
                    <span aria-hidden="true" style={{ position: "relative", width: 40, height: 48, flexShrink: 0, borderRadius: 8, overflow: "hidden", background: "var(--color-dark-2)" }}>
                      {p.posterUrl
                        ? <img src={mediaSrc(p.id, "poster")} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span className="film-drift" style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #e832a8, #6b1050 55%, #2a0a20)", opacity: 0.75 }} />}
                      <span className="film-scan" style={{ opacity: 0.3 }} />
                    </span>
                    <span style={{ minWidth: 0, flex: 1, display: "grid", gap: 5 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--color-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title || "Untitled take"}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        {p.status ? <span style={{ display: "flex", minWidth: 0, flex: "0 1 auto", overflow: "hidden" }}><EditStatusBadge badge={statusBadge(p)} /></span> : null}
                        {p.updatedAt ? <span className="label-mono" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{fmtWhen(p.updatedAt, now)}</span> : null}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="kf-up-grid" data-demo-grid="1" style={{ marginTop: strip.length ? 26 : 40 }}>
          {/* ---------- left: the edit bay ---------- */}
          <motion.div {...rise(0)} className="editor-card kf-up-bay kf-fit-head" style={{ minWidth: 0 }}>
            <PanelHead title="KEYFRAME — EDIT BAY" status={headText} statusColor={headColor} />
            <div style={{ padding: "clamp(16px,2.4vw,24px)", display: "grid", gap: 18 }}>
              <UploadDropzone
                file={up.file}
                meta={up.meta}
                issues={dropIssues}
                statusText={statusLine}
                limitsText={UPLOAD_COPY.limits(limits)}
                disabled={locked}
                onFile={onFile}
                onRemove={locked ? undefined : () => reset()}
              />

              {up.phase === "checking" && (
                <ProgressBar indeterminate label="Reading the file" valueText="READING THE FILE…" announce={false} />
              )}

              {busy && (
                <div style={{ display: "grid", gap: 10 }}>
                  <ProgressBar
                    value={pct}
                    indeterminate={up.phase === "verifying"}
                    label="Upload"
                    valueText={statusLine}
                  />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span aria-hidden="true" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-dark-ink)", fontVariantNumeric: "tabular-nums" }}>
                      {statusLine}
                    </span>
                    {up.phase === "uploading" && (
                      <button type="button" className="btn-outline-dark btn-sm" onClick={() => cancel()} style={{ minHeight: 44 }}>
                        Cancel upload
                      </button>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--color-dark-dim)" }}>
                    You can leave this page — the upload keeps going and the AI EDIT chip counts it.
                  </p>
                </div>
              )}

              {up.phase === "failed" && up.error && (
                <div role="alert" style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,106,60,.35)", background: "rgba(216,39,27,.10)" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "#ff6a3c" }}>✕ {up.error.title}</div>
                  <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.55, color: "var(--color-dark-ink)" }}><RichText text={up.error.message} /></p>
                  {up.error.needAuth && (
                    <button type="button" className="btn-ink on-dark" onClick={loginThenRetry} style={{ marginTop: 10, minHeight: 44 }}>Log in</button>
                  )}
                </div>
              )}

              {up.phase === "cancelled" && (
                <p role="status" style={{ margin: 0, fontSize: 14, color: "var(--color-dark-dim)" }}>Upload cancelled. Start again when you're ready — nothing was sent.</p>
              )}

              {capsAuth && up.phase !== "failed" && (
                <div role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 14, color: "var(--color-dark-ink)" }}>
                  <span>{UPLOAD_COPY.sessionEnded}</span>
                  <button type="button" className="btn-ink on-dark" onClick={() => onNeedAuth?.(() => { if (alive.current) setCapsAuth(false); })} style={{ minHeight: 44 }}>Log in</button>
                </div>
              )}

              {up.phase === "started" ? (
                <div role="status" style={{ display: "grid", gap: 12, padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(185,242,74,.35)", background: "rgba(185,242,74,.08)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "var(--color-lm)" }}>✓ TAKE RECEIVED</span>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--color-dark-ink)" }}>
                    <strong style={{ fontWeight: 700 }}>{up.project?.title || up.file?.name || "Your take"}</strong> is in. We're reading it now.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                    <button type="button" className="btn-ink on-dark" onClick={() => onOpenEdit?.(up.projectId)} style={{ minHeight: 44 }}>Open the edit →</button>
                    <button type="button" className="link-mono on-dark" onClick={() => reset()} style={{ minHeight: 44 }}>Upload another take</button>
                  </div>
                </div>
              ) : !busy && (
                <>
                  <div style={{ display: "grid", gap: 8 }}>
                    <div className="kf-up-consent" style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 12, border: `1px solid ${consentIssue ? "rgba(255,106,60,.6)" : "rgba(242,237,226,.12)"}`, background: "var(--color-dark)" }}>
                      <input
                        ref={consentRef}
                        id={consentId}
                        type="checkbox"
                        required
                        checked={consent}
                        onChange={(e) => toggleConsent(e.target.checked)}
                        aria-invalid={consentIssue ? true : undefined}
                        aria-describedby={consentIssue ? consentErrId : undefined}
                        style={{ marginTop: 2 }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <label htmlFor={consentId} style={{ display: "block", cursor: "pointer", fontSize: 14, lineHeight: 1.55, color: "var(--color-dark-ink)" }}>
                          {UPLOAD_COPY.consent}
                        </label>
                        <button type="button" className="link-mono on-dark" onClick={() => setPrivacyOpen(true)} style={{ marginTop: 6, minHeight: 44, display: "inline-flex", alignItems: "center", textTransform: "none", letterSpacing: "0.04em", fontSize: 12 }}>
                          How we handle your video
                        </button>
                      </div>
                    </div>
                    <div role="alert">
                      {consentIssue && (
                        <p id={consentErrId} style={{ margin: 0, display: "flex", gap: 8, fontSize: 14, lineHeight: 1.55, color: "var(--color-dark-ink)" }}>
                          <span aria-hidden="true" style={{ color: "#ff6a3c" }}>✕</span>{consentIssue.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 16px" }}>
                    <button type="button" className="btn-mag btn-big kf-up-cta" disabled={!canStart} onClick={begin}>
                      {up.phase === "failed" ? "Try the upload again →" : "Start AI edit →"}
                    </button>
                    {!canStart && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-dark-dim)" }}>
                        {up.phase === "rejected" ? "REMOVE THE FILE AND CHOOSE ANOTHER" : up.phase === "checking" ? "READING THE FILE…" : "CHOOSE A TAKE TO START"}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>

          {/* ---------- right: what you'll get + customize ---------- */}
          <motion.aside {...rise(0.08)} className="card" aria-labelledby={`kf-up-get-${uid}`} style={{ minWidth: 0, padding: "clamp(18px,2.4vw,26px)", overflow: "hidden" }}>
            <span className="spine" style={{ "--spine": "var(--color-mag)" }} />
            <h2 id={`kf-up-get-${uid}`} className="label-mono" style={{ margin: 0, color: "var(--color-ink)", fontSize: 11, letterSpacing: "0.3em" }}>What you'll get</h2>
            <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "grid", gap: 8 }}>
              {WHAT_YOU_GET.map((label) => {
                const on = label === "Logo" ? !!logo : (GOT_ON[label]?.(settings) ?? true);
                return (
                  <li key={label} style={{ display: "flex", alignItems: "baseline", gap: 10, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, lineHeight: 1.3, color: on ? "var(--color-ink)" : "var(--color-dim)" }}>
                    <span aria-hidden="true" style={{ width: 16, flexShrink: 0, fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 13, color: on ? "var(--color-mag)" : "var(--color-dim)" }}>{on ? "✓" : "○"}</span>
                    <span style={{ textDecoration: on || label === "Logo" ? "none" : "line-through" }}>{label}</span>
                    {!on && <span style={{ fontFamily: "var(--font-mono)", fontWeight: 400, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>{label === "Logo" ? "optional" : "off"}</span>}
                  </li>
                );
              })}
            </ul>
            <p style={{ margin: "16px 0 0", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", lineHeight: 1.8, color: "var(--color-dim)" }}>
              {defaultsLine(settings, { sourceAspect: up.meta?.aspect || null })}
            </p>

            <button
              type="button"
              aria-expanded={open}
              aria-controls={customizeId}
              onClick={() => setOpen((o) => !o)}
              className="btn-chip"
              style={{ marginTop: 16, minHeight: 44 }}
            >
              <span aria-hidden="true" style={{ display: "inline-block", transition: "transform .3s cubic-bezier(.16,1,.3,1)", transform: open ? "rotate(90deg)" : "none" }}>▸</span>
              Customize
            </button>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  key="customize"
                  id={customizeId}
                  initial={reduce ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  style={{ overflow: "hidden" }}
                >
                  <fieldset disabled={locked} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                    {locked && (
                      <p style={{ margin: "14px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--color-dim)" }}>
                        These settings went out with the upload — change anything later in the editor.
                      </p>
                    )}

                    <fieldset className="kf-up-fieldset">
                      <legend className="kf-up-legend">Picture</legend>
                      <RadioChips label="Format" value={settings.output.aspect} options={FORMAT_OPTIONS} onChange={(v) => put(["output", "aspect"], v)} onDark={false} variant="tile" />
                    </fieldset>

                    <fieldset className="kf-up-fieldset">
                      <legend className="kf-up-legend">Captions</legend>
                      <RadioChips
                        label="Caption style"
                        value={captionStyle}
                        options={CAPTION_STYLE_OPTIONS}
                        onChange={(v) => setSettings((s) => (v === "off" ? setPath(s, ["captions", "enabled"], false) : setPath(setPath(s, ["captions", "enabled"], true), ["captions", "styleId"], v)))}
                        onDark={false}
                        variant="tile"
                      />
                      <RadioChips label="Words per line" value={settings.captions.maxWordsPerLine} options={WORDS_PER_LINE_OPTIONS} onChange={(v) => put(["captions", "maxWordsPerLine"], v)} onDark={false} disabled={!settings.captions.enabled} />
                      <LanguageSelect value={settings.captions.language} onChange={(v) => put(["captions", "language"], v)} languages={languages} onDark={false} disabled={!settings.captions.enabled} hint={settings.captions.language === "auto" ? null : "Captions are translated when this differs from what you say."} />
                    </fieldset>

                    <fieldset className="kf-up-fieldset">
                      <legend className="kf-up-legend">Brand</legend>
                      <BrandPalettePicker value={settings.brand.palette} onChange={(v) => put(["brand", "palette"], v)} onDark={false} />
                      <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
                        <span className="label-mono" id={`kf-up-logo-label-${uid}`}>Logo</span>
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          tabIndex={-1}
                          aria-hidden="true"
                          className="sr-only"
                          onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ""; }}
                        />
                        {logo ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, padding: 8, borderRadius: 12, border: "1px solid rgba(23,19,14,.12)", background: "var(--color-paper-2)" }}>
                            <img src={logo.url} alt="" style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 8, background: "var(--color-ground-2)", flexShrink: 0 }} />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{logo.file.name}</span>
                              <span className="label-mono">{fmtBytes(logo.file.size)}</span>
                            </span>
                            <button type="button" className="btn-chip" onClick={() => logoInputRef.current?.click()} style={{ minHeight: 44 }}>Replace</button>
                            <button type="button" className="btn-chip" aria-label={`Remove logo ${logo.file.name}`} onClick={() => setLogo(null)} style={{ minHeight: 44 }}>Remove</button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn-chip"
                            aria-describedby={`kf-up-logo-hint-${uid}${logoError ? ` ${logoErrId}` : ""}`}
                            onClick={() => logoInputRef.current?.click()}
                            style={{ minHeight: 44, justifySelf: "start" }}
                          >
                            + Add logo
                          </button>
                        )}
                        <span id={`kf-up-logo-hint-${uid}`} style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>PNG · JPG · WEBP · UP TO {fmtBytes(logoLimits.maxBytes)}</span>
                        <div role="alert">
                          {logoError && <p id={logoErrId} style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--color-rec)" }}><RichText text={logoError} /></p>}
                        </div>
                        {logo && (
                          <RadioChips label="Logo corner" value={settings.brand.logo.placement} options={LOGO_CORNERS} onChange={(v) => put(["brand", "logo", "placement"], v)} onDark={false} />
                        )}
                      </div>
                    </fieldset>

                    <fieldset className="kf-up-fieldset">
                      <legend className="kf-up-legend">Sound</legend>
                      <Switch label="Music" description="A licensed bed that ducks under your voice" checked={settings.music.enabled} onChange={(v) => put(["music", "enabled"], v)} onDark={false} />
                    </fieldset>

                    <fieldset className="kf-up-fieldset">
                      <legend className="kf-up-legend">The cut</legend>
                      <RadioChips label="B-roll" value={settings.broll.intensity} options={BROLL_OPTIONS} onChange={(v) => put(["broll", "intensity"], v)} onDark={false} variant="tile" />
                      <RadioChips label="Effects" value={settings.effects.intensity} options={EFFECTS_OPTIONS} onChange={(v) => put(["effects", "intensity"], v)} onDark={false} />
                      <div style={{ display: "grid", gap: 10 }}>
                        <Switch label="Remove fillers" checked={fillersOn} onChange={(v) => put(["removeFillers"], v ? "light" : "off")} onDark={false} />
                        {fillersOn && <RadioChips label="Which fillers" hideLabel value={settings.removeFillers} options={FILLER_OPTIONS} onChange={(v) => put(["removeFillers"], v)} onDark={false} />}
                      </div>
                      <div style={{ display: "grid", gap: 10 }}>
                        <Switch label="Remove silence" checked={settings.removeSilence.enabled} onChange={(v) => put(["removeSilence", "enabled"], v)} onDark={false} />
                        {settings.removeSilence.enabled && <RadioChips label="Pace" hideLabel value={settings.removeSilence.pace} options={PACE_OPTIONS} onChange={(v) => put(["removeSilence", "pace"], v)} onDark={false} />}
                      </div>
                      <Switch label="Auto jump cuts" description="Punch-in hides the cut" checked={settings.effects.autoJumpCuts} onChange={(v) => put(["effects", "autoJumpCuts"], v)} onDark={false} />
                    </fieldset>

                    <div style={{ marginTop: 18 }}>
                      <button type="button" className="link-mono" onClick={() => { setSettings(cloneDefaults()); setLogo(null); setLogoError(null); }} style={{ minHeight: 44 }}>
                        ↺ Back to defaults
                      </button>
                    </div>
                  </fieldset>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.aside>
        </div>
      </section>

      <Dialog
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        scene="PRIVACY"
        title="How we handle your video"
        description="What leaves KEYFRAME to make your edit, who gets it, and how to remove it."
        initialFocusRef={privacyCloseRef}
        width={600}
        actions={<button ref={privacyCloseRef} type="button" className="btn-ink on-dark" onClick={() => setPrivacyOpen(false)} style={{ minHeight: 44 }}>Got it</button>}
      >
        <div style={{ display: "grid", gap: 18 }}>
          {[
            ["What is sent", [
              "Your audio, in short segments, to a speech model that writes the transcript.",
              "Small still frames sampled from the video — 640 px or smaller — so a vision model can find your face and framing.",
              "The transcript text, so a language model can find the topics, the hook and the lines worth illustrating.",
              "The full video file is never sent.",
            ]],
            ["Who receives it", [
              "OpenRouter and KIE, and the AI model providers behind them that run each request.",
            ]],
            ["What is stored", [
              "On KEYFRAME: your source video, a small preview proxy, the analysis (transcript, pauses, face track), your edit and its revisions, preview renders and exports.",
            ]],
            ["How to delete", [
              "Delete edit removes everything — the upload, the edit and its exports. It's on every card in My edits.",
            ]],
          ].map(([heading, lines]) => (
            <section key={heading}>
              <h3 style={{ margin: 0, fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--color-cy)" }}>{heading}</h3>
              <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                {lines.map((l) => (
                  <li key={l} style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.55, color: "var(--color-dark-ink)" }}>
                    <span aria-hidden="true" style={{ color: "var(--color-dark-dim)", flexShrink: 0 }}>›</span>{l}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Dialog>
    </div>
  );
}
