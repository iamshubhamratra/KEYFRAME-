---
version: alpha
name: Momentum — Frame
description: >
  A bold dark launch film, engineered. A graphite-black ground carries heavy,
  flush-LEFT display type that slides in like a countdown, with one hot-orange
  accent igniting the single word that matters (BUILD **BOLD.** SHIP FASTER).
  Space-mono HUD chrome frames every shot — corner brackets, a running timecode,
  big ghosted /01 section numbers, a live audio waveform along the base and a
  faint dotted grid behind it all — so the film reads like mission control for a
  product launch. Left-aligned, asymmetric, confident; motion is decisive slides
  and pushes, never drift. For product launches, feature reveals, manifestos,
  hype reels and anything that ships with momentum.
unit: the frame — 1920×1080 primary; 9:16 and 1:1 documented
principle: atoms are sacred · composition is free · numbers come from the script
renderer: >
  This pack routes to the DEDICATED momentum composer
  (server/src/services/momentum_composer.js, pack.json "renderer": "momentum") —
  a faithful GSAP port of server/public/momentum-template/momentum-film.jsx.
  Every render reproduces the template's 8 authored scene types (Intro ring,
  Statement, Feature browser, Mobile phone, accent-flood Stats, Quote, Gallery,
  CTA), its whip/zoom camera and persistent HUD rail; only the CONTENT (script
  text, screenshots, photos, numbers, brand) is swapped per job. The theme
  blocks below still describe the pack for the UI and for scene-kit fallbacks
  (portraits before the composer had them, remix, QA styling).
colors:
  void: "#0C0B0A"
  ground: "#131210"
  panel: "#1A1815"
  ink: "#F2EDE4"
  muted: "#8A8681"
  orange: "#FF4B2B"
  amber: "#FF8A3D"
typography:
  body:        { fontFamily: "JetBrains Mono", cqw: 0.95, weight: 500, lineHeight: 1.55, color: "muted" }
  label:       { fontFamily: "JetBrains Mono", px: 13, weight: 700, tracking: "0.28em", upper: true, color: "orange" }
  display-xl:  { fontFamily: "Sora", cqw: 6.4, weight: 800, tracking: "-0.02em", upper: true, align: "left" }
  display-lg:  { fontFamily: "Sora", cqw: 4.2, weight: 800, tracking: "-0.02em", upper: true, align: "left" }
  bignum:      { fontFamily: "Sora", cqw: 12, weight: 800, color: "panel", tracking: "-0.03em" }
  stat-figure: { fontFamily: "Sora", cqw: 5.0, weight: 800, color: "ink" }
atoms:
  headline: >
    The signature. Heavy flush-LEFT Sora 800 in UPPERCASE, tracked TIGHT
    (-0.02em), stacked in short 1–4 word lines that hug the left edge with air on
    the right. Lines slide up into place one after another (a countdown feel).
    Exactly ONE word per headline is the accent word — set in hot orange (#FF4B2B)
    with a small solid orange square bullet to its left — never more than one.
  section-number: >
    A huge ghosted "/01" set in panel-grey (#1A1815, ~one shade above the ground)
    pinned to the upper-right, low-contrast so it sits behind the type as
    structure, not decoration. Increments per major beat.
  hud-frame: >
    Space-mono technical chrome that frames the whole shot: thin corner brackets
    at the four corners, a running SCN 0X / 08 timecode bottom-left, a mono kicker
    top-left (MANIFESTO / FEATURE // 01 / BY THE NUMBERS), a faint dotted grid
    behind everything, and a low live audio-waveform line skimming the base edge.
    Orange tick marks accent the rails. Understated — it never competes with type.
  chip: >
    A pill on panel-black with a 1px ink-alpha border, mono UPPERCASE
    letter-spaced text and a leading orange dot. Rows of 2–3 sit under the
    headline (REAL-TIME · AI-NATIVE · 1-CLICK DEPLOY).
  stat: >
    A big Sora 800 figure that counts up (240%, 12K, 99.9%) over a tiny mono
    label beneath it; three across, left-aligned, an orange underline rule tying
    the row together.
motion:
  entrances: Headlines SLIDE up line-by-line; chips and stats stagger in after. Decisive, snappy easing (power3.out) — momentum, not float.
  cuts: PUSH between scenes (the outgoing shot shoves off-frame as the next drives in). The HUD chrome persists across cuts so the frame feels continuous.
  ambient: The dotted grid drifts a hair; the waveform animates low; the section number cross-fades on beat change. Nothing bounces.
  discipline: One accent word, one section number, one waveform. Never blur-soup, never centered, never more than one hot-orange element competing at once.
purpose: Product launches, feature reveals, release ads, manifestos, hype reels, countdowns — anything that should feel engineered and ship with momentum.
---

# Momentum

**Momentum is the launch film, engineered.** Everything is flush-LEFT on a
graphite-black stage, heavy Sora display type slides in like a countdown, and one
hot-orange accent ignites the single word that carries the beat. Space-mono HUD
chrome — corner brackets, a running timecode, ghosted `/01` section numbers, a
dotted grid and a live waveform — wraps every shot so it reads like mission
control for a product release.

## The rules

1. **Left, always.** Headlines and content hug the left edge; the right stays
   open. Never center a headline.
2. **One accent word.** Exactly one word per headline is hot-orange `#FF4B2B`
   with a small solid orange square to its left. The rest is ink `#F2EDE4`.
3. **HUD, not decoration.** The mono chrome (brackets, timecode, section number,
   grid, waveform) is structure. It stays quiet and consistent shot to shot; it
   never competes with the type.
4. **Move with momentum.** Lines slide up (power3.out); scenes PUSH from one to
   the next. No drift, no bounce, no blur-soup.
5. **Numbers come from the script.** Stats, feature names and proof points are
   lifted from the brief — never invented.

## Palette

Graphite ground `#131210` (panel `#1A1815` for the ghosted section number),
ink `#F2EDE4`, muted mono `#8A8681`, and the single hot accent orange `#FF4B2B`
(with amber `#FF8A3D` for the occasional gradient tip). The film is ~95%
graphite and ink; the orange is the spark.

## Type

Sora 800 UPPERCASE for every headline and figure, tracked tight (-0.02em);
JetBrains Mono for all the HUD labels, kickers, chips and timecode. Nothing else.

## Purpose

Product launches, feature reveals, release ads, manifestos, hype reels and
countdowns — the film for anything that ships with momentum.
