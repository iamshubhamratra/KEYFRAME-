---
name: city-pulse
label: City Pulse
orientation: portrait
fontFamily: Oswald
---

# City Pulse

A night city that behaves like a system — windows blink on their own clocks, traffic pulses, and the deck talks about the city's API.

## Palette
| Role | Hex |
|---|---|
| steel | #1d2735 |
| block | #28354a |
| window | #f0b954 |
| sign | #4fd8c4 |
| paper | #eef0f4 |
| ink | #141a24 |
| desk | #12161e |

## Type
Oswald (400–700) sets all titles in forced uppercase at 100–164px with near-zero tracking (0.01em) and a `flip` entrance — lines rotate in on their own axis like a departures board. Work Sans (400–800) does body, feed rows, toast copy and editor gutters. Stats numbers run 150px with glow enabled.

## World
A live skyline, drawn on hook, feature and stats. Five tower blocks at 210-unit spacing, 160 wide, heights stepping 420/600/780 — each carrying a 3×4 grid of windows whose on/off state is `sin(t·(0.6 + blockIndex·0.13) + i·2.1 + block) > 0.05`, so every tower flickers on its own phase and no two blocks ever match. A construction crane sits high left as three translucent paper strokes with a hook line that swings 30 units on sin(t·0.7). A red aviation beacon blinks hard on/off at 2.4Hz atop a mast at x890. Three light-trail bars — teal, amber, teal — sweep right-to-left along the base at 240/310/380 units per second at staggered heights. Ambient clock 1.9, the busiest of its family bar the arcade.

## Motion
Six-move set — pushU, zoomIn, pushL, drop, pushR, zoomOut — strided by 7 from offset 3, which walks the list forward through all six. Skew 6 is the signature: the frame shears rather than rolls, so towers lean like a wide lens. Horizontal drift 6 and z-drift 0.065 add parallax. Titles `flip`, items `rise`. Montage tilts are all exactly zero — this is the pack that refuses hand-made wobble.

## Beats
- **Notify (side)** — toasts sliding in from the frame edge; alerts, arrivals, briefings.
- **Scroll (stack)** — a stacked departures/nearby feed advancing card by card.
- **Cursor (click)** — a pointer travelling and clicking a real control.
- **Code (editor)** — a syntax-lit editor panel, for API and query storytelling.
- Feature cards are `glow` (#10151d, teal bloom, paper rule) and stats numbers glow — the two places a product screenshot sits cleanly.

## Best for
Transit and mobility apps, city guides and nightlife, urban data and civic-tech dashboards, developer platforms with an API story, delivery and logistics, and any dark-mode product that wants a real skyline behind it.

