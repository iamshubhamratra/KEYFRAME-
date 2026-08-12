---
version: alpha
name: Undertow — Frame
description: >
  "UNDERTOW" 9:16 DEEP-OCEAN world film. A vertical journey from sunlit surface to abyssal trench and back: live waves, fish schools, kelp forest, jellyfish, sonar, porthole screenshot, anglerfish trench, reef shelves, tide data, storm — own ocean palette (foam/teal/abyss/coral). , fast cuts. Portrait-native 9:16 (13 authored beats, 39s as shipped), rendered from its own bundle — only the words and pictures change.
unit: the frame — 1080×1920 primary (portrait-native)
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  This pack routes to the OMELETTE ADAPTER
  (server/src/services/omelette_adapter.js, pack.json "renderer": "omelette",
  "template": "Undertow") — it renders the ORIGINAL bundled Undertow
  template rather than a re-implementation of it. The adapter swaps
  window.OM_SCENES for the user's scenes and drives the film through its own
  frame-exact seek contract (data-om-seek-to-time-frame with sync:true, applied
  via ReactDOM.flushSync).
---

# Undertow

Portrait-native (9:16). Source bundle: `server/public/omelette-templates/Undertow.html`.

Imported from the "HTML Animated Template Project" handoff.
The engine's playback/timeline bar has been removed from the bundle, so the film
is full-bleed at 1080×1920 with no transport chrome and no 44px scale reserve.

## Palette

| Role | Value |
|---|---|
| ground | `#062C47` |
| ink | `#FF7A59` |
| accent | `#0E6F8C` |
| accent 2 | `#F2FBFA` |

## Typography

- **display**: Caprasimo
- body: Figtree

These are read out of the bundle's own `@font-face` set — the template ships its
own typography and the pack manifest does not skin it. `npm run fonts:sync`
re-reads the rendered display face and writes it back here.

## Authored scene vocabulary

13 authored beats (39s as shipped) across 13 distinct shapes.
Authored durations are **advisory** — the film is locked to the narration, so the
adapter casts each storyboard beat onto the shape it can actually fill.

| Shape | Notes |
|---|---|
| **Surface** | authored scene shape |
| **Dive** | authored scene shape |
| **School** | authored scene shape |
| **Current** | authored scene shape |
| **Kelp** | authored scene shape |
| **Jelly** | authored scene shape |
| **Sonar** | authored scene shape |
| **Porthole** | authored scene shape |
| **Trench** | authored scene shape |
| **Reef** | authored scene shape |
| **Tide** | authored scene shape |
| **Storm** | authored scene shape |
| **Close** | authored scene shape |

## Copy law

Every headline, sub, stat and caption comes from the user's script. The adapter
blanks any authored field it cannot map (a single space, never an empty string)
so the template's demo brand can never surface.
