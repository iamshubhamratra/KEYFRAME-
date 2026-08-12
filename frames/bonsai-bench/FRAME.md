---
name: bonsai-bench
label: Bonsai Bench
orientation: portrait
fontFamily: Fraunces
---

# Bonsai Bench

Warm paper (#eee9dc) with a pine green (#41613f), bark brown and a grey stone. Fraunces sets soft-contrast serif headlines over Rubik. The world is one potted bonsai on a bench in the lower right: the trunk sways a couple of degrees on a slow cycle, its branches drawn as round-capped strokes, the pot sitting on a shadowed lip. Nothing else moves — the restraint is the design. Its mechanics are a dial, a gauge, handwriting that appears word by word and a ruled board. Best for craft and horticulture, wellness, slow-made goods and studios that want patience to read as expertise.

## Palette

| role | hex |
|---|---|
| paper | `#eee9dc` |
| pine | `#41613f` |
| bark | `#6b4f34` |
| stone | `#9aa39a` |
| ink | `#26302a` |

Ground `paper`, ink `ink`, paper `paper`.
Brand accents take `pine`, `stone`, `paper` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Fraunces** (serif) · body **Rubik**.
Headline tracking `0`, leading `1.06`, average advance `0.58em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `zoomOut` · `pushU` · `drop` · `pushL` · `zoomIn` · `pushR`, indexed `i * 3 + 1`.
Title entrance **drowse**, item entrance **rise**.
World clock runs at `1.4x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
This pack additionally owns:
- **Toggle** (`dial`)
- **Ring** (`gauge`)
- **Typing** (`hand`)
- **Scroll** (`board`)

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
