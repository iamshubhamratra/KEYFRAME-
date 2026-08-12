---
name: semolina-club
label: Semolina Club
orientation: portrait
fontFamily: Lilita One
---

# Semolina Club

A handmade-pasta school: flour-cream counters, tomato floods, and a backdrop that is literally the bench you are working on.

## Palette

| Role | Hex |
| --- | --- |
| flour (counter ground) | `#f8f0dc` |
| tomato (flood accent) | `#cf3b2e` |
| basil (montage ground, chips) | `#3e7a44` |
| semolina (pasta gold, highlight) | `#e8b93c` |
| ink (type, dark ground, CTA) | `#2e1f18` |
| desk (stage surround) | `#2e2318` |

Hook / Feature / Stats / App on flour with ink type and tomato highlights. Statement floods tomato with flour type and semolina highlights. Montage floods **basil green** with flour tiles — the only green ground in this group. CTA drops to ink with a tomato pill button.

## Type

**Lilita One** for titles, line-height 1.06 — fat, rounded poster display, mixed case. **Urbanist** 400–700 for kickers, captions, chips and body. Cards tilt at a 20px radius with a flour hairline; chips are pills in tomato, basil and semolina; the logo mark is a circle.

## World

Runs on Hook, Feature, Stats and App; the tomato Statement, basil Montage and ink CTA go clean.

- A wooden rolling pin — a 220×52 tan capsule (`#d9b98c`) with two darker handles (`#b8965c`) — tracks 300px left to right on a 90px/s loop, its interior 3px line spinning at 200°/s so the pin visibly rolls.
- Three puffs of flour rise 80px on a 0.5 clock, radius growing 12 → 38px while opacity falls to zero.
- Three vertical ribbons of pasta: 13px serpentine strokes of five alternating quarter-waves, rotated 90°, sliding ±16px on separate phases, the middle ribbon at full semolina and the outers at 65%.
- Three ravioli at (150,260), (240,320) and (130,380): 68px semolina squares with a 3px ink outline, a dashed ink crimp along the top and bottom edges and a translucent tomato filling dot, each popping in on outBack at a staggered 12% offset and rotated -10°/+4°/+18°.
- A basil leaf at the lower right rocking ±10° at 1Hz.

## Motion

Cams `hopU, pushL, zoomIn, pushR, drop, zoomOut` at multiplier 3, offset 1. Magnitudes: 1.1° roll, 8px X drift. Titles use **bounce** (outBack from 110px below, 0.7 → 1 scale); items **pop**. Default energy **Lively** (1.0) — the only mid-energy default here, which keeps the bounce warm rather than manic. Ambient world clock 1.7.

## Beats

- **DragDrop → drag** — a pointer grabs a chip, arcs it 90px over the gap into a dashed slot which lights up and takes a tick badge. To the tray.
- **Toggle → check** — checkbox rows tick on in sequence. Mise en place.
- **Scroll → board** — a leaderboard list with numbered mono chips, dotted leader lines and values that flicker as they settle. Menu della sera.
- **Morph → roll** — an odometer roll cycling tonight's shape over a progress bar.
- Plus Hook (tomato pill kicker), Statement, Feature (tilted ink card, pill chips), Montage (±3° tilts on basil), Stats and CTA.

## Best for

Cooking schools and classes, restaurants and delis, food brands and meal kits, farmers markets, hospitality workshops, any craft taught with your hands.
