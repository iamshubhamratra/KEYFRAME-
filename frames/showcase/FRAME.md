---
version: alpha
name: Showcase — Frame
description: >
  A bright, annotated product tour. Real screenshots sit in clean browser chrome
  and phone bezels on a soft blue-grey sheet washed with blurred colour blobs, a
  fine 52px grid and drifting paper planes. Curved arrows draw themselves onto
  the UI, numbered callout bubbles pop beside the parts that matter, a highlight
  box pulses around a region and a cursor glides in to click. Space Grotesk
  display over JetBrains Mono labels; motion is a clean slide-push between scenes
  with a slow Ken Burns into each capture. The most screenshot-forward pack in
  the library — for product tours, feature walkthroughs, onboarding explainers
  and anything where the product itself is the story.
unit: the frame — 1920×1080 primary; 9:16 documented
principle: the screenshot is the hero · annotations point at real things · numbers come from the script
renderer: >
  This pack routes to the DEDICATED showcase composer
  (server/src/services/showcase_composer.js, pack.json "renderer": "showcase") —
  a faithful GSAP port of the SHOWCASE template (showcase-film.jsx). Every render
  reproduces the template's seven authored scene types (Intro hero browser, Tour
  split with zoom + annotation, Detail multi-callout, Mobile phone bezel, Montage
  six-tile wall, Proof counter cards, CTA logo + pill), its animated blob backdrop
  with paper planes and birds, and its drawn arrows, numbered callouts and moving
  cursor. Only the CONTENT is swapped: every storyboard scene is routed to the
  template scene type it fits and filled with the user's own headlines, bullets,
  numbers and — above all — real screenshots.
---

# Showcase

## Ground

A soft blue-grey sheet (`#EEF1F7`) under a 160° wash to white at 52%. Five
blurred colour blobs drift slowly behind everything (accent, sky blue, green,
amber, violet) at 11–17% opacity with a 52px blur. Over that, a 52px hairline
grid at 4.5% ink, half-opacity. The sheet stays LIGHT in every variant — the
device frames, the annotation ink and the paper planes are all tuned for it, and
a dark ground breaks all three at once.

## Type

- **Display — Space Grotesk 700.** Tight (-0.03em), 0.97 line height. 104px on
  the intro, 72–82px on tour/mobile, 58–66px on detail/montage headers.
- **Labels — JetBrains Mono.** 0.14–0.22em tracking, uppercase, accent or muted.
  Eyebrows, callout numbers, stat labels, the browser URL.

## Accent

One accent carries the whole film: arrows, callout chips, highlight boxes, the
CTA pill, stat counters and the first backdrop blob. It recolours to the brand
(`skin.accents[0]`); everything else in the palette is fixed furniture.

## Scene types

| type | what it is | media |
|---|---|---|
| `intro` | centred headline over the hero screenshot rising into a browser frame | 1 desktop |
| `tour` | headline + body left, screenshot right, arrow + numbered callout, Ken Burns zoom | 1 desktop |
| `detail` | one large screenshot with three drawn callouts around it | 1 desktop |
| `mobile` | phone bezel left, headline set right, arrow + callout | 1 phone |
| `montage` | six-tile wall of screenshots flying in from staggered edges | 6 mixed |
| `proof` | two or three counting metric cards | none |
| `cta` | logo tile, big closing line, accent pill + url | none |

## Motion law

Scenes cut with a slide-push (±10% of frame width) and a continuous 1.03 inner
scale. Arrows draw with `pathLength="100"` and a dash offset so a seek lands
mid-draw deterministically. Callouts pop with `back.out(2)`. Counters run on a
seeked proxy — every per-frame value is a pure function of `tl.time()`.

## Assets

This pack is built for REAL captures. `assets.prefer` puts screenshots first and
the composer sorts the pool the same way, so topic screenshots (topic_shots.js)
and website captures land in the browser and phone frames ahead of stock photos.
An unfilled slot still draws the template's dashed plate — and is stamped
`data-media-slot` so `media_fill.scanCoverage()` can count it as a hole.
