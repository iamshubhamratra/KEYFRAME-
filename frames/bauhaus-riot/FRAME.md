---
version: alpha
name: Bauhaus Riot — Frame
description: >
  A print poster that came alive. Cream paper with a faint dot grid, primary
  geometry — red, cobalt and signal yellow with hard black borders and offset
  shadows — and uppercase Archivo Black headlines that STAMP onto the page like
  a printing press. A print masthead frames every shot; scene changes are hard
  curtain wipes; shapes bounce, stickers slap, mistakes get a big red X. No
  gradients, no glow, no blur — ink on paper, moving. For launches, manifestos,
  sales and anything that should shout beautifully.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script
colors:
  paper: "#F4EEE1"
  cream: "#FFFDF6"
  ink: "#17161B"
  red: "#E4432C"
  blue: "#2B4BD7"
  yellow: "#F2C21F"
typography:
  body:       { fontFamily: "Inter", cqw: 0.95, weight: 600, lineHeight: 1.45 }
  kicker:     { fontFamily: "Space Grotesk", px: 14, weight: 700, tracking: "0.34em", upper: true, boxed: true }
  heading-lg: { fontFamily: "Archivo Black", cqw: 4.6, weight: 400, upper: true, tracking: "-0.01em" }
  heading-xl: { fontFamily: "Archivo Black", cqw: 8.0, weight: 400, upper: true, shadowOffset: "0.5cqw hard" }
atoms:
  stamp: >
    THE signature. Any element arrives big (scale ~1.9) and tilted a few
    degrees, then snaps flat with power4.in — a rubber stamp hitting paper.
    Headlines carry a hard offset text-shadow in red or blue.
  sticker: >
    Mono uppercase chip with a 0.22cqw ink border and a hard 0.45cqw offset ink
    shadow, slapped on slightly rotated, settling to ±2–3°.
  masthead: >
    Print chrome on every frame: cream chip logo top-left, boxed sheet counter
    top-right ("03 / 07"), small-caps folio line bottom center.
  xmark: >
    Two thick red strokes drawn over a rejected line, power3.in, then the line
    dims to 30%.
motion:
  wipe: "scene cuts are hard color-block curtain wipes — never a fade"
  bounce: "shapes drop with bounce.out and squash on landing"
  press: "buttons physically depress (y + shadow shrink) like a stamp"
never:
  - gradients, glows, soft shadows, blur entrances (this is PRINT)
  - lowercase display type
  - more than the three primaries + ink on one frame
---

# Bauhaus Riot

Reference render: `frame-showcase.html` (30s, 1920×1080).
