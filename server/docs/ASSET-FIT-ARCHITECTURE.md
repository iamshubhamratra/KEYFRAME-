# Placeholder-aware asset fitting

How a picture gets chosen for a box, and how it meets that box, across every render path.

---

## The defect this replaces

Every composer in this repo wrote the same string into every image it drew:

```html
style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;"
```

Forty-odd call sites, one literal, no variation — verified on a shipped film
(`server/jobs/pkffl0i9dz/index.html`: 11 `<img>` elements, 11 identical fit declarations).

`cover` fills the box and discards whatever overflows. `top center` decides what survives
without ever looking at the image **or** at the box. Measured on that film:

| | |
|---|---|
| Hero plate | `family_charged.js` → `top:13%; bottom:13%; width:45cqw` |
| Painted box @1920×1080 | 833 × 768 px → **aspect 1.08** |
| Website captures | 2732 × 1800 px → **aspect 1.52** |
| Discarded by `cover` | **28.5% of every capture's width**, 14% off each side |

Fourteen percent off each side of a web page is its navigation. The film shipped with the
site's nav cut mid-word on both edges of every frame.

### Why nobody could have fixed it upstream

**A placeholder's aspect ratio did not exist anywhere in this codebase.** A media box is
sized by mixing units — `width:45cqw`, where `cqw` is a percentage of the container's
**width**, together with `top:13%;bottom:13%`, percentages of its **height**. The box is
864×799 at 1920×1080 and 950×730 at 1080×1920, and *nothing computed either number*. The
shape was an emergent property of the render dimensions.

Downstream, the only geometry any selector ever saw was `template_engine.js:309`:

```js
function shapeForWant(want) {
  if (want === "phone")   return isPortraitAsset;
  if (want === "desktop") return (x) => !isPortraitAsset(x);
  return null;
}
```

A binary portrait-or-landscape predicate. So a 1.52 capture was "compatible" with a 1.08
box, and no amount of better *semantic* matching could have helped: the mismatch was
geometric, and the geometry was not a number anyone held.

### The machinery that was already here, unwired

- **`crop_engine.js`** — 30KB of real content-aware focal-point analysis (smartcrop, with
  an ffmpeg edge-energy fallback), complete and working, called from **exactly one site**
  in the whole repo (`film_stage.js:657`).
- **`preflight.js:267`** — a whole gate keyed on `mediaPlan.placeholders`: critical slots
  filled, quality in the hero box, authored-vs-derived severity. It had never run once.

Both name the same missing module in their own comments:

```
crop_engine.js:27   "…the distinct slot ratios `template_media.resolveMediaPlan` says
                     this film actually needs — typically two or three"
preflight.js:49     "@param {object} args.mediaPlan  the chosen template's resolved slot
                     contract (services/template_media.resolveMediaPlan)"
```

`services/template_media.js` was never written. The crop engine was built against a slot
contract that did not exist, so nothing could tell it which aspect ratios to analyse for,
and the gate that depended on it silently no-opped on every job.

---

## The pipeline now

```
Template declares mediaSlots + mediaGeometry        family_*.js / *_composer.js
        ↓
Placeholder specification (real px, real aspect)    template_media.resolveSlots
        ↓
Crop engine analyses each image per slot aspect     crop_engine.annotateAssets
        ↓
Selection scores shape as well as subject           template_engine take() + asset_fit.fitScore
        ↓
Fit decision travels with the picture (asset.__fit) asset_fit.fitFor / withFit
        ↓
Composer draws it                                   E.fitCss(asset)
        ↓
Render-time correction against the painted box      asset_fit.runtimeFitScript
        ↓
Audited from the rendered DOM                       asset_render_check.auditAssetFit
                                                    scripts/audit-slot-fit.js
```

One policy, defined once in `asset_fit.js`, applied in Node to **choose** the asset and in
the page to **fit** it.

---

## Declaring a placeholder

Beside the `mediaSlots` map a composer already publishes, add `mediaGeometry`:

```js
const mediaSlots = { chargeplate: ["desktop"], gridburst: ["photo", "photo"] };

// Fractions of the CANVAS — wFrac of its width, hFrac of its height. Fractions rather
// than pixels because one declaration then serves 16:9, 9:16 and every long-form variant.
const mediaGeometry = {
  chargeplate: {
    land: [{ wFrac: 0.45, hFrac: 0.74, importance: "hero", flex: [1.00, 1.90] }],
    port: [{ wFrac: 0.88, hFrac: 0.38, importance: "hero", flex: [0.95, 1.75] }],
  },
  gridburst: {
    land: [{ wFrac: 0.349, hFrac: 0.41, importance: "support", flex: [1.15, 1.75] },
           { wFrac: 0.349, hFrac: 0.41, importance: "support", flex: [1.15, 1.75] }],
    port: [{ wFrac: 0.88, hFrac: 0.346, importance: "support", flex: [1.15, 1.75] }],
  },
};

module.exports = { buildComposition, planMedia, TEMPLATE_SCENES, FAMILY: family };
```

| Field | Meaning |
|---|---|
| `wFrac` / `hFrac` | the painted box, as fractions of canvas width / canvas height |
| `flex` | `[minAspect, maxAspect]` the box may **reshape** within — see below |
| `importance` | `"hero"` (becomes a **critical** placeholder in preflight) / `"support"` / `"accent"` |
| `fit` | `"auto"` (default — the engine decides), or a hard `"cover"` / `"contain"` |
| `allow` | content classes the slot will accept **at all** — a hard filter, not a preference |
| `minPx` | shortest source side that still reads at this size (defaults from the box) |

**Declaring nothing is safe.** A composer with no `mediaGeometry` yields specs with no
dimensions, and `asset_fit` degrades to its content-class default — which still refuses to
crop a logo and still uses a real focal point instead of `top center`. Adopting this can
only improve a call site, never regress one.

### `flex` — the part that actually removes the crop

`flex` says: *this design tolerates the plate being any shape between these two ratios*.
The box then takes the shape the picture already has, and the crop is zero.

A crop you never take beats the cleverest crop you do.

Measured on `chargeplate` at 1920×1080, with a 2732×1800 capture:

| | box | fit | crop |
|---|---|---|---|
| fixed box | 864 × 799 (1.08) | cover | **28.5% of width** |
| fixed box, contain | 864 × 799 (1.08) | contain | 0%, but **28.5% of the plate empty** |
| `flex: [1.00, 1.90]` | 889 × 573 (1.55) | cover | **0%** |

Only declare `flex` where the composer honours it — it must call `template_media.boxCss`
with the fitted box, as `chargeplate` does. A `flex` the composer ignores is worse than
none, because the engine would then compute the fit for a box that is never drawn.

### Orientation-aware slot counts

`mediaSlots` is resolved without ever seeing the film's dimensions, which is how a
four-across wall became four slivers in 9:16. A composer may publish `mediaSlotsPortrait`
for the types whose **count** should change when the frame is tall:

```js
const mediaSlotsPortrait = { gridburst: ["photo"] };   // one big tile, not two slivers
```

At 1080×1920 the `gridburst` wall went from two 950×354 tiles (aspect 2.69, cutting 40% off
an ordinary photo's height) to one 950×664 tile (aspect 1.43). Fewer, bigger.

---

## The fit decision

`asset_fit.fitFor(asset, slot)` applies four rules in order. It **never** returns
`object-fit: fill` — nothing in a KEYFRAME film is ever stretched.

1. **Reshape the box** when the slot declares `flex`.
2. **Cover with a content-aware focal point** when the residual crop is inside what the
   content class tolerates.
3. **Contain** when the class must not be cut at all.
4. **Cover, and say so** (`compromised: true`) when nothing better exists.

### Content classes and what they can afford

| class | crop tolerance | why |
|---|---|---|
| `logo` | **0** | half a logo is not a crop, it is the wrong logo |
| `vector` | **0** | flat art has no spare margin; a cover-cropped icon reads as a smear |
| `ui` | **0.10** | a page's load-bearing pixels are at its margins — nav, primary button, price |
| `photo` | **0.34** | a photograph is a field, not a document; a third off one axis is ordinary |

Beyond `MAX_PAD` (0.42) `contain` stops being a fit and becomes a stamp in an empty box, so
a `ui` asset past that falls through to rule 4 rather than letterboxing into a sliver.

Note that cover-loss and contain-pad are the **same number**: the fraction of the source
`cover` throws away is exactly the fraction of the box `contain` leaves empty. Cropping and
letterboxing cost the same; the only question is which the content can survive.

---

## Selection

`asset_fit.fitScore(asset, slot)` returns 0..1 over four terms, and
`template_engine.planMedia` adds `3.2 × fitScore` to its topical match score — worth about
two strong word matches: enough to break a tie or overrule a marginal semantic edge, never
enough to seat an off-topic picture on a beat that has a right one.

| term | weight | |
|---|---|---|
| shape | 0.42 | `exp(-aspectDistance/0.28)` — a soft falloff, not a threshold, so a narrow asset pool still fills its slots |
| survival | 0.26 | how much of the picture survives the crop its class can bear |
| resolution | 0.18 | penalised past `UPSCALE_LIMIT` (1.25×) |
| intent | 0.14 | a stock photo inside browser chrome claims to be the product's screen |

`slot.allow` is separate and absolute: a class the design cannot hold is not castable into
it at any score. (The slot that prompted this is a 61px circular attribution disc, which
drew a full desktop website capture in a measured render.)

---

## Render-time fitting

The box is only truly known in the browser. A declaration can be absent (197 of the 311
packs render a bundled template this repo does not author), or a camera transform can scale
a box after layout.

So `pipeline.writeComposedHtml` — the single write site every composer path already funnels
through — injects `asset_fit.runtimeFitScript(assets)`: a self-contained pass that walks
every image (through shadow roots, which the bundled templates render inside), reads the box
the browser actually painted, and applies the same policy. It is idempotent, records the
last declaration it wrote per element, and runs on every animation frame.

`omelette_adapter`'s own `kfFitShots` defers to it when present.

---

## The 255 packs that cannot declare

197 packs render a bundled template this repo does not author; 50 more are long-form
FilmKit skins whose geometry lives in generated files. Neither can publish a
`mediaGeometry`, and without one the crop engine was handed a hardcoded guess
(`[1.6, 1.0, 0.75]` in landscape) — three ratios those films never draw.

`template_media.MEASURED_ASPECTS` closes that: one row per renderer, holding the box
aspects `scripts/audit-slot-fit.js` actually **measured** in headless Chrome. Every caller
goes through one resolver:

```js
TM.aspectsFor(rendererKey, composerOrFamily, dims)
//  1. the template's own declaration   (best — it knows its flex bands)
//  2. the measured table               (for a renderer that cannot declare)
//  3. a generic guess                  (only a renderer added since the last audit)
```

`aspectsForFamily` accepts a composer **module** as well as a family object, because three
call sites passed the module — and since a module has no `mediaSlots`, they silently fell
through to the guess even for packs that *did* declare.

Regenerate the table after a template change: `npm run audit:slotfit:long`.

## Selection

`asset_fit.fitScore(asset, slot)` returns 0..1 over four terms, and
`template_engine.planMedia` adds `3.2 × fitScore` to its topical match score — worth about
two strong word matches: enough to break a tie or overrule a marginal semantic edge, never
enough to seat an off-topic picture on a beat that has a right one.

| term | weight | |
|---|---|---|
| shape | 0.42 | `exp(-aspectDistance/0.28)` — a soft falloff, not a threshold, so a narrow asset pool still fills its slots |
| survival | 0.26 | how much of the picture survives the crop its class can bear |
| resolution | 0.18 | penalised past `UPSCALE_LIMIT` (1.25×) — **and, for a UI capture, past a 2.2× downscale**, because a 2732px page crushed into a 397px tile is sharp and unreadable |
| intent | 0.14 | a stock photo inside browser chrome claims to be the product's screen; a page capture in a plain gallery tile is a picture *of* a webpage |

`slot.allow` is separate and absolute: a class the design cannot hold is not castable into
it at any score, and that survives the "a real asset beats a repeat" relaxation in
`fillSlots`. (The slot that prompted it is a 61px circular attribution disc, which drew a
full desktop website capture in a measured render.)

## What a bad fit now costs

A fit decision is stamped on its clip, read back off the rendered document by
`asset_render_check.auditAssetFit`, persisted as the job's `asset_fit` report, and carried
into the user-facing delivery report by `delivery_quality`:

| `fitStatus` | delivery report |
|---|---|
| `FAIL_HEAVY_CROP` | **major** — "N of M pictures lose 20% or more of themselves to the crop" |
| `WARN_COMPROMISED` | **minor** — "N pictures had no good fit for their slot" |
| `WARN_CROP` / `PASS` | nothing |

Previously the verdict was computed and died in a `console.log`.

## Verification

**Nothing here is trusted; it is measured.**

```
npm run audit:slotfit                        # both orientations, one pack per renderer
npm run audit:slotfit:long                   # include the long-form film-* skins
npm run check:slotgeom                       # declared geometry vs what the browser paints
npm run compare:slotfit -- <before> <after>  # assignment-invariant before/after
npm run shots:realjob                        # render a real job's own assets, for the eye

node scripts/audit-slot-fit.js --raw         # no render-time fitting — the "before" baseline
node scripts/audit-slot-fit.js --shots       # save a PNG of every scene
node scripts/audit-slot-fit.js --packs ignition --dims 1080x1920
node scripts/shoot-real-job.js --job jobs/pkffl0i9dz --pack ignition --raw
```

`compare-slot-fit.js` exists because the obvious metric — mean crop over every measured
image — is **not fair** across a change that alters slot counts. Reshaping a portrait wall
from two letterbox tiles to one readable one frees an asset, the router spends it on a beat
that did not exist before, and that beat's rows enter the average. Three of the thirteen
fixed composers improved every slot they own and still showed a worse mean. So the
comparison asks of each SLOT SHAPE, not each measured image: what would this box do to a
1.518 capture, a 1.6 photo and a 0.667 portrait, run through the real fit policy? That
depends only on the box, so a slot compares with itself no matter what was cast into it.

Each pack is built into a real composition, loaded in the same headless Chrome the renderer
uses, seeked to each scene's midpoint, and every `<img>` is read off the live layout: box,
natural size, resolved `object-fit` / `object-position`, crop loss, upscale, stretch,
overflow. Probe assets are gridded test cards with edge bars, at every shape in the matrix
(2732×1800 desktop capture, 750×1624 mobile capture, landscape / portrait / square /
ultra-wide / low-res photos, a logo, an SVG), so a bad crop is visible in `--shots` and
measurable in the JSON.

A `mediaGeometry` declaration that drifts from a composer's CSS is a measurable
disagreement, not a silent lie: `template_engine` stamps `data-slot-box` (the planned box in
px) and `data-media-fit` (mode and crop per slot) on every clip, alongside the
`data-media-demand` / `data-media-filled` coverage stamps that were already there.

Per-job, `asset_render_check.auditAssetFit` reads those stamps back off the rendered
document and reports `fitStatus`: `PASS` / `WARN_COMPROMISED` / `WARN_CROP` /
`FAIL_HEAVY_CROP`.

---

## Capture-side

No fitting can rescue a bad capture. `ingest/website.js` used five fixed fractions of the
page height (0.22, 0.40, 0.58, 0.76, 0.90) chosen without asking what was at those pixels —
which put one shipped capture on a band of whitespace and another on the page **footer**.

It now takes section offsets from the DOM (block regions tall enough and full enough to be a
section, footer excluded), skips a capture whose viewport is under 20% covered by words or
pictures, and **unpins sticky and fixed chrome** for the deep-section pass:

- `position: fixed` → hidden. It is out of flow, so nothing moves when it goes.
- `position: sticky` → `static`. It stays where the document put it and stops following the
  scroll, so the section it belongs to still shows it.

The hero capture keeps its chrome — the top of a page is where a nav belongs. Measured on
figma.com: 2 elements unpinned (the nav and the "2x more credits" promo strip, which had
been baked into all six captures), one blank section skipped.

---

## Files

| file | role |
|---|---|
| `services/asset_fit.js` | the policy: classify, score, fit, and the render-time pass |
| `services/template_media.js` | the slot contract: geometry, aspect list, `boxCss`, preflight's `placeholders` |
| `services/crop_engine.js` | content-aware focal points (pre-existing; now wired) |
| `services/template_engine.js` | resolves specs, scores shape in `take()`, stamps the plan, exports `fitCss` |
| `services/asset_render_check.js` | `auditAssetFit` — fit status read back off the render |
| `scripts/audit-slot-fit.js` | the instrument: measures every placeholder in every path |
