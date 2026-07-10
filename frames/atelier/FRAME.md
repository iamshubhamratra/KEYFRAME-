---
version: alpha
name: Atelier — Frame (video / frame layer)
description: >
  An elegant EDITORIAL / fashion-house system. Warm ivory paper, espresso ink, one
  muted gold accent with soft terracotta, refined Fraunces serif display, and
  delicate continuous LINE-ART that draws itself — a single flowing contour, thin
  drawn rectangle frames, a fine rotating dashed ring, hairline dividers, small
  serif ornaments and oversized quotation marks. Minimal and quiet: lots of
  negative space, one refined idea per scene. The opposite of busy.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  ivory: "#F7F3EC"
  linen: "#EDE6DA"
  espresso: "#241E1A"
  gold: "#A98643"
  terracotta: "#C4674E"
  sage: "#8A9A7B"
  stone: "#B9AEA0"

typography:
  body:       { fontFamily: "Inter", cqw: 0.95, weight: 400, lineHeight: 1.6, color: "espresso at 70%" }
  micro-label:{ fontFamily: "Inter", px: 12, weight: 600, tracking: "0.34em", upper: true, color: "gold" }
  heading-md: { fontFamily: "Fraunces", cqw: 2.4, weight: 500, lineHeight: 1.08, color: "espresso" }
  heading-lg: { fontFamily: "Fraunces", cqw: 3.8, weight: 500, lineHeight: 1.02, color: "espresso" }
  heading-xl: { fontFamily: "Fraunces", cqw: 5.2, weight: 500, lineHeight: 0.98, color: "espresso" }

spacing:
  slide-pad: "6cqw"
  gap-md: "1.5cqw"

components:
  contour-line:
    rule: "ONE continuous thin gold line that draws itself across the frame (an abstract wave / leaf / ribbon)"
    description: "The signature motif — elegance through a single confident stroke."
  drawn-frame:
    rule: "a thin rectangle border that draws corner-to-corner around content"
    description: "Editorial framing; hairline weight, gold or espresso."
  fine-ring / ornament:
    rule: "a small fine dashed ring turning slowly; serif asterisks / a large ' quotation mark"
    description: "Quiet accents in the margins."
  gold-underline:
    rule: "the emphasis word gets a thin gold underline that grows in"

## Composition rules

- QUIET & REFINED: generous negative space, one idea per scene, centred serif
  display in espresso on ivory. Never crowd the frame.
- LINE, NOT FILL: the graphics are thin drawn LINES (contour, frames, rings), not
  bold shapes — the whole language is hairline elegance.
- ONE GOLD ACCENT: gold leads, terracotta is the rare second note; sage + stone are
  whisper-quiet. No saturated colour blocks.
- SLOW & GRACEFUL motion: draw-on lines, soft washes between scenes, gentle drifts.
- NO dashboards, kicker chips, giant counting numbers or confetti — restraint is
  the brand.

## Scene treatments

- HOOK: heading-xl centred; the contour line draws across behind it; a drawn frame
  settles; a fine ring turns in a corner.
- FEATURE / PROOF: heading-md; a single thin line CHART draws itself (elegant, one
  stroke); a hairline divider; a serif ornament.
- CLOSE / CTA: heading-lg + a thin outlined CTA; the contour line completes; a small
  gold ornament punctuates.

## Don't

- No bold fills, hard shadows, gradients-as-walls, dashboards or loud colour.
- Emphasis is a thin gold underline, never a filled box or gradient.
- If in doubt, remove — the elegance is in what isn't there.
