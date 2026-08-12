---
name: space-hop
label: Space Hop
orientation: portrait
fontFamily: Righteous
---

# Space Hop

A cartoon rocket climbing a slow, twinkling void — with the hardest camera in the family and mission-control mechanics underneath.

## Palette
| Role | Hex |
|---|---|
| space | #0b0f2a |
| mint | #6be0b8 |
| coral | #ff6b4a |
| violet | #8f7ae0 |
| paper | #f2f4ff |
| ink | #070a1e |
| desk | #06081c |

## Type
Righteous — a rounded, slightly retro-futurist geometric — sets titles at 98–156px in sentence case with a `bounce` entrance, so lines land and settle rather than slam. Chivo (400–700) keeps body, diff gutters, terminal lines and stat labels neutral and readable. Stats numbers run 154px with glow on.

## World
An open void scene, drawn on hook, feature and stats. Twenty-six stars, radius 1.6–3.6, each pulsing on `0.3 + 0.4·|sin(t + i)|` — every one on its own phase, so the field twinkles rather than blinks together — while drifting sideways at four rates. At 78% width a mint planet of radius 110 bobs 20px on sin(t·0.5), wearing a violet ellipse ring (rx190/ry34) rotated −16° and two darker crater discs. A violet moon of radius 44 with a white highlight sits low-left. A rocket climbs the full frame height on a 120-unit-per-second loop, rotated −14° and weaving ±60 on sin(t·0.6): paper-white hull, coral fins, a space-navy porthole ringed in violet, and a coral flame beneath that flickers on |sin(t·9)|. Ambient clock 1.9.

## Motion
Six-move set — zoomIn, pushU, spin, pushD, zoomOut, pushL — strided by 7 from offset 5, walking forward through all six. The magnitudes are the largest in this family: roll 1.4, zoom-in punch 0.7, z-drift 0.07. The world is calm and the camera is not — that contrast is the pack. Titles `bounce`, items `pop`.

## Beats
- **Code (diff)** — a red/green diff panel, for changelogs, deploys and PR storytelling.
- **Typing (terminal)** — a live-typed mission log or command line.
- **Ring (ring)** — fuel, orbit insertion and progress as clean arcs.
- **Notify (drop)** — station pings and ground-control messages dropping from the top.
- Feature cards are `glow` on #070a1e with a mint bloom at radius 26; montage tiles glow violet; the CTA button is a coral glow block.

## Best for
Developer tools, deploy and release platforms, infrastructure and observability products, hardware and aerospace startups, and any launch film that wants to be precise and funny at the same time.

