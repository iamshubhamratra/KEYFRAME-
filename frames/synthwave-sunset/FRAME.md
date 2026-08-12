---
name: synthwave-sunset
label: Synthwave
orientation: portrait
fontFamily: Audiowide
---

# Synthwave

# Synthwave Sunset

A 9:16 dark-ground film built on a scanline sun and an accelerating perspective grid, with the hardest camera in the world-pack.

## Palette

| role | hex |
|---|---|
| dusk | `#1a0b2e` |
| pink | `#ff5c8a` |
| cyan | `#45e0ff` |
| orange | `#ffa14a` |
| paper | `#f6ecff` |
| ink | `#120722` |

Ground alternates `dusk` (hook, feature, stats) and near-black `ink` (statement, montage, CTA); type is always `paper`. Highlights rotate cyan → pink → orange by beat. Tweakables expose the sky and the sun colour.

## Type

Display **Audiowide** (wide, chromed, geometric) · body **Jost**.
Every beat sets `upper: true` with `0.04em` tracking — the pack has no lowercase state. Hook 106px dropped low at a 940px top offset so the sun clears it; statement 136px.

## World

Runs at 2× film time on the hook, feature and stats beats:

- A `pink` sun disc, r 240 at y 520, with five `dusk`-coloured slats (heights 10→26) scrolling upward through it on `(t * 26) % 40`, ringed by a 300r 30%-alpha halo.
- A `cyan` horizon line at 58% height, with nine vertical rays fanning from ±90px at the horizon out to ±420px at the bottom edge.
- Six horizontal grid lines whose phase is squared (`e = ph²`), so they accelerate toward the viewer while stroke width grows 2 → 6 and alpha 0.25 → 0.75.
- Three white stars drifting right across the upper frame.

## Motion

Camera set `zoomIn · pushL · pushD · spin · pushR · pushU`, stepped `i × 7 + 2`.
Magnitudes: skew `8`, rotation `1.2`, zoom-in `0.65`, z-drift `0.07` — the most aggressive set here.
Title entrance **streak** (slides in from the right with a −12° skew), item entrance **pop**. Cut `push`, drift 1.

## Beats

Six core beats — hook, statement, feature, montage, stats, cta. This pack owns:

- **Code (`editor`)** — a mac-chrome panel (three traffic lights) typing numbered lines with the first token coloured in the highlight, ending in a pill badge output.
- **Cursor (`slider`)** — a 120px percentage counter driven by a dragged slider knob, then a toggle flip, with a drawn pointer following the knob.
- **Morph (`flap`)** — a split-flap board: every character is a bordered tile that scaleY-flips as the word changes, staggered left to right.
- **Notify (`drop`)** — notification cards falling in from above with a brand-initial avatar and a `now` timestamp.

Cards are the `glow` variant: `#120722` fill, cyan line, cyan glow, radius 14; stat numerals glow.

## Best for

Synths and music hardware, dev tools and launch nights, arcade and gaming, retro tech resellers, crypto and streaming brands that want chrome rather than warmth.

