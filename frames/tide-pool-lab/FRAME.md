---
name: tide-pool-lab
label: Tide Pool Lab
orientation: portrait
fontFamily: Shrikhand
---

# Tide Pool Lab

Low-tide rockpool walks: sand grounds, slate rims, and a pool with living things in it running behind the type.

## Palette

| Role | Hex |
| --- | --- |
| sand (shore ground) | `#f0e6cc` |
| rock (slate flood ground) | `#4a5258` |
| anemone (primary accent) | `#f27d98` |
| seafoam (second accent, CTA ground) | `#8fd8c8` |
| ink (type) | `#2a3238` |
| desk (stage surround) | `#d8ccb0` |

Hook / Feature / Stats / App on sand with ink type and anemone highlights. Statement and Montage flood slate rock with sand type and seafoam highlights. CTA floods **seafoam** with ink type and an ink pill button.

## Type

**Shrikhand** for titles, line-height 1.10 — fat slabby retro-poster display, mixed case. **Poppins** 400–700 for kickers, captions, chips and body. Type sizes are the smallest in this group by design: hook 108, statement 132, feature 88, stat numerals 144, CTA 106 — the layout is built around white space and a 22px card radius, the roundest here.

## World

Runs on Hook, Feature, Stats and App; the slate Statement / Montage and the seafoam CTA go clean.

- The pool: a 360×110 ellipse filled seafoam at 50%, ringed with a 14px slate stroke.
- Two ripple ellipses expand from two surface points, radius cycling 30 → 140px on a 36px/s clock, white stroke fading to zero as they grow.
- A ten-point starfish (52/22px radii, squashed to 0.8 vertically) in anemone pink with a 40%-ink outline, rocking ±14° at 0.6Hz on the left rim.
- An anemone at the right rim: ten seafoam tentacle strokes radiating from a dark 13px centre, each length wobbling ±8px on its own 2.4Hz phase.
- A hermit crab walks the full frame width along the sand at H-170 on a 0.2 clock, flipping horizontally each pass — pink body ellipse, two ink eyestalks, six legs whose lengths oscillate at 8Hz, and one raised claw arc.
- Five slate pebbles scattered at the top at 35% alpha.

## Motion

Cams `zoomIn, pushD, hopU, pushL, zoomOut, pushR` at multiplier 5, offset 0. Magnitudes: 0.8° roll, 8px Y drift. Titles use **rise** (outQuint, 46px lift) — the only pack here that neither slams nor bounces its headlines; items **pop**. Default energy **Lively** (1.0). Ambient world clock 1.6.

## Beats

- **Ring → bar** — a vertical column with a spout and quarter ticks filling from the bottom, number beside it. Tide falling.
- **Scroll → feed** — a tall panel of numbered rows scrolling under a live scrollbar thumb. The pool census.
- **Toggle → check** — checkbox rows ticking on in sequence. The field kit.
- **Typing → hand** — words appear one at a time on an outBack overshoot, each rotated ±2.6° and scaled down from 1.35×, every fourth word in the accent, closed by an underlined stamp. Reads as handwriting into a field notebook, and no other pack in this group owns it.
- Plus Hook (seafoam pill kicker), Statement, Feature (slate frame card, pill chips), Montage (±2.5° tilts), Stats, Notify and CTA.

## Best for

Nature reserves and aquariums, museum and science education, family activity programmes, coastal tourism, environmental non-profits, kids' publishing — briefs that want wonder rather than volume.
