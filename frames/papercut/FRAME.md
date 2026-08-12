---
version: alpha
name: Papercut — Frame
description: >
  "PAPERCUT" vertical 9:16 editorial paper-zine typography film. Mature paste-up look: big flat Caprasimo ink type with ONE chip-mounted word per line (no per-letter confetti), split-flap boards, rubber stamps, torn strips, a scissors cut, taped photo/screenshot ASSET slots, fast marquee tickers. 13 scenes ≈ 45s, quick cuts. Organic DS tokens. Mounted after animations-v2.jsx + tweaks-panel.jsx. Portrait-native 9:16 (13 authored beats, 46.4s as shipped), rendered from its own bundle — only the words and pictures change.
unit: the frame — 1080×1920 primary (portrait-native)
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  This pack routes to the OMELETTE ADAPTER
  (server/src/services/omelette_adapter.js, pack.json "renderer": "omelette",
  "template": "Papercut") — it renders the ORIGINAL bundled Papercut
  template rather than a re-implementation of it. The adapter swaps
  window.OM_SCENES for the user's scenes and drives the film through its own
  frame-exact seek contract (data-om-seek-to-time-frame with sync:true, applied
  via ReactDOM.flushSync).
---

# Papercut

Portrait-native (9:16). Source bundle: `server/public/omelette-templates/Papercut.html`.

Imported from the "HTML Animated Template Project" handoff.
The engine's playback/timeline bar has been removed from the bundle, so the film
is full-bleed at 1080×1920 with no transport chrome and no 44px scale reserve.

## Palette

| Role | Value |
|---|---|
| ground | `#F5EAD8` |
| ink | `#201E1D` |
| accent | `#F9F4ED` |
| accent 2 | `#8C491A` |

## Typography

- **display**: Caprasimo
- body: Figtree

These are read out of the bundle's own `@font-face` set — the template ships its
own typography and the pack manifest does not skin it. `npm run fonts:sync`
re-reads the rendered display face and writes it back here.

## Authored scene vocabulary

13 authored beats (46.4s as shipped) across 13 distinct shapes.
Authored durations are **advisory** — the film is locked to the narration, so the
adapter casts each storyboard beat onto the shape it can actually fill.

| Shape | Notes |
|---|---|
| **Cover** | authored scene shape |
| **Departures** | authored scene shape |
| **TickerWall** | authored scene shape |
| **Manifesto** | authored scene shape |
| **Gallery** | authored scene shape |
| **Strips** | authored scene shape |
| **Scissors** | authored scene shape |
| **Headlines** | authored scene shape |
| **Counter** | authored scene shape |
| **Postcard** | authored scene shape |
| **Shot** | authored scene shape |
| **Specimen** | authored scene shape |
| **Close** | authored scene shape |

## Copy law

Every headline, sub, stat and caption comes from the user's script. The adapter
blanks any authored field it cannot map (a single space, never an empty string)
so the template's demo brand can never surface.
