# KEYFRAME — Agent Architecture Audit & Optimization Plan

> Full-system audit of every agent in the video-generation pipeline: responsibilities, contracts,
> bugs, failure modes, scalability, and a future-state roadmap. Every finding is grounded in
> `file:line`. Reviewed as if by senior engineers + AI architects + creative/motion/product design.
>
> Method: five parallel deep-read passes over the live code (`server/src/agents/graph.js`,
> `services/*`, `prompts/*`, `config.js`, `db.js`) plus direct reads of `scene_kit.js`,
> `audio_mix.js`, `audio_director.js`, `pipeline.js`. Nothing here is assumed — it is read.

---

## 0. TL;DR — the ten things that matter most

| # | Finding | Where | Severity |
|---|---|---|---|
| 1 | **`normalizeScript` can emit a script that fails its own validator** — redistribution clamps scene duration to `15`, but the schema caps it at `12`. Long/short-scene splits self-invalidate and burn a retry. | `script.js:89` vs `script.js:25` | **P0 correctness** |
| 2 | **Creative Director is blind to scenes past #12** — `sceneDigest` does `slice(0,12)`; videos allow 24 scenes. Assets for scenes 13–24 are silently discarded. | `creative_director.js:67`, `script.js:37` | **P0 correctness (long videos)** |
| 3 | **The QA→repair loop re-renders byte-identical output for the default composer.** Scene-kit is deterministic and ignores `__qaIssuesToFix`, yet QA isn't skipped for it — a failed QA triggers up to 2 identical re-render + re-review laps. | `graph.js:780-786`, `config.json:93`, `scene_kit.js` (no `__qaIssuesToFix`) | **P0 waste (≈2× render + vision cost)** |
| 4 | **`storyboard_agent` is the only creative node with no fallback.** One malformed LLM response aborts the entire production graph → `markFailed`, even though a valid `script` is already in state. | `graph.js:117-123` | **P0 reliability** |
| 5 | **`dominantColor` is computed per asset then dropped before it reaches the consumer** — palette-affinity placement is dead, and the per-asset ffmpeg pass that computes it is wasted. | `index.js:223` vs `graph.js:353-359`; `scene_kit.js:1111` | **P1 dead feature + waste** |
| 6 | **`scene.purpose` is unvalidated free text but is switched on by exact string match** — a model emitting `"benefit"`/`"demo"` matches nothing, so screenshots never pin to the intended scene. | `script.js:28` vs `graph.js:151` | **P1 correctness (silent)** |
| 7 | **No quality FLOOR anywhere.** The CD scores six dimensions 0–100 but rejection is a pure LLM boolean — an asset scored `overall=20` survives exactly like `overall=95`. Approval ≠ quality. | `creative_director.js:266-277` | **P1 quality** |
| 8 | **The user edits the *script*, but composition renders a *regenerated storyboard*.** The bridge prompt drops `sfx`/`musicCue`/asset `role`, and nothing checks that storyboard scene ids/count/timing match the approved script. Two sources of truth that can silently diverge. | `graph.js:47-62,117-122` | **P1 correctness** |
| 9 | **"Template selection" mostly swaps a theme, not a layout.** ~24 packs share ONE layout+archetype engine (`scene_kit`) and differ only in tokens/background/ornaments/motion presets. Only 5 packs (flagship/brightlife/blueprint/bloom/bauhaus) have genuinely distinct layout+motion. | `pipeline.js:41-45,475-512` | **P1 product** |
| 10 | **CD / Art / Audio directors all dispatch to one model id with no boot validation** — if it is ever wrong/stale, all three fail-open and silently do nothing (pass every asset, default skin, default mix) with only a warn. *(Verified 2026-07-15: the configured `google/gemini-3.1-flash-lite` DOES resolve on OpenRouter's 343-model list — a latent risk, not a live outage. A boot health-check now guards it.)* | `config.js:227,246,261`; `art_director.js:32` | **P1 reliability** |

Everything below expands these with the full matrix, contracts, failure modes, scalability, and a phased roadmap.

---

## 1. Reality check — the pipeline as-built vs as-drawn

Your diagram lists eleven linear "engines." The code is **two acts**, and several "engines" are not separate modules.

### Act 1 — Intake (linear, NOT a graph) — `project_pipeline.runIntake`
`budget check → multi-modal ingest (website + video, parallel) → brief (LLM) → script (LLM) → PAUSE at script_review`
(`project_pipeline.js:47-149`). Autopilot auto-approves (`:146-149`).

### Act 2 — Production (a real LangGraph DAG) — `graph.runProductionGraph`
Dispatched only when `config.orchestrator === "langgraph"` (it is, `config.json:90`). Node registration `graph.js:823-838`, edges `:840-878`:

```
START → frame_selector ──┬─→ storyboard_agent → scene_planner ─┐
                         ├─→ asset_planner → asset_search ──────┤→ creative_director → visual_layout_director ─┐
                         ├─→ voice_agent ──────────────────────(join)                                          │
                         └─→ art_director ─────────────────────────────────────────────────────────────(join)─┤→ composition → animation ─┐
                                                                                                                                            │
   voice_agent ─────────────────────────────────────────────────────────────────────────────────────────(join)→ audio_director ←(join)───┘
   audio_director → timeline → qa_agent ──(pass)──→ END
                                    └────(fail, ≤maxRepairs)──→ repair → qa_agent   (loop)
```

**Mapping your diagram to the real code:**

| Your "engine" | Real implementation | Kind |
|---|---|---|
| Script Generation Agent | `brief.js` + `script.js` (intake, linear) | LLM |
| Asset Collection Engine | `asset_planner` node + `asset_search` node + `asset_sources/*` | JS + providers |
| Creative Director Agent | `creative_director.js` (vision LLM) | LLM |
| Scene Planning Engine | **split**: `storyboard_agent` (LLM, regenerates scenes) + `scene_planner` (JS, derives beats) | mixed |
| Template Selection Engine | `frame_selector` node + `pipeline.rendererFor` | JS |
| Visual Layout Director Agent | `visual_layout_director.js` (**pure-JS, no LLM**) | JS |
| Asset Placement Engine | **NOT a separate module** — lives in `scene_kit.buildComposition` (Pass 1/2/3) | JS (composer) |
| Animation Planning Engine | **NOT a planner** — motion is emitted inside `scene_kit`; the `animation` graph node is a **regex audit** whose output is never read | JS (composer) + dead audit |
| Audio Director Agent | `audio_director.js` (LLM) → `audio_mix.js` (ffmpeg) | LLM + ffmpeg |
| Rendering Engine | `renderer.render()` (headless Chrome capture of composed HTML) + `audio_mix` | deterministic |
| *(missing from your diagram)* | **`qa_agent` already exists** — a vision LLM that reviews the final render and can trigger repair | LLM |

**Three structural truths this reveals:**
1. **Placement and animation are not agents.** They are hard-coded passes inside the default composer (`scene_kit.buildComposition`, `scene_kit.js:1547-1705`) and inside each dedicated composer. There is no "placement plan" or "animation plan" object that a QA layer could inspect or a template could override — the decisions are baked into emitted HTML/GSAP strings.
2. **Scene planning happens twice.** The script (Act 1, user-editable) defines scenes; then `storyboard_agent` (Act 2) **regenerates** them from a prose prompt that drops structured fields (§3). Assets/audio read the *script*; composition reads the *storyboard*. They only stay aligned if the LLM preserves ids/count/timing — unenforced.
3. **A QA agent already exists** — but it runs **after** the expensive render (vision on the finished MP4), is fail-open (passes on error), and its repair loop is a no-op for the deterministic composer (§0.3). The quality gates you're asking for should move **earlier and cheaper**.

---

## 2. Agent responsibility matrix

`owns` = what the agent legitimately decides. `must_not_own` = decisions that belong elsewhere. `LEAKS` = where the current code violates that boundary (with `file:line`).

```json
[
  {
    "agent": "Brief + Script (intake)",
    "owns": ["narrative structure", "scene goals", "voiceover copy", "on-screen text",
             "asset NEEDS (what to look for)", "audio intent (music mood, sfx cues)", "duration budget"],
    "must_not_own": ["asset selection", "layout", "animation", "rendering", "final palette"],
    "leaks": ["none structurally — but emits `assetNeeds` queries the asset engine must trust blindly"]
  },
  {
    "agent": "Frame Selector (Template Selection)",
    "owns": ["choose the frame pack / renderer for the film"],
    "must_not_own": ["theme tokens (pack owns them)", "asset behavior"],
    "leaks": ["brief-suggestion & rotation branches are DEAD — job.frame_pack is pre-resolved at intake (graph.js:110-112); node never calls db.setFramePack so a divergent pick would not persist"]
  },
  {
    "agent": "Storyboard",
    "owns": ["scene beats", "per-scene motion vocabulary", "transitions"],
    "must_not_own": ["re-deciding scene count/timing the user already approved", "palette (pack owns it)"],
    "leaks": ["REGENERATES the user-approved script into new scenes with no id/count/timing consistency check (graph.js:117-122); chooses a full palette that deriveTheme then mostly discards (scene_kit.js:116)"]
  },
  {
    "agent": "Scene Planner",
    "owns": ["derive beats/timing details from the storyboard"],
    "must_not_own": ["creative rewriting"],
    "leaks": ["mutates storyboard in place (graph.js:142) — acceptable but undocumented shared-state write"]
  },
  {
    "agent": "Asset Planner",
    "owns": ["turn scene assetNeeds into concrete search queries + caps", "pin website screenshots to scenes"],
    "must_not_own": ["relevance judgment", "quality judgment"],
    "leaks": ["authors image/vector QUERIES from visualDirection and force-injects an icon need per scene (graph.js:159-190) — content policy inside a planner; selects showcase scenes by EXACT purpose string-match (graph.js:151)"]
  },
  {
    "agent": "Asset Search + Vision/CLIP",
    "owns": ["fetch candidates", "download+validate media", "dedup", "compute dims/hash/color"],
    "must_not_own": ["storytelling relevance verdict (that is the Creative Director's)"],
    "leaks": ["runs its OWN relevance gate when CD is disabled (graph.js:380-402) — dual ownership of the on-topic verdict"]
  },
  {
    "agent": "Creative Director",
    "owns": ["asset ranking", "asset approval/rejection", "per-scene assignment", "prominence"],
    "must_not_own": ["asset placement", "asset ACQUISITION", "audio judgment", "rendering", "animation"],
    "leaks": ["reviewAudio() judges music/SFX fit (creative_director.js:167-196,380) — Audio Director's remit; acquire() FETCHES top-up assets (creative_director.js:329-355) — asset-search's remit"]
  },
  {
    "agent": "Visual Layout Director",
    "owns": ["archetype hint per scene", "asset reduction budget", "hero scale", "crop focus", "device kind"],
    "must_not_own": ["curation verdicts (CD owns them)", "actual DOM placement (composer owns it)"],
    "leaks": ["OVERRIDES the CD's prominence — sets visionOk=false / cdProminence='background' (visual_layout_director.js:118-133), reaching back into curation"]
  },
  {
    "agent": "Art Director",
    "owns": ["accent-only brand skin from extracted brandColors"],
    "must_not_own": ["ground/fonts (pack owns them)", "asset palette (pack owns it)"],
    "leaks": ["can OVERRIDE the model's explicit {skip:true} when the top color is vivid (art_director.js:180); competes with pack tokens AND storyboard palette for the same accent slot"]
  },
  {
    "agent": "Voice Agent",
    "owns": ["TTS synthesis", "VO clip timing", "music+SFX fetch"],
    "must_not_own": ["mix levels / ducking (Audio Director + mixer own that)"],
    "leaks": ["does SFX pre-cut timing nudges and VO anti-overlap sequencing (graph.js:510,533-539) — mixing-domain decisions"]
  },
  {
    "agent": "Audio Director",
    "owns": ["loudness targets (LUFS/TP)", "per-scene music energy", "duck depth", "SFX accept/reject/retime", "audio quality score"],
    "must_not_own": ["executing ffmpeg (mixer owns that)"],
    "leaks": ["clean — correctly advisory-authoritative: plans, mixer executes"]
  },
  {
    "agent": "Composition (scene_kit / dedicated composers)",
    "owns": ["layout", "asset PLACEMENT", "animation emission", "theme application"],
    "must_not_own": ["curation", "acquisition", "audio"],
    "leaks": ["bakes ESTIMATED caption cues from script (graph.js:587-593) that timeline then recomputes (graph.js:735-741) — split caption ownership"]
  },
  {
    "agent": "Animation (graph node)",
    "owns": ["audit tween count / warn on issues"],
    "must_not_own": ["nothing — but it PLANS nothing either"],
    "leaks": ["its animationReport channel is written and NEVER read (graph.js:712,722,817) — an inert node"]
  },
  {
    "agent": "Timeline",
    "owns": ["measured captions/SRT", "invoke the mixer"],
    "must_not_own": ["creative decisions"],
    "leaks": ["clean"]
  },
  {
    "agent": "QA Agent",
    "owns": ["review the final render", "pass/fail + issue list", "trigger repair"],
    "must_not_own": ["re-running for deterministic composers that can't change"],
    "leaks": ["runs (and loops) for the deterministic scene-kit even though repair produces identical output (graph.js:780-786)"]
  }
]
```

**Systemic leakage themes:**
- **Curation is co-owned by three nodes** — CD assigns prominence, VLD overrides it, scene-kit re-filters with `prominentOk` (`scene_kit.js:1574`). The "prominence of an asset" is whatever the last writer left.
- **Acquisition leaks into the CD** (`acquire()` top-up) and **relevance leaks into asset-search** (fallback gate). Two agents each own "is this on-topic?".
- **Audio judgment leaks into the CD** (`reviewAudio`) even though a dedicated Audio Director exists downstream — and the CD's audio opinion dead-ends in the DB, never reaching the Audio Director.

---

## 3. Communication contracts

### 3a. The de-facto contract today = the LangGraph shared state
All channels are bare `Annotation()` (LastValue/overwrite, no reducers), declared `graph.js:809-819`. This is the *only* inter-agent contract, and it is **implicit and untyped**.

| Channel | Written by | Read by | Defect |
|---|---|---|---|
| `job` | init | ~every node | screenshots/brandColors ride on **in-place mutation** of this DB record (`project_pipeline.js:95-97`), invisible to the contract |
| `brief`, `script` | init | many | fine |
| `framePack` | frame_selector | asset/CD/AD/VLD/composition/qa | guarded as nullable but never actually null |
| `storyboard` | storyboard, scene_planner (in-place) | CD/VLD/AD/composition/animation | **regenerated from script**, no consistency check |
| `assets` | asset_search, **CD**, **VLD** | CD/VLD/composition | **three co-mutators** of the same objects' `visionOk`/`cdProminence` |
| `brandSkin` | art_director | composition | ok |
| `layoutPlan` | visual_layout_director | composition | ok |
| `voClips`/`sfxClips`/`musicPath` | voice_agent | audio_director, timeline | ok |
| `audioPlan` | audio_director | timeline | ok (well-shaped, see §7 audio) |
| `visual` | composition/timeline/repair | qa, runner | ok |
| `qa`/`qaAttempts` | qa_agent | conditional, composition | `qa` **overloaded** as a "we are repairing" flag (`graph.js:596,638,644`) |
| `animationReport` | animation | **nobody** | **DEAD** |
| `rendered` | composition (catch) | empty `if` block (`graph.js:729-732`) | **DEAD** |
| `usedFallback`/`composerBudgetDead`/`finalAttempt` | composition | conditional/runner | ok |

**Out-of-band (bypass the contract entirely):** `creative_review`, `audio_review`, `brand_review`, `layout_review` are pushed straight to the DB (`creative_director.js:440`, `audio_director.js:229`, `art_director.js:171`, `graph.js:474`). No downstream node can read another agent's review — e.g. the Audio Director cannot see the CD's `musicAnalysis`; it dead-ends.

### 3b. Proposed strict contracts (zod schemas at every handoff)
Move from "shared mutable bag" to **typed, versioned handoffs**. Each producing node validates its output; each consuming node validates its input. Example targets:

```jsonc
// Script → (everything). Make `purpose` an ENUM and add per-scene emotion + hints.
SceneSpec {
  id: string, start: number, duration: number,
  role: "hook"|"context"|"feature"|"proof"|"how"|"quote"|"cta",   // ENUM, not free text
  emotion: "curiosity"|"tension"|"relief"|"delight"|"trust"|"urgency",
  energy: 0..1,                                   // drives music curve + motion intensity
  voiceover: string, onScreenText: string[<=4],
  assetNeeds: [{ type, query, role, importance: 0..1 }],
  motionHints: { entry, emphasis, exit },         // structured, not prose
  audioHints:  { sfx: string[<=2], musicCue }
}

// Asset engine → Creative Director. UNIFORM shape for every source.
AssetCandidate {
  id, path, source, license, sourceUrl,
  width, height, ratio, hasAlpha, dhash, dominantColor,   // REQUIRED for all sources (fix cache/iconify gaps)
  qc: { minResOk: bool, blankOk: bool, dupOf: id|null }    // hard QC gate result
}

// Creative Director → Layout/Composer. Scores + a HARD floor.
CuratedAsset extends AssetCandidate {
  scores: { relevance, visualQuality, readability, storytelling, motionPotential, templateCompat, brandAlignment },
  overall: 0..100, floorPassed: bool,             // overall >= threshold
  decision: "approve"|"reject", sceneId, prominence: "hero"|"inset"|"background"|"reject"
}

// Composer → QA/Render. Make placement + animation INSPECTABLE (not just baked HTML).
ScenePlan {
  id, archetype, assetIds: id[], placement: {grid, focalPoint, heroFraction},
  motion: { entry, emphasis, exit, camera, timingSec },
  captionCues: [{start, end, text}]
}
```

The win: a **plan can be QA'd before the expensive render**, templates can *declare* which placements/motions they support, and `purpose`/`role` string-matching bugs become impossible.

---

## 4. Bug analysis (consolidated, prioritized)

### P0 — correctness / reliability / material waste
1. **Self-invalidating script duration.** `normalizeScript` clamps to `Math.min(15,…)` (`script.js:89`) but `SceneSchema.duration` is `.max(12)` (`script.js:25`); `generateScript` normalizes *then* re-validates (`script.js:178-179`). A 2-scene/20s film pushes a scene to 14 → fails its own validator → wasted retry/escalation. **Fix:** make the clamp `12`.
2. **CD blindness past scene 12.** `sceneDigest` `slice(0,12)` (`creative_director.js:67`); `validSceneIds` built only from those (`:247`); assignment gated by it (`:261`). 13–24-scene films lose all asset assignment for later scenes. **Fix:** page the digest or raise the cap to the schema max (24).
3. **QA repair loop is a no-op for the default composer.** Scene-kit renders deterministically from stable inputs and never reads `__qaIssuesToFix`; QA-skip (`graph.js:780-786`) exempts only 3D/native renderers, not scene-kit. A failed QA burns `maxRepairs=2` (`config.json:93`) identical re-render+re-review laps. **Fix:** skip QA (or the repair edge) whenever the effective composer is deterministic scene-kit.
4. **`storyboard_agent` has no fallback** (`graph.js:117-123`). Unlike every other creative node it is fail-closed; one bad LLM response aborts the whole job. **Fix:** deterministic storyboard fallback seeded from the already-valid `script`.
5. **CD verdicts dropped on a mis-numbered `n`.** `reviewChunk` keys solely on model-returned `v.n` (`creative_director.js:154-159`); a missing/duplicate `n` drops **all** verdicts in the chunk (fail-open, unreviewed). **Fix:** fall back to array position when `n` is absent.

### P1 — quality / product / silent degradation
6. **`dominantColor` dropped in the graph path** (`index.js:223` computed → not copied at `graph.js:353-359`); consumer falls back to neutral for every asset (`scene_kit.js:1111`), so palette-affinity ordering is dead and the ffmpeg color pass is wasted. **Fix:** propagate `dominantColor` (and `dhash`) in the graph wrapper.
7. **`purpose` free-text vs exact-match switch** (`script.js:28` unconstrained vs `graph.js:151` `["feature","proof","how","context"].includes`). Off-vocabulary purposes silently unpin screenshots. **Fix:** enum + validation (see §3b).
8. **No quality floor in the CD** (`creative_director.js:266-277`). Rejection is a pure LLM boolean; low scores never gate. **Fix:** `floorPassed = overall >= threshold`; demote/reject below it.
9. **Redundant + missing CD dimensions.** `brandCompat` and `templateCompat` both measure *template* fit (`system_creative_director.md:62,66`); **readability is absent** from `SCORE_KEYS` (`creative_director.js:96`). The equal-weight mean double-counts template fit and never scores legibility. **Fix:** replace one with true `brandAlignment` (logo/brand-color match) and add `readability`.
10. **Script↔storyboard double-generation** (`graph.js:47-62,117-122`) drops `sfx`/`musicCue`/asset `role` and has no id/count/timing consistency check. User edits can be silently reinterpreted. **Fix:** make storyboard a *deterministic transform* of the approved script, or add a consistency gate.
11. **Cached web-stock bypasses fallback vision gates.** `source="cache:pixabay"` fails the exact-Set membership checks (`graph.js:366`, `pipeline.js:215`) that the CD path was already patched for (`creative_director.js:38-45`). With CD off, an off-topic cached asset ships forever. **Fix:** use `.includes()`/prefix match in the fallback gates too.
12. **No minimum-resolution reject.** `validateImage` (`util.js:182-203`) never checks min dimensions; the rank filter treats unknown-dim (`width:null`) candidates as sharp (`util.js:286`), and `pixabay_scrape`/`openverse` return null dims. Soft, low-res images go full-bleed at 1080p. **Fix:** hard min-long-edge reject with a "nothing else available" escape hatch.
13. **Videos never deduped** (`graph.js:344`, `pipeline.js:201` — images only). Same clip from two queries repeats in the montage. **Fix:** extend perceptual/URL dedup to video.
14. **Website section screenshots have no blankness/content check** (`ingest/website.js:186-202`); fixed page fractions 0.35/0.70 can land on whitespace and still reach a prominent device frame. **Fix:** content-density check + retry a nearby offset.
15. **Art Director overrides an explicit `{skip:true}`** when the top color is vivid (`art_director.js:180`). **Fix:** honor the model's skip.
16. **Director model ids dispatch with no boot validation** — CD/AD/Audio (`config.js:227,246,261`; `art_director.js:32`). A wrong/stale id makes all three silently no-op (fail-open). *Verified 2026-07-15: the configured `google/gemini-3.1-flash-lite` resolves on OpenRouter (343-model list), so it is valid today — but nothing catches a future typo.* **Fix (implemented):** `services/model_health.js` validates every configured director/stage model id against the provider's live model list at boot and logs a loud error for any that don't resolve.

### P2 — hygiene / maintainability
17. **`animationReport` dead channel** (`graph.js:712,722,817`) — the animation node is inert; QA can't gate on under-animation. Either wire it into QA or delete the node.
18. **`rendered` dead read** (`graph.js:729-732` empty `if`).
19. **`frame_selector` redundant** — `job.frame_pack` is pre-resolved at intake (`graph.js:110-112`), and the node never persists a divergent pick.
20. **Duplicated, drifted code** between `graph.js` and `project_pipeline.js` (`pickVoice`, SFX volume `0.22` vs `0.4`, screenshot pinning) — a latent inconsistency if `orchestrator` flips.
21. **Only five scene-kit archetypes** (`archetypeFor`, `scene_kit.js:1503-1512`: hook/cta/quote/stat/text). A text-heavy script leans on `archText` variants → adjacent-scene sameness risk. **Fix:** more archetypes + an anti-repetition rule (no two adjacent identical layouts).

---

## 5. Failure-mode analysis (per agent + fallback)

| Agent | Failure | Current behavior | Recommended fallback |
|---|---|---|---|
| Ingest (website) | site down / auth wall / blank capture | auth-wall suppressed (`website.js:152-185`); blank NOT caught | add content-density gate; proceed with stock-only |
| Brief/Script | LLM error / invalid JSON | retries internally, then throws → `markFailed` | deterministic template script from brief keyMessages |
| Storyboard | LLM error | **crashes the graph** (`graph.js:117-123`) | **P0: deterministic storyboard from `script`** |
| Asset search | no results / provider down | per-`acquire` `.catch` → fewer assets; film still renders | already fail-soft; add "text-only montage" archetype for zero-asset films |
| Creative Director | LLM error / bad `n` | fail-open, returns assets unreviewed (`creative_director.js:443`) | keep fail-open BUT apply the deterministic QC floor (§4.8) so junk still gates |
| Visual Layout Director | error | archetype-only plan (`graph.js:474`) | fine |
| Art Director | error / dull palette | default or skip (`art_director.js:184`) | fine (but honor skip, §4.15) |
| Voice/TTS | TTS fails / ad-libs | per-clip `.catch`→null; `vo_fit` atempo-fits overruns | keep; add re-read on >1.6× transcript bloat (currently atempo+trims → content loss) |
| Audio Director | LLM error | deterministic default plan (`audio_director.js:235`) | excellent — model this everywhere |
| Composition | render/compose fails | multi-tier: kept render → hybrid → deterministic template (`graph.js:645-705`) | strong; guard the final `buildFallback` throw |
| QA | vision error | fail-open **pass** (`graph.js:794-798`) | acceptable, but add a cheap deterministic pre-render gate so QA isn't the only net |
| Mixer | plan mix errors | falls back to basic mix (`audio_mix.js:60-63`) | excellent |

**Pattern:** the system is admirably fail-open **except** `storyboard_agent` and the tail of `composition`. Fix those two and the graph becomes end-to-end recoverable.

---

## 6. Quality-control architecture (layered gates, cheap → expensive)

Today QA is a single **post-render** vision pass (expensive, fail-open, no-op for deterministic composers). Replace with **five graded gates**, each emitting a 0–100 score and a hard floor; a video failing a floor is regenerated or rejected *before* burning the next stage.

```
Gate 0  SCRIPT     (deterministic, ~free)  — has a hook? a CTA? role variety? pacing within budget?
                                             no adjacent duplicate roles? VO within word-budget?
Gate 1  ASSET QC   (deterministic, cheap)  — min resolution, blankness, exact/perceptual dedup (incl. video)
Gate 2  CURATION   (CD vision, moderate)   — relevance + quality FLOOR (overall >= T); readability scored
Gate 3  PLAN       (deterministic, cheap)  — every scene has content; no empty halves; contrast/legibility;
                                             storyboard ids == script ids; captions present
Gate 4  RENDER QA  (vision, expensive)     — ONLY for LLM/non-deterministic composers; skip deterministic
```

Principles (from Pixar dailies / Figma design-lint / Stripe's "reject early"):
- **Reject at the cheapest stage that can detect the defect.** A low-res asset should die at Gate 1, not survive to a vision review of the final frame.
- **Every gate has a deterministic floor**, so quality never depends solely on an LLM boolean.
- **Determinism unlocks skipping.** If `(script, pack, assets, seed)` are unchanged, the render is reproducible — so re-QA/re-render is pointless (fixes §4.3).

---

## 7. Missing / recommended agents

**You already have a QA agent** — so the gap is not "add QA," it's "make QA layered and earlier" (§6). Net-new roles worth adding:

1. **Script Doctor (deterministic gate, not an LLM).** Enforce arc/hook/CTA/role-variety/pacing on the script schema (Gate 0). Cheapest possible quality lever; kills generic scripts before any asset spend.
2. **Asset QC gate (deterministic).** Resolution + blankness + dedup (incl. video) as a hard gate feeding the CD only survivors (Gate 1). Cuts CD vision cost and stops soft/low-res full-bleeds.
3. **Continuity/Consistency Director.** One authority that guarantees `script ↔ storyboard ↔ asset sceneIds ↔ captions` stay aligned — eliminating the double-generation drift (§4.10). Could be deterministic.
4. **Motion Planner (promote animation from audit → planner).** Emit a structured `{entry, emphasis, exit, camera, timing}` per archetype that composers consume and QA can inspect — instead of motion baked into HTML strings and an inert audit node (§4.17).

Do **not** add: a second curation agent, a second audio agent, or an LLM for layout (VLD is correctly pure-JS). The problem is boundaries and gates, not headcount.

---

## 8. Scalability analysis

**Per-video cost profile (today):** ~6–8 LLM calls (brief, script, storyboard, CD vision over N assets, art, audio, QA vision) + 4–15 asset downloads + **1–3 headless-Chrome renders** (compose+render, plus up to 2 repair laps) + ffmpeg encode + mix. The dominant cost is **headless-Chrome rendering** (CPU-bound, ~40–80 s each) and **CD vision** (scales with asset count).

| Throughput | Verdict | Primary bottleneck | Remedy |
|---|---|---|---|
| **10/day** | fine on one box | none | ship as-is after P0 fixes |
| **100/day** | needs a queue | render concurrency; repair loop doubling render (§4.3) | job queue (BullMQ/Redis) + fix repair no-op; cap concurrent renders to cores−1 |
| **1,000/day** | needs horizontal render | Chrome render throughput; CD vision cost/latency; synchronous downloads | **render worker pool** (N stateless workers pulling a queue), pre-warmed Chrome; **cache CD verdicts by asset dhash** (same asset → reuse score); shared asset cache in object storage (S3) not local disk; prompt caching on the fixed system prompts |
| **10,000/day** | full separation of tiers | everything above + storage/CDN + observability | API tier ⟂ LLM tier ⟂ **render farm** (autoscaled, GPU/SwiftShader-tuned) ⟂ object storage + CDN for assets & outputs; backpressure + per-tenant rate limits; **memoize renders on `hash(script,pack,assets,seed)`** (determinism makes this exact); regional asset providers |

**Highest-leverage scalability wins (all already latent in the codebase):**
- **Fix the repair no-op (§4.3)** — instantly removes up to ~2× render cost on QA-failed deterministic jobs. Biggest single throughput win.
- **Determinism → render memoization.** The whole pipeline is already seeded/deterministic; identical inputs can return a cached MP4.
- **CD verdict cache keyed on `dhash`** — the same stock image recurs across films; don't re-pay vision for it.
- **Move the asset cache off local disk** (`local_db.js`) to shared object storage so render workers scale horizontally.
- **Parallelism already exists** (the graph fan-out + `parallel` asset fetch) — the missing piece is a *queue + worker pool*, not more in-process concurrency.

---

## 9. Best-practice recommendations

- **Separation of concerns:** dissolve the three-way curation co-ownership (§2). CD decides *what*, VLD decides *how much/how big*, composer decides *where*. VLD must **not** flip `visionOk`; give it its own `layoutProminence` field instead of mutating the CD's.
- **Deterministic outputs:** you already have this (seeded PRNG, pure-`t` motion). Exploit it for caching and for skipping QA/repair on unchanged inputs.
- **Strict, typed contracts:** replace the untyped shared-state bag with zod-validated handoffs (§3b). Fail loudly at the boundary, not three nodes later.
- **Quality gates over hero-agents:** cheap deterministic gates (§6) beat one expensive fail-open vision pass.
- **Observability:** you have `UsageTracker` (cost) — add per-stage **quality telemetry** (gate scores, reject reasons, repair counts, asset-source hit rates) so regressions are visible. A "why did this video look generic?" trace should be one query.
- **Config health-checks:** a startup probe that the CD/AD/Audio model id resolves (§4.16) turns a silent no-op into a loud boot failure.
- **Single source of truth for scenes:** the user-approved script. Everything downstream derives from it deterministically; the storyboard becomes an enrichment, not a regeneration.
- **Template as a capability manifest** (§11): a pack should *declare* its layout family, motion language, density, and camera — so "template selection" provably changes more than color/fonts.

---

## 10. Agent scorecards

Scores 0–100 (architecture = boundaries/coupling; scalability = cost/parallelism; quality = output impact + gating; maintainability = clarity/duplication).

```json
[
  {"agent":"Brief","architectureScore":78,"scalabilityScore":85,"qualityScore":70,"maintainabilityScore":80,
   "recommendedChanges":["emit per-scene emotion/energy","feed keyMessages into a deterministic fallback script"]},
  {"agent":"Script","architectureScore":72,"scalabilityScore":85,"qualityScore":58,"maintainabilityScore":68,
   "recommendedChanges":["fix 15-vs-12 duration clamp (P0)","enum `role` (was `purpose`)","add Gate-0 arc/hook/CTA/variety validation","structured motionHints/audioHints"]},
  {"agent":"Frame Selector","architectureScore":55,"scalabilityScore":95,"qualityScore":60,"maintainabilityScore":60,
   "recommendedChanges":["remove dead brief/rotation branches or make them real","persist the resolved pack"]},
  {"agent":"Storyboard","architectureScore":50,"scalabilityScore":70,"qualityScore":62,"maintainabilityScore":55,
   "recommendedChanges":["add deterministic fallback (P0)","become a transform of the approved script, not a regeneration","stop choosing a palette the composer discards"]},
  {"agent":"Scene Planner","architectureScore":75,"scalabilityScore":95,"qualityScore":65,"maintainabilityScore":78,
   "recommendedChanges":["document the in-place storyboard mutation"]},
  {"agent":"Asset Planner","architectureScore":60,"scalabilityScore":88,"qualityScore":66,"maintainabilityScore":65,
   "recommendedChanges":["consume enum `role` not string-match","move icon-injection policy into the script's assetNeeds"]},
  {"agent":"Asset Search + Vision/CLIP","architectureScore":68,"scalabilityScore":72,"qualityScore":64,"maintainabilityScore":66,
   "recommendedChanges":["hard min-resolution + blankness gate","dedup video","propagate dominantColor/dhash","fix cache-source gate bypass","cache CD verdicts by dhash"]},
  {"agent":"Creative Director","architectureScore":58,"scalabilityScore":55,"qualityScore":60,"maintainabilityScore":62,
   "recommendedChanges":["quality FLOOR (P1)","add readability + true brandAlignment; drop redundant template dim","fix 12-scene blindness (P0)","fix `n`-keying (P0)","stop doing audio judgment + acquisition"]},
  {"agent":"Visual Layout Director","architectureScore":66,"scalabilityScore":95,"qualityScore":70,"maintainabilityScore":72,
   "recommendedChanges":["stop overriding CD's visionOk — use own layoutProminence field","expose placement as an inspectable plan"]},
  {"agent":"Art Director","architectureScore":80,"scalabilityScore":88,"qualityScore":72,"maintainabilityScore":82,
   "recommendedChanges":["honor explicit skip","arbitrate the accent slot vs pack tokens/storyboard palette"]},
  {"agent":"Voice Agent","architectureScore":70,"scalabilityScore":72,"qualityScore":74,"maintainabilityScore":68,
   "recommendedChanges":["move mix-timing nudges into the Audio Director","re-read on transcript bloat instead of atempo+trim"]},
  {"agent":"Audio Director","architectureScore":88,"scalabilityScore":80,"qualityScore":84,"maintainabilityScore":86,
   "recommendedChanges":["reference model — replicate its plan/execute + fail-open-default pattern elsewhere"]},
  {"agent":"Composition (scene_kit)","architectureScore":64,"scalabilityScore":48,"qualityScore":72,"maintainabilityScore":55,
   "recommendedChanges":["expose placement+motion as a ScenePlan (inspectable)","more archetypes + anti-repetition rule","split the 1,783-line file"]},
  {"agent":"Animation (node)","architectureScore":30,"scalabilityScore":95,"qualityScore":25,"maintainabilityScore":40,
   "recommendedChanges":["promote to a real Motion Planner OR wire animationReport into QA OR delete the node"]},
  {"agent":"Timeline","architectureScore":82,"scalabilityScore":80,"qualityScore":78,"maintainabilityScore":80,
   "recommendedChanges":["own captions solely (composition shouldn't pre-bake cues)"]},
  {"agent":"QA Agent","architectureScore":60,"scalabilityScore":45,"qualityScore":66,"maintainabilityScore":70,
   "recommendedChanges":["skip for deterministic composers (P0 waste)","add cheap deterministic pre-render gates","don't be the only net"]},
  {"agent":"Rendering Engine","architectureScore":85,"scalabilityScore":40,"qualityScore":80,"maintainabilityScore":78,
   "recommendedChanges":["render worker pool + queue","memoize on hash(script,pack,assets,seed)","pre-warm Chrome"]}
]
```

**Lowest scores → highest priority:** Animation node (inert), Rendering scalability (single-box), CD scalability+quality (per-asset vision, no floor), Composition maintainability (monolith), Storyboard architecture (redundant regeneration).

---

## 11. Optimized future-state pipeline

```
User input
  │
  ▼
BRIEF ──▶ SCRIPT ──▶ [Gate 0: Script Doctor — arc/hook/CTA/variety/pacing]   ◀── single source of truth
  │                         (deterministic; regenerate on floor-fail)
  ▼  (user approves the SCRIPT)
FRAME/TEMPLATE SELECT  (pack = capability manifest: layout family, motion language, density, camera)
  │
  ├─▶ ASSET SEARCH ──▶ [Gate 1: Asset QC — resolution/blank/dedup incl. video]  (deterministic, cheap)
  │                         │
  │                         ▼
  │                    CREATIVE DIRECTOR (relevance + quality FLOOR + readability + brandAlignment)
  │                         │   scores cached by dhash
  │                         ▼
  ├─▶ ART DIRECTOR (accent brand skin)      VISUAL LAYOUT DIRECTOR (size/reduce/crop/device)
  │                         └──────────────┬──────────────┘
  │                                        ▼
  │                        CONTINUITY DIRECTOR  (script ↔ assets ↔ captions aligned)
  │                                        ▼
  ├─▶ VOICE (TTS + vo_fit)      MOTION PLANNER (structured entry/emphasis/exit/camera per archetype)
  │        │                               │
  │        ▼                               ▼
  │   AUDIO DIRECTOR (LUFS/duck/SFX plan)   COMPOSER (template-specific layout + placement + motion)
  │        │                               │
  │        │                    [Gate 3: Plan QA — no empty scenes, contrast, ids match]  (deterministic)
  │        │                               ▼
  │        └──────────────▶ RENDER (worker pool; memoize on hash) ──▶ MIX (broadcast chain)
  │                                        ▼
  │                    [Gate 4: Render QA — vision, ONLY for non-deterministic composers]
  │                                        ▼
  │                                    PUBLISH (+ quality telemetry)
```

Key differences from today: the **script** (not a regenerated storyboard) is the source of truth; **four graded gates** replace one post-render vision pass; **placement + motion are inspectable plans**, not baked HTML; **curation ownership is single**; **render is a memoizable worker pool**; **template is a capability manifest** so selection provably changes layout/motion, not just color.

---

## 12. Updated agent specifications (the load-bearing ones)

**Script (Act 1).** Emits `SceneSpec[]` (§3b) with enum `role`, per-scene `emotion`/`energy`, structured `motionHints`/`audioHints`. `normalizeScript` clamp == schema max. A deterministic Gate-0 validates arc/hook/CTA/variety/pacing and triggers one regeneration on floor-fail. It is the only place scenes are authored.

**Storyboard → Continuity transform.** No longer a free LLM regeneration. Deterministically maps approved `SceneSpec[]` → render scenes, preserving ids/count/timing; the LLM (if used) only *enriches* motion within the pack's declared vocabulary. A Continuity check asserts `storyboard.ids === script.ids`.

**Creative Director.** Scores `{relevance, visualQuality, readability, storytelling, motionPotential, templateCompat, brandAlignment}`, weighted (relevance + readability up-weighted). Hard floor `overall >= T` gates prominence. Sees ALL scenes (page the digest). Verdicts fall back to array order when `n` is missing. Does **not** fetch assets or judge audio. Scores cached by `dhash`.

**Visual Layout Director.** Owns size/reduction/crop/device only, via its own `layoutProminence` field — never mutates the CD's `visionOk`. Emits an inspectable placement plan (grid/focal/hero fraction) for Gate 3.

**Audio Director.** Keep as-is — it is the reference implementation (plan → deterministic mixer, fail-open default, LUFS/duck/limiter). Absorb the voice_agent's mix-timing nudges.

**Composition.** Consumes a `ScenePlan` (placement + motion) instead of deciding both inline; more archetypes + an anti-repetition rule (no two adjacent identical layouts). Split the 1,783-line file by concern (theme / background / archetypes / motion / weaving).

**QA.** Layered (Gates 0–4); Gate 4 vision runs only for non-deterministic composers; deterministic scene-kit skips render-QA and repair entirely.

---

## 13. Production-ready roadmap

**Phase 0 — Stop the bleeding (days, low-risk).** P0 bugs only:
- `script.js` duration clamp 15→12 (§4.1).
- Skip QA/repair for deterministic scene-kit (§4.3) — also the biggest throughput win.
- Deterministic storyboard fallback (§4.4).
- CD `slice(0,12)` → schema max, and `n`-keying fallback (§4.2, §4.5).
- Boot model health-check (§4.16) — validates all director/stage model ids against the provider's live list at startup. (The configured `gemini-3.1-flash-lite` was verified valid; the check guards against future typos/staleness.)

**Phase 1 — Quality floors (1–2 weeks).**
- Gate 1 Asset QC: min-resolution + blankness + video dedup; propagate `dominantColor`/`dhash`; fix cache-source gate bypass (§4.6, §4.11, §4.12, §4.13).
- CD quality floor + readability + true brandAlignment (§4.8, §4.9).
- Gate 0 Script Doctor (deterministic arc/hook/CTA/variety).

**Phase 2 — Contracts & single source of truth (2–4 weeks).**
- zod-typed handoffs (§3b); enum `role`; drop storyboard regeneration in favor of a deterministic transform + Continuity check (§4.7, §4.10).
- Single curation ownership: VLD gets `layoutProminence`, stops flipping `visionOk` (§2).
- Promote animation to a Motion Planner or wire `animationReport` into QA (§4.17); delete `rendered` dead read.

**Phase 3 — Template depth & placement plans (3–4 weeks).**
- Pack capability manifest (layout family / motion language / density / camera); make selection change layout, not just theme (§9, §11).
- Inspectable `ScenePlan`; Gate 3 Plan QA (empty-scene / contrast / id-match).
- More scene-kit archetypes + anti-repetition.

**Phase 4 — Scale (ongoing).**
- Job queue + stateless render worker pool; pre-warmed Chrome.
- Render memoization on `hash(script,pack,assets,seed)`; CD verdict cache by `dhash`.
- Asset cache → object storage + CDN; per-stage quality telemetry alongside `UsageTracker`.

---

*Generated 2026-07-15 on branch `Rohit`. Every claim is traceable to a `file:line` in the sections above.*
