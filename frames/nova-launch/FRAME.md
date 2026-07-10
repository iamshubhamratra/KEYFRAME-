---
version: alpha
name: Nova Launch — Frame (video / frame layer)
description: >
  A dark-stage product-launch system engineered to look cut by a senior motion
  designer. Deep-space ground, glowing electric-blue + solar-orange beams, and a
  LIVE DATA HUD on every scene — climbing bar charts, drawing trend lines,
  sweeping radial gauges, telemetry rings and kinetic counters — over a floating
  3D data constellation. Strobe-cut reveals, glowing display type, launch-night
  hype energy. Motion-dense but disciplined: one hero idea per scene, the data
  furniture orbits it.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  void: "#070A12"
  panel: "#0E1526"
  ink: "#EAF0FF"
  electric: "#3D7BFF"
  plasma: "#A65CFF"
  laser: "#1FE0B8"
  solar: "#FF7A3C"

typography:
  body:       { fontFamily: "Inter", cqw: 0.95, weight: 400, lineHeight: 1.5, color: "ink at 66%" }
  micro-label:{ fontFamily: "Inter", px: 12, weight: 600, tracking: "0.28em", upper: true, color: "electric" }
  data-tag:   { fontFamily: "Space Grotesk", px: 15, weight: 600, tracking: "0.14em", upper: true, color: "laser" }
  card-title: { fontFamily: "Space Grotesk", cqw: 1.3, weight: 700, lineHeight: 1.12, color: "ink" }
  heading-md: { fontFamily: "Space Grotesk", cqw: 2.3, weight: 700, lineHeight: 1.04, tracking: "-0.02em", color: "ink" }
  stat-number:{ fontFamily: "Space Grotesk", cqw: 4.6, weight: 800, lineHeight: 1.0, tracking: "-0.02em", color: "ink" }
  heading-lg: { fontFamily: "Space Grotesk", cqw: 3.9, weight: 800, lineHeight: 0.98, tracking: "-0.03em", color: "ink" }
  heading-xl: { fontFamily: "Space Grotesk", cqw: 5.6, weight: 800, lineHeight: 0.94, tracking: "-0.03em", color: "ink" }

spacing:
  slide-pad: "3.5cqw"
  gap-md: "1.5cqw"

components:
  beam-gradient:
    background: "linear 120deg {colors.electric} → {colors.plasma} → {colors.laser}"
    description: "THE signature sweep: a clipped fill on ONE headline word, a 2–3px glowing edge on panels, or a light-beam streak. Never on body text."
  hud-panel:
    backgroundColor: "{colors.panel} at 72%"
    border: "1px solid {colors.electric} at 22%"
    rounded: "18px (0.9cqw)"
    shadow: "0 30px 90px {colors.void} at 60%, inset 0 1px 0 {colors.ink} at 8%"
    description: "The product pedestal / data surface — screenshots, product art and charts float on it, backlit by the ground glow."
  solar-cta:
    backgroundColor: "{colors.solar}"
    color: "{colors.void}"
    rounded: "9999px"
    glow: "0 0 40px {colors.solar} at 55%"
    description: "The ONLY solar-orange element: the CTA pill (or one launch-date chip). Nothing else is solar — its heat comes from the restraint everywhere else."
  data-chip:
    backgroundColor: "{colors.electric} at 12%"
    border: "1px solid {colors.electric} at 34%"
    rounded: "9999px"
    typography: "{typography.data-tag}"
    description: "Spec / metric callouts — 'v2.0', '120 FPS', '+38% FASTER', 'SHIPS FRIDAY'. Pop in on back.out, glowing."
  glow-emphasis:
    rule: "the emphasis word glows in {colors.electric} with a soft text-shadow halo (0 0 .55em)"
    description: "The one word that carries the beam energy in a headline."

## Composition rules

- DEEP-SPACE GROUND + GLOWING TYPE: massive tight display headlines in near-white
  ink on the void ground; ONE word per headline glows electric (or carries the
  beam-gradient clip fill). Text is the largest thing in every frame.
- THE PRODUCT IS THE STAR: screenshots / product art at ≥60% of canvas on a
  hud-panel with an electric edge, camera pushing in; specs orbit it as data-chips
  connected by thin leader lines.
- LIVE DATA HUD, ALWAYS ON: every scene carries motion-graphics furniture in the
  MARGINS — corner HUD brackets that draw in, a scanning laser sweep crossing the
  frame, a slowly rotating telemetry ring, and on any proof/stat beat a climbing
  bar chart + a drawing trend line + a sweeping radial gauge. Kinetic counters
  tick up to their number. This is the pack's identity — never a bare scene.
- COLOR DISCIPLINE: electric-blue is the workhorse; plasma + laser are accents on
  charts, rings and streaks; solar-orange appears EXACTLY ONCE (the close CTA).
  The ground stays deep-space void — never flooded with color.
- MOTION IS EDITED, NOT BUSY: one hero idea per scene. The HUD orbits the hero in
  the margins; it never fights the headline. Every scene change is a strobe-flash
  cut with a chromatic streak — a real edit hiding the cut, never a bare fade.

## GRAPHS & DATA-VIZ — SIGNATURE, REQUIRED

Proof scenes (stats, "why it's better", benchmarks) MUST render real animated
data-viz, not decoration:

- CLIMBING BAR CHART: 5–7 bars growing from a baseline with a stagger (scaleY 0→1,
  transformOrigin bottom, power3.out), the final/tallest bar in electric, the rest
  dimmed — the launch's proof, abstracted.
- DRAWING TREND LINE: a polyline riding the bar tops, revealed by animating
  stroke-dashoffset to 0 (the classic "line draws itself"), in plasma or laser.
- RADIAL GAUGE / PROGRESS RING: a stroked circle arc sweeping via stroke-dashoffset
  to a target percentage (e.g. 25%→"75% faster", or closing fully on the CTA).
- KINETIC COUNTER: a number tweening from 0 to its target (countUp), snapped to
  integers, landing on the beat — pair it with a data-chip label.
Numbers come from the script; never invent metrics the storyboard didn't give.

## VECTOR FIELD — dense, animated

Every scene rides a shared animated vector layer: HUD corner brackets, a scanning
laser line, a dashed telemetry ring with an orbiting node, and a field of small
data dots joined by thin connector lines (the constellation echoed in the DOM).
Target 12–20 VISIBLE primitives per scene — real graphics, glowing, animated by
the GSAP timeline — not low-alpha dust.

## 3D LAYER — SIGNATURE (Three.js identity)

The ambient identity is a floating **3D data constellation**: a WebGL layer
(adapter contract — `hf-seek` time only, procedural geometry, pixelRatio 1) of
~54 drifting points joined by thin lines when close, a few brighter nodes in
electric/solar, rotating slowly and bobbing on t. It sits BEHIND the DOM product
+ HUD layers and glows against the void. 2D canvas fallback: a synthwave-horizon
perspective grid pulsing toward the vanishing point. At least one scene should
stage the product panel itself pushing in (scale 1.04→1) as the constellation
converges slightly behind it.

## Scene treatments

- HOOK/REVEAL: heading-xl with one glowing word; a radial gauge sweeps to ~75%
  in a lower corner; the scan sweep crosses; a strobe-flash opens the film.
- FEATURE: product hero at 60–74% in a hud-panel + 2–3 data-chips with leader
  lines; Ken Burns push across the UI; telemetry ring rotating.
- STAT/PROOF: carbon stat-number (or kinetic counter) center; climbing bar chart +
  drawing trend line in the margin; a data-chip labels the metric.
- CLOSE/CTA: "Available now" heading-lg + the ONE solar-cta pill; the progress
  ring closes to 100%; a compact particle burst fires and settles; constellation
  slows.

## Don't

- No flat fades between scenes (always the strobe-flash cut).
- No second solar-orange element — the CTA is the only one.
- Body text never glows or takes the beam gradient; the ground never floods with
  color; charts never show numbers the script didn't provide.
- No bare scene: if a beat has no product art, the HUD + a data-chip cluster fills
  it — never empty void.
