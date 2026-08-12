---
name: escapement
label: Escapement
orientation: portrait
fontFamily: Cormorant Garamond
---

# Escapement

Deep navy (#152030) with brass (#d0a75c), one ruby stop and a cold silver. Cormorant Garamond sets fine high-contrast serif headlines over Inter Tight. The world is the inside of a movement: interlocking gears, each drawn with real teeth, a hub and spokes, rotating at different speeds so the train never repeats its alignment. Its mechanics are a sweeping ring, a terminal, a dial and a split-flap. Best for watchmaking and jewellery, precision engineering, fintech and any brand whose promise is tolerance measured in fractions.

## Palette

| role | hex |
|---|---|
| deep | `#152030` |
| brass | `#d0a75c` |
| ruby | `#c0384f` |
| silverw | `#dce4ec` |
| ink | `#101a26` |

Ground `deep`, ink `ink`, paper `silverw`.
Brand accents take `brass`, `deep` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Cormorant Garamond** (serif) · body **Inter Tight**.
Headline tracking `0.02em`, leading `1.04`, average advance `0.44em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `zoomIn` · `pushL` · `drop` · `spin` · `pushR` · `zoomOut`, indexed `i * 5 + 3`.
Title entrance **drowse**, item entrance **rise**.
World clock runs at `1.5x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
This pack additionally owns:
- **Ring** (`ring`)
- **Typing** (`terminal`)
- **Toggle** (`dial`)
- **Morph** (`flap`)

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
