---
name: night-drive
label: Night Drive
orientation: portrait
fontFamily: Orbitron
---

# Night Drive

Asphalt black (#0c0e14) under a cyan neon (#39e6d0) and a magenta counter-light. Orbitron sets the headlines as instrument-panel type over Exo 2 body copy. The world is a road at speed: lane markers stream past on a perspective floor, neon signage smears by, a horizon glow sits low, and the whole frame carries a faint dashboard reflection. Best for automotive, delivery and logistics, late-night apps, esports and anything that trades on velocity after dark.

## Palette

| role | hex |
|---|---|
| asphalt | `#0c0e14` |
| midnight | `#080a10` |
| panel | `#0a0d14` |
| neon | `#39e6d0` |
| magenta | `#e04fa3` |
| amber | `#f5b942` |
| paper | `#eef2f7` |

Ground `asphalt`, ink `midnight`, paper `paper`.
Brand accents take `neon`, `magenta`, `amber` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Orbitron** (system-ui, sans-serif) · body **Exo 2**.
Headline tracking `0.02em`, leading `1.08`, average advance `0.68em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `zoomIn` · `pushR` · `pushU` · `pushL` · `zoomOut` · `pushD`, indexed `i * 7 + 2`.
Title entrance **streak**, item entrance **slam**.
World clock runs at `2.1x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
No interaction beats declared.

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
