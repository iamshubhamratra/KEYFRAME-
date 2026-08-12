---
name: salsa-wheels
label: Salsa Wheels
orientation: portrait
fontFamily: Boogaloo
---

# Salsa Wheels

Salsa Wheels — a cream-paper street corner with a teal taco truck that never stops bouncing.

## Palette

| Role | Hex |
|---|---|
| crema (ground) | #fdf3e0 |
| salsa (accent) | #d93425 |
| corn (secondary) | #f2c14b |
| teal (third) | #2a9d8f |
| ink (type) | #2b1a14 |
| desk (surround) | #1c120e |

## Type

Boogaloo (display) — a fat, rounded, hand-cut poster face — set 94–152px at 1.05 leading, forced uppercase on every beat. Nunito (sans, 400–800) does menu rows, prices, chips and notification copy, so the type stays friendly rather than corporate under all that shouting.

## World

A street corner, drawn behind hook / feature / stats / app. Across the top, papel picado: nine flags in salsa / corn / teal hung on a sagging curve, each swaying ±10° out of phase with the others, every one cut with a zigzag fringe. Right of frame, a taco truck — teal body, cream serving window, a salsa-red awning topped with alternating corn and cream scallops, two ink wheels with cream hubs — bouncing on its suspension at |sin(3.2t)|·6px, with a cream smoke plume looping up out of the stack. Lower-left, a three-armed teal cactus over an elliptical shadow. Right, three salsa-red chile glyphs tumbling at 30°/s.

## Motion

Cameras: hopU, pushR, spin, pushL, zoomIn, drop — stepped by 3 from index 1, so the hop and the spin both land often. Magnitudes: rot 1.4 (the highest in this group — spin reaches ~14°), driftX 10. Titles enter on `bounce` (110px drop plus an outBack overshoot from 0.7 scale), items on `pop`. Feature cards use the tilt treatment; montage tiles sit at ±2–3°, the largest tilts in the set. Ambient clock 2.0 — the busiest backdrop here.

## Beats

- **Scroll (board)** — a menu board: numbered rows with dotted leader lines whose prices flicker like a flip-board as they settle.
- **Cursor (click)** — a pointer travels to a pill button, clicks with an expanding ripple, the label swaps, then it crosses to a toggle and flips it.
- **Notify (pop)** — rounded pill alerts pop in at staggered left offsets with small rotations.
- **Swipe (swipe)** — a card stack; the top card is flung right at 18° behind an angled stamp badge.
- Morph falls through to the default odometer roll for the location reveal.

## Best for

Food trucks and street food, taquerías and cantinas, markets and festivals, hot sauce and snack brands, delivery and neighbourhood apps — anything sold in a queue, loudly and cheaply.
