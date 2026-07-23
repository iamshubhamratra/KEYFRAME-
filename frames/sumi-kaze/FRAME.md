---
version: alpha
name: Sumi Kaze — Frame (video / frame layer)
description: >
  墨風 — a sumi-e ink-wash scroll come alive. The unit is the frame (1920×1080), treated as a
  breathing sheet of washi paper. Atoms are sacred — the washi/mist paper ground, sumi ink as the
  only structural pigment, ONE vermillion accent plus the hanko seal, Zen Old Mincho display over
  Inter body, drifting translucent ink ridges, mist bands, falling petals. Composition follows
  calligraphy: enormous negative space (ma 間), asymmetric anchors, ink density as hierarchy.
  Motion IS the identity — brush-stroke reveals, ink-blot transitions, the seal's stamp-thud.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: the paper breathes · ink density is hierarchy · one vermillion, one seal, much silence
colors:
  washi: "#F5EFE3"
  mist: "#E8DFCC"
  sumi: "#201D18"
  vermillion: "#C93A2B"
  indigo: "#39587A"
  gold: "#B08D4A"
  stone: "#6B6459"
typography:
  # — reading ramp (Inter) —
  body:          { fontFamily: "Inter", cqw: 1.0,  weight: 400, lineHeight: 1.75, color: "rgba(32,29,24,0.82)" }
  subtext:       { fontFamily: "Inter", cqw: 1.25, weight: 400, lineHeight: 1.6, color: "rgba(32,29,24,0.60)", note: "60% ink — the support voice under a headline" }
  caption-label: { fontFamily: "Inter", px: 12, weight: 600, tracking: "4px", upper: true, color: "{colors.stone}" }
  attribution:   { fontFamily: "Inter", px: 13, weight: 500, tracking: "2px", color: "{colors.stone}" }
  # — display ramp (Zen Old Mincho — the brush voice) —
  scene-title:   { fontFamily: "Zen Old Mincho", cqw: 3.2, weight: 700, lineHeight: 1.15 }
  hero-title:    { fontFamily: "Zen Old Mincho", cqw: 5.8, weight: 900, lineHeight: 1.08 }
  stat-numeral:  { fontFamily: "Zen Old Mincho", cqw: 4.8, weight: 700, lineHeight: 1.0 }
  seal-glyph:    { fontFamily: "Zen Old Mincho", cqw: 1.6, weight: 700, color: "{colors.washi}", note: "vertical-rl inside the hanko-seal" }
  # — decorative —
  kanji-jumbo:   { fontFamily: "Zen Old Mincho", cqw: 14.0, weight: 900, color: "rgba(32,29,24,0.08)", note: "one wallpaper kanji, half off-frame, behind content" }
spacing:
  pad-x: "8cqw"        # calligraphy margin — wider than western packs on purpose
  pad-y: "7cqw"
  scroll-rule-x: "2.6cqw"   # x of the scroll-margin gold rule
  gap-stanza: "2.4cqw"
  measure-max: "46cqw" # no text block wider than this — ma is load-bearing
components:
  hanko-seal:
    backgroundColor: "{colors.vermillion}"
    innerRing: "0.1cqw solid rgba(245,239,227,0.85), inset 0.35cqw"
    rounded: "0.7cqw"
    typography: "{typography.seal-glyph} vertical-rl"
    rotation: "-4deg to -2deg"
    description: "The printmaker's signature stamp on the emphasis word — vermillion rounded square, paper-line inner ring, 1–2 kanji. Exactly one per frame; it STAMPS in (see Motion)."
  ink-ridge:
    fill: "{colors.sumi} / {colors.indigo} at 8–25% opacity"
    filter: "blur(1–3px) on the far layers"
    placement: "2–4 stacked SVG mountain silhouettes, lower third, bleeding past both edges"
    description: "Drifting sumi mountain ranges — the ambient landscape. Far ridges lighter and softer; near ridge darkest. They drift horizontally, never vertically."
  mist-band:
    background: "linear-gradient(90deg, transparent, rgba(232,223,204,0.9), transparent)"
    filter: "blur(6px)"
    size: "120% wide × 6–12cqh tall"
    description: "Horizontal fog strata laid across the ridges. Translucent, blurred, slow-drifting; they erase the ridge bases the way real mist does."
  petal:
    backgroundColor: "{colors.vermillion}"
    size: "0.6–0.9cqw"
    rounded: "80% 10% 90% 10%"
    opacity: 0.75
    description: "A falling vermillion petal — the frame's only moving pigment. 6–12 per frame, drifting down with sinusoidal sway and slow rotation."
  brush-rule:
    fill: "{colors.sumi}"
    shape: "tapered irregular filled path, ~14cqw × 0.4cqw, thick at heel, thin at tip"
    description: "A single dragged-brush horizontal stroke used as divider under headings — never a straight CSS border."
  scroll-margin:
    backgroundColor: "{colors.gold}"
    size: "0.1cqw wide, from 8cqh to 92cqh, at {spacing.scroll-rule-x}"
    ends: "fade to transparent; a small gold square node near the top"
    description: "The hanging-scroll rule — one thin vertical gold line near the left edge, present on every frame. It is chrome, not content."
  enso-circle:
    stroke: "{colors.sumi}, 0.35cqw, round cap, ~82% of the circumference drawn"
    size: "16–28cqw diameter"
    description: "One incomplete brush circle — the closing gesture. Reserved for CTA / sign-off frames; it draws itself on (see Motion) and may hold the CTA line at its center."
---

# Sumi Kaze — Frame (video / frame layer)

## Overview

Sumi Kaze at frame scale is a **hanging scroll that breathes**. The ground is always washi paper —
`{colors.washi}` warmed by soft `{colors.mist}` washes — and everything on it behaves like wet ink:
headlines are dragged on by a loaded brush, scenes wash over in an ink blot, mountains of
translucent sumi drift behind mist, and a single vermillion hanko seal stamps the frame like a
printmaker signing an edition.

The voice is a two-face hierarchy: **Zen Old Mincho** — a high-contrast old-style Japanese serif —
carries every headline, numeral, and seal glyph; **Inter** carries body, captions, and labels.
Mincho declares like calligraphy; Inter annotates like a curator's card. **Ink density IS the
hierarchy**: the headline sits at full sumi, the subtext at 60% ink, wallpaper kanji at 8%.

**Key characteristics at frame scale:**
- **One surface** — washi, always. No panels, no cards, no boxes; content floats on paper.
- **Ink as structure** — sumi at 100/60/25/8% opacity replaces color-coding and chrome.
- **One vermillion element per frame plus the seal** — a petal drift OR a red accent word OR a red brush tick; never two, and the hanko-seal rides on top of that budget.
- **Soft washes allowed, nothing hard** — radial indigo/sumi paper stains at ≤6% are welcome; hard neon, glassmorphism, drop shadows, and gradients-as-surfaces are forbidden.
- **Asymmetric calligraphic anchors** — type sits low-left or high-right; dead-center only inside the ensō.
- **Gold is chrome** — the scroll-margin rule and rare fine accents; never a text color for body.

### Frame Craft Bar
- **Squint** — one brush-struck headline dominates at 4–6× its neighbor; the seal reads second; everything else is atmosphere.
- **Silence** — every frame is **55–70% empty washi**. Ma (間) is the design. If a frame feels sparse, it is correct.
- **Restraint** — count the vermillion: one element + one seal, no more. Count the surfaces: one.
- **Reference** — aim at a **Hasegawa Tōhaku pine screen / Hokusai album page with a red seal**; failure looks like a zen-themed spa brochure or a hard-edged "japan aesthetic" poster.

## The Frame

- **Primary:** 1920×1080 (16:9). Display sizes authored in **`cqw`** (`px ÷ 1920 × 100 = cqw`).
- **Vertical:** 1080×1920 (9:16) — the natural hanging-scroll ratio; this pack is unusually strong there. **Square:** 1080×1080 (1:1).
- **Safe area:** `8cqw` horizontal margin; the scroll-margin rule sits at `2.6cqw`, outside content.

**The container law (load-bearing).** Every frame ground sets `container-type: size`; ALL
frame-relative units are `cqw`/`cqh` — **never `vw`.**

## Colors

`{colors.washi}` is the eternal ground; `{colors.mist}` tints its washes and the mist-bands.
`{colors.sumi}` is the only structural pigment — type, ridges, brush-rules, ensō, ink blots — used
at stepped opacities (100 / 60 / 25 / 8%). `{colors.indigo}` exists only inside translucent washes
(far ridges, paper stains) — never as a text color or a fill at full strength. `{colors.vermillion}`
is the sacred accent: the seal, the petals, or one emphasized stroke. `{colors.gold}` is the
scroll-margin and fine metallic ticks. `{colors.stone}` is meta text. Headlines are always sumi on
washi — never white, never colored, never on a dark ground (the only dark moment is the transient
ink-blot transition).

## Typography

Two ramps. The **reading ramp** (Inter body 1.0cqw, subtext 1.25cqw at 60% ink, tracked labels)
explains; the **display ramp** (Zen Old Mincho `scene-title` 3.2cqw → `hero-title` 5.8cqw, plus the
decorative `kanji-jumbo` 14cqw at 8%) declares.

- **Legibility floor:** any load-bearing line ≥ **1.4cqw**; px labels are chrome only.
- **Fit-to-measure:** no text block exceeds `{spacing.measure-max}` (46cqw). ≤4 words → `hero-title`; 5–8 → `scene-title`; longer lines are rewritten, not shrunk.
- **Ink density:** headline 100% sumi · subtext 60% · captions in `{colors.stone}` · wallpaper 8%. Emphasis is done with the hanko-seal or a vermillion word — never bold-on-bold, never underline.
- Mincho is set in sentence case (or kanji); Inter labels are uppercase, 2–4px tracked.

## Depth & Surface

Flat paper with atmospheric depth only:
- **Layered translucency** — ridges and mist at stacked opacities create distance; blur increases with distance.
- **Wallpaper kanji** — one 8% glyph, half off-frame, behind content.
- **No box-shadow, no elevation, no border-boxes, no glass.** The paper is the only surface; if a region needs separation, give it more emptiness, not a container.

## Shapes

Nothing is hard-edged except type. Ridges, blots, petals, and brush-rules are **irregular organic
paths** — drawn, not constructed. The hanko-seal's `0.7cqw` radius rounded square is the single
sanctioned geometric shape; the ensō is the single sanctioned circle, and it is never closed.

## Components

- **hanko-seal** — the emphasis stamp; exactly one, riding the key word, rotated −2° to −4°.
- **ink-ridge** + **mist-band** + **petal** — the ambient landscape triplet on the lower/upper thirds.
- **brush-rule** — the only divider; **scroll-margin** — the only chrome, on every frame.
- **enso-circle** — CTA/closing frames only; the CTA line may sit at its center (the one sanctioned centered composition).
- **kanji-jumbo** — optional wallpaper glyph, thematically chosen (風 wind, 山 mountain, 始 begin).

## Frame Treatments

> Recipe per plate: ground · composes · focal · accent · silence · anchor · density.

### 1 · Scroll Cover  (identity · anchor: low-left)
**Ground** washi with a faint high-right indigo wash; ridge stack + mist across the lower third;
petals drifting. **Composes** caption-label, hero-title, subtext, hanko-seal, scroll-margin.
**Focal** a 2-line `hero-title` brush-revealed low-left; the seal stamps beside the final word.
**Accent** petals + seal (the full vermillion budget). **Silence** ~60% — the whole upper-right is
sky. **Density** sparse.

### 2 · Stanza Statement  (feature · anchor: high-right)
**Ground** washi; `kanji-jumbo` at 8% bleeding off the left edge; one low far-ridge. **Composes**
kanji-jumbo, scene-title, subtext, brush-rule. **Focal** a `scene-title` high-right with a
brush-rule beneath and a 60%-ink support stanza. **Accent** ONE vermillion word or tick in the
title. **Silence** ~65%. **Density** sparse.

### 3 · Ink Figure  (stat · anchor: low-left, figure right)
**Ground** washi, mist band mid-frame. **Composes** caption-label, stat-numeral, subtext,
hanko-seal. **Focal** a `stat-numeral` (from the script — see Numerals) with its unit in
`caption-label`; the seal stamps the figure. **Accent** the seal only. **Silence** ~60%.
**Density** sparse.

### 4 · Haiku Quote  (quote · anchor: vertical-right optional)
**Ground** washi with the deepest ridge stack of the pack. **Composes** subtext-scale quote in
Mincho 400, attribution, brush-rule. **Focal** a 2–3 line quote set high-right — optionally
`writing-mode: vertical-rl` for a true scroll column. **Accent** none but the gold margin (a
seal-less frame keeps the budget for neighbors). **Silence** ~70% — the emptiest plate.
**Density** whisper.

### 5 · Ensō Close  (closer · anchor: centered — the exception)
**Ground** washi, ridges settled low, petals thinning. **Composes** enso-circle, scene-title or CTA
line, caption-label, hanko-seal. **Focal** the ensō draws itself around a short centered CTA; the
seal stamps low-right of the circle like a signature. **Accent** the seal. **Silence** ~65%.
**Density** sparse.

## Composition rules

### Do
- Keep **55–70% of every frame empty washi** — ma is the layout system.
- Anchor type **low-left or high-right**; alternate between consecutive frames; center only inside the ensō.
- Encode hierarchy as **ink density** (100/60/8%), never as boxes, chips, or color-coded text.
- Bleed ridges, mist, and the wallpaper kanji **past the frame edges**; the scroll continues beyond the viewport.
- Spend the vermillion budget deliberately — **one element + the seal** — and stamp the seal on the single word that matters most.
- Put the **scroll-margin** gold rule on every frame; put a **brush-rule**, not a border, under any heading that needs grounding.

### Don't
- Don't add a card, panel, pill, glass layer, drop shadow, or hard-edged colored region — content floats on paper.
- Don't use white text, neon, or any dark ground (the ink-blot transition is the only permitted dark instant).
- Don't close the ensō, straighten a brush-rule, or draw a ruler-perfect ridge — every stroke is irregular.
- Don't let two vermillion elements coexist, or let gold carry copy.
- Don't fill silence with extra content; underfilled frames get a wallpaper kanji or one more mist band at most.
- Don't set Mincho in all-caps tracking (it is not a western display face) or drop subtext below 60% ink.

## Motion

Motion is this pack's signature — the renderer implements the following grammar. Global feel:
**unhurried, wet, weighted.** Entrances 0.6–0.9s, ambient cycles 8–26s, nothing snaps except the
seal.

- **Brush-stroke reveal (headlines).** Each word swipes on **left→right** like a loaded brush
  dragging: `clip-path` inset opens from the left over ~0.7s (`power3.out`) while the word settles
  from `skewX(-10°)` and a small negative x back to rest. Words stagger ~0.2s; the whole line reads
  as consecutive strokes of one hand. Subtext follows as a plain 60%-ink fade-up — the brush is for
  display type only.
- **Ink-blot transition (scene cuts).** An irregular sumi blob (turbulence-roughened edge) blooms
  from a point over ~0.8s (`power2.in`) until it swallows the frame, holds a beat, then **washes
  away** — opacity dissolving with a slight over-scale, like ink thinning in water — revealing the
  next scene's blank washi an instant before its words are brushed on. The blot is the only moment
  the frame goes dark.
- **Hanko stamp (emphasis).** The seal arrives from above the paper: scale ~2× → 1 with a hard
  `power4.in`, landing with a **thud** — a 1-frame squash to 0.94 and back, settling at −2° to −4°
  rotation. Optionally a faint vermillion ring ripples out at 15% opacity, like excess ink pressed
  into the paper. The stamp lands AFTER its word finishes revealing — signature follows stroke.
- **Ambient landscape (always on).** Ink-ridges drift horizontally ±2–3cqw over 18–26s
  (`sine.inOut`, yoyo, layers desynchronized); mist-bands drift the opposite direction and breathe
  opacity 0.5→0.9 over 10–14s; petals fall continuously over 9–16s each with sinusoidal sway and
  slow rotation, respawning above the frame. Ambient motion never pauses and never syncs — the
  landscape ignores the edit.
- **Ensō draw-on (closing frames).** The circle draws via stroke-dashoffset over ~1.6s
  (`power2.inOut`), stopping at ~82% of the circumference — it must never close. The CTA fades up
  at its center only after the brush lifts.

## Aspect-Ratio Behavior

| Treatment | 16:9 | 9:16 | 1:1 |
|---|---|---|---|
| Scroll Cover | title low-left, sky upper-right | title upper third, ridges deep below — the true scroll | title low-left, tighter sky |
| Stanza Statement | high-right + left kanji | kanji behind, stanza mid-high | high-right |
| Ink Figure | figure left, mist mid | figure high, unit stacked | centered-left figure |
| Haiku Quote | high-right, optional vertical-rl | vertical-rl column right — the hero ratio | horizontal, high placement |
| Ensō Close | ensō centered | ensō upper-center, seal below | centered |

9:16 is this pack's ancestral format: deepen the ridge stack, lengthen the scroll-margin, and
prefer the vertical-rl quote column. Re-step display sizes per ratio; the 1.4cqw floor holds.

## Approved Entities

No real customers, brands, or artworks are referenced. Kanji used decoratively must be real,
correctly written characters relevant to the script's theme (風, 墨, 山, 道, 始) — never
pseudo-Japanese glyphs or random characters.

## Numerals & Claims (hard rule)

Never invent figures, stats, dates, or counts. Render slots as `— figure —`, `{metric}`, `N×`.
Real numerals appear only when the script supplies them. The seal's glyphs are decorative
identity, not data.

## Pre-Render Self-Audit

- **Silence** — 55–70% empty washi; the quote plate ~70%.
- **Vermillion count** — ≤1 element + ≤1 seal; zero is acceptable.
- **Surface** — one (washi); no boxes, shadows, or dark grounds outside the blot instant.
- **Ink density** — 100/60/8 steps present and honored; no white or colored headlines.
- **Anchor** — low-left / high-right alternation; centered only with an ensō.
- **Strokes** — brush-rules tapered, ridges irregular, ensō open; nothing ruler-drawn.
- **Fabrication** — every numeral traces to the script, else placeholder.

## Known Gaps

- **Zen Old Mincho + Inter via Google Fonts**; Zen Old Mincho ships full kana/kanji coverage —
  Latin runs slightly narrow, so re-check line fit when scripts mix languages.
- The ink-blot's roughened edge assumes an SVG turbulence/displacement filter; renderers without
  filter support may substitute a multi-lobed blob path.
- 9:16 / 1:1 are guidance, not pixel-locked; verify the legibility floor per ratio.
- All atmospherics (ridges, mist, petals, blots, ensō) are CSS/SVG-only; no external imagery.
