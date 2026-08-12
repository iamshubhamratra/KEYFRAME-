---
version: alpha
name: Stomp Office — Frame
description: >
  Stomp typography authored for 9:16. Giant words that slam in whole, letters that
  cascade, tickers that scroll edge to edge, and flat office people typing, walking,
  calling and waving between the type. Fourteen authored surfaces on warm bark and
  terracotta over cream — loud and rhythmic, but human rather than neon.
unit: the frame — 1080×1920 primary (portrait-native)
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  This pack routes to the OMELETTE ADAPTER
  (server/src/services/omelette_adapter.js, pack.json "renderer": "omelette",
  "template": "Stomp") — it renders the ORIGINAL bundled Stomp template rather than a
  re-implementation of it. The adapter swaps window.OM_SCENES for the user's scenes,
  hides the engine's playback chrome, and drives the film through its own frame-exact
  seek contract (data-om-seek-to-time-frame with sync:true, applied via
  ReactDOM.flushSync).
---

# Stomp Office

Portrait-native (9:16). Source bundle: `server/public/omelette-templates/Stomp.html`.

## Authored scene vocabulary

Fourteen distinct shapes across 14 authored beats (~35.8s as shipped): `Hook`,
`TypeWall`, `Problem`, `Outline`, `Reveal`, `Typewriter`, `Showcase`, `Highlight`,
`Features`, `FlipWords`, `Team`, `BigQuote`, `Numbers`, `CTA`.

That is the widest vocabulary of any bundled template here, so a long script gets a
genuinely different shape per beat before anything repeats — the adapter exhausts
every fillable shape first (`slotFor`), then walks the remaining ones from a
different offset rather than replaying the film from the top.

## Registration

Three sites, all required — a template that misses any one of them fails silently:

1. `server/public/omelette-templates/Stomp.html` — the standalone bundle.
2. `frames/stomp-office/pack.json` — `renderer: "omelette"`, `template: "Stomp"`.
3. `PORTRAIT_TEMPLATES` in `omelette_adapter.js` — **without this a 9:16 template
   composes at 1920×1080** and the film is letterboxed into the wrong frame.

Plus this file: `frame_registry.listPacks()` only lists directories that contain a
`FRAME.md`, so a pack.json alone is invisible to the gallery and the router.

## Fonts

Caprasimo (display) + Figtree (body) — the same Organic pair Cadence uses, both
bundled in the repo and additionally embedded in the standalone as base64
`@font-face`.
