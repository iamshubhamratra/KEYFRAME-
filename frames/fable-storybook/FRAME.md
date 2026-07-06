---
version: alpha
name: Fable Storybook — Frame (video / frame layer)
description: >
  Warm storytelling system for narrative films, brand stories and emotional
  arcs. Parchment grounds, ink-brown serif-spirit type, watercolor washes in
  terracotta, sage and dusk blue, honey-gold moments, soft grain — and a
  signature 3D layer of drifting paper planes and firefly orbs floating
  through gentle depth. Every scene turns like a page.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  parchment: "#FAF5EA"
  linen: "#F2EADA"
  inkbrown: "#33261A"
  terracotta: "#D8734B"
  sage: "#7FA37C"
  dusk: "#7A93B8"
  honey: "#E8B84B"

typography:
  body:      { fontFamily: "Georgia", cqw: 1.0, weight: 400, lineHeight: 1.6, color: "inkbrown at 78%" }
  micro-label:{ fontFamily: "Inter", px: 12, weight: 600, tracking: "0.22em", upper: true, color: "terracotta" }
  card-title:{ fontFamily: "Georgia", cqw: 1.35, weight: 700, lineHeight: 1.2, color: "inkbrown" }
  heading-md:{ fontFamily: "Georgia", cqw: 2.2, weight: 700, lineHeight: 1.12, color: "inkbrown" }
  stat-number:{ fontFamily: "Georgia", cqw: 4.0, weight: 700, lineHeight: 1.0, color: "terracotta" }
  heading-lg:{ fontFamily: "Georgia", cqw: 3.4, weight: 700, lineHeight: 1.06, color: "inkbrown" }
  heading-xl:{ fontFamily: "Georgia", cqw: 4.6, weight: 700, lineHeight: 1.02, color: "inkbrown" }

spacing:
  slide-pad: "4cqw"
  gap-md: "1.8cqw"

components:
  watercolor-wash:
    background: "large soft radial blob of {colors.terracotta}/{colors.sage}/{colors.dusk} at 10-18%, blurred 40px+"
    description: "THE atmosphere: 1-2 washes per scene, in the margins, like pigment blooming on paper."
  page-card:
    backgroundColor: "{colors.parchment}"
    border: "1px solid {colors.inkbrown} at 10%"
    rounded: "14px (0.7cqw)"
    shadow: "0 18px 44px {colors.inkbrown} at 12%"
    description: "Content pages — photos and passages sit on slightly-lifted paper."
  honey-moment:
    rule: "{colors.honey} for ONE glowing detail per scene — an underline, a small sun, a firefly cluster"
    description: "The magic: exactly one honey element per scene."
  chapter-chip:
    backgroundColor: "{colors.linen}"
    border: "1px solid {colors.inkbrown} at 12%"
    rounded: "9999px"
    typography: "{typography.micro-label}"
    description: "Chapter markers — 'CHAPTER ONE', 'THE TURN', 'EVER AFTER'."
  deckle-edge:
    rule: "irregular soft edge or torn-paper divider between scenes, {colors.linen}"
    description: "Scene handoffs feel like a page turning, not a cut."

## Composition rules

- PAPER FIRST: parchment/linen grounds always; ink-brown serif-spirit type
  (Georgia carries the storybook identity); terracotta is the emphasis hue,
  sage and dusk are supporting washes, honey is the once-per-scene magic.
- NARRATIVE RHYTHM: scenes are chapters — open each with a chapter-chip,
  carry ONE sentence of story at heading scale, let the visual breathe.
- Photos are MEMORIES: inside page-cards, slightly rotated (±2-3°), with a
  warm linen scrim (15-25%) so their colors sink into the paper.
- Motion is gentle: slow drifts, soft fades, page-turn wipes — never snappy
  spring pops. Ease everything sine/power2.

## 3D LAYER — SIGNATURE, REQUIRED (heavy Three.js identity)

This pack's identity is the **paper sky**: a full-duration Three.js layer
(WebGL adapter contract — `hf-seek` time only, procedural geometry, pixelRatio
1) with 3-5 low-poly paper planes (folded-triangle silhouettes in parchment
white with inkbrown edges) gliding on slow sine paths at different depths,
plus 15-25 tiny firefly orbs (honey at 0.3-0.5, additive glow) pulsing gently.
Depth-of-field feel: nearer planes larger and softer-moving. Everything drifts
slowly enough to feel hand-held and dreamlike; the layer sits behind the DOM
page layer. 2D canvas fallback: the flowing watercolor ribbons. At least one
scene should turn a page-card in 3D — `rotationY -100→0` like a page opening.

## Scene treatments

- OPENING: chapter-chip 'ONCE' + heading-xl first line; a terracotta wash
  blooms top-left; paper planes cross slowly.
- JOURNEY/FEATURE: page-card photo memory + the story line beside it; sage
  wash; fireflies gather near the honey-moment underline.
- TURN/STAT: the number in terracotta stat-number scale with 'the turn'
  chapter-chip; dusk wash cools the scene.
- ENDING: centered heading-lg closing line + honey firefly cluster settling;
  everything slows to stillness.

## Don't

- No pure white, no black, no saturated primaries, no tech-glass surfaces.
- No hard springs/back.out pops; no more than one honey element per scene.
- Photos never raw — always paged, tilted, warm-scrimmed.
