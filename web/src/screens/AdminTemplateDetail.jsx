import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { mediaUrl } from "../api.js";
import {
  PIPELINE_STAGES, STATUS, archiveTemplate, createVersion, deleteTemplate,
  fmtWhen, generateTemplate, getTemplate, isBusy, lineOf, pipelineProgress, pollTemplateStatus,
  previewTemplate, publishTemplate, qaTemplate, testTemplate, unpublishTemplate, updateTemplate,
} from "../adminApi.js";
import { AdminGate, Field, Notice, OrientationChip, Pill, PanelHead, QDRow, Stat, StatusBadge, ThumbBox } from "./AdminShared.jsx";

// ADMIN · REVIEW & PUBLISH — everything the pipeline produced about one
// template, and only the actions its current status allows.
//
// The action set is keyed on status rather than filtered by hand because the
// store's transition table is the authority: setStatus THROWS on an illegal move
// and the route answers 409. Offering a button the state machine will refuse is
// how an admin learns the lifecycle from error toasts, so the buttons that
// cannot work are not rendered at all. TESTING is QA's own status — everything
// except watching is illegal from there, and the route says so.
const ACTIONS_BY_STATUS = {
  [STATUS.DRAFT]: ["edit", "generate", "delete"],
  [STATUS.GENERATING]: [],
  [STATUS.GENERATED]: ["preview", "test", "edit", "regenerate", "qa"],
  [STATUS.TESTING]: [],
  [STATUS.READY_TO_PUBLISH]: ["preview", "test", "qa", "publish"],
  [STATUS.PUBLISHED]: ["preview", "test", "newVersion", "unpublish", "archive"],
  [STATUS.FAILED]: ["retry", "delete"],
  [STATUS.ARCHIVED]: [],
};
const DESTRUCTIVE = new Set(["delete", "unpublish", "archive"]);

export default function AdminTemplateDetail(props) {
  return <AdminGate><Detail {...props} /></AdminGate>;
}

function Detail({ templateId, onBack, onDeleted }) {
  const [t, setT] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(null);          // the action key currently running
  const [actionError, setActionError] = useState(null);
  const [blocking, setBlocking] = useState(null);  // publish's 422 reasons, verbatim
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const videoRef = useRef(null);
  const mediaRef = useRef(null);

  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    getTemplate(templateId)
      .then((next) => { if (!cancelled) { setT(next); setLoadError(null); } })
      .catch((e) => { if (!cancelled) setLoadError(e); });
    return () => { cancelled = true; };
  }, [templateId]);

  // Re-read after every action. Deliberately silent: a refresh that misses must
  // not replace a review screen that is showing perfectly good data, and the
  // action's own result is already reported.
  const refresh = useCallback(() => {
    getTemplate(templateId).then(setT).catch(() => {});
  }, [templateId]);

  // Follow the pipeline while the server owns this template, so a generate or a
  // test render finishes on screen instead of behind a manual reload.
  useEffect(() => {
    if (!isBusy(t)) return;
    const ac = new AbortController();
    pollTemplateStatus(t.id, { onTick: (s) => setT((prev) => (prev ? { ...prev, ...s } : prev)), signal: ac.signal })
      .then(refresh)
      .catch(() => { /* aborted, or the status route blinked — the next action reloads */ });
    return () => ac.abort();
  }, [t, refresh]);

  if (loadError) {
    return (
      <Wrap>
        <span className="scene-pill" style={{ "--tagc": "#d8271b" }}>ADMIN · TEMPLATE</span>
        <h1 className="headline" style={{ fontSize: "clamp(28px,4.2vw,48px)" }}>This template couldn’t be loaded.</h1>
        <Notice tone="error" title="The admin API did not answer" lines={[loadError.message]}>
          {loadError.status === 404 ? "It may have been deleted." : "Nothing was changed."}
        </Notice>
        <button className="link-mono" onClick={onBack} style={{ marginTop: 26 }}>← LIBRARY</button>
      </Wrap>
    );
  }
  if (!t) {
    return <Wrap><p style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.14em", color: "var(--color-dim)" }}>LOADING…</p></Wrap>;
  }

  const run = async (key, fn) => {
    setBusy(key); setActionError(null); setBlocking(null); setNotice(null); setConfirming(null);
    try {
      const res = await fn();
      return res;
    } catch (e) {
      // Publish (and unpublish, and archive-through-unpublish) refuse with 422
      // and the list of reasons. Those reasons ARE the refusal, so they are shown
      // exactly as the server wrote them — never summarised into "cannot publish".
      if (e.status === 422) setBlocking({ action: key, lines: e.blocking.length ? e.blocking : [e.message] });
      else setActionError(e);
      return null;
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const act = {
    // "Preview" is a BUILD, not a play button: the publish gate refuses a version
    // with no thumbnail or clip ("run preview first"), and this route is the only
    // thing that writes them. The rendered clip is already playable in the media
    // block below, so watching needs no action of its own.
    preview: () => run("preview", async () => {
      await previewTemplate(t.id);
      mediaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setNotice("Rendering the thumbnail and preview clip — this panel follows it.");
    }),
    edit: () => setEditing((v) => !v),
    generate: () => run("generate", () => generateTemplate(t.id)),
    regenerate: () => run("regenerate", () => generateTemplate(t.id)),
    retry: () => run("retry", () => generateTemplate(t.id)),
    test: () => run("test", async () => { await testTemplate(t.id); setNotice("Test render queued — the status follows it."); }),
    qa: () => run("qa", async () => { await qaTemplate(t.id); setNotice("Quality checks run — the report below is refreshed."); }),
    publish: () => run("publish", async () => { await publishTemplate(t.id); setNotice(`Published — frames/${t.slug} is live in the library.`); }),
    // A new version is an empty build SLOT. The live pack keeps serving from
    // frames/ (publish copied it there), and PUBLISHED → GENERATING is not in the
    // transition table — so say what actually has to happen next.
    newVersion: () => run("newVersion", async () => { await createVersion(t.id); setNotice("New version slot created from the saved brief. Unpublish to build it — generating is not legal while published."); }),
    unpublish: () => run("unpublish", async () => { await unpublishTemplate(t.id); setNotice("Unpublished — the folder was removed from frames/. The draft is untouched."); }),
    archive: () => run("archive", () => archiveTemplate(t.id)),
    delete: () => run("delete", async () => { await deleteTemplate(t.id); (onDeleted || onBack)?.(); }),
  };

  // While the server is working on this template every route answers 409
  // ("template is already generating"), so the action row stands down until it
  // is idle again — the poll above brings it back.
  const inFlight = isBusy(t);
  const keys = inFlight ? [] : ACTIONS_BY_STATUS[t.status] || [];
  const versions = Array.isArray(t.versions) ? t.versions : [];
  const current = versions.find((v) => v.version === t.currentVersion) || versions[0] || null;
  const thumb = t.thumbnail ? mediaUrl(t.thumbnail) : null;
  const preview = t.previewVideo ? mediaUrl(t.previewVideo) : null;

  return (
    <Wrap>
      <button className="link-mono" onClick={onBack}>← LIBRARY</button>

      <div style={{ marginTop: 22, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <StatusBadge status={t.status} big />
            <OrientationChip orientation={t.orientation} />
            {t.currentVersion > 0 && <span className="label-mono">V{t.currentVersion}</span>}
            {t.publishedVersion != null && <span className="label-mono" style={{ color: "#2b5bff" }}>LIVE V{t.publishedVersion}</span>}
            {t.isLive === false && t.status === STATUS.PUBLISHED && (
              <span className="label-mono" style={{ color: "#d8271b" }}>⚠ MISSING FROM frames/</span>
            )}
          </div>
          <h1 className="headline" style={{ fontSize: "clamp(30px,4.4vw,54px)" }}>{t.name || t.slug}</h1>
          <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
            {t.slug}{t.category ? ` · ${t.category}` : ""} · CREATED {fmtWhen(t.createdAt)} · UPDATED {fmtWhen(t.updatedAt)}
            {t.publishedAt ? ` · PUBLISHED ${fmtWhen(t.publishedAt)}` : ""}
            {t.createdBy ? ` · BY ${t.createdBy}` : ""}
          </div>
        </div>
      </div>

      {/* ---- status-appropriate actions ONLY ---- */}
      <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {inFlight && (
          <span className="label-mono" style={{ color: "var(--color-am)" }}>
            ● {(PIPELINE_STAGES[Math.max(0, pipelineProgress(t).index)] || {}).label || "WORKING"}
            {t.progress?.step ? ` — ${t.progress.step}` : ""} — ACTIONS PAUSED
          </span>
        )}
        {keys.map((k) => (
          <ActionButton key={k} action={k} busy={busy} disabled={!!busy}
            confirming={confirming === k}
            onClick={() => {
              if (DESTRUCTIVE.has(k) && confirming !== k) { setConfirming(k); return; }
              act[k]();
            }} />
        ))}
        {confirming && (
          <button className="link-mono" onClick={() => setConfirming(null)}>CANCEL</button>
        )}
      </div>

      {blocking && (
        <Notice tone="warn" title={`${blocking.action} refused — these must be cleared first`} lines={blocking.lines}>
          Reported by the server exactly as written. Nothing was moved in or out of frames/.
        </Notice>
      )}
      {actionError && (
        <Notice tone="error" title={actionError.status === 409 ? "The lifecycle refused that move" : "That action failed"}
          lines={[actionError.message, actionError.body?.hint].filter(Boolean)}>
          The template is unchanged.
          {Array.isArray(actionError.body?.allowedNext) && actionError.body.allowedNext.length > 0
            && ` Legal from ${t.status}: ${actionError.body.allowedNext.join(", ")}.`}
        </Notice>
      )}
      {notice && <Notice tone="ok" title="Done" lines={[notice]} />}
      {t.status === STATUS.FAILED && t.lastError && (
        <Notice tone="error" title="Last build error" lines={[t.lastError]}>
          Retry re-runs the pipeline from the saved brief; delete removes the draft and its versions.
        </Notice>
      )}

      {editing && <EditPanel t={t} busy={busy === "save"} onCancel={() => setEditing(false)}
        onSave={(patch) => run("save", async () => { await updateTemplate(t.id, patch); setEditing(false); setNotice("Metadata saved."); })} />}

      {/* ---- what was rendered ---- */}
      <div ref={mediaRef} style={{ marginTop: 30, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 16 }}>
        <div className="card" style={{ overflow: "hidden" }}>
          <span className="spine" style={{ "--spine": "#23c8e0", zIndex: 5 }} />
          <ThumbBox src={thumb} orientation={t.orientation} alt={`${t.name} thumbnail`} />
          <div style={{ padding: "12px 16px 14px 21px" }} className="label-mono">
            THUMBNAIL {thumb ? "" : "— NOT RENDERED YET"}
          </div>
        </div>
        <div className="card" style={{ overflow: "hidden" }}>
          <span className="spine" style={{ "--spine": "#e832a8", zIndex: 5 }} />
          {preview ? (
            <video ref={videoRef} src={preview} controls playsInline poster={thumb || undefined}
              style={{ display: "block", width: "100%", aspectRatio: t.orientation === "vertical" ? "9 / 16" : t.orientation === "square" ? "1 / 1" : "16 / 9", background: "#0d0b07" }} />
          ) : (
            <ThumbBox src={null} orientation={t.orientation}
              overlay={<span style={{ position: "relative", zIndex: 3, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", color: "#f2ede2" }}>NO PREVIEW YET</span>} />
          )}
          <div style={{ padding: "12px 16px 14px 21px" }} className="label-mono">PREVIEW CLIP</div>
        </div>
      </div>

      {/* ---- the brief and the metadata ---- */}
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))", gap: 16 }}>
        <div className="card" style={{ padding: "20px 22px 22px 27px" }}>
          <span className="spine" style={{ "--spine": "#ffb03a" }} />
          <div className="label-mono" style={{ marginBottom: 12 }}>THE BRIEF</div>
          <KV label="Prompt" value={t.generation?.prompt} wrap />
          <KV label="Style" value={t.generation?.style} />
          <KV label="Brand colour" value={t.generation?.brandColor} swatch />
          <KV label="Duration" value={t.generation?.durationSec ? `${t.generation.durationSec}s` : null} />
          <KV label="Instructions" value={t.generation?.notes} wrap />
        </div>
        <div className="card" style={{ padding: "20px 22px 22px 27px" }}>
          <span className="spine" style={{ "--spine": "#b9f24a" }} />
          <div className="label-mono" style={{ marginBottom: 12 }}>THE RECORD</div>
          <KV label="Description" value={t.description} wrap />
          <KV label="Tags" value={(t.tags || []).join(", ")} />
          <KV label="Staging" value={t.draftSourceDir} mono wrap />
          <KV label="Live path" value={t.liveSourceDir} mono wrap />
          <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)", lineHeight: 1.7 }}>
            PUBLISH MOVES STAGING → LIVE. THE REGISTRY READS frames/ WITH NO CACHE, SO THE PACK IS LIVE THE INSTANT THE FOLDER LANDS.
          </div>
        </div>
      </div>

      {/* ---- the report: capabilities, requirements, audio, QA ---- */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="editor-card" style={{ marginTop: 16 }}>
        <PanelHead title="TEMPLATE REPORT" status={current ? `V${current.version}` : "NO BUILD YET"} statusColor="#7d766a" />
        <div style={{ padding: 24 }}>
          <QaReport t={t} version={current} />

          <Section title="CAPABILITIES"><KVGrid obj={t.capabilities} /></Section>
          <Section title="ASSET REQUIREMENTS"><KVGrid obj={t.assetRequirements} /></Section>
          <Section title="AUDIO CONFIGURATION"><KVGrid obj={t.audioConfiguration} /></Section>

          <Section title={`VERSION HISTORY — ${versions.length || "NONE"}`}>
            {versions.length === 0 ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-dark-dim)" }}>Nothing built yet.</div>
            ) : (
              <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
                {versions.map((v) => (
                  <QDRow key={v.version} ok={v.generationStatus !== "failed"}
                    label={`v${v.version}${v.version === t.currentVersion ? " · current" : ""}${v.version === t.publishedVersion ? " · LIVE" : ""}`}
                    detail={[
                      v.generationStatus || "—",
                      v.qaScore != null ? `QA ${v.qaScore}` : null,
                      v.testJobIds?.length ? `${v.testJobIds.length} test render(s)` : null,
                      fmtWhen(v.createdAt),
                    ].filter(Boolean).join(" · ")} />
                ))}
              </ul>
            )}
          </Section>
        </div>
      </motion.div>
    </Wrap>
  );
}

function Wrap({ children }) {
  return <div style={{ maxWidth: 1080, margin: "0 auto", padding: "clamp(16px,3vw,40px) clamp(16px,4vw,60px) 110px" }}>{children}</div>;
}

// ---- QA ----------------------------------------------------------------
// Score, then what failed, then what was only a warning, then what passed —
// the same order and the same primitives the Premiere screen reports a film's
// QA in, so the two verdicts read alike.
function QaReport({ t, version }) {
  const qa = version?.qaResults || t.qaResults || null;
  const score = version?.qaScore ?? qa?.score ?? null;
  const errors = asList(qa?.errors ?? qa?.blockers);
  const warnings = asList(qa?.warnings);
  const passed = asList(qa?.passed ?? qa?.checks);
  const ran = qa != null || score != null;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 20 }}>
        <Stat label="QA SCORE" value={score != null ? String(score) : "—"} c="#b9f24a" sub={ran ? null : "not run yet"} />
        <Stat label="VERSION" value={t.currentVersion ? `v${t.currentVersion}` : "—"} c="#23c8e0" sub={t.publishedVersion != null ? `live: v${t.publishedVersion}` : "nothing live"} />
        <Stat label="BLOCKERS" value={String(errors.length)} c={errors.length ? "#ff6a3c" : "#b9f24a"} />
        <Stat label="WARNINGS" value={String(warnings.length)} c={warnings.length ? "#ffb03a" : "#b9f24a"} />
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {errors.length > 0 && <Pill label="QA VERDICT" value="BLOCKED" sub={`${errors.length} error(s)`} c="#ff6a3c" />}
          {errors.length === 0 && warnings.length > 0 && <Pill label="QA VERDICT" value="PASSED WITH NOTES" sub={`${warnings.length} warning(s)`} c="#ffb03a" />}
        </div>
      )}

      <Section title={ran ? "QUALITY CHECKS" : "QUALITY CHECKS — NOT RUN"}>
        {!ran ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-dark-dim)" }}>
            Run the checks before publishing — the server decides whether it will accept a publish without them.
          </div>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
            {errors.map((e, i) => <QDRow key={`e${i}`} ok={false} label="Error" detail={lineOf(e)} />)}
            {warnings.map((w, i) => <QDRow key={`w${i}`} ok={false} label="Warning" detail={lineOf(w)} />)}
            {passed.map((p, i) => <QDRow key={`p${i}`} ok label="Passed" detail={lineOf(p)} />)}
            {errors.length === 0 && warnings.length === 0 && passed.length === 0 && (
              <QDRow ok label="Quality checks" detail="clean — nothing flagged" />
            )}
          </ul>
        )}
      </Section>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", color: "#7d766a", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

// The three pipeline-declared blocks (capabilities / asset requirements / audio)
// have no fixed schema in the store — they are `{}` until the generator fills
// them. Rendering them generically means a backend that adds a field shows it
// here without a frontend change, instead of silently dropping it.
function KVGrid({ obj }) {
  const rows = Object.entries(obj || {});
  if (rows.length === 0) {
    return <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-dark-dim)" }}>Not declared.</div>;
  }
  return (
    <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
      {rows.map(([k, v]) => (
        <li key={k} style={{ display: "flex", alignItems: "baseline", gap: 12, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-dark-dim)" }}>
          <span style={{ color: "var(--color-dark-ink)" }}>{k}</span>
          <span style={{ flex: 1, borderBottom: "1px solid rgba(242,237,226,.12)", transform: "translateY(-3px)" }} />
          <span style={{ textAlign: "right", wordBreak: "break-word" }}>{scalar(v)}</span>
        </li>
      ))}
    </ul>
  );
}

function KV({ label, value, mono = false, wrap = false, swatch = false }) {
  if (value == null || value === "") return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="label-mono" style={{ fontSize: 9, marginBottom: 4 }}>{label}</div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
        fontSize: mono ? 11 : 13.5, color: "var(--color-ink)", lineHeight: 1.6,
        whiteSpace: wrap ? "pre-wrap" : "nowrap", overflow: wrap ? "visible" : "hidden",
        textOverflow: "ellipsis", wordBreak: wrap ? "break-word" : "normal",
      }}>
        {swatch && <span style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 4, background: String(value), border: "1px solid rgba(23,19,14,.25)" }} />}
        {String(value)}
      </div>
    </div>
  );
}

// ---- edit ---------------------------------------------------------------
// slug and status are absent on purpose: the store strips both from a PATCH.
// The slug is a live filesystem path and the status only ever moves through the
// transition table, so an editable field for either would be a lie.
function EditPanel({ t, busy, onSave, onCancel }) {
  const [name, setName] = useState(t.name || "");
  const [description, setDescription] = useState(t.description || "");
  const [category, setCategory] = useState(t.category || "");
  const [tags, setTags] = useState((t.tags || []).join(", "));
  const [prompt, setPrompt] = useState(t.generation?.prompt || "");
  const [style, setStyle] = useState(t.generation?.style || "");
  const [brandColor, setBrandColor] = useState(t.generation?.brandColor || "");
  const [durationSec, setDurationSec] = useState(t.generation?.durationSec || "");
  const [notes, setNotes] = useState(t.generation?.notes || "");

  const save = () => onSave({
    name: name.trim(),
    description: description.trim(),
    category: category.trim() || null,
    tags: tags.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12),
    // `generation` is assigned wholesale by updateTemplate, so it is merged here
    // — patching a bare { prompt } would drop every other field in the brief.
    generation: {
      ...(t.generation || {}),
      prompt: prompt.trim(),
      style: style.trim() || null,
      brandColor: brandColor.trim() || null,
      durationSec: durationSec === "" ? null : Number(durationSec) || null,
      notes: notes.trim() || null,
    },
  });

  return (
    <div className="card" style={{ marginTop: 20, padding: "22px 24px 24px 29px" }}>
      <span className="spine" style={{ "--spine": "#e832a8" }} />
      <div className="label-mono" style={{ marginBottom: 16 }}>EDIT — SLUG AND STATUS ARE FIXED</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", gap: 14 }}>
        <Field label="NAME"><input value={name} onChange={(e) => setName(e.target.value)} className="admin-input" /></Field>
        <Field label="CATEGORY"><input value={category} onChange={(e) => setCategory(e.target.value)} className="admin-input" /></Field>
        <Field label="TAGS" hint="COMMA SEPARATED"><input value={tags} onChange={(e) => setTags(e.target.value)} className="admin-input" /></Field>
        <Field label="STYLE"><input value={style} onChange={(e) => setStyle(e.target.value)} className="admin-input" /></Field>
        <Field label="BRAND COLOUR"><input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="admin-input" placeholder="#2b5bff" /></Field>
        <Field label="DURATION (S)"><input value={durationSec} onChange={(e) => setDurationSec(e.target.value.replace(/[^0-9]/g, ""))} className="admin-input" inputMode="numeric" /></Field>
      </div>
      <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
        <Field label="DESCRIPTION"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="admin-input" /></Field>
        <Field label="PROMPT"><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} className="admin-input" /></Field>
        <Field label="EXTRA INSTRUCTIONS"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="admin-input" /></Field>
      </div>
      <div style={{ marginTop: 18, display: "flex", gap: 12, alignItems: "center" }}>
        <button className="btn-ink" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        <button className="link-mono" onClick={onCancel}>CANCEL</button>
      </div>
    </div>
  );
}

// ---- action button -------------------------------------------------------
const ACTION_LABEL = {
  preview: "Render preview",
  test: "Test render",
  edit: "Edit",
  generate: "Generate →",
  regenerate: "Regenerate",
  retry: "Retry build",
  qa: "Run QA",
  publish: "Publish →",
  newVersion: "New version",
  unpublish: "Unpublish",
  archive: "Archive",
  delete: "Delete",
};

const ACTION_HINT = {
  preview: "renders this version's thumbnail + preview clip — publish requires both",
  test: "renders a real film through the production pipeline on this pack",
  qa: "runs the quality checks; clean QA is what makes a template publishable",
  publish: "moves the staged folder into frames/ — live immediately",
  unpublish: "removes the live folder; the draft and every version survive",
  newVersion: "opens an empty build slot; the live pack keeps serving",
};

function ActionButton({ action, busy, disabled, confirming, onClick }) {
  const running = busy === action;
  const label = confirming ? `Confirm ${action}?` : ACTION_LABEL[action] || action;
  const primary = action === "publish";
  const strong = action === "generate" || action === "regenerate" || action === "retry";
  const danger = DESTRUCTIVE.has(action);
  const title = ACTION_HINT[action];

  if (primary) {
    return <button className="btn-mag" onClick={onClick} disabled={disabled} title={title} style={{ padding: "11px 24px", fontSize: 14 }}>{running ? "Publishing…" : label}</button>;
  }
  if (strong) {
    return <button className="btn-ink" onClick={onClick} disabled={disabled} title={title}>{running ? "Working…" : label}</button>;
  }
  return (
    <button className="btn-chip" onClick={onClick} disabled={disabled} title={title}
      style={{
        opacity: disabled ? 0.45 : 1, cursor: disabled ? "default" : "pointer",
        ...(danger ? { color: "#d8271b", borderColor: confirming ? "#d8271b" : "rgba(216,39,27,.4)", background: confirming ? "rgba(216,39,27,.12)" : undefined } : null),
      }}>
      {running ? "…" : label}
    </button>
  );
}

// ---- shape helpers -------------------------------------------------------
// QA blocks arrive as arrays from the checker and, on older records, as a single
// string or an object of named checks. Normalise on read so one producer's shape
// never blanks the panel.
function asList(x) {
  if (x == null) return [];
  if (Array.isArray(x)) return x;
  if (typeof x === "object") return Object.values(x);
  return [x];
}
function scalar(v) {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.map(scalar).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}
