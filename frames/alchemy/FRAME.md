---
version: alpha
name: Alchemy — Frame
description: >
  "ALCHEMY" potion-lab world. Bubbling flasks, smoke, gold. Portrait-native 9:16 (9 authored beats, 28s as shipped), rendered from its own bundle — only the words and pictures change.
unit: the frame — 1080×1920 primary (portrait-native)
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  This pack routes to the OMELETTE ADAPTER
  (server/src/services/omelette_adapter.js, pack.json "renderer": "omelette",
  "template": "Alchemy") — it renders the ORIGINAL bundled Alchemy
  template rather than a re-implementation of it. The adapter swaps
  window.OM_SCENES for the user's scenes and drives the film through its own
  frame-exact seek contract (data-om-seek-to-time-frame with sync:true, applied
  via ReactDOM.flushSync).
---

# Alchemy

Portrait-native (9:16). Source bundle: `server/public/omelette-templates/Alchemy.html`.

Imported from the "HTML Animated Template Project" handoff.
The engine's playback/timeline bar has been removed from the bundle, so the film
is full-bleed at 1080×1920 with no transport chrome and no 44px scale reserve.

## Palette

| Role | Value |
|---|---|
| ground | `#1A1030` |
| ink | `#F3E7C9` |
| accent | `#8FE07A` |
| accent 2 | `#B07CFF` |

## Typography

- **display**: Alegreya Sans
- body: Cinzel

These are read out of the bundle's own `@font-face` set — the template ships its
own typography and the pack manifest does not skin it. `npm run fonts:sync`
re-reads the rendered display face and writes it back here.

## Authored scene vocabulary

9 authored beats (28s as shipped) across 6 distinct shapes.
Authored durations are **advisory** — the film is locked to the narration, so the
adapter casts each storyboard beat onto the shape it can actually fill.

| Shape | Notes |
|---|---|
| **Grimoire** | authored scene shape |
| **Shelf** | authored scene shape |
| **Scrying** | authored scene shape |
| **Formula** | authored scene shape |
| **Scroll** | authored scene shape |
| **Elixir** | authored scene shape |

## Copy law

Every headline, sub, stat and caption comes from the user's script. The adapter
blanks any authored field it cannot map (a single space, never an empty string)
so the template's demo brand can never surface.
