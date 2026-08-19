---
name: field-of-view
label: Field of View
orientation: landscape
form: longform
fontFamily: Prata
---

# Field of View

Astronomy. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#e9e6f2` | the default ground |
| ink | `#080b16` | all type |
| accent | `#e0c46b` | kickers, rules, emphasis — brandable |
| accent2 | `#7a8ad0` | the second voice — brandable |
| sageT | `#101828` | tinted ground A, alternating |
| terraT | `#181022` | tinted ground B, alternating |
| desk | `#06080f` | outside the frame |

## Type

Display **Prata**, body **Manrope**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["zoomOut","drop","pushL","zoomIn","pushU","pushR"]` at stride 5/3, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.3.

## World

Twinkling stars, constellation drawing, rotating dome, meteors — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
