---
name: plain-speech
label: Plain Speech
cohort: 10 opinion / manifesto
orientation: vertical
stage: 1080x1920
runtime: 129s
beats: 18
engine: filmkit
colors:
  bg: "#f0f1f2"
  surface: "#fcfdfd"
  rule: "#ccd0d2"
  inkMuted: "#6c7174"
  ink: "#0f1112"
  accent: "#1f4f7a"
  accent2: "#c9a13a"
  accentInk: "#fcfdfd"
fonts:
  display: Staatliches
  body: Catamaran
  mono: IBM Plex Mono
  devanagari: Noto Sans Devanagari
---

# PLAIN SPEECH — opinion / manifesto

The world is **a civic forecourt**. A typography-led film for writing that already exists:
the argument carries the picture, not the other way round.

## The palette is a luminance ladder

`bg` #f0f1f2 · `surface` #fcfdfd · `rule` #ccd0d2 · `inkMuted` #6c7174 · `ink` #0f1112 · `accent` #1f4f7a · `accent2` #c9a13a · `accentInk` #fcfdfd

Ordered by lightness on purpose — luminance ladder; hue-rotatable at each slot’s own lightness. Rotating a hue for a brand
therefore preserves every contrast pair. `accent` is the measure; `accent2` is the
moment. Never both on one element.

## Type

**Staatliches** sets display, **Catamaran** sets the argument at a measure declared
in characters (45–75), and **IBM Plex Mono** is reserved for the gutter number, the counter and the `nn / NN` reading footer — it never sets a sentence.
Non-Latin falls back to Noto Sans Devanagari; all text is DOM/SVG, so it reflows rather than breaking.

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
