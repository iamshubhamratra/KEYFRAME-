---
version: alpha
name: Moon Card — Frame
description: >
  moon phases, floating cards, candle flicker Portrait-native 9:16 (15 authored beats, 44.4s as shipped), rendered from its own bundle — only the words and pictures change.
unit: the frame — 1080×1920 primary (portrait-native)
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  This pack routes to the OMELETTE ADAPTER
  (server/src/services/omelette_adapter.js, pack.json "renderer": "omelette",
  "template": "MoonCard") — it renders the ORIGINAL bundled Moon Card
  template rather than a re-implementation of it. The adapter swaps
  window.OM_SCENES for the user's scenes and drives the film through its own
  frame-exact seek contract (data-om-seek-to-time-frame with sync:true, applied
  via ReactDOM.flushSync).
---

# Moon Card

Portrait-native (9:16). Source bundle: `server/public/omelette-templates/MoonCard.html`.

Imported from the "Organic Garden video template" handoff.
The engine's playback/timeline bar has been removed from the bundle, so the film
is full-bleed at 1080×1920 with no transport chrome and no 44px scale reserve.

## Palette

| Role | Value |
|---|---|
| ground | `#1D1430` |
| ink | `#F2EAD9` |
| accent | `#E8B4C8` |
| accent 2 | `#D4AF6A` |

## Typography

- **display**: Italiana
- body: Sen

These are read out of the bundle's own `@font-face` set — the template ships its
own typography and the pack manifest does not skin it. `npm run fonts:sync`
re-reads the rendered display face and writes it back here.

## Authored scene vocabulary

15 authored beats (44.4s as shipped) across 11 distinct shapes.
Authored durations are **advisory** — the film is locked to the narration, so the
adapter casts each storyboard beat onto the shape it can actually fill.

| Shape | Notes |
|---|---|
| **Hook** | authored scene shape |
| **Swipe** | authored scene shape |
| **Statement** | authored scene shape |
| **Ring** | authored scene shape |
| **Typing** | authored scene shape |
| **Feature** | authored scene shape |
| **Stats** | authored scene shape |
| **Montage** | authored scene shape |
| **Morph** | authored scene shape |
| **Notify** | authored scene shape |
| **CTA** | authored scene shape |

## Copy law

Every headline, sub, stat and caption comes from the user's script. The adapter
blanks any authored field it cannot map (a single space, never an empty string)
so the template's demo brand can never surface.
