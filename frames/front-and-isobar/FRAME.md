---
name: front-and-isobar
label: Front & Isobar
orientation: portrait
fontFamily: Space Mono
---

# Front & Isobar

A hilltop met station: chart paper, blue isobars, one orange low, and a front due Friday.

## Palette

| Role | Hex | Where it lands |
|---|---|---|
| chart | #f0ead8 | primary ground — hook, feature, stats, app; type on dark beats |
| isobar | #2e5fb3 | contours, front arc, kicker tag, CTA ground, feature highlight |
| warn | #e8641f | the low marker, highlight word on chart and slate |
| slate | #37424e | statement + montage ground, card fill |
| ink | #1e242c | type on chart, wind barbs, tile keylines |

App cards lift to `#faf6ea`; desk `#d8d2c0` — this is the light-ground pack of the group.

## Type

**Space Mono** 400/700 sets the display at 82–116px on a 1.14 line with 0.01em tracking and `upper: true` — a monospace title face, which is the whole tonal trick: it reads as transmitted record, not marketing. **Familjen Grotesk** 400–700 carries station-board rows, gauge labels, forecast notices and stat captions. Stats get `rule: true` (hairlines under the numbers) at 138px.

## World

Four isobars: 8-point polylines spanning full width at y = 260 + 120i, each undulating on `sin(0.4t + 0.8k + 1.2i) × 30`, stroked 3px in isobar blue at falling opacity 0.45 → 0.24, with `1016` and `1012` labelled in Space Mono 24px. A warm front sweeps left to right at 60px/s: a 6px blue arc carrying three solid blue triangular pips positioned at 25/55/85% of its length. Two ink wind barbs on the right rock ±14° around a 30° rest. Six blue wind ticks scroll downward at 140px/s at 50% opacity. And an orange dashed circle (r44, `10 8` dash) rotates at 30°/s with a Space Mono `L` at its centre — the low-pressure marker. World shows on hook, feature, stats and app.

## Motion

Camera set: `pushL, zoomOut, pushU, pushR, zoomIn, drop` at multiplier 5, offset 0 — the most orderly rig here. Magnitudes: 0.4° roll, 0.28 slide, 6px drift. Titles **rise**; items **machete** (a clean horizontal cut). Ambient 1.6, tweak default motion `Lively`. Montage tilts are all zero — instrument-grid discipline, no scrapbook.

## Beats

- **Typing / terminal** — a raw METAR line types into an obs feed and gets a `transmitted` stamp.
- **Ring / gauge** — the barometer as a real dial, labelled `1016 hPa, STEADY`.
- **Scroll / board** — the station board: temp, wind, dewpoint, pressure with live values.
- **Notify / drop** — forecast-desk alerts drop in from the top.
- **Statement** cuts to slate with chart type at 116px; **CTA** takes isobar blue with a chart-white block button.

## Best for

Dashboards, monitoring and observability tools, analytics and data products; climate, marine, aviation and agri-tech; public-sector information, logistics and anything whose credibility rests on a reading.
