---
name: build-notes
label: Build Notes
cohort: 01 technical / documentation
orientation: vertical
stage: 1080x1920
runtime: 128s
beats: 18
engine: filmkit
colors:
  bg: "#ece7dd"
  surface: "#fbfaf7"
  rule: "#cdc6b8"
  inkMuted: "#716c62"
  ink: "#131210"
  accent: "#d8452c"
  accent2: "#2f6bd1"
  accentInk: "#fbfaf7"
fonts:
  display: Bevan
  body: Barlow
  mono: IBM Plex Mono
  devanagari: Noto Sans Devanagari
---

# BUILD NOTES — technical / documentation

The world is **a yard at the end of the shift**. A typography-led film for writing that already exists:
the argument carries the picture, not the other way round.

## The palette is a luminance ladder

`bg` #ece7dd · `surface` #fbfaf7 · `rule` #cdc6b8 · `inkMuted` #716c62 · `ink` #131210 · `accent` #d8452c · `accent2` #2f6bd1 · `accentInk` #fbfaf7

Ordered by lightness on purpose — luminance ladder; hue-rotatable at each slot’s own lightness. Rotating a hue for a brand
therefore preserves every contrast pair. `accent` is the measure; `accent2` is the
moment. Never both on one element.

## Type

**Bevan** sets display, **Barlow** sets the argument at a measure declared
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
