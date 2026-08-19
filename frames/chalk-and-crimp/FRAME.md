---
name: chalk-and-crimp
label: Chalk & Crimp
orientation: landscape
form: longform
fontFamily: Bebas Neue
---

# Chalk & Crimp

Climbing. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f2f2ee` | the default ground |
| ink | `#1b1e22` | all type |
| accent | `#ff8a3d` | kickers, rules, emphasis — brandable |
| accent2 | `#3d7bff` | the second voice — brandable |
| sageT | `#e6ecec` | tinted ground A, alternating |
| terraT | `#f7e6d8` | tinted ground B, alternating |
| desk | `#181a1e` | outside the frame |

## Type

Display **Bebas Neue**, body **Instrument Sans**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["pushU","zoomIn","pushL","hopU","pushR","drop"]` at stride 7/1, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.9.

## World

Holds popping in sequence, chalk puff, swinging rope — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
