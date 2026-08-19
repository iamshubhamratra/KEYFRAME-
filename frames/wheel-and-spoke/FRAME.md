---
name: wheel-and-spoke
label: Wheel & Spoke
orientation: landscape
form: longform
fontFamily: Anton
---

# Wheel & Spoke

Cycling. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f0f2f4` | the default ground |
| ink | `#171c22` | all type |
| accent | `#f2c53d` | kickers, rules, emphasis — brandable |
| accent2 | `#2c6be0` | the second voice — brandable |
| sageT | `#e6eef2` | tinted ground A, alternating |
| terraT | `#f7ecd6` | tinted ground B, alternating |
| desk | `#12161c` | outside the frame |

## Type

Display **Anton**, body **Asap**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["pushL","pushR","spin","zoomIn","hopU","pushU"]` at stride 7/3, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 2.

## World

Two spinning spoked wheels, road dashes, climb profile — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
