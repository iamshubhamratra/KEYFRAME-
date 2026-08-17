import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { mediaUrl } from "../api.js";
import { IN_FLIGHT, STATUS, STATUS_TABS, fmtWhen, listTemplates } from "../adminApi.js";
import { AdminGate, Notice, OrientationChip, StatusBadge, ThumbBox } from "./AdminShared.jsx";
import { splitByOrientation } from "./Templates.jsx";

// ADMIN · THE TEMPLATE LIBRARY — every template the studio is building, in the
// same paper-and-spine voice as the public Templates page. This is the admin
// half of that page: same cards, but carrying the things only an admin needs
// (lifecycle status, version, who it belongs to, when it last moved).
export default function AdminTemplates(props) {
  return <AdminGate><Library {...props} /></AdminGate>;
}

function Library({ onOpen, onNew }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(null);   // null = All
  const [q, setQ] = useState("");

  // The whole list is fetched unfiltered even though the route takes ?status &
  // ?q: the tabs show COUNTS, and a count per tab from a filtered fetch is nine
  // requests per keystroke. The store's own filter is the same substring match
  // over name/slug/tags, so the two agree; at ~200 templates this is one request.
  useEffect(() => {
    let cancelled = false;
    listTemplates()
      .then((rows) => { if (!cancelled) { setList(Array.isArray(rows) ? rows : []); setError(null); } })
      // An empty list beside the error, rather than a spinner that never
      // resolves: the screen still offers "new template" if the API is down.
      .catch((e) => { if (!cancelled) { setError(e); setList([]); } });
    return () => { cancelled = true; };
  }, []);

  // A background refresh that fails keeps the last good board on screen. Losing
  // the library because one poll missed would strand an admin mid-pipeline.
  const refresh = useCallback(() => {
    listTemplates().then((rows) => setList(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, []);

  // Keep the board live while the server owns something: a GENERATING template
  // that only advances on a manual reload reads as a hung queue.
  const anyInFlight = (list || []).some((t) => IN_FLIGHT.has(t.status));
  useEffect(() => {
    if (!anyInFlight) return;
    const h = setTimeout(refresh, 5000);
    return () => clearTimeout(h);
  }, [anyInFlight, list, refresh]);

  const rows = useMemo(() => list || [], [list]);
  const counts = useMemo(() => {
    const c = {};
    for (const t of rows) c[t.status] = (c[t.status] || 0) + 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((t) => {
      if (tab && t.status !== tab) return false;
      if (!needle) return true;
      return String(t.name || "").toLowerCase().includes(needle)
        || String(t.slug || "").toLowerCase().includes(needle)
        || (t.tags || []).some((x) => String(x).toLowerCase().includes(needle));
    }).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [rows, tab, q]);

  // The public page's own split, so "how many of each shape do we have" is
  // counted the same way there and here. Templates carry `orientation`; the
  // split reads `portrait`, which is what the pack's rendered art reports.
  const groups = splitByOrientation(shown.map((t) => ({ ...t, portrait: t.orientation === "vertical" })));
  const live = rows.filter((t) => t.status === STATUS.PUBLISHED).length;

  return (
    <div>
      <section style={{ padding: "clamp(20px,4vw,50px) clamp(16px,4vw,60px) clamp(20px,3vw,32px)", maxWidth: 1200, margin: "0 auto" }}>
        <span className="scene-pill" style={{ "--tagc": "#e832a8" }}>ADMIN · TEMPLATE PIPELINE</span>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div>
            <h1 className="headline" style={{ fontSize: "clamp(34px,5.2vw,72px)", maxWidth: "16ch" }}>
              Build the look.<br /><span style={{ color: "var(--color-mag)" }}>Then ship it.</span>
            </h1>
            <p style={{ color: "var(--color-dim)", maxWidth: 520, margin: "18px 0 0", lineHeight: 1.6, fontSize: 15 }}>
              {rows.length} template{rows.length === 1 ? "" : "s"} in the pipeline · {live} live in the library ·{" "}
              {groups.horizontal.length} widescreen / {groups.vertical.length} vertical showing.
              Publishing moves a template's folder into <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>frames/</span> — nothing is live until it does.
            </p>
          </div>
          <button className="btn-mag" onClick={onNew} style={{ flexShrink: 0 }}>+ New template</button>
        </div>
      </section>

      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 clamp(16px,4vw,60px) clamp(70px,10vw,120px)" }}>
        <div style={{ borderTop: "1px solid rgba(23,19,14,.10)", paddingTop: 20, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div role="tablist" aria-label="Template status" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {STATUS_TABS.map((s) => {
              const n = s.key ? counts[s.key] || 0 : rows.length;
              const on = tab === s.key;
              return (
                <button key={s.label} role="tab" aria-selected={on} onClick={() => setTab(s.key)}
                  className={`chip-c on-paper ${on ? "is-active" : ""}`} style={{ "--chipc": s.c }}>
                  {s.label} <span style={{ opacity: 0.65, marginLeft: 4 }}>{n}</span>
                </button>
              );
            })}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 220, flex: "0 1 300px" }}>
            <span className="label-mono" style={{ flexShrink: 0 }}>FIND</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} className="admin-input"
              placeholder="name, slug or tag" aria-label="Search templates by name, slug or tag" spellCheck={false} />
          </label>
        </div>

        {error && (
          <Notice tone="error" title="The admin API did not answer" lines={[error.message]}>
            {error.status === 404 || error.status === 0
              ? "The template routes are not mounted on this server yet. The screen stays usable — reload once the backend is up."
              : "Nothing was changed. Retry, or check the server log."}
          </Notice>
        )}

        {list === null && !error ? (
          <p style={{ marginTop: 40, fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.14em", color: "var(--color-dim)" }}>LOADING THE LIBRARY…</p>
        ) : shown.length === 0 ? (
          <div style={{ marginTop: 40 }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em", color: "var(--color-dim)", lineHeight: 1.9 }}>
              {rows.length === 0
                ? "NO TEMPLATES YET — GENERATE THE FIRST ONE FROM A PROMPT."
                : "NOTHING MATCHES THIS FILTER."}
            </p>
            {rows.length === 0 && <button className="btn-ink" onClick={onNew} style={{ marginTop: 18 }}>Generate a template <span className="dot-mag">●</span></button>}
          </div>
        ) : (
          <motion.div key={`${tab}-${q}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: "easeOut" }}
            style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))", gap: 18 }}>
            {shown.map((t, i) => (
              <TemplateCard key={t.id || t.slug} t={t} delay={(i % 3) * 0.06} onOpen={() => onOpen?.(t.id)} />
            ))}
          </motion.div>
        )}
      </section>
    </div>
  );
}

// One template in the library — the public PackCard's anatomy (white card, color
// spine, scanlined art box) carrying the admin payload instead of pack lore. The
// spine takes the STATUS colour, so the board's state reads from across the room.
function TemplateCard({ t, delay = 0, onOpen }) {
  const [thumbDead, setThumbDead] = useState(false);
  const thumb = !thumbDead && t.thumbnail ? mediaUrl(t.thumbnail) : null;
  const version = t.currentVersion || 0;
  const published = t.publishedVersion;

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay }}
      className="card card-lift" style={{ overflow: "hidden", cursor: "pointer" }}
      role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
    >
      <span className="spine" style={{ "--spine": statusColor(t.status), zIndex: 5 }} />
      <ThumbBox src={thumb} orientation={t.orientation} alt="" onError={() => setThumbDead(true)}
        overlay={
          <>
            <span style={{ position: "absolute", top: 10, left: 14, zIndex: 3 }}><StatusBadge status={t.status} /></span>
            {version > 0 && (
              <span style={{ position: "absolute", right: 10, bottom: 10, zIndex: 3, padding: "3px 8px", borderRadius: 999, background: "rgba(9,7,5,.62)", backdropFilter: "blur(4px)", fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: ".14em", color: "#f2ede2" }}>
                V{version}{published != null ? ` · LIVE V${published}` : ""}
              </span>
            )}
          </>
        } />

      <div style={{ padding: "18px 18px 20px 23px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, margin: 0, minWidth: 0, color: "var(--color-ink)", letterSpacing: "-.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.name || t.slug}
          </h3>
          <OrientationChip orientation={t.orientation} />
        </div>
        <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--color-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t.slug}
        </div>
        {t.description && (
          <p style={{ color: "var(--color-dim)", fontSize: 13, lineHeight: 1.55, margin: "10px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {t.description}
          </p>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {t.category && <span className="chip" style={{ fontSize: 9, padding: "4px 9px", cursor: "default" }}>{t.category}</span>}
          {(t.tags || []).slice(0, 3).map((tag) => (
            <span key={tag} className="chip" style={{ fontSize: 9, padding: "4px 9px", cursor: "default", borderColor: "rgba(23,19,14,.12)", color: "var(--color-dim)" }}>#{tag}</span>
          ))}
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(23,19,14,.08)", display: "flex", justifyContent: "space-between", gap: 10, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)", textTransform: "uppercase" }}>
          <span>UPD {fmtWhen(t.updatedAt)}</span>
          <span>CRT {fmtWhen(t.createdAt)}</span>
        </div>
      </div>
    </motion.div>
  );
}

function statusColor(status) {
  return (STATUS_TABS.find((s) => s.key === status) || { c: "#7d766a" }).c;
}
