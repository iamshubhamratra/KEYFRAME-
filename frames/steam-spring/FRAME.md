---
name: steam-spring
label: Steam Spring
orientation: portrait
fontFamily: Castoro
---

# Steam Spring

Steam Spring — a slate-and-cedar mountain bathhouse that moves at the speed of rising steam.

## Palette

| Role | Hex |
|---|---|
| stone (ground) | #33404a |
| water (accent) | #7fc4bd |
| wood (warm) | #a8794a |
| paper (type) | #f2ede2 |
| ink (deep) | #22303c |
| desk (surround) | #1c2630 |

## Type

Castoro (serif) for display — bookish, slightly calligraphic — set 92–146px over two lines at 1.12 leading. Case is never forced anywhere in the pack, so authored capitals stay as written and lowercase copy survives intact. Catamaran (sans) carries kickers, chips, list rows and stat labels.

## World

An SVG hot spring, drawn only behind hook / feature / stats / app. A water-tinted pool ellipse (rx 380) sits low in the frame, ringed by three ink boulders. Three ripple rings widen and fade across its surface on a 120-unit cycle. Three steam curls — 18px paper-coloured S-strokes — climb the full height of the frame and thin out as they rise. Twelve pale flecks fall through the frame with a sideways sine. On the left, a wooden post carries a paper lantern box with an amber flame (#ffb347) that breathes at ~5 rad/s.

## Motion

Cameras: zoomOut, pushU, drop, pushL, zoomIn, pushR — stepped by 3 from index 2, so no spin and no hop ever lands. Magnitudes are deliberately soft: rot 0.3, driftY 7, driftZ 0.03, and a long 30% settle. Titles enter on `drowse` (the slowest preset — a 46-window fade with a 34px lift); items on `rise`. Ambient world clock 1.4.

## Beats

- **Typing (hand)** — the signature. Words arrive one at a time, each rotated ±2°, scaling down from 1.35, every fourth word in water; closes on an underlined stamp.
- **Toggle (switch)** — pill switch rows flipping on in sequence: the bathhouse ritual as a checklist.
- **Scroll (feed)** — a numbered panel that scrolls itself behind a live scrollbar thumb.
- **Notify (drop)** — cards fall in from above with a slight tilt and a brand-initial avatar tile.
- Ring falls through to the default radial dial; Feature frames a card in ink with outline chips in water and wood.

## Best for

Onsen and bathhouses, spas, saunas, hot-and-cold recovery, mountain inns, retreats and slow hospitality — any brand whose actual product is unhurried time.
