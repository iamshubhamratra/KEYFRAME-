---
name: ink-brush
label: Ink & Brush
orientation: portrait
fontFamily: Cormorant Garamond
---

# Ink & Brush

# Ink & Brush

A 9:16 rice-paper film where a brush draws the backdrop in real time and a single vermilion seal is the only loud thing on screen.

## Palette

| role | hex |
|---|---|
| rice | `#f2ede2` |
| ink | `#26221e` |
| wash | `#8d8478` |
| seal | `#c93b2a` |
| paper | `#faf7ef` |

Ground `rice`, text `ink`, accent `seal`. The film alternates: hook / feature / CTA sit on rice paper, statement and stats flip to a full `ink` ground with `paper` type, and the montage drops onto mid-grey `wash`. Tweakables expose the paper tone and the seal colour only.

## Type

Display **Cormorant Garamond** (Georgia fallback, serif) at 92–148px · body **Commissioner**.
Sentence case throughout — no beat sets `upper`. Leading `1.14`, no extra tracking. The hook runs 118px at a 300px top offset; the statement is the largest type in the pack at 148px.

## World

Drawn live on every beat flagged `world` (hook, feature, CTA), at 1.4× film time:

- A 1600-unit brush stroke, 26px wide with round caps, sweeping from the left edge across the lower third — revealed by `strokeDashoffset` between 4% and 70% of the beat, so it is literally painted on.
- A second 900-unit stroke, 16px wide, falling down the right side between 20% and 85%.
- Three pale `wash` ellipses (rx 300, ry 46, 14% alpha) sliding sideways at staggered speeds — the paper's grain.
- A broken ink circle at the top-left (r 90, dash `420 999`) rotating slowly on `-t * 30`.
- A `seal`-red 88×88 rounded stamp in the bottom-right, rotated −4°, with three `paper` bars across it.

## Motion

Camera set `pushL · zoomOut · pushU · pushR · drop · zoomIn`, stepped `i × 5 + 0`.
Magnitudes are deliberately tiny: rotation `0.5`, drift `6 / 9`, inner `0.3`, z-drift `0.04`.
Title entrance **machete** (slides in from the left with a −6° skew), item entrance **rise**. Cut `push`, drift 1.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta. This pack owns:

- **Typing (`hand`)** — the text arrives word by word, each word rotated ±2° and scaling 1.35 → 1, every fourth word in `seal`, ending on an underlined hand-drawn stamp.
- **Morph (`roll`)** — one word rolls up into the next like an odometer, over a thin progress bar.
- **Scroll (`feed`)** — a numbered ledger panel scrolling under a live scrollbar thumb.
- **Ring (`ring`)** — a 240px circular gauge with twelve tick marks sweeping to a counted number.

Feature card is a `frame`: ink card, paper hairline, radius 8, outline chips.

## Best for

Tea and coffee houses, stationery and paper goods, ceramics and craft studios, meditation and journaling apps, editorial brands that want restraint rather than volume.

