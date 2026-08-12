---
name: metro-line
label: Metro Line
orientation: portrait
fontFamily: Barlow Condensed
---

# Metro Line

A living transit diagram: map paper, four line colours, and a train that keeps its own timetable.

## Palette

| Role | Hex |
|---|---|
| paper (map) | #f4f4f0 |
| red (line A) | #d9363e |
| blue | #2f6db5 |
| green | #3f9b57 |
| yellow | #e8b820 |
| ink | #1d1d1b |

Map stock and Line A are tweakable (paper → cool #eef2f4 or cream #f4efe4; red → magenta #c2477e or orange #e05e2c).

## Type

Barlow Condensed 500–700 sets every headline **in caps**, 100px on montage to 160px on the statement, tracked +0.01em — enamel-sign proportions. Barlow (normal width) takes kickers, chips, row labels and stat captions. The kicker is a solid red tag.

## World

Four service routes drawn as 16px rounded polylines at 50% opacity, all corners at 45° in the Beck idiom: red descending left-to-centre, blue crossing low, green from the top edge, yellow down the right. Eight interchange stations sit on the crossings as white circles with a 5px ink ring. A train — a 52×30 rounded rect in red with two white windows — interpolates along the red route's three segments, one complete run every ~6.3s. At the bottom, an ink rule at 25% opacity extends 60→360px and resets: the platform tick. Ambient clock 1.8. World shows on hook, feature, stats and app beats.

## Motion

Cams pushL, pushU, zoomOut, pushR, pushD, zoomIn (mul 7, offset 1). Magnitudes are `rot 0, skew 0, slide 0.32, drift 5/4, dz 0.035` — strictly orthogonal. The frame pans and pushes like a map under glass; nothing ever tilts. Titles **streak** in; items **rise**.

## Beats

- **Morph (flap)** — the signature: split-flap characters clatter from one word to the next.
- **Scroll (board)** — a departures board scrolling rows of destination + time.
- **Notify (drop)** — service alerts dropping in from the top.
- **Ring (bar)** — a horizontal bar gauge for on-time / electrification scores.
- Feature and montage put screenshots inside an ink panel (radius 14, paper hairline) with square line-badge chips in red/blue/green; stats sit on paper with a rule and 158px numerals; the CTA floods full red with a paper block button.

## Best for

Transit authorities and journey planners, logistics and last-mile delivery, fleet and routing software, city and civic services, schedules and status dashboards, wayfinding and signage systems, anything measured in departures.
