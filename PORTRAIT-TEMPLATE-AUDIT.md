# 9:16 Portrait Template Audit — KEYFRAME

Scope: every pack whose `pack.json` declares `orientation: "portrait"`.
Date: 2026-07-29 · Branch: `Rohit`

---

## Phase 1 — Complete Template Inventory

### 1.1 What a "template" actually is here

A KEYFRAME template is **not** a static HTML file. It is a **composer module** — a Node
function `buildComposition({ storyboard, dims, framePack, assets, captionCues, brandSkin,
localized, captionStyle, motionPlan })` that *emits* a self-contained `index.html`
(inline CSS + GSAP) plus `meta.json`. HyperFrames then renders that document by seeking a
**paused GSAP timeline** frame by frame in headless Chromium.

Every audit dimension below therefore has two layers:
- the **generator** (JS module in `server/src/services/`) — maintainability, modularity, duplication
- the **emitted document** (HTML/CSS/JS string) — structure, typography, motion, performance

### 1.2 Shared engineering contract

All portrait composers obey one contract (documented in `om_stage.js:28-32`):

| Rule | Why |
|---|---|
| One paused GSAP timeline on `window.__timelines["vid"]` | The renderer seeks it; a self-running ticker cannot be frame-captured |
| Direct-child `.clip` layers on unique `data-track-index` | Layer compositing + occlusion rules |
| Boundary `opacity:0` hard-kill per scene | Prevents scene bleed at cuts |
| One seek-safe caption node `#cap-text` via a single `onUpdate` proxy | Caption burn-in choke point |
| `cqw` units + `container-type:size` | Resolution independence |
| Resting state **is** the finished frame; `immediateRender:false` | A stalled ticker can never capture a blank scene |
| No `Math.random` / `Date` / `requestAnimationFrame` at runtime | Renders must be byte-deterministic |

**Verified:** zero `requestAnimationFrame`, `setInterval`, or `setTimeout` occurrences across
all 16 portrait composer modules. Randomness is build-time only (seeded `mulberry32`).
This contract is genuinely well-enforced — it is the strongest part of the codebase.

### 1.3 Inventory — 22 packs / 16 composer modules

| Pack | Renderer | Module | Surface | Cut | Purpose |
|---|---|---|---|---|---|
| ai-laboratory | `ai-laboratory` | `ai_laboratory_composer.js` (860) | lit | rise | Dark neural-research-lab film |
| aurora-motion | `aurora-motion` | `aurora_motion_composer.js` (646) | lit | drift | Ambient aurora film |
| digital-universe | `digital-universe` | `digital_universe_composer.js` (763) | lit | warp | Launch film inside a data-cosmos |
| editorial-motion | `editorial-motion` | `editorial_motion_composer.js` (724) | flat | page-set | Print-magazine kinetic typography |
| glass-dimension | `glass-dimension` | `glass_dimension_composer.js` (688) | lit | blur | Premium glassmorphism depth |
| kinetic-universe | `kinetic-universe` | `kinetic_universe_composer.js` (704) | lit | warp | Cinematic living-cosmos launch film |
| living-city | `living-city` | `living_city_composer.js` (795) | lit | rise | Living neon skyline at night |
| minimal-luxury | `minimal-luxury` | `minimal_luxury_composer.js` (649) | flat | fade | Minimalist-luxury keynote, negative space |
| motion-canvas | `motion-canvas` | `motion_canvas_composer.js` (697) | flat | snap | Abstract motion-graphics reel |
| nature-flow | `nature-flow` | `nature_flow_composer.js` (689) | lit | grow | Calm living-ecosystem, wellness/eco |
| neo-dashboard | `neo-dashboard` | `neo_dashboard_composer.js` (708) | lit | rise | Dark SaaS analytics coming alive |
| paper-craft | `paper-craft` | `paper_craft_composer.js` (754) | lit | fold | Handcrafted cut-paper film |
| product-showcase | `product-showcase` | `product_showcase_composer.js` (706) | lit | rise | Studio-stage product ad |
| retro-future | `retro-future` | `retro_future_composer.js` (695) | lit | rise | 80s synthwave / outrun |
| prisma-bloc | `dom-prisma` | `prisma_composer.js` (1382) | flat | block-wipe | Designed poster in motion |
| **OM family (7 packs, one engine)** | | `om_stage.js` (1108) + 7 skins (~200 ea.) | | | |
| ├ daybreak-bakehouse | `om-bakehouse` | `om_skins/daybreak_bakehouse.js` | lit | wipe | Sunrise bakery at first light |
| ├ hype-wave | `om-hype` | `om_skins/hype_wave.js` | flat | blinds | Electric sticker pop |
| ├ lantern-night | `om-lantern` | `om_skins/lantern_night.js` | lit | iris | Night lantern festival |
| ├ organic-garden | `om-garden` | `om_skins/organic_garden.js` | lit | push | Warm cream growing garden |
| ├ poster-pop | `om-poster` | `om_skins/poster_pop.js` | flat | wipe | Loud kinetic-typography poster |
| ├ premiere-night | `om-premiere` | `om_skins/premiere_night.js` | lit | doors | Cinema premiere |
| └ story-blocks | `om-blocks` | `om_skins/story_blocks.js` | flat | wipe | Edited-video look, no parked layouts |

### 1.4 Layout architecture

Two distinct strategies, both defensible:

**A. Authored-reference-frame (OM family, prisma-bloc).**
Everything is measured against a 1080×1920 reference and expressed as a fraction:
```js
const RW = 1080, RH = 1920;
const X = (px) => `${r((px / RW) * 100)}cqw`;   // sizes, gaps, ALL heights
const V = (px) => `${r((px / RH) * 100)}%`;      // vertical position only
```
`X()` is used for heights because *cqw is always definite* — a percentage height inside an
auto-height parent collapses. This is correct and subtle.

**B. Responsive-helper (the other 14).**
`services/responsive.js` provides `aspectMode`, `typeScale` (keyed on the **short** side, so
portrait doesn't blow type up), `safeArea`, `heroBox`, `headlineCh`, `mediaBoxCqw`, and
`plateBox`. **All 16 portrait modules import it** — adoption is complete.

### 1.5 Brand colour system

Uniform and genuinely good. `brand_kit.resolveBrand()` + per-pack `reHue()`:
`reHue` rotates a colour onto the brand hue while **bisecting HSL lightness back to the
source's relative luminance** (24 iterations, `LUM_PIN = 0.006`), so a recoloured value keeps
its exact rung on the pack's value ladder. Accent slots take brand hues in order; every
remaining colour (grounds, surfaces, ink, glows) rotates onto the lead hue. Fail-open: any
error renders the authored palette with `resolvedBrand = null`.

Contrast is enforced (`typeOn`, `onField`, per-pack `contrastFloor` defaulting to 3.0).

### 1.6 Asset placeholders

Every composer has a **zero-asset path** that renders a *designed* empty state, not a hole:
`om_stage.wirePlate()` generates a wireframe from the pack's own palette; prisma's showcase
falls back to a browser mockup holding that wireframe, which still scrolls. The source
templates' `"DROP IMAGE TO REPLACE"` dashed boxes were deliberately removed. **No demo or
placeholder content reaches a render** — confirmed by inspection.

---

## Phase 4 findings — asset placement (**8 of 22 packs were broken**)

### F-1 · CRITICAL · The regression guard was blind to 36% of portrait packs

`scripts/test-portrait-assets.js` resolved each pack's composer by **guessing a filename**
from the renderer id:

```js
const base = String(renderer).replace(/-/g, "_") + "_composer";   // "om-garden" -> om_garden_composer.js
```

Nothing enforced that guess. It is wrong for every pack whose module isn't named that way —
the seven OM skins live in `om_skins/`, and prisma-bloc's renderer is `dom-prisma` but its
module is `prisma_composer.js`. The miss was reported as:

> `SKIP (no dedicated composer — routes to scene-kit)`

which is **factually false** — all eight route to dedicated composers via
`pipeline.NATIVE_PACK_COMPOSERS`. The suite proudly reported `14 passed, 0 failed, 8 skipped`.
The real state was **14 verified, 8 broken and invisible**.

**Root cause:** a filename convention used as if it were a contract, with a silent fallback.
**Fix:** added `DEDICATED_COMPOSERS` + `composerModuleFor()` to `pipeline.js` as the single
authoritative renderer→module table; the guard now resolves through it. A genuine "no
dedicated composer" skip is still possible, but an unresolvable module no longer masquerades
as one. Wired into `npm test` as `test:portrait`.

### F-2 · HIGH · OM engine concentrated assets instead of distributing them (7 packs)

```js
// The montage wall wants MULTIPLE shots; feed it before evening out the rest.
for (const a of leftovers) {
  const montage = displayIdx.find((i) => baseArch[i] === "montage" && sceneShots[i].length < 4);
  let best = montage != null ? montage : displayIdx[0];
  if (montage == null) for (...) // <-- even-out ONLY runs when there is no montage
  sceneShots[best].push(a);
}
```

The even-out branch was gated on `montage == null`, so **whenever a wall existed it never ran**.
And a wall almost always exists: `varyArchetypes()` breaks the adjacent-duplicate
`feature, feature` that any ordinary deck produces by promoting one to `montage`.

Measured on a 5-scene deck with 3 captures (organic-garden): `s1 hook = 0, s2 = 1, s3 = 2,
s4 = 0, s5 = 0` → **three of five scenes rendered no imagery while one stacked two**.

**Fix:** coverage before depth — every display beat earns its first shot before any beat earns
a second; the wall then takes the surplus. `bMontage` already degrades gracefully (pads empty
tiles with palette blocks, single column at ≤2), so spreading costs it nothing.

### F-3 · HIGH · Capacity-blind distribution silently discarded captures (8 packs)

`bHook` draws `sceneAssets[0]` and nothing else; the dispatch slices to the beat's limit.
Distribution didn't know that, so surplus routed to a full beat was **assigned and then
thrown away** — after the Creative Director had paid to fetch, score and assign it. On the
standard feature deck this lost one of three captures outright (`missingAssignments: 1`).

**Fix:** explicit `SHOT_CAPACITY` maps in both engines, and every distribution step is now
capacity-bounded. A shot with genuinely nowhere to go is left unused rather than assigned to
a beat that will discard it.

### F-4 · HIGH · Display-capable beat sets were too narrow for real decks

`archetypeFor` sends every numeric proof line to `stats`. An ordinary five-scene deck
resolves to `hook / feature / stats / stats / cta` (OM) or `hook / grid / stats / stats / cta`
(prisma) — and with `stats` excluded from `CAN_SHOW`, only **two** beats (OM) or **one**
(prisma) could carry a capture. The shot the Creative Director pinned to the proof scene was
re-homed every time.

**Fix, respecting each pack's identity:**
- **OM** (soft/organic): capture sits behind the counters as a dimmed backing plate
  (`opacity .2`), scrimmed top and bottom into the ground. Counter cards are drawn on opaque
  `theme.paper`, so legibility is untouched. Deliberately **static** — the counters are the
  motion; a moving backdrop under rising cards is noise, not hierarchy.
- **prisma-bloc** (flat poster): a photographic wash would read as a different design system,
  so the capture rides **below** the counters in the pack's own hard-edged card frame, with
  the stat budget dropping 3→2 to buy the room.
- **prisma `voice` beat**: gained a supporting capture band. Note its attribution card has an
  `X(74)` colour disc as an avatar — a website capture crammed into a 74px circle would be
  exactly the "tiny asset container" defect, so the disc stays a colour mark and the capture
  gets a properly-sized band in the clear space below.

### Result

```
BEFORE:  14 passed, 0 failed,  8 skipped   (of 22)   <- 8 unverified
AFTER:   22 passed, 0 failed,  0 skipped   (of 22)
```
Full `npm test` suite green — no regressions.

---

## Phase 9 findings — architecture / duplication

### F-6 · HIGH · 130 redundant copies of the same primitives across 16 composers — **fixed**

The portrait composers grew independently from imported design bundles, so each carried its
own byte-identical copy of the same scaffolding. Measured across the 16 modules: **14 symbols
duplicated in ≥6 modules, 168 redundant copies**.

Consolidated into `services/composer_kit.js` (`GSAP_CDN`, `r`, `clamp`, `esc`, `hexToRgb`,
`relLum`, `longestWord`, `bullets`, `logoAssetOf`, `grainSvg`, `grainUri`) —
**130 local definitions removed**.

Three symbols were **deliberately excluded**, because "identical source text" is not
"shared behaviour". Each is documented in the kit so nobody merges them later:

| Symbol | Why it stayed | Risk if merged |
|---|---|---|
| `pickNumber` | **Two incompatible contracts under one name.** `om_stage`/`prisma` return a parsed `{pre,target,suf}` counter spec or `null`; the other 12 return a **boolean** | Unifying silently breaks one group |
| `GRAIN_SVG` | Text identical, **value is not** — the paper packs (editorial-motion, paper-craft) author `baseFrequency='0.85'` vs everyone else's `0.9`. That is art direction | Would silently retexture two templates |
| `headlineSize` / `fitCap` / `fitPlateW` | Identical bodies that close over **per-pack** layout constants (`SAFE_LINE_CQW`, `MEAN_ADVANCE_EM`, `_portrait`, `frameHmul`) | Needs those threaded through every call site — a separate refactor with real behavioural risk |

`grainSvg`/`grainUri` take `baseFrequency` as a parameter, so both authored textures survive
exactly while the 200-character SVG literal exists once.

**Verification — this is the important part.** A `golden-portrait` harness hashes the emitted
document for all 22 packs × {no brand, brand skin} = 44 compositions. Captured before the
refactor, compared after: **byte-identical**. The harness is now a committed baseline wired
into `npm test` as `test:golden`, and was proven sensitive by mutating one constant
(`* 100 / 100` → `* 10 / 10`), which it caught and failed on.

Note the net line count of the portrait modules **rose** (+375). That is not bloat — the
asset-distribution fixes (F-2/F-3/F-4) added substantial root-cause commentary. The
duplication metric that matters is the 130 removed definitions.

---

## Phases 2, 3, 5, 7, 8, 10 — evidence from a real render

**Subject:** job `alloo6l4kq` — *"30 sec introduction video of vercel"*, `https://vercel.com/`,
1 uploaded logo. Pack **lantern-night** (OM engine), 720×1280, 30 s, 30 fps, 900 frames,
`compose_mode: standard`, `usedFallback: 0`. Frames extracted at scene mid-points and at both
QA-flagged timestamps.

### What the pipeline said about itself

| Report | Verdict |
|---|---|
| `qa` | **FAIL, score 4/10** — 1 blocker (19.2 s), 1 minor (23.7 s), `repairable: false` |
| `validation_report` | 6/8 checks passed · 2 warnings (`brandColour` greyscale, `everySceneHasVisual` s5) |
| `motion_audit` | 76 tweens / 7 scenes (10.9 per scene), **0 static scenes**, 0 warnings |
| `brand_coverage` | 27 % brand-colour coverage, 3 brand colours used, 8 hardcoded uses |
| asset spread | **5 of 7 scenes carry an asset** (s7 CTA by design; s5 the sole gap) |

The asset spread confirms the F-2/F-3 fixes holding on a real 7-scene job.

**QA's verdict was accurate on both counts.** Both flagged defects are real and visible in the
frames. That is worth stating plainly: the vision reviewer earns its cost.

### F-7 · CRITICAL · The film closed on a storage-bucket hostname — **fixed**

The CTA — the single frame whose whole job is telling the viewer where to go — rendered:

```
lishhsx6kmthaacj.public.blob.vercel-storage.com
```

**Root cause.** `om_stage.addressFrom()` read *the first asset's* `sourceUrl` and took its
hostname. Harvested assets are served from storage/CDN hosts, so that is a bucket, not an
address. Meanwhile `graph.js` **already computes the correct value** — `brandStringOverrides()`
derives `ctaUrl` from `job.intent.websiteUrl` and passes it to every composer through
`localized` for exactly this purpose. om_stage never read it. All 7 OM packs affected.

**Fix.** `addressFrom` now prefers `S.ctaUrl`, and rejects storage/CDN hosts
(`NOT_A_BRAND_HOST`) when it does fall back to asset `sourceUrl`. Verified: renders
`vercel.com`.

### F-8 · BLOCKER · Headline type had no separation from the animated world — **fixed**

QA at 19.2 s: *"A decorative lantern asset overlaps the headline text 'Notion', reducing
readability."* Magnifying the collision showed the lantern is correctly **behind** the text
(DOM order and `data-track-index` are right) — but it is opaque, in the pack's accent hue, and
the headline accent is the *same hue*, so the "o" and "t" lost almost all separation.

**Root cause — an architectural gap, not a z-order bug.** Every OM pack paints a live
`<canvas>` world between the ground and the copy. The pack's contrast machinery (`typeOn`,
`onField`, per-pack `contrastFloor`) grades text against `ctx.ground` — the *flat scene
colour* — and is structurally blind to the canvas painted in between. Confirmed systemic:
`text-shadow` appeared **0 times** in the entire 88 KB document, and **27 composer modules
paint a canvas world**.

**Fix.** `headShadow()` applies a tight shadow in the *ground* colour at `headStack` — the one
choke point every display line flows through. Invisible on clean background; restores the edge
wherever a decoration passes. Now 5 occurrences per document.

### F-9 · MINOR · Stat labels truncated mid-word — **fixed**

QA at 23.7 s: *"The label text 'Serving+ monthly website vis' is truncated."* Not CSS clipping
— the **string itself** was cut: `pickStats` did a bare `.slice(0, 28)`.

**Fix.** `shortLabel()` trims to a word boundary and appends an ellipsis, so a shortened label
reads as deliberate rather than broken → `"Serving+ monthly website…"`.

### F-10 · HIGH · Photos pillarboxed in montage tiles — **fixed**

The montage tile at 10 s held a portrait stock photo in a landscape tile under
`object-fit: contain`, so the image occupied roughly a fifth of its tile with empty maroon
either side.

**Root cause.** `plate()` used `contain` unconditionally. That is correct for a **screenshot**
(cropping a UI cuts off the thing it exists to show) and wrong for a **photograph** (a texture,
which every editor crops).

**Fix.** `fitFor(asset)` routes on `kindHint`/`source`: screenshots and uploads keep `contain`,
photography gets `cover`, unknown stays conservative.

### Phase 3 — design consistency (observed)

Genuinely strong: clear kicker → headline → subtext hierarchy, a distinctive display face
that survives at portrait scale, consistent `X(72)` safe margin, and a coherent palette.

Two open issues, **not yet fixed** (see below): the CTA composition leaves the bottom ~45 % of
frame empty, and a full-bleed screenshot at 23.7 s is unscrimmed, so raw site copy ("Ship apps
that scale…", a nav bar) competes directly with the film's own typography and a hard
horizontal seam is visible where it begins.

### Phase 5 — animation (observed)

76 tweens across 7 scenes, **no static scenes**, no warnings, smooth cuts. Entrances are
staggered and land before the beat. Motion hierarchy is correct.

One structural finding: `motion_audit` records `ownChoreography: true` with
`actualEnter: null` and `honored: null` for **every** scene. The Motion Planner assigned
`spring / slide / mask-reveal / char-pop` per scene and the native composer discarded all of
it — by design (the pack owns its choreography), but it means the planner's output is dead
weight for all 22 portrait packs, and `planHonored` can never be anything but null.

### Phase 7 — responsiveness (measured)

**223 `cqw` units vs 23 `px`** — strongly resolution-independent, which is why the same
document renders correctly at 720×1280 and 1080×1920. Long headlines wrapped correctly
through `fitLines`. The two real overflow defects were the mid-word slice (F-9, fixed) and the
hero screenshot clipped at the canvas edge in s1 (open).

### Phase 8 — performance (measured)

| Metric | Value |
|---|---|
| Document size | 88 KB |
| DOM elements | **135** (7 scenes) |
| `<canvas>` | 1 (the shared world) |
| GSAP tweens | 76 |
| Transform/opacity animations | 117 (GPU-friendly) |
| Render time | ~68 s for 900 frames @ 2 workers |

135 elements for a 30-second film is **lean** — the "one canvas world + thin DOM scenes"
architecture is the right call and there is no DOM-complexity problem to solve here. Only 5
distinct hex literals reach the document (all theme-derived), so the brand system is working
at the emitted level; `brand_coverage`'s 8 "hardcoded" uses are inside the canvas painter.

### Phase 10 — quality score: lantern-night

| Dimension | Score | Note |
|---|---|---|
| Design / hierarchy | 8 | Distinctive, coherent, well-proportioned at portrait |
| Animation | 8 | 10.9 tweens/scene, no static scenes, clean cuts |
| Asset handling | 6 → **8** | Spread 5/7 good; pillarbox + address bar were real defects (fixed) |
| Responsiveness | 8 | 223 cqw vs 23 px; wrapping correct |
| Brand integration | 6 | World recolours properly, but achromatic input read greyscale |
| Code quality | 8 | One shared engine, 7 thin skins; now sharing composer_kit |
| Performance | 9 | 135 DOM nodes, 1 canvas, 68 s for 900 frames |
| **Overall** | **6.5 → 8.0** | Was held down by two QA-confirmed defects and a brand-damaging CTA |

**Why not higher:** the CTA still wastes the lower 45 % of frame, and the unscrimmed
full-bleed screenshot lets raw site copy fight the composition. Both are art-direction issues
rather than bugs, and both are listed below.

---

## Open findings (not yet fixed)

### F-5 · MEDIUM · ~~`pack.json → orientation` is dead metadata~~ — **fixed**

22 packs declare `orientation: "portrait"`, but:
- it is **not in the Zod schema** (`frame_manifest.js` `PackManifestSchema`) — it survives only
  because the schema passes unknown keys through;
- **nothing in the selection path reads it** — `frame_selector` (`graph.js`), `frame_registry.js`
  and the brief's pack suggestion never consult it.

Only `scripts/test-portrait-assets.js` reads it. So a **horizontal (16:9) job can select a
portrait-native pack authored against a 1080×1920 reference frame**. There is no guard and no
disclosure — unlike the localization reroute right beside it, which handles the exactly
analogous "this pack cannot serve this job" case.

**Measured impact.** Built organic-garden at both aspects and compared the deepest
absolutely-positioned box against the frame height:

```
PORTRAIT  1080x1920 (frame 177.8cqw tall):  deepest box ends  167.6cqw   fits
LANDSCAPE 1920x1080 (frame  56.3cqw tall):  deepest box ends   99.2cqw   OVERFLOWS by 76%
```

Cause: `V()` positions scale with **height** while `X()` heights scale with **width**. The two
are calibrated against each other at the authored 1080×1920 and nowhere else, so at 16:9
heights inflate exactly as the room for them contracts.

**Fixed:** `orientation` added to `PackManifestSchema`; `packOrientation()` /
`packFitsOrientation()` added beside `packAcceptsVectors()`; an orientation reroute added to
`frameSelectorAgent` ahead of the localization reroute (so a swap is still charset-checked).
Same law as its neighbour — an auto/brief pick is **corrected silently**, an explicit user
pick is **honoured and disclosed** via `db.setValidationNote`. An undeclared pack stays
compatible with everything (aspect-agnostic), and square jobs accept either authored aspect.
Covered by `scripts/test-orientation-guard.js` (14 assertions, wired into `npm test`).

One pre-existing test had to be updated: `test-agent-handoffs.js` asserted "an AUTO job keeps
the brief's suggestion" using the first non-canvas pack alphabetically — which is
`ai-laboratory`, a **portrait** pack, against a **horizontal** fixture. The guard correctly
rerouted it. The fixture now picks a `neutralPack` (no localization *and* no orientation
reason to reroute), so the test asserts the behaviour it names rather than the absence of a
guard.

### F-11 · MEDIUM · Backing captures kept their own typography legible — **fixed**

At 23.7 s the capture behind the counters still showed its own copy ("Ship apps that scale
from zero to millions instantly", a full nav bar) competing with the film's typography, plus a
hard horizontal seam where the plate began.

**Root cause — two distinct mistakes in the F-4 plate, both now corrected:**

1. **Opacity does not destroy legibility.** A white marketing page at `opacity:.2` over a
   near-black ground still resolves its black headings to mid-grey — perfectly readable at
   720 px wide. Fading a capture makes it quieter; it does not stop it being a *page*. Blur
   is what actually removes glyph legibility while keeping the impression of a product
   screen, so the plate is now blurred (`filter: blur(X(9))`, resolution-independent) with a
   slight `scale(1.06)` to hide the transparent edge blur leaves behind.

2. **The scrim faded to the wrong thing — the same blind spot as F-8.** It graded into
   `ctx.ground`, the flat scene colour, while every OM pack paints a live canvas world
   (hills, water, lanterns) between the ground and the copy. Wherever the world differed from
   the flat ground, the ground-coloured edge did not match it and left a visible seam. The
   plate now fades its own **alpha** via `mask-image`, making no assumption about the colour
   behind it at all.

Verified in a re-render: the site copy is an illegible smear, and the plate dissolves into the
world's horizon with no seam.

### F-12 · MEDIUM · CTA used a fixed anchor that ignored headline length — **fixed**

The CTA block was pinned at `top: V(560)` — a fixed 29 % anchor — so its composition was tuned
for exactly one headline length and drifted for any other.

**Fix.** The block now spans the portrait safe band (`responsive.safeArea` → top 10 %,
bottom 13 %) and centres its content, so it stays balanced whether the headline runs to one
line or three, and stays clear of the platform chrome overlay. The button carries
`align-self:flex-start` so it keeps its intrinsic width in the new flex column.

**Honest limit of this fix.** For the audited content the block only moved ~3 %, because it is
intrinsically short (~34 % of frame) and what reads as "empty" below it is the lantern-night
world's own horizon and water — the pack's design, not a layout fault. Genuinely filling that
space would mean enlarging the type, which would overflow on longer headlines. The defect that
was real (an anchor that did not adapt) is fixed; the perceived emptiness is art direction and
is left to the pack.

### F-13 · LOW · Motion plan computed for packs that ignore it — **fixed**

`motion_audit` reported `planned: true` with `honored: null` on all 7 scenes. Verified the
cause: `motionPlan` is threaded only into the scene-kit — `grep -c motionPlan` returns **0**
for `om_stage.js`, `prisma_composer.js` and `neo_dashboard_composer.js`. The planner assigned
`spring / slide / mask-reveal / char-pop` per scene and every native composer discarded it.

The real damage was to the *record*: "the composer drifted from its plan" and "there was never
a plan" both serialised as `honored: null`, so the disclosure could not distinguish a
measurement failure from an inapplicable measurement — and the one actually happening was
neither.

**Fix.** `packOwnsChoreography()` keys off the pack's declared renderer (empty ⇒ scene-kit).
For a pack that owns its motion the planner is skipped and records the *reason*; the animation
audit now emits `planApplies: false` with an explicit note instead of a null comparison. No
render changes — the natives were ignoring the plan already.

### F-14 · HIGH · The canvas-contrast bug was family-wide — **fixed in 5 more packs**

F-8 was fixed only in the OM engine. A probe was built to test the actual precondition across
every dedicated composer: *is a canvas painted behind the copy, in hues that can match that
copy, with no protection on the type?*

**The probe had to be corrected once mid-flight, and that matters.** Its first version read
only inline `style="..."` attributes and reported **zero headline colours** for every
stylesheet-based pack (`neo-dashboard` styles display type via `.nd-wordmark { font-size:11cqw;
color:#EEF2FB }`). That scored those packs "no collision" for entirely the wrong reason — a
false clean bill. Reading both styling systems changed the at-risk count from 1 to 5.

| Verdict | Packs |
|---|---|
| **At risk → fixed** | `aurora-motion`, `glass-dimension`, `minimal-luxury`, `motion-canvas`, `nature-flow` |
| Already protected | 12, incl. the 7 OM packs (F-8), `flagship`, `living-city`, `retro-future`, `bauhaus-riot`, `paper-tales` |
| Correctly excluded | `brightlife`, `editorial-motion` — see below |

**Confirmed before fixing, not assumed.** `nature-flow` was rendered: a leaf sits directly on
the "A" of "Acme", same hue family, no separation — the identical mechanism to the lantern
behind "Notion", milder only because leaves are smaller.

**Fix.** `composer_kit.displayShadow(ground)` — a tight halo in the ground colour, in `cqw` so
it holds at any output size, static so it costs nothing per frame. Applied to the `.XX-display`
and `.XX-h1` rules the five packs share. Blast radius verified by the golden guard: exactly 10
compositions (5 packs × 2 modes), nothing else touched.

**Two packs deliberately excluded — the fix is not universally appropriate:**

- **`brightlife`** paints its text *into* WebGL textures (10 `fillText` calls). CSS cannot
  reach it; protecting that text means drawing a shadow in the canvas calls. Different
  mechanism, separate job.
- **`editorial-motion`** is a flat print pack whose canvas paints uniform paper grain
  (`fillRect` + tiny low-alpha dots), not discrete opaque objects, and whose grain overlay sits
  *above* the copy at `track-index 40` by design. There is no same-hue blob to collide with —
  and a glow on print typography would be a design regression, not a fix.

### F-15 · HIGH · Two-line headlines collided with the plate stack in both 3D packs — **fixed**

Rendering `flagship` and `brightlife` at 1080×1920 showed the second headline line running
straight across the hero plate — in flagship, "everything" sat over the plate holding the real
product screenshot, covering the thing the film exists to show. Reproducible with and without
a real asset, in both packs.

**Root cause.** On every treatment except `hook`/`cta` the copy is pinned to the top safe area
(`sceneOverlay`: `justify-content:flex-start`) with **unbounded height**, while the WebGL plate
stack is centred on `y=0` (three plates at y ≈ +2.9 / 0 / −2.9). A one-line headline clears the
top plate; a two-line one does not. Nothing reconciled the two because the copy is DOM and the
stack is WebGL — different coordinate systems, no shared budget.

**Diagnosis was empirical, and the first hypothesis was wrong.** A `window.__HEROY` probe was
injected against `spec.role === "hero"` and moved nothing — the colliding plate is not the hero
but the top of the *feature* stack. The probe is what caught that; the camera arithmetic alone
would have sent the fix to the wrong object.

**Fix.** A `COPYDROP` of one plate-gap applied to the portrait placements, gated on the same
condition that top-anchors the copy (`sc.type !== "hook" && sc.type !== "cta"`). `hook`/`cta`
centre their copy vertically and never competed, so they render exactly as authored. Verified
by re-render in both packs: copy clear at top, hero plate fully visible in the mid-band with
the screenshot legible, supporting plates stacked below and inside the bottom safe area.

**Coverage gap found while verifying this.** The golden guard filtered on
`orientation === "portrait"`, so `flagship` and `brightlife` — which declare no orientation —
had **no golden coverage at all**: it reported "44 byte-identical" immediately after both were
edited. The harness now covers every pack with a dedicated composer (`golden-composers.js`,
**29 packs / 58 compositions**, up from 22/44) and was proven sensitive on flagship by mutating
`COPYDROP` and confirming it fails.

### Note on F-14's premise — corrected

F-14 recorded that `brightlife` and `flagship` "bake text into WebGL textures, so DOM-level
protection does not cover them". **That was wrong.** Their headlines are DOM `<h1 class="khead">`
and both already carry a radial scrim behind the text stack (flagship additionally ships
`text-shadow` on `.khead`). The 12 `fillText` calls in each paint a *synthetic analytics
dashboard* used as a product-screen texture — decorative UI chrome on a controlled white panel,
not the film's copy. No canvas-text fix was needed or made.

The probe had also under-counted protection by scoring only `text-shadow`/stroke and ignoring
scrims — its second defect, after the split-declaration bug in F-14. Static probes over
heterogeneous composers need their **negatives** verified, not only their positives.

### Remaining phases

Phases 2, 3, 5–10 are **not yet complete**. Evidence gathered so far:

- **Phase 2 (code quality):** no runtime `rAF`/timers/leaks in any portrait composer — the
  determinism contract rules that class out. Hardcoded hex literals per module range from 1
  (`om_stage`) to 19 (`living_city_composer`); each needs individual triage, since some are
  legitimately non-brandable (pure black shadow bases, `#000` scrims) and some are not.
- **Phase 9 (architecture):** `om_stage` (7 packs on one engine) is the model to follow;
  the 14 standalone composers share ~600-800 lines of near-identical scaffolding
  (colour maths `hexToRgb`/`relLum`/`reHue`, `esc`, `seedFrom`/`mulberry32`, entrance
  FROM/TO maps). This is the single largest duplication in the portrait codebase and the
  highest-value remaining refactor.
- **Phases 3, 5, 7, 8, 10** require rendering actual MP4s and inspecting frames. Harnesses
  exist (`scripts/om-harness.js`, `prisma-harness.js`, etc.) and should drive this rather than
  source reading — motion smoothness, layout stability under long text, and repaint cost
  cannot be honestly assessed from a template literal.

---

## Changed files

| File | Change |
|---|---|
| `src/services/pipeline.js` | `DEDICATED_COMPOSERS` table + exported `composerModuleFor()` |
| `src/services/om_stage.js` | `SHOT_CAPACITY`; `stats` added to `CAN_SHOW`; coverage-before-depth distribution; `bStats` backing plate |
| `src/services/prisma_composer.js` | `SHOT_CAPACITY`; `stats`+`voice` in `CAN_SHOW`; capacity-bounded distribution; `bStats` capture band; `bVoice` capture band |
| `scripts/test-portrait-assets.js` | Resolves via `composerModuleFor()`; honest skip reason |
| `src/services/frame_manifest.js` | `orientation` in the schema; `packOrientation()` + `packFitsOrientation()` |
| `src/agents/graph.js` | Orientation reroute + `pickFittingPack()`; `orientationPackWarning` disclosure |
| `src/services/composer_kit.js` | **New** — shared composer primitives (+ why 3 symbols stayed put) |
| 16 portrait composer modules | Local primitive definitions replaced with a `composer_kit` require |
| `scripts/test-orientation-guard.js` | **New** — 14 assertions on the reroute law |
| `scripts/golden-composers.js` + `.txt` | **New** — byte-identity baseline for 58 compositions (29 dedicated composers) |
| `scripts/test-agent-handoffs.js` | Fixtures pinned to a `neutralPack` (see F-5) |
| `package.json` | `test:portrait`, `test:orientation`, `test:golden` wired into `npm test` |

## Test suite

```
npm test   →  brand-kit 61 · asset-priority 14 · taxonomy 87 · screenshot-intake 8
              handoffs 10 · quality 28 · peekshot 11 · variety 28 · audio 13 · spread 7
              portrait 22/22 (0 skipped) · orientation 14 · golden 44 byte-identical
              content 13 · integration 10          — all green
```
