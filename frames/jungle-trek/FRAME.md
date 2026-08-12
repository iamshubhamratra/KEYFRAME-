---
name: jungle-trek
label: Jungle Trek
orientation: portrait
fontFamily: Alfa Slab One
---

# Jungle Trek

Deep canopy green (#17301f) under layered leaf shapes, cut by an acid firefly yellow (#cde34f) and a pale mist. Alfa Slab One stamps heavy slab headlines over Cabin body copy. The world is a living canopy: broad leaves sway on their own phase, mist drifts in bands, fireflies blink on independent cycles, and light shafts angle through the layers. Best for expedition and eco brands, botanical products, field research, and anything that wants to feel overgrown rather than manicured.

## Palette

| role | hex |
|---|---|
| deep | `#17301f` |
| leaf | `#4e8a4a` |
| leafDark | `#27502e` |
| fly | `#cde34f` |
| mist | `#bfe6c8` |
| paper | `#f1e9d2` |
| shadow | `#0d1f12` |

Ground `deep`, ink `shadow`, paper `paper`.
Brand accents take `fly`, `leaf`, `paper` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Alfa Slab One** (Georgia, serif) · body **Cabin**.
Headline tracking `0`, leading `1.08`, average advance `0.76em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `zoomIn` · `pushL` · `pushU` · `pushR` · `drop` · `zoomOut`, indexed `i * 5 + 3`.
Title entrance **machete**, item entrance **pop**.
World clock runs at `1.6x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
No interaction beats declared.

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
