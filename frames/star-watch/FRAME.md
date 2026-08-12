---
name: star-watch
label: Star Watch
orientation: portrait
fontFamily: Prata
---

# Star Watch

Deep-night observatory pack: gold light on midnight indigo, with a starfield that never leaves the frame.

## Palette

| Role | Hex | Used for |
|---|---|---|
| midnight | `#0b1026` | primary ground (hook, feature, stats, app) |
| ink | `#070b1c` | inverted ground (statement, montage, CTA), card fill |
| paper | `#ece9f4` | all body and title copy |
| star | `#ffd97b` | highlight, glow halos, CTA button, stat accent |
| lilac | `#9a8fd0` | kicker, tile labels, telescope, secondary stat |

## Type

Display: **Prata** (high-contrast serif) — mixed case, line-height 1.10, titles 92–148px. Body: **Manrope** 400–700. Titles sit low on the hook (top 840) so the sky reads above them, and rise to 250 on working beats.

## World

On every beat (`world: true` across all seven looks). Four layers: 26 stars scattered on a deterministic lattice, each pulsing opacity 0.25→0.80 on its own phase; a five-point constellation whose gold polyline draws on via stroke-dashoffset across scene progress 0.1→0.7, its nodes lighting in sequence; a white meteor that streaks down-right and fades out on a ~6s loop; and a lilac telescope on a trapezoid tripod anchored bottom-left, with a gold star pinned at the lens. Ambient clock 1.4.

## Motion

Cameras: zoomOut → pushU → drop → pushL → zoomIn → pushR, multiplier 5, offset 0. Magnitudes are the gentlest in the batch: rot 0.3, driftY 10, inner 0.3, driftZ 0.035. Titles enter on **drowse** (a slow settle), items on **rise**. Default motion preset is Calm — cuts are soft and never punch.

## Beats

- **Ring / gauge** — a circular dial fills to report a condition (seeing, clarity, capacity).
- **Scroll / ticker** — a horizontal rail of items marquees past.
- **Typing / caret** — text types in behind a blinking caret; the deck uses it for timestamped field notes.
- **Notify / side** — bulletin cards slide in from the edge and stack.

## Best for

Planetariums, observatories, science museums, dark-sky tourism, astronomy courses, night-time ticketed events, and any brand selling patience and wonder rather than speed.
