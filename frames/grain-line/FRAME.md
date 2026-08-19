---
name: grain-line
label: Grain Line
orientation: landscape
form: longform
fontFamily: Cardo
---

# Grain Line

Hand woodwork. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f4ead8` | the default ground |
| ink | `#251b13` | all type |
| accent | `#b06a2c` | kickers, rules, emphasis — brandable |
| accent2 | `#5f7a5f` | the second voice — brandable |
| sageT | `#e8eee2` | tinted ground A, alternating |
| terraT | `#f7e2c8` | tinted ground B, alternating |
| desk | `#241a12` | outside the frame |

## Type

Display **Cardo**, body **Barlow**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["pushL","zoomIn","pushD","hopU","pushR","zoomOut"]` at stride 3/1, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.5.

## World

Plane throwing shavings, sawdust, dovetails cutting, clamps — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
