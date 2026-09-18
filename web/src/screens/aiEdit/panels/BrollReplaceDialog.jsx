import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Dialog from "../../../components/Dialog.jsx";
import { useEditor, useEditorActions } from "../../../editState.js";
import { findItem } from "../../../editModel.js";
import { errorCopy, COST_HINT_COPY } from "../../../editFormat.js";
import { CostHint } from "../ItemCard.jsx";

// REPLACE B-ROLL (UX.md §1d panel 3) — two tabs: Suggestions (the slot's stored candidates, free) and
// Search stock (a stock search, no AI). Results arrive over the live stream as `candidates` events; a
// short poll of GET /candidates covers transports that don't carry them. Each tile shows the source,
// length and whether it fits the frame or will be cropped; picking one replaces the clip.

const PROVIDERS = { pexels: "PEXELS", pixabay: "PIXABAY", openverse: "OPENVERSE", user: "YOURS", screenshot: "SCREENSHOT" };

function fits(c, aspect) {
  if (!c?.w || !c?.h) return null;
  const r = c.w / c.h;
  if (aspect === "9:16") return r < 0.8;
  if (aspect === "16:9") return r > 1.3;
  return r > 0.85 && r < 1.18;
}
const mergeById = (a, b) => { const seen = new Set(a.map((c) => c.id)); return [...a, ...b.filter((c) => !seen.has(c.id))]; };

function CandidateTile({ c, aspect, onPick }) {
  const f = useEditorActions();
  const thumb = useSyncExternalStore(f.media.subscribe, () => (c.thumbUrl && String(c.thumbUrl).startsWith("data:") ? c.thumbUrl : f.media.get("broll-thumb", c.id)));
  useEffect(() => { f.media.request("broll-thumb", c.id); }, [f, c.id]);
  const fit = fits(c, aspect);
  const source = PROVIDERS[c.provider] || String(c.provider || "STOCK").toUpperCase();
  const secs = Math.round(Number(c.durationSec) || 0);
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(c)}
        disabled={c.used}
        aria-label={`${c.used ? "In use now" : "Use this clip"}: ${source}, ${c.type === "image" ? "image" : `${secs} seconds`}, ${fit ? `fits ${aspect}` : "will be cropped"}`}
        style={{ display: "grid", gap: 6, width: "100%", padding: 6, borderRadius: 12, textAlign: "left", cursor: c.used ? "default" : "pointer", background: "rgba(242,237,226,.03)", border: `1.5px solid ${c.used ? "var(--color-cy)" : "var(--color-dark-line)"}`, color: "var(--color-dark-ink)" }}
      >
        <span style={{ position: "relative", display: "block", aspectRatio: "16 / 9", borderRadius: 8, overflow: "hidden", background: "var(--color-dark-2)" }}>
          {thumb && <img src={thumb} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
          {c.used && <span style={{ position: "absolute", top: 6, left: 6, padding: "2px 6px", borderRadius: 6, background: "var(--color-cy)", color: "var(--color-ink)", fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.12em" }}>IN USE</span>}
        </span>
        <span style={{ display: "flex", flexWrap: "wrap", gap: "2px 8px", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em" }}>
          <span>{source}</span>
          <span style={{ color: "var(--color-dark-dim)" }}>{c.type === "image" ? "IMAGE" : `${secs}S`}</span>
          <span style={{ color: fit ? "var(--color-lm)" : "var(--color-am)" }}>{fit ? `FITS ${aspect}` : "WILL BE CROPPED"}</span>
        </span>
      </button>
    </li>
  );
}

export default function BrollReplaceDialog({ id, tab: initialTab = "suggestions", onClose }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const transcript = useEditor((s) => s.transcript);
  const item = findItem(plan, "broll", id);
  const uid = useId();
  const [tab, setTab] = useState(initialTab === "search" ? "search" : "suggestions");
  const [sugg, setSugg] = useState({ status: "loading", list: [], error: null });
  const [search, setSearch] = useState({ status: "idle", list: [], error: null });
  const [query, setQuery] = useState(() => item?.queries?.[0]?.text || "");
  const [pickError, setPickError] = useState(null);
  const tabRefs = useRef({});
  const searchInputRef = useRef(null);

  useEffect(() => {
    const ac = new AbortController();
    f.api.getCandidates(f.editId, { itemId: id, limit: 20, signal: ac.signal }).then(
      (r) => setSugg({ status: "ready", list: r?.candidates || [], error: null }),
      (err) => { if (err?.name !== "AbortError") setSugg({ status: "error", list: [], error: errorCopy(err).body }); },
    );
    return () => ac.abort();
  }, [f, id]);

  useEffect(() => f.onCandidates((d) => {
    if (d?.itemId !== id) return;
    setSearch((s) => ({ ...s, status: "ready", list: mergeById(s.list, d.candidates || []) }));
  }), [f, id]);

  // Fallback: poll the stored set while a search is out (polling transports carry no candidates events).
  const known = sugg.list;
  useEffect(() => {
    if (search.status !== "searching") return undefined;
    let stopped = false;
    let tries = 0;
    let timer = null;
    const tick = async () => {
      if (stopped) return;
      tries += 1;
      try {
        const r = await f.api.getCandidates(f.editId, { itemId: id, limit: 20 });
        if (stopped) return;
        const base = new Set(known.map((c) => c.id));
        const fresh = (r?.candidates || []).filter((c) => !base.has(c.id));
        if (fresh.length) { setSearch((s) => (s.status === "searching" ? { ...s, status: "ready", list: mergeById(s.list, fresh) } : s)); return; }
      } catch { /* keep waiting for the stream */ }
      if (tries >= 8) { setSearch((s) => (s.status === "searching" ? { ...s, status: "ready" } : s)); return; }
      timer = setTimeout(tick, 1500);
    };
    timer = setTimeout(tick, 1600);
    return () => { stopped = true; clearTimeout(timer); };
  }, [search.status, f, id, known]);

  if (!item) return null;
  const aspect = plan.output?.aspect || "9:16";
  const sentence = transcript?.sentences?.find((s) => s.id === item.sentenceId);

  const runSearch = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) { setSearch((s) => ({ ...s, error: "Type at least 2 characters." })); searchInputRef.current?.focus(); return; }
    setSearch({ status: "searching", list: [], error: null });
    try {
      await f.api.searchCandidates(f.editId, { itemId: id, query: q });
    } catch (err) {
      if (err?.status === 401) f.needAuth(() => {});
      setSearch({ status: "error", list: [], error: errorCopy(err).body });
    }
  };
  const pick = (c) => {
    const r = f.apply({ type: "broll.replace", id, candidateId: c.id });
    if (!r.ok) { setPickError(r.reason); return; }
    f.toast({ message: `B-roll #${item.ordinal} replaced · rendering ${Math.round(item.resolved?.outIn || 0)}s` });
    onClose?.();
  };
  const onTabKey = (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = tab === "suggestions" ? "search" : "suggestions";
    const target = e.key === "Home" ? "suggestions" : e.key === "End" ? "search" : next;
    setTab(target);
    tabRefs.current[target]?.focus();
  };

  const tabBtn = (key, label) => (
    <button
      key={key}
      ref={(el) => { tabRefs.current[key] = el; }}
      type="button"
      role="tab"
      id={`${uid}-tab-${key}`}
      aria-selected={tab === key}
      aria-controls={`${uid}-panel-${key}`}
      tabIndex={tab === key ? 0 : -1}
      onClick={() => setTab(key)}
      onKeyDown={onTabKey}
      style={{ minHeight: 44, padding: "0 16px", border: 0, borderBottom: `2px solid ${tab === key ? "var(--color-mag)" : "transparent"}`, background: "transparent", color: tab === key ? "var(--color-dark-ink)" : "var(--color-dark-dim)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}
    >
      {label}
    </button>
  );

  const grid = (list) => (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
      {list.map((c) => <CandidateTile key={c.id} c={c} aspect={aspect} onPick={pick} />)}
    </ul>
  );

  return (
    <Dialog open onClose={onClose} scene="B-ROLL" title={`Replace B-roll #${item.ordinal}`} description={sentence ? `For “${sentence.text}”` : undefined} width={720}>
      <div role="tablist" aria-label="Where to find a clip" style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--color-dark-line)", marginBottom: 14 }}>
        {tabBtn("suggestions", "Suggestions")}
        {tabBtn("search", "Search stock")}
      </div>

      <div role="tabpanel" id={`${uid}-panel-suggestions`} aria-labelledby={`${uid}-tab-suggestions`} hidden={tab !== "suggestions"} tabIndex={0}>
        {tab === "suggestions" && (
          <div style={{ display: "grid", gap: 12 }}>
            <CostHint text={COST_HINT_COPY.free} />
            {sugg.status === "loading" && <p role="status" className="rec-blip" style={{ margin: 0 }}>PULLING SAVED RESULTS…</p>}
            {sugg.status === "error" && <p role="alert" style={{ margin: 0, fontSize: 14, color: "#ff6a3c" }}>{sugg.error}</p>}
            {sugg.status === "ready" && (sugg.list.length ? grid(sugg.list) : (
              <p style={{ margin: 0, fontSize: 14, color: "var(--color-dark-dim)" }}>
                No saved results for this line. <button type="button" className="link-mono on-dark" onClick={() => setTab("search")}>Search stock</button>
              </p>
            ))}
          </div>
        )}
      </div>

      <div role="tabpanel" id={`${uid}-panel-search`} aria-labelledby={`${uid}-tab-search`} hidden={tab !== "search"} tabIndex={0}>
        {tab === "search" && (
          <div style={{ display: "grid", gap: 12 }}>
            <form onSubmit={runSearch} role="search" style={{ display: "grid", gap: 8 }}>
              <label htmlFor={`${uid}-q`} className="label-mono" style={{ color: "var(--color-dark-dim)" }}>WHAT SHOULD THE CLIP SHOW?</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <input
                  ref={searchInputRef}
                  id={`${uid}-q`}
                  className="editor-inset"
                  value={query}
                  maxLength={80}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-invalid={search.error && search.status !== "error" ? true : undefined}
                  style={{ flex: "1 1 220px", minWidth: 0, minHeight: 44, padding: "10px 12px", fontFamily: "var(--font-body)", fontSize: 14 }}
                />
                <button type="submit" className="btn-ink on-dark" disabled={search.status === "searching"} style={{ minHeight: 44 }}>
                  {search.status === "searching" ? "Searching…" : "Search stock"}
                </button>
              </div>
              <CostHint text={COST_HINT_COPY.fetch} />
            </form>
            {search.error && <p role="alert" style={{ margin: 0, fontSize: 14, color: "#ff6a3c" }}>{search.error}</p>}
            {search.status === "searching" && <p role="status" className="rec-blip" style={{ margin: 0 }}>SEARCHING STOCK…</p>}
            {search.status === "ready" && (search.list.length ? (
              <>
                <p role="status" className="label-mono" style={{ margin: 0, color: "var(--color-dark-dim)" }}>{search.list.length} {search.list.length === 1 ? "CLIP" : "CLIPS"} FOUND</p>
                {grid(search.list)}
              </>
            ) : <p role="status" style={{ margin: 0, fontSize: 14, color: "var(--color-dark-dim)" }}>Nothing fit that search. Try simpler, visual words.</p>)}
          </div>
        )}
      </div>
      {pickError && <p role="alert" style={{ margin: "12px 0 0", fontSize: 14, color: "#ff6a3c" }}>{pickError}</p>}
    </Dialog>
  );
}
