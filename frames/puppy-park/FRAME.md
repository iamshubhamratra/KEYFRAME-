---
name: puppy-park
label: Puppy Park
orientation: portrait
fontFamily: Baloo 2
---

# Puppy Park

A bright park in sky blue (#a5d8f0) and grass green, with a sun yellow (#f7c948) and a bouncing ball orange. Baloo 2 sets fat rounded headlines over Nunito — the only light-ground film in this group. The world plays continuously: clouds drift at two speeds, a ball arcs and bounces along the grass line, paw prints press into the turf and fade, and the sun wobbles gently. Best for pet brands, kids and family products, community apps and anything that should read friendly before it reads serious.

## Palette

| role | hex |
|---|---|
| sky | `#a5d8f0` |
| grass | `#8cc063` |
| grassDark | `#4f8a3d` |
| sun | `#f7c948` |
| ball | `#e8622c` |
| paper | `#fdf6ec` |
| ink | `#2b2320` |

Ground `sky`, ink `ink`, paper `paper`.
Brand accents take `ball`, `sun`, `grass` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Baloo 2** (system-ui, sans-serif) · body **Nunito**.
Headline tracking `0`, leading `1.02`, average advance `0.56em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `zoomIn` · `hopU` · `pushR` · `zoomOut` · `pushL` · `drop`, indexed `i * 5 + 1`.
Title entrance **bounce**, item entrance **pop**.
World clock runs at `1.8x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
No interaction beats declared.

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
