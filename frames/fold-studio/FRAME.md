---
name: fold-studio
label: Fold Studio
orientation: portrait
fontFamily: Zilla Slab
---

# Fold Studio

Origami-studio pack: warm paper ground, vermilion and indigo, and a world made of sheets creasing open.

## Palette

| Role | Hex | Used for |
|---|---|---|
| washi | `#f2ede3` | primary ground (hook, feature, stats, app), tiles, CTA button |
| ink | `#26221c` | copy, montage ground |
| crane | `#d64545` | highlight, the flying crane, statement ground |
| indigo | `#2e4a7d` | feature card, CTA ground, second chip |
| kraft | `#b89b6a` | third chip and third stat column |

## Type

Display: **Zilla Slab** 500–700 — line-height 1.08, titles 92–148px. Body: **Source Sans 3** 400–700. Radii are deliberately tiny (card 6, tile 4) and chips are `square`, so every container reads as a cut sheet.

## World

Shown on hook, feature, stats and app. Three large triangles — crane red top-right, indigo mid-left, kraft bottom-right — each drawn at 50% opacity and animated with `scaleX(0.3 → 1.0)` on its own sine phase plus a slow rotation of `i*40 + t*10`, so they read as sheets folding in and out of plane. A three-polygon vermilion crane travels left→right at 40px/s across y≈230, its upper and lower wing points swinging ±22px on `sin(t*4)`. Beneath it, four faint dashed 45° lines run like crease-pattern guides. Ambient clock 1.6.

## Motion

Cameras: pushL → zoomIn → pushD → pushR → hopU → zoomOut, multiplier 5, offset 1. Magnitude rot 0.8, **skew 2** (unique to this pack — the frame tips like a sheet being turned), driftX 6. Titles and items both enter on **flip**. Default motion preset is Lively.

## Beats

- **DragDrop / assemble** — pieces are dragged into position and lock into a finished arrangement.
- **Swipe / flip** — a card stack flips through options or levels.
- **Morph / fade** — one word crossfades through a series (this month's model, this term's project).
- **Toggle / switch** — a setup list where switches flick on one at a time.

## Best for

Craft studios and workshops, class and course providers, stationery and paper goods, galleries and makerspaces, design education, and any brand whose value is precision done slowly.
