---
name: kiln-fire
label: Kiln Fire
orientation: landscape
form: longform
fontFamily: Gloock
---

# Kiln Fire

Ceramics. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f3ebde` | the default ground |
| ink | `#241d17` | all type |
| accent | `#c2562c` | kickers, rules, emphasis — brandable |
| accent2 | `#5f8c8c` | the second voice — brandable |
| sageT | `#e6eeee` | tinted ground A, alternating |
| terraT | `#f7e2d2` | tinted ground B, alternating |
| desk | `#231b16` | outside the frame |

## Type

Display **Gloock**, body **Schibsted Grotesk**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["zoomOut","pushL","hopU","pushR","zoomIn","drop"]` at stride 3/1, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.5.

## World

Wobbling wheel with rising pot, glowing kiln, bending cone — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
