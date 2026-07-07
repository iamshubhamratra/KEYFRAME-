// PACK CATALOG (Phase 5) — concrete variants for new-pack.js. Each entry is a
// family + a palette + fonts + subject; new-pack.js crosses it with the family
// DNA to emit a complete pack.json + FRAME.md. These fill the category gaps the
// original 14 packs lacked: dev/CLI, healthcare, data/analytics, fintech, SaaS.
//
// Palette rule: `ground` is the base, `ink` the high-contrast text, `accents`
// = [primary device, secondary]. `display` MUST be a bundled webfont
// (server/src/fonts/pack_fonts.js) or a safe family, else it won't render.

const GRAD = (a, b, c) =>
  `background:linear-gradient(100deg,${a},${b}${c ? ` 50%,${c}` : ""});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:${a};`;

module.exports = [
  // ---- retro-terminal (dev tools / CLIs / AI agents) ----
  {
    name: "terminal-green", family: "retro-terminal", label: "Terminal Green",
    overview: "A phosphor-green CRT for the command line — the look of a shell you trust.",
    colors: { void: "#06110A", panel: "#0B1C12", grid: "#12331F", ink: "#C8F7D4", phosphor: "#3DF07E", amber: "#F0B23D" },
    ground: "#06110A", ink: "#C8F7D4", accents: ["#3DF07E", "#F0B23D"], extras: ["#12331F", "#8FE8AC"],
    display: "JetBrains Mono", body: "Inter", label: "JetBrains Mono",
  },
  {
    name: "terminal-amber", family: "retro-terminal", label: "Terminal Amber",
    overview: "An amber monochrome monitor — warm phosphor glow on deep graphite.",
    colors: { void: "#0C0A06", panel: "#1A150C", grid: "#33270F", ink: "#F2E4C4", amber: "#FFB000", cyan: "#6BD4FF" },
    ground: "#0C0A06", ink: "#F2E4C4", accents: ["#FFB000", "#6BD4FF"], extras: ["#33270F", "#FFD37A"],
    display: "JetBrains Mono", body: "Inter", label: "JetBrains Mono",
  },
  // ---- healthcare-soft ----
  {
    name: "care-mint", family: "healthcare-soft", label: "Care Mint",
    overview: "Calm, humane care — soft mint grounds, rounded cards, a reassuring warm accent.",
    colors: { cloud: "#F3FAF7", linen: "#E6F3EE", ink: "#163B33", teal: "#2FB39A", coral: "#FF9E7A", sky: "#6FC5D8" },
    ground: "#F3FAF7", ink: "#163B33", accents: ["#2FB39A", "#FF9E7A"], extras: ["#6FC5D8", "#BFE7DA"],
    display: "Bricolage Grotesque", body: "Inter", label: "Inter",
  },
  {
    name: "care-lavender", family: "healthcare-soft", label: "Care Lavender",
    overview: "A gentle clinical-calm system in soft lavender and aqua — patient-first and unhurried.",
    colors: { cloud: "#F6F5FC", linen: "#ECEAF7", ink: "#2B2A44", lavender: "#7C6CF0", aqua: "#4FC0C7", blush: "#F3A6C4" },
    ground: "#F6F5FC", ink: "#2B2A44", accents: ["#7C6CF0", "#4FC0C7"], extras: ["#F3A6C4", "#CFC9F3"],
    display: "Bricolage Grotesque", body: "Inter", label: "Inter",
  },
  // ---- data-viz-mono (dashboards / analytics / ML) ----
  {
    name: "signal-mono", family: "data-viz-mono", label: "Signal Mono",
    overview: "An analyst's dark canvas — a faint data grid and ONE cyan signal reserved for the numbers.",
    colors: { base: "#0B0E14", panel: "#12161F", grid: "#1B2130", ink: "#E6ECF5", cyan: "#39D0FF", amber: "#FFC24D" },
    ground: "#0B0E14", ink: "#E6ECF5", accents: ["#39D0FF", "#FFC24D"], extras: ["#1B2130", "#7FE3FF"],
    display: "IBM Plex Mono", body: "Inter", label: "IBM Plex Mono",
  },
  {
    name: "flux-analytics", family: "data-viz-mono", label: "Flux Analytics",
    overview: "A violet-signal data system — monochrome ground, mono legends, one saturated series.",
    colors: { base: "#0C0A14", panel: "#151122", grid: "#221A33", ink: "#ECE8F5", violet: "#B76CFF", mint: "#3DF0C0" },
    ground: "#0C0A14", ink: "#ECE8F5", accents: ["#B76CFF", "#3DF0C0"], extras: ["#221A33", "#D3AEFF"],
    display: "Space Grotesk", body: "Inter", label: "IBM Plex Mono",
  },
  // ---- fintech-dark (finance / trading / crypto / investor) ----
  {
    name: "vault-gold", family: "fintech-dark", label: "Vault Gold",
    overview: "Deep-black premium finance — precise numerics, a metallic-gold rule and a single signal green.",
    colors: { void: "#08090C", panel: "#101319", ink: "#EAEDF2", gold: "#D9B24C", green: "#4BD07E", slate: "#5A6B8C" },
    ground: "#08090C", ink: "#EAEDF2", accents: ["#D9B24C", "#4BD07E"], extras: ["#5A6B8C", "#F0D68A"],
    display: "Space Grotesk", body: "Inter", label: "IBM Plex Mono",
    emphasisCss: GRAD("#D9B24C", "#F0D68A"),
  },
  {
    name: "ledger-noir", family: "fintech-dark", label: "Ledger Noir",
    overview: "Near-black institutional fintech — platinum and a cool blue over a precise mono ledger.",
    colors: { void: "#0A0C10", panel: "#131722", ink: "#E9EEF5", blue: "#8FB4FF", platinum: "#C9CFDA", teal: "#4FD1C5" },
    ground: "#0A0C10", ink: "#E9EEF5", accents: ["#8FB4FF", "#C9CFDA"], extras: ["#4FD1C5", "#B7CCF5"],
    display: "IBM Plex Mono", body: "Inter", label: "IBM Plex Mono",
  },
  // ---- saas-gradient (SaaS explainers / product tours / launches) ----
  {
    name: "nimbus-saas", family: "saas-gradient", label: "Nimbus SaaS",
    overview: "Bright modern SaaS — near-white ground, a soft indigo→pink brand gradient, friendly type.",
    colors: { paper: "#FAFAFD", mist: "#F0F0F8", ink: "#171525", indigo: "#6366F1", pink: "#EC4899", sky: "#38BDF8" },
    ground: "#FAFAFD", ink: "#171525", accents: ["#6366F1", "#EC4899"], extras: ["#38BDF8", "#C7C9F7"],
    display: "Space Grotesk", body: "Inter", label: "Inter",
    emphasisCss: GRAD("#6366F1", "#38BDF8", "#EC4899"),
  },
  {
    name: "mint-launch", family: "saas-gradient", label: "Mint Launch",
    overview: "A fresh product-launch system — white studio ground, an emerald→sky gradient, rounded type.",
    colors: { paper: "#F7FCFA", mist: "#EBF6F1", ink: "#0F2A24", emerald: "#10B981", sky: "#38BDF8", lime: "#A3E635" },
    ground: "#F7FCFA", ink: "#0F2A24", accents: ["#10B981", "#38BDF8"], extras: ["#A3E635", "#A7F3D0"],
    display: "Bricolage Grotesque", body: "Inter", label: "Inter",
    emphasisCss: GRAD("#10B981", "#38BDF8"),
  },
];
