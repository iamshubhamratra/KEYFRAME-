import { motion } from "framer-motion";

/* The long-scroll landing sections below the create form. The SolsticeSky
   is scroll-driven on this view, so the content is written to the light it
   passes through: how-it-works in the morning, design systems at noon,
   features in the afternoon, the pipeline at golden hour, and the final
   CTA at midnight — where the page itself flips to night mode. */

const reveal = {
  initial: { opacity: 0, y: 36 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-90px" },
  transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
};

function Eyebrow({ color, children }) {
  return <span className="chip uppercase" style={{ "--chip": color }}>{children}</span>;
}

function SectionTitle({ children }) {
  return <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mt-4 leading-[1.05]">{children}</h2>;
}

const STEPS = [
  {
    n: "01", title: "Feed it anything", color: "var(--color-sun)",
    body: "Type an idea, paste a website URL, or drop a reference video. One input is enough — KEYFRAME fills in the rest. Give it a URL and it opens a real browser, reads your copy, lifts your brand colors, and takes real screenshots of your pages.",
  },
  {
    n: "02", title: "Watch it understand", color: "var(--color-sky)",
    body: "Before anything is generated you see exactly what the AI understood: the facts it pulled from your site (never invented), the audience it inferred, your brand palette as swatches, and the design system it chose for the film.",
  },
  {
    n: "03", title: "Direct the script", color: "var(--color-violet)",
    body: "The pipeline pauses and hands you the script — every word of voiceover, every on-screen line, every scene's timing. Edit a line and that exact line is spoken. Drag scenes around, pull duration handles, delete what you don't like. You're the director; the AI is the crew.",
  },
  {
    n: "04", title: "Premiere at midnight", color: "var(--color-pink)",
    body: "Three to six minutes later: a designed, voiced, captioned, music-mixed MP4 with an .srt beside it. Download it, remix the script, or send the link.",
  },
];

const PACKS = [
  {
    name: "Blockframe", bg: "#FFFDF5", ink: "#000000", chips: ["#FE90E8", "#C0F7FE", "#99E885", "#F7CB46"],
    vibe: "Neo-brutalist candy. Four-pixel black borders, hard offset shadows, loud uppercase type on cycling pastel grounds. For launches that want to be impossible to ignore.",
  },
  {
    name: "Biennale Yellow", bg: "#E9E5DB", ink: "#1B2566", chips: ["#F1EE2E", "#1B2566", "#E26B4A"],
    vibe: "Literary editorial. Warm parchment, indigo ink, solar-yellow blooms, serif display. For brands that read like an art-biennale catalogue.",
  },
  {
    name: "Midnight Glass", bg: "#0A0F2A", ink: "#EAF2FF", chips: ["#00F0FF", "#7A5CFF", "#C7D6F0"],
    vibe: "Dark glass keynote. Deep navy space, frosted panels, one electric cyan accent. For products that ship at 1 a.m. and look expensive doing it.",
  },
];

const FEATURES = [
  { color: "var(--color-sun)", title: "Your real product on screen", body: "Paste a URL and your actual pages appear in the film — real screenshots presented in styled browser frames with slow pans and callouts. No stock-photo stand-ins for your own product." },
  { color: "var(--color-mint)", title: "A voice that fits every scene", body: "Narration is synthesized per scene and measured. Lines that run long are tightened automatically so the voice never talks over the next cut." },
  { color: "var(--color-sky)", title: "Captions, baked and exported", body: "Word-paced captions rendered into the film in your design system's type, plus a clean .srt file for every platform that wants its own." },
  { color: "var(--color-violet)", title: "A library that learns", body: "Every licensed image the studio fetches is kept in your own asset library. The more you make, the more your films pull instantly from assets you already own — sources and licenses tracked for attribution." },
  { color: "var(--color-pink)", title: "Sound design included", body: "A music bed ducked under the voice, whooshes on transitions, soft risers into the CTA — pulled from the script's own sound cues." },
  { color: "var(--color-accent)", title: "Costs cents, not contracts", body: "A 30-second film runs about the price of a coffee refill. Every project shows its exact LLM cost, token counts, and render time in the premiere panel." },
];

const PIPELINE = [
  ["Ingest", "URL scrape, video transcription, prompt — fused into one intent"],
  ["Brief", "audience, tone, key messages — grounded in your sources"],
  ["Script", "the editable checkpoint. Your words, your cut"],
  ["Storyboard", "scene beats choreographed to the tenth of a second"],
  ["Assets", "your library first, then licensed providers"],
  ["Compose", "every frame styled by your chosen design system"],
  ["Voice & mix", "per-scene narration, music, sound effects"],
  ["Render", "deterministic, frame-perfect MP4 + captions"],
];

export default function Landing({ onStart }) {
  return (
    <div className="mt-28">
      {/* ——— morning: how it works ——— */}
      <section className="max-w-3xl mx-auto px-6">
        <motion.div {...reveal}>
          <Eyebrow color="var(--color-sun)">How it works</Eyebrow>
          <SectionTitle>A whole studio,<br />between sunrise and midnight.</SectionTitle>
          <p className="mt-4 text-dim max-w-xl leading-relaxed">
            KEYFRAME runs the entire production pipeline — research, script, design,
            voice, edit — and stops exactly once: to let you direct.
          </p>
        </motion.div>

        <div className="mt-12 space-y-6">
          {STEPS.map((s, i) => (
            <motion.div key={s.n} {...reveal} transition={{ ...reveal.transition, delay: i * 0.06 }}
              className="glass-card p-7 flex gap-6 items-start">
              <div className="font-display font-bold text-3xl" style={{ color: s.color }}>{s.n}</div>
              <div>
                <h3 className="font-display font-bold text-xl">{s.title}</h3>
                <p className="mt-2 text-dim leading-relaxed text-[15px]">{s.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ——— noon: design systems ——— */}
      <section className="max-w-4xl mx-auto px-6 mt-36">
        <motion.div {...reveal}>
          <Eyebrow color="var(--color-sky)">Design systems</Eyebrow>
          <SectionTitle>Art direction, not “AI style”.</SectionTitle>
          <p className="mt-4 text-dim max-w-xl leading-relaxed">
            Every film is rendered inside a curated frame pack — a real design system with
            sacred colors, type, and composition laws. Pick one, or let the brief decide.
          </p>
        </motion.div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5">
          {PACKS.map((p, i) => (
            <motion.div key={p.name} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }}
              whileHover={{ y: -6 }}
              className="rounded-[22px] p-6 border border-line shadow-[0_12px_30px_rgba(90,80,60,0.12)]"
              style={{ background: p.bg }}>
              <div className="font-display font-bold uppercase tracking-wider" style={{ color: p.ink }}>{p.name}</div>
              <div className="flex gap-1.5 mt-3">
                {p.chips.map((c) => <span key={c} className="w-4 h-4 rounded-full border border-black/20" style={{ background: c }} />)}
              </div>
              <p className="mt-4 text-[13px] leading-relaxed" style={{ color: p.ink, opacity: 0.75 }}>{p.vibe}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ——— afternoon: features ——— */}
      <section className="max-w-4xl mx-auto px-6 mt-36">
        <motion.div {...reveal}>
          <Eyebrow color="var(--color-mint)">What's in every film</Eyebrow>
          <SectionTitle>The details nobody else automates.</SectionTitle>
        </motion.div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} {...reveal} transition={{ ...reveal.transition, delay: (i % 2) * 0.08 }}
              className="glass-card p-6">
              <span className="block w-8 h-1.5 rounded-full mb-4" style={{ background: f.color }} />
              <h3 className="font-display font-bold text-lg">{f.title}</h3>
              <p className="mt-2 text-dim text-[14px] leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ——— golden hour: the pipeline ——— */}
      <section className="max-w-3xl mx-auto px-6 mt-36">
        <motion.div {...reveal}>
          <Eyebrow color="var(--color-violet)">Under the hood</Eyebrow>
          <SectionTitle>Thirteen stages.<br />One pause — for you.</SectionTitle>
        </motion.div>

        <div className="mt-12 relative">
          <span className="absolute left-[11px] top-2 bottom-2 w-px bg-line" aria-hidden="true" />
          <div className="space-y-7">
            {PIPELINE.map(([name, desc], i) => (
              <motion.div key={name} {...reveal} transition={{ ...reveal.transition, delay: i * 0.04 }}
                className="flex gap-5 items-baseline">
                <span className={`relative z-10 w-[23px] h-[23px] rounded-full border-2 shrink-0 ${i === 2 ? "border-accent bg-accent/20" : "border-line bg-panel backdrop-blur"}`} />
                <div>
                  <span className="font-display font-bold">{name}</span>
                  {i === 2 && <span className="chip uppercase ml-3" style={{ "--chip": "var(--color-accent)" }}>you are here</span>}
                  <p className="text-dim text-[14px] mt-0.5">{desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ——— midnight: CTA (the page is dark by now — the tokens flipped) ——— */}
      <section className="max-w-3xl mx-auto px-6 mt-44 mb-28 text-center">
        <motion.div {...reveal}>
          <Eyebrow color="var(--color-pink)">The premiere</Eyebrow>
          <h2 className="font-display text-5xl sm:text-6xl font-bold tracking-tight mt-6 leading-[1.02]">
            It's always midnight<br />at the premiere.
          </h2>
          <p className="mt-6 text-dim max-w-md mx-auto leading-relaxed">
            You scrolled through a whole day at the studio. Your film takes about
            four minutes of it.
          </p>
          <motion.button whileTap={{ scale: 0.97 }} onClick={onStart}
            className="btn-solstice uppercase text-sm mt-10">
            Start your film ↑
          </motion.button>
        </motion.div>

        <motion.footer {...reveal} className="mt-28 pt-8 border-t border-line text-[11px] uppercase tracking-widest text-dim flex items-center justify-between">
          <span>KEY<span className="text-accent">FRAME</span> — multi-modal AI video studio</span>
          <span>prompt · URL · video → film</span>
        </motion.footer>
      </section>
    </div>
  );
}
