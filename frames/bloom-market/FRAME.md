---
name: bloom-market
label: Bloom Market
orientation: portrait
fontFamily: DM Serif Display
---

# Bloom Market

A Saturday flower stall: blush paper, one magenta bloom, and stems that sway behind the type.

## Palette

| Role | Hex |
|---|---|
| blush (ground) | #f6e7e9 |
| magenta (bloom) | #c2477e |
| leaf | #5d8f57 |
| butter | #f2cf6b |
| ink | #322a2e |
| paper | #fffbf7 |

Ground and bloom are user-tweakable (blush → oat #f2ecdf or lilac #e9e4f2; magenta → coral #e0685c or violet #8f5cff).

## Type

DM Serif Display carries every headline in **sentence case** — 94px on montage up to 148px on the statement, line-height 1.06. Albert Sans 400–700 does kickers, chips, tile labels and stat captions. No beat is uppercased; the softness is deliberate.

## World

Four stems rise from 100px above the bottom edge as quadratic curves, each swaying `sin(t*0.9+i)*14` in leaf green at 9px stroke, each with a single leaf blade. Each stem carries a flower: five 16×34 ellipses rotating at 12°/s around a butter centre disc, coloured magenta / butter / magenta / coral #e0685c. Ten loose petals fall the full frame height at 44–98px/s, drifting on a sine and spinning at 90°/s, drawn in 55% magenta. Ambient clock 1.6. The world is visible on hook, feature and CTA only — statement, montage and stats are flat colour fields.

## Motion

Cam set pushL, hopU, zoomOut, pushR, drop, spin (mul 5, offset 3), with 1° of rotation and 9px of vertical drift: the frame bobs rather than glides. Titles **pop** in; items **stamp**.

## Beats

- **DragDrop (drag)** — items picked up and placed by hand; the authored deck uses it to build a bouquet and to restock.
- **Toggle (switch)** — a list of rows flipping on one at a time (opening checklist, care card).
- **Cursor (slider)** — a pointer dragging a slider to set a value (reserve / subscribe).
- **Ring (gauge)** — an arc sweeping to a percentage (sold-out-by-noon, bloom forecast).
- Statement floods full magenta with butter highlights; montage sits on leaf green with paper tiles tilted −3° / 2.5° / 2° / −2.5°; stats go ink with 152px numerals in magenta, butter and blush; CTA returns to blush with a magenta pill button and a circular logo.

## Best for

Florists and plant shops, farmers markets, bakeries and delis, artisan and craft retail, wellness and skincare, seasonal subscription boxes — anything with a weekend, a hand-made product and a warm shopfront.
