---
name: kiln-and-clay
label: Kiln & Clay
orientation: portrait
fontFamily: Gloock
---

# Kiln & Clay

A wheel-thrown ceramics studio rendered as a film: oatmeal paper, terracotta shout, and a pot that grows while you read.

## Palette

| Role | Hex | Use |
|---|---|---|
| studio | `#f1e9df` | the default ground — warm oatmeal paper |
| rust | `#b85c38` | terracotta accent; full-bleed on Statement, pill on CTA |
| char | `#33302c` | fired-dark type colour and the Montage/CTA ground |
| slip | `#7e93a0` | grey-blue kicker, third chip |
| glaze | `#5f9e94` | celadon — firing curve, chips, stat column |

Desk surround `#2a2622`. App-beat card `#faf5ec`.

## Type

Display: **Gloock**, a high-contrast modern serif — titles run 92–150px at 1.08 line, sentence case (no uppercase flag on any beat), so the serif keeps its lowercase shapes. Body: **Schibsted Grotesk** at 400–700 for kickers, chips, tile labels and the world's `cone 6 · 1222°C` annotation.

## World

Shown on Hook, Feature, Stats and App. Three layers:
1. **The wheel** (lower right): a wobbling shadow ellipse plus a rust vessel silhouette whose profile is driven by `seg(p, 0.1, 0.7)` — it climbs ~110px taller and scales from 0.72× to 1.0× wide across the beat, with a translucent rim ellipse floating at the new lip.
2. **The firing curve**: a ten-step zig-zag stroked 6px in 50% glaze, revealed by dash-offset over `seg(p, 0.1, 0.8)`, captioned in Schibsted Grotesk.
3. **The drying shelf**: three outlined pot profiles of increasing height along the bottom, 40% char, 5px stroke.

Ambient clock 1.5 — slow but not still.

## Motion

Cams `zoomOut · pushL · hopU · pushR · zoomIn · drop`, cadence multiplier 5, offset 2. Magnitudes are gentle: rot 0.5, driftY 7, ease-in 0.27. Titles use **drowse** (opacity ramp + 34px lift on outQuint); items **rise**. Default motion setting: Calm.

## Beats

- **DragDrop `drag`** — a chip is pointer-dragged along an arc into a dashed slot, the slot fills, a tick badge pops and a "locked in" line rises. Loading the kiln.
- **Ring `ring`** — full circular dial, 12 tick marks, 30px stroke sweeping to the target with the number centred.
- **Typing `hand`** — words land one at a time, each rotated ±2.6° and scaling down from 1.35×, every fourth word in rust; ends with an underlined stamp. Reads as handwriting, not typing.
- **Scroll `stack`** — a deck where the top card lifts, rotates −5° and clears out, with an n/total counter.

## Best for

Ceramics and craft studios, class and workshop signups, makers' markets, artisan homeware, slow-craft food brands, anything where "made by hand, over time" is the pitch.
