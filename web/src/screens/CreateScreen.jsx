import { useEffect, useMemo, useRef, useState } from "react";
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

// Caption languages — mirrors the server whitelist (services/caption_lang.js).
// "en" is the source language (script + default voiceover); the rest translate.
const CAPTION_LANGS = [
  { code: "en", label: "English (US)" },
  { code: "hi", label: "Hindi" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "ar", label: "Arabic" },
  { code: "ja", label: "Japanese" },
];

// Ready-made accent pairs, so "use your brand color" isn't a blank color well for
// the (many) people who never look up their own hexes. A preset is still only an
// ACCENT pair — it steers the same two stops a hand-picked palette does, and no
// pack's ground, type or motion moves for it.
const BRAND_PRESETS = [
  { id: "ocean", label: "Ocean", primary: "#3b82f6", secondary: "#06b6d4" },
  { id: "sunset", label: "Sunset", primary: "#f97316", secondary: "#ef4444" },
  { id: "forest", label: "Forest", primary: "#10b981", secondary: "#22c55e" },
  { id: "royal", label: "Royal", primary: "#6366f1", secondary: "#8b5cf6" },
  { id: "neon", label: "Neon", primary: "#ec4899", secondary: "#a855f7" },
  { id: "gold", label: "Luxury Gold", primary: "#f59e0b", secondary: "#fbbf24" },
];

export default function CreateScreen({ onCreated, prefill }) {
  const [tab, setTab] = useState(prefill?.url ? "url" : "prompt");
  const [prompt, setPrompt] = useState(prefill?.prompt || "");
  const [url, setUrl] = useState(prefill?.url || "");
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState(30);
  const [orientation, setOrientation] = useState("horizontal");
  const [framePack, setFramePack] = useState(prefill?.framePack || "auto");
  const [captions, setCaptions] = useState(false);
  // Multi-language captions. `captionLang` is the SUBTITLE language and
  // `voiceLang` is the VOICEOVER (spoken) language — chosen independently, so any
  // combination works (English audio + Hindi subs, Hindi audio + English subs,
  // both localized, etc.). "en" is the source. Codes mirror the server whitelist
  // in services/caption_lang.js.
  const [captionLang, setCaptionLang] = useState("en");
  const [voiceLang, setVoiceLang] = useState("en");
  // On-screen (video-text) language — the text baked INSIDE the video (headlines, CTAs,
  // stat labels). "auto" follows the voiceover language so the whole film reads in one
  // language by default; a code overrides it independently.
  const [videoTextLang, setVideoTextLang] = useState("auto");
  const [finish, setFinish] = useState("standard"); // standard = scene-kit · premium = LLM composer · cinema = Three.js 3D set
  const [brandChoice, setBrandChoice] = useState("template"); // "template" (no override) · a preset id · "custom"
  // Null until the user actually moves a color well, so the manual stops keep
  // FOLLOWING the selected pack's accents instead of freezing whichever pack
  // happened to be selected the first time the well rendered.
  const [customPrimary, setCustomPrimary] = useState(null);
  const [customSecondary, setCustomSecondary] = useState(null);
  // The user's own material — a logo (png/jpg/webp/svg) and up to 12 product
  // images (png/jpg/webp). These become the film's PRIMARY visuals: tier 100,
  // ahead of website captures, curated art, and stock.
  const [logoFile, setLogoFile] = useState(null);
  const [assetFiles, setAssetFiles] = useState([]);
  const [packs, setPacks] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(prefill?.error || null);
  const fileInput = useRef(null);
  const logoInput = useRef(null);
  const assetsInput = useRef(null);

  useEffect(() => {
    listFrames()
      .then((f) => setPacks(orderPacks(f.packs || [])))
      .catch(() => setPacks(orderPacks([])));
  }, []);

  useEffect(() => { if (prefill?.framePack) setFramePack(prefill.framePack); }, [prefill]);

  const packList = packs || orderPacks([]);
  const activeLore = framePack !== "auto" ? loreFor(framePack) : null;

  // /api/frames is the ONE source for what a pack's accents are: packlore.js is a
  // hand-copied presentation layer (it says itself it mirrors another file), so
  // seeding from it would let these swatches drift away from the colors the
  // renderer actually paints.
  const activePack = framePack !== "auto" ? packList.find((p) => p.name === framePack) : null;
  const packAccents = ((activePack && activePack.accents) || []).slice(0, 2);
  const brandPreset = BRAND_PRESETS.find((p) => p.id === brandChoice) || null;
  // The wells open on the STUDIO's accents, never on the selected pack's. A pre-filled
  // well is an answer the user can accept by simply not touching it, so it may only
  // ever hold something we can honestly attribute to them — and a pack's accents are
  // the pack's. (They are also not reliably accents: /api/frames falls back to the
  // manifest's raw colors for a pack that declares no skin, which hands back its
  // ground.) These two are plainly KEYFRAME's own, so no ground can arrive wearing
  // the user's name.
  const cp = customPrimary || "#e832a8";
  const cs = customSecondary || "#23c8e0";
  const brandPalette = brandPreset
    ? { primary: brandPreset.primary, secondary: brandPreset.secondary, source: "preset", presetId: brandPreset.id }
    : brandChoice === "custom"
      ? { primary: cp, secondary: cs, source: "manual", presetId: null }
      : null; // "template" — the pack keeps its own accents
  const brandLabel = brandPreset ? brandPreset.label.toUpperCase() : brandChoice === "custom" ? "CUSTOM" : "TEMPLATE";

  // Object URLs for the upload thumbnails — created once per file list, revoked on
  // change/unmount so a long editing session doesn't leak blobs.
  const assetThumbs = useMemo(() => assetFiles.map((f) => URL.createObjectURL(f)), [assetFiles]);
  const logoThumb = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile]);
  useEffect(() => () => { assetThumbs.forEach((u) => URL.revokeObjectURL(u)); }, [assetThumbs]);
  useEffect(() => () => { if (logoThumb) URL.revokeObjectURL(logoThumb); }, [logoThumb]);

  const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
  const MAX_ASSETS = 12, IMG_MAX_MB = 15;
  // Shared intake for the picker AND drag-drop: mime + size filtered client-side
  // (the server re-validates), capped at 12, silently deduped by name+size.
  function addAssetFiles(list) {
    const incoming = Array.from(list || []).filter((f) => IMAGE_TYPES.includes(f.type) && f.size <= IMG_MAX_MB * 1024 * 1024);
    if (!incoming.length) return;
    setAssetFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}|${f.size}`));
      return [...prev, ...incoming.filter((f) => !seen.has(`${f.name}|${f.size}`))].slice(0, MAX_ASSETS);
    });
  }
  function acceptLogo(f) {
    if (f && [...IMAGE_TYPES, "image/svg+xml"].includes(f.type) && f.size <= IMG_MAX_MB * 1024 * 1024) setLogoFile(f);
  }

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
        duration, orientation, quality: "720p", framePack,
        // Captions: send the multi-language config object when enabled (subtitle
        // language, INDEPENDENT voiceover language, SRT+VTT export), or `false`
        // when off. The API accepts both the object and the legacy boolean.
        captions: captions ? {
          enabled: true,
          language: captionLang,
          voiceoverLanguage: voiceLang,
          videoTextLanguage: videoTextLang, // "auto" = match voiceover; else a language code
          exportSRT: true,
          exportVTT: true,
        } : false,
        // null is the answer, not a missing one: it says the user looked at the
        // palette tile and kept the pack's accents. The API treats it the same as
        // absent, so the default stays a true no-op.
        brandPalette,
        composeMode: finish === "cinema" ? "standard" : finish,
        ...(finish === "cinema" ? { render3d: true } : {}),
        ...(prompt.trim().length >= 10 ? { prompt: prompt.trim() } : {}),
        ...(tab === "url" && url.trim() ? { websiteUrl: url.trim() } : {}),
        ...(tab === "video" && file ? { referenceVideo: file } : {}),
        // The user's own material rides its own multipart fields (logo ×1,
        // assets ×N) — api.js switches to FormData whenever a File is present.
        ...(logoFile ? { logo: logoFile } : {}),
        ...(assetFiles.length ? { assets: assetFiles } : {}),
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
                  <span>{captions
                    ? (captionLang === "en" && voiceLang === "en" ? "CC ON"
                      : voiceLang === captionLang ? `CC ${captionLang.toUpperCase()}`
                      : `🔊${voiceLang.toUpperCase()} CC ${captionLang.toUpperCase()}`)
                    : "♪ SCORED"}</span>
                  <span style={{ color: activeLore ? activeLore.accent : "#9a9284" }}>{activeLore ? activeLore.name.toUpperCase() : "AUTO LOOK"}</span>
                  {/* The brand rides a dot, not the label's own color: a dark pick
                      would make a colored label unreadable on this dark head, and a
                      swatch is what the color actually is anyway. */}
                  {brandPalette && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: brandPalette.primary }} />
                      BRAND {brandLabel}
                    </span>
                  )}
                  {(assetFiles.length > 0 || logoFile) && (
                    <span style={{ color: "var(--color-cy)" }}>
                      ▣ {assetFiles.length ? `IMG ×${assetFiles.length}` : ""}{assetFiles.length && logoFile ? " + " : ""}{logoFile ? "LOGO" : ""}
                    </span>
                  )}
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
              {/* A WASH over the pack's look, never a replacement for it — the same
                  shape the renderer's brand background gradient uses, and for the
                  same reason: the brand may tint the air, not repaint the ground.
                  The 8-digit hex carries the alpha so the stop fades to its OWN
                  color at zero rather than through a gray. */}
              {brandPalette && (
                <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: `radial-gradient(120% 90% at 50% 0%, ${brandPalette.primary}8c, ${brandPalette.primary}00 70%)` }} />
              )}
              <div className="film-scan" />
              <div style={{ position: "absolute", top: 12, left: 14, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.2em", color: "rgba(255,255,255,.85)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff4d3c", animation: "kf2-blink 1s steps(1) infinite" }} />PREVIEW
              </div>
              <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, textAlign: "center" }}>
                {/* The emphasis rule — the one element a brand palette really drives
                    in the cut, at the angle the composers paint it. The type above it
                    keeps the pack's own voice. */}
                {brandPalette && (
                  <span aria-hidden="true" style={{ display: "block", width: 64, height: 3, borderRadius: 999, margin: "0 auto 8px", background: `linear-gradient(100deg, ${brandPalette.primary}, ${brandPalette.secondary})` }} />
                )}
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
          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": "#ffb03a" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div className="label-mono" style={{ marginBottom: 4 }}>CAPTIONS &amp; LANGUAGE</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
                  {!captions ? "OFF — SUBTITLE FILES STILL EXPORTED" : (() => {
                    const lbl = (c) => ((CAPTION_LANGS.find((l) => l.code === c) || {}).label || c).toUpperCase();
                    if (captionLang === "en" && voiceLang === "en") return "BURNED IN — ENGLISH";
                    if (captionLang === voiceLang) return `${lbl(captionLang)} — VOICE + SUBS LOCALIZED`;
                    return `${lbl(voiceLang)} VOICE · ${lbl(captionLang)} SUBS`;
                  })()}
                </div>
              </div>
              <button
                type="button" role="switch" aria-checked={captions} aria-label="Toggle burned-in captions"
                onClick={() => setCaptions((v) => !v)}
                style={{ position: "relative", flexShrink: 0, width: 44, height: 24, borderRadius: 999, cursor: "pointer", transition: "background .3s, border-color .3s", background: captions ? "var(--color-am)" : "var(--color-paper-2)", border: `1px solid ${captions ? "var(--color-am)" : "rgba(23,19,14,.25)"}` }}
              >
                <span style={{ position: "absolute", top: 2, left: 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(23,19,14,.3)", transition: "transform .3s", transform: captions ? "translateX(20px)" : "translateX(0)" }} />
              </button>
            </div>
            {captions && (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <span className="label-mono">🔊 VOICEOVER LANGUAGE</span>
                  <select
                    value={voiceLang}
                    onChange={(e) => setVoiceLang(e.target.value)}
                    aria-label="Voiceover language"
                    style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.03em", padding: "9px 11px", borderRadius: 8, background: "var(--color-paper-2)", border: "1px solid rgba(23,19,14,.25)", color: "var(--color-ink)", cursor: "pointer" }}
                  >
                    {CAPTION_LANGS.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}{l.code === "en" ? " — source" : ""}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <span className="label-mono">CC CAPTION LANGUAGE</span>
                  <select
                    value={captionLang}
                    onChange={(e) => setCaptionLang(e.target.value)}
                    aria-label="Caption language"
                    style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.03em", padding: "9px 11px", borderRadius: 8, background: "var(--color-paper-2)", border: "1px solid rgba(23,19,14,.25)", color: "var(--color-ink)", cursor: "pointer" }}
                  >
                    {CAPTION_LANGS.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}{l.code === "en" ? " — source" : ""}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <span className="label-mono">🎬 VIDEO TEXT LANGUAGE</span>
                  <select
                    value={videoTextLang}
                    onChange={(e) => setVideoTextLang(e.target.value)}
                    aria-label="On-screen video text language"
                    style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.03em", padding: "9px 11px", borderRadius: 8, background: "var(--color-paper-2)", border: "1px solid rgba(23,19,14,.25)", color: "var(--color-ink)", cursor: "pointer" }}
                  >
                    <option value="auto">Auto Match Voiceover</option>
                    {CAPTION_LANGS.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}{l.code === "en" ? " — source" : ""}</option>
                    ))}
                  </select>
                </label>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, lineHeight: 1.5, letterSpacing: "0.06em", color: "var(--color-dim)" }}>
                  {voiceLang === captionLang && voiceLang !== "en" ? "FULL LOCALIZATION — VOICE & SUBTITLES BOTH LOCALIZED."
                    : voiceLang !== "en" && captionLang !== voiceLang ? "DUBBED — VOICE & SUBTITLES IN DIFFERENT LANGUAGES."
                    : captionLang !== "en" ? "TRANSLATED SUBTITLES — VOICE STAYS ENGLISH."
                    : "ENGLISH VOICE & SUBTITLES."}
                </div>
              </div>
            )}
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
          {/* Brand colors — ACCENTS ONLY. The pack owns identity (luminance, motion,
              type, layout, semantics); a brand palette only owns hue, and only where
              the eye is already meant to land. A site's own colors are still lifted
              automatically during ingest — this tile is for saying so up front, or
              for overriding what we find. */}
          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            {/* The spine wears the pick, so the tile demonstrates the one thing it
                does. It stays fixed on the default: a pack's accents are not ours to
                claim here, and the route's fallback can make them a white ground. */}
            <span className="spine" style={{ "--spine": brandPalette ? brandPalette.primary : "#c56bff" }} />
            <div className="label-mono" style={{ marginBottom: 10 }}>BRAND COLORS — {brandLabel}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <BrandSwatch
                label="Use my template's palette"
                hint={packAccents.length ? packAccents.join(" · ") : "the pack's own accents"}
                colors={packAccents}
                loading={framePack !== "auto" && !packs}
                glyph="✦"
                active={brandChoice === "template"}
                onSelect={() => setBrandChoice("template")}
              />
              {BRAND_PRESETS.map((p) => (
                <BrandSwatch key={p.id} label={p.label} hint={`${p.primary} · ${p.secondary}`}
                  colors={[p.primary, p.secondary]}
                  active={brandChoice === p.id}
                  onSelect={() => setBrandChoice(p.id)} />
              ))}
              <BrandSwatch label="Pick my own" hint={`${cp} · ${cs}`}
                colors={brandChoice === "custom" ? [cp, cs] : []}
                glyph="+"
                active={brandChoice === "custom"}
                onSelect={() => setBrandChoice("custom")} />
            </div>
            {brandChoice === "custom" && (
              <div style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap" }}>
                <HexStop label="PRIMARY" value={cp} onChange={setCustomPrimary} />
                <HexStop label="SECONDARY" value={cs} onChange={setCustomSecondary} />
              </div>
            )}
            <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
              {brandPalette ? "ACCENTS ONLY — GROUND, TYPE & MOTION STAY THE PACK'S"
                : framePack === "auto" ? "THE PACK WE CAST KEEPS ITS OWN ACCENTS"
                  : "THIS PACK KEEPS ITS OWN ACCENTS"}
            </div>
          </div>
          {/* Brand assets — the user's own logo + product images. These become the
              film's PRIMARY visuals (uploads > your site > curated > stock): product
              screenshots earn device-frame hero scenes, the logo appears at the open
              and the CTA. Stock only fills the gaps. */}
          <div className="card" style={{ padding: "20px 22px 20px 27px" }}>
            <span className="spine" style={{ "--spine": "#4ac9f2" }} />
            <div className="label-mono" style={{ marginBottom: 10 }}>
              BRAND ASSETS — {logoFile || assetFiles.length
                ? `${logoFile ? "LOGO" : ""}${logoFile && assetFiles.length ? " + " : ""}${assetFiles.length ? `${assetFiles.length} IMAGE${assetFiles.length > 1 ? "S" : ""}` : ""}`
                : "NONE"}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
              {/* The logo slot — square, its own field so it is never misclassified. */}
              <button type="button" onClick={() => (logoFile ? setLogoFile(null) : logoInput.current?.click())}
                title={logoFile ? `${logoFile.name} — click to remove` : "Upload your logo (png/jpg/webp/svg)"}
                aria-label={logoFile ? `Remove logo ${logoFile.name}` : "Upload your logo"}
                style={{
                  width: 54, height: 54, borderRadius: 10, cursor: "pointer", display: "grid", placeItems: "center",
                  background: logoFile ? "#fff" : "transparent", overflow: "hidden", position: "relative",
                  border: logoFile ? "1px solid rgba(23,19,14,.2)" : "1px dashed rgba(23,19,14,.3)",
                  fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.1em", color: "var(--color-dim)",
                }}>
                {logoThumb ? <img src={logoThumb} alt="" style={{ maxWidth: "84%", maxHeight: "84%", objectFit: "contain" }} /> : <span>◇ LOGO</span>}
              </button>
              {/* Uploaded image thumbnails, newest last; click to remove. */}
              {assetFiles.map((f, i) => (
                <button key={`${f.name}|${f.size}`} type="button"
                  onClick={() => setAssetFiles((prev) => prev.filter((_, k) => k !== i))}
                  title={`${f.name} — click to remove`} aria-label={`Remove image ${f.name}`}
                  style={{
                    width: 54, height: 54, borderRadius: 10, cursor: "pointer", overflow: "hidden", padding: 0,
                    border: "1px solid rgba(23,19,14,.2)", background: "var(--color-ground-2)",
                  }}>
                  <img src={assetThumbs[i]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
              {/* Add tile — click to pick, or drop files anywhere on it. */}
              {assetFiles.length < MAX_ASSETS && (
                <button type="button" onClick={() => assetsInput.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); addAssetFiles(e.dataTransfer.files); }}
                  title="Add product screenshots / photos (png/jpg/webp, up to 12)"
                  aria-label="Add product images"
                  style={{
                    width: 54, height: 54, borderRadius: 10, cursor: "pointer", display: "grid", placeItems: "center",
                    background: "transparent", border: "1px dashed rgba(23,19,14,.3)",
                    fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--color-dim)",
                  }}>+</button>
              )}
            </div>
            <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden
              onChange={(e) => { acceptLogo(e.target.files?.[0]); e.target.value = ""; }} />
            <input ref={assetsInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden
              onChange={(e) => { addAssetFiles(e.target.files); e.target.value = ""; }} />
            <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--color-dim)" }}>
              {logoFile || assetFiles.length
                ? "YOUR MATERIAL LEADS — SCREENSHOTS GET HERO SCENES · LOGO AT OPEN + CTA · STOCK ONLY FILLS GAPS"
                : "OPTIONAL — UPLOAD YOUR LOGO & PRODUCT SHOTS AND THE FILM IS BUILT AROUND THEM"}
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
          {packList.length} frame packs, each a complete design system — or leave it on auto and
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

// One palette option: the LIFTED PALETTE swatch language from the Understanding
// screen (36px, rounded, hex in the tooltip), carrying two stops — because two is
// what an emphasis pair is, here and in the cut. No colors is a DASHED slot, not
// an invented hue: an uncast pack has no accents to show yet, and neither do we.
//
// The ring is ink, not the magenta the pack cards use: a 36px swatch can BE
// magenta, and a selection ring that disappears on one of the options isn't one.
function BrandSwatch({ label, hint, colors = [], active, loading = false, glyph = null, onSelect }) {
  const [a, b = a] = colors;
  return (
    <button type="button" onClick={onSelect}
      title={`${label} — ${hint}`} aria-label={`${label} — ${hint}`} aria-pressed={active}
      style={{
        width: 36, height: 36, borderRadius: 10, cursor: "pointer", display: "grid", placeItems: "center",
        background: loading ? "var(--color-ground-2)" : a ? `linear-gradient(120deg, ${a}, ${b})` : "transparent",
        border: a || loading ? "1px solid rgba(23,19,14,.12)" : "1px dashed rgba(23,19,14,.25)",
        outline: active ? "2px solid var(--color-ink)" : "none", outlineOffset: 2,
        animation: loading ? "softPulse 1.6s ease-in-out infinite" : "none",
        fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-dim)",
      }}>
      {!a && !loading ? glyph : null}
    </button>
  );
}

// A hex stop: the native color well, with its value in mono beside it so the pick
// stays a color you can read back and match against a brand book — not just a
// well you clicked once.
// A brand accent stop: the native color well AND a typed hex box, kept in sync.
// The well always holds a committed #rrggbb; the text box lets people paste/type a
// hex directly (with or without "#", 3- or 6-digit) — it only commits once the
// input normalizes to a valid 6-digit hex, so a half-typed value never breaks the
// palette. An outside change (well, preset) refreshes the box via the effect; blur
// snaps a junk/partial entry back to the last good value.
function HexStop({ label, value, onChange }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);

  // Whether the current text box holds a hex we could commit (3- or 6-digit, "#"
  // optional). An empty box is not "invalid" — it's just nothing typed yet — so the
  // red outline only fires on a non-empty entry that isn't a valid hex.
  const norm = text.trim().replace(/^#/, "").toLowerCase();
  const hexOk = /^[0-9a-f]{6}$/.test(norm) || /^[0-9a-f]{3}$/.test(norm);
  const invalid = text.trim() !== "" && !hexOk;

  const commit = (raw) => {
    setText(raw);
    const h = raw.trim().replace(/^#/, "").toLowerCase();
    if (/^[0-9a-f]{6}$/.test(h)) onChange(`#${h}`);
    else if (/^[0-9a-f]{3}$/.test(h)) onChange(`#${h.split("").map((c) => c + c).join("")}`);
  };

  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} brand color picker`}
        style={{ width: 28, height: 28, padding: 0, borderRadius: 8, border: "1px solid rgba(23,19,14,.2)", background: "none", cursor: "pointer" }} />
      <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.14em", color: "var(--color-dim)" }}>{label}</span>
        <input type="text" value={text} onChange={(e) => commit(e.target.value)} onBlur={() => setText(value)}
          spellCheck={false} autoCapitalize="off" autoCorrect="off" maxLength={7}
          aria-label={`${label} brand color hex`} aria-invalid={invalid} placeholder="#RRGGBB"
          style={{ width: 74, boxSizing: "border-box", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.03em",
            padding: "3px 6px", borderRadius: 6,
            border: `1px solid ${invalid ? "var(--color-rec)" : "rgba(23,19,14,.2)"}`,
            outline: invalid ? "1px solid var(--color-rec)" : "none",
            background: "var(--color-paper-2)", color: "var(--color-ink)", textTransform: "uppercase" }} />
      </span>
    </label>
  );
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
