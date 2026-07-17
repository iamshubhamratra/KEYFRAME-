All 38 grafts verified against source. Writing the plan.

---

# Dynamic Brand Color Personalization — Final Implementation Plan

**Author:** Lead architect · **Branch:** `Rohit` · **Date:** 2026-07-16
**Verdict:** This is not a greenfield feature. It is a dropped parameter, a missing input field, and a per-pack policy question. Net new agents: **zero**.

---

## 0. What already exists — read this before anything else

You asked us to build a "Brand Color Director Agent." **It exists, it is ON by default, and it has been running on every website-ingest job in production.** It is called the **Art Director**. Its module header at `server/src/services/art_director.js:1-12` states your feature request nearly verbatim:

> *"A website ingest already extracts the site's real brand colors (brief.brandColors), but nothing consumed them: every video rendered the frame pack's stock palette, so an Amazon video was never Amazon-colored. The Art Director turns those extracted hexes into a BRAND SKIN…"*

I verified every line below by reading the file, not the docs. **The docs lie** — `KEYFRAME_PROJECT_DOSSIER.md:170` still says brandColors are "currently ignored"; both it and `art_director.js:3` predate the agent they describe.

| You asked for | It already exists | State |
|---|---|---|
| "Brand Color Director Agent" | `art_director.js:161-188` `directBrand()` → `{accents[1..3], emphasis[2], reason, source}` | **Shipped, default-ON** (`config.js:256-263`, `ART_DIRECTOR=0` disables) |
| "positioned after template selection, before Visual Layout Director" | `graph.js:927` `frame_selector → art_director`; joins at `:937` `["visual_layout_director","art_director"] → composition` | **Already exactly where you asked.** Runs in parallel — ~zero added latency |
| "Extract from website URL → {primary, secondary, accent}" | `ingest/website.js:53-88` `dominantColors()` — ffmpeg 48×48 → rgb24 → 5-bit quantize → saturation-weighted rank → top-4 hexes; called `:204` | **Shipped.** Skips near-white/black/gray as "page chrome" (`:74`) |
| "Three.js color system (particles, glow, lighting)" | `three_composer.js:154` `C = theme.accents.map(hexInt)` drives lights (`:177-178`), particles (`:261`), every emissive (`:266`), CRT glow (`:290`). `flagship_composer.js:225` drives shader/waves/orbs/grid | **Shipped and already accent-driven** — one missing argument from being brand-driven |
| "auto-validate text contrast … readability" | `contrast_check.js:303` — real Chromium, seeks the paused GSAP timeline, two-screenshot glyph differencing, samples pixels *under the strokes*, gradient-text aware, AA large-text rule (`:285`) | **Shipped, excellent, and default-OFF** (`pipeline.js:257-262`) |
| "auto-fix bad combos" | `flagship_composer.js:53-55` `ensureReadableOnLight`/`ensureBright`; `three_composer.js:51-61` `neonize()` (26-iteration hue-preserving lift) | **Shipped, template-local** |
| Brand color UI | `ProductionTheater.jsx:141` → `BrandDirectorPanel` (`:268-300`) renders accents + hex labels + emphasis + source + reason, live during the `art_direction` stage | **Shipped** |
| Per-pack palettes for a picker | `routes/frames.js:36-42` returns `colors`, `accents`, `ground` per pack — **already fetched at `CreateScreen.jsx:43` and discarded** | **Shipped, unused** |

### So why does every video look generic? Three verified reasons.

**(1) The skin is computed, billed for, logged, persisted, shown in the UI — then thrown away for 8 of 9 renderers.**

`pipeline.js:477` accepts `brandSkin`. I read the dispatch block verbatim: **all seven dedicated returns omit it.**

```js
// pipeline.js:482 — verified
if (rendererFor(framePack) === "three-flagship") {
  return composeWithFlagship({ storyboard, dims, jobDir, assets, framePack, captionCues, jobId, durationSec, label, abortSignal, tracker });
}                                                                                    // ^^^ brandSkin ABSENT
…
if (!remix) {
  return composeWithSceneKit({ …, dress, subject, brandSkin, layoutPlan });          // :524 — the ONLY one
}
```

An **eighth** leak a pipeline-only fix would miss: `graph.js:698` dispatches `composeWithThree` and returns at `:700`, *before* `attemptLlmComposition` at `:711`. I checked — **`s.brandSkin` IS in scope there**; it's used 15 lines later at `:713`. The fix is genuinely `brandSkin: s.brandSkin || null` in the call object.

**If you tested on flagship or brightlife — your two marquee templates — you saw a stock-palette video every single time while the server logged `[art_director] brand skin = #ff9900 (llm)` and the UI showed you those swatches.** That is not a missing feature. **The product is lying to the user**, and that is the reason to prioritize this over everything else in the spec.

**(2) There is no user input.** `graph.js:507` reads `s.brief?.brandColors` — which is an **LLM output field** (`brief.js:30`, validated for hex *shape* only, temperature 0.6). `system_brief.md:46` instructs the model: *"prefer `website.brandColors` when present; **otherwise pick 2-3 hex colors matching the tone**."* On a prompt-only job the Art Director "brands" your video with **colors a language model invented**, while its own prompt (`art_director.js:141`) tells that model they are *"the product's real palette — do not invent colors."* The no-invention guarantee is real exactly one layer above where it matters.

**(3) The scene-kit — which does work — is 24 of 31 packs, including the default `blockframe`.** So brand color has been shipping correctly for most jobs and invisibly for the ones you'd demo.

### One correction to the framing you were given

**Method 4 (logo) needs no native image dependency.** `dominantColors()` (`ingest/website.js:53-88`) is a complete ffmpeg-only quantizer that takes an **arbitrary file path** — it is not website-specific, it is merely module-private (exports at `:214` are only `{understandWebsite, findChrome}`). The repo has zero `sharp`/`jimp`/`canvas` and **two explicit in-code decisions forbidding them** (`asset_sources/util.js:95-99`: *"instead of pulling in a native module (sharp)"*; `website.js:6-7`). Method 4's cost is **upload plumbing, not pixels**. Do not reach for `sharp`.

---

## 1. The design principle

Adopt this verbatim. It is the answer to "will Bright Life still feel like Bright Life?", and every mechanism below is a consequence of it:

> ### IDENTITY = LUMINANCE + MOTION + TYPOGRAPHY + LAYOUT + SEMANTICS.
> ### BRAND = HUE.

This is derivable from the code, not asserted. Ground comes from the manifest (`scene_kit.js:114-115`); ink is force-overwritten **after** the brand merge (`:160`); motion/`textfx`/typography live in `pack.json` where no brand color can reach them. Everything a pack actually owns is orthogonal to hue.

And the corollary that replaces the one line in your spec I am refusing:

> **Your spec:** *"No hardcoded colors should exist inside templates."*
> **Replace with:** *"No **UNDECLARED** colors."* Every literal must be either reachable from the resolver, or declared locked in `pack.json` **with a reason**.

Your line, executed literally, **destroys the product and contradicts your own integrity rule.** `bauhaus_composer.js:38` is red/blue/yellow on cream — the pack's own manifest vibe says *"bold primary-color geometry."* Primary red/blue/yellow **is** the Bauhaus movement. `blueprint-atelier`'s ground is `#0C2440`; its vibe reads *"Deep engineering blue with amber, cyan and red ink."* Recolor the navy and it is not a blueprint, it is a colored rectangle. **The literals are not tech debt. They are the template.** "No undeclared colors" is enforceable, greppable, and is what your integrity rule actually wants.

---

## 2. The palette contract

Three objects, three lifetimes. The separation is the central design decision.

### 2a. `brandPalette` — the INPUT (client → API → DB → graph state)

Method-agnostic; all four input methods produce exactly this.

```jsonc
{
  "v": 1,
  "primary":   "#ff9900",        // required if brandPalette is present at all
  "secondary": "#146eb4",        // optional → derived (§4c) if absent
  "accent":    "#232f3e",        // optional → derived if absent
  "source":    "manual",         // "manual" | "preset" | "website" | "logo"
  "presetId":  "sunset",         // only when source === "preset"
  "raw":       ["#ff9900", "#146eb4", "#232f3e"]   // ≤6 — everything extraction saw, unfiltered
}
```

Validated with the **existing** contract: `/^#[0-9a-fA-F]{6}$/` (`art_director.js:36`, `brief.js:16`), `.max(6)` on `raw` (`brief.js:30`).

### 2b. `brandSkin` v2 — the AGENT OUTPUT (the `brandSkin` state channel, unchanged name)

**A strict backward-compatible superset.** Every existing consumer — `scene_kit.js:153`, `db.setBrandReview` (`db.js:220`), `ProductionTheater.jsx:271` — keeps working with **zero changes**.

```jsonc
{
  // ── v1, byte-compatible. Existing readers touch only these. ──────────────
  "accents":  ["#ff9900", "#146eb4"],   // 1..3, lowercase #rrggbb, lead-first
  "emphasis": ["#ff9900", "#ffb84d"],   // 2-stop gradient pair
  "reason":   "Amazon orange leads; deep blue as the secondary rule.",
  "source":   "manual",                  // widened: + "manual"|"preset"|"logo" alongside "llm"|"default"

  // ── v2 additions, ALL optional. Absent ⇒ exactly v1 behavior. ────────────
  "provenance": "explicit",              // "explicit" | "extracted" | "inferred"   ← load-bearing
  "brand": { "primary": "#ff9900", "secondary": "#146eb4", "accent": "#232f3e" },
  "locked": true                         // user picked; do not second-guess
}
```

**`provenance` is the fix for the deepest bug in the system.** `"explicit"` = a human chose it (honor verbatim, never LLM-veto, relax the usability gate). `"extracted"` = real pixels from a site or logo. `"inferred"` = the brief LLM invented it (`system_brief.md:46`). Today these are **indistinguishable**, which is why a prompt-only job gets "branded" in hallucinated color.

### 2c. What is deliberately **NOT** on the wire: `gradients{}`, `uiColors{}`, `threeJsColors{}`, `chartColors{}`

This is the load-bearing architectural argument, and it is why I am rejecting the renderer contract *as specified* while still delivering everything in it.

**Those four are functions of the ground, and the agent does not know the ground.** There are 31 grounds — `#0A0B16` (flagship), `#FFFFFF` (brightlife), `#0C2440` (blueprint), `#06070A` (longshot-cinema) — and composers override even the manifest (`flagship_composer.js:73` hardcodes `#0A0B16` a *third* time). `art_director` fans out from `frame_selector` **in parallel** (`graph.js:927`) and joins only at `composition` (`:937`). A `threeJsColors.glow` computed by an agent that never saw the ground would be wrong for every composer it didn't guess. Worse, it would be a **fifth writer** in an accent slot already contested four ways inside `deriveTheme` (storyboard palette `:122` → pack tokens `:117` → manifest skin `:146` → brandSkin `:153` → `safeBright` backfill `:132`).

There is a second reason, and it is an integrity argument: **9 composers × 5 namespaces = 45 mappings**, each requiring a per-composer opinion about what "uiColors" means for a split-flap departures board. **The composer must stay the authority on what its colors MEAN.**

> **So: the wire carries brand INTENT. A pure resolver derives the concrete color system against the actual ground, at composer time.** You get every namespace you asked for — `gradients`, `ui`, `three`, `chart` — just resolved one layer lower, where they can be correct. That is §4.

---

## 3. The agent — `art_director`, promoted in place

**Name:** Art Director (keep it). **File:** `server/src/services/art_director.js`.
**Config key:** `artDirector` (`config.js:256-263`). *This is why greps for "brand color" found nothing — the domain term is "brand skin." Consider a doc alias; do not rename the key.*

### 3a. Position in `graph.js` — **UNCHANGED**

```
addNode:   graph.js:905   .addNode("art_director", artDirectorAgent)          — no change
addEdge:   graph.js:927   g.addEdge("frame_selector", "art_director")          — no change
addEdge:   graph.js:937   g.addEdge(["visual_layout_director","art_director"], "composition")  — no change
channel:   graph.js:893   brandSkin: Annotation()                              — no change
progress:  graph.js:509   db.setProgress(jobId, "art_direction")               — no change (UI stage exists)
```

**There are no `addNode`/`addEdge` changes.** The topology you asked for is already built, and it is correct: the node needs only `brief` + `framePack`, so the parallel fan-out costs ~zero latency (`graph.js:502-503`). I will not spend that parallelism.

### 3b. Inputs — source precedence + provenance (the correctness fix)

One change, at `graph.js:507`:

```js
// BEFORE (graph.js:507-508)
const brandColors = s.brief?.brandColors || [];
if (!config.artDirector?.enabled || !brandColors.length) return { brandSkin: null };

// AFTER — explicit precedence: user > extracted > inferred
const bp        = s.job?.brand_palette || null;                 // snake_case: graph.js:966 db.getRaw → :981 graph.invoke({job})
const explicit  = bp ? [bp.primary, bp.secondary, bp.accent].filter(Boolean) : [];
const extracted = s.job?.intent?.website?.brandColors || [];     // RAW, pre-LLM — already persisted at db.js:134
const inferred  = s.brief?.brandColors || [];                    // may be hallucinated

const { colors, provenance } =
    explicit.length  ? { colors: explicit,  provenance: "explicit" }
  : extracted.length ? { colors: extracted, provenance: "extracted" }
  :                    { colors: inferred,  provenance: "inferred" };
```

`job.intent` is **already persisted** (`db.js:134`) and `project_pipeline.js:92` **already writes** the raw extracted array there. This fix needs no new plumbing — just reading the honest source instead of the laundered one.

### 3c. Deterministic vs LLM — split on provenance

The codebase's stated grain is deterministic + fail-open (`visual_layout_director.js:14-15`: *"DETERMINISTIC … no second vision pass"*). Follow it.

| provenance | Path | Why |
|---|---|---|
| **`explicit`** (manual/preset) | **`defaultBrandSkin()` — no LLM, no network, no `{skip}` path.** Already exported at `art_director.js:190` | The user already made the decision. `directBrand`'s LLM asks *"which should lead?"* — a question a manual primary+secondary pick **has already answered**. Running it adds latency, cost, and the `sanitizeSkin` skip-veto (`:119`) which can silently discard the user's own choice. Pure downside. Also saves a call on the most common path. |
| **`extracted`** (website/logo) | **Keep the LLM** (`buildSkin`, `:148-156`) + the allow-set sanitizer (`:118-124`) as-is | This is where the LLM **earns its cost**: 4-6 unlabeled buckets quantized off a hero screenshot, and someone must judge which is the brand and which is a stock photo. `vividness` (`:79-85`) *actively prefers* a saturated photo region over a muted real brand color — a ranker cannot fix that. Genuine judgment. |
| **`inferred`** | **`defaultBrandSkin()` + `provenance:"inferred"`**, surfaced honestly in the UI | Never pay an LLM to art-direct hallucinated colors. **Open decision D3:** should `inferred` produce a skin at all? |

### 3d. Fail-open behavior — preserved, plus three verified defect fixes

`art_director.js:14-17` is the law: *"can never block a render or leave a video worse than the pack default."* Every path below returns a usable skin or `null`.

| Defect | Verified at | Fix |
|---|---|---|
| **Skip-override backdoor** — `if (!skin && vividness(candidates[0]) >= 0.45) skin = defaultBrandSkin(colors)` **overrides the model's explicit `{"skip":true}"`** | `art_director.js:180` (read verbatim) | Gate to `provenance === "extracted"` only. `explicit` never reaches the LLM; `inferred` should honor skip. |
| **Catch branch never persists** — returns `defaultBrandSkin(colors)` **without** `db.setBrandReview`, unlike `:171` and `:181`. On an LLM error the video **is** skinned but `brand_review` stays null → `BrandDirectorPanel` renders **nothing** | `art_director.js:184-187` (read verbatim) | Superseded by §3e — persistence moves out of the agent entirely. |
| **`relLum` is dead** — defined at `:64`, documented as *"used to reject accents that would vanish against a dark OR light ground"*, **zero call sites** | `art_director.js:62-67` | Delete it here. The WCAG math moves to `brand_kit.js` (§4), where a ground actually exists. |
| **Unreachable disabled branch** — `if (!ard().enabled)` at `:169-173` can never fire; `graph.js:508` gates on the same flag first | `art_director.js:169-173` | Delete, or move the gate. |
| **`usableAccent` eats explicit picks** — HSL gate `s>=0.18 && 0.16<=l<=0.88` (`:77`). *HSL lightness is not luminance:* `#0000FF` has `l=0.5` but relLum ≈ 0.07 | `art_director.js:73-78` | **Bypass the gate when `provenance === "explicit"`.** A human's pick is not a guess; a hand-picked muted sage must not silently become the pack's stock teal. |
| **Candidate-set mismatch** — `distillAccents(colors, 5)` for the LLM (`:163`) but `max=3` for the fallback (`:104`), so the deterministic path can never pick candidates 4-5 | `art_director.js:104` vs `:163` | Unify. |

### 3e. Persist the **resolved** skin, from the **composition** node — not the agent

Today `db.setBrandReview` fires at `art_director.js:171/181`, **before composition**. For the 8 dropped renderers, the panel shows colors the MP4 does not contain. Moving persistence to the composition node — after `resolveBrand` has run against the real ground — means **`BrandDirectorPanel` shows exactly what shipped**, including `adjusted[]` and the resolved tier. It also retires the catch-branch bug structurally rather than patching it.

**Interim mitigation, ships in Phase 1 before the composers land:** gate `db.setBrandReview` on `rendererFor(framePack)` being brand-aware. **Show nothing rather than something false.**

---

## 4. The resolver — `server/src/services/brand_kit.js` (the one new file)

This is the `responsive.js` of color: pure functions, no LLM, no I/O, no DOM, fail-open. **~180 lines.** It is where your `gradients{}` / `uiColors{}` / `threeJsColors{}` / `chartColors{}` actually get built — **derived against a real ground, not guessed by an agent.**

### 4a. The non-modification guarantee — read this before approving Phase 0

> **`resolveBrand` WRAPS `deriveTheme`. It does not modify it.**

`deriveTheme` (`scene_kit.js:92`) is the injection point for **24 of 31 packs** — the largest blast radius in the repo. The resolver reuses its proven manifest read, ground authority, and accent filter, and layers on top. Because `deriveTheme`'s own output is byte-identical, **those 24 packs are structurally incapable of regressing.** This is the strongest single sentence for approving Phase 0, and it is a design constraint, not an aspiration.

### 4b. The API

```js
// ---- WCAG: ONE implementation. Today there are SIX, and THREE are not WCAG. ----
function relLum(hex)                        // gamma-correct sRGB linearization, 0..1
function ratio(fg, bg)                      // (L1+.05)/(L2+.05)
function passesAA(fg, bg, large = false)    // >= (large ? 3 : 4.5)

// ---- Generalizes flagship's ensureBright(:55) / ensureReadableOnLight(:53)
//      and three's neonize(:51-61) into ONE ratio-targeted, HUE-PRESERVING fix ----
function nudgeToRatio(fg, bg, target, hueDriftMax)   // → { hex, adjusted, from, to, ratio }

// ---- THE ONE ENTRY POINT every composer calls ----
function resolveBrand(brandSkin, {
  ground,                  // the composer's OWN ground — authoritative, never touched
  isDark,
  packAccents,             // the pack's accents: the fallback and the floor
  contract,                // manifest.brand — tier / slots / maxAccents / contrastFloor / hueDriftMax
}) → PackSkin

function cssVarBlock(packSkin)   // → "--kf-accent:#ff9900;--kf-glow:rgba(...);…"
```

### 4c. The resolved object — `PackSkin`

```jsonc
{
  "tier": "accents",                          // resolved from manifest.brand.mode
  "applied": true,

  "accents": ["#ff9900", "#146eb4"],          // brand-led, nudged, pack-backfilled
  "accent": "#ff9900", "accent2": "#146eb4", "accent3": "#B16CFF",

  "emphasis": ["#ff9900", "#ffb84d"],         // ← finally consumes brandSkin.emphasis (dead since day one)
  "emphasisCss": "linear-gradient(100deg,#ffb84d,#ff9900)",

  "gradients": { "primary": "…", "secondary": "…", "accent": "…", "background": "…" },
  "ui":    { "border", "chip", "indicator", "progress", "buttonBg", "onAccent", "hover", "active", "glow", "shadow", "tintWeak", "tintStrong" },
  "three": { "A", "B", "C", "glow", "particle", "lightKey", "lightFill" },   // 0x ints, ground-corrected
  "chart": ["#ff9900", "#146eb4", "#B16CFF"],  // ≥3, pairwise-distinct, each ≥3:1 on ground

  "slots": { "amber": "#ff9900" },             // ONLY writable roles present. Locked roles ABSENT.
  "atmosphere": null,                          // tier:"atmosphere" only → { hue: 36, mix: 0.18 }

  "adjusted": [                                // ← surfaced to the user. Never silent.
    { "from": "#232f3e", "to": "#3d6a94", "reason": "1.4:1 vs ground #0A0B16, need 3:1" }
  ],
  "dropped": [ { "hex": "#0a0b18", "reason": "unfixable within hueDriftMax 40°" } ]
}
```

### 4d. Six properties that make this the whole design

1. **No `ground`, no `ink`, no `font`, no `motion` key in the return.** Template integrity is enforced by **the shape of the return value**. A composer cannot brand-tint its ground through this API because there is nothing to read. Mechanism, not a promise.

2. **Locking by absence** (per-role, stronger than the return-shape argument alone). A composer writes:
   ```js
   theme.amber = skin.slots.amber ?? "#FFB84D";   // brandable
   theme.cyan  = skin.slots.cyan  ?? "#8FD8FF";   // LOCKED → slots.cyan is undefined → literal stands
   ```
   **A composer cannot violate the contract by forgetting to check, because there is nothing to read.**

3. **One WCAG implementation.** Today, verified: `contrast_check.js:199`, `composer.js:41`, `flagship_composer.js:47`, `art_director.js:64` (dead) are gamma-correct. `scene_kit.js:83-88` and `three_composer.js:47` apply **WCAG coefficients to raw 0-255 with no gamma step**. `enrich.js:34-38` is **NTSC Rec.601** — a different coefficient set entirely — and its `L<64/L>224` thresholds decide whether a ground gets *replaced by a gradient*, i.e. it changes what text is measured against. **Six definitions of "dark" driving live color decisions.** Collapse them.

4. **One contrast floor — and a comment that currently lies.** I read it:
   > `scene_kit.js:150-152`: *"Brand accents pass the **SAME** near-ground contrast filter as the pack accents"*

   **False.** Pack accents filter at `>55` (`:133`); brand accents at `>45` (`:155`). **Brand colors are held to a *looser* legibility bar than the pack's own, inside the same function, under a comment claiming otherwise.** When `brand_kit` collapses these into one `ratio()` call, **delete or correct that comment** or it will re-mislead the next reader.

5. **It nudges; it does not drop.** `nudgeToRatio` walks L in HSL, hue preserved, until the ratio clears. A muted brand navy on a dark ground gets *lifted*, not discarded. Only a color unsalvageable within the pack's `hueDriftMax` reaches `dropped[]`.

6. **Fail-open adoption path.** `resolveBrand(null, {...})` returns **the pack's own resolution**. Every composer can adopt the API *before* any brandSkin is threaded — a behavior-preserving refactor. **Land API adoption and brand threading as two separate commits.** That is how you land a 9-composer change safely.

### 4e. Harmony — derivation, not invention

Your spec asks for "AI COLOR HARMONY … complementary, analogous, accent, hover, glow, shadow." **Keep the harmony. Cut the AI. Then cut the complements.**

**The AI half** is closed-form HSL arithmetic: `hover = lighten(primary, .08)`, `glow = rgba(primary, .45)`, `shadow = rgba(primary, .18)`, `onAccent = ratio("#fff", accent) >= 4.5 ? "#FFFFFF" : "#14130E"`. An LLM emitting these is slower, costs a call, is **non-reproducible**, and can be wrong. Ship arithmetic; keep the word "AI" for marketing.

**The complement half is worse than useless — it is off-brand.**

> **The complement of Google blue is orange — a color Google does not own. Generating it ADDS off-brand color while claiming to be on-brand.**

This is exactly what `sanitizeSkin`'s allow-set (`art_director.js:118-124`) was built to prevent. So:

| Derivation | Verdict |
|---|---|
| `tints`/`shades` (L ±12/24/36), `hover`/`active` (L ±8), `glow`/`shadow`/`tintWeak`/`tintStrong` (alpha), `onAccent` (WCAG-picked) | **KEEP** — derivations of the user's **own** hues |
| `complement`, `triadA/B`, `analogA/B` **emitted alongside a supplied color as usable accents** | **CUT** |
| **Filling a slot the user left genuinely EMPTY:** `secondary` absent → `hueRotate(primary, +32°)` clamped into primary's S/L band | **KEEP — analogous, not complementary.** Complements read as an error state. |

---

## 5. Plumbing — how the palette reaches every composer

Four hops. No new channels. No graph topology change.

**Hop 1 — the dispatch (the bug).** Add `brandSkin` to seven calls at `pipeline.js:483, 489, 495, 500, 505, 510, 515` and to seven `composeWithX` signatures (`:618, :637, :655, :672, :689, :706, :722`).

**Hop 2 — the eighth leak.** `graph.js:698` `composeWithThree({...})` → add `brandSkin: s.brandSkin || null` (verified in scope; used at `:713`). Plus `composeWithThree`'s signature (`pipeline.js:600`).

**Hop 3 — the third leak, and it is a decision, not a bug.** `pipeline.runJob` is a **live entry point** — `server.js:41-42` `queue.add(() => pipeline.runJob(task))` ← `routes/generate.js:144` (`POST /api/generate`) — that **never calls `directBrand` at all**. Its composition calls (`pipeline.js:1060, 1084, 1115`) pass no `brandSkin`, defaulting to `null` at `:477` with **no warning**. So a slice of live traffic is unbranded **even on the scene-kit**. → **Open decision D1.** Do not let this be discovered post-launch.

**Hop 4 — inside each composer, exactly one shape:**

```js
// buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin })
const brand = resolveBrand(brandSkin, {
  ground: theme.ground, isDark: theme.isDark,
  packAccents: theme.accents,
  contract: manifest?.brand,
});
// read brand.accent / brand.emphasis / brand.three / brand.ui / brand.slots.<role>
// there is no brand.ground to read
```

Then emit `:root{${cssVarBlock(brand)}}` once. **The CSS-var question is a red herring** — every var block is written `--red:${theme.red}` (`blueprint:472`, `terminal:418`), so vars are **downstream** of the theme object. Retheming the factory retints both paths at once. `cssVars` is a **projection** of the resolver object, not a second source of truth. Verified var() usage: blueprint **24**, terminal **36**, paper-tales **9** — genuinely var-driven. bloom **0**, bauhaus **0** — **dead blocks; delete them during those packs' retrofit rather than wiring them.** A maintainer "fixing" colors via those vars today sees no effect.

### Hop 5 — the allow-lists that will strip what the composer correctly applied

**These must ship in lockstep or you get half-branded frames** — kit goes brand, decor snaps back to pack:

| Module | The hostility | Fix |
|---|---|---|
| `set_dressing.js:81-83, :92`; `colorOk:33-40` | Whitelist built from pack tokens; **silently drops** any non-palette hex. Premium jobs (`dress:true`, `pipeline.js:551`) get a half-branded frame | Append `brand.accents` to `paletteHexes` |
| `composer.js:80-88` `paletteLaw` | Emits *"any other hex/hsl/named color is a **DEFECT**"* — on the remix path a brand hex is **literally lint** | Append `brand.accents` to the permitted list |
| `enrich.js:279` | Vector/motion floor derives from pack tokens, and runs **on scene-kit output** (`pipeline.js:563-567`) — pack-colored particles over brand text | Pass `brand.accents` |

### Explicitly OUT of scope, with reason

- **`fallback.js`** — a wholly different theme contract (`:78-107` returns `{bg1,bg2,bg3,ink,sub,acc1,acc2,particle,aurora1..3}`). Not a duplicate of `themeFromTokens`; do not treat it as one.
- **The icon-tint path** (`pack_style.js:46` → `graph.js:319-320` → `graph.js:402` → `iconify.fetchIcon({color})`). It bakes the pack color into the **asset file** at fetch time, and `asset_search` sits on the `asset_planner` branch — **`s.brandSkin` genuinely does not exist there**. Fixing it requires a graph **edge** change that serializes a fan-out the comments (`graph.js:924-926`) deliberately built for *"near-zero added latency."* Note it; skip it. *(This is the one place a scope-change is truly needed — do not confuse it with `graph.js:698`, where brandSkin IS in scope.)*

---

## 6. The per-pack rebrand contract — all 31 packs

### 6a. The manifest block (additive, zero migration)

`PackManifestSchema` ends `.passthrough()` with a default on every field (`frame_manifest.js:124`), so this **validates against all 31 existing `pack.json` files today, unmodified**:

```js
// frame_manifest.js:118 — slots in next to textfx
brand: z.object({
  mode:          z.enum(["off", "accent", "accents", "atmosphere"]).default("accents"),
  slots:         z.array(z.string()).default([]),    // color-role names a brand hue MAY occupy
  maxAccents:    z.number().default(3),
  contrastFloor: z.number().default(3.0),            // WCAG ratio vs surface.ground — PER PACK
  hueDriftMax:   z.number().default(40),             // degrees a brand hue may travel — PER PACK
  note:          z.string().default(""),             // WHY. For the next engineer.
}).default({}),
```

`contrastFloor` and `hueDriftMax` are **per-pack on purpose**: a brand hue must travel further on blueprint's `#0C2440` navy than on brightlife's `#FFFFFF`, and **the pack author is the one who knows how far is too far before it stops reading as their template.**

### 6b. The four tiers

| Tier | Contract | Honest capability |
|---|---|---|
| **`off`** | No brand color. Pack opts out entirely. | The escape hatch. |
| **`accent`** | **ONE** brand accent → **ONE** declared slot. Ground/ink/semantics untouched. | **These packs can never be "brand-driven." Say so in the UI.** One accent is the honest ceiling. |
| **`accents`** | Up to 3 brand accents lead the accent list; emphasis gradient rebuilt from the brand pair. | Today's shipped Art Director contract. |
| **`atmosphere`** | `accents` **+ ground-family hue rotation within the authored luminance envelope** + glow/particle/lighting hue. | **flagship + brightlife only. Requires sign-off — see D2.** |

### 6c. The atmosphere tier — the only mechanism that delivers your headline

Your spec has two requirements in direct tension: *"same template + different brand colors = different visual identity"* and *"Bright Life should still feel like Bright Life."* An accent-only ceiling concedes the first. Ground-replacement destroys the second.

**Atmosphere squares them.** The ground is **not replaced**; its **hue rotates toward the brand while its luminance is pinned to the authored value ±`lumTolerance` (~0.03)**:

- flagship `#0A0B16` (L≈0.04) → a brand-indigo-tinted near-black **at L≈0.04**
- brightlife `#FFFFFF` stays **L≈1.0**; `#F5F6FF` → `#F5F2FF`

A Stripe flagship and a Spotify flagship become unmistakably different **atmospheres** — same camera rig, same motion, same type, same layout. **This is a direct consequence of the §1 principle, not an exception to it:** identity is luminance + motion + type + layout + semantics; we moved only hue.

> **⚠️ This is a REVERSAL of a user-confirmed decision, not a gap being fixed.** `art_director.js:9-12` documents ACCENT-ONLY as *"the user's pick"*, and project memory records an AskUserQuestion confirmation dated **2026-07-14**. **Gate behind explicit sign-off (D2). Ship `off`/`accent`/`accents` first; atmosphere lands as a separate, argued proposal with the luminance-envelope evidence attached.**

### 6d. The 7 dedicated renderers

| Pack | Renderer | Ground | mode | slots | Locked — and why (goes in the manifest `note`) |
|---|---|---|---|---|---|
| **flagship** | `three-flagship` | `#0A0B16` | `atmosphere`¹ | `indigo, cyan, violet, mint` | `ground, ground-2, surface, text, muted` + **`uiPalette` (`flagship_composer.js:234-236`)**. Documented fixed-light *by design*: *"the PRODUCT PANELS stay BRIGHT so screenshots read at full contrast against the dark."* **Brand-tinting the synthetic UI makes it fight the real screenshots on the same plates.** |
| **brightlife** | `three-brightlife` | `#FFFFFF` | `atmosphere`¹ | `indigo, violet, blue, cyan, pink, green, amber, purple` | `ground, ground-2, text, muted`. Identity = **the white stage + airy motion + glass cards** — a luminance and motion property, not a hue property. |
| **blueprint-atelier** | `blueprint` | `#0C2440` | **`accent`** | **`amber` only** (14 sites; the emphasis word via `hl(scene, amber)` at `:49`) | `ground, ground-2, text, muted, cyan, red`. **`cyan` carries dimension/construction-line SEMANTICS (22 sites); `red` carries revision-mark semantics. Semantics are never brandable slots.** Navy ground is the drafting sheet. |
| **terminal-departures** | `terminal-departures` | `#0C0D11` | **`accent`**, `maxAccents:1` | **`yellow` only** (split-flap gold, the signature) | `ground, ground-2, text, muted, cyan` + **`green` = ON-TIME, `red` = DELAYED — STATUS SEMANTICS, not decoration.** Board darks are Solari physical convention. Hero line 2 is gold *by construction* (`:59-60`). |
| **bloom-fable** | `bloom-fable` | `#F8EFDE` | `accents` | `coral, sun, sage, sky` | `ground, ground-2, text, muted`. **The honest YES.** Identity = draw-on vines + elastic blooms + meadow substrate — motion, not hue. **11 stray literals — the cheapest real win of the native five.** |
| **paper-tales** | `paper-tales` | `#FFF9F0` | `accents` | `rose, sky, mint, lilac, butter` | `ground, ground-2, text, muted`. Identity = 3D page turns + pop-up fold-ups. **93 literals — the heaviest.** |
| **bauhaus-riot** | `bauhaus-riot` | `#F4EEE1` | **`off`** | — | **`red, blue, yellow` — the palette IS the movement.** Manifest vibe: *"bold primary-color geometry."* Recolored, it is not Bauhaus. **~1 line. Ship the opt-out, not the recolor. Choosing not to do this is the design.** |

¹ pending D2 sign-off; ships as `accents` until then.

### 6e. The 24 scene-kit packs

All route through `deriveTheme`, which is **already accent-only and structurally cannot touch ground/ink** (`:114-115` ground from manifest; `:160` ink forced *after* the brand merge). Default `mode: "accents"`, `maxAccents: 3`.

**Group A — plain `accents` (13):** `aurora-spectrum`, `blockframe` *(the default — `config.json` `defaultPack`)*, `bloom-illustrated`, `care-lavender`, `care-mint`, `fable-storybook`, `flux-analytics`, `kinetic-bold`, `ledger-noir`, `midnight-glass`, `mono-corporate`, `nimbus-saas`, `summit-keynote`

**Group B — `accents` + the emphasis fix (5).** These are the **only** packs shipping a non-null `skin.emphasisCss` (I checked all 31): `longshot-cinema`, `mint-launch`, `nimbus-saas`, `prism-launch`, `vault-gold`.
Every emphasis site reads `theme.emphasisCss || (gradient from theme.accent)` — `scene_kit.js:912, 939, 992, 1018, 1201, 1316, 1363` — so on these 5 packs **the single most brand-visible element, the highlighted headline word, stays pack-colored** even with a valid skin. Sharper still: `:912` sits inside a `textfx.emphasis` **mode switch**, and the other five modes (glow/boxed/marker/underline-grow/bracket) already build from `theme.accent`. **`mint-launch` declares `emphasis:"marker"` → it renders brand at `:912` and pack-gold at `:939/:992/:1018`. The same pack renders two colors depending on archetype.** Fix: `brand.applied ? brand.emphasisCss : theme.emphasisCss`.

**Group C — ⚠️ NEW FINDING, needs your call (6). Packs whose identity IS their color, and which are being brand-recolored TODAY.**
`bauhaus-print` (red/blue/yellow on cream — *the same objection as bauhaus-riot*), `biennale-yellow` (yellow is **in the name**), `vault-gold`, `terminal-amber`, `terminal-green` (green **phosphor** CRT), `noir-spotlight` (gold/crimson on void), `vapor-chrome`.

**No proposal caught this.** These are scene-kit packs, so they already receive the full brand-accent merge. And `scene_kit.js:156` **prepends** brand accents then `.slice(0,4)` — so on `vault-gold`, a brand skin **demotes the gold out of `accent`/`accent2`**, the two most-used slots. That is a significant identity change **shipping right now** for every website-ingest job on those packs. → **Open decision D4.**

---

## 7. Contrast & accessibility — two tiers, neither blocks a render

**The product rule, adopted explicitly:**

> ### Never reject. Always auto-fix. Always disclose.

Your spec says *"reject/auto-fix bad combos."* **Reject is the wrong verb.** If a user picks their real brand yellow and we reject it, their brand is absent and the feature is a liar. And silent correction is nearly as bad as silent dropping.

### Tier 1 — HARD gate, pre-render, deterministic, ALWAYS on

Runs inside `resolveBrand`, before a byte of HTML exists. No Chromium, no LLM, microseconds. Lift `relLum`/`ratioOf` verbatim from `contrast_check.js:199-207` — they are already correct, pure-RGB, and merely **trapped inside `probeFrames`**, a function body serialized into the browser at `:396-401`, hence un-importable.

```
for each brand accent, against THIS composer's ground:
  r = ratio(accent, ground)
  r >= contract.contrastFloor                → accept
  else nudgeToRatio(accent, ground, floor, contract.hueDriftMax)
       → accept + adjusted.push({from, to, reason})       ← DISCLOSED, not silent
  unfixable within hueDriftMax               → dropped.push({hex, reason})   ← last resort only
if accents empty                             → return null (pack keeps its own) + note
```

**This is a hard gate on the PALETTE, never on the RENDER.** It can correct or drop a color; it can never fail a job. That is the only kind of hard gate compatible with `art_director.js:14-17`.

Yellow-text-on-white becomes **darkened yellow that clears 4.5:1** — hue preserved, recorded in `adjusted[]`. It also ends the `>45`/`>55` incoherence *and the false comment* at `scene_kit.js:150-155`.

### Tier 2 — ADVISORY, post-render, real pixels, CI-gating

`contrast_check.js` is genuinely excellent and measures what Tier 1 structurally cannot: text over **photos, gradients, canvas FX, Three.js, screenshots**. **Do not rebuild it. Do not make it the runtime gate:**

- It is **default-OFF** (`pipeline.js:257-262`); `CONTRAST_GATE` is set **nowhere** in the repo.
- Its only chain is `contrastGate:268` → `gateComposition:374` → `composeWithLintRepair:447` — **the remix path**, which is off by default (`config.js:209-211`, `useComposer` defaults false). It runs on **zero default jobs**, and 8 of 9 renderers `return` before it structurally.
- Even in `repair` mode it **ships the failing comp on lap exhaustion** (`pipeline.js:453, 464-468`). **It can never hard-block by design.**

**Correct use:** the **CI regression gate**, via `npm run audit:contrast` (`scripts/audit-contrast.js:67` — `process.exit(anyFail ? 1 : 0)`, the one place contrast genuinely gates), run over harness-rendered branded job dirs (§8, assertion E).

**Cheap math guards every job. Expensive truth guards every release.** A post-render failure means text landed on a photo — an asset problem, not a palette problem; blocking would punish the user for our stock image. Surface it in `brandReview` instead.

---

## 8. Template integrity — the magenta test

### 8a. Why it cannot be built on `check-pack-identity.js`'s existing path

**I verified this and no proposal noticed it.** `check-pack-identity.js:41` reads:

```js
const built = sk.buildComposition({ storyboard, dims, framePack: name, assets: [], seedKey: `id-${name}` });
```

It builds **every pack through the scene-kit** — so it **structurally cannot exercise** flagship / brightlife / blueprint / bloom / bauhaus / terminal / paper-tales. It also greps **zero** occurrences of `accent`/`colors`/`skin` (it asserts ground + display font + enrich passthrough + comp size, per its own header at `:8-15`). **So it will not false-trip on an accent-only retrofit — and it will not catch a regression either.**

> **Build the differential through the per-pack HARNESSES** (`server/scripts/<pack>-harness.js`), which call each composer's real `buildComposition` with no LLM and no DB. **I counted 8: bauhaus, bloom, blueprint, brightlife, flagship, paper-tales, scenekit, terminal. There is no `three-harness.js` — add it.**

### 8b. The test

For each of the 31 packs, build twice via its harness:
1. `brandSkin = null` → `stock.html`
2. hostile skin `{accents:["#FF00FF","#00FF00","#FFFF00"], emphasis:["#FF00FF","#00FF00"]}` → `branded.html`

| # | Assertion | Catches |
|---|---|---|
| **A** | Every hex in `manifest.brand`-locked roles appears in `branded.html` at the **same occurrence count** as in `stock.html` | A composer wrote a locked role |
| **B** | `#FF00FF`/`#00FF00`/`#FFFF00` never appear within `hueDriftMax`/ΔE of a locked hex's position | Sneaky partial recolor |
| **C** | **Strip every `#rrggbb` / `rgba()` / `hsl()` literal from both files. The REMAINDER must be byte-identical.** | **Any change to DOM, GSAP timeline, motion, typography, camera, asset placement, scene composition — exactly what your integrity rule forbids.** This is the whole ballgame: *"layout, motion language, typography, camera system, asset placement, animation style, scene composition must all remain"* becomes a **git-diff-grade byte comparison**, not a promise. |
| **D** | Count differing color literals; must be ≤ the declared tier ceiling (`accent`: 1 role; `accents`: ≤4 + emphasis; `atmosphere`: + ground family) | Scope creep past the declared contract |
| **E** | `node scripts/audit-contrast.js <branded jobDir>` exits 0 | A hostile brand color made text invisible |
| **F** | **MUST-DIFFER: for any pack whose tier ≠ `off`, accent-region pixels MUST differ between stock and branded.** | **The silent no-op.** A brightlife-class fix that changes nothing **cannot merge.** This is the single highest-value assertion in the design. |
| **G** | `mode:"off"` packs: **all** pixels identical | The opt-out is real |

**Same geometry, different color.** That is your integrity rule as a build failure.

### 8c. Defense in depth — runtime assert

`assertContract(theme, packSkin, contract)`: **throws in dev/CI**; in prod **warns + reverts** the locked role to its pack default. Consistent with the fail-open law every director follows.

### 8d. ⚠️ The magenta test is untrustworthy until the HyperFrames pin is fixed

**Verified:** `config.json`'s top-level keys are `server, llm, orientations, qualities, audio, defaults, allowedFps, frames, orchestrator, qa, stt, assetProviders, ingest, paths`. **There is no `render` key**, and no `cfg.render` in `config.js`. So `renderer.js:73` and `validator.js:17` both read `config.render?.hyperframesVersion` → `undefined` → fall back to **unpinned `hyperframes@latest`**, while every harness header documents `@0.6.120`. Harnesses also render `--quality draft` while `config.json` sets `server.renderQuality: "high"`.

> **Different engine AND different tier. Every harness-verified recolor in this rollout is unverified for production until this lands.** One line, Phase 0, non-negotiable:
> ```jsonc
> "render": { "hyperframesVersion": "0.6.120" }
> ```

---

## 9. API + DB + frontend

### DB — there is no migration to write

`db.js:15` is `const jobs = new Map()`; `persist()` (`:38-46`) writes one JSON array via tmp+rename. **No columns, no schema, no migrations.** Copy the `framePack` pair **exactly**:

```js
// db.js:118 neighbour (insert() record literal)  ← copies `frame_pack: job.framePack || null`
brand_palette: job.brandPalette || null,

// db.js:81 neighbour (shape() — the API view)    ← copies `framePack: j.frame_pack || null`
brandPalette: j.brand_palette || null,
```

Old on-disk records simply lack the key → `undefined` → the `|| null` idiom already used throughout `shape()` makes that safe. `db.setBrandReview` (`:220-224`) already exists for the resolved skin — extend it to carry `adjusted[]`/`dropped[]`/`tier`, and call it from the **composition** node (§3e).

### API — `routes/projects.js`

`validateCreate` (`:58-135`) is a hand-rolled whitelist — **unknown fields are silently dropped, no 400**. Follow the `composeMode` enum pattern (`:116-122`):

```js
// Multipart coerces EVERYTHING to string (web/src/api.js:42-44 `form.append(k, String(v))`),
// so accept BOTH shapes. Precedent: the boolean dance at projects.js:102/:106
//   `out.autopilot = body.autopilot === true || body.autopilot === "true"`
let bp = body.brandPalette;
if (typeof bp === "string") { try { bp = JSON.parse(bp); } catch { errs.push("brandPalette must be JSON"); bp = null; } }
if (bp && typeof bp === "object") {
  const hex = (v) => (/^#[0-9a-fA-F]{6}$/.test(String(v || "")) ? String(v).toLowerCase() : null);
  const primary = hex(bp.primary);
  if (!primary) errs.push("brandPalette.primary must be #RRGGBB");
  else out.brandPalette = {
    v: 1, primary, secondary: hex(bp.secondary), accent: hex(bp.accent),
    source: ["manual","preset","website","logo"].includes(bp.source) ? bp.source : "manual",
    presetId: typeof bp.presetId === "string" ? bp.presetId.slice(0, 32) : null,
    raw: Array.isArray(bp.raw) ? bp.raw.map(hex).filter(Boolean).slice(0, 6) : [],
  };
}
```
Then `brandPalette: out.brandPalette` in the `db.insert` payload (`:162-192`).

**Do NOT route the user's palette through `intent.preferences`** (`:183-188`). That feeds the brief LLM, which `system_brief.md:46` licenses to substitute its own hexes and `brief.js:30` validates for shape only. **An exact user pick laundered through a temperature-0.6 model is not an exact user pick.** Read it at `graph.js:507` directly. *(Also: `shape()` does not expose `intent` at all, so it cannot double as the echo-back.)*

### Frontend

No router, no state library — `App.jsx:115-124` is an object literal keyed by a `view` string; auth is the only Context.

- **The settings panel already exists.** `CreateScreen.jsx:225-293` is a `repeat(auto-fit, minmax(220px,1fr))` grid of four `card`+`spine` tiles (Duration / Orientation / Captions / Finish). **A fifth "Brand Colors" tile drops in with zero layout work.** Your *"Choose Template → Choose Brand Colors → Generate"* flow already exists structurally: the pack grid is at `:307-317`, the settings grid at `:225`.
- **One payload site:** `CreateScreen.jsx:64-73`. The JSON path (`api.js:47-51`) needs no change; the multipart path sends `JSON.stringify(brandPalette)`.
- **Seed from `/api/frames`, not `packlore.js`.** `frames.js:36-42` already returns `colors`/`accents`/`ground`, and `CreateScreen.jsx:43` **already fetches it and throws it away** (`Templates.jsx:53` uses `loreFor(pack.name)` instead). Hanging the picker off `pack.accents` costs no new endpoint and **cannot drift** — `packlore.js` is a hand-maintained duplicate and says so at `:120-122`.
- **Live preview is already wired:** `CreateScreen.jsx:51` `activeLore` → preview background `:208`, accent meta line `:196`.
- **Match the existing swatch language:** `UnderstandingScreen.jsx:111-128` ("LIFTED PALETTE", 36px chips, hex tooltip, skeleton pulse) and the resolved-side `BrandDirectorPanel` (`ProductionTheater.jsx:268-300`). **The app has zero `<input type="color">` today** — that is the only genuinely new control.
- **Show the tier on the pack card:** *"Full brand atmosphere"* / *"Brand accents"* / *"Accent only — this pack's palette is its identity."* **Honesty at selection time is the UX half of the integrity rule.**
- **Surface `adjusted[]` and `dropped[]`** in `BrandDirectorPanel`: *"we darkened your yellow to keep text readable."* Precedent for user-facing soft warnings: `script_warnings` (`db.js:157`). **~10 lines. Silent color loss reads as a bug.**
- **The second create path:** `App.jsx:50-64` `runGenerate` has its **own hardcoded field object** (`:57-59`) for the landing-page iframe CTA (`:89`). **A picker only in CreateScreen is bypassed by every landing-page user.** Phase 1 sends `brandPalette: null` there explicitly (documented no-op); Phase 2 routes it through a prefill.
- **Presets (method 2):** a 6-entry client constant (Ocean, Sunset, Forest, Royal, Neon, Luxury Gold) → the same `brandPalette` with `source:"preset"`. **~2h.** No backend awareness needed.

---

## 10. Phased rollout

### Phase 0 — Prerequisites (**1 day**)

| Item | Why |
|---|---|
| `{"render":{"hyperframesVersion":"0.6.120"}}` → `server/config.json` | **Blocker.** Without it, nothing in this rollout is production-verified (§8d). |
| Add `server/scripts/three-harness.js` | The 9th renderer has no harness; the magenta test needs one. |
| Delete the dead var blocks: `bloom_composer.js:434`, `bauhaus_composer.js:385` (verified **0** `var()` uses each) | Delete, don't wire. |

### Phase 1 — **THE HEADLINE. 3 days.** Ship this first.

**Goal: stop the product lying, and put brand color on 26 of 31 packs.**

| # | Work | Effort |
|---|---|---|
| 1 | `brand_kit.js` (WCAG + `nudgeToRatio` + `resolveBrand` + `cssVarBlock`) + unit tests. **Adopt in `scene_kit.deriveTheme` with `brandSkin` unchanged — behavior-preserving, wraps not modifies (§4a).** Fix the false comment at `scene_kit.js:150-152`. | 1d |
| 2 | **Dispatch fix ×8**: `pipeline.js:483…515` + `graph.js:698` + 8 signatures. **Decide D1** (`runJob`). | 0.5d |
| 3 | `art_director`: precedence + provenance (`graph.js:507`); explicit → `defaultBrandSkin`; bypass `usableAccent` for explicit; the skip-override gate; delete dead `relLum` + dead disabled branch. **Interim: gate `setBrandReview` on `rendererFor()` being brand-aware.** | 0.5d |
| 4 | **flagship.** ⚠️ **Not a 3-line fix — I read it.** `flagship_composer.js:61` `flagshipTheme(framePack, sb)` → `:62` `deriveTheme(framePack, sb)`. **4 hops:** `pipeline.js:483` → `buildComposition:627` → `flagshipTheme:632/:61` → `deriveTheme:62`. **And the trap:** `:69-71` `emphMain`/`kickCol` read **`accents[1] \|\| accents[0]`**, while `deriveTheme` **prepends** brand (`:157`) — so one brand accent puts brand at `[0]` and shifts the **pack's** accent into `[1]`, leaving **flagship's emphasis gradient and kicker pack-colored**. It would look like the fix failed. Read `brand.emphasis` instead. *(This is why the resolver returns an explicit emphasis pair.)* | 0.5d |
| 5 | `brandPalette`: API field + `db.js` 2 lines + shape line + **5th settings card** (manual + presets) + `adjusted[]` in `BrandDirectorPanel` + `App.jsx` explicit null. | 0.5d |

**Outcome:** methods 1+2 live; **26 of 31 packs brand-aware** (24 scene-kit + flagship + the emphasis fix); **method 3 starts working correctly as a side effect of the dispatch fix**; one WCAG implementation; one contrast floor; the UI stops lying.

### Phase 2 — Contract + gate (**4 days**)

`brand.{mode,slots,maxAccents,contrastFloor,hueDriftMax,note}` in all 31 `pack.json` + zod (1d) · **magenta test through the harnesses**, assertions A-G, wired to CI (2d) · **allow-list lockstep**: `set_dressing.js`, `composer.js` `paletteLaw`, `enrich.js` (0.5d) · `bauhaus-riot` → `mode:"off"` (~0) · **three_composer** (0.25d) · read extracted colors direct from `intent`; `og:image` sampling (0.25d).

> **`og:image` — the free win.** `website.js:165` already extracts it, `project_pipeline.js:92` carries it to `intent.website.ogImage`, and **nothing ever downloads or samples it.** An og:image is almost always the brand's own logo card. `util.download()` (`asset_sources/util.js:13-37`) + the (unexported) `dominantColors()` = **most of Method 4's value with zero multer, DB, or UI work.**

> **three_composer — do it because it's free, not because it's high-traffic.** Genuinely one argument (`:88 accent: accents[0]`), and `neonize()` (`:51-61`) already does hue-preserving lifting. **But `graph.js:687` gates it on `job.render3d && !dedicatedThree && !isAssetRich(assets)` — and website-ingest jobs, exactly the ones that HAVE brand colors, are the asset-rich ones.** Its reach is a narrow opt-in slice.

### Phase 3 — The long tail (**7 days**). **Magenta test must be green first.**

| Pack | Effort | The trap |
|---|---|---|
| **brightlife** | 2d | ⚠️ **Guaranteed silent no-op.** I read it: `:58` computes `base = deriveTheme(...)`, `:59-60` **discards `base.accents`** for a literal `PALETTE`/`accents`; `base` survives only for `displayStack`/`fontFace`. **Threading `brandSkin` changes nothing.** `theme.palette` is **structural** — `PAL` (`:238`), `softPal` (`:249`), `uiPalette` (`:250`), chip gradient (`:902`). And **brightlife has no luminance function at all** (`:44-51` — no `relLum`, no `ensureBright`, no `neonize`, unlike flagship `:47` / three `:47`): **its palette was frozen *because* it has no legibility math.** `brand_kit` is a **prerequisite**, not a nicety. Comment `:54-56` says the freeze is deliberate → **design reversal; get sign-off. Verify by render, not by code read.** |
| **bloom-fable** | 1d | The honest pilot. 11 strays. Theme fn takes **zero args** (`:31`). |
| **blueprint** | 0.5d | `slots:["amber"]`. Cyan/red semantics locked. Zero-arg theme fn (`:35`). |
| **terminal** | 1d | `slots:["yellow"]`, `maxAccents:1`. Green/red are STATUS. Zero-arg (`:38`). |
| **paper-tales** | 2d | 93 literals. `TABS` (`:48-54`) is a **second frozen palette outside the theme**. ⚠️ **Latent bug:** `:192`/`:359` `tab.tab === theme.butter ? "color:#7A5B23;"` — an **identity comparison** is the only thing forcing dark ink onto the light butter tab. Retint one side and the `===` silently breaks → **invisible text**. |

*All five native composers require `frame_manifest`/`frame_registry` for the first time — their only current require is `../fonts/pack_fonts`.*

### Phase 4 — Gated on sign-off

**Atmosphere tier** (flagship + brightlife, **D2**) · **Method 4 logo upload** (**~3d**, see §11) · Group C decision (**D4**).

---

## 11. What I recommend CUTTING or DEFERRING

| # | Spec item | Verdict & reason |
|---|---|---|
| 1 | **"No hardcoded colors should exist inside templates"** | **CUT — hard refuse.** Directly contradicts your own "very important" integrity rule. Bauhaus's primaries, Blueprint's navy, flagship's fixed-light product panels **are** the templates. **Replace with "no UNDECLARED colors"** (§1). |
| 2 | **Agent-produced `gradients{}`/`uiColors{}`/`threeJsColors{}`/`chartColors{}` as a wire contract** | **CUT as a wire contract; DELIVERED as resolver outputs.** The agent runs parallel to `frame_selector` and cannot know the ground. 9 composers × 5 namespaces = 45 mappings each needing a per-composer opinion about what "uiColors" means for a split-flap board. **The composer stays the authority on what its colors MEAN** (§2c). |
| 3 | **"AI COLOR HARMONY"** | **CUT the AI. CUT the complements. KEEP the derivations.** *The complement of Google blue is orange — a color Google does not own. Generating it ADDS off-brand color while claiming to be on-brand* — exactly what `sanitizeSkin`'s allow-set exists to prevent. Keep tints/shades/hover/active/glow/shadow/onAccent (the user's **own** hues); complements only fill a **genuinely empty** slot, and then **analogous (+32°), not complementary** — complements read as an error state (§4e). |
| 4 | **A chart/analytics color system** | **CUT the system; EMIT `chart[]`.** There is no chart library and no data-viz composer. The closest is `flux-analytics` — a **scene-kit** pack whose "analytics" is *theming* (roles: `base,panel,grid,ink,violet,mint`), not data-viz. The only chart-like pixels are the **fake dashboards** inside flagship's `uiPalette`, deliberately fixed-light so real screenshots on the same plates don't fight. `chart[]` is one line (the deduped accent ramp); a charting system for charts that don't exist is not. |
| 5 | **Brand-driven ground / "background atmosphere"** | **DEFER to Phase 4 behind sign-off (D2)** — and note it is architecturally blocked at the source anyway: `website.js:73-74` **discards near-white/near-black/gray** as "page chrome," which are exactly the pixels defining a brand's ground. Ground-branding starts in `website.js`, not the agent. The **atmosphere tier** (§6c) delivers ~80% of the intent within the luminance envelope. |
| 6 | **Contrast as a render-blocking gate** | **CUT.** Tier 1 already makes an illegible accent unreachable; Tier 2 can never block by design (`pipeline.js:464-468`). **Auto-fix in production; gate in CI** (§7). |
| 7 | **The word "reject"** in "reject/auto-fix bad combos" | **CUT.** `art_director.js:14-17` is the law. Never reject; nudge, then disclose, then drop only as last resort. |
| 8 | **"NEW UX FLOW: Choose Template → Choose Brand Colors → Generate" as a new flow** | **CUT as a *new* flow.** It is a fifth tile in the existing grid (`CreateScreen.jsx:225-293`), one click from the pack selector at `:307-317`. A wizard means a router the app doesn't have. |
| 9 | **A new "Brand Color Director Agent"** | **CUT — build zero.** It exists, is default-ON, is graph-wired, is persisted, is UI-surfaced. A second one duplicates 190 working lines and re-earns the same dispatch bug. |
| 10 | **Method 4 (logo upload)** | **DEFER to Phase 4 (~3d).** **The color science is done** — `dominantColors()` takes any file path; export it. The cost is plumbing: `projects.js:25` `VIDEO_MIMES` rejects every image, `:34` `files:1`, `:43` `upload.single("referenceVideo")` — a logo can't coexist with a reference video. Needs `upload.fields()`, `IMAGE_MIMES`, a **per-field** size cap (`maxUploadMb:200` is one global → a 200MB "logo"), `req.file`→`req.files.logo?.[0]` (`:150`), splitting `hasUpload` (`:78`) so a logo-only post doesn't satisfy the subject check, a `janitor.js:58` 24h-TTL exemption, **alpha-flattening onto white** (`-pix_fmt rgb24` composites alpha onto **black**, then `website.js:74`'s `lum<0.08` eats the dark ink), an SVG path (multer **defaults the ext to `.mp4`**, defeating every `extname===".svg"` check), and a monochrome fallback (`sat<0.15` → `[]` → null skin, which fails open correctly). **~3 days for the 4th-most-used method — after `og:image` has already delivered most of its value.** |

---

## 12. Risks

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| 1 | **The product lies to the user today.** `BrandDirectorPanel` shows accents the MP4 provably lacks, on 8 of 9 renderers. Every day this ships is a **credibility bug**, not a missing feature. | **Critical** | Dispatch fix ×8 is Phase 1 item 2, before any UI. Interim: gate `setBrandReview` on `rendererFor()` brand-awareness — **show nothing rather than something false**. Then persist the **resolved** skin from the composition node (§3e). |
| 2 | **Silent no-op on brightlife** — the fix lands, nothing changes, reads as *"the feature is broken."* Burns days. | **Critical** | **Magenta assertion F (MUST-DIFFER)** fails the build. A no-op cannot merge. Verify by **render**, not code read. |
| 3 | **A user's chosen color silently vanishes.** Four uncoordinated filters, zero telemetry: `website.js:74` (`sat<0.15`), `art_director.js:77` (HSL, not luminance), `scene_kit.js:133` (`>55`), `:155` (`>45`). Muted navy → stock accents → bug report. | **Critical (UX)** | `nudgeToRatio` **corrects, never drops**; `adjusted[]` rendered in the panel; `usableAccent` bypassed for `explicit`; the LLM skip-veto never reaches a user pick. |
| 4 | **We "brand" videos with hallucinated hexes.** `system_brief.md:46` licenses invention; `brief.js:30` validates shape only. | **High** | `provenance` + precedence `explicit > extracted > inferred` reading raw `job.intent.website.brandColors`. UI labels inferred. → **D3.** |
| 5 | **Downstream strips what the composer applied.** `set_dressing` `colorOk`, `paletteLaw` (*"a DEFECT"*), `enrich` → **half-branded frames.** | **High** | Phase 2 lockstep. **The mitigation most likely to be forgotten.** |
| 6 | **Template identity destroyed** on bauhaus/blueprint/terminal. | **High** | Four mechanisms: return-shape omission, per-role locking-by-absence, `mode`/`slots`/`note` in the manifest, magenta assertions A-D+G. |
| 7 | **Six luminance definitions disagree.** Three aren't WCAG; `enrich.js:34-38` is Rec.601 and its `L<64/L>224` thresholds decide whether a ground gets **replaced by a gradient** — it changes what text is measured against. | **High** | Phase 1 item 1 collapses them. **Non-negotiable prerequisite:** a 9-composer change on six contradicting definitions of "dark" is how you ship invisible text. |
| 8 | **flagship emphasis stays pack-colored** after the "free" fix (`accents[1]` + prepend shift). | Medium-High | `resolveBrand` returns an explicit `emphasis` pair; flagship reads `brand.emphasis`, never `accents[1]`. |
| 9 | **Identity drift across 3-4 sources.** `frames/flagship/FRAME.md` says ground `#07080F`; `pack.json` says `#0A0B16`; `flagship_composer.js:73` hardcodes `#0A0B16`; `pack.json` duplicates it into `camera3d.ground`. **They already disagree**, and `deriveTheme` **mixes sources** (accents/fonts from FRAME.md `:98`, ground from the manifest `:114-115`). 7 of 31 packs have drifted. | Medium | Declare `pack.json` canonical; boot-lint FRAME.md ≡ pack.json. **Deleting the composer literals in favor of manifest reads is behavior-preserving today** (brightlife's `pack.json` accents are byte-identical to its literals) — **a zero-risk first commit** that retires the drift. |
| 10 | **Harness-verified ≠ production-verified** — inert pin + `draft` vs `high`. | Medium | Phase 0, one line. **Before**, not during. |
| 11 | **Regressions ship unseen.** QA is skipped for all 7 dedicated renderers **and** for the scene-kit (`graph.js:865`, `s.repairable === false` ← `useComposer`, default false at `config.js:209-211`). Contrast is default-off **and** structurally unreachable on non-remix paths. **Nothing vision-reviews a default job.** | Medium | The magenta test **is** the QA gate — deterministic, pixel-exact, free, and strictly better than a VLM for *"did the geometry move."* This is why §8 is load-bearing, not polish. |
| 12 | **`paper-tales` `===` trap** — retinting `TABS` without `tealTheme` breaks `tab.tab === theme.butter` → invisible text. | Medium | Derive TABS from brand hue + a fixed pastel S/L envelope, in one commit. Assertion E catches it. |

---

## 13. Open decisions — I need your input

| # | Decision | Why it's yours | My recommendation |
|---|---|---|---|
| **D1** | **`/api/generate` → `pipeline.runJob` has no Art Director at all** (`server.js:41-42` ← `routes/generate.js:144`; `pipeline.js:1060/1084/1115` pass no `brandSkin`). A live slice of traffic is unbranded **even on the scene-kit**. Call `directBrand` in `runJob`, or route `/api/generate` through the graph? | It's a product-surface question: is `/api/generate` still a supported path? | **Route it through the graph.** Two composition paths with different agent coverage is how this bug happened once already. |
| **D2** | **The atmosphere tier reverses a decision you already made.** `art_director.js:9-12` documents ACCENT-ONLY as *"the user's pick"*; memory records an AskUserQuestion confirmation **2026-07-14**. Atmosphere hue-rotates flagship/brightlife grounds within a pinned luminance envelope. | **This is a reversal, not a gap.** You decided it; only you can undo it. | **Approve for flagship + brightlife only, in Phase 4, after the magenta test has run green in CI for a sprint.** It is the only mechanism that delivers *"different visual identity."* Accent-only concedes your headline. |
| **D3** | **Should `provenance: "inferred"` produce a brand skin at all?** Today a prompt-only job is "branded" with colors the brief LLM invented. | Product honesty vs. perceived polish. | **No skin.** An unbranded video *should* look unbranded. Label it in the UI: *"we guessed these — pick your own."* |
| **D4** | **Group C: 6 scene-kit packs whose identity IS their color** — `bauhaus-print`, `biennale-yellow`, `vault-gold`, `terminal-amber`, `terminal-green`, `noir-spotlight`, `vapor-chrome`. **They are being brand-recolored today** (`scene_kit.js:156` prepends brand and slices to 4, **demoting `vault-gold`'s gold out of `accent`/`accent2`**). Nobody has noticed. | Nobody has ever made this call. It's shipping either way. | **`maxAccents: 1` for all seven** — the brand takes `accent`, the pack's signature keeps `accent2`. **`bauhaus-print` → `mode:"off"`**, same objection as `bauhaus-riot`. |
| **D5** | **brightlife's frozen palette** (`brightlife_composer.js:54-56` says the freeze is deliberate) and its structural `theme.palette` (particles, generated UI, chips). Unfreezing is a design decision. | It's a template-identity call on a marquee pack. | **Unfreeze in Phase 3, after `brand_kit` supplies the legibility math it never had.** Derive the 10-ramp from `accent` + a fixed pastel S/L envelope. |
| **D6** | **UI honesty:** do we label `accent`-tier packs *"Accent only — this pack's palette is its identity"* on the pack card? | It admits a limit at the moment of choice. | **Yes.** Honesty at selection time is the UX half of the integrity rule, and it is cheaper than a support ticket asking why Bauhaus ignored their brand. |

---

## The one-paragraph version

**You have a Brand Color Director. It's called the Art Director, it's been ON by default, and it works — on 24 of 31 packs.** It looks absent because `pipeline.js:482-514` drops its output for the 7 packs with dedicated renderers (including both flagship templates you'd naturally demo on), `graph.js:698` drops it for an 8th, and `pipeline.runJob` never runs it at all — while `BrandDirectorPanel` shows the user swatches the MP4 does not contain. **Fix the dispatch, add a two-color picker to the settings grid you already have, route explicit picks through the deterministic path that's already exported (`defaultBrandSkin`, `art_director.js:190`) instead of an LLM that can veto them, collapse six disagreeing luminance functions into one that nudges instead of drops, and let every pack declare in its own manifest which slot it rents to a brand.** Enforce it with a magenta-vs-stock differential run through the **harnesses** — because `check-pack-identity.js:41` builds every pack through the scene-kit and cannot see the seven renderers this feature is about — asserting **same geometry, different color**, so *"Bright Life still feels like Bright Life"* is a build failure instead of a hope. Cut the invented complements (the complement of Google blue is orange, a color Google does not own), the five-namespace wire contract (the agent runs parallel to `frame_selector` and cannot know the ground), and reject-on-bad-contrast (never reject; nudge, then disclose). **Phase 1 is 3 days and puts brand color on 26 of 31 packs. Bauhaus keeps its red, blue, and yellow — and that's the design, not a gap.**