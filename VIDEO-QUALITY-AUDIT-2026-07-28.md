# KEYFRAME — 9:16 Video Quality Audit (2026-07-28)

> Audit of the recent vertical films: what the system PLANNED against what the render
> actually SHOWED, traced to the module that caused each gap. Evidence is the job records
> (`jobs.json`), the composed HTML on disk, and frames pulled from the delivered MP4s.

---

## 0. Scope

116 completed films in the store; **35 vertical (720×1280)**. This audits the eight most
recent 9:16 jobs:

| job | pack | dur | scenes | assets | scenes with a visual | layout score | QA |
|---|---|---|---|---|---|---|---|
| `48vb7svz9s` | motion-canvas | 30s | 8 | 6 | 4 | 58 | fail (4) |
| `755o2m8g21` | daybreak-bakehouse | 40s | 9 | 6 | 4 | **41** | fail (4) |
| `id97qn9wwk` | poster-pop | 30s | 7 | 6 | 4 | 63 | fail (4) |
| `8qcod42pjf` | kinetic-universe | 30s | 7 | 8 | **7** | **90** | fail (4) |
| `h3w1374vjp` | hype-wave | 30s | 7 | 7 | 5 | 70 | fail (4) |
| `tj7yopg2bg` | hype-wave | 30s | 7 | 9 | 4 | 63 | fail (4) |
| `clqrzgq809` | ai-laboratory | 30s | 8 | 8 | 5 | 65 | fail (4) |
| `mqmgilcnjq` | prisma-bloc | 30s | 7 | 6 | 4 | 45 | fail (4) |

**QA failed 8 of 8.** The system already knows these films are weak and ships them anyway —
see §4.

---

## 1. The primary root cause: assets are not distributed

Every film collected enough assets. None of them spread them.

```
755o2m8g21   6 assets → s1, s1, s1, s2, s5, s9      3 scenes covered of 9   score 41
48vb7svz9s   6 assets → s1, s1, s2, s5, s8, s8      4 of 8                  score 58
8qcod42pjf   8 assets → s4, s2, s3, s5, s1, s6, s2, s7   7 of 7             score 90
```

**The best and the worst film differ by distribution, not by asset count.** `8qcod42pjf`
scored 90 because the Creative Director happened to assign eight assets to seven distinct
scenes. `755o2m8g21` scored 41 because three of its six landed on scene 1 — leaving six
scenes as bare template panels.

**Why it happened.** The Creative Director assigns `assignScene` per asset, judging each
one in isolation against the scene plan. Nothing downstream ever inspected the *result as a
distribution*. `maxPerScene` caps how many assets may be PROMINENT in a scene, but a capped
asset stays on that scene as background rather than moving to an empty one.

**Downstream impact.** This single gap produces four of the reported symptoms: "only 2–3
images in the whole video", "empty asset containers", "excessive empty space", "scenes that
rely on animation with no content".

**Why validation missed it.** It did not — `preflight` raised `everySceneHasVisual` on all
eight films ("6 of 9 scene(s) have NO renderable visual"), and the layout review recorded
`emptyScenes: 6`. Both are **warn** level, so both were disclosed and ignored (§4).

### Fixed — `visual_layout_director.spreadAcrossScenes`

Every scene gets one asset before any scene gets two. The surplus moved is always the
**lowest-ranked** asset on an over-subscribed scene, so a scene keeps its strongest visual
and the hero never moves; the logo is never relocated (it is key-moment material); an asset
moves to the **nearest** empty scene so it doesn't jump the story beat it was chosen for;
and its `startSec`/`durationSec` follow it, or it would animate in a window it no longer
occupies.

Replaying `755o2m8g21`'s exact recorded assignment through the fix: **3 covered scenes → 5**,
two assets moved (`s1→s3`, `s1→s4`). `scripts/test-layout-spread.js`, 7 assertions.

---

## 2. Second root cause: the composer silently discards assets it was handed

`755o2m8g21` — 6 assets on the wire, **4 referenced in the composed HTML**:

```
RENDERED  upload         s9   uploads/logo.png
DROPPED   website-asset  s1   ingest/brand_assets/a9.png
DROPPED   website-asset  s1   ingest/brand_assets/a10.jpg
RENDERED  website        s1   assets/images/site_0.png
RENDERED  website        s2   assets/images/site_1.png
RENDERED  website        s5   assets/images/site_2.png
```

The dropped pair are exactly the assets the CD marked `cdProminence: background`
(`visionOk: false`). Every native pack gates placement on

```js
return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
```

`isTrustedProminent` deliberately excludes harvested `website-asset` imagery unless the CD
approved it. So a demoted asset is not *demoted* in these packs — it is **discarded**,
because the native packs have no background/B-roll tier. (The scene-kit does: demoted
assets become scrimmed B-roll.)

`preflight` reports this as `scenesRenderNoAsset` — "5 of 8 scene(s) show no asset and
render template-only panels" — on **all eight films**.

**Status: diagnosed, not fixed.** The honest fix is a background tier in each native pack
(≈22 composers), which is layout work per pack, not a predicate change. Widening the
predicate alone would promote assets the director judged weak into hero slots.

---

## 3. Third root cause: scenes carry 2–6 words

Measured on-screen word counts per scene:

```
755o2m8g21  [5,2,2,4,4,3,4,4,2]
48vb7svz9s  [4,3,3,4,4,4,3,3]
8qcod42pjf  [3,5,6,5,4,5,3]
```

A typical scene is a two-word headline and nothing else — "Meet Claude", "Steerable
Systems", "Public Benefit". There is no supporting line, no feature description, no
benefit. On a 720×1280 canvas that is a title floating in a tall empty frame.

**Where it originates:** `SceneSchema.onScreenText` permits up to 4 lines × 80 chars but
requires **none**; `system_script.md` never demands supporting copy; and `validateScript`
only *warns* ("holds a single line for 4s — consider a supporting line"). Nothing makes a
scene earn its runtime.

**Status: diagnosed, not fixed** — see the roadmap. It is a prompt + validator change, and
it changes every script the system writes, so it wants to land on its own.

---

## 4. Why none of this was caught: the disclosures have no teeth

Every defect above was **detected and recorded** before delivery:

| signal | what it said | level |
|---|---|---|
| `preflight.everySceneHasVisual` | "6 of 9 scenes have NO renderable visual" | warn |
| `preflight.scenesRenderNoAsset` | "5 of 8 scenes render template-only panels" | warn |
| `layout_review.emptyScenes` | 6 · composition score 41 | telemetry |
| `qa` | **pass=false, score=4** on 8 of 8 films | recorded |

The QA agent failed every one of these films and the pipeline shipped them regardless,
because a repair lap only runs when `repairable` is true — and native composers are
deterministic, so it is false. The verdict is correctly *recorded* and there is no path
from "QA says 4/10" to "do not deliver this".

**This is the gap the brief names**: *"report the issue before rendering instead of
producing a low-quality video."* The signals exist; the policy does not.

---

## 5. Visual findings (frames from `755o2m8g21`)

- **Clipped headline** at ~8s: "Meet Claud…" runs off the right edge.
- **Asset cropped by the frame**: the same scene's screenshot sits half outside the canvas.
- **Overlap** at ~30s: "Securing" is covered by a white panel.
- **Large dead regions** at ~15s and ~22s — a short line of copy in the upper third, nothing
  below it.

The first three are 9:16 layout defects in the pack (text not fitted to the narrow canvas,
containers positioned for 16:9). The fourth is §1 + §3 compounding.

---

## 6. Roadmap

| P | Item | Status |
|---|---|---|
| **Critical** | Asset distribution across scenes (§1) | **DONE** |
| **Critical** | Delivery policy for QA-failed films (§4) | **DONE** — deliver-and-flag (§7) |
| **High** | Background/B-roll tier in native packs so demoted assets are used (§2) | **DONE** (§8) |
| **High** | Script content floor: headline + supporting line per scene (§3) | **DONE** (§9) |
| **High** | 9:16 text fitting + container bounds per pack (§5) | scoped |
| Medium | Raise the asset budget for long vertical films (9 scenes / 6 assets) | scoped |
| Medium | `asset_coverage` reports `usagePercentage: 100` when `assetsUsed: 0` — 0 of 0 reads as perfect | scoped |

**On the delivery policy (§4) — this is your call, not mine.** The options are: refuse to
deliver a QA-failed film (honest, but a hard failure where a mediocre video exists today);
deliver it flagged in the UI with the QA issues shown; or auto-regenerate once on a
different pack. I have not implemented any of them because each is a product decision about
what a user should receive when the system knows the output is weak.

---

---

## 7. Delivery policy — deliver-and-flag (§4 resolved)

`services/delivery_quality.js` assembles one verdict from signals already recorded (QA
frames, preflight, layout, audio, motion, language) and the Premiere screen shows it.
**Derived on read**, so it cannot drift from those records and applies retroactively to
every stored film. Silent on a clean film; a panel that always appears becomes furniture.

The first scoring model was a pure penalty (start at 100, subtract per blocker) and
collapsed every reviewed film to ~0 — it could not separate a composition-90 film from a
composition-41 one. Rebuilt to build UP from what the film has, then charge for defects:

| film | pack | verdict | score | blockers |
|---|---|---|---|---|
| `755o2m8g21` | daybreak-bakehouse | weak | 7 | 5 |
| `48vb7svz9s` | motion-canvas | weak | 36 | 3 |
| `h3w1374vjp` | hype-wave | review | 52 | 2 |
| `l1d7hfhxlc` | aurora-spectrum | review | 77 | 2 |

## 8. Background tier (§2 resolved)

`services/scene_backdrop.js`, wired into `composeWithNativePack` — the shared path for 19
packs, including every pack in this audit except kinetic-universe.

Rather than rewrite 19 layouts, it exploits what they already share: scenes are
`<div class="clip …" id="sN">` and `.clip` is `position:absolute; width:100%; height:100%;
overflow:hidden`. A first-child backdrop therefore fills exactly the scene, is clipped by
it, **inherits its opacity animation** (so it fades with the scene and needs no timeline of
its own), and paints behind everything after it in DOM order.

Only scenes with **no** asset get one, only assets the composition **didn't place** are
used, never the same asset twice, and never a logo/SVG/video. It is a quiet blurred wash
(opacity 0.22), carrying `data-layout-allow-occlusion` — a backdrop for a scene that would
otherwise be empty, not a second hero.

## 9. Content floor (§3 resolved)

Two halves, because a prompt is a request and a floor is a guarantee.

**The ask** — `system_script.md` said `onScreenText: 0-3 entries`, explicitly licensing
zero. It now requires a **headline plus a supporting line** on every scene, with worked
✅/❌ examples (the support must ADD information, not restate), and one exception: a CTA
whose single line is the imperative.

**The floor** — `script.normalizeScript` derives a supporting line from the scene's own
VOICEOVER when one is still missing. Deterministic, never rewrites copy the model wrote,
and cannot fail a job the way a hard schema error would. It prefers the second sentence
(the first usually restates the headline) and, when a line *opens* with the headline,
strips that prefix and keeps the substance after it — `"Meet Claude, built by Anthropic for
the frontier"` → `"Built by Anthropic for the frontier"` rather than being discarded as an
echo.

Replaying `755o2m8g21`'s real script:

```
words/scene BEFORE: [5,2,2,4,4,3,4,4,2]
words/scene AFTER : [5,9,8,4,4,3,4,4,9]

s2: ["Steerable Systems", "Complex professional tasks demand reliable, steerable systems"]
s3: ["Meet Claude",       "Built by Anthropic for the frontier"]
```

---

*Suite after this pass: 12 suites, 288 assertions, 0 failures.*
