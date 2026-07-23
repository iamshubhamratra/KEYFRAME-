---
version: alpha
name: Claymotion — Frame (video / frame layer)
description: >
  A handmade stop-motion clay film. Every frame looks sculpted from plasticine and shot on a
  miniature tabletop set under studio lamps — putty clay board, terracotta / moss / sky / plum
  props, chunky rounded Baloo 2 display over Inter body. Nothing is machine-straight: organic
  blob radii, tilted baselines, fingerprints, soft double shadows, a contact shadow under every
  element. The signature is MOTION: everything animates QUANTIZED at ~8 frames per second —
  stepped eases, squash-and-stretch drop-ins, clay smear-frame transitions. No smooth digital
  motion exists in this pack.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: everything is sculpted · nothing is machine-straight · all motion steps at 8fps

colors:
  putty: "#F1E2D3"
  putty-deep: "#E4D0BA"
  terracotta: "#DD6B4A"
  moss: "#7FA05F"
  sky: "#6FAEC6"
  plum: "#96639B"
  ink: "#37281F"
  clay-white: "#FBF3E7"

typography:
  # — reading ramp (Inter) —
  body:          { fontFamily: "Inter", cqw: 1.05, weight: 500, lineHeight: 1.6 }
  caption:       { fontFamily: "Inter", cqw: 0.9,  weight: 500, lineHeight: 1.45 }
  kicker:        { fontFamily: "Inter", px: 13, weight: 700, tracking: "3.5px", upper: true }
  credit-label:  { fontFamily: "Inter", px: 11, weight: 600, tracking: "2.5px", upper: true }
  # — display ramp (Baloo 2 — chunky, rounded, hand-modelled) —
  card-title:    { fontFamily: "Baloo 2", cqw: 2.1, weight: 700, lineHeight: 1.1 }
  blob-word:     { fontFamily: "Baloo 2", cqw: 3.4, weight: 800, lineHeight: 1.0, note: "the emphasis word, always seated on a clay-blob pad" }
  section-headline: { fontFamily: "Baloo 2", cqw: 4.6, weight: 800, lineHeight: 1.02 }
  stat-numeral:  { fontFamily: "Baloo 2", cqw: 6.2, weight: 800, lineHeight: 1.0 }
  hero-title:    { fontFamily: "Baloo 2", cqw: 7.6, weight: 800, lineHeight: 0.95 }
  # — decorative —
  ghost-glyph:   { fontFamily: "Baloo 2", cqw: 12.0, weight: 800, color: "rgba(55,40,31,0.07)", note: "a huge soft glyph pressed into the backdrop like a relief" }

spacing:
  pad-x: "5cqw"
  pad-y: "4cqw"
  gap-grid: "2cqw"
  card-pad: "2.4cqw"
  floor-height: "22%"      # the set-floor band at the bottom of the frame

components:
  clay-blob:
    background: "{colors.terracotta} (or moss/sky/plum as supporting cast)"
    rounded: "organic — e.g. 53% 47% 52% 48% / 46% 55% 45% 54%; never a perfect pill"
    shadow: "double lamp shadow + inner highlight top-left, inner shade bottom-right (pressed plasticine)"
    typography: "{typography.blob-word} in {colors.clay-white} or {colors.ink}"
    description: "The emphasis pad — a hand-pressed plasticine slab under the one loaded word. Enters with a stamp-press (oversized → squash → settle, in steps)."
  clay-sphere:
    surface: "matte clay ball — radial highlight at 30/28%, deepened rim; sizes 3–9cqw"
    description: "Ambient tabletop prop. Bobs vertically in visible 8fps ticks; its contact shadow squashes in counter-phase."
  clay-donut:
    surface: "thick clay ring (border-width ≈ 30% of diameter) with a notch dot so rotation reads"
    description: "Rotates in ticks (steps), never smoothly. Supporting colors only."
  clay-star:
    surface: "5-point star with heavily rounded joints (thick round-join stroke in fill color) — a cookie-cutter clay star"
    description: "Rotates or wobbles in ticks; corner prop."
  contact-shadow:
    surface: "soft ellipse, rgba(55,40,31,0.18), blur ≈ 0.6cqw, directly under the prop"
    description: "MANDATORY under every prop, blob, and card. Nothing floats in a stop-motion set."
  thumbprint:
    surface: "repeating-radial-gradient of 8% ink arcs inside a rounded blob, ~5cqw, rotated"
    description: "The animator's fingerprint left in the clay — 1–2 per frame, in quiet corners, never on text."
  worm-rule:
    surface: "a rolled clay sausage — thick round-cap wavy stroke (SVG path), {colors.terracotta} or {colors.moss}"
    description: "The divider line. Slightly wavy, hand-rolled; may wiggle ±1.5° in ticks."
  googly-dot:
    surface: "pairs of clay-white circles, ink border, offset ink pupil"
    description: "Playful punctuation. Pupils dart in single-frame ticks; one pair max per frame."
  set-floor:
    surface: "{colors.putty-deep} band across the bottom {spacing.floor-height}, soft gradient seam to the backdrop"
    description: "The horizon where the clay board meets the backdrop — establishes the miniature set. Props stand ON it (contact shadows on the floor)."
---

# Claymotion — Frame (video / frame layer)

## Overview

Claymotion at frame scale is a **miniature stop-motion film set**: a light putty clay board lit
by two soft studio lamps, dressed with matte plasticine props, with chunky hand-modelled type
dropped onto it word by word. The voice is **Baloo 2** — thick, rounded, toy-like — for every
headline, stat, and emphasis word; **Inter** carries body copy, captions, and credit labels.

Everything is sculpted, so nothing is perfect: border radii are **organic blobs**, baselines
tilt **±2–3°**, dividers are rolled clay sausages, and 1–2 **thumbprints** sit in the corners
of the clay. Every element casts a **soft double shadow** (two lamps) plus a **contact shadow**
on the board — nothing ever floats.

The unmistakable signature is temporal, not spatial: **all motion is quantized to ~8 frames per
second.** Where the other 46 packs glide, Claymotion *ticks* — deliberately jerky, exactly like
an animator moving clay between exposures.

**Key characteristics at frame scale:**
- **Putty board environment** — `{colors.putty}` ground + `{colors.putty-deep}` set-floor band; a visible floor/backdrop horizon in every frame.
- **Baloo 2 (700/800) display + Inter body** — no other faces; display is never uppercase-tracked, it is chunky sentence case, like letters pressed from cutters.
- **Five clays** — `{colors.terracotta}` is the hero clay (ONE hero element per frame); `{colors.moss}` / `{colors.sky}` / `{colors.plum}` are the supporting cast; `{colors.ink}` is clay-brown ink for type.
- **Soft double shadows everywhere** — two offset lamp shadows + a contact ellipse; no hard poster shadows, no glow.
- **Organic geometry** — blob radii, wavy worm-rules, rounded-joint stars; a perfect rectangle or a 0-radius edge is a defect.
- **8fps stepped motion** — every tween uses a stepped ease; durations are multiples of 125ms.

### Frame Craft Bar
- **Squint** — one element dominates 3–5×: the `hero-title`, a `stat-numeral`, or the `blob-word` on its pad. Props are furniture, never rivals.
- **Silence** — the board reads 40–55% empty putty; props cluster at edges and corners.
- **Restraint** — terracotta fires ONCE per frame (the blob pad, a hero prop, or a smear — never two); googly-dots max one pair.
- **Reference** — aim at **Aardman / Wallace & Gromit title cards and Pingu set photography**; failure looks like a smooth flat-design infographic with round corners.

## The Frame

- **Primary:** 1920×1080 (16:9). Display sizes authored in **`cqw`** (`px ÷ 1920 × 100 = cqw`).
- **Vertical:** 1080×1920 (9:16). **Square:** 1080×1080 (1:1).
- **Safe area:** `5cqw` padding; the set-floor band and smear frames bleed full-frame.

**The container law (load-bearing).** Every frame ground sets `container-type: size`; all
frame-relative units are `cqw`/`cqh` — **never `vw`.**

## Colors

`{colors.putty}` is the board; `{colors.putty-deep}` is the floor band and pressed-relief
shading. `{colors.terracotta}` is the hero clay — the emphasis blob, the smear frame, or one
hero prop, never more than one per frame. `{colors.moss}`, `{colors.sky}`, `{colors.plum}` are
supporting props and secondary pads. Type is `{colors.ink}` on putty, `{colors.clay-white}` or
ink on colored clay — whichever clears contrast. No pure black, no pure white, no gradients
except the soft floor seam and the in-material highlight/shade of each clay surface.

## Typography

- **Legibility floor:** any load-bearing line ≥ **1.4cqw**.
- **Fit-to-measure:** headline block ≤ 76cqw; ≤3 words → `hero-title`; 4–6 → `section-headline`; 7+ → `card-title` scale.
- **Tilt law:** every display block sits at **±2–3°** (alternate direction frame to frame); body copy may sit straight but its card tilts.
- **The emphasis word** — exactly one per headline — sits on a `clay-blob` pad and uses `blob-word`. Never underline, never italic, never letter-spaced display.

## Depth & Surface

Soft and physical — a lit miniature, not a flat poster:
- **Double lamp shadow** on cards, pads, props: one tight offset shadow + one wider, softer one.
- **Contact shadow** (mandatory) — the soft ellipse where each thing touches the board.
- **In-material modelling** — top-left inner highlight + bottom-right inner shade on every clay surface (pressed plasticine).
- **Thumbprints** and the **ghost-glyph relief** as texture; ≤2 texture marks per frame.

**Ceiling:** no glow, no blur-motion, no gradient backgrounds, no hard 0-blur poster shadows, no glass/transparency.

## Shapes

- **Organic blob radii** on every slab and pad — 4-corner asymmetric percentages; two elements never share the exact same radius.
- **Circles** for spheres, donut rings, googly-dots (their imperfection comes from shading + wobble, not radius).
- **A perfectly straight, sharp-cornered rectangle is forbidden.**

## Components

- **set-floor** — the horizon; the frame's establishing device.
- **clay-blob** — the emphasis pad; one per frame under the loaded word.
- **clay-sphere / clay-donut / clay-star** — the ambient prop cast, each with a **contact-shadow**.
- **worm-rule** — the wavy sausage divider. **thumbprint** — the maker's mark. **googly-dot** — punctuation, sparingly.

## Frame Treatments

### 1 · Set Cover  (identity · centered, tilted −2°)
**Ground** putty board + set-floor. **Focal** a 2–3 word `hero-title` in ink, last word on a
terracotta `clay-blob`. **Chrome** an Inter `kicker` above; a `credit-label` film-slate line
below. **Props** 2 spheres + 1 star/donut at the edges, on the floor. **Silence** ~50%.

### 2 · Feature Stat  (anchor · left, tilted +2°)
**Focal** a `stat-numeral` seated on a large terracotta blob pad, `ghost-glyph` relief behind.
**Chrome** kicker + one `body` support line ≤ 44cqw. **Props** one moss donut on the floor,
one thumbprint. **Silence** ~45%.

### 3 · Prop Catalog  (catalog · the dense frame · centered head)
**Focal** a `section-headline` over three clay-white blob cards (card-tilt −1.5°/+1°/−1°),
each with a colored prop, `card-title`, `caption`, and contact shadow. Supporting clays only —
terracotta appears once, in the headline's blob word.

### 4 · Quote Plate  (quote · left)
**Focal** a 2–3 line quote in `card-title` scale Inter-500-italic-free Baloo 2 700, on a large
tilted clay-white slab; a moss worm-rule beneath the attribution; one googly-dot pair as the
"speaker". **Silence** the right third is empty board + props.

### 5 · Closing Plate  (closer · centered)
**Focal** a 2-line sign-off, last word on the terracotta blob; a wavy worm-rule beneath;
film-slate credit line at the floor. Props gather at the floor edges like a curtain call.

## Composition rules

### Do
- Stage every frame as a **miniature set**: putty backdrop above, `set-floor` band below, props standing ON the floor with contact shadows.
- Cluster props at **frame edges and corners** — never behind or overlapping text.
- Give **every element a contact shadow** — nothing floats, ever.
- **Tilt display baselines ±2–3°**, alternating direction across consecutive frames.
- Fire **one terracotta hero** per frame; cast moss/sky/plum as the supporting palette.
- Use organic blob radii and vary them element to element; leave 1–2 thumbprints in quiet clay.

### Don't
- Don't draw a straight sharp rectangle, a perfect pill, or a 0-radius edge.
- Don't use gradients (beyond floor seam + in-material modelling), glows, or blur.
- Don't let two terracotta elements compete, or put a prop behind a headline.
- Don't set Baloo 2 in all-caps with tracking — it reads as poster, not clay.
- Don't animate ANYTHING smoothly — see Motion; a single eased 60fps glide breaks the entire fiction.

## Motion — the stop-motion grammar

Motion is the pack's identity. The renderer implements four laws:

**1 · The 8fps law (global).** Every tween is quantized to visible steps: GSAP `steps(n)`
eases with durations in multiples of **125ms** (`n = duration × 8`). Position, scale, and
rotation all tick. There is no `power2.out`, no `sine.inOut`, no smooth anything — a move of
0.5s is exactly 4 visible poses. Holds between moves are real holds (the clay is at rest).

**2 · Drop-in squash-and-stretch (text entrance).** Headline words **fall from above,
stretched tall** (`scaleY ≈ 1.5, scaleX ≈ 0.65`, transform-origin bottom-center), falling in
~3 steps; on landing they **squash wide for one frame** (`scaleY ≈ 0.6, scaleX ≈ 1.4`),
**overshoot back** for one frame (`scaleY ≈ 1.12`), then settle — a 6-pose landing. Words
stagger ≈ 3 frames apart. The blob pad enters with the same press: oversized → squash →
settle, in steps.

**3 · The smear frame (scene transition).** Between scenes a terracotta (or supporting-clay)
blob **streaks horizontally across the frame**, stretching into a long smear at mid-flight
(`scaleX ≈ 2.5`) like an animator's in-between drawing, covering center screen for 2–3 frames
while the outgoing scene is swapped, then snapping off the far edge. The smear itself is
stepped (≈ 4 poses in, 4 poses out).

**4 · The living tabletop (ambient).** Background props are never still, never smooth: spheres
**bob** 2 ticks up / 2 ticks down (contact shadows squash in counter-phase), donuts and stars
**rotate in ticks** (e.g. 360° over 8s = 16 poses; the donut's notch dot makes the ticks
read), googly pupils **dart** in single-frame moves with long holds. Emphasis after landing:
the blob pad may re-press (one squash pose) on the beat; nothing floats, wiggles smoothly, or
parallaxes.

Exits reverse the grammar: a one-frame stretch upward, then gone — or the smear takes the
whole scene.

## Aspect-Ratio Behavior

| Treatment | 16:9 | 9:16 | 1:1 |
|---|---|---|---|
| Set Cover | centered over floor | taller backdrop, floor 18%, words stack | centered, floor 20% |
| Feature Stat | numeral left, ghost right | numeral top, support below | centered numeral |
| Prop Catalog | 3-up cards | 3 stacked cards | 2+1 |
| Quote Plate | slab left, props right | slab top, props on floor | slab centered |
| Closing Plate | centered | centered, taller floor | centered |

Safe area holds `5cqw` on the short edge; re-step display so no load-bearing line drops below
the 1.4cqw floor. The smear frame always crosses the LONG axis of the frame.

## Approved Entities

No real customers, logos, or vendors — render any such mark as a clay-white blob placeholder.

## Numerals & Claims (hard rule)

Never invent figures, stats, dates, or counts. Render slots as `— figure —`, `{metric}`, `N×`.
Real numerals appear only when the script supplies them.

## Pre-Render Self-Audit

- **Squint** — one focal element dominates 3–5×; props are furniture.
- **Set** — floor band present; every element has a contact shadow; props at edges only.
- **Clay** — one terracotta hero; organic radii everywhere; ≤2 texture marks; baselines tilted.
- **Type** — Baloo 2 display sentence-case, Inter body; ≥1.4cqw floor; one blob-word per headline.
- **Motion** — every tween stepped at 125ms multiples; entrances squash; transitions smear; ambient ticks. Any smooth ease = reject.
- **Fabrication** — every numeral traces to the script, else placeholder.

## Known Gaps

- **Baloo 2 + Inter via Google Fonts**; no CJK pairing defined yet (Baloo 2 has no CJK — fall back to a rounded CJK face and keep the tilt/blob grammar).
- The clay look is CSS-only (shadows, radial highlights, thumbprint gradients); no image textures required — a future uplift could add a subtle noise/matte texture asset.
- 9:16 / 1:1 are guidance, not pixel-locked; verify the legibility floor per ratio.
- Audio pairing (foley clicks on ticks, a marimba/ukulele bed) is out of scope for this file.
