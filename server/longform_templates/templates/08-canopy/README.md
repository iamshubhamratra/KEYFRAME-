# 08 — Canopy

**Category** Nature / Adventure & expedition
**Orientation** 16:9 · 1920 × 1080
**Runtime** 5:00 · 38 scenes · looping
**Tags** `jungle` `adventure` `expedition` `conservation` `depth` `parallax` `atmospheric` `field-research`

## Description

An immersive expedition film. Five planes of foliage sway independently in front
of and behind the content, volumetric light shafts drift across the frame, and
spores float upward continuously — the environment is never static, even on data
scenes. Routes and camps are drawn like expedition charts, and transitions are
made of the forest itself: leaves, canopy edges, undergrowth, light.

Distinct from template 07 (Flightpath), which is open, high and calm: this one is
enclosed, dark and textured, with pushing cameras rather than soaring ones.

## Recommended use cases

Field research and expedition storytelling · rainforest and habitat conservation ·
adventure travel and outdoor brands · carbon and land-rights projects ·
documentary explainers that need atmosphere rather than polish.

## Design brief

- **Layout system** — content sits inside the environment: 150–180px gutters,
  copy anchored bottom-left or centred, with foliage overlapping the frame edges.
  Data scenes use ruled rows and bar strata rather than cards.
- **Shape language** — organic silhouettes. A single static frond polygon is
  reused across planes at different scales and rotations; radii elsewhere are
  4–12px.
- **Typography** — Caprasimo for statements and stage titles, Figtree 400/600 for
  body and leads, and 0.26em all-caps labels for field readouts (frame numbers,
  altitudes, timestamps).
- **Palette** — deep forest ground and near-black ink for immersive scenes, bone
  for data scenes, a warm `sun` for light shafts and labels, clay accent and a
  brighter moss second accent.

## Animation description

| Layer | Behaviour |
| --- | --- |
| Transitions | Five owned wipes: `leaves` (16 leaf-shaped masks), `canopy` (three jagged canopy edges descending), `shaft` (six skewed light columns), `undergrowth` (a serrated edge rising), `mist` (soft fade) |
| Cameras | `push`, `climb`, `sweepR`, `sweepL`, `breathe`, `emerge` (blur-and-scale out of the murk) |
| Signature | `Canopy` — five foliage planes, each with its own sway frequency, amplitude and depth tint; `Shafts` — blurred volumetric light; `Spores` — upward drift; `Marker` — expedition chart pins; `Stratum` — labelled forest-layer bars |
| Data | Four-survey cover loss, hectare species counts, hourly camera triggers, dispersal distances, canopy-closure regrowth, carbon contract figures, a dawn-chorus spectrum |
| Pacing | Choreography at 12× scene length; foliage sway, shafts and spores run continuously so every held frame still moves |

Ridgeline and foliage clip-paths are computed once and animated by transform
only, so DOM capture, thumbnails and frame export stay within budget.

## Asset placeholders

| id | Size | Purpose |
| --- | --- | --- |
| `cp-mark` | 28² circle | Brand mark in the chrome pill |
| `cp-logo` / `cp-logo-cta` | 130² / 120² circle | Logo, open and close |
| `cp-hero` | full bleed | Opening canopy image |
| `cp-road` | full bleed | Logging-road backdrop |
| `cp-drone` | full bleed | Aerial / lidar image |
| `cp-find` | full bleed | Discovery frame |
| `cp-camp` | full bleed | Field camp |
| `cp-trap` | 780 × 660 | Camera-trap instrument |
| `cp-cam-0…7` | 8 × 260 tall | Camera-trap frame grid |
| `cp-kit-0…2` | 420–480 × 500–640 | Field-kit triptych |
| `cp-ranger-0…4` | 250 × 330 | Ranger portraits |
| `cp-village` | 800 × 620 | Village image |
| `cp-founder` | 540 × 680 | Founder portrait |

## Text placeholders

- **Statement** — `SET()` Caprasimo 50–108px (Hook, Turn, Now, CTA, stage titles)
- **Stage label / title / deck** — `Chapter`, four stages (ONE–FOUR)
- **Field label** — `CAPS()` 15–21px at 0.26em (frame numbers, altitudes, seasons)
- **Lead / body** — `LEAD()` 38–42px semibold, `BODY()` 26–38px at 1.5
- **Number** — `NUM()` 44–300px tabular
- **Quote + attribution** — 80–84px with an 18px credit
- **CTA** — 100px statement, 24px pill button, 18px URL

## Brand colour tokens

```js
window.OM_TWEAKS = { brandName: "CANOPY", brand: "#c2703a", brand2: "#6f9153" };
```

`brand` drives the route lines, stage rules, loss bars, chart markers, agreement
numerals and the CTA; `brand2` carries the living data — strata, regrowth,
species counts, trigger bars. The forest grounds, the bone data ground and the
`sun` light tone are fixed, so an injected brand colour re-tints the survey
without changing the environment.

## Files

- `Canopy.dc.html` — page: fonts, scene list, playback, brand tokens
- `canopy-film.jsx` — palette, transitions, cameras, environment, 38 scenes
- shared: `../../kit/film-kit.js`, `../../animations-v3.jsx`, `../../image-slot.js`
