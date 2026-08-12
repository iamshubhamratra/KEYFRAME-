---
name: loom-and-weft
label: Loom & Weft
orientation: portrait
fontFamily: Cardo
---

# Loom & Weft

Undyed linen (#efe4d0) with madder red (#b5503c), indigo and olive — a natural dyer's palette. Cardo sets bookish serif headlines over Karla. The world is a working loom: eighteen warp threads run the full height and alternate lift on a shed cycle, while a shuttle travels the full width and flips at each selvedge to come back. It is the only pack here whose backdrop is a mechanism doing real work. Its mechanics are an assembling drag, a card stack, checkboxes and a rolling word. Best for textiles and fashion, makers and manufacturing, heritage crafts and supply-chain stories.

## Palette

| role | hex |
|---|---|
| linen | `#efe4d0` |
| madder | `#b5503c` |
| indigo | `#3b4a6b` |
| olive | `#7d8556` |
| ink | `#2a231a` |

Ground `linen`, ink `ink`, paper `linen`.
Brand accents take `madder`, `ink`, `linen` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Cardo** (serif) · body **Karla**.
Headline tracking `0`, leading `1.08`, average advance `0.58em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `pushL` · `zoomIn` · `pushD` · `pushR` · `hopU` · `zoomOut`, indexed `i * 5 + 1`.
Title entrance **stamp**, item entrance **rise**.
World clock runs at `1.6x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
This pack additionally owns:
- **DragDrop** (`assemble`)
- **Scroll** (`stack`)
- **Toggle** (`check`)
- **Morph** (`roll`)

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
