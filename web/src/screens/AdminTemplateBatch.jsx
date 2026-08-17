import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  adminCancelBatch, adminGetBatch, adminListBatches, adminStartBatch, mediaUrl, subscribeBatch,
} from "../api.js";
import { fmtWhen } from "./AdminTemplates.jsx";

// BATCH GENERATION — "make me ten templates", watched.
//
// TWO SCREENS IN ONE, because they are one task: the configuration you fill in once, and the run
// it produces. Once a batch is running the form is replaced by the ledger rather than sitting
// above it, so there is never a "Start" button next to a run in progress.
//
// PROGRESS COMES FROM THE SERVER, WHOLE. Every SSE frame is the entire shaped batch — the same
// contract the single-template stream uses — so this screen replaces its state rather than
// reconciling events. There is no event vocabulary here to drift from the orchestrator's.

const ITEM_LOOK = {
  WAITING: { mark: "○", c: "var(--color-dim)", label: "Waiting" },
  GENERATING: { mark: "⟳", c: "var(--color-mag)", label: "Designing" },
  TESTING: { mark: "⟳", c: "var(--color-mag)", label: "Rendering a test film" },
  QUALITY_CHECK: { mark: "⟳", c: "var(--color-mag)", label: "Quality checks" },
  PUBLISHING: { mark: "⟳", c: "var(--color-mag)", label: "Publishing" },
  PUBLISHED: { mark: "✓", c: "#2f7d32", label: "Published" },
  REJECTED: { mark: "≈", c: "#b8860b", label: "Rejected — too similar" },
  FAILED: { mark: "✗", c: "#c8452d", label: "Failed" },
  CANCELLED: { mark: "–", c: "var(--color-dim)", label: "Cancelled" },
};

const STYLES = ["Modern Premium", "Editorial", "Playful", "Minimal Luxury", "Bold Geometric", "Cinematic", "Technical / Data"];
const CATEGORIES = ["Technology", "SaaS", "Finance", "Health", "Retail", "Education", "Food", "Travel", "Creative"];

export default function AdminTemplateBatch({ onBack, onOpenTemplate }) {
  const [cfg, setCfg] = useState({
    count: 5, orientation: "portrait", style: "Modern Premium", category: "Technology",
    industry: "", animation: "medium", colorDirection: "", duration: "", instructions: "",
  });
  const [batch, setBatch] = useState(null);
  const [recent, setRecent] = useState([]);
  const [thresholds, setThresholds] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const unsub = useRef(null);

  const follow = useCallback((id) => {
    unsub.current?.();
    unsub.current = subscribeBatch(id, {
      onUpdate: (b) => setBatch(b),
      // The stream ends itself when the run is terminal; one last read picks up the final tally.
      onClose: () => { adminGetBatch(id).then((r) => setBatch(r.batch)).catch(() => {}); },
    });
  }, []);

  useEffect(() => {
    let alive = true;
    adminListBatches()
      .then((r) => {
        if (!alive) return;
        setRecent(r.batches || []);
        setThresholds(r.thresholds || null);
        // Re-attach to a run that is still going — reloading the page must not lose the view of it.
        const live = (r.batches || []).find((b) => !b.isTerminal);
        if (live) { setBatch(live); follow(live.id); }
      })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; unsub.current?.(); };
  }, [follow]);

  async function start() {
    setStarting(true); setError(null);
    try {
      const r = await adminStartBatch({ ...cfg, count: Number(cfg.count) || 1, duration: cfg.duration ? Number(cfg.duration) : undefined });
      setBatch(r.batch);
      follow(r.batch.id);
    } catch (e) { setError(e.message); }
    finally { setStarting(false); }
  }

  async function cancel() {
    if (!batch) return;
    if (!window.confirm("Cancel this batch? The template being worked on finishes its current step; nothing further is started. Anything already published stays published.")) return;
    try { const r = await adminCancelBatch(batch.id); setBatch(r.batch); }
    catch (e) { setError(e.message); }
  }

  const t = batch && batch.tally;
  const input = { width: "100%", boxSizing: "border-box", padding: "9px 12px", fontSize: 13.5 };

  return (
    <div className="pb-24">
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(20px,4vw,50px) clamp(16px,4vw,60px) 0" }}>
        <button className="link-mono" onClick={onBack}>← TEMPLATE LIBRARY</button>
        <h1 className="headline" style={{ fontSize: "clamp(28px,4.4vw,44px)", margin: "14px 0 6px" }}>Generate a batch</h1>
        <p style={{ color: "var(--color-dim)", fontSize: 14.5, lineHeight: 1.6, maxWidth: 680 }}>
          KEYFRAME plans one creative direction per template, then builds them one at a time — generating,
          test-rendering a real film, running the full quality check, and publishing only what passes.
          Anything too close to a template you already have is rejected and redesigned.
        </p>
        {thresholds && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--color-dim)", marginTop: 10 }}>
            QUALITY FLOOR {thresholds.minQuality} · UNIQUENESS FLOOR {thresholds.minUniqueness} · UP TO {thresholds.maxAttempts} ATTEMPTS EACH
          </p>
        )}
        {error && <p style={{ marginTop: 14, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-rec)" }}>{error}</p>}
      </section>

      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "24px clamp(16px,4vw,60px) 0", display: "grid", gap: 18 }}>
        {/* ---- CONFIGURATION (hidden while a run is live: one job at a time) ---- */}
        {(!batch || batch.isTerminal) && (
          <div className="card" style={{ padding: "22px 24px 24px 29px" }}>
            <span className="spine" style={{ "--spine": "#c8452d" }} />
            <div className="label-mono" style={{ marginBottom: 16 }}>CONFIGURATION</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 13 }}>
              <Field label="HOW MANY">
                <input className="field" type="number" min={1} max={25} style={input}
                  value={cfg.count} onChange={(e) => setCfg({ ...cfg, count: e.target.value })} />
              </Field>
              <Field label="ORIENTATION">
                <select className="field" style={input} value={cfg.orientation} onChange={(e) => setCfg({ ...cfg, orientation: e.target.value })}>
                  <option value="portrait">9:16 portrait</option>
                  <option value="landscape">16:9 landscape</option>
                </select>
              </Field>
              <Field label="STYLE">
                <select className="field" style={input} value={cfg.style} onChange={(e) => setCfg({ ...cfg, style: e.target.value })}>
                  {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="CATEGORY">
                <select className="field" style={input} value={cfg.category} onChange={(e) => setCfg({ ...cfg, category: e.target.value })}>
                  {CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="ANIMATION">
                <select className="field" style={input} value={cfg.animation} onChange={(e) => setCfg({ ...cfg, animation: e.target.value })}>
                  <option value="low">Low — restrained</option>
                  <option value="medium">Medium</option>
                  <option value="high">High — kinetic</option>
                </select>
              </Field>
              <Field label="INDUSTRY (OPTIONAL)">
                <input className="field" style={input} placeholder="AI, fintech, developer tools…"
                  value={cfg.industry} onChange={(e) => setCfg({ ...cfg, industry: e.target.value })} />
              </Field>
              <Field label="COLOUR DIRECTION (OPTIONAL)">
                <input className="field" style={input} placeholder="e.g. dark, one electric accent"
                  value={cfg.colorDirection} onChange={(e) => setCfg({ ...cfg, colorDirection: e.target.value })} />
              </Field>
              <Field label="FILM LENGTH (OPTIONAL)">
                <input className="field" type="number" min={8} max={60} style={input} placeholder="seconds"
                  value={cfg.duration} onChange={(e) => setCfg({ ...cfg, duration: e.target.value })} />
              </Field>
            </div>
            <div style={{ marginTop: 13 }}>
              <Field label="ADDITIONAL INSTRUCTIONS">
                <textarea className="field resize-none" style={{ ...input, minHeight: 76 }}
                  placeholder="Premium templates for AI, SaaS and startup promotional videos."
                  value={cfg.instructions} onChange={(e) => setCfg({ ...cfg, instructions: e.target.value })} />
              </Field>
            </div>
            <div style={{ marginTop: 17, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <button className="btn-ink" disabled={starting} onClick={start}>
                {starting ? "Starting…" : `Generate ${Number(cfg.count) || 1} template${Number(cfg.count) === 1 ? "" : "s"}`}
              </button>
              <span style={{ fontSize: 13, color: "var(--color-dim)", lineHeight: 1.5 }}>
                Each one is designed, rendered, tested and quality-checked in turn. Expect several minutes per template.
              </span>
            </div>
          </div>
        )}

        {/* ---- THE RUN ---- */}
        {batch && (
          <div className="card" style={{ padding: "22px 24px 24px 29px" }}>
            <span className="spine" style={{ "--spine": batch.isTerminal ? "#7d766a" : "#c8452d" }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <div className="label-mono">{batch.isTerminal ? "BATCH COMPLETE" : "GENERATING"}</div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", color: "var(--color-dim)" }}>{batch.status}</span>
              {!batch.isTerminal && (
                <button className="link-mono" style={{ marginLeft: "auto" }} onClick={cancel}>CANCEL BATCH</button>
              )}
            </div>

            <div style={{ height: 8, background: "rgba(23,19,14,.08)", borderRadius: 99, overflow: "hidden" }}>
              <motion.div
                animate={{ width: `${batch.progressPct}%` }} transition={{ duration: 0.4 }}
                style={{ height: "100%", background: batch.isTerminal ? "#2f7d32" : "var(--color-mag)" }}
              />
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "11px 0 4px", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
              <span>{t.finished} / {t.requested} DONE</span>
              <span style={{ color: "#2f7d32" }}>{t.published} PUBLISHED</span>
              {!!t.rejected && <span style={{ color: "#b8860b" }}>{t.rejected} REJECTED</span>}
              {!!t.failed && <span style={{ color: "#c8452d" }}>{t.failed} FAILED</span>}
              {t.avgQuality != null && <span>AVG QUALITY {t.avgQuality}</span>}
              {t.avgUniqueness != null && <span>AVG UNIQUENESS {t.avgUniqueness}</span>}
            </div>
            <p style={{ fontSize: 13.5, color: "var(--color-dim)", margin: "6px 0 16px" }}>{batch.progress}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {(batch.items || []).map((it) => {
                const look = ITEM_LOOK[it.state] || ITEM_LOOK.WAITING;
                return (
                  <div key={it.index} style={{ display: "flex", alignItems: "flex-start", gap: 11, flexWrap: "wrap", paddingBottom: 9, borderBottom: "1px solid rgba(23,19,14,.07)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: look.c, width: 14 }}>{look.mark}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--color-dim)", width: 24 }}>{String(it.index).padStart(2, "0")}</span>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14.5, minWidth: 150 }}>
                      {it.name || (it.direction && it.direction.name) || "…"}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: look.c, textTransform: "uppercase" }}>{look.label}</span>
                    {it.qaScore != null && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--color-dim)" }}>QA {it.qaScore}</span>}
                    {it.uniqueness != null && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
                        UNIQ {it.uniqueness}{it.similarTo ? ` (≈ ${it.similarTo})` : ""}
                      </span>
                    )}
                    {it.attempts > 1 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "#b8860b" }}>ATTEMPT {it.attempts}</span>}
                    {it.templateId && <button className="link-mono" style={{ marginLeft: "auto" }} onClick={() => onOpenTemplate?.(it.templateId)}>OPEN →</button>}
                    {it.direction && it.direction.identity && (
                      <span style={{ flexBasis: "100%", fontSize: 13, lineHeight: 1.5, color: "var(--color-dim)", paddingLeft: 49 }}>{it.direction.identity}</span>
                    )}
                    {it.error && (
                      <span style={{ flexBasis: "100%", fontSize: 12.5, lineHeight: 1.5, color: "#c8452d", paddingLeft: 49 }}>{it.error}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ---- EARLIER RUNS ---- */}
        {!!recent.length && (!batch || batch.isTerminal) && (
          <div className="card" style={{ padding: "20px 22px 22px 27px" }}>
            <span className="spine" style={{ "--spine": "#7d766a" }} />
            <div className="label-mono" style={{ marginBottom: 13 }}>EARLIER BATCHES</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {recent.filter((b) => !batch || b.id !== batch.id).slice(0, 8).map((b) => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingBottom: 8, borderBottom: "1px solid rgba(23,19,14,.07)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--color-dim)" }}>{b.status}</span>
                  <span style={{ fontSize: 13.5 }}>{b.tally.published}/{b.requestedCount} published</span>
                  {b.tally.avgQuality != null && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-dim)" }}>AVG {b.tally.avgQuality}</span>}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--color-dim)" }}>{fmtWhen(b.createdAt)}</span>
                  <button className="link-mono" style={{ marginLeft: "auto" }} onClick={() => { setBatch(b); if (!b.isTerminal) follow(b.id); }}>VIEW →</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="label-mono">{label}</span>
      {children}
    </label>
  );
}
