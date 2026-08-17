import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { adminListTemplates, mediaUrl } from "../api.js";

// ADMIN TEMPLATE DASHBOARD — the library of admin-authored templates.
//
// The public gallery (Templates.jsx) shows PUBLISHED packs and nothing else; this is the other
// side of that wall, and the only screen in the app where a draft is visible at all. It is
// deliberately built from the same v2 furniture as the gallery — paper page, scene pills, white
// cards with a colour spine — so an admin is not learning a second visual language to do the
// same kind of looking.
//
// THE STATUS VOCABULARY COMES FROM THE SERVER. /api/admin/templates returns `statuses` (the
// lifecycle table's own list) and every record carries its own `actions`. This file keeps a
// LABEL and a COLOUR per status and nothing else — no transition rules, no "can I publish this"
// logic. That is the whole reason the server ships those fields: a second copy of the state
// machine here is how "the button was there but the API said 409" happens.

// status -> how it reads and what colour it wears. Presentation only.
const STATUS_META = {
  DRAFT: { label: "Draft", c: "#7d766a" },
  GENERATING: { label: "Generating", c: "#ffb03a" },
  GENERATED: { label: "Generated", c: "#23c8e0" },
  TESTING: { label: "Testing", c: "#8b5cf6" },
  READY_TO_PUBLISH: { label: "Ready to publish", c: "#b9f24a" },
  PUBLISHED: { label: "Published", c: "#22c55e" },
  FAILED: { label: "Failed", c: "#d8271b" },
  ARCHIVED: { label: "Archived", c: "#9a9284" },
};
export const statusMeta = (s) => STATUS_META[s] || { label: String(s || "unknown"), c: "#7d766a" };

// The grouped view, used when no single status is selected. Every status in STATUS_META
// appears in exactly one group, so nothing can be filtered into invisibility by omission.
const SECTIONS = [
  ["IN PROGRESS", ["GENERATING", "TESTING"], "#ffb03a", "Running right now — this list refreshes itself"],
  ["DRAFTS", ["DRAFT", "GENERATED"], "#23c8e0", "Authored but not cleared for users"],
  ["READY TO PUBLISH", ["READY_TO_PUBLISH"], "#b9f24a", "QA passed — one act away from live"],
  ["PUBLISHED", ["PUBLISHED"], "#22c55e", "Live in the public template gallery"],
  ["FAILED", ["FAILED"], "#d8271b", "Generation or QA stopped with an error"],
  ["ARCHIVED", ["ARCHIVED"], "#9a9284", "Retired — re-enter by creating a new version"],
];

// A template is "live work" while the server says something is in flight for it (`busy`) or its
// status is one of the running ones. This is what turns the auto-refresh on, and it is derived
// from the record rather than from a local "I just clicked generate" flag — a generation
// started in another tab has to light this screen up too.
const isLive = (t) => !!t.busy || t.status === "GENERATING" || t.status === "TESTING";

export const fmtWhen = (ms) => {
  if (!ms) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" });
};

// The pack vocabulary ("portrait"/"landscape"/"square") and the job vocabulary
// ("vertical"/"horizontal"/"square") both reach this screen — records store the pack one, the
// generator form posts the job one. Both are read here so a label never comes out blank.
export const aspectLabel = (o) => {
  const s = String(o || "").toLowerCase();
  if (s === "portrait" || s === "vertical") return "9:16";
  if (s === "square") return "1:1";
  if (s === "landscape" || s === "horizontal") return "16:9";
  return "—";
};

export default function AdminTemplates({ onOpen, onNew, onBatch }) {
  const [rows, setRows] = useState(null);       // null = first load not finished
  const [statuses, setStatuses] = useState([]); // the server's lifecycle vocabulary
  // ONE ROW PER FAMILY, computed server-side (store.familySummaries): which version is live,
  // which is being worked on, what QA said and how many issues are open. Without it the
  // dashboard showed every VERSION as a separate template, which is exactly the confusion
  // versioning exists to remove.
  const [families, setFamilies] = useState([]);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [error, setError] = useState(null);

  // ONE loader for the pills, the search box and the auto-refresh. Filtering happens on the
  // server (store.list already matches name, slug and tag), so the client never holds a second
  // search implementation that could disagree with the one the API uses.
  const load = useCallback(async (opts = {}) => {
    try {
      const r = await adminListTemplates({ status: status === "all" ? undefined : status, q: q.trim() || undefined });
      setRows(r.templates || []);
      if (Array.isArray(r.statuses) && r.statuses.length) setStatuses(r.statuses);
      setFamilies(Array.isArray(r.families) ? r.families : []);
      setError(null);
    } catch (e) {
      // A failed BACKGROUND refresh must not blank a list the admin is reading — it only
      // reports on the load the admin actually asked for.
      if (!opts.background) { setError(e.message); setRows([]); }
    }
  }, [status, q]);

  // Debounced: typing in the search box would otherwise fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 220);
    return () => clearTimeout(t);
  }, [load]);

  // Auto-refresh while anything is running. The dashboard has no event stream of its own (the
  // SSE route is per-template), so this is a poll — but only while there is something to watch,
  // and the interval is torn down the moment the last generation lands.
  const anyLive = !!rows && rows.some(isLive);
  useEffect(() => {
    if (!anyLive) return undefined;
    const t = setInterval(() => load({ background: true }), 3000);
    return () => clearInterval(t);
  }, [anyLive, load]);

  const list = rows || [];
  const groups = SECTIONS
    .map(([title, keys, accent, sub]) => [title, accent, sub, list.filter((t) => keys.includes(t.status))])
    .filter(([, , , g]) => g.length);

  return (
    <div className="pb-24">
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(20px,4vw,50px) clamp(16px,4vw,60px) 0" }}>
        <span className="scene-pill" style={{ "--tagc": "#8b5cf6" }}>ADMIN · TEMPLATE LIBRARY</span>
        <h1 className="headline" style={{ fontSize: "clamp(34px,5.4vw,72px)", maxWidth: "16ch" }}>
          Author the <span style={{ color: "var(--color-mag)" }}>look</span> everyone else picks.
        </h1>
        <p style={{ color: "var(--color-dim)", maxWidth: 620, margin: "18px 0 0", lineHeight: 1.6, fontSize: 15.5 }}>
          Templates are generated, reviewed, tested and only then published. Nothing here is
          visible to users until it reaches <b style={{ color: "var(--color-ink)", fontWeight: 600 }}>Published</b>.
        </p>

        {/* ---- the generator entry ---- */}
        <div className="card" style={{ marginTop: 30, padding: "22px 24px 22px 29px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <span className="spine" style={{ "--spine": "#e832a8" }} />
          <div style={{ minWidth: 240, flex: 1 }}>
            <div className="label-mono" style={{ marginBottom: 6 }}>TEMPLATE GENERATOR</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, color: "var(--color-ink)", letterSpacing: "-.01em" }}>
              Describe a template. It designs, compiles and checks itself.
            </div>
            <p style={{ color: "var(--color-dim)", fontSize: 13.5, lineHeight: 1.55, margin: "8px 0 0" }}>
              One prompt becomes a validated design spec, a composer module and a real rendered
              still set — ready for review in a couple of minutes.
            </p>
          </div>
          <button className="btn-mag" onClick={onNew} style={{ padding: "12px 26px" }}>New template →</button>
          {/* The unattended path: plan N directions and build them one at a time. */}
          <button className="btn-chip" onClick={onBatch} style={{ padding: "12px 22px" }}>Generate a batch</button>
        </div>

        {/* ---- filters + search ---- */}
        <div style={{ marginTop: 26, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <FilterPill active={status === "all"} onClick={() => setStatus("all")} c="#17130e" label="All" n={status === "all" ? list.length : null} />
          {statuses.map((s) => {
            const m = statusMeta(s);
            return <FilterPill key={s} active={status === s} onClick={() => setStatus(s)} c={m.c} label={m.label}
              n={status === s ? list.length : list.filter((t) => t.status === s).length} />;
          })}
          <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
            <span className="label-mono">SEARCH</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name, slug or tag"
              className="field" aria-label="Search templates by name, slug or tag"
              style={{ flex: 1, padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 12 }} />
          </label>
        </div>

        {error && (
          <p style={{ marginTop: 16, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-rec)" }}>{error}</p>
        )}
      </section>

      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "26px clamp(16px,4vw,60px) 0" }}>
        {rows === null && <Muted>Loading the library…</Muted>}

        {/* THE FAMILIES THAT HAVE HISTORY. A single-version family with no issues is fully
            described by its card below, so listing it here would be noise. */}
        {rows !== null && status === "all" && !q.trim() && (() => {
          const withHistory = families.filter((f) => f.versionCount > 1 || f.openIssues > 0 || f.draft);
          if (!withHistory.length) return null;
          return (
            <div className="card" style={{ padding: "18px 22px 20px 27px", marginBottom: "clamp(28px,4vw,44px)" }}>
              <span className="spine" style={{ "--spine": "#c8452d" }} />
              <div className="label-mono" style={{ marginBottom: 14 }}>TEMPLATES WITH VERSIONS OR OPEN ISSUES</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {withHistory.map((f) => (
                  <div key={f.family} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingBottom: 10, borderBottom: "1px solid rgba(23,19,14,.07)" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>{f.name}</span>
                    {f.published
                      ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "#2f7d32" }}>LIVE V{f.published.version}{f.published.qaScore != null ? ` · QA ${f.published.qaScore}` : ""}</span>
                      : <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--color-dim)" }}>NOT LIVE</span>}
                    {f.draft && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--color-dim)" }}>
                        WORKING ON V{f.draft.version} · {f.draft.status}
                      </span>
                    )}
                    {f.lastTest && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: f.lastTest.state === "done" ? "#2f7d32" : "var(--color-dim)" }}>
                        TEST {String(f.lastTest.state).toUpperCase()}
                      </span>
                    )}
                    {!!f.openIssues && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "#c8452d" }}>{f.openIssues} OPEN ISSUE{f.openIssues === 1 ? "" : "S"}</span>
                    )}
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--color-dim)" }}>{f.versionCount} VERSION{f.versionCount === 1 ? "" : "S"}</span>
                    <button className="link-mono" style={{ marginLeft: "auto" }} onClick={() => onOpen?.((f.draft || f.published).id)}>OPEN →</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {rows !== null && list.length === 0 && (
          <div className="card" style={{ padding: "40px 26px", textAlign: "center" }}>
            <span className="spine" style={{ "--spine": "#7d766a" }} />
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--color-ink)" }}>
              {q.trim() || status !== "all" ? "Nothing matches that filter." : "No templates yet."}
            </div>
            <p style={{ color: "var(--color-dim)", fontSize: 13.5, margin: "8px 0 18px" }}>
              {q.trim() || status !== "all" ? "Clear the search or pick another status." : "Generate the first one — it takes a prompt and a name."}
            </p>
            {!q.trim() && status === "all" && <button className="btn-ink" onClick={onNew}>New template</button>}
          </div>
        )}

        {/* A single status filter shows ONE flat grid; "All" shows the grouped library. The two
            are exclusive on purpose — rendering the grid AND the groups would print every card
            twice, which reads as a duplicated template rather than as two views. */}
        {rows !== null && list.length > 0 && status !== "all" && (
          <Grid list={list} onOpen={onOpen} />
        )}

        {rows !== null && list.length > 0 && status === "all" && groups.map(([title, accent, sub, group]) => (
          <div key={title} style={{ marginBottom: "clamp(34px,5vw,56px)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", margin: "0 0 18px" }}>
              <span className="scene-pill" style={{ "--tagc": accent }}>{title}</span>
              <span style={{ color: "var(--color-dim)", fontSize: 13 }}>{sub}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--color-dim)", marginLeft: "auto" }}>
                {group.length} TEMPLATE{group.length === 1 ? "" : "S"}
              </span>
            </div>
            <Grid list={group} onOpen={onOpen} />
          </div>
        ))}
      </section>
    </div>
  );
}

function Grid({ list, onOpen }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 16 }}>
      {list.map((t, i) => <TemplateCard key={t.id} t={t} delay={(i % 4) * 0.05} onOpen={() => onOpen?.(t.id)} />)}
    </div>
  );
}

function Muted({ children }) {
  return <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--color-dim)", textTransform: "uppercase" }}>{children}</p>;
}

function FilterPill({ active, onClick, c, label, n }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`chip-c on-paper ${active ? "is-active" : ""}`} style={{ "--chipc": c }}>
      {label}{n ? ` · ${n}` : ""}
    </button>
  );
}

// One template card. Everything the dashboard is required to show is on it: thumbnail, name,
// orientation, status, version, category, created and updated.
export function TemplateCard({ t, delay = 0, onOpen }) {
  const m = statusMeta(t.status);
  // A generated template's thumbnail is its first STILL until it publishes and gets a real
  // poster; both are backend-relative and go through mediaUrl for the split deploy.
  const thumb = mediaUrl(t.thumbnail || (t.stills || [])[0] || null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay }}
      className="card card-lift"
      style={{ overflow: "hidden", cursor: "pointer" }}
      role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(); } }}
      aria-label={`Open ${t.name}`}
    >
      <span className="spine" style={{ "--spine": m.c, zIndex: 5 }} />

      {/* The dashboard mixes aspects in ONE grid, so the frame stays uniform and CONTAINS the
          still rather than cropping it — the same choice (and the same reason) as the compact
          PackCard in the create screen: a 9:16 template cropped into a 16:10 box is reduced to
          a horizontal sliver of itself. */}
      <div style={{ aspectRatio: "16 / 10", position: "relative", overflow: "hidden", background: "var(--color-ground-2)", display: "grid", placeItems: "center" }}>
        {thumb
          ? <img src={thumb} alt={`${t.name} preview frame`} loading="lazy" draggable={false}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
          : <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.18em", color: "var(--color-dim)", textAlign: "center", padding: "0 14px" }}>
              {t.status === "DRAFT" ? "NOT GENERATED YET" : "NO PREVIEW FRAME"}
            </span>}
        <span style={{ position: "absolute", top: 10, left: 14, zIndex: 3, display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "rgba(23,19,14,.82)", backdropFilter: "blur(4px)", fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.16em", textTransform: "uppercase", color: m.c }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.c, animation: isLive(t) ? "kf2-blink 1s steps(1) infinite" : "none" }} />
          {t.busy ? t.busy : m.label}
        </span>
        <span style={{ position: "absolute", top: 10, right: 12, zIndex: 3, fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.16em", color: "#f2ede2", background: "rgba(23,19,14,.7)", padding: "4px 9px", borderRadius: 999 }}>
          {aspectLabel(t.orientation)} · V{t.version}
        </span>
        {/* Live progress rides the bottom edge of the frame, so a running template shows what it
            is doing without opening it. */}
        {isLive(t) && (
          <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 4, height: 4, background: "rgba(23,19,14,.16)" }}>
            <span style={{ display: "block", height: "100%", width: `${Math.max(4, Math.min(100, Number(t.progressPct) || 0))}%`, background: `linear-gradient(90deg, var(--color-mag), ${m.c})`, transition: "width .5s ease" }} />
          </span>
        )}
      </div>

      <div style={{ padding: "16px 18px 18px 23px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, margin: 0, color: "var(--color-ink)", letterSpacing: "-.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t.name}
          </h3>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: m.c, whiteSpace: "nowrap" }}>{t.category || "—"}</span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.1em", color: "var(--color-dim)", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t.slug}
        </div>
        {isLive(t) && t.progress && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.1em", color: m.c, marginTop: 8 }}>{String(t.progress).toUpperCase()}…</div>
        )}
        {t.status === "FAILED" && t.error && (
          <div title={t.error} style={{ fontSize: 12, lineHeight: 1.45, color: "var(--color-rec)", marginTop: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {t.error}
          </div>
        )}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
          <span>CREATED {fmtWhen(t.createdAt)}</span>
          <span>UPDATED {fmtWhen(t.updatedAt)}</span>
        </div>
      </div>
    </motion.div>
  );
}
