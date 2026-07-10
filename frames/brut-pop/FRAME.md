---
version: alpha
name: Brut Pop — Frame (video / frame layer)
description: >
  Loud NEUBRUTALIST sticker-pop. Bright paper, pure-black ink and thick black
  outlines, bold FLAT electric-blue / hot-pink / acid-yellow fills with HARD offset
  shadows (no blur), and chunky rotated stickers — star badges, NEW! tags, speech
  bubbles, lightning bolts, fat block arrows and checkmark stamps — that snap in
  and wobble. Heavy Archivo Black type, ALL CAPS, boxed highlight words. Playful,
  high-contrast, in-your-face.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  paper: "#FFFDF5"
  cloud: "#FFF3D6"
  ink: "#111111"
  blue: "#2B4FF5"
  pink: "#FF4FA3"
  yellow: "#FFE14D"
  mint: "#12C29B"

typography:
  body:       { fontFamily: "Inter", cqw: 0.95, weight: 700, lineHeight: 1.45, color: "ink" }
  micro-label:{ fontFamily: "Archivo Black", px: 13, weight: 400, tracking: "0.12em", upper: true, color: "ink" }
  heading-md: { fontFamily: "Archivo Black", cqw: 2.6, weight: 400, lineHeight: 1.0, upper: true, color: "ink" }
  heading-lg: { fontFamily: "Archivo Black", cqw: 4.4, weight: 400, lineHeight: 0.96, upper: true, color: "ink" }
  heading-xl: { fontFamily: "Archivo Black", cqw: 6.0, weight: 400, lineHeight: 0.92, upper: true, color: "ink" }

spacing:
  slide-pad: "4cqw"
  gap-md: "1.4cqw"

components:
  sticker:
    rule: "a bold flat shape (star/badge/bubble/bolt/tag) with a 3–4px BLACK outline and a HARD offset shadow (solid black, no blur, offset ~8px)"
    description: "The whole language — everything is a sticker that snaps in and wobbles."
  boxed-word:
    rule: "the emphasis word sits in a solid accent box with a black outline + hard shadow, paper text"
  fat-arrow:
    rule: "a thick black-outlined block arrow pointing at the CTA or a sticker"
  checkmark-stamp:
    rule: "a bold outlined circle with a chunky checkmark stamping in"

## Composition rules

- HIGH-CONTRAST & FLAT: bright paper, black ink, bold flat accent fills. NO
  gradients or soft shadows — shadows are SOLID BLACK, hard-edged, offset.
- EVERYTHING IS A STICKER: badges, tags, bubbles, bolts, arrows — all with thick
  black outlines and hard offset shadows, rotated a few degrees, snapping in with a
  bouncy overshoot then a small wobble.
- HEAVY CAPS TYPE: Archivo Black headlines, ALL CAPS, centred, with ONE boxed
  highlight word (accent box + black outline + hard shadow).
- BOLD COLOUR, USED LOUD: blue + pink lead, yellow + mint accent the stickers. Full
  saturation, no tints.
- NO dashboards, kicker chips, giant counting numbers or soft glows.

## Scene treatments

- HOOK: heading-xl centred with a boxed word; star badge + NEW! tag + lightning
  bolts snap in around it; a fat arrow.
- FEATURE / PROOF: heading-md; a bordered BAR chart with hard shadows, or checkmark
  stamps in a list; speech bubbles pop.
- CLOSE / CTA: heading-lg + a boxed CTA sticker; fat arrow points at it; a burst of
  stickers wobble in.

## Don't

- No gradients, blurs, soft shadows, dashboards or muted colour.
- Emphasis is a boxed sticker word, never gradient or underline.
- Outlines and offset shadows are mandatory on every sticker — that's the look.
