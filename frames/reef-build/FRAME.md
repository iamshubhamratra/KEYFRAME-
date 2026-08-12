---
name: reef-build
label: Reef Build
orientation: portrait
fontFamily: Outfit
---

# Reef Build

Lagoon teal (#0d3d4a) lit by four drifting light shafts, with coral (#ff7a5c) and an aqua (#4fd6c0) as the two accents. Outfit sets clean geometric headlines over Nunito Sans. The world grows as the scene does: four coral colonies rise out of the floor on eased curves, staggered so they build one after another rather than together, under caustic rays that sway on their own cycle. Its mechanics are a gauge, a scrolling feed, an assembling drag and popping toasts. Best for marine conservation and science, sustainability reporting, diving and any brand whose story is restoration rather than extraction.

## Palette

| role | hex |
|---|---|
| lagoon | `#0d3d4a` |
| coral | `#ff7a5c` |
| aqua | `#4fd6c0` |
| shell | `#f2ead9` |
| ink | `#062730` |

Ground `lagoon`, ink `ink`, paper `shell`.
Brand accents take `coral`, `aqua`, `lagoon` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Outfit** (sans-serif) · body **Nunito Sans**.
Headline tracking `0`, leading `1.06`, average advance `0.56em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `zoomOut` · `pushU` · `drop` · `pushR` · `zoomIn` · `pushL`, indexed `i * 5 + 1`.
Title entrance **rise**, item entrance **pop**.
World clock runs at `1.5x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
This pack additionally owns:
- **Ring** (`gauge`)
- **Scroll** (`feed`)
- **DragDrop** (`assemble`)
- **Notify** (`pop`)

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
