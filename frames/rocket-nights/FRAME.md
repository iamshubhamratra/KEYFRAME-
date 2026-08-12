---
name: rocket-nights
label: Rocket Nights
orientation: portrait
fontFamily: Paytone One
---

# Rocket Nights

Rocket Nights — a near-black harbour sky where three shells are always mid-flight, and the only pack here that glows.

## Palette

| Role | Hex |
|---|---|
| night (ground) | #10101c |
| rocket (accent) | #ff4757 |
| spark (highlight) | #ffd23c |
| violet (third) | #7c5cff |
| smoke (type) | #e8e6f0 |
| desk (surround) | #0b0b14 |

## Type

Paytone One (display) — a heavy, rounded, poster-weight sans — set 92–148px, forced uppercase on every beat. Outfit (sans, 400–700) carries chips, notifications, swipe cards and stat labels. Stats render with `glowNums`, so the numbers themselves throw light.

## World

A live show, and the only world in this group that stays on behind montage, stats and CTA as well as hook / feature / app. Three shells run independent loops: for the first 35% of a cycle each climbs from the bottom of the frame as a coloured tracer line (rocket / spark / violet) with a white head; for the remaining 65% it bursts into a twelve-spoke radial star while eight white embers fly outward and fall under a q² gravity term, the whole burst fading out. Behind them fourteen background stars twinkle on independent sines, and a black headland silhouette (#07070e) curves across the bottom of the frame.

## Motion

Cameras: pushU, zoomIn, drop, spin, pushL, pushR — stepped by 7 from index 0, so the spin and the drop both recur. Magnitudes: rot 1.1, driftY 10, and inn 0.18 — the shortest settle in this group, which makes every title land hard. Titles enter on `slam` (2.2× scale collapsing on outExpo with a −4° unwind, the most violent preset in the library); items on `pop`. Feature cards use the glow treatment with a spark halo; montage tiles carry a violet glow; the CTA button glows too. Ambient clock 1.9.

## Beats

- **Code (terminal)** — a near-black `$` panel typing the firing script line by line behind a blinking block cursor, closing on a green ✔.
- **Morph (flap)** — split-flap character tiles counting down the T-minus, each tile collapsing on its own stagger.
- **Notify (pop)** — pill-shaped crowd reports popping in at staggered offsets with small rotations.
- **Swipe (flip)** — a card that flips on its vertical axis, scaleX collapsing to zero and back to reveal the next face, under dot pagination.
- Stats and CTA both keep the sky live behind them.

## Best for

Fireworks and light shows, festivals and New Year events, arena and nightlife promotion, sneaker and game drops, dark-mode product launches — any brief built around a countdown and a single loud moment.
