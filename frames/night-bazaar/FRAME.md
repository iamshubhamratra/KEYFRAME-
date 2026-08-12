---
name: night-bazaar
label: Night Bazaar
orientation: portrait
fontFamily: Baloo 2
---

# Night Bazaar

Night-market pack: plum darkness lit by lantern amber, with a mint payoff and the loudest motion in the set.

## Palette

| Role | Hex | Used for |
|---|---|---|
| plum | `#221430` | primary ground (hook, feature, stats, app), tiles |
| ink | `#180e24` | montage ground, cards, CTA button |
| amber | `#ffb454` | highlight, lantern bulbs, statement ground, kicker pill |
| mint | `#59d4a4` | CTA ground, hanging sign, second chip |
| chalk | `#f6efe6` | copy, awning stripes, outlines |

## Type

Display: **Baloo 2** 500–700 — **uppercase on every beat** (`upper: true` in all seven looks), titles 94–152px. Body: **Be Vietnam Pro** 400–700. Generous radii (card 20, tile 16, pill chips and buttons) keep it soft-edged despite the shouting.

## World

Shown on hook, feature, stats and app. Two festoon strings arc across the top on quadratic curves in 25%-opacity chalk, each carrying eight bulbs that sag toward mid-span and flicker independently on `sin(t*3 + i*1.7)` — bulbs are full amber when on, 25% when off. A market-stall awning sits bottom-right: six alternating amber/chalk panels above a dark rounded valance bar. A thick, faint chalk stroke curls up the left side like rising smoke. A mint hanging sign with a dark circular emblem swings ±7° on a wire at `sin(t*1.2)`. Ambient clock 1.9 — the busiest here.

## Motion

Cameras: pushR → hopU → zoomIn → pushL → drop → **spin**, multiplier **7**, offset 2. Magnitude rot 1.1, driftX 9, driftY 8. Titles enter on **bounce**, items on **pop**. Default motion preset is Bouncy. Feature cards use the `tilt` treatment and montage tilts run to ±3° — nothing is perfectly level.

## Beats

- **Scroll / ticker** — a marquee rail of tonight's stalls, dishes or acts.
- **Cursor / click** — a cursor taps through an order or selection.
- **Notify / pop** — alert cards pop in place rather than sliding.
- **Ring / bar** — bars fill to show stalls lit, capacity or sell-through.

## Best for

Night markets and food halls, festivals and street fairs, bars and late venues, delivery and ordering apps with a street identity, and any brand whose peak hour is after dark.
