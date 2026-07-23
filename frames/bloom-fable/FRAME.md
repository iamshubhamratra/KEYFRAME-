---
version: alpha
name: Bloom Fable — Frame
description: >
  A pastel storybook meadow. Cream skies over layered sage hills, a smiling
  paper sun with rotating rays, drifting clouds and swaying grass. Fraunces
  serif headlines with a coral heart; hand-drawn botanical vectors that
  literally GROW — stems draw on, leaves unfurl from their joint, petals bloom
  with an elastic pop, a butterfly flaps across on a sine path. Gentle, warm
  and optimistic; motion is organic — draw-ons, blooms and sways, never
  mechanical. For wellness, education, community, gifts and gentle products.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script
colors:
  cream: "#FBF4E8"
  plum: "#46345A"
  coral: "#E8705F"
  sage: "#7FA876"
  sun: "#F2B95C"
  sky: "#A9D7E8"
  blush: "#F3C5BB"
typography:
  body:       { fontFamily: "Inter", cqw: 0.95, weight: 600, lineHeight: 1.5 }
  script:     { fontFamily: "Fraunces", italic: true, cqw: 1.9, weight: 500, color: "coral" }
  heading-md: { fontFamily: "Fraunces", cqw: 4.2, weight: 600, lineHeight: 1.06 }
  heading-lg: { fontFamily: "Fraunces", cqw: 6.4, weight: 600, lineHeight: 1.04 }
atoms:
  meadow: >
    The persistent stage: two/three layered hill paths at the frame's foot,
    grass blades that sway on bottom pivots, a sun (disc + 8 rays) top-left,
    two drifting ellipse-cluster clouds.
  grow: >
    THE signature. Botanical art assembles live: stem paths draw via
    pathLength dashoffset, leaves scale from their stem joint (back.out),
    petals bloom around the heart with elastic.out and constant per-petal
    rotation (never an SVG rotate attr under GSAP).
  leaf-tag: >
    A chip with a leaf-shaped corner (border-radius 999px 999px 999px 0.3cqw)
    that sprouts from its bottom-left origin.
  ribbon: >
    A notched banner (clip-path) that unfurls scaleX from the left.
motion:
  draw-on: "strokes use pathLength=100 dashoffset; nothing pops without growing"
  bloom: "elastic scale from the organic origin (joint, heart, ground)"
  sway: "everything idle breathes — rotation/y sine yoyo, finite repeats"
never:
  - hard shadows or neon; keep everything sun-lit and soft
  - mechanical easing (power4.in slams) on organic elements
---

# Bloom Fable

Reference render: `frame-showcase.html` (30s, 1920×1080).
