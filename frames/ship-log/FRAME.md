---
name: ship-log
label: Ship Log
orientation: landscape
form: longform
fontFamily: Space Grotesk
---

# Ship Log

Dev tooling / CI. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#e6edf3` | the default ground |
| ink | `#0d1117` | all type |
| accent | `#4ad2a0` | kickers, rules, emphasis — brandable |
| accent2 | `#6a8cff` | the second voice — brandable |
| sageT | `#161d24` | tinted ground A, alternating |
| terraT | `#1a1620` | tinted ground B, alternating |
| desk | `#0b0f14` | outside the frame |

## Type

Display **Space Grotesk**, body **IBM Plex Sans**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["zoomIn","pushL","pushD","pushR","zoomOut","spin"]` at stride 3/1, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.6.

## World

Commit graph drawing, terminal typing, packets on a wire — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
