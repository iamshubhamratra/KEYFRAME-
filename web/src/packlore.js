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
  "fable-storybook": {
    name: "Fable Storybook", tag: "STORY · 3D", bg: "#FAF5EA", ink: "#33261A", accent: "#D8734B",
    chips: ["#D8734B", "#7FA37C", "#7A93B8"],
    grad: "radial-gradient(circle at 22% 30%, rgba(216,115,75,.16), transparent 45%), radial-gradient(circle at 80% 70%, rgba(127,163,124,.14), transparent 48%)",
    font: "'Bricolage Grotesque'", tracking: "-.01em", demo: "Once Upon…",
    vibe: "Parchment pages, watercolor washes, paper planes and firefly orbs gliding in gentle 3D. Built for storytelling.",
    filmGrad: "linear-gradient(135deg,#D8734B,#E8B84B,#7A93B8)",
  },
  "slab-stage": {
    name: "Slab Stage", tag: "KINETIC · 9:16", bg: "#16161A", ink: "#F3F2F2", accent: "#EC3013",
    chips: ["#EC3013", "#1F5FD8", "#16161A"],
    grad: "radial-gradient(95% 62% at 26% 14%, rgba(236,48,19,.42), transparent 70%), radial-gradient(85% 58% at 84% 86%, rgba(31,95,216,.38), transparent 72%)",
    font: "'Archivo'", tracking: "-.04em", demo: "One Take",
    vibe: "One continuously moving stage — deep 3D slabs on a shared vanishing point, a camera that pans and breathes off the film clock so the move carries through every cut, karaoke type that snaps word by word, and huge outlined ghost letters drifting behind. Two accents, alternating light and dark grounds.",
    filmGrad: "linear-gradient(126deg,#EC3013,#1F5FD8)",
  },
  "grid-dispatch": {
    name: "Grid Dispatch", tag: "MODERNIST · 9:16", bg: "#F3F2F2", ink: "#201E1D", accent: "#EC3013",
    chips: ["#EC3013", "#201E1D", "#F3F2F2"],
    grad: "linear-gradient(180deg,#F3F2F2 0%,#F3F2F2 62%,#EC3013 62%,#EC3013 100%)",
    font: "'Archivo'", tracking: "-.035em", demo: "Dispatch 01/07",
    vibe: "A Swiss-modernist dispatch sheet in motion — flat paper, one saturated accent, a visible six-column grid, self-drawing 2px rules and hard-edged mask reveals. Screenshots ride technical asset panels with a spec header bar. Built vertical, for brands that want authority over spectacle.",
    filmGrad: "linear-gradient(135deg,#EC3013,#201E1D)",
  },
  "edition": {
    name: "Edition", tag: "BROADSHEET · 16:9", bg: "#EFE9DA", ink: "#16130D", accent: "#DA3A24",
    chips: ["#DA3A24", "#16130D", "#EFE9DA"],
    grad: "linear-gradient(180deg,#EFE9DA 0%,#EFE9DA 58%,#DA3A24 58%,#DA3A24 100%)",
    font: "'Anton'", tracking: "-.02em", demo: "PAGE 01",
    vibe: "A printed broadsheet in motion — warm newsprint, Anton set enormous, heavy self-drawing rules and a six-column measure. Pictures print in the grid with a keyline and caption. Built landscape, for journalism, research and publishing.",
    filmGrad: "linear-gradient(135deg,#DA3A24,#16130D)",
  },
  "fight": {
    name: "Fight", tag: "FIGHT NIGHT · 16:9", bg: "#0B0B10", ink: "#F5EFE6", accent: "#E23130",
    chips: ["#E23130", "#F5C542", "#0B0B10"],
    grad: "radial-gradient(ellipse at 50% 34%, rgba(245,197,66,.24), transparent 62%), linear-gradient(180deg,#0B0B10,#15151F)",
    font: "'Anton'", tracking: "-.02em", demo: "MAIN EVENT",
    vibe: "A fight-night promo — near-black arena, hot red and belt gold, ring ropes and a spotlight. Anton slams in, the frame shakes on the hit, and a struck VS drops between two angled fighter cards. Built landscape, for sport, fitness and competitive launches.",
    filmGrad: "linear-gradient(135deg,#E23130,#F5C542)",
  },
  "reel": {
    name: "Reel", tag: "SOCIAL · 9:16", bg: "#150A2E", ink: "#FFFFFF", accent: "#D4FF3F",
    chips: ["#D4FF3F", "#E1246E", "#150A2E"],
    grad: "radial-gradient(circle at 15% 15%, rgba(67,38,201,.6), transparent 62%), radial-gradient(circle at 85% 45%, rgba(225,36,110,.5), transparent 58%), linear-gradient(180deg,#150A2E,#150A2E)",
    font: "'Archivo'", tracking: "-.04em", demo: "WATCH THIS",
    vibe: "A social story film — deep violet washed with saturated blooms, electric lime, and heavy Archivo stacked line by line. Everything is a tilted sticker card with a hard shadow, under a segmented story bar. Built vertical for Reels, Shorts and TikTok.",
    filmGrad: "linear-gradient(135deg,#D4FF3F,#E1246E)",
  },
  "showcase-vertical": {
    name: "Showcase Vertical", tag: "PRODUCT TOUR · 9:16", bg: "#EEF1F7", ink: "#131722", accent: "#2F6BFF",
    chips: ["#2F6BFF", "#131722", "#EEF1F7"],
    grad: "radial-gradient(circle at 16% 10%, rgba(47,107,255,.3), transparent 58%), radial-gradient(circle at 86% 88%, rgba(47,107,255,.18), transparent 55%)",
    font: "'Space Grotesk'", tracking: "-.025em", demo: "01 — The app",
    vibe: "The portrait Showcase — an annotated product tour re-authored for the tall frame. The phone fills the height, copy stacks above it, numbered callouts land on the screen, and gallery windows snap in from alternating sides. Built vertical for Reels, Shorts and Stories.",
    filmGrad: "linear-gradient(135deg,#2F6BFF,#131722)",
  },
  "flight": {
    name: "Flight", tag: "DEPARTURE · 16:9", bg: "#E9F6FF", ink: "#16222E", accent: "#FF5630",
    chips: ["#FF5630", "#8FCBF5", "#E9F6FF"],
    grad: "linear-gradient(180deg,#8FCBF5 0%,#BFE6FF 44%,#E9F6FF 70%,#39404A 70%,#39404A 100%)",
    font: "'Figtree'", tracking: "-.03em", demo: "DEPARTURE",
    vibe: "A departure film — a graded daylight sky, a warm sun, a scrolling runway and one hot orange. An aircraft mark crosses every beat and pictures ride in rounded cabin windows. Built landscape, for travel, logistics and mobility.",
    filmGrad: "linear-gradient(135deg,#FF5630,#8FCBF5)",
  },
  "flight-vertical": {
    name: "Flight Vertical", tag: "DEPARTURE · 9:16", bg: "#E9F6FF", ink: "#16222E", accent: "#FF5630",
    chips: ["#FF5630", "#8FCBF5", "#E9F6FF"],
    grad: "linear-gradient(180deg,#8FCBF5 0%,#BFE6FF 44%,#E9F6FF 70%,#39404A 70%,#39404A 100%)",
    font: "'Figtree'", tracking: "-.03em", demo: "DEPARTURE",
    vibe: "The vertical cut of Flight — the horizon drops, cabin windows stack down the frame and the dials run as a column. Same graded sky, sun and hot orange. Built vertical for Reels, Shorts and Stories.",
    filmGrad: "linear-gradient(135deg,#FF5630,#8FCBF5)",
  },
  "pipeline": {
    name: "Pipeline", tag: "FACTORY · 16:9", bg: "#EAEDF2", ink: "#1E2230", accent: "#FF8A00",
    chips: ["#FF8A00", "#1E2230", "#EAEDF2"],
    grad: "linear-gradient(180deg,#F3F5F9 0%,#EAEDF2 62%,#2A2E3A 62%,#1A1D26 100%)",
    font: "'Archivo'", tracking: "-.03em", demo: "STATION 01",
    vibe: "A factory line in motion — machine-shop grey, white equipment panels, brushed steel and one safety orange, over a conveyor with scrolling chevrons. Screenshots ride in inspection bays with a station number and status lamp. Built landscape, for manufacturing, devops and process products.",
    filmGrad: "linear-gradient(135deg,#FF8A00,#1E2230)",
  },
  "momentum": {
    name: "Momentum", tag: "VELOCITY · 16:9", bg: "#131210", ink: "#F5F2EA", accent: "#FF4B2B",
    chips: ["#FF4B2B", "#F5F2EA", "#131210"],
    grad: "radial-gradient(ellipse at 18% 30%, rgba(255,75,43,.4), transparent 58%), linear-gradient(180deg,#131210,#1C1A17)",
    font: "'Figtree'", tracking: "-.04em", demo: "MOMENTUM",
    vibe: "A kinetic-velocity film — near-black and cream with one hot vermilion, words sliding out of hard masks, speed rules streaking in, and a marquee of the beat's own words. Pictures are edge-to-edge bands that drift, not panels. Built landscape, for sport, automotive and agencies.",
    filmGrad: "linear-gradient(135deg,#FF4B2B,#F5F2EA)",
  },
  "deep": {
    name: "Deep", tag: "TRENCH · 16:9", bg: "#02101A", ink: "#E9FBF8", accent: "#3FE7D6",
    chips: ["#3FE7D6", "#B36BFF", "#02101A"],
    grad: "linear-gradient(180deg,#0A3A44 0%,#062632 46%,#02101A 100%)",
    font: "'Figtree'", tracking: "-.03em", demo: "DEPTH 03",
    vibe: "A descent into a bioluminescent trench — the ground darkens down the frame, god-rays rake through drifting marine snow, and everything glows. Pictures ride in rim-lit portholes that bob on the current. Built landscape, for research, biotech and AI.",
    filmGrad: "linear-gradient(135deg,#3FE7D6,#B36BFF)",
  },
  "jungle": {
    name: "Jungle", tag: "EXPEDITION · 16:9", bg: "#DFF3D0", ink: "#12301E", accent: "#F4A100",
    chips: ["#F4A100", "#2E6B3E", "#FCF7E9"],
    grad: "linear-gradient(180deg,#DFF3D0 0%,#B7E39A 30%,#2E6B3E 46%,#173F26 74%,#0E2C1B 100%)",
    font: "'Caprasimo'", tracking: "0", demo: "Expedition",
    vibe: "A rainforest expedition — four drifting canopy bands with scalloped leaf edges, rising fireflies, cream cards and a chunky hand-lettered face. Pictures ride in peg-pinned leaf-cut frames that swing in from above. Built landscape, for kids, eco, education and travel.",
    filmGrad: "linear-gradient(135deg,#F4A100,#2E6B3E)",
  },
  "drive": {
    name: "Drive", tag: "HIGHWAY · 16:9", bg: "#FFF7EA", ink: "#2A2233", accent: "#12B5C8",
    chips: ["#12B5C8", "#FCA26A", "#2B2733"],
    grad: "linear-gradient(180deg,#FFE3A3 0%,#FCA26A 34%,#EE7B7B 58%,#4C4655 58%,#2B2733 100%)",
    font: "'Archivo'", tracking: "-.045em", demo: "MILE 01",
    vibe: "A golden-hour highway — a graded sunset over a parallax skyline, a dark road with a scrolling centreline, and one cool teal. Pictures ride roadside billboards on posts that sweep past. Built landscape, for automotive, travel and delivery.",
    filmGrad: "linear-gradient(135deg,#12B5C8,#FCA26A)",
  },
  "fetch": {
    name: "Fetch", tag: "PARK DAY · 16:9", bg: "#EAF7FB", ink: "#3A352C", accent: "#F2683C",
    chips: ["#F2683C", "#8FC15A", "#FFFDF6"],
    grad: "linear-gradient(180deg,#EAF7FB 0%,#C7E7F1 44%,#8FC15A 66%,#7CAF49 100%)",
    font: "'Caprasimo'", tracking: "0", demo: "Off the lead",
    vibe: "A bright park afternoon — rolling grass with a scalloped horizon, drifting clouds and a warm sun. Everything bounces in on an overshoot and a ball arcs across every beat. Pictures sit in tilted cream cards. Built landscape, for pets, family, food and community.",
    filmGrad: "linear-gradient(135deg,#F2683C,#8FC15A)",
  },
  "teampulse": {
    name: "Teampulse", tag: "KINETIC TYPE · 9:16", bg: "#20201E", ink: "#F6F0E4", accent: "#C67139",
    chips: ["#C67139", "#7A8A5E", "#20201E"],
    grad: "radial-gradient(circle at 18% 16%, rgba(198,113,57,.5), transparent 62%), radial-gradient(circle at 86% 82%, rgba(122,138,94,.4), transparent 62%), linear-gradient(168deg,#3B2A1D,#20201E)",
    font: "'Caprasimo'", tracking: "0", demo: "We hire people",
    vibe: "A kinetic-typography film where the type IS the design — warm umber and terracotta, cream cards, and headlines animated word by word: flipping, typing on, sliding out of masks, every third word in the accent. Built vertical, for hiring, culture and agencies.",
    filmGrad: "linear-gradient(135deg,#C67139,#7A8A5E)",
  },
  "hacker": {
    name: "Hacker", tag: "TERMINAL · 16:9", bg: "#05080B", ink: "#D7F5E1", accent: "#37FF7A",
    chips: ["#37FF7A", "#0B1016", "#05080B"],
    grad: "linear-gradient(180deg,#05080B 0%,#0B1016 70%,#0d2417 100%)",
    font: "'JetBrains Mono'", tracking: ".02em", demo: "[ ACCESS ]",
    vibe: "A terminal in motion — phosphor green on near-black, boot logs that type themselves, block progress bars, scanline flicker, and screenshots framed as terminal windows. Built landscape, for developer tools, security and infrastructure.",
    filmGrad: "linear-gradient(135deg,#37FF7A,#05080B)",
  },
  "orbit": {
    name: "Orbit", tag: "LAUNCH · 16:9", bg: "#060814", ink: "#EAF0FF", accent: "#5B8CFF",
    chips: ["#5B8CFF", "#FF7A2C", "#0E1426"],
    grad: "radial-gradient(ellipse at 50% 110%, rgba(91,140,255,.42), transparent 58%), linear-gradient(180deg,#060814,#0E1426)",
    font: "'Space Grotesk'", tracking: "-.03em", demo: "T MINUS 03",
    vibe: "Launch control — a drifting starfield, a cool blue against a hot flame orange, hairline panels with corner ticks, a monospace countdown and payloads that ride up on a flame column. Built landscape, for launches, hardware and deep tech.",
    filmGrad: "linear-gradient(135deg,#5B8CFF,#FF7A2C)",
  },
  "showcase": {
    name: "Showcase", tag: "PRODUCT TOUR · 16:9", bg: "#EEF1F7", ink: "#131722", accent: "#2F6BFF",
    chips: ["#2F6BFF", "#131722", "#EEF1F7"],
    grad: "radial-gradient(circle at 18% 12%, rgba(47,107,255,.28), transparent 58%), radial-gradient(circle at 84% 82%, rgba(47,107,255,.18), transparent 55%)",
    font: "'Space Grotesk'", tracking: "-.025em", demo: "01 — The dashboard",
    vibe: "An annotated product tour — your screenshots inside real browser and phone chrome, with arrows that draw themselves, numbered callouts, a pulsing highlight and a cursor that clicks. Bright paper, soft colour blobs, paper planes. Built landscape, for products whose story IS their interface.",
    filmGrad: "linear-gradient(135deg,#2F6BFF,#131722)",
  },

  "prisma-bloc": {
    name: "Prisma Bloc", tag: "COLOUR BLOCK · 9:16", bg: "#FFF6EA", ink: "#12100E", accent: "#FF4D2E",
    chips: ["#FF4D2E", "#1B4DFF", "#FFD23F", "#14C98E"],
    grad: "linear-gradient(160deg,#FFD23F 0 32%,#1B4DFF 32% 62%,#FF4D2E 62% 100%)",
    font: "'Bricolage Grotesque'", tracking: "-.035em", demo: "ANY LINK BECOMES FILM",
    vibe: "A designed poster in motion — flat saturated fields that hard-cut on block wipes, Archivo Black mega type crossing a travelling seam, outlined sticker chips with hard shadows and a halftone dot rain. Screenshots ride browser and phone mockups that scroll like a real demo. Brand colour rotates the whole palette, grounds included. Vertical.",
    filmGrad: "linear-gradient(135deg,#FF4D2E,#FFD23F,#1B4DFF,#14C98E)",
  },

  // ── The seven imported "Animated video template" packs — one shared engine
  // (server/src/services/om_stage.js), seven worlds. All portrait-native, all recolour
  // their entire world from the brand skin. ──
  "organic-garden": {
    name: "Organic Garden", tag: "GARDEN · 9:16", bg: "#F5EAD8", ink: "#201E1D", accent: "#C67139",
    chips: ["#C67139", "#7A8A5E", "#FFC6A5"],
    grad: "radial-gradient(circle at 26% 30%, rgba(198,113,57,.30), transparent 52%), radial-gradient(circle at 78% 74%, rgba(122,138,94,.34), transparent 54%)",
    font: "'Bricolage Grotesque'", tracking: "-.015em", demo: "Grown from your story",
    vibe: "A warm cream garden that keeps growing behind the film — drifting petals, soft blooms and rolling hills flowing continuously across every cut. Calm drifting camera, no hard wipes. Brand colour regrows the whole garden.",
    filmGrad: "linear-gradient(135deg,#C67139,#FFC6A5,#7A8A5E)",
  },
  "lantern-night": {
    name: "Lantern Night", tag: "NIGHT · 9:16", bg: "#1A1817", ink: "#F5EAD8", accent: "#C67139",
    chips: ["#C67139", "#E8A066", "#7A8A5E"],
    grad: "radial-gradient(circle at 78% 16%, rgba(245,234,216,.30), transparent 46%), radial-gradient(circle at 34% 76%, rgba(198,113,57,.42), transparent 54%)",
    font: "'Bricolage Grotesque'", tracking: "-.015em", demo: "After dark",
    vibe: "A night lantern festival — terracotta lanterns rising through three parallax layers over a water band that carries their reflections, sage fireflies weaving, a moon breathing behind its halo. A lantern-glow iris opens every cut.",
    filmGrad: "linear-gradient(135deg,#E8A066,#C67139,#1A1817)",
  },
  "daybreak-bakehouse": {
    name: "Daybreak Bakehouse", tag: "SUNRISE · 9:16", bg: "#F7EEDD", ink: "#201E1D", accent: "#FFB454",
    chips: ["#FFB454", "#C67139", "#7A8A5E"],
    grad: "linear-gradient(200deg, rgba(255,180,84,.55) 0%, rgba(198,113,57,.22) 45%, transparent 75%)",
    font: "'Bricolage Grotesque'", tracking: "-.015em", demo: "Since first light",
    vibe: "A sunrise bakery — a low sun raking shafts of warm light across the room, steam rising continuously off the counter, dust motes turning in the beam and pendant lamps swaying overhead.",
    filmGrad: "linear-gradient(135deg,#FFB454,#C67139,#F7EEDD)",
  },
  "story-blocks": {
    name: "Story Blocks", tag: "EDITORIAL · 9:16", bg: "#F5EAD8", ink: "#201E1D", accent: "#C67139",
    chips: ["#C67139", "#7A8A5E", "#D9B44A"],
    grad: "linear-gradient(155deg,#F5EAD8 0 30%,#C67139 30% 55%,#201E1D 55% 78%,#7A8A5E 78% 100%)",
    font: "'Bricolage Grotesque'", tracking: "-.005em", demo: "CHAPTER ONE",
    vibe: "An edited-video look with nothing ever parked — colour panels travelling in from alternating sides, tilted ticker rails marching opposite ways, and a different full-field colour block for every scene.",
    filmGrad: "linear-gradient(135deg,#C67139,#D9B44A,#7A8A5E)",
  },
  "poster-pop": {
    name: "Poster Pop", tag: "POSTER · 9:16", bg: "#C67139", ink: "#201E1D", accent: "#D9B44A",
    chips: ["#C67139", "#D9B44A", "#7A8A5E"],
    grad: "conic-gradient(from 20deg at 50% 45%, #C67139 0 25%, #D9B44A 25% 50%, #201E1D 50% 75%, #7A8A5E 75% 100%)",
    font: "'Bricolage Grotesque'", tracking: "0", demo: "READ THIS",
    vibe: "A poster in motion — every scene one solid full-bleed field with gigantic condensed type slammed over it, a giant starburst turning slowly behind and two marquee rails scrolling without end.",
    filmGrad: "linear-gradient(135deg,#C67139,#D9B44A,#201E1D)",
  },
  "premiere-night": {
    name: "Premiere Night", tag: "CINEMA · 9:16", bg: "#171514", ink: "#F5EAD8", accent: "#E8A066",
    chips: ["#E8A066", "#C67139", "#7A8A5E"],
    grad: "radial-gradient(ellipse at 30% 0%, rgba(232,160,102,.42), transparent 52%), radial-gradient(ellipse at 72% 4%, rgba(198,113,57,.34), transparent 50%)",
    font: "'Bricolage Grotesque'", tracking: "-.01em", demo: "Tonight only",
    vibe: "A cinema premiere — spotlights sweeping the house, marquee bulbs chasing the rails, a film strip drifting up the edge, projector grain and a heavy vignette. Real theatre cuts: doors, iris, blinds.",
    filmGrad: "linear-gradient(135deg,#E8A066,#C67139,#171514)",
  },
  "hype-wave": {
    name: "Hype Wave", tag: "ELECTRIC · 9:16", bg: "#2B5BFF", ink: "#101433", accent: "#FFD234",
    chips: ["#FFD234", "#FF5A48", "#2B5BFF"],
    grad: "linear-gradient(140deg,#2B5BFF 0 34%,#FFD234 34% 62%,#FF5A48 62% 100%)",
    font: "'Bricolage Grotesque'", tracking: "-.02em", demo: "TURN IT UP",
    vibe: "Electric sticker pop — checkerboard rails scrolling, wavy ribbons crossing the frame, star stickers spinning with thick outlines, and the field swapping colour every scene.",
    filmGrad: "linear-gradient(135deg,#FFD234,#FF5A48,#2B5BFF)",
  },

  // ── Imported OM portrait pack — native GSAP + hf-seek canvas, brand recolors everything ──
  "motion-canvas": {
    name: "Motion Canvas", tag: "MOTION GFX · 9:16", bg: "#F2EDE3", ink: "#171310", accent: "#FF5A3C",
    chips: ["#FF5A3C", "#2C6BED", "#171310"],
    grad: "radial-gradient(circle at 26% 26%, rgba(255,90,60,.22), transparent 52%), radial-gradient(circle at 78% 76%, rgba(44,107,237,.2), transparent 52%)",
    font: "'Bricolage Grotesque'", tracking: "-.03em", demo: "Shapes in motion",
    vibe: "An abstract motion-graphics reel — bold geometric shapes assemble and sweep on a soft dot grid, kinetic type snaps, screenshots mask into shapes. Brand color paints every shape and stroke. Vertical.",
    filmGrad: "linear-gradient(135deg,#FF5A3C,#2C6BED,#F2EDE3)",
  },
  "paper-craft": {
    name: "Paper Craft", tag: "PAPERCRAFT · 9:16", bg: "#F1E7D3", ink: "#2A2117", accent: "#E07A3F",
    chips: ["#E07A3F", "#2A2117", "#E9DcC0"],
    grad: "radial-gradient(circle at 70% 28%, rgba(224,122,63,.2), transparent 55%)",
    font: "'Bricolage Grotesque'", tracking: "-.01em", demo: "Cut & fold",
    vibe: "A warm handcrafted cut-paper collage — layered construction-paper shapes pop up and fold in with a tactile bounce; screenshots paste onto paper cards. Brand color tints every paper layer. Vertical.",
    filmGrad: "linear-gradient(135deg,#E07A3F,#C79A5E,#F1E7D3)",
  },
};

export const PACK_ORDER = [
  // Portrait 9:16 packs lead (prisma-bloc + the imported OM templates).
  "prisma-bloc", "organic-garden", "lantern-night", "daybreak-bakehouse", "story-blocks", "poster-pop",
  "premiere-night", "hype-wave", "grid-dispatch", "slab-stage",
  "motion-canvas", "paper-craft",
  "reel",
  "showcase-vertical",
  "flight-vertical",
  "teampulse",
  // Landscape / other packs.
  "showcase", "orbit", "hacker", "fetch", "drive", "jungle", "deep", "momentum", "pipeline", "flight", "fight", "edition", "fable-storybook",
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

// Lore for a server pack name. EXACT MATCH ONLY.
//
// This used to fall back to a PREFIX match — `packName.startsWith(k.split("-")[0])` — which
// was a tolerable guess at 14 packs and is actively wrong at 116: "bloom-market" resolved to
// bloom-fable's lore, "paper-cut" to paper-craft's and "jungle-trek" to jungle's, so those
// cards showed another template's NAME, ACCENT, CHIPS and VIBE. A card that describes a
// different template is worse than a plain one. Prefer `loreForPack`, which derives a correct
// card from the pack's own manifest instead of guessing at a neighbour's.
export function loreFor(packName) {
  if (!packName) return FALLBACK_LORE;
  if (PACK_LORE[packName]) return PACK_LORE[packName];
  return { ...FALLBACK_LORE, name: packName };
}

const readable = (hex) => {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return "#f2f4ec";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) > 0.45 ? "#17130e" : "#f7f5f0";
};

// A card built from what the SERVER already knows about the pack. /api/frames returns the
// manifest's label, vibe, category, ground, colors and accents, so every installed pack can
// present itself correctly whether or not anyone hand-wrote lore for it.
export function loreForPack(pack) {
  if (!pack || !pack.name) return FALLBACK_LORE;
  const authored = PACK_LORE[pack.name];
  if (authored) return authored;
  const colors = Array.isArray(pack.colors) ? pack.colors.filter(Boolean) : [];
  const accents = (Array.isArray(pack.accents) ? pack.accents.filter(Boolean) : []);
  const accent = accents[0] || colors[1] || colors[0] || FALLBACK_LORE.accent;
  const bg = pack.ground || colors[0] || FALLBACK_LORE.bg;
  const chips = [...new Set([...accents, ...colors])].slice(0, 3);
  return {
    name: pack.label || pack.name,
    tag: String(pack.category || (pack.orientation === "portrait" ? "9:16" : "PACK")).toUpperCase(),
    bg,
    ink: readable(bg),
    accent,
    chips: chips.length ? chips : FALLBACK_LORE.chips,
    grad: "none",
    font: pack.displayFont ? `'${pack.displayFont}'` : FALLBACK_LORE.font,
    tracking: "-.01em",
    demo: pack.label || pack.name,
    vibe: pack.vibe || FALLBACK_LORE.vibe,
    filmGrad: `linear-gradient(135deg, ${(chips.length ? chips : [accent]).join(", ")})`,
  };
}

// Gallery filter pills — the design's list, remapped to server pack names.
export const GALLERY_FILTERS = [
  ["all", "ALL FILMS"], ["prisma-bloc", "PRISMA"], ["organic-garden", "GARDEN"], ["lantern-night", "LANTERN"],
  ["poster-pop", "POSTER"], ["premiere-night", "PREMIERE"], ["hype-wave", "HYPE"], ["story-blocks", "BLOCKS"],
  ["daybreak-bakehouse", "DAYBREAK"], ["grid-dispatch", "DISPATCH"], ["slab-stage", "SLAB"], ["showcase", "SHOWCASE"], ["orbit", "ORBIT"], ["hacker", "HACKER"], ["teampulse", "TEAMPULSE"], ["fetch", "FETCH"], ["drive", "DRIVE"], ["jungle", "JUNGLE"], ["deep", "DEEP"], ["momentum", "MOMENTUM"], ["pipeline", "PIPELINE"], ["flight-vertical", "FLIGHT V"], ["flight", "FLIGHT"], ["showcase-vertical", "SHOWCASE V"], ["reel", "REEL"], ["fight", "FIGHT"], ["edition", "EDITION"],
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
