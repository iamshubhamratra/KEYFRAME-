# Flexible Audio Generation System — Design & Integration Plan

**Status: SHIPPED** (2026-07-31, branch Rohit) — all four phases. This document is kept as the
design record; the sections below describe what was built, not what was proposed.

Where the delivered system differs from this plan:

- **All 43 packs got a profile**, not the 6 flagship packs of §8's P2. They are authored in one
  reviewable table (`server/scripts/apply-audio-profiles.js`) rather than 43 hand edits, with a
  `--check` mode wired into `npm test` so the table and the manifests cannot drift.
- **Open question 2 resolved: stay in character.** `noVo.energyBoost` nudges within the pack's
  own keyword list (which is authored calmest-first) instead of changing genre. `minimal-luxury`
  ships `energyBoost: 0` as the deliberate opt-out.
- **The 2.5 kHz carve became a plan field** (`master.musicMidCarveDb`) rather than a mixer
  constant, so the mixer executes a decision instead of an assumption and the report can state
  what was applied.
- **A latent ffmpeg deadlock was fixed on the way through.** `mixWithPlan` splits the voice bus
  three ways; the duck branch is now conditional on depth, and an unconsumed split output stalls
  ffmpeg. The sinks are now explicit — which also closes the pre-existing case of "VO synthesized
  but every music source came up dry".
- **The legacy `project_pipeline` path now builds an audio report too.** It never had one, so a
  film produced on that orchestrator had no soundtrack record at all.

Operator reference: `server/docs/TEMPLATE-AUDIO-IDENTITY.md`.

---

**Original header:** design, not implemented · **Date:** 2026-07-30 · **Branch:** Rohit

Every claim is cited to current code. As with the asset-reuse brief, a large part of what is
requested **already exists and works** — and the most useful thing this document can do is
say which part, so the effort goes where the gap actually is.

---

## 0. What already exists (do not rebuild)

| Requested | Status | Where |
|---|---|---|
| Audio Director agent | **Built** — LLM decision service + deterministic `defaultAudioPlan`, fail-open, config-gated | `services/audio_director.js` |
| Ducking under narration | **Built** — real `sidechaincompress` keyed off a VO bus | `audio_mix.js:151` |
| Per-scene VO awareness | **Built** — the plan carries `voPresent` per scene and sets `duckDepthDb: 0` where there is no voice | `audio_director.js:233, :279` |
| Normalize / prevent clipping / fades | **Built** — per-clip `loudnorm`, `afade` in+out, master `amix` → **`alimiter`** | `audio_mix.js` `mixWithPlan` |
| Music never overpowering voice | **Built** — music gets a 2.5 kHz EQ carve plus the sidechain duck | per `[[audio-director-agent]]` |
| Scene-aware SFX selection | **Built, and stronger than the brief asks** — every cue must be *supported* by something the composition actually does at that moment; survivors are spread across the runtime; every drop is reported with a reason | `services/sfx_plan.js` |
| SFX grouped by function | **Built** — `audio_cues.CUES` is already an INTENT vocabulary (`ui-click`, `card-slide`, `counter-tick`, `product-reveal`, `success`, `shimmer`, `logo-rise`…) resolved from the script's raw words | `services/audio_cues.js:34-71` |
| Audio validation framework | **Built** — effects mapped to scenes, duplicates, unjustified cues, ducking, loudness, quality score | `services/audio_report.js` |

So: **the mixing engine, the ducking, and the scene-aware SFX logic are done.** The brief's
"sound effects selected based on scene type and animation rather than randomly" describes
`sfx_plan.js` as it already runs.

### What is genuinely missing

1. **The voiceover toggle.** No UI, no API field, no propagation. `grep` for
   `voiceoverEnabled|enableVoiceover|disableVoice` returns nothing across `server/src` and `web/src`.
2. **Template audio identity.** `frame_manifest`'s schema has `colors / fonts / surface /
   motion / fx / skin / assets / typography / brand` — **no `audio`**. No pack declares one.
3. **Music is template-blind.** The query is `script.music.mood + script.music.query`
   (`graph.js:1152`) — invented by the script LLM from the *subject*. It never sees which
   template the film is wearing, so a Bauhaus poster and a cyberpunk terminal get the same bed.
4. **No film-level no-narration strategy.** The director adapts *per scene*; nothing changes
   the whole audio approach when narration is off for the entire film.

Everything below addresses those four and nothing else.

---

## 1. Voiceover toggle — UI and propagation

### UI (`web/src/screens/CreateScreen.jsx`)

A toggle beside the existing captions control, default **on**:

```
Voiceover   ( ●) Enabled    ( ) Disabled
            Narration is generated and the music ducks under it.
            Disabled → a music-and-sound-design mix, tuned for muted social playback.
```

Sends `voiceover: false` only when disabled (the client already drops empty fields, so an
enabled film posts nothing new and every existing client keeps working).

### API (`server/src/routes/projects.js`)

Follows the **captions precedent exactly** (`routes/projects.js:181-204`): accept a boolean
*or* an object, normalize once, store both a legacy boolean and the config.

```js
out.voiceover = body.voiceover !== false && body.voiceover !== "false";   // default ON
```

Persist as `voiceover_enabled` on the job; `voice_style` already exists and is unchanged.

### THE CRITICAL PROPAGATION DECISION: keep the text, skip the synthesis

The toggle must **not** stop the script model from writing narration. Two reasons, both
load-bearing:

1. **It would change the picture.** `storyboardPromptFromScript` feeds every scene's VO line
   into the storyboard prompt — `"Narration meanwhile: …"` (`graph.js:112`,
   `project_pipeline.js:453`). Strip the VO and the storyboard model receives less context and
   designs *different scenes*. A voiceover toggle that silently alters the visuals is a bug.
2. **The Script Room stays useful.** The user can toggle narration back on without
   regenerating, because the lines are still there.

So the toggle acts at exactly one place — `voiceAgent` skips synthesis:

```js
const voEnabled = s.job.voiceover_enabled !== false;
const voTask = voEnabled ? Promise.all(script.scenes.map(...)) : Promise.resolve([]);
```

Side benefit worth stating: with VO off, `synthesizeFitted` never runs, so the film costs
**zero TTS** — the largest per-character cost in the audio stage.

### Two integration points this breaks if missed

**(a) A false "voiceover failed" disclosure.** `voiceAgent` warns when the script wanted
narration and none arrived:

```js
const wantedVo = script.scenes.some((sc) => sc.voiceover && sc.voiceover.trim());
if (wantedVo && voClips.length === 0) notes.push("Voiceover unavailable — the TTS provider failed…");
```

Because we deliberately keep the text, `wantedVo` stays **true** and this fires on every
VO-disabled film, telling the user their film is broken when it is exactly what they asked
for. Gate it on `voEnabled`.

**(b) Captions silently disappear.** Subtitle export is built from **measured** VO clips —
`buildCues(captionClips)` over `s.voClips` (`graph.js:1702-1706`). No clips → no cues → no
burned captions, **no SRT, no VTT**. That is backwards: a narration-free social video is
precisely where captions matter most.

The fix is already sitting there. The Caption Director computes `bakedCues` with estimated
timing for the burn-in (`captionPlan.bakedCues`, used at `graph.js:1406`). With VO off, the
export path switches to those estimated cues instead of returning nothing. Disclose the
downgrade (`estimated timing, not measured`) on the caption quality report.

---

## 2. Template Audio Profile System

### Where it lives

In `frames/<pack>/pack.json`, as a new `audio` section — the **exact precedent** already set
by `assets`: all **43 of 43 packs** declare `assets.keywords` today, and `pack_style.styleFor`
reads the manifest first with a legacy table as fallback (`pack_style.js:33-41`). The `brand`
section was added to the schema the same way, with defaults so every pack still validated.

```jsonc
"audio": {
  "mood": "modern",
  "energy": "high",                    // low | medium | high
  "tempo": "fast",                     // slow | mid | fast
  "style": ["electronic", "future bass", "tech", "corporate"],
  "musicKeywords": [                   // rotated at search time — see §4
    "modern corporate", "technology", "electronic", "future bass", "startup", "innovation"
  ],
  "sfxPalette": {                      // values MUST be audio_cues.CUES intents
    "transition": "whoosh",
    "ui":         "ui-click",
    "reveal":     "product-reveal",
    "data":       "counter-tick",
    "cta":        "logo-rise",
    "ambient":    null
  },
  "noVo": { "energyBoost": 1, "sfxDensity": "rich", "ambient": true }
}
```

Schema added to `frame_manifest.PackManifestSchema` with `.default({})` on every field, so the
other 43 packs keep validating untouched — the same move the `brand` section used.

**`sfxPalette` values are validated against `audio_cues.CUES` at boot.** `frame_manifest.validateAll()`
already runs on startup and logs `43/43 packs have a valid pack.json`; a pack naming a sound the
library cannot resolve should fail there, loudly, rather than silently falling back mid-render.

### Resolver

New `services/audio_profile.js`, mirroring `pack_style.js` one-for-one:

```js
profileFor(framePack)   // manifest.audio → legacy table → NEUTRAL
```

`NEUTRAL` = today's behaviour (script-derived query, standard SFX density), so a pack with no
`audio` block behaves exactly as it does now. That is what keeps this shippable pack-by-pack.

### Starter profiles

| Pack | mood | energy | keywords |
|---|---|---|---|
| brightlife | inspiring, bright | medium | inspiring corporate · bright modern · optimistic startup · innovation |
| prisma-bloc | modern, kinetic | high | electronic · future bass · energetic tech · dynamic motion · digital |
| bauhaus-riot | minimal, abstract | medium | minimal abstract · modern creative · ambient geometric |
| paper-tales | calm, warm | low | acoustic storytelling · soft piano · gentle folk · calm |
| terminal-departures | futuristic | high | synthwave · cyber electronic · retro future · arpeggio |
| midnight-glass | premium, dark | medium | dark premium tech · cinematic ambient · deep electronic |

---

## 3. Audio Director architecture (updated)

The agent gains **one new input and one new branch**, decided *before* anything else — which
is what the brief's "Voiceover Decision" step means:

```
directAudio({ …, narration: "on" | "off", audioProfile })
      │
      ├── narration === "on"  → today's plan, unchanged
      │      master.musicSoloLufs −23 · duck 4–18 dB on VO scenes · SFX subtle
      │
      └── narration === "off" → MUSIC-LED plan
             master.musicSoloLufs −16…−14   (music becomes the primary bus)
             duckDepthDb 0 everywhere        (nothing to duck under)
             per-scene energy envelope WIDER (music carries the emotional arc)
             SFX budget raised, ambient layer admitted
             the 2.5 kHz EQ carve is REMOVED
```

That last item is small and easy to miss: the music currently gets a notch at 2.5 kHz purely
to clear the vocal band. With no voice, leaving it in dulls the bed for a reason that no
longer exists.

`prompts/system_audio_director.md` gains a narration-mode paragraph, and `defaultAudioPlan`
gains the same branch so the deterministic path behaves identically when the LLM is off —
the house pattern (a fail-open default must not be a *different feature*).

### Audio priority, both modes

```
VO ON                          VO OFF
  voiceover                      music (lead)
  important SFX                  accent SFX (transitions, reveals)
  music bed                      ambient texture
  ambient                        —
```

---

## 4. Intelligent music search

### Query construction

Today: `[script.music.mood, script.music.query].join(" ")` — subject-driven, template-blind.

Proposed blend, in priority order:

1. **Template identity** — 1–2 keywords rotated from `profile.musicKeywords`
2. **Subject relevance** — the brief's `subject` anchor, when it is a genre-compatible word
3. **Mode** — `narration === "off"` biases toward the higher-energy end of the pack's list

**Rotation must be deterministic**, seeded on `jobId` — not `Math.random`. Two reasons: the
codebase forbids nondeterminism in the render path, and a re-render of the same job should
produce the same film. Same `mulberry32(hash(jobId + pack))` used by the reuse optimizer.

### Candidate evaluation — and an honest limit

`audio_sources.fetchMusic({ query })` takes one query and returns the first usable hit
(`audio_sources.js:207`). Extend it to accept `candidates: string[]`, fetch the top N metadata
results across them, and score:

- **duration fit** — a track shorter than the film forces a loop; prefer `trackLen ≥ filmLen`
- **tag overlap** with `profile.style`
- **provider quality signals** (bitrate, downloads/likes where exposed)

**We cannot judge musicality.** Nothing here listens to the audio, so "select the highest-quality
and most suitable result" is metadata ranking, not taste. Saying so is better than implying a
judgement the system does not make. A true musical fit check would need an analysis pass
(tempo/key detection) — a later phase, and probably not worth it.

---

## 5. Scene-aware sound effects

**Mostly already built.** `sfx_plan.planSfx` requires every cue to be supported by an actual
on-screen action, budgets by runtime, spreads cues, and reports drops with reasons;
`audio_cues.CUES` maps script words onto functional intents.

Two additions only:

1. **Template palette bias.** When a scene's resolved intent has a pack preference in
   `profile.sfxPalette`, use the pack's variant (terminal-departures' transition is a
   synthy `whoosh`, paper-tales' is a paper `card-slide`). Bias, never a hard filter —
   an unmapped intent keeps today's resolution.
2. **No-VO density.** With narration off, raise the cue budget (`profile.noVo.sfxDensity`)
   and admit the ambient layer. The *support* requirement is unchanged — a denser mix must
   still never mean unmotivated sounds, which is the defect `sfx_plan` exists to prevent.

---

## 6. Mixing

The chain already normalizes, fades, limits and ducks. Changes are confined to the no-VO branch:

| | VO on | VO off |
|---|---|---|
| Music integrated target | −23 LUFS | **−16…−14 LUFS** |
| Sidechain duck | 4–18 dB on VO scenes | **bypassed** |
| 2.5 kHz carve | on | **off** |
| Scene energy envelope | modest | **wider** (music carries the arc) |
| Master limiter | `alimiter`, true peak −1 dB | unchanged |

The brief's "may occupy more of the dynamic range but never harsh or fatiguing" is exactly why
the limiter and the true-peak ceiling stay fixed while only the *integrated* target moves.

---

## 7. Validation

Extend `services/audio_report.js` (it already checks scene-matching, duplicates, ducking, loudness):

| Check | Asserts |
|---|---|
| `voiceoverRespected` | VO clips present **iff** `voiceover_enabled` — catches both a toggle that did nothing and a silent TTS failure |
| `musicFromTemplate` | the query used contained ≥1 keyword from the pack profile (else `source: "script-fallback"`) |
| `duckingCorrect` | duck depth 0 everywhere when VO off; > 0 on VO-bearing scenes when on |
| `noVoEnergy` | the music target was actually raised in no-VO mode |
| `captionsSurvived` | with VO off, cues still exported from estimated timing (guards §1b) |

All disclosure-only — the fail-open law holds; a soundtrack shortfall never fails a render.

Tests extend the existing `scripts/test-audio.js` (13 cases today), all pure:
profile resolution + neutral fallback; deterministic keyword rotation; `sfxPalette` values all
resolve to real cues for all 43 packs; both director branches; the two §1 regressions.

---

## 8. Phasing

**P0 — the toggle (ships alone, delivers the headline feature)**
UI control → API field → `voiceover_enabled` → `voiceAgent` skips synthesis → the two
integration fixes (§1a false disclosure, §1b captions from estimated timing) →
`voiceoverRespected` check. The director's *existing* per-scene `voPresent` logic already
produces a duck-free plan when no clips arrive, so a VO-disabled film is coherent from day one.

**P1 — no-VO audio strategy**
`narration` input, the music-led branch in both `buildPlan` and `defaultAudioPlan`, prompt
paragraph, mixing table (§6), `duckingCorrect` + `noVoEnergy` checks.

**P2 — template audio identity**
`audio` schema section + boot validation, `audio_profile.js`, profiles for the 6 flagship packs,
music-query blend, `musicFromTemplate` check. Remaining 37 packs land incrementally — each
falls back to today's behaviour until it declares one.

**P3 — search quality + SFX palette**
`fetchMusic` candidate ranking, deterministic rotation, `sfxPalette` bias, no-VO density.

**Kill switches:** `config.audioProfile.enabled` (`AUDIO_PROFILE=0`) and the existing
`AUDIO_DIRECTOR=0`. Default on.

---

## 9. How a template declares its audio identity (documentation)

To give a pack a voice, add one block to `frames/<pack>/pack.json`:

- **`mood` / `energy` / `tempo`** — plain words; they reach the Audio Director's prompt as the
  pack's brief, and steer the energy envelope.
- **`style[]`** — genre tags, used to score candidate tracks.
- **`musicKeywords[]`** — the actual search phrases. Write 5–8; one or two are picked per job,
  which is what makes two films on the same template sound related but not identical.
- **`sfxPalette{}`** — maps a scene function to a cue **that must exist in `audio_cues.CUES`**.
  Boot validation rejects anything else.
- **`noVo{}`** — how this pack behaves with narration off.

Omit the block entirely and the pack keeps today's behaviour. There is no half-configured state:
`profileFor` returns `NEUTRAL` and every downstream consumer treats that as "as before".

---

## Open questions

1. **Should disabling VO change the SCRIPT?** This design says no (§1) — the text stays,
   because the storyboard reads it and removing it would change the visuals. The alternative
   (ask the script model for a caption-first, punchier copy deck when narration is off) is a
   genuinely better *film*, but it makes the toggle a re-generation rather than a mix decision.
   **Recommendation:** ship the mix-only toggle first; revisit copy-density later with evidence.
2. **Music energy vs. brand.** A calm pack (paper-tales) with narration off — does the music get
   *more energetic* per the brief, or stay in character? **Recommendation:** stay in character.
   The pack's identity should outrank the mode; `noVo.energyBoost` is a nudge within the pack's
   range, not a genre change.
3. **Per-scene music.** Out of scope, as in v1 of the Audio Director: one bed, dynamically
   shaped. Multi-track swapping is a much larger change to the mix graph.
