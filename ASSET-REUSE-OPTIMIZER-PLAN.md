# Intelligent Asset Reuse System — Design & Integration Plan

**Status:** design, not yet implemented · **Date:** 2026-07-30 · **Branch:** Rohit

Every claim below is cited to current code. Where the requested behaviour **already
exists**, this document says so rather than re-specifying it — the genuinely missing
piece is much smaller and much more surgical than the brief assumes, and shipping only
the missing piece is what keeps this from regressing 43 templates.

---

## 0. Executive summary

### What is actually broken

The pipeline already distributes assets well. `visual_layout_director.spreadAcrossScenes`
(`server/src/services/visual_layout_director.js:130`) implements *"every scene gets ONE
asset before any scene gets TWO"*, and its own comment carries the measurements that
motivated it. What it **cannot** do is cover more scenes than there are assets, because
**it moves assets, it never duplicates them**. With 6 assets and 9 scenes, 3 scenes are
structurally uncovered and nothing downstream can fix it.

Everything else follows from that one arithmetic gap plus **one `if`**:

```js
// scene_kit.js:1930
const propEligible = noVisual && W > H && (p.build === archHook || …);
//                               ^^^^^^^ landscape only
```

That single `W > H` is why the symptom is worst in 9:16 — the format the brief is about.
The two reported symptoms are the two branches of this condition:

| Aspect | Scene with no asset renders as… | Reported as |
|---|---|---|
| Landscape (`W > H`) | `buildPropFill` — a **fake dashboard**: fake header dot, two fake text rows, a six-bar fake chart (`scene_kit.js:1280-1317`) | "demo or placeholder graphics" |
| **Portrait 9:16** | **nothing** — pure typography on the pack ground | "empty asset placeholders", "videos feel incomplete" |

So "blank containers" and "demo filler" are not two bugs. They are one missing fallback
tier, rendered two ways.

### What the fix is

One new pure module, `services/asset_reuse.js`, and one new graph node, inserted exactly
where the brief asks for it. It **clones** high-scoring assets onto uncovered scenes under
a hard usage ceiling, with deterministic per-instance visual variation.

The load-bearing design decision: **a reused asset is a second entry on the asset wire,
not a mutated first entry.** Because `scene_kit.partitionAssets` (`:1322`) pushes every
wire entry into a pool and the weave then consumes pools with `shift()`/`splice()`, a
clone *is automatically* a second placeable unit. The reuse optimizer therefore needs
**zero changes to the weaving logic of any of the 43 packs**. It changes what is on the
wire; the existing composers do the rest.

---

## 1. Root cause analysis

### RC-1 — `spreadAcrossScenes` moves, never duplicates *(the primary cause)*

`visual_layout_director.js:130-182`. Builds `surplus` = everything beyond the first asset
on over-subscribed scenes, then relocates it to `uncovered` scenes nearest its origin.
`open.splice(...)` consumes each target once, and the loop `break`s when `open` empties.

Coverage ceiling is therefore `min(placeableAssets, sceneCount)`. Its own comment records
real films at 3-of-9 and 4-of-8 coverage. **This is arithmetic, not taste**, and it is the
only cause that reuse — as opposed to better ranking — can address.

### RC-2 — the decorative fallback is landscape-gated

`scene_kit.js:1926-1936`. `propEligible` requires `W > H`. Portrait and square get no
fallback of any kind. Directly explains "9:16 videos look unfinished".

### RC-3 — the landscape fallback *is* the demo content

`buildPropFill` (`scene_kit.js:1280`) draws a synthetic SaaS card: `<circle>` window dot,
two grey `<rect>` text rows, and `hts = [0.42, 0.66, 0.5, 0.82, 1.0, 0.72]` as a hardcoded
bar chart. It is well-crafted and on-palette, but it depicts a **product that does not
exist**. That is precisely "generic demo content".

Note the 14 native composers already solved this correctly with abstract brand geometry —
*"an intentional branded placeholder (gradient wash + faint holographic grid + glowing
node) so an empty slot still reads as designed"* (`ai_laboratory_composer.js:186`,
`glass_dimension_composer.js:166`, `neo_dashboard_composer.js:219`, and 11 more). The
pattern exists; scene_kit is the outlier.

### RC-4 — pools are destructively drained with a hard `break`

`scene_kit.js:1871-1887`:

```js
for (const p of weavable) {
  if (p.ctx.asset || p.ctx.assets) continue;
  if (!leftover()) break;              // ← every later scene gets nothing
```

and Pass 2's B-roll chain (`:1902`) is `shift() || shift() || shift() || shift()` — all
`undefined` once drained, so `p.ctx.bgAsset` stays unset. There is no "reconsider an
already-used asset" branch anywhere in the weave.

### RC-5 — VLD demotion is *deletion* on the OM family

VLD demotes beyond-budget assets intending "still usable as atmospheric B-roll"
(`visual_layout_director.js:227-233`, comment at `:18`: *"no asset is discarded"*). But:

```js
// om_stage.js:324
if (a.__layoutDemoted) return false;   // shotOk → excluded from `shots` entirely
```

On the 7 OM packs a demoted asset is **invisible, not demoted**. Demotion shrinks the
usable pool below what the film needs — actively causing the empty scenes it was meant to
prevent. A real bug independent of reuse; fix alongside.

### RC-6 — no asset carries usage state

Nothing on an asset records how many times or where it was used. `usedAssets` is
assembled **after** composition purely for coverage disclosure (`scene_kit.js:2019-2026`).
No component can enforce a reuse ceiling or reason about scene distance, because the data
does not exist until it is too late to act on.

### RC-7 — native composers index past the end of the pool

`om_stage.js:711`: `cells = Array.from({length: n}, (_, i) => ({ a: shots[i] || null, … }))`
where `n = max(shots.length, min(4, max(2, labels.length)))`. With 1 shot and 4 labels, 3
cells resolve to `null` → branded placeholder. Correct degradation, but it is *degradation*
— the tile wall exists precisely because the film has material to show.

### RC-8 — the gap is already detected and already ignored

`preflight.everySceneHasVisual` (`preflight.js:121-128`) computes exactly this and reports:
*"N of M scene(s) have NO renderable visual (…) — these will render as empty template
panels"*. It is `WARN`, per the fail-open house law, and **nothing reads it**. The
diagnosis has shipped for weeks; the remediation never did.

### Not root causes (already handled — do not "fix")

- **Semantic assignment.** The Creative Director assigns `a.sceneId` per asset and
  scene_kit honours it via `sameScene` (`scene_kit.js:1821`, `:1846-1855`, `:1879`).
- **Quantity.** `asset_budget.computeAssetBudget` scales collection by duration + scene
  count; CD top-up scales with it (`graph.js:427`, `:801`).
- **Content-critical protection.** The weave deliberately refuses to overwrite
  stat/quote/CTA archetypes with asset layouts (`scene_kit.js:1829-1835`) — reuse must
  respect this or it will delete testimonials and metrics.

---

## 2. Pipeline placement

```
Asset Collection            asset_planner → asset_search
        ↓
Asset Intelligence Agent    creative_director        (scores, prominence, sceneId)
        ↓
Asset Scoring & Ranking     asset_priority.rankKey   (tier-first)
        ↓
Scene-to-Asset Assignment   visual_layout_director   (reduce, crop, spread)
        ↓
Asset Reuse Optimizer       asset_reuse              ★ NEW
        ↓
Template Rendering          composition → renderer
```

Graph rewire in `src/agents/graph.js` — one edge changes:

```diff
  g.addEdge("creative_director", "visual_layout_director");
+ g.addEdge("visual_layout_director", "asset_reuse");
- g.addEdge(["visual_layout_director", "caption_director"], "localization_director");
+ g.addEdge(["asset_reuse", "caption_director"], "localization_director");
```

Deterministic and free (no LLM, no I/O), so it adds no measurable latency and needs no
budget wrapper. It runs **before** `motion_planner`, which lets reused instances request
distinct entrances from the planner's own vocabulary instead of inventing new ones.

The legacy `project_pipeline.runProduction` path gets the same call before
`attemptLlmComposition` (`project_pipeline.js:805`), so the two orchestrators cannot drift
— the house pattern already used for `pinUserAssets` / `pinWebsiteAssets`.

---

## 3. The asset ledger

The unit of state that RC-6 says is missing. Built at the top of the optimizer, carried on
the wire, persisted for disclosure.

```js
{
  assetId:      "assets/images/site_0.png",  // jobDir-relative path — the stable identity
  instanceId:   "site_0#1",                  // path + occurrence, unique per placement
  category:     "screenshot",                // asset_priority.categorize (10 canonical values)
  tier:         80,                          // asset_priority.tierFor (upload 100 → stock 40)
  qualityScore: 91,                          // cdScore, else confidence×100, else tier proxy
  sceneAssignments: ["s2", "s6"],            // every scene this asset appears on
  usageCount:   2,
  reuseEligible: false,                      // usageCount < MAX_USES (logo exempt)
  isLogo:       false,
  ratio:        1.78,
  dhash:        "9f1c…",                     // perceptual hash — diversity comparisons
  dominantColor:"#1b2a4a",
  variation:    { cropFocus: "top center", container: "browser", enterFx: "rise", scale: 1.0 }
}
```

`dhash` and `dominantColor` are already computed for every fetched image and already
carried onto the wire (`graph.js:732`) — the ledger consumes existing data.

**Identity is `path`, not object reference.** Clones share a path deliberately: it makes
`asset_coverage.coverageFromUsed` (which keys a `Map` by path, `asset_coverage.js:73`)
count one asset used, not two — which is the truth.

---

## 4. The reuse decision algorithm

```
optimizeAssetReuse({ assets, script, storyboard, layoutPlan, framePack, dims, seedKey })
  → { assets, reusePlan, review }
```

Pure. Fail-open: any throw returns the inputs untouched.

### Phase 1 — Ledger
Build a row per wire asset. Seed `sceneAssignments` from existing `a.sceneId`, so anything
the CD/VLD already placed starts at `usageCount: 1`.

### Phase 2 — Demand
Compute the slots the **chosen composer can actually draw**. This is the step whose absence
om_stage's own comment warns about (`om_stage.js:554`: *"surplus shots were routed onto
beats already at capacity and silently vanished"*). Never assign into a slot that will be
sliced away.

```js
slotDemand(framePack, storyboard, layoutPlan) → [{ sceneId, role, archetype, capacity, filled }]
```

Capacity resolution, in order:
1. **Renderer capacity table** (new, in `asset_reuse.js`) — seeded from ground truth:
   `om-*` → `om_stage.SHOT_CAPACITY` (`hook 1, statement 1, stats 1, feature 4, montage 4`);
   `product-showcase` → plate count by `shots.length` (`product_showcase_composer.js:368`).
2. **scene_kit archetypes** — `archScreenshotHero`/`archSplitVector` → 1,
   `archAssetMontage` → `layoutPlan.__montageMax`, `archText` → 1, plus 1 B-roll slot per
   non-hook scene (Pass 2).
3. **Default** — 1 per showcase-capable scene (`scene_role.SHOWCASE_ROLES`), 0 for
   `quote`/`cta`/stat archetypes, matching the weave's content-critical guard.

Export a `CAPACITY_UNKNOWN` sentinel for un-tabled packs and treat it as "1, and do not
over-fill" — pessimistic, so an unmapped pack can never be handed material it discards.

### Phase 3 — Coverage (unused first)
Uncovered slots in narrative order. Assign genuinely unused assets first. This is the
"exhaust all unique assets before reusing any" rule, and it is nearly free because VLD's
spread already did most of it — this pass catches assets VLD demoted or left unassigned.

### Phase 4 — Reuse
For each still-empty slot, score every `reuseEligible` asset and clone the winner:

```js
const clone = {
  ...winner,
  sceneId: slot.sceneId,
  startSec: scene.start,
  durationSec: scene.duration,
  __reuseOf: winner.path,
  __reuseInstance: ledger.get(winner.path).usageCount,  // 1 for the 2nd appearance
  ...variationFor(winner, slot, seedKey, instance),
};
assets.push(clone);
```

Stop when: no eligible asset scores above `MIN_REUSE_SCORE` (40), or every slot is filled.

### Phase 5 — Decorative fallback
Slots still empty get `slot.decorative = true`, consumed by the composer (§8). No blank
container survives this phase.

### Phase 6 — Report
Emit `reusePlan` + `review` for persistence and validation (§9, §10).

---

## 5. Scoring & prioritisation

```js
reuseScore(asset, slot, ledger, film) =
    30 × semanticFit        // category ↔ scene role
  + 20 × qualityNorm        // qualityScore / 100
  + 15 × recencyGap         // scene distance since last appearance
  + 12 × visualDiversity    // unlike this slot's neighbours
  + 10 × usageHeadroom      // unused ≫ used once
  +  8 × aspectFit          // asset ratio vs slot geometry
  +  5 × compositionFit     // crop headroom / text-safe area
  −  ∞ hardVeto
```

**Hard vetoes** (return `-Infinity`; a veto is never a low score, so it can never be
out-weighted):

| Veto | Rule |
|---|---|
| Ceiling | `usageCount >= MAX_USES` (2), logo exempt |
| Adjacency | last appearance is the immediately-previous scene, unless `narrativeCentral` |
| Type | video into an `<img>` slot; vector into a pack where `packAcceptsVectors === false` |
| Trust | `!isTrustedProminent && cdProminence !== hero|support` into a **prominent** slot — preserves the existing prominent-slot trust gate (`visual_layout_director.js:74`) |
| Integrity | file missing on disk (preflight's self-heal rule, applied pre-emptively) |

**Components:**

- `semanticFit` — the §6 matrix, `1.0 / 0.6 / 0.25 / 0.0`. A table lookup on
  `(categorize(asset), roleOf(scene))`, memoised: 10 × 7 = 70 possible pairs.
- `qualityNorm` — `cdScore/100`, else `assetConfidence(a)` (`asset_priority.js:140`), else
  `TIER_CONFIDENCE[tier]`. Never invents a score.
- `recencyGap` — `min(1, sceneDistance / MIN_GAP)` with `MIN_GAP = 3`. Distance 1 is
  already vetoed; 2 → 0.67; ≥3 → 1.0.
- `visualDiversity` — `1 − maxSimilarity(asset, neighbourAssets)`. Similarity is
  `0.7 × dhashSimilarity + 0.3 × colorProximity`; dhash similarity is
  `1 − hamming(a,b)/64` on the hashes already on the wire. Prevents two near-identical
  captures landing in adjacent scenes.
- `usageHeadroom` — `1.0` unused, `0.35` used once. Keeps unused assets winning without
  making reuse impossible when nothing is unused.
- `aspectFit` — `1 − min(1, |log(assetRatio / slotRatio)| / log(3))`. Log-space so
  over- and under-wide mismatches are penalised symmetrically. Unknown ratio → `0.5`
  (neutral, never a veto).
- `compositionFit` — is the crop lossless? A `cover` fit whose aspect mismatch exceeds
  ~35% will visibly cut content, so it scores `0.4`; `contain` slots (screenshots, vectors)
  always `1.0`.

Weights are deliberately in the range 5–30 so the whole score reads 0–100 and is
loggable. `MIN_REUSE_SCORE = 40` means "a genuinely bad fit is left to the decorative
fallback rather than forced in" — a reuse that fights the scene is worse than abstract
brand geometry.

---

## 6. Scene-aware reuse matrix

The brief's preference lists, mapped onto the two canonical enums already in the codebase
— `scene_role.ROLES` (`scene_role.js:26`) and `asset_priority.CATEGORIES`
(`asset_priority.js:97`). This is an extension of the existing
`asset_taxonomy.PURPOSE_KIND` (`:88`), which already encodes the same intent at coarser
granularity; the matrix must stay consistent with it or the collection stage and the reuse
stage will pull in opposite directions.

| Scene role | 1.0 — ideal | 0.6 — good | 0.25 — weak | 0.0 |
|---|---|---|---|---|
| `hook` | product, screenshot | marketing, illustration | dashboard, team | icon, decorative |
| `context` | marketing, illustration | product, team | screenshot | icon |
| `feature` | screenshot, dashboard | product, icon | illustration | team, decorative |
| `how` | screenshot, dashboard | icon, illustration | product | team |
| `proof` | dashboard, team | screenshot, product | marketing | icon, decorative |
| `quote` | team | product | marketing | screenshot, dashboard, icon |
| `cta` | logo, product | illustration, icon | marketing | screenshot, dashboard, team |

`background` and `decorative` categories score `0.25` everywhere — placeable as B-roll,
never as a prominent statement.

Two rules the matrix enforces that the current weave cannot:
- A **dashboard/analytics** capture is the *ideal* proof-scene visual (the brief's
  "Benefits → analytics, graphs"), where today it is merely "a screenshot".
- A **team/people** photo is ideal for `quote` and near-vetoed for `feature`, which stops
  the recurring failure of a stock office photo standing in for a UI walkthrough.

---

## 7. Visual variation engine

Reuse is only acceptable if the second appearance does not read as a repeat. All variation
is **deterministic** — seeded `mulberry32(hash(seedKey + path + instance))` — because the
renderer captures frames by seeking a paused timeline and the codebase forbids
non-determinism at draw time (`composer.js:280`, `om_stage.js:390`).

| Dimension | Instance 0 | Instance 1 | Constraint |
|---|---|---|---|
| Crop focus | `cropFocusFor()` (VLD) | rotate within safe set | Never crops a screenshot's header — `top center` is pinned for `ratio ≥ 1.4 \|\| ≤ 0.9` (`visual_layout_director.js:83`) |
| Container | `deviceKind()` → browser/phone | browser → `card`; phone stays phone | A phone capture in a browser frame is a lie about the product |
| Slot scale | pack default | ±8% | Bounded so it cannot break `heroBox` portrait margins |
| Entrance | motion plan's scene entrance | a *different* verb from the same pack vocabulary | Must come from `motion_planner`'s vocabulary — inventing one trips `verifyMotion` drift detection |
| Rotation | 0° | ±1.5° (flat/poster packs only) | Cinematic/glass packs stay square — rotation reads as a mistake there |
| Background treatment | clean | scrim / tinted wash | Scrim only where text sits over the asset |

Contract: **variation is presentational only.** It may never change *which* pixels of the
subject are visible in a way that hides load-bearing content. That is why crop rotation is
constrained by the existing screenshot rule rather than free.

---

## 8. Decorative fallback (kills RC-2 and RC-3)

Two targeted changes, no new rendering machinery:

**8a. Un-gate the fallback from landscape.** `scene_kit.js:1930` — replace the `W > H`
condition with an aspect-aware placement: landscape keeps the empty-half card; portrait/
square get a **band** treatment (a full-width brand-geometry strip behind or beneath the
copy, sized off `responsive.heroBox` so it respects the same margins the portrait hero
does). The reason for the original gate — *"a floating half-width card would sit behind
the text"* — is real, and a band is the answer to it, not a reason to render nothing.

**8b. Replace the fake dashboard with brand geometry.** Rewrite `buildPropFill`'s payload
to the pattern the 14 native composers already use: a brand-hue gradient wash, a faint
grid or hairline, one glowing accent node, optional pack ornament. It must **depict
nothing** — no fake charts, no fake text rows, no fake window chrome. Keep the function
name, signature, entrance animation and `data-layout-allow-occlusion` attribute so the
occlusion lint and every call site are unaffected.

This alone removes both reported symptoms even before a single asset is reused, which is
why it ships in P0.

---

## 9. Validation rules

Extend `preflight.js` — same `check(id, level, ok, detail, fix)` shape, same fail-open law.
**None of these become blocking.** The house rule is that only genuinely unrecoverable
states fail a job (`preflight.js:19-23`), and "a scene used a reused asset" is the
opposite of unrecoverable — it is the remedy.

| Check | Level | Asserts |
|---|---|---|
| `noEmptyContainers` | WARN | every demanded slot has an asset **or** an explicit decorative fallback |
| `reuseWithinLimits` | WARN | no non-logo asset exceeds `MAX_USES` |
| `reuseSemanticallySound` | WARN | every reuse scored ≥ `MIN_REUSE_SCORE` |
| `noAdjacentRepeat` | WARN | no asset on consecutive scenes unless `narrativeCentral` |
| `noPlaceholderContent` | WARN | no fallback renders synthetic UI (guards 8b against regression) |
| `everySceneHasVisual` | WARN | **existing** (`:121`) — now genuinely informative, because failure means the optimizer *could not* fix it |

Post-render, extend `asset_render_check.auditAssetRender` to count **rendered instances per
path**, so the audit can distinguish "asset rendered twice as designed" from "asset
rendered twice by accident". Today it counts distinct paths only (`asset_render_check.js:59`).

---

## 10. Reporting

Extend the existing `asset_usage_report.js` rather than adding a parallel report — it is
already built at the post-composition choke point and already persisted by both
orchestrators (`graph.js:1258`, `project_pipeline.js:980`). Add a `reuse` block carrying
the brief's exact field names:

```json
{
  "reuse": {
    "totalAssetsCollected": 12,
    "uniqueAssetsUsed": 12,
    "reusedAssets": 4,
    "maximumReuseCount": 2,
    "emptyPlaceholders": 0,
    "placeholderContentUsed": false,
    "assetCoverage": "100%",
    "slotsDemanded": 16,
    "slotsFilledUnique": 12,
    "slotsFilledReuse": 4,
    "slotsFilledDecorative": 0,
    "ledger": [
      { "assetId": "hero-dashboard.png", "type": "Screenshot", "qualityScore": 97,
        "sceneAssignments": [2, 6], "usageCount": 2, "reuseEligible": false }
    ],
    "decisions": [
      { "sceneId": "s6", "chose": "hero-dashboard.png", "score": 78,
        "because": "semantic 1.0 (dashboard→proof), gap 4 scenes, crop varied to center",
        "runnerUp": { "path": "team-photo.jpg", "score": 51 } }
    ]
  }
}
```

`decisions` is the auditability requirement: when a film reads repetitive, this says which
asset was chosen for which slot and what beat the runner-up. Cap it at ~20 rows.

Persist via a new `db.setAssetReuseReport(id, report)` following the ~25 existing
`set*Report` methods, and surface it in the Premiere panel next to the coverage disclosure.

---

## 11. Performance

Negligible, and worth stating precisely so nobody optimises the wrong thing.

- **Complexity** — `O(slots × assets)` scoring. Realistic worst case: 24 scenes × ~2 slots
  × 40 assets ≈ 1,900 evaluations, each a handful of arithmetic ops and one memoised table
  lookup. Sub-millisecond. Compare: one Chromium render is 30–240 s.
- **Memory** — clones are shallow spreads of small metadata objects. 40 assets → ≤ 8 extra
  objects, a few KB. **Image bytes are never duplicated** — clones share `path`, so the
  file is read once by the browser and cached.
- **No I/O, no LLM, no vision.** No new API spend. It *reduces* spend by making CD top-up
  fetches (`cdMaxTopUp`, up to 6 net-new assets/film) less necessary.
- **Memoise** `semanticFit` (70-pair table) and dhash Hamming distances per asset pair.
- **Avoid** `JSON.parse(JSON.stringify())` for cloning — shallow spread is correct and
  ~100× faster; a deep clone would also duplicate the ledger back-reference.
- **Render cost is flat.** A reused asset adds one `<img>` referencing an already-decoded
  file. It does not add a fetch, a decode, or a frame.

The one real cost to watch: 8b changes `buildPropFill`'s SVG on **every** scene-kit film,
so it must be render-verified on both a light (`biennale-yellow`) and a dark
(`midnight-glass`) pack before merge.

---

## 12. Integration plan

### P0 — Stop shipping blank and fake containers *(highest value, lowest risk)*
1. `scene_kit.js:1930` — un-gate the decorative fallback from landscape (8a).
2. `scene_kit.js:1280` — replace the fake dashboard with brand geometry (8b).
3. `om_stage.js:324` — stop treating `__layoutDemoted` as exclusion; route demoted assets
   to backing-plate slots as VLD intended (RC-5).
4. Render-verify: 9:16 scene-kit pack, landscape scene-kit pack, one OM pack.

**P0 alone resolves both reported symptoms.** Ship it independently of the rest.

### P1 — The optimizer
5. New `services/asset_reuse.js` — ledger, `slotDemand`, scoring, clone, `reusePlan`.
6. New `asset_reuse` graph node + the one-edge rewire (§2); same call in
   `project_pipeline.runProduction`.
7. `scripts/test-asset-reuse.js` + `npm run test:reuse`, wired into `npm test`.
   Characterization style, following `test-taxonomy-golden.js` — pin scoring, vetoes,
   ceiling, adjacency, and byte-identical no-op when assets ≥ slots.

### P2 — Make reuse invisible
8. Variation engine (§7), including the motion-planner vocabulary handshake.
9. Report + `db.setAssetReuseReport` + Premiere panel (§10).
10. Preflight checks (§9) + per-instance render audit.

### P3 — Breadth
11. Renderer capacity table for the remaining native packs (start with the 7 OM skins from
    `SHOT_CAPACITY`, then `product-showcase`, `prisma`, the 12 imported portrait packs).
12. Teach the QA agent that intentional reuse is not a defect, so it stops reporting
    varied second appearances as repetition.

### Kill switch & defaults
`config.assetReuse = { enabled, maxUses: 2, minGap: 3, minScore: 40, allowLogoReuse: true }`
with `ASSET_REUSE=0` / `ASSET_REUSE_MAX_USES` env overrides — the house pattern from
`creativeDirector` / `artDirector` / `visualLayoutDirector`. Default **on**, because the
default behaviour it replaces is a blank frame.

### Non-negotiable invariants
- **Fail-open.** Any throw returns the wire untouched. A reuse failure never fails a job.
- **Byte-identical no-op.** When `slots ≤ uniqueAssets`, the wire must be unchanged.
  This is the primary regression test — it protects all 43 packs.
- **Never overwrite content-critical archetypes.** `archStat`, `archQuoteCard`, `archCta`
  keep their content; reuse fills B-roll/backing slots there or nothing
  (`scene_kit.js:1829-1835`).
- **Tier law holds.** Reuse must never place a stock photo where an unused upload could go;
  score with `asset_priority.rankKey`, which is tier-first by construction.

---

## 13. Success criteria → verification

| Criterion | How it is verified |
|---|---|
| Every container shows meaningful content | `preflight.noEmptyContainers` + post-render instance audit |
| No blanks or demo filler when reuse is possible | `noPlaceholderContent`; 8b removes the only synthetic-UI emitter |
| Max 2 uses, logo exempt | `reuseWithinLimits`; ceiling is a hard veto, not a preference |
| Reuse feels natural | Variation engine; QA vision verdict on the rendered MP4 |
| 9:16 films look complete on a thin asset set | Render a 9:16 film with 3 assets / 9 scenes on scene-kit, an OM pack, and a Three pack |
| No regression | `npm test` green (15 suites) + byte-identical no-op test + golden-composer diff |

---

## Open questions

1. **`MAX_USES = 2` on long films.** A 120 s / 16-scene film with 4 assets needs ~16 slots;
   4 assets × 2 = 8. Half the film still falls to decorative. Should the ceiling scale
   with duration (e.g. `2 + floor(sceneCount / 8)`), or is decorative genuinely the right
   answer past 2? **Recommendation:** keep 2 for P1, revisit with a real long-film render —
   scaling the ceiling silently is how videos start to feel repetitive.
2. **`narrativeCentral`.** The adjacency veto has an escape hatch for an asset "central to
   the narrative". Who decides? **Recommendation:** derive it — `tier === 100` (user upload)
   **and** it is the only asset of its category. No new model call.
3. **Reuse across scene *kinds*.** Should one asset appear as a montage tile and later as a
   hero? It maximises coverage but is the most visible kind of repeat.
   **Recommendation:** allow it, and rank it below same-kind reuse via `compositionFit` —
   the change in scale and framing is itself strong variation.
