import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  adminAddIssue, adminArchive, adminDeleteTemplate, adminGenerate, adminGetTemplate, adminNewVersion,
  adminPreview, adminPublish, adminQa, adminRollback, adminSetIssueStatus, adminTest, adminUnpublish,
  adminUpdateTemplate, mediaUrl, subscribeTemplate,
} from "../api.js";
import { aspectLabel, fmtWhen, statusMeta } from "./AdminTemplates.jsx";

// TEMPLATE REVIEW — everything the server knows about one template, and every act it permits.
//
// THE ACTION BAR IS RENDERED FROM `template.actions`, WHICH THE SERVER OWNS.
//
// That is the single most important rule in this file. lifecycle.js holds ONE transition table
// and ONE action table; the store refuses an illegal write, the router refuses an illegal
// request, and this screen offers only what the response says is legal. The moment this file
// starts deciding for itself ("show Publish when status is READY_TO_PUBLISH") there are two
// copies of the state machine, they drift, and the symptom is a button that exists and 409s.
// So the map below carries LABELS AND HANDLERS per action id — never the question of whether
// the action is allowed.
//
// The publish gate is the one place in this feature that fails CLOSED: a blocked publish
// answers 409 with a structured blocker list, and every blocker is shown VERBATIM, with its
// fix. Summarising them would throw away the only text that says what to do next.

const isLive = (t) => !!(t && (t.busy || t.status === "GENERATING" || t.status === "TESTING"));

// Issue severity, read at a glance. Critical and high are the two that should stop a publish
// conversation, so they get the alarm colours the rest of this screen reserves for failures.
const SEVERITY_COLOR = {
  critical: "#c8452d", high: "#c8452d", medium: "#b8860b", low: "var(--color-dim)",
};

// action id -> how it reads and what it calls. `heavy` actions answer 202 and then stream.
const ACTIONS = {
  edit: { label: "Edit metadata", kind: "chip" },
  generate: { label: "Generate", kind: "primary", run: adminGenerate, heavy: true },
  regenerate: {
    label: "Regenerate", kind: "chip", run: adminGenerate, heavy: true,
    confirm: "Regenerate this template? The current design, composer module and stills are replaced.",
  },
  retry: { label: "Retry generation", kind: "primary", run: adminGenerate, heavy: true },
  preview: { label: "Refresh stills", kind: "chip", run: adminPreview, heavy: true },
  qa: { label: "Run quality checks", kind: "chip", run: adminQa, heavy: true },
  test: { label: "Test render", kind: "chip" },
  publish: {
    label: "Publish", kind: "primary", run: adminPublish, heavy: true,
    confirm: "Publish this template? It becomes visible to every user in the template gallery.",
  },
  unpublish: {
    label: "Unpublish", kind: "chip", run: adminUnpublish,
    confirm: "Unpublish this template? It disappears from the public gallery immediately.",
  },
  archive: {
    label: "Archive", kind: "chip", run: adminArchive,
    confirm: "Archive this template? Archived is terminal — it can only be re-entered as a new version.",
  },
  // THE POST-PUBLISH FIX. Clones this version into a new row and directory; what is live is not
  // touched. The handler follows the answer to the NEW record, because that is what the admin is
  // about to work on.
  newVersion: {
    label: "Create new version", kind: "primary", run: adminNewVersion,
    confirm: "Create a new version from this one? The live version keeps serving users untouched while you fix the copy.",
  },
  rollback: {
    label: "Roll back to this version", kind: "primary", run: adminRollback,
    confirm: "Make this version live again? Whatever is currently published is superseded, not deleted.",
  },
  reportIssue: { label: "Report an issue", kind: "chip" },
  delete: { label: "Delete", kind: "danger", confirm: "Delete this template? Its source files, pack directory and media are removed. This cannot be undone." },
  // lifecycle.js lists `cancel` for GENERATING and TESTING, but the admin API exposes no cancel
  // route — there is nothing to call. Rendered disabled WITH THE REASON rather than hidden: a
  // silently missing action reads as a UI bug when the state table plainly offers it.
  cancel: { label: "Cancel", kind: "chip", disabled: "The API has no cancel route yet — the run finishes or fails on its own." },
  viewError: { label: "View error", kind: "chip" },
};

export default function AdminTemplateDetail({ templateId, onBack, onOpenTemplate, onOpenProject }) {
  const [t, setT] = useState(null);
  const [versions, setVersions] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [scenario, setScenario] = useState("prompt-only");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [blocking, setBlocking] = useState(null);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(null);
  // The issue recorder. Its vocabulary comes from the server (store.ISSUE_CATEGORIES/SEVERITIES)
  // so there is no second copy of the list to drift.
  const [reporting, setReporting] = useState(false);
  const [issueCategories, setIssueCategories] = useState(["layout", "typography", "animation", "assets", "brand", "responsive", "audio", "rendering", "performance", "other"]);
  const [issueSeverities, setIssueSeverities] = useState(["low", "medium", "high", "critical"]);
  const [issueDraft, setIssueDraft] = useState({ title: "", category: "layout", severity: "medium", suggestedFix: "" });
  const errorRef = useRef(null);
  const unsub = useRef(null);

  // Fold one GET response into state. Split out from the fetch so the mount effect can apply it
  // in a promise callback (and only while still mounted) rather than calling a state-setting
  // function straight from the effect body.
  const apply = useCallback((r) => {
    setT(r.template);
    setVersions(r.versions || []);
    if (Array.isArray(r.scenarios) && r.scenarios.length) {
      setScenarios(r.scenarios);
      setScenario((s) => (r.scenarios.some((x) => x.id === s) ? s : r.scenarios[0].id));
    }
    // The blocker list is re-read from the record on every refresh: `publishBlocking` is
    // persisted by the server, so a blocked publish stays explained after a reload instead of
    // living only in the memory of the tab that attempted it.
    setBlocking(r.template.publishBlocking || null);
    if (Array.isArray(r.issueCategories) && r.issueCategories.length) setIssueCategories(r.issueCategories);
    if (Array.isArray(r.issueSeverities) && r.issueSeverities.length) setIssueSeverities(r.issueSeverities);
    return r.template;
  }, []);

  const refresh = useCallback(async () => {
    if (!templateId) return null;
    try { return apply(await adminGetTemplate(templateId)); }
    catch (e) { setError(e.message); return null; }
  }, [templateId, apply]);

  useEffect(() => {
    if (!templateId) return undefined;
    let alive = true;
    adminGetTemplate(templateId)
      .then((r) => { if (alive) apply(r); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [templateId, apply]);

  // Stream while something is running, and stop the moment it is not. Same reasoning as the
  // generator screen: the server only ends the stream on PUBLISHED / FAILED / ARCHIVED, so a
  // template settling on GENERATED or READY_TO_PUBLISH would stream forever.
  const live = isLive(t);
  useEffect(() => {
    if (!templateId || !live) return undefined;
    unsub.current = subscribeTemplate(templateId, {
      onUpdate: (rec) => {
        setT(rec);
        if (!isLive(rec)) { unsub.current?.(); unsub.current = null; refresh(); }
      },
      onClose: () => { unsub.current = null; refresh(); },
    });
    return () => { unsub.current?.(); unsub.current = null; };
  }, [templateId, live, refresh]);

  async function act(id) {
    const meta = ACTIONS[id];
    if (!meta || meta.disabled) return;

    if (id === "edit") { setEditing((v) => !v); return; }
    if (id === "reportIssue") { setReporting((v) => !v); return; }
    if (id === "viewError") { errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (meta.confirm && !window.confirm(meta.confirm)) return;

    setPending(id); setError(null); setNotice(null);
    try {
      if (id === "delete") {
        await adminDeleteTemplate(t.id);
        onBack?.();
        return;
      }
      if (id === "test") {
        const r = await adminTest(t.id, scenario);
        setNotice(`Test render queued as project ${r.projectId}. It runs through the real pipeline — watch it in the studio.`);
        await refresh();
        return;
      }
      const r = await meta.run(t.id);
      // A 202 carries the record as it was at that instant, which is worth showing immediately;
      // the stream (or the refresh below) then takes over.
      if (r && r.template) setT(r.template);
      setBlocking(null);
      if (!meta.heavy) await refresh();
      // newVersion returns the NEW row, not this one — following it is the only sensible
      // outcome of the click.
      if (id === "newVersion" && r && r.template && r.template.id !== t.id) onOpenTemplate?.(r.template.id);
      if (id === "rollback") setNotice(`v${t.version} is live again${r && r.superseded ? `; v${r.superseded.version} is superseded` : ""}.`);
    } catch (e) {
      setError(e.message);
      // The publish gate's structured refusal. Kept whole.
      if (Array.isArray(e.blocking) && e.blocking.length) setBlocking(e.blocking);
      await refresh();
    } finally { setPending(null); }
  }

  async function saveIssue() {
    if (!issueDraft.title.trim()) return;
    setError(null);
    try {
      const r = await adminAddIssue(t.id, issueDraft);
      if (r && r.template) setT(r.template);
      setIssueDraft({ title: "", category: issueDraft.category, severity: issueDraft.severity, suggestedFix: "" });
      setReporting(false);
      setNotice("Issue recorded. It travels to the next version you create from this one.");
    } catch (e) { setError(e.message); }
  }

  async function toggleIssue(issue) {
    setError(null);
    try {
      const r = await adminSetIssueStatus(t.id, issue.id, issue.status === "resolved" ? "open" : "resolved");
      if (r && r.template) setT(r.template);
    } catch (e) { setError(e.message); }
  }

  if (!t) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(20px,4vw,50px) clamp(16px,4vw,60px)" }}>
        <button className="link-mono" onClick={onBack}>← TEMPLATE LIBRARY</button>
        <p style={{ marginTop: 26, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: error ? "var(--color-rec)" : "var(--color-dim)", textTransform: "uppercase" }}>
          {error || "Loading template…"}
        </p>
      </div>
    );
  }

  const m = statusMeta(t.status);
  const poster = mediaUrl(t.thumbnail || (t.stills || [])[0] || null);
  const preview = mediaUrl(t.previewVideo || null);
  const issues = t.issues || [];
  const openIssues = issues.filter((i) => i.status !== "resolved");
  const input = { width: "100%", boxSizing: "border-box", padding: "9px 12px", fontSize: 13.5 };

  return (
    <div className="pb-24">
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(20px,4vw,50px) clamp(16px,4vw,60px) 0" }}>
        <button className="link-mono" onClick={onBack} style={{ marginBottom: 22 }}>← TEMPLATE LIBRARY</button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="scene-pill" style={{ "--tagc": m.c }}>{m.label.toUpperCase()}</span>
          <span className="scene-pill" style={{ "--tagc": "#7d766a" }}>V{t.version}</span>
          <span className="scene-pill" style={{ "--tagc": "#23c8e0" }}>{aspectLabel(t.orientation)}</span>
          {t.isPublic && <span className="scene-pill" style={{ "--tagc": "#22c55e" }}>LIVE TO USERS</span>}
          {t.busy && <span className="scene-pill" style={{ "--tagc": "#ffb03a" }}>● {String(t.busy).toUpperCase()}</span>}
        </div>

        <h1 className="headline" style={{ fontSize: "clamp(32px,5vw,60px)" }}>{t.name}</h1>
        <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--color-dim)" }}>
          <span>{t.slug}</span>
          <span>{t.category || "—"}</span>
          <span>CREATED {fmtWhen(t.createdAt)}</span>
          <span>UPDATED {fmtWhen(t.updatedAt)}</span>
          {t.publishedAt && <span style={{ color: "#22c55e" }}>PUBLISHED {fmtWhen(t.publishedAt)}</span>}
          {t.createdBy && <span>BY {t.createdBy}</span>}
        </div>

        {/* ---- live progress, while something is running ---- */}
        {live && (
          <div className="card" style={{ marginTop: 22, padding: "16px 20px 18px 25px" }}>
            <span className="spine" style={{ "--spine": m.c }} />
            <div className="label-mono" style={{ marginBottom: 8 }}>{(t.progress || t.busy || "working").toUpperCase()}…</div>
            <div style={{ height: 6, borderRadius: 999, background: "rgba(23,19,14,.08)", overflow: "hidden" }}>
              <motion.span style={{ display: "block", height: "100%", borderRadius: 999, background: `linear-gradient(90deg, var(--color-mag), ${m.c})` }}
                animate={{ width: `${Math.max(4, Math.min(100, Number(t.progressPct) || 5))}%` }}
                transition={{ type: "spring", stiffness: 60, damping: 20 }} />
            </div>
          </div>
        )}

        {/* ---- actions, straight from the server's list ---- */}
        <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {(t.actions || []).map((id) => {
            const meta = ACTIONS[id];
            if (!meta) return null;   // an action the server grew and this screen has not learned yet
            const busy = pending === id;
            const off = !!meta.disabled || !!pending || (live && id !== "viewError");
            const cls = meta.kind === "primary" ? "btn-mag" : meta.kind === "danger" ? "btn-chip" : "btn-chip";
            return (
              <button key={id} type="button" onClick={() => act(id)} disabled={off}
                className={cls}
                title={meta.disabled || undefined}
                style={{
                  ...(meta.kind === "primary" ? { padding: "11px 22px", fontSize: 14 } : {}),
                  ...(meta.kind === "danger" ? { color: "var(--color-rec)", borderColor: "rgba(216,39,27,.4)" } : {}),
                  ...(off ? { opacity: 0.45, cursor: "not-allowed" } : {}),
                }}>
                {busy ? "…" : meta.label}
              </button>
            );
          })}
          {/* The scenario picker rides beside the Test button, because a test render is
              meaningless without saying WHICH brief it is rendering. */}
          {(t.actions || []).includes("test") && scenarios.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
              <span className="label-mono">SCENARIO</span>
              <select className="select-field" value={scenario} onChange={(e) => setScenario(e.target.value)}
                aria-label="Test render scenario" style={{ width: "auto", minWidth: 170 }}>
                {scenarios.map((s) => <option key={s.id} value={s.id} title={s.hint}>{s.label}</option>)}
              </select>
            </label>
          )}
        </div>
        {(t.actions || []).includes("test") && scenarios.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-dim)", lineHeight: 1.5, maxWidth: 620 }}>
            {(scenarios.find((s) => s.id === scenario) || {}).hint}
          </div>
        )}

        {notice && <Banner c="#22c55e">{notice}</Banner>}
        {error && <Banner c="#d8271b" innerRef={errorRef}>{error}</Banner>}

        {/* ---- the publish gate's refusal, verbatim ---- */}
        {blocking && blocking.length > 0 && (
          <div className="card" style={{ marginTop: 18, padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": "#d8271b" }} />
            <div className="label-mono" style={{ marginBottom: 4, color: "var(--color-rec)" }}>PUBLISH BLOCKED — {blocking.length} REASON{blocking.length === 1 ? "" : "S"}</div>
            <p style={{ fontSize: 12.5, color: "var(--color-dim)", margin: "0 0 14px", lineHeight: 1.5 }}>
              The gate fails closed: anything it could not verify counts as a failure, never as a pass.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {blocking.map((b, i) => (
                <div key={`${b.id}-${i}`} style={{ borderLeft: "2px solid rgba(216,39,27,.35)", paddingLeft: 12 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.14em", color: "var(--color-rec)" }}>{b.id}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--color-ink)", marginTop: 4 }}>{b.detail}</div>
                  {b.fix && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--color-dim)", marginTop: 4 }}>→ {b.fix}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {t.status === "FAILED" && t.error && (
          <div className="card" style={{ marginTop: 18, padding: "20px 22px 20px 27px" }} ref={errorRef}>
            <span className="spine" style={{ "--spine": "#d8271b" }} />
            <div className="label-mono" style={{ marginBottom: 8, color: "var(--color-rec)" }}>GENERATION ERROR</div>
            <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.65, color: "var(--color-ink)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{t.error}</p>
          </div>
        )}
      </section>

      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "30px clamp(16px,4vw,60px) 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px,1fr))", gap: 16, alignItems: "start" }}>
        {/* ---- PREVIEW ---- */}
        <Panel spine="#e832a8" title="PREVIEW">
          <div style={{ borderRadius: 14, overflow: "hidden", background: "var(--color-ground-2)", aspectRatio: aspectLabel(t.orientation) === "16:9" ? "16 / 9" : aspectLabel(t.orientation) === "1:1" ? "1 / 1" : "9 / 16", maxHeight: 460, display: "grid", placeItems: "center", position: "relative" }}>
            {preview
              // A published template has a real motion preview; before that the stills are all
              // there is. Controls rather than hover-to-play: this is a review surface, and a
              // reviewer needs to scrub.
              ? <video src={preview} poster={poster || undefined} controls muted loop playsInline preload="metadata"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "#0d0b07" }} />
              : poster
                ? <img src={poster} alt={`${t.name} frame`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                : <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", color: "var(--color-dim)", textAlign: "center", padding: "0 20px" }}>
                    NO FRAMES YET — RUN “REFRESH STILLS”
                  </span>}
          </div>
          <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--color-dim)" }}>
            {aspectLabel(t.orientation)} · {t.renderer} · {preview ? "PREVIEW VIDEO" : poster ? "STILL FRAME" : "NO MEDIA"}
          </div>
          {!!(t.stills || []).length && (
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(74px,1fr))", gap: 8 }}>
              {t.stills.map((s, i) => (
                <img key={s} src={mediaUrl(s)} alt={`Frame ${i + 1}`} loading="lazy"
                  style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 8, border: "1px solid rgba(23,19,14,.12)", background: "var(--color-ground-2)" }} />
              ))}
            </div>
          )}
        </Panel>

        {/* ---- METADATA ---- */}
        <Panel spine="#23c8e0" title="METADATA">
          {editing
            ? <EditForm t={t} onCancel={() => setEditing(false)} onSaved={(rec) => { setT(rec); setEditing(false); }} onError={setError} />
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Field label="NAME">{t.name}</Field>
                <Field label="DESCRIPTION" warn={!t.description}>{t.description || "— none yet (a publish blocker)"}</Field>
                <Field label="CATEGORY">{t.category || "—"}</Field>
                <Field label="TAGS">{(t.tags || []).length ? t.tags.join(" · ") : "—"}</Field>
                <Field label="RENDERER">{t.renderer}</Field>
                <Field label="SOURCE" warn={!t.sourceExists || !t.skinExists}>
                  {t.sourcePath}
                  <span style={{ display: "block", fontSize: 11.5, color: t.sourceExists && t.skinExists ? "var(--color-dim)" : "var(--color-rec)", marginTop: 3 }}>
                    {/* MEASURED, not assumed — store.shape() stats the disk on every read, and a
                        missing directory is exactly the condition that blocks a publish. */}
                    pack {t.sourceExists ? "present" : "MISSING"} · composer {t.skinExists ? "present" : "MISSING"} · {t.rootKind} root
                  </span>
                </Field>
                <Field label="PROMPT">
                  <span style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{t.prompt || "—"}</span>
                </Field>
                {t.options && Object.values(t.options).some(Boolean) && (
                  <Field label="OPTIONS">
                    {Object.entries(t.options).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}: ${v}`).join(" · ")}
                  </Field>
                )}
              </div>
            )}
        </Panel>

        {/* ---- CAPABILITIES ---- */}
        <Panel spine="#b9f24a" title="CAPABILITIES"
          empty={!t.capabilities && "Not known until the template is generated."}>
          {t.capabilities && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: "9px 14px" }}>
              {[
                ["supportsBrandColors", "Brand colours"],
                ["supportsLogo", "Logo"],
                ["supportsImages", "Images"],
                ["supportsScreenshots", "Screenshots"],
                ["supportsVideo", "Video assets"],
                ["supportsText", "On-screen text"],
                ["supportsVoiceover", "Voiceover"],
                ["supportsCaptions", "Captions"],
                ["supportsBackgroundMusic", "Music"],
                ["supportsSoundEffects", "Sound effects"],
              ].map(([k, label]) => {
                const on = !!t.capabilities[k];
                return (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: on ? "var(--color-ink)" : "var(--color-dim)" }}>
                    <span style={{ width: 15, height: 15, flex: "none", borderRadius: 5, display: "grid", placeItems: "center", fontSize: 9, background: on ? "#22c55e" : "transparent", color: on ? "#fff" : "var(--color-dim)", border: on ? "none" : "1px dashed rgba(23,19,14,.28)" }}>
                      {on ? "✓" : ""}
                    </span>
                    {label}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* ---- ASSET REQUIREMENTS ---- */}
        <Panel spine="#4ac9f2" title="ASSET REQUIREMENTS"
          empty={!t.assetRequirements && "Not known until the template is generated."}>
          {t.assetRequirements && (
            <>
              <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 14 }}>
                <Stat n={t.assetRequirements.requiredAssetCount} label="required" c="#4ac9f2" />
                <Stat n={t.assetRequirements.preferredAssetCount} label="preferred" c="#23c8e0" />
                <Stat n={(t.assetRequirements.placeholders || []).length} label="slots" c="#8b5cf6" />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--color-dim)", marginBottom: 12 }}>
                {/* The stage is printed with the pixel sizes, never without: the same box scores
                    completely differently against another resolution, so a width in isolation
                    is not a measurement. */}
                STAGE {t.assetRequirements.stage?.width}×{t.assetRequirements.stage?.height} · {t.assetRequirements.addressing} ADDRESSING · ×{t.assetRequirements.oversample} OVERSAMPLE
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--color-dim)", letterSpacing: "0.1em" }}>
                      {["SLOT", "TYPE", "N", "SIZE", "PRIORITY"].map((h) => (
                        <th key={h} style={{ padding: "6px 10px 6px 0", fontWeight: 500, borderBottom: "1px solid rgba(23,19,14,.1)", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(t.assetRequirements.placeholders || []).map((p) => (
                      <tr key={p.id}>
                        <td style={{ padding: "7px 10px 7px 0", color: "var(--color-ink)", borderBottom: "1px solid rgba(23,19,14,.06)" }}>{p.role}</td>
                        <td style={{ padding: "7px 10px 7px 0", color: "var(--color-dim)", borderBottom: "1px solid rgba(23,19,14,.06)" }}>{p.type}</td>
                        <td style={{ padding: "7px 10px 7px 0", color: "var(--color-dim)", borderBottom: "1px solid rgba(23,19,14,.06)" }}>{p.count}</td>
                        <td style={{ padding: "7px 10px 7px 0", color: "var(--color-dim)", borderBottom: "1px solid rgba(23,19,14,.06)", whiteSpace: "nowrap" }}>{p.width}×{p.height}{p.aspect ? ` (${p.aspect})` : ""}</td>
                        <td style={{ padding: "7px 10px 7px 0", borderBottom: "1px solid rgba(23,19,14,.06)", color: p.priority === "critical" ? "var(--color-rec)" : p.priority === "high" ? "#ff9f43" : "var(--color-dim)" }}>{p.priority}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>

        {/* ---- AUDIO ---- */}
        <Panel spine="#8a63ff" title="AUDIO" empty={!t.audio && "Not known until the template is generated."}>
          {t.audio && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="MOOD">{t.audio.mood || "—"}</Field>
              <Field label="ENERGY">{t.audio.energy || "—"}</Field>
              <Field label="MUSIC KEYWORDS">
                {(t.audio.musicKeywords || []).length
                  ? <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {t.audio.musicKeywords.map((k) => <Tag key={k} c="#8a63ff">{k}</Tag>)}
                    </span>
                  : "— none (the script's own mood is used instead)"}
              </Field>
              <Field label="SFX PALETTE">
                {Object.keys(t.audio.sfxPalette || {}).length
                  ? <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {Object.entries(t.audio.sfxPalette).map(([k, v]) => <Tag key={k} c="#23c8e0">{k} → {v}</Tag>)}
                    </span>
                  : "— none (every cue is decided per scene)"}
              </Field>
            </div>
          )}
        </Panel>

        {/* ---- QA ---- */}
        <Panel spine={t.qa ? (t.qa.verdict === "fail" ? "#d8271b" : t.qa.verdict === "warn" ? "#ffb03a" : "#22c55e") : "#7d766a"}
          title="QUALITY REPORT" empty={!t.qa && "No quality run yet. Use “Run quality checks”."}>
          {t.qa && <QaReport qa={t.qa} />}
        </Panel>

        {/* ---- TEST RENDERS ---- */}
        <Panel spine="#ff6a3c" title="TEST RENDERS" empty={!(t.tests || []).length && "No test render yet. A test makes a real film through the real pipeline."}>
          {!!(t.tests || []).length && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {t.tests.slice(0, 8).map((x) => (
                <div key={`${x.projectId}-${x.at}`} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingBottom: 9, borderBottom: "1px solid rgba(23,19,14,.07)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.08em", color: "var(--color-ink)" }}>{x.scenario || "—"}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>{fmtWhen(x.at)}</span>
                  <button className="link-mono" style={{ marginLeft: "auto" }} onClick={() => onOpenProject?.(x.projectId)}>WATCH →</button>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* ---- KNOWN ISSUES ----
            What a real film taught us about this template. Recorded against the version it was
            seen on and carried onto the version created to fix it — which is why a defect first
            seen on v1 still says so when you are looking at v4. */}
        <Panel
          spine="#c8452d"
          title={`KNOWN ISSUES${openIssues.length ? ` — ${openIssues.length} OPEN` : ""}`}
          empty={!issues.length && "Nothing recorded. Generate a real film with this template and log what you see."}
        >
          {!!issues.length && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {issues.map((i) => (
                <div key={i.id} style={{ paddingBottom: 11, borderBottom: "1px solid rgba(23,19,14,.07)", opacity: i.status === "resolved" ? 0.5 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: SEVERITY_COLOR[i.severity] || "var(--color-dim)" }}>{i.severity}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-dim)" }}>{i.category}</span>
                    {i.fromVersion !== t.version && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>SEEN ON V{i.fromVersion}</span>
                    )}
                    <button className="link-mono" style={{ marginLeft: "auto" }} onClick={() => toggleIssue(i)}>
                      {i.status === "resolved" ? "REOPEN" : "MARK FIXED"}
                    </button>
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 5, textDecoration: i.status === "resolved" ? "line-through" : "none" }}>{i.title}</div>
                  {!!i.suggestedFix && <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--color-dim)", marginTop: 3 }}>Fix: {i.suggestedFix}</div>}
                </div>
              ))}
            </div>
          )}
          {reporting && (
            <div style={{ marginTop: issues.length ? 14 : 0, display: "flex", flexDirection: "column", gap: 9 }}>
              <input className="field" style={input} placeholder="What is wrong? e.g. Screenshot placeholder is too small in 9:16" value={issueDraft.title} onChange={(e) => setIssueDraft({ ...issueDraft, title: e.target.value })} />
              <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                <select className="field" style={{ ...input, flex: 1, minWidth: 130 }} value={issueDraft.category} onChange={(e) => setIssueDraft({ ...issueDraft, category: e.target.value })}>
                  {issueCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="field" style={{ ...input, flex: 1, minWidth: 130 }} value={issueDraft.severity} onChange={(e) => setIssueDraft({ ...issueDraft, severity: e.target.value })}>
                  {issueSeverities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <textarea className="field resize-none" style={{ ...input, minHeight: 58 }} placeholder="Suggested fix (optional) — e.g. increase the screenshot box from 320x250 to 600x450" value={issueDraft.suggestedFix} onChange={(e) => setIssueDraft({ ...issueDraft, suggestedFix: e.target.value })} />
              <div style={{ display: "flex", gap: 9 }}>
                <button className="btn-chip" disabled={!issueDraft.title.trim()} onClick={saveIssue}>Record issue</button>
                <button className="link-mono" onClick={() => setReporting(false)}>CANCEL</button>
              </div>
            </div>
          )}
        </Panel>

        {/* ---- VERSION HISTORY ----
            The chain, not a list: each row carries what the version was for, who made it, what QA
            said and how many issues are open against it. This is the panel you read when a
            regression appears and you need to know which version introduced it. */}
        <Panel spine="#7d766a" title={`VERSION HISTORY — ${t.family}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {versions.map((v) => {
              const vm = statusMeta(v.status);
              const self = v.id === t.id;
              return (
                <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingBottom: 9, borderBottom: "1px solid rgba(23,19,14,.07)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: self ? "var(--color-mag)" : "var(--color-ink)" }}>V{v.version}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: vm.c, textTransform: "uppercase" }}>{vm.label}</span>
                  {v.qa && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>QA {v.qa.score}</span>}
                  {!!v.openIssueCount && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "#c8452d" }}>{v.openIssueCount} OPEN</span>}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>{fmtWhen(v.publishedAt || v.createdAt)}</span>
                  {!!(v.changes || v.createdBy) && (
                    <span style={{ flexBasis: "100%", fontSize: 13, lineHeight: 1.5, color: "var(--color-dim)" }}>
                      {v.changes || "no note"}{v.createdBy ? ` · ${v.createdBy}` : ""}
                    </span>
                  )}
                  {self
                    ? <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--color-dim)" }}>THIS ONE</span>
                    : <button className="link-mono" style={{ marginLeft: "auto" }} onClick={() => onOpenTemplate?.(v.id)}>OPEN →</button>}
                </div>
              );
            })}
            {!versions.length && <span style={{ fontSize: 13, color: "var(--color-dim)" }}>Only this version exists.</span>}
          </div>
        </Panel>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function Panel({ spine, title, empty, children }) {
  return (
    <div className="card" style={{ padding: "20px 22px 22px 27px" }}>
      <span className="spine" style={{ "--spine": spine }} />
      <div className="label-mono" style={{ marginBottom: 14 }}>{title}</div>
      {empty ? <span style={{ fontSize: 13, color: "var(--color-dim)", lineHeight: 1.55 }}>{empty}</span> : children}
    </div>
  );
}

function Field({ label, warn = false, children }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.16em", color: "var(--color-dim)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, color: warn ? "var(--color-rec)" : "var(--color-ink)", wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}

function Tag({ c, children }) {
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", color: c, padding: "4px 9px", borderRadius: 999, border: `1px solid ${c}55`, background: "var(--color-paper-2)" }}>{children}</span>
  );
}

function Stat({ n, label, c }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, lineHeight: 1, color: c }}>{n}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.14em", color: "var(--color-dim)", textTransform: "uppercase", marginTop: 4 }}>{label}</span>
    </div>
  );
}

function Banner({ c, innerRef, children }) {
  return (
    <div ref={innerRef} style={{ marginTop: 18, padding: "12px 16px", borderRadius: 12, border: `1px solid ${c}44`, background: `${c}12`, fontSize: 13.5, lineHeight: 1.55, color: "var(--color-ink)", wordBreak: "break-word" }}>
      {children}
    </div>
  );
}

// The QA report. The SCORE is for ranking near-misses against each other; the BLOCKING list is
// what decides — a template that scores 92 and renders the wrong design is not 92% publishable.
// So the verdict leads and the number sits beside it, never the other way round.
function QaReport({ qa }) {
  const [openPassed, setOpenPassed] = useState(false);
  const c = qa.verdict === "fail" ? "#d8271b" : qa.verdict === "warn" ? "#ffb03a" : "#22c55e";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 40, fontWeight: 700, lineHeight: 1, color: c }}>{qa.score}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-dim)" }}>/100</span>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: c, paddingBottom: 4 }}>{qa.verdict}</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)", paddingBottom: 5 }}>
          {(qa.errors || []).length} ERRORS · {(qa.warnings || []).length} WARNINGS · {(qa.passed || []).length} PASSED
        </span>
      </div>

      {!!qa.groups && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 7 }}>
          {Object.entries(qa.groups).map(([g, v]) => (
            <div key={g} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 92, flex: "none", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-dim)" }}>{g}</span>
              <span style={{ flex: 1, height: 5, borderRadius: 999, background: "rgba(23,19,14,.08)", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${v.score}%`, background: v.score >= 90 ? "#22c55e" : v.score >= 60 ? "#ffb03a" : "#d8271b" }} />
              </span>
              <span style={{ width: 62, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--color-dim)" }}>{v.passed}/{v.total} · {v.score}%</span>
            </div>
          ))}
        </div>
      )}

      <QaList title="BLOCKING" c="#d8271b" rows={qa.blocking} withFix />
      <QaList title="ERRORS" c="#d8271b" rows={qa.errors} />
      <QaList title="WARNINGS" c="#ffb03a" rows={qa.warnings} />

      {!!(qa.passed || []).length && (
        <div style={{ marginTop: 16 }}>
          <button className="link-mono" onClick={() => setOpenPassed((v) => !v)} style={{ borderBottomColor: "#22c55e" }}>
            {openPassed ? "HIDE" : "SHOW"} {qa.passed.length} PASSED CHECKS
          </button>
          {openPassed && <QaList title="" c="#22c55e" rows={qa.passed} />}
        </div>
      )}

      <div style={{ marginTop: 16, fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.12em", color: "var(--color-dim)" }}>
        RAN {qa.ranAt ? new Date(qa.ranAt).toLocaleString() : "—"} · {Math.round((qa.durationMs || 0) / 100) / 10}S
        {qa.context?.deep === false ? " · SHALLOW" : " · DEEP"}
        {(qa.skipped || []).length ? ` · ${qa.skipped.length} SKIPPED` : ""}
      </div>
    </div>
  );
}

function QaList({ title, c, rows, withFix = false }) {
  if (!rows || !rows.length) return null;
  return (
    <div style={{ marginTop: 16 }}>
      {title && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: c, marginBottom: 8 }}>{title} · {rows.length}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {rows.map((r, i) => (
          <div key={`${r.id}-${i}`} style={{ borderLeft: `2px solid ${c}55`, paddingLeft: 11 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: c }}>{r.id}</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--color-ink)", marginTop: 3 }}>{r.detail}</div>
            {withFix && r.fix && <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--color-dim)", marginTop: 3 }}>→ {r.fix}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Metadata editor. PATCH accepts name, description, category, prompt and tags — and nothing
// else, because status, slug, family and version are the store's to move, never a form's.
function EditForm({ t, onCancel, onSaved, onError }) {
  const [name, setName] = useState(t.name || "");
  const [description, setDescription] = useState(t.description || "");
  const [category, setCategory] = useState(t.category || "");
  const [tags, setTags] = useState((t.tags || []).join(", "));
  const [prompt, setPrompt] = useState(t.prompt || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const r = await adminUpdateTemplate(t.id, {
        name: name.trim(), description: description.trim(), category: category.trim(),
        tags: tags.split(",").map((x) => x.trim()).filter(Boolean), prompt,
      });
      onSaved(r.template);
    } catch (e) { onError?.(e.message); }
    finally { setSaving(false); }
  }

  const input = { width: "100%", boxSizing: "border-box", padding: "9px 12px", fontSize: 13.5 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="label-mono">NAME</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} style={input} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="label-mono">DESCRIPTION</span>
        <textarea className="field resize-none" value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...input, minHeight: 60 }} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="label-mono">CATEGORY</span>
        <input className="field" value={category} onChange={(e) => setCategory(e.target.value)} style={input} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="label-mono">TAGS — COMMA SEPARATED</span>
        <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} style={input} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="label-mono">PROMPT — USED BY THE NEXT REGENERATION</span>
        <textarea className="field resize-none" value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ ...input, minHeight: 96, lineHeight: 1.55 }} />
      </label>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button className="btn-ink" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button className="btn-chip" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}
