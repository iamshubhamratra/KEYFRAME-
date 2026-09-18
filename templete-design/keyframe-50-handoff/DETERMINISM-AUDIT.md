# DETERMINISM AUDIT

The renderer seeks frame by frame; the same timestamp must produce the same
pixels forwards and backwards.

## Method

Every pack file was scanned for the forbidden set, and every `World` was read for
accumulated state. `article-pack-01.js` … `-10.js` plus `margin-notes-pack.js`.

## Result — forbidden constructs

| Construct | Occurrences across all 50 |
|---|---|
| `Math.random` | **0** |
| `Date.now` | **0** |
| `performance.now` | **0** |
| `requestAnimationFrame` with accumulated state | **0** |
| CSS animation / transition on its own clock | **0** |
| `<video>` | **0** |
| render-time network fetch | **0** |
| WebGL / canvas-rendered text | **0** |

Every time-varying value in every `World` is a pure function of the `t` argument.
The three idioms used are all seek-safe:

1. `(t * rate) % period` — rotation and traverse phase
2. `(t % period) / period` fed through `u.ease` — eased cycles
3. `Math.sin(t * rate + offset)` — pendulums and sway

Counters that must look like state (step counters, sheet counts, tick marks) are
derived, e.g. `Math.floor(t / 1) % 12` and `6 - Math.floor(cyc * 2)` — no
accumulator anywhere.

## Result — external fonts

**One deviation, disclosed.** The pack wrappers load Google Fonts by `<link>`.
That is correct for design review and **wrong for the renderer**. Before
integration each wrapper's `<link>` must be replaced by the self-hosted
`@fontsource` faces already bundled in the repo — all 50 display faces are in
`src/fonts/_film_font_plan.json` as `bundled`, so **no new font packages are
needed**. See `fonts/FONTS.md`.

## Result — background loops

Every world's cycle closes on its period. Verified per pack by seeking to the
period boundary and one frame either side; the pilot's boundaries are captured as
reference frames `t-012000.png` and `t-024000.png` (12s carriage period).

Reverse scrub: because no value reads a previous frame, the reverse pass is
identical by construction. The pilot was scrubbed backwards through all 14
timestamps and matched.

## Result — sizing

Sizes are **px against a fixed 1080×1920 stage**, not `cqw` — see CONTRACT.md
§"Where this brief and the reference file disagree". The stage applies one scale
transform, so output is identical at 720p and 4K. If the target is the `cqw`
composer, this is a port.

## Result — DOM hygiene

- Every animated selector exists: nothing is addressed by selector at all; the
  engine drives React elements directly.
- Nothing hidden at birth and never revealed: every beat's opacity is a function
  of its own progress window, and all 18 beats appear in `OM_SCENES`.
- All text is DOM/SVG. Devanagari fallback declared per pack (Noto Serif
  Devanagari for the 22 serif-display packs, Noto Sans Devanagari for the other
  28); no canvas text anywhere, so non-Latin cannot break.
