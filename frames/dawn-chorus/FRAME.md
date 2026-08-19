---
name: dawn-chorus
label: Dawn Chorus
orientation: landscape
form: longform
fontFamily: Fraunces
---

# Dawn Chorus

Birdwatching. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f3efe4` | the default ground |
| ink | `#1e2a34` | all type |
| accent | `#e0913c` | kickers, rules, emphasis — brandable |
| accent2 | `#4d7f8c` | the second voice — brandable |
| sageT | `#e6ece8` | tinted ground A, alternating |
| terraT | `#f7e6d2` | tinted ground B, alternating |
| desk | `#1a2230` | outside the frame |

## Type

Display **Fraunces**, body **Mulish**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["zoomOut","pushU","drop","pushR","zoomIn"]` at stride 3/1, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.4.

## World

Birds flapping on sine paths, four on a wire, rising sun — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
