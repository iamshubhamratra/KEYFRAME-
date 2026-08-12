---
version: alpha
name: Cadence Premium SaaS — Frame
description: >
  A calm, premium SaaS film authored for 9:16. Warm cream paper, terracotta and sage,
  heavy rounded display type over soft product cards that rise and settle rather than
  slam. Sixteen authored surfaces — search, setup, board, thread, digest, metrics,
  pricing — each a real interface moment rather than a text slide.
unit: the frame — 1080×1920 primary (portrait-native)
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  This pack routes to the OMELETTE ADAPTER
  (server/src/services/omelette_adapter.js, pack.json "renderer": "omelette",
  "template": "Cadence") — it renders the ORIGINAL bundled Cadence template rather
  than a re-implementation of it. The adapter swaps window.OM_SCENES for the user's
  scenes, hides the engine's playback chrome, and drives the film through its own
  frame-exact seek contract (data-om-seek-to-time-frame with sync:true, applied via
  ReactDOM.flushSync).
---

# Cadence Premium SaaS

Portrait-native (9:16). Source bundle: `server/public/omelette-templates/Cadence.html`.

## Authored scene vocabulary

Sixteen distinct shapes across 22 authored beats (67.8s as shipped). The adapter
casts each storyboard beat onto the shape it can actually *fill*, exhausting every
distinct shape before any repeats — the film is always exactly as long as the script.

| Shape | What it draws | Needs |
|---|---|---|
| **Hero** | Brand lockup, eyebrow, keyword, URL | opener — cast first, always |
| **Statement** | Slam type, `words` broken into short lines | a headline |
| **Search** | A search field + a rack of results | ≥2 bullets |
| **Onboard** | A setup card: kicker, title, numbered steps, CTA | ≥2 bullets |
| **Connect** | A grid of integration tiles | ≥2 bullets |
| **Board** | A three-column kanban with a card in motion | ≥2 bullets |
| **Morph** | A status word cycling through states | ≥2 bullets |
| **Metric** | One huge number + a sparkline | **a true stat** |
| **Live** | Labelled meters filling in real time | a headline |
| **Notify** | A stack of notification rows | ≥2 bullets |
| **Thread** | A chat thread, bubbles alternating sides | ≥2 bullets |
| **Digest** | A weekly-summary card with rows | ≥2 bullets |
| **Voice** | A pull quote + attribution | a quote or subtext |
| **Showcase** | Screenshot surfaces with captions | a screenshot |
| **Plans** | A pricing rack | **a genuine pricing scene** |
| **Proof** | Three counted stats | **true stats** |
| **Close** | Headline, body, CTA, URL | closer — cast last, always |

**Metric**, **Proof** and **Plans** are gated: a scene with no real number never
gets cast onto a shape whose whole job is to show one, so the film never displays a
fabricated figure or the demo brand's.

## Palette

Ground `#F5EAD8` (warm cream paper), ink `#201E1D`. `#C67139` terracotta carries the
film; `#7A8A5E` sage is the second accent. Cards sit on `#F9F4ED`.

## Type

Display **Caprasimo** (heavy rounded slab), body **Figtree** — both bundled inside the
template, so no `pack_fonts.js` entry is required on the omelette path.

## Media

`assets.prefer` puts screenshots first, so real captures (`topic_shots.js` / website
ingest) land in the template's device surfaces ahead of stock photography. Scene-pinned
assets win; the pool fills the rest; an exhausted pool recycles a real screenshot rather
than shipping a placeholder plate.

## Motion

Every authored beat uses `cardRise3D` in, `floatingIdle` while held, `depthWipe` out,
with slow push/tilt/pan/orbit cameras. Nothing slams. This is the pack's whole point —
pick a loud pack (`hype-wave`, `poster-pop`, `voltage`) when the film needs to shout.

## No playback chrome

The renderer captures the PAGE, not `#root`, so the engine's playback bar and its time
readout would otherwise be baked into the MP4. `hideChrome()` in the adapter walks from
`#root` up to `<body>` hiding every off-path sibling subtree and pins `#root` to (0,0).
Verified on this pack by frame inspection — see the adapter's header note.
