---
name: aurora-night
label: Aurora Night
orientation: portrait
fontFamily: Sora
---

# Aurora Night

A sky that keeps moving over a horizon that never does — dark-mode glow, at the calmest tempo in the family.

## Palette

| Role | Hex |
|---|---|
| arctic (night) | #0e1b2e |
| green (aurora) | #57e6a8 |
| violet | #8f7ae0 |
| ice | #dfe9f2 |
| ink | #0a1220 |

Night and aurora are tweakable (arctic → indigo #101026 or teal #0c2226; green → cyan #57cfe6 or lime #a8e657).

## Type

Sora 400–700 sets headlines in sentence case, 94px on montage to 148px on the statement. Atkinson Hyperlegible — a legibility-first face — takes kickers, chips, ticker rows and stat captions, which keeps small copy readable against the glow. The hook kicker is an outline tag in aurora green.

## World

Three aurora bands, each a nine-point sine polyline of amplitude 70px running at speeds 0.50 / 0.64 / 0.78. Every band renders twice: once as a filled curtain dropping off the bottom of the frame (12%, 10%, 8% opacity) and once as a bright ribbon stroked at 55% with widths 5 / 4 / 3. Band two is violet; bands one and three are green. Twenty stars sit in the top 55% of the frame and twinkle independently on `0.3 + 0.5·|sin(t + i·1.9)|`. Across the bottom, a jagged mountain ridge in flat ink — the one thing on screen that never moves. Ambient clock 1.5, the lowest here. World shows on hook, feature, stats and app beats.

## Motion

Cams zoomOut, pushD, pushL, hopU, pushR, zoomIn (mul 5, offset 0) with `rot 0.5, driftY 10, inn 0.28, dz 0.045` — vertical breathing, the largest driftY in this set. Titles and items both **rise**. Note the hook's title top is 900: type sits on the horizon and the sky takes the upper two thirds.

## Beats

- **Ring (ring)** — a full circular gauge sweeping to a value (probability, cloud cover).
- **Scroll (ticker)** — a timed run sheet ticking past, row by row.
- **Code (terminal)** — a terminal window typing a query and returning a result.
- **Notify (side)** — alerts sliding in from the edge.
- Feature cards are **glow** panels (#0a1220, green halo, radius 24, ice hairline) with green/violet pill chips; montage tiles carry a violet halo; the stats beat sets `glowNums` so the numerals emit; the CTA is ink with a glowing green button.

## Best for

Dark-mode SaaS and developer tools, observability and monitoring, AI and data products, crypto and fintech dashboards, astronomy and science outreach, arctic and winter travel, night events — anything that should look expensive with the lights off.
