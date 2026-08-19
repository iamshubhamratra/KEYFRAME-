---
name: canopy
label: Canopy
orientation: landscape
form: longform
fontFamily: Vollkorn
---

# Canopy

Rainforest. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#eef0e2` | the default ground |
| ink | `#16241c` | all type |
| accent | `#d98c2c` | kickers, rules, emphasis — brandable |
| accent2 | `#3f8c5f` | the second voice — brandable |
| sageT | `#e4ece2` | tinted ground A, alternating |
| terraT | `#f4e6cf` | tinted ground B, alternating |
| desk | `#0f1a14` | outside the frame |

## Type

Display **Vollkorn**, body **Alegreya Sans**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["zoomIn","pushD","hopU","pushL","zoomOut","pushR"]` at stride 5/1, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.5.

## World

Swaying leaf layers, light shafts, drips, hanging vine — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
