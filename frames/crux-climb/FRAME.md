---
name: crux-climb
label: Crux Climb
orientation: portrait
fontFamily: Anton
---

# Crux Climb

A bouldering gym at full session: slate wall, orange holds, uppercase Anton, and the hardest camera in the library.

## Palette

| Role | Hex | Use |
|---|---|---|
| wall | `#2c2f33` | slate gym wall — Hook/Feature/Stats ground |
| hold | `#ff8a3d` | safety orange — every highlight, full-bleed CTA |
| pad | `#3d7bff` | crash-pad blue — second chip, second stat column |
| chalk | `#f2f2ee` | type colour on dark |
| ink | `#191b1e` | Statement/Montage ground, CTA button |

Desk surround `#1c1e21`. App-beat card `#25282d`.

## Type

Display: **Anton**, condensed and heavy, 94–152px, `letterSpacing 0.02em`. Body: **Asap** 400–700. Every beat sets `upper: true` — Hook, Statement, Feature, Montage, Stats, CTA and App all shout; there is no lowercase in this pack.

## World

Shown on Hook, Feature, Stats and App:
1. **The overhang** — a five-point polygon cut from the right edge in 50% ink, leaning in over the frame.
2. **Five holds** — each pops with `ease.outBack` on a staggered `seg`, each a different path (dome jug, square crimp, triangle sloper, oval pinch, curved pinch), rotated `i * 24°`, coloured hold/pad/chalk/hold/pad at 0.9 opacity.
3. **Chalk puff** — a circle expanding from r10 to r54 while fading, looping on `(t * 0.5) % 1`.
4. **The rope** — a 560px quadratic sway driven by `sin(t * 1.1)`, terminating in an orange belay ring that swings with it.
5. **Four crash pads** — blue rounded rects along the floor at alternating opacity.

Ambient clock 1.9 — the busiest backdrop of its cohort.

## Motion

Cams `pushU · zoomIn · pushL · hopU · pushR · drop`, cadence multiplier **7**, offset 1. Magnitudes are the roughest here: rot 0.9, skew 3, driftY 9. Titles use **slam** (scale 2.2 → 1 with a −4° unwind on outExpo); items **pop**. Default motion setting: **Bouncy** (energy 1.35).

## Beats

- **Cursor `keys`** — oversized keycaps press in sequence, bottom border collapsing 8px → 2px as each is struck, then a payoff line pops. Logging a send.
- **Toggle `dial`** — a 2×2 grid of rotary dials, needles swinging from −120° to their setting with a ring that lights when it lands.
- **Notify `drop`** — cards fall from above with a ±3° rotate, brand-initial avatar, "now" timestamp.
- **Swipe `swipe`** — a three-card deck; the top card flies 1100px right at 18° while a stamp badge fades in at 12°, the next card promoting up behind it.

## Best for

Climbing and bouldering gyms, training and session-log apps, fitness challenges, outdoor gear, sports memberships, anything whose story is repeated attempts and a payoff.
