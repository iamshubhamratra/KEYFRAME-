---
version: alpha
name: Showcase Vertical — Frame
description: >
  The annotated product tour, authored for 9:16. Big vertical screenshots with drawn arrows and numbered callouts stacked down the frame, tiles and counters sized for a phone. The Showcase language with a portrait grammar rather than a squeezed landscape one.
unit: the frame — 1080×1920 primary (portrait-native)
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  This pack routes to the OMELETTE ADAPTER
  (server/src/services/omelette_adapter.js, pack.json "renderer": "omelette",
  "template": "ShowcaseVertical") — it renders the ORIGINAL ShowcaseVertical template
  rather than a re-implementation of it. The adapter swaps window.OM_SCENES for
  the user's scenes, hides the engine's playback bar, and drives the film through
  its own frame-exact seek contract (data-om-seek-to-time-frame with sync:true,
  applied via ReactDOM.flushSync).
---

# Showcase Vertical

Portrait-native (9:16). Authored scene sequence, in order:

1. **Intro** — 4s
2. **Tour** — 5s
3. **Detail** — 5s
4. **Gallery** — 4.5s
5. **Stats** — 3.5s
6. **CTA** — 4.5s

The adapter maps each storyboard beat onto this sequence in order, replacing the
copy and media while preserving the template's shape. Scene durations come from
the storyboard, so the film is always exactly as long as the script.

## Accent

`#2F6BFF` carries the film. Ground `#EEF1F7`, ink `#131722`.

## Media

`assets.prefer` puts screenshots first, so real captures (topic_shots.js /
website ingest) land in the template's device frames ahead of stock photography.
