---
name: night-shift
label: Night Shift
orientation: landscape
form: longform
fontFamily: Unbounded
---

# Night Shift

24h bakery / night city. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#e8e9f0` | the default ground |
| ink | `#0d1018` | all type |
| accent | `#f2b03c` | kickers, rules, emphasis — brandable |
| accent2 | `#8c6aff` | the second voice — brandable |
| sageT | `#141c22` | tinted ground A, alternating |
| terraT | `#1c1620` | tinted ground B, alternating |
| desk | `#0b0d14` | outside the frame |

## Type

Display **Unbounded**, body **Wix Madefor Text**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["pushR","zoomIn","pushU","pushL","drop","zoomOut"]` at stride 5/1, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.6.

## World

Windows lighting at random, delivery van, sweeping clock — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
