# 07 — Flightpath

**Category** Nature / Science & conservation
**Orientation** 16:9 · 1920 × 1080
**Runtime** 5:00 · 45 scenes · looping
**Tags** `nature` `birds` `cinematic` `conservation` `science` `calm` `parallax` `premium`

## Description

A cinematic nature film. The world is atmospheric rather than graphic: a
four-plane parallax sky drifts continuously behind every scene, birds cross at
different depths and speeds, and air particles float through the frame. Motion
starts slow and quickens toward the close. Type is light, wide-tracked and quiet
— the opposite register to the sport template — and photography carries the
emotional weight.

## Recommended use cases

Conservation and environmental organisations · science and research
communications · outdoor, travel and heritage brands · documentary-style
explainers · anything long-form and narrated where calm authority matters more
than energy.

## Design brief

- **Layout system** — generous: 160–200px gutters, single columns, long measures.
  Statements sit low in the frame over imagery; data scenes use ruled rows and
  hairlines rather than filled cards.
- **Shape language** — almost none. 2–10px radii, 1px hairlines, small circles
  for data points and pins. The atmosphere does the visual work.
- **Typography** — Figtree **400** at 1.6 line-height is the body voice and
  Figtree 600 at 0.34em tracking the label voice; Caprasimo carries statements
  and part titles. Nothing is bold.
- **Palette** — dusk and ink for sky scenes, bone and mist for data scenes, a
  warm dawn tone for light, clay accent and moss second accent.

## Animation description

| Layer | Behaviour |
| --- | --- |
| Transitions | Five owned wipes: `dissolve` (true cross-fade), `horizon` (top and bottom bands meeting at a lit line), `rise`, `bloom` (radial light), `veil` (four staggered layers lifting) |
| Cameras | `soar`, `descend`, `glideR`, `glideL`, `hover`, `quicken` (accelerating ease-in, used at the turns) |
| Signature | `Sky` — four-plane parallax ridgeline that never stops moving; `Birds` — flocks at independent depth, speed and wing-beat; `Air` — floating particles; `Hair` — drawn hairlines |
| Data | Five-decade decline line, cause bars, stopover table, two-wave season chart, lights-out recovery bars, a 96-bar night spectrum, per-pole measurements |
| Pacing | Choreography at 12× scene length; the sky, flocks and particles run continuously so held frames stay alive |

## Asset placeholders

| id | Size | Purpose |
| --- | --- | --- |
| `fp-mark` | 30² circle | Brand mark in the chrome |
| `fp-logo` / `fp-logo-cta` | 130² / 120² circle | Logo, open and close |
| `fp-hero` | full bleed | Opening sky image |
| `fp-estuary` | full bleed | Stopover landscape |
| `fp-wide` | full bleed | Closing-argument landscape |
| `fp-mic` | 760 × 660 | Instrument image |
| `fp-model` | 800 × 600 | Model/lab image |
| `fp-vol-0…4` | 250 × 320 | Volunteer portraits |
| `fp-school` | 780 × 620 | Classroom image |
| `fp-archive` | 1300 × 560 | Wide archive frame |
| `fp-founder` | 540 × 680 | Founder portrait |

## Text placeholders

- **Statement** — `SET()` Caprasimo 48–104px (Hook, Turn, Tonight, CTA, part titles)
- **Part label / title / deck** — `Chapter`, four parts (named ONE–FOUR, not numbered)
- **Body** — `LIGHT()` 30–42px at 1.14, and `BODY()` at 1.6 for long passages
- **Label** — `CAPS()` 17–24px at 0.34em
- **Number** — `NUM()` 38–340px tabular, light weight
- **Quote + attribution** — 80–86px with an 18–19px credit
- **CTA** — 104px statement, 24px outlined button, 19px URL

## Brand colour tokens

```js
window.OM_TWEAKS = { brandName: "FLIGHTPATH", brand: "#c07a43", brand2: "#6f8a6a" };
```

`brand` drives the decline line, cause bars, stat figures, city pins, labels and
the accent grounds at the turns; `brand2` marks recovery and positive data. The
`dawn` warm tone is a derived light used for night highlights and part labels.
Sky, mist and ink grounds are fixed, so an injected brand colour re-tints the
data and the light without disturbing the atmosphere.

## Files

- `Flightpath.dc.html` — page: fonts, scene list, playback, brand tokens
- `flightpath-film.jsx` — palette, transitions, cameras, atmosphere, 45 scenes
- shared: `../../kit/film-kit.js`, `../../animations-v3.jsx`, `../../image-slot.js`
