---
name: ledger-and-lift
label: Ledger & Lift
orientation: landscape
form: longform
fontFamily: Sora
---

# Ledger & Lift

Personal finance. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#e9eef4` | the default ground |
| ink | `#0e131a` | all type |
| accent | `#3ce08c` | kickers, rules, emphasis — brandable |
| accent2 | `#5a7cff` | the second voice — brandable |
| sageT | `#161f28` | tinted ground A, alternating |
| terraT | `#1c1a26` | tinted ground B, alternating |
| desk | `#0c1016` | outside the frame |

## Type

Display **Sora**, body **Inter Tight**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["pushU","zoomIn","pushR","drop","pushL","zoomOut"]` at stride 3/2, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.7.

## World

Candlestick chart building, tilting card, rising coins — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
