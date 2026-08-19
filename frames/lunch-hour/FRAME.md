---
name: lunch-hour
label: Lunch Hour
orientation: landscape
form: longform
fontFamily: Archivo Black
---

# Lunch Hour

Office lunch. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f2f1ec` | the default ground |
| ink | `#1d2126` | all type |
| accent | `#f26b3c` | kickers, rules, emphasis — brandable |
| accent2 | `#2c7a6b` | the second voice — brandable |
| sageT | `#e4ecea` | tinted ground A, alternating |
| terraT | `#f7e4d8` | tinted ground B, alternating |
| desk | `#171a1e` | outside the frame |

## Type

Display **Archivo Black**, body **Archivo**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["pushR","zoomIn","pushU","pushL","spin","drop"]` at stride 7/1, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.9.

## World

Sweeping clock, bento grid filling, queue of dots — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
