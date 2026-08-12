---
version: alpha
name: Ghost Route — Frame
description: >
  wisps, lantern swing, gravestones, fog Portrait-native 9:16 (14 authored beats, 41.6s as shipped), rendered from its own bundle — only the words and pictures change.
unit: the frame — 1080×1920 primary (portrait-native)
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  This pack routes to the OMELETTE ADAPTER
  (server/src/services/omelette_adapter.js, pack.json "renderer": "omelette",
  "template": "GhostRoute") — it renders the ORIGINAL bundled Ghost Route
  template rather than a re-implementation of it. The adapter swaps
  window.OM_SCENES for the user's scenes and drives the film through its own
  frame-exact seek contract (data-om-seek-to-time-frame with sync:true, applied
  via ReactDOM.flushSync).
---

# Ghost Route

Portrait-native (9:16). Source bundle: `server/public/omelette-templates/GhostRoute.html`.

Imported from the "Organic Garden video template" handoff.
The engine's playback/timeline bar has been removed from the bundle, so the film
is full-bleed at 1080×1920 with no transport chrome and no 44px scale reserve.

## Palette

| Role | Value |
|---|---|
| ground | `#1A2026` |
| ink | `#ECE8DC` |
| accent | `#9FE8C4` |
| accent 2 | `#E8A23C` |

## Typography

- **display**: Grenze Gotisch
- body: Spectral

These are read out of the bundle's own `@font-face` set — the template ships its
own typography and the pack manifest does not skin it. `npm run fonts:sync`
re-reads the rendered display face and writes it back here.

## Authored scene vocabulary

14 authored beats (41.6s as shipped) across 10 distinct shapes.
Authored durations are **advisory** — the film is locked to the narration, so the
adapter casts each storyboard beat onto the shape it can actually fill.

| Shape | Notes |
|---|---|
| **Hook** | authored scene shape |
| **Scroll** | authored scene shape |
| **Statement** | authored scene shape |
| **Ring** | authored scene shape |
| **Typing** | authored scene shape |
| **Feature** | authored scene shape |
| **Stats** | authored scene shape |
| **Montage** | authored scene shape |
| **Swipe** | authored scene shape |
| **CTA** | authored scene shape |

## Copy law

Every headline, sub, stat and caption comes from the user's script. The adapter
blanks any authored field it cannot map (a single space, never an empty string)
so the template's demo brand can never surface.
