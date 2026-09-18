# AI Video Edit — Analysis contract (audio · STT · transcript · faces · content · B-roll)

Status: implementation contract for Phases 3 and 5. Provider facts below were **measured live on 2026-09-14** (probe artifacts in the
session scratchpad; verified by an independent pass). Only OpenRouter and KIE models are allowed (user rule); deterministic ffmpeg
DSP and pure JS are fine. Companion docs: `ENGINE.md` (stage runner, failures, faults), `EDIT_PLAN.md`, `RENDER.md`.

Modules (`server/src/video_edit/`): `ai/{llm,llm_guard,openrouter_stt,kie_jobs}.js` · `analysis/{technical,audio,islands,word_timing,
transcript,frame_sampler,faces,track_smooth,content,lexicon/<lang>,syllables/<lang>}.js` · `analysis/stt/{chunker,chain,mai,whisper,
deepgram,kie_scribe,island_chat,disfluency,merge}.js` · `broll/{providers/{pexels_raw,pixabay_raw,openverse_raw},ratelimit,
search_cache,lexical,contact_sheet,judge,score,retrieve,conform}.js` · `engine/handlers/phase3.js` (EXTRACTING_AUDIO, TRANSCRIBING,
ANALYZING_VIDEO, ANALYZING_CONTENT) · `engine/handlers/phase5.js` (SEARCHING_BROLL, SCORING_ASSETS).

## 1. Verified provider facts (drive every default below)
| Capability | Result |
|---|---|
| **OpenRouter `/api/v1/audio/transcriptions`** | `POST https://openrouter.ai/api/v1/audio/transcriptions`, JSON `{model, input_audio:{data:<base64>, format:"mp3"}, response_format:"verbose_json", timestamp_granularities:["word"], language?}`. Word items are top-level `words:[{word, start, end}]` (seconds; field is `word`, no confidence/type). `usage.cost` per response is authoritative (usage shape varies by model: `{seconds, cost}` or token fields). A 608 s / 3.25 MB-base64 body worked (mai 5.0 s, turbo 12 s). |
| `microsoft/mai-transcribe-2` | ✅ **primary**. words + segments (1 segment for short clips, many for long); keeps **all** fillers and repeats (um ×2, uh, "the, the", "It's, it's"); ISO language (`en`, `es`); median word-onset error 71 ms (37.5 ms non-filler; 38 ms Spanish); 3.1 s for 38 s audio; ≈ $0.10/hour (billed seconds round up). |
| `openai/whisper-large-v3-turbo` | ✅ fallback 1. words (leading space → trim), no segments, ISO language; drops most fillers and collapses repeats; 102 ms; ≈ $0.012/hour. |
| `deepgram/nova-3` | ✅ fallback 2 only **with explicit `language`** (no auto-detect: Spanish without `language` returned 200 with empty text and was billed); drops um/uh and folds their time into the next word (1.2 s onset error) — never trust its boundaries for filler cuts; keeps repeats; 83 ms; contiguous word boundaries. |
| `openai/whisper-large-v3`, `openai/whisper-1` | work but weaker (fillers dropped; whisper-1 language is a full name, zero-length words, stripped punctuation). Not in the chain. |
| `gpt-4o-mini-transcribe`, `voxtral-mini-transcribe`, `qwen/qwen3-asr-flash-2026-02-10`, `google/chirp-3` | ❌ reject `verbose_json` (HTTP 400) — text only, no timestamps. Not usable. |
| **KIE `elevenlabs/speech-to-text`** | ⚠️ **disabled by default.** Upload `POST https://kieai.redpandaai.co/api/file-stream-upload` (multipart `file`, `uploadPath`, `fileName`; `api.kie.ai/api/file-stream-upload` → 404) → `data.downloadUrl` (tempfile.redpandaai.co). `createTask {model, input:{audio_url, tag_audio_events:true}}` → `{code, data:{taskId, recordId}}`, but can return HTTP 200 with body `code:500`. Accepted tasks sat `waiting` > 11 min then `fail` (failCode "500", errorCode 500, successFlag 3, failMsg "upstream API service timed out"); credits charged while waiting, refunded on fail. Completed `resultJson` shape **not observed** — parse defensively. |
| **Audio chat via `openrouter.chat`** | `user` array content passes through unchanged. OpenRouter models accept `{type:"input_audio", input_audio:{data, format:"wav"}}`, multiple audio parts per message. `meta/muse-spark-1.3-contributor` (house fast model): correct verbatim fillers + attribution, $0.00022 per 12 s, 7.5 s. `google/gemini-3.5-flash`: correct, $0.0126 per 12 s (reasoning-token heavy), 9.7 s. `gemini-3.5-flash-lite` and `gemini-3-flash-preview` re-segmented or returned a top-level array. **KIE route `kie:gemini-3.6-flash` silently drops `input_audio` and `file` parts (and hallucinated once); it only hears audio sent as `{type:"image_url", image_url:{url:"data:audio/wav;base64,…"}}`.** Numeric ids like `i1` were rewritten as `i100:00` under low reasoning effort → **use letter ids (A, B, C…) and validate count + ids.** With an explicit model, `chat()` may silently fall back to `llm.modelFallback` — check the returned `model`. |
| **Vision boxes** | `google/gemini-3.5-flash` via `chat()`: `{faces:[{box_2d:[ymin,xmin,ymax,xmax] 0–1000, role, facing}]}` exactly as asked; tight hair-to-chin boxes, identical on repeat at temperature 0; $0.0045/image (384 px), 3–5 s. `gemini-3.5-flash-lite`: nearly identical boxes (IoU .97–.99), $0.0005/image, 1.4 s, occasionally nested `box_2d:[[…]]` → flatten. `muse-spark`: unstable chin edge on profiles — not for boxes. |
| **Stock** | Pexels video search OK (key in `Authorization`), Pixabay video search OK, Openverse images keyless OK (`license=cc0,by`, `category=photograph`). |

**Config additions** (documented in `config.example.json`, read by `settings.js` with these defaults; the user's gitignored
`config.json` is not modified):
```json
"videoEdit": { "providers": {
  "stt": { "order": ["mai", "whisper_turbo", "deepgram", "kie", "islands"],
           "maiModel": "microsoft/mai-transcribe-2", "whisperModel": "openai/whisper-large-v3-turbo", "deepgramModel": "deepgram/nova-3",
           "kieEnabled": false, "kieModel": "elevenlabs/speech-to-text", "kieUploadUrl": "https://kieai.redpandaai.co/api/file-stream-upload",
           "kiePollMs": 3000, "kieStallMs": 60000, "kieMaxWaitMs": 240000,
           "chunkTargetSec": 240, "chunkMaxSec": 540, "encode": "mp3 16 kHz mono 48 kbps", "concurrency": 2 },
  "islands": { "model": "meta/muse-spark-1.3-contributor", "escalationModel": "google/gemini-3.5-flash",
               "kieAudioPart": "image_url", "maxIslandSec": 8, "batchMaxSec": 30, "batchMaxIslands": 10 },
  "vision": { "model": "google/gemini-3.5-flash-lite", "escalationModel": "google/gemini-3.5-flash", "imageWidth": 384, "framesPerCall": 6, "maxFaceFrames": 24 },
  "llm": { "content": "default", "director": "default", "brollJudge": "google/gemini-3.5-flash-lite", "qa": "google/gemini-3.5-flash-lite" } } }
```
Recommended (user-owned) `config.json` addition, surfaced in `/health` when absent: `llm.stageEffort` for `ve_faces`, `ve_broll_judge`,
`ve_qa`, `ve_stt_islands` = `"low"` (Gemini flash cost is dominated by reasoning tokens).

## 2. AI transport (`ai/*`)
- `ai/llm.js callJson({ stage, system, user, schema, model?, temperature=0, tracker, signal, promptVersion, cacheDir? })` →
  `{ value, model, costUsd, tokensIn, tokensOut, cached }`: `openrouter.chat({stage, system, user, jsonMode:true, temperature, model,
  signal})`; `json_lenient.extractFirstJsonObject`; zod parse; on failure ONE repair re-ask (string user: append `Your previous reply
  failed validation: <issues≤800> Return ONLY the corrected JSON object.`; array user: push an extra text part with the same). Rejects
  top-level arrays (require the object envelope). Records `tracker.addLlm({inputTokens:tokensIn, outputTokens:tokensOut, stage, costUsd})`
  and the project cost ledger. Response cache: `analysis/llm-cache/<sha256(model|stage|promptVersion|canonical input)>.json` when
  `cacheDir` given. Warns (notice `MODEL_FALLBACK`) when `result.model` ≠ requested model.
- `ai/llm_guard.js assertPayload(user)`: no `video/*` data, ≤ 8 images per call, image data URIs ≤ 640 px long edge (checked at
  extraction time), total base64 ≤ 1.5 MB; audio parts only from `work/chunks|islands`.
- `ai/openrouter_stt.js transcribe({ model, audioPath, format:'mp3', language?, signal, timeoutMs })` → `{ words:[{text,start,end}],
  segments:[{start,end,text}], language, durationSec, costUsd, raw }`: direct `fetch` to `${base}/audio/transcriptions` (base from
  `settings.providerBaseOverride.openrouter` in dev/tests, else `https://openrouter.ai/api/v1`), `Authorization: Bearer
  config.llm.apiKey || OPENROUTER_API_KEY`, `HTTP-Referer`/`X-Title` from `config.llm`. Normalizes: trim word text, drop empty words,
  clamp zero-length words to 20 ms, language full names → ISO via `caption_lang.normalizeLang`. Errors classified for the breaker:
  400/404 `config` (model/format), 401/403 `config`, 402 `budget`, 408/429/5xx/timeout `transient`/`provider`, 200 with empty words
  while VAD speech > 20 % → `provider` (`EMPTY_TRANSCRIPT`).
- `ai/kie_jobs.js`: `uploadFile(path, {uploadPath, fileName})` → `downloadUrl`; `createTask({model, input})` → `taskId` (in-body
  `code !== 200` → `provider` error); `pollTask(taskId, {pollMs, stallMs, maxWaitMs, signal, onState})` → `resultJson` parsed (`state`
  waiting/queuing longer than `stallMs` without progress → `KIE_STALL`; `fail` → `KIE_FAIL` with failMsg; poll network errors
  tolerated). `taskId` persisted in the stage record before polling (resume re-polls, never re-creates). Pattern: `services/tts.js:180-273`.
- `providers/breaker.js` per provider name (`openrouter_stt`, `openrouter_chat`, `kie`): 3 consecutive transient/rate failures → open 5 min
  then one half-open probe; `config` → open 1 h; `budget` (402, `checkBudget().remaining < 0.15`) → open until next UTC midnight;
  429 honours `Retry-After` ≤ 60 s.

## 3. EXTRACTING_AUDIO (`analysis/audio.js`, pure JS on `work/audio16k.wav` + ffmpeg)
- Read PCM s16le (WAV header parse), 10 ms hop / 20 ms window RMS in dBFS, zero-crossing rate, normalized autocorrelation pitch strength
  (70–400 Hz lag range) per frame.
- `floor` = 10th percentile of RMS; `speech` = 60th percentile of frames above `floor + 12 dB` (refined after STT with in-word median).
- **Speech islands:** `thr = floor + max(6, 0.35·(speech − floor))` dB; enter after 40 ms above, exit after 250 ms below; merge gaps
  < 250 ms; pad 80 ms each side (never past the midpoint of a neighbouring gap); drop < 200 ms; split islands > `maxIslandSec` (8 s) at
  the deepest 150 ms-smoothed dip inside the middle 60 %, recursively. Sample-exact boundaries.
- **Silences:** complement of islands within the file; each `{start, end, dur, depthDb}`.
- `ffmpeg -i file:work/audio16k.wav -af ebur128=peak=true,astats=metadata=1:reset=0 -f null -` → integrated LUFS, LRA, true peak,
  clipping ratio (`Number of samples clipped` / peak ≥ −0.1 dBFS). Hum: Goertzel power at 50/60 Hz and 3 harmonics vs 1–3 kHz band.
  Sibilance: 6–9 kHz vs 1–4 kHz energy ratio in speech frames.
- **Voice-chain recommendation** (consumed by `RENDER.md` §8): SNR < 22 dB → `afftdn nr=10`; < 14 dB → `nr=18`; hum → notches;
  level stdev > 4 dB → `dynaudnorm`; sibilance > 0.35 → `deesser`; clipping > 0.1 % → QA notice.
- **No speech:** voiced frames < 2 % of duration → `NEEDS_ATTENTION NO_SPEECH` (actions: continue without transcript, upload another).
- Outputs `analysis/audio.json {floorDb, speechDb, snrDb, lufs, lra, truePeakDb, clippingRatio, hum:{hz, db}, sibilance, voiceChain,
  islands:[{id, startSample, endSample, start, end}], silences:[…], envelopeFile:'analysis/rms.f32'}` (Float32 RMS dB per 10 ms,
  little-endian) and discoveries `{silencesFound, silenceSec}`.

## 4. TRANSCRIBING (`analysis/stt/*`)
### 4.1 Chunking (`chunker.js`)
Single chunk when duration ≤ `chunkMaxSec` (540 s, i.e. every default-limit upload). Otherwise cut at the midpoint of the longest
silence inside `[target − 30 s, target + 30 s]` of each `chunkTargetSec` boundary (fallback: deepest RMS dip), disjoint chunks, never
inside an island. Encode `work/chunks/c<n>.mp3` with `ffmpeg -ss/-to -i file:work/audio16k.wav -ac 1 -ar 16000 -b:a 48k`; offsets
recorded to add back. Per-chunk checkpoint `analysis/stt/chunk-<n>.json {start, end, engine, model, language, words, segments, costUsd,
taskId?}`; retry transcribes only missing chunks.

### 4.2 Engine chain (`chain.js`), per chunk, in `settings.providers.stt.order`
1. **mai** (`microsoft/mai-transcribe-2`): language param only when the user forced one.
2. **whisper_turbo** (`openai/whisper-large-v3-turbo`): language = forced or previously detected.
3. **deepgram** (`deepgram/nova-3`): requires a language (forced, detected by an earlier chunk/engine, or `"multi"`); its fillers are
   never trusted → always run disfluency recovery.
4. **kie** (Scribe) only when `kieEnabled`; stall 60 s / max wait 240 s; parse `resultJson` defensively (`words|results.words|
   transcript.words`, items `text|word`, `start|start_time`, `end|end_time`, `type` ≠ `spacing`).
5. **islands** (`island_chat.js`, §4.4) — timing `approx`.
Each step: breaker check → call → **validation**: words monotonic after sort; ≥ 60 % of island speech time covered by word spans
(±150 ms); ≤ 3 % words outside `[0, chunkDur + 0.5]`; characters/second of speech ≤ 25 → accept, else classify `provider` and continue.
All engines fail → `NEEDS_ATTENTION STT_FAILED` (retryable; action `continue_without_transcript` → captions disabled, silence cuts only).
Engine/model per chunk recorded; `timing` = `word` unless the islands path produced it.

### 4.3 Word refinement and merge (`merge.js`, `word_timing.js`)
Offset by chunk start; trim text; attach trailing punctuation to the previous word; split words that contain spaces; min word
duration 40 ms; **edge refinement** to the RMS envelope (end forward ≤ 150 ms while RMS > floor + 10 dB; start backward ≤ 120 ms; clamped
to neighbours); per-word `conf` = 0.95 (mai/whisper/deepgram/kie) or island DP confidence (§4.4).

### 4.4 Speech-island chat (`island_chat.js`) — fallback transcription and disfluency recovery
- Batches ≤ `batchMaxSec` (30 s) and ≤ `batchMaxIslands` (10) per call, 2 calls in parallel; island ids **letters** `A…Z, AA…`.
- Message: `system` = verbatim rules (every um/uh/er and language-equivalent filler, repetitions, false starts, cut-off words with `-`,
  no paraphrase, no text for silence or music, punctuation attached, digits as spoken in `sp`); `user` = for each island a text part
  `ISLAND <ID> (<dur>s)` then the audio part; audio part = `input_audio{data:<base64 wav 16 kHz mono>, format:'wav'}` for OpenRouter
  models, `image_url{url:'data:audio/wav;base64,…'}` when the model id starts with `kie:`.
- Model `islands.model` (muse-spark), escalate to `islands.escalationModel` (gemini-3.5-flash) on validation failure.
- Schema: `{islands:[{id, speech:boolean, lang, words:[{w, sp?, cut?:boolean, filler?:boolean}], conf:0..1}]}` (object envelope only).
- Validation: ids ⊆ requested and every requested id present; 1.5–9 syllables/s of island voiced time; empty words with voiced ratio
  > 0.5 → retry that island alone once; any n-gram repeated > 3× → `conf = 0.2`; split-island boundary de-dup (drop the second copy
  when norms match and the dip < 80 ms).
- **Alignment** (islands path only): syllable weights (`syllables/<lang>.js`: en vowel groups with silent-e/-le/-ed; es/pt/fr/de vowel
  groups + diphthong rules; hi `Intl.Segmenter` graphemes; ar letters/2.2 + long vowels; ja morae of `sp`; numbers via `sp`) × (filler
  1.8, word before `,.?!` 1.3, cut-off 0.6); initial boundaries over the voiced span; dips = local minima of 30 ms-smoothed RMS ≥ 4 dB below
  neighbouring maxima within ±80 ms and < speech − 3 dB (pause dip when below floor + 6 dB ≥ 60 ms); monotone DP snap with
  `cost = ((b−t)/σ)² − 0.15·depth − 1.0·[pause dip]`, `σ = max(0.08, 0.35·T/K)`, no-dip state 1.5, word duration ∈ [max(0.08, 0.05·syll),
  1.2·syll]; pause dips ≥ 150 ms must take a boundary within ±250 ms; `conf = island.conf · (1 − min(1, |Δ|/3σ))` (× 0.6 without dip).
- **Disfluency recovery** (`disfluency.js`, runs when the accepted engine is not mai/kie, or when mai left voiced gaps): voiced regions
  ≥ 150 ms (RMS > floor + 10 dB, ZCR < 0.15, pitch strength > 0.4) not covered by any word ±60 ms → islands chat on those regions with
  ±200 ms context → inserted words `{text, isFiller}` spanning the region edges, `conf 0.7`.

### 4.5 Outputs
`analysis/transcript.words.json {language, languageSource:'forced'|'detected', timing:'word'|'approx', engines:[…], words:[{i, text,
norm, start, end, conf, chunk, engine}]}`; discoveries `{language, words, wpm}`; per-call cost in the ledger. Prompt-moderation screen
(`services/prompt_moderation.screen`) over ~3000-word chunks: tier-1 hit → `NEEDS_ATTENTION CONTENT_REVIEW` (never silently dropped).

## 5. Transcript structuring (`analysis/transcript.js`, pure)
`Word {i, text, norm, start, end, conf, sentenceId, segmentId, isFiller, fillerKind:'pure'|'discourse'|null, repeatOf, speaker:'S1'}`.
- Sentences split at `.?!。？！।؟`, at pauses ≥ 0.7 s once a sentence has ≥ 4 words, and at a 25-word cap; sentences < 3 words merged unless
  isolated by pauses ≥ 0.5 s.
- **Pure fillers** (default on, `removeFillers:'light'`): en um, uh, erm, er, ah, hmm, mm · hi अं, उम्म, हम्म · es eh, em, este(when
  pause-bounded) · fr euh, heu, bah · de äh, ähm, hm · pt hã, ahn, é(pause-bounded) · ar اممم, آه · ja えー, えーと, あのー. Matching on
  `norm` with elongation collapse (`umm`, `uhhh`, `ummmm…`).
- **Discourse fillers** (`aggressive` only): like, you know, I mean, basically, actually, so, este, o sea, genre, also, tipo, né, يعني,
  あの, その, まあ — candidates only when a pause ≥ 0.12 s touches the word or it is sentence-initial followed by a pause; final verdict
  from `ve_content.fillerVerdicts`.
- **Stutter:** immediate repeat of an n-gram (n ≤ 4) within 1.5 s → cut the first copy (`REPEAT`).
- **False start:** fragment ≤ 7 words without terminal punctuation, then pause ≥ 0.3 s, then ≥ 60 % token LCS with the next sentence →
  cut the fragment (`FALSE_START`).
- **Retake:** Jaccard ≥ 0.6 or LCS ≥ 0.7 between sentences within 20 s → keep the take with higher mean conf and fewer fillers (`RETAKE`,
  verdict can be overridden by `ve_content.retakeVerdicts`).
- CTA patterns per language (`lexicon/<lang>.ctaPatterns`: subscribe, follow, link in bio, visit, comment, sign up, download, DM, …).
- Outputs `analysis/transcript.json {language, sentences:[{id, w0, w1, start, end, text, pauseAfter, fillerCount}], fillerCandidates,
  repeatCandidates, retakeCandidates, ctaCandidates}`; discoveries `{fillersFound}`.

## 6. ANALYZING_VIDEO (`analysis/{technical,frame_sampler,faces,track_smooth}.js`)
- **Technical** (ffmpeg on `work/proxy540.mp4`): `scdet=threshold=10` scene changes, `blackdetect=d=0.3:pix_th=0.10`,
  `freezedetect=n=-60dB:d=1`, `cropdetect` (letterbox), `signalstats` every 5th frame (YAVG exposure, YDIF motion, SATAVG) →
  `analysis/video.json {scenes, black, freezes, letterbox, exposure, ydif[]}`; shaky ranges = YDIF P90 windows with no scene change.
- **Frame sampler:** budget `N = min(maxFaceFrames 24, clamp(ceil(dur/2.5), 8, 24))`: one frame at each scene start + 0.3 s, a uniform
  floor, remaining budget at highest YDIF; one ffmpeg `select='eq(n\,F1)+…',scale=384:-2` run → `work/frames/f<idx>.jpg -q:v 4`.
- **`ve_faces`** (`vision.model` flash-lite, batches of `framesPerCall` 6; each image preceded by `FRAME <LETTERS> t=12.40s`): schema
  `{frames:[{id, faces:[{box_2d:[ymin,xmin,ymax,xmax]|[[…]], role:'speaker'|'other', facing:'camera'|'left'|'right'|'away'}],
  shotType:'closeup'|'medium'|'wide', speakerVisible, background, screenContent:string|null, textOnScreen:boolean, lighting}],
  overall:{setting, visualQuality}}`; flatten nested boxes; escalate a batch to `vision.escalationModel` when > 1/3 of its boxes fail
  validation. Skipped when `privacy.allowCloudVision:false` or cost cap → `faceTrack:"assumed"`.
- **Smoothing** (`track_smooth.js`): validate boxes (height 3–70 % of frame, w/h 0.55–1.5, clamp to frame); primary face = largest
  `speaker` box with IoU > 0.2 continuity; Hampel filter (window 5, 3×MAD) on cx, cy, h; interpolate gaps ≤ 6 s; reset at scene
  changes; record `multiFace`, `absent` ranges; normalized keyframes `{t, cx, cy, h}` → `analysis/faces.json {mode:'tracked'|'assumed',
  keyframes, absent, multiFace, frames:[…semantics]}`; discoveries `{faceFound, onScreenText}`.

## 7. ANALYZING_CONTENT (`analysis/content.js`, stage `ve_content`, `ai/llm.js callJson`, cached by transcriptHash + settings slice)
Input: `{lang, sentences:[{id, start, end, text, pauseAfter, fillerCount}], fillerCandidates, retakeCandidates, scenes:[{start, end,
shotType, speakerVisible, screenContent}], user:{goals?, brand?}}` (never video, never raw audio).
Output:
```ts
{ summary, category, audience, tone:{ mood, energy:0..1, pace },
  topics:[{ id, label, sentenceIds }], keywords:[{ term, sentenceIds, salience:0..1 }],
  hook:{ sentenceIds, strength:0..1 }, cta:{ sentenceIds, text } | null,
  segments:[{ id, type:'HOOK'|'CONTEXT'|'POINT'|'EXAMPLE'|'STORY'|'DATA'|'CTA'|'OUTRO'|'ASIDE', sentenceIds, title, importance:0..1 }],
  visualSupport:[{ sentenceId, need:0..1, visualNouns:string[≤4], avoid:string[] }],
  faceRequired:[{ sentenceId, reason:'sincere'|'personal'|'humor'|'direct_address'|'cta' }],
  emphasis:[{ sentenceId, wordText }],
  fillerVerdicts:[{ wordIndex, isFiller }], retakeVerdicts:[{ a, b, keep }],
  music:{ mood, energy:0..1 }, sfxOpportunities:[{ sentenceId, kind }] }
```
Unknown ids dropped; on failure → deterministic analysis (TF-IDF keywords, heuristic hook/CTA/faceRequired per `EDIT_PLAN.md` §6
heuristic director) with notice `AI_ANALYSIS_UNAVAILABLE`. Discoveries `{topics, hook, brollMoments}`.

## 8. B-roll (`broll/*`, Phase 5; SEARCHING_BROLL → SCORING_ASSETS run after ANALYZING_CONTENT and BEFORE BUILDING_EDIT_PLAN)
- **Slots** (`broll/slots.js buildSlots({content, sentences, words, faces, settings})`): sentences from `content.visualSupport` with
  `need ≥ 0.45` that are not `faceRequired`, not the CTA and not inside the hook guard (heuristic TF-IDF salience when content analysis
  failed), ranked by need × importance and capped at the HIGH-intensity item budget for the output duration + 30 % (so intensity changes
  never refetch). Each slot `{slotId:'sl_<sentenceId>', sentenceId, w0, w1, outDurEstimate, queries (≤ 3 from visualNouns, subjectQuery-
  filtered), mediaPreference, need}` → `analysis/broll_slots.json`.
- SEARCHING_BROLL fetches candidates per slot; SCORING_ASSETS judges and scores them, writing `broll/candidates/<slotId>.json` and a
  summary `analysis/broll_scored.json {slots:[{slotId, sentenceId, accepted:boolean, best:AssetRef|null, top:AssetRef[≤8]}]}` (chosen
  assets are downloaded only when accepted).
- BUILDING_EDIT_PLAN passes per-sentence availability `{sentenceId, bestTotal, mediaTypes}` to the director, and `build_plan` attaches
  `chosen/topCandidates` from the matching slot to every selected BrollItem; opportunities whose slot has no accepted candidate are not
  turned into items (a user-added B-roll on such a line starts as `missing` with a stock search).
- **Providers** (new raw mappers; existing `asset_sources/pexels.js` and `pixabay_api.js` untouched):
  `pexels_raw.searchVideos({query, orientation, perPage≤40})` → `{provider:'pexels', providerId, type:'video', durationSec, width, height,
  renditions:[{quality, width, height, fps, link}], thumbs:[image, video_pictures[].picture], pageUrl, author:{name, url}, text:<slug words>}`
  (token bucket 180/h); `pixabay_raw.searchVideos({query, orientation, perPage 3..200})` → `{…, renditions from videos.{large,medium,small,tiny}
  with thumbnail, tags}` (90/60 s; honours `pixabay_api.keyIsRejected()` and its own latch); `pixabay_raw.searchImages`, `pexels_raw.searchImages`;
  `openverse_raw.searchImages({query, license:'cc0,by', category:'photograph'})` (2 concurrent). Search cache `_shared/asset-search/<sha1>.json` 24 h.
- **Queries:** item queries (director) post-filtered by `asset_sources/query_terms.subjectQuery` with a whitelist for 2–3 letter terms
  (AI, VR, AR, 5G, UX, UI, SEO, API, CRM, B2B…); video first; images when `allowImages` and video candidates fail thresholds.
- **Prefilter:** duration ≥ need + 0.5 s; export upscale ≤ 1.5; `coverLoss = 1 − min(a/b, b/a)` ≤ 0.6 for FULL (PIP/SPLIT use box aspect).
- **Prior:** `prior = 0.55·BM25lite(tags/title/slug vs 0.7·query + 0.3·sentence keywords) + 0.15·1/(1 + 0.15·rank) + 0.30·tech`
  (`tech` = resolution fit, aspect fit, duration fit, grey stdev ≥ 5 via `util.imageDHashStats` on the thumbnail).
- **Contact sheet:** top 8 by prior; thumbnails downloaded to `broll/thumbs/`; videos as 3-frame strips (25/50/75 %, using provider
  video pictures or first-second preview downloads) `hstack`; dHash dedupe (Hamming ≤ 8 within item, ≤ 10 project-wide); one 4×2 sheet
  (1152×576) per item, cells labelled `A…H` in a deterministic shuffle seeded by item id.
- **`ve_broll_judge`** (`llm.brollJudge` flash-lite, ≤ 3 sheets per call with sentence, intent, layout aspect, brand palette):
  `{items:[{itemId, cands:[{id, rel:0–10, literal:boolean, quality:0–10, issues:['watermark'|'text'|'faces'|'offtopic'|'low_quality'|
  'cliche'|'unsafe'], comp:'good'|'ok'|'poor', bestLayout:'FULL'|'PIP'|'SPLIT'|'none'}]}]}`; ids validated against the sheet letters.
- **Score:** `sem = 0.75·rel/10 + 0.25·lex`; `vis = 0.5·quality/10 + 0.5·tech`; `total = 0.40·sem + 0.12·vis + 0.10·res + 0.10·aspect +
  0.08·comp(good 1 / ok .6 / poor .2) + 0.05·brand + 0.10·durFit + 0.05·div − 0.15·|issues|` (`div = 1 − max tag-Jaccard vs chosen`;
  `unsafe` excludes).
- **Accept:** `rel ≥ 6 && total ≥ 0.55` (video) / `≥ 0.50` (image); else try the other media type, else item `missing` (speaker stays).
  Judge unavailable → `lex ≥ 0.5 && tech ≥ 0.6`, flagged `judge:'unavailable'` (nothing accepted at `low` intensity without the judge).
- **Materialize:** rendition nearest the export size (≥ target, else largest); `util.download` → `util.validateClip`/`validateImage` +
  `video_probe.gradeClip` → `assets/broll/<assetId>.<ext>`; full scored list → `broll/candidates/<itemId>.json`; credits collected
  (Pexels author link, Pixabay page, Openverse attribution).
- Discoveries `{brollMoments}`; notice `NO_BROLL_FOUND` when every item is missing.

## 9. Cost per minute of source (measured unit prices; estimates)
| Stage | Unit | Per minute |
|---|---|---|
| STT mai-transcribe-2 | ≈ $0.10/hour | ≈ $0.0017 |
| Disfluency recovery (only when needed, muse-spark) | ≈ $0.0011 per 60 s of regions | ≤ $0.0005 |
| Faces (≤ 24 frames/video, flash-lite) | $0.0005/image | ≈ $0.012 per video |
| Content + director (house model) | text only | ≈ $0.002–0.01 per video |
| B-roll judge (flash-lite sheets, medium ≈ 4 items/min) | ≈ $0.0006/sheet | ≈ $0.003 |
| Vision QA (≤ 8 frames, flash-lite) | $0.0005/image | ≈ $0.004 per render |
| **Typical 60 s video** | | **≈ $0.02–0.04 total** |
Escalations (gemini-3.5-flash) cost ~10×; the per-project cap (`caps.maxUsdPerProject` 0.50) and degrade order (`ENGINE.md` §6) apply.
