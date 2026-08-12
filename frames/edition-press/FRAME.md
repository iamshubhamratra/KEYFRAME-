---
version: alpha
name: Edition — Frame
description: >
  Swiss editorial print, kinetic. A modular cream-and-ink grid, hairline rules that draw themselves, huge display type and one red accent. Reads like a magazine spread being typeset in real time.
unit: the frame — 1920×1080 primary; 9:16 supported
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  Routes to the OMELETTE ADAPTER (server/src/services/omelette_adapter.js,
  pack.json "renderer": "omelette", "template": "Edition") — it renders the
  ORIGINAL Edition template rather than a re-implementation, driving it
  through the template's own frame-exact seek contract.
---

# Edition

Authored scene sequence, in order:

1. **Cover** — 5s
2. **Lead** — 5.5s
3. **Spread** — 5s
4. **Ledger** — 5s
5. **PullQuote** — 4.5s
6. **Colophon** — 5.5s

The adapter maps each storyboard beat onto this sequence, replacing copy and
media while preserving the template's shape. Durations come from the storyboard.

## Palette

Ground `#EFE9DA` · ink `#16130D` · accent `#DA3A24`.

## Typography

**Chakra Petch**, uppercase, weight 900 — the 2026-07-30 stomp/percussion wave.
