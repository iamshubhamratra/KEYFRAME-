---
name: tide-table
label: Tide Table
orientation: landscape
form: longform
fontFamily: Chonburi
---

# Tide Table

Coast / sea swimming. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f6f1e2` | the default ground |
| ink | `#14262e` | all type |
| accent | `#e8763c` | kickers, rules, emphasis — brandable |
| accent2 | `#2c8c9e` | the second voice — brandable |
| sageT | `#e2eeec` | tinted ground A, alternating |
| terraT | `#f8e4cd` | tinted ground B, alternating |
| desk | `#0e2028` | outside the frame |

## Type

Display **Chonburi**, body **Prompt**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["pushL","zoomOut","pushU","drop","pushR","zoomIn"]` at stride 5/2, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.5.

## World

Four wave layers, spinning parasol, gulls, sun glare — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
