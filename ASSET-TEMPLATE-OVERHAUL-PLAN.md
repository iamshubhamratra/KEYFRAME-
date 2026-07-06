# Asset Collection & Template System Overhaul Plan

Complete analysis of the Asset Collection Pipeline, Asset Placement Engine, Template
Selection System, and Template Architecture, with root causes and a phased
improvement plan. All claims are grounded in `file:line` references from the current
codebase (audited 2026-07-06).

---

## Part 1 — How the system works today (verified map)

### 1.1 Three parallel asset pipelines exist

| Path | Entry | Query construction | Safeguards |
|------|-------|--------------------|------------|
| **A** `/api/generate` direct | `pipeline.js:93 planAndFetchAssets` | LLM invents queries from storyboard (`asset_planner.js:37`) | **None** — no subject anchor, no vision gate, no dedup |
| **B** Project pipeline | `project_pipeline.js:218 acquireScriptAssets` | Script `assetNeeds[].query` (`script.js:17`) | Screenshots pinned; video downgrade; no dedup/vision |
| **C** LangGraph (default orchestrator) | `agents/graph.js:234 assetSearchAgent` | `assetNeeds` + derived queries, **subject-anchored** (`graph.js:294`) | MD5 dedup (`graph.js:271`), vision relevance gate (`asset_vision.js:47`) |

All three funnel into `asset_sources/index.js:46 acquire()` with provider order
`curated_library → local_db cache → pixabay → openverse → pexels → pixabay_scrape`.

### 1.2 Scoring, validation, placement — current state

- **Scoring** (`asset_sources/util.js:107-128`): keyword overlap in provider tags ×0.65
  + resolution ×0.35. Untagged results get a flat 0.35 — effectively unranked.
- **Validation** (`util.js:41-67`): ffprobe decode + dims>0 + 5KB floor + 900px long
  edge. Nothing else (see gaps in §2.2).
- **Placement** (`scene_kit.js:890-962`): three-pass weaving — first screenshot →
  hero, ≥3 leftovers → one montage, next vector/photo → split, remainder → scrimmed
  B-roll. Priority-order, **not** intent-driven.
- **Archetypes** (`scene_kit.js:857-864`): only first/last/numeric are distinguished;
  `bullet|quote|caption|shape-motion` all collapse to generic `archText` (4 variants).
- **Templates**: 14 packs on disk (UI still says "Ten", `CreateScreen.jsx:303`). A
  pack's identity is smeared across ~5 hard-coded tables in 3 files: `FRAME.md`,
  `FLAT_PACKS` (`scene_kit.js:30`), `LIGHT_GRADIENT_PACKS` (`:37`), `PACK_SKINS`
  (`:45`), `PACK_VIBES` (`brief.js:38`), `PACK_LORE` (`web/src/packlore.js:6`).

---

## Part 2 — Root causes of current quality issues

### 2.1 Why assets are irrelevant (Discovery)

1. **Path A has zero safeguards.** `/api/generate` trusts raw LLM queries
   (`asset_planner.js:37` just length-clamps) with no subject anchor, no relevance
   verification, no dedup. The "random off-topic assets" symptom lives here.
2. **`CURATED_ONLY_IMAGES` is a dead flag (bug).** `graph.js:300` passes
   `curatedOnly` into `acquire()`, but `index.js:46` never destructures it. Web
   stock is fetched even when the operator believes it's off.
3. **Shallow scoring.** Keyword-overlap on provider tags only; no semantic
   similarity, no style match, no brand-color affinity.
4. **Subject anchoring exists only in path C**, and only for photos
   (`graph.js:294`). Fallback query broadening is mechanical word-dropping
   (`pipeline.js:48`).
5. **Curated library is domain-locked** to business/finance/tech via hardcoded
   `SYNONYMS` (`curated_library.js:60`); beauty/food/fitness prompts get nothing
   curated and lean entirely on unvetted web stock.
6. **Icon supply is thin**: only the curated SVG library or Pixabay vectors. No
   icon-set API, no brand-logo source beyond the site scrape.

### 2.2 Why bad assets slip through (Validation)

- **No aspect-ratio verification** after download (orientation is requested from
  providers but never checked).
- **No transparency/alpha check** for icon/vector roles — an opaque JPEG can fill a
  "vector" slot; classification is by pack-name regex (`curated_library.js:24`).
- **No watermark detection** — `pixabay_scrape.js` CDN previews can carry them.
- **Dedup is exact-MD5 only, path C only** — visually identical re-encodes pass.
- **Vision gate runs only in path C, serially, fail-open** (`graph.js:319`).

### 2.3 Why composition looks random (Placement)

1. **No collision/overlap detection anywhere.** `data-layout-allow-occlusion`
   appears 14× in scene_kit to *suppress* the renderer's only occlusion lint.
2. **Placement ignores scene intent.** Pass 1 (`scene_kit.js:932-948`) assigns
   hero/montage/split by pool order and iteration order — the screenshot lands on
   whatever content scene comes first, not the scene whose narrative calls for it.
3. **Clutter stacking.** One scene can carry: background depth tracks 0-3 + canvas
   FX + skin ornaments + set-dressing decorSvg + enrich's *global* particle/ring
   floor (`enrich.js:175-260`, applied on every frame of every video including
   scene-kit output at `pipeline.js:376`). None of these layers coordinate.
4. **Binary aspect handling** (`land = w>=h`), fixed font sizes, `ch`-based boxes,
   no text-fit measurement — long headlines overflow with nothing catching it.
5. **`archStat` misfires**: `pickNumber()` regex (`scene_kit.js:847`) turns "24/7
   support" into a giant "24" counter.

### 2.4 Why template identity is lost (the big one)

1. **`/generate` pre-resolves `"auto"` → `blockframe`** (`routes/generate.js:94`),
   so `frameSelectorAgent` (`graph.js:97`) never reaches the brief's
   `suggestedFramePack`. The entire tone→pack matching + `recentFramePacks`
   rotation in `brief.js` is **dead code** for the main route. Every "auto" video
   is blockframe.
2. **Typography is erased globally.** `normalize.js:32-41` rewrites every
   `font-family` to a safe stack on the LLM path; scene-kit's `RESOLVABLE`
   whitelist (`scene_kit.js:134`) drops pack display fonts. Fable's serif,
   Kinetic's type-driven identity: gone at render time.
3. **Only 4 of 14 packs have deep identity.** `PACK_SKINS` (`scene_kit.js:45`)
   gates ornaments, pinned accents, emphasisCss, and the scene-kit 3D layer. The
   other 10 packs = colors + a name-regex-picked canvas FX (`fxModeFor`
   `scene_kit.js:175` — unknown packs fall through to generic `bokeh`/`confetti`).
4. **FRAME.md prose is only read by the opt-in LLM composer.** The deterministic
   default path ignores composition rules, motion guidance, and scene treatments
   authored in every FRAME.md.
5. **Theme derivation overrides pack intent.** `enrich.js:58 themeFromTokens`
   re-sorts colors by luminance/saturation, ignoring authored roles; low-contrast
   accents are replaced with hard-coded `safeBright` hexes (`scene_kit.js:119-122`).
   (A second, divergent `themeFromTokens` lives in `fallback.js:78`.)
6. **The flagship 3D path is pack-blind.** `three_composer.js:48-57` keeps only
   accent hexes and forces a fixed dark ground; treatments, camera, bloom are
   global. Fallback comps (`fallback.js:184,402`) are similarly pack-blind, and QA
   only checks palette presence (`qa_agent.js:90`).
7. **Adding a pack today = ~13 edit sites across 5 files** (FRAME.md, showcase,
   previews, 4 scene_kit tables + 3 scene_kit functions, packlore, PACK_VIBES).
   There is no single registry or schema — this is why the library is stuck at 14.

---

## Part 3 — Improvement plan

### Phase 0 — Bug fixes & unification (days, highest ROI) — ✅ IMPLEMENTED 2026-07-06

Status of each item (see git diff for the exact edits; all changes are behind the
existing fail-open/degrade-gracefully guarantees):

1. ✅ **Dead `curatedOnly` flag fixed** — `acquire()` (`asset_sources/index.js`)
   now destructures `curatedOnly` and returns null after the curated pass,
   skipping the web-stock cache AND providers. Verified with a stubbed
   cache/provider harness (flag set → 0 cache/provider calls; flag clear →
   both reached).
2. ✅ **Auto-resolution bug fixed** — the premature `resolvePack("auto")` was
   already gone from `routes/generate.js` (stores null), but the short-circuit
   had **relocated** into `graph.js frameSelectorAgent`: `resolvePack(null)`
   returns the default pack, so the brief's `suggestedFramePack` was never
   consulted. Rewrote the selector so only an explicit, installed user pick wins
   first; `auto`/null/stale ids now defer to the brief before the default.
   Verified with a decision table (auto+brief → brief pick; explicit → user;
   stale id → brief).
3. ✅ **Path A raised to path-C quality** — `/api/generate` (`pipeline.js
   planAndFetchAssets`) now receives the brief's `subject`, anchors image
   queries to it (plain query kept as fallback), de-dupes fetched files by MD5,
   and runs the batched vision gate on web stock. `runJob` captures
   `briefSubject` and threads it in. (Path B / project pipeline is not the
   default orchestrator; left for the unification in later phases.)
4. ✅ **Vision gate batched** — new `checkAssetsRelevance()` in `asset_vision.js`
   classifies web stock in chunks of 6 per call (was one LLM call per asset,
   serial). Wired into both path C (deferred single batch after the fetch loop,
   replacing the per-asset gate) and path A. Same fail-open contract (dead
   budget / un-thumbnailable / missing verdict → keep). Fail-open branches
   unit-verified.
5. ✅ **Pexels env key** — `config.js` now honors `PEXELS_API_KEY`/`PEXELS`
   (parity with `PIXABAY_API_KEY`).
6. ◑ **Pack-count copy** fixed (`CreateScreen.jsx` now renders `{packList.length}`
   dynamically instead of the stale "Ten"; packlore header comment corrected).
   Generating `PACK_LORE` from the registry (removing the parallel hand-table)
   is deferred to the Phase 3 manifest work, where the single source of truth
   is introduced.

### Phase 1 — Asset validation layer — ✅ IMPLEMENTED 2026-07-06

**Deviation from the original sketch:** built on **ffmpeg/ffprobe, not `sharp`.**
`sharp` was not installed and is a heavy native module that risks build/deploy
failures on the Render/Oracle/EB targets; ffmpeg/ffprobe are already hard
dependencies used for every media step, and do everything Phase 1 needs. Zero new
npm dependencies. All new code lives in `asset_sources/util.js` and is verified by
a harness that generates real fixtures with ffmpeg (`scratchpad/verify_phase1.js`).

Implemented:

- ✅ **Real dims / ratio / alpha recorded** — `validateImage()` runs `ffprobe`
  (width/height/pix_fmt) and attaches `{width,height,ratio,hasAlpha}` to every
  provider image, flowing onto the asset manifest in both paths (enables the
  Phase 4 fitting work). Orientation is *recorded*, not hard-rejected (a
  landscape photo is still usable as a background), which avoids false rejects.
- ✅ **Alpha check for icon/vector roles** — an opaque raster served for a
  `kindPref:"vector"` need is rejected (`pix_fmt` has no alpha channel); SVGs are
  vectors and always pass. Verified (opaque JPG → rejected, RGBA PNG → ok).
- ✅ **Perceptual dedup replaces MD5-only** — `makeImageDeduper()` combines exact
  MD5 with a 64-bit **dHash** (9×8 grayscale via one ffmpeg pass) at Hamming ≤ 10,
  so a visually-identical *re-encode* (different bytes, same picture) is caught.
  Wired into both path C (`graph.js`) and path A (`pipeline.js`), seeded with the
  pinned screenshots. Verified: a re-encoded photo is flagged `perceptual`, a
  different image is not.
- ✅ **Low-information rejection** — near-flat images (solid colour, blank/error
  placeholders) are rejected via the grayscale standard deviation of the same
  dHash thumbnail (`stdev < 5`). Verified (solid grey → rejected, photo → ok).
- ✅ **Watermark mitigation (lightweight)** — the batched vision gate prompt now
  also rejects assets with a visible watermark / stock-site logo / "sample"
  overlay. Zero added cost (those thumbnails are already sent). The heavier
  corner-crop approach was unnecessary given the model already sees the image.
- ◑ **Stretch/upscale (blur/Laplacian) detection — deferred.** Highest false-reject
  risk and lowest ROI; the existing `MIN_LONG_EDGE=900` floor plus now-verified
  real dimensions cover the common case. Revisit if soft-upscaled stock shows up
  in practice.

New `util.js` API: `validateImage(absPath,{kindPref})`, `makeImageDeduper()`,
`imageDHashStats()`, `hammingHex()`, `pixFmtHasAlpha()`.

### Phase 2 — Relevance scoring & discovery upgrade — ✅ IMPLEMENTED 2026-07-06

Focused on the high-ROI, deploy-safe wins; the CLIP-embedding items are provided
as an opt-in module rather than forced onto the lean deploy (same reasoning as the
Phase 1 sharp→ffmpeg call). Verified by `scratchpad/verify_phase2.js` (incl. a
live Iconify end-to-end through `acquire()`).

- ✅ **Iconify provider (headline)** — `asset_sources/iconify.js`: keyless,
  open-licensed SVG icons (Lucide/Tabler/Phosphor/Solar/Material Symbols) for
  vector/icon needs, recolored to the pack accent via `?color=`, with the
  collection family chosen per pack style. Wired into `acquire()` as a dedicated
  step for `kindPref:"vector"` — after the curated library, before web stock —
  writing `.svg` directly (SVG-native, bypasses the ffprobe raster gate). This
  fixes the "thin icon supply" root cause. Verified live (`"rocket" → lucide:rocket`,
  colored SVG on disk).
- ✅ **Structured query building with pack style** — `pack_style.js` maps each of
  the 14 packs to a photo modifier, an Iconify collection family, and style
  keywords (a bridge until the Phase 3 manifest supplies these from FRAME.md).
  Photo queries in BOTH paths now = `[subject anchor] + [scene noun] + [pack
  style]`, with the un-styled query kept as a fallback so an over-narrow phrase
  still resolves.
- ✅ **Scoring upgrade** — `scoreCandidate`/`rankCandidates` gained an optional
  style-match term: `0.5·keyword + 0.25·quality + 0.25·style-match` when a pack's
  style keywords are supplied (exact legacy `0.65/0.35` blend when not). On-brand
  stock now outranks generic matches of equal relevance. Verified (a "clean" pack
  surfaces the clean shot; a "neon" pack the neon shot).
- ◑ **Semantic CLIP embeddings (items 2/5/6) — opt-in module, not wired.**
  `embeddings.js` provides `available()`/`embedText()`/`cosine()` guarded by
  `USE_ASSET_EMBEDDINGS=1` + a try-require of `@huggingface/transformers` (NOT a
  package.json dep — onnxruntime + a runtime model download is a real deploy
  cost). Default: `available()===false`, everything degrades to keyword+style
  ranking + the existing vision gate (which already provides semantic
  *filtering*). Left unwired to avoid untested branches in the hot path; the
  integration points (curated re-rank, pool-centroid outlier drop) are documented
  in the module header for the follow-up that installs the dep.
- ◑ **Brand-color affinity (item 3) — deferred to Phase 4.** Needs per-candidate
  dominant color, which means overfetch + post-download analysis; it composes
  naturally with the Phase 4 fitting/placement work and the `ratio`/dims already
  recorded in Phase 1.
- ◑ **Curated-library generalization (item 5) — deferred.** The clean version
  needs the embeddings above (text-similarity over curated keywords); the sync
  `curated_library.search` would need an async refactor to call them. Deferred
  with the embeddings wiring.

New modules: `asset_sources/iconify.js`, `pack_style.js`, `embeddings.js`.

### Phase 3 — Template architecture: one manifest, all paths (weeks 2–4)

**Goal: a pack is ONE machine-readable spec consumed by every render path.**

**◑ FOUNDATION SHIPPED 2026-07-06** (additive / read-through — NO render-path
behavior change yet). What landed:

- **Schema + loader** — `server/src/services/frame_manifest.js`: a zod
  `PackManifestSchema` (every field defaulted, `.passthrough()` for forward
  fields) + `getManifest(name)` (mtime-cached, validated, **fail-soft → null** so
  callers keep legacy behavior) + `listManifests()`.
- **14 faithful manifests** — `frames/<pack>/pack.json`, a verbatim extraction of
  today's scattered tables: `colors`/`fonts` (FRAME.md via frame_registry),
  `vibe` (brief PACK_VIBES), `surface.flat`/`lightCinematic` (FLAT_PACKS /
  LIGHT_GRADIENT_PACKS as raw set-membership — consumer recomputes
  `gradients=!flat`, `lightGround=flat||lightCinematic` identically),
  `motion` (PACK_MOTION), `fx.canvas` (fxModeFor) + `fx.three` (PACK_SKINS.three),
  `skin` (PACK_SKINS accents/extras/emphasisCss), `assets` (pack_style).
- **Verified** — 211 assertions (`scratchpad/verify-manifests.js`) round-trip every
  field against the live `pack_style` + `frame_registry` modules and the scene_kit
  sets; all green. Bootstrap generator (`scratchpad/bootstrap-pack-manifests.js`)
  validates each manifest against the schema before writing.
- **✅ getPackVibe bug fixed + first consumer wired (commit 7901d59):**
  `frame_registry.getPackVibe()` used to return just `">"` for the **7 packs**
  whose FRAME.md uses a YAML folded scalar (`description: >`) — brief.js
  tone-matching and set_dressing saw garbage for half the library. Now parses the
  folded block → real prose for all 14. `brief.js availableFramePacks` now reads
  `manifest.vibe` first (source of truth; folds in the curated PACK_VIBES blurb
  for the 7 that have one, FRAME.md description for the rest), legacy tables only
  as fail-soft fallback.
- **✅ scene_kit render hot path wired to the manifest (commit 2b8be23):**
  `deriveTheme` reads `surface.flat`/`lightCinematic` + `skin` from the manifest;
  `theme.manifest` is threaded into `motionFor` (→ `motion`), `buildCanvasFx`
  (→ `fx.canvas`), and `buildThreeFx` (→ `fx.three`). The legacy FLAT/LIGHT/
  PACK_SKINS/PACK_MOTION/fxModeFor tables remain as fail-soft fallback for a pack
  with no/invalid manifest. **Verified behavior-preserving two ways:** (1) a
  deterministic golden diff — `buildComposition` output is **byte-identical**
  across all 14 packs vs the pre-wiring baseline (`scratchpad/render-golden.js`,
  sha256 of indexHtml+meta); (2) a **real end-to-end render** — summit-keynote
  (light ground, cobalt→gold emphasis gradient, corner ornaments, live three.js
  data-constellation WebGL layer) rendered to a correct 4s MP4 via
  `hyperframes render` (120 frames, exit 0).
- **Not yet done (next increments):** wire `pack_style` reads to the manifest, the
  typography-eraser fix,
  ornaments-as-data, single `themeFromTokens`, pack-aware 3D, QA identity checks.
  Note: `colors` are duplicated in FRAME.md and pack.json during the transition.

Remaining Phase 3 scope (unchanged):

Extend FRAME.md frontmatter (or add `frames/<name>/pack.json`) to a full schema:

```yaml
name: fable-storybook
vibe: "Hand-inked parchment storybook…"
colors: { ground: "#F6EEDD", ink: "#2B1F14", accents: [...] }   # named roles, authored order is law
typography:
  display: { family: "Fraunces", fallback: "Georgia, serif", weight: 700, case: none, tracking: 0 }
  body:    { family: "Inter", ... }
  webfonts: ["fraunces@700"]            # self-hosted via @fontsource → renderer loads them
motion:
  ease: "power2.inOut"                  # pack-level GSAP ease token
  enterStyle: fade-drift | snap | mask-reveal
  transition: crossfade | hard-cut | wipe | pixelate
fx: { canvas: ribbon, three: paper, density: low }              # replaces fxModeFor name-regex
skin: { emphasisCss: "...", ornaments: [corner-flourish, underline-brush] }  # data, not code branches
layout:
  margins: { x: 0.08, y: 0.10 }        # true safe areas
  density: airy | balanced | packed
  preferredArchetypes: { quote: archQuoteCard, feature: archSplitVector }
assets:
  styleModifiers: ["watercolor", "illustrated", "soft light"]   # appended to search queries
  prefer: [illustration, photo]         # media-type ranking for this pack
  avoid: ["neon", "glass", "corporate"]
  iconSet: "solar"                      # Iconify set
camera3d: { ground: "#F6EEDD", treatmentBias: [reveal, orbit], bloom: 0.4 }
```

Refactors this enables (each removes a dilution point from §2.4):

- `FLAT_PACKS` / `LIGHT_GRADIENT_PACKS` / `PACK_SKINS` / `fxModeFor` /
  `buildThreeFx` branches / `PACK_VIBES` / `PACK_LORE` → **all read from the
  manifest**. Adding a pack = 1 folder, 0 code edits.
- **Fix the typography eraser**: self-host pack webfonts with `@fontsource/*`
  packages, serve from `server/public/fonts/`, inject `@font-face` into comps;
  `normalize.js` whitelist becomes "fonts declared by the active pack + safe
  stack", not "safe stack only".
- **Ornaments as data**: a small library of parameterized ornament builders
  (corner brackets, rules, blobs, brush strokes) selected/colored by manifest,
  so all packs get skin depth, not just 4.
- **Single `themeFromTokens`**: respect authored color roles; delete the
  divergent copy in `fallback.js`; make fallback comps consume the manifest so
  even failure modes keep pack identity.
- **Pack-aware 3D**: `three_composer.js` reads `camera3d` (ground color,
  treatment bias, bloom) instead of the fixed `#05060E` dark look.
- **QA identity checks**: extend `qa_agent.js` prompt with the manifest's
  typography + ornament expectations, not just palette.

### Phase 4 — Intent-driven placement engine (weeks 3–5)

1. **Purpose-per-asset assignment**: replace the pool-order Pass 1 with a
   scored bipartite match: each scene declares needs from its storyboard `kind`
   + `visualDirection` (product-shot / proof / concept / decoration), each asset
   carries type + embedding + dims; assign via greedy max-score (Hungarian if
   needed — pools are small). The screenshot goes to the *feature/proof* scene,
   not the first one.
2. **Richer archetype set**: add `archQuoteCard` (testimonial), `archFeatureRow`
   (icon + text bullets), `archComparison`, `archTimeline`, `archLogoWall`,
   `archDeviceDuo`; map storyboard kinds properly instead of collapsing to
   `archText`. Extend the storyboard schema (`system_storyboard.md:36`) with
   `testimonial|feature|comparison` kinds.
3. **Real safe-area + overlap budget**: manifest margins define the content box;
   compute per-element boxes at build time (text measured with `string-width` ×
   font metrics, or a headless measure pass) and enforce: no two content boxes
   intersect, decorative layers only outside the content box. Replace
   `data-layout-allow-occlusion` suppression with actual geometry.
4. **Decoration coordinator**: one "visual load" score per scene (background FX
   + ornaments + set-dressing + enrich floor each add weight); cap it. When
   scene-kit already provides FX, enrich's global `#__kf_fx` floor should skip
   or thin out (make `enrich.js` density-aware instead of always-on).
5. **Text auto-fit**: measure headline vs box, step font size down / wrap before
   overflow; fixes the binary-aspect + `14ch` overflow class of bugs. Fix the
   `pickNumber` "24/7" misfire with a stricter standalone-metric regex.

### Phase 5 — Template library scale-out to 50–100 (weeks 4–8)

With Phase 3, a template = one manifest + optional showcase. Scale strategy:

1. **Parameterized families, not one-offs.** Define ~12 base families
   (Corporate Clean, SaaS Gradient, Startup Bold, Editorial Serif, Dark Glass,
   Neo-Brutal, Cinematic Noir, Illustrated Story, Retro Terminal, Fintech Grid,
   Healthcare Soft, Data-Viz Mono). Each family × 4–8 palette/type/motion
   variants = 50–100 packs generated as manifest permutations — same rendering
   code, real variety.
2. **Category coverage** maps to the requested list: SaaS explainers → SaaS
   Gradient + Corporate; AI demos → Dark Glass + Retro Terminal + prism-launch
   3D; social ads → Startup Bold portrait-tuned variants; finance → Fintech
   Grid; healthcare → Healthcare Soft; e-commerce → Illustrated + product-hero
   biased layout; education → Editorial; enterprise → mono-corporate family;
   data-viz → Data-Viz Mono with chart-first archetypes; app showcases →
   device-frame-biased `archScreenshotHero`/`archDeviceDuo` layout weights.
3. **Authoring tool**: a `scripts/new-pack.js` generator that takes a family +
   palette + font and emits manifest, FRAME.md prose, showcase HTML, and preview
   render (reuse the existing render pipeline for `preview.mp4`/`poster.jpg`
   that `frames.js:36` expects). Validate manifests with a zod schema at server
   boot so a bad pack fails loudly.
4. **Golden-frame regression**: render one canonical brief per pack in CI,
   screenshot 3 frames, perceptual-diff against goldens — protects template
   identity from future "safety net" layers like enrich silently flattening
   packs again.

### Phase 6 — Asset-to-template matching (with Phases 2+3 in place, ~1 week)

This falls out of the manifest + scoring work:

- **Query time**: append `assets.styleModifiers` to search queries; select
  `iconSet`; rank media types by `assets.prefer`.
- **Scoring time**: style-match term = embedding similarity between candidate
  and the pack's style prompt ("holographic glowing interface, dark, neon" for
  a futuristic pack; "clean professional photography, natural light" for
  corporate) + palette distance to pack colors.
- **Placement time**: pack `layout.preferredArchetypes` and density bias which
  archetypes/assets are used (a corporate pack takes 1 hero + icons; a launch
  pack takes montage + full-bleed B-roll).

---

## Part 4 — Tools, libraries, and sources (all budget-compatible)

| Need | Recommendation | Notes |
|------|----------------|-------|
| Semantic asset scoring | `@xenova/transformers` + SigLIP/MobileCLIP | Local CPU inference, $0, cache embeddings in local_db |
| Perceptual dedup | dHash/pHash via `sharp` + `imghash`/blockhash | Hamming ≤8 = dup |
| Image inspection (alpha, dims, blur) | `sharp` | Already the Node standard |
| Icons | Iconify API (`api.iconify.design`) | 200k+ icons, keyless, `?color=` recoloring |
| Illustrations | unDraw (recolorable SVG), curated packs | Fits illustrated/story templates |
| Stock (existing) | Pexels/Pixabay/Openverse APIs | Keep; add Pexels env key; demote scraper to last resort with watermark check |
| Webfonts | `@fontsource/*` self-hosted | Fixes the typography eraser; deterministic renders, no CDN |
| Pack schema validation | `zod` (already in repo, see `script.js`) | Fail loudly at boot |
| Layout measurement | headless measure pass in existing renderer, or `satori`-style text metrics | Enables overlap enforcement |
| Vision relevance gate | existing `asset_vision.js`, batched | Keep fail-open + logging |
| Visual regression | `pixelmatch` + existing screenshot path | Golden frames per pack |

## Part 5 — Suggested order of execution

1. **P0 fixes** (dead flag, auto→blockframe, unify pipelines, batch vision) — days, immediately improves relevance and revives template rotation.
2. **P1 validation** — kills the worst visible defects (dupes, stretched, wrong-orientation).
3. **P2 scoring/discovery** — embeddings + Iconify + style modifiers.
4. **P3 manifest architecture** — unlocks everything template-related.
5. **P4 placement engine** — intent matching + overlap enforcement + decoration budget.
6. **P5 library scale-out + P6 matching** — the 50–100 template goal, cheap once P3 lands.
