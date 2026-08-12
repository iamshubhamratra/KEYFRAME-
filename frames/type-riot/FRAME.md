---
name: type-riot
label: Type Riot
orientation: portrait
fontFamily: Anton
---

# Type Riot

Pure black ink (#141414), off-white paper and one riot red (#e63329) — no third colour anywhere. Anton stacks condensed uppercase headlines to the edges over Space Grotesk. The world is made of type: a giant ghost word scrolls behind everything at low contrast, a marquee rail runs the reserved band, and a hard red rule slams across on the beat. The only film here whose backdrop is language rather than landscape. Best for manifestos, music and culture, political and campaign work, streetwear drops and any brand that would rather shout than explain.

## Palette

| role | hex |
|---|---|
| ink | `#141414` |
| paper | `#f4f1ea` |
| red | `#e63329` |

Ground `ink`, ink `ink`, paper `paper`.
Brand accents take `red`, `paper` in order; every other stop rotates onto the
brand's lead hue at its authored luminance.

## Type

Display **Anton** (Impact, sans-serif) · body **Space Grotesk**.
Headline tracking `0.01em`, leading `0.94`, average advance `0.44em`
(the fitter derives both the wrap target and the final size from that number).

## Motion

Camera set `zoomIn` · `pushR` · `pushU` · `pushL` · `pushD` · `zoomOut`, indexed `i * 7 + 1`.
Title entrance **slam**, item entrance **streak**.
World clock runs at `2x` film time.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta.
This pack additionally owns:
- **Scroll** (`ticker`)

## World

The animated backdrop is the authored function, run verbatim per seek against an SVG-DOM
shim — the backdrop is not a reinterpretation of the original, it is the original.
