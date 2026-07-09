# Contrast audit — the legibility gate

KEYFRAME already gates two dimensions of a composition before it renders:

- **`hyperframes lint`** — *time*: track overlaps, unregistered timelines, missing ids.
- **`hyperframes inspect`** — *space*: text spilling out of containers, cards occluding each other.
- **runtime smoke** — *does it throw*: the GSAP script runs and registers `window.__timelines`.

None of them check the thing a viewer actually complains about: **can you read the text?**
Low-contrast ink on a busy photo, a same-family panel, or a dark ground renders "fine"
(no overlap, no error) yet is unreadable in the final MP4.

`contrast_check.js` fills that gap. It ports HeyGen HyperFrames' own WCAG contrast audit
(the `validate` contrast pass that ships in newer HyperFrames than the version we pin) onto
KEYFRAME's own stack — **no new heavy dependency**: it reuses `puppeteer-core` (already a
dependency) and the same cached Chromium the renderer downloaded.

## How it works

For a handful of sample times across the composition it:

1. Sizes the composition root to its declared canvas (what the HyperFrames producer runtime
   does at serve time) and seeks the paused GSAP timeline to time `t`.
2. Screenshots the frame twice — glyphs shown (**A**) and glyphs hidden (**B**).
3. Per text element, measures the **WCAG 2.1 contrast ratio** of the readable stroke against
   the true local backdrop (sampled from **B**, right under the glyphs).
4. Reports a text element as a failure only if it **never** clears WCAG AA at any settled
   moment it was measured (an element that dips during its entrance but reads fine once
   arrived is legible).

It handles the cases a naive check gets wrong: gradient-clipped emphasis (`-webkit-text-fill-color:
transparent`), neon glow/`text-shadow` (measured on the stroke core, not the halo), pill/badge
buttons with their own gradient fill, and outgoing-scene text covered by the next scene (skipped,
not failed).

Thresholds follow WCAG AA: **4.5:1** normal text, **3:1** large text (≥24px, or ≥19px bold).

Like the runtime smoke check, it **never blocks by itself** — if Chromium/puppeteer is
unavailable or anything unexpected happens, it returns `{ ok: true, skipped }`.

## Run it

```bash
# one or more composed job dirs (each must contain index.html + its assets)
npm run audit:contrast -- server/jobs/<jobId>
npm run audit:contrast -- server/jobs/<jobId> --samples 10        # denser timeline sweep
npm run audit:contrast -- server/jobs/<jobId> --verbose           # every measured ratio, not just failures
```

Exit code is `1` if any composition has a persistent AA failure (so it can gate CI), `0` otherwise.

Chromium is auto-located from `~/.cache/puppeteer/chrome` (the renderer's copy); override with
`PUPPETEER_EXECUTABLE_PATH` if needed.

## Reading the output

```
▐ myjob: auditing (10 samples)… ✗ 1 text element(s) never reach WCAG AA:
     2.1:1  (need 3:1)  #subtitle   best@3s  "secondary copy here"
```

A failure is a real legibility problem: brighten (dark ground) or darken (light ground) the
failing color until it clears the ratio, staying within the pack's palette family — don't
invent a new color. Re-run until clean.

## Programmatic use

```js
const { contrastCheck } = require("./src/services/contrast_check");
const res = await contrastCheck(jobDir, { samples: 8 });
// res: { ok, persistentFailures:[{selector,text,bestRatio,needed,bestTime}], failures, all, samples }
```

## Notes / limits

- It's a **heuristic**, most exact for solid-color text; gradient/glow emphasis is measured on
  the stroke core. Treat any flagged item as a review candidate and confirm visually.
- Canvas-based background FX (`<canvas>` painters) animate on their own rAF clock, not the seek,
  so their exact state at time `t` is approximate — fine for legibility, which is dominated by
  the settled foreground.
- The deterministic scene-kit packs are contrast-clean by construction, so it stays a
  **dev/CI tool by default** — a second headless pass per render isn't worth the memory on
  small boxes.

## Opt-in gate on the LLM-composer path

On the LLM (remix) path colors are model-chosen, so the gate can run inline there. It is
**off by default** and enabled with an env flag (read in `pipeline.js` → `gateComposition`,
after `lint` + runtime + `inspect` pass):

```bash
CONTRAST_GATE=warn     # run the audit, log any low-contrast text, never block
CONTRAST_GATE=repair   # (also 1/on/true) feed failures back as a soft repair brief
```

In `repair` mode a low-contrast composition is sent back to the composer with a fix brief
(brighten/darken within the palette). If repair laps are exhausted it still **ships that
lap** — a rich comp with a residual low-contrast label beats the bland fallback — mirroring
how the spatial `inspect` gate degrades. It uses 8 samples with a 75s cap and, like every
other gate, never blocks on checker trouble. The scene-kit path is untouched.
