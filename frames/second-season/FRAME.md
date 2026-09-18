---
name: second-season
label: Second Season
cohort: 09 lifestyle / culture
orientation: vertical
stage: 1080x1920
runtime: 129s
beats: 18
engine: filmkit
colors:
  bg: "#f0ebe6"
  surface: "#fcf9f6"
  rule: "#ccc3ba"
  inkMuted: "#6e675f"
  ink: "#16120f"
  accent: "#e0673a"
  accent2: "#3a6b7a"
  accentInk: "#fcf9f6"
fonts:
  display: Chonburi
  body: Prompt
  mono: IBM Plex Mono
  devanagari: Noto Serif Devanagari
---

# SECOND SEASON — lifestyle / culture

The world is **a market stall opening up**. A typography-led film for writing that already exists:
the argument carries the picture, not the other way round.

## The palette is a luminance ladder

`bg` #f0ebe6 · `surface` #fcf9f6 · `rule` #ccc3ba · `inkMuted` #6e675f · `ink` #16120f · `accent` #e0673a · `accent2` #3a6b7a · `accentInk` #fcf9f6

Ordered by lightness on purpose — luminance ladder; hue-rotatable at each slot’s own lightness. Rotating a hue for a brand
therefore preserves every contrast pair. `accent` is the measure; `accent2` is the
moment. Never both on one element.

## Type

**Chonburi** sets display, **Prompt** sets the argument at a measure declared
in characters (45–75), and **IBM Plex Mono** is reserved for the gutter number, the counter and the `nn / NN` reading footer — it never sets a sentence.
Non-Latin falls back to Noto Serif Devanagari; all text is DOM/SVG, so it reflows rather than breaking.

## The beats

`hook` · `body` (the workhorse — 20–60 words as a word cascade) · `quote` (lines broken
on `|`, oversized mark, left accent rule) · `statement` · `stats` · `feature` · `montage` · `cta`

## Two rules this pack will not bend

**No authoring chrome ever reaches a viewer.** `chrome: false` — no pack badge, no template
name. An empty media slot becomes the `swap` beat and borrows a line the script has
not spent; an empty logo slot draws this pack's own mark in a filled badge. A dashed
placeholder is never drawn, in any state.

**A beat with thirty words on it cannot be two seconds long.** Every beat is measured against
225 wpm plus a 1.2s land.

## Determinism

Every time-varying value in the world is a pure function of `t`: `(t*rate)%period`,
`u.ease((t%period)/period)`, `Math.sin(t*rate+offset)`. No accumulator, no clock, no
`Math.random` — so a seek to any timestamp reproduces the same frame forwards or backwards.
