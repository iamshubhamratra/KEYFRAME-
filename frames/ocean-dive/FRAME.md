---
name: ocean-dive
label: Ocean Dive
orientation: portrait
fontFamily: Comfortaa
---

# Ocean Dive

A descent from shallow teal (#14657a) into abyss blue, lit by an aqua glow (#57d6c9) with coral as the warm counterpoint. Comfortaa sets rounded headlines over Mulish body copy — soft, not clinical. The world descends with the film: caustic light ripples across the top of the frame, bubble columns rise at different rates, particulate drifts sideways on a current, and a depth gradient deepens toward the floor. Best for marine and dive brands, water sports, sustainability, wellness and anything calm and deep.

## Palette

| role | hex |
|---|---|
| shallow | `#14657a` |
| mid | `#0a3d52` |
| abyss | `#06222e` |
| aqua | `#57d6c9` |
| coral | `#ff8a5c` |
| paper | `#eafaf6` |
| ink | `#04222e` |

Ground `mid`, ink `ink`, paper `paper`.
Brand accents take `aqua`, `coral` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Comfortaa** (system-ui, sans-serif) · body **Mulish**.
Headline tracking `0`, leading `1.1`, average advance `0.6em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `zoomIn` · `pushD` · `pushR` · `pushU` · `pushL` · `zoomOut`, indexed `i * 5 + 2`.
Title entrance **rise**, item entrance **bounce**.
World clock runs at `1.6x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
No interaction beats declared.

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
