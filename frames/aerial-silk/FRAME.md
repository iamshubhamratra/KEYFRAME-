---
name: aerial-silk
label: Aerial Silk
orientation: portrait
fontFamily: Playfair Display
---

# Aerial Silk

A theatre in aubergine (#22132a) with a gilt spotlight cone falling from the flies and two silk-pink ribbons (#e05a7a) swaying the full height of the frame. Playfair Display sets high-contrast serif headlines over Figtree. The world performs continuously: the light cone drifts on its own slow arc, the twin silks curl and uncurl on independent phases, and gilt motes hang in the beam. Its mechanics are a card flip, a progress ring, a slider the cursor drags and side-entering toasts. Best for performing arts, dance and fitness studios, luxury events and any brand that sells a spectacle rather than a spec sheet.

## Palette

| role | hex |
|---|---|
| house | `#22132a` |
| silk | `#e05a7a` |
| gilt | `#dfae5c` |
| chalkw | `#f2ecf2` |
| ink | `#150c19` |

Ground `house`, ink `ink`, paper `chalkw`.
Brand accents take `silk`, `gilt`, `chalkw` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Playfair Display** (serif) · body **Figtree**.
Headline tracking `0`, leading `1.04`, average advance `0.52em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `drop` · `zoomIn` · `pushL` · `hopU` · `pushR` · `zoomOut`, indexed `i * 5 + 1`.
Title entrance **drowse**, item entrance **rise**.
World clock runs at `1.6x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
This pack additionally owns:
- **Swipe** (`flip`)
- **Ring** (`ring`)
- **Cursor** (`slider`)
- **Notify** (`side`)

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
