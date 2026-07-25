# Asset Collection Pipeline — Complete Audit & Redesign

> End-to-end architectural audit of KEYFRAME's asset-collection pipeline, grounded in
> the current `Rohit`-branch code (file:line), with root causes, a redesign, and a
> phased roadmap. **This document consolidates and extends five existing plan docs**
> rather than re-deriving them — it is the single map of *what exists, what shipped,
> and what is genuinely missing*.
>
> Companion docs (read alongside): `WEBSITE-ASSET-INTELLIGENCE-PLAN.md`,
> `ASSET-PIPELINE-IMPROVEMENT-PLAN.md`, `ASSET-TEMPLATE-OVERHAUL-PLAN.md`,
> `BRAND-COLOR-SYSTEM-PLAN.md`, `RESPONSIVE-VIDEO-SYSTEM.md`.

---

## 0. Executive summary — the honest headline

The asset pipeline is **not an unbuilt system that needs a redesign; it is a mostly-built
system with a small number of un-wired parts and two genuinely-missing features.** Every
one of the eight reported problems maps onto an existing plan doc on this branch, and
several are already shipped and verified. Reframing the work this way avoids rebuilding
what exists and focuses effort where it actually moves quality.

**The two things that exist nowhere and are the real net-new work:**

1. **Duration-adaptive asset quantity (Problem #2).** No plan, no code. Every asset cap
   is a fixed literal; a 120 s film gets the same ~8 vectors / 12 photos as a 15 s film.
   This is the single clearest gap and the cheapest high-impact fix. → §4.
2. **A *blocking* pre-render validation gate (Problem #8).** A validation layer exists
   (`asset_usage_report.js`, `asset_coverage.js`, `brand_coverage.js`), but it is
   **deliberately non-blocking** — the codebase's cardinal law is *"a disclosure never
   blocks a render."* Turning it into something that "refuses to ship a poor video"
   is a philosophy change, not a bug fix. → §5.

**Three specific defects my audit surfaced that are *not* in any existing plan:**

3. **`scene_kit.js` discards the Creative Director's per-asset scene assignment.** The CD
   (a vision LLM) already computes semantic `sceneId`/prominence per asset; the ~30 native
   composers honor it, but the default scene-kit re-derives placement from a kind-pool
   weave and **never reads `a.sceneId`** (grep: 0 matches). This is the root of
   "assets feel random." → §7.
4. **The scene-purpose→asset-kind table already exists as dead code.**
   `asset_taxonomy.PURPOSE_KIND` (`hook→photo, feature→screenshot, proof→people,
   data→vector, cta→icon`) is exactly Problem #5's spec, authored and exported, but
   **never imported.** Wiring it is the fix. → §7.
5. **No blur/sharpness detection exists** (Problem #3). `screenshot_intake` does blank
   (`stdev<5`) + dedup only; all crop/popup/cookie/loading rejection rides on the CD
   *vision* call. `ASSET-TEMPLATE-OVERHAUL-PLAN.md:192` already lists blur/Laplacian as
   **deferred** (highest false-reject). → §6.

Everything else the user asked for — the "Asset Intelligence Agent," semantic
scene-to-asset mapping, 9:16 fixes, brand-color-across-surfaces, a validation framework —
**already exists in whole or in part** and is catalogued below with its true status.

---

## 1. Master status map — your 8 problems vs reality

| # | Problem (as reported) | What already exists (file) | Owning plan | Genuine remaining gap |
|---|---|---|---|---|
| 1 | Website asset collection incomplete | `ingest/website_assets.js` harvester (logo/hero/product/screenshot/team/marketing/illustration/icon/decorative/image), favicon discovery (`:360`), OG image, SSRF-safe fetch, CSS brand palette + font names | `WEBSITE-ASSET-INTELLIGENCE-PLAN.md` | Harvester **OFF by default** (`WEBSITE_HARVESTER`); no **public video** harvest; no **mobile-viewport** screenshots; typography captured as **name-only**, not a usable render token |
| 2 | Fixed asset quantity, not duration-aware | Per-category caps + gap-fill want-list (`graph.js:315-351`) | **none** | **Everything.** No `job.duration`→count formula anywhere → §4 |
| 3 | Need an Asset Intelligence Agent | `creative_director.js` (CLIP prescore + 6-dim vision score + reject/delete + scene assign + prominence + screenshot-QA demotes), `visual_layout_director.js`, `screenshot_intake.js`, `asset_vision.js` | `ASSET-PIPELINE-IMPROVEMENT-PLAN.md`, `ASSET-TEMPLATE-OVERHAUL-PLAN.md` | **Blur/sharpness** detection (deferred); a **unified 10-category taxonomy** (today split across 3 classifiers); exposed **confidence** scores → §6 |
| 4 | Intelligent asset *selection* | CD `cdProminence` (hero/support/background) + `maxPerScene` cap + never-zero rescue + bounded top-up | `ASSET-PIPELINE-IMPROVEMENT-PLAN.md` | Selection pool is duration-blind (see #2); mandatory-logo already handled | 
| 5 | Scene-to-asset mapping is random | Per-scene retrieval (`sceneId` at birth), CD semantic `assignScene`, native composers honor it, `assetAffinity` (screenshot/vector/photo) | `ASSET-PIPELINE-IMPROVEMENT-PLAN.md` §1.4 | **scene-kit ignores `sceneId`**; `PURPOSE_KIND` table **dead**; no `data→dashboard`/`proof→people` path → §7 |
| 6 | 9:16 asset placement broken | `responsive.js` + flagship + brightlife + scene-kit **portrait-native & verified** | `RESPONSIVE-VIDEO-SYSTEM.md` | 5 native-GSAP composers still row-locked; VLD portrait plan; responsive-QA gate; `heroBox` still unused in scene-kit → §8 |
| 7 | Brand color only recolors text | `brand_kit.resolveBrand` (full `gradients`/`ui`/`three`/`chart`/`slots` bundle, WCAG-correct), consumed for accents + flagship/native reHue | `BRAND-COLOR-SYSTEM-PLAN.md` | The **`ui`/`chart`/`gradients.primary`/`slots`/`cssVarBlock` bundle is computed but unconsumed on scene-kit** ("dead bundle"); per-pack contracts + atmosphere tier → §9 |
| 8 | Need a validation layer that refuses to ship | `asset_usage_report` (7-check gate), `asset_coverage` (+ one self-heal), `brand_coverage`, `runLanguageQa` | `WEBSITE-ASSET-INTELLIGENCE-PLAN.md` §16 | All **non-blocking by law**; no hard-fail/diagnostic-report path → §5 |

**Read this table before writing any code.** ~60% of the request is "finish wiring what
exists"; ~25% is "complete an in-flight plan"; ~15% is genuinely new (#2, blocking #8, blur).

---

## 2. Current architecture — where every asset decision lives

There are **three parallel asset-collection paths**, and they disagree on caps — a
consolidation opportunity in its own right:

```
                       ┌─ (A) graph.js  assetPlannerAgent → assetSearchAgent   [ACTIVE, orchestrator=langgraph]
 script.scenes[] ──────┼─ (B) project_pipeline.js  acquireScriptAssets        [legacy runProduction path]
                       └─ (C) asset_planner.js  planAssets (LLM want-list)     [legacy pipeline.runJob / /api/generate]
                                    │
                                    ▼
                       asset_sources/index.js  acquire()  ── curated → bridge-vector → iconify → cache → stock providers
                                    │
                                    ▼
        creative_director.js  directAssets()  ── CLIP prescore → vision score → reject/delete → assignScene → prominence
                                    │
                                    ▼
        visual_layout_director.js  directLayout()  ── deterministic presentation (heroScale, montageMax, cropFocus, demote)
                                    │
                                    ▼
        scene_kit.js  buildComposition()  ── kind-pool weave (IGNORES sceneId)   |  native composers (HONOR sceneId)
```

**Cap inventory (all fixed, none duration-aware):**

| Cap | Path A (graph) | Path B (project) | Path C (planner) |
|---|---|---|---|
| user uploads | 6 (`graph.js:275`) | 6 (`:397`) | — |
| screenshots | 2–3 (`:286`) | 2–3 (`:403`) | — |
| harvested brand | 2–4 (`:298`) | 2–4 (`:410`) | — |
| stock video | 2 (`:347`) | 1 (`:442`) | 1 (`:77`) |
| stock vector | 8 (`:350`) | — | — |
| stock photo | 12−video (`:351`) | 6−video (`:443`) | 14 (`:66`) |
| CD per-scene prominent | 2 (`config.js:228`) | 2 | 2 |
| CD net-new top-up | 3 (`config.js:229`) | 3 | 3 |

The three paths hard-code **different** photo ceilings (12 vs 6 vs 14). Any duration
formula must either be applied in all three or (better) centralized first (§4).

---

## 3. Per-problem root-cause analysis (grounded)

### Problem #1 — Website harvesting
- **Current:** `harvestSiteAssets` (`ingest/website_assets.js`) discovers candidates
  (jsonld-logo > logo/brand class > og/twitter > svg > img, then area), caps to 24,
  fetches SSRF-guarded, sniffs magic bytes, sanitizes SVG. `classify()` emits 10
  `assetType`s: `logo, hero, product, screenshot, team, marketing, illustration, icon,
  decorative, image`. Favicons/apple-touch/mask-icons **are** discovered (`:360`).
- **Root cause of "incomplete":** (a) the whole harvester is **opt-in**
  (`config.harvester.enabled`, default false — it fetches remote bytes from a
  user-supplied URL, a live SSRF surface). When off, only `website.js` screenshots +
  `dominantColors` + `ogImage` run. (b) The fetch allowlist is **images only** — no
  `<video>`/`og:video` path. (c) `website.js` captures **desktop** hero + 2 sections at
  `deviceScaleFactor:2`; there is **no mobile-viewport pass**. (d) Fonts are captured as
  **names** (`discoverBrandSignals`), never turned into an embeddable `@font-face` token.
- **Genuine gaps:** public videos; mobile screenshots; typography-as-token; and a
  decision on turning the harvester on by default.

### Problem #2 — Adaptive quantity → §4 (net-new).

### Problem #3 — "Asset Intelligence Agent"
- **Already exists** as `creative_director.js` (`directAssets`): CLIP relevance pre-score
  (`asset_clip.js`), batched 6-dimension vision scoring, `cdScore` (numeric confidence),
  `cdProminence` (hero/support/background), reject-and-delete of web stock, semantic
  `assignScene`, `sectionType`, never-zero rescue, bounded top-up, and screenshot-QA
  demotion (popup/loading/broken via `popupDemotePct`, `demoteOnIncomplete`). `screenshot_intake`
  adds deterministic blank + dedup prune.
- **Root cause of "not intelligent enough":** the intelligence is real but (a) **gated on
  `CREATIVE_DIRECTOR` + vision budget** (fail-open: any error passes assets through
  unreviewed); (b) categorization is **split across three classifiers** with different
  taxonomies (`assetType` in harvester, `cdProminence`+`sectionType` in CD,
  `assetType`+quality in `user_assets`) — no single 10-category label; (c) **no blur/
  sharpness gate** — a soft/upscaled image only gets caught if the CD vision pass happens
  to notice.
- **Genuine gaps:** deterministic blur/sharpness detection; one unified category
  taxonomy; and *formalizing* the CD+VLD+screenshot_intake trio as a named "Asset
  Intelligence" stage for legibility (see §6 — this is largely renaming + gap-filling,
  not a new agent).

### Problem #4 — Intelligent selection
- **Already exists:** `asset_priority.rankKey` (tier-first: upload>brand>screenshot>
  harvested>curated>stock), CD `maxPerScene` demotion, mandatory-logo handling (logo is a
  *role*, pinned to opening chip + CTA lockup, never a pool asset), never-zero rescue.
- **Gap:** the *pool* the selector chooses from is duration-blind (Problem #2), so on long
  films there simply aren't enough approved assets to select from. Fix #2 and selection
  quality follows.

### Problem #5 — Scene-to-asset mapping → §7.

### Problem #6 — 9:16 → §8.

### Problem #7 — Brand color → §9.

### Problem #8 — Validation → §5.

---

## 4. NET-NEW: Adaptive asset quantity

**Goal:** total approved-asset budget scales with duration and scene count, matching the
target table, while keeping video count low (a real render-budget guard — 2+ concurrent
videos push Chromium renders past 480 s, per `asset_planner.js:75`).

### 4a. New module `server/src/services/asset_budget.js`

```js
// Pure, deterministic, no I/O. The single source of truth for "how many assets".
// target table: 30s→8-15, 60s→20-35, 90s→35-50, 120s→50-70 (midpoints ≈ 0.5/sec)
function computeAssetBudget({ durationSec, sceneCount, hasUploads, videoOk }) {
  const d = Math.max(5, Number(durationSec) || 12);
  // Per-second core, floored by a per-scene minimum so scene-rich films never starve.
  const perSecond = Math.round(d * 0.5);                 // 30→15, 60→30, 90→45, 120→60
  const perSceneFloor = Math.max(0, sceneCount) * 2;     // ≥2 candidates/scene
  const total = Math.min(70, Math.max(8, perSecond, perSceneFloor));
  // Split: photos lead, vectors substantial, video capped low (render budget).
  const maxVideos  = videoOk ? Math.min(hasUploads ? 1 : 2, Math.round(total * 0.06)) : 0;
  const maxVectors = Math.round(total * 0.35);
  const maxPhotos  = total - maxVideos - maxVectors;
  return {
    total,
    maxPhotos, maxVectors, maxVideos,
    maxUploads:     Math.min(12, Math.max(4, Math.round(total * 0.20))),
    maxScreenshots: hasUploads ? 2 : Math.min(4, Math.max(2, Math.round(d / 30) + 1)),
    maxBrand:       hasUploads ? 2 : Math.min(6, Math.max(3, Math.round(total * 0.12))),
    // CD budgets scale too, so a bigger pool isn't bottlenecked downstream.
    cdMaxTopUp:     Math.min(12, Math.max(3, Math.round(d / 20))),
    cdMaxPerScene:  2,   // stays a per-scene CLUTTER guard, not a density knob
  };
}
module.exports = { computeAssetBudget };
```

### 4b. Wiring (three sites, one authority)

- **`graph.js` assetPlannerAgent (`:275–351`)** — the active path:
  ```js
  const B = computeAssetBudget({
    durationSec: s.storyboard?.durationSec || s.job.duration,
    sceneCount: script.scenes.length,
    hasUploads: !!userPins.pinned.length, videoOk,
  });
  const videos  = wants.filter(v).slice(0, B.maxVideos);
  const vectors = wants.filter(isVectorNeed).slice(0, B.maxVectors);
  const photos  = wants.filter(other).slice(0, B.maxPhotos);
  // pinUserAssets({maxPins:B.maxUploads}); websiteCap=B.maxScreenshots; pinWebsiteAssets({maxPins:B.maxBrand})
  ```
- **`config.js` / `creative_director.js`** — pass `B.cdMaxTopUp` into `reviewAndCurate`
  (replace the fixed `maxTopUp:3`).
- **`project_pipeline.js:442-443` + `asset_planner.js:66,77`** — route through the same
  `computeAssetBudget` so the three paths stop disagreeing.

### 4c. Guardrails
- Keep video near-constant regardless of duration.
- The larger candidate pool is absorbed by the **existing** CD + VLD curation (they demote
  overflow to B-roll), so *more candidates ≠ more on-screen clutter*.
- Cost/latency scales with the pool (each web-stock asset is vision-gated in chunks of 6);
  add a soft `total` ceiling and log when a long film is cost-capped (never silently).

---

## 5. NET-NEW: A validation gate that respects the fail-open law

**The tension:** the user wants validation to *refuse to ship a poor video and emit a
diagnostic report.* The codebase's cardinal rule (`asset_usage_report.js:11-13`) is *"the
Validation Gate is NON-BLOCKING… No downstream branch may read `report.validation` to
alter flow."* A naïve hard gate would violate the single most load-bearing invariant in the
system and could turn a recoverable job into a hard failure.

**Reconciliation — three tiers, only the narrowest one blocks:**

| Tier | Runs | On failure | Examples |
|---|---|---|---|
| **T1 self-heal** (exists, extend) | pre-render | silently repair, then continue | coverage < 60% → re-weave (`pipeline.js:701`); broken `<img>` src → `stripMissingAssets` |
| **T2 hard-fail** (NEW, narrow) | pre-render | **fail the job with a diagnostic report** *only* for unrecoverable states | 0 usable assets AND 0 uploads AND 0 screenshots; every scene imageless; a broken local path that self-heal couldn't fix |
| **T3 advisory** (exists) | post-render | disclose in `brand_review`/coverage panels | brand coverage low; language leakage; watermark suspected |

- T2 is the only new hard gate, and it fires only on states where *shipping is strictly
  worse than a legible error* — never on "the video is merely mediocre." This keeps the
  fail-open law intact (a mediocre-but-real film still ships) while satisfying "don't
  silently generate a broken video."
- **Diagnostic report shape** (persist via a new `db.setValidationReport`, surfaced on the
  Premiere/Theater screen when T2 fires):
  ```jsonc
  {
    "ok": false, "blockedBy": "no-usable-assets",
    "checks": {
      "assetsCollected": {ok:false, detail:"0 stock, 0 uploads, 0 screenshots"},
      "everySceneHasVisual": {ok:false, detail:"6/6 scenes imageless"},
      "brokenPaths": {ok:true}, "brandExtracted": {ok:true}, "brandApplied": {ok:true},
      "containersResponsive": {ok:true}
    },
    "remediation": "Provide a website URL with real screens, upload product images, or enable the harvester."
  }
  ```
- **Where it runs:** a new `validation_gate` node in `graph.js` between
  `visual_layout_director` and `composition` (pre-render), reusing the existing
  `validateAssetIntelligence` checks but *promoting only the T2 subset* to a throw.
  Everything else stays disclosure-only.

---

## 6. Asset Intelligence — formalize the trio + fill the blur gap

The "new agent" the user wants is **90% already the Creative Director + Visual Layout
Director + screenshot_intake.** Rather than a new LLM agent, formalize the existing stage
and fill three gaps:

### 6a. Unified category taxonomy (deterministic)
Add a single `categorize(asset)` in `asset_priority.js` (or a new `asset_taxonomy` export)
that maps every asset to the user's 10 categories
`{logo, screenshot, product, dashboard, team, illustration, marketing, background,
decorative, icon}`, reconciling the three existing classifiers:
- harvester `assetType` → direct map (`hero`→`background`, `image`→`background`).
- CD `sectionType`/`cdProminence` → refine (`screenshot` + data keywords → `dashboard`).
- expose `confidence = clamp(cdScore/100 + clipRelevance*0.3, 0, 1)` on every asset.

### 6b. Blur / sharpness gate (deterministic, ffmpeg-only — no `sharp`)
`ASSET-TEMPLATE-OVERHAUL-PLAN.md:192` deferred this over false-reject risk, and
`BRAND-COLOR-SYSTEM-PLAN.md:58` forbids `sharp`/`jimp`/`canvas`. Both constraints are
satisfiable: reuse the existing ffmpeg pattern from `dominantColors` (`ingest/website.js`)
to compute an **edge-energy / high-frequency ratio** (ffmpeg `edgedetect` or a Sobel-like
`convolution` filter → mean output luma). Add to `screenshot_intake.filterScreenshots` and
`asset_sources/util.validateImage`:
- score `sharpness = mean(edgeEnergy)`; **demote** (not reject) below a conservative floor;
  only hard-reject the bottom decile to keep false-rejects low. Log every demotion.
- This makes "reject blurry" real without a native dependency and without the CD vision
  budget.

### 6c. Cropped / cookie / popup / loading rejection
Already handled by CD vision (`popupDemotePct`, `demoteOnIncomplete`) + `screenshot_intake`
blank gate. **Gap:** these depend on the CD being enabled. Add a *deterministic* backstop
for cookie-banner/popup shots: an aspect + top-band solid-color heuristic in
`screenshot_intake` (a full-width high-contrast band in the top 15% is a cookie bar) so the
demotion survives a CD-disabled/over-budget run.

---

## 7. Scene-to-asset mapping — wire the two dead assets

Two working pieces exist but are disconnected:

1. **`asset_taxonomy.PURPOSE_KIND`** (`:88`) — the exact spec
   (`hook→photo, feature→screenshot, proof→people, data→vector, cta→icon`) — is **never
   imported.** Wire `kindForPurpose(scene.purpose)` into `graph.js` gap-fill (`:319-336`)
   so a `proof` scene fetches *people* and a `data` scene fetches a *chart/dashboard*
   instead of a generic background.
2. **`scene_kit.js` ignores `a.sceneId`** (grep: 0 matches) — it re-derives placement from
   the kind-pool weave. The CD already assigned each asset a semantic scene; the ~30 native
   composers honor it (`product_showcase_composer.js:557`), scene-kit is the outlier.

**Redesign — one deterministic matcher, both families consume it:**
```js
// new: scene_asset_map.js — matchAssetsToScenes({scenes, assets}) → {[sceneId]:{hero,support[],broll[]}}
// fit(scene, asset) = purposeKindMatch(kindForPurpose(scene.purpose), assetKind)
//                   + assetAffinity(scene, role)            // reuse the existing scorer
//                   + tierFor(asset)/1000                   // trust-first (asset_priority)
//                   + (asset.sceneId === scene.id ? BONUS)  // honor the CD's assignment
// greedy assignment honoring cdMaxPerScene; deterministic; fail-open to today's weave.
```
- Runs after the CD, before composition (emit as part of `layoutPlan` so both `graph` and
  `project_pipeline` share it).
- **scene-kit change:** before the Pass-1 weave (`~:1783`), place `map[scene.id].hero`
  first; use `partitionAssets` only for kind bucketing and `orderByPaletteAffinity` only as
  an intra-tie sort.
- **Authority rule (decision):** CD `assignScene` wins when present+valid; the matcher
  fills unassigned scenes and resolves multi-asset-per-scene. Keep `kindForPurpose` a
  *ranking bias*, not a hard filter, so a scene is never left imageless because the "right"
  kind wasn't fetched.

---

## 8. 9:16 asset placement — complete the responsive roadmap

`RESPONSIVE-VIDEO-SYSTEM.md` already made `responsive.js`, flagship, brightlife, and
scene-kit portrait-native (verified 720×1280, 0 lint errors). **Remaining, per that doc +
my audit:**

1. **The 5 native-GSAP composers are still landscape-locked** (`bloom`, `blueprint`,
   `bauhaus`, `terminal-departures`, `paper-tales`). Each hardcodes `flex-direction:row`
   sized in `cqw` for a wide canvas and keys "portrait" off the *screenshot* ratio, not the
   *canvas* (`bloom_composer.js:350-358`). Each needs a `W<H` layout mode: rows → columns
   (visual on top ~70–80cqw, copy below full-width), type via a portrait multiplier (~1.6×)
   with a min clamp (headline ≥36px, body ≥16px). **Largest remaining chunk.**
2. **Visual Layout Director is aspect-blind** — `directLayout({dims})` destructures `dims`
   but never uses it; `__heroScale` is consumed **only in landscape**
   (`scene_kit.js:1347` gates it behind `land`). Emit a `__portrait` plan and make
   `__heroScale`/`__montageMax` mode-aware.
3. **`heroBox`/`isPortrait`/`isSquare` in `responsive.js` are still unused** (zero
   importers). Wire `heroBox(W,H)` into scene-kit's `archScreenshotHero`/montage so hero
   bounds come from the shared source of truth, not the hardcoded `84%`/`0.38·H`.
4. **Montage tiles cover-crop screenshots** (`:1511`, `fit:cover` for photos/screenshots,
   `contain` only for vectors). In portrait, give screenshots `contain` on a pack-ground
   tile and cap tiles at 2–3.
5. **Responsive-QA gate** — export + wire `safeAreaCheck`, run `inspect` at the *actual*
   job dims, and treat `container_overflow` as an **error** when the overflowing element is
   a headline/screenshot/CTA (keep decorative overflow a warning).

**Note on `object-fit: cover`:** scene-kit's screenshot hero *keeps* `cover` deliberately —
the Ken-Burns Y-scroll reveals the full page (`RESPONSIVE-VIDEO-SYSTEM.md:98`). Do **not**
naively flip it to `contain` there. The contain-vs-cover decision is open only for the
native composers and montage tiles (§13-D6).

---

## 9. Brand color — light up the "dead bundle"

`BRAND-COLOR-SYSTEM-PLAN.md` is the authoritative design; `brand_kit.resolveBrand` is
implemented. The user's "only text recolors" complaint is **true only on scene-kit packs**,
and the reason is precise:

- `resolveBrand` **already computes** `gradients{primary,secondary,accent,background}`,
  `ui{border,chip,buttonBg,onAccent,hover,glow,shadow,tint…}`, `three{A,B,C,glow,particle…}`,
  `chart[≥3]`, `slots{}` — all WCAG-nudged against the real ground.
- **But most of it is unconsumed** ("dead bundle"): scene-kit reads only the emphasis
  gradient + `three.A/B`; `ui`/`chart`/`gradients.primary/secondary/accent`/`slots`/
  `cssVarBlock` are computed on every job and read by **zero** composers. `slots` is
  structurally always `{}` because `DEFAULT_CONTRACT.slots=[]` and no `pack.json` ships a
  `manifest.brand` contract. (flagship/blueprint/terminal/bloom/paper-tales *do* reHue
  decor + paint a `gradients.background` wash — so "backgrounds/cards never change" is
  already false for the native five.)

**Two layers (both preserve identity + WCAG; both fail-open — null skin renders byte-identically):**

- **Layer 1 — consume the bundle on scene-kit** (biggest visible win, no manifest work).
  At scene-kit emit sites, replace card/border/chip/chart literals with `theme.brand.*`
  **gated on `theme.brand.applied`**: card/panel get a brand tint *over* (never replacing)
  the ground (`ui.tintWeak/tintStrong`, mirroring the native bgWash); borders → `ui.border`;
  chips → `ui.chip`; CTA pills → `ui.buttonBg`+`ui.onAccent`; charts → `chart[]`. Inject
  `cssVarBlock(theme.brand)` into `:root` at the single `writeIndexHtml` choke point.
- **Layer 2 — per-surface opt-in via manifest contract.** Add the `brand` field to
  `PackManifestSchema` (already read at `scene_kit.js:202` as `manifest.brand`, currently
  `undefined`); declare brand-writable `slots` per pack; keep semantic packs
  (`terminal green=ON-TIME`, `blueprint cyan=dimension`) `slots:[]`. `resolveBrand` already
  turns these into `slots{}`.

**Do not** relax the "brand never *replaces* ground" rule casually — the atmosphere tier
(ground *hue* rotated with luminance pinned) is the sanctioned way to make "same template +
different brand = different identity" without destroying pack character, and it is **gated
behind explicit sign-off (D2) in `BRAND-COLOR-SYSTEM-PLAN.md`** because accent-only was a
user-confirmed decision (2026-07-14).

---

## 10. Validation framework & regression checks

- **Runtime:** the T1/T2/T3 gate of §5 (`validation_gate` node + `db.setValidationReport`).
- **Regression (already specced):** `BRAND-COLOR-SYSTEM-PLAN.md` §8 defines the **magenta
  test** — build every pack twice (null skin vs hostile magenta skin) through its harness;
  assert (C) *strip all color literals → remainder byte-identical* (proves layout/motion/
  type unchanged) and (F) *accent pixels must differ* (catches the silent no-op). Extend it
  with an **asset-coverage assertion**: for a fixed fixture job, assert every scene receives
  a mapped asset and no `<img>` has a broken src.
- **9:16 assertions** (from `RESPONSIVE-VIDEO-SYSTEM.md`): hero within `heroBox`, text
  within `safeArea`, no headline/screenshot `container_overflow`, at the *actual* job dims.
- **CI:** wire `scripts/audit-contrast.js` (already `process.exit(1)` on fail) + the magenta
  test + a per-pack golden render into the pipeline. **Fix the HyperFrames pin first**
  (`BRAND-COLOR-SYSTEM-PLAN.md:499` — harnesses render `@0.6.120 --quality draft` while prod
  falls back to unpinned `@latest --quality high`; every harness-verified result is
  unverified for prod until `config.render.hyperframesVersion` is pinned — **already present
  in `config.example.json:85`**, confirm `config.json` has it).

---

## 11. Performance & cost

- **Adaptive counts raise cost/latency on long films** (each web-stock asset is vision-gated
  in chunks of 6; ~50–70 assets ≈ 8–12 extra vision calls). Mitigate: (a) CLIP pre-score
  (`asset_clip.js`, already present) to shrink the vision pool; (b) a `total` ceiling with a
  logged cost-cap; (c) the per-domain harvest cache already exists (`config.harvester.cacheTtlHours`).
- **Blur gate is one extra ffmpeg pass per candidate** (~tens of ms) — negligible vs a
  network fetch; run it inside the existing `validateImage` ffprobe pass to avoid a second
  spawn.
- **Video stays capped** (render-budget guard) regardless of duration.
- **Scene-asset matcher is deterministic** (no LLM) — free.
- **The three asset paths** should converge on `asset_budget.js` + `scene_asset_map.js` to
  stop maintaining three cap regimes.

---

## 12. Unified roadmap

Phases ordered by ROI × (1 − risk). Each item notes its owning plan.

| Phase | Item | Owning plan | Effort | Impact |
|---|---|---|---|---|
| **P0** | `asset_budget.js` + wire into `graph.js` (adaptive counts) | *this doc §4* | 0.5–1d | Long films finally fill every scene |
| **P0** | Wire `kindForPurpose` (dead `PURPOSE_KIND`) into graph gap-fill | ASSET-PIPELINE §1.4 | 0.5d | On-purpose asset kinds per scene |
| **P0** | Confirm `config.json` HyperFrames pin (`0.6.120`) | BRAND §8d | 5min | Makes every harness result prod-valid |
| **P1** | `scene_asset_map.js`; scene-kit honors `sceneId`+purpose | *this doc §7* | 2–3d | Kills "random assets" on the default composer |
| **P1** | Brand Layer 1: consume `ui`/`chart`/`gradients`/`cssVarBlock` on scene-kit (gated) | BRAND §4-5 | 2–3d | Brand reaches cards/borders/chips/charts — the #7 headline |
| **P1** | Blur/sharpness gate (ffmpeg edge-energy) + unified 10-category taxonomy + confidence | ASSET-TEMPLATE §, *this doc §6* | 2–3d | "reject blurry" + legible categories |
| **P1** | T2 blocking validation node + diagnostic report | *this doc §5* | 1–2d | "refuse to ship broken" without breaking fail-open |
| **P1** | 9:16: VLD portrait plan + wire `heroBox` + montage contain | RESPONSIVE §4 | 2d | Portrait screenshots stop clipping/cramping |
| **P2** | 9:16: the 5 native-GSAP composers portrait layout modes | RESPONSIVE §4 | 1–2wk | Portrait-native for every template |
| **P2** | Brand Layer 2: `manifest.brand` contracts per pack (+ atmosphere, D2) | BRAND §6 | 1wk | Per-pack brand reach; "different brand = different identity" |
| **P2** | Harvester: default-on decision + public video + mobile screenshots + font token | WEBSITE-ASSET §, *this doc §3.1* | 1–2wk | Richer brand-asset collection |
| **P2** | Magenta test + asset-coverage + responsive assertions in CI | BRAND §8, RESPONSIVE §4.5 | 1wk | Regression-proof |
| **P3** | Converge paths B/C onto `asset_budget`+`scene_asset_map`; CLIP relevance ranking | ASSET-PIPELINE §1 | 1–2wk | One asset authority; relevance win |

**Recommended first sprint (all P0 + the two P1 headliners):** adaptive budget + wire
`kindForPurpose` + HyperFrames pin, then `scene_asset_map` + Brand Layer 1. That sequence
alone moves output from "text-heavy, generic, duration-blind" toward "duration-scaled,
semantically-placed, brand-colored" at low risk, and it directly answers Problems #2, #4,
#5, and the visible half of #7.

---

## 13. Open decisions (need a human call)

Several are pre-existing (`BRAND-COLOR-SYSTEM-PLAN.md` D1–D4); the rest are new here.

- **D-A (adaptive table):** confirm the target table as a **soft target** (CD may exceed/
  trim) vs a **hard cap**, and the interpolation constant (`0.5/sec` hits the midpoints).
- **D-B (video scaling):** may the duration budget raise **video** count at all, or does
  only photo/vector scale while video stays 1–2? (Render-budget risk.)
- **D-C (validation posture):** approve the **T2-only hard-fail** reconciliation (§5), or
  keep everything non-blocking (disclosure-only), or go full-blocking? (Full-blocking
  breaks the fail-open law.)
- **D-D (brand scope):** Layer 1 default-on tinting of cards/borders/charts on scene-kit
  (fast, risks fighting a pack's designed look) vs Layer 2 opt-in per-pack `slots` (safe,
  ~14 packs to curate). And is **accent-only** still the product intent, or is louder brand
  now wanted? (Reverses a 2026-07-14 user decision.)
- **D-E (atmosphere tier, = BRAND D2):** sign off on ground-hue rotation for flagship/
  brightlife (the only mechanism that delivers "different brand = different identity")?
- **D-F (portrait screenshots):** contain (whole UI, letterbox) vs cover (fill, crop) for
  the **native composers** and montage tiles. Scene-kit's cover is settled (Ken-Burns).
- **D-G (harvester default):** turn `WEBSITE_HARVESTER` on by default (richer assets, live
  SSRF surface — already IP-pinned) or keep opt-in per environment?
- **D-H (blur aggressiveness):** demote-only vs hard-reject the blurry decile (false-reject
  risk is why it was deferred).

---

## 14. Success-criteria mapping

| Success criterion (as stated) | Delivered by |
|---|---|
| Discover & extract high-quality public brand assets | §3.1 harvester (default-on D-G) + §6 blur/quality gate |
| Collect an appropriate number based on duration | **§4 (net-new)** |
| Intelligently select the best assets per scene | §6 (CD/VLD, exists) + §4 (bigger pool) |
| Integrate naturally into every template, esp. 9:16 | §8 (native composers + VLD portrait + heroBox) |
| Apply brand colours consistently across the template | §9 (Layer 1 dead-bundle + Layer 2 contracts) |
| Feel professionally art-directed, not generic/text-heavy | §7 semantic mapping + §4 density + §9 brand |
| Refuse to ship / diagnostic report | **§5 (net-new T2 gate)** |

---

*Prepared on branch `Rohit`. Grounded in the current code (file:line) and cross-referenced
against the five existing plan docs. Net-new designs: adaptive asset budget (§4), blocking
validation tier (§5), scene-asset matcher wiring (§7). Everything else completes or wires
work already architected on this branch.*
