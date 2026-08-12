---
name: rainy-window
label: Rainy Window
orientation: portrait
fontFamily: Merriweather
---

# Rainy Window

# Rainy Window

A 9:16 slate-glass film where the backdrop is the window itself — falling drops, breathing street bokeh and two condensation runnels that wander the full height of the frame.

## Palette

| role | hex |
|---|---|
| slate | `#2c3440` |
| glass | `#39424f` |
| bokeh | `#f2b552` |
| drop | `#7ac7e0` |
| paper | `#eef1f2` |
| ink | `#1a2027` |

Ground alternates `slate` (hook, feature, stats) and `ink` (statement, montage, CTA); type always `paper`. `glass` is the panel fill for cards and tiles. Highlights alternate amber `bokeh` and blue `drop`. Tweakables expose the evening tone and the streetlight colour.

## Type

Display **Merriweather** (ships true italics) · body **Public Sans**.
Sentence case, leading `1.14`. Hook 112px, statement 136px, stats numerals 148px. Chips are outlines; the feature card is a `frame` on `glass` with a paper hairline at radius 22.

## World

Runs at 1.6× film time on the hook, feature and stats beats:

- Seven bokeh discs (r 34–78) across the upper half, each breathing on its own sine at ~16–32% alpha, cycling amber `#f2b552`, blue `#7ac7e0` and rose `#e8788a`.
- Twelve raindrops falling at 180–420px/s, each drawn as a 46px `drop`-coloured streak at 35% alpha with a solid 5–9px head at 70%.
- Two long condensation runnels — one at 12% frame width, one at 88% — running the full height with control points wobbling on `sin(t * 0.6)` and `sin(t * 0.5)`, at 28% and 22% alpha.

## Motion

Camera set `zoomOut · pushD · pushL · zoomIn · pushR · hopU`, stepped `i × 3 + 0`.
Magnitudes are the smallest in this batch: rotation `0.4`, drift `5 / 5`, inner `0.28`, z-drift `0.04`.
Title entrance **drowse** (34px over a 0.46 window on outQuint), item entrance **rise**. Cut `push`, drift 1.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta. This pack owns:

- **Typing (`typewriter`)** — characters set with per-glyph rotation and vertical jitter, closing on a double-ruled stamp rotated −2°.
- **Scroll (`feed`)** — a tall glass panel of numbered rows scrolling under a live scrollbar thumb.
- **Ring (`ring`)** — a 240px circular gauge with twelve tick marks sweeping to a counted number with a unit suffix.
- **Notify (`drop`)** — notification cards falling in from above with a brand-initial avatar and a `now` timestamp.

Montage tiles tilt gently, −1.5 / 1 / 1.5 / −1.

## Best for

Cosy retail and homeware, reading, journaling and sleep apps, tea and coffee, weather and insurance, indie games and podcasts — anything whose pitch is staying in.

