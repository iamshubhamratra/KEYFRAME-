---
name: scale-line
label: Scale Line
orientation: portrait
fontFamily: Staatliches
---

# Scale Line

A club-night HO layout: green baize, a red loco on a real loop, and a semaphore that keeps changing its mind.

## Palette

| Role | Hex | Where it lands |
|---|---|---|
| baize | #31402e | primary ground — hook, feature, stats, app |
| cream | #f0e9da | all type, sleepers, tile keylines, CTA button |
| signal | #c23b2e | highlight, kicker tag, lead loco, semaphore arm |
| maroon | #7a2e35 | trailing coaches, tree trunks, CTA ground |
| slate | #3a4148 | statement + montage ground, rail bed, card fill, wheels |

App cards lift to `#3e5039`; desk `#242e22`. Trees use a separate `#4a6e42`; the clear lamp goes `#3fbf5a`.

## Type

**Staatliches** — single-weight condensed poster caps — sets titles at 92–150px with 0.03em tracking and `upper: true` on every beat; it is the enamel station-sign voice. **Onest** 400–700 runs timetable rows, throttle captions, lever labels and stat captions. Stats carry `rule: true` at 150px.

## World

A stadium-shaped track loop: a rounded rect inset 90px with `rx 200`, drawn twice — a 22px slate rail bed under a 3px cream dashed centre line (`14 12`) for sleepers. Three cars circulate it on a genuine parametric path (two straights plus two 200-radius arcs), phase-spaced 0.045 apart at 0.14 laps/second, each rotating correctly through the curves: the lead car in signal red with a slate cab roof box, two followers in maroon, all with a pair of slate wheels. Top-right, a slate station — a 160×90 body plus a semicircular roof arc. Three conifers (spire polygons in `#4a6e42` with maroon trunks) stand at two heights. Left of frame, a semaphore: a cream 7px post, a signal-red arm that snaps between -30° (clear) and 0° (danger) as `sin(1.2t)` crosses zero, and a lamp below that flips green ↔ red to match. World shows on hook, feature, stats and app.

## Motion

Camera set: `zoomIn, pushL, hopU, pushR, zoomOut, drop` at multiplier 5, offset 1 — the `hopU` gives it a shunt. Magnitudes 0.6° roll, 0.24 inner ease, 6px drift. Titles **stamp**; items **rise**. Ambient 1.6, tweak default motion `Lively`. Montage tilts are all zero — album-page tidiness.

## Beats

- **Cursor / slider** — a DCC throttle pushed to notch 4 with a sound toggle.
- **Toggle / switch** — signal-box levers thrown one at a time.
- **Scroll / board** — the miniature timetable, five services against 24-hour times.
- **Morph / roll** — a destination blind rolling through stops.
- **Statement** cuts to slate at 148px; **CTA** lands on maroon with a cream block button and a rounded logo lockup.

## Best for

Hobby clubs, museums and heritage attractions; rail, transit and logistics; model, toy and kit brands; makerspaces, scale modelling, and anything organised around routes, schedules or a hand-built world.
