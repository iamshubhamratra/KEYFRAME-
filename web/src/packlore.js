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
};

export const PACK_ORDER = [
  "longshot-cinema", "summit-keynote", "prism-launch", "fable-storybook",
  "blockframe", "biennale-yellow", "midnight-glass", "noir-spotlight", "vapor-chrome",
  "aurora-spectrum", "bauhaus-print", "kinetic-bold", "mono-corporate", "bloom-illustrated",
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
  ["all", "ALL FILMS"], ["longshot-cinema", "LONGSHOT"], ["summit-keynote", "SUMMIT"], ["prism-launch", "PRISM"],
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
