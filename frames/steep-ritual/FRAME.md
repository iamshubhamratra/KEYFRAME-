---
name: steep-ritual
label: Steep Ritual
orientation: portrait
fontFamily: Marcellus
---

# Steep Ritual

A tea house held very still: porcelain ground, matcha bowl with a breathing steam ribbon, and the gentlest camera in the library.

## Palette

| Role | Hex | Use |
|---|---|---|
| porcelain | `#f7f3ea` | the default ground and type on dark |
| matcha | `#7a8c4f` | highlight, full-bleed Statement, bowl, CTA pill |
| pot | `#8c5a3c` | clay brown — kicker, second chip, second stat column |
| ink | `#2b2b26` | type on porcelain, Montage/CTA ground, card interiors |
| gold | `#c9a24b` | Montage and CTA highlight, the drawn circle |

Desk surround `#22221c`. App-beat card `#fdfaf3`.

## Type

Display: **Marcellus**, a Roman inscriptional serif with flared stems — 90–146px at 1.10 line, the loosest leading in this cohort. Body: **Mukta** 400–700. The world's 茶 glyph is also set in Marcellus so the backdrop and the titles share a hand.

## World

Shown on Hook, Feature, Stats and App:
1. **The bowl** — a half-ellipse in matcha on a 25% ink shadow ellipse, with a double-S steam path stroked 9px at 25% ink that rises and settles by `-|sin(t * 0.7)| * 12`.
2. **Three tea stems** — 620px matcha verticals at 14/11/8px width and falling opacity, each rotating ±8° about its base on `sin(t*0.8 + i*0.9)`, with three node ticks and two small leaves per stem.
3. **The seal** — a 60px gold circle drawn by dash-offset over `seg(p, 0.1, 0.8)` around 茶 at 55% ink.

Ambient clock 1.4 — the calmest world clock here.

## Motion

Cams `zoomOut · pushU · zoomIn · pushL · drop · pushR`, cadence multiplier **3** (fewest moves per film in this cohort), offset 1. Magnitudes are the smallest across the set: rot 0.3, driftX 4, driftY 6, driftZ 0.03, ease-in 0.30. Titles use **drowse**; items **rise**. Default motion setting: Calm.

## Beats

- **Ring `gauge`** — a 180° speedometer arc with five tick lines and a needle rotating from −90°, number sitting below the dial. Water temperature, not a percentage.
- **Toggle `switch`** — pill switches flip one at a time, knob sliding 48px on outBack, label brightening as each lands. Ceremony steps.
- **Typing `caret`** — text types against a 10px matcha left rule with a blinking pipe, closing on a boxed stamp rotated −3°.
- **Scroll `board`** — a menu board: numbered mono chips, name, dotted leader, and a price that flickers in on a short sine before settling.

## Best for

Tea houses and specialty coffee, ceremony and wellness studios, spa and retreat, quiet-luxury retail, skincare and apothecary, meditation apps — anything selling deceleration.
