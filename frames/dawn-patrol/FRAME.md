---
name: dawn-patrol
label: Dawn Patrol
orientation: portrait
fontFamily: Big Shoulders Display
---

# Dawn Patrol

Early-run pack: predawn blue, a rising coral sun, and hi-vis yellow used like a road sign.

## Palette

| Role | Hex | Used for |
|---|---|---|
| predawn | `#16324f` | primary ground (hook, feature, stats, app), tiles |
| ink | `#0e2032` | montage ground, cards, CTA button |
| coral | `#ff7955` | the sun, statement ground, kicker tag |
| hivis | `#ffe14d` | highlight, lane dashes, vest, CTA ground |
| pale | `#eef4f8` | copy, road arc, runner |

## Type

Display: **Big Shoulders Display** 600–800 — tall condensed, **uppercase on every beat**, letter-spacing 0.01em, titles 96–154px. Body: **Red Hat Text** 400–700. Stats beat carries `rule: true`, so numbers are separated by hard rules like a results board.

## World

Shown on hook, feature, stats and app. A coral sun disc (r 84) at 78% width rises 140px across the first 70% of the scene, wrapped in a 20px translucent coral halo. A 90px-wide pale stroke arcs across the lower frame as a road horizon, and seven hi-vis dashes travel along it left→right at 0.09 cycles/s, each rotating with the curve and lifting on a sine so they follow the crest. At left, a runner built from pale strokes: a round head, a torso line, and four limbs whose endpoints swing on `sin(t*6)` and `sin(t*6 + 1.5)`, with a hi-vis vest rect on the chest and the whole figure bobbing at 6Hz. Down the right, three distance posts labelled 5K / 4K / 3K in Big Shoulders. Ambient clock 1.9.

## Motion

Cameras: pushL → pushU → zoomIn → pushR → hopU → zoomOut, multiplier **7**, offset 0. Magnitude rot 0.6, **slide 0.34** (a hard lateral throw unique to this pack), driftX 10. Titles and items both enter on **streak** — motion-blurred, from the side. Default motion preset is Bouncy.

## Beats

- **Ring / gauge** — a circular dial reports the morning's effort, pace or completion.
- **Scroll / feed** — a vertical feed of the week's board, sessions or results.
- **Toggle / check** — a get-out-the-door checklist ticking through.
- **Morph / roll** — an odometer-style roll swaps the word (today's route, today's distance).

## Best for

Run clubs and cycling groups, gyms and training studios, races and event series, sportswear and wearables, hydration and recovery brands, and any product built on an early-hours habit.
