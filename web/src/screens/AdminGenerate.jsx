import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { mediaUrl } from "../api.js";
import {
  FAMILIES, PIPELINE_STAGES, STATUS, createTemplate, generateTemplate, previewTemplate,
  pipelineProgress, pollTemplateStatus, qaTemplate, slugPreview,
} from "../adminApi.js";
import { AdminGate, Field, Notice, PanelHead } from "./AdminShared.jsx";
import AutoPanel from "./AdminAuto.jsx";
import { ORIENTATIONS, OrientationTab } from "./Templates.jsx";

// ADMIN · THE GENERATOR — a prompt in, a schema-valid pack out.
//
// The LLM never writes template SOURCE. It produces a VARIANT spec (name,
// family, palette, fonts) that scripts/new-pack.js turns into a pack.json +
// FRAME.md over an existing renderer family; this screen is the brief that spec
// is written from. So the form asks for intent — look, colour, length — and
// never for anything that would become executable.
const DURATIONS = [null, 10, 15, 20, 30, 45, 60];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// Where each POST of the chain starts on the seven-stage checklist. The screen
// drives generate → preview → QA itself (three status-neutral-to-lifecycle
// routes), so the floor keeps the ticks moving forward between calls instead of
// snapping back while no phase is running.
const CHAIN_FLOOR = { generate: 0, preview: 3, qa: 5, done: PIPELINE_STAGES.length - 1 };

export default function AdminGenerate(props) {
  return <AdminGate><Generator {...props} /></AdminGate>;
}

function Generator({ onOpen, onCancel }) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [orientation, setOrientation] = useState(null);   // required — no default, so it is a choice
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [style, setStyle] = useState("");
  const [family, setFamily] = useState(null);    // null = let the spec generator choose
  const [brandColor, setBrandColor] = useState("");
  const [durationSec, setDurationSec] = useState(null);
  const [notes, setNotes] = useState("");

  const [mode, setMode] = useState("one");      // one · campaign — which way in
  const [phase, setPhase] = useState("form");   // form · running · stalled
  const [chain, setChain] = useState("generate");
  const [template, setTemplate] = useState(null);
  const [error, setError] = useState(null);
  const [handedOff, setHandedOff] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const slug = slugPreview(name);
  const badHex = brandColor !== "" && !HEX_RE.test(brandColor);
  const canSubmit = phase === "form" && slug.length >= 2 && prompt.trim().length >= 10 && !!orientation && !badHex;

  // ONE SUBMIT, THREE CALLS. The server splits the lifecycle across /generate
  // (spec → source → manifest check), /preview (poster + clip) and /qa, because
  // each is separately re-runnable from the review screen. The admin briefed one
  // template, so this screen walks the whole chain and reports it as one
  // pipeline — which is also what makes the seven-stage checklist honest.
  async function submit() {
    setError(null);
    setPhase("running");
    setChain("generate");
    let created;
    try {
      created = await createTemplate({
        name: name.trim(),
        prompt: prompt.trim(),
        orientation,
        description: description.trim(),
        category: category.trim() || null,
        tags: tags.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12),
        style: style.trim() || null,
        ...(family ? { family } : {}),
        brandColor: HEX_RE.test(brandColor) ? brandColor.toLowerCase() : null,
        durationSec,
        notes: notes.trim() || null,
      });
    } catch (e) {
      setError(e); setPhase("form");
      return;
    }
    setTemplate(created);

    // The draft now EXISTS. Every failure past this point hands the admin the
    // template rather than losing the brief they just wrote.
    const ac = new AbortController();
    abortRef.current = ac;
    const merge = (t) => setTemplate((prev) => ({ ...prev, ...t }));
    const watch = () => pollTemplateStatus(created.id, { onTick: merge, signal: ac.signal });

    try {
      if (!created.status || created.status === STATUS.DRAFT) {
        // 409 here is the state machine saying a build is already under way —
        // that is a create route that started it for us, not a failure.
        const started = await generateTemplate(created.id).catch((e) => { if (e.status === 409) return null; throw e; });
        if (started) merge(started);
      }
      let t = await watch();
      if (ac.signal.aborted) return;
      if (t.status === STATUS.FAILED) return;                       // the panel renders lastError
      if (t.status === STATUS.DRAFT) { setPhase("stalled"); return; }

      // The poster and the clip are what the publish gate insists on, so they
      // are part of "generate a template" — but only when the spec generator did
      // not already leave them behind.
      if (!t.previewVideo || !t.thumbnail) {
        setChain("preview");
        await previewTemplate(created.id).catch((e) => { if (e.status !== 409) throw e; });
        t = await watch();
        if (ac.signal.aborted) return;
      }

      // QA moves GENERATED → READY_TO_PUBLISH when it comes back clean, and
      // back to GENERATED when it does not. Either way the admin reviews next.
      if (t.status === STATUS.GENERATED) {
        setChain("qa");
        await qaTemplate(created.id).catch((e) => { if (e.status !== 409) throw e; });
        t = await watch();
        if (ac.signal.aborted) return;
      }

      setChain("done");
      if (t.status === STATUS.FAILED) return;
      // Straight to review, the way the theater walks a finished film to its
      // premiere — the pause is long enough to read the last stage tick over.
      setHandedOff(true);
      setTimeout(() => onOpen?.(created.id), 1200);
    } catch (e) {
      if (!ac.signal.aborted) { setError(e); setPhase("stalled"); }
    }
  }

  if (phase !== "form") {
    return (
      <RunPanel template={template} error={error} phase={phase} chain={chain} handedOff={handedOff}
        onOpen={() => onOpen?.(template?.id)} onCancel={onCancel} />
    );
  }

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(16px,3vw,40px) clamp(16px,4vw,60px) 110px" }}>
      <span className="scene-pill" style={{ "--tagc": "#e832a8" }}>ADMIN · NEW TEMPLATE</span>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <h1 className="headline" style={{ fontSize: "clamp(32px,5vw,64px)" }}>
          {mode === "one"
            ? <>Describe the look.<br /><span style={{ color: "var(--color-cy)" }}>We build the pack.</span></>
            : <>Name a subject.<br /><span style={{ color: "var(--color-cy)" }}>We build the set.</span></>}
        </h1>
        <button className="link-mono" onClick={onCancel}>← LIBRARY</button>
      </div>

      {/* THE CHOICE, MADE ONCE. Both panels used to sit stacked on one page, so
          the admin met two forms and had to work out which one they were in.
          Picking a mode first means the screen only ever shows one path. */}
      <ModeChooser mode={mode} onMode={setMode} />

      {mode === "campaign" && <AutoPanel onOpen={onOpen} />}
      {mode === "one" && (<>
      {/* the brief — the two required fields, in the studio's editor card */}
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="editor-card" style={{ marginTop: 36 }}>
        <PanelHead title="OPTION 1 — ONE TEMPLATE, IN FULL DETAIL" status={canSubmit ? "● READY" : "● LISTENING"} />
        <div style={{ padding: 24 }}>
          <div style={{ display: "grid", gap: 16 }}>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", color: "#9a9284", marginBottom: 6 }}>
                NAME <span style={{ color: "var(--color-mag)" }}>*</span>
              </span>
              <input value={name} onChange={(e) => setName(e.target.value)} spellCheck={false}
                placeholder="Cobalt Ledger" className="editor-inset w-full" style={{ padding: "12px 14px" }} />
              <span style={{ display: "block", marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "#7d766a" }}>
                {slug.length >= 2
                  ? <>PUBLISHES TO <span style={{ color: "var(--color-cy)" }}>frames/{slug}</span> — THE FOLDER NAME IS FIXED AT CREATION</>
                  : "THE NAME BECOMES THE PACK FOLDER — LOWERCASE WORDS, SINGLE DASHES"}
              </span>
            </label>

            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", color: "#9a9284", marginBottom: 6 }}>
                PROMPT <span style={{ color: "var(--color-mag)" }}>*</span>
              </span>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder="A fintech-dark pack: deep navy ground, one electric cobalt accent, tabular mono numbers, restrained motion — for revenue and pricing films."
                className="editor-inset w-full resize-none" style={{ minHeight: 104, padding: "12px 14px" }} />
              <span style={{ display: "block", marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "#7d766a" }}>
                DESCRIBE PALETTE, TYPE AND MOOD — IT BECOMES A VARIANT SPEC OVER AN EXISTING RENDERER FAMILY, NEVER NEW CODE
              </span>
            </label>
          </div>

          <div style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "#9a9284" }}>
              <span style={{ color: orientation ? "var(--color-cy)" : "#ff6a3c" }}>
                ▦ {orientation ? (ORIENTATIONS.find((o) => o.key === orientation)?.ratio || orientation) : "PICK AN ORIENTATION"}
              </span>
              <span>⏱ {durationSec ? `${durationSec}S` : "AUTO"}</span>
              {category && <span>▤ {category.toUpperCase()}</span>}
              {HEX_RE.test(brandColor) && <span style={{ color: brandColor }}>◆ {brandColor.toUpperCase()}</span>}
            </div>
            <button onClick={submit} disabled={!canSubmit} className="btn-mag" style={{ padding: "11px 24px", fontSize: 14 }}>
              Generate →
            </button>
          </div>
        </div>
      </motion.div>

      {error && <Notice tone="error" title="Could not create the template" lines={[error.message]} />}

      {/* ORIENTATION — required, and the app's own control. The Templates page
          exports this tab, so a template is described in exactly the vocabulary
          the library lists it in. */}
      <div className="card" style={{ marginTop: 20, padding: "20px 22px 22px 27px" }}>
        <span className="spine" style={{ "--spine": orientation ? (ORIENTATIONS.find((o) => o.key === orientation)?.tagc || "#23c8e0") : "#d8271b" }} />
        <div className="label-mono" style={{ marginBottom: 12 }}>
          ORIENTATION <span style={{ color: "var(--color-mag)" }}>*</span> — {orientation ? ORIENTATIONS.find((o) => o.key === orientation)?.title : "REQUIRED"}
        </div>
        {/* the tab's trailing slot carries a pack count on the library pages;
            here the only thing worth saying beside the ratio is which shelf a
            template of this shape lands on */}
        <div role="tablist" aria-label="Template orientation" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {ORIENTATIONS.map((o) => (
            <OrientationTab key={o.key} o={o} count={o.key === "vertical" ? "REELS" : "WIDE"}
              selected={orientation === o.key} onSelect={() => setOrientation(o.key)} />
          ))}
        </div>
        <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
          A PACK BECOMES VERTICAL BY SHIPPING VERTICAL ART — THIS DECIDES WHICH TAB IT LISTS UNDER
        </div>
      </div>

      {/* everything optional, on the studio's white spine cards */}
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))", gap: 14 }}>
        <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
          <span className="spine" style={{ "--spine": "#23c8e0" }} />
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="DESCRIPTION" hint="ONE LINE, SHOWN ON THE LIBRARY CARD">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                className="admin-input" placeholder="Restrained fintech pack for revenue films." />
            </Field>
            <Field label="CATEGORY">
              <input value={category} onChange={(e) => setCategory(e.target.value)} className="admin-input" placeholder="fintech" spellCheck={false} />
            </Field>
            <Field label="TAGS" hint="COMMA SEPARATED · MAX 12 · SEARCHABLE FROM THE LIBRARY">
              <input value={tags} onChange={(e) => setTags(e.target.value)} className="admin-input" placeholder="dark, mono, data" spellCheck={false} />
            </Field>
          </div>
        </div>

        <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
          <span className="spine" style={{ "--spine": HEX_RE.test(brandColor) ? brandColor : "#ffb03a" }} />
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="STYLE" hint="FREE TEXT THE SPEC READS — MOOD, ERA, REFERENCE">
              <input value={style} onChange={(e) => setStyle(e.target.value)} className="admin-input" placeholder="restrained, tabular, no gradients" spellCheck={false} />
            </Field>
            {/* The renderer FAMILY is the one thing here that is not free text:
                the spec is a variant over an existing family, and the server
                validates this against scripts/new-pack's FAMILIES. Left on AUTO
                the generator picks the family the prompt implies. */}
            <Field label={`RENDERER FAMILY — ${family ? family.toUpperCase() : "AUTO"}`} hint="THE SPEC IS A VARIANT OVER ONE OF THESE — NO NEW RENDERER IS EVER WRITTEN">
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[null, ...FAMILIES].map((f) => (
                  <button key={String(f)} type="button" onClick={() => setFamily(f)}
                    className={`chip-c on-paper ${family === f ? "is-active" : ""}`}
                    style={{ "--chipc": f == null ? "rgba(23,19,14,.45)" : "#23c8e0", fontSize: 9.5, padding: "3px 9px" }}>
                    {f == null ? "AUTO" : f}
                  </button>
                ))}
              </span>
            </Field>
            <Field label="BRAND COLOUR" hint={badHex ? "MUST BE #RRGGBB" : "THE ACCENT THE SPEC BUILDS ITS PALETTE AROUND"}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(23,19,14,.25)", background: HEX_RE.test(brandColor) ? brandColor : "transparent" }} />
                <input value={brandColor} onChange={(e) => setBrandColor(e.target.value.trim())} maxLength={7} spellCheck={false}
                  className="admin-input" placeholder="#2b5bff" style={badHex ? { borderColor: "#d8271b" } : undefined} />
              </span>
            </Field>
            <Field label={`PREVIEW DURATION — ${durationSec ? `${durationSec}S` : "AUTO"}`}>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {DURATIONS.map((d) => (
                  <button key={String(d)} type="button" onClick={() => setDurationSec(d)}
                    className={`chip-c on-paper ${durationSec === d ? "is-active" : ""}`}
                    style={{ "--chipc": d == null ? "rgba(23,19,14,.45)" : "#e832a8", fontSize: 10, padding: "3px 9px" }}>
                    {d == null ? "AUTO" : `${d}S`}
                  </button>
                ))}
              </span>
            </Field>
          </div>
        </div>

        <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
          <span className="spine" style={{ "--spine": "#8a63ff" }} />
          <Field label="EXTRA INSTRUCTIONS" hint="KEPT WITH THE TEMPLATE, SO REGENERATE AND NEW VERSION REUSE IT WITHOUT RETYPING">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={7}
              className="admin-input" placeholder="Numbers must stay tabular. No gradients on the ground. Keep the accent to one element per scene." />
          </Field>
        </div>
      </div>

      <div style={{ marginTop: 34, textAlign: "center" }}>
        <button onClick={submit} disabled={!canSubmit} className="btn-mag btn-big">Generate the template →</button>
        {!canSubmit && (
          <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--color-dim)" }}>
            NAME · PROMPT (10+ CHARS) · ORIENTATION ARE REQUIRED
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}

// THE TWO WAYS IN. One template with every field, or a campaign of up to fifteen
// on one subject. Rendered as two real cards rather than a tab strip because the
// difference between them is a decision worth reading, not a filter.
function ModeChooser({ mode, onMode }) {
  const OPTIONS = [
    {
      key: "one", n: "01", title: "One template", sub: "in full detail",
      blurb: "You choose the name, the prompt, the orientation, the family, the brand colour and the duration. Best when you know exactly what you want.",
      meta: "~4 MIN · 1 TEMPLATE", tagc: "#e832a8",
    },
    {
      key: "campaign", n: "02", title: "A campaign", sub: "up to 15 templates",
      blurb: "Name a subject and a number. Each template takes a different angle on it, in a different renderer family, with its own animation — then renders and self-checks.",
      meta: "~4 MIN EACH · UP TO 15", tagc: "#7a5cff",
    },
  ];
  return (
    <div style={{ marginTop: 30, display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
      {OPTIONS.map((o) => {
        const on = mode === o.key;
        return (
          <button
            key={o.key} onClick={() => onMode(o.key)}
            className="editor-card"
            style={{
              textAlign: "left", padding: 22, cursor: "pointer",
              border: `1px solid ${on ? o.tagc : "rgba(255,255,255,0.10)"}`,
              boxShadow: on ? `0 0 0 1px ${o.tagc}, 0 18px 44px rgba(0,0,0,0.34)` : "none",
              opacity: on ? 1 : 0.66, transition: "opacity .18s, box-shadow .18s, border-color .18s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.2em", color: o.tagc }}>{o.n}</span>
              {on && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", color: o.tagc }}>● SELECTED</span>}
            </div>
            {/* Explicit light ink: editor-card is a DARK panel sitting on the
                studio's light page, so inheriting the page colour rendered these
                titles near-black on near-black. */}
            <div style={{ marginTop: 8, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, lineHeight: 1.1, color: "#f4efe4" }}>
              {o.title}
              <span style={{ display: "block", fontWeight: 500, fontSize: 15, color: "#a8a196" }}>{o.sub}</span>
            </div>
            <p style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5, color: "#a8a196" }}>{o.blurb}</p>
            <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", color: "#7d766a" }}>{o.meta}</div>
          </button>
        );
      })}
    </div>
  );
}

// LIVE PROGRESS — the render-farm monitor, pointed at the template pipeline.
// Same anatomy as ProductionTheater: stage checklist and a filling bar on the
// left, the thing being made on the right.
function RunPanel({ template, error, phase, chain, handedOff, onOpen, onCancel }) {
  const t = template || {};
  const { index, done, failed, step } = pipelineProgress(t, CHAIN_FLOOR[chain] ?? -1);
  const stalled = phase === "stalled";
  const stage = PIPELINE_STAGES[Math.max(0, Math.min(index, PIPELINE_STAGES.length - 1))];
  const prog = done ? 1 : Math.max(0.04, (index + 0.5) / PIPELINE_STAGES.length);
  const thumb = t.thumbnail ? mediaUrl(t.thumbnail) : null;
  const preview = t.previewVideo ? mediaUrl(t.previewVideo) : null;

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(16px,3vw,40px) clamp(16px,4vw,60px) 110px" }}>
      <span className="scene-pill" style={{ "--tagc": failed ? "#d8271b" : "#ffb03a" }}>ADMIN · BUILDING {String(t.slug || "").toUpperCase()}</span>
      <h1 className="headline" style={{ fontSize: "clamp(30px,4.6vw,56px)" }}>
        {failed ? <>The build <span style={{ color: "var(--color-rec)" }}>failed.</span></>
          : done ? <>Ready for <span style={{ color: "var(--color-lm)" }}>review.</span></>
            : <>Forging the <span style={{ color: "var(--color-am)" }}>pack.</span></>}
      </h1>
      <p style={{ marginTop: 12, fontSize: 15, color: "var(--color-dim)", lineHeight: 1.6, maxWidth: 520 }}>
        {failed ? "Nothing was published — the draft stays in staging with its error."
          : done ? (handedOff ? "Opening the review screen…" : "The draft is built and waiting in staging.")
            : stalled ? "The pipeline is not reporting progress. The template exists; open it to see where it stopped."
              : "A spec, then a pack.json and FRAME.md in staging, then a thumbnail and a preview. Nothing reaches the library until you publish."}
      </p>

      <div className="editor-card" style={{ marginTop: 32 }}>
        <PanelHead title="KEYFRAME — TEMPLATE FORGE"
          status={failed ? "● FAILED" : done ? "● BUILT" : stalled ? "● NO SIGNAL" : "● BUILDING"}
          statusColor={failed ? "var(--color-rec)" : stalled ? "#ffb03a" : "var(--color-lm)"} />

        <div style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr" }} data-demo-grid="1">
          <div style={{ padding: 24, borderRight: "1px solid rgba(242,237,226,.08)", minWidth: 0 }}>
            <div style={{ display: "grid", gap: "10px 16px" }}>
              {PIPELINE_STAGES.map((s, i) => {
                const lit = done || i < index;
                const cur = !done && !failed && i === index;
                return (
                  <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: lit ? s.c : cur ? "#f2ede2" : "#7d766a" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: lit ? s.c : cur ? "#f2ede2" : "rgba(242,237,226,.2)", animation: cur ? "kf2-blink 1s steps(1) infinite" : "none" }} />
                    {s.label}{lit ? " ✓" : ""}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 999, background: "rgba(242,237,226,.08)", overflow: "hidden" }}>
                <motion.span style={{ display: "block", height: "100%", borderRadius: 999, background: failed ? "var(--color-rec)" : "linear-gradient(90deg, var(--color-mag), var(--color-am))" }}
                  animate={{ width: `${Math.round(prog * 100)}%` }} transition={{ type: "spring", stiffness: 60, damping: 20 }} />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-lm)", opacity: done ? 1 : 0, transition: "opacity .4s" }}>
                STAGED ✓ NOT LIVE
              </span>
            </div>

            {/* the server's own words for what it is doing, not a guess at it */}
            <div style={{ marginTop: 18, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "#7d766a", lineHeight: 1.8 }}>
              {t.slug ? <>SLUG {t.slug.toUpperCase()}<br /></> : null}
              {t.currentVersion ? <>VERSION V{t.currentVersion}<br /></> : null}
              STATUS {String(t.status || "—")}{t.running ? ` · ${String(t.running).toUpperCase()}` : ""}
              {step ? <><br /><span style={{ color: "var(--color-dark-dim)" }}>{step}</span></> : null}
            </div>
          </div>

          <div style={{ position: "relative", minHeight: 300, background: "var(--color-dark-2)" }}>
            {preview ? (
              <video src={preview} muted loop autoPlay playsInline
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            ) : thumb ? (
              <img src={thumb} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div className="film-drift" style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #e832a8, #6b1050 55%, #2a0a20)", opacity: failed ? 0.35 : 0.95, transition: "opacity .5s" }} />
            )}
            <div className="film-scan" />
            <div style={{ position: "absolute", top: 12, left: 14, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.2em", color: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff4d3c", animation: failed || done ? "none" : "kf2-blink 1s steps(1) infinite" }} />
              {failed ? "SIGNAL LOST" : done ? "STAGED" : "FORGING"}
            </div>
            <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, textAlign: "center" }}>
              <span style={{ display: "inline-block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "#fff", background: "rgba(0,0,0,.55)", padding: "6px 12px", borderRadius: 8, backdropFilter: "blur(4px)" }}>
                {failed ? "Nothing was published." : done ? "Ready for review." : `${stage.label.charAt(0)}${stage.label.slice(1).toLowerCase()}…`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {(failed || error || stalled) && (
        <Notice tone={failed || error ? "error" : "warn"}
          title={failed ? "The pipeline reported a failure" : error ? "The pipeline call failed" : "No progress reported"}
          lines={[t.lastError, error?.message].filter(Boolean)}>
          The template still exists in staging — open it to retry, edit the brief, or delete it.
        </Notice>
      )}

      <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
        {t.id && <button className="btn-ink" onClick={onOpen}>Open the template <span className="dot-mag">●</span></button>}
        <button className="link-mono" onClick={onCancel}>← LIBRARY</button>
      </div>
    </div>
  );
}
