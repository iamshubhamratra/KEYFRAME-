# Multi-Source Intelligent Image Discovery — Pixabay + Pexels + Unsplash

Status: **SHIPPED**. Built 13 Aug 2026.

Scene-aware image discovery across three stock providers: candidates are pooled concurrently,
scored out of 100 on seven transparent axes, held to a priority-weighted bar, and seated in the
template placeholder they were fetched for.

---

## What was already there (and was NOT rebuilt)

An audit of the existing pipeline ran before any code was written. Four of the requested
capabilities already existed, and building them again would have been the expensive mistake:

| Assumed missing | Reality |
|---|---|
| A Pexels provider | **Already existed and was wired** (`asset_sources/pexels.js`, 3rd in `DEFAULT_ORDER`). Inert for one reason: an empty `apiKey` made `available()` false. Enabling it was a **key change, not a code change**. |
| A normalized cross-provider record | **Already specified** in `services/pixabay/types.js`, whose header names this exact feature: *"adding Pexels/Unsplash is a file rather than a refactor."* |
| A semantic relevance scorer | **`services/asset_clip.js` exists and is on by default** — CLIP ViT-B/32 ONNX, called from the Creative Director. Not duplicated. |
| A per-scene asset-requirement record | **`asset_requirements.js` already emitted the full record** (priority, minWidth/minHeight, kindPref, preferredAspect). It was computed and thrown away — only `preferredAspect` ever reached `acquire()`. The work was *passing* it. |

Genuinely new: Unsplash, the concurrent fan-out, cross-provider pooling, the composite score,
the selection bar, query refinement, and per-provider observability.

---

## The pipeline

```
script scene ─► asset_requirements (box contract: priority, aspect, min px, kind)
                       │
                       ▼
              per-scene query (never one string for the whole film)
                       │
      ┌────────────────┼────────────────┬─────────────┐   ← Promise.allSettled
   Pixabay          Pexels          Unsplash      Openverse      (one failing costs
      └────────────────┴────────────────┴─────────────┘            only its own candidates)
                       ▼
            merged pool (40–60 candidates), cross-provider dedup
                       ▼
            asset_score: 100 points, metadata pass  ── ranks the whole pool
                       ▼
            download the winner → validateImage (4 ffmpeg passes, already paid for)
                       ▼
            asset_score: MEASURED pass (real sharpness / stdev / dHash / colour)
                       ▼
        score ≥ bar ?  ──yes──► seat it
              │no
              ▼
        remember as best-so-far → next candidate → next query → refine (max 2 laps)
              │
              ▼
        nothing cleared → ship the best seen, flagged `thresholdMissed`
```

`pixabay_scrape` is marked `lastResort` and stays **out** of the fan-out — it launches a
Chrome per search, so fanning it out would start a browser per want.

## The score

`relevance 35 · quality 20 · sceneCompat 15 · aspect 10 · subject 10 · brand 5 · uniqueness 5`

- **relevance** — query overlap *and* overlap with what the scene actually says (headline,
  subtext, narration). This is what stops a picture that matches the query but contradicts the
  line spoken over it.
- **quality** — declared resolution before download; **measured sharpness + information after**.
  A soft 4000px photo now loses to a crisp 1600px one.
- **sceneCompat** — the box's kind, resolution floor and orientation.
- **aspect** — additive and reaches **zero**. It used to be a multiplier floored at 0.62, so a
  sideways image kept two thirds of its points.
- **subject / brand / uniqueness** — is the required thing in frame; is it on-palette; is it
  different from what the film already took.

**The bar:** 80 for critical/high boxes and for any want with no box, 70 medium, 60 decorative.
Never returns `null` when a candidate exists — a threshold that blanks a scene fails preflight.

## Defects found and fixed while building

1. **`Number(undefined) ?? 5` is `NaN`** — `??` does not catch `NaN`. `hasBudget()` was
   permanently false, which would have silently disabled Unsplash entirely in production.
2. **`need.requirement` was never a field** — the requirement is a *sibling* of `need` on the
   want. Every box want fell through to the synthesized default and the template's contract
   was discarded.
3. **Provider orientation vs box aspect disagreed** — providers were asked for the *film's*
   orientation while candidates were scored against the *box's* aspect. On a 9:16 run the mean
   aspect sub-score was **1.6/10**; asking for the box's shape took it to **9.1/10**.
4. **`derived` misread as "decorative"** — it means the *query* was derived from prose, not that
   the picture is filler. It put ~80% of a film's wants on a 60 bar.
5. **The cache was a free bypass** — `hits[0]` was returned unranked, unscored and unvalidated.
   Observed live: a request for a 16:9 hero was served a cached **1280×1280 square**, instantly.
   Cache hits are now scored on the same scale and must clear the same bar.
6. **`bar` and `thresholdMissed` dropped at the wire record** — the same class of loss the file's
   own comments record three previous instances of. A score with no bar beside it is unreadable.

## The compromise rate, and what actually caused it

First measured behaviour: mean selected score ~75/100 with most wants shipping below their bar
as recorded best-available. The obvious suspect was query length — the planner emitted things
like `overwhelmed analyst wall monitors`. **That suspicion was wrong, and measuring it saved
the wrong fix from being built.**

Four retrieval strategies were compared against a **fixed yardstick** (the retrieval query
varied; every candidate was scored against the same reference, so a strategy could not win
merely by shrinking the relevance denominator):

| strategy | mean best score | cleared 80 |
|---|---|---|
| current (first 4 content words) | 77.2 | 3/6 |
| current + topic anchor | 77.8 | 3/6 |
| nouns only, 3 words | 77.7 | 3/6 |
| first 2 words | 73.2 | 2/6 |
| nouns only, 2 words | 74.5 | 2/6 |

Shortening queries does not help; past a point it *hurts*. The ceiling was somewhere else.

Decomposing the winners exposed it: relevance was **13.1/35 — exactly 0.5 × 0.75** — on every
capped scene. The query `overwhelmed analyst wall monitors` states four requirements, but only
*analyst* and *monitors* are objects a photograph can contain. "Overwhelmed" is a mood and
"wall" is framing; a stock caption describes what is **in** the frame and never the feeling it
was shot in. Those words were unmatchable by construction, and they sat in the denominator — so
the best possible picture of an analyst at a bank of monitors was capped at half marks and the
scene could never clear its bar however good the pool was.

Three changes, none of which relaxes the bar:

1. **Query terms are weighted by whether the scene needs them.** A subject term counts full,
   anything else a third — enough that mood still breaks a tie, nowhere near enough to cap a
   picture that shows the right thing.
2. **Scene echo became a bonus, not a tax.** It was a 0.75/0.25 blend, so a picture matching the
   subject perfectly but not echoing the narration was capped at 75% of the axis before
   anything had gone wrong. Now 0.88/0.24, capped at 1 — the tie-break survives, the tax does not.
3. **Mood and posture words leave query generation entirely.** `deriveQuery` and
   `queryFromProse` now route through `asset_sources/query_terms.subjectQuery`, which already
   existed for exactly this and was wired to a single vector branch. This also collapses
   **four competing stopword lists into one**, so the words we search for and the words we
   grade on cannot drift apart.

Measured on the real production path, same pools, same bar:

| scene direction | before | after |
|---|---|---|
| an overwhelmed analyst at a wall of monitors | 71 | **78** |
| tangled cables and scattered paperwork | 69 | **73** |
| a clean analytics dashboard on a laptop | 90 | **98** |
| a revenue chart climbing on a screen | 83 | 82 |
| a team collaborating around a table | 81 | **94** |
| a bright open workspace at sunrise | 69 | **73** |
| **mean** | **77.2** | **83.0** |

**The control that proves this is discrimination and not inflation:** deliberately off-topic
candidates (a golden retriever, a plate of pasta, someone with a water bottle) scored **53/100
before and 53/100 after**. Good pictures rose; bad pictures did not move. Live-suite mean went
74–76 → **79/100**.

What remains below the bar is genuinely hard: "tangled cables and scattered paperwork" is a
*conceptual* shot, and stock does not carry it. Those ship at ~73 flagged `thresholdMissed`,
which is the honest answer rather than a hidden one.

### The regression the consolidation caused, and the fix

Consolidating the stopword lists had a side effect worth recording. Wants arrive from two
independent derivations — the planner's gap-fill (`deriveQuery`) and the box requirements
(`asset_requirements.queryFromProse`) — and **both distil the same `scene.visualDirection`**.
While they used separate stopword lists their outputs merely resembled each other; once both
routed through the shared extractor they became **byte-identical**.

Measured: a six-scene film against a nine-box template produced **9 wants but only 6 distinct
queries — 3 exact collisions**. Each colliding pair searched the same words, ranked the same
pool, chose the same winner, and the film's de-duplicator then correctly deleted one. A fetch
was spent to fill a box that ended up empty.

The planner now re-aims the later want of a collision at a **different facet of its own scene**
(headline/subtext, then narration, then on-screen text), giving **9 wants → 9 distinct
queries**. It is fail-open in the strict sense: a want keeps its original query unless a
genuinely different, non-empty alternative exists, so the pass can only add distinctness and
can never leave a want without a query.

## Files

**New** — `services/asset_score.js` · `services/stock/http.js` · `services/pexels/index.js` ·
`services/unsplash/index.js` · `asset_sources/unsplash.js` · `scripts/test-asset-sources.js` ·
`scripts/test-asset-scoring.js` · `scripts/test-providers-live.js`

**Changed** — `asset_sources/{index,util,pexels,local_db,pixabay_scrape}.js` · `agents/graph.js` ·
`services/creative_director.js` · `src/config.js` · `db.js` · `config.example.json` · `package.json`

**Deliberately untouched** — `services/pixabay/*` (the only provider with test coverage, and it
also serves music/SFX), `asset_clip.js`, the `asset_requirements` record shape,
`asset_priority.tierFor` (stock correctly falls to tier 40; promoting it would break the tier law).

## Verification

```
npm test                      # 36 suites, includes the two new offline ones
npm run test:providers-live   # live: pool, scoring, 9:16, failure injection, key safety
npm run test:providers-matrix # + 30s / 60s / 90s sweep
```

Measured on the live suite: three providers queried concurrently per want, pools of 40–60,
mean selected score **74–76/100**, mean aspect **9.1/10** on portrait, every provider individually
killable with generation continuing, and no API key present in any job dir, artefact or log line.

## Operational notes

- **Unsplash demo keys allow 50 requests/hour**, per application, not per film. It is treated as a
  complement: it reserves the last 5 requests, declines to enter the walk when the budget is
  nearly gone, and every failure path is silent. A production key (5000/hr) only needs
  `unsplash.rateLimitMax` raised.
- Unsplash's `download_location` ping is a **licence obligation** and fires on every real
  download, fire-and-forget.
- Keys live in `server/.env` (gitignored, auto-loaded) or `config.json`; placeholder values are
  scrubbed centrally so a `YOUR_KEY` string can never make `available()` lie.
