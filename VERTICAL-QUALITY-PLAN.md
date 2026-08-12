# 9:16 quality — analysis and fix plan

**Date:** 11 Aug 2026 · **Branch:** `Rohit` · **Status:** analysis complete; **P0 shipped** (see §I).

Investigating: *horizontal films look polished, vertical films do not.* Everything below is
traced in code or measured on a real build; inferences are labelled as such.

---

## 0. The headline finding, stated first

**Vertical quality is bimodal, not uniformly low — and the split is decided before a single
pixel is laid out, by which template the job is given.**

Measured across all 135 packs (real composers, real browser, one production-shaped fixture of
8 scenes / 6 pictures + logo, sampled at every scene's midpoint):

| Pack group | rendered at | ink¹ | media¹ | scenes with no picture |
| --- | --- | --- | --- | --- |
| 12 hand-ported **landscape** packs | 1920×1080 | 27.7% | 10.1% | 3.7 / 8 |
| 89 **FilmKit** portrait packs | 1080×1920 | 41.6% | 26.7% | 1.1 / 8 |
| 7 **OM** portrait packs | 1080×1920 | 44.4% | 28.7% | 0.0 / 8 |
| 9 **ported portrait** packs | 1080×1920 | 34.1% | 18.3% | 1.3 / 8 |
| **18 orientation-undeclared packs** | 1920×1080 | 21.7% | 9.1% | 3.1 / 8 |
| **the same 18 packs** | **1080×1920** | **10.6%** | **4.4%** | 3.1 / 8 |

¹ *ink* = union area of text + picture boxes as a fraction of the frame; *media* = picture
boxes only. Full-bleed backdrops/canvases are excluded from both, so this measures composed
content, not wallpaper.

Read the last two rows together. **A portrait-authored template fills a 9:16 frame better than
any horizontal template fills 16:9.** The only group that collapses is the 18 packs that declare
no orientation — and those lose **half their content density** the moment they are rendered
tall, because their layouts are authored against a 1920×1080 stage and nothing re-lays them.

Per-pack, worst first:

| Pack | ink 16:9 | ink 9:16 | collapse |
| --- | --- | --- | --- |
| fable-storybook | 26.5% | 9.3% | **2.85×** |
| kinetic-bold | 44.9% | 16.2% | **2.77×** |
| noir-spotlight | 25.9% | 9.5% | **2.74×** |
| aurora-spectrum | 27.4% | 10.1% | **2.70×** |
| bloom-illustrated | 29.3% | 11.0% | **2.68×** |
| bauhaus-print | 26.8% | 10.1% | **2.65×** |
| mono-corporate | 23.7% | 9.0% | **2.63×** |
| vapor-chrome | 19.0% | 7.3% | **2.61×** |
| bloom-fable | 7.2% | 2.8% | **2.55×** |
| blockframe | 27.2% | 10.7% | **2.55×** |
| biennale-yellow | 25.5% | 10.2% | **2.50×** |
| midnight-glass | 20.8% | 8.5% | **2.46×** |
| bauhaus-riot | 18.0% | 9.1% | 1.97× |
| blueprint-atelier | 18.8% | 13.1% | 1.44× |
| terminal-departures | 27.2% | 19.2% | 1.41× |
| flagship | 10.8% | 9.1% | 1.18× (portrait-adapted) |
| paper-tales | 9.8% | 16.6% | 0.59× (better tall) |
| brightlife | 2.0% | 8.4% | 0.24× (portrait-adapted) |

**15 of the 18 degrade in portrait; 12 of them severely. All 18 are selectable by a 9:16 job,
by design.** That is the defect. `2.65×` is not a coincidence: a 16:9 frame is 56.25cqw tall and
a 9:16 frame is 177.8cqw tall, and a layout that measures every height in `cqw` (width units)
keeps its size while the frame it sits in grows 3.16× taller. The composition does not break —
it simply stops being a composition and becomes a band of content in an empty column.

The second, slower problem is **identity**, and it is a library-shape problem rather than a
layout bug: 89 of the 123 packs a vertical job can choose (**72%**) are one engine with 16 beat
builders and a colour skin, and **87 packs share a byte-identical media contract**. Horizontal
jobs choose from 30 packs of which 12 are hand-ported, reference-exact designs with bespoke
contracts. Vertical films therefore fill the frame well and still feel same-y; horizontal films
feel designed and are emptier. Those are two different complaints and they need two different
fixes.

**What is NOT the cause** (checked, ruled out): the pipeline passes portrait dims correctly;
stock acquisition is orientation-aware (`acquire({orientation, targetRatio})`); a mobile
screenshot is captured for every URL job; asset collection volume is identical (the A/B pair
below collected 11 assets each); the crop engine and asset placement are slot-driven and so are
orientation-correct by construction; delivery probes 1080×1920 / 720×1280 exactly as ordered.

---

## A. Current architecture

### A.1 Where orientation enters

```
POST /api/projects  { orientation: "vertical" }
  → config.dimensionsFor(orientation, quality)          config.js:105
      horizontal → {W:long,  H:short}
      vertical   → {W:short, H:long}      1080p ⇒ 1080×1920
  → job.width / job.height                              persisted on the job row
  → every composer receives `dims` and branches itself
```

That is the whole of it. `dims` is the **only** orientation signal that reaches the render, and
each of the ~30 composer modules decides independently what to do with it. There is no stage in
between that adapts the plan for the aspect.

### A.2 The production graph (21 nodes, `agents/graph.js:2818`)

```
START → frame_selector ─┬→ storyboard_agent → scene_planner ──────────────────┐
                        ├→ asset_planner → asset_search → asset_prep ─────────┤
                        ├→ caption_director → voice_agent ───────────┐        │
                        └→ art_director ──────────────────┐          │        │
  creative_director → visual_layout_director → asset_placement → asset_reuse ─┘
        └→(join caption_director)→ localization_director → motion_planner
             →(join art_director)→ composition → animation
             →(join voice_agent)→ audio_director → timeline → qa_agent
                                                        ↑            │
                                                      repair ←───────┘ (QA fail, ≤N laps)
```

Orientation-aware nodes: `frame_selector` (routes packs by declared aspect),
`storyboard_agent` (prompt carries orientation + per-aspect copy rules),
`asset_planner`/`asset_search` (orientation + per-slot `targetRatio`),
`creative_director` (rejects assets that cannot fill the frame shape),
`composition` (each composer branches on `dims`).
Orientation-**blind** nodes: `scene_planner`, `asset_prep`, `visual_layout_director` (see
RC-3), `asset_placement`, `asset_reuse`, `motion_planner`, `audio_director`, `timeline`,
`qa_agent`.

### A.3 The composer layer — five engines, 135 packs

| Engine | Packs | Authored stage | Orientation handling |
| --- | --- | --- | --- |
| `film_stage.js` + 89 skins | 89 (portrait) | 1080×1920 | native portrait; `TSCALE` on short side |
| `om_port_kit.js` ports | 16 (12 landscape, 4 portrait) | each states its own via `stageOf(W,H)` | per-pack, hand-authored per aspect |
| `om_stage.js` + 7 skins | 7 (portrait) | 1080×1920 | native portrait |
| bespoke natives | ~12 | mixed | mixed — `flagship`/`brightlife` use `responsive.js`; 11 recent ones do not |
| `scene_kit.js` | **0** | responsive | **unreachable — see RC-3** |

### A.4 The shared responsive foundation

`services/responsive.js` (167 lines) is correct and complete: `aspectMode`, short-side
`typeScale`, per-mode `safeArea`, `heroBox`, `headlineCh`, `mediaBoxCqw`, `plateBox`,
`fitMediaCqw`. **Only 9 of ~30 composer modules import it.**

---

## B. Stage-by-stage comparison

| Stage | Horizontal | Vertical 9:16 | Difference | Impact on the film |
| --- | --- | --- | --- | --- |
| **Script** | `system_script.md`, orientation-aware | identical + one 9:16 rule (l.69) | none material | none |
| **Storyboard** | orientation + aspectRatio in prompt | same, plus "≤40 chars/line, prefer centred" (l.112) | correct | none |
| **Asset collection** | `acquire({orientation:"horizontal"})`, targetRatio from slot | `orientation:"vertical"` → portrait stock | **works** — measured: vertical job fetched 1024×1280 / 853×1280 stock, horizontal fetched 1280×853 | none |
| **Screenshot** | desktop 1366×900@2 ×N sections | same **plus** a mobile 390×844@3 capture | mobile shot exists for every URL job | positive, under-exploited (RC-7) |
| **Asset ranking** | CD scores + tier-first `displayRank` | identical, plus "reject what can't fill a `vertical` frame" | shared, correct | none |
| **Scene planning** | shared | shared | no aspect branch, no scene-count/pacing difference | neutral |
| **Template selection** | pool of **30** (12 bespoke landscape + 18 undeclared) | pool of **123** (89 FilmKit + 7 OM + 9 ported + 18 undeclared) | **72% of the vertical pool is one engine; the 18 undeclared are landscape-authored yet eligible** | **RC-1, RC-5 — dominant** |
| **Template config** | 12 bespoke `slotsByRole` contracts | 87 of 123 share ONE identical contract | template-aware prep is template-blind for 72% of vertical | RC-6 |
| **Asset placement** | slot-driven (kind/aspect/resolution/quality/affinity) | identical | correct by construction | none |
| **Cropping** | `crop_engine` crops to the slot's ratio | identical | correct by construction | none |
| **Typography** | pack fitters, ceilings per pack | same fitters; portrait packs pass portrait column widths | correct where authored; **wrong for the 18** | RC-1 |
| **Animation** | pack owns choreography; `motion_planner` skipped | identical | no aspect difference in motion vocabulary | RC-8 (minor) |
| **Audio** | shared | shared | none | none |
| **Rendering** | 1920×1080 | 1080×1920 (or 720×1280 at 720p) | `delivery_probe` confirms exact dims | none |
| **Validation** | 13 preflight checks, lint, inspect, vision QA | **the same 13** | **zero aspect-aware checks anywhere** | **RC-4** |

---

## C. Root causes

### RC-1 · P0 · 18 landscape-authored packs are declared aspect-agnostic, so 9:16 jobs select them

`frame_manifest.js:407`
```js
function packFitsOrientation(pack, jobOrientation) {
  const authored = packOrientation(pack);
  if (!authored) return true;          // ← "aspect-agnostic"
```
The comment above it states the premise: *"An undeclared pack is compatible with everything …
it keeps every scene-kit pack behaving exactly as it always has."* That was true when written.
It is not true now: the fidelity programme's §3j-bis wave (7 Aug) gave those packs **dedicated
composers**, every one of them authored at a landscape stage —

```
aurora_spectrum_composer.js    stageOf(1920, 1080)   portrait branches: 0
bauhaus_print_composer.js      stageOf(1920, 1080)   portrait branches: 0
biennale_yellow_composer.js    stageOf(1920, 1080)   portrait branches: 0
blockframe_composer.js         stageOf(1920, 1080)   portrait branches: 0
bloom_illustrated_composer.js  stageOf(1920, 1080)   portrait branches: 0
fable_storybook_composer.js    stageOf(1920, 1080)   portrait branches: 0
kinetic_bold_composer.js       stageOf(1920, 1080)   portrait branches: 0
midnight_glass_composer.js     stageOf(1920, 1080)   portrait branches: 0
mono_corporate_composer.js     stageOf(1920, 1080)   portrait branches: 0
noir_spotlight_composer.js     stageOf(1920, 1080)   portrait branches: 0
vapor_chrome_composer.js       stageOf(1920, 1080)   portrait branches: 0
```
— and nobody updated the 18 manifests. The guard now waves through exactly the pairing it was
built to stop. Measured collapse: **2.46× – 2.85×** ink loss (table in §0).

This is not theoretical. In `jobs.json`: `r2ewnsia4o` and `0c09dko5xc` are **vertical
1080×1920 jobs rendered on `aurora-spectrum`**; `f2956243pp` is a vertical job on
`bauhaus-riot`. Each of those films is a 16:9 composition sitting in the middle of a tall
frame — precisely "excessive void space", "images too small", "poor visual hierarchy" and
"template identity getting lost" from the brief.

**Every symptom the user listed under Layout, Asset Placement and Typography is explained by
this one line for 15% of the library, and that 15% contains the packs the brief and the
anti-repeat rotation reach for most readily** (they are the original ten pack ids, the ones
`system_brief.md` and `resolvePack("auto")` have always known).

### RC-2 · P0 · `areaShare` measures an authored box against the delivered frame

`template_media.js:456`
```js
const frameArea = (dims.width || 1920) * (dims.height || 1080);
p.areaShare = (p.width * p.height) / frameArea;
```
`p.width`/`p.height` are the slot's pixels **against the pack's own authored reference frame**,
not against the job's frame. For a pack authored 1920×1080 and rendered at 1080×1920, the two
disagree on both axes, and the error compounds: showcase's 1119×544 hook computes `29.4%` of
the frame and actually renders `≈9.3%` — over-stated **3.2×**.

`areaShare` is the input to `coverageScore` (`graph.js:152`), the supply router that exists to
stop a thin film being paired with a slot-hungry template. So the one safety net that would
otherwise catch a badly-fitting pack is fed a number that flatters exactly the packs RC-1 lets
through. Measured today the ranking does not yet flip (the vertical pool's top five are all
genuinely portrait; `blueprint-atelier` is the highest agnostic at rank 6 of 123), so this is a
latent correctness fault rather than an active mis-router — **but it must be fixed before RC-1,
or the RC-1 fix will be scored with a broken ruler.**

### RC-3 · P1 · There is no orientation adapter, and the agent that should be one is disconnected

The Visual Layout Director is the node whose stated job is presentation — count, size, crop,
archetype. Its aspect handling is `visual_layout_director.js:276`:
```js
layoutPlan.__aspect = aspectMode(dims.width, dims.height);
```
`__aspect` is **written and never read** — `grep` finds no consumer anywhere in `src/`. Its only
render-consumed outputs are `__heroScale`, `__montageMax` and `asset.container` (the
phone-vs-browser mockup decision), and all three are read by exactly one module:
`scene_kit.js:1780`, `:1379`.

And `scene_kit` now renders **zero packs**: all 135 manifests declare a renderer, and all 135
resolve to a dedicated composer. Verified:
```
packs with NO renderer (→ scene_kit): 0
packs whose renderer has no module (→ scene_kit): 0
```
Consequences, all current:
- Every portrait fix landed in `scene_kit` (the responsive-video roadmap's item 3 — portrait
  `archScreenshotHero`, portrait montage columns, captions at `safeArea().bottom`, phone-hero
  anchors) benefits **no pack**.
- The mobile screenshot's routing into a phone mockup is dead for all 135 packs.
- The VLD's per-scene sizing decisions do not reach the render at all.

So orientation adaptation is delegated, per pack, to ~30 composers with no shared contract and
no enforcement — which is exactly why 18 of them never implemented it.

### RC-4 · P1 · Nothing in the pipeline can detect any of this

- `preflight.js` — 13 checks, **0** mention orientation, aspect, safe area or overflow.
- `validator.js` — `hyperframes inspect` gates only on `text_occluded`; `container_overflow`
  is explicitly a warning.
- `scripts/golden-composers.js:17` — builds **every** pack, including the 12 landscape ones, at
  `{width:1080, height:1920}`. It is a byte-identity harness so this is not wrong for its own
  purpose, but it means the committed baseline contains landscape packs at portrait dims and
  says nothing about whether that render is any good.
- `npm run test:film-safe-area` exists and is **not** in the `npm test` chain.
- The vision QA is the only detector — and on a native composer it sets `repairable:false`
  (`graph.js:2903`), correctly, because a deterministic composer would re-emit identical bytes.
  So a portrait layout defect is detected, recorded, and shipped.

The A/B evidence: jobs `748q8ykisb` (horizontal, orbit) and `1ntmvaft5g` (vertical, reel), same
site, same day, 11 assets each, 7 scenes each. Both scored ≤4/10 and both shipped. The vertical
one's three blockers were *"text collides with screenshot and is truncated ('fra')"*, *"massive
empty space covering over 60% of the canvas"*, *"text overflow clipped at frame edge ('retu')"*.
Every one of those is statically detectable and no static check looked. (Those three specific
defects were subsequently fixed by hand — `TEMPLATE-FIDELITY-STATUS.md` §3l — which is the
point: they were fixed one film at a time, because nothing generalises them into a gate.)

### RC-5 · P1 · Library asymmetry — the vertical pool is 72% one engine

| | horizontal pool | vertical pool |
| --- | --- | --- |
| eligible packs | 30 | 123 |
| hand-ported, reference-scored designs | 12 | 4 |
| generated from one shared engine | 0 | 89 (`film_stage`, 16 builders, 4 skin variants each) |
| distinct media contracts | 30 | 34 across 123 (87 packs share one) |

Fidelity re-audit (`TEMPLATE-FIDELITY-STATUS.md` §7d, 10 Aug): landscape ports mean **75/100**
(n=11, range 52–84); portrait ports mean **66/100** (n=4: teampulse 78, FlightVertical 64,
ShowcaseVertical 61, Reel 60). The 89 FilmKit packs have no reference and no score at all.

FilmKit fills the frame well (41.6% ink — better than any landscape group) but it is one design
system wearing 89 coats of paint. That is the "generic layouts", "template identity getting
lost" complaint, and it cannot be fixed by editing a layout; it is fixed by porting more
distinct vertical designs, or by giving FilmKit more per-skin structural variance.

### RC-6 · P2 · The media contract is template-blind for 72% of the vertical library

87 packs emit byte-identical `slotsByRole` (`hook 936×460`, `context 936×430`, …). The crop
engine, the placement scorer and the CD therefore receive the same instructions whichever of
those 87 "different" templates the user picked. The landscape packs each declare their own
(orbit 900×516, showcase 1119×544, edition 720×280 + 900×780, deep's 360×736 handset
placeholder), which is what makes template-aware asset prep mean anything on that side.

### RC-7 · P2 · The mobile screenshot has no route to a phone mockup

`ingest/website.js:376` captures a real 390×844@3 mobile shot for every URL job — the right
asset for 9:16. `visual_layout_director.js:121` classifies it (`ratio < 0.9 → "phone"`), and
`scene_kit.js:1379` is the only module that draws the matching mockup. Per RC-3, that module
renders nothing. For all 135 packs the mobile capture is just another picture competing for a
slot whose ratio may or may not suit it.

### RC-8 · P2 · The QA rubric is orientation-blind

`agents/qa_agent.js` — no mention of orientation, aspect, safe area or platform chrome. A 9:16
film is judged by a rubric written for 16:9: no rule about the Reels/TikTok/Shorts overlay
bands, no rule against a landscape composition parked in a tall frame, and blocker #2
("under-illustrated frame") applies a density expectation calibrated on wide frames.

### RC-9 · P3 · Guard fixtures under-test the library (found while measuring)

`scripts/test-shot-containment.js` uses `.svg` fixture assets, and several composers reject SVG
for a picture plate on purpose (`bauhaus_composer.js:190`). Those packs are silently skipped by
that guard. My own harness hit the same trap twice — first with SVG assets, then with assets
carrying no `sceneId` (several composers seat pictures only on a scene-id match) — and each time
the wrong fixture read exactly like a pack defect. Both are corrected in the harness; the repo's
guard is not.

---

## D. What is shared and what must be orientation-aware

**Correctly shared today — do not fork these:** script generation, brief, storyboard authoring,
asset requirement planning, stock acquisition, screenshot intelligence, asset quality grading,
CD relevance/ranking, brand extraction and the Art Director skin, Language Director, Audio
Director, caption timing, mixing, encoding.

**Must be orientation-aware, and the state of each:**

| Concern | Where it belongs | State |
| --- | --- | --- |
| Template eligibility | `frame_manifest.packFitsOrientation` | **broken for 18 packs (RC-1)** |
| Coverage/affordability maths | `template_media.areaShare` | **wrong for cross-aspect (RC-2)** |
| Placeholder dimensions | pack `slotsByRole` | present; uniform for 87 packs (RC-6) |
| Safe area | `responsive.safeArea` | exists; used by 9 of ~30 composers |
| Type scale | `responsive.typeScale` | exists; used by 9 of ~30 |
| Hero/plate sizing | `responsive.heroBox`/`plateBox`/`fitMediaCqw` | exists; used by 9 of ~30 |
| Scene composition & camera framing | each composer | per-pack; 18 packs have none |
| Asset density per beat | VLD | **not reaching the render (RC-3)** |
| Device chrome (phone vs browser) | VLD → composer | **dead (RC-7)** |
| Transition/animation scale | `transition_kit` / packs | no aspect branch (acceptable) |
| Validation | preflight / lint / QA | **absent (RC-4)** |

---

## E. Fix plan

Every item states Problem → Root cause → Files → Functions → Horizontal reference → Vertical
change → Expected result. **No item changes a horizontal render**; each carries the check that
proves it.

### P0-1 · Stop 9:16 jobs selecting landscape-authored packs

- **Problem:** vertical films render a 16:9 composition in a tall frame at ⅓ density.
- **Root cause:** RC-1 — `packFitsOrientation` treats "undeclared" as "responsive"; that stopped
  being true when the 18 packs got landscape composers.
- **Files:** the 18 `frames/*/pack.json`; `services/frame_manifest.js`;
  `scripts/test-orientation-guard.js`.
- **Functions:** `packOrientation`, `packFitsOrientation`, `PackManifestSchema`.
- **Horizontal reference:** the 12 landscape packs declare `orientation:"landscape"` and are
  correctly excluded from vertical jobs today. This is the same declaration, applied honestly.
- **Vertical change:** declare `orientation` on all 18 — `"landscape"` for the 15 that degrade,
  leave `flagship`/`brightlife`/`paper-tales` agnostic (measured ≤1.18× or better tall).
  Then **invert the default**: an undeclared pack is `landscape` unless it proves otherwise, and
  the schema requires the key. The existing reroute (auto/brief pick corrected silently, explicit
  user pick honoured + disclosed) already does the right thing once the data is right.
- **Expected result:** the 12 collapsing packs become unreachable for 9:16; a vertical job lands
  in the 41–44% ink band instead of the 10.6% band. This is the single highest-value change in
  the document.
- **Priority: P0.**

### P0-2 · Score a box against the frame it will actually render in

- **Problem:** the supply router's coverage number is inflated ~3× for cross-aspect pairings.
- **Root cause:** RC-2.
- **Files:** `services/template_media.js`; `agents/graph.js`.
- **Functions:** `resolveMediaPlan` (the `areaShare` loop, `:456`), `fillableBoxes`,
  `coverageScore`.
- **Horizontal reference:** for a same-aspect pairing the current maths is already correct —
  keep those numbers byte-identical.
- **Vertical change:** carry each pack's authored stage (`media.stage`, defaulting from
  `orientation`) into the manifest, and compute
  `areaShare = (w/stageW) × (h/stageH) × (stageAspect ÷ jobAspect correction)` — i.e. express the
  box as a fraction of the pack's own frame, then map that frame onto the job's. Assert
  `areaShare ≤ 1`.
- **Expected result:** a landscape pack scores its true ~9% on a portrait job, so the router
  stops rating it affordable. Same-aspect scores unchanged.
- **Priority: P0** (lands before P0-1, so P0-1 is measured with a working ruler).

### P0-3 · A frame-fill gate in `npm test`

- **Problem:** every defect in this document was invisible to lint, goldens and `npm test`.
- **Root cause:** RC-4.
- **Files:** new `server/scripts/test-frame-fill.js` (promote the harness used for this
  analysis); `server/package.json`.
- **Functions:** build each pack at **its declared aspect** and at the job aspects it claims to
  serve; fail when mean ink < 18%, when any content box escapes the frame by >3px, when a text
  box is clipped, or when >50% of scenes draw no picture.
- **Horizontal reference:** the 12 landscape packs at 1920×1080 set the floor (measured 27.7%
  mean, lowest 13.0%). Calibrate the threshold against them, and prove the gate bites by running
  a known-bad pairing (aurora-spectrum at 1080×1920 → 10.1%) before trusting a green result.
- **Vertical change:** none — this is the instrument.
- **Expected result:** the RC-1 class becomes a build failure instead of a delivered film.
- **Priority: P0.**

### P1-4 · Make the Visual Layout Director the orientation adapter

- **Problem:** the architecture has no orientation adapter; the node that should be one emits
  metadata nothing reads, into a renderer nothing routes to.
- **Root cause:** RC-3.
- **Files:** `services/visual_layout_director.js`; `services/om_port_kit.js`;
  `services/film_stage.js`; `services/om_stage.js`; `services/composer_kit.js`.
- **Functions:** `directLayout`; the composers' `buildComposition` entry.
- **Horizontal reference:** `om_port_kit.stageOf()` is already the right shape — one authored
  stage, every geometry helper derived from it. Generalise that, don't invent something new.
- **Vertical change:** emit a real, consumed contract —
  `layoutPlan.orientation = { mode, safe, hero, typeScale, columns, density, deviceChrome }`
  from `responsive.js` — and have the three shared engines (`om_port_kit`, `film_stage`,
  `om_stage`, covering 112 of 135 packs) read it in their stage/geometry setup rather than each
  re-deriving. Add `test:dead-exports`-style enforcement that the contract has consumers.
- **Expected result:** one place decides portrait density, safe area and device chrome; a new
  pack inherits it; the phone-mockup route (RC-7) comes back for every pack, not just the dead
  one.
- **Priority: P1.**

### P1-5 · Give the QA reviewer an orientation rubric

- **Problem:** a 9:16 film is graded by a 16:9 rubric.
- **Root cause:** RC-8.
- **Files:** `agents/qa_agent.js`.
- **Functions:** `VERDICT_INSTRUCTIONS`, the frame prompt assembly (`:171`).
- **Horizontal reference:** the existing blocker list stays exactly as-is for horizontal.
- **Vertical change:** state the frame's aspect and dimensions in the prompt; add two portrait
  blockers — content inside the platform-chrome bands (top 10% / bottom 13%), and a composition
  occupying a horizontal band with >45% of frame height empty above or below it.
- **Expected result:** the reviewer names the RC-1 failure mode instead of describing it as
  "large empty space", which makes the disclosure actionable.
- **Priority: P1.**

### P1-6 · Portrait cuts for the packs worth keeping

- **Problem:** 15 packs have no 9:16 layout at all, so P0-1 removes them from the vertical pool.
- **Root cause:** RC-1 (the layouts genuinely do not exist).
- **Files:** the 11 `*_composer.js` at `stageOf(1920,1080)`, plus `bauhaus_composer.js`,
  `bloom_composer.js`, `blueprint_composer.js`, `terminal_departures_composer.js`.
- **Functions:** each pack's `stageOf` + per-beat builders.
- **Horizontal reference:** `flight_composer.js` — **one module, two stages**, the builders
  closed over a stage object so the same film re-proportions instead of being duplicated
  (`flight_vertical_composer.js` is 15 lines). That is the pattern; it is already proven in this
  repo and it is why `flight-vertical` scored 64 rather than being written twice.
- **Vertical change:** per pack, a portrait stage plus the two adaptations the flight rebuild
  documented — re-place any element that would sit behind the picture, and re-scale motion whose
  amplitude assumed a wide clear band. Sequence by measured collapse (kinetic-bold,
  fable-storybook, noir-spotlight, aurora-spectrum first).
- **Expected result:** the vertical pool regains 15 genuinely distinct designs, each authored for
  the tall frame rather than tolerated in it.
- **Priority: P1** (per pack; roughly one session each, matching the fidelity programme's
  measured cost).

### P2-7 · Per-template media contracts for the FilmKit family

- **Problem:** 87 packs declare identical slots, so template-aware prep is template-blind.
- **Root cause:** RC-6.
- **Files:** `scripts/gen-film-packs.js`, `scripts/apply-media-profiles.js`, the 89
  `frames/*/pack.json`, `services/film_skins/_manifest.json`.
- **Functions:** the generator's media-block emitter.
- **Horizontal reference:** the 12 landscape contracts, each derived from that pack's own beat
  geometry.
- **Vertical change:** derive each skin's contract from its declared `variants` and beat spine
  rather than from the shared default. **Use `--check` first** — running the applier in write
  mode has previously destroyed hand-edited media blocks.
- **Expected result:** crop ratios, slot priorities and asset quotas differ per template, which
  is what makes 89 packs read as 89 films rather than 89 palettes.
- **Priority: P2.**

### P2-8 · Structural variance inside FilmKit

- **Problem:** 72% of the vertical pool shares 16 beat builders.
- **Root cause:** RC-5.
- **Files:** `services/film_beats.js`, `services/film_stage.js`, `services/film_skins/*`.
- **Functions:** `BUILDERS`, `archetypeFor`, `varyArchetypes`.
- **Horizontal reference:** each landscape port supplies its own beat builders over a shared kit
  — art per pack, plumbing shared.
- **Vertical change:** let a skin override a builder, not only theme it; start with the beat each
  skin's `vibe` names as its signature.
- **Priority: P2.**

### P3-9 · Fixture calibration for the existing guards

`test-shot-containment` (and any guard sharing its fixture) should use PNG assets carrying
`sceneId`, and should assert that each pack actually drew a picture — otherwise a pack that
draws nothing passes a containment check trivially. **Calibrate against a known-bad input before
trusting a pass.** (RC-9.)

---

## F. Architecture: how close is the current graph to the target?

The proposed shape is already ~90% built. Mapping it:

| Proposed | Exists as | Gap |
| --- | --- | --- |
| Script Agent | `script.js` / `storyboard_agent` | — |
| Asset Requirement Planner | `asset_planner` | — |
| Asset / Screenshot / Brand agents | `asset_search` + `ingest/website` + `art_director` | — |
| Creative Director | `creative_director` | — |
| Scene Planner | `scene_planner` | — |
| **Orientation Adapter** | — | **missing; VLD is the natural home (P1-4)** |
| 16:9 / 9:16 template systems | `frame_selector` + `packFitsOrientation` | routing exists, **the data it routes on is wrong (P0-1)** |
| Asset Placement | `asset_placement` | — |
| Crop / Resize | `crop_engine` + `asset_prep` | — |
| Animation Planning | `motion_planner` | correctly skipped for packs that own choreography |
| Audio Director | `audio_director` | — |
| Quality Agent | `qa_agent` + `preflight` | **no aspect dimension (P1-5, P0-3)** |
| Render | `renderer` | — |

So this is **not** a restructuring job. It is one missing node (an orientation adapter that
something actually reads), one wrong boolean (`packFitsOrientation`), one wrong ratio
(`areaShare`), and a missing gate. The rest of the architecture is sound and should not be
disturbed.

---

## G. Validation strategy

1. **The frame-fill harness (P0-3) is the primary instrument.** It already produced every
   number in this document and it compares like with like: same fixture, same probe, both
   aspects. Success is a vertical job's pack scoring in the same band as the horizontal
   reference set, not an absolute.
2. **Before/after on the known-bad pairing.** `aurora-spectrum @1080×1920` is 10.1% ink today.
   After P0-1 it must be unreachable for a vertical job; after P1-6 it must clear the landscape
   floor at its own portrait stage.
3. **Byte-identity for horizontal.** `npm run test:golden` must show the 12 landscape packs
   unchanged through every step. Any horizontal diff is a regression until proven intentional.
4. **Frames, not source.** `scripts/shot-pack.js` + `framecheck-sheet.js` for every rebuilt pack,
   against its reference. This library's whole history says lint and goldens pass through visual
   defects; the frames are the check.
5. **A real A/B render** of one URL at both aspects (the `748q8ykisb` / `1ntmvaft5g` pattern),
   comparing QA verdicts, `validation_report`, asset spread and `delivery_probe`.
6. **Calibrate each new guard against a known failure before believing a green run** — the rule
   this repo has now learned three separate times, and which my own harness broke twice during
   this analysis.

---

## H. Expected outcome

A 9:16 film should be selected into a template authored for the tall frame, fill 35–45% of it
with composed content, carry a picture in at least 7 of 8 beats, keep every element inside the
platform-safe bands, and never wrap a landscape composition in empty columns. Concretely:

- the pack a vertical job receives is one of ~110 portrait-authored designs, never one of the 15
  landscape-only ones;
- measured ink ≥ 30% and media ≥ 15% at 1080×1920, versus 10.6% / 4.4% for the failing class
  today;
- zero clipped text boxes and zero content outside the frame, enforced at build time rather than
  discovered by a vision reviewer after the encode;
- the mobile capture reaches a phone mockup on every pack that declares one;
- 1080×1920 output, correct dims, no playback chrome — already true and to stay true.

And the second half of the complaint, which the density numbers do not cover: a vertical film
should feel *chosen*, not generated. That is P1-6 and P2-7/8 — more distinct portrait designs and
per-template contracts — and it is a programme, not a patch.

---

## I. What shipped — P0, 11 Aug 2026

Sequenced deliberately: fix the ruler, build the instrument, then move the gate — so the gate
was measured with a working ruler and its verdict is reproducible.

### P0-2 — `areaShare` is measured against the pack's own stage

- `frame_manifest.js` — new `packStage(pack)`: `media.stage` if declared, else implied by the
  authored `orientation`, else `null`. Exported.
- `template_media.js:456` — `areaShare` is now
  `(w/stageW) × (h/stageW) × (jobW/jobH)`, clamped to 1, falling back to the legacy reading
  when a pack declares no stage.

Algebraically identical whenever the pack's stage and the job's frame match, so every
same-aspect 1080p pairing is unchanged. Two faults closed: coverage was **resolution-dependent**
(the same pack scored 50% at 720p and 22% at 1080p) and **aspect-blind** (showcase's hook
computed 29.4% of a 1080×1920 frame against a true 9.3%). Verified:

```
showcase @1920x1080 : 0.35   (unchanged)
showcase @1280x720  : 0.35   (was 0.79 — resolution-dependent)
showcase @1080x1920 : 0.111  (was 0.350 — 3.2x overstated)
reel     @1080x1920 : 1.0 / 0.48 …   identical at 720x1280
```

### P0-3 — `npm run test:frame-fill`

New `scripts/test-frame-fill.js`, wired into the `npm test` chain after `test:orientation`.
Builds each pack at **both** aspects through its real composer, seeks its paused timeline to
three beats, and measures composed density in layout on a 64×64 grid. It asserts one invariant:

> if a pack is eligible for an aspect, its layout must keep ≥70% of its own density there.

Self-relative on purpose, so the WebGL packs are not failed for a limitation of the probe.
`--all` sweeps the library, `--report` never fails, and the sampled tier (10 packs, one per
engine + a negative control) runs in the default chain.

**Calibrated before it was believed:** run against the 18 undeclared packs it failed 14 at
0.38×–0.66× and passed the four that genuinely adapt. `blockframe` stays in the sample as the
negative control — deleting `orientation` from its manifest must turn the guard red again.

### P0-1 — the 14 landscape-only packs are declared

`"orientation": "landscape"` added to: aurora-spectrum, bauhaus-print, bauhaus-riot,
biennale-yellow, blockframe, bloom-illustrated, blueprint-atelier, fable-storybook,
kinetic-bold, midnight-glass, mono-corporate, noir-spotlight, terminal-departures,
vapor-chrome.

Left agnostic (measured to adapt): `flagship` 0.77, `bloom-fable` 0.78, `paper-tales` 1.28,
`brightlife` 1.35.

**Vertical pool 123 → 109. Horizontal pool 30 → 30, unchanged** — those packs were already
eligible for horizontal, so nothing was taken away from the working pipeline.

Eleven of the fourteen (`stageOf(1920,1080)`, zero `port ?` branches) need a portrait layout
built from nothing under P1-6. Three — `bauhaus-riot` (19 branches), `blueprint-atelier` (17),
`terminal-departures` (8) — already have partial portrait paths that are simply not enough yet,
so they are the cheapest to bring back and should lead the wave.

### Verification

| Check | Result |
| --- | --- |
| `test:golden` | **270 compositions byte-identical** — no render output changed anywhere |
| `test:frame-fill` | 10/10, eligibility matches layout |
| `test:orientation` | 14/14 |
| `test:portrait` | 105/105, 0 skipped |
| `test:pack-composers` | 135/135 |
| `test:film-packs` | 89/89 built |
| `test:content` | 13/13 |
| `test:asset-prep` · `test:media-profiles` | 44/44 · 135 up to date |

No composer reads `areaShare` or `resolveMediaPlan`, which is why the byte-identical goldens are
the expected result rather than a lucky one.

### Two pre-existing failures found in passing — NOT caused by this work, not fixed here

1. **`npm run test:film-skins` cannot pass on this machine.** `scripts/gen-film-skins.js:22`
   hardcodes `templete-design/keyframe-handoff`, and neither `templete-design/` nor
   `old-templete/` exists in this working tree. This is §7a's defect recurring in a second
   script: a harness whose input moved, failing loudly only when someone runs the chain.
   (`gen-film-skins.js` is also untracked in git.)
2. ~~**`npm run test:pack-media` is non-deterministic**~~ — **WITHDRAWN, 11 Aug 2026.** I recorded
   38 / 36 / 26 / 28 failures across runs and concluded the guard was unreliable. It is not. Every
   one of those runs was executed while this investigation's own headless-Chromium sweeps were
   saturating the machine, and the guard renders each pack's composition to compare it — under
   that contention the renders fail and are counted. Run with nothing else going, it reports
   **135 / 135** (or exactly the one pack whose composer has genuinely changed). The lesson is the
   one this repo keeps re-learning about its own harnesses, arriving from the other direction:
   before calling a guard flaky, check what else was running.

---

## J. P1-6 wave 1 — bauhaus-riot, 11 Aug 2026

First of the fourteen. **Portrait density 0.57× → 0.94× of its own landscape density**, so the
pack is back in the vertical pool: `orientation` removed, `media.stage` declared instead.

### The cause was one unit, not seven layouts

Every size in the file is `cqw` — 1% of the frame's **width** — because the poster was authored
on a 1920×1080 sheet where width is the long side. In 9:16 width is the *short* side, so each
number draws a smaller object inside a frame 3.16× taller in those units. Nothing overflowed
and nothing errored; the poster became a band of small print on a tall page. Beat-by-beat
patching would have chased the symptom, so the fix is a single sheet scale (`TS = 1.62`, the
ratio that holds type at the same share of the **measure** — the line length it must fit —
rather than of the frame's height, which would have blown every headline out of a column that
is 44% narrower). `z(n, port)` restates an authored size for whichever sheet is being printed;
landscape passes through untouched by construction.

### What the sheet scale could not fix, and the frames found

| Beat | Defect | Fix |
| --- | --- | --- |
| `title` | **no portrait setting at all** — display sized against a 22-char measure on the wide sheet, a 30cqw rule under a 100cqw page, asterisk pinned at a landscape inset | fuller measure, rule runs to the type it underlines, ornament placed as a fraction of the page |
| `cta` | **no portrait setting either**, on the one frame whose job is telling the viewer where to go: its ball sat at `top:31.5cqw` — the upper sixth of the tall page, not beside the button it was drawn beside | both ornaments placed as page fractions |
| `recipe` | three 24cqw cells + two arrows measure ~95cqw across an 88cqw safe measure — the step row would have run into both margins | the row turns the corner: a column, arrows rotated with it |
| `manifesto` | the strike hangs 7cqw right of a line that now runs to the margin — off the page | the X moves onto the line's own end |
| `stats` | one stamp centred in 54% of bare paper | a short column **hangs from the panel's edge** rather than floating in the field |
| `plate` | the picture card was sized while everything around it was still landscape-small | the card grows with the re-set type |

**One fix was wrong and the render said so.** Stretching the ink panel to 64% to absorb the
slack under a single stamp traded an empty half-page of paper for an empty half-page of ink —
the counter and kicker inside it were dwarfed. The authored 46/54 split was restored and the
stamp column anchored instead.

### Three defects found at BOTH aspects while looking at the frames

Pre-existing, orientation-independent, and inside this template, so fixed here:

- **`pickStats` severed labels mid-word** — `.slice(0, 24)` printed `99.9% UPTIME ACROSS 40 R`
  inside a hard-edged stamp, where it reads as a rendering fault rather than an abbreviation.
  Now word-safe with an ellipsis. (One of the ~100 bare slices §6 lists.)
- **The unit beside the counter was the label's first word** — a stat whose label began with a
  figure set `8` and `99.9%` side by side in display type, two unrelated numbers reading as one.
  A unit is short and has no digits in it; anything else stays in its label.
- **`#bg-ring` drifted by a bare `+=18`** — the file's one unit-less length tween, so the ring's
  travel was device pixels while everything else scaled with the frame. Restated as the same
  distance it already had at 1920 wide, so landscape motion is unchanged. `KNOWN_DEBT` in
  `test-tween-units` drops from 2 packs to 1.

### Verification

- `test:frame-fill` — bauhaus-riot **0.94×**, and the sampled tier still green.
- `test:pack-media` — 135/135. The pack's picker card was correctly reported stale (its composer
  changed) and was re-rendered through the real render path, so the shop window shows the design
  the pack now produces rather than the one it used to.
- `test:golden` — **exactly two lines changed** (bauhaus-riot plain + brand); all other 133
  packs byte-identical. Re-baselined.
- ghosts · motion-safety · dead-tweens · dropped-css · shot-containment · no-playback-chrome ·
  transitions — 135/135 each. tween-units 134 + 1 known-debt (was 133 + 2).
- portrait 105/105 · orientation 14/14 · pack-composers 135/135 · media-profiles 135 up to date
  · asset-prep 44/44 · handoffs · quality · variety · audio · pacing · beat-sync · reuse ·
  integration — all green.
- Frames shot at both aspects and read side by side (7 beats each).

### Left alone deliberately

- **s1's asterisk crosses the headline in landscape.** Pre-existing, unchanged by this wave, and
  the element carries `data-layout-allow-occlusion` — the pack declares it decorative and free
  to cross. Moving it would be a landscape redesign, not a portrait fix.
- **The media contract still describes one sheet.** `media.stage` fixes *which* frame a slot is
  measured against, but a pack that genuinely re-lays per aspect has two slot sizes and
  `slotsByRole` can express one. bauhaus-riot's portrait plate is 84cqw where its landscape one
  is 44cqw, so its portrait coverage is now **understated** — the conservative direction, but a
  real modelling gap the next waves will keep hitting. Per-aspect slots are the fix, and they
  belong in their own change, not smuggled into a pack wave.

### Cheapest next

`blueprint-atelier` (0.66×, 17 portrait branches) and `terminal-departures` (0.56×, 8) are the
same shape of problem — a real portrait path authored before anything measured it. The eleven
with **zero** `port ?` branches (aurora-spectrum, bauhaus-print, biennale-yellow, blockframe,
bloom-illustrated, fable-storybook, kinetic-bold, midnight-glass, mono-corporate, noir-spotlight,
vapor-chrome) need the layout built, not corrected, and should follow.

---

## Appendix — how the measurements were taken

`measure-frame-fill.js` (scratchpad; promote as `scripts/test-frame-fill.js` under P0-3).
For each pack: resolve the real composer via `pipeline.composerModuleFor`, build against a
fixture of 8 scenes / 6 pictures (ratios 1.78, 0.8, 1.4, 1.0, 0.75, 1.6) + a logo, each picture
carrying a `sceneId` as the Creative Director assigns; serve the job dir over localhost; seek
`window.__timelines["vid"]` to 55% of each scene and dispatch `hf-seek`; then measure in layout
on a 64×64 grid — union area of text-bearing and media boxes, boxes escaping the frame, and text
boxes whose content exceeds their box.

**Known limits, stated so the numbers are not over-read:** full-bleed canvases and backdrops are
excluded, so packs that paint their content into WebGL (`flagship`, `brightlife`) read low on
`media` by construction — their rows are excluded from the media claims above. Two packs
(`bauhaus-riot`, `bloom-fable`) report zero media under the harness while building 6 `<img>`
elements correctly when called directly; that discrepancy is unresolved and is a probe artefact,
not a pack finding, so neither pack's media figure is used in any claim. The landscape/portrait
*ratio* per pack is robust regardless, because both halves use the identical probe.
