---
version: alpha
name: Fight Night — Frame
description: >
  Fight night. Arena spotlights, a VS split, impact bursts and KO flashes, speed lines and screen-shake cuts, closing on a judges' scorecard. Built for head-to-head comparisons and anything that needs a challenger's swagger.
unit: the frame — 1920×1080 primary; 9:16 supported
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  Routes to the OMELETTE ADAPTER (server/src/services/omelette_adapter.js,
  pack.json "renderer": "omelette", "template": "Fight") — it renders the
  ORIGINAL Fight template rather than a re-implementation, driving it
  through the template's own frame-exact seek contract.
---

# Fight Night

Authored scene sequence, in order:

1. **MainEvent** — 5s
2. **Challenger** — 5.5s
3. **Champion** — 5.5s
4. **Combos** — 5s
5. **Scorecard** — 5s
6. **StepInRing** — 5.5s

The adapter maps each storyboard beat onto this sequence, replacing copy and
media while preserving the template's shape. Durations come from the storyboard.

## Palette

Ground `#0B0B10` · ink `#F5EFE6` · accent `#E23130`.

## Typography

**Syne**, uppercase, weight 900 — the 2026-07-30 stomp/percussion wave.
