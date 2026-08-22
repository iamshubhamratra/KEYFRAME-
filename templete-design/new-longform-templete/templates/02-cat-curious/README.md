# 02 — Cat Curious

**Category** Lifestyle / Playful premium
**Orientation** 16:9 · 1920 × 1080
**Runtime** 5:00 · 50 scenes · looping
**Tags** `cat` `pet` `playful` `editorial` `off-grid` `dtc` `subscription` `dark`

## Description

A sophisticated playful film for a cat brand. Where template 01 is warm, centred
and rounded, this one is dark, off-grid and quick: content anchors away from the
centre and bleeds off frame, cuts snap rather than ease, and cameras jolt in
stepped increments. Crop windows resize mid-scene so the same photograph is read
twice, and pupil/whisker motifs carry the theme without illustration.

## Recommended use cases

Cat and small-pet brands · playful premium DTC · products with a behavioural or
tracking angle · brands with strong photography and a dry voice · anything that
should feel curious rather than reassuring.

## Design brief

Built on the bound **Organic** design system: the page links its `styles.css` and
`_ds_bundle.js`, and the film resolves `--color-bg`, `--color-accent`,
`--color-accent-2`, the neutral ramp and `--font-heading` / `--font-body` out of
`:root` at load. `FilmKit.palette()` needs real hex for its lighten/darken/alpha
maths, so tokens are resolved once into JS rather than left as `var(--*)`.

This film keeps its dark ground — it is a night-time, watchful piece — using the
system's deep neutral steps rather than an invented charcoal.

- **Typography** — Caprasimo for display (the system's only display voice; the
  earlier sans display role is gone), Figtree 400/600 for body, Figtree 800 at
  0.2em for labels, italic Figtree for footnotes.
- **Shape language** — rounded per the system: 24px on panels, crop windows and
  photographs, 999px pills for kickers and tags.
- **Colour** — the system's terracotta accent and sage second accent over deep
  neutrals, with cream for type and the light data scenes.

## Garnish

One garnish layer sits at composition level above every scene, coloured from
whichever scene is under the playhead: a rotating tag pill top-right, an italic
footnote with an accent dash bottom-left, and — alternating by scene index —
vertical side type or a turning asterisk. Camera moves cycle from the template's
move list by scene index with a stride, so neighbouring scenes never share one.

## Animation description

| Layer | Behaviour |
| --- | --- |
| Transitions | Five owned wipes: `shutter` (nine snapping slats), `slats` (twelve vertical panels, randomised), `peel` (diagonal corner), `dots` (60-dot grid), `swipe` (two-panel split) |
| Cameras | `whip`, `jolt` (stepped, quantised motion), `tiltIn`, `scanY`, `crop` (stepped scale), `driftR` |
| Signature | `CropWindow` — an image frame that changes aspect mid-scene, re-reading the same photograph |
| Text | Per-character rise/drop, whip-in word stagger, typewriter, tabular counters, marquee tickers |
| Ornament | Narrowing pupils, drawn whiskers, drifting steam curls, pulsing map pins |
| Easing | Snap-quantised (`snap()`) rather than smooth — nothing glides |
| Pacing | Choreography at 6× scene length; every scene also carries ambient drift so holds stay alive |

## Asset placeholders

| id | Size | Purpose |
| --- | --- | --- |
| `cat-mark` | 30² | Brand mark in the corner chrome |
| `cat-logo` / `cat-logo-cta` | 150² / 140² rounded | Logo, open and close |
| `cat-hero` | 520×900 → 1180×640 | Opening crop window |
| `cat-bowl` | 900 × 600 | Bleed-off product frame |
| `cat-litter` | 1400×500 → 760×780 | Second crop window |
| `cat-feat-1` | 880 × 660 | Feature imagery |
| `cat-feat-2` | 1180×620 → 700×860 | Feature crop window |
| `cat-tex-0…2` | 460–620 × 540–700 | Tilted texture triptych |
| `cat-vet` | 440 × 560 | Specialist portrait |
| `cat-pack` | 1000 × 560 | Packaging shot behind the slide-off panel |
| `cat-mont-1` / `cat-mont-2` | 900 × 480 | Bleed montage pair |
| `cat-nap` | 1780×420 → 1180×700 | Panoramic crop window |
| `cat-founder` | 560 × 700 | Founder portrait |
| `cat-trust` | 700×820 → 1240×560 | Crop window on the trust beat |
| `cat-owner-1` | 72² rounded | Testimonial avatar |

## Text placeholders

- **Headline** — `HEAD()` 96–200px lowercase (Open, Hook, Turn, Free, CTA)
- **Section title** — 68–96px (Bowl, Habits, Feature*, Map)
- **Chapter number / title / subtitle** — `Chapter`, five beats
- **Pull quote** — `SERIF()` 70–96px with a 26px all-caps credit
- **Body** — 30–40px, max 660–780px measure
- **Statistic + caption** — `Counter` 120–400px with a 32px caption
- **Tag / label** — 22–30px all-caps at 0.2em in a hard-cornered tag
- **CTA** — 120px two-tone headline, 46px button, 30px URL

## Brand colour tokens

```js
window.OM_TWEAKS = { brandName: "MERROW", brand: "#d98b3f", brand2: "#8d9c6f" };
```

`brand` drives headline accents, tags, chapter bars, pins, waveform, buttons and
every transition colour; `brand2` drives the second voice (pupil rings, vet
scene, chapter grounds). Derived ramps, glows and alpha veils come from
`FilmKit.palette()`, so one injected colour re-tunes the whole film while the
charcoal ground, stone midtones and off-grid geometry keep the identity.

## Files

- `Cat Curious.dc.html` — page: fonts, scene list, playback, brand tokens
- `cat-curious-film.jsx` — palette, transitions, cameras, ornaments, 50 scenes
- shared: `../../kit/film-kit.js`, `../../animations-v3.jsx`, `../../image-slot.js`

## World

A properly drawn cat: arched spine, layered body forms, a striped
  flank, folded ears with an inner tone, almond eyes with slit pupils that blink,
  a muzzle with nose and mouth, three pairs of whiskers, a sage collar, and a tail
  that swishes on its own two-part S-curve. It walks the ledge on a four-leg gait
  and pauses to sit, the way a cat does. Behind it: three drifting sunbeams in
  different hues, a yarn ball rolling out its own thread, tumbling knick-knacks
  and hanging motes.

The world runs off the composition clock, so the cat keeps moving straight
through every cut instead of restarting, and sits behind a veil of the scene's own
ground so it never competes with type.
