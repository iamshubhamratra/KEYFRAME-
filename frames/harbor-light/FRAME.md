---
name: harbor-light
label: Harbor Light
orientation: portrait
fontFamily: Cormorant Garamond
---

# Harbor Light

A working lighthouse: navy hull, one amber lamp turning on a real clock, fog and gulls underneath.

## Palette

| Role | Hex | Use |
|---|---|---|
| hull | `#1f3242` | deep navy — Hook/Feature/Stats/App ground |
| lamp | `#e8b23c` | amber — the beam, kickers, highlights |
| fog | `#dfe6e2` | pale sea-mist — type on navy, Statement/Montage ground |
| rust | `#a34a2c` | iron oxide — tower bands, Statement highlight, full-bleed CTA |
| ink | `#16232c` | card interiors and type on fog |

Desk surround `#1a262e`. App-beat card `#283d50`.

## Type

Display: **Cormorant Garamond** 500–700, an old-style serif with fine strokes, 92–146px at 1.06 line — tight enough that two lines read as one plate. Body: **Nunito Sans** 400–700 for kickers, outline chips, tile labels. No uppercase flag anywhere; the serif keeps its lowercase.

## World

Shown on Hook, Feature, Stats and App:
1. **The beam** — two opposing 420×180 wedge polygons at 18% lamp, rotating on `(t * 40) % 360`, so the sweep is on a real clock rather than a scene progress bar.
2. **The tower** — a rounded amber lamp housing over a tapering 160px trunk in 85% fog, crossed by two 12px rust bands.
3. **Three wave lines** — six-segment quadratic ripples stroked 8px at 0.30/0.23/0.16 fog, each translating left on its own speed (46, 64, 82 px/sec) and wrapping at 400px.
4. **Two gulls** — double-arc "m" strokes drifting on `sin(t*0.7)` / `cos(t*0.8)`.
5. **Fog band** — a full-width 90px rect at 10% fog, rising and falling on a 0.5Hz sine.

Ambient clock 1.5.

## Motion

Cams `zoomOut · pushL · drop · pushU · zoomIn · pushR`, cadence multiplier 5, offset 0. Magnitudes: rot 0.4, driftY 8, driftZ 0.04, ease-in 0.28 — the frame never snaps, it settles. Titles use **drowse**; items **rise**. Default motion setting: Calm.

## Beats

- **Typing `typewriter`** — each glyph is its own inline-block, rotated by `((i % 5) - 2) * 1.3°` and nudged vertically, so the line arrives struck rather than rendered; closes with a double-ruled stamp at −2°.
- **Ring `ring`** — full circular dial, 12 ticks, sweeping 30px stroke, number and label centred.
- **Scroll `feed`** — a genuinely scrolling 840px list with numbered rows and a live scrollbar thumb whose height and position track the travel.
- **Morph `fade`** — one word crossfades into the next with a 0.92 → 1.0 scale, no flip, no roll.

## Best for

Coastal stays and heritage properties, harbour towns and tourism boards, maritime museums, quiet-luxury hospitality, long-form editorial brands, anything selling continuity and stillness.
