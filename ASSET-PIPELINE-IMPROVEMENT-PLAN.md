# Asset Collection & Template System — Improvement Plan

> Analysis of the **current** KEYFRAME asset pipeline (grounded in the code) →
> root causes → a concrete, prioritized improvement roadmap with specific
> algorithms, libraries, data sources, and architecture. Companion to
> `PLAN.md` and `ASSET-TEMPLATE-OVERHAUL-PLAN.md`.

---

## 0. TL;DR — the five root causes

1. **Retrieval relevance is bag-of-words, and the semantic tools we already ship are unwired.** `util.scoreCandidate` (`server/src/services/asset_sources/util.js:252`) scores a candidate by the *fraction of query words that literally appear in the provider's tags* + resolution. "analytics" never matches a "dashboard" tag. Meanwhile `embeddings.js` (MiniLM) and `util.imageDominantColor`/`colorDistance` (palette affinity) exist but are **never called by `acquire()`** — capability built, not connected.
2. **Query construction blows provider limits → zero assets.** `graph.js` builds `"${anchor} ${need.query} ${packStyle.photoMod}"` (e.g. *"e-commerce analytics dashboard UI focused woman laptop … data analytics dashboard chart monochrome"*). Pixabay rejects queries > 100 chars with **HTTP 400**, so whole scenes come back empty. Verified live: an 8-scene job fetched **0 images** purely from over-long queries.
3. **No visual/pixel relevance or watermark/stretch validation at retrieval time.** `validateImage` (`util.js:182`) checks decode, min-resolution (900px), solid-color, and alpha — but **not** watermarks, aspect-fit, or whether the *pixels* match the subject. Off-topic and watermarked stock passes. (The new Creative Director agent now catches this *after* fetch, but retrieval itself is still blind.)
4. **Template identity is lost because the default composer is the freehand LLM, and post-processing erases pack signals.** `USE_LLM_COMPOSER` defaults ON (`config.js:207`), so the primary path is the LLM writing HTML freehand — the weakest identity path. Then `normalize.js` **strips non-system fonts** (the pack's display face vanishes unless bundled in `pack_fonts.js`, only ~13 packs), and `enrich.js` injects **generic gradients + particles** that override flat/editorial packs (blockframe forbids gradients). `cinematic_lint` that would catch this is **diagnostic-only**.
5. **"Templates" today are *style token sheets*, not *scene systems*.** A frame pack = `pack.json` + `FRAME.md` (colors/fonts/motion/skin tokens) consumed by the 2D scene-kit and the LLM prompt. There is no per-template control of **layout structure, camera, transitions, or composition rules** as first-class, reusable objects — so two different packs produce structurally similar videos with different paint.

Current inventory note: the repo actually ships **24 frame packs** (`[manifest] 24/24 packs valid`), not 10 — but they are style sheets, which is why variety still feels low.

---

## 1. Asset Discovery

### Current state
- `asset_planner.js` → one LLM call returns `{images:[{query,sceneId,startSec,style,alt}], videos:[…]}`, capped 14 images / 1 video, each query sliced to 80 chars (`asset_planner.js:37`).
- `graph.js assetPlannerAgent`/`assetSearchAgent` add screenshot pinning, vector/icon gap-fill, a `topicAnchor` subject word, and pack `photoMod` styling — then call `acquire()`.
- `acquire()` chain: curated lib (opt-in) → pixabay-bridge vectors → Iconify → local cache → Pixabay → Openverse → Pexels → scrape. Ranking by `rankCandidates` (`util.js:271`).

### Weaknesses
- **Lexical-only relevance** (root cause #1). No embedding similarity between the *scene meaning* and the *candidate*.
- **No product-category / industry model.** `topicAnchor` is a word-frequency heuristic; there is no taxonomy ("fintech → dashboards, cards, secure, charts"; "healthcare → clinicians, care, wellness") to steer queries and reject category-mismatched hits.
- **Query length + noise** (root cause #2): concatenated anchor + direction + photoMod overflows providers and dilutes intent.
- **No scene-intent typing.** A "hook" scene, a "proof/testimonial" scene, and a "CTA" scene need different asset *kinds* (bold hero photo vs. UI screenshot vs. icon), but the planner treats them uniformly.

### Recommendations
1. **Wire semantic re-ranking (P0, cheap).** Turn on `embeddings.js` and add **CLIP image–text** scoring. The single biggest quality lever: judge the *pixels* against the scene text, not the provider's tags.
   - Library: **`@huggingface/transformers`** (transformers.js, ONNX, already the dep `embeddings.js` expects) with **`Xenova/clip-vit-base-patch32`**. Runs locally, no API cost, ~50–100ms/image on CPU.
   - Score = `0.55·CLIP(sceneText, image) + 0.20·resolution + 0.15·styleMatch + 0.10·paletteAffinity`. Replace/augment `scoreCandidate`.
2. **Cap and clean queries (P0, one-line fix).** Truncate every provider query to ≤ 90 chars and strip the pack `photoMod` from the *search* query (apply it as a post-fetch CSS treatment instead — see §2/§4). Fixes the HTTP 400 zero-asset failures immediately.
3. **Add a lightweight industry/category taxonomy (P1).** A JSON map `category → {mustHave[], avoid[], preferredKinds[], queryExpansions[]}`. Derive `category` from the brief (the brief agent already produces `subject`, `audience`, `goal`) and use it to (a) expand queries, (b) bias ranking, (c) hard-reject category-alien hits (jewelry for a SaaS video).
4. **Type each scene's asset need by intent (P1).** Map `scene.purpose` → asset kind: `hook→hero photo/video`, `feature/how→product screenshot/UI`, `proof→people/testimonial`, `data→chart/vector`, `cta→brand/icon`. The planner already knows `purpose`; make it authoritative for `kindPref`.
5. **Fold scoring + ranking into the Creative Director** (already built). The CD's 6-dimension per-asset scores are the natural home for "asset scoring and ranking"; retrieval should hand it a *larger, cheaply-ranked* candidate pool and let the CD do the expensive final judgment (it already does — extend its `relevance/visualQuality/templateCompat` to feed back into a second retrieval round when a scene scores low).

### Data sources to add
| Kind | Source | Notes |
|---|---|---|
| Photos | **Unsplash API**, Pexels (wired), Openverse (wired) | Unsplash needs a free key; highest quality/curation. |
| Icons | **Iconify** (wired, 200k+), Lucide, Tabler, Heroicons, Phosphor | Already have Iconify; expose collection families per template. |
| Illustrations | **unDraw**, **Storyset**, Open Peeps, Humaaans, DrawKit | Recolorable SVG/vector; ideal for flat/editorial packs. |
| Premium (optional) | Icons8, Streamline, IconScout | Paid; higher consistency for enterprise packs. |
| Brand logos | **Clearbit Logo API**, Brandfetch, Simple Icons | For website/brand-driven videos. |

---

## 2. Asset Validation

### Current state
`validateMedia` (decode + min-size) → `validateImage` (min 900px long edge, low-info stdev guard, alpha for vector roles) → `makeImageDeduper` (MD5 + perceptual dHash). Videos re-encoded to keyframe-dense H.264.

### Weaknesses
- **No watermark detection** (explicitly requested). Watermarked stock ships.
- **No aspect/stretch guard.** We compute `ratio` but never reject or letterbox a candidate whose ratio is wrong for its slot; scene-kit uses `object-fit:cover`, which *crops* rather than distorts, but a portrait photo in a full-bleed 16:9 slot loses its subject.
- **No cross-video visual consistency.** Each asset is validated in isolation; nothing enforces a coherent palette/treatment across the 3–6 scenes → the "collage of unrelated stock" look.

### Recommendations
1. **Watermark / low-aesthetic filter (P1).** Two options, cheap→better:
   - *Cheap:* the Creative Director's vision pass already flags watermarks/"sample" text — make that an explicit reject reason (add to the prompt; already partially there).
   - *Better:* a small aesthetic/quality model — **NIMA** (Neural Image Assessment) or **`Xenova/…` ONNX** aesthetic scorer — as a numeric gate (drop bottom-quartile), plus a dedicated watermark classifier if false-positives matter.
2. **Aspect-fit validation (P0, uses data we already have).** In `validateImage`, compare candidate `ratio` to the target slot ratio; if the mismatch would crop > ~35% of the image, down-rank or route it to a different slot (inset vs. full-bleed). Never stretch (already avoided), but pick the *right* photo for the *shape*.
3. **Per-video palette lock + unified treatment (P1).** Compute each asset's `imageDominantColor` (already implemented, unused), pick the pack's target palette, and **harmonize every photo with the same CSS treatment** (duotone/tint/scrim from the pack's `photoMod`). This is what makes a set of unrelated stock read as one film. Reject or de-prioritize assets whose dominant color is un-harmonizable (`colorDistance` too large after tinting).
4. **Consistency scoring across the set (P2).** After the CD approves N assets, run a quick pairwise CLIP-embedding cohesion check; if one approved asset is a stylistic outlier (very different embedding cluster), demote it to background or replace via a top-up.

---

## 3. Asset Placement & Composition

### Current state (this is the *strongest* part today)
The deterministic **scene-kit** (`scene_kit.js`) builds lint-clean, per-pack compositions with per-scene archetypes (`archHook`, `archStat`, `archScreenshotHero`, `archAssetMontage`, `archSplitVector`…), a `prominentOk` gate (`scene_kit.js:1473`) that only lets verified/owned assets into hero slots, and a spatial-overlap **inspect** gate in the pipeline. The new Creative Director now sets `sceneId` (placement) + `visionOk` (prominence), which scene-kit honors.

### Weaknesses
- **Archetype choice is asset-blind.** The layout is picked from `scene.purpose` + a seed, then assets are poured in — rather than choosing the layout *because* of what assets exist (e.g. "we have a strong wide screenshot → use split-hero; we have 3 square photos → use a triptych").
- **Empty-scene fallback is typography-only.** When a scene has no asset, it leans on text + vectors; good, but no deliberate "editorial negative space" system → some scenes read sparse, others cluttered.
- **The LLM composer path (default) has none of these guarantees** — it freehands layout and relies on the inspect/QA loop to catch overlaps.

### Recommendations
1. **Make the scene-kit the default composer (P0).** Flip `USE_LLM_COMPOSER` default to **off** (or route premium-only). The kit is lint-clean, per-pack, and overlap-free *by construction* — it is the single fastest win for "professional composition" and "template identity" (see §4). Keep the LLM composer as an opt-in "remix."
2. **Asset-aware archetype selection (P1).** Before choosing a scene's archetype, inspect its assigned assets (count, aspect, `visionOk`, `cdProminence` from the CD) and pick the layout that showcases them — a decision table keyed on `(purpose, assetCount, dominantAspect, hasScreenshot)`.
3. **A real layout-grid system (P1).** Formalize per-template layout rules as data (12-col grid, safe margins, min gaps, allowed zones per archetype) so composition, hierarchy, and spacing are template-controlled, not hardcoded per archetype. This is the bridge to §6.
4. **Keep the inspect + contrast gates; promote `cinematic_lint` from diagnostic to a soft gate on the LLM path** so under-illustrated/void frames actually bounce.

---

## 4. Template Integration — why identity is lost (deep dive)

### Root causes (with evidence)
1. **The freehand LLM is the default composer** (`config.js:207`, `USE_LLM_COMPOSER` default true). Freehand HTML drifts from the pack even with `FRAME.md` + the "HARD PALETTE LAW" injected, because a ~140KB prompt dilutes attention.
2. **Font stripping.** `normalize.js` removes external/Google fonts and forces system stacks; the pack's *display face* — the single strongest identity signal — disappears unless it's pre-bundled as a data-URI in `pack_fonts.js` (only ~13 of 24 packs are).
3. **Generic enrichment.** `enrich.js` injects a gradient background + particle/ring VFX layer on every video. For a **flat/editorial** pack (blockframe's hard borders, biennale's parchment) this *overwrites* the identity with a generic "dark cinematic" look. The gate that would catch it (`cinematic_lint`) is diagnostic-only and its doctrine is itself dark-cinematic (conflicts with flat packs).
4. **Weak binding of tokens → render.** `pack.json` has rich tokens (`motion`, `camera3d`, `fx`, `textfx`, `layout`) but only a subset is actually consumed; transitions, camera behavior, and composition rules are mostly *not* pack-controlled.

### Recommendations
1. **Default to the deterministic per-pack scene-kit (P0).** Identity is strong there by construction. This one flip fixes most "template not reflected" complaints.
2. **Bundle every pack's display font (P0).** Extend `pack_fonts.js` / `fonts/pack_fonts.js` generation to cover all packs; make `check-pack-identity.js` (which already asserts "display face renders") a **required CI gate** so a pack can't ship with its font stripped.
3. **Make enrichment pack-aware (P1).** `enrich.js` already detects rich scene-kit output and skips it; extend that: for flat/editorial packs, inject the pack's *own* ornaments (from `skin.extras`) instead of the generic gradient/particle layer. Never apply gradient enrichment to a pack whose manifest says `surface.flat`.
4. **Bind the full token set to the renderer (P1).** Consume `pack.json.motion` (transition style, camera drift), `textfx` (kinetic type), and `layout` in the scene-kit so **transitions, typography motion, and composition rules are template-controlled end-to-end** — the explicit ask in area 4.
5. **Add a per-pack golden render + visual diff in CI (P2).** `check-pack-identity.js` exists; add a screenshot baseline per pack so identity regressions are caught automatically.

---

## 5 & 6. Template Library Expansion + Architecture

### Honest framing
"50–100 templates as reusable **Three.js scene systems**" is a large, multi-month content+engineering effort, and a full pivot to Three.js would trade away the current path's biggest strengths: **determinism, lint-clean composition, cheap CPU rendering, and readable text**. The current renderer is HTML+GSAP captured by Chromium; `three_composer.js` exists but is one opt-in composer, forced back to 2D when a video is asset-rich (because 3D can only texture one screenshot).

**Recommendation: a hybrid, spec-driven architecture — not a rewrite.**

### The Template Spec (the core new abstraction) — P1
Promote today's implicit "pack" into an explicit **Template** object (extend `pack.json`) that both renderers can consume:

```jsonc
{
  "id": "flux-analytics",
  "category": "data-visualization",
  "renderer": "scenekit" | "three",        // pick the engine per template
  "identity": { "colors": {…}, "fonts": {…}, "textfx": {…} },
  "sceneStructure": [ { "purpose": "hook", "archetype": "split-hero", "assetKinds": ["screenshot"] }, … ],
  "layout":     { "grid": 12, "margins": …, "zones": {…}, "maxDensity": … },
  "motion":     { "enter": "…", "transition": "wipe|match-cut|…", "stagger": … },
  "camera":     { "drift": …, "pushIn": … },       // 3D + 2D "camera" (scale/pan)
  "lighting":   {…}, "fx": {…},                     // three-only
  "assetAffinity": { "prefer": ["holographic","particles"], "avoid": ["clipart"] }  // §7
}
```

- **`scenekit` renderer** (default, 2D): the reliable, cheap, lint-clean core for the vast majority of categories (SaaS, corporate, finance, e-commerce, education, marketing, social).
- **`three` renderer**: reserved for categories that genuinely need it — **AI/futuristic, data-visualization, technology, motion-graphics** — where holographic/particle/3D-product treatments justify the cost.

### Scaling to 50–100 — a generator pipeline, not hand-coding — P1→P2
The tooling seed already exists (`scripts/new-pack.js`, `scripts/pack-catalog.js`, `frame_manifest.js` schema, `check-pack-identity.js`). Build on it:
1. **Category families.** Define ~15 category archetypes (the list in the request). Each family fixes scene-structure + motion + layout DNA.
2. **Palette/type variants.** Cross each family with curated palette + font-pair sets (e.g. 5 families × 6 variants = 30, etc.) to reach 50–100 *without* bespoke code per template.
3. **LLM-assisted authoring + golden gate.** Use an LLM to draft each template's tokens from the family DNA + a design brief (like `new-pack.js` does today), then **gate every generated template through `check-pack-identity.js` + a contrast + a visual-baseline check** so only production-ready ones ship.
4. **Bundle fonts + a poster/preview per template** (the `server/public/frames/*/preview.mp4` pattern already exists) so the UI carousel shows real, on-system previews.

### Three.js building blocks (for the `three` renderer)
- **react-three-fiber** + **drei** (helpers), or stay vanilla three (current `three_composer.js`) for determinism.
- **Theatre.js** for timeline-driven, keyframed animation synced to the same paused-timeline seek model the pipeline needs.
- **postprocessing** (UnrealBloom, film grain — already used), **troika-three-text** for crisp 3D text, **MeshLine** for glowing connectors.
- Keep the **single paused GSAP/`__timelines["vid"]` seek contract** so Chromium frame-capture stays deterministic (three_composer already does this).

---

## 7. Asset-to-Template Matching

### Current state
`pack_style.js` maps pack → `{photoMod, iconStyle, keywords}`; `styleKeywords` feed `scoreCandidate` at 0.25 weight; `iconColorFor` recolors Iconify icons to the accent. A start, but keyword-shallow.

### Recommendations
1. **Add `assetAffinity` to the Template Spec (P1)** — `prefer[]` / `avoid[]` style descriptors ("holographic, glowing UI, particles" for futuristic-AI; "clean flat icons, real people, subtle" for corporate; "bold, high-contrast, energetic" for startup-launch).
2. **Match via CLIP, not keywords (P1).** Embed the template's `prefer`/`avoid` descriptors once; score each candidate's CLIP image embedding against them; add `+affinity − penalty` to the rank. This is what makes "a futuristic template *prefers* holographic visuals" real rather than a tag coincidence.
3. **Route asset *kinds* per template (P1).** Futuristic→prefer vectors/3D/particles over literal stock photos; corporate→prefer clean line icons + real workplace photos; e-commerce→product shots. The Template Spec's `sceneStructure[].assetKinds` drives `kindPref` into `acquire()`.
4. **Unified treatment per template (P1).** The pack's `photoMod` becomes a *render-time* CSS/three treatment (duotone, glow, grain, tint) applied to *every* asset, so even generic stock inherits the template's look — the strongest, cheapest consistency lever.

---

## 8. Prioritized roadmap

| Priority | Change | Area | Effort | Impact |
|---|---|---|---|---|
| **P0** | Cap/clean provider queries (≤90 chars, drop photoMod from search) | 1 | 1h | Fixes 0-asset failures |
| **P0** | Default to the deterministic scene-kit; LLM composer opt-in | 3,4 | 1h | Biggest identity + composition win |
| **P0** | Bundle every pack's display font + make `check-pack-identity` a CI gate | 4 | 0.5d | Stops typography identity loss |
| **P0** | Aspect-fit routing in `validateImage` (data already computed) | 2 | 0.5d | Kills cropped/wrong-shape assets |
| **P1** | Wire CLIP image–text relevance into ranking + CD | 1,2,7 | 2–3d | Biggest *relevance* win |
| **P1** | Per-video palette lock + unified photo treatment | 2,7 | 2d | "One film" consistency |
| **P1** | Pack-aware enrichment (no generic gradients on flat packs) | 4 | 1d | Preserves flat/editorial identity |
| **P1** | Industry taxonomy + scene-intent asset typing | 1 | 2–3d | On-category assets |
| **P1** | Template Spec (extend `pack.json`) + bind motion/camera/layout tokens | 4,5,6 | 1wk | Templates control the whole video |
| **P1** | Asset-affinity matching via CLIP descriptors | 7 | 2d | Style-matched assets |
| **P2** | Template generator pipeline → 50–100 templates w/ golden gates | 5,6 | 3–6wk | Variety at scale |
| **P2** | Watermark/aesthetic (NIMA) gate; cross-set cohesion check | 2 | 1wk | Premium polish |
| **P2** | `three` renderer templates for AI/data-viz/futuristic categories | 6 | 3–6wk | 3D differentiation |

### Recommended sequencing
1. **Week 1 (all P0):** query fix + scene-kit default + font bundling + aspect-fit. This alone moves output from "random/off-brand" toward "consistent + on-template" at near-zero risk.
2. **Weeks 2–3 (P1 retrieval):** CLIP relevance + taxonomy + palette lock/treatment. Now assets are *relevant and cohesive*.
3. **Weeks 3–4 (P1 templates):** Template Spec + token binding + affinity matching. Now the *template drives the whole video*.
4. **Weeks 5+ (P2):** generator → template library scale-out; `three` renderer for the categories that need it; watermark/aesthetic gates.

---

## 9. Concrete tools / libraries / data appendix

- **Semantic + visual relevance:** `@huggingface/transformers` (transformers.js) with `Xenova/clip-vit-base-patch32` (image–text) and MiniLM (`embeddings.js`, already present) for text–text. ONNX, local, no API cost.
- **Aesthetic/quality:** NIMA (ONNX), or reuse the Creative Director vision pass for watermark/quality flags.
- **Icons/illustrations:** Iconify (wired), Lucide, Tabler, Phosphor, unDraw, Storyset, Open Peeps.
- **Photos/video:** Unsplash API, Pexels (wired), Openverse (wired), Pixabay (wired).
- **Logos/brand:** Clearbit Logo API, Brandfetch, Simple Icons.
- **3D/motion (for `three` renderer):** three.js (present), react-three-fiber + drei, Theatre.js, postprocessing, troika-three-text, MeshLine.
- **Existing internal assets to *finish wiring*:** `embeddings.js` (unused), `util.imageDominantColor`/`colorDistance` (computed, unused in ranking), `pack.json.motion/camera3d/layout/textfx` (partially consumed), `cinematic_lint.js` (diagnostic-only), `scripts/new-pack.js` + `check-pack-identity.js` (the seed of the generator pipeline).

---

## 10. What "done" looks like
Every generated video: assets are **relevant** (CLIP-verified against the scene, not keyword-coincident), **valid** (no watermarks, right aspect, harmonized palette), **cohesive** (one treatment across all scenes), **purposefully placed** (asset-aware archetypes, no overlap/void), and **unmistakably on-template** (pack font + motion + camera + layout + treatment controlled end-to-end) — across 50–100 templates spanning the requested categories, with a generator pipeline that keeps adding more behind automated identity/contrast/quality gates.
