---
name: velvet-brass
label: Velvet Brass
orientation: portrait
fontFamily: Yeseva One
---

# Velvet Brass

A basement jazz room after ten: plum velvet, brass highlight, a spotlight that actually sweeps and a keyboard playing itself along the floor.

## Palette

| Role | Hex | Use |
|---|---|---|
| velvet | `#2a1420` | plum room — Hook/Feature/Stats/App ground |
| brass | `#cf9b52` | the highlight everywhere, spotlight tint, full-bleed CTA |
| cream | `#f0e8da` | type on dark, floating notes, piano keys |
| blue | `#34687a` | teal stage wash — second chip, second stat column |
| ink | `#1c0e16` | Statement/Montage ground, card interiors, CTA button |

Desk surround `#170b12`. App-beat card `#38202c`.

## Type

Display: **Yeseva One**, a high-contrast decorative serif with swelling terminals — 92–148px at 1.08 line, sentence case throughout so the ornament reads. Body: **Jost** 400–700, geometric and cool, deliberately unlike the display face.

## World

Shown on Hook, Feature, Stats and App:
1. **The spotlight** — a triangle from the top-right edge at 12% brass whose base sweeps ±160px on `sin(t * 0.6)`, with a 180×30 elliptical pool at 18% brass tracking the same phase on the floor.
2. **Four notes** — cream oval heads rotated −18° with 40px stems (flags on the even ones) rising 900px over a `(t * 0.16 + i * 0.26) % 1` cycle, fading as they climb.
3. **The keyboard** — 14 white keys across the full bottom edge at 12% cream, with the key at `floor(t * 2.2) % 14` lighting to 35%, and 10 black keys in 90% ink laid over it. The floor plays a scale on its own clock.
4. **Smoke** — a faint 10px cream curl at 14% on the left.

Feature cards use the `glow` treatment with a brass bloom. Ambient clock 1.6.

## Motion

Cams `zoomIn · pushL · drop · zoomOut · pushR · pushU`, cadence multiplier 5, offset 1. Magnitudes: rot 0.5, driftX 6, ease-in 0.26 — a lateral drift, like moving between tables. Titles use **drowse**; items **rise**. Default motion setting: Calm.

## Beats

- **Cursor `slider`** — a pointer drags a knob 560px along a track while a large tabular percentage counts up, then flips a switch below it. Front of house.
- **Scroll `stack`** — set-list cards lift, rotate −5° and clear off the top with an n/total counter.
- **Notify `drop`** — cards fall in from above with a small rotate, led by a brass square carrying the venue initial and a "now" timestamp.
- **Morph `fade`** — the headliner name crossfades into the next with a 0.92 → 1.0 scale and a progress bar beneath.

## Best for

Live music venues and jazz clubs, cocktail bars and supper clubs, festivals and ticketed nights, hotels with a bar programme, record labels — anything sold by its evenings.
