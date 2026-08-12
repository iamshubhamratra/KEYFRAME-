---
name: string-and-sky
label: String & Sky
orientation: portrait
fontFamily: Grandstander
---

# String & Sky

A kite festival on a bluff: sky-blue ground, two kites actually flying in the backdrop, and a frame that sways in the same wind.

## Palette

| Role | Hex |
| --- | --- |
| sky (paper ground) | `#a8d8ea` |
| kite (primary accent) | `#e84855` |
| sun (second kite, CTA ground) | `#f2b13c` |
| grass (hill, chips) | `#5a9e54` |
| navy (type, dark flood) | `#23364a` |
| desk (stage surround) | `#8ec4dc` |

Hook / Feature / Stats / App on sky with navy type and kite highlights. Statement and Montage flood navy with sky type and sun highlights. CTA floods **sun gold** with navy type and a navy pill button — the only warm-ground close in this group.

## Type

**Grandstander** 500–700 for titles, line-height 1.05 — rounded, slightly bouncy letterforms, mixed case. **Sofia Sans** 400–700 for kickers, captions and chips. Cards tilt (20px radius), chips are pills, the logo mark is a circle.

## World

Runs on Hook, Feature, Stats and App; navy Statement / Montage and the gold CTA go clean.

- Two diamond kites (44×64 half-axes, 4px navy outline with cross spars) at x≈260 and x≈680, each drifting on its own sine/cosine pair and rotating ±12°, tethered by a 35%-navy line down to a ground point.
- Each kite trails a wavy tail whose control points oscillate at 4.6–5Hz, carrying two diamond bow-ties in sun and grass that flap ±20°.
- Three white clouds (paired ellipses) drift left to right at 18/26/34px per second, wrapping the frame, opacity stepping 0.85 → 0.45.
- A 64px sun disc at the top right.
- A rolling green hill drawn as a q/t wave across the bottom, with eight navy grass tufts leaning off it.

## Motion

Cams `hopU, pushR, zoomOut, pushL, zoomIn, drop` at multiplier 3, offset 2. Magnitudes carry the **largest drift here**: 10px X, 9px Y, 1° roll — the frame sways rather than cuts. Titles use **bounce** (outBack from 110px below, 0.7 → 1 scale); items **pop**. Default energy **Bouncy** (1.35). Ambient world clock 1.8.

## Beats

- **Toggle → check** — checkbox rows tick on in sequence with an outBack tick mark. The launch check.
- **Ring → bar** — a vertical column with a spout and side ticks fills from the bottom, number set beside it. Line out.
- **Notify → pop** — rounded pill notices scale up from 0.3× at staggered indents and rotations. Field announcements.
- **Morph → roll** — an odometer roll swapping one word for the next over a progress bar.
- Plus Hook (kite pill kicker), Statement, Feature (tilted navy card, pill chips), Montage (±3° tilts), Stats and CTA.

## Best for

Festivals and outdoor events, family attractions, summer camps, parks and recreation, kids' brands, community fundraisers — anything that happens outside in daylight.
