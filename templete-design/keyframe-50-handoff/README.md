# KEYFRAME article packs — handoff (pilot bundle)

**All 50** typography-led article-to-video templates. `margin-notes` round-tripped
first; the other 49 follow the identical shape.

## What is here

```
README.md                  this file — install order, capture conditions, limitations
CONTRACT.md                config schema + where the brief and the reference file disagree
CAPABILITY-REPORT.md       engine gaps, ranked by how many packs depend on them
DETERMINISM-AUDIT.md       the forbidden-set scan and the one disclosed deviation
REGISTRY.md                the 50-row differentiation matrix
index.json                 machine-readable index — script against this
templates/<slug>.html      ×50  the wrapper: scene list, tweaks, mount
configs/                   the FilmKit.make(config) calls — 5 packs per file, plus
                           article-scripts.js (the 10 shared demo articles)
manifests/<slug>.pack.json ×50  incl. the full media-slot contract
fixtures/storyboard.<slug>.json  ×50  the exact content, verbatim, per beat
fixtures/timestamps.<slug>.json  ×50  14–15 comparison timestamps, each with a reason
reference-frames/<slug>/   PNG ground truth — margin-notes complete, 49 pending
fonts/FONTS.md             licences, weights, fallback stacks, non-Latin fallback
kit/PATCH-article-beats.md the engine patch — apply before rendering anything
kit/film-kit.js            the patched engine, for diffing only (do not overwrite)
kit/lint-reading-budget.js node script; fails the build on an under-budget beat
```

## Where the configs live

Configs are **grouped five per file** — `configs/article-pack-0N.js` holds one
cohort. Each file is a plain IIFE containing five `FilmKit.make({…})` calls;
`index.json` and each manifest name the `globalName` to extract
(`manifests/<slug>.pack.json` → `globalName`, `configFile`). Splitting them into
50 files would have meant 50 copies of the shared `LOOK()` helper; the helper runs
at config-build time and only its return value enters the config, so grouping is
extraction-safe. If `gen-film-skins.js` needs one file per skin, split on the
`global:` boundaries — nothing crosses them.

## Reference frames

`reference-frames/margin-notes/` holds 14 PNGs, complete and joined by filename to
`fixtures/timestamps.margin-notes.json`.

**The other 49 are pending capture.** Every timestamp list is final and every
storyboard is final, so the frames are mechanical to produce — but they must be
captured from the design-side render, not from your engine, or they are not ground
truth. Request them per cohort and they arrive as `reference-frames/<slug>/`
folders that drop straight in. Until then, `margin-notes` is the fidelity anchor;
the other 49 share its engine path, so a divergence in them is far more likely to
be a config or font issue than an engine one.

## Capture conditions for the reference frames

| | |
|---|---|
| Viewport | **1080 × 1920** (the stage's own box; the browser window was larger and the stage scaled — frames are captured at stage resolution) |
| fps assumption | **30** |
| Seek | absolute, via `data-om-seek-to-time-frame` with `sync: true` |
| Tweaks | exactly `storyboard.tweaksAtCapture` |
| Fonts | Google Fonts `<link>` (see the deviation in DETERMINISM-AUDIT.md) |
| Renderer | Chromium, DOM screenshot |

## How to run the comparison

1. Extract `templates/margin-notes.pack-config.js` with `gen-film-skins.js`.
2. Apply the engine patch in `kit/PATCH-article-beats.md` (2 renderers, 4 fields,
   1 fallback) — without it the Body and Quote beats have no renderer.
3. Feed `fixtures/storyboard.margin-notes.json` as the script. **Do not
   substitute other copy** — every field is verbatim and the frames depend on it.
4. Render at each ms in `fixtures/timestamps.margin-notes.json` and diff against
   `reference-frames/margin-notes/t-<ms>.png`.
5. Read each timestamp's `reason` before judging a diff — several are deliberately
   placed mid-mechanic, where a small easing difference produces a large pixel
   difference.

## Known limitations / integrator decisions

1. **Engine target.** These follow `film-kit.js` (React + animations-v2, px), not
   the GSAP `cqw` composer. If the destination is the composer, this is a port.
   Decide before integrating.
2. **Fonts.** Swap the `<link>` for the bundled `@fontsource` faces. No new
   packages needed.
3. **`R` / `rgba` in extracted scope.** The one open question — see
   CAPABILITY-REPORT §6.
4. **Empty media slots are intentional** in the fixtures. Beat 11's `image` and
   beat 18's `logo` are deliberately empty so the round-trip exercises the swap
   and the icon fallback. Two of the 14 frames test exactly this.
