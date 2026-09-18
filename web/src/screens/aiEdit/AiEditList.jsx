import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Dialog from "../../components/Dialog.jsx";
import Toasts from "../../components/Toasts.jsx";
import EditNotice from "../../components/EditNotice.jsx";
import { listEdits, deleteEdit, mediaSrc } from "../../editApi.js";
import { statusBadge, fmtDuration, fmtWhen, errorCopy, uploadStatusLine } from "../../editFormat.js";
import { useUpload, isBusy } from "../../uploadStore.js";
import { useNow } from "../../clockStore.js";
import { removeRecent } from "../../recentEdits.js";

// MY EDITS (UX.md §1e) — the cutting room: every edit this person owns, newest first, merged with
// the upload still in flight on this browser. Each card is a small monitor showing the take in its
// real aspect, its length before → after the cut, where it stands, and when it last moved.
// Analyzing edits refresh on their own; deleting asks first and cannot be undone.

const LIVE = new Set(["QUEUED", "PROCESSING", "RENDERING", "DELETING"]);
const RATIO = { vertical: "9 / 16", horizontal: "16 / 9", square: "1 / 1" };
const EASE = [0.16, 1, 0.3, 1];

const CSS = `
.kf-el-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px;list-style:none;margin:0;padding:0}
.kf-el-card{display:flex;flex-direction:column;height:100%;overflow:hidden}
.kf-el-poster-btn{display:block;width:100%;padding:0;border:0;background:none;cursor:pointer;border-radius:18px 18px 0 0}
.kf-el-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:auto;padding:0 16px 16px}
@media (max-width:520px){.kf-el-head{flex-direction:column;align-items:flex-start !important}}
`;

// ---------------------------------------------------------------- shared furniture (also used by AiEditUpload)

// A status badge whose TEXT is always ink (legible on paper and dark); the status colour lives in the
// dot, tint and border, so lime/amber never carry words they can't contrast.
export function EditStatusBadge({ badge, onDark = false, size = "sm" }) {
  if (!badge) return null;
  const c = badge.color;
  const big = size === "md";
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, maxWidth: "100%",
        padding: big ? "5px 11px" : "3px 9px", borderRadius: 999,
        border: `1px solid ${c}66`, background: `${c}1f`,
        fontFamily: "var(--font-mono)", fontSize: big ? 10 : 9, letterSpacing: "0.16em", textTransform: "uppercase",
        color: onDark ? "var(--color-dark-ink)" : "var(--color-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: c, flexShrink: 0, animation: badge.live ? "kf2-blink 1s steps(1) infinite" : "none" }} />
      {badge.label}
    </span>
  );
}

// The take on a small monitor: a 4:3 dark frame with the poster letterboxed in its own aspect, a scan
// overlay, viewfinder corners and (while working) a progress rail along the bottom. Decorative — the
// card's text carries the information.
export function EditPoster({ src, orientation, pct = null, corner = null }) {
  const [broken, setBroken] = useState(false);
  const horizontal = orientation === "horizontal";
  const show = src && !broken;
  const mark = (pos) => {
    const s = { position: "absolute", width: 12, height: 12, borderColor: "rgba(242,237,226,.45)", borderStyle: "solid", borderWidth: 0 };
    if (pos.includes("t")) { s.top = 10; s.borderTopWidth = 1.5; } else { s.bottom = 10; s.borderBottomWidth = 1.5; }
    if (pos.includes("l")) { s.left = 10; s.borderLeftWidth = 1.5; } else { s.right = 10; s.borderRightWidth = 1.5; }
    return <span style={s} />;
  };
  return (
    <div aria-hidden="true" style={{ position: "relative", aspectRatio: "4 / 3", background: "var(--color-dark-2)", overflow: "hidden", display: "grid", placeItems: "center" }}>
      <div
        style={{
          position: "relative", aspectRatio: RATIO[orientation] || "9 / 16",
          ...(horizontal ? { width: "82%" } : { height: "80%" }),
          maxWidth: "82%", maxHeight: "80%", borderRadius: 6, overflow: "hidden",
          border: "1px solid rgba(242,237,226,.14)", boxShadow: "0 12px 30px rgba(0,0,0,.55)", background: "var(--color-band)",
        }}
      >
        {show ? (
          <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div className="film-drift" style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #e832a8, #6b1050 55%, #2a0a20)", opacity: 0.7 }} />
        )}
        <div className="film-scan" style={{ opacity: 0.28 }} />
      </div>
      {mark("tl")}{mark("tr")}{mark("bl")}{mark("br")}
      {corner && (
        <span style={{ position: "absolute", right: 12, bottom: pct != null ? 16 : 12, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--color-dark-ink)", background: "rgba(13,11,7,.72)", padding: "3px 7px", borderRadius: 6, fontVariantNumeric: "tabular-nums" }}>
          {corner}
        </span>
      )}
      {pct != null && (
        <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, background: "rgba(242,237,226,.08)" }}>
          <span style={{ display: "block", height: "100%", width: `${Math.max(2, Math.min(100, pct))}%`, background: "linear-gradient(90deg, var(--color-mag), var(--color-am))", transition: "width .45s cubic-bezier(.16,1,.3,1)" }} />
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the list

const lengthText = (p) => (p.outputDurationSec ? `${fmtDuration(p.durationSec)} → ${fmtDuration(p.outputDurationSec)}` : p.durationSec ? fmtDuration(p.durationSec) : "");

function mergeProjects(first, extra, removed) {
  const seen = new Set();
  const out = [];
  for (const p of [...first, ...extra]) {
    if (!p?.id || seen.has(p.id) || removed.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export default function AiEditList({ onOpen, onOpenList, onNew, onNeedAuth }) {
  const reduce = useReducedMotion();
  const now = useNow();
  const up = useUpload();
  const [page, setPage] = useState({ status: "loading", projects: [], nextCursor: null, error: null });
  const [extra, setExtra] = useState({ projects: [], nextCursor: null, loading: false, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [removed, setRemoved] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const alive = useRef(false);
  const headingRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // A finished upload lands in the server list: refetch when the store says it started.
  const startedId = up.phase === "started" ? up.projectId : null;

  // First page, refreshed every 5 s (15 s hidden) while anything on it is still working.
  useEffect(() => {
    const ac = new AbortController();
    let timer = null;
    const tick = () => {
      listEdits({ limit: 50, signal: ac.signal })
        .then((res) => {
          const projects = Array.isArray(res?.projects) ? res.projects : [];
          setPage({ status: "ready", projects, nextCursor: res?.nextCursor || null, error: null });
          if (projects.some((p) => LIVE.has(p.status))) {
            const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
            timer = setTimeout(tick, hidden ? 15000 : 5000);
          }
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          setPage((s) => ({ ...s, status: s.projects.length ? "ready" : "error", error: err }));
        });
    };
    tick();
    return () => { ac.abort(); clearTimeout(timer); };
  }, [reloadKey, startedId]);

  const loadMore = () => {
    const cursor = extra.nextCursor || page.nextCursor;
    if (!cursor || extra.loading) return;
    setExtra((s) => ({ ...s, loading: true, error: null }));
    listEdits({ limit: 50, cursor })
      .then((res) => setExtra((s) => ({ projects: [...s.projects, ...(res?.projects || [])], nextCursor: res?.nextCursor || null, loading: false, error: null })))
      .catch((err) => setExtra((s) => ({ ...s, loading: false, error: errorCopy(err).body })));
  };

  // Stable, so a list refresh doesn't restart a toast's timer.
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = (t) => setToasts((list) => [...list.slice(-2), { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...t }]);

  const retryAfterAuth = () => {
    if (alive.current) { setReloadKey((k) => k + 1); return; }
    // Auth replaced this screen; come back to the list, which loads fresh.
    onOpenList?.();
  };

  // After a delete the confirm dialog can't hand focus back to its opener (that card is gone), so the
  // heading takes it. An effect body runs after every effect cleanup of the same commit — including
  // the dialog's focus return — so this always wins, without a timer.
  const focusHeadingNext = useRef(false);
  useEffect(() => {
    if (!focusHeadingNext.current) return;
    focusHeadingNext.current = false;
    headingRef.current?.focus({ preventScroll: true });
  }, [removed]);

  const askDelete = (p) => { setDeleteError(null); setConfirm(p); };
  const closeConfirm = () => { if (!deleting) setConfirm(null); };

  const doDelete = async () => {
    const p = confirm;
    if (!p) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteEdit(p.id);
    } catch (err) {
      if (err?.status !== 404) {
        if (alive.current) { setDeleteError(errorCopy(err).body); setDeleting(false); }
        return;
      }
    }
    removeRecent(p.id);
    if (!alive.current) return;
    focusHeadingNext.current = true;
    setRemoved((s) => new Set([...s, p.id]));
    setDeleting(false);
    setConfirm(null);
    toast({ tone: "success", message: `Deleted *${p.title || "this edit"}*.` });
  };

  const projects = mergeProjects(page.projects, extra.projects, removed);
  const busyUpload = isBusy(up);
  const count = projects.length + (busyUpload ? 1 : 0);
  const hasMore = !!(extra.projects.length ? extra.nextCursor : page.nextCursor);
  const authError = page.error?.status === 401;
  const loadError = page.status === "error" && page.error ? errorCopy(page.error) : null;

  const rise = (i) => (reduce ? {} : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, ease: EASE, delay: Math.min(i, 8) * 0.04 } });

  return (
    <div className="pb-24">
      <style href="kf-ai-edit-list" precedence="kf">{CSS}</style>
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(16px,3vw,40px) clamp(16px,4vw,60px) 0" }}>
        <div className="kf-el-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <span className="scene-pill" style={{ "--tagc": "#2b5bff" }}>MY EDITS · {page.status === "loading" && !busyUpload ? "…" : count}</span>
            <h1 ref={headingRef} tabIndex={-1} className="headline" style={{ fontSize: "clamp(34px,5.2vw,68px)", outline: "none" }}>
              Your <span style={{ color: "var(--color-mag)" }}>cutting room.</span>
            </h1>
          </div>
          <button type="button" className="btn-ink" onClick={onNew} style={{ minHeight: 44 }}>
            + New edit
          </button>
        </div>

        <div style={{ marginTop: 34 }}>
          {page.status === "loading" && !busyUpload && (
            <div aria-busy="true">
              <span role="status" className="sr-only">Loading your edits…</span>
              <ul className="kf-el-grid" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="card" style={{ overflow: "hidden" }}>
                    <div style={{ aspectRatio: "4 / 3", background: "var(--color-dark-2)", position: "relative" }}><div className="film-scan" style={{ opacity: 0.4 }} /></div>
                    <div style={{ padding: 16, display: "grid", gap: 10 }}>
                      <span style={{ height: 16, width: "70%", borderRadius: 6, background: "var(--color-ground-2)" }} />
                      <span style={{ height: 10, width: "45%", borderRadius: 6, background: "var(--color-ground-2)" }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {loadError && (
            <EditNotice
              onDark={false}
              title={authError ? "SIGNED OUT" : loadError.title}
              body={loadError.body}
              tone={authError ? "warn" : "error"}
              actions={authError ? [{ id: "login", label: "Log in", primary: true }] : [{ id: "retry", label: "Try again", primary: true }]}
              onAction={(a) => (a === "login" ? onNeedAuth?.(retryAfterAuth) : setReloadKey((k) => k + 1))}
            />
          )}

          {page.status === "ready" && count === 0 && (
            <motion.div {...rise(0)} className="card" style={{ position: "relative", padding: "clamp(28px,5vw,56px)", overflow: "hidden", display: "grid", gap: 18, justifyItems: "start" }}>
              <span className="spine" style={{ "--spine": "var(--color-cb)" }} />
              <span className="label-mono">NOTHING IN THE CAN</span>
              <p style={{ margin: 0, maxWidth: 520, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(20px,2.6vw,28px)", lineHeight: 1.25, letterSpacing: "-0.01em", color: "var(--color-ink)" }}>
                No edits yet. Record yourself talking and drop the file in — KEYFRAME makes the cut.
              </p>
              <button type="button" className="btn-ink" onClick={onNew} style={{ minHeight: 44 }}>+ New edit</button>
            </motion.div>
          )}

          {(count > 0 && (page.status === "ready" || busyUpload)) && (
            <ul className="kf-el-grid" aria-label="Your edits">
              {busyUpload && (
                <li>
                  <motion.article {...rise(0)} className="card kf-el-card" aria-labelledby="kf-el-upload-title">
                    <EditPoster src={up.meta?.posterUrl || null} orientation={up.meta ? (up.meta.width > up.meta.height * 1.05 ? "horizontal" : up.meta.height > up.meta.width * 1.05 ? "vertical" : "square") : "vertical"} pct={up.phase === "verifying" ? 100 : up.progress?.pct ?? 0} corner={up.meta?.durationSec ? fmtDuration(up.meta.durationSec) : null} />
                    <div style={{ padding: "14px 16px 12px", display: "grid", gap: 8, minWidth: 0 }}>
                      <h2 id="kf-el-upload-title" title={up.file?.name} style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, lineHeight: 1.2, color: "var(--color-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {up.file?.name || "Your take"}
                      </h2>
                      <EditStatusBadge badge={up.phase === "verifying" ? { label: "CHECKING THE FOOTAGE", color: "#e832a8", live: true } : statusBadge(null, { upload: up.progress || { pct: 0 } })} />
                      <span className="label-mono" style={{ fontVariantNumeric: "tabular-nums" }}>{uploadStatusLine(up) || "UPLOADING"}</span>
                    </div>
                    <div className="kf-el-actions">
                      <button type="button" className="btn-chip" onClick={onNew} style={{ minHeight: 44 }}>View upload</button>
                    </div>
                  </motion.article>
                </li>
              )}
              {projects.map((p, i) => {
                const badge = statusBadge(p);
                const titleId = `kf-el-${p.id}`;
                const title = p.title || "Untitled take";
                const working = p.status === "PROCESSING" || p.status === "QUEUED";
                return (
                  <li key={p.id}>
                    <motion.article {...rise(i + (busyUpload ? 1 : 0))} className="card card-lift kf-el-card" aria-labelledby={titleId}>
                      <button type="button" className="kf-el-poster-btn" tabIndex={-1} aria-hidden="true" onClick={() => onOpen?.(p.id)}>
                        <EditPoster src={p.posterUrl ? mediaSrc(p.id, "poster") : null} orientation={p.orientation} pct={working ? p.overallPct ?? 0 : null} corner={lengthText(p) || null} />
                      </button>
                      <div style={{ padding: "14px 16px 12px", display: "grid", gap: 8, minWidth: 0 }}>
                        <h2 id={titleId} title={title} style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, lineHeight: 1.2, color: "var(--color-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {title}
                        </h2>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                          <EditStatusBadge badge={badge} />
                          {p.qaVerdict === "warn" && p.status !== "PROCESSING" && <span className="label-mono" title="Quality check flagged something">⚠ QA</span>}
                        </div>
                        <div className="label-mono" style={{ display: "flex", gap: 10, flexWrap: "wrap", fontVariantNumeric: "tabular-nums" }}>
                          {lengthText(p) && <span><span className="sr-only">Length </span>{lengthText(p)}</span>}
                          <span><span className="sr-only">Updated </span>{fmtWhen(p.updatedAt ?? p.createdAt, now)}</span>
                        </div>
                      </div>
                      <div className="kf-el-actions">
                        <button type="button" className="btn-ink" onClick={() => onOpen?.(p.id)} aria-describedby={titleId} style={{ minHeight: 44, padding: "9px 18px", fontSize: 13 }}>
                          Open
                        </button>
                        <button
                          type="button"
                          className="btn-chip"
                          onClick={() => askDelete(p)}
                          disabled={p.status === "DELETING"}
                          aria-label={`Delete ${title}`}
                          style={{ minHeight: 44, color: "var(--color-rec)", borderColor: "rgba(216,39,27,.35)" }}
                        >
                          Delete
                        </button>
                      </div>
                    </motion.article>
                  </li>
                );
              })}
            </ul>
          )}

          {page.status === "ready" && hasMore && (
            <div style={{ marginTop: 26, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <button type="button" className="link-mono" onClick={loadMore} disabled={extra.loading} style={{ minHeight: 44 }}>
                {extra.loading ? "LOADING…" : "LOAD MORE EDITS ↓"}
              </button>
              {extra.error && <span role="alert" style={{ fontSize: 13, color: "var(--color-rec)" }}>{extra.error}</span>}
            </div>
          )}
        </div>
      </section>

      <Dialog
        open={!!confirm}
        onClose={closeConfirm}
        dismissable={!deleting}
        title={<>Delete <em>{confirm?.title || "this edit"}</em>?</>}
        description="The upload, edit and exports are removed. This can't be undone."
        initialFocusRef={cancelRef}
        width={480}
        actions={(
          <>
            <button ref={cancelRef} type="button" className="btn-outline-dark btn-sm" onClick={closeConfirm} disabled={deleting} style={{ minHeight: 44 }}>
              Keep it
            </button>
            <button type="button" className="btn-ink" onClick={doDelete} disabled={deleting} aria-busy={deleting || undefined} style={{ minHeight: 44, background: "var(--color-rec)", color: "#fff" }}>
              {deleting ? "Deleting…" : "Delete edit"}
            </button>
          </>
        )}
      >
        {deleteError && <p role="alert" style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#ff6a3c" }}>{deleteError}</p>}
      </Dialog>

      <Toasts toasts={toasts} onDismiss={dismissToast} onDark={false} />
    </div>
  );
}
