---
name: fade-parlor
label: Fade Parlor
orientation: portrait
fontFamily: Abril Fatface
---

# Fade Parlor

Barbershop pack: navy shop walls, brass trim, pole red, and titles that land like a rubber stamp.

## Palette

| Role | Hex | Used for |
|---|---|---|
| navy | `#1b2838` | primary ground (hook, feature, stats, app), tiles, CTA button |
| cream | `#f4eee4` | copy, pole body, CTA ground |
| red | `#c8433b` | statement ground, pole stripes, second stat |
| gold | `#caa24f` | highlight, pole caps, bulb chase, chips |
| steel | `#9fb2c1` | scissors, shelf rules, third stat, second chip |

## Type

Display: **Abril Fatface** (fat high-contrast didone) — line-height 1.10, titles 92–146px. Body: **Work Sans** 400–700. Card fill is a deepened `#141e2a`, which is also the montage ground, so the working beats sit one step darker than the shop walls.

## World

Shown on hook, feature, stats and app. A barber's pole stands at the right: a 68×260 cream capsule with 30px rounded ends, filled by seven bars skewed −16° that scroll upward at 60px/s and wrap, alternating pole red and 85%-opacity navy, capped top and bottom by gold end pieces. At lower-left, a steel pair of scissors rotated −20°, its two blades opening and closing on `|sin(t*2.2)| * 24` with gold finger-ring circles behind the pivot. Across the upper-left, five gold bulbs chase on `sin(t*2.6 + i)`. Below, a steel shelf rule with a scalloped comb-wave line running above it. Ambient clock 1.7.

## Motion

Cameras: zoomIn → pushL → drop → pushR → zoomOut → pushU, multiplier 5, offset 3. Magnitude rot 0.7, inner 0.24 — controlled, no drift terms. Titles enter on **stamp** (a hard downward set), items on **rise**. Default motion preset is Lively.

## Beats

- **Cursor / slider** — a cursor drags a slider through settings; the deck uses it for clipper guard sizes.
- **Scroll / board** — the service menu scrolls as a priced board.
- **Notify / side** — front-desk messages slide in from the edge.
- **Morph / flap** — a split-flap word change for who's in the chair today.

## Best for

Barbers and salons, tattoo and piercing studios, tailors and cobblers, bars and members' clubs, appointment-led service businesses, and any heritage trade selling craft plus a room.
