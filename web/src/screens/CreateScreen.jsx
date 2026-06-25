import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createProject, listFrames } from "../api.js";

const TABS = [
  { key: "prompt", label: "Prompt" },
  { key: "url", label: "URL" },
  { key: "video", label: "Video" },
];

const PACK_STYLES = {
  blockframe: { bg: "#FFFDF5", chips: ["#FE90E8", "#C0F7FE", "#99E885", "#F7CB46"], label: "#000000", vibe: "neo-brutalist candy" },
  "biennale-yellow": { bg: "#E9E5DB", chips: ["#F1EE2E", "#1B2566", "#E26B4A"], label: "#1B2566", vibe: "parchment editorial" },
  "midnight-glass": { bg: "#0A0F2A", chips: ["#00F0FF", "#7A5CFF", "#C7D6F0"], label: "#EAF2FF", vibe: "dark glass keynote" },
};

const EXAMPLE_PROMPTS = [
  "Launch a productivity app",
  "Promote a coffee brand",
  "Recap our Series A",
  "Explainer for a fintech",
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
  const [framePack, setFramePack] = useState("auto");
  const [captions, setCaptions] = useState(false);
  const [packs, setPacks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(prefill?.error || null);
  const [isTouch, setIsTouch] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    listFrames().then((f) => setPacks(f.packs || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: none)");
    const update = () => setIsTouch(mq.matches);
    update();
    mq.addEventListener ? mq.addEventListener("change", update) : mq.addListener(update);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", update) : mq.removeListener(update); };
  }, []);

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

  return (
    <div className="pb-28">
      {/* ---------- Create console: "Feed it anything. Get a film back." ---------- */}
      <section id="create" className="max-w-3xl mx-auto px-6 pt-16">
        <div className="text-center">
          <div className="eyebrow">Start here</div>
          <h2 className="mt-3 font-display font-extrabold tracking-tight leading-[0.95] text-[clamp(40px,7vw,72px)]" style={{ color: "var(--color-ink)" }}>
            Feed it anything.<br />Get a film back.
          </h2>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="card mt-8 p-3.5"
        >
          {/* segmented tabs */}
          <div className="seg w-full" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`seg-tab flex-1 ${tab === t.key ? "is-active" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-3">
            <AnimatePresence mode="wait">
              {tab === "prompt" && (
                <motion.textarea
                  key="prompt"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A 30-second launch film for our B2B beauty marketplace…"
                  className="inset-field w-full resize-none text-lg px-4 py-3.5"
                  style={{ height: 132 }}
                />
              )}
              {tab === "url" && (
                <motion.div key="url" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://your-product.com"
                    className="inset-field w-full text-lg px-4 py-3.5"
                  />
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Optional — anything specific you want the film to say?"
                    className="inset-field mt-3 w-full h-16 resize-none text-sm px-4 py-2.5"
                  />
                </motion.div>
              )}
              {tab === "video" && (
                <motion.div
                  key="video"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
                  className="rounded-2xl py-10 text-center cursor-pointer transition-colors"
                  style={{ border: "2px dashed var(--color-line-strong)" }}
                >
                  <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,video/webm" hidden
                    onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  {file
                    ? <p style={{ color: "var(--color-accent-text)" }}>{file.name} <span className="text-dim">({Math.round(file.size / 1048576)} MB)</span></p>
                    : <p className="text-dim">Drop a reference film<br /><span className="text-xs">mp4 / mov / webm · up to 200 MB · we transcribe and study its style</span></p>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {tab === "prompt" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button key={ex} type="button" onClick={() => setPrompt(ex)} className="chip">{ex}</button>
              ))}
              <button type="button" onClick={() => setPrompt(SURPRISE_PROMPT)} className="chip">✦ Surprise me</button>
            </div>
          )}

          {/* meta row: live settings + Produce */}
          <div className="mt-3.5 flex items-center justify-between gap-3 px-1">
            <div className="label-mono flex items-center gap-3">
              <span>◷ {duration}s</span>
              <span>▭ {ASPECT[orientation]}</span>
              <span>♪ Score</span>
            </div>
            <button onClick={submit} disabled={!canSubmit} className="btn-dark">
              {busy ? "Starting…" : "Produce →"}
            </button>
          </div>
        </motion.div>

        {error && <p className="mt-4 text-sm" style={{ color: "var(--color-coral)" }}>{error}</p>}

        {/* options strip */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card-flat p-4">
            <div className="label-mono mb-2">Duration — {duration}s</div>
            <input type="range" min="10" max="60" step="5" value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full" style={{ accentColor: "var(--color-green)" }} />
          </div>
          <div className="card-flat p-4">
            <div className="label-mono mb-2">Orientation</div>
            <div className="flex gap-2">
              {["horizontal", "vertical", "square"].map((o) => (
                <button key={o} onClick={() => setOrientation(o)}
                  className="rounded-md border transition-all duration-300"
                  style={{
                    width: o === "vertical" ? 22 : o === "square" ? 30 : 42,
                    height: o === "vertical" ? 36 : o === "square" ? 30 : 26,
                    borderColor: orientation === o ? "var(--color-green)" : "var(--color-line-strong)",
                    boxShadow: orientation === o ? "0 0 0 3px rgba(111,174,18,0.18)" : "none",
                  }}
                  title={o} aria-label={`${o} orientation`} aria-pressed={orientation === o} />
              ))}
            </div>
          </div>
          <div className="card-flat p-4 flex items-center justify-between gap-3">
            <div>
              <div className="label-mono mb-1">Captions</div>
              <div className="text-[11px] text-dim">{captions ? "on — small, bottom" : "off — .srt exported"}</div>
            </div>
            <button
              type="button" role="switch" aria-checked={captions} aria-label="Toggle burned-in captions"
              onClick={() => setCaptions((v) => !v)}
              className="relative shrink-0 w-11 h-6 rounded-full border transition-colors duration-300"
              style={{ background: captions ? "var(--color-lime)" : "var(--color-paper-2)", borderColor: captions ? "var(--color-green)" : "var(--color-line-strong)" }}
            >
              <span className="absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform duration-300"
                style={{ width: 18, height: 18, transform: captions ? "translateX(20px)" : "translateX(0)" }} />
            </button>
          </div>
        </div>
      </section>

      {/* ---------- Template gallery ---------- */}
      <section id="templates" className="max-w-5xl mx-auto px-6 mt-20">
        <div className="text-center">
          <div className="eyebrow">Art direction, not "AI style"</div>
          <h2 className="mt-3 font-display font-extrabold tracking-tight text-[clamp(34px,5vw,54px)]" style={{ color: "var(--color-ink)" }}>
            Pick a look. Or let it choose.
          </h2>
        </div>
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <TemplateCard auto active={framePack === "auto"} onClick={() => setFramePack("auto")} isTouch={isTouch} />
          {packs.map((p) => (
            <TemplateCard
              key={p.name}
              active={framePack === p.name}
              onClick={() => setFramePack(framePack === p.name ? "auto" : p.name)}
              pack={p}
              fallback={PACK_STYLES[p.name]}
              isTouch={isTouch}
            />
          ))}
        </div>

        <div className="mt-12 text-center">
          <button onClick={submit} disabled={!canSubmit} className="btn-lime mx-auto px-8 py-4 text-base">
            {busy ? "Starting…" : "Roll your first film ↑"}
          </button>
        </div>
      </section>
    </div>
  );
}

function TemplateCard({ auto, active, onClick, pack, fallback, isTouch }) {
  const vidRef = useRef(null);
  const cardRef = useRef(null);
  const label = auto ? "Auto" : (pack.label || pack.name);
  const vibe = auto ? "Let KEYFRAME pick the look" : (pack.vibe || fallback?.vibe || "");
  const chips = auto
    ? ["#6fae12", "#e2563c", "#3d8bd9", "#f1ee2e"]
    : (pack.colors?.length ? pack.colors : (fallback?.chips || []));

  const onEnter = () => { const v = vidRef.current; if (v) v.play().catch(() => {}); };
  const onLeave = () => { const v = vidRef.current; if (v) { v.pause(); v.currentTime = 0; } };

  useEffect(() => {
    if (!isTouch || auto || typeof IntersectionObserver === "undefined") return;
    const card = cardRef.current;
    if (!card) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const v = vidRef.current;
        if (!v) return;
        if (entry.isIntersecting) v.play().catch(() => {});
        else { v.pause(); v.currentTime = 0; }
      },
      { threshold: 0.6 }
    );
    io.observe(card);
    return () => io.disconnect();
  }, [isTouch, auto]);

  return (
    <motion.button
      ref={cardRef}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      onClick={onClick}
      onMouseEnter={isTouch ? undefined : onEnter}
      onMouseLeave={isTouch ? undefined : onLeave}
      aria-pressed={active}
      className="group relative rounded-2xl overflow-hidden text-left transition-shadow duration-300"
      style={{
        border: active ? "1px solid var(--color-green)" : "1px solid var(--color-line)",
        boxShadow: active ? "0 10px 30px rgba(111,174,18,0.25)" : "8px 8px 20px rgba(20,22,12,0.08), -6px -6px 16px rgba(255,255,255,0.8)",
        background: "var(--color-paper)",
      }}
    >
      <div className="relative aspect-video overflow-hidden" style={{ background: "#0c0f07" }}>
        {!auto && pack.previewUrl ? (
          <video
            ref={vidRef}
            src={pack.previewUrl}
            poster={pack.posterUrl || undefined}
            muted loop playsInline preload="metadata"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: auto ? "conic-gradient(from 0deg,#6fae12,#f1ee2e,#e2563c,#3d8bd9,#6fae12)" : (fallback?.bg || "#15151f") }}>
            <span className="font-display uppercase text-[11px] tracking-widest" style={{ color: auto ? "#16200a" : (fallback?.label || "#fff"), opacity: 0.95 }}>
              {auto ? "✦ Auto" : label}
            </span>
          </div>
        )}
        {active && (
          <div aria-hidden="true" className="absolute top-2 right-2 w-5 h-5 rounded-full text-[11px] flex items-center justify-center"
            style={{ background: "var(--color-lime)", color: "var(--color-ink-2)" }}>✓</div>
        )}
      </div>
      <div className="p-3">
        <div className="text-xs font-bold uppercase tracking-wider font-display truncate" style={{ color: "var(--color-ink)" }}>{label}</div>
        {vibe && <div className="text-[10px] mt-0.5 text-dim truncate">{vibe}</div>}
        {chips.length > 0 && (
          <div className="flex gap-1 mt-2">
            {chips.slice(0, 5).map((c, i) => <span key={i} className="w-3 h-3 rounded-full" style={{ background: c, border: "1px solid rgba(20,22,12,0.15)" }} />)}
          </div>
        )}
      </div>
    </motion.button>
  );
}
