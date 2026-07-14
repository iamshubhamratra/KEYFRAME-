---
version: alpha
name: Bright Life — Luminous bright-cinematic launch film
description: >
  The bright flagship — a luminous launch-film system that reaches past Apple /
  Stripe / Linear / Framer / OpenAI marketing videos while never going dark. A
  native Three.js scene on an airy white canvas washed with soft pastel mesh
  gradients: floating gradient orbs with Gaussian blur, translucent glass shapes,
  a slow gradient torus and floating rings drifting in real depth; white
  glassmorphic product cards holding live dashboards presented with parallax; a
  cinematic camera that pushes in on the reveal, parallaxes across the features
  and pulls back on the CTA. Space Grotesk display type reveals word-by-word with
  an indigo-to-violet gradient highlight. It should feel handcrafted by an elite
  motion studio — optimistic, premium, future-ready — never a slideshow, never dark.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 supported
principle: bright optimism · clarity over decoration · every frame alive · the camera guides the eye

colors:
  ground: "#FFFFFF"
  ground-2: "#F5F6FF"
  ink: "#111827"
  muted: "#6B7280"
  indigo: "#6366F1"
  violet: "#8B5CF6"
  blue: "#3B82F6"
  cyan: "#06B6D4"
  pink: "#EC4899"
  green: "#10B981"
  amber: "#F59E0B"
  purple: "#A855F7"

typography:
  body:     { fontFamily: "Inter", cqw: 0.95, weight: 500, lineHeight: 1.5, color: "muted" }
  kicker:   { fontFamily: "JetBrains Mono", px: 13, weight: 500, tracking: "0.22em", upper: true, color: "indigo" }
  headline: { fontFamily: "Space Grotesk", cqw: 4.8, weight: 700, lineHeight: 1.0, tracking: "-0.03em", color: "ink" }
  hero:     { fontFamily: "Space Grotesk", cqw: 6.4, weight: 700, lineHeight: 0.96, tracking: "-0.035em", color: "ink" }
  metric:   { fontFamily: "Space Grotesk", cqw: 7.2, weight: 700, lineHeight: 1.0, tracking: "-0.03em", color: "indigo" }

components:
  glass-card:
    rule: "product surfaces float on a WHITE glassmorphic card — 24–32px radius, 1px indigo hairline border rgba(99,102,241,0.10), a soft floating shadow 0 20px 60px rgba(99,102,241,0.12), 20–30px backdrop blur, sized to the asset's real aspect ratio"
    description: "THE identity — the product is presented on light glass, never pasted onto a slide, never on a black plate."
  pastel-field:
    rule: "an airy WHITE ground washed with 3–4 large, soft, slowly drifting pastel mesh-gradient blobs (indigo / violet / cyan / pink), plus floating gradient orbs with Gaussian blur; the background is bright and calm, never noisy, never dark"
    description: "The bright room the product lives in — optimism as atmosphere."
  floating-3d:
    rule: "translucent glass shapes — spheres, a gradient torus, floating rings, rounded cubes and capsules — drift slowly at varied depth in every scene; something is always moving"
    description: "Depth and life without heaviness — soft, pastel, expensive."
  camera:
    rule: "one cinematic move per scene — push-in on the hook and product reveal, parallax across the features, a gentle orbit on the benefits, a pull-back on the CTA; smooth easeInOutExpo, subtle handheld drift, shallow depth"
    description: "The camera does the emphasis; cuts are soft gradient glow-wipes."
  chrome:
    rule: "a persistent mono catalogue label (bottom-left), a live scene counter 01 / 06 (bottom-right), and a thin indigo→violet progress rule that grows with the timeline"
    description: "The designed-system tell — quiet furniture that frames the film."

emphasis:
  rule: "the highlighted word carries an indigo→violet→purple gradient fill (#6366F1 → #8B5CF6 → #A855F7) with a soft indigo glow; everything else is ink #111827 on white. One accent family focuses each frame."

motion:
  range: "280–660ms, easeInOutExpo / power-curve, staggered — one element enters at a time"
  law: "animate the identity element (a word rises with a blur, a ring draws, a numeral counts up, the camera dollies) — never a generic slide. Prefer depth reveals, parallax, light sweeps, morph transitions. Avoid bounce, cartoon elastic, random rotation."

layout:
  rule: "12-column premium grid; asymmetric 60/40 or 70/30 — headline lower-left, product card upper-right so they never occlude; hook and CTA are hero-centered. 40–55% breathing space but never a barren region larger than ~20% of the frame — orbs, glass shapes and chips keep every zone alive."

acts:
  - hook: big fit-to-measure headline over the pastel field, mono kicker + rule stub, floating orb, slow camera push-in
  - problem: interior headline lower-left, a tilted glass card drifting, parallax pan, ambient orbs
  - solution: the hero product card on white glass presented upper-right, camera dolly-in, glow rim
  - features: a staggered cluster of glass product cards at varied depth, camera parallax
  - benefits: a count-up metric with a live chart card, a gentle orbit
  - cta: brand + tagline centered, a glass gradient Get Started button, website + social, camera pull-back
---

# Bright Life

The bright benchmark. Where the dark **flagship** is a midnight launch film, Bright Life is
its daylight sibling — the same cinematic depth, camera and glass-card product presentation,
rendered on a luminous white canvas with soft pastel gradients. It should read as clarity,
optimism, momentum, innovation, trust and sophistication: *advanced, but simple.*

Atoms are sacred (white ground, the pastel palette, Space Grotesk display, the indigo→violet
highlight, the mono chrome); composition is free within the six-act launch grammar above.
Never dark. Never a slide deck. Every frame alive.
