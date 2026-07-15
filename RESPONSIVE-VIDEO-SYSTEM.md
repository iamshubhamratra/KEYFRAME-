# Responsive Video System — Audit, Architecture & Roadmap

> Complete audit of the KEYFRAME video generation system's behavior across aspect ratios
> (landscape 16:9, square 1:1, portrait/vertical 9:16), the shared responsive architecture,
> a fully portrait-native **flagship** exemplar, and a precise roadmap for the rest.
> Grounded in code (file:line) via a 4-lens parallel audit (13 critical + 16 major findings).

---

## 0. TL;DR

- **Root causes found:** (1) type sized by **height** (`sc = dims.height/720`) → portrait headlines **2.7× oversized** and off-canvas; (2) **square (1:1) misclassified as landscape** everywhere (`land = W>=H` is true at equality) → square gets the wide side-by-side layout; (3) the **camera FOV** is fixed (42° vertical) so portrait's narrow horizontal FOV (~24°) makes every panel/screenshot **~2.8× too wide** → overflow; (4) feature panels **fan horizontally** even in portrait → off-canvas; (5) portrait is a **shrunk desktop layout**, not a native vertical stack; (6) the **native-GSAP composers** are all locked side-by-side rows (cqw tuned for a wide canvas); (7) **no safe-area** system and **no responsive QA** gate (overflow is explicitly ignored).
- **Fixed now:** a shared `responsive.js`, and **flagship_composer.js** made fully portrait/square-native (verified with a real 9:16 render).
- **Roadmap:** brightlife (identical fixes), the 5 native-GSAP composers (portrait layout modes), scene-kit (square + object-fit + safe areas), the Visual Layout Director (portrait plan), and a responsive-QA gate — each with exact file:line fixes below.

---

## 1. Audit — what breaks per aspect (grounded)

**Orientations:** `config.dimensionsFor` emits `horizontal`(16:9, W>H), `vertical`(9:16, W<H), `square`(1:1, W=H) → `job.width/height` → composer `dims`. The pipeline *does* pass portrait dims; the breakage is in layout.

### 3D composers (flagship + brightlife) — CRITICAL
| # | Breakage | Evidence |
|---|---|---|
| type | `sc = dims.height/720` → portrait 1080×1920 = **2.67×**; hero headline ~292px on a 1080-wide canvas → horizontal overflow. Narrower canvas gets *bigger* type (backwards). | `flagship_composer.js:152`, `brightlife:150` |
| square | `land = W>=H` true at W=H → square takes the wide side-by-side path + landscape font sizes | `flagship:141/249`, `brightlife:139/257` |
| camera | fixed `pz` dolly + fixed 42° vFOV → portrait hFOV ~24° → content ~2.8× too wide, camera never pulls back | `flagship:506-518` |
| panels | plate world width `w` (hero 6.4) not dims-aware → **224% of frame width** in portrait → screenshot overflow/crop | `flagship:586`, `brightlife:786` |
| features | fan horizontally (`spread*3.4`) even on portrait branch → outer cards off-canvas | `flagship:496`, `brightlife:647` |
| layout | portrait is the desktop composition re-centered, not a `headline→hero→features→cta` vertical stack | `flagship:159-166` |

### Native-GSAP composers — CRITICAL (all landscape-locked)
Every content scene is a `flex-direction:row` side-by-side pair sized in cqw (width-relative) for a wide canvas; none has a portrait/vertical branch. Worst offenders:
- **paper-tales**: the whole film is one landscape book (`.pg` `left:12cqw/50cqw width:38cqw height:41cqw`) — in portrait it's an 821×443 strip in the top 27%, empty below; text 16–29px, unreadable. (`paper_tales:480-482,536`)
- **bauhaus**: stats split-screen (`#panel width:44%`, chips scattered `margin-left` up to 9.6cqw `white-space:nowrap`) → chips overflow. figure/plate rows overflow. (`bauhaus:212,220,210`)
- **terminal**: gate-monitor `flex-direction:row` (46cqw + 38cqw + 5cqw = 89cqw), portrait branch keyed on *asset ratio* not canvas → overflow. Signs row cramped. (`terminal:326`)
- **blueprint**: every type (figure/plot/plate/flowchart) is a row (78–84cqw) → overflow or crushed copy. (`blueprint:155-156,384,228`)
- **bloom**: plate/plant rows (87.5cqw) → overflow. (`bloom:224,176`)
- All: cqw type is **too small** on a 1080-wide portrait (body 11–17px), nothing clamps a minimum.

### scene-kit (default, ~24 packs) — the most portrait-aware, still breaks
- square misclassified (`land = W>=H`). (`scene_kit:1185`)
- `archScreenshotHero` portrait is two absolute layers (screenshot vertically centered + copy bottom) — **not** a top-down stack, ~30% dead space up top. (`scene_kit:1214-1219`)
- screenshots `object-fit:cover` + fixed height → **crops** wide dashboards (violates "no important-UI crop"). (`scene_kit:1224,1273`)
- montage grid columns aspect-blind (`n<=4?2:3`) → cramped tiles in portrait. (`scene_kit:1353`)
- prop-fill floats a half-width side card behind full-width portrait copy → overlap. (`scene_kit:1125`)
- safe zones violated (phone `top:5%`, copy/caption `bottom:5%`). (`scene_kit:1266,1520`)

### Cross-cutting — CRITICAL/MAJOR
- **Visual Layout Director is aspect-blind** — `directLayout({dims})` destructures `dims` but never uses it; no portrait plan; its `__heroScale` is consumed **only in landscape** (`ctx.heroScale && land`). (`visual_layout_director:102,139`; `scene_kit:1204`)
- **No safe-area system** anywhere (chrome at `bottom:42px`, captions `bottom:5%` → under the Reels/TikTok overlay band).
- **No responsive QA** — `runInspect` gates only on `text_occluded`; `container_overflow` (content off-canvas) is **explicitly downgraded to a warning and ignored** (`validator.js:73-75`); `safeAreaCheck` exists but isn't exported/wired and only runs at 1920×1080.

---

## 2. Responsive architecture (implemented: `server/src/services/responsive.js`)

A shared helper every surface switches on — **do not scale layouts, adapt them**:

```js
aspectMode(W,H)   // "landscape" | "square" | "portrait"  (square is NOT landscape)
typeScale(W,H)    // Math.max(0.55, min(W,H)/720)  — SHORT-side, never height
safeArea(W,H)     // portrait {top:.10, bottom:.13, side:.05} ; landscape {.06,.08,.06}
heroBox(W,H)      // max hero visual bounds: portrait {wFrac:.90, hFrac:.50}
headlineCh(W,H,c) // headline max line-length per mode (caps ~3 lines)
```

### Per-format rules
| | Landscape 16:9 | Square 1:1 | Portrait 9:16 |
|---|---|---|---|
| Layout | text left / panel right | centered stack | **vertical stack**: headline → hero → features → cta |
| Type base (hero) | 150 × 1.0 | 100 × 1.0 | 100 × 1.5 (short-side) |
| Hero visual | ≤56% w | ≤78% w / ≤56% h | **≤90% w / ≤50% h** |
| Features | fan / grid | 2-col | **stacked vertically** |
| Safe area | 6/8/6% | 8/10/6% | **10/13/5%** |
| Camera (3D) | 42° FOV | 50° FOV, centered | **60° FOV, centered, pulled to fit** |

---

## 3. Flagship — the portrait-native exemplar (DONE, verified)

`flagship_composer.js` now imports `responsive.js` and is fully portrait/square-native:
- **Type**: `sc = typeScale(W,H)` (short-side) + `big` clamped to `W*0.13` (portrait) — no more 2.7× overflow.
- **Square fix**: `land = W>H` strict; `SQUARE`/`PORT` flags; square takes the vertical-stack path.
- **Camera**: aspect FOV (`FOV = land?42 : square?50 : 60`) so the narrow portrait frame fits the content; in portrait the rig is centered (`px,tx ×0.12`, roll ×0.4) and looks slightly down to frame the top headline + mid-band hero.
- **Panels**: world width scaled by `WSCALE` (portrait ×0.56 / square ×0.74) so screenshots stay ≤90% width; **hero centered** in the mid-band; **feature plates stacked vertically** (x=0, y-offset) instead of fanned; frag/side centered.
- **DOM**: portrait interior scenes are a top-anchored centered stack with `safeArea` padding; `headlineCh` caps wrapping.

**Verified 2026-07-15:** a real 720×1280 render (Pinterest storyboard + real website screenshots) — 0 lint errors; headlines correctly sized, hero screenshot centered and on-canvas, feature panels stacked vertically, chrome/chips within safe areas. Landscape is unchanged (short-side scale = 1.0 at 720p; all landscape branch values preserved).

---

## 4. Roadmap — remaining composers (exact fixes)

Each is scoped with the audit's file:line + fix. Priority order:

1. **brightlife** (identical to flagship) — apply the same 6 edits: `responsive` import, `typeScale`, `land = W>H` + `PORT`/`SQUARE`, FOV, `WSCALE` on plate width, feature vertical-stack, centered camera. (`brightlife:150,139/257,647,786,656-668`)
2. **Visual Layout Director** — have `directLayout` compute `aspectMode(dims)` and emit `layoutPlan.__portrait = { stack, hero: heroBox, safe: safeArea, typeScale }`; make `__heroScale` mode-aware; scene-kit honors it in **all** modes (not just landscape). (`visual_layout_director:102,139`; `scene_kit:1204`)
3. **scene-kit** — `land = W>H` + `square` flag; `archScreenshotHero` → single top-down flex column (mirror `archPhoneHero`); screenshots `object-fit:contain` within `heroBox` (letterbox, no crop) — cover only for background B-roll; montage `cols = n<=2?1:2` in portrait; prop-fill → below copy or skipped; edge anchors → `safeArea`.
4. **Native-GSAP composers** (blueprint/bloom/bauhaus/terminal/paper-tales) — each needs a portrait/vertical **layout mode** gated on canvas `W<H` (not asset ratio): rows → columns (visual on top ~70–80cqw, copy below full-width); paper-tales → single tall page + vertical page-flip; type via a portrait cqw multiplier (~1.6×) with a min clamp (headline ≥36px, body ≥16px). These are per-composer redesigns (like the desktop builds), the largest remaining chunk.
5. **Responsive QA gate** — export + wire `safeAreaCheck` into `pipeline.js`, run `inspect` at the **actual** job dims, and treat `container_overflow` as an **error** when the overflowing element is a headline/screenshot/CTA (keep decorative particle overflow as a warning). Assert hero within `heroBox` and text within `safeArea`. Emit a responsive score `{landscape, square, portrait, safeArea, readability, overall}` per render.

---

*Generated 2026-07-15 on branch `Rohit`. Implemented: `services/responsive.js` (new) + `flagship_composer.js` (portrait-native). The rest is scoped above with exact fixes.*
