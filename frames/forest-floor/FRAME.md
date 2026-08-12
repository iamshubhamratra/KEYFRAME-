---
name: forest-floor
label: Forest Floor
orientation: portrait
fontFamily: Vollkorn
---

# Forest Floor

The floor of a wood, growing while you watch: moss and bark grounds, chanterelle gold, mushrooms that pop up on cue.

## Palette

| Role | Hex | Use |
|---|---|---|
| moss | `#3e4a36` | deep forest green — Hook/Feature/Stats/App ground |
| cream | `#efe9db` | type on dark, mushroom stems, tile labels |
| chant | `#d9913b` | chanterelle gold — highlight, alternate caps, full-bleed CTA |
| bark | `#5c4633` | Statement/Montage ground, Feature card interior |
| fern | `#7ba05b` | bright green — frond, alternate caps, chips, stat column |

Desk surround `#2a3324`. App-beat card `#47543e`.

## Type

Display: **Vollkorn** 500–700, a sturdy bookish serif with heavy slabs — 92–146px at 1.08 line, sentence case throughout. Body: **Alegreya Sans** 400–700 for pill kickers, chips and tile labels. The pairing reads as a well-set field guide rather than a poster.

## World

Shown on Hook, Feature, Stats and App:
1. **Five mushrooms** — each scales up with `ease.outBack` on a staggered `seg` from a ground line at `H-180` (alternating −40), built from a rounded cream stem 60–112px tall plus a domed cap arc, cap colour alternating chanterelle and fern, with a cream wart dot on every even one.
2. **Nine spores** — 3–5px cream circles at 28% drifting on `sin(t*0.6 + i)` horizontally and `cos(t*0.5 + i*1.3)` vertically across the mid-frame.
3. **The fern** — a 170px frond on the left swaying ±10° on `sin(t*0.9)`, with four pairs of pinnae stroked 5px in fern green.

Ambient clock 1.6.

## Motion

Cams `zoomIn · pushD · hopU · pushL · zoomOut · pushR`, cadence multiplier 5, offset 2 — note **pushD**, which drops the frame in from above like ducking under a branch. Magnitudes: rot 0.7, driftY 8. Titles use **rise** and items **pop**, which makes this the springiest of the calm-defaulting packs.

## Beats

- **Toggle `check`** — checklist rows with 52px square boxes; each ticks on in sequence with the check scaling in on outBack and the label brightening. The basket check.
- **DragDrop `drag`** — a chip is pointer-dragged along an arc into a dashed slot, which fills and confirms with a tick badge.
- **Morph `roll`** — the word rolls upward like a slot reel inside a 190px clipped window, with a progress bar underneath.
- **Notify `pop`** — pill-shaped notes pop in at staggered left offsets and small rotations, each led by a coloured dot.

## Best for

Foraging and mushroom walks, nature schools and guiding, botanical and herbal brands, national parks and trails, seasonal produce, outdoor education — anything where the pitch is "look closer."
