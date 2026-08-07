# KEYFRAME Phase-1 Asset Subsystem Audit (merged, re-baselined)

## 0. Read this first — the audit inputs are partially superseded

Eleven of the twelve auditors independently reported that `template_media.js`, `crop_engine.js` and `asset_quality.js` are **"untracked and wired to nothing"**, that the fetch loop is **serial**, and that **no pack declares placeholder geometry**. All three claims were true when they read, and **all three are now false in the working tree.** Verified against the live files:

| Auditor claim | Current reality | Evidence |
|---|---|---|
| `template_media.js` required by zero runtime files | Wired into the planner | `graph.js:456` `require("../services/template_media")`, `:457` `resolveMediaPlan`, `:462` `collectionTargetFor` |
| `crop_engine.annotateAssets` never called | Called by a **new graph node** | `graph.js:944`, `:962` inside `assetPrepAgent` (`graph.js:936`) |
| `asset_quality.js` unwired | Wired; `qualityScore` feeds ranking | `graph.js:945`, `:962`; consumed at `visual_layout_director.js:79`, `asset_reuse.js:429` |
| 0 of 46 packs declare media/slots | **46 of 46** declare a `media` block | `grep -l '"media"' frames/*/pack.json` → 46; `ls -d frames/*/` → 46 |
| Fetch loop strictly serial | **Lane-parallel** | `graph.js:815` `await Promise.all(Array.from({length: lanes}, lane))` |
| `sharpness`/`stdev` dropped by `acquire()` | Carried on the wire | `asset_sources/index.js:121`, `:238-239` |
| `buildSlots` = one slot per scene, hard-coded | Placeholder-granular when a plan exists | `asset_reuse.js:257` signature takes `mediaPlan`; `:266-269` iterates `mediaPlan.placeholders` |
| No pre-render placeholder gate | `criticalPlaceholdersFilled` **hard-FAILs** on authored plans | `preflight.js:255` |

**Line numbers for `graph.js` in every auditor report are stale** — the file grew ~135 lines. All `graph.js` references below are re-derived against the current file.

What the auditors got right and what remains unfixed is the actual content of this document. The Creative Director is **untouched** — every CD finding stands verbatim.

---

## 1. End-to-end asset flow

`user submits URL` → `MP4 written`. Tags: **[LLM]** model round-trip · **[NET]** network · **[CPU]** compute/process spawn · **[IO]** disk · **[TRIVIAL]** pure/instant.

| # | Step | file:line | Tag | Blocks on |
|---|---|---|---|---|
| 1 | Brief intake; website ingest + `prepareUserAssets` start concurrently | `project_pipeline.js:105` | **[NET]** | nothing |
| 2 | `probeUserAssets` — ffprobe over the upload manifest, `Promise.all` | `user_assets.js:178` | **[CPU]** | uploads on disk |
| 3 | `classifyUserAssets` — one batched vision call / 6 uploads → `{assetType,quality,storytelling,sees}` | `user_assets.js:199` | **[LLM]** | step 2 |
| 4 | Screenshot capture → `filterScreenshots` (obstructed hard-drop, blank drop, keep-strongest dedupe) | `screenshot_intake.js:74` | **[CPU]** | puppeteer |
| 5 | `prepareWebsiteAssets` — validateImage + `classify` + `scoreAssetQuality` 0-100 per harvested file | `website_assets.js:201`,`:140` | **[CPU]** | harvester |
| 6 | Script LLM decides **scene count** (2..24); `normalizeScript` caps at 24, stamps roles | `script.js:293`, `:141`, `:160` | **[LLM]** | brief |
| 7 | **User approves script → scene count FROZEN forever** | `graph.js:2148`-ish (`runProductionGraph`) | **[TRIVIAL]** | human |
| 8 | `frameSelectorAgent` — pack pick + orientation reroute + charset reroute + `db.setFramePack` | `graph.js:225` | **[TRIVIAL]** | nothing |
| 9 | **Fan-out ×4**: storyboard, asset_planner, caption_director, art_director | `graph.js:2311-2314` | — | frame_selector |
| 10 | `generateStoryboard` from a prose digest of the script | `graph.js:347` | **[LLM]** | 8 |
| 11 | `reconcileStoryboard` — maps over **scriptScenes**, so final count ≡ `script.scenes.length` | `continuity.js:96`,`:147` | **[TRIVIAL]** | 10 |
| 12 | `scenePlannerAgent` — default `beats[]` + `storyboard.pacing`. **Plans no scenes.** | `graph.js:395`,`:419` | **[TRIVIAL]** | 11 |
| 13 | `computeAssetBudget` → duration/sceneCount **floor** | `graph.js:444` | **[TRIVIAL]** | 8 |
| 14 | **`resolveMediaPlan(pack, scenes, dims)`** → placeholders + aspects | `graph.js:457` | **[IO]** mtime-cached | 8 |
| 15 | **`collectionTargetFor(plan, floor)`** raises (never lowers) the budget | `graph.js:462` | **[TRIVIAL]** | 13,14 |
| 16 | Pins: uploads (t100) → screenshots (t80) → harvested brand (t90/70) onto `showcaseTargets` | `graph.js:450-474`-region | **[CPU]** ffprobe | 15 |
| 17 | Per-scene want construction; gap-fill only when `!needs.length && !pinned` | `graph.js:489-543`-region | **[TRIVIAL]** | 16 |
| 18 | Vector→photo rewrite on vector-blind packs; `.slice()` truncation by budget | `graph.js:549`, `:565`-region | **[TRIVIAL]** | 17 |
| 19 | Pinned screenshots copied, `Promise.all` | `graph.js:663` | **[IO]** | — |
| 20 | Deduper seeded serially (uploads→brand→screenshots), one ffmpeg dHash each | `graph.js:~700` | **[CPU]** | 19 |
| 21 | **LANE-PARALLEL FETCH** — N lanes of `await acquire()` | `graph.js:796`, `:815` | **[NET]+[CPU]** | 18 |
| 22 | Inside `acquire`: curated(off) → bridge vectors → iconify → local cache → providers | `asset_sources/index.js:56`,`:188` | **[NET]** | — |
| 23 | Per candidate: `download` → `validateMedia` (1 ffprobe) → `validateImage` (**4 spawns**) → `localDb.register` (sync sha1+copy) | `util.js:224`, `local_db.js:100` | **[CPU]+[IO]** | 22 |
| 24 | **Dedupe in plan order** (post-pass, deliberately not in lanes) — dup ⇒ unlink + want lost | `graph.js:828` | **[CPU]** | 21 |
| 25 | Wire objects built (now carrying `sharpness`/`stdev`) | `graph.js:~835` | **[TRIVIAL]** | 24 |
| 26 | **`assetPrepAgent`** — `measureMissing` ∥ `annotateAssets`, then categorize + dup-mark | `graph.js:936`, `:962`, `:987`-region | **[CPU]** | 25 |
| 27 | Join `[scene_planner, asset_prep] → creative_director` | `graph.js:2330` | — | 12 **and** 26 |
| 28 | CLIP pre-score — **one image at a time**, full-res `RawImage.read` | `asset_clip.js:109-119` | **[CPU]** | 26 |
| 29 | **CD vision: `ceil(N/6)` SERIAL chunks**; thumbs also serial inside each | `creative_director.js:317-326`, `:168-172` | **[LLM]+[CPU]** | 28 |
| 30 | Verdicts: `cdScore`, `cdProminence`, `sceneId`, floor (45/25, **owned exempt**) | `creative_director.js:339`, `:372` | **[TRIVIAL]** | 29 |
| 31 | Per-scene prominent cap (2), `rankKey` = tier×1000 + score | `creative_director.js:498-506` | **[TRIVIAL]** | 30 |
| 32 | Never-zero rescue; `fs.unlinkSync` every rejected web-stock file | `creative_director.js:~533` | **[IO]** | 31 |
| 33 | **SERIAL top-up** over gapScenes (`cdMaxTopUp`) + one more vision chunk | `creative_director.js:545`, `:575` | **[NET]+[LLM]** | 32 |
| 34 | **`reviewAudio`** — unrelated text LLM call, on the asset critical path | `creative_director.js:606` | **[LLM]** | 33 |
| 35 | VLD `directLayout` (**sync**) — budgets, demotion, `cropFocus` fallback, `container` | `graph.js:1178`, `visual_layout_director.js:227` | **[TRIVIAL]** | 34 |
| 36 | `spreadAcrossScenes` — **moves**, never duplicates; ceiling `min(assets, scenes)` | `visual_layout_director.js:169-173` | **[TRIVIAL]** | 35 |
| 37 | `optimizeAssetReuse` with `mediaPlan` — placeholder slots, clone ≤2 uses, minScore 40 | `graph.js:1204`, `asset_reuse.js:555`,`:567` | **[TRIVIAL]** | 36 |
| 38 | `localization_director` → `motion_planner` → join `art_director` → `composition` | `graph.js:2340`,`:2347`,`:2348` | **[LLM]+[TRIVIAL]** | 37 |
| 39 | `preflight` — `criticalPlaceholdersFilled` **FAIL** when plan is authored | `preflight.js:255` | **[TRIVIAL]** | 38 |
| 40 | Composer weave (scene_kit) or native composer `fillSlots` | `scene_kit.js:1894`, `om_port_kit.js:303` | **[CPU]** | 39 |
| 41 | animation → `[animation, voice_agent] → audio_director` → timeline → qa | `graph.js:2349`,`:2353`,`:2354`,`:2355` | **[CPU]** | 40 |
| 42 | Post-render `auditAssetRender` — disclosure only, never gates | `graph.js:1728`-region | **[IO]** | 41 |
| 43 | QA → conditional `repair` (re-runs composition→animation→timeline **outside the graph**) | `graph.js:2374-2376`, `:2195` | **[CPU]** | 42 |

### Production graph — critical path in `██`

```
                         START
                           │
                   ┌───────▼────────┐
                   │ frame_selector │ graph.js:225
                   └───┬───┬───┬──┬─┘
        ┌──────────────┘   │   │  └──────────────┐
        │                  │   │                 │
  ┌─────▼──────┐   ┌───────▼─┐ │          ┌──────▼──────┐
  │ storyboard │   │ caption │ │          │ art_director│
  │   _agent   │   │_director│ │          │  (parallel) │
  └─────┬──────┘   └────┬────┘ │          └──────┬──────┘
        │               │      │                 │
  ┌─────▼──────┐  ┌─────▼────┐ │                 │
  │scene_planner│ │voice_agent│ │                │
  └─────┬──────┘  └─────┬────┘ │                 │
        │               │      │                 │
        │        ┌──────▼──────▼──┐              │
        │        │ ██ asset_planner ██ │ :430     │   ← template_media
        │        └──────────┬───────┘              │      resolves here
        │        ┌──────────▼───────┐              │
        │        │ ██ asset_search ██│ :649        │   ← LANE-PARALLEL
        │        └──────────┬───────┘              │
        │        ┌──────────▼───────┐              │
        │        │ ██ asset_prep  ██ │ :936        │   ← crop ∥ quality
        │        └──────────┬───────┘              │
        └──────────┐        │  graph.js:2330       │
              ┌────▼────────▼────┐                 │
              │██ creative_director ██│ :1041      │   ◄── ~36s MEDIAN
              └─────────┬────────┘                 │       ALL SERIAL
              ┌─────────▼────────┐                 │
              │██ visual_layout_director ██│ :1176 │
              └─────────┬────────┘                 │
              ┌─────────▼────────┐                 │
              │ ██ asset_reuse ██ │ :1204          │
              └─────────┬────────┘                 │
              ┌─────────▼────────┐                 │
              │██ localization_director ██│ :1250  │
              └─────────┬────────┘                 │
              ┌─────────▼────────┐                 │
              │ ██ motion_planner ██│ :1973        │
              └─────────┬────────┘                 │
                        └────────┬─────────────────┘  graph.js:2348
                        ┌────────▼────────┐
                        │ ██ composition ██│ :1647
                        └────────┬────────┘
                        ┌────────▼────────┐
                        │ ██ animation  ██ │ :2026
                        └────────┬────────┘
                                 ├──────── voice_agent joins here (:2353)
                        ┌────────▼────────┐
                        │ ██ audio_director ██│ :1546
                        └────────┬────────┘
                        ┌────────▼────────┐
                        │ ██  timeline  ██ │ :2095 → MP4
                        └────────┬────────┘
                        ┌────────▼────────┐
                        │    qa_agent     │ :2220
                        └───┬─────────┬───┘
                       repair│         │pass
                        (:2195)       END
```

The critical path is: `frame_selector → asset_planner → asset_search → asset_prep → creative_director → visual_layout_director → asset_reuse → localization_director → motion_planner → composition → animation → audio_director → timeline`. **Thirteen strictly serial nodes**, of which only `asset_search` and `asset_prep` are internally parallel.

---

## 2. The asset object contract

Every field that ever appears on a wire asset. Merged across all twelve auditors, duplicates collapsed, corrected against the current tree.

### Core identity & placement

| Field | Type | Written by | Read by |
|---|---|---|---|
| `path` | string, jobDir-relative, `/` | `graph.js:~835`; `user_assets.js:63-85`; `website_assets.js:390-409` | Everything. **Is the identity key** — `report.assetScores[path]`, `asset_coverage`, `asset_reuse` ledger. Reuse clones keep the same path ⇒ per-instance scoring impossible |
| `type` | `image`\|`video` | `graph.js:~835` | `creative_director.js:300`, `scene_kit.partitionAssets`, every composer |
| `sceneId` | string\|null | pinners `graph.js:450-474`; CD `creative_director.js:350`; `spreadAcrossScenes` `visual_layout_director.js:174`; reuse clone `asset_reuse.js:~450` | `creative_director.js:493` (cap grouping), `preflight.js:125`, all composers |
| `startSec` / `durationSec` | number | same as `sceneId`; re-synced on move `visual_layout_director.js:177` | timeline, composers |
| `style` | `inset`\|`background` | `graph.js:~835` from `need.role` | `scene_kit`, composers |
| `alt` | string — **raw search query** for stock, hand-written sentence for owned | `graph.js:~835` | `creative_director.js:~188` (prompt), `visual_layout_director.classify`, `scene_kit.partitionAssets` alt-sniff |

### Measured pixel facts

| Field | Type | Written by | Read by |
|---|---|---|---|
| `width` / `height` | number | `util.ffprobeImage` via `asset_sources/index.js:223`,`:234` | `deviceKind`, `cropFocusFor`, `fitMediaCqw`, CD prompt `dims:` text |
| `ratio` | number, 3dp \| null | same | `visual_layout_director.js:101`, `om_port_kit.js:303` misfit, `asset_reuse` aspect term. **null on video path and iconify** |
| `hasAlpha` | boolean | `util.js:103` pix_fmt regex | vector validation, composers |
| `dhash` | 16-hex 64-bit | `util.imageDHashStats` | `deduper.check`, `asset_reuse.similarity` `:133-137`, **`assetPrepAgent` dup-marking `graph.js:~995`**. Undefined for SVG + iconify |
| `dominantColor` | `#RRGGBB` | `util.imageDominantColor` | `scene_kit.orderByPaletteAffinity` |
| **`sharpness`** | number, var-of-Laplacian | **NOW CARRIED** `asset_sources/index.js:121`,`:238` | `asset_quality` grading; `graph.js` dup-mark tie-break `strength()` |
| **`stdev`** | number, grayscale σ | **NOW CARRIED** `asset_sources/index.js:121`,`:239` | `asset_quality`; the `<5` reject inside `validateImage` |

### Provenance & trust

| Field | Type | Written by | Read by |
|---|---|---|---|
| `source` | `upload`\|`website`\|`website-brand`\|`website-asset`\|`library:*`\|`iconify`\|`pixabay`\|`openverse`\|`pexels`\|`pixabay_scrape`\|`cache:<p>` | all producers | **`asset_priority.tierFor:39-47` — THE tier key.** `isOwned`, `isTrustedProminent:62`, CD floor `:372` |
| `license` / `sourceUrl` / `fromCache` | string/bool | producers | disclosure, `asset_usage_report` |
| `role` | `"logo"` only value read | `user_assets.js:~80` | `asset_priority.isLogo`, `creative_director.js:300` (excludes logo from review entirely) |
| `kindHint` | `screenshot`\|`photo`\|`vector`\|`video` | `user_assets.js:63-85`, `website_assets.js:390-409` | `visual_layout_director.classify:54,57`, `scene_kit.partitionAssets:1311,1314`, CD screenshot-QA gate |
| `assetType` | harvester/intake label | `website_assets.js:~400`, intake classifier | `asset_priority.categorize` via `ASSET_TYPE_MAP:107` |
| `uploadId` | string | `user_assets.js:~78` | manifest join |
| `ink` | `{lum,mono,source}` | `logo_render.measureLogoInk` | logo treatment |
| `brandColors` | string[] | `website_assets.js:~406` | art director |
| `qualityScore` (harvest) | 0-100 | `website_assets.scoreAssetQuality:140` | **collides in name with `asset_quality`'s** — see §8 |
| ⚠️ `priorityTier` | `100` | `user_assets.js:77` | **NOTHING.** The comment at `user_assets.js:62` claiming trust predicates key on it is **false** |

### Creative Director annotations

| Field | Type | Written by | Read by |
|---|---|---|---|
| `cdScore` | 0-100 weighted \| **null** | `creative_director.js:345` via `normScores:136` | `visual_layout_director.js:76`, `om_port_kit.js:303`,`:612`, `asset_reuse.qualityNorm`, every composer's `sort(b.cdScore - a.cdScore)` |
| `cdProminence` | `hero`\|`support`\|`background`\|`reject` | `:348` (whitelisted) / **`:596` NOT whitelisted** | `scene_kit.prominentOk`, composers |
| `visionOk` | boolean | `:396-411` | the prominent-slot admission bit, every composer |
| `clipRelevance` | 0..1 softmax | `:312` | `:502` rankScore ×30, `visual_layout_director.js:77` |
| `sees` / `sectionType` | string | `:339-352` | prompt echo, report |
| `floorPassed` | bool\|**null** | `:376` | report only |
| `__layoutDemoted` | boolean | CD `:~405`, VLD `:~230` | **The one lever every composer honours** — `scene_kit.js:1807`, `om_stage.js:324` (where it is a *deletion*) |
| `__rejected` / `__captureUnusable` | boolean | `:428-482` | transient filter `:534`; blocks never-zero rescue |
| `__absPath` | string | `:294` | transient, deleted `:650` |
| `category` | `asset_priority.CATEGORIES` | CD `:651`; **also `assetPrepAgent` `graph.js:~975`** | `asset_reuse` **re-derives it by calling `categorize()` itself** — CD's copy is disclosure-only |
| `confidence` | 0..1 | `:652` | nothing |

### Prep / quality / crop annotations (NEW — `assetPrepAgent`)

| Field | Type | Written by | Read by |
|---|---|---|---|
| `qualityScore` | 0-100 deterministic | `asset_quality.js:314` (via `graph.js:962`) | **`visual_layout_director.js:79` importance**, `asset_reuse.js:429` |
| `qualityGrade` / `qualityParts` | string / object | `asset_quality.js:304-314` | disclosure |
| `measureKind` | string | `graph.js:~980` via `quality.measureKind` | shared by crop prior + quality bands |
| `subjectFocus` | focal point | `crop_engine.annotateAssets` (`graph.js:962`) | `crop_engine.focusFor` |
| `cropFocusByAspect` | `{aspect: position}` | `crop_engine.annotateAssets` | **`crop_engine.focusFor`, called by 10 composers** |
| `__duplicateOf` | string (path) | `graph.js:~1000` dup-mark | `asset_quality` caps a marked asset at **22** |

### Layout / reuse annotations

| Field | Type | Written by | Read by |
|---|---|---|---|
| `cropFocus` | CSS `object-position` string | `visual_layout_director.js:227` — **only when `!a.cropFocus`**, i.e. a *fallback* now | `scene_kit.js:70` `kitCropFocus`, `om_stage.js:436`, `om_port_kit.js:238`, `showcase:257`, `grid_dispatch:378`, `slab_stage:356`, `blueprint:531`, `motion_canvas:188`, `paper_craft:217`, `asset_reuse.js:~455` |
| `container` | `phone`\|`browser` | `visual_layout_director.js:~231` via `deviceKind` (ratio<0.9) | `scene_kit`, device chrome |
| `__reuseOf` / `__reuseInstance` / `__variant` | string/num/object | `asset_reuse.js:~450` | `scene_kit.variantOf`, `asset_render_check.countInHtml`, `qa_agent.js:131` |

### Fields that are **measured and discarded**, or **written and never read**

| Field | Status | Evidence |
|---|---|---|
| `priorityTier` | written, read by nothing | `user_assets.js:77` vs `asset_priority.js:39-47` |
| `confidence` | written, read by nothing | `creative_director.js:652` |
| `category` (CD's) | written, re-derived downstream | `creative_director.js:651` vs `asset_reuse.js:~219` |
| upload `quality` / `storytelling` | measured at intake, **never copied to the wire** | `user_assets.js:245-246` vs `assetFromUpload:63-85` |
| harvest `qualityScore` | rides the wire, read only by disclosure | `website_assets.js:405` → `asset_usage_report.js:45,110` |
| upload `dhash` | measured `user_assets.js:190`, **not carried** ⇒ recomputed | `graph.js:~700` deduper seed |

---

## 3. Bottleneck ledger

### CRITICAL PATH

| Rank | Where | Kind | Issue | Evidence | Est. cost |
|---|---|---|---|---|---|
| 1 | `creative_director.js:317-326` | sequential-wait | `ceil(N/6)` vision chunks awaited **serially**; chunks write disjoint key ranges (`verdicts.set(baseIndex+i)`) — zero ordering need | `for (let start=0; start<visual.length; start+=chunkSize) { const m = await reviewChunk(...) }` | **Measured 18.4–52.4s, median ~36s** across 13 jobs (`jobs.json stage_timings.creativeReviewMs`). Parallel ⇒ ~1 round-trip, 10-20s. **Saves ~20-30s** |
| 2 | `creative_director.js:606` | llm-call | `reviewAudio` — a text-only **music/SFX** verdict awaited at the end of the *asset* director. Only input from the CD is `scenes.length`, available at `:280` | `const audio = await reviewAudio({...})` | **3-10s of pure misplacement** |
| 3 | `creative_director.js:545-571` + `:575` | sequential-wait + llm | Serial `await acquire()` per gap scene (`cdMaxTopUp` 3-12), **then** one more full vision chunk. Runs *after* the entire review | `for (const s of gapScenes) { ... await acquire(...) }` | **10-60s** |
| 4 | `creative_director.js:168-172` | io | 6 thumbnails per chunk generated one ffmpeg spawn at a time, inside the already-serial chunk loop | `for (const a of chunk) thumbs.push(await thumbBase64(...))` | 50-150ms × N, **1-4s** |
| 5 | `asset_clip.js:109-119` | sequential-wait + redundant | CLIP embeds one image at a time **and reads the full-res original** (`RawImage.read`) — duplicating the decode+resize `thumbBase64` does 100ms later | `for (const ip of imagePaths) { const ivec = await embedImage(m, ip); }` | 80-250ms × 20-30 = **2-7s**, + 149MB model load on first job after restart |
| 6 | `openrouter.js:289` + `config.json` | sequential-wait | No `creative_director` key in `requestTimeoutByStage` ⇒ inherits **180 000ms**; `ATTEMPTS=3`; `primary.fallbackModel === primary.model` so `useFallback` is **false** at `:309` — **no second model** | worst case **3×180s + backoff ≈ 543s per chunk** | tail risk: a 27-minute node that then silently fails open |
| 7 | `graph.js:2330` → `:2355` | blocking-join | 13-node serial spine after the CD join; nothing overlaps except the voice/caption/art branch | `addEdge(["scene_planner","asset_prep"], "creative_director")` then a straight chain | whole subsystem on critical path; **productionMs ≈ 268-275s** on real 30s jobs |
| 8 | `graph.js:~700` | redundant-computation | Deduper seeded via 3 serial `await deduper.add(abs)` with **no dhash arg** ⇒ fresh ffmpeg dHash per pin. Uploads already measured theirs at `user_assets.js:190` and dropped it | `deduper.add()` → `dhashFor(abs, undefined)` → `imageDHashStats` | 6-12 serial spawns, **1-3s** |
| 9 | `graph.js:828` | io | Dedupe post-pass calls `md5File` → **`fs.readFileSync` of the whole file, synchronous, main thread** | `util.js:210` | 10-100ms **event-loop stalls** × N in a process also serving HTTP |
| 10 | `util.js:224` | redundant-computation | `validateImage` spawns **4 processes** per candidate; up to 5 candidates tried per need | `Promise.all([ffprobeImage, imageDHashStats, imageDominantColor, imageSharpness])` | 5 spawns/success, up to 25/need. Windows spawn ≈ 30-80ms |
| 11 | `local_db.js:100-104` | io | `register()` does sync `readFileSync` (sha1) + `copyFileSync` into the cache, **inside the acquire hot path** | `crypto.createHash("sha1").update(fs.readFileSync(filePath))` | 2 full reads + 1 write per asset, blocking |

### OFF CRITICAL PATH / bounded

| Where | Kind | Issue | Evidence | Est. cost |
|---|---|---|---|---|
| `asset_sources/index.js:~101` | network | `pixabayBridge.searchVectors` at **30 000ms per query variant**; `pixabay_bridge.js:116` `enabled()` checks only the env flag, **never `bridgeReachable`** — the unreachable latch is wired into audio only | `timeoutMs = 30_000` | **worst case 4×30s = 120s for ONE vector need** — now diluted by lane parallelism but still a lane-killer |
| `pixabay_scrape.js:66` | network | 4th provider in the ladder launches a **full Puppeteer Chrome** per call, `networkidle2`, 45s nav + 20s Cloudflare wait | `waitUntil:"networkidle2", timeout:45_000` | 60s+ per want |
| `pixabay/client.js:37-53` | blocking-join | Rate limiter serialises **admission** via `queue = queue.then(run, run)`; 90 req/60s | correct, but now actually exercised by the parallel lanes | bites on 90s+ films |
| `asset_reuse.js:~630` | algorithmic | Per empty slot, every ledger row re-scored; `similarity()` recomputed against every neighbour | nested loops | O(slots×assets×neighbours) — trivial today, **will not survive the multi-slot model now enabled** |
| `graph.js:436`, `:990`-region, +3 more | redundant-computation | `rendererOf()`/`getManifest()` re-derived ad hoc instead of threaded through state | mtime-cached, so cheap | negligible CPU, real design smell |

---

## 4. Root-cause map for the six symptoms

### A. Not enough images

**Primary cause — now largely FIXED, verify before re-fixing.** The auditors' unanimous root cause was `computeAssetBudget` having no template input (`asset_budget.js:25`). That is superseded: `graph.js:457-462` resolves a media plan and `collectionTargetFor` raises the floor, and all 46 packs declare `media`.

**What still causes it:**

1. **`graph.js:~539` pin-suppression + `:~493` gap-fill guard.** A scene owning *any* pin has every `role:"background"` stock need dropped and its derived gap-fill suppressed. `showcaseTargets` (`scene_role.js:93-99`) returns **all** feature/proof/how/context scenes, so on a website-ingest job 3 screenshots + 4 brand pins claim essentially every substance scene. Measured: job `ahtquvd86o` (30s, grid-dispatch, 8 scenes) shipped **9 assets of which exactly ONE was stock**, while the budget said `maxPhotos = 9`. Three sibling jobs show the same shape. **This is a boolean per scene with no notion of how many placeholders that scene has** — and it is now *provably* wrong, because `mediaPlan.placeholders` finally knows the count.
2. **Dedupe is a permanent loss.** `graph.js:828`: a hit unlinks the file and `continue`s. No replacement fetch, no next-ranked candidate, no shortfall accounting. `rankCandidates` had 4 more validated candidates that `acquire()` discarded at `asset_sources/index.js:~230`. The `1` in `assets/images/1.jpg` on job `ahtquvd86o` is the fingerprint of a destroyed `0.jpg`.
3. **No shortfall top-up.** `creative_director.js:542` keys the *only* top-up on `gapScenes` (scenes with **no** asset), never on "the budget said 9 and 1 arrived". Because pins already cover most scenes, `gapScenes` is usually empty — all three inspected jobs report `assetCoverage '100%'` with 0 reuses while carrying 1-2 stock images.
4. **Dead vector gap-fill branch.** `graph.js:~533` `else if (!needs.length && !pinnedSceneIds.has(scene.id))` duplicates the guard at `:~493`, which has already populated `needs` for exactly those scenes. Unreachable on the 35 vector-blind packs.

*Auditor disagreement:* #1 and #2 both blamed the budget; #1 additionally identified the pin-suppression as "the binding constraint, not the budget" and backed it with three jobs' worth of `jobs.json` evidence. **#1 is better evidenced and is the one that survives the template_media landing.**

### B. Wrong crop

**Substantially FIXED — but with a live gap.** `crop_engine.annotateAssets` now runs (`graph.js:962`) and writes `cropFocusByAspect`/`subjectFocus`; 10 composers read it through `crop_engine.focusFor`. `visual_layout_director.js:227` now only writes `cropFocus` as a **fallback** (`if (... && !a.cropFocus)`).

**What still causes it:**

1. **`scene_kit.js:1617` and `:1638`** — `scrimBg` and `videoBg` emit `object-fit:cover` with **no `object-position` at all**. This is the path every demoted/overflow asset takes and the single most common placement in the library. Verified unchanged.
2. **`graph.js:796` never passes `targetRatio`.** `acquire()` accepts it (`asset_sources/index.js:56`) and `scoreCandidate` implements the aspect-fit reward, but the call site omits it, so `index.js:188` always falls back to the job-orientation default. **The per-slot ranking is fully coded and still unwired** — and now that `mediaPlan.aspects` exists three lines away in graph state, this is a two-line fix.
3. **`util.js:~309` `aspectFit = max(0.62, ...)`** — at worst a 38% multiplier against a relevance term worth 65%. A 16:9 photo destined for a 9:16 hero routinely wins. Compounded by `pixabay/validator.js:33-42`, which rejects orientation mismatch only when "decisive" (>1.25 or <0.8). Two lenient gates in series, neither aware of the box.
4. **`showcase_composer.js:~1037` / `om_port_kit.js:303` / `grid_dispatch_composer.js`** — three copies of `score = cdScore + hint + own - k*misfit` with `k` of 3, 3, 2.5. A 0-100 quality term added to a ~0-10 shape term. For a 1.78 desktop capture into the 0.46 phone slot, `misfit = |ln(1.78/0.46)| = 1.35` ⇒ penalty **4.06** — any 5-point `cdScore` edge beats it. **The comment at `showcase_composer.js:~1035` claiming the hint "outweighs a mild shape mismatch but not an extreme one" is false. Trust the arithmetic.**

### C. Bad image in hero

1. **`creative_director.js:372` — owned content is exempt from the quality floor.** `if (scores.overall != null && !isOwned(a) && !isLogo(a))`. `isOwned` covers upload + website + website-brand. A blurry 20/100 upload keeps hero prominence. On a website-ingest job that is 60-80% of the film (8 of 9 assets in `ahtquvd86o`).
2. **`asset_priority.js:82-84` — `rankKey = tier*1000 + score`.** Quality is *arithmetically incapable* of crossing a tier boundary. A tier-70 harvested asset scoring 42 (below the CD's own 45 floor, `__layoutDemoted:true` — see `ingest/brand_assets/a32.webp` in `ahtquvd86o`) outranks a tier-40 stock photo scoring 100 by 30 000 points. **Deliberate house law (`asset_priority.js:12-14`); fixing this for owned material is a product decision, not a refactor.** The defensible narrowing is `website-asset` at tier 70, which `asset_priority.js:51-54` itself admits is not owner-sovereign.
3. **`creative_director.js:376` — the floor silently does not apply when the model returns no numbers.** `normScores` yields `overall:null` ⇒ `floorPassed = null` ⇒ the floor block is skipped. That asset ranks with `cdScore` treated as 0 but is **never demoted or rejected**, and `isTrustedProminent:62` still admits it if it is owned or curated. Fail-open was applied to the *floor* as well as to the deletion.
4. **`creative_director.js:596` — top-ups bypass three guards**: no quality floor, no per-scene cap (pushed to `curated` at `:597`, after the cap ran at `:498-506`), and `a.cdProminence = prom` with **no whitelist** (compare `:348`, which does whitelist). A model returning `"medium"` yields `cdProminence:"medium"`, which every composer's `=== "hero" || === "support"` reads as false.
5. **`util.js:220-244` — `validateImage` has exactly two reject conditions**: `stdev < 5` and "vector role but opaque". No resolution reject (`MIN_LONG_EDGE=900` at `:283` is a *pre*-download soft filter dropped whenever it would leave zero candidates, `:328`), no blur reject, no watermark detection. Any decodable non-flat image reaches the CD.

### D. Good image, low visibility

1. **`scene_kit.js:1860` + `:1894` + `:1955` — the hook can never receive a fetched asset.** `isContent = i > 0 && i < scenes.length - 1`; `weavable` requires `isContent`; Pass 2's B-roll loop opens `if (p.i === 0 ...) continue`. **The most-watched frame in the film is structurally asset-free on the default composer.** Verified unchanged.
2. **`asset_reuse.js:~72-82` — `ROLE_SHOWABLE_DEFAULT` excludes `hook`** for every native renderer except the seven OM skins. A deliberate asymmetric bet made *because* no pack declared its slots — a premise that no longer holds.
3. **`om_port_kit.js:612` — tier-blind sort.** `.sort((a,b) => (Number(b.cdScore)||0) - (Number(a.cdScore)||0))` — raw score, **not `rankKey`**. A stock photo scored 85 sorts ahead of the user's own dashboard scored 70 in the pool feeding `fillSlots`. The `+3 own` bonus at `:303` is dwarfed by a 15-point gap. **~15 packs affected; this actively contradicts the tier law the CD and VLD enforce.**
4. **`visual_layout_director.js:173` — `spreadAcrossScenes` moves the WEAKEST surplus.** `surplus.sort((x,y) => importance(x) - importance(y))` — weakest first, nearest uncovered scene wins. Optimises coverage, explicitly not match quality; there is no scene-importance term at all.
5. **`scene_kit.js:~1820-1821` — palette affinity overwrites the CD ranking.** `pools.photos = orderByPaletteAffinity(pools.photos, theme)` and the same for vectors, immediately after the trust filter. `takeMontage` and `pools[pref].shift()` then consume *that* order. A 90-scoring off-palette photo loses the montage centre to a 55-scoring on-palette one.
6. **`creative_director.js:493` — all unassigned assets share one pseudo-scene.** `const k = a.sceneId != null ? a.sceneId : "_"`, then `maxPerScene = 2`. Eight strong unassigned assets ⇒ six demoted to B-roll.
7. **`asset_priority.js:~113-133` — `categorize()` maps harvested `assetType:'image'`/`'hero'` to `background`**, which scores WEAK (0.25) against every scene role in the reuse SEMANTIC matrix (`asset_reuse.js:~90-97`) ⇒ 0.25 × 30 = **7.5 of 100**. Real brand imagery is systematically beaten by anything with a sharper label.
8. **`creative_director.js:349` — silent assignment drop.** `sceneId` applied only when `validSceneIds.has(v.assignScene)`. Any type drift discards the assignment with no note, no counter, no log. Nothing in the report distinguishes "the CD chose this scene" from "the fetcher did".

### E. Empty placeholder

1. **`asset_reuse.js:~424-431` — "decorative" counts as handled.** A slot scoring below `minScore` 40 is marked `via:'decorative'` and left to the composer's brand-geometry fallback. `scene_kit.buildPropFill` exists but is **archetype-gated to hook/archText only** (`scene_kit.js:~1984`); `om_stage` has `wirePlate`; **several native composers have neither.** The report says handled; the frame renders blank.
2. **`om_port_kit.js:~614-615` — silent role degradation.** When a beat's role does not receive `spec.needs(role)` pictures it degrades to a text-only "statement" layout. Roles are assigned against a *budget* (`assignRoles`) but filled against the *actual hand* (`fillSlots:~259`) and the two can disagree. Nothing reports it.
3. **`asset_reuse.js:625` — `prominentSlot = true` is hard-coded** with the comment "one-per-scene slots are the scene's visual". **Now that `buildSlots:266-269` emits placeholder-granular slots, this is a live bug**: every low-priority tile demands a trusted asset (`:351` vetoes non-trusted) and falls to the decorative fallback instead. This is the highest-value single-line fix in the tree.
4. **`visual_layout_director.js:169-173` — coverage ceiling is `min(assets, scenes)`** because spreading moves and never duplicates. `asset_reuse` exists to break it but only to `maxUses=2` with an adjacency veto and a 40 floor.
5. **The pre-render gate is now real but conditional.** `preflight.js:255` `criticalPlaceholdersFilled` is **FAIL when `mediaPlan.source === "authored"`**, WARN otherwise (`:253`). `everySceneHasVisual` (`:125`) remains WARN and checks `sceneId != null` — an *assignment*, not a rendering.

### F. Slow

Covered exhaustively in §3. The single dominant term is now the **Creative Director**: `asset_search` was the largest block and has been parallelised (`graph.js:815`), leaving `creative_director` at a measured ~36s median — serial chunks, serial thumbnails, serial CLIP, serial top-up, plus a misplaced audio call.

Secondary: **two schemas of record for scene duration.** `storyboard.js:122` enforces `[2,15]`, `script.js:28` enforces `[1,12]`, and `normalizeTimeline` rescales everything anyway — the storyboard model burns retries on arithmetic guaranteed to be discarded.

---

## 5. Redundant & uncached computation

| Computation | Current state | Waste | Proposed cache key |
|---|---|---|---|
| **CD vision verdict** | **NONE.** Every job re-scores every asset, including `source:'cache:pixabay'` hits — the *file* was cached, the verdict was not | The single most expensive repeated computation in the system | `md5(bytes) + subject + framePack + hash(sceneDigest) + rubricVersion`. Split it: the **subject-independent** dimensions (`visualQuality`, `readability`, `motionPotential`) key on `md5(bytes) + rubricVersion` alone and are reusable across **all** jobs |
| **CLIP image embeddings** | NONE. Recomputed per call; a repair lap re-embeds everything | 80-250ms × N per run | `dhash + CLIP_MODEL_ID` → Float32Array. `dhash` is content-addressed, so the same picture under a different query hits. Store beside `local_db` |
| **CLIP text prompts** | NONE. `asset_clip.js:~106-107` re-embeds all 6 on every call — **and 5 of them are the literal constants `DEFAULT_NEGATIVES`** | trivial but free to fix | memoise by prompt string, process-lifetime |
| **CLIP model load** | Process singleton (`asset_clip.js:22,32`), weights on disk at `.cache/transformers` (149MB) | First job after every restart pays it | already correct at process scope — **add a boot warm-up** beside `frame_manifest.validateAll` (`server.js:134`) |
| **`thumbBase64`** | NONE. Written to `os.tmpdir()`, read, immediately unlinked (`media.js:49-61`). Generated for the CD and, on the CD-disabled path, again for `asset_vision` | 1 ffmpeg spawn per asset per pass | `jobDir/assets/.thumbs/<basename>.jpg` keyed by source path + mtime. **Also reusable as the CLIP input**, killing the full-res decode at `asset_clip.js:~112` |
| **`imageSharpness`** | Computed for every image; **now carried** (`asset_sources/index.js:238`) but **still not persisted to `local_db`** | a cache hit loses it | persist the **full** meta object on the `local_db` row — the pass already ran, the fields are simply dropped at the register call |
| **Pinned-asset dHash** | **Computed twice.** `user_assets.js:190` writes `u.dhash` to the manifest; `assetFromUpload:63-85` never copies it; `graph.js:~700` re-runs `imageDHashStats` via `deduper.add` | 6-12 ffmpeg spawns per job | pure plumbing — carry `dhash` through `assetFromUpload`/`assetFromHarvest`, pass it to `deduper.add(abs, dhash)`; `dhashFor` already short-circuits on a supplied hash (`util.js:252-253`) |
| **Provider search responses** | Pixabay only: in-process LRU, 6h, 500 entries (`pixabay/cache.js:21-28`), **dies on restart**. Openverse/Pexels: none | re-issues HTTP + re-ranks from scratch | persist to disk beside `asset_cache/index.json`; key `normalizedQuery + type + orientation + provider + ratioBucket`. **Cheapest big win** — turns a round-trip into a disk read, and `rankCandidates` is pure |
| **Downloaded files** | `asset_cache/index.json` + `files/<sha1>`, permanent, **≥60% query-word overlap** (`local_db.js:56-71`), `hits[0]` taken **blindly with no ranking** | cache hits are systematically lower quality than fresh fetches — they never see `rankCandidates`, `styleKeywords` or `targetRatio` | `{queryTokens, type, orientationClass, ratioBucket}` so a 9:16 job stops materialising a 16:9 hit |
| **Pixabay bridge vectors** | NONE — `searchVectors` is called direct from `asset_sources/index.js:~101`, **bypassing the pixabay gateway** whose audio path *is* cached (`pixabay/index.js:83-91`) | 30s per query variant on a dead bridge | route through the same `pixabay/cache.js keyFor('bridge:vectors', {q})` |
| **Iconify** | NONE. Up to 4 terms re-hit `api.iconify.design` per vector need, and `downloadSvg` picks **randomly from the top 6** (`iconify.js:108-109`) — not even reproducible | full round-trips + nondeterminism | `{term, iconStyle, color}` → svg bytes on disk. **Replace `Math.random` with a job-seeded PRNG** if reproducibility matters |
| **`computeAssetBudget`** | Called **twice** — `graph.js:444` (planner) and inside `creativeDirectorAgent` (`graph.js:~1049`) — from *different* `sceneCount` expressions (`script.scenes.length` vs `(s.script?.scenes \|\| []).length`) | **NOW A REAL BUG, not a hazard**: the planner's budget is raised by `collectionTargetFor` (`:462`); the CD's recompute is **the bare duration floor**, so `cdMaxTopUp` no longer matches the pool the planner sized | thread the budget through the `mediaPlan`-style state channel; `graph.js:2274` already has `mediaPlan: Annotation()` as precedent |
| **`reviewAudio`** | NONE. Pure function of `{subject, music, sfxNames, sceneCount}`, re-asked on every render **including repair laps** | 3-10s per lap | `hash(subject + JSON(music) + JSON(sfxNames) + sceneCount)` |
| **Crop focal points** | `crop_engine` has a content-addressed disk cache at `asset_cache/crop` with per-aspect entries and an in-process memo — **and it is now actually exercised** | already correct | `md5(bytes) + kindVariant + roundedAspect` — as implemented |
| **`pack.json` manifests** | mtime-keyed Map (`frame_manifest.js:~230`) | correct | none needed — **this is the pattern the media block should reuse verbatim** |

---

## 6. Parallelization map

### Genuinely independent (safe to parallelize)

| Work | Why it is serial today | True dependencies | Verdict |
|---|---|---|---|
| **CD vision chunks** `creative_director.js:317-326` | plain `for` + `await`. Nothing in `reviewChunk` reads shared state; it returns a Map keyed by **absolute** index | LLM provider concurrency policy (unmodelled anywhere); shared `AbortSignal` must cancel all in flight; `tracker.addLlm` is additive | **YES — highest value** |
| **Thumbnails in a chunk** `creative_director.js:168-172` | accidental; each spawn writes its own random tmp file (`media.js:49`) | array position (Promise.all preserves it) | **YES**, bound it — `p-queue` is already a dependency and has **zero uses in `src/`** |
| **CD top-up fetches** `creative_director.js:545-571` | `topUps++` counter checked in-loop; `topUpAssets.length` used as the output filename index | both hoistable — slice `gapScenes` up front, index filenames from position | **YES** |
| **`reviewAudio`** `creative_director.js:606` | awaited last, purely by code placement | `scenes.length`, known at `:280` | **YES — move to the audio branch entirely** |
| **Deduper seeding** `graph.js:~700` | three serial `for ... await deduper.add()` loops | **insertion order is load-bearing** (uploads→brand→screenshots decides collision winners) — but the *hashing* is not | **YES** — hash concurrently, then `add()` in tier order |
| **`validateImage`'s 4 probes** `util.js:224` | already `Promise.all` | none | **already parallel**; the waste is that the 3 ffmpeg passes (9×8 gray, 1×1 rgb, 200×200 gray) could be **one invocation with a split filter** |
| **Asset branch vs storyboard/voice/art** `graph.js:2311-2314` | already parallel | CD needs both the scene digest and the files | **already correct** |
| **Fetch lanes** `graph.js:815` | **already done** | dedupe kept as a deterministic post-pass in plan order (`:828`) — the right call | **already correct; this is the in-repo template for the CD fix** |

### False barriers

- **`localization_director` joins behind `asset_reuse`** (`graph.js:2340`). It needs the **storyboard**, not the assets. This join is incidental and the node could run parallel to the whole asset chain.
- **`reviewAudio` inside `directAssets`** — an audio verdict gating the return of a curated asset list.
- **CLIP gating the first vision chunk** — the *only* coupling is that `clipRelevance` is inlined into the prompt as a hint (`creative_director.js:~189`). Drop the hint or blend post-hoc and CLIP runs fully concurrent with the LLM review.

### True barriers (do not break)

- `creative_director → visual_layout_director → asset_reuse`: VLD re-levels from `cdScore`; reuse needs **final** placements from `spreadAcrossScenes` to know which slots are empty.
- `motion_planner` needs archetypes from `layoutPlan`.
- **CLIP image embedding** is *not* safely `Promise.all`-able: the ONNX session is a single shared object. The correct fix is **batching** (the processor accepts an array), not concurrency. Auditors #1 and #3 disagreed here — **#1's caution ("must be verified, not assumed") plus #2's batching prescription is the right synthesis.**

### Theoretical best-case critical path

Today, post-`asset_search`-parallelisation, the asset stage is roughly: `asset_prep (~2-4s)` + `CLIP (~2-7s)` + `CD chunks (~36s median)` + `top-up (~10-60s)` + `reviewAudio (~3-10s)` + `VLD/reuse (~0s)`.

With all true-parallel work concurrent:
- CD chunks: **36s → ~12s** (one round-trip)
- thumbnails: folded into the chunk dispatch, **~0s**
- CLIP: batched + concurrent with chunk 1, **~0s incremental**
- top-up: parallel fetch + the existing single review chunk, **~60s → ~15s**
- `reviewAudio`: **→ 0s on this path** (moved to the audio branch)

**Asset-stage critical path: ~55-110s → ~30s.** Against a measured `productionMs ≈ 268-275s`, that is a **~25-30% end-to-end reduction from the CD alone**, with no change to the graph topology beyond moving one node.

---

## 7. Integration seams

| # | Seam | Blast radius | Contract that must not break |
|---|---|---|---|
| 1 | **`creative_director.js:317-326`** — the chunk loop | `creative_director.js` only | Verdicts merge by **absolute** index (`baseIndex + i`), already collision-free. Preserve the **per-chunk try/catch fail-open** (`:~322`): a dead chunk must leave its assets untouched, not poison the batch. Bound concurrency with `p-queue` (installed, unused) — the LLM rate limit is modelled nowhere |
| 2 | **`creative_director.js:606`** — `reviewAudio` | `directAssets` return shape; `onReview` handoff at `:~700` | It reaches `audio_director` **only** via `onReview`. `pipeline.js:1359` omits `onReview` entirely, so on that path the verdict is paid for and dead-ends in the DB. Moving the call must not silently drop the handoff on the other two call sites |
| 3 | **`graph.js:796`** — the `acquire()` call | `asset_sources` ranking for stock only | `acquire` already accepts `targetRatio` (`asset_sources/index.js:56`) and `scoreCandidate` already implements aspect-fit. `mediaPlan.aspects` is in scope via `s.mediaPlan`. **Preserve `rankCandidates`' "keep them if that would leave nothing" escape (`util.js:~328`)** or empty placeholders multiply. `aspectFit`'s 0.62 floor (`util.js:~311`) is too soft to matter once ratios are authoritative — tighten deliberately |
| 4 | **`asset_reuse.js:625`** — `const prominentSlot = true` | every reuse placement on every pack | The comment justifying it ("one-per-scene slots are the scene's visual") **is no longer true** — `buildSlots:266-269` now emits placeholder-granular slots. Replace with the placeholder's declared `priority`. Without this, `:351`'s trusted-asset veto sends every minor tile to the decorative fallback |
| 5 | **`asset_priority.js:82-84`** — `rankKey` | `creative_director.js:502` (per-scene cap) **and** `visual_layout_director.js:76` simultaneously | `tier*1000` is the house law (`asset_priority.js:12-14`). A quality term added as a minor key **cannot** demote a blurry upload out of a hero — that is a product decision. **`om_port_kit.js:612` does not use `rankKey` at all** (raw `cdScore`, tier-blind); fix it in the same change or ~15 packs will rank in contradiction |
| 6 | **`scene_kit.js:1617`, `:1638`** — `scrimBg`/`videoBg` | the most common placement in the library | Add `object-position:${kitCropFocus(asset, w, h, "center center")}` — `kitCropFocus` already exists at `scene_kit.js:70`. Purely additive |
| 7 | **`creative_director.js:80-97`** — `packContext` | the CD prompt; model output schema | **The only string describing the template to the model**, and it contains no count, dimension or slot. Add a media plan summary + an optional `assignSlot` alongside `assignScene`. **Do NOT copy the `validSceneIds` silent-drop pattern at `:349`** — log unknown slot ids. Keep `assignScene` so the change is additive |
| 8 | **`creative_director.js:~1049`** (in `creativeDirectorAgent`) — the second `computeAssetBudget` | `cdMaxTopUp` only | **Already broken**: the planner's budget is template-raised (`graph.js:462`), this recompute is the bare floor. Thread the budget through a state channel; `mediaPlan: Annotation()` at `graph.js:2274` is the precedent |
| 9 | **`asset_sources/index.js:~209`** — `localDb.register` | the file cache | Persist the **full** meta (incl. `sharpness`/`stdev`) so a cache hit scores identically to a fresh fetch. Without it, `asset_quality` grades cached and fresh copies of the same file differently |
| 10 | **`creative_director.js:115-123`** — `SCORE_WEIGHTS` | every consumer of `cdScore` | `normScores:~156` makes a **missing dimension inherit the mean of the present ones**. Adding always-present deterministic dimensions makes absent *model* dimensions inherit the deterministic mean — laundering a measured value into a judged one. **Compute deterministic and model scores separately and blend explicitly.** `asset_quality.qualityScore` already lives beside `cdScore` in `visual_layout_director.js:79`; keep them separate |
| 11 | **`graph.js:2286-2305` / `:2307-2376`** — node registry & edges | graph compile | `asset_prep` (`:2292`, `:2326`, `:2330`) is the **in-repo template** for a new asset sub-node. Fan-out must return **disjoint** partitions — see §8 |
| 12 | **`preflight.js:255`** — `criticalPlaceholdersFilled` | render gating | Already **FAIL** for authored plans. All 46 packs are authored, so **this gate is live for every film today**. Any change to placeholder counts changes what blocks |
| 13 | **`frame_manifest.js:~322`** — `MediaSchema` boot validation | server boot | `validateAll` (`:254`) now validates `media` against `template_media`'s own schema. It **never throws** — a bad block warns and derives. Adding required fields to `MediaSchema` silently degrades packs to derived plans rather than failing loudly |

---

## 8. Landmines

**Re-read the tree before you write.** Eleven auditors described `template_media`/`crop_engine`/`asset_quality` as dead code. They are wired *now*. They are still `??` untracked in git — **commit them before anyone else pulls**, or the wiring in `graph.js` will crash on a fresh clone (`graph.js:456`, `:944`, `:945` are unguarded `require`s inside `try` blocks only at `:456`; `:944-945` are **not** in a try).

**LangGraph node names must not collide with state channel names.** Stated at `graph.js:2283-2284` and the reason `storyboard_agent` and `qa_agent` carry `_agent` suffixes. Channels live at `graph.js:2268-2281`.

**State channels are plain `Annotation()` with no reducers.** `graph.js:2268-2281`. Two parallel nodes both returning `assets` will **silently keep only one** — last write wins, the other branch's work vanishes with no error. Any asset fan-out must return disjoint partitions merged by an explicit reducer.

**`buildGraph` is memoised into module-level `compiledGraph`.** Topology changes need a **process restart**, not just a file save. Ordinary service edits hot-reload (`pipeline.js:133` re-stats composer modules on mtime); graph topology does not.

**The repair lap runs OUTSIDE the graph.** `repairAgent` (`graph.js:2195`) manually re-runs composition→animation→timeline. **Any new asset-prep node will NOT re-run on a repair lap** — `mediaPlan`, crop annotations and quality scores must be idempotent and already present in state before the first composition.

**`preflight` runs only on the first pass.** `if (!s.qa) validateBeforeRender(s)` — a repaired film is never re-gated.

**The fail-open disclosure law.** `reviewAndCurate` (`creative_director.js:~708`) returns the **original untouched array** on any throw. That is not graceful degradation: `cdScore` becomes `undefined`, `visionOk` becomes `undefined`, every composer's `cdScore || 0` sorts everything equal, and `scene_kit.prominentOk` falls back to source trust alone. **A silent CD outage deletes the entire ranking rather than softening it.** Any fan-out must preserve per-branch fail-open *independently* — `assetPrepAgent` already models this correctly (`graph.js:962`, each lane individually `.catch()`-ed).

**The report is not the decision.** Only fields written onto the **asset objects** are load-bearing. `report.screenshotRankings`, `report.storytellingRecommendations` and `report.qualityFloor` have exactly one consumer between them: `web/src/screens/ProductionTheater.jsx:144`. Anything the CD "decides" that lives only in the report **does not happen.**

**`pack.json` validation is `.passthrough()`** (`frame_manifest.js:~209`) and every field has a default. Unknown keys survive **unvalidated** — which is exactly how `media` was added without a schema change. Consequence: a typo'd media block does not fail, it silently derives. `getManifest` (`:221`) returns **null on both "missing file" and "validation failure"**, so a broken manifest is indistinguishable from an absent one at the call site.

**`FRAME.md`, not `pack.json`, is what makes a directory a pack** (`frame_registry.listPacks:39`). A `pack.json`-only directory is invisible to the registry.

**The CD deletes files.** `creative_director.js:~533` `fs.unlinkSync` on every rejected web-stock asset, plus `:449-461` for screenshots over 35% popup coverage. No dry-run, no quarantine, no undo, and it happens before any downstream stage can object.

**SVGs are never scored.** `thumbBase64` is ffmpeg-only (`media.js:48`) and ffmpeg cannot read SVG ⇒ null thumb ⇒ filtered out of `usable` at `creative_director.js:~173` ⇒ **no verdict at all**. They reach composers with `cdScore` undefined, and every `sort((a,b) => (Number(b.cdScore)||0) - ...)` ranks them dead last. The CD does not reject them — it never sees them.

**`priorityTier: 100` is decorative.** `user_assets.js:77` writes it; `tierFor` (`asset_priority.js:39-47`) keys entirely off the `source` **string**. The comment at `user_assets.js:62` is false. Change `source` and the tier law silently inverts; change `priorityTier` and nothing happens.

**Two fields are named `qualityScore` and they are different numbers.** `website_assets.scoreAssetQuality:140` (harvest-only, disclosure-only) and `asset_quality.js:314` (deterministic, feeds `visual_layout_director.js:79`). `assetPrepAgent` overwrites the former for harvested assets. Do not assume a `qualityScore` on the wire came from the engine you think.

**`om_stage.js:324` — a VLD demotion is a DELETION.** `shotOk` rejects `__layoutDemoted` outright on the 7 OM skins, directly contradicting the VLD's own header promise that no asset is discarded. It is patched by a reserve list at `:344`, not fixed. **Any change to demotion semantics must be checked against every composer's asset gate individually.**

**Three dead modules — do not tune them expecting effects.**
- `asset_planner.js` (the LLM planner, 14-image cap): required only by `pipeline.js:236`, the legacy `/api/generate` path. Production is `orchestrator: "langgraph"`.
- `asset_vision.js`: `graph.js` runs `checkAssetsRelevance` only `if (!config.creativeDirector.enabled)`, and the CD defaults to enabled. Its singular `checkAssetRelevance` has **zero call sites anywhere**. It still carries the most detailed reject-criteria prompt in the repo, unreachable.
- `embeddings.js` and `pixabay_visual.js`: **zero requires repo-wide.** Do not confuse `embeddings.js` with `asset_clip.js`, which is genuinely live.

**The curated library is OFF** (`asset_sources/index.js:23`, `USE_CURATED_LIBRARY === "1"`). Tier 60 is inert, `kindPref` never reaches `curated.search`, `excludeIds`/`usedLibraryIds` are best-effort decoration, and `CURATED_ONLY_IMAGES=1` becomes a hard `return null` that starves photos entirely.

**`pixabay_bridge.enabled()` never consults `bridgeReachable`** (`pixabay_bridge.js:116`) — the one-shot unreachable latch is wired into `firstAudioUrl` (audio) only. A **hung** (not refused) bridge costs 30s per query variant per vector need.

**Pixabay's parallel-keyword design is never exercised.** `pixabay/index.js:117-120` `Promise.all`s keywords, but `asset_sources/pixabay_api.js:27` always passes `keywords: [query]` — exactly one.

**Stale `job` reads.** `scenePlannerAgent` reads `s.job.frame_pack` (`graph.js:~418`) for the audio profile, but `frameSelectorAgent` may have swapped the pack (orientation reroute, localization reroute) and persisted it. `s.job` is the row snapshot taken at `runProductionGraph` entry — **the read is stale.** Same bug in `voiceAgent` (two sites) while a neighbouring line correctly uses `s.framePack`.

**`visualDirection` is dropped on the primary path.** It is not in `continuity.js`'s `ENRICHMENT` list (`:39-42`) and not among the fields copied from the script (`:112-143`), so on the **LLM storyboard path** it never reaches the storyboard. It survives only on the deterministic `storyboardFromScript` fallback. Yet `layout_planner.sceneText:38` reads `scene.visualDirection` when typing archetypes — **archetype typing is quietly weaker on the normal path than on the failure path.**

**The runtime builds `AssetNeed`s the schema forbids.** `graph.js:~504`, `:~532` construct `role: "icon"`, which `script.js:20`'s zod enum (`background|inset|texture`) does not permit. It works only because these are built **after** validation. Any future schema tightening breaks the gap-fill.

**`asset_reuse` reports three numbers that must be read together.** `emptyPlaceholders` counts `!filled`; `assetCoverage` is computed over `filled` only; `slotsFilledDecorative` is reported separately. A decorative slot is neither filled nor empty in the same sense. **Read all three or the report lies by omission** — and it has no way to verify the chosen composer draws anything in a decorative slot at all.

**`cropFocus` is a CSS `object-position` string.** `asset_reuse.js:~455` and `qa_agent.js:131` pass it through **as text**. Changing its type breaks both. `asset_reuse.variationFor` also **overwrites** a clone's `cropFocus` unless the category is in `CROP_LOCKED` (`asset_reuse.js:174`) — a reuse will discard a measured focal point unless `CROP_LOCKED` is widened or the variation writes to `__variant` only.

**`util.js:~327` declares a local variable literally named `sharp`**, which will shadow a module-level `require("sharp")`. And the comments at `util.js:97` and `:167` asserting "no native module (sharp), per repo policy" are **stale** — `sharp`, `smartcrop` and `smartcrop-sharp` are in `package.json` and installed. Retire the policy comment explicitly or the next reader rips the dependency back out.

**`project_pipeline.js` is a near-complete second implementation and is NOT the live path** (`orchestrator: "langgraph"`). It has **no Visual Layout Director** (`layoutPlan` is passed as `null`), no scene_planner beats, and it **drops `width/height/ratio/hasAlpha/dhash/dominantColor`** from acquired assets — a bug `graph.js` explicitly fixed with a comment. On that path every screenshot defaults to a browser frame and palette affinity reads neutral for everything. **It is what `test-production-integration.js` exercises, so the live path's asset chain is not covered by the main integration test.**

---

### Recommended Phase-1 ordering

1. **`asset_reuse.js:625`** `prominentSlot = true` → placeholder priority. One line; unblocks the multi-slot model that just landed.
2. **`creative_director.js:317-326`** parallel chunks + `:168-172` parallel thumbs. ~20-30s, contained to one file, pattern proven at `graph.js:815`.
3. **`creative_director.js:606`** move `reviewAudio` off the asset path.
4. **`graph.js:~1049`** thread the budget instead of recomputing — the template/CD budget divergence is live today.
5. **`graph.js:796`** pass `targetRatio` from `s.mediaPlan.aspects`. Two lines; the ranker is already written.
6. **`scene_kit.js:1617`,`:1638`** add `object-position`. Purely additive, hits the most common placement in the library.
7. **`om_port_kit.js:612`** `rankKey` instead of raw `cdScore` — restores the tier law on ~15 packs.
8. **`graph.js:~539`** replace boolean pin-suppression with `N placeholders − M pinned`. Highest quality impact, largest blast radius; do it last, behind the `asset_render_check` harness.