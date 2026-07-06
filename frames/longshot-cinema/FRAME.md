---
version: alpha
name: Longshot Cinema — Frame (video / frame layer)
description: >
  The one-take film system: every scene is a SET inside one continuous world
  and a single camera travels between them — dolly moves, parallax, micro
  push-ins, light sweeps, letterbox bars, film grain and a live timecode HUD.
  Graphite stage, tungsten-amber key light, beam-blue counter light, pop-up
  stat figures and animated product mocks. Built for trailers, hype reels and
  launch films that must read as a REAL film, never a slideshow.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  graphite: "#101318"
  void: "#06070A"
  stage: "#141922"
  inklight: "#F2F5F9"
  tungsten: "#FFB454"
  beam: "#4D9FFF"
  slate: "#8B94A7"

typography:
  body:      { fontFamily: "Inter", cqw: 0.95, weight: 400, lineHeight: 1.5, color: "inklight at 62%" }
  micro-label:{ fontFamily: "Inter", px: 12, weight: 600, tracking: "0.24em", upper: true, color: "tungsten" }
  card-title:{ fontFamily: "Space Grotesk", cqw: 1.3, weight: 700, lineHeight: 1.12, color: "inklight" }
  heading-md:{ fontFamily: "Space Grotesk", cqw: 2.3, weight: 800, lineHeight: 1.0, tracking: "-0.02em", color: "inklight" }
  stat-number:{ fontFamily: "Space Grotesk", cqw: 4.4, weight: 800, lineHeight: 1.0, tracking: "-0.02em", color: "tungsten" }
  heading-lg:{ fontFamily: "Space Grotesk", cqw: 3.8, weight: 800, lineHeight: 0.96, tracking: "-0.03em", color: "inklight" }
  heading-xl:{ fontFamily: "Space Grotesk", cqw: 5.2, weight: 800, lineHeight: 0.94, tracking: "-0.03em", color: "inklight" }

spacing:
  slide-pad: "3.5cqw"
  gap-md: "1.5cqw"

components:
  set-card:
    backgroundColor: "{colors.inklight} at 5%"
    border: "1px solid {colors.inklight} at 12%"
    rounded: "16px (0.85cqw)"
    shadow: "0 24px 60px rgba(0,0,0,.5)"
    description: "Stat cards, product windows, panels — frosted set pieces on the dark stage."
  hud-chip:
    border: "1px solid {colors.inklight} at 22%"
    backgroundColor: "{colors.inklight} at 6%"
    rounded: "9999px"
    typography: "{typography.micro-label}"
    description: "Eyebrows/badges: '02 · THE NUMBERS' — with a tungsten or beam dot."
  cinema-chrome:
    rule: "letterbox bars in {colors.void} (breathe open at the start), radial vignette, 5px film-grain dots at 5% opacity, and a live TC 00:00:SS:FF timecode chip top-right driven by the timeline"
    description: "THE identity — every frame reads as footage, not a slide."
  light-sweep:
    rule: "a skewed soft white band (7% opacity) sweeping the frame every ~3.5s; tungsten and beam gradient beams raking diagonally at 10%"
    description: "The set is LIT — light is always moving."
  gradient-word:
    rule: "ONE headline word clipped with linear-gradient(100deg, {colors.tungsten}, {colors.beam})"
    description: "The signature emphasis — used once per major statement."

## Composition rules — THE ONE-TAKE LAW

- SCENES ARE SETS, NOT SLIDES. Place scene content in one continuous world and
  TRAVEL the camera between sets (x-translate the world container ~1 canvas
  width with power3.inOut, ~1.0s) instead of fading scenes in and out. During
  every travel, far decorative layers lag ~12-15% for parallax.
- THE CAMERA NEVER SITS STILL: micro push-ins (scale 1.0→1.03, yoyo) inside
  every set; the frame must always be breathing.
- POP-UP FIGURES: numbers arrive as set-cards popping in with back.out, then
  COUNT UP; support with rising mini bar charts, ring gauges (stroke-dash
  sweep), star rows, and rotated badge chips (+312%, LIVE).
- PRODUCT AS FOOTAGE: build the product as an ANIMATED mock (browser window
  with progress bars filling, rows sliding in, an SVG trend line drawing,
  callout chips with connector lines) — never a static screenshot dump.
- Real screenshots get the set-card window treatment at ≥58% canvas with a
  camera push and 1-2 beam callouts.
- CINEMA CHROME on every frame: letterbox, vignette, grain, REC + live TC.
- Text: inklight only; tungsten for numbers/emphasis; beam for data/secondary;
  the gradient-word once per major headline. Nothing else is colored.

## Motion language

Entrances: word-stagger rises (y:60, rotation:4→0, power3.out, stagger .09);
cards back.out(1.6) with y+scale; badges back.out(2.2) with a small rotation
held. Draws: underlines/trend lines/ring gauges via stroke-dashoffset. The
finale: a confetti burst (8-12 hard squares/dots in tungsten/beam/inklight
radiating from the CTA) + a button pulse + a quiet "— FIN —" slate.

## Worked example

This pack ships `frame-showcase.html` — a complete 14s one-take film (title →
figures → product → CTA) that renders as-is. MATCH OR EXCEED its density and
continuity; reuse its camera-travel, HUD, counter and confetti patterns with
the script's real content.

## Don't

- No hard scene cuts/fades between static layouts — travel the camera.
- No light grounds, no third accent hue, no static frame longer than ~1s.
- Letterbox/TC/grain are not optional; without them it's just a dark slide.
