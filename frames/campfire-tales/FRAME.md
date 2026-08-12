---
name: campfire-tales
label: Campfire Tales
orientation: portrait
fontFamily: Caveat
---

# Campfire Tales

A night camp in navy (#1b2233) and pine, lit by one flame orange (#f2913d) with a soft ember glow behind it. Caveat handwriting sets the headlines like something scratched in a notebook, over Andada Pro body copy. The world keeps a fire alive all film: sparks rise and die, the flame licks on its own cycle, log embers pulse, and the treeline sits black against a star field. Best for outdoor gear, scouting and camp brands, storytelling podcasts, and anything sold on being away from the city.

## Palette

| role | hex |
|---|---|
| night | `#1b2233` |
| pine | `#2e4038` |
| flame | `#f2913d` |
| glow | `#f7c66b` |
| log | `#6b4a32` |
| paper | `#f4ecdd` |
| ink | `#241f18` |

Ground `night`, ink `ink`, paper `paper`.
Brand accents take `flame`, `glow`, `paper` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Caveat** (cursive) · body **Andada Pro**.
Headline tracking `0`, leading `0.96`, average advance `0.44em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `zoomIn` · `pushR` · `pushU` · `pushL` · `pushD` · `zoomOut`, indexed `i * 3 + 1`.
Title entrance **rise**, item entrance **pop**.
World clock runs at `1.7x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
No interaction beats declared.

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
