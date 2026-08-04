# The audio pipeline — music, sound effects, voiceover

How each of the three audio layers is chosen, fetched, conditioned and mixed, and every
external resource it depends on. Written from the code, not the design intent — file and
function references are exact so this stays checkable.

**Entry point for all three:** `src/agents/graph.js` → `voiceAgent` (the LangGraph production
path). `src/services/pipeline.js` (`runJob`) and `src/services/project_pipeline.js` carry
older, simpler variants of the same calls; the graph is what the UI uses.

The three layers are fetched **concurrently** (`Promise.all([voTask, sfxTask, musicTask])`),
then curated by the Audio Director, then mixed by ffmpeg.

---

## 0. Resource inventory

| Resource | Used by | Auth / location | Failure behaviour |
|---|---|---|---|
| **Pixabay bridge** | music, SFX | `http://localhost:3007/api/v1` (env `PIXABAY_BRIDGE_URL`); disable with `PIXABAY_BRIDGE_DISABLED=1` | fail-soft → next tier |
| **Freesound API v2** | music, SFX, library build | `config.audio.freesoundToken`, header `Authorization: Token <t>` | returns `[]` → next tier |
| **Internet Archive** | music only | public search API, no auth | → next tier |
| **ffmpeg pad synthesis** | music only | local ffmpeg | guaranteed floor |
| **Local SFX library** | SFX | `server/assets/sfx/*.mp3` (9 files + `manifest.json`) | → web fallback |
| **OpenRouter `gpt-audio-mini`** | voiceover | `config.llm.apiKey`, `POST {llm.baseUrl}/chat/completions` | **throws — no fallback voice** |
| **LLM (`gemini-3-6-flash`)** | Audio Director, `vo_fit` tighten | `config.audioDirector.model`, routed via KIE/OpenRouter | fail-open → deterministic plan |
| **ffmpeg / ffprobe** | all three | local binaries | hard dependency |

`config.audio` fields actually read: `freesoundToken`, `pixabayKey`, `ttsModel`,
`defaultMusicVolume`. Note `pixabayKey` is the **official API** key — Pixabay's API serves
no audio, so music/SFX come through the bridge, not that key.

**User toggles** (`src/routes/generate.js`): `music`, `sound_effect`/`soundEffect`,
`tts`. The voiceover toggle is also persisted as `job.voiceover_enabled`.

---

## 1. Background music

### 1.1 Query construction — `audio_profile.musicCandidatesFor()`

Produces an **ordered** candidate list. Template identity leads, subject follows:

```
1. <pack keywords> + <pack mood>     ← lead: specific enough to land in the genre,
                                       short enough that the provider returns something
2. each keyword alone                ← widening, still inside the pack's vocabulary
3. script.music.mood + script.music.query
4. pack style tags (first 2)
```

Capped at 5, deduped. Keywords rotate deterministically on `seedKey = jobId|framePack`, so
two films on one template sound related but never identical. `narration: "off"` tilts the
rotation toward the pack's driving end.

A pack with no `audio` block in its `pack.json` returns only the script query and reports
`source: "script"` — which is exactly what `audio_report.musicFromTemplate` reads to state
whether the template actually steered the search.

### 1.2 Fetch — `audio_sources.fetchMusic()`

Every candidate is normalised first (word-deduped: callers join `query + mood`, which often
repeats). A 2-word `core` and `"<word> music"` are appended as final widening retries.

| Tier | Source | Selection strategy |
|---|---|---|
| 0 | Pixabay bridge | **first hit in candidate order** — no metadata to rank on |
| 1 | Freesound | **pools ~12 results across candidates, then ranks** |
| 2 | Internet Archive | first mp3 for the broad `core` query |
| 3 | `generatePad()` | synthesized ambient bed — a silent film never ships |

Freesound filter: `duration:[20 TO 180] tag:music`, `sort=rating_desc`; retried without
`tag:music` if dry. Download URL is `previews["preview-hq-mp3"]` — a CDN URL needing no auth.

Tier 1 is the only ranked tier — `scoreTrack()`:

| Signal | Weight | Why |
|---|---|---|
| **Length fit** | −15 … +40 | dominates: a short track is looped by the mixer, and a seam every 20 s is the most audible defect a bed can have |
| Tag overlap with pack `style` | max +30 | makes the search template-aware at *ranking* as well as query time |
| `avg_rating × 3.2` | max +16 | separates usable from unlistenable |
| `log10(downloads) × 3` | max +10 | weak popularity signal |
| Candidate rank bonus | `max(0, 8 − rank×3)` | tie-breaker toward the template's vocabulary — **not** a veto |

The caller passes a `selection` object that `fetchMusic` fills with
`{ query, provider, rank, score, ranked }` for the validation report.

### 1.3 Mix

`-stream_loop -1` → `loudnorm=I=<musicSoloLufs>:TP=-2:LRA=11` → per-scene volume envelope →
optional 2.5 kHz carve → fades → optional sidechain duck. See §4.

---

## 2. Sound effects

Completely different shape from music: **curated-first, intent-driven, gated on the picture.**

### 2.1 Planning — `sfx_plan.planSfx()`

Replaces a one-line loop that took the first two cues in document order with a hard cap of 2.
In the audited 30-second film that put both cues inside the first four seconds and discarded
five requested cues purely because of array position.

Every candidate must be **supported by something the composition actually does**:

| Family | Needs | Cues |
|---|---|---|
| `cut` | a scene boundary | impact, whoosh, transition, swipe… |
| `reveal` | an asset plate / stat / emphasis word arriving mid-scene | ding, pop, click, tick, chime… |
| `build` | heading **into** the climax (CTA / final scene) | riser, ramp, uplifter |
| `never` | — | beds/ambience — belong to the music track, not SFX |

Survivors are **spread across the runtime** rather than clustered, the budget scales with
length, and everything dropped is reported with a reason so the disclosure can explain why
the film is quieter than the script asked.

With narration off and the pack's profile set to `sfxDensity: "rich"`, the budget scales
×1.5 — **more cues are allowed, but the support requirement is unchanged.** A denser mix must
still never mean unmotivated sounds.

### 2.2 Intent, not the script's word — `audio_cues.js`

The script model emits free-text `scene.sfx[]`. Matched against a 9-word library, a logo
reveal, a counter, a card slide and a CTA all asked for *"whoosh"*. Nothing mapped what a
scene **does** to what it should **sound like**.

`CUES` is an intent-first vocabulary of **15 names** over **9 source files**:

```
ui-click · soft-tap · pop · notification · card-slide · whoosh · light-sweep
logo-rise · product-reveal · gentle-impact · shimmer · counter-tick · data-ping
success · cta-impact
```

Several intents share a source file; the **family `trimDb`** and the director's gain are what
differentiate them.

`audio_profile.paletteCueFor()` then biases **timbre only** — terminal-departures' transition
is a synthy sweep, paper-tales' is a paper slide. It cannot add, remove or move a cue, so the
support gate still governs whether anything fires.

### 2.3 Resolve — `sfx_library.getSfx()`

1. **Curated** — `assets/sfx/<spec.file>.mp3`, copied and conditioned. Deterministic, zero
   randomness. Built once by `scripts/build_sfx_library.js` (Freesound, hand-tuned queries).
2. **Web fallback** — `fetchSfx()` → Pixabay bridge → Freesound, only for a cue we understand
   well enough to search for.

### 2.4 Conditioning — `audio_cues.conditionCue()` (curated *and* fetched)

Levels were not comparable before this: cues arrived from live keyword search with no gate,
and even the shipped library was program-normalised (`loudnorm=I=-18`) — **meaningless on a
sub-second one-shot**. Measured result: `impact` sat 8 dB below every other cue, so the film's
climax hit was inaudible by construction.

```
silenceremove → atrim=0:maxSec → highpass=60
→ volume(TARGET_PEAK − peak + family trimDb)
→ afade in 3 ms → areverse/afade/areverse (trailing fade without knowing length)
→ aresample=44100
```

Peak-normalised **with a family trim**, because a click and a riser peaking at the same level
are not perceived at the same level. Anything under **−45 dBFS is rejected as silence** and
the file deleted — a fetched cue that conditions out to nothing is worse than no cue.

---

## 3. Voiceover

The only layer whose timing feeds **back into the picture** (captions) and into the mix
(it is the duck key for both other buses).

### 3.1 The toggle acts at exactly one place

```js
const voEnabled = job.voiceover_enabled !== 0;
```

Only **synthesis** is gated. The script keeps its narration text and the storyboard has
already read every line, so the **picture is byte-identical** whether narration is on or off.
That is what makes this a mix control rather than a regeneration. VO off also costs **zero
TTS** — the largest per-character spend in the audio stage.

### 3.2 Voice — `graph.pickVoice()`

Explicit name wins; otherwise gender/tone cues map onto one of ten `gpt-audio` voices
(`alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar`).

Gender cues match on **word boundaries** — `includes("man")` fired inside "hu**man**" and
`includes("he ")` inside "t**he** ", forcing neutral and female-leaning brands onto a male
voice before the tone branches ran.

### 3.3 Synthesis — `tts.synthesizeOpenRouter()`

```
POST {llm.baseUrl}/chat/completions
  model: openai/gpt-audio-mini
  modalities: ["text","audio"]
  audio: { voice, format: "pcm16" }
  stream: true
  max_tokens: 8192        ← bounded so OpenRouter's affordability pre-check
                            doesn't 402 short clips on a low daily budget
→ base64 pcm16 (24 kHz mono) deltas → ffmpeg → mp3
```

System prompt is an explicit **read-exactly** directive with the line wrapped in `<script>`
tags — `gpt-audio` ad-libs around loosely framed input.

Timeout scales with length: `max(90s, ceil(words/2.6) × 2.5s + 30s)`.

**Single provider, no fallback by design.** On failure synthesis throws and the film ships
without narration plus a degradation note, rather than swapping in a different-sounding voice.

### 3.4 Leveling at generation — `tts.computeVoVolume()`

One constant gain applied during encode, not in the mix:

| Constant | Value | Purpose |
|---|---|---|
| `VO_TARGET_RMS_DBFS` | −20 | consistent speech staging level |
| `VO_PEAK_CEIL_DBFS` | −1.5 | sample-peak ceiling → true peak ≈ −1 |
| `VO_GATE_DBFS` | −50 | **pauses excluded** from the loudness measure |
| `VO_SILENCE_DBFS` | −60 | whole clip below → leave untouched |
| `VO_MAX_BOOST_DB` | 30 | a near-dead clip's floor can't explode |

Takes the **safer (smaller)** of "reach target RMS" and "stay under peak ceiling". Because it
is a static multiply it preserves crest factor and LRA exactly — only absolute level moves.
The payoff: the mixer's later `loudnorm=I=-16` applies a small uniform makeup instead of
**~+21 dB of dynamic makeup**, which is what used to pump and lift the noise floor.

### 3.5 Fitting — `vo_fit.synthesizeFitted()`

| Rung | Trigger | Action |
|---|---|---|
| 0 | transcript > `1.6 × len + 24` | model ad-libbed → **one retake**, same line |
| 1 | `dur > target × 1.10` | LLM rewrites to `target × 2.1` words → re-synth |
| 2 | `dur > target × 1.03` | **atempo** speed-up, capped **1.35×** |
| 3 | `dur > target × 1.05` | hard trim with fade — absolute backstop |

`2.1 words/sec` is the **measured** delivered rate of the gpt-audio voices; 2.6 was optimistic
and left every "fitted" line still overrunning. Rung 2 uses atempo rather than a trim
specifically to keep every word and stay synced.

### 3.6 Anti-overlap sequencing (`graph.js`, after all clips return)

```js
voClips.sort(by startSec)
for (const c of voClips) {
  c.startSec = max(c.startSec, voCursor)   // never before the previous line's END
  voCursor   = startSec + durationSec + 0.1 // + a breath
}
```

A line that still overran nudges the next one later instead of talking over it —
**intelligible speech beats frame-perfect sync.**

### 3.7 Four consumers

1. **Captions** — `buildCues()` derives SRT/VTT from *measured* clip timing
2. **Audio Director** — `voPresent` + measured word count drive per-scene `duckDepthDb`
3. **Mixer** — the VO bus, and the duck key for music *and* SFX
4. **Quality report** — degradation disclosure

**Trap:** captions are timed from synthesized clips, so narration off means no clips, no
cues, no `.srt`/`.vtt` — backwards, since silent-autoplay social video is where subtitles
matter most. The fallback reuses the Caption Director's `bakedCues` (estimated timing) and
marks `cueTiming: "estimated"`. Burned-in captions were never at risk; only sidecar exports.

**Localization desync guard:** the "speak entirely in `<language>`" directive is gated on
`captionPlan.voiceTranslate.ok`. On translation failure the text reverts to English, and a
foreign directive over English text produces an *undetectable* desync.

---

## 4. Curation and mix

### 4.1 Audio Director — `audio_director.directAudio()`

LLM (`gemini-3-6-flash`) with `src/prompts/system_audio_director.md`. **Fail-open**: disabled
or erroring returns a deterministic plan derived from scene kinds.

**Narration mode is the first decision** and every other one reads it:

| | `"on"` — voice-led | `"off"` — music-led |
|---|---|---|
| `musicSoloLufs` | −23 | −18 / −16 / −14 by pack `energyBoost` |
| `musicUnderVoDuckDb` | 4…18 per scene | **0 — no sidechain built** |
| `musicMidCarveDb` | −4 (2.5 kHz) | **0 — removed** |
| SFX window | −34…−14, def −22 | −28…−10, def −16 |
| Scene energy range | −6…+2 | −6…+5 |

The master limiter and −1 dBTP ceiling **do not move between modes**. Only the integrated
target changes — that is how "music may occupy more dynamic range but must never become
harsh" is enforced structurally.

**The Creative Director's verdict has two deterministic consequences** (a model that ignores
its own brief must not be the only thing between a wrong-genre bed and the mix):

- `music keep:false` → per-scene gain **capped at −3 dB**, never raised. The track is already
  on disk and the fetching branch has finished, so the honest response is to push it under
  the voice rather than refetch.
- `sfx reject[name]` → cue not accepted at all.

Both are **ceilings, not deltas**, so applying them to a plan that already accounted for the
advice cannot double-count. `applyAdvice` is idempotent.

**`sanitizePlan` is the real authority** — every LLM number is clamped:

```js
musicSoloLufs:      clamp(…, -32, noVo ? -12 : -14)  // a bed above −14 cannot be
                                                      // recovered by ducking alone
musicUnderVoDuckDb: noVo ? 0 : clamp(…, -24, -4)      // PINNED in no-VO, not clamped
duckDepthDb:        voPresent && !noVo ? clamp(…, 4, 18) : 0
```

The pin matters: *a duck with no key signal is not merely useless, it is a claim the report
would have to call false.* The plan cannot assert a duck the mixer will not build.

### 4.2 Mixer — `audio_mix.js`

**The voice splits three ways, not two:**

```
vo → acompressor → highpass 90 → +3 dB @3 kHz → loudnorm(voLufs)
   → asplit=3 → [vomaster] [vokey] [vokeysfx]
```

Doctrine had always been VO > SFX > music, but **only music was ever ducked** — so an accepted
cue at −14 dB could sit straight on top of a word.

| Bus | Threshold | Ratio | Attack | Release |
|---|---|---|---|---|
| Music | 0.05 | `clamp(duckDb × 0.9, 4, 20)` | `duckAttackMs` (40) | `duckReleaseMs` (500) |
| SFX | 0.08 | 6 fixed | 15 ms | 260 ms |

The SFX duck is deliberately gentler and faster — cues are *meant* to be heard, just never
over a word. Ducking the summed bus rather than each cue is cheaper and more correct: it is
how a real desk does it.

**Per-scene music envelope** — `buildMusicEnvExpr()` compiles the scene gains into one nested
`volume=volume='…':eval=frame` expression, built backwards from the last segment. Ramps sit
*just before* each boundary so the new level is reached **as the scene opens**.

**Deadlock trap:** every `asplit` output must be consumed or ffmpeg **hangs**. Three ways a
key branch goes unused — no music at all, a plan with zero duck depth, no surviving SFX — and
only the last was originally handled. `voKeyUsed`/`voKeySfxUsed` are tracked and `anullsink`
emitted for any unread branch. The "no music" case was a latent stall that fired whenever TTS
succeeded and every music source came up dry.

**Master:**

```
[silence] + vo + music + sfx
  → amix(normalize=0)      ← essential: the default divides by input count and
                             would undo every dB decision above
  → alimiter(limit = masterTruePeakDb, default −1 dBTP)
  → aac 160k
```

The `[silence]` input guarantees a valid stream when a layer is missing.

---

## 5. Gotchas worth carrying

- **Unit mismatch on adjacent plan fields.** `scene.musicGainDb` is a *delta* on the
  loudnorm'd base; `sfx.gainDb` is an *absolute* dB → linear conversion. Same object,
  different units.
- **The Pixabay bridge is an external local service** and the *primary* source for both music
  and SFX. If it is not running, everything silently falls through to Freesound — fail-soft
  by design, but the music source can change with no error surfacing.
- **`config.audio.pixabayKey` is not what fetches Pixabay audio.** It is the official API key;
  the official API serves no audio. The bridge does.
- **The curated SFX library is only 9 files** for 15 intents. Family trims and director gains
  do the differentiating. Rebuild with `node scripts/build_sfx_library.js`.
- **`sfxPalette` values in a `pack.json` must be real `CUES` keys.** Invented names fail
  `validateAll()`.
