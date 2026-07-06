---
version: alpha
name: Prism Launch — Frame (video / frame layer)
description: >
  Product-launch advertisement system on a gallery-white studio. Carbon display
  type on studio white, iridescent prism gradients (iris violet → aqua → blush)
  refracting across glass surfaces, ONE ember-hot CTA accent, and a signature
  3D layer of slowly rotating translucent prism shards catching the light —
  launch-day reveal energy, Apple-keynote clean.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  studio: "#FAFAFC"
  fog: "#F0F1F6"
  carbon: "#0E0F14"
  iris: "#8B7CF6"
  aqua: "#5AD7E6"
  blush: "#FFA3C0"
  ember: "#FF5A3C"

typography:
  body:      { fontFamily: "Inter", cqw: 0.95, weight: 400, lineHeight: 1.5, color: "carbon at 62%" }
  micro-label:{ fontFamily: "Inter", px: 12, weight: 600, tracking: "0.26em", upper: true, color: "iris" }
  card-title:{ fontFamily: "Space Grotesk", cqw: 1.3, weight: 700, lineHeight: 1.12, color: "carbon" }
  heading-md:{ fontFamily: "Space Grotesk", cqw: 2.3, weight: 700, lineHeight: 1.04, tracking: "-0.02em", color: "carbon" }
  stat-number:{ fontFamily: "Space Grotesk", cqw: 4.4, weight: 700, lineHeight: 1.0, tracking: "-0.02em" }
  heading-lg:{ fontFamily: "Space Grotesk", cqw: 3.8, weight: 700, lineHeight: 0.98, tracking: "-0.03em", color: "carbon" }
  heading-xl:{ fontFamily: "Space Grotesk", cqw: 5.4, weight: 800, lineHeight: 0.94, tracking: "-0.03em", color: "carbon" }

spacing:
  slide-pad: "3.5cqw"
  gap-md: "1.5cqw"

components:
  prism-gradient:
    background: "linear 120deg {colors.iris} → {colors.aqua} → {colors.blush}"
    description: "THE signature: used as clipped headline fill on ONE word, as a 2-4px edge on panels, or as the soft wash behind the product. Never as body text."
  studio-panel:
    backgroundColor: "{colors.studio}"
    border: "1px solid {colors.carbon} at 7%"
    rounded: "22px (1.1cqw)"
    shadow: "0 30px 80px {colors.carbon} at 12%"
    description: "The product pedestal surface — screenshots and product art float on it."
  ember-cta:
    backgroundColor: "{colors.ember}"
    color: "{colors.studio}"
    rounded: "9999px"
    description: "The ONLY ember element: the CTA pill (or one launch-date chip). Nothing else is ember."
  refraction-streak:
    rule: "a 1-2px prism-gradient line at 12-20% opacity sweeping diagonally"
    description: "Light-catch detail across panels or behind type; 1-2 per scene max."
  spec-chip:
    backgroundColor: "{colors.fog}"
    rounded: "9999px"
    typography: "{typography.micro-label}"
    description: "Feature/spec callouts — '120 FPS', 'SHIPS FRIDAY'."

## Composition rules

- GALLERY WHITE + CARBON TYPE: massive tight display headlines in carbon on
  studio white; ONE word per headline carries the prism-gradient clip fill.
- The PRODUCT is the star: screenshots/product art at ≥60% of canvas on a
  studio-panel with a prism edge, camera pushing in; specs orbit it as chips.
- Iridescence is an ACCENT, not a wall: prism hues appear as gradient text on
  one word, panel edges, streaks and the 3D shards — never as full-frame
  backgrounds (the ground stays white).
- Exactly ONE ember element per film's close (the CTA). Its heat comes from
  the restraint everywhere else.

## 3D LAYER — SIGNATURE, REQUIRED (heavy Three.js identity)

This pack's identity is the **prism shard field**: a full-duration Three.js
layer (WebGL adapter contract — `hf-seek` time only, procedural geometry,
pixelRatio 1) of 8-14 thin refractive tetrahedra/octahedra with
MeshPhysicalMaterial-style translucency (transmission look approximated with
transparent iridescent materials in iris/aqua/blush at 0.10-0.22 opacity),
rotating slowly on individual axes, drifting upward, catching a moving key
light so faces flash softly as they turn. Camera drifts with subtle mouse-free
parallax derived from t. The shards live BEHIND the DOM product layer. 2D
canvas fallback: the translucent rotating triangle field. At least one scene
should stage the product panel itself in 3D — `rotationY 22→0` entrance with a
prism refraction-streak sweeping across it as it lands.

## Scene treatments

- HOOK/REVEAL: heading-xl with one prism-gradient word; shards drifting; a
  single refraction streak crosses the frame.
- FEATURE: product hero at 60-74% in a studio-panel + 2 spec-chips with
  connector lines; Ken Burns across the UI.
- STAT: carbon stat-number with a prism-gradient underline drawing in.
- CLOSE: "Available now" heading-lg + the one ember-cta pill, shards converge
  slightly and slow.

## Don't

- No dark scenes, no neon on black, no rainbow noise — the three prism hues only.
- Ember appears ONCE. Body text never in gradient. Ground never tinted.
