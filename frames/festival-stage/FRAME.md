---
name: festival-stage
label: Festival
orientation: portrait
fontFamily: Bungee
---

# Festival

# Festival Stage

A 9:16 night-ground film with swinging beam lights, falling confetti and a crowd silhouette that waves along the bottom of every world beat.

## Palette

| role | hex |
|---|---|
| night | `#191227` |
| violet | `#8f5cff` |
| hot | `#ff4f9a` |
| lime | `#c8f04f` |
| paper | `#f6f2ff` |
| ink | `#120d1e` |

Ground alternates `night` (hook, feature, stats) and `ink` (statement, montage, CTA), type always `paper`. Highlights rotate lime → hot → violet. Tweakables expose the night tone and the beam colour.

## Type

Display **Bungee** (blocky poster face) · body **Rubik**.
All beats uppercase, leading `1.12`. Hook 112px, statement 132px, CTA 110px on a lime `glow` button.

## World

Runs at 2× film time on the hook, feature and stats beats:

- Two beam polygons from above the frame down to the stage line — one `violet`, one `hot`, 22% alpha — each swinging on its own sine (`0.7` and `0.93` rad/s, ±34 units, counter-phased).
- Fourteen confetti rectangles (12×18, rx 2) in hot / lime / violet / paper, falling at 90–192px/s while spinning at 120°/s and wobbling horizontally on `sin(t + i)`.
- A solid `ink` crowd wave along the bottom: a quadratic ridge ~240px tall spanning the frame.
- Seven thick raised-arm strokes (12px, round caps) above the crowd line, swaying on `sin(t * 2.2 + i)`.

## Motion

Camera set `hopU · spin · pushL · zoomIn · pushR · drop`, stepped `i × 5 + 3`.
Magnitudes: rotation `1.5`, x-drift `11`, z-drift `0.075`.
Title entrance **bounce** (drops 110px and overshoots on outBack), item entrance **pop**. Cut `push`, drift 1.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta. This pack owns:

- **Notify (`pop`)** — pill-shaped toasts scaling in from 0.3 at staggered horizontal offsets and rotations, each with a highlight dot and a hot outline.
- **Swipe (`swipe`)** — a three-card deck where the top card is flung 1100px right and up at +18° with a stamp, promoting the two below it.
- **Cursor (`slider`)** — a large percentage counter driven by a dragged slider knob plus a toggle flip, with a drawn pointer.
- **Toggle (`dial`)** — a 2×2 grid of rotary knobs whose needles sweep from −120° into position and ring themselves when they land.

Cards are `glow` with a hot-pink glow at radius 20; montage tiles tilt −2.5 / 2 / 2.5 / −2.

## Best for

Music festivals and club nights, ticketing and event apps, energy drinks and streetwear, sports drops, student and youth brands.

