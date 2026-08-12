---
name: storybook-pop
label: Storybook
orientation: portrait
fontFamily: Bitter
---

# Storybook

# Storybook Pop

A 9:16 cream-page film whose backdrop is a physical open book — a page turning back and forth forever under drifting gold sparkles.

## Palette

| role | hex |
|---|---|
| page | `#f8efdf` |
| ink | `#37302a` |
| ribbon | `#cf4633` |
| forest | `#3e6b4c` |
| gold | `#d9a13b` |
| paper | `#fffdf6` |

Ground `page` on hook and feature; statement and stats go `forest` green with gold highlights; the montage drops to full `ink`; the CTA takes the whole frame in `ribbon` red. Tweakables expose the page tint and the ribbon colour.

## Type

Display **Bitter** (slab serif, ships true italics) · body **Nunito Sans**.
Sentence case, leading `1.1`. Hook 116px, statement 140px, stats numerals 152px. Chips are pills; the feature card is the `paper` variant with an ink hairline.

## World

Runs at 1.5× film time on the hook and feature beats:

- Two facing book leaves drawn as curved paths — `paper` verso, `page` recto — each outlined at 25% ink, meeting at a centre spine.
- Four handwritten rule lines (5px, round caps, 22% ink) across the verso.
- A `ribbon` bookmark, 20×150 with rounded ends, hanging from the spine.
- A turning page: a `paper` leaf at 92% opacity whose control points sweep from +420 to −420 on a triangle wave of `t * 0.35` — it turns forward, then back, endlessly.
- Ten four-point `gold` sparkles rising from below the book, each on its own horizontal sine (±36% of frame width) and twinkling on `sin(t * 2 + i)`.

## Motion

Camera set `pushR · drop · zoomOut · pushL · hopU · zoomIn`, stepped `i × 3 + 1` — the lowest camera multiplier in this batch.
Magnitudes: rotation `0.9`, y-drift `8`, inner `0.27`.
Title entrance **drowse** (the slowest preset — 34px over a 0.46 window on outQuint), item entrance **pop**. Cut `push`, drift 1.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta. This pack owns:

- **Typing (`typewriter`)** — every character is set at a small random rotation and vertical jitter, like struck type, closing on a double-ruled stamp rotated −2°.
- **Scroll (`stack`)** — cards dealt one at a time: the top card lifts 240px and rotates −5° away while the next scales up behind it, with an `n / N` counter.
- **Morph (`roll`)** — one word rolls up into the next over a progress bar.
- **DragDrop (`drag`)** — a chip is picked up, arced along a sine into a dashed slot, and locked in with a tick badge.

Montage tiles tilt −3 / 2.5 / 2 / −2.5 on a dark ink ground.

## Best for

Children's publishing and picture books, family and bedtime apps, schools and courses, nonprofits and libraries, illustrated brands that want warmth over polish.

