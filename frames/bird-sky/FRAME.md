---
name: bird-sky
label: Bird Sky
orientation: portrait
fontFamily: Yeseva One
---

# Bird Sky

# Bird Sky

A 9:16 pale-sky film where a flapping V of birds, a bobbing kite and drifting clouds all cross the frame at different speeds.

## Palette

| role | hex |
|---|---|
| sky | `#cfe6f2` |
| ink | `#2e3440` |
| sun | `#f2c14e` |
| coral | `#e2705c` |
| paper | `#fbf9f4` |

Ground `sky` on hook, feature and CTA; statement and montage flip to full `ink` with `sun` highlights; the stats beat takes a solid `coral` ground. Tweakables expose the sky tint and the accent.

## Type

Display **Yeseva One** (high-contrast display serif) · body **Mukta**.
Sentence case, leading `1.08` — the tightest in this batch, which the serif's tall x-height carries. Hook 122px, statement 148px, stats numerals 154px.

## World

Runs at 1.6× film time on the hook, feature and CTA beats:

- A `sun` disc, r 100, parked at 80% frame width and 300px down.
- Three clouds, each a three-ellipse lobe group in 80% white, drifting sideways at 14 / 20 / 26 units per second at staggered heights.
- Nine birds in a V — five rows, mirrored left and right — drawn as quadratic chevrons that track horizontally across the frame while each wing flaps on `sin(t * 7 + i) * 8`.
- A `coral` kite (a 68×100 diamond with a white spine) at 20% width, bobbing on a slow sine and rotating ±10°, trailing a tail whose mid control point snakes on `sin(t * 2)`.
- A dark `ink` hill silhouette at 85% alpha rolling across the bottom of the frame.

## Motion

Camera set `hopU · pushL · zoomOut · pushR · drop · spin`, stepped `i × 5 + 1`.
Magnitudes: rotation `0.8`, y-drift `12` — buoyant vertically, quiet everywhere else.
Title entrance **rise**, item entrance **pop**. Cut `push`, drift 1.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta. This pack owns:

- **Scroll (`ticker`)** — three marquee rails of item names at 66 / 58 / 50px running in alternating directions at 70, 115 and 160px/s, with a live entry count beneath.
- **Toggle (`switch`)** — rows of pill switches whose knobs flip on one after another on outBack.
- **Notify (`side`)** — cards sliding in 460px from the right, each with a highlight bar that drains as its life runs out.
- **Morph (`fade`)** — one 150px word cross-dissolving and scaling into the next over a progress bar.

Feature card is the `tilt` variant: paper card, radius 24, ink hairline.

## Best for

Nature and conservation, birding and outdoor apps, travel and hiking gear, wellbeing and morning routines, brands that want daylight and open air rather than polish.

