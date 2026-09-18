# CAPABILITY REPORT — what the engine does not have yet

Pilot scope: `margin-notes`. The additions below are **shared by all 50 packs**,
not one-offs — they are engine work, and the patch is already written.

## 1. New renderers the packs require (2)

| Renderer | Depends on it | What it does | Status |
|---|---|---|---|
| `Body` | **50 / 50** — 5 beats per pack | The article workhorse: 20–60 words at a declared character measure, word-cascade entrance derived from `PACE(progress)`, optional mono gutter and progress footer | **patch written** — `kit/film-kit.js`, see `kit/PATCH-article-beats.md` |
| `Quote` | **50 / 50** — 2 beats per pack | Pull quote: lines split on `\|`, each revealed by a clip-path mask wipe, oversized mark, left accent rule, attribution | **patch written** |

Without these two, an article script has nowhere to put a paragraph or a pull
quote — 7 of 18 beats per pack. Mapping them onto `Statement` loses the measure,
the cascade and the wipe; that is precisely the "visually adjacent" failure.

## 2. New config fields (4)

| Field | Depends on it | Note |
|---|---|---|
`look.<beat>.swap` | 50 / 50 | Empty media slot renders the pack's declared quote/body beat, borrowing the nearest unclaimed script line. The borrow map is computed **once from the whole scene list**, never from the playhead — a seek cannot change which line a beat shows. Without it the engine draws its dashed "DROP IMAGE" placeholder, which ships to viewers. |
| `look.<beat>.labelsOnly` + `look.montage.tile.h` | 50 / 50 | Per-beat equivalent of global `media:false`, so one pack can keep a real slot on Feature while Montage runs type-only. |
| `typeScale` | 50 / 50 | Compact / Default / Editorial as one control over size **and** measure **and** leading. No existing hook. |
| `chrome: false` | 50 / 50 | Suppresses the brand/progress overlay. Non-negotiable: a user's finished video must not carry a template name. |

## 3. CTA logo fallback

An empty `logo` slot currently renders a dashed box. Patched to draw the pack's
own `icon` in a filled badge. 50 / 50 depend on it.

## 4. Behaviour the engine expresses fine

Everything else in these packs is existing capability: the 16 scene renderers,
the 10 mechanics (we use only Typing, Scroll, Ring — max 3 per pack), the camera
strider, `motion-presets`, `groundCss`, the tweaks panel.

## 5. Browser-dependent surface — none

No CSS the engine won't inherit, no DOM structure assumptions, no event handlers.
Every visual is either an inline style on a React element or an SVG node returned
by `World`. `World` reads only `(theme, t, p, u)`.

## 6. `toString()` extraction risk

| Item | Risk | Reasoning |
|---|---|---|
| `palette` | **none** | arrow function, closes over nothing; reads only its `t` argument |
| `icon` | **none** | takes `R` (createElement) as a parameter rather than closing over it |
| `World` | **low** | closes over exactly two module-scope names: `R` and `rgba`. Both are provided by `film_stage.js` at the same names — **this is the one thing to confirm on the pilot round-trip.** If the target scope names them differently, the fix is one alias line per skin, not a rewrite |
| `LOOK()` helper (cohorts 07–10) | **none at extraction** | it is called at config-build time; only its **return value** is in the config. The helper itself does not need to cross |

**The single uncertainty in this bundle** is item 3 above: whether `R` and `rgba`
resolve in the extracted skin's scope. It is verifiable in five minutes on the
pilot and is the reason the brief's staged order is right.

## 7. Aggregate

- **Engine work (shared by all 50):** 2 renderers, 4 config fields, 1 fallback — all in the written patch.
- **Config work (per pack):** none outstanding.
- **Unresolved:** `R`/`rgba` scope in the extracted skin.
