// Pack "lore" — the exact presentation of the frame packs from the
// "New animated website UI design" export (Templates + Gallery pages),
// keyed by the REAL server pack names so /api/frames data merges cleanly.
// Every color, gradient, demo line and vibe string is lifted verbatim.

export const PACK_LORE = {
  blockframe: {
    name: "Blockframe", tag: "NEO-BRUTAL", bg: "#FFFDF5", ink: "#0a0a0a", accent: "#FE90E8",
    chips: ["#FE90E8", "#C0F7FE", "#99E885"],
    grad: "repeating-linear-gradient(45deg,#FFFDF5 0 26px,#fff4d6 26px 52px)",
    font: "'Bricolage Grotesque'", tracking: "-.02em", demo: "LOUD & PROUD",
    vibe: "Four-pixel black borders, hard offset shadows, loud uppercase type on cycling pastels.",
    filmGrad: "linear-gradient(135deg,#FE90E8,#C0F7FE,#99E885,#F7CB46)",
  },
  "biennale-yellow": {
    name: "Biennale Yellow", tag: "EDITORIAL", bg: "#E9E5DB", ink: "#1B2566", accent: "#F1EE2E",
    chips: ["#F1EE2E", "#1B2566", "#E26B4A"],
    grad: "radial-gradient(circle at 75% 30%, #F1EE2E 0 60px, transparent 61px)",
    font: "'Bricolage Grotesque'", tracking: "-.01em", demo: "A Catalogue Look",
    vibe: "Warm parchment, indigo ink, solar-yellow blooms, serif display. Reads like an art biennale.",
    filmGrad: "linear-gradient(135deg,#F1EE2E,#E26B4A,#1B2566)",
  },
  "midnight-glass": {
    name: "Midnight Glass", tag: "DARK GLASS", bg: "#0A0F2A", ink: "#EAF2FF", accent: "#00F0FF",
    chips: ["#00F0FF", "#7A5CFF", "#C7D6F0"],
    grad: "radial-gradient(circle at 30% 80%, rgba(0,240,255,.4), transparent 55%), radial-gradient(circle at 80% 20%, rgba(122,92,255,.4), transparent 55%)",
    font: "'Bricolage Grotesque'", tracking: "-.02em", demo: "Ships at 1 a.m.",
    vibe: "Deep navy space, frosted panels, one electric cyan accent. Looks expensive doing it.",
    filmGrad: "linear-gradient(135deg,#00F0FF,#7A5CFF,#0A0F2A)",
  },
  "noir-spotlight": {
    name: "Noir Spotlight", tag: "CINEMATIC", bg: "#0c0c0d", ink: "#f5f5f0", accent: "#e8b94a",
    chips: ["#e8b94a", "#f5f5f0", "#7a7a7a"],
    grad: "radial-gradient(circle at 50% 30%, rgba(232,185,74,.35), transparent 50%)",
    font: "'Bricolage Grotesque'", tracking: ".02em", demo: "A POOL OF LIGHT",
    vibe: "High-contrast black, a single warm spotlight, type that steps out of the dark.",
    filmGrad: "linear-gradient(135deg,#e8b94a,#7a7a7a,#0c0c0d)",
  },
  "vapor-chrome": {
    name: "Vapor Chrome", tag: "VAPORWAVE", bg: "#0d0a14", ink: "#f0e9ff", accent: "#ff5ed0",
    chips: ["#ff5ed0", "#5ee0ff", "#b18bff"],
    grad: "linear-gradient(135deg, rgba(255,94,208,.5), rgba(94,224,255,.5))",
    font: "'Bricolage Grotesque'", tracking: ".04em", demo: "C H R O M E",
    vibe: "Liquid-chrome type, sunset gradients, grid horizons. Retro-future and unapologetic.",
    filmGrad: "linear-gradient(135deg,#ff5ed0,#b18bff,#5ee0ff)",
  },
  "aurora-spectrum": {
    name: "Aurora Spectrum", tag: "GRADIENT", bg: "#06121a", ink: "#eafff7", accent: "#3cf0c0",
    chips: ["#3cf0c0", "#5ea0ff", "#b06cff"],
    grad: "linear-gradient(120deg, rgba(60,240,192,.45), rgba(94,160,255,.4), rgba(176,108,255,.45))",
    font: "'Bricolage Grotesque'", tracking: "-.02em", demo: "Northern Light",
    vibe: "Soft aurora gradients drifting over deep teal night. Calm, premium, weightless.",
    filmGrad: "linear-gradient(135deg,#3cf0c0,#5ea0ff,#b06cff)",
  },
  "bauhaus-print": {
    name: "Bauhaus Print", tag: "POSTER", bg: "#f4efe6", ink: "#1a1a1a", accent: "#e2362f",
    chips: ["#e2362f", "#1f4ed8", "#f2c037"],
    grad: "conic-gradient(from 90deg at 70% 40%, #e2362f 0 90deg, transparent 0 180deg, #1f4ed8 0 270deg, transparent 0)",
    font: "'Bricolage Grotesque'", tracking: "-.01em", demo: "FORM·FUNCTION",
    vibe: "Primary blocks, hard geometry, confident grid. A silkscreen poster come to life.",
    filmGrad: "linear-gradient(135deg,#e2362f,#f2c037,#1f4ed8)",
  },
  "kinetic-bold": {
    name: "Kinetic Bold", tag: "TYPE-DRIVEN", bg: "#fafafa", ink: "#0a0a0a", accent: "#ff4d2e",
    chips: ["#ff4d2e", "#0a0a0a", "#1a6dff"],
    grad: "none",
    font: "'Bricolage Grotesque'", tracking: "-.04em", demo: "MOTION FIRST",
    vibe: "Type is the hero — words fly, stack and snap. Built for hooks that move.",
    filmGrad: "linear-gradient(135deg,#ff4d2e,#1a6dff,#0a0a0a)",
  },
  "mono-corporate": {
    name: "Mono Corporate", tag: "CLEAN", bg: "#f6f7f8", ink: "#15181d", accent: "#2563eb",
    chips: ["#2563eb", "#15181d", "#64748b"],
    grad: "linear-gradient(180deg, transparent 60%, rgba(37,99,235,.08))",
    font: "'Hanken Grotesk'", tracking: "0", demo: "Quietly Precise",
    vibe: "Calm grid, one trustworthy blue, generous whitespace. For B2B that means business.",
    filmGrad: "linear-gradient(135deg,#2563eb,#64748b,#15181d)",
  },
  "bloom-illustrated": {
    name: "Bloom Illustrated", tag: "ILLUSTRATED", bg: "#fff5f7", ink: "#3a2a3f", accent: "#ff7aa8",
    chips: ["#ff7aa8", "#ffd166", "#8ad9b0"],
    grad: "radial-gradient(circle at 25% 75%, #ffd166 0 40px, transparent 41px), radial-gradient(circle at 80% 30%, #8ad9b0 0 50px, transparent 51px)",
    font: "'Bricolage Grotesque'", tracking: "-.01em", demo: "Soft & Warm",
    vibe: "Hand-warm illustration, blush palette, organic shapes. Friendly and human.",
    filmGrad: "linear-gradient(135deg,#ff7aa8,#ffd166,#8ad9b0)",
  },
  "longshot-cinema": {
    name: "Longshot Cinema", tag: "ONE-TAKE · FILM", bg: "#101318", ink: "#F2F5F9", accent: "#FFB454",
    chips: ["#FFB454", "#4D9FFF", "#F2F5F9"],
    grad: "radial-gradient(120% 90% at 30% 0%, #1a2029, #0A0C10 65%)",
    font: "'Bricolage Grotesque'", tracking: "-.03em", demo: "One Take.",
    vibe: "A single camera travels through every scene — letterbox, live timecode, pop-up figures, light sweeps. The anti-slideshow.",
    filmGrad: "linear-gradient(135deg,#FFB454,#4D9FFF 55%,#0A0C10)",
  },
  "paper-tales": {
    name: "Paper Tales", tag: "STORYBOOK", bg: "#FBF1E1", ink: "#6B5B73", accent: "#E8938C",
    chips: ["#E8938C", "#F7C873", "#9CCFE8"],
    grad: "radial-gradient(circle at 22% 26%, rgba(232,147,140,.28), transparent 45%), radial-gradient(circle at 78% 70%, rgba(156,207,232,.3), transparent 48%), radial-gradient(circle at 60% 20%, rgba(247,200,115,.26), transparent 40%)",
    font: "'Bricolage Grotesque'", tracking: "-.01em", demo: "Once upon a time…",
    vibe: "A pop-up storybook come alive — pages turn, paper friends fold up from the crease, and a pen handwrites your story in bedtime pastels.",
    filmGrad: "linear-gradient(135deg,#E8938C,#F7C873 50%,#9CCFE8)",
  },
  "terminal-departures": {
    name: "Terminal Departures", tag: "SPLIT-FLAP", bg: "#121317", ink: "#F2EEE3", accent: "#FFC61A",
    chips: ["#FFC61A", "#35D07F", "#FF4B3E"],
    grad: "repeating-linear-gradient(90deg, rgba(242,238,227,.05) 0 34px, transparent 34px 40px), linear-gradient(180deg, rgba(255,198,26,.12), transparent 55%)",
    font: "'Bricolage Grotesque'", tracking: ".04em", demo: "NOW BOARDING",
    vibe: "An airport departures hall — split-flap boards clack every headline into place, gate signs swing from the ceiling, and your film is the FINAL CALL.",
    filmGrad: "linear-gradient(135deg,#FFC61A,#35D07F 55%,#0B0C0F)",
  },
  "neon-premiere": {
    name: "Neon Premiere", tag: "PREMIERE · NEON", bg: "#05060E", ink: "#F2F5FF", accent: "#FF4FD8",
    chips: ["#6EE7FF", "#FF4FD8", "#8B7CF6"],
    grad: "radial-gradient(circle at 26% 80%, rgba(110,231,255,.42), transparent 55%), radial-gradient(circle at 80% 22%, rgba(255,79,216,.40), transparent 55%), linear-gradient(180deg, transparent 58%, rgba(139,124,246,.24))",
    font: "'Bricolage Grotesque'", tracking: "-.03em", demo: "Premiere Tonight",
    vibe: "Indigo cinema night, a neon grid horizon and a film-set HUD — cyan→magenta gradient headlines that glow. A red-carpet premiere for your product.",
    filmGrad: "linear-gradient(135deg,#6EE7FF,#8B7CF6 55%,#FF4FD8)",
  },
  "summit-keynote": {
    name: "Summit Keynote", tag: "PITCH · 3D", bg: "#F7F8FC", ink: "#10214B", accent: "#2B5BFF",
    chips: ["#2B5BFF", "#10214B", "#D4A94E"],
    grad: "radial-gradient(circle at 78% 22%, rgba(43,91,255,.14), transparent 55%), radial-gradient(circle at 18% 80%, rgba(212,169,78,.12), transparent 50%)",
    font: "'Bricolage Grotesque'", tracking: "-.02em", demo: "The Round Closes",
    vibe: "Porcelain keynote stage, navy ink, one cobalt beam + champagne gold, a 3D data constellation drifting behind the numbers. Built for pitches.",
    filmGrad: "linear-gradient(135deg,#F7F8FC,#2B5BFF 60%,#10214B)",
  },
  "prism-launch": {
    name: "Prism Launch", tag: "LAUNCH · 3D", bg: "#FAFAFC", ink: "#0E0F14", accent: "#FF5A3C",
    chips: ["#8B7CF6", "#5AD7E6", "#FFA3C0"],
    grad: "linear-gradient(120deg, rgba(139,124,246,.16), rgba(90,215,230,.14) 50%, rgba(255,163,192,.16))",
    font: "'Bricolage Grotesque'", tracking: "-.03em", demo: "Reveal Day",
    vibe: "Gallery-white studio, carbon type, iridescent prism shards rotating in 3D, one ember-hot CTA. Built for product launches.",
    filmGrad: "linear-gradient(135deg,#8B7CF6,#5AD7E6,#FFA3C0)",
  },
  "fable-storybook": {
    name: "Fable Storybook", tag: "STORY · 3D", bg: "#FAF5EA", ink: "#33261A", accent: "#D8734B",
    chips: ["#D8734B", "#7FA37C", "#7A93B8"],
    grad: "radial-gradient(circle at 22% 30%, rgba(216,115,75,.16), transparent 45%), radial-gradient(circle at 80% 70%, rgba(127,163,124,.14), transparent 48%)",
    font: "'Bricolage Grotesque'", tracking: "-.01em", demo: "Once Upon…",
    vibe: "Parchment pages, watercolor washes, paper planes and firefly orbs gliding in gentle 3D. Built for storytelling.",
    filmGrad: "linear-gradient(135deg,#D8734B,#E8B84B,#7A93B8)",
  },
  "liquid-glass": {
    name: "Liquid Glass", tag: "PREMIUM · GLASS", bg: "#F2F5FA", ink: "#0D1220", accent: "#4D7CFE",
    chips: ["#4D7CFE", "#9F6CF8", "#FF8AC2"],
    grad: "radial-gradient(circle at 26% 28%, rgba(77,124,254,.16), transparent 50%), radial-gradient(circle at 76% 72%, rgba(159,108,248,.15), transparent 52%), linear-gradient(180deg, rgba(255,255,255,.5), rgba(255,255,255,0) 60%)",
    font: "'Bricolage Grotesque'", tracking: "-.02em", demo: "Pour light in",
    vibe: "Apple-grade liquid glass — frosted panels with hairline specular edges, iridescent refraction over pearl studio light. For flagship reveals and keynotes.",
    filmGrad: "linear-gradient(135deg,#4D7CFE,#9F6CF8,#FF8AC2)",
  },

  // ---- Phase-5 gap-category packs (dev/CLI, healthcare, data, fintech, SaaS).
  // Colors/fonts mirror server/scripts/pack-catalog.js; card `font` uses a
  // web-loaded family (Bricolage / Hanken / IBM Plex Mono) so demo type renders.
  "terminal-green": {
    name: "Terminal Green", tag: "CRT · CLI", bg: "#06110A", ink: "#C8F7D4", accent: "#3DF07E",
    chips: ["#3DF07E", "#F0B23D", "#12331F"],
    grad: "repeating-linear-gradient(0deg, rgba(61,240,126,.09) 0 2px, transparent 2px 4px), radial-gradient(circle at 50% 125%, rgba(61,240,126,.28), transparent 60%)",
    font: "'IBM Plex Mono'", tracking: "0", demo: "> run build",
    vibe: "Phosphor-green CRT for the command line — monospace glowing on deep green-black, scanlines, one amber alert. For dev tools, CLIs and AI agents.",
    filmGrad: "linear-gradient(135deg,#3DF07E,#F0B23D,#06110A)",
  },
  "terminal-amber": {
    name: "Terminal Amber", tag: "AMBER CRT", bg: "#0C0A06", ink: "#F2E4C4", accent: "#FFB000",
    chips: ["#FFB000", "#6BD4FF", "#33270F"],
    grad: "repeating-linear-gradient(0deg, rgba(255,176,0,.08) 0 2px, transparent 2px 4px), radial-gradient(circle at 50% 130%, rgba(255,176,0,.30), transparent 60%)",
    font: "'IBM Plex Mono'", tracking: "0", demo: "$ deploy --prod",
    vibe: "Warm amber phosphor on deep graphite — a monochrome monitor with a cyan cursor. Retro-future for hacker-grade launches.",
    filmGrad: "linear-gradient(135deg,#FFB000,#6BD4FF,#0C0A06)",
  },
  "signal-mono": {
    name: "Signal Mono", tag: "DASHBOARD", bg: "#0B0E14", ink: "#E6ECF5", accent: "#39D0FF",
    chips: ["#39D0FF", "#FFC24D", "#1B2130"],
    grad: "linear-gradient(rgba(57,208,255,.11) 1px, transparent 1px) 0 0/34px 34px, linear-gradient(90deg, rgba(57,208,255,.11) 1px, transparent 1px) 0 0/34px 34px",
    font: "'IBM Plex Mono'", tracking: ".03em", demo: "+128% MoM",
    vibe: "An analyst's dark canvas — a faint data grid and ONE cyan signal reserved for the numbers. For dashboards, analytics and ML.",
    filmGrad: "linear-gradient(135deg,#39D0FF,#FFC24D,#0B0E14)",
  },
  "flux-analytics": {
    name: "Flux Analytics", tag: "ANALYTICS", bg: "#0C0A14", ink: "#ECE8F5", accent: "#B76CFF",
    chips: ["#B76CFF", "#3DF0C0", "#221A33"],
    grad: "linear-gradient(rgba(183,108,255,.11) 1px, transparent 1px) 0 0/34px 34px, linear-gradient(90deg, rgba(183,108,255,.11) 1px, transparent 1px) 0 0/34px 34px",
    font: "'Bricolage Grotesque'", tracking: "-.01em", demo: "Signal, not noise",
    vibe: "A violet-signal data system — monochrome ground, mono legends and one saturated series. For analytics and data products.",
    filmGrad: "linear-gradient(135deg,#B76CFF,#3DF0C0,#0C0A14)",
  },
  "vault-gold": {
    name: "Vault Gold", tag: "PREMIUM · FINANCE", bg: "#08090C", ink: "#EAEDF2", accent: "#D9B24C",
    chips: ["#D9B24C", "#4BD07E", "#5A6B8C"],
    grad: "radial-gradient(circle at 50% 18%, rgba(217,178,76,.22), transparent 55%), linear-gradient(180deg, transparent 60%, rgba(75,208,126,.07))",
    font: "'Bricolage Grotesque'", tracking: "-.02em", demo: "Precision Compounds",
    vibe: "Deep-black premium finance — precise numerics, a metallic-gold rule and a single signal green. For finance, trading and investor stories.",
    filmGrad: "linear-gradient(135deg,#D9B24C,#4BD07E,#08090C)",
  },
  "ledger-noir": {
    name: "Ledger Noir", tag: "INSTITUTIONAL", bg: "#0A0C10", ink: "#E9EEF5", accent: "#8FB4FF",
    chips: ["#8FB4FF", "#C9CFDA", "#4FD1C5"],
    grad: "radial-gradient(circle at 72% 28%, rgba(143,180,255,.17), transparent 55%), linear-gradient(180deg, transparent 62%, rgba(201,207,218,.05))",
    font: "'IBM Plex Mono'", tracking: ".03em", demo: "Q3 · SETTLED",
    vibe: "Near-black institutional fintech — platinum and a cool blue over a precise mono ledger. For banking, treasury and B2B finance.",
    filmGrad: "linear-gradient(135deg,#8FB4FF,#C9CFDA,#0A0C10)",
  },
  "care-mint": {
    name: "Care Mint", tag: "CARE · CALM", bg: "#F3FAF7", ink: "#163B33", accent: "#2FB39A",
    chips: ["#2FB39A", "#FF9E7A", "#6FC5D8"],
    grad: "radial-gradient(circle at 25% 75%, rgba(47,179,154,.20), transparent 55%), radial-gradient(circle at 80% 25%, rgba(255,158,122,.16), transparent 50%)",
    font: "'Bricolage Grotesque'", tracking: "-.01em", demo: "In good hands",
    vibe: "Soft mint grounds, rounded cards, a reassuring warm coral accent. Calm and humane — for healthcare, wellness and patient products.",
    filmGrad: "linear-gradient(135deg,#2FB39A,#FF9E7A,#6FC5D8)",
  },
  "care-lavender": {
    name: "Care Lavender", tag: "CLINICAL CALM", bg: "#F6F5FC", ink: "#2B2A44", accent: "#7C6CF0",
    chips: ["#7C6CF0", "#4FC0C7", "#F3A6C4"],
    grad: "radial-gradient(circle at 30% 30%, rgba(124,108,240,.18), transparent 55%), radial-gradient(circle at 78% 78%, rgba(79,192,199,.16), transparent 52%)",
    font: "'Bricolage Grotesque'", tracking: "-.01em", demo: "Care, unhurried",
    vibe: "Gentle lavender and aqua on soft cloud — a patient-first, unhurried system with an elegant serif voice. For clinical and wellness stories.",
    filmGrad: "linear-gradient(135deg,#7C6CF0,#4FC0C7,#F3A6C4)",
  },
  "nimbus-saas": {
    name: "Nimbus SaaS", tag: "SAAS · BRIGHT", bg: "#FAFAFD", ink: "#171525", accent: "#6366F1",
    chips: ["#6366F1", "#EC4899", "#38BDF8"],
    grad: "linear-gradient(120deg, rgba(99,102,241,.16), rgba(56,189,248,.14) 50%, rgba(236,72,153,.16))",
    font: "'Bricolage Grotesque'", tracking: "-.02em", demo: "Ship it Friday",
    vibe: "Bright modern SaaS — near-white ground, a soft indigo→pink brand gradient and friendly type. For product tours and launches.",
    filmGrad: "linear-gradient(135deg,#6366F1,#38BDF8,#EC4899)",
  },
  "mint-launch": {
    name: "Mint Launch", tag: "LAUNCH · FRESH", bg: "#F7FCFA", ink: "#0F2A24", accent: "#10B981",
    chips: ["#10B981", "#38BDF8", "#A3E635"],
    grad: "linear-gradient(120deg, rgba(16,185,129,.16), rgba(56,189,248,.14) 55%, rgba(163,230,53,.16))",
    font: "'Bricolage Grotesque'", tracking: "-.02em", demo: "Now Live",
    vibe: "A fresh product-launch system — white studio ground, an emerald→sky gradient and rounded type. For launches and announcements.",
    filmGrad: "linear-gradient(135deg,#10B981,#38BDF8,#A3E635)",
  },
  "brut-pop": {
    name: "Brut Pop", tag: "STICKER-POP", bg: "#FFFDF5", ink: "#111111", accent: "#2B4FF5",
    chips: ["#2B4FF5", "#FF4FA3", "#FFE14D"],
    grad: "repeating-linear-gradient(0deg, rgba(17,17,17,.05) 0 1px, transparent 1px 34px), repeating-linear-gradient(90deg, rgba(17,17,17,.05) 0 1px, transparent 1px 34px)",
    font: "'Archivo Black'", tracking: "-.01em", demo: "STICKER DROP",
    vibe: "Bright paper, thick black outlines, loud flat blue/pink/yellow. Every word gets a sticker, a wobble and a hard offset shadow.",
    filmGrad: "linear-gradient(135deg,#2B4FF5,#FF4FA3,#FFE14D)",
  },
  sketchnote: {
    name: "Sketchnote", tag: "HAND-DRAWN", bg: "#FBF6E8", ink: "#26241F", accent: "#E0452F",
    chips: ["#E0452F", "#FFD84D", "#2F5FE0"],
    grad: "linear-gradient(90deg, transparent 46px, rgba(224,69,47,.5) 46px 48px, transparent 48px), repeating-linear-gradient(0deg, transparent 0 33px, rgba(47,95,224,.14) 33px 34px)",
    font: "'Instrument Serif'", tracking: "0", demo: "Meet Nova",
    vibe: "Cream ruled notebook paper with a red margin, ink doodles that draw themselves — a yellow highlighter swipe and red wavy pen underline. Personal and hand-made.",
    filmGrad: "linear-gradient(135deg,#E0452F,#FFD84D,#2F5FE0)",
  },

  // ---- Poster / editorial batch (broadside · creative-mode · coral · cartesian ·
  // bold-poster · cobalt-grid · capsule), imported from the HyperFrames FRAME.md packs.
  broadside: {
    name: "Broadside", tag: "PROTEST POSTER", bg: "#111111", ink: "#F0ECE5", accent: "#E85D26",
    chips: ["#E85D26", "#F0ECE5", "#282826"],
    grad: "repeating-linear-gradient(0deg, transparent 0 47px, rgba(40,40,38,.8) 47px 48px)",
    font: "'Barlow'", tracking: "-.03em", demo: "say it loud",
    vibe: "Massive lowercase Barlow on a flat ink-black plane, with fire-orange as the only color and 1px hairlines carrying all the structure.",
    filmGrad: "linear-gradient(135deg,#E85D26,#111111,#F0ECE5)",
  },
  "creative-mode": {
    name: "Creative Mode", tag: "NEO-BRUTAL", bg: "#EFE9D9", ink: "#0F0F0F", accent: "#F06CA8",
    chips: ["#F06CA8", "#E85A1F", "#1F8A4C"],
    grad: "repeating-linear-gradient(45deg,#EFE9D9 0 26px,#E4DCC4 26px 52px)",
    font: "'Archivo Black'", tracking: "-.01em", demo: "MADE LOUD",
    vibe: "Warm cream paper and near-black ink with four full-saturation accents color-blocked flat, one hard offset shadow, zero glow.",
    filmGrad: "linear-gradient(135deg,#F06CA8,#E85A1F,#1F8A4C)",
  },
  coral: {
    name: "Coral", tag: "POSTER", bg: "#F5F0E8", ink: "#1A1A1A", accent: "#E85D5D",
    chips: ["#E85D5D", "#1A1A1A", "#F5F0E8"],
    grad: "linear-gradient(180deg,#E85D5D 0 38%,#F5F0E8 38% 100%), repeating-linear-gradient(45deg, transparent 0 20px, rgba(0,0,0,.06) 20px 40px)",
    font: "'Bebas Neue'", tracking: ".04em", demo: "FIRE & INK",
    vibe: "Three solid surfaces — coral fire, ink black, warm cream — slammed together at hard edges with condensed caps and a 45° hatch.",
    filmGrad: "linear-gradient(135deg,#E85D5D,#F5F0E8,#1A1A1A)",
  },
  cartesian: {
    name: "Cartesian", tag: "EDITORIAL", bg: "#EDE8E0", ink: "#1A1A1A", accent: "#8A8178",
    chips: ["#8A8178", "#B8B0A4", "#1A1A1A"],
    grad: "repeating-linear-gradient(0deg, transparent 0 46px, rgba(184,176,164,.18) 46px 47px), repeating-linear-gradient(90deg, transparent 0 46px, rgba(184,176,164,.18) 46px 47px)",
    font: "'Playfair Display'", tracking: "-.01em", demo: "Well framed.",
    vibe: "Warm-stone museum-catalog editorial: 1px taupe hairlines, ink Playfair, and compass-drafted rings breathing behind negative space.",
    filmGrad: "linear-gradient(135deg,#EDE8E0,#8A8178,#1A1A1A)",
  },
  "bold-poster": {
    name: "Bold Poster", tag: "POSTER", bg: "#FFFFFF", ink: "#1C1410", accent: "#D8000F",
    chips: ["#D8000F", "#1C1410", "#F5F2EF"],
    grad: "none",
    font: "'Shrikhand'", tracking: "-.02em", demo: "LOUD & PRINTED",
    vibe: "Heavy tilted Shrikhand display in one tomato red, classical serif body, ink-ruled double-border grids on a white sheet.",
    filmGrad: "linear-gradient(135deg,#D8000F,#1C1410,#F5F2EF)",
  },
  "cobalt-grid": {
    name: "Cobalt Grid", tag: "RISOGRAPH", bg: "#F0EBDE", ink: "#1F2BE0", accent: "#1F2BE0",
    chips: ["#1F2BE0", "#5560E5", "#E6E0CE"],
    grad: "repeating-linear-gradient(0deg, transparent 0 22px, rgba(31,43,224,.1) 22px 23px), repeating-linear-gradient(90deg, transparent 0 22px, rgba(31,43,224,.1) 22px 23px)",
    font: "'Newsreader'", tracking: "-.01em", demo: "SIGNAL 01",
    vibe: "Warm cream paper and electric cobalt ink on a permanent graph-paper grid, with pixel-glitch columns and QR patches.",
    filmGrad: "linear-gradient(135deg,#1F2BE0,#5560E5,#F0EBDE)",
  },
  capsule: {
    name: "Capsule", tag: "PLAYFUL", bg: "#F5F5F0", ink: "#1A1A1A", accent: "#E85D4E",
    chips: ["#E85D4E", "#F2D160", "#8BB4F7"],
    grad: "radial-gradient(circle at 20% 30%, rgba(232,93,78,.12), transparent 42%), radial-gradient(circle at 80% 70%, rgba(139,180,247,.12), transparent 42%), radial-gradient(circle at 55% 50%, rgba(196,217,78,.10), transparent 45%)",
    font: "'Bodoni Moda'", tracking: "-.02em", demo: "Sweet & clear",
    vibe: "Inflated candy pills and cards outlined in ink, floating on sun-bleached cream with soft glows and grain.",
    filmGrad: "linear-gradient(135deg,#E85D4E,#C4D94E,#C5B5E0)",
  },
  atelier: {
    name: "Atelier", tag: "LUXE LINE-ART", bg: "#F7F3EC", ink: "#241E1A", accent: "#A98643",
    chips: ["#A98643", "#C4674E", "#8A9A7B"],
    grad: "radial-gradient(circle at 70% 25%, rgba(169,134,67,.16), transparent 45%), radial-gradient(circle at 25% 75%, rgba(196,103,78,.10), transparent 42%)",
    font: "'Fraunces'", tracking: "0", demo: "Maison, refined",
    vibe: "Warm ivory paper, espresso serif and one muted gold line that draws itself — a fashion-house editorial with acres of quiet negative space.",
    filmGrad: "linear-gradient(135deg,#A98643,#C4674E 55%,#F7F3EC)",
  },
  "riso-press": {
    name: "Riso Press", tag: "RISOGRAPH", bg: "#F3ECDD", ink: "#1A1714", accent: "#FF3E6C",
    chips: ["#FF3E6C", "#3A5BFF", "#FFC21A"],
    grad: "radial-gradient(circle at 30% 30%, rgba(255,62,108,.22), transparent 45%), radial-gradient(circle at 72% 68%, rgba(58,91,255,.20), transparent 48%)",
    font: "'Anton'", tracking: "0", demo: "HOT OFF THE PRESS",
    vibe: "Fluorescent pink and electric blue inks overprinting on warm newsprint — halftone dots, registration marks, giant condensed poster type set hard-left.",
    filmGrad: "linear-gradient(135deg,#FF3E6C,#FFC21A 50%,#3A5BFF)",
  },
  "lumen-motion": {
    name: "Lumen Motion", tag: "EXPLAINER", bg: "#FFF7EF", ink: "#241A33", accent: "#FF5A6E",
    chips: ["#FF5A6E", "#6C5CE7", "#12B7A6"],
    grad: "radial-gradient(circle at 24% 28%, rgba(255,90,110,.18), transparent 42%), radial-gradient(circle at 76% 66%, rgba(108,92,231,.16), transparent 45%), radial-gradient(circle at 58% 18%, rgba(255,176,32,.14), transparent 38%)",
    font: "'Bricolage Grotesque'", tracking: "-.01em", demo: "Watch it click",
    vibe: "A bright animated explainer — hand-drawn rockets, graphs that plot themselves, turning gears and confetti pops on warm paper. Onboarding that grins.",
    filmGrad: "linear-gradient(135deg,#FF5A6E,#FFB020 45%,#12B7A6)",
  },
  "nova-launch": {
    name: "Nova Launch", tag: "LAUNCH · HUD", bg: "#070A12", ink: "#EAF0FF", accent: "#3D7BFF",
    chips: ["#3D7BFF", "#FF7A3C", "#1FE0B8"],
    grad: "radial-gradient(circle at 28% 75%, rgba(61,123,255,.38), transparent 55%), radial-gradient(circle at 78% 22%, rgba(255,122,60,.30), transparent 50%), radial-gradient(circle at 55% 45%, rgba(166,92,255,.18), transparent 55%)",
    font: "'Space Grotesk'", tracking: "-.02em", demo: "T-minus zero",
    vibe: "A dark-stage reveal — electric-blue and solar-orange beams, a live telemetry HUD, a floating data constellation and strobe-cut glowing type.",
    filmGrad: "linear-gradient(135deg,#3D7BFF,#A65CFF 50%,#FF7A3C)",
  },
};

export const PACK_ORDER = [
  "paper-tales", "terminal-departures", "neon-premiere",
  "liquid-glass", "brut-pop", "sketchnote", "riso-press", "atelier",
  // Poster / editorial batch
  "bold-poster", "creative-mode", "coral", "broadside", "capsule", "cartesian", "cobalt-grid",
  "longshot-cinema", "summit-keynote", "prism-launch", "nova-launch", "lumen-motion", "fable-storybook",
  "blockframe", "biennale-yellow", "midnight-glass", "noir-spotlight", "vapor-chrome",
  "aurora-spectrum", "bauhaus-print", "kinetic-bold", "mono-corporate", "bloom-illustrated",
  // Phase-5 gap categories, grouped: dev/CLI · data · fintech · healthcare · SaaS.
  "terminal-green", "terminal-amber", "signal-mono", "flux-analytics",
  "vault-gold", "ledger-noir", "care-mint", "care-lavender", "nimbus-saas", "mint-launch",
];

const FALLBACK_LORE = {
  name: null, tag: "PACK", bg: "#15170f", ink: "#f2f4ec", accent: "#b9f24a",
  chips: ["#b9f24a", "#6fae12", "#2a4a2c"], grad: "none",
  font: "'Bricolage Grotesque'", tracking: "-.02em", demo: "Your Look",
  vibe: "A complete design system — colors, type and motion are sacred; composition is free.",
  filmGrad: "linear-gradient(135deg,#b9f24a,#3cf0c0)",
};

// Lore for a server pack name; tolerant of key drift (prefix match), always returns something.
export function loreFor(packName) {
  if (!packName) return FALLBACK_LORE;
  if (PACK_LORE[packName]) return PACK_LORE[packName];
  const hit = Object.keys(PACK_LORE).find(
    (k) => k.startsWith(packName) || packName.startsWith(k.split("-")[0])
  );
  return hit ? PACK_LORE[hit] : { ...FALLBACK_LORE, name: packName };
}

// Gallery filter pills — the design's list, remapped to server pack names.
export const GALLERY_FILTERS = [
  ["all", "ALL FILMS"], ["neon-premiere", "PREMIERE"], ["longshot-cinema", "LONGSHOT"], ["summit-keynote", "SUMMIT"], ["prism-launch", "PRISM"],
  ["fable-storybook", "FABLE"], ["blockframe", "BLOCKFRAME"], ["biennale-yellow", "BIENNALE"],
  ["midnight-glass", "MIDNIGHT"], ["vapor-chrome", "VAPOR"], ["aurora-spectrum", "AURORA"],
  ["bloom-illustrated", "BLOOM"], ["noir-spotlight", "NOIR"],
];

// The v2 design's video wall ("Fresh off the render farm.") — seed films
// shown while no real films exist yet, with the exact wall gradients.
export const WALL_SEEDS = [
  { title: "Voltage — Synth Drop", cat: "MUSIC", dur: "0:18", views: "34k", drift: "7s", grad: "linear-gradient(135deg,#e832a8,#5a1043,#17130e)", pack: "noir-spotlight" },
  { title: "Nimbus — Series A", cat: "SAAS", dur: "0:32", views: "12.4k", drift: "9s", grad: "linear-gradient(135deg,#23c8e0,#124f5c,#0a1f24)", pack: "midnight-glass" },
  { title: "Toby — A Dog Film", cat: "PET STAR", dur: "0:30", views: "89k", drift: "8s", grad: "linear-gradient(135deg,#ffb03a,#a5560e,#2e1a05)", pack: "kinetic-bold" },
  { title: "Lumen — The Ritual", cat: "BEAUTY", dur: "0:24", views: "8.1k", drift: "10s", grad: "linear-gradient(135deg,#ff7aa8,#8a2d54,#25101c)", pack: "bloom-illustrated" },
  { title: "Atlas — Future of Work", cat: "B2B", dur: "0:45", views: "21k", drift: "8.5s", grad: "linear-gradient(135deg,#2b5bff,#14286e,#090d1f)", pack: "mono-corporate" },
  { title: "Faro — In Motion", cat: "RETAIL", dur: "0:22", views: "5.6k", drift: "7.5s", grad: "linear-gradient(135deg,#b9f24a,#4f7a10,#141d06)", pack: "bauhaus-print" },
];

export const fmtDur = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
