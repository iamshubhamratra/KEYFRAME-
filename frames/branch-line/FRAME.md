---
name: branch-line
label: Branch Line
orientation: landscape
form: longform
fontFamily: Staatliches
---

# Branch Line

Steam railway. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f0ecdd` | the default ground |
| ink | `#1d2420` | all type |
| accent | `#a83a2c` | kickers, rules, emphasis — brandable |
| accent2 | `#3f6b5f` | the second voice — brandable |
| sageT | `#e4ece4` | tinted ground A, alternating |
| terraT | `#f6e2d6` | tinted ground B, alternating |
| desk | `#1a1f1c` | outside the frame |

## Type

Display **Staatliches**, body **Onest**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["pushL","pushR","zoomIn","hopU","zoomOut","drop"]` at stride 3/2, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.6.

## World

Loco crossing with steam, semaphore arm, telegraph poles — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
