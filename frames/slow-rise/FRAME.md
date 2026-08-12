---
name: slow-rise
label: Slow Rise
orientation: portrait
fontFamily: Bitter
---

# Slow Rise

Crumb cream (#f4e7cf) with a crust brown (#a9642c), rye and a wheat gold. Bitter sets sturdy slab-serif headlines over Mulish. The world proves in real time: a loaf dome in the lower right actually GROWS with scene progress — its height driven by the beat's own timeline, not a loop — breathing gently on top of that, with scoring slashes cut across the crust and a shadow pooling under it. Its mechanics are a fill bar, a feed, checkboxes and a rolling word. Best for bakeries and food producers, farm and provenance stories, and any brand whose product takes time on purpose.

## Palette

| role | hex |
|---|---|
| crumb | `#f4e7cf` |
| crust | `#a9642c` |
| rye | `#6b4a2f` |
| wheat | `#dcae5c` |
| ink | `#33261a` |

Ground `crumb`, ink `ink`, paper `crumb`.
Brand accents take `crust`, `wheat`, `ink` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Bitter** (serif) · body **Mulish**.
Headline tracking `0`, leading `1.06`, average advance `0.54em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `hopU` · `zoomIn` · `pushL` · `pushR` · `drop` · `zoomOut`, indexed `i * 5 + 3`.
Title entrance **rise**, item entrance **pop**.
World clock runs at `1.6x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
This pack additionally owns:
- **Ring** (`bar`)
- **Scroll** (`feed`)
- **Toggle** (`check`)
- **Morph** (`roll`)

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
