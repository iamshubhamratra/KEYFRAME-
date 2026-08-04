# KEYFRAME — Audio Pipeline Audit (2026-07-28)

> End-to-end review of the Audio Director agent, the sound-effect selection pipeline, and
> the mixing architecture. Every finding is read out of the live code or measured from the
> shipped assets, and cited `file:line`.

---

## 0. The finding that explains most of the complaint

The sound you hear for `"whoosh"` is **the first Pixabay search result for the word
"whoosh"** — fetched live, ungated, un-normalized, different from run to run.

`sfx_library.js` opens by describing the opposite:

```
// Curated SFX resolution. The script's sfx[] names resolve to the local,
// loudness-normalized library (assets/sfx/…) — deterministic, professional,
// zero randomness.                                    (sfx_library.js:1-5)
```

and then implements the inversion (`sfx_library.js:52-67`): Pixabay first, Freesound
second, **curated library only if both are dry**. Every symptom in the report follows from
that one line of ordering:

| Reported symptom | Mechanism |
|---|---|
| "random sound effects that do not match the scene" | a keyword search returns whatever a stranger tagged "whoosh" — a jet, a mouth swipe, a cartoon zip |
| "inconsistent audio quality between effects" | no bitrate, loudness, duration or clipping gate on the fetched file (`audio_sources.js:277-303`; the Pixabay path checks `minBytes: 2000` and nothing else) |
| "generic whoosh used excessively" | the whole vocabulary is **9 words** (`assets/sfx/`), so every cue collapses onto one of them |
| "repetitive effects" | same 9 names, re-fetched per film |

---

## 1. The library is 9 cues, and its loudness is not what it claims

`assets/sfx/` — click · ding · impact · pop · riser · sparkle · swoosh · transition · whoosh.

Measured integrated loudness of the shipped files:

| cue | integrated | note |
|---|---|---|
| ding / riser / sparkle / swoosh / transition / whoosh | −18.4 LUFS | as intended |
| **impact** | **−26.2 LUFS** | **8 dB below everything else** |
| click / pop | *unmeasurable* | shorter than the integrated-LUFS window |

Root cause: `scripts/build_sfx_library.js:34` normalizes with single-pass
`loudnorm=I=-18` — a **program-loudness** algorithm applied to sub-second one-shots.
For `click`/`pop` there is no integrated measurement to act on, and for `impact` it
mis-corrected by 8 dB.

**Consequence:** when the Audio Director asks for an impact on the CTA — the film's
emotional peak — it lands 8 dB under every other cue. The climax has no punch, by
construction. One-shots must be **peak**-normalized, not program-normalized.

---

## 2. The mixer processes the voice and the music, and leaves SFX raw

`audio_mix.js` is otherwise a genuine broadcast chain: VO gets compressor → presence EQ →
`loudnorm` → duck key; music gets `loudnorm` → per-scene envelope → mid-carve EQ → fades →
sidechain duck. Then the SFX bus (`audio_mix.js:291-300`):

```js
parts.push(`[${s.idx}:a]${delay}volume=${gain},aresample=44100[${lbl}]`);
```

`adelay` + `volume`. That is the whole chain. Missing, and each maps to a reported symptom:

| Missing | Symptom it causes |
|---|---|
| loudness/peak normalization | "inconsistent quality between effects" — a hot file blasts, a quiet one vanishes |
| **sidechain duck under the VO** | "SFX compete with the voice-over" — the doctrine says VO > SFX, but only MUSIC is ducked |
| edge fades | clicks/pops where a file starts or ends on a non-zero sample |
| high-pass | web files carry sub-bass rumble that muddies the voice |

**Music envelope is a step function.** `buildMusicEnvExpr` (`audio_mix.js:198-209`) emits
nested `if(between(t,…))` — the per-scene gain changes **instantly** at every boundary.
That is the reported "abrupt audio transitions between scenes", and it is arithmetic, not
taste: a −5 dB → +2 dB jump in one sample is a click.

---

## 3. Planning: structurally sound, semantically blind

`sfx_plan.js` is good work and not the problem: every cue must be *supported* by something
on screen (`cut`/`reveal`/`build`), survivors are spread with a minimum gap, the budget
scales with runtime, the climax slot is reserved, and everything dropped carries a reason.

Its limitation is **vocabulary, not logic**: the candidate names come from the script's
free-text `scene.sfx[]`, and `resolveCue` can only map them onto the 9 curated words. There
is no route from *what the scene does* to *what it should sound like* — a logo reveal, a
counter, a card slide and a CTA all end up asking for "whoosh".

And the Audio Director **cannot fix this**: it only curates candidates already fetched
(`system_audio_director.md` — "You curate THESE… you do not invent new ones"). Given a bad
whoosh it can only reject it (leaving silence) or accept it. It cannot ask for a soft riser.

**So the intelligence sits in the wrong place.** The director reasons well about levels and
timing; nothing reasons about *timbre*.

---

## 4. What is missing entirely

- **No ambient/pad layer.** Music + SFX + VO only.
- **No audio validation.** `audio_review` stores the LLM's own self-reported score; nothing
  verifies that each accepted cue maps to a scene, that there are no duplicates, or that
  levels are sane.
- **No mood taxonomy.** `music.query` is whatever the script model wrote; there is no
  category → brief mapping (tech = modern/optimistic, finance = confident/trustworthy).

---

## 5. Root-cause summary

| # | Root cause | Severity | Fix |
|---|---|---|---|
| A1 | Curated-library contract inverted; web search is primary and ungated | **Critical** | curated first; condition + gate anything fetched |
| A2 | One-shots program-normalized → `impact` 8 dB down, clicks unmeasured | **Critical** | peak-normalize at use time, per family |
| A3 | SFX bus has no normalization, no duck, no fades, no HPF | **High** | build a real SFX bus |
| A4 | Music envelope steps between scenes | **High** | ramp the envelope |
| A5 | No scene-semantics → cue mapping; 9-word vocabulary | **High** | intent table keyed on role/animation |
| A6 | Director can only curate, never request timbre | Medium | plan intent upstream, director keeps levels |
| A7 | No ambient bed | Medium | (roadmap) |
| A8 | No validation report | Medium | deterministic audio report |

---

## 6. What shipped

### A1 — the source contract, restored
`sfx_library.getSfx` now goes **curated first**, web as fallback (`sfx_library.js`). A
fetched cue that conditions out as silence is discarded rather than mixed.

### A2 — conditioning: every cue arrives comparable
New `services/audio_cues.js`. Whatever the origin, a cue is de-silenced at the head,
bounded to its family's max length, high-passed at 60 Hz, edge-faded, and **peak**-
normalized to −1.5 dBFS with a per-family trim. `scripts/build_sfx_library.js` was
switched off `loudnorm` for the same reason, so a rebuild cannot reintroduce the defect.

> **A bug found while testing this, worth recording:** `astats` writes its measurements at
> ffmpeg's **info** log level. The first implementation ran it under `-v error` (the habit
> everywhere else in this codebase), so it printed nothing, every cue measured as
> "unmeasurable", and conditioning silently did nothing at all — while the test that was
> supposed to prove it *passed*, because the library's peaks happened to fall inside the
> tolerance. Both the module and the test now run astats at info.

### A5/A6 — intent decides the sound, not a keyword
`audio_cues.intentFor()` maps what a scene DOES onto a 15-cue vocabulary (logo-rise,
ui-click, card-slide, counter-tick, data-ping, product-reveal, notification, success,
cta-impact, …). `sfx_plan` consumes it, and **the picture outranks the script**: on a scene
with an unmistakable signal — a number, a logo, the close — the derived intent wins even
when the script asked for something valid.

> That precedence *was* the first version's bug: `"whoosh"` is itself a legal intent, so
> "prefer the script's word when it resolves" kept the whoosh on a counter scene — the
> original defect in a new costume. The test `a counter scene no longer asks for a whoosh`
> exists to pin it.

A scene with a strong moment now earns a cue even when the script forgot to ask, so a logo
arrival or a CTA is never silent by omission. Dedup compares the resolved **sound**, so
"impact" and "boom" count as the same cue back-to-back.

### A3 — a real SFX bus
`audio_mix.js`: cues are high-passed, edge-faded, summed into one bus, and **sidechain-
ducked under the voice** (the doctrine always said VO > SFX; only music was ever ducked).
The VO split went from 2-way to 3-way to key it.

### A4 — the music envelope ramps
`buildMusicEnvExpr` interpolates across a ~400 ms crossover at each boundary instead of
emitting `if(between(t,…))` step changes. The reported "abrupt transitions between scenes"
were arithmetic: a −5 → +2 dB jump in one sample is a click.

### A8 — deterministic validation
New `services/audio_report.js` + `db.setAudioReport`. It checks the finished soundtrack
rather than trusting the director's self-score: every effect mapped to a real scene, no
duplicates, nothing firing without an on-screen action, no two hits inside 400 ms, ducking
on, loudness targets set — and scores it.

### Verified on a real film

24 s Stripe Billing promo, `aurora-spectrum`, generated end to end:

```json
{ "backgroundMusic": "confident minimal tech", "soundEffects": 3, "sceneMatches": 3,
  "voiceoverDucking": true, "sfxDucking": true, "audioNormalization": true,
  "duplicateEffects": 0, "qualityScore": 100, "issues": [] }
```

```
cues: logo-rise@1.2s (element reveal) · ui-click@5.2s (element reveal) · cta-impact@20.1s (build into the climax)
```

Three cues, each named for what it lands on, spread across the runtime — against the
previous behaviour of two generic hits inside the first four seconds. The director
rejected 1 of 4 candidates; delivered audio measures −18 to −23 dB RMS across the film
with no clipping. `npm run test:audio` — 13 assertions.

---

## 7. Not done — honest scope

- **No ambient/pad layer** (A7). The brief asks for one; music + SFX + VO is still the
  full stack.
- **The library is still 9 source files.** The 15 intents map onto them with per-family
  trims, so a `counter-tick` is a trimmed `click` rather than a bespoke tick. The
  *selection* is now correct; the *palette* is still thin. Widening it needs licensed
  source audio, which is a sourcing decision, not a code change.
- **No music mood taxonomy.** `music.query` is still whatever the script model wrote
  (it produced "confident minimal tech" here, which is fine — but nothing enforces
  tech/finance/education briefs).
- **One film is one data point.** The report is deterministic, but "does it *sound*
  intentional" is a judgement no test makes.
