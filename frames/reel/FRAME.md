---
version: alpha
name: Reel — Frame
description: >
  A vertical social story. An animated gradient ground under kinetic auto-captions, big full-bleed phone screenshots, emoji sticker bursts and a swipe-up close. Built for 9:16 first — the caption rhythm, sticker pops and story beats are the whole language. For social cuts, launch teasers, feature drops and anything headed for a phone feed.
unit: the frame — 1080×1920 primary (portrait-native)
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  This pack routes to the OMELETTE ADAPTER
  (server/src/services/omelette_adapter.js, pack.json "renderer": "omelette",
  "template": "Reel") — it renders the ORIGINAL Reel template
  rather than a re-implementation of it. The adapter swaps window.OM_SCENES for
  the user's scenes, hides the engine's playback bar, and drives the film through
  its own frame-exact seek contract (data-om-seek-to-time-frame with sync:true,
  applied via ReactDOM.flushSync).
---

# Reel

Portrait-native (9:16). Authored scene sequence, in order:

1. **Hook** — 4s
2. **Show** — 4.5s
3. **Perks** — 5s
4. **Numbers** — 4.5s
5. **Proof** — 4.5s
6. **CTA** — 5s

The adapter maps each storyboard beat onto this sequence in order, replacing the
copy and media while preserving the template's shape. Scene durations come from
the storyboard, so the film is always exactly as long as the script.

## Accent

`#D4FF3F` carries the film. Ground `#150A2E`, ink `#FFFFFF`.

## Media

`assets.prefer` puts screenshots first, so real captures (topic_shots.js /
website ingest) land in the template's device frames ahead of stock photography.
