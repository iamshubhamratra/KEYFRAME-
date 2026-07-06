---
version: alpha
name: Summit Keynote — Frame (video / frame layer)
description: >
  Executive pitch system for investor decks, keynotes and founder stories on a
  LIGHT stage. Porcelain grounds, deep navy ink, ONE cobalt beam accent with a
  champagne-gold counterpoint, floating glass-light panels with feather
  shadows, and a signature 3D data-constellation layer drifting behind the
  message. Reads like the round already closed.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  porcelain: "#F7F8FC"
  cloud: "#EDF0F7"
  navy: "#10214B"
  slate: "#5A6B8C"
  cobalt: "#2B5BFF"
  gold: "#D4A94E"
  white: "#FFFFFF"

typography:
  body:      { fontFamily: "Inter", cqw: 0.95, weight: 400, lineHeight: 1.55, color: "slate" }
  micro-label:{ fontFamily: "Inter", px: 12, weight: 600, tracking: "0.24em", upper: true, color: "cobalt" }
  card-title:{ fontFamily: "Space Grotesk", cqw: 1.3, weight: 700, lineHeight: 1.15, color: "navy" }
  heading-md:{ fontFamily: "Space Grotesk", cqw: 2.2, weight: 700, lineHeight: 1.06, tracking: "-0.01em", color: "navy" }
  stat-number:{ fontFamily: "Space Grotesk", cqw: 4.4, weight: 700, lineHeight: 1.0, tracking: "-0.02em", color: "cobalt" }
  heading-lg:{ fontFamily: "Space Grotesk", cqw: 3.6, weight: 700, lineHeight: 1.0, tracking: "-0.02em", color: "navy" }
  heading-xl:{ fontFamily: "Space Grotesk", cqw: 5.0, weight: 700, lineHeight: 0.96, tracking: "-0.03em", color: "navy" }

spacing:
  slide-pad: "3.5cqw"
  gap-md: "1.6cqw"

components:
  light-panel:
    backgroundColor: "{colors.white}"
    border: "1px solid {colors.navy} at 8%"
    rounded: "18px (0.95cqw)"
    shadow: "0 24px 60px {colors.navy} at 10% — feather, never hard"
    description: "THE surface. Content floats on white panels above the porcelain ground."
  beam-rule:
    rule: "3px {colors.cobalt} line, 8-16cqw long, rounded caps"
    description: "The accent device: one cobalt beam under/beside the focal statement per scene."
  gold-tick:
    rule: "{colors.gold} for ONE secondary marker per scene — a stat delta, a check, a small underline"
    description: "Champagne restraint: gold never exceeds 5% of the frame."
  agenda-chip:
    backgroundColor: "{colors.cloud}"
    border: "1px solid {colors.navy} at 10%"
    rounded: "9999px"
    typography: "{typography.micro-label}"
    description: "Eyebrow/section chips — '01 — TRACTION' style numbered labels."
  keynote-grid:
    rule: "1px {colors.navy} at 4-5%, 96px grid, masked radially to the center"
    description: "Faint engineering grid grounding the stage."

## Composition rules

- LIGHT STAGE, DARK INK: every scene sits on porcelain/cloud; ALL text is navy
  (never mid-tones); cobalt is the single accent hue — one emphasized word, one
  beam-rule, or the stat number. Gold appears at most once per scene.
- Confidence is SPACE: generous margins, one dominant statement per scene,
  supporting metrics on light-panels beneath or beside it.
- Numbers are the heroes of a pitch: stat scenes render the number at
  stat-number scale in cobalt with the label in micro-label above it and the
  proof line in body below.
- Photos/screenshots sit inside light-panels with the feather shadow; tint any
  photo toward the palette with a cloud-colored scrim at 20-30%.

## 3D LAYER — SIGNATURE, REQUIRED (heavy Three.js identity)

This pack's identity is the **data constellation**: a full-duration Three.js
layer (per the WebGL adapter contract — `hf-seek` time only, procedural only,
pixelRatio 1) rendering 40-70 small navy/cobalt points connected by thin
cobalt lines that fade with distance, drifting VERY slowly in 3D with a gentle
camera parallax; 3-5 points glow gold. Points float behind the DOM panels like
the pitch's market map come alive. Alpha stays subtle (lines ≤0.18, points
≤0.6) — it is a backdrop, never the show. If the WebGL layer is unavailable,
the 2D canvas constellation (drifting node network) is the approved fallback.
At least one scene should ALSO stage a DOM element in 3D: a light-panel
entering with `rotationY 18→0` + `translateZ`, keynote-style.

## Scene treatments

- HOOK: heading-xl statement, one word cobalt, beam-rule draws in beneath;
  constellation visible in the upper third.
- TRACTION/STAT: giant cobalt count-up + gold delta tick; supporting metric
  chips stagger in on light-panels.
- PRODUCT: screenshot hero in a light-panel at ≥58% canvas, slow push-in,
  cobalt callout chips with connector lines.
- CLOSE/CTA: centered heading-lg + cobalt CTA pill (white text), constellation
  gently converging toward the center.

## Don't

- No dark grounds, no neon, no rainbow gradients — cobalt + gold ONLY.
- No hard drop shadows, no black borders; depth = feather shadow + parallax.
- Never more than one gold element per scene.
