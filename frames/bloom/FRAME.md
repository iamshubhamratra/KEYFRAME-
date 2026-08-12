---
version: alpha
name: Bloom — Frame
description: >
  "BLOOM" botanical-garden world. Growing vines, petals, greenhouse. Portrait-native 9:16 (9 authored beats, 27.8s as shipped), rendered from its own bundle — only the words and pictures change.
unit: the frame — 1080×1920 primary (portrait-native)
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  This pack routes to the OMELETTE ADAPTER
  (server/src/services/omelette_adapter.js, pack.json "renderer": "omelette",
  "template": "Bloom") — it renders the ORIGINAL bundled Bloom
  template rather than a re-implementation of it. The adapter swaps
  window.OM_SCENES for the user's scenes and drives the film through its own
  frame-exact seek contract (data-om-seek-to-time-frame with sync:true, applied
  via ReactDOM.flushSync).
---

# Bloom

Portrait-native (9:16). Source bundle: `server/public/omelette-templates/Bloom.html`.

Imported from the "HTML Animated Template Project" handoff.
The engine's playback/timeline bar has been removed from the bundle, so the film
is full-bleed at 1080×1920 with no transport chrome and no 44px scale reserve.

## Palette

| Role | Value |
|---|---|
| ground | `#FBF0E5` |
| ink | `#12372A` |
| accent | `#F2B24C` |
| accent 2 | `#F4A7B9` |

## Typography

- **display**: Cormorant Garamond
- body: Sen

These are read out of the bundle's own `@font-face` set — the template ships its
own typography and the pack manifest does not skin it. `npm run fonts:sync`
re-reads the rendered display face and writes it back here.

## Authored scene vocabulary

9 authored beats (27.8s as shipped) across 6 distinct shapes.
Authored durations are **advisory** — the film is locked to the narration, so the
adapter casts each storyboard beat onto the shape it can actually fill.

| Shape | Notes |
|---|---|
| **Seed** | authored scene shape |
| **Packets** | authored scene shape |
| **Greenhouse** | authored scene shape |
| **Nectar** | authored scene shape |
| **Pressed** | authored scene shape |
| **Bouquet** | authored scene shape |

## Copy law

Every headline, sub, stat and caption comes from the user's script. The adapter
blanks any authored field it cannot map (a single space, never an empty string)
so the template's demo brand can never surface.
