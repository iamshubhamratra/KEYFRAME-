---
name: slow-pour
label: Slow Pour
orientation: landscape
form: longform
fontFamily: Alfa Slab One
---

# Slow Pour

Coffee. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f6ecdd` | the default ground |
| ink | `#231a15` | all type |
| accent | `#c4622c` | kickers, rules, emphasis — brandable |
| accent2 | `#6b8c7a` | the second voice — brandable |
| sageT | `#e6eee8` | tinted ground A, alternating |
| terraT | `#f7e0c8` | tinted ground B, alternating |
| desk | `#1d1512` | outside the frame |

## Type

Display **Alfa Slab One**, body **Karla**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["zoomIn","pushL","drop","pushR","zoomOut","hopU"]` at stride 5/1, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.6.

## World

Spiralling pour, blooming bubbles, drips, live scale — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
