# 01 — Pet Story

**Category** Lifestyle / Brand story
**Orientation** 16:9 · 1920 × 1080
**Runtime** 5:00 · 50 scenes · looping
**Tags** `pet` `dtc` `subscription` `editorial` `modernist` `grid` `broadsheet` `brand-story`

> Rebuilt from scratch. The earlier warm-organic version (blob geometry,
> Caprasimo, cream-and-terracotta) is gone; nothing carries over but the scene
> list and the image-slot ids, so any images already dropped in still land.

## Description

Built to the conventions of the reference long-form collection: a warm paper
ground, a serif display face over a sans body, pill kickers, rounded panels, and
a persistent set of on-screen furniture — a rotating tag pill, an italic footnote
with an accent dash, and alternating vertical side type or a turning asterisk —
that changes with every scene rather than repeating.

Motion is continuous rather than per-scene. The background world runs off the
composition clock so it never restarts at a cut, camera moves are cycled from the
template's move list by scene index with a stride so neighbouring scenes never
share one, and an `energy` tweak (Calm / Lively / Bouncy) scales every ambient
movement at once.

## Recommended use cases

Pet food and pet care · DTC subscription products with an ingredient story ·
anything making a documented, evidence-led claim · brands whose credibility comes
from disclosure rather than warmth.

## Design brief

Built on the bound **Organic** design system: the page links its `styles.css` and
`_ds_bundle.js`, and the film resolves `--color-bg`, `--color-text`,
`--color-accent`, `--color-accent-2`, the neutral and accent ramps, and
`--font-heading` / `--font-body` out of `:root` at load. The direction the
reference collection pushes toward — warm paper, terracotta, sage, rounded
panels — *is* Organic's, so its tokens are the source of truth rather than values
transcribed into the film. `FilmKit.palette()` needs real hex for its
lighten/darken/alpha maths, so tokens are resolved once into JS rather than left
as `var(--*)`; retuning the theme retunes the film.

- **Layout system** — a twelve-column grid on a 120px gutter, content flush left,
  with full-bleed colour columns and accent poster dividers breaking the rhythm.
- **Shape language** — rounded, per the system: 24–30px radii on panels and cells,
  999px pills for kickers and tags, soft shadows under photographs.
- **Typography** — Caprasimo for display at 46–420px (the system's only display
  voice), Figtree 400/600 for body, Figtree 800 at 0.2em for labels and tags,
  italic Figtree for footnotes. Tabular figures on every number.
- **Colour** — the system's warm ground and ink with its terracotta accent and sage
  second accent, plus the 100-step tints as panels. The accent runs as a field on
  the five chapter posters and three statement scenes; elsewhere it marks one item
  per view.
- **Imagery** — photographs are washed back and rounded, so they sit into the page
  rather than on top of it.

## Garnish

One garnish layer is drawn at composition level, above every scene, and coloured
from whichever scene is under the playhead: a rotating tag pill top-right, an
italic footnote with an accent dash bottom-left, and — alternating by scene index
— vertical side type or a turning asterisk. Drawing it per-scene would print two
sets at every cut, since the engine keeps neighbouring scenes mounted across a
boundary, and the outgoing one would take its ink from the wrong ground.

## Animation description

| Layer | Behaviour |
| --- | --- |
| Transitions | Five owned wipes: `columns` (12 columns leaving alternately), `bars` (9 bands scaling from alternating edges), `blockOut` (single hard rect), `split` (halves parting), `cut` (a true hard cut) |
| Cameras | `hold`, `stepL`, `stepU`, `tightIn`, `wideOut`, `nudge` — small, mechanical moves; nothing floats |
| Signature | Rules that draw on `scaleX`, cells that step up in sequence, struck-through table rows, the red poster divider with a rotating outline square |
| Data | Ingredient panel with strikethroughs, annual receipt, four-stop history, weighed percentages, coat-score line, energy bars, a 28-night matrix, before/after wipe, comparison table, delivery track |
| World | A flat geometric dog built only from rectangles trots a ruled baseline, a red square ball bounces, plotted paw marks fade, an outline square turns. Runs off the composition clock, so it never restarts at a cut |
| Pacing 

## Asset placeholders

These films are made from an article or a blog link, so the story is carried by
type, not photography. Three image plates remain, all optional — every scene
reads without them.

| id | Size | Purpose |
| --- | --- | --- |
| `pet-hero` | 5 cols × 780 | Opening portrait plate |
| `pet-feat-1` | 6 cols × 700 | One feature plate |
| `pet-founder` | 4 cols × 700 | Founder portrait |

The twenty-one slots the first pass carried are gone; those scenes are now
typographic — a timed method table, a full-bleed statement, portion figures in
bordered cells, a pack-spec list, a press-quote strip, a measured before/after
table, and a ruled name list. No logo slot and no on-screen brand mark, so
nothing is burned into an export.

## Text placeholders

- **Display** — `DISP()` Archivo 900 all-caps, 46–190px (masthead, statements, section heads)
- **Chapter number / title / deck** — `Divider`, five red poster beats
- **Subhead** — `SUB()` 36–46px semibold
- **Body** — `BODY()` 26–38px at 1.5, measure-capped to 5–6 columns
- **Label** — `LBL()` 18–30px at 0.16em, often paired with a red square via `Slug`
- **Number** — `NUM()` 34–420px tabular
- **Table** — `Table` takes any row set; column count and alignment per scene

Display copy follows one rule, in three cases:

- **One line** — `Hd` fits it to its measure and holds it on a single line.
- **A statement meant to wrap** — `Hd` with `lines={n}` is fitted against the
  capacity of that many lines and capped by its measure, so it keeps its authored
  size and breaks where intended rather than being crushed onto one line.
- **A lockup** — `Lockup` sizes several lines as a unit from the longest one, so
  adjacent lines of one statement never render at different sizes.

## Brand colour tokens

```js
window.OM_TWEAKS = { brand: "#ec3013", brand2: "#77746f" };
```

`brand` drives the poster dividers, statement fields, the single highlighted item
in every table and grid, rules, the ball in the background world and the CTA;
`brand2` is the mid-grey supporting tone. Ground, ink and the grid geometry are
fixed, so an injected brand colour changes the accent without loosening the
system.

## Files

- `Pet Story.dc.html` — page: Archivo, scene list, playback, brand tokens
- `pet-story-film.jsx` — palette, transitions, cameras, grid primitives, world, 50 scenes
- shared: `../../kit/film-kit.js`, `../../animations-v3.jsx`, `../../image-slot.js`

## World

A properly drawn dog rather than a silhouette: two-segment legs
  (hip → knee → paw) running a trot gait with the far pair darkened for depth,
  layered body forms (haunch, ribcage, chest, patch), a flopping ear, a wagging
  two-part tail, a sage collar with an accent tag, a tongue, and an eye that
  blinks. Drawn from curves in the system's warm ramp, over two colour hills, a
  turning ray-burst sun, a bouncing ball, six-hue paw prints and falling kibble.

The world runs off the composition clock, so the dog keeps moving straight
through every cut instead of restarting, and sits behind a veil of the scene's own
ground so it never competes with type.
