---
name: prop-wash
label: Prop Wash
orientation: portrait
fontFamily: Orbitron
---

# Prop Wash

An FPV night heat: carbon dark, LED gates rushing the lens, and a HUD that never stops counting.

## Palette

| Role | Hex | Where it lands |
|---|---|---|
| carbon | #14161a | primary ground — hook, feature, stats, app |
| cyan | #29d3e8 | gates, highlight, statement ground, CTA button |
| magenta | #ff2e88 | alternate gates, kicker tag, canopy dot, tile glow |
| grey | #aab4c0 | arms, third chip, secondary stat column |
| white | #f0f4f6 | all type, airframe body, card keylines |

Montage and CTA sit on `#101216`; app cards on `#1c2026`; desk `#0e1014`.

## Type

**Orbitron** 500–700 sets titles at 86–144px with `upper: true` on every beat and 0.04em tracking — a geometric techno face that reads as instrumentation. **Exo 2** 400–700 handles firmware lines, ring labels, notice bodies and captions. Stat numbers render at 144px with `glowNums` on.

## World

Three race gates: rounded rects (340×380 at scale) whose scale ramps 0.3 → 1.5 across a phase-offset cycle, stroked 10px in alternating cyan and magenta and fading out over the last 15% — they arrive from depth and blow past. A quadcopter flies a Lissajous path (±200px x on `sin(0.9t)`, ±120px y on `cos(1.3t)`), banking ±30° on `sin(1.4t)`: a 52×24 white body, four grey arms to the corners, each ending in a cyan prop ellipse rotating at 900°/s, plus a magenta canopy dot. Four speed streaks scroll right-to-left at 1000px/s at descending stroke weights. Bottom-right, live Orbitron 30px text reads `LAP n · 18.4s`, both values driven off the clock. World shows on hook, feature, stats, CTA and app.

## Motion

Camera set: `pushL, zoomIn, spin, pushR, pushU, drop` at multiplier 7, offset 3 — the hardest in the library group. Magnitudes: 6° skew, 1.3° roll, 0.34 slide, 0.15 inner ease. Titles **streak**; items **slam**. Ambient 2.0, tweak default motion `Bouncy`.

## Beats

- **Code / diff** — a firmware tune shown as red/green diff lines with a `flashed ✓` output.
- **Ring / bar** — pack voltage as a horizontal bar, not a dial.
- **Cursor / slider** — throttle curve dragged live, with an armed toggle.
- **Notify / side** — race-control alerts slide in from the edge.
- **Statement** flips to a full cyan ground with carbon type at 132px — a hard flash frame between dark beats. Cards use `glow` (cyan bloom on `#101216`), the CTA button glows cyan on carbon.

## Best for

Drone and motorsport leagues, esports and gaming hardware; performance components, energy drinks, dev tools with a hardware edge; anything that has to feel fast and instrumented at the same time.
