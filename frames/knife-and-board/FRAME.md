---
name: knife-and-board
label: Knife & Board
orientation: landscape
form: longform
fontFamily: Bitter
---

# Knife & Board

Cooking. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f7efe2` | the default ground |
| ink | `#241c18` | all type |
| accent | `#c33f34` | kickers, rules, emphasis — brandable |
| accent2 | `#5c7a3a` | the second voice — brandable |
| sageT | `#e7ecdd` | tinted ground A, alternating |
| terraT | `#f8e0cf` | tinted ground B, alternating |
| desk | `#1c1614` | outside the frame |

## Type

Display **Bitter**, body **Figtree**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["pushL","zoomIn","pushD","pushR","hopU","zoomOut"]` at stride 5/3, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.8.

## World

Chopping knife, flying herbs, simmering pot with steam — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
