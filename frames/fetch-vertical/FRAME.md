---
version: alpha
name: Fetch Vertical — Frame
description: >
  A playful portrait park: a dog runs a ball back to its master through a tall sunlit scene while product screenshots ride wooden signboards and a phone. Warm cream ground, grass green and a hot orange accent; motion is bouncy and character-led. For friendly consumer products, onboarding and anything that should feel human.
unit: the frame — 1080×1920 primary (portrait-native)
principle: the template's own grammar is sacred · only the words and pictures change
renderer: >
  This pack routes to the OMELETTE ADAPTER
  (server/src/services/omelette_adapter.js, pack.json "renderer": "omelette",
  "template": "FetchVertical") — it renders the ORIGINAL FetchVertical template
  rather than a re-implementation of it. The adapter swaps window.OM_SCENES for
  the user's scenes, hides the engine's playback bar, and drives the film through
  its own frame-exact seek contract (data-om-seek-to-time-frame with sync:true,
  applied via ReactDOM.flushSync).
---

# Fetch Vertical

Portrait-native (9:16). Authored scene sequence, in order:

1. **Title** — 5s
2. **Run** — 6s
3. **Fetch** — 4.5s
4. **Feature** — 5.5s
5. **Stats** — 4.5s
6. **CTA** — 5.5s

The adapter maps each storyboard beat onto this sequence in order, replacing the
copy and media while preserving the template's shape. Scene durations come from
the storyboard, so the film is always exactly as long as the script.

## Accent

`#F2683C` carries the film. Ground `#FFFDF6`, ink `#3A352C`.

## Media

`assets.prefer` puts screenshots first, so real captures (topic_shots.js /
website ingest) land in the template's device frames ahead of stock photography.
