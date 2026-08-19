---
name: steep-and-steam
label: Steep & Steam
orientation: landscape
form: longform
fontFamily: Marcellus
---

# Steep & Steam

Tea house. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f6f2e8` | the default ground |
| ink | `#232a20` | all type |
| accent | `#7a8c3f` | kickers, rules, emphasis — brandable |
| accent2 | `#a8763c` | the second voice — brandable |
| sageT | `#e8eee0` | tinted ground A, alternating |
| terraT | `#f6e8d6` | tinted ground B, alternating |
| desk | `#1b1f18` | outside the frame |

## Type

Display **Marcellus**, body **Mukta**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["zoomOut","pushU","zoomIn","pushL","drop","pushR"]` at stride 3/1, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.3.

## World

Pouring kettle arc, steam curls, leaves unfurling, timer — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
