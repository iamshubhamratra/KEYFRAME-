import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createProject, listFrames } from "../api.js";
import Landing from "./Landing.jsx";

const TABS = [
  { key: "prompt", label: "Prompt" },
  { key: "video", label: "Video" },
  { key: "url", label: "URL" },
];

// Hand-tuned identity chips for known packs; unknown packs get neutral.
const PACK_STYLES = {
  blockframe: { bg: "#FFFDF5", chips: ["#FE90E8", "#C0F7FE", "#99E885", "#F7CB46"], label: "#000000", vibe: "neo-brutalist candy" },
  "biennale-yellow": { bg: "#E9E5DB", chips: ["#F1EE2E", "#1B2566", "#E26B4A"], label: "#1B2566", vibe: "parchment editorial" },
  "midnight-glass": { bg: "#0A0F2A", chips: ["#00F0FF", "#7A5CFF", "#C7D6F0"], label: "#EAF2FF", vibe: "dark glass keynote" },
};

export default function CreateScreen({ onCreated }) {
  const [tab, setTab] = useState("prompt");
  const [prompt, setPrompt] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState(30);
  const [orientation, setOrientation] = useState("horizontal");
  const [framePack, setFramePack] = useState("auto");
  const [packs, setPacks] = useState([]);
  const [autopilot, setAutopilot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    listFrames().then((f) => setPacks(f.packs || [])).catch(() => {});
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
        duration, orientation, quality: "720p", framePack, autopilot,
        ...(prompt.trim().length >= 10 ? { prompt: prompt.trim() } : {}),
        ...(tab === "url" && url.trim() ? { websiteUrl: url.trim() } : {}),
        ...(tab === "video" && file ? { referenceVideo: file } : {}),
      };
      const r = await createProject(fields);
      onCreated(r.projectId, autopilot);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="pt-16 pb-24">
      <div className="max-w-3xl mx-auto px-6">
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-display text-5xl font-bold leading-tight tracking-tight"
      >
        Anything in.
        <br />
        <span className="text-accent">A designed film out.</span>
      </motion.h1>
      <p className="mt-4 text-dim max-w-lg">
        Type an idea, drop a reference video, or paste a website. KEYFRAME writes
        the script — you edit it — then it designs, voices, and renders the video.
      </p>

      {/* Morphing input bar */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
        className="mt-10 glass-card overflow-hidden"
      >
        <div className="flex border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="relative px-6 py-3 text-xs uppercase tracking-widest"
            >
              {tab === t.key && (
                <motion.div layoutId="tab-pill" className="absolute inset-0 bg-line rounded-full m-1" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
              )}
              <span className={`relative ${tab === t.key ? "text-accent" : "text-dim"}`}>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="p-5">
          <AnimatePresence mode="wait">
            {tab === "prompt" && (
              <motion.textarea
                key="prompt"
                initial={{ opacity: 0, height: 90 }}
                animate={{ opacity: 1, height: 140 }}
                exit={{ opacity: 0, height: 90 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A 30-second launch video for…"
                className="inset-field w-full resize-none text-lg placeholder:text-dim/50 px-4 py-3"
              />
            )}
            {tab === "url" && (
              <motion.div key="url" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-product.com"
                  className="inset-field w-full text-lg placeholder:text-dim/50 px-4 py-3"
                />
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Optional: anything specific you want the video to say?"
                  className="inset-field mt-3 w-full h-16 resize-none text-sm placeholder:text-dim/40 px-4 py-2.5"
                />
              </motion.div>
            )}
            {tab === "video" && (
              <motion.div
                key="video"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
                className="border-2 border-dashed border-line rounded-xl py-10 text-center cursor-pointer hover:border-accent/40 transition-colors"
              >
                <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,video/webm" hidden
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
                {file
                  ? <p className="text-accent">{file.name} <span className="text-dim">({Math.round(file.size / 1048576)} MB)</span></p>
                  : <p className="text-dim">Drop a reference video<br /><span className="text-xs">mp4 / mov / webm · up to 200 MB · we transcribe and study its style</span></p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Options row — staggered entrance */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-4" style={{ animation: "fadeUp .6s cubic-bezier(.16,1,.3,1) .16s both" }}>
          <div className="text-[10px] uppercase tracking-widest text-dim mb-2">Duration — {duration}s</div>
          <input type="range" min="10" max="60" step="5" value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full accent-[#ff6b57]" />
        </div>
        <div className="glass-card p-4" style={{ animation: "fadeUp .6s cubic-bezier(.16,1,.3,1) .24s both" }}>
          <div className="text-[10px] uppercase tracking-widest text-dim mb-2">Orientation</div>
          <div className="flex gap-2">
            {["horizontal", "vertical", "square"].map((o) => (
              <button key={o} onClick={() => setOrientation(o)}
                className={`flex items-center justify-center rounded-md border transition-all duration-300 ${orientation === o ? "border-accent shadow-[0_0_0_3px_rgba(255,107,87,.18)]" : "border-line hover:border-dim"}`}
                style={{ width: o === "vertical" ? 22 : o === "square" ? 30 : 42, height: o === "vertical" ? 36 : o === "square" ? 30 : 26 }}
                title={o}
              />
            ))}
          </div>
        </div>
        <div className="glass-card p-4" style={{ animation: "fadeUp .6s cubic-bezier(.16,1,.3,1) .32s both" }}>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={autopilot} onChange={(e) => setAutopilot(e.target.checked)} className="accent-[#ff6b57]" />
            <div>
              <div className="text-sm">Autopilot</div>
              <div className="text-[10px] text-dim">skip the script review</div>
            </div>
          </label>
        </div>
      </div>

      {/* Frame pack picker */}
      <div className="mt-6" style={{ animation: "fadeUp .6s cubic-bezier(.16,1,.3,1) .4s both" }}>
        <div className="text-[10px] uppercase tracking-widest text-dim mb-3">Design system</div>
        <div className="flex gap-3 flex-wrap">
          <PackCard active={framePack === "auto"} onClick={() => setFramePack("auto")} name="auto" vibe="let the brief decide" />
          {packs.map((p) => (
            <PackCard key={p.name} active={framePack === p.name} onClick={() => setFramePack(p.name)} name={p.name}
              vibe={PACK_STYLES[p.name]?.vibe} style={PACK_STYLES[p.name]} />
          ))}
        </div>
      </div>

      {error && <p className="mt-5 text-sm text-red-500">{error}</p>}

      <motion.button
        whileTap={{ scale: 0.97 }}
        disabled={!canSubmit}
        onClick={submit}
        className="btn-solstice mt-8 w-full justify-center uppercase text-sm"
        style={{ animation: "fadeUp .6s cubic-bezier(.16,1,.3,1) .48s both" }}
      >
        {busy ? "Starting…" : autopilot ? "Generate video" : "Write my script"}
      </motion.button>

      <p className="mt-16 text-center text-[11px] uppercase tracking-[0.3em] text-dim/70"
        style={{ animation: "softPulse 3.5s ease-in-out infinite" }}>
        ↓ scroll through a day at the studio ↓
      </p>
      </div>

      {/* The long landing — the sky follows the scroll from here to midnight. */}
      <Landing onStart={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
    </div>
  );
}

function PackCard({ active, onClick, name, vibe, style }) {
  return (
    <motion.button
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-left transition-shadow duration-300 min-w-40 ${active ? "border-accent shadow-[0_8px_24px_rgba(255,107,87,.25)]" : "border-line hover:border-dim"}`}
      style={style ? { background: style.bg } : { background: "var(--color-panel)", backdropFilter: "blur(10px)" }}
    >
      <div className="text-xs font-bold uppercase tracking-wider font-display" style={style ? { color: style.label } : {}}>
        {name}
      </div>
      {vibe && <div className="text-[10px] mt-0.5" style={style ? { color: style.label, opacity: 0.65 } : { color: "var(--color-dim)" }}>{vibe}</div>}
      {style && (
        <div className="flex gap-1 mt-2">
          {style.chips.map((c) => <span key={c} className="w-3 h-3 rounded-full border border-black/20" style={{ background: c }} />)}
        </div>
      )}
    </motion.button>
  );
}
