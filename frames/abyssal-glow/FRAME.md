---
version: alpha
name: Abyssal Glow — Frame (video / frame layer)
description: >
  The bioluminescent deep sea as a design system. A film shot 4000 meters down:
  near-black water, caustic light webs, drifting plankton sparks, jellyfish pulses —
  everything seen through water, so type wobbles and refracts. Atoms are the
  five-light system (abyss ground / bioluminescent cyan / jelly magenta / deep teal /
  pale foam), Comfortaa rounded display + Inter body, radial glow halos on every
  luminous element, and the seven living components (caustic-web, bubble-column,
  plankton-drift, jellyfish, sonar-ring, depth-gauge, echo-text). Composition,
  frame scale, aspect-ratio behavior AND motion are specified here — the water
  moves or the frame is dead.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: light emits, never reflects · content floats, never anchors · cyan is the voice, magenta the echo

colors:
  abyss: "#041318"
  cyan: "#3FE8CE"
  magenta: "#E06BC4"
  teal: "#0D3B46"
  foam: "#E6FAF4"
  cyan-glow: "rgba(63,232,206,0.35)"
  magenta-glow: "rgba(224,107,196,0.30)"
  foam-dim: "rgba(230,250,244,0.62)"
  caustic-ink: "rgba(63,232,206,0.10)"

typography:
  # — reading ramp (Inter) —
  body:          { fontFamily: "Inter", cqw: 1.05, weight: 400, lineHeight: 1.7, color: "{colors.foam-dim}" }
  body-light:    { fontFamily: "Inter", cqw: 1.5,  weight: 300, lineHeight: 1.55, note: "drift-quote voice, foam on abyss" }
  section-label: { fontFamily: "Inter", px: 12, weight: 700, tracking: "4px", upper: true, color: "{colors.cyan}" }
  depth-readout: { fontFamily: "Inter", px: 11, weight: 600, tracking: "3px", upper: true, note: "gauge ticks — −1000 M, −2000 M…" }
  caption:       { fontFamily: "Inter", px: 14, weight: 500, color: "{colors.foam-dim}" }
  # — display ramp (Comfortaa — soft, rounded, luminous) —
  card-title:    { fontFamily: "Comfortaa", cqw: 1.8, weight: 700, lineHeight: 1.2, color: "{colors.foam}" }
  section-headline: { fontFamily: "Comfortaa", cqw: 3.6, weight: 700, lineHeight: 1.15, color: "{colors.foam}" }
  stat-numeral:  { fontFamily: "Comfortaa", cqw: 4.8, weight: 700, lineHeight: 1.0, color: "{colors.cyan}", glow: "0 0 3cqw {colors.cyan-glow}" }
  hero-title:    { fontFamily: "Comfortaa", cqw: 5.8, weight: 700, lineHeight: 1.08, color: "{colors.foam}" }
  echo-word:     { fontFamily: "Comfortaa", inherit: size, weight: 700, color: "{colors.cyan}", note: "the emphasis treatment — see components.echo-text" }
  background-glyph: { fontFamily: "Comfortaa", cqw: 12.0, weight: 700, color: "rgba(63,232,206,0.05)", note: "wallpaper glyph drowned in the water column" }

spacing:
  pad-x: "6cqw"        # generous — content floats, nothing touches an edge
  pad-y: "6cqh"
  drift-offset: "8cqw" # type block sits right-of-center by roughly this much
  gap-grid: "2cqw"
  card-pad: "2.2cqw"

components:
  caustic-web:
    render: "3–7 overlapping sine filaments (SVG paths or canvas strokes), {colors.cyan} at 8–14% alpha, 1–2px stroke, soft blur"
    motion: "each filament undulates on its own period (7–14s), phases never synced; drifts slowly sideways"
    placement: "upper third of the frame, as if surface light were 4000m overhead"
    description: "The light-filament field — the pack's atmospheric signature. Texture and life, never a divider."
  bubble-column:
    render: "6–14 stroked circles, 0.2–0.9cqw, {colors.foam} at 10–25% alpha, no fill"
    motion: "rise the full frame over 6–14s with a gentle sine sway; each pops (scale 1.2 → fade) near the top"
    description: "Vertical life. One or two loose columns per frame, off the type's measure."
  plankton-drift:
    render: "30–80 dots, 0.1–0.35cqw, mostly {colors.cyan}, some {colors.foam}, rare {colors.magenta} (≤1 in 10)"
    motion: "drift on slow individual vectors; each pulses opacity 15%→70%→15% on a 2–5s heartbeat"
    description: "The living dust of the water column. Fills silence without filling space."
  jellyfish:
    render: "a soft dome (blurred path, {colors.magenta} 30–45% fill, {colors.cyan} rim light) with 4–6 trailing tentacle lines"
    motion: "bell pulses scaleY 0.94↔1.05 (origin bottom-center) every ~2.6s; each pulse propels a slow upward drift; tentacles lag with a skew wave"
    placement: "one per frame at most, far from the focal type, half-out-of-frame allowed"
    description: "The pack's creature. Ambient, never the subject unless the script says so."
  sonar-ring:
    render: "2–3 concentric circle strokes, {colors.cyan} 1px, born at 0 scale"
    motion: "expand to 3–5× over 2–3s while fading 80%→0; staggered 0.6s apart; ping repeats every 4–6s"
    placement: "centered on the element being pinged (echo-word, stat, gauge marker)"
    description: "The attention ping. One ping source per frame."
  depth-gauge:
    render: "a thin (0.1cqw) vertical {colors.cyan}-at-30% rail with {typography.depth-readout} tick labels and one glowing marker dot ({colors.cyan}, halo)"
    motion: "the marker sinks (or rises) between ticks to show progress; a sonar-ring may ping the active tick"
    placement: "floats inside the safe area near the left or right edge of the drift — never flush to the frame edge"
    description: "Progress and section chrome, in meters. −1000 M, −2000 M… ordinals are decorative and may be invented; real figures may not."
  echo-text:
    render: "the emphasis word in {colors.cyan} weight 700 with a soft glow halo (0 0 2.5cqw {colors.cyan-glow}), plus two ghost copies of the SAME glyphs: one {colors.magenta} offset one way (~0.3cqw, 50% alpha, slight blur), one {colors.cyan} offset the other (~0.3cqw, 35% alpha, more blur)"
    motion: "ghost offsets drift ±0.15cqw on a slow sine so the double-image swims; optionally a sonar-ring ping on arrival"
    description: "The sonar-echo emphasis — a chromatic double-image, as if the word were heard twice through water. One echo-text per frame."
---

# Abyssal Glow — Frame (video / frame layer)

## Overview

Abyssal Glow at frame scale is a **deep-sea documentary title card** — a near-black
water column (`{colors.abyss}`) in which every element of the design **emits its own
light.** There are no lit surfaces down here: no white cards, no borders catching
overhead sun, no hard edges of any kind. A thing is visible because it glows —
bioluminescent cyan first (`{colors.cyan}`, the voice of the system), jelly magenta
second (`{colors.magenta}`, the echo, always subordinate), pale foam
(`{colors.foam}`) for the reading light of headlines and body copy, deep teal
(`{colors.teal}`) for the rare panel that must separate itself from open water.

The voice is a two-face hierarchy: **Comfortaa** — soft, rounded, almost
gelatinous — carries every headline, stat, and title, because nothing sharp
survives at this pressure; **Inter** carries body, labels, captions, and the
depth-gauge readouts. Comfortaa glows; Inter explains. The atmosphere is alive by
contract: **caustic light webs** undulating in the upper third, **plankton motes**
pulsing on individual heartbeats, **bubble columns** rising, and — sometimes — one
**jellyfish** propelling itself slowly through the middle distance.

**Key characteristics at frame scale:**
- **One surface: the water.** `{colors.abyss}` is the ground of every frame. `{colors.teal}` panels are rare, soft-edged, and translucent — pockets of denser water, not cards.
- **Everything luminous has a halo** — every glowing element carries a soft radial fade (text-shadow / box-shadow / radial-gradient). No glow, no visibility; no halo, no glow. **No hard edges anywhere.**
- **Gradients encouraged** — radial glows are the native depth cue. Linear gradients only as vertical light-falloff on the ground.
- **Cyan is the voice, magenta the echo** — magenta never outweighs cyan in any frame; it exists in ghost copies, jellyfish bells, and rare accents.
- **Only luminous elements saturate** — the background and any panel stay within a whisper of black.
- **Content floats** — nothing is anchored, aligned, or flush to a frame edge; the type block drifts **right-of-center**, as if carried by a current.

### Frame Craft Bar
Three eyeball tests gate every frame before any structural check:
- **Squint** — one glow dominates: the `hero-title`/`stat-numeral` or the echo-word's halo reads 3–5× brighter than anything else. Two rival glows = a failed frame.
- **Silence** — frames read **55–70% open water.** The abyss is the luxury; underfilled frames get more plankton, never more content.
- **Restraint** — one jellyfish max, one echo-text max, one sonar-ring source max; magenta total luminance below cyan total luminance, always.
- **Reference** — aim at a **BBC deep-sea documentary title card / anglerfish photograph**: a vast black field, a few impossible lights. Failure looks like a neon nightclub poster — too many lights, no water.

## The Frame

- **Primary:** 1920×1080 (16:9). Display sizes authored in **`cqw`** (`px ÷ 1920 × 100 = cqw`).
- **Vertical:** 1080×1920 (9:16). **Square:** 1080×1080 (1:1).
- **Safe area:** `6cqw` / `6cqh` — larger than most packs because floating composition needs visible water on every side of every element.

**The container law (load-bearing).** Every frame ground sets `container-type: size`;
ALL frame-relative units are `cqw`/`cqh` resolved against it — **never `vw`.**

## Colors

`{colors.abyss}` is the water and the only true ground. `{colors.cyan}` is the
system's voice — labels, stats, gauge rails, caustics, plankton, ring pings, the
echo-word body. `{colors.magenta}` is the echo — ghost copies, jelly bells, at most
one small accent per frame, and **never more magenta than cyan.** `{colors.foam}` is
reading light — headlines and body, near-white but warm-cool, always slightly
translucent in body sizes. `{colors.teal}` is denser water — translucent panels
(40–70% alpha, blurred edge or large radius, soft glow rim) when copy needs a
pocket of stillness.

**Light falls off.** Every glow is a radial fade to transparent; every panel edge
is soft (large radius + faint rim glow or blur). A hard edge or an opaque flat
fill of any saturated color is a system violation.

## Typography

Two ramps. The **reading ramp** (Inter — body 1.05cqw, body-light 1.5cqw, labels
and readouts in px) carries copy, eyebrows, and gauge chrome. The **display ramp**
(Comfortaa 700 — `card-title` 1.8cqw → `hero-title` 5.8cqw, plus the drowned
`background-glyph` at 12cqw / 5% cyan) carries every headline and stat.

- **Legibility floor:** any load-bearing line ≥ **1.4cqw**; px labels are chrome only.
- **Fit-to-measure:** cap the headline block at **≤ 66cqw** (water must surround it); ≤3 words → `hero-title`; 4–6 → `section-headline`; 7+ → step down and break lines.
- Comfortaa is **never tracked wide, never uppercase-forced** — its lowercase rounds are the signature. Inter labels ARE uppercase, 3–4px tracked, cyan.
- Headlines are foam; **the emphasis word is the echo-text treatment** — one per frame.

## Depth & Surface

Depth is luminance, not elevation. Depth signals only:
- **Radial glow halos** — brighter halo = nearer to the lens.
- **Blur** — distant elements (background-glyph, far jellyfish, deep caustics) blur 1–4px.
- **Vertical light falloff** — the ground may run a barely-there linear gradient, `#062028` at top → `{colors.abyss}` at bottom: the memory of a surface 4000m up.
- **Translucent teal pockets** — the only panel; soft-edged, never opaque.

**Ceiling:** no box-shadow-as-elevation, no white surface, no border heavier than a 1px glow rim, no hard-edged rectangle, no flat saturated fill.

## Shapes

Water tolerates no corners. **Radius ≥ 1.2cqw on every panel;** circles, rings,
domes, and filaments are the native geometry. The only straight line in the system
is the depth-gauge rail — and it glows soft.

## Components

- **caustic-web** — the undulating light-filament field; upper third; the atmospheric signature.
- **plankton-drift** / **bubble-column** — the living dust and the rising life; silence-fillers, never over the type's measure.
- **jellyfish** — the creature; one max, middle distance, half-out-of-frame allowed.
- **sonar-ring** — the attention ping; one source per frame, centered on what matters now.
- **depth-gauge** — vertical progress chrome in meters; floats inside the safe area.
- **echo-text** — the chromatic double-image emphasis; one per frame; the pack's most recognizable atom.

## Frame Treatments

> Recipe per plate: ground · container · composes · focal · chrome · accent · silence · Fixed/Free · density.
> Everything floats; vary the drift side; one light dominates per frame.

### 1 · Abyss Cover  (identity · move: one dominant glow · right-of-center)
**Ground** `{colors.abyss}` with vertical falloff; caustic-web in the upper third.
**Composes** caustic-web, plankton-drift, hero-title, echo-text, section-label,
sonar-ring. **Focal** a 2-line `hero-title` in foam, drifted right-of-center, its
emphasis word set as echo-text with a ring ping on arrival. **Chrome** a cyan
`section-label` eyebrow floating above. **Accent** the echo-word halo. **Silence**
~60% open water. **Fixed** ripple-in entrance, one echo-word, caustics overhead.
**Free** copy, drift side, whether a jellyfish passes. **Density** sparse.

### 2 · Sonar Stat  (anchor · move: luminance scale · centered-drift)
**Ground** open abyss, plankton thicker than usual. **Composes** stat-numeral,
section-label, sonar-ring, body. **Focal** one `stat-numeral` in cyan with a full
halo, sonar-rings pinging from its center; support line in Inter below.
**Silence** ~65%. **Fixed** cyan numeral, rings from the numeral, no second glow.
**Free** the figure (script-supplied), support copy. **Density** sparse.

### 3 · Drift Quote  (quote · move: teal pocket · left-drift)
**Ground** abyss; one translucent `{colors.teal}` pocket (soft-edged, 50% alpha)
floats left-of-center. **Composes** body-light, caption, bubble-column, jellyfish.
**Focal** a 2–3 line pull quote in foam Inter-300 inside the pocket; attribution
caption below; a bubble-column rises beside the pocket; a jellyfish may drift far
right. **Fixed** translucent pocket, Inter-300 voice. **Free** quote, creature.
**Density** sparse.

### 4 · Depth Timeline  (process · move: the gauge is the layout · right rail)
**Ground** abyss. **Composes** depth-gauge, card-title, body, sonar-ring.
**Focal** the depth-gauge rail with 3–5 ticks; each step is a `card-title` +
one-line body floating off its tick; the marker sinks to the active step and a
ring pings it. **Fixed** meters as ordinals, marker glow, one active tick.
**Free** step count, copy. **Density** standard.

### 5 · Specimen Catalog  (catalog · move: three lights — the dense frame · centered head)
**Ground** abyss. **Composes** section-headline, 3× teal pocket, card-title, body,
plankton-drift. **Focal** a centered `section-headline` over three translucent
pockets, each holding one glowing glyph (its light), a `card-title`, and a short
body. **Fixed** pockets translucent, one glow per pocket, glyphs cyan (one may be
magenta). **Free** the three items. **Density** dense-exception (~45% water still).

### 6 · Surface Closing  (closer · move: rising light · centered)
**Ground** abyss with a stronger top falloff — the surface, finally, far above.
**Composes** section-headline, echo-text, bubble-column ×2, caption. **Focal** a
1–2 line sign-off, centered, emphasis word echoed; bubbles rise past it toward the
light. **Fixed** centered, brighter top gradient, rising bubbles. **Free**
sign-off copy. **Density** sparse.

## Composition rules

### Do
- Ground every frame in `{colors.abyss}`; let **every visible element emit** — halo on anything saturated, radial fade on every glow.
- Keep **content floating** — water visible on all sides of every element; drift the type block **right-of-center** (vary the drift, never anchor).
- Keep **cyan above magenta** in total luminance — magenta lives in echoes, bells, and at most one small accent.
- Keep the ambient layer **alive in every frame** — at minimum caustic-web + plankton-drift; the water never freezes.
- Use **radial gradients freely** for halos and pockets; blur what is far away.
- Set exactly **one echo-text** and at most **one sonar-ring source** and **one jellyfish** per frame.

### Don't
- Don't anchor, flush-align, or edge-bleed content — nothing touches a frame edge except ambient water life.
- Don't draw a hard edge: no opaque panels, no borders, no sharp-cornered rectangles, no flat saturated fills.
- Don't let magenta lead — never a magenta headline, never more magenta area than cyan.
- Don't force Comfortaa uppercase or track it wide; don't swap Inter for another body face.
- Don't light two rival focal glows, ping two sources, or school the jellyfish.
- Don't brighten the water — the background stays within a whisper of black; saturation belongs to luminous elements only.

## Motion

Motion is not decoration here — **motion is the water,** and it is specified.
Four grammars, in priority order:

**1 · Ripple-in (headline entrance).** Words arrive as if refracted through the
water column above: each word begins **vertically stretched (scaleY ≈ 2.2–2.6),
skewed (skewX ≈ 12–16°), blurred (10–16px), and dim,** then wobbles **elastically
into focus** — scale, skew, and blur all resolving on an elastic ease
(`elastic.out(1, 0.4–0.5)`, ~1.4–1.8s), words staggered ~0.12–0.16s so the line
un-refracts left to right. After arrival, headlines keep a barely-visible drift
(±0.2cqw sine, 5–8s) — nothing at depth is perfectly still. The same grammar at
lower amplitude serves stats and card titles; body copy simply de-blurs and rises.

**2 · Submerge (scene transition).** Scenes do not cut — they **sink.** A tide
with a **curved wave crest** rises from the bottom of the frame and rolls up over
everything (a deep-teal, semi-luminous mass, crest edge softly glowing cyan),
carrying the old scene down beneath it; as the crest clears the top, the next
scene is revealed already in the water, its headline beginning to ripple-in.
Crest travel ~1.8–2.4s, ease in-out; the crest line must be curved and soft —
never a straight wipe.

**3 · Living water (ambient, always on).** The caustic-web undulates continuously
— overlapping sine filaments on unsynced 7–14s periods. Plankton motes drift on
individual slow vectors and **pulse** on 2–5s heartbeats. Bubbles rise with sine
sway and pop near the top. The jellyfish **pulses its bell** (~2.6s cycle,
origin bottom-center) and each pulse propels a slow upward drift, tentacles
lagging behind with a skew wave. All ambient loops are unsynced — synchronized
water reads as machinery.

**4 · Sonar echo (emphasis).** The emphasis word lands as echo-text: the cyan
body arrives with the ripple grammar, then its **magenta ghost and cyan ghost
split outward** to their offsets (~0.3cqw opposite directions) and keep swimming
on a slow sine (±0.15cqw), while a **sonar-ring ping** expands from the word —
2–3 concentric strokes growing 3–5× and fading over 2–3s, repeating every 4–6s
while the word holds the frame.

**Timing feel:** everything at this depth is slow. Nothing linear, nothing
snappier than 0.4s except the initial elastic overshoot; exits are sinks (down +
fade + blur), never pops.

## Aspect-Ratio Behavior

| Treatment | 16:9 | 9:16 | 1:1 |
|---|---|---|---|
| Abyss Cover | title right-of-center | title upper-center, jelly below | title centered-high |
| Sonar Stat | numeral center, rings wide | numeral upper third | centered |
| Drift Quote | pocket left, jelly right | pocket center, jelly above | pocket center |
| Depth Timeline | rail right, steps left | rail center-right, steps left | rail right, 3 ticks |
| Specimen Catalog | head over 3-up | head top, pockets stacked | head top, 2+1 |
| Surface Closing | centered | centered, taller bubble run | centered |

The `6cqw` safe area holds on the short edge; caustics stay in the top third of
whatever the frame is; re-step display sizes per ratio so no load-bearing line
drops below the 1.4cqw floor. Portrait gives the bubble-column and depth-gauge
more room — use it.

## Approved Entities

No real customers, logos, or vendors are defined. Sea life is generic — one
jellyfish archetype, unspecified plankton. No real species names or marine-science
claims unless the script supplies them.

## Numerals & Claims (hard rule)

Never invent figures, stats, dates, or counts at frame scale. Render slots as
`— figure —`, `{metric}`, `N×`. Depth-gauge tick ordinals (−1000 M, −2000 M…) are
decorative chrome and may be invented; any depth presented as fact must come from
the script.

## Pre-Render Self-Audit

- **Squint** — one dominant glow per frame at 3–5× its nearest rival.
- **Silence** — 55–70% open water (catalog ~45%).
- **Light** — every saturated element has a halo; zero hard edges; background within a whisper of black; cyan luminance > magenta luminance.
- **Float** — nothing flush to an edge; the type block drifts off-center; water on all sides.
- **Life** — caustics + plankton present and moving in every frame; ambient loops unsynced.
- **Type** — Comfortaa display never uppercase-forced; Inter labels uppercase cyan; ≥1.4cqw floor; one echo-text.
- **Motion** — headlines rippled in; transitions submerged; exits sink; nothing linear.
- **Fabrication** — every numeral traces to the script, else placeholder (gauge ordinals exempt).

## Known Gaps

- **Comfortaa + Inter via Google Fonts.** Comfortaa has no true italic and only weights 300–700; CJK pairing is not yet chosen for this pack.
- **The caustic-web and jellyfish are code-drawn** (SVG/canvas) — no external imagery or video is required; a renderer must implement the ambient loops or the pack fails its own craft bar.
- **9:16 / 1:1 are guidance**, not pixel-locked; verify the legibility floor and the glow falloff per ratio (halos clip differently in portrait).
- **Blur is the pack's cost center** — heavy filter use on large areas can hurt render throughput; prefer pre-blurred radial gradients for static halos and reserve live `filter: blur()` for entrances.
