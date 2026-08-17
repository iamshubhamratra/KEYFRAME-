import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  CAMPAIGN_THEMES, MAX_AUTO_BATCH, autoBatchStatus, cancelAutoBatch, startAutoBatch,
} from "../adminApi.js";
import { Notice, PanelHead } from "./AdminShared.jsx";

// ADMIN · AUTO FORGE — the brief form's opposite.
//
// The form next to this one asks for intent, which is right when you know what
// you want and pure friction when you just want the library filled. This asks
// for one number.
//
// The briefs come from a curated server-side pool rather than from the model:
// ask any model for "a template idea" fifteen times and it returns the same
// three moods in different words, and every brief has to be a subject the six
// renderer families can actually carry. Each run round-robins the families, so
// six templates already cover the whole renderer set.
//
// THE BATCH LIVES ON THE SERVER. Every template goes generate -> preview -> QA,
// and the two render passes are ~2 minutes each, so fifteen templates is about
// an hour — far longer than a tab reliably stays open. This screen starts the
// run and then polls it; closing the browser costs nothing, and re-opening the
// screen re-attaches to whatever is still going.
const STAGE_LABEL = {
  queued: "QUEUED", generating: "WRITING SPEC", previewing: "RENDERING",
  qa: "CHECKING", done: "DONE", failed: "FAILED",
};
const STAGE_COLOR = {
  done: "var(--color-cy)", failed: "#ff6a3c",
  queued: "#7d766a", generating: "#9a9284", previewing: "#9a9284", qa: "#9a9284",
};
// generate ~3s + preview ~2min + QA ~2min, measured on an 8-core box.
const MIN_PER_TEMPLATE = 4.2;

const mono = (size, color, extra = {}) => ({
  fontFamily: "var(--font-mono)", fontSize: size, letterSpacing: "0.12em", color, ...extra,
});

export default function AutoPanel({ onOpen }) {
  const [count, setCount] = useState(5);
  const [requirement, setRequirement] = useState("");
  // A campaign usually ships to ONE surface, so the aspect is a run-wide choice.
  const [orientation, setOrientation] = useState("vertical");
  const [batch, setBatch] = useState(null);
  const [available, setAvailable] = useState(MAX_AUTO_BATCH);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef(null);

  const running = !!batch && batch.running;

  // Poll while a batch is live, and once on mount so a run started before a
  // refresh (or in another tab) shows up here instead of looking idle.
  useEffect(() => {
    let dead = false;
    async function tick() {
      try {
        const s = await autoBatchStatus();
        if (dead) return;
        setBatch(s?.batch || null);
        if (Number.isFinite(s?.available)) setAvailable(s.available);
        timer.current = setTimeout(tick, s?.batch?.running ? 3000 : 15000);
      } catch {
        if (!dead) timer.current = setTimeout(tick, 15000);
      }
    }
    tick();
    return () => { dead = true; if (timer.current) clearTimeout(timer.current); };
  }, []);

  const ceiling = Math.max(1, Math.min(MAX_AUTO_BATCH, available || MAX_AUTO_BATCH));
  const n = Math.min(count, ceiling);

  async function start() {
    setError(null);
    setStarting(true);
    try {
      setBatch(await startAutoBatch(n, requirement, orientation));
    } catch (e) {
      setError(e?.body?.error || e.message || "could not start the batch");
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    try {
      setBatch(await cancelAutoBatch());
    } catch (e) {
      setError(e?.body?.error || e.message);
    }
  }

  const done = batch ? batch.done : 0;
  const failed = batch ? batch.failed : 0;
  const total = batch ? batch.count : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="editor-card" style={{ marginTop: 36 }}
    >
      <PanelHead
        title="OPTION 2 — CAMPAIGN"
        status={running ? `● BUILDING ${batch.currentIndex + 1}/${total}` : "● IDLE"}
      />
      <div style={{ padding: 24 }}>
        <p style={{ ...mono(10, "#9a9284"), margin: 0 }}>
          NAME A SUBJECT AND A NUMBER — UP TO {MAX_AUTO_BATCH} TEMPLATES, EACH ON A DIFFERENT ANGLE,
          EACH WITH ITS OWN ANIMATION. WRITTEN, RENDERED AND CHECKED IN TURN.
        </p>

        {!running && (
          <div style={{ marginTop: 18 }}>
            <label style={{ display: "block" }}>
              <span style={{ ...mono(9, "#9a9284", { letterSpacing: "0.18em" }), display: "block", marginBottom: 6 }}>
                SUBJECT
              </span>
              <input
                value={requirement} onChange={(e) => setRequirement(e.target.value)} spellCheck={false}
                placeholder="mars exploration — or leave blank for a mixed set"
                className="editor-inset w-full" style={{ padding: "12px 14px" }}
              />
            </label>
            <div style={{ marginTop: 16 }}>
              <span style={{ ...mono(9, "#9a9284", { letterSpacing: "0.18em" }), display: "block", marginBottom: 8 }}>
                ORIENTATION
              </span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { key: "vertical", label: "Vertical", ratio: "9:16 · REELS", c: "#7a5cff" },
                  { key: "horizontal", label: "Horizontal", ratio: "16:9 · WIDE", c: "#e832a8" },
                  { key: "mixed", label: "Mixed", ratio: "ALTERNATING", c: "#2ad4c4" },
                ].map((o) => {
                  const on = orientation === o.key;
                  return (
                    <button
                      key={o.key} onClick={() => setOrientation(o.key)}
                      style={{
                        cursor: "pointer", textAlign: "left", padding: "10px 14px", borderRadius: 10,
                        background: on ? "rgba(255,255,255,0.06)" : "transparent",
                        border: `1px solid ${on ? o.c : "rgba(255,255,255,0.12)"}`,
                        opacity: on ? 1 : 0.6, transition: "opacity .15s, border-color .15s",
                      }}
                    >
                      <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>
                        {o.label}
                      </span>
                      <span style={{ ...mono(9, on ? o.c : "#7d766a", { letterSpacing: "0.14em" }) }}>{o.ratio}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CAMPAIGN_THEMES.slice(0, 12).map((t) => (
                <button
                  key={t} onClick={() => setRequirement(t)}
                  className="btn-chip"
                  style={{
                    fontSize: 10, padding: "5px 11px",
                    opacity: requirement === t ? 1 : 0.62,
                    borderColor: requirement === t ? "var(--color-mag)" : undefined,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {!running && (
          <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={mono(9, "#9a9284", { letterSpacing: "0.18em" })}>HOW MANY</span>
              <input
                type="range" min={1} max={ceiling} value={n}
                onChange={(e) => setCount(Number(e.target.value))}
                style={{ width: 180, accentColor: "var(--color-mag)" }}
              />
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, minWidth: 34, textAlign: "center" }}>
                {n}
              </span>
            </label>
            <span style={mono(9, "#7d766a", { letterSpacing: "0.1em" })}>
              ≈ {Math.round(n * MIN_PER_TEMPLATE)} MIN · {available} BRIEF{available === 1 ? "" : "S"} LEFT · MAX {MAX_AUTO_BATCH}
            </span>
            <button
              onClick={start} disabled={starting} className="btn-mag"
              style={{ padding: "11px 24px", fontSize: 14, marginLeft: "auto" }}
            >
              {starting ? "Starting…" : "Auto generate →"}
            </button>
          </div>
        )}

        {batch && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", ...mono(10, "#9a9284", { letterSpacing: "0.14em" }) }}>
              <span style={{ color: "var(--color-cy)" }}>✓ {done} DONE</span>
              {failed > 0 && <span style={{ color: "#ff6a3c" }}>✗ {failed} FAILED</span>}
              <span>{total} TOTAL</span>
              {batch.cancelled && <span style={{ color: "#ff6a3c" }}>CANCELLED</span>}
              {running && (
                <button onClick={stop} className="link-mono" style={{ marginLeft: "auto", color: "#ff6a3c" }}>
                  STOP AFTER THIS ONE
                </button>
              )}
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
              {batch.items.map((it, i) => {
                const active = i === batch.currentIndex && running;
                return (
                  <div
                    key={it.slug}
                    onClick={() => it.templateId && onOpen && onOpen(it.templateId)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 8,
                      cursor: it.templateId ? "pointer" : "default",
                      background: active ? "rgba(255,255,255,0.05)" : "transparent",
                      border: `1px solid ${active ? "rgba(255,255,255,0.14)" : "transparent"}`,
                    }}
                  >
                    <span style={{ ...mono(10, "#7d766a"), minWidth: 22 }}>{String(i + 1).padStart(2, "0")}</span>
                    <span style={{
                      fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, flex: 1, minWidth: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {it.name}
                    </span>
                    <span style={mono(9, "#7d766a", { letterSpacing: "0.1em" })}>
                      {it.family} · {it.orientation === "vertical" ? "9:16" : "16:9"}
                    </span>
                    {it.qaScore != null && (
                      <span style={mono(10, it.qaScore >= 80 ? "var(--color-cy)" : "#9a9284")}>QA {it.qaScore}</span>
                    )}
                    <span title={it.error || ""} style={{
                      ...mono(9, STAGE_COLOR[it.stage] || "#9a9284", { letterSpacing: "0.14em" }),
                      minWidth: 92, textAlign: "right",
                    }}>
                      {STAGE_LABEL[it.stage] || String(it.stage).toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>

            {batch.poolExhausted && (
              <p style={{ marginTop: 10, ...mono(9, "#ff6a3c", { letterSpacing: "0.1em" }) }}>
                THE BRIEF POOL RAN OUT — BUILT {total} OF THE {batch.requested} REQUESTED
              </p>
            )}
          </div>
        )}

        {error && <div style={{ marginTop: 14 }}><Notice tone="bad">{error}</Notice></div>}
      </div>
    </motion.div>
  );
}
