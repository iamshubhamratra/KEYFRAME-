---
name: on-air
label: On Air
orientation: portrait
fontFamily: Unbounded
---

# On Air

A live recording booth: a meter breathing along the bottom, a sign that genuinely blinks, and type that chops in from the left.

## Palette
| Role | Hex |
|---|---|
| studio | #16181d |
| purple | #8b5cf6 |
| signal | #3ddc84 |
| fog | #e8e9ee |
| ink | #101216 |

Studio black carries Hook, Feature, Stats and App; Montage and CTA sit on a slightly lifted #111318. Statement is the only bright frame in the film — solid purple with fog type at 144px. Signal green is used sparingly and always means live: the kicker tag, montage labels, the CTA highlight, the scrub dot.

## Type
Display is Unbounded at 500 to 700 — wide geometric caps, uppercase at 118px. Body is Wix Madefor Text. The backdrop reuses Unbounded at 30px for the ON AIR lettering, so the sign is set in the same face as the titles.

## World
Twenty-two rounded meter bars run along the lower frame, each height driven by two summed absolute sines (2.4Hz and 4.1Hz with per-bar phase), every fourth bar in signal green and the rest purple at varying alpha. At the top right an ON AIR sign: a 240x88 rounded outline, a lamp dot and the lettering, all hard-switching between full green and a dim state on sin(2.8t) — a real blink, not a fade. At the left a fog-white condenser mic capsule with four grille lines on a stand, under three purple ring pulses expanding from r60 to r200 and fading out on a rolling loop. A fog rule crosses the frame with a green scrub dot travelling at 60px/s on a loop, like a playhead. Ambient 1.8.

## Motion
Cameras pushL, zoomIn, pushD, pushR, zoomOut, hopU at multiplier 7, offset 1. Magnitudes: rot 0.7, inn 0.2 and no skew or drift override — the frame stays square and the moves are pure fast slides. Titles use machete (outQuint, -90px translateX with a -6deg skewX); items streak.

## Beats
- **Ring (bar)** — a vertical level tube with a spouted cap and quarter ticks, with the number and label set beside it; input and gain readouts.
- **Cursor (click)** — a pointer walks the frame and clicks a control; built for board and console walkthroughs.
- **Notify (side)** — cards slide in from the right edge with a bar at the base that drains as each one expires; producer and channel messages.
- **Typing (caret)** — copy types against a thick purple left rule with a blinking pipe, closing on a rotated boxed stamp.

## Best for
Podcasts and radio shows, audio and music SaaS, creator studios and streaming channels, dark-UI product tours, live events and broadcast teams, headphone and interface hardware.
