---
version: alpha
name: Orbit — Frame
description: >
  A starfield countdown into liftoff: a rocket climbs on a column of flame and smoke, orbit rings turn, holo panels track telemetry and screenshots ride mission displays. For big launches and anything aiming high.
unit: the frame — 1920×1080 primary; 9:16 supported
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  Routes to the OMELETTE ADAPTER (server/src/services/omelette_adapter.js,
  pack.json "renderer": "omelette", "template": "Orbit") — it renders the
  ORIGINAL Orbit template rather than a re-implementation, driving it
  through the template's own frame-exact seek contract.
---

# Orbit

Authored scene sequence, in order:

1. **Countdown** — 5s
2. **Liftoff** — 5s
3. **Feature** — 5.5s
4. **Fleet** — 5s
5. **Telemetry** — 4.5s
6. **CTA** — 5.5s

The adapter maps each storyboard beat onto this sequence, replacing copy and
media while preserving the template's shape. Durations come from the storyboard.

## Palette

Ground `#060814` · ink `#EAF0FF` · accent `#5B8CFF`.

## Typography

**Syne**, uppercase, weight 900 — the 2026-07-30 stomp/percussion wave.
