---
name: rope-and-round
label: Rope & Round
orientation: landscape
form: longform
fontFamily: Archivo Black
---

# Rope & Round

Boxing gym. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f2f0ec` | the default ground |
| ink | `#17171a` | all type |
| accent | `#e03a3a` | kickers, rules, emphasis — brandable |
| accent2 | `#c9a52c` | the second voice — brandable |
| sageT | `#e6e8ea` | tinted ground A, alternating |
| terraT | `#f6e0e0` | tinted ground B, alternating |
| desk | `#141416` | outside the frame |

## Type

Display **Archivo Black**, body **Archivo**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["pushR","zoomIn","spin","pushL","hopU","drop"]` at stride 7/2, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 2.

## World

Swinging heavy bag, skipping-rope arc, ring ropes, bell — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
