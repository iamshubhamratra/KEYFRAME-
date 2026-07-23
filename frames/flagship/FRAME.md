---
version: alpha
name: Flagship — Cinematic Three.js launch film (the benchmark)
description: >
  The flagship, dark-cinematic launch-film system in the Apple / Linear / Stripe /
  Vercel register. A native Three.js scene: deep indigo grounds lit by large, soft,
  slowly drifting aurora glows; real product screenshots presented on floating
  glass device plates with genuine depth and parallax; a cinematic camera that
  dollies in on the reveal, parallaxes across the features and pulls back on the
  CTA; filmic ACES tone-mapping with a soft bloom. Space Grotesk display type
  reveals word-by-word. Built to be the quality standard every other template is
  measured against — a handcrafted product-launch film, never a slideshow.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 supported
principle: clarity over decoration · every element earns its place · the camera guides the eye

colors:
  ground: "#07080F"
  ground-2: "#0C0E1A"
  ink: "#F6F8FF"
  muted: "#A6ACC8"
  indigo: "#6E8BFF"
  violet: "#B16CFF"
  cyan: "#4ED7FF"
  mint: "#57F2C2"

typography:
  body:       { fontFamily: "Inter", cqw: 0.95, weight: 500, lineHeight: 1.5, color: "muted" }
  kicker:     { fontFamily: "Inter", px: 13, weight: 600, tracking: "0.24em", upper: true, color: "cyan" }
  headline:   { fontFamily: "Space Grotesk", cqw: 4.6, weight: 700, lineHeight: 1.0, tracking: "-0.025em", color: "ink" }
  hero:       { fontFamily: "Space Grotesk", cqw: 6.2, weight: 700, lineHeight: 0.96, tracking: "-0.03em", color: "ink" }
  metric:     { fontFamily: "Space Grotesk", cqw: 7.0, weight: 700, lineHeight: 1.0, tracking: "-0.03em", color: "cyan" }

components:
  glass-plate:
    rule: "product screenshots float on a rounded glass plate — a subtle 1px inner light border, a soft accent rim glow (bloom), a drop shadow into the fog, sized to the asset's real aspect ratio"
    description: "THE identity — the product is presented, never pasted onto a slide."
  aurora-field:
    rule: "2–3 large, soft, additive gradient blobs (indigo / cyan / violet) drift slowly behind everything; a fine depth fog fades far layers"
    description: "The room the product lives in — atmosphere, never noise."
  camera:
    rule: "one continuous camera: a slow push-in on the hook, a dolly-in on the solution reveal, a parallax pan across the feature cluster, a pull-back on the CTA. Eased, cinematic, never abrupt."
    description: "The camera is the narrator."

do:
  - Keep the frame calm: one clear focal point per scene, generous negative space.
  - Let type breathe — Space Grotesk headline, Inter body, a cyan kicker eyebrow.
  - Present screenshots on glass with depth; size to their real aspect ratio.
  - Reserve bloom for accents and rims; keep text overlays crisp and legible.
dont:
  - No busy neon, no clutter, no more than 2–3 plates on screen at once.
  - No tiny unreadable text, no low-contrast copy, no random placement.
  - No hard slides or basic fades — motion is camera-driven and choreographed.
---

# Flagship — the benchmark template

The flagship is KEYFRAME's quality standard: a dark, cinematic product-launch film
rendered as a native Three.js scene. It is deliberately restrained — the aesthetic
of an Apple keynote, a Linear or Vercel launch, a Stripe announcement — where the
product and the words carry the frame and the camera does the storytelling.

## The world
A deep indigo-black stage (`ground #07080F`) lit by large, soft, slowly drifting
aurora glows in indigo, cyan and violet. Depth is real: a background atmosphere
layer, a midground where content lives, and a near foreground of faint bokeh —
each parallaxes against the camera. A gentle exponential fog fades the far layers
so the scene has air.

## The product
Real screenshots are presented on **floating glass device plates** — a rounded
plane carrying the screenshot, framed by a thin inner light border and a soft
accent rim that catches the bloom, dropping a shadow into the fog. Plates are sized
to the asset's true aspect ratio and placed by the story: a single hero plate on
the reveal, a small staggered cluster across the features.

## The narrative (6 acts)
1. **Hook** — a bold Space Grotesk headline over a calm aurora field; slow push-in.
2. **Problem** — muted, abstract; the tension before the product.
3. **Solution** — the hero reveal: the product on a large glass plate, dolly-in, rim glow.
4. **Features** — a staggered cluster of plates at varied depths, parallax pan.
5. **Benefits** — animated metrics count up beside a supporting plate.
6. **CTA** — brand plate + tagline, camera pull-back, particles settle.

## Typography
Space Grotesk for headlines and metrics (revealed word-by-word with a soft
blur-rise), Inter for body, a cyan uppercase kicker eyebrow. Text is always crisp
DOM above the canvas, on a soft legibility scrim, never rendered into the bloom.

## Pre-render self-audit
- One clear focal point per scene; ≥ 30% negative space.
- Every screenshot on a glass plate, aspect-correct, never stretched.
- Headline legible at thumbnail size (WCAG AA on the scrim).
- Camera moves on every scene; no static held frames except the final CTA.
- No more than 2–3 plates on screen at once; nothing random.
