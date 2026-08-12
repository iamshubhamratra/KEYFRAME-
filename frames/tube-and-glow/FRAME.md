---
name: tube-and-glow
label: Tube & Glow
orientation: portrait
fontFamily: Monoton
---

# Tube & Glow

A hand-bent neon shop at closing time — one OPEN sign flickering, one torch cooling, everything else glowing.

## Palette

| Role | Hex | Where it lands |
|---|---|---|
| shop | #121016 | primary ground — hook, feature, stats, app |
| pink | #ff3ec8 | highlight, sign letters, glow, CTA button |
| blue | #2ee6ff | kicker outline, sign frame, script squiggle, feature highlight |
| warm | #fff3d6 | all type, bench rack, marquee bulbs |
| ink | #0d0b11 | statement / montage / CTA ground |

Cards sit on `#0e0c12` with a pink bloom; app cards on `#1c1822`; desk `#0c0a10`.

## Type

**Monoton** — a single-weight neon outline face — sets titles at 76–92px on a generous 1.22 line with 0.05em tracking, and `upper: true` everywhere. It is a hollow-stroke display, so it is kept small and airy on purpose; **Epilogue** 400–700 does all the real reading (work orders, switch rows, ledger captions, bench notes). Stat numbers at 130px with `glowNums`.

## World

Top-right, an OPEN sign: a 320×160 blue rounded-rect frame and the word OPEN in Monoton 64px pink, both driven by a two-frequency flicker gate — `sin(11t) > -0.7 AND sin(3.7t) > -0.85`. When lit, full pink with a 14px pink `drop-shadow`; when out, frame drops to 0.2 and letters to 0.25 opacity. Lower-left, a blue neon script wave: a 7px quadratic path with a 10px blue glow. Above it a 6px pink hook bend. Three warm marquee bulbs pulse out of phase on `sin(4t + i)`. A bending-bench rack rotated -6° holds two 7px uprights and four rungs in 35% warm. Bottom-right, a pink tube coil breathes r=30±4 on `sin(2t)`. Unusually, `world: true` on the statement and CTA beats too — the neon never goes out behind the big lines.

## Motion

Camera set: `zoomIn, pushR, drop, pushL, zoomOut, spin` at multiplier 7, offset 2. Magnitudes are modest for that multiplier — 0.8° roll, 0.2 inner ease, no skew or slide — so the moves are wide and swinging rather than violent. Titles **machete**; items **pop**. Ambient 1.7, tweak default motion `Lively`.

## Beats

- **Cursor / click** — a POWER ON button is pressed, a transformer test runs, the sign answers `SHE HUMS ✓`.
- **Toggle / switch** — the window display lit item by item: flamingo, OPEN, cocktail glass, arrow.
- **Typing / caret** — a commission work order typed with a live caret and a `bendable` stamp.
- **Morph / fade** — the sign crossfades through what it could say.
- **Notify / drop** style bench notes; CTA glows pink on ink with a circular logo lockup.

## Best for

Bars, music venues, tattoo and barber shops, late-night food and arcades; sign makers, lighting and hardware craft; any brand whose identity is a lit storefront.
