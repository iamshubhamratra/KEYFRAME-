---
version: alpha
name: Birdsong Field — Frame
description: >
  Flat storybook nature authored for 9:16. Deep forest green and warm bark brown on
  cream paper, with flapping flocks, perched birds, swaying trees and falling leaves
  drawn as bold flat shapes. Seven authored surfaces that read like the pages of a
  picture book rather than slides — cover, story, feature, gallery, cards, numbers,
  join.
unit: the frame — 1080×1920 primary (portrait-native)
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  This pack routes to the OMELETTE ADAPTER
  (server/src/services/omelette_adapter.js, pack.json "renderer": "omelette",
  "template": "Birdsong") — it renders the ORIGINAL bundled Birdsong template rather
  than a re-implementation of it. The adapter swaps window.OM_SCENES for the user's
  scenes, hides the engine's playback chrome, and drives the film through its own
  frame-exact seek contract (data-om-seek-to-time-frame with sync:true, applied via
  ReactDOM.flushSync).
---

# Birdsong Field

Portrait-native (9:16). Source bundle: `server/public/omelette-templates/Birdsong.html`.

## Authored scene vocabulary

Seven distinct shapes across 7 authored beats (~13.4s as shipped):

| shape | carries |
| --- | --- |
| `Cover` | the opening title over the flock |
| `Story` | a single statement on flat colour blocks |
| `Feature` | one point beside a drawn scene |
| `Gallery` | a wall of pictures |
| `Cards` | two or three short points as cards |
| `Numbers` | figures the script actually supplies |
| `Join` | the closing call to action |

The adapter casts each storyboard beat onto the shape it can actually *fill*,
exhausting every distinct shape before any repeats (see `slotFor` in the adapter),
so a longer script never replays the template from the top.

## Registration

Three sites, all required — a template that misses any one of them fails silently:

1. `server/public/omelette-templates/Birdsong.html` — the standalone bundle.
2. `frames/birdsong-field/pack.json` — `renderer: "omelette"`, `template: "Birdsong"`.
3. `PORTRAIT_TEMPLATES` in `omelette_adapter.js` — **without this a 9:16 template
   composes at 1920×1080** and the film is letterboxed into the wrong frame.

Plus this file: `frame_registry.listPacks()` only lists directories that contain a
`FRAME.md`, so a pack.json alone is invisible to the gallery and the router.

## Fonts

Bricolage Grotesque (display) + Karla (body). Both are embedded in the bundle as
base64 `@font-face`, so the render does not depend on the Google Fonts link that
also appears in the file — Karla is not in the repo's bundled font set and would
otherwise fall back.
