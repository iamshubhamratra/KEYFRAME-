---
name: loft-notes
label: Loft Notes
orientation: landscape
form: longform
fontFamily: Righteous
---

# Loft Notes

Vinyl. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f2ebdd` | the default ground |
| ink | `#1a1420` | all type |
| accent | `#e0603c` | kickers, rules, emphasis — brandable |
| accent2 | `#3fb8a8` | the second voice — brandable |
| sageT | `#1f2a2a` | tinted ground A, alternating |
| terraT | `#2a1c22` | tinted ground B, alternating |
| desk | `#140f18` | outside the frame |

## Type

Display **Righteous**, body **Mulish**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["spin","pushL","zoomIn","pushD","pushR","hopU"]` at stride 5/2, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.8.

## World

Spinning platter, tracking tonearm, EQ bars, sleeve rack — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
