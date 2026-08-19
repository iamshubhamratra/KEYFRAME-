---
name: fetch-club
label: Fetch Club
orientation: landscape
form: longform
fontFamily: Baloo 2
---

# Fetch Club

Dogs. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#f6ecd9` | the default ground |
| ink | `#2c231a` | all type |
| accent | `#e0762c` | kickers, rules, emphasis — brandable |
| accent2 | `#4d7a63` | the second voice — brandable |
| sageT | `#e6ecdf` | tinted ground A, alternating |
| terraT | `#f7dfc2` | tinted ground B, alternating |
| desk | `#2a1f16` | outside the frame |

## Type

Display **Baloo 2**, body **Nunito**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["hopU","pushR","zoomIn","pushL","drop","spin"]` at stride 5/1, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 1.7.

## World

Trotting dog with cycling legs, bouncing ball, paw prints — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
