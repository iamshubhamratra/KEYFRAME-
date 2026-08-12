---
version: alpha
name: Flight — Frame
description: >
  A jet rolls down the runway, rotates and climbs into open sky trailing a contrail, while product screenshots ride cabin windows and boarding passes. One continuous ascent — for launches, migrations and upgrades.
unit: the frame — 1920×1080 primary; 9:16 supported
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  Routes to the OMELETTE ADAPTER (server/src/services/omelette_adapter.js,
  pack.json "renderer": "omelette", "template": "Flight") — it renders the
  ORIGINAL Flight template rather than a re-implementation, driving it
  through the template's own frame-exact seek contract.
---

# Flight

Authored scene sequence, in order:

1. **Gate** — 4.5s
2. **Takeoff** — 5.5s
3. **Climb** — 5s
4. **Cruise** — 5s
5. **Instruments** — 4.5s
6. **Arrival** — 5.5s

The adapter maps each storyboard beat onto this sequence, replacing copy and
media while preserving the template's shape. Durations come from the storyboard.

## Palette

Ground `#E9F6FF` · ink `#39404A` · accent `#FF5630`.

## Typography

**Chakra Petch**, uppercase, weight 900 — the 2026-07-30 stomp/percussion wave.
