import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { adminCreateTemplate, adminGenerate, adminGetTemplate, mediaUrl, subscribeTemplate } from "../api.js";
import { statusMeta } from "./AdminTemplates.jsx";

// THE TEMPLATE GENERATOR — a brief in, a reviewable template out.
//
// Two calls, not one: POST /templates creates the DRAFT record (and is where a bad name, a
// taken slug or an unsupported orientation is refused, synchronously and with a real reason),
// then POST /templates/:id/generate starts the long work and answers 202. Everything after
// that arrives on the event stream — the record itself, each time it changes.
//
// The form idiom is CreateScreen's: white cards with a colour spine, mono labels, the same
// field classes. This is the second-biggest form in the app and it should not feel like a
// different product from the first.

// The one orientation the generator can currently author, and the reason for the other two.
//
// THIS TEXT MIRRORS server/src/templates/generator.js (ORIENTATION_REFUSAL), which is the
// authority — it refuses landscape at CREATE time with a 400. It is repeated here so the
// option is disabled with its reason ON it, rather than letting an admin fill in a whole brief
// and discover the limit from a red error line. If the server ever gains a landscape strategy,
// this is one of the two places to change.
const ORIENTATIONS = [
  {
    value: "vertical", label: "9:16", name: "Vertical",
    hint: "Reels, Shorts & TikTok", enabled: true,
  },
  {
    value: "horizontal", label: "16:9", name: "Landscape",
    hint: "YouTube, web & keynote", enabled: true,
  },
  {
    value: "square", label: "1:1", name: "Square",
    hint: "Feed posts", enabled: false,
    // Kept in step with generator.ORIENTATION_REFUSAL — the server is the authority on which
    // aspects it can author, and a stale reason here is how a UI ends up refusing something the
    // API would happily accept (which is exactly what this option said about 16:9 until the
    // engine gained its landscape stage).
    reason: "This generator authors 9:16 (portrait) and 16:9 (landscape). Square has no authored stage in the engine yet — it would need a 1:1 stage in film_stage.STAGES and a matching layout family in film_beats.",
  },
];

// THE PROGRESS LADDER. Every `key` below is the EXACT string the server writes onto the record
// (templates/service.js runGeneration → step()), so the ladder can never claim a stage the
// pipeline did not run.
//
// Note what is NOT here: "Generating preview". The preview video is rendered at PUBLISH time,
// not during generation — generation produces still frames (the "Generating thumbnail" step).
// A seventh rung that can never light during a generation would read as a stage that silently
// failed every single time.
const LADDER = [
  { key: "Generating template", label: "Generating template", note: "The design model authors the spec — colours, type, motion, beats." },
  { key: "Creating source files", label: "Creating source files", note: "Spec compiled into a composer module, pack.json and FRAME.md." },
  { key: "Validating template", label: "Validating", note: "Does the renderer resolve, and does it build a real composition?" },
  { key: "Generating thumbnail", label: "Generating thumbnail", note: "Real frames of the real template, captured in a headless browser." },
  { key: "Running quality checks", label: "Running quality checks", note: "Design, layout, motion, media and audio scored out of 100." },
  { key: "Ready for review", label: "Ready for review", note: "Generated. Review it, test it, then publish it." },
];

// Which rung the record's `progress` string is on. The design stage reports its repair laps as
// "Refining the design (…)", which is still rung 0 — a repair lap is the SAME stage trying
// again, and showing it as progress would make the ladder walk backwards when a lap lands.
function ladderIndex(progress) {
  const p = String(progress || "").toLowerCase();
  if (!p) return 0;
  if (p.startsWith("refining the design") || p === "designing") return 0;
  const i = LADDER.findIndex((s) => p.startsWith(s.key.toLowerCase()));
  return i === -1 ? 0 : i;
}

// Categories that already exist across the shipped packs, offered as a datalist rather than a
// closed <select>: the spec accepts any 2–32 character string and the generated design picks
// its own category anyway, so this is a hint, never a constraint.
const CATEGORY_HINTS = ["Animated", "Nature", "Craft", "Sport", "Food & Drink", "Travel", "Retro", "Nightlife", "Editorial", "Tech", "Wellness", "Urban"];

const STYLE_HINTS = [
  "Bold editorial type, high contrast",
  "Soft pastel, hand-drawn, playful",
  "Dark cinematic with neon accents",
  "Swiss modernist grid, one accent",
  "Warm analogue film, grain and light leaks",
];

export default function AdminTemplateNew({ onOpen, onBack }) {
  // form
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [orientation, setOrientation] = useState("vertical");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Animated");
  const [tags, setTags] = useState("");
  const [style, setStyle] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [duration, setDuration] = useState(24);
  const [instructions, setInstructions] = useState("");

  // run
  const [phase, setPhase] = useState("form");   // form · starting · running · done · failed
  const [tpl, setTpl] = useState(null);
  const [error, setError] = useState(null);
  const unsub = useRef(null);

  // Close the stream on unmount whatever phase we are in — an abandoned EventSource keeps a
  // 1s server poll alive for a template nobody is watching.
  useEffect(() => () => { unsub.current?.(); }, []);

  const canSubmit = phase === "form" && name.trim().length >= 2 && prompt.trim().length >= 10;

  function watch(id) {
    unsub.current?.();
    unsub.current = subscribeTemplate(id, {
      onUpdate: (rec) => {
        setTpl(rec);
        // THE CLIENT DECIDES WHEN IT IS DONE WATCHING. The server only ends the stream for
        // PUBLISHED / FAILED / ARCHIVED, so a template that lands on GENERATED — the normal,
        // successful outcome of this screen — would stream forever. Nothing in flight and a
        // status that is no longer GENERATING is the end of THIS screen's job.
        if (!rec.busy && rec.status !== "GENERATING") {
          unsub.current?.(); unsub.current = null;
          setPhase(rec.status === "FAILED" ? "failed" : "done");
          if (rec.status === "FAILED") setError(rec.error || "generation failed");
        }
      },
      // A dropped stream is not a failed generation — the work continues on the server. Read
      // the record back once so the screen shows where it actually got to.
      onClose: async () => {
        unsub.current = null;
        try {
          const r = await adminGetTemplate(id);
          setTpl(r.template);
          if (r.template.status === "FAILED") { setPhase("failed"); setError(r.template.error || "generation failed"); }
          else if (!r.template.busy && r.template.status !== "GENERATING") setPhase("done");
        } catch { /* the buttons below still let the admin open the template directly */ }
      },
    });
  }

  async function submit() {
    setPhase("starting");
    setError(null);
    try {
      // The JOB orientation vocabulary (horizontal | vertical | square) is what the whole app
      // posts — CreateScreen posts it too. The server maps it to the PACK vocabulary and stores
      // the record as "portrait"; see frame_manifest.js JOB_ASPECT for the two-way mapping.
      const { template } = await adminCreateTemplate({
        name: name.trim(),
        prompt: prompt.trim(),
        orientation,
        description: description.trim(),
        category: category.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        style: style.trim() || null,
        brandColor: brandColor.trim() || null,
        duration: Number(duration) || null,
        instructions: instructions.trim() || null,
      });
      setTpl(template);
      const r = await adminGenerate(template.id);
      setTpl(r.template || template);
      setPhase("running");
      watch(template.id);
    } catch (e) {
      // Two different failures land here and they are not the same thing: a refused CREATE
      // (nothing exists yet — fix the form) and a refused GENERATE (the draft DOES exist and is
      // openable). `tpl` tells them apart for the buttons below.
      setError(e.message);
      setPhase("failed");
    }
  }

  async function retry() {
    if (!tpl) { setPhase("form"); setError(null); return; }
    setError(null);
    setPhase("running");
    try {
      const r = await adminGenerate(tpl.id);
      setTpl(r.template || tpl);
      watch(tpl.id);
    } catch (e) { setError(e.message); setPhase("failed"); }
  }

  if (phase !== "form") return (
    <RunView tpl={tpl} phase={phase} error={error} onOpen={onOpen} onBack={onBack} onRetry={retry} />
  );

  return (
    <div className="pb-24">
      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "clamp(20px,4vw,50px) clamp(16px,4vw,60px) 0" }}>
        <button className="link-mono" onClick={onBack} style={{ marginBottom: 22 }}>← TEMPLATE LIBRARY</button>
        <span className="scene-pill" style={{ "--tagc": "#e832a8" }}>ADMIN · NEW TEMPLATE</span>
        <h1 className="headline" style={{ fontSize: "clamp(32px,5vw,64px)", maxWidth: "15ch" }}>
          Describe it once.<br /><span style={{ color: "var(--color-cy)" }}>It designs itself.</span>
        </h1>
        <p style={{ color: "var(--color-dim)", maxWidth: 600, margin: "18px 0 0", lineHeight: 1.6, fontSize: 15.5 }}>
          The brief becomes a validated design spec, a composer module and a real still set. It
          lands as a draft — invisible to users until you publish it.
        </p>

        <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* ---- required ---- */}
          <Card spine="#e832a8" title="TEMPLATE NAME" required
            hint="Becomes the slug, the directory name and the renderer id — letters, numbers and dashes.">
            <input value={name} onChange={(e) => setName(e.target.value)} className="field"
              placeholder="Midnight Dispatch" aria-label="Template name"
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", fontSize: 15 }} />
            {name.trim() && (
              <div style={{ marginTop: 9, fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
                SLUG → {slugPreview(name) || "—"}
              </div>
            )}
          </Card>

          <Card spine="#23c8e0" title="GENERATION PROMPT" required
            hint="The design brief. Say what the template should look like and feel like, not what any one film says.">
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="field w-full resize-none"
              placeholder="A late-night broadcast look — deep ink ground, one hot amber accent, condensed type that snaps in on the beat, subtle scanlines, quick hard cuts."
              aria-label="Generation prompt"
              style={{ width: "100%", boxSizing: "border-box", minHeight: 120, padding: "12px 14px", fontSize: 14.5, lineHeight: 1.55 }} />
            <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: prompt.trim().length >= 10 ? "var(--color-dim)" : "var(--color-rec)" }}>
              {prompt.trim().length} CHARS {prompt.trim().length < 10 ? "— AT LEAST 10 REQUIRED" : ""}
            </div>
          </Card>

          <Card spine="#ffb03a" title={`ORIENTATION — ${ORIENTATIONS.find((o) => o.value === orientation)?.label || "9:16"}`} required
            hint="Only 9:16 can be generated today. The other two say why.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 10 }}>
              {ORIENTATIONS.map((o) => (
                <button key={o.value} type="button"
                  onClick={() => o.enabled && setOrientation(o.value)}
                  disabled={!o.enabled}
                  aria-pressed={orientation === o.value}
                  aria-label={`${o.label} ${o.name}${o.enabled ? "" : " — unavailable"}`}
                  title={o.reason || `${o.name} — ${o.hint}`}
                  style={{
                    textAlign: "left", padding: "13px 15px", borderRadius: 14, cursor: o.enabled ? "pointer" : "not-allowed",
                    background: orientation === o.value && o.enabled ? "rgba(255,176,58,.12)" : "var(--color-paper-2)",
                    border: `1.5px solid ${orientation === o.value && o.enabled ? "var(--color-am)" : "rgba(23,19,14,.14)"}`,
                    opacity: o.enabled ? 1 : 0.55, transition: "background .25s, border-color .25s",
                  }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{
                      flex: "none", width: o.value === "vertical" ? 17 : o.value === "square" ? 24 : 32,
                      height: o.value === "vertical" ? 30 : o.value === "square" ? 24 : 18, borderRadius: 4,
                      border: `1.5px solid ${orientation === o.value && o.enabled ? "var(--color-am)" : "rgba(23,19,14,.3)"}`,
                    }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--color-ink)" }}>{o.label}</span>
                      <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-dim)", marginTop: 2 }}>{o.name}</span>
                    </span>
                  </span>
                  <span style={{ display: "block", fontSize: 11.5, lineHeight: 1.5, color: "var(--color-dim)", marginTop: 9 }}>
                    {o.enabled ? o.hint : o.reason}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          {/* ---- optional ---- */}
          <div className="label-mono" style={{ marginTop: 12 }}>OPTIONAL — EVERYTHING BELOW STEERS THE DESIGN</div>

          <Card spine="#8b5cf6" title="DESCRIPTION"
            hint="Shown to users in the picker. Also a publish requirement — a template with no description is blocked at the gate.">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="field w-full resize-none"
              placeholder="A late-night broadcast look for launches and announcements." aria-label="Description"
              style={{ width: "100%", boxSizing: "border-box", minHeight: 64, padding: "11px 14px", fontSize: 14 }} />
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))", gap: 14, alignItems: "start" }}>
            <Card spine="#b9f24a" title="CATEGORY" hint="How the picker files it. The generated design may refine it.">
              <input value={category} onChange={(e) => setCategory(e.target.value)} className="field" list="kf-admin-categories"
                aria-label="Category" style={{ width: "100%", boxSizing: "border-box", padding: "10px 13px", fontSize: 14 }} />
              <datalist id="kf-admin-categories">
                {CATEGORY_HINTS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </Card>

            <Card spine="#4ac9f2" title="TAGS" hint="Comma separated. Music track ranking scores candidates against these.">
              <input value={tags} onChange={(e) => setTags(e.target.value)} className="field"
                placeholder="broadcast, night, condensed" aria-label="Tags"
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 13px", fontSize: 14 }} />
            </Card>

            <Card spine="#ff6a3c" title={`TARGET DURATION — ${duration}S`} hint="The length the beat structure is designed around.">
              <input type="range" min="10" max="60" step="2" value={duration}
                onChange={(e) => setDuration(Number(e.target.value))} className="w-full"
                aria-label="Target duration in seconds" style={{ accentColor: "var(--color-mag)" }} />
            </Card>

            <Card spine={brandColor.trim() || "#c56bff"} title="BRAND COLOUR" hint="A hue to build the palette around. Blank lets the design choose.">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(brandColor.trim()) ? brandColor.trim() : "#e832a8"}
                  onChange={(e) => setBrandColor(e.target.value)} aria-label="Brand colour picker"
                  style={{ width: 30, height: 30, padding: 0, borderRadius: 8, border: "1px solid rgba(23,19,14,.2)", background: "none", cursor: "pointer" }} />
                <input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="field"
                  placeholder="#RRGGBB" spellCheck={false} maxLength={7} aria-label="Brand colour hex"
                  style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "9px 12px", fontFamily: "var(--font-mono)", fontSize: 12, textTransform: "uppercase" }} />
                {brandColor.trim() && (
                  <button type="button" className="link-mono" onClick={() => setBrandColor("")} style={{ borderBottomColor: "var(--color-dim)" }}>CLEAR</button>
                )}
              </div>
            </Card>
          </div>

          <Card spine="#22c55e" title="STYLE" hint="A one-line style direction, if the prompt above did not already say it.">
            <input value={style} onChange={(e) => setStyle(e.target.value)} className="field"
              placeholder={STYLE_HINTS[0]} aria-label="Style"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 13px", fontSize: 14 }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
              {STYLE_HINTS.map((s) => (
                <button key={s} type="button" onClick={() => setStyle(s)} className="chip-c on-paper" style={{ "--chipc": "#22c55e" }}>{s}</button>
              ))}
            </div>
          </Card>

          <Card spine="#7d766a" title="ADDITIONAL DESIGN INSTRUCTIONS"
            hint="Constraints the design must honour — a typeface family, a motion rule, something to avoid.">
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} className="field w-full resize-none"
              placeholder="No drop shadows. Keep every headline on one line. Cuts on the beat, never crossfades."
              aria-label="Additional design instructions"
              style={{ width: "100%", boxSizing: "border-box", minHeight: 76, padding: "11px 14px", fontSize: 14 }} />
          </Card>
        </div>

        {error && <p style={{ marginTop: 16, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-rec)", lineHeight: 1.6 }}>{error}</p>}

        <div style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <button className="btn-mag btn-big" disabled={!canSubmit} onClick={submit}>Generate template →</button>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--color-dim)" }}>
            {canSubmit ? "● READY — ABOUT 1–3 MINUTES" : "● A NAME AND A PROMPT ARE REQUIRED"}
          </span>
        </div>
      </section>
    </div>
  );
}

// The server derives the slug the same way (routes/admin_templates.js). Shown, not sent — the
// slug becomes a directory name and a renderer id, so seeing it before submitting is the
// difference between a considered name and a surprise.
function slugPreview(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function Card({ spine, title, hint, required = false, children }) {
  return (
    <div className="card" style={{ padding: "18px 22px 20px 27px" }}>
      <span className="spine" style={{ "--spine": spine }} />
      <div className="label-mono" style={{ marginBottom: hint ? 4 : 11 }}>
        {title}{required && <span style={{ color: "var(--color-mag)", marginLeft: 6 }}>REQUIRED</span>}
      </div>
      {hint && <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-dim)", marginBottom: 12 }}>{hint}</div>}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- the run view

// The progress ladder, on the dark render-monitor card the pipeline screen already uses. The
// admin is waiting on exactly the same kind of thing here, so it looks the same.
function RunView({ tpl, phase, error, onOpen, onBack, onRetry }) {
  const running = phase === "running" || phase === "starting";
  const failed = phase === "failed";
  const done = phase === "done";
  const active = ladderIndex(tpl?.progress);
  const pct = done ? 100 : Math.max(4, Math.min(100, Number(tpl?.progressPct) || 5));
  const m = statusMeta(tpl?.status);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "clamp(20px,4vw,50px) clamp(16px,4vw,60px) 100px" }}>
      <button className="link-mono" onClick={onBack} style={{ marginBottom: 22 }}>← TEMPLATE LIBRARY</button>
      <span className="scene-pill" style={{ "--tagc": failed ? "#d8271b" : done ? "#b9f24a" : "#ffb03a" }}>
        ADMIN · {failed ? "GENERATION FAILED" : done ? "READY FOR REVIEW" : "GENERATING"}
      </span>
      <h1 className="headline" style={{ fontSize: "clamp(30px,4.6vw,56px)" }}>
        {failed ? <>The design <span style={{ color: "var(--color-rec)" }}>stopped.</span></>
          : done ? <>Meet <span style={{ color: "var(--color-am)" }}>{tpl?.name || "your template"}.</span></>
            : <>Designing <span style={{ color: "var(--color-am)" }}>{tpl?.name || "your template"}…</span></>}
      </h1>
      <p style={{ marginTop: 12, fontSize: 15, color: "var(--color-dim)", lineHeight: 1.6, maxWidth: 560 }}>
        {failed ? "Nothing was published and nothing is visible to users. The full error is below."
          : done ? "Generated as a draft. Review the frames, run a test render, then publish it."
            : "One heavy design call, a compile, a validation build and a real capture pass. Leave this open — it streams."}
      </p>

      <div className="editor-card" style={{ marginTop: 32 }}>
        <div className="editor-head">
          <span className="tl-dot" style={{ background: "#ff5f57" }} />
          <span className="tl-dot" style={{ background: "#febc2e" }} />
          <span className="tl-dot" style={{ background: "#28c840" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "#7d766a", marginLeft: 10 }}>
            KEYFRAME — TEMPLATE DESIGNER{tpl?.slug ? ` · ${tpl.slug}` : ""}
          </span>
          <span className="editor-status" style={{ marginLeft: "auto", color: failed ? "var(--color-rec)" : m.c }}>
            ● {failed ? "STOPPED" : (tpl?.busy || m.label).toUpperCase()}
          </span>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {LADDER.map((s, i) => {
              const lit = done || i < active;
              const cur = running && i === active;
              const stalled = failed && i === active;
              const c = stalled ? "#d8271b" : lit ? "#b9f24a" : cur ? "#f2ede2" : "#7d766a";
              return (
                <div key={s.key} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "9px 0" }}>
                  <span style={{ flex: "none", marginTop: 4, width: 9, height: 9, borderRadius: "50%", background: lit || cur || stalled ? c : "rgba(242,237,226,.18)", animation: cur ? "kf2-blink 1s steps(1) infinite" : "none" }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: c }}>
                      {s.label}{lit ? " ✓" : stalled ? " ✕" : ""}
                    </span>
                    <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.5, color: cur || stalled ? "#9a9284" : "#7d766a", marginTop: 3 }}>{s.note}</span>
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 999, background: "rgba(242,237,226,.08)", overflow: "hidden" }}>
              <motion.span style={{ display: "block", height: "100%", borderRadius: 999, background: failed ? "var(--color-rec)" : "linear-gradient(90deg, var(--color-mag), var(--color-am))" }}
                animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 60, damping: 20 }} />
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "#9a9284" }}>{pct}%</span>
          </div>

          {/* The stills as they appear — the first honest evidence that the design is real. */}
          <AnimatePresence>
            {!!(tpl?.stills || []).length && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px,1fr))", gap: 10 }}>
                {tpl.stills.map((s, i) => (
                  <img key={s} src={mediaUrl(s)} alt={`Frame ${i + 1}`} loading="lazy"
                    style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 10, border: "1px solid rgba(242,237,226,.12)", background: "#0d0b07" }} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {failed && (
        <div className="card" style={{ marginTop: 22, padding: "20px 22px 20px 27px" }}>
          <span className="spine" style={{ "--spine": "#d8271b" }} />
          <div className="label-mono" style={{ marginBottom: 8, color: "var(--color-rec)" }}>WHAT WENT WRONG</div>
          {/* Verbatim. The generator's failures are specific ("the generated renderer does not
              resolve", "the design failed validation after N repair laps") and a friendly
              paraphrase would throw away the only thing that says what to change. */}
          <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.65, color: "var(--color-ink)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {error || tpl?.error || "unknown error"}
          </p>
        </div>
      )}

      <div style={{ marginTop: 30, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        {done && tpl && <button className="btn-mag" onClick={() => onOpen?.(tpl.id)}>Review template →</button>}
        {failed && tpl && <button className="btn-ink" onClick={onRetry}>Try again</button>}
        {failed && tpl && <button className="btn-chip" onClick={() => onOpen?.(tpl.id)}>Open the draft</button>}
        {failed && !tpl && <button className="btn-ink" onClick={onRetry}>Back to the form</button>}
        {running && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--color-dim)" }}>● STREAMING — SAFE TO WAIT</span>}
        <button className="link-mono" onClick={onBack}>TEMPLATE LIBRARY</button>
      </div>
    </div>
  );
}
