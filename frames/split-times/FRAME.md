---
name: split-times
label: Split Times
orientation: landscape
form: longform
fontFamily: Big Shoulders Display
---

# Split Times

Running. A five-minute, 1920x1080 text-first film — forty kinetic-typography beats,
one continuous hand-drawn world behind all of them, and exactly two image slots in the entire run.

## Palette

| Role | Hex | Job |
|---|---|---|
| paper | `#eef3f6` | the default ground |
| ink | `#141a20` | all type |
| accent | `#ff5a3c` | kickers, rules, emphasis — brandable |
| accent2 | `#2ba3c4` | the second voice — brandable |
| sageT | `#e2eef0` | tinted ground A, alternating |
| terraT | `#f7e3dc` | tinted ground B, alternating |
| desk | `#101418` | outside the frame |

## Type

Display **Big Shoulders Display**, body **Red Hat Text**. Headlines are authored at up to 210px and shrink only
when a line genuinely cannot fit; nothing is set below 24px.

## Motion

Per-scene camera from `["pushL","pushR","zoomIn","hopU","pushU","spin"]` at stride 7/2, entering over the
first 12% of a beat and leaving over the last 12%. A continuous drift keeps translate and scale
moving the whole time. Ambient clock multiplier 2.

## World

Bobbing runner, curved track, live split readout — computed from the clock,
running under every beat, hidden (never stopped) on the 15 scenes that ask for a bare field.

## Media

One 980x540 screenshot card at the Peek beat, one 140px circular logo at Join. That is the whole
appetite: `media.maxAssets` is 3. Everything else on screen is type and inline SVG.
