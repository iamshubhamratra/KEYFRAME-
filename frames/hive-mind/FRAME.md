---
name: hive-mind
label: Hive Mind
orientation: landscape
form: longform
fontFamily: Fredoka
---

# Hive Mind

Beekeeping. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#fdf4dd` | the default ground |
| ink | `#33280f` | all type |
| accent | `#e0a92c` | kickers, rules, emphasis — brandable |
| accent2 | `#7a8c3f` | the second voice — brandable |
| sageT | `#eceedc` | tinted ground A, alternating |
| terraT | `#faead0` | tinted ground B, alternating |
| desk | `#2e2410` | outside the frame |

## Type

Display **Fredoka**, body **Quicksand**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["hopU","pushR","zoomIn","pushL","drop","zoomOut"]` at stride 3/1, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.7.

## World

Comb cells filling, bees on figure-eights, smoker — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
