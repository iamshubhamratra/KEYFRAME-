---
name: clay-court
label: Clay Court
orientation: portrait
fontFamily: Archivo Black
---

# Clay Court

A full-bleed clay orange court (#c1552f) with chalk lines drawn in perspective — baselines, service line and a net band across the upper third — under an acid lime accent (#d8f04b). Archivo Black stamps heavy uppercase headlines over Archivo. The court is the world: the lines sit where they would on a real surface, and the frame reads as the view from behind the baseline. Its mechanics are a keyboard-driven cursor, a linear fill bar, a scrolling ticker and a dial. Best for sport and fitness, tournaments and clubs, athletic apparel and anything with a scoreboard.

## Palette

| role | hex |
|---|---|
| clay | `#c1552f` |
| lime | `#d8f04b` |
| chalkline | `#f6f1e6` |
| shade | `#3a2016` |
| court | `#8c3f22` |

Ground `clay`, ink `shade`, paper `chalkline`.
Brand accents take `lime`, `clay` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Archivo Black** (sans-serif) · body **Archivo**.
Headline tracking `0.01em`, leading `1.04`, average advance `0.84em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `pushR` · `hopU` · `zoomIn` · `pushL` · `spin` · `drop`, indexed `i * 7 + 1`.
Title entrance **slam**, item entrance **slam**.
World clock runs at `2x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
This pack additionally owns:
- **Cursor** (`keys`)
- **Ring** (`bar`)
- **Scroll** (`ticker`)
- **Toggle** (`dial`)

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
