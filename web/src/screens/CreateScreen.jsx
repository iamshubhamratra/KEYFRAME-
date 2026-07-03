import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createProject, listFrames } from "../api.js";
import { PACK_LORE, PACK_ORDER, loreFor } from "../packlore.js";
import { PackCard } from "./Templates.jsx";

// The v2 editor, made real: "Type. Then watch it shoot itself."
// Dark editor card with traffic lights, colored source chips, timeline
// tracks that fill as you type, and a live preview pane.
const TABS = [
  { key: "prompt", label: "PROMPT", c: "#e832a8" },
  { key: "url", label: "URL", c: "#23c8e0" },
  { key: "video", label: "VIDEO", c: "#ffb03a" },
];

const EXAMPLE_PROMPTS = [
  "Launch a productivity app",
  "Promote a coffee brand",
  "Turn my dog into a movie star",
  "Explain our app in 30 seconds",
];
const SURPRISE_PROMPT =
  "A 30-second cinematic launch film for an AI note-taking app called Lumen — fast kinetic typography, a warm sunrise-to-night palette, three crisp feature beats, and a confident closing call to action.";

const ASPECT = { horizontal: "16:9", vertical: "9:16", square: "1:1" };

export default function CreateScreen({ onCreated, prefill }) {
  const [tab, setTab] = useState(prefill?.url ? "url" : "prompt");
  const [prompt, setPrompt] = useState(prefill?.prompt || "");
  const [url, setUrl] = useState(prefill?.url || "");
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState(30);
  const [orientation, setOrientation] = useState("horizontal");
  const [framePack, setFramePack] = useState(prefill?.framePack || "auto");
  const [captions, setCaptions] = useState(false);
  const [finish, setFinish] = useState("standard"); // standard = scene-kit · premium = LLM composer · cinema = Three.js 3D set
  const [packs, setPacks] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(prefill?.error || null);
  const fileInput = useRef(null);

  useEffect(() => {
    listFrames()
      .then((f) => setPacks(orderPacks(f.packs || [])))
      .catch(() => setPacks(orderPacks([])));
  }, []);

  useEffect(() => { if (prefill?.framePack) setFramePack(prefill.framePack); }, [prefill]);

  const packList = packs || orderPacks([]);
  const activeLore = framePack !== "auto" ? loreFor(framePack) : null;

  const sourceLen = tab === "prompt" ? prompt.trim().length : tab === "url" ? url.trim().length : (file ? 40 : 0);
  const canSubmit = !busy && (
    (tab === "prompt" && prompt.trim().length >= 10) ||
    (tab === "url" && /^https?:\/\/.+\..+/.test(url.trim())) ||
    (tab === "video" && file)
  );

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const fields = {
        duration, orientation, quality: "720p", framePack, captions,
        composeMode: finish === "cinema" ? "standard" : finish,
        ...(finish === "cinema" ? { render3d: true } : {}),
        ...(prompt.trim().length >= 10 ? { prompt: prompt.trim() } : {}),
        ...(tab === "url" && url.trim() ? { websiteUrl: url.trim() } : {}),
        ...(tab === "video" && file ? { referenceVideo: file } : {}),
      };
      const r = await createProject(fields);
      onCreated(r.projectId);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const status = busy ? "● ROLLING" : canSubmit ? "● READY" : "● LISTENING";

  return (
    <div className="pb-24">
      {/* ---------- header ---------- */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(16px,3vw,40px) clamp(16px,4vw,60px) 0" }}>
        <span className="scene-pill" style={{ "--tagc": "#e832a8" }}>SC 01 · THE BRIEF</span>
        <h1 className="headline" style={{ fontSize: "clamp(34px,5.4vw,72px)" }}>
          Type. Then watch it<br /><span style={{ color: "var(--color-cy)" }}>shoot itself.</span>
        </h1>

        {/* ---------- the editor ---------- */}
        <motion.div
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="editor-card"
          style={{ marginTop: 44 }}
        >
          <div className="editor-head">
            <span className="tl-dot" style={{ background: "#ff5f57" }} />
            <span className="tl-dot" style={{ background: "#febc2e" }} />
            <span className="tl-dot" style={{ background: "#28c840" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "#7d766a", marginLeft: 10 }}>KEYFRAME — EDITOR</span>
            <span className="editor-status" style={{ marginLeft: "auto" }}>{status}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr" }} data-demo-grid="1">
            {/* left — source input + timeline */}
            <div style={{ padding: 24, borderRight: "1px solid rgba(242,237,226,.08)", minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {TABS.map((t) => (
                  <button key={t.key} role="tab" aria-selected={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={`chip-c ${tab === t.key ? "is-active" : ""}`}
                    style={{ "--chipc": t.c }}>
                    {t.label}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {tab === "prompt" && (
                  <motion.div key="prompt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="A launch film for our sneaker drop — fast cuts, neon energy"
                      className="editor-inset w-full resize-none"
                      style={{ minHeight: 96, padding: "14px 16px" }}
                    />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                      {EXAMPLE_PROMPTS.map((ex) => (
                        <button key={ex} type="button" onClick={() => setPrompt(ex)} className="chip-c" style={{ "--chipc": "rgba(242,237,226,.6)" }}>{ex}</button>
                      ))}
                      <button type="button" onClick={() => setPrompt(SURPRISE_PROMPT)} className="chip-c" style={{ "--chipc": "#b9f24a" }}>✦ SURPRISE ME</button>
                    </div>
                  </motion.div>
                )}
                {tab === "url" && (
                  <motion.div key="url" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://your-product.com"
                      className="editor-inset w-full"
                      style={{ padding: "14px 16px" }}
                    />
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Optional — anything specific the film should say?"
                      className="editor-inset w-full resize-none"
                      style={{ marginTop: 10, height: 60, padding: "10px 16px", fontSize: 12 }}
                    />
                  </motion.div>
                )}
                {tab === "video" && (
                  <motion.div
                    key="video"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                    onClick={() => fileInput.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
                    style={{ border: "1px dashed rgba(242,237,226,.3)", background: "var(--color-dark)", borderRadius: 12, padding: "30px 16px", textAlign: "center", cursor: "pointer" }}
                  >
                    <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,video/webm" hidden
                      onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    {file
                      ? <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-lm)", margin: 0 }}>{file.name} <span style={{ color: "#7d766a" }}>({Math.round(file.size / 1048576)} MB)</span></p>
                      : <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", color: "#9a9284", margin: 0, lineHeight: 1.8 }}>DROP A REFERENCE FILM<br /><span style={{ fontSize: 9, color: "#7d766a" }}>MP4 / MOV / WEBM · UP TO 200 MB — WE TRANSCRIBE AND STUDY ITS STYLE</span></p>}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* timeline tracks fill as the brief takes shape */}
              <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
                <TimelineRow label="V1">
                  <span className="clip-block" style={{ flex: 1.3, background: "linear-gradient(135deg, var(--color-mag), #8a1d64)", transform: `scaleX(${sourceLen > 6 ? 1 : 0})` }} />
                  <span className="clip-block" style={{ flex: 1, background: "linear-gradient(135deg, var(--color-cy), #127080)", transform: `scaleX(${sourceLen > 18 ? 1 : 0})`, transitionDelay: ".08s" }} />
                  <span className="clip-block" style={{ flex: 1.6, background: "linear-gradient(135deg, var(--color-am), #a56a12)", transform: `scaleX(${sourceLen > 32 ? 1 : 0})`, transitionDelay: ".16s" }} />
                </TimelineRow>
                <TimelineRow label="VO" h={20}>
                  <span className="clip-block" style={{ display: "block", height: "100%", width: "82%", background: "repeating-linear-gradient(90deg, var(--color-lm) 0 2px, rgba(185,242,74,.25) 2px 5px)", transform: `scaleX(${sourceLen > 12 ? 1 : 0})` }} />
                </TimelineRow>
                <TimelineRow label="MUS" h={20}>
                  <span className="clip-block" style={{ display: "block", height: "100%", width: "94%", background: "linear-gradient(90deg, var(--color-cb), rgba(43,91,255,.3))", transform: `scaleX(${sourceLen > 24 ? 1 : 0})` }} />
                </TimelineRow>
              </div>

              {/* meta + produce */}
              <div style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 14, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", color: "#9a9284", flexWrap: "wrap" }}>
                  <span>⏱ {duration}S</span>
                  <span>▦ {ASPECT[orientation]}</span>
                  <span>{captions ? "CC ON" : "♪ SCORED"}</span>
                  <span style={{ color: activeLore ? activeLore.accent : "#9a9284" }}>{activeLore ? activeLore.name.toUpperCase() : "AUTO LOOK"}</span>
                  {finish === "premium" && <span style={{ color: "var(--color-mag)" }}>◆ PREMIUM CUT</span>}
                  {finish === "cinema" && <span style={{ color: "var(--color-cy)" }}>▲ CINEMA 3D</span>}
                </div>
                <button onClick={submit} disabled={!canSubmit} className="btn-mag" style={{ padding: "11px 24px", fontSize: 14 }}>
                  {busy ? "Rolling…" : "Produce →"}
                </button>
              </div>
            </div>

            {/* right — live preview pane */}
            <div style={{ position: "relative", minHeight: 300, background: "var(--color-dark-2)" }}>
              <div className="film-drift" style={{ position: "absolute", inset: 0, background: activeLore ? activeLore.filmGrad : "linear-gradient(135deg, #e832a8, #6b1050 55%, #2a0a20)", opacity: 0.95 }} />
              <div className="film-scan" />
              <div style={{ position: "absolute", top: 12, left: 14, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.2em", color: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff4d3c", animation: "kf2-blink 1s steps(1) infinite" }} />PREVIEW
              </div>
              <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, textAlign: "center" }}>
                <span style={{ display: "inline-block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "#fff", background: "rgba(0,0,0,.55)", padding: "6px 12px", borderRadius: 8, backdropFilter: "blur(4px)" }}>
                  {activeLore ? activeLore.demo : (prompt.trim() ? prompt.trim().slice(0, 42) + (prompt.trim().length > 42 ? "…" : "") : "Your film starts here.")}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {error && <p style={{ marginTop: 16, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-rec)" }}>{error}</p>}

        {/* ---------- options: white spine cards ---------- */}
        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 14 }}>
          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": "#e832a8" }} />
            <div className="label-mono" style={{ marginBottom: 10 }}>DURATION — {duration}S</div>
            <input type="range" min="10" max="60" step="5" value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full" style={{ accentColor: "var(--color-mag)" }} />
          </div>
          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": "#23c8e0" }} />
            <div className="label-mono" style={{ marginBottom: 10 }}>ORIENTATION — {ASPECT[orientation]}</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["horizontal", "vertical", "square"].map((o) => (
                <button key={o} onClick={() => setOrientation(o)}
                  style={{
                    width: o === "vertical" ? 20 : o === "square" ? 28 : 40,
                    height: o === "vertical" ? 34 : o === "square" ? 28 : 24,
                    borderRadius: 5, cursor: "pointer", transition: "all .3s",
                    border: `1.5px solid ${orientation === o ? "var(--color-cy)" : "rgba(23,19,14,.25)"}`,
                    background: orientation === o ? "rgba(35,200,224,.14)" : "transparent",
                  }}
                  title={o} aria-label={`${o} orientation`} aria-pressed={orientation === o} />
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: "20px 22px 20px 27px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span className="spine" style={{ "--spine": "#ffb03a" }} />
            <div>
              <div className="label-mono" style={{ marginBottom: 4 }}>CAPTIONS</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>{captions ? "BURNED IN — SMALL, BOTTOM" : "OFF — .SRT EXPORTED"}</div>
            </div>
            <button
              type="button" role="switch" aria-checked={captions} aria-label="Toggle burned-in captions"
              onClick={() => setCaptions((v) => !v)}
              style={{ position: "relative", flexShrink: 0, width: 44, height: 24, borderRadius: 999, cursor: "pointer", transition: "background .3s, border-color .3s", background: captions ? "var(--color-am)" : "var(--color-paper-2)", border: `1px solid ${captions ? "var(--color-am)" : "rgba(23,19,14,.25)"}` }}
            >
              <span style={{ position: "absolute", top: 2, left: 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(23,19,14,.3)", transition: "transform .3s", transform: captions ? "translateX(20px)" : "translateX(0)" }} />
            </button>
          </div>
          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": "#b9f24a" }} />
            <div className="label-mono" style={{ marginBottom: 10 }}>FINISH — {finish === "premium" ? "PREMIUM" : finish === "cinema" ? "CINEMA 3D" : "STANDARD"}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setFinish("standard")}
                className={`chip-c on-paper ${finish === "standard" ? "is-active" : ""}`}
                style={{ "--chipc": "#b9f24a" }}
                title="Deterministic scene-kit — fast, reliable, ~2 min">
                STANDARD
              </button>
              <button type="button" onClick={() => setFinish("premium")}
                className={`chip-c on-paper ${finish === "premium" ? "is-active" : ""}`}
                style={{ "--chipc": "#e832a8" }}
                title="AI-composed layouts — richer, bespoke, ~10–15 min">
                ◆ PREMIUM
              </button>
              <button type="button" onClick={() => setFinish("cinema")}
                className={`chip-c on-paper ${finish === "cinema" ? "is-active" : ""}`}
                style={{ "--chipc": "#23c8e0" }}
                title="3D film set — your product on a retro CRT screen, WebGL bloom + film grain">
                ▲ CINEMA 3D
              </button>
            </div>
            <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
              {finish === "premium" ? "AI-COMPOSED SCENES · ~10–15 MIN · RICHER"
                : finish === "cinema" ? "3D SET · CRT SCREEN + FILM GRAIN · ~3–5 MIN"
                : "CODE-BUILT SCENES · ~2 MIN · RELIABLE"}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- packs ---------- */}
      <section id="templates" style={{ maxWidth: 1120, margin: "0 auto", padding: "clamp(60px,9vw,110px) clamp(16px,4vw,60px) 0" }}>
        <span className="scene-pill" style={{ "--tagc": "#b9f24a", background: "var(--color-ink)", border: "none" }}>SC 02 · ART DIRECTION</span>
        <h2 className="headline" style={{ fontSize: "clamp(32px,5vw,64px)" }}>
          Pick the look.<br />We <span style={{ color: "var(--color-am)" }}>art-direct</span> the film.
        </h2>
        <p style={{ maxWidth: 560, color: "var(--color-dim)", fontSize: 16, lineHeight: 1.6, margin: "16px 0 0" }}>
          Ten frame packs, each a complete design system — or leave it on auto and
          the pipeline casts the look that fits your brief.
        </p>

        <div style={{ marginTop: 36, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 16 }}>
          <SelectablePack active={framePack === "auto"} onSelect={() => setFramePack("auto")}>
            <AutoCard />
          </SelectablePack>
          {packList.map((p) => (
            <SelectablePack key={p.name} active={framePack === p.name}
              onSelect={() => setFramePack(framePack === p.name ? "auto" : p.name)}>
              <PackCard compact pack={p} />
            </SelectablePack>
          ))}
        </div>

        <div style={{ marginTop: 46, textAlign: "center" }}>
          <button onClick={submit} disabled={!canSubmit} className="btn-mag btn-big">
            {busy ? "Rolling…" : "Start your film →"}
          </button>
        </div>
      </section>
    </div>
  );
}

function TimelineRow({ label, h = 26, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 44, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "#7d766a" }}>{label}</span>
      <div className="clip-track" style={{ flex: 1, height: h }}>{children}</div>
    </div>
  );
}

function orderPacks(serverPacks) {
  const byName = Object.fromEntries(serverPacks.map((p) => [p.name, p]));
  const known = PACK_ORDER.map((name) => ({ name, ...(byName[name] || {}) }));
  const extras = serverPacks.filter((p) => !PACK_LORE[p.name]);
  return [...known, ...extras];
}

// Selection ring + magenta check over a pack card.
function SelectablePack({ active, onSelect, children }) {
  return (
    <div role="button" aria-pressed={active} tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      style={{ position: "relative", borderRadius: 18, outline: active ? "2px solid var(--color-mag)" : "none", outlineOffset: 3 }}>
      <div style={{ pointerEvents: "none" }}>{children}</div>
      {active && (
        <div aria-hidden="true" style={{ position: "absolute", top: 10, right: 10, zIndex: 5, width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12, background: "var(--color-mag)", color: "#17130e", boxShadow: "0 4px 14px rgba(232,50,168,.5)" }}>✓</div>
      )}
    </div>
  );
}

// The "auto-direct" card in the same v2 anatomy.
function AutoCard() {
  return (
    <div className="card card-lift" style={{ overflow: "hidden", cursor: "pointer" }}>
      <span className="spine" style={{ "--spine": "#e832a8", zIndex: 2 }} />
      <div className="film-drift" style={{ aspectRatio: "16/10", position: "relative", overflow: "hidden", background: "linear-gradient(135deg, #e832a8, #23c8e0 55%, #17130e)", display: "grid", placeItems: "center" }}>
        <div className="film-scan" />
        <div style={{ position: "relative", zIndex: 2, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "clamp(17px,2vw,24px)", color: "#fff", letterSpacing: "-.02em", textShadow: "0 4px 20px rgba(0,0,0,.35)" }}>✦ Auto-direct</div>
      </div>
      <div style={{ padding: "16px 16px 18px 21px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, margin: 0, color: "var(--color-ink)" }}>Auto</h3>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", color: "var(--color-mag)" }}>AI PICKS</span>
        </div>
        <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--color-dim)" }}>IT CHOOSES THE LOOK →</div>
      </div>
    </div>
  );
}
