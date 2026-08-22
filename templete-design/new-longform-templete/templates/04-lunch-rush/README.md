# 04 — Lunch Rush

**Category** Food service / Delivery & lifestyle
**Orientation** 16:9 · 1920 × 1080
**Runtime** 5:00 · 50 scenes · looping
**Tags** `restaurant` `delivery` `lunch` `cafe` `vibrant` `ui` `saas-adjacent` `energetic`

## Description

A vivid, fast food-service film. The world is a modular tile grid that shuffles,
flips and snaps; the interface of ordering is part of the design language rather
than decoration — order steppers, live ETAs, price tags, printed receipts and
star ratings all carry real content. Colour blocks are saturated and the cuts
are the quickest in the collection.

## Recommended use cases

Restaurants, cafés and canteens · food delivery and meal services · anything with
an ordering flow or a time promise · retail and lifestyle brands wanting energy ·
B2B office services.

## Design brief

- **Layout system** — a 6 × 3 tile grid underlies the film: chapter dividers,
  transitions and option scenes all resolve to tiles. Content scenes alternate
  between full-bleed panels and a two-column split at a 140px gutter.
- **Shape language** — chunky and rounded: 14–26px radii on tiles and cards,
  999px on chips and buttons, rotated price tags with a hard drop shadow.
- **Typography** — Figtree 800 at −0.04em carries every number and headline
  (tabular figures throughout, since the film is full of times and prices);
  Caprasimo is reserved for dish names, questions and quotes.
- **Palette** — cream ground with terracotta, amber and sage as full-bleed
  grounds; a near-black `night` for the UI and photography scenes.

## Animation description

| Layer | Behaviour |
| --- | --- |
| Transitions | Five owned wipes: `tiles` (18 tiles scaling and rotating), `zip` (centre-out vertical), `deal` (four rounded cards dealt off), `strip` (seven bands leaving alternately), `pop` (circular iris from the top-right) |
| Cameras | `punch` (overshoot scale), `slideUp`, `shuffle` (settling jitter), `tilt3d` (perspective), `rushL` (fast pan), `hold` (breathing) |
| Signature | `Stepper` order tracker, `Receipt` line-by-line print, `Price` rotated tags, `Stars`, live countdown ETA |
| Interaction | A cursor travels and taps to place the order, driving the stepper |
| Text | Per-character pop, punch-in lines, typewriter, tabular counters, dish-name marquees |
| Pacing | Choreography at 12× scene length; the order tracker, delivery route and packaging reveal read raw scene progress so they play out across the beat |

## Asset placeholders

| id | Size | Purpose |
| --- | --- | --- |
| `lr-mark` | 30² circle | Brand mark in the chrome pill |
| `lr-logo` / `lr-logo-cta` | 170² / 140² circle | Logo, open and close |
| `lr-queue` | full bleed | Problem-scene backdrop |
| `lr-kitchen` | 800 × 640 | Kitchen feature image |
| `lr-dish-0…2` | 420–480 × 500–640 | Three dish shots with price tags |
| `lr-chef` | 520 × 620 | Kitchen-owner portrait |
| `lr-mont-1` / `lr-mont-2` | 820 × 480 | Montage pair |
| `lr-team-0…4` | 260² | Team/office tiles |
| `lr-pack` | 940 × 540 | Packaging shot under the reveal |
| `lr-founder` | 560 × 660 | Founder portrait |
| `lr-cta` | 720 × 700 | Closing image |
| `lr-rider-0…3` | 300 × 380 | Rider cards |

## Text placeholders

- **Headline** — `HEAD()` 76–190px (Hook, Turn, Compare rows, CTA)
- **Numbers** — `NUM()` 52–400px tabular (clock, stats, prices, ETA, ratings)
- **Dish / question / quote** — `DISH()` Caprasimo 46–72px
- **Chapter number / title / deck** — `Chapter`, five beats
- **Body** — `BODY()` 30–40px, 680–860px measure
- **Chip / label** — `CAPS()` 20–28px at 0.18em in a pill
- **Receipt lines** — item + price pairs plus a total
- **Stepper labels** — four short all-caps stage names
- **CTA** — 116px two-tone headline, 46px button, 28px URL

## Brand colour tokens

```js
window.OM_TWEAKS = { brandName: "MIDDAY", brand: "#e0663a", brand2: "#93a35c" };
```

`brand` drives tile grounds, price tags, the stepper fill, the delivery path,
chips, bars and buttons; `brand2` is the second full-bleed ground (Turn, Diet,
Cuisines, Planet, CTA). The amber `sun` and deep `deep` tones are derived
supports that keep the template's energy when a cooler brand colour is injected;
`FilmKit.palette()` supplies the ramps, glows and veils.

## Files

- `Lunch Rush.dc.html` — page: fonts, scene list, playback, brand tokens
- `lunch-rush-film.jsx` — palette, transitions, cameras, UI furniture, 50 scenes
- shared: `../../kit/film-kit.js`, `../../animations-v3.jsx`, `../../image-slot.js`
