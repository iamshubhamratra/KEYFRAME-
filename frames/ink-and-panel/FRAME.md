---
name: ink-and-panel
label: Ink & Panel
orientation: portrait
fontFamily: Bangers
---

# Ink & Panel

A comics studio mid-deadline: bristol paper, four-colour ink, and a camera that never sits still.

## Palette

| Role | Hex |
| --- | --- |
| bristol (paper ground) | `#f6f4ec` |
| inkk (line, dark ground) | `#1a1a1e` |
| action (flood accent) | `#e8402e` |
| cyan (Ben-Day, chips) | `#3cb8e8` |
| yellow (kicker tag, CTA ground) | `#f2c14b` |
| desk (stage surround) | `#d8d4c8` |

Hook / Feature / Stats / App on bristol with ink type and action highlights. Statement floods full action red with bristol type and yellow highlights at 156px. Montage floods ink with bristol tiles. CTA floods yellow with an ink block button.

## Type

**Bangers** (comic lettering) for all titles, line-height 1.02, 0.03em tracking, **uppercase on every beat**. **Lexend** 400–700 for kickers, captions, chip labels and body. Cards use a 6px radius and tiles 4px — corners stay hard, like printed panels.

## World

Runs on Hook, Feature, Stats and App; the red Statement, ink Montage and yellow CTA beats go clean.

- A 340×460 panel border at the right strokes itself in over the first half of the beat via a 2200-unit dash, then a horizontal gutter line snaps in at 60% and a vertical one at 80%.
- Thirty cyan Ben-Day dots in a 6×5 grid, radii shrinking left to right.
- A twenty-point yellow starburst punches in on outBack between 40% and 62%, 5px ink outline, with **POW!** set in Bangers at 54px, action red on an ink stroke, rotated -8°.
- Five speed lines rotated -16° whose lengths cycle on the world clock, weights 6px down to 2px.
- A red dashed circle at the lower left spinning at 80°/s.

## Motion

Cams `pushR, spin, pushL, zoomIn, hopU, drop` at multiplier **7** (joint hardest in the library), offset 0. Magnitudes: 4° skew, 1.3° roll, 0.17 inner. Titles use **slam** (outExpo from 2.2× scale and -4°); items **pop**. Default energy **Bouncy** (1.35). Ambient world clock 1.9.

## Beats

- **Typing → typewriter** — each character lands individually, rotated ±2.6° and nudged vertically, then a double-border stamp rotates in. The script page.
- **Morph → flap** — split-flap character tiles, each cell scaling through zero at a staggered offset. The SFX word changing.
- **DragDrop → assemble** — a chip flies in on an arc, lands in a dashed slot, shakes on a decaying 5-cycle sine, then a tick badge pops. Literal paste-up.
- **Scroll → stack** — a card deck where the top card lifts, rotates 5° and clears to reveal the next, with an n/N counter. Panel by panel.
- Plus Hook (yellow tag kicker), Statement, Feature (ink frame card, square chips), Montage (±3° tilts, the most cocked here), Stats with a rule, Swipe and CTA.

## Best for

Comics and graphic novels, indie games, streetwear and merch drops, conventions, zines and print shops, anything that wants to be heard from across the room.
