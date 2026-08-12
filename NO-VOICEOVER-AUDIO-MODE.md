# No-Voiceover Audio Mode — analysis, root cause, redesign

**Status:** **P0–P5 ALL SHIPPED** 5 Aug 2026 · **Branch:** Rohit

> **Measured outcome of P0+P1.** The same 24-run experiment that produced the diagnosis
> below now returns **23 distinct tracks from 24 runs**, all from Pixabay. Before: 8
> distinct from 12, two packs identical across jobs, and two packs shipping a synthesized
> sine pad on every single film. See §10.

Scope: why music-led (narration-off) films sound alike, and the redesign that fixes it.
Everything below was traced in the running system, not inferred. Probe scripts and their
raw output are cited inline.

---

## 0. The short version

The template audio system is **not** broken and the selector is **not** picking the same
track on purpose. The failure is one layer lower:

> **The query a template asks with almost never matches anything, so every film falls
> through to the same two or three generic widened queries — and those are served from a
> fixed, deterministically-sorted first page of ten results.**

Measured: **19 of the 20 packs I could probe before Freesound rate-limited me return ZERO
tracks for their own lead query.** Not "few". Zero. The pack's identity contributes nothing,
and what actually picks the music is a two-word fallback shared across many packs.

Consequence for the brief: **adding more keywords per template — the fix the request asks
for first — will not help on its own.** More keywords of the same shape produce more zeroes.
The query form, the provider, and the result-window have to change first.

---

## 1. What actually happens today, end to end

### 1.1 The narration flag

`job.voiceover_enabled` (opt-out; absent/legacy = on) is read in exactly one place,
`agents/graph.js:1128`, and converted to `narration: "on" | "off"` which rides the graph
state to the audio layer. **It reaches nothing else.** `graph.js:1122` states the design
intent explicitly:

> the PICTURE is byte-identical whether narration is on or off

That property is deliberate — it lets a user toggle narration in the Script Room without
regenerating. It is also the direct cause of complaint #3 (slow pacing): scene count, scene
duration, cut rhythm, motion speed and transition duration are **identical** in both modes.

### 1.2 What no-VO mode *does* change today

| Layer | File | Change with narration off |
|---|---|---|
| Keyword rotation | `audio_profile.js:150-160` | draws from the back half of `musicKeywords` (authored calmest-first) |
| SFX budget | `graph.js:1161`, `sfx_plan.js:116` | `densityScale` 1.0 → 1.5, ceiling 6 → 9 cues |
| Music loudness | `audio_director.js:71-83` | −23 → −18/−16/−14 LUFS by `noVo.energyBoost` |
| Duck / vocal carve | `audio_director.js:80-81` | both set to 0 — no voice to clear |
| Per-scene music curve | `audio_director.js:97-101` | widens from −6…+2 to −6…+5 |
| SFX level | `audio_director.js:111-114` | −22 → −16 dB |

This is a real music-led mix, and it is well built. **The mix is not the problem.**

### 1.3 The music search path

```
audio_profile.musicCandidatesFor()        → ordered candidate queries
  └─ candidates[0] = keywords.join(" ") + mood      ← the template's identity
  └─ candidates[1..n] = each keyword alone
  └─ candidates[n+1] = the script's subject query
  └─ candidates[n+2] = pack.style[0..1].join(" ")
audio_sources.fetchMusic()                 (audio_sources.js:263)
  └─ normalize(), then APPEND two widened queries  (audio_sources.js:275-276)
        core   = first two words of candidates[0]
        `${first word} music`
  └─ tier 0: Pixabay bridge, in candidate order    (audio_sources.js:285-297)
  └─ tier 1: Freesound, POOL then rank             (audio_sources.js:302-330)
  └─ tier 2: Internet Archive
  └─ tier 3: synthesized sine pad                  (audio_sources.js:344-350)
```

Freesound is queried at `audio_sources.js:305` with:

```js
{ query: q, filter: "duration:[20 TO 180] tag:music", sort: "rating_desc" }   // page_size 10, no page param
```

---

## 2. Evidence

### 2.1 Twelve simulated no-VO selections (`probe-music.js`)

Six packs × two job ids, running the real `musicCandidatesFor` → real Freesound → real
`scoreTrack`.

| Pack | lead query result | what actually won | won via |
|---|---|---|---|
| ai-laboratory | **0** | `531854 Suspension: Mellow Electro-Ambient` (both jobs) | `dark techno pulse` |
| edition | **0** | `759800` / `609662` | `documentary underscore` / `thoughtful ambient` |
| minimal-luxury | **0** | `797794` / `789317` | `minimal piano` / `elegant classical` |
| hype-wave | **0** | `679167 Chiptune Type Beat` (both jobs) | `hip hop trap` ← **the style tag, not a keyword** |
| paper-tales | **0** | `815018` / `718889` | `bright folk` / `warm acoustic` |
| grid-dispatch | **0** | **nothing — every candidate dry** | → sine pad |

- Lead query returned 0 in **12/12** runs.
- 2 of 6 packs produced an **identical winner across different jobs** — the seeded rotation
  changed the keywords, but both keyword sets missed, so both funnelled to the same widened
  query and the same deterministic top-10.
- `grid-dispatch` produces a **synthesized sine pad every single time**. That is literally
  the same audio in every grid-dispatch film.

### 2.2 Coverage across packs (`probe-all-packs.js`)

Freesound rate-limited the probe after ~20 packs (rows returning `-1`), so this is a
20-pack sample, not all 61 — stated plainly because the summary line in the script output
does not distinguish "0 results" from "request failed":

- **lead query returns 0 tracks: 19 of 20 measured** (only `brightlife` scored 1)
- single keyword alone returns 0: 8 of 20
- `bloom-illustrated`: every candidate dry → pad only

### 2.3 The variety levers do work (`probe-variety.js`)

| Lever | Result |
|---|---|
| `"dark techno pulse neural tech"` | 0 total matching |
| OR-joined form of the same words | 0 total matching |
| `"techno"` alone | **473** tracks |
| One query across 5 sort modes | **67 distinct ids** vs 15 from `rating_desc` alone |
| One query across 3 pages | **45 distinct ids** |
| Catalogue depth, `tag:music` | electronic 2375 · ambient 1932 · cinematic 1288 · lofi 431 · acoustic 418 · orchestral 366 · upbeat 149 · funk 102 · corporate 70 |

**The catalogue is deep. The pipeline reads one fixed page of one fixed ordering of it.**

---

## 3. Root causes, ranked

**RC1 — Multi-word phrases are AND-matched and return nothing.** `musicCandidatesFor`
leads with `[...keywords, mood].join(" ")` (`audio_profile.js:196`). Freesound AND-matches
every term across name/tags/description. A 4–6 word phrase like *"driving electronic dark
techno pulse clinical"* matches no upload in existence. **19/20 packs, zero results.** This
is the single biggest cause: it removes the template from the decision entirely.

**RC2 — The widening step is shared and generic.** When the lead misses, `fetchMusic`
appends `core` (first two words) and `"<first word> music"` (`audio_sources.js:275-276`).
Many packs collapse onto the same handful — `driving …`, `high energy …`, `warm acoustic`,
`epic cinematic`. Templates that should sound unrelated end up drawing from one pool.

**RC3 — The result window is deterministic and one page deep.** `sort: "rating_desc"`,
`page_size: 10`, no `page` (`audio_sources.js:78-89, 305`). For a given query the same ten
candidates come back forever. Two different jobs on one template that widen to the same
query **must** get the same track. Confirmed twice in §2.1.

**RC4 — No memory of what was used.** There is no recently-used ledger anywhere — no table
in `db.js`, no cache, nothing (grepped). Nothing can prefer a track it has not shipped
recently, because nothing knows.

**RC5 — The primary music provider is down.** `pixabay_bridge.js` targets
`http://localhost:3007/api/v1`; it is unreachable, so tier 0 never contributes and 100% of
music comes from Freesound — a **sound-effects** library whose music subset is small and
skews field-recording/documentary. Confirmed live in the 5 Aug job log. Fail-soft hides it
behind one warning.

**RC6 — Ranking cannot express energy.** `scoreTrack` (`audio_sources.js:220-248`) is
length-fit → tag overlap → popularity. Nothing scores tempo, energy or brightness, so no-VO
mode cannot ask for a *more driving* track — it can only ask with different words, and
per RC1 those words miss.

**RC7 — Pacing is out of scope by construction.** §1.1. Nothing downstream of the narration
flag touches picture timing.

**RC8 — Nothing connects music to motion.** The per-scene music envelope
(`audio_mix.js:298`) is keyed to scene boundaries the composer already chose. No beat
detection, no beat grid, no shared clock between the bed and the animation.

---

## 4. What is already right — do not rebuild

Stated so the implementation does not waste a phase re-doing solved work:

- **Mastering chain** — per-bus `loudnorm`, per-scene volume envelope, `alimiter` at
  −1 dBTP that never moves between modes (`audio_mix.js:311, 388`). The brief's "prevent
  clipping / balanced cinematic mix" is done.
- **Duck bypass + vocal carve removal** with no VO (`audio_director.js:80-81`). Done.
- **SFX support gate** — a cue must be justified by something on screen, cues are spread,
  the climax slot is reserved (`sfx_plan.js`). Excellent; keep.
- **Template audio identity schema** — `pack.json → audio{}`, 61/61 packs, boot-validated
  (`frame_manifest.js:247, 284`). The *schema* is right; the *vocabulary* is what fails.
- **Deterministic seeding** — `mulberry32(hash(jobId|pack))`. Math.random is banned in the
  render path so re-renders reproduce. **Any variety design must respect this** (see §6.2).

---

## 5. A tension in the brief that must be resolved first

The request asks to "**randomly** combine keywords" and to "avoid reusing the same track
across consecutive jobs". Those pull against the codebase's determinism rule: the same job
re-rendered must produce the same film.

**Resolution:** variety comes from **history**, not from randomness.

- Within a job: keep the existing seeded shuffle — reproducible.
- Across jobs: a persistent **variety ledger** makes the *input* to that seeded choice
  differ. A re-render of job X reads the same ledger snapshot recorded on job X and picks
  the same track; a new job Y sees X's track in the ledger and steers away.

This gives "consecutive videos rarely sound the same" **and** keeps re-renders byte-stable.
The ledger snapshot must be persisted on the job for that to hold.

---

## 6. The redesign

### 6.1 M1 — Query & provider layer (fixes RC1, RC2, RC3, RC5) · highest value

**1. Stop asking in phrases. Ask in terms, widest-first.**

Replace the single joined lead query with a **query ladder** built from the profile:

```
tier A  two-term intersections drawn from the pack's vocabulary   ("techno pulse", "dark techno")
tier B  single genre terms from style[]                            ("techno", "electronic")
tier C  archetype fallback terms (§6.3)                            ("driving", "electronic")
```

Every tier is validated to be **≥2 words only when both words are common**. A term whose
`count` is 0 is never asked again — see the vocabulary audit in M3.

**2. Search wide, then rank — do not search narrow and widen on failure.**
Pool across the ladder up to a target pool size (~40, not 12), then let `scoreTrack` choose.
The pool is where variety lives.

**3. Vary the window per job.** Derive from the job seed:
- `sort` ∈ {`rating_desc`, `downloads_desc`, `score`, `created_desc`} — §2.3 shows 5 sorts
  give 67 distinct ids vs 15.
- `page` ∈ 1..3 on queries whose `count` supports it (`count` is returned free by the API).

This alone turns a 10-track window into a ~200-track window with no new provider.

**4. Bring tier 0 back.** The Pixabay bridge is the music-native source. Add a boot-time
reachability probe with a clear operator line, and surface `musicProvider` in the audio
report so a fallback-only run is visible in the UI, not just in stdout.

**5. Never ship the sine pad in no-VO mode.** With no voice, the pad *is* the film's whole
soundtrack. If every provider is dry, fail loudly to the disclosure rather than silently
delivering a drone. (Keep the pad for narrated films where it sits under a voice.)

### 6.2 M2 — Variety ledger (fixes RC4)

New table, `music_history(track_key, provider, pack, used_at, job_id)` in `db.js`.

- `track_key` = `provider:id` (Freesound id, Pixabay URL hash).
- On selection, write the row and **store the chosen key + the ledger cursor on the job**
  so a re-render reproduces (§5).
- In `scoreTrack`, apply a **recency penalty**, not a ban:

| Last used | Penalty |
|---|---|
| this pack, < 5 jobs ago | −40 |
| any pack, < 5 jobs ago | −25 |
| any pack, < 20 jobs ago | −10 |
| older / never | 0 |

A penalty rather than an exclusion means a thin catalogue still yields a track — it just
prefers a fresh one whenever one exists, which is exactly the brief's wording.

- Retain ~200 rows; prune oldest.

### 6.3 M3 — Template vocabulary that actually resolves (fixes RC1, RC6)

**Archetypes.** Add `audio.extends` to the pack schema — the inheritance noted as missing in
the previous audit. Seven archetypes covering the 61 packs:

| Archetype | Core terms (validated non-zero) | Packs |
|---|---|---|
| `tech` | electronic, techno, synth, futuristic, digital | ai-laboratory, neo-dashboard, digital-universe, pipeline… |
| `luxury` | cinematic, ambient, piano, elegant, minimal | minimal-luxury, midnight-glass, premiere-night… |
| `editorial` | acoustic, documentary, strings, orchestral, minimal | edition, grid-dispatch, editorial-motion… |
| `hype` | trap, beat, hiphop, energetic, drums | hype-wave, poster-pop, fight, reel… |
| `warm` | acoustic, folk, ukulele, guitar, happy | paper-tales, organic-garden, bloom-fable… |
| `retro` | synthwave, retro, arpeggio, outrun, 80s | retro-future, vapor-chrome, living-city… |
| `corporate` | corporate, upbeat, inspiring, motivational, clean | showcase, summit-keynote, mono-corporate… |

A pack keeps its own `musicKeywords` as *flavour on top*; the archetype guarantees a floor
that always resolves. This is what makes "no two templates feel identical" survivable — the
distinctness comes from **archetype + flavour + energy tier**, not from a unique phrase that
matches nothing.

**Energy tiers replace back-half rotation.** Tag each term `calm | mid | driving`. No-VO
mode selects from the `driving` tier of the pack's archetype — an explicit energy request
instead of today's positional guess (`audio_profile.js:150`).

**Vocabulary audit script.** `scripts/audit-music-vocabulary.js` runs every term in every
pack against the provider and **fails** on any term with `count === 0`. Run it in CI. This
is what would have caught RC1 on day one, and it is the highest-leverage single artifact in
this document.

**Then** — and only then — grow the per-pack keyword pool as the brief asks. Growth on a
validated vocabulary multiplies variety; growth on an unvalidated one multiplies zeroes.

### 6.4 M4 — Pacing (fixes RC7)

This is the one change that **breaks an existing product property** (§1.1), so it needs an
explicit decision.

**Recommended: author pacing at script time, and make the toggle a regeneration boundary.**

Pass `narration` into `script.js` and the storyboard prompt. With narration off:

| Property | Narrated | Music-led |
|---|---|---|
| Scene duration | 4.0–5.5 s | **2.0–3.0 s** |
| Scenes in 30 s | 6–7 | **10–14** |
| On-screen words/scene | 6–12 | **3–6** |
| Transition duration | 0.5–0.8 s | **0.25–0.4 s** |
| Motion envelope | ease-out, settle | **overshoot, no settle** |
| Camera | one move per scene | **continuous drift + one accent push** |

Cost: toggling narration after generation no longer keeps the picture, so the Script Room
must offer *"regenerate for music-led pacing"* rather than a silent swap. Worth it — copy
length and scene count are genuinely different problems with and without a voice, and
scaling durations post-hoc leaves 12 words on screen for 2.2 s.

**Cheaper interim (ship first, in front of M4):** a `pacingScale` multiplier applied at
composition time — scene durations × 0.7, transitions × 0.55, motion durations × 0.7 — with
copy that already fits. Gets ~60% of the perceived speed-up without touching script
authoring, and can ship in the same release as M1.

### 6.5 M5 — Mixing & synchronization (fixes RC8)

The mix chain is already right (§4); two genuine gaps remain, both specific to no-VO:

**1. Reverse duck — music under SFX.** With no voice there is no sidechain key, so an
impact and a bed peak collide with nothing arbitrating (`audio_mix.js:359-362` only keys SFX
off VO). In music-led mode, key the **music** off the SFX bus:

```
[muspre][sfxkey]sidechaincompress=threshold=0.12:ratio=4:attack=5:release=180[musfinal]
```

Shallow and fast — the accent cuts through, the bed returns before the next beat. This is
the brief's "ducking where multiple effects overlap", and it does not exist today.

**2. Beat-grid snapping.** Offline-analyse the chosen track once (ffmpeg onset detection or
a light BPM estimate), derive a beat grid, and **quantize SFX cue times to the nearest beat**
within a ±120 ms window. Cheap, no new dependency, and it is what makes sound and picture
feel authored together. Full picture-to-beat sync (moving cuts to beats) is a larger change
that belongs after M4 — snapping the cues is the 20% that delivers most of the effect.

---

## 7. Validation

| Test | Asserts | Gate |
|---|---|---|
| `test:music-vocabulary` | every term in every pack returns `count > 0` | **CI hard fail** |
| `test:music-diversity` | 20 simulated jobs on one pack → ≥15 distinct tracks | CI |
| `test:music-distinctness` | 7 archetypes × 3 jobs → no track shared across archetypes | CI |
| `test:no-pad-no-vo` | narration off never selects `generated-pad` | CI |
| `test:ledger-determinism` | re-render of job X with a populated ledger → identical track | CI |
| `test:novo-pacing` | narration off → mean scene duration ≤ 65% of narrated | CI |
| `test:sfx-beat-snap` | every cue within 120 ms of a beat | CI |
| `test:novo-loudness` | delivered MP4 in −16…−14 LUFS, true peak ≤ −1 dBTP | render-gated |

The first two are the ones that would have prevented this entire issue.

---

## 8. Phasing

| Phase | Content | Effort | Impact |
|---|---|---|---|
| **P0** | Vocabulary audit script + fix the dead terms; restore the Pixabay bridge; never-pad-in-no-VO | S | **Very high** — kills RC1/RC5 |
| **P1** | Query ladder, wide pooling, seeded sort/page variation | M | **Very high** — kills RC2/RC3 |
| **P2** | Variety ledger + recency penalty | M | High — kills RC4 |
| **P3** | Archetypes + energy tiers + enlarged keyword pools | M | High — the brief's template-awareness ask |
| **P4** | `pacingScale` interim, then script-time pacing | L | High — the "feels slow" complaint |
| **P5** | Reverse duck + beat-grid SFX snapping | M | Medium-high — the "designed together" feel |

P0+P1 are most of the perceived fix and touch three files
(`audio_profile.js`, `audio_sources.js`, one new script). I would ship those first and
measure before committing to P3–P5.

---

## 10. P0 + P1 as shipped (5 Aug 2026)

### What changed

| File | Change |
|---|---|
| `src/services/music_vocabulary.js` | **new** — term extraction, genre/colour partition, the query ladder |
| `src/services/audio_profile.js` | `musicCandidatesFor` now builds the ladder instead of joining a phrase |
| `src/services/audio_sources.js` | wide pooling (12 → 40), seeded sort/page window, seeded Pixabay index, generic widening restricted to legacy callers, pad refused with narration off |
| `src/services/pixabay_bridge.js` | **default port 3007 → 3000** |
| `src/agents/graph.js`, `services/pipeline.js`, `services/project_pipeline.js` | pass `seed` and `allowGeneratedPad` |
| `scripts/apply-audio-profiles.js` | 53 dead-term replacements across 33 packs |
| `frames/*/pack.json` | 33 packs rewritten by the profiles script |
| `scripts/audit-music-vocabulary.js` | **new** — the CI gate on term liveness |
| `scripts/test-music-diversity.js` | **new** — 11 offline regression tests |
| `package.json` | `test:music-vocab`, `test:music-diversity`, `audit:music-vocab`, both wired into `npm test` |

### The finding that mattered most

**The Pixabay bridge was never down — the client had the wrong port.** `pixabay_bridge.js`
defaulted to `:3007`; the service listens on `:3000` and always has
(`pixabay-no-node-modules/src/config.js:9`). Every call failed at the socket, fail-soft
swallowed it, and 100% of music came from Freesound's small music subset. A running service
was reported as absent for as long as that default existed. One character of config was
holding the primary music source offline.

### Results

| Measure | Before | After |
|---|---|---|
| Distinct tracks / 24 runs | — (8 of 12 in the smaller run) | **23 of 24** |
| Packs shipping a synthesized pad | 2 of 6 sampled | **0** |
| Lead query returning 0 results | 19 of 20 packs | **0 of 61** (audited) |
| Dead vocabulary terms | 25 (44 pack slots) | **0** |
| Music provider | Freesound 100% | **Pixabay 100%** |
| Search window per query | 10 results, one fixed ordering | 15 × 4 sorts × 3 pages, seeded per job |

The one remaining repeat (edition/jobBBB222 and grid-dispatch/jobAAA111) is two genuinely
editorial packs landing on the same documentary bed from different queries — exactly the
case the **P2 variety ledger** removes.

### Tests

`npm run test:audio` 31/31 · `test:audio-profiles` 61 up to date, 0 drifted ·
`test:music-diversity` 11/11 · `test:music-vocab` PASS (210 terms, 0 dead).

Two of the new tests failed on first run and caught real defects: a 3-word query
(`"hip hop hook"`) reintroducing the AND-match trap, and a compound genre pinned to the
front of the ladder making it the lead query on every job.

### Known limits

- The vocabulary audit measures **Freesound** (the metadata provider, now the fallback).
  Pixabay is the primary and its catalogue is broader, so the gate is conservative — a term
  it passes is safe on both, a term it fails may still work on Pixabay.
- 47 terms are THIN (3–11 tracks). They pass, but they cannot carry variety alone; the
  ladder always pairs them with a deep genre term.
- Ranking is still metadata-only. Pixabay exposes none, so there the steering is entirely
  the query and the index — RC6 is unchanged.

---

## 11. P2 as shipped — the variety ledger (5 Aug 2026)

### What changed

| File | Change |
|---|---|
| `src/services/music_history.js` | **new** — the ledger: penalties, the re-render pin, record/prune |
| `src/services/audio_sources.js` | recency penalty subtracted in ranking; Pixabay steps past recent tracks; pin resolved before searching; every selection recorded |
| `src/agents/graph.js`, `services/pipeline.js`, `services/project_pipeline.js` | pass `jobId` + `framePack` |
| `scripts/test-music-history.js` | **new** — 13 offline tests |
| `package.json` | `test:music-history`, wired into `npm test` |

Storage is `server/.cache/music-history.json` (gitignored, machine-local, capped at 200
rows) rather than a db table — `db.js` is a schemaless JSON job store, and this is
operational state, not job data.

### How the determinism tension was resolved (§5)

**A job's own row in the ledger is a PIN, not a penalty.** On a re-render, the job finds its
previous entry and re-downloads that exact track — Pixabay by URL, Freesound by re-resolving
the sound id. Every *other* job sees the same row as recent and steers away. That gives
variety across jobs and byte-stable re-renders from one mechanism, with no snapshot to
persist and no db change.

### Penalties, not bans

| Last used | Penalty |
|---|---|
| this pack, < 5 entries ago | −40 |
| any pack, < 5 entries ago | −25 |
| any pack, < 20 entries ago | −10 |
| older / never | 0 |

Subtracted from the rank score, never filtered from the pool: a thin genre must still yield
a bed. Two tests pin the two halves of that — a penalty *flips* the choice between two
metadata-identical tracks, and a penalty *cannot* make a 15-second loop beat a 120-second
track that covers the film.

Pixabay exposes no metadata to rank, so the equivalent there is positional: the seeded index
walks up to 3 places past anything in the recent set, keeping the last resolved URL as a
fallback so a one-result query still returns something.

### Live validation — three passes against the real providers

| Property | Result |
|---|---|
| Pass 2, same job ids → re-render reproduction | **6/6 pinned, identical file hashes** |
| Pass 3, new job ids on a warm ledger → avoids pass 1 | **0 repeats** |
| Distinct tracks across 12 new-job runs | **12/12** |

The edition ↔ grid-dispatch collision noted in §10 no longer occurs.

### Tests

`test:music-history` 13/13 · `test:audio` 31/31 · `test:music-diversity` 11/11 ·
`test:music-vocab` PASS · `test:audio-profiles` 0 drifted.

### Known limits

- The ledger is **global and machine-local**. Two servers keep separate histories; a wiped
  `.cache` loses the memory (and with it the pins, so old jobs would re-pick on re-render).
  Per-user scoping is §9.3 and still open.
- 200 rows is roughly the last 200 films. Beyond that a track is reusable — deliberate, so
  a long-lived studio does not slowly exhaust its own catalogue.
- Pinning re-downloads rather than caching the audio file, so a track deleted upstream falls
  back to a fresh search. Logged when it happens.

---

## 12. P3, P4, P5 as shipped (5 Aug 2026)

### P3 — archetypes and enlarged keyword pools

Eight archetypes (`tech`, `luxury`, `editorial`, `hype`, `warm`, `retro`, `corporate`,
`groove`) assigned by scoring each pack's own declared identity, then hand-corrected where
the score tied or a genre word misled (a funk-pop pack scores on "indie" and lands in the
folk pool). Pools grew **6 → 10 keywords on all 61 packs**, still ordered calm→driving.

**The design decision that matters:** an archetype contributes **colour only, never genre**.
`style[]` is untouched, because genre is what the query ladder leads with — pushing a shared
genre list into fifteen luxury packs would make them converge, which is the original defect
arriving from the other direction. A test asserts it directly: *"an archetype widens colour
but NEVER contributes genre"*, and it fails if every pack in an archetype ends up declaring
the same genres. The "guaranteed floor" the archetype was originally meant to provide turned
out to be unnecessary — P0's audit already reports 0 dead terms.

Schema gains `audio.archetype` (provenance; the expansion is baked in by
`apply-audio-profiles.js`, so nothing new resolves at runtime).

### P4 — no-voiceover pacing

`services/pacing.js` stamps a tempo on the storyboard — the one object every composer
already receives, so no composer signature changed. With narration off: motion durations
×0.68, cut overlap ×0.62, camera travel ×1.35 (and 1.25× harder at `energyBoost: 2`).

**Scope, stated honestly.** It scales *motion*, not *structure*:

| Family | Packs | Cuts | Inner motion |
|---|---|---|---|
| `om_port_kit` | 20 | ✅ | ✅ — every builder's timing runs through `ctx.du()` |
| `om_stage` | 7 | ✅ | ✅ — folded into the engine's existing `energy` divisor |
| `om_scene_cuts` | 12 | ✅ | ❌ — durations are literals across dozens of sites per file |
| `showcase` | 1 | ✅ | ❌ |

Scene count and durations are **not** touched. Those are the approved script's, and
rewriting them would silently invalidate what the user signed off — that remains the
product-gated decision in §6.4/§9.1. Two safeguards fell out of the tests:

- **A neutral tempo must be a literal no-op.** Wrapping the unscaled xfade in a rounder
  shifted one pack's golden output by a rounding step. Narrated films are byte-identical:
  `test:golden` reports **94 compositions unchanged**.
- **Ambient motion must not shorten.** A bed tween that spans its beat still spans it —
  otherwise "faster" becomes "emptier". Tested as the complement of the speed-up.
- A pack with `noVo.energyBoost: 0` (minimal-luxury) opts out of the pacing lift too. One
  control governs sound and picture, so they never disagree about the film's energy.

### P5 — reverse duck and beat-grid snapping

**Reverse duck** (`master.musicUnderSfxDuckDb`, −7 dB music-led, 0 narrated). With a voice,
everything already defers to speech and a third relationship would only pump. With none,
*nothing* arbitrated music against SFX — they collided and the limiter decided. The key is
high-passed at 180 Hz so a kick in the bed cannot key the duck against itself. It is
structural, like the duck bypass: an LLM plan cannot switch it on for a narrated film.
The `asplit` feeds two consumed outputs — the ffmpeg deadlock this file already paid for once.

**Beat grid** (`services/beat_grid.js`): ffmpeg decodes the kick band (60–180 Hz) to 8 kHz
mono, this builds an onset envelope, autocorrelates it for the period, and picks the phase
carrying the most energy. SFX cues snap to the nearest beat **only within ±120 ms** — the
point is to make picture and music agree where they nearly already do, never to overrule
`sfx_plan`'s placement. Order and minimum gap are preserved. Music-led films only.

**A false positive the tests caught:** normalizing the onset envelope divides by the largest
onset, so on a pure sine wave it amplified codec noise into a signal that autocorrelated
beautifully — **75 BPM at confidence 0.98 for a drone**. Fixed with a scale-invariant
percussiveness gate measured *before* normalizing. A track with no pulse now returns `null`
and cues stay where the picture put them.

### Tests

`test:audio` 31 · `test:audio-profiles` 0 drifted · `test:music-diversity` 15 ·
`test:music-history` 13 · `test:pacing` 17 · `test:beat-sync` 11 · `test:music-vocab` PASS ·
`test:golden` 94 byte-identical · `test:ghosts` 47 · `test:motion-safety` 47 ·
`test:transitions` 38 · `test:variety` 28. All new suites are in `npm test`.

### Known limits

- Twelve `om_scene_cuts` packs get tighter cuts but not quicker interiors (table above).
  Giving them the rest means a per-file pass — real work, not a config change.
- Beat detection is octave-ambiguous by nature; half/double time is a legitimate hearing of
  the same music and the tests accept the metrical relatives.
- Snapping moves SFX, not cuts. Moving the *picture* onto the beat is the larger change that
  belongs after the §6.4 pacing decision.

---

## 9. Open decisions for the product owner

1. **Pacing vs. the toggle.** Accept that turning narration off after generation requires a
   regenerate (§6.4)? Recommended yes.
2. **Pixabay bridge as a hard dependency in no-VO mode.** Fail the job with a clear message
   rather than deliver a Freesound-only or pad soundtrack? Recommended yes for no-VO only.
3. **Ledger scope.** Global, or per-user? Global is simpler and enough at current volume.
