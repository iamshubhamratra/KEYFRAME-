---
version: alpha
name: Rainy Window — Frame
description: >
  streaking droplets, bokeh lights beyond the glass Portrait-native 9:16 (18 authored beats, 49.9s as shipped), rendered from its own bundle — only the words and pictures change.
unit: the frame — 1080×1920 primary (portrait-native)
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  This pack routes to the OMELETTE ADAPTER
  (server/src/services/omelette_adapter.js, pack.json "renderer": "omelette",
  "template": "RainyWindow") — it renders the ORIGINAL bundled Rainy Window
  template rather than a re-implementation of it. The adapter swaps
  window.OM_SCENES for the user's scenes and drives the film through its own
  frame-exact seek contract (data-om-seek-to-time-frame with sync:true, applied
  via ReactDOM.flushSync).
---

# Rainy Window

Portrait-native (9:16). Source bundle: `server/public/omelette-templates/RainyWindow.html`.

Imported from the "Organic Garden video template" handoff.
The engine's playback/timeline bar has been removed from the bundle, so the film
is full-bleed at 1080×1920 with no transport chrome and no 44px scale reserve.

## Palette

| Role | Value |
|---|---|
| ground | `#2C3440` |
| ink | `#EEF1F2` |
| accent | `#F2B552` |
| accent 2 | `#7AC7E0` |

## Typography

- **display**: Merriweather
- body: Public Sans

These are read out of the bundle's own `@font-face` set — the template ships its
own typography and the pack manifest does not skin it. `npm run fonts:sync`
re-reads the rendered display face and writes it back here.

## Authored scene vocabulary

18 authored beats (49.9s as shipped) across 9 distinct shapes.
Authored durations are **advisory** — the film is locked to the narration, so the
adapter casts each storyboard beat onto the shape it can actually fill.

| Shape | Notes |
|---|---|
| **Hook** | authored scene shape |
| **Typing** | authored scene shape |
| **Statement** | authored scene shape |
| **Feature** | authored scene shape |
| **Scroll** | authored scene shape |
| **Stats** | authored scene shape |
| **Ring** | authored scene shape |
| **Notify** | authored scene shape |
| **CTA** | authored scene shape |

## Copy law

Every headline, sub, stat and caption comes from the user's script. The adapter
blanks any authored field it cannot map (a single space, never an empty string)
so the template's demo brand can never surface.
