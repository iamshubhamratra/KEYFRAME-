---
version: alpha
name: Riso Press — Frame (video / frame layer)
description: >
  A bold RISOGRAPH PRINT POSTER system. Warm newsprint paper, fluorescent pink and
  electric blue spot inks that overprint, a live halftone-dot texture, giant
  condensed Anton poster type set hard-LEFT, and cut-paper graphic shapes —
  registration crosses, overprint circles, block arrows, hand-cut starbursts,
  ticket stamps. Flat, no gradients: solid ink fills and hard edges only. Reads
  like a screen-printed gig poster that moves.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  paper: "#F3ECDD"
  smoke: "#E4DAC6"
  ink: "#1A1714"
  risopink: "#FF3E6C"
  risoblue: "#3A5BFF"
  risoyellow: "#FFC21A"
  risoteal: "#12A594"

typography:
  body:       { fontFamily: "Inter", cqw: 0.95, weight: 500, lineHeight: 1.5, color: "ink at 80%" }
  micro-label:{ fontFamily: "Inter", px: 12, weight: 700, tracking: "0.3em", upper: true, color: "risopink" }
  heading-md: { fontFamily: "Anton", cqw: 3.0, weight: 400, lineHeight: 0.92, upper: true, color: "ink" }
  heading-lg: { fontFamily: "Anton", cqw: 5.2, weight: 400, lineHeight: 0.88, upper: true, color: "ink" }
  heading-xl: { fontFamily: "Anton", cqw: 7.0, weight: 400, lineHeight: 0.85, upper: true, color: "ink" }

spacing:
  slide-pad: "5cqw"
  gap-md: "1.5cqw"

components:
  overprint-circle:
    rule: "two big flat spot-ink circles (pink + blue) that overlap; the overlap reads as a third mixed ink"
    description: "The signature poster mark — a huge graphic shape behind or beside the type."
  reg-mark:
    rule: "a thin crosshair + circle registration mark in the corners (print alignment target)"
    description: "Print-shop authenticity; drawn in ink at low weight."
  block-arrow / starburst:
    rule: "hard-edged solid arrows and many-point starbursts in a single spot ink"
    description: "Directional energy and 'callout' bursts — cut-paper, no gradients."
  bracket-word:
    rule: "the emphasis word is wrapped in [ square brackets ] in the second spot ink"

## Composition rules

- FLAT PRINT: solid ink fills, hard edges, NO gradients or blurs. Colour comes from
  overprinting two spot inks, never from a gradient.
- HARD-LEFT POSTER TYPE: giant condensed Anton headlines set flush-left, ALL CAPS,
  tight leading, stacked — the loudest thing in the frame.
- SPOT-INK DISCIPLINE: pink + blue are the workhorses; yellow + teal accent shapes
  and bursts. The paper ground shows through everywhere (that's the print).
- HALFTONE LIVES: the background is an animated halftone dot field — the poster
  breathing.
- NO generic dashboards, no kicker chips, no giant counting numbers — this is a
  poster, not a slide.

## Scene treatments

- HOOK: heading-xl flush-left; a huge overprint circle behind/beside it; a starburst
  and a block arrow snap in; registration marks in the corners.
- FEATURE / PROOF: heading-md; a bold BLOCK bar chart (thick solid bars, spot inks)
  or a stamped ticket; shapes wipe in on the hard cut.
- CLOSE / CTA: heading-lg + a stamped/ticket CTA; a big arrow points; starbursts pop.

## Don't

- No gradients, glows, soft shadows or dashboard mock-UIs.
- Emphasis word is bracketed, never gradient-filled.
- Keep the paper visible — never flood the frame with solid ink.
