# 03 — Kitchen Table

**Category** Editorial / Food & culinary
**Orientation** 16:9 · 1920 × 1080
**Runtime** 5:00 · 46 scenes · looping
**Tags** `food` `culinary` `editorial` `magazine` `recipe` `subscription` `photography-led` `premium`

## Description

A premium editorial food film built like a printed magazine issue. Content sits
on a strict page grid with hairline rules, running folios, figure captions and
drop caps; photography is dominant and often full-bleed. Motion is the slowest of
the collection: cinematic Ken Burns drifts over stills, page folds between
sections, and bands and columns that behave like paper rather than UI.

## Recommended use cases

Recipe boxes and meal kits · food and drink brands with strong photography ·
farm, provenance and sourcing stories · hospitality and restaurant groups ·
anything long-form and narrated where images carry the argument.

## Design brief

- **Layout system** — a real page: `PAGE` gives a 150px gutter with a bottom
  folio band; content sits in one or two columns with rules top and bottom.
  Full-bleed and half-frame spreads break the grid deliberately.
- **Shape language** — rectilinear and almost unrounded (4–8px on image frames,
  0 on panels). Rules do the structural work that shapes do in template 01.
- **Typography** — Caprasimo as the editorial display voice (46–400px) over
  Figtree for decks and body; 0.24em all-caps for standfirsts, and italic Figtree
  for figure captions and folios. Drop caps open two body passages.
- **Palette** — paper ground (`#f4ece0`), cream and biscuit panels, ink body,
  deep terracotta accent, olive second accent. Photography sits on ink.

## Animation description

| Layer | Behaviour |
| --- | --- |
| Transitions | Five owned wipes: `fold` (3D page turn from the left edge), `bands` (five horizontal bands leaving alternately), `columns` (four columns lifting), `wash` (skewed colour sweep), `frameIn` (border closing inward) |
| Cameras | `kenIn`, `kenOut`, `panL`, `panR`, `settle`, `driftDown` — every camera moves continuously across the whole scene |
| Signature | Rules that draw (`Rule`), running folios, `Caption` figure labels, and `DropCap` body openers |
| Text | Word-stagger builds, per-character rise/drop, typewriter, tabular counters, serif marquees |
| Data | Season bars across a twelve-month axis, a 35-minute cooking timeline, taste-panel bars, before/after plate wipe |
| Pacing | Choreography at 6× scene length; mid-scene mechanics (plate wipe, box opening) read raw scene progress so they land mid-beat |

## Asset placeholders

| id | Size | Purpose |
| --- | --- | --- |
| `kt-mark` | 28² | Brand mark in the masthead bar |
| `kt-logo-cta` | 120² rounded | Logo on the CTA |
| `kt-cover` / `kt-end` | full bleed | Opening and closing images |
| `kt-shelf` | full bleed | Problem-scene backdrop |
| `kt-spread-1` / `kt-spread-2` | half frame each | Two-page spread |
| `kt-recipe` | 780 × 700 | Recipe hero |
| `kt-macro-1…3` | 440–520 × 520–700 | Captioned macro figures |
| `kt-wine` | 620 × 720 | Pairing image |
| `kt-chef` | 480 × 600 | Kitchen portrait |
| `kt-plate-before` / `kt-plate-after` | 1440 × 640 | Raw-to-plated wipe pair |
| `kt-farm-0…2` | third frame each | Farm triptych |
| `kt-texture` | full bleed | Texture beat |
| `kt-pack` | 940 × 560 | Box shot under the paper reveal |
| `kt-founder` | 560 × 720 | Founder portrait |
| `kt-cta` | 700 × 760 | Closing image |
| `kt-owner-1` | 72² circle | Testimonial avatar |

## Text placeholders

- **Masthead / display** — `DISP()` 96–280px (Cover, Masthead, Hook, Turn, Price, End)
- **Chapter number / title / deck** — `Chapter`, five beats
- **Standfirst / label** — `CAPS()` 18–26px at 0.24em
- **Deck** — `DECK()` 30–46px semibold
- **Body** — `BODY()` 30–36px at 1.52 line-height, 600–780px measure
- **Drop-cap passage** — `DropCap` (Masthead, Ingredients, Founder)
- **Figure caption** — `Caption` italic, 22px
- **Statistic + label** — `Counter` 160–400px over a drawn rule
- **Folio** — page number and section name, bottom of page
- **CTA** — 112px two-tone headline, 44px button, 26px URL

## Brand colour tokens

```js
window.OM_TWEAKS = { brandName: "TABLE SEVEN", brand: "#b4552f", brand2: "#6b7a4e" };
```

`brand` drives rules, standfirsts, drop caps, statistics, season bars, map pins,
buttons and most transition grounds; `brand2` is the second editorial voice
(olive chapter grounds, alternating bars, sustainability block). `FilmKit.palette()`
derives the light/mid/dark steps and alpha veils, so an injected brand colour
re-tunes the issue while the paper ground, ink body and rule system hold the
template's identity.

## Files

- `Kitchen Table.dc.html` — page: fonts, scene list, playback, brand tokens
- `kitchen-table-film.jsx` — palette, transitions, cameras, editorial furniture, 46 scenes
- shared: `../../kit/film-kit.js`, `../../animations-v3.jsx`, `../../image-slot.js`
