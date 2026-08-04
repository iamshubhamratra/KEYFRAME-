You are working on KEYFRAME, a Node/Express AI video-generation platform. This is context
for its AUDIO PIPELINE. Treat every fact below as verified from source — do not re-derive it,
and do not contradict it without reading the file named.

# ARCHITECTURE

Entry: `src/agents/graph.js` → `voiceAgent` (LangGraph production path; this is what the UI
runs). `src/services/pipeline.js:runJob` and `project_pipeline.js` are older, simpler variants
of the same calls — `/api/generate` uses runJob and does NOT run the layout director or QA.

Three layers fetch CONCURRENTLY, then are curated, then mixed:

    Promise.all([ voTask, sfxTask, musicTask ])
      → audio_director.directAudio()   (LLM, fail-open)
      → audio_mix.mixPlan()            (deterministic ffmpeg)

Files:
    audio_sources.js    fetchMusic / fetchSfx      (providers)
    audio_profile.js    musicCandidatesFor, paletteCueFor
    sfx_plan.js         planSfx                    (support gate)
    audio_cues.js       CUES vocabulary, conditionCue
    sfx_library.js      getSfx                     (curated-first resolve)
    tts.js              synthesizeOpenRouter, computeVoVolume
    vo_fit.js           synthesizeFitted           (fitting ladder)
    audio_director.js   directAudio, sanitizePlan, applyAdvice
    audio_mix.js        mixPlan                    (ffmpeg filter graph)
    audio_report.js     disclosure

# EXTERNAL RESOURCES

| Resource | Used by | Auth | On failure |
|---|---|---|---|
| Pixabay bridge `localhost:3007/api/v1` | music, SFX | none (local scraper) | fail-soft → next tier |
| Freesound API v2 | music, SFX | `config.audio.freesoundToken`, `Authorization: Token <t>` | `[]` → next tier |
| Internet Archive | music | none | → next tier |
| ffmpeg pad synth | music | local | guaranteed floor |
| `assets/sfx/*.mp3` (9 files) | SFX | local | → web fallback |
| OpenRouter `openai/gpt-audio-mini` | voiceover | `config.llm.apiKey` | THROWS — no fallback voice |
| LLM `gemini-3-6-flash` | Audio Director, vo_fit tighten | `config.audioDirector.model` | fail-open → deterministic plan |
| ffmpeg / ffprobe | all | local | hard dependency |

`config.audio.pixabayKey` is the OFFICIAL API key. The official Pixabay API serves NO audio.
All Pixabay audio comes through the bridge. Do not "fix" music by using that key.

# FLOW 1 — MUSIC (search-and-rank)

Query list from `musicCandidatesFor()`, ordered — template identity leads, subject follows:
  1. pack keywords + pack mood   2. each keyword alone
  3. script.music.mood + query   4. pack style tags
Capped 5, deduped. Keywords rotate on seedKey `jobId|framePack`. No pack audio block →
script query only, `source:"script"` (the validation report reads this).

`fetchMusic()` tiers, first success wins:
  0 Pixabay bridge  — first hit in candidate order (no metadata to rank)
  1 Freesound       — POOLS ~12 results across candidates, THEN ranks
  2 Internet Archive— first mp3 of the 2-word core query
  3 generatePad()   — synthesized ambient bed; a silent film never ships

Freesound: filter `duration:[20 TO 180] tag:music`, sort `rating_desc`, retried without the
tag filter if dry. Download `previews["preview-hq-mp3"]` (CDN, no auth).

`scoreTrack()` weights — LENGTH FIT DOMINATES because short tracks are looped by the mixer
(`-stream_loop -1`) and a seam every 20 s is the most audible bed defect:
  length fit −15…+40 | tag overlap w/ pack style max +30 | avg_rating×3.2 max +16
  log10(downloads)×3 max +10 | candidate-rank bonus max(0, 8−rank×3)  ← tie-breaker, not veto

# FLOW 2 — SOUND EFFECTS (curated-first, intent-driven, gated on picture)

`planSfx()` — every cue must be SUPPORTED by something the composition does at that moment:
  cut    → scene boundary        (impact, whoosh, transition)
  reveal → asset/stat/emphasis   (ding, pop, click, tick)
  build  → only into the climax  (riser)
  never  → bed/ambience → belongs to music, not SFX
Survivors are SPREAD across runtime; budget scales with length; drops carry a reason.
No-VO + pack `sfxDensity:"rich"` → budget ×1.5. MORE cues allowed; support requirement
UNCHANGED — a denser mix must never mean unmotivated sounds.

`audio_cues.CUES` — 15 intents over 9 source files:
  ui-click soft-tap pop notification card-slide whoosh light-sweep logo-rise
  product-reveal gentle-impact shimmer counter-tick data-ping success cta-impact
Several intents SHARE a file; family `trimDb` + director gain differentiate them.
`paletteCueFor()` biases TIMBRE ONLY — cannot add, remove or move a cue.

`getSfx()`: curated `assets/sfx/<file>.mp3` first → web fallback (bridge → Freesound).

`conditionCue()` runs on curated AND fetched:
  silenceremove → atrim=0:maxSec → highpass=60 → volume(TARGET_PEAK − peak + trimDb)
  → 3 ms in-fade → areverse/afade/areverse → aresample=44100
Peak-normalised WITH family trim (a click and a riser peaking equally are not perceived
equally). Below −45 dBFS → rejected as silence, file deleted.

# FLOW 3 — VOICEOVER

Toggle acts at ONE place: `voEnabled = job.voiceover_enabled !== 0`, gating SYNTHESIS ONLY.
Script keeps its text; the storyboard already read it. PICTURE IS BYTE-IDENTICAL either way.
That is what makes it a mix control, not a regeneration. VO off = zero TTS spend.

Synthesis (`tts.js`): POST `{llm.baseUrl}/chat/completions`, model `openai/gpt-audio-mini`,
`modalities:["text","audio"]`, `audio:{voice,format:"pcm16"}`, `stream:true`,
`max_tokens:8192` (bounded so OpenRouter's affordability pre-check doesn't 402 short clips).
System prompt is a READ-EXACTLY directive, line wrapped in `<script>` tags — gpt-audio
ad-libs around loose framing. Timeout `max(90s, ceil(words/2.6)×2.5s + 30s)`.
SINGLE PROVIDER BY DESIGN — on failure it throws and the film ships without narration plus a
degradation note, rather than swapping in a different-sounding voice.

Leveling AT GENERATION (`computeVoVolume`), one constant gain during encode:
  target −20 dBFS gated RMS | peak ceiling −1.5 | gate −50 (pauses excluded from the
  measure) | silence −60 → untouched | max boost +30 dB
Takes the SAFER (smaller) of reach-target-RMS and stay-under-peak. Static multiply preserves
crest factor and LRA. Payoff: the mixer's `loudnorm=I=-16` then applies a small uniform
makeup instead of ~+21 dB of DYNAMIC makeup, which used to pump and lift the noise floor.

Fitting ladder (`vo_fit.synthesizeFitted`):
  0  transcript > 1.6×len+24  → model ad-libbed → ONE retake, same line
  1  dur > target×1.10        → LLM rewrite to target×2.1 words → re-synth
  2  dur > target×1.03        → atempo speed-up, capped 1.35×
  3  dur > target×1.05        → hard trim with fade (backstop)
2.1 words/sec is the MEASURED delivered rate; 2.6 was optimistic and left every "fitted"
line still overrunning. Rung 2 uses atempo not trim, to keep every word and stay synced.

Anti-overlap, after all clips return (graph.js):
  sort by startSec; each clip starts no earlier than previous END + 0.1 s breath.
  A line that overran nudges the next later instead of talking over it.

VO clips feed FOUR consumers: captions (measured SRT/VTT timing), Audio Director
(voPresent + word count → duckDepthDb), mixer (VO bus + duck key for BOTH other buses),
quality report.

# CURATION + MIX

Audio Director (LLM, fail-open, prompt `src/prompts/system_audio_director.md`).
NARRATION MODE is the first decision; everything else reads it:

                        "on" voice-led        "off" music-led
  musicSoloLufs         −23                   −18/−16/−14 by pack energyBoost
  musicUnderVoDuckDb    4…18 per scene        0 — NO SIDECHAIN BUILT
  musicMidCarveDb       −4 @2.5 kHz           0 — removed (no speech to protect)
  SFX window            −34…−14 def −22       −28…−10 def −16
  scene energy range    −6…+2                 −6…+5
Master limiter and −1 dBTP ceiling DO NOT MOVE between modes. Only the integrated target
changes — that is how "more dynamic range but never harsh" is enforced structurally.

Creative Director verdict has TWO DETERMINISTIC consequences (a model ignoring its own brief
must not be the only thing between a wrong-genre bed and the mix):
  music keep:false  → per-scene gain CAPPED at −3 dB, never raised (track is already on disk;
                      the fetching branch has finished, so refetch is impossible here)
  sfx reject[name]  → cue not accepted at all
Both are CEILINGS not deltas → applying to a plan that already accounted for the advice
cannot double-count. `applyAdvice` is idempotent.

`sanitizePlan` is the real authority — every LLM number clamped:
  musicSoloLufs      clamp(…, −32, noVo ? −12 : −14)   // above −14 cannot be recovered by ducking
  musicUnderVoDuckDb noVo ? 0 : clamp(…, −24, −4)      // PINNED in no-VO, not clamped
  duckDepthDb        voPresent && !noVo ? clamp(…,4,18) : 0
The pin matters: a duck with no key signal is not merely useless, it is a claim the report
would have to call false. The plan must not assert a duck the mixer will not build.

Mixer (`audio_mix.js`) — THE VOICE SPLITS THREE WAYS:
  vo → acompressor → highpass 90 → +3 dB @3 kHz → loudnorm(voLufs)
     → asplit=3 → [vomaster] [vokey] [vokeysfx]
Doctrine was always VO > SFX > music, but only MUSIC was ever ducked, so an accepted cue at
−14 dB could sit straight on a word.
  music duck: threshold 0.05, ratio clamp(duckDb×0.9,4,20), attack 40, release 500
  sfx   duck: threshold 0.08, ratio 6, attack 15, release 260   ← gentler+faster on purpose
Ducking the SUMMED sfx bus, not per-cue: cheaper and how a real desk does it.

Per-scene music envelope: `buildMusicEnvExpr()` compiles scene gains into ONE nested
`volume=volume='…':eval=frame` expression, built backwards from the last segment. Ramps sit
JUST BEFORE each boundary so the new level is reached AS THE SCENE OPENS.

Master: `[silence]+vo+music+sfx → amix(normalize=0) → alimiter(masterTruePeakDb, −1) → aac 160k`
`normalize=0` is ESSENTIAL — the default divides by input count and undoes every dB decision.
`[silence]` guarantees a valid stream when a layer is missing.

# INVARIANTS — DO NOT BREAK

1. Voiceover clarity is inviolable in voice-led mode. VO > important SFX > music > ambience.
2. Master limiter and −1 dBTP ceiling never move between narration modes.
3. Every `asplit` output MUST be consumed or ffmpeg DEADLOCKS. Three ways a key branch goes
   unused: no music at all, plan with zero duck depth, no surviving SFX. Track `voKeyUsed` /
   `voKeySfxUsed` and emit `anullsink` for unread branches.
4. `amix` must always carry `normalize=0`.
5. A cue conditioning out below −45 dBFS is deleted — silence is worse than no cue.
6. SFX support gate is non-negotiable, including in rich/no-VO density.
7. The picture must stay byte-identical whether narration is on or off.
8. Never substitute a different TTS voice on failure — ship silent + disclose.
9. `pack.json` `audio.sfxPalette` values must be real `CUES` keys or `validateAll()` fails.
   `audio.tempo` ∈ slow|mid|fast. `audio.noVo.sfxDensity` ∈ normal|rich.

# KNOWN TRAPS

- UNIT MISMATCH on adjacent plan fields: `scene.musicGainDb` is a DELTA on the loudnorm'd
  base; `sfx.gainDb` is an ABSOLUTE dB→linear conversion. Same object, different units.
- Captions are timed from synthesized VO clips → narration off means no cues and no
  .srt/.vtt. Fallback reuses Caption Director `bakedCues` and marks `cueTiming:"estimated"`.
  Burned-in captions were never at risk; only sidecar exports.
- Localization desync: the "speak entirely in <lang>" directive is gated on
  `captionPlan.voiceTranslate.ok`. On translation failure the text reverts to English, and a
  foreign directive over English text is an UNDETECTABLE desync.
- The Pixabay bridge is an external local service and the PRIMARY source for music and SFX.
  If it is down everything silently falls to Freesound with no error surfaced.
- Curated SFX library is only 9 files for 15 intents. Rebuild:
  `node scripts/build_sfx_library.js`.
- Node caches composer/service modules — RESTART THE SERVER before any job meant to verify
  a code change, or you will test the old code.

# VERIFICATION

Before claiming an audio change works:
  npm test                     # full suite
  node scripts/test-audio.js   # audio unit tests
Inspect the emitted ffmpeg filter graph in the `[audio_mix] plan mix […]` log line: it states
narration mode, vo count, music LUFS, kept/total sfx, duck on|bypassed, carve on|off.
For a real verdict use the PROJECTS flow (`POST /api/projects` → poll → `/approve`), not
`/api/generate` — only the projects path runs the production graph with QA.
