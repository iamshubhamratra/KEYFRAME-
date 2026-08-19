---
name: blitz-hour
label: Blitz Hour
orientation: landscape
form: longform
fontFamily: DM Serif Display
---

# Blitz Hour

Chess. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f0e9da` | the default ground |
| ink | `#1c1813` | all type |
| accent | `#b3452e` | kickers, rules, emphasis — brandable |
| accent2 | `#4d6b8c` | the second voice — brandable |
| sageT | `#e6eae4` | tinted ground A, alternating |
| terraT | `#f6e2d4` | tinted ground B, alternating |
| desk | `#14120f` | outside the frame |

## Type

Display **DM Serif Display**, body **DM Sans**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["zoomIn","pushR","spin","pushL","drop","pushU"]` at stride 5/3, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.8.

## World

Knight hopping L-moves, fast clock with falling flag — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
