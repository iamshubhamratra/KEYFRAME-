---
name: abyss-dive
label: Abyss Dive
orientation: portrait
fontFamily: Krona One
---

# Abyss Dive

Abyss Dive — a research submersible: ink-teal water, one bioluminescent cyan, coral and sand.

## Palette
| Role | Hex | Use |
|---|---|---|
| deep | #061c26 | primary water ground on hook, feature, stats, app |
| glow | #35d0d6 | bioluminescent highlight — card glow, glowing stat numbers, CTA button |
| coral | #ff7e67 | second accent — statement highlight, chips, the jellyfish |
| sand | #e8d9b0 | all type; also the depth-ladder ticks and the lure filament |
| ink | #04141c | statement, montage and CTA ground; card fill |

## Type
Display: **Krona One** — wide, single-weight geometric, uppercase at 86–146px with a tightened 1.12 line height. Body: **Overpass** 400–700, and the world layer sets its own depth labels in Overpass 22px, so the instrumentation shares the pack's body face.

## World
The only pack in this group where `world` is true on **every** beat — the ocean is never cut away. Ten hollow cyan circles (5–15r, 3px stroke) rise the full height at four different rates, each drifting ±20px on sin(t) and fading as they climb. At 72% width a coral jellyfish bobs on a slow lissajous (sin 0.5 / cos 0.4): its 60r bell has a scalloped hem whose four `q` depths breathe on sin(t·2.2)…sin(t·2.4), and three tentacles wave beneath it. At x=170 a cyan orb pulses between 10r and 20r with opacity swinging 0.45–0.95, trailing a sand filament that curls 110px — an anglerfish lure. Down the right edge, five sand tick marks labelled 100m to 500m. Ambient clock 1.4 — the slowest here.

## Motion
Camera set: zoomOut → pushD → drop → pushL → zoomIn → pushU, multiplier 5, offset 3. Magnitudes: 0.4° roll (near zero), 12px y-drift, 9px x-drift, 0.3 inner scale, 0.04 z-drift. Titles enter on **drowse**, items on **rise**. Motion default: Calm.

## Beats
- **Ring — ring**: a full circular dial for hull/pressure checks.
- **Scroll — feed**: a vertically scrolling dive log.
- **Typing — terminal**: a monospaced sonar readout that types itself in.
- **Notify — side**: messages dock in from the side edge (surface comms).
- Plus the spine: Hook (outline cyan kicker), Statement (ink ground, coral highlight, world still running), Feature (26r glow card), Montage (glowing tiles on #07222e, tilts −1.5° to 1.5°), Stats (glowing numbers), CTA (ink ground, glowing cyan button, circular logo).

## Best for
Marine and environmental organisations, research institutes, documentary and series branding, sensor and telemetry products, and any calm technical story that wants awe over urgency.
