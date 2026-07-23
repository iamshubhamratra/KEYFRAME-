---
version: alpha
name: Orrery Brass — Frame (video / frame layer)
description: >
  An antique clockwork orrery brought to life — a cabinet-of-curiosities astronomy
  instrument rendered as a motion system. Engraved brass rings, planets on ticking
  gear-driven orbits, aged parchment charts on near-black bronze. The atoms are sacred:
  night bronze ground, brass linework, patina verdigris, parchment ink, one oxblood wax
  seal; Cormorant Garamond 600 display over Inter body; hairline engraving everywhere.
  Motion is escapement-driven — pendulum entrances, stepped clock wipes, a living
  orrery ambient. No neon, no glass blur, no thick bars: 18th-century instrument-maker
  craft, not a HUD.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script

colors:
  bronze: "#191410"          # night bronze ground — the cabinet interior
  brass: "#C9973F"           # engraved brass — primary emphasis, rings, hands
  verdigris: "#4E9C82"       # patina — secondary emphasis, secondary orbits
  parchment: "#EFE3C8"       # parchment ink — all reading text on bronze
  oxblood: "#93402C"         # wax seal — at most ONE strike per frame
  brass-dim: "rgba(201,151,63,0.45)"      # engraved brass hairlines
  brass-faint: "rgba(201,151,63,0.22)"    # background graduation scales
  parchment-dim: "rgba(239,227,200,0.6)"  # secondary body / captions
  verdigris-dim: "rgba(78,156,130,0.4)"   # patina hairlines

typography:
  # — reading ramp (Inter) —
  body:          { fontFamily: "Inter", cqw: 1.0,  weight: 400, lineHeight: 1.7, color: "{colors.parchment-dim}" }
  body-strong:   { fontFamily: "Inter", cqw: 1.1,  weight: 500, lineHeight: 1.6, color: "{colors.parchment}" }
  plate-label:   { fontFamily: "Inter", px: 12, weight: 500, tracking: "5px", upper: true, color: "{colors.brass}", note: "engraved plaque voice — kickers, cartouche text" }
  scale-figure:  { fontFamily: "Inter", px: 11, weight: 400, tracking: "3px", upper: true, color: "{colors.brass-dim}", note: "graduation numerals on arcs and dials" }
  attribution:   { fontFamily: "Inter", px: 13, weight: 500, tracking: "3px", upper: true, color: "{colors.verdigris}" }
  # — display ramp (Cormorant Garamond 600) —
  card-title:    { fontFamily: "Cormorant Garamond", cqw: 2.0, weight: 600, lineHeight: 1.15 }
  dial-value:    { fontFamily: "Cormorant Garamond", cqw: 2.8, weight: 600, lineHeight: 1.0, note: "stat inside a ring or cartouche" }
  section-headline: { fontFamily: "Cormorant Garamond", cqw: 4.4, weight: 600, lineHeight: 1.08 }
  hero-title:    { fontFamily: "Cormorant Garamond", cqw: 6.6, weight: 600, lineHeight: 1.02, note: "italic permitted on ONE word" }
  jumbo-numeral: { fontFamily: "Cormorant Garamond", cqw: 9.0, weight: 600, lineHeight: 1.0 }
  # — decorative —
  chart-numeral: { fontFamily: "Cormorant Garamond", cqw: 12.0, weight: 500, color: "rgba(201,151,63,0.10)", note: "wallpaper numeral / zodiac glyph behind a composition" }

spacing:
  pad-x: "5cqw"
  pad-y: "4.5cqw"
  gap-grid: "2cqw"
  card-pad: "2.2cqw"
  ring-gap: "0.9cqw"    # spacing between concentric rules

components:
  orbit-ring:
    shape: "SVG ellipse outline, 1–1.5px {colors.brass} stroke, rotated −3° to −7°"
    placement: "circling the ONE emphasis word of a headline, overshooting the word box ~12% each side"
    motion: "draws on clockwise (dashoffset) after the word settles; may slowly precess ±2°"
    description: "The astronomer-circling-a-discovery mark. One per frame, brass only."
  orrery-field:
    shape: "3–4 concentric elliptical orbit rings (hairline {colors.brass-dim} / {colors.brass-faint}), shared center, squashed ~0.86 and tilted, tick graduations on at least one ring"
    contents: "small planet discs (0.4–0.9cqw) riding the rings at different periods; a warm brass sun-pivot at center"
    placement: "ambient background layer, center or offset behind content; never occludes reading text above 10% opacity linework"
    description: "The living instrument — the pack's ambient signature."
  escapement-tick:
    shape: "graduation scale — 1px ticks every 6°, longer tick every 30° — along an arc or rule"
    color: "{colors.brass-dim}, figures in {typography.scale-figure}"
    description: "Instrument graduations used as decoration on arcs, dividers, and frame edges."
  brass-hand:
    shape: "a slender clock hand (long taper + counterweight circle) pivoted at a ring center, {colors.brass}"
    motion: "advances in discrete stepped TICKS (escapement), never smooth sweep"
    description: "Points at the active item in lists/dials; drives the clock-wipe transition."
  cartouche:
    shape: "thin double-rule label frame — outer 1px + inner 1px rule at 3px inset, 45° angled corners; {colors.brass-dim} rules on {colors.bronze}"
    typography: "{typography.plate-label}"
    description: "The engraved plaque for kickers, captions, and attributions. Never filled, never thick."
  moon-phase-dots:
    shape: "row of 5–8 circles (0.7cqw), 1px {colors.brass-dim} stroke; filled state = {colors.brass} disc; half state = half-disc"
    motion: "phases wax left→right as the scene progresses"
    description: "Progress indicator — waxing/waning moons instead of progress bars."
  engraved-flourish:
    shape: "fine corner filigree — 1px scrollwork curls + a terminal dot, ≤6cqw span"
    color: "{colors.brass-dim}"
    placement: "two opposing corners of a frame or plate, never all four"
    description: "The instrument-maker's signature flourish."
---

# Orrery Brass — Frame (video / frame layer)

## Overview

Orrery Brass at frame scale is an **antique astronomy instrument in motion** — a candlelit
cabinet piece, not a screen. The ground is always **night bronze** (`{colors.bronze}`); on it,
**hairline engraved brass linework** carries every structure: orbit rings, graduation scales,
cartouche plaques, corner filigree. **Brass** (`{colors.brass}`) is the primary voice,
**verdigris** (`{colors.verdigris}`) the patinated second voice, **parchment**
(`{colors.parchment}`) the reading ink, and **oxblood** (`{colors.oxblood}`) strikes at most
once per frame, like a wax seal pressed on a chart.

The type is a two-face hierarchy: **Cormorant Garamond 600** — a fine-serif engraver's display —
carries every headline, numeral, and dial value; **Inter** carries body copy and the tracked,
uppercase **plate-label** voice of engraved plaques. Cormorant declares; Inter annotates like the
fine print on a chart margin.

**Key characteristics at frame scale:**
- **One surface** — `{colors.bronze}` everywhere; regions are separated by hairline rules and arcs, never by color planes.
- **Hairline law** — every stroke is **1–2px**. There are no thick bars, no filled bands, no solid panels.
- **The living orrery** — concentric elliptical orbits with planets at different periods and a warm sun-pivot, breathing behind content.
- **Brass → verdigris → oxblood** — primary emphasis, secondary emphasis, one seal. Never reversed.
- **Candlelit warmth** — a soft warm radial falloff around the composition center is the only "light"; **no neon, no glow bloom, no glass blur.**
- **Emphasis = orbit-ring** — the key word of a headline is circled by a slightly rotated hand-engraved ellipse.

### Frame Craft Bar
- **Squint** — one focal element dominates at 3–6× its neighbor: the `hero-title`, a `jumbo-numeral` inside a ring, or the orrery itself on an ambient plate.
- **Silence** — frames read **45–60% empty bronze**; the darkness IS the cabinet. Underfilled frames get a `chart-numeral` or larger orrery, never more copy.
- **Restraint** — one orbit-ring, one oxblood strike, one italic word, per frame, maximum.
- **Reference** — aim at an **18th-century celestial atlas plate / a Wright orrery under lamplight**; failure looks like a sci-fi HUD or a steampunk poster with fat gears.

## The Frame

- **Primary:** 1920×1080 (16:9). Display sizes authored in **`cqw`** (`px ÷ 1920 × 100 = cqw`).
- **Vertical:** 1080×1920 (9:16). **Square:** 1080×1080 (1:1).
- **Safe area:** `5cqw` padding; orbit rings and graduation scales may bleed off-frame — text never does.

**The container law (load-bearing).** Every frame ground sets `container-type: size`; ALL
frame-relative units are `cqw`/`cqh` — **never `vw`.**

## Colors

`{colors.bronze}` is the only ground. `{colors.brass}` owns primary emphasis: the orbit-ring,
the sun-pivot, the brass-hand, plate labels, and the emphasized headline word. `{colors.verdigris}`
owns secondary structure: secondary orbits, attributions, second-voice stats. `{colors.parchment}`
owns every reading line — headlines and body are parchment on bronze, with the emphasis word
alone in brass. `{colors.oxblood}` appears **at most once per frame** — a seal dot, a single
underline, one filled moon — and may be absent entirely. No gradients between hues; the only
gradient permitted is the warm radial candlelight falloff of the ground and the sun-pivot's
soft core.

## Typography

Two ramps. The **reading ramp** (Inter body 1.0cqw, `plate-label` and `scale-figure` in tracked
uppercase px) carries copy and engraved annotations; the **display ramp** (Cormorant Garamond 600,
`card-title` 2.0cqw → `jumbo-numeral` 9.0cqw, decorative `chart-numeral` 12cqw) carries every
headline, stat, and dial value.

- **Legibility floor:** any load-bearing line ≥ **1.4cqw**; px labels are chrome only.
- **Fit-to-measure:** headline block ≤ **72cqw**; ≤4 words → `hero-title`; 5–7 → `section-headline`; 8+ → `card-title` stacked.
- **Case law:** Cormorant is sentence case or small-caps-styled title case — **never all-caps tracked**. Inter labels are always uppercase, 3–5px tracked. Italic Cormorant is reserved for **one** word per frame (usually the orbit-ringed word).

## Depth & Surface

Flat engraving on dark metal. Depth signals only:
- **Hairline rules and arcs** (1–2px) — the entire structural vocabulary.
- **Candlelight falloff** — one soft warm radial gradient centered near the focal point (≤ 8% brass at core).
- **Layered linework opacity** — foreground rings at 40–50% brass, background graduations at 15–25%.
- **Wallpaper `chart-numeral`** at ~10% brass behind a composition.

**Ceiling:** no box-shadow, no blur, no glass, no filled panels, no stroke above 2px, no bloom.

## Shapes

- **Ellipses and arcs** are the native shapes — orbits, ring frames, dial faces.
- **Rectangles** exist only as cartouches (double hairline, 45° angled corners) — never filled.
- **Circles**: planets, sun-pivot, moon-phase-dots, hand counterweights.
- **0 border-radius** on text blocks; the geometry lives in the SVG linework, not the CSS boxes.

## Components

- **orrery-field** — the ambient signature; 3–4 elliptical orbits, ticking planets, warm sun-pivot.
- **orbit-ring** — the emphasis ellipse around the discovery word; brass, tilted, drawn on.
- **brass-hand** — stepped ticking pointer; drives dials, lists, and the clock-wipe.
- **escapement-tick** — graduation scales on arcs, rules, and frame edges.
- **cartouche** — double-rule angled-corner plaque for kickers/captions/attributions.
- **moon-phase-dots** — waxing/waning progress row.
- **engraved-flourish** — corner filigree on two opposing corners.

## Frame Treatments

> Recipe per plate: ground · composes · focal · chrome · accent · silence · density.
> Symmetric, instrument-like: content centered on an implied vertical axis unless a dial demands offset.

### 1 · Atlas Cover  (identity · centered axis)
**Ground** bronze + candlelight falloff at center; full `orrery-field` behind. **Composes**
cartouche kicker, hero-title, orbit-ring, engraved-flourish. **Focal** a 2-line `hero-title` in
parchment, one word italic brass circled by the `orbit-ring`. **Chrome** cartouche above, two
corner flourishes, `moon-phase-dots` below. **Accent** brass ring + sun; optional oxblood seal
dot after the title. **Silence** ~50%. **Density** sparse.

### 2 · Dial Stat  (anchor · a figure on an instrument)
**Ground** bronze; a single large graduated ring (escapement-ticks every 6°) centered or
right-of-axis. **Focal** a `jumbo-numeral` (or `dial-value`) in parchment inside the ring, the
`brass-hand` ticking to point at its graduation. **Chrome** `plate-label` eyebrow in a cartouche;
`scale-figure` numerals on the ring. **Accent** brass hand + ring; verdigris for a secondary
figure. **Silence** ~55%. **Density** sparse.

### 3 · Ephemeris List  (catalog · the dense exception)
**Ground** bronze, `pad-x`. **Focal** a centered `section-headline` over 3–4 rows, each a
hairline-ruled line: `card-title` left, dotted leader (escapement-tick rule), `dial-value`
right. **Chrome** the `brass-hand` at the left margin ticks down row to row; row planets
(0.5cqw discs) mark each entry. **Accent** active row's title in brass, others parchment.
**Density** the one dense plate.

### 4 · Chart Quote  (quote · parchment voice)
**Ground** bronze; a large `chart-numeral` or zodiac glyph at 10% behind. **Focal** a 2–3 line
quote in Cormorant 500 italic parchment, centered. **Chrome** a cartouche attribution below in
verdigris; flourishes on two corners. **Accent** one brass word may take the orbit-ring.
**Silence** ~60%. **Density** sparse.

### 5 · Conjunction Split  (comparison · two orbits)
**Ground** bronze; two overlapping orbit ellipses whose intersection centers the frame.
**Focal** two `card-title` + `dial-value` pairs at the two ring centers — brass left,
verdigris right; the shared term sits at the intersection in parchment. **Chrome** graduations
on both rings. **Silence** ~50%. **Density** standard.

### 6 · Closing Plate  (closer · the seal)
**Ground** bronze + falloff; orrery-field slowed and dimmed. **Focal** a 1–2 line sign-off
`section-headline` centered; beneath it the **one oxblood strike** — a wax-seal disc (2cqw,
the only filled shape above hairline weight, sanctioned here only) or an oxblood filled moon
completing the `moon-phase-dots` row. **Chrome** cartouche with URL/date. **Silence** ~60%.

## Composition Rules

### Do
- Center content on an **implied vertical axis**; let symmetry read as instrument precision.
- Keep **every stroke 1–2px** — rings, rules, cartouches, flourishes, hands.
- Use **brass for primary, verdigris for secondary, oxblood at most once** like a wax seal.
- Decorate with **graduation scales and tick marks** — on arcs, dividers, frame edges.
- Circle exactly **one word** per headline with the orbit-ring; italicize that word only.
- Let orbit rings and scales **bleed off-frame**; keep all text inside the 5cqw safe area.
- Fill silence with **linework** (larger orrery, chart-numeral) — never with more copy.

### Don't
- Don't draw a thick bar, filled band, solid panel, or any stroke above 2px.
- Don't use neon hues, glow bloom, glass blur, or cool blue-white light — warmth only.
- Don't set Cormorant in tracked all-caps, and don't let Inter carry a headline.
- Don't fire oxblood twice, ring two words, or italicize more than one word per frame.
- Don't make the orrery a literal steampunk gear pile — orbits and hands, not cogwheels.
- Don't put text over linework denser than ~25% opacity without clearing a quiet zone.

## Motion

Motion in Orrery Brass is **escapement-driven** — everything moves like a mechanism under
tension, released in measured beats. Four moves define the grammar; the renderer implements
them, this section is their contract.

**Pendulum entrance (headlines).** Headline words swing in like pendulum bobs: each word
rotates in from above — `transform-origin` set **high above the word (≈ 50% −150%)** — from
roughly ±18–26° to 0° with an **elastic settle** (`elastic.out(1, 0.4)` character), staggered
~0.12s word to word, alternating swing direction. The word hangs from an invisible pivot and
comes to rest like a released escapement. Body copy and labels do NOT pendulum — they fade/rise
2cqw quietly after the headline settles.

**Clock wipe (scene transitions).** Scenes are swept away conically by a rotating brass hand.
A hairline `brass-hand` pivoted at frame center (or the outgoing focal center) sweeps 360°
while a conic mask follows it, revealing the next scene in its wake. Critically, the sweep is
**stepped, not smooth** — `steps(24–48)` easing, like an escapement releasing tooth by tooth —
with a soft tick feel at each step. Duration ~0.9–1.2s. No crossfade-only cuts between major
scenes; minor beats inside a scene may simply fade.

**Orrery ambient (background).** The `orrery-field` is alive for the whole frame: planets
travel their elliptical rings at different periods (e.g. 9s / 14s / 21s / 34s — non-harmonic so
the pattern never visibly repeats), rotating linearly (`ease: none`); the sun-pivot breathes a
slow ±4% warm pulse over ~7s; one graduated ring may precess ±2° over ~20s. All ambient loops
are slow, linear or sine — the instrument runs; it never dances.

**Orbit-ring emphasis.** After its word settles from the pendulum, the emphasis ellipse
**draws on clockwise** (stroke-dashoffset) over ~0.6s starting from the upper-left of the
ellipse, slightly rotated (−3° to −7°), overshooting the word box like a hand-circled note on
a chart. Once drawn it may precess almost imperceptibly (±1.5°, ~8s sine). The `brass-hand`
on dials advances in discrete ticks (steps easing) — never a smooth sweep. `moon-phase-dots`
wax one phase per scene beat. `engraved-flourish` corners draw on as strokes, then hold.

**Timing temperament.** Entrances land on a slow, confident beat (0.5–0.9s per element);
ambients are 7s+; nothing snaps faster than 0.3s except the escapement tick itself. Easing
vocabulary: `elastic.out` (pendulums), `steps(n)` (hands, wipes), `power2.inOut` (draws),
`sine.inOut` (ambient) — no `bounce`, no `back.out` overshoot pops.

## Aspect-Ratio Behavior

| Treatment | 16:9 | 9:16 | 1:1 |
|---|---|---|---|
| Atlas Cover | orrery centered, title over | orrery upper, title lower third | orrery behind, centered |
| Dial Stat | ring right of axis | ring above figure, stacked | centered ring |
| Ephemeris List | 3–4 wide rows | 4 narrow rows, leaders shortened | 3 rows |
| Chart Quote | centered, glyph behind | glyph upper, quote lower | centered |
| Conjunction Split | rings left/right | rings top/bottom | diagonal overlap |
| Closing Plate | centered + seal | centered, seal lower | centered |

Re-step display per ratio so no load-bearing line drops below the 1.4cqw floor; in 9:16 the
orrery-field squash relaxes toward circular so orbits fit the tall frame.

## Approved Entities

No real customers, logos, or vendors are defined. Zodiac/astronomical glyphs are decorative
ornament only — never used to imply astrological claims about the subject.

## Numerals & Claims (hard rule)

Never invent figures, stats, dates, or counts. Render slots as `— figure —`, `{metric}`, `N×`.
Real numerals appear only when the script supplies them. Graduation figures on scales
(0 · 30 · 60…) and plate ordinals (Plate I, II…) are decorative and may be ordinal.

## Pre-Render Self-Audit

- **Squint** — one focal element dominates 3–6×; the orrery never outshines the headline on a content plate.
- **Silence** — 45–60% empty bronze; only the Ephemeris List runs dense.
- **Hairline** — no stroke above 2px anywhere except the sanctioned closing wax seal.
- **Color** — brass primary, verdigris secondary, oxblood ≤1, parchment reading; no cool light, no neon.
- **Type** — Cormorant 600 display, one italic word max, no tracked-caps Cormorant; Inter labels uppercase 3–5px; ≥1.4cqw floor.
- **Motion** — pendulum origins above the word; clock wipes stepped; ambients non-harmonic and linear; no bounce.
- **Fabrication** — every numeral traces to the script, else placeholder.

## Known Gaps

- **Cormorant Garamond + Inter via Google Fonts.** Cormorant's 600 weight is required; 500 italic serves quotes. No CJK pairing defined yet — fall back to Noto Serif at matched weights.
- **The clock-wipe mask** requires a conic/stencil capability in the renderer; where unavailable, degrade to a stepped radial-reveal, never a plain crossfade.
- **9:16 / 1:1 are guidance**, not pixel-locked; verify the legibility floor and orbit squash per ratio.
- All linework (orbits, graduations, cartouches, flourishes) is SVG/CSS-only; no external imagery is required.
