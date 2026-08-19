---
name: safelight
label: Safelight
orientation: landscape
form: longform
fontFamily: Syne
---

# Safelight

Darkroom. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#efe9df` | the default ground |
| ink | `#16110f` | all type |
| accent | `#e2483d` | kickers, rules, emphasis — brandable |
| accent2 | `#c9922c` | the second voice — brandable |
| sageT | `#1c1614` | tinted ground A, alternating |
| terraT | `#221614` | tinted ground B, alternating |
| desk | `#100c0b` | outside the frame |

## Type

Display **Syne**, body **Hanken Grotesk**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["zoomIn","pushL","pushD","zoomOut","pushR","hopU"]` at stride 7/3, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.6.

## World

Pulsing red bulb, swaying negatives, tray ripples — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
