---
name: alpine-post
label: Alpine Post
orientation: portrait
fontFamily: Alegreya Sans SC
---

# Alpine Post

A crisp snowfield ground (#eef4f8) under a slate-blue mountain range with white caps, cut by one postal red (#c0392b) and a deep pine. Alegreya Sans SC sets small-caps headlines over Barlow — civic, printed, legible. The world holds a whole valley: a layered peak silhouette across the base, snow caps catching light, and a route threading between them. It is the only light-ground pack in this batch, and its split-flap Morph makes it read like a station board. Best for transport and logistics, alpine tourism, civic and public-service brands, and anything that runs to a timetable.

## Palette

| role | hex |
|---|---|
| snow | `#eef4f8` |
| post | `#c0392b` |
| pine | `#2f4f43` |
| slateb | `#4a6478` |
| ink | `#1e2c36` |

Ground `snow`, ink `ink`, paper `snow`.
Brand accents take `post`, `ink`, `snow` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Alegreya Sans SC** (sans-serif) · body **Barlow**.
Headline tracking `0.05em`, leading `1.04`, average advance `0.58em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `pushL` · `pushR` · `zoomOut` · `hopU` · `zoomIn` · `drop`, indexed `i * 5 + 2`.
Title entrance **stamp**, item entrance **streak**.
World clock runs at `1.7x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
This pack additionally owns:
- **Scroll** (`board`)
- **DragDrop** (`drag`)
- **Toggle** (`switch`)
- **Morph** (`flap`)

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
