---
name: reef-tank
label: Reef Tank
orientation: landscape
form: longform
fontFamily: Outfit
---

# Reef Tank

Marine aquarium. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#eef4f2` | the default ground |
| ink | `#0b1c22` | all type |
| accent | `#ff8a5c` | kickers, rules, emphasis — brandable |
| accent2 | `#3fd0c4` | the second voice — brandable |
| sageT | `#123038` | tinted ground A, alternating |
| terraT | `#1c2630` | tinted ground B, alternating |
| desk | `#08181e` | outside the frame |

## Type

Display **Outfit**, body **Nunito Sans**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["zoomOut","pushU","drop","pushR","zoomIn","pushL"]` at stride 5/1, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.4.

## World

Fish schooling in a glass box, swaying anemones, bubbles — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
