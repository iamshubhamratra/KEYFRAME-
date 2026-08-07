# Template-Aware Asset Preparation Pipeline

**Status:** implemented and shipping behind two default-ON flags (`ASSET_PREP`, existing `ASSET_REUSE`).
**Test gate:** `npm run test:asset-prep` (40 assertions) + `npm run test:media-profiles`, both wired into `npm test`.
**Regression proof:** `npm test` green end to end, including `golden: 70 composition(s) byte-identical to baseline`.

---

## 0. The short version

Six symptoms were reported. Five of them turned out to be the same missing idea, stated five
ways: **nothing in the pipeline had ever asked the chosen template what it needed, and nothing
had ever looked at a pixel.**

| # | Reported symptom | Root cause | Fix |
|---|---|---|---|
| 1 | Some templates do not receive enough images | **(a)** `computeAssetBudget` sizes the pool from duration + scene count only (`asset_budget.js:25`); **(b)** — the *binding* one — a scene owning **any** pin had every stock need dropped, a boolean where the answer is a count | `media` block → `collectionTargetFor` raises the floor; `sceneIsSatisfied` compares **pins to slots** |
| 2 | High-quality images land in low-visibility positions | No slot ever had a *priority*, so "the best slot" was not expressible | `priority` on every placeholder + `promoteByQuality` swap pass |
| 3 | Poor-quality assets appear in hero sections | Nothing measured image quality; `cdScore` is a model's opinion of *relevance*, not of *pixels* | `asset_quality` 0–100 score + grade, gating critical slots |
| 4 | Images are cropped incorrectly | `cropFocusFor` (`visual_layout_director.js:83`) reads the **aspect ratio only** and returns one of two hardcoded strings | `crop_engine` — smartcrop focal points, per placeholder aspect |
| 5 | Placeholders remain empty | "Empty placeholder" was unrepresentable; the gate could only count scenes | `preflight` learns the slot list; `criticalPlaceholdersFilled` blocks |
| 6 | Asset preparation is sequential | `acquire()` was awaited one need at a time; prep work did not exist to be parallel | Parallel fetch + a concurrent `asset_prep` node |

Three defects found along the way were pure lost work — signals the code already computed and
then dropped one line before their consumer. Those are the cheapest wins in the whole change.

---

## 1. Audit of the pipeline as it stood

> **The full Phase-1 audit is `ASSET-PIPELINE-AUDIT.md`** — twelve subsystem auditors reading the
> real code, merged and re-baselined. It carries the end-to-end flow with a tag and a blocker per
> step, the complete asset-object contract, a ranked bottleneck ledger costed against **real job
> timings from this repo's own `jobs.json`**, the parallelization map, the integration seams and
> the landmines. What follows here is the summary that motivated the design.

### 1.1 The path an image took

```
POST /api/projects
  └─ runIntake ......................... website capture, video transcript, brief, script
       └─ PAUSE at script_review
  └─ runProductionGraph (LangGraph, 19 nodes)
       frame_selector ─┬─ storyboard_agent ─ scene_planner ────────────┐
                       ├─ asset_planner ─ asset_search ────────────────┤→ creative_director
                       ├─ caption_director ─ voice_agent               │  → visual_layout_director
                       └─ art_director ──────────┐                     │  → asset_reuse
                                                 │                     └───────┘
                            [asset_reuse + caption_director] → localization_director
                                                             → motion_planner
                                     [motion_planner + art_director] → composition → animation
                                            [animation + voice_agent] → audio_director → timeline
                                                             → qa_agent ⇄ repair → END
```

`asset_planner` decided how many assets to fetch; `asset_search` fetched them; `creative_director`
scored and scene-assigned them; `visual_layout_director` decided presentation; `asset_reuse`
cloned assets onto scenes still empty; `composition` emitted HTML; `renderer` drove
`npx hyperframes render`.

### 1.2 What an asset knew about itself

After `asset_search`, a wire asset carried: `path, type, sceneId, startSec, durationSec, style,
alt, width, height, ratio, hasAlpha, dhash, dominantColor, license, sourceUrl, source, fromCache`.

It did **not** carry `sharpness` or `stdev` — even though `asset_sources/util.validateImage`
computes both on the very line the asset is built from (`util.js:224`). They were dropped at
`asset_sources/index.js` and again at `graph.js:742`, one line below the comment explaining that
`dhash`/`dominantColor` had *already been rescued from exactly this fate once*.

**Consequence:** every quality question downstream had to be answered by a model's relevance
score, because no pixel measurement survived to the wire.

### 1.3 The crop finding — and a correction to the brief

The supplied `crop.txt` states: *"Every composer already reads `asset.cropFocus` and puts it into
`object-position`, so if you keep that contract, nothing downstream needs to change."*

**That is not true of this codebase.** Measured across `server/src/services`:

| Composer surface | Count | Behaviour |
|---|---|---|
| Read `asset.cropFocus` already | **3 sites** | `scene_kit` ×3, `paper_tales`, `terminal_departures` |
| `object-fit: cover` with a **hardcoded** `object-position` | **~14 sites** | `om_port_kit.shotFill`, `om_stage.plate`, `grid_dispatch` ×4, `showcase`, `slab_stage`, `blueprint`, `prisma` |
| `object-fit: cover` with **no** `object-position` (browser default 50% 50%) | **2 sites** | `motion_canvas`, `paper_craft` |
| `object-fit: contain` — **never crops at all** | **~18 composers** | `deep`, `bloom`, `drive`, `edition`, `fetch`, `fight`, `flight`, `hacker`, `jungle`, `momentum`, `orbit`, `pipeline`, `reel`, `bauhaus`, `showcase_vertical`, `teampulse`, … |

The single highest-leverage discovery: **`om_port_kit.shotFill` (`om_port_kit.js:217`) is the crop
for fifteen packs**, it hardcoded `center center`, and **not one of its call sites ever passed a
focus**. Fixing that one function fixed the crop for `deep`, `drive`, `edition`, `fetch`, `fight`,
`flight`, `hacker`, `jungle`, `momentum`, `orbit`, `pipeline`, `reel` and their siblings at once.

Improving `cropFocusFor`'s return value alone — the literal instruction in the brief — would have
changed the output of **three** composers out of thirty.

### 1.4 Bottleneck ledger (critical path first)

| Where | Kind | Issue | Est. cost |
|---|---|---|---|
| `graph.js` asset_search loop | sequential-wait | one `await acquire()` per need: provider round-trip + download + 4 ffmpeg probes, serially | **15–30 × ~1s** on a 30s film |
| `asset_budget.js:25` | algorithmic | pool sized from duration alone; sparse packs over-collect and pay full prep cost on assets they discard | up to 10 wasted fetches |
| `crop analysis` (new) | io/cpu | smartcrop on full-size 2732×1800 PNGs | 850 ms per (image, aspect) — **fixed**, see §6 |
| `creative_director` | llm-call | one batched vision review | unchanged |
| `composition → animation → timeline` | cpu | Chromium render | unchanged, dominant tail |
| `measureMissing` | io | 4 ffmpeg spawns per unmeasured asset | ~1 s/asset, now only for uploads/harvest |

### 1.5 What was already good, and was kept

The audit's most useful negative result: **Phase 5 (intelligent reuse) already existed and was
well built.** `asset_reuse.js` already enforced a 2-appearance ceiling, an adjacency veto, a
minimum-gap recency term, a semantic category↔role fit matrix, deterministic presentation
variation, and a per-renderer table of which scene roles can actually draw a picture. It was
extended, not replaced.

Likewise `asset_priority.tierFor` — the rule that a stock photo can never outrank a user upload,
*"not because a prompt asks nicely, but because 40*1000 + 100 < 100*1000 + 0"* — is load-bearing
and is preserved exactly. Quality ranks **within** a tier; it does not overturn tiers.

---

## 2. Template-aware asset requirements

Each pack now declares its media appetite the same way it already declares colour, motion, brand
and audio: a validated block in `frames/<pack>/pack.json`.

```jsonc
"media": {
  "requiredAssets": { "logos": 1, "icons": 3, "illustrations": 1 },
  "placeholders": [],                       // fixed, id'd slots (a pack with an exact layout)
  "slotsByRole": {                          // templated slots, instantiated per scene of that role
    "feature": { "count": 2, "width": 994, "height": 691, "priority": "high",   "objectFit": "cover", "kind": "screenshots" },
    "context": { "count": 1, "width": 994, "height": 691, "priority": "medium", "objectFit": "cover", "kind": "productImages" },
    "hook":    { "count": 1, "width": 994, "height": 883, "priority": "critical","objectFit": "cover", "kind": "screenshots" }
  },
  "oversample": 1.8,
  "addressing": "scene"
}
```

**Two ways to declare, because packs come in two shapes.** `placeholders` enumerates fixed slots
(pinned by `sceneIndex` or matched by role, round-robin over that role's scenes). `slotsByRole`
instantiates per scene. A pack may use either or both.

**Resolution** — `template_media.resolveMediaPlan({ pack, scenes, dims })` turns the declaration
into concrete placeholders bound to real scenes, each carrying `aspect`, `areaShare`, `weight`
and `priority`. A pack with no block gets a **derived** plan from its renderer family, marked
`source: "derived"` so consumers treat it as a floor.

**Authoring** — `scripts/apply-media-profiles.js` writes the block for all 46 packs, following the
`apply-audio-profiles.js` precedent (idempotent, `--check` mode wired into `npm test`).

Every capacity is **measured from the pack's own composer**, and each entry carries the
`file:line` it came from. A first pass of this table *guessed* the numbers and was
systematically low, because it confused a per-**beat** slot count with a per-**film** total —
`fetch` declares `title|fetch = 1` and was recorded as a two-picture template, when a 7-scene
film gives it six beats and therefore six pictures. Measured corrections:

| pack | guessed | measured | | pack | guessed | measured |
|---|---|---|---|---|---|---|
| `fetch` | 2 | **6** | | `deep` | 6 | **10** |
| `hacker` | 4 | **8** | | `edition` | 5 | **9** |
| `pipeline` | 5 | **10** | | `flight` | 6 | **9** |
| `jungle` | 5 | **10** | | `drive` | 11 | **15** |
| om_stage ×7 | 8 | **12** | | `showcase` | 10 | 10 ✓ |

`count` is derived from that measured capacity spread over a film's picture-bearing beats,
bounded by the composer's own per-beat ceiling and hard-capped at 3 — over-declaring assigns
assets into capacity the weave then slices away and *reports the loss as coverage*.

**A second correction, and a subtle one:** `objectFit: "contain"` does **not** mean "not a slot".
`om_stage.fitFor` (`om_stage.js:433`) returns `contain` for every screenshot and every owned
asset, so the seven om skins letterbox nearly all of their pictures inside designed frames.
Filtering slots on `objectFit === "cover"` dropped most of their real slots. Contain only means
the picture is never *cropped* — the crop engine skips it, the slot accounting does not. What is
genuinely not an asset slot is a **logo lockup**, which is fed by `find(isLogo)`.

### The budget rule

```
target = max( slots × oversample ,  min( durationFloor , slots × 2.5 ) )
```

Both halves matter, and the second is half the reported complaint:

Measured across all 46 packs on a 7-scene, 30-second film (duration floor = 15):

| Pack | Slots | Target | Effect |
|---|---|---|---|
| `drive` | 16 | **29** | raised — the hungriest pack in the library |
| `deep`, `jungle`, om_stage ×7 | 11 | **20** | raised |
| `showcase`, `pipeline` | 10 | 18 | raised |
| `aurora-spectrum`, `bauhaus-print`, … | 8 | 15 | matched |
| `terminal-departures`, `paper-tales`, `slab-stage` | 5 | **13** | capped — the surplus would be fetched, probed, cropped, discarded |

Six distinct targets across the library where there was previously exactly one.

`HEADROOM = 2.5` is deliberately generous: **rejecting a bad asset requires having a better one to
reject it for.** Starving the ranker would trade one defect for another.

---

## 3. Quality ranking engine

`services/asset_quality.js` — one 0–100 score and one grade per asset.

| Component | Weight | Signal |
|---|---|---|
| resolution | 20 | linear pixel density **against the slot it must fill**, not in the abstract |
| sharpness | 22 | variance-of-Laplacian, **normalized per kind** |
| information | 12 | grayscale stdev — a blank page section is not a picture |
| compression | 8 | bits per pixel — the "found on the web twice" artefact |
| colour | 8 | penalises blown-out and near-monochrome mud only |
| subject | 10 | edge-energy concentration (free — the crop engine already has the map) |
| editorial | 20 | the existing `cdScore` / `clipRelevance` / `visionOk` |

**Grades:** `hero` ≥78 · `high` ≥62 · `medium` ≥45 · `low` ≥28 · `reject` below.

**Calibrated, not guessed.** Every threshold was measured against this repository's real job
images before being written:

```
ingest/website_mobile.png     1170x2532   sharpness 5415.7   stdev 36.2
ingest/website_section2.png   2732x1800   sharpness 4321.1   stdev 59.1
ingest/website.png            2732x1800   sharpness 2947.6   stdev 34.0
ingest/website_section3.png   2732x1800   sharpness 1000.5   stdev 17.2   ← a near-blank page section
brand_assets/a32.webp          875x985    sharpness  388.5   stdev 22.9
```

Screenshots carry text and UI chrome, so their Laplacian variance runs several times a
photograph's — a single global cutoff would call every photograph blurry. Hence `SHARPNESS_BANDS`
per kind (`screenshot: soft 400 / crisp 2800`, `photo: soft 120 / crisp 900`).

End-to-end on those real images: `website.png` → **87 hero**, `website_section3.png` (the blank
section) → **61 medium**. The system distinguishes them; nothing before it could.

**Three invariants, all tested:**

1. **Tier is a floor, never a ceiling.** Owned material is never *rejected* on pixel evidence
   alone; the most this engine may do is rank the user's soft upload below their sharp one.
2. **Unmeasured is neutral, never bad** (0.6). "We could not measure this" must not systematically
   demote every asset arriving by a path that skips the fetch-time probe.
3. **A logo is a mark, not a photograph** — graded `high` unconditionally. Judging a clean
   wordmark on photographic sharpness would demote every one of them.

The one bounded exception to tier: a **critical** slot holding an asset graded `reject` may be
displaced across tiers, because a hero showing a broken picture is worse than a hero showing
decent stock.

---

## 4. Placeholder-aware cropping

`services/crop_engine.js`, implementing the `crop.txt` specification and extending it.

**Contract preserved exactly.** Output is a CSS `object-position` string on `asset.cropFocus`.
Nothing downstream had to change to accept it.

**Per-placeholder, because the best crop is a property of the (image, box) pair, not of the
image.** Measured on a real fixture, the same 600×400 image returns `65% x` for a square request
and `50%` for a wide one. The engine analyses once per **aspect bucket** — the distinct slot ratios
the resolved media plan says this film actually needs, typically two or three — and stores them as
`asset.cropFocusByAspect`. Composers resolve synchronously via `focusFor(asset, w, h, fallback)`.

**Three analyzers, in order:**

1. **smartcrop + smartcrop-sharp** — the libraries the specification names.
2. **an ffmpeg edge-energy search** — same idea, zero native dependency. This exists because
   `asset_sources/util.js:167` states the repo's standing policy in so many words
   (*"ffmpeg-only (no `sharp`, per repo policy)"*), and a box where sharp's native binding fails
   must still get a content-aware crop rather than falling all the way back to the ratio guess.
3. **the original ratio heuristic**, preserved verbatim, for an image that cannot be read at all.

**The reading-order prior.** Pure saliency is wrong about web pages. On a real 2732×1800 homepage
capture smartcrop returned `50% 48%` (the dense mid-page section) where the old heuristic said
`top center` — and *the old heuristic was right about which part of a page matters*. So screenshot-
class assets are pulled back toward the top **in proportion to how much vertical content the crop
discards**: a near-square capture in a near-square box keeps its saliency answer untouched; a
1170×2532 full-page capture squeezed into a 4:3 plate is dominated by the prior. Measured:

```
website_mobile.png   aspect 0.75 → 60%   1.13 → 53%   1.34 → 46%   1.57 → 41%
```

**Skipped entirely:** vectors, SVG, videos, logos, and every `object-fit: contain` slot — a
contain-fit box never crops, so an anchor computed for it is inert at best and misleading at worst.
This is also most of the analysis budget on a brand-heavy film.

**Composer wiring.** All ~16 cover-fit sites now resolve through `focusFor`, including the two that
emitted no `object-position` at all. Content truth outranks the call site's literal, because those
literals (`"center top"`) are generic defaults written before anything had measured the picture; a
site that must pin a crop passes `{ force: true }`.

**Four cover-fit sites are deliberately left hardcoded**, and they are not oversights:

| Site | Why |
|---|---|
| `om_stage.js:453`, `prisma_composer.js:646` | the **scroll plate** — the image is laid in at natural height inside a scrolling window and animated; `top center` is the scroll's *start position*, not a crop anchor |
| `om_stage.js:486` | a blurred 0.22-opacity background wash — decorative, has no subject to keep |
| `scene_backdrop.js:171` | a scaled, blurred backdrop scrim — same |

**Proof it is a true no-op without data:** the golden-composer suite reported *only* the two
composers where an `object-position` was newly **added**, and both new values equal the browser
default. Every other composer was byte-identical. After baselining: `70 composition(s)
byte-identical`.

---

## 5. Intelligent reuse and quality-aware placement

`asset_reuse.js` already implemented the reuse policy the brief asks for. What it lacked was any
notion that one slot matters more than another.

**`buildSlots` now reads the media plan** — real boxes with real priorities and real aspect ratios,
replacing the one-addressable-slot-per-scene approximation (and the `slotRatio(dims)` guess that is
precisely why `aspect` was only ever worth 8 of the scorer's 100 points).

**`promoteByQuality` — a new PASS 0** that runs before any filling. The Creative Director assigns
each asset to the scene where it best supports the *story*; the Visual Layout Director then
*spreads* assets so no scene is bare, moving the **weakest** surplus asset to do it. Neither ever
asks the question a viewer answers instantly: *is the picture in the hero the best picture we have?*

It is a **swap** pass, deliberately, not a re-assignment — swapping conserves coverage exactly, so
nothing it fixes can un-fix the empty-scene work that precedes it. Three guards:

1. **Gain threshold** (12 points) — the difference must be visible, not noise.
2. **Semantic floor** — neither asset may land in a slot its category cannot serve, using the same
   `SEMANTIC` matrix the reuse scorer uses, so the two cannot disagree.
3. **Tier** — never demote owned material for stock, except the bounded critical-slot rescue.

A bug caught by the first end-to-end run and now covered by a named test: the obvious loop takes
the *first* acceptable swap, and duly promoted a `medium` (55) into the hero while a `hero` (88)
sat in a support tile. It now evaluates all donors and takes the best, tie-broken by aspect fit.

```
BEFORE: weak.jpg@s1(low)  great.jpg@s4(hero)  mid.jpg@s3(medium)
AFTER:  great.jpg@s1(hero)  mid.jpg@s3(medium)  weak.jpg@s4(low)     coverage 100% → 100%
```

**Three clobber bugs closed.** Because preparation moved upstream, three later stages would have
silently overwritten the measured focal point and reverted the whole feature:

- `visual_layout_director.js:206` reassigned `a.cropFocus = cropFocusFor(a, k)` unconditionally → now guarded on `!a.cropFocus`.
- `asset_reuse.variationFor` re-anchored a reused photo to a random crop → now skipped when the anchor was measured (scale, tilt and entrance still make the second appearance visibly different).
- `visual_layout_director.importance` ignored quality, so two equally CD-scored uploads were ordered by array position → `qualityScore` joins the blend, inside the tier's ×1000 major key.

---

## 6. Parallel sub-agent architecture

**New node: `asset_prep`**, between `asset_search` and `creative_director`, on the asset branch
alone — so its CPU-bound work overlaps the storyboard and voice branches instead of extending the
critical path.

```
frame_selector ─┬─ storyboard_agent ── scene_planner ───────────────┐
                ├─ asset_planner ── asset_search ── asset_prep ─────┤→ creative_director
                │                       ┌───────────────────────┐   │
                │                       │ IMAGE QUALITY  ┐      │   │
                │                       │ CROP INTEL     ├ ‖    │   │
                │                       │ CLASSIFICATION ┘      │   │
                │                       └───────────────────────┘   │
                ├─ caption_director ── voice_agent                  │
                └─ art_director ────────────────────────────────────┘
```

Three sub-agents run concurrently inside it (`Promise.all`), because they are genuinely
independent — each reads the files and writes disjoint fields:

| Sub-agent | Writes |
|---|---|
| Image Quality | `sharpness`, `stdev`, `bpp`, `dominantColor` → `qualityScore`, `qualityGrade`, `qualityParts` |
| Crop Intelligence | `cropFocus`, `cropFocusByAspect`, `cropFocusSource`, `subjectFocus` |
| Classification | `category`, `measureKind` |

The scorer reads what the crop agent writes (`subjectFocus`), so it runs after the two
file-reading agents settle — a single join, not a chain of three.

**The other sub-agents in the brief already had homes and were left there**, which the audit
supports: Screenshot Intelligence is `ingest/capture` + `screenshot_intake` (at intake, where the
browser is); Brand Analysis is `art_director`, already a parallel fan-out branch; Audio Analysis is
`voice_agent` + `audio_director`, already concurrent with the whole visual branch; Video Quality is
`preflight` + `qa_agent`, now taught about placeholders. Duplicating them would have added latency
and two sources of truth.

**Parallel fetch, sequential dedupe.** The `acquire()` loop was serial for two real reasons, both
preserved rather than waved away:

- `usedLibraryIds` excludes library files already chosen. A shared `Set` still does this between
  awaits; what parallelism costs is only the *guarantee*, and the dedupe pass catches the remainder
  by content hash — strictly stronger than an id match anyway.
- The deduper is **order-dependent** (uploads > brand > screenshots > stock decides who wins a
  collision). That cannot survive a race, so deduping does **not** run inside the lanes: every
  fetch completes, then winners are decided in one pass in the original plan order.

Output paths are assigned **before** dispatch from the need's index — the `iImg++` inside the old
loop body would have been a genuine correctness bug the moment it ran concurrently.

---

## 7. Performance

| Optimisation | Before | After |
|---|---|---|
| Crop analysis (5 images × 3 aspects, real captures) | 12,855 ms | **1,712 ms** |
| …same, warm cache | — | **8 ms** |
| **Whole prep stage, 5 real assets, cold** | — | 3,024 ms |
| **Whole prep stage, 5 real assets, warm** | — | **225 ms** (13×) |
| Asset fetch | serial, 15–30 × ~1 s | 2–6 lanes |
| Duplicate upload analysis | 251 ms | **2 ms** (content-addressed) |
| Sparse-pack over-collection | up to 10 wasted fetches | capped by the template |
| `sharpness`/`stdev` for stock | recomputed (4 ffmpeg spawns) | carried from fetch — **0** |
| `sharpness`/`stdev` for uploads & captures | 4 ffmpeg spawns each, every run | content-cached at `asset_cache/measure/` |
| **Creative Director vision review** | `ceil(N/6)` chunks **serial** — measured 18.4–52.4 s, **median ~36 s** across 13 real jobs | 4 concurrent lanes ⇒ ~one round-trip |
| CD thumbnail generation | one ffmpeg spawn at a time inside the serial chunk loop | `Promise.all`, order preserved |
| Deduper seeding | 6–12 serial ffmpeg dHash passes recomputing hashes already in memory | hash passed through; groups stay ordered, adds run together |
| CD request timeout | no `creative_director` key ⇒ inherited **180 s** × 3 attempts ⇒ **543 s** tail | pinned to 90 s in `config.json` + `config.example.json` |

The last four came out of the audit, not out of my own reading. The vision-chunk find is the
largest single item in the whole subsystem, and the auditor established it was safe to
parallelize by pointing at the code: each chunk writes a **disjoint** key range into `verdicts`
(`baseIndex + i`), sends its own images, and never sees another chunk's context. It was serial
because that is the shape a `for` loop has.

### Three quality fixes the audit found that I had missed

| Where | What | Why it mattered |
|---|---|---|
| `graph.js` pin suppression | A scene owning **any** pin dropped every `role:"background"` stock need and its derived gap-fill. Now `template_media.sceneIsSatisfied` compares **pins to slots**. | The *binding* cause of symptom 1. `showcaseTargets` returns every substance scene, so pins claim nearly all of them. Audited job `ahtquvd86o`: **9 assets, exactly ONE of them stock**, while its own budget said `maxPhotos = 9`. Raising the budget cannot fix that — the wants were never created. |
| `scene_kit.js` `scrimBg` | `object-fit: cover` with **no `object-position` at all** → the browser default 50% 50%. Now carries the measured focus. | "The path every demoted/overflow asset takes and the single most common placement in the library." My own grep missed it because I searched for *hardcoded* positions, not *absent* ones. |
| `graph.js` → `acquire()` | `targetRatio` was accepted by `acquire`, implemented in `util.rankCandidates` (`util.js:309`) — and **never passed by any call site**. Now passed from the slot's real aspect. | Per-slot aspect ranking was fully coded and entirely unwired: a 16:9 desktop capture and a 9:16 phone shot scored identically for a tall hero plate. |

The pin-suppression predicate was extracted into `template_media.sceneIsSatisfied` (pure, exported)
rather than left as a closure inside the planner, so it is covered by named tests.

**Why crop analysis got 7.5× faster:** saliency is a low-frequency property. The focal point of a
2732×1800 homepage capture is in the same place at 512 px wide, and finding it there is an order of
magnitude cheaper. The downscale happens **once per image** via sharp and the buffer is reused for
every aspect, so a three-aspect film pays one decode instead of three. The focal point is a
*fraction*, so it is scale-invariant — verified: the fractions are identical before and after.

**Caching.** Keyed by file **content** (MD5), not path, so the same stock photo fetched by two
different jobs is analysed once and a re-render is free. Stored at `server/asset_cache/crop/` with a
two-level fan-out. The hash itself is memoized on `(path, size, mtime)` — re-reading multi-megabyte
PNGs on every cache *lookup* defeated the point of caching, which the second measured pass exposed.

### The audit's remaining six — all now fixed

| # | Where | What it was | What it is |
|---|---|---|---|
| 1 | `creative_director` audio | A text-only music/SFX verdict `await`ed as step 5, after CLIP, the whole vision review and the top-up fetch — though its only CD input (`scenes.length`) is known ~300 lines earlier | Started before the review, collected at the end. `.catch` attached immediately, because an un-awaited promise that rejects before its await point is an unhandled rejection |
| 2 | CD top-up fetch | Serial `await acquire()` per gap scene (3–12 of them), each a round-trip + download + 4 ffmpeg probes | Planned first, then 4 lanes. **Output index assigned during planning** — `topUpAssets.length` inside the loop is the same filename race the fetch lanes had to avoid |
| 3 | `asset_clip` | `RawImage.read` decoded the **full-res original** (2732×1800 PNGs) so the processor could immediately resize to 224; the 6 prompt embeddings ran one at a time | Prompts in `Promise.all`; images pre-resized to 336 px (1.5× the model input, so the processor's own resample keeps headroom). Measured: 1186 KB → 77 KB in 115 ms. `relevance()` had an **inline duplicate** of the embed that bypassed the fix — now routed through the one implementation |
| 4 | `md5File`, `local_db.register` | Synchronous whole-file reads on the main thread — 10–100 ms event-loop stalls in a process also serving HTTP | Streamed hashes, async copy. `register` became async, so its **check-then-push is now await-free** or two lanes could both append the same bytes |
| 5 | `pixabay_bridge` | `enabled()` consulted only the env flag; `searchVectors` never tripped the latch. A dead bridge cost 30 s **per query variant, per need** — up to 120 s for one vector | `enabled() = ENABLED && bridgeReachable()`, and a connection-level failure in *either* the vector or the audio path trips the shared latch once |
| 6 | `asset_reuse` | Re-filtered every ledger row per empty slot; `similarity()` re-parsed two BigInt hashes per pair per slot; `neighbours.indexOf()` linear-scanned the scene list | Set consumed incrementally, memoized similarity (per-run, cleared on entry), scene-position Map. Measured **45 slots × 80 assets in 0.9 ms**, flat, coverage unchanged at 100% |

Items 3 and 6 were the audit's own predictions about the multi-slot model this change enabled —
"will not survive" — so they are fixed ahead of the load rather than after it.

### The native load-order hazard (found by fix #3 crashing)

The first version of the CLIP downscale used `sharp`, and it **segfaulted the whole process**:

```
(process:2896): GLib-GObject-CRITICAL: invalid uninstantiatable type '(NULL)' in cast to 'GObject'
Segmentation fault
```

Isolated by bisection — `CREATIVE_DIRECTOR_CLIP=0` passed, CLIP on crashed, twice, deterministically.
Then measured directly:

| Load order | Result |
|---|---|
| `sharp` → `@huggingface/transformers` | **survives** |
| `@huggingface/transformers` → `sharp` | **segfault** |

libvips and onnxruntime-node both pull native image libraries, and the second to initialise
loses. A lazy `require("sharp")` inside the CLIP path is by construction the second one.

**This is why `asset_sources/util.js:167` says "ffmpeg-only (no `sharp`, per repo policy)."** The
policy is not a style preference and the comment does not explain itself; it is load-bearing.
The fix uses ffmpeg — a separate *process*, so it cannot conflict with anything in ours.

Two consequences worth keeping:

1. `crop_engine` legitimately needs sharp (smartcrop-sharp). It is safe today only because
   `asset_prep` runs before `creative_director` in the graph — an accident of node ordering, not
   a guarantee. **`server.js` now requires `sharp` at boot**, before any request can reach either
   path, so the order cannot be got wrong. Non-fatal if absent: the crop engine has an ffmpeg
   fallback, which is precisely why that fallback exists.
2. Anything added to the CLIP path in future must stay ffmpeg-only.

### The render's one remaining QA blocker — partly fixed

QA on `1taphktp2w`: *"Massive empty space on the right side of the canvas in Scene 05."* Measured
in the emitted HTML: that plate was **40.73 of 88.15cqw — 46% of the grid, 54% bare.**

Cause: `grid_dispatch_composer.panelBox` sizes the plate from the **picture's** aspect, not the
slot's. That is deliberate — an earlier review blocked a film for the opposite defect ("product UI
screenshot rendered too small" when letterboxed inside a wide box) — and the pack's own answer to
the freed width is its idiom `// BESIDE A NARROW PLATE, UNDER A WIDE ONE`. But only **one** of the
five callers (the main scene, via `asideMain`) actually puts anything there; the other four leave
paper.

Fixed by an opt-in `fill` flag on the four callers with no aside: widen the plate toward the slot,
bounded by `MAX_FILL_CROP = 1.5`. Widening only ever **crops, never stretches**, and it is safe now
in a way it was not before — every asset arrives with a content-derived `cropFocus`, so the height
given up comes off the edge furthest from the subject. Measured on a 0.46 phone capture:
**46% → 56% of the grid** (+50% width, 33% of height cropped). Golden showed only `grid-dispatch`
changing; re-baselined.

**Still only a partial fix, and the arithmetic says why.** The binding constraint is the available
HEIGHT, not the width: the plate is already as tall as the row allows and only as wide as the
aspect permits. Filling 88.15cqw with a 0.46 capture would need it cropped to ~1.23 — discarding
**63% of the image**. That is not tunable; it is a 9:19.5 phone screenshot in a wide print grid.
The complete fix is the pack's own idiom — move the figure scene's stat blocks into the column
beside a narrow plate, as `asideMain` already does for the main scene. Deferred: it restructures a
scene whose stats layout and `tailY` are mutually dependent, and it can only be validated by
re-rendering and looking.

### Still open

- **CLIP's 149 MB model load on the first job after a restart.** Unchanged; it is a cold-start
  cost, not a per-job one. Warming it at boot alongside `skills.warmUp()` would hide it.
- **`validateImage` spawns four ffmpeg processes per candidate.** The content cache removes the
  repeat cost but a first-ever image still pays it; one combined filtergraph would make it one.
- **`pixabay_scrape` launches a full Puppeteer Chrome per call** (45 s nav + 20 s Cloudflare wait).
  Fourth in the provider ladder, so it is reached rarely — but when it is, it dominates.
- Two findings that are **product decisions, not refactors**: owned content is exempt from the
  CD's quality floor (`creative_director.js:372`), and `rankKey = tier*1000 + score` makes quality
  arithmetically incapable of crossing a tier boundary (`asset_priority.js:82`).

1. **Move `asset_prep` into the fan-out.** It currently waits on `asset_search`. The uploads and
   harvested brand assets exist at intake and could be measured and cropped while stock is still
   being fetched.
2. **Persist the quality score with the cached asset.** `asset_cache/index.json` already survives
   across jobs; scoring a cache hit is redundant work.
3. **Capture-time screenshot quota.** `template_media` now knows a pack wants *N* screenshots, but
   `ingest/capture` still captures a fixed number at intake — before the pack is chosen. Feeding the
   quota back would need capture to run (or top up) after `frame_selector`.
4. **`measureMissing` batching.** It still spawns 4 ffmpeg processes per *uncached* asset. The
   content cache removes the repeat cost, but a first-ever image still pays it; one combined
   filtergraph would cut four spawns to one.
5. **Drop `maxAssets` in favour of measured render cost.** The cap is a proxy for "how much can
   Chromium hold"; the renderer already knows the real answer.

---

## 8. Validation plan

**Automated** — `npm run test:asset-prep`, 40 assertions, in `npm test`:

- *template_media* — derived plan usable; never claims a slot the renderer cannot draw on; content-critical scenes excluded; **every one of the 46 shipped packs resolves to exactly one critical slot**; authored beats derived; slots pinned past the end are dropped not clamped; a malformed block degrades instead of throwing; budget raises **and** caps.
- *asset_quality* — crisp beats soft by >20 points; unmeasured is neutral; **the `Number(null) === 0` regression** that made every slot one pixel wide; resolution judged against the slot; tier floor fires and is disclosed; logo exemption; tier outranks quality normally **and** the bounded critical-slot exception.
- *crop_engine* — eligibility skips; the `object-position` contract incl. clamping; **no-op without analysis**; content truth outranks a call-site literal; nearest-aspect selection; the original heuristic preserved; the reading-order prior scales with discard and leaves photographs alone; subject concentration.
- *placement* — plan-driven slots carry priority and real ratios; legacy path unchanged; the best picture reaches the critical slot; **the best donor, not the first**; coverage conserved exactly; owned material protected; a film of equal pictures is left completely alone.
- *preflight* — empty critical slot warns on derived / **blocks on authored**; a rejected asset in a critical slot is named; **with no media plan not one new check appears**.
- *pixels* — real focal point from a real image; deterministic; warm cache not slower; skips untouched. Skipped, not failed, when no fixture exists.

**Non-regression** — the whole existing suite, unchanged and green: `golden: 70 composition(s)
byte-identical to baseline`, `test:reuse` 33, `test:ghosts` 35, `test:motion-safety` 35,
`test:portrait` 16/16, `test:spread` 7, `test:content` 13, `test:taxonomy` 87, `test:integration` 10.

**Runtime disclosure** — every stage reports itself into the job record, so a bad film can be
diagnosed without re-running it:

```
[agents] media plan → organic-garden [authored] 7 slot(s) (1 critical / 5 high / 1 medium) · 2 crop aspect(s)
[agents] template capped the asset budget (15 → 13) for 5 slot(s) — the surplus would have been fetched, scored and discarded
[agents] asset_search: fetched 12/14 in 3180ms across 4 lane(s)
[agents] asset_prep: 12 asset(s) in 2140ms — 6 measured, 12 cropped (4 cached, 2 skipped) via smartcrop; grades 3★ / 5 high / 3 med / 1 low / 0 reject
[asset_reuse] promoted 1 asset(s) into higher-visibility slots: great.jpg→s1-hero (+50)
[agents] asset_reuse → 100% of 7 slot(s) covered · 1/1 critical filled · 1 quality promotion(s)
[preflight] 11/12 checks passed · 1 warning(s)
```

**Manual acceptance** — for each of the six symptoms, render one film and check the named log line
and the Premiere disclosure panel: quota met (`__raisedBy`), hero grade (`criticalSlotQuality`),
empty slots (`placeholdersFilled`), crop source (`cropFocusSource` = `smartcrop`, not `heuristic`),
promotions (`qualityPromotions`), wall-clock (`asset_prep` ms + fetch lanes).

### Validated by a real render

Job `1taphktp2w` — `razorpay.com`, 30 s, 9:16, `grid-dispatch` — re-running the **exact job the
audit used as its exhibit** (`ahtquvd86o`, same URL / duration / orientation / pack).

```
media plan → grid-dispatch [authored] 7 slot(s) (1 critical / 5 high / 1 medium) · 4 crop aspects
asset_planner: 0 upload + 5 screenshot + 4 photo        ← 4 stock wants, where the old boolean made ~none
asset_search:  fetched 4/4 in 89ms across 4 lane(s)
asset_prep:    11 asset(s) in 5023ms — 9 measured, 11 cropped via smartcrop
               grades 4★ / 5 high / 2 med / 0 low / 0 reject
creative_director: reviewed 11 asset(s) in 2 chunk(s) across 2 lane(s)
asset_reuse:   promoted 2 → site_1.png→s1-hook-1 (+22), site_0.png→s3-proof-1 (+21)
               100% of 7 slots covered (7 unique, 0 reuse, 0 decorative) · 1/1 critical
preflight:     12/13 passed · 1 warning
```

| | before (`ahtquvd86o`) | after (`1taphktp2w`) |
|---|---|---|
| assets | 9 | 9 |
| sources | 1 upload + 4 harvested + 3 shots + **1 stock** | 4 harvested + **5 shots**, 0 stock |
| smartcrop | **0/9** | **9/9** |
| quality grades | none | 3 hero / 5 high / 1 medium |
| preflight | 10/10 (old checks only) | 12/13 |
| QA blockers | **2** | **1** |

The before job's second blocker read *"Product UI asset is rendered as a tiny top inset while
secondary stock imagery dominates"* — verbatim the "good image, low visibility" symptom. **Gone.**

**Read this honestly:** the asset count did NOT rise, 9 → 9. The pin-suppression fix worked — it
created four stock wants where the old boolean created almost none, and all four were fetched —
but the Creative Director then **rejected** them, because razorpay.com's owned material is strong
and generic stock scored below the floor. That is the ranker being given a real choice and taking
the better one, which is the intended behaviour; it is *not* evidence that the count moves. A
thin-content site is the case that would show that, and it has not been run.

---

## 9. Files

**New** — `services/template_media.js`, `services/asset_quality.js`, `services/crop_engine.js`,
`scripts/apply-media-profiles.js`, `scripts/test-asset-prep.js`.

**Changed** — `agents/graph.js` (asset_prep node, media plan, parallel fetch, carried signals),
`services/asset_reuse.js` (plan-driven slots, quality promotion, variation guard),
`services/visual_layout_director.js` (clobber guard, quality in the blend),
`services/preflight.js` (three placeholder checks), `services/frame_manifest.js` (`media` schema +
boot validation), `services/asset_sources/index.js` (carry `sharpness`/`stdev`), `config.js`
(`assetPrep`), and the crop wiring in `om_port_kit`, `om_stage`, `scene_kit`, `grid_dispatch`,
`showcase`, `slab_stage`, `blueprint`, `motion_canvas`, `paper_craft`.

**Data** — all 46 `frames/*/pack.json` gained a `media` block.

**Dependencies** — `smartcrop`, `smartcrop-sharp`, `sharp` (already present transitively;
promoted to a direct dependency, with an ffmpeg fallback if it fails to load).
