---
name: nine-lives
label: Nine Lives
orientation: landscape
form: longform
fontFamily: Playfair Display
---

# Nine Lives

Cats. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f4eee4` | the default ground |
| ink | `#241f28` | all type |
| accent | `#b9647a` | kickers, rules, emphasis — brandable |
| accent2 | `#5f7f8c` | the second voice — brandable |
| sageT | `#e4e9ea` | tinted ground A, alternating |
| terraT | `#f3e2e4` | tinted ground B, alternating |
| desk | `#1e1a22` | outside the frame |

## Type

Display **Playfair Display**, body **Karla**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["zoomOut","drop","pushL","zoomIn","pushU"]` at stride 3/2, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.2.

## World

Breathing cat, twitching ear, unspooling yarn, dust motes — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
