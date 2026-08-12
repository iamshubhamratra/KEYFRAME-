---
name: cat-nap
label: Cat Nap
orientation: portrait
fontFamily: Lora
---

# Cat Nap

A twilight living room in plum and deep violet, warmed by a single lamp amber (#f0b45c) with a rose yarn accent. Lora serif headlines sit on Quicksand body copy — bookish, unhurried. The world is a room that never quite settles: the lamp glow pulses, dust motes drift through it, a yarn ball rolls and trails its thread, stars cross the window, and a cat silhouette flicks its tail on a slow loop. Best for sleep and wellness brands, home goods, pet care, and any product whose promise is calm.

## Palette

| role | hex |
|---|---|
| night | `#332a47` |
| plum | `#59436b` |
| lamp | `#f0b45c` |
| yarn | `#c96b8e` |
| paper | `#f6efe4` |
| catInk | `#241d2e` |

Ground `night`, ink `catInk`, paper `paper`.
Brand accents take `lamp`, `yarn`, `plum` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Lora** (Georgia, serif) · body **Quicksand**.
Headline tracking `0`, leading `1.06`, average advance `0.52em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `drop` · `pushL` · `pushU` · `zoomOut` · `pushR` · `zoomIn`, indexed `i * 3 + 2`.
Title entrance **drowse**, item entrance **pop**.
World clock runs at `1.5x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
No interaction beats declared.

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
