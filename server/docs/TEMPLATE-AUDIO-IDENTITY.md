# Template Audio Identity

How a frame pack declares its **sound**, the same way it already declares its look.

A pack's visual identity lives in `frames/<pack>/pack.json` — `colors`, `surface`, `motion`,
`fx`, `textfx`, `brand`. Its audio identity lives in the same file, in an `audio` block. One
file, one reading: the pack that looks like an airport departures board also *sounds* like one.

---

## Why this exists

The music query used to be:

```js
[script.music.mood, script.music.query].join(" ")
```

Two free-text fields the **script model** invented from the film's *subject*. Nothing on that
path had ever seen which template the film was wearing, so a Bauhaus print poster, a pastel
storybook and a cyberpunk terminal all searched for the same bed. That is the "random music
from Pixabay" problem, and its cause was not the provider — it was that nobody ever told the
provider what the film looked like.

---

## The block

```jsonc
"audio": {
  "mood": "modern",                    // one word; reaches the Audio Director's brief
  "energy": "high",                    // low | medium | high
  "tempo": "fast",                     // slow | mid | fast
  "style": ["electronic", "future bass", "tech", "corporate"],
  "musicKeywords": [                   // CALMEST FIRST — see below
    "modern corporate", "technology electronic", "dynamic motion",
    "digital energetic", "future bass", "driving electronic"
  ],
  "sfxPalette": {                      // scene function -> what it sounds like HERE
    "transition": "card-slide",
    "ui":         "pop",
    "reveal":     "product-reveal",
    "data":       "counter-tick",
    "cta":        "cta-impact"
  },
  "noVo": { "energyBoost": 2, "sfxDensity": "rich", "ambient": false }
}
```

### `mood` / `energy` / `tempo`

Plain words. They reach the Audio Director's prompt as the pack's brief and steer the
per-scene energy envelope. They are description, not control flow — nothing branches on the
exact string.

### `style[]`

Genre tags. Used to **score candidate tracks**: a Freesound result whose tags overlap these
ranks above one that does not. Two to four tags is right; more dilutes the signal.

### `musicKeywords[]` — the important one

The actual search phrases. **Write 5–8, ordered calmest first.**

One or two are picked per job, chosen by a seeded shuffle on `hash(jobId + pack)`. That is
what makes two films on the same template sound *related but not identical* — and it is
seeded rather than random because a re-render of the same job must produce the same film.
`Math.random` is forbidden in the render path.

The calm-first ordering is load-bearing. With narration **off**, the rotation prefers the
**later** entries. That is how "more energetic without a genre change" is implemented: a
calm acoustic pack reaches for its most *driving acoustic* phrase, never for future bass.

### `sfxPalette{}`

Maps a **scene function** to a cue. Valid roles: `transition`, `ui`, `reveal`, `data`,
`cta`, `ambient`.

Values **must** name a real intent from `services/audio_cues.js → CUES`:

```
ui-click · soft-tap · pop · notification
card-slide · whoosh · light-sweep
logo-rise · product-reveal · gentle-impact · shimmer
counter-tick · data-ping
success · cta-impact
```

Anything else **fails validation at boot**, loudly:

```
[manifest] INVALID my-pack/pack.json — audio.sfxPalette: "transition" names cue "kazoo", which is not in audio_cues.CUES
```

That is deliberate. A typo here would otherwise degrade silently in the middle of a render.

**The palette is a bias on TIMBRE, never a decision about WHETHER a cue fires.**
`services/sfx_plan.js` still decides that, and its rule is unchanged: every cue must be
*supported* by something the composition actually does at that moment. The palette only
decides what a supported transition *sounds like* on this pack.

### `noVo{}` — behaviour with narration off

| field | meaning |
|---|---|
| `energyBoost` | `0` \| `1` \| `2` — how far the keyword rotation tilts toward the driving end, and the music target: `0` → −18 LUFS, `1` → −16, `2` → −14. |
| `sfxDensity` | `"rich"` raises the cue budget (the support gate is unchanged); `"normal"` keeps it. |
| `ambient` | `true` admits an ambient texture layer for packs with a living backdrop. |

**`energyBoost: 0` is a real choice, not a default.** `minimal-luxury` uses it: vast negative
space and quiet motion do not become punchy because nobody is talking. The mix still opens up
(duck bypassed, vocal carve removed, wider curve) — the *track* just stays as quiet as the
picture.

---

## Omitting the block

A pack with no `audio` block resolves to `NEUTRAL`, which is **exactly today's behaviour**:
the script's subject-derived query, and every cue resolved by `audio_cues.intentFor` alone.
There is no half-configured state — `profileFor` returns `NEUTRAL` and every consumer treats
that as "as before". This is what let the system land pack-by-pack.

All 43 installed packs currently declare one.

---

## Editing profiles

Profiles are authored in one table so the whole set stays reviewable side by side — 43
hand-edited files guarantee drift:

```
server/scripts/apply-audio-profiles.js
```

```bash
node scripts/apply-audio-profiles.js           # write the table into every pack.json
node scripts/apply-audio-profiles.js --check   # CI: non-zero exit if a pack.json drifted
```

Editing a `pack.json` directly works too — the script is idempotent and only rewrites the
`audio` key — but the next run of the script will restore the table's version. Change the
table.

---

## What the pipeline does with it

```
frame_selector  ─→  the pack is chosen
                         │
voice_agent ─────────────┤  audio_profile.profileFor(pack)
                         │       ├─ musicCandidatesFor() → the ordered search list
                         │       └─ paletteCueFor()      → each cue's timbre
                         ↓
audio_director ──────────┤  the profile + narration mode shape the mix plan
                         ↓
audio_mix ───────────────┘  ffmpeg executes it
```

The resulting record is on the job at `audioReport`:

```jsonc
{
  "narration": "off",
  "voiceoverRespected": true,
  "musicSource": "template",           // or "script-fallback" / "none"
  "musicQuery": "future bass driving", // what actually WON, not what was asked
  "musicRanked": true,                 // was it chosen by metadata ranking, or first-hit?
  "templateAudio": { "mood": "modern", "energy": "high", "keywords": ["future bass"] }
}
```

### An honest limit

Nothing in this pipeline *listens* to the audio. Track selection ranks **metadata** — length
fit against the film's runtime, tag overlap with `style[]`, and the provider's own popularity
signals. It is a real improvement over taking the first hit; it is not musical taste.

It also only applies where metadata exists. Freesound returns duration and tags, so its
results are pooled across candidates and ranked. The Pixabay bridge returns a bare mp3 URL
and nothing else — there, the steering comes entirely from asking in the right **order**,
which is what the template's candidate list provides. `musicRanked` tells you which happened.
