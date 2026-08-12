---
version: alpha
name: Flight Vertical — Frame
description: >
  A portrait takeoff film: a jet rolls, rotates and climbs up the frame trailing a contrail while product screenshots ride cabin windows and boarding passes. Pale sky gradients, runway grey and a hot orange accent; motion is one continuous ascent. For launches, migrations, upgrades and anything that should feel like lift.
unit: the frame — 1080×1920 primary (portrait-native)
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  This pack routes to the OMELETTE ADAPTER
  (server/src/services/omelette_adapter.js, pack.json "renderer": "omelette",
  "template": "FlightVertical") — it renders the ORIGINAL FlightVertical template
  rather than a re-implementation of it. The adapter swaps window.OM_SCENES for
  the user's scenes, hides the engine's playback bar, and drives the film through
  its own frame-exact seek contract (data-om-seek-to-time-frame with sync:true,
  applied via ReactDOM.flushSync).
---

# Flight Vertical

Portrait-native (9:16). Authored scene sequence, in order:

1. **Gate** — 4.5s
2. **Takeoff** — 5.5s
3. **Climb** — 5s
4. **Cruise** — 4.5s
5. **Instruments** — 4s
6. **Arrival** — 5.5s

The adapter maps each storyboard beat onto this sequence in order, replacing the
copy and media while preserving the template's shape. Scene durations come from
the storyboard, so the film is always exactly as long as the script.

## Accent

`#FF5630` carries the film. Ground `#E9F6FF`, ink `#39404A`.

## Media

`assets.prefer` puts screenshots first, so real captures (topic_shots.js /
website ingest) land in the template's device frames ahead of stock photography.
