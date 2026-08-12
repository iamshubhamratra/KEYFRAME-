---
version: alpha
name: Groove — Frame
description: >
  "GROOVE" 70s funk vinyl world. Spinning records, EQ bars, tape. Portrait-native 9:16 (12 authored beats, 34.8s as shipped), rendered from its own bundle — only the words and pictures change.
unit: the frame — 1080×1920 primary (portrait-native)
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  This pack routes to the OMELETTE ADAPTER
  (server/src/services/omelette_adapter.js, pack.json "renderer": "omelette",
  "template": "Groove") — it renders the ORIGINAL bundled Groove
  template rather than a re-implementation of it. The adapter swaps
  window.OM_SCENES for the user's scenes and drives the film through its own
  frame-exact seek contract (data-om-seek-to-time-frame with sync:true, applied
  via ReactDOM.flushSync).
---

# Groove

Portrait-native (9:16). Source bundle: `server/public/omelette-templates/Groove.html`.

Imported from the "HTML Animated Template Project" handoff.
The engine's playback/timeline bar has been removed from the bundle, so the film
is full-bleed at 1080×1920 with no transport chrome and no 44px scale reserve.

## Palette

| Role | Value |
|---|---|
| ground | `#F6EBD9` |
| ink | `#000000` |
| accent | `#E8A93C` |
| accent 2 | `#E0662C` |

## Typography

- **display**: Karla
- body: Shrikhand

These are read out of the bundle's own `@font-face` set — the template ships its
own typography and the pack manifest does not skin it. `npm run fonts:sync`
re-reads the rendered display face and writes it back here.

## Authored scene vocabulary

12 authored beats (34.8s as shipped) across 6 distinct shapes.
Authored durations are **advisory** — the film is locked to the narration, so the
adapter casts each storyboard beat onto the shape it can actually fill.

| Shape | Notes |
|---|---|
| **NeedleDrop** | authored scene shape |
| **Waveform** | authored scene shape |
| **Sleeve** | authored scene shape |
| **Tracklist** | authored scene shape |
| **Jukebox** | authored scene shape |
| **Encore** | authored scene shape |

## Copy law

Every headline, sub, stat and caption comes from the user's script. The adapter
blanks any authored field it cannot map (a single space, never an empty string)
so the template's demo brand can never surface.
