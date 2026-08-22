# 06 — Split Time

**Category** Sport / Fitness
**Orientation** 16:9 · 1920 × 1080
**Runtime** 5:00 · 43 scenes · looping
**Tags** `running` `fitness` `sport` `kinetic` `data` `high-energy` `app` `coaching`

## Description

A speed film. The whole template leans: a −7° skew runs through bars, blocks,
buttons and chapter stripes, so every element reads as moving even at rest.
Motion-trail ghosting echoes headline type, split-flap clocks land on lap times,
and transitions streak, slam and flash rather than fade. Oversized tabular
numerals carry the story — this is the most numeric world in the collection.

## Recommended use cases

Running, cycling and endurance apps · gyms, coaching and training plans · sports
brands and race organisers · wearables and performance hardware · any product
whose proof is a measurable improvement.

## Design brief

- **Layout system** — kinetic and left-anchored: headline blocks step rightward
  at increasing indents, bars and cards run edge to edge, and content sits on a
  140–150px gutter. Skewed containers counter-skew their text so type stays upright.
- **Shape language** — parallelograms. Almost nothing is rounded; radii are 6–14px
  and used only on image frames and flap tiles.
- **Typography** — Figtree 800 at −0.05em with tabular figures is the display and
  data voice (38–360px); Caprasimo handles set-piece statements, chapter titles
  and quotes.
- **Palette** — bone ground and a near-black `track` for full-bleed speed scenes,
  hot terracotta accent, olive second accent, chalk for inactive data.

## Animation description

| Layer | Behaviour |
| --- | --- |
| Transitions | Five owned wipes: `streak` (ten skewed bands), `slam` (vertical crush from the base), `chevron` (eight alternating columns), `swipeUp`, `flash` (single-frame blowout) |
| Cameras | `dash`, `drop`, `kick` (scale overshoot), `shake` (settling), `leanIn` (skew), `cruise` |
| Signature | `Ghost` — multi-layer motion-trail echo behind headline type; `Lap` — split-flap digit clock; `Trails` — continuous speed streaks; `Bib` — skewed race-bib tags |
| Data | Segment fade bars, pace-per-km bars, split sheet, HR drift line, fuelling rows, 18-week load curve, 10-day taper, before/after even-split bars |
| Pacing | Choreography at 12× scene length, the fastest in the collection; trails and waveforms keep running underneath |

## Asset placeholders

| id | Size | Purpose |
| --- | --- | --- |
| `st-mark` | 28² | Brand mark in the skewed chrome tag |
| `st-logo` / `st-logo-cta` | 140² / 130² rounded | Logo, open and close |
| `st-feat-1` | 780 × 640 | Feature imagery |
| `st-coach` | 500 × 620 | Coach portrait |
| `st-kit-0…2` | 420–480 × 500–640 | Race-kit triptych |
| `st-mont-1` / `st-mont-2` | 840 × 480 | Montage pair |
| `st-club-0…4` | 270 × 320 | Club photos (skewed frames) |
| `st-founder` | 540 × 660 | Founder portrait |
| `st-cta` | 700 × 700 | Closing image |

## Text placeholders

- **Display / number** — `BIG()` 38–360px tabular (headlines, stats, times, paces)
- **Set piece / quote** — `SET()` Caprasimo 62–84px
- **Section number / title / deck** — `Chapter`, five beats (number is ghosted)
- **Body** — `BODY()` 30–44px, 660–880px measure
- **Tag / label** — `TAG()` 20–30px at 0.2em, often inside a skewed `Bib`
- **Lap clock** — `Lap` takes any digit string with `:` or `.` separators
- **CTA** — 118px two-tone headline, 30px skewed button, 26px URL

## Brand colour tokens

```js
window.OM_TWEAKS = { brandName: "SPLIT", brand: "#d4552b", brand2: "#7e8f52" };
```

`brand` drives the trails, ghost echoes, late-segment bars, flap highlights, bib
tags, stat blocks, plan highlight and the CTA button; `brand2` marks achieved
states (pace held, negative split, recovery, distances). The bone ground, the
`track` black and the −7° skew are fixed, so an injected brand colour changes the
film's energy without touching its geometry.

## Files

- `Split Time.dc.html` — page: fonts, scene list, playback, brand tokens
- `split-time-film.jsx` — palette, transitions, cameras, speed furniture, 43 scenes
- shared: `../../kit/film-kit.js`, `../../animations-v3.jsx`, `../../image-slot.js`
