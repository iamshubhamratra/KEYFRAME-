import { Fragment, memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useEditor, useEditorActions } from "../../../editState.js";
import { buildPieces, planTimeMap, projectWords, wordAtOut, anchoredWords, findItem } from "../../../editModel.js";
import { SEGMENT_COLORS, SEGMENT_LABELS, TRANSCRIPT_FILTERS, PACE_OPTIONS, FILLER_OPTIONS, fmtTcShort } from "../../../editFormat.js";
import { playerClock } from "../../../playerClock.js";
import RadioChips from "../../../components/RadioChips.jsx";
import Switch from "../../../components/Switch.jsx";
import ItemCard, { ActionButton, PanelSection, CostHint } from "../ItemCard.jsx";

// TRANSCRIPT & CUTS (UX.md §1d panel 1) — the take as text, grouped by segment, with every cut in
// place: struck-through words for fillers and repeats, ⟨ SILENCE 1.4S ⟩ pills between words (each
// a toggle, aria-pressed = cut). Clicking word N selects by srcWordIndex (never by text): a cut
// word selects its cut and offers Restore; any other word selects the caption cue that carries it.
// The live word follows playback through a class toggled on the DOM (no React state). Words are one
// Tab stop with roving ←/→ (Home/End, Enter selects); timestamps jump the player to a line.

const CSS = `
.kf-tr-text{margin:0;font-size:15px;line-height:1.95;color:var(--color-dark-ink);overflow-wrap:anywhere}
.kf-tr-word{cursor:pointer;border-radius:4px;padding:1px 2px;margin:0 -1px;transition:background .15s ease,color .15s ease;-webkit-box-decoration-break:clone;box-decoration-break:clone;scroll-margin:96px 0 120px}
.kf-tr-word:hover{background:rgba(242,237,226,.09)}
.kf-tr-word.is-filler{color:var(--color-am)}
.kf-tr-word.is-cut{color:var(--color-dark-dim);text-decoration:line-through;text-decoration-color:rgba(255,106,60,.95);text-decoration-thickness:2px}
.kf-tr-word.is-anchor{background:rgba(232,50,168,.15);box-shadow:inset 0 -2px 0 var(--color-mag)}
.kf-tr-word.is-picked{background:rgba(232,50,168,.34)}
.kf-tr-word.is-live{background:var(--color-mag);color:var(--color-ink);text-decoration-color:var(--color-ink)}
.kf-tr-pill{display:inline-flex;align-items:center;vertical-align:1px;margin:0 3px;padding:1px 7px;min-height:22px;border-radius:999px;font-family:var(--font-mono);font-size:9px;letter-spacing:.12em;cursor:pointer;white-space:nowrap;border:1px dashed rgba(242,237,226,.35);background:transparent;color:var(--color-dark-dim)}
.kf-tr-pill[aria-pressed=true]{border:1px solid rgba(255,106,60,.7);background:rgba(216,39,27,.16);color:#ffb39c}
.kf-tr-pill:hover{border-color:var(--color-dark-ink)}
.kf-tr-ts{min-width:44px;min-height:32px;padding:0 4px;border:0;border-radius:6px;background:transparent;font-family:var(--font-mono);font-size:10px;letter-spacing:.06em;color:var(--color-dark-dim);cursor:pointer;text-align:left;align-self:start;margin-top:3px}
.kf-tr-ts:hover{color:var(--color-cy)}
.kf-tr-chip{display:inline-flex;align-items:center;gap:5px;min-height:28px;padding:2px 9px;border-radius:999px;font-family:var(--font-mono);font-size:9px;letter-spacing:.12em;background:transparent;cursor:pointer;border:1px solid var(--chip);color:var(--color-dark-ink)}
@media (pointer:coarse){.kf-tr-text{line-height:2.6}.kf-tr-pill{min-height:36px;padding:4px 10px}.kf-tr-ts{min-height:44px}.kf-tr-chip{min-height:44px}}
@media (max-width:859px){.kf-tr-word{scroll-margin:46dvh 0 150px}}
@media (prefers-reduced-motion:reduce){.kf-tr-word{transition:none}}
`;

const EPS = 1e-6;
const mid = (w) => (w.start + w.end) / 2;
const CUT_NAMES = { SILENCE: "Silence", FILLER: "Filler", REPEAT: "Repeat", FALSE_START: "False start", RETAKE: "Retake", JUMP_CUT: "Jump cut", USER: "Cut" };
const FILTER_KINDS = { SILENCE: ["SILENCE", "JUMP_CUT"], FILLER: ["FILLER"], REPEAT: ["REPEAT", "FALSE_START", "RETAKE", "USER"] };
const EFFECT_SHORT = { PUNCH_IN: "PUNCH-IN", ZOOM_EMPHASIS: "ZOOM", JUMP_ZOOM: "JUMP ZOOM", REFRAME: "REFRAME", FREEZE: "FREEZE", SPEED: "SPEED", PUNCH_OUT: "PUNCH-OUT" };
const PROTECTED = { sincere: "SINCERE MOMENT", cta: "CALL TO ACTION", personal: "PERSONAL MOMENT", humor: "HUMOR", direct: "DIRECT ADDRESS" };
const FILLER_CHOICES = [{ value: "off", label: "KEEP ALL" }, ...FILLER_OPTIONS];

const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };

function buildModel(plan, words, sentences) {
  const list = words.filter((w) => w && Number.isFinite(w.start)).slice().sort((a, b) => a.start - b.start);
  const built = buildPieces(plan, { words: list });
  const active = new Set(built.activeCutIds);
  const tm = planTimeMap(plan);
  const cutOfWord = new Map();
  const pillsBefore = new Map();
  const pillsAfter = new Map();
  const cutsBySentence = new Map();
  for (const c of plan.cuts || []) {
    const on = active.has(c.id);
    const covered = Array.isArray(c.wordRange)
      ? list.filter((w) => w.i >= c.wordRange[0] && w.i <= c.wordRange[1])
      : list.filter((w) => mid(w) >= c.srcIn - EPS && mid(w) <= c.srcOut + EPS);
    for (const w of covered) {
      const prev = cutOfWord.get(w.i);
      if (!prev || (on && !prev.on)) cutOfWord.set(w.i, { cut: c, on });
    }
    let anchor = null;
    if (covered.length) { anchor = covered[0]; push(pillsBefore, anchor.i, c); }
    else {
      for (const w of list) { if (w.start < c.srcIn) anchor = w; else break; }
      if (anchor) push(pillsAfter, anchor.i, c);
      else if (list[0]) { anchor = list[0]; push(pillsBefore, anchor.i, c); }
    }
    if (anchor) push(cutsBySentence, anchor.sentenceId, c);
  }
  const byI = new Map(list.map((w) => [w.i, w]));
  const groups = [];
  sentences.forEach((s, k) => {
    const ws = [];
    for (let i = s.w0; i <= s.w1; i++) { const w = byI.get(i); if (w) ws.push(w); }
    const row = { sentence: s, lineNo: k + 1, words: ws, outAt: tm.srcToOutStart(s.start) };
    const last = groups[groups.length - 1];
    if (last && last.segmentId === s.segmentId) last.rows.push(row);
    else groups.push({ segmentId: s.segmentId, rows: [row] });
  });
  const itemsBySentence = new Map();
  for (const b of plan.broll || []) if (b.status !== "removed") push(itemsBySentence, b.sentenceId || b.evidence?.sentenceId, { kind: "broll", id: b.id, label: `B-ROLL #${b.ordinal}`, color: b.status === "missing" ? "var(--color-am)" : "var(--color-cy)", glyph: b.status === "missing" ? "⚠" : "▣" });
  for (const e of plan.effects || []) if (e.enabled !== false && e.evidence?.sentenceId) push(itemsBySentence, e.evidence.sentenceId, { kind: "effect", id: e.id, label: EFFECT_SHORT[e.kind] || e.kind, color: "var(--color-am)", glyph: "◆" });
  for (const g of plan.graphics || []) if (g.enabled !== false && g.evidence?.sentenceId) push(itemsBySentence, g.evidence.sentenceId, { kind: "graphic", id: g.id, label: String(g.kind).replace(/_/g, " "), color: "var(--color-mag)", glyph: "T" });
  return { active, cutOfWord, pillsBefore, pillsAfter, cutsBySentence, groups, itemsBySentence, projected: projectWords(plan, list) };
}

function CutPill({ cut, on, onToggle }) {
  const dur = Math.max(0, (Number(cut.srcOut) || 0) - (Number(cut.srcIn) || 0));
  const name = CUT_NAMES[cut.kind] || "Cut";
  return (
    <button
      type="button"
      className="kf-tr-pill"
      aria-pressed={on}
      aria-label={`${name} cut, ${dur.toFixed(1)} seconds`}
      title={on ? "Cut — press to keep this" : "Kept — press to cut it"}
      onClick={() => onToggle(cut.id, on)}
    >
      <span aria-hidden="true">⟨ {name.toUpperCase()} {dur.toFixed(1)}S ⟩</span>
    </button>
  );
}

const SentenceRow = memo(function SentenceRow({ row, model, a0, a1, picked, stop, items, lang, onWordClick, onWordKey, onPill, onSeek, onItem, register }) {
  const s = row.sentence;
  const protectedLabel = s.faceRequired ? PROTECTED[s.faceRequired] || String(s.faceRequired).toUpperCase() : null;
  return (
    <li style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr)", columnGap: 8, padding: "6px 0", borderTop: "1px solid rgba(242,237,226,.05)" }}>
      <button type="button" className="kf-tr-ts" onClick={() => onSeek(row.outAt)} aria-label={`Play line ${row.lineNo} from ${fmtTcShort(row.outAt)}`}>
        {fmtTcShort(row.outAt).replace(/^00:/, "0:")}
      </button>
      <div style={{ minWidth: 0 }}>
        <p className="kf-tr-text" lang={lang} dir="auto">
          {row.words.map((w) => {
            const c = model.cutOfWord.get(w.i);
            const cut = c && c.on;
            const cls = ["kf-tr-word", cut && "is-cut", !cut && w.isFiller && "is-filler", w.i >= a0 && w.i <= a1 && "is-anchor", picked === w.i && "is-picked"].filter(Boolean).join(" ");
            return (
              <Fragment key={w.i}>
                {(model.pillsBefore.get(w.i) || []).map((pc) => <CutPill key={pc.id} cut={pc} on={model.active.has(pc.id)} onToggle={onPill} />)}
                <span
                  ref={(el) => register(w.i, el)}
                  role="button"
                  tabIndex={w.i === stop ? 0 : -1}
                  data-i={w.i}
                  className={cls}
                  aria-current={picked === w.i ? "true" : undefined}
                  onClick={() => onWordClick(w.i)}
                  onKeyDown={onWordKey}
                >
                  {w.text}{cut && <span className="sr-only"> (cut)</span>}
                </span>{" "}
                {(model.pillsAfter.get(w.i) || []).map((pc) => <CutPill key={pc.id} cut={pc} on={model.active.has(pc.id)} onToggle={onPill} />)}
              </Fragment>
            );
          })}
        </p>
        {(items?.length > 0 || protectedLabel) && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 4 }}>
            {protectedLabel && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--color-am)" }}>
                <span aria-hidden="true">◉ </span>SPEAKER STAYS ON SCREEN — {protectedLabel}
              </span>
            )}
            {(items || []).map((it) => (
              <button key={it.id} type="button" className="kf-tr-chip" style={{ "--chip": it.color }} onClick={() => onItem(it.kind, it.id)}>
                <span aria-hidden="true" style={{ color: it.color }}>{it.glyph}</span>{it.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
});

export function CutCard({ id, layout }) {
  const f = useEditorActions();
  const plan = useEditor((s) => s.plan);
  const words = useEditor((s) => s.transcript?.words);
  const selection = useEditor((s) => s.selection);
  const active = useMemo(() => (plan ? new Set(buildPieces(plan, { words }).activeCutIds) : new Set()), [plan, words]);
  const cut = findItem(plan, "cut", id);
  if (!cut) return null;
  const on = active.has(id);
  const toggle = () => {
    const r = f.apply({ type: "cut.toggle", cutId: id, enabled: !on });
    if (!r.ok) f.toast({ tone: "error", message: r.reason });
  };
  const wordPicked = selection?.kind === "cut" && selection.id === id && !!selection.wordKey;
  return (
    <ItemCard
      kind="cut"
      id={id}
      layout={layout}
      status={on ? { label: "CUT", tone: "error" } : { label: "KEPT", tone: "dim" }}
      actions={<ActionButton onClick={toggle} tone={on ? "cy" : undefined} cost={{ type: "cut.toggle" }}>{on ? "Restore — keep these words" : "Cut it again"}</ActionButton>}
    >
      {wordPicked && on && (
        <p role="status" style={{ margin: 0, fontSize: 14, color: "var(--color-dark-ink)" }}>
          This word is cut · <button type="button" className="link-mono on-dark" onClick={toggle} style={{ minHeight: 32 }}>Restore</button>
        </p>
      )}
    </ItemCard>
  );
}

export default function TranscriptPanel({ layout = "wide", filter = "all", onFilter }) {
  const f = useEditorActions();
  const reduce = useReducedMotion();
  const plan = useEditor((s) => s.plan);
  const transcript = useEditor((s) => s.transcript);
  const selection = useEditor((s) => s.selection);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localFilter, setLocalFilter] = useState("all");
  const [tabWord, setTabWord] = useState(null);
  const wordEls = useRef(new Map());
  const settingsId = useId();

  const activeFilter = onFilter ? filter : localFilter;
  const setFilter = onFilter || setLocalFilter;
  const words = transcript?.words;
  const sentences = transcript?.sentences;
  const model = useMemo(() => (plan && Array.isArray(words) && words.length ? buildModel(plan, words, Array.isArray(sentences) ? sentences : []) : null), [plan, words, sentences]);

  const visibleGroups = useMemo(() => {
    if (!model) return [];
    if (activeFilter === "all") return model.groups;
    const kinds = FILTER_KINDS[activeFilter] || [];
    return model.groups
      .map((g) => ({ ...g, rows: g.rows.filter((r) => (model.cutsBySentence.get(r.sentence.id) || []).some((c) => kinds.includes(c.kind))) }))
      .filter((g) => g.rows.length);
  }, [model, activeFilter]);
  const order = useMemo(() => visibleGroups.flatMap((g) => g.rows.flatMap((r) => r.words.map((w) => w.i))), [visibleGroups]);

  const selItem = selection && plan ? findItem(plan, selection.kind, selection.id) : null;
  const anchor = selItem ? anchoredWords(plan, selection.kind, selItem) : null;
  const picked = selection?.wordKey && /^w\d+$/.test(selection.wordKey) ? Number(selection.wordKey.slice(1)) : null;
  const a0 = anchor ? anchor[0] : picked ?? -1;
  const a1 = anchor ? anchor[1] : picked ?? -1;
  const stop = tabWord != null && order.includes(tabWord) ? tabWord : picked != null && order.includes(picked) ? picked : order[0];
  const selSeq = selection?.seq ?? null;
  const selSource = selection?.source ?? null;

  const register = useCallback((i, el) => { if (el) wordEls.current.set(i, el); else wordEls.current.delete(i); }, []);
  const onWordClick = useCallback((i) => { setTabWord(i); f.selectWord(i, { keepPanel: layout !== "wide" }); }, [f, layout]);
  const onWordKey = useCallback((e) => {
    const i = Number(e.currentTarget.dataset.i);
    const pos = order.indexOf(i);
    let next;
    switch (e.key) {
      case "ArrowRight": next = order[Math.min(order.length - 1, pos + 1)]; break;
      case "ArrowLeft": next = order[Math.max(0, pos - 1)]; break;
      case "Home": next = order[0]; break;
      case "End": next = order[order.length - 1]; break;
      case "Enter": case " ": e.preventDefault(); onWordClick(i); return;
      default: return;
    }
    e.preventDefault();
    if (next == null) return;
    setTabWord(next);
    wordEls.current.get(next)?.focus();
  }, [order, onWordClick]);
  const onPill = useCallback((cutId, on) => {
    const r = f.apply({ type: "cut.toggle", cutId, enabled: !on });
    if (!r.ok) f.toast({ tone: "error", message: r.reason });
  }, [f]);
  const onSeek = useCallback((t) => f.seek(t), [f]);
  const onItem = useCallback((kind, id) => f.selectItem({ kind, id }, { source: "transcript", keepPanel: layout !== "wide" }), [f, layout]);

  // Bring the anchored words into view when something else selected an item.
  useEffect(() => {
    if (selSeq == null || selSource === "transcript" || a0 < 0) return;
    wordEls.current.get(a0)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [selSeq, selSource, a0, reduce]);

  // The live word, straight on the DOM.
  useEffect(() => {
    if (!model) return undefined;
    const els = wordEls.current;
    let last = null;
    const tick = (t) => {
      const w = wordAtOut(model.projected, f.toPlanTime(t));
      const i = w ? w.i : null;
      if (i === last && (i == null || els.get(i)?.classList.contains("is-live"))) return;
      if (last != null) els.get(last)?.classList.remove("is-live");
      if (i != null) els.get(i)?.classList.add("is-live");
      last = i;
    };
    tick(playerClock.getTime());
    const off = playerClock.subscribeFrame(tick);
    return () => { off(); if (last != null) els.get(last)?.classList.remove("is-live"); };
  }, [f, model, visibleGroups, a0, a1, picked, stop]);

  if (!plan) return null;
  if (!model) {
    return <p style={{ margin: 0, fontSize: 14, color: "var(--color-dark-dim)" }}>No transcript for this edit.</p>;
  }

  const settings = plan.settings || {};
  const apply = (op) => { const r = f.apply(op); if (!r.ok) f.toast({ tone: "error", message: r.reason }); return r; };
  const restoreOriginal = () => f.openDialog("confirm", {
    title: "Restore the original take?",
    body: "Every cut comes back — silences, fillers and repeats. Captions and B-roll stay on their words, and you can undo it.",
    confirmLabel: "Restore original",
    ops: [{ type: "cuts.restoreAll" }],
    toast: "Original restored · every cut is back",
  });
  const segOf = (id) => findItem(plan, "segment", id);
  const totalLines = model.groups.reduce((n, g) => n + g.rows.length, 0);
  const shownLines = visibleGroups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div style={{ minWidth: 0 }}>
      <style href="kf-transcript-styles" precedence="kf">{CSS}</style>
      <PanelSection first title="CUTS" aside={<span className="label-mono" style={{ color: "var(--color-dark-dim)" }}>{model.active.size} ACTIVE · {shownLines}/{totalLines} LINES</span>}>
        <RadioChips label="Show" value={activeFilter} options={TRANSCRIPT_FILTERS} onChange={(v) => setFilter(v)} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
          <ActionButton expanded={settingsOpen} controls={settingsId} onClick={() => setSettingsOpen((o) => !o)}>
            <span aria-hidden="true">{settingsOpen ? "▾" : "▸"}</span> Pace & fillers
          </ActionButton>
          <ActionButton haspopup="dialog" onClick={restoreOriginal} cost={{ type: "cuts.restoreAll" }}>Restore original</ActionButton>
        </div>
        {settingsOpen && (
          <div id={settingsId} style={{ display: "grid", gap: 14, padding: 12, borderRadius: 12, background: "rgba(242,237,226,.03)", border: "1px solid var(--color-dark-line)" }}>
            <Switch label="Remove silence" checked={settings.removeSilence !== false} onChange={(v) => apply({ type: "settings.set", key: "removeSilence", value: v })} />
            <RadioChips label="Silence pace" value={settings.silencePace || "natural"} options={PACE_OPTIONS} disabled={settings.removeSilence === false} onChange={(v) => apply({ type: "settings.set", key: "silencePace", value: v })} />
            <RadioChips label="Fillers" value={settings.removeFillers || "light"} options={FILLER_CHOICES} onChange={(v) => apply({ type: "settings.set", key: "removeFillers", value: v })} />
            <CostHint op={{ type: "settings.set", key: "silencePace" }} />
          </div>
        )}
      </PanelSection>

      {selection?.kind === "cut" && (
        <div style={{ marginTop: 14 }}>
          <CutCard id={selection.id} layout={layout} />
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        {visibleGroups.length === 0 && (
          <p role="status" style={{ margin: 0, fontSize: 14, color: "var(--color-dark-dim)" }}>
            {activeFilter === "FILLER" ? "No fillers were found in this take." : activeFilter === "REPEAT" ? "No repeats or false starts were found." : "No silences were cut."}
          </p>
        )}
        {visibleGroups.map((g, gi) => {
          const seg = segOf(g.segmentId);
          const color = SEGMENT_COLORS[seg?.type] || "rgba(242,237,226,.3)";
          const segSel = selection?.kind === "segment" && selection.id === g.segmentId;
          return (
            <section key={`${g.segmentId}-${gi}`} aria-label={`${SEGMENT_LABELS[seg?.type] || "Segment"}${seg?.label ? ` — ${seg.label}` : ""}`} style={{ marginTop: gi ? 16 : 0 }}>
              <button
                type="button"
                onClick={() => f.selectItem({ kind: "segment", id: g.segmentId }, { source: "transcript", keepPanel: layout !== "wide" })}
                aria-current={segSel ? "true" : undefined}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 44, padding: "4px 6px", border: 0, borderRadius: 8, background: segSel ? "rgba(232,50,168,.1)" : "transparent", cursor: "pointer", textAlign: "left", color: "var(--color-dark-ink)" }}
              >
                <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em" }}>{SEGMENT_LABELS[seg?.type] || "SEGMENT"}</span>
                {seg?.label && <span style={{ fontSize: 13, color: "var(--color-dark-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{seg.label}</span>}
                {seg?.resolved && <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-dark-dim)", whiteSpace: "nowrap" }}>{fmtTcShort(seg.resolved.outIn)}–{fmtTcShort(seg.resolved.outOut)}</span>}
              </button>
              <ol style={{ listStyle: "none", margin: "4px 0 0", padding: 0 }}>
                {g.rows.map((r) => {
                  const s = r.sentence;
                  const inRange = a1 >= s.w0 && a0 <= s.w1;
                  return (
                    <SentenceRow
                      key={s.id}
                      row={r}
                      model={model}
                      a0={inRange ? a0 : -1}
                      a1={inRange ? a1 : -1}
                      picked={picked != null && picked >= s.w0 && picked <= s.w1 ? picked : -1}
                      stop={stop >= s.w0 && stop <= s.w1 ? stop : -1}
                      items={model.itemsBySentence.get(s.id)}
                      lang={transcript.language}
                      onWordClick={onWordClick}
                      onWordKey={onWordKey}
                      onPill={onPill}
                      onSeek={onSeek}
                      onItem={onItem}
                      register={register}
                    />
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
