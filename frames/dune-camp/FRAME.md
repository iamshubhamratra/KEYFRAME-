---
name: dune-camp
label: Dune Camp
orientation: portrait
fontFamily: Amiri
---

# Dune Camp

A desert night in dusk indigo (#241d3e) over sand gold, warmed by one ember orange (#e8703c). Amiri sets classical serif headlines over Tajawal — a pairing built for Arabic as readily as Latin. The world is a full camp: twenty-two stars twinkling on independent phases, a crescent moon cut from a disc, layered dune ridges rolling across the lower frame, a tent silhouette and a small fire. Its mechanics are a ticker, a gauge, a caret typewriter and a swipe deck. Best for travel and hospitality, heritage and cultural brands, and any product with a story set after dark.

## Palette

| role | hex |
|---|---|
| dusk | `#241d3e` |
| sand | `#e0b878` |
| ember2 | `#e8703c` |
| night | `#151030` |
| cream2 | `#f4ecdc` |

Ground `dusk`, ink `night`, paper `cream2`.
Brand accents take `sand`, `ember2`, `dusk` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Amiri** (serif) · body **Tajawal**.
Headline tracking `0`, leading `1.08`, average advance `0.58em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `pushL` · `zoomOut` · `drop` · `pushR` · `zoomIn` · `pushU`, indexed `i * 5 + 2`.
Title entrance **drowse**, item entrance **rise**.
World clock runs at `1.6x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
This pack additionally owns:
- **Scroll** (`ticker`)
- **Ring** (`gauge`)
- **Typing** (`caret`)
- **Swipe** (`swipe`)

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
