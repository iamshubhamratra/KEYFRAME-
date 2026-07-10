---
version: alpha
name: Lumen Motion — Frame (video / frame layer)
description: >
  A bright, friendly animated-EXPLAINER system. Warm paper ground, a playful
  coral/indigo/teal/amber palette, rounded Bricolage display type, and — the whole
  point — DENSE HAND-DRAWN ANIMATED VECTORS that carry the story: a rocket that
  launches, a real line graph whose points pop in one-by-one and then connect, gears
  that turn, checkmarks that draw themselves, a cursor that clicks, confetti that
  bursts. Every scene is full, moving, and explains itself with motion graphics —
  no dead space, no bare text.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  paper: "#FFF7EF"
  cloud: "#FFEDE0"
  ink: "#241A33"
  coral: "#FF5A6E"
  indigo: "#6C5CE7"
  teal: "#12B7A6"
  amber: "#FFB020"

typography:
  body:       { fontFamily: "Inter", cqw: 0.95, weight: 500, lineHeight: 1.5, color: "ink at 72%" }
  micro-label:{ fontFamily: "Inter", px: 12, weight: 700, tracking: "0.22em", upper: true, color: "coral" }
  card-title: { fontFamily: "Bricolage Grotesque", cqw: 1.4, weight: 700, lineHeight: 1.1, color: "ink" }
  heading-md: { fontFamily: "Bricolage Grotesque", cqw: 2.4, weight: 700, lineHeight: 1.02, tracking: "-0.01em", color: "ink" }
  stat-number:{ fontFamily: "Bricolage Grotesque", cqw: 5.0, weight: 800, lineHeight: 1.0, tracking: "-0.02em", color: "coral" }
  heading-lg: { fontFamily: "Bricolage Grotesque", cqw: 4.2, weight: 800, lineHeight: 0.98, tracking: "-0.02em", color: "ink" }
  heading-xl: { fontFamily: "Bricolage Grotesque", cqw: 5.8, weight: 800, lineHeight: 0.94, tracking: "-0.02em", color: "ink" }

spacing:
  slide-pad: "3.5cqw"
  gap-md: "1.5cqw"

components:
  boxed-word:
    rule: "the emphasis word sits in a solid coral (or indigo) rounded pill, paper-white text — the highlighted term the eye lands on"
    description: "One highlighted word per headline; alternates coral/indigo by scene."
  chip:
    backgroundColor: "{colors.coral} at 12%"
    border: "1.5px solid {colors.coral} at 40%"
    rounded: "9999px"
    typography: "{typography.micro-label}"
    description: "Spec / step callouts — 'STEP 1', 'FREE', 'NEW'. Pop in on back.out."
  shape-confetti:
    rule: "bold, FILLED accent shapes — circles, rings, triangles, plus-signs, squares, stars, squiggles — in coral/indigo/teal/amber"
    description: "Scattered in the margins, popping in then floating/rotating gently. The frame is never empty."
  soft-card:
    backgroundColor: "{colors.cloud}"
    rounded: "22px"
    shadow: "0 20px 50px {colors.ink} at 10%"
    description: "The friendly surface product art / illustrations sit on."

## Composition rules

- LIGHT & FRIENDLY: warm paper ground, deep-plum ink, bold saturated accents. The
  mood is cheerful and premium, never dark or techy.
- FULL FRAME, ALWAYS: every scene fills the frame — a hero animated vector on one
  side or the lower band, a floating shape field in the margins, chips and flow
  lines. NEVER a headline alone on empty paper.
- MOTION EXPLAINS: the animated vectors aren't decoration, they narrate — a rocket
  for launch, a rising line graph for growth, gears for how-it-works, checkmarks for
  benefits, a clicking cursor for the CTA. Match the vector to the scene's idea.
- ONE HIGHLIGHT PER HEADLINE: the key word sits in a coral/indigo boxed pill; the
  rest is ink. Headlines are big, rounded, bouncy (spring entrance).
- COLOR IS JOYFUL BUT ORDERED: coral leads, indigo supports, teal + amber accent the
  charts/shapes. The paper ground never gets flooded.

## HAND-DRAWN ANIMATED VECTORS — the signature (REQUIRED, dense)

Author real, animated SVG per scene — drawn on (stroke-dashoffset), popped in
(back.out), and looped (float / rotate / blink). Target 14–22 visible animated
primitives per scene. The library:

- ROCKET (hook): body + nose + fins + window + a flickering flame and puff trail —
  it rises with a little wobble; speed-lines and a star burst on lift-off.
- LINE GRAPH THAT JOINS POINTS (stat/proof): an axis, then 5–7 nodes POP IN one by
  one at rising heights, then line segments DRAW between consecutive nodes to
  connect them, then a soft area fill sweeps in beneath — a graph building itself.
  Pair with a kinetic counter (countUp) and a boxed metric chip.
- GEARS (how-it-works): 2–3 interlocking gears turning at linked speeds.
- CHECKLIST (benefits): rows slide in; a checkmark draws itself in each with a pop.
- FLOW LINE: a dotted path from A to B with a dot travelling along it (connective
  tissue between ideas).
- CURSOR + CONFETTI (CTA): an arrow cursor slides to the button and clicks (a scale
  pulse); a burst of colored shapes fires out and settles; an arrow curves to the CTA.
- SHAPE-CONFETTI FIELD (all scenes): bold accent shapes scattered in the margins,
  popping in then drifting/rotating — fills the frame with life.

## Scene treatments

- HOOK: heading-xl with one boxed word; the ROCKET lifts off on the right; shapes
  burst in; a chip ('NEW' / 'v2.0'). A hard color-block push cut opens it.
- FEATURE / HOW: heading-md; GEARS turning + a CHECKLIST drawing in + a flow line;
  soft-card with product art if provided.
- STAT / PROOF: a big coral stat-number or kinetic counter; the LINE GRAPH builds
  itself across the lower band, points connecting; a metric chip.
- CTA: heading-lg + the button; CURSOR clicks it; CONFETTI bursts; an arrow points.

## Don't

- No dark or techy backgrounds; no bare text on empty paper; no low-alpha "dust"
  pretending to be graphics — vectors are bold and filled.
- No graph numbers the script didn't provide; confetti/rocket stay in the margins or
  lower band so the headline is always the largest, most legible thing.
- Never more than one boxed highlight word per headline.
