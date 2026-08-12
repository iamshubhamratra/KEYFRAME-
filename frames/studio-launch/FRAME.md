---
name: studio-launch
label: Studio Launch
orientation: portrait
fontFamily: Caprasimo
---

# Studio Launch

A warm dark house in deep olive (#3d472b) with cream surfaces and a terracotta accent (#c67139). Caprasimo sets full-bodied headlines over Figtree body copy. The world is a lit stage rather than a scene: soft coloured bloom fields drift and overlap, a slow conic sweep rotates behind everything, banded light wipes across the frame, and a vignette keeps the centre bright. The most product-forward film here — the world exists to light a screenshot, not to tell its own story. Best for software launches, studio and agency reels, and premium product reveals.

## Palette

| role | hex |
|---|---|
| ground | `#3d472b` |
| surface | `#f5ead8` |
| paper | `#f5ead8` |
| cardInk | `#201e1d` |
| accent | `#c67139` |
| accent2 | `#7a8a5e` |
| accentText | `#d69a6f` |
| accent2Text | `#b0b494` |

Ground `ground`, ink `cardInk`, paper `paper`.
Brand accents take `accent`, `accent2` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Caprasimo** (Georgia, serif) · body **Figtree**.
Headline tracking `0`, leading `1.04`, average advance `0.58em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `zoomIn` · `pushL` · `pushU` · `spin` · `pushR` · `zoomOut` · `pushD`, indexed `i * 1 + 7`.
Title entrance **rise**, item entrance **rise**.
World clock runs at `1.6x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
This pack additionally owns:
- **Toggle** (`check`)
- **Cursor** (`click`)
- **Morph** (`fade`)
- **Scroll** (`feed`)

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
