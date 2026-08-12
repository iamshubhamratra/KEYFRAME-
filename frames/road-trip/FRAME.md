---
name: road-trip
label: Road Trip
orientation: portrait
fontFamily: Permanent Marker
---

# Road Trip

Sun-bleached map paper (#f2e8d5) with a route red (#e05e4e), a teal camper van and a soft desert sky. Permanent Marker scrawls the headlines like a felt-tip on a map, over Karla body copy. The world travels: a dashed route line draws itself across the paper, a van rolls along it, telegraph poles pass in the middle distance, and a low sun sits over layered hills. Best for travel and tourism, vans and outdoor rental, festivals, and any brand whose story is a journey with stops on it.

## Palette

| role | hex |
|---|---|
| paper | `#f2e8d5` |
| route | `#e05e4e` |
| van | `#3f8f8a` |
| sun | `#eec96f` |
| sky | `#cfe8ee` |
| ink | `#33291f` |

Ground `paper`, ink `ink`, paper `paper`.
Brand accents take `route`, `van`, `sun` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Permanent Marker** (cursive) · body **Karla**.
Headline tracking `0`, leading `1.08`, average advance `0.54em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `drop` · `pushR` · `zoomIn` · `hopU` · `pushL` · `zoomOut`, indexed `i * 7 + 4`.
Title entrance **stamp**, item entrance **stamp**.
World clock runs at `1.7x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
No interaction beats declared.

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
