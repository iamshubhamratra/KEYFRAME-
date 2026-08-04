# KEYFRAME — Multi-Agent System Audit (2026-07-28)

> Full engineering review of every agent in the video-generation pipeline: responsibility,
> inputs, outputs, decision quality, communication, error handling, performance.
> **Every claim in this document was read out of the live code on branch `Rohit` and is
> cited `file:line`.** Nothing is inherited from the previous audit without re-verification.
>
> Supersedes `AGENT-ARCHITECTURE-AUDIT.md` (2026-07-15). §2 records exactly which of that
> document's findings are now closed and which are still open — several were reported fixed
> but are still live in the code.

---

## 0. Executive summary

The system is **architecturally sound and unusually disciplined about failing open**. Nearly
every agent degrades to a deterministic default rather than blocking a render, disclosures are
persisted per stage, and the tier law (`asset_priority.js`) is a genuinely good piece of
domain modelling — one file that makes "whose pixels matter more" arithmetic instead of
scattered special-cases.

The weaknesses are **not in the agents individually — they are in the handoffs.** Six of the
eight highest-severity findings below are cases where an agent computes something correctly
and the next agent never receives it:

| The pattern | Instances |
|---|---|
| A field is computed, then dropped at the boundary | `dominantColor`, `dhash`, `ratio` (cache path), `model`/`provider` on 4 stages |
| An agent is given less context than its own prompt asks for | Storyboard runs **pack-blind** on both live paths |
| Two agents disagree about what a value means | `job.frame_pack` means "user's pick" to the Frame Selector and "brief's suggestion" to intake |
| One agent's output is persisted and read by nobody | CD's `musicAnalysis` / `soundEffectAnalysis` (a paid LLM call) |
| Two sources of truth for the same fact | approved **script** timings vs regenerated **storyboard** timings |

**Top 3 by impact on final video quality:**

1. **C1 — Frame Selector treats the brief's suggestion as an explicit user choice** → the
   anti-repeat pack rotation is dead code, and non-Latin films are *never* rerouted off
   canvas/charset packs (they ship with broken or English on-screen text plus a disclosure
   telling the user they chose the template — they didn't).
2. **H2 — the Storyboard agent never receives the frame pack** on either live path, so the
   "design each scene for THIS design system, keep adjacent scenes visually distinct"
   instruction in its own prompt never fires. This is the direct upstream cause of the
   "groundhog set" defect the QA agent is explicitly told to catch (`qa_agent.js:87`).
3. **H5 — the Creative Director has no quality floor.** It computes a 0–100 `overall` and
   then never compares it to anything. Approval is a pure LLM boolean, so an asset scored 20
   ships exactly like one scored 95.

**Scoring distribution** (details in §4): 2 agents ≥ 8.5 (Audio Director, Language Director),
11 in the 7.0–8.4 band, 4 below 7.0 (Creative Director 6.6, Storyboard 5.5, Frame Selector
4.5, Animation 4.0). No agent is above 9 today; §7 lists what each one specifically needs to
get there.

---

## 1. Verified architecture (as-built)

### 1.1 Runners

| Runner | Entry | Status |
|---|---|---|
| Project pipeline (intake) | `project_pipeline.runIntake` | **LIVE** — every `/api/projects` job |
| Agent graph (production) | `agents/graph.runProductionGraph` | **LIVE** — `config.orchestrator === "langgraph"` (`config.example.json:88`), dispatched at `server.js:47` |
| Project pipeline (production) | `project_pipeline.runProduction` | fallback path only — reachable if `orchestrator` flips |
| Classic 4-tier | `pipeline.runJob` | legacy `/api/generate`; no UI posts to it |

**Consequence already visible:** `project_pipeline.runProduction` has drifted from the graph.
It has no storyboard fallback (`project_pipeline.js:609` — an LLM failure kills the job,
whereas `graph.js:262` recovers), it drops asset dimensions entirely
(`project_pipeline.js:483-491`), and it runs no Art Director / Visual Layout Director. If
`orchestrator` is ever flipped, quality drops silently.

### 1.2 The production graph, as registered (`graph.js:1609-1684`)

```
START → frame_selector ─┬→ storyboard_agent → scene_planner ─────────────┐
                        ├→ asset_planner → asset_search ─────────────────┤
                        │                                     (join) → creative_director
                        │                                                  ↓
                        │                                        visual_layout_director
                        ├→ caption_director → voice_agent                  ↓
                        │        └──────────────────(join)→ localization_director
                        └→ art_director ───────────────────(join)──────────┤
                                                                            ↓
                                                                       composition
                                                                            ↓
                                                                        animation
                                        voice_agent ──(join)──→ audio_director
                                                                            ↓
                                                                        timeline
                                                                            ↓
                                                    qa_agent ──fail&repairable──→ repair ⤴
                                                        └──pass/exhausted──→ END
```

### 1.3 Mapping the requested pipeline to the code

| Requested stage | Real implementation | Kind |
|---|---|---|
| Prompt Analysis | `brief.js` | LLM |
| Script Generation | `script.js` (+ user-editable checkpoint) | LLM |
| Website Analysis | `ingest/website.js` → `screenshot_intake.js` → `website_assets.js` | headless Chrome + deterministic |
| Asset Collection | `asset_planner` node → `asset_search` node → `asset_sources/*` | JS + providers |
| Asset Intelligence | **not a separate agent** — split across `asset_priority.js` (tiering), `asset_clip.js` (CLIP), `creative_director.js` (categorize/confidence) | mixed |
| Creative Director | `creative_director.js` | vision LLM |
| Scene Planning | **split**: `storyboard_agent` (LLM, regenerates) + `scene_planner` (JS, derives beats) | mixed |
| Template Selection | `frame_selector` node + `pipeline.rendererFor` | JS |
| Brand Colour | `art_director.js` (+ `brand_kit.js`, `brand_coverage.js`) | LLM + JS |
| Language | `language_director.js` → `caption_director.js` → `localization_director` node | deterministic + LLM |
| Asset Placement | **not an agent** — `visual_layout_director.js` decides presentation; actual DOM placement is inside `scene_kit.buildComposition` and each native composer | JS |
| Animation Planning | **not a planner** — the `animation` node is a regex audit (`graph.js:1404`); motion is emitted inside the composers | JS |
| Audio Director | `audio_director.js` → `audio_mix.js` | LLM + ffmpeg |
| Caption Generation | `caption_director.js` + `captions.js` + `caption_render.js` | LLM + JS |
| Rendering | `renderer.js` (headless Chrome) + `audio_mix.js` | deterministic |
| *(extra, not in the brief)* | `preflight.js` (pre-render gate), `qa_agent.js` (post-render vision) | JS + vision LLM |

**Two structural truths:** placement and animation are *not* inspectable plans — they are baked
HTML/GSAP strings, which is why the only check on them is an expensive post-render vision pass.
And scene planning happens **twice** (script, then a regenerated storyboard) with no
consistency gate between them (H3).

---

## 2. Status of the 2026-07-15 audit (differential)

Verified line-by-line this pass. The last commit (`874864c`) closed several items; three that
the roadmap listed as Phase-1 are still untouched.

| # | Prior finding | Status now | Evidence |
|---|---|---|---|
| 1 | `normalizeScript` clamp 15 vs schema 12 | ✅ **CLOSED** | `script.js:92` clamps to 12 |
| 2 | CD blind past scene 12 | ✅ **CLOSED** | `creative_director.js:71` → `slice(0,24)` |
| 3 | QA repair no-op on deterministic composer | ✅ **CLOSED** | `graph.js:1671` gates the repair edge on `repairable`; verdict still recorded |
| 4 | `storyboard_agent` had no fallback | ⚠️ **PARTIAL** | fixed in `graph.js:262-274`; **still fail-closed** in `project_pipeline.js:609` |
| 5 | CD verdicts dropped on mis-numbered `n` | ✅ **CLOSED** | `creative_director.js:167-171` falls back to array position |
| 6 | `dominantColor` dropped before its consumer | ❌ **STILL OPEN** | computed `util.js:224`, returned `index.js:223`, **omitted** at `graph.js:609-615`; consumer `scene_kit.js:1257` still reads neutral |
| 7 | `purpose` free text vs exact-match switch | ❌ **STILL OPEN** | `script.js:27` unconstrained vs `graph.js:324` |
| 8 | No CD quality floor | ❌ **STILL OPEN** | `overall` computed `creative_director.js:106`, never compared |
| 9 | Redundant/missing CD dimensions | ❌ **STILL OPEN** | `SCORE_KEYS` `creative_director.js:100` still has `brandCompat`+`templateCompat`, no readability |
| 10 | Script↔storyboard double generation | ❌ **STILL OPEN** | and now measurably worse — see H3 |
| 11 | Cached stock bypasses the fallback vision gate | ✅ **CLOSED** (CD path) / ⚠️ open (gate path) | `creative_director.js:44` uses `includes()`; `graph.js:622` still uses an exact `Set` — only matters when `CREATIVE_DIRECTOR=0` |
| 12 | No minimum-resolution reject | ⚠️ **PARTIAL** | `MIN_LONG_EDGE=900` soft-filter at rank time (`util.js:296`); `validateImage` still has no dimension gate, and cache hits skip it entirely |
| 13 | Videos never deduped | ❌ **STILL OPEN** | `graph.js:600` — `if (!isVideo)` |
| 15 | Art Director overrode explicit `{skip:true}` | ✅ **CLOSED** | `art_director.js:267` restricts the override to extracted/logo provenance |
| 16 | No boot validation of director model ids | ✅ **CLOSED** | `model_health.js`, wired at `server.js:143` |
| 17 | `animationReport` dead channel | ✅ **CLOSED** | persisted `graph.js:1427`, fed to QA `graph.js:1572` |

---

## 3. Communication contract map (what actually crosses each boundary)

All graph channels are bare `Annotation()` (last-value overwrite, untyped) — `graph.js:1594-1605`.

| Channel | Producer | Consumers | Defect found |
|---|---|---|---|
| `job` | init | ~every node | `frame_pack` is **overwritten at intake** with the brief's suggestion → C1 |
| `script` | init (user-approved) | assets, voice, captions, QA, preflight | the real source of truth, but composition does not use its timings |
| `storyboard` | storyboard_agent, mutated in place by scene_planner + localization_director | CD, VLD, AD, composition, animation | regenerated, `[2,15]`-clamped, no id/count/timing check vs script → H3 |
| `assets` | asset_search, **CD**, **VLD** (three co-mutators) | composition | `dominantColor`/`dhash` never attached (H6); `visionOk` written by 2 agents (L18) |
| `brandSkin` | art_director | composition → `resolvedBrand` back | clean; the return trip via `persistWornBrand` is a good pattern |
| `layoutPlan` | visual_layout_director | scene-kit only (by contract) | clean |
| `captionPlan` | caption_director | voice, localization, composition, timeline | clean |
| `voClips/sfxClips/musicPath` | voice_agent | audio_director, timeline | clean |
| `audioPlan` | audio_director | timeline → `audio_mix` | clean — the reference handoff |
| `animationReport` | animation | QA (as "confirm or dismiss") | now wired; heuristic may misfire on canvas packs (L19) |
| `qa`/`qaAttempts` | qa_agent | conditional edge, composition | `qa` still doubles as the "we are repairing" flag (`graph.js:1268`) |
| **out-of-band** | `creative_review`, `audio_review`, `brand_review`, `layout_review`, `validation_report` → DB | UI only | CD's audio opinion reaches **no agent** (M7) |

---

## 4. Agent report cards

Scoring is deliberately hard. `★` = 1 point out of 10 on each axis; **Overall** is the mean.
Where an agent was audited from its call sites plus an outline rather than a full line-by-line
read, it is marked **(coverage: partial)** and scored conservatively.

---

### 4.1 Brief Agent — `services/brief.js`

**Purpose** ★★★★★★★★★☆ · **Architecture** ★★★★★★★☆☆☆ · **Decision Quality** ★★★★★★★☆☆☆
**Reliability** ★★★★★☆☆☆☆☆ · **Performance** ★★★★★★★★☆☆ · **Maintainability** ★★★★★★★★☆☆
**Communication** ★★★★★★☆☆☆☆ → **Overall 7.0 / 10**

- **Strengths.** Zod-validated with a repair re-ask (`:93-139`). The *brand-colour evidence
  gate* (`:116-125`) is excellent engineering judgment: the schema can only validate hex
  *shape*, so invented palettes are filtered against what the site actually showed — the model
  is not trusted to obey rule 3 of its own prompt. Pack suggestions are informed by real
  manifest vibes (`:74-78`) and rotated against recent jobs (`:54-64`).
- **Weaknesses.** No deterministic fallback: two invalid replies throw and the job is marked
  failed (`:142`), even though a usable film could be built from the raw prompt. Returns no
  `model`/`provider` (`:134`) → the caller prices its tokens at the wrong rate (H4).
- **Risks.** `recentlyUsedPacks()` reads `j.framePack`, which the Frame Selector's resolution
  never writes back — so rotation is informed by intake's guess, not by what was rendered.
- **Fix.** Deterministic brief from `intent` (subject = prompt, tone = "clear and confident",
  keyMessages = split sentences) on double failure; return `model`/`provider`.

---

### 4.2 Script Agent — `services/script.js`

**Purpose** ★★★★★★★★★★ · **Architecture** ★★★★★★★★☆☆ · **Decision Quality** ★★★★★★★☆☆☆
**Reliability** ★★★★★☆☆☆☆☆ · **Performance** ★★★★★★★★☆☆ · **Maintainability** ★★★★★★★★☆☆
**Communication** ★★★★★★☆☆☆☆ → **Overall 7.1 / 10**

- **Strengths.** The only user-editable checkpoint, and the validator is now genuinely
  editorial rather than arithmetic: silent scenes, text-less scenes, single-line long holds,
  and a missing CTA are all warned (`:140-161`). `normalizeScript` redistributes drift across
  scenes within the schema's own bounds (`:82-100`) — the self-invalidation bug is fixed.
  Attempt 2 escalates to a stronger model (`:203`).
- **Weaknesses.** `purpose` is `z.string().min(2).max(24)` (`:27`) but four downstream sites
  switch on **exact strings** (`graph.js:324`, `project_pipeline.js:388`,
  `asset_taxonomy.kindForPurpose`, `storyboardFromScript` regexes). A model emitting
  `"benefit"` or `"demo"` silently unpins every screenshot. No fallback on double failure.
- **Risks.** The editorial warnings are *warnings* — nothing regenerates on them, so a script
  with three text-less scenes proceeds to burn the full asset + render budget.
- **Fix.** Enum the `purpose` field (`hook|context|feature|proof|how|quote|cta`) with a
  coercion map for near-misses; promote the content checks into a Gate-0 that triggers one
  regeneration before assets are fetched.

---

### 4.3 Language Director — `services/language_director.js`

**Purpose** ★★★★★★★★★☆ · **Architecture** ★★★★★★★★★☆ · **Decision Quality** ★★★★★★★★☆☆
**Reliability** ★★★★★★★★★☆ · **Performance** ★★★★★★★★★★ · **Maintainability** ★★★★★★★★★☆
**Communication** ★★★★★★★★☆☆ → **Overall 8.8 / 10**

- **Strengths.** The correct answer to "three config resolutions that could disagree":
  deterministic, zero-latency, resolved once at intake and persisted, with `getPlan()` as the
  single accessor plus on-the-fly back-compat (`:145-148`). It *reuses* the existing engines
  rather than reimplementing them. The glossary is deliberately rebuilt after the brief exists
  (`project_pipeline.js:311-317`) so the brand is protected and not mis-flagged as leakage —
  a subtle ordering problem, handled. `runLanguageQa` is honest about what it cannot see
  (canvas text is stripped, `:180`).
- **Weaknesses.** `CHROME_LITERALS` (`:168`) is a hand-maintained denylist that will drift as
  packs are added. The leakage score is char-ratio based and will read 0% on a film whose only
  Latin is a long CTA.
- **Risks.** Gated by `config.languageDirector.enabled` at intake; when off, three independent
  resolutions return — the exact state this agent was built to end.
- **Fix.** Derive `CHROME_LITERALS` from the packs' `STRINGS` tables instead of a constant.

---

### 4.4 Website Ingest — `services/ingest/website.js` *(coverage: partial — read via its call sites and exports)*

**Purpose** ★★★★★★★★★☆ · **Architecture** ★★★★★★★☆☆☆ · **Decision Quality** ★★★★★★★☆☆☆
**Reliability** ★★★★★★★☆☆☆ · **Performance** ★★★★★★☆☆☆☆ · **Maintainability** ★★★★★★★☆☆☆
**Communication** ★★★★★★★★☆☆ → **Overall 7.3 / 10 (provisional)**

- **Strengths.** Emits capture *records* with DOM-truth quality signals (`clean`, `kind`,
  `heading`, `obstructions`, `maxCoveragePct`, `contentScore`) rather than bare paths — that
  metadata is what makes the intake gate possible at all. Auth-wall detection is disclosed
  rather than silently producing stock (`project_pipeline.js:162`).
- **Weaknesses.** It is a single 346-line function region; the timeout is one flat
  `websiteTimeoutMs` for capture + harvest + palette.
- **Risks.** Documented history of silent disablement (SSRF pin vs Node 20 `autoSelectFamily`,
  poisoned harvest cache, `networkidle2`). A per-run "harvester reached the network: yes/no"
  telemetry line would make the next such regression visible in one log grep.

---

### 4.5 Screenshot Intake — `services/screenshot_intake.js`

**Purpose** ★★★★★★★★★☆ · **Architecture** ★★★★★★★★★☆ · **Decision Quality** ★★★★★★★★★☆
**Reliability** ★★★★★★★★★☆ · **Performance** ★★★★★★★★☆☆ · **Maintainability** ★★★★★★★★★☆
**Communication** ★★★★★★★★★☆ → **Overall 8.9 / 10**

- **Strengths.** The best-reasoned module in the repo. It states why there is deliberately no
  LLM here (`:12-18`), rejects obstruction as a *hard* drop with an argued rationale (`:79-88`),
  and uses sharpness **only relatively** within a duplicate group because an absolute blur
  floor would false-reject clean minimal captures (`:33-37`) — that is a measured decision, not
  a guess. The injectable shared deduper (`:49-53`) lets harvested assets cross-dedup against
  kept screenshots.
- **Weaknesses.** `strength()` weights stdev and a bounded sharpness term with hand-tuned
  constants and no fixture proving the ordering; `scripts/test-screenshot-intake.js` exists but
  should assert the tie-break direction explicitly.
- **Risks.** None material. This is the model the other deterministic gates should copy.

---

### 4.6 Website Asset Harvester — `services/website_assets.js` *(coverage: partial)*

**Purpose** ★★★★★★★★☆☆ · **Architecture** ★★★★★★★★☆☆ · **Decision Quality** ★★★★★★★☆☆☆
**Reliability** ★★★★★★★★☆☆ · **Performance** ★★★★★★★☆☆☆ · **Maintainability** ★★★★★★★☆☆☆
**Communication** ★★★★★★★★☆☆ → **Overall 7.7 / 10 (provisional)**

- **Strengths.** Correct precedence handling: an uploaded logo always beats a harvested one
  (`project_pipeline.js:215-218`), and the CSS-computed palette leads the extracted tier but is
  capped at 3 so the hero-screenshot signal always survives the `slice(0,4)`
  (`project_pipeline.js:184-188`) — that cap is a real insight about which signal lies more.
- **Weaknesses.** `pinWebsiteAssets` is called with different budgets and different reservation
  order in the two pipelines; the comment at `project_pipeline.js:420-424` documents the
  tier-inversion fix, which is exactly the kind of thing that should be a shared function, not
  a comment in two files.

---

### 4.7 User Asset Classifier — `services/user_assets.js` *(coverage: partial)*

**Purpose** ★★★★★★★★★☆ · **Architecture** ★★★★★★★★☆☆ · **Decision Quality** ★★★★★★★☆☆☆
**Reliability** ★★★★★★★★☆☆ · **Performance** ★★★★★★★★☆☆ · **Maintainability** ★★★★★★★☆☆☆
**Communication** ★★★★★★★★☆☆ → **Overall 8.0 / 10 (provisional)**

- **Strengths.** Runs in parallel with ingest and lands before the brief so the script can plan
  around real inventory (`project_pipeline.js:98-101`). Deliberately kept **outside** the
  `__ingested` cache gate so a transient classification failure retries on regenerate
  (`:95-97`) — a genuinely subtle correctness call. Reports `model`/`provider` correctly.
- **Weaknesses.** `defaultClassification` fallback quality unverified in this pass.

---

### 4.8 Frame Selector — `agents/graph.js:204-253`

**Purpose** ★★★★★★★☆☆☆ · **Architecture** ★★★☆☆☆☆☆☆☆ · **Decision Quality** ★★★☆☆☆☆☆☆☆
**Reliability** ★★★★★★☆☆☆☆ · **Performance** ★★★★★★★★★★ · **Maintainability** ★★★★☆☆☆☆☆☆
**Communication** ★★★☆☆☆☆☆☆☆ → **Overall 4.5 / 10**

- **Strengths.** The intent is right: explicit pick → brief suggestion → anti-repeat rotation →
  default, plus localization-aware rerouting off canvas/charset packs. The code is well
  commented and the pack-capability question (`isCanvasOrCharsetPack`) is asked from the
  manifest, not a hardcoded list of names.
- **Weaknesses (this is finding C1).** The agent asks `s.job.frame_pack` and treats any
  non-`"auto"` value as an *explicit user choice* (`:211-214`). But intake has already
  **overwritten that column** with the brief's suggestion —
  `db.markScriptReview(..., framePack: brief.suggestedFramePack)` (`project_pipeline.js:332`)
  → `db.js:274`. So by production time, an auto job is indistinguishable from a hand-picked
  one. Two branches die as a result:
  - `rotatedDefaultPack()` (`:192-202`) can never run → the deterministic anti-repeat is dead.
  - The localization reroute takes the `via === "user"` branch (`:238-241`) → a Hindi/Arabic
    film on `flagship`/`terminal-departures` **is not swapped to a clean pack**; it ships
    broken or English on-screen text plus a disclosure telling the user their template choice
    caused it. They never made that choice.
- **Also.** The node never persists its resolution (`db.setFramePack` is called only by the
  legacy `pipeline.js:1215`), so a divergent pick would not reach the gallery or the rotation
  history.
- **Fix.** Read the user's real intent from `job.intent.preferences.framePack` (which *is*
  preserved verbatim at create, `routes/projects.js:373-378`), and persist the resolved pack.
  ~10 lines; unblocks two dead features and one shipped-defect class.

---

### 4.9 Storyboard Agent — `services/storyboard.js` + `graph.js:255-275`

**Purpose** ★★★★★★☆☆☆☆ · **Architecture** ★★★★☆☆☆☆☆☆ · **Decision Quality** ★★★★★☆☆☆☆☆
**Reliability** ★★★★★★★☆☆☆ · **Performance** ★★★★★★☆☆☆☆ · **Maintainability** ★★★★★★☆☆☆☆
**Communication** ★★★★☆☆☆☆☆☆ → **Overall 5.5 / 10**

- **Strengths.** `normalizeTimeline` (`:60-98`) repairs mechanical arithmetic before validating,
  so the model is only retried for genuine content problems — good separation. Beats are
  sanitized rather than rejected (`:130-139`). The graph now has a deterministic
  script-derived fallback (`graph.js:105-152`) that preserves the user's approved structure.
- **Weaknesses.**
  - **H2 — it runs pack-blind.** `buildUser` has a whole branch that tells the model to design
    for the selected design system and keep adjacent scenes distinct (`:39-41`), and **neither
    live caller passes `framePack`** (`graph.js:259`, `project_pipeline.js:609`). Only the dead
    legacy path does (`pipeline.js:1232`). The single instruction most likely to prevent the
    "same set every scene" defect is switched off in production.
  - **H3 — it re-decides timing the user already approved.** It clamps to `[2,15]` and
    *rescales every duration* to hit the target (`:67-73`), while the approved script's schema
    is `[1,12]`. Any script scene under 2s, or any rounding, shifts the picture off the audio.
    VO, SFX, captions and QA sampling are all keyed to **script** timings; the composition is
    keyed to **storyboard** timings. Nothing asserts they match.
  - Returns no `model`/`provider` (`:184`) → mispriced (H4).
- **Risks.** `noOpenRouterFallbackStages` includes `storyboard` (`openrouter.js:275`), so with
  KIE down **every** film silently uses the deterministic fallback (no motifs, no emphasis, no
  model-authored beats). Nothing discloses that on the job.
- **Fix.** Pass `framePack`; assert `storyboard.scenes[i].id/start/duration === script`, and on
  mismatch adopt the script's timings verbatim; disclose fallback use.

---

### 4.10 Scene Planner — `graph.js:280-295`

**Purpose** ★★★★★★★☆☆☆ · **Architecture** ★★★★★★★☆☆☆ · **Decision Quality** ★★★★★☆☆☆☆☆
**Reliability** ★★★★★★★★★☆ · **Performance** ★★★★★★★★★★ · **Maintainability** ★★★★★★★★☆☆
**Communication** ★★★★★★☆☆☆☆ → **Overall 7.0 / 10**

- **Strengths.** Guarantees the invariant it exists for (every scene has beats), deterministic,
  cannot fail.
- **Weaknesses.** The derived beats are the *same three* regardless of scene kind, duration or
  archetype (`:285-289`) — a 2s hook and a 12s data scene get identical beat structure. It
  mutates the storyboard in place, which is fine but undocumented in the channel contract.
- **Fix.** Derive beat count from duration and beat *actions* from `scene.kind`; it is pure JS
  and would measurably improve motion variety at zero cost.

---

### 4.11 Asset Planner — `graph.js:301-467`

**Purpose** ★★★★★★★★☆☆ · **Architecture** ★★★★★★☆☆☆☆ · **Decision Quality** ★★★★★★★★☆☆
**Reliability** ★★★★★★★★☆☆ · **Performance** ★★★★★★★★★☆ · **Maintainability** ★★★★★★☆☆☆☆
**Communication** ★★★★★★★☆☆☆ → **Overall 7.4 / 10**

- **Strengths.** The duration-adaptive budget (`asset_budget.js`) replaced fixed caps that
  starved long films. `packAcceptsVectors` gating (`:399-408`) is exactly right: it stops
  requesting assets the chosen composer would discard at its `.svg → return false` gate, and
  spends the slot on a second photo instead — the fix is aimed at the *outcome* ("never leave a
  scene with nothing"), not the mechanism. Purpose→kind routing via `asset_taxonomy` (`:372`).
- **Weaknesses.** Showcase-scene selection is an exact string match on `purpose`
  (`:324`) — see M15. The node authors search queries from `visualDirection` (`:350-355`),
  which is content policy inside a planner. 167 lines in one function.
- **Fix.** Enum `purpose`; extract query derivation into `query_terms.js` where the other
  query hygiene already lives.

---

### 4.12 Asset Search — `graph.js:483-668` + `asset_sources/*`

**Purpose** ★★★★★★★★☆☆ · **Architecture** ★★★★★★★☆☆☆ · **Decision Quality** ★★★★★★★☆☆☆
**Reliability** ★★★★★★★★☆☆ · **Performance** ★★★★★☆☆☆☆☆ · **Maintainability** ★★★★★★☆☆☆☆
**Communication** ★★★★☆☆☆☆☆☆ → **Overall 7.0 / 10**

- **Strengths.** Query hygiene with a hard 90-char cap (`index.js:61`) — a real bug fix, since
  over-long queries returned HTTP 400 and emptied whole scenes. Ranking considers relevance,
  resolution, pack style *and* aspect fit (`util.js:270-300`). Exact+perceptual dedup seeded
  tier-first so the *copy* drops, never the original (`graph.js:553-558`). Subject anchoring is
  applied to photos but deliberately not to icons (`:576-584`).
- **Weaknesses.**
  - **H6.** `dominantColor` and `dhash` are computed then **omitted from the wire**
    (`:609-615`). `scene_kit.js:1257` reads `a.dominantColor` for palette-affinity ordering and
    therefore scores every asset as neutral (200). The ffmpeg pass that computes it
    (`util.js:224`) is pure waste — one extra process spawn per fetched image.
  - Cache hits return only `{license, sourceUrl, source, width, height}`
    (`local_db.js:80`) — no `ratio`, so the VLD's phone-vs-browser routing and crop focus fall
    back to defaults for every cached asset, and `validateImage` never runs on them.
  - Videos are never deduped (`:600`).
  - Iconify assets declare a fixed `128×128` and carry no hash (`index.js:139`).
- **Fix.** Carry `dhash`/`dominantColor`/`ratio` through both wire builders and through
  `local_db.register`/`materialize`; extend dedup to video by source URL.

---

### 4.13 Creative Director — `services/creative_director.js`

**Purpose** ★★★★★★★★☆☆ · **Architecture** ★★★★★☆☆☆☆☆ · **Decision Quality** ★★★★★★☆☆☆☆
**Reliability** ★★★★★★★★☆☆ · **Performance** ★★★★★☆☆☆☆☆ · **Maintainability** ★★★★★★☆☆☆☆
**Communication** ★★★★★★☆☆☆☆ → **Overall 6.6 / 10**

- **Strengths.** Batched vision (chunks of 6) instead of per-asset calls. CLIP pre-scoring is a
  cheap deterministic prior that becomes a hint, a tie-break *and* a reported score
  (`:243-254`). The severity split on screenshot obstruction — demote under 15%, **reject** over
  35% — is well argued (`:330-345`): a third of the frame eaten by someone else's UI is not a
  B-roll asset, it is a broken one. The never-zero rescue explicitly refuses to rescue a
  capture-integrity failure (`:405-425`). Tier-first ranking via `rankKey` (`:397`) closes the
  "lucky stock photo demotes the user's own dashboard" hole.
- **Weaknesses.**
  - **H5 — no quality floor.** `normScores` computes `overall` (`:106`) and nothing ever
    compares it to a threshold. `decision`/`prominence` are pure LLM booleans, so `overall=20`
    and `overall=95` are treated identically.
  - **M9 — the rubric double-counts.** `SCORE_KEYS` (`:100`) contains both `brandCompat` and
    `templateCompat` (the prompt defines both as template fit) and **no readability** — the one
    dimension that predicts whether text over the image will be legible. `overall` is an
    unweighted mean of six dimensions, two of which measure the same thing.
  - **M7 — scope leak with no consumer.** `reviewAudio` (`:183-212`) is a second paid LLM call
    that judges music/SFX fit; its output is persisted to `creative_review` and read by
    **nothing** (verified: no consumer outside `db.js` serialization). The Audio Director,
    which runs later and *could* use it, never sees it.
  - **M8 — inconsistent failure direction.** In the main loop an unreviewed asset is left
    untouched (fail-open, `:280`); in the top-up loop an unreviewed asset is **deleted**
    (`:481`).
  - Also fetches assets (`acquire`, `:449`) — acquisition is asset-search's remit.
- **Fix.** Add a configurable floor; replace `brandCompat` with a real `brandAlignment` and add
  `readability`; either hand `musicAnalysis` to the Audio Director or delete the call (saves an
  LLM round-trip per film); make the top-up failure path fail-open.

---

### 4.14 Visual Layout Director — `services/visual_layout_director.js`

**Purpose** ★★★★★★★★☆☆ · **Architecture** ★★★★★★★☆☆☆ · **Decision Quality** ★★★★★★★★☆☆
**Reliability** ★★★★★★★★★☆ · **Performance** ★★★★★★★★★★ · **Maintainability** ★★★★★★★★☆☆
**Communication** ★★★★★★☆☆☆☆ → **Overall 7.8 / 10**

- **Strengths.** Deterministic and reuses the CD's scores — no second vision pass. The dynamic
  budget insight is correct product thinking: "a user who uploaded 6 dashboards uploaded 6
  because they want 6 shown" (`:135-147`), and because `importance` is tier-first, the widened
  budget can only admit uploads, never stock. `compositionQuality` was rewritten to measure the
  composition rather than the function's own activity (`:205-215`) — and `heroScale` is
  reported as `null` in portrait because that is the only place it is honoured (`:222-226`).
  That is rare honesty in a telemetry field.
- **Weaknesses.** It re-levels prominence by writing **the CD's channel** (`visionOk`,
  `cdProminence`, `:153-155`) instead of its own field, so "prominence" is whatever the last
  writer left — three co-mutators across the graph. `classify()` (`:46-64`) duplicates
  `scene_kit.partitionAssets` logic by design and must be kept in sync by hand.
- **Fix.** Emit `layoutProminence`; have `scene_kit.prominentOk` read `!__layoutDemoted &&
  isTrustedProminent(a)` — which it already does (`scene_kit.js:1757`), so the `visionOk` write
  is already redundant and can simply be dropped.

---

### 4.15 Art Director — `services/art_director.js` + `graph.js:720-791`

**Purpose** ★★★★★★★★★☆ · **Architecture** ★★★★★★★★★☆ · **Decision Quality** ★★★★★★★★☆☆
**Reliability** ★★★★★★★★★☆ · **Performance** ★★★★★★★★☆☆ · **Maintainability** ★★★★★★★★☆☆
**Communication** ★★★★★★★★☆☆ → **Overall 8.4 / 10**

- **Strengths.** Provenance is treated as a *first-class input, not a label*
  (`graph.js:706-719`): an explicit palette skips the LLM entirely because the human already
  answered the question the model would be asked; an inferred palette is refused outright
  because "a prompt-only job's brand colours are a plausible fiction". The **achromatic guard**
  (`graph.js:732-755`) is the standout: an explicit `{#0a0a0a,#ffffff}` is a UI default nobody
  touched, not a decision to render greyscale — so it steps aside for the first source with a
  real hue, and discloses the supersession. `distillAccents` feeds *the same pool* to the model
  and the fallback so the two can only argue over colours both can reach (`:106-123`).
  `persistBrandReview` refuses to claim a skin a renderer would drop (`:236-239`), and
  `persistWornBrand` later overwrites the proposal with what was actually worn.
- **Weaknesses.** `SKIN_AWARE_RENDERERS` (`:208-224`) is a hand-maintained set that must be
  updated with every new pack — a new native composer that *does* wear the skin silently
  reports "unbranded" until someone remembers. `usableAccent` is HSL triage, correctly
  documented as not-luminance (`:83-89`), but a hand-picked palette bypasses it entirely, so a
  #f2f0ee "brand accent" can be selected and then be invisible on a light pack.
- **Fix.** Derive `SKIN_AWARE_RENDERERS` from a manifest flag (`skin.wears: true`).

---

### 4.16 Caption Director — `services/caption_director.js` *(coverage: partial — first 200 lines read in full)*

**Purpose** ★★★★★★★★★☆ · **Architecture** ★★★★★★★★☆☆ · **Decision Quality** ★★★★★★★★☆☆
**Reliability** ★★★★★★★★☆☆ · **Performance** ★★★★★★★★☆☆ · **Maintainability** ★★★★★★★☆☆☆
**Communication** ★★★★★★★★☆☆ → **Overall 8.2 / 10 (provisional)**

- **Strengths.** The three modes collapse cleanly to two variables (`:14-17`), and the
  precedence chain for the three axes is explicit and defaulted (`:34-88`). It runs early, on
  deterministic script text, so one plan feeds VO, composer and export.
  `estimateSpokenSec` is language-aware (CJK by character, `:130-139`) rather than assuming
  words — a detail most implementations get wrong. When a `languagePlan` is supplied it uses
  those codes verbatim instead of re-normalizing (`:183-195`).
- **Weaknesses.** Two timing models coexist: estimated cues for burn-in, measured cues for the
  sidecar. That is defensible (the composer needs cues before VO exists) but it means the
  burned caption and the `.srt` can disagree by a fraction of a second, and nothing measures
  the divergence.

---

### 4.17 Localization Director — `graph.js:822-848`

**Purpose** ★★★★★★★★☆☆ · **Architecture** ★★★★★★★★☆☆ · **Decision Quality** ★★★★★★★☆☆☆
**Reliability** ★★★★★★★★☆☆ · **Performance** ★★★★★★★★☆☆ · **Maintainability** ★★★★★★★★☆☆
**Communication** ★★★★★★★★☆☆ → **Overall 8.0 / 10**

- **Strengths.** Correctly placed in the graph (joins on both the built storyboard and the
  resolved language). Translating the pack's fixed `STRINGS` in the *same batch* as the
  storyboard (`:832-834`) is the right call — one round-trip, one glossary. `brandStringOverrides`
  (`:862-870`) is a good catch: 14 packs shipped `ctaUrl: "keyframe.ai"`, so a film made for a
  client closed on the studio's own domain; routing the fix through the existing
  `{...STRINGS, ...localized}` merge point fixed all 14 with one function.
- **Weaknesses.** Mutates the storyboard in place and returns it (`:847`), so the "no-op when
  English" path and the mutating path have different shapes. Fail-open leaves English text with
  a disclosure — correct, but the film still ships.

---

### 4.18 Voice Agent — `graph.js:909-1020` + `vo_fit.js` + `sfx_plan.js`

**Purpose** ★★★★★★★★☆☆ · **Architecture** ★★★★★★☆☆☆☆ · **Decision Quality** ★★★★★★★★☆☆
**Reliability** ★★★★★★★★☆☆ · **Performance** ★★★★★★☆☆☆☆ · **Maintainability** ★★★★★★★☆☆☆
**Communication** ★★★★★★☆☆☆☆ → **Overall 7.3 / 10**

- **Strengths.** `pickVoice` word-boundary matching (`:172-175`) fixed a real bug where
  `includes("man")` fired inside "human" and `includes("he ")` inside "the ". Delivery
  instructions strip demographic words and convert pace into acting notes (`:917-937`). The
  language directive is gated on `voiceTranslate.ok` so the TTS is never told "speak Hindi"
  over English text (`:933-936`) — an otherwise undetectable desync. Anti-overlap sequencing
  (`:992-998`) is a hard guarantee no two lines ever play at once. Audio degradation is
  disclosed on the job rather than shipping silence silently (`:1001-1017`).
- **Weaknesses.** `vo_fit` reports `model: t.model, provider: t.provider` (`vo_fit.js:111`) but
  `tightenLine` returns neither (`:22`) → mispriced (H4). `synthOnce` silently doubles TTS cost
  on an ad-lib retake (`:37-42`) with no counter. The anti-overlap nudge is a *mixing* decision
  living in the voice agent while a dedicated Audio Director exists downstream.
- **Fix.** Return `model`/`provider`; count retakes into the usage tracker; move sequencing into
  the audio plan.

---

### 4.19 Audio Director — `services/audio_director.js`

**Purpose** ★★★★★★★★★☆ · **Architecture** ★★★★★★★★★★ · **Decision Quality** ★★★★★★★★☆☆
**Reliability** ★★★★★★★★★★ · **Performance** ★★★★★★★★★☆ · **Maintainability** ★★★★★★★★★☆
**Communication** ★★★★★★★★★☆ → **Overall 8.8 / 10 — the reference implementation**

- **Strengths.** The plan/execute split is exactly right: the agent thinks in LUFS and the
  deterministic ffmpeg mixer executes. `sanitizePlan` (`:115-172`) coerces *whatever* the model
  returns into a fully-formed, in-range plan with exactly one entry per scene and per SFX
  candidate — every numeric field is clamped to a defensible range with a named default. When
  the model fails, `defaultAudioPlan` still improves on the old flat mix (`:177-191`), so the
  fail-open path is a *feature*, not a degradation. SFX ids are the mixer's array indices by
  contract (`:86-94`).
- **Weaknesses.** **M12** — the deterministic fallback sets SFX at `-16 dB` (`:188`) while the
  sanitized default is `-22 dB` (`:155`): the failure path is 6 dB *louder* than the planned
  path, which inverts the intent ("accents, not events"). `score` is `null` on the default plan,
  so any dashboard averaging audio quality silently excludes fallback jobs.
- **Fix.** One-line constant alignment.

---

### 4.20 Composition Agent — `graph.js:1090-1391` + `pipeline.js` + `scene_kit.js` *(coverage: partial — scene_kit's 2,023 lines were sampled, not fully read)*

**Purpose** ★★★★★★★★☆☆ · **Architecture** ★★★★★★★☆☆☆ · **Decision Quality** ★★★★★★★☆☆☆
**Reliability** ★★★★★★★★★☆ · **Performance** ★★★★★☆☆☆☆☆ · **Maintainability** ★★★★★☆☆☆☆☆
**Communication** ★★★★★★★☆☆☆ → **Overall 7.2 / 10**

- **Strengths.** The most robust part of the system. A manifest-driven renderer dispatch
  (`pipeline.js:587-644`) means adding a pack is a table entry. The failure ladder is
  well-reasoned at every rung: a failed repair lap **keeps the prior lint-passing render**
  rather than falling back to the bland template (`graph.js:1340-1343`); an exhausted repair
  loop ships the best occlusion-only lap because "a real comp beats the fallback"
  (`pipeline.js:548-553`); budget-class failures are detected and stop the loop
  (`:1334-1335`). `writeIndexHtml` is a genuine single choke point — multi-language captions
  work across 30 composers without touching any of them.
- **Weaknesses.** Placement and motion are emitted as HTML/GSAP strings, so nothing between the
  composer and the render can inspect them — which is why the only real check is an expensive
  post-render vision pass. `scene_kit.js` is 2,023 lines. Composition consumes **storyboard**
  timings while everything else uses **script** timings (H3).
- **Risks.** Render is the dominant cost (~40–80 s of CPU-bound Chromium per lap) and there is
  no memoization despite the pipeline being fully seeded and deterministic.

---

### 4.21 Animation Agent — `graph.js:1404-1441`

**Purpose** ★★★★☆☆☆☆☆☆ · **Architecture** ★★★★☆☆☆☆☆☆ · **Decision Quality** ★★★☆☆☆☆☆☆☆
**Reliability** ★★★★★★★★☆☆ · **Performance** ★★★★★★★★★★ · **Maintainability** ★★★★★☆☆☆☆☆
**Communication** ★★★★★☆☆☆☆☆ → **Overall 4.0 / 10**

- **Strengths.** No longer inert: the report is persisted into the validation record and its
  warnings are handed to QA as "confirm or dismiss against the frames" (`:1572`), which is the
  correct division of labour between a static analyzer and a pixel reviewer.
- **Weaknesses.** It is a **regex audit named as if it were a planner**. Three checks
  (`repeat:-1`, inline transform, tween count) over raw HTML. The density heuristic
  `tweenCount < sceneCount * 2` (`:1417`) counts `tl.to|fromTo|from|set` calls — a canvas-driven
  pack (`kinetic-universe`, `product-showcase`, `three-flagship`) animates through an
  `hf-seek` listener and can be richly animated with few timeline calls, so this likely
  produces false "under-animated" warnings that are then escalated into a vision review.
- **Fix.** Either gate the heuristic on `manifest.renderer` being DOM-driven, or promote the
  node into a real Motion Planner that emits `{entry, emphasis, exit, camera, timing}` per
  archetype for composers to consume and QA to inspect.

---

### 4.22 Timeline Agent — `graph.js:1444-1520`

**Purpose** ★★★★★★★★☆☆ · **Architecture** ★★★★★★★★☆☆ · **Decision Quality** ★★★★★★★☆☆☆
**Reliability** ★★★★★★★★☆☆ · **Performance** ★★★★★★★★☆☆ · **Maintainability** ★★★★★★★★☆☆
**Communication** ★★★★★★★★☆☆ → **Overall 8.0 / 10**

- **Strengths.** Correctly uses *measured* VO timing for the sidecar while remapping the text to
  the Caption Director's resolved (possibly translated) line — the dubbed case where audio is
  English and subtitles are not is handled explicitly (`:1453-1460`). Export toggles honoured;
  quality report finalized with real durations.
- **Weaknesses.** Contains a vestigial empty `if` block (`:1447-1450`). Language QA is invoked
  here *and* in the legacy pipeline — duplicated logic across runners.

---

### 4.23 QA Agent — `agents/qa_agent.js` + `graph.js:1549-1585`

**Purpose** ★★★★★★★★☆☆ · **Architecture** ★★★★★★☆☆☆☆ · **Decision Quality** ★★★★★★★☆☆☆
**Reliability** ★★★★★★★☆☆☆ · **Performance** ★★★★☆☆☆☆☆☆ · **Maintainability** ★★★★★★★☆☆☆
**Communication** ★★★★★★☆☆☆☆ → **Overall 7.0 / 10**

- **Strengths.** The decoupling of *inspection* from *repairability* (`:1534-1548`) is a
  genuinely good architectural correction — reviewing is worth doing even when looping is not,
  and the comment explains why the previous conflation meant QA ran on 7 of 98 projects. The
  rubric is concrete and pixel-checkable; blocker #11 (groundhog set) even names its own
  exclusions so held end-cards are not false-flagged. `sampleTimes` always keeps the first and
  last frame (`:56-66`). Verdicts gate on case-insensitive severity **and** a low-score floor
  (`:142-147`), so a model that forgets the boolean cannot pass a weak render.
- **Weaknesses.** It samples at `s.script.scenes` timings (`graph.js:1565`) while the render
  follows storyboard timings (H3) — under drift, frames are sampled at the wrong moments and the
  scene plan shown to the model describes different scenes than the frames do. It is the *only*
  pixel-level check and it runs after the most expensive stage. Fail-open passes on error
  (`:1573-1576`) — correct for shipping, but it means a vision outage reads as "quality is fine".
- **Fix.** Sample from the rendered storyboard timings; record `qa.skipped`/`error` distinctly
  from `pass` in telemetry so an outage is not counted as a pass.

---

### 4.24 Preflight / Validation Gate — `services/preflight.js`

**Purpose** ★★★★★★★★★☆ · **Architecture** ★★★★★★★★☆☆ · **Decision Quality** ★★★★★★★★★☆
**Reliability** ★★★★★★★★☆☆ · **Performance** ★★★★★★★★★★ · **Maintainability** ★★★★★★★★☆☆
**Communication** ★★★★★★★☆☆☆ → **Overall 8.3 / 10**

- **Strengths.** The header (`:1-23`) is the best piece of self-criticism in the codebase: it
  names each check the previous gate ran, shows that each was a *proxy* satisfied by a film that
  failed the real question, and replaces them with checks that describe what would be wrong with
  the **film**. `renderable` as the honest denominator (`:62`) — an asset the chosen composer
  will actually put on screen — is the key idea. Self-healing missing files (`:52-54`) and
  exactly one blocking condition (`:165-178`) respect the fail-open law.
- **Weaknesses.** Check 6 matches script scene `i` to storyboard scene `i` **by index**
  (`:141-147`); under H3 drift this reports text-less scenes that have text, and vice versa.
  Runs only in the graph path (`graph.js:1091`).
- **Fix.** Match by scene id; run in both runners.

---

## 5. Prioritized issue list

### CRITICAL

**C1 — Frame Selector cannot distinguish a user's pick from the brief's suggestion.**
- *Root cause:* one DB column (`frame_pack`) carries two different meanings. Intake writes the
  brief's suggestion into it (`project_pipeline.js:332` → `db.js:274`); production reads it as
  "the user chose this" (`graph.js:211-214`).
- *Downstream impact:* (a) anti-repeat rotation is unreachable — consecutive auto films can wear
  the same pack; (b) a non-Latin film on a canvas/charset pack is **not** rerouted
  (`graph.js:238-241`) and ships broken/English on-screen text; (c) the disclosure blames the
  user for a choice they never made.
- *Fix:* read `job.intent.preferences.framePack` (preserved verbatim, `routes/projects.js:373`)
  to determine explicitness; persist the resolved pack via `db.setFramePack`. ~10 lines.

### HIGH

**H2 — Storyboard runs pack-blind on both live paths.** `graph.js:259`,
`project_pipeline.js:609` omit `framePack`; the instruction exists at `storyboard.js:39-41`.
*Impact:* no pack-specific motifs, no "keep adjacent scenes distinct" → the exact defect QA
blocker #11 exists to catch. *Fix:* pass `s.framePack`. One line per caller.

**H3 — Script↔storyboard timing drift, unchecked.** Storyboard clamps `[2,15]` and rescales
(`storyboard.js:50,67-73`); script allows `[1,12]` (`script.js:26`). Audio/captions/assets/QA
key off script; the picture keys off storyboard. *Impact:* VO lands under the wrong visuals;
QA samples the wrong moments; preflight's index-matched text check misreports. *Fix:* assert
id/count/timing equality after `storyboard_agent`; on mismatch, overwrite storyboard timings
with the script's.

**H4 — Four stages report no model/provider, so their cost is priced wrong.**
`brief.js:134`, `script.js:223`, `storyboard.js:184`, `vo_fit.js:22` return no `model`/
`provider`; the callers pass `undefined` into `tracker.addLlm`, and `usage.priceFor` falls
through to `DEFAULT_MODEL_PRICE` ($1.50/$9.00) even though KIE served at $0.45/$2.70.
*Impact:* intake stages over-costed ~3.3×; per-stage/per-provider telemetry wrong — the exact
class of bug commit `c733b6d` set out to fix, left open in the four producers.

**H5 — Creative Director has no quality floor.** `overall` computed (`creative_director.js:106`),
never compared. *Impact:* approval ≠ quality; a score-20 asset is placed like a score-95 one.
*Fix:* `config.creativeDirector.minScore` (start at 45); below it → `prominence:"background"`,
well below (e.g. <25) and web-stock → reject.

**H6 — `dominantColor` computed per asset, dropped before its consumer.** `util.js:224` →
`index.js:223` → omitted at `graph.js:609-615` / `project_pipeline.js:483-491` /
`local_db.js:80`; consumer `scene_kit.js:1257`. *Impact:* palette-affinity ordering is a
permanent no-op, and one ffmpeg spawn per fetched image is wasted.

### MEDIUM

| # | Issue | Where | Fix |
|---|---|---|---|
| M7 | CD's `reviewAudio` — a paid LLM call whose output no agent reads | `creative_director.js:183-212,491` | hand `musicAnalysis` to `directAudio`, or delete the call |
| M8 | CD top-up: unreviewed asset is deleted (fail-closed) while the main loop keeps it | `creative_director.js:471-487` | keep as background |
| M9 | Rubric double-counts template fit; no readability dimension | `creative_director.js:100` | swap `brandCompat`→`brandAlignment`, add `readability`, weight relevance+readability |
| M10 | Cache hits skip `validateImage` and carry no ratio/hash/colour | `local_db.js:74-104` | store + return the full meta at `register`/`materialize` |
| M11 | Legacy pipeline drops asset dimensions entirely | `project_pipeline.js:483-491` | mirror the graph's wire shape |
| M12 | Fallback SFX gain 6 dB louder than the planned default | `audio_director.js:155` vs `:188` | align to −22 |
| M13 | QA samples frame times from script, render follows storyboard | `graph.js:1565` | sample from `s.storyboard.scenes` |
| M14 | Preflight matches script↔storyboard scenes by array index | `preflight.js:141-147` | match by id |
| M15 | `purpose` free text vs exact-match consumers | `script.js:27` vs `graph.js:324` | enum + coercion map |
| M16 | `storyboard` is KIE-only; a KIE outage silently downgrades every film to the deterministic storyboard | `openrouter.js:275`, `graph.js:262` | disclose on the job (`audio_notes`-style note) |
| M17 | Videos never deduped | `graph.js:600` | dedup by `sourceUrl` |
| M18 | Fallback vision gate still uses exact-Set source matching (cache sources bypass it) | `graph.js:622` | use the CD's `includes()` predicate |

### LOW

- **L19** Animation density heuristic likely false-fires on canvas-driven packs → wasted QA
  attention (`graph.js:1417`).
- **L20** Internal flags (`__rejected`, `__layoutDemoted`, `__captureUnusable`) persist onto the
  asset wire and into `jobs.json`.
- **L21** VLD writes the CD's `visionOk` channel; the write is already redundant given
  `scene_kit.js:1757` reads `__layoutDemoted`.
- **L22** Iconify assets declare a fixed 128×128 and no hash → can visually duplicate.
- **L23** Vestigial empty `if` (`graph.js:1447-1450`); `qa` channel doubles as a repair flag.
- **L24** `SKIN_AWARE_RENDERERS` and `CANVAS_OR_CHARSET_RENDERERS` are hand-maintained lists
  that should be manifest flags.

---

## 6. Cross-agent validation matrix

| Invariant | Enforced today? | Where it should live |
|---|---|---|
| storyboard ids/count/timing == approved script | ❌ **no check anywhere** | post-`storyboard_agent` assert (H3) |
| asset `sceneId` ∈ storyboard scene ids | partial — CD filters against `validSceneIds` (`creative_director.js:270`), nothing else does | preflight |
| every asset path exists on disk | ✅ `preflight.js:52` (self-heals) | — |
| every asset is renderable by the chosen pack | ✅ `preflight.js:62` | — |
| brand colours propagate: extraction → AD → composer → disclosure | ✅ and verified both ways via `resolvedBrand` + `persistWornBrand` (`graph.js:1225`) | — |
| language plan is single-sourced | ✅ `language_director.getPlan` | — |
| on-screen text actually rendered in the target script | ✅ `runLanguageQa` leakage scan | — |
| caption burn-in timing == exported SRT timing | ❌ two timing models, divergence unmeasured | timeline |
| pack can render the requested asset kinds | ✅ `packAcceptsVectors` | — |
| pack can render the requested *language* | ⚠️ detected but not acted on for auto jobs (C1) | frame_selector |
| VO clips never overlap | ✅ `graph.js:992-998` | — |
| audio plan has one entry per scene / per SFX id | ✅ `sanitizePlan` | — |
| cost attributed to the provider that served | ⚠️ 4 stages report `undefined` (H4) | producers |

---

## 7. What each low-scoring agent needs to reach 9+

Not aspiration — the specific, measurable change.

| Agent | Now | To reach ≥9 |
|---|---|---|
| Frame Selector | 4.5 | Fix C1 (explicitness from `intent.preferences`), persist the resolution, add a unit test asserting an auto job with Hindi text reroutes off `flagship` |
| Animation | 4.0 | Promote to a Motion Planner emitting an inspectable per-scene motion spec; gate the density heuristic on DOM-driven renderers |
| Storyboard | 5.5 | Pass `framePack`; become a *transform* of the approved script (ids/timing preserved by construction, LLM enriches motion only); disclose fallback use |
| Creative Director | 6.6 | Quality floor; fix the rubric (readability in, duplicate template dim out); drop `reviewAudio` or wire it to the Audio Director; cache verdicts by `dhash` |
| QA | 7.0 | Sample from render timings; distinguish skipped/errored from passed; add the cheap deterministic gates so QA is not the only net |
| Asset Search | 7.0 | Propagate `dhash`/`dominantColor`/`ratio` (incl. the cache); dedup video; min-resolution hard gate with an escape hatch |
| Brief / Script | 7.0 / 7.1 | Deterministic fallbacks; enum `purpose`; return `model`/`provider`; Gate-0 regeneration on content-floor failure |
| Voice | 7.3 | Return `model`/`provider`; count retakes; move mix-timing into the audio plan |
| Composition | 7.2 | Expose a `ScenePlan` (placement + motion) so it can be gated pre-render; split `scene_kit.js` by concern; memoize renders on `hash(script,pack,assets,seed)` |

---

## 8. Performance findings

| Finding | Cost | Fix |
|---|---|---|
| `validateImage` spawns **4 ffmpeg/ffprobe processes per fetched image** (probe, dHash, dominant colour, sharpness) and `dominantColor`'s result is discarded | ~4 spawns × 8–14 assets/film | either consume `dominantColor` (H6) or stop computing it; `sharpness` is only needed by screenshot intake — make it opt-in |
| CD vision re-scores the same stock image on every film | ~1 vision call per 6 assets, repeatedly | cache verdicts keyed by `dhash` (needs H6 fix first) |
| `reviewAudio` — one extra LLM call per film, output unread | 1 call/film | delete or wire |
| Headless-Chrome render dominates wall-clock (~40–80 s/lap) with no memoization despite full determinism | the throughput ceiling | memoize on `hash(script, pack, assets, seed)`; worker pool + pre-warmed Chrome |
| `computeAssetBudget` recomputed in planner and CD | negligible (pure) | acceptable; document as intentional |
| `db.persist()` rewrites the entire `jobs.json` on a 100 ms debounce | O(total jobs) per progress tick | fine at current scale; move to per-job files or SQLite past ~5k jobs |
| Two vision gates coexist (`asset_vision` fallback + CD) | mutually exclusive today | keep, but unify the source-trust predicate (M18) |

---

## 9. Testing strategy

The repo already has the right convention — plain Node scripts under `scripts/test-*.js` wired
to `npm run test:*` (brand-kit, asset-priority, taxonomy, screenshot-intake), plus a test seam
on the graph (`graph.js:1734 __test`). Extend that rather than introducing a framework.

**Unit (deterministic, no network) — one script per agent:**
- `test-frame-selector.js` — auto job + Hindi → reroutes off `flagship`; explicit user pick +
  Hindi → honoured **with** disclosure; two consecutive auto jobs → different packs. *(This
  test fails today — it is the regression test for C1.)*
- `test-script-continuity.js` — script with a 1.5 s scene → after `normalizeTimeline`, ids,
  count and per-scene start/duration still match. *(Fails today — H3.)*
- `test-cd-floor.js` — assets scored 20/50/90 → only the ≥floor ones keep prominence.
- `test-asset-wire.js` — an acquired asset and a **cache-hit** asset both arrive with
  `ratio`, `dhash`, `dominantColor`. *(Fails today — H6/M10.)*
- `test-usage-attribution.js` — brief/script/storyboard/vo_fit calls produce a cost priced at
  the serving provider's rate. *(Fails today — H4.)*
- `test-audio-plan.js` — malformed model JSON → fully-formed clamped plan; fallback SFX gain
  equals the sanitized default. *(Second assertion fails today — M12.)*
- `test-preflight.js` — script/storyboard scene mismatch → text check still keyed correctly.

**Integration (fixtures, no LLM — inject fakes at `openrouter.chat`):**
- Graph run with every LLM stage stubbed → asserts channel shapes at each handoff (this is the
  typed-contract enforcement until zod schemas land).
- Scenarios: zero assets · uploads-only · website-only · auth-walled site · all screenshots
  obstructed · 24-scene 150 s film · 2-scene 5 s film · RTL language · CJK language · explicit
  brand palette · achromatic palette · no brand at all · vector-blind pack · canvas pack.

**End-to-end (nightly, real providers, 1 film per matrix cell):** 3 durations × 3 packs
(scene-kit / native DOM / canvas) × 2 languages, asserting: render exists, preflight has no
blockers, language QA not degraded, QA verdict recorded, cost within ±20% of the expected band.

**Golden-output regression:** `__fixtures__/flagship_golden.html` and `slideshow_bad.html`
already exist — extend the harness so every composer has a golden lint+inspect+runtime fixture,
and wire `scripts/*-harness.js` into one `npm run test:composers`.

---

## 10. Recommended sequencing

**Phase 0 — one afternoon, all low-risk, all verifiable by a test that fails today.**
C1 (frame selector explicitness), H2 (pass `framePack`), H4 (return `model`/`provider` ×4),
H6 (propagate `dominantColor`/`dhash`/`ratio`), M12 (gain constant), M8 (top-up fail-open),
L23 (dead code). No behaviour is *changed* — four dead features start working and metering
becomes honest.

**Phase 1 — quality floors (days).** H5 (CD floor, config-gated), M9 (rubric), H3 (continuity
assert), M13/M14 (timing sources), M10 (cache meta), M16 (fallback disclosure).

**Phase 2 — contracts (1–2 weeks).** Enum `purpose` (M15); zod schemas at the five load-bearing
handoffs (script→graph, assets→CD, CD→VLD, storyboard→composer, plan→mixer); single ownership
of prominence (L21); delete or wire `reviewAudio` (M7).

**Phase 3 — depth.** Motion Planner (§4.21); inspectable `ScenePlan` + a pre-render plan gate;
render memoization + worker pool; CD verdict cache by `dhash`.

---

---

## 11. Phase 0 — shipped in this pass

Each change is a dead feature switched on or a wrong number corrected; none alters an
intentional behaviour. All are covered by `npm run test:handoffs`, which fails on the
pre-fix code.

| Finding | Change | File |
|---|---|---|
| **C1** | Frame Selector reads the user's real answer from `intent.preferences.framePack` (legacy jobs keep the old reading) and persists its resolution via `db.setFramePack` | `graph.js:204-272` |
| **H2** | `framePack` passed to the storyboard on both live paths | `graph.js:274`, `project_pipeline.js:609` |
| **H4** | `model` + `provider` returned by brief / script / storyboard (success **and** error) / vo_fit | `brief.js`, `script.js`, `storyboard.js`, `vo_fit.js` |
| **H6** | `dhash` + `dominantColor` attached to the fetched-asset wire; `ratio`/`hasAlpha`/`dhash`/`dominantColor` stored at cache-register and returned at cache-materialize | `graph.js:635-648`, `asset_sources/index.js`, `local_db.js` |
| **M8** | An **unreviewed** top-up asset is kept as background instead of deleted (matches the main loop's fail-open) | `creative_director.js:471-495` |
| **M12** | Fallback SFX gain −16 → −22 dB, aligned with the sanitized default | `audio_director.js:188` |
| *(new)* | `scripts/test-screenshot-intake.js` was **red on the branch** (4/7). Root cause: it asserted pre-severity-split behaviour and shared one fixture file across three cases, so case 1's *rejection* (the correct current behaviour) deleted the file and starved cases 2–3. Test re-staged per run and split into demote-band / reject-band cases. | `scripts/test-screenshot-intake.js` |

## 12. Phase 1 — shipped

Four behavioural changes, each with the product decision made explicit.

### H3 — Continuity: the storyboard can no longer describe a different film

New `services/continuity.js`. **The approved script owns STRUCTURE** (which scenes exist,
their ids, order, timing, voiceover); **the storyboard owns ENRICHMENT** (kind, animation,
motif, beats, headline/subtext). `reconcileStoryboard()` keeps the model's creative work and
re-imposes the script's structure on top — deterministic, no LLM, fail-open.

I chose reconciliation over the two options offered (assert-and-overwrite / full transform):
assert-only leaves the drift when it fires, and a pure transform throws away the enrichment
that is the storyboard's whole reason to exist. Reconciliation gets both, and makes the
defect class *structurally impossible* rather than merely detected:

- scene count, ids and timings always equal the approved script's
- an unmatched scene is synthesized from the script (never silently missing)
- extra model scenes are dropped
- the approved voiceover is never replaced by a model paraphrase
- corrections are disclosed on the job (`db.setContinuityReport`), silent when it is a no-op

Wired into **both** runners (`graph.continuityGate`, `project_pipeline`), so they cannot drift.
This also closes **M13** and **M14** as a side effect: QA's script-timed frame sampling and
preflight's index-matched text check are now correct by construction.

Also disclosed here: when the storyboard LLM fails and the deterministic fallback is used, the
job now carries a note (`db.setValidationNote`) — previously a KIE outage silently downgraded
**every** film's art direction with no user-visible trace (**M16**).

### H5 — Creative Director quality floor

`config.creativeDirector.minScore` (default **45**) and `rejectScore` (default **25**),
overridable via `CD_MIN_SCORE` / `CD_REJECT_SCORE`; `CD_MIN_SCORE=0` disables.

- below `minScore` → demoted to background B-roll via `__layoutDemoted` (the one lever
  `scene_kit.prominentOk` honours on every pipeline), never deleted
- below `rejectScore` **and web stock** → rejected and deleted, with the reason recorded
- **owner content is exempt** — uploads, the user's own site captures and their harvested logo
  are sovereign under the tier law; capture-integrity failures are already handled by the
  screenshot QA axis. The floor exists to stop weak *stock*, not to overrule the customer
  about their own product.
- the never-zero rescue still wins: rejecting the last surviving asset would leave the film
  barren, so it is kept as a dim background instead

### M9 — Rubric rewritten

`brandCompat` (which the prompt defined as template fit — the same question as
`templateCompat`, so template fit carried 2/6 of every score) is replaced by a real
`brandAlignment`, and **`readability` is added**: whether display type can sit on the image
and stay legible, which was previously not scored at all and left for the post-render vision
pass to catch. Scoring is now weighted, not a flat mean — relevance 0.26, readability 0.20,
visualQuality 0.18, storytelling 0.14, templateCompat 0.10, brandAlignment 0.07,
motionPotential 0.05.

Two safety properties, because a floor over a rubric is only as good as its worst reply:
a **missing dimension inherits the mean of the answered ones** (never 0 — otherwise a terse
model would fail assets for a wording problem), and `overall` is `null` when nothing numeric
came back, in which case the floor does not apply. A legacy `brandCompat` reply is read as
`templateCompat`. Prompt updated to match.

### M15 — Canonical scene role

New `services/scene_role.js`. `purpose` stays free text (it is the human label the Script Room
shows); a canonical `role` — `hook|context|feature|proof|how|quote|cta` — is derived from it
once, in `normalizeScript`, with a synonym map ("benefit", "the problem", "social proof",
"walkthrough", "sign up"…) and a positional fallback for unlabelled first/last scenes.

This retires **four copy-pasted exact-string matches** (`graph`, `project_pipeline`,
`user_assets`, `website_assets`) into one shared `showcaseTargets()`, and re-keys
`kindForPurpose` off the role. A script that said "benefit" instead of "feature" previously
matched nothing: that scene stopped being a showcase target and the real screenshots and user
uploads meant for it were pinned elsewhere — silently.

### M7 — the Creative Director's soundtrack verdict now reaches the Audio Director

Wired rather than deleted. `reviewAndCurate` gains an optional `onReview(report)`
collector; the graph carries the verdict on a new `audioAdvice` channel
(`creative_director` → `audio_director`, in-band rather than through the database), and
`project_pipeline` does the same with a local. The verdict has **two deterministic
consequences**, applied to the LLM plan *and* the fail-open default:

- `musicAnalysis.keep === false` → per-scene music gain is **capped** at −3 dB. The track
  cannot be refetched this late (the voice branch that fetched it has finished), so the
  honest response to "this bed doesn't fit" is to put it further under the voiceover
  instead of letting it lead a scene. Expressed as a ceiling, not a delta, so applying it
  over an LLM plan that already accounted for the advice cannot double-count.
- `soundEffectAnalysis.reject[]` → those cues are not accepted into the mix.

The verdict is also written into the prompt, so the model sees it as a brief; the
deterministic rules exist because a model that ignores its own brief must not be the only
thing between a wrong-genre bed and the mix. The preferred `suggestedQuery` is disclosed
on the plan (`audio_review.creativeDirection`) — it is real information even though it
arrives too late to act on.

### Found while wiring it — the legacy runner was dead on arrival

`project_pipeline.runProduction` declared `const sbRes` inside the storyboard block and
read it from the audio stage **outside** that block: `ReferenceError: sbRes is not
defined`, thrown on every run at the Audio Director call — after the render, voiceover and
music had already succeeded, converting a finished film into a failed job. Present at HEAD;
invisible because `orchestrator: "langgraph"` routes production through `agents/graph.js`
and this path has no integration test. `sbRes` is now hoisted to the function scope.

This is the concrete cost of §1's observation that the two runners have drifted: the
fallback path is not a fallback if it cannot run.

### The integration test that would have caught it — `scripts/test-production-integration.js`

Unit tests could not have found that bug: it is not in any function, it is in the wiring
*between* stages. So the legacy runner now has one that executes `runProduction`
end-to-end in ~9 s.

**Real:** `normalizeScript`, the storyboard agent + its validator, the continuity gate,
the Caption Director, the Creative Director (over stubbed vision), the Audio Director,
the scene-kit composer, every disclosure pass, and the real ffmpeg audio mix.
**Stubbed — only the four genuinely external things:** `openrouter.chat` (canned JSON per
stage), `renderer.render` (a real 1 s mp4 from ffmpeg instead of headless Chrome),
`validator.validate` (no `npx hyperframes lint` download), and the asset/music/TTS
fetchers (real tiny files on disk).

Two properties worth preserving if it is ever extended:

- **Sandboxed.** `config.paths` (jobsDir / videosDir / uploadsDir / dbFile) is repointed
  at a temp dir *before any module is required*, because `db.js` captures
  `config.paths.dbFile` at its own module load. Verified: it writes nothing into the real
  `jobs/`, `jobs.json` or `public/videos/`.
- **Require order is load-bearing.** The runner destructures `render`, `acquire`,
  `synthesizeFitted` etc. at *its* module load, so the stubs must be installed before it
  is required — and a stub that needs to change mid-test must do so through a flag inside
  the stub, not by reassigning the module export. (The failure-path case initially
  asserted the happy path for exactly this reason.)

The test asserts the run reaches `done`, that no stage was silently skipped, that the
picture was composed on the *approved* script's timing, that the CD's music verdict
reached the audio plan, that subtitles carry the approved voiceover rather than the
storyboard's paraphrase, that audio really was muxed in, that cost was priced at the
serving provider's rate, and that a mid-run render failure marks the job **failed** rather
than reporting a finished film.

**Verified against the bug:** reintroducing the block-scoped `const sbRes` turns 5 of the
9 cases red, including the top-level "completes and marks the job DONE".

**Suite status:** `npm test` → brand-kit 61 · asset-priority 14 · taxonomy 87 ·
screenshot-intake 8 · handoffs 10 · quality 20 · integration 9 — **209 assertions, 0
failures, ~27 s.**

Still open (unchanged from §5): **M10** partial (cache now carries meta; `validateImage`
still skipped on hits), **M11** (legacy pipeline's asset wire drops dimensions), **M17**
(video dedup), **M18** (fallback gate predicate), **L19–L24**. Phase 2/3 (typed contracts,
Motion Planner, inspectable ScenePlan, render memoization) are unstarted.

---

## 13. Re-scoring (after Phase 0 + 1 + M7)

Two corrections at once, kept separate so neither hides the other:

1. **Arithmetic.** Several overalls published in §4 were not strict means of their own seven
   axes — I had rounded by judgment. Everything below is the strict mean, so a few scores
   move with no code change at all. Where that happens it is marked *(arith)*, and it is a
   correction to me, not a change in the system.
2. **Code.** Phase 0, Phase 1, M7 and the `sbRes` fix genuinely moved seven agents.

Axes unchanged: Purpose · Architecture · Decision · Reliability · Performance ·
Maintainability · Communication.

| Agent | §4 | Now | Δ | What moved |
|---|---|---|---|---|
| **Frame Selector** | 4.5 | **8.1** | +3.6 | C1: reads the user's real answer, persists its resolution, rotation + localization reroute alive; regression-tested *(incl. +0.6 arith)* |
| **Storyboard** | 5.5 | **7.0** | +1.5 | Pack-aware (H2); structure now enforced downstream (H3); fallback disclosed (M16) |
| **Creative Director** | 6.6 | **7.6** | +1.0 | Quality floor (H5), rubric fixed (M9), fail-open consistent (M8), audio verdict now consumed (M7) |
| **Script** | 7.1 | **8.0** | +0.9 | Canonical `role` (M15) ends the exact-match hazard; +arith |
| **Asset Planner** | 7.4 | **7.9** | +0.5 | Role-based showcase targeting, shared not duplicated |
| **Audio Director** | 8.8 | **9.3** | +0.5 | Consumes the CD's verdict in-band, deterministic + LLM paths aligned, idempotent, tested; +arith |
| **Brief** | 7.0 | **7.4** | +0.4 | Reports the serving model/provider (H4); +arith |
| **Asset Search** | 7.0 | **7.3** | +0.3 | `dhash`/`dominantColor`/`ratio` reach the wire and the cache (H6) *(net of −0.6 arith)* |
| **Preflight** | 8.3 | **8.6** | +0.3 | Its index-matched text check is now safe by construction (M14 closed by continuity) |
| **Scene Planner** | 7.0 | **7.4** | +0.4 | *(arith only — no code change)* |
| **QA Agent** | 7.0 | **6.7** | −0.3 | M13 closed (samples correct timings now) but *(−0.6 arith)* dominates |
| **Voice Agent** | 7.3 | **7.1** | −0.2 | vo_fit attribution fixed *(net of −0.3 arith)* |
| **Composition** | 7.2 | **6.9** | −0.3 | *(arith only)* |
| **Caption Director** | 8.2 | **8.0** | −0.2 | *(arith only)* |
| **Localization Director** | 8.0 | **7.9** | −0.1 | *(arith only)* |
| **Timeline** | 8.0 | **7.9** | −0.1 | *(arith only)* |
| **Animation → Motion Planner** | 4.0 | **8.7** | +4.7 | Rewritten as a real planner + verifier with a live consumer (§14); *(incl. +1.6 arith)* |
| **User Assets** | 8.0 | **8.0** | — | Shared showcase rule; net zero |
| Language Director | 8.8 | **8.9** | — | unchanged |
| Screenshot Intake | 8.9 | **8.9** | — | unchanged (its stale *test* was repaired, not the module) |
| Art Director | 8.4 | **8.4** | — | unchanged |
| Visual Layout Director | 7.8 | **8.0** | — | *(arith only)* |
| Website Harvester | 7.7 | **7.7** | — | unchanged |
| Website Ingest | 7.3 | **7.3** | — | unchanged |

**System mean: 7.4 → 7.8.** Agents at or above 8.5: 6 (was 3). Below 7.0: 3 (was 4).

### Where the mean misleads — read Animation's axes, not its score

Animation "rises" to 5.6 purely because an unweighted mean of seven axes rewards a node that
does almost nothing: Performance 10 and Reliability 8 (it cannot fail — it barely acts) drag
a **Decision Quality of 3** up to a respectable-looking number. Nothing about it improved. It
is still a three-check regex audit wearing a planner's name, and its density heuristic still
likely misfires on canvas-driven packs (L19). Treat 5.6 as an artifact and 3 as the finding.

The same caution applies inversely to the **Creative Director's 7.6**: Performance 5 (a vision
call per six assets, still no `dhash`-keyed verdict cache) holds down an agent whose
decision-making improved materially this pass.

### One rating carries unvalidated risk

The CD's Decision axis (6 → 8) assumes the quality floor behaves against a **real** vision
model's score distribution. Every test scoring it used synthetic values. If the live model
centres lower than my thresholds assume, the floor over-demotes and that 8 is wrong — this is
the one score I would revisit after the first real render (`CD_MIN_SCORE` tunes it without a
code change).

### Unchanged and still the priorities

Nothing shipped this pass touched **Animation** (4.21), the **QA agent's** position as the only
pixel-level check running after the most expensive stage, or **Composition's** un-inspectable
placement/motion. Those three remain the structural work, and they are what Phase 2/3 exist for.

*(Animation was addressed immediately after — see §14. Its re-rating: **5.6 → 8.7**, and
Composition **6.9 → 7.0** for consuming the plan.)*

---

## 14. Phase 2 (first piece) — the Motion Planner

`services/motion_planner.js`. The `animation` node is no longer an audit pretending to be a
planner: it plans, a composer consumes the plan, and a separate pass verifies what actually
came out.

### The defect it fixes

Motion was decided **per film, not per scene**, two levels below the agent that was supposed
to own it:

```
theme.textfx.enter    ONE text-entrance mode for the whole video   (scene_kit.js)
motionFor(pack)       ONE camera cut for the whole video
```

A hook, a data scene, a testimonial and a CTA all arrived identically, every time. That is
the *motion* half of the "cheap template" tell the QA agent is told to catch (blocker #11,
GROUNDHOG SET) — and no amount of asset work fixes it, because it is choreography.

Measured on a 3-scene film through the real composer:

| | entrances emitted |
|---|---|
| before (no plan) | `blur-up` — one mode, all scenes |
| after | `spring` → `slide` → `char-pop` |

### What it decides

Per scene, from its **role** (`scene_role`), its **duration** and its position: a text
entrance, a camera move, a per-word stagger, and entrance/emphasis/exit times. Three rules
carry the quality:

- **Anti-repetition** — adjacent scenes may never share both entrance and camera. Tested
  against the worst case (six scenes of the same role), where a naive role→motion table
  hands every scene the same move.
- **Duration decides pacing** — under 2.5 s forces a fast arrival (the copy would still be
  landing as the scene cuts); 7 s+ earns a slow cinematic one plus a mid-scene emphasis beat.
- **Pack-constrained** — choices come only from the vocabulary `textIn()`/`sceneMotion()`
  actually implement, and a pack's declared signature cut stays reachable for every scene, so
  a pack keeps its identity. *A plan nobody can honour is worse than no plan.*

Deterministic and free: same job → same choreography (renders stay memoizable), different
jobs → different films.

### It has a real consumer, and a verifier

The scene-kit consumes it through `ctx.fx` (nine `textIn` call sites + the camera in
`sceneMotion`). **A null plan renders byte-identically to before** — verified.

`verifyMotion()` then reads the composed HTML back and reconciles plan against reality:
which scenes are **static** (zero timeline activity — named, where the old global tween count
could only say "seems thin"), and which **drifted** from their planned entrance. Composers
that own their choreography (the ~15 native/canvas packs, detected by the absence of
`textIn`) are graded on the generic checks only, instead of being reported as drift — the old
`tweenCount < scenes×2` heuristic was handing the QA reviewer false "under-animated"
concerns for exactly those packs.

Wired into **both** runners, with the audit on its own `motion_audit` key — folding it only
into `validation_report` (as the old node did) meant the legacy path planned motion and
verified it into a void, since only the graph writes a validation record.

### Honest scope

Only the scene-kit consumes the plan; the native composers ignore it by design. `emphasis`,
`exit` and `intensity` are planned and persisted but not yet consumed — the kit currently
honours `enter` and `camera`. That is why this rates 8.7 and not higher.

**Suite:** brand-kit 61 · asset-priority 14 · taxonomy 87 · screenshot-intake 8 · handoffs 10 ·
quality 28 · integration 10 — **218 assertions, 0 failures.**

---

## 15. Extending the planner to the native packs — and what it did NOT fix

The scene-kit fix above does nothing for the ~22 native packs: they never call `textIn`.
Each owns a `BUILDERS` map and an `archetypeFor(scene, i, total)` whose shape is identical
across all of them — a few data-shaped branches, then **one fallthrough**:

```js
if (i === 0 …)                 return "open";
if (i === total - 1 …)         return "cta";
if (<needs a number>)          return "stats";
if (<needs 2+ bullets>)        return "bullets";
return "showcase";             // ← every remaining scene
```

So a text-led five-scene film is `open → showcase → showcase → showcase → cta`: one layout
for the whole middle.

**`varyArchetypes()`** breaks adjacent duplicates using only a pack's own generic scene
types, wired at the shared `const baseArch = scenes.map(…)` seam in 16 files (22 packs —
`om_stage` alone drives seven) plus flagship's `treatmentFor`.

**It is deliberately conservative, because the alternative is worse.** Those data-shaped
branches are PRECONDITIONS: forcing `stats` onto a scene with no number, or `gallery` onto
a film with one image, renders an empty panel — a worse defect than the repetition. So a
substitution happens only when the duplicate *and* its replacement are both generic
(headline-plus-optional-image), and the replacement is one that pack implements. Bookends
are never re-typed, and never used as replacements, so a middle scene can't become a
second opener.

| | |
|---|---|
| **13 packs gain variety** | aurora-motion, digital-universe, editorial-motion, glass-dimension, kinetic-universe, living-city, minimal-luxury, nature-flow, om-stage (×7 skins), paper-craft, prisma-bloc, product-showcase, retro-future |
| **3 unchanged by design** | ai-laboratory, motion-canvas, neo-dashboard — their only generic type IS the default; every alternate (`metrics`/`chart`/`gallery`) needs data |

Kill switch: `KF_NO_ARCHETYPE_VARIATION=1` returns each pack's original sequence.

### Proof, and the honest limit

`scripts/test-native-variety.js` (28 assertions) composes **every** native pack twice from
one deliberately monotonous storyboard — once with the pass disabled, once on — and asserts
no scene loses its copy and no composition collapses. Comparing against a baseline rather
than a fixed expectation matters: several packs legitimately transform copy, and
bloom-fable renders no middle-scene headline *either way* — a real quirk, but not this
pass's doing.

**A live re-run on flagship then showed the limit.** The pass fired
(`[flagship] varied 1 repeated treatment(s)`), and QA still returned the same blocker:
*"Multiple scenes share the identical purple wave background and grid layout."* Two frames
side by side explain why — the plates and copy do change, but the **set** does not: the
same canvas wave, the same perspective grid, the same text zone, the same chip row.

On a canvas-backdrop pack, the dominant sameness signal is the persistent backdrop, which
no archetype swap can reach. That was addressed separately — see §16.

---

## 16. Flagship's backdrop — per-scene stage dressing

The other half of flagship's groundhog. Its aurora wash was three accent blobs at **fixed
weights and fixed positions**, drifting only on `uTime`, with a fixed vignette and a fixed
grid: one backdrop for the entire film, by construction.

Three uniforms (`uMix`, `uOff`, `uVig`) now let the render loop re-dress the set per scene,
plus the floor grid's opacity and yaw. Three dressings rotate — enough to guarantee
adjacent difference while keeping the film coherent — and the CTA always gets the open,
bright one so the ending reads as the film opening out. **Colour is never invented**: the
dressing re-weights and re-places the pack's own accents.

`dressAt(t)` is a **pure function of time** — mandatory, because the renderer scrubs the
timeline in both directions, so the set must be reconstructible at any instant rather than
accumulated frame to frame. Dressings cross-fade over the last 0.5 s of a scene so a change
reads as a deliberate re-light, not a cut. Kill switch: `KF_NO_STAGE_DRESSING=1`.

### Measured, not asserted

A first attempt to compare against the *previous* flagship render was **invalid** and was
discarded: the sampled crop contained headline and plate content, so across two different
films it measured content change, not backdrop sameness. The only sound test is the same
film with the dressing on and off, which the kill switch makes possible:

| same film, same frames, only the dressing differs | min adjacent Δ | mean Δ |
|---|---|---|
| dressing OFF (the original single set) | 14.6 | 40.4 |
| dressing ON | **16.4** | **47.6** |
| ON + a per-scene ground tint *(tried, removed)* | 16.5 | 46.7 |

The ground tint — mixing the base colour a few percent toward an accent so *every* pixel
moves — was a sound theory that measured as **nothing** (+0.1): the blobs and vignette
overwrite the ground exactly where it would have shown. It was removed rather than shipped,
and the reason is recorded in the shader comment so it isn't re-attempted.

### Acceptance

The arbiter that raised the complaint was asked again — the same film, regenerated:

> **before:** *"Multiple scenes share the identical purple wave background and grid layout."*
> **after:** the sameness blocker is **absent**; QA's two blockers are now both about
> screenshot scale ("too small… floating stickers", "no clear hero UI element").

That is a different, pre-existing defect (rubric blocker #10 — a product screenshot should
occupy ≥50% of frame), and it is now flagship's top issue.

**Confidence, honestly:** the sameness blocker appeared in 2 of 2 runs before and 0 of 1
after, and QA is an LLM whose verdicts vary. Suggestive, not conclusive — the controlled
pixel measurement above is the firmer evidence, and it shows a real but moderate gain.

---

*Audit performed 2026-07-28 against branch `Rohit` (working tree, 78 uncommitted changes).
Coverage: full line-by-line read of 21 modules; partial (call-site + outline) for
`ingest/website.js`, `website_assets.js`, `user_assets.js`, `scene_kit.js`, and the back half of
`caption_director.js` — those scores are marked provisional. Every `file:line` reference was
read, not inferred.*
